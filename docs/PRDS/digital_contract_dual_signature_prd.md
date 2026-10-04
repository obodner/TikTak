# Product Requirements Document (PRD)
# Online Dual-Signature Workflow for RFQ Contracts & Work Orders

**Document ID**: `PRD-RFQ-CONTRACT-SIGN-2026`  
**Version**: `1.0.0`  
**Status**: `Draft for Review`  
**Author**: Antigravity Product Management & Architecture  
**Stakeholder**: Oren Bodner (Lead Architect & QA Lead)  
**Date**: October 4, 2026  
**Target Delivery**: Sprint 11  

---

## 1. Executive Summary & Problem Statement

### 1.1 The Business Problem
When a building committee (ועד בית) awards a major maintenance tender (e.g., roof waterproofing for ₪18,000 or elevator controller overhaul for ₪24,000), the agreement between the committee and the winning contractor has historically remained offline or informal. 

This creates three critical vulnerabilities:
1. **Resident Disputes & Suspicion of Favoritism**: Disgruntled tenants suspect kickbacks or lack of formal commitments, occasionally withholding committee fees (מיסי ועד) or initiating claims at the Land Registration Supervisor (המפקח על המקרקעין).
2. **Contractor Scope Creep & Default Risk**: Contractors sometimes start work without a signed warranty period, waste disposal clause, or agreed milestone payment schedule, leading to unexpected price renegotiations mid-project.
3. **Legal Exposure**: Without verifiable digital signatures adhering to the **Israeli Electronic Signature Law, 5761-2001 (חוק חתימה אלקטרונית)**, neither party possesses a legally enforceable, immutable audit trail.

### 1.2 The Solution
An integrated, zero-friction **Online Dual-Signature Workflow** directly within TikTak:
1. **Committee Signs First**: The admin customizes milestones/terms, signs online via a touch/canvas signature pad, and locks the agreement.
2. **Contractor Counter-Signs via WhatsApp**: The contractor receives a secure link, authenticates using the last 4 digits of their registered phone number, signs via touch/stylus, and enters their tax ID (ח.פ. / ע.מ. / ת.ז.).
3. **Legally Binding Execution**: Both signatures, timestamps, IP/metadata, and agreed clauses are permanently stamped into the RFQ record and the official PDF document, locked into the **TikTak 7-Year Legal Vault**.

---

## 2. Goals & Non-Goals

### 2.1 Goals (In Scope)
* **Sequential Signing Flow**: The committee representative always signs first; the contractor signs second.
* **Touch-Native Mobile Signature Pad**: Seamless canvas signature drawing using fingers or styluses on mobile screens, with zero lag or external app downloads.
* **Whitelist Phone Verification**: The contractor authenticates their identity at the signing step using the last 4 digits of their phone number, matching the building's approved vendor directory.
* **Visual Signature Stamping**: Both graphical signatures are embedded side-by-side into the contract view and the printable A4 PDF document.
* **Tamper-Evident Contract State**: Once both parties sign, the contract terms and payment milestones are strictly immutable.
* **Audit Trail & Retention**: Emits `CONTRACT_SIGNED_BY_ADMIN` and `CONTRACT_FULLY_SIGNED` audit events and archives the contract for 7 years under statutory limitation rules.

### 2.2 Non-Goals (Out of Scope for MVP)
* No requirement for Qualified Electronic Signatures (חתימה אלקטרונית מאושרת עם כרטיס חכם / טוקן חומרה) which add heavy friction; the system complies with Secure Electronic Signature (חתימה אלקטרונית מאובטחת/רגילה) standards suitable for civil and commercial service agreements.
* No multi-committee signature requirements for MVP (exactly 1 authorized committee signatory).
* No integration with third-party signing platforms (e.g. DocuSign/Signer); built natively into TikTak to maintain passive margin and eliminate per-signature external API fees.

---

## 3. User Personas & Core Journeys

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              END-TO-END SIGNING LIFECYCLE                               │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [ 1. Award Quote ]
         │
         ▼
 [ 2. Committee Reviews Terms ]
         │
         ▼
 [ 3. Committee Signs Online ]  ──► (Signature saved, status: 'signed_by_admin', terms locked)
         │
         ▼
 [ 4. WhatsApp Sent to Vendor ] ──► (Link with token & view=contract&sign=1)
         │
         ▼
 [ 5. Vendor Enters Last 4 Digits ]
         │
         ▼
 [ 6. Vendor Signs on Touchscreen ] ──► (Counter-signature stamped, status: 'fully_signed')
         │
         ▼
 [ 7. Dual-Signed PDF Available to Both Parties + WhatsApp Alert to Admin ]
```

### 3.1 Persona 1: Building Committee Chairman (יור ועד בית)
* **Goal**: Issue a formal, legally protected work order without printing, scanning, or meeting the contractor in person during work hours.
* **Journey**:
  1. Navigates to **Active Quotes** (`/admin/:tenantId/quotes`) -> clicks **הפק הסכם עבודה 📄**.
  2. Reviews scope, sets milestones (e.g., 30% advance, 70% upon completion), and clicks **חתום ואשר הזמנת עבודה ✍️**.
  3. Signs on the screen pad, confirms their name and phone, and clicks **אשר חתימה**.
  4. The system prompts to send the WhatsApp contract invitation to the contractor.

### 3.2 Persona 2: Winning Service Contractor (קבלן מבצע)
* **Goal**: Receive an authorized work order on mobile, verify the price and payment milestones, and confirm acceptance in under 30 seconds.
* **Journey**:
  1. Receives WhatsApp message: *"שלום דוד, בהמשך לזכייתך במכרז, הסכם העבודה נחתם ע״י הנהלת המתחם. לחתימתך ואישור תחילת העבודה: [קישור]"*.
  2. Clicks link -> lands directly on the contract modal in read-only mode showing the committee's signature and terms.
  3. Clicks **אישור וחתימה על ההסכם ✍️**.
  4. Enters the last 4 digits of their mobile phone number (identity verification).
  5. Enters their business ID (ח.פ. / עוסק מורשה / ת.ז.) and draws their signature on the mobile touch pad.
  6. Checks the legal acceptance box and clicks **חתום ואשר הסכם מחייב**.
  7. Instantly receives confirmation; can download the signed PDF.

---

## 4. Functional Requirements

### 4.1 Committee Signing Experience (Admin Portal)
| Req ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| **FR-SIGN-01** | Signature Trigger | In `WorkOrderContractModal`, before the agreement is signed, a prominent button **חתום על הזמנת העבודה ✍️** is displayed in the bottom action bar. |
| **FR-SIGN-02** | Signature Canvas | Opens an overlay with an HTML5 canvas allowing drawing via mouse or touch, a "Clear" (נקה) button, and an automatic date stamp. |
| **FR-SIGN-03** | Signer Metadata | Auto-populates committee representative name and phone from `adminUsers` / `rfq.createdBy`, editable if needed before signing. |
| **FR-SIGN-04** | State Transition & Term Locking | Upon signing, `contractExecution.status` transitions to `signed_by_admin`. All milestone editing, clause customizations, and waste text are strictly locked from further editing. |
| **FR-SIGN-05** | WhatsApp Dispatch | The WhatsApp message button updates to indicate that the contract has been signed by the committee and is ready for the contractor's signature. |

### 4.2 Contractor Signing Experience (Vendor Portal)
| Req ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| **FR-SIGN-06** | Read-Only Contract Presentation | When opened with `&view=contract`, the contractor sees the complete agreement and the committee's graphical signature already stamped in the committee signature box. |
| **FR-SIGN-07** | Signing Call-to-Action | If `status === 'signed_by_admin'`, a persistent primary button **אישור וחתימה על ההסכם (Sign Agreement) ✍️** is shown at the bottom. |
| **FR-SIGN-08** | Whitelist Identity Challenge | Clicking the sign button prompts for the **last 4 digits of the contractor's phone number**. Submission checks against `matchedVendor.phone` or `rfq.dispatchedVendors`. If incorrect, blocks signing with a clear error. |
| **FR-SIGN-09** | Business ID Capture | Captures the contractor's legal entity number (ח.פ. / ע.מ. / ת.ז.) to ensure commercial validity. |
| **FR-SIGN-10** | Contractor Signature Canvas | Mobile-optimized signature canvas with smooth vector curve interpolation (min height 160px), clear button, and touch support. |
| **FR-SIGN-11** | Statutory Consent Checkbox | Mandatory checkbox: *"אני מאשר כי קראתי את כל סעיפי ההסכם ואבני הדרך, וחתימתי זו מהווה התחייבות משפטית מלאה ומחייבת בהתאם לחוק חתימה אלקטרונית, התשס\"א-2001."* |
| **FR-SIGN-12** | Dual-Signed Finalization | Upon contractor signature, `contractExecution.status` updates to `fully_signed`, recording both signatures and timestamps. |
| **FR-SIGN-13** | Admin WhatsApp Alert | Dispatches an automated WhatsApp / system notification to the committee: *"הקבלן [שם] חתם על הסכם העבודה למכרז [כותרת]! ההסכם חתום וסופי."* |

### 4.3 Visual Document Presentation & PDF Generation
| Req ID | Requirement | Acceptance Criteria |
| :--- | :--- | :--- |
| **FR-SIGN-14** | Visual Stamp on Web Modal | In the signature section of `WorkOrderContractModal`, signatures are displayed as transparent PNG images above the respective signature line with name, title, and timestamp. |
| **FR-SIGN-15** | Official Status Ribbon | When `fully_signed`, a green legal badge **"הסכם חתום דיגיטלית ומחייב ע\"י שני הצדדים ✓"** appears at the top and bottom of the agreement. |
| **FR-SIGN-16** | Print & PDF Fidelity | The browser `@media print` styling correctly prints both signatures, tax IDs, and timestamps with crisp resolution on A4 paper. |

---

## 5. Technical Data Schema & Architecture

### 5.1 Firestore Data Model (`tenants/{tenantId}/rfqs/{rfqId}`)

```typescript
export interface ContractSignatureRecord {
  signerName: string;
  signerRole: string;             // e.g. "נציגות ועד הבית" or "קבלן מבצע"
  signatureDataUrl: string;       // Base64 PNG image (data:image/png;base64,...)
  signedAt: string;               // ISO 8601 Timestamp
  signerPhone?: string;
  companyId?: string;             // ח.פ. / עוסק מורשה / ת.ז.
  ipAddress?: string;             // Optional client IP for audit
  userAgent?: string;             // Client browser user-agent
}

export interface ContractExecutionData {
  status: 'draft' | 'signed_by_admin' | 'fully_signed';
  committeeSignature?: ContractSignatureRecord;
  vendorSignature?: ContractSignatureRecord;
  fullySignedAt?: string;
  contractVersion: number;
}

// Added to WorkQuoteRequest:
export interface WorkQuoteRequest {
  // ... existing fields
  contractExecution?: ContractExecutionData;
}
```

### 5.2 Security & Data Isolation
* **Cross-Tenant Guard**: Operations are strictly scoped to `tenants/{tenantId}/rfqs/{rfqId}`.
* **State Machine Protection**: 
  - Admin can sign only when RFQ is `awarded`.
  - Vendor can counter-sign only when status is `signed_by_admin`.
  - Once `fully_signed`, all contract terms, milestones, and signatures are permanently immutable.

---

## 6. Audit & Compliance Standards

### 6.1 Audit Log Events
The system emits dedicated audit records into the `audit_logs` collection:
1. `CONTRACT_SIGNED_BY_ADMIN`:
   ```json
   {
     "action": "CONTRACT_SIGNED_BY_ADMIN",
     "actor": { "uid": "admin_uid", "name": "אורן בודנר", "type": "admin" },
     "details": {
       "rfqId": "rfq_123",
       "rfqTitle": "איטום גג",
       "winningVendorName": "א.א. איטומים",
       "awardedPrice": 15200
     }
   }
   ```
2. `CONTRACT_FULLY_SIGNED`:
   ```json
   {
     "action": "CONTRACT_FULLY_SIGNED",
     "actor": { "uid": "vendor_uid", "name": "א.א. איטומים", "type": "vendor" },
     "details": {
       "rfqId": "rfq_123",
       "contractorCompanyId": "514892019",
       "totalWithVat": 17784
     }
   }
   ```

### 6.2 Legal Compliance (חוק חתימה אלקטרונית, התשס"א-2001)
To satisfy evidentiary requirements in Israeli small claims and civil courts:
- **Intent**: Demonstrated via explicit checkbox confirming binding agreement.
- **Identity**: Correlated through phone whitelist matching + last 4 digits challenge + Israeli corporate/ID number.
- **Integrity**: Terms and price locked upon admin signing; cannot be modified prior to contractor counter-signature.
- **7-Year Vaulting**: Document preserved under `audit_logs` and Firestore permanent records matching statutory period.

---

## 7. Success Metrics & KPIs

| Metric | Target | Measurement Method |
| :--- | :--- | :--- |
| **Contract Turnaround Time** | < 4 hours from award to fully signed | Difference between `awardedAt` and `contractExecution.fullySignedAt` |
| **Mobile Signing Success Rate** | > 95% on first attempt | Completed vendor signings without validation errors |
| **Zero-Print Adoption** | > 90% of awarded RFQs signed digitally online | Ratio of `fully_signed` RFQs vs manual paper printouts |
| **Dispute Reduction** | 100% reduction in scope/milestone disputes | Tenant committee support inquiries regarding contractor disagreements |

---

## 8. Definition of Ready (DoR) & Engineering Hand-off Checklist

- [x] Product requirements aligned with Stakeholder decisions (Admin signs first, 4-digit whitelist challenge, 1 committee signature).
- [ ] UI Component: `SignaturePadModal.tsx` reusable HTML5 canvas component with touch event handling.
- [ ] Admin flow integration in `WorkOrderContractModal.tsx`.
- [ ] Contractor flow integration in `ContractorQuotePortal.tsx`.
- [ ] Audit log formatting in `AuditExplorer.tsx`.
- [ ] Regression verification on mobile Safari (iOS) and Chrome (Android).

---

*End of PRD Document. Awaiting user review and sign-off.*
