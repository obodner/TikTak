# PRD: QuickTap (דיווח בלחיצה אחת)

**Status**: Draft
**Version**: 1.0
**Owner**: TikTak Product Team
**Date**: 2026-05-09

## Problem Statement
Residents often encounter recurring issues (e.g., "Trash in the playground", "Elevator light out") that require the same steps to report: Camera -> AI Analysis -> Review -> Send. This flow, while efficient for unique issues, adds unnecessary friction for common, predictable problems. The "5-to-2 Rule" dictates we should reduce this friction to the absolute minimum.

## Goals
- Reduce reporting time for common issues to under 5 seconds.
- Enable building managers (Vaad) to define recurring "hotspots" or issues.
- Maintain data integrity by requiring a quick confirmation before submission.
- Distinguish between AI-analyzed reports and QuickTap reports in the dashboard.

## Non-Goals
- Automated reporting without resident interaction (prevents accidental spam).
- Complex logic like time-based or location-aware QuickTaps (Phase 1).
- Resident-created templates (Admin only).

## Target Persona
- **The Busy Resident**: Wants to report a known issue "on the fly" without stopping.
- **The Building Manager**: Wants consistent labels for common issues for easier grouping and resolution.

## User Stories

### Admin User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| A1 | Enable QuickTap | Admin can toggle "QuickTap" on/off in Tenant Settings. |
| A2 | Configure Items | Admin can create up to 6 items with: Label (Hebrew), Emoji, Category, Location, Sub-location, Urgency. |
| A3 | Sort Items | Admin can drag/reorder items in the settings for their own management. |
| A4 | Mandatory Config | Feature cannot be enabled unless at least one item is configured. |
| A5 | Visibility | Feature only appears on the Resident page if "Enabled" is checked in settings. |
| A6 | Filter Tickets | Admin can filter the dashboard to show only "QuickTap" source tickets. |

### Resident User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| R1 | See QuickTap Pills | Horizontal scrollable pills appear between the camera button and manual report button IF enabled in admin settings. |
| R2 | Automatic Sorting | Pills are sorted automatically by "emoji type" on the Resident page, regardless of admin sort order. |
| R3 | Tap to Report | Tapping a pill opens a confirmation modal with pre-filled details. |
| R4 | Confirm & Send | Confirming records the ticket to Firebase and triggers the WhatsApp link engine. |
| R5 | Visual Feedback | Overflowing pills show a fade indicator; UI remains non-scrollable. |

## Functional Requirements

### 1. Tenant Configuration (Admin)
- **Settings Toggle**: A checkbox in `TenantSettings` to enable/disable the feature.
- **Item Editor**: A dedicated UI section to manage the array of QuickTap items.
- **Data Schema**:
  ```typescript
  quickTap: {
    enabled: boolean;
    items: {
      id: string;
      label: string;
      emoji: string;
      category: string;
      location: string;
      subLocation: string;
      urgency: 'Low' | 'Moderate' | 'High';
      order: number;
    }[];
  }
  ```

### 2. Resident Experience (Mobile)
- **Section Label**: "דיווח מהיר" (QuickTap).
- **Pill UI**: 
  - Rounded-full chips.
  - Horizontal scroll container with `overflow-x-auto` and `scrollbar-hide`.
  - Gradient masks at edges to indicate more items.
- **Confirmation Modal**:
  - Displays Emoji + Label.
  - Displays pre-filled Summary, Location and/or Sub-Location, and any other information (Urgency, Category, etc.).
  - Buttons: "ביטול" (Cancel) and "שליחה ⚡" (Send).
- **Haptic Feedback**: Trigger `navigator.vibrate` on confirmation.

### 3. Backend & Data Integration
- **Source Field**: New `source` field in `tickets` collection, values: `ai_camera`, `manual`, `quicktap`.
- **API Extension**: `createTicket` endpoint must accept the `source` field and bypass AI analysis logic when source is `quicktap`.
- **WhatsApp String**: Pre-formatted message includes a ⚡ indicator to let the Vaad know it was a quick report.

## Design Philosophy Mapping
- **The 5-to-2 Law**: Scan -> Tap Pill -> Tap Send. (Success!)
- **Zero-Config Reporting**: No typing required; context is derived from the template.
- **Montessori Minimalism**: Elements appear only if configured; UI stays clean.

## Success Metrics
- **Conversion Rate**: Percentage of residents using QuickTap vs. regular flow for common categories.
- **Time-to-Report**: Average time from QR scan to WhatsApp redirect (Target: < 5s).
- **Admin Satisfaction**: Number of buildings with at least 3 QuickTap items configured.

## Technical Constraints & Security
- **Multi-Tenancy**: QuickTap items are strictly scoped to the `building_id` in Firestore.
- **Rate Limiting**: Apply standard rate limits to QuickTap submissions to prevent bot abuse.
- **Performance**: QuickTap configuration must be fetched as part of the initial `buildingInfo` payload to avoid extra round-trips.

## Analytics (B2B)
- Track `quicktap_item_click` events.
- Track `quicktap_conversion_rate` (Confirmations / Clicks).
