import { describe, it, expect } from 'vitest';
import { buildVCardString } from '../../src/lib/vcard.js';
import type { Card } from '../../src/db/schema.js';

describe('vCard 3.0 generator', () => {
  it('formats standard fields and prevents CRLF injection', () => {
    const card: Card = {
      id: 1,
      user_id: 1,
      full_name: 'Alice\r\nEvil; Name, Jr.',
      job_title: 'Principal Architect',
      company: 'Acme, Inc.',
      tagline: 'Resilient\nSystems',
      phone: '+1 555-0100',
      whatsapp: '+1 555-0199',
      public_email: 'alice@acme.com',
      website: 'https://acme.com',
      address: '123 Main St; Suite 400',
      socials: '{}',
      avatar_url: '',
      logo_url: '',
      theme: '#38bdf8',
      is_published: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const vcf = buildVCardString('alice', card, 'virtualcard.duckdns.org');
    expect(vcf).toContain('BEGIN:VCARD\r\nVERSION:3.0\r\n');
    expect(vcf).toContain('FN:Alice Evil\\; Name\\, Jr.');
    expect(vcf).toContain('ORG:Acme\\, Inc.');
    expect(vcf).toContain('ADR;TYPE=WORK:;;123 Main St\\; Suite 400;;;;');
    expect(vcf).toContain('URL;TYPE=CARD:https://alice.virtualcard.duckdns.org');
    expect(vcf).toContain('URL;TYPE=WORK:https://acme.com/');
    expect(vcf).toContain('TEL;TYPE=CELL,VOICE:+1 555-0100');
    expect(vcf).toContain('TEL;TYPE=MSG,VOICE:+1 555-0199');
    expect(vcf).toContain('END:VCARD\r\n');
  });
});
