import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import type { Server } from 'ws';
import type { IncomingMessage } from 'http';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederState } from '../shared/enums.js';
import { EventType } from '@prisma/client';
import { CameraService } from '../camera/camera.service.js';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';

@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedDevices = new Map<string, WebSocket>();
  private photoIntervals = new Map<string, NodeJS.Timeout>();

  private readonly logger = new Logger(FeedersGateway.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => CameraService))
    private cameraService: Pick<CameraService, 'triggerAutoSnapshot'>,
  ) {}

  private stopPhotoInterval(deviceId: string) {
    if (this.photoIntervals.has(deviceId)) {
      clearInterval(this.photoIntervals.get(deviceId)!);
      this.photoIntervals.delete(deviceId);
      this.logger.log(LOG_MESSAGES.photoIntervalStopped(deviceId));
    }
  }

  private startPhotoInterval(deviceId: string) {
    if (this.photoIntervals.has(deviceId)) return;

    this.logger.log(LOG_MESSAGES.photoIntervalStarted(deviceId));

    void this.cameraService.triggerAutoSnapshot(deviceId);

    const interval = setInterval(() => {
      this.logger.log(LOG_MESSAGES.photoIntervalTick(deviceId));
      void this.cameraService.triggerAutoSnapshot(deviceId);
    }, 10000);

    this.photoIntervals.set(deviceId, interval);
  }

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const rawDeviceId = url.searchParams.get('deviceId');

      if (!rawDeviceId) {
        client.close(1008, ERROR_MESSAGES.deviceIdRequired);
        return;
      }

      const deviceId = rawDeviceId.trim();
      this.connectedDevices.set(deviceId, client);
      this.logger.log(LOG_MESSAGES.deviceConnected(deviceId));

      const feeder = await this.prisma.feeder.findUnique({
        where: { deviceId },
        select: { desiredState: true },
      });

      if (feeder) {
        client.send(JSON.stringify({ command: feeder.desiredState }));
      }

      client.on('message', async (message: Buffer) => {
        const msg = message.toString().trim();

        if (msg === 'ping') {
          client.send('pong');
          return;
        }

        if (msg.startsWith('{')) {
          try {
            const data = JSON.parse(msg);

            if (data.event === 'REQUEST_SYNC') {
              const currentFeeder = await this.prisma.feeder.findUnique({
                where: { deviceId },
                select: { desiredState: true },
              });
              
              const commandToSend = currentFeeder?.desiredState || FeederState.CLOSED;
              client.send(JSON.stringify({ command: commandToSend }));
              
              this.logger.log(
                LOG_MESSAGES.deviceSyncRequested(deviceId, commandToSend),
              );
            }

            if (data.event === 'STATE_CHANGED' && data.state) {
              const newState =
                data.state === 'OPEN' ? FeederState.OPEN : FeederState.CLOSED;

              const updatedFeeder = await this.prisma.feeder.update({
                where: { deviceId },
                data: { 
                  actualState: newState,
                  ...(newState === FeederState.CLOSED && { desiredState: FeederState.CLOSED })
                },
              });

              if (newState === FeederState.OPEN) {
                this.logger.log(LOG_MESSAGES.feederOpened(deviceId));
                
                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: updatedFeeder.id,
                    eventType: EventType.FEEDER_OPENED,
                  },
                });
              }

              if (newState === FeederState.CLOSED) {
                // this.stopPhotoInterval(deviceId);
                this.logger.log(LOG_MESSAGES.feederClosed(deviceId));

                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: updatedFeeder.id,
                    eventType: EventType.FEEDER_CLOSED,
                    metadata: { reason: 'AUTO_CLOSE_OR_COMMAND' },
                  },
                });
              }

              this.logger.log(
                LOG_MESSAGES.feederStateConfirmed(deviceId, data.state),
              );
            }

            if (data.event === 'CAT_APPROACHED') {
              this.logger.log(
                LOG_MESSAGES.catApproached(deviceId, data.distance ?? 'N/A'),
              );

              const feederData = await this.prisma.feeder.findUnique({
                where: { deviceId },
              });

              if (
                feederData &&
                (feederData.actualState === FeederState.OPEN ||
                  feederData.desiredState === FeederState.OPEN)
              ) {
                void this.cameraService.triggerAutoSnapshot(deviceId);
                // this.startPhotoInterval(deviceId);
              } else {
                void this.cameraService.triggerAutoSnapshot(deviceId);
              }
            }

            // if (data.event === 'CAT_LEFT') {
            //   this.logger.log(LOG_MESSAGES.catLeft(deviceId));

            //   this.stopPhotoInterval(deviceId);
            // }
          } catch (e) {
            this.logger.error(
              LOG_MESSAGES.jsonMessageProcessingFailed(deviceId),
              e,
            );
          }
        }
      });
    } catch (error) {
      this.logger.error(LOG_MESSAGES.deviceConnectionFailed, error);
    }
  }

  handleDisconnect(client: WebSocket) {
    for (const [deviceId, socket] of this.connectedDevices.entries()) {
      if (socket === client) {
        // this.stopPhotoInterval(deviceId);
        this.connectedDevices.delete(deviceId);
        this.logger.log(LOG_MESSAGES.deviceDisconnected(deviceId));
        break;
      }
    }
  }

  sendCommandToDevice(
    deviceId: string,
    command: 'OPEN' | 'CLOSED' | 'TAKE_SNAPSHOT',
    catId?: string,
  ): boolean {
    const cleanDeviceId = deviceId.trim();

    const targetDeviceId =
      command === 'TAKE_SNAPSHOT' && !cleanDeviceId.endsWith('-camera')
        ? `${cleanDeviceId}-camera`
        : cleanDeviceId;

    const client = this.connectedDevices.get(targetDeviceId);

    this.logger.log(LOG_MESSAGES.commandRequested(command, targetDeviceId));

    if (client && client.readyState === 1) {
      const payload = { command, catId };
      client.send(JSON.stringify(payload));

      this.logger.log(
        LOG_MESSAGES.commandSent(JSON.stringify(payload), targetDeviceId),
      );
      return true;
    }

    this.logger.warn(LOG_MESSAGES.deviceUnavailable(targetDeviceId));
    return false;
  }
}