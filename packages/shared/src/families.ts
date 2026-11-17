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
export interface FamilySummary {
  id: string;
  name: string;
  createdAt: string;
  myRole: FamilyRole;
}

export interface FamilyMemberInfo {
  userId: string;
  name: string;
  email: string;
  role: FamilyRole;
  joinedAt: string;
}

// One family with its members
export interface FamilyDetails extends FamilySummary {
  members: FamilyMemberInfo[];
}
