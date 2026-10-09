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
exports.validateImageBuffer = validateImageBuffer;
exports.checkRateLimit = checkRateLimit;
exports.verifyMetaWebhookSignature = verifyMetaWebhookSignature;
exports.verifyAppCheckHeader = verifyAppCheckHeader;
const crypto = __importStar(require("crypto"));
const firebase_functions_1 = require("firebase-functions");
const admin = __importStar(require("firebase-admin"));
function validateImageBuffer(buffer) {
    if (!buffer || buffer.length < 12) {
        return { valid: false, error: "Buffer is too small or empty" };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { valid: true, detectedMime: "image/jpeg" };
    }
    if (buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a) {
        return { valid: true, detectedMime: "image/png" };
    }
    const riff = buffer.subarray(0, 4).toString("ascii");
    const webp = buffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") {
        return { valid: true, detectedMime: "image/webp" };
    }
    return {
        valid: false,
        error: "Unsupported file header. Only JPEG, PNG, and WebP images are allowed."
    };
}
const rateLimitStore = new Map();
function checkRateLimit(key, maxRequests, windowMs) {
    const now = Date.now();
    if (rateLimitStore.size > 5000) {
        for (const [k, bucket] of rateLimitStore.entries()) {
            if (bucket.resetAt <= now) {
                rateLimitStore.delete(k);
            }
        }
    }
    const bucket = rateLimitStore.get(key);
    if (!bucket || bucket.resetAt <= now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetInMs: windowMs };
    }
    if (bucket.count >= maxRequests) {
        return { allowed: false, remaining: 0, resetInMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return {
        allowed: true,
        remaining: maxRequests - bucket.count,
        resetInMs: bucket.resetAt - now
    };
}
function verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret) {
    if (!appSecret) {
        firebase_functions_1.logger.warn("WHATSAPP_APP_SECRET is not configured. Webhook signature verification bypassed (Dev Mode).");
        return { valid: true };
    }
    if (!signatureHeader) {
        return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
    }
    if (!rawBody) {
        return { valid: false, reason: "Missing request raw body" };
    }
    const parts = signatureHeader.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
        return { valid: false, reason: "Invalid signature format; expected sha256=<signature>" };
    }
    const expectedSignature = crypto
        .createHmac("sha256", appSecret)
        .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
        .digest("hex");
    const providedHash = parts[1];
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(providedHash, "utf8");
    if (expectedBuffer.length !== providedBuffer.length) {
        return { valid: false, reason: "Signature length mismatch" };
    }
    const match = crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    return match ? { valid: true } : { valid: false, reason: "Signature mismatch" };
}
async function verifyAppCheckHeader(appCheckToken, strictMode = false) {
    if (!appCheckToken) {
        if (strictMode) {
            return { valid: false, error: "Missing required Firebase App Check token" };
        }
        return { valid: true };
    }
    try {
        const claims = await admin.appCheck().verifyToken(appCheckToken);
        return { valid: true, tokenClaims: claims };
    }
    catch (err) {
        if (strictMode) {
            return { valid: false, error: `Invalid App Check token: ${err.message}` };
        }
        firebase_functions_1.logger.warn("App Check token verification failed (monitoring mode):", { error: err.message });
        return { valid: true, error: err.message };
    }
}
//# sourceMappingURL=securityGuards.js.map