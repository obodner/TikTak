# PRD: Admin Notifications Center & Action Hub (מרכז התראות ופרטי פנייה)

**Status**: Version 3.0 (Grouped Categories, Ticket Details Modal, Help Guide)  
**Version**: 3.0  
**Owner**: TikTak Product & Engineering Team  
**Date**: 2026-09-16  

---

## 1. Problem Statement
Building committee members (Vaad) and property managers need instant visibility into operational bottlenecks without feeling overwhelmed by an undifferentiated list of alerts. Additionally, when an admin clicks on an alert or browses cards on the dashboard, clicking the ticket description should open a comprehensive, media-rich **Ticket Details Modal** displaying the embedded image and audio directly (not as separate links), eliminating dead-end redirects.

---

## 2. Core Pillars & Goals

### 1. Grouped Notification Categories
To eliminate cognitive fatigue, the Notification Modal groups active alerts under structured contextual categories:
1. 🚨 **מפגעים דחופים וחריגות קריטיות (Urgent & Critical Alerts)**:
   - Includes: `urgent` (`urgency === 'High'`), `sla_stale_9` (9+ days stagnation), and `quota_alert` (100% capacity).
2. ⏳ **חריגות SLA ועיכובי ספקים (SLA & Vendor Follow-ups)**:
   - Includes: `sla_stale_5` (5+ days stagnation) and `vendor_stalled` (>48h without contractor response).
3. 🔄 **גל דיווחים ומכסה (Activity & Quota Warnings)**:
   - Includes: `duplicate_spike` (2+ reports in same location within 48h) and `quota_warning` (80% capacity).
4. 📥 **פניות חדשות (New Incoming Reports)**:
   - Includes: `new_ticket` (recently submitted open tickets).

Each group features a dedicated category header with an icon, title, unread count badge, and collapsible toggle.

### 2. Full Ticket Details Modal (`TicketDetailsModal`)
- Triggered by:
  1. Clicking on any notification's **"View ticket" / "הצג פנייה"** button.
  2. Clicking on the ticket description/summary paragraph on any Kanban card in `AdminDashboard`.
  3. Opening the dashboard with a URL query parameter `?ticket={ticketId}`.
- Contents:
  - **Embedded Image**: Renders the captured photo directly via `<img src="/img/{tenantId}/{imageId}" />` with an option to expand to full size.
  - **Embedded Audio Player**: Plays resident voice recordings directly in-modal via `<audio controls src="/audio/{tenantId}/{audioId}" />`.
  - **Metadata**: Category, Location, Sub-Location, Floor, Urgency, Creation time, Reporter Name & Phone (with 1-click WhatsApp button).
  - **SLA & Vendor status**: Stagnation days, vendor forwarding history, closure details (if resolved).
  - **Quick Action Bar**: Change status, forward to vendor, open comments modal.

### 3. HelpModal Updates
- Update the Admin Guide section in `HelpModal.tsx` and translation dictionaries (`he.json`, `en.json`) to document:
  - The Notifications Center, its categorized groups, and unread filters.
  - The Ticket Details Modal with in-place media playback.

---

## 3. User Stories & Acceptance Criteria

| ID | Persona | Story | Acceptance Criteria |
|---|---|---|---|
| **US-1** | Building Manager | Categorized Notifications | Notifications in the modal are visually partitioned under 4 clear category headers with unread counter badges. |
| **US-2** | Building Manager | Empty Category Suppression | Categories with 0 matching items (or 0 unread when "Only Unread" is active) are neatly hidden. |
| **US-3** | Building Manager | Click Ticket Description on Board | Clicking the ticket summary text in the Kanban board opens the Ticket Details Modal for that ticket. |
| **US-4** | Building Manager | Deep-Link from Notification | Clicking "View ticket" on an alert opens the Ticket Details Modal with all media loaded. |
| **US-5** | Building Manager | Embedded Media Display | Ticket Details Modal renders the image directly (not as a link) and audio with an embedded HTML5 audio player. |
| **US-6** | Building Manager | View Help Guide | HelpModal includes a section detailing the Notifications Center and Ticket Details Modal. |

---

## 4. UI/UX Specifications
- Follows TikTak Styling Guide: `bg-slate-900` modal backdrops, crisp typography, RTL-native Hebrew layouts.
- Tactile feedback: `scale-95` on interactive buttons, clear hover states.
- High accessibility: Alt text, keyboard `Escape` closing, focus traps.
