# Technical Design Document: SLA Calculation Engine

**Feature**: SLA-Look-Alike Engine
**Author**: Antigravity (TikTak Architect)
**Date**: 2026-05-16

## 1. System Overview
The SLA Engine provides a localized working-day calculation service that powers the visual urgency logic in the Admin Dashboard and the automated transparency notifications. It operates by combining tenant-specific work week definitions with a global holiday registry.

## 2. Data Architecture

### 2.1 Global Holiday Registry
**Collection**: `/holidays/{countryCode}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `holidays` | `array<map>` | List of `{ date: 'YYYY-MM-DD', name: 'Holiday Name' }`. |

**Initial Seed Data**: Israel (IL) and USA (US).

### 2.2 Tenant Configuration Extensions
**Collection**: `/tenants/{tenantId}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `country` | `string` | ISO code (e.g., 'IL', 'US'). |
| `slaConfig` | `map` | |
| ├ `enabled` | `boolean` | Master toggle. |
| └ `workingDays`| `array<number>` | 0 (Sun) to 6 (Sat). Default: `[0, 1, 2, 3, 4]`. |

### 2.3 Ticket Statistics
**Collection**: `/tenants/{tenantId}/tickets/{ticketId}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `total_days_in_new` | `number` | Cumulative working days in 'open' status. |
| `total_days_in_progress`| `number` | Cumulative working days in 'in-progress' status. |
| `lastStatusChangeAt` | `string` | ISO timestamp of the last status update. |
| `slaStatus` | `string` | `none`, `stale-2`, `stale-5`, `stale-9`. |
| `stagnationDays` | `number` | Working days in current status. |

## 3. Core Logic: `WorkingDayCalculator`

A utility function shared (or duplicated) between Frontend (for UI) and Backend (for stats/notifications).

```typescript
function calculateWorkingDays(
  start: Date, 
  end: Date, 
  workingDays: number[], 
  holidays: string[]
): number {
  let count = 0;
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const target = new Date(end);
  target.setHours(0, 0, 0, 0);

  while (current <= target) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    if (workingDays.includes(dayOfWeek) && !holidays.includes(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
```

## 4. State Transition Management

### 4.1 On Status Change (Backend/Admin UI)
When `status` changes from `S_old` to `S_new`:
1.  **Calculate**: `delta = calculateWorkingDays(lastStatusChangeAt, now, ...)`.
2.  **Update**: 
    -   If `S_old === 'open'`: `total_days_in_new += delta`.
    -   If `S_old === 'in-progress'`: `total_days_in_progress += delta`.
3.  **Reset**: `lastStatusChangeAt = now`.

### 4.2 On Ticket Reopen
-   `status` -> `'open'`: Set `total_days_in_new = 0`, `total_days_in_progress = 0`.
-   `status` -> `'in-progress'`: Set `total_days_in_progress = 0`.

## 5. Background Engine (Cloud Function Cron)

A scheduled function `slaCron` will run daily (e.g., at 00:05 and 12:05) to ensure the `slaStatus` and `stagnationDays` are up to date in the database.

1.  **Iterate**: Fetch all `tenants` where `slaConfig.enabled == true`.
2.  **Fetch Holidays**: Cache holidays for IL and US during the run.
3.  **Process Tickets**: Fetch all tickets with status `open` or `in-progress`.
4.  **Update**: 
    -   Calculate `stagnationDays` from `lastStatusChangeAt`.
    -   Set `slaStatus` based on thresholds.
    -   Write to Firestore (using batched writes).

## 6. UI Implementation (Admin Dashboard)

### 6.1 Real-time Stagnation Logic
The dashboard will display colors based on the `slaStatus` field. For new tickets not yet processed by the cron, the UI will perform a fallback calculation locally to maintain the "Instant Feedback" feel.

## 7. Security & Multi-Tenancy
- **Isolation**: Tenant admins can only modify their own `slaConfig`.
- **Global Data**: The `/holidays` collection is read-only for tenants and write-only for Super Admins.
- **Rules**: 
  ```javascript
  match /holidays/{country} {
    allow read: if request.auth != null;
    allow write: if request.auth.token.role == 'super';
  }
  ```

## 8. Phase 2 Preview: Automated Notifications
A scheduled Cloud Function (Cron) will run daily at 18:00 (end of workday):
1.  Iterate through all tenants with `slaConfig.enabled === true`.
2.  Fetch `holidays` for the tenant's country.
3.  If today is a working day:
    -   Find all open tickets for that tenant.
    -   Calculate stagnation days.
    -   If stagnation equals exactly 2, 5, or 9:
        -   Queue a WhatsApp notification to the reporter.
        -   Bundle notifications per `reporterPhone`.
