import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);

  constructor(private prisma: PrismaService) {}

  async saveCatReference(catId: string, vector: number[], imageUrl: string) {
    // Перетворюємо масив у рядок формату "[0.1, 0.2, ...]" для PostgreSQL
    const vectorString = `[${vector.join(',')}]`;

    // Використовуємо сирий SQL для вставки вектора
    await this.prisma.$executeRaw`
      INSERT INTO "CatEmbedding" ("id", "catId", "embedding", "imageUrl", "createdAt")
      VALUES (gen_random_uuid(), ${catId}, ${vectorString}::vector, ${imageUrl}, NOW())
    `;
    
    return { success: true, message: 'Еталонний вектор збережено' };
  }

  async comparePhotos(newPhotoPath: string, referencePhotoPath: string): Promise<number> {
    this.logger.log(`🔍 Аналізую фото: ${newPhotoPath} порівняно з еталоном ${referencePhotoPath}`);
    
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

      this.logger.log('⏳ (Імітація роботи ШІ... 1 сек)');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Тимчасово генеруємо випадкову впевненість від 70% до 98% для тесту
      const mockConfidence = (Math.floor(Math.random() * 28) + 70) / 100;
      this.logger.log(`🧠 ШІ оцінив схожість у ${mockConfidence * 100}%`);
      
      return mockConfidence;
    } catch (error) {
      this.logger.error('❌ Помилка розпізнавання', error);
      return 0;
    }
  }

async identifyCat(vector: number[]) {
    const vectorString = `[${vector.join(',')}]`;

    // Використовуємо pgvector оператор <=> для розрахунку косинусної відстані.
    // 1 - відстань = відсоток схожості (similarity).
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
    this.logger.log(`🔍 Знайдено збіг! Схожість: ${(bestMatch.similarity * 100).toFixed(2)}%`);
    console.log(matches)

    return {
      found: true,
      similarity: bestMatch.similarity, // наприклад, 0.85 (85%)
      catId: bestMatch.catId,
      catName: bestMatch.catName,
    };
  }
}