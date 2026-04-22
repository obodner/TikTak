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
- **Perceived Inactivity**: Residents feeling the system is a "black hole" if they don't see immediate physical results.
- **Manual Overhead**: Vaad members having to manually dig through WhatsApp chat history to find the original reporter.

## 3. Goals & Success Metrics
### Goals
- **Close the Loop**: Enable 1-click status notifications from the Admin Dashboard.
- **Maintain Anonymity**: Keep phone number disclosure strictly voluntary.
- **Zero Operating Cost**: Avoid paid messaging APIs (Twilio/360dialog) by utilizing the `wa.me` local protocol.

### Success Metrics
- **Feedback Rate**: >40% of residents opting to leave a phone number for updates.
- **Closure Speed**: 25% reduction in "Duplicate" ticket entries due to better resident awareness.

## 4. User Personas
### 4.1 The Notified Resident
Wants to be an "active citizen" in their building but doesn't want to join another group or register an account. They are willing to provide their number if it means they'll know when the elevator is fixed.

### 4.2 The Efficient Vaad Member
Manages building maintenance in their spare time. They want to "clear the board" and notify the reporter with zero typing required.

## 5. Functional Requirements

### 5.1 [Resident Flow] Voluntary Contact Capture
- **Feature**: Add an optional `reporterPhone` field to the `ReportingForm`.
- **Validation**: 
    - Must accept only digits.
    - Must be optional.
- **UX**: Display a clear tip: *"Provide your number to receive a WhatsApp update when the status changes."*

### 5.2 [Admin Flow] Status Update Bridge
- **Feature**: "Notify Reporter" button in the `AdminDashboard` ticket cards.
- **UI Logic**:
    - If `reporterPhone` exists, show the "Notify" action.
    - If empty, suggest "No contact provided."
- **Action**: When clicked, generates a `wa.me` link with a pre-filled, localized message:
    - *Template (Fixed)*: "שלום! התקלה שדיווחת עליה ([TicketID]) סומנה כ-בוצעה. תודה על העזרה!"

## 6. Technical Architecture

### 6.1 Data Schema (Firestore)
- **Collection**: `tenants/{tenantId}/tickets/{ticketId}`
- **New Field**: `reporterPhone: string | null`

### 6.2 API Integration
- **`createTicket` Function**: Updated to accept the `reporterPhone` parameter from the frontend.
- **Dashboard Service**: A utility function in the frontend to map ticket statuses to Hebrew WhatsApp message templates.

## 7. Security & Privacy
- **Tenancy Isolation**: Phone numbers must be strictly scoped to the tenant's subcollection.
- **Data Retention**: Reporter phone numbers should be purged from Firestore 30 days after a ticket is marked "Closed" to minimize PII exposure.

---
*Document generated via TikTak RCA-Documenter Skill v1.0*
