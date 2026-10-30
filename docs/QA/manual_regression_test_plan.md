# TikTak Manual Regression Test Plan (Hybrid Domain-Grouped Functions)

**Target Environment:** Staging (`https://tiktak-stg.web.app`)  
**Architecture Under Test:** 3 Domain-Grouped APIs (`residentApi`, `adminApi`, `rfqApi`) + 6 Standalone Cloud Functions (`whatsappWebhook`, `getImage`, `getAudio`, `onTicketUpdate`, `slaCron`, `checkAnnualLicenseExpirations`)

---

## Pre-Flight Setup
- [ ] Open Staging URL: `https://tiktak-stg.web.app`
- [ ] Keep Chrome DevTools -> **Network** tab open (Filter by `Fetch/XHR`) to confirm `/api/*` requests return `200 OK` without `404` or `502`.
- [ ] Have a test building `tenantId` ready (e.g., `/report/<tenantId>`) with at least one registered resident phone number and one admin user.

---

## Suite 1: Public & Resident Reporting Flow (`residentApi` + `getImage` / `getAudio`)
*Covers: `/api/landingMetrics`, `/api/buildingInfo`, `/api/checkAuth`, `/api/analyzeImage`, `/api/createTicket`, `/api/submitAppFeedback`, `/api/getResidentTickets`, `/api/addResidentComment`, `/api/incrementMeToo`, `/img/**`, `/aud/**`*

### 1.1 Landing Page Metrics
- [ ] **Action:** Open `https://tiktak-stg.web.app/`.
- [ ] **Expected:** Landing page loads in RTL Hebrew; live counters (tickets & satisfaction rate) populate without errors (`GET /api/landingMetrics` returns `200`).

### 1.2 Building Info & Phone Authorization
- [ ] **Action:** Navigate to `https://tiktak-stg.web.app/report/<tenantId>`.
- [ ] **Expected:** Building name, logo/banner, and custom locations/categories load (`GET /api/buildingInfo` returns `200`).
- [ ] **Action:** Enter an **unregistered** phone number when prompted (if closed-group authentication is enabled) and submit.
- [ ] **Expected:** Access is blocked with the Hebrew unauthorized message (`POST /api/checkAuth` returns `200` with `authorized: false`).
- [ ] **Action:** Enter a **registered** resident phone number.
- [ ] **Expected:** Phone is authorized (`POST /api/checkAuth` returns `authorized: true`).

### 1.3 Snap & Send (AI Image Analysis + Voice Note + Ticket Creation)
- [ ] **Action:** Capture or upload a maintenance photo (e.g., broken light or water leak).
- [ ] **Expected:** `POST /api/analyzeImage` completes; AI automatically populates **Category**, **Urgency**, and **Summary** in Hebrew.
- [ ] **Action:** (Optional) Record a short voice note on the form and submit the report.
- [ ] **Expected:**
  - `POST /api/createTicket` returns `200` with `ticketNumber`.
  - Success screen appears (under 15 seconds total flow).
  - Committee (Vaad) admins receive a WhatsApp notification for the new ticket.

### 1.4 App Feedback Rating (Post-Submission)
- [ ] **Action:** On the ticket confirmation screen, tap a star/emoji rating (1–5) to submit app feedback.
- [ ] **Expected:** `POST /api/submitAppFeedback` returns `200`; thank-you confirmation is shown.

### 1.5 Resident Feed ("My Tickets" & "Open Building Tickets")
- [ ] **Action:** From `/report/<tenantId>`, open the Resident Tickets view / tab.
- [ ] **Expected:** `POST /api/getResidentTickets` returns `200` and displays both **My Tickets** and **Building Open Tickets**.
- [ ] **Action:** Verify the ticket photo and voice note play/render properly in the card.
- [ ] **Expected:** Image loads from `/img/<tenantId>/<imageId>` (`getImage`) and audio plays from `/aud/<tenantId>/<audioId>` (`getAudio`).
- [ ] **Action:** Click **"גם אני" (Me Too)** on an open building ticket.
- [ ] **Expected:** `POST /api/incrementMeToo` returns `200`; counter increments by 1 (and toggles off if clicked again).
- [ ] **Action:** Add a resident comment on your open ticket.
- [ ] **Expected:** `POST /api/addResidentComment` returns `200`; comment appears in the ticket timeline.

---

## Suite 2: Vaad Admin Dashboard (`adminApi` + `onTicketUpdate`)
*Covers: `/api/recordAdminLogin`, `/api/sendWhatsAppCommentNotification`, `/api/forwardTicketToVendor`, `/api/manageTenantUser`, `/api/submitSupportInquiry`, `onTicketUpdate`*

### 2.1 Admin Login & Audit Recording
- [ ] **Action:** Log into `https://tiktak-stg.web.app/admin` as a building admin.
- [ ] **Expected:** Dashboard loads tickets for the building; `AdminLogin.tsx` records the `LOGIN` event and `lastLogin` timestamp via the Firestore client SDK (visible in the **Audit Log** tab). *(Note: `/api/recordAdminLogin` is a backend endpoint and is not called by the UI on login.)*

### 2.2 Ticket Triage & Firestore Trigger (`onTicketUpdate`)
- [ ] **Action:** Open the newly created ticket in the Admin Dashboard and change its status from **Open (`open`)** to **In Progress (`in-progress`)**, then to **Resolved (`resolved`)** (with a closure reason).
- [ ] **Expected:**
  - Status updates in Firestore.
  - Background trigger `onTicketUpdate` automatically sends a WhatsApp status update to the reporting resident.

### 2.3 Admin Comment + WhatsApp Notification to Resident
- [ ] **Action:** Inside a ticket's details modal, write an admin comment and click the **Send via WhatsApp** button on that comment.
- [ ] **Expected:** `POST /api/sendWhatsAppCommentNotification` (now routed via `/api/*` -> `adminApi`) returns `200 OK`, and the resident receives the comment on WhatsApp.

### 2.4 Forward Ticket to Vendor via WhatsApp API
- [ ] **Action:** Open a ticket, choose **Forward to Vendor (העבר לספק)**, select a vendor with a valid phone number, and dispatch.
- [ ] **Expected:** `POST /api/forwardTicketToVendor` returns `200`; vendor receives the interactive WhatsApp message (with image/audio if attached) and action buttons (`מוכן לטפל` / `לא פנוי`).

### 2.5 Admin User Management
- [ ] **Action:** Go to **Settings -> Users / Admins** and create or edit a test admin user (or trigger password reset link).
- [ ] **Expected:** `POST /api/manageTenantUser` returns `200`; user is created/updated cleanly.

### 2.6 Admin Support Inquiry ("Ask TikTak")
- [ ] **Action:** Open the Admin Support / Help widget, type a message (>5 chars), and submit.
- [ ] **Expected:** `POST /api/submitSupportInquiry` returns `200`.

---

## Suite 3: Procurement & RFQ System (`rfqApi`)
*Covers: `/api/dispatchRfqToVendors`, `/api/dispatchRfqAddendum`, `/api/notifyQuoteSubmission`, `/api/recordRfqDispatch`*

### 3.1 Create & Dispatch RFQ to Vendors
- [ ] **Action:** In the Admin Dashboard, go to **RFQs (מכרזים / הצעות מחיר)**, create a new RFQ (or open a draft), select 1–2 test vendors, and click **Dispatch (שלח לספקים)**.
- [ ] **Expected:** `POST /api/dispatchRfqToVendors` (and/or `/api/recordRfqDispatch`) returns `200`; selected vendors receive the WhatsApp RFQ invitation with the portal link (`/quote/<tenantId>/<rfqId>/<vendorId>`).

### 3.2 Scope Addendum Dispatch
- [ ] **Action:** Edit an active/dispatched RFQ's scope of work and publish an addendum.
- [ ] **Expected:** `POST /api/dispatchRfqAddendum` returns `200`; vendors receive a WhatsApp notification about the updated scope.

### 3.3 Vendor Quote Submission Portal
- [ ] **Action:** Open the vendor's quote submission link (`/quote/<tenantId>/<rfqId>/<vendorId>`), fill in price/notes/warranty, sign, and submit the quote.
- [ ] **Expected:** `POST /api/notifyQuoteSubmission` returns `200`; building admins receive a WhatsApp alert that a new quote was submitted.

---

## Suite 4: Super Admin / God View (`adminApi`)
*Covers: `/api/provisionTenantOrFleet`, `/api/updateTenantLicensing`, `/api/toggleTenantFreeze`, `/api/deleteTenantPermanently`*

- [ ] **Action:** Log in as a **Super Admin** (`role === 'super'`) and open **God View / Tenant Management**.
- [ ] **Action (Provisioning):** Provision a temporary test building (`POST /api/provisionTenantOrFleet`).
- [ ] **Expected:** Returns `200`; new tenant appears in the list.
- [ ] **Action (Licensing):** Update the test tenant's ticket/RFQ quota or subscription tier (`POST /api/updateTenantLicensing`).
- [ ] **Expected:** Returns `200`; updated limits persist.
- [ ] **Action (Freeze / Unfreeze):** Toggle freeze on the test tenant (`POST /api/toggleTenantFreeze`).
- [ ] **Expected:** Returns `200`; visiting `/report/<testTenantId>` shows the frozen tenant banner; unfreezing restores access.
- [ ] **Action (Permanent Delete):** Delete the temporary test tenant (`POST /api/deleteTenantPermanently`).
- [ ] **Expected:** Returns `200`; test tenant and its subcollections are removed.

---

## Suite 5: WhatsApp Conversational Bot (`whatsappWebhook`)
*Covers: Standalone `whatsappWebhook` (Prod-to-Stg relay or direct WhatsApp Bot flow)*

- [ ] **Action (Resident Bot Report):** From a phone registered to a Staging tenant (`?stg` / staging tenant), send a text or photo + voice note to the TikTak WhatsApp Bot number.
- [ ] **Expected:**
  - Bot replies with category/location selection or AI verification preview.
  - Confirming the report creates the ticket in Staging Firestore (`tiktak-stg`) with `stg=true` links.
- [ ] **Action (Vendor Interactive Reply):** Reply to a forwarded vendor ticket message on WhatsApp (e.g., tap `מוכן לטפל` or provide ETA / quote).
- [ ] **Expected:** Bot updates the ticket timeline/vendor status in Firestore and notifies the Vaad admin.

