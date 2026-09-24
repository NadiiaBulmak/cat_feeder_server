import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);
  
  // Беремо URL з .env, або залишаємо ваш локальний як fallback
  private readonly cameraUrl = process.env.CAMERA_URL ?? 'http://192.168.100.26/capture';

  async getSnapshotBuffer(deviceId: string): Promise<Buffer> {
    this.logger.log(`📸 Запит до камери пристрою [${deviceId}]: ${this.cameraUrl}`);
    
    try {
      const response = await fetch(this.cameraUrl);
      
      if (!response.ok) {
        throw new Error(`Камера повернула статус: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(`✅ Фото успішно завантажено в пам'ять (${buffer.length} байт)`);
      return buffer;
      
    } catch (error) {
      this.logger.error('❌ Помилка зв\'язку з камерою', error);
      throw new InternalServerErrorException('Не вдалося отримати знімок з камери');
    }
  }
}