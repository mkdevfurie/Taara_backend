import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, NotificationType, Prisma, UserType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';
import { PRIVATE_PRO_FIELDS } from './private-fields';

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async search(q: SearchProfessionalsDto) {
    const where: Prisma.ProfessionalWhereInput = {
      ...(q.verifiedOnly ? { isVerified: true } : {}),
      ...(q.specialty ? { specialties: { has: q.specialty } } : {}),
      ...(q.zone ? { serviceZone: { has: q.zone } } : {}),
      ...(q.q
        ? {
            OR: [
              { bio: { contains: q.q, mode: 'insensitive' } },
              { user: { firstName: { contains: q.q, mode: 'insensitive' } } },
              { user: { lastName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      user: { is: { isBanned: false } },
      // Seuls les pros abonnés (ou en essai) apparaissent dans la recherche
      ...this.subscriptions.activeWhere(),
    };

    const skip = (q.page - 1) * q.perPage;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.professional.findMany({
        where,
        omit: PRIVATE_PRO_FIELDS,
        orderBy: [{ rating: 'desc' }, { totalJobs: 'desc' }],
        skip,
        take: q.perPage,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.professional.count({ where }),
    ]);
    return { items, page: q.page, perPage: q.perPage, total };
  }

  async getById(id: string) {
    const pro = await this.prisma.professional.findUnique({
      where: { id },
      omit: PRIVATE_PRO_FIELDS,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            isVerified: true,
          },
        },
        ratings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
          },
        },
      },
    });
    if (!pro) throw new NotFoundException('Professionnel introuvable');
    return pro;
  }

  async getByUserId(userId: string) {
    const pro = await this.prisma.professional.findUnique({ where: { userId } });
    if (!pro) throw new NotFoundException('Aucune fiche pro pour cet utilisateur');
    return pro;
  }

  async update(id: string, dto: UpdateProfessionalDto, requester: JwtUser) {
    const pro = await this.assertOwnerOrAdmin(id, requester);
    return this.prisma.professional.update({ where: { id: pro.id }, data: dto });
  }

  async addCertification(id: string, file: Express.Multer.File, requester: JwtUser) {
    const pro = await this.assertOwnerOrAdmin(id, requester);
    const uploaded = await this.cloudinary.uploadBuffer(file.buffer, {
      folder: `pros/${pro.id}/certifications`,
      tags: ['certification', `pro:${pro.id}`],
    });
    return this.prisma.professional.update({
      where: { id: pro.id },
      data: { certifications: { push: uploaded.url } },
    });
  }

  /** Retire un justificatif (le fichier reste sur Cloudinary, seule la référence est supprimée). */
  async removeCertification(id: string, url: string, requester: JwtUser) {
    const pro = await this.assertOwnerOrAdmin(id, requester);
    if (!pro.certifications.includes(url)) throw new NotFoundException('Justificatif introuvable');
    return this.prisma.professional.update({
      where: { id: pro.id },
      data: { certifications: pro.certifications.filter((c) => c !== url) },
    });
  }

  async verify(id: string, verified: boolean) {
    const pro = await this.prisma.professional.findUnique({ where: { id } });
    if (!pro) throw new NotFoundException('Professionnel introuvable');
    const updated = await this.prisma.professional.update({
      where: { id },
      data: { isVerified: verified },
    });
    // Le pro est prévenu en direct (et la notification reste dans son historique)
    if (verified !== pro.isVerified) {
      await this.notifications.create(
        verified
          ? {
              userId: pro.userId,
              type: NotificationType.PRO_VERIFIED,
              title: 'Profil vérifié ✓',
              message:
                'Votre profil réparateur est vérifié : vous apparaissez maintenant aux clients.',
              data: { professionalId: id },
            }
          : {
              userId: pro.userId,
              type: NotificationType.GENERIC,
              title: 'Vérification retirée',
              message:
                "Votre profil n'apparaît plus aux clients. Complétez votre fiche ou contactez l'équipe Taara.",
              data: { professionalId: id },
            },
      );
    }
    return updated;
  }

  async getMyJobs(id: string, requester: JwtUser, status?: JobStatus) {
    await this.assertOwnerOrAdmin(id, requester);
    return this.prisma.job.findMany({
      where: { professionalId: id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        jobRequest: {
          include: { client: { select: { id: true, firstName: true, lastName: true } } },
        },
        diagnostic: { select: { id: true, problemType: true, imageUrl: true } },
      },
    });
  }

  async getEarnings(id: string, requester: JwtUser) {
    await this.assertOwnerOrAdmin(id, requester);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [completed, monthly, lifetime] = await this.prisma.$transaction([
      this.prisma.job.aggregate({
        _sum: { actualPrice: true },
        _count: true,
        where: { professionalId: id, status: JobStatus.COMPLETED },
      }),
      this.prisma.job.aggregate({
        _sum: { actualPrice: true },
        _count: true,
        where: {
          professionalId: id,
          status: JobStatus.COMPLETED,
          completedAt: { gte: startMonth },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { netAmount: true },
        where: { job: { professionalId: id }, status: 'COMPLETED' },
      }),
    ]);

    return {
      jobsCompleted: completed._count,
      totalRevenue: completed._sum.actualPrice ?? 0,
      monthlyJobs: monthly._count,
      monthlyRevenue: monthly._sum.actualPrice ?? 0,
      netPaidOut: lifetime._sum.netAmount ?? 0,
      currency: 'XOF',
    };
  }

  async getRatings(id: string, page = 1, perPage = 20) {
    const pro = await this.prisma.professional.findUnique({ where: { id } });
    if (!pro) throw new NotFoundException('Professionnel introuvable');
    const skip = (page - 1) * perPage;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rating.findMany({
        where: { professionalId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
        },
      }),
      this.prisma.rating.count({ where: { professionalId: id } }),
    ]);
    return {
      items,
      page,
      perPage,
      total,
      average: pro.rating,
    };
  }

  // ---------- helpers

  private async assertOwnerOrAdmin(id: string, requester: JwtUser) {
    const pro = await this.prisma.professional.findUnique({ where: { id } });
    if (!pro) throw new NotFoundException('Professionnel introuvable');
    if (requester.userType === UserType.ADMIN) return pro;
    if (pro.userId !== requester.id) {
      throw new ForbiddenException('Action non autorisée sur cette fiche pro');
    }
    return pro;
  }
}
