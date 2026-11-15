// Types shared by the API and the web app.
// Change the contract here, and TypeScript shows what to fix on both sides.

export * from './auth';
export * from './families';

export type ServiceStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
  };
}
