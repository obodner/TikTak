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
exports.checkAnnualLicenseExpirations = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
async function sendExpiryWhatsAppAlert(to, text) {
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
    }
    catch (e) {
        logger.warn(`Failed to dispatch WhatsApp expiry alert to ${to}`, e);
        return false;
    }
}
async function getAdminsWithPhones(db, tenantId, parentEnterpriseId) {
    const admins = [];
    const seen = new Set();
    try {
        const snap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
        for (const d of snap.docs) {
            const data = d.data();
            if (data.mobile && typeof data.mobile === "string" && data.mobile.trim()) {
                let clean = data.mobile.replace(/\D/g, "");
                if (clean.startsWith("0"))
                    clean = "972" + clean.substring(1);
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
                    if (clean.startsWith("0"))
                        clean = "972" + clean.substring(1);
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
    }
    catch (err) {
        logger.error(`Error resolving admin users with phones for tenant ${tenantId}`, err);
    }
    return admins;
}
exports.checkAnnualLicenseExpirations = (0, scheduler_1.onSchedule)({
    schedule: "0 6 * * *",
    secrets: ["WHATSAPP_ACCESS_TOKEN"]
}, async (event) => {
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    logger.info("Starting checkAnnualLicenseExpirations cron job at 06:00 UTC", { timestamp: now.toISOString() });
    try {
        const tenantsSnap = await db.collection("tenants").get();
        for (const tenantDoc of tenantsSnap.docs) {
            const tenantData = tenantDoc.data();
            const tenantId = tenantDoc.id;
            if (tenantData.isActive === false)
                continue;
            const rfqLic = tenantData.rfqLicensing;
            if (!rfqLic || rfqLic.status !== "active" || !rfqLic.licenseExpiresAt)
                continue;
            try {
                const expiresAt = new Date(rfqLic.licenseExpiresAt);
                if (isNaN(expiresAt.getTime()))
                    continue;
                const diffTime = expiresAt.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const existingAlerts = {
                    ...(rfqLic.currentAnnualUsage?.alertsSent || {}),
                    ...(rfqLic.expiryAlertsSent || {})
                };
                const tenantName = tenantData.name || tenantId;
                let triggerMilestone = null;
                let alertMessage = "";
                if (diffDays <= 30 && diffDays > 7 && !existingAlerts["expiry_30d"]) {
                    triggerMilestone = "expiry_30d";
                    alertMessage = `שלום,\nתזכורת ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString("he-IL")}).\nלחידוש הרישוי והבטחת המשך פעילות רציפה, היכנס למערכת הניהול.`;
                }
                else if (diffDays <= 7 && diffDays > 0 && !existingAlerts["expiry_7d"]) {
                    triggerMilestone = "expiry_7d";
                    alertMessage = `שלום,\nתזכורת דחופה ממערכת TikTak:\nרישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" יפוג בעוד ${diffDays} ימים (בתאריך ${expiresAt.toLocaleDateString("he-IL")}).\nלחידוש הרישוי פנה בהקדם למנהל המערכת.`;
                }
                else if (diffDays <= 0 && !existingAlerts["expiry_0d"]) {
                    triggerMilestone = "expiry_0d";
                    alertMessage = `שלום,\nהודעה ממערכת TikTak:\nתוקף רישוי הצעות המחיר השנתי (RFQ) של "${tenantName}" פג היום (${expiresAt.toLocaleDateString("he-IL")}).\nשילוח בקשות חדשות לקבלנים מוקפא עד לחידוש הרישוי.`;
                }
                if (triggerMilestone) {
                    logger.info(`Triggering RFQ license expiration milestone [${triggerMilestone}] for tenant ${tenantId} (${tenantName})`);
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
                        expireAt: firestore_1.Timestamp.fromDate(expireAt),
                        metadata: { tenantId, platform: "backend" },
                        appId: "tiktak"
                    });
                    const admins = await getAdminsWithPhones(db, tenantId, tenantData.parentEnterpriseId);
                    for (const admin of admins) {
                        await sendExpiryWhatsAppAlert(admin.phone, alertMessage);
                    }
                    logger.info(`Dispatched ${triggerMilestone} WhatsApp alert to ${admins.length} admins for tenant ${tenantId}`);
                }
            }
            catch (err) {
                logger.error(`Error processing RFQ expiration for tenant ${tenantId}`, err);
            }
        }
        logger.info("checkAnnualLicenseExpirations cron job finished successfully");
    }
    catch (error) {
        logger.error("checkAnnualLicenseExpirations cron job failed", error);
    }
});
//# sourceMappingURL=licenseExpiryCron.js.map