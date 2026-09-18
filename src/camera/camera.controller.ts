import { Controller, Post, UseGuards } from '@nestjs/common';
import { CameraService } from './camera.service.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  @UseGuards(JwtAuthGuard)
  @Post('trigger')
  async triggerCamera(@CurrentUser() user: any) {
    console.log(`📸 Користувач ${user.email} запросив фото`);
    const filename = await this.cameraService.takePhoto();
    return { 
      success: true, 
      message: 'Фото зроблено!',
      file: filename 
    };
  }
}