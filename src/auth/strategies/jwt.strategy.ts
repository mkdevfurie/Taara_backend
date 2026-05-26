import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  userType: 'CLIENT' | 'PRO' | 'ADMIN';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, userType: true, isBanned: true },
    });
    if (!user || user.isBanned) {
      throw new UnauthorizedException('Compte invalide');
    }
    return { id: user.id, email: user.email, userType: user.userType };
  }
}
