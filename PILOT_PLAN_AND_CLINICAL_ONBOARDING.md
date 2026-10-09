# Health Vibe AI - Clinical Pilot Plan (1 Clinic, 3 Doctors)
## Structured Evaluation, Safety Verification, Acceptance Scenarios & Stopping Protocol

**Document ID:** HV-PILOT-PLAN-2026-V1  
**Target Organization:** One Partner Outpatient Pulmonary / Medical Clinic (`[Partner Clinic Name]`)  
**Participating Clinicians:** Three (3) Licensed Physicians (`[Doctor 1]`, `[Doctor 2]`, `[Doctor 3]`)  
**Pilot Duration:** 30 Days (4 Weeks active clinical intake + 1 week closeout audit)  
**Governance Standard:** Good Clinical Practice (GCP), Egyptian Personal Data Protection Law (Law 151/2020), ISO/IEC 27035, Health Vibe AI Clinical Governance Framework  
**Ethical Guardrail:** Zero fabricated approvals, organizations, or users. Unsigned and unverified items are explicitly marked as `[Pending Formal Partner Execution]`.

---

## 1. Pre-requisites Verification: Security & Medical-Review Tasks

Before enrolling a single patient or clinic in this pilot, all preceding security hardening and clinical governance milestones must be verified as satisfied.

### 1.1 Technical & Clinical Pre-requisites Status Matrix

| Domain | Task / Requirement | System Evidence & Test Verification | Status |
|---|---|---|---|
| **Clinical Governance** | Deterministic Triage Rule Engine (v1.0 / v1.1) | Evaluated on held-out dataset ($N=80$ cases, 100% Sensitivity, 94.7% Specificity, Brier 0.0395). Verified in `tests/dataset_and_clinical_evaluation.test.js` & `reports/clinical_evaluation_report.md`. | ✅ Satisfied (System Level) |
| **Clinical Safety** | Prohibition of Autonomous AI Diagnosis | System strictly enforces advisory queueing signal only; patient reports remain locked until signed by a licensed physician. Verified in `tests/clinical_report_integrity.test.js`. | ✅ Satisfied |
| **Clinical Safety** | Observational Longitudinal Trends Guardrail | Longitudinal charts enforce `diagnosticPolicy: 'NO_AUTOMATED_DIAGNOSIS_FROM_CHART'` with prominent clinical disclaimers. Verified in `tests/assessment_comparison_and_longitudinal_tracking.test.js`. | ✅ Satisfied |
| **Clinical Safety** | Emergency Red-Flag Escalation | Instant detection of critical hypoxemia (SpO2 < 90%) and chest pain; triggers immediate Egyptian emergency 123 banner and urgent doctor queue alert. | ✅ Satisfied |
| **Multi-Tenancy** | Clinic Data Isolation & B2B Scoping | Complete tenant isolation: Clinic A doctors and admins cannot access Clinic B cases, appointments, or records (HTTP 403 Forbidden). Verified in `tests/api_clinic_isolation.test.js`. | ✅ Satisfied |
| **Security & RBAC** | Role-Based Access Control Matrix | Strict separation of roles (`patient`, `doctor`, `clinic_admin`, `support`, `super_admin`). Unapproved doctors cannot review cases. Verified in `tests/rbac_matrix.test.js`. | ✅ Satisfied |
| **Data Privacy** | Sensitive PHI Redaction for Support Users | Vital signs, oxygen levels, doctor diagnoses, and prescriptions are redacted for support role personnel. Verified in `app/app.js` and report tests. | ✅ Satisfied |
| **Data Integrity** | Cryptographic Digital Seal & QR Verification | Approved clinical reports receive SHA-256 digital seals and unique audit references (`HV-REP-...`). Tamper detection verified in `tests/report_pdf_share_verification.test.js`. | ✅ Satisfied |
| **Audit Logging** | Immutable Append-Only Audit Trail | All case submissions, status transitions, doctor reviews, and report views are logged in Firestore `audit_events`. Verified in `tests/audit_trail_system.test.js`. | ✅ Satisfied |
| **Patient Privacy** | Explicit Informed Consent Lifecycle | Mandatory acceptance of privacy policy, data processing, and AI advisory notice prior to assessment submission. Consent withdrawal tested in `tests/privacy_data_lifecycle.test.js`. | ✅ Satisfied |
| **External Compliance** | Formal Institutional Review / Ethics Approval | Requires formal execution with the designated partner clinic's ethics or clinical governance board prior to live intake. | ⏳ Pending Partner Kickoff (No Fabricated Sign-offs) |
| **External Compliance** | Formal Egyptian Regulatory Advisory | Formal engagement with the Egyptian Ministry of Health / Data Protection Authority for commercial licensure. | ⏳ Outside Pilot Scope (Advisory Decision-Support Only) |

---

## 2. Pilot Structure: 1 Clinic & 3 Doctors

### 2.1 Pilot Clinic Profile
- **Clinic Identifier:** `pilot-clinic-01`
- **Institution Name:** `[Partner Clinic Legal Name]` *(e.g., Specialized Pulmonary & Chest Clinic)*
- **Facility Type:** Outpatient Pulmonary Care / Polyclinic
- **Location:** `[City, Governorate, Egypt]`
- **Operating Hours:** Saturday – Thursday, 09:00 AM – 09:00 PM CLT
- **Expected Daily Respiratory Intake:** 15 – 25 patients/day
- **Clinic Administrator Lead:** `[Clinic Admin / Operations Manager Name]`

### 2.2 Participating Physicians Roster

| Role | Pilot Designation | Professional Profile & Scope | Responsibilities | Account / Identifier |
|---|---|---|---|---|
| **Doctor 1** | **Lead Pulmonologist & Medical Director** | Senior Consultant Pulmonologist (`[Dr. Lead Name, MD]`, License: `[EG-MED-XXXXX]`) | Overall clinical oversight of the pilot; handles clinical escalations; chairs weekly clinical feedback meetings; exercises final safety sign-off. | `doctor-lead@pilot-clinic.internal` (`pilot-doc-1`) |
| **Doctor 2** | **Attending Pulmonologist (Primary Queue Reviewer)** | Specialist Pulmonologist (`[Dr. Attending Name, MD]`, License: `[EG-MED-YYYYY]`) | Daily active review queue management; clinical assessment verification; differential diagnosis entry; prescription issuance; report approval. | `doctor-attending@pilot-clinic.internal` (`pilot-doc-2`) |
| **Doctor 3** | **Specialist Pulmonologist (On-Call & Follow-up Lead)** | Associate Specialist Pulmonologist (`[Dr. Specialist Name, MD]`, License: `[EG-MED-ZZZZZ]`) | Longitudinal assessment comparisons; setting doctor-approved reassessment plans; handling supplementary info requests; emergency case liaison. | `doctor-specialist@pilot-clinic.internal` (`pilot-doc-3`) |

*Note: All account identifiers and names above are placeholders for the designated clinic personnel and must be verified against official Syndicate licenses during on-site onboarding.*

---

## 3. Pilot Duration & Phased Timeline

The pilot is planned for **30 calendar days (4 active clinical intake weeks)** preceded by a 5-day setup and pre-pilot dry run, and followed by a 1-week closeout evaluation.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│     Phase 0      │   │     Phase 1      │   │     Phase 2      │   │     Phase 3      │   │     Phase 4      │
│  Setup & Dry Run │ → │ Calibrated Intake│ → │ Full Active Flow │ → │ Transition/Review│ → │ Closeout & Audit │
│    (Days -5..0)  │   │  (Week 1, Days1-7)│  │ (Weeks 2-3, 8-21)│   │ (Week 4, 22-30)  │   │  (Days +1..+7)   │
└──────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘
```

### Phase 0: Setup, Configuration & Pre-Pilot Dry Run (Days -5 to Day 0)
- Provision dedicated tenant: `clinicId = "pilot-clinic-01"`.
- Provision accounts for 3 participating doctors and 1 clinic administrator.
- Hardware & Network Check: Confirm tablet/workstation compatibility, Wi-Fi stability, and certified pulse oximeter calibration.
- Conduct complete Staff Training Program (Modules 1, 2, 3).
- Execute all 7 Clinical Acceptance Scenarios in staging environment using synthetic test records.
- Complete and sign the Pre-Pilot Security & Clinical Readiness Certificate.

### Phase 1: Calibrated Pilot (Week 1, Days 1 – 7)
- **Target Volume:** 8 – 12 patients/day (Controlled intake).
- **Protocol:** Dual-verification mode. The doctor examines the patient in person first, reviews the platform's intake and rule-based priority signal, and records any discrepancies.
- **Daily Debrief:** 15-minute end-of-day check-in between Lead Pulmonologist and Health Vibe AI Technical Liaison.

### Phase 2: Full Clinical Operational Flow (Weeks 2 – 3, Days 8 – 21)
- **Target Volume:** 20 – 30 patients/day.
- Patient self-intake or nurse-assisted kiosk intake in waiting area.
- Attending doctor reviews queue in real time, issues certified reports, schedules follow-up reassessment reminders.
- Longitudinal tracking enabled for returning patients (measurement deltas & trend charts).
- Weekly structured feedback logging.

### Phase 3: Longitudinal Review & Reassessment Audit (Week 4, Days 22 – 30)
- Evaluate patient adherence to doctor-scheduled reassessment reminders (24h, 48h, 7d).
- Validate consistency of measurement comparison tables and missing-metric badging.
- Audit report verification times and doctor digital seal authenticity.

### Phase 4: Pilot Closeout, Outcome Audit & Decision (Days +1 to +7)
- System data export and archiving according to data retention agreement.
- Final KPI Scorecard calculation (Clinical safety, concordance, turnaround time, user satisfaction).
- Compilation of Pilot Closeout Governance Report.
- Bilateral decision meeting: Transition to commercial SaaS subscription, expansion, or clean decommissioning.

---

## 4. End-to-End Clinical Acceptance Scenarios

Prior to initiating live patient intake, the three physicians and clinic administrator must observe and approve the following test scenarios:

### Scenario 1: Standard Intake & Rule-Based Advisory Prioritization
- **Patient Profile:** 42-year-old male, SpO2 96%, moderate dry cough, 3 days duration, non-smoker.
- **Expected Action:**
  - Intake successfully records vitals and patient consent.
  - Clinical rules engine calculates points = 1 (`moderate_cough`).
  - Priority set to `normal`. Report locked for patient viewing (`🔒 Pending Physician Review`).
  - Case appears in Doctor Review Queue with `normal` badge.

### Scenario 2: Severe Hypoxemia Emergency Red-Flag Escalation
- **Patient Profile:** 58-year-old female, SpO2 86%, acute dyspnea, severe chest tightness.
- **Expected Action:**
  - System immediately triggers prominent Red-Flag Emergency Banner:
    *"Immediate Medical Attention Advised: Oxygen saturation (86%) is dangerously low. Please call emergency services (123) or visit the nearest ER immediately."*
  - Dedicated call button `tel:123` rendered with high contrast.
  - Case flagged in Doctor Queue with `🚨 URGENT` priority and audio/visual alert.
  - Triage score explicitly badged as unvalidated rule score; patient care routed to immediate medical intervention.

### Scenario 3: Physician Clinical Examination, Diagnosis & Certified Report Issuance
- **Actor:** Doctor 2 (`[Dr. Attending Name]`).
- **Expected Action:**
  - Doctor opens case from queue, reviews vitals and symptom breakdown.
  - Doctor inputs official clinical diagnosis: *"Acute Bronchitis with Mild Airway Hyperresponsiveness"*.
  - Doctor prescribes medication regimen: *"Salbutamol Inhaler 100 mcg (2 puffs PRN), Ambroxol Syrup 30mg TID"*.
  - Doctor adds clinical care instructions and clicks **"Approve & Issue Report"**.
  - System archives snapshot, generates SHA-256 hash, issues QR code (`HV-REP-...`), and unlocks report for patient.

### Scenario 4: Request for Supplementary Medical Information
- **Actor:** Doctor 3 (`[Dr. Specialist Name]`).
- **Expected Action:**
  - Case presents missing body temperature and ambiguous duration.
  - Doctor selects **"Request More Information"** and writes: *"Please record morning body temperature and specify if fever preceded cough."*
  - Case status updates to `more_info_requested`.
  - Patient receives urgent notification with direct link to provide requested readings.
  - Upon patient resubmission, case returns to top of doctor review queue with updated timestamp.

### Scenario 5: Independent Longitudinal Reassessment & Trend Comparison
- **Actor:** Patient returning 3 days after initial visit.
- **Expected Action:**
  - Patient clicks **"Start Independent New Assessment"**.
  - Previous case record remains completely unmodified in Firestore (100% baseline preservation).
  - New case is created with `previousCaseId` pointing to baseline case.
  - Doctor opens **"Compare Assessments & Trends"** view:
    - SpO2: 94% $\rightarrow$ 98% (Delta: +4%, favorable).
    - Respiratory Rate: unmeasured $\rightarrow$ explicitly badged as `⚠️ Missing / Unmeasured (breaths/min)`. Never displayed as 0!
    - Observational SVG trend chart plots trajectory with explicit disclaimer banner:
      *"Observation Only: Diagnostic evaluation is strictly performed by authorized physicians; automated diagnosis is strictly prohibited."*

### Scenario 6: Doctor-Approved Reassessment Reminder Scheduling
- **Actor:** Doctor 1 (`[Dr. Lead Name]`).
- **Expected Action:**
  - In comparison view, doctor selects **"Schedule Reassessment Plan"**: interval `48h`, priority `high`, instructions: *"Recheck resting SpO2 and monitor morning cough."*
  - System registers plan with `diagnosisPolicy: 'NO_AUTOMATED_DIAGNOSIS_FROM_CHART'`.
  - Notification queue schedules automated reminder dispatch at $t + 48\text{ hours}$.
  - Patient timeline records the active follow-up plan.

### Scenario 7: Multi-Tenant Clinic Data Isolation (Zero PHI Leakage)
- **Actor:** External clinic admin (`clinic-b`) or unauthorized doctor.
- **Expected Action:**
  - Request made to `/api/patient/:id/assessments/latest` or queue for `pilot-clinic-01`.
  - Server middleware inspects `req.user.clinicId`.
  - Request strictly rejected with HTTP 403 `ACCESS_DENIED`.
  - Audit event `UNAUTHORIZED_CLINIC_ACCESS_ATTEMPT` recorded in Firestore.

---

## 5. Staff Training Curriculum

| Module | Target Audience | Duration | Key Learning Objectives | Verification Method |
|---|---|---|---|---|
| **Module 1: Administrative & Reception Onboarding** | Clinic Receptionists, Intake Staff | 60 mins | Patient registration; guiding patients through digital intake; obtaining explicit privacy consent; explaining that the system is decision support, not an automated doctor; handling lost accounts. | Practical intake walkthrough; 5-question comprehension quiz. |
| **Module 2: Nursing & Triage Vital Signs Protocol** | Clinic Triage Nurses | 90 mins | Standardized pulse oximeter placement (clean dry finger, waiting 30 seconds for stable reading); recording body temperature and respiratory rate; identifying missing measurements; immediate escalation protocol for SpO2 < 90%. | Hands-on vital recording test (3 simulated patients). |
| **Module 3: Physician Workflow & Clinical Governance** | 3 Participating Doctors | 120 mins | Navigating Doctor Queue; interpreting rule engine points as advisory signals; entering differential diagnoses & Rx; approving and signing certified reports; comparing longitudinal trends; scheduling reassessment plans; understanding the circuit breaker stopping protocol. | End-to-end execution of Scenarios 1–6 in staging; signed training completion sheet. |

---

## 6. Operations & Support Plan

### 6.1 Support Tiers & SLA Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: Clinic Operational Liaison                              │
│ • Local clinic coordinator on-site / dedicated WhatsApp channel  │
│ • Handles: Hardware questions, user login, patient guidance     │
│ • Response Time: Immediate (< 5 minutes)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Escalates technical / platform issues
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Tier 2: Health Vibe AI Engineering Support                      │
│ • Email: support@healthvibe.ai | Dedicated Hotline: [Hotline]   │
│ • Handles: Platform errors, sync failures, account provisioning │
│ • Response SLA: < 15 mins (Urgent), < 1 hour (Routine)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Escalates clinical / safety anomalies
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Tier 3: Clinical Safety & Medical Governance Board              │
│ • Lead Clinical Officer & System Owner (Phone Bridge)           │
│ • Handles: Suspected triage misrouting, adverse events, stop    │
│ • Response SLA: < 15 mins (24/7 during pilot operating hours)   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Contact Escalation Roster
- **Tier 1 (Clinic Liaison):** `[Clinic Coordinator Name]`, Phone: `[Local Phone]`
- **Tier 2 (Engineering Lead):** Health Vibe AI Operations Team, Email: `support@healthvibe.ai`
- **Tier 3 (Clinical Safety Lead):** Health Vibe AI Medical Director, Emergency Bridge: `safety@healthvibe.ai`

---

## 7. Pilot Success Metrics & Target KPIs

| KPI Category | Metric Name | Definition & Measurement Method | Target Goal | Failure Threshold (Review Trigger) |
|---|---|---|---|---|
| **Clinical Safety** | Critical Hypoxemia Sensitivity | Percentage of true SpO2 < 90% cases correctly prioritized as Urgent. | **100%** (Zero missed) | $< 100\%$ (Immediate Circuit Breaker) |
| **Clinical Safety** | Zero Autonomous AI Diagnosis | Verification that 100% of issued reports have attending physician sign-off. | **100%** | $< 100\%$ |
| **Clinical Concordance**| Triage Recommendation Agreement | Concordance between rule-based priority and doctor's independent assessment. | $\ge 90\%$ | $< 80\%$ |
| **Operational Efficiency**| Physician Review Turnaround Time | Median time from case submission to physician report approval. | $\le 20\text{ mins}$ | $> 45\text{ mins}$ |
| **Operational Efficiency**| Patient Intake Completion Time | Time required for patient/nurse to complete vital & symptom intake. | $\le 4\text{ mins}$ | $> 8\text{ mins}$ |
| **Clinical Follow-up** | Reassessment Reminder Adherence | Percentage of patients completing doctor-scheduled follow-up reassessment. | $\ge 75\%$ | $< 50\%$ |
| **Platform Reliability**| Clinic Hours System Uptime | Availability of web app and backend during 09:00 - 21:00 CLT. | $\ge 99.8\%$ | $< 99.0\%$ |
| **Data Security** | Cross-Tenant Data Isolation | Incidents of cross-clinic or unauthorized case access. | **0 Incidents** | $\ge 1$ (Immediate Shutdown) |
| **User Satisfaction** | Physician Net Usability Score | Post-pilot survey on clinical utility, workflow fit, and ease of use (scale 1-5). | $\ge 4.2 / 5.0$ | $< 3.5 / 5.0$ |

---

## 8. Circuit Breaker: Process for Stopping the Pilot

Patient safety takes absolute precedence over pilot completion. The pilot incorporates an automatic **Circuit Breaker Protocol** that immediately halts digital intake if predetermined safety or operational triggers are tripped.

### 8.1 Mandatory Stopping Triggers
1. **Critical Clinical Misrouting (Sev-1):** Any instance where a patient with acute severe hypoxemia (SpO2 < 90%) or life-threatening symptoms was categorized as `normal` by the advisory triage engine.
2. **Security or Privacy Breach (Sev-1):** Any breach of multi-tenant isolation, cross-patient data leakage, or unauthorized credential exposure.
3. **High Clinical Disagreement Rate:** More than 10% of cases in any 48-hour window flagged by the attending physicians as clinically unsound or misleading.
4. **Physician Safety Veto:** Formal written objection by Doctor 1 (Medical Director) or any two attending physicians requesting suspension.
5. **Technical Outage During Peak Hours:** System downtime exceeding 60 cumulative minutes during clinic operational hours.

### 8.2 Immediate Step-by-Step Suspension Runbook

```
Step 1: Immediate Freeze
  └─ Lead Doctor or System Admin triggers "EMERGENCY PILOT FREEZE" in Admin Console.
  └─ The intake portal displays: "Digital intake paused for scheduled clinical review. Please proceed to clinic triage desk."

Step 2: Instant Reversion to Standard Clinic Workflow
  └─ Clinic reception immediately transitions all waiting patients to 100% traditional paper / local EMR workflow.
  └─ Zero delay or disruption to active patient consultations.

Step 3: Patient Safety Reconciliation
  └─ Attending physicians manually cross-check all cases submitted within the previous 24 hours.
  └─ Any patient whose assessment was pending or in question is contacted by telephone within 2 hours.

Step 4: Emergency Incident Bridge (Within 4 Hours)
  └─ Joint emergency session convened between Doctor 1, Clinic Admin, Health Vibe AI Technical Lead, and Medical Director.
  └─ Root-cause analysis initiated; system logs, rule traces, and audit records locked for forensic review.

Step 5: Written Resolution or Formal Termination (Within 24 Hours)
  └─ If issue is a remediable technical bug with zero clinical harm: Deploy patch to staging, re-test Scenarios 1-7, obtain written re-approval from Doctor 1 before unfreezing.
  └─ If issue represents clinical safety hazard or algorithmic defect: Terminate pilot permanently, execute Letter of Intent termination clause, and issue formal post-mortem report.
```

---

## 9. Pilot Authorization & Sign-off Block

*(To be signed during Phase 0 Kickoff Meeting upon completion of Pre-Pilot Verification. No pre-filled or fabricated signatures.)*

```
FOR HEALTH VIBES AI:

Signature:  _________________________________________
Name:       _________________________________________
Title:      System Owner / Technical Lead
Date:       _________________________________________


FOR PARTNER CLINIC:

Signature:  _________________________________________
Name:       _________________________________________
Title:      Medical Director & Lead Pulmonologist (Doctor 1)
License:    [Syndicate License Number]
Date:       _________________________________________
```
