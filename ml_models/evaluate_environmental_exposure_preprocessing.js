'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  ENVIRONMENTAL_EXPOSURE_FEATURE_COUNT,
  ENVIRONMENTAL_EXPOSURE_PREPROCESSOR,
  extractFeatures,
  fitEnvironmentalExposurePreprocessor,
  transformEnvironmentalExposure
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const fitted = fitEnvironmentalExposurePreprocessor(train);
if (fitted.trainingCount !== ENVIRONMENTAL_EXPOSURE_PREPROCESSOR.trainingCount || fitted.fitted !== ENVIRONMENTAL_EXPOSURE_PREPROCESSOR.fitted) {
  throw new Error('Environmental exposure preprocessor does not match its training-only fit metadata.');
}
const multiple = transformEnvironmentalExposure({ assessment: { exposures: { environmental: ['dust', 'rice_straw_burning'] } } });
if (multiple.sourceOneHot[0] !== 1 || multiple.sourceOneHot[2] !== 1 || multiple.none !== 0 || multiple.unknown !== 0 || multiple.missing !== 0) {
  throw new Error('Multi-source environmental encoding failed.');
}
if ([...multiple.sourceOneHot, multiple.none, multiple.unknown, multiple.missing].some(value => value !== 0 && value !== 1)) {
  throw new Error('Environmental exposure encoding is not normalized to binary [0, 1].');
}
const explicitUnknown = transformEnvironmentalExposure({ environmentalExposure: ['unknown'] });
if (explicitUnknown.unknown !== 1 || explicitUnknown.missing !== 0) throw new Error('Explicit unknown exposure was confused with missing data.');
const missing = transformEnvironmentalExposure({});
if (missing.unknown !== 1 || missing.missing !== 1 || missing.sourceStatus !== 'missing') throw new Error('Missing exposure imputation failed.');
const none = transformEnvironmentalExposure({ environmentalExposure: ['none'] });
if (none.none !== 1 || none.missing !== 0) throw new Error('No-exposure encoding failed.');
const invalid = transformEnvironmentalExposure({ environmentalExposure: ['none', 'dust'] });
if (invalid.missing !== 1 || invalid.unknown !== 1) throw new Error('Conflicting environmental categories were not safely imputed.');
if (extractFeatures({}).length < 14 + ENVIRONMENTAL_EXPOSURE_FEATURE_COUNT) throw new Error('Environmental exposure features were not appended to the model vector.');

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
    passiveSmoke: conditions.passiveSmoke,
    environmentalExposure: record.assessment?.exposures?.environmental
      ?? record.environmentalExposure ?? record.environmentalExposures
  };
}
function metrics(rows) {
  const labels = ['normal', 'high', 'urgent'];
  const matrix = Object.fromEntries(labels.map(actual => [actual, Object.fromEntries(labels.map(predicted => [predicted, 0]))]));
  let correct = 0;
  let predictionParity = 0;
  rows.forEach(record => {
    const input = modelInput(record);
    const baselinePrediction = toLabel(classifier.predict(input).triage_category);
    const candidatePrediction = toLabel(classifier.predict(extractFeatures(input)).triage_category);
    if (baselinePrediction === candidatePrediction) predictionParity += 1;
    const actual = record.groundTruth?.triage;
    if (matrix[actual] && matrix[actual][candidatePrediction] !== undefined) {
      matrix[actual][candidatePrediction] += 1;
      if (actual === candidatePrediction) correct += 1;
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

const completeHoldout = metrics(test);
const trainExposureLabeled = train.filter(record => transformEnvironmentalExposure(record).missing === 0).length;
const testExposureLabeled = test.filter(record => transformEnvironmentalExposure(record).missing === 0).length;
if (completeHoldout.predictionParity !== `${test.length}/${test.length}`) throw new Error('Environmental feature extraction changed current holdout predictions unexpectedly.');

console.log(JSON.stringify({
  evaluation: 'Environmental feature preprocessing and holdout compatibility; existing deterministic model, not a retrained model',
  modelVersion: classifier.version,
  splitSeed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  trainExposureLabeled,
  testExposureLabeled,
  preprocessing: fitted,
  completeHoldout,
  accuracyImpactEstimable: testExposureLabeled > 0 && fitted.fitted,
  interpretation: 'Current train/test data contain no labeled Egyptian occupational/environmental exposures. Holdout parity is compatibility only, not evidence of predictive benefit; retraining and a labeled holdout are required to estimate accuracy impact.'
}, null, 2));
