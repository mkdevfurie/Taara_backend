import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Mot de passe actuel, pour confirmer la suppression' })
  @IsString()
  @MinLength(1)
  password!: string;
}
