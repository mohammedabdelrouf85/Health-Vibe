# HealthVibe AI — Machine Learning Models (`ml_models/`)

This directory houses the clinical machine learning models, inference engines, feature extraction pipelines, model registries, reproducibility verification engines, and evaluation suites for **HealthVibe AI**.

---

## 📂 Directory Layout

```
ml_models/
├── requirements.txt                 # Strictly pinned Python ML dependencies (== only)
├── MODEL_CARD.md                    # FDA/WHO-aligned clinical model card for resp_rf_v1.0.2
├── README.md                        # Architectural documentation and usage guide
├── model_registry.json              # Version catalog, hyperparameters, validation hashes & seed
├── reproducibility_service.js       # Output determinism verification & requirements auditor
├── feature_extractor.js             # Standardized feature normalization & boundary clamping
├── respiratory_rf_classifier.js     # Random Forest clinical inference engine & safety rules
├── training_pipeline.py             # Python training script (Deterministic RANDOM_SEED = 42)
└── evaluate_models.js               # Clinical benchmark & reproducibility runner
```

---

## 🧠 Active Production Model

| Property | Value |
| :--- | :--- |
| **Model ID** | `resp_rf_v1.0.2` |
| **Algorithm** | Calibrated Random Forest Ensemble (100 Trees) |
| **Clinical Specialty** | Pulmonology Triage & Urgency Stratification |
| **Random Seed** | `42` (Strictly pinned across Python & Node.js) |
| **Reproducibility Guarantee** | Zero variance ($s = 0.000$) on identical inputs |
| **Sensitivity** | **96.2%** (Severe / Emergency presentations) |
| **Specificity** | **94.8%** |
| **AUROC** | **0.974** |
| **Safety Overrides** | Hard triage triggers for $SpO_2 < 90\%$, $RR \ge 32$, and hemoptysis |

---

## 💻 Quick Usage Example (Node.js)

```javascript
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');

const classifier = new RespiratoryRFClassifier();

const assessment = classifier.predict({
  age: 48,
  oxygen_saturation: 92,
  respiratory_rate: 26,
  dyspnea_severity: 2,
  has_cough: true,
  cough_duration_days: 14,
  has_asthma: true
});

console.log('Triage Category:', assessment.triage_category); // 'HIGH_RISK'
console.log('Urgency Code:', assessment.urgency_code);       // 'ORANGE'
console.log('Risk Score:', assessment.risk_score);           // 75/100
console.log('Probabilities:', assessment.probabilities);
console.log('Reproducibility Fingerprint:', assessment.reproducibility.feature_fingerprint);
```

---

## 🔬 Deterministic Training Pipeline (Python)

To retrain or validate with strictly pinned clinical dependencies and deterministic RNG:

```bash
# 1. Install strictly locked dependencies (PRD Req #77)
pip install -r ml_models/requirements.txt

# 2. Run deterministic training pipeline with fixed seed (42)
python ml_models/training_pipeline.py --dataset dataset/train_dataset.json --output ml_models/artifacts/ --seed 42
```

---

## 🧪 Model Evaluation & Reproducibility Verification

Run the automated JavaScript evaluation harness verifying both clinical thresholds and 50-run determinism:

```bash
node ml_models/evaluate_models.js
```

Or run the full reproducibility suite:

```bash
npm run test:reproducibility
```
