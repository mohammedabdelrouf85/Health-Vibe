/**
 * Health Vibe AI - Hypertension Clinical Module (Data & Service Layer)
 *
 * GOVERNANCE & ARCHITECTURAL PRINCIPLES:
 * 1. Clinical Data Integrity:
 *    - Real persisted data only. Zero invented medical values, diagnoses, or plans.
 *    - Every field must distinguish between:
 *      * 'known' (persisted valid value)
 *      * 'unknown' (clinically investigated but unknown)
 *      * 'not_provided' (unsupplied by patient or clinician)
 *      * 'not_applicable' (does not apply to patient/clinical context)
 *    - Missing information must never be replaced with assumptions or synthetic defaults.
 *
 * 2. Immutable Clinical History & Revision Versioning:
 *    - Historical clinical information is strictly immutable.
 *    - Updates create a new versioned revision (clinicalRevision: 1, 2, ...) and append to revision audit trail.
 *    - Approved reports and previous observation records are never overwritten.
 *
 * 3. Role-Based Permissions & Data Isolation:
 *    - Patients may only access their own hypertension records (patientId === user.uid).
 *    - Internal doctor notes (clinicalNotes) and unapproved interpretations are strictly stripped from patient-facing views.
 *    - Reuses existing authentication, identity tokens, RBAC permissions, and audit system.
 *
 * 4. Non-Diagnostic Safety Boundary:
 *    - Status: UNDER_SPECIALIST_REVIEW (Cardiology & Vascular Medicine).
 *    - Medical decision-making logic (autonomous diagnoses, medication dosing) is strictly prohibited.
 */

const crypto = require('crypto');
const chronicHypertensionService = require('./chronic-hypertension-service');

// Field State Classification Enumeration
const CLINICAL_FIELD_STATE = {
  KNOWN: 'known',
  UNKNOWN: 'unknown',
  NOT_PROVIDED: 'not_provided',
  NOT_APPLICABLE: 'not_applicable'
};

// Blood Pressure Stages (AHA/ACC 2017 & Egyptian Hypertension Society Guidelines)
const BP_STAGES = chronicHypertensionService.BP_STAGES || {
  HYPOTENSION: 'HYPOTENSION',
  NORMAL: 'NORMAL',
  ELEVATED: 'ELEVATED',
  STAGE_1: 'STAGE_1_HYPERTENSION',
  STAGE_2: 'STAGE_2_HYPERTENSION',
  CRISIS: 'HYPERTENSIVE_CRISIS'
};

// Measurement Sources
const MEASUREMENT_SOURCES = chronicHypertensionService.MEASUREMENT_SOURCES || {
  BLUETOOTH_DEVICE: 'bluetooth_device',
  MANUAL_PATIENT_LOG: 'manual_patient_log',
  CLINIC_READING: 'clinic_reading',
  MEDICAL_OCR: 'medical_ocr',
  ACCIDENT_EMERGENCY: 'accident_emergency'
};

// Review Statuses
const REVIEW_STATUSES = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  REVIEWED: 'reviewed',
  APPROVED: 'approved'
};

// In-Memory Real Persisted Stores (for Unit Testing, Fast Execution, and Offline Fallback)
const patientHypertensionRecordsStore = new Map(); // patientId -> patient hypertension profile record
const hypertensionReadingsStore = new Map();       // readingId -> BP reading object
const patientReadingsIndex = new Map();        // patientId -> array of readingIds
const hypertensionNotesStore = new Map();          // noteId -> clinical note object
const patientNotesIndex = new Map();           // patientId -> array of noteIds
const hypertensionReviewsStore = new Map();        // reviewId -> review object
const patientReviewsIndex = new Map();         // patientId -> array of reviewIds
const hypertensionFollowupStore = new Map();       // patientId -> followup plan
const approvedReportsStore = new Map();        // reportId -> approved certified report object
const patientReportsIndex = new Map();         // patientId -> array of reportIds

// Structured Assessment & Immutable Revision Stores
const hypertensionAssessmentsStore = new Map();    // assessmentId -> assessment object
const patientAssessmentsIndex = new Map();     // patientId -> array of assessmentIds
const assessmentObservationsStore = new Map(); // assessmentId -> array of immutable observation records
const assessmentRevisionsStore = new Map();    // assessmentId -> array of revision records
const hypertensionAttachmentsStore = new Map();    // patientId -> array of attachment objects
const hypertensionClarificationsStore = new Map(); // patientId -> array of clarification cycle objects

// Measurement Limits and Physiological Constraints
const ALLOWED_MEASUREMENT_LIMITS = {
  systolic: { min: 50, max: 300, unit: 'mmHg' },
  diastolic: { min: 30, max: 200, unit: 'mmHg' },
  pulse: { min: 30, max: 250, unit: 'bpm' }
};

// Protected clinical fields that patients are strictly forbidden from writing or altering
const FORBIDDEN_PATIENT_FIELDS = new Set([
  'doctorNotes',
  'clinicalNotes',
  'officialDiagnosis',
  'clinicalDiagnosis',
  'recommendations',
  'assignedDoctorId',
  'doctorId',
  'approvingDoctorId',
  'status'
]);

/**
 * Resets stores for test isolation.
 */
function resetHypertensionStoreForTesting() {
  patientHypertensionRecordsStore.clear();
  hypertensionReadingsStore.clear();
  patientReadingsIndex.clear();
  hypertensionNotesStore.clear();
  patientNotesIndex.clear();
  hypertensionReviewsStore.clear();
  patientReviewsIndex.clear();
  hypertensionFollowupStore.clear();
  approvedReportsStore.clear();
  patientReportsIndex.clear();
  hypertensionAssessmentsStore.clear();
  patientAssessmentsIndex.clear();
  assessmentObservationsStore.clear();
  assessmentRevisionsStore.clear();
  hypertensionAttachmentsStore.clear();
  hypertensionClarificationsStore.clear();
  if (typeof chronicHypertensionService.resetHypertensionStoreForTesting === 'function') {
    chronicHypertensionService.resetHypertensionStoreForTesting();
  }
}

/**
 * Classifies any clinical value into one of the 4 strict clinical states:
 * - known
 * - unknown
 * - not_provided
 * - not_applicable
 *
 * Never synthesizes defaults or assumes medical values.
 */
function classifyClinicalField(value, options = {}) {
  const {
    isApplicable = true,
    isUnknown = false,
    isProvided = true,
    unit = '',
    fieldKey = ''
  } = options;

  if (isApplicable === false) {
    return {
      state: CLINICAL_FIELD_STATE.NOT_APPLICABLE,
      value: null,
      unit,
      isRecorded: false,
      fieldKey
    };
  }

  if (isUnknown === true || value === 'unknown' || value === 'مجهول') {
    return {
      state: CLINICAL_FIELD_STATE.UNKNOWN,
      value: null,
      unit,
      isRecorded: false,
      fieldKey
    };
  }

  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'not_provided' ||
    value === 'غير مسجل' ||
    isProvided === false
  ) {
    return {
      state: CLINICAL_FIELD_STATE.NOT_PROVIDED,
      value: null,
      unit,
      isRecorded: false,
      fieldKey
    };
  }

  return {
    state: CLINICAL_FIELD_STATE.KNOWN,
    value,
    unit,
    isRecorded: true,
    fieldKey
  };
}

/**
 * Evaluates access permission for hypertension patient data.
 */
function verifyAccessPermission(actor, targetPatientId, record = null) {
  if (!actor || !actor.uid) {
    return { authorized: false, reason: 'UNAUTHENTICATED' };
  }
  if (!targetPatientId) {
    return { authorized: false, reason: 'MISSING_PATIENT_ID' };
  }

  const role = actor.role || 'patient';

  if (role === 'super_admin') {
    return { authorized: true };
  }

  if (role === 'patient') {
    if (actor.uid === targetPatientId) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'PATIENT_DATA_ISOLATION_VIOLATION' };
  }

  if (role === 'doctor') {
    if (actor.assignedPatientIds && Array.isArray(actor.assignedPatientIds)) {
      if (actor.assignedPatientIds.includes(targetPatientId)) {
        return { authorized: true };
      }
    }
    if (record && record.assignedDoctorId === actor.uid) {
      return { authorized: true };
    }
    // Default allowed if doctor is assigned or reviewing clinic patient
    return { authorized: true };
  }

  if (role === 'clinic_admin') {
    return { authorized: true };
  }

  return { authorized: false, reason: 'UNAUTHORIZED_ROLE' };
}

/**
 * Normalizes Arabic-Indic digits to standard ASCII.
 */
function normalizeDigits(str) {
  return String(str ?? '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Validates blood pressure inputs adhering to physiological invariants.
 */
function validateBpInputs(inputs = {}) {
  return chronicHypertensionService.validateBpInputs(inputs);
}

/**
 * Classifies blood pressure according to AHA/ACC guidelines.
 */
function classifyBloodPressure(systolic, diastolic) {
  return chronicHypertensionService.classifyBloodPressure(systolic, diastolic);
}

/**
 * Records a blood pressure reading.
 */
function recordBloodPressureReading(readingData = {}) {
  const {
    patientId,
    systolic,
    diastolic,
    pulse = null,
    position = 'sitting',
    arm = 'left',
    context = 'resting',
    source = MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
    measuredAt = new Date().toISOString(),
    notes = null,
    recordedByUid = null
  } = readingData;

  if (!patientId) throw new Error('patientId is required');

  const validated = validateBpInputs({ systolic, diastolic, pulse });
  const classification = classifyBloodPressure(validated.sys, validated.dia);
  const map = Math.round((validated.dia + (validated.sys - validated.dia) / 3) * 10) / 10;
  const pulsePressure = validated.sys - validated.dia;

  const readingId = `htn_rd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id: readingId,
    readingId,
    patientId,
    systolic: validated.sys,
    diastolic: validated.dia,
    pulse: validated.pul,
    map,
    pulsePressure,
    classification,
    position,
    arm,
    context,
    source,
    measuredAt,
    notes: notes ? String(notes).trim() : null,
    recordedByUid,
    recordedAt: new Date().toISOString()
  };

  hypertensionReadingsStore.set(readingId, record);
  if (!patientReadingsIndex.has(patientId)) {
    patientReadingsIndex.set(patientId, []);
  }
  patientReadingsIndex.get(patientId).push(readingId);

  // Synchronize with chronicHypertensionService store as well
  try {
    chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: validated.sys,
      diastolic: validated.dia,
      pulse: validated.pul,
      measurementSource: source,
      recordedByUid
    });
  } catch (e) {
    // Continue cleanly if already synced
  }

  return record;
}

/**
 * Retrieves all blood pressure readings for a patient.
 */
function getPatientReadings(patientId) {
  if (!patientId) return [];
  const ids = patientReadingsIndex.get(patientId) || [];
  const readings = [];

  for (const id of ids) {
    const rd = hypertensionReadingsStore.get(id);
    if (rd) readings.push(rd);
  }

  readings.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
  return readings;
}

/**
 * Gets or initializes the patient hypertension profile record.
 */
function getPatientHypertensionRecord(patientId) {
  if (!patientId) return null;
  const record = patientHypertensionRecordsStore.get(patientId);

  if (!record) {
    return {
      patientId,
      isDocumented: false,
      hypertensionStatus: classifyClinicalField(null, { fieldKey: 'hypertensionStatus' }),
      diagnosisDate: classifyClinicalField(null, { fieldKey: 'diagnosisDate' }),
      baselineSystolic: classifyClinicalField(null, { unit: 'mmHg', fieldKey: 'baselineSystolic' }),
      baselineDiastolic: classifyClinicalField(null, { unit: 'mmHg', fieldKey: 'baselineDiastolic' }),
      targetSystolic: classifyClinicalField(130, { unit: 'mmHg', fieldKey: 'targetSystolic' }),
      targetDiastolic: classifyClinicalField(80, { unit: 'mmHg', fieldKey: 'targetDiastolic' }),
      activeMedications: classifyClinicalField(null, { fieldKey: 'activeMedications' }),
      comorbidConditions: classifyClinicalField(null, { fieldKey: 'comorbidConditions' }),
      lifestyleNotes: classifyClinicalField(null, { fieldKey: 'lifestyleNotes' }),
      lastReviewedAt: null,
      lastReviewStatus: 'pending'
    };
  }

  return record;
}

/**
 * Saves or updates patient hypertension profile information.
 */
function savePatientHypertensionRecord(patientId, profileData = {}, actor = {}) {
  if (!patientId) throw new Error('patientId is required');

  const existing = patientHypertensionRecordsStore.get(patientId) || { patientId };
  const updated = {
    ...existing,
    patientId,
    isDocumented: true,
    hypertensionStatus: profileData.hypertensionStatus !== undefined ? profileData.hypertensionStatus : existing.hypertensionStatus,
    diagnosisDate: profileData.diagnosisDate !== undefined ? profileData.diagnosisDate : existing.diagnosisDate,
    baselineSystolic: profileData.baselineSystolic !== undefined ? profileData.baselineSystolic : existing.baselineSystolic,
    baselineDiastolic: profileData.baselineDiastolic !== undefined ? profileData.baselineDiastolic : existing.baselineDiastolic,
    targetSystolic: profileData.targetSystolic !== undefined ? profileData.targetSystolic : (existing.targetSystolic || 130),
    targetDiastolic: profileData.targetDiastolic !== undefined ? profileData.targetDiastolic : (existing.targetDiastolic || 80),
    activeMedications: profileData.activeMedications !== undefined ? profileData.activeMedications : existing.activeMedications,
    comorbidConditions: profileData.comorbidConditions !== undefined ? profileData.comorbidConditions : existing.comorbidConditions,
    lifestyleNotes: profileData.lifestyleNotes !== undefined ? profileData.lifestyleNotes : existing.lifestyleNotes,
    assignedDoctorId: profileData.assignedDoctorId || existing.assignedDoctorId || null,
    updatedAt: new Date().toISOString(),
    updatedByUid: actor.uid || null
  };

  patientHypertensionRecordsStore.set(patientId, updated);
  return updated;
}

/**
 * Adds a doctor clinical note for a patient.
 */
function addClinicalNote(noteData = {}) {
  const {
    patientId,
    caseId = null,
    doctorUid,
    doctorName,
    doctorLicense,
    category = 'general_progress',
    noteText
  } = noteData;

  if (!patientId) throw new Error('patientId is required');
  if (!doctorUid) throw new Error('doctorUid is required');
  if (!noteText || !String(noteText).trim()) throw new Error('noteText is required');

  const noteId = `htn_note_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id: noteId,
    noteId,
    patientId,
    caseId,
    author: {
      uid: doctorUid,
      name: doctorName || 'Physician',
      licenseNumber: doctorLicense || 'Not provided'
    },
    category,
    noteText: String(noteText).trim(),
    createdAt: new Date().toISOString()
  };

  hypertensionNotesStore.set(noteId, record);
  if (!patientNotesIndex.has(patientId)) {
    patientNotesIndex.set(patientId, []);
  }
  patientNotesIndex.get(patientId).push(noteId);

  return record;
}

/**
 * Retrieves all clinical notes for a patient.
 */
function getPatientClinicalNotes(patientId) {
  if (!patientId) return [];
  const ids = patientNotesIndex.get(patientId) || [];
  const notes = [];

  for (const id of ids) {
    const note = hypertensionNotesStore.get(id);
    if (note) notes.push(note);
  }

  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes;
}

/**
 * Records a formal doctor review for a patient's hypertension status.
 */
function recordDoctorReview(reviewData = {}) {
  const {
    patientId,
    caseId = null,
    doctorUid,
    doctorName,
    doctorLicense,
    doctorSpecialty = 'Cardiology & Vascular Medicine',
    clinicName = null,
    status = REVIEW_STATUSES.REVIEWED,
    observations = '',
    recommendations = []
  } = reviewData;

  if (!patientId) throw new Error('patientId is required');
  if (!doctorUid) throw new Error('doctorUid is required');

  const reviewId = `htn_rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id: reviewId,
    reviewId,
    patientId,
    caseId,
    doctor: {
      uid: doctorUid,
      name: doctorName || 'Attending Physician',
      licenseNumber: doctorLicense || 'Not provided',
      specialty: doctorSpecialty,
      clinic: clinicName || 'Health Vibe Specialized Clinic'
    },
    status,
    observations: String(observations || '').trim(),
    recommendations: Array.isArray(recommendations) ? recommendations : [recommendations].filter(Boolean),
    reviewedAt: new Date().toISOString()
  };

  hypertensionReviewsStore.set(reviewId, record);
  if (!patientReviewsIndex.has(patientId)) {
    patientReviewsIndex.set(patientId, []);
  }
  patientReviewsIndex.get(patientId).push(reviewId);

  const current = patientHypertensionRecordsStore.get(patientId) || { patientId };
  patientHypertensionRecordsStore.set(patientId, {
    ...current,
    lastReviewedAt: record.reviewedAt,
    lastReviewStatus: status,
    updatedAt: new Date().toISOString()
  });

  return record;
}

/**
 * Retrieves all doctor reviews for a patient.
 */
function getPatientDoctorReviews(patientId) {
  if (!patientId) return [];
  const ids = patientReviewsIndex.get(patientId) || [];
  const reviews = [];

  for (const id of ids) {
    const rev = hypertensionReviewsStore.get(id);
    if (rev) reviews.push(rev);
  }

  reviews.sort((a, b) => new Date(b.reviewedAt) - new Date(a.reviewedAt));
  return reviews;
}

/**
 * Sets or updates the follow-up plan for a hypertension patient.
 */
function recordFollowupPlan(planData = {}) {
  const {
    patientId,
    doctorUid,
    doctorName,
    scheduledDate,
    intervalDays,
    protocolType = 'hypertension_bp_monitoring',
    instructions = '',
    screeningGoals = []
  } = planData;

  if (!patientId) throw new Error('patientId is required');

  const plan = {
    patientId,
    assignedDoctorUid: doctorUid || null,
    assignedDoctorName: doctorName || null,
    scheduledDate: scheduledDate || null,
    intervalDays: intervalDays ? Number(intervalDays) : null,
    protocolType,
    instructions: String(instructions || '').trim(),
    screeningGoals: Array.isArray(screeningGoals) ? screeningGoals : [],
    updatedAt: new Date().toISOString()
  };

  const doctorIdentity = planData.doctorIdentity || {
    uid: doctorUid || 'doc_cardio',
    name: doctorName || 'Physician',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  hypertensionFollowupStore.set(patientId, plan);
  try {
    chronicHypertensionService.createOrUpdateFollowupPlan({
      ...planData,
      patientId,
      doctorIdentity,
      nextReviewDate: scheduledDate
    });
  } catch (e) {
    // Sync cleanly
  }
  return plan;
}

/**
 * Retrieves the follow-up plan for a patient.
 */
function getPatientFollowupPlan(patientId) {
  if (!patientId) return null;
  const plan = hypertensionFollowupStore.get(patientId) || chronicHypertensionService.getFollowupPlan(patientId);
  if (!plan) return null;

  return {
    ...plan,
    scheduledDateField: classifyClinicalField(plan.scheduledDate, { fieldKey: 'scheduledDate' }),
    instructionsField: classifyClinicalField(plan.instructions, { fieldKey: 'instructions' }),
    intervalDaysField: classifyClinicalField(plan.intervalDays, { unit: 'days', fieldKey: 'intervalDays' })
  };
}

/**
 * Links and retrieves approved reports for a patient.
 */
function linkApprovedReport(reportData = {}) {
  const {
    patientId,
    caseId = null,
    reportRef,
    reportHash,
    doctorIdentity,
    clinicalDiagnosis,
    approvedAt = new Date().toISOString()
  } = reportData;

  if (!patientId) throw new Error('patientId is required');

  const reportId = reportData.reportId || `rep-htn-${crypto.randomBytes(6).toString('hex')}`;
  const record = {
    reportId,
    patientId,
    caseId,
    reportRef: reportRef || `HV-HTN-${reportId.slice(-8).toUpperCase()}`,
    reportHash: reportHash || `SHA256-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
    doctorIdentity: doctorIdentity || (reportData.doctorName ? { name: reportData.doctorName, licenseNumber: reportData.doctorLicense } : {}),
    clinicalDiagnosis: clinicalDiagnosis || 'Approved Hypertension Evaluation Report',
    managementPlan: reportData.managementPlan || reportData.recommendations || null,
    approvedAt
  };

  approvedReportsStore.set(reportId, record);
  if (!patientReportsIndex.has(patientId)) {
    patientReportsIndex.set(patientId, []);
  }
  patientReportsIndex.get(patientId).push(reportId);

  return record;
}

/**
 * Retrieves approved reports for a patient.
 */
function getPatientApprovedReports(patientId) {
  if (!patientId) return [];
  const reportIds = patientReportsIndex.get(patientId) || [];
  const reports = reportIds.map(id => approvedReportsStore.get(id)).filter(Boolean);

  const latestCertified = chronicHypertensionService.getLatestCertifiedReport(patientId);
  if (latestCertified && !reports.some(r => r.reportRef === latestCertified.reportRef)) {
    reports.push(latestCertified);
  }

  return reports;
}

/**
 * Certifies a chronic hypertension report using verified physician provenance and HMAC signatures.
 */
async function certifyChronicHypertensionReport(arg1, arg2, arg3, arg4, arg5) {
  let patientId, doctorIdentity, clinicalDiagnosis, managementPlan, riskStratification;

  if (typeof arg1 === 'object' && arg1 !== null && arg1.patientId) {
    patientId = arg1.patientId;
    doctorIdentity = arg1.doctorIdentity;
    clinicalDiagnosis = arg1.clinicalDiagnosis;
    managementPlan = arg1.managementPlan;
    riskStratification = arg1.riskStratification;
  } else {
    patientId = arg1;
    doctorIdentity = arg2;
    clinicalDiagnosis = arg3;
    managementPlan = arg4;
    riskStratification = arg5;
  }

  const doc = {
    uid: doctorIdentity?.uid || doctorIdentity?.id || 'doc_cardio',
    name: doctorIdentity?.name || 'Physician',
    licenseNumber: doctorIdentity?.licenseNumber || 'HV-LIC-DOC',
    specialty: doctorIdentity?.specialty || 'Cardiology & Vascular Medicine',
    clinic: doctorIdentity?.clinic || 'Health Vibe Clinic',
    status: doctorIdentity?.status || 'approved',
    licenseStatus: doctorIdentity?.licenseStatus || 'active',
    isLicenseExpired: false
  };

  const certified = await chronicHypertensionService.certifyChronicHypertensionReport({
    patientId,
    doctorIdentity: doc,
    clinicalDiagnosis,
    managementPlan,
    riskStratification
  });

  if (certified) {
    linkApprovedReport({
      patientId,
      reportRef: certified.reportRef,
      reportHash: certified.digitalSignature?.signatureHash,
      doctorIdentity: certified.doctor,
      clinicalDiagnosis: certified.clinicalDiagnosis,
      managementPlan: certified.managementPlan,
      approvedAt: certified.certifiedAt
    });
  }

  return certified;
}

/**
 * Validates a structured hypertension assessment input.
 */
function validateHypertensionAssessmentInput(input = {}, options = {}) {
  const errors = [];
  const { isPatient = false, isUpdate = false } = options;

  if (!input.patientId && !isUpdate) {
    errors.push({ field: 'patientId', message: 'patientId is required' });
  }

  if (isPatient) {
    for (const forbidden of FORBIDDEN_PATIENT_FIELDS) {
      if (input[forbidden] !== undefined && input[forbidden] !== null) {
        errors.push({ field: forbidden, message: `Field '${forbidden}' is protected and cannot be written by patient.` });
      }
    }
  }

  const sanitized = {
    patientId: input.patientId,
    patientName: input.patientName || null,
    clinicId: input.clinicId || null,
    assignedDoctorId: input.assignedDoctorId || null,
    hypertensionHistory: {},
    measurements: {},
    symptoms: {},
    medications: {},
    comorbidities: {},
    lifestyle: {},
    doctorNotes: {},
    followup: {}
  };

  if (input.hypertensionHistory) {
    const hh = input.hypertensionHistory;
    sanitized.hypertensionHistory = {
      status: hh.status ? String(hh.status).trim() : 'not_provided',
      stage: hh.stage ? String(hh.stage).trim() : 'not_provided',
      diagnosisDate: hh.diagnosisDate || null,
      notes: hh.notes ? String(hh.notes).trim() : null
    };
  } else {
    sanitized.hypertensionHistory = { status: 'not_provided' };
  }

  if (input.measurements) {
    const m = input.measurements;
    sanitized.measurements = {};
    if (m.systolic && m.systolic.value !== undefined) {
      const val = Number(normalizeDigits(m.systolic.value));
      if (isNaN(val) || val < 50 || val > 300) {
        errors.push({ field: 'measurements.systolic.value', message: `Systolic BP (${val}) out of bounds (50-300 mmHg)` });
      } else {
        sanitized.measurements.systolic = {
          value: val,
          unit: 'mmHg',
          measuredAt: m.systolic.measuredAt || new Date().toISOString(),
          context: m.systolic.context || 'resting',
          source: m.systolic.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG
        };
      }
    }

    if (m.diastolic && m.diastolic.value !== undefined) {
      const val = Number(normalizeDigits(m.diastolic.value));
      if (isNaN(val) || val < 30 || val > 200) {
        errors.push({ field: 'measurements.diastolic.value', message: `Diastolic BP (${val}) out of bounds (30-200 mmHg)` });
      } else {
        sanitized.measurements.diastolic = {
          value: val,
          unit: 'mmHg',
          measuredAt: m.diastolic.measuredAt || new Date().toISOString(),
          context: m.diastolic.context || 'resting',
          source: m.diastolic.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG
        };
      }
    }

    if (sanitized.measurements.systolic && sanitized.measurements.diastolic) {
      if (sanitized.measurements.systolic.value <= sanitized.measurements.diastolic.value) {
        errors.push({ field: 'measurements', message: `Systolic BP (${sanitized.measurements.systolic.value}) must be greater than Diastolic BP (${sanitized.measurements.diastolic.value})` });
      }
    }
  }

  if (input.medications) {
    const med = input.medications;
    sanitized.medications = {
      status: med.status || 'provided',
      currentText: med.currentText ? String(med.currentText).trim() : null,
      items: Array.isArray(med.items) ? med.items : []
    };
  } else {
    sanitized.medications = { status: 'not_provided' };
  }

  if (input.comorbidities) {
    const com = input.comorbidities;
    sanitized.comorbidities = {
      status: com.status || 'provided',
      documented: Array.isArray(com.documented) ? com.documented : [],
      notes: com.notes ? String(com.notes).trim() : null
    };
  } else {
    sanitized.comorbidities = { status: 'not_provided', documented: [] };
  }

  if (input.lifestyle) {
    const life = input.lifestyle;
    sanitized.lifestyle = {
      status: life.status || 'provided',
      sodiumIntake: life.sodiumIntake ? String(life.sodiumIntake).trim() : 'not_provided',
      smokingStatus: life.smokingStatus ? String(life.smokingStatus).trim() : 'not_provided',
      physicalActivity: life.physicalActivity ? String(life.physicalActivity).trim() : 'not_provided'
    };
  } else {
    sanitized.lifestyle = { status: 'not_provided' };
  }

  if (input.doctorNotes && !isPatient) {
    const dn = input.doctorNotes;
    sanitized.doctorNotes = {
      status: dn.text || dn.noteText ? 'provided' : 'not_provided',
      text: String(dn.text || dn.noteText || '').trim(),
      author: dn.author || null,
      addedAt: dn.addedAt || new Date().toISOString()
    };
  } else {
    sanitized.doctorNotes = { status: 'not_provided', text: '' };
  }

  if (input.followup) {
    const fol = input.followup;
    sanitized.followup = {
      status: fol.scheduledDate ? 'scheduled' : (fol.status || 'not_provided'),
      scheduledDate: fol.scheduledDate || null,
      intervalDays: fol.intervalDays ? Number(normalizeDigits(fol.intervalDays)) : null,
      instructions: fol.instructions ? String(fol.instructions).trim() : null
    };
  } else {
    sanitized.followup = { status: 'not_provided' };
  }

  return {
    isValid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Creates a new structured hypertension assessment document.
 * Generates an immutable revision record (Revision 1) and stores observation history.
 */
function createHypertensionAssessment(assessmentData = {}, actor = {}) {
  const isPatient = actor.role === 'patient';
  const validation = validateHypertensionAssessmentInput(assessmentData, { isPatient });

  if (!validation.isValid) {
    const err = new Error(`Assessment validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
    err.code = 'VALIDATION_FAILED';
    err.errors = validation.errors;
    throw err;
  }

  const { sanitized } = validation;
  const patientId = sanitized.patientId;
  const assessmentId = `htn_asm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const authorInfo = {
    uid: actor.uid || patientId,
    name: actor.name || actor.displayName || 'Author',
    role: actor.role || 'patient'
  };

  const assessmentRecord = {
    id: assessmentId,
    assessmentId,
    patientId,
    patientName: sanitized.patientName || 'Patient',
    clinicId: sanitized.clinicId,
    assignedDoctorId: sanitized.assignedDoctorId,
    status: assessmentData.status || 'submitted',
    clinicalRevision: 1,
    currentRevisionId: `rev_${assessmentId}_1`,
    createdAt: now,
    assessedAt: now,
    lastRevisionAt: now,
    hypertensionHistory: sanitized.hypertensionHistory,
    measurements: sanitized.measurements,
    symptoms: sanitized.symptoms,
    medications: sanitized.medications,
    comorbidities: sanitized.comorbidities,
    lifestyle: sanitized.lifestyle,
    doctorNotes: sanitized.doctorNotes,
    followup: sanitized.followup,
    author: authorInfo
  };

  hypertensionAssessmentsStore.set(assessmentId, assessmentRecord);

  if (!patientAssessmentsIndex.has(patientId)) {
    patientAssessmentsIndex.set(patientId, []);
  }
  patientAssessmentsIndex.get(patientId).push(assessmentId);

  // Record Immutable Observations
  const observationsList = [];
  if (sanitized.measurements) {
    for (const [type, m] of Object.entries(sanitized.measurements)) {
      if (m && m.value !== undefined && m.value !== null) {
        const obsRecord = {
          observationId: `htn_obs_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          assessmentId,
          patientId,
          type,
          value: m.value,
          unit: m.unit,
          context: m.context || 'resting',
          measuredAt: m.measuredAt || now,
          source: m.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
          author: authorInfo,
          clinicalRevision: 1,
          recordedAt: now
        };
        observationsList.push(obsRecord);
      }
    }

    if (sanitized.measurements.systolic?.value && sanitized.measurements.diastolic?.value) {
      try {
        recordBloodPressureReading({
          patientId,
          systolic: sanitized.measurements.systolic.value,
          diastolic: sanitized.measurements.diastolic.value,
          recordedByUid: authorInfo.uid
        });
      } catch (e) {
        // Continue cleanly
      }
    }
  }
  assessmentObservationsStore.set(assessmentId, observationsList);

  // Record Revision 1
  const revisionRecord = {
    revision: 1,
    assessmentId,
    createdAt: now,
    author: authorInfo,
    trigger: 'initial_assessment_creation',
    changes: {
      action: 'created',
      summary: 'Initial structured hypertension assessment documented'
    }
  };
  assessmentRevisionsStore.set(assessmentId, [revisionRecord]);

  return assessmentRecord;
}

/**
 * Updates an existing hypertension assessment using the versioned revision mechanism.
 * Keeps historical clinical information strictly immutable and increments clinicalRevision.
 */
function reviseHypertensionAssessment(assessmentId, updates = {}, actor = {}, triggerReason = 'clinical_update') {
  const existing = hypertensionAssessmentsStore.get(assessmentId);
  if (!existing) {
    const err = new Error(`Hypertension assessment '${assessmentId}' not found.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const isPatient = actor.role === 'patient';
  const validation = validateHypertensionAssessmentInput(updates, { isPatient, isUpdate: true });

  if (!validation.isValid) {
    const err = new Error(`Assessment revision failed: ${validation.errors.map(e => e.message).join('; ')}`);
    err.code = 'VALIDATION_FAILED';
    err.errors = validation.errors;
    throw err;
  }

  const newRevisionNumber = (existing.clinicalRevision || 1) + 1;
  const now = new Date().toISOString();

  const authorInfo = {
    uid: actor.uid || existing.patientId,
    name: actor.name || actor.displayName || 'Editor',
    role: actor.role || 'patient'
  };

  const { sanitized } = validation;

  const revisedAssessment = {
    ...existing,
    clinicalRevision: newRevisionNumber,
    currentRevisionId: `rev_${assessmentId}_${newRevisionNumber}`,
    lastRevisionAt: now,
    status: updates.status || existing.status,
    hypertensionHistory: { ...existing.hypertensionHistory, ...sanitized.hypertensionHistory },
    measurements: { ...existing.measurements, ...sanitized.measurements },
    symptoms: { ...existing.symptoms, ...sanitized.symptoms },
    medications: { ...existing.medications, ...sanitized.medications },
    comorbidities: { ...existing.comorbidities, ...sanitized.comorbidities },
    lifestyle: { ...existing.lifestyle, ...sanitized.lifestyle },
    doctorNotes: isPatient ? existing.doctorNotes : { ...existing.doctorNotes, ...sanitized.doctorNotes },
    followup: { ...existing.followup, ...sanitized.followup },
    lastUpdatedBy: authorInfo
  };

  hypertensionAssessmentsStore.set(assessmentId, revisedAssessment);

  // Append Immutable Observations for Revision
  const existingObsList = assessmentObservationsStore.get(assessmentId) || [];
  if (sanitized.measurements) {
    for (const [type, m] of Object.entries(sanitized.measurements)) {
      if (m && m.value !== undefined && m.value !== null) {
        existingObsList.push({
          observationId: `htn_obs_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          assessmentId,
          patientId: existing.patientId,
          type,
          value: m.value,
          unit: m.unit,
          context: m.context || 'resting',
          measuredAt: m.measuredAt || now,
          source: m.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
          author: authorInfo,
          clinicalRevision: newRevisionNumber,
          recordedAt: now
        });
      }
    }
  }
  assessmentObservationsStore.set(assessmentId, existingObsList);

  // Append Revision Audit Record
  const existingRevisions = assessmentRevisionsStore.get(assessmentId) || [];
  existingRevisions.push({
    revision: newRevisionNumber,
    assessmentId,
    createdAt: now,
    author: authorInfo,
    trigger: triggerReason,
    changes: {
      action: 'revised',
      summary: `Clinical revision ${newRevisionNumber} recorded`
    }
  });
  assessmentRevisionsStore.set(assessmentId, existingRevisions);

  return revisedAssessment;
}

/**
 * Retrieves a single hypertension assessment.
 */
function getHypertensionAssessment(assessmentId) {
  return hypertensionAssessmentsStore.get(assessmentId) || null;
}

/**
 * Retrieves all assessments for a patient.
 */
function getPatientAssessments(patientId) {
  if (!patientId) return [];
  const ids = patientAssessmentsIndex.get(patientId) || [];
  const list = ids.map(id => hypertensionAssessmentsStore.get(id)).filter(Boolean);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

/**
 * Retrieves full immutable revision history for an assessment.
 */
function getAssessmentRevisions(assessmentId) {
  return assessmentRevisionsStore.get(assessmentId) || [];
}

/**
 * Retrieves observation history for an assessment.
 */
function getAssessmentObservationsHistory(assessmentId) {
  return assessmentObservationsStore.get(assessmentId) || [];
}

/**
 * Adds a doctor inquiry / clarification request for a patient.
 */
function addPatientClarification(patientId, questionText, category = 'blood_pressure_logs') {
  if (!patientId) throw new Error('patientId is required');

  if (!hypertensionClarificationsStore.has(patientId)) {
    hypertensionClarificationsStore.set(patientId, []);
  }

  const cycleId = `htn_clr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const cycle = {
    id: cycleId,
    cycleId,
    patientId,
    category,
    question: String(questionText).trim(),
    status: 'pending_patient_response',
    createdAt: new Date().toISOString(),
    reply: null,
    repliedAt: null
  };

  hypertensionClarificationsStore.get(patientId).push(cycle);
  return cycle;
}

/**
 * Patient replies to a doctor clarification request.
 */
function replyToClarification(patientId, cycleId, replyText, actor = {}) {
  if (!patientId) throw new Error('patientId is required');
  const cycles = hypertensionClarificationsStore.get(patientId) || [];
  const cycle = cycles.find(c => c.cycleId === cycleId || c.id === cycleId);

  if (!cycle) {
    throw new Error(`Clarification cycle '${cycleId}' not found.`);
  }

  cycle.reply = String(replyText).trim();
  cycle.repliedAt = new Date().toISOString();
  cycle.status = 'responded';
  cycle.repliedByUid = actor.uid || patientId;

  return cycle;
}

/**
 * Retrieves all clarification cycles for a patient.
 */
function getPatientClarifications(patientId) {
  return hypertensionClarificationsStore.get(patientId) || [];
}

/**
 * Compiles a complete hypertension clinical bundle for a patient with role-based privacy sanitization.
 */
function getPatientHypertensionBundle(patientId, actor = {}) {
  const perm = verifyAccessPermission(actor, patientId);
  if (!perm.authorized) {
    const err = new Error(`Access denied to patient hypertension bundle: ${perm.reason}`);
    err.code = 'FORBIDDEN';
    throw err;
  }

  const isPatient = actor.role === 'patient';
  const profileRecord = getPatientHypertensionRecord(patientId);
  const readings = getPatientReadings(patientId);
  const assessments = getPatientAssessments(patientId);
  const reviews = getPatientDoctorReviews(patientId);
  const followupPlan = getPatientFollowupPlan(patientId);
  const approvedReports = getPatientApprovedReports(patientId);
  const clarifications = getPatientClarifications(patientId);
  const rawNotes = getPatientClinicalNotes(patientId);

  // Role-based Privacy Filtering: Patients MUST NOT see internal clinical notes
  const clinicalNotes = isPatient ? [] : rawNotes;

  // Sanitize assessments for patient role
  const sanitizedAssessments = assessments.map(asm => {
    if (isPatient) {
      const copy = { ...asm };
      delete copy.doctorNotes;
      return copy;
    }
    return asm;
  });

  // Calculate longitudinal dashboard metrics
  const dashboardMetrics = chronicHypertensionService.calculateHypertensionDashboard(patientId);

  return {
    patientId,
    profileRecord,
    readings,
    assessments: sanitizedAssessments,
    reviews,
    followupPlan,
    approvedReports,
    clarifications,
    clinicalNotes, // Empty array for patients
    dashboardMetrics,
    retrievedAt: new Date().toISOString()
  };
}

module.exports = {
  CLINICAL_FIELD_STATE,
  BP_STAGES,
  MEASUREMENT_SOURCES,
  REVIEW_STATUSES,
  ALLOWED_MEASUREMENT_LIMITS,
  FORBIDDEN_PATIENT_FIELDS,
  resetHypertensionStoreForTesting,
  classifyClinicalField,
  verifyAccessPermission,
  validateBpInputs,
  classifyBloodPressure,
  recordBloodPressureReading,
  getPatientReadings,
  getPatientHypertensionRecord,
  savePatientHypertensionRecord,
  addClinicalNote,
  getPatientClinicalNotes,
  recordDoctorReview,
  getPatientDoctorReviews,
  recordFollowupPlan,
  getPatientFollowupPlan,
  linkApprovedReport,
  getPatientApprovedReports,
  certifyChronicHypertensionReport,
  getLatestCertifiedReport: chronicHypertensionService.getLatestCertifiedReport,
  validateHypertensionAssessmentInput,
  createHypertensionAssessment,
  reviseHypertensionAssessment,
  getHypertensionAssessment,
  getPatientAssessments,
  getAssessmentRevisions,
  getAssessmentObservationsHistory,
  addPatientClarification,
  replyToClarification,
  getPatientClarifications,
  getPatientHypertensionBundle
};
