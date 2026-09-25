import { Controller, Get, Param, Res, UseGuards, HttpStatus, Post, Query, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CameraService } from './camera.service.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';

@Controller('camera')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

// =========================================================
  // 1. ЕНДПОІНТ ДЛЯ ФРОНТЕНДУ (Чекає на картинку)
  // =========================================================
  @Get(':deviceId/snapshot')
  async getSnapshot(@Param('deviceId') deviceId: string, @Res() res: Response) {
    try {
      // Код зупиниться тут і чекатиме, поки камера не зробить POST-запит
      const buffer = await this.cameraService.getLiveSnapshotBuffer(deviceId);
      
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(buffer);
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ 
        success: false, 
        message: error || 'Помилка отримання знімка' 
      });
    }
  }

  // =========================================================
  // 2. ЕНДПОІНТ ДЛЯ КАМЕРИ (Приймає байти і віддає фронтенду)
  // =========================================================
  @Post('upload')
  async uploadPhoto(@Query('deviceId') deviceId: string, @Req() req: Request, @Res() res: Response) {
    if (!deviceId) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing deviceId');
    }

    try {
      // Збираємо "сирі" байти (Buffer) прямо з HTTP-запиту камери
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      // Передаємо байти в сервіс (це розблокує GET-запит фронтенду)
      this.cameraService.resolveSnapshot(deviceId, imageBuffer);

      // Відповідаємо камері, що все окей
      res.status(HttpStatus.OK).send('Photo received');
    } catch (error) {
      console.error('Помилка прийому фото:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error processing photo');
    }
  }
}