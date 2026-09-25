import { Module } from '@nestjs/common';
import { FeedersService } from './feeders.service.js';
import { FeedersController } from './feeders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FeederRepository } from './repository/feeders.repository.js';
import { FeedersGateway } from './feeders.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CameraService } from '../camera/camera.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FeedersController],
  providers: [FeedersService, FeederRepository, FeedersGateway, PrismaService, CameraService],
  exports: [FeedersGateway]
})
export class FeedersModule {}
