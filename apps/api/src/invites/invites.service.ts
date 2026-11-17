import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type {
  CreatedInvite,
  CreateInviteRequest,
  FamilyDetails,
  InvitePreview,
  InviteSummary,
} from '@family/shared';
import { isUniqueViolation, pgError } from '../common/pg-errors';
import { randomToken, sha256 } from '../common/tokens';
import { DB, type Database } from '../db/db.module';
import { families, familyInvites, familyMembers, users } from '../db/schema';
import { FamiliesService } from '../families/families.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Every wrong token gets the same answer: unknown, used, revoked and expired invites can't be
// told apart, so a token tells nothing unless it is a working one
const INVITE_NOT_FOUND = 'Invite not found or no longer valid';

// An invite that still works: not accepted, not revoked, not expired. now() is the
// database's clock, the same one that filled created_at
function isActive() {
  return and(
    isNull(familyInvites.usedAt),
    isNull(familyInvites.revokedAt),
    gt(familyInvites.expiresAt, sql`now()`),
  );
}

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly families: FamiliesService,
  ) {}

  // A parent creates a one-time link. The token is returned once and stored only as a hash
  async create(
    familyId: string,
    userId: string,
    data: CreateInviteRequest,
  ): Promise<CreatedInvite> {
    await this.requireParent(familyId, userId);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + data.expiresInDays * DAY_MS);
    const [invite] = await this.db
      .insert(familyInvites)
      .values({ familyId, tokenHash: sha256(token), role: data.role, createdBy: userId, expiresAt })
      .returning({ id: familyInvites.id });
    return { id: invite.id, token, role: data.role, expiresAt: expiresAt.toISOString() };
  }

  // The family's invites that still work, newest first
  async list(familyId: string, userId: string): Promise<InviteSummary[]> {
    await this.requireParent(familyId, userId);
    const rows = await this.db
      .select({
        id: familyInvites.id,
        role: familyInvites.role,
        createdByName: users.name,
        createdAt: familyInvites.createdAt,
        expiresAt: familyInvites.expiresAt,
      })
      .from(familyInvites)
      .innerJoin(users, eq(users.id, familyInvites.createdBy))
      .where(and(eq(familyInvites.familyId, familyId), isActive()))
      .orderBy(desc(familyInvites.createdAt));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  // The link stops working. A used invite can't be revoked: the person is already in the family
  async revoke(familyId: string, inviteId: string, userId: string): Promise<void> {
    await this.requireParent(familyId, userId);
    const revoked = await this.db
      .update(familyInvites)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(familyInvites.id, inviteId),
          // The invite must belong to this family: a parent can't revoke other families' invites
          eq(familyInvites.familyId, familyId),
          isNull(familyInvites.usedAt),
          isNull(familyInvites.revokedAt),
        ),
      )
      .returning({ id: familyInvites.id });
    if (revoked.length === 0) throw new NotFoundException('Invite not found');
  }

  // What the invited person sees before joining
  async preview(token: string): Promise<InvitePreview> {
    const [row] = await this.db
      .select({
        familyName: families.name,
        invitedByName: users.name,
        role: familyInvites.role,
        expiresAt: familyInvites.expiresAt,
      })
      .from(familyInvites)
      .innerJoin(families, eq(families.id, familyInvites.familyId))
      .innerJoin(users, eq(users.id, familyInvites.createdBy))
      .where(and(eq(familyInvites.tokenHash, sha256(token)), isActive()));
    if (!row) throw new NotFoundException(INVITE_NOT_FOUND);
    return { ...row, expiresAt: row.expiresAt.toISOString() };
  }

  // Joins the family. Marking the invite as used and adding the member happen in one
  // transaction, and the UPDATE itself checks that the invite still works. Two people
  // accepting the same link at once: the second UPDATE waits for the first one's row lock,
  // then finds used_at set and matches nothing. No check-then-act race.
  async accept(token: string, userId: string): Promise<FamilyDetails> {
    let familyId: string;
    try {
      familyId = await this.db.transaction(async (tx) => {
        const [invite] = await tx
          .update(familyInvites)
          .set({ usedAt: sql`now()`, usedBy: userId })
          .where(and(eq(familyInvites.tokenHash, sha256(token)), isActive()))
          .returning({ familyId: familyInvites.familyId, role: familyInvites.role });
        if (!invite) throw new NotFoundException(INVITE_NOT_FOUND);
        await tx
          .insert(familyMembers)
          .values({ familyId: invite.familyId, userId, role: invite.role });
        return invite.familyId;
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      // Already a member of this family: the primary key (family_id, user_id) rejects the row.
      // The transaction is rolled back, so the invite stays unused for the person it was for
      if (isUniqueViolation(err)) throw new ConflictException('You are already in this family');
      this.logger.error(`Failed to accept an invite: ${pgError(err).code ?? 'unknown error'}`);
      throw new InternalServerErrorException();
    }
    return this.families.getForMember(familyId, userId);
  }

  // Only parents manage invites. A non-member gets 404, as everywhere for families,
  // so family ids can't be probed. Full role-based permissions come in stage 3.
  private async requireParent(familyId: string, userId: string): Promise<void> {
    const role = await this.families.getRole(familyId, userId);
    if (!role) throw new NotFoundException('Family not found');
    if (role !== 'parent') throw new ForbiddenException('Only parents can manage invites');
  }
}
