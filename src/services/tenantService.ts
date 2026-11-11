import type { UserRepository } from '../repositories/userRepository.js';
import type { CardRepository } from '../repositories/cardRepository.js';
import type { User, Card } from '../db/schema.js';
import { NotFoundError } from '../types/errors.js';

export interface TenantExtractInput {
  rawHost: string;
  baseDomain: string;
  isDev: boolean;
  queryTenant?: unknown;
  headerTenant?: unknown;
}

export function extractTenantFromHost(input: TenantExtractInput): string | null {
  const host = input.rawHost.split(':')[0].toLowerCase().trim();
  const baseDomain = input.baseDomain.toLowerCase().trim();

  let tenantSubdomain: string | null = null;

  if (input.isDev) {
    if (typeof input.queryTenant === 'string' && input.queryTenant.trim()) {
      tenantSubdomain = input.queryTenant.trim().toLowerCase();
    } else if (typeof input.headerTenant === 'string' && input.headerTenant.trim()) {
      tenantSubdomain = input.headerTenant.trim().toLowerCase();
    }
  }

  if (!tenantSubdomain) {
    if (host.endsWith('.' + baseDomain)) {
      tenantSubdomain = host.slice(0, -(baseDomain.length + 1));
    } else if (host.endsWith('.localhost')) {
      tenantSubdomain = host.slice(0, -'.localhost'.length);
    }
  }

  if (!tenantSubdomain || tenantSubdomain === 'www' || tenantSubdomain === baseDomain) {
    return null;
  }

  return tenantSubdomain;
}

export class TenantService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly cardRepo: CardRepository
  ) {}

  resolveTenant(tenantUsername: string): { user: User; card: Card | undefined } {
    const user = this.userRepo.findByUsername(tenantUsername);
    if (!user) {
      throw new NotFoundError(
        `The virtual card for subdomain "${tenantUsername}" was not found. It may not be registered yet, or was removed.`,
        'TENANT_NOT_FOUND',
        'Claim this username'
      );
    }

    if (user.status === 'suspended') {
      throw new NotFoundError(
        'This digital business card is currently unavailable.',
        'ACCOUNT_SUSPENDED'
      );
    }

    const card = this.cardRepo.findByUserId(user.id);
    return { user, card };
  }
}
