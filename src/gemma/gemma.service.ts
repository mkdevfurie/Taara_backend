import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GemmaDiagnosisRequest {
  description: string;
  imageUrl?: string;
  problemType?: string;
}

export interface GemmaDiagnosisResponse {
  problem: string;
  problemType: string;
  steps: string[];
  parts: { name: string; estimatedPrice?: number }[];
  confidence: number;
  rawResponse?: unknown;
}

/**
 * Service d'appel à Gemma. Si GEMMA_API_URL n'est pas configuré,
 * renvoie un mock déterministe (utile en dev / offline / tests).
 */
@Injectable()
export class GemmaService {
  private readonly logger = new Logger(GemmaService.name);

  constructor(private readonly config: ConfigService) {}

  async diagnose(input: GemmaDiagnosisRequest): Promise<GemmaDiagnosisResponse> {
    const url = this.config.get<string>('GEMMA_API_URL');
    const apiKey = this.config.get<string>('GEMMA_API_KEY');

    if (!url) {
      this.logger.debug('GEMMA_API_URL absent — réponse mock');
      return this.mockResponse(input);
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`Gemma API ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as Partial<GemmaDiagnosisResponse>;
      return {
        problem: data.problem ?? 'Analyse indisponible',
        problemType: data.problemType ?? input.problemType ?? 'Inconnu',
        steps: data.steps ?? [],
        parts: data.parts ?? [],
        confidence: data.confidence ?? 0.5,
        rawResponse: data,
      };
    } catch (e) {
      this.logger.error(`Gemma call failed: ${(e as Error).message}`);
      // Fallback gracieux
      return this.mockResponse(input);
    }
  }

  private mockResponse(input: GemmaDiagnosisRequest): GemmaDiagnosisResponse {
    const isElectric = /moteur|alternateur|g[eé]n[eé]rateur|electric/i.test(input.description);
    const isPump = /pompe|pump/i.test(input.description);
    const problemType = isElectric ? 'Électrique' : isPump ? 'Pompe' : (input.problemType ?? 'Mécanique');

    return {
      problem: `Probable défaut ${problemType.toLowerCase()} d'après la description.`,
      problemType,
      steps: [
        'Couper l\'alimentation / arrêter la machine.',
        'Inspecter visuellement les connexions et joints.',
        'Tester les composants principaux au multimètre.',
        'Remplacer la pièce défectueuse identifiée.',
        'Tester le redémarrage à vide avant remise en service.',
      ],
      parts: isElectric
        ? [
            { name: 'Condensateur de démarrage', estimatedPrice: 5500 },
            { name: 'Charbon moteur', estimatedPrice: 2000 },
          ]
        : isPump
        ? [
            { name: 'Joint torique pompe', estimatedPrice: 1500 },
            { name: 'Roue/impulseur', estimatedPrice: 8500 },
          ]
        : [{ name: 'Pièce générique', estimatedPrice: 3000 }],
      confidence: 0.62,
    };
  }
}
