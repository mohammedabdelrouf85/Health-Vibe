# mMRC Feature Pipeline Evaluation

**Status:** preprocessing candidate; no clinical model approval implied  
**Existing model:** `resp_rf_v1.0.2`  
**Patient-level split:** seed 42; 112 training records and 23 held-out test records

## Processing added

- Accept mMRC grades 0–4 from flat fields or the structured assessment record; reject out-of-range and non-integer values as missing.
- Normalize the bounded scale to `[-1, 1]` using its midpoint: `(grade − 2) / 2`.
- Add a mutually exclusive five-column one-hot encoding and a missingness flag.
- Provide `fitMmrcPreprocessor()` to compute the median from labeled training records only.
- Until labeled mMRC data exist, use grade 2 only as an explicitly provisional midpoint imputation. It is marked `fitted: false` and is not presented as a train-derived median.

## Evaluation

The current train and test splits have **0 mMRC-labeled records**. Therefore the mMRC predictive accuracy impact is not estimable from the available data. The candidate parity run reports the existing model's baseline holdout metrics (accuracy 86.96%, macro F1 0.8268, urgent sensitivity 100%) and the same values after supplying the imputed candidate feature. Predictions matched on all 23 records because the active deterministic inference engine ignores appended mMRC features; this parity is not evidence of benefit or equivalence for a retrained model.

No synthetic or inferred mMRC labels were substituted for clinician-recorded grades. The next valid accuracy study needs prospective or adjudicated mMRC grades for both training and held-out patients, with patient-level separation, preprocessing fit only on train, model selection on validation, and a locked test evaluation after retraining.

## Reproduction

Run `node ml_models/evaluate_mmrc_preprocessing.js`. It checks all grade encodings and normalization boundaries, confirms no overlap in the patient-level split manifest, counts mMRC labels in each partition, and writes `reports/mmrc_preprocessing_evaluation.json`.

The repository pins Python ML dependencies to versions supporting Python <3.12; the available runtime is Python 3.14.7. Retraining and clinical performance claims remain pending a compatible environment, actual labeled data, and clinical QA review.
