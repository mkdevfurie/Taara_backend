import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, NotificationType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateRatingDto, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      include: { jobRequest: true, professional: { select: { userId: true } }, rating: true },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    if (job.jobRequest.clientId !== requester.id) {
      throw new ForbiddenException('Seul le client peut noter ce job');
    }
    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Le job doit être terminé avant d\'être noté');
    }
    if (job.rating) throw new ConflictException('Ce job a déjà été noté');

    const rating = await this.prisma.$transaction(async (tx) => {
      const r = await tx.rating.create({
        data: {
          jobId: job.id,
          userId: requester.id,
          professionalId: job.professionalId,
          score: dto.score,
          comment: dto.comment,
        },
      });
      // Recalcule la moyenne du pro
      const agg = await tx.rating.aggregate({
        where: { professionalId: job.professionalId },
        _avg: { score: true },
        _count: true,
      });
      await tx.professional.update({
        where: { id: job.professionalId },
        data: { rating: agg._avg.score ?? 0 },
      });
      return r;
    });

    await this.notifications.create({
      userId: job.professional.userId,
      type: NotificationType.RATING_RECEIVED,
      title: `Nouvelle note : ${dto.score}/5`,
      message: dto.comment ?? 'Votre client vient de vous noter.',
      link: `/jobs/${job.id}`,
      data: { jobId: job.id, score: dto.score },
    });

    return rating;
  }
}
