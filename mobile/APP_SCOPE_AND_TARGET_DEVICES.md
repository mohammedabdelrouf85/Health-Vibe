# Health Vibe AI - Mobile Application Architecture & Scope Specification

## 📱 1. Executive Summary & Target Devices

The Health Vibe AI Mobile Application is built with **Flutter & Dart** as a companion application to the existing web ecosystem. It delivers a fast, secure, bilingual (Arabic RTL and English LTR) clinical respiratory assessment and review experience on mobile devices.

### Target Devices & OS Compatibility
- **Primary Form Factors**:
  - **Smartphones**: Android (API level 26+ / Android 8.0 through Android 15+) and iOS (iOS 14.0 through iOS 18+).
  - **Tablets & Foldables**: Responsive breakpoints (Adaptive scaffold supporting portrait and landscape orientations, dynamic column grids for tablets).
- **Screen Densities & Accessibility**:
  - High-DPI screens (Retina / xxhdpi / xxxhdpi).
  - Dynamic Font Scaling & High Contrast compliance (WCAG 2.1 AA / ATAG).
  - Native Right-to-Left (RTL) mirroring and Cairo/Inter typography.

---

## 🎯 2. Core Scope & Feature Modules

The initial mobile release encompasses four foundational clinical journeys:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HEALTH VIBE AI MOBILE APP                       │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│   1. Sign-In    │  2. Assessment   │ 3. Review Status│   4. Reports    │
│  & Auth Session │  & Vitals Input  │  & Longitudinal │  & Verification │
├─────────────────┼──────────────────┼─────────────────┼─────────────────┤
│ • Secure Token  │ • SpO2 / Temp /  │ • Real-time     │ • Doctor Stamp  │
│   Vault (AES)   │   Resp. Rate     │   Lifecycle     │   & License ID  │
│ • Server Claims │ • Symptoms Form  │ • Doctor Queue  │ • Prescriptions │
│ • Biometrics/PIN│ • AI Triage      │ • Timeline Log  │ • PDF & Web Ref │
└─────────────────┴──────────────────┴─────────────────┴─────────────────┘
```

### Module 1: Secure Sign-In & Authentication
- **Server Authorization Reuse**:
  - Authenticates via Firebase Auth / Express API (`POST /api/auth/*`).
  - Fetches server-authoritative role and custom claims from `GET /api/auth/profile`.
  - **Zero Duplicated Authorization**: The mobile client does not recreate permission matrix logic. It checks role flags provided directly by the server and lets the backend enforce RBAC.
- **Secure Token Vault**:
  - AES-256 encrypted local storage backed by Android Keystore / iOS Keychain.
  - Automatic token rotation, session expiry detection (401 interception), and safe logout.

### Module 2: Respiratory Clinical Assessment
- **Schema Parity**: Strictly implements `backend/ASSESSMENT_SCHEMA.md` (v1.1.0).
- **Vitals Capture**: SpO2 percentage, body temperature (°C), and respiratory rate (breaths/min) with instant physiological guardrails.
- **Symptom Stratification**: Breathing difficulty, cough severity, symptom progression, duration, and known risk factors.
- **Pre-submission Safeguards**: Critical alert dialog triggered if SpO2 < 88% or severe chest pain is reported, providing immediate emergency hotline guidance before proceeding.
- **Submission**: Sends validated schema payload to `POST /api/assessment/new` or records directly via authenticated gateway.

### Module 3: Review Status & Longitudinal Tracking
- **Lifecycle Stages**:
  - `pending` (بانتظار المراجعة - Awaiting clinical queue)
  - `under_review` (قيد الفحص السريري - Assigned to licensed physician)
  - `approved` (معتمد سريرياً - Certified report ready)
  - `needs_followup` (مطلوب معلومات إضافية - Doctor requested more vitals/tests)
  - `closed` (مكتمل ومغلق)
- **Longitudinal History**: Patients view their timeline of past assessments, comparing vital trends (e.g. oxygen recovery over time).

### Module 4: Clinical Reports & Doctor Verification
- **Physician Provenance**: Displays attending doctor's full name, verified medical license number, and clinical approval timestamp.
- **Certified Findings**: Official diagnoses, clinical recommendations, and prescribed medication regimen.
- **Verification Integrity**: Deep link and QR reference pointing to `/api/reports/verify/:reportRefOrId` for third-party medical validation.

---

## 🔒 3. Cross-Cutting Engineering Pillars

### A. Secure Storage Engine (`SecureStorageService`)
- Encrypted key-value persistence for ID tokens, refresh tokens, active device IDs, and user settings.
- Wiped upon user logout or session revocation (`POST /api/auth/logout`).
- Zero plaintext PHI (Protected Health Information) stored on unencrypted device flash.

### B. Internationalization & Native RTL (`AppLocalizations`)
- First-class Arabic (`ar`) and English (`en`) locale support.
- Bi-directional UI flipping: Margins, paddings, icons, directional arrows, and text alignment automatically adapt to RTL directionality.
- Consistent medical terminology aligned with the web application (`backend/ASSESSMENT_SCHEMA.md`).

### C. Push Notifications & PHI Isolation
- Device token registration via `POST /api/notifications/push-subscription`.
- **Zero-PHI Push Policy**: In accordance with Health Vibe security governance, notification payloads never contain diagnoses or vitals. They present concise alerts (e.g., *"Medical update ready"* / *"تم تحديث تقريرك الطبي"*) that require sign-in to view.
- Device unregistration on logout or user account switching to prevent cross-account notification leaks.

---

## 🧪 4. Testing & Verification Roadmap

1. **Unit Tests**:
   - `assessment_model_test.dart`: Serialization, schema validation, SpO2 criticality detection.
   - `secure_storage_test.dart`: Encryption, read/write, wipe on logout.
   - `localization_test.dart`: Arabic RTL strings, English LTR strings, translation completeness.
2. **Widget Tests**:
   - `sign_in_screen_test.dart`: Form validation, loading state, error display.
   - `assessment_flow_test.dart`: Form step progression, vital validation, emergency alert trigger.
   - `review_status_screen_test.dart`: State badges (pending, under_review, approved).
   - `report_detail_screen_test.dart`: Verified physician license badge, findings display.
