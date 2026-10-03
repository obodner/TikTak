# Technical Implementation Plan: Holistic Tenant Management & Annual RFQ Licensing Engine
## תוכנית יישום הנדסית שלבית: ניהול לקוחות הוליסטי, רישוי TikTak ו-RFQ שנתי, וניטור מכסות

**Document Status**: Approved Engineering Implementation Blueprint (v2.1)  
**Version**: 2.1.0  
**Target Architecture**: Google Cloud Run / Firebase Functions (Node.js/TypeScript) + Next.js/Vite Admin Frontend  
**Author**: Lead Systems Architect & Senior QA Lead (TikTak-BE & TikTak-FE)  
**Reference PRD**: [rfq_licensing_and_quota_enforcement_prd.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/PRDS/rfq_licensing_and_quota_enforcement_prd.md)  
**Source Specification**: [TikTak_RFQ_Procurement_Product_Overview.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_RFQ_Procurement_Product_Overview.md)  
**Date**: October 2026  

---

## 1. Architectural Architecture & Alignment

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SuperAdmin (God's View)                         │
│   - High-Density Tenants Table (with createdAt & lastLogin)            │
│   - Provisioning Wizard (Single Tenant & Fleet)                        │
│   - 3-Dots Quick Actions (Mandatory Confirmation Modals on all actions)│
│     * Direct Redirect (Instant)                                        │
│     * Update TikTak License (Modal)                                    │
│     * Update RFQ Annual License (Modal)                                │
│     * Freeze / Unfreeze (Modal)                                        │
│     * Permanent Delete (Modal + Exact Tenant ID typing)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Callable Cloud Functions (role === 'super')
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Backend Cloud Functions Engine                       │
│ 1. provisionTenantOrFleet ({ tenantData, fleetData, adminUser })      │
│ 2. updateTenantLicensing ({ tenantId, ticketTier, rfqAnnualTier, ... })│
│ 3. toggleTenantFreeze ({ tenantId, isActive })                         │
│ 4. deleteTenantPermanently ({ tenantId, confirmationId })              │
│ 5. recordAdminLogin ({ tenantId, uid })                                │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
                    ▼                               ▼
     ┌─────────────────────────────┐  ┌──────────────────────────────────┐
     │      Firestore Native       │  │    Multi-Admin Alerts Engine     │
     │ - tenants/{tenantId}        │  │ - 80% & 100% Annual Bank Alerts  │
     │ - tenants/.../adminUsers    │  │ - 30d, 7d, 0d Annual Expiration  │
     │ - audit_logs (centralized)  │  │ - WhatsApp Broadcast to all      │
     │                             │  │   tenant admins with phone       │
     └─────────────────────────────┘  └──────────────────────────────────┘
```

---

## 2. Phased Implementation Roadmap

The execution is partitioned into 6 distinct, sequential phases to ensure atomic delivery, backward compatibility, and rigorous QA verification at each step.

---

### Phase 1: Backend Foundation & API Services (GCP / Firebase Functions)
**Goal**: Build secure, server-authoritative endpoints for tenant creation, licensing mutations, admin password setup link generation, freeze toggle, and permanent deletion.

#### Tasks:
1. **Extend Cloud Function Endpoints in `functions/src/index.ts`**:
   - `provisionTenantOrFleet`:
     - Validates caller custom claims (`role === 'super'`).
     - Validates tenant slug availability against `tenants` collection.
     - Provisions Single Tenant or Fleet Master + Children with atomic batch/transaction.
     - Configures **Annual RFQ Credit Bank** (`annualQuota`, `overageRate`, `licenseStartDate`, `licenseExpiresAt`).
     - Creates/checks Firebase Auth user and creates subcollection `adminUsers`.
     - Generates secure password reset link via `auth.generatePasswordResetLink(email)`.
     - Emits `TENANT_CREATED` / `FLEET_CREATED` to root `audit_logs`.
   - `updateTenantLicensing`:
     - Updates `subscription` (monthly tickets) and `rfqLicensing` (annual tier, annual quota, overage fee, hard/soft cap, annual expiry date).
     - Emits `LICENSE_UPDATED` to root `audit_logs`.
   - `toggleTenantFreeze`:
     - Toggles `isActive: boolean` and updates `frozenAt`.
     - Emits `TENANT_FROZEN` / `TENANT_UNFROZEN` log.
   - `deleteTenantPermanently`:
     - Validates caller is superadmin and verifies `confirmationId === tenantId`.
     - Deletes all Auth accounts in `adminUsers`.
     - Deletes Cloud Storage files under `tenants/{tenantId}/`.
     - Recursively deletes Firestore subcollections and root tenant doc.
     - Emits high-severity `TENANT_DELETED` log.
2. **`lastLogin` Tracking Trigger**:
   - Lightweight update invoked when an admin authenticates to update `tenants/{tenantId}.lastLogin = serverTimestamp()`.

---

### Phase 2: High-Density Tenants Table in God's Eye View (`SuperAdminDashboard.tsx`)
**Goal**: Transform the current basic card grid in `/admin/god-view` into an actionable, enterprise-grade SaaS table with mandatory confirmation modals.

#### Tasks:
1. **Table View Component Construction**:
   - Replace card grid in `SuperAdminDashboard.tsx` with a responsive table.
   - **Columns**:
     - `שם לקוח ומזהה`: Name, Address, Slug, Entity Type badge (`🏢 מבנה` / `🏙️ מתחם מאסטר` / `↳ בת`).
     - `מנהלים רשומים`: Badge with admin count + interactive Popover showing names, emails, and mobile phones.
     - `רישוי TikTak (חודשי)`: Tier badge, live tickets gauge (`42/80 (52%)`), renewal date.
     - `רישוי RFQ (שנתי)`: Tier badge (Starter 3 / Basic 6 / Standard 12 / Growth 25 / Enterprise 50), annual credit bank gauge (`10/12 (83%)`), overage rate, annual expiry date.
     - `הוקם בתאריך`: Formatted `createdAt` (`DD/MM/YYYY`).
     - `כניסה אחרונה`: Definite date & time formatted `lastLogin` (`DD/MM/YYYY HH:mm`, or `-` if never logged in).
     - `סטטוס`: Active vs. Frozen.
     - `פעולות`: 3-Dots Dropdown menu (`•••`).
2. **Mandatory Confirmation Modals for Table Actions**:
   - **מעבר לניהול הלקוח**: Direct 1-click navigate to `/admin/:tenantId/dashboard` (no modal).
   - **עדכון רישוי TikTak Modal**: Confirmation modal allowing tier changes and quota adjustments with "שמור שינויים".
   - **עדכון רישוי RFQ Modal**: Confirmation modal allowing annual tier, annual credit bank quota, overage fee, and expiry date adjustments with "שמור שינויים".
   - **הקפאת / הפשרת לקוח Modal**: Confirmation modal with explicit warning before changing tenant active status.
   - **מחיקת לקוח לצמיתות Modal**: 2-step verification modal requiring typing the exact `tenantId` to unlock the permanent delete button.
3. **Full Localization (i18n) & RTL/LTR Dynamic Directionality**:
   - All text strings (table headers, tooltips, action menus, modal titles, confirmation questions, badges, buttons, error messages) MUST be added to `frontend/src/locales/he.json` and `frontend/src/locales/en.json`.
   - UI layout must adapt dynamically to `isRtl` (`dir={isRtl ? 'rtl' : 'ltr'}`) using Tailwind logical properties (`text-start`, `text-end`, `ms-*`, `me-*`, `ps-*`, `pe-*`).

---

### Phase 3: Tenant & Fleet Provisioning Wizard (`OnboardTenantModal.tsx`)
**Goal**: Retire `create_tenant.js` and `create_fleet.js` by providing a guided, error-free onboarding wizard in the frontend.

#### Tasks:
1. **Step-by-Step UI Wizard**:
   - **Step 1 (Structure)**: Single Tenant vs. Multi-Building Fleet; Building vs. Municipality.
   - **Step 2 (Details & Slugs)**: Names, addresses, auto-generated slug with debounce availability check; dynamic child building repeater in Fleet mode.
   - **Step 3 (Combined Licensing)**: 
     - Incident tickets monthly quota.
     - RFQ Procurement annual credit bank tier (Starter 3 / Basic 6 / Standard 12 / Growth 25 / Enterprise 50) + overage fees (₪59, ₪49, ₪45, ₪39, ₪35) + annual expiration date (12 months ahead).
   - **Step 4 (Initial Admin Setup)**: Admin name, email, mobile phone; option for automated password reset link vs. manual password.
   - **Step 5 (Summary & 1-Click Launch)**: Zod validation summary, execution progress spinner.
2. **Success & Handoff Screen**:
   - Displays created tenant links.
   - **"העתק הודעת WhatsApp למנהל"**: Pre-formatted WhatsApp greeting with the personal onboarding link and instructions.

---

### Phase 4: Multi-Admin Quota & Expiry Notification Engine
**Goal**: Ensure all registered admins receive timely WhatsApp alerts for 80%/100% annual credit bank consumption and annual license renewal.

#### Tasks:
1. **Multi-Admin Recipient Resolver**:
   - Function `getTenantAdminRecipients(tenantId)` fetching all admins in `adminUsers` with valid mobile numbers.
2. **80% & 100% Annual Quota Trigger**:
   - Integrated into the RFQ broadcast flow.
   - Evaluates ratio $\ge 0.80$ and $\ge 1.00$ of `annualQuota`.
   - Broadcasts WhatsApp message to **all resolved admin phone numbers**.
   - Stores `alertsSent.eightyPercent` and `alertsSent.hundredPercent` to prevent duplicate spamming within the annual cycle.
3. **Daily Cloud Scheduler Cron (`checkAnnualLicenseExpirations`)**:
   - Runs daily at `06:00 UTC`.
   - Scans active tenants with `rfqLicensing.licenseExpiresAt`.
   - Dispatches alerts at **30 days before**, **7 days before**, and **day of expiration** to all admin phone numbers.
   - Records milestone timestamps in `expiryAlertsSent` to ensure idempotency.

---

### Phase 5: RFQ Hub Quota Metering & Client-Side Enforcer (`NewRfqPage.tsx`)
**Goal**: Enforce plan limits within the RFQ creation flow without degrading user experience.

#### Tasks:
1. **RFQ Header Quota Pill**:
   - Visual progress indicator in `/admin/:tenantId/quotes/*` showing remaining annual bank quota and color shift (Green / Amber 80% / Red 100%).
2. **Dispatch Enforcer**:
   - In **Hard Cap**: If annual bank is exhausted (100%), disable `שלח בקשה לקבלנים` button and display modal: *"בנק הפניות השנתי מוצה במלואו. צור קשר עם מנהל המערכת לשדרוג או רכישת חבילת הרחבה"*.
   - In **Soft Cap**: Keep button active but display warning badge: *"חריגה מבנק הבקשות: בקשה זו תחוייב בדמי חריגה של ₪{overageRate}"*.
3. **Contractor Invariant Check**:
   - Verify public contractor quote submission `/quote/:rfqId` remains 100% accessible even when tenant reaches 100% quota.

---

### Phase 6: Senior QA Test Suite & Migration
**Goal**: Comprehensive validation against Oren Bodner QA Standards and deprecation of CLI scripts.

#### Tasks:
1. **Automated & Manual Test Scenarios**:
   - `QA-SEC-01`: Non-superadmin access rejection on all new Cloud Functions.
   - `QA-TAB-02`: Table rendering accuracy for 20+ tenants, including `createdAt` and `lastLogin` formatting.
   - `QA-MODAL-03`: Confirmation modals trigger for each 3-dots action (except direct redirect).
   - `QA-WIZ-04`: End-to-end creation of Single Tenant and Fleet with initial admin password reset link verification.
   - `QA-NOTIF-05`: Multi-admin broadcast verification: verify WhatsApp notifications reach all admins with valid phone numbers.
   - `QA-EXP-06`: Annual expiration cron milestone simulation (30d, 7d, 0d) verifying deduplication.
   - `QA-DEL-07`: Permanent deletion safety test: mismatched slug blocks deletion; matching slug thoroughly removes Auth, Storage, and Firestore records.
2. **Documentation & CLI Deprecation**:
   - Update `docs/user_guide_en.md` and `docs/user_guide_he.md`.
   - Mark `scripts/create_tenant.js` and `scripts/create_fleet.js` as deprecated in favor of the in-app God's View Wizard.
