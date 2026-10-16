# 🏥 Health Vibe AI - Patient-Level Dataset Splitting & Anti-Leakage Governance Framework
**PRD Page 22, Requirement 52 Compliance Document**  
*Strict Patient-Level (Subject/Group) Partitioning, Stratified Train/Val/Test Splits, and Zero Data Leakage Guarantees*

---

## 1. Executive Summary & Regulatory Imperative (نظرة عامة والأساس العلمي)

In medical artificial intelligence and software as a medical device (SaMD), naive random data splitting (sample-level split) is one of the leading causes of model failure upon clinical deployment. 

In accordance with **Requirement 52** of the Health Vibe AI Product Requirements Document (PRD):
> **"فصل بيانات التدريب والاختبار (Train / Validation / Test Split) بشكل صارم على مستوى المريض (Patient-level Split) لضمان عدم تسرب بيانات نفس المريض بين التدريب والاختبار."**
> *(Strictly partition training, validation, and test data at the patient level to guarantee zero leakage of the same patient's data between training and evaluation).*

Health Vibe AI enforces strict, automated patient-level (subject/group) partitioning across all offline training datasets, benchmark ingest pipelines, and prospective evaluation sets.

---

## 2. The Clinical "Data Leakage" Danger: Why Sample-Level Split Fails

### 2.1 The Identity Confounding Problem (تسرب البصمة الحيوية للمريض)
In clinical datasets, patients typically undergo repeated assessments, longitudinal check-ins, or multiple biomarker measurements:
- A patient with chronic COPD may have 5 triage logs over 2 months.
- An asthmatic patient may have multiple respiratory sound clips.

If a dataset is partitioned randomly at the **record/sample level**:
1. Record A from Patient $P_1$ goes to the **Training set**.
2. Record B from Patient $P_1$ goes to the **Test set**.

### 2.2 Consequence: False High Accuracy & Real-World Collapse
When records from the same patient are split across train and test:
- The machine learning model memorizes patient-specific biological idiosyncrasies (e.g. resting respiratory pattern, unique biometric ranges, unmeasured baseline features) rather than generalizable disease pathology.
- Evaluation metrics appear deceptively stellar (e.g. 99% accuracy on test set).
- When the model encounters a **new, unseen patient** in a clinic or home triage, performance dramatically collapses because the model never learned generalizable disease features.

---

## 3. Mathematical Proof & Set-Theoretic Invariants of Patient-Level Splitting

Let the complete clinical dataset be denoted as $\mathcal{D} = \{ (x_i, y_i, p_i) \}_{i=1}^{N}$, where:
- $x_i$ is the feature vector (vitals, symptoms, demographics).
- $y_i$ is the ground-truth clinical target (triage urgency, target label).
- $p_i \in \mathcal{P}$ is the unique patient identifier ($|\mathcal{P}| = M \le N$).

### 3.1 Patient Set Partition Invariant (عدم التقاطع المطلق لمجموعات المرضى)
Let $\mathcal{P}_{Train}$, $\mathcal{P}_{Val}$, and $\mathcal{P}_{Test}$ denote the subsets of patients assigned to each split:

$$\mathcal{P}_{Train} \cup \mathcal{P}_{Val} \cup \mathcal{P}_{Test} = \mathcal{P}$$

$$\mathcal{P}_{Train} \cap \mathcal{P}_{Val} = \emptyset$$

$$\mathcal{P}_{Train} \cap \mathcal{P}_{Test} = \emptyset$$

$$\mathcal{P}_{Val} \cap \mathcal{P}_{Test} = \emptyset$$

### 3.2 Record Assignment Invariant
Any observation $i$ with patient identifier $p_i$ is mapped strictly according to:

$$\text{Split}(i) = \begin{cases}
\text{Train}, & \text{if } p_i \in \mathcal{P}_{Train} \\
\text{Validation}, & \text{if } p_i \in \mathcal{P}_{Val} \\
\text{Test}, & \text{if } p_i \in \mathcal{P}_{Test}
\end{cases}$$

No single patient can ever have observations distributed across more than one split partition.

---

## 4. Stratified Group Splitting Algorithm (خوارزمية التقسيم الطبقي الموزون)

To prevent clinical class imbalance (e.g. all urgent patients ending up in training while test has only mild patients), Health Vibe AI implements **Stratified Group Splitting**:

1. **Patient Aggregation:** Group all individual clinical encounters by `patientId` / `subjectId`.
2. **Primary Patient Label Assignment:** Assign a primary clinical stratum $S_p$ to each patient group (e.g., highest urgency or majority diagnostic label).
3. **Stratum-Wise Deterministic Partition:**
   - For each clinical stratum $S \in \{ \text{urgent}, \text{high}, \text{normal} \}$:
     - Shuffle patient IDs using a deterministic pseudo-random generator with fixed seed ($\text{Seed} = 42$).
     - Allocate patient groups according to target ratios:
       - **Train Set:** $70\%$ of patients.
       - **Validation Set:** $15\%$ of patients (model selection & threshold calibration).
       - **Test Set:** $15\%$ of patients (held-out final clinical validation).
4. **Zero-Leakage Assertion:** Execute pairwise set intersection check before exporting artifacts.

---

## 5. Artifact Manifest & Cryptographic Provenance

Every dataset split automatically generates an immutable audit manifest `dataset/patient_level_split_manifest.json`:
- Target vs Achieved patient-level and record-level ratios.
- Total distinct patient count ($M$) and record count ($N$).
- Class distributions per partition to verify demographic and severity balance.
- Cryptographic SHA-256 fingerprint of the split state.
- Zero-leakage verification timestamp and clinical certification seal.

---

## 6. International Regulatory & Standards Compliance

This framework directly aligns Health Vibe AI with leading international medical AI standards:
- **FDA / Health Canada / UK MHRA Good Machine Learning Practice (GMLP):** Principle 5 ("Data sets are representative of the intended patient population, and independent test sets are strictly isolated").
- **CONSORT-AI & TRIPOD-AI Guidelines:** Strict reporting of subject-level independence between training and validation sets.
- **ISO/IEC 42001:2023 (Artificial Intelligence Management System):** Traceable, repeatable, and audited training-data provenance.
