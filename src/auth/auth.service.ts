import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Prisma, UserType, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  ForgotPasswordDto,
  RefreshDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/refresh.dto';

const BCRYPT_ROUNDS = 12;
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    isVerified: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // -------------------------------------------------------- REGISTER
  async register(dto: RegisterDto, meta: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const userType: UserType = dto.userType === 'PRO' ? UserType.PRO : UserType.CLIENT;

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone: dto.phone }] },
      select: { id: true, email: true, phone: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === email ? 'Email déjà utilisé' : 'Téléphone déjà utilisé',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const emailVerificationToken = this.generateToken();
    const emailVerificationHash = this.hashToken(emailVerificationToken);

    const user = await this.prisma.user.create({
      data: {
        email,
        phone: dto.phone,
        password: passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        userType,
        emailVerificationToken: emailVerificationHash,
        emailVerificationExpires: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
        wallet: { create: {} },
        professional:
          userType === UserType.PRO
            ? { create: { hourlyRate: 0, specialties: [], certifications: [], serviceZone: [] } }
            : undefined,
      },
    });

    this.sendAuthEmail('verify-email', user.email, emailVerificationToken);

    const tokens = await this.issueTokens(user, meta);
    return {
      user: this.publicUser(user),
      ...tokens,
    };
  }

  // -------------------------------------------------------- LOGIN
  async login(dto: LoginDto, meta: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Identifiants invalides');
    if (user.isBanned) throw new UnauthorizedException('Compte suspendu');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    const tokens = await this.issueTokens(user, meta);
    return { user: this.publicUser(user), ...tokens };
  }

  // -------------------------------------------------------- REFRESH (rotation)
  async refresh(dto: RefreshDto, meta: { userAgent?: string; ip?: string }): Promise<AuthTokens> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      // Possible token reuse — révoquer toute la famille de tokens de l'utilisateur
      if (stored?.userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Possible refresh token reuse for user ${stored.userId} — sessions revoked`);
      }
      throw new UnauthorizedException('Refresh token invalide');
    }

    // Rotation
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.isBanned) throw new UnauthorizedException('Compte invalide');

    return this.issueTokens(user, meta);
  }

  // -------------------------------------------------------- LOGOUT
  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // -------------------------------------------------------- VERIFY EMAIL
  async verifyEmail(dto: VerifyEmailDto): Promise<{ success: true }> {
    const tokenHash = this.hashToken(dto.token);
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: tokenHash },
    });
    if (
      !user ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      throw new BadRequestException('Token invalide ou expiré');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
    return { success: true };
  }

  // -------------------------------------------------------- FORGOT PASSWORD
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // On répond toujours success pour éviter l'énumération
    if (!user) return { success: true };

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    this.sendAuthEmail('reset-password', user.email, token);
    return { success: true };
  }

  // -------------------------------------------------------- RESET PASSWORD
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const tokenHash = this.hashToken(dto.token);
    const user = await this.prisma.user.findUnique({ where: { passwordResetToken: tokenHash } });
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Token invalide ou expiré');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      }),
      // Révoquer toutes les sessions actives
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  // -------------------------------------------------------- HELPERS

  private publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      isVerified: user.isVerified,
    };
  }

  private async issueTokens(
    user: User,
    meta: { userAgent?: string; ip?: string },
  ): Promise<AuthTokens> {
    const jti = crypto.randomUUID();
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, userType: user.userType },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        userAgent: meta.userAgent?.slice(0, 200),
        ipAddress: meta.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(accessExpiresIn),
    };
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(expires: string): number {
    const match = /^(\d+)([smhd])$/.exec(expires);
    if (!match) return 900;
    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] ?? 1);
  }

  /**
   * Envoie l'email de vérification ou de réinitialisation.
   * Le lien pointe vers APP_URL (ex : https://taara.app/reset-password?token=…).
   */
  private sendAuthEmail(kind: 'verify-email' | 'reset-password', email: string, token: string) {
    const appUrl = (this.config.get<string>('APP_URL') ?? 'https://taara.app').replace(/\/$/, '');
    const link = `${appUrl}/${kind}?token=${encodeURIComponent(token)}`;
    const content =
      kind === 'verify-email'
        ? {
            subject: 'TAARA — Confirmez votre adresse email',
            intro: 'Bienvenue sur TAARA ! Confirmez votre adresse email (lien valable 24 h) :',
          }
        : {
            subject: 'TAARA — Réinitialisation du mot de passe',
            intro:
              "Vous avez demandé à réinitialiser votre mot de passe (lien valable 1 h). Si ce n'est pas vous, ignorez cet email.",
          };

    void this.mail.send({
      to: email,
      subject: content.subject,
      text: `${content.intro}\n\n${link}\n\nCode : ${token}`,
      html: `<p>${content.intro}</p><p><a href="${link}">${link}</a></p><p>Code : <code>${token}</code></p>`,
    });
  }

  /**
   * Catch helper pour les contraintes uniques (utilisé en test/scripts).
   */
  isUniqueConstraintError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }
}
