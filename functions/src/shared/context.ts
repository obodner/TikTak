import * as logger from "firebase-functions/logger";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import * as fs from "fs";

if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
export { admin };

export const APP_BASE_URL = (process.env.APP_BASE_URL || "https://mytiktak.com").replace(/\/+$/, "");
export const IS_STAGING = (process.env.GCLOUD_PROJECT || "").includes("stg") || APP_BASE_URL.includes("tiktak-stg");

export function appendStgParam(urlSuffix: string): string {
  if (!IS_STAGING || !urlSuffix) return urlSuffix;
  if (urlSuffix.includes("env=stg")) return urlSuffix;
  return urlSuffix.includes("?") ? `${urlSuffix}&env=stg` : `${urlSuffix}?env=stg`;
}

export function normalizePasswordResetLink(rawLink: string): string {
  try {
    const parsed = new URL(rawLink);
    if (!parsed.searchParams.get("apiKey")) {
      const fallbackKey =
        process.env.WEB_API_KEY ||
        (process.env.GCLOUD_PROJECT === "tiktak-stg"
          ? "AIzaSyAqAENALXc2hZBYIXCaEH8YUog-kXwlZKo"
          : "AIzaSyBmySHUfCo0buZhGEsWzTf7Cy30OU-iMqs");
      parsed.searchParams.set("apiKey", fallbackKey);
    }
    return parsed.toString();
  } catch {
    return rawLink;
  }
}

export async function recordAuditLog(params: {
  tenantId: string;
  action: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  actor: { uid: string; name: string; email?: string; type: 'admin' | 'resident' | 'vendor' };
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

export function sanitizeParam(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function normalizePhoneNumber(rawPhone: string): string {
  let clean = rawPhone.replace(/[^0-9]/g, '');
  if (clean.startsWith('972') && clean.length === 12) {
    clean = '0' + clean.substring(3);
  }
  if (!/^0[0-9]{8,9}$/.test(clean)) {
    throw new Error("Invalid phone number format");
  }
  return clean;
}

export async function findAndValidateReporter(
  tenantId: string,
  rawPhone: string
): Promise<{ authorized: boolean; reporterName: string | null; cleanPhone: string }> {
  if (!rawPhone || !tenantId) {
    return { authorized: false, reporterName: null, cleanPhone: "" };
  }

  let cleanPhone = rawPhone.trim();
  try {
    cleanPhone = normalizePhoneNumber(rawPhone);
  } catch {
    cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('972') && cleanPhone.length === 12) {
      cleanPhone = '0' + cleanPhone.substring(3);
    }
  }

  if (!cleanPhone) {
    return { authorized: false, reporterName: null, cleanPhone: "" };
  }

  // 1. Direct doc lookup by cleanPhone ID in reporters subcollection
  const reporterDoc = await db.collection("tenants").doc(tenantId).collection("reporters").doc(cleanPhone).get();
  if (reporterDoc.exists) {
    return {
      authorized: true,
      reporterName: reporterDoc.data()?.name || null,
      cleanPhone
    };
  }

  // 2. Query reporters subcollection by "phone" field (with safe fallback if index is building)
  try {
    const repSnap = await db.collection("tenants").doc(tenantId).collection("reporters").where("phone", "==", cleanPhone).get();
    if (!repSnap.empty) {
      return {
        authorized: true,
        reporterName: repSnap.docs[0].data()?.name || null,
        cleanPhone
      };
    }
  } catch (idxErr: any) {
    logger.warn("Fallback to collection scan for reporters.phone lookup", { tenantId, error: idxErr?.message });
    const allRepSnap = await db.collection("tenants").doc(tenantId).collection("reporters").get();
    const matchedDoc = allRepSnap.docs.find((d) => {
      const p = d.data()?.phone;
      if (!p) return false;
      try {
        return normalizePhoneNumber(String(p)) === cleanPhone;
      } catch {
        return String(p).replace(/\D/g, "") === cleanPhone;
      }
    });
    if (matchedDoc) {
      return {
        authorized: true,
        reporterName: matchedDoc.data()?.name || null,
        cleanPhone
      };
    }
  }

  // 3. Fallback: check adminUsers subcollection for building admins
  const adminSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
  const adminDoc = adminSnap.docs.find(doc => {
    const mob = doc.data().mobile;
    if (!mob) return false;
    let cleanMob = mob.trim();
    try {
      cleanMob = normalizePhoneNumber(mob);
    } catch {
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

/**
 * Resolves the target endpoint name from an incoming HTTP request
 * (supports both Firebase Hosting `/api/<endpoint>` rewrites and direct `/<endpoint>` calls).
 */
export function resolveEndpointName(req: any): string {
  const rawPath = (req.path || req.originalUrl || req.url || "").split("?")[0];
  const segments = rawPath.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] || "";
  if (lastSegment && lastSegment !== "api") {
    return lastSegment;
  }
  if (typeof req.query?.endpoint === "string") {
    return req.query.endpoint;
  }
  return "";
}

