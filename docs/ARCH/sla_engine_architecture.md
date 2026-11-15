# Technical Design Document: SLA & 5-Phase Lifecycle Engine

**Feature**: SLA Stagnation Engine & 5-Phase Lifecycle Analytics
**Author**: Antigravity (TikTak Architect)
**Updated**: 2026-11-14

---

## 1. System Overview

The TikTak SLA & Lifecycle Engine consists of two complementary layers that share zero-overhead, event-driven principles:

1. **State Stagnation SLA (Traffic-Light Alerts):**
   Preserves the existing localized working-day calculation (`slaStatus`: `none`, `stale-2`, `stale-5`, `stale-9`) for `open` and `in-progress` tickets, powering visual urgency on the Admin Dashboard and automated alerts.
2. **5-Phase Lifecycle Tracking & BI Analytics:**
   Records exact start/end ISO timestamps and accumulated durations (in **minutes**) across every phase of a ticket's lifecycle—from creation to vendor dispatch, vendor acknowledgment, vendor completion, and final closure—powering stakeholder BI averages and per-ticket drilldowns without adding cron load or extra database queries.

---

## 2. The 5 Lifecycle Phases

| Phase | Name | Start Event | End Event | Primary Tracker |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Intake / Triage | Ticket created (`status = 'open'`) | Status moves to `'in-progress'` | `phaseMetrics.p1` |
| **Phase 2** | Allocation | Status moves to `'in-progress'` | First dispatch to vendor (`forwardTicketToVendor`) | `phaseMetrics.p2` |
| **Phase 3** | Vendor Acknowledgment | Message sent to vendor (`sentAt`) | Vendor clicks `"קיבלתי את ההודעה"` (`acknowledgedAt`) | `vendors[]` + `phaseMetrics.p3` |
| **Phase 4** | Vendor Execution | Vendor clicks `"קיבלתי את ההודעה"` (`acknowledgedAt`) | Vendor clicks `"בוצע"` (`completedAt`) | `vendors[]` + `phaseMetrics.p4` |
| **Phase 5** | Closure / Verification | Vendor clicks `"בוצע"` (`vendorCompletedAt`) | Ticket closed (`status` → `'resolved'` or `'dismissed'`) | `phaseMetrics.p5` |

---

## 3. Data Architecture

### 3.1 Global Holiday Registry
**Collection**: `/holidays/{countryCode}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `holidays` | `array<map>` | List of `{ date: 'YYYY-MM-DD', name: 'Holiday Name' }`. |

**Initial Seed Data**: Israel (`IL`) and USA (`US`).

### 3.2 Tenant Configuration
**Collection**: `/tenants/{tenantId}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `country` | `string` | ISO code (e.g., `'IL'`, `'US'`). |
| `slaConfig` | `map` | |
| ├ `enabled` | `boolean` | Master toggle for stagnation SLA. |
| └ `workingDays` | `array<number>` | `0` (Sun) to `6` (Sat). Default: `[0, 1, 2, 3, 4]`. |

### 3.3 Ticket Document Extensions
**Collection**: `/tenants/{tenantId}/tickets/{ticketId}`

#### Existing Stagnation Fields (Unchanged)
| Field | Type | Description |
| :--- | :--- | :--- |
| `total_days_in_new` | `number` | Cumulative working days in `'open'` status. |
| `total_days_in_progress` | `number` | Cumulative working days in `'in-progress'` status. |
| `lastStatusChangeAt` | `string` | ISO timestamp of the last status update. |
| `slaStatus` | `string` | `'none' \| 'stale-2' \| 'stale-5' \| 'stale-9'`. |
| `stagnationDays` | `number` | Working days in current status. |

#### New 5-Phase Lifecycle Fields (`phaseMetrics`)
Each phase timer stores start/end timestamps and accumulated wall-clock minutes so in-flight durations can be computed at read time without background polling:

```typescript
interface PhaseTimer {
  startedAt: string | null;          // First time this phase began (ISO)
  endedAt: string | null;            // Last time this phase completed (ISO)
  currentStartedAt: string | null;   // Non-null while timer is actively running
  accumulatedMinutes: number;        // Sum of completed intervals in minutes
}

interface TicketPhaseMetrics {
  p1: PhaseTimer; // New -> In-Progress
  p2: PhaseTimer; // In-Progress -> Sent to Vendor
  p3: {           // Sent to Vendor -> Vendor Ack (derived from latest/active vendor dispatch)
    startedAt: string | null;
    endedAt: string | null;
    minutes: number | null;
  };
  p4: {           // Vendor Ack -> Vendor Complete
    startedAt: string | null;
    endedAt: string | null;
    minutes: number | null;
  };
  p5: PhaseTimer; // Vendor Complete -> Ticket Closed
}
```

#### Individual Vendor Dispatch Tracking (`vendors[]`)
Each dispatch to a vendor (including re-forwarding to the same vendor or dispatching to multiple vendors) is stored as a **separate entry** in `vendors[]`:

```typescript
interface VendorDispatchEntry {
  dispatchId: string;                // Unique ID per dispatch event
  phone: string;
  intlPhone: string;
  name: string;
  status: string;                    // "ממתין לתשובה מהספק ..." | "קיבלתי את ההודעה" | "בוצע"
  sentAt: string;                    // ISO timestamp
  acknowledgedAt?: string | null;    // ISO timestamp
  completedAt?: string | null;       // ISO timestamp
  responseTimeMinutes?: number | null;       // Phase 3 for this dispatch
  executionTimeMinutes?: number | null;      // Phase 4 for this dispatch
  totalResolutionTimeMinutes?: number | null;
  whatsappMessageId?: string;
}
```

---

## 4. Event-Driven Lifecycle Rules (Zero Polling)

All `phaseMetrics` updates happen **at write time** inside existing handlers—no scheduled jobs are required for phase timing.

### 4.1 Ticket Creation (`residentApi.ts`)
* Initialize `phaseMetrics.p1`:
  `{ startedAt: createdAt, currentStartedAt: createdAt, endedAt: null, accumulatedMinutes: 0 }`.

### 4.2 Status Transitions (`onTicketUpdate.ts`)
When `status` changes from `S_old` to `S_new` at timestamp `now`:
1. **Stagnation SLA (Existing):** Update `total_days_in_new` / `total_days_in_progress`, reset `stagnationDays = 0`, `slaStatus = 'none'`, `lastStatusChangeAt = now`.
2. **Pause / Close Active Phase Timer:**
   * If `S_old === 'open'` and `p1.currentStartedAt`:
     `p1.accumulatedMinutes += diffMinutes(p1.currentStartedAt, now)`
     `p1.currentStartedAt = null`, `p1.endedAt = now`.
   * If `S_old === 'in-progress'` and `p2.currentStartedAt`:
     `p2.accumulatedMinutes += diffMinutes(p2.currentStartedAt, now)`
     `p2.currentStartedAt = null`, `p2.endedAt = now`.
   * If `p5.currentStartedAt` is running and `S_new` is `'resolved'` or `'dismissed'`:
     `p5.accumulatedMinutes += diffMinutes(p5.currentStartedAt, now)`
     `p5.currentStartedAt = null`, `p5.endedAt = now`.
3. **Start / Resume Target Phase Timer:**
   * `S_new === 'in-progress'`:
     If `!p2.startedAt`, set `p2.startedAt = now`. Set `p2.currentStartedAt = now` (only if no vendor has been dispatched yet, or if resuming work).
   * `S_new === 'backlog'`:
     Active timers are paused (step 2 above) and **not** reset. Returning from `backlog` resumes accumulation.
   * **Reopening (`resolved`/`dismissed` → `in-progress`):**
     **Accumulate** existing timers (`p1`–`p5` are preserved); resume `p2.currentStartedAt = now` (or `p5.currentStartedAt = now` if vendor had already completed).
   * **Moving back to New (`S_new === 'open'`):**
     **Reset** all `phaseMetrics` timers (`p1`–`p5`) to `0` and set `p1 = { startedAt: now, currentStartedAt: now, endedAt: null, accumulatedMinutes: 0 }`, along with resetting `total_days_in_new = 0` and `total_days_in_progress = 0`.

### 4.3 Forward to Vendor (`adminApi.ts` — `handleForwardTicketToVendor`)
* Append a **new, separate** `VendorDispatchEntry` to `vendors[]` (never overwrite previous dispatches for the same or different vendors).
* If `phaseMetrics.p2.currentStartedAt` is active:
  * `p2.accumulatedMinutes += diffMinutes(p2.currentStartedAt, now)`
  * `p2.currentStartedAt = null`, `p2.endedAt = now`.
* Initialize `phaseMetrics.p3.startedAt = now` (if not already set).

### 4.4 Vendor WhatsApp Responses (`whatsappBot.ts`)
* **Vendor clicks `"קיבלתי את ההודעה"` (`VENDOR_ACK_`):**
  * Match the specific `VendorDispatchEntry` in `vendors[]` (via `whatsappMessageId` context or latest pending entry).
  * Set `acknowledgedAt = now`, `responseTimeMinutes = diffMinutes(sentAt, now)`.
  * Update `phaseMetrics.p3 = { startedAt: sentAt, endedAt: now, minutes: responseTimeMinutes }`.
  * Set `phaseMetrics.p4.startedAt = now`.
* **Vendor clicks `"בוצע"` (`VENDOR_DONE_`):**
  * **Normal flow (after Ack):**
    * `executionTimeMinutes = diffMinutes(acknowledgedAt, now)`.
    * Update `phaseMetrics.p4 = { startedAt: acknowledgedAt, endedAt: now, minutes: executionTimeMinutes }`.
  * **Skipped Ack flow (vendor clicks `"בוצע"` directly without `"קיבלתי את ההודעה"`):**
    * `responseTimeMinutes = 0` (**Phase 3 = `0`**).
    * `executionTimeMinutes = diffMinutes(sentAt, now)` (**Phase 4 = `sentAt → completedAt`**).
    * Update `phaseMetrics.p3 = { startedAt: sentAt, endedAt: sentAt, minutes: 0 }`.
    * Update `phaseMetrics.p4 = { startedAt: sentAt, endedAt: now, minutes: executionTimeMinutes }`.
  * **Start Phase 5:**
    * If ticket is not yet closed (`status` not in `['resolved', 'dismissed']`), set `phaseMetrics.p5 = { startedAt: now, currentStartedAt: now, endedAt: null, accumulatedMinutes: p5?.accumulatedMinutes || 0 }`.

---

## 5. Edge Cases & BI Calculation Rules

1. **Closed Without a Vendor (`vendors.length === 0`):**
   * **Phases 1 & 2** (New & In-Progress durations) and total time to close are preserved and shown.
   * **Phases 3, 4, and 5** are marked **`N/A`** in the UI and excluded from the Phase 3–5 BI averages.
2. **All Tickets Included in BI (Completed + In-Flight):**
   * For any phase timer currently running (`currentStartedAt !== null`), the frontend computes live elapsed minutes at render time:
     `totalMinutes = accumulatedMinutes + diffMinutes(currentStartedAt, now)`.
   * For Phase 3 while awaiting vendor acknowledgment (`sentAt` present, `acknowledgedAt` & `completedAt` absent), elapsed minutes = `diffMinutes(sentAt, now)`.
   * For Phase 4 while awaiting vendor completion (`acknowledgedAt` present, `completedAt` absent), elapsed minutes = `diffMinutes(acknowledgedAt, now)`.
3. **Human-Readable Duration Formatting (`formatDurationMinutes`):**
   * Minutes are converted to exact hours/days:
     * `< 60 min`: e.g., `43 דק'` / `43m`
     * `60 min – 23h 59m`: e.g., `103 min` → `1 שעה ו-43 דק'` / `1h 43m`
     * `>= 24h`: e.g., `2 ימים, 3 שעות ו-15 דק'` / `2d 3h 15m`
4. **Historical Tickets Fallback:**
   * Tickets created before `phaseMetrics` existed fall back gracefully in BI using `createdAt`, `vendors[].sentAt`, `vendors[].acknowledgedAt`, `vendors[].completedAt`, and `resolvedAt`, displaying `N/A` when intermediate timestamps are unavailable.

---

## 6. Background Engine (`slaCron`)

`slaCron` continues to run twice daily (`00:05` and `12:05`) strictly for the traffic-light stagnation indicators:
1. Iterate `tenants` where `slaConfig.enabled == true`.
2. Cache `/holidays/{country}`.
3. Query `tickets` with `status in ["open", "in-progress"]`.
4. Update `stagnationDays` and `slaStatus` (`none`, `stale-2`, `stale-5`, `stale-9`) via batched writes.

---

## 7. BI Analytics & Per-Ticket Drilldown (Frontend)

### 7.1 `AdminAnalytics.tsx`
* Uses the existing `dateRange` selector (`current_month` = past/current month, `last_3_months` = past 3 months).
* Computes `phaseSlaMetrics` in a single `useMemo` pass over `rangeTickets`, producing for each of the 5 phases:
  * Average duration (formatted via `formatDurationMinutes`).
  * Sample count (all eligible tickets in range, excluding `N/A` for vendor phases when closed without a vendor).
  * Per-ticket breakdown array with `startTime`, `endTime` (or `"בתהליך"` if active), `durationMinutes`, and vendor metadata.

### 7.2 `KpiDrilldownModal.tsx`
* Extends the drilldown pattern used by `"זמן מענה ראשוני ממוצע"` (`first_touch`) to support Phases 1–5 (`phase_1` .. `phase_5`).
* Clicking any phase card opens the per-ticket table for the active period (1 month or 3 months) with direct click-through to `TicketDetailsModal`.

---

## 8. Security & Multi-Tenancy
* **Isolation**: Tenant admins can only read/write their own `slaConfig` and `tickets` (`tenants/{tenantId}/...`).
* **Global Data**: `/holidays` is read-only for authenticated users and write-only for Super Admins.
