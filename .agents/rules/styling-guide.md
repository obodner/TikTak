---
trigger: always_on
---

# TikTak Styling Guide

This guide documents the UI/UX standards, design tokens, and component patterns for the **TikTak** building maintenance application.

## 1. Design Philosophy
- **Radical Simplicity (The 5-to-2 Rule)**: Prioritize reducing the reporting flow from five actions to two (Scan -> Report).
- **Zero-Friction Reporting**: Eliminate logins, app downloads, and onboarding to ensure a sub-15-second "Snap & Send" experience for Israeli residents.
- **QA-Driven Oversight**: Provide high information density and clear status tracking for the administrative "Vaad" dashboard, utilizing Linor's Senior QA standards.
- **Montessori Minimalism**: Maintain an orderly, purposeful interface where every element has a specific function.
- **RTL-Native**: Full native support for Hebrew (RTL) as the primary interface.

## 2. Color Palette

### Base Colors
- **Main Background**: `#F8FAFC` (`bg-slate-50`)
- **Card/Surface**: `#FFFFFF` (`bg-white`)
- **Borders**: `#E2E8F0` (`border-slate-200`)

### Primary & Feedback
- **TikTak Action (Blue Theme)**: 
    - Active Background: `bg-blue-600`
    - Interaction: `hover:bg-blue-700` / `active:bg-blue-800`
- **Status & Urgency**:
    - **Success/Fixed**: `text-green-600` / `bg-green-50`
    - **Urgent/Alert**: `text-red-600` / `bg-red-50` (e.g., elevator failures or safety hazards).
    - **Pending**: `text-amber-600` / `bg-amber-50`

## 3. Typography
- **Primary Font**: `Heebo` or `Assistant` (Standard Hebrew sans-serif optimized for Israeli mobile users).
- **Hierarchy**:
    - **H1/Reporting Titles**: `text-2xl` or `text-3xl`, `font-extrabold` (Optimized for rapid reading on mobile devices).
    - **H2/Admin Headers**: `text-lg`, `font-bold`, `border-bottom` (For clear sectioning in the management dashboard).
    - **Body**: `text-base` for residents; `text-sm` for admin tables to maximize data density for QA reviews.

## 4. Components

### Reporter Interface (Mobile-First)
- **The "Hero" Trigger**: A massive 1-click camera button using `bg-blue-600`, `rounded-2xl`, and `shadow-xl` to trigger the native camera immediately.
- **Category Pills**: Large, touch-friendly `rounded-full` selectors (min 44x44px) for categories like "Electrical," "Cleaning," or "Plumbing".

### Admin Dashboard (Desktop Management)
- **Ticket Cards**: Standard `bg-white` cards with `rounded-md` borders and 1:1 aspect ratio thumbnails for visual triaging.
- **WhatsApp Bridge**: A dedicated `.wa-link` button that initiates a pre-formatted chat with the reporter using `wa.me`.

## 5. Animations & Effects
- **Tactile Feedback**: A brief `scale-95` transition on all mobile buttons to simulate a physical "TikTak" click.
- **Haptic Confirmation**: Utilize the `navigator.vibrate` API upon successful report submission to provide physical confirmation.
- **Ghost Loading**: Use skeleton loaders (`animate-pulse`) for the admin dashboard to maintain the feeling of speed.

## 6. Layout
- **Reporter Flow**: A single-column, "frozen" mobile layout with zero scrolling required for the primary reporting action.
- **Admin Dashboard**: A high-density grid or list view optimized for quick root cause analysis (RCA).
- **RTL Support**: All layouts must automatically flip to RTL when the Hebrew locale is active.

## 7. Delivery Standards
- **WhatsApp Integration**: All report data is summarized into a single, concise string for the `wa.me` redirect.
- **Print Optimization**: Optimized `.no-print` classes to hide digital-only buttons when generating building notice QR signs.