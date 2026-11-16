import type { HealthResponse } from '@family/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './client';

// A status check must be current and must fail fast: it runs again on every visit and has no
// retries, unlike the defaults in queryClient.ts. The answer of the previous check stays in
// the cache, so SystemStatus hides it while a new check is running.
export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: () => api<HealthResponse>('/health'),
  staleTime: 0,
  retry: false,
});
