# Egyptian Environmental Exposure Feature Evaluation

## Preprocessing

- The extractor supports `assessment.exposures.environmental`, `environmentalExposure`, `environmentalExposures`, and `environmental_exposure` inputs.
- Dust, vehicle exhaust, rice-straw/crop-residue burning, factory fumes, and household birds are multi-hot encoded as five binary-normalized values in `[0, 1]`.
- Separate `none`, `unknown`, and missingness indicators make a confirmed absence, an explicit unknown answer, and a missing answer distinct. Missing or invalid/conflicting inputs map to `unknown` with the missing flag set; they are never imputed as no exposure.
- These eight values are appended to the feature vector so the existing first 14 model inputs keep their positions.

## Patient-level holdout comparison

Evaluation uses the certified seed-42 split: 112 training records and 23 held-out records.

| Measure | Existing inference | Feature candidate | Change |
|---|---:|---:|---:|
| Accuracy | 0.8696 | 0.8696 | 0.0000 |
| Macro F1 | 0.8268 | 0.8268 | 0.0000 |
| Urgent sensitivity | 1.0000 | 1.0000 | 0.0000 |
| Prediction parity | — | 23 / 23 | — |

The current train/test cohort contains no labeled environmental exposure answers. This comparison confirms compatibility only; predictive accuracy impact cannot be estimated from these data. A representative labeled cohort and retrained model are required before claiming the feature improves prediction.

Run `npm run evaluate:environmental-exposure-preprocessing` for reproducible encoding and holdout checks.
