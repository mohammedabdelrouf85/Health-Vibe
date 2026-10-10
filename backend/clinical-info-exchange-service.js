/**
 * Health Vibe AI - Clinical Information Exchange & Versioned Revision Service
 *
 * Implements:
 * 1. Versioned Request & Response Records with stable IDs.
 * 2. Immutable Observation History preserving measurement time, units, and provenance.
 * 3. Canonical Current Assessment with clinical revision increments.
 * 4. Trusted Write Path enforcing ownership, allowed fields, and valid status transitions.
 * 5. Multi-cycle request lifecycle management.
 * 6. Protection against duplicate submissions, stale replies, and conflicting measurement fields.
 */

const crypto = require('crypto');

// Supported Clinical Measurement Definitions & Physiological Limits
const ALLOWED_MEASUREMENT_TYPES = {
  oxygenLevel: {
    code: 'oxygenLevel',
    name: 'Oxygen Saturation (SpO2)',
    validUnits: ['%'],
    canonicalUnit: '%',
    min: 50,
    max: 100
  },
  temperature: {
    code: 'temperature',
    name: 'Body Temperature',
    validUnits: ['°C', 'C', '°F', 'F'],
    canonicalUnit: '°C',
    min: 34.0,
    max: 43.0,
    // Normalizer from Fahrenheit to Celsius
    normalize: (val, unit) => {
      if (unit && (unit.toUpperCase() === '°F' || unit.toUpperCase() === 'F')) {
        return Math.round(((val - 32) * (5 / 9)) * 10) / 10;
      }
      return val;
    }
  },
  heartRate: {
    code: 'heartRate',
    name: 'Heart Rate / Pulse',
    validUnits: ['bpm', 'beats/min'],
    canonicalUnit: 'bpm',
    min: 30,
    max: 240
  },
  respiratoryRate: {
    code: 'respiratoryRate',
    name: 'Respiratory Rate',
    validUnits: ['breaths/min', 'cpm', 'bpm'],
    canonicalUnit: 'breaths/min',
    min: 6,
    max: 60
  },
  systolicBp: {
    code: 'systolicBp',
    name: 'Systolic Blood Pressure',
    validUnits: ['mmHg', 'mm Hg'],
    canonicalUnit: 'mmHg',
    min: 60,
    max: 260
  },
  diastolicBp: {
    code: 'diastolicBp',
    name: 'Diastolic Blood Pressure',
    validUnits: ['mmHg', 'mm Hg'],
    canonicalUnit: 'mmHg',
    min: 40,
    max: 160
  },
  bloodPressure: {
    code: 'bloodPressure',
    name: 'Blood Pressure',
    validUnits: ['mmHg', 'mm Hg'],
    canonicalUnit: 'mmHg',
    min: 40,
    max: 260
  },
  bloodGlucose: {
    code: 'bloodGlucose',
    name: 'Blood Glucose',
    validUnits: ['mg/dL', 'mmol/L'],
    canonicalUnit: 'mg/dL',
    min: 20,
    max: 800,
    normalize: (val, unit) => {
      if (unit && unit.toLowerCase() === 'mmol/l') {
        return Math.round(val * 18.0182 * 10) / 10;
      }
      return val;
    }
  }
};

// Forbidden fields that patient cannot tamper with or submit
const FORBIDDEN_PATIENT_FIELDS = new Set([
  'doctorNotes',
  'clinicalNotes',
  'officialDiagnosis',
  'clinicalDiagnosis',
  'clinicalImpression',
  'medications',
  'recommendations',
  'doctorApproved',
  'assignedDoctorId',
  'doctorId',
  'approvingDoctorId',
  'status',
  'triageLevel',
  'aiScore',
  'ruleScore',
  'riskTier'
]);

class ClinicalInfoExchangeService {
  constructor() {
    this.resetStoreForTesting();
  }

  resetStoreForTesting() {
    this.requests = new Map();     // requestId -> requestRecord
    this.replies = new Map();      // replyId -> replyRecord
    this.cases = new Map();        // caseId -> caseRecord
    this.observations = new Map(); // caseId -> Array(observationRecord)
    this.revisions = new Map();    // caseId -> Array(revisionRecord)
    this.auditLogs = [];
  }

  // Helper to register / seed a case into memory for test isolation or cache
  registerCase(caseData) {
    if (!caseData || !caseData.id) throw new Error('Valid case data with id is required.');
    const existing = this.cases.get(caseData.id) || {};
    const clinicalRevision = caseData.clinicalRevision || existing.clinicalRevision || 1;

    const initializedCase = {
      ...existing,
      ...caseData,
      clinicalRevision,
      status: caseData.status || existing.status || 'under_review',
      patientId: caseData.patientId || existing.patientId,
      assignedDoctorId: caseData.assignedDoctorId || existing.assignedDoctorId,
      currentAssessment: {
        ...(existing.currentAssessment || {}),
        ...(caseData.currentAssessment || {}),
        oxygenLevel: caseData.oxygenLevel ?? caseData.o2 ?? existing.currentAssessment?.oxygenLevel ?? null,
        heartRate: caseData.heartRate ?? existing.currentAssessment?.heartRate ?? null,
        temperature: caseData.temperature ?? existing.currentAssessment?.temperature ?? null,
        systolicBp: caseData.systolicBp ?? existing.currentAssessment?.systolicBp ?? null,
        diastolicBp: caseData.diastolicBp ?? existing.currentAssessment?.diastolicBp ?? null,
        symptoms: caseData.symptoms || existing.currentAssessment?.symptoms || []
      },
      updatedAt: new Date().toISOString()
    };

    this.cases.set(caseData.id, initializedCase);

    if (!this.observations.has(caseData.id)) {
      this.observations.set(caseData.id, []);
      // If initial measurements present, populate baseline observation
      if (initializedCase.currentAssessment.oxygenLevel !== null) {
        this._recordObservation(caseData.id, {
          type: 'oxygenLevel',
          value: initializedCase.currentAssessment.oxygenLevel,
          unit: '%',
          measuredAt: initializedCase.createdAt || new Date().toISOString(),
          provenance: { source: 'initial_assessment', verified: true },
          cycle: 0
        });
      }
    }

    if (!this.revisions.has(caseData.id)) {
      this.revisions.set(caseData.id, [
        {
          revision: 1,
          createdAt: initializedCase.createdAt || new Date().toISOString(),
          trigger: 'initial_case_creation',
          changes: { note: 'Initial clinical assessment submission' }
        }
      ]);
    }

    return initializedCase;
  }

  getCase(caseId) {
    return this.cases.get(caseId);
  }

  // =============================================================================
  // 1. CREATE VERSIONED INFORMATION REQUEST (DOCTOR ONLY)
  // =============================================================================

  createInformationRequest({ caseId, doctor, requestedFields = [], clinicalRationale, note, priority = 'routine' }) {
    if (!caseId) throw new Error('caseId is mandatory.');
    const clinicalCase = this.cases.get(caseId);
    if (!clinicalCase) {
      const err = new Error(`Clinical case ${caseId} does not exist.`);
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 1. Doctor Authorization & Ownership Check
    if (!doctor || doctor.role !== 'doctor') {
      const err = new Error('Only an authenticated doctor can request more clinical information.');
      err.code = 'UNAUTHORIZED_ACTOR';
      err.statusCode = 403;
      throw err;
    }

    if (doctor.status && doctor.status !== 'approved') {
      const err = new Error('Only approved medical practitioners can issue information requests.');
      err.code = 'UNAPPROVED_DOCTOR';
      err.statusCode = 403;
      throw err;
    }

    if (doctor.licenseStatus === 'revoked' || doctor.isLicenseExpired) {
      const err = new Error('Doctor license is revoked or expired.');
      err.code = 'INVALID_DOCTOR_LICENSE';
      err.statusCode = 403;
      throw err;
    }

    // If case has assignedDoctorId, verify assignment unless doctor is admin/owner
    if (clinicalCase.assignedDoctorId && clinicalCase.assignedDoctorId !== doctor.uid && doctor.role !== 'owner' && doctor.role !== 'admin') {
      const err = new Error('Only the assigned physician can issue information requests for this case.');
      err.code = 'FORBIDDEN_UNASSIGNED_DOCTOR';
      err.statusCode = 403;
      throw err;
    }

    // 2. State Transition Check: Case must be under_review
    if (clinicalCase.status !== 'under_review') {
      const err = new Error(`Cannot request more information when case is in status '${clinicalCase.status}'. Valid source status is 'under_review'.`);
      err.code = 'INVALID_CASE_STATUS_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    const rationale = String(clinicalRationale || note || '').trim();
    if (!rationale) {
      const err = new Error('A clinical rationale or instruction note is mandatory for information requests.');
      err.code = 'MISSING_CLINICAL_RATIONALE';
      err.statusCode = 400;
      throw err;
    }

    // 3. Compute cycle number (1-based index)
    const existingRequests = this.getCaseRequestHistory(caseId);
    const cycle = existingRequests.length + 1;

    const requestedAt = new Date().toISOString();
    const requestId = `req_info_${caseId}_c${cycle}_${Date.now()}`;

    // Mark any prior pending request as superseded
    existingRequests.forEach(req => {
      if (req.status === 'pending_response') {
        req.status = 'superseded';
        req.supersededAt = requestedAt;
      }
    });

    const requestRecord = {
      requestId,
      caseId,
      patientId: clinicalCase.patientId,
      cycle,
      status: 'pending_response', // ['pending_response', 'replied', 'superseded', 'cancelled']
      requestedFields: Array.isArray(requestedFields) ? requestedFields : [],
      clinicalRationale: rationale,
      priority,
      requestedBy: {
        uid: doctor.uid,
        name: doctor.name || doctor.displayName || 'Physician',
        licenseNumber: doctor.licenseNumber || 'MD-LIC',
        specialty: doctor.specialty || 'General / Respiratory'
      },
      requestedAt,
      repliedAt: null,
      responseId: null
    };

    this.requests.set(requestId, requestRecord);

    // 4. Transition case status to 'more_info_requested'
    clinicalCase.status = 'more_info_requested';
    clinicalCase.activeRequestId = requestId;
    clinicalCase.lastInfoRequestedAt = requestedAt;
    clinicalCase.moreInfoNote = rationale;
    clinicalCase.updatedAt = requestedAt;

    this._logAudit('INFO_REQUEST_CREATED', {
      requestId,
      caseId,
      cycle,
      doctorId: doctor.uid,
      patientId: clinicalCase.patientId
    });

    return requestRecord;
  }

  // =============================================================================
  // 2. SUBMIT INFORMATION REPLY (PATIENT ONLY)
  // =============================================================================

  submitInformationReply({
    caseId,
    requestId,
    patient,
    patientNotes = '',
    measurements = [],
    symptoms = null,
    files = [],
    provenance = null
  }) {
    if (!caseId) throw new Error('caseId is mandatory.');
    const clinicalCase = this.cases.get(caseId);
    if (!clinicalCase) {
      const err = new Error(`Clinical case ${caseId} does not exist.`);
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 1. Ownership Enforcement: Only the case patient can submit a reply
    if (!patient || !patient.uid) {
      const err = new Error('Authenticated patient identity is required.');
      err.code = 'UNAUTHENTICATED';
      err.statusCode = 401;
      throw err;
    }

    if (clinicalCase.patientId !== patient.uid) {
      const err = new Error('Access denied: You are not authorized to reply to another patient\'s case.');
      err.code = 'FORBIDDEN_CASE_OWNERSHIP_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // 2. Validate Target Request
    const targetRequestId = requestId || clinicalCase.activeRequestId;
    if (!targetRequestId) {
      const err = new Error('No active information request associated with this case.');
      err.code = 'NO_ACTIVE_REQUEST';
      err.statusCode = 400;
      throw err;
    }

    const requestRecord = this.requests.get(targetRequestId);
    if (!requestRecord || requestRecord.caseId !== caseId) {
      const err = new Error(`Information request ${targetRequestId} not found for case ${caseId}.`);
      err.code = 'REQUEST_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 3. Stale Reply & Duplicate Submission Checks
    if (requestRecord.status === 'replied') {
      const err = new Error(`Duplicate submission: Request ${targetRequestId} has already been answered with reply ${requestRecord.responseId}.`);
      err.code = 'REQUEST_ALREADY_ANSWERED';
      err.statusCode = 409;
      throw err;
    }

    if (requestRecord.status === 'superseded') {
      const err = new Error(`Stale reply: Request ${targetRequestId} was superseded by a newer request cycle.`);
      err.code = 'STALE_REQUEST_REPLY';
      err.statusCode = 409;
      throw err;
    }

    if (requestRecord.status === 'cancelled') {
      const err = new Error(`Stale reply: Request ${targetRequestId} has been cancelled by the clinical team.`);
      err.code = 'STALE_REQUEST_REPLY';
      err.statusCode = 400;
      throw err;
    }

    // 4. Valid Case Status Check: Must be 'more_info_requested'
    if (clinicalCase.status !== 'more_info_requested') {
      const err = new Error(`Cannot submit reply: Case status is '${clinicalCase.status}', expected 'more_info_requested'.`);
      err.code = 'INVALID_CASE_STATUS';
      err.statusCode = 400;
      throw err;
    }

    // 5. Forbidden Field Tampering Detection
    const rawPayload = arguments[0] || {};
    for (const key of Object.keys(rawPayload)) {
      if (FORBIDDEN_PATIENT_FIELDS.has(key)) {
        const err = new Error(`Security Violation: Field '${key}' is protected and cannot be written by patient.`);
        err.code = 'FORBIDDEN_FIELD_TAMPERING';
        err.statusCode = 403;
        this._logAudit('FORBIDDEN_FIELD_TAMPER_ATTEMPT', { caseId, patientId: patient.uid, field: key });
        throw err;
      }
    }

    // 6. Validate & Normalize Measurements (Conflicting Fields & Ranges)
    const validatedObservations = this._validateAndNormalizeMeasurements(measurements, {
      requestId: requestRecord.requestId,
      cycle: requestRecord.cycle,
      defaultProvenance: provenance
    });

    const submittedAt = new Date().toISOString();
    const replyId = `rep_info_${requestRecord.requestId}_${Date.now()}`;

    // 7. Assemble Reply Record
    const replyRecord = {
      replyId,
      requestId: requestRecord.requestId,
      caseId,
      patientId: patient.uid,
      cycle: requestRecord.cycle,
      author: {
        uid: patient.uid,
        name: patient.name || patient.displayName || 'Patient',
        role: 'patient'
      },
      patientNotes: String(patientNotes || '').trim(),
      symptoms: Array.isArray(symptoms) ? symptoms : null,
      measurements: validatedObservations,
      files: Array.isArray(files) ? files : [],
      submittedAt
    };

    this.replies.set(replyId, replyRecord);

    // 8. Update Request Record
    requestRecord.status = 'replied';
    requestRecord.responseId = replyId;
    requestRecord.repliedAt = submittedAt;

    // 9. Append Observations to Historical Store without Overwriting Past Measurements
    for (const obs of validatedObservations) {
      this._recordObservation(caseId, {
        ...obs,
        replyId
      });
    }

    // 10. Update Canonical Current Assessment & Increment Clinical Revision
    const previousAssessmentSnapshot = JSON.parse(JSON.stringify(clinicalCase.currentAssessment || {}));
    const changesReport = {};

    for (const obs of validatedObservations) {
      const oldVal = clinicalCase.currentAssessment[obs.type];
      clinicalCase.currentAssessment[obs.type] = obs.value;
      changesReport[obs.type] = {
        previous: oldVal !== undefined ? oldVal : null,
        current: obs.value,
        unit: obs.unit
      };

      // Maintain backward-compatible top-level aliases on case
      if (obs.type === 'oxygenLevel') clinicalCase.o2 = obs.value;
      if (obs.type === 'temperature') clinicalCase.temperature = obs.value;
      if (obs.type === 'heartRate') clinicalCase.heartRate = obs.value;
      if (obs.type === 'systolicBp') clinicalCase.systolicBp = obs.value;
      if (obs.type === 'diastolicBp') clinicalCase.diastolicBp = obs.value;
    }

    if (Array.isArray(symptoms) && symptoms.length > 0) {
      changesReport.symptoms = {
        previous: clinicalCase.currentAssessment.symptoms || [],
        current: symptoms
      };
      clinicalCase.currentAssessment.symptoms = symptoms;
      clinicalCase.symptoms = symptoms;
    }

    // Increment clinical revision
    clinicalCase.clinicalRevision = (clinicalCase.clinicalRevision || 1) + 1;
    clinicalCase.lastRevisionAt = submittedAt;

    // Record revision entry
    const revisionRecord = {
      revision: clinicalCase.clinicalRevision,
      createdAt: submittedAt,
      trigger: 'patient_more_info_reply',
      cycle: requestRecord.cycle,
      requestId: requestRecord.requestId,
      replyId,
      authorUid: patient.uid,
      changes: changesReport
    };

    const caseRevisions = this.revisions.get(caseId) || [];
    caseRevisions.push(revisionRecord);
    this.revisions.set(caseId, caseRevisions);

    // 11. Valid Transition: Move Case from 'more_info_requested' back to 'under_review'
    clinicalCase.status = 'under_review';
    clinicalCase.lastInfoRepliedAt = submittedAt;
    clinicalCase.activeRequestId = null;
    clinicalCase.updatedAt = submittedAt;

    this._logAudit('INFO_REPLY_ACCEPTED', {
      caseId,
      requestId: requestRecord.requestId,
      replyId,
      cycle: requestRecord.cycle,
      newRevision: clinicalCase.clinicalRevision,
      observationsCount: validatedObservations.length
    });

    return {
      success: true,
      reply: replyRecord,
      caseStatus: clinicalCase.status,
      clinicalRevision: clinicalCase.clinicalRevision,
      changes: changesReport
    };
  }

  // =============================================================================
  // 3. MEASUREMENT VALIDATION & ANTI-CONFLICT ENGINE
  // =============================================================================

  _validateAndNormalizeMeasurements(measurements, { requestId, cycle, defaultProvenance }) {
    if (!Array.isArray(measurements)) return [];

    const now = Date.now();
    const validated = [];
    const seenTypes = new Set();
    let systolic = null;
    let diastolic = null;

    for (const m of measurements) {
      if (!m || !m.type) {
        const err = new Error('Each measurement must specify a valid clinical \'type\'.');
        err.code = 'INVALID_MEASUREMENT_SCHEMA';
        err.statusCode = 400;
        throw err;
      }

      const meta = ALLOWED_MEASUREMENT_TYPES[m.type];
      if (!meta) {
        const err = new Error(`Unsupported or unallowed measurement type '${m.type}'. Allowed: ${Object.keys(ALLOWED_MEASUREMENT_TYPES).join(', ')}`);
        err.code = 'UNSUPPORTED_MEASUREMENT_TYPE';
        err.statusCode = 400;
        throw err;
      }

      // Check duplicate / conflicting measurements of same type within same payload
      if (seenTypes.has(m.type)) {
        const err = new Error(`Conflicting measurement: Multiple values supplied for '${m.type}' in a single submission.`);
        err.code = 'CONFLICTING_MEASUREMENT_FIELDS';
        err.statusCode = 400;
        throw err;
      }
      seenTypes.add(m.type);

      // Validate numeric value without silent coercion
      if (m.value === null || m.value === undefined || (typeof m.value === 'string' && m.value.trim() === '')) {
        const err = new Error(`Empty value for measurement '${m.type}'.`);
        err.code = 'EMPTY_MEASUREMENT_VALUE';
        err.statusCode = 400;
        throw err;
      }

      if (typeof m.value === 'boolean' || (typeof m.value === 'object' && m.value !== null)) {
        const err = new Error(`Unsupported value type for measurement '${m.type}'.`);
        err.code = 'UNSUPPORTED_MEASUREMENT_VALUE';
        err.statusCode = 400;
        throw err;
      }

      const rawStr = String(m.value).trim();
      if (/^(unknown|غير معروف|غير معلوم|not-provided|unspecified|none)$/i.test(rawStr)) {
        const err = new Error(`Unknown measurement for '${m.type}'. Never invent a clinical measurement.`);
        err.code = 'UNKNOWN_MEASUREMENT';
        err.statusCode = 400;
        throw err;
      }

      const normalizedStr = rawStr
        .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
        .replace(/[\u066B,]/g, '.');

      if (normalizedStr.startsWith('-') || /-\d/.test(normalizedStr)) {
        const err = new Error(`Negative value for measurement '${m.type}' is physiologically impossible.`);
        err.code = 'NEGATIVE_MEASUREMENT_VALUE';
        err.statusCode = 400;
        throw err;
      }

      if (!/^\d+(?:\.\d+)?$/.test(normalizedStr)) {
        const err = new Error(`Invalid non-numeric value for measurement '${m.type}'.`);
        err.code = 'INVALID_MEASUREMENT_VALUE';
        err.statusCode = 400;
        throw err;
      }

      const rawVal = Number(normalizedStr);
      if (isNaN(rawVal) || !Number.isFinite(rawVal)) {
        const err = new Error(`Invalid non-numeric value for measurement '${m.type}'.`);
        err.code = 'INVALID_MEASUREMENT_VALUE';
        err.statusCode = 400;
        throw err;
      }

      // Validate unit
      const suppliedUnit = m.unit ? String(m.unit).trim() : meta.canonicalUnit;
      if (!meta.validUnits.map(u => u.toLowerCase()).includes(suppliedUnit.toLowerCase())) {
        const err = new Error(`Invalid unit '${suppliedUnit}' for measurement '${m.type}'. Allowed units: ${meta.validUnits.join(', ')}`);
        err.code = 'INVALID_MEASUREMENT_UNIT';
        err.statusCode = 400;
        throw err;
      }

      // Normalize if applicable (e.g. Fahrenheit -> Celsius)
      let canonicalVal = rawVal;
      if (typeof meta.normalize === 'function') {
        canonicalVal = meta.normalize(rawVal, suppliedUnit);
      }

      // Validate physiological boundary
      if (canonicalVal < meta.min || canonicalVal > meta.max) {
        const err = new Error(`Physiologically implausible value ${canonicalVal} for '${m.type}'. Valid range is ${meta.min} to ${meta.max} ${meta.canonicalUnit}.`);
        err.code = 'IMPLAUSIBLE_MEASUREMENT_RANGE';
        err.statusCode = 422;
        throw err;
      }

      // Track blood pressure components for conflict check
      if (m.type === 'systolicBp') systolic = canonicalVal;
      if (m.type === 'diastolicBp') diastolic = canonicalVal;

      // Validate measurement time (no future timestamps permitted)
      let measuredAt = m.measuredAt;
      if (measuredAt) {
        const measuredTime = new Date(measuredAt).getTime();
        if (isNaN(measuredTime)) {
          const err = new Error(`Malformed measurement timestamp '${measuredAt}'.`);
          err.code = 'INVALID_MEASUREMENT_TIME';
          err.statusCode = 400;
          throw err;
        }
        if (measuredTime > now + 60000) { // 1 minute clock skew tolerance
          const err = new Error(`Measurement timestamp cannot be in the future (${measuredAt}).`);
          err.code = 'FUTURE_MEASUREMENT_TIMESTAMP';
          err.statusCode = 400;
          throw err;
        }
      } else {
        measuredAt = new Date().toISOString();
      }

      // Provenance attribution
      const prov = {
        source: m.provenance?.source || defaultProvenance?.source || 'patient_self_report',
        deviceDetails: m.provenance?.deviceDetails || defaultProvenance?.deviceDetails || null,
        verified: Boolean(m.provenance?.verified || defaultProvenance?.verified || false)
      };

      validated.push({
        id: `obs_${m.type}_c${cycle}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        type: m.type,
        name: meta.name,
        value: canonicalVal,
        unit: meta.canonicalUnit,
        originalValue: rawVal !== canonicalVal ? rawVal : undefined,
        originalUnit: suppliedUnit !== meta.canonicalUnit ? suppliedUnit : undefined,
        measuredAt,
        recordedAt: new Date().toISOString(),
        provenance: prov,
        cycle,
        requestId
      });
    }

    // Conflicting Blood Pressure Check: Systolic MUST exceed Diastolic
    if (systolic !== null && diastolic !== null) {
      if (systolic <= diastolic) {
        const err = new Error(`Conflicting blood pressure: Systolic (${systolic} mmHg) must be strictly greater than Diastolic (${diastolic} mmHg).`);
        err.code = 'CONFLICTING_BLOOD_PRESSURE_INTERVAL';
        err.statusCode = 422;
        throw err;
      }
    }

    return validated;
  }

  // =============================================================================
  // 4. OBSERVATION & REVISION HISTORIES
  // =============================================================================

  _recordObservation(caseId, obs) {
    const list = this.observations.get(caseId) || [];
    list.push({
      id: obs.id || `obs_${obs.type}_${Date.now()}`,
      caseId,
      ...obs
    });
    this.observations.set(caseId, list);
  }

  getCaseObservationHistory(caseId, filterType = null) {
    const list = this.observations.get(caseId) || [];
    if (filterType) {
      return list.filter(o => o.type === filterType);
    }
    return list;
  }

  getCaseRevisionHistory(caseId) {
    return this.revisions.get(caseId) || [];
  }

  getCaseRequestHistory(caseId) {
    return Array.from(this.requests.values())
      .filter(r => r.caseId === caseId)
      .sort((a, b) => a.cycle - b.cycle);
  }

  getRequestById(requestId) {
    return this.requests.get(requestId);
  }

  getReplyById(replyId) {
    return this.replies.get(replyId);
  }

  // =============================================================================
  // 5. AUDIT LOGGING
  // =============================================================================

  _logAudit(eventType, metadata = {}) {
    const entry = {
      id: `audit_cie_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      eventType,
      metadata
    };
    this.auditLogs.push(entry);
    if (this.auditLogs.length > 500) this.auditLogs.shift();
    return entry;
  }

  getAuditLogs(filter = {}) {
    return this.auditLogs.filter(log => {
      if (filter.eventType && log.eventType !== filter.eventType) return false;
      if (filter.caseId && log.metadata.caseId !== filter.caseId) return false;
      return true;
    });
  }
}

module.exports = new ClinicalInfoExchangeService();
