/**
 * Health Vibe AI - Obesity & Metabolic Health Clinical Service
 * 
 * SPECIFICATION & ARCHITECTURAL FOUNDATION:
 * 1. Disease Module Foundation under "Disease":
 *    - Reuses existing patient profile, assessment, measurement, doctor review,
 *      report, follow-up, permissions, and localization systems.
 * 2. Supported Clinical Information:
 *    - Height, Height Unit, Weight, Weight Unit, Measurement Timestamp, Measurement Source, Provenance.
 *    - Reuses existing valid patient measurements when valid (e.g. historical height for new weight).
 *    - BMI calculated dynamically ONLY when valid height and weight are available.
 *    - Strict guardrail: DO NOT store a fabricated BMI (returns null if inputs are missing/invalid).
 *    - Clearly distinguishes calculated values vs directly measured values.
 *    - Preserves historical measurements longitudinally without overwrite.
 *    - Validates units (cm, m, in; kg, lbs, g) and numeric inputs.
 *    - Handles missing, negative, zero, or implausible values via medically reviewed validation rules.
 * 3. Strict Clinical Guardrails & Medical Review Workflow:
 *    - DO NOT create a diagnosis automatically (NO automated AI/rules diagnosis).
 *    - DO NOT assume that a patient's weight alone represents a medical diagnosis.
 *    - DO NOT use BMI alone to generate an automatic diagnosis.
 *    - Any clinical interpretation must remain within the approved medical-review workflow.
 */

const crypto = require('crypto');

let auditService = null;
try {
  auditService = require('./audit-service');
} catch (e) {
  // Graceful fallback in unit test environments
}

// In-Memory Storage for fast queries and unit tests
const measurementsStore = new Map(); // measurementId -> measurement object
const patientMeasurementsIndex = new Map(); // patientId -> array of measurementIds
const obesityCasesStore = new Map(); // caseId -> case object
const patientCasesIndex = new Map(); // patientId -> array of caseIds
const followupPlansStore = new Map(); // patientId -> followup plan object
const approvedReportsStore = new Map(); // patientId -> certified report object

// Constants & Enums
const MEASUREMENT_SOURCES = {
  PATIENT_SELF_REPORT: 'patient_self_report',
  CLINICAL_SCALE: 'clinical_scale',
  SMART_SCALE: 'smart_scale',
  IN_CLINIC: 'in_clinic',
  MEDICAL_OCR: 'medical_ocr',
  EHR_IMPORT: 'ehr_import'
};

const PHYSICAL_ACTIVITY_LEVELS = {
  SEDENTARY: 'sedentary',
  LIGHT: 'light',
  MODERATE: 'moderate',
  VIGOROUS: 'vigorous'
};

const SLEEP_APNEA_SCREENING = {
  NEGATIVE: 'negative',
  POSITIVE: 'positive',
  UNASSESSED: 'unassessed'
};

const REVIEW_STATUS = {
  UNVERIFIED: 'unverified',
  DOCTOR_VERIFIED: 'doctor_verified',
  APPROVED: 'approved'
};

// Supported Units & Conversion Multipliers
const SUPPORTED_HEIGHT_UNITS = {
  CM: 'cm',
  M: 'm',
  IN: 'in'
};

const SUPPORTED_WEIGHT_UNITS = {
  KG: 'kg',
  LBS: 'lbs',
  G: 'g'
};

const HEIGHT_CONVERSION_TO_CM = {
  cm: 1,
  m: 100,
  in: 2.54,
  inch: 2.54,
  inches: 2.54
};

const WEIGHT_CONVERSION_TO_KG = {
  kg: 1,
  lbs: 0.45359237,
  lb: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  g: 0.001,
  grams: 0.001
};

// Medically Reviewed Physiological Plausibility Limits
const CLINICAL_PLAUSIBILITY_BOUNDS = {
  HEIGHT: {
    MIN_CM: 40,   // Infant/pediatric baseline (40 cm / ~15.7 in)
    MAX_CM: 260   // Max adult human clinical upper limit (260 cm / ~102.4 in)
  },
  WEIGHT: {
    MIN_KG: 15,   // Clinical lower threshold for general obesity tracking (15 kg / ~33 lbs)
    MAX_KG: 450   // Max human clinical bariatric upper limit (450 kg / ~992 lbs)
  }
};

// Explicit Clinical Constants & Guardrail Definitions
const WEIGHT_ALONE_IS_NOT_A_DIAGNOSIS = true;
const BMI_ALONE_IS_NOT_A_DIAGNOSIS = true;
const AUTO_DIAGNOSIS_FORBIDDEN = true;

const CLINICAL_DISCLAIMER_EN = 
  "Weight and Body Mass Index (BMI) are anthropometric measurements, not a medical diagnosis. " +
  "A patient's weight or BMI alone does NOT represent an automatic clinical diagnosis. " +
  "Any clinical diagnosis or interpretation requires an approved medical review by a licensed physician " +
  "considering body composition, fat distribution, metabolic comorbidities, and clinical context.";

const CLINICAL_DISCLAIMER_AR = 
  "الوزن ومؤشر كتلة الجسم (BMI) هما قياسات أنثروبومترية ولا يمثلان تشخيصاً طبياً بمفردهما. " +
  "لا يُعتبر وزن المريض أو مؤشر كتلة جسمه بمفرده تشخيصاً سريرياً تلقائياً. " +
  "يتطلب أي تفسير أو تشخيص طبي اعتماداً سريرياً ومراجعة من طبيب مرخص تشمل تركيبة الجسم وتوزيع الدهون والمضاعفات الأيضية.";

/**
 * Normalizes and validates height unit against medically accepted standards.
 */
function normalizeHeightUnit(rawUnit) {
  if (rawUnit === undefined || rawUnit === null || rawUnit === '') {
    return SUPPORTED_HEIGHT_UNITS.CM;
  }
  const u = String(rawUnit).trim().toLowerCase();
  if (u === 'cm') return SUPPORTED_HEIGHT_UNITS.CM;
  if (u === 'm') return SUPPORTED_HEIGHT_UNITS.M;
  if (u === 'in' || u === 'inch' || u === 'inches') return SUPPORTED_HEIGHT_UNITS.IN;

  const err = new Error(`UNSUPPORTED_HEIGHT_UNIT: Unsupported height unit '${rawUnit}'. Medically validated units: cm, m, in.`);
  err.code = 'UNSUPPORTED_HEIGHT_UNIT';
  err.statusCode = 400;
  throw err;
}

/**
 * Normalizes and validates weight unit against medically accepted standards.
 */
function normalizeWeightUnit(rawUnit) {
  if (rawUnit === undefined || rawUnit === null || rawUnit === '') {
    return SUPPORTED_WEIGHT_UNITS.KG;
  }
  const u = String(rawUnit).trim().toLowerCase();
  if (u === 'kg') return SUPPORTED_WEIGHT_UNITS.KG;
  if (u === 'lbs' || u === 'lb' || u === 'pound' || u === 'pounds') return SUPPORTED_WEIGHT_UNITS.LBS;
  if (u === 'g' || u === 'grams') return SUPPORTED_WEIGHT_UNITS.G;

  const err = new Error(`UNSUPPORTED_WEIGHT_UNIT: Unsupported weight unit '${rawUnit}'. Medically validated units: kg, lbs, g.`);
  err.code = 'UNSUPPORTED_WEIGHT_UNIT';
  err.statusCode = 400;
  throw err;
}

/**
 * Validates numeric inputs and guards against non-numeric, zero, and negative values.
 */
function validateNumericMeasurement(val, fieldName) {
  if (val === undefined || val === null || val === '') {
    return null;
  }

  if (typeof val === 'boolean') {
    const err = new Error(`INVALID_NUMERIC_INPUT: ${fieldName} must be a valid positive number.`);
    err.code = 'INVALID_NUMERIC_INPUT';
    err.statusCode = 400;
    throw err;
  }

  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) {
    const err = new Error(`INVALID_NUMERIC_INPUT: ${fieldName} must be a valid finite number.`);
    err.code = 'INVALID_NUMERIC_INPUT';
    err.statusCode = 400;
    throw err;
  }

  if (num <= 0) {
    const err = new Error(`NEGATIVE_OR_ZERO_INPUT: ${fieldName} (${num}) must be greater than zero.`);
    err.code = 'NEGATIVE_OR_ZERO_INPUT';
    err.statusCode = 400;
    throw err;
  }

  return num;
}

/**
 * Validates anthropometric biometric inputs (height, weight, units).
 * Enforces physiological plausibility bounds and unit conversions.
 */
function validateBiometricInputs({ height, heightUnit, heightCm, weight, weightUnit, weightKg }) {
  // Resolve height value and unit
  const rawHeight = height !== undefined && height !== null && height !== '' ? height : heightCm;
  const rawHeightUnit = heightUnit || (heightCm !== undefined && heightCm !== null ? 'cm' : null);

  // Resolve weight value and unit
  const rawWeight = weight !== undefined && weight !== null && weight !== '' ? weight : weightKg;
  const rawWeightUnit = weightUnit || (weightKg !== undefined && weightKg !== null ? 'kg' : null);

  let validatedHeight = null;
  let normalizedHUnit = null;
  let convertedHeightCm = null;

  if (rawHeight !== undefined && rawHeight !== null && rawHeight !== '') {
    validatedHeight = validateNumericMeasurement(rawHeight, 'Height');
    normalizedHUnit = normalizeHeightUnit(rawHeightUnit);

    // Convert to canonical cm
    const multiplier = HEIGHT_CONVERSION_TO_CM[normalizedHUnit] || 1;
    convertedHeightCm = Math.round(validatedHeight * multiplier * 10) / 10;

    // Medically reviewed physiological bounds check
    if (convertedHeightCm < CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MIN_CM || convertedHeightCm > CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MAX_CM) {
      const err = new Error(
        `IMPLAUSIBLE_HEIGHT: Height of ${validatedHeight} ${normalizedHUnit} (${convertedHeightCm} cm) is outside the medically plausible range (${CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MIN_CM}-${CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MAX_CM} cm).`
      );
      err.code = 'IMPLAUSIBLE_HEIGHT';
      err.statusCode = 400;
      throw err;
    }
  }

  let validatedWeight = null;
  let normalizedWUnit = null;
  let convertedWeightKg = null;

  if (rawWeight !== undefined && rawWeight !== null && rawWeight !== '') {
    validatedWeight = validateNumericMeasurement(rawWeight, 'Weight');
    normalizedWUnit = normalizeWeightUnit(rawWeightUnit);

    // Convert to canonical kg
    const multiplier = WEIGHT_CONVERSION_TO_KG[normalizedWUnit] || 1;
    convertedWeightKg = Math.round(validatedWeight * multiplier * 10) / 10;

    // Medically reviewed physiological bounds check
    if (convertedWeightKg < CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MIN_KG || convertedWeightKg > CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MAX_KG) {
      const err = new Error(
        `IMPLAUSIBLE_WEIGHT: Weight of ${validatedWeight} ${normalizedWUnit} (${convertedWeightKg} kg) is outside the medically plausible range (${CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MIN_KG}-${CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MAX_KG} kg).`
      );
      err.code = 'IMPLAUSIBLE_WEIGHT';
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    height: validatedHeight,
    heightUnit: normalizedHUnit,
    heightCm: convertedHeightCm,
    weight: validatedWeight,
    weightUnit: normalizedWUnit,
    weightKg: convertedWeightKg
  };
}

/**
 * Calculates Body Mass Index (BMI) dynamically.
 * STRICT CLINICAL RULES:
 * 1. Calculates ONLY when valid height and weight are provided.
 * 2. NEVER stores or returns a fabricated BMI (strictly returns null).
 * 3. Does NOT generate an automatic medical diagnosis.
 */
function calculateBmi(heightCm, weightKg) {
  if (heightCm === undefined || heightCm === null || weightKg === undefined || weightKg === null) {
    return null;
  }

  const h = Number(heightCm);
  const w = Number(weightKg);

  if (isNaN(h) || isNaN(w) || !isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) {
    return null;
  }

  if (h < CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MIN_CM || h > CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MAX_CM) {
    return null;
  }

  if (w < CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MIN_KG || w > CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MAX_KG) {
    return null;
  }

  const heightM = h / 100;
  const bmi = w / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/**
 * Searches the patient's chronological history for the most recent valid height.
 */
function getLatestValidPatientHeight(patientId) {
  if (!patientId || !patientMeasurementsIndex.has(patientId)) {
    return null;
  }

  const ids = patientMeasurementsIndex.get(patientId) || [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const m = measurementsStore.get(ids[i]);
    if (m && m.heightCm && m.heightCm >= CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MIN_CM && m.heightCm <= CLINICAL_PLAUSIBILITY_BOUNDS.HEIGHT.MAX_CM) {
      return {
        height: m.height || m.heightCm,
        heightUnit: m.heightUnit || 'cm',
        heightCm: m.heightCm,
        measurementId: m.measurementId,
        measuredAt: m.measuredAt || m.measurementTimestamp
      };
    }
  }
  return null;
}

/**
 * Searches the patient's chronological history for the most recent valid weight.
 */
function getLatestValidPatientWeight(patientId) {
  if (!patientId || !patientMeasurementsIndex.has(patientId)) {
    return null;
  }

  const ids = patientMeasurementsIndex.get(patientId) || [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const m = measurementsStore.get(ids[i]);
    if (m && m.weightKg && m.weightKg >= CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MIN_KG && m.weightKg <= CLINICAL_PLAUSIBILITY_BOUNDS.WEIGHT.MAX_KG) {
      return {
        weight: m.weight || m.weightKg,
        weightUnit: m.weightUnit || 'kg',
        weightKg: m.weightKg,
        measurementId: m.measurementId,
        measuredAt: m.measuredAt || m.measurementTimestamp
      };
    }
  }
  return null;
}

/**
 * Evaluates anthropometric context while strictly maintaining non-diagnostic boundaries.
 * Explicitly flags that weight/BMI is NOT a medical diagnosis.
 */
function evaluateAnthropometricContext({ heightCm, weightKg, bmi }) {
  const effectiveBmi = (bmi !== undefined && bmi !== null) ? bmi : calculateBmi(heightCm, weightKg);

  return {
    isAnthropometricIndex: true,
    isMedicalDiagnosis: false,
    weightAloneIsNotDiagnosis: WEIGHT_ALONE_IS_NOT_A_DIAGNOSIS,
    bmiAloneIsNotDiagnosis: BMI_ALONE_IS_NOT_A_DIAGNOSIS,
    autoDiagnosisForbidden: AUTO_DIAGNOSIS_FORBIDDEN,
    calculatedBmi: effectiveBmi,
    requiresPhysicianEvaluation: true,
    clinicalInterpretationWorkflow: 'approved_medical_review_required',
    disclaimerEn: CLINICAL_DISCLAIMER_EN,
    disclaimerAr: CLINICAL_DISCLAIMER_AR
  };
}

/**
 * Records a structured anthropometric measurement for a patient.
 * 
 * ENFORCES:
 * 1. Stores: height, heightUnit, weight, weightUnit, measurementTimestamp, measurementSource, provenance.
 * 2. Uses existing patient measurements when valid (e.g. historical height for new weight).
 * 3. Calculates BMI dynamically ONLY when valid height and weight are available.
 * 4. Strictly DOES NOT store a fabricated BMI (stores null if incomplete).
 * 5. Clearly identifies calculated values vs directly measured values.
 * 6. Preserves historical measurements longitudinally without overwriting them.
 * 7. Validates units and numeric inputs; handles implausible values via medical rules.
 * 8. Ensures BMI alone is never used to generate an automatic diagnosis.
 */
function recordObesityMeasurement({
  patientId,
  height = null,
  heightUnit = null,
  heightCm = null,
  weight = null,
  weightUnit = null,
  weightKg = null,
  measuredAt = null,
  measurementTimestamp = null,
  measurementSource = MEASUREMENT_SOURCES.PATIENT_SELF_REPORT,
  useExistingMeasurements = true,
  lifestyle = null,
  author = null,
  notes = ''
}) {
  if (!patientId || typeof patientId !== 'string') {
    throw new Error('Valid patientId is required to record anthropometric measurement.');
  }

  // 1. Validate inputs and units
  const validated = validateBiometricInputs({ height, heightUnit, heightCm, weight, weightUnit, weightKg });

  let effectiveHeight = validated.height;
  let effectiveHeightUnit = validated.heightUnit;
  let effectiveHeightCm = validated.heightCm;
  let isHeightReusedFromHistory = false;
  let reusedHeightRecord = null;

  let effectiveWeight = validated.weight;
  let effectiveWeightUnit = validated.weightUnit;
  let effectiveWeightKg = validated.weightKg;
  let isWeightReusedFromHistory = false;
  let reusedWeightRecord = null;

  // 2. Reuse existing valid patient measurements when requested and one dimension is missing
  if (useExistingMeasurements) {
    if (effectiveHeightCm === null && effectiveWeightKg !== null) {
      reusedHeightRecord = getLatestValidPatientHeight(patientId);
      if (reusedHeightRecord) {
        effectiveHeight = reusedHeightRecord.height;
        effectiveHeightUnit = reusedHeightRecord.heightUnit;
        effectiveHeightCm = reusedHeightRecord.heightCm;
        isHeightReusedFromHistory = true;
      }
    } else if (effectiveWeightKg === null && effectiveHeightCm !== null) {
      reusedWeightRecord = getLatestValidPatientWeight(patientId);
      if (reusedWeightRecord) {
        effectiveWeight = reusedWeightRecord.weight;
        effectiveWeightUnit = reusedWeightRecord.weightUnit;
        effectiveWeightKg = reusedWeightRecord.weightKg;
        isWeightReusedFromHistory = true;
      }
    }
  }

  // If both height and weight are completely absent
  if (effectiveHeightCm === null && effectiveWeightKg === null) {
    const err = new Error('MISSING_MEASUREMENT_DATA: At least valid weight or height must be provided.');
    err.code = 'MISSING_MEASUREMENT_DATA';
    err.statusCode = 400;
    throw err;
  }

  // 3. Dynamic BMI Calculation: ONLY when valid height and weight are available.
  // DO NOT STORE A FABRICATED BMI!
  const computedBmi = (effectiveHeightCm !== null && effectiveWeightKg !== null)
    ? calculateBmi(effectiveHeightCm, effectiveWeightKg)
    : null;

  const nowIso = new Date().toISOString();
  const effectiveTimestamp = measurementTimestamp || measuredAt ? new Date(measurementTimestamp || measuredAt).toISOString() : nowIso;
  const measurementId = `meas_ob_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Parse lifestyle factors if collected
  let sanitizedLifestyle = null;
  if (lifestyle && typeof lifestyle === 'object') {
    sanitizedLifestyle = {
      physicalActivity: lifestyle.physicalActivity ? {
        activityLevel: lifestyle.physicalActivity.activityLevel || null,
        minutesPerWeek: Number(lifestyle.physicalActivity.minutesPerWeek) || null,
        notes: lifestyle.physicalActivity.notes || ''
      } : null,
      dietaryHabits: lifestyle.dietaryHabits ? {
        mealsPerDay: Number(lifestyle.dietaryHabits.mealsPerDay) || null,
        nutritionalPattern: lifestyle.dietaryHabits.nutritionalPattern || null,
        highSugarBeverages: Boolean(lifestyle.dietaryHabits.highSugarBeverages),
        notes: lifestyle.dietaryHabits.notes || ''
      } : null,
      sleep: lifestyle.sleep ? {
        hoursPerNight: Number(lifestyle.sleep.hoursPerNight) || null,
        sleepApneaScreening: lifestyle.sleep.sleepApneaScreening || SLEEP_APNEA_SCREENING.UNASSESSED,
        notes: lifestyle.sleep.notes || ''
      } : null,
      recordedAt: lifestyle.recordedAt || effectiveTimestamp
    };
  }

  // 4. Clearly identify directly measured values vs calculated values
  const measuredValues = {
    height: effectiveHeight !== null ? {
      value: effectiveHeight,
      unit: effectiveHeightUnit,
      canonicalValue: effectiveHeightCm,
      canonicalUnit: 'cm',
      isDirectlyMeasured: !isHeightReusedFromHistory,
      isReusedFromHistory: isHeightReusedFromHistory,
      reusedFromMeasurementId: reusedHeightRecord?.measurementId || null,
      source: isHeightReusedFromHistory ? 'existing_patient_record' : (measurementSource || MEASUREMENT_SOURCES.PATIENT_SELF_REPORT)
    } : null,
    weight: effectiveWeight !== null ? {
      value: effectiveWeight,
      unit: effectiveWeightUnit,
      canonicalValue: effectiveWeightKg,
      canonicalUnit: 'kg',
      isDirectlyMeasured: !isWeightReusedFromHistory,
      isReusedFromHistory: isWeightReusedFromHistory,
      reusedFromMeasurementId: reusedWeightRecord?.measurementId || null,
      source: isWeightReusedFromHistory ? 'existing_patient_record' : (measurementSource || MEASUREMENT_SOURCES.PATIENT_SELF_REPORT)
    } : null
  };

  const calculatedValues = {
    bmi: computedBmi !== null ? {
      value: computedBmi,
      unit: 'kg/m²',
      isCalculated: true,
      isFabricated: false,
      formula: 'weight_kg / (height_m ^ 2)',
      derivationMethod: isHeightReusedFromHistory
        ? 'calculated_from_new_weight_and_existing_height'
        : (isWeightReusedFromHistory ? 'calculated_from_new_height_and_existing_weight' : 'calculated_from_height_and_weight'),
      inputsUsed: {
        weightKg: effectiveWeightKg,
        heightM: Math.round((effectiveHeightCm / 100) * 1000) / 1000
      },
      calculatedAt: nowIso
    } : null
  };

  const provenance = {
    source: measurementSource || MEASUREMENT_SOURCES.PATIENT_SELF_REPORT,
    author: author || { uid: patientId, role: 'patient', name: 'Patient' },
    capturedAt: effectiveTimestamp,
    recordedAt: nowIso,
    reviewStatus: REVIEW_STATUS.UNVERIFIED,
    isDoctorVerified: false,
    verificationMethod: 'pending_physician_review',
    isCalculatedBmi: computedBmi !== null,
    isDirectMeasurement: !isHeightReusedFromHistory && !isWeightReusedFromHistory,
    isReusedMeasurement: isHeightReusedFromHistory || isWeightReusedFromHistory
  };

  const measurement = {
    measurementId,
    patientId,
    // Top-level schema elements requested by user
    height: effectiveHeight,
    heightUnit: effectiveHeightUnit,
    heightCm: effectiveHeightCm,
    weight: effectiveWeight,
    weightUnit: effectiveWeightUnit,
    weightKg: effectiveWeightKg,
    bmi: computedBmi,
    measurementTimestamp: effectiveTimestamp,
    measuredAt: effectiveTimestamp,
    measurementSource: measurementSource || MEASUREMENT_SOURCES.PATIENT_SELF_REPORT,
    provenance,
    // Explicit separation of measured vs calculated
    measuredValues,
    calculatedValues,
    lifestyle: sanitizedLifestyle,
    notes: String(notes || '').trim(),
    reviewStatus: REVIEW_STATUS.UNVERIFIED,
    author: provenance.author,
    anthropometricContext: evaluateAnthropometricContext({
      heightCm: effectiveHeightCm,
      weightKg: effectiveWeightKg,
      bmi: computedBmi
    }),
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // Persist measurement immutably
  measurementsStore.set(measurementId, measurement);

  // Append to patient's chronological history index (PRESERVES HISTORY)
  if (!patientMeasurementsIndex.has(patientId)) {
    patientMeasurementsIndex.set(patientId, []);
  }
  patientMeasurementsIndex.get(patientId).push(measurementId);

  // Audit event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      auditService.recordAuditEvent(null, {
        type: 'RECORD_CREATED',
        actor: measurement.author,
        action: 'OBESITY_MEASUREMENT_RECORDED',
        details: {
          measurementId,
          patientId,
          height: effectiveHeight,
          heightUnit: effectiveHeightUnit,
          weight: effectiveWeight,
          weightUnit: effectiveWeightUnit,
          bmi: computedBmi,
          source: measurement.measurementSource,
          isCalculatedBmi: computedBmi !== null
        }
      }).catch(() => {});
    } catch (e) {}
  }

  return measurement;
}

/**
 * Retrieves the complete chronological measurement history for a patient.
 * Preserves all historical observations without deletion or overwrite.
 */
function getPatientMeasurementHistory(patientId) {
  if (!patientId || !patientMeasurementsIndex.has(patientId)) {
    return [];
  }

  const ids = patientMeasurementsIndex.get(patientId) || [];
  const list = ids
    .map(id => measurementsStore.get(id))
    .filter(Boolean)
    .sort((a, b) => new Date(a.measurementTimestamp || a.measuredAt).getTime() - new Date(b.measurementTimestamp || b.measuredAt).getTime());

  return list;
}

/**
 * Creates an Obesity & Metabolic Health case under Disease.
 * Integrates patient profile demographics, historical biometrics, and lifestyle intake.
 * DOES NOT create a diagnosis automatically.
 */
function createObesityCase({
  patientId,
  patientProfile = {},
  initialMeasurement = null,
  lifestyle = null,
  chiefComplaint = '',
  patientNotes = '',
  assignedDoctor = null
}) {
  if (!patientId) {
    throw new Error('patientId is required to create an obesity case.');
  }

  const nowIso = new Date().toISOString();
  const caseId = `case_ob_${patientId}_${Date.now()}`;

  // If initial measurement provided, record it first
  let latestMeasurement = null;
  if (initialMeasurement) {
    latestMeasurement = recordObesityMeasurement({
      patientId,
      height: initialMeasurement.height,
      heightUnit: initialMeasurement.heightUnit,
      heightCm: initialMeasurement.heightCm,
      weight: initialMeasurement.weight,
      weightUnit: initialMeasurement.weightUnit,
      weightKg: initialMeasurement.weightKg,
      measuredAt: initialMeasurement.measuredAt || initialMeasurement.measurementTimestamp,
      measurementTimestamp: initialMeasurement.measurementTimestamp || initialMeasurement.measuredAt,
      measurementSource: initialMeasurement.measurementSource,
      useExistingMeasurements: initialMeasurement.useExistingMeasurements !== false,
      lifestyle: initialMeasurement.lifestyle || lifestyle,
      author: { uid: patientId, role: 'patient', name: patientProfile.name || 'Patient' },
      notes: initialMeasurement.notes
    });
  } else {
    const history = getPatientMeasurementHistory(patientId);
    if (history.length > 0) {
      latestMeasurement = history[history.length - 1];
    }
  }

  const allHistory = getPatientMeasurementHistory(patientId);

  const obesityCase = {
    id: caseId,
    caseId,
    caseType: 'obesity',
    condition: 'obesity',
    specialty: 'obesity',
    patientId,
    patientName: patientProfile.name || patientProfile.displayName || 'Patient',
    patientAge: patientProfile.age || null,
    patientSex: patientProfile.sex || patientProfile.gender || null,
    patientPhone: patientProfile.phone || null,
    chiefComplaint: chiefComplaint || '',
    patientNotes: patientNotes || '',
    latestMeasurement,
    historicalMeasurements: allHistory,
    lifestyle: lifestyle || (latestMeasurement ? latestMeasurement.lifestyle : null),
    status: 'pending',
    clinicalRevision: 1,
    isRevisionStale: false,
    hasNewInfo: false,
    assignedDoctor: assignedDoctor || null,
    // Clinical Boundaries: NO automated diagnosis!
    clinicalDiagnosis: null,
    managementPlan: null,
    doctorNotes: '',
    internalDoctorNotes: '',
    followUpPlan: null,
    approvingDoctor: null,
    approvedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  obesityCasesStore.set(caseId, obesityCase);

  if (!patientCasesIndex.has(patientId)) {
    patientCasesIndex.set(patientId, []);
  }
  patientCasesIndex.get(patientId).push(caseId);

  // Audit event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      auditService.recordAuditEvent(null, {
        type: 'RECORD_CREATED',
        actor: { uid: patientId, role: 'patient' },
        action: 'OBESITY_CASE_CREATED',
        details: { caseId, patientId }
      }).catch(() => {});
    } catch (e) {}
  }

  return obesityCase;
}

/**
 * Retrieves all obesity cases for a patient.
 */
function getPatientObesityCases(patientId) {
  if (!patientId || !patientCasesIndex.has(patientId)) {
    return [];
  }
  const ids = patientCasesIndex.get(patientId) || [];
  return ids.map(id => obesityCasesStore.get(id)).filter(Boolean);
}

/**
 * Retrieves a specific obesity case by ID.
 */
function getObesityCase(caseId) {
  if (!caseId) return null;
  return obesityCasesStore.get(caseId) || null;
}

/**
 * Appends a new measurement to an existing case and updates revision.
 */
function addMeasurementToCase({ caseId, measurementData }) {
  const c = obesityCasesStore.get(caseId);
  if (!c) {
    throw new Error(`Case ${caseId} not found.`);
  }

  const recorded = recordObesityMeasurement({
    ...measurementData,
    patientId: c.patientId
  });

  c.latestMeasurement = recorded;
  c.historicalMeasurements = getPatientMeasurementHistory(c.patientId);
  c.clinicalRevision = (c.clinicalRevision || 1) + 1;
  c.isRevisionStale = true;
  c.hasNewInfo = true;
  c.updatedAt = new Date().toISOString();

  return { case: c, measurement: recorded };
}

/**
 * Performs attending doctor clinical review and approval.
 * 
 * ENFORCES:
 * 1. Attending doctor must be a verified physician with active credentials.
 * 2. Explicit physician diagnosis is MANDATORY (NO automated diagnosis allowed).
 * 3. Rejects stale clinical revisions with HTTP 409 error (STALE_CLINICAL_REVISION).
 * 4. Quarantines internal doctor notes from patient views.
 * 5. Generates certified report and registers approved follow-up plan.
 */
function reviewAndApproveObesityCase({
  caseId,
  reviewingDoctor,
  clinicalDiagnosis,
  managementPlan = '',
  doctorNotes = '',
  internalDoctorNotes = '',
  followUpPlan = null,
  reviewedRevision = null,
  expectedRevision = null
}) {
  const c = obesityCasesStore.get(caseId);
  if (!c) {
    const err = new Error(`Case ${caseId} not found.`);
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // 1. Validate Reviewing Doctor
  if (!reviewingDoctor || !reviewingDoctor.uid) {
    const err = new Error('Authorized reviewing doctor identity is required.');
    err.code = 'DOCTOR_AUTH_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  if (reviewingDoctor.status === 'revoked' || reviewingDoctor.isLicenseExpired === true || reviewingDoctor.licenseStatus === 'revoked') {
    const err = new Error('Doctor credentials are not active or have been revoked.');
    err.code = 'DOCTOR_CREDENTIALS_INVALID';
    err.statusCode = 403;
    throw err;
  }

  // Check assignment if assigned
  if (c.assignedDoctor && c.assignedDoctor.uid && c.assignedDoctor.uid !== reviewingDoctor.uid) {
    const err = new Error(`Doctor ${reviewingDoctor.uid} is not assigned to review case ${caseId}. Assigned to: ${c.assignedDoctor.uid}`);
    err.code = 'DOCTOR_NOT_ASSIGNED';
    err.statusCode = 403;
    throw err;
  }

  // 2. CLINICAL GUARDRAIL: Explicit Physician Diagnosis REQUIRED
  // Strictly prohibits automatic or missing diagnoses.
  const trimmedDiagnosis = String(clinicalDiagnosis || '').trim();
  if (!trimmedDiagnosis || trimmedDiagnosis.length < 3) {
    const err = new Error(
      'PHYSICIAN_DIAGNOSIS_REQUIRED: An explicit clinical diagnosis from the attending physician is required before approving an obesity/metabolic case. Automated or empty diagnoses are strictly prohibited.'
    );
    err.code = 'PHYSICIAN_DIAGNOSIS_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // 3. REVISION GATING: Enforce review of current clinical revision
  const currentCaseRevision = Number(c.clinicalRevision || 1);
  const effectiveReviewedRevision = reviewedRevision !== undefined && reviewedRevision !== null
    ? Number(reviewedRevision)
    : (expectedRevision !== undefined && expectedRevision !== null ? Number(expectedRevision) : null);

  if (effectiveReviewedRevision !== null && effectiveReviewedRevision !== currentCaseRevision) {
    const err = new Error(
      `STALE_CLINICAL_REVISION: Case revision conflict. Case is at revision ${currentCaseRevision}, but approval was requested for revision ${effectiveReviewedRevision}. Please review latest data before approving.`
    );
    err.code = 'STALE_CLINICAL_REVISION';
    err.statusCode = 409;
    err.currentRevision = currentCaseRevision;
    err.attemptedRevision = effectiveReviewedRevision;
    throw err;
  }

  if (c.isRevisionStale && effectiveReviewedRevision === null) {
    const err = new Error(
      `STALE_CLINICAL_REVISION: Case has unreviewed clinical measurements or updates (revision ${currentCaseRevision}). Doctor must acknowledge current revision before approval.`
    );
    err.code = 'STALE_CLINICAL_REVISION';
    err.statusCode = 409;
    err.currentRevision = currentCaseRevision;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const reportRef = `HV-OB-REP-${caseId.slice(-8).toUpperCase()}`;

  // Digital Signature
  const signaturePayload = `${caseId}|${c.patientId}|${reviewingDoctor.uid}|${trimmedDiagnosis}|${nowIso}`;
  const signatureHash = crypto.createHmac('sha256', 'health-vibe-obesity-key').update(signaturePayload).digest('hex');

  // Update Case
  c.status = 'approved';
  c.clinicalDiagnosis = trimmedDiagnosis;
  c.managementPlan = String(managementPlan || '').trim();
  c.doctorNotes = String(doctorNotes || '').trim();
  // Internal doctor notes are strictly quarantined!
  c.internalDoctorNotes = String(internalDoctorNotes || '').trim();
  c.isRevisionStale = false;
  c.hasNewInfo = false;
  c.reviewedRevision = currentCaseRevision;
  c.approvingDoctor = {
    uid: reviewingDoctor.uid,
    name: reviewingDoctor.name || reviewingDoctor.displayName || 'Physician',
    licenseNumber: reviewingDoctor.licenseNumber || 'OB-LIC-VERIFIED',
    specialty: reviewingDoctor.specialty || 'Obesity Medicine / Endocrinology / Internist'
  };
  c.approvedAt = nowIso;
  c.clinicalRevision = currentCaseRevision + 1;
  c.updatedAt = nowIso;

  // Mark latest measurements as APPROVED
  const patientHistory = getPatientMeasurementHistory(c.patientId);
  patientHistory.forEach(m => {
    m.reviewStatus = REVIEW_STATUS.APPROVED;
    m.provenance.reviewStatus = REVIEW_STATUS.APPROVED;
    m.provenance.isDoctorVerified = true;
    m.updatedAt = nowIso;
  });

  // Approved Follow-Up Plan if provided
  let approvedFollowUp = null;
  if (followUpPlan) {
    approvedFollowUp = prescribeObesityFollowUp({
      caseId,
      patientId: c.patientId,
      prescribingDoctor: reviewingDoctor,
      targetFollowUpDate: followUpPlan.targetFollowUpDate || null,
      intervalWeeks: followUpPlan.intervalWeeks || 4,
      repeatBiometricsSchedule: followUpPlan.repeatBiometricsSchedule || 'monthly',
      nutritionConsultation: Boolean(followUpPlan.nutritionConsultation),
      lifestyleGoals: followUpPlan.lifestyleGoals || '',
      redFlagPrecautions: followUpPlan.redFlagPrecautions || [],
      instructions: followUpPlan.instructions || ''
    });
    c.followUpPlan = approvedFollowUp;
  }

  // Generate Approved Certified Report Snapshot (EXCLUDES internalDoctorNotes)
  const certifiedReport = {
    reportId: `rep_${reportRef}`,
    reportRef,
    caseId,
    patientId: c.patientId,
    patientName: c.patientName,
    condition: 'obesity',
    specialty: 'Obesity & Metabolic Health',
    clinicalDiagnosis: c.clinicalDiagnosis,
    managementPlan: c.managementPlan,
    doctorNotes: c.doctorNotes,
    // CRITICAL: internalDoctorNotes are strictly quarantined and EXCLUDED from certified report!
    latestBiometrics: c.latestMeasurement ? {
      height: c.latestMeasurement.height,
      heightUnit: c.latestMeasurement.heightUnit,
      heightCm: c.latestMeasurement.heightCm,
      weight: c.latestMeasurement.weight,
      weightUnit: c.latestMeasurement.weightUnit,
      weightKg: c.latestMeasurement.weightKg,
      bmi: c.latestMeasurement.bmi,
      measuredValues: c.latestMeasurement.measuredValues,
      calculatedValues: c.latestMeasurement.calculatedValues,
      measuredAt: c.latestMeasurement.measuredAt || c.latestMeasurement.measurementTimestamp,
      measurementTimestamp: c.latestMeasurement.measurementTimestamp || c.latestMeasurement.measuredAt,
      source: c.latestMeasurement.measurementSource
    } : null,
    historicalMeasurementsCount: patientHistory.length,
    lifestyleSummary: c.lifestyle,
    approvedFollowUp: c.followUpPlan,
    approvingDoctor: c.approvingDoctor,
    digitalSignature: {
      algorithm: 'HMAC-SHA256',
      signatureHash,
      signedAt: nowIso
    },
    certifiedAt: nowIso,
    verificationUrl: `/api/reports/verify/${reportRef}`
  };

  approvedReportsStore.set(c.patientId, certifiedReport);

  // Audit event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      auditService.recordAuditEvent(null, {
        type: 'CASE_APPROVED',
        actor: c.approvingDoctor,
        action: 'OBESITY_CASE_APPROVED',
        details: { caseId, reportRef, diagnosis: trimmedDiagnosis }
      }).catch(() => {});
    } catch (e) {}
  }

  return {
    success: true,
    case: c,
    report: certifiedReport,
    followUp: approvedFollowUp
  };
}

/**
 * Prescribes a formal approved follow-up protocol for weight and metabolic health.
 */
function prescribeObesityFollowUp({
  caseId,
  patientId,
  prescribingDoctor,
  targetFollowUpDate = null,
  intervalWeeks = 4,
  repeatBiometricsSchedule = 'monthly',
  nutritionConsultation = false,
  lifestyleGoals = '',
  redFlagPrecautions = [],
  instructions = ''
}) {
  const nowIso = new Date().toISOString();
  const protocolId = `proto_ob_${patientId}_${Date.now()}`;

  const protocol = {
    protocolId,
    caseId: caseId || null,
    patientId,
    prescribingDoctor: {
      uid: prescribingDoctor.uid,
      name: prescribingDoctor.name || prescribingDoctor.displayName || 'Physician',
      licenseNumber: prescribingDoctor.licenseNumber || 'LIC-VERIFIED',
      specialty: prescribingDoctor.specialty || 'Obesity Medicine'
    },
    targetFollowUpDate,
    intervalWeeks: Number(intervalWeeks) || 4,
    repeatBiometricsSchedule,
    nutritionConsultation: Boolean(nutritionConsultation),
    lifestyleGoals: String(lifestyleGoals || '').trim(),
    redFlagPrecautions: Array.isArray(redFlagPrecautions) ? redFlagPrecautions : [
      'Rapid unexplained weight gain or loss',
      'Severe dizziness, syncope, or dehydration signs',
      'Acute gastrointestinal distress with prescribed pharmacotherapy'
    ],
    instructions: String(instructions || '').trim(),
    status: 'ACTIVE_APPROVED',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  followupPlansStore.set(patientId, protocol);

  return protocol;
}

/**
 * Retrieves the approved follow-up plan for a patient.
 */
function getPatientFollowUp(patientId) {
  if (!patientId) return null;
  return followupPlansStore.get(patientId) || null;
}

/**
 * Retrieves the approved certified report for a patient.
 */
function getPatientApprovedReport(patientId) {
  if (!patientId) return null;
  return approvedReportsStore.get(patientId) || null;
}

/**
 * Clears stores for clean unit test executions.
 */
function resetObesityStoreForTesting() {
  measurementsStore.clear();
  patientMeasurementsIndex.clear();
  obesityCasesStore.clear();
  patientCasesIndex.clear();
  followupPlansStore.clear();
  approvedReportsStore.clear();
}

module.exports = {
  MEASUREMENT_SOURCES,
  PHYSICAL_ACTIVITY_LEVELS,
  SLEEP_APNEA_SCREENING,
  REVIEW_STATUS,
  SUPPORTED_HEIGHT_UNITS,
  SUPPORTED_WEIGHT_UNITS,
  HEIGHT_CONVERSION_TO_CM,
  WEIGHT_CONVERSION_TO_KG,
  CLINICAL_PLAUSIBILITY_BOUNDS,
  WEIGHT_ALONE_IS_NOT_A_DIAGNOSIS,
  BMI_ALONE_IS_NOT_A_DIAGNOSIS,
  AUTO_DIAGNOSIS_FORBIDDEN,
  CLINICAL_DISCLAIMER_EN,
  CLINICAL_DISCLAIMER_AR,
  normalizeHeightUnit,
  normalizeWeightUnit,
  validateNumericMeasurement,
  validateBiometricInputs,
  calculateBmi,
  getLatestValidPatientHeight,
  getLatestValidPatientWeight,
  evaluateAnthropometricContext,
  recordObesityMeasurement,
  getPatientMeasurementHistory,
  createObesityCase,
  getPatientObesityCases,
  getObesityCase,
  addMeasurementToCase,
  reviewAndApproveObesityCase,
  prescribeObesityFollowUp,
  getPatientFollowUp,
  getPatientApprovedReport,
  resetObesityStoreForTesting
};
