---
description: Creating PRD docs
---

---
description: Transforms raw business requirements into a professional B2B Product Requirements Document (PRD)
---

# Workflow: Create B2B PRD

## Description
This workflow guides the agent through a discovery and documentation phase to produce an enterprise-grade PRD tailored for B2B environments.

## Steps

1. **Context Discovery**: 
   Interview the user to extract missing details. Specifically, ask for:
   - **The "Why"**: What is the core business problem?
   - **Target Persona**: Is this for the end-user (Individual Contributor) or the buyer (Stakeholder)?
   - **B2B Nuances**: Are there specific security, compliance, or API integration requirements?

2. **Persona & Strategic Mapping**: 
   Apply the `@product-management` context. Use this knowledge base to map the requirements to industry-standard B2B frameworks (e.g., focusing on ROI, scalability, and administrative controls).

3. **Document Generation**: 
   Invoke the `prd-documenter` skill. Direct the skill to create a new markdown file in the `docs/PRDS/` directory. Ensure the document follows this structure:
   - **Status & Ownership**: Versioning and stakeholders.
   - **Problem Statement**: The business pain point.
   - **Goals & Non-Goals**: Define the scope clearly to avoid "feature creep."
   - **User Stories**: Acceptance criteria formatted for engineering hand-off.
   - **Analytics**: What B2B metrics (e.g., Churn reduction, LTV increase) will define success?

4. **Artifact Presentation**: 
   Display the generated PRD as an **Artifact** within the IDE. Do not just provide a link; show the content for immediate review.

5. **Iterative Refinement**: 
   Ask the user for feedback specifically regarding the **Functional Requirements** and **Prioritization**. 

6. **Finalization**: 
   Upon approval, confirm the file is saved and offer to generate a corresponding **Technical Design Document (TDD)** based on the PRD.
