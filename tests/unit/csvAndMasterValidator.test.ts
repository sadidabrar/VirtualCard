import { describe, it, expect } from 'vitest';
import { buildMasterExportCsv, escapeCsvCell } from '../../src/lib/csv.js';
import {
  masterListQuerySchema,
  masterResetPasswordSchema,
  masterUpdateUserCardSchema,
  userIdParamSchema,
} from '../../src/validators/master.js';

describe('CSV export escaping and formula protection', () => {
  it('neutralizes spreadsheet formula prefixes and escapes commas/quotes/newlines', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell('Normal Name')).toBe('Normal Name');
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+CMD|calc')).toBe("'+CMD|calc");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell('Acme, "Inc."')).toBe('"Acme, ""Inc."""');
    expect(escapeCsvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
  });

  it('builds a full CSV with headers and neutralized rows', () => {
    const csv = buildMasterExportCsv(
      [
        {
          user: {
            id: 2,
            username: 'alice',
            email: 'alice@example.com',
            role: 'owner',
            status: 'active',
            created_at: '2026-11-01T00:00:00.000Z',
            updated_at: '2026-11-01T00:00:00.000Z',
          },
          card: {
            id: 2,
            user_id: 2,
            full_name: '=HYPERLINK("http://evil")',
            job_title: 'Engineer',
            company: 'Acme, Co',
            tagline: 'Hello',
            phone: '+123456',
            whatsapp: '+123456',
            phones_json: '[]',
            public_email: 'alice@example.com',
            website: 'https://alice.dev',
            address: 'NYC',
            maps_url: '',
            socials: '{}',
            extra_socials_json: '[]',
            avatar_url: '',
            logo_url: '',
            theme: '#38bdf8',
            is_published: true,
            created_at: '2026-11-01T00:00:00.000Z',
            updated_at: '2026-11-01T00:00:00.000Z',
          },
        },
      ],
      'virtualcard.duckdns.org'
    );

    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('id,username,email,role,status');
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(lines[1]).toContain('"Acme, Co"');
    expect(lines[1]).toContain('https://alice.virtualcard.duckdns.org');
  });
});

describe('Master admin validators', () => {
  it('validates userIdParamSchema and masterListQuerySchema defaults', () => {
    expect(userIdParamSchema.parse({ id: '42' })).toEqual({ id: 42 });
    expect(userIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(userIdParamSchema.safeParse({ id: '-5' }).success).toBe(false);

    expect(masterListQuerySchema.parse({})).toEqual({
      q: '',
      status: 'all',
      page: 1,
      limit: 20,
    });
    expect(masterListQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  });

  it('validates masterUpdateUserCardSchema and masterResetPasswordSchema', () => {
    const validUpdate = masterUpdateUserCardSchema.parse({
      email: 'ALICE@Example.com',
      role: 'owner',
      status: 'active',
      full_name: 'Alice Admin-Edited',
      theme: '#10b981',
    });
    expect(validUpdate.email).toBe('alice@example.com');
    expect(validUpdate.is_published).toBe(false);

    const mismatch = masterResetPasswordSchema.safeParse({
      new_password: 'NewPassword123!',
      confirm_password: 'DifferentPassword123!',
    });
    expect(mismatch.success).toBe(false);

    const validReset = masterResetPasswordSchema.parse({
      new_password: 'NewPassword123!',
      confirm_password: 'NewPassword123!',
    });
    expect(validReset.new_password).toBe('NewPassword123!');
  });
});
