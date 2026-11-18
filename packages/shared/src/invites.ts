import { z } from 'zod';
import { familyRoleSchema, type FamilyRole } from './families';

// How long an invite link works, in days. The parent picks one when creating the invite
export const INVITE_LIFETIMES_DAYS = [1, 7, 30] as const;

// POST /api/families/:familyId/invites
export const createInviteSchema = z.object({
  role: familyRoleSchema,
  expiresInDays: z.literal(INVITE_LIFETIMES_DAYS, { error: 'Choose 1, 7 or 30 days' }),
});

export type CreateInviteRequest = z.infer<typeof createInviteSchema>;

// The answer to creating an invite. This is the only time the token is shown: the database
// keeps only its hash, so a lost link can't be shown again, only replaced by a new invite
export interface CreatedInvite {
  id: string;
  token: string;
  role: FamilyRole;
  expiresAt: string;
}

// An invite that still works, in the family's list. No token here
export interface InviteSummary {
  id: string;
  role: FamilyRole;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

// What the invited person sees before pressing "Join". A member of the family is told so
// at once instead of getting a 409 after pressing the button
export interface InvitePreview {
  familyId: string;
  alreadyMember: boolean;
  familyName: string;
  invitedByName: string;
  role: FamilyRole;
  expiresAt: string;
}
