# PRD: TikTak Multi-Tenant Entity Evolution

**Status**: Draft (User Review Required)
**Version**: 1.1.0
**Target**: Scalability & Market Expansion (Municipalities, Buildings, Malls)

---

## 1. Executive Summary
TikTak is evolving from a building-specific maintenance tool to a generic, multi-tenant "Community Reporting" framework. This PRD outlines the structural shift from a `building`-centric architecture to a `tenant`-centric architecture.

## 2. Problem Statement
The current naming convention (`buildingId`, `buildings` collection) and hardcoded UI terminology ("Floor") limit TikTak's market fit for non-residential entities like municipalities, schools, or commercial centers.

## 3. Goals
- **Generic Architecture**: Support any entity type (Building, City, Campus).
- **Dynamic Context**: Allow tenants to define their own reporting hierarchy (e.g., Neighborhoods instead of Floors).
- **Brand Consistency**: Maintain the "Snap & Send" speed while adapting to different scales.

## 4. Proposed Changes

### 4.1 Data Schema Migration
- **Root Collection**: Rename `buildings` to `tenants`.
- **Identifier**: Replace `buildingId` with `tenantId` across all APIs, URL parameters, and database references.
- **Entity Identification**: Add a `type` field (`building` | `municipality`) to determine default logic.

### 4.2 Dynamic UI Metadata (`uiConfig`)
Every tenant will have a configuration block that defines the frontend terminology:
- `locationLabel`: "קומה" (Floor) or "שכונה" (Neighborhood).
- `resourceLabel`: "אזור" (Area) or "רחוב" (Street).
- `showLocation`: Toggle whether the location field is mandatory or visible.

### 4.3 AI Contextualization
Update the backend AI prompt to ingest the `tenantType`. 
- **Example**: If `type === 'municipality'`, the AI focuses on public hazards (potholes, street lights). If `type === 'building'`, it focuses on residential maintenance (leaks, bulbs).

## 5. Migration Strategy
1.  **Backend Migration**: Immediate switch to `tenantId`.
2.  **Firestore Refactor**: Scripted migration of documents from `buildings` to `tenants`.
3.  **Frontend URL Mapping**: Update routing from `/r/:buildingId` to `/report/:tenantId`.

## 6. Functional Requirements

### 6.1 Generic Trigger
- The CTA buttons ("Snap") and ("Manual") remain the same, but the microcopy can be customized per tenant type.

### 6.2 Metadata-Driven Form
- The `ReportingForm` will fetch labels from `tenantInfo.uiConfig`. 
- **Building logic**: "בחר קומה"
- **Municipality logic**: "בחר שכונה"

## 7. Success Metrics
- **Configurability**: Ability to onboard a new Municipality in < 5 minutes via the Admin Dashboard.
- **Backwards Compatibility**: Zero breakage for existing residents in the `buildings` collection during migration.
