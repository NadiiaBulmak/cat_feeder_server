import { Injectable } from '@nestjs/common';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederRepository } from './repository/feeders.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederAction, FeederState } from '../shared/enums.js';

@Injectable()
export class FeedersService {
constructor(private readonly feederRepository: FeederRepository, private readonly prisma: PrismaService) {}

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
    switch (action) {
      case FeederAction.OPEN:
        actualState = FeederState.OPEN;
        break;
      case FeederAction.CLOSE:
        actualState = FeederState.CLOSED;
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }
    return this.feederRepository.updateFeeder(id, actualState);
  }

  remove(id: string) {
    return this.feederRepository.removeFeeder(id);
  }
}
