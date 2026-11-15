import { useSyncExternalStore } from 'react';
import type { PublicUser } from '@family/shared';
import { getUser, subscribe } from './client';

// The current user for components. The session lives outside React (in the client module),
// so route guards can read it synchronously; this hook re-renders components when it changes.
export function useUser(): PublicUser | null {
  return useSyncExternalStore(subscribe, getUser);
}
