import { onRequest } from "firebase-functions/v2/https";
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

  try {
    await db.collection("audit_logs").add(logData);
  } catch (err) {
    logger.error("Failed to write audit log", { error: err, logData });
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
 * Final step: Actually create the ticket in Firestore.
 */
export const createTicket = onRequest({ cors: true }, async (req, res) => {
  try {
    const { tenantId, imageId, summary, category, urgency, location, subLocation, ticketType, reporterPhone } = req.body;

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
    const ticketRef = isRealImage ? ticketsCol.doc(imageId) : ticketsCol.doc();
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
          imageId: finalImageId,
          audioId: req.body.audioBase64 ? ticketId : null,
          reporterPhone: reporterPhone || null,
          reporterName: reporterDoc.data()?.name || null,
          status: 'open',
          ticketNumber: nextNumber, // THE TICKET COUNTER
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          adminComments: [] as any[]
        };

        transaction.set(ticketRef, ticketData);
        return nextNumber;
      });

      // If audio is provided, upload to GCS (Done outside transaction)
      if (req.body.audioBase64) {
        const bucket = admin.storage().bucket();
        const audioFile = bucket.file(`tenants/${tenantId}/${imageId}.webm`);
        const audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
        logger.info(`Processing audio for ${tenantId}. Buffer size: ${audioBuffer.length} bytes`);

        await audioFile.save(audioBuffer, {
          metadata: { contentType: "audio/webm" }
        });
        logger.info("Audio note uploaded successfully", { tenantId, ticketId: imageId });
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
          hasImage: isRealImage,
          hasAudio: !!req.body.audioBase64
        }
      });

      res.status(200).send({
        success: true,
        ticketId: imageId,
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

export const getTenantInfo = onRequest({ cors: true }, async (req, res) => {
  const { tenantId } = req.query;

  if (!tenantId) {
    res.status(400).send({ error: "Missing tenantId" });
    return;
  }

  try {
    const doc = await db.collection("tenants").doc(tenantId as string).get();
    if (!doc.exists) {
      res.status(404).send({ error: "Tenant not found" });
      return;
    }
    res.send(doc.data());
  } catch (error) {
    res.status(500).send({ error: "Database error" });
  }
});

export const getImage = onRequest({ cors: true }, async (req, res) => {
  const pathSegments = req.path.split('/').filter(p => p && p !== 'img');
  const tenantId = pathSegments[0];
  const imageId = pathSegments[1];

  if (!tenantId || !imageId) {
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
  const pathSegments = req.path.split('/').filter(p => p && p !== 'aud');
  const tenantId = pathSegments[0];
  const audioId = pathSegments[1];

  if (!tenantId || !audioId) {
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
        const existingUsers = await tenantRef.collection("adminUsers").get();
        if (existingUsers.size >= 5) {
          throw new Error("Maximum of 5 users reached for this tenant");
        }

        // a. Create in Firebase Auth
        const userRecord = await auth.createUser({
          email,
          password: password || Math.random().toString(36).slice(-8), // Temporary password if not provided
          displayName: `${firstName} ${lastName}`
        });

        // b. Create Metadata in subcollection
        const uid = userRecord.uid;
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

        // a. Delete from Auth
        await auth.deleteUser(uid);

        // b. Remove from Metadata
        await tenantRef.collection("adminUsers").doc(uid).delete();

        // c. Update core adminUids array
        await tenantRef.update({
          adminUids: admin.firestore.FieldValue.arrayRemove(uid)
        });

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

