import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AuthResponse, LoginRequest, PublicUser, RegisterRequest } from '@family/shared';
import { isUniqueViolation, pgError } from '../common/pg-errors';
import type { User } from '../db/schema';
import { toPublicUser, UsersService } from '../users/users.service';
import type { AccessTokenPayload } from './jwt-auth.guard';
import { RefreshTokensService, type IssuedRefreshToken } from './refresh-tokens.service';

// What the service hands to the controller: the response body and the refresh token
// that the controller puts into a cookie
export interface AuthResult {
  body: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  // Dummy hash for logins with an unknown email (see login)
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('dummy-password-for-timing');
  }

  // After sign-up the user is logged in, no separate login call needed
  async register(data: RegisterRequest): Promise<AuthResult> {
    // argon2id with default parameters (64 MB of memory, 3 passes). The salt is generated
    // automatically and stored inside the hash string with the parameters, so no salt column
    const passwordHash = await argon2.hash(data.password);

    let user: User;
    try {
      user = await this.users.create({ email: data.email, name: data.name, passwordHash });
    } catch (err) {
      // Not "check, then insert" (two concurrent requests would race),
      // but insert right away and handle the database's rejection
      if (isUniqueViolation(err)) {
        throw new ConflictException('A user with this email already exists');
      }
      // A Drizzle error message contains the query params, including the password hash: don't log it
      this.logger.error(`Failed to create a user: ${pgError(err).code ?? 'unknown error'}`);
      throw new InternalServerErrorException();
    }
    return this.startSession(user);
  }

  async login(data: LoginRequest): Promise<AuthResult> {
    const user = await this.users.findByEmail(data.email);

    // Even without a user, verify the password against the dummy hash. Otherwise "no such email"
    // would answer much faster, and the timing would reveal who is registered
    const ok = await argon2.verify(user?.passwordHash ?? this.dummyHash, data.password);

    // The same message for "no user" and "wrong password", for the same reason
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    return this.startSession(user);
  }

  // A new access token for the refresh token from the cookie. The refresh token changes too (rotation)
  async refresh(token: string | undefined): Promise<AuthResult> {
    const rotated = token ? await this.refreshTokens.rotate(token) : null;
    if (!rotated) throw new UnauthorizedException('Session expired, please log in again');

    const user = await this.users.findById(rotated.userId);
    if (!user) throw new UnauthorizedException('Session expired, please log in again');

    return {
      body: { accessToken: await this.signAccessToken(user), user: toPublicUser(user) },
      refreshToken: rotated.next,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.refreshTokens.revoke(token);
  }

  async me(userId: string): Promise<PublicUser> {
    // The token is still valid but the user was deleted: possible, a JWT doesn't ask the database
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return toPublicUser(user);
  }

  private async startSession(user: User): Promise<AuthResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.refreshTokens.issue(user.id),
    ]);
    return { body: { accessToken, user: toPublicUser(user) }, refreshToken };
  }

  // Only the id goes into the token. A name or a role would go stale while the token lives 15 more minutes
  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id };
    return this.jwt.signAsync(payload);
  }
}
