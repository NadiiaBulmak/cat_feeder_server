import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Успішно підключено до бази даних PostgreSQL');
    } catch (error) {
      this.logger.error('Помилка підключення до бази даних', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}