import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FeedersService } from './feeders.service.js';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';

@Controller('feeders')
export class FeedersController {
  constructor(private readonly feedersService: FeedersService) {}

  @Post()
  create(@Body() createFeederDto: CreateFeederDto) {
    return this.feedersService.create(createFeederDto);
  }

  @Get()
  findAll() {
    return this.feedersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feedersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFeederDto: UpdateFeederDto) {
    return this.feedersService.update(id, updateFeederDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.feedersService.remove(id);
  }
}
