# Respiratory Rate Feature Pipeline Evaluation

**Status:** preprocessing candidate; not a new or clinically approved model  
**Model evaluated:** `resp_rf_v1.0.2` existing deterministic inference engine  
**Split:** patient-level seed 42, 112 training records and 23 held-out test records

## Transformation

- Validate integer breaths per minute in the existing physiological input range 5–60; missing or invalid values are marked and imputed rather than silently clamped.
- Impute using the training-partition median (21 breaths/min). Normalize using the training mean (22.178571) and standard deviation (6.213773). Refit these values on train only for a new dataset version.
- Add one-hot bands: low (<12), normal (12–20), elevated (21–24), and tachypnea (>24), plus a missingness flag.
- Preserve the raw imputed rate in its original model-vector position for compatibility.

The active inference harness reads the raw rate in its existing deterministic score. It does not have trained weights for the appended normalized or encoded columns; results below measure the current engine's sensitivity to the new imputation, not performance of a retrained model.

## Results

| Evaluation | Baseline | Preprocessing candidate |
|---|---:|---:|
| Complete held-out test accuracy (n=23) | 86.96% | 86.96% |
| Complete held-out macro F1 | 0.8268 | 0.8268 |
| Complete held-out urgent sensitivity | 100% (11/11) | 100% (11/11) |
| Artificial 20% missingness stress accuracy | 86.96% | 82.61% |
| Artificial stress macro F1 | 0.8268 | 0.7579 |
| Artificial stress urgent sensitivity | 100% (11/11) | 100% (11/11) |

No test records had naturally missing respiratory rate. The stress check masks every fifth test record (5 of 23), comparing the former hard-coded fallback of 16 with median imputation at 21. In this small cohort, median imputation reduced accuracy by 4.35 percentage points and macro F1 by 0.0689; it did not change urgent sensitivity. This signals a need to evaluate missingness patterns and missing-indicator use during actual model retraining, rather than treating median imputation as an established improvement.

## Reproduction and limits

Run `node ml_models/evaluate_respiratory_rate_preprocessing.js`. The script validates category boundaries, missing-value encoding, the fitted median and patient-level split manifest, then writes `reports/respiratory_rate_preprocessing_evaluation.json`.

The repository's Python ML dependencies require Python <3.12; the available runtime is Python 3.14.7, so scikit-learn training could not be run. The active JavaScript inference harness is deterministic rule/score code, despite its Random Forest naming. A true estimate of feature impact requires retraining in the pinned environment, fitting preprocessing on train only, selecting on validation, evaluating once on a sufficiently large untouched test cohort, and clinical QA review.
