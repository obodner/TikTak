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
exports.whatsappWebhook = void 0;
exports.transcribeAudioWhisper = transcribeAudioWhisper;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const generative_ai_1 = require("@google/generative-ai");
const crypto_1 = require("crypto");
const context_1 = require("../shared/context");
const whatsappService_1 = require("../shared/whatsappService");
const i18n_1 = require("../utils/i18n");
const securityGuards_1 = require("../utils/securityGuards");
const aiEngine_1 = require("../utils/aiEngine");
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
    if (audioBuffer.length > 5 * 1024 * 1024) {
        throw new Error("Audio buffer exceeds maximum allowed size of 5MB");
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 300
        }
    });
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
    const tenantDoc = await context_1.db.collection("tenants").doc(params.tenantId).get();
    const tData = tenantDoc.data() || {};
    const rawCategories = tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"];
    const lang = tData.language || "he";
    const type = tData.type || "building";
    const entityContext = type === "municipality"
        ? "a public space, street, facility, or municipal infrastructure hazard (e.g. electrical wiring, lighting defect, pothole, street light, waste, safety hazard)"
        : "a building or facility maintenance issue (e.g. electrical wiring, lighting defect, leak, broken bulb, elevator failure, safety hazard)";
    try {
        const aiResult = await (0, aiEngine_1.classifyMaintenanceIncident)({
            tenantId: params.tenantId,
            categoriesList: rawCategories,
            entityContext,
            language: lang,
            imageBuffer: params.imageBuffer,
            imageMime: params.imageMime,
            textInput: params.textInput
        });
        await (0, context_1.recordAuditLog)({
            tenantId: params.tenantId,
            action: "AI_INCIDENT_CLASSIFICATION",
            level: "INFO",
            actor: { uid: "system", name: "TikTak AI", type: "system" },
            details: {
                channel: "whatsapp",
                engine: aiResult.telemetry.engine,
                model: aiResult.telemetry.model,
                promptTokens: aiResult.telemetry.promptTokens,
                candidatesTokens: aiResult.telemetry.candidatesTokens,
                totalTokens: aiResult.telemetry.totalTokens,
                durationMs: aiResult.telemetry.durationMs,
                category: aiResult.category,
                urgency: aiResult.urgency,
                is_valid_issue: aiResult.is_valid_issue
            }
        });
        return {
            is_valid_issue: aiResult.is_valid_issue,
            summary: aiResult.summary,
            category: aiResult.category,
            urgency: aiResult.urgency
        };
    }
    catch (err) {
        logger.warn("analyzeIncidentAI fallback", { tenantId: params.tenantId, error: err.message });
        return {
            is_valid_issue: true,
            summary: lang === "he" ? "דיווח תחזוקה" : "Maintenance issue",
            category: rawCategories[0] || "אחר",
            urgency: "Low"
        };
    }
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
    await (0, whatsappService_1.sendWhatsAppButtons)(to, previewText, buttons, phoneNumberId, token);
}
async function promptPrioritySelection(session, from, phoneNumberId, token) {
    session.state = 'AWAITING_PRIORITY';
    await (0, whatsappService_1.sendWhatsAppButtons)(from, "אנא בחר את רמת הדחיפות של המפגע:", [
        { id: "select_priority:Low", title: "רגילה (נמוכה) 🟢" },
        { id: "select_priority:Moderate", title: "בינונית 🟡" },
        { id: "select_priority:High", title: "דחופה 🚨" }
    ], phoneNumberId, token);
}
async function proceedToLocationOrVerification(session, from, phoneNumberId, token) {
    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
        await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
    }
    else if (hasSubLocations) {
        session.state = 'AWAITING_SUBLOCATION';
        session.pagination = {
            items: subLocations,
            pageIndex: 0,
            fieldType: 'sublocation'
        };
        const paginatedList = buildPaginatedList(subLocations, 0, 'sublocation', tData.uiConfig, false);
        await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
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
async function promptCategorySelection(session, from, phoneNumberId, token, pageIndex = 0) {
    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
    const tData = tenantSnap.data() || {};
    const categories = tData.config?.categories || [];
    if (categories.length > 0) {
        session.state = 'AWAITING_CATEGORY';
        if (categories.length <= 3) {
            const buttons = categories.map((cat) => ({
                id: `select_category:${cat}`,
                title: cat.substring(0, 20)
            }));
            await (0, whatsappService_1.sendWhatsAppButtons)(from, "אנא בחר קטגוריה מתאימה לדיווח:", buttons, phoneNumberId, token);
        }
        else {
            const PAGE_SIZE = 8;
            const totalPages = Math.ceil(categories.length / PAGE_SIZE);
            const safePageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
            const startIndex = safePageIndex * PAGE_SIZE;
            const sliced = categories.slice(startIndex, startIndex + PAGE_SIZE);
            const rows = sliced.map((cat) => ({
                id: `select_category:${cat}`,
                title: `בחירה: ${cat}`.substring(0, 24)
            }));
            if (safePageIndex < totalPages - 1) {
                rows.push({
                    id: `nav:next:category:${safePageIndex + 1}`,
                    title: "➡️ לעמוד הבא",
                    description: `הצג עמוד ${safePageIndex + 2} מתוך ${totalPages}`
                });
            }
            if (safePageIndex > 0) {
                rows.push({
                    id: `nav:prev:category:${safePageIndex - 1}`,
                    title: "< חזרה",
                    description: `חזור לעמוד ${safePageIndex}`
                });
            }
            session.pagination = { items: categories, pageIndex: safePageIndex, fieldType: 'category' };
            const listPayload = {
                type: "interactive",
                interactive: {
                    type: "list",
                    header: { type: "text", text: "בחירת קטגוריית הדיווח" },
                    body: {
                        text: totalPages > 1
                            ? `אנא בחר את הקטגוריה המתאימה (עמוד ${safePageIndex + 1} מתוך ${totalPages}):`
                            : "אנא בחר את הקטגוריה המתאימה ביותר מהרשימה:"
                    },
                    action: {
                        button: "בחר קטגוריה",
                        sections: [{
                                title: totalPages > 1 ? `קטגוריות (עמוד ${safePageIndex + 1}/${totalPages})` : "קטגוריות זמינות",
                                rows: rows
                            }]
                    }
                }
            };
            await (0, whatsappService_1.sendWhatsAppMessage)(from, listPayload, phoneNumberId, token);
        }
    }
    else {
        session.draftTicket.category = "אחר";
        await proceedToLocationOrVerification(session, from, phoneNumberId, token);
    }
}
exports.whatsappWebhook = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN", "GEMINI_API_KEY", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"] }, async (req, res) => {
    if (req.method === "GET") {
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];
        const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "tiktak_webhook_verify_token_2026";
        if (mode === "subscribe" && token === expectedVerifyToken) {
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
        const signature = req.headers["x-hub-signature-256"];
        const sigCheck = (0, securityGuards_1.verifyMetaWebhookSignature)(req.rawBody, signature, process.env.WHATSAPP_APP_SECRET);
        if (!sigCheck.valid) {
            logger.warn("WhatsApp Webhook rejected: signature mismatch or missing", { reason: sigCheck.reason });
            res.status(401).send("Unauthorized: Invalid webhook signature");
            return;
        }
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
                            localPhone = (0, context_1.normalizePhoneNumber)(from);
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
                                const rawDigits = from.replace(/\D/g, '');
                                const localWithoutZero = localPhone.startsWith('0') ? localPhone.substring(1) : localPhone;
                                const dashFormat1 = localPhone.length === 10 ? `${localPhone.slice(0, 3)}-${localPhone.slice(3)}` : '';
                                const dashFormat2 = localPhone.length === 10 ? `${localPhone.slice(0, 3)}-${localPhone.slice(3, 6)}-${localPhone.slice(6)}` : '';
                                const phoneVariants = Array.from(new Set([
                                    localPhone,
                                    rawDigits,
                                    `+${rawDigits}`,
                                    `972${localWithoutZero}`,
                                    `+972${localWithoutZero}`,
                                    from,
                                    dashFormat1,
                                    dashFormat2
                                ])).filter(Boolean);
                                const ticketsQuery = context_1.db.collectionGroup("tickets").where("reporterPhone", "in", phoneVariants);
                                const querySnapshot = await ticketsQuery.get();
                                const getTimestampMs = (val) => {
                                    if (!val)
                                        return 0;
                                    if (typeof val.toDate === 'function')
                                        return val.toDate().getTime();
                                    if (typeof val.toMillis === 'function')
                                        return val.toMillis();
                                    if (typeof val === 'number')
                                        return val;
                                    const parsed = Date.parse(val);
                                    return isNaN(parsed) ? 0 : parsed;
                                };
                                const allMatchingTickets = querySnapshot.docs.filter(doc => {
                                    const data = doc.data();
                                    return ['resolved', 'dismissed', 'closed'].includes(data.status);
                                });
                                let candidates = allMatchingTickets.filter(doc => !doc.data().vaadRating);
                                if (candidates.length === 0) {
                                    candidates = allMatchingTickets;
                                }
                                candidates.sort((a, b) => {
                                    const aData = a.data();
                                    const bData = b.data();
                                    const aResolvedAt = getTimestampMs(aData.lastStatusChangeAt) || getTimestampMs(aData.updatedAt) || getTimestampMs(aData.createdAt);
                                    const bResolvedAt = getTimestampMs(bData.lastStatusChangeAt) || getTimestampMs(bData.updatedAt) || getTimestampMs(bData.createdAt);
                                    return bResolvedAt - aResolvedAt;
                                });
                                if (candidates.length > 0) {
                                    const targetDoc = candidates[0];
                                    const pathParts = targetDoc.ref.path.split('/');
                                    const tenantId = pathParts[1];
                                    const tData = targetDoc.data();
                                    await targetDoc.ref.update({
                                        vaadRating: feedbackValue,
                                        vaadRatedAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString()
                                    });
                                    await (0, context_1.recordAuditLog)({
                                        tenantId,
                                        action: 'SERVICE_FEEDBACK_SUBMITTED',
                                        level: 'INFO',
                                        actor: {
                                            uid: localPhone,
                                            name: tData.reporterName || 'Resident',
                                            type: 'resident'
                                        },
                                        details: {
                                            ticketId: targetDoc.id,
                                            ticketNumber: tData.ticketNumber,
                                            rating: feedbackValue
                                        }
                                    });
                                    logger.info("Successfully updated service feedback rating on ticket", {
                                        ticketId: targetDoc.id,
                                        tenantId,
                                        ticketNumber: tData.ticketNumber,
                                        rating: feedbackValue,
                                        phone: localPhone
                                    });
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "תודה על הדירוג! המשוב שלך עוזר לנו לשפר את השירות לתושב/דייר. 🏡", phoneNumberId, token);
                                }
                                else {
                                    logger.warn("Received service feedback rating, but could not match any resolved ticket", {
                                        localPhone,
                                        from,
                                        feedbackValue,
                                        totalFoundTickets: querySnapshot.size
                                    });
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "תודה על הדירוג! המשוב שלך נקלט במערכת. 🏡", phoneNumberId, token);
                                }
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
                                const contextMessageId = message.context?.id || null;
                                logger.info(`Received vendor button click '${vendorResponseText}' from phone ${localPhone} (raw: ${from}), extractedTicketId: ${extractedTicketId || 'none'}, contextMessageId: ${contextMessageId || 'none'}`);
                                const querySnapshot = await context_1.db.collectionGroup("tickets").get();
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
                                if (contextMessageId) {
                                    target = matches.find(m => m.vItem.whatsappMessageId && m.vItem.whatsappMessageId === contextMessageId) || null;
                                }
                                if (!target && extractedTicketId) {
                                    target = matches.find(m => m.docSnap.id === extractedTicketId) || null;
                                }
                                if (!target && !contextMessageId && !extractedTicketId && matches.length > 0) {
                                    const isDone = vendorResponseText === 'בוצע';
                                    const pendingMatches = matches.filter(m => {
                                        const ticketStatus = String(m.tData.status || '').toLowerCase();
                                        if (['resolved', 'dismissed', 'closed'].includes(ticketStatus)) {
                                            return false;
                                        }
                                        if (contextMessageId && m.vItem.whatsappMessageId && m.vItem.whatsappMessageId !== contextMessageId) {
                                            return false;
                                        }
                                        return isDone
                                            ? m.vItem.status !== 'בוצע'
                                            : (m.vItem.status !== 'בוצע' && m.vItem.status !== 'קיבלתי את ההודעה' && m.vItem.status !== 'קבלתי את ההודעה');
                                    });
                                    if (pendingMatches.length > 0) {
                                        pendingMatches.sort((a, b) => b.sentAtMs - a.sentAtMs);
                                        target = pendingMatches[0];
                                    }
                                }
                                if (!target) {
                                    const currentProject = process.env.GCLOUD_PROJECT || "";
                                    const alreadyRelayed = Boolean(req.headers["x-tiktak-relayed"]);
                                    if (currentProject === "tiktak2026" && !alreadyRelayed) {
                                        const stgWebhookUrl = "https://us-central1-tiktak-stg.cloudfunctions.net/whatsappWebhook";
                                        logger.info(`No matching active vendor ticket found in ${currentProject} for ${localPhone}; relaying webhook to staging (${stgWebhookUrl})...`);
                                        try {
                                            const relayHeaders = {
                                                "Content-Type": "application/json",
                                                "x-tiktak-relayed": "true"
                                            };
                                            if (signature) {
                                                relayHeaders["x-hub-signature-256"] = signature;
                                            }
                                            const rawPayload = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(body), "utf-8");
                                            const relayRes = await fetch(stgWebhookUrl, {
                                                method: "POST",
                                                headers: relayHeaders,
                                                body: new Uint8Array(rawPayload)
                                            });
                                            logger.info(`Relayed vendor webhook to staging with status ${relayRes.status}`);
                                        }
                                        catch (relayErr) {
                                            logger.error("Failed to relay vendor webhook to staging", { error: relayErr.message });
                                        }
                                    }
                                    else {
                                        logger.warn(`No matching pending vendor ticket found in ${currentProject} for phone ${localPhone} (contextMessageId: ${contextMessageId || 'none'}). Ignoring without triggering resident bot.`);
                                    }
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                                if (target) {
                                    const { docSnap, tData, vIndex, vItem } = target;
                                    const isDone = vendorResponseText === 'בוצע';
                                    if ((isDone && vItem.status === 'בוצע') || (!isDone && (vItem.status === 'קיבלתי את ההודעה' || vItem.status === 'קבלתי את ההודעה' || vItem.status === 'בוצע'))) {
                                        logger.info(`Vendor ${localPhone} clicked '${vendorResponseText}' on ticket #${tData.ticketNumber || docSnap.id}, which is already in status '${vItem.status}'. Skipping duplicate update.`);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
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
                                    await (0, context_1.recordAuditLog)({
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, `תודה! העדכון שלך ("${vendorResponseText}") עבור פנייה #${tData.ticketNumber || docSnap.id} נקלט בהצלחה במערכת TikTak. 🛠️`, phoneNumberId, token);
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                            }
                            catch (err) {
                                logger.error("Failed to process vendor button response", { error: err.message });
                            }
                        }
                        const sessionRef = context_1.db.collection("sessions").doc(localPhone);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "מערכת TikTak זיהתה קצב הודעות גבוה. אנא המתן 30 שניות לפני שליחת הודעה נוספת.", phoneNumberId, token);
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
                            await (0, whatsappService_1.sendWhatsAppText)(from, "התהליך בוטל בהצלחה. תוכל להתחיל תהליך חדש בכל עת.", phoneNumberId, token);
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
                            const lang = session.tenantId ? (await context_1.db.collection("tenants").doc(session.tenantId).get()).data()?.language : "he";
                            let glitchKey = "whatsapp_glitch_generic";
                            if (session.state === "AWAITING_TENANT_SELECTION") {
                                glitchKey = "whatsapp_glitch_tenant";
                            }
                            else if (session.state === "MAIN_MENU") {
                                glitchKey = "whatsapp_glitch_menu";
                            }
                            await (0, whatsappService_1.sendWhatsAppText)(from, (0, i18n_1.t)(glitchKey, lang), phoneNumberId, token);
                            session.updatedAt = nowIso;
                            await sessionRef.set(session);
                            res.status(200).send("EVENT_RECEIVED");
                            return;
                        }
                        switch (session.state) {
                            case 'START': {
                                let whitelistQuery = await context_1.db.collectionGroup("reporters").where("phone", "==", localPhone).get();
                                let docsToProcess = whitelistQuery.docs;
                                if (whitelistQuery.empty) {
                                    const adminQuery = await context_1.db.collectionGroup("adminUsers").get();
                                    docsToProcess = adminQuery.docs.filter(doc => {
                                        const mob = doc.data().mobile;
                                        if (!mob)
                                            return false;
                                        let cleanMob = mob.trim();
                                        try {
                                            cleanMob = (0, context_1.normalizePhoneNumber)(mob);
                                        }
                                        catch {
                                            cleanMob = mob.replace(/\D/g, '');
                                        }
                                        return cleanMob === localPhone;
                                    });
                                }
                                if (docsToProcess.length === 0) {
                                    await (0, whatsappService_1.sendWhatsAppText)(from, (0, i18n_1.t)("not_registered", "he"), phoneNumberId, token);
                                    session.state = 'START';
                                }
                                else if (docsToProcess.length === 1) {
                                    const rDoc = docsToProcess[0];
                                    const tId = rDoc.ref.path.split('/')[1];
                                    const tenantSnap = await context_1.db.collection("tenants").doc(tId).get();
                                    const tData = tenantSnap.data() || {};
                                    const rData = rDoc.data() || {};
                                    session.tenantId = tId;
                                    session.tenantName = tData.name || tId;
                                    session.reporterName = `${rData.firstName || ''} ${rData.lastName || ''}`.trim() || rData.name || "תושב/דייר";
                                    session.state = 'MAIN_MENU';
                                    await (0, whatsappService_1.sendWhatsAppButtons)(from, `שלום! ברוכים הבאים למערכת הדיווחים של *${session.tenantName}*. כיצד נוכל לעזור היום?\n\nבכל שלב, אם תרצה לצאת מהתהליך רשום *צא* או *ביטול*.`, [
                                        { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                        { id: "menu_quicktap", title: "⚡ דיווח מהיר" },
                                        { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                    ], phoneNumberId, token);
                                }
                                else {
                                    const candidates = [];
                                    for (const docRef of docsToProcess) {
                                        const tId = docRef.ref.path.split('/')[1];
                                        const tenantSnap = await context_1.db.collection("tenants").doc(tId).get();
                                        candidates.push({ id: tId, name: tenantSnap.data()?.name || tId });
                                    }
                                    session.state = 'AWAITING_TENANT_SELECTION';
                                    session.candidates = candidates;
                                    const buttons = candidates.slice(0, 3).map(c => ({
                                        id: `select_tenant:${c.id}`,
                                        title: c.name
                                    }));
                                    await (0, whatsappService_1.sendWhatsAppButtons)(from, (0, i18n_1.t)("select_tenant_title", "he"), buttons, phoneNumberId, token);
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
                                    const tenantSnap = await context_1.db.collection("tenants").doc(tId).get();
                                    const tData = tenantSnap.data() || {};
                                    session.tenantId = tId;
                                    session.tenantName = tData.name || tId;
                                    session.state = 'MAIN_MENU';
                                    delete session.candidates;
                                    await (0, whatsappService_1.sendWhatsAppButtons)(from, `שלום! ברוכים הבאים למערכת הדיווחים של *${session.tenantName}*. כיצד נוכל לעזור היום?`, [
                                        { id: "menu_report_image", title: "📸 דיווח עם תמונה" },
                                        { id: "menu_quicktap", title: "⚡ דיווח מהיר" },
                                        { id: "menu_report_no_image", title: "🎙️ דיווח ללא תמונה" }
                                    ], phoneNumberId, token);
                                }
                                else {
                                    await (0, whatsappService_1.sendWhatsAppText)(from, (0, i18n_1.t)("select_tenant_fallback", "he"), phoneNumberId, token);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא שלח תמונה ברורה של המפגע (גודל קובץ מקסימלי: 2MB).", phoneNumberId, token);
                                }
                                else if (isQuickTap) {
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
                                    const tenantData = tenantSnap.data() || {};
                                    const type = tenantData.type || 'building';
                                    const quickTapConfig = tenantData.quickTap || {};
                                    const hasItems = quickTapConfig.items && quickTapConfig.items.length > 0;
                                    const isEnabled = quickTapConfig.enabled !== false;
                                    if (!hasItems || !isEnabled) {
                                        const lang = tenantData.language || 'he';
                                        const configKey = type === 'municipality' ? 'no_quicktap_config_municipality' : 'no_quicktap_config_building';
                                        await (0, whatsappService_1.sendWhatsAppText)(from, (0, i18n_1.t)(configKey, lang), phoneNumberId, token);
                                        await (0, whatsappService_1.sendWhatsAppButtons)(from, "אנא בחר אחת מהאפשרויות הבאות:", [
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
                                            await (0, whatsappService_1.sendWhatsAppButtons)(from, "אנא בחר דיווח מהיר מתוך הכפתורים:", buttons, phoneNumberId, token);
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
                                            await (0, whatsappService_1.sendWhatsAppMessage)(from, listPayload, phoneNumberId, token);
                                        }
                                    }
                                }
                                else if (isReportNoImage) {
                                    session.state = 'AWAITING_MEDIA';
                                    session.mediaTypeExpect = 'any_no_image';
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא הקלט הודעה קולית (Voice Note) עד 1MB או הקלד תיאור טקסטואלי של המפגע.", phoneNumberId, token);
                                }
                                else {
                                    await (0, whatsappService_1.sendWhatsAppButtons)(from, "פעולה לא מוכרת. אנא בחר אחת מהאפשרויות הבאות:", [
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
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                        await (0, whatsappService_1.sendWhatsAppButtons)(from, previewText, [
                                            { id: "confirm_ticket", title: "⚡ אשרו ושילחו" },
                                            { id: "cancel_ticket", title: "❌ ביטול" }
                                        ], phoneNumberId, token);
                                    }
                                    else {
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "הדיווח שנבחר אינו תקף.", phoneNumberId, token);
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
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "בחרת בדיווח ללא תמונה. אנא שלח הקלטה קולית או הקלד תיאור טקסטואלי של המפגע.", phoneNumberId, token);
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
                                        const bucket = context_1.storage.bucket();
                                        const imageFile = bucket.file(`tenants/${session.tenantId}/${imageId}.jpg`);
                                        await imageFile.save(imageBuffer, {
                                            metadata: { contentType: imageMime || "image/jpeg" }
                                        });
                                    }
                                    catch (err) {
                                        if (err.message === 'FILE_TOO_LARGE') {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "התמונה ששלחת גדולה מדי. אנא שלח תמונה קטנה מ-2MB.", phoneNumberId, token);
                                        }
                                        else {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "שגיאה בהורדת התמונה. אנא נסה שוב.", phoneNumberId, token);
                                        }
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                }
                                else if (message.type === 'audio') {
                                    if (session.mediaTypeExpect === 'image') {
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "בחרת בדיווח עם תמונה. אנא צלם או שלח תמונה של המפגע.", phoneNumberId, token);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    const mediaId = message.audio.id;
                                    try {
                                        const download = await downloadWhatsAppMedia(mediaId, token, 1 * 1024 * 1024);
                                        const audioMime = download.mimeType;
                                        audioId = (0, crypto_1.randomUUID)();
                                        const bucket = context_1.storage.bucket();
                                        const audioFile = bucket.file(`tenants/${session.tenantId}/${audioId}.webm`);
                                        await audioFile.save(download.buffer, {
                                            metadata: { contentType: audioMime }
                                        });
                                        textInput = "";
                                    }
                                    catch (err) {
                                        if (err.message === 'FILE_TOO_LARGE') {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "ההודעה הקולית ארוכה או גדולה מדי. המגבלה היא 1MB.", phoneNumberId, token);
                                        }
                                        else {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "שגיאה בפענוח ההקלטה. אנא נסה להקליט שוב או להקליד טקסט.", phoneNumberId, token);
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
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "בחרת בדיווח עם תמונה. אנא צלם או שלח תמונה של המפגע.", phoneNumberId, token);
                                        res.status(200).send("EVENT_RECEIVED");
                                        return;
                                    }
                                    textInput = messageText;
                                }
                                else {
                                    logger.warn(`WhatsApp received unsupported media type: ${message.type}`, {
                                        from,
                                        tenantId: session.tenantId,
                                        messageType: message.type,
                                        unsupportedFileName: message[message.type]?.filename || null
                                    });
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא שלח תמונה, הקלטה קולית או הודעת טקסט תקינה.", phoneNumberId, token);
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                                if (isImage) {
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "מנתח את הנתונים באמצעות TikTak AI... ⚡", phoneNumberId, token);
                                    try {
                                        const aiResult = await analyzeIncidentAI({
                                            tenantId: session.tenantId,
                                            imageBuffer,
                                            imageMime,
                                            textInput
                                        });
                                        if (!aiResult.is_valid_issue) {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "לא זיהינו מפגע תחזוקה ברור בתמונה ששלחת. אנא נסה לצלם שוב בבירור.", phoneNumberId, token);
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
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "ניתוח ה-AI נכשל זמנית. נעבור להזנת פרטים ישירה.", phoneNumberId, token);
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
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                    await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
                                }
                                else if (interactiveId === "select:location:skip") {
                                    session.draftTicket.location = null;
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                        await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
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
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                        await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "נא לבחור מיקום מתוך הרשימה.", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_SUBLOCATION': {
                                if (interactiveId.startsWith("nav:")) {
                                    const direction = interactiveId.split(":")[1];
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                    await (0, whatsappService_1.sendWhatsAppMessage)(from, { type: "interactive", interactive: paginatedList }, phoneNumberId, token);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "נא לבחור מיקום מדוייק מתוך הרשימה.", phoneNumberId, token);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא בחר דחיפות תקינה מתוך הכפתורים או הקלד (1, 2 או 3).", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_CATEGORY': {
                                if (interactiveId.startsWith("nav:next:category:") || interactiveId.startsWith("nav:prev:category:")) {
                                    const targetPage = parseInt(interactiveId.split(":")[3]) || 0;
                                    await promptCategorySelection(session, from, phoneNumberId, token, targetPage);
                                    break;
                                }
                                let selectedCategory = "";
                                if (interactiveId.startsWith("select_category:")) {
                                    selectedCategory = interactiveId.split(":")[1];
                                }
                                else if (messageText) {
                                    const cleanInput = messageText.trim().toLowerCase();
                                    const tenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא בחר קטגוריה תקינה מהרשימה.", phoneNumberId, token);
                                }
                                break;
                            }
                            case 'AWAITING_VERIFICATION': {
                                if (interactiveId === 'confirm_ticket') {
                                    const draft = session.draftTicket;
                                    if (!draft) {
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "שגיאה: פרטי הטיוטה אבדו.", phoneNumberId, token);
                                        session.state = 'MAIN_MENU';
                                        break;
                                    }
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "יוצר דיווח במערכת... ⚡", phoneNumberId, token);
                                    try {
                                        const tenantRef = context_1.db.collection("tenants").doc(session.tenantId);
                                        const ticketsCol = tenantRef.collection("tickets");
                                        const ticketId = draft.imageId && !draft.imageId.startsWith("hidden-") ? draft.imageId : (0, crypto_1.randomUUID)();
                                        const ticketRef = ticketsCol.doc(ticketId);
                                        const tenantDoc = await tenantRef.get();
                                        const tenantData = tenantDoc.data() || {};
                                        const tenantName = tenantData.name || session.tenantId;
                                        if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen' || tenantData.subscription?.status === 'cancelled') {
                                            const contactTarget = tenantData.type === 'municipality' ? 'המשרד' : 'ועד הבית';
                                            await (0, whatsappService_1.sendWhatsAppText)(from, `חשבון הבניין/יישוב מוקפא זמנית. אנא פנה ל${contactTarget} או לשירות לקוחות TikTak.`, phoneNumberId, token);
                                            session.state = 'START';
                                            break;
                                        }
                                        const rDoc = await tenantRef.collection("reporters").doc(session.phoneNumber).get();
                                        if (!rDoc.exists) {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "אימות נכשל. הטלפון שלך הוסר מרשימת המדווחים.", phoneNumberId, token);
                                            session.state = 'START';
                                            break;
                                        }
                                        const ticketNumber = await context_1.db.runTransaction(async (transaction) => {
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
                                            await context_1.db.collection("global_stats").doc("counters").set({
                                                totalTicketsCount: context_1.admin.firestore.FieldValue.increment(1)
                                            }, { merge: true });
                                        }
                                        catch (statErr) {
                                            logger.error("Stats increment failed in whatsappbot", statErr);
                                        }
                                        try {
                                            await context_1.db.collection("tenants").doc(session.tenantId).set({
                                                subscription: {
                                                    currentCycleTicketCount: context_1.admin.firestore.FieldValue.increment(1)
                                                }
                                            }, { merge: true });
                                            const freshTenantSnap = await context_1.db.collection("tenants").doc(session.tenantId).get();
                                            if (freshTenantSnap.exists) {
                                                await (0, whatsappService_1.checkAndDispatchQuotaAlerts)(session.tenantId, freshTenantSnap.data());
                                            }
                                        }
                                        catch (subErr) {
                                            logger.error("Subscription ticket increment failed in whatsappbot", { tenantId: session.tenantId, error: subErr.message });
                                        }
                                        await (0, context_1.recordAuditLog)({
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
                                        await (0, whatsappService_1.sendWhatsAppNotification)({
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
                                        await (0, whatsappService_1.sendResidentWhatsAppNotification)({
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
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "מצטערים, יצירת הדיווח נכשלה עקב שגיאה במערכת. נסה שוב.", phoneNumberId, token);
                                        session.state = 'MAIN_MENU';
                                    }
                                }
                                else if (interactiveId === 'cancel_ticket') {
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "הדיווח בוטל בהצלחה.", phoneNumberId, token);
                                    await sessionRef.delete();
                                    res.status(200).send("EVENT_RECEIVED");
                                    return;
                                }
                                else if (interactiveId === 'edit_summary') {
                                    if (session.draftTicket?.reportingMethod === 'quicktap') {
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "לא ניתן לערוך תקציר בדיווח מהיר.", phoneNumberId, token);
                                    }
                                    else {
                                        session.state = 'EDITING_SUMMARY';
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "נא הקלד את התיקון שלך לתקציר הדיווח:", phoneNumberId, token);
                                    }
                                }
                                else {
                                    if (session.draftTicket?.reportingMethod !== 'quicktap' && messageText) {
                                        const comments = session.draftTicket.comments || [];
                                        comments.push(messageText);
                                        session.draftTicket.comments = comments;
                                        try {
                                            await (0, whatsappService_1.sendWhatsAppText)(from, "מעדכן את התקציר עם המידע החדש... ⚡", phoneNumberId, token);
                                            const refineRes = await (0, aiEngine_1.refineSummaryWithAI)({
                                                currentSummary: session.draftTicket.summary || "",
                                                newComment: messageText
                                            });
                                            session.draftTicket.summary = refineRes.summary;
                                            await (0, context_1.recordAuditLog)({
                                                tenantId: session.tenantId,
                                                action: "AI_SUMMARY_REFINEMENT",
                                                level: "INFO",
                                                actor: { uid: "system", name: "TikTak AI", type: "system" },
                                                details: {
                                                    channel: "whatsapp",
                                                    engine: refineRes.telemetry.engine,
                                                    model: refineRes.telemetry.model,
                                                    promptTokens: refineRes.telemetry.promptTokens,
                                                    candidatesTokens: refineRes.telemetry.candidatesTokens,
                                                    totalTokens: refineRes.telemetry.totalTokens,
                                                    durationMs: refineRes.telemetry.durationMs
                                                }
                                            });
                                        }
                                        catch (e) {
                                            logger.error("AI summary refinement failed", e);
                                            session.draftTicket.summary = `${session.draftTicket.summary} - ${messageText.substring(0, 40)}`.substring(0, 80);
                                        }
                                        await sendVerificationPreview(from, session, phoneNumberId, token);
                                    }
                                    else {
                                        await (0, whatsappService_1.sendWhatsAppText)(from, "פעולה לא מורשית בשלב אימות זה.", phoneNumberId, token);
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
                                    await (0, whatsappService_1.sendWhatsAppText)(from, "אנא הקלד תקציר טקסטואלי תקין.", phoneNumberId, token);
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
//# sourceMappingURL=whatsappBot.js.map