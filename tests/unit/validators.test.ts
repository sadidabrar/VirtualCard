import { describe, it, expect } from 'vitest';
import { validateUsernameRules, RESERVED_USERNAMES } from '../../src/validators/common.js';
import { signupBodySchema } from '../../src/validators/auth.js';
import { parseEnv } from '../../src/lib/env.js';

describe('Username validation rules', () => {
  it('accepts valid lowercase usernames with hyphens', () => {
    expect(validateUsernameRules('mahbubkhan')).toEqual({ valid: true, username: 'mahbubkhan' });
    expect(validateUsernameRules('dev-2026')).toEqual({ valid: true, username: 'dev-2026' });
    expect(validateUsernameRules('  Alice_Upper  '.replace('_', ''))).toEqual({
      valid: true,
      username: 'aliceupper',
    });
  });

  it('rejects too short or too long usernames', () => {
    expect(validateUsernameRules('ab').valid).toBe(false);
    expect(validateUsernameRules('a'.repeat(31)).valid).toBe(false);
  });

  it('rejects leading or trailing hyphens and special characters', () => {
    expect(validateUsernameRules('-alice').valid).toBe(false);
    expect(validateUsernameRules('alice-').valid).toBe(false);
    expect(validateUsernameRules('alice.bob').valid).toBe(false);
    expect(validateUsernameRules('alice_bob').valid).toBe(false);
  });

  it('rejects all reserved usernames', () => {
    for (const reserved of ['www', 'api', 'admin', 'master', 'qr', 'login', 'signup']) {
      expect(RESERVED_USERNAMES.has(reserved)).toBe(true);
      const res = validateUsernameRules(reserved);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('reserved');
    }
  });
});

describe('Signup Zod schema', () => {
  const validPayload = {
    username: 'alice2026',
    email: 'alice@example.com',
    password: 'StrongPassword123!',
    confirm_password: 'StrongPassword123!',
    full_name: 'Alice Wonder',
  };

  it('validates a complete valid signup payload', () => {
    const parsed = signupBodySchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects mismatched password and confirm_password on confirm_password field', () => {
    const parsed = signupBodySchema.safeParse({
      ...validPayload,
      confirm_password: 'DifferentPassword123!',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toContain('confirm_password');
      expect(parsed.error.issues[0].message).toContain('do not match');
    }
  });

  it('rejects dangerous URL schemes like javascript:', () => {
    const parsed = signupBodySchema.safeParse({
      ...validPayload,
      website: 'javascript:alert(1)',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('Environment schema validation', () => {
  it('rejects missing required variables', () => {
    expect(() => parseEnv({})).toThrowError(/Invalid environment configuration/);
  });

  it('enforces longer secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        BASE_DOMAIN: 'virtualcard.duckdns.org',
        DATABASE_URL: 'data/db/virtualcard.db',
        SESSION_SECRET: 'short_16_chars_only',
        MASTER_EMAIL: 'admin@virtualcard.duckdns.org',
        MASTER_USERNAME: 'master',
        MASTER_PASSWORD: 'shortpass',
      })
    ).toThrowError(/at least 32 characters in production/);
  });

  it('parses valid production config cleanly', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      PORT: '3000',
      BASE_DOMAIN: 'VirtualCard.DuckDNS.org',
      DATABASE_URL: 'data/db/virtualcard.db',
      SESSION_SECRET: 'a_very_long_production_session_secret_with_at_least_32_characters',
      MASTER_EMAIL: 'Admin@VirtualCard.DuckDNS.org',
      MASTER_USERNAME: 'master',
      MASTER_PASSWORD: 'StrongMasterPassword2026!',
    });
    expect(env.BASE_DOMAIN).toBe('virtualcard.duckdns.org');
    expect(env.MASTER_EMAIL).toBe('admin@virtualcard.duckdns.org');
    expect(env.PORT).toBe(3000);
  });
});
