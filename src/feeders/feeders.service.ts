import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederRepository } from './repository/feeders.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederAction, FeederState } from '../shared/enums.js';
import { FeedersGateway } from './feeders.gateway.js';

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

    // console.log(feeder)

    if (!feeder) {
      console.log('no feeder');
      throw new NotFoundException('Feeder not found');
    }

    const newState = action === 'open' ? FeederState.OPEN : FeederState.CLOSED;
    console.log(newState);

    const commandSent = this.gateway.sendCommandToDevice(
      feeder.deviceId,
      newState,
    );

    if (!commandSent) {
      throw new ServiceUnavailableException('Feeder device is offline');
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
}
