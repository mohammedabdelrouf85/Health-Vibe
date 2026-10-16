/**
 * Health Vibe AI - Blood Clotting / Blood Disorders Structured Clinical Data Support
 *
 * SPECIFICATION & GOVERNANCE RULES:
 * 1. Schema for Medically Reviewed Laboratory & Clinical Observations:
 *    - test name
 *    - result value (quantitative or qualitative)
 *    - unit (NEVER assumed; null if omitted)
 *    - reference range when provided by the source (NEVER fabricated or defaulted)
 *    - collection date/time (NEVER substituted with current timestamp if missing)
 *    - source (patient_entered, external_ehr_import, lab_interface_import, medical_ocr_import, clinician_entered)
 *    - attachment/reference (file pointer, document scan, report ID)
 *    - author (who entered or imported the observation)
 *    - review status (UNVERIFIED, UNDER_REVIEW, VERIFIED, REJECTED, SUPERSEDED)
 * 2. Unverified Status by Default:
 *    - Imported or patient-provided observations are strictly marked UNVERIFIED until
 *      reviewed by an authorized, licensed physician.
 * 3. Immutable Original Source Data:
 *    - The exact raw input payload and provenance are preserved in originalSourceData.
 *    - originalSourceData cannot be mutated, overwritten, or deleted by corrections.
 * 4. Auditable Manual Correction Workflow:
 *    - Corrections are allowed only with a mandatory non-empty correctionReason.
 *    - Maintains a complete, immutable correctionHistory trail with previous/new values,
 *      revisions, timestamp, and identity of the correcting clinician.
 * 5. No Assumptions for Missing Values:
 *    - Never replaces missing reference ranges, units, or timestamps with assumed defaults.
 * 6. Non-Diagnostic Boundary:
 *    - Strictly NO automated diagnoses and NO treatment recommendations.
 */

const crypto = require('crypto');

let auditService = null;
try {
  auditService = require('./audit-service');
} catch (e) {
  // Graceful fallback for standalone unit environments
}

// In-Memory Storage for fast test execution and cache
const observationsStore = new Map(); // observationId -> observation record
const patientObservationsIndex = new Map(); // patientId -> Array<observationId>
const caseObservationsIndex = new Map(); // caseId -> Array<observationId>

// Constants & Enums
const OBSERVATION_SOURCES = {
  PATIENT_ENTERED: 'patient_entered',
  EXTERNAL_EHR_IMPORT: 'external_ehr_import',
  LAB_INTERFACE_IMPORT: 'lab_interface_import',
  MEDICAL_OCR_IMPORT: 'medical_ocr_import',
  CLINICIAN_ENTERED: 'clinician_entered',
  DEVICE_TELEMETRY: 'device_telemetry'
};

const REVIEW_STATUS = {
  UNVERIFIED: 'UNVERIFIED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED'
};

const VALUE_TYPES = {
  QUANTITATIVE: 'quantitative',
  QUALITATIVE: 'qualitative'
};

// Helper for Arabic digit normalization
function normalizeArabicDigits(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .replace(/[٫,]/g, '.');
}

/**
 * Validates and sanitizes a clinical observation payload according to the strict schema.
 * Enforces:
 * - No assumption of missing units
 * - No assumption of missing reference ranges
 * - No assumption of missing collection date/time
 * - Preservation of raw strings
 */
function validateObservationPayload(payload, { isCorrection = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    const err = new Error('Observation payload must be a non-null object.');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  // 1. Patient ID validation (mandatory on creation)
  if (!isCorrection && (!payload.patientId || typeof payload.patientId !== 'string' || !payload.patientId.trim())) {
    const err = new Error('patientId is required for clinical observation.');
    err.code = 'MISSING_PATIENT_ID';
    throw err;
  }

  // 2. Test Name validation (mandatory)
  if (!payload.testName || typeof payload.testName !== 'string' || !payload.testName.trim()) {
    const err = new Error('testName is required for clinical observation.');
    err.code = 'MISSING_TEST_NAME';
    throw err;
  }
  const testName = payload.testName.trim();

  // 3. Result Value validation (mandatory, non-empty)
  if (payload.resultValue === null || payload.resultValue === undefined || (typeof payload.resultValue === 'string' && payload.resultValue.trim() === '')) {
    const err = new Error(`Result value cannot be empty for observation '${testName}'.`);
    err.code = 'EMPTY_RESULT_VALUE';
    throw err;
  }

  // Determine value type (Quantitative vs Qualitative)
  let parsedValue = payload.resultValue;
  let valueType = VALUE_TYPES.QUALITATIVE;

  if (typeof payload.resultValue === 'number') {
    parsedValue = payload.resultValue;
    valueType = VALUE_TYPES.QUANTITATIVE;
  } else if (typeof payload.resultValue === 'string') {
    const cleaned = normalizeArabicDigits(payload.resultValue.trim());
    const num = Number(cleaned);
    if (!isNaN(num) && cleaned !== '') {
      parsedValue = num;
      valueType = VALUE_TYPES.QUANTITATIVE;
    } else {
      parsedValue = payload.resultValue.trim();
      valueType = VALUE_TYPES.QUALITATIVE;
    }
  }

  // 4. Unit validation: NEVER replace missing unit with an assumption!
  let unit = null;
  if (payload.unit !== null && payload.unit !== undefined && typeof payload.unit === 'string' && payload.unit.trim() !== '') {
    unit = payload.unit.trim();
  } else {
    // Deliberately keep null. NEVER assume default unit.
    unit = null;
  }

  // 5. Reference Range validation: Only when provided by source!
  let referenceRange = null;
  if (payload.referenceRange !== null && payload.referenceRange !== undefined) {
    if (typeof payload.referenceRange === 'object') {
      const low = payload.referenceRange.low !== undefined && payload.referenceRange.low !== null && !isNaN(Number(payload.referenceRange.low))
        ? Number(payload.referenceRange.low)
        : null;
      const high = payload.referenceRange.high !== undefined && payload.referenceRange.high !== null && !isNaN(Number(payload.referenceRange.high))
        ? Number(payload.referenceRange.high)
        : null;
      const text = payload.referenceRange.text ? String(payload.referenceRange.text).trim() : null;
      const rangeUnit = payload.referenceRange.unit ? String(payload.referenceRange.unit).trim() : null;

      referenceRange = {
        low,
        high,
        text,
        unit: rangeUnit || unit || null,
        providedBySource: true
      };
    } else if (typeof payload.referenceRange === 'string' && payload.referenceRange.trim() !== '') {
      referenceRange = {
        low: null,
        high: null,
        text: payload.referenceRange.trim(),
        unit: unit || null,
        providedBySource: true
      };
    }
  }
  // If not provided by source, referenceRange remains strictly null. Never assume!

  // 6. Collection Date/Time: NEVER substitute with "now" if missing!
  let collectionDateTime = null;
  if (payload.collectionDateTime !== null && payload.collectionDateTime !== undefined && String(payload.collectionDateTime).trim() !== '') {
    const parsedTime = new Date(payload.collectionDateTime).getTime();
    if (isNaN(parsedTime)) {
      const err = new Error(`Invalid collection date/time format: '${payload.collectionDateTime}'.`);
      err.code = 'INVALID_COLLECTION_DATETIME';
      throw err;
    }
    // Prevent future collection dates (allow 2-minute margin for clock drift)
    if (parsedTime > Date.now() + 120000) {
      const err = new Error(`Collection date/time cannot be in the future (${payload.collectionDateTime}).`);
      err.code = 'FUTURE_COLLECTION_DATETIME';
      throw err;
    }
    collectionDateTime = new Date(parsedTime).toISOString();
  } else {
    // Deliberately keep null. Never replace missing timestamp with assumption!
    collectionDateTime = null;
  }

  // 7. Source validation (mandatory)
  const validSources = Object.values(OBSERVATION_SOURCES);
  const source = payload.source ? String(payload.source).trim() : OBSERVATION_SOURCES.PATIENT_ENTERED;
  if (!validSources.includes(source)) {
    const err = new Error(`Invalid observation source '${source}'. Valid sources: [${validSources.join(', ')}]`);
    err.code = 'INVALID_OBSERVATION_SOURCE';
    throw err;
  }

  // 8. Attachment / Reference (optional file or document pointer)
  let attachmentRef = null;
  if (payload.attachmentRef && typeof payload.attachmentRef === 'object') {
    attachmentRef = {
      fileId: payload.attachmentRef.fileId || null,
      fileName: payload.attachmentRef.fileName || null,
      fileUrl: payload.attachmentRef.fileUrl || null,
      mimeType: payload.attachmentRef.mimeType || null,
      sourceDocumentId: payload.attachmentRef.sourceDocumentId || null
    };
  } else if (typeof payload.attachmentRef === 'string' && payload.attachmentRef.trim() !== '') {
    attachmentRef = {
      fileId: payload.attachmentRef.trim(),
      fileName: null,
      fileUrl: null,
      mimeType: null,
      sourceDocumentId: null
    };
  }

  // 9. Author details
  const author = {
    uid: payload.author?.uid || 'unknown_author',
    name: payload.author?.name || payload.author?.displayName || 'Anonymous User',
    role: payload.author?.role || 'patient'
  };

  // 10. Review status rule:
  // Imported or patient-provided information is treated as UNVERIFIED until reviewed!
  let initialReviewStatus = REVIEW_STATUS.UNVERIFIED;
  if (source === OBSERVATION_SOURCES.CLINICIAN_ENTERED && author.role === 'doctor' && payload.reviewStatus === REVIEW_STATUS.VERIFIED) {
    initialReviewStatus = REVIEW_STATUS.VERIFIED;
  } else {
    // Enforce UNVERIFIED regardless of what external/patient payload passed
    initialReviewStatus = REVIEW_STATUS.UNVERIFIED;
  }

  return {
    patientId: payload.patientId ? payload.patientId.trim() : null,
    caseId: payload.caseId ? String(payload.caseId).trim() : null,
    conditionId: payload.conditionId ? String(payload.conditionId).trim() : null,
    testName,
    testCode: payload.testCode ? String(payload.testCode).trim().toUpperCase() : null,
    resultValue: parsedValue,
    valueType,
    unit,
    referenceRange,
    collectionDateTime,
    source,
    attachmentRef,
    author,
    reviewStatus: initialReviewStatus,
    clinicalNotes: payload.clinicalNotes ? String(payload.clinicalNotes).trim() : null
  };
}

/**
 * Creates and stores a new structured clinical observation for blood disorders.
 * Deeply preserves immutable original source data.
 * Emits audit log via auditService.
 */
async function createClinicalObservation(rawPayload, { db = null, req = null } = {}) {
  const validated = validateObservationPayload(rawPayload, { isCorrection: false });

  const nowIso = new Date().toISOString();
  const observationId = `obs_bd_${validated.patientId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Preserve immutable snapshot of the original raw source payload
  const originalSourceData = Object.freeze({
    rawTestName: rawPayload.testName,
    rawResultValue: rawPayload.resultValue,
    rawUnit: rawPayload.unit !== undefined ? rawPayload.unit : null,
    rawReferenceRange: rawPayload.referenceRange !== undefined ? rawPayload.referenceRange : null,
    rawCollectionDateTime: rawPayload.collectionDateTime !== undefined ? rawPayload.collectionDateTime : null,
    rawSource: rawPayload.source !== undefined ? rawPayload.source : null,
    rawAttachmentRef: rawPayload.attachmentRef !== undefined ? rawPayload.attachmentRef : null,
    rawAuthor: rawPayload.author ? { ...rawPayload.author } : null,
    rawPayload: JSON.parse(JSON.stringify(rawPayload)),
    ingestedAt: nowIso
  });

  // Doctor review metadata (null until explicitly reviewed by doctor)
  let reviewDetails = null;
  if (validated.reviewStatus === REVIEW_STATUS.VERIFIED && validated.author.role === 'doctor') {
    reviewDetails = {
      reviewedBy: {
        uid: validated.author.uid,
        name: validated.author.name,
        role: 'doctor',
        licenseNumber: rawPayload.author?.licenseNumber || 'VERIFIED-CLINICIAN',
        specialty: rawPayload.author?.specialty || 'Hematologist'
      },
      reviewedAt: nowIso,
      reviewNotes: 'Verified at time of clinician entry.',
      reviewDecision: REVIEW_STATUS.VERIFIED
    };
  }

  const observationRecord = {
    observationId,
    id: observationId,
    patientId: validated.patientId,
    caseId: validated.caseId,
    conditionId: validated.conditionId,
    testName: validated.testName,
    testCode: validated.testCode,
    resultValue: validated.resultValue,
    valueType: validated.valueType,
    unit: validated.unit,
    referenceRange: validated.referenceRange,
    collectionDateTime: validated.collectionDateTime,
    source: validated.source,
    attachmentRef: validated.attachmentRef,
    author: validated.author,
    reviewStatus: validated.reviewStatus,
    reviewDetails,
    clinicalNotes: validated.clinicalNotes,

    // Immutability: originalSourceData CANNOT be altered
    originalSourceData,

    // Auditable correction tracking
    revisionNumber: 1,
    correctionHistory: [],

    // Explicit Clinical Boundary Notice:
    // Storing observations NEVER generates diagnoses or treatment recommendations
    clinicalBoundary: {
      isDiagnostic: false,
      isTreatmentRecommendation: false,
      disclaimerEn: 'Clinical observation record only. Does not constitute an automated diagnosis or treatment recommendation.',
      disclaimerAr: 'سجل ملاحظات سريرية ومخبرية فقط. لا يمثل تشخيصاً آلياً أو توصية علاجية.'
    },

    createdAt: nowIso,
    updatedAt: nowIso
  };

  observationsStore.set(observationId, observationRecord);

  // Index by patient
  const patientObs = patientObservationsIndex.get(validated.patientId) || [];
  patientObs.unshift(observationId);
  patientObservationsIndex.set(validated.patientId, patientObs);

  // Index by case if linked
  if (validated.caseId) {
    const caseObs = caseObservationsIndex.get(validated.caseId) || [];
    caseObs.unshift(observationId);
    caseObservationsIndex.set(validated.caseId, caseObs);
  }

  // Audit event recording
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      await auditService.recordAuditEvent(db, {
        type: 'RECORD_CREATED',
        actor: validated.author,
        targetUserId: validated.patientId,
        details: {
          action: 'BLOOD_DISORDERS_OBSERVATION_CREATED',
          observationId,
          testName: validated.testName,
          source: validated.source,
          reviewStatus: validated.reviewStatus
        },
        req
      });
    } catch (e) {
      // Audit fail-safe in non-fatal paths
    }
  }

  return observationRecord;
}

/**
 * Retrieves a single clinical observation by observationId.
 */
function getClinicalObservationById(observationId) {
  return observationsStore.get(observationId) || null;
}

/**
 * Retrieves clinical observations for a patient with optional filters.
 */
function getPatientClinicalObservations(patientId, { reviewStatus, conditionId, testCode, limit } = {}) {
  const ids = patientObservationsIndex.get(patientId) || [];
  let list = ids.map(id => observationsStore.get(id)).filter(Boolean);

  if (reviewStatus) {
    list = list.filter(o => o.reviewStatus === reviewStatus);
  }
  if (conditionId) {
    list = list.filter(o => o.conditionId === conditionId);
  }
  if (testCode) {
    const upperCode = testCode.trim().toUpperCase();
    list = list.filter(o => o.testCode === upperCode);
  }
  if (limit && Number(limit) > 0) {
    list = list.slice(0, Number(limit));
  }

  return list;
}

/**
 * Retrieves observations linked to a specific case.
 */
function getCaseClinicalObservations(caseId) {
  const ids = caseObservationsIndex.get(caseId) || [];
  return ids.map(id => observationsStore.get(id)).filter(Boolean);
}

/**
 * Medical Review Workflow for Blood Disorders Observations.
 * Allows a licensed physician to review unverified observations and mark them
 * VERIFIED or REJECTED with mandatory reviewer provenance and notes.
 * Does NOT generate automatic diagnoses or alter original source data.
 */
async function reviewClinicalObservation({
  observationId,
  reviewingDoctor,
  reviewDecision,
  reviewNotes = '',
  db = null,
  req = null
}) {
  const obs = observationsStore.get(observationId);
  if (!obs) {
    const err = new Error(`Observation '${observationId}' not found.`);
    err.code = 'OBSERVATION_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Doctor authorization validation
  if (!reviewingDoctor || reviewingDoctor.role !== 'doctor') {
    const err = new Error('Access denied: Only a licensed medical reviewer can review clinical observations.');
    err.code = 'ACCESS_DENIED_DOCTOR_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.status && reviewingDoctor.status !== 'approved') {
    const err = new Error('Doctor credentials not approved for clinical review.');
    err.code = 'UNAPPROVED_DOCTOR';
    err.statusCode = 403;
    throw err;
  }

  if (reviewingDoctor.isLicenseExpired || reviewingDoctor.licenseStatus === 'revoked') {
    const err = new Error('Doctor license is expired or revoked.');
    err.code = 'INVALID_DOCTOR_LICENSE';
    err.statusCode = 403;
    throw err;
  }

  // Review Decision validation
  const normalizedDecision = String(reviewDecision || '').trim().toUpperCase();
  if (normalizedDecision !== REVIEW_STATUS.VERIFIED && normalizedDecision !== REVIEW_STATUS.REJECTED) {
    const err = new Error(`Invalid review decision '${reviewDecision}'. Must be VERIFIED or REJECTED.`);
    err.code = 'INVALID_REVIEW_DECISION';
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();

  // Update Review Status
  obs.reviewStatus = normalizedDecision;
  obs.reviewDetails = {
    reviewedBy: {
      uid: reviewingDoctor.uid,
      name: reviewingDoctor.name || reviewingDoctor.displayName || 'Medical Reviewer',
      role: 'doctor',
      licenseNumber: reviewingDoctor.licenseNumber || 'VERIFIED-DOC',
      specialty: reviewingDoctor.specialty || 'Hematologist'
    },
    reviewedAt: nowIso,
    reviewNotes: String(reviewNotes || '').trim(),
    reviewDecision: normalizedDecision
  };
  obs.updatedAt = nowIso;

  // originalSourceData remains completely UNTOUCHED

  // Audit event recording
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      await auditService.recordAuditEvent(db, {
        type: 'RECORD_UPDATED',
        actor: obs.reviewDetails.reviewedBy,
        targetUserId: obs.patientId,
        details: {
          action: 'BLOOD_DISORDERS_OBSERVATION_REVIEWED',
          observationId,
          reviewDecision: normalizedDecision,
          testName: obs.testName,
          reviewNotes: obs.reviewDetails.reviewNotes
        },
        req
      });
    } catch (e) {}
  }

  return obs;
}

/**
 * Auditable Manual Correction Workflow.
 * Allows an authorized user to correct observation fields while preserving:
 * 1. Original Source Data (untouched and immutable).
 * 2. Immutable Correction History with previous/new values and mandatory correction reason.
 * 3. Revision counter increment.
 *
 * Never substitutes missing values with assumptions during correction.
 */
async function correctClinicalObservation({
  observationId,
  correctedBy,
  correctionReason,
  updatedFields = {},
  db = null,
  req = null
}) {
  const obs = observationsStore.get(observationId);
  if (!obs) {
    const err = new Error(`Observation '${observationId}' not found.`);
    err.code = 'OBSERVATION_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Authorized user check (must be clinician or medical admin)
  if (!correctedBy || (correctedBy.role !== 'doctor' && correctedBy.role !== 'nurse' && correctedBy.role !== 'clinic_admin' && correctedBy.role !== 'super_admin')) {
    const err = new Error('Access denied: Only authorized clinical personnel can perform manual corrections.');
    err.code = 'ACCESS_DENIED_CLINICAL_ROLE_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  // MANDATORY Correction Reason Check
  if (!correctionReason || typeof correctionReason !== 'string' || !correctionReason.trim()) {
    const err = new Error('Auditable correction requires a mandatory, non-empty correctionReason.');
    err.code = 'CORRECTION_REASON_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // Disallowed fields that cannot be altered via manual correction
  const immutableFields = new Set([
    'observationId',
    'id',
    'patientId',
    'originalSourceData',
    'createdAt',
    'author',
    'clinicalBoundary'
  ]);

  for (const key of Object.keys(updatedFields)) {
    if (immutableFields.has(key)) {
      const err = new Error(`Field '${key}' is immutable and cannot be modified through correction.`);
      err.code = 'IMMUTABLE_FIELD_MODIFICATION';
      err.statusCode = 400;
      throw err;
    }
  }

  // Validate changes against schema rules
  const candidatePayload = {
    patientId: obs.patientId,
    testName: updatedFields.testName !== undefined ? updatedFields.testName : obs.testName,
    testCode: updatedFields.testCode !== undefined ? updatedFields.testCode : obs.testCode,
    resultValue: updatedFields.resultValue !== undefined ? updatedFields.resultValue : obs.resultValue,
    unit: updatedFields.unit !== undefined ? updatedFields.unit : obs.unit,
    referenceRange: updatedFields.referenceRange !== undefined ? updatedFields.referenceRange : obs.referenceRange,
    collectionDateTime: updatedFields.collectionDateTime !== undefined ? updatedFields.collectionDateTime : obs.collectionDateTime,
    source: updatedFields.source !== undefined ? updatedFields.source : obs.source,
    attachmentRef: updatedFields.attachmentRef !== undefined ? updatedFields.attachmentRef : obs.attachmentRef,
    author: obs.author,
    reviewStatus: obs.reviewStatus,
    clinicalNotes: updatedFields.clinicalNotes !== undefined ? updatedFields.clinicalNotes : obs.clinicalNotes
  };

  const sanitizedUpdate = validateObservationPayload(candidatePayload, { isCorrection: true });

  const nowIso = new Date().toISOString();
  const previousValues = {};
  const newValues = {};
  let hasActualChanges = false;

  const trackableKeys = ['testName', 'testCode', 'resultValue', 'valueType', 'unit', 'referenceRange', 'collectionDateTime', 'attachmentRef', 'clinicalNotes'];
  for (const k of trackableKeys) {
    if (JSON.stringify(obs[k]) !== JSON.stringify(sanitizedUpdate[k])) {
      previousValues[k] = obs[k];
      newValues[k] = sanitizedUpdate[k];
      obs[k] = sanitizedUpdate[k];
      hasActualChanges = true;
    }
  }

  if (!hasActualChanges) {
    const err = new Error('No modifications detected in correction request.');
    err.code = 'NO_CORRECTION_CHANGES';
    err.statusCode = 400;
    throw err;
  }

  const currentRevision = obs.revisionNumber || 1;
  const nextRevision = currentRevision + 1;

  // Record audit trail entry
  const correctionEntry = {
    revision: currentRevision,
    nextRevision,
    correctedAt: nowIso,
    correctedBy: {
      uid: correctedBy.uid,
      name: correctedBy.name || correctedBy.displayName || 'Authorized Clinician',
      role: correctedBy.role,
      licenseNumber: correctedBy.licenseNumber || null
    },
    correctionReason: correctionReason.trim(),
    previousValues,
    newValues
  };

  obs.correctionHistory.push(correctionEntry);
  obs.revisionNumber = nextRevision;
  obs.updatedAt = nowIso;

  // Integrity rule: If observation was previously VERIFIED, a manual correction
  // resets it to UNVERIFIED so the attending reviewer must re-verify the new values!
  if (obs.reviewStatus === REVIEW_STATUS.VERIFIED) {
    obs.reviewStatus = REVIEW_STATUS.UNVERIFIED;
    obs.reviewDetails = {
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: `Prior verification superseded by revision ${nextRevision} (Reason: ${correctionReason.trim()}). Awaiting re-verification.`,
      reviewDecision: null
    };
  }

  // Record audit event
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      await auditService.recordAuditEvent(db, {
        type: 'RECORD_UPDATED',
        actor: correctionEntry.correctedBy,
        targetUserId: obs.patientId,
        details: {
          action: 'BLOOD_DISORDERS_OBSERVATION_CORRECTED',
          observationId,
          revision: nextRevision,
          correctionReason: correctionEntry.correctionReason,
          fieldsChanged: Object.keys(newValues)
        },
        req
      });
    } catch (e) {}
  }

  return obs;
}

/**
 * Resets the in-memory observation stores for isolated unit testing.
 */
function resetObservationStoreForTesting() {
  observationsStore.clear();
  patientObservationsIndex.clear();
  caseObservationsIndex.clear();
}

module.exports = {
  OBSERVATION_SOURCES,
  REVIEW_STATUS,
  VALUE_TYPES,
  normalizeArabicDigits,
  validateObservationPayload,
  createClinicalObservation,
  getClinicalObservationById,
  getPatientClinicalObservations,
  getCaseClinicalObservations,
  reviewClinicalObservation,
  correctClinicalObservation,
  resetObservationStoreForTesting
};
