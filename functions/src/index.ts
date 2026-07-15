import { onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { calculateWorkingDays } from "./utils/slaEngine";
export { slaCron } from "./slaCron";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { randomUUID } from "crypto";

initializeApp();
const db = getFirestore();
const storage = getStorage();

async function recordAuditLog(params: {
  tenantId: string;
  action: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  actor: { uid: string; name: string; email?: string; type: 'admin' | 'resident' };
  details: any;
}) {
  const { tenantId, action, level, actor, details } = params;
  const createdAt = new Date().toISOString();
  // Set expireAt to 7 years from now
  const expireAt = new Date();
  expireAt.setFullYear(expireAt.getFullYear() + 7);

  const logData = {
    tenantId, // Mandatory top-level field
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
  } catch (err) {
    logger.error("Failed to write audit log", { error: err, logData: cleanData });
  }
}

export const health = onRequest({ cors: true }, (request, response) => {
  logger.info("Health check requested", { structuredData: true });
  response.send({ status: "ok", timestamp: new Date().toISOString() });
});

export const analyzeImage = onRequest({ cors: true, secrets: ["GEMINI_API_KEY"] }, async (req, res) => {
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 1. Kick off Google Cloud Storage Image Upload
    const imageId = randomUUID();
    const safeTenantId = tenantId || 'default-tenant';
    const bucket = storage.bucket();
    const file = bucket.file(`tenants/${safeTenantId}/${imageId}.jpg`);
    const imageBuffer = Buffer.from(base64Image, 'base64');

    const uploadPromise = file.save(imageBuffer, {
      metadata: { contentType: mimeType || "image/jpeg" }
    });

    // 2. Fetch tenant config for language, type and categories
    const tenantDoc = await db.collection("tenants").doc(safeTenantId).get();
    const tData = tenantDoc.data() || {};
    const lang = tData.language || 'he';
    const type = tData.type || 'building';
    const categories = (tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"]).join(", ");

    // 3. Prepare AI Request with dynamic language and categories
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
    // Clean potential markdown code blocks if the AI includes them
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText;

    // Ensure the upload completes before returning
    await uploadPromise;

    const finalData = JSON.parse(cleanJson || "{}");
    finalData.imageId = imageId;

    // Hardening: Map 'severity' to 'urgency' if AI hallucinations
    if (!finalData.urgency && (finalData as any).severity) {
      finalData.urgency = (finalData as any).severity;
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
  } catch (error: any) {
    logger.error("AI Analysis failed", {
      message: error.message,
      stack: error.stack,
      errorDetails: error
    });
    res.status(500).send({ error: "Failed to analyze image", details: error.message });
  }
});

/**
 * Lightweight endpoint to check if a phone number is authorized for a given tenant.
 * Used by the frontend to prevent unnecessary AI analysis overhead for unauthorized users.
 */
export const checkAuth = onRequest({ cors: true }, async (req, res) => {
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
  } catch (error: any) {
    logger.error("checkAuth failed", { message: error.message });
    res.status(500).send({ authorized: false, error: "Internal server error" });
  }
});

function sanitizeParam(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

async function sendWhatsAppNotification(params: {
  tenantId: string;
  tenantName: string;
  ticketNumber: number;
  category: string;
  summary: string;
  location: string | null;
  subLocation: string | null;
  urgency: string | null;
  reporterName: string | null;
  imageId: string | null;
  audioId: string | null;
  admins: { name: string; phone: string }[];
}) {
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

  // Format Location block using tenant's custom bold RTL style dynamically
  let locationLabel = "רחוב";
  let subLocationLabel = "אזור";

  if (params.tenantId) {
    try {
      const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
      const uiConfig = tenantDoc.data()?.uiConfig || {};
      if (uiConfig.locationLabel) locationLabel = uiConfig.locationLabel;
      if (uiConfig.subLocationLabel) subLocationLabel = uiConfig.subLocationLabel;
    } catch (err) {
      logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
    }
  }

  let formattedLocation = "";
  const locationParts: string[] = [];
  if (params.subLocation) {
    locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
  }
  if (params.location) {
    locationParts.push(`*${locationLabel}*: ${params.location}`);
  }
  if (locationParts.length > 0) {
    formattedLocation = locationParts.join(" • ");
  } else {
    formattedLocation = "לא צוין מיקום";
  }

  // Map Urgency/Severity to Hebrew string with emojis
  let severityHebrew = "בינונית ⚠️";
  const lowerUrgency = (params.urgency || "").toLowerCase();
  if (lowerUrgency === "high") {
    severityHebrew = "גבוהה 🚨";
  } else if (lowerUrgency === "low") {
    severityHebrew = "נמוכה";
  } else if (lowerUrgency === "moderate" || lowerUrgency === "medium") {
    severityHebrew = "בינונית ⚠️";
  }

  const hasImage = !!params.imageId;
  const hasAudio = !!params.audioId;

  let templateName = "resident_submit_ticket_no_media";
  const buttonComponents: any[] = [];

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
  } else if (hasImage) {
    templateName = "resident_submit_ticket_image";
    buttonComponents.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: `${params.tenantId}/${params.imageId}.jpg` }]
    });
  } else if (hasAudio) {
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
      // Normalize admin phone number to international standard (972...)
      let cleanPhone = admin.phone.replace(/\D/g, "");
      if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
        cleanPhone = "972" + cleanPhone.substring(1);
      }

      const components: any[] = [
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

      const resData: any = await response.json();
      if (!response.ok) {
        logger.error(`Meta API returned error for admin ${admin.name}:`, resData);
      } else {
        logger.info(`WhatsApp alert successfully sent to admin ${admin.name}`, { messageId: resData.messages?.[0]?.id });
      }
    } catch (err) {
      logger.error(`Exception while sending WhatsApp alert to admin ${admin.name}:`, err);
    }
  }
}

function translateClosureReason(reason: string): string {
  const mapping: Record<string, string> = {
    'fixed': 'טופל',
    'duplicate': 'כפילות',
    'irrelevant': 'לא רלוונטי',
    'vendor': 'בטיפול ספק',
    'outside': 'מחוץ לאחריות',
    'rejected': 'נדחה'
  };
  return mapping[reason] || reason || 'טופל';
}

async function sendResidentWhatsAppNotification(params: {
  phone: string;
  templateName: string;
  ticketNumber: number;
  category: string;
  location: string | null;
  subLocation: string | null;
  closureReason?: string | null;
  resolutionNote?: string | null;
  tenantId?: string;
}) {
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

  // Normalize phone number to international standard (972...)
  let cleanPhone = params.phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0") && cleanPhone.length === 10) {
    cleanPhone = "972" + cleanPhone.substring(1);
  }

  // Format Location block using tenant's custom bold RTL style dynamically
  let locationLabel = "רחוב";
  let subLocationLabel = "אזור";
  let tenantName = "ועד הבית"; // fallback default

  if (params.tenantId) {
    try {
      const tenantDoc = await db.collection("tenants").doc(params.tenantId).get();
      const tenantData = tenantDoc.data() || {};
      if (tenantData.name) tenantName = tenantData.name;
      const uiConfig = tenantData.uiConfig || {};
      if (uiConfig.locationLabel) locationLabel = uiConfig.locationLabel;
      if (uiConfig.subLocationLabel) subLocationLabel = uiConfig.subLocationLabel;
    } catch (err) {
      logger.warn(`Failed to fetch custom labels for tenant ${params.tenantId}, using defaults.`, err);
    }
  }

  let formattedLocation = "";
  const locationParts: string[] = [];
  if (params.subLocation) {
    locationParts.push(`*${subLocationLabel}*: ${params.subLocation}`);
  }
  if (params.location) {
    locationParts.push(`*${locationLabel}*: ${params.location}`);
  }
  if (locationParts.length > 0) {
    formattedLocation = locationParts.join(" • ");
  } else {
    formattedLocation = "לא צוין מיקום";
  }

  const parameters: any[] = [
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

    const resData: any = await response.json();
    if (!response.ok) {
      logger.error(`Meta API returned error for resident ${cleanPhone}:`, resData);
    } else {
      logger.info(`WhatsApp alert successfully sent to resident ${cleanPhone}`, { messageId: resData.messages?.[0]?.id });
    }
  } catch (err) {
    logger.error(`Exception while sending WhatsApp resident alert to ${cleanPhone}:`, err);
  }
}


function detectAudioMimeType(buffer: Buffer): string {
  // WebM / EBML magic numbers: 1A 45 DF A3
  if (buffer.length > 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }
  // MP4 / M4A: check for 'ftyp' at bytes 4-7
  if (buffer.length > 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }
  // AAC ADTS: starts with 0xFFF1 or 0xFFF9 (binary 111111111111)
  if (buffer.length > 2 && buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) {
    return 'audio/aac';
  }
  // OGG: starts with 'OggS'
  if (buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  // WAV: RIFF ... WAVE
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  return 'audio/webm'; // fallback
}

/**
 * Final step: Actually create the ticket in Firestore.
 */
export const createTicket = onRequest({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
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

    // Clean up imageId - if it starts with 'hidden-' it means no real image was taken
    const isRealImage = imageId && typeof imageId === 'string' && !imageId.startsWith('hidden-');
    const finalImageId = isRealImage ? imageId : null;

    // Fetch tenant to determine type for custom error messages
    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    const tenantType = tenantDoc.data()?.type || 'building';
    const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';

    // Authenticate Reporter
    const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
    if (!reporterDoc.exists) {
      res.status(403).send({
        error: "Unauthorized",
        message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
      });
      return;
    }

    // Rate Limiting: Max 3 tickets per 1 minute per tenant
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

    // Use a Transaction to increment the counter and create the ticket atomically
    const tenantRef = db.collection("tenants").doc(tenantId);
    // If we have a real image, use its ID as the document ID for deduplication. 
    // Otherwise, let Firestore generate a random ID.
    const ticketsCol = db.collection("tenants").doc(tenantId).collection("tickets");
    const ticketRef = isRealImage ? ticketsCol.doc(imageId) : ticketsCol.doc(randomUUID());
    const ticketId = ticketRef.id;

    let ticketNumber = 0;
    try {
      ticketNumber = await db.runTransaction(async (transaction) => {
        const tenantSnap = await transaction.get(tenantRef);
        const tenantData = tenantSnap.data() || {};
        const currentCount = tenantData.lastTicketNumber || 0;
        const nextNumber = currentCount + 1;

        // Update the counter in the tenant document
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
          ticketNumber: nextNumber, // THE TICKET COUNTER
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastStatusChangeAt: new Date().toISOString(), // SLA tracking
          total_days_in_new: 0,
          total_days_in_progress: 0,
          stagnationDays: 0,
          slaStatus: 'none',
          adminComments: [] as any[]
        };

        transaction.set(ticketRef, ticketData);
        return nextNumber;
      });

      // Increment overall tickets counter in global stats (Option B)
      try {
        await db.collection("global_stats").doc("counters").set({
          totalTicketsCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      } catch (err: any) {
        logger.error("Failed to increment global tickets counter", { error: err.message });
      }

      // If audio is provided, upload to GCS (Done outside transaction)
      if (req.body.audioBase64) {
        const bucket = admin.storage().bucket();
        const audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
        const mimeType = detectAudioMimeType(audioBuffer);
        logger.info(`Processing audio for ${tenantId}. Buffer size: ${audioBuffer.length} bytes, detected MIME: ${mimeType}`);

        // Save only as .webm in GCS (with the correct detected mimeType) to keep storage clean
        const audioFileWebm = bucket.file(`tenants/${tenantId}/${ticketId}.webm`);
        await audioFileWebm.save(audioBuffer, {
          metadata: { contentType: mimeType }
        });

        logger.info("Audio note uploaded successfully", { tenantId, ticketId });
      }

      // Record Audit Log (Success)
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

      // Fetch administrative users who have configured phone numbers to notify them
      const adminUsersSnap = await tenantRef.collection("adminUsers").get();
      const admins: { name: string; phone: string }[] = [];
      adminUsersSnap.forEach((userDoc) => {
        const data = userDoc.data();
        if (data && data.mobile && data.mobile.trim()) {
          admins.push({
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
            phone: data.mobile.trim(),
          });
        }
      });

      // Dispatch WhatsApp Template Alerts!
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

      // Dispatch WhatsApp Template Confirmation to Resident!
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

    } catch (txError: any) {
      logger.error("Transaction failed", { error: txError.message });
      res.status(500).send({ error: "Failed to create ticket", details: txError.message });
    }
  } catch (error: any) {
    logger.error("createTicket failed", { error, body: req.body });

    // Record Audit Log (Error)
    if (req.body.tenantId && req.body.reporterPhone) {
      await recordAuditLog({
        tenantId: req.body.tenantId,
        action: 'TICKET_CREATED',
        level: 'ERROR',
        actor: {
          uid: req.body.reporterPhone,
          name: 'Resident', // In error state we might not have the name yet
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

export const submitAppFeedback = onRequest({ cors: true }, async (req, res) => {
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

    // Increment global rating counters (Option B)
    try {
      await db.collection("global_stats").doc("counters").set({
        ratingSum: admin.firestore.FieldValue.increment(rating),
        ratingCount: admin.firestore.FieldValue.increment(1),
        [`ratingCount_${rating}`]: admin.firestore.FieldValue.increment(1)
      }, { merge: true });
    } catch (err: any) {
      logger.error("Failed to update global stats rating", { error: err.message });
    }

    // Record Audit Log
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
  } catch (error: any) {
    logger.error("submitAppFeedback failed", { error: error.message });
    res.status(500).send({ error: "Failed to submit feedback" });
  }
});

export const landingMetrics = onRequest({ cors: true }, async (req, res) => {
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

    let satisfactionRate = 98; // Fallback default
    if (ratingCount > 0) {
      satisfactionRate = Math.round((ratingSum / (ratingCount * 5)) * 100);
    }

    res.status(200).send({
      totalTickets: totalTicketsCount,
      satisfactionRate
    });
  } catch (error: any) {
    logger.error("landingMetrics failed", { error: error.message });
    res.status(500).send({ error: "Failed to load landing metrics" });
  }
});

export const getTenantInfo = onRequest({ cors: true }, async (req, res) => {
  const { tenantId } = req.query;

  if (!tenantId) {
    res.status(400).send({ error: "Missing tenantId" });
    return;
  }

  try {
    const tenantRef = db.collection("tenants").doc(tenantId as string);
    const doc = await tenantRef.get();
    if (!doc.exists) {
      res.status(404).send({ error: "Tenant not found" });
      return;
    }
    const tData = doc.data();

    // Fetch administrative users who have configured phone numbers
    const adminUsersSnap = await tenantRef.collection("adminUsers").get();
    const admins: { name: string; phone: string }[] = [];
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
  } catch (error) {
    logger.error("Database error in getTenantInfo", { error });
    res.status(500).send({ error: "Database error" });
  }
});

export const getResidentTickets = onRequest({ cors: true }, async (req, res) => {
  try {
    const { tenantId, reporterPhone } = req.body;
    if (!tenantId) {
      res.status(400).send({ error: "Missing tenantId" });
      return;
    }

    // Authenticate reporter phone
    if (!reporterPhone) {
      res.status(401).send({ error: "Missing reporterPhone" });
      return;
    }

    const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
    if (!reporterDoc.exists) {
      // Fetch tenant to determine type for custom error messages
      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      const tenantType = tenantDoc.data()?.type || 'building';
      const contactTarget = tenantType === 'municipality' ? 'המשרד' : 'ועד הבית';
      res.status(403).send({
        error: "Unauthorized",
        message: `מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ${contactTarget} לאישור השתתפות במערכת הדיווחים.`
      });
      return;
    }

    // Fetch all tickets of the building once
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
        reporterPhone: data.reporterPhone
      };
    });

    // 1. Filter My Tickets (past 12 months)
    let myTickets: any[] = [];
    if (reporterPhone) {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const twelveMonthsAgoStr = twelveMonthsAgo.toISOString();

      myTickets = allTickets
        .filter(t => t.reporterPhone === reporterPhone && t.createdAt >= twelveMonthsAgoStr)
        .map(t => {
          const { reporterPhone: _, ...rest } = t;
          return rest;
        });
      myTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // 2. Filter Open Tickets (status open or in-progress) and anonymize
    const openTickets = allTickets
      .filter(t => ['open', 'in-progress'].includes(t.status))
      .map(t => {
        const isMyTicket = !!(reporterPhone && t.reporterPhone === reporterPhone);
        const { reporterPhone: _, ...rest } = t;
        return {
          ...rest,
          isMyTicket
        };
      });
    openTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.status(200).send({ myTickets, openTickets });
  } catch (error: any) {
    logger.error("getResidentTickets failed", { error: error.message });
    res.status(500).send({ error: "Failed to load resident tickets" });
  }
});

export const addResidentComment = onRequest({ cors: true }, async (req, res) => {
  try {
    const { tenantId, ticketId, commentText, reporterPhone } = req.body;
    if (!tenantId || !ticketId || !commentText) {
      res.status(400).send({ error: "Missing required fields" });
      return;
    }

    // Authenticate reporter
    if (!reporterPhone) {
      res.status(400).send({ error: "Missing reporterPhone" });
      return;
    }
    const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
    if (!reporterDoc.exists) {
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

    const reporterName = reporterDoc.data()?.name || "תושב";

    const commentObj = {
      text: commentText,
      createdAt: new Date().toISOString(),
      author: "תושב"
    };

    const adminCommentObj = {
      id: randomUUID(),
      text: commentText,
      createdAt: new Date().toISOString(),
      authorName: reporterName
    };

    await ticketRef.update({
      timeline: admin.firestore.FieldValue.arrayUnion(commentObj),
      adminComments: admin.firestore.FieldValue.arrayUnion(adminCommentObj),
      updatedAt: new Date().toISOString()
    });

    // Record Audit Log
    const auditMsg = `Resident added comment to ticket #${ticketNumber} in building ${tenantId}`;
    await recordAuditLog({
      tenantId,
      action: 'RESIDENT_COMMENT_ADDED',
      level: 'INFO',
      actor: {
        uid: reporterPhone,
        name: reporterDoc.data()?.name || reporterPhone,
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
  } catch (error: any) {
    logger.error("addResidentComment failed", { error: error.message });
    res.status(500).send({ error: "Failed to add comment" });
  }
});

export const incrementMeToo = onRequest({ cors: true }, async (req, res) => {
  try {
    const { tenantId, ticketId, reporterPhone } = req.body;
    if (!tenantId || !ticketId || !reporterPhone) {
      res.status(400).send({ error: "Missing required fields" });
      return;
    }

    // Authenticate reporter
    const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(reporterPhone).get();
    if (!reporterDoc.exists) {
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

    // Hardening: Resident cannot vote for their own ticket
    if (ticketData.reporterPhone === reporterPhone) {
      res.status(400).send({ error: "Cannot vote for your own ticket" });
      return;
    }

    // Hardening: Prevent duplicate votes
    const meTooReporters = ticketData.meTooReporters || [];
    const alreadyVoted = meTooReporters.some((r: any) => r.phone === reporterPhone);
    if (alreadyVoted) {
      res.status(400).send({ error: "You have already voted for this ticket" });
      return;
    }

    const reporterName = reporterDoc.data()?.name || "תושב";
    const newVoter = {
      name: reporterName,
      phone: reporterPhone,
      votedAt: new Date().toISOString()
    };

    await ticketRef.update({
      meToo: admin.firestore.FieldValue.increment(1),
      meTooReporters: admin.firestore.FieldValue.arrayUnion(newVoter),
      updatedAt: new Date().toISOString()
    });

    // Record Audit Log
    const auditMsg = `Resident clicked Me Too on ticket #${ticketNumber} in building ${tenantId}`;
    await recordAuditLog({
      tenantId,
      action: 'RESIDENT_METOO_INCREMENTED',
      level: 'INFO',
      actor: {
        uid: reporterPhone,
        name: reporterDoc.data()?.name || reporterPhone,
        type: 'resident'
      },
      details: {
        ticketId,
        ticketNumber,
        message: auditMsg
      }
    });

    res.status(200).send({ success: true });
  } catch (error: any) {
    logger.error("incrementMeToo failed", { error: error.message });
    res.status(500).send({ error: "Failed to increment Me Too counter" });
  }
});

export const getImage = onRequest({ cors: true }, async (req, res) => {
  let tenantId = "";
  let imageId = "";

  const queryPath = req.query.path as string;
  if (queryPath) {
    const parts = queryPath.split('/');
    tenantId = parts[0];
    imageId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
  } else {
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
  } catch (err) {
    res.status(500).send("Server error generating image link");
  }
});

export const getAudio = onRequest({ cors: true }, async (req, res) => {
  let tenantId = "";
  let audioId = "";

  const queryPath = req.query.path as string;
  if (queryPath) {
    const parts = queryPath.split('/');
    tenantId = parts[0];
    audioId = parts[1] ? parts[1].replace(/\.[^/.]+$/, "") : "";
  } else {
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
    
    // First, try the standard .webm extension (optimized for new & legacy files)
    let file = bucket.file(`tenants/${tenantId}/${audioId}.webm`);
    let [exists] = await file.exists();

    // Fall back to extensionless file (for compatibility with temporary build files)
    if (!exists) {
      file = bucket.file(`tenants/${tenantId}/${audioId}`);
      [exists] = await file.exists();
    }

    if (!exists) {
      res.status(404).send("Audio not found");
      return;
    }

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2100'
    });

    res.redirect(302, url);
  } catch (err) {
    res.status(500).send("Server error generating audio link");
  }
});

/**
 * Secure Admin User Management
 * This function handles Firebase Auth operations (Create/Update/Delete)
 * and syncs with Firestore metadata.
 */
export const manageTenantUser = onRequest({ cors: true }, async (req, res) => {
  try {
    const { action, tenantId, userData, callerUid } = req.body;

    if (!tenantId || !action) {
      res.status(400).send({ error: "Missing required fields" });
      return;
    }

    // 1. Authorization: Verify caller is an admin of the tenant OR a Super Admin
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
      } catch (e) {
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

        // Validation
        if (!email || !firstName || !lastName) throw new Error("Missing mandatory fields");
        if (firstName.length > 20 || lastName.length > 20) throw new Error("Names must be 20 characters or less");
        if (!email.includes('@')) throw new Error("Invalid email format");

        // 5-User Limit Check
        const existingUsersSnapshot = await tenantRef.collection("adminUsers").get();
        if (existingUsersSnapshot.size >= 5) {
          throw new Error("Maximum of 5 users reached for this tenant");
        }

        let uid: string;
        try {
          // Check if user already exists in Firebase Auth
          const existingUser = await auth.getUserByEmail(email);
          uid = existingUser.uid;
          logger.info("Using existing user for new tenant association", { email, uid, tenantId });
        } catch (e: any) {
          if (e.code === 'auth/user-not-found') {
            // a. Create in Firebase Auth
            const userRecord = await auth.createUser({
              email,
              password: password || Math.random().toString(36).slice(-8), // Temporary password if not provided
              displayName: `${firstName} ${lastName}`
            });
            uid = userRecord.uid;
            logger.info("Created new user for tenant association", { email, uid, tenantId });
          } else {
            throw e;
          }
        }

        // b. Create Metadata in subcollection
        await tenantRef.collection("adminUsers").doc(uid).set({
          firstName,
          lastName,
          email,
          mobile: mobile || "",
          role: 'admin',
          createdAt: new Date().toISOString()
        });

        // c. Update core adminUids array
        await tenantRef.update({
          adminUids: admin.firestore.FieldValue.arrayUnion(uid)
        });

        res.status(200).send({ success: true, uid });
        break;
      }

      case 'delete': {
        const { uid } = userData;
        if (!uid) throw new Error("Missing uid for deletion");

        // Survivor Check: Cannot delete the last admin
        if (adminUids.length <= 1) {
          throw new Error("Cannot delete the last administrator");
        }

        // a. Remove from Metadata (This tenant only)
        await tenantRef.collection("adminUsers").doc(uid).delete();

        // b. Update core adminUids array (This tenant only)
        await tenantRef.update({
          adminUids: admin.firestore.FieldValue.arrayRemove(uid)
        });

        // NOTE: We do NOT delete the user from Firebase Auth globally, 
        // as they might be associated with other tenants.

        res.status(200).send({ success: true });
        break;
      }

      case 'resetPassword': {
        const { email } = userData;
        if (!email) throw new Error("Missing email for reset");

        const link = await auth.generatePasswordResetLink(email);
        res.status(200).send({ success: true, link });
        break;
      }

      case 'update': {
        const { uid, firstName, lastName, mobile } = userData;
        if (!uid) throw new Error("Missing uid for update");

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
  } catch (err: any) {
    logger.error("User Management failed", { message: err.message });
    res.status(500).send({ error: err.message });
  }
});


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

    // Dispatch automated WhatsApp resident updates based on new status
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

/**
 * WhatsApp Webhook: Handles Meta developer platform challenge verification
 * and sends an automated Hebrew reply to any user messaging the business number.
 */
export const whatsappWebhook = onRequest({ cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] }, async (req, res) => {
  // 1. Handle Meta Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Standard static verification token used in TikTak developer portal configuration
    const VERIFY_TOKEN = "tiktak_webhook_verify_token_2026";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      logger.info("WhatsApp Webhook verified successfully");
      res.status(200).send(challenge);
    } else {
      logger.warn("WhatsApp Webhook verification failed", { mode, token });
      res.status(403).send("Forbidden");
    }
    return;
  }

  // 2. Handle Incoming WhatsApp Message (POST)
  if (req.method === "POST") {
    try {
      const body = req.body;
      logger.info("Received WhatsApp Webhook POST payload", { structuredData: true, body: JSON.stringify(body) });

      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        // Ensure we only process if a valid messages array is present (actual incoming user messages)
        if (value && value.messages && value.messages.length > 0) {
          const message = value.messages[0];
          const from = message.from; // Sender's phone number

          if (from) {
            const token = process.env.WHATSAPP_ACCESS_TOKEN;
            const phoneNumberId = value.metadata?.phone_number_id || "1046588828547584";

            if (!token) {
              logger.error("WHATSAPP_ACCESS_TOKEN is not configured in secret manager for auto-reply");
              res.status(500).send("Access token missing");
              return;
            }

            let isFeedback = false;
            let feedbackValue: 'good' | 'ok' | 'bad' | null = null;

            if (message.type === 'button') {
              const payload = (message.button?.payload || '').toLowerCase();
              const text = message.button?.text || '';

              if (payload === 'service_feedback_good' || payload.includes('good') || payload.includes('מצוין') || text.includes('מצוין')) {
                feedbackValue = 'good';
              } else if (payload === 'service_feedback_ok' || payload.includes('ok') || payload.includes('בסדר') || text.includes('בסדר')) {
                feedbackValue = 'ok';
              } else if (payload === 'service_feedback_bad' || payload.includes('bad') || payload.includes('לא מרוצה') || text.includes('לא מרוצה')) {
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
                  return (
                    ['resolved', 'dismissed'].includes(data.status) &&
                    createdAtMs >= fortyEightHoursAgoMs &&
                    !data.vaadRating
                  );
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
              } catch (e: any) {
                logger.error("Failed to update service feedback from WhatsApp webhook", { error: e.message });
              }
            }

            let shouldSendReply = true;
            let autoReplyText = "";

            if (message.type === 'button') {
              // Only send a reply if it is a valid feedback button (we always thank them for rating)
              if (feedbackValue) {
                autoReplyText = `תודה על הדירוג! המשוב שלך עוזר לנו לשפר את השירות לתושב/דייר. 🏡`;
              } else {
                shouldSendReply = false;
              }
            } else {
              // User wrote/sent something other than a button click
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

              const resData: any = await response.json();
              if (!response.ok) {
                logger.error(`Meta API returned error during automated reply to ${from}:`, resData);
              } else {
                logger.info(`Automated reply successfully sent to ${from}`, { messageId: resData.messages?.[0]?.id });
              }
            } else {
              logger.info(`Button click but not feedback or no auto-reply required for ${from}, skipping response.`);
            }
          }
        }
      }

      res.status(200).send("EVENT_RECEIVED");
    } catch (error: any) {
      logger.error("Error processing WhatsApp Webhook", { error: error.message });
      res.status(500).send("Internal Server Error");
    }
    return;
  }

  res.status(405).send("Method Not Allowed");
});
