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
exports.residentApi = void 0;
exports.handleHealth = handleHealth;
exports.handleAnalyzeImage = handleAnalyzeImage;
exports.handleCheckAuth = handleCheckAuth;
exports.handleCreateTicket = handleCreateTicket;
exports.handleSubmitAppFeedback = handleSubmitAppFeedback;
exports.handleLandingMetrics = handleLandingMetrics;
exports.handleGetTenantInfo = handleGetTenantInfo;
exports.handleGetResidentTickets = handleGetResidentTickets;
exports.handleAddResidentComment = handleAddResidentComment;
exports.handleIncrementMeToo = handleIncrementMeToo;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const crypto_1 = require("crypto");
const context_1 = require("../shared/context");
const whatsappService_1 = require("../shared/whatsappService");
const securityGuards_1 = require("../utils/securityGuards");
const aiEngine_1 = require("../utils/aiEngine");
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
async function handleHealth(_req, res) {
    logger.info("Health check requested", { structuredData: true });
    res.send({ status: "ok", timestamp: new Date().toISOString() });
}
async function handleAnalyzeImage(req, res) {
    try {
        const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown-ip";
        const rateLimit = (0, securityGuards_1.checkRateLimit)(`analyzeImage:${clientIp}`, 20, 5 * 60 * 1000);
        if (!rateLimit.allowed) {
            logger.warn("analyzeImage rate limit exceeded", { clientIp });
            res.status(429).send({ error: "חריגה ממספר הדיווחים המותר. אנא המתן מספר דקות לפני ניסיון חוזר." });
            return;
        }
        const { base64Image, mimeType, tenantId, location, subLocation } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        logger.info("analyzeImage started", {
            clientIp,
            mimeType,
            imageSize: base64Image ? base64Image.length : 0,
            hasApiKey: !!apiKey
        });
        const appCheckToken = req.headers["x-firebase-appcheck"];
        const appCheckRes = await (0, securityGuards_1.verifyAppCheckHeader)(appCheckToken, process.env.APP_CHECK_STRICT === "true");
        if (!appCheckRes.valid) {
            logger.warn("analyzeImage App Check rejected request", { clientIp, error: appCheckRes.error });
            res.status(401).send({ error: appCheckRes.error || "Unauthorized App Check" });
            return;
        }
        if (!base64Image) {
            logger.error("No image provided in request body");
            res.status(400).send({ error: "No image provided" });
            return;
        }
        if (typeof base64Image !== "string" || base64Image.length > 5 * 1024 * 1024) {
            logger.warn("analyzeImage payload too large", { size: base64Image?.length, clientIp });
            res.status(413).send({ error: "Payload too large. Maximum image size is 5MB." });
            return;
        }
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(base64Image, "base64");
        }
        catch {
            res.status(400).send({ error: "Invalid base64 encoding" });
            return;
        }
        const validation = (0, securityGuards_1.validateImageBuffer)(imageBuffer);
        if (!validation.valid) {
            logger.warn("analyzeImage rejected invalid file header", { error: validation.error, clientIp });
            res.status(415).send({ error: validation.error || "Unsupported media type" });
            return;
        }
        const effectiveMime = validation.detectedMime || mimeType || "image/jpeg";
        const safeTenantId = tenantId ? String(tenantId).trim() : null;
        if (!safeTenantId) {
            res.status(400).send({ error: "Missing required tenantId" });
            return;
        }
        const tenantDoc = await context_1.db.collection("tenants").doc(safeTenantId).get();
        if (!tenantDoc.exists) {
            logger.warn("analyzeImage requested for non-existent tenant", { tenantId: safeTenantId, clientIp });
            res.status(404).send({ error: "Tenant not found" });
            return;
        }
        const tData = tenantDoc.data() || {};
        if (tData.isActive === false || tData.subscription?.status === "frozen" || tData.subscription?.status === "cancelled") {
            logger.warn("analyzeImage requested for inactive/frozen tenant", { tenantId: safeTenantId, status: tData.subscription?.status });
            res.status(403).send({ error: "Tenant account is inactive or frozen. AI analysis is unavailable." });
            return;
        }
        const imageId = (0, crypto_1.randomUUID)();
        const bucket = context_1.storage.bucket();
        const file = bucket.file(`tenants/${safeTenantId}/${imageId}.jpg`);
        const uploadPromise = file.save(imageBuffer, {
            metadata: { contentType: effectiveMime }
        });
        const lang = tData.language || "he";
        const type = tData.type || "building";
        const rawCategories = tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"];
        const categoriesList = Array.from(new Set(rawCategories.map((c) => String(c).trim()).filter(Boolean)));
        if (!categoriesList.includes("אחר")) {
            categoriesList.push("אחר");
        }
        const entityContext = type === "municipality"
            ? "a public space, street, facility, or municipal infrastructure hazard (e.g. electrical wiring, lighting defect, pothole, street light, waste, safety hazard)"
            : "a building or facility maintenance issue (e.g. electrical wiring, lighting defect, leak, broken bulb, elevator failure, safety hazard)";
        logger.info("Executing Enterprise AI Inference...", { tenantId: safeTenantId, clientIp });
        let finalData = {};
        let isAiFallback = false;
        try {
            const aiResult = await (0, aiEngine_1.classifyMaintenanceIncident)({
                tenantId: safeTenantId,
                categoriesList,
                entityContext,
                language: lang,
                imageBuffer,
                imageMime: effectiveMime
            });
            finalData = {
                is_valid_issue: aiResult.is_valid_issue,
                summary: aiResult.summary,
                category: aiResult.category,
                urgency: aiResult.urgency
            };
            await (0, context_1.recordAuditLog)({
                tenantId: safeTenantId,
                action: "AI_IMAGE_ANALYSIS",
                level: "INFO",
                actor: { uid: "system", name: "TikTak AI", type: "system" },
                details: {
                    engine: aiResult.telemetry.engine,
                    model: aiResult.telemetry.model,
                    promptTokens: aiResult.telemetry.promptTokens,
                    candidatesTokens: aiResult.telemetry.candidatesTokens,
                    totalTokens: aiResult.telemetry.totalTokens,
                    durationMs: aiResult.telemetry.durationMs,
                    category: aiResult.category,
                    urgency: aiResult.urgency,
                    is_valid_issue: aiResult.is_valid_issue,
                    appCheckValid: appCheckRes.valid
                }
            });
        }
        catch (aiErr) {
            logger.warn("AI Classification failed, falling back to manual ticket defaults", {
                tenantId: safeTenantId,
                message: aiErr.message
            });
            isAiFallback = true;
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
        finalData.status = "open";
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
}
async function handleCheckAuth(req, res) {
    try {
        const { tenantId, reporterPhone } = req.body;
        if (!tenantId || !reporterPhone) {
            res.status(400).send({ authorized: false, error: "Missing tenantId or reporterPhone" });
            return;
        }
        const tenantDoc = await context_1.db.collection("tenants").doc(tenantId).get();
        const tenantType = tenantDoc.data()?.type || 'building';
        const contactTarget = tenantType === 'municipality' ? 'למוקד' : 'לוועד הבית';
        const { authorized } = await (0, context_1.findAndValidateReporter)(tenantId, reporterPhone);
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
}
async function handleCreateTicket(req, res) {
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
                const bucket = context_1.storage.bucket();
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
        const tenantDoc = await context_1.db.collection("tenants").doc(tenantId).get();
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
        if (tenantData.parentEnterpriseId) {
            const parentDoc = await context_1.db.collection("tenants").doc(tenantData.parentEnterpriseId).get();
            if (parentDoc.exists) {
                const parentData = parentDoc.data() || {};
                if (parentData.isActive === false || parentData.subscription?.status === 'frozen' || parentData.subscription?.status === 'cancelled') {
                    res.status(403).send({
                        error: "Fleet Frozen",
                        message: `מתחם האב של מבנה זה מוקפא זמנית. אנא פנה להנהלת המתחם להפעלת החשבון.`
                    });
                    return;
                }
            }
        }
        const { authorized, reporterName, cleanPhone } = await (0, context_1.findAndValidateReporter)(tenantId, reporterPhone);
        if (!authorized) {
            res.status(403).send({
                error: "Unauthorized",
                message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
            });
            return;
        }
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const recentTickets = await context_1.db.collection("tenants")
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
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
        const ticketsCol = context_1.db.collection("tenants").doc(tenantId).collection("tickets");
        const ticketRef = ticketsCol.doc((0, crypto_1.randomUUID)());
        const ticketId = ticketRef.id;
        let ticketNumber = 0;
        try {
            ticketNumber = await context_1.db.runTransaction(async (transaction) => {
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
                await context_1.db.collection("global_stats").doc("counters").set({
                    totalTicketsCount: context_1.admin.firestore.FieldValue.increment(1)
                }, { merge: true });
            }
            catch (err) {
                logger.error("Failed to increment global tickets counter", { error: err.message });
            }
            try {
                await context_1.db.collection("tenants").doc(tenantId).set({
                    subscription: {
                        currentCycleTicketCount: context_1.admin.firestore.FieldValue.increment(1)
                    }
                }, { merge: true });
                const freshTenantSnap = await context_1.db.collection("tenants").doc(tenantId).get();
                if (freshTenantSnap.exists) {
                    await (0, whatsappService_1.checkAndDispatchQuotaAlerts)(tenantId, freshTenantSnap.data());
                }
            }
            catch (subErr) {
                logger.error("Failed to increment tenant subscription ticket counter in createTicket", { tenantId, error: subErr.message });
            }
            if (req.body.audioBase64) {
                const bucket = context_1.admin.storage().bucket();
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
            await (0, context_1.recordAuditLog)({
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
            await (0, whatsappService_1.sendWhatsAppNotification)({
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
                await (0, whatsappService_1.sendResidentWhatsAppNotification)({
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
            await (0, context_1.recordAuditLog)({
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
}
async function handleSubmitAppFeedback(req, res) {
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
        const ticketRef = context_1.db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
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
            await context_1.db.collection("global_stats").doc("counters").set({
                ratingSum: context_1.admin.firestore.FieldValue.increment(rating),
                ratingCount: context_1.admin.firestore.FieldValue.increment(1),
                [`ratingCount_${rating}`]: context_1.admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        }
        catch (err) {
            logger.error("Failed to update global stats rating", { error: err.message });
        }
        const ticketData = docSnap.data();
        await (0, context_1.recordAuditLog)({
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
}
async function handleLandingMetrics(_req, res) {
    try {
        const statsDoc = await context_1.db.collection("global_stats").doc("counters").get();
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
}
async function handleGetTenantInfo(req, res) {
    const { tenantId } = req.query;
    if (!tenantId) {
        res.status(400).send({ error: "Missing tenantId" });
        return;
    }
    try {
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
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
        let isFrozen = tData?.isActive === false || tData?.subscription?.status === 'frozen';
        if (!isFrozen && tData?.parentEnterpriseId) {
            try {
                const parentDoc = await context_1.db.collection("tenants").doc(tData.parentEnterpriseId).get();
                if (parentDoc.exists) {
                    const pData = parentDoc.data();
                    if (pData?.isActive === false || pData?.subscription?.status === 'frozen') {
                        isFrozen = true;
                    }
                }
            }
            catch (pErr) {
                logger.warn("Could not check parent enterprise freeze status in getTenantInfo", pErr);
            }
        }
        logger.info("Returning tenant info with admins", {
            tenantId,
            hasQuickTap: !!tData?.quickTap,
            quickTapEnabled: tData?.quickTap?.enabled,
            adminCount: admins.length,
            isFrozen
        });
        res.send({
            ...tData,
            isFrozen,
            admins
        });
    }
    catch (error) {
        logger.error("Database error in getTenantInfo", { error });
        res.status(500).send({ error: "Database error" });
    }
}
async function handleGetResidentTickets(req, res) {
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
        const { authorized, cleanPhone } = await (0, context_1.findAndValidateReporter)(tenantId, reporterPhone);
        if (!authorized) {
            const tenantDoc = await context_1.db.collection("tenants").doc(tenantId).get();
            const tenantType = tenantDoc.data()?.type || 'building';
            const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';
            res.status(403).send({
                error: "Unauthorized",
                message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
            });
            return;
        }
        const allTicketsSnap = await context_1.db.collection("tenants")
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
}
async function handleAddResidentComment(req, res) {
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
        const { authorized: commentAuth, reporterName: rName, cleanPhone: cPhone } = await (0, context_1.findAndValidateReporter)(tenantId, reporterPhone);
        if (!commentAuth) {
            res.status(403).send({ error: "Unauthorized" });
            return;
        }
        const ticketRef = context_1.db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
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
            timeline: context_1.admin.firestore.FieldValue.arrayUnion(commentObj),
            adminComments: context_1.admin.firestore.FieldValue.arrayUnion(adminCommentObj),
            updatedAt: new Date().toISOString()
        });
        const auditMsg = `Resident added comment to ticket #${ticketNumber} in building ${tenantId}`;
        await (0, context_1.recordAuditLog)({
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
}
async function handleIncrementMeToo(req, res) {
    try {
        const { tenantId, ticketId, reporterPhone } = req.body;
        if (!tenantId || !ticketId || !reporterPhone) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const { authorized: meTooAuth, reporterName: meTooReporterName, cleanPhone: meTooCleanPhone } = await (0, context_1.findAndValidateReporter)(tenantId, reporterPhone);
        if (!meTooAuth) {
            res.status(403).send({ error: "Unauthorized" });
            return;
        }
        const ticketRef = context_1.db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
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
            await (0, context_1.recordAuditLog)({
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
        await (0, context_1.recordAuditLog)({
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
}
exports.residentApi = (0, https_1.onRequest)({ cors: true, secrets: ["GEMINI_API_KEY", "WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    const endpoint = (0, context_1.resolveEndpointName)(req);
    switch (endpoint) {
        case "health":
            return handleHealth(req, res);
        case "landingMetrics":
            return handleLandingMetrics(req, res);
        case "buildingInfo":
        case "getTenantInfo":
            return handleGetTenantInfo(req, res);
        case "checkAuth":
            return handleCheckAuth(req, res);
        case "analyzeImage":
            return handleAnalyzeImage(req, res);
        case "createTicket":
            return handleCreateTicket(req, res);
        case "submitAppFeedback":
            return handleSubmitAppFeedback(req, res);
        case "getResidentTickets":
            return handleGetResidentTickets(req, res);
        case "addResidentComment":
            return handleAddResidentComment(req, res);
        case "incrementMeToo":
            return handleIncrementMeToo(req, res);
        default:
            res.status(404).send({ error: `Unknown residentApi endpoint: ${endpoint}` });
    }
});
//# sourceMappingURL=residentApi.js.map