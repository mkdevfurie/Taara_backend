import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'koffi@taara.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
