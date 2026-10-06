# TikTak RFQ Procurement System: Complete Product Overview
**Enterprise B2B Contractor Tenders, Digital Procurement, and Statutory Compliance Platform**

---

## 1. Executive Summary & Strategic Business Value

### 1.1 From Reactive Maintenance Hotline to Fiduciary Financial Governance
Historically, building maintenance software functioned strictly as a reactive incident-reporting hotline—solving low-stakes daily nuisances (e.g., burnt lightbulbs, lobby scuffs, intercom buzzing, typical repair cost: ₪100–₪300). While this eliminated WhatsApp noise, it remained a **cost center** for residential committees (*Vaad Bayit*) and property management firms.

The **TikTak RFQ (Request for Quotation / מכרזי מחיר ורכש קבלנים) System** fundamentally elevates the platform into a high-stakes **financial governance, capital expenditure (CapEx) control, and legal protection engine**. 

By digitizing high-value capital repairs (₪5,000–₪100,000+ for roof waterproofing, elevator modernizations, booster pump overhauls, exterior facade restoration, and landscaping), the RFQ system transforms property maintenance from chaotic, undocumented verbal estimates into an **auditable, competitive procurement workflow**.

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                TIKTAK PLATFORM VALUE EVOLUTION                         │
├───────────────────────────────────────────┬───────────────────────────────────────────┤
│            TIKTAK CORE (Incidents)        │          TIKTAK PROCUREMENT (RFQ Hub)     │
├───────────────────────────────────────────┼───────────────────────────────────────────┤
│ • Routine incident logging & triage       │ • Capital works & large repairs (₪5K–₪50K+)│
│ • Reactive resident communication         │ • Multi-contractor competitive tenders    │
│ • Low-value fixes (₪100 – ₪300)           │ • Apples-to-apples standardized bid matrix│
│ • Day-to-day operational convenience      │ • Direct financial savings: 15%–25%/job   │
│ • Role: "Digital Maintenance Notice Board"│ • Role: "Fiduciary Legal & Audit Vault"   │
└───────────────────────────────────────────┴───────────────────────────────────────────┘
```

---

### 1.2 How the RFQ System Saves Money & Eliminates Legal Risk

In Israel, standard condominium governance and fiduciary law require committees to collect multiple comparative quotes for major works. In traditional manual operations (phone calls, voice memos, individual WhatsApp chats), committees encounter severe financial waste and legal vulnerabilities:

1. **The Competitive Tender Effect ("שיטת מצליח" Suppression)**:
   When an Israeli contractor receives a casual telephone inquiry from an amateur committee volunteer, quotes are routinely marked up 20%–30%. In contrast, when contractors receive an official TikTak tender link:
   > *`פנייה רשמית להצעת מחיר | מועד אחרון: 48 שעות | הפנייה נשלחה במקביל ל-3 ספקים מורשים`*  
   Contractors immediately recognize a timed, competitive digital tender. They submit their sharpest, most competitive commercial rate upfront, instantly saving the building ₪1,500–₪4,000 on a standard ₪15,000–₪20,000 job.

2. **Eliminating the "Apples-to-Oranges" Trap**:
   In manual quoting, Contractor A bids ₪9,000 using acrylic sealant, while Contractor B bids ₪13,000 using 4mm elastomeric bitumen membranes. Committees often select Contractor A based on raw price alone, only to experience recurring winter leaks that cause ₪30,000 in drywall and elevator electronic damages. TikTak forces all contractors to bid against the **identical technical scope, fault images/video, structural blueprints, and work criteria**.

3. **Preventing VAT & Hidden Fee Surprises**:
   Unscrupulous contractors frequently claim after project completion that their agreed quote was "before VAT" (לפני מע״מ) or excluded debris disposal (פינוי פסולת לאתר מורשה). The TikTak Contractor Portal forces bidders to explicitly define VAT inclusion, job duration, material specifications, and warranty guarantees. Once submitted, figures are digitally locked and immutable.

4. **Mitigating Secondary Damage Lag-Time**:
   Manual procurement cycles consume 4 to 6 weeks. A roof leak or expanding pipe fissure dripping for 30 days can ruin elevator motors, short circuit high-voltage switchboards, or cause toxic mold infestations. TikTak’s automated WhatsApp dispatches and 48-hour tender countdown compress the procurement cycle to **under 48 hours**, halting costly secondary damage.

5. **Legal Shield Against Resident Disputes & Embezzlement Accusations**:
   When committee volunteers award a large project, disgruntled residents frequently suspect kickbacks or favoritism, leading to withheld building dues (*מיסי ועד*) or civil litigation before the Supervisor of Condominiums (*המפקח על המקרקעין*). TikTak provides an unalterable, 7-year timestamped audit record proving due diligence, transparent comparison, and objective selection.

---

## 2. End-to-End System Architecture & Core Capabilities

The TikTak RFQ system operates across four deeply integrated pillars:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 TIKTAK RFQ ECOSYSTEM                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
          │                                                    │
          ▼                                                    ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ 1. COMMITTEE RFQ HUB             │        │ 2. CONTRACTOR BIDDING PORTAL             │
│ • Guided Scope Wizard            │        │ • Zero-Login Mobile Web Interface        │
│ • Fault Media & Blueprint Attach │───────>│ • Fault Evidence & Specs Viewer          │
│ • Multi-Vendor WhatsApp Dispatch │        │ • Structured Commercial Bid Submission   │
│ • Dynamic Quota & Overage Meter  │        │ • Instant WhatsApp Confirmation Loop     │
└──────────────────────────────────┘        └──────────────────────────────────────────┘
          │                                                    │
          ▼                                                    ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ 3. BID COMPARISON & CONTRACTS    │        │ 4. POST-PROJECT REVIEWS & AUDIT          │
│ • Live Apples-to-Apples Matrix   │        │ • 5-Star Multi-Dimensional Ratings       │
│ • Scope Amendment & Re-Bidding   │───────>│ • "Rehire" (נכונות להעסקה חוזרת) Metric │
│ • 1-Click Winner Selection       │        │ • 7-Year Statutory Audit Retention       │
│ • Automated Legal Contract Gen   │        │ • Vendor Whitelist Performance Tracking  │
└──────────────────────────────────┘        └──────────────────────────────────────────┘
```

---

### 2.1 The Committee Tender Hub (`/admin/:tenantId/quotes`)
* **Guided Creation Wizard (`NewRfqPage`)**:
  - **Category-Driven Scoping**: Pre-configured categories (Roof Waterproofing, Electrical & Generators, Plumbing & Booster Pumps, Elevators, Facade & Painting, Gardening, Intercom & Gates, Cleaning & Waste).
  - **Multimedia Fault Evidence**: Direct upload of high-resolution images, video walk-throughs, engineering inspection reports, and architectural blueprints.
  - **Structured Specification Fields**: Mandatory scope description, site access details, urgency window (24h, 48h, 72h, 7 days), and mandatory contractor insurance requirements.
* **Smart Vendor Whitelist Engine**:
  - Filter and select pre-approved contractors by profession, tags, and verified mobile numbers.
  - Instant dispatch via direct WhatsApp Business API with individualized, tamper-proof secure tender URLs (`/quote/:rfqId?vendorId=...`).
* **Real-Time Tender Status Tracking**:
  - Real-time badges: `Draft`, `Dispatched (נשלח)`, `Bids Received (התקבלו הצעות)`, `Scope Amended (עודכן מפרט)`, `Winner Selected (נבחר ספק)`, `Closed (נסגר)`.

---

### 2.2 The Zero-Friction Contractor Portal (`/quote/:rfqId`)
* **Zero-Login Architecture**: Contractors access their individualized tender directly via an encrypted URL without installing apps, creating passwords, or completing cumbersome onboarding.
* **Responsive Mobile-First Interface**:
  - Full inspection of fault media with full-screen zoom and download capabilities.
  - Clear technical specifications and site access guidelines.
* **Structured Commercial Bid Submission**:
  - **Total Quote Amount**: Net cost and explicit VAT toggle (`כולל מע״מ` / `לפני מע״מ`).
  - **Project Timeline**: Estimated execution time (days/weeks) and earliest availability date.
  - **Warranty Commitment**: Duration of warranty in months/years and explicit terms.
  - **Notes & Milestones**: Itemized payment stages, exclusions, and technical caveats.
* **Automated Bid Receipt**: Contractors receive immediate WhatsApp confirmations upon submission.

---

### 2.3 Comparative Tender Analysis & Bid Matrix
* **Side-by-Side Evaluation Grid**:
  - Ranks bids by total price, normalized VAT-inclusive calculations, execution duration, and warranty coverage.
  - Flags the lowest commercial offer, shortest timeline, and highest-rated contractor.
* **Contractor Quality Telemetry**:
  - Direct integration with historical performance ratings, verified past review counts, and the proprietary **Rehire Rate (מדד העסקה חוזרת)**.
* **Scope Amendment & Transparent Re-Bidding Engine**:
  - If on-site realities or committee requirements change after dispatch (e.g., expanding roof waterproofing from 200m² to 350m²), the committee can update the technical scope.
  - The system automatically marks existing bids as `Superseded (דורש עדכון עקב שינוי מפרט)`, dispatches an immediate WhatsApp notification to all participating bidders, and invites them to revise their quote against the new baseline.
  - Preserves an unalterable version history of every scope revision and corresponding bid adjustment.

---

### 2.4 Legally Binding Contractor Agreement & Digital Contracts
Once a winning contractor is selected:
* **Automated Legal Contract Generation**:
  - Synthesizes a standardized, legally binding Israeli maintenance contract incorporating statutory provisions from the Real Estate Law (1969) and the Ministry of Justice Standard Bylaws.
  - Integrates agreed commercial figures, scope description, liability allocation, workplace safety compliance, debris disposal covenants, and dispute resolution terms.
* **1-Click WhatsApp Delivery**: Dispatches the pre-filled contract directly to the winning contractor and committee treasurer for digital approval.

---

### 2.5 Post-Project Rating & Contractor Review Engine
* **Verified Review Verification**: Only committees who awarded and closed an active tender with a contractor can submit a review, preventing review manipulation.
* **Multi-Dimensional Evaluation**:
  - Overall 5-star quality rating.
  - Timeliness & Schedule Adherence (עמידה בלוחות זמנים).
  - Price Reliability & No Unexpected Surcharges (אמינות מחיר).
  - Site Cleanliness & Professional Conduct (ניקיון ויחסי אנוש).
* **The "Rehire" Metric (מדד העסקה חוזרת)**:
  - Binary, high-signal verification: *"Would you hire this contractor again for your building?" (כן / לא)*.
  - Displayed prominently in contractor whitelists and future tender matrices to empower other building administrators.

---

## 3. Commercial Model & The Annual RFQ Credit Bank

### 3.1 The Seasonality Challenge in Building Maintenance
Capital repairs and tenders do not follow a steady monthly curve. Building CapEx is heavily bimodal:
* **Peak 1 (Autumn: Oct–Nov)**: 45% of annual CapEx (roof waterproofing, solar panel clean, gutter clearing, storm branch pruning).
* **Peak 2 (Spring: Mar–May)**: 40% of annual CapEx (exterior painting, garden overhauls, intercom and access gates).
* **Trough Periods (Winter: Jan–Feb; Summer: Jul–Aug)**: 15% of annual CapEx (emergencies only).

A monthly recurring subscription for RFQs creates severe customer friction: committees object to paying in January when no tenders are issued. Furthermore, committees operate under **annual budgets voted and approved at their Annual General Meeting (אסיפת דיירים שנתית)**.

---

### 3.2 The Annual Credit Bank Solution (12-Month Add-On)
TikTak provisions RFQ licensing as an **Annual Pre-Paid Credit Bank (בנק בקשות הצעות מחיר שנתי)** valid for 12 continuous months:

| RFQ License Tier | Annual Allocation (Bank) | Annual Price | Effective Rate / RFQ | Overage Fee (Extra RFQ) | Target Community Size |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter** | 5 RFQs / year | ₪249 / year | ₪49.80 / RFQ | ₪49 / RFQ | Small building (up to 25 units) |
| **Basic** | 10 RFQs / year | ₪449 / year | ₪44.90 / RFQ | ₪45 / RFQ | Mid-size building (25–60 units) |
| **Standard** *(Popular)* | 15 RFQs / year | ₪599 / year | ₪39.93 / RFQ | ₪40 / RFQ | Residential complex / Tower (60–120 units) |
| **Growth** | 25 RFQs / year | ₪899 / year | ₪35.96 / RFQ | ₪36 / RFQ | Large tower (120–250 units) |
| **Enterprise / Custom** | Custom Allocation | Custom Quote | Volume-based | ₪35 / RFQ | Property management fleets |

---

### 3.3 Quota Enforcement Modes
* **Hard Cap Mode (חסימה קשיחה)**:
  - Once a building reaches 100% of its annual allocation, further dispatches are locked until an upgrade or bank renewal is executed.
* **Soft Cap Mode (חריגה מותרת)**:
  - If a building exhausts its credit bank, tenders can still be dispatched seamlessly, with the tier-specific overage rate billed automatically to avoid blocking urgent building repairs.

---

### 3.4 Mid-Term Upgrades vs. Full 1-Year Renewals (God's Eye Governance)

When a building exceeds or approaches its quota mid-cycle, the SuperAdmin dashboard (`/admin/god-view`) provides an unambiguous selection between two operational models:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       ANNUAL LICENSE UPDATE MODES IN GOD'S EYE VIEW                    │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│   OPTION 1: MID-TERM UPGRADE (Co-terminous)│   OPTION 2: FULL 1-YEAR RENEWAL (Restart)  │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Countdown continues to original date    │ • Countdown resets to 365 days from today  │
│ • Existing dispatched usage count kept    │ • Dispatched usage counter reset to 0      │
│ • Quota allowance expanded immediately    │ • Full annual term purchased upfront       │
│ • Preserves building's AGM fiscal calendar│ • Establishes new annual contract baseline │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

1. **Option 1: Mid-Term Upgrade (שדרוג למחזור הקיים)**:
   - Preserves the existing expiration date (`licenseExpiresAt`).
   - Retains current usage (e.g., `12/25` consumed).
   - Designed for committees that voted a calendar-year budget and need expanded capacity without shifting their renewal date.
2. **Option 2: Full 1-Year Renewal (חידוש מנוי שנתי מלא מהיום)**:
   - Resets the annual expiration date to **365 days from today** (`today + 1 year`).
   - Automatically **resets the dispatched usage counter to 0** (`currentAnnualUsage.dispatchedCount = 0`).
   - Clears cycle warning alerts for a fresh 12-month lifecycle.

---

### 3.5 Automated WhatsApp Quota & Expiration Alerts
* **Consumption Alerts (80% & 100%)**:
  - Automatically dispatched via WhatsApp to **all registered building administrators**.
  - Includes instant 1-click self-service upgrade links.
* **Annual Expiration Cron (Daily at 06:00 UTC)**:
  - Proactively scans all active tenant licenses and dispatches WhatsApp alerts at **30 days prior**, **7 days prior**, and on the **day of expiration**.

---

## 4. Vendor Management & CSV Integration Suite

The Admin Users portal includes a high-density, centralized **Vendors Management Suite** matching the ergonomics of the residents whitelist:

* **Bidirectional CSV Engine**:
  - **1-Click Export**: Full UTF-8 CSV download of all contractor records, categories, contact information, and rating summaries.
  - **Staged Preview Import**: Upload and parse contractor lists with full validation of mandatory fields (`Vendor Type`, `Full Name`, `Phone Number`, `Categories`).
* **Existing Vendor Detection & Rating Safety**:
  - During CSV import, the engine cross-references phone numbers against existing database entries.
  - Existing vendors are flagged in amber (`ספק קיים (עדכון) - דירוגים נשמרים ✓`).
  - **Guaranteed Rating Protection**: Updates apply exclusively to profile fields; all historical review documents, averages, and rehire metrics are **100% preserved**.
* **Strict Phone Number Uniqueness Enforcement**:
  - Real-time inline validation prevents duplicate contractor profiles with the same mobile number.
  - Submissions are locked if a phone number matches an existing registered contractor.
* **Tag Management & Category Merging**:
  - Ability to create, delete, and merge contractor tags (e.g., merging "איטום גגות" into "איטום").
  - Cascade updates automatically across all assigned contractor profiles in a single atomic Firestore batch.

---

## 5. Regulatory, Legal & Statutory Compliance (Israeli Law)

The TikTak RFQ system is engineered to satisfy the rigorous legal and regulatory requirements governing Israeli condominium management:

1. **Israeli Real Estate Law, 1969 (חוק המקרקעין, תשכ״ט-1969)**:
   - **Section 68**: Dictates the committee's mandatory duty to maintain common property in good working order.
   - **Section 69**: Confers legal representation authority on the committee (*נציגות הבית המשותף*) to enter contracts on behalf of all apartment owners.
   - TikTak's automated contracts and comparative tender matrix provide clear, demonstrable compliance with Section 68/69 fiduciary duties.
2. **Ministry of Justice Standard Bylaws (התקנון המצוי של משרד המשפטים)**:
   - **Section 16 (Financial Reporting)**: Mandates periodic presentation of income, expenses, and capital repair receipts to apartment owners. TikTak exports PDF and CSV audit summaries ready for immediate AGM tabling.
3. **7-Year Statutory Audit Retention**:
   - In accordance with Israeli statute of limitations and tax audit regulations, all RFQ tenders, contractor bids, scope amendments, and signed agreements are permanently archived with immutability guarantees for 7 years.
4. **Data Isolation & Multi-Tenancy Security**:
   - Under TikTak's strict architectural multi-tenancy rules, no contractor data, pricing intelligence, or building specifications can leak across tenant boundaries.

---

## 6. Enterprise Fleet Management for Property Management Companies

For property management firms (*חברות ניהול*) overseeing multi-building portfolios or municipal complexes:

* **Centralized Fleet Oversight (`/admin/fleet`)**:
  - Master administrators can monitor tender activity across all child buildings from a single high-density dashboard.
* **Unified Contractor Whitelist Pooling**:
  - Maintain a vetted pool of corporate contractors accessible across all portfolio properties.
  - Strict Fleet Governance: Master accounts maintain full administrative control, preventing unauthorized child alterations while providing unified contractor performance scorecards.
* **Cross-Building CapEx Telemetry**:
  - Identify pricing discrepancies across buildings (e.g., comparing elevator maintenance contracts between Building A and Building B).
  - Leverage collective bargaining power across the entire fleet to negotiate volume discounts with top-tier contractors.

---

## 7. Summary of Technical Specifications

| Component | Technical Implementation |
| :--- | :--- |
| **Frontend Framework** | React 18 / Next.js App Router with TypeScript & Tailwind CSS |
| **Design Language** | TikTak Native Design System (RTL Hebrew-first, 44px touch targets) |
| **Cloud Infrastructure** | Google Cloud Run (Node.js 22 serverless, scales to zero) |
| **Database** | Google Cloud Firestore (Native Mode, strict tenant isolation) |
| **Storage** | Google Cloud Storage (GCS) with signed URLs for fault media |
| **Automated Messaging** | Meta WhatsApp Business Cloud API & automated `wa.me` fallback bridges |
| **Cron Scheduling** | Cloud Scheduler running SLA, Quota Reset & Expiry crons |
| **Audit Logging** | 7-year TTL timestamped audit entries (`audit_logs` collection) |

---
*TikTak RFQ System — Eliminating friction, maximizing building budget efficiency, and establishing absolute fiduciary transparency.*
