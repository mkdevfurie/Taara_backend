import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, NotificationType, PaymentStatus, UserType, type Job } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PRIVATE_PRO_FIELDS } from '../professionals/private-fields';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobDto } from './dto/create-job.dto';
import { AcceptJobDto, CompleteJobDto, DeclineJobDto } from './dto/quote-job.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------------------------------------------------------- CREATE
  async create(dto: CreateJobDto, requester: JwtUser): Promise<Job> {
    const [diagnostic, pro] = await Promise.all([
      this.prisma.diagnostic.findUnique({ where: { id: dto.diagnosticId } }),
      this.prisma.professional.findUnique({
        where: { id: dto.professionalId },
        include: { user: { select: { id: true, isBanned: true } } },
      }),
    ]);
    if (!diagnostic) throw new NotFoundException('Diagnostic introuvable');
    if (diagnostic.userId !== requester.id) {
      throw new ForbiddenException('Ce diagnostic ne vous appartient pas');
    }
    if (!pro || pro.user.isBanned || !this.subscriptions.isActive(pro)) {
      throw new NotFoundException('Professionnel indisponible');
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const jobRequest = await tx.jobRequest.create({
        data: {
          diagnosticId: diagnostic.id,
          clientId: requester.id,
          estimatedPrice: dto.estimatedPrice,
          description: dto.description,
          status: JobStatus.PENDING,
        },
      });
      return tx.job.create({
        data: {
          jobRequestId: jobRequest.id,
          professionalId: pro.id,
          diagnosticId: diagnostic.id,
          quotedPrice: dto.estimatedPrice,
          description: dto.description,
          status: JobStatus.PENDING,
        },
      });
    });

    await this.notifications.create({
      userId: pro.user.id,
      type: NotificationType.NEW_JOB,
      title: 'Nouvelle demande de job',
      message: `Vous avez reçu une nouvelle demande pour un diagnostic ${diagnostic.problemType}.`,
      link: `/jobs/${job.id}`,
      data: { jobId: job.id, diagnosticId: diagnostic.id },
    });
    await this.emitJobUpdate(job.id);

    return job;
  }

  // ---------------------------------------------------------- READ
  async getById(id: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        jobRequest: {
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                phone: true,
              },
            },
          },
        },
        professional: {
          omit: PRIVATE_PRO_FIELDS,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                phone: true,
              },
            },
          },
        },
        diagnostic: true,
        rating: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    await this.assertCanRead(job, requester);
    return job;
  }

  async myRequests(requester: JwtUser, status?: JobStatus) {
    return this.prisma.job.findMany({
      where: {
        jobRequest: { clientId: requester.id },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        professional: {
          omit: PRIVATE_PRO_FIELDS,
          include: { user: { select: { firstName: true, lastName: true, profileImage: true } } },
        },
        diagnostic: { select: { id: true, problemType: true, imageUrl: true } },
        rating: { select: { score: true, comment: true } },
        payments: {
          where: { status: PaymentStatus.COMPLETED },
          select: { id: true, method: true },
        },
      },
    });
  }

  async myAssigned(requester: JwtUser, status?: JobStatus) {
    const pro = await this.prisma.professional.findUnique({ where: { userId: requester.id } });
    if (!pro) return [];
    return this.prisma.job.findMany({
      where: { professionalId: pro.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        jobRequest: {
          include: { client: { select: { firstName: true, lastName: true, profileImage: true } } },
        },
        diagnostic: { select: { id: true, problemType: true, imageUrl: true } },
      },
    });
  }

  // ---------------------------------------------------------- STATE TRANSITIONS

  async accept(id: string, dto: AcceptJobDto, requester: JwtUser) {
    const job = await this.assertProRole(id, requester);
    if (job.status !== JobStatus.PENDING) {
      throw new BadRequestException(`Impossible d'accepter un job ${job.status}`);
    }
    const updated = await this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.ACCEPTED,
        quotedPrice: dto.quotedPrice,
        acceptedAt: new Date(),
      },
    });
    await this.prisma.jobRequest.update({
      where: { id: job.jobRequestId },
      data: { status: JobStatus.ACCEPTED },
    });
    await this.notifications.create({
      userId: (await this.prisma.jobRequest.findUnique({ where: { id: job.jobRequestId } }))!
        .clientId,
      type: NotificationType.JOB_ACCEPTED,
      title: 'Votre demande a été acceptée',
      message: `Le pro propose ${dto.quotedPrice} FCFA pour votre demande.`,
      link: `/jobs/${id}`,
      data: { jobId: id, quotedPrice: dto.quotedPrice },
    });
    await this.emitJobUpdate(id);
    return updated;
  }

  async decline(id: string, dto: DeclineJobDto, requester: JwtUser) {
    const job = await this.assertProRole(id, requester);
    if (job.status !== JobStatus.PENDING) {
      throw new BadRequestException(`Impossible de refuser un job ${job.status}`);
    }
    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.CANCELLED },
    });
    const jobRequest = await this.prisma.jobRequest.findUnique({ where: { id: job.jobRequestId } });
    await this.notifications.create({
      userId: jobRequest!.clientId,
      type: NotificationType.JOB_DECLINED,
      title: 'Demande refusée par le pro',
      message: dto.reason ?? "Le pro n'est pas disponible pour ce job.",
      link: `/jobs/${id}`,
      data: { jobId: id, reason: dto.reason },
    });
    await this.emitJobUpdate(id);
    return updated;
  }

  async start(id: string, requester: JwtUser) {
    const job = await this.assertProRole(id, requester);
    if (job.status !== JobStatus.ACCEPTED) {
      throw new BadRequestException(`Impossible de démarrer un job ${job.status}`);
    }
    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.IN_PROGRESS, startedAt: new Date() },
    });
    await this.prisma.jobRequest.update({
      where: { id: job.jobRequestId },
      data: { status: JobStatus.IN_PROGRESS },
    });
    const jobRequest = await this.prisma.jobRequest.findUnique({ where: { id: job.jobRequestId } });
    await this.notifications.create({
      userId: jobRequest!.clientId,
      type: NotificationType.JOB_STARTED,
      title: 'Intervention commencée',
      message: 'Le pro a démarré votre intervention.',
      link: `/jobs/${id}`,
      data: { jobId: id },
    });
    await this.emitJobUpdate(id);
    return updated;
  }

  async complete(id: string, dto: CompleteJobDto, requester: JwtUser) {
    const job = await this.assertProRole(id, requester);
    if (job.status !== JobStatus.IN_PROGRESS && job.status !== JobStatus.ACCEPTED) {
      throw new BadRequestException(`Impossible de clôturer un job ${job.status}`);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const j = await tx.job.update({
        where: { id },
        data: {
          status: JobStatus.COMPLETED,
          actualPrice: dto.actualPrice,
          completionProof: dto.completionProof,
          completedAt: now,
        },
      });
      await tx.jobRequest.update({
        where: { id: j.jobRequestId },
        data: { status: JobStatus.COMPLETED, finalPrice: dto.actualPrice, completedAt: now },
      });
      await tx.professional.update({
        where: { id: j.professionalId },
        data: { totalJobs: { increment: 1 } },
      });
      return j;
    });
    const jobRequest = await this.prisma.jobRequest.findUnique({ where: { id: job.jobRequestId } });
    await this.notifications.create({
      userId: jobRequest!.clientId,
      type: NotificationType.JOB_COMPLETED,
      title: 'Job terminé',
      message: `Votre job a été marqué comme terminé. Total : ${dto.actualPrice} FCFA.`,
      link: `/jobs/${id}`,
      data: { jobId: id, actualPrice: dto.actualPrice },
    });
    await this.emitJobUpdate(id);
    return updated;
  }

  async cancel(id: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { jobRequest: true },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    const isClient = job.jobRequest.clientId === requester.id;
    if (!isClient && requester.userType !== UserType.ADMIN) {
      throw new ForbiddenException('Seul le client ou un admin peut annuler');
    }
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED) {
      throw new BadRequestException(`Job déjà ${job.status}`);
    }
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const j = await tx.job.update({ where: { id }, data: { status: JobStatus.CANCELLED } });
      await tx.jobRequest.update({
        where: { id: job.jobRequestId },
        data: { status: JobStatus.CANCELLED },
      });
      return j;
    });
    await this.emitJobUpdate(id);
    return cancelled;
  }

  // ---------------------------------------------------------- helpers

  /** Prévient en direct le client et le pro (room `user:<id>`) qu'un job a changé. */
  private async emitJobUpdate(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        quotedPrice: true,
        actualPrice: true,
        jobRequest: { select: { clientId: true } },
        professional: { select: { userId: true } },
      },
    });
    if (!job) return;
    const payload = {
      jobId: job.id,
      status: job.status,
      quotedPrice: job.quotedPrice,
      actualPrice: job.actualPrice,
    };
    this.realtime.toUsersAndJob(
      [job.jobRequest.clientId, job.professional.userId],
      job.id,
      'job:updated',
      payload,
    );
  }

  private async assertCanRead(
    job: { jobRequest: { clientId: string }; professional: { userId: string } },
    requester: JwtUser,
  ) {
    if (requester.userType === UserType.ADMIN) return;
    if (job.jobRequest.clientId === requester.id) return;
    if (job.professional.userId === requester.id) return;
    throw new ForbiddenException('Accès refusé à ce job');
  }

  private async assertProRole(id: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { professional: { select: { userId: true } } },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (requester.userType !== UserType.ADMIN && job.professional.userId !== requester.id) {
      throw new ForbiddenException('Seul le pro assigné peut effectuer cette action');
    }
    return job;
  }
}
