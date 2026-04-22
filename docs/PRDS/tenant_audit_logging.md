# PRD: Tenant-Scoped Audit Logging & Product Intelligence

## 1. Status & Ownership
| Field | Details |
| :--- | :--- |
| **Version** | v2.0 (B2B Refined) |
| **Status** | Approved |
| **Owner** | Oren B. (Superadmin) |
| **Engineering Lead** | Antigravity AI |
| **Last Updated** | 2026-04-19 |

## 2. Problem Statement
**The Opportunity**: TikTak currently lacks a formal record of administrative operations across its growing tenant base. While the platform manages maintenance efficiently, the business team has no visibility into *how* building managers utilize the tool. 
**The Risk**: Without structured auditing, the Superadmin cannot provide forensic support during tenant disputes or identify behavioral patterns that suggest the need for new features or UX improvements.

## 3. Goals & Non-Goals

### Goals
- **Platform Integrity**: Capture every mutable action and login event across all 1,000+ potential tenants.
- **Product Intelligence**: Store detailed `changes` (previous vs new) to allow for app-tuning and the development of future AI-driven management suggestions.
- **Automated Lifecycle**: Implement a hands-off, 7-year retention policy using Firestore TTL.
- **Strict Isolation**: Maintain TikTak's core principle of data isolation (Building A never sees Building B).

### Non-Goals
- **Customer-Facing Logs**: This is strictly an internal Superadmin tool; building managers will not see these logs.
- **Performance Auditing**: This is not an Application Performance Monitoring (APM) tool; we are logging business actions, not server response times.

## 4. User Stories

| ID | User Role | Description | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **US.1** | Superadmin | I want to view a global feed of critical actions across all tenants. | Can query `auditLogs` collection group, filtered by `tenantId`. |
| **US.2** | Superadmin | I want to see exactly what changed during a ticket update. | Logs include `previousValue` and `newValue` for transparency. |
| **US.3** | Superadmin | I want to identify which buildings are most active. | Logs are aggregated and filterable by `action` type and `tenantId`. |
| **US.4** | System | I want logs older than 7 years to disappear automatically. | Documents include `expireAt` field and follow Firestore TTL policy. |

## 5. Analytics & Success Metrics
Instead of just "capturing data," the success of this system is measured by its utility for **Product Growth**:

- **Optimization Rate**: Using logs to identify "friction points" (e.g., frequent status reversals) to suggest UI changes.
- **Feature Discovery**: Identifying top-used actions to prioritize the next set of P0 features.
- **MTTI (Mean Time to Investigation)**: Reduction in time taken to resolve internal tenant queries regarding "who changed what."

## 6. Functional Requirements & Schema
**Storage Target**: `tenants/{tenantId}/auditLogs/{logId}`

### Schema (JSON Format)
As specified by the user, ensuring full context including `actor` identity, `sessionId`, and `appId`.

```json
{
    "id": "string",
    "details": { "ticketId": "string", "changes": "object" },
    "createdAt": "ISO_8601",
    "expireAt": "TIMESTAMP (7 Years)",
    "level": "INFO | WARN | ERROR",
    "actor": { "uid": "string", "name": "string", "email": "string" },
    "sessionId": "string",
    "action": "TICKET_CREATED | TICKET_STATUS_UPDATE | TICKET_URGENCY_UPDATE | COMMENT_CREATED | COMMENT_DELETED | USER_ADDED | USER_DELETED | USER_UPDATE | CONFIGURATION_UPDATE | LOGIN",
    "targetResource": "string",
    "metadata": { "tenantId": "string", "userAgent": "string" },
    "changes": { "newValue": "object", "previousValue": "object" }
}
```

## 7. Next Steps
1. **Technical Design Document (TDD)**: Map these requirements to Firestore Collection Group Indexing and the top-level `globalAdmins` identity check.
2. **Implementation**: Integrate `logAuditAction` utility into the Admin Dashboard.
