'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const { SPO2_PREPROCESSOR, transformSpO2 } = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) {
  throw new Error('Patient-level split manifest is not certified as leakage-free.');
}

const classifier = new RespiratoryRFClassifier();
const labelForPrediction = category => ({
  LOW_RISK: 'normal',
  MODERATE_RISK: 'high',
  HIGH_RISK: 'urgent',
  EMERGENCY: 'urgent'
}[category] || 'normal');

function modelInput(record, oxygenValue) {
  const symptoms = record.symptoms || {};
  const conditions = record.comorbidities || {};
  return {
    age: record.demographics?.age,
    oxygen_saturation: oxygenValue,
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

function metrics(rows, predictionFn) {
  const labels = ['normal', 'high', 'urgent'];
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  let correct = 0;
  rows.forEach((record, index) => {
    const prediction = predictionFn(record, index);
    const actual = record.groundTruth?.triage;
    if (!matrix[actual] || matrix[actual][prediction] === undefined) return;
    matrix[actual][prediction] += 1;
    if (actual === prediction) correct += 1;
  });
  const perClassF1 = labels.map(label => {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + matrix[actual][label], 0) - tp;
    const fn = labels.reduce((sum, predicted) => sum + matrix[label][predicted], 0) - tp;
    return (2 * tp) / Math.max(1, (2 * tp) + fp + fn);
  });
  const urgent = matrix.urgent;
  const urgentSensitivity = urgent.urgent / Math.max(1, Object.values(urgent).reduce((a, b) => a + b, 0));
  return {
    n: rows.length,
    accuracy: Number((correct / rows.length).toFixed(4)),
    macroF1: Number((perClassF1.reduce((a, b) => a + b, 0) / labels.length).toFixed(4)),
    urgentSensitivity: Number(urgentSensitivity.toFixed(4)),
    confusionMatrix: matrix
  };
}

function predictWithOxygen(record, oxygen) {
  return labelForPrediction(classifier.predict(modelInput(record, oxygen)).triage_category);
}

const completeBaseline = metrics(test, record => predictWithOxygen(record, record.vitals?.oxygenLevel));
const completeCandidate = metrics(test, record => {
  const transformed = transformSpO2(record.vitals?.oxygenLevel);
  return predictWithOxygen(record, transformed.value);
});

// Deterministic missingness stress test: mask every fifth held-out record.
// This is a robustness analysis, not an estimate of real-world missingness prevalence.
const maskedBaseline = metrics(test, (record, index) => {
  const value = index % 5 === 0 ? 98 : record.vitals?.oxygenLevel; // Previous feature extractor default.
  return predictWithOxygen(record, value);
});
const maskedCandidate = metrics(test, (record, index) => {
  const value = index % 5 === 0 ? undefined : record.vitals?.oxygenLevel;
  const transformed = transformSpO2(value);
  return predictWithOxygen(record, transformed.value);
});

const transformChecks = [
  [89, 'critical'], [92, 'moderate'], [94, 'moderate'], [95, 'normal'], [undefined, 'moderate']
];
for (const [value, expected] of transformChecks) {
  const transformed = transformSpO2(value);
  if (transformed.category !== expected) throw new Error(`Unexpected SpO2 band for ${value}: ${transformed.category}`);
}
if (transformSpO2(undefined).missing !== 1 || transformSpO2(95).missing !== 0) {
  throw new Error('SpO2 missingness indicator failed.');
}

const trainingValues = train.map(record => record.vitals?.oxygenLevel).filter(value => Number.isFinite(value));
const trainingMedian = [...trainingValues].sort((a, b) => a - b)[Math.floor(trainingValues.length / 2)];
if (trainingMedian !== SPO2_PREPROCESSOR.median) throw new Error(`Configured SpO2 median ${SPO2_PREPROCESSOR.median} differs from training median ${trainingMedian}.`);
if (completeBaseline.accuracy !== completeCandidate.accuracy || completeBaseline.macroF1 !== completeCandidate.macroF1) {
  throw new Error('Observed complete-case holdout predictions changed under preprocessing.');
}

const report = {
  evaluation: 'Existing deterministic inference engine; preprocessing comparison only',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  testSpO2MissingCount: test.filter(record => !Number.isFinite(record.vitals?.oxygenLevel)).length,
  preprocessing: SPO2_PREPROCESSOR,
  completeHoldout: { baseline: completeBaseline, candidate: completeCandidate },
  deterministic20PercentMaskStress: {
    maskedRecords: Math.ceil(test.length / 5),
    note: 'Artificial masking of every fifth test record; not a prospective or natural missingness estimate.',
    baselineDefaultImputation: maskedBaseline,
    candidateTrainingMedianWithMissingFlag: maskedCandidate
  }
};

console.log(JSON.stringify(report, null, 2));
