import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsOptional } from 'class-validator';

/** Même structure que `contents` / `generationConfig` de l'API Gemini. */
export class GenerateDto {
  @ApiProperty({ description: 'Liste de contenus { parts: [{ text } | { inline_data }] }' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  contents!: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  generationConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Réglages de sécurité Gemini (catégorie + seuil)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  safetySettings?: { category?: string; threshold?: string }[];
}
