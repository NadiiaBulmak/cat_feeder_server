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

//   id           String      @id @default(uuid())
//   name         String
//   deviceId     String      @unique // Ідентифікатор для ESP8266 (напр. 'esp8266-feeder-01')
//
//   desiredState FeederState @default(CLOSED)
//   actualState  FeederState @default(CLOSED)
//
//   lastPing     DateTime    @default(now())
//   createdAt    DateTime    @default(now())
//   updatedAt    DateTime    @updatedAt
//
//   logs         AccessLog[]
//   history      FeederStateHistory[]
