import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserType } from '@prisma/client';

export interface JwtUser {
  id: string;
  email: string;
  userType: UserType;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | JwtUser[keyof JwtUser] => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtUser }>();
    if (!request.user) {
      throw new Error('CurrentUser used on an unauthenticated route');
    }
    return data ? request.user[data] : request.user;
  },
);
