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

// Fitted on dataset/train_dataset.json only (112 records; patient-level split
// seed 42). Chills and night-sweat labels are not present in this cohort.
const FEVER_PREPROCESSOR = Object.freeze({
  version: 'fever-chills-preprocess-v1',
  trainingCount: 112,
  median: 37.45,
  mean: 37.691071,
  standardDeviation: 0.803069,
  bounds: Object.freeze({ min: 34, max: 43 }),
  feverThresholdC: 38,
  symptomCategories: Object.freeze(['yes', 'no', 'unknown'])
});
const FEVER_CHILLS_FEATURE_COUNT = 12;

// Pack-year observations and non-cigarette exposures are not present in the
// current training cohort. The fallback remains explicitly unfitted until
// such labels are available; a missingness bit prevents zero from implying
// that the patient never smoked.
const SMOKING_HISTORY_PREPROCESSOR = Object.freeze({
  version: 'smoking-history-preprocess-v1',
  fitted: false,
  trainingCount: 0,
  medianPackYears: 0,
  bounds: Object.freeze({ min: 0, max: 120 }),
  statusCategories: Object.freeze(['never', 'current', 'former', 'unknown']),
  exposureCategories: Object.freeze(['yes', 'no', 'unknown'])
});
const SMOKING_HISTORY_FEATURE_COUNT = 19;

// Environmental questionnaire values are multi-label binary features. No
// labeled exposure values exist in the current cohort; absent answers are
// imputed as unknown and tracked separately, never treated as "none".
const ENVIRONMENTAL_EXPOSURE_PREPROCESSOR = Object.freeze({
  version: 'egypt-environmental-exposure-preprocess-v1',
  fitted: false,
  trainingCount: 0,
  categories: Object.freeze(['dust', 'traffic_exhaust', 'rice_straw_burning', 'factory_fumes', 'household_birds'])
});
const ENVIRONMENTAL_EXPOSURE_FEATURE_COUNT = ENVIRONMENTAL_EXPOSURE_PREPROCESSOR.categories.length + 3;
// Atopy history is tri-state categorical data. Current training records have
// no labeled observations, so unknown is the explicit fallback plus missing bit.
const ATOPY_HISTORY_PREPROCESSOR = Object.freeze({
  version: 'atopy-history-preprocess-v1',
  fitted: false,
  trainingCount: 0,
  categories: Object.freeze(['yes', 'no', 'unknown']),
  fields: Object.freeze(['nasalAllergy', 'eczema', 'childhoodAsthma', 'familyAsthma', 'familyPulmonaryFibrosis'])
});
const ATOPY_HISTORY_FEATURE_COUNT = ATOPY_HISTORY_PREPROCESSOR.fields.length * (ATOPY_HISTORY_PREPROCESSOR.categories.length + 1);

function fitTemperaturePreprocessor(trainingRecords = []) {
  const values = trainingRecords.map(record => {
    const rawValue = record?.vitals?.temperature ?? record?.temperature_c ?? record?.temperature;
    const transformed = transformTemperature(rawValue);
    return transformed.sourceStatus === 'observed' ? transformed.value : NaN;
  })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!values.length) return { ...FEVER_PREPROCESSOR, fitted: false, trainingCount: 0 };
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length) || 1;
  return { ...FEVER_PREPROCESSOR, trainingCount: values.length, median, mean: Number(mean.toFixed(6)), standardDeviation: Number(standardDeviation.toFixed(6)), fitted: true };
}

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

// Cough character is nominal, so it is one-hot encoded rather than assigned
// an artificial numeric order. Missing values use an all-zero vector plus an
// explicit missing flag; no cough phenotype is imputed from unrelated data.
const COUGH_CHARACTER_PREPROCESSOR = Object.freeze({
  version: 'cough-character-preprocess-v1',
  natureCategories: Object.freeze(['none', 'dry', 'productive']),
  sputumColorCategories: Object.freeze(['clear', 'white', 'yellow_green', 'blood_streaked'])
});

// The current train split does not contain cough-specific duration labels.
// Until it does, keep the established model fallback (7 days) and mark the
// imputation explicitly; never substitute general symptom duration here.
const COUGH_DURATION_PREPROCESSOR = Object.freeze({
  version: 'cough-duration-preprocess-v1',
  fitted: false,
  trainingCount: 0,
  median: 7,
  bounds: Object.freeze({ min: 1, max: 365 }),
  normalization: Object.freeze({ min: 1, max: 365 }),
  categories: Object.freeze(['acute', 'subacute', 'chronic'])
});

// A tri-state categorical input. One-hot bits are already normalized to [0, 1];
// absent/invalid values use the explicit unknown category plus a missing flag.
const WHEEZING_PREPROCESSOR = Object.freeze({
  version: 'wheezing-preprocess-v1',
  categories: Object.freeze(['yes', 'no', 'unknown'])
});
const WHEEZING_FEATURE_COUNT = WHEEZING_PREPROCESSOR.categories.length + 1;
const COUGH_DURATION_FEATURE_COUNT = 5;

const CHEST_PAIN_PREPROCESSOR = Object.freeze({
  version: 'chest-pain-pattern-preprocess-v1',
  categories: Object.freeze(['tightness', 'pleuritic', 'both', 'other_unknown', 'unknown'])
});
const CHEST_PAIN_FEATURE_COUNT = CHEST_PAIN_PREPROCESSOR.categories.length + 1;

function normalizeChestPainPresence(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا'].includes(normalized)) return 'no';
  if (['unknown', 'not sure', 'unsure', 'غير معروف', 'غير متأكد', 'مش عارف'].includes(normalized)) return 'unknown';
  return null;
}

function normalizeChestPainType(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (CHEST_PAIN_PREPROCESSOR.categories.includes(normalized)) return normalized;
  if (/pressure|heaviness|tightness|ثقل|ضغط|ضيق/.test(normalized)) return 'tightness';
  if (/pleuritic|deep_breath|inhalation|inspiration|نفس_عميق|النفس_العميق|الشهيق|يزيد_مع_التنفس/.test(normalized)) return 'pleuritic';
  if (['both', 'كلاهما', 'الاتنين', 'الاثنين'].includes(normalized)) return 'both';
  if (['other', 'unsure', 'not_sure', 'another_type', 'نوع_آخر', 'غير_متأكد'].includes(normalized)) return 'other_unknown';
  return null;
}

function transformChestPainCharacter(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  const rawPresence = record.chest_pain ?? record.chestPain ?? record.chestPainKey
    ?? symptoms.chestPain ?? symptoms.chestPainKey ?? record.assessment?.symptoms?.chestPain;
  const presenceAbsent = rawPresence === null || rawPresence === undefined || String(rawPresence).trim() === '';
  const presence = normalizeChestPainPresence(rawPresence);
  const rawType = record.chest_pain_type ?? record.chestPainType ?? record.chestPainTypeKey
    ?? symptoms.chestPainType ?? record.assessment?.symptoms?.chestPainType;
  const typeAbsent = rawType === null || rawType === undefined || String(rawType).trim() === '';
  const type = normalizeChestPainType(rawType);

  if (presence === 'no') {
    return {
      category: 'not_applicable',
      oneHot: CHEST_PAIN_PREPROCESSOR.categories.map(() => 0),
      missing: 0,
      sourceStatus: 'not_applicable'
    };
  }

  if (type) {
    return {
      category: type,
      oneHot: CHEST_PAIN_PREPROCESSOR.categories.map(category => category === type ? 1 : 0),
      missing: 0,
      sourceStatus: 'observed'
    };
  }

  const explicitlyUnknown = presence === 'unknown' && typeAbsent;
  const category = 'unknown';
  return {
    category,
    oneHot: CHEST_PAIN_PREPROCESSOR.categories.map(option => option === category ? 1 : 0),
    missing: explicitlyUnknown ? 0 : 1,
    sourceStatus: explicitlyUnknown ? 'unknown' : presenceAbsent && typeAbsent ? 'missing' : typeAbsent ? 'missing' : 'invalid'
  };
}

function normalizeWheezing(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا'].includes(normalized)) return 'no';
  if (['unknown', 'not sure', 'unsure', 'غير معروف', 'غير متأكد', 'مش عارف'].includes(normalized)) return 'unknown';
  return null;
}

function transformWheezing(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  const rawValue = record.wheezing ?? record.wheezing_present ?? record.wheezingPresent
    ?? symptoms.wheezing ?? record.assessment?.symptoms?.wheezing;
  const absent = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalized = normalizeWheezing(rawValue);
  const valid = normalized !== null;
  const category = valid ? normalized : 'unknown';
  return {
    category,
    oneHot: WHEEZING_PREPROCESSOR.categories.map(option => category === option ? 1 : 0),
    missing: valid ? 0 : 1,
    sourceStatus: valid ? category : absent ? 'missing' : 'invalid'
  };
}

function normalizeCoughCategory(value, allowed) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : null;
}

function getCoughDurationDays(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  return record.cough_duration_days ?? record.coughDurationDays
    ?? symptoms.coughDurationDays ?? record.assessment?.symptoms?.coughDurationDays;
}

function getCoughPresence(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  const nature = normalizeCoughCategory(
    record.cough_nature ?? record.coughNature ?? symptoms.coughNature,
    COUGH_CHARACTER_PREPROCESSOR.natureCategories
  );
  if (nature === 'none') return false;
  if (nature === 'dry' || nature === 'productive') return true;
  const explicit = record.has_cough ?? record.hasCough ?? symptoms.hasCough;
  if (explicit === false || explicit === 0 || explicit === 'false') return false;
  if (explicit === true || explicit === 1 || explicit === 'true') return true;
  const severity = String(record.coughLevel ?? symptoms.coughLevel ?? '').trim().toLowerCase();
  if (['none', 'لا توجد', 'no cough'].includes(severity)) return false;
  if (severity) return true;
  return null;
}

function fitCoughDurationPreprocessor(trainingRecords = [], fallbackMedian = COUGH_DURATION_PREPROCESSOR.median) {
  const values = trainingRecords.map(getCoughDurationDays).map(raw => {
    const normalized = normalizeArabicDigits(String(raw ?? '')).trim();
    if (!/^\d{1,3}$/.test(normalized)) return null;
    const value = Number(normalized);
    return value >= COUGH_DURATION_PREPROCESSOR.bounds.min && value <= COUGH_DURATION_PREPROCESSOR.bounds.max ? value : null;
  }).filter(Number.isInteger).sort((a, b) => a - b);
  if (!values.length) return { ...COUGH_DURATION_PREPROCESSOR, median: fallbackMedian, fitted: false, trainingCount: 0 };
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  return { ...COUGH_DURATION_PREPROCESSOR, median, fitted: true, trainingCount: values.length };
}

function transformCoughDuration(record = {}, preprocessor = COUGH_DURATION_PREPROCESSOR) {
  const rawValue = getCoughDurationDays(record);
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalizedDigits = normalizeArabicDigits(String(rawValue ?? '')).trim();
  const match = normalizedDigits.match(/^(\d{1,3})(?:\s*(?:days?|d|يوم|أيام|ايام))?$/i);
  const parsed = match ? Number(match[1]) : NaN;
  const valid = !missing && Number.isInteger(parsed)
    && parsed >= preprocessor.bounds.min && parsed <= preprocessor.bounds.max;
  const coughPresence = getCoughPresence(record);

  if (coughPresence === false) {
    return {
      value: 0,
      normalized: 0,
      category: 'not_applicable',
      bandAcute: 0,
      bandSubacute: 0,
      bandChronic: 0,
      missing: 0,
      sourceStatus: 'not_applicable'
    };
  }

  const value = valid ? parsed : preprocessor.median;
  const category = valid
    ? value < 21 ? 'acute' : value <= 56 ? 'subacute' : 'chronic'
    : 'unknown';
  return {
    value,
    normalized: Number(((value - preprocessor.normalization.min)
      / (preprocessor.normalization.max - preprocessor.normalization.min)).toFixed(6)),
    category,
    bandAcute: category === 'acute' ? 1 : 0,
    bandSubacute: category === 'subacute' ? 1 : 0,
    bandChronic: category === 'chronic' ? 1 : 0,
    missing: valid ? 0 : 1,
    sourceStatus: valid ? 'observed' : missing ? 'missing' : 'invalid'
  };
}

function transformCoughCharacter(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  const rawNature = record.cough_nature ?? record.coughNature ?? symptoms.coughNature;
  const natureMissing = rawNature === null || rawNature === undefined || String(rawNature).trim() === '';
  const nature = normalizeCoughCategory(rawNature, COUGH_CHARACTER_PREPROCESSOR.natureCategories);
  const natureValid = nature !== null;

  const rawColor = record.sputum_color ?? record.sputumColor ?? symptoms.sputumColor;
  const colorNotApplicable = nature === 'none' || nature === 'dry';
  const colorMissing = nature === 'productive'
    && (rawColor === null || rawColor === undefined || String(rawColor).trim() === '');
  const color = nature === 'productive'
    ? normalizeCoughCategory(rawColor, COUGH_CHARACTER_PREPROCESSOR.sputumColorCategories)
    : null;
  const colorValid = color !== null;

  return {
    nature: natureValid ? nature : 'unknown',
    sputumColor: colorValid ? color : colorNotApplicable ? 'not_applicable' : 'unknown',
    natureOneHot: COUGH_CHARACTER_PREPROCESSOR.natureCategories.map(category => nature === category ? 1 : 0),
    sputumColorOneHot: COUGH_CHARACTER_PREPROCESSOR.sputumColorCategories.map(category => color === category ? 1 : 0),
    natureMissing: natureValid ? 0 : 1,
    sputumColorMissing: colorMissing ? 1 : 0,
    sourceStatus: {
      nature: natureValid ? 'observed' : natureMissing ? 'missing' : 'invalid',
      sputumColor: colorValid ? 'observed' : colorNotApplicable ? 'not_applicable' : colorMissing ? 'missing' : nature === 'productive' ? 'invalid' : 'not_reported'
    }
  };
}

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

function transformTemperature(rawValue, preprocessor = FEVER_PREPROCESSOR) {
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  const normalizedDigits = normalizeArabicDigits(String(rawValue ?? '')).replace(/٫/g, '.').trim();
  const match = normalizedDigits.match(/^\d{2}(?:\.\d)?\s*(?:°?\s*c)?$/i);
  const parsed = match ? Number(match[0].replace(/°?\s*c$/i, '').trim()) : NaN;
  const valid = !missing && Number.isFinite(parsed) && parsed >= preprocessor.bounds.min && parsed <= preprocessor.bounds.max;
  const value = valid ? parsed : preprocessor.median;
  const category = value >= preprocessor.feverThresholdC ? 'fever' : 'normal';
  return {
    value,
    normalized: Number(((value - preprocessor.mean) / preprocessor.standardDeviation).toFixed(6)),
    bandNormal: category === 'normal' ? 1 : 0,
    bandFever: category === 'fever' ? 1 : 0,
    missing: valid ? 0 : 1,
    category,
    sourceStatus: missing ? 'missing' : valid ? 'observed' : 'invalid'
  };
}

function normalizeFeverSymptom(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا'].includes(normalized)) return 'no';
  if (['unknown', 'not sure', 'unsure', 'غير معروف', 'غير متأكد', 'مش عارف'].includes(normalized)) return 'unknown';
  return null;
}

function transformFeverSymptoms(record = {}) {
  const symptoms = record.symptoms || record.assessment?.symptoms || {};
  const rawChills = record.chills ?? symptoms.chills;
  const rawNightSweats = record.night_sweats ?? record.nightSweats ?? symptoms.nightSweats;
  const chills = normalizeFeverSymptom(rawChills) || 'unknown';
  const nightSweats = normalizeFeverSymptom(rawNightSweats) || 'unknown';
  return {
    chills,
    chillsOneHot: FEVER_PREPROCESSOR.symptomCategories.map(category => chills === category ? 1 : 0),
    chillsMissing: normalizeFeverSymptom(rawChills) === null ? 1 : 0,
    nightSweats,
    nightSweatsOneHot: FEVER_PREPROCESSOR.symptomCategories.map(category => nightSweats === category ? 1 : 0),
    nightSweatsMissing: normalizeFeverSymptom(rawNightSweats) === null ? 1 : 0
  };
}

function getSmokingHistorySource(record = {}) {
  const history = record.assessment?.exposures?.smokingHistory
    ?? record.exposures?.smokingHistory
    ?? record.smokingHistory
    ?? record.assessment?.smokingHistory
    ?? {};
  const comorbidities = record.comorbidities || record.assessment?.comorbidities || {};
  const rawStatus = history.cigaretteStatus ?? record.cigaretteStatus ?? record.smoking_status
    ?? record.smokingStatus ?? comorbidities.smokingStatus;
  const rawSmoker = record.smoker ?? comorbidities.smoking;
  let status = normalizeSmokingStatus(rawStatus);
  let statusMissing = status === null;
  if (statusMissing && typeof rawSmoker === 'boolean') {
    status = rawSmoker ? 'current' : 'never';
    statusMissing = false;
  }
  if (!status) status = 'unknown';

  let rawPackYears = history.cigarettePackYears ?? history.packYears ?? record.smoking_pack_years
    ?? record.packYears ?? comorbidities.packYears;
  if ((rawPackYears === null || rawPackYears === undefined || String(rawPackYears).trim() === '')
    && history.cigarettePacksPerDay !== undefined && history.cigaretteYearsSmoked !== undefined
    && history.cigarettePacksPerDay !== null && history.cigaretteYearsSmoked !== null
    && String(history.cigarettePacksPerDay).trim() !== '' && String(history.cigaretteYearsSmoked).trim() !== '') {
    const packs = Number(normalizeArabicDigits(String(history.cigarettePacksPerDay)).replace(/٫/g, '.'));
    const years = Number(normalizeArabicDigits(String(history.cigaretteYearsSmoked)).replace(/٫/g, '.'));
    if (Number.isFinite(packs) && Number.isFinite(years)) rawPackYears = packs * years;
  }
  const packYears = parsePackYears(rawPackYears);
  const legacySmokerFallback = packYears.missing && history.cigaretteStatus === undefined
    && rawStatus === undefined && rawSmoker === true;
  const rawExposures = {
    shisha: history.shisha ?? history.hookah ?? record.shisha ?? comorbidities.shisha,
    vaping: history.vaping ?? history.vape ?? record.vaping ?? record.vape ?? comorbidities.vaping ?? comorbidities.vape,
    passiveSmoke: history.passiveSmoke ?? record.passiveSmoke ?? comorbidities.passiveSmoke
  };
  return { history, status, statusMissing, rawSmoker, packYears, legacySmokerFallback, rawExposures };
}

function normalizeSmokingStatus(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['never', 'never_smoked', 'non_smoker', 'nonsmoker', 'no', 'لم_يدخن', 'لم_أدخن'].includes(normalized)) return 'never';
  if (['current', 'active', 'current_smoker', 'مدخن_حاليا', 'أدخن_حاليا'].includes(normalized)) return 'current';
  if (['former', 'former_smoker', 'ex_smoker', 'مدخن_سابقا'].includes(normalized)) return 'former';
  if (['unknown', 'not_sure', 'unsure', 'غير_معروف', 'غير_متأكد'].includes(normalized)) return 'unknown';
  return null;
}

function normalizeSmokingExposure(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا'].includes(normalized)) return 'no';
  if (['unknown', 'not sure', 'unsure', 'غير معروف', 'غير متأكد', 'مش عارف'].includes(normalized)) return 'unknown';
  return null;
}

function parsePackYears(rawValue, preprocessor = SMOKING_HISTORY_PREPROCESSOR) {
  const missing = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';
  if (missing) return { value: null, missing: true, sourceStatus: 'missing' };
  const normalized = normalizeArabicDigits(String(rawValue)).replace(/٫/g, '.').trim();
  const match = normalized.match(/^\d{1,4}(?:\.\d{1,2})?$/);
  const parsed = match ? Number(normalized) : NaN;
  if (!Number.isFinite(parsed) || parsed < preprocessor.bounds.min || parsed > preprocessor.bounds.max * 10) {
    return { value: null, missing: true, sourceStatus: 'invalid' };
  }
  return { value: Math.min(parsed, preprocessor.bounds.max), missing: false, sourceStatus: parsed > preprocessor.bounds.max ? 'clipped' : 'observed' };
}

function transformSmokingHistory(record = {}, preprocessor = SMOKING_HISTORY_PREPROCESSOR) {
  const source = getSmokingHistorySource(record);
  const status = source.status;
  const packYearsMissing = source.packYears.sourceStatus === 'invalid' || (source.packYears.missing && status !== 'never');
  const imputedPackYears = source.packYears.missing
    ? source.legacySmokerFallback ? 10 : status === 'never' ? 0 : preprocessor.medianPackYears
    : source.packYears.value;
  const packYears = status === 'never' && source.packYears.missing ? 0 : imputedPackYears;
  const exposureFeatures = {};
  for (const [key, rawValue] of Object.entries(source.rawExposures)) {
    const category = normalizeSmokingExposure(rawValue) || 'unknown';
    exposureFeatures[key] = {
      category,
      oneHot: preprocessor.exposureCategories.map(candidate => candidate === category ? 1 : 0),
      missing: normalizeSmokingExposure(rawValue) === null ? 1 : 0
    };
  }
  return {
    status,
    statusOneHot: preprocessor.statusCategories.map(category => category === status ? 1 : 0),
    statusMissing: source.statusMissing ? 1 : 0,
    packYears,
    packYearsNormalized: Number((packYears / preprocessor.bounds.max).toFixed(6)),
    packYearsMissing: packYearsMissing ? 1 : 0,
    packYearsSourceStatus: source.packYears.sourceStatus,
    legacySmokerFallback: source.legacySmokerFallback,
    ...exposureFeatures
  };
}

function fitSmokingHistoryPreprocessor(trainingRecords = []) {
  const observations = trainingRecords
    .map(record => getSmokingHistorySource(record).packYears)
    .filter(feature => !feature.missing && Number.isFinite(feature.value))
    .map(feature => feature.value)
    .sort((a, b) => a - b);
  if (!observations.length) return { ...SMOKING_HISTORY_PREPROCESSOR, fitted: false, trainingCount: 0, medianPackYears: 0 };
  const middle = Math.floor(observations.length / 2);
  const medianPackYears = observations.length % 2
    ? observations[middle]
    : (observations[middle - 1] + observations[middle]) / 2;
  return { ...SMOKING_HISTORY_PREPROCESSOR, fitted: true, trainingCount: observations.length, medianPackYears };
}

function normalizeEnvironmentalExposureKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    dust: 'dust', dust_exposure: 'dust', soil: 'dust', sand: 'dust', أتربة: 'dust', غبار: 'dust', أتربة_أو_غبار: 'dust',
    traffic_exhaust: 'traffic_exhaust', vehicle_exhaust: 'traffic_exhaust', car_exhaust: 'traffic_exhaust', عوادم_سيارات: 'traffic_exhaust',
    rice_straw_burning: 'rice_straw_burning', crop_residue_burning: 'rice_straw_burning', agricultural_burning: 'rice_straw_burning', حرق_قش_الأرز: 'rice_straw_burning', حرق_قش_الأرز_أو_مخلفات_زراعية: 'rice_straw_burning',
    factory_fumes: 'factory_fumes', industrial_fumes: 'factory_fumes', factory_smoke: 'factory_fumes', أدخنة_مصانع: 'factory_fumes', أبخرة_أو_أدخنة_مصانع: 'factory_fumes',
    household_birds: 'household_birds', pet_birds: 'household_birds', birds_at_home: 'household_birds', تربية_طيور_منزلية: 'household_birds',
    none: 'none', no_exposure: 'none', لا_يوجد: 'none',
    unknown: 'unknown', not_sure: 'unknown', unsure: 'unknown', غير_معروف: 'unknown'
  };
  return aliases[normalized] || null;
}

function getEnvironmentalExposureSource(record = {}) {
  let rawValues = record.assessment?.exposures?.environmental
    ?? record.exposures?.environmental
    ?? record.environmentalExposure
    ?? record.environmentalExposures
    ?? record.environmental_exposure;
  const provided = rawValues !== null && rawValues !== undefined;
  let malformed = false;
  if (rawValues && !Array.isArray(rawValues) && Array.isArray(rawValues.sources)) rawValues = rawValues.sources;
  else if (typeof rawValues === 'string') rawValues = [rawValues];
  else if (provided && !Array.isArray(rawValues)) malformed = true;
  const missing = !provided || (Array.isArray(rawValues) && rawValues.length === 0);
  const values = Array.isArray(rawValues) ? rawValues : [];
  const mapped = values.map(normalizeEnvironmentalExposureKey);
  const unique = [...new Set(mapped.filter(Boolean))];
  const invalid = !missing && (malformed || mapped.some(value => value === null)
    || (unique.includes('none') && unique.length !== 1)
    || (unique.includes('unknown') && unique.length !== 1));
  return {
    values: invalid ? ['unknown'] : missing ? ['unknown'] : unique,
    missing: missing || invalid,
    sourceStatus: missing ? 'missing' : invalid ? 'invalid' : unique.includes('unknown') ? 'unknown' : unique.includes('none') ? 'none' : 'observed'
  };
}

function transformEnvironmentalExposure(record = {}, preprocessor = ENVIRONMENTAL_EXPOSURE_PREPROCESSOR) {
  const source = getEnvironmentalExposureSource(record);
  return {
    categories: source.values,
    sourceOneHot: preprocessor.categories.map(category => source.values.includes(category) ? 1 : 0),
    none: source.values.includes('none') ? 1 : 0,
    unknown: source.values.includes('unknown') ? 1 : 0,
    missing: source.missing ? 1 : 0,
    sourceStatus: source.sourceStatus
  };
}

function fitEnvironmentalExposurePreprocessor(trainingRecords = []) {
  const observedRecords = trainingRecords.filter(record => !getEnvironmentalExposureSource(record).missing).length;
  return {
    ...ENVIRONMENTAL_EXPOSURE_PREPROCESSOR,
    fitted: observedRecords > 0,
    trainingCount: observedRecords
  };
}

function normalizeAtopyHistoryValue(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا'].includes(normalized)) return 'no';
  if (['unknown', 'not sure', 'unsure', 'غير معروف', 'غير متأكد', 'مش عارف'].includes(normalized)) return 'unknown';
  return null;
}

function getAtopyHistorySource(record = {}) {
  return record.assessment?.exposures?.atopyHistory
    ?? record.exposures?.atopyHistory
    ?? record.atopyHistory
    ?? record.assessment?.atopyHistory
    ?? {};
}

function transformAtopyHistory(record = {}, preprocessor = ATOPY_HISTORY_PREPROCESSOR) {
  const source = getAtopyHistorySource(record);
  const fields = {};
  for (const key of preprocessor.fields) {
    const normalized = normalizeAtopyHistoryValue(source?.[key]);
    const category = normalized || 'unknown';
    fields[key] = {
      category,
      oneHot: preprocessor.categories.map(candidate => candidate === category ? 1 : 0),
      missing: normalized === null ? 1 : 0
    };
  }
  return fields;
}

function fitAtopyHistoryPreprocessor(trainingRecords = []) {
  const observedRecords = trainingRecords.filter(record => {
    const transformed = transformAtopyHistory(record);
    return Object.values(transformed).some(feature => feature.missing === 0);
  }).length;
  return { ...ATOPY_HISTORY_PREPROCESSOR, fitted: observedRecords > 0, trainingCount: observedRecords };
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
function extractFeatures(rawData = {}, {
  mmrcPreprocessor = MMRC_PREPROCESSOR,
  coughDurationPreprocessor = COUGH_DURATION_PREPROCESSOR,
  temperaturePreprocessor = FEVER_PREPROCESSOR,
  smokingHistoryPreprocessor = SMOKING_HISTORY_PREPROCESSOR,
  environmentalExposurePreprocessor = ENVIRONMENTAL_EXPOSURE_PREPROCESSOR,
  atopyHistoryPreprocessor = ATOPY_HISTORY_PREPROCESSOR
} = {}) {
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
  const coughFeatures = transformCoughCharacter(rawData);
  const coughDurationFeatures = transformCoughDuration(rawData, coughDurationPreprocessor);
  const wheezingFeatures = transformWheezing(rawData);
  const chestPainFeatures = transformChestPainCharacter(rawData);
  const sbp = clampNumber(rawData.systolic_bp || rawData.systolic, 'systolic_bp');
  const dbp = clampNumber(rawData.diastolic_bp || rawData.diastolic, 'diastolic_bp');
  const temp = clampNumber(rawData.temperature_c || rawData.temperature, 'temperature_c');
  const temperatureFeatures = transformTemperature(rawData.temperature_c ?? rawData.temperature, temperaturePreprocessor);
  const feverSymptoms = transformFeverSymptoms(rawData);
  
  // Categorical / Ordinal severity: 0 = none, 1 = mild, 2 = moderate, 3 = severe
  let dyspnea = 0;
  if (typeof rawData.dyspnea_severity === 'number') {
    dyspnea = Math.min(Math.max(rawData.dyspnea_severity, 0), 3);
  } else if (rawData.shortness_of_breath || rawData.dyspnea) {
    dyspnea = rawData.is_severe_dyspnea ? 3 : 2;
  }

  const coughDays = clampNumber(rawData.cough_duration_days || (rawData.has_cough ? 7 : 0), 'cough_duration_days');
  const hemoptysis = (rawData.hemoptysis || rawData.coughing_blood) ? 1.0 : 0.0;
  const chestPainPresence = normalizeChestPainPresence(rawData.chest_pain ?? rawData.chestPainKey
    ?? rawData.chestPain ?? rawData.symptoms?.chestPain ?? rawData.assessment?.symptoms?.chestPain);
  const chestPain = (chestPainPresence === 'yes' || rawData.sharp_chest_pain) ? 1.0 : 0.0;
  const smokingHistoryFeatures = transformSmokingHistory(rawData, smokingHistoryPreprocessor);
  const environmentalExposureFeatures = transformEnvironmentalExposure(rawData, environmentalExposurePreprocessor);
  const atopyHistoryFeatures = transformAtopyHistory(rawData, atopyHistoryPreprocessor);
  const smokingYears = smokingHistoryFeatures.packYears;
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
    mmrcFeatures.missing,
    ...coughFeatures.natureOneHot,
    ...coughFeatures.sputumColorOneHot,
    coughFeatures.natureMissing,
    coughFeatures.sputumColorMissing,
    coughDurationFeatures.normalized,
    coughDurationFeatures.bandAcute,
    coughDurationFeatures.bandSubacute,
    coughDurationFeatures.bandChronic,
    coughDurationFeatures.missing,
    ...wheezingFeatures.oneHot,
    wheezingFeatures.missing,
    ...chestPainFeatures.oneHot,
    chestPainFeatures.missing,
    temperatureFeatures.normalized,
    temperatureFeatures.bandNormal,
    temperatureFeatures.bandFever,
    temperatureFeatures.missing,
    ...feverSymptoms.chillsOneHot,
    feverSymptoms.chillsMissing,
    ...feverSymptoms.nightSweatsOneHot,
    feverSymptoms.nightSweatsMissing,
    smokingHistoryFeatures.packYearsNormalized,
    smokingHistoryFeatures.packYearsMissing,
    ...smokingHistoryFeatures.statusOneHot,
    smokingHistoryFeatures.statusMissing,
    ...smokingHistoryFeatures.shisha.oneHot,
    smokingHistoryFeatures.shisha.missing,
    ...smokingHistoryFeatures.vaping.oneHot,
    smokingHistoryFeatures.vaping.missing,
    ...smokingHistoryFeatures.passiveSmoke.oneHot,
    smokingHistoryFeatures.passiveSmoke.missing,
    ...environmentalExposureFeatures.sourceOneHot,
    environmentalExposureFeatures.none,
    environmentalExposureFeatures.unknown,
    environmentalExposureFeatures.missing,
    ...atopyHistoryPreprocessor.fields.flatMap(key => [...atopyHistoryFeatures[key].oneHot, atopyHistoryFeatures[key].missing])
  ];
}

module.exports = {
  PHYSIOLOGICAL_BOUNDS,
  MMRC_PREPROCESSOR,
  COUGH_CHARACTER_PREPROCESSOR,
  COUGH_DURATION_PREPROCESSOR,
  WHEEZING_PREPROCESSOR,
  WHEEZING_FEATURE_COUNT,
  COUGH_DURATION_FEATURE_COUNT,
  CHEST_PAIN_PREPROCESSOR,
  CHEST_PAIN_FEATURE_COUNT,
  RESPIRATORY_RATE_PREPROCESSOR,
  SPO2_PREPROCESSOR,
  FEVER_PREPROCESSOR,
  FEVER_CHILLS_FEATURE_COUNT,
  SMOKING_HISTORY_PREPROCESSOR,
  SMOKING_HISTORY_FEATURE_COUNT,
  ENVIRONMENTAL_EXPOSURE_PREPROCESSOR,
  ENVIRONMENTAL_EXPOSURE_FEATURE_COUNT,
  ATOPY_HISTORY_PREPROCESSOR,
  ATOPY_HISTORY_FEATURE_COUNT,
  fitTemperaturePreprocessor,
  fitSmokingHistoryPreprocessor,
  fitEnvironmentalExposurePreprocessor,
  fitAtopyHistoryPreprocessor,
  clampNumber,
  extractFeatures,
  fitMmrcPreprocessor,
  getMmrcScore,
  normalizeArabicDigits,
  transformSpO2,
  transformRespiratoryRate,
  transformTemperature,
  normalizeFeverSymptom,
  transformFeverSymptoms,
  normalizeSmokingStatus,
  normalizeSmokingExposure,
  transformSmokingHistory,
  normalizeEnvironmentalExposureKey,
  transformEnvironmentalExposure,
  normalizeAtopyHistoryValue,
  transformAtopyHistory,
  transformMmrcScore,
  transformCoughCharacter,
  fitCoughDurationPreprocessor,
  getCoughDurationDays,
  transformCoughDuration,
  normalizeWheezing,
  transformWheezing,
  normalizeChestPainPresence,
  normalizeChestPainType,
  transformChestPainCharacter
};
