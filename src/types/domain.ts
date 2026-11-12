import type { Logger } from 'pino';
import type { User, Card } from '../db/schema.js';

export type { User, Card };

export type SafeUser = Omit<User, 'password_hash'>;

export interface AdminUserWithCard {
  user: SafeUser;
  card: Card | null;
}

export interface MasterDashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  publishedCards: number;
  recentSignups7d: number;
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

export interface UsernameAvailabilityResult {
  available: boolean;
  username: string;
  reason?: string;
}

export interface PhoneEntry {
  id: string;
  label: string;
  number: string;
  is_whatsapp: boolean;
}

export type ExtraSocialKind = 'url' | 'number' | 'handle';

export interface ExtraSocialEntry {
  id: string;
  platform: string;
  label: string;
  value: string;
  kind: ExtraSocialKind;
}

export interface VaultCustomField {
  id: string;
  label: string;
  value: string;
}

export interface VaultIdentityInfo {
  nid: string;
  birthCertificateNo: string;
  passportNumber: string;
  tinNumber: string;
  drivingLicenseNumber: string;
  bloodGroup: string;
  customFields: VaultCustomField[];
}

export interface VaultSemesterResult {
  id: string;
  term: string;
  gpa: string;
  credits: string;
  remarks: string;
}

export interface VaultAcademicRecord {
  id: string;
  examType: string;
  customExamType: string;
  institute: string;
  boardOrUniversity: string;
  passingYear: string;
  instituteRoll: string;
  examRoll: string;
  registrationNo: string;
  overallResult: string;
  semesters: VaultSemesterResult[];
  customFields: VaultCustomField[];
  notes: string;
}

export interface VaultPresentAddress {
  id: string;
  label: string;
  addressLine: string;
  city: string;
  postalCode: string;
  mapsUrl: string;
  notes: string;
}

export interface VaultPermanentAddress {
  addressLine: string;
  villageOrArea: string;
  district: string;
  country: string;
  postalCode: string;
  mapsUrl: string;
  notes: string;
}

export interface VaultCustomSection {
  id: string;
  title: string;
  fields: VaultCustomField[];
}

export interface VaultProfileData {
  identity: VaultIdentityInfo;
  academics: VaultAcademicRecord[];
  presentAddresses: VaultPresentAddress[];
  permanentAddress: VaultPermanentAddress;
  customSections: VaultCustomSection[];
}

export type VaultDocumentCategory =
  | 'certificate'
  | 'identity'
  | 'academic'
  | 'purchase_paper'
  | 'warranty_paper'
  | 'financial'
  | 'medical'
  | 'other';

export interface VaultDocumentMeta {
  title: string;
  category: VaultDocumentCategory;
  linkedRef: string;
  documentDate: string;
  expiryOrWarrantyDate: string;
  originalFilename: string;
  notes: string;
  ocrText: string;
  ocrStatus: 'completed' | 'empty' | 'error';
  ocrConfidence: number;
  customTags: string[];
}

export interface VaultDocumentSummary extends VaultDocumentMeta {
  id: number;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSearchSnippetSegment {
  text: string;
  highlighted: boolean;
}

export interface VaultSearchHit {
  kind: 'identity' | 'academic' | 'address' | 'document' | 'custom';
  sectionAnchor: string;
  title: string;
  subtitle: string;
  documentId?: number;
  score: number;
  snippetSegments: VaultSearchSnippetSegment[];
}

export interface SignupInputDto {
  username: string;
  email: string;
  password: string;
  full_name: string;
  job_title: string;
  company: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  public_email: string;
  website: string;
  socials: string;
  avatar_url: string;
  theme: string;
}

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: number;
    username?: string;
    role?: 'owner' | 'master';
    recentSignupUsername?: string;
    domainBound?: string;
    vaultWrappedDek?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      tenant: string | null;
      tenantUser?: User;
      tenantCard?: Card;
      isTenantRequest?: boolean;
      currentUser?: SafeUser;
      multerError?: string;
      vaultDek?: Buffer;
    }
  }
}
