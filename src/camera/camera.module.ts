import { Module } from '@nestjs/common';
import { CameraService } from './camera.service.js';
import { CameraController } from './camera.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [CameraService],
  controllers: [CameraController],
  exports: [CameraService],
})
export class CameraModule {}
