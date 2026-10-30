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
exports.adminApi = void 0;
exports.verifySuperAdminRequest = verifySuperAdminRequest;
exports.handleManageTenantUser = handleManageTenantUser;
exports.handleSendWhatsAppCommentNotification = handleSendWhatsAppCommentNotification;
exports.handleForwardTicketToVendor = handleForwardTicketToVendor;
exports.handleSubmitSupportInquiry = handleSubmitSupportInquiry;
exports.handleProvisionTenantOrFleet = handleProvisionTenantOrFleet;
exports.handleUpdateTenantLicensing = handleUpdateTenantLicensing;
exports.handleToggleTenantFreeze = handleToggleTenantFreeze;
exports.handleDeleteTenantPermanently = handleDeleteTenantPermanently;
exports.handleRecordAdminLogin = handleRecordAdminLogin;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const crypto_1 = require("crypto");
const context_1 = require("../shared/context");
const whatsappService_1 = require("../shared/whatsappService");
async function verifySuperAdminRequest(req) {
    const auth = context_1.admin.auth();
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.split("Bearer ")[1]?.trim();
        if (idToken) {
            try {
                const decoded = await auth.verifyIdToken(idToken);
                if (decoded.role === "super") {
                    return { isSuper: true, callerUid: decoded.uid, callerEmail: decoded.email };
                }
            }
            catch (_tokenErr) {
            }
        }
    }
    const callerUid = req.body?.callerUid;
    if (callerUid) {
        try {
            const user = await auth.getUser(callerUid);
            if (user.customClaims?.role === "super") {
                return { isSuper: true, callerUid: user.uid, callerEmail: user.email };
            }
        }
        catch (uidErr) {
            logger.error("Error inspecting caller custom claims:", uidErr);
        }
    }
    return { isSuper: false };
}
async function handleManageTenantUser(req, res) {
    try {
        const { action, tenantId, userData, callerUid } = req.body;
        if (!tenantId || !action) {
            res.status(400).send({ error: "Missing required fields" });
            return;
        }
        const auth = context_1.admin.auth();
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
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
                    adminUids: context_1.admin.firestore.FieldValue.arrayUnion(uid)
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
                    adminUids: context_1.admin.firestore.FieldValue.arrayRemove(uid)
                });
                res.status(200).send({ success: true });
                break;
            }
            case 'resetPassword': {
                const { email } = userData;
                if (!email)
                    throw new Error("Missing email for reset");
                const rawLink = await auth.generatePasswordResetLink(email);
                const link = (0, context_1.normalizePasswordResetLink)(rawLink);
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
}
async function handleSendWhatsAppCommentNotification(req, res) {
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
        const ticketRef = context_1.db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
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
            await (0, whatsappService_1.sendWhatsAppText)(recipientPhone, formattedFallbackText, phoneNumberId, token);
        }
        else {
            const cleanCommentForTemplate = commentText.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            sentViaTemplate = true;
            try {
                await (0, whatsappService_1.sendWhatsAppTemplate)(recipientPhone, "ticket_status_update", "he", [reporterName, String(ticketNumber), cleanCommentForTemplate], phoneNumberId, token);
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
}
async function handleForwardTicketToVendor(req, res) {
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
        const ticketRef = context_1.db.collection("tenants").doc(tenantId).collection("tickets").doc(ticketId);
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
        const tenantDoc = await context_1.db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantDoc.data() || {};
        const param1_ticketNum = (ticketData.ticketNumber !== undefined && ticketData.ticketNumber !== null) ? String(ticketData.ticketNumber) : String(ticketId);
        const param2_sentBy = (0, context_1.sanitizeParam)(actorName || "מנהל");
        const param3_building = (0, context_1.sanitizeParam)(tenantData.name || tenantId);
        const param4_category = (0, context_1.sanitizeParam)(ticketData.category || "תחזוקה");
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
        const param6_location = (0, context_1.sanitizeParam)(locParts.join(" / ") || "לא צוין");
        const param7_summary = (0, context_1.sanitizeParam)(ticketData.summary || "אין תיאור");
        let param8_image = "אין";
        if (ticketData.imageId && typeof ticketData.imageId === 'string' && ticketData.imageId.length > 5 && ticketData.imageId !== 'null') {
            param8_image = `(${context_1.APP_BASE_URL}/img/${tenantIdStr}/${ticketData.imageId})`;
        }
        const resolvedAudioId = ticketData.audioId || ticketData.audioUrl || ticketData.audio;
        let param9_audio = "אין";
        if (resolvedAudioId && typeof resolvedAudioId === 'string' && resolvedAudioId.length > 5 && resolvedAudioId !== 'null') {
            const audioCleanId = String(resolvedAudioId).replace(/\.[^/.]+$/, "");
            param9_audio = `(${context_1.APP_BASE_URL}/aud/${tenantIdStr}/${audioCleanId})`;
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
            apiResult = await (0, whatsappService_1.sendWhatsAppTemplate)(cleanPhone, "vendor_ticket_dispatch", "he", templateParams, phoneNumberId, token);
            logger.info(`Successfully dispatched approved vendor_ticket_dispatch template to ${cleanPhone}`);
        }
        catch (templateErr) {
            logger.warn(`Approved template vendor_ticket_dispatch failed for vendor ${cleanPhone}, attempting interactive fallback...`, templateErr);
            try {
                apiResult = await (0, whatsappService_1.sendWhatsAppButtons)(cleanPhone, multiLineMessage, vendorButtons, phoneNumberId, token);
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
            const imageUrl = `${context_1.APP_BASE_URL}/img/${tenantIdStr}/${ticketData.imageId}`;
            try {
                await (0, whatsappService_1.sendWhatsAppImage)(cleanPhone, imageUrl, phoneNumberId, token);
                logger.info(`Dispatched ticket image attachment to vendor ${cleanPhone}: ${imageUrl}`);
            }
            catch (imgErr) {
                logger.error(`Failed to dispatch image attachment to vendor ${cleanPhone}:`, imgErr);
            }
        }
        if (resolvedAudioId && typeof resolvedAudioId === 'string' && resolvedAudioId.length > 5 && resolvedAudioId !== 'null') {
            const audioCleanId = resolvedAudioId.replace(/\.[^/.]+$/, "");
            const bucket = context_1.admin.storage().bucket();
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
            try {
                await audioFile.getSignedUrl({
                    action: 'read',
                    expires: '01-01-2100',
                    responseContentType: audioContentType
                });
            }
            catch (signErr) {
                logger.warn(`Failed to generate signed URL for audio ${audioCleanId}`, signErr);
            }
            const audioPublicUrl = `${context_1.APP_BASE_URL}/aud/${tenantIdStr}/${audioCleanId}.${foundExt}`;
            try {
                await (0, whatsappService_1.sendWhatsAppDocument)(cleanPhone, audioPublicUrl, `הקלטה_קולית.${foundExt}`, phoneNumberId, token);
                logger.info(`Dispatched ticket audio document attachment to vendor ${cleanPhone}: ${audioPublicUrl}`);
            }
            catch (docErr) {
                logger.error(`Failed to dispatch audio document attachment to vendor ${cleanPhone}:`, docErr);
            }
        }
        const newCount = currentCount + 1;
        const resolvedVendorName = String(vendorName || '').trim() || vendorPhone;
        const outboundMessageId = apiResult?.messages?.[0]?.id || null;
        const newVendorEntry = {
            phone: vendorPhone,
            intlPhone: cleanPhone,
            name: resolvedVendorName,
            status: "ממתין לתשובה מהספק ...",
            sentAt: new Date().toISOString(),
            ...(outboundMessageId ? { whatsappMessageId: outboundMessageId } : {})
        };
        const existingVendors = Array.isArray(ticketData.vendors) ? ticketData.vendors : [];
        const filteredVendors = existingVendors.filter((v) => v.phone !== vendorPhone && v.intlPhone !== cleanPhone);
        const updatedVendors = [...filteredVendors, newVendorEntry];
        await ticketRef.update({
            vendorForwardCount: newCount,
            lastVendorForwardAt: new Date().toISOString(),
            vendors: updatedVendors
        });
        await (0, context_1.recordAuditLog)({
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
}
async function handleSubmitSupportInquiry(req, res) {
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
                const decoded = await context_1.admin.auth().verifyIdToken(idToken);
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
        const rateLimitRef = context_1.db.collection("support_rate_limits").doc(effectiveUid);
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
                const tenantSnap = await context_1.db.collection("tenants").doc(tenantId).get();
                if (tenantSnap.exists) {
                    resolvedTenantName = tenantSnap.data()?.name || tenantId;
                }
                const userSnap = await context_1.db.collection("tenants").doc(tenantId).collection("adminUsers").doc(effectiveUid).get();
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
                const firebaseUser = await context_1.admin.auth().getUser(effectiveUid);
                if (firebaseUser.phoneNumber)
                    adminPhone = firebaseUser.phoneNumber;
                if (!adminEmail && firebaseUser.email)
                    adminEmail = firebaseUser.email;
                if (adminName === "מנהל מערכת" && firebaseUser.displayName)
                    adminName = firebaseUser.displayName;
            }
            catch (_uErr) {
            }
        }
        const inquiryRef = context_1.db.collection("support_inquiries").doc();
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
                const configDoc = await context_1.db.collection("global_config").doc("support").get();
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
                        await (0, whatsappService_1.sendWhatsAppTemplate)(cleanPhone, "admin_support_inquiry", "he", templateParams, phoneNumberId, token);
                        inquiryData.whatsappDispatched = true;
                        logger.info("Sent admin_support_inquiry template to TikTak support", { cleanPhone });
                    }
                    catch (templateError) {
                        logger.warn("Template dispatch failed, falling back to WhatsApp text message:", templateError?.message);
                        try {
                            const formattedText = `🛎️ *פניית תמיכה חדשה ממנהל TikTak*\n\n🏢 *בניין:* ${resolvedTenantName}\n👤 *מנהל:* ${adminName}\n📞 *טלפון:* ${adminPhone || "לא צוין"}\n✉️ *דוא"ל:* ${adminEmail || "לא צוין"}\n\n❓ *תוכן הפנייה:*\n${cleanQuestion}`;
                            await (0, whatsappService_1.sendWhatsAppText)(cleanPhone, formattedText, phoneNumberId, token);
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
                    await (0, whatsappService_1.sendWhatsAppText)(cleanAdminPhone, autoReplyText, phoneNumberId, token);
                    logger.info("Sent auto-reply confirmation to admin sender", { cleanAdminPhone });
                }
                catch (arErr) {
                    logger.warn("Auto-reply to admin sender failed (may be outside 24h window if no template):", arErr?.message);
                }
            }
        }
        await (0, context_1.recordAuditLog)({
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
}
async function handleProvisionTenantOrFleet(req, res) {
    try {
        const authCheck = await verifySuperAdminRequest(req);
        if (!authCheck.isSuper) {
            res.status(403).send({ error: "Unauthorized: Caller must be a Super Admin (role === 'super')" });
            return;
        }
        const rawBody = req.body || {};
        const isFleet = Boolean(rawBody.isFleet || rawBody.type === "fleet" || rawBody.fleet);
        const rawEntityType = rawBody.entityType || rawBody.tenantData?.type || rawBody.singleTenant?.type || "building";
        const entityType = rawEntityType === "municipality" ? "municipality" : "building";
        const isParentBuilding = rawBody.isParentBuilding ?? true;
        let tenantData = rawBody.tenantData;
        if (!tenantData) {
            if (rawBody.singleTenant) {
                tenantData = {
                    tenantId: rawBody.singleTenant.id || rawBody.singleTenant.tenantId,
                    name: rawBody.singleTenant.name,
                    address: rawBody.singleTenant.address
                };
            }
            else if (rawBody.fleet) {
                tenantData = {
                    tenantId: rawBody.fleet.fleetMasterId || rawBody.fleet.id || rawBody.fleet.tenantId,
                    name: rawBody.fleet.fleetMasterName || rawBody.fleet.name,
                    address: rawBody.fleet.address
                };
            }
        }
        let childBuildings = rawBody.childBuildings;
        if (!childBuildings && rawBody.fleet?.buildings) {
            childBuildings = rawBody.fleet.buildings.map((b) => ({
                tenantId: b.id || b.tenantId,
                name: b.name
            }));
        }
        if (!Array.isArray(childBuildings)) {
            childBuildings = [];
        }
        const adminUserData = rawBody.adminUserData || rawBody.admin || {};
        const rawFirstName = (adminUserData.firstName || "").trim();
        const rawLastName = (adminUserData.lastName || "").trim();
        const rawFullName = (adminUserData.fullName || adminUserData.name || "").trim();
        let resolvedFirstName = rawFirstName;
        let resolvedLastName = rawLastName;
        if (!resolvedFirstName && rawFullName) {
            const parts = rawFullName.split(/\s+/).filter(Boolean);
            resolvedFirstName = parts[0] || "מנהל";
            resolvedLastName = parts.slice(1).join(" ");
        }
        if (!resolvedFirstName) {
            resolvedFirstName = "מנהל";
        }
        const computedDisplayName = `${resolvedFirstName} ${resolvedLastName}`.trim();
        adminUserData.firstName = resolvedFirstName;
        adminUserData.lastName = resolvedLastName;
        adminUserData.fullName = computedDisplayName;
        adminUserData.name = computedDisplayName;
        const ticketTier = rawBody.ticketTier || rawBody.ticketSubscription || { tier: "starter", monthlyQuota: 15, overageRate: 12.0 };
        const rfqTier = rawBody.rfqTier || rawBody.rfqLicensing || { tier: "disabled", annualQuota: 0, overageRate: 59.0, enforcementMode: "hard" };
        if (!tenantData?.name || !tenantData?.tenantId) {
            res.status(400).send({ error: "Missing required fields: tenant name and tenantId are mandatory" });
            return;
        }
        const parentId = tenantData.tenantId.trim();
        const parentName = tenantData.name.trim();
        const parentAddress = tenantData.address ? tenantData.address.trim() : "";
        const parentDocSnap = await context_1.db.collection("tenants").doc(parentId).get();
        if (parentDocSnap.exists) {
            res.status(409).send({ error: `Tenant ID '${parentId}' already exists. Please choose a different ID.` });
            return;
        }
        if (isFleet && Array.isArray(childBuildings) && childBuildings.length > 0) {
            for (const child of childBuildings) {
                const cId = child.tenantId?.trim();
                if (!cId)
                    continue;
                const cSnap = await context_1.db.collection("tenants").doc(cId).get();
                if (cSnap.exists) {
                    res.status(409).send({ error: `Child Tenant ID '${cId}' already exists. Please choose a different ID.` });
                    return;
                }
            }
        }
        const buildingCategories = [
            "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מעלית", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
        ];
        const muniCategories = [
            "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
        ];
        const selectedCategories = entityType === "municipality" ? muniCategories : buildingCategories;
        const locationLabel = entityType === "municipality" ? "אזור" : "קומה";
        const subLocationLabel = entityType === "municipality" ? "רחוב" : "מיקום";
        const now = new Date();
        const startDay = now.getDate();
        const year = now.getFullYear();
        const month = now.getMonth();
        const maxStartDay = new Date(year, month + 1, 0).getDate();
        const actualStartDay = Math.min(startDay, maxStartDay);
        const cycleStart = new Date(Date.UTC(year, month, actualStartDay, 0, 0, 0, 0));
        if (now < cycleStart) {
            const prevMonth = month === 0 ? 11 : month - 1;
            const prevYear = month === 0 ? year - 1 : year;
            const maxPrev = new Date(prevYear, prevMonth + 1, 0).getDate();
            cycleStart.setUTCFullYear(prevYear, prevMonth, Math.min(startDay, maxPrev));
        }
        const nextMonth = cycleStart.getUTCMonth() === 11 ? 0 : cycleStart.getUTCMonth() + 1;
        const nextYear = cycleStart.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : cycleStart.getUTCFullYear();
        const maxNext = new Date(nextYear, nextMonth + 1, 0).getDate();
        const cycleEnd = new Date(Date.UTC(nextYear, nextMonth, Math.min(startDay, maxNext), 0, 0, 0, 0));
        cycleEnd.setTime(cycleEnd.getTime() - 1);
        const annualExpiryDate = rfqTier.licenseExpiresAt || new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const rfqLicensingPayload = {
            tier: rfqTier.tier || "disabled",
            status: rfqTier.tier && rfqTier.tier !== "disabled" ? "active" : "disabled",
            annualQuota: Number(rfqTier.annualQuota) || 0,
            overageRate: Number(rfqTier.overageRate) || 59.0,
            enforcementMode: rfqTier.enforcementMode || "hard",
            licenseStartDate: now.toISOString(),
            licenseExpiresAt: annualExpiryDate,
            currentAnnualUsage: {
                dispatchedCount: 0,
                alertsSent: {}
            },
            expiryAlertsSent: {}
        };
        const auth = context_1.admin.auth();
        let adminUid = null;
        let passwordResetLink = null;
        if (adminUserData?.email) {
            const cleanEmail = adminUserData.email.trim().toLowerCase();
            try {
                const existing = await auth.getUserByEmail(cleanEmail);
                adminUid = existing.uid;
            }
            catch (notFoundErr) {
                if (notFoundErr.code === "auth/user-not-found") {
                    const generatedPass = adminUserData.password && adminUserData.password.length >= 6
                        ? adminUserData.password
                        : (0, crypto_1.randomUUID)().substring(0, 16) + "!Aa1";
                    const newUser = await auth.createUser({
                        email: cleanEmail,
                        password: generatedPass,
                        displayName: adminUserData.fullName || `${adminUserData.firstName || ''} ${adminUserData.lastName || ''}`.trim()
                    });
                    adminUid = newUser.uid;
                }
                else {
                    throw notFoundErr;
                }
            }
            try {
                const rawResetLink = await auth.generatePasswordResetLink(cleanEmail);
                passwordResetLink = (0, context_1.normalizePasswordResetLink)(rawResetLink);
            }
            catch (linkErr) {
                logger.warn("Could not generate password reset link:", linkErr);
            }
        }
        const adminUidsArray = adminUid ? [adminUid] : [];
        if (!isFleet) {
            const singleSubscription = {
                tier: ticketTier.tier || "starter",
                status: "active",
                autoRenew: true,
                monthlyQuota: Number(ticketTier.monthlyQuota) || 15,
                overageRate: Number(ticketTier.overageRate) || 12.0,
                billingCycleStartDay: startDay,
                cycleStartDate: now.toISOString(),
                cycleEndDate: cycleEnd.toISOString(),
                frozenAt: null,
                warned80PercentAt: null,
                warned100PercentAt: null,
                currentCycleTicketCount: 0,
                currentCycleExclusions: 0,
                rolloverTickets: 0
            };
            const tenantPayload = {
                name: parentName,
                address: parentAddress,
                type: entityType,
                isActive: true,
                language: "he",
                country: "IL",
                subscription: singleSubscription,
                rfqLicensing: rfqLicensingPayload,
                slaConfig: {
                    enabled: true,
                    workingDays: [0, 1, 2, 3, 4]
                },
                config: {
                    categories: selectedCategories,
                    locationLabel,
                    subLocationLabel,
                    floors: [],
                    resources: [],
                    locations: [],
                    subLocations: []
                },
                uiConfig: {
                    locationLabel,
                    subLocationLabel,
                    showLocation: true
                },
                adminUids: adminUidsArray,
                createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: null
            };
            await context_1.db.collection("tenants").doc(parentId).set(tenantPayload);
            if (adminUid && adminUserData) {
                await context_1.db.collection("tenants").doc(parentId).collection("adminUsers").doc(adminUid).set({
                    email: adminUserData.email.trim().toLowerCase(),
                    firstName: adminUserData.firstName || "מנהל",
                    lastName: adminUserData.lastName || "",
                    name: adminUserData.fullName || `${adminUserData.firstName || ''} ${adminUserData.lastName || ''}`.trim(),
                    mobile: adminUserData.mobile ? adminUserData.mobile.trim() : "",
                    role: "admin",
                    createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: null
                });
            }
            await (0, context_1.recordAuditLog)({
                tenantId: parentId,
                action: "TENANT_CREATED",
                level: "INFO",
                actor: {
                    uid: authCheck.callerUid || "super-admin",
                    name: authCheck.callerEmail || "Super Admin",
                    type: "admin"
                },
                details: {
                    tenantId: parentId,
                    name: parentName,
                    type: entityType,
                    ticketTier: ticketTier.tier,
                    rfqTier: rfqTier.tier,
                    adminEmail: adminUserData?.email
                }
            });
            res.status(200).send({
                success: true,
                tenantId: parentId,
                name: parentName,
                passwordResetLink,
                adminUid
            });
            return;
        }
        else {
            const childTenantIds = (childBuildings || []).map((b) => b.tenantId?.trim()).filter(Boolean);
            const parentSubscription = {
                tier: ticketTier.tier || "growth",
                status: "active",
                autoRenew: true,
                monthlyQuota: Number(ticketTier.monthlyQuota) || 160,
                overageRate: Number(ticketTier.overageRate) || 7.0,
                billingCycleStartDay: startDay,
                cycleStartDate: now.toISOString(),
                cycleEndDate: cycleEnd.toISOString(),
                frozenAt: null,
                warned80PercentAt: null,
                warned100PercentAt: null,
                currentCycleTicketCount: 0,
                currentCycleExclusions: 0,
                rolloverTickets: 0
            };
            const masterPayload = {
                name: parentName,
                address: parentAddress,
                type: isParentBuilding ? entityType : "municipality",
                isActive: true,
                isPoolMaster: true,
                childTenantIds,
                language: "he",
                country: "IL",
                subscription: parentSubscription,
                rfqLicensing: rfqLicensingPayload,
                slaConfig: { enabled: true, workingDays: [0, 1, 2, 3, 4] },
                config: {
                    categories: selectedCategories,
                    locationLabel,
                    subLocationLabel,
                    floors: [], resources: [], locations: [], subLocations: []
                },
                uiConfig: { locationLabel, subLocationLabel, showLocation: true },
                adminUids: adminUidsArray,
                createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: null
            };
            await context_1.db.collection("tenants").doc(parentId).set(masterPayload);
            if (adminUid && adminUserData) {
                await context_1.db.collection("tenants").doc(parentId).collection("adminUsers").doc(adminUid).set({
                    email: adminUserData.email.trim().toLowerCase(),
                    firstName: adminUserData.firstName || "מנהל",
                    lastName: adminUserData.lastName || "",
                    name: adminUserData.fullName || `${adminUserData.firstName || ''} ${adminUserData.lastName || ''}`.trim(),
                    mobile: adminUserData.mobile ? adminUserData.mobile.trim() : "",
                    role: "admin",
                    createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: null
                });
            }
            for (const bldg of childBuildings) {
                const cId = bldg.tenantId?.trim();
                if (!cId)
                    continue;
                const childSubscription = {
                    tier: ticketTier.tier,
                    status: "active",
                    autoRenew: true,
                    monthlyQuota: 0,
                    overageRate: Number(ticketTier.overageRate) || 7.0,
                    billingCycleStartDay: startDay,
                    cycleStartDate: now.toISOString(),
                    cycleEndDate: cycleEnd.toISOString(),
                    frozenAt: null,
                    currentCycleTicketCount: 0,
                    currentCycleExclusions: 0,
                    rolloverTickets: 0
                };
                const childPayload = {
                    name: bldg.name?.trim(),
                    address: bldg.address ? bldg.address.trim() : "",
                    type: entityType,
                    isActive: true,
                    parentEnterpriseId: parentId,
                    isPoolMaster: false,
                    usesParentPool: true,
                    language: "he",
                    country: "IL",
                    subscription: childSubscription,
                    rfqLicensing: {
                        ...rfqLicensingPayload,
                        annualQuota: 0
                    },
                    slaConfig: { enabled: true, workingDays: [0, 1, 2, 3, 4] },
                    config: {
                        categories: selectedCategories,
                        locationLabel,
                        subLocationLabel,
                        floors: [], resources: [], locations: [], subLocations: []
                    },
                    uiConfig: { locationLabel, subLocationLabel, showLocation: true },
                    adminUids: adminUidsArray,
                    createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: null
                };
                await context_1.db.collection("tenants").doc(cId).set(childPayload);
                if (adminUid && adminUserData) {
                    await context_1.db.collection("tenants").doc(cId).collection("adminUsers").doc(adminUid).set({
                        email: adminUserData.email.trim().toLowerCase(),
                        firstName: adminUserData.firstName || "מנהל",
                        lastName: adminUserData.lastName || "",
                        name: adminUserData.fullName || `${adminUserData.firstName || ''} ${adminUserData.lastName || ''}`.trim(),
                        mobile: adminUserData.mobile ? adminUserData.mobile.trim() : "",
                        role: "admin",
                        createdAt: context_1.admin.firestore.FieldValue.serverTimestamp(),
                        lastLogin: null
                    });
                }
            }
            await (0, context_1.recordAuditLog)({
                tenantId: parentId,
                action: "FLEET_CREATED",
                level: "INFO",
                actor: {
                    uid: authCheck.callerUid || "super-admin",
                    name: authCheck.callerEmail || "Super Admin",
                    type: "admin"
                },
                details: {
                    masterTenantId: parentId,
                    masterName: parentName,
                    totalChildren: childTenantIds.length,
                    childTenantIds,
                    ticketTier: ticketTier.tier,
                    rfqTier: rfqTier.tier
                }
            });
            res.status(200).send({
                success: true,
                tenantId: parentId,
                name: parentName,
                isFleet: true,
                childrenCount: childTenantIds.length,
                passwordResetLink,
                adminUid
            });
            return;
        }
    }
    catch (err) {
        logger.error("Exception in provisionTenantOrFleet:", err);
        res.status(500).send({ error: err.message || "Failed to provision tenant" });
    }
}
async function handleUpdateTenantLicensing(req, res) {
    try {
        const authCheck = await verifySuperAdminRequest(req);
        if (!authCheck.isSuper) {
            res.status(403).send({ error: "Unauthorized: Super Admin access required" });
            return;
        }
        const { tenantId, ticketSubscription, rfqLicensing } = req.body;
        if (!tenantId) {
            res.status(400).send({ error: "Missing mandatory parameter: tenantId" });
            return;
        }
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
        const tenantDoc = await tenantRef.get();
        if (!tenantDoc.exists) {
            res.status(404).send({ error: `Tenant ${tenantId} not found` });
            return;
        }
        const currentData = tenantDoc.data() || {};
        const updates = {
            updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp()
        };
        if (ticketSubscription) {
            updates["subscription.tier"] = ticketSubscription.tier ?? currentData.subscription?.tier;
            if (ticketSubscription.monthlyQuota !== undefined) {
                updates["subscription.monthlyQuota"] = Number(ticketSubscription.monthlyQuota);
            }
            if (ticketSubscription.overageRate !== undefined) {
                updates["subscription.overageRate"] = Number(ticketSubscription.overageRate);
            }
        }
        if (rfqLicensing) {
            if (rfqLicensing.tier !== undefined)
                updates["rfqLicensing.tier"] = rfqLicensing.tier;
            if (rfqLicensing.annualQuota !== undefined)
                updates["rfqLicensing.annualQuota"] = Number(rfqLicensing.annualQuota);
            if (rfqLicensing.overageRate !== undefined)
                updates["rfqLicensing.overageRate"] = Number(rfqLicensing.overageRate);
            if (rfqLicensing.enforcementMode !== undefined)
                updates["rfqLicensing.enforcementMode"] = rfqLicensing.enforcementMode;
            if (rfqLicensing.licenseExpiresAt !== undefined)
                updates["rfqLicensing.licenseExpiresAt"] = rfqLicensing.licenseExpiresAt;
            if (rfqLicensing.status !== undefined)
                updates["rfqLicensing.status"] = rfqLicensing.status;
            if (rfqLicensing.resetUsage) {
                updates["rfqLicensing.currentAnnualUsage"] = {
                    dispatchedCount: 0,
                    alertsSent: {}
                };
                updates["rfqLicensing.expiryAlertsSent"] = {};
                updates["rfqLicensing.licenseStartDate"] = new Date().toISOString();
            }
        }
        await tenantRef.update(updates);
        if (Array.isArray(currentData.childTenantIds) && currentData.childTenantIds.length > 0) {
            const childBatch = context_1.db.batch();
            for (const childId of currentData.childTenantIds) {
                const childRef = context_1.db.collection("tenants").doc(childId);
                const childUpdates = {
                    updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp()
                };
                if (rfqLicensing) {
                    if (rfqLicensing.tier !== undefined)
                        childUpdates["rfqLicensing.tier"] = rfqLicensing.tier;
                    if (rfqLicensing.status !== undefined)
                        childUpdates["rfqLicensing.status"] = rfqLicensing.status;
                    if (rfqLicensing.enforcementMode !== undefined)
                        childUpdates["rfqLicensing.enforcementMode"] = rfqLicensing.enforcementMode;
                    if (rfqLicensing.licenseExpiresAt !== undefined)
                        childUpdates["rfqLicensing.licenseExpiresAt"] = rfqLicensing.licenseExpiresAt;
                }
                if (ticketSubscription && ticketSubscription.tier !== undefined) {
                    childUpdates["subscription.tier"] = ticketSubscription.tier;
                }
                childBatch.update(childRef, childUpdates);
            }
            await childBatch.commit().catch(err => logger.warn("Failed to cascade license updates to children:", err));
        }
        await (0, context_1.recordAuditLog)({
            tenantId,
            action: "LICENSE_UPDATED",
            level: "INFO",
            actor: {
                uid: authCheck.callerUid || "super-admin",
                name: authCheck.callerEmail || "Super Admin",
                type: "admin"
            },
            details: {
                tenantId,
                previousTickets: currentData.subscription?.tier,
                newTickets: ticketSubscription?.tier,
                previousRfq: currentData.rfqLicensing?.tier,
                newRfq: rfqLicensing?.tier,
                renewalMode: rfqLicensing?.resetUsage ? "renewal_restart" : "midterm_update",
                resetUsage: Boolean(rfqLicensing?.resetUsage)
            }
        });
        res.status(200).send({ success: true, tenantId, updates });
    }
    catch (err) {
        logger.error("Exception in updateTenantLicensing:", err);
        res.status(500).send({ error: err.message || "Failed to update tenant licensing" });
    }
}
async function handleToggleTenantFreeze(req, res) {
    try {
        const authCheck = await verifySuperAdminRequest(req);
        if (!authCheck.isSuper) {
            res.status(403).send({ error: "Unauthorized: Super Admin access required" });
            return;
        }
        const { tenantId, isActive } = req.body;
        if (!tenantId || isActive === undefined) {
            res.status(400).send({ error: "Missing required parameters: tenantId and isActive" });
            return;
        }
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
        const tenantDoc = await tenantRef.get();
        if (!tenantDoc.exists) {
            res.status(404).send({ error: `Tenant ${tenantId} not found` });
            return;
        }
        const newActiveState = Boolean(isActive);
        const updatePayload = {
            isActive: newActiveState,
            "subscription.status": newActiveState ? "active" : "frozen",
            frozenAt: newActiveState ? null : new Date().toISOString(),
            updatedAt: context_1.admin.firestore.FieldValue.serverTimestamp()
        };
        await tenantRef.update(updatePayload);
        const tenantData = tenantDoc.data() || {};
        const childIds = new Set();
        if (Array.isArray(tenantData.childTenantIds)) {
            tenantData.childTenantIds.forEach((id) => {
                if (id && typeof id === 'string')
                    childIds.add(id.trim());
            });
        }
        const childrenQuery = await context_1.db.collection("tenants").where("parentEnterpriseId", "==", tenantId).get();
        childrenQuery.forEach(doc => childIds.add(doc.id));
        if (childIds.size > 0) {
            const batch = context_1.db.batch();
            for (const childId of childIds) {
                batch.update(context_1.db.collection("tenants").doc(childId), updatePayload);
            }
            await batch.commit();
            logger.info(`Cascaded ${newActiveState ? 'unfreeze' : 'freeze'} to ${childIds.size} child tenants of parent ${tenantId}`);
        }
        await (0, context_1.recordAuditLog)({
            tenantId,
            action: newActiveState ? "TENANT_UNFROZEN" : "TENANT_FROZEN",
            level: "WARN",
            actor: {
                uid: authCheck.callerUid || "super-admin",
                name: authCheck.callerEmail || "Super Admin",
                type: "admin"
            },
            details: { tenantId, newActiveState, cascadedChildCount: childIds.size, cascadedChildIds: Array.from(childIds) }
        });
        res.status(200).send({
            success: true,
            tenantId,
            isActive: newActiveState,
            cascadedChildren: Array.from(childIds)
        });
    }
    catch (err) {
        logger.error("Exception in toggleTenantFreeze:", err);
        res.status(500).send({ error: err.message || "Failed to toggle tenant freeze status" });
    }
}
async function handleDeleteTenantPermanently(req, res) {
    try {
        const authCheck = await verifySuperAdminRequest(req);
        if (!authCheck.isSuper) {
            res.status(403).send({ error: "Unauthorized: Super Admin access required" });
            return;
        }
        const { tenantId, confirmationId } = req.body;
        if (!tenantId || !confirmationId) {
            res.status(400).send({ error: "Missing tenantId or confirmationId" });
            return;
        }
        if (tenantId !== confirmationId) {
            res.status(400).send({ error: `Confirmation mismatch. '${confirmationId}' does not match '${tenantId}'.` });
            return;
        }
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
        const tenantDoc = await tenantRef.get();
        if (!tenantDoc.exists) {
            res.status(404).send({ error: `Tenant ${tenantId} not found` });
            return;
        }
        const tenantName = tenantDoc.data()?.name || tenantId;
        const auth = context_1.admin.auth();
        const adminUsersSnap = await tenantRef.collection("adminUsers").get();
        const uids = adminUsersSnap.docs.map(d => d.id);
        for (const uid of uids) {
            try {
                const otherTenantsSnap = await context_1.db.collection("tenants")
                    .where("adminUids", "array-contains", uid)
                    .get();
                const otherCount = otherTenantsSnap.docs.filter(d => d.id !== tenantId).length;
                if (otherCount === 0) {
                    await auth.deleteUser(uid);
                    logger.info(`Deleted Firebase Auth user ${uid} belonging exclusively to ${tenantId}`);
                }
                else {
                    logger.info(`Preserved Firebase Auth user ${uid} as they are attached to ${otherCount} other tenant(s)`);
                }
            }
            catch (authErr) {
                logger.warn(`Could not delete user ${uid}:`, authErr.message);
            }
        }
        try {
            const bucket = context_1.storage.bucket();
            const prefix = `tenants/${tenantId}/`;
            await bucket.deleteFiles({ prefix });
            logger.info(`Deleted storage files with prefix ${prefix}`);
        }
        catch (storageErr) {
            logger.warn(`Could not delete storage files for ${tenantId}:`, storageErr.message);
        }
        await (0, context_1.recordAuditLog)({
            tenantId,
            action: "TENANT_DELETED",
            level: "ERROR",
            actor: {
                uid: authCheck.callerUid || "super-admin",
                name: authCheck.callerEmail || "Super Admin",
                type: "admin"
            },
            details: {
                deletedTenantId: tenantId,
                tenantName,
                purgedAdminsCount: uids.length
            }
        });
        await context_1.db.recursiveDelete(tenantRef);
        logger.info(`Recursively deleted Firestore tree for tenant ${tenantId}`);
        res.status(200).send({
            success: true,
            deletedTenantId: tenantId,
            name: tenantName
        });
    }
    catch (err) {
        logger.error("Exception in deleteTenantPermanently:", err);
        res.status(500).send({ error: err.message || "Failed to delete tenant permanently" });
    }
}
async function handleRecordAdminLogin(req, res) {
    try {
        const { tenantId, uid } = req.body;
        if (!tenantId || !uid) {
            res.status(400).send({ error: "Missing required parameters: tenantId and uid" });
            return;
        }
        const tenantRef = context_1.db.collection("tenants").doc(tenantId);
        const userRef = tenantRef.collection("adminUsers").doc(uid);
        const now = context_1.admin.firestore.FieldValue.serverTimestamp();
        await tenantRef.update({
            lastLogin: now,
            updatedAt: now
        });
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({ lastLogin: now });
        }
        res.status(200).send({ success: true, tenantId, uid });
    }
    catch (err) {
        logger.error("Exception in recordAdminLogin:", err);
        res.status(500).send({ error: err.message || "Failed to record admin login" });
    }
}
exports.adminApi = (0, https_1.onRequest)({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
    const endpoint = (0, context_1.resolveEndpointName)(req);
    switch (endpoint) {
        case "manageTenantUser":
            return handleManageTenantUser(req, res);
        case "forwardTicketToVendor":
            return handleForwardTicketToVendor(req, res);
        case "sendWhatsAppCommentNotification":
            return handleSendWhatsAppCommentNotification(req, res);
        case "submitSupportInquiry":
            return handleSubmitSupportInquiry(req, res);
        case "recordAdminLogin":
            return handleRecordAdminLogin(req, res);
        case "provisionTenantOrFleet":
            return handleProvisionTenantOrFleet(req, res);
        case "updateTenantLicensing":
            return handleUpdateTenantLicensing(req, res);
        case "toggleTenantFreeze":
            return handleToggleTenantFreeze(req, res);
        case "deleteTenantPermanently":
            return handleDeleteTenantPermanently(req, res);
        default:
            res.status(404).send({ error: `Unknown adminApi endpoint: ${endpoint}` });
    }
});
//# sourceMappingURL=adminApi.js.map