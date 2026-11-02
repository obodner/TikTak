import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
import {
  db,
  storage,
  admin,
  recordAuditLog,
  findAndValidateReporter,
  resolveEndpointName
} from "../shared/context";
import {
  sendWhatsAppNotification,
  sendResidentWhatsAppNotification,
  checkAndDispatchQuotaAlerts
} from "../shared/whatsappService";
import {
  validateImageBuffer,
  checkRateLimit,
  verifyAppCheckHeader
} from "../utils/securityGuards";
import { classifyMaintenanceIncident } from "../utils/aiEngine";

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

export async function handleHealth(_req: any, res: any) {
  logger.info("Health check requested", { structuredData: true });
  res.send({ status: "ok", timestamp: new Date().toISOString() });
}

export async function handleAnalyzeImage(req: any, res: any) {
  try {
    // 1. IP Rate Limiting Guard (Anti-DoW / Anti-Automation)
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown-ip";
    const rateLimit = checkRateLimit(`analyzeImage:${clientIp}`, 20, 5 * 60 * 1000); // 20 requests per 5 minutes
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

    // 1.1 Firebase App Check Guard (Web Anti-Scraping / Bot Defense)
    const appCheckToken = req.headers["x-firebase-appcheck"] as string | undefined;
    const appCheckRes = await verifyAppCheckHeader(appCheckToken, process.env.APP_CHECK_STRICT === "true");
    if (!appCheckRes.valid) {
      logger.warn("analyzeImage App Check rejected request", { clientIp, error: appCheckRes.error });
      res.status(401).send({ error: appCheckRes.error || "Unauthorized App Check" });
      return;
    }

    // 2. Payload Validation & Size Ceiling (Max 5MB base64 string)
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

    // 3. Decode & Inspect Magic Bytes (Reject SVGs, scripts, executables, or corrupt buffers)
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(base64Image, "base64");
    } catch {
      res.status(400).send({ error: "Invalid base64 encoding" });
      return;
    }

    const validation = validateImageBuffer(imageBuffer);
    if (!validation.valid) {
      logger.warn("analyzeImage rejected invalid file header", { error: validation.error, clientIp });
      res.status(415).send({ error: validation.error || "Unsupported media type" });
      return;
    }
    const effectiveMime = validation.detectedMime || mimeType || "image/jpeg";

    // 4. Pre-Flight Tenant Validation (Prevent arbitrary GCS upload or unmetered Gemini calls)
    const safeTenantId = tenantId ? String(tenantId).trim() : null;
    if (!safeTenantId) {
      res.status(400).send({ error: "Missing required tenantId" });
      return;
    }

    const tenantDoc = await db.collection("tenants").doc(safeTenantId).get();
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

    // 5. Kick off Google Cloud Storage Image Upload only after validation
    const imageId = randomUUID();
    const bucket = storage.bucket();
    const file = bucket.file(`tenants/${safeTenantId}/${imageId}.jpg`);

    const uploadPromise = file.save(imageBuffer, {
      metadata: { contentType: effectiveMime }
    });

    // 6. Tenant Context & Structured Schema Definition
    const lang = tData.language || "he";
    const type = tData.type || "building";
    const rawCategories: string[] = tData.config?.categories || ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"];
    const categoriesList = Array.from(new Set(rawCategories.map((c: string) => String(c).trim()).filter(Boolean)));
    if (!categoriesList.includes("אחר")) {
      categoriesList.push("אחר");
    }

    const entityContext = type === "municipality"
      ? "a public space, street, facility, or municipal infrastructure hazard (e.g. electrical wiring, lighting defect, pothole, street light, waste, safety hazard)"
      : "a building or facility maintenance issue (e.g. electrical wiring, lighting defect, leak, broken bulb, elevator failure, safety hazard)";

    logger.info("Executing Enterprise AI Inference...", { tenantId: safeTenantId, clientIp });

    let finalData: any = {};
    let isAiFallback = false;

    try {
      const aiResult = await classifyMaintenanceIncident({
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

      // Correlate and record AI Token Telemetry into Audit Logs
      await recordAuditLog({
        tenantId: safeTenantId,
        action: "AI_IMAGE_ANALYSIS",
        level: "INFO",
        actor: { uid: "system", name: "TikTak AI", type: "system" as any },
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
    } catch (aiErr: any) {
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

    // Ensure the upload completes before returning
    await uploadPromise;

    finalData.imageId = imageId;
    if (isAiFallback) {
      finalData.ai_fallback = true;
    }

    // Hardening: Map 'severity' to 'urgency' if AI hallucinations
    if (!finalData.urgency && (finalData as any).severity) {
      finalData.urgency = (finalData as any).severity;
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
  } catch (error: any) {
    logger.error("AI Analysis failed completely", {
      message: error.message,
      stack: error.stack,
      errorDetails: error
    });
    res.status(500).send({ error: "Failed to analyze image", details: error.message });
  }
}

export async function handleCheckAuth(req: any, res: any) {
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
  } catch (error: any) {
    logger.error("checkAuth failed", { message: error.message });
    res.status(500).send({ authorized: false, error: "Internal server error" });
  }
}

export async function handleCreateTicket(req: any, res: any) {
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

    // Clean up imageId - if it starts with 'hidden-' it means no real image was taken
    const isRealImage = imageId && typeof imageId === 'string' && !imageId.startsWith('hidden-');
    let finalImageId = isRealImage ? imageId : null;

    // Fallback: If imageId is missing but base64Image was provided (e.g. offline during analyzeImage), upload now
    if (!finalImageId && base64Image) {
      try {
        const fallbackImageId = randomUUID();
        const safeTenantId = tenantId || 'default-tenant';
        const bucket = storage.bucket();
        const file = bucket.file(`tenants/${safeTenantId}/${fallbackImageId}.jpg`);
        const imageBuffer = Buffer.from(base64Image, 'base64');
        await file.save(imageBuffer, {
          metadata: { contentType: mimeType || 'image/jpeg' }
        });
        finalImageId = fallbackImageId;
      } catch (uploadErr) {
        logger.error("Failed to upload fallback base64Image in createTicket", { uploadErr });
      }
    }

    // Fetch tenant to determine type for custom error messages
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

    if (tenantData.parentEnterpriseId) {
      const parentDoc = await db.collection("tenants").doc(tenantData.parentEnterpriseId).get();
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

    // Authenticate Reporter
    const { authorized, reporterName, cleanPhone } = await findAndValidateReporter(tenantId, reporterPhone);
    if (!authorized) {
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
    const ticketsCol = db.collection("tenants").doc(tenantId).collection("tickets");
    const ticketRef = ticketsCol.doc(randomUUID());
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
          source: source === 'whatsapp' ? 'whatsapp' : 'web',
          reportingMethod: source === 'whatsapp'
            ? (req.body.reportingMethod || 'manual')
            : (source || (isRealImage ? 'ai_camera' : 'manual')),
          imageId: finalImageId,
          audioId: req.body.audioBase64 ? ticketId : null,
          reporterPhone: cleanPhone || reporterPhone || null,
          reporterName: reporterName || null,
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

      // Increment tenant subscription ticket metering counter
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
      } catch (subErr: any) {
        logger.error("Failed to increment tenant subscription ticket counter in createTicket", { tenantId, error: subErr.message });
      }

      // If audio is provided, upload to GCS (Done outside transaction)
      if (req.body.audioBase64) {
        const bucket = admin.storage().bucket();
        const audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
        const mimeType = detectAudioMimeType(audioBuffer);
        const extMap: Record<string, string> = {
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

      // Record Audit Log (Success)
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
        reporterName: reporterName || null,
        imageId: finalImageId,
        audioId: req.body.audioBase64 ? ticketId : null,
        admins
      });

      // Dispatch WhatsApp Template Confirmation to Resident!
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

export async function handleSubmitAppFeedback(req: any, res: any) {
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
}

export async function handleLandingMetrics(_req: any, res: any) {
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
}

export async function handleGetTenantInfo(req: any, res: any) {
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

    // Check freeze status (including parent fleet master if applicable)
    let isFrozen = tData?.isActive === false || tData?.subscription?.status === 'frozen';
    if (!isFrozen && tData?.parentEnterpriseId) {
      try {
        const parentDoc = await db.collection("tenants").doc(tData.parentEnterpriseId).get();
        if (parentDoc.exists) {
          const pData = parentDoc.data();
          if (pData?.isActive === false || pData?.subscription?.status === 'frozen') {
            isFrozen = true;
          }
        }
      } catch (pErr) {
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
  } catch (error) {
    logger.error("Database error in getTenantInfo", { error });
    res.status(500).send({ error: "Database error" });
  }
}

export async function handleGetResidentTickets(req: any, res: any) {
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

    const { authorized, cleanPhone } = await findAndValidateReporter(tenantId, reporterPhone);
    if (!authorized) {
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
        reporterPhone: data.reporterPhone,
        meTooReporters: data.meTooReporters || []
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
          const { reporterPhone: _, meTooReporters: __, ...rest } = t;
          return rest;
        });
      myTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // 2. Filter Open Tickets (status open or in-progress) and anonymize
    const openTickets = allTickets
      .filter(t => ['open', 'in-progress'].includes(t.status))
      .map(t => {
        const isMyTicket = !!(reporterPhone && t.reporterPhone === reporterPhone);
        const meTooReporters = t.meTooReporters || [];
        const hasVotedMeToo = !!(reporterPhone && meTooReporters.some((r: any) => r.phone === cleanPhone || r.phone === reporterPhone));
        const { reporterPhone: _, meTooReporters: __, ...rest } = t;
        return {
          ...rest,
          isMyTicket,
          hasVotedMeToo
        };
      });
    openTickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.status(200).send({ myTickets, openTickets });
  } catch (error: any) {
    logger.error("getResidentTickets failed", { error: error.message });
    res.status(500).send({ error: "Failed to load resident tickets" });
  }
}

export async function handleAddResidentComment(req: any, res: any) {
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
  } catch (error: any) {
    logger.error("addResidentComment failed", { error: error.message });
    res.status(500).send({ error: "Failed to add comment" });
  }
}

export async function handleIncrementMeToo(req: any, res: any) {
  try {
    const { tenantId, ticketId, reporterPhone } = req.body;
    if (!tenantId || !ticketId || !reporterPhone) {
      res.status(400).send({ error: "Missing required fields" });
      return;
    }

    // Authenticate reporter
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

    // Hardening: Resident cannot vote for their own ticket
    const effectivePhone = meTooCleanPhone || reporterPhone;
    if (ticketData.reporterPhone === effectivePhone) {
      res.status(400).send({ error: "Cannot vote for your own ticket" });
      return;
    }

    const { action } = req.body; // 'add' | 'remove' | 'toggle'
    const meTooReporters = ticketData.meTooReporters || [];
    const alreadyVoted = meTooReporters.some((r: any) => r.phone === effectivePhone);

    const shouldRemove = action === 'remove' || (action !== 'add' && alreadyVoted);

    if (shouldRemove) {
      if (!alreadyVoted) {
        res.status(400).send({ error: "You have not added yourself to this ticket" });
        return;
      }

      const updatedReporters = meTooReporters.filter((r: any) => r.phone !== effectivePhone);
      const newCount = Math.max(0, (ticketData.meToo || 1) - 1);

      await ticketRef.update({
        meToo: newCount,
        meTooReporters: updatedReporters,
        updatedAt: new Date().toISOString()
      });

      // Record Audit Log
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

    // Record Audit Log
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
  } catch (error: any) {
    logger.error("incrementMeToo failed", { error: error.message });
    res.status(500).send({ error: "Failed to update Me Too counter" });
  }
}

export async function handleValidateInvite(req: any, res: any) {
  try {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown-ip";
    const rateLimit = checkRateLimit(`validateInvite:${clientIp}`, 40, 5 * 60 * 1000);
    if (!rateLimit.allowed) {
      res.status(429).send({ valid: false, error: "חריגה ממספר הניסיונות המותר. אנא המתן מספר דקות." });
      return;
    }

    let token = (req.query?.token || req.body?.token || "").trim();
    let tenantId = (req.query?.tenantId || req.body?.tenantId || "").trim();

    // Support combined slug "tenantId__token"
    if (token.includes("__")) {
      const parts = token.split("__");
      tenantId = parts[0];
      token = parts[1];
    }

    if (!token) {
      res.status(400).send({ valid: false, error: "Missing token" });
      return;
    }

    let inviteDoc: any = null;
    let foundTenantId = tenantId;

    if (tenantId) {
      const docSnap = await db.collection("tenants").doc(tenantId).collection("invites").doc(token).get();
      if (docSnap.exists) {
        inviteDoc = docSnap;
      }
    }

    if (!inviteDoc) {
      // Fallback search across invites collection group
      const q = await db.collectionGroup("invites").where("token", "==", token).limit(1).get();
      if (!q.empty) {
        inviteDoc = q.docs[0];
        foundTenantId = inviteDoc.data()?.tenantId || inviteDoc.ref.parent.parent?.id;
      }
    }

    if (!inviteDoc || !inviteDoc.exists) {
      res.status(404).send({
        valid: false,
        reason: "NOT_FOUND",
        message: "קישור ההצטרפות אינו קיים במערכת."
      });
      return;
    }

    const data = inviteDoc.data();
    const now = new Date();
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);

    // Fetch tenant name & address
    const tSnap = await db.collection("tenants").doc(foundTenantId).get();
    const tData = tSnap.data() || {};
    const tenantType = tData.type || "building";
    const contactTarget = tenantType === "municipality" ? "למוקד השירות" : "לוועד הבית";

    if (data.status === "revoked") {
      res.status(410).send({
        valid: false,
        reason: "REVOKED",
        message: `קישור ההצטרפות בוטל על ידי ${contactTarget}.`
      });
      return;
    }

    if (expiresAt < now) {
      inviteDoc.ref.update({ status: "expired" }).catch(() => {});
      res.status(410).send({
        valid: false,
        reason: "EXPIRED",
        message: `תוקף קישור ההצטרפות פג. אנא פנה ${contactTarget} לקבלת קישור חדש.`
      });
      return;
    }

    if (data.inviteType === "single" && (data.useCount || 0) >= 1) {
      res.status(409).send({
        valid: false,
        reason: "ALREADY_USED",
        message: "קישור אישי זה כבר נוצל להרשמה."
      });
      return;
    }

    res.status(200).send({
      valid: true,
      token,
      tenantId: foundTenantId,
      buildingName: tData.name || (tenantType === "municipality" ? "רשות מקומית" : "בניין מגורים"),
      buildingAddress: tData.address || "",
      tenantType,
      inviteType: data.inviteType || "single",
      expiresAt: expiresAt.toISOString()
    });
  } catch (err: any) {
    logger.error("Exception in validateInvite:", err);
    res.status(500).send({ valid: false, error: err.message || "Failed to validate invite" });
  }
}

export async function handleSubmitResidentSelfOnboard(req: any, res: any) {
  try {
    let { tenantId, token, name, phone } = req.body;

    if (token && token.includes("__")) {
      const parts = token.split("__");
      if (!tenantId) tenantId = parts[0];
      token = parts[1];
    }

    if (!tenantId || !token || !name || !phone) {
      res.status(400).send({ error: "נא למלא את כל שדות החובה (שם מלא ומספר טלפון נייד)." });
      return;
    }

    const trimmedName = String(name).trim();
    if (!/^[\u0590-\u05FFa-zA-Z0-9\s-]+$/.test(trimmedName)) {
      res.status(400).send({ error: "השם מכיל תווים לא חוקיים. מותרים רק אותיות, מספרים, רווחים ומקפים." });
      return;
    }

    let cleanPhone = String(phone).replace(/\D/g, "");
    if (cleanPhone.startsWith("972") && cleanPhone.length === 12) {
      cleanPhone = "0" + cleanPhone.substring(3);
    }
    if (cleanPhone.length === 9 && !cleanPhone.startsWith("0")) {
      cleanPhone = "0" + cleanPhone;
    }

    if (!/^0\d{8,9}$/.test(cleanPhone)) {
      res.status(400).send({ error: "מספר הטלפון לא תקין. מספר תקין בישראל מתחיל ב-0 ומכיל 9-10 ספרות." });
      return;
    }

    // 1. Dual-Tier Burst-Hardened Rate Limiting:
    // A) Shared Wi-Fi / NAT friendly: Allows up to 100 requests per 5 minutes per IP
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown-ip";
    const ipLimit = checkRateLimit(`selfOnboardIp:${clientIp}`, 100, 5 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.status(429).send({ error: "חריגה ממספר הניסיונות המותר מכתובת זו. אנא המתן מספר דקות." });
      return;
    }

    // B) Phone-scoped spam protection: Max 5 submissions per 5 minutes per phone number
    const phoneLimit = checkRateLimit(`selfOnboardPhone:${cleanPhone}`, 5, 5 * 60 * 1000);
    if (!phoneLimit.allowed) {
      res.status(429).send({ error: "חריגה ממספר הניסיונות עבור מספר טלפון זה. אנא המתן מספר דקות." });
      return;
    }

    const tenantRef = db.collection("tenants").doc(tenantId);
    const inviteRef = tenantRef.collection("invites").doc(token);
    const reporterRef = tenantRef.collection("reporters").doc(cleanPhone);

    const [tSnap, inviteSnap] = await Promise.all([
      tenantRef.get(),
      inviteRef.get()
    ]);

    if (!tSnap.exists) {
      res.status(404).send({ error: "הבניין לא נמצא במערכת." });
      return;
    }

    const tenantType = tSnap.data()?.type || "building";
    const buildingName = tSnap.data()?.name || (tenantType === "municipality" ? "הרשות המקומית" : "הבניין");

    if (!inviteSnap.exists) {
      res.status(404).send({ error: "קישור ההצטרפות אינו קיים במערכת." });
      return;
    }

    const inviteData = inviteSnap.data() || {};
    const now = new Date();
    const expiresAt = inviteData.expiresAt?.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt);

    if (inviteData.status === "revoked") {
      res.status(410).send({ error: "קישור ההצטרפות בוטל על ידי ועד הבית / מוקד השירות." });
      return;
    }

    if (expiresAt < now) {
      inviteRef.update({ status: "expired" }).catch(() => {});
      res.status(410).send({ error: "תוקף קישור ההצטרפות פג." });
      return;
    }

    let alreadyRegistered = false;

    // 2. Branching by Link Type for Zero-Contention Bursts:
    if (inviteData.inviteType === "single") {
      // SINGLE-USE LINK: Strict atomic transaction on inviteRef to lock and consume it exactly once
      await db.runTransaction(async (transaction) => {
        const invSnap = await transaction.get(inviteRef);
        if (!invSnap.exists) throw new Error("קישור ההצטרפות אינו קיים במערכת.");
        const currentData = invSnap.data() || {};
        if (currentData.status === "revoked") throw new Error("קישור ההצטרפות בוטל.");
        const exp = currentData.expiresAt?.toDate ? currentData.expiresAt.toDate() : new Date(currentData.expiresAt);
        if (exp < now) throw new Error("תוקף קישור ההצטרפות פג.");
        if ((currentData.useCount || 0) >= 1) throw new Error("קישור אישי זה כבר נוצל להרשמה.");

        const repSnap = await transaction.get(reporterRef);
        if (repSnap.exists) {
          alreadyRegistered = true;
        } else {
          transaction.set(reporterRef, {
            name: trimmedName,
            phone: cleanPhone,
            addedAt: new Date().toISOString(),
            source: "self_invite",
            inviteId: token
          });
        }

        transaction.update(inviteRef, {
          useCount: admin.firestore.FieldValue.increment(1),
          status: "used",
          usedBy: admin.firestore.FieldValue.arrayUnion({
            phone: cleanPhone,
            name: trimmedName,
            registeredAt: new Date().toISOString()
          })
        });
      });
    } else {
      // GROUP LINK: Burst-Proof Zero-Contention Architecture
      // Each user writes to their independent reporter doc. No lock contention across different users!
      const repSnap = await reporterRef.get();
      if (repSnap.exists) {
        alreadyRegistered = true;
      } else {
        await reporterRef.set({
          name: trimmedName,
          phone: cleanPhone,
          addedAt: new Date().toISOString(),
          source: "self_invite",
          inviteId: token
        });
      }

      // Record redemption record in a subcollection keyed by phone (independent doc write)
      const redemptionRef = inviteRef.collection("redemptions").doc(cleanPhone);
      await redemptionRef.set({
        phone: cleanPhone,
        name: trimmedName,
        registeredAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Non-blocking asynchronous update of parent invite statistics
      inviteRef.update({
        useCount: admin.firestore.FieldValue.increment(1),
        lastRegisteredAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: admin.firestore.FieldValue.arrayUnion({
          phone: cleanPhone,
          name: trimmedName,
          registeredAt: new Date().toISOString()
        })
      }).catch((err: any) => {
        logger.warn("Non-blocking invite stat update delayed under load", { error: err.message });
      });
    }

    await recordAuditLog({
      tenantId,
      action: "REPORTER_SELF_ONBOARDED",
      level: "INFO",
      actor: { uid: cleanPhone, name: trimmedName, type: "resident" },
      details: {
        token,
        cleanPhone,
        alreadyRegistered,
        inviteType: inviteData.inviteType || "single"
      }
    });

    res.status(200).send({
      success: true,
      alreadyRegistered,
      tenantId,
      buildingName,
      message: alreadyRegistered
        ? "מספר הטלפון שלך כבר מופיע ברשימת המורשים!"
        : "הצטרפת בהצלחה לרשימת המורשים!"
    });
  } catch (err: any) {
    logger.error("Exception in submitResidentSelfOnboard:", err);
    res.status(400).send({ error: err.message || "שגיאה ברישום הדייר." });
  }
}

/**
 * Domain-grouped Cloud Function #1: Resident & Public API
 * Consolidates 12 resident/public endpoints into 1 warm Cloud Run service.
 */
export const residentApi = onRequest(
  { cors: true, secrets: ["GEMINI_API_KEY", "WHATSAPP_ACCESS_TOKEN"] },
  async (req, res) => {
    const endpoint = resolveEndpointName(req);

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
      case "validateInvite":
        return handleValidateInvite(req, res);
      case "submitResidentSelfOnboard":
        return handleSubmitResidentSelfOnboard(req, res);
      default:
        res.status(404).send({ error: `Unknown residentApi endpoint: ${endpoint}` });
    }
  }
);

