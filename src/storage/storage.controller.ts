import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { StorageService } from './storage.service.js';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}
}
