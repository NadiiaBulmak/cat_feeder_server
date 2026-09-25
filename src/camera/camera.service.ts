import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FeedersGateway } from '../feeders/feeders.gateway.js';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);
  
  // Беремо URL з .env, або залишаємо ваш локальний як fallback
  private readonly cameraUrl = process.env.CAMERA_URL!;
  private pendingSnapshots = new Map<string, (image: Buffer) => void>();
  
  constructor(private readonly feedersGateway: FeedersGateway) {}

  // async getSnapshotBuffer(deviceId: string): Promise<Buffer> {
  //   this.logger.log(`📸 Запит до камери пристрою [${deviceId}]: ${this.cameraUrl}`);
    
  //   try {
  //     const response = await fetch(this.cameraUrl);
      
  //     if (!response.ok) {
  //       throw new Error(`Камера повернула статус: ${response.status}`);
  //     }

  //     const arrayBuffer = await response.arrayBuffer();
  //     const buffer = Buffer.from(arrayBuffer);

  //     this.logger.log(`✅ Фото успішно завантажено в пам'ять (${buffer.length} байт)`);
  //     return buffer;
      
  //   } catch (error) {
  //     this.logger.error('❌ Помилка зв\'язку з камерою', error);
  //     throw new InternalServerErrorException('Не вдалося отримати знімок з камери');
  //   }
  // }

  // 1. Цей метод викликає фронтенд. Він відправляє команду і чекає на POST від камери
  async getLiveSnapshotBuffer(deviceId: string): Promise<Buffer> {
    this.logger.log(`📸 Запит фотографії для пристрою: [${deviceId}]`);
    
    // Відправляємо команду через існуючий WebSocket-шлюз
    const isSent = this.feedersGateway.sendCommandToDevice(deviceId, 'TAKE_SNAPSHOT');
    
    if (!isSent) {
      throw new InternalServerErrorException('Камера не в мережі (не підключена до сокетів)');
    }

    return new Promise<Buffer>((resolve, reject) => {
      // Ставимо таймаут 15 секунд (якщо камера не пришле POST-запит)
      const timeout = setTimeout(() => {
        this.pendingSnapshots.delete(deviceId);
        reject(new Error('Камера не надіслала фото вчасно'));
      }, 15000);

      // Зберігаємо функцію resolve, щоб викликати її, коли прийде POST-запит
      this.pendingSnapshots.set(deviceId, (buffer) => {
        clearTimeout(timeout);
        resolve(buffer);
      });
    });
  }

  // 2. Цей метод викликається, коли камера присилає фото через POST-запит
  resolveSnapshot(deviceId: string, imageBuffer: Buffer) {
    const resolveWaitingRequest = this.pendingSnapshots.get(deviceId);
    
    if (resolveWaitingRequest) {
      resolveWaitingRequest(imageBuffer);
      this.pendingSnapshots.delete(deviceId); // Очищаємо пам'ять
      this.logger.log(`✅ Фото від [${deviceId}] успішно передано на фронтенд`);
    } else {
      this.logger.warn(`⚠️ Отримано фото від [${deviceId}], але його ніхто не чекав`);
    }
  }
}