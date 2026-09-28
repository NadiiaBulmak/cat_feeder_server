import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LOG_MESSAGES } from '../shared/log-messages.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log(LOG_MESSAGES.databaseConnectionSucceeded);
    } catch (error) {
      this.logger.error(LOG_MESSAGES.databaseConnectionFailed, error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}