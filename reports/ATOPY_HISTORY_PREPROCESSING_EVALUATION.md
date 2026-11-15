# Atopy History Preprocessing Evaluation

## Scope

This report evaluates feature encoding, missing-value handling, and compatibility with the existing deterministic inference model. It does not evaluate a retrained model.

## Candidate preprocessing

Five patient-reported fields are independently one-hot encoded as `yes`, `no`, or `unknown`: allergic rhinitis, eczema, childhood asthma, family asthma, and family pulmonary fibrosis. Each field has a separate missingness flag. Missing or invalid entries map to `unknown` while retaining `missing = 1`; an explicit `unknown` answer maps to the same category with `missing = 0`. Every encoded value is in `[0, 1]`.

## Data coverage and interpretation

The evaluation command reports observed field counts in the patient-level train and holdout splits and verifies prediction parity. Current cohort coverage is zero because these assessment fields are not present in the dataset. The training-only preprocessor therefore remains unfitted and prediction parity is a compatibility check only. Accuracy impact is not estimable without Atopy-labeled training and holdout data followed by model retraining and clinical review.

## Reproduction

```bash
npm run evaluate:atopy-history-preprocessing
```
