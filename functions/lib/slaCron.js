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
exports.slaCron = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const slaEngine_1 = require("./utils/slaEngine");
exports.slaCron = (0, scheduler_1.onSchedule)("5 0,12 * * *", async (event) => {
    const db = (0, firestore_1.getFirestore)();
    logger.info("SLA Cron Job started");
    try {
        const tenantsSnap = await db.collection("tenants").get();
        const now = new Date();
        const holidayCache = {};
        for (const tenantDoc of tenantsSnap.docs) {
            const tenantData = tenantDoc.data();
            const tenantId = tenantDoc.id;
            if (!tenantData.slaConfig?.enabled)
                continue;
            const country = tenantData.country || "IL";
            const workingDays = tenantData.slaConfig.workingDays || [0, 1, 2, 3, 4];
            if (!holidayCache[country]) {
                const hDoc = await db.collection("holidays").doc(country).get();
                holidayCache[country] = (hDoc.data()?.holidays || []).map((h) => h.date);
            }
            const holidays = holidayCache[country];
            const ticketsSnap = await db.collection("tenants")
                .doc(tenantId)
                .collection("tickets")
                .where("status", "in", ["open", "in-progress"])
                .get();
            if (ticketsSnap.empty)
                continue;
            const batch = db.batch();
            let batchCount = 0;
            for (const ticketDoc of ticketsSnap.docs) {
                const ticketData = ticketDoc.data();
                const startTime = ticketData.lastStatusChangeAt || ticketData.createdAt;
                if (!startTime)
                    continue;
                const stagnationDays = (0, slaEngine_1.calculateWorkingDays)(startTime, now, workingDays, holidays);
                const slaStatus = (0, slaEngine_1.getSlaStatus)(stagnationDays);
                if (ticketData.stagnationDays !== stagnationDays || ticketData.slaStatus !== slaStatus) {
                    batch.update(ticketDoc.ref, {
                        stagnationDays,
                        slaStatus,
                        updatedAt: now.toISOString()
                    });
                    batchCount++;
                }
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
    }
    catch (err) {
        logger.error("SLA Cron Job failed", { error: err });
    }
});
//# sourceMappingURL=slaCron.js.map