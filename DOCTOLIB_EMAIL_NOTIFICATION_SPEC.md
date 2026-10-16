# DOCTOLIB BENCHMARK: SECURE EMAIL NOTIFICATION MVP (TASK #62)

## Executive Summary
This document defines the architecture, privacy standards, and workflow implementation for the **Secure Clinical Email Notification Engine (إشعار البريد الإلكتروني الأساسي)** in Health Vibe AI, benchmarked against **Doctolib** (Europe's premier clinical notification & patient communication platform).

Task reference:
`Mohamed | #62 | مهمة تطوير (Task) | P0 - حرج جداً | Backend / Security | إشعار البريد الإلكتروني الأساسي (Email MVP) | ربط خدمة إرسال بريد إلكتروني آمنة لإخطار الطبيب بوجود حالة جديدة للمراجعة وإخطار المريض فور اعتماد تقريره الطبي. | Doctolib`

---

## 1. Core Clinical Workflows & Triggers

### 1.1 Trigger 1: Doctor Notification on New Case for Review (إخطار الطبيب بوجود حالة جديدة)
- **Event:** A new clinical case is submitted by a patient or assigned to an attending pulmonologist (via Mode A Patient Choice or Mode B Auto Workload Balancing).
- **Recipient:** Attending Physician (`doctorEmail`).
- **Notification Type:** `new_case_for_review` / `doctor_new_case`.
- **Subject:** 
  - Standard: `🩺 حالة سريرية جديدة بانتظار المراجعة والاعتماد #${caseRef} - Health Vibe AI`
  - Urgent: `🚨 [عاجل] حالة سريرية جديدة بانتظار المراجعة والاعتماد #${caseRef} - Health Vibe AI`
- **Email Content:**
  - Doctor salutation: `سعادة الدكتور / ${doctorName}`.
  - Triage Priority Badge (`Urgent Tier 1` / `Routine Tier 3`).
  - Case Ref / MRN (`#HV-CASE-...`).
  - Patient demographics (Age, Gender, Chief Complaint).
  - Vitals Overview (`SpO2%`, `Pulse`, `Respiratory Rate`).
  - AI Suggested Triage (`اشتباه التهاب رئوي` / `Asthma Exacerbation`) + Confidence score.
  - Action Button: Direct secure link into the Doctor Review Cockpit (`/app/index.html?screen=doctor&caseId=${caseId}`).
  - Doctolib Confidentiality & Privacy Notice (HIPAA / GDPR).

### 1.2 Trigger 2: Patient Notification on Report Approval (إخطار المريض فور اعتماد تقريره الطبي)
- **Event:** Attending physician certifies and approves the clinical case in `/api/doctor/transition-case-status` (when `targetStatus === 'approved'`).
- **Recipient:** Verified Patient (`patientEmail`).
- **Notification Type:** `result_ready` / `report_approved`.
- **Subject:** `🩺 تم اعتماد تقريرك الطبي السريري - Health Vibe AI (${reportRef})`.
- **Email Content:**
  - Patient greeting: `عزيزي المريض / ${patientName}`.
  - Certified Report Reference: `HV-REP-...`.
  - Attending Physician: Name, Egyptian Syndicate License (`DOC-PULMO-...`), Specialty, Clinic Linkage.
  - Clinical Diagnosis & Prescriptions (Rx).
  - Recommendations & Follow-up plan.
  - Doctolib Digital Verification Seal: `✅ اعتماد سريري موثق: هذا التقرير موقع رقمياً ومطابق لمعايير الحوكمة السريرية ومتاح للمعاينة وصرف الأدوية.`
  - Action Button: Direct secure link to certified patient report (`/app/index.html?screen=report&caseId=${caseId}`).
  - Emergency advisory: Red flag symptoms guidance and emergency ambulance hotline (123).

---

## 2. Security, Privacy & Compliance (Doctolib / HIPAA Standard)

1. **Protected Health Information (PHI) Minimization in Subject Lines:**
   - Case reference and generic clinical state only in email subject; no unhashed patient identifiers or full addresses.
2. **Strict Transport & Provider Acceptance:**
   - Uses real SMTP in production (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
   - Provider acceptance strictly verified via `info.accepted`; status stamped as `'sent'`, never prematurely claimed as `'delivered'` without explicit webhook/receipt.
3. **Idempotency & Anti-Flood Protection:**
   - Unique notification deduplication keys prevent email loops or duplicate alerts for the same clinical milestone.
4. **Audit Trail & Provenance:**
   - Every email record is permanently logged in Firestore `email_notifications` with `queueId`, `caseId`, `messageId`, `sentAt`, `recipient`, and `providerResponse`.

---

## 3. Endpoints Contract

- `POST /api/notifications/notify-doctor-new-case`
  - Body: `{ caseId, doctorId, doctorEmail }`
  - Response: `{ success: true, message: '...', notification: { ... } }`
- `POST /api/notifications/notify-patient-report-approved`
  - Body: `{ caseId, patientEmail }`
  - Response: `{ success: true, message: '...', notification: { ... } }`
- `POST /api/doctor/transition-case-status` (targetStatus: 'approved')
  - Automatically dispatches `result_ready` email to `patientEmail`.
