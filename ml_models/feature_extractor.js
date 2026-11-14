/**
 * HealthVibe AI - Clinical Feature Extractor
 * Normalizes, validates, and encodes physiological inputs into ML-ready tensor arrays.
 */

'use strict';

const PHYSIOLOGICAL_BOUNDS = {
  age: { min: 0, max: 130, default: 35 },
  oxygen_saturation: { min: 50, max: 100, default: 98 },
  respiratory_rate: { min: 5, max: 60, default: 16 },
  systolic_bp: { min: 50, max: 260, default: 120 },
  diastolic_bp: { min: 30, max: 150, default: 80 },
  temperature_c: { min: 34.0, max: 43.0, default: 37.0 },
  cough_duration_days: { min: 0, max: 365, default: 0 },
  smoking_pack_years: { min: 0, max: 120, default: 0 },
  bmi: { min: 10, max: 80, default: 24.5 },
  fasting_blood_glucose: { min: 20, max: 1000, default: 95 }
};

// Fitted on dataset/train_dataset.json only (112 records; split manifest seed 42).
// Refit these values on the training partition whenever the dataset version changes.
const SPO2_PREPROCESSOR = Object.freeze({
  version: 'spo2-preprocess-v1',
  trainingCount: 112,
  median: 92,
  mean: 91.982143,
  standardDeviation: 4.5591,
  bounds: Object.freeze({ min: 50, max: 100 }),
  bands: Object.freeze({ criticalBelow: 92, moderateBelow: 95 })
});

// Fitted on the same patient-level training partition only.
const RESPIRATORY_RATE_PREPROCESSOR = Object.freeze({
  version: 'respiratory-rate-preprocess-v1',
  trainingCount: 112,
  median: 21,
  mean: 22.178571,
  standardDeviation: 6.213773,
  bounds: Object.freeze({ min: 5, max: 60 }),
  bands: Object.freeze({ lowBelow: 12, normalBelow: 21, elevatedThrough: 24 })
});

// No patient-level mMRC values exist in the current train split. Grade 2 is a
// temporary scale midpoint; replace it with a median fitted on actual train data.
const MMRC_PREPROCESSOR = Object.freeze({
  version: 'mmrc-preprocess-v1',
  fitted: false,
  trainingCount: 0,
  median: 2,
  min: 0,
  max: 4,
  normalizationCenter: 2,
  normalizationScale: 2
});

function normalizeArabicDigits(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632);
}

function clampNumber(val, key) {
  const num = Number(normalizeArabicDigits(String(val)));
  if (isNaN(num)) return PHYSIOLOGICAL_BOUNDS[key].default;
  const { min, max } = PHYSIOLOGICAL_BOUNDS[key];
  return Math.min(Math.max(num, min), max);
}

function transformSpO2(rawValue) {
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalizedDigits = normalizeArabicDigits(String(rawValue ?? '')).trim();
  const match = normalizedDigits.match(/^(\d{1,3})\s*%?$/);
  const parsed = match ? Number(match[1]) : NaN;
  const valid = !missing && Number.isInteger(parsed) && parsed >= SPO2_PREPROCESSOR.bounds.min && parsed <= SPO2_PREPROCESSOR.bounds.max;
  const value = valid ? parsed : SPO2_PREPROCESSOR.median;
  const category = value < SPO2_PREPROCESSOR.bands.criticalBelow
    ? 'critical'
    : value < SPO2_PREPROCESSOR.bands.moderateBelow ? 'moderate' : 'normal';

  return {
    value,
    normalized: Number(((value - SPO2_PREPROCESSOR.mean) / SPO2_PREPROCESSOR.standardDeviation).toFixed(6)),
    bandCritical: category === 'critical' ? 1 : 0,
    bandModerate: category === 'moderate' ? 1 : 0,
    bandNormal: category === 'normal' ? 1 : 0,
    missing: valid ? 0 : 1,
    category,
    sourceStatus: missing ? 'missing' : valid ? 'observed' : 'invalid'
  };
}

function transformRespiratoryRate(rawValue) {
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalizedDigits = normalizeArabicDigits(String(rawValue ?? '')).trim();
  const match = normalizedDigits.match(/^(\d{1,2})\s*(?:breaths?\s*\/\s*min)?$/i);
  const parsed = match ? Number(match[1]) : NaN;
  const valid = !missing && Number.isInteger(parsed) && parsed >= RESPIRATORY_RATE_PREPROCESSOR.bounds.min && parsed <= RESPIRATORY_RATE_PREPROCESSOR.bounds.max;
  const value = valid ? parsed : RESPIRATORY_RATE_PREPROCESSOR.median;
  let category = 'tachypnea';
  if (value < RESPIRATORY_RATE_PREPROCESSOR.bands.lowBelow) category = 'low';
  else if (value < RESPIRATORY_RATE_PREPROCESSOR.bands.normalBelow) category = 'normal';
  else if (value <= RESPIRATORY_RATE_PREPROCESSOR.bands.elevatedThrough) category = 'elevated';

  return {
    value,
    normalized: Number(((value - RESPIRATORY_RATE_PREPROCESSOR.mean) / RESPIRATORY_RATE_PREPROCESSOR.standardDeviation).toFixed(6)),
    bandLow: category === 'low' ? 1 : 0,
    bandNormal: category === 'normal' ? 1 : 0,
    bandElevated: category === 'elevated' ? 1 : 0,
    bandTachypnea: category === 'tachypnea' ? 1 : 0,
    missing: valid ? 0 : 1,
    category,
    sourceStatus: missing ? 'missing' : valid ? 'observed' : 'invalid'
  };
}

function getMmrcScore(record = {}) {
  const value = record.mmrc_score ?? record.mmrcGrade ?? record.mmrc_grade
    ?? record.symptoms?.mmrcGrade ?? record.assessment?.symptoms?.mmrcGrade;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(normalizeArabicDigits(String(value)).trim());
  return Number.isInteger(parsed) && parsed >= MMRC_PREPROCESSOR.min && parsed <= MMRC_PREPROCESSOR.max ? parsed : null;
}

function fitMmrcPreprocessor(trainingRecords = [], fallbackMedian = MMRC_PREPROCESSOR.median) {
  const grades = trainingRecords.map(getMmrcScore).filter(Number.isInteger).sort((a, b) => a - b);
  if (!grades.length) {
    return { ...MMRC_PREPROCESSOR, median: fallbackMedian, fitted: false, trainingCount: 0 };
  }
  const mid = Math.floor(grades.length / 2);
  const median = grades.length % 2 ? grades[mid] : (grades[mid - 1] + grades[mid]) / 2;
  return { ...MMRC_PREPROCESSOR, median, fitted: true, trainingCount: grades.length };
}

function transformMmrcScore(rawValue, preprocessor = MMRC_PREPROCESSOR) {
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalizedDigits = normalizeArabicDigits(String(rawValue ?? '')).trim();
  const parsed = /^\d$/.test(normalizedDigits) ? Number(normalizedDigits) : NaN;
  const valid = !missing && Number.isInteger(parsed) && parsed >= preprocessor.min && parsed <= preprocessor.max;
  const value = valid ? parsed : preprocessor.median;
  const oneHot = Array.from({ length: 5 }, (_, grade) => value === grade ? 1 : 0);
  return {
    value,
    normalized: Number(((value - preprocessor.normalizationCenter) / preprocessor.normalizationScale).toFixed(6)),
    oneHot,
    missing: valid ? 0 : 1,
    sourceStatus: missing ? 'missing' : valid ? 'observed' : 'invalid'
  };
}

/**
 * Extracts and standardizes a numerical vector from a patient questionnaire payload.
 * @param {Object} rawData 
 * @returns {Array<number>}
 */
function extractFeatures(rawData = {}, { mmrcPreprocessor = MMRC_PREPROCESSOR } = {}) {
  const age = clampNumber(rawData.age, 'age');
  const spo2Input = rawData.oxygen_saturation ?? rawData.spo2;
  const spo2Features = transformSpO2(spo2Input);
  const spo2 = spo2Features.value;
  const rrInput = rawData.respiratory_rate ?? rawData.respiratoryRate;
  const rrFeatures = transformRespiratoryRate(rrInput);
  const rr = rrFeatures.value;
  const mmrcInput = rawData.mmrc_score ?? rawData.mmrcGrade ?? rawData.mmrc_grade
    ?? rawData.symptoms?.mmrcGrade ?? rawData.assessment?.symptoms?.mmrcGrade;
  const mmrcFeatures = transformMmrcScore(mmrcInput, mmrcPreprocessor);
  const sbp = clampNumber(rawData.systolic_bp || rawData.systolic, 'systolic_bp');
  const dbp = clampNumber(rawData.diastolic_bp || rawData.diastolic, 'diastolic_bp');
  const temp = clampNumber(rawData.temperature_c || rawData.temperature, 'temperature_c');
  
  // Categorical / Ordinal severity: 0 = none, 1 = mild, 2 = moderate, 3 = severe
  let dyspnea = 0;
  if (typeof rawData.dyspnea_severity === 'number') {
    dyspnea = Math.min(Math.max(rawData.dyspnea_severity, 0), 3);
  } else if (rawData.shortness_of_breath || rawData.dyspnea) {
    dyspnea = rawData.is_severe_dyspnea ? 3 : 2;
  }

  const coughDays = clampNumber(rawData.cough_duration_days || (rawData.has_cough ? 7 : 0), 'cough_duration_days');
  const hemoptysis = (rawData.hemoptysis || rawData.coughing_blood) ? 1.0 : 0.0;
  const chestPain = (rawData.chest_pain || rawData.sharp_chest_pain) ? 1.0 : 0.0;
  const smokingYears = clampNumber(rawData.smoking_pack_years || (rawData.smoker ? 10 : 0), 'smoking_pack_years');
  const asthmaHistory = (rawData.chronic_asthma_history || rawData.has_asthma) ? 1.0 : 0.0;
  const copdHistory = (rawData.chronic_copd_history || rawData.has_copd) ? 1.0 : 0.0;
  const allergyHistory = (rawData.allergy_history || rawData.has_allergies) ? 1.0 : 0.0;

  return [
    age,
    spo2,
    rr,
    sbp,
    dbp,
    temp,
    dyspnea,
    coughDays,
    hemoptysis,
    chestPain,
    smokingYears,
    asthmaHistory,
    copdHistory,
    allergyHistory,
    spo2Features.normalized,
    spo2Features.bandCritical,
    spo2Features.bandModerate,
    spo2Features.bandNormal,
    spo2Features.missing,
    rrFeatures.normalized,
    rrFeatures.bandLow,
    rrFeatures.bandNormal,
    rrFeatures.bandElevated,
    rrFeatures.bandTachypnea,
    rrFeatures.missing,
    mmrcFeatures.normalized,
    ...mmrcFeatures.oneHot,
    mmrcFeatures.missing
  ];
}

module.exports = {
  PHYSIOLOGICAL_BOUNDS,
  MMRC_PREPROCESSOR,
  RESPIRATORY_RATE_PREPROCESSOR,
  SPO2_PREPROCESSOR,
  clampNumber,
  extractFeatures,
  fitMmrcPreprocessor,
  getMmrcScore,
  normalizeArabicDigits,
  transformSpO2,
  transformRespiratoryRate,
  transformMmrcScore
};
