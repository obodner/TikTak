# PRD: Admin WhatsApp Notification on New Work Quote (התראת WhatsApp למנהל על הצעת מחיר חדשה)

**Status**: Ready for Implementation  
**Version**: 1.0  
**Owner**: TikTak Product & Backend Team (TikTak-BE / TikTak-PM)  
**Date**: 2026-09-28  

---

## 1. Problem Statement
When contractors submit price quotations via the `ContractorQuotePortal`, building administrators (committee members / property managers) currently have no real-time push mechanism alerting them to the new submission. They must manually check the admin panel. 

To achieve the "Snap & Send" and "Zero-Friction" philosophy, the admin who created the RFQ must receive an immediate, structured WhatsApp push alert on their mobile device the moment a contractor submits an offer, complete with a **Dynamic Link Button** that jumps directly to the quote comparison screen for that RFQ.

---

## 2. Core Pillars & Specifications

### Pillar 1: Server-Side Push Mechanism (Cloud Function)
- **Endpoint**: `/api/notifyQuoteSubmission` (Cloud Function, Node.js, GCP Cloud Run / Firebase).
- **Trigger**: Called immediately when a contractor submits a quotation on `ContractorQuotePortal` (after `submissions` document is written to Firestore).
- **Multi-Tenancy & Security**:
  - Request must validate `tenantId`, `rfqId`, and `submissionId`.
  - Verifies multi-tenant isolation under `tenants/{tenantId}/rfqs/{rfqId}/submissions/{submissionId}`.
- **Recipient Resolution**:
  1. Primary: The admin who created the RFQ (`rfq.createdBy.phone` or `adminUsers/{createdBy.uid}.mobile`).
  2. Secondary / Fallback: `tenant.vaadPhone` or primary tenant admin.

### Pillar 2: Message Content & Dynamic Link Button
- **Language & Formatting**: Hebrew (RTL) native.
- **Variables extracted from quotation**:
  1. `p1_adminName`: Name of the recipient admin (e.g., "אורן").
  2. `p2_vendorName`: Full name / company of the submitting contractor (e.g., "י.ד. גורדון").
  3. `p3_rfqTitle`: Title of the RFQ & Ticket # if applicable (e.g., "תיקון פיצוץ צינור #128").
  4. `p4_customerSite`: Building name / complex address (e.g., "הברוש 12, תל אביב").
  5. `p5_priceFormatted`: Price string in ILS (e.g., "₪4,500 כולל מע\"מ").
  6. `p6_duration`: Estimated execution time (e.g., "יומיים מתיאום").
- **Dynamic Link Button**:
  - Button Type: `URL` (Meta WhatsApp Interactive Template Button).
  - Button Label: `לצפייה בהצעה והשוואה 📊` (View & Compare).
  - Base URL: `https://tiktak2026.web.app/`
  - Dynamic URL Suffix (`{{1}}`): `admin/{tenantId}/quotes?rfqId={rfqId}&modal=compare&alert=quote&tab=open`
  - Action on Click: Automatically opens the Full-Screen Comparison Modal for the specific RFQ, highlights the card, and smoothly scrolls to it.

### Pillar 3: Resilient Delivery & Meta Template Architecture
- **Primary Delivery (Meta Approved Template)**:
  - Template Name: `admin_new_quote_alert` (Language: `he`).
  - Supports dynamic URL button suffix for direct deep linking into the RFQ comparison matrix.
- **Secondary Delivery (Interactive Fallback / Direct Message)**:
  - If template fails or during Meta review, gracefully falls back to interactive message or direct formatted text with clickable deep link to ensure 0 lost notifications.

---

## 3. Data Schema & Audit Logging

### Firestore Paths
- RFQ: `tenants/{tenantId}/rfqs/{rfqId}`
- Submission: `tenants/{tenantId}/rfqs/{rfqId}/submissions/{submissionId}`
- Dispatch Log: `tenants/{tenantId}/auditLogs` with action `QUOTE_NOTIFICATION_SENT`.

### Audit Log Record
```json
{
  "tenantId": "sample-tenant",
  "action": "QUOTE_NOTIFICATION_SENT",
  "actor": { "uid": "system", "type": "system" },
  "details": {
    "rfqId": "rfq-123",
    "submissionId": "vendor-456",
    "vendorName": "יוסי אינסטלציה",
    "price": 2500,
    "recipientPhone": "972501234567",
    "whatsappMessageId": "wamid.HBg..."
  }
}
```

---

## 4. User Stories & Acceptance Criteria

| ID | Persona | Story | Acceptance Criteria |
|---|---|---|---|
| **US-1** | Contractor | Submits Quote | When submitting an offer in `ContractorQuotePortal`, quote is saved and backend notification is triggered seamlessly without slowing down UI. |
| **US-2** | Admin | Receives WhatsApp Alert | Admin receives structured WhatsApp message with contractor name, price, duration, and RFQ title. |
| **US-3** | Admin | Dynamic Button Deep-Link | Clicking the dynamic button opens the browser directly into `/admin/{tenantId}/quotes?newRfqId={rfqId}&tab=open`, auto-expanding the relevant RFQ. |
| **US-4** | QA / Security | Multi-Tenant Scoping | Notifications only trigger for the correct tenant's admin, with zero data leakage across buildings. |
