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

// ws://localhost:3000/ws/device
@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  constructor(private prisma: PrismaService) {}

  // Пул з'єднань: Map<deviceId, WebSocket>
  private connectedDevices = new Map<string, WebSocket>();
  private readonly logger = new Logger(FeedersGateway.name);

  handleConnection(client: WebSocket, request: IncomingMessage) {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const rawDeviceId = url.searchParams.get('deviceId');

      if (!rawDeviceId) {
        this.logger.warn(
          `[WS] Відхилено: Немає deviceId у параметрах (URL: ${request.url})`,
        );
        client.close(1008, 'Device ID required');
        return;
      }

      const deviceId = rawDeviceId.trim();
      this.connectedDevices.set(deviceId, client);
      this.logger.log(
        `[WS] ✅ Пристрій підключено: [${deviceId}]. Всього: ${this.connectedDevices.size}`,
      );

      // Обробка вхідних повідомлень від ESP8266/NodeMCU
      client.on('message', async (message: Buffer) => {
        const msg = message.toString().trim();

        // 1. Обробка Heartbeat (пінгів)
        if (msg === 'ping') {
          client.send('pong');
          return; // Виходимо, щоб не парсити 'ping' як JSON
        }

        // 2. Обробка JSON (Зміна стану, RFID тощо)
        if (msg.startsWith('{')) {
          try {
            const data = JSON.parse(msg);

            // Якщо прийшла подія про зміну стану механізму
            if (data.event === 'STATE_CHANGED' && data.state) {
              const newState =
                data.state === 'OPEN' ? FeederState.OPEN : FeederState.CLOSED;

              // Оновлюємо actualState у базі даних
              await this.prisma.feeder.update({
                where: { deviceId: deviceId },
                data: { actualState: newState },
              });

              this.logger.log(
                `🔄 Годівничка [${deviceId}] підтвердила статус: ${data.state}`,
              );
            }

            // ТУТ в майбутньому можна обробляти data.event === 'RFID_SCANNED'
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
    // Шукаємо, який пристрій відключився, і видаляємо його з пулу
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

  // Об'єднаний метод: відправляє команду конкретному пристрою + передає ім'я котика
  // Змінили catName на catId
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
      // 1 = WebSocket.OPEN
      // Тепер відправляємо catId замість cat
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
