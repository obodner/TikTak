# PRD: Tickets Quota & Usage-Tiered Pricing Engine (מנויי מכסות וחיוב לפי שימוש)

**Status**: Approved (Phase 1 Ready)  
**Version**: 1.3  
**Owner**: TikTak Product & Engineering Team  
**Date**: 2026-08-11  
**Source Document**: [TikTak_Tickets_Quota_Pricing_Strategy_Implementation_Guide.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_Tickets_Quota_Pricing_Strategy_Implementation_Guide.md)

---

## 1. Executive Summary & Problem Statement

Historically, TikTak was evaluated under a per-housing-unit pricing model. While simple to explain, per-unit pricing creates friction during sales conversations with local building committees (וועדים מקומיים) who fear paying high recurring fees during months with low resident engagement.

To eliminate buyer hesitation and align revenue directly with operational value, TikTak is pivoting to a **Ticket-Based Usage Tier Model** (predictable monthly quota + per-ticket overage fee). 

This strategy preserves gross margins (>85-90%) because cloud infrastructure costs per ticket are minimal (~$0.02–$0.04 / ₪0.08–₪0.15). By combining baseline subscription tiers with automated overage handling, non-billable deductions, and spam prevention, TikTak ensures a fair, value-driven pricing structure for property managers while preserving the zero-friction experience for residents.

---

## 2. Goals & Non-Goals

### Goals
1. **Multi-Tier Subscription Model**: Support 5 predefined pricing tiers (Micro, Basic, Standard, Growth, Enterprise) with tier-specific base quotas and overage rates. Existing pilot tenants default to Micro (15 tickets/mo).
2. **Real-Time Metering Engine**: Maintain an accurate, per-tenant Firestore counter tracking total created tickets, billable vs non-billable tickets, and remaining quota for the active billing cycle.
3. **Non-Billable Deductions**: Allow committee admins to flag tickets as `'Duplicate'` (כפילות), `'Out of Scope'` (מחוץ לאחריות), or `'Test'` (בדיקה), automatically crediting the ticket back to the monthly quota.
4. **Spam & Flood Auto-Merge**: Detect duplicate reports within 10 minutes matching Category AND Gemini AI Summary Similarity AND (Location OR Sublocation) — excluding image similarity — and merge them into a single billable ticket.
5. **Cushion & Rollover Logic**:
   - **FIFO Consumption**: Rollover tickets from Month A are consumed **first** in Month B before Month B's base quota is touched.
   - **Hard 20% Cap & Expiration**: Rollover can **never** exceed 20% of the base monthly subscription. Unused rollover tickets from Month A expire strictly at the end of Month B.
   - **Retroactive Buffer**: 5-ticket buffer. If usage stays within quota + 5 tickets, overage is ₪0. If usage exceeds quota + 5, overage fees kick in **retroactively** for all tickets above base quota.
6. **Proactive Upgrade Triggers**: Send automated WhatsApp/Email alerts to the committee treasurer when monthly usage reaches 80% and 100% of the quota.
7. **Admin Visibility (Zero Resident Friction)**: Render a live quota progress widget on the Web Admin Dashboard. Ensure residents see **zero** financial or billing information during report submission.
8. **Enterprise Fleet Overlook Dashboard**: Provide Enterprise Managers with a unified "Fleet Dashboard" showing aggregate master pool usage, per-building breakdown, fleet-wide urgent alerts, and one-click switching to child building triage boards.
9. **Phase 1 Manual Billing Cycle Summaries**: Phase 1 operates without automated payment clearing integration. The backend calculates monthly cycle overages and logs a structured billing summary document (`billing_cycles`) for manual invoicing.

### Non-Goals
- Automated payment gateway integration / credit card charging in Phase 1 (clearing service deferred to Phase 2).
- Resident-facing billing or payment collection (reporting remains 100% free and zero-login for residents).
- Real-time credit card processing on every single ticket creation.

---

## 3. Subscription Tier Matrix

| Tier License | Monthly Fee | Included Tickets | Effective Rate / Ticket | Overage Fee (Extra Ticket) | Target Community Size | Max Rollover Cap (20%) |
|---|---|---|---|---|---|---|
| **Micro / Starter** | ₪99 / mo | 15 tickets | ₪6.60 | ₪12.00 / ticket | Quiet / Small (<50 units) | 3 tickets |
| **Basic** | ₪199 / mo | 35 tickets | ₪5.68 | ₪10.00 / ticket | Small (~100–150 units) | 7 tickets |
| **Standard** | ₪399 / mo | 80 tickets | ₪4.98 | ₪8.00 / ticket | Mid-size (~200–300 units) | 16 tickets |
| **Growth** | ₪699 / mo | 160 tickets | ₪4.36 | ₪7.00 / ticket | Large (~400–600 units) | 32 tickets |
| **Enterprise** | ₪1,199 / mo | 300 tickets | ₪3.99 | ₪5.50 / ticket | Towns / Multi-complexes | 60 tickets |

> **Note on Existing Tenants**: All active pilot buildings (including Rehan) are initialized on the **Micro / Starter** tier (15 tickets / month).

---

## 4. Feature Specifications & Business Logic

### 4.1 Non-Billable Ticket Deductions & Safeguards
Committee members must feel confident that resident misuse or accidental duplicate reporting won't cause unexpected charges.
- **Refund Triggers**: When a ticket status or exclusion reason is set to:
  - `duplicate` (כפילות)
  - `out_of_scope` (מחוץ לאחריות)
  - `test_report` (בדיקה)
- **Metering Impact**: Decrement the billable ticket count for the active cycle immediately upon status update.
- **Audit Logging**: Every deduction requires tracking the admin UID, reason, and timestamp in `audit_logs`.

### 4.2 Automated Spam & Flood Protection
- **Auto-Merge Rule**: If 5 or more tickets are submitted within a 10-minute window for the same `buildingId` matching ALL of the following:
  1. Same **Category** (e.g., "חשמל").
  2. High **Summary Similarity** evaluated by Gemini 2.5 Flash against recent open ticket summaries.
  3. Matching **Location OR Sublocation** (e.g. "קומה 3" or "לובי").
  4. *(Note: Image visual similarity is explicitly excluded to minimize latency).*
- **Action**:
  - Cloud Function merges subsequent duplicate submissions into the primary ticket thread as additional notes/attachments.
  - Only **1 ticket** is counted towards the monthly quota.
  - An admin notification is logged: *"5 דיווחים אוחדו לפנייה אחת (מניעת הצפה)"*.

### 4.3 Rollover Cushion & Buffer Policy (Consumption & Expiration Rules)
- **Consumption Order (FIFO)**: When tickets are created in Month B, they consume **Rollover Tickets (from Month A)** first before consuming Month B's base quota.
- **Hard 20% Rollover Cap**:
  $$\text{Rollover Allowance Month B} = \min(0.20 \times \text{Base Quota}, \text{Unused Base Tickets Month A})$$
  - Rollover tickets can **never** exceed 20% of the base monthly subscription (e.g. max 7 tickets on Basic tier).
  - Because rollover tickets are consumed first, any unused allowance at the end of Month B consists of Month B's base quota. Unused Month A rollover credits expire completely at the end of Month B (non-accumulating).
- **Retroactive Buffer Billing**:
  - A 5-ticket buffer is provided beyond quota (e.g., 35 + 5 = 40 max buffer threshold for Basic tier).
  - **Grace Zone**: If total billable tickets for the month are between 36 and 40 (within 5 buffer tickets), overage charged is **₪0**.
  - **Retroactive Over-Threshold Penalty**: As soon as ticket 41 is created (exceeding base quota + 5 buffer), the buffer grace is removed, and overage charges apply **retroactively to all 6 extra tickets** (tickets 36 through 41 at ₪10/ticket = ₪60 overage).

### 4.4 Proactive Quota Alerts
- **Threshold 1 (80% Usage)**: Trigger WhatsApp & Email alert to `committee_treasurer`:
  > *"הגעתם ל-80% ממכסת הפניות החודשית (28/35). שדרגו עכשיו למסלול Standard ב-₪399 וחסכו עד 35% בעלויות חריגה."*
- **Threshold 2 (100% Usage)**: Trigger WhatsApp & Email alert:
  > *"הגעתם ל-100% ממכסת הפניות החודשית (35/35). 5 הפניות הבאות מוגנות בחוצץ ללא חיוב. לשדרוג מהיר לחצו כאן."*

### 4.5 Mid-Month Tier Upgrades & Downgrades
- **Mid-Month Upgrade**:
  - **Immediate Effect**: Takes effect immediately upon request.
  - **Quota Increase**: The difference in base quota is added immediately to the remaining allowance for the current cycle ($\Delta \text{Quota} = \text{New Quota} - \text{Old Quota}$).
  - **Pro-Rated Base Fee**: For Phase 1 invoicing, the monthly base fee is pro-rated based on days remaining in the billing cycle.
- **Mid-Month Downgrade**:
  - **End-of-Cycle Effect**: Downgrades are scheduled to take effect **at the end of the active billing cycle** (`cycleEndDate`).

### 4.6 Enterprise Fleet Overlook & Multi-Tenant Quota Pooling
For management companies, municipal regional councils, or developers operating multiple buildings:
- **Parent Enterprise Tenant (`tenants/{parentTenantId}`)**:
  - Stores `isPoolMaster: true`, `masterPoolQuota: 300` (or custom), and an indexed array `childTenantIds: ['building_a', 'building_b', ...]`.
- **Child Tenant (`tenants/{childBuildingId}`)**:
  - Stores `parentEnterpriseId: 'parentTenantId'`, `isPoolMaster: false`, `usesParentPool: true`.
- **Enterprise Fleet Overlook Dashboard (`/admin/fleet`)**:
  - **Master Quota Pool Gauge**: Live indicator showing total tickets used across all child buildings vs master pool allowance (e.g., `210 / 300 tickets - 70%`).
  - **Child Building Table**: Shows each child building's ticket volume contribution, active ticket breakdown (Open, In-Progress, Closed), and SLA health metrics.
  - **1-Click Triage Context Switch**: Enterprise Admins can click any building row to jump directly into that child building's active triage board.
  - **Fleet-Wide Urgent Alerts Banner**: Displays urgent safety/maintenance issues (e.g. elevator breakdown, flooding) across all managed buildings in one consolidated view.
  - **Cost Allocation Breakdown**: Enables property management companies to view ticket usage percentages per building for easy internal cost allocation.

---

## 5. User Stories & Acceptance Criteria

### Admin & Financial Persona User Stories

| ID | Persona | Story | Acceptance Criteria |
|---|---|---|---|
| **US-1** | Building Committee Admin | View live quota progress | Top bar on Admin Dashboard shows progress bar with `Used / Included`, percentage, rollover balance, and active tier name in Hebrew RTL. |
| **US-2** | Building Committee Admin | Flag non-billable ticket | Admin can mark ticket as Duplicate/Out of Scope/Test. Quota counter updates immediately and non-billable flag is shown on card. |
| **US-3** | Building Committee Admin | Receive 80% & 100% quota alerts | Automated WhatsApp/Email message sent with high-converting upgrade link when building hits 80% and 100% of cycle quota. |
| **US-4** | System Auditor / QA | Multi-tenant quota isolation | Quota metering queries strictly enforce `buildingId`. Building A can never access or read Building B's subscription or ticket usage metrics. |
| **US-5** | System Admin (Phase 1) | Calculate monthly invoice overage | At cycle reset date, Cloud Function computes overage units (applying retroactive buffer rules), writes `billing_cycles` document for manual invoicing, and resets counter. |
| **US-6** | Resident | Submit issue without quota friction | Resident reports issue via QR code. Flow remains 100% free of billing UI, quota warnings, or login prompts. |
| **US-7** | Enterprise Manager | Fleet Overlook Dashboard | Enterprise Admin can view aggregate master quota usage, per-building ticket breakdown table, fleet-wide urgent alerts, and jump into any child building's triage board. |

---

## 6. Security, Multi-Tenancy & Audit Logging

### 6.1 Data Isolation & Fleet Authorization Rules
- **Regular Committee Admins**: Security rules enforce `request.auth.token.buildingId == buildingId`. Committee members from Building A can **never** see or access Building B.
- **Enterprise Fleet Admins**: Security rules grant Enterprise Admins read access to all child building documents linked in `childTenantIds` where `request.auth.token.enterpriseId == parentEnterpriseId`.

### 6.2 Audit Log Events (`audit_logs`)
1. `QUOTA_NON_BILLABLE_FLAGGED`: Logged when ticket is marked non-billable.
2. `QUOTA_ALERT_DISPATCHED`: Logged when 80%/100% alerts are sent to committee treasurer.
3. `QUOTA_TIER_CHANGED`: Logged when building upgrades/downgrades subscription tier.
4. `BILLING_CYCLE_CLOSED`: Logged when monthly overage calculation runs at end of cycle.
5. `FLEET_TENANT_LINKED`: Logged when a new child building is added to an Enterprise fleet pool.
