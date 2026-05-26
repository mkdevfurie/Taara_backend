import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserType } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserType[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest<{ user?: JwtUser }>();
    if (!user) throw new ForbiddenException('Authentification requise');
    if (!required.includes(user.userType)) {
      throw new ForbiddenException('Accès refusé pour ce rôle');
    }
    return true;
  }
}
