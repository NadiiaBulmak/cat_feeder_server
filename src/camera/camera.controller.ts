import { Controller, Post } from '@nestjs/common';
import { CameraService } from './camera.service.js';

@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  // Ендпоінт: POST http://localhost:3000/camera/trigger
  @Post('trigger')
  async triggerCamera() {
    const filename = await this.cameraService.takePhoto();
    return { 
      success: true, 
      message: 'Фото зроблено!',
      file: filename 
    };
  }
}