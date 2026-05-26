import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import * as crypto from 'node:crypto';

import type { InitiateResult } from './stripe.provider';

/**
 * Stub Mobile Money. À remplacer par les vraies APIs Orange Money et MTN MoMo
 * (Phase 4.5 — nécessite comptes marchands).
 *
 * Pour Orange Money Web Payment :
 *   POST https://api.orange.com/orange-money-webpay/dev/v1/webpayment
 *
 * Pour MTN MoMo Collection :
 *   POST https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay
 */
@Injectable()
export class MobileMoneyProvider {
  private readonly logger = new Logger(MobileMoneyProvider.name);

  async initiate(params: {
    method: PaymentMethod;
    amountFcfa: number;
    jobId: string;
    paymentId: string;
    phone?: string;
  }): Promise<InitiateResult> {
    this.logger.warn(
      `Mobile Money STUB (${params.method}): ${params.amountFcfa} FCFA → ${params.phone ?? '???'}`,
    );
    // Génère une transaction "réussie" en dev pour permettre les tests end-to-end.
    return {
      transactionId: `mm_${params.method}_${crypto.randomUUID()}`,
      status: 'pending',
      // En vrai : retour de l'URL de paiement pour le client
      redirectUrl: `https://example-momo.test/pay?ref=${params.paymentId}`,
    };
  }

  /**
   * Validation du callback du provider Mobile Money.
   * Ici on accepte tout en dev — à remplacer par la vraie vérification de signature.
   */
  verifyCallback(payload: unknown): { paymentId: string; status: 'completed' | 'failed' } | null {
    if (typeof payload !== 'object' || !payload) return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.paymentId !== 'string' || typeof p.status !== 'string') return null;
    if (p.status !== 'completed' && p.status !== 'failed') return null;
    return { paymentId: p.paymentId, status: p.status };
  }
}
