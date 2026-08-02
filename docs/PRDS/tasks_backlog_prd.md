# PRD: Tasks Backlog (מצבור משימות)

**Status**: Approved / Draft  
**Version**: 1.0  
**Owner**: TikTak Product & Engineering Team  
**Date**: 2026-08-02  

---

## 1. Problem Statement
Building committee members (Vaad) and property managers often receive non-urgent maintenance issues or multi-stage projects (e.g., lobby renovation planning, annual pipe inspections) that crowd the main daily triage dashboard ("חדש", "בטיפול", "טופל"). 

To maintain the **5-to-2 Rule** for daily operational speed, admins need a dedicated space to backlog, prioritize, and manage long-term or deferred building tasks using an intuitive 3-tier priority matrix ("חשוב ודחוף", "חשוב ולא דחוף", "לא חשוב ודחוף") without losing ticket history or resident visibility.

---

## 2. Goals & Non-Goals

### Goals
1. **Status Dropdown Option**: Add `"העבר לבקלוג"` ("Move to Backlog") to the ticket status dropdown **ONLY** for tickets in the **"חדש" (New/Open)** and **"בטיפול" (In-Progress)** columns.
2. **Seamless Navigation**: Selecting `"העבר לבקלוג"` updates the ticket status and automatically redirects the admin to the **"מצבור משימות" (Tasks Backlog)** page (`/admin/:tenantId/backlog`).
3. **3-Column Kanban Board**: Render a 3-column Eisenhower-style Kanban board on the Backlog page:
   - 🔴 **"חשוב ודחוף"** (Important & Urgent)
   - 🟠 **"חשוב ולא דחוף"** (Important & Not Urgent)
   - 🟡 **"לא חשוב ודחוף"** (Not Important & Urgent)
4. **Automatic Initial Placement**: Newly backlogged tickets land at the **very top** of the **"חשוב ודחוף"** column.
5. **Drag & Drop Prioritization**: Support fluid drag-and-drop between columns AND within a column (top ticket = highest priority, bottom = lowest priority).
6. **Return to Dashboard**: Changing a backlog ticket's status back to `"חדש"` (New), `"בטיפול"` (In-Progress), or `"טופל/סגור"` (Closed/Resolved) moves it out of the backlog and places it back into the correct column on the main Dashboard.
7. **Full Audit Logging**: Log all admin transitions and backlog reorder events in the `audit_logs` collection.

### Non-Goals
- Complex Gantt charts or multi-assignee project management tools (MVP scope).
- Automated scheduling triggers (can be added in Phase 2).

---

## 3. User Stories & Acceptance Criteria

### Admin User Stories

| ID | Persona | Story | Acceptance Criteria |
|---|---|---|---|
| **US-1** | Building Manager | Move ticket from Dashboard to Backlog | Status dropdown on "חדש" and "בטיפול" cards includes `"העבר לבקלוג"`. Selecting it sets status to `backlog`, initial column to `important-urgent`, and redirects to `/admin/:tenantId/backlog`. |
| **US-2** | Building Manager | Restricted Status Dropdown | Tickets in "טופל" / "סגור" (Closed) columns do **NOT** show `"העבר לבקלוג"` in their status dropdown. |
| **US-3** | Building Manager | View 3-Column Backlog | The `/admin/:tenantId/backlog` page displays 3 Kanban columns: "חשוב ודחוף", "חשוב ולא דחוף", "לא חשוב ודחוף" with ticket counts. |
| **US-4** | Building Manager | Drag & Drop Reordering | Admin can drag cards between columns or reorder vertically within a column. Vertical position is persisted (`backlogOrder` index). Top ticket represents highest priority. |
| **US-5** | Building Manager | Return Ticket to Active Triage | Inside the backlog card's status dropdown, choosing "חדש", "בטיפול", or "סגור" removes the ticket from backlog and returns it to the main Dashboard under that status. |
| **US-6** | Auditor / QA | Audit Logging | Every action (`TICKET_BACKLOG_MOVED`, `BACKLOG_TICKET_REORDERED`, `TICKET_STATUS_UPDATE`) creates a structured entry in `audit_logs`. |

---

## 4. Technical Architecture & Data Schema

### 4.1 Data Model Extensions (Firestore `tickets` collection)

When a ticket is backlogged, its document is updated with the following fields:

```typescript
interface Ticket {
  // Existing fields...
  id: string;
  status: 'open' | 'in-progress' | 'resolved' | 'dismissed' | 'backlog';
  
  // New Backlog Fields:
  backlogColumn?: 'important-urgent' | 'important-not-urgent' | 'not-important-urgent';
  backlogOrder?: number; // Sorting index within the column (e.g. Date.now() or sequential float/integer)
  backloggedAt?: string; // ISO timestamp when ticket was moved to backlog
}
```

### 4.2 Audit Log Events (`audit_logs` collection)

1. **`TICKET_BACKLOG_MOVED`**: Logged when a ticket is moved to backlog.
   ```json
   {
     "tenantId": "demo",
     "action": "TICKET_BACKLOG_MOVED",
     "level": "INFO",
     "actor": { "uid": "admin123", "name": "ישראל ישראלי", "type": "admin" },
     "details": {
       "ticketId": "xyz",
       "ticketNumber": 103,
       "fromStatus": "in-progress",
       "targetColumn": "important-urgent"
     }
   }
   ```

2. **`BACKLOG_TICKET_REORDERED`**: Logged when a card is moved between columns or re-ordered.
   ```json
   {
     "tenantId": "demo",
     "action": "BACKLOG_TICKET_REORDERED",
     "level": "INFO",
     "actor": { "uid": "admin123", "name": "ישראל ישראלי", "type": "admin" },
     "details": {
       "ticketId": "xyz",
       "ticketNumber": 103,
       "fromColumn": "important-urgent",
       "toColumn": "important-not-urgent",
       "newOrderIndex": 0
     }
   }
   ```

3. **`TICKET_STATUS_UPDATE`**: Logged when a backlog ticket is returned to active status (`open`, `in-progress`, `resolved`).

---

## 5. UI/UX Specifications

### 5.1 Dashboard Status Dropdown (`AdminDashboard.tsx`)
- On **"חדש" (New)** and **"בטיפול" (In-Progress)** ticket cards, append option:
  - `<option value="backlog">📥 העבר לבקלוג</option>`
- On **"טופל" / "בוטל" (Closed/Resolved)** ticket cards:
  - Do **NOT** render `"העבר לבקלוג"`.

### 5.2 Tasks Backlog Board (`TasksBacklog.tsx`)
- Integrated with `@hello-pangea/dnd` for smooth drag-and-drop.
- **3 Columns**:
  1. 🔴 **חשוב ודחוף** (`important-urgent`) - Default placement at position 0.
  2. 🟠 **חשוב ולא דחוף** (`important-not-urgent`)
  3. 🟡 **לא חשוב ודחוף** (`not-important-urgent`)
- **Card Controls**:
  - Drag handle icon (`GripVertical`).
  - Ticket details (Ticket #, Urgency badge, Category, Location, Summary, Media preview).
  - Status dropdown containing:
    - `<option value="backlog">מצבור משימות</option>`
    - `<option value="open">חדש</option>`
    - `<option value="in-progress">בטיפול</option>`
    - `<option value="resolved">טופל</option>`
    - `<option value="dismissed">בוטל</option>`

---

## 6. Audit Explorer & Human-Readable Formatting (`AuditExplorer.tsx`)

Human-readable strings for Audit Explorer:

- **`TICKET_BACKLOG_MOVED`**:
  - Hebrew: `ישראל ישראלי העביר את פנייה #103 למצבור משימות (חשוב ודחוף)`
  - English: `Israel Israeli moved ticket #103 to Tasks Backlog (Important & Urgent)`

- **`BACKLOG_TICKET_REORDERED`**:
  - Hebrew: `ישראל ישראלי עדכן מיקום פנייה #103 במצבור משימות (חשוב ולא דחוף)`
  - English: `Israel Israeli updated priority of ticket #103 in Backlog (Important & Not Urgent)`

---

## 7. Success Metrics
- **Zero Triage Clutter**: Reduction in dormant tickets occupying daily active dashboard columns.
- **Sub-15 Second Backlogging**: Admins can backlog non-urgent issues in 1 click.
- **Data Integrity**: 100% audit log compliance for all backlog transactions.
