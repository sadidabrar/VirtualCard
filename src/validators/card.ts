import { z } from 'zod';
import { hexColorSchema, optionalEmailSchema, optionalHttpUrlSchema } from './common.js';
import {
  ALLOWED_SOCIAL_PLATFORMS,
  parseExtraSocials,
  parsePhoneEntries,
  serializeExtraSocials,
  serializePhoneEntries,
} from '../lib/sanitize.js';

const checkboxBoolean = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((val) => val === true || val === 'true' || val === 'on' || val === '1');

const socialOrderSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    const rawList = Array.isArray(val) ? val : typeof val === 'string' ? val.split(',') : [];
    const allowedSet = new Set<string>(ALLOWED_SOCIAL_PLATFORMS);
    return rawList.map((s) => s.trim().toLowerCase()).filter((s) => allowedSet.has(s));
  });

const phonesJsonFieldSchema = z
  .union([z.string(), z.array(z.unknown())])
  .optional()
  .transform((val) => {
    if (typeof val === 'undefined') return undefined;
    const rawJson = typeof val === 'string' ? val : JSON.stringify(val);
    return serializePhoneEntries(parsePhoneEntries(rawJson));
  });

const extraSocialsJsonFieldSchema = z
  .union([z.string(), z.array(z.unknown())])
  .optional()
  .transform((val) => {
    if (typeof val === 'undefined') return undefined;
    const rawJson = typeof val === 'string' ? val : JSON.stringify(val);
    return serializeExtraSocials(parseExtraSocials(rawJson));
  });

export const updateCardBodySchema = z.object({
  full_name: z.string().trim().min(2, 'Full Name is required (at least 2 characters).').max(100),
  job_title: z.string().trim().max(100).optional().default(''),
  company: z.string().trim().max(100).optional().default(''),
  tagline: z.string().trim().max(200).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  maps_url: optionalHttpUrlSchema,
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .default('')
    .transform((v) => v.replace(/[^\d+\-\s().]/g, '').trim()),
  whatsapp: z
    .string()
    .trim()
    .max(32)
    .optional()
    .default('')
    .transform((v) => v.replace(/[^\d+\-\s().]/g, '').trim()),
  phones_json: phonesJsonFieldSchema,
  public_email: optionalEmailSchema,
  website: optionalHttpUrlSchema,
  theme: hexColorSchema.optional().default('#38bdf8'),
  is_published: checkboxBoolean,
  social_linkedin: optionalHttpUrlSchema,
  social_github: optionalHttpUrlSchema,
  social_x: optionalHttpUrlSchema,
  social_instagram: optionalHttpUrlSchema,
  social_facebook: optionalHttpUrlSchema,
  social_telegram: optionalHttpUrlSchema,
  social_youtube: optionalHttpUrlSchema,
  social_order: socialOrderSchema,
  extra_socials_json: extraSocialsJsonFieldSchema,
});

export type UpdateCardBody = z.infer<typeof updateCardBodySchema>;
