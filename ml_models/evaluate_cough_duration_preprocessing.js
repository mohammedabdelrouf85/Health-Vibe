'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  COUGH_DURATION_PREPROCESSOR,
  COUGH_DURATION_FEATURE_COUNT,
  CHEST_PAIN_FEATURE_COUNT,
  WHEEZING_FEATURE_COUNT,
  extractFeatures,
  fitCoughDurationPreprocessor,
  getCoughDurationDays,
  transformCoughDuration
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) {
  throw new Error('Patient-level split manifest is not certified as leakage-free.');
}

const fittedPreprocessor = fitCoughDurationPreprocessor(train);
if (fittedPreprocessor.trainingCount !== COUGH_DURATION_PREPROCESSOR.trainingCount) {
  throw new Error('Configured cough-duration training coverage does not match the current training split.');
}

function summarizeCoverage(records) {
  const counts = { acute: 0, subacute: 0, chronic: 0, not_applicable: 0, unknown: 0 };
  let observed = 0;
  let missing = 0;
  let invalid = 0;
  records.forEach(record => {
    const result = transformCoughDuration(record, fittedPreprocessor);
    counts[result.category] = (counts[result.category] || 0) + 1;
    if (result.sourceStatus === 'observed') observed += 1;
    if (result.sourceStatus === 'missing') missing += 1;
    if (result.sourceStatus === 'invalid') invalid += 1;
  });
  return { records: records.length, observed, missing, invalid, categoryCounts: counts };
}

for (const [days, expected] of [[1, 'acute'], [20, 'acute'], [21, 'subacute'], [56, 'subacute'], [57, 'chronic'], [365, 'chronic']]) {
  const result = transformCoughDuration({ cough_nature: 'dry', cough_duration_days: days }, fittedPreprocessor);
  if (result.category !== expected || result.missing !== 0 || result.normalized < 0 || result.normalized > 1) {
    throw new Error(`Unexpected cough-duration transformation for ${days} days.`);
  }
}
const arabicDigitResult = transformCoughDuration({ cough_nature: 'dry', cough_duration_days: '٢١' }, fittedPreprocessor);
if (arabicDigitResult.category !== 'subacute') throw new Error('Arabic digit cough duration was not normalized.');
const missingResult = transformCoughDuration({ cough_nature: 'productive' }, fittedPreprocessor);
if (missingResult.value !== fittedPreprocessor.median || missingResult.missing !== 1 || missingResult.category !== 'unknown') {
  throw new Error('Missing cough duration must use training median fallback and keep an explicit missing flag.');
}
const noCoughResult = transformCoughDuration({ cough_nature: 'none' }, fittedPreprocessor);
if (noCoughResult.value !== 0 || noCoughResult.missing !== 0 || noCoughResult.sourceStatus !== 'not_applicable') {
  throw new Error('No cough must be represented as not applicable, not imputed.');
}
const invalidResult = transformCoughDuration({ cough_nature: 'dry', cough_duration_days: 500 }, fittedPreprocessor);
if (invalidResult.sourceStatus !== 'invalid' || invalidResult.missing !== 1) {
  throw new Error('Out-of-range cough duration must be marked invalid and imputed.');
}

const classifier = new RespiratoryRFClassifier();
const labels = { LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' };
let baselineCorrect = 0;
let candidateCorrect = 0;
let predictionParity = 0;
test.forEach(record => {
  const input = {
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: record.symptoms?.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(record.symptoms?.coughLevel && record.symptoms.coughLevel !== 'none'),
    cough_duration_days: record.symptoms?.symptomDurationDays
  };
  const vector = extractFeatures(input, { coughDurationPreprocessor: fittedPreprocessor });
  const legacyVector = vector.slice(0, -(COUGH_DURATION_FEATURE_COUNT + WHEEZING_FEATURE_COUNT + CHEST_PAIN_FEATURE_COUNT));
  const coughDurationCandidateVector = vector.slice(0, -(WHEEZING_FEATURE_COUNT + CHEST_PAIN_FEATURE_COUNT));
  const baseline = classifier.predict(legacyVector);
  const candidate = classifier.predict(coughDurationCandidateVector);
  const baselineLabel = labels[baseline.triage_category] || 'normal';
  const candidateLabel = labels[candidate.triage_category] || 'normal';
  if (baselineLabel === record.groundTruth?.triage) baselineCorrect += 1;
  if (candidateLabel === record.groundTruth?.triage) candidateCorrect += 1;
  if (baselineLabel === candidateLabel) predictionParity += 1;
});

const trainCoverage = summarizeCoverage(train);
const testCoverage = summarizeCoverage(test);
console.log(JSON.stringify({
  evaluation: 'Preprocessing and existing-model compatibility check; cough-specific duration is absent from the labeled dataset.',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  preprocessing: fittedPreprocessor,
  normalization: 'Clinical min-max scaling to [0, 1] over the supported 1–365 day range; acute/subacute/chronic one-hot bands use <21, 21–56, >56 days.',
  trainCoverage,
  testCoverage,
  legacySymptomDurationPresentButNotUsedAsCoughDuration: train.filter(record => Number.isFinite(record.symptoms?.symptomDurationDays)).length,
  holdoutCompatibility: {
    testCount: test.length,
    baselineAccuracy: Number((baselineCorrect / test.length).toFixed(4)),
    candidateAccuracy: Number((candidateCorrect / test.length).toFixed(4)),
    predictionParity: `${predictionParity}/${test.length}`,
    predictiveAccuracyImpactEstimable: testCoverage.observed > 0,
    note: 'The deployed classifier consumes only its established 14 clinical inputs. Parity confirms compatibility, not benefit. All current train/test records lack cough-specific duration; general symptom duration was intentionally not substituted. Model impact needs cough-duration labels and retraining.'
  }
}, null, 2));
