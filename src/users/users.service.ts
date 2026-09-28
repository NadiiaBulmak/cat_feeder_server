import { Injectable } from '@nestjs/common';
import { UsersRepository } from './uesrs.repository.js';

@Injectable()
export class UsersService {
  constructor(private userRepository: UsersRepository) {}

  async findByEmail(email: string) {
    return this.userRepository.getUserByEmail(email);
  }

  async create(email: string, passwordHash: string, name?: string) {
    return this.userRepository.createUser(email, passwordHash, name ?? '');
  }
}