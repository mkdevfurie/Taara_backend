import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, NotificationType, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeProvider } from './providers/stripe.provider';
import { MobileMoneyProvider } from './providers/mobile-money.provider';
import { InitiatePaymentDto, type DirectChannel } from './dto/initiate-payment.dto';
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
    const alreadyPaid = await this.prisma.payment.findFirst({
      where: { jobId: job.id, status: PaymentStatus.COMPLETED },
      select: { id: true },
    });
    if (alreadyPaid) throw new ConflictException('Ce job a déjà été payé');

    // Modèle actuel : le client paie le pro en direct. TAARA n'encaisse rien,
    // on enregistre seulement la déclaration — sans commission ni crédit du
    // portefeuille (sinon le pro pourrait « retirer » un argent jamais reçu).
    if (dto.method === PaymentMethod.CASH) {
      return this.recordDirectPayment(job, amount, dto.channel ?? 'CASH');
    }
    if (dto.method === PaymentMethod.STRIPE && !this.stripe.isReady) {
      throw new BadRequestException(
        'Paiement par carte indisponible : payez le réparateur directement.',
      );
    }
    if (dto.method === PaymentMethod.ORANGE_MONEY || dto.method === PaymentMethod.MTN_MONEY) {
      throw new BadRequestException(
        "Paiement Mobile Money dans l'app pas encore disponible : payez le réparateur directement.",
      );
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

  private async recordDirectPayment(
    job: { id: string; professional: { userId: string } },
    amount: number,
    channel: DirectChannel,
  ) {
    const now = new Date();
    const payment = await this.prisma.payment.create({
      data: {
        jobId: job.id,
        amount,
        commissionRate: 0,
        commission: 0,
        netAmount: amount,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        completedAt: now,
        metadata: { direct: true, channel } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { transactionId: `direct_${payment.id}` },
    });
    const label =
      channel === 'CASH' ? 'en espèces' : channel === 'T_MONEY' ? 'par T-Money' : 'par Flooz';
    await this.notifications.create({
      userId: job.professional.userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Paiement déclaré',
      message: `Le client indique vous avoir payé ${amount} FCFA ${label}.`,
      link: `/jobs/${job.id}`,
      data: { paymentId: payment.id, amount, channel },
    });
    return {
      paymentId: payment.id,
      method: PaymentMethod.CASH,
      channel,
      amount,
      commission: 0,
      netAmount: amount,
      status: 'completed' as const,
      transactionId: `direct_${payment.id}`,
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
    // Le provider Mobile Money est un stub qui n'authentifie pas l'appelant :
    // tant qu'il n'est pas branché, ce webhook public ne doit rien valider.
    if (this.config.get<string>('MOBILE_MONEY_WEBHOOK_ENABLED') !== 'true') {
      throw new BadRequestException('Mobile Money non activé');
    }
    const result = this.mobileMoney.verifyCallback(payload);
    if (!result) throw new BadRequestException('Payload invalide');
    if (result.status === 'completed') return this.markCompleted(result.paymentId);
    return this.markFailed(result.paymentId, 'mobile-money:declined');
  }
}
