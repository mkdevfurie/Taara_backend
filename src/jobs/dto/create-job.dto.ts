import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  diagnosticId!: string;

  @ApiProperty({ description: 'Pro ciblé pour le job' })
  @IsString()
  professionalId!: string;

  @ApiProperty({ description: 'Prix estimé par le client en FCFA', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedPrice!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
