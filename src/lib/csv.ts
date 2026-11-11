import type { AdminUserWithCard } from '../types/domain.js';
import { getCanonicalTenantUrl } from './url.js';

const CSV_FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV cell per RFC 4180 and neutralizes spreadsheet formula injection.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);
  if (CSV_FORMULA_PREFIX_REGEX.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

const EXPORT_HEADERS = [
  'id',
  'username',
  'email',
  'role',
  'status',
  'full_name',
  'job_title',
  'company',
  'phone',
  'whatsapp',
  'public_email',
  'website',
  'address',
  'theme',
  'is_published',
  'card_url',
  'created_at',
  'updated_at',
];

export function buildMasterExportCsv(rows: AdminUserWithCard[], baseDomain: string): string {
  const lines = [EXPORT_HEADERS.join(',')];

  for (const { user, card } of rows) {
    const cells = [
      user.id,
      user.username,
      user.email,
      user.role,
      user.status,
      card?.full_name ?? '',
      card?.job_title ?? '',
      card?.company ?? '',
      card?.phone ?? '',
      card?.whatsapp ?? '',
      card?.public_email ?? '',
      card?.website ?? '',
      card?.address ?? '',
      card?.theme ?? '#38bdf8',
      card ? (card.is_published ? 'true' : 'false') : 'false',
      getCanonicalTenantUrl(user.username, baseDomain),
      user.created_at,
      user.updated_at,
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}
