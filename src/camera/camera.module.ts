import { Module } from '@nestjs/common';
import { CameraService } from './camera.service.js';
import { CameraController } from './camera.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FeedersGateway } from '../feeders/feeders.gateway.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  providers: [CameraService, FeedersGateway],
  controllers: [CameraController],
  exports: [CameraService],
})
export class CameraModule {}
