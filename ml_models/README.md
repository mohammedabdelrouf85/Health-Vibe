# HealthVibe AI — Machine Learning Models (`ml_models/`)

This directory houses the clinical machine learning models, inference engines, feature extraction pipelines, model registries, and evaluation suites for **HealthVibe AI**.

---

## 📂 Directory Layout

```
ml_models/
├── MODEL_CARD.md                    # FDA/WHO-aligned clinical model card for resp_rf_v1.0.2
├── README.md                        # Architectural documentation and usage guide
├── model_registry.json              # Version catalog, hyperparameters, and validation hashes
├── feature_extractor.js             # Standardized feature normalization & boundary clamping
├── respiratory_rf_classifier.js     # Random Forest clinical inference engine & safety rules
├── training_pipeline.py             # Python training script (Scikit-Learn / Cross-validation)
└── evaluate_models.js               # Clinical benchmark runner verifying metrics
```

---

## 🧠 Active Production Model

| Property | Value |
| :--- | :--- |
| **Model ID** | `resp_rf_v1.0.2` |
| **Algorithm** | Calibrated Random Forest Ensemble (100 Trees) |
| **Clinical Specialty** | Pulmonology Triage & Urgency Stratification |
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
```

---

## 🔬 Training Pipeline (Python)

To retrain or validate with updated clinical datasets:

```bash
# Ensure Python 3.10+ and requirements
pip install scikit-learn numpy pandas joblib

# Run training pipeline
python ml_models/training_pipeline.py --dataset dataset/train_dataset.json --output ml_models/artifacts/
```

---

## 🧪 Model Evaluation

Run the automated JavaScript evaluation harness:

```bash
node ml_models/evaluate_models.js
```
