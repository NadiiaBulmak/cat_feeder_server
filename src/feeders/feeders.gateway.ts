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
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederState } from '../shared/enums.js';
import { EventType } from '@prisma/client';
import type { CameraService } from '../camera/camera.service.js';

@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedDevices = new Map<string, WebSocket>();
  private readonly logger = new Logger(FeedersGateway.name);
  private cameraService: CameraService | null = null;

  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {}

  private getCameraService(): CameraService {
    if (!this.cameraService) {
      const { CameraService } = require('../camera/camera.service.js');
      this.cameraService = this.moduleRef.get(CameraService, { strict: false });
    }
    return this.cameraService!;
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
        this.logger.log(
          `🔄 Синхронізація: Відправлено стан ${feeder.desiredState} на [${deviceId}]`,
        );
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

              this.logger.log(
                `🔄 Годівничка [${deviceId}] підтвердила статус: ${data.state}`,
              );
            }

            if (data.event === 'CAT_APPROACHED') {
              this.logger.log(
                `🐾 ІЧ-датчик: Кіт підійшов до годівнички [${deviceId}]`,
              );

              void this.getCameraService().triggerAutoSnapshot(deviceId);
            }

            if (data.event === 'CAT_LEFT') {
              this.logger.log(
                `📡 ІЧ-датчик: Кіт відійшов від годівнички [${deviceId}]`,
              );

              const feeder = await this.prisma.feeder.findUnique({
                where: { deviceId: deviceId },
              });

              if (feeder) {
                // Записуємо подібну інформацію про закриття у журнал
                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: feeder.id,
                    eventType: EventType.FEEDER_CLOSED,
                    metadata: { reason: 'IR_SENSOR_CLEAR' },
                  },
                });

                // ЗАКРИВАЄМО ТІЛЬКИ ЯКЩО годівничка не була відкрита вручну з дашборду!
                // Якщо desiredState вже є OPEN (натиснуто з сайту), ми не перебиваємо команду користувача.
                if (feeder.desiredState !== FeederState.OPEN) {
                  await this.prisma.feeder.update({
                    where: { id: feeder.id },
                    data: { desiredState: FeederState.CLOSED },
                  });

                  const payload = { command: 'CLOSED' };
                  client.send(JSON.stringify(payload));
                  this.logger.log(
                    `✅ Авто-закриття (CAT_LEFT) відправлено на [${deviceId}]`,
                  );
                } else {
                  this.logger.log(
                    `ℹ️ [${deviceId}] залишається OPEN, бо відкрита вручну з дашборду.`,
                  );
                }
              }
            }
          } catch (e) {
            this.logger.error(
              `[WS] Помилка обробки JSON від [${deviceId}]:`,
              e,
            );
          }
        }
      });
    } catch (error) {
      this.logger.error('[WS] Помилка при підключенні:', error);
    }
  }

  handleDisconnect(client: WebSocket) {
    for (const [deviceId, socket] of this.connectedDevices.entries()) {
      if (socket === client) {
        this.connectedDevices.delete(deviceId);
        this.logger.log(
          `[WS] ❌ Пристрій відключено: [${deviceId}]. Залишилось: ${this.connectedDevices.size}`,
        );
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
