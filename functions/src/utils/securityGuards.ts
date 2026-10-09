import * as crypto from "crypto";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

export interface ImageValidationResult {
  valid: boolean;
  detectedMime?: "image/jpeg" | "image/png" | "image/webp";
  error?: string;
}

/**
 * Validates an image buffer by inspecting its magic bytes.
 * Rejects corrupt binaries, non-images, SVG/HTML payloads, and executables.
 */
export function validateImageBuffer(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: "Buffer is too small or empty" };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png" };
  }

  // 3. WebP: RIFF (bytes 0-3) ... WEBP (bytes 8-11)
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

/**
 * In-memory sliding-window rate limiter for Cloud Functions endpoints.
 * Automatically evicts stale buckets to maintain scale-to-zero memory efficiency.
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();

  // Housekeeping: periodic cleanup if store grows
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

/**
 * Validates Meta WhatsApp Webhook HMAC-SHA256 signature (`x-hub-signature-256`).
 * Prevents forged webhook events from consuming AI resources.
 */
export function verifyMetaWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): { valid: boolean; reason?: string } {
  if (!appSecret) {
    logger.warn("WHATSAPP_APP_SECRET is not configured. Webhook signature verification bypassed (Dev Mode).");
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

/**
 * Validates Firebase App Check token on inbound HTTP requests.
 * Protects web entry endpoints against automated abuse and scraper bots.
 */
export async function verifyAppCheckHeader(
  appCheckToken: string | undefined,
  strictMode: boolean = false
): Promise<{ valid: boolean; error?: string; tokenClaims?: any }> {
  if (!appCheckToken) {
    if (strictMode) {
      return { valid: false, error: "Missing required Firebase App Check token" };
    }
    return { valid: true }; // Graceful pass in monitoring mode
  }

  try {
    const claims = await admin.appCheck().verifyToken(appCheckToken);
    return { valid: true, tokenClaims: claims };
  } catch (err: any) {
    if (strictMode) {
      return { valid: false, error: `Invalid App Check token: ${err.message}` };
    }
    logger.warn("App Check token verification failed (monitoring mode):", { error: err.message });
    return { valid: true, error: err.message };
  }
}

