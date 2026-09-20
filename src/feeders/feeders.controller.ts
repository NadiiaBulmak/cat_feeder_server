import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Res,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import axios from 'axios';
import { FeedersService } from './feeders.service.js';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederAction } from '../shared/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedersGateway } from './feeders.gateway.js';

@Controller('feeders')
export class FeedersController {
  private readonly logger = new Logger(FeedersController.name);
  private pendingSnapshots = new Map<string, (image: Buffer) => void>();
  constructor(
    private readonly feedersService: FeedersService,
    private prisma: PrismaService,
    private feedersGateway: FeedersGateway,
  ) {}

  @Post()
  create(@Body() createFeederDto: CreateFeederDto) {
    return this.feedersService.create(createFeederDto);
  }

  @Get()
  findAll() {
    return this.feedersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMany(@CurrentUser() user: { id: string }) {
    return this.feedersService.getFeedersByUserId(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feedersService.findOne(id);
  }

  @Patch(':id/:action')
  update(@Param('id') id: string, @Param('action') action: FeederAction) {
    // return this.feedersService.update(id, action);
    console.log(id, action);
    return this.feedersService.setFeederState(id, action);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.feedersService.remove(id);
  }

  @Post('/post-data')
  postData(
    @Body()
    {
      userId,
      catId,
      feederId,
    }: {
      userId: string;
      catId: string;
      feederId: string;
    },
  ) {
    return this.feedersService.updateData(userId, catId, feederId);
  }

  @Get(':deviceId/snapshot')
  async getLiveSnapshot(
    @Param('deviceId') deviceId: string,
    @Res() res: Response,
  ) {
    const cameraDeviceId = `${deviceId}`;

    const isSent = this.feedersGateway.sendCommandToDevice(
      cameraDeviceId,
      'TAKE_SNAPSHOT',
    );

    if (!isSent) {
      throw new InternalServerErrorException(
        'Камера зараз не в мережі (Offline)',
      );
    }

    this.logger.log(`Команду на знімок відправлено камері: ${cameraDeviceId}`);

    try {
      const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingSnapshots.delete(deviceId);
          reject(new Error('Камера не надіслала фото вчасно'));
        }, 8000);

        this.pendingSnapshots.set(deviceId, (buffer) => {
          clearTimeout(timeout);
          resolve(buffer);
        });
      });

      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.send(imageBuffer);
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Post(':deviceId/upload-snapshot')
  async uploadSnapshot(
    @Param('deviceId') deviceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', () => {
      const imageBuffer = Buffer.concat(chunks);
      this.logger.log(
        `Отримано фото від камери ${deviceId}. Розмір: ${imageBuffer.length} байт`,
      );

      const resolveWaitingRequest = this.pendingSnapshots.get(deviceId);

      if (resolveWaitingRequest) {
        resolveWaitingRequest(imageBuffer);
        this.pendingSnapshots.delete(deviceId);
      }

      res.status(200).send({ success: true });
    });
  }
}
