import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { FeedersService } from './feeders.service.js';
import { CreateFeederDto } from './dto/create-feeder.dto.js';
import { UpdateFeederDto } from './dto/update-feeder.dto.js';
import { FeederAction } from '../shared/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/strategy/jwt-auth.guard.js';

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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMany(@CurrentUser() user: { id: string }) {
    return this.feedersService.getFeedersByUserId(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feedersService.findOne(id);
  }

  @Patch(':id/:action')
  update(@Param('id') id: string, @Param('action') action: FeederAction) {
    // return this.feedersService.update(id, action);
    console.log(id, action);
    return this.feedersService.setFeederState(id, action);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.feedersService.remove(id);
  }

  @Post('/post-data')
  postData(
    @Body()
    {
      userId,
      catId,
      feederId,
    }: {
      userId: string;
      catId: string;
      feederId: string;
    },
  ) {
    return this.feedersService.updateData(userId, catId, feederId);
  }
}
