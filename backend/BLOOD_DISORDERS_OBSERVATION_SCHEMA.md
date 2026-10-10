# Blood Clotting / Blood Disorders Structured Clinical Data & Observation Schema

## 1. Clinical Overview & Safety Governance

In the Health Vibes application architecture, the **Blood Clotting & Blood Disorders** module manages clinical information across multiple distinct hematological conditions (e.g. Venous Thromboembolism, Thrombophilia Screening, Anticoagulant Monitoring, Bleeding Disorders / Coagulopathies, and Thrombocytopenia).

### Core Clinical Principles & Boundaries
1. **No Hardcoded Unsupported Medical Rules**: The clinical observation schema is generalized and extensible. It does not enforce artificial restrictions or rigid diagnostic cutoffs that bias clinical judgment.
2. **Zero Automated Diagnoses & Zero Treatment Recommendations**: Storing, viewing, reviewing, or correcting observations strictly records facts. The system never predicts, auto-generates, or infers diagnoses or therapeutic interventions.
3. **No Fabricated Data or Imputed Values**: If a patient or external lab report omits a unit, reference range, or collection date, the system **never replaces missing values with assumptions**. Missing fields remain `null` or unrecorded.
4. **Default Unverified Gate**: Any observation entered by a patient or ingested via external EHR, LIS interface, or OCR is strictly treated as `UNVERIFIED` until reviewed by an authorized, licensed physician.
5. **Preservation of Raw Source Data**: Ingestion captures an immutable `originalSourceData` snapshot. Even if an observation is later corrected, the raw source payload remains intact for medical-legal provenance.
6. **Auditable Manual Corrections**: Human corrections must supply a mandatory `correctionReason` and produce a versioned audit trail recording previous/new values, timestamp, and clinician identity.

---

## 2. Structured Observation Schema

Each clinical or laboratory observation adheres to the following structured definition:

```typescript
interface BloodDisorderObservation {
  // Unique Record Identifiers
  observationId: string;             // Pattern: obs_bd_<patientId>_<timestamp>_<hex>
  id: string;                        // Alias for observationId
  patientId: string;                 // Attributed patient identifier
  caseId?: string | null;            // Optional linked blood disorder case ID
  conditionId?: string | null;       // Optional linked condition (e.g. 'vka_inr_monitoring')

  // Clinical & Laboratory Observation Core Fields
  testName: string;                  // Standardized or reported test name (e.g. 'International Normalized Ratio')
  testCode?: string | null;          // Standardized code if available (e.g. 'INR', 'D_DIMER', 'PLATELET_COUNT')
  resultValue: number | string;      // Quantitative number or qualitative string (e.g. 2.4, 'Detected')
  valueType: 'quantitative' | 'qualitative';

  // Unit of Measurement (NEVER ASSUMED: null if omitted by source)
  unit: string | null;

  // Reference Range (ONLY WHEN PROVIDED BY SOURCE: null if omitted)
  referenceRange: {
    low: number | null;
    high: number | null;
    text?: string | null;
    unit?: string | null;
    providedBySource: true;
  } | null;

  // Collection Date/Time (NEVER SUBSTITUTED WITH CURRENT TIME IF MISSING: null if omitted)
  collectionDateTime: string | null; // ISO 8601 string or null

  // Ingestion Source Provenance
  source: 'patient_entered' | 'external_ehr_import' | 'lab_interface_import' | 'medical_ocr_import' | 'clinician_entered' | 'device_telemetry';

  // Document Attachment Reference (PDF lab report, scan, or file pointer)
  attachmentRef: {
    fileId: string | null;
    fileName?: string | null;
    fileUrl?: string | null;
    mimeType?: string | null;
    sourceDocumentId?: string | null;
  } | null;

  // Author & Ingestion Identity
  author: {
    uid: string;
    name: string;
    role: 'patient' | 'doctor' | 'nurse' | 'clinic_admin' | 'lab_interface' | 'system';
  };

  // Review Status Gate
  reviewStatus: 'UNVERIFIED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED';

  // Medical Reviewer Details (Populated only upon physician review)
  reviewDetails: {
    reviewedBy: {
      uid: string;
      name: string;
      role: 'doctor';
      licenseNumber: string;
      specialty: string;
    } | null;
    reviewedAt: string | null;        // ISO 8601 string
    reviewNotes: string;              // Physician notes regarding verification
    reviewDecision: 'VERIFIED' | 'REJECTED' | null;
  } | null;

  // Immutable Raw Source Snapshot
  originalSourceData: {
    rawTestName: any;
    rawResultValue: any;
    rawUnit: any;
    rawReferenceRange: any;
    rawCollectionDateTime: any;
    rawSource: any;
    rawAttachmentRef: any;
    rawAuthor: any;
    rawPayload: any;                 // Complete intact original payload
    ingestedAt: string;
  };

  // Auditable Revision & Correction History
  revisionNumber: number;            // Starts at 1; increments on each auditable correction
  correctionHistory: Array<{
    revision: number;
    nextRevision: number;
    correctedAt: string;
    correctedBy: {
      uid: string;
      name: string;
      role: string;
      licenseNumber?: string | null;
    };
    correctionReason: string;        // Mandatory non-empty reason
    previousValues: Record<string, any>;
    newValues: Record<string, any>;
  }>;

  clinicalNotes?: string | null;

  // Non-Diagnostic Clinical Boundary Notice
  clinicalBoundary: {
    isDiagnostic: false;
    isTreatmentRecommendation: false;
    disclaimerEn: string;
    disclaimerAr: string;
  };

  createdAt: string;                 // ISO 8601 string
  updatedAt: string;                 // ISO 8601 string
}
```

---

## 3. Workflow Invariants & Lifecycle

### Invariant 1: Unverified Intake by Default
- Any observation with `source` in `['patient_entered', 'external_ehr_import', 'lab_interface_import', 'medical_ocr_import']` or where `author.role !== 'doctor'` is assigned `reviewStatus = 'UNVERIFIED'`.
- Even if a patient or client payload attempts to specify `reviewStatus: 'VERIFIED'`, the ingestion validator forces it to `'UNVERIFIED'`.

### Invariant 2: Immutable Raw Source Data
- `originalSourceData` is shallow and deeply protected.
- Subsequent reviews or manual corrections never modify `originalSourceData`.
- Auditing can always reconstruct the original entry.

### Invariant 3: Mandatory Correction Reason & Versioning
- Any manual correction requires:
  1. Authorized clinical user (`role: 'doctor'`, `'nurse'`, `'clinic_admin'`).
  2. Mandatory, non-empty `correctionReason`.
- The update records a diff of previous and new values in `correctionHistory`.
- `revisionNumber` is incremented.
- If the observation was previously `'VERIFIED'`, manual correction resets `reviewStatus = 'UNVERIFIED'` until an attending physician re-reviews the updated values.

### Invariant 4: No Assumed Defaults for Missing Data
- `unit`: Stored as `null` if missing; never defaulted to a standard unit (e.g. neither `ratio` nor `seconds` is assumed).
- `referenceRange`: Stored as `null` if missing; never defaulted to laboratory standard ranges unless provided by the reporting laboratory.
- `collectionDateTime`: Stored as `null` if missing; never defaulted to `now` or ingestion time.

---

## 4. REST API Contract

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/blood-disorders/observations` | `requireAuth` | Ingest structured laboratory or clinical observation. Patient/imported data set to `UNVERIFIED`. |
| `GET` | `/api/blood-disorders/patient/:patientId/observations` | `requireAuth` (Self/Doctor) | Query patient observations with filters (`reviewStatus`, `conditionId`, `testCode`, `limit`). |
| `GET` | `/api/blood-disorders/observations/:observationId` | `requireAuth` (Self/Doctor) | Retrieve single observation with full provenance, source data, and correction trail. |
| `POST` | `/api/blood-disorders/observations/:observationId/review` | `requireAuth`, `requireDoctor` | Physician review (`VERIFIED` or `REJECTED`) with license tracking and notes. |
| `POST` | `/api/blood-disorders/observations/:observationId/correct` | `requireAuth`, Clinical Role | Auditable manual correction with mandatory `correctionReason`. |
