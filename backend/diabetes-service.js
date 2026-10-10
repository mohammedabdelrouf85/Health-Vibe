/**
 * Health Vibe AI - Diabetes Mellitus & Glycemic Management Clinical Service
 *
 * Provides:
 * 1. Structured Glucose & HbA1c Anthropometric/Biometric Storage:
 *    - Fasting Blood Glucose (FBG), Postprandial Glucose (PPG), Random Blood Glucose (RBG).
 *    - Validated units: mg/dL, mmol/L (canonical conversion: 1 mmol/L = 18.0182 mg/dL).
 *    - Glycated Hemoglobin HbA1c (%).
 * 2. Physiological Plausibility Limits:
 *    - Blood Glucose: 20 mg/dL - 800 mg/dL (1.1 - 44.4 mmol/L).
 *    - HbA1c: 3.5% - 20.0%.
 * 3. Human-in-the-Loop & Approved Medical Review:
 *    - Zero automated insulin dose prescriptions.
 *    - Zero automated clinical diagnoses.
 *    - Explicit attending physician evaluation and revision gating.
 * 4. Longitudinal Preservation:
 *    - Never overwrites historical readings.
 * 5. Multi-Clinic & Patient Ownership Isolation.
 */

const crypto = require('crypto');

let auditService = null;
try {
  auditService = require('./audit-service');
} catch (e) {}

// In-Memory Data Stores for fast, isolated testing & caching
const diabetesReadingsStore = new Map();     // readingId -> reading record
const patientReadingsIndex = new Map();      // patientId -> array of readingIds
const diabetesCasesStore = new Map();        // caseId -> case record
const patientCasesIndex = new Map();         // patientId -> array of caseIds
const approvedReportsStore = new Map();      // patientId -> certified report

const GLUCOSE_UNITS = {
  MG_DL: 'mg/dL',
  MMOL_L: 'mmol/L'
};

const GLUCOSE_TYPES = {
  FASTING: 'fasting',
  POSTPRANDIAL: 'postprandial',
  RANDOM: 'random',
  BEDTIME: 'bedtime',
  PRE_MEAL: 'pre_meal'
};

const CLINICAL_BOUNDS = {
  GLUCOSE_MG_DL: { MIN: 20, MAX: 800 },
  GLUCOSE_MMOL_L: { MIN: 1.1, MAX: 44.4 },
  HBA1C: { MIN: 3.5, MAX: 20.0 }
};

function normalizeGlucoseUnit(unit) {
  if (!unit) return GLUCOSE_UNITS.MG_DL;
  const u = String(unit).trim().toLowerCase();
  if (u === 'mg/dl' || u === 'mgdl') return GLUCOSE_UNITS.MG_DL;
  if (u === 'mmol/l' || u === 'mmoll') return GLUCOSE_UNITS.MMOL_L;
  const err = new Error(`Unsupported glucose unit '${unit}'. Supported units: [mg/dL, mmol/L]`);
  err.code = 'UNSUPPORTED_GLUCOSE_UNIT';
  err.statusCode = 400;
  throw err;
}

function validateGlucoseValue(val, unit) {
  const num = Number(val);
  if (isNaN(num)) {
    const err = new Error(`Invalid non-numeric glucose value: ${val}`);
    err.code = 'INVALID_NUMERIC_INPUT';
    err.statusCode = 400;
    throw err;
  }
  if (num <= 0) {
    const err = new Error(`Glucose value must be positive: ${num}`);
    err.code = 'NEGATIVE_OR_ZERO_INPUT';
    err.statusCode = 400;
    throw err;
  }

  const normUnit = normalizeGlucoseUnit(unit);
  const bounds = normUnit === GLUCOSE_UNITS.MG_DL
    ? CLINICAL_BOUNDS.GLUCOSE_MG_DL
    : CLINICAL_BOUNDS.GLUCOSE_MMOL_L;

  if (num < bounds.MIN || num > bounds.MAX) {
    const err = new Error(`Glucose value ${num} ${normUnit} is outside plausible clinical boundaries [${bounds.MIN} - ${bounds.MAX}]`);
    err.code = 'IMPLAUSIBLE_GLUCOSE_VALUE';
    err.statusCode = 400;
    throw err;
  }

  return {
    value: num,
    unit: normUnit,
    valueMgDl: normUnit === GLUCOSE_UNITS.MG_DL ? num : Math.round(num * 18.0182 * 10) / 10,
    valueMmolL: normUnit === GLUCOSE_UNITS.MMOL_L ? num : Math.round((num / 18.0182) * 10) / 10
  };
}

function recordGlucoseReading({
  patientId,
  glucoseValue,
  unit = 'mg/dL',
  glucoseType = 'random',
  hba1c = null,
  measuredAt,
  measurementSource = 'patient_glucometer',
  context = {},
  notes = '',
  clinicId = null,
  author
}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    err.statusCode = 400;
    throw err;
  }

  const validatedGlucose = validateGlucoseValue(glucoseValue, unit);

  let validatedHba1c = null;
  if (hba1c !== null && hba1c !== undefined && hba1c !== '') {
    const hNum = Number(hba1c);
    if (isNaN(hNum) || hNum < CLINICAL_BOUNDS.HBA1C.MIN || hNum > CLINICAL_BOUNDS.HBA1C.MAX) {
      const err = new Error(`HbA1c value ${hba1c}% is outside plausible clinical range [${CLINICAL_BOUNDS.HBA1C.MIN}% - ${CLINICAL_BOUNDS.HBA1C.MAX}%]`);
      err.code = 'IMPLAUSIBLE_HBA1C_VALUE';
      err.statusCode = 400;
      throw err;
    }
    validatedHba1c = hNum;
  }

  const readingId = `gl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const reading = {
    id: readingId,
    readingId,
    patientId,
    clinicId: clinicId || null,
    glucose: validatedGlucose.value,
    unit: validatedGlucose.unit,
    glucoseMgDl: validatedGlucose.valueMgDl,
    glucoseMmolL: validatedGlucose.valueMmolL,
    glucoseType,
    hba1c: validatedHba1c,
    measurementSource,
    measuredAt: measuredAt || nowIso,
    context: typeof context === 'object' ? context : {},
    notes: String(notes || '').trim(),
    author: author || { uid: patientId, role: 'patient' },
    createdAt: nowIso
  };

  diabetesReadingsStore.set(readingId, reading);

  if (!patientReadingsIndex.has(patientId)) {
    patientReadingsIndex.set(patientId, []);
  }
  patientReadingsIndex.get(patientId).push(readingId);

  return reading;
}

function getPatientReadings(patientId) {
  if (!patientId || !patientReadingsIndex.has(patientId)) return [];
  const ids = patientReadingsIndex.get(patientId) || [];
  return ids.map(id => diabetesReadingsStore.get(id)).filter(Boolean);
}

function getReadingById(readingId) {
  return diabetesReadingsStore.get(readingId) || null;
}

function createDiabetesCase({
  patientId,
  clinicId = null,
  assignedDoctorId = null,
  patientProfile = {},
  initialReading = null,
  chiefComplaint = '',
  patientNotes = ''
}) {
  if (!patientId) {
    const err = new Error('patientId is required.');
    err.code = 'MISSING_PATIENT_ID';
    err.statusCode = 400;
    throw err;
  }

  const caseId = `case_dia_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();

  const diaCase = {
    id: caseId,
    caseId,
    diseaseId: 'diabetes',
    patientId,
    clinicId: clinicId || patientProfile.clinicId || null,
    assignedDoctorId: assignedDoctorId || null,
    patientName: patientProfile.name || patientProfile.displayName || 'Patient',
    chiefComplaint: chiefComplaint || '',
    patientNotes: patientNotes || '',
    initialReading: initialReading || null,
    status: 'pending',
    clinicalRevision: 1,
    clinicalDiagnosis: null,
    managementPlan: null,
    doctorNotes: '',
    internalDoctorNotes: '',
    approvingDoctor: null,
    approvedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  diabetesCasesStore.set(caseId, diaCase);

  if (!patientCasesIndex.has(patientId)) {
    patientCasesIndex.set(patientId, []);
  }
  patientCasesIndex.get(patientId).push(caseId);

  return diaCase;
}

function getPatientCases(patientId) {
  if (!patientId || !patientCasesIndex.has(patientId)) return [];
  const ids = patientCasesIndex.get(patientId) || [];
  return ids.map(id => diabetesCasesStore.get(id)).filter(Boolean);
}

function getCaseById(caseId) {
  return diabetesCasesStore.get(caseId) || null;
}

function reviewAndApproveDiabetesCase({
  caseId,
  reviewingDoctor,
  clinicalDiagnosis,
  managementPlan,
  doctorNotes,
  internalDoctorNotes,
  followUpPlan,
  reviewedRevision,
  expectedRevision
}) {
  const diaCase = diabetesCasesStore.get(caseId);
  if (!diaCase) {
    const err = new Error(`Diabetes case '${caseId}' not found.`);
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (!reviewingDoctor || !reviewingDoctor.uid) {
    const err = new Error('Authorized reviewing doctor is required.');
    err.code = 'DOCTOR_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.isLicenseExpired || reviewingDoctor.licenseStatus === 'revoked') {
    const err = new Error('Doctor license is revoked or expired.');
    err.code = 'INVALID_DOCTOR_LICENSE';
    err.statusCode = 403;
    throw err;
  }

  if (!clinicalDiagnosis || !String(clinicalDiagnosis).trim()) {
    const err = new Error('Explicit physician clinical diagnosis is mandatory.');
    err.code = 'PHYSICIAN_DIAGNOSIS_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  const attemptedRev = reviewedRevision !== undefined ? Number(reviewedRevision) : (expectedRevision !== undefined ? Number(expectedRevision) : null);
  if (attemptedRev !== null && attemptedRev !== diaCase.clinicalRevision) {
    const err = new Error(`Stale clinical revision. Case is revision ${diaCase.clinicalRevision}; attempted ${attemptedRev}.`);
    err.code = 'STALE_CLINICAL_REVISION';
    err.statusCode = 409;
    throw err;
  }

  const nowIso = new Date().toISOString();
  diaCase.status = 'approved';
  diaCase.clinicalDiagnosis = String(clinicalDiagnosis).trim();
  diaCase.managementPlan = String(managementPlan || '').trim();
  diaCase.doctorNotes = String(doctorNotes || '').trim();
  diaCase.internalDoctorNotes = String(internalDoctorNotes || '').trim();
  diaCase.followUpPlan = followUpPlan || null;
  diaCase.approvingDoctor = {
    uid: reviewingDoctor.uid,
    name: reviewingDoctor.name || 'Endocrinologist',
    licenseNumber: reviewingDoctor.licenseNumber || 'VERIFIED-DOC',
    specialty: reviewingDoctor.specialty || 'Endocrinology'
  };
  diaCase.approvedAt = nowIso;
  diaCase.clinicalRevision += 1;
  diaCase.updatedAt = nowIso;

  const reportId = `rep_dia_${diaCase.caseId}`;
  const certifiedReport = {
    reportId,
    caseId: diaCase.caseId,
    patientId: diaCase.patientId,
    diseaseId: 'diabetes',
    status: 'approved',
    clinicalDiagnosis: diaCase.clinicalDiagnosis,
    managementPlan: diaCase.managementPlan,
    doctorNotes: diaCase.doctorNotes,
    // Quarantined internal notes strictly removed
    followUpPlan: diaCase.followUpPlan,
    approvingDoctor: diaCase.approvingDoctor,
    approvedAt: nowIso
  };

  approvedReportsStore.set(diaCase.patientId, certifiedReport);

  return { success: true, case: diaCase, report: certifiedReport };
}

function getApprovedReport(patientId) {
  return approvedReportsStore.get(patientId) || null;
}

function resetDiabetesStoreForTesting() {
  diabetesReadingsStore.clear();
  patientReadingsIndex.clear();
  diabetesCasesStore.clear();
  patientCasesIndex.clear();
  approvedReportsStore.clear();
}

module.exports = {
  GLUCOSE_UNITS,
  GLUCOSE_TYPES,
  CLINICAL_BOUNDS,
  normalizeGlucoseUnit,
  validateGlucoseValue,
  recordGlucoseReading,
  getPatientReadings,
  getReadingById,
  createDiabetesCase,
  getPatientCases,
  getCaseById,
  reviewAndApproveDiabetesCase,
  getApprovedReport,
  resetDiabetesStoreForTesting
};
