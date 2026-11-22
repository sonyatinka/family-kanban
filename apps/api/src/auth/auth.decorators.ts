import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { Request } from 'express';

// Who made the request. Set by JwtAuthGuard from the access token (the sub claim)
export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'isPublic';
// The mark @Public() leaves in the Swagger docs, so they show these routes without a lock
export const PUBLIC_EXTENSION = 'x-public';

// The guard is global: everything is closed by default. @Public() opens a route or a whole controller.
// Forgetting @Public() gives an extra 401; forgetting a guard exposes data. The first is safer.
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC, true), ApiExtension(PUBLIC_EXTENSION, true));

// @CurrentUser() user: AuthUser in a controller method parameter
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  // We only get here after the guard, so user is set. If not, the route is @Public() by mistake
  if (!user) throw new Error('CurrentUser used on a route without token verification');
  return user;
});
