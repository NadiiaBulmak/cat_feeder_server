import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  getUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  createUser(email: string, passwordHash: string, name: string) {
    return this.prisma.user.create({
      data: { email, passwordHash, name },
    });
  }
}
