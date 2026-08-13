# **TikTak Platform Pricing Strategy & Implementation Guide** 

_Transitioning from Per-Unit Pricing to Value-Driven Usage Tiers with Overage Controls_ 

## **1. Executive Summary & Strategic Rationale** 

Historically, TikTak was evaluated under a per-housing-unit pricing model. While easy to conceptualize, per-unit pricing creates friction during sales conversations with local committees (וועדים מקומיים) who fear paying high recurring fees for low resident engagement. By pivoting to a Ticket-Based Usage Tier Model (monthly quota + per-ticket overage fee), TikTak aligns its revenue directly with the operational value provided to the community. 

#### **💡 CORE VALUE PROPOSITION** 

A ticket-based quota model eliminates buyer hesitation by offering a low predictable baseline cost while securing high-margin revenue expansion as community usage grows. Overage pricing acts as a natural bridge that prompts customers to upgrade their plan voluntarily. 

## **2. Underlying Infrastructure Cost Breakdown** 

To establish sustainable margins, pricing must reflect the underlying cloud infrastructure costs per ticket. TikTak's stack relies on Google Cloud Platform (Firestore, Cloud Functions, Cloud Storage) and Meta/Twilio WhatsApp APIs. 

|**Service Component**|**Estimated Unit**<br>**Usage / Ticket**|**Direct Cost (USD)**|**Notes**|
|---|---|---|---|
|Firestore DB|1 Document Write,<br>~15 Document Reads|$0.00005|State changes, status<br>checks|
|Cloud Functions|2-3 Webhook & Logic<br>Invocations|$0.000002|Automated updates &<br>routing|
|Cloud Storage|1-2 Uploaded Media<br>Files (~3MB)|$0.00100|Resident photos /<br>audio logs|
|WhatsApp API|1 Session /<br>Notification Message|$0.015 - $0.030|Meta service<br>conversation fee|



**Total Variable Cloud Cost per Ticket: ~$0.02 to $0.04 (₪0.08 - ₪0.15).** Because messaging represents over 85% of variable costs, TikTak maintains gross profit margins well above 85-90% under all proposed tiers. 

## **3. Proposed Usage-Tiered Pricing Matrix** 

The matrix below outlines 5 subscription tiers. Higher tiers offer a lower per-ticket cost within quota, while overage pricing imposes a premium to incentivize plan upgrades. 

|**Tier License**|**Monthly Fee**|**Included**<br>**Tickets**|**Effective Rate**<br>**/ Ticket**|**Overage Fee**<br>**(Extra Ticket)**|**Target**<br>**Community**<br>**Size**|
|---|---|---|---|---|---|
|Micro / Starter|₪99 / mo|15 tickets|₪6.60|₪12.00 / ticket|Quiet / Small<br>(<50 units)|
|Basic|₪199 / mo|35 tickets|₪5.68|₪10.00 / ticket|Small (~100-<br>150 units)|
|Standard|₪399 / mo|80 tickets|₪4.98|₪8.00 / ticket|Mid-size<br>(~200-300<br>units)|
|Growth|₪699 / mo|160 tickets|₪4.36|₪7.00 / ticket|Large (~400-<br>600 units)|
|Enterprise|₪1,199 / mo|300 tickets|₪3.99|₪5.50 / ticket|Towns / Multi-<br>complexes|



## **4. Deep-Dive Recommendations & Business Logic** 

### **A. Safeguards Against Penalizing Resident Engagement** 

A major concern with quota-based pricing is that committees might discourage residents from reporting issues to avoid overages. To eliminate this friction: 

**1. Non-Billable Ticket Deductions:** Tickets flagged as 'Duplicate' (כפילות), 'Out of Scope' ( מחוץ לאחריות), or 'Test' should be automatically refunded to the monthly quota. 

**2. Spam & Flood Protection:** If a resident submits 5 tickets within 10 minutes regarding the same location, the bot should merge them into a single ticket thread. 

### **B. Soft Cushion & Rollover Quotas** 

To foster goodwill, implement a **Rollover Cushion** . Up to 20% of unused tickets from Month A carry over into Month B. Additionally, grant a 5-ticket buffer before overage fees kick in, ensuring minor seasonal spikes (e.g., winter storm damage) don't trigger immediate financial penalties. 

### **C. Proactive Upgrade Prompts** 

When a community reaches 80% of its monthly quota, send an automated WhatsApp/Email notification to the committee treasurer with an instant upgrade button: _"You have used 28 out of 35 tickets. Upgrade to Standard today for ₪399 and save up to 35% on overage charges."_ 

## **5. Technical & Operational Implementation Roadmap** 

### **Step 1: Real-Time Ticket Metering Engine** 

Implement an automated Firestore counter that increments upon ticket creation and decrements if a ticket is marked as non-billable by the admin. The system tracks reset dates matching the customer's billing cycle. 

### **Step 2: Automated Billing Integration (Stripe / Tranzila)** 

Integrate recurring billing webhooks. At the end of each monthly cycle, the system calculates (Total Created - Excluded Tickets - Monthly Base Quota). If overage > 0, an invoice line item for overage units is added automatically to the next billing cycle. 

### **Step 3: Admin Board Visibility & Resident UX** 

Add a progress bar widget at the top of the TikTak Web Admin Dashboard displaying current quota usage (e.g., '24/35 Tickets Used - 68%'). Ensure residents see zero billing details—the report submission flow remains completely smooth and frictionless. 

### **Step 4: Change Management & Client Migration** 

For existing pilot communities (e.g., Rehan), offer a 3-month price lock guarantee. Frame the new structure as a customer-centric optimization: 'We are moving to a fairer usage model where you only pay for active service utilization.' 

