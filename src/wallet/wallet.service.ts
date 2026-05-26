import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WithdrawDto } from './dto/withdraw.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(requester: JwtUser) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId: requester.id } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId: requester.id } });
    }
    return wallet;
  }

  async listTransactions(
    requester: JwtUser,
    opts: { page?: number; perPage?: number; type?: string } = {},
  ) {
    const wallet = await this.getMine(requester);
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 30;
    const where: Prisma.WalletTransactionWhereInput = {
      walletId: wallet.id,
      ...(opts.type ? { type: opts.type } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { items, page, perPage, total };
  }

  async requestWithdraw(dto: WithdrawDto, requester: JwtUser) {
    const wallet = await this.getMine(requester);
    if (wallet.balance < dto.amount) {
      throw new BadRequestException('Solde insuffisant');
    }
    // Création d'une transaction en attente. Le traitement réel (paiement Mobile Money / bank)
    // se fait via un worker / cron — mock ici (PENDING -> à traiter manuellement par l'admin Phase 5).
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: dto.amount } },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: -dto.amount,
          type: 'withdrawal',
          status: PaymentStatus.PENDING,
          description: `Retrait ${dto.method} vers ${dto.destination}${dto.note ? ` — ${dto.note}` : ''}`,
        },
      });
      return { wallet: updated, transaction: txn };
    });
  }

  /**
   * Crédite le wallet du pro après paiement client (commission déjà déduite).
   */
  async creditFromPayment(params: {
    proUserId: string;
    netAmount: number;
    paymentId: string;
    jobId: string;
  }) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId: params.proUserId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId: params.proUserId } });
    }
    return this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: params.netAmount },
          totalEarned: { increment: params.netAmount },
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: params.netAmount,
          type: 'credit',
          reference: params.paymentId,
          description: `Paiement reçu pour le job ${params.jobId}`,
          status: PaymentStatus.COMPLETED,
        },
      }),
    ]);
  }

  /**
   * Endpoint admin pour valider un retrait.
   */
  async approveWithdrawal(transactionId: string) {
    const tx = await this.prisma.walletTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction introuvable');
    if (tx.type !== 'withdrawal' || tx.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Transaction non éligible');
    }
    return this.prisma.walletTransaction.update({
      where: { id: transactionId },
      data: { status: PaymentStatus.COMPLETED },
    });
  }
}
