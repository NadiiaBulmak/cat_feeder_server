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
      this.logger.log(`⏹️ Зупинено циклічну фотофіксацію для [${deviceId}]`);
    }
  }

  private startPhotoInterval(deviceId: string) {
    if (this.photoIntervals.has(deviceId)) return;

    this.logger.log(
      `📸 Запущено циклічну фотофіксацію (кожні 10 сек) для [${deviceId}]`,
    );

    void this.cameraService.triggerAutoSnapshot(deviceId);

    const interval = setInterval(() => {
      this.logger.log(
        `📸 10-секундний інтервал: Робимо повторний знімок кота [${deviceId}]`,
      );
      void this.cameraService.triggerAutoSnapshot(deviceId);
    }, 10000);

    this.photoIntervals.set(deviceId, interval);
  }

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const rawDeviceId = url.searchParams.get('deviceId');

      if (!rawDeviceId) {
        client.close(1008, 'Device ID required');
        return;
      }

      const deviceId = rawDeviceId.trim();
      this.connectedDevices.set(deviceId, client);

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

            if (data.event === 'STATE_CHANGED' && data.state) {
              const newState =
                data.state === 'OPEN' ? FeederState.OPEN : FeederState.CLOSED;

              await this.prisma.feeder.update({
                where: { deviceId: deviceId },
                data: { actualState: newState },
              });

              if (newState === FeederState.OPEN) {
                this.logger.log(`🔓 Годівничка [${deviceId}] повністю відкрита.`);
                this.startPhotoInterval(deviceId);
              }

              if (newState === FeederState.CLOSED) {
                this.stopPhotoInterval(deviceId);
              }

              this.logger.log(
                `🔄 Годівничка [${deviceId}] підтвердила статус: ${data.state}`,
              );
            }

            if (data.event === 'RFID_SCANNED' && data.tagValue) {
              this.logger.log(`🏷️ RFID [${data.tagValue}] на [${deviceId}]`);

              const feeder = await this.prisma.feeder.findUnique({
                where: { deviceId },
              });

              if (feeder) {
                await this.prisma.feeder.update({
                  where: { id: feeder.id },
                  data: { desiredState: FeederState.OPEN },
                });

                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: feeder.id,
                    eventType: EventType.FEEDER_OPENED,
                    metadata: { rfidTag: data.tagValue },
                  },
                });

                client.send(JSON.stringify({ command: 'OPEN' }));
              }
            }

            if (data.event === 'CAT_APPROACHED') {
              this.logger.log(
                `🐾 VL53L0X: Кіт поруч з мискою [${deviceId}] (Відстань: ${data.distance || 'N/A'} мм)`,
              );

              const feeder = await this.prisma.feeder.findUnique({
                where: { deviceId },
              });

              if (
                feeder &&
                (feeder.actualState === FeederState.OPEN || feeder.desiredState === FeederState.OPEN)
              ) {
                this.startPhotoInterval(deviceId);
              } else {
                void this.cameraService.triggerAutoSnapshot(deviceId);
              }
            }

            if (data.event === 'CAT_LEFT') {
              this.logger.log(
                `📡 VL53L0X: Кіт відійшов від миски [${deviceId}]`,
              );

              this.stopPhotoInterval(deviceId);

              const feeder = await this.prisma.feeder.findUnique({
                where: { deviceId },
              });

              if (feeder) {
                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: feeder.id,
                    eventType: EventType.FEEDER_CLOSED,
                    metadata: { reason: 'CAT_LEFT' },
                  },
                });

                await this.prisma.feeder.update({
                  where: { id: feeder.id },
                  data: { desiredState: FeederState.CLOSED },
                });

                setTimeout(() => {
                  client.send(JSON.stringify({ command: 'CLOSED' }));
                  this.logger.log(
                    `🔒 Надіслано команду CLOSED для [${deviceId}] (Кіт відійшов)`,
                  );
                }, 2000);
              }
            }
          } catch (e) {
            this.logger.error(`[WS] Помилка JSON від [${deviceId}]:`, e);
          }
        }
      });
    } catch (error) {
      this.logger.error('[WS] Помилка підключення:', error);
    }
  }

  handleDisconnect(client: WebSocket) {
    for (const [deviceId, socket] of this.connectedDevices.entries()) {
      if (socket === client) {
        this.stopPhotoInterval(deviceId);
        this.connectedDevices.delete(deviceId);
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

    this.logger.log(`📡 Запит команди [${command}] до: [${targetDeviceId}]`);
    this.logger.log(
      `📋 Доступні пристрої онлайн: ${
        Array.from(this.connectedDevices.keys()).join(', ') || 'пусто'
      }`,
    );

    if (client && client.readyState === 1) {
      const payload = { command, catId };
      client.send(JSON.stringify(payload));

      this.logger.log(
        `✅ Відправлено ${JSON.stringify(payload)} на пристрій [${targetDeviceId}]`,
      );
      return true;
    }

    this.logger.warn(
      `⚠️ Пристрій [${targetDeviceId}] не знайдено або він офлайн. Перевірте, чи підключена плата.`,
    );
    return false;
  }
}