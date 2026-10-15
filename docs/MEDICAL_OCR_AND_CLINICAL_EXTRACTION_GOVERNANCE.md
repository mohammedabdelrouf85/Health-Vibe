# Medical OCR & Clinical Lab Extraction Governance
**Health Vibe AI - Smart Respiratory Clinical Assessment Platform**  
*Document Version: 1.0.0 | Date: October 2026 | Status: Production Standard*

---

## 1. Executive Summary & Clinical Intent

Health Vibe AI integrates Optical Character Recognition (OCR) to extract diagnostic information (such as arterial blood gas, pulse oximetry, and complete blood counts) from uploaded patient medical documents. 

In clinical AI systems, unverified automated extractions can introduce catastrophic diagnostic errors if treated as verified medical facts. To ensure maximum patient safety, zero-trust security, and HIPAA/EHR compliance:
1. **Security Scanning Gate:** OCR is strictly restricted to files that have passed automated anti-malware and file integrity scanning (`scanStatus === 'clean'`).
2. **Display Elements:** Users and clinicians are provided with the raw extracted text, source document metadata, page image visual reference, and extraction confidence scores.
3. **Draft-First Policy:** All extracted lab values are stored strictly as **unapproved drafts** (`isApprovedFact: false`, `reviewStatus: 'draft'`). Under no circumstances are automated extractions committed as approved medical records without manual clinician review.
4. **Manual Correction Interface:** Clinicians can modify test names, values, units, and reference ranges. All edits are logged in an immutable audit trail with before/after snapshots.
5. **Degraded Document Resilience:** The extraction engine normalizes poor-quality Arabic and English documents, resolving OCR character confusions and Eastern Arabic numerals while flagging low-confidence extractions for manual verification.

---

## 2. Security Scanning Gate Architecture

Files uploaded by patients enter a quarantined state. The OCR pipeline is placed behind an affirmative security gate:

```
[ Patient Upload ] ──▶ [ Firebase Storage: Quarantined ] ──▶ [ ClamAV / Malware Scanner ]
                                                                      │
                                                ┌─────────────────────┴─────────────────────┐
                                                ▼                                           ▼
                                    [ Scan Status: Infected ]                   [ Scan Status: Clean ]
                                                │                                           │
                                       ❌ OCR Strictly Blocked                       ✅ OCR Allowed
                                      (403 FILE_SECURITY_CHECK_FAILED)              (Draft Generation)
```

### Preconditions for OCR Processing:
- `file.scanStatus === 'clean'`
- `file.availability === 'available'`
- `file.quarantineReason === null`

Attempting to process an unscanned or quarantined file immediately aborts with:
```json
{
  "error": "FILE_SECURITY_CHECK_FAILED",
  "message": "Security scan policy violation: File #file_id is currently quarantined. OCR extraction blocked.",
  "scanStatus": "quarantined"
}
```

---

## 3. Extraction Components & Data Model

When an authorized user or clinician triggers OCR on a clean file, the system produces an **OCR Draft**:

| Component | Description | Example / Representation |
| :--- | :--- | :--- |
| **Extracted Raw Text** | Full unadulterated OCR output. | `Hemoglobin: 13.5 g/dL (12.0 - 16.0)\nSpO2: 96%` |
| **Source Metadata** | File identifier, file name, MIME type, scan verification date. | `fileId: "file_cbc_01"`, `securityScanStatus: "clean"` |
| **Page Image** | Secure preview reference / data URI of the physical page. | `/api/storage/preview/file_cbc_01?page=1` |
| **Confidence Score** | Weighted confidence metric from the OCR engine. | `0.94` (High) or `0.58` (Low / Degraded) |
| **Clinical Lab Items** | Structured entities parsed from the raw text. | Array of structured lab test objects (see below) |

### Structured Lab Test Schema:
```json
{
  "id": "item_hemoglobin_1790892000_a1b2",
  "testKey": "hemoglobin",
  "testName": "Hemoglobin",
  "value": "13.5",
  "unit": "g/dL",
  "referenceRange": "12.0 - 16.0",
  "flag": "NORMAL",
  "confidence": 0.94,
  "rawSnippet": "Hemoglobin: 13.5 g/dL (12.0 - 16.0)",
  "isManuallyCorrected": false,
  "correctionHistory": []
}
```

---

## 4. Draft-First Policy & Clinical Governance

To protect clinical integrity, extractions are strictly segregated from official patient Electronic Health Records (EHR):

1. **State Machine:**
   ```
   [ OCR Processing ] ──▶ [ Status: DRAFT ] ──▶ [ Manual Clinician Correction ]
                                 │                           │
                                 │                           ▼
                                 └─────────────────▶ [ Status: APPROVED_BY_DOCTOR ]
                                                             │
                                                             ▼
                                                [ Certified Clinical Fact ]
                                                (isApprovedFact = true)
   ```
2. **Clinical Disclaimers:**
   - **Arabic:** `مسودة استخراج آلي عبر تقنية التعرف الضوئي (OCR) مخصصة فقط للمراجعة والتدقيق السريري. لا تُعتبر حقيقة طبية معتمدة أو جزءاً من السجل النهائي حتى مراجعتها واعتمادها من الطبيب المعالج.`
   - **English:** `Draft OCR automated extraction strictly for clinical review and verification. It is not an approved medical fact or part of the finalized patient chart until explicitly reviewed and certified by the attending physician.`
3. **Role Authorization:** Only users with `role: 'doctor'` or `role: 'clinic_admin'` are authorized to execute the formal certification step (`approveOcrDraftAsFact`).

---

## 5. Degraded Document Normalization (Arabic & English)

Documents uploaded by patients in clinical outpatient settings frequently suffer from low resolution, improper lighting, skew, or noise. The extraction engine handles these gracefully:

### 1. Eastern Arabic Numerals (الأرقام المشرقية):
- Converts `٠, ١, ٢, ٣, ٤, ٥, ٦, ٧, ٨, ٩` to standard digits `0-9`.
- Example: `الهيموجلوبين : ١٢.٥ جم/دل` ➔ `12.5 g/dL`.

### 2. Common OCR Character Confusions:
- Resolves letter `l` or `I` as `1` in numerical contexts (`l3.5` ➔ `13.5`).
- Resolves capital letter `O` as `0` in decimals (`O.85` ➔ `0.85`).
- Normalizes European comma decimal separators (`13,5` ➔ `13.5`).

### 3. Confidence Adjustment:
- Degraded scans automatically yield confidence scores below `0.70` (e.g. `0.58`), triggering a prominent warning in the UI:  
  **`⚠️ ثقة منخفضة (يتطلب تدقيق يدوي) / Low Confidence (Manual Verification Needed)`**.

---

## 6. REST API Reference

### 1. Process File OCR
- **Endpoint:** `POST /api/ocr/process-file`
- **Auth:** Required (Bearer Token)
- **Request Body:**
  ```json
  {
    "fileId": "file_12345",
    "caseId": "case_67890",
    "simulatePoorQuality": false
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "draft": {
      "draftId": "ocr_draft_file_12345_1790892000",
      "reviewStatus": "draft",
      "isApprovedFact": false,
      "requiresDoctorReview": true,
      "confidence": 0.94,
      "pageImage": "/api/storage/preview/file_12345?page=1",
      "tests": [...]
    }
  }
  ```

### 2. Get OCR Draft
- **Endpoint:** `GET /api/ocr/drafts/:draftId`
- **Auth:** Required (Patient owner, assigned doctor, or admin)
- **Response (200 OK):** `{ "success": true, "draft": { ... } }`

### 3. Manually Correct Draft Test Item
- **Endpoint:** `PUT /api/ocr/drafts/:draftId/correct`
- **Auth:** Required
- **Request Body:**
  ```json
  {
    "itemIndex": 0,
    "corrections": {
      "testName": "Hemoglobin",
      "value": "13.2",
      "unit": "g/dL",
      "referenceRange": "12.0 - 16.0"
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "draft": { ... },
    "updatedItem": {
      "isManuallyCorrected": true,
      "correctionHistory": [{ "originalState": { "value": "11.2" }, "correctedState": { "value": "13.2" } }]
    }
  }
  ```

### 4. Approve Draft as Official Clinical Fact
- **Endpoint:** `POST /api/ocr/drafts/:draftId/approve`
- **Auth:** Required (Doctor role only)
- **Request Body:**
  ```json
  {
    "doctorNotes": "Values verified against laboratory seal."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "draft": { "reviewStatus": "approved_by_doctor", "isApprovedFact": true },
    "approvedFact": { "factId": "fact_12345_...", "status": "VERIFIED_CLINICAL_FACT" }
  }
  ```

---

## 7. Audit Logging & Compliance

Every OCR event is committed to the centralized security audit trail:
- `MEDICAL_FILE_OCR_PROCESSED`: Records scan status, confidence, extracted count, and draft ID.
- `OCR_DRAFT_MANUALLY_CORRECTED`: Records who edited the draft, timestamp, original value, and corrected value.
- `OCR_DRAFT_APPROVED_AS_CLINICAL_FACT`: Records physician ID, license number, and verified observations list.
