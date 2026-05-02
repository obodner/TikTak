# Technical Design Document: God's Eye View

**Feature**: Global Admin Visibility & Centralized Audit
**Author**: Antigravity (TikTak Architect)
**Date**: 2026-05-01

## 1. System Overview
Transition TikTak from a purely decentralized audit model to a hybrid model where a centralized `audit_logs` root collection provides platform-wide forensics for Super Admins while maintaining strict data isolation for regular committee members.

## 2. Identity Architecture (Super Admin)
We will utilize **Firebase Auth Custom Claims** to define roles.
-   **Claim**: `{ role: 'super' }`
-   **Enforcement**: 
    -   `AdminLayout.tsx` checks `idTokenResult.claims.role === 'super'` to enable global navigation.
    -   Security Rules use `request.auth.token.role == 'super'`.

### Implementation (Admin Promotion)
A one-time utility script (or Firebase Function) will be used to promote Oren's UID:
```typescript
admin.auth().setCustomUserClaims(uid, { role: 'super' });
```

## 3. Data Schema: Centralized Audit Logs
**Collection Path**: `/audit_logs/{logId}`

| Field | Type | Description |
| :--- | :--- | :--- |
| `tenantId` | `string` | **[MANDATORY TOP-LEVEL]** The ID of the building where the action occurred. |
| `action` | `string` | The event type (e.g., `TICKET_STATUS_UPDATE`). |
| `level` | `string` | Log level (INFO, WARN, ERROR). |
| `actor` | `map` | `uid`, `name`, `email`, `type`. |
| `details` | `map` | Full metadata of the associated entity (Ticket info, User info). |
| `changes` | `map` | `previousValue` and `newValue`. |
| `metadata` | `map` | Browser/Session metadata (already includes `tenantId`). |
| `createdAt` | `string` | ISO timestamp for sorting. |
| `expireAt` | `timestamp` | 7-year TTL for automatic deletion. |
| `appId` | `string` | Constant 'tiktak'. |
| `sessionId` | `string` | Session identifier. |

### Indexing Requirements
To support global filtering, a composite index is required:
-   `action` ASC, `createdAt` DESC
-   `tenantId` ASC, `createdAt` DESC
-   `actor.email` ASC, `createdAt` DESC

## 4. Frontend Architecture
### 4.1 `SuperAdminDashboard.tsx`
-   **Role**: Entry point for global management.
-   **Route**: `/super-admin`.
-   **Components**:
    -   `TenantList`: Fetches all docs from `tenants` collection.
    -   `AuditExplorer`: The primary log viewer.

### 4.2 `AuditExplorer.tsx`
-   **Filtering Logic**: State-driven query builder for Firestore.
-   **LogItem**: Renders human-readable text with an "Eye" icon to toggle a JSON tree viewer.
-   **Rendering Mapper**: 
    -   `TICKET_STATUS_UPDATE` -> `"{actor.name} changed ticket #{details.ticketNumber} to {details.newStatus}"`.

## 5. Security Rules (Firestore)
```javascript
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Centralized Audit Logs
    match /audit_logs/{logId} {
      // Super Admins can see everything
      allow read: if request.auth.token.role == 'super';
      
      // Regular Admins can see their own tenant logs
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/tenants/$(resource.data.tenantId)).data.adminUids.has(request.auth.uid);
        
      // Only system can write (via auditLogger utility)
      allow create: if request.auth != null; 
    }
    
    // Global Tenant Access
    match /tenants/{tenantId} {
      allow read, write: if request.auth.token.role == 'super';
    }
  }
}
```

## 6. Migration Plan
1.  **Refactor `auditLogger.ts`**: Update the `logAction` function to write to `/audit_logs`.
2.  **Backfill (Optional)**: A script to move existing logs from `tenants/{id}/auditLogs` to root.
3.  **Deploy Rules**: Push updated security rules to support the new root collection.
