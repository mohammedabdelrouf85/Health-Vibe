/**
 * Health Vibe AI - Centralized Input Sanitization & Physiological Validation Service
 * 
 * Provides defense-in-depth against:
 * 1. SQL Injection (SQLi) — detection, neutralization, and query parameter safety.
 * 2. Cross-Site Scripting (XSS) — character escaping, tag filtering, safe URL protocols.
 * 3. Illogical / Out-of-Bounds Medical & Demographic Values:
 *    - SpO2: 50% - 100% (Rejects 250%, -5%, 0%, 101%, non-numerics).
 *    - Age: 0 - 130 years (Rejects -5, 250, future DOB, 150+).
 *    - Respiratory Rate: 5 - 60 breaths/min.
 *    - Body Temperature: 34.0°C - 43.0°C.
 *    - Blood Pressure: SBP 50 - 260 mmHg, DBP 30 - 150 mmHg (and SBP > DBP).
 *    - Blood Glucose: 20 - 1000 mg/dL.
 *    - Height / Weight: Height 20 - 260 cm, Weight 1 - 400 kg.
 */

'use strict';

// ── 1. SQL INJECTION DEFENSE ──────────────────────────────────────────────────

// Common SQL Injection Signatures (Case-Insensitive)
const SQLI_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|UNION|MERGE|DECLARE)\b)/i,
  /(--|\#|\/\*|\*\/)/,
  /('|\b)\s*(OR|AND)\s+('?[0-9a-zA-Z]+'?\s*=\s*'?[0-9a-zA-Z]+'|1\s*=\s*1|true\s*=\s*true)/i,
  /'\s*(OR|AND)\s+[^=]+=/i,
  /(\bWAITFOR\s+DELAY\b|\bSLEEP\s*\(\s*\d+\s*\)|\bBENCHMARK\s*\(|\bPG_SLEEP\b)/i,
  /(\bxp_cmdshell\b|\bsp_executesql\b)/i,
  /(\bUNION\s+(ALL\s+)?SELECT\b)/i,
  /(\bCONCAT\s*\(|\bHEX\s*\(|\bCHAR\s*\()/i,
  /(\bINFORMATION_SCHEMA\b|\bSYS\.TABLES\b|\bALL_TABLES\b)/i
];

/**
 * Detects whether a string contains SQL injection patterns.
 * @param {string|any} input
 * @returns {{ isMalicious: boolean, matches: string[] }}
 */
function detectSqlInjection(input) {
  if (typeof input !== 'string') return { isMalicious: false, matches: [] };
  const matches = [];
  const text = input.trim();
  if (!text) return { isMalicious: false, matches: [] };

  for (const pattern of SQLI_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }

  return {
    isMalicious: matches.length > 0,
    matches
  };
}

/**
 * Strips or neutralizes dangerous SQL injection tokens from input string.
 * @param {string} input
 * @returns {string}
 */
function sanitizeSqlInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/(\b(DROP|TRUNCATE|EXEC|EXECUTE)\b|--|\/\*|\*\/)/gi, '')
    .replace(/'/g, "''")
    .trim();
}

// ── 2. XSS SANITIZATION & SAFE URLS ───────────────────────────────────────────

/**
 * Escapes HTML control characters into inert HTML entities.
 * @param {any} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates external URLs, allowing only secure http/https protocols.
 * Rejects javascript:, data:, vbscript: payloads.
 * @param {string} url
 * @param {string} fallback
 * @returns {string}
 */
function getSafeUrl(url, fallback = 'https://healthvibes.app') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return fallback;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return url.trim();
  }
  return fallback;
}

// ── 3. PHYSIOLOGICAL & CLINICAL BOUNDS VALIDATION ────────────────────────────

/**
 * Normalizes Eastern Arabic / Persian Indic digits (٠-٩, ۰-۹) into Western Arabic (0-9).
 * @param {any} value
 * @returns {string}
 */
function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Validates Oxygen Saturation (SpO2).
 * Normal physiological range: 50% - 100%.
 * Rejects: SpO2 > 100% (e.g. 250%), SpO2 < 50% (e.g. -5%, 0%), non-integers, malicious strings.
 * @param {any} value
 * @returns {{ isValid: boolean, value: number|null, error: string|null }}
 */
function validateOxygen(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, value: null, error: 'OXYGEN_REQUIRED' };
  }
  const clean = normalizeDigits(String(value).trim()).replace(/%/g, '').trim();
  const num = Number(clean);
  if (isNaN(num) || !/^-?\d+$/.test(clean)) {
    return { isValid: false, value: null, error: 'OXYGEN_INVALID_FORMAT' };
  }
  if (num > 100) {
    return { isValid: false, value: num, error: 'OXYGEN_ABOVE_MAXIMUM' }; // E.g. SpO2 = 250%
  }
  if (num < 50) {
    return { isValid: false, value: num, error: 'OXYGEN_BELOW_PHYSIOLOGICAL_MINIMUM' }; // E.g. SpO2 = -5%
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates Patient Age (in years).
 * Valid biological range: 0 - 130 years.
 * Rejects: Age < 0 (e.g. -5), Age > 130 (e.g. 250), non-numeric values.
 * @param {any} value
 * @returns {{ isValid: boolean, value: number|null, error: string|null }}
 */
function validateAge(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, value: null, error: 'AGE_REQUIRED' };
  }
  const clean = normalizeDigits(String(value).trim());
  const num = Number(clean);
  if (isNaN(num) || !/^-?\d+$/.test(clean)) {
    return { isValid: false, value: null, error: 'AGE_INVALID_FORMAT' };
  }
  if (num < 0) {
    return { isValid: false, value: num, error: 'AGE_NEGATIVE' }; // E.g. Age = -5
  }
  if (num > 130) {
    return { isValid: false, value: num, error: 'AGE_ABOVE_HUMAN_LIFESPAN' }; // E.g. Age = 250
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates Date of Birth (DOB).
 * Calculates age and enforces 0 <= age <= 130.
 * Rejects future dates or improbable historical dates (>130 years ago).
 * @param {string|Date} dateOfBirth
 * @param {Date} [referenceDate]
 * @returns {{ isValid: boolean, age: number|null, error: string|null }}
 */
function validateDateOfBirth(dateOfBirth, referenceDate = new Date()) {
  if (!dateOfBirth) return { isValid: false, age: null, error: 'DOB_REQUIRED' };
  const dob = (dateOfBirth instanceof Date) ? dateOfBirth : new Date(dateOfBirth);
  if (isNaN(dob.getTime())) {
    return { isValid: false, age: null, error: 'DOB_INVALID_DATE' };
  }
  const ref = (referenceDate instanceof Date) ? referenceDate : new Date(referenceDate);
  if (dob > ref) {
    return { isValid: false, age: null, error: 'DOB_FUTURE_DATE' }; // Future DOB -> negative age
  }

  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 0) {
    return { isValid: false, age, error: 'DOB_FUTURE_DATE' };
  }
  if (age > 130) {
    return { isValid: false, age, error: 'DOB_EXCEEDS_130_YEARS' };
  }

  return { isValid: true, age, error: null };
}

/**
 * Validates Symptom Duration (in days) with support for Egyptian colloquial phrasing and Arabic Indic numerals.
 * e.g., "اليوم" -> 1, "يومين" -> 2, "أسبوع" -> 7, "٣ أيام" -> 3.
 * @param {any} value
 * @returns {{ isValid: boolean, days: number|null, text: string, error: string|null }}
 */
function validateDuration(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, days: null, text: '', error: 'DURATION_EMPTY' };
  }
  const raw = String(value).trim();
  const normalized = normalizeDigits(raw).toLowerCase().trim();
  if (!normalized || normalized === 'غير محدد') {
    return { isValid: false, days: null, text: raw, error: 'DURATION_EMPTY' };
  }

  // Handle common Egyptian colloquial duration expressions
  if (normalized === 'اليوم' || normalized === 'النهاردة' || normalized === 'النهارده' || normalized === 'today' || normalized === 'يوم' || normalized === '1 day') {
    return { isValid: true, days: 1, text: raw, error: null };
  }
  if (normalized === 'يومين' || normalized === 'يومان' || normalized === '2 days') {
    return { isValid: true, days: 2, text: raw, error: null };
  }
  if (normalized === 'أسبوع' || normalized === 'اسبوع' || normalized === 'أسبوع واحد' || normalized === 'اسبوع واحد' || normalized === '1 week' || normalized === 'week') {
    return { isValid: true, days: 7, text: raw, error: null };
  }
  if (normalized === 'أسبوعين' || normalized === 'اسبوعين' || normalized === 'اسبوعان' || normalized === '2 weeks') {
    return { isValid: true, days: 14, text: raw, error: null };
  }
  if (normalized === 'شهر' || normalized === 'شهر واحد' || normalized === '1 month' || normalized === 'month') {
    return { isValid: true, days: 30, text: raw, error: null };
  }

  const match = normalized.match(/^(\d{1,3})\s*(?:days?|day|d|يوم|أيام|ايام|يوما|يوماً)?$/i);
  if (!match) {
    return { isValid: false, days: null, text: raw, error: 'DURATION_INVALID_FORMAT' };
  }

  const days = Number.parseInt(match[1], 10);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { isValid: false, days, text: raw, error: days > 365 ? 'DURATION_ABOVE_MAXIMUM' : 'DURATION_BELOW_MINIMUM' };
  }

  return { isValid: true, days, text: raw, error: null };
}

/**
 * Validates Respiratory Rate (RR in breaths/minute).
 * Physiological range: 5 - 60 breaths/min.
 * @param {any} value
 * @returns {{ isValid: boolean, value: number|null, error: string|null }}
 */
function validateRespiratoryRate(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, value: null, error: null }; // Optional in intake
  }
  const clean = normalizeDigits(String(value).trim());
  const num = Number(clean);
  if (isNaN(num) || !/^-?\d+$/.test(clean)) {
    return { isValid: false, value: null, error: 'RR_INVALID_FORMAT' };
  }
  if (num < 5 || num > 60) {
    return { isValid: false, value: num, error: num > 60 ? 'RR_ABOVE_MAXIMUM' : 'RR_BELOW_MINIMUM' };
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates Body Temperature (in °C).
 * Physiological survival range: 34.0°C - 43.0°C.
 * @param {any} value
 * @returns {{ isValid: boolean, value: number|null, error: string|null }}
 */
function validateTemperature(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, value: null, error: null };
  }
  const clean = normalizeDigits(String(value).trim()).replace(/[°c\s]/gi, '').replace(',', '.');
  const num = Number(clean);
  if (isNaN(num)) {
    return { isValid: false, value: null, error: 'TEMP_INVALID_FORMAT' };
  }
  if (num < 34.0 || num > 43.0) {
    return { isValid: false, value: num, error: num > 43.0 ? 'TEMP_ABOVE_MAXIMUM' : 'TEMP_BELOW_MINIMUM' };
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates Blood Pressure (Systolic & Diastolic in mmHg).
 * Physiological range: SBP 50 - 260 mmHg, DBP 30 - 150 mmHg, SBP > DBP.
 * @param {any} systolic
 * @param {any} diastolic
 * @returns {{ isValid: boolean, systolic: number|null, diastolic: number|null, error: string|null }}
 */
function validateBloodPressure(systolic, diastolic) {
  if (systolic === null || systolic === undefined || diastolic === null || diastolic === undefined) {
    return { isValid: false, systolic: null, diastolic: null, error: 'BP_VALUES_REQUIRED' };
  }
  const sNum = Number(normalizeDigits(String(systolic).trim()));
  const dNum = Number(normalizeDigits(String(diastolic).trim()));

  if (isNaN(sNum) || isNaN(dNum)) {
    return { isValid: false, systolic: null, diastolic: null, error: 'BP_INVALID_FORMAT' };
  }
  if (sNum < 50 || sNum > 260) {
    return { isValid: false, systolic: sNum, diastolic: dNum, error: 'BP_SYSTOLIC_OUT_OF_RANGE' };
  }
  if (dNum < 30 || dNum > 150) {
    return { isValid: false, systolic: sNum, diastolic: dNum, error: 'BP_DIASTOLIC_OUT_OF_RANGE' };
  }
  if (dNum >= sNum) {
    return { isValid: false, systolic: sNum, diastolic: dNum, error: 'BP_DIASTOLIC_GE_SYSTOLIC' };
  }

  return { isValid: true, systolic: sNum, diastolic: dNum, error: null };
}

/**
 * Validates Blood Glucose level (mg/dL).
 * Clinical range: 20 - 1000 mg/dL.
 * @param {any} value
 * @returns {{ isValid: boolean, value: number|null, error: string|null }}
 */
function validateBloodGlucose(value) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, value: null, error: 'GLUCOSE_REQUIRED' };
  }
  const num = Number(normalizeDigits(String(value).trim()));
  if (isNaN(num)) {
    return { isValid: false, value: null, error: 'GLUCOSE_INVALID_FORMAT' };
  }
  if (num < 20 || num > 1000) {
    return { isValid: false, value: num, error: num > 1000 ? 'GLUCOSE_ABOVE_MAXIMUM' : 'GLUCOSE_BELOW_MINIMUM' };
  }
  return { isValid: true, value: num, error: null };
}

/**
 * Validates Height (cm) and Weight (kg).
 * Height: 20 - 260 cm, Weight: 1 - 400 kg.
 * @param {any} heightCm
 * @param {any} weightKg
 * @returns {{ isValid: boolean, height: number|null, weight: number|null, bmi: number|null, error: string|null }}
 */
function validateBiometrics(heightCm, weightKg) {
  const hNum = heightCm !== null && heightCm !== undefined && heightCm !== '' ? Number(heightCm) : null;
  const wNum = weightKg !== null && weightKg !== undefined && weightKg !== '' ? Number(weightKg) : null;

  if (hNum !== null && (isNaN(hNum) || hNum < 20 || hNum > 260)) {
    return { isValid: false, height: hNum, weight: wNum, bmi: null, error: 'HEIGHT_OUT_OF_RANGE' };
  }
  if (wNum !== null && (isNaN(wNum) || wNum < 1 || wNum > 400)) {
    return { isValid: false, height: hNum, weight: wNum, bmi: null, error: 'WEIGHT_OUT_OF_RANGE' };
  }

  let bmi = null;
  if (hNum && wNum) {
    const hM = hNum / 100;
    bmi = Math.round((wNum / (hM * hM)) * 10) / 10;
  }

  return { isValid: true, height: hNum, weight: wNum, bmi, error: null };
}

module.exports = {
  detectSqlInjection,
  sanitizeSqlInput,
  escapeHtml,
  getSafeUrl,
  normalizeDigits,
  validateOxygen,
  validateAge,
  validateDateOfBirth,
  validateDuration,
  validateRespiratoryRate,
  validateTemperature,
  validateBloodPressure,
  validateBloodGlucose,
  validateBiometrics
};
