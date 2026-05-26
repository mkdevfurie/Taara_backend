import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, UserType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto } from './dto/send-message.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(jobId: string, requester: JwtUser, opts: { page?: number; perPage?: number } = {}) {
    await this.assertParticipant(jobId, requester);
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 50;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where: { jobId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
        },
      }),
      this.prisma.message.count({ where: { jobId } }),
    ]);
    return { items, page, perPage, total };
  }

  async send(jobId: string, dto: SendMessageDto, requester: JwtUser, file?: Express.Multer.File) {
    const participants = await this.assertParticipant(jobId, requester);
    let imageUrl = dto.imageUrl;
    if (file) {
      const uploaded = await this.cloudinary.uploadBuffer(file.buffer, {
        folder: `jobs/${jobId}/messages`,
        tags: ['chat', `job:${jobId}`],
      });
      imageUrl = uploaded.url;
    }

    const msg = await this.prisma.message.create({
      data: {
        jobId,
        senderId: requester.id,
        content: dto.content,
        imageUrl,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
      },
    });

    const recipientId =
      requester.id === participants.clientId ? participants.proUserId : participants.clientId;

    await this.notifications.create({
      userId: recipientId,
      type: NotificationType.MESSAGE,
      title: `Nouveau message — ${msg.sender.firstName}`,
      message: dto.content.slice(0, 120),
      link: `/jobs/${jobId}`,
      data: { jobId, messageId: msg.id },
    });

    return msg;
  }

  async markRead(jobId: string, requester: JwtUser) {
    await this.assertParticipant(jobId, requester);
    return this.prisma.message.updateMany({
      where: { jobId, senderId: { not: requester.id }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async assertParticipant(jobId: string, requester: JwtUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        jobRequest: { select: { clientId: true } },
        professional: { select: { userId: true } },
      },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    const clientId = job.jobRequest.clientId;
    const proUserId = job.professional.userId;
    if (
      requester.userType !== UserType.ADMIN &&
      requester.id !== clientId &&
      requester.id !== proUserId
    ) {
      throw new ForbiddenException('Vous ne participez pas à ce job');
    }
    return { clientId, proUserId };
  }
}
