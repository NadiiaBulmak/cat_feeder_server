import { Module } from '@nestjs/common';
import { RecognitionController } from './recognition.controller.js';
import { RecognitionService } from './recognition.service.js';
import { EmbeddingService } from './embedding.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FeedersModule } from '../feeders/feeders.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  imports: [PrismaModule, FeedersModule],
  controllers: [RecognitionController],
  providers: [RecognitionService, EmbeddingService, PrismaService],
})
export class RecognitionModule {}