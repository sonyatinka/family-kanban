import { z } from 'zod';

export const createFamilySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a family name')
    .max(100, 'Family name must be at most 100 characters'),
});

export type CreateFamilyRequest = z.infer<typeof createFamilySchema>;

// Role in a particular family. Role-based permissions come in stage 3.
// A schema, not only a type: the invite form and the API validate the chosen role with it
export const familyRoleSchema = z.enum(['parent', 'child', 'guest'], { error: 'Choose a role' });

export type FamilyRole = z.infer<typeof familyRoleSchema>;

// A family in the "my families" list, with my role in it.
// A person can be in several families
export const familySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  myRole: familyRoleSchema.describe('My role in this family'),
});

export type FamilySummary = z.infer<typeof familySummarySchema>;

export const familyMemberInfoSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: familyRoleSchema,
  joinedAt: z.iso.datetime(),
});

export type FamilyMemberInfo = z.infer<typeof familyMemberInfoSchema>;

// One family with its members
export const familyDetailsSchema = familySummarySchema.extend({
  members: z.array(familyMemberInfoSchema),
});

export type FamilyDetails = z.infer<typeof familyDetailsSchema>;
