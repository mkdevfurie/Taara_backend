import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JobStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeProvider } from './providers/stripe.provider';
import { MobileMoneyProvider } from './providers/mobile-money.provider';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly stripe: StripeProvider,
    private readonly mobileMoney: MobileMoneyProvider,
  ) {}

  // ---------------------------------------------------------- INITIATE
  async initiate(dto: InitiatePaymentDto, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      include: {
        jobRequest: { include: { client: { select: { email: true, phone: true } } } },
        professional: { select: { userId: true } },
      },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (job.jobRequest.clientId !== requester.id) {
      throw new ForbiddenException('Seul le client peut payer ce job');
    }
    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Le job doit être terminé avant paiement');
    }
    const amount = job.actualPrice ?? job.quotedPrice;
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant du job invalide');
    }

    const commissionRate = Number(this.config.get<string>('COMMISSION_RATE') ?? '0.10');
    const commission = Math.round(amount * commissionRate);
    const netAmount = amount - commission;

    const payment = await this.prisma.payment.create({
      data: {
        jobId: job.id,
        amount,
        commissionRate,
        commission,
        netAmount,
        method: dto.method,
        status: PaymentStatus.PENDING,
      },
    });

    let providerResult;
    if (dto.method === PaymentMethod.STRIPE) {
      providerResult = await this.stripe.createPaymentIntent({
        amountFcfa: amount,
        jobId: job.id,
        paymentId: payment.id,
        clientEmail: job.jobRequest.client.email,
      });
    } else if (
      dto.method === PaymentMethod.ORANGE_MONEY ||
      dto.method === PaymentMethod.MTN_MONEY
    ) {
      providerResult = await this.mobileMoney.initiate({
        method: dto.method,
        amountFcfa: amount,
        jobId: job.id,
        paymentId: payment.id,
        phone: job.jobRequest.client.phone,
      });
    } else if (dto.method === PaymentMethod.CASH) {
      providerResult = {
        transactionId: `cash_${payment.id}`,
        status: 'completed' as const,
      };
    } else {
      throw new BadRequestException('Méthode de paiement non supportée');
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        transactionId: providerResult.transactionId,
        metadata: {
          ...(providerResult.clientSecret ? { clientSecret: providerResult.clientSecret } : {}),
          ...(providerResult.redirectUrl ? { redirectUrl: providerResult.redirectUrl } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    // Pour le mode CASH, on finalise immédiatement
    if (dto.method === PaymentMethod.CASH) {
      await this.markCompleted(payment.id);
    }

    return {
      paymentId: payment.id,
      method: dto.method,
      amount,
      commission,
      netAmount,
      status: providerResult.status,
      clientSecret: providerResult.clientSecret,
      redirectUrl: providerResult.redirectUrl,
      transactionId: providerResult.transactionId,
    };
  }

  // ---------------------------------------------------------- STATUS
  async getStatus(id: string, requester: JwtUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            jobRequest: { select: { clientId: true } },
            professional: { select: { userId: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (
      requester.userType !== 'ADMIN' &&
      payment.job.jobRequest.clientId !== requester.id &&
      payment.job.professional.userId !== requester.id
    ) {
      throw new ForbiddenException('Accès refusé');
    }
    return {
      id: payment.id,
      amount: payment.amount,
      commission: payment.commission,
      netAmount: payment.netAmount,
      status: payment.status,
      method: payment.method,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    };
  }

  // ---------------------------------------------------------- WEBHOOK / CALLBACK
  /**
   * Marque un paiement comme COMPLETED et crédite le wallet du pro.
   * Idempotent : si déjà completed, no-op.
   */
  async markCompleted(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        job: { include: { professional: { select: { userId: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status === PaymentStatus.COMPLETED) return payment;

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.COMPLETED, completedAt: new Date() },
    });

    await this.wallet.creditFromPayment({
      proUserId: payment.job.professional.userId,
      netAmount: payment.netAmount,
      paymentId: payment.id,
      jobId: payment.jobId,
    });

    await this.notifications.create({
      userId: payment.job.professional.userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Paiement reçu',
      message: `Vous avez reçu ${payment.netAmount} FCFA (après commission).`,
      link: `/jobs/${payment.jobId}`,
      data: { paymentId: payment.id, netAmount: payment.netAmount },
    });

    return payment;
  }

  async markFailed(paymentId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status === PaymentStatus.FAILED) return payment;
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        metadata: {
          ...((payment.metadata as Record<string, unknown> | null) ?? {}),
          failureReason: reason ?? 'unknown',
        } as Prisma.InputJsonValue,
      },
    });
  }

  // ---------------------------------------------------------- STRIPE WEBHOOK
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.verifyWebhookSignature(rawBody, signature);
    this.logger.debug(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as { id: string; metadata: { paymentId?: string } };
        const paymentId = intent.metadata.paymentId;
        if (paymentId) await this.markCompleted(paymentId);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as { id: string; metadata: { paymentId?: string } };
        const paymentId = intent.metadata.paymentId;
        if (paymentId) await this.markFailed(paymentId, 'stripe:payment_failed');
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  async handleMobileMoneyCallback(payload: unknown) {
    const result = this.mobileMoney.verifyCallback(payload);
    if (!result) throw new BadRequestException('Payload invalide');
    if (result.status === 'completed') return this.markCompleted(result.paymentId);
    return this.markFailed(result.paymentId, 'mobile-money:declined');
  }
}
