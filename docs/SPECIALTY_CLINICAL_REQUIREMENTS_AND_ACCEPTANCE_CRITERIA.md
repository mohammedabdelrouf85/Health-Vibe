# Health Vibe AI - Specialty Clinical Requirements, Governance & Acceptance Criteria

## 📌 Executive Overview & Safety Principles

Health Vibe AI expands beyond acute respiratory assessments into specialized chronic disease tracks. This document defines the **exhaustive clinical requirements for each of the five chronic specialties**, developed for specialist review and sign-off.

### Core Non-Negotiable Governance Principles:
1. **Separation of Clinical Decision Engines**:
   - **Respiratory rules (e.g., SpO2 < 92%, cough progression, respiratory rate) MUST NEVER be applied to other specialties**. Each specialty operates on its own calibrated physiological logic, biomarkers, and clinical alert matrices.
2. **Verification Gatekeeping (No Readiness Claims Before Verification)**:
   - Only the **Hypertension & Blood Pressure Module** is currently verified, tested, and approved for launch (`VERIFIED_ACTIVE ✅`).
   - The remaining four specialties (Diabetes, Cardiac Risk, Weight, Nutrition) are explicitly classified as **Under Specialist Review / In Design (`UNDER_SPECIALIST_REVIEW ⏳`)**. Platform documentation and APIs must strictly avoid claiming commercial or clinical readiness for these modules until formal verification is complete.
3. **Reuse of Core Architecture**:
   - All modules reuse existing **user accounts, identity profiles, server-authoritative RBAC permissions**, and the **appointment scheduling service** without code duplication.

---

## 📋 1. Specialty Detailed Requirements Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SPECIALTY CLINICAL REQUIREMENTS SUMMARY                         │
├──────────────────────┬──────────────────────┬──────────────────────┬───────────────────┤
│ Specialty            │ Designated Doctor    │ Readiness Status     │ Launch Priority   │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ 1. Hypertension      │ Cardiologist /       │ VERIFIED_ACTIVE ✅   │ Phase 1 (Launch)  │
│    & Vascular Health │ Internist            │                      │                   │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ 2. Diabetes Mellitus │ Endocrinologist /    │ UNDER_REVIEW ⏳      │ Phase 2           │
│    & Glycemic Mgmt   │ Diabetologist        │                      │                   │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ 3. Cardiac Risk      │ Cardiologist         │ UNDER_REVIEW ⏳      │ Phase 3           │
│    & ASCVD           │                      │                      │                   │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ 4. Weight &          │ Bariatric / Obesity  │ UNDER_REVIEW ⏳      │ Phase 4           │
│    Metabolic Health  │ Physician            │                      │                   │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ 5. Clinical          │ Registered Clinical  │ UNDER_REVIEW ⏳      │ Phase 5           │
│    Nutrition         │ Dietitian            │                      │                   │
└──────────────────────┴──────────────────────┴──────────────────────┴───────────────────┘
```

---

### Specialty 1: Hypertension & Vascular Health (Approved Launch Module ⭐)
- **Qualified Specialist**: Consultant Cardiologist / Specialist Internist & Nephrologist.
- **Readiness State**: `VERIFIED_ACTIVE` (Implemented and tested with 100% test coverage).
- **Age Group & Pregnancy Adaptations**:
  - **Pediatric (< 18 yrs)**: Requires age-sex-height percentile evaluation; automated home titration is blocked; mandatory referral to pediatric cardiology.
  - **Adult (18 - 65 yrs)**: Target $< 130/80\text{ mmHg}$ per AHA/ACC & Egyptian guidelines.
  - **Geriatric (> 65 yrs)**: Adjusted systolic target $< 140/90\text{ mmHg}$ to prevent orthostatic hypotension, falls, and cerebral hypoperfusion.
  - **Pregnancy Stages (1st, 2nd, 3rd Trimester & Postpartum)**:
    - Normal range in pregnancy: $< 135/85\text{ mmHg}$.
    - **Gestational Hypertension**: $\ge 140/90\text{ mmHg}$ developing after 20 weeks gestation.
    - **Pre-eclampsia Emergency Red Flag**: $\ge 160/110\text{ mmHg}$ OR $\ge 140/90\text{ mmHg}$ with headache, visual blurring, epigastric/RUQ pain, or acute facial edema. **Requires immediate obstetric emergency escalation and 123/997 dispatch**.
- **Specialty Informed Consent**:
  - Explicit agreement for continuous hemodynamic tracking (`HealthVibe-HTN-Consent-v1.0`).
  - Mandatory acknowledgment of the non-emergency disclaimer.
- **Privacy & Security**:
  - AES-256 encrypted blood pressure telemetry.
  - Zero unencrypted transmission of hemodynamic data.
- **Structured Inputs**:
  - Systolic BP, Diastolic BP, Resting Pulse, Arm (Left/Right), Posture (Seated 5-min rest / Standing), Cuff Size, Timing (Morning fasting / Evening bedtime / Random), Medication adherence status, Symptoms checklist.
- **Diagnostic File Attachments**:
  - 24-Hour Ambulatory Blood Pressure Monitoring (ABPM) PDF reports.
  - Transthoracic Echocardiogram (TTE) reports (evaluating LVH - Left Ventricular Hypertrophy).
  - Renal Doppler Ultrasound and serum creatinine lab sheets.
- **Assessment Boundaries**:
  - Assistive longitudinal triage only.
  - Anti-hypertensive prescription or dose titration strictly requires doctor cryptographic signature.
  - **Zero respiratory rules applied**: SpO2 or respiratory rate are not criteria for hypertension staging.
- **Escalation Pathways**:
  - Hypertensive Crisis ($>180$ or $>120\text{ mmHg}$) ➔ Emergency modal + 123/997 hotline + Push notification to physician.
  - Stage 2 Uncontrolled ($\ge 140/90\text{ mmHg}$) ➔ Priority review flagged in doctor queue within 24 hours.

---

### Specialty 2: Diabetes Mellitus & Glycemic Control
- **Qualified Specialist**: Consultant Endocrinologist & Diabetologist.
- **Readiness State**: `UNDER_SPECIALIST_REVIEW` (Specification drafted; awaiting endocrinology board review).
- **Age Group & Pregnancy Adaptations**:
  - **Pediatric (Type 1 Diabetes)**: Ketone monitoring integration, hypoglycemia unawareness protocols, insulin-to-carb ratio tracking.
  - **Adult**: HbA1c target $< 7.0\%$ (or tailored $< 6.5\%$ for young adults).
  - **Geriatric**: Relaxed HbA1c target ($< 7.5\% - 8.0\%$) to minimize severe hypoglycemia risks.
  - **Pregnancy (Gestational Diabetes Mellitus - GDM)**:
    - Strict glycemic targets: Fasting $\le 95\text{ mg/dL}$, 1-hr post-meal $\le 140\text{ mg/dL}$, 2-hr post-meal $\le 120\text{ mg/dL}$.
- **Specialty Informed Consent**:
  - Explicit consent for continuous glucose telemetry and lab record sharing (`HealthVibe-Diabetes-Consent-v1.0`).
- **Privacy & Security**:
  - CGM telemetry anonymization for research cohorts.
- **Structured Inputs**:
  - Fasting Blood Glucose (mg/dL), Postprandial Glucose (2-hr post-meal), Random Glucose, HbA1c (%), Urine Ketones, Hypoglycemia symptoms (tremor, sweating, dizziness, confusion), Active insulin units.
- **Diagnostic File Attachments**:
  - Continuous Glucose Monitoring (CGM) Ambulatory Glucose Profile (AGP) 14-day exports.
  - Certified HbA1c laboratory reports.
  - Annual dilated fundus examination and microalbumin/creatinine ratio reports.
- **Assessment Boundaries**:
  - Autonomous insulin dose adjustment is strictly prohibited.
- **Escalation Pathways**:
  - Severe Hypoglycemia ($< 54\text{ mg/dL}$) ➔ Immediate rule of 15 alert + emergency contact automated call.
  - DKA Risk (Glucose $> 300\text{ mg/dL}$ with positive ketones) ➔ Immediate hospital ER dispatch.

---

### Specialty 3: Cardiovascular Risk & Atherosclerotic (ASCVD) Disease
- **Qualified Specialist**: Consultant Cardiologist.
- **Readiness State**: `UNDER_SPECIALIST_REVIEW` (Specification drafted; awaiting cardiology committee review).
- **Age Group & Pregnancy Adaptations**:
  - **Adults (40 - 75 yrs)**: Primary target demographic for 10-Year ASCVD risk scoring.
  - **Premature CAD Screening (< 40 yrs)**: Evaluated in patients with familial hypercholesterolemia.
  - **Pregnancy**: Lipid-lowering statin contraindications (Category X/teratogenic risk).
- **Specialty Informed Consent**:
  - Cardiovascular profile consent and wearable ECG data processing terms (`HealthVibe-Cardio-Consent-v1.0`).
- **Structured Inputs**:
  - Total Cholesterol (mg/dL), LDL-C, HDL-C, Triglycerides, hs-CRP, Coronary Artery Calcium (CAC) score, Resting heart rate, ECG rhythm flags (Sinus vs. AFib), Smoking packs/year, Family history.
- **Diagnostic File Attachments**:
  - 12-Lead Resting ECG traces (PDF/DICOM).
  - 24-48 Hour Holter ECG rhythm analysis reports.
  - Coronary CT Angiography (CCTA) and stress echocardiography reports.
- **Assessment Boundaries**:
  - Statin therapy initiation and anti-arrhythmic drugs require cardiologist certification.
- **Escalation Pathways**:
  - Acute Coronary Syndrome symptoms (Crushing chest pain radiating to left arm/jaw) ➔ Immediate 123/997 dispatch.
  - New-onset AFib with rapid ventricular response ($>120\text{ bpm}$) ➔ Same-day cardiology consult.

---

### Specialty 4: Weight & Metabolic Health
- **Qualified Specialist**: Consultant in Obesity Medicine & Bariatric Specialist.
- **Readiness State**: `UNDER_SPECIALIST_REVIEW` (Specification drafted; awaiting metabolic board review).
- **Age Group & Pregnancy Adaptations**:
  - **Pediatric**: BMI percentile charts for age and sex.
  - **Pregnancy**: Active weight reduction diets strictly prohibited; gestational weight gain tracked against IOM (Institute of Medicine) pre-pregnancy BMI targets.
- **Specialty Informed Consent**:
  - Body composition telemetry and lifestyle tracking consent (`HealthVibe-Weight-Consent-v1.0`).
- **Structured Inputs**:
  - Weight (kg), Height (cm), BMI, Waist circumference (cm), Body fat percentage, Muscle mass, Satiety rating, Weight-loss medication adherence (GLP-1 receptor agonists).
- **Diagnostic File Attachments**:
  - Dual-Energy X-Ray Absorptiometry (DEXA) body composition scans.
  - Bariatric surgical operative reports and endoscopic evaluations.
- **Assessment Boundaries**:
  - GLP-1 and anti-obesity pharmacotherapy prescription requires licensed physician.
- **Escalation Pathways**:
  - Rapid unexplained weight loss ($>5\%$ in 30 days) ➔ Clinical red flag for malignancy/endocrine screen.
  - Acute fluid weight gain in heart failure/renal patients ($>2.5\text{ kg}$ in 48-72 hrs) ➔ Heart failure alert.

---

### Specialty 5: Clinical Nutrition & Medical Nutrition Therapy (MNT)
- **Qualified Specialist**: Registered Dietitian (RD) / Clinical Nutrition Specialist.
- **Readiness State**: `UNDER_SPECIALIST_REVIEW` (Specification drafted; awaiting clinical nutrition review).
- **Age Group & Pregnancy Adaptations**:
  - **Pediatric**: Failure to thrive monitoring, pediatric micronutrient guidelines.
  - **Pregnancy**: Folate supplementation tracking, iron deficiency anemia screening, avoidance of unpasteurized/listeria-risk foods.
  - **Renal / Hypertensive Adults**: Strict sodium limit ($< 2,000\text{ mg/day}$) and potassium control.
- **Specialty Informed Consent**:
  - Dietary diary and nutritional intake processing consent (`HealthVibe-Nutrition-Consent-v1.0`).
- **Structured Inputs**:
  - Daily caloric intake (kcal), Protein (g), Carbohydrates (g), Total Fat (g), Sodium (mg/day), Water intake (liters), Meal timing, Gastrointestinal symptoms (bloating, reflux).
- **Diagnostic File Attachments**:
  - Indirect calorimetry metabolic rate reports.
  - Food diary exports and laboratory micronutrient panels (Vitamin D, B12, Ferritin).
- **Assessment Boundaries**:
  - Therapeutic diet plans for chronic kidney disease, cirrhosis, or severe inborn errors of metabolism require certified clinical dietitian sign-off.
- **Escalation Pathways**:
  - Refeeding syndrome risk or critical malnutrition ($< 800\text{ kcal/day}$ unmonitored) ➔ Urgent dietitian consult.

---

## 🏆 2. Specialist Presentation & Acceptance Criteria Checklist

| Specialty | Key Acceptance Criterion for Sign-Off | Target Specialist Reviewer | Sign-Off Status |
|:---|:---|:---|:---:|
| **Hypertension** | 100% concordant staging with ACC/AHA; Pre-eclampsia red-flag trigger; 0 false negatives on crisis | Prof. Cardiology / Nile Cardio Center | **APPROVED & VERIFIED ✅** |
| **Diabetes** | Automated Rule of 15 on hypoglycemia; GDM trimester-specific thresholds; Zero automated insulin doses | Consultant Diabetologist | **PENDING REVIEW ⏳** |
| **Cardiac Risk** | ASCVD 10-yr calculation verification against Pooled Cohort Equations; Statin gap alert | Consultant Interventional Cardiologist | **PENDING REVIEW ⏳** |
| **Weight** | BMI percentile mapping; IOM pregnancy weight gain limits; Rapid fluid retention detection | Consultant Obesity Medicine | **PENDING REVIEW ⏳** |
| **Nutrition** | Dietary sodium limits validated against DASH; Renal dietary restriction rules verified | Registered Clinical Dietitian | **PENDING REVIEW ⏳** |
