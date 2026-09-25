import { Module, forwardRef } from '@nestjs/common';
import { CameraService } from './camera.service.js';
import { CameraController } from './camera.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FeedersModule } from '../feeders/feeders.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StorageModule,
    forwardRef(() => FeedersModule),
  ],
  controllers: [CameraController],
  providers: [CameraService],
  exports: [CameraService],
})
export class CameraModule {}
