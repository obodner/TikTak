# Product Overview: TikTak (תקתק)
**Intelligent Building Maintenance & Operational Telemetry Platform**

---

## 1. Executive Summary

**TikTak** is a cloud-native, AI-powered building maintenance and operations management platform designed to eliminate friction in residential and commercial property upkeep. Built around the foundational **"5-to-2 Rule"**, TikTak transforms traditional, multi-step maintenance reporting into a two-action **"Snap & Send"** flow that takes under 15 seconds.

By pairing zero-barrier resident intake (no application downloads, no account registrations, and no passwords) with multimodal AI diagnostics (Google Gemini 2.5 Flash), an automated WhatsApp Business communication engine, and a high-density administrative Kanban and BI dashboard, TikTak bridges the operational gap between residents, building committees (*Vaad Bayit*), property management companies, and maintenance contractors.

```
       [ Resident / QR Scan ]
                 │  (Sub-15s Snap & Send / QuickTap)
                 ▼
     ┌───────────────────────┐
     │    TikTak Platform    │ ◄─── Multimodal AI (Gemini 2.5 Flash)
     └───────────────────────┘
         │               │
         ▼               ▼
 [ Automated WhatsApp ]  [ Admin Kanban & BI Hub ]
   • Status Updates        • SLA & Stagnation Tracking
   • Stagnation Alerts     • Spatial Hotspot Analysis
   • Vendor Dispatches     • Tasks Backlog & Quota Engine
```

---

## 2. Problems It Solves

### The Resident Intake Barrier
* **The Problem**: In conventional setups, reporting a broken corridor lightbulb, water leak, or elevator fault requires joining chaotic WhatsApp groups, tracking down committee members, or filling out lengthy multi-field web forms. Because the reporting barrier is high (5–8 distinct actions), residents frequently overlook hazards until they become expensive, critical failures.
* **The TikTak Solution**: Physical QR codes embedded with location metadata enable instant, browser-based reporting. Residents snap a picture or tap a one-click preset; AI automatically categorizes and summarizes the issue, submitting it in seconds without requiring logins or personal app installations.

### Management Blind Spots & Volunteer Burnout
* **The Problem**: Building committees and property managers are inundated with unstructured messages, duplicate reports, and complaints across disparate channels. Without centralized triage, tickets stagnate, committee members suffer burnout, and recurring infrastructural flaws remain unnoticed.
* **The TikTak Solution**: A unified administrative Kanban board organizes incoming tickets with automated SLA tracking, working-day stagnation timers, noise-filtering for duplicate reports, and an Eisenhower-style backlog for deferred maintenance.

### The Resident Communication Void
* **The Problem**: Once a resident reports an issue, they rarely receive status updates, leading to anxiety, repeated inquiries, and strained community relations.
* **The TikTak Solution**: An automated, server-driven WhatsApp notification pipeline delivers immediate receipt confirmations, real-time status transitions, and transparent progress reminders directly to the reporter's phone without requiring manual admin intervention.

### Portfolio & Contractor Opacity
* **The Problem**: Property management companies overseeing dozens of buildings lack objective performance telemetry on third-party contractors and cross-building maintenance costs.
* **The TikTak Solution**: A 4-layer Business Intelligence (BI) engine aggregates vendor response and resolution metrics via WhatsApp dispatch telemetry, maps chronic infrastructure hotspots, and tracks monthly ticket quota consumption.

---

## 3. Target Audience & Stakeholder Personas

| Persona | Role in Ecosystem | Primary Needs & Pain Points | TikTak Value Delivered |
| :--- | :--- | :--- | :--- |
| **The Resident / Tenant** | Issue Reporter | Wants to report an issue in seconds while walking to their apartment or car; refuses to install specialized apps or remember credentials. | 15-second "Snap & Send" or 5-second "QuickTap" report; instant automated WhatsApp confirmation and progress updates. |
| **Building Committee (*Vaad Bayit*)** | Local Community Admin | Volunteer or semi-professional manager seeking to eliminate chaotic WhatsApp noise and organize daily tasks with minimal overhead. | Drag-and-drop Kanban triage, automated working-day SLA alerts, one-click WhatsApp communication, and audit logging. |
| **Property Management Companies** | Multi-Property Enterprise | Manages maintenance across tens or hundreds of buildings; requires operational oversight, vendor accountability, and budget control. | Enterprise Fleet Dashboard, master ticket pooling, contractor performance scorecards, and cross-property BI analytics. |
| **Maintenance Contractors & Technicians** | Service Providers | Plumbers, electricians, and elevator technicians who need concise task summaries, location context, and quick dispatch confirmations. | Pre-formatted WhatsApp dispatch alerts with media, location details, and interactive status acknowledgement. |
| **Platform Operators (Super Admins)** | System Overseers | Technical and operational leads responsible for global governance, multi-tenant integrity, and compliance. | "God's Eye" centralized audit trail, tenant provisioning, system health telemetry, and global holiday registry management. |

---

## 4. Core Capabilities & Functional Highlights

### 4.1 Tri-Modal Intake Engine (Zero Friction)
TikTak provides three reporting flows adapted to varying operational contexts:
1. **AI Visual Flow ("Snap & Send")**: The flagship reporting mechanism. The resident taps the camera trigger to capture a physical issue. Google Gemini 2.5 Flash analyzes the image in real time, automatically predicting the category (e.g., Electrical, Plumbing, Elevator), composing a concise Hebrew summary, and evaluating initial severity.
2. **QuickTap Flow ("Instant Report")**: Designed for high-frequency, recurring building issues (e.g., "Elevator Light Out", "Lobby Cleanliness"). Residents tap a pre-configured button on the landing page and confirm submission in under 5 seconds, bypassing camera and AI steps entirely.
3. **Manual Flow with Voice Notes**: For non-visual, sensory, or intermittent issues (e.g., strange motor vibrations, water pressure drops, hallway odors). Residents can record up to 10 seconds of clear audio accompanying their submission.

### 4.2 Whitelist-Based Silent Authentication
* Eliminates resident sign-ups, passwords, and user profiles.
* Residents enter their phone number upon their first report. The system validates the number against the building's uploaded resident whitelist (CSV).
* Subsequent sessions remember the device context while preserving anonymous, zero-PII data storage standards.

### 4.3 Interactive Admin Kanban Board & SLA Engine
* **Visual Status Management**: Drag-and-drop workflow across standard lifecycle stages (*New*, *In Progress*, *Resolved*, *Backlog*).
* **Holiday-Aware SLA Calculation**: A specialized working-day engine calculates ticket stagnation by evaluating tenant workweek definitions and national holiday calendars (e.g., Israeli holidays and Friday/Saturday weekends).
* **Traffic-Light Stagnation Indicators**:
  * ⚪ **Normal**: Under 2 working days in active state.
  * 💛 **Low Stagnation (2 Days)**: Yellow badge; triggers an automated reassurance message to the resident.
  * 🧡 **Medium Stagnation (5 Days)**: Orange badge; triggers a progress update reminder.
  * ❤️ **Critical Stagnation (9+ Days)**: Red alert requiring immediate committee intervention.

### 4.4 Tasks Backlog (Eisenhower Matrix)
* A dedicated workspace (`/admin/:tenantId/backlog`) designed to declutter the daily triage board from long-term capital improvements and deferred maintenance.
* Prioritizes non-immediate tasks across three intuitive tiers:
  * 🔴 **Important & Urgent**
  * 🟠 **Important & Not Urgent**
  * 🟡 **Not Urgent & Urgent**
* Preserves full ticket history and enables one-click restoration to the active triage board when work commences.

### 4.5 Automated WhatsApp Business Integration
* Powered by server-side Cloud Functions and the official WhatsApp Business API (no client-side redirects or manual sending).
* **Automated Receipt**: Instant message with ticket ID and summary upon submission.
* **Status Milestones**: Real-time push notification whenever a ticket moves across columns.
* **SLA Stagnation Updates**: Automatic "We are working on it" transparency touchpoints.
* **Vendor Telemetry**: Dispatches structured job orders to external vendors with interactive acknowledgement buttons.

### 4.6 Business Intelligence (BI) & Operational Hub
A 4-layer analytics center providing deep operational visibility:
* **Top KPI Ribbon**: Real-time operational tempo tracking Mean Time to Resolution (MTTR), active SLA breach counts, first-touch response time, and monthly quota burn.
* **Spatial & Root-Cause Hotspots**: Pinpoints chronic building locations (e.g., "Basement Parking Level -2" or "Elevator B") and category seasonality trends.
* **Noise Filter & Community Demand**: Monitors duplicate report ratios, out-of-scope municipal incidents, and aggregates resident "Me Too" (📢) endorsements to measure community impact.
* **Contractor Performance Scorecard**: Aggregates vendor acknowledgement latency, resolution speed, and completion adherence.
* **Incident Notice Pinning**: One-click action enabling managers to publish banner alerts to the resident intake screen for known ongoing outages.

### 4.7 Usage-Tiered Quota & Billing Governance
* Subscription models aligned with building size (Micro, Basic, Standard, Growth, Enterprise).
* **Fair-Usage Deductions**: Admins can mark duplicate, out-of-scope, or test reports as "Non-Billable", immediately crediting the ticket back to the monthly quota.
* **Intelligent Spam Auto-Merge**: Automatically detects and merges duplicate reports submitted within a 10-minute window for identical categories and locations.
* **Rollover & Buffer Protections**: First-in, first-out (FIFO) rollover consumption (capped at 20%) paired with a 5-ticket retroactive buffer to prevent unexpected overage penalties.

### 4.8 Enterprise Multi-Tenancy & "God's Eye" Governance
* **Strict Tenant Scoping**: Every database entity is isolated by `tenantId`. Cross-building queries are prohibited at the database security level.
* **Super Admin Portal**: Centralized visibility across all provisioned buildings, platform-wide audit logging (`/audit_logs`), and tenant subscription lifecycle controls.

---

## 5. Architectural Overview

TikTak operates on a modern, serverless, scale-to-zero cloud architecture deployed across **Google Cloud Platform (GCP)** and **Firebase Enterprise Infrastructure**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                             CLIENT TIER                                │
│                                                                        │
│   Resident Mobile Web SPA                Admin & Enterprise Web App    │
│   (Next.js App Router, Hebrew RTL,      (High-Density Kanban, BI Hub,  │
│    Zero-Install PWA, Camera API)         Audit Explorer, Tailwind CSS) │
└───────────────────┬────────────────────────────────────┬───────────────┘
                    │ HTTPS / REST                       │ Secure SDK
                    ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPUTE & BACKEND SERVICES                      │
│                                                                        │
│   Firebase Hosting (Global CDN Edge)                                   │
│   Cloud Functions v2 & Cloud Run (Node.js Microservices)               │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ • Ticket Intake & Normalization   • SLA Calculation Engine     │   │
│   │ • WhatsApp Webhook Handler        • Quota & Billing Metering   │   │
│   │ • Scheduled Cron Workers          • Centralized Audit Logger   │   │
│   └────────────────────────────────────────────────────────────────┘   │
└───────────────────┬────────────────────────────────────┬───────────────┘
                    │                                    │
                    ▼                                    ▼
┌──────────────────────────────────┐ ┌───────────────────────────────────┐
│        AI & MULTIMODAL TIER      │ │      COMMUNICATION FABRIC         │
│                                  │ │                                   │
│   Google Vertex AI               │ │   Meta WhatsApp Business Cloud API│
│   Gemini 2.5 Flash               │ │   • Automated Push Notifications  │
│   • Visual Categorization        │ │   • Interactive Status Callbacks  │
│   • Hebrew Auto-Summarization    │ │   • Contractor Dispatch Messages  │
│   • Severity & Urgency Scoring   │ │                                   │
└──────────────────────────────────┘ └───────────────────────────────────┘
                    │                                    │
                    ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PERSISTENCE & SECURITY TIER                      │
│                                                                        │
│   Cloud Firestore (Native Mode)         Google Cloud Storage (GCS)     │
│   • Strict Multi-Tenant Rules           • Compressed Issue Media       │
│   • Tenant Subcollections               • Voice Note Audio Files       │
│   • Global Audit Logs (/audit_logs)     • Automated 1-Year TTL Deletion│
│   • Master Holiday Registry                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Pillars
1. **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui. Fully localized for Hebrew (Right-to-Left) with mobile-first viewport optimizations.
2. **Backend & Compute**: Firebase Cloud Functions (v2) and Google Cloud Run running on Node.js. All services are strictly configured to scale to zero when idle, ensuring minimal baseline operational expense.
3. **Multimodal AI**: Vertex AI Gemini 2.5 Flash SDK executing rapid visual inference (< 3 seconds) with custom system prompts tuned for Israeli facilities and Hebrew phrasing.
4. **Data Isolation**: Cloud Firestore structured with scoped tenant paths (`/tenants/{tenantId}/tickets/{ticketId}`) protected by role-based Firestore Security Rules. Cross-tenant reads are blocked at the database engine level.
5. **Security & Compliance**: Zero-knowledge resident reporting (no passwords or personal credentials stored), role-based access control (RBAC) via Firebase Auth Custom Claims (`super` vs. `tenant_admin`), and automated 1-year time-to-live (TTL) expiration on uploaded media.

---

## 6. Business Impact & Value Metrics

| Dimension | Traditional Maintenance Operations | With TikTak |
| :--- | :--- | :--- |
| **Reporting Time** | 2 to 5 minutes (forms, WhatsApp messaging) | **< 15 seconds** (Snap & Send) / **< 5 seconds** (QuickTap) |
| **Actions to Report** | 5 to 8 distinct steps (Login, select, type, send) | **2 actions** (Scan -> Snap & Send) |
| **Resident Adoption** | Low; reserved for extreme emergencies | High; friction-free intake captures minor issues early |
| **Status Transparency** | Zero; resident must follow up repeatedly | **100% automated** WhatsApp updates on every status shift |
| **Committee Overhead** | High; manual sorting of group chats and notes | Low; organized Kanban, automated SLAs, and instant dispatches |
| **Data Visibility** | Anecdotal; paper logbooks or scattered chats | Actionable BI; MTTR tracking, hotspot maps, and vendor scoring |
| **Cost Predictability** | Unpredictable per-unit rates or manual billing | Transparent usage tiers with rollover cushions and dispute credits |

---

## 7. Document Classification & Metadata

* **Product Name**: TikTak (תקתק)
* **Document Type**: Product Overview & System Brief
* **Target Audience**: Technical Stakeholders, Product Managers, System Architects, Enterprise Customers
* **Current Version**: 2.0 (Post-Modernization & Analytics Release)
* **Related Documentation**:
  * Functional User Guides: `docs/user_guide_en.md`, `docs/user_guide_he.md`
  * System Architecture: `docs/ARCH/god_view_architecture.md`, `docs/ARCH/sla_engine_architecture.md`
  * Product Specifications: `docs/PRDS/`
  * Commercial Strategy: `docs/pricing_licensing_strategy.md`
