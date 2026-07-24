import { env } from '../../config/environment.js';

export type DatabaseCheck = () => Promise<void>;

export function createHealthService(databaseCheck: DatabaseCheck) {
  return {
    liveness() {
      return {
        service: 'pixel-eye-blog-backend',
        status: 'running' as const,
        environment: env.NODE_ENV,
        version: env.APP_VERSION,
        timestamp: new Date().toISOString()
      };
    },
    async readiness() {
      const startedAt = performance.now();
      await databaseCheck();
      return {
        service: 'pixel-eye-blog-backend',
        database: 'connected' as const,
        environment: env.NODE_ENV,
        version: env.APP_VERSION,
        response_time_ms: Math.round((performance.now() - startedAt) * 100) / 100,
        timestamp: new Date().toISOString()
      };
    }
  };
}

