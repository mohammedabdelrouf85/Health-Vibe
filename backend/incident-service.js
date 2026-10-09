/**
 * Health Vibe AI - Security Incident, Clinical Adverse Event & Vulnerability Reporting Service
 *
 * Implements:
 * 1. Vulnerability-Reporting Channel: submission, sanitization, tracking, and audit trail.
 * 2. Incident & Adverse Event Register:
 *    - Compromise, Data Leaks, Service Outages, Incorrect Medical Content.
 * 3. Evidence Preservation: SHA-256 cryptographic fingerprinting, trace correlation.
 * 4. Recovery & Communications Audit Logging.
 */

const crypto = require('crypto');
const { redactPii } = require('./monitoring-service');

const INCIDENT_TYPES = Object.freeze({
  COMPROMISE: 'compromise',
  DATA_LEAK: 'data_leak',
  SERVICE_OUTAGE: 'service_outage',
  INCORRECT_MEDICAL_CONTENT: 'incorrect_medical_content'
});

const INCIDENT_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const INCIDENT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  CONTAINED: 'CONTAINED',
  RECOVERED: 'RECOVERED',
  CLOSED: 'CLOSED'
});

const VULN_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  TRIAGED: 'TRIAGED',
  REPRODUCED: 'REPRODUCED',
  FIX_IN_PROGRESS: 'FIX_IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED'
});

// In-Memory Ring Buffers (Synchronized with Firestore if connected)
const vulnerabilityReports = [];
const incidentRegister = [];
const MAX_RECORDS = 500;

/**
 * Calculates SHA-256 cryptographic fingerprint of raw content or object for forensic preservation.
 */
function generateEvidenceHash(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content || {});
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Submits a new vulnerability report through the responsible disclosure channel.
 */
function submitVulnerabilityReport({
  reporterName = 'Anonymous Researcher',
  reporterEmail = null,
  vulnerabilityType = 'unspecified',
  severity = 'MEDIUM',
  affectedComponent = 'general',
  reproductionSteps = '',
  pocDetails = '',
  clientIp = null,
  firestoreDb = null
} = {}) {
  const reportId = `vuln_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  // Validate severity
  const normalizedSeverity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(severity).toUpperCase())
    ? String(severity).toUpperCase()
    : 'MEDIUM';

  const report = {
    reportId,
    reporterName: redactPii(String(reporterName || '').trim() || 'Anonymous Researcher'),
    reporterEmail: reporterEmail ? redactPii(String(reporterEmail).trim().toLowerCase()) : null,
    vulnerabilityType: String(vulnerabilityType || '').trim(),
    severity: normalizedSeverity,
    affectedComponent: String(affectedComponent || '').trim(),
    reproductionSteps: redactPii(String(reproductionSteps || '').trim()),
    pocDetails: redactPii(String(pocDetails || '').trim()),
    status: VULN_STATUS.RECEIVED,
    clientIpHash: clientIp ? crypto.createHash('sha256').update(String(clientIp)).digest('hex').substring(0, 16) : null,
    createdAt: now,
    updatedAt: now,
    triageNotes: []
  };

  vulnerabilityReports.unshift(report);
  if (vulnerabilityReports.length > MAX_RECORDS) {
    vulnerabilityReports.pop();
  }

  // Persist to Firestore if available
  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    try {
      firestoreDb.collection('vulnerability_reports').doc(reportId).set({
        ...report,
        timestamp: new Date()
      }).catch(err => console.warn('[VULNERABILITY REPORT] Firestore save notice:', err.message));
    } catch (e) {}
  }

  console.info(`[SECURITY] New Vulnerability Report received [${reportId}] - Type: ${report.vulnerabilityType} (${report.severity})`);
  return report;
}

/**
 * Retrieves list of vulnerability reports with optional status and severity filtering.
 */
function getVulnerabilityReports({ status = null, severity = null, limit = 50 } = {}) {
  let list = vulnerabilityReports;
  if (status) {
    list = list.filter(r => r.status === String(status).toUpperCase());
  }
  if (severity) {
    list = list.filter(r => r.severity === String(severity).toUpperCase());
  }
  return list.slice(0, Math.min(limit, 200));
}

/**
 * Registers a security incident or clinical adverse event.
 */
function createIncident({
  type = INCIDENT_TYPES.COMPROMISE,
  severity = INCIDENT_SEVERITY.HIGH,
  title = 'Untitled Incident',
  description = '',
  owner = null,
  affectedUsersCount = 0,
  escalationLevel = 'level_1',
  metadata = {},
  reportedBy = 'system',
  firestoreDb = null
} = {}) {
  const isAdverseEvent = type === INCIDENT_TYPES.INCORRECT_MEDICAL_CONTENT;
  const prefix = isAdverseEvent ? 'adv' : 'inc';
  const incidentId = `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  // Validate type
  const normalizedType = Object.values(INCIDENT_TYPES).includes(type)
    ? type
    : INCIDENT_TYPES.COMPROMISE;

  // Validate severity
  const normalizedSeverity = Object.values(INCIDENT_SEVERITY).includes(String(severity).toUpperCase())
    ? String(severity).toUpperCase()
    : INCIDENT_SEVERITY.MEDIUM;

  const defaultOwner = {
    name: isAdverseEvent ? 'Chief Medical Officer' : 'Lead Security Engineer',
    email: isAdverseEvent ? 'clinical@healthvibe.ai' : 'security@healthvibe.ai',
    role: isAdverseEvent ? 'Clinical Lead' : 'Incident Commander'
  };

  const incident = {
    incidentId,
    isAdverseEvent,
    type: normalizedType,
    severity: normalizedSeverity,
    status: INCIDENT_STATUS.OPEN,
    title: redactPii(String(title).trim()),
    description: redactPii(String(description).trim()),
    owner: owner || defaultOwner,
    affectedUsersCount: Math.max(0, parseInt(affectedUsersCount, 10) || 0),
    escalationLevel: ['level_1', 'level_2', 'level_3'].includes(escalationLevel) ? escalationLevel : 'level_1',
    evidence: [],
    recoveryActions: [],
    communicationLog: [],
    rootCause: null,
    metadata: redactPii(metadata || {}),
    reportedBy: redactPii(reportedBy),
    createdAt: now,
    updatedAt: now,
    resolvedAt: null
  };

  incidentRegister.unshift(incident);
  if (incidentRegister.length > MAX_RECORDS) {
    incidentRegister.pop();
  }

  // Persist to Firestore if available
  const targetCollection = isAdverseEvent ? 'clinical_adverse_events' : 'incidents';
  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    try {
      firestoreDb.collection(targetCollection).doc(incidentId).set({
        ...incident,
        timestamp: new Date()
      }).catch(err => console.warn(`[INCIDENT REGISTER] ${targetCollection} save notice:`, err.message));
    } catch (e) {}
  }

  console.info(`[INCIDENT REGISTER] Opened ${incident.isAdverseEvent ? 'Adverse Event' : 'Security Incident'} [${incidentId}] - ${incident.title} (${incident.severity})`);
  return incident;
}

/**
 * Attaches immutable forensic evidence to an incident with a cryptographic SHA-256 fingerprint.
 */
function attachEvidence(incidentId, {
  type = 'log_snapshot',
  referenceId = null,
  traceId = null,
  data = null,
  capturedBy = 'forensic_agent',
  firestoreDb = null
} = {}) {
  const incident = incidentRegister.find(i => i.incidentId === incidentId);
  if (!incident) {
    throw new Error(`Incident with ID "${incidentId}" not found in register.`);
  }

  const sanitizedData = redactPii(data);
  const evidenceId = `evd_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const sha256Fingerprint = generateEvidenceHash(sanitizedData || referenceId || evidenceId);
  const now = new Date().toISOString();

  const evidenceRecord = {
    evidenceId,
    type,
    referenceId: referenceId ? String(referenceId) : null,
    traceId: traceId ? String(traceId) : null,
    sha256Fingerprint,
    data: sanitizedData,
    capturedBy: String(capturedBy),
    capturedAt: now
  };

  incident.evidence.push(evidenceRecord);
  incident.updatedAt = now;

  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    const targetCollection = incident.isAdverseEvent ? 'clinical_adverse_events' : 'incidents';
    try {
      firestoreDb.collection(targetCollection).doc(incidentId).update({
        evidence: incident.evidence,
        updatedAt: now
      }).catch(() => {});
    } catch (e) {}
  }

  console.info(`[INCIDENT EVIDENCE] Attached evidence [${evidenceId}] to [${incidentId}] (SHA-256: ${sha256Fingerprint.slice(0, 16)}...)`);
  return evidenceRecord;
}

/**
 * Updates status, records recovery action, and sets resolution timestamp if closing.
 */
function updateIncidentStatus(incidentId, {
  status = null,
  rootCause = null,
  recoveryAction = null,
  escalationLevel = null,
  resolvedBy = null,
  firestoreDb = null
} = {}) {
  const incident = incidentRegister.find(i => i.incidentId === incidentId);
  if (!incident) {
    throw new Error(`Incident with ID "${incidentId}" not found in register.`);
  }

  const now = new Date().toISOString();

  if (status && Object.values(INCIDENT_STATUS).includes(status)) {
    incident.status = status;
    if (status === INCIDENT_STATUS.RECOVERED || status === INCIDENT_STATUS.CLOSED) {
      if (!incident.resolvedAt) {
        incident.resolvedAt = now;
      }
    }
  }

  if (rootCause) {
    incident.rootCause = redactPii(String(rootCause).trim());
  }

  if (recoveryAction) {
    incident.recoveryActions.push({
      action: redactPii(String(recoveryAction).trim()),
      executedAt: now,
      executedBy: resolvedBy || incident.owner.name
    });
  }

  if (escalationLevel && ['level_1', 'level_2', 'level_3'].includes(escalationLevel)) {
    incident.escalationLevel = escalationLevel;
  }

  incident.updatedAt = now;

  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    const targetCollection = incident.isAdverseEvent ? 'clinical_adverse_events' : 'incidents';
    try {
      firestoreDb.collection(targetCollection).doc(incidentId).update({
        status: incident.status,
        rootCause: incident.rootCause,
        recoveryActions: incident.recoveryActions,
        escalationLevel: incident.escalationLevel,
        resolvedAt: incident.resolvedAt,
        updatedAt: now
      }).catch(() => {});
    } catch (e) {}
  }

  console.info(`[INCIDENT STATUS] Incident [${incidentId}] status updated to [${incident.status}]`);
  return incident;
}

/**
 * Logs an outbound communication (to users, clinics, or regulators) on an incident.
 */
function logIncidentCommunication(incidentId, {
  recipientGroup = 'patients',
  channel = 'email',
  summary = '',
  messageId = null,
  sentBy = 'incident_response_team',
  firestoreDb = null
} = {}) {
  const incident = incidentRegister.find(i => i.incidentId === incidentId);
  if (!incident) {
    throw new Error(`Incident with ID "${incidentId}" not found in register.`);
  }

  const now = new Date().toISOString();
  const entry = {
    communicationId: `comm_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
    recipientGroup: String(recipientGroup),
    channel: String(channel),
    summary: redactPii(String(summary).trim()),
    messageId: messageId ? String(messageId) : null,
    sentBy: String(sentBy),
    sentAt: now
  };

  incident.communicationLog.push(entry);
  incident.updatedAt = now;

  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    const targetCollection = incident.isAdverseEvent ? 'clinical_adverse_events' : 'incidents';
    try {
      firestoreDb.collection(targetCollection).doc(incidentId).update({
        communicationLog: incident.communicationLog,
        updatedAt: now
      }).catch(() => {});
    } catch (e) {}
  }

  return entry;
}

/**
 * Query incidents and adverse events with filters.
 */
function queryIncidents({
  type = null,
  severity = null,
  status = null,
  isAdverseEvent = null,
  limit = 50
} = {}) {
  let list = incidentRegister;

  if (type) {
    list = list.filter(i => i.type === type);
  }
  if (severity) {
    list = list.filter(i => i.severity === String(severity).toUpperCase());
  }
  if (status) {
    list = list.filter(i => i.status === String(status).toUpperCase());
  }
  if (isAdverseEvent !== null) {
    const targetBool = Boolean(isAdverseEvent);
    list = list.filter(i => i.isAdverseEvent === targetBool);
  }

  return list.slice(0, Math.min(limit, 200));
}

/**
 * Get incident by ID.
 */
function getIncidentById(incidentId) {
  return incidentRegister.find(i => i.incidentId === incidentId) || null;
}

/**
 * Reset service state (for test isolation).
 */
function resetIncidentServiceState() {
  vulnerabilityReports.length = 0;
  incidentRegister.length = 0;
}

module.exports = {
  INCIDENT_TYPES,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  VULN_STATUS,
  generateEvidenceHash,
  submitVulnerabilityReport,
  getVulnerabilityReports,
  createIncident,
  attachEvidence,
  updateIncidentStatus,
  logIncidentCommunication,
  queryIncidents,
  getIncidentById,
  resetIncidentServiceState
};
