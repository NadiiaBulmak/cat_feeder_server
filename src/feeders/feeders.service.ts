import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { FeederRepository } from './repository/feeders.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederAction, FeederState } from '../shared/enums.js';
import { FeedersGateway } from './feeders.gateway.js';
import { ERROR_MESSAGES } from '../shared/error-messages.js';
import { LOG_MESSAGES } from '../shared/log-messages.js';
import { CreateFeederExtendDto } from './dto/create-feeder-extended.dto.js';

@Injectable()
export class FeedersService {
  constructor(
    private readonly feederRepository: FeederRepository,
    private readonly prisma: PrismaService,
    private readonly gateway: FeedersGateway,
  ) {}

  create(createFeederDto: CreateFeederDto) {
    return this.feederRepository.addFeeder({
      ...createFeederDto,
      lastPing: createFeederDto.lastPing ?? new Date(),
      createdAt: createFeederDto.createdAt ?? new Date(),
      updatedAt: createFeederDto.updatedAt ?? new Date(),
    });
  }

  async createExtended(createFeederExtendDto: CreateFeederExtendDto) {
    await this.prisma.$transaction(async (prisma) => {
      // 1. СПОЧАТКУ створюємо або оновлюємо Feeder, щоб усі наступні записи мали на що посилатися
      await prisma.feeder.upsert({
        where: { deviceId: createFeederExtendDto.deviceId },
        create: {
          deviceId: createFeederExtendDto.deviceId,
          name: createFeederExtendDto.name ?? createFeederExtendDto.deviceId,
          actualState: createFeederExtendDto.actualState ?? FeederState.CLOSED,
          desiredState:
            createFeederExtendDto.desiredState ?? FeederState.CLOSED,
        },
        update: {
          name: createFeederExtendDto.name ?? createFeederExtendDto.deviceId,
          actualState: createFeederExtendDto.actualState ?? FeederState.CLOSED,
          desiredState:
            createFeederExtendDto.desiredState ?? FeederState.CLOSED,
          lastPing: createFeederExtendDto.lastPing ?? new Date(),
          updatedAt: new Date(),
        },
      });

      // 2. Оновлюємо котика (записуємо його BLE MAC)
      await prisma.cat.update({
        where: { id: createFeederExtendDto.catId },
        data: { bleMac: createFeederExtendDto.bleMacAddress },
      });

      // 3. Зв'язуємо юзера з котиком (використовуємо upsert, щоб не впасти, якщо зв'язок вже є)
      await prisma.userCat.upsert({
        where: {
          userId_catId: {
            userId: (
              await prisma.user.findUniqueOrThrow({
                where: { email: createFeederExtendDto.userEmail },
              })
            ).id,
            catId: createFeederExtendDto.catId,
          },
        },
        create: {
          user: { connect: { email: createFeederExtendDto.userEmail } },
          cat: { connect: { id: createFeederExtendDto.catId } },
        },
        update: {},
      });

      // 4. Зв'язуємо юзера з годівничкою
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: createFeederExtendDto.userEmail },
      });
      const feeder = await prisma.feeder.findUniqueOrThrow({
        where: { deviceId: createFeederExtendDto.deviceId },
      });

      await prisma.userFeeder.upsert({
        where: {
          userId_feederId: {
            userId: user.id,
            feederId: feeder.id,
          },
        },
        create: {
          userId: user.id,
          feederId: feeder.id,
        },
        update: {},
      });

      // 5. Зв'язуємо годівничку з котиком
      await prisma.feederCat.upsert({
        where: {
          feederId_catId: {
            feederId: feeder.id,
            catId: createFeederExtendDto.catId,
          },
        },
        create: {
          feederId: feeder.id,
          catId: createFeederExtendDto.catId,
        },
        update: {},
      });

      console.log('Feeder created and associated successfully.');
    });

    return this.prisma.feeder.findUnique({
      where: { deviceId: createFeederExtendDto.deviceId },
      include: {
        userFeeders: {
          include: {
            user: true,
          },
        },
        feederCats: {
          include: {
            cat: true,
          },
        },
      },
    });
  }

  findAll() {
    return this.feederRepository.findAll();
  }

  findOne(id: string) {
    return this.feederRepository.findById(id);
  }

  update(id: string, action: FeederAction) {
    let actualState: FeederState = FeederState.OPEN;
    const newState = action === 'open' ? FeederState.OPEN : FeederState.CLOSED;
    return this.feederRepository.updateFeeder(id, newState);
  }

  remove(id: string) {
    return this.feederRepository.removeFeeder(id);
  }

  async setFeederState(id: string, action: FeederAction) {
    const feeder = await this.prisma.feeder.findUnique({
      where: { id },
    });

    if (!feeder) {
      throw new NotFoundException(ERROR_MESSAGES.feederNotFound);
    }

    const newState = action === 'open' ? FeederState.OPEN : FeederState.CLOSED;
    console.log(LOG_MESSAGES.feederStateChanged(newState));

    const commandSent = this.gateway.sendCommandToDevice(
      feeder.deviceId,
      newState,
    );

    if (!commandSent) {
      throw new ServiceUnavailableException(ERROR_MESSAGES.feederDeviceOffline);
    }

    const updatedFeeder = await this.feederRepository.updateFeeder(
      id,
      newState,
    );

    return updatedFeeder;
  }

  getFeedersByUserId(userId: string) {
    return this.feederRepository.findManyByUserId(userId);
  }

  updateData(userId: string, catId: string, feederId: string) {
    return this.feederRepository.postUserToCat(userId, catId, feederId);
  }
}
