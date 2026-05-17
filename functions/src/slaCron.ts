import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { calculateWorkingDays, getSlaStatus } from "./utils/slaEngine";

/**
 * Scheduled Cron Job: Runs daily at 00:05 and 12:05 to update ticket SLA statuses.
 */
export const slaCron = onSchedule("5 0,12 * * *", async (event) => {
  const db = getFirestore();
  logger.info("SLA Cron Job started");

  try {
    const tenantsSnap = await db.collection("tenants").get();
    const now = new Date();
    
    // Cache for holidays to avoid repeated DB reads
    const holidayCache: Record<string, string[]> = {};

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantData = tenantDoc.data();
      const tenantId = tenantDoc.id;

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

    logger.info("SLA Cron Job completed successfully");
  } catch (err) {
    logger.error("SLA Cron Job failed", { error: err });
  }
});
