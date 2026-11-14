# SpO₂ Feature Pipeline Evaluation

**Status:** preprocessing candidate; not a new or clinically approved model  
**Model evaluated:** `resp_rf_v1.0.2` existing deterministic inference engine  
**Split:** patient-level seed 42, 112 training records and 23 held-out test records

## Transformation

- Validate an integer reading in the physiological input range 50–100; invalid and missing inputs are marked and imputed rather than silently clamped.
- Impute from the training-partition median (92%). The training mean and standard deviation (91.982143 and 4.5591) are used for z-score normalization; these statistics must be refit from the training partition when the data version changes.
- Encode three ordinal clinical bands as one-hot features: critical (<92), moderate (92–94), and normal (≥95), plus a separate missingness flag.
- Keep the imputed raw value in the original feature position so the current model's existing interface remains compatible.

The active JavaScript inference engine currently uses the raw SpO₂ value in its deterministic score and does not learn weights for the appended normalized/one-hot features. Those columns are prepared for a retraining candidate; this report does not claim that they have improved a trained classifier.

## Results

| Evaluation | Baseline | Preprocessing candidate |
|---|---:|---:|
| Complete held-out test accuracy (n=23) | 86.96% | 86.96% |
| Complete held-out macro F1 | 0.8268 | 0.8268 |
| Complete held-out urgent sensitivity | 100% (11/11) | 100% (11/11) |
| Artificial 20% missingness stress macro F1 | 0.7522 | 0.7753 |
| Artificial stress urgent sensitivity | 100% (11/11) | 100% (11/11) |

No test records had naturally missing SpO₂. The stress check masks every fifth held-out record (5 of 23) and compares the old hard-coded 98% fallback with training-median imputation at 92%. It is a robustness probe, not an estimate of real-world missingness and not evidence of statistical significance. The candidate's accuracy in the stress check was unchanged at 82.61%; macro F1 increased by 0.0231.

## Reproduction and limits

Run `node ml_models/evaluate_spo2_preprocessing.js`. The script checks the split manifest, the fitted median, feature-band boundaries, missingness encoding, complete-case parity, and emits `reports/spo2_preprocessing_evaluation.json`.

The repository's Python training dependencies are pinned to Python <3.12; the available environment is Python 3.14.7, so scikit-learn training and a retrained-model comparison were not run. The current inference harness is a deterministic rule/score implementation rather than a fitted Random Forest artifact. A genuine model-impact conclusion requires a reproducible training run in the pinned environment, with preprocessing fitted only on train, model selection on validation, and final metrics on an untouched test cohort reviewed by clinical QA.
