# TDD: Tenant-Scoped Audit Logging & Product Intelligence

This document outlines the high-level technical architecture for implementing the distributive audit log system in TikTak.

## 1. Data Architecture

### 1.1 Firestore Storage Strategy
Logs will be stored in a **tenant-scoped** sub-collection to maintain strict data isolation and simplify per-tenant data management.

- **Collection Path**: `tenants/{tenantId}/auditLogs/{logId}`
- **TTL Configuration**: An `expireAt` field (Firestore Timestamp) will be added to every document.
- **Index Requirement**: A **Collection Group Index** is required for the `auditLogs` collection to enable the Superadmin to query across all tenants.

### 1.2 Document Schema (TypeScript)
```typescript
interface AuditLog {
  id: string;
  action: 'TICKET_CREATED' | 'TICKET_STATUS_UPDATE' | 'TICKET_URGENCY_UPDATE' | 'COMMENT_CREATED' | 'COMMENT_DELETED' | 'USER_ADDED' | 'USER_DELETED' | 'USER_UPDATE' | 'CONFIGURATION_UPDATE' | 'LOGIN';
  level: 'INFO' | 'WARN' | 'ERROR';
  actor: {
    uid: string;
    name: string;
    email: string;
  };
  details: {
    ticketId?: string;
    [key: string]: any;
  };
  changes: {
    previousValue: any;
    newValue: any;
  } | null;
  metadata: {
    tenantId: string;
    userAgent: string;
    platform: string;
    language: string;
  };
  createdAt: string; // ISO String for UI
  expireAt: Date;   // Firestore Date for TTL
  appId: 'tiktak';
  sessionId: string;
}
```

## 2. Component Design

### 2.1 AuditLogger Utility (`src/utils/auditLogger.ts`)
A centralized service to handle log creation.
- **Method**: `logAction(tenantId, action, actor, details, changes)`
- **Responsibility**: Calculates `expireAt`, gathers browser metadata, and performs the Firestore `addDoc`.

### 2.2 Role-Based Access Control (RBAC)
- **Data Source**: A top-level `/globalAdmins/{uid}` collection.
- **Visibility**: `AdminDashboard` will check if `user.uid` exists in this global collection to determine Superadmin status.

### 2.3 Superadmin Dashboard (`src/pages/admin/SuperadminAudit.tsx`)
A new high-density page dedicated to log inspection.
- **Data Fetching**: Uses `query(collectionGroup(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(50))`.
- **Filtering**: Localized filtering for `tenantId` and `actionType`.

## 3. Security Rules
```firestore
function isSuperAdmin() {
  return exists(/databases/$(database)/documents/globalAdmins/$(request.auth.uid));
}

match /tenants/{tenantId}/auditLogs/{logId} {
  // Superadmins or Tenant Managers can read
  allow read: if isSuperAdmin() || (request.auth != null && request.auth.uid in get(/databases/$(database)/documents/tenants/$(tenantId)).data.adminUids);
  // Log creation is allowed for authenticated admins
  allow create: if request.auth != null && (isSuperAdmin() || request.auth.uid in get(/databases/$(database)/documents/tenants/$(tenantId)).data.adminUids);
  allow update, delete: if false;
}
```

## 4. Implementation Phases

1. **Phase 1: Foundation**: Update Firestore Rules and create the `AuditLogger` utility.
2. **Phase 2: Instrumentation**: Integrate `logAction` calls into existing status/urgency/comment handlers.
3. **Phase 3: Superadmin UI**: Build the global audit dashboard and roles-based navigation.
4. **Phase 4: Retention**: Enable TTL in the Google Cloud Console.

## 5. Success Criteria
- [ ] Logs appearing in Firestore `auditLogs` sub-collections after actions.
- [ ] Superadmin dashboard correctly pulls logs from multiple tenants.
- [ ] Deleting a tenant manager does NOT delete the audit logs they created.
