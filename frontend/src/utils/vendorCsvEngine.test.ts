import { describe, it, expect } from 'vitest';
import {
  normalizeVendorPhone,
  isValidVendorPhone,
  splitCsvRow,
  parseVendorCsv,
  exportVendorsToCsv
} from './vendorCsvEngine';
import { Vendor } from '../types/rfq';

describe('vendorCsvEngine', () => {
  describe('normalizeVendorPhone', () => {
    it('strips hyphens, spaces, and non-digits from standard Israeli phones', () => {
      expect(normalizeVendorPhone('052-123-4567')).toBe('0521234567');
      expect(normalizeVendorPhone('050 987 6543')).toBe('0509876543');
      expect(normalizeVendorPhone('03-6123456')).toBe('036123456');
    });

    it('preserves leading + and strips inner hyphens or spaces', () => {
      expect(normalizeVendorPhone('+972-52-123-4567')).toBe('+972521234567');
      expect(normalizeVendorPhone('+972 50 111 2222')).toBe('+972501112222');
      expect(normalizeVendorPhone('+1-800-555-0199')).toBe('+18005550199');
    });

    it('handles empty or clean numbers gracefully', () => {
      expect(normalizeVendorPhone('')).toBe('');
      expect(normalizeVendorPhone('0521234567')).toBe('0521234567');
      expect(normalizeVendorPhone('+972521234567')).toBe('+972521234567');
    });
  });

  describe('isValidVendorPhone', () => {
    it('accepts valid Israeli phone numbers starting with 0', () => {
      expect(isValidVendorPhone('0521234567')).toBe(true);
      expect(isValidVendorPhone('036123456')).toBe(true);
    });

    it('accepts valid international phone numbers starting with +', () => {
      expect(isValidVendorPhone('+972521234567')).toBe(true);
    });

    it('rejects invalid phones (letters, too short, missing 0 or +)', () => {
      expect(isValidVendorPhone('12345')).toBe(false);
      expect(isValidVendorPhone('abc')).toBe(false);
      expect(isValidVendorPhone('521234567')).toBe(false);
    });
  });

  describe('splitCsvRow', () => {
    it('splits simple comma-separated fields', () => {
      expect(splitCsvRow('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields with commas and escaped quotes', () => {
      expect(splitCsvRow('"Cohen, Levi",0521234567,"notes with ""quotes"""')).toEqual([
        'Cohen, Levi',
        '0521234567',
        'notes with "quotes"'
      ]);
    });
  });

  describe('parseVendorCsv', () => {
    it('rejects files not separated by commas (e.g. semicolons)', () => {
      const semicolonCsv = 'סוג ספק;שם מלא;טלפון;תגיות\n1;ישראל ישראלי;052-1234567;אינסטלציה';
      expect(() => parseVendorCsv(semicolonCsv)).toThrow(/אינו מופרד בפסיקים/);
    });

    it('rejects files with tab delimiters', () => {
      const tabCsv = 'סוג ספק\tשם מלא\tטלפון\tתגיות\n1\tישראל ישראלי\t052-1234567\tאינסטלציה';
      expect(() => parseVendorCsv(tabCsv)).toThrow(/אינו מופרד בפסיקים/);
    });

    it('successfully parses valid CSV with normalized phones and pipe tags', () => {
      const csv = `סוג ספק,שם מלא,טלפון,תגיות,אימייל,ח.פ/ת.ז,הערות
1,יוסי כהן,052-123-4567,אינסטלציה|משאבות,yossi@test.com,512345678,זמין 24/7
0,דני לוי,050 999 8888,חשמל|תאורה,,,`;

      const result = parseVendorCsv(csv, [], 80);
      expect(result.allErrors).toEqual([]);
      expect(result.records.length).toBe(2);

      const r1 = result.records[0];
      expect(r1.vendorType).toBe('retainer');
      expect(r1.fullName).toBe('יוסי כהן');
      expect(r1.phone).toBe('0521234567'); // Hyphens stripped
      expect(r1.categories).toEqual(['אינסטלציה', 'משאבות']);
      expect(r1.email).toBe('yossi@test.com');
      expect(r1.companyId).toBe('512345678');
      expect(r1.notes).toBe('זמין 24/7');

      const r2 = result.records[1];
      expect(r2.vendorType).toBe('occasional');
      expect(r2.phone).toBe('0509998888'); // Spaces stripped
      expect(r2.categories).toEqual(['חשמל', 'תאורה']);

      expect(result.newTags.sort()).toEqual(['אינסטלציה', 'חשמל', 'משאבות', 'תאורה'].sort());
    });

    it('validates mandatory fields and returns row errors', () => {
      const csv = `סוג ספק,שם מלא,טלפון,תגיות
1,,0521234567,אינסטלציה
0,יוסי כהן,invalid-phone,אינסטלציה
1,דני לוי,0522222222,`;

      const result = parseVendorCsv(csv, [], 80);
      expect(result.allErrors.length).toBeGreaterThan(0);
      expect(result.records[0].errors).toContain('שם מלא הינו שדה חובה');
      expect(result.records[1].errors[0]).toMatch(/מספר טלפון לא תקין/);
      expect(result.records[2].errors[0]).toMatch(/חובה לציין לפחות תגית/);
    });

    it('handles the 4 distinct rating columns gracefully as metadata', () => {
      const csv = `סוג ספק,שם מלא,טלפון,תגיות,אימייל,ח.פ/ת.ז,הערות,ציון ממוצע,סה"כ עבודות,אחוז הזמנה חוזרת,יתרונות בולטים
1,יוסי אינסטלציה,0521234567,אינסטלציה,,,הערה,4.8,12,92%,אדיב ומקצועי|מחיר הוגן`;

      const result = parseVendorCsv(csv, [], 80);
      expect(result.allErrors).toEqual([]);
      expect(result.records[0].ratingMetadata).toEqual({
        averageScore: 4.8,
        totalReviews: 12,
        rehirePercentage: 92,
        topTags: ['אדיב ומקצועי', 'מחיר הוגן']
      });
    });

    it('enforces quota limit for single tenant (80 records)', () => {
      // Simulate 80 existing vendors
      const existing: Vendor[] = Array.from({ length: 80 }, (_, i) => ({
        id: `v${i}`,
        fullName: `Vendor ${i}`,
        phone: `05000000${String(i).padStart(2, '0')}`,
        categories: ['חשמל'],
        vendorType: 'occasional'
      }));

      // Try to import 1 new vendor
      const csv = `סוג ספק,שם מלא,טלפון,תגיות
0,New Vendor,0529999999,אינסטלציה`;

      const result = parseVendorCsv(csv, existing, 80);
      expect(result.allErrors.some(e => e.includes('חריגה מהמכסה המרבית המותרת'))).toBe(true);
    });

    it('allows updating existing vendors without counting against quota limit', () => {
      // Existing vendor with phone 0521234567
      const existing: Vendor[] = [
        {
          id: 'v1',
          fullName: 'Old Name',
          phone: '0521234567',
          categories: ['אינסטלציה'],
          vendorType: 'occasional'
        }
      ];

      // Update same phone
      const csv = `סוג ספק,שם מלא,טלפון,תגיות
1,Updated Name,052-123-4567,אינסטלציה|משאבות`;

      const result = parseVendorCsv(csv, existing, 80);
      expect(result.allErrors).toEqual([]);
      expect(result.records.length).toBe(1);
      expect(result.records[0].fullName).toBe('Updated Name');
      expect(result.records[0].isExisting).toBe(true);
      expect(result.records[0].existingVendorName).toBe('Old Name');
      expect(result.existingCount).toBe(1);
      expect(result.newCount).toBe(0);
    });

    it('correctly tracks new vs existing vendors when mixing both in one CSV', () => {
      const existing: Vendor[] = [
        {
          id: 'v1',
          fullName: 'קיים כהן',
          phone: '0521234567',
          categories: ['אינסטלציה'],
          vendorType: 'retainer'
        }
      ];

      const csv = `סוג ספק,שם מלא,טלפון,תגיות
1,קיים כהן מעודכן,052-123-4567,אינסטלציה|בינוי
0,חדש לוי,054-999-1111,חשמל`;

      const result = parseVendorCsv(csv, existing, 80);
      expect(result.allErrors).toEqual([]);
      expect(result.records.length).toBe(2);
      expect(result.existingCount).toBe(1);
      expect(result.newCount).toBe(1);
      expect(result.records[0].isExisting).toBe(true);
      expect(result.records[0].existingVendorName).toBe('קיים כהן');
      expect(result.records[1].isExisting).toBe(false);
    });
  });

  describe('exportVendorsToCsv', () => {
    it('exports vendors with UTF-8 BOM, normalized phone, and 4 separate rating columns', () => {
      const mockVendors: Vendor[] = [
        {
          id: 'v1',
          fullName: 'יוסי כהן',
          phone: '052-123-4567', // Should be normalized without hyphens
          categories: ['אינסטלציה', 'משאבות'],
          vendorType: 'retainer',
          email: 'yossi@test.com',
          companyId: '512345678',
          notes: 'זמין 24/7',
          ratingSummary: {
            averageScore: 4.8,
            totalReviews: 10,
            rehireCount: 9,
            rehirePercentage: 90,
            topTags: ['אדיב', 'מחיר הוגן'],
            lastRatedAt: '2026-10-01'
          }
        },
        {
          id: 'v2',
          fullName: 'דני לוי',
          phone: '+972 50 111 2222',
          categories: ['חשמל'],
          vendorType: 'occasional'
        }
      ];

      const csvContent = exportVendorsToCsv(mockVendors);

      // Verify BOM
      expect(csvContent.startsWith('\uFEFF')).toBe(true);

      // Verify headers contain the 4 split rating columns
      expect(csvContent).toContain('סוג ספק,שם מלא,טלפון,תגיות,אימייל,ח.פ/ת.ז,הערות,ציון ממוצע,סה"כ עבודות,אחוז הזמנה חוזרת,יתרונות בולטים');

      // Verify vendor 1 row
      expect(csvContent).toContain('1,יוסי כהן,0521234567,אינסטלציה|משאבות,yossi@test.com,512345678,זמין 24/7,4.8,10,90%,אדיב|מחיר הוגן');

      // Verify vendor 2 row
      expect(csvContent).toContain('0,דני לוי,+972501112222,חשמל,,,,,0,,');
    });
  });
});
