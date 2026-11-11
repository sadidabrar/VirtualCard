import type { Logger } from 'pino';
import type { User, Card } from '../db/schema.js';

export type { User, Card };

export type SafeUser = Omit<User, 'password_hash'>;

export interface AdminUserWithCard {
  user: SafeUser;
  card: Card | null;
}

export interface MasterDashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  publishedCards: number;
  recentSignups7d: number;
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

export interface UsernameAvailabilityResult {
  available: boolean;
  username: string;
  reason?: string;
}

export interface SignupInputDto {
  username: string;
  email: string;
  password: string;
  full_name: string;
  job_title: string;
  company: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  public_email: string;
  website: string;
  socials: string;
  avatar_url: string;
  theme: string;
}

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: number;
    username?: string;
    role?: 'owner' | 'master';
    recentSignupUsername?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      tenant: string | null;
      tenantUser?: User;
      tenantCard?: Card;
      isTenantRequest?: boolean;
      currentUser?: SafeUser;
      multerError?: string;
    }
  }
}
