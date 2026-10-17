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

/**
 * Extracts and standardizes a numerical vector from a patient questionnaire payload.
 * @param {Object} rawData 
 * @returns {Array<number>}
 */
function extractFeatures(rawData = {}) {
  const age = clampNumber(rawData.age, 'age');
  const spo2 = clampNumber(rawData.oxygen_saturation || rawData.spo2, 'oxygen_saturation');
  const rr = clampNumber(rawData.respiratory_rate, 'respiratory_rate');
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
    allergyHistory
  ];
}

module.exports = {
  PHYSIOLOGICAL_BOUNDS,
  clampNumber,
  extractFeatures,
  normalizeArabicDigits
};
