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
exports.whatsappWebhook = exports.onTicketUpdate = exports.manageTenantUser = exports.getAudio = exports.getImage = exports.getTenantInfo = exports.landingMetrics = exports.submitAppFeedback = exports.createTicket = exports.checkAuth = exports.analyzeImage = exports.health = exports.slaCron = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const slaEngine_1 = require("./utils/slaEngine");
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
        await uploadPromise;
        const finalData = JSON.parse(cleanJson || "{}");
        finalData.imageId = imageId;
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
            category: finalData.category
        });
        res.send(finalData);
    }
    catch (error) {
        logger.error("AI Analysis failed", {
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
        const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
        if (!reporterDoc.exists) {
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
        formattedLocation = locationParts.join("\n");
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
                        { type: "text", text: params.tenantName },
                        { type: "text", text: String(params.ticketNumber) },
                        { type: "text", text: params.category },
                        { type: "text", text: severityHebrew },
                        { type: "text", text: params.summary || "אין תיאור" },
                        { type: "text", text: formattedLocation },
                        { type: "text", text: params.reporterName || "תושב/ת" }
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
                        code: templateName.startsWith("resident_submit_ticket_") ? "en" : "he"
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
    const parameters = [
        { type: "text", text: String(params.ticketNumber) },
        { type: "text", text: params.category },
        { type: "text", text: formattedLocation }
    ];
    if (params.templateName === "ticket_resolved") {
        let reasonHebrew = translateClosureReason(params.closureReason || "fixed");
        if (params.resolutionNote && params.resolutionNote.trim()) {
            reasonHebrew += ` (${params.resolutionNote.trim()})`;
        }
        parameters.push({ type: "text", text: reasonHebrew });
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
exports.createTicket = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    try {
        const { tenantId, imageId, summary, category, urgency, location, subLocation, ticketType, reporterPhone, source } = req.body;
        if (!tenantId) {
            res.status(400).send({ error: "Missing tenantId" });
            return;
        }
        if (!reporterPhone) {
            res.status(400).send({ error: "Missing reporter phone number" });
            return;
        }
        const isRealImage = imageId && typeof imageId === 'string' && !imageId.startsWith('hidden-');
        const finalImageId = isRealImage ? imageId : null;
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        const tenantType = tenantDoc.data()?.type || 'building';
        const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';
        const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
        if (!reporterDoc.exists) {
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
        const ticketRef = isRealImage ? ticketsCol.doc(imageId) : ticketsCol.doc((0, crypto_1.randomUUID)());
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
                    source: source || (isRealImage ? 'ai_camera' : 'manual'),
                    imageId: finalImageId,
                    audioId: req.body.audioBase64 ? ticketId : null,
                    reporterPhone: reporterPhone || null,
                    reporterName: reporterDoc.data()?.name || null,
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
            if (req.body.audioBase64) {
                const bucket = admin.storage().bucket();
                const audioFile = bucket.file(`tenants/${tenantId}/${ticketId}.webm`);
                const audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
                logger.info(`Processing audio for ${tenantId}. Buffer size: ${audioBuffer.length} bytes`);
                await audioFile.save(audioBuffer, {
                    metadata: { contentType: "audio/webm" }
                });
                logger.info("Audio note uploaded successfully", { tenantId, ticketId });
            }
            await recordAuditLog({
                tenantId,
                action: 'TICKET_CREATED',
                level: 'INFO',
                actor: {
                    uid: reporterPhone,
                    name: reporterDoc.data()?.name || reporterPhone,
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
                    source: source || (isRealImage ? 'ai_camera' : 'manual'),
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
                reporterName: reporterDoc.data()?.name || null,
                imageId: finalImageId,
                audioId: req.body.audioBase64 ? ticketId : null,
                admins
            });
            if (reporterPhone) {
                await sendResidentWhatsAppNotification({
                    phone: reporterPhone,
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
                reporterName: reporterDoc.data()?.name || reporterPhone
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
                    subLocation: req.body.subLocation
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
        audioId = pathSegments[1];
    }
    if (!tenantId || !audioId || audioId === 'view') {
        res.status(400).send("Invalid audio path format");
        return;
    }
    try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(`tenants/${tenantId}/${audioId}.webm`);
        const [exists] = await file.exists();
        if (!exists) {
            res.status(404).send("Audio not found");
            return;
        }
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '01-01-2100'
        });
        res.redirect(302, url);
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
        if (after.reporterPhone) {
            if (newStatus === 'in-progress') {
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
exports.whatsappWebhook = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
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
                    if (from) {
                        const token = process.env.WHATSAPP_ACCESS_TOKEN;
                        const phoneNumberId = value.metadata?.phone_number_id || "1046588828547584";
                        if (!token) {
                            logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager for auto-reply");
                            res.status(500).send("Access token missing");
                            return;
                        }
                        let isFeedback = false;
                        let feedbackValue = null;
                        if (message.type === 'button') {
                            const payload = (message.button?.payload || '').toLowerCase();
                            const text = message.button?.text || '';
                            if (payload === 'service_feedback_good' || payload.includes('good') || payload.includes('מצוין') || text.includes('מצוין')) {
                                feedbackValue = 'good';
                            }
                            else if (payload === 'service_feedback_ok' || payload.includes('ok') || payload.includes('בסדר') || text.includes('בסדר')) {
                                feedbackValue = 'ok';
                            }
                            else if (payload === 'service_feedback_bad' || payload.includes('bad') || payload.includes('לא מרוצה') || text.includes('לא מרוצה')) {
                                feedbackValue = 'bad';
                            }
                        }
                        if (feedbackValue) {
                            let firestorePhone = from;
                            if (from.startsWith('972') && from.length === 12) {
                                firestorePhone = '0' + from.substring(3);
                            }
                            try {
                                const ticketsQuery = db.collectionGroup("tickets")
                                    .where("reporterPhone", "==", firestorePhone);
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
                                            uid: firestorePhone,
                                            name: targetDoc.data()?.reporterName || 'Resident',
                                            type: 'resident'
                                        },
                                        details: {
                                            ticketId: targetDoc.id,
                                            ticketNumber: targetDoc.data()?.ticketNumber,
                                            rating: feedbackValue
                                        }
                                    });
                                    isFeedback = true;
                                }
                            }
                            catch (e) {
                                logger.error("Failed to update service feedback from WhatsApp webhook", { error: e.message });
                            }
                        }
                        let shouldSendReply = true;
                        let autoReplyText = "";
                        if (message.type === 'button') {
                            if (feedbackValue) {
                                autoReplyText = `תודה על הדירוג! המשוב שלך עוזר לנו לשפר את השירות לתושב/דייר. 🏡`;
                            }
                            else {
                                shouldSendReply = false;
                            }
                        }
                        else {
                            autoReplyText = `🛑 *הודעה אוטומטית מ-TikTak*

ערוץ זה מיועד לשליחת עדכונים אוטומטיים בלבד ואינו מאויש על ידי בני אדם. הודעתך התקבלה אך לא תיקרא ולא תיענה.

לפתיחת דיווח חדש, אנא השתמשו בקישור הייעודי.

תודה, צוות *TikTak*! ⚡`;
                        }
                        if (shouldSendReply) {
                            const payload = {
                                messaging_product: "whatsapp",
                                recipient_type: "individual",
                                to: from,
                                type: "text",
                                text: {
                                    preview_url: false,
                                    body: autoReplyText
                                }
                            };
                            logger.info(`Sending automated response to ${from}...`);
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
                                logger.error(`Meta API returned error during automated reply to ${from}:`, resData);
                            }
                            else {
                                logger.info(`Automated reply successfully sent to ${from}`, { messageId: resData.messages?.[0]?.id });
                            }
                        }
                        else {
                            logger.info(`Button click but not feedback or no auto-reply required for ${from}, skipping response.`);
                        }
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
//# sourceMappingURL=index.js.map