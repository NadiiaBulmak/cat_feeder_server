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
  Logger,
  InternalServerErrorException,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FeedersService } from './feeders.service.js';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { FeederAction } from '../shared/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedersGateway } from './feeders.gateway.js';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';
import { CreateFeederExtendDto } from './dto/create-feeder-extended.dto.js';

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

  @Post('extended')
  createExtended(@Body() createFeederExtendDto: CreateFeederExtendDto) {
    return this.feedersService.createExtended(createFeederExtendDto);
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
    this.logger.log(LOG_MESSAGES.feederUpdateRequested(id, action));
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

  // @Get(':deviceId/snapshot')
  // async getLiveSnapshot(
  //   @Param('deviceId') deviceId: string,
  //   @Res() res: Response,
  // ) {
  //   const cameraDeviceId = `${deviceId}`;

  //   const isSent = this.feedersGateway.sendCommandToDevice(
  //     cameraDeviceId,
  //     'TAKE_SNAPSHOT',
  //   );

  //   if (!isSent) {
  //     throw new InternalServerErrorException(ERROR_MESSAGES.cameraOffline);
  //   }

  //   this.logger.log(LOG_MESSAGES.snapshotCommandSent(cameraDeviceId));

  //   try {
  //     const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
  //       const timeout = setTimeout(() => {
  //         this.pendingSnapshots.delete(deviceId);
  //         reject(new Error(ERROR_MESSAGES.cameraSnapshotTimeout));
  //       }, 8000);

  //       this.pendingSnapshots.set(deviceId, (buffer) => {
  //         clearTimeout(timeout);
  //         resolve(buffer);
  //       });
  //     });

  //     res.set({
  //       'Content-Type': 'image/jpeg',
  //       'Content-Length': imageBuffer.length,
  //       'Cache-Control': 'no-cache, no-store, must-revalidate',
  //     });
  //     res.send(imageBuffer);
  //   } catch (error) {
  //     this.logger.error(LOG_MESSAGES.snapshotRequestFailed, error);
  //     throw new InternalServerErrorException(
  //       ERROR_MESSAGES.snapshotRequestFailed,
  //     );
  //   }
  // }

  // @Get(':deviceId/distance')
  // async getFeederDistance(@Param('deviceId') deviceId: string) {
  //   try {
  //     // const distance = await this.feedersGateway.requestDistance(deviceId);
  //     return { success: true, distance };
  //   } catch (error: unknown) {
  //     const message =
  //       error instanceof Error ? error.message : 'Unknown error';
  //     throw new InternalServerErrorException(message);
  //   }
  // }

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
        LOG_MESSAGES.snapshotReceived(deviceId, imageBuffer.length),
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
