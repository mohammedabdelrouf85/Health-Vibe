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

// In-Memory Storage for High-Speed & Unit Test Execution
const readingsStore = new Map(); // readingId -> reading object
const patientReadingsIndex = new Map(); // patientId -> array of readingIds
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
  MEDICAL_OCR: 'medical_ocr'
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

function validateBpInputs({ systolic, diastolic, pulse }) {
  const sys = Number(systolic);
  const dia = Number(diastolic);
  const pul = Number(pulse);

  if (isNaN(sys) || sys < 60 || sys > 260) {
    throw new Error(`Invalid systolic blood pressure: ${systolic}. Valid physiological range is 60 - 260 mmHg.`);
  }
  if (isNaN(dia) || dia < 40 || dia > 160) {
    throw new Error(`Invalid diastolic blood pressure: ${diastolic}. Valid physiological range is 40 - 160 mmHg.`);
  }
  if (sys <= dia) {
    throw new Error(`Physiological error: Systolic BP (${sys}) must be greater than Diastolic BP (${dia}).`);
  }
  if (isNaN(pul) || pul < 30 || pul > 220) {
    throw new Error(`Invalid resting pulse: ${pulse}. Valid physiological range is 30 - 220 bpm.`);
  }

  return { sys, dia, pul };
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
  patientName,
  clinicId,
  systolic,
  diastolic,
  pulse,
  measurementSource = MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
  arm = 'left',
  posture = 'seated_rested',
  cuffSize = 'standard',
  timing = 'morning',
  symptoms = [],
  medicationTaken = true,
  patientNotes = '',
  recordedByUid,
  pregnancyStage = PREGNANCY_STAGES.NONE,
  ageGroup = AGE_GROUPS.ADULT,
  specialtyConsent = null,
  attachedFiles = [],
  linkedAppointmentId = null
}) {
  if (!patientId) throw new Error('patientId is required.');

  const { sys, dia, pul } = validateBpInputs({ systolic, diastolic, pulse });
  const classification = classifyBloodPressure(sys, dia);
  const hemodynamic = calculateHemodynamicMetrics(sys, dia);
  const alerts = evaluateHypertensionAlerts({
    sys,
    dia,
    pul,
    symptoms,
    classification,
    pregnancyStage,
    ageGroup
  });

  const nowIso = new Date().toISOString();
  const readingId = `bp_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Specialty Consent verification
  const normalizedConsent = specialtyConsent ? {
    consented: Boolean(specialtyConsent.consented),
    consentTimestamp: specialtyConsent.consentTimestamp || nowIso,
    consentScope: specialtyConsent.consentScope || 'HYPERTENSION_SPECIALTY_MONITORING',
    version: specialtyConsent.version || 'v1.0'
  } : null;

  // Attached files validation (e.g., ECG, echo report, BP machine display photo)
  const normalizedFiles = Array.isArray(attachedFiles) ? attachedFiles.map((file, idx) => ({
    fileId: file.fileId || `file_bp_${idx}_${Date.now()}`,
    fileUrl: file.fileUrl || file.url || '',
    fileType: file.fileType || 'application/pdf',
    fileName: file.fileName || `diagnostic_file_${idx + 1}`,
    uploadedAt: file.uploadedAt || nowIso
  })) : [];

  const reading = {
    id: readingId,
    readingId,
    patientId,
    patientName: patientName || 'Patient',
    clinicId: clinicId || null,
    systolic: sys,
    diastolic: dia,
    pulse: pul,
    map: hemodynamic.map,
    pulsePressure: hemodynamic.pulsePressure,
    classification,
    alerts,
    hasEmergencyAlert: alerts.some(a => a.severity === ALERT_SEVERITIES.EMERGENCY),
    measurementSource,
    context: {
      arm,
      posture,
      cuffSize,
      timing,
      medicationTaken: Boolean(medicationTaken)
    },
    pregnancyStage,
    ageGroup,
    specialtyConsent: normalizedConsent,
    attachedFiles: normalizedFiles,
    linkedAppointmentId: linkedAppointmentId || null,
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    patientNotes: String(patientNotes || '').trim(),
    recordedByUid: recordedByUid || patientId,
    doctorCertified: false,
    certificationDetails: null,
    createdAt: nowIso
  };

  readingsStore.set(readingId, reading);

  const existing = patientReadingsIndex.get(patientId) || [];
  existing.unshift(readingId);
  patientReadingsIndex.set(patientId, existing);

  return reading;
}

function getPatientReadings(patientId, limit = 50) {
  const ids = patientReadingsIndex.get(patientId) || [];
  return ids
    .slice(0, limit)
    .map(id => readingsStore.get(id))
    .filter(Boolean);
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
  doctorIdentity,
  clinicalDiagnosis,
  managementPlan,
  riskStratification = 'Moderate Cardiovascular Risk',
  selectedReadingIds = []
}) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed physician can certify chronic disease reports.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
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
  validateBpInputs,
  classifyBloodPressure,
  calculateHemodynamicMetrics,
  evaluateHypertensionAlerts,
  recordBloodPressureReading,
  getPatientReadings,
  calculateHypertensionDashboard,
  createOrUpdateFollowupPlan,
  getFollowupPlan,
  certifyChronicHypertensionReport,
  getLatestCertifiedReport,
  resetHypertensionStoreForTesting
};
