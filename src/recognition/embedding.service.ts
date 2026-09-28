import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { pipeline, env } from '@xenova/transformers';
import * as path from 'path';
import { LOG_MESSAGES } from '../shared/log-messages.js';

env.cacheDir = path.join(process.cwd(), '.model_cache');

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private featureExtractor: any;

  async onModuleInit() {
    this.logger.log(LOG_MESSAGES.embeddingModelLoading);
    
    this.featureExtractor = await pipeline(
      'image-feature-extraction', 
      'Xenova/resnet-50'
    );
    
    this.logger.log(LOG_MESSAGES.embeddingModelLoaded);
  }

  async generateVector(imagePath: string): Promise<number[]> {
    this.logger.log(LOG_MESSAGES.embeddingGenerationStarted(imagePath));
    try {
      const output = await this.featureExtractor(imagePath, { pooling: 'mean' });
      return Array.from(output.data) as number[];
    } catch (error) {
      this.logger.error(LOG_MESSAGES.embeddingGenerationFailed, error);
      throw error;
    }
  }
}