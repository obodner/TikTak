/**
 * TikTak Cloud Functions — Hybrid Domain-Grouped Entrypoint
 *
 * Deployed Cloud Functions (9 total instead of 29):
 * 1. residentApi — Grouped HTTP router for resident & public endpoints (/api/*)
 * 2. adminApi    — Grouped HTTP router for Vaad admin & super-admin endpoints (/api/*)
 * 3. rfqApi      — Grouped HTTP router for vendor bidding & RFQ endpoints (/api/*)
 * 4. getImage    — Standalone high-cache image proxy (/img/**)
 * 5. getAudio    — Standalone high-cache audio proxy (/aud/**, /audio/**)
 * 6. whatsappWebhook — Standalone Meta WhatsApp Cloud API webhook & conversational state machine
 * 7. onTicketUpdate  — Standalone Firestore trigger for ticket status/assignment notifications
 * 8. slaCron         — Standalone hourly scheduled SLA reminder job
 * 9. checkAnnualLicenseExpirations — Standalone daily scheduled license expiration job
 */

export { residentApi } from "./domains/residentApi";
export { adminApi } from "./domains/adminApi";
export { rfqApi } from "./domains/rfqApi";
export { getImage, getAudio } from "./domains/mediaProxy";
export { whatsappWebhook, transcribeAudioWhisper } from "./domains/whatsappBot";
export { onTicketUpdate } from "./triggers/onTicketUpdate";
export { slaCron } from "./slaCron";
export { checkAnnualLicenseExpirations } from "./licenseExpiryCron";
export { sendWhatsAppAudio } from "./shared/whatsappService";
