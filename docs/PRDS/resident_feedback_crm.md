# PRD: Resident Feedback & Follow-up (CRM Lite)

**Doc Version**: 1.0.0  
**Status**: Formalized Draft  
**Target Architecture**: Firebase Serverless + Vite/Next.js SPA  

---

## 1. Executive Summary
TikTak is a zero-friction reporting tool. To complete the service lifecycle, building administrators (Vaad) need a low-overhead method to provide status updates back to residents. This PRD defines the "Resident Feedback Bridge," a semi-automated WhatsApp integration that uses voluntary contact data to close the feedback loop.

## 2. Problem Statement
The current "Snap & Send" model is a one-way communication channel. Residents report issues but receive no confirmation when work is started or completed unless they manually follow up with the Vaad. This leads to:
- **Redundant Reports**: Multiple residents reporting the same (already fixed) issue.
- **Unverified Claims**: Anyone with a QR code could theoretically spam the system, requiring a secure but low-friction authentication method.
- **Manual Overhead**: Vaad members having to manually dig through WhatsApp chat history to find the original reporter.

## 3. Goals & Success Metrics
### Goals
- **Close the Loop**: Enable 1-click status notifications from the Admin Dashboard.
- **Secure Access**: Validate reporters against a pre-authorized list managed by the building admin.
- **Zero Operating Cost**: Avoid paid messaging APIs (Twilio/360dialog) by utilizing the `wa.me` local protocol.

### Success Metrics
- **Authentication Rate**: 100% of submitted tickets are tied to an authorized building resident/employee.
- **Closure Speed**: 25% reduction in "Duplicate" ticket entries due to better resident awareness.

## 4. User Personas
### 4.1 The Authenticated Resident
Wants to report a bug in their building without creating an account or downloading an app. They are willing to provide their phone number as a single form of identity verification, which the Vaad has pre-authorized.

### 4.2 The Efficient Vaad Member
Manages building maintenance in their spare time. They want to "clear the board" and notify the reporter with zero typing required.

## 5. Functional Requirements

### 5.1 [Admin Flow] Authorized CSV Management
- **Feature**: `CsvUploadPanel` in the Admin Dashboard Settings.
- **Functionality**: 
    - Admins can upload a CSV containing Phone Numbers and Names.
    - System performs duplicate validation and saves data to `tenants/{tenantId}/reporters/{phoneNumber}`.
    - Full-overwrite strategy ensures the database perfectly mirrors the latest uploaded file.

### 5.2 [Resident Flow] Mandatory Contact Validation
- **Feature**: Add a mandatory `reporterPhone` field to the `ReportingForm`.
- **Validation**: 
    - Backend function `createTicket` strictly checks if the provided phone number exists in the authorized `reporters` collection for that specific tenant.
    - **Rejection**: If unauthorized, a `403 Forbidden` error is returned, and the UI displays a warning banner telling the user to contact the building committee without losing their drafted ticket data.

### 5.3 [Admin Flow] Status Update Bridge
- **Feature**: Dynamic "Notify Reporter" button and Reporter Name Badge in the `AdminDashboard` ticket cards.
- **UI Logic**:
    - The ticket card explicitly displays the reporter's name in a blue badge if available.
    - A WhatsApp button generates a `wa.me` link with a pre-filled message that adapts automatically based on the ticket's current status:
    - **Status "חדש" (New)**: 
      `*עדכון מTikTak*`
      `הסטטוס של הדיווח שלך בנושא "[קטגוריה]" ב-[מיקום] נרשם במערכת ועודכן ל: סטטוס *חדש*.`
    - **Status "בטיפול" (In Progress)**: 
      `*עדכון מTikTak*`
      `*היי, אנחנו על זה!*`
      `הדיווח שלך על "[קטגוריה]" ב-[מיקום] כרגע בטיפול. נעדכן כשיסתיים.`
    - **Status "טופל" (Resolved)**: 
      `*עדכון מTikTak*`
      `*חדשות טובות!* הדיווח שלך בנושא "[קטגוריה]" ב-[מיקום] סומן כטופל. תודה שעזרת לשמור על הבית ! ✅`

## 6. Technical Architecture

### 6.1 Data Schema (Firestore)
- **Collection**: `tenants/{tenantId}/tickets/{ticketId}`
- **New Fields**: 
    - `reporterPhone: string | null`
    - `reporterName: string | null`

- **Collection**: `tenants/{tenantId}/reporters/{phoneNumber}`
- **Fields**:
    - `name: string`
    - `phone: string`

### 6.2 API Integration
- **`createTicket` Function**: Updated to accept `reporterPhone` from the frontend, validate it against the `reporters` collection, and securely attach both the phone and `reporterName` to the newly created ticket document.

## 7. Security & Privacy
- **Tenancy Isolation**: Phone numbers must be strictly scoped to the tenant's subcollection.
- **Data Retention**: Reporter phone numbers should be purged from Firestore 30 days after a ticket is marked "Closed" to minimize PII exposure.

---
*Document generated via TikTak RCA-Documenter Skill v1.0*
