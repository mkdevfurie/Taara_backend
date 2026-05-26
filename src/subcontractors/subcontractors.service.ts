import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, NotificationType, UserType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { AddSubcontractorDto, PaySubcontractorDto } from './dto/add-subcontractor.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class SubcontractorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
  ) {}

  async add(jobId: string, dto: AddSubcontractorDto, requester: JwtUser) {
    const job = await this.assertMainPro(jobId, requester);
    const sub = await this.prisma.professional.findUnique({
      where: { id: dto.professionalId },
      include: { user: { select: { id: true } } },
    });
    if (!sub) throw new NotFoundException('Sous-traitant introuvable');
    if (sub.id === job.professionalId) {
      throw new BadRequestException('Un pro ne peut pas se sous-traiter à lui-même');
    }

    const created = await this.prisma.subContractor.create({
      data: {
        mainJobId: job.id,
        professionalId: sub.id,
        taskDescription: dto.taskDescription,
        quotedPrice: dto.quotedPrice,
      },
    });

    await this.notifications.create({
      userId: sub.user.id,
      type: NotificationType.NEW_JOB,
      title: 'Mission de sous-traitance',
      message: dto.taskDescription.slice(0, 120),
      link: `/jobs/${job.id}`,
      data: { jobId: job.id, subcontractorId: created.id, quotedPrice: dto.quotedPrice },
    });
    return created;
  }

  async list(jobId: string, requester: JwtUser) {
    await this.assertParticipant(jobId, requester);
    return this.prisma.subContractor.findMany({
      where: { mainJobId: jobId },
      include: {
        professional: {
          include: { user: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async accept(id: string, requester: JwtUser) {
    const sub = await this.prisma.subContractor.findUnique({
      where: { id },
      include: { professional: { select: { userId: true } } },
    });
    if (!sub) throw new NotFoundException('Sous-traitance introuvable');
    if (sub.professional.userId !== requester.id && requester.userType !== UserType.ADMIN) {
      throw new ForbiddenException('Seul le sous-traitant peut accepter');
    }
    if (sub.status !== JobStatus.PENDING) {
      throw new BadRequestException(`Statut invalide : ${sub.status}`);
    }
    return this.prisma.subContractor.update({
      where: { id },
      data: { status: JobStatus.ACCEPTED },
    });
  }

  async pay(id: string, dto: PaySubcontractorDto, requester: JwtUser) {
    const sub = await this.prisma.subContractor.findUnique({
      where: { id },
      include: {
        mainJob: { include: { professional: { select: { userId: true } } } },
        professional: { select: { userId: true } },
      },
    });
    if (!sub) throw new NotFoundException('Sous-traitance introuvable');
    if (
      sub.mainJob.professional.userId !== requester.id &&
      requester.userType !== UserType.ADMIN
    ) {
      throw new ForbiddenException('Seul le pro principal peut payer');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subContractor.update({
        where: { id },
        data: {
          status: JobStatus.COMPLETED,
          actualPrice: dto.actualPrice,
          completedAt: new Date(),
        },
      });
      // Crédite le wallet du sous-traitant directement
      await this.wallet.creditFromPayment({
        proUserId: sub.professional.userId,
        netAmount: dto.actualPrice,
        paymentId: `sub_${sub.id}`,
        jobId: sub.mainJobId,
      });
      return updated;
    });
  }

  // ---------- helpers
  private async assertMainPro(jobId: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { professional: { select: { userId: true } } },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (requester.userType !== UserType.ADMIN && job.professional.userId !== requester.id) {
      throw new ForbiddenException('Seul le pro assigné peut gérer les sous-traitants');
    }
    return job;
  }

  private async assertParticipant(jobId: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        jobRequest: { select: { clientId: true } },
        professional: { select: { userId: true } },
      },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (
      requester.userType !== UserType.ADMIN &&
      job.professional.userId !== requester.id &&
      job.jobRequest.clientId !== requester.id
    ) {
      throw new ForbiddenException('Accès refusé');
    }
    return job;
  }
}
