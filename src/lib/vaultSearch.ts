import type {
  VaultDocumentSummary,
  VaultProfileData,
  VaultSearchHit,
  VaultSearchSnippetSegment,
} from '../types/domain.js';

interface SearchableEntry {
  kind: VaultSearchHit['kind'];
  sectionAnchor: string;
  title: string;
  subtitle: string;
  documentId?: number;
  weightedFields: Array<{ text: string; weight: number }>;
}

function normalizeQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 12);
}

function buildHighlightedSnippet(
  corpus: string,
  terms: string[]
): VaultSearchSnippetSegment[] {
  const clean = corpus.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const lower = clean.toLowerCase();
  let firstMatchIdx = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
      firstMatchIdx = idx;
    }
  }

  const maxLen = 180;
  let start = 0;
  if (firstMatchIdx > 60) {
    start = Math.max(0, firstMatchIdx - 50);
  }
  const end = Math.min(clean.length, start + maxLen);
  const windowText =
    (start > 0 ? '...' : '') +
    clean.slice(start, end) +
    (end < clean.length ? '...' : '');

  if (terms.length === 0) {
    return [{ text: windowText, highlighted: false }];
  }

  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = windowText.split(regex);
  const termSet = new Set(terms.map((t) => t.toLowerCase()));

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlighted: termSet.has(part.toLowerCase()),
    }));
}

function buildSearchableEntries(
  profile: VaultProfileData,
  documents: VaultDocumentSummary[]
): SearchableEntry[] {
  const entries: SearchableEntry[] = [];

  // 1. Government & Personal IDs
  const idParts: string[] = [];
  if (profile.identity.nid) idParts.push(`NID: ${profile.identity.nid}`);
  if (profile.identity.birthCertificateNo) {
    idParts.push(`Birth Certificate: ${profile.identity.birthCertificateNo}`);
  }
  if (profile.identity.passportNumber) {
    idParts.push(`Passport: ${profile.identity.passportNumber}`);
  }
  if (profile.identity.tinNumber) idParts.push(`TIN: ${profile.identity.tinNumber}`);
  if (profile.identity.drivingLicenseNumber) {
    idParts.push(`Driving License: ${profile.identity.drivingLicenseNumber}`);
  }
  if (profile.identity.bloodGroup) {
    idParts.push(`Blood Group: ${profile.identity.bloodGroup}`);
  }
  for (const cf of profile.identity.customFields) {
    if (cf.label || cf.value) {
      idParts.push(`${cf.label}: ${cf.value}`);
    }
  }
  if (idParts.length > 0) {
    entries.push({
      kind: 'identity',
      sectionAnchor: '#vault-identity',
      title: 'Personal & Government IDs',
      subtitle: 'NID, Birth Certificate, Passport, TIN, Driving License',
      weightedFields: [
        { text: 'Personal Government IDs NID Birth Certificate Passport TIN Driving License', weight: 2 },
        { text: idParts.join(' | '), weight: 4 },
      ],
    });
  }

  // 2. Academic & Higher Studies Records (each record individually indexed!)
  profile.academics.forEach((rec, idx) => {
    const label = rec.customExamType || rec.examType || `Academic Record ${idx + 1}`;
    const semesterSummary = rec.semesters
      .map((s) => `${s.term} GPA ${s.gpa} ${s.credits} ${s.remarks}`)
      .join(' | ');
    const customSummary = rec.customFields.map((c) => `${c.label}: ${c.value}`).join(' | ');
    const bodyText = [
      rec.boardOrUniversity,
      rec.passingYear ? `Year ${rec.passingYear}` : '',
      rec.instituteRoll ? `Institute Roll ${rec.instituteRoll}` : '',
      rec.examRoll ? `Exam Roll ${rec.examRoll}` : '',
      rec.registrationNo ? `Reg No ${rec.registrationNo}` : '',
      rec.overallResult ? `Result ${rec.overallResult}` : '',
      semesterSummary,
      customSummary,
      rec.notes,
    ]
      .filter(Boolean)
      .join(' | ');

    entries.push({
      kind: 'academic',
      sectionAnchor: '#vault-academics',
      title: `${label}${rec.institute ? ` — ${rec.institute}` : ''}`,
      subtitle: [rec.passingYear, rec.overallResult].filter(Boolean).join(' • ') || 'Academic Record',
      weightedFields: [
        { text: `${label} ${rec.institute}`, weight: 4 },
        { text: bodyText, weight: 3 },
      ],
    });
  });

  // 3. Present Addresses (multiple) + Permanent Address
  profile.presentAddresses.forEach((addr, idx) => {
    const title = addr.label || `Present Address ${idx + 1}`;
    const body = [addr.addressLine, addr.city, addr.postalCode, addr.notes].filter(Boolean).join(' | ');
    if (body || addr.label) {
      entries.push({
        kind: 'address',
        sectionAnchor: '#vault-addresses',
        title: `Present Address: ${title}`,
        subtitle: [addr.city, addr.postalCode].filter(Boolean).join(', ') || 'Present Address',
        weightedFields: [
          { text: `Present Address ${title}`, weight: 3 },
          { text: body, weight: 3 },
        ],
      });
    }
  });

  const permBody = [
    profile.permanentAddress.addressLine,
    profile.permanentAddress.villageOrArea,
    profile.permanentAddress.district,
    profile.permanentAddress.postalCode,
    profile.permanentAddress.country,
    profile.permanentAddress.notes,
  ]
    .filter(Boolean)
    .join(' | ');
  if (permBody) {
    entries.push({
      kind: 'address',
      sectionAnchor: '#vault-addresses',
      title: 'Permanent Address',
      subtitle:
        [profile.permanentAddress.district, profile.permanentAddress.country]
          .filter(Boolean)
          .join(', ') || 'Permanent Residence',
      weightedFields: [
        { text: 'Permanent Address Google Maps Residence', weight: 3 },
        { text: permBody, weight: 3 },
      ],
    });
  }

  // 4. Custom Sections
  for (const sec of profile.customSections) {
    const secBody = sec.fields.map((f) => `${f.label}: ${f.value}`).join(' | ');
    if (sec.title || secBody) {
      entries.push({
        kind: 'custom',
        sectionAnchor: '#vault-custom',
        title: sec.title || 'Custom Section',
        subtitle: `${sec.fields.length} field${sec.fields.length === 1 ? '' : 's'}`,
        weightedFields: [
          { text: sec.title, weight: 4 },
          { text: secBody, weight: 3 },
        ],
      });
    }
  }

  // 5. Encrypted Documents + Extracted OCR Text Index
  for (const doc of documents) {
    const metaText = [
      doc.category.replace('_', ' '),
      doc.linkedRef,
      doc.documentDate ? `Date: ${doc.documentDate}` : '',
      doc.expiryOrWarrantyDate ? `Expiry/Warranty: ${doc.expiryOrWarrantyDate}` : '',
      doc.originalFilename,
      doc.customTags.join(' '),
      doc.notes,
    ]
      .filter(Boolean)
      .join(' | ');

    entries.push({
      kind: 'document',
      sectionAnchor: `#vault-doc-${doc.id}`,
      title: doc.title || doc.originalFilename,
      subtitle: `${doc.category.replace('_', ' ').toUpperCase()}${doc.ocrText ? ' • OCR Indexed' : ''}`,
      documentId: doc.id,
      weightedFields: [
        { text: `${doc.title} ${doc.customTags.join(' ')}`, weight: 5 },
        { text: metaText, weight: 3 },
        { text: doc.ocrText, weight: 2 },
      ],
    });
  }

  return entries;
}

export function searchVaultIndex(
  profile: VaultProfileData,
  documents: VaultDocumentSummary[],
  query: string,
  categoryFilter: VaultSearchHit['kind'] | 'all' = 'all'
): VaultSearchHit[] {
  const terms = normalizeQueryTerms(query);
  const entries = buildSearchableEntries(profile, documents);

  const hits: VaultSearchHit[] = [];

  for (const entry of entries) {
    if (categoryFilter !== 'all' && entry.kind !== categoryFilter) {
      continue;
    }

    const fullCorpus = entry.weightedFields.map((f) => f.text).filter(Boolean).join(' • ');
    if (!fullCorpus) continue;

    if (terms.length === 0) {
      hits.push({
        kind: entry.kind,
        sectionAnchor: entry.sectionAnchor,
        title: entry.title,
        subtitle: entry.subtitle,
        documentId: entry.documentId,
        score: 1,
        snippetSegments: buildHighlightedSnippet(fullCorpus, []),
      });
      continue;
    }

    const lowerFields = entry.weightedFields.map((f) => ({
      lower: f.text.toLowerCase(),
      weight: f.weight,
      raw: f.text,
    }));

    // Require every query term to match somewhere in the indexed item (AND semantics)
    let allMatched = true;
    let totalScore = 0;
    let bestSnippetField = fullCorpus;
    let bestFieldScore = -1;

    for (const term of terms) {
      let termScore = 0;
      for (const field of lowerFields) {
        if (!field.lower) continue;
        const idx = field.lower.indexOf(term);
        if (idx !== -1) {
          // Bonus for exact word-boundary match vs substring match
          const isWordStart = idx === 0 || /[^a-z0-9]/.test(field.lower[idx - 1]);
          const fieldPoints = field.weight * (isWordStart ? 3 : 1);
          termScore += fieldPoints;
          if (fieldPoints > bestFieldScore) {
            bestFieldScore = fieldPoints;
            bestSnippetField = field.raw;
          }
        }
      }
      if (termScore === 0) {
        allMatched = false;
        break;
      }
      totalScore += termScore;
    }

    if (allMatched && totalScore > 0) {
      hits.push({
        kind: entry.kind,
        sectionAnchor: entry.sectionAnchor,
        title: entry.title,
        subtitle: entry.subtitle,
        documentId: entry.documentId,
        score: totalScore,
        snippetSegments: buildHighlightedSnippet(bestSnippetField, terms),
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits;
}
