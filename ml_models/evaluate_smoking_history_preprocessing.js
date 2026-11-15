'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  SMOKING_HISTORY_FEATURE_COUNT,
  SMOKING_HISTORY_PREPROCESSOR,
  extractFeatures,
  fitSmokingHistoryPreprocessor,
  transformSmokingHistory
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const fitted = fitSmokingHistoryPreprocessor(train);
if (fitted.trainingCount !== SMOKING_HISTORY_PREPROCESSOR.trainingCount || fitted.fitted !== SMOKING_HISTORY_PREPROCESSOR.fitted) {
  throw new Error('Smoking-history preprocessor does not match its training-only fit metadata.');
}
const example = transformSmokingHistory({
  assessment: { exposures: { smokingHistory: {
    cigaretteStatus: 'former', cigarettePacksPerDay: 0.5, cigaretteYearsSmoked: 10,
    shisha: 'no', vaping: 'yes', passiveSmoke: 'unknown'
  } } }
});
if (example.packYears !== 5 || example.packYearsMissing !== 0 || example.statusOneHot.reduce((sum, bit) => sum + bit, 0) !== 1
  || example.vaping.category !== 'yes' || example.vaping.missing !== 0) throw new Error('Pack-year derivation or smoking exposure encoding failed.');
if (transformSmokingHistory({ smokingHistory: { cigaretteStatus: 'current' } }).packYearsMissing !== 1) {
  throw new Error('Missing pack-years are not flagged for a current smoker.');
}
if (transformSmokingHistory({ smokingHistory: { cigaretteStatus: 'never' } }).packYears !== 0
  || transformSmokingHistory({ smokingHistory: { cigaretteStatus: 'never' } }).packYearsMissing !== 0) {
  throw new Error('Known never-smoker status should encode zero exposure without a missing flag.');
}
if (extractFeatures({}).length < 14 + SMOKING_HISTORY_FEATURE_COUNT) throw new Error('Smoking-history features were not appended to the model vector.');

const classifier = new RespiratoryRFClassifier();
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
    smoker: conditions.smoking,
    smoking_pack_years: conditions.packYears,
    shisha: conditions.shisha,
    vaping: conditions.vaping,
    passiveSmoke: conditions.passiveSmoke
  };
}
function metrics(rows, candidate) {
  const labels = ['normal', 'high', 'urgent'];
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  let correct = 0;
  let predictionParity = 0;
  rows.forEach(record => {
    const input = modelInput(record);
    const baselinePrediction = toLabel(classifier.predict(input).triage_category);
    const candidatePrediction = toLabel(classifier.predict(extractFeatures(input)).triage_category);
    if (baselinePrediction === candidatePrediction) predictionParity += 1;
    const predicted = candidate ? candidatePrediction : baselinePrediction;
    const actual = record.groundTruth?.triage;
    if (matrix[actual] && matrix[actual][predicted] !== undefined) {
      matrix[actual][predicted] += 1;
      if (actual === predicted) correct += 1;
    }
  });
  const perClassF1 = labels.map(label => {
    const tp = matrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + matrix[actual][label], 0) - tp;
    const fn = labels.reduce((sum, predicted) => sum + matrix[label][predicted], 0) - tp;
    return 2 * tp / Math.max(1, 2 * tp + fp + fn);
  });
  const urgentCount = Object.values(matrix.urgent).reduce((sum, count) => sum + count, 0);
  return {
    n: rows.length,
    accuracy: Number((correct / rows.length).toFixed(4)),
    macroF1: Number((perClassF1.reduce((sum, value) => sum + value, 0) / labels.length).toFixed(4)),
    urgentSensitivity: Number((matrix.urgent.urgent / Math.max(1, urgentCount)).toFixed(4)),
    confusionMatrix: matrix,
    predictionParity: `${predictionParity}/${rows.length}`
  };
}

const baseline = metrics(test, false);
const candidate = metrics(test, true);
const hasObservedPackYears = record => ['observed', 'clipped'].includes(transformSmokingHistory(record).packYearsSourceStatus);
const trainPackYearsObserved = train.filter(hasObservedPackYears).length;
const testPackYearsObserved = test.filter(hasObservedPackYears).length;
const labeledNonCigaretteExposuresTrain = train.filter(record => {
  const exposure = transformSmokingHistory(record);
  return exposure.shisha.missing === 0 || exposure.vaping.missing === 0 || exposure.passiveSmoke.missing === 0;
}).length;
if (baseline.accuracy !== candidate.accuracy || baseline.macroF1 !== candidate.macroF1 || candidate.predictionParity !== `${test.length}/${test.length}`) {
  throw new Error('Feature extraction changed the current holdout predictions unexpectedly.');
}

console.log(JSON.stringify({
  evaluation: 'Feature preprocessing and holdout compatibility; current deterministic inference engine, not a retrained model',
  modelVersion: classifier.version,
  splitSeed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  trainPackYearsObserved,
  testPackYearsObserved,
  labeledNonCigaretteExposuresTrain,
  preprocessing: fitted,
  completeHoldout: { baseline, candidate },
  accuracyImpactEstimable: testPackYearsObserved > 0 && fitted.fitted,
  interpretation: 'Current train/test data have no pack-year values or shisha/vape/passive-smoke labels. Candidate vectors preserve the existing predictions; this is compatibility only, not evidence of predictive benefit. A retrained model and labeled holdout are required to estimate accuracy impact.'
}, null, 2));
