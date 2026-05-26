import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum WithdrawMethod {
  ORANGE_MONEY = 'ORANGE_MONEY',
  MTN_MONEY = 'MTN_MONEY',
  BANK = 'BANK',
}

export class WithdrawDto {
  @ApiProperty({ description: 'Montant en FCFA', minimum: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  amount!: number;

  @ApiProperty({ enum: WithdrawMethod })
  @IsEnum(WithdrawMethod)
  method!: WithdrawMethod;

  @ApiProperty({ description: 'Numéro de téléphone ou IBAN selon le mode' })
  @IsString()
  @MaxLength(50)
  destination!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
