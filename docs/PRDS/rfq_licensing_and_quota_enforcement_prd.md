# PRD: Holistic Tenant Provisioning, Licensing Management & Annual RFQ Quota Enforcement
## מערכת הקמה הוליסטית של לקוחות, ניהול רישוי TikTak ו-RFQ שנתי, וניטור מכסות ב-God's View

**Document Status**: Approved Product Architecture & Specification (v2.1)  
**Version**: 2.1.0  
**Target Module**: TikTak Control Center (`/admin/god-view`), RFQ Hub (`/admin/:tenantId/quotes/*`), Backend Metering & Alerts Engine  
**Author**: TikTak Lead Product Manager (TikTak-PM) & Lead Architect  
**Stakeholder & Quality Gatekeeper**: Oren Bodner (Lead Architect & Senior QA Lead)  
**Reference Source**: [TikTak_RFQ_Procurement_Product_Overview.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_RFQ_Procurement_Product_Overview.md)  
**Date**: October 2026  

---

## 1. Executive Summary & Problem Statement

### 1.1 The Business Need
Historically, provisioning new tenants and multi-building fleets required running developer CLI scripts (`create_tenant.js`, `create_fleet.js`) with manual Firebase Admin credentials. While functional during the early pilot phase, this workflow is inaccessible to non-technical operators, prone to human error, lacks real-time validation, and decouples tenant creation from ongoing licensing governance.

Furthermore, with the introduction of the **Vendor Quotation (RFQ) Procurement Module**, TikTak requires a centralized, commercial-grade licensing and metering infrastructure. Unlike routine maintenance tickets (which recur monthly), capital projects and contractor tenders are **strictly seasonal** (autumn waterproofing, spring painting/gardening). Therefore, the RFQ licensing operates as an **Annual Pre-Paid Credit Bank (בנק בקשות הצעות מחיר שנתי)** with tier-based overage fees.

This specification:
1. **Empowers SuperAdmins** to manage the entire customer lifecycle from a single, unified interface in **God's Eye View** (`/admin/god-view`): provisioning new buildings/fleets, configuring core ticket quotas and annual RFQ credit banks, inspecting activity, and executing administrative actions.
2. **Presents a high-density, actionable table** replacing the basic card grid with comprehensive tenant operational data (including `createdAt` and `lastLogin`).
3. **Guarantees safety on all administrative actions**: Every action in the 3-dots menu (except direct navigation to the tenant dashboard) mandates an explicit confirmation modal before executing.
4. **Automates multi-admin notifications**:
   - **Annual RFQ Quota Alerts** (at **80%** and **100%** of the annual credit bank) sent via WhatsApp to **all registered tenant admins** with valid mobile numbers.
   - **Annual License Expiration Alerts** (at **30 days**, **7 days**, and **expiration day**) ensuring predictable B2B renewal cycles.
5. **Streamlines admin onboarding** by generating secure password-setup links (`generatePasswordResetLink`) delivered via automated email and 1-click WhatsApp invitation templates.

---

## 2. Goals & Non-Goals

### 2.1 Goals
1. **High-Density Tenants Table (`/admin/god-view`)**: Replace the cards grid with a comprehensive data table displaying tenant name/slug, registered admins count, TikTak monthly license & usage, RFQ annual license & usage, `createdAt`, `lastLogin`, status, and a 3-dots action menu.
2. **Mandatory Confirmation Modals for Table Actions**: Every action in the 3-dots menu (Update TikTak License, Update RFQ License, Freeze/Unfreeze, and Delete Tenant) prompts for explicit user confirmation in a modal. Direct redirect to tenant dashboard executes immediately without a modal.
3. **SuperAdmin Provisioning Wizard**: Provide an intuitive in-app wizard to create single tenants and multi-building fleets (retiring CLI scripts) with live slug uniqueness validation.
4. **Annual Credit Bank Model for RFQ**: Model RFQ licensing on an **Annual Allocation** (3, 6, 12, 25, 50 RFQs/year) aligned with [TikTak_RFQ_Procurement_Product_Overview.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_RFQ_Procurement_Product_Overview.md), with tier-specific overage rates.
5. **Multi-Admin WhatsApp Quota Alerts**: When annual RFQ usage reaches 80% or 100%, broadcast alerts to **all admins** belonging to that tenant who have a valid mobile number.
6. **Annual License Expiration Alerts**: Proactively notify all tenant admins 30 days and 7 days prior to their annual RFQ license expiration, and on the expiration date itself.
7. **Frictionless Admin Onboarding**: Leverage Firebase Auth's `generatePasswordResetLink` so new admins can set their own passwords immediately without SuperAdmin guessing, backed by a 1-click WhatsApp invite text generator.
8. **Safe Tenant Deletion**: Implement an in-app permanent tenant deletion modal requiring explicit typing of the `tenantId` (mirroring `delete_tenant.js` safety rules) that cleans up Auth users, Storage files, and Firestore documents.

### 2.2 Non-Goals (Scope Boundaries)
- **Monthly RFQ Quotas**: RFQ is strictly an **annual bank**, NOT a monthly quota.
- **Self-Serve Customer Invite Links**: Deferred to Phase 2. Phase 1 focuses strictly on SuperAdmin direct creation and management.
- **Automated Credit Card Clearing**: Phase 1 generates billing summaries and overage tracking; credit card auto-charging is handled manually / in Phase 2.
- **Contractor Restrictions**: Vendors can always submit quotes for already-dispatched RFQs even if a tenant hits 100% quota.
- **Resident Reporting Obstruction**: Tenant quota and license status never block residents from reporting building incidents.

---

## 3. Subscription & Licensing Matrices

### 3.1 TikTak Core Incident Tickets Matrix (Monthly Recurring)
| Tier License | Monthly Fee | Included Tickets | Overage Fee / Extra Ticket | Target Building Size |
| :--- | :--- | :--- | :--- | :--- |
| **Starter** | ₪99 / mo | 15 tickets | ₪12.00 / ticket | Small (<50 units) |
| **Basic** | ₪199 / mo | 35 tickets | ₪10.00 / ticket | Small–Mid (~100–150 units) |
| **Standard** | ₪399 / mo | 80 tickets | ₪8.00 / ticket | Mid-size (~200–300 units) |
| **Growth** | ₪699 / mo | 160 tickets | ₪7.00 / ticket | Large (~400–600 units) |
| **Enterprise / Fleet**| ₪1,199 / mo | 300 tickets (Pooled)| ₪5.50 / ticket | Multi-building complexes |

---

### 3.2 RFQ Procurement Module Matrix (Annual Credit Bank & Overage Fees)
*Source of Truth: [TikTak_RFQ_Procurement_Product_Overview.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_RFQ_Procurement_Product_Overview.md) Section 2.2*

Because capital renovations and contractor bids are seasonal (roof leaks in autumn, exterior painting in spring, quiet winters), RFQs are provisioned as an **Annual Credit Bank (חבילת בקשות שנתית)** valid for 12 months:

| RFQ Tier License | Annual Allocation (Bank) | Annual Price | Effective Rate / RFQ | Overage Fee (Extra RFQ) | Target Community Size |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Disabled** | 0 RFQs | ₪0 | - | - | Module hidden |
| **RFQ Starter** | **5 RFQs / year** | ₪249 / year | ₪49.80 / RFQ | **₪49.00 / extra RFQ** | Small building (<24 units) |
| **RFQ Basic** | **10 RFQs / year** | ₪449 / year | ₪44.90 / RFQ | **₪45.00 / extra RFQ** | Mid-size (~25–60 units) |
| **RFQ Standard** | **15 RFQs / year** | ₪599 / year | ₪39.93 / RFQ | **₪40.00 / extra RFQ** | Towers & complexes (~60–120 units) |
| **RFQ Growth** | **25 RFQs / year** | ₪899 / year | ₪35.96 / RFQ | **₪36.00 / extra RFQ** | Large complexes (~120–250+ units) |
| **RFQ Custom / Enterprise**| **Custom $N$ RFQs** | Custom Contract | Volume-tiered | Negotiated | Municipal, Settlements & fleets |

#### Top-Up Packs & Overage Policy:
- **Soft Cap Mode**: If a building exhausts its annual credit bank, additional RFQs can be dispatched at the tier's **Overage Fee** (billed at year-end or via top-up pack).
- **Hard Cap Mode**: Dispatches are locked once the annual allocation is reached until upgraded or topped up.
- **Top-Up Option**: Single RFQ top-up is available for ₪49; 3-pack top-up is available for ₪129; 5-pack top-up is available for ₪199.

---

## 4. SuperAdmin Dashboard: The High-Density Tenants Table

### 4.1 Interface Specification (`/admin/god-view` -> Tab `tenants`)
Replaces the card grid with a responsive, filterable table view:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TikTak Control Center | ניהול לקוחות ומנויים                                  [ 🔍 חיפוש... ]  [ + הקמת לקוח או מתחם חדש ]    │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ פילטרים: [ הכל (14) ]  [ מבנים בודדים (10) ]  [ מתחמי מאסטר (2) ]  [ מבנים מקושרים (2) ]  [ מוקפאים (0) ]                      │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ שם לקוח ומזהה          │ מנהלים רשומים │ רישוי TikTak (חודשי)│ רישוי RFQ (שנתי)   │ הוקם בתאריך │ כניסה אחרונה │ סטטוס │ פעולות   │
├────────────────────────┼───────────────┼─────────────────────┼────────────────────┼─────────────┼──────────────┼───────┼──────────┤
│ 🏢 מגדל השחר           │ 👥 3 מנהלים   │ [Standard]          │ [Standard (12/שנה)]│ 12/03/2026  │ 12/03/2026 14:22 │ פעיל  │ [ ••• ]  │
│    hashahar (רוטשילד 1)│ (הצג רשימה)   │ 42/80 (52%)         │ 10/12 (83%) ⚠️     │             │                  │       │          │
├────────────────────────┼───────────────┼─────────────────────┼────────────────────┼─────────────┼──────────────────┼───────┼──────────┤
│ 🏙️ מתחם שרונה (מאסטר)  │ 👥 5 מנהלים   │ [Enterprise (Pool)] │ [Enterprise (50)]  │ 01/01/2026  │ 11/03/2026 09:10 │ פעיל  │ [ ••• ]  │
│    sarona-master       │ (הצג רשימה)   │ 210/300 (70%)       │ 18/50 (36%)        │             │                  │       │          │
├────────────────────────┼───────────────┼─────────────────────┼────────────────────┼─────────────┼──────────────────┼───────┼──────────┤
│ ↳  שרונה בניין A (בת)  │ 👥 (משותף)    │ [צורך ממאסטר]       │ [צורך ממאסטר]      │ 01/01/2026  │ 09/03/2026 18:40 │ פעיל  │ [ ••• ]  │
│    sarona-bldg-a       │               │ 85 קריאות נוצלו     │ 7 RFQs נוצלו       │             │                  │       │          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Table Columns Breakdown
1. **שם לקוח ומזהה (Tenant Name & ID)**:
   - Tenant Name, Address, ID slug (`hashahar`), and Entity Badge (`🏢 מבנה`, `🏙️ מתחם מאסטר`, or `↳ מבנה במתחם`).
2. **מנהלים רשומים (Admins)**:
   - Badge showing count (`3 מנהלים`).
   - Click/Hover popover displays each admin's full name, email, mobile phone, and role.
3. **רישוי TikTak (Incident Tickets - Monthly)**:
   - Tier pill (Starter / Basic / Standard / Growth / Enterprise).
   - Real-time progress bar: `42/80 (52%)` with monthly cycle renewal date.
4. **רישוי הצעות מחיר (RFQ License - Annual)**:
   - Tier pill (Disabled / Starter / Basic / Standard / Growth / Enterprise).
   - Annual usage gauge: `10/12 (83%)` with color-coded warning state (Green <80%, Amber 80–99%, Red 100%).
   - Annual expiration date (`תוקף: 31/12/2026`).
5. **הוקם בתאריך (`createdAt`)**:
   - Formatted local date string (`DD/MM/YYYY`).
6. **כניסה אחרונה (`lastLogin`)**:
   - תאריך ושעה מוגדרים ומדויקים (Definite Date & Time, לא יחסי): פורמט `DD/MM/YYYY HH:mm` (למשל: `12/03/2026 14:22`, או `-` אם טרם בוצעה כניסה).
7. **סטטוס**:
   - `פעיל (Active)` ירוק / `מוקפא (Frozen)` אפור-כחול.
8. **פעולות (3-Dots Context Menu - `•••`)**:
   - ↗️ **מעבר לניהול הלקוח** (Jump to `/admin/:tenantId/dashboard`) -> **Direct redirect without confirmation**.
   - 💳 **עדכון רישוי TikTak** -> **Opens Confirmation & Edit Modal**.
   - 🛠️ **עדכון רישוי RFQ** -> **Opens Confirmation & Edit Modal**.
   - ❄️ **הקפאת / הפשרת לקוח** -> **Opens Confirmation Modal** ("האם אתה בטוח שברצונך להקפיא/להפשיר את פעילות הלקוח?").
   - 🗑️ **מחיקת לקוח לצמיתות** -> **Opens Safety Confirmation Modal** (Requiring typing exact `tenantId`).

### 4.3 בינלאומיות (i18n), תמיכת כיווניות (RTL / LTR) וקובצי שפה
- **אפס טקסט מקודד קשיח (Zero Hardcoded Strings)**: כל מחרוזות הממשק (כותרות עמודות, תגיות, כפתורים, תפריטי פעולות, הודעות מודאלים ושגיאות) יוגדרו באופן בלעדי בקובצי התרגום תחת תיקיית המקור:
  - `frontend/src/locales/he.json` (עברית)
  - `frontend/src/locales/en.json` (אנגלית)
- **כיווניות דינמית (RTL / LTR)**:
  - הממשק יתאים את כיוון התצוגה (`dir="rtl"` עבור עברית ו-`dir="ltr"` עבור אנגלית) בהתאם לשפת הלקוח / מנהל המערכת.
  - שימוש במאפיינים לוגיים ב-CSS/Tailwind (כגון `text-start`, `text-end`, `ms-*`, `me-*`, `ps-*`, `pe-*`) כדי להבטיח היפוך כיווניות מושלם בכל הרזולוציות.

---

## 5. SuperAdmin Tenant & Fleet Provisioning Wizard

Accessible via the `+ הקמת לקוח או מתחם חדש` button in God's View:

### 5.1 Step-by-Step Flow

#### **Step 1: מבנה הישות (Structure Selection)**
- Toggle between:
  - **🏢 מבנה / לקוח בודד (Single Tenant)**
  - **🏙️ מתחם מנוהל / חברת ניהול (Multi-Building Fleet)**
- Entity Type: `בית משותף` / `יישוב / מועצה מקומית`.

#### **Step 2: פרטי הלקוח והמבנים (Entity Details & Slugs)**
- **Single Tenant**: Name, Address, and `tenantId` (auto-suggested slug with inline debounce availability check against Firestore).
- **Fleet Mode**:
  - Master Host Name & Address (can be Building #1 or dedicated Parent Company).
  - Dynamic Repeater: `+ הוסף מבנה למתחם` allowing entry of Building Name, Address, and unique Slug for each child building.

#### **Step 3: הגדרת חבילות רישוי משולבות (Combined Licensing Setup)**
1. **TikTak Incident Tickets Quota (חודשי)**:
   - Tier selection (`Starter (15)`, `Basic (35)`, `Standard (80)`, `Growth (160)`, `Enterprise (300)`).
   - Billing cycle renewal day (defaults to current day of month).
2. **RFQ Procurement Module License (שנתי)**:
   - RFQ Tier selection:
     - `Disabled`
     - `Starter` (3 RFQs/yr, ₪179, ₪59 overage)
     - `Basic` (6 RFQs/yr, ₪299, ₪49 overage)
     - `Standard` (12 RFQs/yr, ₪499, ₪45 overage)
     - `Growth` (25 RFQs/yr, ₪899, ₪39 overage)
     - `Enterprise` (50 RFQs/yr, ₪1,599, ₪35 overage)
   - Enforcement mode:
     - **Hard Cap (חסימה קשיחה)**: Blocks new dispatch at 100% with upgrade/top-up prompt.
     - **Soft Cap (חריגה מותרת)**: Allows continued dispatch with overage fee notification.
   - **תוקף רישוי שנתי (Annual Expiration Date)**: Defaults to 12 months from today.

#### **Step 4: הקמת מנהל ראשון (First Admin User Setup)**
- Full Name (שם מלא), Mobile Phone (טלפון נייד), and Email.
- Radio choice:
  - **(•) שלח קישור מאובטח להגדרת סיסמה (מומלץ)**: Uses `admin.auth().generatePasswordResetLink(email)` for zero-friction setup.
  - **( ) הגדר סיסמה ראשונית ידנית**: Password field (min 6 chars).

#### **Step 5: סיכום ויצירה בלחיצה אחת (Review & 1-Click Launch)**
- Validates all fields with Zod.
- Calls backend function `provisionTenantOrFleet`.
- On success: Displays an onboarding modal with:
  - Direct dashboard link.
  - Public resident reporting link.
  - **"העתק הודעת WhatsApp למנהל"**: Pre-filled Hebrew greeting containing the login URL and the personalized password setup link.

---

## 6. Multi-Admin Quota & Annual Expiry Notification Engine

### 6.1 Multi-Admin Broadcast Logic
In accordance with the approved architectural decisions, **all notifications are sent to ALL admins of the tenant with valid phone numbers**:
```typescript
// Resolution logic for notification recipients
async function getTenantAdminRecipients(tenantId: string): Promise<Array<{ uid: string; name: string; phone: string; email: string }>> {
  const adminsSnap = await db.collection("tenants").doc(tenantId).collection("adminUsers").get();
  return adminsSnap.docs
    .map(doc => doc.data())
    .filter(u => u.mobile && u.mobile.trim().length >= 9)
    .map(u => ({
      uid: u.uid,
      name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'מנהל/ת',
      phone: u.mobile.replace(/\D/g, ''),
      email: u.email
    }));
}
```

### 6.2 Annual RFQ Credit Bank Alerts (80% & 100%)
Triggered immediately upon dispatching an RFQ when the annual ratio crosses thresholds:

#### **80% Warning Template (Broadcasted to all tenant admins)**:
> *"שלום {adminName} (ועד {buildingName}),*  
> *שימו לב: ניצלתם 80% מבנק בקשות הצעות המחיר השנתי שלכם ({used}/{annualQuota} פניות).*  
> *נותרו לכם {remaining} בקשות עד לסיום תקופת הרישוי ב-{licenseExpiresAt}.*  
> *לשדרוג חבילה או רכישת חבילת הרחבה: {upgradeLink}"*

#### **100% Limit Reached Template (Hard Cap Mode)**:
> *"שלום {adminName} (ועד {buildingName}),*  
> *הגעתם ל-100% מניצול בנק הצעות המחיר השנתי ({annualQuota}/{annualQuota}).*  
> *הצעות מחיר פעילות ממשיכות לפעול כרגיל, אך לא ניתן לפתוח מכרזים חדשים עד לרכישת חבילת הרחבה או שדרוג.*  
> *לרכישת חבילת הרחבה או שדרוג מיידי: {upgradeLink}"*

### 6.3 Annual License Expiration Alerts
Monitored by a daily Cloud Scheduler cron job evaluating `rfqLicensing.licenseExpiresAt`:

| Expiration Milestone | Trigger | Action & Message Content |
| :--- | :--- | :--- |
| **30 Days Before** | `daysUntilExpiry === 30` | WhatsApp + Email alert to all admins: *"שלום {adminName}, מנוי הצעות המחיר השנתי עבור {buildingName} יסתיים בעוד 30 יום ({expiryDate}). להסדרת חידוש המנוי לחצו כאן."* |
| **7 Days Before** | `daysUntilExpiry === 7` | Urgent WhatsApp alert: *"תזכורת דחופה: נותרו 7 ימים בלבד לסיום תוקף רישוי הצעות המחיר של הבניין. למניעת השבתת המודול, יש לחדש את המנוי בהקדם."* |
| **Day of Expiration** | `daysUntilExpiry === 0` | Final WhatsApp alert: *"תוקף הרישוי השנתי של מודול הצעות מחיר הסתיים היום. המודול הועבר למצב קריאה בלבד עד להסדרת החידוש."* |

---

## 7. Data Architecture & Firestore Schema

```typescript
interface TenantDocument {
  id: string;
  name: string;
  address: string;
  type: 'building' | 'municipality';
  isActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  lastLogin?: FirebaseFirestore.Timestamp;
  adminUids: string[];
  
  // Fleet Hierarchy
  isPoolMaster?: boolean;
  childTenantIds?: string[];
  parentEnterpriseId?: string;
  usesParentPool?: boolean;

  // Incident Tickets Subscription (Monthly)
  subscription: {
    tier: 'starter' | 'basic' | 'standard' | 'growth' | 'enterprise';
    status: 'active' | 'frozen';
    monthlyQuota: number;
    overageRate: number;
    billingCycleStartDay: number;
    cycleStartDate: string;
    cycleEndDate: string;
    currentCycleTicketCount: number;
    currentCycleExclusions: number;
  };

  // RFQ Procurement Module Licensing (Annual Credit Bank)
  rfqLicensing?: {
    tier: 'disabled' | 'starter' | 'basic' | 'standard' | 'growth' | 'enterprise' | 'custom';
    status: 'active' | 'expired' | 'suspended';
    annualQuota: number;       // e.g. 12 RFQs / year
    overageRate: number;       // e.g. ₪45 / extra RFQ
    enforcementMode: 'hard' | 'soft';
    licenseStartDate: string;  // ISO date string
    licenseExpiresAt: string;  // ISO date string (12 months from start)
    currentAnnualUsage: {
      dispatchedCount: number; // Number of RFQs dispatched in current 12-month period
      alertsSent: {
        eightyPercent?: { sentAt: string; recipientsCount: number };
        hundredPercent?: { sentAt: string; recipientsCount: number };
      };
    };
    expiryAlertsSent?: {
      thirtyDaysAt?: string;
      sevenDaysAt?: string;
      expiredAt?: string;
    };
  };
}
```

---

## 8. Modal Confirmation Matrix for 3-Dots Actions

| Action in 3-Dots Menu | Requires Modal? | Modal Title & Confirmation Content | Impact / Security Safeguard |
| :--- | :--- | :--- | :--- |
| **מעבר לניהול הלקוח** | **No** | Direct navigation to `/admin/:tenantId/dashboard`. | Seamless operator routing. |
| **עדכון רישוי TikTak** | **Yes** | *"עדכון חבילת תקלות TikTak"* — Radio tier selector, quota adjustment, and explicit "שמור שינויים" button. | Emits `LICENSE_UPDATED` log, adjusts ticket allowances immediately. |
| **עדכון רישוי RFQ** | **Yes** | *"עדכון רישוי הצעות מחיר (RFQ)"* — Annual tier, annual quota, overage rate, annual expiry date, hard/soft cap, and explicit "שמור שינויים" button. | Emits `LICENSE_UPDATED` log, updates credit bank and expiry. |
| **הקפאת / הפשרת לקוח** | **Yes** | *"הקפאת / הפשרת פעילות לקוח"* — Warning: "הקפאת הלקוח תמנע כניסת מנהלים למערכת ודיווח דיירים עד להפשרה. האם להמשיך?". | Toggles `isActive: false`, logs state change. |
| **מחיקת לקוח לצמיתות** | **Yes** | *"מחיקה בלתי הפיכה של לקוח"* — Warning outlining full purge of Auth, Storage, and Firestore. **Requires typing exact `tenantId`**. | Prevents accidental data loss; mirror of `delete_tenant.js`. |

---

## 9. Senior QA Acceptance Criteria (Oren Bodner Quality Gate)

| ID | Category | Scenario | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **QA-PRD-01** | Confirmation Gate | Clicking any 3-dots action except redirect. | Confirmation modal opens; action is NOT executed until explicitly confirmed. |
| **QA-PRD-02** | Direct Redirect | Clicking "מעבר לניהול הלקוח" in 3-dots. | Instantly navigates to `/admin/:tenantId/dashboard` without showing any modal. |
| **QA-PRD-03** | Annual RFQ Pricing | SuperAdmin sets RFQ Standard. | Sets annualQuota = 12, annualPrice = 499, overageRate = 45. Verifies no monthly quota applies. |
| **QA-PRD-04** | Multi-Admin Quota Alert | Tenant dispatches 10th RFQ out of 12 (83%). | All registered admins with phone numbers receive WhatsApp alert with dynamic link. |
| **QA-PRD-05** | Annual Expiry Alert | 30 days before `licenseExpiresAt`. | Cloud Scheduler triggers alert to all admins; records `thirtyDaysAt` timestamp. |
| **QA-PRD-06** | Safe Deletion Gate | Attempting deletion with mismatched tenantId string. | "מחק לצמיתות" button remains disabled; typing exact ID enables execution. |
