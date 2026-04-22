# PRD: TikTak Admin Dashboard & Multi-Tenant Firestore Schema

## 1. Problem Statement
The TikTak resident reporting flow ("Snap & Send") is operational and friction-free. However, the administrative side for the Committee (Vaad) is currently informal (delivered purely via WhatsApp). We need a dedicated administrative surface that allows the Vaad to configure their specific building attributes (floors, resources, categories) and track/analyze reported tickets systematically over time.

## 2. Multi-Tenant Architecture Principles
In strict adherence to the **TikTak Security & QA rules**, every building must act as an isolated tenant. Cross-building data spillage must be cryptographically blocked.

### High-Level Entity Model
- **`buildings` (Root Collection)**
  - Document ID: `[buildingId]`
  - Fields:
    - `name` (string)
    - `address` (string)
    - `vaadPhone` (string)
    - `config`:
      - `floors` (array of strings: e.g. ["-1", "0", "3", "4", "4A"]) -> Represents precisely the available floors in the UI selector regardless of skips.
      - `resources` (array of strings: e.g. ["Pool", "Lobby", "Elevator A"])
      - `categories` (array of strings) -> Default: ["Electrical", "Plumbing", "Elevator", "Cleaning", "Safety", "Other"].
    - `adminUids` (array of strings) -> Firebase Auth user IDs allowed to view this dashboard.
  - **`tickets` (Subcollection)** -> guarantees mathematical isolation.
    - Document ID: `[ticketId]` (Auto-generated)
    - Fields:
      - `status` (string enum: 'open', 'in-progress', 'resolved', 'dismissed')
      - `urgency` (string enum: 'High', 'Moderate', 'Low') -> Defined by the AI image analysis.
      - `category` (string)
      - `summary` (string)
      - `media`: `imageId` (string)
      - `context`:
        - `floor` (string)
        - `resource` (string)
      - `timestamps`: `createdAt`, `updatedAt`, `resolvedAt`

## 3. The Admin Dashboard UI Design (React/Vite)

### Key Screens
1. **Login Portal (`/admin/login`)**:
   - Simple Email/Password or Phone OTP via Firebase Auth.
2. **Global Analytics Overview (`/admin/:buildingId`)**:
   - **Metrics Cards**: 
      - Open Tickets (Red Alert if > 0).
      - Average Resolution Time.
   - **Donut Charts**:
      - Reports by Category (Electrical vs Plumbing).
      - Reports per Month.
3. **The Kanban Tracking Board (`/admin/:buildingId/board`)**:
   - Drag and drop columns for 'Open' -> 'In Progress' -> 'Resolved'.
   - Ticket Cards feature the AI Image natively mapped from Cloud Storage using our newly built router logic!
4. **Building Configuration (`/admin/:buildingId/settings`)**:
   - Simple Stepper UI to edit constraints natively into the `floors`, `resources`, and `categories` string arrays.

## 4. Success Metrics
- **Zero Data Leakage**: Standardized Security Rules (`firestore.rules`) enforcing that a user UID must exist in `adminUids` to read the `buildings/{buildingId}` data.
- **Sub-1s Load Time**: The dashboard utilizes Vite's blistering code-split rendering.
