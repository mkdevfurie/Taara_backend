import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProfessionalDto {
  @ApiPropertyOptional({ type: [String], example: ['Électricien', 'Plombier'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  experience?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ type: [String], example: ['Lomé', 'Tsévié'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  serviceZone?: string[];

  @ApiPropertyOptional({ description: 'Tarif horaire en FCFA', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    description: 'Disponibilités : { mon: "09:00-18:00", tue: "…", … }',
    example: { mon: '09:00-18:00', tue: '09:00-18:00' },
  })
  @IsOptional()
  @IsObject()
  availability?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Personne qui peut se porter garante (privé)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guarantorName?: string;

  @ApiPropertyOptional({ description: 'Téléphone du garant (privé)' })
  @IsOptional()
  @IsString()
  @Matches(/^$|^\+?[0-9 ]{8,20}$/, { message: 'Numéro du garant invalide' })
  guarantorPhone?: string;
}
