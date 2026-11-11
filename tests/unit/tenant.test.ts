import { describe, it, expect } from 'vitest';
import { extractTenantFromHost } from '../../src/services/tenantService.js';

describe('Tenant host resolution', () => {
  const baseDomain = 'virtualcard.duckdns.org';

  it('returns null for root domain and www', () => {
    expect(
      extractTenantFromHost({ rawHost: 'virtualcard.duckdns.org', baseDomain, isDev: false })
    ).toBeNull();
    expect(
      extractTenantFromHost({ rawHost: 'www.virtualcard.duckdns.org', baseDomain, isDev: false })
    ).toBeNull();
    expect(
      extractTenantFromHost({ rawHost: 'virtualcard.duckdns.org:3000', baseDomain, isDev: true })
    ).toBeNull();
  });

  it('extracts subdomain tenant from Host header with or without port', () => {
    expect(
      extractTenantFromHost({
        rawHost: 'mahbubkhan.virtualcard.duckdns.org',
        baseDomain,
        isDev: false,
      })
    ).toBe('mahbubkhan');
    expect(
      extractTenantFromHost({
        rawHost: 'Alice.VirtualCard.DuckDNS.org:3000',
        baseDomain,
        isDev: true,
      })
    ).toBe('alice');
    expect(extractTenantFromHost({ rawHost: 'bob.localhost:3000', baseDomain, isDev: true })).toBe(
      'bob'
    );
  });

  it('honors dev override (?__tenant or X-Debug-Tenant) only when isDev is true', () => {
    expect(
      extractTenantFromHost({
        rawHost: 'localhost:3000',
        baseDomain,
        isDev: true,
        queryTenant: 'devuser',
      })
    ).toBe('devuser');

    expect(
      extractTenantFromHost({
        rawHost: 'localhost:3000',
        baseDomain,
        isDev: true,
        headerTenant: 'headeruser',
      })
    ).toBe('headeruser');

    expect(
      extractTenantFromHost({
        rawHost: 'virtualcard.duckdns.org',
        baseDomain,
        isDev: false,
        queryTenant: 'hacker',
        headerTenant: 'hacker2',
      })
    ).toBeNull();
  });
});
