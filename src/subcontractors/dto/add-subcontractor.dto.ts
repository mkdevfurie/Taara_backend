import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class AddSubcontractorDto {
  @ApiProperty()
  @IsString()
  professionalId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  taskDescription!: string;

  @ApiProperty({ description: 'Budget alloué en FCFA', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quotedPrice!: number;
}

export class PaySubcontractorDto {
  @ApiProperty({ description: 'Montant final versé', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualPrice!: number;
}
