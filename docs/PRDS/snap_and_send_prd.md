# PRD: TikTak "Snap & Send" Reporting Flow

**Status**: Draft (User Review Required)
**Version**: 1.0.0
**Target**: POC / MVP

---

## 1. Executive Summary
The "Snap & Send" feature is the core of TikTak. It aims to reduce the friction of reporting building maintenance issues by transforming a traditional form-based flow into a simplified camera-driven action.

## 2. Problem Statement
Israeli residents often ignore building maintenance hazards (broken bulbs, leaks) because reporting them requires joining a WhatsApp group, finding the "Vaad" member, or filling out a long digital form. Current flows require ~5-8 distinct actions.

## 3. Goals & The "5-to-2" Rule
- **Primary Goal**: Sub-15 second reporting.
- **Goal Metric**: Reduce report submission from 5 actions to **2 actions** (Scan/Open -> Snap & Send).

## 4. User Personas
- **The Busy Resident**: Wants to report an issue while in motion (e.g., walking to the elevator). Priority: Speed.
- **The Building Committee (Vaad)**: Wants structured data instead of chaotic WhatsApp messages. Priority: Clarity.

## 5. Functional Requirements

### 5.1 Native Camera Integration
- The system must trigger the native smartphone camera immediately upon a single button press.
- Must use `capture="environment"` to bypass the "Select from Gallery" step when possible.

### 5.2 AI-Led Reporting (The AI "Typist")
- **Categorization**: Gemini 2.5 Flash must analyze the image to detect the category (Electrical, Plumbing, Elevator, Cleaning).
- **Auto-Summary**: The AI MUST generate a concise Hebrew summary (e.g., "נזילה בקומה 2") so the resident doesn't have to type.
- **Severity Detection**: The AI assesses risk based on the visual context.

### 5.3 Zero-Identity Backend
- No login or name required.
- The `buildingId` is extracted automatically from the URL parameters.

### 5.4 WhatsApp Link Bridge
- Generate a pre-filled `wa.me` link containing the AI's summary and categories to be sent to the Vaad.

## 6. Technical Constraints
- **Framework**: Next.js (App Router).
- **Backend**: Firebase Functions (2.0) + Vertex AI.
- **Latency**: The analysis phase must not exceed 5 seconds on 4G/5G.

## 7. Success Metrics
- **Performance**: Time-to-Complete < 15s.
- **Adoption**: 80% of reports submitted via AI summary rather than manual editing.

---

## 8. Requirements Refinement (Approved)
- **Manual Override**: Users CAN edit the AI-generated summary if they find it incorrect. The UI must provide an easy "Edit" state for the summary box.
- **Image Support**: Strictly 1-photo support for the initial MVP.
- **Image Compression**: Images MUST be compressed on the client side before being uploaded to Firebase Storage to ensure speed and minimize data usage.
- **Extended Context**: The system must support an additional `floor_level` or `resource` (e.g., pool, storage area) parameter in the QR URL. This must be stored in the ticket metadata.
- **Internationalization (i18n)**: The frontend MUST use an i18n framework (translation tags) instead of hardcoded strings to support future localization and maintainability.

## 9. Data Schema Update
### Ticket Document
```json
{
  "buildingId": "string",
  "floorLevel": "string (optional)",
  "resource": "string (optional)",
  "imageUrl": "string",
  "category": "string",
  "summary": "string",
  "editedByResident": "boolean",
  "status": "pending",
  "createdAt": "timestamp"
}
```
