# Product Brief: TikTak
**Intelligent Building Maintenance & Operational Telemetry Platform**

---

## 1. Executive Summary

**TikTak** is a cloud-native, AI-powered building maintenance platform that turns chaotic facility reporting into a streamlined, automated operational pipeline. Built on the **"5-to-2 Rule"**, TikTak replaces traditional 5–8 step reporting forms with a two-action **"Snap & Send"** flow completed in under 15 seconds. 

By combining frictionless browser-based intake (zero app downloads, zero logins), multimodal AI issue diagnostics, an automated WhatsApp Business communication engine, and a high-density Kanban and BI dashboard, TikTak bridges the communication and operational gap between residents, building committees (*Vaad Bayit*), property management companies, and maintenance contractors.

---

## 2. Target Personas & Core Pain Points

```
┌─────────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Persona                 │ Primary Pain Points               │ TikTak Strategic Value           │
├─────────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ The Resident / Tenant   │ • High friction (lengthy forms)   │ • Sub-15s AI "Snap & Send"       │
│                         │ • Cluttered WhatsApp groups       │ • Sub-5s "QuickTap" buttons      │
│                         │ • "Black hole" communication      │ • Automated WhatsApp receipts    │
│                         │ • Hesitation to install apps      │ • Zero downloads & zero passwords│
├─────────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Building Committee      │ • Volunteer burnout & chaos       │ • Kanban task board triage       │
│ (Vaad Bayit)            │ • Duplicate & out-of-scope noise  │ • Working-day SLA traffic lights │
│                         │ • Inability to track stagnation   │ • 1-click vendor WhatsApp orders │
│                         │ • Constant resident inquiries     │ • Proactive reassurance updates  │
├─────────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Property Management     │ • Lack of cross-building metrics  │ • Unified Enterprise Fleet view  │
│ Companies (Enterprise)  │ • Vendor opacity & inflated bills │ • Contractor performance metrics │
│                         │ • Unpredictable billing models    │ • Spatial breakdown heatmaps     │
│                         │ • Difficult contract renewals     │ • Usage-tiered quota pricing     │
├─────────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Maintenance Contractors │ • Unclear, incomplete issue texts │ • Pre-formatted WhatsApp orders  │
│ & Service Technicians   │ • Lost location & media context   │ • Clear defect photos & location │
│                         │ • Friction-heavy dispatch portals │ • 1-tap interactive status ack   │
└─────────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

---

## 3. Core Capabilities & Feature Highlights

### 3.1 Tri-Modal Zero-Friction Reporting
* **Route 1: AI Visual Flow ("Snap & Send")**: Resident points camera, snaps defect, and multimodal AI automatically categorizes, summarizes in concise language, and scores urgency (< 15 seconds).
* **Route 2: QuickTap Flow ("Instant Report")**: 1-tap buttons for top 5 recurring building issues (e.g., lobby light, elevator cleanliness) without opening the camera (< 5 seconds).
* **Route 3: Manual Flow with Voice Notes**: Standard form accompanied by up to 10 seconds of clear audio recording for non-visual issues (noises, smells, water pressure).
*(Note: Accessed directly via mobile browser link. Physical QR signs are an optional convenience).*

### 3.2 Silent Whitelist Authentication
* Eliminates resident sign-ups, passwords, and user profiles.
* Silent mobile phone validation against pre-uploaded building CSV roster ensures only verified residents submit tickets.

### 3.3 Interactive Kanban Board & Tasks Backlog
* **Visual Task Management**: Rapid drag-and-drop triage across *New*, *In Progress*, and *Resolved* columns.
* **Eisenhower Tasks Backlog**: Dedicated workspace (`/backlog`) prioritizing long-term capital projects across 3 urgency/importance tiers, keeping the daily triage board clean.
* **Fair Closure Categorization**: Marking tickets as *Duplicate*, *Outside Scope*, or *Test* instantly credits the building's monthly quota.

### 3.4 Working-Day SLA & Proactive Reassurance Engine
* **Business-Day Calculation**: Stagnation timers evaluate official workweeks (e.g., Sunday–Thursday), automatically excluding weekends and national holidays.
* **Traffic-Light Visual Indicators**: Normal (White), Low Delay (Yellow, 2+ days), Medium Delay (Orange, 5+ days), Critical Delay (Red, 9+ days).
* **Automated Transparency Updates**: When repairs take several days (awaiting parts or technician visits), the system automatically pushes reassuring WhatsApp status notifications to the resident, eliminating anxious follow-up calls.

### 3.5 Automated WhatsApp Business Infrastructure
* Direct, server-side integration via the official WhatsApp Business Cloud API.
* Instant digital receipts upon submission with tracking numbers.
* Push notifications on status shifts and closure notes.
* Contractor dispatch alerts featuring defect photos and interactive confirmation buttons.

### 3.6 Operational BI & Root-Cause Analytics
* **Executive Pulse (Top KPI Ribbon)**: Real-time MTTR (Mean Time to Resolution in working days), active SLA breach counts, and monthly quota burn.
* **Hotspot Breakdown Maps**: Pinpoints recurring infrastructural failure zones (e.g., specific elevator or parking level).
* **Incident Notice Pinning**: 1-click action to pin alert banners to the resident intake screen during widespread building outages.

---

## 4. Technical Differentiators & Competitive Advantage

| Technical Dimension | Traditional Maintenance Software | TikTak Advantage |
| :--- | :--- | :--- |
| **Intake Barrier** | Mandatory app download & password registration | **Zero download / Zero password**; web link + silent whitelist |
| **Issue Diagnostics** | Manual resident typing (poor detail, vague text) | **Multimodal AI** auto-extracts category, summary & urgency in < 3s |
| **Infrastructure & Margin** | Heavy dedicated VMs, fixed multi-tenant servers | **Serverless Scale-to-Zero** (Cloud Run & Functions); > 85-90% gross margins |
| **Resident Communication** | Unread emails, SMS spam, or chaotic chat groups | **Official WhatsApp Business Cloud API** with automated lifecycle triggers |
| **SLA Computation** | Naive 24/7 wall-clock calendar timers | **Localized working-day engine** factoring national holidays and weekend shifts |
| **Data Security & Isolation**| Shared multi-tenant tables with soft filter queries | **Hard multi-tenant database scoping** enforced at security rule layer |
| **Pricing Alignment** | Fixed per-unit tax regardless of usage | **Predictable usage-based quotas** with rollover cushions & dispute credits |

---

## 5. Commercial Model & Presales Positioning

* **Usage-Based Subscription Tiers**: Scaled to building size (Micro, Basic, Standard, Growth, Enterprise) starting from 15 tickets/month up to enterprise pools.
* **High ROI & Loss Prevention**:
  * Early detection of leaks and electrical hazards prevents **₪15,000–₪60,000+** in catastrophic damages.
  * Saves **15–25 committee hours** per month in administrative chores.
  * Vendor telemetry controls contractor overbilling and enforces response SLAs.
* **Risk-Free Deployment**: Instant provisioning with CSV upload; no hardware installation or resident training required.
