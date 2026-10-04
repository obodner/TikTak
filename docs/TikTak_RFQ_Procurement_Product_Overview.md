# **TikTak RFQ Procurement Module: Product Overview & Regulatory Specification**
## **מערכת מכרזי מחיר ורכש קבלנים (RFQ) – סקירת מוצר, מודל רישוי, רגולציה וחוזים**

**Document Status**: Approved Product Specification (v1.0)  
**Date**: September 2026  
**Audience**: Product Management, Engineering, Legal & Senior QA  
**Core Module**: TikTak RFQ Hub (`/admin/:tenantId/quotes`), Contractor Portal (`/quote/:rfqId`) & Contract Engine  

---

## 1. Executive Summary & Strategic Business Value

### 1.1 From "Incident Reporting Hotline" to "Procurement & Financial Governance"
Historically, TikTak positioned itself as a rapid, zero-friction incident reporting tool ("Snap & Send" for Israeli residents). While this solved the day-to-day noise of building committees, it operated as a **cost center** for routine issues (e.g., burnt lightbulb, dirty lobby – typical fix: ₪100–₪300).

The **RFQ (Request for Quotation / מכרזי מחיר לקבלנים)** module fundamentally transforms TikTak into an indispensable **financial governance and budget-saving platform** for building committees (ועדי בתים), neighborhood associations, and property management companies (חברות ניהול).

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             TIKTAK VALUE EVOLUTION                               │
├─────────────────────────────────────────┬────────────────────────────────────────┤
│           TIKTAK CORE (Tickets)         │          TIKTAK PROCUREMENT (RFQ)      │
├─────────────────────────────────────────┼────────────────────────────────────────┤
│ • Routine incident logging & tracking   │ • Capital projects (₪5,000 – ₪50,000+) │
│ • Reactive resident communication       │ • Multi-contractor price tenders       │
│ • Low ticket value (₪100 – ₪300)        │ • Apples-to-apples bid comparison      │
│ • Daily operational convenience         │ • Direct savings: ₪1,500 – ₪10,000/job │
│ • Positioning: "Digital Notice Board"   │ • Positioning: "Fiduciary Legal Vault" │
└─────────────────────────────────────────┴────────────────────────────────────────┘
```

### 1.2 How Does the Customer Save Money with the RFQ Module?
Building committees are standardly required by good governance to collect 3 price quotes before awarding major work. However, in the manual process (calls, WhatsApp messages, voice notes), committees suffer massive financial leakages:

1. **Competitive Tender Effect ("שיטת מצליח")**:
   When an Israeli contractor receives a personal phone call from an amateur committee member, they typically quote high. When they click a TikTak link stating:
   *`פנייה רשמית להצעת מחיר | מועד אחרון: 48 שעות | הפנייה נשלחה במקביל ל-3 ספקים מורשים`*
   The contractor immediately realizes this is a competitive digital tender with a strict deadline. They submit their sharpest, most competitive rate upfront, shaving 10%–20% off the job cost immediately (saving ₪1,500–₪3,000 on a ₪15,000 repair).

2. **Eliminating the "Apples-to-Oranges" Trap**:
   In manual quotes, Contractor A quotes ₪8,000 with acrylic sealant, while Contractor B quotes ₪11,000 with 4mm elastomeric bitumen. The committee mistakenly hires Contractor A, only to suffer water leaks in winter resulting in ₪25,000 of apartment damage. TikTak forces all contractors to bid on the **identical technical scope, fault media, blueprints, and measurements**.

3. **Preventing VAT & Hidden Fee Surprises**:
   Contractors often claim post-facto that an ₪8,000 quote was "before VAT" or excluded debris removal. TikTak's portal requires contractors to explicitly commit to `כולל מע״מ / לפני מע״מ`, job duration, and warranty terms. The price is digitally locked.

4. **Mitigating Lag-Time Damage**:
   Manual quote gathering takes 3 to 6 weeks. A roof leak or pipe crack dripping for 4 weeks can corrode elevator electronics or structural concrete. TikTak's 48-hour automated portal compresses turnaround to 2 days, halting secondary damages.

5. **Legal & Transparency Shield Against Resident Disputes**:
   When a committee awards a contract, disgruntled residents often suspect favoritism or kickbacks and withhold committee fees (מיסי ועד). TikTak produces a one-click transparent comparison and audit trail, neutralizing disputes and legal exposure.

---

## 2. Licensing & Commercial Model: The Annual RFQ Credit Bank

### 2.1 The Seasonality Problem in Building Maintenance
Unlike routine incident tickets (which occur steadily every month), capital repairs and renovations are **strictly seasonal and event-driven**:
* **Autumn (Oct–Nov)**: Peak season for roof waterproofing (איטום), tree pruning (גיזום), and gutter clearing.
* **Winter (Jan–Feb)**: Quiet months; virtually zero planned tenders.
* **Spring (Mar–May)**: Exterior painting, garden landscaping, intercom and gate overhauls.

A monthly recurring subscription for RFQs creates sales friction: committees complain that in quiet months they "paid for nothing."

### 2.2 The Annual Credit Bank Solution (Annual Add-On License)
Committees operate on **annual budgets approved at their Annual General Meeting (אסיפת דיירים שנתית)**. TikTak therefore offers RFQ licenses as an **Annual Pre-Paid Credit Bank** (valid for 12 months) as an add-on to the base monthly/annual Core ticket subscription.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                ANNUAL RFQ LICENSE TIERS (B2B ADD-ON)                                   │
├──────────────────────────┬──────────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│ Tier License             │ Annual Allocation│ Annual Price │ Rate per RFQ │ Overage Fee  │ Target Size │
├──────────────────────────┼──────────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ **RFQ Starter**          │ 5 RFQs / year    │ ₪249 / year  │ ₪49.80 / RFQ │ ₪49 / extra  │ Small bldg  │
│ **RFQ Basic**            │ 10 RFQs / year   │ ₪449 / year  │ ₪44.90 / RFQ │ ₪45 / extra  │ Mid (25-60) │
│ **RFQ Standard** (Pop.)  │ 15 RFQs / year   │ ₪599 / year  │ ₪39.93 / RFQ │ ₪40 / extra  │ Complex/Twr │
│ **RFQ Growth**           │ 25 RFQs / year   │ ₪899 / year  │ ₪35.96 / RFQ │ ₪36 / extra  │ 120-250 apts│
│ **RFQ Custom / Ent.**    │ Custom (N RFQs)  │ Custom Quote │ Volume-based │ Negotiated   │ Fleet / Munc│
└──────────────────────────┴──────────────────┴──────────────┴──────────────┴──────────────┴─────────────┘
```

---

### 2.3 Mathematical Pricing Model, Unit Economics & ROI Rationale

The pricing structure is built upon four foundational pillars: **Value-Based Customer ROI**, **Marginal Cloud Unit Economics**, **Volume Elasticity Incentive Curves**, and **Bimodal Seasonal Risk Mitigation**.

#### 2.3.1 Pillar 1: Customer Value & ROI Math (The Committee Perspective)
Building committees operate under strict fiduciary constraints. The financial decision to purchase a TikTak RFQ license is evaluated against direct cash savings on building repair budgets:

$$\text{Net Annual Savings (₪)} = \sum_{i=1}^{K} \left( \text{Quote}_{\text{amateur}, i} - \text{Quote}_{\text{competitive}, i} \right) - \text{Annual License Fee}$$

$$\text{Customer ROI} = \frac{\text{Net Annual Savings}}{\text{Annual License Fee}} \times 100\%$$

Empirical benchmarks from Israeli property maintenance tenders establish the following cost dynamics:

| Capital Project Type | Typical Single-Quote Rate (Manual Call) | Competitive Multi-Bid Rate (TikTak RFQ) | Average Savings per Project | % Savings |
| :--- | :--- | :--- | :--- | :--- |
| **Roof Waterproofing (איטום גג)** | ₪18,000 | ₪15,200 | **₪2,800** | 15.6% |
| **Water Booster Pump Overhaul (משאבות לחץ)** | ₪9,500 | ₪8,100 | **₪1,400** | 14.7% |
| **Intercom & Access Gate (אינטרקום ושער)** | ₪6,800 | ₪5,600 | **₪1,200** | 17.6% |
| **Seasonal Tree Pruning (גיזום עצים עונתי)** | ₪4,500 | ₪3,750 | **₪750** | 16.7% |
| **Lobby & Stairwell Painting (צביעת לובי)** | ₪11,000 | ₪9,300 | **₪1,700** | 15.5% |

**Concrete Financial Return by Tier**:
* **Starter Tier (5 RFQs @ ₪249/yr)**:
  * Even if a small building executes only **2 moderate projects** (e.g., Gate overhaul + Tree pruning: total manual spend ₪11,300):
  * Gross savings achieved = ₪1,950.
  * Net cash saved in committee account: $₪1,950 - ₪249 = \mathbf{₪1,701}$.
  * **Customer ROI = 683%** (The license pays for itself on the first job).
* **Standard Tier (15 RFQs @ ₪599/yr)**:
  * An active 70-unit residential tower executing 8–10 tenders per year saves an estimated **₪12,500 – ₪18,000** annually.
  * Net cash saved: $₪14,500 - ₪599 = \mathbf{₪13,901}$.
  * **Customer ROI = 2,320%**.
* **Micro-Cost per Resident**:
  * In a standard 24-unit building, the ₪249 annual license represents **₪10.38 per apartment per year** (or **₪0.86 per month**).
  * In a 72-unit complex, the ₪599 annual license represents **₪8.32 per apartment per year** (or **₪0.69 per month**).
  * This micro-cost falls well within the committee chairman's discretionary petty cash limit, requiring zero special resident votes.

---

#### 2.3.2 Pillar 2: Marginal Cost (COGS) & Unit Economics (The TikTak Perspective)
TikTak's serverless infrastructure is designed to maintain high passive gross margins and zero idle cost. The direct variable cost to execute a single RFQ workflow is calculated as follows:

1. **Meta WhatsApp Cloud API (Outbound Broadcast & Alerts)**:
   * Meta charge per business-initiated utility template message to an Israeli phone (`+972`): ~$0.08 (~₪0.30).
   * Average broadcast to 4 contractors: $4 \times ₪0.30 = ₪1.20$.
   * Instant submission alerts and award notification: 2 messages $\times ₪0.30 = ₪0.60$.
   * Subtotal WhatsApp: **₪1.80 per RFQ**.
2. **Google Cloud Platform (Serverless Compute, Database & Retention)**:
   * **Firestore**: ~18 document reads/writes per RFQ workflow (RFQ creation, token lookup, vendor portal submissions, decision log) $\approx \$0.0003$.
   * **Cloud Storage (7-Year Legal Vault Compliance)**:
     * Average uploaded fault photos + generated contract PDF: ~2.5 MB.
     * Google Cloud Storage Coldline / Archive rate: $\$0.004 / \text{GB} / \text{month}$.
     * 7-year cumulative storage cost: $\frac{2.5}{1024} \times \$0.004 \times 84 \text{ months} \approx \$0.0008$ (~₪0.003).
   * **Cloud Run / Functions**: ~1.2 seconds execution time for webhook and contract compilation $\approx \$0.0001$.
   * Subtotal GCP Infrastructure: **~₪0.04 per RFQ**.
3. **Total Direct Variable COGS per RFQ**: **₪1.84**.

**Gross Profit Margin Matrix**:

$$\text{Gross Margin \%} = \frac{\text{Effective Rate per RFQ} - \text{COGS (₪1.84)}}{\text{Effective Rate per RFQ}} \times 100\%$$

| Tier | Allocation | Price / RFQ | Direct COGS | Gross Profit / RFQ | Gross Margin % |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RFQ Starter** | 5 RFQs | ₪49.80 | ₪1.84 | ₪47.96 | **96.3%** |
| **RFQ Basic** | 10 RFQs | ₪44.90 | ₪1.84 | ₪43.06 | **95.9%** |
| **RFQ Standard** | 15 RFQs | ₪39.93 | ₪1.84 | ₪38.09 | **95.4%** |
| **RFQ Growth** | 25 RFQs | ₪35.96 | ₪1.84 | ₪34.12 | **94.9%** |
| **Overage Floor** | 1 Extra RFQ | ₪36.00 | ₪1.84 | ₪34.16 | **94.9%** |

The product achieves a **95%+ gross margin floor** across every tier, perfectly aligned with the "scale-to-zero" architecture.

---

#### 2.3.3 Pillar 3: Volume Elasticity & Upsell Incentives (The Stepped Discount Curve)
The tier pricing steps down predictably to encourage upgrading to the most operational tier:

* **Starter (5 RFQs @ ₪49.80)** $\rightarrow$ Baseline entry point.
* **Basic (10 RFQs @ ₪44.90)** $\rightarrow$ **10% discount** per unit.
* **Standard (15 RFQs @ ₪39.93)** $\rightarrow$ **20% discount** per unit.
* **Growth (25 RFQs @ ₪35.96)** $\rightarrow$ **28% discount** per unit.

**The "Incremental Delta" Upsell Trigger**:
* Upgrading from **Basic (10 RFQs @ ₪449)** to **Standard (15 RFQs @ ₪599)** costs only **₪150 more per year**.
* For that ₪150 delta, the committee receives **5 additional RFQs** (an effective marginal rate of only **₪30.00 / RFQ**).
* This mathematical dynamic makes **RFQ Standard (15 RFQs)** the natural anchor tier for mid-size buildings and towers.

---

#### 2.3.4 Pillar 4: Bimodal Seasonal Distribution vs. Monthly Churn Math
Capital expenditures in Israeli buildings follow a strictly bimodal distribution:
* **Peak 1 (Autumn: Sep–Nov)**: 45% of annual capex (roof waterproofing, solar panel wash, gutter clearing, branch pruning before winter storms).
* **Peak 2 (Spring: Mar–May)**: 40% of annual capex (lobby touch-ups, exterior facade painting, garden landscaping, intercom and gate overhauls).
* **Trough Periods (Winter: Jan–Feb; Summer: Jul–Aug)**: 15% of annual capex (emergencies only).

**Why Monthly Quotas Fail Mathematically**:
If priced monthly (e.g., ₪40/month for 1 RFQ/month):
1. In January and February, usage drops to 0. Committees perceive they are "paying for nothing" and cancel their subscription, leading to a calculated **annual churn risk of >40%**.
2. When October arrives, the building needs 3 tenders simultaneously (Roof, Trees, Gutters), but is throttled by their 1 RFQ/month limit.
3. The **Annual Pre-Paid Credit Bank (5 / 10 / 15 / 25)** collects 100% of revenue upfront, matches the committee's annual budget vote, and gives the building complete freedom to consume their credits when needed.

---

### 2.4 Top-Up Packs, Rollover & Multi-Tenant Pooling Rules
1. **On-Demand Top-Up Packs**:
   If a building exhausts its credit bank during an intensive project year:
   * **Single RFQ Top-Up**: ₪49 (or tier overage rate).
   * **3-Pack Top-Up**: ₪129 (effective rate: ₪43.00 / RFQ).
   * **5-Pack Top-Up**: ₪199 (effective rate: ₪39.80 / RFQ).
2. **Annual Renewal Rollover**:
   To drive annual contract renewals, any unconsumed RFQ credits roll over into Year 2 upon renewing the annual subscription.
3. **Master Complex Credit Pooling**:
   In multi-entrance residential complexes (e.g., *מתחם שרונה*) or municipal communities (*ישוב קהילתי ריחן*), RFQ credits can be pooled at the Master Tenant level and consumed dynamically across sister buildings.

---

## 3. Legal & Regulatory Compliance Framework (Israeli Law)

### 3.1 Land Law & Standard Bylaws (חוק המקרקעין והתקנון המצוי)
* Under Section 16 of the Standard Condominium Bylaws (*התקנון המצוי של הבית המשותף*):
  The committee is legally obligated to maintain an orderly accounting register, expense receipts, contracts, and tenders, and must allow any apartment owner to review these documents upon reasonable request.
* Destroying or failing to document contractor bids and reasons for selection exposes committee members to claims of breach of fiduciary duty (*הפרת חובת נאמנות*) before the Land Inspector (*המפקח על המקרקעין*).

### 3.2 Statute of Limitations (חוק ההתיישנות, תשי"ח-1958)
* Under Israeli civil law, the standard limitation period for breach of contract, contractor negligence, defective workmanship, or committee disputes is **7 years (שבע שנים)** from the date of the occurrence.
* If defective waterproofing causes structural corrosion in Year 5, the original tender documents, contractor promises, and warranty terms are required in court.

### 3.3 Statutory Retention Policy: 7 to 10 Years
Because Cloud Storage costs in GCP are negligible (~$0.002/GB/month for Coldline, costing less than ₪0.10/year for an entire building's documents), TikTak implements a **7-year minimum retention guarantee**:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           7-YEAR RETENTION LIFECYCLE                             │
├────────────────────┬─────────────────────┬───────────────────────────────────────┤
│ Period             │ Storage Tier        │ User Experience & Availability        │
├────────────────────┼─────────────────────┼───────────────────────────────────────┤
│ **Years 1 – 2**    │ Standard Cloud      │ Instant 1-click preview, download,    │
│                    │ Storage             │ and sharing in Active Quotes & Admin  │
├────────────────────┼─────────────────────┼───────────────────────────────────────┤
│ **Years 3 – 7**    │ Nearline / Coldline │ Searchable in Audit Explorer; fast    │
│                    │ Archive             │ retrieval for legal inspections       │
├────────────────────┼─────────────────────┼───────────────────────────────────────┤
│ **After Year 7**   │ Purge Warning &     │ Proactive prompt: "Download complete  │
│                    │ Full ZIP Export     │ 7-year PDF/ZIP archive before purge"  │
└────────────────────┴─────────────────────┴───────────────────────────────────────┘
```

---

## 4. Key Functional Features

### 4.1 Award Decision Reasoning (נימוק הבחירה בקבלן)
When an admin awards an RFQ to a winning bidder:
* If the admin selects the **lowest price bid**, the system auto-selects:
  `💰 ההצעה הזולה ביותר (Lowest Price)`
* If the admin selects a **higher-priced bid**, good governance requires documenting the reason to prevent accusations of favoritism. The admin selects from quick 1-click chips:
  * 🛡️ `תקופת אחריות ארוכה יותר / תנאים עדיפים` (Longer Warranty / Better Terms)
  * ⚡ `זמינות מיידית / ביצוע מהיר` (Immediate Availability)
  * ⭐ `ניסיון חיובי קודם ושביעות רצון` (Proven Track Record)
  * 🛠️ `מפרט ואיכות חומרים עדיפה` (Superior Materials/Specification)
  * ✍️ `אחר...` (Custom free text explanation)
* The selected reason is stamped into the **Audit Log (`RFQ_AWARDED`)** and displayed on the final summary card and contract.

### 4.2 Automated Contract & Work Order Generator (הסכם התקשרות והזמנת עבודה)
Once a quote is awarded, the admin clicks **"📄 הפק הסכם עבודה מחייב" (Generate Work Order / Agreement)**:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TikTak | הסכם התקשרות והזמנת עבודה מחייבת                          [ 🖨️ הדפסה ]│
├───────────────────────────────────────────────────────────────────────────────┤
│ לכבוד: [ שם הקבלן / חברה ] (ח.פ / ת.ז: [ מספר ח.פ ])                          │
│ מאת:   נציגות הבית המשותף [ שם הבניין והכתובת ] (איש קשר: [ שם + טלפון ])       │
│ תאריך: 26/09/2026 | סימוכין מכרז: #RFQ-108 (קריאה #104)                       │
├───────────────────────────────────────────────────────────────────────────────┤
│ 1. מהות העבודה והמפרט:                                                        │
│    [ פירוט מלא של התקלה והמפרט הטכני, לרבות מיקום בבניין וקבצים מצורפים ]     │
│                                                                               │
│ 2. לוחות זמנים:                                                               │
│    משך ביצוע מוסכם: [ יום עבודה מלא 🛠️ ]. מועד תחילת ביצוע: תוך 3 ימי עסקים.  │
│                                                                               │
│ 3. התמורה הכספית ותנאי תשלום:                                                 │
│    סה״כ לתשלום: 1,416 ₪ (1,200 ₪ + מע״מ).                                      │
│    התשלום יבוצע בגמר העבודה ולשביעות רצון מלאה של הוועד.                      │
│                                                                               │
│ 4. אחריות, בטיחות ונקיון:                                                     │
│    • הקבלן מתחייב לאחריות בת [ שנתיים ] מיום סיום העבודה.                      │
│    • הקבלן אחראי לכל נזק שייגרם לרכוש המשותף ולפינוי פסולת מלא בסיום העבודה. │
│    • נימוק אישור הוועד: [ מפרט ואיכות חומרים עדיפה 🛠️ ].                        │
├───────────────────────────────────────────────────────────────────────────────┤
│ חתימת נציגות הבניין: _____________       חתימת הקבלן המבצע: _____________     │
│ [ ⬇️ הורד כ-PDF ]   [ 📲 שלח לקבלן לחתימה ב-WhatsApp ]   [ ❌ סגור תצוגה מקדימה ]│
└───────────────────────────────────────────────────────────────────────────────┘
```

#### Capabilities:
1. **Interactive Modal Preview**: Displays the rendered legal agreement directly in the browser.
2. **1-Click Print & PDF (`@media print`)**: Clean, border-free legal printout matching Israeli commercial standards.
3. **WhatsApp Dispatch Link**: Pre-fills a WhatsApp message to the contractor with the agreed terms and digital link to review the work order.

---

## 5. Architectural Phasing & Implementation Roadmap

> **Architectural Guidance on Documentation**:  
> High-level business specifications, legal frameworks, and product overviews reside in this master document (**Product Overview**).  
> Tactical technical implementations (code changes, React components, Firestore security rules, subagent prompts) are tracked and executed across the 5 structured phases below.

### 5.1 Phasing Matrix (Phases 1 to 5)

| Phase | Module / Target | Scope & Components | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Vendor Directory | Multi-category tagging (`categories: string[]`), contractor classification (`retainer` vs. `occasional`), inline category creation. | **COMPLETED & DEPLOYED** |
| **Phase 2** | New RFQ Dispatch Wizard | Sidebar route `/quotes/new`, ticket pull by `#id`, contractor cherry-picking, multi-file uploads (5MB max), token generation, WhatsApp broadcast. | **COMPLETED & DEPLOYED** |
| **Phase 3** | Contractor Mobile Portal | Public route `/quote/:rfqId`, phone whitelist verification (403 protection), price entry, VAT toggle, duration presets, document upload, audit log. | **COMPLETED & DEPLOYED** |
| **Phase 4** | RFQ Comparison Hub | Active tracking `/quotes/active`, inline accordion matrix, full-screen comparison view, editable award message, non-winning closure, Help Modal guide. | **COMPLETED & DEPLOYED** |
| **Phase 5** | **Contracts & Governance** | **1. Award Decision Reasoning chips in award modal.**<br>**2. Automated Work Order / Contract Generator component with print preview.**<br>**3. 7-Year retention compliance & print optimization.** | **READY FOR IMPLEMENTATION** |

---

## 6. Phase 5 Implementation Specification

### 6.1 Feature 5.1: Award Decision Reasoning
* **Target File**: `frontend/src/pages/admin/ActiveQuotesPage.tsx`
* **Data Model Update**: Update `WorkQuoteRequest` document in Firestore with:
  `awardReasoning: { reasonType: string; note?: string; awardedAt: string; awardedBy: string }`
* **UI**: In `AwardModal`, render selectable chips. If the selected bid is not the minimum price, highlight a notice encouraging documentation.
* **Audit Trail**: Include `reasonType` and `note` in `RFQ_AWARDED` audit log entry.

### 6.2 Feature 5.2: Work Order / Contract Generator
* **Component**: `frontend/src/components/admin/WorkOrderContractModal.tsx`
* **Trigger**: In `ActiveQuotesPage.tsx`, on any awarded RFQ card, display a prominent button:
  `📄 הסכם עבודה (חוזה)`
* **Content Engine**:
  * Auto-resolves customer type: `ועד הבית` / `נציגות היישוב` / `הנהלת הבניין` using `tenantInfo.type`.
  * Pulls contractor legal name, phone, and vendor ID from `vendors/{vendorId}`.
  * Formats scope, location, line-breaks in description, agreed price (base + VAT breakdown), duration, warranty terms, and admin signature block.
* **Actions**:
  * `🖨️ הדפסה / שמירה כ-PDF` (triggers native `window.print()` with styled `@media print` layout).
  * `📲 שלח הסכם לקבלן בוואטסאפ` (generates `wa.me` message with summary and contract reference).

### 6.3 Feature 5.3: Legal Disclaimer & 7-Year Retention Notice
* Display a standard legal notice on the printed agreement:
  *"מסמך זה מופק אוטומטית באמצעות מערכת TikTak ומהווה הזמנת עבודה מחייבת בהתאם לחוק החוזים. תיעוד המכרז שמור ומאובטח למשך 7 שנים בהתאם לחוק ההתיישנות והוראות ניהול פנקסים."*
