import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GenerateDto } from './dto/generate.dto';

const MAX_OUTPUT_TOKENS = 4096;
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(dto: GenerateDto) {
    const key = this.config.get<string>('GEMINI_API_KEY');
    if (!key) throw new ServiceUnavailableException('IA non configurée sur le serveur');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemma-4-26b-a4b-it';

    // On ne relaie que du texte et des images, avec une taille bornée
    let inlineBytes = 0;
    const contents = dto.contents.map((c) => {
      const parts = Array.isArray(c.parts) ? (c.parts as Record<string, unknown>[]) : [];
      return {
        parts: parts.slice(0, 4).map((p) => {
          if (typeof p.text === 'string') return { text: p.text.slice(0, 8000) };
          const inline = p.inline_data as { mime_type?: string; data?: string } | undefined;
          if (
            inline &&
            /^image\/(png|jpe?g|webp)$/.test(inline.mime_type ?? '') &&
            typeof inline.data === 'string'
          ) {
            inlineBytes += (inline.data.length * 3) / 4;
            return { inline_data: { mime_type: inline.mime_type, data: inline.data } };
          }
          throw new BadRequestException('Contenu non supporté');
        }),
      };
    });
    if (inlineBytes > MAX_INLINE_BYTES)
      throw new BadRequestException('Image trop lourde (8 Mo max)');

    const cfg = dto.generationConfig ?? {};
    const generationConfig = {
      temperature:
        typeof cfg.temperature === 'number' ? Math.min(Math.max(cfg.temperature, 0), 1) : 0.2,
      maxOutputTokens: Math.min(
        Number(cfg.maxOutputTokens) || MAX_OUTPUT_TOKENS,
        MAX_OUTPUT_TOKENS,
      ),
    };

    const safetySettings = (dto.safetySettings ?? [])
      .filter(
        (s) =>
          /^HARM_CATEGORY_[A-Z_]+$/.test(s.category ?? '') &&
          /^BLOCK_[A-Z_]+$/.test(s.threshold ?? ''),
      )
      .map((s) => ({ category: s.category, threshold: s.threshold }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents,
          generationConfig,
          ...(safetySettings.length ? { safetySettings } : {}),
        }),
        signal: AbortSignal.timeout(90_000),
      },
    ).catch((e: Error) => {
      this.logger.error(`Gemini injoignable : ${e.message}`);
      throw new BadGatewayException('Service IA injoignable');
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(`Gemini ${res.status} : ${JSON.stringify(body).slice(0, 300)}`);
      throw new BadGatewayException(
        res.status === 429 ? 'Quota IA atteint, réessayez plus tard' : 'Erreur du service IA',
      );
    }
    return body;
  }
}
