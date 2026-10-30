import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  db,
  admin,
  APP_BASE_URL,
  recordAuditLog,
  sanitizeParam,
  resolveEndpointName
} from "../shared/context";
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  checkAndDispatchRfqQuotaAlerts
} from "../shared/whatsappService";

export async function handleDispatchRfqToVendors(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed. Use POST." });
      return;
    }

    const { tenantId, rfqId, vendorIds, actor } = req.body || {};
    if (!tenantId || !rfqId) {
      res.status(400).send({ error: "Missing required parameters (tenantId, rfqId)" });
      return;
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      res.status(500).send({ error: "WhatsApp access token not configured" });
      return;
    }

    // 1. Fetch Tenant Document (Strict Multi-Tenancy Scoping)
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      res.status(404).send({ error: "Tenant not found" });
      return;
    }
    const tenantData = tenantSnap.data() || {};
    if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen' || tenantData.subscription?.status === 'cancelled') {
      res.status(403).send({
        error: "Account Frozen",
        message: "חשבון ישות זו מוקפא זמנית. שילוח פניות הצעת מחיר לקבלנים חסום."
      });
      return;
    }

    let rfqLic = tenantData.rfqLicensing;
    if (tenantData.parentEnterpriseId) {
      const parentSnap = await db.collection("tenants").doc(tenantData.parentEnterpriseId).get();
      if (parentSnap.exists) {
        const parentData = parentSnap.data() || {};
        if (parentData.isActive === false || parentData.subscription?.status === 'frozen' || parentData.subscription?.status === 'cancelled') {
          res.status(403).send({
            error: "Fleet Master Frozen",
            message: "מתחם האב של ישות זו מוקפא זמנית. שילוח פניות הצעת מחיר לקבלנים חסום."
          });
          return;
        }
        if (parentData.rfqLicensing) {
          rfqLic = parentData.rfqLicensing;
        }
      }
    }

    // Check RFQ licensing status
    const isRfqActive = Boolean(
      rfqLic &&
      rfqLic.status === 'active' &&
      rfqLic.tier &&
      rfqLic.tier !== 'disabled'
    );
    if (!isRfqActive) {
      res.status(403).send({
        error: "RFQ Disabled",
        message: "מודול מכרזי הצעות מחיר (RFQ) מושבת עבור ישות זו בהגדרות הרישוי. לא ניתן לשגר פניות לקבלנים."
      });
      return;
    }

    // Check RFQ license expiration
    if (rfqLic.licenseExpiresAt && new Date(rfqLic.licenseExpiresAt).getTime() < Date.now()) {
      res.status(403).send({
        error: "RFQ License Expired",
        message: "תוקף רישוי הצעות המחיר השנתי (RFQ) פג. לא ניתן לשגר פניות לקבלנים."
      });
      return;
    }

    const phoneNumberId = tenantData.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";

    const tenantName = tenantData.name || tenantId;
    const tenantAddress = tenantData.address || "";
    const customerSiteStr = tenantAddress ? `${tenantName} (${tenantAddress})` : tenantName;

    // 2. Fetch RFQ Document
    const rfqRef = tenantRef.collection("rfqs").doc(rfqId);
    const rfqSnap = await rfqRef.get();
    if (!rfqSnap.exists) {
      res.status(404).send({ error: "RFQ not found" });
      return;
    }
    const rfqData = rfqSnap.data() || {};

    // 3. Resolve Contact Person & Phone
    const creatorName = rfqData.createdBy?.name || actor?.name || "ועד הבית";
    let contactPhone = actor?.phone || tenantData.contactPhone || tenantData.phone || "";

    if (!contactPhone && (actor?.uid || rfqData.createdBy?.uid)) {
      const adminUid = actor?.uid || rfqData.createdBy?.uid;
      try {
        const adminSnap = await tenantRef.collection("adminUsers").doc(adminUid).get();
        if (adminSnap.exists) {
          const aData = adminSnap.data() || {};
          contactPhone = aData.mobile || aData.phone || "";
        }
      } catch (adminErr) {
        logger.warn(`Could not resolve admin phone for uid ${adminUid}:`, adminErr);
      }
    }
    if (!contactPhone) {
      contactPhone = "במערכת TikTak";
    }

    // 4. Resolve Target Vendors
    const allDispatched: any[] = Array.isArray(rfqData.dispatchedVendors) ? [...rfqData.dispatchedVendors] : [];
    let targetVendors = allDispatched;
    if (vendorIds && Array.isArray(vendorIds) && vendorIds.length > 0) {
      targetVendors = allDispatched.filter(v => vendorIds.includes(v.vendorId));
    }

    if (targetVendors.length === 0) {
      res.status(400).send({ error: "No matching vendors found to dispatch" });
      return;
    }

    logger.info(`Dispatching contractor_rfq_invite template for RFQ #${rfqId} to ${targetVendors.length} vendors in tenant ${tenantId}`);

    const results: any[] = [];

    // 5. Send Template to Each Vendor
    for (const vendor of targetVendors) {
      let rawPhone = String(vendor.phone || "").replace(/\D/g, "");
      if (rawPhone.startsWith("0")) {
        rawPhone = "972" + rawPhone.substring(1);
      }

      if (rawPhone.length < 8) {
        results.push({
          vendorId: vendor.vendorId,
          vendorName: vendor.vendorName,
          phone: vendor.phone,
          success: false,
          error: "Invalid phone number"
        });
        continue;
      }

      const p1_vendorName = sanitizeParam(vendor.vendorName || "ספק");
      const p2_rfqTitle = sanitizeParam(rfqData.title || "בקשה להצעת מחיר");
      const p3_site = sanitizeParam(customerSiteStr);
      const p4_senderName = sanitizeParam(creatorName);
      const p5_contactPhone = sanitizeParam(contactPhone);
      const p6_category = sanitizeParam(rfqData.category || "תחזוקה");
      const p7_location = sanitizeParam(rfqData.location || "לפי הפירוט והתמונות");

      const templateParams = [
        p1_vendorName,
        p2_rfqTitle,
        p3_site,
        p4_senderName,
        p5_contactPhone,
        p6_category,
        p7_location
      ];

      const buttonSuffix = `${rfqId}?tid=${tenantId}&v=${vendor.vendorId}${vendor.tokenHash ? `&t=${vendor.tokenHash}` : ''}`;

      let metaMessageId: string | null = null;
      let success = false;
      let errorDetail: string | null = null;

      try {
        // Attempt 1: Approved Meta Template with dynamic URL button
        const resp: any = await sendWhatsAppTemplate(
          rawPhone,
          "contractor_rfq_invite",
          "he",
          templateParams,
          phoneNumberId,
          token,
          buttonSuffix
        );
        metaMessageId = resp?.messages?.[0]?.id || null;
        success = true;
        logger.info(`Successfully dispatched contractor_rfq_invite with button to ${rawPhone} (${vendor.vendorName})`);
      } catch (btnErr: any) {
        logger.warn(`Template with button failed for ${rawPhone}, attempting body-only template:`, btnErr?.message);
        try {
          // Attempt 2: Approved Meta Template with body-only params fallback
          const resp: any = await sendWhatsAppTemplate(
            rawPhone,
            "contractor_rfq_invite",
            "he",
            templateParams,
            phoneNumberId,
            token
          );
          metaMessageId = resp?.messages?.[0]?.id || null;
          success = true;
          logger.info(`Successfully dispatched contractor_rfq_invite (body-only) to ${rawPhone}`);
        } catch (bodyErr: any) {
          logger.error(`contractor_rfq_invite failed for vendor ${rawPhone}:`, bodyErr);
          errorDetail = bodyErr?.message || JSON.stringify(bodyErr);
        }
      }

      results.push({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        phone: rawPhone,
        success,
        metaMessageId,
        error: errorDetail
      });

      const idx = allDispatched.findIndex(v => v.vendorId === vendor.vendorId);
      if (idx >= 0) {
        allDispatched[idx] = {
          ...allDispatched[idx],
          whatsappSent: success,
          whatsappSentAt: new Date().toISOString(),
          whatsappStatus: success ? 'sent' : 'failed',
          ...(metaMessageId ? { whatsappMessageId: metaMessageId } : {}),
          ...(errorDetail ? { whatsappError: errorDetail } : {})
        };
      }
    }

    // 6. Update RFQ Document with dispatch results
    await rfqRef.update({
      dispatchedVendors: allDispatched,
      lastDispatchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const successCount = results.filter(r => r.success).length;

    res.status(200).send({
      success: successCount > 0,
      message: `שוגרו הודעות WhatsApp ל-${successCount} מתוך ${targetVendors.length} קבלנים`,
      results,
      dispatchedVendors: allDispatched
    });
  } catch (err: any) {
    logger.error("Exception in dispatchRfqToVendors:", err);
    res.status(500).send({ error: err.message || "אירעה שגיאה בשיגור הודעות הוואטסאפ לקבלנים" });
  }
}

export async function handleDispatchRfqAddendum(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed. Use POST." });
      return;
    }

    const { tenantId, rfqId, scopeVersion, changeSummary } = req.body || {};
    if (!tenantId || !rfqId) {
      res.status(400).send({ error: "Missing required parameters (tenantId, rfqId)" });
      return;
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      res.status(500).send({ error: "WhatsApp access token not configured" });
      return;
    }

    // 1. Fetch Tenant Document
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      res.status(404).send({ error: "Tenant not found" });
      return;
    }
    const tenantData = tenantSnap.data() || {};
    if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen' || tenantData.subscription?.status === 'cancelled') {
      res.status(403).send({
        error: "Account Frozen",
        message: "חשבון ישות זו מוקפא זמנית. שילוח פניות הצעת מחיר לקבלנים חסום."
      });
      return;
    }

    const phoneNumberId = tenantData.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
    const tenantName = tenantData.name || tenantId;

    // 2. Fetch RFQ Document
    const rfqRef = tenantRef.collection("rfqs").doc(rfqId);
    const rfqSnap = await rfqRef.get();
    if (!rfqSnap.exists) {
      res.status(404).send({ error: "RFQ not found" });
      return;
    }
    const rfqData = rfqSnap.data() || {};

    const dispatchedVendors = rfqData.dispatchedVendors || [];
    if (dispatchedVendors.length === 0) {
      res.status(200).send({ success: true, message: "No dispatched vendors to notify", results: [] });
      return;
    }

    const results: any[] = [];
    const truncateParam = (val: string, maxLen = 60) => {
      const clean = (val || "").replace(/[\r\n\t]+/g, " ").trim();
      return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
    };

    const p2_rfqTitle = truncateParam(rfqData.title || "בקשה להצעת מחיר");
    const p3_site = truncateParam(tenantName);
    const p4_scopeVersion = String(scopeVersion || rfqData.scopeVersion || 2);
    const p5_changeSummary = truncateParam(changeSummary || "התווספו משימות במפרט", 100);

    for (const vendor of dispatchedVendors) {
      let rawPhone = (vendor.phone || "").replace(/[^0-9]/g, "");
      if (rawPhone.startsWith("0")) {
        rawPhone = "972" + rawPhone.substring(1);
      }
      if (rawPhone.length < 8) continue;

      const p1_vendorName = truncateParam(vendor.vendorName || "ספק");
      const templateParams = [
        p1_vendorName,
        p2_rfqTitle,
        p3_site,
        p4_scopeVersion,
        p5_changeSummary
      ];

      const vendorTokenPart = vendor.tokenHash ? `__${vendor.tokenHash}` : '';
      const buttonSuffix = `${tenantId}__${rfqId}__${vendor.vendorId}${vendorTokenPart}`;

      let metaMessageId: string | null = null;
      let success = false;
      let errorDetail: string | null = null;

      try {
        const resp: any = await sendWhatsAppTemplate(
          rawPhone,
          "contractor_rfq_scope_updated",
          "he",
          templateParams,
          phoneNumberId,
          token,
          buttonSuffix
        );
        metaMessageId = resp?.messages?.[0]?.id || null;
        success = true;
        logger.info(`Successfully dispatched contractor_rfq_scope_updated to ${rawPhone} (${vendor.vendorName})`);
      } catch (err: any) {
        logger.warn(`contractor_rfq_scope_updated failed for ${rawPhone}:`, err?.message);
        errorDetail = err?.message || JSON.stringify(err);
      }

      results.push({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        phone: rawPhone,
        success,
        metaMessageId,
        error: errorDetail
      });
    }

    const successCount = results.filter(r => r.success).length;
    res.status(200).send({
      success: successCount > 0,
      message: `שוגרו נספחי שינויים ל-${successCount} מתוך ${dispatchedVendors.length} קבלנים`,
      results
    });
  } catch (err: any) {
    logger.error("Exception in dispatchRfqAddendum:", err);
    res.status(500).send({ error: err.message || "שגיאה בשיגור נספח לקבלנים" });
  }
}

export async function handleNotifyQuoteSubmission(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed. Use POST." });
      return;
    }

    const { tenantId, rfqId, submissionId } = req.body || {};
    if (!tenantId || !rfqId || !submissionId) {
      res.status(400).send({ error: "Missing required parameters (tenantId, rfqId, submissionId)" });
      return;
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      res.status(500).send({ error: "WhatsApp access token not configured" });
      return;
    }

    // 1. Fetch Tenant Document (Strict Multi-Tenancy Scoping)
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      res.status(404).send({ error: "Tenant not found" });
      return;
    }
    const tenantData = tenantSnap.data() || {};
    const phoneNumberId = tenantData.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "1046588828547584";
    const tenantName = tenantData.name || tenantId;
    const tenantAddress = tenantData.address || "";
    const customerSiteStr = tenantAddress ? `${tenantName} (${tenantAddress})` : tenantName;

    // 2. Fetch RFQ Document
    const rfqRef = tenantRef.collection("rfqs").doc(rfqId);
    const rfqSnap = await rfqRef.get();
    if (!rfqSnap.exists) {
      res.status(404).send({ error: "RFQ not found" });
      return;
    }
    const rfqData = rfqSnap.data() || {};

    // 3. Fetch Submission Document
    const subRef = rfqRef.collection("submissions").doc(submissionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      res.status(404).send({ error: "Submission not found" });
      return;
    }
    const subData = subSnap.data() || {};

    // 4. Resolve Target Admin & Phone
    let adminName = rfqData.createdBy?.name || "";
    let adminPhone = rfqData.createdBy?.phone || "";
    const adminUid = rfqData.createdBy?.uid;

    if (adminUid && adminUid !== 'admin') {
      try {
        const adminSnap = await tenantRef.collection("adminUsers").doc(adminUid).get();
        if (adminSnap.exists) {
          const aData = adminSnap.data() || {};
          const resolvedFullName = aData.fullName || aData.name || `${aData.firstName || ''} ${aData.lastName || ''}`.trim();
          if (resolvedFullName && resolvedFullName !== 'ועד הבית' && resolvedFullName !== 'ועד בית') {
            adminName = resolvedFullName;
          }
          if (!adminPhone && (aData.mobile || aData.phone)) {
            adminPhone = aData.mobile || aData.phone;
          }
        }
      } catch (adminErr) {
        logger.warn(`Could not resolve admin from adminUsers for uid ${adminUid}:`, adminErr);
      }

      if (!adminName || adminName === 'ועד הבית' || adminName === 'ועד בית' || adminName === 'מנהל/ת המערכת') {
        try {
          const rootUserSnap = await db.collection("users").doc(adminUid).get();
          if (rootUserSnap.exists) {
            const uData = rootUserSnap.data() || {};
            const rootName = uData.fullName || uData.displayName || uData.name || `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
            if (rootName && rootName !== 'ועד הבית' && rootName !== 'ועד בית') {
              adminName = rootName;
            }
            if (!adminPhone && (uData.mobile || uData.phone)) {
              adminPhone = uData.mobile || uData.phone;
            }
          }
        } catch (uErr) {
          logger.warn(`Could not resolve admin from users for uid ${adminUid}:`, uErr);
        }
      }
    }

    if (!adminName || adminName === 'ועד הבית' || adminName === 'ועד בית') {
      adminName = tenantData.contactPerson || tenantData.adminName || tenantData.name || "ועד הבית";
    }

    if (!adminPhone) {
      adminPhone = tenantData.vaadPhone || tenantData.contactPhone || tenantData.phone || "";
    }

    let cleanPhone = String(adminPhone || "").replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "972" + cleanPhone.substring(1);
    }

    if (!cleanPhone || cleanPhone.length < 8) {
      logger.warn(`No valid admin phone found for tenant ${tenantId}, RFQ #${rfqId}`);
      res.status(400).send({ error: "No valid admin phone number found to notify" });
      return;
    }

    // 5. Build Dynamic Link Button Suffix & Message Variables
    const vendorName = subData.vendorName || "קבלן";
    const priceNum = subData.price || 0;
    const vatSuffix = subData.priceIncludesVat ? 'כולל מע"מ' : '+ מע"מ';
    const priceFormatted = `${priceNum.toLocaleString()} (${vatSuffix})`;
    const durationStr = subData.estimatedDuration || "לפי תיאום";
    const titleWithNum = rfqData.ticketNumber ? `${rfqData.title} (#${rfqData.ticketNumber})` : rfqData.title;

    const buttonSuffix = `${tenantId}__${rfqId}`;

    const templateParams = [
      sanitizeParam(adminName),
      sanitizeParam(vendorName),
      sanitizeParam(titleWithNum),
      sanitizeParam(customerSiteStr),
      sanitizeParam(priceFormatted),
      sanitizeParam(durationStr)
    ];

    let metaMessageId: string | null = null;
    let deliveryMethod = "template";

    try {
      const resp: any = await sendWhatsAppTemplate(
        cleanPhone,
        "admin_new_quote_alert",
        "he",
        templateParams,
        phoneNumberId,
        token,
        buttonSuffix
      );
      metaMessageId = resp?.messages?.[0]?.id || null;
      logger.info(`Successfully dispatched admin_new_quote_alert template to admin ${cleanPhone}`);
    } catch (templateErr: any) {
      logger.warn(`Template admin_new_quote_alert failed (${templateErr?.message}), falling back to direct formatted text...`);
      deliveryMethod = "text_fallback";

      const fallbackText =
        `שלום ${adminName},\n` +
        `🔔 *התקבלה הצעת מחיר חדשה ב-TikTak!*\n\n` +
        `📋 *מכרז:* ${titleWithNum}\n` +
        `🏢 *אתר:* ${customerSiteStr}\n` +
        `🛠️ *קבלן:* ${vendorName}\n` +
        `💰 *סכום ההצעה:* ₪${priceFormatted}\n` +
        `⏱️ *משך ביצוע:* ${durationStr}\n` +
        (subData.notes ? `💬 *הערות הקבלן:* ${subData.notes}\n` : '') +
        `\n📊 *לצפייה בהצעה והשוואה במערכת:*\n` +
        `${APP_BASE_URL}/q/${buttonSuffix}`;

      try {
        const textResp: any = await sendWhatsAppText(cleanPhone, fallbackText, phoneNumberId, token);
        metaMessageId = textResp?.messages?.[0]?.id || null;
        logger.info(`Successfully dispatched fallback text quote notification to admin ${cleanPhone}`);
      } catch (textErr: any) {
        logger.error(`Failed to send WhatsApp quote notification to admin ${cleanPhone}:`, textErr);
        throw textErr;
      }
    }

    // 6. Record Audit Log
    await recordAuditLog({
      tenantId,
      action: "QUOTE_NOTIFICATION_SENT",
      level: "INFO",
      actor: {
        uid: "system",
        name: "TikTak System",
        type: "admin"
      },
      details: {
        rfqId,
        submissionId,
        vendorName,
        price: priceNum,
        recipientName: adminName,
        recipientPhone: cleanPhone,
        deliveryMethod,
        whatsappMessageId: metaMessageId
      }
    });

    res.status(200).send({
      success: true,
      deliveryMethod,
      metaMessageId,
      recipient: cleanPhone
    });
  } catch (err: any) {
    logger.error("Exception in notifyQuoteSubmission:", err);
    res.status(500).send({ error: err.message || "Failed to notify admin" });
  }
}

export async function handleRecordRfqDispatch(req: any, res: any) {
  try {
    const { tenantId, rfqId } = req.body;
    if (!tenantId) {
      res.status(400).send({ error: "Missing required parameter: tenantId" });
      return;
    }

    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
      res.status(404).send({ error: `Tenant ${tenantId} not found` });
      return;
    }

    const tenantData = tenantDoc.data() || {};
    if (tenantData.isActive === false || tenantData.subscription?.status === 'frozen') {
      res.status(403).send({ error: "Tenant is frozen. Cannot dispatch RFQs." });
      return;
    }

    let parentData: any = null;
    if (tenantData.parentEnterpriseId) {
      const parentDoc = await db.collection("tenants").doc(tenantData.parentEnterpriseId).get();
      if (parentDoc.exists) {
        parentData = parentDoc.data() || {};
        if (parentData.isActive === false || parentData.subscription?.status === 'frozen') {
          res.status(403).send({ error: "Fleet master is frozen. Cannot dispatch RFQs." });
          return;
        }
      }
    }

    const rfqLicensing = (tenantData.parentEnterpriseId && parentData?.rfqLicensing)
      ? parentData.rfqLicensing
      : tenantData.rfqLicensing;
    const isRfqActive = Boolean(
      rfqLicensing &&
      rfqLicensing.status === 'active' &&
      rfqLicensing.tier &&
      rfqLicensing.tier !== 'disabled'
    );
    if (!isRfqActive) {
      res.status(403).send({ error: "RFQ procurement licensing is disabled for this tenant." });
      return;
    }

    // Check expiration
    if (rfqLicensing.licenseExpiresAt) {
      const expiresAt = new Date(rfqLicensing.licenseExpiresAt);
      if (Date.now() > expiresAt.getTime()) {
        res.status(403).send({ error: "RFQ procurement annual license has expired. Please renew." });
        return;
      }
    }

    const annualQuota = Number(rfqLicensing.annualQuota ?? 0);
    const currentUsage = Number(rfqLicensing.currentAnnualUsage?.dispatchedCount ?? 0);
    const enforcementMode = rfqLicensing.enforcementMode || 'hard';

    // Hard cap check
    if (enforcementMode === 'hard' && annualQuota > 0 && currentUsage >= annualQuota) {
      res.status(403).send({
        error: `Annual RFQ quota reached (${currentUsage}/${annualQuota}). Further dispatches are blocked under Hard Cap policy.`,
        currentUsage,
        annualQuota,
        enforcementMode
      });
      return;
    }

    const newUsage = currentUsage + 1;
    const nowIso = new Date().toISOString();

    // Increment usage on pool owner (master if child uses parent pool)
    const isPoolChild = Boolean(tenantData.parentEnterpriseId && tenantData.usesParentPool);
    const targetQuotaRef = isPoolChild
      ? db.collection("tenants").doc(tenantData.parentEnterpriseId)
      : tenantRef;
    const targetTenantId = isPoolChild ? tenantData.parentEnterpriseId : tenantId;
    const targetTenantData = (isPoolChild && parentData) ? parentData : tenantData;

    await targetQuotaRef.update({
      "rfqLicensing.currentAnnualUsage.dispatchedCount": newUsage,
      "rfqLicensing.currentAnnualUsage.lastDispatchedAt": nowIso,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Check thresholds & dispatch alerts if crossed
    await checkAndDispatchRfqQuotaAlerts(targetTenantId, targetTenantData, newUsage);

    res.status(200).send({
      success: true,
      tenantId,
      rfqId,
      annualQuota,
      dispatchedCount: newUsage,
      enforcementMode,
      isOverQuota: annualQuota > 0 && newUsage > annualQuota
    });
  } catch (err: any) {
    logger.error("Exception in recordRfqDispatch:", err);
    res.status(500).send({ error: err.message || "Failed to record RFQ dispatch" });
  }
}

/**
 * Domain-grouped Cloud Function #3: RFQ & Contractor Portal API
 * Consolidates 4 RFQ procurement endpoints into 1 warm Cloud Run service.
 */
export const rfqApi = onRequest(
  { cors: true, secrets: ["WHATSAPP_ACCESS_TOKEN"] },
  async (req, res) => {
    const endpoint = resolveEndpointName(req);

    switch (endpoint) {
      case "dispatchRfqToVendors":
        return handleDispatchRfqToVendors(req, res);
      case "dispatchRfqAddendum":
        return handleDispatchRfqAddendum(req, res);
      case "notifyQuoteSubmission":
        return handleNotifyQuoteSubmission(req, res);
      case "recordRfqDispatch":
        return handleRecordRfqDispatch(req, res);
      default:
        res.status(404).send({ error: `Unknown rfqApi endpoint: ${endpoint}` });
    }
  }
);

