# User Onboarding & Discovery Guide: TikTak
**Operational Playbook, Quick Start Guide, and Complete System Manual**

---

# Part 1: Quick Start Guide (QSG)

The Quick Start Guide provides immediate, actionable steps to get your first result with TikTak in minutes, differentiated by user role.

---

## 1. Admin Quick Start: Pre-Launch Checklist

> [!IMPORTANT]
> **Do not share the reporting link with residents before completing this checklist.**
> Setting up your building taxonomy, whitelist, and notification channels in advance ensures a smooth, frictionless launch for your community.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN PRE-LAUNCH PIPELINE                       │
│                                                                        │
│   [ 1. Upload CSV ] ──► [ 2. Set Taxonomy ] ──► [ 3. Setup QuickTap ]  │
│          │                                             │               │
│          ▼                                             ▼               │
│   [ 4. Verify Admins ] ──► [ 5. Test Submission ] ──► [ 6. Launch! ]   │
└────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Upload the Resident Whitelist (The Core Security Gate)
1. Navigate to **Tenant Settings** (`/admin/:tenantId/settings`) from the sidebar.
2. Go to the **Permissions / Whitelist** tab.
3. Prepare a CSV file containing your authorized residents with two columns: `Name` and `Phone` (e.g., `0501234567` or `+972501234567`).
4. Click **Upload CSV**.
5. *Why this matters*: TikTak uses silent phone number verification instead of passwords. Only numbers present on this whitelist will be authorized to submit tickets.

### Step 2: Configure Custom Building Taxonomy & Branding
1. In **Settings**, open the **Branding & Labels** tab.
2. Verify your building display name and address.
3. Customize your location terminology to match your property:
   - **Primary Location Label**: e.g., "Floor" (*קומה*), "Building Wing" (*אגף*), or "Street" (*רחוב*).
   - **Sub-Location Label**: e.g., "Area/Room" (*מקום*), "Apartment Area" (*סביבת דירה*), or "Parking Space" (*חניה*).
4. Populate your predefined locations list (e.g., Floors `-2, -1, 0, 1, 2...`) and sub-locations (e.g., "Lobby", "Elevator Hall", "Trash Room", "Parking Lot").

### Step 3: Configure QuickTap ⚡ Presets
1. In **Settings**, navigate to the **QuickTap Configuration** section.
2. Define up to **5 high-frequency building issues** (e.g., *"Elevator Light Out"*, *"Lobby Needs Cleaning"*, *"Main Entrance Gate Stuck"*, *"Sprinkler Leak"*).
3. Assign each preset a predefined Category and Location.
4. *Why this matters*: QuickTap bypasses the camera and AI analysis, allowing residents to report recurring issues in under 5 seconds with zero typing.

### Step 4: Add Committee Members & Verify Notification Phones
1. Under **Admin Users**, verify that all committee members or property managers have active administrative accounts.
2. Ensure each admin's phone number is correctly formatted with the international prefix (`+972...`).
3. *Why this matters*: The backend uses these phone numbers to push instant WhatsApp alerts whenever a resident submits a new ticket.

### Step 5: Perform an End-to-End Test Run
1. Open the resident reporting link on your mobile phone in private/incognito mode.
2. Submit a test ticket using your personal phone number.
3. Verify:
   - Your phone receives an immediate WhatsApp confirmation with ticket details.
   - The ticket instantly appears in the **New** column on your Admin Kanban board.
   - Admin committee members receive the new report notification on WhatsApp.
4. On your Admin board, drag the ticket to **Resolved**, select "Test / Dismissed", and verify your phone receives the status update message.

### Step 6: Distribute the Link to Residents
* **Direct Digital Link**: Share your building's unique direct web link via your community WhatsApp group, email newsletter, or resident portal.
* **Optional Physical QR Codes**: If desired, you may print notice signs featuring your direct link's QR code and place them near high-traffic common areas (lobby notice board, mail room, elevator entrance). Physical QR signs are an optional convenience and are not mandatory for operation.

---

## 2. Resident Quick Start: 3 Fast Reporting Routes

Residents can submit any building issue in seconds directly from their mobile browser without downloading an app or remembering passwords.

```
                  [ Open Resident Link ]
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
    [ Route A ]        [ Route B ]        [ Route C ]
    Snap & Send         QuickTap          Manual Form
    (AI Visual)         (1-Tap)          (Voice Note)
     Sub-15s             Sub-5s            Sub-20s
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
               [ Silent Phone Validation ]
                            │
                            ▼
          [ Instant WhatsApp Confirmation ]
```

### Route A: AI Visual Flow ("Snap & Send") — Best for Visible Defects
* **Recommended for**: Burnt bulbs, broken tiles, pipe leaks, damaged doors, trash hazards.
* **Step 1**: Open your building's TikTak link on your mobile phone.
* **Step 2**: Tap the large **Camera** button.
* **Step 3**: Point your camera at the issue and snap a photo.
* **Step 4**: TikTak's multimodal AI automatically analyzes the image, identifies the category, drafts a concise summary, and evaluates urgency.
* **Step 5**: Tap **Submit**. (Total time: under 15 seconds).

### Route B: QuickTap Flow ("Instant Report") — Best for Common Issues
* **Recommended for**: Recurring, predictable issues (e.g., lobby cleaning, corridor light out).
* **Step 1**: Open your building's TikTak link.
* **Step 2**: Tap the relevant quick-action button in the scrollable preset ribbon (e.g., *"Elevator Light Out"*).
* **Step 3**: Confirm the pre-filled location in the popup dialog and tap **Send**. (Total time: under 5 seconds, no photo needed).

### Route C: Manual Flow with Voice Notes — Best for Non-Visual Issues
* **Recommended for**: Strange motor noises, hallway odors, low water pressure, intercom glitches.
* **Step 1**: Open your building's TikTak link and tap **Manual Report**.
* **Step 2**: Select the category and floor/area.
* **Step 3**: Tap the **Microphone** icon to record a clear voice note (up to 10 seconds) describing what you hear or smell, or type a brief description.
* **Step 4**: Tap **Submit**.

---

# Part 2: Comprehensive User Manual

A formal, in-depth guide covering every capability, administrative setting, and operational workflow in the TikTak ecosystem.

---

## 3. Product Architecture & Operational Principles

### The "5-to-2 Rule"
Traditional maintenance reporting requires 5–8 friction-heavy steps: finding the right WhatsApp group, locating the committee contact, typing an essay, describing the location, and repeatedly asking for updates. TikTak reduces this entire sequence to two intuitive actions: **Open & Snap**.

### Silent Authentication
TikTak eliminates resident user accounts, passwords, and app downloads:
* When a resident submits their first report, they input their mobile phone number.
* The system verifies the number against the building's uploaded whitelist in real time.
* The resident's mobile browser securely caches the token for future frictionless submissions.
* Personal identity is never stored in public ticket documents, preserving zero-knowledge resident privacy.

---

## 4. Resident Workflows & Community Features

### Automated WhatsApp Communication Fabric
All notifications in TikTak are triggered automatically from the backend using the official WhatsApp Business API:
1. **Immediate Digital Receipt**: Within seconds of submission, the resident receives a formatted WhatsApp message containing the ticket number, summary, and location.
2. **Real-Time Status Milestones**: Whenever the committee updates a ticket (moving it to *In Progress* or *Resolved*), the resident receives an automated update detailing who is handling it.
3. **Proactive Reassurance Updates**: For complex repairs requiring parts or specialized technicians, the system proactively sends reassuring updates so residents know the issue has not been forgotten.
4. **Resolution Confirmation & CSAT Feedback**: Upon ticket closure, the resident receives a resolution message containing closure notes and an interactive rating prompt (🤩 *Excellent*, 👍 *Satisfactory*, 👎 *Dissatisfied*).

### "Me Too" (📢) Community Demand Multiplier
When multiple residents notice the same building issue (e.g., an elevator outage or main gate failure):
* Instead of filing duplicate tickets, residents viewing active issues can tap **"Me Too" (גם אצלי)**.
* The ticket counter increments dynamically on the admin dashboard, highlighting the community impact and urgency without cluttering the board with redundant tickets.

---

## 5. Admin Dashboard Workflows & Triage Operations

The Admin Dashboard (`/admin/:tenantId/dashboard`) provides a centralized operational hub designed for rapid, high-density triage.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN KANBAN BOARD TRIAGE                       │
│                                                                        │
│   [ ⚪ NEW (חדש) ]    ──►    [ 🟡 IN PROGRESS (בטיפול) ]  ──►  [ 🟢 RESOLVED (טופל) ] │
│   • Incoming Intake          • Contractor Dispatched           • Closure Reason       │
│   • SLA Working-Day Timer    • Resident Comments Pushed        • Audit Trail Logged   │
│   • Triage to Backlog (⤵)    • Auto Reassurance Alerts         • Quota Deductions     │
└────────────────────────────────────────────────────────────────────────┘
```

### The Kanban Board (Visual Task & Work Management)
The core dashboard is structured around an interactive Kanban board:
* **New (*חדש*)**: Unhandled incoming tickets.
* **In Progress (*בטיפול*)**: Tickets assigned to a committee member, under contractor review, or awaiting parts.
* **Resolved (*טופל*)**: Completed or closed tickets.
* **Drag-and-Drop Workflow**: Drag any ticket card between columns to update its status instantly. Every transition is automatically recorded in the system audit log.

### Closing Tickets & Quota Deductions
When dragging a ticket to **Resolved**, a resolution modal opens requiring:
1. **Closure Reason**:
   - `Fixed`: Issue successfully repaired.
   - `Duplicate`: Redundant report (automatically credited back to your monthly ticket quota).
   - `Outside Scope`: Municipal or private apartment issue outside building responsibility (automatically credited back).
   - `Test / Dismissed`: Internal test or invalid submission (automatically credited back).
   - `Vendor Dispatched`: Handed off to third-party warranty service.
2. **Resolution Note**: An optional message explaining what work was performed. This note is pushed directly to the reporting resident's WhatsApp.

### The Holiday-Aware SLA Engine & Traffic-Light Stagnation Cues
To guarantee issues are resolved in a timely manner, TikTak incorporates a localized working-day SLA calculator:
* **Working Days Only**: The engine strictly counts official working days (e.g., Sunday–Thursday in Israel), automatically skipping weekends and national holidays.
* **Traffic-Light Stagnation Thresholds**:
  * ⚪ **Normal (White Card)**: Under 2 working days in active state.
  * 🟡 **Low Stagnation (Yellow, 2–4 Working Days)**: Low-level alert indicating the ticket requires assignment or initial action.
  * 🧡 **Medium Stagnation (Orange, 5–8 Working Days)**: Moderate alert signaling delays.
  * ❤️ **Critical Stagnation (Red, 9+ Working Days)**: High-priority warning requiring immediate manager intervention.

### Proactive Resident Reassurance Messages
Complex repairs (e.g., rewiring an elevator controller or sourcing custom glass panels) often take several working days. When a ticket enters prolonged handling:
* The system prevents resident anxiety by proactively sending automated transparency notifications via WhatsApp.
* The message reassures the resident that the issue is actively being coordinated and provides peace of mind.
* This proactive mechanism eliminates repeated phone calls, stops angry messages in building chat groups, and prevents duplicate tickets.

### Internal Comments & Outgoing WhatsApp Updates
1. **Internal Admin Notes**: Click the **Comment Icon** on any ticket card to record internal progress notes (e.g., *"Spoke with the plumber, arriving tomorrow at 10:00 AM"*). Notes are timestamped and visible to all committee managers.
2. **Proactive WhatsApp Updates to Resident**: To send an immediate personal update to the resident, click **"Save & Send WhatsApp"**. The message is dispatched directly to the resident's phone. (Note: This is an outbound informational update; residents are instructed not to reply directly via WhatsApp).
3. **Resident Web Comments**: Residents tracking their tickets via the digital web portal can submit clarifications and notes through their browser, which appear directly in the ticket's comment stream on the admin board.

### Forwarding Tickets to Contractors via WhatsApp
1. Click **Forward to Vendor** on any ticket card.
2. Select a registered vendor or enter a new technician's phone number.
3. TikTak formats a professional dispatch message including the photo, location details, and ticket summary, accompanied by interactive acknowledgement buttons for the technician.
4. The system tracks vendor response latency and completion times for executive analytics.

### Incident Notice Pinning (Hotspot Banner)
When a major facility fails (e.g., entire elevator bank down or scheduled water shutoff):
1. Click **Pin Resident Notice** from the dashboard or BI page.
2. Select the location and input an announcement (e.g., *"Elevator #2 is out of service. Technicians are on-site; estimated fix time is 16:00"*).
3. Set an automatic expiration (e.g., 24 hours, 48 hours, or manual).
4. An alert banner immediately appears at the top of the resident reporting screen, informing all residents before they submit duplicate reports.

---

## 6. Tasks Backlog (Eisenhower Matrix)

Located at `/admin/:tenantId/backlog`, the Tasks Backlog allows committees to separate long-term capital improvement projects from daily urgent repairs.

### Moving Tickets to Backlog
* On any ticket card in the **New** or **In Progress** columns, click the status dropdown and select **"Move to Backlog"** (*העבר לבקלוג*).
* The ticket is transitioned out of the daily triage board and placed on the Backlog board.

### The 3 Prioritization Columns
* 🔴 **Important & Urgent**: High-impact tasks requiring scheduling this week (e.g., fire extinguisher annual certification).
* 🟠 **Important & Not Urgent**: Strategic investments and preventative maintenance (e.g., lobby painting quotes, roof waterproofing before winter).
* 🟡 **Not Important & Urgent**: Immediate administrative chores that do not affect safety (e.g., re-labeling parking spot numbers).

### Managing and Restoring Backlog Tasks
* **Vertical Reordering**: Drag cards vertically within a column to establish strict priority (top = highest priority).
* **Return to Dashboard**: When ready to execute, change the ticket's status dropdown back to **New** or **In Progress**. The card immediately returns to the active triage Kanban board with its full historical audit trail intact.

---

## 7. Business Intelligence (BI) & Operational Analytics

Accessible at `/admin/:tenantId/analytics`, the BI Hub provides four analytical layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        4-LAYER OPERATIONAL BI HUB                      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: Top KPI Ribbon (MTTR, Active SLA Breaches, Quota Burn)        │
├───────────────────────────────────┬────────────────────────────────────┤
│ Layer 2: Root-Cause Hotspot Maps  │ Layer 3: SLA Triage & "Me Too"     │
│ (Chronic breakdown zones, trends) │ (Time-in-state funnel, upvotes)    │
├───────────────────────────────────┴────────────────────────────────────┤
│ Layer 4: Vendor & Contractor Scorecard (Response speed & adherence)    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Top KPI Ribbon**: Real-time operational tempo showing Mean Time to Resolution (MTTR in working days), active SLA breaches (Yellow/Orange/Red), and current billing cycle quota consumption.
2. **Root-Cause Hotspots**: Pinpoints chronic infrastructure failure zones (e.g., specific elevator or parking level) to justify warranty claims or equipment replacement.
3. **Noise Filter & Community Demand**: Visualizes duplicate report ratios and ranks tickets by "Me Too" resident upvotes.
4. **Contractor Performance Scorecard**: Aggregates average response times and completion speed across all third-party maintenance contractors.

---

## 8. Usage-Tiered Quota & Subscription Management

TikTak operates on fair-usage monthly ticket allowances:
* **Real-Time Metering**: Tracks total created tickets versus billable consumption.
* **Automatic Credit for Non-Billable Reports**: Tickets marked as *Duplicate*, *Outside Scope*, or *Test* do not count against your monthly allowance.
* **Spam & Flood Auto-Merge**: The system automatically merges reports submitted within a 10-minute window with matching category and location.
* **Rollover Cushion**: Up to 20% of unused tickets roll over to the following month.
* **Retroactive Buffer**: A 5-ticket buffer prevents sudden overage charges for minor monthly usage spikes.

---

## 9. Best Practices

### For Building Committees & Property Managers
1. **Adopt a 10-Minute Morning Triage Rhythm**: Spend 10 minutes each morning reviewing incoming tickets, dragging assigned items to *In Progress*, and clearing duplicates.
2. **Always Use Accurate Closure Reasons**: Tagging duplicates and outside-scope items as non-billable immediately restores your monthly ticket quota.
3. **Pin Incident Notices Promptly**: The moment an elevator or main system fails, pin a 24-hour notice banner. This cuts incoming duplicate reports by up to 80%.
4. **Keep the Whitelist Current**: Update your resident CSV whenever new tenants move in or apartments are leased.
5. **Use the Backlog to Keep the Main Board Lean**: If a task cannot be solved within two weeks, move it to the Eisenhower Backlog to preserve daily operational focus.

### For Residents & Tenants
1. **Provide Clear, Well-Lit Photos**: When using "Snap & Send", capture both the specific defect and a bit of surrounding context (e.g., the door frame and the wall) to help the AI and manager pinpoint the location.
2. **Use Voice Notes for Sensory Issues**: If you hear an elevator scraping or smell gas/dampness, use Route C (Manual + Voice Note) to describe the sound or smell.
3. **Check Active Notices First**: Before reporting a major outage, check if an alert banner is already pinned at the top of your reporting screen.
4. **Use "Me Too" (📢) Instead of Filing Duplicates**: If a ticket for your issue is already open, tap "Me Too" to boost its priority without creating clutter.
5. **Submit One Issue Per Report**: Avoid combining multiple unrelated problems into a single photo or voice note so each can be routed to the appropriate contractor.
