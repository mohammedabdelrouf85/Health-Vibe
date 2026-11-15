# Fever, Chills, and Night Sweats Feature Evaluation

## Preprocessing

- Temperature accepts 34–43 °C, including Arabic digits and the Arabic decimal separator. The value is standardized with mean `37.691071` and standard deviation `0.803069`, fitted from the 112-record training partition only.
- Missing or invalid temperature is imputed to the training median (`37.45 °C`) and carries a separate missingness flag. Normal/fever bands use a 38 °C threshold and are binary encoded.
- Chills and night sweats use tri-state one-hot encoding (`yes`, `no`, `unknown`) plus a missingness flag. An absent response maps to `unknown` and is separately marked missing; an explicitly unknown response remains distinguishable.
- The 12 engineered values are appended to the established feature vector, preserving the positions consumed by the current inference engine.

## Holdout comparison

Evaluation uses the leakage-certified patient-level split (seed 42), the current deterministic inference engine (`resp_rf_v1.0.2`), and 23 held-out records.

| Measure | Existing temperature input | Preprocessed temperature | Change |
|---|---:|---:|---:|
| Accuracy | 0.8696 | 0.8696 | 0.0000 |
| Macro F1 | 0.8268 | 0.8268 | 0.0000 |
| Urgent sensitivity | 1.0000 | 1.0000 | 0.0000 |

The complete-case parity is expected: preprocessing preserves the observed Celsius measurement, and the current classifier uses the same temperature thresholds. A deterministic stress test masks every fifth test temperature (5 of 23 records). Median imputation with a missingness flag and the legacy 37 °C fallback both score accuracy `0.8696`, macro F1 `0.8268`, and urgent sensitivity `1.0000` on this small stress cohort.

## Limits

The available train/test datasets contain no missing temperatures and no labeled chills or night-sweat observations. The current classifier also has not been retrained to consume appended features. Therefore these results verify preprocessing, compatibility, and a limited artificial missingness comparison; they do not establish that chills or night sweats improve diagnostic accuracy. Accuracy impact for those symptoms requires a labeled, representative cohort and a retrained model evaluated on a separate holdout.

Run the reproducible checks with `npm run evaluate:fever-preprocessing`.
