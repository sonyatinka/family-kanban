import type { FamilyRole } from '@family/shared';

// Record<FamilyRole, …> makes TypeScript complain here if a new role is added to shared
export const roleLabel: Record<FamilyRole, string> = {
  parent: 'Parent',
  child: 'Child',
  guest: 'Guest',
};
