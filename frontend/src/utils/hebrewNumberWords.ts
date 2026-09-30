/**
 * Converts numeric integer sums into official Hebrew wording for Israeli legal contracts & checks.
 * Example: 3510 -> "שלושת אלפים חמש מאות ועשרה שקלים חדשים"
 */

const ONES = [
  '',
  'אחד',
  'שניים',
  'שלושה',
  'ארבעה',
  'חמישה',
  'שישה',
  'שבעה',
  'שמונה',
  'תשעה',
  'עשרה'
];

const TEENS = [
  'עשרה',
  'אחד עשר',
  'שנים עשר',
  'שלושה עשר',
  'ארבעה עשר',
  'חמישה עשר',
  'שישה עשר',
  'שבעה עשר',
  'שמונה עשר',
  'תשעה עשר'
];

const TENS = [
  '',
  'עשרה',
  'עשרים',
  'שלושים',
  'ארבעים',
  'חמישים',
  'שישים',
  'שבעים',
  'שמונים',
  'תשעים'
];

const HUNDREDS = [
  '',
  'מאה',
  'מאתיים',
  'שלוש מאות',
  'ארבע מאות',
  'חמש מאות',
  'שש מאות',
  'שבע מאות',
  'שמונה מאות',
  'תשע מאות'
];

function convertBelowThousand(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const h = Math.floor(n / 100);
  const remainder = n % 100;

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder <= 10) {
      parts.push((parts.length > 0 ? 'ו' : '') + ONES[remainder]);
    } else if (remainder < 20) {
      parts.push((parts.length > 0 ? 'ו' : '') + TEENS[remainder - 10]);
    } else {
      const t = Math.floor(remainder / 10);
      const u = remainder % 10;
      let tenPart = TENS[t];
      if (parts.length > 0) {
        tenPart = 'ו' + tenPart;
      }
      if (u > 0) {
        parts.push(tenPart + ' ו' + ONES[u]);
      } else {
        parts.push(tenPart);
      }
    }
  }

  return parts.join(' ');
}

export function numberToHebrewWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'אפס שקלים חדשים';

  if (n > 9999999) {
    return `₪${amount.toLocaleString()} שקלים חדשים`;
  }

  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const remainder = n % 1000;

  const resultParts: string[] = [];

  if (millions > 0) {
    if (millions === 1) {
      resultParts.push('מיליון');
    } else if (millions === 2) {
      resultParts.push('שני מיליון');
    } else {
      resultParts.push(convertBelowThousand(millions) + ' מיליון');
    }
  }

  if (thousands > 0) {
    if (thousands === 1) {
      resultParts.push(resultParts.length > 0 ? 'ואלף' : 'אלף');
    } else if (thousands === 2) {
      resultParts.push(resultParts.length > 0 ? 'ואלפיים' : 'אלפיים');
    } else if (thousands >= 3 && thousands <= 10) {
      const thousandsWord = ONES[thousands] + 'ת אלפים';
      resultParts.push(resultParts.length > 0 ? 'ו' + thousandsWord : thousandsWord);
    } else {
      const tWords = convertBelowThousand(thousands) + ' אלף';
      resultParts.push(resultParts.length > 0 ? 'ו' + tWords : tWords);
    }
  }

  if (remainder > 0) {
    const remWords = convertBelowThousand(remainder);
    if (resultParts.length > 0 && !remWords.startsWith('ו')) {
      resultParts.push('ו' + remWords);
    } else {
      resultParts.push(remWords);
    }
  }

  return resultParts.join(' ') + ' שקלים חדשים';
}
