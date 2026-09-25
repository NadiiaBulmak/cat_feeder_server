import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  HttpStatus,
  Post,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CameraService } from './camera.service.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../storage/storage.service.js';

@Controller('camera')
export class CameraController {
  constructor(
    private readonly cameraService: CameraService,
    private readonly storageService: StorageService,
  ) {}

 // frontend-endpoint
  @Get(':deviceId/snapshot')
  async getSnapshot(@Param('deviceId') deviceId: string, @Res() res: Response) {
    try {
      // Код зупиниться тут і чекатиме, поки камера не зробить POST-запит
      const buffer = await this.cameraService.getLiveSnapshotBuffer(deviceId);

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      res.send(buffer);
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        message: error || 'Помилка отримання знімка',
      });
    }
  }

// camera-ph-endpoint
  @Post('upload')
  async uploadPhoto(
    @Query('deviceId') deviceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!deviceId) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing deviceId');
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      this.cameraService.resolveSnapshot(deviceId, imageBuffer);

      res.status(HttpStatus.OK).send('Photo received');
    } catch (error) {
      console.error('Помилка прийому фото:', error);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error processing photo');
    }
  }

  @Post(':deviceId/capture-and-save')
  async captureAndSaveCloud(
    @Param('deviceId') deviceId: string,
    @Query('folder') folder: string = 'reference',
  ) {
    try {
      const fileUrl = await this.cameraService.captureAndSaveToCloud(
        deviceId,
        folder,
      );

      return {
        success: true,
        message: 'Фото успішно збережено в хмару',
        url: fileUrl,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Помилка збереження фото',
      };
    }
  }

  @Post('save-snapshot')
  @UseInterceptors(FileInterceptor('file'))
  async saveExistingSnapshot(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string = 'snapshots',
  ) {
    if (!file) {
      return { success: false, message: 'Файл не передано' };
    }

    try {
      const url = await this.storageService.uploadImage(file.buffer, folder);
      return {
        success: true,
        message: 'Знімок успішно збережено в хмару',
        url,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Помилка збереження знімка'
      };
    }
  }

  @Get(':deviceId/snapshots')
  async getSnapshotsByDevice(@Param('deviceId') deviceId: string) {
    const snapshots = await this.storageService.getDeviceSnapshots(deviceId);
    return {
      success: true,
      count: snapshots.length,
      snapshots,
    };
  }
}
