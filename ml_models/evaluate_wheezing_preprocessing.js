'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const { CHEST_PAIN_FEATURE_COUNT, WHEEZING_FEATURE_COUNT, WHEEZING_PREPROCESSOR, extractFeatures, transformWheezing } = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) {
  throw new Error('Patient-level split manifest is not certified as leakage-free.');
}

function summarizeCoverage(records) {
  const counts = { yes: 0, no: 0, unknown: 0, missing: 0, invalid: 0 };
  records.forEach(record => {
    const transformed = transformWheezing(record);
    counts[transformed.sourceStatus] = (counts[transformed.sourceStatus] || 0) + 1;
  });
  return { records: records.length, ...counts };
}

for (const [value, expected, missing] of [
  ['yes', 'yes', 0], ['لا', 'no', 0], ['غير معروف', 'unknown', 0], [undefined, 'unknown', 1], ['perhaps', 'unknown', 1]
]) {
  const transformed = transformWheezing({ symptoms: { wheezing: value } });
  if (transformed.category !== expected || transformed.missing !== missing || transformed.oneHot.reduce((sum, bit) => sum + bit, 0) !== 1) {
    throw new Error(`Unexpected wheezing encoding for ${String(value)}.`);
  }
  if (transformed.oneHot.some(bit => bit !== 0 && bit !== 1)) throw new Error('Wheezing one-hot values must be normalized to [0, 1].');
}

const classifier = new RespiratoryRFClassifier();
const labels = { LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' };
let baselineCorrect = 0;
let candidateCorrect = 0;
let predictionParity = 0;
let allPredictionsUnchanged = true;
test.forEach(record => {
  const input = {
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: record.symptoms?.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(record.symptoms?.coughLevel && record.symptoms.coughLevel !== 'none'),
    cough_duration_days: record.symptoms?.symptomDurationDays,
    wheezing: record.symptoms?.wheezing
  };
  const candidateVector = extractFeatures(input);
  const baseline = classifier.predict(candidateVector.slice(0, -(WHEEZING_FEATURE_COUNT + CHEST_PAIN_FEATURE_COUNT)));
  const wheezingCandidateVector = candidateVector.slice(0, -CHEST_PAIN_FEATURE_COUNT);
  const candidate = classifier.predict(wheezingCandidateVector);
  const baselineLabel = labels[baseline.triage_category] || 'normal';
  const candidateLabel = labels[candidate.triage_category] || 'normal';
  if (baselineLabel === record.groundTruth?.triage) baselineCorrect += 1;
  if (candidateLabel === record.groundTruth?.triage) candidateCorrect += 1;
  if (baselineLabel === candidateLabel) predictionParity += 1;
  if (baseline.triage_category !== candidate.triage_category) allPredictionsUnchanged = false;
});

const trainCoverage = summarizeCoverage(train);
const testCoverage = summarizeCoverage(test);
console.log(JSON.stringify({
  evaluation: 'Wheezing encoding and existing-model compatibility check; there are no wheezing labels in the train or holdout splits.',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  preprocessing: WHEEZING_PREPROCESSOR,
  encoding: 'Tri-state one-hot values are binary-normalized to [0, 1]. Missing or invalid inputs map to the unknown category with a separate missing flag; explicit unknown remains distinct from missing.',
  trainCoverage,
  testCoverage,
  holdoutCompatibility: {
    testCount: test.length,
    baselineAccuracy: Number((baselineCorrect / test.length).toFixed(4)),
    candidateAccuracy: Number((candidateCorrect / test.length).toFixed(4)),
    predictionParity: `${predictionParity}/${test.length}`,
    predictionsUnchanged: allPredictionsUnchanged,
    accuracyImpactMeasurable: testCoverage.yes + testCoverage.no > 0,
    note: 'The current classifier uses only its established first 14 clinical inputs. Parity is compatibility only, not predictive benefit. Labeled wheezing values and model retraining are required to measure an accuracy impact.'
  }
}, null, 2));
