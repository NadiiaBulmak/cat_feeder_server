import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CameraModule } from './camera/camera.module.js';
import { CameraController } from './camera/camera.controller.js';
import { CameraService } from './camera/camera.service.js';
import { FeedersModule } from './feeders/feeders.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CameraModule,
    FeedersModule,
  ],
  controllers: [AppController, CameraController],
  providers: [AppService],
})
export class AppModule {}