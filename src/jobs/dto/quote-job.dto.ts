import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AcceptJobDto {
  @ApiProperty({ description: 'Prix proposé par le pro en FCFA', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quotedPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DeclineJobDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CompleteJobDto {
  @ApiProperty({ description: 'Prix final facturé', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualPrice!: number;

  @ApiPropertyOptional({ description: 'URL Cloudinary de la preuve de complétion' })
  @IsOptional()
  @IsString()
  completionProof?: string;
}
