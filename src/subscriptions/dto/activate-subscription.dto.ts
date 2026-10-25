import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ActivateSubscriptionDto {
  @ApiProperty({ minimum: 1, maximum: 24, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months!: number;

  @ApiProperty({ enum: SubscriptionChannel, example: SubscriptionChannel.T_MONEY })
  @IsEnum(SubscriptionChannel)
  channel!: SubscriptionChannel;

  @ApiPropertyOptional({ description: 'Montant reçu (FCFA). Défaut : prix mensuel × mois' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'N° de transaction Mobile Money' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
