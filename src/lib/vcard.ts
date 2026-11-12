import type { Card } from '../db/schema.js';
import { getCanonicalTenantUrl } from './url.js';
import {
  buildGoogleMapsSearchUrl,
  parseExtraSocials,
  parsePhoneEntries,
  parseSocials,
  resolveExtraSocialHref,
  sanitizeHttpUrl,
  sanitizeMapsUrl,
} from './sanitize.js';

function escapeVCardValue(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

export interface VCardBuildOptions {
  phoneIndex?: number;
}

export function buildVCardString(
  username: string,
  card: Card,
  baseDomain: string,
  options?: VCardBuildOptions
): string {
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

  const phoneEntries = parsePhoneEntries(card.phones_json, card.phone, card.whatsapp);
  const hasExplicitPhonesJson =
    typeof card.phones_json === 'string' &&
    card.phones_json.trim() !== '' &&
    card.phones_json.trim() !== '[]';

  if (
    options?.phoneIndex !== undefined &&
    Number.isInteger(options.phoneIndex) &&
    options.phoneIndex >= 0 &&
    options.phoneIndex < phoneEntries.length
  ) {
    const picked = phoneEntries[options.phoneIndex];
    lines.push(`item1.TEL;TYPE=CELL,VOICE:${escapeVCardValue(picked.number)}`);
    lines.push(`item1.X-ABLabel:${escapeVCardValue(picked.label || 'Phone')}`);
    const cardUrl = getCanonicalTenantUrl(username, baseDomain);
    lines.push(`URL;TYPE=CARD:${cardUrl}`);
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  if (!hasExplicitPhonesJson) {
    if (card.phone) {
      lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(card.phone)}`);
    }
    if (card.whatsapp && card.whatsapp !== card.phone) {
      lines.push(`TEL;TYPE=MSG,VOICE:${escapeVCardValue(card.whatsapp)}`);
    }
  } else {
    phoneEntries.forEach((entry, idx) => {
      if (idx === 0) {
        lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(entry.number)}`);
      } else {
        const itemNum = idx + 1;
        const vcfType = entry.is_whatsapp ? 'MSG,VOICE' : 'VOICE';
        lines.push(`item${itemNum}.TEL;TYPE=${vcfType}:${escapeVCardValue(entry.number)}`);
        lines.push(`item${itemNum}.X-ABLabel:${escapeVCardValue(entry.label || 'Phone')}`);
      }
    });
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

  const mapsUrl =
    sanitizeMapsUrl(card.maps_url) ||
    (card.address ? buildGoogleMapsSearchUrl(card.address) : '');
  if (mapsUrl && sanitizeMapsUrl(card.maps_url)) {
    lines.push(`URL;TYPE=MAP:${mapsUrl}`);
  }

  if (card.address) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(card.address)};;;;`);
  }

  const socials = parseSocials(card.socials);
  for (const s of socials) {
    lines.push(`X-SOCIALPROFILE;type=${escapeVCardValue(s.platform)}:${escapeVCardValue(s.url)}`);
  }

  const extraSocials = parseExtraSocials(card.extra_socials_json);
  for (const ex of extraSocials) {
    const href = resolveExtraSocialHref(ex);
    if (href && /^https?:\/\//i.test(href)) {
      lines.push(`X-SOCIALPROFILE;type=${escapeVCardValue(ex.platform)}:${escapeVCardValue(href)}`);
    }
  }

  if (card.tagline) {
    lines.push(`NOTE:${escapeVCardValue(card.tagline)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
