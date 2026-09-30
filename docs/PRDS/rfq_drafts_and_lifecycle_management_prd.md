# PRD: TikTak RFQ Drafts & Lifecycle Management
## שמירת טיוטות מכרז (RFQ), המשך עריכה ומחיקת טיוטות

**Document Status**: Approved Product Specification (v1.0)  
**Version**: 1.0.0  
**Author**: TikTak Lead Product Manager (TikTak-PM) & Lead Architect  
**Stakeholder & Quality Gatekeeper**: Oren Bodner (Lead Architect & Senior QA Lead)  
**Target Modules**: 
1. New RFQ Form (`/admin/:tenantId/quotes/new`)
2. Quotes Hub & Matrix (`/admin/:tenantId/quotes`)
**Date**: September 2026  

---

## 1. Executive Summary & Problem Statement

### 1.1 The Business Need
Building administrators, Vaad members, and property management teams frequently formulate Requests for Quotations (RFQs) in stages:
- Gathering scope information from a resident ticket.
- Uploading initial technical specifications, photos, and bills of quantities.
- Preparing the scope of work prior to board meetings or committee approval.

In the current version, an admin who does not immediately dispatch an RFQ to contractors loses all entered data upon leaving the screen. Furthermore, administrators need full visibility over their work-in-progress drafts, with the ability to:
1. **Save Draft ("שמור כטיוטה")**: Save an incomplete RFQ safely without validating contractor selection or sending broadcasts to vendors.
2. **Dedicated Drafts Tab ("טיוטות")**: View, filter, and track all draft RFQs in the quotes tracking matrix.
3. **Resume Editing ("המשך עריכה ופרסום")**: Re-open a saved draft in the wizard, populate all previous inputs, and proceed to publish.
4. **Permanent Erase ("מחק טיוטה")**: Safely discard unfulfilled, stale, or cancelled draft inquiries with a single click and confirmation modal.

---

## 2. Core Functional Pillars

### 2.1 Pillar 1: "Save Draft" in New RFQ Wizard (`NewRfqPage.tsx`)
- **Action Buttons Layout**:
  - Secondary button: **"שמור כטיוטה"** (Save Draft) - Neutral styling (`bg-slate-100 hover:bg-slate-200 text-slate-800`).
  - Primary button: **"פרסם והפץ למכרז"** (Publish & Dispatch) - Brand action (`bg-blue-600 hover:bg-blue-700 text-white`).
- **Permissive Validation for Drafts**:
  - Publishing requires: `title`, `description`, `category`, and at least 1 contractor selected.
  - Saving a draft requires only minimal identifier: at least a `title` (or defaults to `טיוטת מכרז - {category}`) and does **not** block if vendors or deadlines are not yet specified.
- **Payload State**:
  - `status: 'draft'`.
  - Dispatched vendors list: preserved if chosen, but **no WhatsApp or notifications are sent**.
- **Edit/Resume Support**:
  - Accepts URL query param `?draftId=:rfqId`.
  - Automatically loads linked ticket, title, description, category, location, attachments, and previously selected vendor IDs.
  - When saving again or publishing, updates the existing document rather than duplicating it.

---

### 2.2 Pillar 2: "טיוטות" Tab in Quotes Hub (`ActiveQuotesPage.tsx`)
- **Filter Tabs Bar**:
  - `הכל` (All)
  - `מכרזים פתוחים` (Open)
  - `התקבלו הצעות` (Has Quotes)
  - `טיוטות` (Drafts) 📝 with badge counter showing total open drafts.
  - `הסתיימו` (Closed/Awarded)
- **Draft RFQ Card UX**:
  - Visual draft badge: `טיוטה` (Amber / Slate outline badge).
  - Shows creation date, last updated date, and attached files / ticket linkage.
  - **"המשך עריכה"** (Continue Editing) button: routes to `/admin/:tenantId/quotes/new?draftId={rfq.id}`.
  - **"מחק טיוטה"** (Delete Draft) button: triggers a `ConfirmModal` ("האם למחוק טיוטה זו לצמיתות?").
    * Deletes the document from Firestore `tenants/{tenantId}/rfqs/{rfqId}`.
    * Centralized audit log: `RFQ_DRAFT_DELETED`.
    * Instant local optimistic removal from the UI.

---

## 3. Data Schema & Architecture Updates

### 3.1 `types/rfq.ts`
```typescript
export type RfqStatus = 'draft' | 'open' | 'awarded' | 'expired' | 'cancelled';
```

### 3.2 Audit Log Events
- `RFQ_DRAFT_SAVED`: Logged when a new or edited draft is stored.
- `RFQ_DRAFT_DELETED`: Logged when an admin deletes a draft.
- `RFQ_CREATED` / `RFQ_BROADCAST_SENT`: Logged only when transitioning from draft to published/open.

---

## 4. Acceptance Criteria (Senior QA Approved)

| # | Test Scenario | Expected Outcome |
|---|---|---|
| 1 | Admin clicks "שמור כטיוטה" with only Title and Category filled | Draft is saved to Firestore with `status: 'draft'`. No WhatsApp sent. Toast/Feedback displayed. |
| 2 | Admin opens `/admin/:tenantId/quotes` and clicks "טיוטות" tab | Only RFQs with `status: 'draft'` are displayed with badge counter. |
| 3 | Admin clicks "המשך עריכה" on a draft card | Redirected to New RFQ wizard with all fields, attachments, and linked ticket pre-filled. |
| 4 | Admin clicks "מחק טיוטה" on a draft card | Confirmation modal appears; upon approval, draft is deleted from Firestore and disappears from UI. |
| 5 | Admin publishes a previously saved draft | RFQ status transitions from `'draft'` to `'open'`, contractors are dispatched, and RFQ moves to "מכרזים פתוחים". |

---

## 5. Security & Multi-Tenancy Constraints
- Strictly scoped to `tenants/{tenantId}/rfqs/{rfqId}`.
- Unauthenticated contractors browsing `/quote/:rfqId` cannot access or view RFQs with `status: 'draft'`.
