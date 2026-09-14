import { Module } from '@nestjs/common';
import { FeedersService } from './feeders.service.js';
import { FeedersController } from './feeders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FeederRepository } from './repository/feeders.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [FeedersController],
  providers: [FeedersService, FeederRepository],
})
export class FeedersModule {}
