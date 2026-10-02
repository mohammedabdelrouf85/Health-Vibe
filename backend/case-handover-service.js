/**
 * HEALTH VIBE AI: EXPLICIT CLINICAL HANDOVER & ESCALATION SERVICE
 *
 * Implements:
 * 1. Explicit transfer-of-care / handover workflow:
 *    - Tracks responsible clinician or queue, handover reason, requested time, acceptance time, and overdue state.
 * 2. Configurable guards for unavailable, suspended, or expired-license doctors & unassigned cases.
 * 3. Atomic reassignment with clinic membership enforcement and previous doctor access revocation.
 * 4. Deduplicated escalation events with deterministic fingerprinting & SLA monitoring.
 * 5. Strict Medical-Legal Acknowledgment Guard:
 *    - NEVER claims emergency services or another clinician received a case without authoritatively recorded acknowledgment.
 */

const crypto = require('crypto');
const auditService = require('./audit-service');

// =============================================================================
// CONSTANTS & ENUMS
// =============================================================================

const HANDOVER_STATUS = {
  PENDING_ACCEPTANCE: 'pending_acceptance',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

const HANDOVER_REASONS = {
  SHIFT_CHANGE: 'shift_change',
  SPECIALIST_REFERRAL: 'specialist_referral',
  CAPACITY_OVERLOAD: 'capacity_overload',
  DOCTOR_UNAVAILABLE: 'doctor_unavailable',
  CRITICAL_ESCALATION: 'critical_escalation',
  ROUTINE_COVERAGE: 'routine_coverage'
};

const TARGET_QUEUES = {
  PHYSICIAN_POOL: 'physician_pool',
  URGENT_ESCALATION_QUEUE: 'urgent_escalation_queue',
  SPECIALIST_REFERRAL_QUEUE: 'specialist_referral_queue',
  CLINIC_ON_CALL_POOL: 'clinic_on_call_pool'
};

const ESCALATION_STATUS = {
  DISPATCHED_PENDING_ACK: 'escalation_dispatched_pending_acknowledgment',
  ACKNOWLEDGED_AND_RECEIVED: 'escalation_acknowledged_and_received',
  RESOLVED: 'resolved'
};

const DEFAULT_SLA_MINUTES = {
  EMERGENCY: 15,
  URGENT: 20,
  ROUTINE: 60,
  DEFAULT: 30
};

class CaseHandoverService {
  constructor() {
    this.reset();
  }

  reset() {
    this.handoversStore = new Map();        // handoverId -> HandoverRecord
    this.caseHandoverIndex = new Map();     // caseId -> Set<handoverId>
    this.escalationsStore = new Map();      // escalationId -> EscalationRecord
    this.escalationFingerprints = new Map();// fingerprint -> { escalationId, expiresAt }
    this.doctorAvailability = new Map();    // doctorId -> { isAvailable, onLeave, dutyStatus, fallbackQueue }
    this.casesStore = new Map();            // caseId -> CaseRecord
    this.doctorsDirectory = new Map();      // doctorId -> DoctorIdentityRecord
    this.auditLogs = [];
  }

  // ===========================================================================
  // 1. DIRECTORY & AVAILABILITY CONFIGURATION
  // ===========================================================================

  registerDoctor(doctorRecord) {
    if (!doctorRecord || !doctorRecord.uid) throw new Error('Doctor uid is required.');
    this.doctorsDirectory.set(doctorRecord.uid, {
      uid: doctorRecord.uid,
      name: doctorRecord.name || 'Dr. Physician',
      email: doctorRecord.email || '',
      clinicId: doctorRecord.clinicId || 'clinic_main',
      clinicMemberships: Array.isArray(doctorRecord.clinicMemberships) ? doctorRecord.clinicMemberships : [doctorRecord.clinicId || 'clinic_main'],
      status: doctorRecord.status || 'approved',
      licenseStatus: doctorRecord.licenseStatus || 'active',
      isLicenseExpired: Boolean(doctorRecord.isLicenseExpired),
      suspended: Boolean(doctorRecord.suspended),
      specialty: doctorRecord.specialty || 'General Medicine'
    });

    if (!this.doctorAvailability.has(doctorRecord.uid)) {
      this.doctorAvailability.set(doctorRecord.uid, {
        isAvailable: true,
        onLeave: false,
        dutyStatus: 'on_duty',
        fallbackQueue: TARGET_QUEUES.CLINIC_ON_CALL_POOL
      });
    }
    return this.doctorsDirectory.get(doctorRecord.uid);
  }

  setDoctorDutyStatus(doctorId, { dutyStatus = 'on_duty', isAvailable = true, onLeave = false, fallbackQueue = TARGET_QUEUES.CLINIC_ON_CALL_POOL } = {}) {
    this.doctorAvailability.set(doctorId, {
      dutyStatus,
      isAvailable: Boolean(isAvailable),
      onLeave: Boolean(onLeave),
      fallbackQueue
    });
    return this.doctorAvailability.get(doctorId);
  }

  getDoctorDutyStatus(doctorId) {
    return this.doctorAvailability.get(doctorId) || {
      dutyStatus: 'on_duty',
      isAvailable: true,
      onLeave: false,
      fallbackQueue: TARGET_QUEUES.CLINIC_ON_CALL_POOL
    };
  }

  registerCase(caseRecord) {
    if (!caseRecord || !caseRecord.id) throw new Error('Case id is required.');
    this.casesStore.set(caseRecord.id, {
      id: caseRecord.id,
      patientId: caseRecord.patientId || 'patient_default',
      clinicId: caseRecord.clinicId || 'clinic_main',
      assignedDoctorId: caseRecord.assignedDoctorId || null,
      assignedDoctorName: caseRecord.assignedDoctorName || null,
      previousDoctorId: null,
      status: caseRecord.status || 'submitted',
      priority: caseRecord.priority || 'routine',
      oxygenLevel: caseRecord.oxygenLevel || null,
      activeHandoverId: null,
      handoverHistory: [],
      updatedAt: new Date().toISOString()
    });
    return this.casesStore.get(caseRecord.id);
  }

  getCase(caseId) {
    return this.casesStore.get(caseId) || null;
  }

  // ===========================================================================
  // 2. EXPLICIT HANDOVER INITIATION (REQUEST)
  // ===========================================================================

  async requestHandover({
    caseId,
    fromDoctor,
    toDoctorId = null,
    targetQueue = null,
    handoverReason,
    clinicalNotes = '',
    slaMinutes = null,
    routeToQueueIfUnavailable = true
  }) {
    if (!caseId) throw new Error('caseId is mandatory for initiating a handover.');
    if (!fromDoctor || !fromDoctor.uid) throw new Error('fromDoctor identity is required.');
    if (!handoverReason) throw new Error('handoverReason is mandatory.');

    const c = this.casesStore.get(caseId);
    if (!c) {
      const err = new Error(`Clinical case '${caseId}' not found.`);
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Verify requesting doctor ownership (or clinic admin / owner)
    const isAssigned = c.assignedDoctorId === fromDoctor.uid;
    const isClinicAdmin = fromDoctor.role === 'clinic_admin' || fromDoctor.role === 'super_admin' || fromDoctor.isOwner;
    if (!isAssigned && !isClinicAdmin && c.assignedDoctorId !== null) {
      const err = new Error('Only the currently assigned clinician or a clinic administrator can request a case handover.');
      err.code = 'HANDOVER_UNAUTHORIZED';
      err.statusCode = 403;
      throw err;
    }

    // Check if case already has an unresolved active handover
    if (c.activeHandoverId) {
      const activeHandover = this.handoversStore.get(c.activeHandoverId);
      if (activeHandover && activeHandover.status === HANDOVER_STATUS.PENDING_ACCEPTANCE) {
        const err = new Error(`Case '${caseId}' already has an active pending handover '${c.activeHandoverId}'.`);
        err.code = 'ACTIVE_HANDOVER_EXISTS';
        err.statusCode = 409;
        throw err;
      }
    }

    let finalTargetDoctorId = toDoctorId;
    let finalTargetDoctorName = null;
    let finalTargetQueue = targetQueue;
    let fallbackRoutingApplied = false;

    // Validate Target Doctor if specific clinician requested
    if (toDoctorId) {
      const targetDoc = this.doctorsDirectory.get(toDoctorId);
      if (!targetDoc) {
        const err = new Error(`Target clinician '${toDoctorId}' is not registered in the system.`);
        err.code = 'TARGET_DOCTOR_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      // 1. Enforce Clinic Membership
      const isSameClinic = targetDoc.clinicId === c.clinicId || targetDoc.clinicMemberships.includes(c.clinicId);
      if (!isSameClinic) {
        const err = new Error(`Clinic membership mismatch: Target doctor '${toDoctorId}' does not belong to clinic '${c.clinicId}'.`);
        err.code = 'CLINIC_MEMBERSHIP_MISMATCH';
        err.statusCode = 403;
        throw err;
      }

      // 2. Enforce Non-Suspended Status
      if (targetDoc.suspended || targetDoc.status === 'suspended') {
        const err = new Error(`Target doctor '${toDoctorId}' is currently suspended and cannot receive case handovers.`);
        err.code = 'DOCTOR_SUSPENDED';
        err.statusCode = 400;
        throw err;
      }

      // 3. Enforce Active Valid Medical License
      if (targetDoc.isLicenseExpired || targetDoc.licenseStatus === 'expired' || targetDoc.licenseStatus === 'revoked') {
        const err = new Error(`Target doctor '${toDoctorId}' has an expired or revoked license and cannot take clinical cases.`);
        err.code = 'DOCTOR_LICENSE_INVALID';
        err.statusCode = 400;
        throw err;
      }

      // 4. Check Availability & Duty Status
      const duty = this.getDoctorDutyStatus(toDoctorId);
      if (!duty.isAvailable || duty.onLeave || duty.dutyStatus === 'off_duty') {
        if (routeToQueueIfUnavailable) {
          // Route to fallback queue instead of failing
          finalTargetDoctorId = null;
          finalTargetQueue = duty.fallbackQueue || TARGET_QUEUES.CLINIC_ON_CALL_POOL;
          fallbackRoutingApplied = true;
        } else {
          const err = new Error(`Target doctor '${toDoctorId}' is currently ${duty.dutyStatus} (unavailable).`);
          err.code = 'DOCTOR_UNAVAILABLE';
          err.statusCode = 400;
          throw err;
        }
      } else {
        finalTargetDoctorName = targetDoc.name;
      }
    } else if (!finalTargetQueue) {
      finalTargetQueue = TARGET_QUEUES.PHYSICIAN_POOL;
    }

    // Determine SLA
    const priorityKey = (c.priority || 'routine').toUpperCase();
    const effectiveSla = slaMinutes || DEFAULT_SLA_MINUTES[priorityKey] || DEFAULT_SLA_MINUTES.DEFAULT;
    const requestedAt = new Date().toISOString();
    const overdueThresholdAt = new Date(Date.now() + effectiveSla * 60000).toISOString();

    const handoverId = `hnd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const handoverRecord = {
      id: handoverId,
      caseId,
      clinicId: c.clinicId,
      fromDoctorId: fromDoctor.uid,
      fromDoctorName: fromDoctor.name || fromDoctor.email,
      toDoctorId: finalTargetDoctorId,
      toDoctorName: finalTargetDoctorName,
      targetQueue: finalTargetQueue,
      fallbackRoutingApplied,
      handoverReason,
      clinicalNotes: clinicalNotes.trim(),
      patientCurrentState: {
        oxygenLevel: c.oxygenLevel,
        priority: c.priority,
        status: c.status
      },
      requestedAt,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      status: HANDOVER_STATUS.PENDING_ACCEPTANCE,
      slaMinutes: effectiveSla,
      overdueThresholdAt,
      isOverdue: false,
      // Strict Medical-Legal Acknowledgment Guarantee
      recordedAcknowledgment: {
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedByName: null,
        acknowledgedAt: null,
        ackMethod: null,
        ackReferenceId: null
      }
    };

    // Store handover
    this.handoversStore.set(handoverId, handoverRecord);
    if (!this.caseHandoverIndex.has(caseId)) {
      this.caseHandoverIndex.set(caseId, new Set());
    }
    this.caseHandoverIndex.get(caseId).add(handoverId);

    // Update case pointer
    c.activeHandoverId = handoverId;
    c.status = 'under_review';
    c.updatedAt = requestedAt;

    this._logAudit('CASE_HANDOVER_REQUESTED', {
      handoverId,
      caseId,
      clinicId: c.clinicId,
      fromDoctorId: fromDoctor.uid,
      toDoctorId: finalTargetDoctorId,
      targetQueue: finalTargetQueue,
      handoverReason,
      overdueThresholdAt
    });

    return handoverRecord;
  }

  // ===========================================================================
  // 3. ATOMIC HANDOVER ACCEPTANCE & ACCESS REVOCATION
  // ===========================================================================

  async acceptHandover({
    handoverId,
    acceptingDoctor,
    ackReferenceId = null,
    channel = 'in_app'
  }) {
    if (!handoverId) throw new Error('handoverId is mandatory.');
    if (!acceptingDoctor || !acceptingDoctor.uid) throw new Error('acceptingDoctor identity is mandatory.');

    const handover = this.handoversStore.get(handoverId);
    if (!handover) {
      const err = new Error(`Handover '${handoverId}' not found.`);
      err.code = 'HANDOVER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // ── ATOMIC CONCURRENCY GUARD ─────────────────────────────────────────────
    // If another doctor or worker resolved this handover simultaneously
    if (handover.status !== HANDOVER_STATUS.PENDING_ACCEPTANCE && handover.status !== HANDOVER_STATUS.OVERDUE) {
      const err = new Error(`Handover '${handoverId}' is no longer pending acceptance (current status: ${handover.status}).`);
      err.code = 'HANDOVER_ALREADY_RESOLVED';
      err.statusCode = 409; // Conflict
      throw err;
    }

    // Validate Accepting Doctor
    const docRecord = this.doctorsDirectory.get(acceptingDoctor.uid);
    if (docRecord) {
      if (docRecord.suspended) {
        const err = new Error(`Accepting doctor '${acceptingDoctor.uid}' is suspended.`);
        err.code = 'DOCTOR_SUSPENDED';
        err.statusCode = 403;
        throw err;
      }
      if (docRecord.isLicenseExpired) {
        const err = new Error(`Accepting doctor '${acceptingDoctor.uid}' has an expired license.`);
        err.code = 'DOCTOR_LICENSE_INVALID';
        err.statusCode = 403;
        throw err;
      }
    }

    // Enforce Clinic Membership
    const doctorClinicId = docRecord ? docRecord.clinicId : (acceptingDoctor.clinicId || null);
    const doctorMemberships = docRecord ? docRecord.clinicMemberships : (acceptingDoctor.clinicMemberships || []);
    const isSameClinic = doctorClinicId === handover.clinicId || doctorMemberships.includes(handover.clinicId);
    if (!isSameClinic && !acceptingDoctor.isOwner && acceptingDoctor.role !== 'super_admin') {
      const err = new Error(`Clinic membership mismatch: Doctor '${acceptingDoctor.uid}' does not belong to clinic '${handover.clinicId}'.`);
      err.code = 'CLINIC_MEMBERSHIP_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // If targeted to a specific doctor, only that doctor or supervisor can accept
    if (handover.toDoctorId && handover.toDoctorId !== acceptingDoctor.uid) {
      const isSupervisor = acceptingDoctor.role === 'clinic_admin' || acceptingDoctor.role === 'super_admin' || acceptingDoctor.isOwner;
      if (!isSupervisor) {
        const err = new Error(`Handover '${handoverId}' was specifically assigned to doctor '${handover.toDoctorId}'.`);
        err.code = 'HANDOVER_RECIPIENT_MISMATCH';
        err.statusCode = 403;
        throw err;
      }
    }

    const c = this.casesStore.get(handover.caseId);
    if (!c) {
      const err = new Error(`Underlying case '${handover.caseId}' not found.`);
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();

    // ── RECORD AUTHORITATIVE CLINICAL ACKNOWLEDGMENT ─────────────────────────
    const ackToken = ackReferenceId || `ack_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    handover.recordedAcknowledgment = {
      acknowledged: true,
      acknowledgedBy: acceptingDoctor.uid,
      acknowledgedByName: acceptingDoctor.name || acceptingDoctor.email,
      acknowledgedAt: nowIso,
      ackMethod: 'in_app_acceptance',
      ackReferenceId: ackToken,
      channel
    };

    // Update handover state
    handover.status = HANDOVER_STATUS.ACCEPTED;
    handover.acceptedAt = nowIso;
    handover.toDoctorId = acceptingDoctor.uid;
    handover.toDoctorName = acceptingDoctor.name || acceptingDoctor.email;

    // ── ATOMIC REASSIGNMENT & PREVIOUS DOCTOR ACCESS REMOVAL ─────────────────
    const previousDoctorId = c.assignedDoctorId;
    c.previousDoctorId = previousDoctorId;
    c.assignedDoctorId = acceptingDoctor.uid;
    c.assignedDoctorName = acceptingDoctor.name || acceptingDoctor.email;
    c.activeHandoverId = null;
    c.status = 'assigned';
    c.updatedAt = nowIso;

    if (!c.handoverHistory) c.handoverHistory = [];
    c.handoverHistory.push({
      handoverId: handover.id,
      fromDoctorId: previousDoctorId,
      toDoctorId: acceptingDoctor.uid,
      acceptedAt: nowIso,
      reason: handover.handoverReason
    });

    this._logAudit('CASE_HANDOVER_ACCEPTED', {
      handoverId,
      caseId: c.id,
      clinicId: c.clinicId,
      previousDoctorId,
      newAssignedDoctorId: acceptingDoctor.uid,
      ackReferenceId: ackToken,
      previousDoctorAccessRevoked: true
    });

    return {
      success: true,
      handover,
      case: c,
      previousDoctorId,
      newAssignedDoctorId: acceptingDoctor.uid,
      previousDoctorAccessRevoked: true,
      acknowledgedAt: nowIso,
      ackToken
    };
  }

  // ===========================================================================
  // 4. HANDOVER REJECTION & CANCELLATION
  // ===========================================================================

  async rejectHandover({
    handoverId,
    rejectingDoctor,
    rejectionReason
  }) {
    if (!handoverId) throw new Error('handoverId is required.');
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      const err = new Error('A detailed clinical rejectionReason (at least 5 characters) is required.');
      err.code = 'REASON_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const handover = this.handoversStore.get(handoverId);
    if (!handover) {
      const err = new Error(`Handover '${handoverId}' not found.`);
      err.code = 'HANDOVER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (handover.status !== HANDOVER_STATUS.PENDING_ACCEPTANCE && handover.status !== HANDOVER_STATUS.OVERDUE) {
      const err = new Error(`Cannot reject handover in status '${handover.status}'.`);
      err.code = 'HANDOVER_NOT_PENDING';
      err.statusCode = 409;
      throw err;
    }

    const nowIso = new Date().toISOString();
    handover.status = HANDOVER_STATUS.REJECTED;
    handover.rejectedAt = nowIso;
    handover.rejectionReason = rejectionReason.trim();
    handover.rejectedBy = rejectingDoctor ? rejectingDoctor.uid : 'unknown';

    // Route case back to clinic pool or notify originating doctor
    const c = this.casesStore.get(handover.caseId);
    if (c) {
      c.activeHandoverId = null;
      c.updatedAt = nowIso;
    }

    this._logAudit('CASE_HANDOVER_REJECTED', {
      handoverId,
      caseId: handover.caseId,
      rejectedBy: handover.rejectedBy,
      rejectionReason: handover.rejectionReason
    });

    return { success: true, handover, case: c };
  }

  async cancelHandover({
    handoverId,
    doctor,
    cancelReason = 'Cancelled by originating clinician'
  }) {
    const handover = this.handoversStore.get(handoverId);
    if (!handover) throw new Error(`Handover '${handoverId}' not found.`);

    if (handover.status !== HANDOVER_STATUS.PENDING_ACCEPTANCE) {
      const err = new Error(`Cannot cancel handover in '${handover.status}' state.`);
      err.code = 'HANDOVER_ALREADY_RESOLVED';
      err.statusCode = 409;
      throw err;
    }

    const nowIso = new Date().toISOString();
    handover.status = HANDOVER_STATUS.CANCELLED;
    handover.cancelledAt = nowIso;
    handover.cancelReason = cancelReason;

    const c = this.casesStore.get(handover.caseId);
    if (c && c.activeHandoverId === handoverId) {
      c.activeHandoverId = null;
      c.updatedAt = nowIso;
    }

    this._logAudit('CASE_HANDOVER_CANCELLED', { handoverId, caseId: handover.caseId, cancelReason });
    return { success: true, handover };
  }

  // ===========================================================================
  // 5. OVERDUE STATE MONITORING & AUTOMATED ESCALATION
  // ===========================================================================

  checkOverdueHandovers({ clinicId = null, now = new Date() } = {}) {
    const overdueList = [];
    const currentTime = new Date(now).getTime();

    for (const handover of this.handoversStore.values()) {
      if (clinicId && handover.clinicId !== clinicId) continue;
      if (handover.status === HANDOVER_STATUS.PENDING_ACCEPTANCE) {
        const thresholdTime = new Date(handover.overdueThresholdAt).getTime();
        if (currentTime >= thresholdTime) {
          handover.isOverdue = true;
          handover.status = HANDOVER_STATUS.OVERDUE;
          overdueList.push(handover);

          // Automatically generate a deduplicated escalation event
          this.escalateCase({
            caseId: handover.caseId,
            clinicId: handover.clinicId,
            severity: 'HIGH',
            reason: `Handover SLA breached: unaccepted for ${handover.slaMinutes} minutes. Target: ${handover.toDoctorName || handover.targetQueue}`,
            originatingDoctor: { uid: handover.fromDoctorId, name: handover.fromDoctorName },
            targetRecipient: { type: 'clinic_on_call_supervisor', clinicId: handover.clinicId }
          }).catch(() => {});

          this._logAudit('HANDOVER_OVERDUE_ESCALATED', {
            handoverId: handover.id,
            caseId: handover.caseId,
            slaMinutes: handover.slaMinutes,
            overdueThresholdAt: handover.overdueThresholdAt
          });
        }
      }
    }

    return overdueList;
  }

  // ===========================================================================
  // 6. DEDUPLICATED ESCALATION EVENTS & STRICT ACKNOWLEDGMENT GUARD
  // ===========================================================================

  async escalateCase({
    caseId,
    clinicId,
    severity = 'HIGH',
    reason,
    originatingDoctor,
    targetRecipient = { type: 'emergency_services', channel: 'ambulance_123' },
    recordedAck = null,
    deduplicationWindowMs = 1800000 // 30 minutes
  }) {
    if (!caseId) throw new Error('caseId is mandatory.');
    if (!reason) throw new Error('Escalation reason is mandatory.');

    const c = this.casesStore.get(caseId);
    const effectiveClinicId = clinicId || (c ? c.clinicId : 'clinic_main');

    // ── DETERMINISTIC ESCALATION FINGERPRINT (ANTI-SPAM DEDUPLICATION) ───────
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${caseId}:${effectiveClinicId}:${reason.trim().toLowerCase()}:${severity}`)
      .digest('hex');

    const nowTime = Date.now();
    const existing = this.escalationFingerprints.get(fingerprint);

    if (existing && existing.expiresAt > nowTime) {
      const activeEscalation = this.escalationsStore.get(existing.escalationId);
      if (activeEscalation && activeEscalation.status !== ESCALATION_STATUS.RESOLVED) {
        return {
          escalated: true,
          isDuplicate: true,
          escalationId: existing.escalationId,
          escalationRecord: activeEscalation,
          message: 'Deduplicated: Active escalation already in flight for this clinical condition.'
        };
      }
    }

    const escalationId = `esc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    // ── STRICT MEDICAL-LEGAL ACKNOWLEDGMENT CHECK ───────────────────────────
    // RULE: Never claim that emergency services or another clinician received a
    // case without authoritatively recorded acknowledgment!
    const isAcknowledged = Boolean(
      recordedAck &&
      recordedAck.acknowledged === true &&
      recordedAck.acknowledgedBy &&
      recordedAck.acknowledgedAt
    );

    const escalationRecord = {
      id: escalationId,
      caseId,
      clinicId: effectiveClinicId,
      severity,
      reason: reason.trim(),
      fingerprint,
      originatingDoctor: {
        uid: originatingDoctor ? originatingDoctor.uid : 'system_triage',
        name: originatingDoctor ? (originatingDoctor.name || originatingDoctor.email) : 'System Triage Sentinel'
      },
      targetRecipient,
      dispatchedAt: nowIso,
      status: isAcknowledged ? ESCALATION_STATUS.ACKNOWLEDGED_AND_RECEIVED : ESCALATION_STATUS.DISPATCHED_PENDING_ACK,
      // Boolean strictly reflects truth: NEVER true without verifiable acknowledgment!
      receivedByRecipient: isAcknowledged,
      recordedAcknowledgment: isAcknowledged ? recordedAck : null,
      displayStatus: isAcknowledged
        ? {
            ar: `تم تأكيد استلام الحالة سريرياً بواسطة ${recordedAck.acknowledgedByName || recordedAck.acknowledgedBy}`,
            en: `Case received and clinically acknowledged by ${recordedAck.acknowledgedByName || recordedAck.acknowledgedBy}`
          }
        : {
            ar: 'تم إرسال طلب التدخل العاجل - بانتظار تأكيد استلام الطوارئ/الاستشاري ⏳',
            en: 'Emergency escalation dispatched - awaiting recipient confirmation & acknowledgment ⏳'
          }
    };

    this.escalationsStore.set(escalationId, escalationRecord);
    this.escalationFingerprints.set(fingerprint, {
      escalationId,
      expiresAt: nowTime + deduplicationWindowMs
    });

    if (c) {
      c.status = 'escalated';
      c.updatedAt = nowIso;
    }

    this._logAudit('CASE_ESCALATED', {
      escalationId,
      caseId,
      clinicId: effectiveClinicId,
      severity,
      reason,
      receivedByRecipient: isAcknowledged
    });

    return {
      escalated: true,
      isDuplicate: false,
      escalationId,
      escalationRecord
    };
  }

  /**
   * Confirms receipt of escalated case from emergency dispatch or receiving doctor.
   */
  async recordEscalationAcknowledgment({
    escalationId,
    acknowledgedBy,
    acknowledgedByName,
    ackMethod = 'digital_dispatch_receipt',
    ackToken = null
  }) {
    const esc = this.escalationsStore.get(escalationId);
    if (!esc) throw new Error(`Escalation '${escalationId}' not found.`);
    if (!acknowledgedBy) throw new Error('acknowledgedBy is required.');

    const nowIso = new Date().toISOString();
    esc.status = ESCALATION_STATUS.ACKNOWLEDGED_AND_RECEIVED;
    esc.receivedByRecipient = true;
    esc.recordedAcknowledgment = {
      acknowledged: true,
      acknowledgedBy,
      acknowledgedByName: acknowledgedByName || acknowledgedBy,
      acknowledgedAt: nowIso,
      ackMethod,
      ackToken: ackToken || `ack_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    };
    esc.displayStatus = {
      ar: `تم تأكيد استلام الحالة سريرياً بواسطة ${esc.recordedAcknowledgment.acknowledgedByName} ✅`,
      en: `Case receipt clinically acknowledged by ${esc.recordedAcknowledgment.acknowledgedByName} ✅`
    };

    this._logAudit('ESCALATION_ACKNOWLEDGED', {
      escalationId,
      caseId: esc.caseId,
      acknowledgedBy,
      acknowledgedAt: nowIso
    });

    return esc;
  }

  // ===========================================================================
  // 7. UNASSIGNED CASES & QUEUE MANAGEMENT
  // ===========================================================================

  getUnassignedCases({ clinicId = null, targetQueue = null } = {}) {
    const results = [];
    for (const c of this.casesStore.values()) {
      if (clinicId && c.clinicId !== clinicId) continue;
      const isUnassigned = !c.assignedDoctorId || c.assignedDoctorId === 'unassigned';
      if (isUnassigned && ['submitted', 'pending', 'triaged'].includes(c.status)) {
        results.push(c);
      }
    }
    return results;
  }

  async claimCase({ caseId, claimingDoctor }) {
    if (!caseId) throw new Error('caseId is mandatory.');
    if (!claimingDoctor || !claimingDoctor.uid) throw new Error('claimingDoctor is mandatory.');

    const c = this.casesStore.get(caseId);
    if (!c) throw new Error(`Case '${caseId}' not found.`);

    if (c.assignedDoctorId && c.assignedDoctorId !== 'unassigned') {
      const err = new Error(`Case '${caseId}' is already claimed by doctor '${c.assignedDoctorId}'.`);
      err.code = 'CASE_ALREADY_ASSIGNED';
      err.statusCode = 409;
      throw err;
    }

    // Verify clinic membership
    const doc = this.doctorsDirectory.get(claimingDoctor.uid);
    const doctorClinicId = doc ? doc.clinicId : (claimingDoctor.clinicId || null);
    if (doctorClinicId && doctorClinicId !== c.clinicId && !claimingDoctor.isOwner && claimingDoctor.role !== 'super_admin') {
      const err = new Error(`Clinic membership mismatch: Doctor '${claimingDoctor.uid}' cannot claim cases from clinic '${c.clinicId}'.`);
      err.code = 'CLINIC_MEMBERSHIP_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    const nowIso = new Date().toISOString();
    c.assignedDoctorId = claimingDoctor.uid;
    c.assignedDoctorName = claimingDoctor.name || claimingDoctor.email;
    c.status = 'under_review';
    c.updatedAt = nowIso;

    this._logAudit('CASE_CLAIMED', { caseId, doctorId: claimingDoctor.uid, clinicId: c.clinicId });
    return { success: true, case: c };
  }

  // ===========================================================================
  // 8. AUDIT TRAIL LOGGING
  // ===========================================================================

  _logAudit(eventType, metadata = {}) {
    const entry = {
      id: `audit_hnd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      metadata
    };
    this.auditLogs.push(entry);
    if (this.auditLogs.length > 500) this.auditLogs.shift();
    return entry;
  }

  getAuditLogs({ eventType = null, caseId = null } = {}) {
    return this.auditLogs.filter(l => {
      if (eventType && l.eventType !== eventType) return false;
      if (caseId && l.metadata?.caseId !== caseId) return false;
      return true;
    });
  }
}

const instance = new CaseHandoverService();

module.exports = instance;
module.exports.CaseHandoverService = CaseHandoverService;
module.exports.HANDOVER_STATUS = HANDOVER_STATUS;
module.exports.HANDOVER_REASONS = HANDOVER_REASONS;
module.exports.TARGET_QUEUES = TARGET_QUEUES;
module.exports.ESCALATION_STATUS = ESCALATION_STATUS;
