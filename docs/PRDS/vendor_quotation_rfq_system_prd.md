# PRD: TikTak Vendor Quotation (RFQ) Hub & Multi-Category System
## מערכת ניהול ובקשת הצעות מחיר (RFQ) וסיווג קבלנים רב-קטגורי

**Document Status**: Approved Product Architecture (v2.2 - Whitelist Expansion & Interaction UX)  
**Version**: 2.2.0  
**Author**: TikTak Lead Product Manager (TikTak-PM) & Lead Architect  
**Stakeholder & Quality Gatekeeper**: Oren Bodner (Lead Architect & Senior QA Lead)  
**Target Module**: TikTak Admin Portal (Sidebar `הצעות מחיר` Module) + Public Mobile Contractor Portal  
**Date**: September 2026  

---

## 1. Executive Summary & Strategic Rationale

### 1.1 The Dedicated Hub Architectural Shift
Rather than scattering Request for Quote (RFQ) logic across disconnected modals, this specification establishes **"הצעות מחיר" (Work Quotations Hub)** as a premier, dedicated product module in the TikTak admin sidebar (`/admin/:tenantId/quotes`).

This architectural separation delivers three critical B2B advantages:
1. **Clean Product Separation**: Quotes are treated as commercial contracts, not merely ticket comments. A dedicated hub allows managing both incident-linked repairs (e.g., pipe leak in garage) and standalone capital projects (e.g., roof waterproofing, building exterior painting, annual fire system audit).
2. **Dual-Submenu Clarity**:
   - **בקשת הצעה חדשה (New RFQ)**: A clean, step-by-step dispatch wizard.
   - **הצעות מחיר שהתקבלו ומעקב (Active RFQs & Received Quotes)**: A unified comparison matrix and tracking board showing bids, price deltas, job duration, and winner award status across all inquiries.
3. **Contextual Deep-Linking**: While the hub is standalone, the admin can still launch an RFQ directly from an open ticket in `TicketDetailsModal`. Clicking "בקש הצעת מחיר" pre-populates the new RFQ wizard with that ticket number, fault media, and category seamlessly.

---

## 2. Core Functional Pillars

### 2.1 Pillar 1: Vendor Directory Elevation (`VendorManagement.tsx`)
1. **Multi-Selection Category Tags (`categories: string[]`)**:
   - Replaces free-text profession input with multi-select chips/pills populated from building infrastructure categories (`חשמל`, `אינסטלציה`, `גינון`, `בינוי / צבע`, `מעליות`, `ניקיון`, `אינטרקום / שערים`, `משאבות`, etc.).
   - Inline `+ הוסף תגית חדשה` for custom trades.
   - Contractors can be assigned to multiple categories (e.g., handyman doing both electrical and plumbing).
2. **Contractor Classification (`vendorType: 'retainer' | 'occasional'`)**:
   - **🏢 ספק קבוע (Retainer / House Vendor)**: Monthly contracts, fixed building service agreements.
   - **🛠️ קבלן מזדמן (Occasional / On-Demand)**: Dispatched for one-off bids and repairs.

---

### 2.2 Pillar 2: "בקשת הצעה חדשה" (New RFQ Creation Wizard)

Accessible via sidebar navigation at `/admin/:tenantId/quotes/new` (or via deep-link from a ticket card).

```
┌────────────────────────────────────────────────────────────────────────┐
│ TikTak | יצירת בקשת הצעת מחיר חדשה (RFQ)                              │
├────────────────────────────────────────────────────────────────────────┤
│ 1. שיוך לקריאת שירות (אופציונלי):                                      │
│ [ הזן מספר פנייה לדוגמה: 104        ] [ משוך פרטי פנייה 🔍 ]           │
│ * במשיכת פנייה: הקטגוריה, התיאור, המיקום, התמונות וההקלטה נטענים אוטומטית│
│                                                                        │
│ 2. פרטי העבודה:                                                        │
│ קטגוריה: [ אינסטלציה                  ▼ ]                              │
│ כותרת:   [ תיקון פיצוץ צינור מים ראשי בחניון                         ] │
│ פירוט:   [ נדרש להחליף מקטע של 3 מטר צינור 2 צול, כולל שסתום אל-חוזר ] │
│ מיקום:   [ חניון תחתון קומה -2, ליד עמוד 14                          ] │
│                                                                        │
│ 3. קבצים ומסמכים מצורפים (עד 3 קבצים, מקסימום 5MB לקובץ):               │
│ [ 🖼️ תמונת נזילה.jpg (1.2MB) ]  [ 🎙️ הקלטת דייר.m4a (450KB) ]         │
│ [ 📎 העלה מפרט / כתב כמויות / תמונה / הקלטה (PDF, Image, Audio) ]      │
│ 🛡️ אבטחה: מורשים קבצי מסמכים, תמונות ואודיו (PDF, JPG, PNG, MP3, MP4). │
│           קבצים חשודים ומסוכנים (*.exe, *.key, *.bat) נחסמים אוטומטית.   │
│                                                                        │
│ 4. הגדרת מועד אחרון להגשת הצעות (תוקף הקישור):                         │
│ ( ) 48 שעות     (•) שבוע (7 ימים - ברירת מחדל)     ( ) שבועיים (14 יום)│
│ ( ) תאריך מותאם אישית: [ 30/09/2026 18:00 ]                           │
│                                                                        │
│ 5. בחירת קבלנים לשליחה (קטגוריה: אינסטלציה):                           │
│ [✓] בחר הכל (4 קבלנים)                                                 │
│  [✓] משה כהן - אינסטלציה (קבוע 🏢 | 050-1234567)                       │
│  [✓] ש.י. שירותי שאיבה (מזדמן 🛠️ | 052-9876543)                        │
│  [✓] גיא אינסטלטורים (מזדמן 🛠️ | 054-5554321)                          │
│  [ ] א.א. משאבות בע״מ (מזדמן 🛠️ | 050-0001122)                         │
│                                                                        │
│                 [ ביטול ]  [ 🚀 שלח בקשה ל-3 קבלנים ב-WhatsApp ]       │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Rules & Security:
- **Contractor Cherry-Picking**: Selecting a category displays all matching contractors with `[✓] בחר הכל` (Select All) alongside individual checkboxes, allowing the admin to send to all or a cherry-picked subset.
- **Strict File Format & Security Validation**:
  - **Whitelisted Formats**:
    - **Documents**: `application/pdf` (`.pdf`).
    - **Images**: `image/jpeg`, `image/png`, `image/webp` (`.jpg`, `.jpeg`, `.png`, `.webp`).
    - **Audio / Media**: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/aac`, `video/mp4` (`.mp3`, `.mp4`, `.m4a`, `.wav`, `.aac`).
  - **Strictly BLOCKED**: Executables and script formats (`*.exe`, `*.key`, `*.bat`, `*.cmd`, `*.sh`, `*.vbs`, `*.msi`, `*.zip`, `*.scr`).
  - Limits: Maximum 3 files, max 5 MB per file.
- **Dynamic Time Limit**: Expiration date (`deadlineAt`) stored on the RFQ document. The contractor link dynamically checks this timestamp.

---

### 2.3 Pillar 3: Contractor Zero-Friction Web Portal (`/quote/:rfqId?v=:vendorId&token=:sig`)

Contractors open the WhatsApp link on mobile without any login barrier.

#### Security & Phone Verification:
- When a contractor opens the link, the server verifies:
  1. HMAC token signature is valid for `rfqId + vendorId + tenantId`.
  2. `vendorId` exists in `tenants/{tenantId}/vendors`.
  3. The phone number registered on the vendor document **matches the recipient phone** in `rfq.dispatchedVendors`. If the vendor was deleted or phone was tampered, access is rejected (`403 Contractor Phone Not Recognized`).

#### What Contractors See:
1. **Job Scope Inspection**:
   - Building address, fault title, description, location.
   - High-resolution photos with pinch-to-zoom.
   - Built-in audio player for resident/admin voice note recordings.
   - Download links for attached PDF specifications/blueprints.
2. **Quote Entry (Tailored to Real Contractor Needs)**:
   - **מחיר (Price)**: Input in ₪ (ILS).
   - **מע״מ (VAT Toggle)**: `(•) כולל מע״מ` / `( ) לפני מע״מ (+18%)`. Dynamic helper displays calculated gross total.
   - **משך ביצוע משוער (Estimated Job Duration)**: Replaces exact arrival time with duration options:
     - Dropdown / pills: `עד שעתיים`, `חצי יום עבודה`, `יום עבודה מלא`, `2-3 ימי עבודה`, `מעל שבוע`, או הזנת טקסט חופשי (e.g., "תלוי באספקת חלפים").
   - **הערות ותנאים (Notes/Warranty)**: e.g., "כולל חלפים מקוריים ואחריות לשנתיים".
   - **קובץ הצעת מחיר רשמית (Optional Attachment)**: Button to snap a picture of a handwritten signed quote or upload a formal company PDF.
3. **Submit**: Tap `שלח הצעת מחיר` with haptic feedback. Can re-open and update before deadline.

---

### 2.4 Pillar 4: "הצעות מחיר שהתקבלו ומעקב" (RFQ Hub Interaction & Comparison Matrix)

Accessible in the sidebar under `/admin/:tenantId/quotes/active` (and reflected contextually inside `TicketDetailsModal`).

#### 2.4.1 Page Layout & Interaction Model (Expandable Accordion + Modal Hybrid)
The active RFQ page displays all historical and active RFQs in an organized, chronological card list with filtering (הכל / פעילות / נסגרו / אושרו).

**Interaction Behavior**:
1. **Inline Expand / Collapse (Primary Experience)**:
   - Clicking an RFQ card/row expands an inline drawer directly underneath it, revealing the **Received Quotes Comparison Matrix** without losing place in the list.
   - Allows rapid triage across multiple RFQs smoothly.
2. **Full-Screen Modal Option (`⛶ הרחב למסך מלא`)**:
   - For complex RFQs with 4+ bids, attached PDF tenders, or large photo galleries, clicking "תצוגה מורחבת" opens the comparison modal with full-screen focus, perfect for displaying at committee meetings.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ מעקב הצעות מחיר פעילות והיסטוריה                                      [ + בקשת הצעה חדשה ] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ הכל (12) ]  [ פעילות (3) ]  [ אושרו (7) ]  [ הסתיימו (2) ]          [ חיפוש לפי כותרת/מספר ] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▼ #RFQ-108 • תיקון פיצוץ צינור בחניון | קריאה #104 | אינסטלציה | נותרו 4 ימים | 3 הצעות ★  │
│ ┌────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ מטריצת השוואת הצעות מחיר:                                              [ ⛶ תצוגה מלאה ]│ │
│ │ ┌───────────────────┬────────┬─────────────────┬────────────────┬──────────────┬──────┐│ │
│ │ │ קבלן / ספק        │ סיווג  │ מחיר (כולל מע״מ)│ משך ביצוע משוער│ הערות ומסמך  │פעולה ││ │
│ │ ├───────────────────┼────────┼─────────────────┼────────────────┼──────────────┼──────┤│ │
│ │ │ משה כהן           │ קבוע 🏢│ 1,200 ₪ (משתלמת)│ יום עבודה מלא  │ כולל חלקים   │[אישור]││ │
│ │ │                   │        │ (1,016 ₪ + מע״מ)│                │ 📄 הצעה.pdf  │      ││ │
│ │ │ ש.י. שאיבות       │ מזדמן🛠️│ 1,450 ₪         │ חצי יום ⚡     │ אחריות לשנה  │[אישור]││ │
│ │ │ גיא אינסטלטורים   │ מזדמן🛠️│ 1,800 ₪         │ יומיים         │ ללא חפירה    │[אישור]││ │
│ │ │ א.א. משאבות       │ מזדמן🛠️│ ⏳ טרם הוגש     │ -              │ נצפה לפני שעה│[תזכורת]││
│ │ └───────────────────┴────────┴─────────────────┴────────────────┴──────────────┴──────┘│ │
│ └────────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▶ #RFQ-107 • איטום גג עליון לקראת החורף | פרויקט עצמאי | בינוי ואיטום | אושר ✓ (משה איטום)  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▶ #RFQ-106 • החלפת נורות לובי ל-LED | קריאה #98 | חשמל | נסגר ללא זכייה                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 2.4.2 1-Click Winner Confirmation & Editable Disposition Message
When the admin clicks **"אישור הצעה וסגירת קבלן"**:
1. **Interactive Confirmation Dialog with Editable Textarea**:
   - The admin is presented with the pre-formatted WhatsApp approval message in an **editable text box**.
   - Admin can adjust terms, add special instructions, or modify the agreed pricing if negotiated offline.
2. **Auto-Dispatched Winner Notification**:
   > "שלום {{vendorName}}, שמחים לעדכן כי הצעתך ע״ס {{price}} ₪ עבור {{jobTitle}} ב-{{tenantName}} אושרה ע״י ועד הבית! 🎉 ניתן לתאם תחילת עבודה מול {{adminName}} ({{adminPhone}})."
3. **Polite Non-Winning Auto-Closure**:
   > "שלום {{vendorName}}, תודה רבה על הגשת הצעת המחיר לקריאה #{{jobTitle}}. הפעם נבחרה הצעה חלופית. נשמח לשתף פעולה בקריאות הבאות! ועד הבית - {{tenantName}}."
4. **Conditional Ticket Status Update**:
   - If the linked ticket was in **"open" (חדש / New)** state, it transitions to `in-progress` (בטיפול).
   - If the ticket was already in `in-progress`, `backlog`, etc., its existing status is preserved without disruption, and contractor details are recorded.

---

## 3. Sidebar Navigation Structure & Animations

In `AdminSidebar.tsx`:
```
[ דשבורד           ] (Dashboard)
[ מצבור משימות     ] (Backlog)
[ סטטיסטיקה ודוחות ] (Analytics & BI)
[ הצעות מחיר (RFQ) ▼ ] (Work Quotes - NEW)
    ├─ בקשת הצעה חדשה       (/admin/:tenantId/quotes/new)
    └─ הצעות מחיר שהתקבלו   (/admin/:tenantId/quotes/active)
[ הגדרות           ] (Settings)
```

### Animation Specification:
- **Slide & Accordion Effect**: When clicking "הצעות מחיר", the sub-menu expands/collapses with the **exact same smooth slide animation** (`max-h-0` to `max-h-40`, opacity fade, and rotating chevron) used by the `Settings` menu item.
- In collapsed sidebar mode, clicking the icon triggers the floating flyout popover consistent with Settings flyout behavior.

---

## 4. Comprehensive Audit Logging (`auditLogger.ts`)

Every RFQ milestone is recorded in `tenants/{tenantId}/auditLogs`:

| Audit Action | Trigger | Log Details & Changes Payload |
| :--- | :--- | :--- |
| `RFQ_CREATED` | Admin creates an RFQ draft or broadcasts a new request. | `{ rfqId, ticketId, ticketNumber, category, title, recipientCount, deadlineAt }` |
| `RFQ_BROADCAST_SENT` | WhatsApp messages dispatched to contractors. | `{ rfqId, targetVendors: [{ vendorId, phone, name }] }` |
| `VENDOR_QUOTE_SUBMITTED`| Contractor submits quote via public web link. | `{ rfqId, vendorId, vendorName, price, priceIncludesVat, estimatedDuration, hasAttachment }` |
| `VENDOR_QUOTE_UPDATED`  | Contractor re-submits/updates their quote before deadline.| `{ rfqId, vendorId, previousValue: { price }, newValue: { price } }` |
| `RFQ_AWARDED`           | Admin confirms winning bid. | `{ rfqId, winningVendorId, winningPrice, ticketId, editedMessage: boolean }` |
| `RFQ_CANCELLED`         | Admin cancels an active RFQ inquiry. | `{ rfqId, cancellationReason }` |
| `RFQ_EXPIRED`           | Scheduled deadline passes without award. | `{ rfqId, totalQuotesReceived }` |

---

## 5. Help & Documentation System (`HelpModal.tsx` & Locales)

The in-app User Guide in `HelpModal.tsx` and translation dictionaries (`he.json`, `en.json`) are updated to include a dedicated manager section:

### Content to be Added:
1. **פרק "מערכת הצעות מחיר (RFQ)" (Work Quotes Guide)**:
   - **יצירת בקשה**: כיצד למשוך נתונים מקריאה קיימת לפי מספר פנייה, צירוף מסמכים ומפרטים טכניים (עד 3 קבצים), והגדרת תוקף הקישור.
   - **בחירת קבלנים וסינון קטגוריות**: שליחה לכל הקבלנים בתחום או בחירה פרטנית (בחר הכל / בחירה סלקטיבית).
   - **חוויית הקבלן**: הסבר שהקבלן מקבל הודעת וואטסאפ עם קישור ישיר ללא צורך בהרשמה או סיסמה, מזין מחיר, מע״מ, ומשך עבודה משוער.
   - **השוואה ואישור הצעה**: כיצד לעבור על טבלת ההשוואה, בדיקת מסמכים מצורפים, עריכת נוסח ההודעה לקבלן הנבחר ואישורו בקליק אחד.

---

## 6. Senior QA Acceptance Criteria (Oren Lead QA Standards)

| ID | Category | Test Scenario | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **QA-101** | Ticket Pull | Entering `#104` in RFQ wizard. | Auto-fills category, description, and populates existing ticket image/voice attachments without data loss. |
| **QA-102** | Security | Uploading a `.exe`, `.key`, or `.bat` file. | File rejected immediately with clear Hebrew warning: "פורמט קובץ אינו מורשה. מותרים רק קבצי תמונה, אודיו ו-PDF". |
| **QA-103** | Phone Verification | Tampering with `v=` parameter or opening link for deleted contractor. | Server validates phone match; returns `403 Contractor Phone Not Recognized` and blocks submission. |
| **QA-104** | Duration vs. Arrival | Contractor form asks for estimated job duration. | Comparison matrix accurately displays duration badges (`יום עבודה מלא`, `חצי יום ⚡`). |
| **QA-105** | Editable Award Message | Admin clicks "אישור הצעה". | Modal provides an editable textarea with pre-filled WhatsApp text. Admin can edit text, and the modified text is sent. |
| **QA-106** | Ticket Status Rule | Linked ticket is in `in-progress` (not `open`). | Ticket remains `in-progress` (does not reset); contractor assignment is recorded. Only tickets in `open` state change to `in-progress`. |
| **QA-107** | Sidebar UX | Expanding/collapsing "הצעות מחיר" menu. | Uses the exact same slide animation and chevron rotation as the Settings menu. |
| **QA-108** | Audit Trail | Creating, submitting, and awarding an RFQ. | Generates RFC-compliant audit logs in Firestore viewable in Audit Explorer. |
| **QA-109** | Help Modal | Opening Help Modal from sidebar. | Includes clear explanatory guide for the Work Quotations (RFQ) hub in Hebrew and English. |
| **QA-110** | Expand/Collapse & Modal | Clicking RFQ row in Active list. | Smoothly expands inline matrix drawer; "תצוגה מלאה" button opens full-screen comparison modal. |
