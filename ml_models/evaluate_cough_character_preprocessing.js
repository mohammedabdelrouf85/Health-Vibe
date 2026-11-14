'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const { COUGH_CHARACTER_PREPROCESSOR, extractFeatures, transformCoughCharacter } = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) {
  throw new Error('Patient-level split manifest is not certified as leakage-free.');
}

function coverage(records) {
  let natureObserved = 0;
  let sputumColorObserved = 0;
  const natureCounts = Object.fromEntries([...COUGH_CHARACTER_PREPROCESSOR.natureCategories, 'unknown'].map(key => [key, 0]));
  const sputumColorCounts = Object.fromEntries([...COUGH_CHARACTER_PREPROCESSOR.sputumColorCategories, 'unknown', 'not_applicable'].map(key => [key, 0]));
  records.forEach(record => {
    const features = transformCoughCharacter(record);
    if (features.sourceStatus.nature === 'observed') natureObserved += 1;
    if (features.sourceStatus.sputumColor === 'observed') sputumColorObserved += 1;
    natureCounts[features.nature] += 1;
    sputumColorCounts[features.sputumColor] += 1;
  });
  return { records: records.length, natureObserved, sputumColorObserved, natureCounts, sputumColorCounts };
}

const completeExample = transformCoughCharacter({
  cough_nature: 'productive', sputum_color: 'yellow_green'
});
if (completeExample.natureOneHot.reduce((a, b) => a + b, 0) !== 1
  || completeExample.sputumColorOneHot.reduce((a, b) => a + b, 0) !== 1
  || completeExample.natureMissing !== 0 || completeExample.sputumColorMissing !== 0) {
  throw new Error('Observed cough character must one-hot encode with no missing flags.');
}
const missingExample = transformCoughCharacter({});
if (missingExample.natureMissing !== 1 || missingExample.sputumColorMissing !== 0
  || missingExample.natureOneHot.some(Boolean)) {
  throw new Error('Missing cough nature must remain unknown and be indicated explicitly.');
}
const missingProductiveColor = transformCoughCharacter({ cough_nature: 'productive' });
if (missingProductiveColor.sputumColorMissing !== 1 || missingProductiveColor.sputumColorOneHot.some(Boolean)) {
  throw new Error('Missing productive cough color must remain unknown and be indicated explicitly.');
}
const notApplicableColor = transformCoughCharacter({ cough_nature: 'dry' });
if (notApplicableColor.sputumColorMissing !== 0 || notApplicableColor.sputumColor !== 'not_applicable') {
  throw new Error('Sputum color must be marked not applicable for dry cough.');
}

const classifier = new RespiratoryRFClassifier();
let unchangedPredictions = 0;
let correct = 0;
test.forEach(record => {
  const input = {
    age: record.demographics?.age,
    oxygen_saturation: record.vitals?.oxygenLevel,
    respiratory_rate: record.vitals?.respiratoryRate,
    temperature_c: record.vitals?.temperature,
    dyspnea_severity: record.symptoms?.breathingDifficulty ? 2 : 0,
    has_cough: Boolean(record.symptoms?.coughLevel && record.symptoms.coughLevel !== 'none'),
    cough_duration_days: record.symptoms?.symptomDurationDays,
    chest_pain: record.symptoms?.chestPain,
    has_asthma: record.comorbidities?.asthma,
    has_copd: record.comorbidities?.copd,
    smoker: record.comorbidities?.smoking,
    cough_nature: record.symptoms?.coughNature,
    sputum_color: record.symptoms?.sputumColor
  };
  const baseline = classifier.predict({ ...input, cough_nature: undefined, sputum_color: undefined });
  const candidate = classifier.predict(input);
  if (baseline.triage_category === candidate.triage_category) unchangedPredictions += 1;
  const label = ({ LOW_RISK: 'normal', MODERATE_RISK: 'high', HIGH_RISK: 'urgent', EMERGENCY: 'urgent' })[candidate.triage_category] || 'normal';
  if (label === record.groundTruth?.triage) correct += 1;
});

const trainCoverage = coverage(train);
const testCoverage = coverage(test);
const featureLength = extractFeatures({ cough_nature: 'productive', sputum_color: 'clear' }).length;
console.log(JSON.stringify({
  evaluation: 'Preprocessing and current-model compatibility check; no cough-character values are present in this dataset split.',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  preprocessing: COUGH_CHARACTER_PREPROCESSOR.version,
  encodedVectorLength: featureLength,
  trainCoverage,
  testCoverage,
  currentModelCompatibility: {
    testAccuracy: Number((correct / Math.max(1, test.length)).toFixed(4)),
    predictionsUnchangedByNewFeatures: unchangedPredictions,
    testRecords: test.length,
    accuracyImpactMeasurable: testCoverage.natureObserved > 0 && testCoverage.sputumColorObserved > 0,
    note: 'The production classifier currently consumes only its existing 14 clinical inputs; this preprocessing addition is not evidence of predictive improvement. Retraining and labeled cough-character data are required to measure model impact.'
  }
}, null, 2));
