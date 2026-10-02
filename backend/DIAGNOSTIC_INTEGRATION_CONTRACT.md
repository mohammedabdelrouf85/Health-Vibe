# Health Vibe AI - Diagnostic Laboratory & Imaging Integration Contract (v1.0.0-sandbox)

## 📌 1. Executive Summary & Partner Profile
This document defines the technical integration contract, clinical governance protocols, identity and data mapping, security safeguards, and error recovery policies between **Health Vibe AI** and accredited diagnostic partners.

### Accredited Partner Profile:
- **Partner Name**: Al-Borg & Al-Mokhtabar Diagnostics & Radiology Network (National Diagnostics Consortium)
- **Partner Identifier**: `PARTNER_ALBORG_MOKHTABAR`
- **Partner Classification**: Accredited Central Diagnostic Laboratory & Medical Imaging Provider (ISO 15189 / CAP Accredited)
- **Supported Standards**: HL7 FHIR v4.0.1 (`DiagnosticReport`, `Observation`, `ServiceRequest`), JSON REST, DICOMweb
- **Integration Environment**: `sandbox` (Staged development and testing)
- **Current Legal Status**: `pilot_sandbox` (Data sharing restricted to synthetic & de-identified sandbox payloads)

---

## 🏥 2. Clinical Use Case
### Bi-Directional Diagnostic Order & Result Integration:
1. **Clinical Diagnostic Orders (EHR ➔ Laboratory/Imaging)**:
   - A verified, licensed Health Vibe physician orders laboratory or radiological investigations during or following a clinical assessment (e.g., acute respiratory triage or chronic hypertension follow-up).
   - Supported orders include:
     - **Respiratory & Acute Care**: Arterial Blood Gases (ABG), Complete Blood Count (CBC with differential), D-Dimer, Serum Electrolytes, Chest X-Ray (CXR Frontal/Lateral), CT Thorax (PE protocol).
     - **Chronic Disease & Cardiometabolic**: HbA1c, Fasting Lipid Profile, Serum Creatinine & eGFR, Microalbumin/Creatinine Ratio, Urinalysis.
2. **Diagnostic Results Ingestion (Laboratory/Imaging ➔ EHR)**:
   - Laboratory instrumentation and radiologists finalize observations.
   - Structured FHIR observations with quantitative results, reference ranges, and abnormal panic flags are dispatched via encrypted webhooks.
3. **Physician Review & Clinical Gate**:
   - Abnormal or critical results trigger clinical escalation to the responsible doctor.
   - No diagnostic report is released to the patient portal without physician review and electronic sign-off.

---

## 🪪 3. Identity Federation & Data Mapping

### A. Patient Identity Mapping:
| Health Vibe Entity | Partner Field | Type | Transformation / Privacy Protection |
| :--- | :--- | :--- | :--- |
| `patient.id` (EHR UUID) | `subject.identifier[EHR]` | String | Transmitted as EHR Source Identifier |
| `patient.nationalId` | `subject.identifier[CIVIL]` | String | **Hashed (HMAC-SHA256)** with salt. Never sent in plaintext in sandbox. |
| `partnerMrn` | `subject.identifier[MRN]` | String | Partner Laboratory Master Record Number |
| `patient.gender` | `subject.gender` | Enum | Standard FHIR (`male`, `female`, `other`, `unknown`) |
| `patient.birthDate` | `subject.birthDate` | ISO Date | `YYYY-MM-DD` |

### B. Clinical Code Mapping (LOINC & RADLEX):
| Clinical Investigation | System | Standard Code | Code System | Default Unit | Reference Range |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Arterial Oxygen Saturation (SaO2)** | Lab | `1994-3` | `http://loinc.org` | `%` | 95 - 100 % |
| **D-Dimer** | Lab | `48065-7` | `http://loinc.org` | `ng/mL FEU` | < 500 ng/mL |
| **Hemoglobin A1c (HbA1c)** | Lab | `4548-4` | `http://loinc.org` | `%` | < 5.7 % |
| **Serum Creatinine** | Lab | `2160-0` | `http://loinc.org` | `mg/dL` | 0.7 - 1.3 mg/dL |
| **Serum Potassium (K+)** | Lab | `2823-3` | `http://loinc.org` | `mmol/L` | 3.5 - 5.0 mmol/L |
| **Total Cholesterol** | Lab | `2093-3` | `http://loinc.org` | `mg/dL` | < 200 mg/dL |
| **Chest X-Ray Frontal & Lateral** | Radiology | `36643-5` | `http://loinc.org` | Qualitative | Structured Text |
| **CT Thorax without Contrast** | Radiology | `24627-2` | `http://loinc.org` | Qualitative | Structured Text |

---

## 🛡️ 4. Consent, Permissions & Privacy Safeguards

### A. Patient Consent Requirements:
- Explicit patient opt-in consent (`DIAGNOSTIC_DATA_SHARING_CONSENT`) is mandatory before any patient record or order is transmitted to the diagnostic partner.
- The consent record must capture:
  - `patientId`: Identifier of the consenting patient.
  - `partnerId`: Specific diagnostic partner identifier.
  - `purpose`: `clinical_treatment_and_diagnostics`.
  - `grantedAt`: Timestamp of digital consent.
  - `expiresAt`: Configurable expiry (default 90 days).
  - `status`: `granted` or `revoked`.
- If consent is missing, expired, or revoked, order dispatch is **strictly blocked** (`403 Forbidden`).

### B. Role-Based Permissions (RBAC):
- **Physician (`doctor`)**:
  - Requires `status === 'approved'` and active medical license.
  - Exclusive authority to create and sign diagnostic orders (`createDiagnosticOrder`).
  - Authority to review, interpret, and approve incoming diagnostic results.
- **Patient (`patient`)**:
  - Can grant or revoke diagnostic data sharing consent.
  - Can view physician-approved diagnostic reports.
- **Diagnostic Partner Gateway (`partner_service`)**:
  - Mutual authentication via Bearer API Key and HMAC-SHA256 payload signature.
  - Authority to post specimen collection updates and verified diagnostic results.
- **Compliance Officer / Admin (`admin`)**:
  - Access to audit logs, synchronization metrics, and retry queue status.

---

## 🔄 5. Errors, Circuit Breakers & Exponential Retries

### A. Error Classification:
1. **Transient Errors (Eligible for Automatic Retry)**:
   - `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout`.
   - Network socket timeouts, DNS resolution blips.
2. **Permanent Errors (Non-Retryable - Immediate Fail)**:
   - `400 Bad Request` (Invalid LOINC code or malformed JSON).
   - `401 Unauthorized` (Invalid partner token or signature mismatch).
   - `403 Forbidden` (Missing or revoked patient consent).
   - `422 Unprocessable Entity` (Schema validation failed).

### B. Retry Strategy & Exponential Backoff:
- Maximum Retry Attempts: 3
- Initial Interval: 1,000 ms
- Backoff Multiplier: 2.0 (1s -> 2s -> 4s)
- Random Jitter: ±15% to prevent thundering herd.
- Exhaustion Policy: Orders that exhaust all retry attempts are quarantined into the **Dead Letter Queue (DLQ)** with alert status `ALERT_INTEGRATION_DISPATCH_EXHAUSTED`.

---

## 🔒 6. Sandbox Mode & Patient Data Safeguard

1. **Isolation Guarantee**:
   - The integration operates in `sandbox` mode (`INTEGRATION_MODE = 'sandbox'`).
   - Synthetic patient personas and simulated test data are strictly utilized.
2. **Hard Production Transfer Block**:
   - Production patient data cannot be transferred until the bilateral agreement status transitions from `pilot_sandbox` to `active_ratified` following formal HIPAA/MOH compliance reviews.
   - Any attempt to bypass this constraint triggers a `SECURITY_VIOLATION_UNRATIFIED_PARTNER` audit event and halts transmission.
