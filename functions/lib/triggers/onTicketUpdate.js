"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTicketUpdate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const context_1 = require("../shared/context");
const whatsappService_1 = require("../shared/whatsappService");
const slaEngine_1 = require("../utils/slaEngine");
exports.onTicketUpdate = (0, firestore_1.onDocumentUpdated)({ document: "tenants/{tenantId}/tickets/{ticketId}", secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const oldStatus = before.status;
    const newStatus = after.status;
    if (oldStatus === newStatus)
        return;
    const tenantId = event.params.tenantId;
    const ticketId = event.params.ticketId;
    const now = new Date();
    try {
        const tenantDoc = await context_1.db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantDoc.data();
        if (!tenantData)
            return;
        const country = tenantData.country || "IL";
        const slaConfig = tenantData.slaConfig || { enabled: true, workingDays: [0, 1, 2, 3, 4] };
        const holidaysDoc = await context_1.db.collection("holidays").doc(country).get();
        const holidays = (holidaysDoc.data()?.holidays || []).map((h) => h.date);
        const nowIso = now.toISOString();
        const update = {
            lastStatusChangeAt: nowIso,
            updatedAt: nowIso,
            stagnationDays: 0,
            slaStatus: 'none'
        };
        const startTime = before.lastStatusChangeAt || before.createdAt;
        if (startTime) {
            const delta = (0, slaEngine_1.calculateWorkingDays)(startTime, now, slaConfig.workingDays, holidays);
            if (oldStatus === 'open') {
                update.total_days_in_new = (before.total_days_in_new || 0) + delta;
            }
            else if (oldStatus === 'in-progress') {
                update.total_days_in_progress = (before.total_days_in_progress || 0) + delta;
            }
        }
        const hasVendorDispatch = Array.isArray(after.vendors) && after.vendors.length > 0;
        const baseCreatedAt = before.createdAt || nowIso;
        const existingPm = before.phaseMetrics
            ? JSON.parse(JSON.stringify(before.phaseMetrics))
            : {
                p1: {
                    startedAt: baseCreatedAt,
                    endedAt: oldStatus === 'open' ? null : (before.lastStatusChangeAt || baseCreatedAt),
                    currentStartedAt: oldStatus === 'open' ? (before.lastStatusChangeAt || baseCreatedAt) : null,
                    accumulatedMinutes: 0
                },
                p2: {
                    startedAt: oldStatus === 'in-progress' ? (before.lastStatusChangeAt || baseCreatedAt) : null,
                    endedAt: null,
                    currentStartedAt: (oldStatus === 'in-progress' && !hasVendorDispatch) ? (before.lastStatusChangeAt || baseCreatedAt) : null,
                    accumulatedMinutes: 0
                },
                p3: { startedAt: null, endedAt: null, minutes: null },
                p4: { startedAt: null, endedAt: null, minutes: null },
                p5: {
                    startedAt: before.vendorCompletedAt || null,
                    endedAt: null,
                    currentStartedAt: (before.vendorCompletedAt && !['resolved', 'dismissed'].includes(oldStatus)) ? before.vendorCompletedAt : null,
                    accumulatedMinutes: 0
                }
            };
        if (newStatus === 'open') {
            update.total_days_in_new = 0;
            update.total_days_in_progress = 0;
            update.slaStatus = 'none';
            update.stagnationDays = 0;
            update.vaadRating = context_1.admin.firestore.FieldValue.delete();
            update.phaseMetrics = (0, slaEngine_1.createInitialPhaseMetrics)(nowIso);
        }
        else {
            const isClosing = newStatus === 'resolved' || newStatus === 'dismissed';
            const isBacklog = newStatus === 'backlog';
            if (oldStatus === 'open') {
                existingPm.p1 = (0, slaEngine_1.pausePhaseTimer)(existingPm.p1, nowIso, !isBacklog);
            }
            else if (oldStatus === 'in-progress') {
                existingPm.p2 = (0, slaEngine_1.pausePhaseTimer)(existingPm.p2, nowIso, !isBacklog);
            }
            if (isClosing) {
                if (existingPm.p5?.currentStartedAt || after.vendorCompletedAt) {
                    existingPm.p5 = (0, slaEngine_1.pausePhaseTimer)(existingPm.p5, nowIso, true);
                }
                if (!after.resolvedAt) {
                    update.resolvedAt = nowIso;
                }
            }
            if (newStatus === 'in-progress') {
                if (oldStatus === 'resolved' || oldStatus === 'dismissed') {
                    update.vaadRating = context_1.admin.firestore.FieldValue.delete();
                }
                if (!hasVendorDispatch) {
                    existingPm.p2 = (0, slaEngine_1.resumePhaseTimer)(existingPm.p2, nowIso);
                }
                else if (after.vendorCompletedAt) {
                    existingPm.p5 = (0, slaEngine_1.resumePhaseTimer)(existingPm.p5, nowIso);
                }
            }
            update.phaseMetrics = existingPm;
        }
        await event.data?.after.ref.update(update);
        logger.info(`SLA stats updated for ticket ${ticketId}`, { tenantId, oldStatus, newStatus, update });
        const oldReason = before.closureReason;
        const newReason = after.closureReason;
        const EXCLUSION_REASONS = ['duplicate', 'out_of_scope', 'outside', 'rejected', 'irrelevant'];
        const isExclusionNow = newStatus === 'dismissed' || EXCLUSION_REASONS.includes(newReason);
        const wasExclusionBefore = oldStatus === 'dismissed' || EXCLUSION_REASONS.includes(oldReason);
        if (isExclusionNow && !wasExclusionBefore) {
            try {
                await context_1.db.collection("tenants").doc(tenantId).set({
                    subscription: {
                        currentCycleExclusions: context_1.admin.firestore.FieldValue.increment(1)
                    }
                }, { merge: true });
                await (0, context_1.recordAuditLog)({
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
            }
            catch (exErr) {
                logger.error("Failed to increment currentCycleExclusions", exErr);
            }
        }
        else if (!isExclusionNow && wasExclusionBefore) {
            try {
                await context_1.db.collection("tenants").doc(tenantId).set({
                    subscription: {
                        currentCycleExclusions: context_1.admin.firestore.FieldValue.increment(-1)
                    }
                }, { merge: true });
                logger.info(`Decremented currentCycleExclusions for tenant ${tenantId}`);
            }
            catch (exErr) {
                logger.error("Failed to decrement currentCycleExclusions", exErr);
            }
        }
        if (after.reporterPhone) {
            if (newStatus === 'backlog') {
                await (0, whatsappService_1.sendResidentWhatsAppNotification)({
                    phone: after.reporterPhone,
                    templateName: "ticket_status_backlog",
                    ticketNumber: after.ticketNumber,
                    category: after.category,
                    location: after.location,
                    subLocation: after.subLocation,
                    tenantId
                });
            }
            else if (newStatus === 'in-progress') {
                await (0, whatsappService_1.sendResidentWhatsAppNotification)({
                    phone: after.reporterPhone,
                    templateName: "ticket_in_progress",
                    ticketNumber: after.ticketNumber,
                    category: after.category,
                    location: after.location,
                    subLocation: after.subLocation,
                    tenantId
                });
            }
            else if (newStatus === 'resolved' || newStatus === 'dismissed') {
                const closureReason = after.closureReason || (newStatus === 'dismissed' ? 'rejected' : 'fixed');
                await (0, whatsappService_1.sendResidentWhatsAppNotification)({
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
    }
    catch (err) {
        logger.error("Error in onTicketUpdate trigger", { error: err, tenantId, ticketId });
    }
});
//# sourceMappingURL=onTicketUpdate.js.map