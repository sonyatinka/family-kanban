import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomToken, sha256 } from '../common/tokens';
import { DB, type Database } from '../db/db.module';
import { refreshTokens } from '../db/schema';

// How long a refresh token lives. Every refresh issues a new one, so an active user is never
// logged out, while a forgotten device is logged out after 30 days.
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Window in which reuse of a just-revoked token counts as a race, not theft: two tabs
// (or React StrictMode's double effect) refresh at the same time, one request wins, and the
// others arrive with the old token milliseconds later.
const REUSE_GRACE_MS = 10_000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

// A Drizzle transaction: inside db.transaction every query must go through tx
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  issue(userId: string): Promise<IssuedRefreshToken> {
    return this.insert(this.db, userId);
  }

  // Exchanges a refresh token for a new one (rotation). The old one is revoked and can't be reused.
  // Returns null if the token is unknown, expired or already used.
  async rotate(token: string): Promise<{ userId: string; next: IssuedRefreshToken } | null> {
    const hash = sha256(token);

    const result = await this.db.transaction(async (tx) => {
      // Check and revoke in one atomic UPDATE: of two concurrent requests with the same
      // token, only one gets the row
      const [used] = await tx
        .update(refreshTokens)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(refreshTokens.tokenHash, hash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, sql`now()`),
          ),
        )
        .returning({ userId: refreshTokens.userId });
      if (!used) return null;

      return { userId: used.userId, next: await this.insert(tx, used.userId) };
    });
    if (result) return result;

    // Outside the transaction: an exception must not roll back the revocation
    await this.handleReuse(hash);
    return null;
  }

  // Log out on one device. An unknown or already revoked token is not an error
  async revoke(token: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)));
  }

  // Log out on all devices
  async revokeAll(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  // The token was in the database but already revoked: it was used a second time. So someone
  // else has a copy (a stolen cookie). We can't tell who of the two is the attacker, so we revoke
  // all of the user's tokens: both have to log in again, and only the owner can.
  private async handleReuse(hash: string): Promise<void> {
    const row = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, hash),
    });
    if (!row?.revokedAt) return; // unknown or simply expired token
    // Revoked just now: most likely a parallel request from the same client. The request still
    // gets a 401 (the token is used up); the window grants no access, it only avoids logging the
    // user out everywhere. App and database clocks are on one machine; in a cluster compare in SQL.
    if (Date.now() - row.revokedAt.getTime() < REUSE_GRACE_MS) return;
    this.logger.warn(`Refresh token reuse detected, user ${row.userId}`);
    await this.revokeAll(row.userId);
  }

  private async insert(db: Database | Tx, userId: string): Promise<IssuedRefreshToken> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await db.insert(refreshTokens).values({ userId, tokenHash: sha256(token), expiresAt });
    return { token, expiresAt };
  }
}
