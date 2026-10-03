# User Guide - TikTak 🚀

Welcome to **TikTak**, the fastest and most advanced solution for reporting and managing maintenance issues.
The system is designed around the principle of **"Minimum Friction, Maximum Efficiency"**, allowing you to report in seconds with no app download and no password required — just your phone.

---

## 1. Resident Guide (Reporting Issues)
Report any maintenance issue in under 15 seconds.

### Step 1: Scan & ID
1. Find the **TikTak QR code** and scan it with your camera or click the direct link provided by your manager.
2. **Identification**: When submitting your first report, you will be asked to enter your phone number. The system will remember it for future reports and verify it against the building's authorized resident list (Whitelist). No password is required.

### Step 2: Choose Your Reporting Flow
TikTak offers three distinct reporting flows to match different scenarios:

1. **AI Visual Flow (Snap & Send) 📸**:
   - **How it works**: Click the camera button, snap a photo of the issue, and let the integrated **Artificial Intelligence (Gemini 2.5 Flash)** analyze it.
   - **AI Automation**: The AI automatically extracts the category, suggests a short summary, and determines the initial urgency. You only need to verify and submit.
   - **Best for**: Any physical, visible maintenance issue (e.g., broken tiles, leaks, burnt bulbs, damaged doors).

2. **QuickTap Flow (Instant Report) ⚡**:
   - **How it works**: If enabled by your building manager, you will see a scrollable list of quick reporting buttons between the main action buttons. Simply tap the relevant issue (e.g., "Elevator Light Out" or "Trash in Lobby").
   - **No Photo Required**: Bypasses the camera and AI analysis completely. A confirmation window will appear showing pre-set location and details.
   - **Zero Friction**: Allows you to report common, recurring building issues in **under 5 seconds** (Scan -> Tap Pill -> Tap Send).

3. **Manual Flow (Standard Form) ✏️**:
   - **How it works**: Click the manual report button below the camera button to open the report form.
   - **Voice Recording Support**: Inside the form, you can record a short voice description (up to 10 seconds) using the microphone icon. Speaking clearly is recommended as voice recordings are stored as audio for the manager to listen to (not transcribed).
   - **Best for**: Non-visual issues that are hard to capture in a photo (e.g., strange noises from the elevator, bad smells in the hallway, water pressure issues, or security/communication complaints).

### Step 3: Refine Details
Verify these details before sending:
1. **Primary Location**: (e.g., Floor or Wing).
2. **Sub-Location**: (e.g., Lobby, parking spot, or specific apartment area).
3. **Category**: Ensure the category is correct. Tap the category to change it if needed.

### Step 4: Submit & Automated Notifications
1. Click the **Submit Report** button at the bottom.
2. **Backend-Triggered WhatsApp Messages**: TikTak uses a paid, professional WhatsApp Business API tier. Unlike the free tier, **all messages are triggered automatically by the backend server**:
   - **No Client Redirects**: You do *not* need to open WhatsApp or manually press "Send" to submit your ticket.
   - **Immediate Receipt Confirmation**: As soon as you click submit, our backend automatically sends a WhatsApp confirmation message directly to your phone containing your ticket details and confirming that it has been received.
   - **Status Change Updates**: Whenever the building committee updates the status of your ticket (e.g., moving it from *New* to *In Progress* or *Resolved*), the system instantly triggers a WhatsApp notification to keep you updated.
   - **SLA Stagnation Reminders**: If your ticket remains in a pending state without updates, the system automatically sends gentle "We are on it" WhatsApp updates at set intervals (after 2, 5, and 9 working days) to maintain total transparency.

---

## 2. Manager Guide

### Admin Dashboard
- **Dynamic Control Panel**: View all reports and filter by urgency or status. **Note**: Any filter you apply will reflect in real-time in the statistics panels (Pie/Bar Charts) above.
- **Drag & Drop Status Updates**: Drag any ticket card between columns (*New*, *In Progress*, *Resolved*) to update its status instantly. This action is automatically recorded in the Audit Log.
- **Instant WhatsApp Status Updates**: Thanks to our paid WhatsApp Business API tier, dragging a ticket to a new column or saving a status change automatically triggers a branded update notification to the reporting resident in real-time. Admins do not have to perform any manual steps or send messages.
- **QuickTap Identification**: Tickets submitted via the instant reporting flow are marked with a prominent blue tag: **⚡ QuickTap**. This helps you distinguish "one-click" reports from those requiring full manual or visual review.
- **Ticket Analysis**: Click on any ticket to view the image or listen to the voice recording.
- **Voice Playback**: We recommend using headphones when reviewing voice reports in shared spaces.

### SLA & Color Coding System (Traffic Light Indicator)
To ensure no resident reports are neglected and to maintain service standards, the dashboard features an automated **SLA (Service Level Agreement)** tracker on every ticket card:
- **Working Days Calculation**: The system automatically tracks how long a ticket has been stagnating in its current state (*New* or *In Progress*). The calculation strictly counts **working days**—automatically excluding weekends (e.g., Friday-Saturday in Israel) and national holidays.
- **Color Indications and Meaning**:
  - ⚪ **No Color (White)**: Standard/Recent ticket. The ticket has spent less than 2 working days in its current state.
  - 💛 **Yellow (`bg-yellow-50`)**: **Low Stagnation (2 Working Days)**. The ticket has spent 2 working days in its current state. The system automatically sends a "Working on assigning" WhatsApp reminder to the reporter.
  - 🧡 **Orange (`bg-orange-50`)**: **Medium Stagnation (5 Working Days)**. The ticket has spent 5 working days in its current state. The system sends a "Being handled, thank you for your patience" WhatsApp update.
  - ❤️ **Red (`bg-red-50`)**: **High Stagnation (9 Working Days)**. The ticket has spent 9 or more working days in its current state without resolution or progress. Indicates a critical delay requiring immediate attention.

### Tenant Settings
1. **Permissions (CSV Upload) - System Heart**: Upload a CSV with resident names and phone numbers. **This is the most critical configuration in the system** — it acts as the primary authenticator (Whitelist).
2. **User Management (Admin Users)**: Add, edit, or delete additional administrators with access to the system.
3. **Labeling & Branding**: Change the display name and customize location labels (e.g., "Floor" vs. "Area").
4. **Data Configuration**: Update the lists of locations and categories relevant to your building.
5. **QuickTap Setup**: Configure up to 5 "QuickTap" buttons for common issues to enable ultra-fast, 2-click reporting for residents.

---

## 3. SuperAdmin Guide (God's Eye View & Multi-Tenant Licensing) 👑
The **God's Eye View** interface at `/admin/god-view` grants system administrators full centralized control over all tenants, multi-building fleets, and licensing configurations across the TikTak ecosystem.

### Centralized Tenants Table (High-Density View)
- **Hierarchy & Structure**: Displays all tenants sorted alphabetically. Multi-building fleets appear as expandable parent rows (Accordion) revealing all associated child buildings underneath.
- **Table Columns**:
  - **Name & Slug**: Organization name, unique `tenantId` slug, and type badges (Building, Municipality, Fleet Master, or Fleet Child).
  - **Registered Admins**: Admin count pill with an interactive popup displaying names, emails, and phone numbers for every authorized admin.
  - **TikTak Tickets (Monthly)**: Color-coded progress gauge showing incident ticket consumption for the active calendar month (Green = Healthy, Amber = 80%, Red = 100%+ Overage).
  - **RFQ Procurement Bank (Annual)**: Annual quota gauge showing contractor quote requests used against the purchased annual credit bank, alongside the exact license expiration date.
  - **Creation & Last Login Dates**: Displayed in strict, unambiguous format (`DD/MM/YYYY HH:mm`), replacing vague relative wording.
  - **Status**: Live badge indicating Active (`bg-emerald-50 text-emerald-700`) vs. Frozen (`bg-slate-100 text-slate-600`).
  - **Actions (••• Menu)**: Quick actions guarded by designated confirmation modals.

### Onboard Tenant & Fleet Wizard
Clicking **"New Tenant / Fleet"** launches a 5-step guided provisioning wizard, retiring CLI scripts:
1. **Entity Type Selection**: Choose between a Single Tenant (Building / Municipality) or Multi-Building Fleet.
2. **Entity Details & Slugs**: Names, physical addresses, and auto-generated URL slugs with real-time uniqueness validation. In Fleet mode, add child buildings dynamically.
3. **Dual Licensing Configuration**:
   - **TikTak Incidents**: Monthly quota (10, 30, 75, 150, or Unlimited), enforcement mode (Hard / Soft), and per-ticket overage fee.
   - **RFQ Procurement Bank**: Annual credit tier (Starter 3, Basic 6, Standard 12, Growth 25, Enterprise 50), per-quote overage fee, and annual expiration date (defaults to 12 months ahead).
4. **Primary Admin Onboarding**: Admin first name, last name, mobile phone, and email. The system automatically creates an Auth account and generates a secure password reset link.
5. **Handoff & WhatsApp Invite Generator**: Instant access to the dashboard URL and a 1-click **"Copy WhatsApp Message to Admin"** button with a pre-formatted invitation ready to send to the new manager.

### Table Actions & Governance
- **Switch to Tenant Dashboard**: Direct 1-click navigation to the tenant's admin dashboard without modal friction.
- **Update Ticket / RFQ Licensing**: Focused modals to upgrade tiers, modify quota banks, or extend expiration dates in real time.
- **Freeze / Unfreeze Tenant**: Instantly revoke or restore access with confirmation safety guards.
- **Permanent Tenant Deletion**: Two-step destruction safeguard requiring typing the exact `tenantId` to permanently purge Firestore records, GCS images, and Firebase Auth users.

### Automated Quota & Expiration Notification Engine
- **RFQ Consumption Alerts (80% and 100%)**: Automatically broadcasts WhatsApp alerts to all registered admins (and parent fleet managers) upon reaching 80% and 100% of the annual credit bank, with deduplication timestamps.
- **Annual License Expiration Cron**: A daily Cloud Scheduler task running at 06:00 UTC scans active tenants and dispatches WhatsApp alerts at **30 days**, **7 days**, and **day of expiration** to ensure uninterrupted service.

---

## Privacy & Data Handling 🔒
* Photos and voice recordings are stored securely and are automatically deleted after **1 year**.
* Phone numbers are used only for ticket authentication and direct communication with the maintenance team.
* No data is shared with third parties.

---
**TikTak - Snap. Send. Solved.** 🏁
