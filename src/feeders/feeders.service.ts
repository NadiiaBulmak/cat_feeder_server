import { Injectable } from '@nestjs/common';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederRepository } from './repository/feeders.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeederAction } from '../shared/enums.js';

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

  update(id: string, updateFeederDto: UpdateFeederDto, action: FeederAction) {
    switch (action) {
      case FeederAction.OPEN:
        updateFeederDto.actualState = 'OPEN';
        break;
      case FeederAction.CLOSE:
        updateFeederDto.actualState = 'CLOSED';
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }
    return this.feederRepository.updateFeeder(id, updateFeederDto);
  }

  remove(id: string) {
    return this.feederRepository.removeFeeder(id);
  }
}
