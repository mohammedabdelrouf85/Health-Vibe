# Smoking History and Pack-Year Feature Evaluation

## Preprocessing

- Accept pack-years directly or derive them from cigarette packs per day × years smoked. The engineered value is bounded to the model's supported `0–120` range and normalized to `[0, 1]`.
- Missing pack-years use a training-only median when observed training values exist. The current training split contains no pack-year values, so the fallback median is `0` and the feature is marked missing. A known never-smoker is encoded as zero with no missing flag. Existing legacy boolean smoker inputs retain their previous ten pack-year fallback for compatibility.
- Cigarette status is one-hot encoded across `never`, `current`, `former`, and `unknown`, with a separate missing flag.
- Shisha, vaping, and passive-smoke exposure each use `yes` / `no` / `unknown` one-hot encoding plus a missingness flag. A missing response maps to unknown and remains distinguishable from an explicit unknown response.
- The extractor appends 19 candidate values while preserving the established first 14 positions. Pack-years continue to populate the existing smoking feature consumed by the current deterministic inference engine.

## Patient-level holdout comparison

The evaluation uses the certified seed-42 split, 112 training records, and 23 held-out records.

| Measure | Existing inference | Feature candidate | Change |
|---|---:|---:|---:|
| Accuracy | 0.8696 | 0.8696 | 0.0000 |
| Macro F1 | 0.8268 | 0.8268 | 0.0000 |
| Urgent sensitivity | 1.0000 | 1.0000 | 0.0000 |
| Prediction parity | — | 23 / 23 | — |

The training and test sets contain zero observed pack-year values and zero labeled shisha, vaping, or passive-smoke responses. The complete-case metrics therefore verify backward-compatible predictions only. No accuracy impact can be estimated from this cohort, and parity is not evidence of benefit. A representative labeled cohort and model retraining are required to measure predictive impact.

Run the reproducible checks with `npm run evaluate:smoking-history-preprocessing`.
