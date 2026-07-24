import type { AuthenticatedAdmin } from '../modules/admin/auth/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      authenticatedAdmin?: AuthenticatedAdmin;
    }
  }
}

export {};
