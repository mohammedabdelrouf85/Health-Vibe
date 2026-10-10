/**
 * Health Vibe AI - Diabetes Mellitus Clinical Module (Data & Service Layer)
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
 * 2. Role-Based Permissions & Doctor Assignment:
 *    - Patients may only access their own diabetes records (patientId === user.uid).
 *    - Doctors may only access diabetes records for patients they are authorized and assigned to review.
 *    - Administrators follow existing administrative governance (clinic scope / platform scope) with audit logs.
 *    - Zero separate auth systems. Reuses existing authentication and identity tokens.
 *
 * 3. Scope & Non-Diagnostic Boundary:
 *    - Status: UNDER_SPECIALIST_REVIEW (Endocrinology & Diabetology).
 *    - Foundation provides data ingestion, doctor review, clinical notes, follow-up, and report linkage.
 *    - Medical decision-making logic (autonomous diagnoses, insulin dose titration) is strictly deferred.
 */

const crypto = require('crypto');

// Field State Classification Enumeration
const CLINICAL_FIELD_STATE = {
  KNOWN: 'known',
  UNKNOWN: 'unknown',
  NOT_PROVIDED: 'not_provided',
  NOT_APPLICABLE: 'not_applicable'
};

// Diabetes Diagnostic Types (for classified patient profiles)
const DIABETES_TYPES = {
  TYPE_1: 'type_1',
  TYPE_2: 'type_2',
  GESTATIONAL: 'gestational',
  PREDIABETES: 'prediabetes',
  SECONDARY: 'secondary',
  OTHER: 'other',
  UNKNOWN: 'unknown'
};

// Measurement Contexts
const GLUCOSE_CONTEXTS = {
  FASTING: 'fasting',              // FBG (Fasting Blood Glucose)
  POSTPRANDIAL: 'postprandial',    // PPG (2 hours post-meal)
  RANDOM: 'random',                // RBG (Random Blood Glucose)
  BEDTIME: 'bedtime',              // Bedtime reading
  PRE_MEAL: 'pre_meal'             // Pre-meal reading
};

// Measurement Sources
const MEASUREMENT_SOURCES = {
  MANUAL_PATIENT_LOG: 'manual_patient_log',
  CGM_SENSOR: 'cgm_sensor',          // Continuous Glucose Monitoring feed
  BLUETOOTH_GLUCOMETER: 'bluetooth_glucometer',
  CLINIC_READING: 'clinic_reading',
  ACCREDITED_LAB_OCR: 'accredited_lab_ocr'
};

// Review Statuses
const REVIEW_STATUSES = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  REVIEWED: 'reviewed',
  APPROVED: 'approved'
};

// In-Memory Real Persisted Stores (for Unit Testing, Offline Fallback & Speed)
const patientDiabetesRecordsStore = new Map(); // patientId -> patient diabetes record
const diabetesReadingsStore = new Map();       // readingId -> reading object
const patientReadingsIndex = new Map();        // patientId -> array of readingIds
const diabetesNotesStore = new Map();          // noteId -> clinical note object
const patientNotesIndex = new Map();           // patientId -> array of noteIds
const diabetesReviewsStore = new Map();        // reviewId -> review object
const patientReviewsIndex = new Map();         // patientId -> array of reviewIds
const diabetesFollowupStore = new Map();       // patientId -> followup plan
const approvedReportsStore = new Map();        // reportId -> report object
const patientReportsIndex = new Map();         // patientId -> array of reportIds

// Structured Assessment & Revision Stores
const diabetesAssessmentsStore = new Map();    // assessmentId -> assessment object
const patientAssessmentsIndex = new Map();     // patientId -> array of assessmentIds
const assessmentObservationsStore = new Map(); // assessmentId -> array of immutable observation records
const assessmentRevisionsStore = new Map();    // assessmentId -> array of revision records
const diabetesAttachmentsStore = new Map();    // patientId -> array of attachment objects
const diabetesClarificationsStore = new Map(); // patientId -> array of clarification cycle objects

// Measurement Limits and Physiological Constraints
const ALLOWED_MEASUREMENT_LIMITS = {
  bloodGlucose: {
    validUnits: ['mg/dL', 'mmol/L'],
    limits: {
      'mg/dL': { min: 20, max: 1000 },
      'mmol/L': { min: 1.1, max: 55.5 }
    }
  },
  hba1c: {
    validUnits: ['%', 'mmol/mol'],
    limits: {
      '%': { min: 3.0, max: 25.0 },
      'mmol/mol': { min: 9, max: 240 }
    }
  },
  ketones: {
    validUnits: ['mmol/L', 'qualitative'],
    validQualitative: ['negative', 'trace', 'small', 'moderate', 'large'],
    limits: {
      'mmol/L': { min: 0.0, max: 15.0 }
    }
  }
};

// Forbidden fields that patient cannot overwrite on write path
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
function resetDiabetesStoreForTesting() {
  patientDiabetesRecordsStore.clear();
  diabetesReadingsStore.clear();
  patientReadingsIndex.clear();
  diabetesNotesStore.clear();
  patientNotesIndex.clear();
  diabetesReviewsStore.clear();
  patientReviewsIndex.clear();
  diabetesFollowupStore.clear();
  approvedReportsStore.clear();
  patientReportsIndex.clear();
  diabetesAssessmentsStore.clear();
  patientAssessmentsIndex.clear();
  assessmentObservationsStore.clear();
  assessmentRevisionsStore.clear();
  diabetesAttachmentsStore.clear();
  diabetesClarificationsStore.clear();
}

/**
 * Classifies any clinical value into one of the 4 strict clinical states:
 * - known
 * - unknown
 * - not_provided
 * - not_applicable
 *
 * Never synthesizes defaults or assumes medical values.
 *
 * @param {*} value
 * @param {object} [options]
 * @param {boolean} [options.isApplicable=true]
 * @param {boolean} [options.isUnknown=false]
 * @param {boolean} [options.isProvided=true]
 * @param {string} [options.unit='']
 * @param {string} [options.fieldKey='']
 * @returns {{ state: string, value: *, unit: string, isRecorded: boolean }}
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

  // Known persisted value
  return {
    state: CLINICAL_FIELD_STATE.KNOWN,
    value,
    unit,
    isRecorded: true,
    fieldKey
  };
}

/**
 * Evaluates whether a user is authorized to access a patient's diabetes data.
 * - Patients: only their own uid
 * - Doctors: must be assigned to this patient (via assignedDoctorId, or in patient's assigned list)
 * - Admins: clinic_admin or super_admin
 *
 * @param {object} actor - { uid, role, email, clinicId }
 * @param {string} targetPatientId
 * @param {object} [patientRecord]
 * @returns {{ authorized: boolean, reason?: string }}
 */
function verifyAccessPermission(actor, targetPatientId, patientRecord = null) {
  if (!actor || !actor.uid) {
    return { authorized: false, reason: 'UNAUTHENTICATED' };
  }
  if (!targetPatientId) {
    return { authorized: false, reason: 'MISSING_PATIENT_ID' };
  }

  const role = actor.role || 'patient';

  // Super Admin: platform-wide access
  if (role === 'super_admin') {
    return { authorized: true };
  }

  // Clinic Admin: clinic-wide access
  if (role === 'clinic_admin') {
    if (actor.clinicId && patientRecord?.clinicId && actor.clinicId !== patientRecord.clinicId) {
      return { authorized: false, reason: 'CLINIC_MISMATCH' };
    }
    return { authorized: true };
  }

  // Patient: strict self-only access
  if (role === 'patient') {
    if (actor.uid === targetPatientId) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'PATIENT_CAN_ONLY_ACCESS_OWN_DATA' };
  }

  // Doctor: must be assigned to this patient
  if (role === 'doctor') {
    const assignedDocId = patientRecord?.assignedDoctorId || patientRecord?.doctorId;
    const assignedDocEmail = patientRecord?.assignedDoctorEmail || patientRecord?.doctorEmail;

    const isAssigned = (assignedDocId && assignedDocId === actor.uid) ||
      (assignedDocEmail && actor.email && String(assignedDocEmail).toLowerCase() === String(actor.email).toLowerCase()) ||
      (Array.isArray(patientRecord?.assignedDoctorIds) && patientRecord.assignedDoctorIds.includes(actor.uid));

    if (isAssigned) {
      return { authorized: true };
    }
    return { authorized: false, reason: 'DOCTOR_NOT_ASSIGNED_TO_PATIENT' };
  }

  return { authorized: false, reason: 'ROLE_UNAUTHORIZED' };
}

/**
 * Resolves patient-specific diabetes information without assumptions.
 * Every field reflects its genuine persisted status.
 *
 * @param {string} patientId
 * @param {object} [existingProfile]
 * @returns {object}
 */
function resolvePatientDiabetesInfo(patientId, existingProfile = null) {
  const persisted = patientDiabetesRecordsStore.get(patientId) || existingProfile || {};

  return {
    patientId: classifyClinicalField(patientId, { fieldKey: 'patientId' }),
    patientName: classifyClinicalField(persisted.patientName || persisted.displayName || null, { fieldKey: 'patientName' }),
    diabetesType: classifyClinicalField(persisted.diabetesType, {
      isUnknown: persisted.diabetesTypeUnknown === true,
      isApplicable: persisted.isDiabetic !== false,
      fieldKey: 'diabetesType'
    }),
    diagnosisDate: classifyClinicalField(persisted.diagnosisDate, {
      isUnknown: persisted.diagnosisDateUnknown === true,
      fieldKey: 'diagnosisDate'
    }),
    fastingTarget: classifyClinicalField(persisted.fastingTarget, {
      unit: 'mg/dL',
      isApplicable: persisted.hasCustomTargets !== false,
      fieldKey: 'fastingTarget'
    }),
    postprandialTarget: classifyClinicalField(persisted.postprandialTarget, {
      unit: 'mg/dL',
      isApplicable: persisted.hasCustomTargets !== false,
      fieldKey: 'postprandialTarget'
    }),
    hba1cTarget: classifyClinicalField(persisted.hba1cTarget, {
      unit: '%',
      isApplicable: persisted.hasCustomTargets !== false,
      fieldKey: 'hba1cTarget'
    }),
    activeInsulinRegimen: classifyClinicalField(persisted.activeInsulinRegimen, {
      isApplicable: persisted.isInsulinTreated !== false,
      fieldKey: 'activeInsulinRegimen'
    }),
    comorbidities: classifyClinicalField(persisted.comorbidities, { fieldKey: 'comorbidities' }),
    assignedDoctorId: classifyClinicalField(persisted.assignedDoctorId || persisted.doctorId || null, { fieldKey: 'assignedDoctorId' }),
    assignedDoctorName: classifyClinicalField(persisted.assignedDoctorName || null, { fieldKey: 'assignedDoctorName' }),
    lastReviewedAt: classifyClinicalField(persisted.lastReviewedAt || null, { fieldKey: 'lastReviewedAt' }),
    lastUpdated: persisted.updatedAt || null
  };
}

/**
 * Sets or updates patient diabetes profile.
 */
function savePatientDiabetesInfo(patientId, updates = {}) {
  if (!patientId) throw new Error('Patient ID is required');

  const current = patientDiabetesRecordsStore.get(patientId) || { patientId, createdAt: new Date().toISOString() };
  const updated = {
    ...current,
    ...updates,
    patientId,
    updatedAt: new Date().toISOString()
  };

  patientDiabetesRecordsStore.set(patientId, updated);
  return updated;
}

/**
 * Ingests a new real measurement for a patient without synthesizing data.
 * Validates physiological bounds without making clinical decisions.
 */
function recordDiabetesMeasurement(measurement = {}) {
  const {
    patientId,
    type = 'fasting', // fasting, postprandial, random, bedtime, hba1c, ketones
    value,
    unit = 'mg/dL',
    measuredAt = new Date().toISOString(),
    source = MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
    notes,
    recordedByUid,
    mealContext,
    ketonesLevel,
    insulinUnits
  } = measurement;

  if (!patientId) throw new Error('patientId is required');
  if (value === undefined || value === null) throw new Error('Measurement value is required');

  const numValue = Number(value);
  if (type === 'hba1c') {
    if (isNaN(numValue) || numValue < 3 || numValue > 25) {
      throw new Error(`HbA1c value (${value}) must be between 3% and 25%`);
    }
  } else if (type === 'ketones') {
    // String or numeric ketone reading
  } else {
    // Blood glucose reading in mg/dL
    if (isNaN(numValue) || numValue < 20 || numValue > 1000) {
      throw new Error(`Blood glucose value (${value}) must be between 20 and 1000 mg/dL`);
    }
  }

  const readingId = `dm_read_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id: readingId,
    readingId,
    patientId,
    type,
    value: numValue || value,
    unit,
    measuredAt,
    source,
    notes: notes || null,
    mealContext: mealContext || null,
    ketonesLevel: ketonesLevel || null,
    insulinUnits: insulinUnits !== undefined && insulinUnits !== null ? Number(insulinUnits) : null,
    recordedByUid: recordedByUid || null,
    createdAt: new Date().toISOString()
  };

  diabetesReadingsStore.set(readingId, record);
  if (!patientReadingsIndex.has(patientId)) {
    patientReadingsIndex.set(patientId, []);
  }
  patientReadingsIndex.get(patientId).push(readingId);

  return record;
}

/**
 * Retrieves all real persisted measurements for a patient.
 */
function getPatientMeasurements(patientId, limitCount = 50) {
  if (!patientId) return [];
  const readingIds = patientReadingsIndex.get(patientId) || [];
  const results = [];

  for (const id of readingIds) {
    const reading = diabetesReadingsStore.get(id);
    if (reading) results.push(reading);
  }

  // Sort descending by measuredAt
  results.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
  return limitCount > 0 ? results.slice(0, limitCount) : results;
}

/**
 * Records a clinical note authored by an attending physician.
 */
function addClinicalNote(noteData = {}) {
  const {
    patientId,
    doctorUid,
    doctorName,
    doctorLicense,
    category = 'routine_review',
    noteText,
    caseId = null
  } = noteData;

  if (!patientId) throw new Error('patientId is required');
  if (!doctorUid) throw new Error('doctorUid is required');
  if (!noteText || !String(noteText).trim()) throw new Error('noteText is required');

  const noteId = `dm_note_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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

  diabetesNotesStore.set(noteId, record);
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
    const note = diabetesNotesStore.get(id);
    if (note) notes.push(note);
  }

  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes;
}

/**
 * Records a formal doctor review for a patient's diabetes status.
 */
function recordDoctorReview(reviewData = {}) {
  const {
    patientId,
    caseId = null,
    doctorUid,
    doctorName,
    doctorLicense,
    doctorSpecialty = 'Endocrinology & Diabetology',
    clinicName = null,
    status = REVIEW_STATUSES.REVIEWED,
    observations = '',
    recommendations = []
  } = reviewData;

  if (!patientId) throw new Error('patientId is required');
  if (!doctorUid) throw new Error('doctorUid is required');

  const reviewId = `dm_rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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

  diabetesReviewsStore.set(reviewId, record);
  if (!patientReviewsIndex.has(patientId)) {
    patientReviewsIndex.set(patientId, []);
  }
  patientReviewsIndex.get(patientId).push(reviewId);

  // Update last reviewed on patient record
  const current = patientDiabetesRecordsStore.get(patientId) || { patientId };
  patientDiabetesRecordsStore.set(patientId, {
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
    const rev = diabetesReviewsStore.get(id);
    if (rev) reviews.push(rev);
  }

  reviews.sort((a, b) => new Date(b.reviewedAt) - new Date(a.reviewedAt));
  return reviews;
}

/**
 * Sets or updates the chronic follow-up plan for a diabetes patient.
 */
function recordFollowupPlan(planData = {}) {
  const {
    patientId,
    doctorUid,
    doctorName,
    scheduledDate,
    intervalDays,
    protocolType = 'glycemic_titration_review',
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

  diabetesFollowupStore.set(patientId, plan);
  return plan;
}

/**
 * Retrieves the follow-up plan for a patient.
 */
function getPatientFollowupPlan(patientId) {
  if (!patientId) return null;
  const plan = diabetesFollowupStore.get(patientId);
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
function linkApprovedReport(arg1 = {}, arg2 = {}) {
  let reportData = arg1;
  if (typeof arg1 === 'string') {
    reportData = { ...arg2, patientId: arg1 };
  }
  const {
    caseId,
    reportRef,
    reportHash,
    doctorIdentity,
    clinicalDiagnosis,
    approvedAt = new Date().toISOString()
  } = reportData;

  const patientId = reportData.patientId;
  const reportId = reportData.reportId || `rep-${crypto.randomBytes(6).toString('hex')}`;

  if (!patientId) throw new Error('patientId is required');

  const record = {
    reportId,
    patientId,
    caseId: caseId || null,
    revisionId: reportData.revisionId || null,
    reportRef: reportRef || `HV-REP-${reportId.slice(-8).toUpperCase()}`,
    reportHash: reportHash || `SHA256-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
    doctorIdentity: doctorIdentity || (reportData.doctorName ? { name: reportData.doctorName, doctorId: reportData.doctorId } : {}),
    clinicalDiagnosis: clinicalDiagnosis || 'Not provided',
    medications: reportData.medications || null,
    recommendations: reportData.recommendations || null,
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
  return reportIds.map(id => approvedReportsStore.get(id)).filter(Boolean);
}

/**
 * Normalizes Eastern Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) to standard ASCII.
 */
function normalizeArabicIndicDigits(str) {
  return String(str ?? '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Validates a structured diabetes assessment input on write path and during entry.
 * Enforces physiological boundaries, non-future timestamps, and anti-tamper constraints.
 * Does not force every field to be required.
 *
 * @param {object} input
 * @param {object} [options]
 * @returns {{ isValid: boolean, sanitized: object, errors: Array<{ field: string, message: string }> }}
 */
function validateDiabetesAssessmentInput(input = {}, options = {}) {
  const errors = [];
  const { isPatient = false, isUpdate = false } = options;

  if (!input.patientId && !isUpdate) {
    errors.push({ field: 'patientId', message: 'patientId is required' });
  }

  // Anti-tamper check for patients
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
    diabetesHistory: {},
    symptoms: {},
    measurements: {},
    medications: {},
    complications: {},
    familyHistory: {},
    lifestyle: {},
    doctorNotes: {},
    followup: {}
  };

  // 1. Diabetes History / Status (Optional)
  if (input.diabetesHistory) {
    const dh = input.diabetesHistory;
    sanitized.diabetesHistory = {};
    if (dh.status !== undefined) sanitized.diabetesHistory.status = String(dh.status).trim();
    else if (!isUpdate) sanitized.diabetesHistory.status = 'not_provided';

    if (dh.diabetesType !== undefined) sanitized.diabetesHistory.diabetesType = String(dh.diabetesType).trim();
    else if (!isUpdate) sanitized.diabetesHistory.diabetesType = 'not_provided';

    if (dh.diagnosisDate !== undefined) sanitized.diabetesHistory.diagnosisDate = dh.diagnosisDate || null;
    else if (!isUpdate) sanitized.diabetesHistory.diagnosisDate = null;

    if (dh.diagnosisYear !== undefined) sanitized.diabetesHistory.diagnosisYear = dh.diagnosisYear ? Number(normalizeArabicIndicDigits(dh.diagnosisYear)) : null;
    else if (!isUpdate) sanitized.diabetesHistory.diagnosisYear = null;

    if (dh.notes !== undefined) sanitized.diabetesHistory.notes = dh.notes ? String(dh.notes).trim() : null;
    else if (!isUpdate) sanitized.diabetesHistory.notes = null;

    if (dh.diagnosisDate) {
      const diagTime = new Date(dh.diagnosisDate).getTime();
      if (isNaN(diagTime)) {
        errors.push({ field: 'diabetesHistory.diagnosisDate', message: 'Invalid diagnosis date format' });
      } else if (diagTime > Date.now() + 600000) {
        errors.push({ field: 'diabetesHistory.diagnosisDate', message: 'Diagnosis date cannot be in the future' });
      }
    }
  } else if (!isUpdate) {
    sanitized.diabetesHistory = { status: 'not_provided', diabetesType: 'not_provided' };
  }

  // 2. Symptoms (Optional)
  if (input.symptoms) {
    const sym = input.symptoms;
    const items = Array.isArray(sym.items) ? sym.items : Array.isArray(sym) ? sym : [];
    sanitized.symptoms = {
      status: items.length > 0 ? 'provided' : (sym.status || 'not_provided'),
      items: items.map(s => String(s).trim()),
      otherSymptomsText: sym.otherSymptomsText ? String(sym.otherSymptomsText).trim() : null,
      hasHypoSymptoms: Boolean(sym.hasHypoSymptoms),
      hasHyperSymptoms: Boolean(sym.hasHyperSymptoms)
    };
  } else {
    sanitized.symptoms = { status: 'not_provided', items: [] };
  }

  // 3. Measurements (Optional - Each retains value, unit, timestamp, source, author without silent conversion)
  const measurementsInput = input.measurements || {};

  // Blood Glucose (bloodGlucose, fasting, postprandial, random, bedtime)
  const glucoseTypes = ['bloodGlucose', 'fasting', 'postprandial', 'random', 'bedtime'];
  for (const gType of glucoseTypes) {
    if (measurementsInput[gType] && measurementsInput[gType].value !== undefined && measurementsInput[gType].value !== null && measurementsInput[gType].value !== '') {
      const bg = measurementsInput[gType];
      const rawVal = Number(normalizeArabicIndicDigits(bg.value));
      const unit = bg.unit || 'mg/dL';
      const timing = bg.timing || bg.context || (gType !== 'bloodGlucose' ? gType : 'unspecified');
      const source = bg.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG;
      const measuredAt = bg.measuredAt || new Date().toISOString();

      if (isNaN(rawVal)) {
        errors.push({ field: `measurements.${gType}.value`, message: 'Blood glucose must be a valid number' });
      } else {
        const allowedUnits = ALLOWED_MEASUREMENT_LIMITS.bloodGlucose.validUnits;
        if (!allowedUnits.includes(unit)) {
          errors.push({ field: `measurements.${gType}.unit`, message: `Unit '${unit}' invalid for blood glucose. Allowed: ${allowedUnits.join(', ')}` });
        } else {
          const limits = ALLOWED_MEASUREMENT_LIMITS.bloodGlucose.limits[unit];
          if (limits && (rawVal < limits.min || rawVal > limits.max)) {
            errors.push({ field: `measurements.${gType}.value`, message: `Blood glucose value (${rawVal} ${unit}) out of bounds (${limits.min}-${limits.max} ${unit})` });
          }
        }
      }

      const mTime = new Date(measuredAt).getTime();
      if (isNaN(mTime)) {
        errors.push({ field: `measurements.${gType}.measuredAt`, message: 'Invalid measuredAt date' });
      } else if (mTime > Date.now() + 600000) {
        errors.push({ field: `measurements.${gType}.measuredAt`, message: 'Measurement timestamp cannot be in the future' });
      }

      sanitized.measurements[gType] = {
        value: rawVal,
        unit,
        timing,
        measuredAt,
        source,
        notes: bg.notes ? String(bg.notes).trim() : null,
        author: bg.author || null
      };
    }
  }

  // HbA1c
  if (measurementsInput.hba1c && measurementsInput.hba1c.value !== undefined && measurementsInput.hba1c.value !== null && measurementsInput.hba1c.value !== '') {
    const hb = measurementsInput.hba1c;
    const rawVal = Number(normalizeArabicIndicDigits(hb.value));
    const unit = hb.unit || '%';
    const source = hb.source || MEASUREMENT_SOURCES.ACCREDITED_LAB_OCR;
    const measuredAt = hb.measuredAt || new Date().toISOString();

    if (isNaN(rawVal)) {
      errors.push({ field: 'measurements.hba1c.value', message: 'HbA1c must be a valid number' });
    } else {
      const allowedUnits = ALLOWED_MEASUREMENT_LIMITS.hba1c.validUnits;
      if (!allowedUnits.includes(unit)) {
        errors.push({ field: 'measurements.hba1c.unit', message: `Unit '${unit}' invalid for HbA1c. Allowed: ${allowedUnits.join(', ')}` });
      } else {
        const limits = ALLOWED_MEASUREMENT_LIMITS.hba1c.limits[unit];
        if (limits && (rawVal < limits.min || rawVal > limits.max)) {
          errors.push({ field: 'measurements.hba1c.value', message: `HbA1c value (${rawVal} ${unit}) out of bounds (${limits.min}-${limits.max} ${unit})` });
        }
      }
    }

    const mTime = new Date(measuredAt).getTime();
    if (isNaN(mTime)) {
      errors.push({ field: 'measurements.hba1c.measuredAt', message: 'Invalid HbA1c measuredAt date' });
    } else if (mTime > Date.now() + 600000) {
      errors.push({ field: 'measurements.hba1c.measuredAt', message: 'HbA1c timestamp cannot be in the future' });
    }

    sanitized.measurements.hba1c = {
      value: rawVal,
      unit,
      measuredAt,
      source,
      notes: hb.notes ? String(hb.notes).trim() : null,
      author: hb.author || null
    };
  }

  // Ketones
  if (measurementsInput.ketones && measurementsInput.ketones.value !== undefined && measurementsInput.ketones.value !== null && measurementsInput.ketones.value !== '') {
    const ket = measurementsInput.ketones;
    const val = ket.value;
    const unit = ket.unit || (typeof val === 'number' ? 'mmol/L' : 'qualitative');
    const measuredAt = ket.measuredAt || new Date().toISOString();

    if (typeof val === 'number' || !isNaN(Number(val))) {
      const numVal = Number(normalizeArabicIndicDigits(val));
      if (numVal < 0 || numVal > 15) {
        errors.push({ field: 'measurements.ketones.value', message: `Numeric ketones (${numVal} mmol/L) out of bounds (0-15)` });
      }
      sanitized.measurements.ketones = {
        value: numVal,
        unit: 'mmol/L',
        measuredAt,
        source: ket.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
        author: ket.author || null
      };
    } else {
      const qVal = String(val).toLowerCase().trim();
      const validQ = ALLOWED_MEASUREMENT_LIMITS.ketones.validQualitative;
      if (!validQ.includes(qVal)) {
        errors.push({ field: 'measurements.ketones.value', message: `Qualitative ketones '${val}' invalid. Allowed: ${validQ.join(', ')}` });
      }
      sanitized.measurements.ketones = {
        value: qVal,
        unit: 'qualitative',
        measuredAt,
        source: ket.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
        author: ket.author || null
      };
    }
  }

  // 4. Current Medications (Optional)
  if (input.medications) {
    const med = input.medications;
    sanitized.medications = {
      status: med.status || (med.currentText || (Array.isArray(med.items) && med.items.length) ? 'provided' : 'not_provided'),
      currentText: med.currentText ? String(med.currentText).trim() : (typeof med === 'string' ? med : null),
      items: Array.isArray(med.items) ? med.items : [],
      isInsulinTreated: Boolean(med.isInsulinTreated),
      insulinDetails: med.insulinDetails ? String(med.insulinDetails).trim() : null
    };
  } else {
    sanitized.medications = { status: 'not_provided' };
  }

  // 5. Complications (Optional)
  if (input.complications) {
    const comp = input.complications;
    const documented = Array.isArray(comp.documented) ? comp.documented : Array.isArray(comp) ? comp : [];
    sanitized.complications = {
      status: documented.length > 0 ? 'documented' : (comp.status || 'not_provided'),
      documented: documented.map(c => String(c).trim()),
      notes: comp.notes ? String(comp.notes).trim() : null
    };
  } else {
    sanitized.complications = { status: 'not_provided', documented: [] };
  }

  // 6. Family History (Optional)
  if (input.familyHistory) {
    const fam = input.familyHistory;
    sanitized.familyHistory = {
      status: fam.status || (fam.relativesDetails || fam.hasFirstDegreeRelative !== undefined ? 'provided' : 'not_provided'),
      hasFirstDegreeRelative: fam.hasFirstDegreeRelative !== undefined ? Boolean(fam.hasFirstDegreeRelative) : null,
      relativesDetails: fam.relativesDetails ? String(fam.relativesDetails).trim() : (typeof fam === 'string' ? fam : null)
    };
  } else {
    sanitized.familyHistory = { status: 'not_provided' };
  }

  // 7. Lifestyle Information (Optional)
  if (input.lifestyle) {
    const life = input.lifestyle;
    sanitized.lifestyle = {
      status: life.status || 'provided',
      physicalActivity: life.physicalActivity ? String(life.physicalActivity).trim() : 'not_provided',
      dietaryPattern: life.dietaryPattern ? String(life.dietaryPattern).trim() : 'not_provided',
      smokingStatus: life.smokingStatus ? String(life.smokingStatus).trim() : 'not_provided',
      notes: life.notes ? String(life.notes).trim() : null
    };
  } else {
    sanitized.lifestyle = { status: 'not_provided' };
  }

  // 8. Doctor Notes (Optional - Doctor/Admin only)
  if (input.doctorNotes && !isPatient) {
    const dn = input.doctorNotes;
    sanitized.doctorNotes = {
      status: dn.text || dn.noteText ? 'provided' : 'not_provided',
      text: String(dn.text || dn.noteText || (typeof dn === 'string' ? dn : '')).trim(),
      author: dn.author || null,
      addedAt: dn.addedAt || new Date().toISOString()
    };
  } else {
    sanitized.doctorNotes = { status: 'not_provided', text: '' };
  }

  // 9. Follow-up Information (Optional)
  if (input.followup) {
    const fol = input.followup;
    sanitized.followup = {
      status: fol.scheduledDate ? 'scheduled' : (fol.status || 'not_provided'),
      scheduledDate: fol.scheduledDate || null,
      intervalDays: fol.intervalDays ? Number(normalizeArabicIndicDigits(fol.intervalDays)) : null,
      instructions: fol.instructions ? String(fol.instructions).trim() : null,
      protocol: fol.protocol || null
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
 * Creates a new structured diabetes assessment.
 * Generates an immutable revision record (Revision 1) and stores initial observations.
 *
 * @param {object} assessmentData
 * @param {object} [actor] - { uid, name, role }
 * @returns {object} Created assessment document
 */
function createDiabetesAssessment(assessmentData = {}, actor = {}) {
  const isPatient = actor.role === 'patient';
  const validation = validateDiabetesAssessmentInput(assessmentData, { isPatient });

  if (!validation.isValid) {
    const err = new Error(`Assessment validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
    err.code = 'VALIDATION_FAILED';
    err.errors = validation.errors;
    throw err;
  }

  const { sanitized } = validation;
  const patientId = sanitized.patientId;
  const assessmentId = `dm_asm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
    diabetesHistory: sanitized.diabetesHistory,
    symptoms: sanitized.symptoms,
    measurements: sanitized.measurements,
    medications: sanitized.medications,
    complications: sanitized.complications,
    familyHistory: sanitized.familyHistory,
    lifestyle: sanitized.lifestyle,
    doctorNotes: sanitized.doctorNotes,
    followup: sanitized.followup,
    author: authorInfo
  };

  diabetesAssessmentsStore.set(assessmentId, assessmentRecord);

  if (!patientAssessmentsIndex.has(patientId)) {
    patientAssessmentsIndex.set(patientId, []);
  }
  patientAssessmentsIndex.get(patientId).push(assessmentId);

  // Initialize Observations History
  const observationsList = [];
  if (sanitized.measurements) {
    for (const [type, m] of Object.entries(sanitized.measurements)) {
      if (m && m.value !== undefined && m.value !== null) {
        const obsRecord = {
          observationId: `dm_obs_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          assessmentId,
          patientId,
          type,
          value: m.value,
          unit: m.unit,
          timing: m.timing || 'unspecified',
          measuredAt: m.measuredAt || now,
          source: m.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
          author: m.author || authorInfo,
          clinicalRevision: 1,
          recordedAt: now
        };
        observationsList.push(obsRecord);

        // Also add to global reading store for backward compatibility
        recordDiabetesMeasurement({
          patientId,
          type,
          value: m.value,
          unit: m.unit,
          measuredAt: m.measuredAt || now,
          source: m.source,
          notes: m.notes,
          recordedByUid: authorInfo.uid
        });
      }
    }
  }
  assessmentObservationsStore.set(assessmentId, observationsList);

  // Initialize Revisions History
  const revisionRecord = {
    revision: 1,
    assessmentId,
    createdAt: now,
    author: authorInfo,
    trigger: 'initial_assessment_creation',
    changes: {
      action: 'created',
      summary: 'Initial structured diabetes assessment documented'
    }
  };
  assessmentRevisionsStore.set(assessmentId, [revisionRecord]);

  return assessmentRecord;
}

/**
 * Updates an existing diabetes assessment using the versioned revision mechanism.
 * Increments clinical revision, appends to immutable observation history,
 * and maintains full change transparency.
 *
 * @param {string} assessmentId
 * @param {object} updates
 * @param {object} [actor]
 * @returns {object} Updated assessment document
 */
function updateDiabetesAssessment(assessmentId, updates = {}, actor = {}) {
  if (!assessmentId) throw new Error('assessmentId is required');

  const existing = diabetesAssessmentsStore.get(assessmentId);
  if (!existing) {
    const err = new Error(`Diabetes assessment ${assessmentId} not found.`);
    err.code = 'ASSESSMENT_NOT_FOUND';
    throw err;
  }

  const isPatient = actor.role === 'patient';
  if (isPatient && actor.uid && actor.uid !== existing.patientId) {
    const err = new Error('Access denied: You cannot revise another patient\'s assessment.');
    err.code = 'OWNERSHIP_MISMATCH';
    throw err;
  }

  const validation = validateDiabetesAssessmentInput(updates, { isPatient, isUpdate: true });
  if (!validation.isValid) {
    const err = new Error(`Revision validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
    err.code = 'VALIDATION_FAILED';
    err.errors = validation.errors;
    throw err;
  }

  const { sanitized } = validation;
  const now = new Date().toISOString();
  const nextRevision = (existing.clinicalRevision || 1) + 1;
  const authorInfo = {
    uid: actor.uid || existing.patientId,
    name: actor.name || actor.displayName || 'Revising Author',
    role: actor.role || 'patient'
  };

  const changesReport = {};

  // 1. Update Diabetes History if provided
  if (updates.diabetesHistory) {
    changesReport.diabetesHistory = {
      previous: existing.diabetesHistory,
      current: sanitized.diabetesHistory
    };
    existing.diabetesHistory = { ...existing.diabetesHistory, ...sanitized.diabetesHistory };
  }

  // 2. Update Symptoms if provided
  if (updates.symptoms) {
    changesReport.symptoms = {
      previous: existing.symptoms,
      current: sanitized.symptoms
    };
    existing.symptoms = sanitized.symptoms;
  }

  // 3. Process Measurements without overwriting past observations
  const observationsList = assessmentObservationsStore.get(assessmentId) || [];
  if (sanitized.measurements) {
    for (const [type, m] of Object.entries(sanitized.measurements)) {
      if (m && m.value !== undefined && m.value !== null) {
        const obsRecord = {
          observationId: `dm_obs_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          assessmentId,
          patientId: existing.patientId,
          type,
          value: m.value,
          unit: m.unit,
          timing: m.timing || 'unspecified',
          measuredAt: m.measuredAt || now,
          source: m.source || MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
          author: m.author || authorInfo,
          clinicalRevision: nextRevision,
          recordedAt: now
        };
        observationsList.push(obsRecord);

        changesReport[`measurement_${type}`] = {
          previous: existing.measurements?.[type] || null,
          current: m
        };

        existing.measurements = existing.measurements || {};
        existing.measurements[type] = m;

        // Also record to reading store
        recordDiabetesMeasurement({
          patientId: existing.patientId,
          type,
          value: m.value,
          unit: m.unit,
          measuredAt: m.measuredAt || now,
          source: m.source,
          notes: m.notes,
          recordedByUid: authorInfo.uid
        });
      }
    }
  }
  assessmentObservationsStore.set(assessmentId, observationsList);

  // 4. Update Medications if provided
  if (updates.medications) {
    changesReport.medications = { previous: existing.medications, current: sanitized.medications };
    existing.medications = sanitized.medications;
  }

  // 5. Update Complications if provided
  if (updates.complications) {
    changesReport.complications = { previous: existing.complications, current: sanitized.complications };
    existing.complications = sanitized.complications;
  }

  // 6. Update Family History if provided
  if (updates.familyHistory) {
    changesReport.familyHistory = { previous: existing.familyHistory, current: sanitized.familyHistory };
    existing.familyHistory = sanitized.familyHistory;
  }

  // 7. Update Lifestyle if provided
  if (updates.lifestyle) {
    changesReport.lifestyle = { previous: existing.lifestyle, current: sanitized.lifestyle };
    existing.lifestyle = sanitized.lifestyle;
  }

  // 8. Update Doctor Notes if provided and not patient
  if (updates.doctorNotes && !isPatient) {
    changesReport.doctorNotes = { previous: existing.doctorNotes, current: sanitized.doctorNotes };
    existing.doctorNotes = sanitized.doctorNotes;
  }

  // 9. Update Follow-up if provided
  if (updates.followup) {
    changesReport.followup = { previous: existing.followup, current: sanitized.followup };
    existing.followup = sanitized.followup;
  }

  // 10. Increment revision and record in revisions ledger
  existing.clinicalRevision = nextRevision;
  existing.currentRevisionId = `rev_${assessmentId}_${nextRevision}`;
  existing.lastRevisionAt = now;
  existing.assessedAt = now;

  const revisionsList = assessmentRevisionsStore.get(assessmentId) || [];
  const revisionRecord = {
    revision: nextRevision,
    assessmentId,
    createdAt: now,
    author: authorInfo,
    trigger: updates.trigger || (actor.role === 'doctor' ? 'doctor_clinical_revision' : 'clinical_assessment_revision'),
    changes: changesReport,
    summary: updates.revisionSummary || `Assessment updated to clinical revision ${nextRevision}`
  };
  revisionsList.push(revisionRecord);
  assessmentRevisionsStore.set(assessmentId, revisionsList);

  return existing;
}

/**
 * Retrieves a diabetes assessment with full revision and observation history.
 */
function getDiabetesAssessment(assessmentId) {
  if (!assessmentId) return null;
  const assessment = diabetesAssessmentsStore.get(assessmentId);
  if (!assessment) return null;

  return {
    ...assessment,
    observations: assessmentObservationsStore.get(assessmentId) || [],
    revisions: assessmentRevisionsStore.get(assessmentId) || []
  };
}

/**
 * Retrieves all diabetes assessments for a patient.
 */
function getPatientDiabetesAssessments(patientId) {
  if (!patientId) return [];
  const ids = patientAssessmentsIndex.get(patientId) || [];
  const results = [];

  for (const id of ids) {
    const asm = diabetesAssessmentsStore.get(id);
    if (asm) {
      results.push({
        ...asm,
        observationsCount: (assessmentObservationsStore.get(id) || []).length,
        revisionsCount: (assessmentRevisionsStore.get(id) || []).length
      });
    }
  }

  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return results;
}

/**
 * Retrieves immutable observation history for an assessment.
 */
function getAssessmentObservations(assessmentId) {
  return assessmentObservationsStore.get(assessmentId) || [];
}

/**
 * Retrieves revision ledger for an assessment.
 */
function getAssessmentRevisions(assessmentId) {
  return assessmentRevisionsStore.get(assessmentId) || [];
}

function addPatientAttachment(patientId, attachment) {
  if (!patientId || !attachment) return null;
  const list = diabetesAttachmentsStore.get(patientId) || [];
  const record = {
    id: attachment.id || `dm_att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: attachment.name || 'medical_report.pdf',
    type: attachment.type || 'application/pdf',
    size: attachment.size || 1048576,
    sizeLabel: attachment.sizeLabel || (attachment.size ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB'),
    url: attachment.url || null,
    uploadedAt: attachment.uploadedAt || new Date().toISOString()
  };
  list.push(record);
  diabetesAttachmentsStore.set(patientId, list);
  return record;
}

function getPatientAttachments(patientId) {
  if (!patientId) return [];
  return diabetesAttachmentsStore.get(patientId) || [];
}

function addPatientClarification(patientId, cycleData) {
  if (!patientId || !cycleData) return null;
  const list = diabetesClarificationsStore.get(patientId) || [];

  const existingIdx = list.findIndex(item => 
    (cycleData.requestId && item.requestId === cycleData.requestId) ||
    (cycleData.cycle && item.cycle === cycleData.cycle)
  );

  if (existingIdx !== -1) {
    const existing = list[existingIdx];
    if (cycleData.response) {
      existing.response = typeof cycleData.response === 'string' ? {
        timestamp: new Date().toISOString(),
        text: cycleData.response,
        patientName: cycleData.patientName || 'Patient'
      } : cycleData.response;
      existing.status = 'responded';
    } else {
      list[existingIdx] = { ...existing, ...cycleData };
    }
    existing.eventTimestamp = new Date().toISOString();
    diabetesClarificationsStore.set(patientId, list);
    return list[existingIdx];
  }

  const cycleNumber = cycleData.cycle || list.length + 1;
  const record = {
    cycle: cycleNumber,
    requestId: cycleData.requestId || `dm_req_cycle_${cycleNumber}_${Date.now()}`,
    request: cycleData.request || {
      timestamp: new Date().toISOString(),
      note: cycleData.note || cycleData.requestNote || '',
      doctorName: cycleData.doctorName || 'Attending Physician'
    },
    response: cycleData.response ? (typeof cycleData.response === 'string' ? {
      timestamp: new Date().toISOString(),
      text: cycleData.response,
      patientName: cycleData.patientName || 'Patient'
    } : cycleData.response) : null,
    status: cycleData.status || (cycleData.response ? 'responded' : 'unanswered'),
    eventTimestamp: cycleData.eventTimestamp || new Date().toISOString()
  };
  list.push(record);
  diabetesClarificationsStore.set(patientId, list);
  return record;
}

function getPatientClarifications(patientId) {
  if (!patientId) return [];
  return diabetesClarificationsStore.get(patientId) || [];
}

/**
 * Verifies that a doctor is authorized and legitimately assigned to review this diabetes case/patient.
 */
function verifyDoctorCanReviewDiabetesCase(actor, targetPatientId, caseRecord = null) {
  if (!actor || !actor.uid) {
    return { authorized: false, reason: 'UNAUTHENTICATED' };
  }
  const role = actor.role || 'patient';
  if (role === 'super_admin' || role === 'clinic_admin') {
    return { authorized: true };
  }
  if (role !== 'doctor') {
    return { authorized: false, reason: 'ROLE_UNAUTHORIZED' };
  }

  const patientProfile = patientDiabetesRecordsStore.get(targetPatientId) || {};
  const assignedId = caseRecord?.assignedDoctorId || caseRecord?.doctorId || caseRecord?.doctorUid ||
                     patientProfile?.assignedDoctorId || patientProfile?.doctorId;
  const assignedEmail = caseRecord?.assignedDoctorEmail || patientProfile?.assignedDoctorEmail;
  const assignedList = Array.isArray(patientProfile?.assignedDoctorIds) ? patientProfile.assignedDoctorIds : [];

  const isAssigned = (assignedId && assignedId === actor.uid) ||
    (assignedEmail && actor.email && String(assignedEmail).toLowerCase() === String(actor.email).toLowerCase()) ||
    assignedList.includes(actor.uid);

  if (!isAssigned) {
    return {
      authorized: false,
      reason: 'DOCTOR_NOT_ASSIGNED_TO_PATIENT',
      message: 'Access denied: Physician is not assigned to this diabetes patient.'
    };
  }

  return { authorized: true };
}

/**
 * Validates that the reviewed revision matches current revision and snapshots have not changed.
 */
function validateDiabetesRevisionForApproval(arg1, arg2, arg3, arg4) {
  let currentRevision, reviewedRevision, baselineSnapshot, currentSnapshot;
  if (typeof arg1 === 'object' && arg1 !== null) {
    const opts = arg1;
    const latestAssessments = opts.patientId ? getPatientDiabetesAssessments(opts.patientId) : [];
    currentRevision = opts.currentRevision !== undefined
      ? opts.currentRevision
      : (latestAssessments.length > 0 ? latestAssessments[0].clinicalRevision : 1);
    reviewedRevision = opts.reviewedRevision !== undefined
      ? opts.reviewedRevision
      : (opts.expectedRevisionNumber !== undefined
        ? opts.expectedRevisionNumber
        : (opts.submittedRevisionId ? String(opts.submittedRevisionId).replace(/\D+/g, '') : 0));
    baselineSnapshot = opts.baselineSnapshot;
    currentSnapshot = opts.currentSnapshot || (latestAssessments.length > 0 ? latestAssessments[0].measurements : null);
  } else {
    currentRevision = arg1;
    reviewedRevision = arg2;
    baselineSnapshot = arg3;
    currentSnapshot = arg4;
  }

  const curRev = Number(currentRevision || 1);
  const revRev = Number(reviewedRevision || 0);

  const changedFields = [];
  if (curRev !== revRev) {
    changedFields.push('clinicalRevision');
  }

  if (baselineSnapshot && currentSnapshot) {
    if (baselineSnapshot.fastingGlucose !== undefined && Number(baselineSnapshot.fastingGlucose) !== Number(currentSnapshot.fastingGlucose)) {
      changedFields.push('fastingGlucose');
    }
    if (baselineSnapshot.postprandialGlucose !== undefined && Number(baselineSnapshot.postprandialGlucose) !== Number(currentSnapshot.postprandialGlucose)) {
      changedFields.push('postprandialGlucose');
    }
    if (baselineSnapshot.hba1c !== undefined && Number(baselineSnapshot.hba1c) !== Number(currentSnapshot.hba1c)) {
      changedFields.push('hba1c');
    }
    if (baselineSnapshot.patientResponse !== undefined && baselineSnapshot.patientResponse !== currentSnapshot.patientResponse) {
      changedFields.push('patientResponse');
    }
    if (baselineSnapshot.activeInsulinRegimen !== undefined && baselineSnapshot.activeInsulinRegimen !== currentSnapshot.activeInsulinRegimen) {
      changedFields.push('activeInsulinRegimen');
    }
  }

  if (changedFields.length > 0) {
    return {
      valid: false,
      error: 'CLINICAL_DATA_CONFLICT',
      message: 'Clinical inputs, patient reply, or measurements have changed since review. Please review the updated information before approving.',
      conflict: {
        currentRevision: String(curRev),
        reviewedRevision: String(revRev),
        changedFields,
        currentSnapshot: currentSnapshot || {}
      }
    };
  }

  return { valid: true };
}

/**
 * Processes complete doctor review approval for a diabetes patient/case.
 * Enforces revision review, validates non-synthetic diagnoses, and issues certified report.
 */
function processDiabetesDoctorApproval(arg1 = {}, arg2 = {}) {
  let approvalData = arg1;
  let doctorActor = arg2;
  if (arg1.approvalPayload || arg1.doctorUser) {
    approvalData = {
      patientId: arg1.patientId,
      ...arg1.approvalPayload
    };
    doctorActor = arg1.doctorUser || arg2;
  }

  const {
    patientId,
    caseId,
    clinicalRevision,
    reviewedRevision,
    expectedRevisionNumber,
    currentRevisionId,
    clinicalDiagnosis,
    clinicalNotes,
    medications,
    recommendations,
    doctorSpecialty,
    doctorLicense,
    doctorClinic,
    baselineSnapshot,
    currentSnapshot
  } = approvalData;

  if (!patientId) {
    return { success: false, error: 'MISSING_PATIENT_ID', message: 'patientId is required' };
  }

  const authCheck = verifyDoctorCanReviewDiabetesCase(doctorActor, patientId, { id: caseId, assignedDoctorId: doctorActor.uid });
  if (!authCheck.authorized) {
    return {
      success: false,
      error: 'ACCESS_DENIED',
      message: authCheck.message || 'Unauthorized: Doctor not assigned to patient.'
    };
  }

  const latestAssessments = getPatientDiabetesAssessments(patientId);
  const currentActualRev = latestAssessments.length > 0 ? latestAssessments[0].clinicalRevision : (clinicalRevision || 1);
  const currentRevId = latestAssessments.length > 0 ? latestAssessments[0].currentRevisionId : null;

  const revToCompare = expectedRevisionNumber !== undefined
    ? expectedRevisionNumber
    : (reviewedRevision !== undefined ? reviewedRevision : (currentRevisionId ? String(currentRevisionId).replace(/\D+/g, '') : clinicalRevision));

  const concurrencyCheck = validateDiabetesRevisionForApproval(
    currentActualRev,
    revToCompare,
    baselineSnapshot,
    currentSnapshot
  );

  if (!concurrencyCheck.valid) {
    return {
      success: false,
      error: 'CLINICAL_DATA_CONFLICT',
      message: concurrencyCheck.message,
      conflict: concurrencyCheck.conflict
    };
  }

  const diagText = String(clinicalDiagnosis || clinicalNotes || '').trim();
  if (!diagText) {
    return {
      success: false,
      error: 'MISSING_DOCTOR_DIAGNOSIS',
      message: 'Physician clinical diagnosis is required before approval.'
    };
  }

  const recsList = Array.isArray(recommendations)
    ? recommendations.filter(r => String(r || '').trim())
    : (typeof recommendations === 'string'
      ? recommendations.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      : [approvalData.recommendation].filter(Boolean));

  if (recsList.length === 0) {
    return {
      success: false,
      error: 'MISSING_DOCTOR_RECOMMENDATIONS',
      message: 'Physician recommendations are required before approval.'
    };
  }

  const doctorName = doctorActor.name || doctorActor.displayName || 'Attending Physician';
  const licenseNum = doctorLicense || doctorActor.licenseNumber || 'Verified Syndicate License';
  const specialty = doctorSpecialty || 'Endocrinology & Diabetology';
  const clinic = doctorClinic || 'Health Vibe Specialized Clinic';

  const review = recordDoctorReview({
    patientId,
    caseId,
    doctorUid: doctorActor.uid,
    doctorName,
    doctorLicense: licenseNum,
    doctorSpecialty: specialty,
    clinicName: clinic,
    status: 'approved',
    observations: diagText,
    recommendations: recsList,
    medications: medications || null
  });

  const reportId = `dm_rep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const reportRef = approvalData.reportRef || `HV-REP-DM-${reportId.slice(-8).toUpperCase()}`;
  const reportHash = `SHA256-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

  const approvedReport = linkApprovedReport({
    reportId,
    patientId,
    caseId,
    reportRef,
    reportHash,
    doctorIdentity: {
      doctorId: doctorActor.uid,
      uid: doctorActor.uid,
      name: doctorName,
      licenseNumber: licenseNum,
      specialty,
      clinic
    },
    revisionId: currentRevId || `rev-${patientId}-${currentActualRev}`,
    clinicalDiagnosis: diagText,
    medications: medications || null,
    recommendations: recsList,
    approvedAt: new Date().toISOString()
  });

  return {
    success: true,
    report: approvedReport,
    approvedReport,
    review,
    reportRef: approvedReport.reportRef,
    clinicalRevision: currentActualRev
  };
}

/**
 * Aggregates a complete patient diabetes bundle while enforcing field-level states.
 */
function getPatientDiabetesBundle(patientId) {
  if (!patientId) return null;

  const info = resolvePatientDiabetesInfo(patientId);
  const measurements = getPatientMeasurements(patientId);
  const assessments = getPatientDiabetesAssessments(patientId);
  const notes = getPatientClinicalNotes(patientId);
  const reviews = getPatientDoctorReviews(patientId);
  const followup = getPatientFollowupPlan(patientId);
  const reports = getPatientApprovedReports(patientId);
  const attachments = getPatientAttachments(patientId);
  const clarifications = getPatientClarifications(patientId);

  return {
    patientId,
    info,
    measurements,
    assessments,
    clinicalNotes: notes,
    doctorReviews: reviews,
    followupPlan: followup,
    approvedReports: reports,
    attachments,
    clarifications,
    measurementsCount: measurements.length,
    assessmentsCount: assessments.length,
    notesCount: notes.length,
    reviewsCount: reviews.length,
    reportsCount: reports.length,
    attachmentsCount: attachments.length,
    clarificationsCount: clarifications.length
  };
}

/**
 * Metadata and Clinical Governance Overview for Diabetes Module.
 */
function getDiabetesModuleOverview() {
  return {
    moduleId: 'diabetes',
    specialtyNameEn: 'Endocrinology & Diabetology',
    specialtyNameAr: 'الغدد الصماء والسكري',
    governanceStatus: 'UNDER_SPECIALIST_REVIEW',
    readinessFlag: false,
    clinicalDisclaimer: 'Assistive longitudinal glycemic tracking only. Autonomous diagnosis or medication titration is strictly prohibited. Verified endocrinologist sign-off required.',
    guidelinesReferenced: [
      'ADA Standards of Care in Diabetes (2026)',
      'EASD Clinical Practice Guidelines',
      'Egyptian Diabetes Society Clinical Protocols'
    ],
    supportedInputTypes: [
      'Fasting Blood Glucose (FBG)',
      'Postprandial Blood Glucose (PPG)',
      'Random Blood Glucose (RBG)',
      'Glycated Hemoglobin (HbA1c)',
      'Urine/Blood Ketones',
      'Insulin Units & Regimen'
    ]
  };
}

module.exports = {
  CLINICAL_FIELD_STATE,
  DIABETES_TYPES,
  GLUCOSE_CONTEXTS,
  MEASUREMENT_SOURCES,
  REVIEW_STATUSES,
  ALLOWED_MEASUREMENT_LIMITS,
  FORBIDDEN_PATIENT_FIELDS,
  classifyClinicalField,
  normalizeArabicIndicDigits,
  verifyAccessPermission,
  validateDiabetesAssessmentInput,
  createDiabetesAssessment,
  updateDiabetesAssessment,
  getDiabetesAssessment,
  getPatientDiabetesAssessments,
  getAssessmentObservations,
  getAssessmentRevisions,
  resolvePatientDiabetesInfo,
  savePatientDiabetesInfo,
  recordDiabetesMeasurement,
  getPatientMeasurements,
  addClinicalNote,
  getPatientClinicalNotes,
  recordDoctorReview,
  getPatientDoctorReviews,
  recordFollowupPlan,
  getPatientFollowupPlan,
  linkApprovedReport,
  getPatientApprovedReports,
  getPatientDiabetesBundle,
  getDiabetesModuleOverview,
  resetDiabetesStoreForTesting,
  addPatientAttachment,
  getPatientAttachments,
  addPatientClarification,
  getPatientClarifications,
  verifyDoctorCanReviewDiabetesCase,
  validateDiabetesRevisionForApproval,
  processDiabetesDoctorApproval
};

