import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  authResponseSchema,
  loginSchema,
  publicUserSchema,
  registerSchema,
  type AuthResponse,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from '@family/shared';
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { CurrentUser, Public, type AuthUser } from './auth.decorators';
import { AuthService, type AuthResult } from './auth.service';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieOptions = {
      // Page JavaScript can't see the cookie, so XSS can't steal it
      httpOnly: true,
      // HTTPS only. Locally we use HTTP, so this is on in production only
      secure: config.get('NODE_ENV') === 'production',
      // The browser won't send the cookie with a request started from another site: CSRF protection
      sameSite: 'strict',
      // The cookie goes only to /api/auth/*, not with every API request
      path: '/api/auth',
    };
  }

  // POST /api/auth/register → 201, access token and user; the refresh token goes into a cookie
  @Public()
  @Post('register')
  @ApiDoc({
    summary: 'Sign up',
    description: 'Also sets the refresh_token cookie (httpOnly, path /api/auth).',
    status: 201,
    returns: authResponseSchema,
    errors: { 400: 'Invalid email, password or name', 409: 'This email is already registered' },
  })
  async register(
    @ZodBody(registerSchema) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.register(body));
  }

  // POST /api/auth/login → 200 (Nest answers POST with 201 by default)
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiDoc({
    summary: 'Log in',
    description: 'Also sets the refresh_token cookie (httpOnly, path /api/auth).',
    status: 200,
    returns: authResponseSchema,
    errors: {
      400: 'Malformed email, or an empty or too long password',
      401: 'Invalid email or password',
    },
  })
  async login(
    @ZodBody(loginSchema) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.login(body));
  }

  // POST /api/auth/refresh → 200 and a new access token. Public: the access token has already
  // expired, so the user is identified by the refresh token from the cookie.
  // On a 401 the cookie is NOT cleared on purpose: if a parallel request has just set a new
  // cookie, our later clearCookie would erase it. A stale cookie is harmless; login overwrites it.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiDoc({
    summary: 'Get a new access token',
    description:
      'Reads the refresh_token cookie, no body. Every call replaces the cookie with a new one.',
    status: 200,
    returns: authResponseSchema,
    errors: { 401: 'No cookie, or the session has expired or was revoked' },
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.refresh(readRefreshCookie(req)));
  }

  // POST /api/auth/logout → 204. Public: logging out must work with an expired access token too
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiDoc({
    summary: 'Log out',
    description: 'Revokes the session of the refresh_token cookie and clears the cookie.',
    status: 204,
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }

  // GET /api/auth/me → the current user. No @Public(): needs an access token
  @Get('me')
  @ApiDoc({ summary: 'The current user', status: 200, returns: publicUserSchema })
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.me(user.id);
  }

  // passthrough: true means Nest still sends the returned value; we only add the cookie
  private withCookie(res: Response, result: AuthResult): AuthResponse {
    res.cookie(REFRESH_COOKIE, result.refreshToken.token, {
      ...this.cookieOptions,
      expires: result.refreshToken.expiresAt,
    });
    return result.body;
  }
}

function readRefreshCookie(req: Request): string | undefined {
  // req.cookies is filled by cookie-parser (main.ts)
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : undefined;
}
