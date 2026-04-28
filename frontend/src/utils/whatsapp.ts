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
}) => {
  const { phone, summary, tenantId, tenantName, category, location, subLocation, imageId, urgency, labels, reporterName } = params;
  
  const displayName = tenantName || tenantId;
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
  let body = `*דיווח חדש: TikTak*\n`;
  if (displayUrgency === 'דחוף 🚨') body = `*דיווח דחוף 🚨: TikTak*\n`;
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
  return `https://wa.me/${phone}?text=${encodedBody}`;
};

