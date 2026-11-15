'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  FEVER_CHILLS_FEATURE_COUNT,
  FEVER_PREPROCESSOR,
  extractFeatures,
  fitTemperaturePreprocessor,
  transformFeverSymptoms,
  transformTemperature
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const fitted = fitTemperaturePreprocessor(train);
if (fitted.trainingCount !== FEVER_PREPROCESSOR.trainingCount || fitted.median !== FEVER_PREPROCESSOR.median
  || fitted.mean !== FEVER_PREPROCESSOR.mean || fitted.standardDeviation !== FEVER_PREPROCESSOR.standardDeviation) {
  throw new Error('Fever preprocessing statistics do not match the training split.');
}
for (const [value, expected] of [[36.9, 'normal'], [38, 'fever'], ['٣٩٫٢', 'fever'], [undefined, 'normal'], [44, 'normal']]) {
  const result = transformTemperature(value);
  if (result.category !== expected) throw new Error(`Unexpected temperature band for ${value}: ${result.category}`);
}
if (transformTemperature(undefined).missing !== 1 || transformTemperature(37.2).missing !== 0 || transformTemperature(44).missing !== 1) {
  throw new Error('Temperature missing/invalid indicators failed.');
}
for (const input of [{ chills: 'yes', nightSweats: 'no' }, { chills: 'unknown', nightSweats: 'yes' }, {}]) {
  const features = transformFeverSymptoms(input);
  if (features.chillsOneHot.reduce((sum, bit) => sum + bit, 0) !== 1
    || features.nightSweatsOneHot.reduce((sum, bit) => sum + bit, 0) !== 1) throw new Error('Fever symptom one-hot encoding is not exclusive.');
}
const missingSymptoms = transformFeverSymptoms({});
if (missingSymptoms.chillsMissing !== 1 || missingSymptoms.nightSweatsMissing !== 1) throw new Error('Missing symptom flags failed.');
if (extractFeatures({}).length < 14 + FEVER_CHILLS_FEATURE_COUNT) throw new Error('Fever features were not appended to the model vector.');

const classifier = new RespiratoryRFClassifier();
const labelForPrediction = category => ({ LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' }[category] || 'normal');
function predict(record, temperature) {
  const symptoms = record.symptoms || {};
  const conditions = record.comorbidities || {};
  const vector = extractFeatures({
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: temperature,
    dyspnea_severity: symptoms.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(symptoms.coughLevel && symptoms.coughLevel !== 'none'),
    cough_duration_days: symptoms.symptomDurationDays,
    chest_pain: symptoms.chestPain,
    chills: symptoms.chills,
    night_sweats: symptoms.nightSweats,
    has_asthma: conditions.asthma,
    has_copd: conditions.copd,
    smoker: conditions.smoking
  });
  return labelForPrediction(classifier.predict(vector).triage_category);
}
function metrics(rows, temperatureFor) {
  const labels = ['normal', 'high', 'urgent'];
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  let correct = 0;
  rows.forEach((record, index) => {
    const actual = record.groundTruth?.triage;
    const predicted = predict(record, temperatureFor(record, index));
    if (!matrix[actual] || matrix[actual][predicted] === undefined) return;
    matrix[actual][predicted] += 1;
    if (actual === predicted) correct += 1;
  });
  const f1 = labels.map(label => {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + matrix[actual][label], 0) - tp;
    const fn = labels.reduce((sum, predicted) => sum + matrix[label][predicted], 0) - tp;
    return 2 * tp / Math.max(1, 2 * tp + fp + fn);
  });
  const urgentN = Object.values(matrix.urgent).reduce((sum, value) => sum + value, 0);
  return {
    n: rows.length,
    accuracy: Number((correct / rows.length).toFixed(4)),
    macroF1: Number((f1.reduce((sum, value) => sum + value, 0) / labels.length).toFixed(4)),
    urgentSensitivity: Number((matrix.urgent.urgent / Math.max(1, urgentN)).toFixed(4)),
    confusionMatrix: matrix
  };
}

const completeBaseline = metrics(test, record => record.vitals?.temperature);
const completeCandidate = metrics(test, record => transformTemperature(record.vitals?.temperature).value);
const maskedDefaultImputation = metrics(test, (record, index) => index % 5 === 0 ? 37 : record.vitals?.temperature);
const maskedTrainingMedianImputation = metrics(test, (record, index) => transformTemperature(index % 5 === 0 ? undefined : record.vitals?.temperature).value);
if (completeBaseline.accuracy !== completeCandidate.accuracy || completeBaseline.macroF1 !== completeCandidate.macroF1) {
  throw new Error('Observed complete-case predictions changed after temperature preprocessing.');
}

const report = {
  evaluation: 'Preprocessing and missing-temperature stress comparison; existing deterministic inference engine, not a retrained ML model',
  modelVersion: classifier.version,
  splitSeed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  trainTemperatureMissingCount: train.filter(record => !Number.isFinite(record.vitals?.temperature)).length,
  testTemperatureMissingCount: test.filter(record => !Number.isFinite(record.vitals?.temperature)).length,
  chillsAndNightSweatsLabeledCount: train.filter(record => record.symptoms?.chills !== undefined && record.symptoms?.nightSweats !== undefined).length,
  preprocessing: fitted,
  completeCaseHoldout: { baseline: completeBaseline, candidate: completeCandidate },
  deterministic20PercentTemperatureMaskStress: {
    maskedRecords: Math.ceil(test.length / 5),
    note: 'Artificial missingness stress only; does not estimate real-world missingness.',
    legacyDefault37C: maskedDefaultImputation,
    trainingMedianWithMissingFlag: maskedTrainingMedianImputation
  },
  feverSymptomAccuracyImpact: 'Not estimable: no labeled chills/night-sweats examples exist in the train/test cohort, and the current classifier has not been retrained to consume these appended features.'
};
console.log(JSON.stringify(report, null, 2));
