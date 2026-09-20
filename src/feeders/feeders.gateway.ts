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

@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  constructor(private prisma: PrismaService) {}

  private connectedDevices = new Map<string, WebSocket>();
  private readonly logger = new Logger(FeedersGateway.name);

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
            
            if (data.event === 'CAT_LEFT') {
              this.logger.log(
                `📡 ІЧ-датчик: Кіт відійшов від годівнички [${deviceId}]`,
              );

              const feeder = await this.prisma.feeder.findUnique({
                where: { deviceId: deviceId },
              });

              if (feeder) {
                await this.prisma.feeder.update({
                  where: { id: feeder.id },
                  data: { desiredState: FeederState.CLOSED },
                });

                await this.prisma.feedingEvent.create({
                  data: {
                    feederId: feeder.id,
                    eventType: EventType.FEEDER_CLOSED,
                    metadata: { reason: 'IR_SENSOR_CLEAR' },
                  },
                });
              }

              const payload = { command: 'CLOSED' };
              client.send(JSON.stringify(payload));

              this.logger.log(`✅ Команду CLOSED відправлено на [${deviceId}]`);
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
    command: 'OPEN' | 'CLOSED',
    catId?: string,
  ): boolean {
    const cleanDeviceId = deviceId.trim();
    const client = this.connectedDevices.get(cleanDeviceId);

    this.logger.log(`📡 Запит до: [${cleanDeviceId}]`);
    this.logger.log(
      `📋 Доступні пристрої онлайн: ${Array.from(this.connectedDevices.keys()).join(', ') || 'пусто'}`,
    );

    if (client && client.readyState === 1) {
      const payload = { command, catId };
      client.send(JSON.stringify(payload));

      this.logger.log(
        `✅ Відправлено ${JSON.stringify(payload)} на пристрій [${cleanDeviceId}]`,
      );
      return true;
    }

    this.logger.warn(
      `⚠️ Пристрій [${cleanDeviceId}] не знайдено або він офлайн`,
    );
    return false;
  }
}
