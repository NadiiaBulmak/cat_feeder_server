import { FeederState } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFeederDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsEnum(FeederState)
  desiredState: FeederState;

  @IsOptional()
  @IsEnum(FeederState)
  actualState: FeederState;

  @IsOptional()
  lastPing?: Date;

  @IsOptional()
  createdAt?: Date;

  @IsOptional()
  updatedAt?: Date;
}
