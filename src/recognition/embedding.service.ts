import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { pipeline, env } from '@xenova/transformers';
import * as path from 'path';

env.cacheDir = path.join(process.cwd(), '.model_cache');

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private featureExtractor: any;

  async onModuleInit() {
    this.logger.log('⏳ Завантажую легку AI-модель (ResNet-50, ~98MB)...');
    
    // Змінено на офіційно підтримувану ResNet-50
    this.featureExtractor = await pipeline(
      'image-feature-extraction', 
      'Xenova/resnet-50'
    );
    
    this.logger.log('✅ Модель успішно завантажена!');
  }

  async generateVector(imagePath: string): Promise<number[]> {
    this.logger.log(`🧠 Аналізую фото через ResNet-50: ${imagePath}`);
    try {
      const output = await this.featureExtractor(imagePath, { pooling: 'mean' });
      return Array.from(output.data) as number[];
    } catch (error) {
      this.logger.error('❌ Помилка генерації вектора', error);
      throw error;
    }
  }
}