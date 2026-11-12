import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  decryptVaultFileBuffer,
  decryptVaultJson,
  encryptVaultFileBuffer,
  encryptVaultJson,
  generateVaultKeyMaterial,
  rewrapVaultDek,
  unwrapDekFromSession,
  unwrapVaultDek,
  wrapDekForSession,
} from '../../src/lib/vaultCrypto.js';
import { processVaultDocumentFile, terminateOcrWorker } from '../../src/lib/documentProcessor.js';
import { searchVaultIndex } from '../../src/lib/vaultSearch.js';
import { normalizeVaultProfileInput } from '../../src/validators/vault.js';
import { buildVCardString } from '../../src/lib/vcard.js';
import type { Card } from '../../src/db/schema.js';
import type { VaultDocumentSummary } from '../../src/types/domain.js';

function createBaseCard(): Card {
  return {
    id: 1,
    user_id: 1,
    full_name: 'Tariq Ahmed',
    job_title: 'Solutions Architect',
    company: 'Dhaka Tech',
    tagline: 'Reliable systems',
    address: 'Banani, Dhaka',
    maps_url: 'https://maps.google.com/?q=Banani,Dhaka',
    phone: '+8801711000001',
    whatsapp: '+8801711000002',
    phones_json: JSON.stringify([
      { id: 'primary', label: 'Mobile', number: '+8801711000001', is_whatsapp: false },
      { id: 'office', label: 'Office Hotline', number: '+8801811000099', is_whatsapp: true },
    ]),
    public_email: 'tariq@example.com',
    website: 'https://example.com',
    socials: JSON.stringify([{ platform: 'linkedin', url: 'https://linkedin.com/in/tariq' }]),
    extra_socials_json: JSON.stringify([
      { id: 's1', platform: 'telegram', label: 'Work Telegram', value: '@tariqwork', kind: 'handle' },
    ]),
    avatar_url: '',
    theme: '#38bdf8',
    is_published: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('Zero-Knowledge Vault Cryptography, OCR & Search', () => {
  afterAll(async () => {
    await terminateOcrWorker();
  });

  it('encrypts/decrypts with Argon2id KEK and rejects wrong passcodes or split secrets', async () => {
    const material = await generateVaultKeyMaterial('CorrectPass123!');
    const cfgRow = {
      kdf_salt: material.kdfSalt,
      encrypted_dek: material.encryptedDek,
      dek_iv: material.dekIv,
      dek_tag: material.dekTag,
    };

    const dek = await unwrapVaultDek('CorrectPass123!', cfgRow);
    expect(dek).not.toBeNull();
    expect(dek!.length).toBe(32);

    const wrongDek = await unwrapVaultDek('WrongPass123!', cfgRow);
    expect(wrongDek).toBeNull();

    // Split session sealing requires BOTH cookie secret and session payload
    const sealed = wrapDekForSession(dek!);
    expect(sealed.secretB64.length).toBeGreaterThan(20);
    const unsealed = unwrapDekFromSession(sealed.secretB64, sealed.wrappedDekJson);
    expect(unsealed).toEqual(dek);

    const badSecret = unwrapDekFromSession('invalid_secret', sealed.wrappedDekJson);
    expect(badSecret).toBeNull();

    // Re-wrap under a new passcode keeps same underlying DEK
    const secretPayload = { secretCode: 'NID-99887766' };
    const encJson = encryptVaultJson(dek!, secretPayload);
    const encFile = encryptVaultFileBuffer(dek!, Buffer.from('PDF-RAW-CONTENT'));

    const rewrapped = await rewrapVaultDek(dek!, 'NewStrongPass99!');
    const newDek = await unwrapVaultDek('NewStrongPass99!', {
      kdf_salt: rewrapped.kdfSalt,
      encrypted_dek: rewrapped.encryptedDek,
      dek_iv: rewrapped.dekIv,
      dek_tag: rewrapped.dekTag,
    });
    expect(newDek).toEqual(dek);
    expect(decryptVaultJson<typeof secretPayload>(newDek!, encJson)).toEqual(secretPayload);
    expect(
      decryptVaultFileBuffer(newDek!, encFile.encryptedBuffer, encFile.iv, encFile.tag).toString('utf8')
    ).toBe('PDF-RAW-CONTENT');
  });

  it('auto-compresses image documents to smaller WebP and extracts offline OCR text', async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="240">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="48" y="105" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="bold" fill="#000000">
          NID 987654321
        </text>
        <text x="48" y="180" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#111111">
          WARRANTY CERT 2026
        </text>
      </svg>
    `;
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const processed = await processVaultDocumentFile({
      originalname: 'nid-scan.png',
      mimetype: 'image/png',
      size: pngBuffer.length,
      buffer: pngBuffer,
    } as Express.Multer.File);

    expect(processed.mimeType).toBe('image/webp');
    expect(processed.compressedSize).toBeLessThan(processed.originalSize);
    expect(processed.ocrStatus).toBe('completed');
    expect(processed.ocrText).toContain('987654321');
    expect(processed.ocrConfidence).toBeGreaterThan(40);
  });

  it('indexes NID, nested semester GPA, addresses, custom sections and OCR document text', () => {
    const profile = normalizeVaultProfileInput({
      identity: {
        nid: '1995269011223',
        passportNumber: 'A01928374',
        tinNumber: '554433221100',
        customFields: [{ label: 'Smart Card', value: 'SC-7788' }],
      },
      academics: [
        {
          examType: 'Bachelor / Honours',
          customExamType: 'B.Sc. in CSE',
          institute: 'BUET',
          boardOrUniversity: 'BUET',
          passingYear: '2022',
          instituteRoll: '1705001',
          examRoll: '202210',
          registrationNo: 'REG-9901',
          overallResult: '3.92',
          semesters: [{ term: 'Term 4-2', gpa: '3.98', credits: '19.5', remarks: 'Dean List' }],
          customFields: [],
          notes: '',
        },
      ],
      presentAddresses: [
        {
          label: 'Apartment',
          addressLine: 'House 12 Road 4 Banani',
          city: 'Dhaka',
          postalCode: '1213',
          mapsUrl: 'https://maps.google.com/?q=Banani+Dhaka',
          notes: '',
        },
      ],
      permanentAddress: {
        addressLine: 'Kandirpar Main Road',
        villageOrArea: 'Kandirpar',
        district: 'Cumilla',
        country: 'Bangladesh',
        postalCode: '3500',
        mapsUrl: '',
        notes: '',
      },
      customSections: [
        {
          title: 'Laptop Warranty',
          fields: [{ label: 'Serial', value: 'ASUS-ZEN-5544' }],
        },
      ],
    });

    const docs: VaultDocumentSummary[] = [
      {
        id: 14,
        title: 'MacBook Pro Invoice',
        category: 'purchase_paper',
        linkedRef: 'INV-2026',
        documentDate: '2026-02-15',
        expiryOrWarrantyDate: '2028-02-15',
        originalFilename: 'invoice.png',
        notes: 'Authorized store',
        ocrText: 'AppleCare Serial MPX998877 Paid Total 185000 BDT',
        ocrStatus: 'completed',
        ocrConfidence: 93,
        customTags: ['laptop', 'warranty'],
        mimeType: 'image/webp',
        originalSize: 22000,
        compressedSize: 7000,
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
      },
    ];

    const nidHits = searchVaultIndex(profile, docs, '1995269011223');
    expect(nidHits.some((h) => h.kind === 'identity')).toBe(true);
    expect(nidHits[0].snippetSegments.some((s) => s.highlighted)).toBe(true);

    const semHits = searchVaultIndex(profile, docs, 'Dean List');
    expect(semHits.some((h) => h.kind === 'academic')).toBe(true);

    const addrHits = searchVaultIndex(profile, docs, 'Cumilla');
    expect(addrHits.some((h) => h.kind === 'address')).toBe(true);

    const ocrHits = searchVaultIndex(profile, docs, 'MPX998877', 'document');
    expect(ocrHits).toHaveLength(1);
    expect(ocrHits[0].documentId).toBe(14);
    expect(ocrHits[0].sectionAnchor).toBe('#vault-doc-14');
  });

  it('builds multi-phone, single-number, Google Maps, and extra-social vCards', () => {
    const card = createBaseCard();

    const fullVcf = buildVCardString('tariq', card, 'virtualcard.duckdns.org');
    expect(fullVcf).toContain('TEL;TYPE=CELL,VOICE:+8801711000001');
    expect(fullVcf).toContain('item2.TEL;TYPE=MSG,VOICE:+8801811000099');
    expect(fullVcf).toContain('item2.X-ABLabel:Office Hotline');
    expect(fullVcf).toContain('URL;TYPE=MAP:https://maps.google.com/?q=Banani,Dhaka');
    expect(fullVcf).toContain('X-SOCIALPROFILE;type=telegram:https://t.me/tariqwork');

    const singlePhoneVcf = buildVCardString('tariq', card, 'virtualcard.duckdns.org', { phoneIndex: 1 });
    expect(singlePhoneVcf).toContain('item1.TEL;TYPE=CELL,VOICE:+8801811000099');
    expect(singlePhoneVcf).toContain('item1.X-ABLabel:Office Hotline');
    expect(singlePhoneVcf).not.toContain('+8801711000001');
  });
});
