import { z } from 'zod';

export const serviceStatusSchema = z.enum(['up', 'down']);

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']).describe('degraded: at least one service is down'),
  timestamp: z.iso.datetime(),
  services: z.object({
    database: serviceStatusSchema,
    redis: serviceStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
