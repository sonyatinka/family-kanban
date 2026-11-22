import { z } from 'zod';
import { familyRoleSchema } from './families';

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
export const createdInviteSchema = z.object({
  id: z.uuid(),
  token: z.string().describe('Shown only in this response; the link is /invite/<token>'),
  role: familyRoleSchema,
  expiresAt: z.iso.datetime(),
});

export type CreatedInvite = z.infer<typeof createdInviteSchema>;

// An invite that still works, in the family's list. No token here
export const inviteSummarySchema = z.object({
  id: z.uuid(),
  role: familyRoleSchema,
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export type InviteSummary = z.infer<typeof inviteSummarySchema>;

// What the invited person sees before pressing "Join". A member of the family is told so
// at once instead of getting a 409 after pressing the button
export const invitePreviewSchema = z.object({
  familyId: z.uuid(),
  alreadyMember: z.boolean(),
  familyName: z.string(),
  invitedByName: z.string(),
  role: familyRoleSchema,
  expiresAt: z.iso.datetime(),
});

export type InvitePreview = z.infer<typeof invitePreviewSchema>;
