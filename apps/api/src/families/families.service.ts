import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type {
  CreateFamilyRequest,
  FamilyDetails,
  FamilyMemberInfo,
  FamilySummary,
} from '@family/shared';
import { isUniqueViolation, pgError } from '../common/pg-errors';
import { DB, type Database } from '../db/db.module';
import { families, FAMILY_MEMBERS_ONE_FAMILY, familyMembers, users } from '../db/schema';

@Injectable()
export class FamiliesService {
  private readonly logger = new Logger(FamiliesService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  // The creator of a family becomes a parent in it
  async create(userId: string, data: CreateFamilyRequest): Promise<FamilyDetails> {
    let familyId: string;
    try {
      // The family and its first member in one transaction: if the member insert fails,
      // no family without members is left in the database
      familyId = await this.db.transaction(async (tx) => {
        const [family] = await tx
          .insert(families)
          .values({ name: data.name })
          .returning({ id: families.id });
        await tx.insert(familyMembers).values({ familyId: family.id, userId, role: 'parent' });
        return family.id;
      });
    } catch (err) {
      // While "one family per user" holds, the second insert violates that constraint.
      // As with sign-up: no check in advance, we handle the database's rejection, so no race
      if (isUniqueViolation(err, FAMILY_MEMBERS_ONE_FAMILY)) {
        throw new ConflictException('You are already in a family');
      }
      this.logger.error(`Failed to create a family: ${pgError(err).code ?? 'unknown error'}`);
      throw new InternalServerErrorException();
    }
    return this.getForMember(familyId, userId);
  }

  // All of the user's families with the user's role in each. There is at most one for now,
  // but the response is an array so neither the web app nor the API has to change later
  async listForUser(userId: string): Promise<FamilySummary[]> {
    const rows = await this.db
      .select({
        id: families.id,
        name: families.name,
        createdAt: families.createdAt,
        myRole: familyMembers.role,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(eq(familyMembers.userId, userId))
      .orderBy(asc(familyMembers.joinedAt));

    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  // A family with its members, for members of that family only
  async getForMember(familyId: string, userId: string): Promise<FamilyDetails> {
    const [membership] = await this.db
      .select({
        id: families.id,
        name: families.name,
        createdAt: families.createdAt,
        myRole: familyMembers.role,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));

    // Someone else's family and a missing family get the same 404. A 403 would confirm
    // that a family with this id exists
    if (!membership) throw new NotFoundException('Family not found');

    const members = await this.db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: familyMembers.role,
        joinedAt: familyMembers.joinedAt,
      })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.userId))
      .where(eq(familyMembers.familyId, familyId))
      .orderBy(asc(familyMembers.joinedAt));

    return {
      ...membership,
      createdAt: membership.createdAt.toISOString(),
      members: members.map((m): FamilyMemberInfo => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    };
  }
}
