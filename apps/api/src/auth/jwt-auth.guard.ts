import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, type AuthenticatedRequest } from './auth.decorators';

// What an access token carries. sub (subject) is the standard JWT claim for "who this token is about"
export interface AccessTokenPayload {
  sub: string;
}

// Checks the access token on every request. Registered globally (APP_GUARD in AuthModule).
// It doesn't query the database: the signature and expiry are checked with the secret,
// which is the whole point of JWT.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Method metadata wins over controller metadata
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Access token required');

    try {
      // The algorithm and lifetime are configured in JwtModule (auth.module.ts)
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = { id: payload.sub };
      return true;
    } catch {
      // Expired, forged or corrupted: the client does the same thing, gets a new one via /auth/refresh
      throw new UnauthorizedException('Access token is invalid or expired');
    }
  }
}
