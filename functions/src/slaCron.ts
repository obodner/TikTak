import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { calculateWorkingDays, getSlaStatus } from "./utils/slaEngine";
import { calculateCycleReset, buildBillingCycleSummary } from "./utils/quotaEngine";

/**
 * Scheduled Cron Job: Runs daily at 00:05 and 12:05 to update ticket SLA statuses,
 * check/reset monthly quota billing cycles, and log billing cycle summaries.
 */
export const slaCron = onSchedule("5 0,12 * * *", async (event) => {
  const db = getFirestore();
  logger.info("SLA & Quota Reset Cron Job started");

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

      // 2. SLA Updates
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
