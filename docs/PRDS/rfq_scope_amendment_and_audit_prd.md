# Product Requirements Document (PRD)
# RFQ Scope Amendment, Anti-Abuse Category Lock & Contractor Addendum Dispatch

**Document ID**: `PRD-RFQ-SCOPE-AMEND-2026`  
**Version**: `1.0.0`  
**Status**: `Approved for Implementation`  
**Author**: Antigravity Product Management & Architecture  
**Stakeholder**: Oren Bodner (Lead Architect & QA Lead)  
**Date**: October 4, 2026  
**Target Delivery**: Sprint 11  

---

## 1. Executive Summary & Problem Statement

### 1.1 The Business Need
In real-world building management, committees frequently issue a Request for Quotation (RFQ) to contractors and subsequently realize that additional related tasks are necessary before awarding the job (e.g., adding door closer replacement while repairing an intercom panel, or adjusting allowed working hours due to building quiet hours).

Currently, once an RFQ is dispatched:
1. Admins have no structured way to amend the scope without cancelling and generating a whole new RFQ (consuming quotas and requiring contractors to re-enter all data).
2. If uncontrolled editing were permitted without safeguards, dishonest admins could "recycle" existing RFQs across completely unrelated domains (e.g., changing an intercom tender into a full landscaping project to circumvent tenant tender limits or quota caps).
3. Contractors who already submitted quotations based on the original specifications would have their quotes held against a changed, heavier scope of work without warning.

### 1.2 The Solution
A secure, version-controlled **Scope Amendment & Addendum Engine**:
1. **Contract-Gated Window**: Scope amendments are freely permitted as long as a formal contract has **not** been signed (`!rfq.contractExecution?.status` or `status !== 'signed_by_admin' && status !== 'fully_signed'`).
2. **Anti-Abuse Category Lock**: The RFQ category/domain is strictly immutable post-creation. Admins cannot change an RFQ from "אינטרקום" to "גינון".
3. **Formal Scope Versioning & Audit Log**: Every modification increments `scopeVersion` (v1 -> v2), records a mandatory change summary, and writes an immutable audit record (`RFQ_SCOPE_UPDATED`) tracking all field diffs.
4. **Fair Contractor Workflow & Meta WhatsApp Addendum**:
   - Contractors receive an automated Meta WhatsApp notification using approved template `contractor_rfq_scope_updated` with dynamic deep link.
   - Existing quote submissions are flagged as based on the prior scope version (`⚠️ הוגשה לפי גרסה 1`), and contractors are given the self-service capability in their portal to update their prices for the new scope.

---

## 2. Goals & Non-Goals

### 2.1 Goals (In Scope)
* **Scope Amendment Modal / Page**: Accessible directly from the RFQ details card in `ActiveQuotesPage.tsx` via `ערוך מפרט / עדכן דרישות ✏️`.
* **Category Immutability**: Visually and programmatically lock `category` from being changed once an RFQ has left draft status.
* **Scope Versioning (`scopeVersion`)**: Initialize at `1`, increment with each confirmed amendment.
* **Audit Logging**: Structured audit event `RFQ_SCOPE_UPDATED` capturing actor, timestamp, version transition, change summary, and changed fields.
* **Meta WhatsApp Dispatch**: Backend endpoint `/api/dispatchRfqAddendum` sending Meta utility template `contractor_rfq_scope_updated` to dispatched vendors, with fallback direct `wa.me` links.
* **Contractor Transparency**: Vendor portal banner highlighting the amendment note and giving vendors the ability to revise their submitted pricing.
* **Audit Explorer Formatting**: Human-readable view in `AuditExplorer.tsx` with version badges and diff highlights.

### 2.2 Non-Goals (Out of Scope for MVP)
* No automatic cancellation of existing quotes; quotes remain visible and active, flagged with their original version until the contractor optionally revises them.
* No category re-classification for active RFQs. If a committee made an egregious error in the category, they must cancel the tender and issue a new one.

---

## 3. Security & Anti-Abuse Safeguards

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ANTI-RECYCLE & AUDIT GUARD                       │
└────────────────────────────────────────────────────────────────────────┘

 [ Admin clicks 'ערוך מפרט' ]
             │
             ▼
 ┌───────────────────────┐
 │ Contract Signed?      │──( YES )──► [ BLOCK EDIT: Contract is Sealed 🔒 ]
 └───────────────────────┘
             │ ( NO )
             ▼
 ┌───────────────────────┐
 │ Category Field        │──► STRICT READ-ONLY (Locked with explanation badge)
 └───────────────────────┘
             │
             ▼
 ┌───────────────────────┐
 │ Mandatory Summary     │──► Required text: "מה השתנה במפרט?" (Min 5 chars)
 └───────────────────────┘
             │
             ▼
 ┌───────────────────────┐
 │ Version & Audit       │──► scopeVersion++ | Audit Record RFQ_SCOPE_UPDATED
 └───────────────────────┘
             │
             ▼
 ┌───────────────────────┐
 │ WhatsApp Addendum     │──► Dispatches contractor_rfq_scope_updated
 └───────────────────────┘
```

1. **Anti-Recycle Guarantee**: The Firestore update query validates that `category` matches the stored document. Any attempt to send a different category triggers a `400 Bad Request`.
2. **Contract Sealing**: If `contractExecution?.status` is `signed_by_admin` or `fully_signed`, editing endpoints reject the mutation with `403 Forbidden`.
3. **Tamper-Evident History**: `scopeHistory` stores every prior version's timestamp, admin UID, and summary text.

---

## 4. Technical Architecture & Data Schema

### 4.1 Data Models (`frontend/src/types/rfq.ts`)

```typescript
export interface ScopeAmendmentRecord {
  version: number;
  amendedAt: string;
  amendedBy: {
    uid: string;
    name: string;
    email?: string;
  };
  changeSummary: string;
  previousDescription?: string;
  previousAllowedWorkHours?: string;
  previousDeadlineAt?: string;
}

export interface WorkQuoteRequest {
  // Existing fields...
  scopeVersion?: number; // Defaults to 1
  scopeHistory?: ScopeAmendmentRecord[];
}

export interface VendorQuoteSubmission {
  // Existing fields...
  basedOnScopeVersion?: number; // Version of RFQ when this quote was submitted
}
```

### 4.2 Audit Action (`auditLogger.ts`)

```typescript
export type AuditActionType =
  | ...
  | 'RFQ_SCOPE_UPDATED'; // When scope/tasks of an active RFQ are amended
```

---

## 5. WhatsApp Template Specification (Meta)

* **Template Name**: `contractor_rfq_scope_updated`
* **Category**: `UTILITY`
* **Language**: `he` (Hebrew)
* **Body**:
  ```text
  שלום {{1}},
  עדכון חשוב לגבי הבקשה להצעת מחיר עבור: *{{2}}* ב-{{3}}.

  מפרט העבודה עודכן לגרסה {{4}} על ידי המזמין.
  פירוט השינוי/התוספת:
  "{{5}}"

  נא להיכנס לקישור לצפייה במפרט המלא והמעודכן, ולעדכון הצעת המחיר שלך במידת הצורך.
  ```
* **Button (Dynamic URL)**:
  * Label: `צפייה במפרט המעודכן 📋`
  * URL: `https://tiktak2026.web.app/quotes/{{1}}`

---

## 6. Implementation Plan

1. **Phase 1: Types & Audit Infrastructure**:
   - Update `types/rfq.ts` with `ScopeAmendmentRecord`, `scopeVersion`, and `basedOnScopeVersion`.
   - Add `RFQ_SCOPE_UPDATED` to `auditLogger.ts` and `AuditExplorer.tsx`.
2. **Phase 2: Scope Amendment Modal Component**:
   - Build `RfqScopeAmendmentModal.tsx` with locked category, validation, change summary input, and WhatsApp dispatch trigger.
3. **Phase 3: Integration in ActiveQuotesPage**:
   - Add "ערוך מפרט / עדכן דרישות ✏️" button in RFQ expanded details.
   - Display scope version badge (`גרסת מפרט: 2 📋`).
   - Flag quotes submitted on prior versions (`⚠️ הוגשה לפי גרסה 1`).
4. **Phase 4: Contractor Portal Transparency**:
   - Show amendment alert banner in `ContractorQuotePortal.tsx` with diff/notes and revision capability.
5. **Phase 5: Backend Cloud Function**:
   - Add `/api/dispatchRfqAddendum` handling Meta template dispatch with `wa.me` fallback.
6. **Phase 6: Verification & QA Testing**:
   - Test end-to-end editing, category lock, audit log generation, and vendor portal reaction.
