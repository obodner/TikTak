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
exports.submitSupportInquiry = exports.forwardTicketToVendor = exports.whatsappWebhook = exports.onTicketUpdate = exports.sendWhatsAppCommentNotification = exports.manageTenantUser = exports.getAudio = exports.getImage = exports.incrementMeToo = exports.addResidentComment = exports.getResidentTickets = exports.getTenantInfo = exports.landingMetrics = exports.submitAppFeedback = exports.createTicket = exports.checkAuth = exports.analyzeImage = exports.health = exports.slaCron = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const slaEngine_1 = require("./utils/slaEngine");
const i18n_1 = require("./utils/i18n");
const quotaEngine_1 = require("./utils/quotaEngine");
var slaCron_1 = require("./slaCron");
Object.defineProperty(exports, "slaCron", { enumerable: true, get: function () { return slaCron_1.slaCron; } });
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const crypto_1 = require("crypto");
(0, app_1.initializeApp)();
const db = (0, firestore_2.getFirestore)();
const storage = (0, storage_1.getStorage)();
async function recordAuditLog(params) {
    const { tenantId, action, level, actor, details } = params;
    const createdAt = new Date().toISOString();
    const expireAt = new Date();
    expireAt.setFullYear(expireAt.getFullYear() + 7);
    const logData = {
        tenantId,
        action,
        level,
        actor,
        details,
        metadata: {
            tenantId,
            platform: 'backend',
        },
        createdAt,
        expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        appId: 'tiktak',
    };
    const cleanData = JSON.parse(JSON.stringify(logData, (_, v) => v === undefined ? null : v));
    try {
        await db.collection("audit_logs").add(cleanData);
    }
    catch (err) {
        logger.error("Failed to write audit log", { error: err, logData: cleanData });
    }
}
async function sendQuotaWhatsAppAlertTemplate(params) {
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
    const dashboardLink = "https://tiktak2026.web.app/admin";
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
                        { type: "text", text: params.adminName || "מנהל" },
                        { type: "text", text: params.tenantName },
                        { type: "text", text: params.tier.toUpperCase() },
                        { type: "text", text: params.netUsed.toString() },
                        { type: "text", text: params.effectiveQuota.toString() },
                        { type: "text", text: dashboardLink },
                        { type: "text", text: tenantTypeLabel }
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
        const resData = await response.json();
        if (!response.ok) {
            logger.error(`Failed to send ${params.templateName} to ${cleanPhone}:`, resData);
        }
        else {
            logger.info(`Successfully sent ${params.templateName} to ${cleanPhone}`, { messageId: resData.messages?.[0]?.id });
        }
    }
    catch (err) {
        logger.error(`Error sending ${params.templateName} to ${cleanPhone}:`, err);
    }
}
async function checkAndDispatchQuotaAlerts(tenantId, tenantData) {
    try {
        const stats = (0, quotaEngine_1.getTenantQuotaStats)(tenantData);
        const sub = tenantData.subscription || {};
        const nowIso = new Date().toISOString();
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
    }
    catch (alertErr) {
        logger.error(`Error in checkAndDispatchQuotaAlerts for ${tenantId}`, alertErr);
    }
}
exports.health = (0, https_1.onRequest)({ cors: true }, (request, response) => {
    logger.info("Health check requested", { structuredData: true });
    response.send({ status: "ok", timestamp: new Date().toISOString() });
});
exports.analyzeImage = (0, https_1.onRequest)({ cors: true, secrets: ["GEMINI_API_KEY"] }, async (req, res) => {
    try {
        const { base64Image, mimeType, tenantId, location, subLocation } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        logger.info("analyzeImage started", {
            mimeType,
            imageSize: base64Image ? base64Image.length : 0,
            hasApiKey: !!apiKey
        });
        if (!apiKey) {
            logger.error("GEMINI_API_KEY secret is not set");
            res.status(500).send({ error: "API Key not configured" });
            return;
        }
        if (!base64Image) {
            logger.error("No image provided in request body");
            res.status(400).send({ error: "No image provided" });
            return;
        }
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imageId = (0, crypto_1.randomUUID)();
        const safeTenantId = tenantId || 'default-tenant';
        const bucket = storage.bucket();
        const file = bucket.file(`tenants/${safeTenantId}/${imageId}.jpg`);
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const uploadPromise = file.save(imageBuffer, {
            metadata: { contentType: mimeType || "image/jpeg" }
        });
        const tenantDoc = await db.collection("tenants").doc(safeTenantId).get();
        const tData = tenantDoc.data() || {};
        const lang = tData.language || 'he';
        const type = tData.type || 'building';
        const categories = (tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"]).join(", ");
        const langNote = lang === 'he'
            ? "Respond in Hebrew ONLY. Summarize as a short Hebrew sentence."
            : "Respond in English ONLY. Summarize as a short English sentence.";
        const entityContext = type === 'municipality'
            ? "a public space or city maintenance hazard (e.g. pothole, broken street light, waste)"
            : "a building maintenance issue (e.g. leak, broken bulb, elevator failure)";
        const prompt = `
      You are TikTak AI, an efficient and accurate maintenance assistant.
      Analyze the attached image of ${entityContext}.
      ${langNote}

      Return a JSON object only. Choose the most appropriate Hebrew category from the exact provided list: [${categories}].

      Include the following keys:
      1. 'is_valid_issue': Boolean (true/false). If the image is blank, chaotic, or clearly not a maintenance issue, set to false.
      2. 'summary': A concise summary (3-10 words) describing the primary problem in detail.
      3. 'category': One of [${categories}]. Choose the most appropriate Hebrew category name from this list.
      4. 'urgency': One of [High, Moderate, Low]. High means critical danger or failure.
      
      Respond ONLY with the RAW JSON object.
    `;
        logger.info("Sending request to Gemini...", { prompt, model: "gemini-2.5-flash" });
        let finalData = {};
        let isAiFallback = false;
        try {
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType || "image/jpeg",
                    },
                },
            ]);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
            finalData = JSON.parse(cleanJson || "{}");
        }
        catch (aiErr) {
            logger.warn("Gemini AI API call failed, falling back to manual ticket parameters", {
                message: aiErr.message,
                stack: aiErr.stack
            });
            isAiFallback = true;
            const categoriesList = tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"];
            const defaultCategory = categoriesList[0] || "תחזוקה";
            finalData = {
                is_valid_issue: true,
                summary: "",
                category: defaultCategory,
                urgency: "Low"
            };
        }
        await uploadPromise;
        finalData.imageId = imageId;
        if (isAiFallback) {
            finalData.ai_fallback = true;
        }
        if (!finalData.urgency && finalData.severity) {
            finalData.urgency = finalData.severity;
        }
        finalData.createdAt = new Date().toISOString();
        finalData.updatedAt = finalData.createdAt;
        finalData.status = 'open';
        finalData.location = location || null;
        finalData.subLocation = subLocation || null;
        logger.info("Final ticket payload prepared", {
            tenantId: safeTenantId,
            type,
            category: finalData.category,
            ai_fallback: isAiFallback
        });
        res.send(finalData);
    }
    catch (error) {
        logger.error("AI Analysis failed completely", {
            message: error.message,
            stack: error.stack,
            errorDetails: error
        });
        res.status(500).send({ error: "Failed to analyze image", details: error.message });
    }
});
exports.checkAuth = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, reporterPhone } = req.body;
        if (!tenantId || !reporterPhone) {
            res.status(400).send({ authorized: false, error: "Missing tenantId or reporterPhone" });
            return;
        }
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        const tenantType = tenantDoc.data()?.type || 'building';
        const contactTarget = tenantType === 'municipality' ? 'למוקד' : 'לוועד הבית';
        const { authorized } = await findAndValidateReporter(tenantId, reporterPhone);
        if (!authorized) {
            res.status(403).send({
                authorized: false,
                message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור.`
            });
            return;
        }
        res.status(200).send({ authorized: true });
    }
    catch (error) {
        logger.error("checkAuth failed", { message: error.message });
        res.status(500).send({ authorized: false, error: "Internal server error" });
    }
});
function sanitizeParam(str) {
    if (!str)
        return "";
    return str
        .replace(/[\r\n\t]+/g, " ")
        .replace(/ {2,}/g, " ")
        .trim();
}
async function sendWhatsAppNotification(params) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = "1046588828547584";
    if (!token) {
        logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager");
        return;
    }
    if (!params.admins || params.admins.length === 0) {
        logger.warn("No administrators configured for this tenant, skipping WhatsApp notifications.");
        return;
    }
    let locationLabel = "רחוב";
    let subLocationLabel = "אזור";
    if (params.tenantId) {
        try {
            const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
            const uiConfig = tenantDoc.data()?.uiConfig || {};
            if (uiConfig.locationLabel)
                locationLabel = uiConfig.locationLabel;
            if (uiConfig.subLocationLabel)
                subLocationLabel = uiConfig.subLocationLabel;
        }
        catch (err) {
            logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
        }
    }
    let formattedLocation = "";
    const locationParts = [];
    if (params.subLocation) {
        locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
    }
    if (params.location) {
        locationParts.push(`*${locationLabel}*: ${params.location}`);
    }
    if (locationParts.length > 0) {
        formattedLocation = locationParts.join(" • ");
    }
    else {
        formattedLocation = "לא צוין מיקום";
    }
    let severityHebrew = "בינונית ⚠️";
    const lowerUrgency = (params.urgency || "").toLowerCase();
    if (lowerUrgency === "high") {
        severityHebrew = "גבוהה 🚨";
    }
    else if (lowerUrgency === "low") {
        severityHebrew = "נמוכה";
    }
    else if (lowerUrgency === "moderate" || lowerUrgency === "medium") {
        severityHebrew = "בינונית ⚠️";
    }
    const hasImage = !!params.imageId;
    const hasAudio = !!params.audioId;
    let templateName = "resident_submit_ticket_no_media";
    const buttonComponents = [];
    if (hasImage && hasAudio) {
        templateName = "resident_submit_ticket_all_media";
        buttonComponents.push({
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: `${params.tenantId}/${params.imageId}.jpg` }]
        });
        buttonComponents.push({
            type: "button",
            sub_type: "url",
            index: "1",
            parameters: [{ type: "text", text: `${params.tenantId}/${params.audioId}.webm` }]
        });
    }
    else if (hasImage) {
        templateName = "resident_submit_ticket_image";
        buttonComponents.push({
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: `${params.tenantId}/${params.imageId}.jpg` }]
        });
    }
    else if (hasAudio) {
        templateName = "resident_submit_ticket_audio";
        buttonComponents.push({
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: `${params.tenantId}/${params.audioId}.webm` }]
        });
    }
    for (const admin of params.admins) {
        try {
            let cleanPhone = admin.phone.replace(/\D/g, "");
            if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
                cleanPhone = "972" + cleanPhone.substring(1);
            }
            const components = [
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
            const resData = await response.json();
            if (!response.ok) {
                logger.error(`Meta API returned error for admin ${admin.name}:`, resData);
            }
            else {
                logger.info(`WhatsApp alert successfully sent to admin ${admin.name}`, { messageId: resData.messages?.[0]?.id });
            }
        }
        catch (err) {
            logger.error(`Exception while sending WhatsApp alert to admin ${admin.name}:`, err);
        }
    }
}
function translateClosureReason(reason) {
    const mapping = {
        'fixed': 'טופל',
        'duplicate': 'כפילות',
        'irrelevant': 'לא רלוונטי',
        'vendor': 'בטיפול ספק',
        'outside': 'מחוץ לאחריות',
        'rejected': 'נדחה'
    };
    return mapping[reason] || reason || 'טופל';
}
async function sendResidentWhatsAppNotification(params) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = "1046588828547584";
    if (!token) {
        logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager, skipping resident notification.");
        return;
    }
    if (!params.phone) {
        logger.warn("No phone number provided for resident notification, skipping.");
        return;
    }
    let cleanPhone = params.phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
        cleanPhone = "972" + cleanPhone.substring(1);
    }
    let locationLabel = "רחוב";
    let subLocationLabel = "אזור";
    let tenantName = "ועד הבית";
    if (params.tenantId) {
        try {
            const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
            const tenantData = tenantDoc.data() || {};
            if (tenantData.name)
                tenantName = tenantData.name;
            const uiConfig = tenantData.uiConfig || {};
            if (uiConfig.locationLabel)
                locationLabel = uiConfig.locationLabel;
            if (uiConfig.subLocationLabel)
                subLocationLabel = uiConfig.subLocationLabel;
        }
        catch (err) {
            logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
        }
    }
    let formattedLocation = "";
    const locationParts = [];
    if (params.subLocation) {
        locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
    }
    if (params.location) {
        locationParts.push(`*${locationLabel}*: ${params.location}`);
    }
    if (locationParts.length > 0) {
        formattedLocation = locationParts.join(" • ");
    }
    else {
        formattedLocation = "לא צוין מיקום";
    }
    const parameters = [
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
        const resData = await response.json();
        if (!response.ok) {
            logger.error(`Meta API returned error for resident ${cleanPhone}:`, resData);
        }
        else {
            logger.info(`WhatsApp alert successfully sent to resident ${cleanPhone}`, { messageId: resData.messages?.[0]?.id });
        }
    }
    catch (err) {
        logger.error(`Exception while sending WhatsApp resident alert to ${cleanPhone}:`, err);
    }
}
function detectAudioMimeType(buffer) {
    if (buffer.length > 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return 'audio/webm';
    }
    if (buffer.length > 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
        return 'audio/mp4';
    }
    if (buffer.length > 2 && buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) {
        return 'audio/aac';
    }
    if (buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
        return 'audio/ogg';
    }
    if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
        return 'audio/wav';
    }
    return 'audio/webm';
}
exports.createTicket = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    try {
        const { tenantId, imageId, base64Image, mimeType, summary, category, urgency, location, subLocation, ticketType, reporterPhone, source } = req.body;
        if (!tenantId) {
            res.status(400).send({ error: "Missing tenantId" });
            return;
        }
        if (!reporterPhone) {
            res.status(400).send({ error: "Missing reporter phone number" });
            return;
        }
        const isRealImage = imageId && typeof imageId === 'string' && !imageId.startsWith('hidden-');
        let finalImageId = isRealImage ? imageId : null;
        if (!finalImageId && base64Image) {
            try {
                const fallbackImageId = (0, crypto_1.randomUUID)();
                const safeTenantId = tenantId || 'default-tenant';
                const bucket = storage.bucket();
                const file = bucket.file(`tenants/${safeTenantId}/${fallbackImageId}.jpg`);
                const imageBuffer = Buffer.from(base64Image, 'base64');
                await file.save(imageBuffer, {
                    metadata: { contentType: mimeType || 'image/jpeg' }
                });
                finalImageId = fallbackImageId;
            }
            catch (uploadErr) {
                logger.error("Failed to upload fallback base64Image in createTicket", { uploadErr });
            }
        }
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantDoc.data() || {};
        const tenantType = tenantData.type || 'building';
        const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';
        if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen' || tenantData.subscription?.status === 'cancelled') {
            res.status(403).send({
                error: "Account Frozen",
                message: `חשבון ${contactTarget} מוקפא זמנית. אנא פנה ל${contactTarget} או לשירות לקוחות TikTak להפעלת החשבון.`
            });
            return;
        }
        const { authorized, reporterName, cleanPhone } = await findAndValidateReporter(tenantId, reporterPhone);
        if (!authorized) {
            res.status(403).send({
                error: "Unauthorized",
                message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
            });
            return;
        }
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const recentTickets = await db.collection("tenants")
            .doc(tenantId)
            .collection("tickets")
            .where("createdAt", ">", oneMinuteAgo)
            .get();
        if (recentTickets.size >= 3) {
            res.status(429).send({
                error: "Rate limit exceeded",
                message: "Max 3 reports per minute per tenant."
            });
            return;
        }
        const tenantRef = db.collection("tenants").doc(tenantId);
        const ticketsCol = db.collection("tenants").doc(tenantId).collection("tickets");
        const ticketRef = ticketsCol.doc((0, crypto_1.randomUUID)());
        const ticketId = ticketRef.id;
        let ticketNumber = 0;
        try {
            ticketNumber = await db.runTransaction(async (transaction) => {
                const tenantSnap = await transaction.get(tenantRef);
                const tenantData = tenantSnap.data() || {};
                const currentCount = tenantData.lastTicketNumber || 0;
                const nextNumber = currentCount + 1;
                transaction.update(tenantRef, { lastTicketNumber: nextNumber });
                const ticketData = {
                    summary,
                    category,
                    urgency,
                    location: location || null,
                    subLocation: subLocation || null,
                    ticketType: ticketType || 'visible',
                    source: source === 'whatsapp' ? 'whatsapp' : 'web',
                    reportingMethod: source === 'whatsapp'
                        ? (req.body.reportingMethod || 'manual')
                        : (source || (isRealImage ? 'ai_camera' : 'manual')),
                    imageId: finalImageId,
                    audioId: req.body.audioBase64 ? ticketId : null,
                    reporterPhone: cleanPhone || reporterPhone || null,
                    reporterName: reporterName || null,
                    status: 'open',
                    ticketNumber: nextNumber,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastStatusChangeAt: new Date().toISOString(),
                    total_days_in_new: 0,
                    total_days_in_progress: 0,
                    stagnationDays: 0,
                    slaStatus: 'none',
                    adminComments: []
                };
                transaction.set(ticketRef, ticketData);
                return nextNumber;
            });
            try {
                await db.collection("global_stats").doc("counters").set({
                    totalTicketsCount: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
            }
            catch (err) {
                logger.error("Failed to increment global tickets counter", { error: err.message });
            }
            try {
                await db.collection("tenants").doc(tenantId).set({
                    subscription: {
                        currentCycleTicketCount: admin.firestore.FieldValue.increment(1)
                    }
                }, { merge: true });
                const freshTenantSnap = await db.collection("tenants").doc(tenantId).get();
                if (freshTenantSnap.exists) {
                    await checkAndDispatchQuotaAlerts(tenantId, freshTenantSnap.data());
                }
            }
            catch (subErr) {
                logger.error("Failed to increment tenant subscription ticket counter in createTicket", { tenantId, error: subErr.message });
            }
            if (req.body.audioBase64) {
                const bucket = admin.storage().bucket();
                const audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
                const mimeType = detectAudioMimeType(audioBuffer);
                const extMap = {
                    'audio/mp4': 'mp4',
                    'audio/aac': 'aac',
                    'audio/ogg': 'ogg',
                    'audio/wav': 'wav',
                    'audio/webm': 'webm'
                };
                const ext = extMap[mimeType] || 'mp4';
                logger.info(`Processing audio for ${tenantId}. Buffer size: ${audioBuffer.length} bytes, detected MIME: ${mimeType}, ext: .${ext}`);
                const audioFile = bucket.file(`tenants/${tenantId}/${ticketId}.${ext}`);
                await audioFile.save(audioBuffer, {
                    metadata: { contentType: mimeType }
                });
                logger.info("Audio note uploaded successfully", { tenantId, ticketId });
            }
            await recordAuditLog({
                tenantId,
                action: 'TICKET_CREATED',
                level: 'INFO',
                actor: {
                    uid: cleanPhone || reporterPhone,
                    name: reporterName || cleanPhone || reporterPhone,
                    type: 'resident'
                },
                details: {
                    ticketId: isRealImage ? imageId : ticketId,
                    ticketNumber,
                    summary,
                    category,
                    urgency,
                    location: location || null,
                    subLocation: subLocation || null,
                    source: source === 'whatsapp' ? 'whatsapp' : 'web',
                    hasImage: isRealImage,
                    hasAudio: !!req.body.audioBase64
                }
            });
            const adminUsersSnap = await tenantRef.collection("adminUsers").get();
            const admins = [];
            adminUsersSnap.forEach((userDoc) => {
                const data = userDoc.data();
                if (data && data.mobile && data.mobile.trim()) {
                    admins.push({
                        name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
                        phone: data.mobile.trim(),
                    });
                }
            });
            const tenantName = tenantDoc.data()?.name || tenantId;
            await sendWhatsAppNotification({
                tenantId,
                tenantName,
                ticketNumber,
                category,
                summary,
                location,
                subLocation,
                urgency,
                reporterName: reporterName || null,
                imageId: finalImageId,
                audioId: req.body.audioBase64 ? ticketId : null,
                admins
            });
            if (reporterPhone) {
                await sendResidentWhatsAppNotification({
                    phone: cleanPhone || reporterPhone,
                    templateName: "new_ticket_confirmation",
                    ticketNumber,
                    category,
                    location,
                    subLocation,
                    tenantId
                });
            }
            res.status(200).send({
                success: true,
                ticketId: ticketId,
                audioId: req.body.audioBase64 ? ticketId : null,
                ticketNumber,
                reporterName: reporterName || cleanPhone || reporterPhone
            });
        }
        catch (txError) {
            logger.error("Transaction failed", { error: txError.message });
            res.status(500).send({ error: "Failed to create ticket", details: txError.message });
        }
    }
    catch (error) {
        logger.error("createTicket failed", { error, body: req.body });
        if (req.body.tenantId && req.body.reporterPhone) {
            await recordAuditLog({
                tenantId: req.body.tenantId,
                action: 'TICKET_CREATED',
                level: 'ERROR',
                actor: {
                    uid: req.body.reporterPhone,
                    name: 'Resident',
                    type: 'resident'
                },
                details: {
                    error: error.message,
                    category: req.body.category,
                    location: req.body.location,
                    subLocation: req.body.subLocation,
                    source: req.body.source === 'whatsapp' ? 'whatsapp' : 'web'
                }
            });
        }
        res.status(500).send({ error: "Failed to save ticket" });
    }
});
exports.submitAppFeedback = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, ticketId, rating } = req.body;
        if (!tenantId || !ticketId || typeof rating !== 'number') {
            res.status(400).send({ error: "Missing tenantId, ticketId, or valid rating" });
            return;
        }
        if (rating < 1 || rating > 5) {
            res.status(400).send({ error: "Rating must be between 1 and 5" });
            return;
        }
        const ticketRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
        const docSnap = await ticketRef.get();
        if (!docSnap.exists) {
            res.status(404).send({ error: "Ticket not found" });
            return;
        }
        await ticketRef.update({
            appRating: rating,
            updatedAt: new Date().toISOString()
        });
        try {
            await db.collection("global_stats").doc("counters").set({
                ratingSum: admin.firestore.FieldValue.increment(rating),
                ratingCount: admin.firestore.FieldValue.increment(1),
                [`ratingCount_${rating}`]: admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        }
        catch (err) {
            logger.error("Failed to update global stats rating", { error: err.message });
        }
        const ticketData = docSnap.data();
        await recordAuditLog({
            tenantId,
            action: 'APP_FEEDBACK_SUBMITTED',
            level: 'INFO',
            actor: {
                uid: ticketData?.reporterPhone || 'anonymous',
                name: ticketData?.reporterName || 'Resident',
                type: 'resident'
            },
            details: {
                ticketId,
                ticketNumber: ticketData?.ticketNumber,
                rating
            }
        });
        res.status(200).send({ success: true });
    }
    catch (error) {
        logger.error("submitAppFeedback failed", { error: error.message });
        res.status(500).send({ error: "Failed to submit feedback" });
    }
});
exports.landingMetrics = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const statsDoc = await db.collection("global_stats").doc("counters").get();
        if (!statsDoc.exists) {
            res.status(200).send({
                totalTickets: 125,
                satisfactionRate: 98
            });
            return;
        }
        const data = statsDoc.data() || {};
        const totalTicketsCount = data.totalTicketsCount || 0;
        const ratingSum = data.ratingSum || 0;
        const ratingCount = data.ratingCount || 0;
        let satisfactionRate = 98;
        if (ratingCount > 0) {
            satisfactionRate = Math.round((ratingSum / (ratingCount * 5)) * 100);
        }
        res.status(200).send({
            totalTickets: totalTicketsCount,
            satisfactionRate
        });
    }
    catch (error) {
        logger.error("landingMetrics failed", { error: error.message });
        res.status(500).send({ error: "Failed to load landing metrics" });
    }
});
exports.getTenantInfo = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    const { tenantId } = req.query;
    if (!tenantId) {
        res.status(400).send({ error: "Missing tenantId" });
        return;
    }
    try {
        const tenantRef = db.collection("tenants").doc(tenantId);
        const doc = await tenantRef.get();
        if (!doc.exists) {
            res.status(404).send({ error: "Tenant not found" });
            return;
        }
        const tData = doc.data();
        const adminUsersSnap = await tenantRef.collection("adminUsers").get();
        const admins = [];
        adminUsersSnap.forEach((userDoc) => {
            const data = userDoc.data();
            if (data && data.mobile && data.mobile.trim()) {
                admins.push({
                    name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
                    phone: data.mobile.trim(),
                });
            }
        });
        logger.info("Returning tenant info with admins", {
            tenantId,
            hasQuickTap: !!tData?.quickTap,
            quickTapEnabled: tData?.quickTap?.enabled,
            adminCount: admins.length
        });
        res.send({
            ...tData,
            admins
        });
    }
    catch (error) {
        logger.error("Database error in getTenantInfo", { error });
        res.status(500).send({ error: "Database error" });
    }
});
exports.getResidentTickets = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, reporterPhone } = req.body;
        if (!tenantId) {
            res.status(400).send({ error: "Missing tenantId" });
            return;
        }
        if (!reporterPhone) {
            res.status(401).send({ error: "Missing reporterPhone" });
            return;
        }
        const { authorized, cleanPhone } = await findAndValidateReporter(tenantId, reporterPhone);
        if (!authorized) {
            const tenantDoc = await db.collection("tenants").doc(tenantId).get();
            const tenantType = tenantDoc.data()?.type || 'building';
            const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';
            res.status(403).send({
                error: "Unauthorized",
                message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
            });
            return;
        }
        const allTicketsSnap = await db.collection("tenants")
            .doc(tenantId)
            .collection("tickets")
            .get();
        const allTickets = allTicketsSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ticketNumber: data.ticketNumber,
                createdAt: data.createdAt,
                summary: data.summary,
                category: data.category,
                urgency: data.urgency,
                location: data.location,
                subLocation: data.subLocation,
                status: data.status,
                imageId: data.imageId,
                audioId: data.audioId,
                meToo: data.meToo || 0,
                timeline: data.timeline || [],
                reporterPhone: data.reporterPhone,
                meTooReporters: data.meTooReporters || []
            };
        });
        let myTickets = [];
        if (reporterPhone) {
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const twelveMonthsAgoStr = twelveMonthsAgo.toISOString();
            myTickets = allTickets
                .filter(t => t.reporterPhone === reporterPhone && t.createdAt >= twelveMonthsAgoStr)
                .map(t => {
                const { reporterPhone: _, meTooReporters: __, ...rest } = t;
                return rest;
            });
            myTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        const openTickets = allTickets
            .filter(t => ['open', 'in-progress'].includes(t.status))
            .map(t => {
            const isMyTicket = !!(reporterPhone && t.reporterPhone === reporterPhone);
            const meTooReporters = t.meTooReporters || [];
            const hasVotedMeToo = !!(reporterPhone && meTooReporters.some((r) => r.phone === cleanPhone || r.phone === reporterPhone));
            const { reporterPhone: _, meTooReporters: __, ...rest } = t;
            return {
                ...rest,
                isMyTicket,
                hasVotedMeToo
            };
        });
        openTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        res.status(200).send({ myTickets, openTickets });
    }
    catch (error) {
        logger.error("getResidentTickets failed", { error: error.message });
        res.status(500).send({ error: "Failed to load resident tickets" });
    }
});
exports.addResidentComment = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, ticketId, commentText, reporterPhone } = req.body;
        if (!tenantId || !ticketId || !commentText) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        if (!reporterPhone) {
            res.status(400).send({ error: "Missing reporterPhone" });
            return;
        }
        const { authorized: commentAuth, reporterName: rName, cleanPhone: cPhone } = await findAndValidateReporter(tenantId, reporterPhone);
        if (!commentAuth) {
            res.status(403).send({ error: "Unauthorized" });
            return;
        }
        const ticketRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (!ticketSnap.exists) {
            res.status(404).send({ error: "Ticket not found" });
            return;
        }
        const ticketData = ticketSnap.data() || {};
        const ticketNumber = ticketData.ticketNumber || 0;
        const reporterName = rName || "תושב";
        const commentObj = {
            text: commentText,
            createdAt: new Date().toISOString(),
            author: "תושב"
        };
        const adminCommentObj = {
            id: (0, crypto_1.randomUUID)(),
            text: commentText,
            createdAt: new Date().toISOString(),
            authorName: reporterName
        };
        await ticketRef.update({
            timeline: admin.firestore.FieldValue.arrayUnion(commentObj),
            adminComments: admin.firestore.FieldValue.arrayUnion(adminCommentObj),
            updatedAt: new Date().toISOString()
        });
        const auditMsg = `Resident added comment to ticket #${ticketNumber} in building ${tenantId}`;
        await recordAuditLog({
            tenantId,
            action: 'RESIDENT_COMMENT_ADDED',
            level: 'INFO',
            actor: {
                uid: cPhone || reporterPhone,
                name: reporterName || cPhone || reporterPhone,
                type: 'resident'
            },
            details: {
                ticketId,
                ticketNumber,
                comment: commentText,
                message: auditMsg
            }
        });
        res.status(200).send({ success: true, comment: commentObj });
    }
    catch (error) {
        logger.error("addResidentComment failed", { error: error.message });
        res.status(500).send({ error: "Failed to add comment" });
    }
});
exports.incrementMeToo = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, ticketId, reporterPhone } = req.body;
        if (!tenantId || !ticketId || !reporterPhone) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const { authorized: meTooAuth, reporterName: meTooReporterName, cleanPhone: meTooCleanPhone } = await findAndValidateReporter(tenantId, reporterPhone);
        if (!meTooAuth) {
            res.status(403).send({ error: "Unauthorized" });
            return;
        }
        const ticketRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (!ticketSnap.exists) {
            res.status(404).send({ error: "Ticket not found" });
            return;
        }
        const ticketData = ticketSnap.data() || {};
        const ticketNumber = ticketData.ticketNumber || 0;
        const effectivePhone = meTooCleanPhone || reporterPhone;
        if (ticketData.reporterPhone === effectivePhone) {
            res.status(400).send({ error: "Cannot vote for your own ticket" });
            return;
        }
        const { action } = req.body;
        const meTooReporters = ticketData.meTooReporters || [];
        const alreadyVoted = meTooReporters.some((r) => r.phone === effectivePhone);
        const shouldRemove = action === 'remove' || (action !== 'add' && alreadyVoted);
        if (shouldRemove) {
            if (!alreadyVoted) {
                res.status(400).send({ error: "You have not added yourself to this ticket" });
                return;
            }
            const updatedReporters = meTooReporters.filter((r) => r.phone !== effectivePhone);
            const newCount = Math.max(0, (ticketData.meToo || 1) - 1);
            await ticketRef.update({
                meToo: newCount,
                meTooReporters: updatedReporters,
                updatedAt: new Date().toISOString()
            });
            const auditMsg = `Resident removed Me Too on ticket #${ticketNumber} in building ${tenantId}`;
            await recordAuditLog({
                tenantId,
                action: 'RESIDENT_METOO_REMOVED',
                level: 'INFO',
                actor: {
                    uid: effectivePhone,
                    name: meTooReporterName || effectivePhone,
                    type: 'resident'
                },
                details: {
                    ticketId,
                    ticketNumber,
                    message: auditMsg
                }
            });
            res.status(200).send({ success: true, action: 'removed', isMeToo: false, meToo: newCount });
            return;
        }
        if (alreadyVoted) {
            res.status(200).send({ success: true, action: 'already_added', isMeToo: true, meToo: ticketData.meToo || 1 });
            return;
        }
        const reporterName = meTooReporterName || "תושב";
        const newVoter = {
            name: reporterName,
            phone: effectivePhone,
            votedAt: new Date().toISOString()
        };
        const newCount = (ticketData.meToo || 0) + 1;
        const updatedReporters = [...meTooReporters, newVoter];
        await ticketRef.update({
            meToo: newCount,
            meTooReporters: updatedReporters,
            updatedAt: new Date().toISOString()
        });
        const auditMsg = `Resident clicked Me Too on ticket #${ticketNumber} in building ${tenantId}`;
        await recordAuditLog({
            tenantId,
            action: 'RESIDENT_METOO_INCREMENTED',
            level: 'INFO',
            actor: {
                uid: effectivePhone,
                name: reporterName || effectivePhone,
                type: 'resident'
            },
            details: {
                ticketId,
                ticketNumber,
                message: auditMsg
            }
        });
        res.status(200).send({ success: true, action: 'added', isMeToo: true, meToo: newCount });
    }
    catch (error) {
        logger.error("incrementMeToo failed", { error: error.message });
        res.status(500).send({ error: "Failed to update Me Too counter" });
    }
});
exports.getImage = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    let tenantId = "";
    let imageId = "";
    const queryPath = req.query.path;
    if (queryPath) {
        const parts = queryPath.split('/');
        tenantId = parts[0];
        imageId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
    }
    else {
        const pathSegments = req.path.split('/').filter(p => p && p !== 'img');
        tenantId = pathSegments[0];
        imageId = pathSegments[1];
    }
    if (!tenantId || !imageId || imageId === 'view') {
        res.status(400).send("Invalid image path format");
        return;
    }
    try {
        const bucket = storage.bucket();
        const file = bucket.file(`tenants/${tenantId}/${imageId}.jpg`);
        const [exists] = await file.exists();
        if (!exists) {
            res.status(404).send("Image not found");
            return;
        }
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '01-01-2100'
        });
        res.redirect(302, url);
    }
    catch (err) {
        res.status(500).send("Server error generating image link");
    }
});
exports.getAudio = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    let tenantId = "";
    let audioId = "";
    const queryPath = req.query.path;
    if (queryPath) {
        const parts = queryPath.split('/');
        tenantId = parts[0];
        audioId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
    }
    else {
        const pathSegments = req.path.split('/').filter(p => p && p !== 'aud');
        tenantId = pathSegments[0];
        audioId = pathSegments[1] ? pathSegments[1].replace(/\.[^/.]+$/, "") : "";
    }
    if (!tenantId || !audioId || audioId === 'view') {
        res.status(400).send("Invalid audio path format");
        return;
    }
    try {
        const bucket = admin.storage().bucket();
        const possibleExts = ['.mp4', '.m4a', '.aac', '.ogg', '.webm', ''];
        let file = null;
        let exists = false;
        for (const ext of possibleExts) {
            file = bucket.file(`tenants/${tenantId}/${audioId}${ext}`);
            [exists] = await file.exists();
            if (exists)
                break;
        }
        if (!exists) {
            res.status(404).send("Audio not found");
            return;
        }
        const extMatch = file.name.match(/\.([a-z0-9]+)$/i);
        const fileExt = extMatch ? extMatch[1].toLowerCase() : 'mp4';
        const mimeMap = {
            'mp4': 'audio/mp4',
            'm4a': 'audio/mp4',
            'aac': 'audio/aac',
            'ogg': 'audio/ogg',
            'webm': 'audio/webm'
        };
        const responseContentType = mimeMap[fileExt] || 'audio/mp4';
        const [buffer] = await file.download();
        res.status(200).set({
            'Content-Type': responseContentType,
            'Content-Length': String(buffer.length),
            'Content-Disposition': `inline; filename="${audioId}.${fileExt}"`,
            'Cache-Control': 'public, max-age=31536000'
        }).send(buffer);
    }
    catch (err) {
        res.status(500).send("Server error generating audio link");
    }
});
exports.manageTenantUser = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { action, tenantId, userData, callerUid } = req.body;
        if (!tenantId || !action) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const auth = admin.auth();
        const tenantRef = db.collection("tenants").doc(tenantId);
        const tenantDoc = await tenantRef.get();
        if (!tenantDoc.exists) {
            res.status(404).send({ error: "Tenant not found" });
            return;
        }
        const tData = tenantDoc.data() || {};
        const adminUids = tData.adminUids || [];
        let isAuthorized = adminUids.includes(callerUid);
        if (!isAuthorized && callerUid) {
            try {
                const callerUser = await auth.getUser(callerUid);
                if (callerUser.customClaims?.role === 'super') {
                    isAuthorized = true;
                }
            }
            catch (e) {
                console.error("Auth check failed for caller:", callerUid, e);
            }
        }
        if (!isAuthorized) {
            res.status(403).send({ error: "Unauthorized: Caller must be a tenant admin or super admin" });
            return;
        }
        switch (action) {
            case 'create': {
                const { email, password, firstName, lastName, mobile } = userData;
                if (!email || !firstName || !lastName)
                    throw new Error("Missing mandatory fields");
                if (firstName.length > 20 || lastName.length > 20)
                    throw new Error("Names must be 20 characters or less");
                if (!email.includes('@'))
                    throw new Error("Invalid email format");
                const existingUsersSnapshot = await tenantRef.collection("adminUsers").get();
                if (existingUsersSnapshot.size >= 5) {
                    throw new Error("Maximum of 5 users reached for this tenant");
                }
                let uid;
                try {
                    const existingUser = await auth.getUserByEmail(email);
                    uid = existingUser.uid;
                    logger.info("Using existing user for new tenant association", { email, uid, tenantId });
                }
                catch (e) {
                    if (e.code === 'auth/user-not-found') {
                        const userRecord = await auth.createUser({
                            email,
                            password: password || Math.random().toString(36).slice(-8),
                            displayName: `${firstName} ${lastName}`
                        });
                        uid = userRecord.uid;
                        logger.info("Created new user for tenant association", { email, uid, tenantId });
                    }
                    else {
                        throw e;
                    }
                }
                await tenantRef.collection("adminUsers").doc(uid).set({
                    firstName,
                    lastName,
                    email,
                    mobile: mobile || "",
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });
                await tenantRef.update({
                    adminUids: admin.firestore.FieldValue.arrayUnion(uid)
                });
                res.status(200).send({ success: true, uid });
                break;
            }
            case 'delete': {
                const { uid } = userData;
                if (!uid)
                    throw new Error("Missing uid for deletion");
                if (adminUids.length <= 1) {
                    throw new Error("Cannot delete the last administrator");
                }
                await tenantRef.collection("adminUsers").doc(uid).delete();
                await tenantRef.update({
                    adminUids: admin.firestore.FieldValue.arrayRemove(uid)
                });
                res.status(200).send({ success: true });
                break;
            }
            case 'resetPassword': {
                const { email } = userData;
                if (!email)
                    throw new Error("Missing email for reset");
                const link = await auth.generatePasswordResetLink(email);
                res.status(200).send({ success: true, link });
                break;
            }
            case 'update': {
                const { uid, firstName, lastName, mobile } = userData;
                if (!uid)
                    throw new Error("Missing uid for update");
                await tenantRef.collection("adminUsers").doc(uid).update({
                    firstName: firstName || "",
                    lastName: lastName || "",
                    mobile: mobile || "",
                    updatedAt: new Date().toISOString()
                });
                res.status(200).send({ success: true });
                break;
            }
            default:
                res.status(400).send({ error: "Unknown action" });
        }
    }
    catch (err) {
        logger.error("User Management failed", { message: err.message });
        res.status(500).send({ error: err.message });
    }
});
exports.sendWhatsAppCommentNotification = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    try {
        const { tenantId, ticketId, commentId, commentText, actorName } = req.body;
        if (!tenantId || !ticketId || !commentId || !commentText) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        if (!token) {
            res.status(500).send({ error: "WhatsApp access token not configured" });
            return;
        }
        const ticketRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (!ticketSnap.exists) {
            res.status(404).send({ error: "Ticket not found" });
            return;
        }
        const ticketData = ticketSnap.data() || {};
        const phoneNumberId = ticketData.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
        const rawPhone = ticketData.reporterPhone || ticketData.reporterPhoneE164 || ticketData.from;
        if (!rawPhone) {
            res.status(400).send({ error: "פנייה זו לא נפתחה דרך וואטסאפ ולא קיים מספר טלפון למדווח." });
            return;
        }
        let recipientPhone = String(rawPhone).replace(/\D/g, "");
        if (recipientPhone.startsWith("0")) {
            recipientPhone = "972" + recipientPhone.substring(1);
        }
        const parseTimestampMillis = (val) => {
            if (!val)
                return 0;
            if (typeof val === 'number')
                return val;
            if (typeof val === 'string') {
                const parsed = Date.parse(val);
                return isNaN(parsed) ? 0 : parsed;
            }
            if (typeof val === 'object') {
                if (typeof val.toMillis === 'function')
                    return val.toMillis();
                if (typeof val.toDate === 'function')
                    return val.toDate().getTime();
                if (typeof val.seconds === 'number')
                    return val.seconds * 1000;
                if (typeof val._seconds === 'number')
                    return val._seconds * 1000;
            }
            return 0;
        };
        const ticketNumber = ticketData.ticketNumber || "";
        const reporterName = ticketData.reporterName || ticketData.name || ticketData.reporter || "תושב/דייר";
        const lastUserMessageTime = parseTimestampMillis(ticketData.lastUserMessageAt);
        const isWhatsAppSource = ticketData.source === 'whatsapp' || !!ticketData.lastUserMessageAt;
        const isWithin24h = isWhatsAppSource && lastUserMessageTime > 0 && (Date.now() - lastUserMessageTime) < 24 * 60 * 60 * 1000;
        let sentViaTemplate = false;
        const formattedFallbackText = `שלום ${reporterName},\nנשלח עבורך עדכון חדש במערכת לגבי פנייה מספר #${ticketNumber}:\n\n${commentText}\n\nתודה על שיתוף הפעולה!\n\n_*שימו לב: זוהי הודעה אוטומטית ממערכת TikTak ואין להשיב עליה (תגובות אינן מגיעות למזכירות).*_`;
        if (isWithin24h) {
            await sendWhatsAppText(recipientPhone, formattedFallbackText, phoneNumberId, token);
        }
        else {
            const cleanCommentForTemplate = commentText.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            sentViaTemplate = true;
            try {
                await sendWhatsAppTemplate(recipientPhone, "ticket_status_update", "he", [reporterName, String(ticketNumber), cleanCommentForTemplate], phoneNumberId, token);
            }
            catch (templateErr) {
                logger.error(`Template ticket_status_update failed for ticket #${ticketNumber}:`, templateErr);
                res.status(400).send({
                    error: `שליחת הודעת וואטסאפ נכשלה (חלון 24 שעות סגור והתבנית ב-Meta עדיין לא פעילה או נדחתה). שגיאה: ${templateErr.message || 'Template error'}`
                });
                return;
            }
        }
        const existingComments = ticketData.adminComments || [];
        let commentFound = false;
        const updatedComments = existingComments.map((c) => {
            if (c.id === commentId) {
                commentFound = true;
                return {
                    ...c,
                    sentToWhatsApp: true,
                    sentToWhatsAppAt: new Date().toISOString(),
                    sentViaTemplate
                };
            }
            return c;
        });
        if (!commentFound) {
            updatedComments.push({
                id: commentId,
                text: commentText,
                createdAt: new Date().toISOString(),
                authorName: actorName || "מנהל",
                sentToWhatsApp: true,
                sentToWhatsAppAt: new Date().toISOString(),
                sentViaTemplate
            });
        }
        await ticketRef.update({
            adminComments: updatedComments
        });
        res.status(200).send({
            success: true,
            sentViaTemplate,
            sentToWhatsAppAt: new Date().toISOString()
        });
    }
    catch (err) {
        logger.error("Error sending WhatsApp comment notification:", err);
        res.status(500).send({ error: err.message || "Failed to send WhatsApp update" });
    }
});
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
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantDoc.data();
        if (!tenantData)
            return;
        const country = tenantData.country || "IL";
        const slaConfig = tenantData.slaConfig || { enabled: true, workingDays: [0, 1, 2, 3, 4] };
        const holidaysDoc = await db.collection("holidays").doc(country).get();
        const holidays = (holidaysDoc.data()?.holidays || []).map((h) => h.date);
        const update = {
            lastStatusChangeAt: now.toISOString(),
            updatedAt: now.toISOString(),
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
        if (newStatus === 'open') {
            update.total_days_in_new = 0;
            update.total_days_in_progress = 0;
            update.slaStatus = 'none';
            update.stagnationDays = 0;
            update.vaadRating = admin.firestore.FieldValue.delete();
        }
        else if (newStatus === 'in-progress' && (oldStatus === 'resolved' || oldStatus === 'dismissed')) {
            update.total_days_in_progress = 0;
            update.slaStatus = 'none';
            update.stagnationDays = 0;
            update.vaadRating = admin.firestore.FieldValue.delete();
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
            }
            catch (exErr) {
                logger.error("Failed to increment currentCycleExclusions", exErr);
            }
        }
        else if (!isExclusionNow && wasExclusionBefore) {
            try {
                await db.collection("tenants").doc(tenantId).set({
                    subscription: {
                        currentCycleExclusions: admin.firestore.FieldValue.increment(-1)
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
                await sendResidentWhatsAppNotification({
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
                await sendResidentWhatsAppNotification({
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
    }
    catch (err) {
        logger.error("Error in onTicketUpdate trigger", { error: err, tenantId, ticketId });
    }
});
function normalizePhoneNumber(rawPhone) {
    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (clean.startsWith('972') && clean.length === 12) {
        clean = '0' + clean.substring(3);
    }
    if (!/^0[0-9]{8,9}$/.test(clean)) {
        throw new Error("Invalid phone number format");
    }
    return clean;
}
async function findAndValidateReporter(tenantId, rawPhone) {
    if (!rawPhone || !tenantId) {
        return { authorized: false, reporterName: null, cleanPhone: "" };
    }
    let cleanPhone = rawPhone.trim();
    try {
        cleanPhone = normalizePhoneNumber(rawPhone);
    }
    catch {
        cleanPhone = rawPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('972') && cleanPhone.length === 12) {
            cleanPhone = '0' + cleanPhone.substring(3);
        }
    }
    if (!cleanPhone) {
        return { authorized: false, reporterName: null, cleanPhone: "" };
    }
    const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(cleanPhone).get();
    if (reporterDoc.exists) {
        return {
            authorized: true,
            reporterName: reporterDoc.data()?.name || null,
            cleanPhone
        };
    }
    const repSnap = await db.collection("tenants").doc(tenantId).collection("reporters").where("phone", "==", cleanPhone).get();
    if (!repSnap.empty) {
        return {
            authorized: true,
            reporterName: repSnap.docs[0].data()?.name || null,
            cleanPhone
        };
    }
    const adminSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
    const adminDoc = adminSnap.docs.find(doc => {
        const mob = doc.data().mobile;
        if (!mob)
            return false;
        let cleanMob = mob.trim();
        try {
            cleanMob = normalizePhoneNumber(mob);
        }
        catch {
            cleanMob = mob.replace(/\D/g, '');
            if (cleanMob.startsWith('972') && cleanMob.length === 12) {
                cleanMob = '0' + cleanMob.substring(3);
            }
        }
        return cleanMob === cleanPhone;
    });
    if (adminDoc) {
        const aData = adminDoc.data();
        const name = `${aData.firstName || ''} ${aData.lastName || ''}`.trim() || aData.name || "מנהל";
        return {
            authorized: true,
            reporterName: name,
            cleanPhone
        };
    }
    return { authorized: false, reporterName: null, cleanPhone };
}
function sanitizeInput(input) {
    if (!input)
        return "";
    return input
        .replace(/<[^>]*>/g, "")
        .replace(/[\\'"`;#]/g, "")
        .trim();
}
async function downloadWhatsAppMedia(mediaId, token, maxSize) {
    const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!urlRes.ok) {
        const errText = await urlRes.text();
        throw new Error(`Failed to fetch media metadata: ${errText}`);
    }
    const meta = await urlRes.json();
    if (meta.file_size > maxSize) {
        throw new Error("FILE_TOO_LARGE");
    }
    const binaryRes = await fetch(meta.url, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!binaryRes.ok) {
        throw new Error(`Failed to download media binary from ${meta.url}`);
    }
    const arrayBuffer = await binaryRes.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: meta.mime_type
    };
}
async function transcribeAudioGemini(audioBuffer, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured for audio transcription");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
        "Please transcribe the following Hebrew audio text exactly as spoken. Return only the transcription text, with no formatting, notes, or commentary. If you hear nothing, return empty.",
        {
            inlineData: {
                data: audioBuffer.toString("base64"),
                mimeType: mimeType || "audio/ogg"
            }
        }
    ]);
    return result.response.text().trim();
}
async function transcribeAudioWhisper(audioBuffer, mimeType) {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
        logger.warn("OPENAI_API_KEY is not set. Falling back to native Gemini audio transcription.");
        return transcribeAudioGemini(audioBuffer, mimeType);
    }
    try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, "audio.ogg");
        formData.append("model", "whisper-1");
        formData.append("language", "he");
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openAiKey}`
            },
            body: formData
        });
        if (!response.ok) {
            const errText = await response.text();
            logger.error("Whisper response error:", errText);
            throw new Error(`Whisper returned error: ${errText}`);
        }
        const resData = await response.json();
        return resData.text || "";
    }
    catch (error) {
        logger.error("Whisper transcription failed, falling back to Gemini", { error: error.message });
        return transcribeAudioGemini(audioBuffer, mimeType);
    }
}
async function analyzeIncidentAI(params) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY secret is not configured");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
    const tData = tenantDoc.data() || {};
    const categories = (tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"]).join(", ");
    const lang = tData.language || 'he';
    const type = tData.type || 'building';
    const langNote = lang === 'he'
        ? "Respond in Hebrew ONLY. Summarize as a short Hebrew sentence."
        : "Respond in English ONLY. Summarize as a short English sentence.";
    const entityContext = type === 'municipality'
        ? "a public space or city maintenance hazard (e.g. pothole, broken street light, waste)"
        : "a building maintenance issue (e.g. leak, broken bulb, elevator failure)";
    const prompt = `
    You are TikTak AI, an efficient and accurate maintenance assistant.
    Analyze the attached report inputs describing ${entityContext}.
    ${langNote}

    Return a JSON object only. Choose the most appropriate Hebrew category from the exact provided list: [${categories}].

    Include the following keys:
    1. 'is_valid_issue': Boolean (true/false). If the input is empty, chaotic, or clearly not a maintenance issue, set to false.
    2. 'summary': A concise summary (3-10 words) describing the primary problem in detail.
    3. 'category': One of [${categories}]. Choose the most appropriate Hebrew category name from this list.
    4. 'urgency': One of [High, Moderate, Low]. High means critical danger or failure.
    
    Respond ONLY with the RAW JSON object.
  `;
    const contentParts = [prompt];
    if (params.textInput) {
        contentParts.push(`Resident description: "${params.textInput}"`);
    }
    if (params.imageBuffer) {
        contentParts.push({
            inlineData: {
                data: params.imageBuffer.toString("base64"),
                mimeType: params.imageMime || "image/jpeg"
            }
        });
    }
    const result = await model.generateContent(contentParts);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
    const finalData = JSON.parse(cleanJson || "{}");
    if (!finalData.urgency && finalData.severity) {
        finalData.urgency = finalData.severity;
    }
    return {
        is_valid_issue: finalData.is_valid_issue !== false,
        summary: finalData.summary || "דיווח תחזוקה",
        category: finalData.category || "אחר",
        urgency: finalData.urgency || "Low"
    };
}
function buildPaginatedList(allItems, pageIndex, fieldType, uiConfig, allowSkip) {
    const PAGE_SIZE = 8;
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const startIndex = pageIndex * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const sliced = allItems.slice(startIndex, endIndex);
    const rows = sliced.map((item, index) => {
        const actualIndex = startIndex + index;
        return {
            id: `select:${fieldType}:${actualIndex}`,
            title: `בחירה: ${item}`.substring(0, 24)
        };
    });
    if (pageIndex === 0 && allowSkip) {
        const nextLabel = fieldType === 'location' ? (uiConfig?.subLocationLabel || "תת-מיקום") : "";
        const skipTitle = fieldType === 'location'
            ? `דלג ל${nextLabel}`
            : "המשך ללא בחירה";
        rows.unshift({
            id: `select:${fieldType}:skip`,
            title: skipTitle.substring(0, 24),
            description: `מעבר לשלב הבא ללא הגדרת ${fieldType === 'location' ? (uiConfig?.locationLabel || "מיקום") : (uiConfig?.subLocationLabel || "תת-מיקום")}`
        });
    }
    if (pageIndex < totalPages - 1) {
        rows.push({
            id: `nav:next:${fieldType}`,
            title: "➡️ לעמוד הבא",
            description: `הצג עמוד ${pageIndex + 2} מתוך ${totalPages}`
        });
    }
    if (pageIndex > 0) {
        rows.push({
            id: `nav:prev:${fieldType}`,
            title: "< חזרה",
            description: `חזור לעמוד ${pageIndex}`
        });
    }
    const label = fieldType === 'location'
        ? (uiConfig?.locationLabel || "מיקום")
        : (uiConfig?.subLocationLabel || "תת-מיקום");
    return {
        type: "list",
        header: { type: "text", text: `בחירת ${label} הדיווח` },
        body: { text: "נא לבחור מתוך הרשימה למטה:" },
        action: {
            button: `בחר ${label}`,
            sections: [{
                    title: `אפשרויות (עמוד ${pageIndex + 1}/${totalPages})`,
                    rows: rows
                }]
        }
    };
}
async function sendWhatsAppMessage(to, payloadBody, phoneNumberId, token) {
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
    const resData = await response.json();
    if (!response.ok) {
        logger.error(`Meta API error sending to ${to}:`, resData);
        throw new Error(`Meta API error: ${JSON.stringify(resData)}`);
    }
    return resData;
}
async function sendWhatsAppText(to, text, phoneNumberId, token) {
    return sendWhatsAppMessage(to, {
        type: "text",
        text: { preview_url: false, body: text }
    }, phoneNumberId, token);
}
async function sendWhatsAppImage(to, imageUrl, phoneNumberId, token) {
    return sendWhatsAppMessage(to, {
        type: "image",
        image: { link: imageUrl }
    }, phoneNumberId, token);
}
async function sendWhatsAppAudio(to, audioUrl, phoneNumberId, token) {
    return sendWhatsAppMessage(to, {
        type: "audio",
        audio: { link: audioUrl }
    }, phoneNumberId, token);
}
async function sendWhatsAppDocument(to, documentUrl, fileName, phoneNumberId, token) {
    return sendWhatsAppMessage(to, {
        type: "document",
        document: { link: documentUrl, filename: fileName }
    }, phoneNumberId, token);
}
async function sendWhatsAppTemplate(to, templateName, langCode, parameters, phoneNumberId, token) {
    return sendWhatsAppMessage(to, {
        type: "template",
        template: {
            name: templateName,
            language: { code: langCode },
            components: [
                {
                    type: "body",
                    parameters: parameters.map(p => ({ type: "text", text: p }))
                }
            ]
        }
    }, phoneNumberId, token);
}
async function sendWhatsAppButtons(to, text, buttons, phoneNumberId, token) {
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
exports.whatsappWebhook = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN", "GEMINI_API_KEY"] }, async (req, res) => {
    if (req.method === "GET") {
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];
        const VERIFY_TOKEN = "tiktak_webhook_verify_token_2026";
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            logger.info("WhatsApp Webhook verified successfully");
            res.status(200).send(challenge);
        }
        else {
            logger.warn("WhatsApp Webhook verification failed", { mode, token });
            res.status(403).send("Forbidden");
        }
        return;
    }
    if (req.method === "POST") {
        try {
            const body = req.body;
            logger.info("Received WhatsApp Webhook POST payload", { structuredData: true, body: JSON.stringify(body) });
            if (body.object === "whatsapp_business_account") {
                const entry = body.entry?.[0];
                const change = entry?.changes?.[0];
                const value = change?.value;
                if (value && value.messages && value.messages.length > 0) {
                    const message = value.messages[0];
                    const from = message.from;
                    const token = process.env.WHATSAPP_ACCESS_TOKEN;
                    const phoneNumberId = value.metadata?.phone_number_id || "1046588828547584";
                    if (!token) {
                        logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager");
                        res.status(500).send("Access token missing");
                        return;
                    }
                    if (from) {
                        let localPhone = "";
                        try {
                            localPhone = normalizePhoneNumber(from);
                        }
                        catch (err) {
                            logger.warn(`Rejected invalid phone number format from ${from}`, { error: err.message });
                            res.status(200).send("EVENT_RECEIVED");
                            return;
                        }
                        let feedbackValue = null;
                        if (message.type === 'button') {
                            const payload = (message.button?.payload || '').toLowerCase();
                            const text = (message.button?.text || '').toLowerCase();
                            const combined = `${payload} ${text}`;
                            if (combined.includes('good') || combined.includes('מצוין'))
                                feedbackValue = 'good';
                            else if (combined.includes('ok') || combined.includes('בסדר'))
                                feedbackValue = 'ok';
                            else if (combined.includes('bad') || combined.includes('לא מרוצה'))
                                feedbackValue = 'bad';
                        }
                        else if (message.type === 'interactive') {
                            const title = (message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '').toLowerCase();
                            const id = (message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '').toLowerCase();
                            const combined = `${id} ${title}`;
                            if (combined.includes('good') || combined.includes('מצוין'))
                                feedbackValue = 'good';
                            else if (combined.includes('ok') || combined.includes('בסדר'))
                                feedbackValue = 'ok';
                            else if (combined.includes('bad') || combined.includes('לא מרוצה'))
                                feedbackValue = 'bad';
                        }
                        else if (message.type === 'text') {
                            const text = (message.text?.body || '').trim().toLowerCase();
                            if (text === 'מצוין')
                                feedbackValue = 'good';
                            else if (text === 'בסדר')
                                feedbackValue = 'ok';
                            else if (text === 'לא מרוצה')
                                feedbackValue = 'bad';
                        }
                        if (feedbackValue) {
                            try {
                                const ticketsQuery = db.collectionGroup("tickets").where("reporterPhone", "==", localPhone);
                                const querySnapshot = await ticketsQuery.get();
                                const fortyEightHoursAgoMs = Date.now() - 48 * 60 * 60 * 1000;
                                const candidates = querySnapshot.docs.filter(doc => {
                                    const data = doc.data();
                                    const createdAtMs = Date.parse(data.createdAt);
                                    return (['resolved', 'dismissed'].includes(data.status) &&
                                        createdAtMs >= fortyEightHoursAgoMs &&
                                        !data.vaadRating);
                                });
                                candidates.sort((a, b) => Date.parse(b.data().createdAt) - Date.parse(a.data().createdAt));
                                if (candidates.length > 0) {
                                    const targetDoc = candidates[0];
                                    const pathParts = targetDoc.ref.path.split('/');
                                    const tenantId = pathParts[1];
                                    await targetDoc.ref.update({
                                        vaadRating: feedbackValue,
                                        updatedAt: new Date().toISOString()
                                    });
                                    await recordAuditLog({
                                        tenantId,
                                        action: 'SERVICE_FEEDBACK_SUBMITTED',
                                        level: 'INFO',
                                        actor: {
                                            uid: localPhone,
                                            name: targetDoc.data()?.reporterName || 'Resident',
                                            type: 'resident'
                                        },
                                        details: {
                                            ticketId: targetDoc.id,
                                            ticketNumber: targetDoc.data()?.ticketNumber,
                                            rating: feedbackValue
                                        }
                                    });
                                }
                                await sendWhatsAppText(from, "תודה על הדירוג! המשוב שלך עוזר לנו לשפר את השירות לתושב/דייר. 🏡", phoneNumberId, token);
                                res.status(200).send("EVENT_RECEIVED");
                                return;
                            }
                            catch (e) {
                                logger.error("Failed to update service feedback", { error: e.message });
                                res.status(200).send("EVENT_RECEIVED");
                                return;
                            }
                        }
                        let vendorResponseText = null;
                        let extractedTicketId = null;
                        if (message.type === 'button') {
                            const payload = message.button?.payload || '';
                            const text = message.button?.text || '';
                            if (text.includes('קיבלתי את ההודעה') || text.includes('קבלתי את ההודעה') || payload.includes('VENDOR_ACK') || payload.includes('קיבלתי') || payload.includes('קבלתי')) {
                                vendorResponseText = 'קיבלתי את ההודעה';
                            }
                            else if (text.includes('בוצע') || payload.includes('VENDOR_DONE') || payload.includes('בוצע')) {
                                vendorResponseText = 'בוצע';
                            }
                            const match = payload.match(/VENDOR_(?:ACK|DONE)_([a-zA-Z0-9_-]+)/);
                            if (match)
                                extractedTicketId = match[1];
                        }
                        else if (message.type === 'interactive') {
                            const title = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
                            const id = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '';
                            if (title.includes('קיבלתי את ההודעה') || title.includes('קבלתי את ההודעה') || id.includes('VENDOR_ACK')) {
                                vendorResponseText = 'קיבלתי את ההודעה';
                            }
                            else if (title.includes('בוצע') || id.includes('VENDOR_DONE')) {
                                vendorResponseText = 'בוצע';
                            }
                            const match = id.match(/VENDOR_(?:ACK|DONE)_([a-zA-Z0-9_-]+)/);
                            if (match)
                                extractedTicketId = match[1];
                        }
                        else if (message.type === 'text') {
                            const text = (message.text?.body || '').trim();
                            if (text === 'קיבלתי את ההודעה' || text === 'קבלתי את ההודעה' || text === 'קיבלתי' || text === 'קבלתי') {
                                vendorResponseText = 'קיבלתי את ההודעה';
                            }
                            else if (text === 'בוצע') {
                                vendorResponseText = 'בוצע';
                            }
                        }
                        if (vendorResponseText) {
                            try {
                                logger.info(`Received vendor button click '${vendorResponseText}' from phone ${localPhone} (raw: ${from}), extractedTicketId: ${extractedTicketId || 'none'}`);
                                const querySnapshot = await db.collectionGroup("tickets").get();
                                const matches = [];
                                for (const docSnap of querySnapshot.docs) {
                                    const tData = docSnap.data();
                                    const vList = Array.isArray(tData.vendors) ? tData.vendors : [];
                                    const vIndex = vList.findIndex((v) => v.phone === localPhone ||
                                        v.rawPhone === localPhone ||
                                        v.intlPhone === from ||
                                        (v.phone && v.phone.replace(/\D/g, '') === localPhone.replace(/\D/g, '')) ||
                                        (v.intlPhone && v.intlPhone.replace(/\D/g, '') === from.replace(/\D/g, '')));
                                    if (vIndex !== -1) {
                                        const vItem = vList[vIndex];
                                        const sentAtMs = vItem.sentAt ? new Date(vItem.sentAt).getTime() : 0;
                                        matches.push({ docSnap, tData, vIndex, vItem, sentAtMs });
                                    }
                                }
                                let target = null;
                                if (extractedTicketId) {
                                    target = matches.find(m => m.docSnap.id === extractedTicketId || String(m.tData.ticketNumber) === extractedTicketId) || null;
                                }
                                if (!target && matches.length > 0) {
                                    const isDone = vendorResponseText === 'בוצע';
                                    const pendingMatches = matches.filter(m => isDone
                                        ? m.vItem.status !== 'בוצע'
                                        : (m.vItem.status !== 'בוצע' && m.vItem.status !== 'קיבלתי את ההודעה' && m.vItem.status !== 'קבלתי את ההודעה'));
                                    const pool = pendingMatches.length > 0 ? pendingMatches : matches;
                                    pool.sort((a, b) => b.sentAtMs - a.sentAtMs);
                                    target = pool[0];
                                }
                                if (target) {
                                    const { docSnap, tData, vIndex, vItem } = target;
                                    const vList = [...tData.vendors];
                                    const now = new Date();
                                    const nowIso = now.toISOString();
                                    const forwardDate = vItem.sentAt ? new Date(vItem.sentAt) : (tData.lastVendorForwardAt ? new Date(tData.lastVendorForwardAt) : null);
                                    const responseTimeMs = forwardDate ? Math.max(0, now.getTime() - forwardDate.getTime()) : null;
                                    const responseTimeSeconds = responseTimeMs !== null ? Math.round(responseTimeMs / 1000) : null;
                                    const responseTimeMinutes = responseTimeMs !== null ? Math.round(responseTimeMs / (1000 * 60)) : null;
                                    let executionTimeSeconds = null;
                                    let executionTimeMinutes = null;
                                    if (vItem.acknowledgedAt) {
                                        const ackMs = Math.max(0, now.getTime() - new Date(vItem.acknowledgedAt).getTime());
                                        executionTimeSeconds = Math.round(ackMs / 1000);
                                        executionTimeMinutes = Math.round(ackMs / (1000 * 60));
                                    }
                                    const isDone = vendorResponseText === 'בוצע';
                                    if (isDone) {
                                        vList[vIndex] = {
                                            ...vItem,
                                            status: 'בוצע',
                                            completedAt: nowIso,
                                            totalResolutionTimeSeconds: responseTimeSeconds,
                                            totalResolutionTimeMinutes: responseTimeMinutes,
                                            executionTimeSeconds,
                                            executionTimeMinutes,
                                            updatedAt: nowIso
                                        };
                                    }
                                    else {
                                        vList[vIndex] = {
                                            ...vItem,
                                            status: 'קיבלתי את ההודעה',
                                            acknowledgedAt: nowIso,
                                            responseTimeSeconds,
                                            responseTimeMinutes,
                                            updatedAt: nowIso
                                        };
                                    }
                                    await docSnap.ref.update({
                                        vendors: vList,
                                        lastVendorResponseAt: nowIso,
                                        ...(isDone ? { vendorCompletedAt: nowIso } : { vendorAcknowledgedAt: nowIso })
                                    });
                                    const pathParts = docSnap.ref.path.split('/');
                                    const tenantId = pathParts[1];
                                    const auditAction = isDone ? 'VENDOR_COMPLETED_TICKET' : 'VENDOR_ACKNOWLEDGED_TICKET';
                                    await recordAuditLog({
                                        tenantId,
                                        action: auditAction,
                                        level: 'INFO',
                                        actor: {
                                            uid: localPhone,
                                            name: vItem.name || localPhone,
                                            type: 'vendor'
                                        },
                                        details: {
                                            ticketId: docSnap.id,
                                            ticketNumber: tData.ticketNumber || '',
                                            category: tData.category || '',
                                            vendorPhone: localPhone,
                                            vendorName: vItem.name || localPhone,
                                            responseText: vendorResponseText,
                                            forwardedAt: vItem.sentAt || tData.lastVendorForwardAt || null,
                                            acknowledgedAt: isDone ? (vItem.acknowledgedAt || null) : nowIso,
                                            completedAt: isDone ? nowIso : null,
                                            responseTimeSeconds: !isDone ? responseTimeSeconds : undefined,
                                            responseTimeMinutes: !isDone ? responseTimeMinutes : undefined,
                                            totalResolutionTimeSeconds: isDone ? responseTimeSeconds : undefined,
                                            totalResolutionTimeMinutes: isDone ? responseTimeMinutes : undefined,
                                            executionTimeSeconds: isDone ? executionTimeSeconds : undefined,
                                            executionTimeMinutes: isDone ? executionTimeMinutes : undefined
                                        }
                                    });
                                    await sendWhatsAppText(from, `תודה! העדכון שלך ("${vendorResponseText}") עבור פנייה #${tData.ticketNumber || docSnap.id} נקלט בהצלחה במערכת TikTak. 🛠️`, phoneNumberId, token);
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                            }
                            catch (err) {
                                logger.error("Failed to process vendor button response", { error: err.message });
                            }
                        }
                        const sessionRef = db.collection("sessions").doc(localPhone);
                        const sessionDoc = await sessionRef.get();
                        const nowIso = new Date().toISOString();
                        let session = sessionDoc.exists ? sessionDoc.data() : {
                            phoneNumber: localPhone,
                            state: 'START',
                            tenantId: null,
                            tenantName: null,
                            reporterName: null,
                            draftTicket: null,
                            pagination: null,
                            lastMessageAt: nowIso,
                            updatedAt: nowIso,
                            messageCounter: 0,
                            counterResetAt: nowIso
                        };
                        const messageId = message.id;
                        if (messageId) {
                            if (!session.processedMessageIds) {
                                session.processedMessageIds = [];
                            }
                            if (session.processedMessageIds.includes(messageId)) {
                                logger.info(`Ignoring duplicate message: ${messageId}`);
                                res.status(200).send("EVENT_RECEIVED");
                                return;
                            }
                            session.processedMessageIds.push(messageId);
                            if (session.processedMessageIds.length > 20) {
                                session.processedMessageIds.shift();
                            }
                            await sessionRef.set(session);
                        }
                        const diffResetMs = Date.now() - Date.parse(session.counterResetAt || nowIso);
                        if (diffResetMs > 30000) {
                            session.messageCounter = 1;
                            session.counterResetAt = nowIso;
                        }
                        else {
                            session.messageCounter = (session.messageCounter || 0) + 1;
                            if (session.messageCounter > 10) {
                                logger.warn(`Throttled sender ${localPhone} due to message spikes.`);
                                if (session.messageCounter === 11) {
                                    await sendWhatsAppText(from, "מערכת TikTak זיהתה קצב הודעות גבוה. אנא המתן 30 שניות לפני שליחת הודעה נוספת.", phoneNumberId, token);
                                }
                                session.lastMessageAt = nowIso;
                                await sessionRef.set(session);
                                res.status(200).send("EVENT_RECEIVED");
                                return;
                            }
                        }
                        const idleMs = Date.now() - Date.parse(session.updatedAt || nowIso);
                        if (idleMs > 30 * 60 * 1000) {
                            session.state = 'START';
                            session.tenantId = null;
                            session.draftTicket = null;
                            session.pagination = null;
                        }
                        const messageText = sanitizeInput(message.text?.body ||
                            message.interactive?.button_reply?.title ||
                            message.button?.text ||
                            "");
                        const interactiveId = message.interactive?.button_reply?.id ||
                            message.interactive?.list_reply?.id ||
                            message.button?.payload ||
                            "";
                        const manualText = (message.text?.body || "").trim().toLowerCase();
                        const cancelKeywords = ["צא", "ביטול", "exit", "cancel"];
                        if (cancelKeywords.includes(manualText)) {
                            logger.info(`Session cancellation requested by ${from}`);
                            await sessionRef.delete();
                            await sendWhatsAppText(from, "התהליך בוטל בהצלחה. תוכל להתחיל תהליך חדש בכל עת.", phoneNumberId, token);
                            res.status(200).send("EVENT_RECEIVED");
                            return;
                        }
                        const lowerText = messageText.trim().toLowerCase();
                        const resetKeywords = ["איפוס", "ביטול", "התחל", "menu", "reset", "שלום", "היי", "hi", "hello", "restart"];
                        if (resetKeywords.includes(lowerText)) {
                            session.state = 'START';
                            session.tenantId = null;
                            session.draftTicket = null;
                            session.pagination = null;
                            logger.info(`Session reset requested by user ${from}`);
                        }
                        const hasErrors = message.errors && message.errors.length > 0;
                        const isMalformedInteractive = message.type === 'interactive' &&
                            !message.interactive?.button_reply &&
                            !message.interactive?.list_reply;
                        if (hasErrors || isMalformedInteractive) {
                            logger.warn(`Received error or malformed interactive payload from ${from}. Errors:`, message.errors || 'none');
                            const lang = session.tenantId ? (await db.collection("tenants").doc(session.tenantId).get()).data()?.language : "he";
                            let glitchKey = "whatsapp_glitch_generic";
                            if (session.state === "AWAITING_TENANT_SELECTION") {
                                glitchKey = "whatsapp_glitch_tenant";
                            }
                            else if (session.state === "MAIN_MENU") {
                                glitchKey = "whatsapp_glitch_menu";
                            }
                            await sendWhatsAppText(from, (0, i18n_1.t)(glitchKey, lang), phoneNumberId, token);
                            session.updatedAt = nowIso;
                            await sessionRef.set(session);
                            res.status(200).send("EVENT_RECEIVED");
                            return;
                        }
                        switch (session.state) {
                            case 'START': {
                                let whitelistQuery = await db.collectionGroup("reporters").where("phone", "==", localPhone).get();
                                let docsToProcess = whitelistQuery.docs;
                                if (whitelistQuery.empty) {
                                    const adminQuery = await db.collectionGroup("adminUsers").get();
                                    docsToProcess = adminQuery.docs.filter(doc => {
                                        const mob = doc.data().mobile;
                                        if (!mob)
                                            return false;
                                        let cleanMob = mob.trim();
                                        try {
                                            cleanMob = normalizePhoneNumber(mob);
                                        }
                                        catch {
                                            cleanMob = mob.replace(/\D/g, '');
                                        }
                                        return cleanMob === localPhone;
                                    });
                                }
                                if (docsToProcess.length === 0) {
                                    await sendWhatsAppText(from, (0, i18n_1.t)("not_registered", "he"), phoneNumberId, token);
                                    session.state = 'START';
                                }
                                else if (docsToProcess.length === 1) {
                                    const rDoc = docsToProcess[0];
                                    const tId = rDoc.ref.path.split('/')[1];
                                    const tenantSnap = await db.collection("tenants").doc(tId).get();
                                    const tData = tenantSnap.data() || {};
                                    const rData = rDoc.data() || {};
                                    session.tenantId = tId;
                                    session.tenantName = tData.name || tId;
                                    session.reporterName = `${rData.firstName || ''} ${rData.lastName || ''}`.trim() || rData.name || "תושב/דייר";
                                    session.state = 'MAIN_MENU';
                                    await sendWhatsAppButtons(from, `שלום! ברוכים הבאים למערכת הדיווחים של *${session.tenantName}*. כיצד נוכל לעזור היום?\n\nבכל שלב, אם תרצה לצאת מהתהליך רשום *צא* או *ביטול*.`, [
                                        { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                        { id: "menu_quicktap", title: "⚡ דיווח מהיר" },
                                        { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                    ], phoneNumberId, token);
                                }
                                else {
                                    const candidates = [];
                                    for (const docRef of docsToProcess) {
                                        const tId = docRef.ref.path.split('/')[1];
                                        const tenantSnap = await db.collection("tenants").doc(tId).get();
                                        candidates.push({ id: tId, name: tenantSnap.data()?.name || tId });
                                    }
                                    session.state = 'AWAITING_TENANT_SELECTION';
                                    session.candidates = candidates;
                                    const buttons = candidates.slice(0, 3).map(c => ({
                                        id: `select_tenant:${c.id}`,
                                        title: c.name
                                    }));
                                    await sendWhatsAppButtons(from, (0, i18n_1.t)("select_tenant_title", "he"), buttons, phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_TENANT_SELECTION': {
                                let selectedTenantId = "";
                                if (interactiveId.startsWith("select_tenant:")) {
                                    selectedTenantId = interactiveId.split(":")[1];
                                }
                                else if (messageText && session.candidates) {
                                    const cleanInput = messageText.trim().toLowerCase();
                                    const matched = session.candidates.find((c) => cleanInput === c.name.trim().toLowerCase() ||
                                        c.name.trim().toLowerCase().includes(cleanInput) ||
                                        cleanInput.includes(c.name.trim().toLowerCase()));
                                    if (matched) {
                                        selectedTenantId = matched.id;
                                    }
                                    else {
                                        const numberMatch = parseInt(cleanInput);
                                        if (!isNaN(numberMatch) && numberMatch >= 1 && numberMatch <= session.candidates.length) {
                                            selectedTenantId = session.candidates[numberMatch - 1].id;
                                        }
                                    }
                                }
                                if (selectedTenantId) {
                                    const tId = selectedTenantId;
                                    const tenantSnap = await db.collection("tenants").doc(tId).get();
                                    const tData = tenantSnap.data() || {};
                                    session.tenantId = tId;
                                    session.tenantName = tData.name || tId;
                                    session.state = 'MAIN_MENU';
                                    delete session.candidates;
                                    await sendWhatsAppButtons(from, `שלום! ברוכים הבאים למערכת הדיווחים של *${session.tenantName}*. כיצד נוכל לעזור היום?`, [
                                        { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                        { id: "menu_quicktap", title: "⚡ דיווח מהיר" },
                                        { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                    ], phoneNumberId, token);
                                }
                                else {
                                    await sendWhatsAppText(from, (0, i18n_1.t)("select_tenant_fallback", "he"), phoneNumberId, token);
                                }
                                break;
                            }
                            case 'MAIN_MENU': {
                                const isReportImage = interactiveId === 'menu_report_image' || messageText.includes('דיווח עם תמונה') || messageText.includes('עם תמונה') || messageText === '1';
                                const isQuickTap = interactiveId === 'menu_quicktap' || messageText.includes('דיווח מהיר') || messageText.includes('QuickTap') || messageText === '2';
                                const isReportNoImage = interactiveId === 'menu_report_no_image' || messageText.includes('דיווח ללא תמונה') || messageText.includes('ללא תמונה') || messageText === '3';
                                if (isReportImage) {
                                    session.state = 'AWAITING_MEDIA';
                                    session.mediaTypeExpect = 'image';
                                    await sendWhatsAppText(from, "אנא שלח תמונה ברורה של המפגע (גודל קובץ מקסימלי: 2MB).", phoneNumberId, token);
                                }
                                else if (isQuickTap) {
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const tenantData = tenantSnap.data() || {};
                                    const type = tenantData.type || 'building';
                                    const quickTapConfig = tenantData.quickTap || {};
                                    const hasItems = quickTapConfig.items && quickTapConfig.items.length > 0;
                                    const isEnabled = quickTapConfig.enabled !== false;
                                    if (!hasItems || !isEnabled) {
                                        const lang = tenantData.language || 'he';
                                        const configKey = type === 'municipality' ? 'no_quicktap_config_municipality' : 'no_quicktap_config_building';
                                        await sendWhatsAppText(from, (0, i18n_1.t)(configKey, lang), phoneNumberId, token);
                                        await sendWhatsAppButtons(from, "אנא בחר אחת מהאפשרויות הבאות:", [
                                            { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                            { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                        ], phoneNumberId, token);
                                    }
                                    else {
                                        session.state = 'QUICKTAP_SELECT';
                                        const items = quickTapConfig.items;
                                        if (items.length <= 3) {
                                            const buttons = items.map(item => {
                                                const titleText = `${item.emoji || "⚡"} ${item.summary || item.label || "דיווח מהיר"}`;
                                                return {
                                                    id: `quicktap:${item.id}`,
                                                    title: titleText.substring(0, 20)
                                                };
                                            });
                                            await sendWhatsAppButtons(from, "אנא בחר דיווח מהיר מתוך הכפתורים:", buttons, phoneNumberId, token);
                                        }
                                        else {
                                            const rows = items.map(item => {
                                                const titleText = `${item.emoji || "⚡"} ${item.summary || item.label || "דיווח מהיר"}`;
                                                return {
                                                    id: `quicktap:${item.id}`,
                                                    title: titleText.substring(0, 24),
                                                    description: `דיווח בקטגוריית ${item.category}`
                                                };
                                            });
                                            const listPayload = {
                                                type: "interactive",
                                                interactive: {
                                                    type: "list",
                                                    header: { type: "text", text: "דיווח מהיר QuickTap" },
                                                    body: { text: "נא לבחור מפגע נפוץ מהרשימה:" },
                                                    action: {
                                                        button: "רשימת דיווחים",
                                                        sections: [{
                                                                title: "דיווחים מהירים",
                                                                rows: rows
                                                            }]
                                                    }
                                                }
                                            };
                                            await sendWhatsAppMessage(from, listPayload, phoneNumberId, token);
                                        }
                                    }
                                }
                                else if (isReportNoImage) {
                                    session.state = 'AWAITING_MEDIA';
                                    session.mediaTypeExpect = 'any_no_image';
                                    await sendWhatsAppText(from, "אנא הקלט הודעה קולית (Voice Note) עד 1MB או הקלד תיאור טקסטואלי של המפגע.", phoneNumberId, token);
                                }
                                else {
                                    await sendWhatsAppButtons(from, "פעולה לא מוכרת. אנא בחר אחת מהאפשרויות הבאות:", [
                                        { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                        { id: "menu_quicktap", title: "⚡ דיווח מהיר" },
                                        { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                    ], phoneNumberId, token);
                                }
                                break;
                            }
                            case 'QUICKTAP_SELECT': {
                                if (interactiveId.startsWith("quicktap:")) {
                                    const itemId = interactiveId.split(":")[1];
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const quickTapItems = tenantSnap.data()?.quickTap?.items || [];
                                    const matched = quickTapItems.find(item => item.id === itemId);
                                    if (matched) {
                                        session.draftTicket = {
                                            summary: matched.summary || matched.label || "דיווח מהיר",
                                            category: matched.category,
                                            urgency: matched.urgency || "Low",
                                            location: matched.location || null,
                                            subLocation: matched.subLocation || null,
                                            imageId: "hidden-quicktap",
                                            audioId: null,
                                            comments: [],
                                            reportingMethod: "quicktap"
                                        };
                                        session.state = 'AWAITING_VERIFICATION';
                                        const previewText = `📝 *פרטי דיווח מהיר:*
• *קטגוריה:* ${matched.category}
• *מיקום:* ${matched.location || "לא נבחר"} / ${matched.subLocation || "לא נבחר"}
• *תקציר:* ${matched.summary || matched.label || "דיווח מהיר"}
• *דחיפות:* ${matched.urgency === 'High' ? 'גבוהה 🚨' : matched.urgency === 'Moderate' ? 'בינונית' : 'רגילה'}

אשר את הדיווח?`;
                                        await sendWhatsAppButtons(from, previewText, [
                                            { id: "confirm_ticket", title: "⚡ אשרו ושילחו" },
                                            { id: "cancel_ticket", title: "❌ ביטול" }
                                        ], phoneNumberId, token);
                                    }
                                    else {
                                        await sendWhatsAppText(from, "הדיווח שנבחר אינו תקף.", phoneNumberId, token);
                                        session.state = 'MAIN_MENU';
                                    }
                                }
                                else {
                                    session.state = 'MAIN_MENU';
                                }
                                break;
                            }
                            case 'AWAITING_MEDIA': {
                                let textInput = "";
                                let imageBuffer;
                                let imageMime = "";
                                let imageId = null;
                                let audioId = null;
                                let isImage = false;
                                if (message.type === 'image') {
                                    if (session.mediaTypeExpect === 'any_no_image') {
                                        await sendWhatsAppText(from, "בחרת בדיווח ללא תמונה. אנא שלח הקלטה קולית או הקלד תיאור טקסטואלי של המפגע.", phoneNumberId, token);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    const mediaId = message.image.id;
                                    try {
                                        const download = await downloadWhatsAppMedia(mediaId, token, 2 * 1024 * 1024);
                                        imageBuffer = download.buffer;
                                        imageMime = download.mimeType;
                                        isImage = true;
                                        imageId = (0, crypto_1.randomUUID)();
                                        const bucket = storage.bucket();
                                        const imageFile = bucket.file(`tenants/${session.tenantId}/${imageId}.jpg`);
                                        await imageFile.save(imageBuffer, {
                                            metadata: { contentType: imageMime || "image/jpeg" }
                                        });
                                    }
                                    catch (err) {
                                        if (err.message === 'FILE_TOO_LARGE') {
                                            await sendWhatsAppText(from, "התמונה ששלחת גדולה מדי. אנא שלח תמונה קטנה מ-2MB.", phoneNumberId, token);
                                        }
                                        else {
                                            await sendWhatsAppText(from, "שגיאה בהורדת התמונה. אנא נסה שוב.", phoneNumberId, token);
                                        }
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                }
                                else if (message.type === 'audio') {
                                    if (session.mediaTypeExpect === 'image') {
                                        await sendWhatsAppText(from, "בחרת בדיווח עם תמונה. אנא צלם או שלח תמונה של המפגע.", phoneNumberId, token);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    const mediaId = message.audio.id;
                                    try {
                                        const download = await downloadWhatsAppMedia(mediaId, token, 1 * 1024 * 1024);
                                        const audioMime = download.mimeType;
                                        audioId = (0, crypto_1.randomUUID)();
                                        const bucket = storage.bucket();
                                        const audioFile = bucket.file(`tenants/${session.tenantId}/${audioId}.webm`);
                                        await audioFile.save(download.buffer, {
                                            metadata: { contentType: audioMime }
                                        });
                                        textInput = "";
                                    }
                                    catch (err) {
                                        if (err.message === 'FILE_TOO_LARGE') {
                                            await sendWhatsAppText(from, "ההודעה הקולית ארוכה או גדולה מדי. המגבלה היא 1MB.", phoneNumberId, token);
                                        }
                                        else {
                                            await sendWhatsAppText(from, "שגיאה בפענוח ההקלטה. אנא נסה להקליט שוב או להקליד טקסט.", phoneNumberId, token);
                                        }
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                }
                                else if (message.type === 'text') {
                                    const isMenuKeyword = messageText.includes('דיווח עם תמונה') ||
                                        messageText.includes('דיווח מהיר') ||
                                        messageText.includes('QuickTap') ||
                                        messageText.includes('דיווח ללא תמונה');
                                    if (isMenuKeyword) {
                                        logger.info("Ignoring text message representing menu button selection in AWAITING_MEDIA: " + messageText);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    if (session.mediaTypeExpect === 'image') {
                                        await sendWhatsAppText(from, "בחרת בדיווח עם תמונה. אנא צלם או שלח תמונה של המפגע.", phoneNumberId, token);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    textInput = messageText;
                                }
                                else {
                                    await sendWhatsAppText(from, "אנא שלח תמונה, הקלטה קולית או הודעת טקסט תקינה.", phoneNumberId, token);
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                                if (isImage) {
                                    await sendWhatsAppText(from, "מנתח את הנתונים באמצעות TikTak AI... ⚡", phoneNumberId, token);
                                    try {
                                        const aiResult = await analyzeIncidentAI({
                                            tenantId: session.tenantId,
                                            imageBuffer,
                                            imageMime,
                                            textInput
                                        });
                                        if (!aiResult.is_valid_issue) {
                                            await sendWhatsAppText(from, "לא זיהינו מפגע תחזוקה ברור בתמונה ששלחת. אנא נסה לצלם שוב בבירור.", phoneNumberId, token);
                                            session.state = 'AWAITING_MEDIA';
                                            session.mediaTypeExpect = 'image';
                                        }
                                        else {
                                            session.draftTicket = {
                                                summary: aiResult.summary || textInput || "מפגע תחזוקה",
                                                category: aiResult.category || "אחר",
                                                urgency: aiResult.urgency || "Moderate",
                                                location: null,
                                                subLocation: null,
                                                imageId: imageId,
                                                audioId: null,
                                                comments: [],
                                                reportingMethod: "ai"
                                            };
                                            await proceedToLocationOrVerification(session, from, phoneNumberId, token);
                                        }
                                    }
                                    catch (aiErr) {
                                        logger.error("Gemini AI incident analysis failed", aiErr);
                                        await sendWhatsAppText(from, "ניתוח ה-AI נכשל זמנית. נעבור להזנת פרטים ישירה.", phoneNumberId, token);
                                        session.draftTicket = {
                                            summary: textInput || "דיווח תחזוקה",
                                            category: "אחר",
                                            urgency: "Moderate",
                                            location: null,
                                            subLocation: null,
                                            imageId: imageId,
                                            audioId: null,
                                            comments: [],
                                            reportingMethod: "manual"
                                        };
                                        session.state = 'AWAITING_VERIFICATION';
                                        await sendVerificationPreview(from, session, phoneNumberId, token);
                                    }
                                }
                                else {
                                    const isAudio = !!audioId;
                                    const rawSummary = textInput || "דיווח תחזוקה";
                                    const summaryText = isAudio ? "[דיווח קולי]" : rawSummary;
                                    session.draftTicket = {
                                        summary: summaryText,
                                        category: "אחר",
                                        urgency: "Low",
                                        location: null,
                                        subLocation: null,
                                        imageId: null,
                                        audioId: audioId,
                                        comments: [],
                                        reportingMethod: "manual"
                                    };
                                    await promptCategorySelection(session, from, phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_LOCATION': {
                                if (interactiveId.startsWith("nav:")) {
                                    const direction = interactiveId.split(":")[1];
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const tData = tenantSnap.data() || {};
                                    const locations = tData.config?.locations || [];
                                    const subLocations = tData.config?.subLocations || tData.config?.resources || [];
                                    let pageIndex = session.pagination?.pageIndex || 0;
                                    if (direction === 'next')
                                        pageIndex++;
                                    else if (direction === 'prev')
                                        pageIndex--;
                                    session.pagination = { items: locations, pageIndex, fieldType: 'location' };
                                    const allowSkip = subLocations.length > 0;
                                    const paginatedList = buildPaginatedList(locations, pageIndex, 'location', tData.uiConfig, allowSkip);
                                    await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
                                }
                                else if (interactiveId === "select:location:skip") {
                                    session.draftTicket.location = null;
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const tData = tenantSnap.data() || {};
                                    const subLocations = tData.config?.subLocations || tData.config?.resources || [];
                                    if (subLocations.length > 0) {
                                        session.state = 'AWAITING_SUBLOCATION';
                                        session.pagination = {
                                            items: subLocations,
                                            pageIndex: 0,
                                            fieldType: 'sublocation'
                                        };
                                        const paginatedList = buildPaginatedList(subLocations, 0, 'sublocation', tData.uiConfig, false);
                                        await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
                                    }
                                    else {
                                        if (session.draftTicket.reportingMethod === 'manual') {
                                            await promptPrioritySelection(session, from, phoneNumberId, token);
                                        }
                                        else {
                                            session.state = 'AWAITING_VERIFICATION';
                                            await sendVerificationPreview(from, session, phoneNumberId, token);
                                        }
                                    }
                                }
                                else if (interactiveId.startsWith("select:location:")) {
                                    const actualIdx = parseInt(interactiveId.split(":")[2]);
                                    const locationVal = session.pagination?.items?.[actualIdx];
                                    session.draftTicket.location = locationVal;
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const tData = tenantSnap.data() || {};
                                    const subLocations = tData.config?.subLocations || tData.config?.resources || [];
                                    if (subLocations.length > 0) {
                                        session.state = 'AWAITING_SUBLOCATION';
                                        session.pagination = {
                                            items: subLocations,
                                            pageIndex: 0,
                                            fieldType: 'sublocation'
                                        };
                                        const paginatedList = buildPaginatedList(subLocations, 0, 'sublocation', tData.uiConfig, true);
                                        await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
                                    }
                                    else {
                                        if (session.draftTicket.reportingMethod === 'manual') {
                                            await promptPrioritySelection(session, from, phoneNumberId, token);
                                        }
                                        else {
                                            session.state = 'AWAITING_VERIFICATION';
                                            await sendVerificationPreview(from, session, phoneNumberId, token);
                                        }
                                    }
                                }
                                else {
                                    await sendWhatsAppText(from, "נא לבחור מיקום מתוך הרשימה.", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_SUBLOCATION': {
                                if (interactiveId.startsWith("nav:")) {
                                    const direction = interactiveId.split(":")[1];
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const tData = tenantSnap.data() || {};
                                    const subLocations = tData.config?.subLocations || tData.config?.resources || [];
                                    let pageIndex = session.pagination?.pageIndex || 0;
                                    if (direction === 'next')
                                        pageIndex++;
                                    else if (direction === 'prev')
                                        pageIndex--;
                                    session.pagination = { items: subLocations, pageIndex, fieldType: 'sublocation' };
                                    const allowSkip = !!session.draftTicket?.location;
                                    const paginatedList = buildPaginatedList(subLocations, pageIndex, 'sublocation', tData.uiConfig, allowSkip);
                                    await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
                                }
                                else if (interactiveId === "select:sublocation:skip") {
                                    session.draftTicket.subLocation = null;
                                    if (session.draftTicket.reportingMethod === 'manual') {
                                        await promptPrioritySelection(session, from, phoneNumberId, token);
                                    }
                                    else {
                                        session.state = 'AWAITING_VERIFICATION';
                                        await sendVerificationPreview(from, session, phoneNumberId, token);
                                    }
                                }
                                else if (interactiveId.startsWith("select:sublocation:")) {
                                    const actualIdx = parseInt(interactiveId.split(":")[2]);
                                    const subLocationVal = session.pagination?.items?.[actualIdx];
                                    session.draftTicket.subLocation = subLocationVal;
                                    if (session.draftTicket.reportingMethod === 'manual') {
                                        await promptPrioritySelection(session, from, phoneNumberId, token);
                                    }
                                    else {
                                        session.state = 'AWAITING_VERIFICATION';
                                        await sendVerificationPreview(from, session, phoneNumberId, token);
                                    }
                                }
                                else {
                                    await sendWhatsAppText(from, "נא לבחור מיקום מדוייק מתוך הרשימה.", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_PRIORITY': {
                                let selectedPriority = "";
                                if (interactiveId.startsWith("select_priority:")) {
                                    selectedPriority = interactiveId.split(":")[1];
                                }
                                else if (messageText) {
                                    const cleanInput = messageText.trim().toLowerCase();
                                    if (cleanInput.includes("נמוכה") || cleanInput.includes("רגילה") || cleanInput === "1" || cleanInput.includes("low")) {
                                        selectedPriority = "Low";
                                    }
                                    else if (cleanInput.includes("בינונית") || cleanInput === "2" || cleanInput.includes("moderate")) {
                                        selectedPriority = "Moderate";
                                    }
                                    else if (cleanInput.includes("דחופה") || cleanInput.includes("גבוהה") || cleanInput === "3" || cleanInput.includes("high")) {
                                        selectedPriority = "High";
                                    }
                                }
                                if (selectedPriority) {
                                    session.draftTicket.urgency = selectedPriority;
                                    session.state = 'AWAITING_VERIFICATION';
                                    await sendVerificationPreview(from, session, phoneNumberId, token);
                                }
                                else {
                                    await sendWhatsAppText(from, "אנא בחר דחיפות תקינה מתוך הכפתורים או הקלד (1, 2 או 3).", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_CATEGORY': {
                                let selectedCategory = "";
                                if (interactiveId.startsWith("select_category:")) {
                                    selectedCategory = interactiveId.split(":")[1];
                                }
                                else if (messageText) {
                                    const cleanInput = messageText.trim().toLowerCase();
                                    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                    const categories = tenantSnap.data()?.config?.categories || [];
                                    const matched = categories.find((cat) => cleanInput === cat.toLowerCase() ||
                                        cat.toLowerCase().includes(cleanInput) ||
                                        cleanInput.includes(cat.toLowerCase()));
                                    if (matched) {
                                        selectedCategory = matched;
                                    }
                                    else {
                                        const num = parseInt(cleanInput);
                                        if (!isNaN(num) && num >= 1 && num <= categories.length) {
                                            selectedCategory = categories[num - 1];
                                        }
                                    }
                                }
                                if (selectedCategory) {
                                    session.draftTicket.category = selectedCategory;
                                    await proceedToLocationOrVerification(session, from, phoneNumberId, token);
                                }
                                else {
                                    await sendWhatsAppText(from, "אנא בחר קטגוריה תקינה מהרשימה.", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_VERIFICATION': {
                                if (interactiveId === 'confirm_ticket') {
                                    const draft = session.draftTicket;
                                    if (!draft) {
                                        await sendWhatsAppText(from, "שגיאה: פרטי הטיוטה אבדו.", phoneNumberId, token);
                                        session.state = 'MAIN_MENU';
                                        break;
                                    }
                                    await sendWhatsAppText(from, "יוצר דיווח במערכת... ⚡", phoneNumberId, token);
                                    try {
                                        const tenantRef = db.collection("tenants").doc(session.tenantId);
                                        const ticketsCol = tenantRef.collection("tickets");
                                        const ticketId = draft.imageId && !draft.imageId.startsWith("hidden-") ? draft.imageId : (0, crypto_1.randomUUID)();
                                        const ticketRef = ticketsCol.doc(ticketId);
                                        const tenantDoc = await tenantRef.get();
                                        const tenantData = tenantDoc.data() || {};
                                        const tenantName = tenantData.name || session.tenantId;
                                        if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen' || tenantData.subscription?.status === 'cancelled') {
                                            const contactTarget = tenantData.type === 'municipality' ? 'המשרד' : 'ועד הבית';
                                            await sendWhatsAppText(from, `חשבון הבניין/יישוב מוקפא זמנית. אנא פנה ל${contactTarget} או לשירות לקוחות TikTak.`, phoneNumberId, token);
                                            session.state = 'START';
                                            break;
                                        }
                                        const rDoc = await tenantRef.collection("reporters").doc(session.phoneNumber).get();
                                        if (!rDoc.exists) {
                                            await sendWhatsAppText(from, "אימות נכשל. הטלפון שלך הוסר מרשימת המדווחים.", phoneNumberId, token);
                                            session.state = 'START';
                                            break;
                                        }
                                        const ticketNumber = await db.runTransaction(async (transaction) => {
                                            const tenantSnap = await transaction.get(tenantRef);
                                            const tData = tenantSnap.data() || {};
                                            const currentCount = tData.lastTicketNumber || 0;
                                            const nextNumber = currentCount + 1;
                                            transaction.update(tenantRef, { lastTicketNumber: nextNumber });
                                            const ticketData = {
                                                summary: draft.summary,
                                                category: draft.category,
                                                urgency: draft.urgency,
                                                location: draft.location || null,
                                                subLocation: draft.subLocation || null,
                                                ticketType: 'visible',
                                                source: 'whatsapp',
                                                reportingMethod: draft.reportingMethod || 'manual',
                                                imageId: draft.imageId && !draft.imageId.startsWith("hidden-") ? draft.imageId : null,
                                                audioId: draft.audioId || null,
                                                reporterPhone: session.phoneNumber,
                                                reporterName: rDoc.data()?.name || "תושב/דייר",
                                                status: 'open',
                                                ticketNumber: nextNumber,
                                                createdAt: new Date().toISOString(),
                                                updatedAt: new Date().toISOString(),
                                                lastStatusChangeAt: new Date().toISOString(),
                                                total_days_in_new: 0,
                                                total_days_in_progress: 0,
                                                stagnationDays: 0,
                                                slaStatus: 'none',
                                                adminComments: []
                                            };
                                            transaction.set(ticketRef, ticketData);
                                            return nextNumber;
                                        });
                                        logger.info("WhatsApp ticket created successfully", {
                                            tenantId: session.tenantId,
                                            ticketNumber,
                                            ticketId,
                                            reporterPhone: session.phoneNumber,
                                            reporterName: rDoc.data()?.name || "תושב/דייר"
                                        });
                                        try {
                                            await db.collection("global_stats").doc("counters").set({
                                                totalTicketsCount: admin.firestore.FieldValue.increment(1)
                                            }, { merge: true });
                                        }
                                        catch (statErr) {
                                            logger.error("Stats increment failed in whatsappbot", statErr);
                                        }
                                        try {
                                            await db.collection("tenants").doc(session.tenantId).set({
                                                subscription: {
                                                    currentCycleTicketCount: admin.firestore.FieldValue.increment(1)
                                                }
                                            }, { merge: true });
                                            const freshTenantSnap = await db.collection("tenants").doc(session.tenantId).get();
                                            if (freshTenantSnap.exists) {
                                                await checkAndDispatchQuotaAlerts(session.tenantId, freshTenantSnap.data());
                                            }
                                        }
                                        catch (subErr) {
                                            logger.error("Subscription ticket increment failed in whatsappbot", { tenantId: session.tenantId, error: subErr.message });
                                        }
                                        await recordAuditLog({
                                            tenantId: session.tenantId,
                                            action: 'TICKET_CREATED',
                                            level: 'INFO',
                                            actor: {
                                                uid: session.phoneNumber,
                                                name: rDoc.data()?.name || session.phoneNumber,
                                                type: 'resident'
                                            },
                                            details: {
                                                ticketId,
                                                ticketNumber,
                                                summary: draft.summary,
                                                category: draft.category,
                                                urgency: draft.urgency,
                                                location: draft.location || null,
                                                subLocation: draft.subLocation || null,
                                                source: 'whatsapp',
                                                reportingMethod: draft.reportingMethod,
                                                hasImage: !!draft.imageId && !draft.imageId.startsWith("hidden-"),
                                                hasAudio: !!draft.audioId
                                            }
                                        });
                                        const adminUsersSnap = await tenantRef.collection("adminUsers").get();
                                        const admins = [];
                                        adminUsersSnap.forEach((userDoc) => {
                                            const data = userDoc.data();
                                            if (data && data.mobile && data.mobile.trim()) {
                                                admins.push({
                                                    name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
                                                    phone: data.mobile.trim(),
                                                });
                                            }
                                        });
                                        await sendWhatsAppNotification({
                                            tenantId: session.tenantId,
                                            tenantName,
                                            ticketNumber,
                                            category: draft.category,
                                            summary: draft.summary,
                                            location: draft.location,
                                            subLocation: draft.subLocation,
                                            urgency: draft.urgency,
                                            reporterName: rDoc.data()?.name || null,
                                            imageId: draft.imageId && !draft.imageId.startsWith("hidden-") ? draft.imageId : null,
                                            audioId: draft.audioId || null,
                                            admins
                                        });
                                        await sendResidentWhatsAppNotification({
                                            phone: session.phoneNumber,
                                            templateName: "new_ticket_confirmation",
                                            ticketNumber,
                                            category: draft.category,
                                            location: draft.location,
                                            subLocation: draft.subLocation,
                                            tenantId: session.tenantId
                                        });
                                        await sessionRef.delete();
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    catch (tErr) {
                                        logger.error("Ticket creation failed inside state machine", tErr);
                                        await sendWhatsAppText(from, "מצטערים, יצירת הדיווח נכשלה עקב שגיאה במערכת. נסה שוב.", phoneNumberId, token);
                                        session.state = 'MAIN_MENU';
                                    }
                                }
                                else if (interactiveId === 'cancel_ticket') {
                                    await sendWhatsAppText(from, "הדיווח בוטל בהצלחה.", phoneNumberId, token);
                                    await sessionRef.delete();
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                                else if (interactiveId === 'edit_summary') {
                                    if (session.draftTicket?.reportingMethod === 'quicktap') {
                                        await sendWhatsAppText(from, "לא ניתן לערוך תקציר בדיווח מהיר.", phoneNumberId, token);
                                    }
                                    else {
                                        session.state = 'EDITING_SUMMARY';
                                        await sendWhatsAppText(from, "נא הקלד את התיקון שלך לתקציר הדיווח:", phoneNumberId, token);
                                    }
                                }
                                else {
                                    if (session.draftTicket?.reportingMethod !== 'quicktap' && messageText) {
                                        const comments = session.draftTicket.comments || [];
                                        comments.push(messageText);
                                        session.draftTicket.comments = comments;
                                        try {
                                            await sendWhatsAppText(from, "מעדכן את התקציר עם המידע החדש... ⚡", phoneNumberId, token);
                                            const apiKey = process.env.GEMINI_API_KEY;
                                            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
                                            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                                            const refinePrompt = `
                        Original Summary: "${session.draftTicket.summary}"
                        Additional comment added by resident: "${messageText}"
                        Refine the summary into a single, clean Hebrew sentence combining both contexts. Do not add formatting or intros. Max 8 words.
                      `;
                                            const result = await model.generateContent(refinePrompt);
                                            session.draftTicket.summary = result.response.text().trim().replace(/[\\'"`;]/g, "");
                                        }
                                        catch (e) {
                                            logger.error("Gemini summary refinement failed", e);
                                            session.draftTicket.summary = `${session.draftTicket.summary} - ${messageText}`.substring(0, 80);
                                        }
                                        await sendVerificationPreview(from, session, phoneNumberId, token);
                                    }
                                    else {
                                        await sendWhatsAppText(from, "פעולה לא מורשית בשלב אימות זה.", phoneNumberId, token);
                                    }
                                }
                                break;
                            }
                            case 'EDITING_SUMMARY': {
                                if (messageText) {
                                    session.draftTicket.summary = sanitizeInput(messageText);
                                    session.state = 'AWAITING_VERIFICATION';
                                    await sendVerificationPreview(from, session, phoneNumberId, token);
                                }
                                else {
                                    await sendWhatsAppText(from, "אנא הקלד תקציר טקסטואלי תקין.", phoneNumberId, token);
                                }
                                break;
                            }
                        }
                        session.updatedAt = new Date().toISOString();
                        await sessionRef.set(session);
                    }
                }
            }
            res.status(200).send("EVENT_RECEIVED");
        }
        catch (error) {
            logger.error("Error processing WhatsApp Webhook", { error: error.message });
            res.status(500).send("Internal Server Error");
        }
        return;
    }
    res.status(405).send("Method Not Allowed");
});
async function sendVerificationPreview(to, session, phoneNumberId, token) {
    const draft = session.draftTicket;
    const isQuickTap = draft.reportingMethod === 'quicktap';
    const hasAudio = !!draft.audioId;
    const summaryDisplay = hasAudio ? "הודעה קולית 🎙️" : draft.summary;
    const previewText = `📋 *אישור פרטי דיווח:*
• *קטגוריה:* ${draft.category}
• *מיקום:* ${draft.location || "לא נבחר"} / ${draft.subLocation || "לא נבחר"}
• *תקציר:* ${summaryDisplay}
• *דחיפות:* ${draft.urgency === 'High' ? 'גבוהה 🚨' : draft.urgency === 'Moderate' ? 'בינונית' : 'רגילה'}${draft.comments && draft.comments.length > 0 ? `\n• *הערות:* ${draft.comments.join(", ")}` : ""}

האם הדיווח נכון?`;
    const buttons = (isQuickTap || hasAudio)
        ? [
            { id: "confirm_ticket", title: "⚡ אשרו ושילחו" },
            { id: "cancel_ticket", title: "❌ ביטול" }
        ]
        : [
            { id: "confirm_ticket", title: "⚡ אשרו ושילחו" },
            { id: "edit_summary", title: "✏️ ערוך תקציר" },
            { id: "cancel_ticket", title: "❌ ביטול" }
        ];
    await sendWhatsAppButtons(to, previewText, buttons, phoneNumberId, token);
}
async function proceedToLocationOrVerification(session, from, phoneNumberId, token) {
    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
    const tData = tenantSnap.data() || {};
    const locations = tData.config?.locations || [];
    const subLocations = tData.config?.subLocations || tData.config?.resources || [];
    const hasLocations = locations.length > 0;
    const hasSubLocations = subLocations.length > 0;
    if (hasLocations) {
        session.state = 'AWAITING_LOCATION';
        session.pagination = {
            items: locations,
            pageIndex: 0,
            fieldType: 'location'
        };
        const allowSkipLocation = hasSubLocations;
        const paginatedList = buildPaginatedList(locations, 0, 'location', tData.uiConfig, allowSkipLocation);
        await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
    }
    else if (hasSubLocations) {
        session.state = 'AWAITING_SUBLOCATION';
        session.pagination = {
            items: subLocations,
            pageIndex: 0,
            fieldType: 'sublocation'
        };
        const paginatedList = buildPaginatedList(subLocations, 0, 'sublocation', tData.uiConfig, false);
        await sendWhatsAppMessage(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
    }
    else {
        if (session.draftTicket.reportingMethod === 'manual') {
            await promptPrioritySelection(session, from, phoneNumberId, token);
        }
        else {
            session.state = 'AWAITING_VERIFICATION';
            await sendVerificationPreview(from, session, phoneNumberId, token);
        }
    }
}
async function promptPrioritySelection(session, from, phoneNumberId, token) {
    session.state = 'AWAITING_PRIORITY';
    await sendWhatsAppButtons(from, "אנא בחר את רמת הדחיפות של המפגע:", [
        { id: "select_priority:Low", title: "רגילה (נמוכה) 🟢" },
        { id: "select_priority:Moderate", title: "בינונית 🟡" },
        { id: "select_priority:High", title: "דחופה 🚨" }
    ], phoneNumberId, token);
}
async function promptCategorySelection(session, from, phoneNumberId, token) {
    const tenantSnap = await db.collection("tenants").doc(session.tenantId).get();
    const tData = tenantSnap.data() || {};
    const categories = tData.config?.categories || [];
    if (categories.length > 0) {
        session.state = 'AWAITING_CATEGORY';
        if (categories.length <= 3) {
            const buttons = categories.map((cat) => ({
                id: `select_category:${cat}`,
                title: cat.substring(0, 20)
            }));
            await sendWhatsAppButtons(from, "אנא בחר קטגוריה מתאימה לדיווח:", buttons, phoneNumberId, token);
        }
        else {
            const rows = categories.map((cat) => ({
                id: `select_category:${cat}`,
                title: `בחירה: ${cat}`.substring(0, 24)
            }));
            const listPayload = {
                type: "interactive",
                interactive: {
                    type: "list",
                    header: { type: "text", text: "בחירת קטגוריית הדיווח" },
                    body: { text: "אנא בחר את הקטגוריה המתאימה ביותר מהרשימה:" },
                    action: {
                        button: "בחר קטגוריה",
                        sections: [{
                                title: "קטגוריות זמינות",
                                rows: rows
                            }]
                    }
                }
            };
            await sendWhatsAppMessage(from, listPayload, phoneNumberId, token);
        }
    }
    else {
        session.draftTicket.category = "אחר";
        await proceedToLocationOrVerification(session, from, phoneNumberId, token);
    }
}
exports.forwardTicketToVendor = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    try {
        const { tenantId, ticketId, vendorPhone, vendorName, messageText, actorName, actorUid, actorEmail } = req.body;
        if (!tenantId || !ticketId || !vendorPhone || !messageText) {
            res.status(400).send({ error: "Missing required parameters (tenantId, ticketId, vendorPhone, messageText)" });
            return;
        }
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        if (!token) {
            res.status(500).send({ error: "WhatsApp access token not configured" });
            return;
        }
        const ticketRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
        const ticketSnap = await ticketRef.get();
        if (!ticketSnap.exists) {
            res.status(404).send({ error: "Ticket not found" });
            return;
        }
        const ticketData = ticketSnap.data() || {};
        const currentStatus = String(ticketData.status || '').toLowerCase();
        if (['resolved', 'dismissed', 'closed'].includes(currentStatus)) {
            res.status(400).send({ error: "לא ניתן להעביר לספק פנייה שטופלה ונסגרה" });
            return;
        }
        const currentCount = ticketData.vendorForwardCount || 0;
        if (currentCount >= 3) {
            res.status(400).send({ error: "הגעת למכסת 3 העברות לספק עבור פנייה זו" });
            return;
        }
        const phoneNumberId = ticketData.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
        let cleanPhone = String(vendorPhone).replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) {
            cleanPhone = "972" + cleanPhone.substring(1);
        }
        const tenantIdStr = tenantId || ticketData.building_id || ticketData.buildingId || ticketData.tenantId || '';
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantDoc.data() || {};
        const param1_ticketNum = (ticketData.ticketNumber !== undefined && ticketData.ticketNumber !== null) ? String(ticketData.ticketNumber) : String(ticketId);
        const param2_sentBy = sanitizeParam(actorName || "מנהל");
        const param3_building = sanitizeParam(tenantData.name || tenantId);
        const param4_category = sanitizeParam(ticketData.category || "תחזוקה");
        let param5_urgency = "בינונית ⚠️";
        const lowerUrgency = (ticketData.urgency || "").toLowerCase();
        if (lowerUrgency === "high")
            param5_urgency = "גבוהה 🚨";
        else if (lowerUrgency === "low")
            param5_urgency = "נמוכה ℹ️";
        const locParts = [];
        if (ticketData.location && typeof ticketData.location === 'string' && ticketData.location.trim() && ticketData.location.trim() !== 'null') {
            locParts.push(ticketData.location.trim());
        }
        if (ticketData.subLocation && typeof ticketData.subLocation === 'string' && ticketData.subLocation.trim() && ticketData.subLocation.trim() !== 'null') {
            locParts.push(ticketData.subLocation.trim());
        }
        const param6_location = sanitizeParam(locParts.join(" / ") || "לא צוין");
        const param7_summary = sanitizeParam(ticketData.summary || "אין תיאור");
        let param8_image = "אין";
        if (ticketData.imageId && typeof ticketData.imageId === 'string' && ticketData.imageId.length > 5 && ticketData.imageId !== 'null') {
            param8_image = `(https://tiktak2026.web.app/img/${tenantIdStr}/${ticketData.imageId})`;
        }
        const resolvedAudioId = ticketData.audioId || ticketData.audioUrl || ticketData.audio;
        let param9_audio = "אין";
        if (resolvedAudioId && typeof resolvedAudioId === 'string' && resolvedAudioId.length > 5 && resolvedAudioId !== 'null') {
            const audioCleanId = String(resolvedAudioId).replace(/\.[^/.]+$/, "");
            param9_audio = `(https://tiktak2026.web.app/aud/${tenantIdStr}/${audioCleanId})`;
        }
        const templateParams = [
            param1_ticketNum,
            param2_sentBy,
            param3_building,
            param4_category,
            param5_urgency,
            param6_location,
            param7_summary,
            param8_image,
            param9_audio
        ];
        const multiLineMessage = messageText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, ' ').trim();
        const vendorButtons = [
            { id: `VENDOR_ACK_${ticketId}`, title: "קיבלתי את ההודעה" },
            { id: `VENDOR_DONE_${ticketId}`, title: "בוצע" }
        ];
        logger.info(`Forwarding ticket #${ticketData.ticketNumber || ticketId} to vendor ${cleanPhone}...`);
        let apiResult = null;
        try {
            apiResult = await sendWhatsAppTemplate(cleanPhone, "vendor_ticket_dispatch", "he", templateParams, phoneNumberId, token);
            logger.info(`Successfully dispatched approved vendor_ticket_dispatch template to ${cleanPhone}`);
        }
        catch (templateErr) {
            logger.warn(`Approved template vendor_ticket_dispatch failed for vendor ${cleanPhone}, attempting interactive fallback...`, templateErr);
            try {
                apiResult = await sendWhatsAppButtons(cleanPhone, multiLineMessage, vendorButtons, phoneNumberId, token);
                logger.info(`Successfully dispatched interactive fallback vendor message to ${cleanPhone}`);
            }
            catch (interactiveErr) {
                logger.error(`Both template and interactive vendor messages failed for ticket #${ticketData.ticketNumber}:`, interactiveErr);
                const errStr = typeof templateErr === 'string'
                    ? templateErr
                    : (templateErr.message || JSON.stringify(templateErr));
                let userFriendlyMsg = "שליחת הודעת WhatsApp נכשלה מול Meta API.";
                if (errStr.includes("132001") || errStr.includes("does not exist")) {
                    userFriendlyMsg = "תבנית ה-WhatsApp (vendor_ticket_dispatch) עדיין לא אושרה או שאינה קיימת בחשבון Meta WhatsApp Manager בשפה העברית. אנא וודא שהתבנית נוצרה ואושרה ב-Meta.";
                }
                else if (errStr.includes("131026") || errStr.includes("Undeliverable")) {
                    userFriendlyMsg = "מספר הטלפון של הספק אינו זמין בוואטסאפ או שלא ניתן לקבל הודעות במספר זה.";
                }
                else if (errStr.includes("131009") || errStr.includes("132018") || errStr.includes("new-line")) {
                    userFriendlyMsg = "שגיאה בפרמטרים של תבנית WhatsApp. הפרמטר נשלח בפורמט מותאם.";
                }
                else if (errStr.includes('"code":190') || (errStr.includes("OAuthException") && errStr.includes("190"))) {
                    userFriendlyMsg = "פג תוקפו של אסימון הגישה (Access Token) ל-Meta WhatsApp API. יש לחדש את ה-Token בהגדרות השרת.";
                }
                res.status(400).send({ error: userFriendlyMsg });
                return;
            }
        }
        if (ticketData.imageId && typeof ticketData.imageId === 'string' && ticketData.imageId.length > 5 && ticketData.imageId !== 'null') {
            const imageUrl = `https://tiktak2026.web.app/img/${tenantIdStr}/${ticketData.imageId}`;
            try {
                await sendWhatsAppImage(cleanPhone, imageUrl, phoneNumberId, token);
                logger.info(`Dispatched ticket image attachment to vendor ${cleanPhone}: ${imageUrl}`);
            }
            catch (imgErr) {
                logger.error(`Failed to dispatch image attachment to vendor ${cleanPhone}:`, imgErr);
            }
        }
        if (resolvedAudioId && typeof resolvedAudioId === 'string' && resolvedAudioId.length > 5 && resolvedAudioId !== 'null') {
            const audioCleanId = resolvedAudioId.replace(/\.[^/.]+$/, "");
            const bucket = admin.storage().bucket();
            const possibleExts = ['.mp4', '.m4a', '.aac', '.ogg', '.webm'];
            let foundExt = 'mp4';
            let audioFile = null;
            for (const ext of possibleExts) {
                const f = bucket.file(`tenants/${tenantIdStr}/${audioCleanId}${ext}`);
                const [ex] = await f.exists();
                if (ex) {
                    audioFile = f;
                    foundExt = ext.replace('.', '');
                    break;
                }
            }
            if (!audioFile) {
                audioFile = bucket.file(`tenants/${tenantIdStr}/${audioCleanId}`);
            }
            const mimeMap = {
                'mp4': 'audio/mp4',
                'm4a': 'audio/mp4',
                'aac': 'audio/aac',
                'ogg': 'audio/ogg',
                'webm': 'audio/webm'
            };
            const audioContentType = mimeMap[foundExt] || 'audio/mp4';
            let signedAudioUrl = '';
            try {
                const [url] = await audioFile.getSignedUrl({
                    action: 'read',
                    expires: '01-01-2100',
                    responseContentType: audioContentType
                });
                signedAudioUrl = url;
            }
            catch (signErr) {
                logger.warn(`Failed to generate signed URL for audio ${audioCleanId}`, signErr);
            }
            const audioPublicUrl = `https://tiktak2026.web.app/aud/${tenantIdStr}/${audioCleanId}.${foundExt}`;
            try {
                await sendWhatsAppDocument(cleanPhone, audioPublicUrl, `הקלטה_קולית.${foundExt}`, phoneNumberId, token);
                logger.info(`Dispatched ticket audio document attachment to vendor ${cleanPhone}: ${audioPublicUrl}`);
            }
            catch (docErr) {
                logger.error(`Failed to dispatch audio document attachment to vendor ${cleanPhone}:`, docErr);
            }
        }
        const newCount = currentCount + 1;
        const resolvedVendorName = String(vendorName || '').trim() || vendorPhone;
        const newVendorEntry = {
            phone: vendorPhone,
            intlPhone: cleanPhone,
            name: resolvedVendorName,
            status: "ממתין לתשובה מהספק ...",
            sentAt: new Date().toISOString()
        };
        const existingVendors = Array.isArray(ticketData.vendors) ? ticketData.vendors : [];
        const filteredVendors = existingVendors.filter((v) => v.phone !== vendorPhone && v.intlPhone !== cleanPhone);
        const updatedVendors = [...filteredVendors, newVendorEntry];
        await ticketRef.update({
            vendorForwardCount: newCount,
            lastVendorForwardAt: new Date().toISOString(),
            vendors: updatedVendors
        });
        await recordAuditLog({
            tenantId,
            action: "TICKET_FORWARDED_TO_VENDOR",
            level: "INFO",
            actor: {
                uid: actorUid || "admin",
                name: actorName || "מנהל",
                email: actorEmail || undefined,
                type: "admin"
            },
            details: {
                ticketId,
                ticketNumber: ticketData.ticketNumber || "",
                category: ticketData.category || "",
                vendorPhone,
                vendorName: resolvedVendorName,
                formattedPhone: cleanPhone,
                messageText,
                forwardCount: newCount,
                sentViaMetaCloudApi: true,
                forwardedAt: newVendorEntry.sentAt
            }
        });
        res.status(200).send({
            success: true,
            message: "הפנייה הועברה בהצלחה לספק באמצעות Meta WhatsApp Cloud API",
            forwardCount: newCount,
            vendors: updatedVendors,
            metaMessageId: apiResult?.messages?.[0]?.id
        });
    }
    catch (err) {
        logger.error("Exception in forwardTicketToVendor Cloud Function:", err);
        res.status(500).send({ error: err.message || "שליחת הפנייה לספק באמצעות Meta API נכשלה" });
    }
});
exports.submitSupportInquiry = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    try {
        const { tenantId, question, callerUid } = req.body;
        if (!question || typeof question !== "string" || question.trim().length < 5) {
            res.status(400).send({ error: "תוכן השאלה/פנייה חייב להכיל לפחות 5 תווים." });
            return;
        }
        let effectiveUid = callerUid || "";
        let callerEmail = "";
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const idToken = authHeader.split("Bearer ")[1];
                const decoded = await admin.auth().verifyIdToken(idToken);
                effectiveUid = decoded.uid;
                callerEmail = decoded.email || "";
            }
            catch (authErr) {
                logger.warn("Token verification failed, falling back to body callerUid", authErr);
            }
        }
        if (!effectiveUid) {
            res.status(401).send({ error: "משתמש לא מזוהה. אנא התחבר מחדש למערכת." });
            return;
        }
        const rateLimitRef = db.collection("support_rate_limits").doc(effectiveUid);
        const rateLimitDoc = await rateLimitRef.get();
        const now = Date.now();
        if (rateLimitDoc.exists) {
            const lastAt = rateLimitDoc.data()?.lastSubmittedAt || 0;
            const elapsed = now - lastAt;
            if (elapsed < 60000) {
                const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
                res.status(429).send({
                    error: `ניתן לשלוח פנייה אחת בכל דקה. אנא המתן עוד ${waitSeconds} שניות.`,
                    retryAfterSeconds: waitSeconds
                });
                return;
            }
        }
        let adminName = "מנהל מערכת";
        let adminPhone = "";
        let adminEmail = callerEmail;
        let resolvedTenantName = tenantId || "ללא שיוך";
        if (tenantId) {
            try {
                const tenantSnap = await db.collection("tenants").doc(tenantId).get();
                if (tenantSnap.exists) {
                    resolvedTenantName = tenantSnap.data()?.name || tenantId;
                }
                const userSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").doc(effectiveUid).get();
                if (userSnap.exists) {
                    const uData = userSnap.data() || {};
                    const full = `${uData.firstName || ""} ${uData.lastName || ""}`.trim();
                    if (full)
                        adminName = full;
                    if (uData.mobile)
                        adminPhone = uData.mobile;
                    if (uData.email)
                        adminEmail = uData.email;
                }
            }
            catch (profileErr) {
                logger.warn("Could not read admin profile for inquiry:", profileErr);
            }
        }
        if (!adminPhone) {
            try {
                const firebaseUser = await admin.auth().getUser(effectiveUid);
                if (firebaseUser.phoneNumber)
                    adminPhone = firebaseUser.phoneNumber;
                if (!adminEmail && firebaseUser.email)
                    adminEmail = firebaseUser.email;
                if (adminName === "מנהל מערכת" && firebaseUser.displayName)
                    adminName = firebaseUser.displayName;
            }
            catch (uErr) {
            }
        }
        const inquiryRef = db.collection("support_inquiries").doc();
        const cleanQuestion = question.trim();
        const inquiryData = {
            id: inquiryRef.id,
            tenantId: tenantId || "general",
            tenantName: resolvedTenantName,
            uid: effectiveUid,
            adminName,
            adminPhone,
            adminEmail,
            question: cleanQuestion,
            status: "new",
            addressedAt: null,
            addressedBy: null,
            whatsappDispatched: false,
            whatsappError: null,
            createdAt: new Date().toISOString()
        };
        await rateLimitRef.set({
            lastSubmittedAt: now,
            uid: effectiveUid,
            lastInquiryId: inquiryRef.id,
            updatedAt: new Date().toISOString()
        });
        try {
            let supportPhone = process.env.TIKTAK_SUPPORT_PHONE || "";
            try {
                const configDoc = await db.collection("global_config").doc("support").get();
                if (configDoc.exists && configDoc.data()?.whatsappPhone) {
                    supportPhone = configDoc.data()?.whatsappPhone;
                }
            }
            catch (cfgErr) {
                logger.warn("Could not fetch global_config/support", cfgErr);
            }
            if (supportPhone) {
                const cleanPhone = supportPhone.replace(/\D/g, "");
                const token = process.env.WHATSAPP_ACCESS_TOKEN;
                const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
                if (token && cleanPhone) {
                    try {
                        const templateParams = [
                            resolvedTenantName,
                            adminName,
                            adminPhone || "לא צוין",
                            adminEmail || "לא צוין",
                            cleanQuestion
                        ];
                        await sendWhatsAppTemplate(cleanPhone, "admin_support_inquiry", "he", templateParams, phoneNumberId, token);
                        inquiryData.whatsappDispatched = true;
                        logger.info("Sent admin_support_inquiry template to TikTak support", { cleanPhone });
                    }
                    catch (templateError) {
                        logger.warn("Template dispatch failed, falling back to WhatsApp text message:", templateError?.message);
                        try {
                            const formattedText = `🛎️ *פניית תמיכה חדשה ממנהל TikTak*\n\n🏢 *בניין:* ${resolvedTenantName}\n👤 *מנהל:* ${adminName}\n📞 *טלפון:* ${adminPhone || "לא צוין"}\n✉️ *דוא"ל:* ${adminEmail || "לא צוין"}\n\n❓ *תוכן הפנייה:*\n${cleanQuestion}`;
                            await sendWhatsAppText(cleanPhone, formattedText, phoneNumberId, token);
                            inquiryData.whatsappDispatched = true;
                            logger.info("Sent fallback text message to TikTak support", { cleanPhone });
                        }
                        catch (textError) {
                            logger.error("Meta WhatsApp dispatch to support failed completely:", textError);
                            inquiryData.whatsappError = textError?.message || "WhatsApp dispatch failed";
                        }
                    }
                }
            }
            else {
                logger.warn("No support WhatsApp phone number configured in global_config/support or TIKTAK_SUPPORT_PHONE");
            }
        }
        catch (dispatchErr) {
            logger.error("Exception during WhatsApp dispatch to support:", dispatchErr);
            inquiryData.whatsappError = dispatchErr?.message || "Error during dispatch";
        }
        await inquiryRef.set(inquiryData);
        if (adminPhone) {
            let cleanAdminPhone = adminPhone.replace(/\D/g, "");
            if (cleanAdminPhone.startsWith("05")) {
                cleanAdminPhone = "972" + cleanAdminPhone.slice(1);
            }
            const token = process.env.WHATSAPP_ACCESS_TOKEN;
            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
            if (token && cleanAdminPhone) {
                try {
                    const autoReplyText = `שלום ${adminName || "מנהל"},\nקיבלנו את פנייתך למוקד TikTak. צוות התמיכה שלנו יחזור אליך תוך יום עסקים אחד. 🤝`;
                    await sendWhatsAppText(cleanAdminPhone, autoReplyText, phoneNumberId, token);
                    logger.info("Sent auto-reply confirmation to admin sender", { cleanAdminPhone });
                }
                catch (arErr) {
                    logger.warn("Auto-reply to admin sender failed (may be outside 24h window if no template):", arErr?.message);
                }
            }
        }
        await recordAuditLog({
            tenantId: tenantId || "general",
            action: "SUPPORT_INQUIRY_SUBMITTED",
            level: "INFO",
            actor: {
                uid: effectiveUid,
                name: adminName,
                email: adminEmail || undefined,
                type: "admin"
            },
            details: {
                inquiryId: inquiryRef.id,
                tenantName: resolvedTenantName,
                questionLength: cleanQuestion.length,
                whatsappDispatched: inquiryData.whatsappDispatched
            }
        });
        res.status(200).send({
            success: true,
            inquiryId: inquiryRef.id,
            message: "קיבלנו את פנייתך וצוות התמיכה שלנו יחזור אליך תוך יום עסקים אחד."
        });
    }
    catch (err) {
        logger.error("submitSupportInquiry error:", err);
        res.status(500).send({ error: "אירעה שגיאה בעיבוד הפנייה. אנא נסה שוב מאוחר יותר." });
    }
});
//# sourceMappingURL=index.js.map