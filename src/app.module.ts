import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { CameraModule } from './camera/camera.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { FeedersModule } from './feeders/feeders.module.js';
import { AppController } from './app.controller.js';
import { CameraController } from './camera/camera.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CameraModule,
    UsersModule,
    FeedersModule,
    AuthModule,
  ],
  controllers: [AppController, CameraController],
  providers: [AppService],
})
export class AppModule {}
