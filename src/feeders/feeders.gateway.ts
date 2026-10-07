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

  // 🚀 Зберігаємо MAC у нижньому регістрі: mac.toLowerCase() -> timestamp (ms)
  private lastBleDetections = new Map<string, number>();
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

            // 1. Обов'язково зводимо MAC до .toLowerCase()
            if (data.event === 'BLE_DETECTED' && data.mac) {
              const cleanMac = data.mac.trim().toLowerCase();
              this.lastBleDetections.set(cleanMac, Date.now());
              this.logger.log(
                `📡 [BLE] Знайдено мітку ${cleanMac} | RSSI: ${data.rssi} dBm`,
              );
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

            // 2. Виявлення кота лазером + перевірка BLE з БД
            if (data.event === 'CAT_APPROACHED') {
              this.logger.log(
                LOG_MESSAGES.catApproached(deviceId, data.distance ?? 'N/A'),
              );

              // Шукаємо котика, прив'язаного до цієї конкретної годівнички
              const feederCat = await this.prisma.feederCat.findFirst({
                where: { feeder: { deviceId } },
                include: { cat: true },
              });

              const targetMac = feederCat?.cat?.bleMac
                ? feederCat.cat.bleMac.trim().toLowerCase()
                : 'ff:ff:55:04:dc:bd';

              const lastSeen = this.lastBleDetections.get(targetMac) || 0;
              const timeDiff = Date.now() - lastSeen;
              const isTagNearby = timeDiff <= 15000;

              if (isTagNearby) {
                this.logger.log(
                  `🟢 [ДОСТУП ДОЗВОЛЕНО] Мітка ${targetMac} поруч (${(timeDiff / 1000).toFixed(1)}s тому). Відправляємо команду OPEN!`,
                );
                this.sendCommandToDevice(deviceId, 'OPEN', feederCat?.catId);

                const feeder = await this.prisma.feeder.findUnique({
                  where: { deviceId },
                });

                if (!feeder) {
                  this.logger.warn(
                    `⚠️ [CAT_APPROACHED] deviceId=${deviceId}. No feeder found.`,
                  );
                } else {
                  // Записуємо подібну успішну підхід-подію
                  await this.prisma.feedingEvent.create({
                    data: {
                      feederId: feeder.id,
                      catId: feederCat?.catId,
                      eventType: EventType.CAT_APPROACHED,
                      metadata: {
                        distance: data.distance,
                        bleTimeDiffMs: timeDiff,
                      },
                    },
                  });
                }
              } else {
                this.logger.log(
                  `🔴 [ДОСТУП ЗАБОРОНЕНО] Об'єкт біля лазера, але мітки ${targetMac} не видно поруч (минуло ${(timeDiff / 1000).toFixed(1)}s).`,
                );
              }
            }

            if (data.event === 'CAT_LEFT') {
              this.logger.log(
                `🐈 [КІТ ПІШОВ] Відстань: ${data.distance} мм. Залізо відраховує 30 сек до закриття...`,
              );
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
        reject(new Error('Timeout'));
      }, 5000);

      this.pendingDistanceRequests.set(deviceId, (distance: number) => {
        clearTimeout(timeout);
        resolve(distance);
      });
    });
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
