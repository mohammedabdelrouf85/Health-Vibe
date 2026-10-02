# Health Vibe AI - Chronic Disease Expansion Scopes & Clinical Governance

## 🎯 Executive Overview

To expand Health Vibe AI beyond respiratory acute and episodic assessments into **comprehensive chronic disease management**, this document establishes the clinical scopes for five high-burden chronic domains. Each scope is defined under the clinical oversight of a designated medical specialist, establishing:
- Inputs and physiological biomarkers
- Validated measurement sources
- Automated clinical alert thresholds
- Structured follow-up and monitoring plans
- Human-in-the-loop review boundaries and medical disclaimers

---

## 🩺 1. Five Specialized Chronic Scopes

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CHRONIC DISEASE SPECIALTY SCOPES                                │
├───────────────────┬───────────────────┬────────────────────┬──────────────┬────────────┤
│ 1. Hypertension   │ 2. Diabetes       │ 3. Cardiac Risk    │ 4. Weight &  │ 5. Clinical│
│    (Blood Pressure)│    Mellitus       │    & ASCVD         │    Metabolic │   Nutrition│
├───────────────────┼───────────────────┼────────────────────┼──────────────┼────────────┤
│ Specialist:       │ Specialist:       │ Specialist:        │ Specialist:  │ Specialist:│
│ Cardiologist /    │ Endocrinologist / │ Cardiologist       │ Obesity Med /│ Clinical   │
│ Internist         │ Diabetologist     │                    │ Bariatrician │ Dietitian  │
└───────────────────┴───────────────────┴────────────────────┴──────────────┴────────────┘
```

### Scope 1: Hypertension & Vascular Health (Selected Starting Module ⭐)
- **Qualified Specialist**: Consultant Cardiologist / Specialist Internist & Nephrologist.
- **Clinical Inputs**: Systolic BP (mmHg), Diastolic BP (mmHg), Resting Pulse (bpm), Measurement Arm, Cuff Size, Timing (Morning/Evening/Random), Posture (Seated/Standing), Associated Symptoms (Headache, Visual Changes, Chest Tightness, Dyspnea, Epistaxis).
- **Measurement Sources**:
  1. Bluetooth-connected automated upper-arm oscillometric cuffs (ISO 81060-2 validated, e.g., Omron, Beurer).
  2. Patient home manual entry (with resting protocol verification).
  3. In-clinic clinical nurse readings.
  4. OCR capture of physical monitor screens.
- **Alert Tiers**:
  - *Emergency Crisis*: Systolic > 180 or Diastolic > 120 mmHg -> Immediate emergency safeguard modal, dispatch to emergency hotlines (123 / 997 / 911), urgent doctor notification.
  - *Stage 2 Uncontrolled*: Systolic >= 140 or Diastolic >= 90 mmHg -> Priority review flag.
  - *Symptomatic Hypotension*: Systolic < 90 or Diastolic < 60 mmHg with dizziness.
- **Follow-up Protocol**: 7-day morning/evening titration log; monthly control review; quarterly organ-damage screening (microalbuminuria, ECG).

---

### Scope 2: Diabetes Mellitus & Glycemic Control
- **Qualified Specialist**: Consultant Endocrinologist & Diabetologist.
- **Clinical Inputs**: Fasting Blood Glucose (FBG, mg/dL), Postprandial Glucose (PPG, 2-hr post meal, mg/dL), Random Glucose, HbA1c (%), Urine Ketones (in type 1 or acute hyperglycemia), Hypoglycemia symptoms (tremor, diaphoresis, confusion), Insulin doses.
- **Measurement Sources**:
  1. Continuous Glucose Monitoring (CGM) NFC/Bluetooth sensor feeds (Dexcom, FreeStyle Libre).
  2. Bluetooth-enabled BGM fingerstick glucometers.
  3. Patient manual log.
  4. Accredited laboratory reports via OCR.
- **Alert Tiers**:
  - *Severe Hypoglycemia*: Glucose < 54 mg/dL (< 3.0 mmol/L) -> Emergency fast-acting carbs alert + emergency contact dispatch.
  - *Diabetic Ketoacidosis (DKA) Risk*: Glucose > 300 mg/dL with positive ketones/nausea -> Immediate medical referral.
  - *Hyperglycemic Hyperosmolar Alert*: Glucose > 250 mg/dL persistent.
- **Follow-up Protocol**: 14-day Ambulatory Glucose Profile (AGP), HbA1c target review every 90 days, annual diabetic foot & dilated eye examination tracking.

---

### Scope 3: Cardiovascular Risk & Atherosclerotic (ASCVD) Stratification
- **Qualified Specialist**: Consultant Cardiologist.
- **Clinical Inputs**: Total Cholesterol (mg/dL), LDL-C, HDL-C, Triglycerides, Non-HDL, High-Sensitivity C-Reactive Protein (hs-CRP), Coronary Artery Calcium (CAC) score, 10-Year ASCVD Risk Score (%), Smoking status, Family history of premature CAD.
- **Measurement Sources**:
  1. Certified lipid profile laboratory reports.
  2. In-clinic cardiovascular risk assessments.
  3. Smartwatch / wearable ECG rhythm strips (AFib detection alerts).
- **Alert Tiers**:
  - *Acute Coronary Syndrome (ACS) Red Flag*: Exertional crushing chest pressure radiating to jaw/left arm -> 911/123 immediate dispatch.
  - *Arrhythmia Alert*: Wearable AFib detection with resting HR > 120 or < 40 bpm.
  - *Very High Risk Statin Gap*: LDL-C > 190 mg/dL without lipid-lowering therapy.
- **Follow-up Protocol**: Statin titration evaluation at 6-12 weeks; annual ASCVD recalculation.

---

### Scope 4: Weight & Metabolic Health
- **Qualified Specialist**: Consultant in Obesity Medicine & Bariatric Specialist.
- **Clinical Inputs**: Body Weight (kg), Height (cm), Body Mass Index (BMI, kg/m²), Waist Circumference (cm), Waist-to-Height Ratio, Bioimpedance Body Fat (%), Lean Muscle Mass (kg), Visceral Fat Rating, Satiety score.
- **Measurement Sources**:
  1. Bluetooth smart scales (bioelectrical impedance).
  2. Clinic calibrated stadiometer and medical scale.
  3. Patient verified tape measurement.
- **Alert Tiers**:
  - *Rapid Unexplained Weight Loss*: > 5% body weight drop in 30 days without intention -> Clinical red flag for malignancy / endocrine pathology.
  - *Rapid Fluid Retention*: > 2.5 kg weight gain in 48-72 hours in cardiopulmonary patients -> Heart failure exacerbation alert.
  - *Extreme Class III Obesity*: BMI >= 40 kg/m² with obesity-hypoventilation risk.
- **Follow-up Protocol**: Bi-weekly weigh-in review; monthly waist trend; metabolic panel at 3 and 6 months.

---

### Scope 5: Clinical Nutrition & Medical Nutrition Therapy (MNT)
- **Qualified Specialist**: Registered Dietitian (RD) / Clinical Nutrition Specialist.
- **Clinical Inputs**: Dietary recall log, Daily caloric intake (kcal), Macronutrient breakdown (Protein g, Carbs g, Fat g), Sodium intake (mg/day - crucial for hypertension), Fiber (g/day), Water intake (liters), Micronutrient supplements, Renal/hepatic restriction parameters.
- **Measurement Sources**:
  1. Digital food diary and barcode nutrition scanner.
  2. Specialist clinical consultation dietary interview.
  3. Metabolic expenditure analysis (Indirect calorimetry or Mifflin-St Jeor formula).
- **Alert Tiers**:
  - *Severe Sodium Excess in Hypertensive/Renal Patient*: Daily sodium > 3,500 mg.
  - *Critical Hypocaloric Intake*: < 800 kcal/day unmonitored.
  - *Refeeding Syndrome Risk*: Electrolyte imbalance signs upon nutritional re-institution.
- **Follow-up Protocol**: Weekly nutritional compliance scorecard, biometric adjustment every 14 days.

---

## 🏆 2. Selection of Starting Module: Hypertension & Blood Pressure

### Rationale for Selection:
1. **Immediate Cardiopulmonary Synergy**: Blood pressure directly interlocks with Health Vibe's established respiratory engine (pulmonary hypertension, COPD cor pulmonale, medication interactions).
2. **Clinical High-Prevalence Impact**: Affects over 33% of adult Egyptian and regional populations, with high rates of undetected or uncontrolled Stage 2 hypertension.
3. **Rigid Standardized Diagnostic Criteria**: Supported by globally harmonized ACC/AHA and Egyptian Hypertension Society guidelines with distinct quantitative boundaries.
4. **Clear Device Validation**: Seamless integration with ISO-validated home digital blood pressure cuffs.

---

## 🛡️ 3. Clinical Governance, Human Review & Non-Diagnostic Boundaries

> [!IMPORTANT]
> **Human Review Gatekeeping Principle:**
> 1. Health Vibe AI provides **clinical intelligence, longitudinal trending, and triage alerts**. It **NEVER issues autonomous medical diagnoses or autonomous medication adjustments**.
> 2. All clinical evaluations, treatment plan approvals, anti-hypertensive prescriptions, and official reports **require the cryptographic digital signature and license provenance of a licensed, approved physician**.
> 3. Clear non-emergency disclaimers are presented on all patient interfaces:
>    *"Health Vibe Blood Pressure Monitoring is an assistive tracking tool. In the event of severe chest pain, shortness of breath, or blood pressure exceeding 180/120 mmHg, call emergency services (123 / 997) or seek immediate emergency hospital care."*
