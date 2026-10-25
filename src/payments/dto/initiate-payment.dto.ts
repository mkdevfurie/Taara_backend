import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export const DIRECT_CHANNELS = ['CASH', 'T_MONEY', 'FLOOZ'] as const;
export type DirectChannel = (typeof DIRECT_CHANNELS)[number];

export class InitiatePaymentDto {
  @ApiProperty()
  @IsString()
  jobId!: string;

  @ApiProperty({
    enum: PaymentMethod,
    description:
      'CASH = paiement direct au pro (seul mode actif tant que le paiement en ligne est désactivé)',
  })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    enum: DIRECT_CHANNELS,
    description: 'Pour un paiement direct : moyen utilisé entre le client et le pro',
  })
  @IsOptional()
  @IsIn(DIRECT_CHANNELS)
  channel?: DirectChannel;
}
