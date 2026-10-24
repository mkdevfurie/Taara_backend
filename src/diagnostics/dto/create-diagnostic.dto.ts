import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      "Diagnostic déjà calculé sur l'appareil (app mobile, Gemma on-device / cache). " +
      "S'il est fourni, le backend ne rappelle pas Gemma. En multipart, envoyer une chaîne JSON.",
    example: { objectName: 'Alternateur', problem: '…', steps: ['…'], parts: ['…'] },
  })
  @IsOptional()
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  })
  @IsObject()
  aiDiagnosis?: Record<string, unknown>;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, description: 'Confiance du diagnostic fourni' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
