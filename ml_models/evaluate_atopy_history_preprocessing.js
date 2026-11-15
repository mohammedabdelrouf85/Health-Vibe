'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  ATOPY_HISTORY_FEATURE_COUNT,
  ATOPY_HISTORY_PREPROCESSOR,
  extractFeatures,
  fitAtopyHistoryPreprocessor,
  transformAtopyHistory
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) throw new Error('Patient-level split is not certified leakage-free.');

const fitted = fitAtopyHistoryPreprocessor(train);
if (fitted.trainingCount !== ATOPY_HISTORY_PREPROCESSOR.trainingCount || fitted.fitted !== ATOPY_HISTORY_PREPROCESSOR.fitted) {
  throw new Error('Atopy preprocessor metadata does not match training-only coverage.');
}

const sample = transformAtopyHistory({ assessment: { exposures: { atopyHistory: {
  nasalAllergy: 'yes', eczema: 'no', childhoodAsthma: 'unknown', familyAsthma: 'yes', familyPulmonaryFibrosis: 'no'
} } } });
if (sample.nasalAllergy.oneHot.join('') !== '100' || sample.eczema.oneHot.join('') !== '010'
  || sample.childhoodAsthma.oneHot.join('') !== '001' || sample.familyPulmonaryFibrosis.missing !== 0) {
  throw new Error('Atopy tri-state encoding failed.');
}
const missing = transformAtopyHistory({});
if (Object.values(missing).some(feature => feature.category !== 'unknown' || feature.oneHot.join('') !== '001' || feature.missing !== 1)) {
  throw new Error('Missing atopy values were not imputed to unknown with missing flags.');
}
if (extractFeatures({}).length < 14 + ATOPY_HISTORY_FEATURE_COUNT) throw new Error('Atopy features were not appended to the model vector.');

const countObservedFields = records => records.reduce((sum, record) => {
  const features = transformAtopyHistory(record);
  return sum + Object.values(features).filter(feature => feature.missing === 0).length;
}, 0);
const trainObservedFieldCount = countObservedFields(train);
const testObservedFieldCount = countObservedFields(test);
const classifier = new RespiratoryRFClassifier();
const labelForPrediction = category => ({ LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' }[category] || 'normal');
const completeHoldoutPredictionParity = test.filter(record => {
  const input = {
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: record.symptoms?.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(record.symptoms?.coughLevel && record.symptoms.coughLevel !== 'none'),
    cough_duration_days: record.symptoms?.symptomDurationDays,
    chest_pain: record.symptoms?.chestPain,
    atopyHistory: record.assessment?.exposures?.atopyHistory
  };
  return labelForPrediction(classifier.predict(input).triage_category)
    === labelForPrediction(classifier.predict(extractFeatures(input)).triage_category);
}).length;

console.log(JSON.stringify({
  evaluation: 'Atopy feature preprocessing and compatibility; existing deterministic inference engine, not a retrained model',
  modelVersion: classifier.version,
  splitSeed: manifest.randomSeed,
  trainCount: train.length,
  testCount: test.length,
  trainObservedFieldCount,
  testObservedFieldCount,
  atopyFields: ATOPY_HISTORY_PREPROCESSOR.fields.length,
  encodedFeatureCount: ATOPY_HISTORY_FEATURE_COUNT,
  preprocessing: fitted,
  completeHoldoutPredictionParity: `${completeHoldoutPredictionParity}/${test.length}`,
  accuracyImpactEstimable: trainObservedFieldCount > 0 && testObservedFieldCount > 0,
  interpretation: 'Current train/test records have no labeled atopy history. Holdout parity is compatibility only, not evidence of predictive benefit. A retrained model and atopy-labeled held-out cohort are required to estimate accuracy impact.'
}, null, 2));
