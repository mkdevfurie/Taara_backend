import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchProfessionalsDto {
  @ApiPropertyOptional({ description: 'Spécialité (ex: Électricien)' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Ville / zone de service' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'Recherche full-text (nom, bio)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  // Query string : "false" doit donner false (Boolean("false") === true)
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return typeof raw === 'string' ? raw !== 'false' && raw !== '0' : raw;
  })
  @IsBoolean()
  verifiedOnly?: boolean = true;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage: number = 20;
}
