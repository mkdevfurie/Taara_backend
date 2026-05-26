import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'koffi@taara.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+22890123456', description: 'Format E.164' })
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'Numéro invalide (format E.164)' })
  phone!: string;

  @ApiProperty({ example: 'Koffi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Mensah' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ required: false, description: 'CLIENT par défaut. PRO crée aussi une fiche.' })
  @IsOptional()
  @IsString()
  userType?: 'CLIENT' | 'PRO';
}
