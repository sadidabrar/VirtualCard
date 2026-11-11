import type { Card } from '../db/schema.js';
import { getCanonicalTenantUrl } from './url.js';
import { sanitizeHttpUrl } from './sanitize.js';

function escapeVCardValue(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

export function buildVCardString(username: string, card: Card, baseDomain: string): string {
  const fullName = escapeVCardValue(card.full_name || username);
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : fullName;
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${fullName}`,
    `N:${lastName};${firstName};;;`,
  ];

  if (card.job_title) {
    lines.push(`TITLE:${escapeVCardValue(card.job_title)}`);
  }
  if (card.company) {
    lines.push(`ORG:${escapeVCardValue(card.company)}`);
  }
  if (card.phone) {
    lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(card.phone)}`);
  }
  if (card.whatsapp && card.whatsapp !== card.phone) {
    lines.push(`TEL;TYPE=MSG,VOICE:${escapeVCardValue(card.whatsapp)}`);
  }
  if (card.public_email) {
    lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVCardValue(card.public_email)}`);
  }

  const cardUrl = getCanonicalTenantUrl(username, baseDomain);
  lines.push(`URL;TYPE=CARD:${cardUrl}`);

  const websiteUrl = sanitizeHttpUrl(card.website);
  if (websiteUrl) {
    lines.push(`URL;TYPE=WORK:${websiteUrl}`);
  }

  if (card.address) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(card.address)};;;;`);
  }
  if (card.tagline) {
    lines.push(`NOTE:${escapeVCardValue(card.tagline)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
