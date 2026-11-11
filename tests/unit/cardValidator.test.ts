import { describe, it, expect } from 'vitest';
import { updateCardBodySchema } from '../../src/validators/card.js';

describe('updateCardBodySchema', () => {
  it('coerces checkbox boolean values and sanitizes phone numbers', () => {
    const parsed = updateCardBodySchema.parse({
      full_name: '  Mahbub Khan  ',
      job_title: 'Principal Architect',
      phone: '+880 (171) 123-4567 !@#',
      whatsapp: '+1-555-0199',
      is_published: 'on',
      theme: '#10B981',
    });

    expect(parsed.full_name).toBe('Mahbub Khan');
    expect(parsed.is_published).toBe(true);
    expect(parsed.phone).toBe('+880 (171) 123-4567');
    expect(parsed.whatsapp).toBe('+1-555-0199');
    expect(parsed.theme).toBe('#10b981');

    const tooLongPhone = updateCardBodySchema.safeParse({
      full_name: 'Mahbub Khan',
      phone: '1'.repeat(40),
    });
    expect(tooLongPhone.success).toBe(false);

    const unchecked = updateCardBodySchema.parse({
      full_name: 'Mahbub Khan',
    });
    expect(unchecked.is_published).toBe(false);
    expect(unchecked.theme).toBe('#38bdf8');
  });

  it('parses and filters social_order against allowed platforms', () => {
    const parsed = updateCardBodySchema.parse({
      full_name: 'Alice Builder',
      social_github: 'https://github.com/alice',
      social_linkedin: 'https://linkedin.com/in/alice',
      social_order: 'github, malicious_key, linkedin, youtube',
    });

    expect(parsed.social_order).toEqual(['github', 'linkedin', 'youtube']);
    expect(parsed.social_github).toBe('https://github.com/alice');
    expect(parsed.social_linkedin).toBe('https://linkedin.com/in/alice');
  });

  it('rejects javascript: URLs, invalid hex colors, and short full_name', () => {
    const badName = updateCardBodySchema.safeParse({ full_name: 'A' });
    expect(badName.success).toBe(false);

    const badTheme = updateCardBodySchema.safeParse({
      full_name: 'Valid Name',
      theme: 'red; background: url(javascript:alert(1))',
    });
    expect(badTheme.success).toBe(false);

    const badUrl = updateCardBodySchema.safeParse({
      full_name: 'Valid Name',
      website: 'javascript:alert(1)',
    });
    expect(badUrl.success).toBe(false);

    const badSocial = updateCardBodySchema.safeParse({
      full_name: 'Valid Name',
      social_x: 'ftp://x.com/user',
    });
    expect(badSocial.success).toBe(false);
  });
});
