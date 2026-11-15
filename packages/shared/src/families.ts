import { z } from 'zod';

export const createFamilySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a family name')
    .max(100, 'Family name must be at most 100 characters'),
});

export type CreateFamilyRequest = z.infer<typeof createFamilySchema>;

// Role in a particular family. Role-based permissions come in stage 3
export type FamilyRole = 'parent' | 'child' | 'guest';

// A family in the "my families" list, with my role in it.
// The API supports several families per user, although the database allows only one for now
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
