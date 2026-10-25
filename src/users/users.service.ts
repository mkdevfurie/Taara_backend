import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { JwtUser } from '../common/decorators/current-user.decorator';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        professional: true,
        wallet: { select: { balance: true, currency: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.serialize(user);
  }

  async update(id: string, dto: UpdateUserDto, requester: JwtUser) {
    this.assertCanModify(id, requester);
    if (dto.phone) {
      const conflict = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Téléphone déjà utilisé');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { professional: true, wallet: { select: { balance: true, currency: true } } },
    });
    return this.serialize(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto, requester: JwtUser) {
    this.assertCanModify(id, requester);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) throw new BadRequestException('Mot de passe actuel incorrect');
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { password: passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  /**
   * Suppression définitive du compte et de tout ce qui y est rattaché
   * (fiche pro, diagnostics, demandes, messages, notes, notifications, portefeuille),
   * via les suppressions en cascade du schéma.
   */
  async deleteAccount(requester: JwtUser, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: requester.id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.userType === UserType.ADMIN) {
      throw new BadRequestException('Un compte admin ne peut pas être supprimé depuis l’app');
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Mot de passe incorrect');
    }
    await this.prisma.user.delete({ where: { id: user.id } });
    return { success: true };
  }

  async updateAvatar(id: string, file: Express.Multer.File, requester: JwtUser) {
    this.assertCanModify(id, requester);
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Type de fichier non autorisé');
    }
    const uploaded = await this.cloudinary.uploadBuffer(file.buffer, {
      folder: `users/${id}/avatar`,
      publicId: 'avatar',
      tags: ['avatar', `user:${id}`],
    });
    const user = await this.prisma.user.update({
      where: { id },
      data: { profileImage: uploaded.url },
      include: { professional: true, wallet: { select: { balance: true, currency: true } } },
    });
    return this.serialize(user);
  }

  /**
   * Convertit un compte CLIENT en PRO et crée la fiche Professional.
   */
  async upgradeToPro(requester: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: requester.id },
      include: { professional: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.userType === UserType.ADMIN) {
      throw new BadRequestException('Un admin ne peut pas devenir PRO via cette route');
    }
    if (user.userType === UserType.PRO && user.professional) {
      return this.serialize(user);
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        userType: UserType.PRO,
        professional: user.professional
          ? undefined
          : {
              create: {
                hourlyRate: 0,
                specialties: [],
                certifications: [],
                serviceZone: [],
                ...this.subscriptions.trialCreateData(),
              },
            },
      },
      include: { professional: true, wallet: { select: { balance: true, currency: true } } },
    });
    return this.serialize(updated);
  }

  // ---------- helpers

  private assertCanModify(targetId: string, requester: JwtUser) {
    if (requester.id === targetId) return;
    if (requester.userType === UserType.ADMIN) return;
    throw new ForbiddenException('Action non autorisée sur cet utilisateur');
  }

  private serialize<
    T extends {
      password?: string;
      emailVerificationToken?: string | null;
      passwordResetToken?: string | null;
    },
  >(user: T) {
    const { password: _p, emailVerificationToken: _e, passwordResetToken: _r, ...safe } = user;
    return safe;
  }
}
