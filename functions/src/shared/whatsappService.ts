import * as logger from "firebase-functions/logger";
import { db, APP_BASE_URL, appendStgParam, recordAuditLog, sanitizeParam } from "./context";
import { getTenantQuotaStats } from "../utils/quotaEngine";

export async function sendWhatsAppMessage(to: string, payloadBody: any, phoneNumberId: string, token: string) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    ...payloadBody
  };

  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const resData: any = await response.json();
  if (!response.ok) {
    logger.error(`Meta API error sending to ${to}:`, resData);
    throw new Error(`Meta API error: ${JSON.stringify(resData)}`);
  }
  return resData;
}

export async function sendWhatsAppText(to: string, text: string, phoneNumberId: string, token: string) {
  return sendWhatsAppMessage(to, {
    type: "text",
    text: { preview_url: false, body: text }
  }, phoneNumberId, token);
}

export async function sendWhatsAppImage(to: string, imageUrl: string, phoneNumberId: string, token: string) {
  return sendWhatsAppMessage(to, {
    type: "image",
    image: { link: imageUrl }
  }, phoneNumberId, token);
}

export async function sendWhatsAppAudio(to: string, audioUrl: string, phoneNumberId: string, token: string) {
  return sendWhatsAppMessage(to, {
    type: "audio",
    audio: { link: audioUrl }
  }, phoneNumberId, token);
}

export async function sendWhatsAppDocument(to: string, documentUrl: string, fileName: string, phoneNumberId: string, token: string) {
  return sendWhatsAppMessage(to, {
    type: "document",
    document: { link: documentUrl, filename: fileName }
  }, phoneNumberId, token);
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  langCode: string,
  parameters: string[],
  phoneNumberId: string,
  token: string,
  buttonUrlSuffix?: string
) {
  const components: any[] = [
    {
      type: "body",
      parameters: parameters.map(p => ({ type: "text", text: p }))
    }
  ];

  if (buttonUrlSuffix) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: appendStgParam(buttonUrlSuffix)
        }
      ]
    });
  }

  return sendWhatsAppMessage(to, {
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode },
      components
    }
  }, phoneNumberId, token);
}

export async function sendWhatsAppButtons(to: string, text: string, buttons: { id: string, title: string }[], phoneNumberId: string, token: string) {
  return sendWhatsAppMessage(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text },
      action: {
        buttons: buttons.map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title.substring(0, 20) }
        }))
      }
    }
  }, phoneNumberId, token);
}

export function translateClosureReason(reason: string): string {
  const mapping: Record<string, string> = {
    'fixed': 'טופל',
    'duplicate': 'כפילות',
    'irrelevant': 'לא רלוונטי',
    'vendor': 'בטיפול ספק',
    'outside': 'מחוץ לאחריות',
    'rejected': 'נדחה'
  };
  return mapping[reason] || reason || 'טופל';
}

export async function sendWhatsAppNotification(params: {
  tenantId: string;
  tenantName: string;
  ticketNumber: number;
  category: string;
  summary: string;
  location: string | null;
  subLocation: string | null;
  urgency: string | null;
  reporterName: string | null;
  imageId: string | null;
  audioId: string | null;
  admins: { name: string; phone: string }[];
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";

  if (!token) {
    logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager");
    return;
  }

  if (!params.admins || params.admins.length === 0) {
    logger.warn("No administrators configured for this tenant, skipping WhatsApp notifications.");
    return;
  }

  // Format Location block using tenant's custom bold RTL style dynamically
  let locationLabel = "רחוב";
  let subLocationLabel = "אזור";

  if (params.tenantId) {
    try {
      const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
      const uiConfig = tenantDoc.data()?.uiConfig || {};
      if (uiConfig.locationLabel) locationLabel = uiConfig.locationLabel;
      if (uiConfig.subLocationLabel) subLocationLabel = uiConfig.subLocationLabel;
    } catch (err) {
      logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
    }
  }

  let formattedLocation = "";
  const locationParts: string[] = [];
  if (params.subLocation) {
    locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
  }
  if (params.location) {
    locationParts.push(`*${locationLabel}*: ${params.location}`);
  }
  if (locationParts.length > 0) {
    formattedLocation = locationParts.join(" • ");
  } else {
    formattedLocation = "לא צוין מיקום";
  }

  // Map Urgency/Severity to Hebrew string with emojis
  let severityHebrew = "בינונית ⚠️";
  const lowerUrgency = (params.urgency || "").toLowerCase();
  if (lowerUrgency === "high") {
    severityHebrew = "גבוהה 🚨";
  } else if (lowerUrgency === "low") {
    severityHebrew = "נמוכה";
  } else if (lowerUrgency === "moderate" || lowerUrgency === "medium") {
    severityHebrew = "בינונית ⚠️";
  }

  const hasImage = !!params.imageId;
  const hasAudio = !!params.audioId;

  let templateName = "resident_submit_ticket_no_media";
  const buttonComponents: any[] = [];

  if (hasImage && hasAudio) {
    templateName = "resident_submit_ticket_all_media";
    buttonComponents.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: appendStgParam(`${params.tenantId}/${params.imageId}.jpg`) }]
    });
    buttonComponents.push({
      type: "button",
      sub_type: "url",
      index: "1",
      parameters: [{ type: "text", text: appendStgParam(`${params.tenantId}/${params.audioId}.webm`) }]
    });
  } else if (hasImage) {
    templateName = "resident_submit_ticket_image";
    buttonComponents.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: appendStgParam(`${params.tenantId}/${params.imageId}.jpg`) }]
    });
  } else if (hasAudio) {
    templateName = "resident_submit_ticket_audio";
    buttonComponents.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: appendStgParam(`${params.tenantId}/${params.audioId}.webm`) }]
    });
  }

  for (const admin of params.admins) {
    try {
      // Normalize admin phone number to international standard (972...)
      let cleanPhone = admin.phone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
        cleanPhone = "972" + cleanPhone.substring(1);
      }

      const components: any[] = [
        {
          type: "body",
          parameters: [
            { type: "text", text: sanitizeParam(params.tenantName) },
            { type: "text", text: sanitizeParam(String(params.ticketNumber)) },
            { type: "text", text: sanitizeParam(params.category) },
            { type: "text", text: sanitizeParam(severityHebrew) },
            { type: "text", text: sanitizeParam(params.summary || "אין תיאור") },
            { type: "text", text: sanitizeParam(formattedLocation) },
            { type: "text", text: sanitizeParam(params.reporterName || "תושב/ת") }
          ]
        }
      ];

      if (buttonComponents.length > 0) {
        components.push(...buttonComponents);
      }

      const payload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: templateName === "resident_submit_ticket_no_media" ? "en" : "he"
          },
          components
        }
      };

      logger.info(`Sending WhatsApp alert to admin ${admin.name} (${cleanPhone}) using template ${templateName}...`);

      const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const resData: any = await response.json();
      if (!response.ok) {
        logger.error(`Meta API returned error for admin ${admin.name}:`, resData);
      } else {
        logger.info(`WhatsApp alert successfully sent to admin ${admin.name}`, { messageId: resData.messages?.[0]?.id });
      }
    } catch (err) {
      logger.error(`Exception while sending WhatsApp alert to admin ${admin.name}:`, err);
    }
  }
}

export async function sendResidentWhatsAppNotification(params: {
  phone: string;
  templateName: string;
  ticketNumber: number;
  category: string;
  location: string | null;
  subLocation: string | null;
  closureReason?: string | null;
  resolutionNote?: string | null;
  tenantId?: string;
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";

  if (!token) {
    logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager, skipping resident notification.");
    return;
  }

  if (!params.phone) {
    logger.warn("No phone number provided for resident notification, skipping.");
    return;
  }

  // Normalize phone number to international standard (972...)
  let cleanPhone = params.phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
    cleanPhone = "972" + cleanPhone.substring(1);
  }

  // Format Location block using tenant's custom bold RTL style dynamically
  let locationLabel = "רחוב";
  let subLocationLabel = "אזור";
  let tenantName = "ועד הבית"; // fallback default

  if (params.tenantId) {
    try {
      const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
      const tenantData = tenantDoc.data() || {};
      if (tenantData.name) tenantName = tenantData.name;
      const uiConfig = tenantData.uiConfig || {};
      if (uiConfig.locationLabel) locationLabel = uiConfig.locationLabel;
      if (uiConfig.subLocationLabel) subLocationLabel = uiConfig.subLocationLabel;
    } catch (err) {
      logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
    }
  }

  let formattedLocation = "";
  const locationParts: string[] = [];
  if (params.subLocation) {
    locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
  }
  if (params.location) {
    locationParts.push(`*${locationLabel}*: ${params.location}`);
  }
  if (locationParts.length > 0) {
    formattedLocation = locationParts.join(" • ");
  } else {
    formattedLocation = "לא צוין מיקום";
  }

  const parameters: any[] = [
    { type: "text", text: sanitizeParam(String(params.ticketNumber)) },
    { type: "text", text: sanitizeParam(params.category) },
    { type: "text", text: sanitizeParam(formattedLocation) }
  ];

  if (params.templateName === "ticket_resolved") {
    let reasonHebrew = translateClosureReason(params.closureReason || "fixed");
    if (params.resolutionNote && params.resolutionNote.trim()) {
      reasonHebrew += ` (${params.resolutionNote.trim()})`;
    }
    parameters.push({ type: "text", text: sanitizeParam(reasonHebrew) });
  }

  try {
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: params.templateName,
        language: {
          code: "he"
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "text",
                text: tenantName
              }
            ]
          },
          {
            type: "body",
            parameters
          }
        ]
      }
    };

    logger.info(`Sending WhatsApp resident alert to ${cleanPhone} using template ${params.templateName}...`);

    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resData: any = await response.json();
    if (!response.ok) {
      logger.error(`Meta API returned error for resident ${cleanPhone}:`, resData);
    } else {
      logger.info(`WhatsApp alert successfully sent to resident ${cleanPhone}`, { messageId: resData.messages?.[0]?.id });
    }
  } catch (err) {
    logger.error(`Exception while sending WhatsApp resident alert to ${cleanPhone}:`, err);
  }
}

export async function sendQuotaWhatsAppAlertTemplate(params: {
  phone: string;
  adminName: string;
  tenantName: string;
  tier: string;
  netUsed: number;
  effectiveQuota: number;
  tenantType: string;
  templateName: "ticket_quota_alert_80" | "ticket_quota_alert_100";
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";

  if (!token) {
    logger.warn("WHATSAPP_ACCESS_TOKEN not set, skipping WhatsApp quota alert dispatch.");
    return;
  }

  let cleanPhone = params.phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "972" + cleanPhone.substring(1);
  }

  const tenantTypeLabel = params.tenantType === 'municipality' ? 'יישוב' : 'בניין';
  const dashboardLink = `${APP_BASE_URL}/admin`;

  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: "he" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.adminName || "מנהל" },                            // {{1}}
            { type: "text", text: params.tenantName },                                       // {{2}}
            { type: "text", text: params.tier.toUpperCase() },                               // {{3}}
            { type: "text", text: params.netUsed.toString() },                                // {{4}}
            { type: "text", text: params.effectiveQuota.toString() },                        // {{5}}
            { type: "text", text: dashboardLink },                                           // {{6}}
            { type: "text", text: tenantTypeLabel }                                          // {{7}}
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const resData: any = await response.json();
    if (!response.ok) {
      logger.error(`Failed to send ${params.templateName} to ${cleanPhone}:`, resData);
    } else {
      logger.info(`Successfully sent ${params.templateName} to ${cleanPhone}`, { messageId: resData.messages?.[0]?.id });
    }
  } catch (err: any) {
    logger.error(`Error sending ${params.templateName} to ${cleanPhone}:`, err);
  }
}

export async function checkAndDispatchQuotaAlerts(tenantId: string, tenantData: any) {
  try {
    const stats = getTenantQuotaStats(tenantData);
    const sub = tenantData.subscription || {};
    const nowIso = new Date().toISOString();

    // 1. Check 80% Threshold
    if (stats.usagePercentage >= 80 && !sub.warned80PercentAt) {
      logger.info(`Tenant ${tenantId} reached 80% quota usage (${stats.netUsedTickets}/${stats.effectiveQuota})`);

      await db.collection("tenants").doc(tenantId).set({
        subscription: {
          warned80PercentAt: nowIso
        }
      }, { merge: true });

      await recordAuditLog({
        tenantId,
        action: 'QUOTA_ALERT_DISPATCHED',
        level: 'WARN',
        actor: { uid: 'system', name: 'TikTak Quota Engine', type: 'admin' },
        details: {
          threshold: '80%',
          netUsedTickets: stats.netUsedTickets,
          effectiveQuota: stats.effectiveQuota,
          tier: stats.tier
        }
      });

      const adminUsersSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
      for (const userDoc of adminUsersSnap.docs) {
        const uData = userDoc.data();
        if (uData.mobile && uData.mobile.trim()) {
          const adminName = `${uData.firstName || ""} ${uData.lastName || ""}`.trim() || uData.name || "מנהל";
          await sendQuotaWhatsAppAlertTemplate({
            phone: uData.mobile.trim(),
            adminName,
            tenantName: tenantData.name || tenantId,
            tier: stats.tier,
            netUsed: stats.netUsedTickets,
            effectiveQuota: stats.effectiveQuota,
            tenantType: tenantData.type || 'building',
            templateName: 'ticket_quota_alert_80'
          });
        }
      }
    }

    // 2. Check 100% Threshold
    if (stats.usagePercentage >= 100 && !sub.warned100PercentAt) {
      logger.info(`Tenant ${tenantId} reached 100% quota usage (${stats.netUsedTickets}/${stats.effectiveQuota})`);

      await db.collection("tenants").doc(tenantId).set({
        subscription: {
          warned100PercentAt: nowIso
        }
      }, { merge: true });

      await recordAuditLog({
        tenantId,
        action: 'QUOTA_ALERT_DISPATCHED',
        level: 'WARN',
        actor: { uid: 'system', name: 'TikTak Quota Engine', type: 'admin' },
        details: {
          threshold: '100%',
          netUsedTickets: stats.netUsedTickets,
          effectiveQuota: stats.effectiveQuota,
          tier: stats.tier
        }
      });

      const adminUsersSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
      for (const userDoc of adminUsersSnap.docs) {
        const uData = userDoc.data();
        if (uData.mobile && uData.mobile.trim()) {
          const adminName = `${uData.firstName || ""} ${uData.lastName || ""}`.trim() || uData.name || "מנהל";
          await sendQuotaWhatsAppAlertTemplate({
            phone: uData.mobile.trim(),
            adminName,
            tenantName: tenantData.name || tenantId,
            tier: stats.tier,
            netUsed: stats.netUsedTickets,
            effectiveQuota: stats.effectiveQuota,
            tenantType: tenantData.type || 'building',
            templateName: 'ticket_quota_alert_100'
          });
        }
      }
    }
  } catch (alertErr: any) {
    logger.error(`Error in checkAndDispatchQuotaAlerts for ${tenantId}`, alertErr);
  }
}

export async function getTenantAdminsWithPhones(tenantId: string, parentEnterpriseId?: string): Promise<{ name: string; phone: string }[]> {
  const admins: { name: string; phone: string }[] = [];
  const seenPhones = new Set<string>();

  try {
    const snap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
    for (const d of snap.docs) {
      const data = d.data();
      if (data.mobile && data.mobile.trim()) {
        let clean = data.mobile.replace(/\D/g, "");
        if (clean.startsWith("0")) clean = "972" + clean.substring(1);
        if (!seenPhones.has(clean)) {
          seenPhones.add(clean);
          admins.push({
            name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'מנהל',
            phone: clean
          });
        }
      }
    }

    if (parentEnterpriseId && parentEnterpriseId !== tenantId) {
      const parentSnap = await db.collection("tenants").doc(parentEnterpriseId).collection("adminUsers").get();
      for (const d of parentSnap.docs) {
        const data = d.data();
        if (data.mobile && data.mobile.trim()) {
          let clean = data.mobile.replace(/\D/g, "");
          if (clean.startsWith("0")) clean = "972" + clean.substring(1);
          if (!seenPhones.has(clean)) {
            seenPhones.add(clean);
            admins.push({
              name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'מנהל מתחם',
              phone: clean
            });
          }
        }
      }
    }
  } catch (e) {
    logger.error(`Failed to fetch admin users for tenant ${tenantId}:`, e);
  }

  return admins;
}

export async function checkAndDispatchRfqQuotaAlerts(tenantId: string, tenantData: any, newCount: number) {
  try {
    const rfqLicensing = tenantData.rfqLicensing || {};
    const annualQuota = Number(rfqLicensing.annualQuota ?? 0);
    if (annualQuota <= 0) return;

    const ratio = newCount / annualQuota;
    const alertsSent = rfqLicensing.currentAnnualUsage?.alertsSent || {};
    const nowIso = new Date().toISOString();
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";

    // 80% Threshold Alert
    if (ratio >= 0.8 && !alertsSent['80_percent']) {
      logger.info(`Tenant ${tenantId} reached 80% RFQ annual quota (${newCount}/${annualQuota})`);

      await db.collection("tenants").doc(tenantId).set({
        rfqLicensing: {
          currentAnnualUsage: {
            alertsSent: {
              ...alertsSent,
              '80_percent': nowIso
            }
          }
        }
      }, { merge: true });

      await recordAuditLog({
        tenantId,
        action: 'RFQ_QUOTA_ALERT_80',
        level: 'WARN',
        actor: { uid: 'system', name: 'TikTak RFQ Licensing Engine', type: 'admin' },
        details: {
          threshold: '80%',
          newCount,
          annualQuota,
          tier: rfqLicensing.tier
        }
      });

      if (token) {
        const admins = await getTenantAdminsWithPhones(tenantId, tenantData.parentEnterpriseId);
        const tenantName = tenantData.name || tenantId;
        for (const adminItem of admins) {
          const text = `שלום ${adminItem.name},\nהתראת מכסה ממערכת TikTak:\nמתחם/בניין "${tenantName}" הגיע ל-80% מנצולת בנק הצעות המחיר השנתי (נוצלו ${newCount} מתוך ${annualQuota} בקשות).\n\nלצפייה בפרטים וניהול המכרזים:\n${APP_BASE_URL}/admin/${tenantId}/dashboard`;
          await sendWhatsAppText(adminItem.phone, text, phoneNumberId, token).catch((e: any) =>
            logger.warn(`Failed to send 80% RFQ alert to ${adminItem.phone}`, e)
          );
        }
      }
    }

    // 100% Threshold Alert
    if (ratio >= 1.0 && !alertsSent['100_percent']) {
      logger.info(`Tenant ${tenantId} reached 100% RFQ annual quota (${newCount}/${annualQuota})`);

      await db.collection("tenants").doc(tenantId).set({
        rfqLicensing: {
          currentAnnualUsage: {
            alertsSent: {
              ...alertsSent,
              '100_percent': nowIso
            }
          }
        }
      }, { merge: true });

      await recordAuditLog({
        tenantId,
        action: 'RFQ_QUOTA_ALERT_100',
        level: 'WARN',
        actor: { uid: 'system', name: 'TikTak RFQ Licensing Engine', type: 'admin' },
        details: {
          threshold: '100%',
          newCount,
          annualQuota,
          tier: rfqLicensing.tier,
          enforcementMode: rfqLicensing.enforcementMode
        }
      });

      if (token) {
        const admins = await getTenantAdminsWithPhones(tenantId, tenantData.parentEnterpriseId);
        const tenantName = tenantData.name || tenantId;
        const overageNote = rfqLicensing.enforcementMode === 'hard'
          ? "משלוח בקשות נוספות נחסם עד לשדרוג החבילה (Hard Cap)."
          : `כל בקשה נוספת תחויב בתעריף חריגה של ₪${rfqLicensing.overageRate ?? 45}.`;

        for (const adminItem of admins) {
          const text = `שלום ${adminItem.name},\nהתראת מכסה ממערכת TikTak:\nמתחם/בניין "${tenantName}" הגיע ל-100% מנצולת בנק הצעות המחיר השנתי (${newCount}/${annualQuota}).\n${overageNote}\n\nלשדרוג חבילה וניהול:\n${APP_BASE_URL}/admin/${tenantId}/dashboard`;
          await sendWhatsAppText(adminItem.phone, text, phoneNumberId, token).catch((e: any) =>
            logger.warn(`Failed to send 100% RFQ alert to ${adminItem.phone}`, e)
          );
        }
      }
    }
  } catch (err: any) {
    logger.error(`Error in checkAndDispatchRfqQuotaAlerts for ${tenantId}:`, err);
  }
}

