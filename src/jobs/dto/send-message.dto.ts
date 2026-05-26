import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  @ApiPropertyOptional({ description: 'URL Cloudinary déjà uploadée (optionnel)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
