# TikTak Ticket-Based Pricing Justification Paper

**Document Title**: TikTak Ticket-Based Pricing Justification & Unit Economics Paper  
**Author**: TikTak Product & Financial Strategy Team  
**Date**: August 2026  
**Status**: Approved / Active Reference  
**Related Documents**: 
* [TikTak_Tickets_Quota_Pricing_Strategy_Implementation_Guide.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/TikTak_Tickets_Quota_Pricing_Strategy_Implementation_Guide.md)
* [pricing_licensing_strategy.md](file:///c:/Users/orenb/OneDrive/Desktop/TikTak/docs/pricing_licensing_strategy.md)

---

## 1. Executive Summary

This paper provides the economic, financial, and strategic justification for **TikTak's Ticket-Based Usage Pricing Model**. Specifically, it addresses the financial bridge between the **raw cloud infrastructure cost of ~₪0.15 per ticket** and the **effective ticket price starting at ₪3.99 – ₪6.60 per ticket** across subscription tiers.

In modern B2B SaaS applications, pricing is dictated by **value delivered to the customer**, **all-in operational expenses (COGS & CAC)**, **capacity utilization dynamics**, and **absorption of non-billable platform usage**, rather than simple cost-plus manufacturing markups.

---

## 2. Granular Infrastructure & Variable Cost Breakdown

Direct cloud infrastructure expenses are incurred each time a resident submits and resolves a maintenance ticket via the TikTak platform.

| Service Component | Unit Usage per Ticket | Direct Cost (USD) | Direct Cost (ILS @ 3.65) | Operational Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Firestore DB** | 1 Write, ~15 Reads | $0.00005 | ₪0.00018 | State updates, status checks, audit logs |
| **Cloud Functions** | 2-3 Webhooks & AI Trigger | $0.000002 | ₪0.00001 | Automated routing, Gemini AI inference |
| **Cloud Storage (GCS)** | 1-3 Photos (~3MB compressed) | $0.00100 | ₪0.00365 | High-availability image hosting |
| **WhatsApp Business API** | Meta Session & Status Updates | $0.015 - $0.030 | ₪0.055 - ₪0.110 | WhatsApp inbound/outbound webhooks |
| **Total Direct Infra Cost** | **Per Single Ticket** | **~$0.02 – $0.04** | **~₪0.08 – ₪0.15** | **Pure Variable Server COGS** |

> [!NOTE]
> Over 80–85% of direct variable cloud expenses stem from WhatsApp Business API messaging fees rather than cloud database compute or image storage.

---

## 3. Fully-Loaded COGS & Operating Expenses

While raw cloud infrastructure costs ₪0.15 at maximum, delivering a high-reliability commercial B2B platform requires absorbing additional recurring operating expenses:

1. **Payment Gateway & Financial Clearing**: Credit card clearing (Stripe, Tranzila, Bit) incurs ~1.5%–2.5% per transaction plus fixed clearing fees per monthly invoice.
2. **Customer Onboarding & Support**: Non-technical building committee members (*Vaad*) require support, phone setup assistance, and initial configuration.
3. **Customer Acquisition Cost (CAC) & Physical Assets**: Direct sales outreach, digital marketing, and printed physical QR code lobby signs provided to building committees.
4. **Platform R&D & Engineering**: Continuous software maintenance, security updates, SLA tracking engines, and AI model tuning.
5. **Operational Overhead & Taxes**: Corporate compliance, accounting, 17% VAT (included in list prices), server monitoring tools (e.g., Sentry, Cloud Logging).

---

## 4. The 4 Key Strategic Drivers Behind the ₪3.99 Ticket Price

```
+-------------------------------------------------------------------------+
|                  TIKTAK UNIT ECONOMICS & PRICING BRIDGE                  |
+-------------------------------------------------------------------------+
|                                                                         |
|  [ Raw Infra Cost ] ------------> ₪0.15 / ticket                         |
|         +                                                               |
|  [ Payment, Support & CAC ] ----> ~₪0.85 / ticket                       |
|         +                                                               |
|  [ Non-Billable Absorption ] ---> ~₪0.50 / ticket (Duplicates, Spam)     |
|         +                                                               |
|  [ Capacity Utilization ] ------> ~₪1.00 / ticket (Unused Quota Buffer) |
|         +                                                               |
|  [ SaaS Gross Margin Target ] --> ~₪1.49 / ticket                       |
|                                                                         |
|  =====================================================================  |
|  TOTAL EFFECTIVE TICKET PRICE:  ₪3.99 / ticket (Enterprise Tier)        |
+-------------------------------------------------------------------------+
```

### Driver 1: Capacity Utilization & Realized Revenue
The **₪3.99** rate in the Enterprise plan (₪1,199/month for 300 included tickets) represents the **effective rate at 100% quota utilization**:

$$\text{Effective Rate at 100\% Quota} = \frac{\text{Monthly Flat Fee}}{\text{Included Ticket Quota}} = \frac{₪1,199}{300 \text{ tickets}} = ₪3.99 \text{ / ticket}$$

* **Capacity Dynamics**: Building complexes experience seasonal variations. In a quiet month where a 300-ticket complex only submits 150 tickets, TikTak still collects the ₪1,199 flat fee.
* In that scenario, the **actual realized revenue per ticket is $1,199 / 150 = ₪8.00 per ticket**.
* The ₪3.99 pricing floor guarantees customer budget predictability while securing a predictable recurring revenue floor for TikTak.

### Driver 2: Absorption of Non-Billable & Free Platform Usage
To maintain a zero-friction reporting experience for residents and foster customer goodwill, TikTak provides non-billable allowances:
* **Duplicate & Spam Deductions**: Tickets marked as duplicates, test reports, or out-of-scope issues are automatically refunded to the monthly quota (incurring cloud infra costs without producing revenue).
* **Quota Rollovers & Grace Buffers**: Up to 20% of unused quota rolls over into the next billing month, alongside a 5-ticket buffer before overage fees apply.
* **Spam & Flood Merging**: Multiple rapid submissions from a resident are merged into single ticket threads.

The margin on valid billable tickets must absorb the non-billable platform compute and messaging overhead.

### Driver 3: Value-Based Pricing & Customer ROI
Software pricing in B2B SaaS is driven by customer ROI rather than cost-plus manufacturing markup:
* For a 500-unit residential complex or local council, resolving 300 maintenance issues efficiently saves committee members dozens of hours in messaging group noise, manual vendor tracking, and resident complaints.
* Paying **~₪4.00 per resolved building issue** represents an insignificant expense compared to the cost of a single maintenance vendor dispatch (typically ₪300–₪800+).

### Driver 4: SaaS Financial Health & Gross Margin Benchmarks
Standard B2B SaaS business models require **80%–90%+ Gross Margins** on pure variable cloud infrastructure. This margin buffer is required to:
* Reinvest in continuous product engineering and feature development.
* Maintain cash flow independence without relying on heavy venture debt or equity dilution.
* Absorb spikes in WhatsApp API pricing or GCP cloud resource utilization.

---

## 5. Summary Financial Matrix

| Subscription Tier | Monthly Fee (ILS) | Included Tickets | Effective Rate / Ticket | Overage Rate / Ticket | Target Community Size | Estimated Gross Margin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Micro / Starter** | ₪99 / mo | 15 tickets | ₪6.60 | ₪12.00 / ticket | Small (<50 units) | ~97% |
| **Basic** | ₪199 / mo | 35 tickets | ₪5.68 | ₪10.00 / ticket | Mid (~100–150 units) | ~96% |
| **Standard** | ₪399 / mo | 80 tickets | ₪4.98 | ₪8.00 / ticket | Large (~200–300 units)| ~95% |
| **Growth** | ₪699 / mo | 160 tickets | ₪4.36 | ₪7.00 / ticket | Major (~400–600 units)| ~94% |
| **Enterprise** | ₪1,199 / mo | 300 tickets | ₪3.99 | ₪5.50 / ticket | Municipal / Multi-complex | ~93% |

---

## 6. Conclusion & Executive Recommendation

Pricing the minimum ticket rate at **₪3.99** (Starter at **₪6.60**) against a **₪0.15** raw cloud infrastructure cost is a financially sound, industry-standard SaaS strategy. 

It balances **radical customer simplicity** (low predictable monthly baseline fees) with **robust unit economics**, ensuring TikTak remains highly profitable while offering building committees an undeniable return on investment (ROI).
