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
exports.IS_STAGING = exports.APP_BASE_URL = exports.admin = exports.storage = exports.db = void 0;
exports.appendStgParam = appendStgParam;
exports.normalizePasswordResetLink = normalizePasswordResetLink;
exports.recordAuditLog = recordAuditLog;
exports.sanitizeParam = sanitizeParam;
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.findAndValidateReporter = findAndValidateReporter;
exports.resolveEndpointName = resolveEndpointName;
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const admin = __importStar(require("firebase-admin"));
exports.admin = admin;
const fs = __importStar(require("fs"));
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
exports.db = (0, firestore_1.getFirestore)();
exports.storage = (0, storage_1.getStorage)();
exports.APP_BASE_URL = (process.env.APP_BASE_URL || "https://mytiktak.com").replace(/\/+$/, "");
exports.IS_STAGING = (process.env.GCLOUD_PROJECT || "").includes("stg") || exports.APP_BASE_URL.includes("tiktak-stg");
function appendStgParam(urlSuffix) {
    if (!exports.IS_STAGING || !urlSuffix)
        return urlSuffix;
    if (urlSuffix.includes("env=stg"))
        return urlSuffix;
    return urlSuffix.includes("?") ? `${urlSuffix}&env=stg` : `${urlSuffix}?env=stg`;
}
function normalizePasswordResetLink(rawLink) {
    try {
        const parsed = new URL(rawLink);
        if (!parsed.searchParams.get("apiKey")) {
            const fallbackKey = process.env.WEB_API_KEY ||
                (process.env.GCLOUD_PROJECT === "tiktak-stg"
                    ? "AIzaSyAqAENALXc2hZBYIXCaEH8YUog-kXwlZKo"
                    : "AIzaSyBmySHUfCo0buZhGEsWzTf7Cy30OU-iMqs");
            parsed.searchParams.set("apiKey", fallbackKey);
        }
        return parsed.toString();
    }
    catch {
        return rawLink;
    }
}
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
        await exports.db.collection("audit_logs").add(cleanData);
    }
    catch (err) {
        logger.error("Failed to write audit log", { error: err, logData: cleanData });
    }
}
function sanitizeParam(str) {
    if (!str)
        return "";
    return str
        .replace(/[\r\n\t]+/g, " ")
        .replace(/ {2,}/g, " ")
        .trim();
}
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
    const reporterDoc = await exports.db.collection("tenants").doc(tenantId).collection("reporters").doc(cleanPhone).get();
    if (reporterDoc.exists) {
        return {
            authorized: true,
            reporterName: reporterDoc.data()?.name || null,
            cleanPhone
        };
    }
    try {
        const repSnap = await exports.db.collection("tenants").doc(tenantId).collection("reporters").where("phone", "==", cleanPhone).get();
        if (!repSnap.empty) {
            return {
                authorized: true,
                reporterName: repSnap.docs[0].data()?.name || null,
                cleanPhone
            };
        }
    }
    catch (idxErr) {
        logger.warn("Fallback to collection scan for reporters.phone lookup", { tenantId, error: idxErr?.message });
        const allRepSnap = await exports.db.collection("tenants").doc(tenantId).collection("reporters").get();
        const matchedDoc = allRepSnap.docs.find((d) => {
            const p = d.data()?.phone;
            if (!p)
                return false;
            try {
                return normalizePhoneNumber(String(p)) === cleanPhone;
            }
            catch {
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
    const adminSnap = await exports.db.collection("tenants").doc(tenantId).collection("adminUsers").get();
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
function resolveEndpointName(req) {
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
//# sourceMappingURL=context.js.map