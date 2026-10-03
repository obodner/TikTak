import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

/**
 * Dispatch WhatsApp alert to a recipient via Meta Cloud API
 */
async function sendExpiryWhatsAppAlert(to: string, text: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
  if (!token) {
    logger.warn(`WHATSAPP_ACCESS_TOKEN not configured. Skipping WhatsApp alert to ${to}`);
    return false;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text }
      })
    });
    return res.ok;
  } catch (e) {
    logger.warn(`Failed to dispatch WhatsApp expiry alert to ${to}`, e);
    return false;
  }
}

/**
 * Resolves all distinct phone numbers of registered admins for a tenant,
 * including its parent fleet master if applicable.
 */
async function getAdminsWithPhones(db: FirebaseFirestore.Firestore, tenantId: string, parentEnterpriseId?: string): Promise<{ name: string; phone: string }[]> {
  const admins: { name: string; phone: string }[] = [];
  const seen = new Set<string>();

  try {
    const snap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
    for (const d of snap.docs) {
      const data = d.data();
      if (data.mobile && typeof data.mobile === "string" && data.mobile.trim()) {
        let clean = data.mobile.replace(/\D/g, "");
        if (clean.startsWith("0")) clean = "972" + clean.substring(1);
        if (!seen.has(clean)) {
          seen.add(clean);
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
        if (data.mobile && typeof data.mobile === "string" && data.mobile.trim()) {
          let clean = data.mobile.replace(/\D/g, "");
          if (clean.startsWith("0")) clean = "972" + clean.substring(1);
          if (!seen.has(clean)) {
            seen.add(clean);
            admins.push({
              name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'מנהל מתחם',
              phone: clean
            });
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Error resolving admin users with phones for tenant ${tenantId}`, err);
  }

  return admins;
}

/**
 * Scheduled Cron Job: Runs daily at 06:00 UTC.
 * Scans active tenants with `rfqLicensing.licenseExpiresAt`.
 * Dispatches alerts at 30 days before, 7 days before, and day of expiration to all admin phone numbers.
 * Records milestone timestamps in `expiryAlertsSent` and `audit_logs` for idempotency.
 */
export const checkAnnualLicenseExpirations = onSchedule({
  schedule: "0 6 * * *",
  secrets: ["WHATSAPP_ACCESS_TOKEN"]
}, async (event) => {
  const db = getFirestore();
  const now = new Date();
  logger.info("Starting checkAnnualLicenseExpirations cron job at 06:00 UTC", { timestamp: now.toISOString() });

  try {
    const tenantsSnap = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantData = tenantDoc.data();
      const tenantId = tenantDoc.id;

      if (tenantData.isActive === false) continue;

      const rfqLic = tenantData.rfqLicensing;
      if (!rfqLic || rfqLic.status !== "active" || !rfqLic.licenseExpiresAt) continue;

      try {
        const expiresAt = new Date(rfqLic.licenseExpiresAt);
        if (isNaN(expiresAt.getTime())) continue;

        const diffTime = expiresAt.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Retrieve existing alert milestones
        const existingAlerts = {
          ...(rfqLic.currentAnnualUsage?.alertsSent || {}),
          ...(rfqLic.expiryAlertsSent || {})
        };

        const tenantName = tenantData.name || tenantId;
        let triggerMilestone: "expiry_30d" | "expiry_7d" | "expiry_0d" | null = null;
        let alertMessage = "";

        if (diffDays <= 30 && diffDays > 7 && !existingAlerts["expiry_30d"]) {
          triggerMilestone = "expiry_30d";
          alertMessage = `שלום,\nתזכורת ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString("he-IL")}).\nלחידוש הרישוי והבטחת המשך פעילות רציפה, היכנס למערכת הניהול.`;
        } else if (diffDays <= 7 && diffDays > 0 && !existingAlerts["expiry_7d"]) {
          triggerMilestone = "expiry_7d";
          alertMessage = `שלום,\nתזכורת דחופה ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString("he-IL")}).\nלחידוש הרישוי פנה בהקדם למנהל המערכת.`;
        } else if (diffDays <= 0 && !existingAlerts["expiry_0d"]) {
          triggerMilestone = "expiry_0d";
          alertMessage = `שלום,\nהודעה ממערכת TikTak:\nתוקף רישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" פג היום (${expiresAt.toLocaleDateString("he-IL")}).\nשילוח בקשות חדשות לקבלנים מוקפא עד לחידוש הרישוי.`;
        }

        if (triggerMilestone) {
          logger.info(`Triggering RFQ license expiration milestone [${triggerMilestone}] for tenant ${tenantId} (${tenantName})`);

          // 1. Persist milestone timestamp to prevent duplicate notifications
          await tenantDoc.ref.set({
            rfqLicensing: {
              expiryAlertsSent: {
                ...existingAlerts,
                [triggerMilestone]: now.toISOString()
              },
              currentAnnualUsage: {
                alertsSent: {
                  ...existingAlerts,
                  [triggerMilestone]: now.toISOString()
                }
              }
            }
          }, { merge: true });

          // 2. Audit log entry
          const expireAt = new Date();
          expireAt.setFullYear(expireAt.getFullYear() + 7);
          await db.collection("audit_logs").add({
            tenantId,
            action: `RFQ_LICENSE_${triggerMilestone.toUpperCase()}`,
            level: "WARN",
            actor: { uid: "system", name: "TikTak License Expiry Engine", type: "admin" },
            details: {
              milestone: triggerMilestone,
              remainingDays: diffDays,
              licenseExpiresAt: rfqLic.licenseExpiresAt,
              tier: rfqLic.tier
            },
            createdAt: now.toISOString(),
            expireAt: Timestamp.fromDate(expireAt),
            metadata: { tenantId, platform: "backend" },
            appId: "tiktak"
          });

          // 3. Resolve all registered admins with valid phone numbers (including fleet parent if applicable)
          const admins = await getAdminsWithPhones(db, tenantId, tenantData.parentEnterpriseId);
          for (const admin of admins) {
            await sendExpiryWhatsAppAlert(admin.phone, alertMessage);
          }
          logger.info(`Dispatched ${triggerMilestone} WhatsApp alert to ${admins.length} admins for tenant ${tenantId}`);
        }
      } catch (err) {
        logger.error(`Error processing RFQ expiration for tenant ${tenantId}`, err);
      }
    }

    logger.info("checkAnnualLicenseExpirations cron job finished successfully");
  } catch (error) {
    logger.error("checkAnnualLicenseExpirations cron job failed", error);
  }
});
