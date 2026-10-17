# ROLOGY BENCHMARK: DOCTOR CLINICAL REVIEW & APPROVAL COCKPIT (TASK #60)

## Executive Summary
This document establishes the architecture, UX design system, and clinical governance model for the **Unified Clinical Review Cockpit (شاشة مراجعة الحالة للطبيب)** in Health Vibe AI, benchmarked against **Rology** (the Middle East & Africa's leading teleradiology and AI-assisted diagnostic platform).

Task reference:
`Mohamed | #60 | مهمة تطوير (Task) | P0 - حرج جداً | Product / Frontend | واجهة اعتماد الطبيب (Approve/Reject UI) | تصميم شاشة مراجعة الحالة للطبيب بحيث تعرض في شاشة واحدة: بيانات المريض، التاريخ المرضي، المدخلات الحالية، مخرجات الـ AI ونسبة الثقة، وأزرار Approve, Modify & Approve, Reject / Request Follow-up. | Rology`

---

## 1. Core Architectural Pillars (In a Single Unified Screen)

In contrast to multi-tab or fragmented interfaces where clinicians lose time and context switching between screens, the **Rology Cockpit** brings all critical medical decision data into **one ergonomic, high-density, single-screen workstation**:

```
+---------------------------------------------------------------------------------------------------+
| 1. PERSISTENT PATIENT & CASE IDENTITY HEADER                                                      |
| Patient: أحمد مصطفى كمال (46 سنة • ذكر) | MRN: #892147 | SpO2: 91% | Doctor: د. طارق محمود (EMS #48291)  |
| [✅ Approve]  [✏️ Modify & Approve]  [🚫 Reject]  [🔄 Request Follow-up]                           |
+---------------------------------------------------------------------------------------------------+
| 2. UNIFIED 2-COLUMN CLINICAL WORKSPACE                                                            |
|                                                                                                   |
|  COLUMN 1: PATIENT BASELINE & CURRENT INPUTS     |  COLUMN 2: AI DIAGNOSTICS & DECISION COCKPIT   |
|  -------------------------------------------     |  -------------------------------------------   |
|  [📜 التاريخ المرضي (Medical History)]           |  [🤖 مخرجات الذكاء الاصطناعي ونسبة الثقة]     |
|   • Chronic: Asthma Flare, Hypertension          |   • Predicted: Bronchial Asthma Exacerbation   |
|   • Smoking: Ex-smoker (12 pack-years)           |   • Confidence: 94.6% (SVG Radial Gauge)       |
|   • Allergies: Penicillin (⚠️ High Alert)        |   • Risk Tier: Tier 1 High Priority (عاجل)    |
|   • Meds: Salbutamol Inhaler PRN                 |   • Drivers: SpO2 (+38%), Wheezing (+28%)      |
|                                                  |   • Legal Notice: Clinical Decision Support    |
|  [🩺 المدخلات الحالية والمؤشرات الحيوية]         |                                                |
|   • Chief Complaint: Acute dyspnea & cough       |  [💊 الخطة العلاجية والروشتة المقترحة (Rx)]     |
|   • Duration: 4 days                             |   • Salbutamol 100mcg PRN                      |
|   • Vitals: SpO2 91% | HR 88 | BP 128/82 | 37.6C |   • Budesonide/Formoterol 160/4.5mcg BID       |
|   • Radiology: Digital Chest X-Ray (High-res)    |   • Recommendations & Follow-up plan           |
+---------------------------------------------------------------------------------------------------+
| 3. DOCKED BOTTOM ACTION TOOLBAR                                                                   |
| Status: Pending Physician Certification | [Approve] [Modify & Approve] [Reject] [Request Follow-up]|
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Clinical Decision Action Handlers

### 2.1. Approve (اعتماد فوري)
- **Clinical Intent:** Physician agrees completely with the AI diagnostic findings and proposed standard protocol.
- **Workflow:**
  1. Checks for stale revisions (locks if new patient data was submitted post-review).
  2. Pre-fills diagnosis, Rx, and recommendations with the standard validated care protocol.
  3. Transitions case state to `approved`.
  4. Generates certified official medical report PDF with the doctor's Syndicate license number and digital signature.
  5. Immediately dispatches the report to the patient portal.

### 2.2. Modify & Approve (تعديل ثم اعتماد)
- **Clinical Intent:** Physician exercises clinical judgment to adjust the diagnosis, customize medications/dosages (Rx), or add patient-specific recommendations before issuing the report.
- **Workflow:**
  1. Opens an ergonomic, accessible clinical editor dialog (`#modifyApproveModalDialog`).
  2. Pre-populates AI suggestions and standard regimen.
  3. Provides quick diagnostic presets (`Asthma Flare`, `Acute Bronchitis`, `Pneumonia`).
  4. Clinician modifies Diagnosis, Prescriptions (Rx), and Care Plan.
  5. On clicking **"Confirm & Certify Report"**, saves clinical notes, updates status to `approved`, and generates the customized official report.

### 2.3. Reject (رفض الحالة)
- **Clinical Intent:** Physician rejects non-clinical inputs, unreadable radiology scans, duplicates, or cross-specialty cases.
- **Workflow:**
  1. Opens rejection justification dialog (`#rejectCaseModalDialog`).
  2. Provides 1-click clinical categories:
     - Unreadable or blurred radiology images
     - Duplicate assessment
     - Non-clinical data or invalid vital entry
     - Outside pulmonary scope (Referred to Cardiology/ENT)
  3. Transitions status to `rejected`, records documented justification in the patient's immutable audit log, and notifies the patient.

### 2.4. Request Follow-up (طلب متابعة سريرية)
- **Clinical Intent:** Physician requests updated vitals, clearer attachments, or further clinical observations before final approval.
- **Workflow:**
  1. Opens follow-up directive dialog (`#requestFollowUpModalDialog`).
  2. Provides 1-click clinical directives:
     - Re-check SpO2 at rest twice daily
     - Upload clearer photo of previous prescription / lab
     - Log body temperature every 6 hours
     - Schedule urgent Telehealth consultation
  3. Transitions status to `more_info_requested`, unlocks patient clarification thread, and sends an immediate SMS / in-app alert.

---

## 3. Compliance & Governance Matrix
- **Regulatory Status:** AI predictions operate strictly as Clinical Decision Support (CDS) under Class IIa Medical Device Software (SaMD) standards. Final diagnostic authority resides exclusively with Egyptian Medical Syndicate verified pulmonologists.
- **Audit Logging:** Every view, direct approval, modification, rejection, and follow-up request writes an immutable audit record to `medical_audit_trail`.
- **Accessibility:** High-contrast WCAG 2.1 AA compliant colors, keyboard navigability (`Escape` closes modals, `Enter` confirms), and bilingual parity (Arabic & English).
