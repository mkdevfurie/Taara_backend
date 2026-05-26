import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDiagnosticDto {
  @ApiProperty({ example: 'Mon alternateur fait du bruit et ne charge plus la batterie.' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  problemDescription!: string;

  @ApiPropertyOptional({ example: 'Électrique' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  problemType?: string;

  @ApiPropertyOptional({ description: 'URL Cloudinary déjà uploadée côté client (optionnel)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
