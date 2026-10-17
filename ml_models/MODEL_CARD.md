# Model Card: HealthVibe Respiratory Triage Classifier (`resp_rf_v1.0.2`)

## 1. Model Details
- **Model Identifier:** `resp_rf_v1.0.2`
- **Developer:** HealthVibe AI Clinical Engineering & Data Science Team
- **Model Architecture:** Calibrated Random Forest Ensemble (100 Estimators)
- **Clinical Specialty:** Pulmonology / Respiratory Triage & Risk Stratification
- **Release Date:** September 2026
- **Status:** Active Production Model
- **License:** Proprietary Healthcare Software / HealthVibe AI Certified

---

## 2. Intended Use
- **Primary Use Case:** Clinical triage decision support for adult and adolescent patients presenting with acute or chronic respiratory symptoms (dyspnea, cough, chest tightness, wheezing).
- **Intended Users:** Registered Pulmonologists, General Practitioners, Emergency Triage Nurses, and self-triaging patients seeking specialist consultation.
- **Intended Setting:** Ambulatory clinics, outpatient hospital departments, remote telehealth consults, and emergency pre-triage.

---

## 3. Clinical Safety Overrides (Hard Rules)
The model incorporates immediate deterministic safety guards that override probabilistic voting when red-flag clinical conditions are detected:
1. **Critical Hypoxemia:** $SpO_2 < 90\%$ triggers immediate `EMERGENCY (RED)` classification.
2. **Severe Tachypnea:** Respiratory Rate $\ge 32\text{ breaths/min}$ triggers immediate `EMERGENCY (RED)`.
3. **Severe Hemoptysis:** Coughing fresh blood in combination with acute pleuritic chest pain or severe dyspnea triggers immediate `EMERGENCY (RED)`.

---

## 4. Performance Metrics & Validation Results
Evaluated against the balanced multi-center clinical validation cohort ($N = 2,450$ patient cases):

| Metric | Target Standard | Achieved Score (`resp_rf_v1.0.2`) |
| :--- | :--- | :--- |
| **Sensitivity (Recall for Severe/Emergency Cases)** | $> 95.0\%$ | **96.2%** |
| **Specificity** | $> 90.0\%$ | **94.8%** |
| **AUROC (Area Under ROC Curve)** | $> 0.950$ | **0.974** |
| **F1-Score (Macro Weighted)** | $> 0.920$ | **0.955** |
| **Critical False Negative Rate** | $< 1.0\%$ | **0.8%** |

---

## 5. Input Features (14 Dimensions)
1. `age`: Patient chronological age (0-130 years).
2. `oxygen_saturation`: Peripheral capillary oxygen saturation ($SpO_2$, 50-100%).
3. `respiratory_rate`: Measured or observed breaths per minute (5-60 bpm).
4. `systolic_bp`: Systolic blood pressure (50-260 mmHg).
5. `diastolic_bp`: Diastolic blood pressure (30-150 mmHg).
6. `temperature_c`: Body temperature in Celsius (34.0 - 43.0 °C).
7. `dyspnea_severity`: Validated mMRC ordinal dyspnea scale (0 to 3).
8. `cough_duration_days`: Duration of active cough (0 to 365 days).
9. `hemoptysis_flag`: Binary indicator of hemoptysis / blood-streaked sputum.
10. `chest_pain_flag`: Binary indicator of pleuritic or acute chest pain.
11. `smoking_pack_years`: Lifetime tobacco exposure in pack-years.
12. `chronic_asthma_history`: Documented clinical diagnosis of bronchial asthma.
13. `chronic_copd_history`: Documented clinical diagnosis of COPD / Emphysema.
14. `allergy_history`: Documented seasonal or environmental allergies.

---

## 6. Ethical Considerations & Bias Audits
- **Demographic Parity:** The validation cohort was stratified across age groups ($18-40$, $41-65$, $>65$), genders ($51\%$ female, $49\%$ male), and regional demographics in Egypt (Delta, Greater Cairo, Upper Egypt).
- **Prohibited Claims:** The model does **NOT** provide a definitive histological or microbiological diagnosis. It acts solely as an urgency triage and differential risk ranker. Every high-risk report mandates certified physician review before patient disclosure.
