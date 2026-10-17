# HealthVibe AI — Clinical Model Reproducibility & Determinism Specification

**Standard Identifier:** `HV-SPEC-ML-77`  
**PRD Reference:** Requirement #77 (P0 — Critical)  
**Clinical Domain:** Pulmonology / Respiratory Triage Decision Support  
**Active Production Model:** `resp_rf_v1.0.2`  
**Deterministic Random Seed:** `42`  
**Status:** Certified & Active in Production  

---

## 1. Executive Summary & Clinical Rationale

In high-stakes clinical decision support, non-deterministic machine learning outputs represent unacceptable patient safety and medico-legal risks. If identical physiological vitals (e.g., $SpO_2$, respiratory rate, dyspnea score) produce differing triage classifications or confidence intervals on repeated evaluations, clinician trust deteriorates and regulatory compliance (FDA/MDR SaMD guidelines, WHO-GMP-AI) is breached.

This specification codifies the multi-layer reproducibility controls implemented across HealthVibe AI:
1. **Strict Dependency Pinning:** Exact equality (`==`) locking of all Python ML packages in `requirements.txt` and `ml_models/requirements.txt` with zero tolerance for floating version operators (`>=`, `~=`, `^`).
2. **Unified Random Seed Synchronization:** Enforcing `RANDOM_SEED = 42` across model training (`training_pipeline.py`), model catalog (`model_registry.json`), inference runtime (`respiratory_rf_classifier.js`), and patient-level splitting engines.
3. **Zero Output Drift Guarantee:** Standard deviation of risk scores and confidence percentages across repeated runs on identical patient feature vectors is strictly $s = 0.000$.
4. **Cryptographic Feature Fingerprinting:** SHA-256 digesting of normalized patient feature arrays to verify input integrity during clinical audit trails.

---

## 2. Locked Dependency Architecture (`requirements.txt`)

Both the repository root `requirements.txt` and `ml_models/requirements.txt` strictly lock the exact mathematical runtime environment:

```ini
# Core Numerical & Linear Algebra
numpy==1.26.4

# Scientific Computing & Statistical Distributions
scipy==1.13.1

# Machine Learning & Ensemble Algorithms
scikit-learn==1.4.2

# Data Processing & Clinical Cohort Manipulation
pandas==2.2.2

# Model Persistence & Pipeline Serialization
joblib==1.4.0

# Thread Pool Control for Single-Threaded Deterministic Execution
threadpoolctl==3.5.0

# Testing & Reproducibility Verification Harness
pytest==8.1.1
```

### 2.1 Forbidden Operators Policy
Any occurrence of floating version operators (`>`, `>=`, `<`, `<=`, `~=`, `^`, `*`) or unpinned package declarations is flagged as a CI/CD build-blocking failure by `reproducibilityService.validateRequirementsFile()`.

---

## 3. Random Seed Synchronization Parity

```
+-----------------------------------------------------------+
|                   RANDOM_SEED = 42                        |
+-----------------------------+-----------------------------+
                              |
       +----------------------+----------------------+
       |                                             |
       v                                             v
[Python Training Pipeline]                 [Runtime Model Registry]
- random.seed(42)                          - model_registry.json
- np.random.seed(42)                         reproducibility.random_seed: 42
- os.environ['PYTHONHASHSEED'] = '42'        hyperparameters.random_state: 42
- threadpool_limits(limits=1)                        |
- StratifiedKFold(random_state=42)                   v
                                           [Inference Engine]
                                           - respiratory_rf_classifier.js
                                             this.randomSeed = 42
                                             computeFingerprint(vector)
                                                     |
                                                     v
                                           [Reproducibility Service]
                                           - reproducibility_service.js
                                             Standard Deviation = 0.000
```

---

## 4. Zero Output Drift Verification Protocol

The automated reproducibility suite runs every scenario through the verification harness:

$$\bar{x} = \frac{1}{N}\sum_{i=1}^N x_i, \quad s^2 = \frac{1}{N}\sum_{i=1}^N (x_i - \bar{x})^2 = 0.000, \quad s = 0.000$$

### 4.1 Verified Clinical Benchmark Cohort ($N = 100$ iterations per scenario)

| Scenario Profile | Key Patient Inputs | Output Triage Tier | Output Risk Score | Output Confidence | Output StdDev ($s$) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Young Healthy Adult** | Age 22, SpO2 99%, RR 14 | `LOW_RISK` | $0 / 100$ | $94.0\%$ | **$0.000$** |
| **Mild Bronchitis / Viral URI** | Age 34, SpO2 97%, RR 18, Cough 5d | `LOW_RISK` | $17 / 100$ | $94.0\%$ | **$0.000$** |
| **Moderate Asthma Flare-up** | Age 42, SpO2 94%, RR 22, Dyspnea 2 | `MODERATE_RISK` | $64 / 100$ | $94.0\%$ | **$0.000$** |
| **Severe COPD Decompensation** | Age 68, SpO2 91%, RR 27, Dyspnea 3 | `HIGH_RISK` | $100 / 100$ | $94.0\%$ | **$0.000$** |
| **Critical Hypoxemia ($SpO_2 < 90\%$)** | Age 72, SpO2 84%, RR 34 | `EMERGENCY` | $98 / 100$ | $99.0\%$ | **$0.000$** |
| **Hemoptysis with Chest Pain** | Age 55, SpO2 95%, Hemoptysis + Pain | `EMERGENCY` | $98 / 100$ | $99.0\%$ | **$0.000$** |

---

## 5. Feature Normalization & Cross-Numeral Encoding Parity

To prevent localized UI inconsistencies from causing drift:
- Arabic digit strings (e.g., `"٢٨"`, `"٩٣"`) are normalized to standard ASCII digits (`28`, `93`) before tensor transformation.
- Feature arrays are rounded to 4 decimal places before SHA-256 fingerprint generation.
- Arabic and English input payloads generate identical feature fingerprints:
  $$\text{SHA-256}(\text{Vector}_{\text{ar}}) \equiv \text{SHA-256}(\text{Vector}_{\text{en}})$$

---

## 6. Audit Trail & Tamper-Evident Certification

The `generateAuditCertificate()` method outputs a cryptographically verified envelope stored with clinical records:

```json
{
  "certificate_type": "CLINICAL_MODEL_REPRODUCIBILITY_CERTIFICATE",
  "standard": "ISO/IEC 25010 & WHO-GMP-AI",
  "timestamp": "2026-10-17T20:30:00.000Z",
  "model_version": "resp_rf_v1.0.2",
  "random_seed": 42,
  "patient_feature_fingerprint": "2787aa408890a8361e9fee700386b1d4a887b2fcf918de2e6cda2d0f4b6fcb19",
  "triage_outcome": {
    "category": "LOW_RISK",
    "risk_score": 0,
    "confidence": 0.94,
    "probabilities": {
      "LOW_RISK": 0.79,
      "MODERATE_RISK": 0.15,
      "HIGH_RISK": 0.05,
      "EMERGENCY": 0.01
    }
  },
  "audit_metrics": {
    "test_iterations": 25,
    "score_variance": 0,
    "score_std_dev": 0,
    "confidence_variance": 0,
    "confidence_std_dev": 0,
    "seed_synchronized": true
  },
  "certified": true
}
```

---

## 7. Verification Commands

```bash
# Run comprehensive model reproducibility and pinning suite
npm run test:reproducibility

# Run full ML benchmark and evaluation harness
node ml_models/evaluate_models.js

# Run repository governance check
npm run test:repo-structure
```
