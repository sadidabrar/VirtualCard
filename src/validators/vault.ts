import crypto from 'crypto';
import { z } from 'zod';
import { sanitizeHttpUrl, sanitizeText } from '../lib/sanitize.js';
import type { VaultDocumentCategory, VaultProfileData } from '../types/domain.js';

export const VAULT_EXAM_TYPES = [
  'PSC',
  'JSC',
  'SSC',
  'HSC',
  'Diploma',
  'Bachelor / Honours',
  'Master / Postgrad',
  'PhD / Doctorate',
  'Other',
] as const;

export const VAULT_DOC_CATEGORIES: ReadonlyArray<{
  value: VaultDocumentCategory;
  label: string;
}> = [
  { value: 'certificate', label: 'Certificate' },
  { value: 'academic', label: 'Academic Transcript / Marksheet' },
  { value: 'identity', label: 'Identity / NID / Passport' },
  { value: 'purchase_paper', label: 'Purchase Paper / Invoice' },
  { value: 'warranty_paper', label: 'Warranty Paper / Guarantee' },
  { value: 'financial', label: 'Tax / TIN / Financial Paper' },
  { value: 'medical', label: 'Medical / Health Record' },
  { value: 'other', label: 'Other Important Document' },
] as const;

const VALID_DOC_CATEGORY_SET = new Set<string>(VAULT_DOC_CATEGORIES.map((c) => c.value));

export const vaultSetupPasscodeSchema = z
  .object({
    passcode: z
      .string()
      .min(6, 'Vault passcode must be at least 6 characters long.')
      .max(128, 'Vault passcode must not exceed 128 characters.'),
    confirm_passcode: z.string().min(1, 'Please confirm your vault passcode.'),
  })
  .refine((data) => data.passcode === data.confirm_passcode, {
    message: 'Vault passcodes do not match.',
    path: ['confirm_passcode'],
  });

export const vaultUnlockPasscodeSchema = z.object({
  passcode: z.string().min(1, 'Please enter your vault passcode.').max(128),
});

export const vaultChangePasscodeSchema = z
  .object({
    current_passcode: z.string().min(1, 'Enter your current vault passcode.').max(128),
    new_passcode: z
      .string()
      .min(6, 'New vault passcode must be at least 6 characters long.')
      .max(128),
    confirm_new_passcode: z.string().min(1, 'Confirm your new vault passcode.'),
  })
  .refine((data) => data.new_passcode === data.confirm_new_passcode, {
    message: 'New vault passcodes do not match.',
    path: ['confirm_new_passcode'],
  });

const customFieldSchema = z.object({
  id: z.string().max(48).optional(),
  label: z.string().trim().max(80).default(''),
  value: z.string().trim().max(500).default(''),
});

const semesterSchema = z.object({
  id: z.string().max(48).optional(),
  term: z.string().trim().max(80).default(''),
  gpa: z.string().trim().max(40).default(''),
  credits: z.string().trim().max(40).default(''),
  remarks: z.string().trim().max(200).default(''),
});

const academicSchema = z.object({
  id: z.string().max(48).optional(),
  examType: z.string().trim().max(80).default('SSC'),
  customExamType: z.string().trim().max(80).default(''),
  institute: z.string().trim().max(160).default(''),
  boardOrUniversity: z.string().trim().max(160).default(''),
  passingYear: z.string().trim().max(32).default(''),
  instituteRoll: z.string().trim().max(64).default(''),
  examRoll: z.string().trim().max(64).default(''),
  registrationNo: z.string().trim().max(64).default(''),
  overallResult: z.string().trim().max(80).default(''),
  semesters: z.array(semesterSchema).max(32).default([]),
  customFields: z.array(customFieldSchema).max(20).default([]),
  notes: z.string().trim().max(500).default(''),
});

const presentAddressSchema = z.object({
  id: z.string().max(48).optional(),
  label: z.string().trim().max(80).default('Present Address'),
  addressLine: z.string().trim().max(300).default(''),
  city: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().max(32).default(''),
  mapsUrl: z.string().trim().max(350).default(''),
  notes: z.string().trim().max(300).default(''),
});

const permanentAddressSchema = z.object({
  addressLine: z.string().trim().max(300).default(''),
  villageOrArea: z.string().trim().max(120).default(''),
  district: z.string().trim().max(100).default(''),
  country: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().max(32).default(''),
  mapsUrl: z.string().trim().max(350).default(''),
  notes: z.string().trim().max(300).default(''),
});

const customSectionSchema = z.object({
  id: z.string().max(48).optional(),
  title: z.string().trim().max(100).default('Custom Section'),
  fields: z.array(customFieldSchema).max(40).default([]),
});

const vaultProfileStructuredSchema = z.object({
  identity: z
    .object({
      nid: z.string().trim().max(80).default(''),
      birthCertificateNo: z.string().trim().max(80).default(''),
      passportNumber: z.string().trim().max(80).default(''),
      tinNumber: z.string().trim().max(80).default(''),
      drivingLicenseNumber: z.string().trim().max(80).default(''),
      bloodGroup: z.string().trim().max(24).default(''),
      customFields: z.array(customFieldSchema).max(40).default([]),
    })
    .default({
      nid: '',
      birthCertificateNo: '',
      passportNumber: '',
      tinNumber: '',
      drivingLicenseNumber: '',
      bloodGroup: '',
      customFields: [],
    }),
  academics: z.array(academicSchema).max(30).default([]),
  presentAddresses: z.array(presentAddressSchema).max(20).default([]),
  permanentAddress: permanentAddressSchema.default({
    addressLine: '',
    villageOrArea: '',
    district: '',
    country: '',
    postalCode: '',
    mapsUrl: '',
    notes: '',
  }),
  customSections: z.array(customSectionSchema).max(25).default([]),
});

export function defaultVaultProfileData(): VaultProfileData {
  return {
    identity: {
      nid: '',
      birthCertificateNo: '',
      passportNumber: '',
      tinNumber: '',
      drivingLicenseNumber: '',
      bloodGroup: '',
      customFields: [],
    },
    academics: [],
    presentAddresses: [],
    permanentAddress: {
      addressLine: '',
      villageOrArea: '',
      district: '',
      country: '',
      postalCode: '',
      mapsUrl: '',
      notes: '',
    },
    customSections: [],
  };
}

function makeId(raw?: string): string {
  return raw && /^[a-zA-Z0-9_-]{4,48}$/.test(raw) ? raw : crypto.randomUUID();
}

export function normalizeVaultProfileInput(rawInput: unknown): VaultProfileData {
  let obj: unknown = rawInput;
  if (rawInput && typeof rawInput === 'object' && 'payload' in rawInput) {
    const wrapped = (rawInput as { payload?: unknown }).payload;
    obj = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped;
  } else if (typeof rawInput === 'string') {
    obj = JSON.parse(rawInput);
  }

  const parsed = vaultProfileStructuredSchema.parse(obj);
  return {
    identity: {
      ...parsed.identity,
      customFields: parsed.identity.customFields
        .filter((f) => f.label || f.value)
        .map((f) => ({ id: makeId(f.id), label: f.label, value: f.value })),
    },
    academics: parsed.academics.map((a) => ({
      ...a,
      id: makeId(a.id),
      semesters: a.semesters
        .filter((s) => s.term || s.gpa || s.credits || s.remarks)
        .map((s) => ({ ...s, id: makeId(s.id) })),
      customFields: a.customFields
        .filter((f) => f.label || f.value)
        .map((f) => ({ id: makeId(f.id), label: f.label, value: f.value })),
    })),
    presentAddresses: parsed.presentAddresses
      .filter((addr) => addr.label || addr.addressLine || addr.city)
      .map((addr) => ({
        ...addr,
        id: makeId(addr.id),
        mapsUrl: sanitizeHttpUrl(addr.mapsUrl),
      })),
    permanentAddress: {
      ...parsed.permanentAddress,
      mapsUrl: sanitizeHttpUrl(parsed.permanentAddress.mapsUrl),
    },
    customSections: parsed.customSections
      .filter((sec) => sec.title || sec.fields.some((f) => f.label || f.value))
      .map((sec) => ({
        id: makeId(sec.id),
        title: sec.title || 'Custom Section',
        fields: sec.fields
          .filter((f) => f.label || f.value)
          .map((f) => ({ id: makeId(f.id), label: f.label, value: f.value })),
      })),
  };
}

export const vaultDocumentUploadMetaSchema = z.object({
  title: z.string().trim().min(1, 'Document title is required.').max(140),
  category: z
    .string()
    .trim()
    .optional()
    .default('other')
    .transform((v): VaultDocumentCategory =>
      VALID_DOC_CATEGORY_SET.has(v) ? (v as VaultDocumentCategory) : 'other'
    ),
  linked_ref: z.string().trim().max(120).optional().default(''),
  document_date: z.string().trim().max(32).optional().default(''),
  expiry_date: z.string().trim().max(32).optional().default(''),
  tags: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((t) => sanitizeText(t, 40))
        .filter(Boolean)
        .slice(0, 12)
    ),
  notes: z.string().trim().max(1000).optional().default(''),
});

export const vaultDocumentUpdateMetaSchema = vaultDocumentUploadMetaSchema.extend({
  ocr_text: z.string().max(100_000).optional().default(''),
});

export const vaultDocIdParamSchema = z.object({
  docId: z.coerce.number().int().positive(),
});

export const vaultSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  category: z
    .enum(['all', 'identity', 'academic', 'address', 'document', 'custom'])
    .optional()
    .default('all'),
});
