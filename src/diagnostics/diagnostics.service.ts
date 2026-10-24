import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DiagnosisStatus, Prisma, UserType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { GemmaService } from '../gemma/gemma.service';
import { CreateDiagnosticDto } from './dto/create-diagnostic.dto';
import { ListDiagnosticsDto } from './dto/list-diagnostics.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly gemma: GemmaService,
  ) {}

  async create(
    dto: CreateDiagnosticDto,
    requester: JwtUser,
    file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;
    if (file) {
      const uploaded = await this.cloudinary.uploadBuffer(file.buffer, {
        folder: `diagnostics/${requester.id}`,
        tags: ['diagnostic', `user:${requester.id}`],
      });
      imageUrl = uploaded.url;
    }

    // Diagnostic déjà produit sur l'appareil : on l'enregistre tel quel.
    if (dto.aiDiagnosis) {
      return this.prisma.diagnostic.create({
        data: {
          userId: requester.id,
          imageUrl,
          problemDescription: dto.problemDescription,
          problemType: dto.problemType ?? 'Inconnu',
          aiDiagnosis: dto.aiDiagnosis as Prisma.InputJsonObject,
          confidence: dto.confidence ?? 0,
          status: DiagnosisStatus.COMPLETED,
        },
      });
    }

    const draft = await this.prisma.diagnostic.create({
      data: {
        userId: requester.id,
        imageUrl,
        problemDescription: dto.problemDescription,
        problemType: dto.problemType ?? 'Inconnu',
        aiDiagnosis: {},
        confidence: 0,
        status: DiagnosisStatus.PENDING,
      },
    });

    try {
      const result = await this.gemma.diagnose({
        description: dto.problemDescription,
        imageUrl,
        problemType: dto.problemType,
      });

      return this.prisma.diagnostic.update({
        where: { id: draft.id },
        data: {
          aiDiagnosis: result as unknown as object,
          confidence: result.confidence,
          problemType: result.problemType,
          status: DiagnosisStatus.COMPLETED,
        },
      });
    } catch {
      return this.prisma.diagnostic.update({
        where: { id: draft.id },
        data: { status: DiagnosisStatus.FAILED },
      });
    }
  }

  async getById(id: string, requester: JwtUser) {
    const diag = await this.prisma.diagnostic.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
      },
    });
    if (!diag) throw new NotFoundException('Diagnostic introuvable');
    if (diag.userId !== requester.id && requester.userType !== UserType.ADMIN) {
      throw new ForbiddenException('Accès refusé à ce diagnostic');
    }
    return diag;
  }

  async getAiAnalysis(id: string, requester: JwtUser) {
    const diag = await this.getById(id, requester);
    return {
      id: diag.id,
      status: diag.status,
      confidence: diag.confidence,
      problemType: diag.problemType,
      aiDiagnosis: diag.aiDiagnosis,
    };
  }

  async listMine(requester: JwtUser, q: ListDiagnosticsDto) {
    const skip = (q.page - 1) * q.perPage;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.diagnostic.findMany({
        where: { userId: requester.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: q.perPage,
      }),
      this.prisma.diagnostic.count({ where: { userId: requester.id } }),
    ]);
    return { items, page: q.page, perPage: q.perPage, total };
  }
}
