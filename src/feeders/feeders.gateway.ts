import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import type { Server } from 'ws';
import type { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederState } from '../shared/enums.js';
import { EventType } from '@prisma/client';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';
import { BleState } from './interfaces/bleState.js';

@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedDevices = new Map<string, WebSocket>();
  private pendingDistanceRequests = new Map<
    string,
    (distance: number) => void
  >();

  private bleState = new Map<string, BleState>();

  private readonly logger = new Logger(FeedersGateway.name);

  constructor(private prisma: PrismaService) {}

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
            if (data.event === 'BLE_DETECTED' && data.mac) {
              if (data.rssi < -65) {
                return;
              }
              const cleanMac = data.mac.trim().toLowerCase();
              this.bleState.set(cleanMac, {
                lastSeen: Date.now(),
                rssi: data.rssi,
              });

              // const feederCat = await this.prisma.feederCat.findFirst({
              //   where: {
              //     cat: { bleMac: { equals: cleanMac, mode: 'insensitive' } },
              //   },
              //   include: { feeder: true },
              // });

              // const targetDeviceId =
              //   feederCat?.feeder?.deviceId || 'esp8266-feeder-01';

              // if (this.connectedDevices.has(targetDeviceId)) {
              //   try {
              //     const currentDistance =
              //       await this.requestDistance(targetDeviceId);

              //     if (currentDistance > 0 && currentDistance <= 350) {
              //       this.logger.log(
              //         `🟢 Action: OPEN | Trigger: BLE_DETECT | Distance: ${currentDistance}mm | Tag: ${cleanMac} | RSSI: ${data.rssi} dBm`,
              //       );
              //       this.sendCommandToDevice(
              //         targetDeviceId,
              //         'OPEN',
              //         feederCat?.catId,
              //       );
              //     }
              //   } catch (err) {
              //     const errorMessage =
              //       err instanceof Error ? err.message : String(err);
              //     this.logger.warn(
              //       `⚠️ Error with ${targetDeviceId}: ${errorMessage}`,
              //     );
              //   }
              // }
            }

            if (data.event === 'BLE_DISCONNECTED' && data.mac) {
              const cleanMac = data.mac.trim().toLowerCase();
              this.logger.warn(`🔴 [BLE] iTag ${cleanMac} disconnected`);

              if (this.bleState.has(cleanMac)) {
                this.bleState.set(cleanMac, {
                  lastSeen: 0,
                  rssi: null,
                });
              }
            }

            if (
              data.event === 'DISTANCE_REPORT' &&
              data.distance !== undefined
            ) {
              const resolveWaitingRequest =
                this.pendingDistanceRequests.get(deviceId);
              if (resolveWaitingRequest) {
                resolveWaitingRequest(data.distance);
                this.pendingDistanceRequests.delete(deviceId);
              }
            }

            if (data.event === 'REQUEST_SYNC') {
              const currentFeeder = await this.prisma.feeder.findUnique({
                where: { deviceId },
                select: { desiredState: true },
              });

              const commandToSend =
                currentFeeder?.desiredState || FeederState.CLOSED;
              client.send(JSON.stringify({ command: commandToSend }));
            }

            if (data.event === 'STATE_CHANGED' && data.state) {
              const newState =
                data.state === 'OPEN' ? FeederState.OPEN : FeederState.CLOSED;

              const updatedFeeder = await this.prisma.feeder.update({
                where: { deviceId },
                data: {
                  actualState: newState,
                  ...(newState === FeederState.CLOSED && {
                    desiredState: FeederState.CLOSED,
                  }),
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
                this.logger.log(LOG_MESSAGES.feederClosed(deviceId));
                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: updatedFeeder.id,
                    eventType: EventType.FEEDER_CLOSED,
                    metadata: { reason: 'AUTO_CLOSE_OR_COMMAND' },
                  },
                });
              }
            }

            if (data.event === 'CAT_APPROACHED') {
              const feederCat = await this.prisma.feederCat.findFirst({
                where: { feeder: { deviceId } },
                include: { cat: true },
              });

              const targetMac = feederCat?.cat?.bleMac
                ? feederCat.cat.bleMac.trim().toLowerCase()
                : 'ff:ff:55:04:dc:bd';

              const tagState = this.bleState.get(targetMac);
              const lastSeen = tagState?.lastSeen || 0;
              const currentRssi = tagState?.rssi ?? 'N/A';

              const timeDiffMs = Date.now() - lastSeen;
              const isTagNearby = timeDiffMs <= 15000;

              if (isTagNearby) {
                this.logger.log(
                  `🟢 Action: OPEN | Trigger: LASER | Distance: ${data.distance ?? 'N/A'}mm | Tag: ${targetMac} | RSSI: ${currentRssi} dBm | LastSeen: ${(timeDiffMs / 1000).toFixed(1)}s ago`,
                );
                this.sendCommandToDevice(deviceId, 'OPEN', feederCat?.catId);
              } else {
                this.logger.warn(
                  `🔴 Action: REJECT | Trigger: LASER | Distance: ${data.distance ?? 'N/A'}mm | Tag: ${targetMac} | LastSeen: ${(timeDiffMs / 1000).toFixed(1)}s ago`,
                );
              }
            }

            if (data.event === 'CAT_LEFT') {
              this.logger.log(`🐈 [CAT_LEFT] Distance: ${data.distance} мм.`);
            }
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
        this.connectedDevices.delete(deviceId);
        this.logger.log(LOG_MESSAGES.deviceDisconnected(deviceId));
        break;
      }
    }
  }

  async requestDistance(deviceId: string): Promise<number> {
    const isSent = this.sendCommandToDevice(deviceId, 'GET_DISTANCE');

    if (!isSent) {
      throw new Error(`Device [${deviceId}] is offline`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDistanceRequests.delete(deviceId);
        reject(new Error('Timeout distance request'));
      }, 3000);

      this.pendingDistanceRequests.set(deviceId, (distance: number) => {
        clearTimeout(timeout);
        resolve(distance);
      });
    });
  }

  async getFeederState(deviceId: string): Promise<{
    desiredState: FeederState;
    actualState: FeederState;
    lastStateChange: Date | null;
    lastDistance: number | null;
    bleState: BleState;
  }> {
    const [feeder, lastDistance, bleState] = await Promise.all([
      this.prisma.feeder.findUnique({
        where: { deviceId },
        select: {
          actualState: true,
          desiredState: true,
          lastStateChange: true,
        },
      }),
      this.requestDistance(deviceId).catch(() => null),
      this.bleState.get(deviceId) || { lastSeen: 0, rssi: null },
    ]);

    if (!feeder || lastDistance === null) {
      throw new Error(`Feeder [${deviceId}] not found`);
    }

    const normalizedFeeder = {
      desiredState: feeder.desiredState as FeederState,
      actualState: feeder.actualState as FeederState,
      lastStateChange: feeder.lastStateChange as Date | null,
    };

    return {
      ...normalizedFeeder,
      lastDistance,
      bleState: bleState || { lastSeen: 0, rssi: null },
    };
  }

  sendCommandToDevice(
    deviceId: string,
    command: 'OPEN' | 'CLOSED' | 'GET_DISTANCE',
    catId?: string,
  ): boolean {
    const cleanDeviceId = deviceId.trim();
    const client = this.connectedDevices.get(cleanDeviceId);

    if (client && client.readyState === 1) {
      const payload = { command, catId };
      client.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
}
