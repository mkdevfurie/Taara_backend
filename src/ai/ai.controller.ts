import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AiService } from './ai.service';
import { GenerateDto } from './dto/generate.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('ai')
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Relais vers Gemma 4 (API Gemini) : la clé reste sur le serveur.
   * Public (le diagnostic marche sans compte) mais limité par IP.
   */
  @Public()
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'Diagnostic IA (relais Gemma 4, même format que generateContent)' })
  generate(@Body() dto: GenerateDto) {
    return this.ai.generate(dto);
  }
}
