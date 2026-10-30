import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { db, admin, recordAuditLog } from "../shared/context";
import { sendResidentWhatsAppNotification } from "../shared/whatsappService";
import { calculateWorkingDays } from "../utils/slaEngine";

/**
 * SLA Tracker: Responds to status changes to update cumulative statistics.
 */
export const onTicketUpdate = onDocumentUpdated({ document: "tenants/{tenantId}/tickets/{ticketId}", secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  const oldStatus = before.status;
  const newStatus = after.status;

  // Only proceed if status has changed
  if (oldStatus === newStatus) return;

  const tenantId = event.params.tenantId;
  const ticketId = event.params.ticketId;
  const now = new Date();

  try {
    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    const tenantData = tenantDoc.data();
    if (!tenantData) return;

    const country = tenantData.country || "IL";
    const slaConfig = tenantData.slaConfig || { enabled: true, workingDays: [0, 1, 2, 3, 4] };

    // Fetch holidays
    const holidaysDoc = await db.collection("holidays").doc(country).get();
    const holidays = (holidaysDoc.data()?.holidays || []).map((h: any) => h.date);

    const update: any = {
      lastStatusChangeAt: now.toISOString(),
      updatedAt: now.toISOString(),
      stagnationDays: 0,
      slaStatus: 'none'
    };

    // Calculate working days spent in the OLD state
    const startTime = before.lastStatusChangeAt || before.createdAt;
    if (startTime) {
      const delta = calculateWorkingDays(startTime, now, slaConfig.workingDays, holidays);

      if (oldStatus === 'open') {
        update.total_days_in_new = (before.total_days_in_new || 0) + delta;
      } else if (oldStatus === 'in-progress') {
        update.total_days_in_progress = (before.total_days_in_progress || 0) + delta;
      }
    }

    // Reset logic for reopening
    if (newStatus === 'open') {
      update.total_days_in_new = 0;
      update.total_days_in_progress = 0;
      update.slaStatus = 'none';
      update.stagnationDays = 0;
      update.vaadRating = admin.firestore.FieldValue.delete();
    } else if (newStatus === 'in-progress' && (oldStatus === 'resolved' || oldStatus === 'dismissed')) {
      update.total_days_in_progress = 0;
      update.slaStatus = 'none';
      update.stagnationDays = 0;
      update.vaadRating = admin.firestore.FieldValue.delete();
    }

    await event.data?.after.ref.update(update);
    logger.info(`SLA stats updated for ticket ${ticketId}`, { tenantId, oldStatus, newStatus, update });

    // Track non-billable ticket exclusions (duplicates, out-of-scope, dismissed, rejected, irrelevant, outside)
    const oldReason = before.closureReason;
    const newReason = after.closureReason;
    const EXCLUSION_REASONS = ['duplicate', 'out_of_scope', 'outside', 'rejected', 'irrelevant'];
    const isExclusionNow = newStatus === 'dismissed' || EXCLUSION_REASONS.includes(newReason);
    const wasExclusionBefore = oldStatus === 'dismissed' || EXCLUSION_REASONS.includes(oldReason);

    if (isExclusionNow && !wasExclusionBefore) {
      try {
        await db.collection("tenants").doc(tenantId).set({
          subscription: {
            currentCycleExclusions: admin.firestore.FieldValue.increment(1)
          }
        }, { merge: true });

        await recordAuditLog({
          tenantId,
          action: 'QUOTA_NON_BILLABLE_FLAGGED',
          level: 'INFO',
          actor: { uid: after.updatedBy || 'admin', name: 'Admin', type: 'admin' },
          details: {
            ticketId,
            ticketNumber: after.ticketNumber,
            reason: newReason || newStatus
          }
        });

        logger.info(`Incremented currentCycleExclusions for tenant ${tenantId}`);
      } catch (exErr: any) {
        logger.error("Failed to increment currentCycleExclusions", exErr);
      }
    } else if (!isExclusionNow && wasExclusionBefore) {
      try {
        await db.collection("tenants").doc(tenantId).set({
          subscription: {
            currentCycleExclusions: admin.firestore.FieldValue.increment(-1)
          }
        }, { merge: true });
        logger.info(`Decremented currentCycleExclusions for tenant ${tenantId}`);
      } catch (exErr: any) {
        logger.error("Failed to decrement currentCycleExclusions", exErr);
      }
    }

    // Dispatch automated WhatsApp resident updates based on new status
    if (after.reporterPhone) {
      if (newStatus === 'backlog') {
        await sendResidentWhatsAppNotification({
          phone: after.reporterPhone,
          templateName: "ticket_status_backlog",
          ticketNumber: after.ticketNumber,
          category: after.category,
          location: after.location,
          subLocation: after.subLocation,
          tenantId
        });
      } else if (newStatus === 'in-progress') {
        await sendResidentWhatsAppNotification({
          phone: after.reporterPhone,
          templateName: "ticket_in_progress",
          ticketNumber: after.ticketNumber,
          category: after.category,
          location: after.location,
          subLocation: after.subLocation,
          tenantId
        });
      } else if (newStatus === 'resolved' || newStatus === 'dismissed') {
        const closureReason = after.closureReason || (newStatus === 'dismissed' ? 'rejected' : 'fixed');
        await sendResidentWhatsAppNotification({
          phone: after.reporterPhone,
          templateName: "ticket_resolved",
          ticketNumber: after.ticketNumber,
          category: after.category,
          location: after.location,
          subLocation: after.subLocation,
          closureReason,
          resolutionNote: after.resolutionNote,
          tenantId
        });
      }
    }

  } catch (err) {
    logger.error("Error in onTicketUpdate trigger", { error: err, tenantId, ticketId });
  }
});

