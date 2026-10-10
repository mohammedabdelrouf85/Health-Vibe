/**
 * Health Vibe AI - Chronic Hypertension & Blood Pressure Clinical Module
 *
 * SPECIFICATION & CLINICAL GUIDELINES:
 * 1. Diagnostic Classifications (AHA/ACC 2017 & Egyptian Hypertension Society Guidelines):
 *    - HYPOTENSION: Systolic < 90 OR Diastolic < 60 mmHg
 *    - NORMAL: Systolic < 120 AND Diastolic < 80 mmHg
 *    - ELEVATED: Systolic 120-129 AND Diastolic < 80 mmHg
 *    - STAGE_1_HYPERTENSION: Systolic 130-139 OR Diastolic 80-89 mmHg
 *    - STAGE_2_HYPERTENSION: Systolic 140-179 OR Diastolic 90-119 mmHg
 *    - HYPERTENSIVE_CRISIS: Systolic >= 180 OR Diastolic >= 120 mmHg
 *
 * 2. Inputs & Measurement Sources:
 *    - Validated upper-arm oscillometric bluetooth cuffs, clinic readings, manual logs, OCR.
 *    - Context: arm, resting posture, cuff size, timing (morning/evening), symptom flags.
 *
 * 3. Clinical Alerts:
 *    - Crisis emergency dispatch (>= 180 or >= 120 mmHg) with red-flag symptom screening.
 *    - Stage 2 uncontrolled notification to attending physician.
 *
 * 4. Human Review & Non-Diagnostic Boundary:
 *    - AI provides longitudinal analytics, MAP calculations, and triage categorization.
 *    - Formal diagnosis, medication titration, and certified reports require verified physician sign-off.
 */

const crypto = require('crypto');

let clinicalInfoExchangeService = null;
try {
  clinicalInfoExchangeService = require('./clinical-info-exchange-service');
} catch (e) {
  // Graceful fallback if unavailable in isolated unit environments
}

// In-Memory Storage for High-Speed & Unit Test Execution
const readingsStore = new Map(); // readingId -> reading object
const patientReadingsIndex = new Map(); // patientId -> array of readingIds
const caseReadingsIndex = new Map(); // caseId -> array of readingIds
const followupPlansStore = new Map(); // patientId -> followup plan
const certifiedReportsStore = new Map(); // reportId -> report object

// Constants & Enums
const BP_STAGES = {
  HYPOTENSION: 'HYPOTENSION',
  NORMAL: 'NORMAL',
  ELEVATED: 'ELEVATED',
  STAGE_1: 'STAGE_1_HYPERTENSION',
  STAGE_2: 'STAGE_2_HYPERTENSION',
  CRISIS: 'HYPERTENSIVE_CRISIS'
};

const MEASUREMENT_SOURCES = {
  BLUETOOTH_DEVICE: 'bluetooth_device',
  MANUAL_PATIENT_LOG: 'manual_patient_log',
  CLINIC_READING: 'clinic_reading',
  MEDICAL_OCR: 'medical_ocr',
  PATIENT_SELF_REPORT: 'patient_self_report',
  AUTOMATED_MONITOR: 'automated_monitor'
};

const ALERT_SEVERITIES = {
  EMERGENCY: 'emergency',
  URGENT: 'urgent',
  MODERATE: 'moderate',
  NORMAL: 'normal'
};

const PREGNANCY_STAGES = {
  NONE: 'none',
  FIRST_TRIMESTER: 'first_trimester',
  SECOND_TRIMESTER: 'second_trimester',
  THIRD_TRIMESTER: 'third_trimester',
  POSTPARTUM: 'postpartum'
};

const AGE_GROUPS = {
  PEDIATRIC: 'pediatric', // < 18 yrs
  ADULT: 'adult',         // 18 - 65 yrs
  GERIATRIC: 'geriatric'  // > 65 yrs
};

const SPECIALTY_READINESS = {
  HYPERTENSION: {
    specialtyId: 'hypertension',
    nameEn: 'Hypertension & Vascular Health',
    nameAr: 'ضغط الدم وصحة الأوعية الدموية',
    status: 'VERIFIED_ACTIVE',
    verifiedSpecialist: 'Cardiologist / Internist',
    launchReadiness: true,
    testCoveragePercent: 100
  },
  DIABETES: {
    specialtyId: 'diabetes',
    nameEn: 'Diabetes Mellitus & Glycemic Management',
    nameAr: 'السكري والتحكم في نسبة الجلوكوز',
    status: 'UNDER_SPECIALIST_REVIEW',
    verifiedSpecialist: 'Endocrinologist / Diabetologist',
    launchReadiness: false,
    reviewNotes: 'Specification drafted in SPECIALTY_CLINICAL_REQUIREMENTS_AND_ACCEPTANCE_CRITERIA.md; awaiting specialist verification.'
  },
  CARDIAC_RISK: {
    specialtyId: 'cardiac_risk',
    nameEn: 'Cardiovascular Risk & ASCVD Stratification',
    nameAr: 'مخاطر القلب والشرايين التاجية',
    status: 'UNDER_SPECIALIST_REVIEW',
    verifiedSpecialist: 'Cardiologist',
    launchReadiness: false,
    reviewNotes: 'Specification drafted; awaiting cardiology committee review.'
  },
  WEIGHT_METABOLIC: {
    specialtyId: 'weight_metabolic',
    nameEn: 'Weight & Metabolic Health',
    nameAr: 'إدارة الوزن والتمثيل الغذائي',
    status: 'UNDER_SPECIALIST_REVIEW',
    verifiedSpecialist: 'Obesity Medicine Physician',
    launchReadiness: false,
    reviewNotes: 'Specification drafted; awaiting metabolic board review.'
  },
  CLINICAL_NUTRITION: {
    specialtyId: 'clinical_nutrition',
    nameEn: 'Clinical Nutrition & Dietetics',
    nameAr: 'التغذية العلاجية والسريرية',
    status: 'UNDER_SPECIALIST_REVIEW',
    verifiedSpecialist: 'Registered Clinical Dietitian',
    launchReadiness: false,
    reviewNotes: 'Specification drafted; awaiting clinical nutrition review.'
  }
};

// =============================================================================
// 1. PHYSIOLOGICAL VALIDATION & CLASSIFICATION
// =============================================================================

/**
 * Normalizes Arabic-Indic (٠-٩) and Eastern-Arabic-Indic (۰-۹) digits to standard digits (0-9).
 * Also normalizes Arabic decimal separator (٫) and comma (,) to standard dot (.).
 */
function normalizeArabicIndicDigits(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u066B,]/g, '.');
}

/**
 * Strict parser for blood pressure components (systolic, diastolic, pulse).
 * Does NOT silently convert invalid input into a valid number.
 * Handles: empty, invalid text, negative values, unsupported values, Arabic numerals,
 * decimal input where applicable, and unknown measurements.
 * Never invents a blood-pressure measurement.
 */
function parseStrictBpComponent(value, fieldName = 'Blood pressure', { allowDecimals = true, isOptional = false } = {}) {
  // 1. Check for boolean or non-primitive types
  if (typeof value === 'boolean') {
    const err = new Error(`Unsupported value for ${fieldName}: boolean (${value}) is not allowed.`);
    err.code = 'UNSUPPORTED_MEASUREMENT_VALUE';
    throw err;
  }
  if (typeof value === 'object' && value !== null) {
    if (value.isUnknown || value.unknown) {
      const err = new Error(`Unknown measurement for ${fieldName}: measurement is unknown. Never invent a blood-pressure measurement.`);
      err.code = 'UNKNOWN_MEASUREMENT';
      throw err;
    }
    const err = new Error(`Unsupported value for ${fieldName}: object type is not allowed.`);
    err.code = 'UNSUPPORTED_MEASUREMENT_VALUE';
    throw err;
  }

  // 2. Check for empty or missing values
  if (value === null || value === undefined) {
    if (isOptional) return null;
    const err = new Error(`Empty value for ${fieldName}: value is required and cannot be empty.`);
    err.code = 'EMPTY_MEASUREMENT_VALUE';
    throw err;
  }

  const rawStr = String(value).trim();
  if (rawStr === '') {
    if (isOptional) return null;
    const err = new Error(`Empty value for ${fieldName}: empty input is not permitted.`);
    err.code = 'EMPTY_MEASUREMENT_VALUE';
    throw err;
  }

  // 3. Check for unknown measurements
  const lowerStr = rawStr.toLowerCase();
  if (/^(unknown|غير معروف|غير معلوم|لا أعرف|لا اعلم|not-provided|unspecified|none)$/i.test(lowerStr)) {
    const err = new Error(`Unknown measurement: ${fieldName} is recorded as unknown. Never invent a blood-pressure measurement.`);
    err.code = 'UNKNOWN_MEASUREMENT';
    throw err;
  }

  // 4. Normalize Arabic numerals & Arabic decimal separators
  const normalized = normalizeArabicIndicDigits(rawStr).trim();

  // 5. Check for negative values
  if (normalized.startsWith('-') || /-\d/.test(normalized)) {
    const err = new Error(`Negative value: ${fieldName} cannot be negative (${rawStr}). Negative blood pressure values are physiologically impossible.`);
    err.code = 'NEGATIVE_MEASUREMENT_VALUE';
    throw err;
  }

  // 6. Strict regex check to prevent silent conversion of invalid text like "120abc", "120/80", "120 mmHg", "high"
  const pattern = allowDecimals ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
  if (!pattern.test(normalized)) {
    const err = new Error(`Invalid text: ${fieldName} input '${rawStr}' contains non-numeric text or unsupported formatting. Do not silently convert invalid input into a valid number.`);
    err.code = 'INVALID_MEASUREMENT_TEXT';
    throw err;
  }

  // 7. Parse number and check finite
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || isNaN(parsed)) {
    const err = new Error(`Unsupported value: ${fieldName} input '${rawStr}' cannot be evaluated to a finite number.`);
    err.code = 'UNSUPPORTED_MEASUREMENT_VALUE';
    throw err;
  }

  return allowDecimals ? Math.round(parsed * 10) / 10 : Math.round(parsed);
}

const ALLOWED_BP_UNITS = ['mmhg', 'mm hg'];

function validateBpUnit(unit) {
  if (unit === null || unit === undefined || String(unit).trim() === '') {
    // Missing unit is safely normalized to canonical 'mmHg'
    return 'mmHg';
  }
  const clean = String(unit).trim();
  if (!ALLOWED_BP_UNITS.includes(clean.toLowerCase())) {
    const err = new Error(`Invalid unit '${clean}' for blood pressure. Allowed unit is 'mmHg'.`);
    err.code = 'INVALID_MEASUREMENT_UNIT';
    throw err;
  }
  return 'mmHg';
}

function validateBpMeasurementTime(dateTime) {
  if (!dateTime) {
    return new Date().toISOString();
  }
  const d = new Date(dateTime);
  const timeMs = d.getTime();
  if (isNaN(timeMs)) {
    const err = new Error(`Malformed measurement timestamp: '${dateTime}'.`);
    err.code = 'INVALID_MEASUREMENT_TIME';
    throw err;
  }
  // Tolerate up to 60 seconds of clock skew
  if (timeMs > Date.now() + 60000) {
    const err = new Error(`Measurement date/time cannot be in the future (${dateTime}).`);
    err.code = 'FUTURE_MEASUREMENT_TIMESTAMP';
    throw err;
  }
  return d.toISOString();
}

function validateBpInputs({ systolic, diastolic, pulse, unit }) {
  const sys = parseStrictBpComponent(systolic, 'Systolic blood pressure', { allowDecimals: true, isOptional: false });
  const dia = parseStrictBpComponent(diastolic, 'Diastolic blood pressure', { allowDecimals: true, isOptional: false });

  if (sys < 60 || sys > 260) {
    throw new Error(`Invalid systolic blood pressure: ${sys}. Valid physiological range is 60 - 260 mmHg.`);
  }
  if (dia < 40 || dia > 160) {
    throw new Error(`Invalid diastolic blood pressure: ${dia}. Valid physiological range is 40 - 160 mmHg.`);
  }
  if (sys <= dia) {
    throw new Error(`Physiological error: Systolic BP (${sys}) must be greater than Diastolic BP (${dia}).`);
  }

  let pul = null;
  if (pulse !== undefined && pulse !== null && String(pulse).trim() !== '') {
    pul = parseStrictBpComponent(pulse, 'Resting pulse', { allowDecimals: false, isOptional: false });
    if (pul < 30 || pul > 220) {
      throw new Error(`Invalid resting pulse: ${pul}. Valid physiological range is 30 - 220 bpm.`);
    }
  }

  const validUnit = validateBpUnit(unit);

  return { sys, dia, pul, unit: validUnit };
}

/**
 * Classifies blood pressure reading according to ACC/AHA guidelines
 */
function classifyBloodPressure(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return {
      stage: BP_STAGES.CRISIS,
      labelEn: 'Hypertensive Crisis',
      labelAr: 'أزمة ارتفاع ضغط دم حادة',
      severity: ALERT_SEVERITIES.EMERGENCY,
      requiresEmergencySafeguard: true
    };
  }
  if (sys >= 140 || dia >= 90) {
    return {
      stage: BP_STAGES.STAGE_2,
      labelEn: 'Stage 2 Hypertension',
      labelAr: 'ارتفاع ضغط دم - مرحلة ثانية',
      severity: ALERT_SEVERITIES.URGENT,
      requiresEmergencySafeguard: false
    };
  }
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
    return {
      stage: BP_STAGES.STAGE_1,
      labelEn: 'Stage 1 Hypertension',
      labelAr: 'ارتفاع ضغط دم - مرحلة أولى',
      severity: ALERT_SEVERITIES.MODERATE,
      requiresEmergencySafeguard: false
    };
  }
  if (sys >= 120 && sys <= 129 && dia < 80) {
    return {
      stage: BP_STAGES.ELEVATED,
      labelEn: 'Elevated Blood Pressure',
      labelAr: 'ضغط دم مرتفع نسبياً (ما قبل الضغط)',
      severity: ALERT_SEVERITIES.NORMAL,
      requiresEmergencySafeguard: false
    };
  }
  if (sys < 90 || dia < 60) {
    return {
      stage: BP_STAGES.HYPOTENSION,
      labelEn: 'Hypotension (Low BP)',
      labelAr: 'هبوط ضغط الدم',
      severity: ALERT_SEVERITIES.MODERATE,
      requiresEmergencySafeguard: false
    };
  }
  return {
    stage: BP_STAGES.NORMAL,
    labelEn: 'Normal Blood Pressure',
    labelAr: 'ضغط دم طبيعي ومثالي',
    severity: ALERT_SEVERITIES.NORMAL,
    requiresEmergencySafeguard: false
  };
}

/**
 * Calculates Mean Arterial Pressure (MAP) and Pulse Pressure
 */
function calculateHemodynamicMetrics(sys, dia) {
  const map = ((2 * dia) + sys) / 3;
  const pulsePressure = sys - dia;
  return {
    map: Math.round(map * 10) / 10,
    pulsePressure
  };
}

/**
 * Evaluates Red-Flag Symptoms for Hypertensive Emergency, Pre-eclampsia, and Age-group specific flags
 */
function evaluateHypertensionAlerts({
  sys,
  dia,
  pul,
  symptoms = [],
  classification,
  pregnancyStage = PREGNANCY_STAGES.NONE,
  ageGroup = AGE_GROUPS.ADULT
}) {
  const alerts = [];
  const normalizedSymptoms = symptoms.map(s => String(s).toLowerCase().trim());
  const hasChestPain = normalizedSymptoms.includes('chest_pain') || normalizedSymptoms.includes('ألم الصدر');
  const hasDyspnea = normalizedSymptoms.includes('dyspnea') || normalizedSymptoms.includes('ضيق تنفس');
  const hasVisionChanges = normalizedSymptoms.includes('blurred_vision') || normalizedSymptoms.includes('زغللة بالعين') || normalizedSymptoms.includes('اضطراب الرؤية');
  const hasHeadache = normalizedSymptoms.includes('headache') || normalizedSymptoms.includes('صداع شديد') || normalizedSymptoms.includes('صداع');
  const hasEpigastricPain = normalizedSymptoms.includes('epigastric_pain') || normalizedSymptoms.includes('ألم فم المعدة') || normalizedSymptoms.includes('ألم بالمعدة');
  const hasEdema = normalizedSymptoms.includes('edema') || normalizedSymptoms.includes('تورم') || normalizedSymptoms.includes('تورم مفاجئ بالوجه أو اليدين');

  const isPregnantOrPostpartum = pregnancyStage && pregnancyStage !== PREGNANCY_STAGES.NONE;

  // 1. PREGNANCY & PRE-ECLAMPSIA OBSTETRIC SAFETY RULES
  if (isPregnantOrPostpartum) {
    const isCriticalPreEclampsiaThreshold = (sys >= 160 || dia >= 110) ||
      ((sys >= 140 || dia >= 90) && (hasHeadache || hasVisionChanges || hasEpigastricPain || hasEdema));

    if (isCriticalPreEclampsiaThreshold) {
      alerts.push({
        type: 'PREECLAMPSIA_CRITICAL_EMERGENCY',
        severity: ALERT_SEVERITIES.EMERGENCY,
        titleEn: 'CRITICAL PRE-ECLAMPSIA / OBSTETRIC CRISIS ALERT',
        titleAr: 'طوارئ تسمم حمل حرجة (خطر على الأم والجنين)',
        messageEn: 'Blood pressure in pregnancy/postpartum meets severe pre-eclampsia criteria (>=160/110 mmHg or >=140/90 mmHg with severe headache, visual disturbance, epigastric pain, or acute edema). Immediate emergency obstetric triage / 123/997 hotline required.',
        messageAr: 'تجاوز ضغط الدم أثناء الحمل أو النفاس عتبة تسمم الحمل الحرج (>=160/110 أو >=140/90 مع أعراض عصبية أو معوية أو تورم مفاجئ). يتطلب توجهاً فورياً لطوارئ التوليد أو الاتصال بالإسعاف (123 / 997).',
        emergencyAction: 'SEEK_IMMEDIATE_EMERGENCY_CARE',
        hotlines: ['123 (Egypt)', '997 (Saudi Arabia)', '911 (International)']
      });
    } else if (sys >= 140 || dia >= 90) {
      alerts.push({
        type: 'GESTATIONAL_HYPERTENSION_URGENT',
        severity: ALERT_SEVERITIES.URGENT,
        titleEn: 'Gestational Hypertension Alert (Obstetric Review Required)',
        titleAr: 'تنبيه ارتفاع ضغط الدم أثناء الحمل (مراجعة عاجلة لأخصائي النساء)',
        messageEn: 'Blood pressure >= 140/90 mmHg during pregnancy requires urgent maternal-fetal specialist assessment and urinalysis for proteinuria.',
        messageAr: 'قراءة ضغط الدم >= 140/90 أثناء الحمل تتطلب مراجعة عاجلة لأخصائي النساء والتوليد وفحص زلال البول.'
      });
    }
  }

  // 2. STANDARD HYPERTENSION STAGE ALERTS (Do not trigger general crisis if already flagged as obstetric emergency)
  if (classification.stage === BP_STAGES.CRISIS && !alerts.some(a => a.type === 'PREECLAMPSIA_CRITICAL_EMERGENCY')) {
    const hasTargetOrganDamageSymptoms = hasChestPain || hasDyspnea || hasVisionChanges || hasHeadache;
    alerts.push({
      type: 'HYPERTENSIVE_CRISIS_ALERT',
      severity: ALERT_SEVERITIES.EMERGENCY,
      titleEn: hasTargetOrganDamageSymptoms ? 'CRITICAL HYPERTENSIVE EMERGENCY (Organ Damage Risk)' : 'HYPERTENSIVE CRISIS ALERT',
      titleAr: hasTargetOrganDamageSymptoms ? 'طوارئ ضغط دم حرجة (احتمال تأثر الأعضاء الحيوية)' : 'تنبيه أزمة ارتفاع ضغط دم حادة',
      messageEn: 'Blood pressure exceeds 180/120 mmHg. Immediate medical emergency care or emergency hotline (123/997) required.',
      messageAr: 'تجاوز ضغط الدم حاجز 180/120 مم زئبق. يرجى التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف (123 / 997).',
      emergencyAction: 'SEEK_IMMEDIATE_EMERGENCY_CARE',
      hotlines: ['123 (Egypt)', '997 (Saudi Arabia)', '911 (International)']
    });
  } else if (classification.stage === BP_STAGES.STAGE_2 && !isPregnantOrPostpartum) {
    alerts.push({
      type: 'STAGE_2_UNCONTROLLED',
      severity: ALERT_SEVERITIES.URGENT,
      titleEn: 'Stage 2 Uncontrolled Blood Pressure',
      titleAr: 'ضغط دم مرتفع من المرحلة الثانية غير منضبط',
      messageEn: 'Reading indicates Stage 2 hypertension. Priority review by attending physician recommended.',
      messageAr: 'القراءة تشير لضغط دم مرتفع من المرحلة الثانية. يُنصح بمراجعة الطبيب المعالج لإعادة تقييم العلاج.'
    });
  } else if (classification.stage === BP_STAGES.HYPOTENSION && normalizedSymptoms.includes('dizziness')) {
    alerts.push({
      type: 'SYMPTOMATIC_HYPOTENSION',
      severity: ALERT_SEVERITIES.MODERATE,
      titleEn: 'Symptomatic Low Blood Pressure',
      titleAr: 'انخفاض ضغط الدم المصحوب بأعراض دوخة',
      messageEn: 'Blood pressure is below 90/60 mmHg with reported dizziness. Hydrate and sit or lie down safely.',
      messageAr: 'ضغط الدم أقل من 90/60 مم زئبق مع دوخة. يرجى شرب السوائل والاستلقاء بأمان.'
    });
  }

  // 3. PEDIATRIC SPECIFIC SAFEGUARDS
  if (ageGroup === AGE_GROUPS.PEDIATRIC) {
    alerts.push({
      type: 'PEDIATRIC_BP_SPECIALIST_REQUIRED',
      severity: ALERT_SEVERITIES.URGENT,
      titleEn: 'Pediatric Blood Pressure Specialty Assessment Required',
      titleAr: 'تقييم ضغط الدم لدى الأطفال بواسطة استشاري مختص',
      messageEn: 'Pediatric blood pressure requires percentile-based interpretation against height/age tables. Consultation with a pediatric specialist required.',
      messageAr: 'يتطلب ضغط دم الأطفال تقييماً بالمئينات حسب الطول والعمر بواسطة استشاري أطفال.'
    });
  }

  // 4. TACHYCARDIA / BRADYCARDIA PULSE ALERTS
  if (pul >= 120) {
    alerts.push({
      type: 'TACHYCARDIA_ALERT',
      severity: ALERT_SEVERITIES.MODERATE,
      titleEn: 'Elevated Resting Pulse (Tachycardia)',
      titleAr: 'تسارع ملحوظ في نبضات القلب',
      messageEn: `Resting pulse is ${pul} bpm.`,
      messageAr: `نبض القلب أثناء الراحة يبلغ ${pul} نبضة/دقيقة.`
    });
  } else if (pul <= 45) {
    alerts.push({
      type: 'BRADYCARDIA_ALERT',
      severity: ALERT_SEVERITIES.MODERATE,
      titleEn: 'Low Resting Pulse (Bradycardia)',
      titleAr: 'تباطؤ ملحوظ في نبضات القلب',
      messageEn: `Resting pulse is ${pul} bpm.`,
      messageAr: `نبض القلب أثناء الراحة يبلغ ${pul} نبضة/دقيقة.`
    });
  }

  return alerts;
}

// =============================================================================
// 2. READINGS INGESTION & TRACKING
// =============================================================================

async function recordBloodPressureReading({
  patientId,
  caseId = null,
  patientName,
  clinicId,
  systolic,
  diastolic,
  pulse,
  unit = 'mmHg',
  measuredAt,
  measurementTime,
  dateTime,
  measurementSource = MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
  arm = 'left',
  posture = 'seated_rested',
  cuffSize = 'standard',
  timing = 'morning',
  activity = 'resting',
  location,
  bodyPosition,
  mealTiming,
  context = {},
  symptoms = [],
  medicationTaken = true,
  patientNotes = '',
  recordedByUid,
  author = null,
  provenance = null,
  pregnancyStage = PREGNANCY_STAGES.NONE,
  ageGroup = AGE_GROUPS.ADULT,
  specialtyConsent = null,
  attachedFiles = [],
  linkedAppointmentId = null,
  authorizedUser = null
}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    throw err;
  }

  // 1. Trusted Server-Side Authorization Check
  if (authorizedUser) {
    const isDoctor = authorizedUser.role === 'doctor';
    const isAdmin = authorizedUser.role === 'clinic_admin' || authorizedUser.role === 'super_admin' || authorizedUser.role === 'owner';
    const isSelf = authorizedUser.uid === patientId;

    if (!isSelf && !isDoctor && !isAdmin) {
      const err = new Error('Access denied: You are not authorized to record measurements for this patient.');
      err.code = 'ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }

    if (isDoctor) {
      if (authorizedUser.status && authorizedUser.status !== 'approved') {
        const err = new Error('Doctor credentials unapproved.');
        err.code = 'UNAPPROVED_DOCTOR';
        err.statusCode = 403;
        throw err;
      }
      if (authorizedUser.isLicenseExpired || authorizedUser.licenseStatus === 'revoked') {
        const err = new Error('Doctor license is expired or revoked.');
        err.code = 'INVALID_DOCTOR_LICENSE';
        err.statusCode = 403;
        throw err;
      }
    }
  }

  // 2. Strict Input Validation (Never silently coerce, handle Arabic, empty, invalid text, negative, decimal, unit, unknown)
  const { sys, dia, pul, unit: validatedUnit } = validateBpInputs({ systolic, diastolic, pulse, unit });
  const classification = classifyBloodPressure(sys, dia);
  const hemodynamic = calculateHemodynamicMetrics(sys, dia);
  const alerts = evaluateHypertensionAlerts({
    sys,
    dia,
    pul: pul !== null ? pul : 75,
    symptoms,
    classification,
    pregnancyStage,
    ageGroup
  });

  const nowIso = new Date().toISOString();
  const finalMeasuredAt = validateBpMeasurementTime(measuredAt || measurementTime || dateTime || nowIso);
  const readingId = `bp_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 3. Author & Provenance Preservation
  const authorUid = author?.uid || authorizedUser?.uid || recordedByUid || patientId;
  const authorRole = author?.role || authorizedUser?.role || (authorUid === patientId ? 'patient' : 'clinician');
  const authorName = author?.name || authorizedUser?.name || authorizedUser?.displayName || (authorRole === 'doctor' ? 'Physician' : patientName || 'Patient');

  const finalAuthor = {
    uid: authorUid,
    name: authorName,
    role: authorRole
  };

  const finalProvenance = {
    source: provenance?.source || measurementSource,
    deviceDetails: provenance?.deviceDetails || null,
    verified: Boolean(provenance?.verified || authorRole === 'doctor' || authorRole === 'clinician')
  };

  // 4. Collection Context Preservation
  const finalContext = {
    arm: context?.arm || arm,
    posture: context?.posture || posture,
    cuffSize: context?.cuffSize || cuffSize,
    timing: context?.timing || timing,
    medicationTaken: Boolean(context?.medicationTaken !== undefined ? context.medicationTaken : medicationTaken),
    activity: context?.activity || activity || 'resting',
    location: context?.location || location || (measurementSource === MEASUREMENT_SOURCES.CLINIC_READING ? 'clinic' : 'home'),
    bodyPosition: context?.bodyPosition || bodyPosition || posture,
    mealTiming: context?.mealTiming || mealTiming || null,
    ...context
  };

  // 5. Specialty Consent verification
  const normalizedConsent = specialtyConsent ? {
    consented: Boolean(specialtyConsent.consented),
    consentTimestamp: specialtyConsent.consentTimestamp || nowIso,
    consentScope: specialtyConsent.consentScope || 'HYPERTENSION_SPECIALTY_MONITORING',
    version: specialtyConsent.version || 'v1.0'
  } : null;

  // 6. Attached files validation
  const normalizedFiles = Array.isArray(attachedFiles) ? attachedFiles.map((file, idx) => ({
    fileId: file.fileId || `file_bp_${idx}_${Date.now()}`,
    fileUrl: file.fileUrl || file.url || '',
    fileType: file.fileType || 'application/pdf',
    fileName: file.fileName || `diagnostic_file_${idx + 1}`,
    uploadedAt: file.uploadedAt || nowIso
  })) : [];

  // 7. Case Linkage & Clinical Revision Mechanism
  let caseClinicalRevision = null;
  if (caseId && clinicalInfoExchangeService) {
    let clinicalCase = clinicalInfoExchangeService.getCase(caseId);
    if (!clinicalCase) {
      // Register minimal case if not present in memory
      clinicalCase = clinicalInfoExchangeService.registerCase({
        id: caseId,
        patientId,
        patientName: patientName || 'Patient',
        status: 'under_review'
      });
    }

    // Verify Case Ownership: Patient must match
    if (clinicalCase.patientId && clinicalCase.patientId !== patientId) {
      const err = new Error(`Case ownership mismatch: Case ${caseId} belongs to patient ${clinicalCase.patientId}, not ${patientId}.`);
      err.code = 'FORBIDDEN_CASE_OWNERSHIP_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // If authorizedUser is a patient, must own the case
    if (authorizedUser && authorizedUser.role === 'patient' && authorizedUser.uid !== clinicalCase.patientId) {
      const err = new Error('Access denied: You cannot link measurements to another patient\'s case.');
      err.code = 'FORBIDDEN_CASE_OWNERSHIP_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // Update case current assessment
    const previousAssessmentSnapshot = JSON.parse(JSON.stringify(clinicalCase.currentAssessment || {}));
    const oldSys = previousAssessmentSnapshot.systolicBp ?? null;
    const oldDia = previousAssessmentSnapshot.diastolicBp ?? null;

    clinicalCase.currentAssessment = clinicalCase.currentAssessment || {};
    clinicalCase.currentAssessment.systolicBp = sys;
    clinicalCase.currentAssessment.diastolicBp = dia;
    clinicalCase.currentAssessment.bp = `${sys}/${dia} mmHg`;
    if (pul !== null) clinicalCase.currentAssessment.heartRate = pul;

    clinicalCase.systolicBp = sys;
    clinicalCase.diastolicBp = dia;
    clinicalCase.bp = `${sys}/${dia} mmHg`;
    if (pul !== null) clinicalCase.heartRate = pul;

    // Increment clinical revision
    clinicalCase.clinicalRevision = (clinicalCase.clinicalRevision || 1) + 1;
    clinicalCase.lastRevisionAt = nowIso;
    clinicalCase.updatedAt = nowIso;
    caseClinicalRevision = clinicalCase.clinicalRevision;

    // Append observation without overwriting past observations
    clinicalInfoExchangeService._recordObservation(caseId, {
      id: `obs_bp_${readingId}`,
      caseId,
      readingId,
      type: 'bloodPressure',
      name: 'Blood Pressure (Systolic/Diastolic)',
      systolic: sys,
      diastolic: dia,
      value: `${sys}/${dia}`,
      unit: validatedUnit,
      pulse: pul,
      measuredAt: finalMeasuredAt,
      recordedAt: nowIso,
      measurementSource,
      author: finalAuthor,
      provenance: finalProvenance,
      context: finalContext,
      classification,
      alerts
    });

    // Record revision entry
    const revisionsList = clinicalInfoExchangeService.revisions.get(caseId) || [];
    revisionsList.push({
      revision: clinicalCase.clinicalRevision,
      createdAt: nowIso,
      trigger: 'hypertension_bp_measurement',
      authorUid,
      readingId,
      changes: {
        systolicBp: { previous: oldSys, current: sys, unit: validatedUnit },
        diastolicBp: { previous: oldDia, current: dia, unit: validatedUnit }
      }
    });
    clinicalInfoExchangeService.revisions.set(caseId, revisionsList);
  }

  // 8. Assemble Reading Record
  const reading = {
    id: readingId,
    readingId,
    patientId,
    caseId: caseId || null,
    patientName: patientName || 'Patient',
    clinicId: clinicId || null,
    systolic: sys,
    diastolic: dia,
    unit: validatedUnit,
    pulse: pul,
    measuredAt: finalMeasuredAt,
    createdAt: nowIso,
    map: hemodynamic.map,
    pulsePressure: hemodynamic.pulsePressure,
    classification,
    alerts,
    hasEmergencyAlert: alerts.some(a => a.severity === ALERT_SEVERITIES.EMERGENCY),
    measurementSource,
    author: finalAuthor,
    provenance: finalProvenance,
    context: finalContext,
    clinicalRevision: caseClinicalRevision,
    pregnancyStage,
    ageGroup,
    specialtyConsent: normalizedConsent,
    attachedFiles: normalizedFiles,
    linkedAppointmentId: linkedAppointmentId || null,
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    patientNotes: String(patientNotes || '').trim(),
    recordedByUid: authorUid,
    doctorCertified: false,
    certificationDetails: null
  };

  readingsStore.set(readingId, reading);

  // Update patient readings index (never overwrite historical readings!)
  const patientExisting = patientReadingsIndex.get(patientId) || [];
  patientExisting.unshift(readingId);
  patientReadingsIndex.set(patientId, patientExisting);

  // Update case readings index if caseId provided
  if (caseId) {
    const caseExisting = caseReadingsIndex.get(caseId) || [];
    caseExisting.unshift(readingId);
    caseReadingsIndex.set(caseId, caseExisting);
  }

  return reading;
}

function getPatientReadings(patientId, limit = 50) {
  const ids = patientReadingsIndex.get(patientId) || [];
  return ids
    .slice(0, limit)
    .map(id => readingsStore.get(id))
    .filter(Boolean);
}

function getCaseReadings(caseId, limit = 50) {
  const ids = caseReadingsIndex.get(caseId) || [];
  return ids
    .slice(0, limit)
    .map(id => readingsStore.get(id))
    .filter(Boolean);
}

function getReadingById(readingId) {
  return readingsStore.get(readingId) || null;
}

// =============================================================================
// 3. CHRONIC DASHBOARD ANALYTICS & LONGITUDINAL TRENDS
// =============================================================================

function calculateHypertensionDashboard(patientId) {
  const readings = getPatientReadings(patientId, 100);
  if (readings.length === 0) {
    return {
      hasData: false,
      totalReadings: 0,
      message: 'No blood pressure readings recorded yet.'
    };
  }

  let sumSys = 0;
  let sumDia = 0;
  let sumPul = 0;
  let sumMap = 0;

  let morningSysSum = 0;
  let morningCount = 0;
  let eveningSysSum = 0;
  let eveningCount = 0;

  const stageCounts = {
    [BP_STAGES.HYPOTENSION]: 0,
    [BP_STAGES.NORMAL]: 0,
    [BP_STAGES.ELEVATED]: 0,
    [BP_STAGES.STAGE_1]: 0,
    [BP_STAGES.STAGE_2]: 0,
    [BP_STAGES.CRISIS]: 0
  };

  let inTargetCount = 0; // Target is < 130/80 mmHg

  for (const r of readings) {
    sumSys += r.systolic;
    sumDia += r.diastolic;
    sumPul += r.pulse;
    sumMap += r.map;

    if (stageCounts[r.classification.stage] !== undefined) {
      stageCounts[r.classification.stage]++;
    }

    if (r.systolic < 130 && r.diastolic < 80) {
      inTargetCount++;
    }

    if (r.context.timing === 'morning') {
      morningSysSum += r.systolic;
      morningCount++;
    } else if (r.context.timing === 'evening') {
      eveningSysSum += r.systolic;
      eveningCount++;
    }
  }

  const n = readings.length;
  const avgSys = Math.round(sumSys / n);
  const avgDia = Math.round(sumDia / n);
  const avgPul = Math.round(sumPul / n);
  const avgMap = Math.round((sumMap / n) * 10) / 10;
  const controlRatePercent = Math.round((inTargetCount / n) * 100);

  // Morning surge calculation (Difference between morning and evening systolic)
  const avgMorningSys = morningCount > 0 ? Math.round(morningSysSum / morningCount) : null;
  const avgEveningSys = eveningCount > 0 ? Math.round(eveningSysSum / eveningCount) : null;
  const morningSurge = (avgMorningSys !== null && avgEveningSys !== null) ? avgMorningSys - avgEveningSys : null;

  const latestReading = readings[0];
  const overallClassification = classifyBloodPressure(avgSys, avgDia);

  return {
    hasData: true,
    totalReadings: n,
    controlRatePercent, // Target < 130/80 mmHg compliance
    averages: {
      systolic: avgSys,
      diastolic: avgDia,
      pulse: avgPul,
      map: avgMap,
      pulsePressure: avgSys - avgDia
    },
    diurnalSurge: {
      avgMorningSystolic: avgMorningSys,
      avgEveningSystolic: avgEveningSys,
      morningSurgeDelta: morningSurge,
      isExcessiveSurge: morningSurge !== null && morningSurge >= 20 // >20 mmHg is clinical surge risk
    },
    stageDistribution: stageCounts,
    overallClassification,
    latestReading,
    readingsTimeline: readings.slice(0, 15).map(r => ({
      id: r.id,
      date: r.createdAt,
      systolic: r.systolic,
      diastolic: r.diastolic,
      pulse: r.pulse,
      stage: r.classification.stage,
      timing: r.context.timing,
      hasEmergencyAlert: r.hasEmergencyAlert
    }))
  };
}

// =============================================================================
// 4. SPECIALIST FOLLOW-UP PLANS & CLINICAL TARGETS
// =============================================================================

async function createOrUpdateFollowupPlan({
  patientId,
  doctorIdentity,
  targetSystolic = 130,
  targetDiastolic = 80,
  protocol = '7_day_titration', // '7_day_titration' | 'maintenance_weekly' | 'daily_intensive'
  nextReviewDate,
  clinicalGuidance = '',
  dietarySodiumTargetMg = 2000,
  prescribedRegimen = [],
  linkedAppointmentId = null,
  pregnancyStage = PREGNANCY_STAGES.NONE,
  ageGroup = AGE_GROUPS.ADULT,
  attachedFiles = []
}) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed physician can prescribe or modify follow-up plans.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const planId = `plan_htn_${patientId}`;

  const plan = {
    planId,
    patientId,
    prescribingDoctorId: doctorIdentity.uid,
    doctorName: doctorIdentity.name,
    doctorLicense: doctorIdentity.licenseNumber,
    clinicId: doctorIdentity.clinicId,
    targets: {
      systolic: targetSystolic,
      diastolic: targetDiastolic,
      sodiumLimitMgPerDay: dietarySodiumTargetMg
    },
    protocol,
    nextReviewDate: nextReviewDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    clinicalGuidance: String(clinicalGuidance).trim(),
    prescribedRegimen: Array.isArray(prescribedRegimen) ? prescribedRegimen : [],
    linkedAppointmentId: linkedAppointmentId || null,
    pregnancyStage,
    ageGroup,
    attachedFiles: Array.isArray(attachedFiles) ? attachedFiles : [],
    status: 'active',
    updatedAt: nowIso
  };

  followupPlansStore.set(patientId, plan);
  return plan;
}

function getFollowupPlan(patientId) {
  return followupPlansStore.get(patientId) || null;
}

// =============================================================================
// 5. DOCTOR CERTIFICATION & CHRONIC DISEASE CLINICAL REPORTS
// =============================================================================

async function certifyChronicHypertensionReport({
  patientId,
  caseId,
  doctorIdentity,
  clinicalDiagnosis,
  managementPlan,
  riskStratification = 'Moderate Cardiovascular Risk',
  selectedReadingIds = [],
  expectedRevision,
  reviewedRevision,
  clinicalCase
}) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed physician can certify chronic disease reports.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  // Doctor assignment check & Stale Revision Verification if case linked
  const targetCase = clinicalCase || (caseId && clinicalInfoExchangeService?.cases?.get(caseId)) || null;
  if (targetCase) {
    const assigned = targetCase.assignedDoctorId || targetCase.doctorId || targetCase.doctorUid;
    if (assigned && assigned !== doctorIdentity.uid) {
      const error = new Error('Zero-Trust enforcement: This clinical case is assigned to another physician.');
      error.code = 'ACCESS_DENIED';
      error.statusCode = 403;
      throw error;
    }

    const currentRev = Number(targetCase.clinicalRevision || 1);
    const effectiveReviewedRev = reviewedRevision !== undefined && reviewedRevision !== null
      ? Number(reviewedRevision)
      : (expectedRevision !== undefined && expectedRevision !== null ? Number(expectedRevision) : null);

    if (effectiveReviewedRev !== null && effectiveReviewedRev < currentRev) {
      const error = new Error(`The clinical case data has changed to revision ${currentRev}. Please review the latest revision before approval.`);
      error.code = 'STALE_CLINICAL_REVISION';
      error.statusCode = 409;
      error.currentRevision = currentRev;
      error.reviewedRevision = effectiveReviewedRev;
      throw error;
    }

    if ((targetCase.isRevisionStale || targetCase.hasNewInfo) && (effectiveReviewedRev === null || effectiveReviewedRev < currentRev)) {
      const error = new Error('New clinical information has been received. Please review and acknowledge the latest revision before approval.');
      error.code = 'STALE_CLINICAL_REVISION';
      error.statusCode = 409;
      error.currentRevision = currentRev;
      error.reviewedRevision = effectiveReviewedRev;
      throw error;
    }
  }

  const dashboard = calculateHypertensionDashboard(patientId);
  if (!dashboard.hasData) {
    const error = new Error('Cannot certify report for patient with zero recorded readings.');
    error.code = 'NO_DATA_FOR_REPORT';
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const reportRef = `HV-HTN-REP-${patientId.substring(0, 6).toUpperCase()}-${Date.now().toString().slice(-5)}`;

  // Generate digital signature
  const signaturePayload = JSON.stringify({
    reportRef,
    patientId,
    doctorId: doctorIdentity.uid,
    doctorLicense: doctorIdentity.licenseNumber,
    averageBp: `${dashboard.averages.systolic}/${dashboard.averages.diastolic}`,
    certifiedAt: nowIso
  });
  const hmac = crypto.createHmac('sha256', process.env.STORAGE_SIGNING_KEY || 'healthvibe_htn_report_key_2026');
  hmac.update(signaturePayload);
  const signatureHash = hmac.digest('hex');

  const certifiedReport = {
    reportRef,
    patientId,
    doctor: {
      id: doctorIdentity.uid,
      name: doctorIdentity.name,
      licenseNumber: doctorIdentity.licenseNumber,
      specialty: doctorIdentity.specialty || 'أمراض القلب والباطنة',
      clinic: doctorIdentity.clinic
    },
    clinicalDiagnosis: clinicalDiagnosis || `${dashboard.overallClassification.labelAr} (${dashboard.overallClassification.labelEn})`,
    managementPlan: managementPlan || 'الالتزام بالعلاج الخافض للضغط، تقليل الصوديوم، والمتابعة الأسبوعية.',
    riskStratification,
    summaryMetrics: {
      averageBp: `${dashboard.averages.systolic}/${dashboard.averages.diastolic} mmHg`,
      averageMap: `${dashboard.averages.map} mmHg`,
      averagePulse: `${dashboard.averages.pulse} bpm`,
      controlRatePercent: `${dashboard.controlRatePercent}%`,
      totalReadingsAnalyzed: dashboard.totalReadings,
      overallClassification: dashboard.overallClassification
    },
    digitalSignature: {
      algorithm: 'HMAC-SHA256',
      signatureHash,
      signedBy: doctorIdentity.name,
      doctorLicense: doctorIdentity.licenseNumber,
      signedAt: nowIso
    },
    verificationUrl: `/api/reports/verify/${reportRef}`,
    certifiedAt: nowIso
  };

  certifiedReportsStore.set(patientId, certifiedReport);

  // Mark readings as certified
  for (const reading of readingsStore.values()) {
    if (reading.patientId === patientId) {
      reading.doctorCertified = true;
      reading.certificationDetails = {
        reportRef,
        doctorLicense: doctorIdentity.licenseNumber,
        certifiedAt: nowIso
      };
    }
  }

  return certifiedReport;
}

function getLatestCertifiedReport(patientId) {
  return certifiedReportsStore.get(patientId) || null;
}

function resetHypertensionStoreForTesting() {
  readingsStore.clear();
  patientReadingsIndex.clear();
  caseReadingsIndex.clear();
  followupPlansStore.clear();
  certifiedReportsStore.clear();
}

module.exports = {
  BP_STAGES,
  MEASUREMENT_SOURCES,
  ALERT_SEVERITIES,
  PREGNANCY_STAGES,
  AGE_GROUPS,
  SPECIALTY_READINESS,
  normalizeArabicIndicDigits,
  parseStrictBpComponent,
  validateBpUnit,
  validateBpMeasurementTime,
  validateBpInputs,
  classifyBloodPressure,
  calculateHemodynamicMetrics,
  evaluateHypertensionAlerts,
  recordBloodPressureReading,
  getPatientReadings,
  getCaseReadings,
  getReadingById,
  calculateHypertensionDashboard,
  createOrUpdateFollowupPlan,
  getFollowupPlan,
  certifyChronicHypertensionReport,
  getLatestCertifiedReport,
  resetHypertensionStoreForTesting
};
