# PRD: TikTak Admin Collapsible Sidebar & Navigation Architecture

**Document Status**: Updated - Ready for Review & Approval  
**Author**: Lead UI/UX & Frontend Engineer  
**Stakeholder**: Oren Bodner (Lead Architect & QA Lead)  
**Target Release**: TikTak Admin Modernization (V2 Navigation)  
**Date**: September 2026  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context
TikTak's Admin Portal (`/admin/:tenantId/*`) currently utilizes a horizontal top navbar (`AdminNavbar.tsx`) spanning across the top of the viewport. As TikTak expands its feature set (Fleet Management, Tasks Backlog, granular Settings tabs, and upcoming Notifications & Support modules), the horizontal layout faces critical UI/UX limitations:
1. **Vertical Real Estate Degradation**: The 72px–104px sticky top bars consume valuable vertical height needed for high-density tables, kanban ticket columns, and metrics cards on widescreen displays (16:9 / 16:10).
2. **Navigation Hierarchy Compression**: The three sub-tabs of Settings ("Infrastructure & Resources", "Admins & Vendors", and "General Settings") are currently tucked away inside the settings page without direct deep-linking from the main shell.
3. **Horizontal Congestion**: Adding upcoming modules (Notifications, Contact & Support, God View, Fleet) clutters the horizontal header, forcing truncated tenant names and cramped action pills.

### 1.2 Proposed Solution
Transition the desktop/tablet interface (`md:` breakpoint and above) to a **collapsible vertical Sidebar navigation** positioned naturally at the start edge (Right side for Hebrew/RTL, Left side for English/LTR), while **strictly preserving the current mobile top-bar + drawer behavior on small screens**.

---

## 2. Core Principles & Constraints

1. **RTL-Native & Language-Aware**:
   - Hebrew (`he`): Sidebar is anchored on the **right** side of the screen; text is aligned right; chevron icons face appropriate RTL directions.
   - English (`en`): Sidebar is anchored on the **left** side of the screen; text is aligned left.
2. **Radical Simplicity (The 5-to-2 Rule)**:
   - Instant 1-click access to any core screen or specific settings sub-tab.
   - Dual-mode sub-navigation: In-line Accordion in expanded mode, Flyout Popover in collapsed mode.
3. **Zero Impact on Mobile**:
   - Screens `< 768px` maintain the exact existing mobile top bar, tenant switcher, and slide-out hamburger drawer.
4. **Monochrome / Black & White Iconography**:
   - Strictly NO WhatsApp-green or multi-colored app badges.
   - Clean, elegant monochrome design (Slate-400 inactive, White active, subtle Slate-800 borders) matching TikTak's dark luxury admin aesthetic.

---

## 3. Detailed Functional Requirements

### 3.1 Sidebar Layout & States (Desktop `md:`)

| Property | Expanded State | Collapsed State |
| :--- | :--- | :--- |
| **Width** | `w-64` (256px) | `w-18` (72px) |
| **Header** | TikTak Logo (full) + Tenant Selector + **Collapse Toggle Button** | Compact TikTak Monogram + **Expand Toggle Button** |
| **Toggle Position** | **Top/Header of the sidebar** (adjacent to brand/logo) | **Top/Header of the sidebar** |
| **Menu Items** | Icon + Label + Badge Counter | Icon only + Floating Tooltip on hover + Badge Dot |
| **Settings Submenu** | **In-line Accordion** (click to expand/collapse downward) | **Floating Flyout Popover** (click icon opens floating menu next to sidebar) |
| **Toggle Action** | Toggle button (`PanelRightClose` / `PanelLeftClose`) | Toggle button (`PanelRightOpen` / `PanelLeftOpen`) |
| **Persistence** | Preserved in `localStorage` (`tiktak_admin_sidebar_collapsed`) | Preserved in `localStorage` |

### 3.2 Header & Collapse Toggle Placement
- The collapse/expand toggle button is located directly in the **header section** at the top of the sidebar.
- In **Expanded mode**: Positioned at the inner corner of the header, allowing the admin to easily tuck away the sidebar into icon-only mode with one click.
- In **Collapsed mode**: Centered neatly beneath or beside the compact logo mark, with a tooltip ("הרחב תפריט" / "Expand menu").

### 3.3 Settings Submenu Behavior by Mode
1. **Expanded Mode (Accordion)**:
   - Clicking "הגדרות" toggles open an in-line nested list directly below the item, with a smooth chevron rotation.
   - Sub-items are indented with subtle visual connector guides:
     - 🏗️ **משאבי מבנה ותשתית** (Infrastructure & Resources) -> `/admin/:tenantId/settings?tab=infrastructure`
     - 👥 **ניהול מנהלים וספקים** (Admins & Vendors) -> `/admin/:tenantId/settings?tab=users`
     - ⚙️ **הגדרות כלליות** (General Settings) -> `/admin/:tenantId/settings?tab=general`
2. **Collapsed Mode (Flyout Popover)**:
   - Clicking the Settings icon opens an anchored **floating flyout menu** floating immediately beside the sidebar (to the left in RTL, to the right in LTR).
   - The flyout displays the header "הגדרות" followed by the 3 clickable sub-tabs.
   - Clicking outside or selecting a tab smoothly dismisses the flyout.

### 3.4 Navigation Items Hierarchy

1. **Dashboard (דשבורד)**:
   - Icon: `LayoutDashboard` (Monochrome)
   - Destination: `/admin/:tenantId/dashboard`
   - Badge: Live open tickets count (`dashboardCount`).
2. **Tasks Backlog (מצבור משימות)**:
   - Icon: `ListTodo` (Monochrome)
   - Destination: `/admin/:tenantId/backlog`
   - Badge: Live backlog tickets count (`backlogCount`).
3. **Settings (הגדרות)**:
   - Icon: `Settings` (Monochrome)
   - Behavior: Accordion (expanded mode) / Floating Flyout (collapsed mode).
   - Sub-items:
     - משאבי מבנה ותשתית (`?tab=infrastructure`)
     - ניהול מנהלים וספקים (`?tab=users`)
     - הגדרות כלליות (`?tab=general`)
4. **Fleet Overlook (דשבורד צי)** *(Conditional: if tenant is pool master / fleet member)*:
   - Icon: `Building2` (Monochrome)
   - Destination: `/admin/:tenantId/fleet`
5. **God View (מצב אל)** *(Conditional: if user has `super` role)*:
   - Icon: `Shield` (Monochrome)
   - Destination: `/admin/god-view`
6. **Notifications (התראות) [NEW]**:
   - Icon: `Bell` (Monochrome - Black & White, subtle badge indicator if pending)
   - Destination: Opens a slide-out drawer or modal with an elegant empty-state ("אין התראות חדשות כרגע" / "No new notifications").
7. **Contact Us / Support (צור קשר) [NEW]**:
   - Icon: `HelpCircle` or `MessageSquare` (Monochrome - strictly black & white, no green WhatsApp styling)
   - Destination: Opens contact & support modal (Support email, system info, emergency contact guidance).
8. **Sign Out (התנתק)**:
   - Icon: `LogOut` (Subtle red-hover, anchored at the bottom).

---

## 4. Architectural & Component Changes

```
frontend/src/
├── components/admin/
│   ├── AdminLayout.tsx            # Updated: Flex container hosting Sidebar + Content Area
│   ├── AdminSidebar.tsx           # NEW: Desktop collapsible sidebar (RTL/LTR, Header toggle, Flyout)
│   ├── AdminMobileHeader.tsx      # Retained: Dedicated mobile header & drawer (< 768px)
│   ├── NotificationsModal.tsx     # NEW: Placeholder modal / drawer for notifications
│   └── ContactModal.tsx           # NEW: Placeholder modal for support (Black & White)
└── pages/admin/
    └── TenantSettings.tsx         # Updated: Syncs active tab with `?tab=` URL search params
```

### 4.1 URL Deep-Linking for Settings Tabs
`TenantSettings.tsx` will read the active tab from `useSearchParams()`:
- `?tab=infrastructure` (default)
- `?tab=users`
- `?tab=general`
Clicking a sub-item from either the Accordion or the Collapsed Flyout calls `navigate('/admin/${tenantId}/settings?tab=${tabKey}')`, immediately synchronizing the tab without page reload.

---

## 5. UI/UX & Visual Styling Specifications

### 5.1 Color Palette & Theme Tokens
- **Sidebar Background**: Deep Slate (`bg-slate-900`) with subtle border separator (`border-slate-800`).
- **Interactive Item (Default)**: `text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all`.
- **Interactive Item (Active)**: `bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30`.
- **Submenu Items**: Indented with `ms-6`, smaller text (`text-xs font-semibold`), active item indicator pill.
- **Flyout Popover**: Dark floating surface (`bg-slate-900 border border-slate-700 shadow-2xl rounded-xl py-2 px-1 z-50 min-w-[200px]`).
- **Badges**:
  - Expanded: Clean pill (`bg-slate-800 text-slate-300 border border-slate-700` or `bg-white/20 text-white` when active).
  - Collapsed: Small floating dot indicator on the corner of the icon.
- **Icons**: Lucide React, stroke width 1.75px, neutral slate/white colors. Strictly no green WhatsApp branding.

### 5.2 Micro-Interactions & Transitions
- Transition width on collapse/expand: `transition-all duration-300 ease-in-out`.
- Chevron rotation on accordion toggle: `transition-transform duration-200 transform rotate-180`.
- Tooltips in collapsed mode: Subtle dark tooltip with `z-50 shadow-xl border border-slate-700`.

---

## 6. Acceptance Criteria (QA Test Matrix)

1. **Header Toggle**:
   - Collapse/Expand toggle is visible in the header of the sidebar.
   - Clicking it toggles between 256px and 72px smoothly.
   - State is stored in `localStorage` and persists across reloads.
2. **Flyout in Collapsed Mode**:
   - In collapsed mode (72px), clicking the Settings icon opens a floating flyout menu directly beside the sidebar.
   - Clicking any tab in the flyout navigates to `/settings?tab=[tab]` and automatically closes the flyout.
   - Clicking outside the flyout dismisses it.
3. **Accordion in Expanded Mode**:
   - In expanded mode (256px), clicking "הגדרות" toggles open the in-line accordion directly below the item.
4. **RTL / LTR Alignment**:
   - In Hebrew (`he`), the sidebar is positioned on the **right** edge; the flyout opens to its left.
   - In English (`en`), the sidebar is positioned on the **left** edge; the flyout opens to its right.
5. **Mobile Behavior Untouched**:
   - On viewport `< 768px`, no desktop sidebar is rendered. The existing top bar and drawer function identically to production.
6. **New Modules & Iconography**:
   - "התראות" and "צור קשר" render with black & white / monochrome icons and open placeholder modals.
