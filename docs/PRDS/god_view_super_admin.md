# PRD: God's Eye View (Super Admin & Global Audit)

**Status**: Draft
**Owner**: Oren B.
**Version**: 1.0

## 1. Problem Statement
The TikTak platform currently operates on a strict multi-tenant model. While this is excellent for tenant privacy, it creates significant friction for platform operators (Super Admins) who need to:
1.  Monitor system-wide health and activity.
2.  Perform cross-tenant forensic analysis.
3.  Support multiple buildings without manual role assignment to each committee.
4.  Track audit logs that are currently decentralized and difficult to query globally.

## 2. Goals & Non-Goals
### Goals
-   Implement a system-wide "Super Admin" role using Firebase Auth Custom Claims.
-   Centralize all audit logs into a root `audit_logs` collection for rapid, global filtering.
-   Create a "God's Eye View" dashboard with advanced forensic-grade filtering.
-   Maintain strict data isolation for regular admins while granting Super Admins full visibility.

### Non-Goals
-   Providing public-facing analytics.
-   Changing the resident reporting flow.
-   Modifying the billing or payment infrastructure (out of scope for MVP).

## 3. User Stories
| ID | User Story | Acceptance Criteria |
| :--- | :--- | :--- |
| **US.1** | As a Super Admin, I want to access any tenant dashboard without being an explicit member of their committee. | - Admin dashboard bypasses `adminUids` check if `token.role == 'super'`. |
| **US.2** | As a Super Admin, I want a global feed of every action taken in the system. | - New centralized `audit_logs` collection populated by all actions. |
| **US.3** | As a Super Admin, I want to filter the global feed by tenant, actor, or specific ticket attributes (urgency, category, etc.). | - Filter bar supports 10+ fields. - Results update in real-time or near-real-time. |
| **US.4** | As a Super Admin, I want to view the raw JSON of any log entry for debugging. | - "Eye" icon toggle on each log entry to expand JSON view. |

## 4. Functional Requirements
### 4.1 Security & Identity
-   **Super Admin Claim**: Users with `request.auth.token.role == 'super'` gain read access to all `tenants` and `audit_logs`.
-   **Security Rules**: Firestore rules updated to enforce `tenantId` isolation for regular admins but allow global access for Super Admins.

### 4.2 Data Architecture
-   **Centralized Audit Logs**: `audit_logs` root collection.
-   **Fields per Record**:
    -   `tenantId` (**MANDATORY TOP-LEVEL**), `action`, `level`, `actor`, `createdAt`.
    -   `details`: (includes `category`, `urgency`, `location`, `status`, `hasImg`, `hasAudio`).
    -   `changes`: (previous vs new values).
    -   `metadata`: (existing browser/session context).

### 4.3 Super Admin Interface
-   **Tenant Browser**: List/Search all buildings.
-   **Audit Explorer**:
    -   Timeline, Actor, Action filters.
    -   Ticket-specific filters: Category, Location, Sub-location, Urgency, Status, Media presence.
    -   Human-readable event strings (e.g., "Oren added a new comment in Building X").

## 5. Analytics & Success Metrics
-   **MTTR (Mean Time to Resolution)**: Reduction in time spent investigating cross-tenant bugs.
-   **Administrative Efficiency**: Number of tenant-switching actions avoided per day.
