'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const { RESPIRATORY_RATE_PREPROCESSOR, transformRespiratoryRate } = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const classifier = new RespiratoryRFClassifier();
const predictionLabel = category => ({ LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' }[category] || 'normal');

function classify(record, rate) {
  const symptoms = record.symptoms || {};
  const conditions = record.comorbidities || {};
  return predictionLabel(classifier.predict({
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: rate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: symptoms.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(symptoms.coughLevel && symptoms.coughLevel !== 'none'),
    cough_duration_days: symptoms.symptomDurationDays,
    chest_pain: symptoms.chestPain,
    has_asthma: conditions.asthma,
    has_copd: conditions.copd,
    smoker: conditions.smoking
  }).triage_category);
}

function evaluate(rows, rateForRecord) {
  const labels = ['normal', 'high', 'urgent'];
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  rows.forEach((record, index) => {
    const actual = record.groundTruth?.triage;
    const predicted = classify(record, rateForRecord(record, index));
    if (matrix[actual] && matrix[actual][predicted] !== undefined) matrix[actual][predicted] += 1;
  });
  const accuracy = labels.reduce((sum, label) => sum + matrix[label][label], 0) / rows.length;
  const f1 = labels.map(label => {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + matrix[actual][label], 0) - tp;
    const fn = labels.reduce((sum, predicted) => sum + matrix[label][predicted], 0) - tp;
    return 2 * tp / Math.max(1, 2 * tp + fp + fn);
  });
  const urgentN = Object.values(matrix.urgent).reduce((sum, count) => sum + count, 0);
  return {
    n: rows.length,
    accuracy: Number(accuracy.toFixed(4)),
    macroF1: Number((f1.reduce((sum, value) => sum + value, 0) / labels.length).toFixed(4)),
    urgentSensitivity: Number((matrix.urgent.urgent / Math.max(1, urgentN)).toFixed(4)),
    confusionMatrix: matrix
  };
}

const baselineComplete = evaluate(test, record => record.vitals?.respiratoryRate);
const candidateComplete = evaluate(test, record => transformRespiratoryRate(record.vitals?.respiratoryRate).value);
const baselineMasked = evaluate(test, (record, index) => index % 5 === 0 ? 16 : record.vitals?.respiratoryRate);
const candidateMasked = evaluate(test, (record, index) => transformRespiratoryRate(index % 5 === 0 ? undefined : record.vitals?.respiratoryRate).value);

for (const [value, expected] of [[11, 'low'], [12, 'normal'], [20, 'normal'], [21, 'elevated'], [24, 'elevated'], [25, 'tachypnea'], [undefined, 'elevated']]) {
  const transformed = transformRespiratoryRate(value);
  if (transformed.category !== expected) throw new Error(`Unexpected respiratory-rate band for ${value}: ${transformed.category}`);
}
if (transformRespiratoryRate(undefined).missing !== 1 || transformRespiratoryRate(18).missing !== 0) throw new Error('Respiratory-rate missingness indicator failed.');
const trainValues = train.map(record => record.vitals?.respiratoryRate).filter(Number.isFinite).sort((a, b) => a - b);
if (trainValues[Math.floor(trainValues.length / 2)] !== RESPIRATORY_RATE_PREPROCESSOR.median) throw new Error('Configured respiratory-rate median differs from train split.');
if (baselineComplete.accuracy !== candidateComplete.accuracy || baselineComplete.macroF1 !== candidateComplete.macroF1) throw new Error('Complete-case holdout predictions changed.');

console.log(JSON.stringify({
  evaluation: 'Existing deterministic inference engine; preprocessing comparison only',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  testMissingCount: test.filter(record => !Number.isFinite(record.vitals?.respiratoryRate)).length,
  preprocessing: RESPIRATORY_RATE_PREPROCESSOR,
  completeHoldout: { baseline: baselineComplete, candidate: candidateComplete },
  deterministic20PercentMaskStress: {
    maskedRecords: Math.ceil(test.length / 5),
    note: 'Artificially mask every fifth held-out record; this is not a real-world missingness estimate.',
    baselineDefaultImputation: baselineMasked,
    candidateTrainingMedianWithMissingFlag: candidateMasked
  }
}, null, 2));
