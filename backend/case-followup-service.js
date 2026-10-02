/**
 * Health Vibe AI - Doctor-Approved Case Follow-Up & Remote Monitoring Service
 * 
 * Implements:
 * 1. Doctor-Approved Follow-up Plans linked strictly to clinical cases (caseId).
 * 2. Domains: Actionable Tasks, Scheduled Appointments, Reminders, Reassessment, and Post-Hospital Discharge.
 * 3. Step Tracking: completed steps, delay calculations, person responsible, and automatic escalation.
 * 4. Patient Risk Timeline: longitudinal chronological trajectory of clinical events and risk shifts.
 * 5. Remote Monitoring (RPM): gated to reliable sources; rejects/quarantines unverified feeds.
 * 6. Governance Guards: strict prevention of unapproved medical alerts or autonomous decisions; plan modification & cancellation audit trails.
 */

const crypto = require('crypto');

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

const PROTOCOL_TYPES = {
  POST_HOSPITAL_DISCHARGE: 'POST_HOSPITAL_DISCHARGE',
  CHRONIC_DISEASE_FOLLOWUP: 'CHRONIC_DISEASE_FOLLOWUP',
  ACUTE_EPISODE_MANAGEMENT: 'ACUTE_EPISODE_MANAGEMENT',
  POST_PROCEDURAL_SURVEILLANCE: 'POST_PROCEDURAL_SURVEILLANCE'
};

const PLAN_STATUS = {
  ACTIVE: 'active',
  MODIFIED: 'modified',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

const RISK_TIERS = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const ESCALATION_TIERS = {
  NONE: 'NONE',
  CARE_COORDINATOR_OUTREACH: 'CARE_COORDINATOR_OUTREACH',
  ATTENDING_PHYSICIAN_URGENT: 'ATTENDING_PHYSICIAN_URGENT',
  EMERGENCY_SERVICES_DISPATCH: 'EMERGENCY_SERVICES_DISPATCH'
};

// In-Memory Storage for Plans, Indexing, Risk Timelines, and RPM Telemetry
const followupPlansStore = new Map();              // planId -> planObj
const casePlansIndex = new Map();                  // caseId -> Set(planIds)
const patientPlansIndex = new Map();               // patientId -> Set(planIds)
const patientRiskTimelineStore = new Map();        // patientId -> Array(riskEventObj)
const remoteMonitoringTelemetryStore = new Map();   // planId -> Array(telemetryObj)

// =============================================================================
// 1. DOCTOR CREDENTIALS & SIGNATURE UTILITIES
// =============================================================================

function validateDoctorCredentials(doctorIdentity) {
  if (!doctorIdentity || typeof doctorIdentity !== 'object') {
    const error = new Error('Approved physician credentials are required.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  const { status, licenseStatus, isLicenseExpired, licenseNumber } = doctorIdentity;

  if (status !== 'approved' || licenseStatus === 'revoked' || isLicenseExpired || !licenseNumber) {
    const error = new Error('Only actively licensed and approved physicians can establish, modify, or cancel follow-up plans.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  return true;
}

function generateDigitalSignature(payload, doctorIdentity) {
  const secretKey = process.env.HMAC_SIGNING_SECRET || 'health_vibe_followup_plan_hmac_secret_2026';
  const dataString = JSON.stringify(payload) + `|${doctorIdentity.licenseNumber}|${doctorIdentity.uid}`;
  const signatureHash = crypto.createHmac('sha256', secretKey).update(dataString).digest('hex');

  return {
    algorithm: 'HMAC-SHA256',
    signedAt: new Date().toISOString(),
    doctorUid: doctorIdentity.uid,
    doctorName: doctorIdentity.name || 'Attending Physician',
    doctorLicense: doctorIdentity.licenseNumber,
    signatureHash
  };
}

// =============================================================================
// 2. PLAN CREATION (DOCTOR-APPROVED & CASE-LINKED)
// =============================================================================

async function createFollowupPlan({
  caseId,
  patientId,
  patientName = 'Patient',
  doctorIdentity,
  title,
  protocolType = PROTOCOL_TYPES.CHRONIC_DISEASE_FOLLOWUP,
  tasks = [],
  appointments = [],
  reminders = [],
  reassessment = {},
  postDischargeDetails = null,
  remoteMonitoringConfig = null
}) {
  validateDoctorCredentials(doctorIdentity);

  if (!caseId || !patientId) {
    const error = new Error('caseId and patientId are required to establish a clinical follow-up plan.');
    error.code = 'MISSING_REQUIRED_FIELDS';
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const planId = `plan_${caseId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Normalize Tasks
  const normalizedTasks = Array.isArray(tasks) ? tasks.map((task, idx) => ({
    taskId: task.taskId || `task_${idx + 1}_${Date.now()}`,
    title: String(task.title || `Task ${idx + 1}`).trim(),
    description: String(task.description || '').trim(),
    category: task.category || 'general_followup',
    dueDate: task.dueDate || new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    status: TASK_STATUS.PENDING,
    personResponsible: task.personResponsible || 'care_coordinator_nurse',
    isMilestone: Boolean(task.isMilestone),
    completedAt: null,
    completedBy: null,
    completionNotes: null,
    delayHours: 0,
    escalationStatus: ESCALATION_TIERS.NONE
  })) : [];

  // Normalize Appointments
  const normalizedAppointments = Array.isArray(appointments) ? appointments.map((appt, idx) => ({
    appointmentId: appt.appointmentId || `appt_ref_${idx + 1}_${Date.now()}`,
    type: appt.type || 'IN_CLINIC_REVIEW',
    scheduledDate: appt.scheduledDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    doctorId: appt.doctorId || doctorIdentity.uid,
    clinicId: appt.clinicId || doctorIdentity.clinicId || null,
    notes: String(appt.notes || '').trim()
  })) : [];

  // Normalize Reminders
  const normalizedReminders = Array.isArray(reminders) ? reminders.map((rem, idx) => ({
    reminderId: rem.reminderId || `rem_${idx + 1}_${Date.now()}`,
    title: rem.title || 'Follow-up reminder',
    scheduledTime: rem.scheduledTime || '09:00',
    channel: rem.channel || 'PUSH_AND_IN_APP',
    isActive: true
  })) : [];

  // Normalize Post-Hospital Discharge Details
  let normalizedDischarge = null;
  if (protocolType === PROTOCOL_TYPES.POST_HOSPITAL_DISCHARGE || postDischargeDetails) {
    normalizedDischarge = {
      hospitalName: postDischargeDetails?.hospitalName || 'General Hospital',
      dischargeDate: postDischargeDetails?.dischargeDate || nowIso,
      dischargeDiagnosis: postDischargeDetails?.dischargeDiagnosis || 'Clinical Inpatient Admission',
      readmissionRiskTier: postDischargeDetails?.readmissionRiskTier || RISK_TIERS.MODERATE,
      redFlagReturnPrecautions: Array.isArray(postDischargeDetails?.redFlagReturnPrecautions)
        ? postDischargeDetails.redFlagReturnPrecautions
        : ['Severe shortness of breath', 'High fever > 38.5 C', 'Severe chest pain or confusion'],
      medicationReconciliationCompleted: Boolean(postDischargeDetails?.medicationReconciliationCompleted ?? true),
      dischargeSummaryLink: postDischargeDetails?.dischargeSummaryLink || null
    };
  }

  // Normalize Remote Monitoring Configuration
  const normalizedRpm = remoteMonitoringConfig ? {
    enabled: Boolean(remoteMonitoringConfig.enabled),
    allowedMetrics: Array.isArray(remoteMonitoringConfig.allowedMetrics) ? remoteMonitoringConfig.allowedMetrics : ['BLOOD_PRESSURE', 'SPO2'],
    reliableSourcesOnly: Boolean(remoteMonitoringConfig.reliableSourcesOnly ?? true),
    alertThresholds: remoteMonitoringConfig.alertThresholds || {
      systolicMax: 180,
      diastolicMax: 120,
      spo2Min: 90,
      glucoseMin: 54,
      glucoseMax: 350
    }
  } : {
    enabled: false,
    allowedMetrics: [],
    reliableSourcesOnly: true,
    alertThresholds: {}
  };

  const planPayload = {
    planId,
    caseId,
    patientId,
    patientName,
    title: title || `Clinical Follow-up: Case #${caseId}`,
    protocolType,
    status: PLAN_STATUS.ACTIVE,
    version: 1,
    doctor: {
      uid: doctorIdentity.uid,
      name: doctorIdentity.name || 'Physician',
      licenseNumber: doctorIdentity.licenseNumber,
      specialty: doctorIdentity.specialty || 'General Specialist',
      clinicId: doctorIdentity.clinicId || null
    },
    tasks: normalizedTasks,
    appointments: normalizedAppointments,
    reminders: normalizedReminders,
    reassessment: {
      scheduledMilestones: Array.isArray(reassessment.scheduledMilestones) ? reassessment.scheduledMilestones : [
        new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      ],
      targetClinicalGoals: reassessment.targetClinicalGoals || { general: 'Clinical stabilization' }
    },
    postDischargeDetails: normalizedDischarge,
    remoteMonitoringConfig: normalizedRpm,
    auditLog: [
      {
        action: 'PLAN_CREATED',
        timestamp: nowIso,
        actorUid: doctorIdentity.uid,
        actorRole: 'doctor',
        details: `Follow-up plan created for case ${caseId}`
      }
    ],
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // Cryptographic Signature
  planPayload.digitalSignature = generateDigitalSignature(planPayload, doctorIdentity);

  // Storage
  followupPlansStore.set(planId, planPayload);

  // Case indexing
  const casePlans = casePlansIndex.get(caseId) || new Set();
  casePlans.add(planId);
  casePlansIndex.set(caseId, casePlans);

  // Patient indexing
  const patientPlans = patientPlansIndex.get(patientId) || new Set();
  patientPlans.add(planId);
  patientPlansIndex.set(patientId, patientPlans);

  // Record initial event in Patient Risk Timeline
  appendRiskTimelineEvent(patientId, {
    caseId,
    planId,
    eventType: 'FOLLOWUP_PLAN_ESTABLISHED',
    riskTier: normalizedDischarge ? normalizedDischarge.readmissionRiskTier : RISK_TIERS.MODERATE,
    title: `Follow-up plan initiated by ${doctorIdentity.name}`,
    description: `Protocol: ${protocolType}. Active tasks: ${normalizedTasks.length}.`,
    timestamp: nowIso
  });

  return planPayload;
}

// =============================================================================
// 3. STEP TRACKING, DELAYS & AUTOMATIC ESCALATION
// =============================================================================

function completeTaskStep({
  planId,
  taskId,
  completedBy,
  completionNotes = '',
  actualMetrics = null,
  completionTimestamp = new Date().toISOString()
}) {
  const plan = followupPlansStore.get(planId);
  if (!plan) {
    const error = new Error(`Follow-up plan '${planId}' not found.`);
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (plan.status !== PLAN_STATUS.ACTIVE) {
    const error = new Error(`Cannot complete step on ${plan.status} plan.`);
    error.code = 'INVALID_PLAN_STATUS';
    error.statusCode = 400;
    throw error;
  }

  const task = plan.tasks.find(t => t.taskId === taskId);
  if (!task) {
    const error = new Error(`Task '${taskId}' not found in plan.`);
    error.code = 'TASK_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const nowMs = new Date(completionTimestamp).getTime();
  const dueMs = new Date(task.dueDate).getTime();
  const delayHours = nowMs > dueMs ? Math.round(((nowMs - dueMs) / (3600 * 1000)) * 10) / 10 : 0;

  task.status = TASK_STATUS.COMPLETED;
  task.completedAt = completionTimestamp;
  task.completedBy = completedBy || { uid: 'system', role: 'coordinator' };
  task.completionNotes = String(completionNotes || '').trim();
  task.delayHours = delayHours;
  task.actualMetrics = actualMetrics || null;

  plan.updatedAt = completionTimestamp;
  plan.auditLog.push({
    action: 'TASK_COMPLETED',
    timestamp: completionTimestamp,
    taskId,
    delayHours,
    completedBy
  });

  // Timeline entry
  appendRiskTimelineEvent(plan.patientId, {
    caseId: plan.caseId,
    planId,
    eventType: 'TASK_COMPLETED',
    riskTier: delayHours > 24 ? RISK_TIERS.MODERATE : RISK_TIERS.LOW,
    title: `Task completed: ${task.title}`,
    description: delayHours > 0 ? `Completed with delay of ${delayHours} hours` : 'Completed on schedule',
    timestamp: completionTimestamp
  });

  return { plan, task, isDelayed: delayHours > 0, delayHours };
}

function auditPlanDelaysAndOverdue(planId, currentTimestamp = new Date().toISOString()) {
  const plan = followupPlansStore.get(planId);
  if (!plan) throw new Error(`Plan '${planId}' not found.`);

  if (plan.status !== PLAN_STATUS.ACTIVE) return { overdueCount: 0, escalations: [] };

  const nowMs = new Date(currentTimestamp).getTime();
  const escalations = [];
  let overdueCount = 0;

  for (const task of plan.tasks) {
    if (task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.IN_PROGRESS) {
      const dueMs = new Date(task.dueDate).getTime();
      if (nowMs > dueMs) {
        task.status = TASK_STATUS.OVERDUE;
        overdueCount++;
        const delayHours = Math.round(((nowMs - dueMs) / (3600 * 1000)) * 10) / 10;
        task.delayHours = delayHours;

        // Escalation Logic:
        // If milestone or post-discharge 48h call overdue:
        if (delayHours >= 24) {
          task.escalationStatus = ESCALATION_TIERS.ATTENDING_PHYSICIAN_URGENT;
          escalations.push({
            taskId: task.taskId,
            taskTitle: task.title,
            tier: ESCALATION_TIERS.ATTENDING_PHYSICIAN_URGENT,
            delayHours,
            actionRequired: 'URGENT_PHYSICIAN_NOTIFICATION',
            escalatedTo: plan.doctor.name
          });
        } else if (delayHours >= 4) {
          task.escalationStatus = ESCALATION_TIERS.CARE_COORDINATOR_OUTREACH;
          escalations.push({
            taskId: task.taskId,
            taskTitle: task.title,
            tier: ESCALATION_TIERS.CARE_COORDINATOR_OUTREACH,
            delayHours,
            actionRequired: 'NURSE_PHONE_OUTREACH',
            escalatedTo: task.personResponsible
          });
        }
      }
    }
  }

  if (escalations.length > 0) {
    appendRiskTimelineEvent(plan.patientId, {
      caseId: plan.caseId,
      planId,
      eventType: 'DELAY_ESCALATION_TRIGGERED',
      riskTier: escalations.some(e => e.tier === ESCALATION_TIERS.ATTENDING_PHYSICIAN_URGENT) ? RISK_TIERS.HIGH : RISK_TIERS.MODERATE,
      title: `Care protocol escalation: ${escalations.length} step(s) delayed`,
      description: escalations.map(e => `${e.taskTitle}: delayed ${e.delayHours}h -> ${e.tier}`).join('; '),
      timestamp: currentTimestamp
    });
  }

  return {
    planId,
    overdueCount,
    escalationCount: escalations.length,
    escalations
  };
}

// =============================================================================
// 4. REMOTE MONITORING (RPM) WITH RELIABLE SOURCE VALIDATION
// =============================================================================

function recordRemoteMonitoringTelemetry({
  planId,
  patientId,
  metricType,
  value,
  unit,
  source = 'bluetooth_ble_cuff',
  isReliableSource = true,
  sourceDetails = {}
}) {
  const plan = followupPlansStore.get(planId);
  if (!plan) throw new Error(`Follow-up plan '${planId}' not found.`);

  const nowIso = new Date().toISOString();
  const telemetryList = remoteMonitoringTelemetryStore.get(planId) || [];

  // 🛡️ CRITICAL GOVERNANCE CHECK:
  // If source is NOT reliable (e.g. unverified guest input, uncalibrated device):
  // The system stores it as purely observational and strictly PREVENTS firing automated clinical alerts
  if (!isReliableSource) {
    const unverifiedRecord = {
      telemetryId: `rpm_unv_${Date.now()}`,
      metricType,
      value,
      unit,
      source,
      isReliableSource: false,
      qualityStatus: 'UNVERIFIED_OBSERVATIONAL_TELEMETRY',
      sourceDetails,
      timestamp: nowIso
    };
    telemetryList.unshift(unverifiedRecord);
    remoteMonitoringTelemetryStore.set(planId, telemetryList);

    return {
      status: 'ACCEPTED_OBSERVATIONAL_ONLY',
      alertTriggered: false,
      isReliableSource: false,
      governanceNote: 'Telemetry recorded as observational. Unverified sources cannot trigger automated clinical alerts or treatment modifications.'
    };
  }

  // Verified & Reliable Source Processing
  const verifiedRecord = {
    telemetryId: `rpm_ver_${Date.now()}`,
    metricType,
    value,
    unit,
    source,
    isReliableSource: true,
    qualityStatus: 'VERIFIED_CLINICAL_TELEMETRY',
    sourceDetails,
    timestamp: nowIso
  };

  telemetryList.unshift(verifiedRecord);
  remoteMonitoringTelemetryStore.set(planId, telemetryList);

  // Evaluate Doctor-Approved Thresholds
  const thresholds = plan.remoteMonitoringConfig?.alertThresholds || {};
  let alertTriggered = false;
  let alertDetails = null;

  if (metricType === 'SPO2' && value < (thresholds.spo2Min || 90)) {
    alertTriggered = true;
    alertDetails = {
      type: 'HYPOXIA_CRITICAL_RPM_ALERT',
      severity: 'CRITICAL',
      message: `Verified SpO2 fell to ${value}%, below doctor-approved threshold of ${thresholds.spo2Min}%.`
    };
  } else if (metricType === 'BLOOD_PRESSURE' && typeof value === 'object') {
    if (value.systolic >= (thresholds.systolicMax || 180) || value.diastolic >= (thresholds.diastolicMax || 120)) {
      alertTriggered = true;
      alertDetails = {
        type: 'HYPERTENSIVE_CRISIS_RPM_ALERT',
        severity: 'CRITICAL',
        message: `Verified BP reading ${value.systolic}/${value.diastolic} mmHg exceeded doctor-approved limit of ${thresholds.systolicMax}/${thresholds.diastolicMax} mmHg.`
      };
    }
  }

  if (alertTriggered) {
    appendRiskTimelineEvent(patientId, {
      caseId: plan.caseId,
      planId,
      eventType: 'RPM_THRESHOLD_ALERT',
      riskTier: RISK_TIERS.CRITICAL,
      title: alertDetails.type,
      description: alertDetails.message,
      timestamp: nowIso
    });
  }

  return {
    status: 'VERIFIED_ACCEPTED',
    alertTriggered,
    alertDetails,
    isReliableSource: true,
    telemetry: verifiedRecord
  };
}

// =============================================================================
// 5. PLAN MODIFICATION, CANCELLATION & GOVERNANCE GUARDS
// =============================================================================

function modifyFollowupPlan({
  planId,
  doctorIdentity,
  modificationReason,
  updatedTasks = null,
  updatedAppointments = null,
  updatedReminders = null,
  updatedReassessment = null,
  updatedRemoteMonitoringConfig = null
}) {
  validateDoctorCredentials(doctorIdentity);

  const plan = followupPlansStore.get(planId);
  if (!plan) throw new Error(`Follow-up plan '${planId}' not found.`);

  if (plan.status === PLAN_STATUS.CANCELLED) {
    const error = new Error('Cannot modify a cancelled follow-up plan.');
    error.code = 'INVALID_PLAN_STATUS';
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  plan.version += 1;
  plan.status = PLAN_STATUS.ACTIVE;

  if (Array.isArray(updatedTasks)) {
    plan.tasks = updatedTasks.map(t => ({
      ...t,
      status: t.status || TASK_STATUS.PENDING
    }));
  }
  if (Array.isArray(updatedAppointments)) {
    plan.appointments = updatedAppointments;
  }
  if (Array.isArray(updatedReminders)) {
    plan.reminders = updatedReminders;
  }
  if (updatedReassessment) {
    plan.reassessment = updatedReassessment;
  }
  if (updatedRemoteMonitoringConfig) {
    plan.remoteMonitoringConfig = updatedRemoteMonitoringConfig;
  }

  plan.auditLog.push({
    action: 'PLAN_MODIFIED',
    timestamp: nowIso,
    actorUid: doctorIdentity.uid,
    actorRole: 'doctor',
    version: plan.version,
    reason: String(modificationReason || 'Clinical reassessment and goal adjustment').trim()
  });

  plan.updatedAt = nowIso;
  plan.digitalSignature = generateDigitalSignature(plan, doctorIdentity);

  appendRiskTimelineEvent(plan.patientId, {
    caseId: plan.caseId,
    planId,
    eventType: 'PLAN_MODIFIED',
    riskTier: RISK_TIERS.MODERATE,
    title: `Follow-up plan amended to v${plan.version}`,
    description: `Reason: ${modificationReason || 'Clinical update'} by ${doctorIdentity.name}`,
    timestamp: nowIso
  });

  return plan;
}

function cancelFollowupPlan({ planId, doctorIdentity, cancellationReason }) {
  validateDoctorCredentials(doctorIdentity);

  const plan = followupPlansStore.get(planId);
  if (!plan) throw new Error(`Follow-up plan '${planId}' not found.`);

  const nowIso = new Date().toISOString();
  plan.status = PLAN_STATUS.CANCELLED;
  plan.cancellationReason = String(cancellationReason || 'Patient discharged or transferred').trim();
  plan.cancelledAt = nowIso;
  plan.cancelledBy = {
    uid: doctorIdentity.uid,
    name: doctorIdentity.name,
    licenseNumber: doctorIdentity.licenseNumber
  };

  // Cancel all pending tasks and deactivate reminders
  let cancelledTasksCount = 0;
  for (const t of plan.tasks) {
    if (t.status !== TASK_STATUS.COMPLETED) {
      t.status = TASK_STATUS.CANCELLED;
      cancelledTasksCount++;
    }
  }

  for (const r of plan.reminders) {
    r.isActive = false;
  }

  plan.auditLog.push({
    action: 'PLAN_CANCELLED',
    timestamp: nowIso,
    actorUid: doctorIdentity.uid,
    reason: plan.cancellationReason,
    cancelledTasksCount
  });

  plan.updatedAt = nowIso;

  appendRiskTimelineEvent(plan.patientId, {
    caseId: plan.caseId,
    planId,
    eventType: 'PLAN_CANCELLED',
    riskTier: RISK_TIERS.LOW,
    title: `Follow-up plan cancelled by ${doctorIdentity.name}`,
    description: `Reason: ${plan.cancellationReason}. ${cancelledTasksCount} pending tasks stopped.`,
    timestamp: nowIso
  });

  return { plan, cancelledTasksCount };
}

/**
 * 🛡️ CLINICAL DECISION GUARD:
 * Prevents automated scripts or unapproved non-physicians from generating unapproved medical decisions,
 * altering prescriptions, or making autonomous diagnostic changes.
 */
function evaluateClinicalDecisionGuard({ planId, proposedAction, requestingUser }) {
  const restrictedActions = ['MODIFY_DOSAGE', 'DISCONTINUE_MEDICATION', 'AUTONOMOUS_DIAGNOSIS', 'DISCHARGE_PATIENT'];

  if (restrictedActions.includes(proposedAction)) {
    const isDoctor = requestingUser &&
      (requestingUser.role === 'doctor' || Boolean(requestingUser.licenseNumber)) &&
      requestingUser.status === 'approved' &&
      !requestingUser.isLicenseExpired &&
      requestingUser.licenseStatus !== 'revoked';

    if (!isDoctor) {
      const error = new Error(`Action '${proposedAction}' is a restricted clinical decision that requires an actively approved physician.`);
      error.code = 'UNAPPROVED_MEDICAL_DECISION_BLOCKED';
      error.statusCode = 403;
      throw error;
    }
  }

  return { allowed: true };
}

// =============================================================================
// 6. PATIENT RISK TIMELINE (LONGITUDINAL TRAJECTORY)
// =============================================================================

function appendRiskTimelineEvent(patientId, event) {
  const timeline = patientRiskTimelineStore.get(patientId) || [];
  const eventRecord = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  };
  timeline.unshift(eventRecord);
  patientRiskTimelineStore.set(patientId, timeline);
  return eventRecord;
}

function getPatientRiskTimeline(patientId, caseId = null) {
  let timeline = patientRiskTimelineStore.get(patientId) || [];

  if (caseId) {
    timeline = timeline.filter(evt => evt.caseId === caseId);
  }

  // Calculate Risk Trajectory (improving, stable, deteriorating)
  let currentTrajectory = 'stable';
  if (timeline.length >= 2) {
    const latestTier = timeline[0].riskTier;
    const previousTier = timeline[1].riskTier;

    const rank = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
    const latestRank = rank[latestTier] || 2;
    const prevRank = rank[previousTier] || 2;

    if (latestRank < prevRank) currentTrajectory = 'improving';
    else if (latestRank > prevRank) currentTrajectory = 'deteriorating';
  }

  return {
    patientId,
    caseId,
    eventCount: timeline.length,
    currentTrajectory,
    currentRiskTier: timeline.length > 0 ? timeline[0].riskTier : RISK_TIERS.LOW,
    timeline
  };
}

// =============================================================================
// 7. GETTERS & STORE RESET
// =============================================================================

function getPlanById(planId) {
  return followupPlansStore.get(planId) || null;
}

function getPlansByCase(caseId) {
  const planIds = casePlansIndex.get(caseId) || new Set();
  return Array.from(planIds).map(id => followupPlansStore.get(id)).filter(Boolean);
}

function getPlansByPatient(patientId) {
  const planIds = patientPlansIndex.get(patientId) || new Set();
  return Array.from(planIds).map(id => followupPlansStore.get(id)).filter(Boolean);
}

function resetFollowupStoreForTesting() {
  followupPlansStore.clear();
  casePlansIndex.clear();
  patientPlansIndex.clear();
  patientRiskTimelineStore.clear();
  remoteMonitoringTelemetryStore.clear();
}

module.exports = {
  PROTOCOL_TYPES,
  PLAN_STATUS,
  TASK_STATUS,
  RISK_TIERS,
  ESCALATION_TIERS,
  validateDoctorCredentials,
  createFollowupPlan,
  modifyFollowupPlan,
  cancelFollowupPlan,
  completeTaskStep,
  auditPlanDelaysAndOverdue,
  recordRemoteMonitoringTelemetry,
  evaluateClinicalDecisionGuard,
  getPatientRiskTimeline,
  getPlanById,
  getPlansByCase,
  getPlansByPatient,
  resetFollowupStoreForTesting
};
