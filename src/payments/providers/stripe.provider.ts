import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface InitiateResult {
  transactionId: string;
  clientSecret?: string;
  redirectUrl?: string;
  status: 'pending' | 'completed' | 'failed';
}

@Injectable()
export class StripeProvider implements OnModuleInit {
  private readonly logger = new Logger(StripeProvider.name);
  private client?: Stripe;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      this.logger.warn('STRIPE_SECRET_KEY absent — Stripe désactivé (mode mock)');
      return;
    }
    this.client = new Stripe(key, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
    this.logger.log('Stripe configuré');
  }

  get isReady() {
    return !!this.client;
  }

  async createPaymentIntent(params: {
    amountFcfa: number;
    jobId: string;
    paymentId: string;
    clientEmail?: string;
  }): Promise<InitiateResult> {
    if (!this.client) {
      return {
        transactionId: `mock_pi_${params.paymentId}`,
        status: 'pending',
      };
    }
    // Stripe ne supporte pas XOF directement → on convertit en EUR (centimes).
    // 1 EUR ≈ 655.957 XOF (taux fixe BCEAO).
    const amountEurCents = Math.max(50, Math.round((params.amountFcfa / 655.957) * 100));
    const intent = await this.client.paymentIntents.create({
      amount: amountEurCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        jobId: params.jobId,
        paymentId: params.paymentId,
        amountFcfa: String(params.amountFcfa),
      },
      receipt_email: params.clientEmail,
    });
    return {
      transactionId: intent.id,
      clientSecret: intent.client_secret ?? undefined,
      status: 'pending',
    };
  }

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    if (!this.client) throw new Error('Stripe non configuré');
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.client.webhooks.constructEvent(payload, signature, secret);
  }
}
