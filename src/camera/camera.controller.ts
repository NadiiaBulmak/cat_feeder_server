import { Controller, Get, Param, Res, UseGuards, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { CameraService } from './camera.service.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';

@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  // Закоментуйте @UseGuards на час тестування, якщо фронтенд ще не передає токен
  // @UseGuards(JwtAuthGuard) 
  @Get(':deviceId/snapshot')
  async getSnapshot(@Param('deviceId') deviceId: string, @Res() res: Response) {
    try {
      const buffer = await this.cameraService.getSnapshotBuffer(deviceId);
      
      // Встановлюємо заголовки, щоб браузер розумів, що це картинка, і не кешував її
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      
      // Відправляємо байти напряму
      res.send(buffer);
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ 
        success: false, 
        message: 'Камера недоступна або вимкнена' 
      });
    }
  }
}