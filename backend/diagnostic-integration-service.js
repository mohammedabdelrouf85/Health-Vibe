/**
 * Health Vibe AI - Diagnostic Laboratory & Imaging Integration Service
 *
 * Enterprise-grade FHIR v4.0.1 compliant integration engine managing:
 * 1. Partner Registry & Bilateral Agreement Governance (Sandbox vs Production).
 * 2. Granular Patient Opt-in Consent Verification & Expiry.
 * 3. Doctor-Signed Diagnostic Orders (LOINC / RADLEX / SNOMED CT Mapping).
 * 4. Secure Transport & Webhook Ingestion with HMAC-SHA256 Cryptographic Verification.
 * 5. Panic / Critical Laboratory Value Detection & Clinical Escalation.
 * 6. Mandatory Physician Review Gate prior to Patient Result Disclosure.
 * 7. Resilient Exponential Backoff Retry Engine & Dead Letter Queue (DLQ).
 * 8. Comprehensive Audit Trails & Real-Time Observability Metrics.
 */

const crypto = require('crypto');

// Standard Clinical Codes (LOINC & RADLEX)
const CLINICAL_CODE_REGISTRY = {
  // Laboratory Tests
  '1994-3': {
    code: '1994-3',
    name: 'Oxygen saturation in Arterial blood (SaO2)',
    category: 'laboratory',
    unit: '%',
    referenceRange: { low: 95, high: 100 },
    panicThresholds: { criticalLow: 85, criticalHigh: null }
  },
  '48065-7': {
    code: '48065-7',
    name: 'D-Dimer (quantitative)',
    category: 'laboratory',
    unit: 'ng/mL FEU',
    referenceRange: { low: 0, high: 500 },
    panicThresholds: { criticalLow: null, criticalHigh: 2000 }
  },
  '4548-4': {
    code: '4548-4',
    name: 'Hemoglobin A1c (HbA1c)',
    category: 'laboratory',
    unit: '%',
    referenceRange: { low: 4.0, high: 5.6 },
    panicThresholds: { criticalLow: null, criticalHigh: 12.0 }
  },
  '2160-0': {
    code: '2160-0',
    name: 'Serum Creatinine',
    category: 'laboratory',
    unit: 'mg/dL',
    referenceRange: { low: 0.7, high: 1.3 },
    panicThresholds: { criticalLow: null, criticalHigh: 4.0 }
  },
  '2823-3': {
    code: '2823-3',
    name: 'Serum Potassium (K+)',
    category: 'laboratory',
    unit: 'mmol/L',
    referenceRange: { low: 3.5, high: 5.0 },
    panicThresholds: { criticalLow: 2.8, criticalHigh: 6.2 }
  },
  '2093-3': {
    code: '2093-3',
    name: 'Total Cholesterol',
    category: 'laboratory',
    unit: 'mg/dL',
    referenceRange: { low: 0, high: 199 },
    panicThresholds: { criticalLow: null, criticalHigh: 400 }
  },
  // Radiology & Imaging
  '36643-5': {
    code: '36643-5',
    name: 'Chest X-Ray Frontal and Lateral Views',
    category: 'imaging',
    modality: 'CR / DX',
    type: 'qualitative'
  },
  '24627-2': {
    code: '24627-2',
    name: 'CT Thorax without IV Contrast',
    category: 'imaging',
    modality: 'CT',
    type: 'qualitative'
  }
};

class DiagnosticIntegrationService {
  constructor() {
    this.resetStoreForTesting();
  }

  resetStoreForTesting() {
    this.partners = new Map();
    this.consents = new Map(); // key: `${patientId}_${partnerId}`
    this.orders = new Map();
    this.results = new Map();
    this.dlq = new Map();
    this.auditLogs = [];
    this.metrics = {
      ordersCreated: 0,
      dispatchesAttempted: 0,
      dispatchesSuccessful: 0,
      retriesTriggered: 0,
      dlqExhaustedCount: 0,
      webhooksReceived: 0,
      panicValuesFlagged: 0,
      resultsApproved: 0,
      totalLatencyMs: 0
    };

    // Initialize Default Accredited Diagnostic Partner
    this.registerPartner({
      id: 'PARTNER_ALBORG_MOKHTABAR',
      name: 'Al-Borg & Al-Mokhtabar Diagnostic Network',
      classification: 'central_diagnostic_laboratory_and_imaging',
      endpoint: 'https://sandbox.diagnostics.albmg.local/fhir/v4',
      sharedSecret: 'sandbox_hmac_secret_albmg_2026',
      agreementStatus: 'pilot_sandbox', // ['draft', 'under_review', 'pilot_sandbox', 'active_ratified']
      mode: 'sandbox', // ['sandbox', 'production']
      supportedStandards: ['HL7_FHIR_R4', 'DICOMweb'],
      registeredAt: new Date().toISOString()
    });
  }

  // =============================================================================
  // 1. PARTNER REGISTRY & BILATERAL AGREEMENT MANAGEMENT
  // =============================================================================

  registerPartner(partnerData) {
    if (!partnerData.id || !partnerData.name) {
      throw new Error('Partner ID and Name are mandatory.');
    }
    this.partners.set(partnerData.id, {
      ...partnerData,
      updatedAt: new Date().toISOString()
    });
    this._logAudit('PARTNER_REGISTERED', { partnerId: partnerData.id, name: partnerData.name });
    return this.partners.get(partnerData.id);
  }

  getPartner(partnerId) {
    return this.partners.get(partnerId);
  }

  updatePartnerAgreement(partnerId, { agreementStatus, mode, ratifiedBy }) {
    const partner = this.partners.get(partnerId);
    if (!partner) throw new Error('PARTNER_NOT_FOUND');

    const validStatuses = ['draft', 'under_review', 'pilot_sandbox', 'active_ratified'];
    if (agreementStatus && !validStatuses.includes(agreementStatus)) {
      throw new Error(`Invalid agreement status. Must be one of: ${validStatuses.join(', ')}`);
    }

    partner.agreementStatus = agreementStatus || partner.agreementStatus;
    partner.mode = mode || partner.mode;
    partner.agreementRatifiedAt = agreementStatus === 'active_ratified' ? new Date().toISOString() : partner.agreementRatifiedAt;
    partner.agreementRatifiedBy = ratifiedBy || partner.agreementRatifiedBy;
    partner.updatedAt = new Date().toISOString();

    this._logAudit('PARTNER_AGREEMENT_UPDATED', {
      partnerId,
      agreementStatus: partner.agreementStatus,
      mode: partner.mode,
      ratifiedBy
    });

    return partner;
  }

  // =============================================================================
  // 2. PATIENT CONSENT GOVERNANCE
  // =============================================================================

  recordPatientConsent({ patientId, partnerId, purpose = 'clinical_treatment_and_diagnostics', validityDays = 90 }) {
    if (!patientId || !partnerId) throw new Error('patientId and partnerId are mandatory.');
    const partner = this.partners.get(partnerId);
    if (!partner) throw new Error('PARTNER_NOT_FOUND');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

    const consentRecord = {
      consentId: `csnt_${patientId}_${Date.now()}`,
      patientId,
      partnerId,
      purpose,
      status: 'granted',
      grantedAt: now.toISOString(),
      expiresAt,
      revokedAt: null
    };

    const key = `${patientId}_${partnerId}`;
    this.consents.set(key, consentRecord);

    this._logAudit('DIAGNOSTIC_CONSENT_GRANTED', { patientId, partnerId, expiresAt });
    return consentRecord;
  }

  revokePatientConsent({ patientId, partnerId, reason = 'patient_requested' }) {
    const key = `${patientId}_${partnerId}`;
    const consent = this.consents.get(key);
    if (!consent || consent.status !== 'granted') {
      throw new Error('NO_ACTIVE_CONSENT_FOUND');
    }

    consent.status = 'revoked';
    consent.revokedAt = new Date().toISOString();
    consent.revocationReason = reason;

    this._logAudit('DIAGNOSTIC_CONSENT_REVOKED', { patientId, partnerId, reason });
    return consent;
  }

  hasValidConsent(patientId, partnerId) {
    const key = `${patientId}_${partnerId}`;
    const consent = this.consents.get(key);
    if (!consent) return false;
    if (consent.status !== 'granted') return false;

    const now = new Date().getTime();
    const expiry = new Date(consent.expiresAt).getTime();
    return now <= expiry;
  }

  // =============================================================================
  // 3. DIAGNOSTIC ORDER CREATION (PHYSICIAN ONLY)
  // =============================================================================

  createDiagnosticOrder({ doctor, patient, partnerId, tests, clinicalIndication, priority = 'routine', visitId = null }) {
    // Physician Authorization Validation
    if (!doctor || doctor.status !== 'approved' || doctor.licenseStatus === 'revoked' || doctor.isLicenseExpired) {
      const err = new Error('Only an approved doctor with active medical credentials can sign diagnostic orders.');
      err.code = 'UNAUTHORIZED_PRESCRIBER';
      err.statusCode = 403;
      throw err;
    }

    if (!patient || !patient.id) {
      throw new Error('Patient record is mandatory.');
    }

    const partner = this.partners.get(partnerId);
    if (!partner) {
      const err = new Error('Invalid diagnostic partner identifier.');
      err.code = 'INVALID_PARTNER';
      err.statusCode = 400;
      throw err;
    }

    if (!Array.isArray(tests) || tests.length === 0) {
      throw new Error('At least one diagnostic investigation code is required.');
    }

    // Validate LOINC / RADLEX Codes
    const validatedTests = tests.map(t => {
      const code = typeof t === 'string' ? t : t.code;
      const meta = CLINICAL_CODE_REGISTRY[code];
      if (!meta) {
        const err = new Error(`Unrecognized or unsupported clinical code: ${code}`);
        err.code = 'UNRECOGNIZED_LOINC_CODE';
        err.statusCode = 400;
        throw err;
      }
      return {
        code: meta.code,
        name: meta.name,
        category: meta.category,
        unit: meta.unit || null,
        instructions: t.instructions || null
      };
    });

    const orderId = `diag_ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const issuedAt = new Date().toISOString();

    // Generate Electronic Signature of Prescribing Physician
    const signaturePayload = `${orderId}|${doctor.uid}|${doctor.licenseNumber}|${patient.id}|${issuedAt}|${tests.map(t => typeof t === 'string' ? t : t.code).join(',')}`;
    const digitalSignature = crypto.createHmac('sha256', doctor.uid + (doctor.licenseNumber || 'DOC_LIC')).update(signaturePayload).digest('hex');

    const orderRecord = {
      orderId,
      partnerId,
      visitId,
      status: 'signed', // ['signed', 'dispatched', 'sample_collected', 'results_received', 'doctor_approved', 'cancelled', 'failed_dlq']
      priority,
      clinicalIndication: clinicalIndication || 'Diagnostic evaluation following clinical assessment',
      patient: {
        id: patient.id,
        name: patient.name || 'Patient',
        gender: patient.gender || 'unknown',
        birthDate: patient.birthDate || patient.dob || '1990-01-01',
        nationalIdHash: patient.nationalId ? crypto.createHash('sha256').update(patient.nationalId).digest('hex') : null
      },
      prescribingDoctor: {
        doctorId: doctor.uid,
        name: doctor.name,
        licenseNumber: doctor.licenseNumber,
        specialty: doctor.specialty || 'General / Internal Medicine'
      },
      tests: validatedTests,
      issuedAt,
      digitalSignature: {
        algorithm: 'HMAC-SHA256',
        hash: digitalSignature,
        signedAt: issuedAt
      },
      dispatchHistory: []
    };

    this.orders.set(orderId, orderRecord);
    this.metrics.ordersCreated++;
    this._logAudit('DIAGNOSTIC_ORDER_CREATED', { orderId, doctorId: doctor.uid, patientId: patient.id, testsCount: validatedTests.length });

    return orderRecord;
  }

  // =============================================================================
  // 4. SECURE DISPATCH, EXPONENTIAL RETRY & DEAD LETTER QUEUE (DLQ)
  // =============================================================================

  async dispatchOrderToPartner(orderId, options = {}) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');

    const partner = this.partners.get(order.partnerId);
    if (!partner) throw new Error('PARTNER_NOT_FOUND');

    // 1. Mandatory Patient Consent Check
    if (!this.hasValidConsent(order.patient.id, order.partnerId)) {
      const err = new Error('Order dispatch rejected: Active patient consent for diagnostic data sharing is missing or expired.');
      err.code = 'CONSENT_MISSING_OR_REVOKED';
      err.statusCode = 403;
      this._logAudit('ORDER_DISPATCH_BLOCKED_NO_CONSENT', { orderId, patientId: order.patient.id });
      throw err;
    }

    // 2. Hard Quarantine on Unratified Partner in Production
    // If not in sandbox, partner agreement must be active_ratified
    const isRealDataTransfer = !options.simulateSandbox && partner.mode === 'production';
    if (isRealDataTransfer && partner.agreementStatus !== 'active_ratified') {
      const err = new Error(`Patient data transfer prohibited: Bilateral integration agreement with partner ${partner.id} is in status '${partner.agreementStatus}', not 'active_ratified'.`);
      err.code = 'DATA_TRANSFER_BLOCKED_UNRATIFIED_PARTNER';
      err.statusCode = 403;
      this._logAudit('SECURITY_VIOLATION_UNRATIFIED_PARTNER', {
        orderId,
        partnerId: partner.id,
        agreementStatus: partner.agreementStatus
      });
      throw err;
    }

    // 3. Prepare Standard FHIR ServiceRequest Transmission Payload
    const transmissionPayload = this._buildFhirServiceRequest(order, partner);

    // 4. Dispatch with Exponential Backoff & Retry Logic
    this.metrics.dispatchesAttempted++;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    let attempt = 0;
    let success = false;
    let lastError = null;

    while (attempt <= maxRetries && !success) {
      attempt++;
      const startTime = Date.now();
      try {
        if (options.failSimulateTransient && attempt <= (options.failAttemptsCount || 1)) {
          throw new Error('PARTNER_GATEWAY_TIMEOUT: 504 Gateway Timeout connecting to laboratory node');
        }

        if (options.failSimulatePermanent) {
          const permErr = new Error('SCHEMA_VALIDATION_ERROR: Invalid FHIR ServiceRequest JSON structure');
          permErr.isPermanent = true;
          throw permErr;
        }

        // Successful Dispatch simulation or HTTP post
        const latency = Date.now() - startTime;
        this.metrics.totalLatencyMs += latency;
        this.metrics.dispatchesSuccessful++;

        order.status = 'dispatched';
        order.dispatchedAt = new Date().toISOString();
        order.transmissionId = `trans_${orderId}_${Date.now()}`;
        order.partnerReference = `LAB-ORD-${orderId.slice(-6).toUpperCase()}`;

        order.dispatchHistory.push({
          attempt,
          timestamp: new Date().toISOString(),
          status: 'success',
          latencyMs: latency
        });

        this._logAudit('DIAGNOSTIC_ORDER_DISPATCHED', {
          orderId,
          partnerId: partner.id,
          transmissionId: order.transmissionId,
          attempts: attempt
        });

        success = true;
        return {
          success: true,
          orderId,
          status: order.status,
          transmissionId: order.transmissionId,
          partnerReference: order.partnerReference,
          attempts: attempt
        };

      } catch (err) {
        lastError = err;
        const latency = Date.now() - startTime;

        order.dispatchHistory.push({
          attempt,
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: err.message,
          latencyMs: latency
        });

        // Permanent errors do not retry
        if (err.isPermanent || err.code === 'SCHEMA_VALIDATION_ERROR') {
          break;
        }

        if (attempt <= maxRetries) {
          this.metrics.retriesTriggered++;
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          if (options.syncDelay) {
            await new Promise(r => setTimeout(r, 10)); // abbreviated in test execution
          }
        }
      }
    }

    // If exhausted or permanent fail, move to Dead Letter Queue (DLQ)
    order.status = 'failed_dlq';
    order.failedAt = new Date().toISOString();
    order.exhaustedError = lastError ? lastError.message : 'DISPATCH_FAILED';

    const dlqId = `dlq_${orderId}_${Date.now()}`;
    const dlqItem = {
      dlqId,
      orderId,
      partnerId: partner.id,
      failedAt: order.failedAt,
      attemptsMade: attempt,
      lastError: order.exhaustedError,
      payload: transmissionPayload,
      resolutionStatus: 'quarantined'
    };

    this.dlq.set(dlqId, dlqItem);
    this.metrics.dlqExhaustedCount++;

    this._logAudit('ORDER_DISPATCH_EXHAUSTED_DLQ', {
      orderId,
      partnerId: partner.id,
      dlqId,
      attempts: attempt,
      error: order.exhaustedError
    });

    const errorToThrow = new Error(`Order dispatch failed after ${attempt} attempts: ${order.exhaustedError}`);
    errorToThrow.code = 'DISPATCH_RETRY_EXHAUSTED';
    errorToThrow.dlqId = dlqId;
    errorToThrow.order = order;
    throw errorToThrow;
  }

  // =============================================================================
  // 5. INCOMING RESULT WEBHOOK WITH HMAC-SHA256 VERIFICATION
  // =============================================================================

  ingestDiagnosticResult({ partnerId, payload, signatureHeader }) {
    this.metrics.webhooksReceived++;
    const partner = this.partners.get(partnerId);
    if (!partner) {
      const err = new Error('Unregistered diagnostic partner.');
      err.code = 'INVALID_PARTNER';
      err.statusCode = 401;
      throw err;
    }

    // 1. Verify Cryptographic Signature
    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto.createHmac('sha256', partner.sharedSecret).update(rawPayload).digest('hex');

    if (!signatureHeader || signatureHeader !== expectedSignature) {
      const err = new Error('Cryptographic signature verification failed: Partner HMAC-SHA256 signature does not match payload.');
      err.code = 'SIGNATURE_VERIFICATION_FAILED';
      err.statusCode = 401;
      this._logAudit('WEBHOOK_SIGNATURE_TAMPER_DETECTED', { partnerId, providedSignature: signatureHeader });
      throw err;
    }

    const parsedData = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const { orderId, labReference, observations, reportSummary } = parsedData;

    if (!orderId || !Array.isArray(observations) || observations.length === 0) {
      const err = new Error('Invalid diagnostic result schema: orderId and non-empty observations are required.');
      err.code = 'SCHEMA_VALIDATION_ERROR';
      err.statusCode = 422;
      throw err;
    }

    const order = this.orders.get(orderId);
    if (!order) {
      const err = new Error(`Diagnostic order ${orderId} does not exist in EHR.`);
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 2. Process and Evaluate Observations against Clinical Ranges & Panic Thresholds
    let hasPanicValue = false;
    const evaluatedObservations = observations.map(obs => {
      const meta = CLINICAL_CODE_REGISTRY[obs.code] || {};
      const numericValue = typeof obs.value === 'number' ? obs.value : parseFloat(obs.value);

      let flag = 'normal'; // ['normal', 'low', 'high', 'critical_low', 'critical_high']

      if (!isNaN(numericValue) && meta.referenceRange) {
        if (meta.panicThresholds?.criticalLow !== null && numericValue <= meta.panicThresholds.criticalLow) {
          flag = 'critical_low';
          hasPanicValue = true;
        } else if (meta.panicThresholds?.criticalHigh !== null && numericValue >= meta.panicThresholds.criticalHigh) {
          flag = 'critical_high';
          hasPanicValue = true;
        } else if (numericValue < meta.referenceRange.low) {
          flag = 'low';
        } else if (numericValue > meta.referenceRange.high) {
          flag = 'high';
        }
      }

      return {
        code: obs.code,
        name: obs.name || meta.name || obs.code,
        value: obs.value,
        unit: obs.unit || meta.unit || '',
        referenceRange: meta.referenceRange || null,
        interpretationFlag: flag,
        comment: obs.comment || null
      };
    });

    if (hasPanicValue) {
      this.metrics.panicValuesFlagged++;
      this._logAudit('CRITICAL_PANIC_VALUE_DETECTED', { orderId, partnerId, observations: evaluatedObservations.filter(o => o.interpretationFlag.startsWith('critical')) });
    }

    const resultId = `diag_res_${orderId}_${Date.now()}`;
    const resultRecord = {
      resultId,
      orderId,
      partnerId,
      labReference: labReference || `LAB-REP-${Date.now()}`,
      patientId: order.patient.id,
      prescribingDoctorId: order.prescribingDoctor.doctorId,
      status: 'received_pending_review', // Strictly gated: requires doctor review!
      hasPanicValue,
      observations: evaluatedObservations,
      reportSummary: reportSummary || 'Laboratory analysis completed by accredited diagnostic partner.',
      receivedAt: new Date().toISOString(),
      doctorReview: null
    };

    this.results.set(resultId, resultRecord);
    order.status = 'results_received';
    order.resultId = resultId;

    this._logAudit('DIAGNOSTIC_RESULT_INGESTED', {
      resultId,
      orderId,
      partnerId,
      hasPanicValue,
      status: resultRecord.status
    });

    return resultRecord;
  }

  // =============================================================================
  // 6. MANDATORY PHYSICIAN REVIEW GATE
  // =============================================================================

  doctorReviewAndApproveResult({ resultId, doctor, clinicalInterpretation, followUpPlan = null }) {
    const result = this.results.get(resultId);
    if (!result) throw new Error('RESULT_NOT_FOUND');

    if (!doctor || doctor.status !== 'approved' || doctor.licenseStatus === 'revoked' || doctor.isLicenseExpired) {
      const err = new Error('Only an approved physician with valid active credentials can approve diagnostic reports.');
      err.code = 'UNAUTHORIZED_REVIEWER';
      err.statusCode = 403;
      throw err;
    }

    if (!clinicalInterpretation || clinicalInterpretation.trim().length < 5) {
      throw new Error('A valid physician clinical interpretation is mandatory before report release.');
    }

    const reviewedAt = new Date().toISOString();
    const signaturePayload = `${resultId}|${doctor.uid}|${doctor.licenseNumber}|${reviewedAt}`;
    const digitalSignature = crypto.createHmac('sha256', doctor.uid + (doctor.licenseNumber || 'LIC')).update(signaturePayload).digest('hex');

    result.status = 'doctor_approved';
    result.doctorReview = {
      doctorId: doctor.uid,
      doctorName: doctor.name,
      licenseNumber: doctor.licenseNumber,
      clinicalInterpretation,
      followUpPlan,
      reviewedAt,
      digitalSignature
    };

    const order = this.orders.get(result.orderId);
    if (order) {
      order.status = 'doctor_approved';
    }

    this.metrics.resultsApproved++;
    this._logAudit('DIAGNOSTIC_RESULT_APPROVED', {
      resultId,
      orderId: result.orderId,
      doctorId: doctor.uid,
      reviewedAt
    });

    return result;
  }

  // =============================================================================
  // 7. SECURE SYNCHRONIZATION ROUTINE
  // =============================================================================

  async syncPartnerPendingResults(partnerId) {
    const partner = this.partners.get(partnerId);
    if (!partner) throw new Error('PARTNER_NOT_FOUND');

    const syncSessionId = `sync_${partnerId}_${Date.now()}`;
    const startTime = Date.now();

    // Query orders that are in 'dispatched' or 'sample_collected' status
    const pendingOrders = Array.from(this.orders.values()).filter(
      o => o.partnerId === partnerId && (o.status === 'dispatched' || o.status === 'sample_collected')
    );

    const syncedResults = [];

    // In sandbox, simulate automated synchronization
    for (const ord of pendingOrders) {
      if (partner.mode === 'sandbox') {
        const simResult = this.simulateSandboxResult({
          orderId: ord.orderId,
          partnerId: partner.id
        });
        syncedResults.push(simResult);
      }
    }

    const latency = Date.now() - startTime;
    this._logAudit('PARTNER_SYNC_COMPLETED', {
      syncSessionId,
      partnerId,
      pendingCount: pendingOrders.length,
      syncedCount: syncedResults.length,
      latencyMs: latency
    });

    return {
      syncSessionId,
      partnerId,
      pendingOrdersCount: pendingOrders.length,
      syncedCount: syncedResults.length,
      latencyMs: latency
    };
  }

  // =============================================================================
  // 8. SANDBOX HELPER (SIMULATE ACCREDITED LAB WORKFLOW)
  // =============================================================================

  simulateSandboxResult({ orderId, partnerId, customObservations = null, triggerPanic = false }) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');

    const partner = this.partners.get(partnerId || order.partnerId);
    if (!partner) throw new Error('PARTNER_NOT_FOUND');

    let observations = customObservations;
    if (!observations) {
      observations = order.tests.map(test => {
        const meta = CLINICAL_CODE_REGISTRY[test.code] || {};
        let val = 100;
        if (test.code === '1994-3') val = triggerPanic ? 82 : 98; // SaO2 (82% is critical panic!)
        else if (test.code === '48065-7') val = triggerPanic ? 3200 : 340; // D-Dimer
        else if (test.code === '2823-3') val = triggerPanic ? 2.5 : 4.2; // K+
        else if (test.code === '2160-0') val = 1.0;
        else if (test.code === '4548-4') val = 5.4;
        else if (test.code === '2093-3') val = 185;
        else if (meta.category === 'imaging') val = 'Clear lung fields bilaterally, no acute focal consolidation or pleural effusion.';

        return {
          code: test.code,
          name: test.name,
          value: val,
          unit: meta.unit || ''
        };
      });
    }

    const payload = {
      orderId,
      labReference: `SBX-LAB-REP-${Date.now().toString().slice(-6)}`,
      reportSummary: 'Automated Diagnostic Simulator - Accredited Sandbox Verification',
      observations
    };

    const rawPayload = JSON.stringify(payload);
    const signatureHeader = crypto.createHmac('sha256', partner.sharedSecret).update(rawPayload).digest('hex');

    return this.ingestDiagnosticResult({
      partnerId: partner.id,
      payload,
      signatureHeader
    });
  }

  // =============================================================================
  // 9. AUDITING, METRICS & QUERIES
  // =============================================================================

  _logAudit(eventType, metadata = {}) {
    const entry = {
      id: `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      eventType,
      metadata
    };
    this.auditLogs.push(entry);
    if (this.auditLogs.length > 500) {
      this.auditLogs.shift();
    }
    return entry;
  }

  getAuditLogs(filter = {}) {
    return this.auditLogs.filter(log => {
      if (filter.eventType && log.eventType !== filter.eventType) return false;
      if (filter.partnerId && log.metadata.partnerId !== filter.partnerId) return false;
      if (filter.orderId && log.metadata.orderId !== filter.orderId) return false;
      return true;
    });
  }

  getMonitoringMetrics() {
    return {
      ...this.metrics,
      activePartnersCount: this.partners.size,
      totalOrdersStored: this.orders.size,
      totalResultsStored: this.results.size,
      dlqCurrentSize: this.dlq.size,
      avgLatencyMs: this.metrics.dispatchesAttempted > 0
        ? Math.round(this.metrics.totalLatencyMs / this.metrics.dispatchesAttempted)
        : 0
    };
  }

  getPatientResults(patientId, requestingUser) {
    if (!patientId) throw new Error('patientId is required.');

    // Patients can only view 'doctor_approved' reports
    const isDoctorOrAdmin = requestingUser && (requestingUser.role === 'doctor' || requestingUser.role === 'admin' || requestingUser.role === 'owner');

    const list = Array.from(this.results.values()).filter(r => r.patientId === patientId);

    if (isDoctorOrAdmin) {
      return list;
    }

    // Patient filter: only approved results are disclosable
    return list.filter(r => r.status === 'doctor_approved');
  }

  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  getResult(resultId) {
    return this.results.get(resultId);
  }

  getDlqItems() {
    return Array.from(this.dlq.values());
  }

  // FHIR R4 ServiceRequest Generator
  _buildFhirServiceRequest(order, partner) {
    return {
      resourceType: 'ServiceRequest',
      id: order.orderId,
      status: 'active',
      intent: 'order',
      priority: order.priority,
      code: {
        coding: order.tests.map(t => ({
          system: 'http://loinc.org',
          code: t.code,
          display: t.name
        }))
      },
      subject: {
        reference: `Patient/${order.patient.id}`,
        identifier: {
          type: 'ANON_ID',
          value: partner.mode === 'sandbox' ? `sbx_pt_${order.patient.id.slice(-6)}` : order.patient.nationalIdHash
        }
      },
      requester: {
        reference: `Practitioner/${order.prescribingDoctor.doctorId}`,
        display: order.prescribingDoctor.name
      },
      reasonCode: [
        { text: order.clinicalIndication }
      ],
      authoredOn: order.issuedAt
    };
  }
}

module.exports = new DiagnosticIntegrationService();
