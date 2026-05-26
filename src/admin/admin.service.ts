import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, PaymentStatus, Prisma, UserType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async listUsers(opts: { q?: string; userType?: UserType; page?: number; perPage?: number } = {}) {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 30;
    const where: Prisma.UserWhereInput = {
      ...(opts.userType ? { userType: opts.userType } : {}),
      ...(opts.q
        ? {
            OR: [
              { email: { contains: opts.q, mode: 'insensitive' } },
              { firstName: { contains: opts.q, mode: 'insensitive' } },
              { lastName: { contains: opts.q, mode: 'insensitive' } },
              { phone: { contains: opts.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          userType: true,
          isVerified: true,
          isBanned: true,
          profileImage: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  async listProfessionals(opts: { verifiedOnly?: boolean; page?: number; perPage?: number } = {}) {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 30;
    const where: Prisma.ProfessionalWhereInput = opts.verifiedOnly === undefined
      ? {}
      : { isVerified: opts.verifiedOnly };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.professional.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, isBanned: true },
          },
        },
      }),
      this.prisma.professional.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  async listJobs(opts: { status?: JobStatus; page?: number; perPage?: number } = {}) {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 30;
    const where: Prisma.JobWhereInput = opts.status ? { status: opts.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          jobRequest: {
            include: { client: { select: { id: true, firstName: true, lastName: true } } },
          },
          professional: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
          diagnostic: { select: { id: true, problemType: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  async getReports() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      clients,
      pros,
      verifiedPros,
      jobsTotal,
      jobsCompleted,
      jobsActive,
      diagnostics30d,
      monthlyRevenue,
      monthlyCommission,
      lifetimeCommission,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userType: UserType.CLIENT } }),
      this.prisma.user.count({ where: { userType: UserType.PRO } }),
      this.prisma.professional.count({ where: { isVerified: true } }),
      this.prisma.job.count(),
      this.prisma.job.count({ where: { status: JobStatus.COMPLETED } }),
      this.prisma.job.count({
        where: { status: { in: [JobStatus.ACCEPTED, JobStatus.IN_PROGRESS] } },
      }),
      this.prisma.diagnostic.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.COMPLETED,
          completedAt: { gte: startOfMonth },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { commission: true },
        where: {
          status: PaymentStatus.COMPLETED,
          completedAt: { gte: startOfMonth },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { commission: true },
        where: { status: PaymentStatus.COMPLETED },
      }),
    ]);

    return {
      users: { total: usersTotal, clients, pros, verifiedPros },
      jobs: { total: jobsTotal, completed: jobsCompleted, active: jobsActive },
      diagnostics: { last30Days: diagnostics30d },
      revenue: {
        monthlyGross: monthlyRevenue._sum.amount ?? 0,
        monthlyCommission: monthlyCommission._sum.commission ?? 0,
        lifetimeCommission: lifetimeCommission._sum.commission ?? 0,
        currency: 'XOF',
      },
    };
  }

  async banUser(id: string, banned = true) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.userType === UserType.ADMIN) {
      throw new NotFoundException('Impossible de bannir un admin');
    }
    return this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isBanned: banned } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async approveWithdrawal(transactionId: string) {
    return this.wallet.approveWithdrawal(transactionId);
  }

  async listPendingWithdrawals() {
    return this.prisma.walletTransaction.findMany({
      where: { type: 'withdrawal', status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: { wallet: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } } } } },
    });
  }
}
