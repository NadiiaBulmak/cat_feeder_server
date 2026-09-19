import {
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { EmbeddingService } from './embedding.service.js';
import { RecognitionService } from './recognition.service.js';
import { FeedersGateway } from '../feeders/feeders.gateway.js';
import { EventType, FeederState } from '../shared/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('cats')
export class RecognitionController {
  constructor(
    private embeddingService: EmbeddingService,
    private recognitionService: RecognitionService,
    private feedersGateway: FeedersGateway,
    private prisma: PrismaService,
  ) {}

  // POST /cats/:id/reference
  @Post(':id/reference')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/references',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(
            null,
            `cat_${req.params.id}_${uniqueSuffix}${path.extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadReferencePhoto(
    @Param('id') catId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Файл не знайдено');

    // 1. Отримуємо шлях до збереженого фото
    const filePath = file.path;

    // 2. Перетворюємо фото на вектор (768 чисел)
    const vector = await this.embeddingService.generateVector(filePath);

    // 3. Зберігаємо вектор у базу даних PostgreSQL
    await this.recognitionService.saveCatReference(catId, vector, filePath);

    return {
      success: true,
      message: 'Еталонне фото успішно оброблено та вектор збережено',
      imageUrl: filePath,
    };
  }

  @Post('identify')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/attempts',
        filename: (req, file, cb) => {
          cb(null, `attempt_${Date.now()}${path.extname(file.originalname)}`);
        },
      }),
    }),
  )
  @Post('identify')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/attempts',
        filename: (req, file, cb) => {
          cb(null, `attempt_${Date.now()}${path.extname(file.originalname)}`);
        },
      }),
    }),
  )
  async identifyIncomingCat(
    @UploadedFile() file: Express.Multer.File,
    @Query('deviceId') deviceId: string,
  ) {
    if (!file) throw new BadRequestException('Файл не знайдено');
    if (!deviceId)
      throw new BadRequestException('Не вказано deviceId у параметрах');

    // 1. ШУКАЄМО ГОДІВНИЧКУ В БАЗІ ЗА deviceId
    const feeder = await this.prisma.feeder.findUnique({
      where: { deviceId },
    });

    if (!feeder) {
      throw new BadRequestException(
        `Годівничку з deviceId [${deviceId}] не знайдено`,
      );
    }

    // 2. Аналізуємо фото
    const vector = await this.embeddingService.generateVector(file.path);
    const match = await this.recognitionService.identifyCat(vector);

    const THRESHOLD = 0.75;
    const isRecognized = match.similarity >= THRESHOLD;

    if (isRecognized) {
      // 3. ПЕРЕВІРЯЄМО ДОСТУП ЗА feeder.id (UUID)
      const hasAccess = await this.prisma.feederCat.findFirst({
        where: {
          feederId: feeder.id,
          catId: match.catId,
        },
      });

      if (!hasAccess) {
        // Записуємо спробу доступу чужого кота в історію
        await this.prisma.feedingEvent.create({
          data: {
            feederId: feeder.id,
            catId: match.catId,
            eventType: EventType.IDENTIFICATION_FAILED,
            confidence: match.similarity,
            metadata: { reason: 'ACCESS_DENIED', image: file.filename },
          },
        });

        return {
          accessGranted: false,
          message: `Привіт, ${match.catName}, але тобі не можна їсти з цієї годівнички! ⛔`,
          confidence: match.similarity,
        };
      }

      // 4. ДОСТУП ДОЗВОЛЕНО: Оновлюємо бажаний стан (desiredState) у базі
      // Це гарантує, що при втраті/відновленні Wi-Fi плата одразу відкриється знову
      await this.prisma.feeder.update({
        where: { id: feeder.id },
        data: { desiredState: FeederState.OPEN },
      });

      // 5. Відправляємо команду по сокетах в реальному часі (по deviceId)
      const isSent = this.feedersGateway.sendCommandToDevice(
        feeder.deviceId, // Для сокетів юзаємо ESP_001
        FeederState.OPEN,
        match.catId,
      );

      // 6. ЗАПИСУЄМО УСПІШНУ ПОДІЮ В ІСТОРІЮ
      await this.prisma.feedingEvent.create({
        data: {
          feederId: feeder.id, // UUID для зв'язку в базі
          catId: match.catId,
          eventType: EventType.CAT_IDENTIFIED,
          confidence: match.similarity,
          metadata: { action: 'COMMAND_OPEN_SENT', image: file.filename },
        },
      });

      return {
        accessGranted: true,
        message: `Смачного, ${match.catName}! Відкриваємо кормушку. 😻`,
        deviceOnline: isSent,
        confidence: match.similarity,
        catId: match.catId,
        catName: match.catName,
      };
    } else {
      // Кота не розпізнано взагалі
      await this.prisma.feedingEvent.create({
        data: {
          feederId: feeder.id,
          eventType: EventType.UNKNOWN_CAT,
          confidence: match.similarity,
          metadata: { image: file.filename },
        },
      });

      return {
        accessGranted: false,
        message: 'Невідомий кіт або поганий ракурс.',
        confidence: match.similarity,
      };
    }
  }
}
