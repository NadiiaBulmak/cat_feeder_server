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
} from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';
import { FeedersService } from './feeders.service.js';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederAction } from '../shared/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('feeders')
export class FeedersController {
  private readonly logger = new Logger(FeedersController.name);
  constructor(
    private readonly feedersService: FeedersService,
    private prisma: PrismaService,
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
    const feeder = await this.prisma.feeder.findUnique({
      where: { deviceId },
      include: { cameras: true },
    });

    if (!feeder) {
      throw new NotFoundException(`Годівничку ${deviceId} не знайдено`);
    }

    if (!feeder.cameras || feeder.cameras.length === 0) {
      throw new NotFoundException(
        `До годівнички ${deviceId} не прив'язано жодної камери`,
      );
    }

    const cameraIp = feeder.cameras[0].ipAddress;
    console.log(cameraIp)

    try {
      this.logger.log(`Запитуємо знімок у камери: http://${cameraIp}/capture`);

      const response = await axios.get(`http://${cameraIp}/capture`, {
        responseType: 'arraybuffer',
        timeout: 5000,
      });

      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': response.data.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });

      res.send(response.data);
    } catch (error) {
      this.logger.error(
        `Помилка отримання знімка з камери ${cameraIp}`,
      );
      throw new InternalServerErrorException(
        "Не вдалося зв'язатися з камерою. Перевірте, чи вона увімкнена.",
      );
    }
  }
}
