import crypto from 'crypto';
import type { ExtraSocialEntry, ExtraSocialKind, PhoneEntry } from '../types/domain.js';

export const ALLOWED_SOCIAL_PLATFORMS = [
  'linkedin',
  'github',
  'x',
  'instagram',
  'facebook',
  'telegram',
  'youtube',
] as const;

export type SocialPlatform = (typeof ALLOWED_SOCIAL_PLATFORMS)[number];

export interface ExtraSocialPlatformMeta {
  id: string;
  label: string;
  defaultKind: ExtraSocialKind;
  placeholder: string;
}

export const EXTRA_SOCIAL_PLATFORM_OPTIONS: readonly ExtraSocialPlatformMeta[] = [
  { id: 'whatsapp', label: 'WhatsApp', defaultKind: 'number', placeholder: '+880 1711 000000' },
  { id: 'telegram', label: 'Telegram', defaultKind: 'handle', placeholder: '@username or https://t.me/...' },
  { id: 'viber', label: 'Viber', defaultKind: 'number', placeholder: '+880 1711 000000' },
  { id: 'imo', label: 'IMO', defaultKind: 'number', placeholder: '+880 1711 000000' },
  { id: 'tiktok', label: 'TikTok', defaultKind: 'handle', placeholder: '@username or https://...' },
  { id: 'discord', label: 'Discord', defaultKind: 'handle', placeholder: 'username or invite URL' },
  { id: 'snapchat', label: 'Snapchat', defaultKind: 'handle', placeholder: '@username' },
  { id: 'threads', label: 'Threads', defaultKind: 'handle', placeholder: '@username' },
  { id: 'messenger', label: 'Messenger', defaultKind: 'url', placeholder: 'https://m.me/username' },
  { id: 'behance', label: 'Behance', defaultKind: 'url', placeholder: 'https://behance.net/username' },
  { id: 'dribbble', label: 'Dribbble', defaultKind: 'url', placeholder: 'https://dribbble.com/username' },
  { id: 'wechat', label: 'WeChat', defaultKind: 'handle', placeholder: 'WeChat ID' },
  { id: 'website', label: 'Website / Portfolio', defaultKind: 'url', placeholder: 'https://...' },
  { id: 'phone', label: 'Direct Line / Hotline', defaultKind: 'number', placeholder: '+880 1711 000000' },
  { id: 'custom', label: 'Custom Account / Number', defaultKind: 'handle', placeholder: 'URL, @handle, or number' },
] as const;

export const ALLOWED_EXTRA_SOCIAL_PLATFORMS = new Set<string>(
  EXTRA_SOCIAL_PLATFORM_OPTIONS.map((opt) => opt.id)
);

export const ACCENT_PRESETS = [
  { hex: '#38bdf8', name: 'Electric Sky' },
  { hex: '#a855f7', name: 'Vivid Purple' },
  { hex: '#10b981', name: 'Emerald Green' },
  { hex: '#f43f5e', name: 'Rose Sunset' },
  { hex: '#f59e0b', name: 'Amber Gold' },
  { hex: '#6366f1', name: 'Indigo Pulse' },
] as const;

export function sanitizeText(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function sanitizeHttpUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function sanitizeMapsUrl(value: unknown): string {
  const clean = sanitizeHttpUrl(value);
  if (!clean) return '';
  try {
    const host = new URL(clean).hostname.toLowerCase();
    // Allow genuine Google Maps / OpenStreetMap / Apple Maps URLs cleanly
    const isKnownMapHost =
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host.includes('google.') ||
      host === 'maps.apple.com' ||
      host.includes('openstreetmap.org');
    return isKnownMapHost ? clean : clean;
  } catch {
    return '';
  }
}

export function buildGoogleMapsSearchUrl(address: string | null | undefined): string {
  const trimmed = sanitizeText(address, 240);
  if (!trimmed) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function sanitizeHexColor(value: unknown, fallback = '#38bdf8'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

export function sanitizePhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/[^\d+\-\s().]/g, '')
    .slice(0, 32);
}

export function formatWhatsAppUrl(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return `https://wa.me/${digits}`;
}

export function parsePhoneEntries(
  rawJson: string | null | undefined,
  fallbackPrimary?: string | null,
  fallbackWhatsapp?: string | null
): PhoneEntry[] {
  const entries: PhoneEntry[] = [];
  const seenNumbers = new Set<string>();

  const pushEntry = (label: string, number: string, isWhatsapp: boolean, id?: string) => {
    const cleanNum = sanitizePhone(number);
    if (!cleanNum) return;
    const normKey = cleanNum.replace(/\s+/g, '');
    if (seenNumbers.has(normKey)) {
      if (isWhatsapp) {
        const existing = entries.find((e) => e.number.replace(/\s+/g, '') === normKey);
        if (existing) existing.is_whatsapp = true;
      }
      return;
    }
    seenNumbers.add(normKey);
    entries.push({
      id: id && /^[a-zA-Z0-9_-]{4,40}$/.test(id) ? id : crypto.randomUUID(),
      label: sanitizeText(label, 40) || (entries.length === 0 ? 'Primary' : 'Phone'),
      number: cleanNum,
      is_whatsapp: Boolean(isWhatsapp),
    });
  };

  if (fallbackPrimary) {
    const cleanPrimary = sanitizePhone(fallbackPrimary);
    const cleanWa = sanitizePhone(fallbackWhatsapp);
    if (cleanPrimary) {
      pushEntry(
        'Mobile',
        cleanPrimary,
        Boolean(cleanWa && cleanWa.replace(/\D/g, '') === cleanPrimary.replace(/\D/g, '')),
        'primary'
      );
    }
  }

  if (rawJson) {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed.slice(0, 15)) {
          if (!item || typeof item !== 'object') continue;
          const row = item as Record<string, unknown>;
          pushEntry(
            typeof row.label === 'string' ? row.label : 'Phone',
            typeof row.number === 'string' ? row.number : '',
            Boolean(row.is_whatsapp),
            typeof row.id === 'string' ? row.id : undefined
          );
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  if (fallbackWhatsapp) {
    const cleanWa = sanitizePhone(fallbackWhatsapp);
    if (cleanWa) {
      pushEntry('WhatsApp', cleanWa, true, 'whatsapp');
    }
  }

  return entries;
}

export function serializePhoneEntries(entries: PhoneEntry[]): string {
  return JSON.stringify(entries.slice(0, 15));
}

export function parseExtraSocials(rawJson: string | null | undefined): ExtraSocialEntry[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    const results: ExtraSocialEntry[] = [];
    for (const item of parsed.slice(0, 25)) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const platform =
        typeof row.platform === 'string' && ALLOWED_EXTRA_SOCIAL_PLATFORMS.has(row.platform)
          ? row.platform
          : 'custom';
      const meta = EXTRA_SOCIAL_PLATFORM_OPTIONS.find((opt) => opt.id === platform);
      const kind: ExtraSocialKind =
        row.kind === 'url' || row.kind === 'number' || row.kind === 'handle'
          ? row.kind
          : meta?.defaultKind || 'handle';
      const rawValue = typeof row.value === 'string' ? row.value.trim() : '';
      if (!rawValue) continue;

      let value = '';
      if (kind === 'url' || /^https?:\/\//i.test(rawValue)) {
        value = sanitizeHttpUrl(rawValue);
      } else if (kind === 'number') {
        value = sanitizePhone(rawValue);
      } else {
        value = sanitizeText(rawValue, 160);
      }
      if (!value) continue;

      results.push({
        id:
          typeof row.id === 'string' && /^[a-zA-Z0-9_-]{4,40}$/.test(row.id)
            ? row.id
            : crypto.randomUUID(),
        platform,
        label: sanitizeText(row.label, 48) || meta?.label || 'Social',
        value,
        kind: /^https?:\/\//i.test(value) ? 'url' : kind,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function serializeExtraSocials(entries: ExtraSocialEntry[]): string {
  return JSON.stringify(entries.slice(0, 25));
}

export function resolveExtraSocialHref(entry: ExtraSocialEntry): string | null {
  const val = entry.value.trim();
  if (!val) return null;

  const directUrl = sanitizeHttpUrl(val);
  if (directUrl) return directUrl;

  if (entry.platform === 'whatsapp') {
    return formatWhatsAppUrl(val) || null;
  }
  if (entry.kind === 'number' || entry.platform === 'phone' || entry.platform === 'viber' || entry.platform === 'imo') {
    const cleanPhone = sanitizePhone(val);
    return cleanPhone ? `tel:${cleanPhone}` : null;
  }

  const handle = val.replace(/^@/, '').trim();
  if (!handle || /\s/.test(handle)) return null;

  switch (entry.platform) {
    case 'telegram':
      return `https://t.me/${encodeURIComponent(handle)}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
    case 'snapchat':
      return `https://www.snapchat.com/add/${encodeURIComponent(handle)}`;
    case 'threads':
      return `https://www.threads.net/@${encodeURIComponent(handle)}`;
    case 'messenger':
      return `https://m.me/${encodeURIComponent(handle)}`;
    default:
      return null;
  }
}

export function parseSocials(
  rawJson: string | null | undefined
): Array<{ platform: SocialPlatform; url: string }> {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return [];
    const results: Array<{ platform: SocialPlatform; url: string }> = [];
    for (const [key, val] of Object.entries(parsed)) {
      if ((ALLOWED_SOCIAL_PLATFORMS as readonly string[]).includes(key)) {
        const cleanUrl = sanitizeHttpUrl(val);
        if (cleanUrl) {
          results.push({ platform: key as SocialPlatform, url: cleanUrl });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function buildSocialsJson(input: Record<string, unknown>, order?: string[]): string {
  const sanitized: Record<string, string> = {};
  const keysToProcess =
    Array.isArray(order) && order.length > 0
      ? [...order, ...ALLOWED_SOCIAL_PLATFORMS]
      : [...ALLOWED_SOCIAL_PLATFORMS];

  const seen = new Set<string>();
  for (const key of keysToProcess) {
    if (seen.has(key)) continue;
    seen.add(key);
    if ((ALLOWED_SOCIAL_PLATFORMS as readonly string[]).includes(key)) {
      const cleanUrl = sanitizeHttpUrl(input[key]);
      if (cleanUrl) {
        sanitized[key] = cleanUrl;
      }
    }
  }
  return JSON.stringify(sanitized);
}

export const SOCIAL_PLATFORM_META: Record<SocialPlatform, { label: string; placeholder: string }> =
  {
    linkedin: { label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
    github: { label: 'GitHub', placeholder: 'https://github.com/username' },
    x: { label: 'X / Twitter', placeholder: 'https://x.com/username' },
    instagram: { label: 'Instagram', placeholder: 'https://instagram.com/username' },
    facebook: { label: 'Facebook', placeholder: 'https://facebook.com/username' },
    telegram: { label: 'Telegram', placeholder: 'https://t.me/username' },
    youtube: { label: 'YouTube', placeholder: 'https://youtube.com/@channel' },
  };

export function getOrderedSocialFields(
  rawJson: string | null | undefined
): Array<{ platform: SocialPlatform; label: string; placeholder: string; url: string }> {
  const existing = parseSocials(rawJson);
  const existingMap = new Map(existing.map((e) => [e.platform, e.url]));
  const orderedKeys: SocialPlatform[] = [
    ...existing.map((e) => e.platform),
    ...ALLOWED_SOCIAL_PLATFORMS.filter((p) => !existingMap.has(p)),
  ];

  return orderedKeys.map((platform) => ({
    platform,
    label: SOCIAL_PLATFORM_META[platform].label,
    placeholder: SOCIAL_PLATFORM_META[platform].placeholder,
    url: existingMap.get(platform) || '',
  }));
}
