import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Notification, NotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Crée une notification et la pousse en temps réel au destinataire
   * (évènement `notification:new` dans sa room Socket.IO).
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const notif = await this.prisma.notification.create({ data: input });
    this.logger.debug(`notification:${notif.type} user=${notif.userId}`);
    this.realtime.toUser(notif.userId, 'notification:new', notif);
    return notif;
  }

  async createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return { count: 0 };
    return this.prisma.notification.createMany({ data: inputs });
  }

  async list(userId: string, opts: { unreadOnly?: boolean; page?: number; perPage?: number } = {}) {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 30;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(opts.unreadOnly ? { isRead: false } : {}),
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, page, perPage, total, unread };
  }

  async markRead(id: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) throw new NotFoundException('Notification introuvable');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async remove(id: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) throw new NotFoundException('Notification introuvable');
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }
}
