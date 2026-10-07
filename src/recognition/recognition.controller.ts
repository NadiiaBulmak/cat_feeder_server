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
import { ERROR_MESSAGES } from '../shared/error-messages.js';

@Controller('cats')
export class RecognitionController {
  constructor(
    private embeddingService: EmbeddingService,
    private recognitionService: RecognitionService,
    private feedersGateway: FeedersGateway,
    private prisma: PrismaService,
  ) {}

  // POST /cats/:id/reference
  // TODO: use storage service
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
    if (!file) throw new BadRequestException(ERROR_MESSAGES.fileNotFound);

    const filePath = file.path;

    const vector = await this.embeddingService.generateVector(filePath);

    await this.recognitionService.saveCatReference(catId, vector, filePath);

    return {
      success: true,
      message: 'Еталонне фото успішно оброблено та вектор збережено',
      imageUrl: filePath,
    };
  }
// TODO: use storage to save attepts
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
    if (!file) throw new BadRequestException(ERROR_MESSAGES.fileNotFound);
    if (!deviceId)
      throw new BadRequestException(ERROR_MESSAGES.deviceIdRequired);

    const feeder = await this.prisma.feeder.findUnique({
      where: { deviceId },
    });

    if (!feeder) {
      throw new BadRequestException(
        ERROR_MESSAGES.feederByDeviceIdNotFound(deviceId),
      );
    }

    const vector = await this.embeddingService.generateVector(file.path);
    const match = await this.recognitionService.identifyCat(vector);

    const THRESHOLD = 0.75;
    const isRecognized = match.similarity >= THRESHOLD;

    if (isRecognized) {
      const hasAccess = await this.prisma.feederCat.findFirst({
        where: {
          feederId: feeder.id,
          catId: match.catId,
        },
      });

      if (!hasAccess) {
        await this.prisma.feedingEvent.create({
          data: {
            feederId: feeder.id,
            catId: match.catId,
            eventType: EventType.HARDWARE_ERROR,
            confidence: match.similarity,
            metadata: { reason: 'ACCESS_DENIED', image: file.filename },
          },
        });

        return {
          accessGranted: false,
          message: ERROR_MESSAGES.catAccessDenied(match.catName),
          confidence: match.similarity,
        };
      }

      await this.prisma.feeder.update({
        where: { id: feeder.id },
        data: { desiredState: FeederState.OPEN },
      });

      const isSent = this.feedersGateway.sendCommandToDevice(
        feeder.deviceId,
        FeederState.OPEN,
        match.catId,
      );

      await this.prisma.feedingEvent.create({
        data: {
          feederId: feeder.id,
          catId: match.catId,
          eventType: EventType.CAT_APPROACHED,
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
      await this.prisma.feedingEvent.create({
        data: {
          feederId: feeder.id,
          eventType: EventType.HARDWARE_ERROR,
          confidence: match.similarity,
          metadata: { image: file.filename },
        },
      });

      return {
        accessGranted: false,
        message: ERROR_MESSAGES.catNotRecognized,
        confidence: match.similarity,
      };
    }
  }
}
