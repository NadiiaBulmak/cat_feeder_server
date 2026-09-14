import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);
  private readonly cameraUrl = 'http://192.168.100.26/capture';

  async takePhoto(): Promise<string> {
    this.logger.log(`📸 Робимо запит до камери: ${this.cameraUrl}`);
    
    try {
      const response = await fetch(this.cameraUrl);
      
      if (!response.ok) {
        throw new Error(`Камера повернула помилку: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }

      const filename = `cat_${Date.now()}.jpg`;
      const filepath = path.join(uploadDir, filename);

      fs.writeFileSync(filepath, buffer);
      this.logger.log(`✅ Фото успішно збережено: ${filepath}`);

      return filename;
    } catch (error) {
      this.logger.error('❌ Помилка під час фотографування', error);
      throw error;
    }
  }
}