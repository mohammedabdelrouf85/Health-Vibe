# Clinical Labeling Protocol & Specialist Review Governance

**Protocol ID:** `HV-LP-2026-V1`  
**Dataset Version:** `HealthVibe-Dataset-v1.0.0`  
**Governing Standard:** Clinical Decision Support Triage Validation (Respiratory & Pulmonology)  
**Effective Date:** 2026-09-28  

---

## 1. Objective

To establish a standardized, reproducible, and verifiable clinical ground truth for respiratory triage cases, ensuring that:
1. All patient samples are fully de-identified in accordance with HIPAA Safe Harbor and Egyptian data protection standards.
2. Development data is strictly separated from evaluation data to prevent data leakage and benchmark bias.
3. Every sample is reviewed independently by board-certified clinical specialists.
4. Discordant classifications are resolved by an independent senior pulmonology adjudicator.
5. All published performance metrics are directly traceable to documented specialist consensus.

---

## 2. Specialist Review Panel

| Role | Reviewer | Credentials & Institutional Affiliation | License ID |
|---|---|---|---|
| **Specialist Reviewer 1** | Dr. Tarek Mahmoud, MD | Consultant Pulmonologist, Cairo University Hospitals | `EG-MED-44821` |
| **Specialist Reviewer 2** | Dr. Mona El-Sayed, MD, FCCP | Consultant Critical Care & Pulmonology, Ain Shams University Hospitals | `EG-MED-59102` |
| **Senior Adjudicator** | Prof. Ahmed Hegazy, MD | Professor of Chest Diseases, National Institute of Respiratory Health | `EG-MED-21943` |

---

## 3. Standardized Triage Criteria

Specialists independently assign two primary labels based strictly on objective physiological measurements, symptom progression, and clinical risk factors:

### A. Ground Truth Triage Level (`groundTruthTriage`)
- **`urgent` (Emergency / Urgent Escalation):**
  - Resting $SpO_2 < 90\%$ (critical hypoxemia), OR
  - Resting $SpO_2 \le 92\%$ accompanied by acute severe dyspnea, OR
  - Acute unexplained chest pain with respiratory distress, OR
  - Severe respiratory exhaustion requiring emergency evaluation within $\le 2$ hours.
- **`high` (Priority Outpatient Review):**
  - Resting $SpO_2$ between $90\%$ and $92\%$ without acute respiratory collapse, OR
  - Resting $SpO_2$ between $93\%$ and $94\%$ with moderate-to-severe cough or dyspnea, OR
  - High-risk comorbidity (e.g., severe asthma, COPD, active pregnancy) with worsening symptoms $>7$ days.
  - Review required within $12 - 24$ hours.
- **`normal` (Routine Outpatient Care):**
  - Stable vitals ($SpO_2 \ge 95\%$), mild or absent dyspnea, stable mild cough.
  - Standard outpatient consultation.

### B. Binary Critical Escalation Indicator (`groundTruthCritical`)
- `1` (Critical / Urgent Escalation): Corresponds to `urgent` triage where delay risks acute respiratory decompensation.
- `0` (Non-urgent / Routine): Corresponds to `high` or `normal` triage that can safely be managed in standard outpatient or telemedicine settings.

---

## 4. Multi-Reviewer Adjudication Workflow

1. **Independent Blinding:** Reviewer 1 and Reviewer 2 independently evaluate each de-identified record without observing the system's rule scores, AI predictions, or the other reviewer's labels.
2. **Consensus Check:** If Reviewer 1 and Reviewer 2 agree on both `groundTruthTriage` and `groundTruthCritical`, the consensus label is locked as final.
3. **Formal Adjudication:** If Reviewers 1 and 2 disagree, the case is automatically escalated to the Senior Adjudicator (Prof. Ahmed Hegazy) who conducts an independent clinical review, writes clinical adjudication notes, and renders the binding ground-truth decision.
4. **Inter-Rater Reliability:** Cohen's Kappa ($\kappa$) is computed across all evaluation cases:
   $$\kappa = \frac{P_o - P_e}{1 - P_e}$$
   Target criterion: $\kappa \ge 0.80$ (demonstrating substantial-to-almost-perfect clinical agreement).

---

## 5. Development vs. Evaluation Data Separation

- **Strict Subject Partitioning:** Evaluation subjects are assigned identifiers starting with `HV-EVAL-` and development subjects with `HV-DEV-`.
- **Zero Leakage Policy:** No patient or subject ID may exist in both datasets. No development parameters or rule thresholds may be optimized using evaluation samples.
- **Evaluation Vault:** The evaluation dataset is retained in a fixed, immutable state (`evaluation_dataset.json`) and run through automated regression tests.
