import { Vendor, VendorType } from '../types/rfq';

export interface ParsedVendorRecord {
  rowNumber: number;
  vendorType: VendorType;
  fullName: string;
  phone: string;
  categories: string[];
  email?: string;
  companyId?: string;
  notes?: string;
  ratingMetadata?: {
    averageScore?: number;
    totalReviews?: number;
    rehirePercentage?: number;
    topTags?: string[];
  };
  errors: string[];
  isExisting?: boolean;
  existingVendorName?: string;
  existingRatingSummary?: {
    averageScore: number;
    totalReviews: number;
    rehirePercentage: number;
  };
}

export interface ParseVendorCsvResult {
  records: ParsedVendorRecord[];
  allErrors: string[];
  newTags: string[];
  totalValid: number;
  newCount: number;
  existingCount: number;
}

/**
 * Normalizes phone numbers to numbers only or a leading '+' followed by numbers.
 * Strips all hyphens, spaces, parentheses, dots, etc.
 */
export function normalizeVendorPhone(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * Validates normalized vendor phone number.
 * Must start with 0 or + and have between 7 and 15 total characters.
 */
export function isValidVendorPhone(phone: string): boolean {
  if (!phone) return false;
  return /^(0|\+)[0-9]{6,14}$/.test(phone);
}

/**
 * Splits a CSV row respecting double quotes, strictly by comma (',').
 * Supports Hebrew abbreviations (e.g. סה"כ) in unquoted cells without breaking quoting state.
 */
export function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (current.length === 0 && !inQuotes) {
        // Cell starts with an enclosing quote
        inQuotes = true;
      } else if (inQuotes) {
        if (line[i + 1] === '"') {
          // Escaped quote inside quoted cell ("")
          current += '"';
          i++;
        } else {
          // Closing quote of quoted cell
          inQuotes = false;
        }
      } else {
        // Literal quote inside an unquoted cell (e.g. Hebrew סה"כ or 1/2" pipe)
        current += '"';
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses raw CSV text into validated vendor records.
 * Delimiter requirement: strictly comma (',') only. Semicolons and tabs are rejected.
 */
export function parseVendorCsv(
  csvText: string,
  existingVendors: Vendor[] = [],
  maxQuota: number = 80
): ParseVendorCsvResult {
  // Strip BOM and clean control characters
  const cleanText = csvText
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  const lines = cleanText
    .split(/\r\n|\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    throw new Error('קובץ ה-CSV חייב להכיל שורת כותרות ולפחות שורת נתונים אחת.');
  }

  const firstLine = lines[0];

  // Strictly enforce comma delimiter. Reject semicolons and tabs.
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (commaCount === 0 || semiCount > commaCount || tabCount > commaCount) {
    throw new Error(
      'הקובץ אינו מופרד בפסיקים. TikTak תומך אך ורק בקבצי CSV מופרדים בפסיקים (,) ואינו תומך בנקודה-פסיק (;) או טאבים.'
    );
  }

  const headers = splitCsvRow(firstLine).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

  // Header column index matching
  const findHeaderIdx = (patterns: string[]): number => {
    return headers.findIndex(h => patterns.some(p => h.includes(p.toLowerCase())));
  };

  const typeIdx = findHeaderIdx(['סוג ספק', 'סוג', 'קבוע/מזדמן', 'קבוע', 'vendortype', 'type', 'isretainer']);
  const nameIdx = findHeaderIdx(['שם מלא', 'שם קבלן', 'שם', 'fullname', 'name', 'vendorname']);
  const phoneIdx = findHeaderIdx(['טלפון', 'נייד', 'סלולרי', 'phone', 'mobile', 'tel']);
  const tagsIdx = findHeaderIdx(['תגיות', 'קטגוריות', 'תחום', 'מקצוע', 'tags', 'categories', 'profession']);
  const emailIdx = findHeaderIdx(['אימייל', 'דוא"ל', 'מייל', 'email', 'mail']);
  const companyIdIdx = findHeaderIdx(['ח.פ', 'ת.ז', 'מספר חברה', 'companyid', 'taxid', 'idnumber']);
  const notesIdx = findHeaderIdx(['הערות', 'הערה', 'notes', 'comments']);

  // Optional 4 rating headers (read-only metadata)
  const avgRatingIdx = findHeaderIdx(['ציון ממוצע', 'דירוג ממוצע', 'ציון', 'averagerating', 'score']);
  const jobsIdx = findHeaderIdx(['סה"כ עבודות', 'מספר עבודות', 'עבודות', 'totaljobs', 'jobs']);
  const rehireIdx = findHeaderIdx(['אחוז הזמנה חוזרת', 'הזמנה חוזרת', 'rehirerate', 'rehire']);
  const topTagsIdx = findHeaderIdx(['יתרונות בולטים', 'יתרונות', 'leadingadvantages', 'advantages']);

  if (nameIdx === -1 || phoneIdx === -1 || tagsIdx === -1) {
    const missing: string[] = [];
    if (nameIdx === -1) missing.push('"שם מלא"');
    if (phoneIdx === -1) missing.push('"טלפון"');
    if (tagsIdx === -1) missing.push('"תגיות"');
    throw new Error(`עמודות חובה חסרות בקובץ: ${missing.join(', ')}. נא לוודא ששורת הכותרות מכילה שדות אלו.`);
  }

  const parsedRecords: ParsedVendorRecord[] = [];
  const allErrors: string[] = [];
  const seenPhones = new Map<string, number>();
  const newTagsSet = new Set<string>();

  const existingByPhone = new Map<string, Vendor>();
  existingVendors.forEach(v => {
    existingByPhone.set(normalizeVendorPhone(v.phone), v);
  });

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cols = splitCsvRow(lines[i]);
    const rowErrors: string[] = [];

    const rawName = cols[nameIdx] || '';
    const rawPhone = cols[phoneIdx] || '';
    const rawTags = cols[tagsIdx] || '';
    const rawType = typeIdx !== -1 ? cols[typeIdx] || '' : '';
    const rawEmail = emailIdx !== -1 ? cols[emailIdx] || '' : '';
    const rawCompanyId = companyIdIdx !== -1 ? cols[companyIdIdx] || '' : '';
    const rawNotes = notesIdx !== -1 ? cols[notesIdx] || '' : '';

    // Ignore completely empty row
    if (!rawName && !rawPhone && !rawTags) {
      continue;
    }

    // Name validation
    const fullName = rawName.trim();
    if (!fullName) {
      rowErrors.push('שם מלא הינו שדה חובה');
    } else if (fullName.length < 2 || fullName.length > 50) {
      rowErrors.push(`שם מלא חייב להכיל בין 2 ל-50 תווים (נמצאו ${fullName.length})`);
    }

    // Phone validation & normalization (strip hyphens, allow leading +)
    const normalizedPhone = normalizeVendorPhone(rawPhone);
    if (!rawPhone.trim()) {
      rowErrors.push('מספר טלפון הינו שדה חובה');
    } else if (!isValidVendorPhone(normalizedPhone)) {
      rowErrors.push(`מספר טלפון לא תקין ("${rawPhone}"). יש להזין ספרות בלבד או קידומת + בהתחלה (ללא מקפים)`);
    } else {
      if (seenPhones.has(normalizedPhone)) {
        rowErrors.push(`מספר טלפון כפול בקובץ (מופיע גם בשורה ${seenPhones.get(normalizedPhone)})`);
      } else {
        seenPhones.set(normalizedPhone, rowNumber);
      }
    }

    // Tags validation (multi-value delimited by pipe '|')
    const categories = rawTags
      .split('|')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (categories.length === 0) {
      rowErrors.push('חובה לציין לפחות תגית / תחום עיסוק אחד (מופרד ב-| כגון: חשמל|אינסטלציה)');
    } else {
      categories.forEach(cat => newTagsSet.add(cat));
    }

    // Vendor type classification (1 = retainer, 0 = occasional)
    let vendorType: VendorType = 'occasional';
    const cleanType = rawType.trim().toLowerCase();
    if (
      cleanType === '1' ||
      cleanType.includes('קבוע') ||
      cleanType.includes('retainer')
    ) {
      vendorType = 'retainer';
    } else if (
      cleanType === '0' ||
      cleanType.includes('מזדמן') ||
      cleanType.includes('temp') ||
      cleanType.includes('occasional')
    ) {
      vendorType = 'occasional';
    }

    // Email validation (optional)
    const email = rawEmail.trim() || undefined;
    if (email && !email.includes('@')) {
      rowErrors.push(`כתובת אימייל לא תקינה ("${email}")`);
    }

    // Company ID (optional)
    const companyId = rawCompanyId.trim() || undefined;

    // Notes (optional)
    const notes = rawNotes.trim() || undefined;

    // Rating metadata (read-only)
    let ratingMetadata: ParsedVendorRecord['ratingMetadata'] = undefined;
    const rawAvg = avgRatingIdx !== -1 ? cols[avgRatingIdx] || '' : '';
    const rawJobs = jobsIdx !== -1 ? cols[jobsIdx] || '' : '';
    const rawRehire = rehireIdx !== -1 ? cols[rehireIdx] || '' : '';
    const rawTopTags = topTagsIdx !== -1 ? cols[topTagsIdx] || '' : '';

    if (rawAvg || rawJobs || rawRehire || rawTopTags) {
      const parsedAvg = parseFloat(rawAvg);
      const parsedJobs = parseInt(rawJobs, 10);
      const parsedRehire = parseInt(rawRehire.replace('%', ''), 10);
      ratingMetadata = {
        averageScore: !isNaN(parsedAvg) ? parsedAvg : undefined,
        totalReviews: !isNaN(parsedJobs) ? parsedJobs : undefined,
        rehirePercentage: !isNaN(parsedRehire) ? parsedRehire : undefined,
        topTags: rawTopTags ? rawTopTags.split('|').map(t => t.trim()).filter(Boolean) : undefined,
      };
    }

    if (rowErrors.length > 0) {
      rowErrors.forEach(err => allErrors.push(`שורה ${rowNumber}: ${err}`));
    }

    // Check if phone matches an existing vendor
    const existing = normalizedPhone ? existingByPhone.get(normalizedPhone) : undefined;
    const isExisting = Boolean(existing);
    const existingVendorName = existing?.fullName;
    const existingRatingSummary = existing?.ratingSummary
      ? {
          averageScore: existing.ratingSummary.averageScore,
          totalReviews: existing.ratingSummary.totalReviews,
          rehirePercentage: existing.ratingSummary.rehirePercentage
        }
      : undefined;

    parsedRecords.push({
      rowNumber,
      vendorType,
      fullName,
      phone: normalizedPhone,
      categories,
      email,
      companyId,
      notes,
      ratingMetadata,
      errors: rowErrors,
      isExisting,
      existingVendorName,
      existingRatingSummary
    });
  }

  // Quota calculation & new vs. existing counts
  let newCount = 0;
  let existingCount = 0;
  for (const record of parsedRecords) {
    if (record.errors.length === 0) {
      if (record.isExisting) {
        existingCount++;
      } else {
        newCount++;
      }
    }
  }

  const projectedTotal = existingVendors.length + newCount;
  if (projectedTotal > maxQuota) {
    const quotaMsg = `הקובץ מכיל ${newCount} ספקים חדשים, ובסך הכל ${projectedTotal} ספקים. חריגה מהמכסה המרבית המותרת (${maxQuota} ספקים).`;
    allErrors.push(quotaMsg);
  }

  return {
    records: parsedRecords,
    allErrors,
    newTags: Array.from(newTagsSet),
    totalValid: parsedRecords.filter(r => r.errors.length === 0).length,
    newCount,
    existingCount
  };
}

/**
 * Generates CSV string containing UTF-8 BOM, standard headers, and 4 split rating columns.
 */
export function exportVendorsToCsv(vendors: Vendor[]): string {
  const BOM = '\uFEFF';
  const headers = [
    'סוג ספק',
    'שם מלא',
    'טלפון',
    'תגיות',
    'אימייל',
    'ח.פ/ת.ז',
    'הערות',
    'ציון ממוצע',
    'סה"כ עבודות',
    'אחוז הזמנה חוזרת',
    'יתרונות בולטים'
  ];

  const escapeCsv = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = vendors.map(v => {
    // 1 = Retainer, 0 = Occasional
    const vendorType = v.vendorType === 'retainer' ? '1' : '0';
    const fullName = escapeCsv(v.fullName);
    const phone = normalizeVendorPhone(v.phone);
    const tags = escapeCsv((v.categories || []).join('|'));
    const email = escapeCsv(v.email || '');
    const companyId = escapeCsv(v.companyId || '');
    const notes = escapeCsv(v.notes || '');

    // 4 distinct rating columns
    const avgRate = v.ratingSummary?.averageScore
      ? v.ratingSummary.averageScore.toFixed(1)
      : '';
    const totalJobs = v.ratingSummary?.totalReviews !== undefined
      ? String(v.ratingSummary.totalReviews)
      : '0';
    const rehireRate = v.ratingSummary?.rehirePercentage !== undefined
      ? `${v.ratingSummary.rehirePercentage}%`
      : '';
    const advantages = escapeCsv((v.ratingSummary?.topTags || []).join('|'));

    return [
      vendorType,
      fullName,
      phone,
      tags,
      email,
      companyId,
      notes,
      avgRate,
      totalJobs,
      rehireRate,
      advantages
    ].join(',');
  });

  return BOM + headers.join(',') + '\n' + rows.join('\n');
}
