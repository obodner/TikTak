import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { calculateWorkingDays, getSlaStatus } from "./utils/slaEngine";
import { calculateCycleReset, buildBillingCycleSummary } from "./utils/quotaEngine";

/**
 * Helper to dispatch WhatsApp text notification from scheduled job
 */
async function sendCronWhatsAppText(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
  if (!token) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
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
  } catch (e) {
    logger.warn(`Failed to send WhatsApp alert in cron to ${to}`, e);
  }
}

/**
 * Scheduled Cron Job: Runs daily at 00:05 and 12:05 to update ticket SLA statuses,
 * check/reset monthly quota billing cycles, monitor annual RFQ license expiration,
 * and log billing cycle summaries.
 */
export const slaCron = onSchedule({ schedule: "5 0,12 * * *", secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (event) => {
  const db = getFirestore();
  logger.info("SLA, Quota Reset & RFQ License Cron Job started");

  try {
    const tenantsSnap = await db.collection("tenants").get();
    const now = new Date();
    
    // Cache for holidays to avoid repeated DB reads
    const holidayCache: Record<string, string[]> = {};

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantData = tenantDoc.data();
      const tenantId = tenantDoc.id;

      // 1. Subscription Billing Cycle Reset Check
      if (tenantData.isActive !== false && tenantData.subscription?.status !== 'frozen' && tenantData.subscription?.status !== 'cancelled' && tenantData.subscription?.cycleEndDate) {
        const cycleEnd = new Date(tenantData.subscription.cycleEndDate);
        if (now >= cycleEnd) {
          try {
            // Build and store billing cycle summary document for audit & manual invoicing
            const summaryRecord = buildBillingCycleSummary(tenantId, tenantData);
            const cycleDocId = summaryRecord.cycleStartDate.split("T")[0];
            await tenantDoc.ref.collection("billing_cycles").doc(cycleDocId).set(summaryRecord);

            // Audit Log Event
            const expireAt = new Date();
            expireAt.setFullYear(expireAt.getFullYear() + 7);
            await db.collection("audit_logs").add({
              tenantId,
              action: 'BILLING_CYCLE_CLOSED',
              level: 'INFO',
              actor: { uid: 'system', name: 'TikTak Billing Engine', type: 'admin' },
              details: summaryRecord,
              metadata: { tenantId, platform: 'backend' },
              createdAt: now.toISOString(),
              expireAt: Timestamp.fromDate(expireAt),
              appId: 'tiktak'
            });

            // Reset cycle & calculate 20% rollover cushion
            const resetSubscription = calculateCycleReset(tenantData);
            await tenantDoc.ref.update({ subscription: resetSubscription });
            logger.info(`Closed billing cycle and reset subscription for tenant ${tenantId}`, { summaryRecord, resetSubscription });
          } catch (resetErr) {
            logger.error(`Failed to reset billing cycle for tenant ${tenantId}`, resetErr);
          }
        }
      }

      // 2. RFQ Annual License Expiration Check (Multi-Admin Alerts at 30d, 7d, 0d)
      const rfqLic = tenantData.rfqLicensing;
      if (rfqLic && rfqLic.status === 'active' && rfqLic.licenseExpiresAt) {
        try {
          const expiresAt = new Date(rfqLic.licenseExpiresAt);
          const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const alertsSent = rfqLic.currentAnnualUsage?.alertsSent || {};
          const tenantName = tenantData.name || tenantId;

          let triggerType: 'expiry_30d' | 'expiry_7d' | 'expiry_0d' | null = null;
          let alertMsg = '';

          if (diffDays <= 30 && diffDays > 7 && !alertsSent['expiry_30d']) {
            triggerType = 'expiry_30d';
            alertMsg = `שלום,\nתזכורת ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString('he-IL')}).\nלחידוש הרישוי, היכנס למערכת הניהול.`;
          } else if (diffDays <= 7 && diffDays > 0 && !alertsSent['expiry_7d']) {
            triggerType = 'expiry_7d';
            alertMsg = `שלום,\nתזכורת דחופה ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString('he-IL')}).\nלחידוש הרישוי פנה בהקדם למנהל המערכת.`;
          } else if (diffDays <= 0 && !alertsSent['expiry_0d']) {
            triggerType = 'expiry_0d';
            alertMsg = `שלום,\nהודעה ממערכת TikTak:\nתוקף רישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" פג היום.\nמשלוח בקשות חדשות לקבלנים מוקפא עד לחידוש הרישוי.`;
          }

          if (triggerType) {
            logger.info(`Sending RFQ expiration alert (${triggerType}) for tenant ${tenantId}`);

            await tenantDoc.ref.set({
              rfqLicensing: {
                currentAnnualUsage: {
                  alertsSent: {
                    ...alertsSent,
                    [triggerType]: now.toISOString()
                  }
                }
              }
            }, { merge: true });

            await db.collection("audit_logs").add({
              tenantId,
              action: `RFQ_LICENSE_${triggerType.toUpperCase()}`,
              level: 'WARN',
              actor: { uid: 'system', name: 'TikTak RFQ License Monitor', type: 'admin' },
              details: {
                triggerType,
                diffDays,
                expiresAt: rfqLic.licenseExpiresAt,
                tier: rfqLic.tier
              },
              createdAt: now.toISOString(),
              appId: 'tiktak'
            });

            // Dispatch to all admins with phone numbers
            const adminUsersSnap = await tenantDoc.ref.collection("adminUsers").get();
            for (const uDoc of adminUsersSnap.docs) {
              const uData = uDoc.data();
              if (uData.mobile && uData.mobile.trim()) {
                let cleanPhone = uData.mobile.replace(/\D/g, "");
                if (cleanPhone.startsWith("0")) cleanPhone = "972" + cleanPhone.substring(1);
                await sendCronWhatsAppText(cleanPhone, alertMsg);
              }
            }
          }
        } catch (rfqErr) {
          logger.error(`Failed to process RFQ license expiration for tenant ${tenantId}`, rfqErr);
        }
      }

      // 3. SLA Updates
      if (!tenantData.slaConfig?.enabled) continue;

      const country = tenantData.country || "IL";
      const workingDays = tenantData.slaConfig.workingDays || [0, 1, 2, 3, 4];

      // Fetch holidays if not in cache
      if (!holidayCache[country]) {
        const hDoc = await db.collection("holidays").doc(country).get();
        holidayCache[country] = (hDoc.data()?.holidays || []).map((h: any) => h.date);
      }
      const holidays = holidayCache[country];

      // Process only active tickets (open or in-progress)
      const ticketsSnap = await db.collection("tenants")
        .doc(tenantId)
        .collection("tickets")
        .where("status", "in", ["open", "in-progress"])
        .get();

      if (ticketsSnap.empty) continue;

      const batch = db.batch();
      let batchCount = 0;

      for (const ticketDoc of ticketsSnap.docs) {
        const ticketData = ticketDoc.data();
        const startTime = ticketData.lastStatusChangeAt || ticketData.createdAt;

        if (!startTime) continue;

        const stagnationDays = calculateWorkingDays(startTime, now, workingDays, holidays);
        const slaStatus = getSlaStatus(stagnationDays);

        // Only update if something changed
        if (ticketData.stagnationDays !== stagnationDays || ticketData.slaStatus !== slaStatus) {
          batch.update(ticketDoc.ref, {
            stagnationDays,
            slaStatus,
            updatedAt: now.toISOString()
          });
          batchCount++;
        }

        // Firestore batch limit is 500
        if (batchCount >= 400) {
          await batch.commit();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        logger.info(`Updated ${batchCount} tickets for tenant ${tenantId}`);
      }
    }

    logger.info("SLA & Quota Reset Cron Job completed successfully");
  } catch (err) {
    logger.error("SLA & Quota Reset Cron Job failed", { error: err });
  }
});
