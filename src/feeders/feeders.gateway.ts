import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import type { Server } from 'ws';
import type { IncomingMessage } from 'http';

// ws://localhost:3000/ws/device
@WebSocketGateway({ path: '/ws/device' })
export class FeedersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Пул з'єднань: Map<deviceId, WebSocket>
  private connectedDevices = new Map<string, WebSocket>();

  handleConnection(client: WebSocket, request: IncomingMessage) {
    // Парсимо URL, щоб дістати deviceId, наприклад: /ws/device?deviceId=ESP_001
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const deviceId = url.searchParams.get('deviceId');
    console.log(deviceId)

    if (!deviceId) {
      console.warn('[WS] Connection rejected: No deviceId provided');
      client.close(1008, 'Device ID required');
      return;
    }

    this.connectedDevices.set(deviceId, client);
    console.log(`[WS] Device connected: ${deviceId}`);

    // Обробка вхідних повідомлень від ESP8266
    client.on('message', (message: Buffer) => {
      const msg = message.toString();

      // Heartbeat від мікроконтролера
      if (msg === 'ping') {
        client.send('pong');
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    // Шукаємо, який пристрій відключився, і видаляємо його з пулу
    for (const [deviceId, socket] of this.connectedDevices.entries()) {
      if (socket === client) {
        this.connectedDevices.delete(deviceId);
        console.log(`[WS] Device disconnected: ${deviceId}`);
        break;
      }
    }
  }

  // Метод для відправки команд з REST-контролера
  sendCommandToDevice(deviceId: string, command: 'OPEN' | 'CLOSED'): boolean {
    const client = this.connectedDevices.get(deviceId);
    console.log(client) //undefined
    console.log(deviceId)

    if (client && client.readyState === 1) {
      // 1 = WebSocket.OPEN
      client.send(JSON.stringify({ command }));
      return true;
    }

    return false; // Пристрій офлайн
  }
}
