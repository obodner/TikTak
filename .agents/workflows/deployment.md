---
description: Build and deploy TikTak to Staging (tiktak-stg) or Production (tiktak2026)
---

# TikTak Deployment Workflow

TikTak uses two isolated Firebase environments defined in `.firebaserc`:
- **Staging (`staging` / `default`)**: `tiktak-stg` (`https://tiktak-stg.web.app`)
- **Production (`prod`)**: `tiktak2026` (`https://mytiktak.com` / `https://tiktak2026.web.app`)

> **Important**: Always clarify with the user whether to deploy to **Staging** (`stg`) or **Production** (`prod`), and whether to deploy everything or only a specific target (`hosting`, `functions`, a specific domain function, or `rules`). Default to **Staging** when testing new features or fixes.

## Hybrid Domain-Grouped Cloud Functions Architecture
Instead of 29 individual Cloud Run services, TikTak's backend is organized into **9 Cloud Functions**:
- **`residentApi`**: Grouped HTTP router for resident & public endpoints (`health`, `landingMetrics`, `buildingInfo`, `checkAuth`, `analyzeImage`, `createTicket`, `submitAppFeedback`, `getResidentTickets`, `addResidentComment`, `incrementMeToo`)
- **`adminApi`**: Grouped HTTP router for Vaad admin & super-admin endpoints (`manageTenantUser`, `forwardTicketToVendor`, `sendWhatsAppCommentNotification`, `submitSupportInquiry`, `recordAdminLogin`, `provisionTenantOrFleet`, `updateTenantLicensing`, `toggleTenantFreeze`, `deleteTenantPermanently`)
- **`rfqApi`**: Grouped HTTP router for vendor bidding & RFQ endpoints (`dispatchRfqToVendors`, `dispatchRfqAddendum`, `notifyQuoteSubmission`, `recordRfqDispatch`)
- **`whatsappWebhook`**: Standalone Meta WhatsApp Cloud API webhook & conversational state machine
- **`getImage` / `getAudio`**: Standalone high-cache media proxies (`/img/**`, `/aud/**`, `/audio/**`)
- **`onTicketUpdate` / `slaCron` / `checkAnnualLicenseExpirations`**: Standalone Firestore trigger & scheduled cron jobs

## How Build & Environment Injection Work Automatically
- **Frontend (`firebase.json` predeploy)**: Hosting deployments automatically invoke `node scripts/build-frontend.cjs`, which detects `GCLOUD_PROJECT` and runs `npm --prefix frontend run build:stg` (`--mode staging` -> `frontend/.env.staging`) for `tiktak-stg` or `npm --prefix frontend run build:prod` (`--mode production` -> `frontend/.env.production`) for `tiktak2026`.
- **Cloud Functions (`firebase.json` predeploy & env)**: Functions deployments automatically compile TypeScript (`npm --prefix functions run build`), apply `FUNCTIONS_DISCOVERY_TIMEOUT=60` via `scripts/firebase-deploy.cjs`, and load `functions/.env.tiktak-stg` or `functions/.env.tiktak2026`.

---

## 1. Staging Deployment Commands (`tiktak-stg`)

Run from the repository root (`c:\Users\orenb\OneDrive\Desktop\TikTak`):

- **Deploy Everything (Hosting, Functions, Firestore & Storage Rules/Indexes)**:
  ```bash
  npm run deploy:stg
  ```
- **Deploy Frontend (Hosting) Only**:
  ```bash
  npm run deploy:stg:hosting
  ```
- **Deploy All Cloud Functions (9 functions)**:
  ```bash
  npm run deploy:stg:functions
  ```
- **Deploy Single Domain Cloud Function (Fastest ~20s)**:
  ```bash
  npm run deploy:stg:resident   # Only residentApi
  npm run deploy:stg:admin      # Only adminApi
  npm run deploy:stg:rfq        # Only rfqApi
  npm run deploy:stg:bot        # Only whatsappWebhook
  ```
- **Deploy Firestore & Storage Rules/Indexes Only**:
  ```bash
  npm run deploy:stg:rules
  ```

---

## 2. Production Deployment Commands (`tiktak2026`)

Run from the repository root (`c:\Users\orenb\OneDrive\Desktop\TikTak`) only after verifying changes in Staging:

- **Deploy Everything to Production**:
  ```bash
  npm run deploy:prod
  ```
- **Deploy Frontend (Hosting) Only to Production**:
  ```bash
  npm run deploy:prod:hosting
  ```
- **Deploy All Cloud Functions to Production**:
  ```bash
  npm run deploy:prod:functions
  ```
- **Deploy Single Domain Cloud Function to Production**:
  ```bash
  npm run deploy:prod:resident
  npm run deploy:prod:admin
  npm run deploy:prod:rfq
  npm run deploy:prod:bot
  ```
- **Deploy Firestore & Storage Rules/Indexes Only to Production**:
  ```bash
  npm run deploy:prod:rules
  ```
