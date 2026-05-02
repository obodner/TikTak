const normalizePhone = (phone: string) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '972' + cleaned.substring(1);
  }
  return cleaned;
};

export const generateWhatsAppLink = (params: {
  phone: string;
  summary: string;
  tenantId: string;
  tenantName?: string;
  category: string;
  location?: string;
  subLocation?: string;
  imageId?: string;
  urgency?: string;
  labels?: {
    locationLabel?: string;
    subLocationLabel?: string;
  };
  audioId?: string;
  reporterName?: string;
  ticketNumber?: number;
}) => {
  const { phone, summary, tenantId, tenantName, category, location, subLocation, imageId, urgency, labels, reporterName, ticketNumber } = params;

  const displayName = tenantName || tenantId;
  const ticketIdStr = ticketNumber ? ` (#${ticketNumber})` : '';
  const locationLabel = labels?.locationLabel || 'קומה';
  const subLocationLabel = labels?.subLocationLabel || 'מיקום';

  // Translate urgency for WhatsApp
  const urgencyMap: Record<string, string> = {
    'High': 'דחוף 🚨',
    'Moderate': 'רגיל',
    'Low': 'נמוך'
  };
  const displayUrgency = urgencyMap[urgency as string] || urgency || 'לא הוגדר';

  // Use LRM (\u200E) to prevent negative location numbers from flipping in RTL WhatsApp
  const displayLocation = location?.startsWith('-') ? `\u200E${location}` : location;

  // Isolated bold tag to ensure it 'sticks' even with RTL/LTR mixed content
  let body = `*דיווח חדש${ticketIdStr}: TikTak*\n`;
  if (displayUrgency === 'דחוף 🚨') body = `*דיווח דחוף 🚨${ticketIdStr}: TikTak*\n`;
  body += `*דיווח עבור:* ${displayName}\n\n`;

  body += `*תיאור:* ${summary || 'אין תיאור'}\n`;
  body += `*קטגוריה:* ${category}\n`;
  body += `*דחיפות:* ${displayUrgency}\n`;
  if (displayLocation) body += `*${locationLabel}:* ${displayLocation}\n`;
  if (subLocation) body += `*${subLocationLabel}:* ${subLocation}\n`;
  if (reporterName) body += `*מדווח:* ${reporterName}\n`;

  if (imageId) {
    body += `\n*תמונה:* https://tiktak2026.web.app/img/${tenantId}/${imageId}\n`;
  }

  if (params.audioId) {
    body += `*הקלטה:* https://tiktak2026.web.app/aud/${tenantId}/${params.audioId}\n`;
  }

  body += `\n____________________\n`;
  body += `לניהול בפורטל: https://tiktak2026.web.app/admin`;

  const encodedBody = encodeURIComponent(body);
  const normalizedPhone = normalizePhone(phone);
  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedBody}`;
};

export const generateStatusUpdateLink = (params: {
  phone: string;
  category: string;
  status: 'open' | 'in-progress' | 'resolved';
  location?: string;
  tenantName?: string;
  closureReason?: string;
  ticketNumber?: number;
}) => {
  const { phone, category, status, location, closureReason, ticketNumber } = params;

  const ticketIdStr = ticketNumber ? ` (#${ticketNumber})` : '';
  const locationText = location ? ` ב-${location}` : '';
  let body = `*עדכון מTikTak*\n`;

  if (status === 'open') {
    body += `הסטטוס של הדיווח שלך${ticketIdStr} בנושא "${category}"${locationText} נרשם במערכת ועודכן ל: סטטוס *חדש*.`;
  } else if (status === 'in-progress') {
    body += `*היי, אנחנו על זה!*\nהדיווח שלך${ticketIdStr} על "${category}"${locationText} כרגע בטיפול. נעדכן כשיסתיים.`;
  } else if (status === 'resolved') {
    const reasonText = closureReason ? ` (${closureReason})` : '';
    body += `*חדשות טובות!*\nהדיווח שלך${ticketIdStr} בנושא "${category}"${locationText} סומן כטופל${reasonText}. תודה שעזרת לשמור על הבית! ✅`;
  }

  const encodedBody = encodeURIComponent(body);
  const normalizedPhone = normalizePhone(phone);
  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedBody}`;
};

