import {
  IsEmail,
  IsMACAddress,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';
import { CreateFeederDto } from './create-feeder.dto.js';

export class CreateFeederExtendDto extends CreateFeederDto {
  @IsNotEmpty()
  @IsEmail()
  userEmail: string;

  @IsNotEmpty()
  @IsMACAddress()
  bleMacAddress: string;

  @IsNotEmpty()
  @IsUUID()
  catId: string;
}
