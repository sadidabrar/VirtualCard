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
