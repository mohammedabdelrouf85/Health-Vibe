# 🏥 Health Vibe AI - Dataset License & Scientific Quality Governance Framework
**PRD Page 9, Requirement 46 Compliance Document**  
*Legal Licensing Verification, Commercial Viability, Provenance Tracking, and Clinical Quality Assurance*

---

## 1. Executive Summary & Regulatory Mandate (نظرة عامة والأساس القانوني)

In accordance with **Requirement 46** of the Health Vibe AI Product Requirements Document (PRD):
> **"فحص وتوثيق رخصة استخدام (License) وجودة أي Dataset مستخرجة من Kaggle أو المصادر الطبية المفتوحة للتأكد من صلاحيتها القانونية والعلمية."**
> *(Audit and document the license of use and quality of any dataset extracted from Kaggle or open medical sources to ensure its legal and scientific validity).*

Health Vibe AI enforces strict, bidirectional governance over all datasets used for offline artificial intelligence pre-triage models. No dataset from Kaggle, PhysioNet, UCI Machine Learning Repository, Mendeley Data, or open medical repositories may be ingested without passing both:
1. **Legal Licensing Clearance (الفحص والصلاحية القانونية):** Verifying intellectual property, commercial reuse authorization, redistribution rights, and patient privacy compliance (HIPAA Safe Harbor / GDPR).
2. **Scientific & Clinical Quality Audit (الجودة والصلاحية العلمية والسريرية):** Verifying physiological plausibility, sample size sufficiency ($N \ge 100$), critical missingness limits ($< 5\%$), expert clinical ground truth annotation, and demographic fairness.

---

## 2. Legal Licensing Verification Framework (الإطار القانوني والتراخيص)

### 2.1 Approved Open Licenses for Clinical AI (التراخيص المعتمدة)
The following standardized open licenses are approved for Health Vibe AI offline training and pre-triage modeling:

| License Type | SPDX Identifier | Commercial Use | Derivative Works | Attribution Required | Status in Health Vibe AI |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Creative Commons Attribution 4.0** | `CC-BY-4.0` | ✅ Allowed | ✅ Allowed | ✅ Required | **Fully Approved** |
| **Creative Commons Zero 1.0** | `CC0-1.0` | ✅ Allowed | ✅ Allowed | ❌ Optional | **Fully Approved (Public Domain)** |
| **Open Data Commons Attribution** | `ODC-BY-1.0` | ✅ Allowed | ✅ Allowed | ✅ Required | **Fully Approved** |
| **Open Database License** | `ODbL-1.0` | ✅ Allowed | ✅ Allowed | ✅ Required | **Fully Approved** |
| **MIT License** | `MIT` | ✅ Allowed | ✅ Allowed | ✅ Required | **Fully Approved** |
| **Apache License 2.0** | `Apache-2.0` | ✅ Allowed | ✅ Allowed | ✅ Required | **Fully Approved** |

### 2.2 Restricted & Prohibited Licenses (التراخيص المقيدة والمحظورة)
- **Non-Commercial Restricted (`CC-BY-NC-4.0`, `CC-BY-NC-SA-4.0`):**
  - **Policy:** Explicitly **blocked** from any commercial production deployment pipeline. Restricted exclusively to offline academic research or sandbox comparative evaluations.
- **Copyleft Viral Licenses (`GPL-3.0`):**
  - **Policy:** Restricted; requires architectural isolation to prevent viral licensing propagation into proprietary clinical microservices.
- **Unverified, Unknown, or All-Rights-Reserved:**
  - **Policy:** **Strictly Forbidden.** Immediate rejection upon ingest attempt.

### 2.3 Patient Privacy, Consent & IRB Ethical Compliance (حماية الخصوصية وموافقة المرضى)
- **HIPAA 18 Safe Harbor (45 CFR § 164.514):** All datasets must be 100% de-identified. Direct identifiers (National ID, patient names, emails, phone numbers, birth dates, exact addresses, medical record numbers) are strictly banned.
- **GDPR Article 89:** Processing of health data for scientific research requires technical and organizational pseudonymization and anonymization safeguards.
- **IRB / Ethics Clearance:** Every open medical dataset in the registry must document Institutional Review Board (IRB) approval, informed patient consent, or public health surveillance exemption status.

---

## 3. Scientific & Clinical Quality Assurance Protocol (بروتوكول الجودة العلمية والسريرية)

To ensure clinical safety, diagnostic validity, and alignment with medical standards, all ingested datasets are evaluated across five quality dimensions:

### 3.1 Completeness & Missing Value Tolerance (اكتمال البيانات)
- **Critical Physiological Markers:** Blood Oxygen ($SpO_2$), Respiratory Rate, and Diagnostic Outcome must have a missingness rate of **$< 5.0\%$**. Zero synthetic imputation is permitted for ground-truth diagnosis labels.
- **Secondary Features:** Overall dataset missingness must not exceed **$10.0\%$**.

### 3.2 Physiological Plausibility Boundaries (الحدود الفسيولوجية المعتمدة طبياً)
Datasets are automatically audited against clinical physiological plausibility ranges:

| Biomarker / Vital Sign | Minimum Plausible | Maximum Plausible | Clinical Unit | Standard Medical Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Blood Oxygen Saturation ($SpO_2$)** | `50` | `100` | `%` | Pulse oximetry clinical limits |
| **Respiratory Rate ($RR$)** | `5` | `60` | `breaths/min` | Adult / Pediatric respiratory triage |
| **Heart Rate ($HR$)** | `30` | `220` | `bpm` | Physiological bradycardia / tachycardia limits |
| **Body Temperature** | `34.0` | `43.0` | `°C` | Severe hypothermia to hyperpyrexia limits |
| **Systolic Blood Pressure** | `60` | `260` | `mmHg` | AHA / ESC hypertension guidelines |
| **Diastolic Blood Pressure** | `35` | `150` | `mmHg` | AHA / ESC hypertension guidelines |
| **Blood Glucose** | `40` | `500` | `mg/dL` | ADA severe hypoglycemia to ketoacidosis limits |
| **Hemoglobin ($Hb$)** | `3.0` | `24.0` | `g/dL` | Clinical pathology critical hematology bounds |
| **Body Mass Index ($BMI$)** | `10.0` | `70.0` | `kg/m²` | WHO global obesity classification scale |

### 3.3 Expert Ground Truth Annotation (دقة التوصيف والتشخيص المرجعي)
- Annotations must be derived from certified physician specialists, standardized laboratory assays (e.g. automated Coulter CBC, HPLC HbA1c assays), or verified spirometry ($FEV_1 / FVC$).
- Where subjective clinical scoring is used, an **Inter-Rater Reliability (Cohen's Kappa $\kappa$) $\ge 0.85$** is required to guarantee specialist consensus.

### 3.4 Demographic Parity & Bias Minimization (التوازن الديمغرافي والعدالة الإحصائية)
- Balanced representation across gender ($40\% - 60\%$ range per sex).
- Stratified sampling across pediatric, young adult, middle-aged, and geriatric age cohorts.
- Representation of key clinical comorbidities (asthma, COPD, hypertension, smoking history).

---

## 4. Kaggle & Open Clinical Dataset Registry Matrix (سجل البيانات المعتمد)

The table below summarizes the formal audit status of the foundational benchmark datasets registered in `dataset/dataset_provenance_and_quality_registry.json`:

| Dataset Identifier | Domain | License | Commercial Viability | Sample Size ($N$) | Quality Score | Ground Truth Authority | Audit Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `kaggle/respiratory-sound-database` | Respiratory | `CC-BY-4.0` | ✅ Allowed | 920 sounds / 126 pts | **94 / 100** | Pulmonologist consensus (ICBHI) | **Certified Valid** |
| `kaggle/asthma-copd-clinical-dataset` | Respiratory | `CC-BY-4.0` | ✅ Allowed | 2,392 patients | **96 / 100** | Specialist spirometry ($FEV_1/FVC$) | **Certified Valid** |
| `kaggle/diabetes-prediction-dataset` | Metabolic | `CC0-1.0` | ✅ Allowed | 100,000 patients | **95 / 100** | Standardized lab assays (HbA1c/Glucose) | **Certified Valid** |
| `kaggle/hypertension-risk-indicators` | Cardiovascular | `CC-BY-4.0` | ✅ Allowed | 253,680 patients | **97 / 100** | Certified clinician sphygmomanometry | **Certified Valid** |
| `kaggle/obesity-levels-estimation` | Metabolic | `CC-BY-4.0` | ✅ Allowed | 2,111 patients | **96 / 100** | WHO clinical BMI evaluation | **Certified Valid** |
| `kaggle/blood-disorders-hematology-benchmarks` | Hematology | `CC-BY-4.0` | ✅ Allowed | 1,420 patients | **95 / 100** | Certified clinical hematologist + CBC | **Certified Valid** |

---

## 5. Architectural Separation Enforcement (PRD Page 16)

As stipulated in **PRD Page 16 (Section 13.1 Technical Correction)**:
1. **Offline Training Only:** Kaggle benchmarks and open datasets are strictly restricted to offline feature extraction, model calibration, and pre-triage heuristic derivation.
2. **Zero Operational Storage:** Kaggle is never used as an operational datastore. Patient records, live clinical cases, and Patient History are housed strictly in the secure PostgreSQL / Supabase relational database.
3. **Anti-Leakage Guard (`verifyZeroPhi`):** Any dataset ingested is passed through automated Safe Harbor scanners to ensure zero real patient identifiers are introduced.

---

## 6. Automated Validation Service API (`dataset_governance_service.js`)

Health Vibe AI provides an automated programmatic API to audit any newly proposed Kaggle or open dataset:

```javascript
const { datasetGovernanceService } = require("./dataset/dataset_governance_service");

// 1. Audit legal licensing
const legalAudit = datasetGovernanceService.auditDatasetLegalLicensing({
  licenseType: "CC-BY-4.0",
  isCommercialUseAllowed: true,
  patientConsentStatus: "IRB Approved",
  citation: "Clinical Benchmark Dataset, 2026."
});

// 2. Audit scientific quality & physiological bounds on data sample
const qualityAudit = datasetGovernanceService.auditDatasetScientificQuality(
  { groundTruthAnnotation: "Pulmonologist verified", interRaterReliabilityKappa: 0.91 },
  sampleRows
);

// 3. Full governance audit report
const fullAudit = datasetGovernanceService.auditFullDataset(metadata, sampleRows);
console.log(fullAudit.governanceClearanceStatus); // "APPROVED_FOR_CLINICAL_TRAINING"
```

---

## 7. Continuous Compliance & Versioning

- **Registry File:** [`dataset/dataset_provenance_and_quality_registry.json`](file:///d:/MY%20PC/Coding/Health%20Vibe%20Ai/dataset/dataset_provenance_and_quality_registry.json)
- **Governance Service:** [`dataset/dataset_governance_service.js`](file:///d:/MY%20PC/Coding/Health%20Vibe%20Ai/dataset/dataset_governance_service.js)
- **Automated Test Suite:** `tests/strict_dataset_license_and_quality_governance.test.js` (`npm run test:dataset-quality`)
- **Review Cycle:** Bi-annual review or upon any dataset ingest.
