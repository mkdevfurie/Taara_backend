import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Prisma, SubscriptionChannel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'none';

/**
 * Abonnements des pros. Modèle économique : le client paie le pro en direct,
 * TAARA se rémunère par l'abonnement mensuel des pros (payé par Mobile Money
 * au numéro TAARA, puis activé à la main par un admin).
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Infos publiques affichées dans l'app (prix, numéros de paiement). */
  getPlans() {
    return {
      monthlyPrice: this.monthlyPrice,
      currency: 'XOF',
      trialMonths: this.trialMonths,
      paymentNumbers: {
        tMoney: this.config.get<string>('SUBSCRIPTION_TMONEY_NUMBER') || null,
        flooz: this.config.get<string>('SUBSCRIPTION_FLOOZ_NUMBER') || null,
      },
    };
  }

  /** Filtre Prisma : pros dont l'abonnement (ou l'essai) est en cours. */
  activeWhere(now = new Date()): Prisma.ProfessionalWhereInput {
    return { subscriptionEndsAt: { gt: now } };
  }

  isActive(pro: { subscriptionEndsAt: Date | null }, now = new Date()) {
    return !!pro.subscriptionEndsAt && pro.subscriptionEndsAt > now;
  }

  /** Données à fusionner dans `professional.create` pour offrir l'essai gratuit. */
  trialCreateData(now = new Date()) {
    const months = this.trialMonths;
    if (months <= 0) return {};
    const endsAt = addMonths(now, months);
    return {
      subscriptionEndsAt: endsAt,
      subscriptions: {
        create: {
          months,
          amount: 0,
          channel: SubscriptionChannel.TRIAL,
          note: 'Essai gratuit',
          startsAt: now,
          endsAt,
        },
      },
    } satisfies Partial<Prisma.ProfessionalCreateWithoutUserInput>;
  }

  async getMine(userId: string) {
    const pro = await this.prisma.professional.findUnique({
      where: { userId },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 12 } },
    });
    if (!pro) throw new NotFoundException("Ce compte n'a pas de fiche professionnel");
    return {
      status: this.status(pro),
      endsAt: pro.subscriptionEndsAt,
      history: pro.subscriptions,
      plans: this.getPlans(),
    };
  }

  /** Activation / prolongation par un admin après réception du paiement. */
  async activate(professionalId: string, dto: ActivateSubscriptionDto, adminId: string) {
    if (dto.channel === SubscriptionChannel.TRIAL && (dto.amount ?? 0) > 0) {
      throw new BadRequestException('Un essai gratuit ne peut pas avoir de montant');
    }
    const pro = await this.prisma.professional.findUnique({ where: { id: professionalId } });
    if (!pro) throw new NotFoundException('Professionnel introuvable');

    const now = new Date();
    // On prolonge à partir de la fin actuelle si l'abonnement court encore
    const startsAt = this.isActive(pro, now) ? pro.subscriptionEndsAt! : now;
    const endsAt = addMonths(startsAt, dto.months);
    const amount =
      dto.amount ??
      (dto.channel === SubscriptionChannel.TRIAL ? 0 : this.monthlyPrice * dto.months);

    const [subscription] = await this.prisma.$transaction([
      this.prisma.subscription.create({
        data: {
          professionalId,
          months: dto.months,
          amount,
          channel: dto.channel,
          reference: dto.reference,
          note: dto.note,
          startsAt,
          endsAt,
          activatedById: adminId,
        },
      }),
      this.prisma.professional.update({
        where: { id: professionalId },
        data: { subscriptionEndsAt: endsAt },
      }),
    ]);

    await this.notifications.create({
      userId: pro.userId,
      type: NotificationType.SUBSCRIPTION_UPDATED,
      title: 'Abonnement activé',
      message: `Votre abonnement TAARA est actif jusqu'au ${endsAt.toLocaleDateString('fr-FR')}.`,
      data: { subscriptionId: subscription.id, endsAt: endsAt.toISOString() },
    });
    return { ...subscription, subscriptionEndsAt: endsAt };
  }

  /** Liste admin des pros avec leur statut d'abonnement. */
  async list(opts: { status?: SubscriptionStatus; q?: string; page: number; perPage: number }) {
    const now = new Date();
    const where: Prisma.ProfessionalWhereInput = {
      ...(opts.status === 'expired' ? { subscriptionEndsAt: { lte: now } } : {}),
      ...(opts.status === 'none' ? { subscriptionEndsAt: null } : {}),
      ...(opts.status === 'active' || opts.status === 'trial' ? this.activeWhere(now) : {}),
      ...(opts.q
        ? {
            user: {
              OR: [
                { firstName: { contains: opts.q, mode: 'insensitive' } },
                { lastName: { contains: opts.q, mode: 'insensitive' } },
                { email: { contains: opts.q, mode: 'insensitive' } },
                { phone: { contains: opts.q } },
              ],
            },
          }
        : {}),
    };
    const pros = await this.prisma.professional.findMany({
      where,
      orderBy: [{ subscriptionEndsAt: { sort: 'asc', nulls: 'first' } }],
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const withStatus = pros
      .map((p) => ({ ...p, subscriptionStatus: this.status(p, now) }))
      .filter((p) => !opts.status || p.subscriptionStatus === opts.status);
    const start = (opts.page - 1) * opts.perPage;
    return {
      items: withStatus.slice(start, start + opts.perPage),
      page: opts.page,
      perPage: opts.perPage,
      total: withStatus.length,
    };
  }

  /** Chiffres pour le dashboard admin. */
  async stats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [active, expired, monthly, lifetime, paidActive] = await this.prisma.$transaction([
      this.prisma.professional.count({ where: this.activeWhere(now) }),
      this.prisma.professional.count({ where: { subscriptionEndsAt: { lte: now } } }),
      this.prisma.subscription.aggregate({
        where: { createdAt: { gte: monthStart }, channel: { not: SubscriptionChannel.TRIAL } },
        _sum: { amount: true },
      }),
      this.prisma.subscription.aggregate({
        where: { channel: { not: SubscriptionChannel.TRIAL } },
        _sum: { amount: true },
      }),
      this.prisma.subscription.findMany({
        where: { endsAt: { gt: now }, channel: { not: SubscriptionChannel.TRIAL } },
        select: { professionalId: true },
        distinct: ['professionalId'],
      }),
    ]);
    return {
      active,
      paying: paidActive.length,
      trial: Math.max(active - paidActive.length, 0),
      expired,
      monthlyRevenue: monthly._sum.amount ?? 0,
      lifetimeRevenue: lifetime._sum.amount ?? 0,
      monthlyPrice: this.monthlyPrice,
      currency: 'XOF',
    };
  }

  // ---------- helpers

  private status(
    pro: {
      subscriptionEndsAt: Date | null;
      subscriptions?: { channel: SubscriptionChannel; endsAt: Date }[];
    },
    now = new Date(),
  ): SubscriptionStatus {
    if (!pro.subscriptionEndsAt) return 'none';
    if (pro.subscriptionEndsAt <= now) return 'expired';
    // Essai si la période en cours n'est couverte que par l'essai gratuit
    const last = pro.subscriptions?.[0];
    return last && last.channel === SubscriptionChannel.TRIAL ? 'trial' : 'active';
  }

  private get monthlyPrice() {
    return Number(this.config.get<string>('SUBSCRIPTION_MONTHLY_PRICE') ?? '5000');
  }

  private get trialMonths() {
    return Number(this.config.get<string>('PRO_TRIAL_MONTHS') ?? '3');
  }
}

/** Ajoute des mois en restant sur le dernier jour si besoin (31 janv. + 1 = 28/29 févr.). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
