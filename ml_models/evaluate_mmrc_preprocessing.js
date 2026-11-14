'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const { MMRC_PREPROCESSOR, extractFeatures, fitMmrcPreprocessor, getMmrcScore, transformMmrcScore } = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const preprocessor = fitMmrcPreprocessor(train);
const classifier = new RespiratoryRFClassifier();
const labels = ['normal', 'high', 'urgent'];
const toLabel = category => ({ LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' }[category] || 'normal');

function modelInput(record) {
  const symptoms = record.symptoms || {};
  const conditions = record.comorbidities || {};
  return {
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: symptoms.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(symptoms.coughLevel && symptoms.coughLevel !== 'none'),
    cough_duration_days: symptoms.symptomDurationDays,
    chest_pain: symptoms.chestPain,
    has_asthma: conditions.asthma,
    has_copd: conditions.copd,
    smoker: conditions.smoking
  };
}

function evaluate(rows, withMmrc) {
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  let predictionMatches = 0;
  rows.forEach(record => {
    const input = modelInput(record);
    const baseline = toLabel(classifier.predict(input).triage_category);
    const rawScore = getMmrcScore(record);
    const feature = transformMmrcScore(withMmrc ? rawScore : null, preprocessor);
    const candidate = toLabel(classifier.predict({ ...input, mmrc_score: feature.value }).triage_category);
    if (baseline === candidate) predictionMatches += 1;
    const predicted = withMmrc ? candidate : baseline;
    const actual = record.groundTruth?.triage;
    if (matrix[actual] && matrix[actual][predicted] !== undefined) matrix[actual][predicted] += 1;
  });
  const accuracy = labels.reduce((sum, label) => sum + matrix[label][label], 0) / rows.length;
  const f1 = labels.map(label => {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + matrix[actual][label], 0) - tp;
    const fn = labels.reduce((sum, predicted) => sum + matrix[label][predicted], 0) - tp;
    return 2 * tp / Math.max(1, 2 * tp + fp + fn);
  });
  const urgentN = Object.values(matrix.urgent).reduce((sum, n) => sum + n, 0);
  return {
    n: rows.length,
    accuracy: Number(accuracy.toFixed(4)),
    macroF1: Number((f1.reduce((sum, value) => sum + value, 0) / labels.length).toFixed(4)),
    urgentSensitivity: Number((matrix.urgent.urgent / Math.max(1, urgentN)).toFixed(4)),
    predictionParity: `${predictionMatches}/${rows.length}`,
    confusionMatrix: matrix
  };
}

const boundaryChecks = [
  [0, 0, -1], [1, 1, -0.5], [2, 2, 0], [3, 3, 0.5], [4, 4, 1], [undefined, 2, 0]
];
for (const [input, expectedValue, expectedNormalized] of boundaryChecks) {
  const result = transformMmrcScore(input, preprocessor);
  if (result.value !== expectedValue || result.normalized !== expectedNormalized) throw new Error(`mMRC transform failed for ${input}.`);
  if (result.oneHot.reduce((sum, bit) => sum + bit, 0) !== 1) throw new Error('mMRC one-hot encoding is not exclusive.');
}
if (!preprocessor.fitted && preprocessor.trainingCount !== 0) throw new Error('Unfitted mMRC metadata has a non-zero sample count.');
const fittedExample = fitMmrcPreprocessor([{ symptoms: { mmrcGrade: 1 } }, { mmrcGrade: 3 }]);
const encodedVector = extractFeatures({ mmrc_score: 4 }, { mmrcPreprocessor: fittedExample });
if (!fittedExample.fitted || fittedExample.trainingCount !== 2 || encodedVector[25] !== 1 || encodedVector[30] !== 1 || encodedVector[31] !== 0) {
  throw new Error('Fitted mMRC preprocessing was not applied to the feature vector.');
}

console.log(JSON.stringify({
  evaluation: 'Preprocessing and active-model parity; no fitted mMRC accuracy claim',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  trainMmrcLabeledCount: train.filter(record => getMmrcScore(record) !== null).length,
  testMmrcLabeledCount: test.filter(record => getMmrcScore(record) !== null).length,
  accuracyImpactEstimable: test.some(record => getMmrcScore(record) !== null),
  configuredPreprocessor: MMRC_PREPROCESSOR,
  fittedPreprocessor: preprocessor,
  holdoutBaseline: evaluate(test, false),
  holdoutCandidateWithImputedMmrc: evaluate(test, true),
  interpretation: 'The current deterministic model ignores appended mMRC features. Identical predictions are parity only; no mMRC-labeled holdout exists to estimate its predictive accuracy impact.'
}, null, 2));
