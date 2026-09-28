import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);

  constructor(private prisma: PrismaService) {}

  async saveCatReference(catId: string, vector: number[], imageUrl: string) {
    const vectorString = `[${vector.join(',')}]`;

    await this.prisma.$executeRaw`
      INSERT INTO "CatEmbedding" ("id", "catId", "embedding", "imageUrl", "createdAt")
      VALUES (gen_random_uuid(), ${catId}, ${vectorString}::vector, ${imageUrl}, NOW())
    `;
    
    return { success: true, message: 'Еталонний вектор збережено' };
  }

  async comparePhotos(newPhotoPath: string, referencePhotoPath: string): Promise<number> {
    this.logger.log(
      LOG_MESSAGES.photoComparisonStarted(newPhotoPath, referencePhotoPath),
    );
    
    try {
      // =========================================================
      // ТУТ БУДЕ РЕАЛЬНИЙ AI ВИКЛИК (наприклад, до Python FastAPI
      // сервера з моделлю CLIP або MobileNet для тварин)
      // const response = await axios.post('http://localhost:8000/compare', {
      //   image1: newPhotoPath,
      //   image2: referencePhotoPath
      // });
      // return response.data.similarity;
      // =========================================================

      this.logger.log(LOG_MESSAGES.aiSimulationStarted);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Тимчасово генеруємо випадкову впевненість від 70% до 98% для тесту
      const mockConfidence = (Math.floor(Math.random() * 28) + 70) / 100;
      this.logger.log(LOG_MESSAGES.similarityCalculated(mockConfidence * 100));
      
      return mockConfidence;
    } catch (error) {
      this.logger.error(LOG_MESSAGES.catRecognitionFailed, error);
      return 0;
    }
  }

async identifyCat(vector: number[]) {
    const vectorString = `[${vector.join(',')}]`;

const matches: any[] = await this.prisma.$queryRaw`
    SELECT e."catId", 
           c."name" AS "catName",
           (1 - (e.embedding <=> ${vectorString}::vector)) AS similarity 
    FROM "CatEmbedding" e
    JOIN "Cat" c ON c."id" = e."catId"
    ORDER BY e.embedding <=> ${vectorString}::vector 
    LIMIT 1;
  `;

    if (!matches || matches.length === 0) {
      return { found: false, similarity: 0, catId: null };
    }

    const bestMatch = matches[0];
    this.logger.log(
      LOG_MESSAGES.catMatchFound((bestMatch.similarity * 100).toFixed(2)),
    );
    console.log(LOG_MESSAGES.catMatchesFound(matches.length), matches);

    return {
      found: true,
      similarity: bestMatch.similarity,
      catId: bestMatch.catId,
      catName: bestMatch.catName,
    };
  }
}