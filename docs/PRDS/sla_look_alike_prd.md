# PRD: SLA-Look-Alike (Community Transparency Module)

**Status**: Draft
**Version**: 1.0
**Owner**: TikTak Product Team
**Date**: 2026-05-16

## Problem Statement
Building maintenance often suffers from a "black hole" effect: residents report issues but have no visibility into the progress or priority. This lack of transparency leads to frustration, duplicate reports, and a breakdown in trust between residents and the building committee (Vaad). Conversely, committees often struggle to manage priorities and track their own performance against community expectations.

## Goals
- **Automate Transparency**: Keep residents informed without requiring manual effort from the committee.
- **Visual Priority Management**: Provide immediate visual cues to admins about which tickets are "stagnating."
- **Localized Accuracy**: Respect local work weeks (e.g., Sun-Thu) and national holidays for fair performance tracking.
- **Operational Intelligence**: Generate statistics on how long tickets spend in each phase to support data-driven building management.

## Non-Goals
- Real-time "chat" between residents and admins (outside of status updates).
- Complex resource management or personnel assignment (Phase 1).
- Public-facing performance dashboards (Initial focus is internal transparency).

## Target Persona
- **The Concerned Resident**: Wants to know that their report hasn't been forgotten.
- **The Volunteer Committee (Vaad)**: Wants an easy way to see what needs urgent attention and how they are performing.
- **The Super Admin**: Needs to manage global configurations (like holidays) for all tenants.

## User Stories

### Tenant Admin User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| A1 | Configure Work Week | Admin can select which days of the week are "working days" (Default: Sun-Thu). |
| A2 | Select Country | Admin can select their country to map to the correct holiday registry. |
| A3 | Toggle SLA | Admin can enable or disable the SLA module entirely. |
| A4 | Visual Stale Cues | Admin sees tickets color-coded (Yellow/Orange/Red) based on completed working days of stagnation. |
| A5 | Track Performance | Ticket document stores `total_days_in_new` and `total_days_in_progress` (excluding non-working days). |

### Resident User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| R1 | Automated Updates | Resident receives a WhatsApp notification on every status change (New -> In-Progress -> Resolved). |
| R2 | Stale Reminders | Resident receives "We're on it" messages if a ticket exceeds 2, 5, or 9 working days without status change. |
| R3 | Notification Bundling| Resident receives a single summary message if multiple tickets are stale, rather than separate alerts. |

### Super Admin User Stories
| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| S1 | Manage Holidays | Super Admin can add/edit/delete national holidays for any country in a global registry. |

## Functional Requirements

### 1. SLA Engine (Core Logic)
- **Working Day Calculator**: A utility that calculates the diff between two dates, subtracting weekends (as defined by tenant) and holidays (as defined globally).
- **Stagnation Thresholds**:
    - **2 Days**: Yellow card / "Working on assigning" message.
    - **5 Days**: Orange card / "Being handled, thank you for patience" message.
    - **9 Days**: Red card / Urgent follow-up.
- **Exclusion**: "Closed" or "Resolved" tickets are ignored by the SLA engine.

### 2. Admin Dashboard (UI)
- **Dynamic Backgrounds**: Ticket cards in the 'New' and 'In-Progress' columns must have conditional background colors:
    - `bg-yellow-50` (2 days)
    - `bg-orange-50` (5 days)
    - `bg-red-50` (9 days)
- **Counters**: Display "Days in State" on the ticket card.

### 3. Statistics Persistence
- **State Transition Triggers**: When a ticket moves from 'New' to 'In-Progress', calculate and save `total_days_in_new`.
- **Reopen Logic**: 
    - Reopen to 'New': Reset both `total_days_in_new` and `total_days_in_progress`.
    - Reopen to 'In-Progress': Reset only `total_days_in_progress`.

## Design Philosophy Mapping
- **The 5-to-2 Law**: Automate reminders so admins don't have to "manually" reassure residents.
- **Radical Simplicity**: Uses intuitive color coding (Traffic Light system) for priority management.
- **Montessori Minimalism**: Settings are tucked away in "General Settings" to keep the main dashboard focused on action.

## Success Metrics
- **Mean Time to Resolve (MTTR)**: Reduction in average working days per ticket.
- **Resident Satisfaction**: Fewer "Status?" inquiries in building WhatsApp groups.
- **Engagement**: Percentage of tenants who have SLA enabled.

## Analytics (B2B)
- Track `sla_threshold_reached` (2, 5, 9 days) events.
- Track `avg_working_days_per_category`.
