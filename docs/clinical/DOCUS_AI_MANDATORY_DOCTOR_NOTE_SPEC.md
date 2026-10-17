# DOCUS AI BENCHMARK: MANDATORY CLINICAL NOTE ON REJECTION & AI OVERRIDE (TASK #61)

## Executive Summary
This document establishes the architecture, UX workflow, and clinical governance enforcement for **Mandatory Physician Notes and Patient Directives (إلزامية ملاحظة الطبيب وتوجيه المريض)** in Health Vibe AI, benchmarked against **Docus AI** (Leading Medical Second Opinion & AI-Assisted Clinical Governance Platform).

Task reference:
`Mohamed | #61 | مهمة تطوير (Task) | P0 - حرج جداً | Product / Frontend | إلزامية ملاحظة الطبيب عند التعديل/الرفض | إلزام الطبيب بكتابة سبب سريري أو توجيه واضح للمريض في حال رفض نتيجة الذكاء الاصطناعي أو تعديل مستوى الخطورة. | Docus AI`

---

## 1. Clinical Governance & Rationale

In high-stakes AI-assisted healthcare, an algorithm's diagnostic output or risk tier must never be silently dismissed or altered without **documented physician accountability**:
1. **Patient Safety & Transparency:** If a physician disagrees with an AI triage classification (e.g. downgrading an urgent case to routine, or upgrading a borderline case to high-risk) or rejects a patient submission, the patient needs clear, actionable medical instructions to prevent misinterpretation, panic, or treatment delays.
2. **Clinical Auditability (Docus AI Standard):** Every deviation between AI diagnostic output and the attending doctor's final decision is permanently sealed with:
   - Original AI Diagnosis & Risk Tier
   - Physician's Modified Diagnosis & Risk Tier
   - Mandatory Clinical Override Rationale (minimum 15 characters)
   - Patient Directives
   - Doctor Credentials & Timestamped Digital Signature

---

## 2. Enforcement Triggers

### 2.1. Trigger A: Case Rejection (رفض الحالة السريرية)
- **Condition:** Physician clicks `Reject` (رفض الحالة) or invokes `rejectCase(caseId)` or transitions status to `rejected`.
- **Enforcement Rules:**
  - Form requires a non-empty, substantive clinical explanation of **at least 15 characters**.
  - 1-Click quick presets provide standardized clinical justifications:
    - *Unreadable or blurred radiology images requiring re-examination (صور الأشعة غير واضحة أو غير مقروءة طبياً)*
    - *Duplicate case evaluation submitted by patient within short interval (تقييم سريري مكرر لنفس المريض)*
    - *Non-clinical data or invalid vital entry, please retake vitals (بيانات غير طبية أو إدخال غير منطقي للمؤشرات الحيوية)*
    - *Outside pulmonary scope: Referred to Cardiology/ENT for evaluation (حالة غير تنفسية: تم التوجيه لقسم القلب/الأنف والأذن)*
  - If field is empty or `< 15` characters:
    - Focus is set back on the textarea.
    - An explicit alert is rendered: `"يلزم كتابة سبب سريري أو توجيه واضح للمريض لرفض الحالة (15 حرفاً على الأقل)."`
    - Submission is blocked.
  - On submission:
    - Stored in Firestore and PostgreSQL as `rejectionReason`, `clinicalOverrideReason`, and `doctorNote`.
    - Included in the patient notification.

### 2.2. Trigger B: AI Diagnosis or Risk Level Modification (تعديل نتيجة الذكاء الاصطناعي أو مستوى الخطورة)
- **Condition:** In `Modify & Approve` or review panel:
  - Doctor alters the clinical diagnosis away from the AI-derived prediction (`newDiagnosis !== aiPrediction`), OR
  - Doctor changes the triage priority / risk tier (`newRisk !== aiPriority`).
- **Enforcement Rules:**
  - Dynamic detection activates the **Docus AI Mandatory Clinical Override Box**:
    - Highlights with yellow/orange alert borders (`border: 1.5px solid #f59e0b`).
    - Displays the governance advisory banner:
      > 🛡️ **معيار Docus AI للحوكمة السريرية عند التعديل:**
      > لقد قمت بتعديل تشخيص الذكاء الاصطناعي أو تغيير مستوى الخطورة. يلزم توثيق سبب سريري وتوجيه واضح للمريض (15 حرفاً على الأقل) قبل اعتماد التقرير الطبي.
    - Live character counter: `⚠️ X / 15 حرف (يلزم 15 حرفاً على الأقل)` transitioning to `✓ X / 15 حرف (السبب موثق سريرياً)`.
  - If field is empty or `< 15` characters:
    - Submission of `Confirm & Certify Report` is immediately blocked.
    - Toast warning displayed: `"يلزم كتابة سبب سريري أو توجيه واضح للمريض عند تعديل نتيجة الذكاء الاصطناعي أو مستوى الخطورة (15 حرفاً على الأقل)."`
  - On approval:
    - Sets `isAiOverridden = true`.
    - Persists `clinicalOverrideReason` and creates immutable audit record `aiOverrideAudit`:
      ```json
      {
        "originalDiagnosis": "Acute Bronchial Asthma Exacerbation",
        "newDiagnosis": "Acute Bronchitis & Reactive Airway",
        "originalRisk": "high",
        "newRisk": "routine",
        "overrideReason": "Chest examination reveals bilateral rhonchi without stridor, SpO2 stable at 96% after bronchodilator.",
        "overriddenAt": "2026-10-17T02:00:00.000Z",
        "overriddenBy": "doctor_uid_123"
      }
      ```

---

## 3. Server-Authoritative Boundary

Client validation is reinforced by server-authoritative enforcement in `backend/server.js`:
- Endpoint `POST /api/doctor/transition-case-status`:
  - Rejects `targetStatus === 'rejected'` with `400 MANDATORY_CLINICAL_REJECTION_REASON_REQUIRED` if length `< 15`.
  - Rejects `targetStatus === 'approved'` with `400 MANDATORY_CLINICAL_OVERRIDE_REASON_REQUIRED` if `isAiOverridden` and length `< 15`.
