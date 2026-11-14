'use strict';

const fs = require('fs');
const path = require('path');
const { RespiratoryRFClassifier } = require('./respiratory_rf_classifier');
const {
  CHEST_PAIN_FEATURE_COUNT,
  CHEST_PAIN_PREPROCESSOR,
  extractFeatures,
  transformChestPainCharacter
} = require('./feature_extractor');

const root = path.resolve(__dirname, '..');
const train = JSON.parse(fs.readFileSync(path.join(root, 'dataset/train_dataset.json'), 'utf8'));
const test = JSON.parse(fs.readFileSync(path.join(root, 'dataset/test_dataset.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset/patient_level_split_manifest.json'), 'utf8'));
if (!manifest.zeroPatientLeakageCertified || manifest.overlapCount !== 0) {
  throw new Error('Patient-level split manifest is not certified as leakage-free.');
}

function summarizeCoverage(records) {
  const counts = { tightness: 0, pleuritic: 0, both: 0, other_unknown: 0, unknown: 0, not_applicable: 0 };
  let observed = 0;
  let missing = 0;
  let invalid = 0;
  let explicitUnknown = 0;
  records.forEach(record => {
    const transformed = transformChestPainCharacter(record);
    counts[transformed.category] = (counts[transformed.category] || 0) + 1;
    if (transformed.sourceStatus === 'observed') observed += 1;
    if (transformed.sourceStatus === 'missing') missing += 1;
    if (transformed.sourceStatus === 'invalid') invalid += 1;
    if (transformed.sourceStatus === 'unknown') explicitUnknown += 1;
  });
  return { records: records.length, observed, explicitUnknown, missing, invalid, categoryCounts: counts };
}

for (const [record, expected, missing] of [
  [{ chestPain: 'yes', chestPainType: 'tightness' }, 'tightness', 0],
  [{ symptoms: { chestPain: 'yes', chestPainType: 'pleuritic' } }, 'pleuritic', 0],
  [{ chestPain: 'نعم', chestPainType: 'ألم حاد يزيد مع النفس العميق أو السعال' }, 'pleuritic', 0],
  [{ chestPain: 'yes', chestPainType: 'Pressure, heaviness, or tightness' }, 'tightness', 0],
  [{ chest_pain: true, chest_pain_type: 'both' }, 'both', 0],
  [{ chestPain: 'yes', chestPainType: 'other_unknown' }, 'other_unknown', 0],
  [{ chestPain: 'no' }, 'not_applicable', 0],
  [{ chestPain: 'unknown' }, 'unknown', 0],
  [{ chestPain: 'yes' }, 'unknown', 1],
  [{}, 'unknown', 1],
  [{ chestPain: 'yes', chestPainType: 'unsupported' }, 'unknown', 1]
]) {
  const transformed = transformChestPainCharacter(record);
  if (transformed.category !== expected || transformed.missing !== missing) {
    throw new Error(`Unexpected chest-pain transformation: expected ${expected}, received ${transformed.category}.`);
  }
  if (transformed.oneHot.some(bit => bit !== 0 && bit !== 1)) {
    throw new Error('Chest-pain one-hot encoding must be normalized to [0, 1].');
  }
  if (expected !== 'not_applicable' && transformed.oneHot.reduce((sum, bit) => sum + bit, 0) !== 1) {
    throw new Error('Reported chest pain must map to exactly one category.');
  }
}
if (extractFeatures({ chestPain: 'no' })[9] !== 0 || extractFeatures({ chestPain: 'yes' })[9] !== 1) {
  throw new Error('Chest-pain presence must remain correctly normalized in the existing binary input.');
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
    cough_duration_days: record.symptoms?.symptomDurationDays,
    chest_pain: record.symptoms?.chestPain,
    chestPainType: record.symptoms?.chestPainType,
    symptoms: record.symptoms,
    has_asthma: record.comorbidities?.asthma,
    has_copd: record.comorbidities?.copd,
    smoker: record.comorbidities?.smoking
  };
  const candidateVector = extractFeatures(input);
  const baseline = classifier.predict(candidateVector.slice(0, -CHEST_PAIN_FEATURE_COUNT));
  const candidate = classifier.predict(candidateVector);
  const baselineLabel = labels[baseline.triage_category] || 'normal';
  const candidateLabel = labels[candidate.triage_category] || 'normal';
  if (baselineLabel === record.groundTruth?.triage) baselineCorrect += 1;
  if (candidateLabel === record.groundTruth?.triage) candidateCorrect += 1;
  if (baselineLabel === candidateLabel) predictionParity += 1;
});

const trainCoverage = summarizeCoverage(train);
const testCoverage = summarizeCoverage(test);
console.log(JSON.stringify({
  evaluation: 'Chest-pain-pattern encoding and existing-model compatibility check; no pattern labels are present in these dataset splits.',
  modelVersion: classifier.version,
  seed: manifest.randomSeed,
  preprocessing: CHEST_PAIN_PREPROCESSOR,
  normalization: 'Categorical pattern uses one-hot binary values [0, 1]. Missing subtype maps to the unknown category with a separate missing flag; no-pain maps to not_applicable.',
  trainCoverage,
  testCoverage,
  holdoutCompatibility: {
    testCount: test.length,
    baselineAccuracy: Number((baselineCorrect / test.length).toFixed(4)),
    candidateAccuracy: Number((candidateCorrect / test.length).toFixed(4)),
    predictionParity: `${predictionParity}/${test.length}`,
    accuracyImpactMeasurable: testCoverage.observed > 0,
    note: 'The production classifier consumes only its established first 14 clinical inputs. Parity is compatibility only, not predictive benefit. Labeled chest-pain patterns and model retraining are required to estimate an accuracy impact.'
  }
}, null, 2));
