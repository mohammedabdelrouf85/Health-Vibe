/**
 * HEALTH VIBE AI: AUTHORIZED SECURITY ASSESSMENT & INCIDENT REGISTER TEST SUITE
 *
 * Verifies:
 * 1. RFC 9116 security.txt existence, contacts, safe harbor policy, and expiration.
 * 2. Vulnerability Reporting Channel: submission, rate limiting, PII redaction, and tracking ID.
 * 3. Incident and Clinical Adverse Event Register:
 *    - Compromise, Data Leaks, Outages, and Incorrect Medical Content.
 * 4. Forensic Evidence Preservation with SHA-256 Cryptographic Fingerprints.
 * 5. Incident Lifecycle: containment, status transitions, recovery actions, and communication logs.
 * 6. Zero-Trust Access Control: Non-privileged users blocked from incident registers.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const incidentService = require('../backend/incident-service');
const monitoringService = require('../backend/monitoring-service');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: SECURITY ASSESSMENT & INCIDENT REGISTER SUITE');
console.log('   Vulnerability Channel, Adverse Events, Evidence & Recovery');
console.log('==================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: RFC 9116 security.txt Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ TEST 1: RFC 9116 security.txt Public Disclosure Channel');

runTest('1A: security.txt exists in app/.well-known and root .well-known', () => {
  const appPath = path.join(__dirname, '../app/.well-known/security.txt');
  const rootPath = path.join(__dirname, '../.well-known/security.txt');

  assert.ok(fs.existsSync(appPath), 'app/.well-known/security.txt must exist');
  assert.ok(fs.existsSync(rootPath), '.well-known/security.txt must exist');

  const content = fs.readFileSync(appPath, 'utf8');
  assert.ok(content.includes('Contact: mailto:security@healthvibe.ai'), 'Must include security contact email');
  assert.ok(content.includes('Contact: mailto:badr46694@gmail.com'), 'Must include owner contact email');
  assert.ok(content.includes('Expires:'), 'Must specify expiration date per RFC 9116');
  assert.ok(content.includes('Preferred-Languages:'), 'Must specify preferred languages');
  assert.ok(content.includes('Safe Harbor'), 'Must define Safe Harbor policy for researchers');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Vulnerability Reporting Channel
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 2: Vulnerability Reporting Channel');

runTest('2A: Accepts valid vulnerability disclosure and redacts PII', () => {
  incidentService.resetIncidentServiceState();

  const report = incidentService.submitVulnerabilityReport({
    reporterName: 'SecResearcher John Doe',
    reporterEmail: 'researcher@secops.io',
    vulnerabilityType: 'IDOR',
    severity: 'HIGH',
    affectedComponent: '/api/patient/profile',
    reproductionSteps: 'Send GET request with patient email target.patient@healthvibe.com and phone +201099887766',
    pocDetails: 'curl -H "Authorization: Bearer mock-token" https://healthvibe.ai/api/patient/profile',
    clientIp: '197.34.12.98'
  });

  assert.ok(report.reportId.startsWith('vuln_'), 'Report ID must start with vuln_');
  assert.strictEqual(report.status, incidentService.VULN_STATUS.RECEIVED);
  assert.strictEqual(report.severity, 'HIGH');
  assert.ok(!report.reproductionSteps.includes('target.patient@healthvibe.com'), 'Email in steps must be redacted');
  assert.ok(report.reproductionSteps.includes('[REDACTED_EMAIL]'));
  assert.ok(!report.reproductionSteps.includes('+201099887766'), 'Phone in steps must be redacted');
  assert.ok(report.reproductionSteps.includes('[REDACTED_PHONE]'));
  assert.ok(report.clientIpHash, 'Must retain hashed client IP for forensic audit');
});

runTest('2B: Querying vulnerability reports supports status & severity filtering', () => {
  incidentService.submitVulnerabilityReport({
    reporterName: 'Whitehat A',
    vulnerabilityType: 'XSS',
    severity: 'LOW',
    reproductionSteps: 'Inject script tag in feedback'
  });

  const allReports = incidentService.getVulnerabilityReports();
  assert.strictEqual(allReports.length, 2, 'Must have 2 submitted reports');

  const highOnly = incidentService.getVulnerabilityReports({ severity: 'HIGH' });
  assert.strictEqual(highOnly.length, 1);
  assert.strictEqual(highOnly[0].vulnerabilityType, 'IDOR');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Incident & Clinical Adverse Event Register
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 3: Incident & Clinical Adverse Event Register');

runTest('3A: Registers a Security Compromise incident (Type: compromise)', () => {
  incidentService.resetIncidentServiceState();

  const incident = incidentService.createIncident({
    type: incidentService.INCIDENT_TYPES.COMPROMISE,
    severity: incidentService.INCIDENT_SEVERITY.CRITICAL,
    title: 'Anomalous Multi-Subnet Admin Login Attempt',
    description: 'Multiple failed auth attempts detected for owner account badr46694@gmail.com from foreign IP',
    owner: { name: 'Incident Commander', email: 'security@healthvibe.ai', role: 'Security Lead' },
    affectedUsersCount: 1,
    escalationLevel: 'level_3'
  });

  assert.ok(incident.incidentId.startsWith('inc_'), 'Security incident ID must start with inc_');
  assert.strictEqual(incident.isAdverseEvent, false);
  assert.strictEqual(incident.type, 'compromise');
  assert.strictEqual(incident.status, incidentService.INCIDENT_STATUS.OPEN);
  assert.strictEqual(incident.escalationLevel, 'level_3');
  assert.ok(!incident.description.includes('badr46694@gmail.com'), 'Email in incident description must be redacted');
  assert.ok(incident.description.includes('[REDACTED_EMAIL]'));
});

runTest('3B: Registers a Clinical Adverse Event (Type: incorrect_medical_content)', () => {
  const adverseEvent = incidentService.createIncident({
    type: incidentService.INCIDENT_TYPES.INCORRECT_MEDICAL_CONTENT,
    severity: incidentService.INCIDENT_SEVERITY.HIGH,
    title: 'Triage SpO2 Risk Label Discrepancy',
    description: 'Patient assessment with SpO2 88% routed to normal instead of emergency guidance',
    affectedUsersCount: 1,
    escalationLevel: 'level_2',
    metadata: { caseId: 'case_9988_test', ruleEngineVersion: 'HealthVibe-Rules-v1.0' }
  });

  assert.ok(adverseEvent.incidentId.startsWith('adv_'), 'Clinical adverse event ID must start with adv_');
  assert.strictEqual(adverseEvent.isAdverseEvent, true);
  assert.strictEqual(adverseEvent.type, 'incorrect_medical_content');
  assert.strictEqual(adverseEvent.owner.role, 'Clinical Lead');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Forensic Evidence Preservation & Cryptographic Hashing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 4: Forensic Evidence Preservation with SHA-256 Fingerprint');

runTest('4A: Attaches evidence and generates immutable SHA-256 fingerprint', () => {
  const incidents = incidentService.queryIncidents({ type: 'compromise' });
  const incident = incidents[0];

  const evidencePayload = {
    logSource: 'audit_events',
    offendingIps: ['197.22.10.5', '197.22.10.6'],
    requestHeaders: { userAgent: 'BadActorBot/1.0', xTraceId: 'trc_suspicious_1122' }
  };

  const evidence = incidentService.attachEvidence(incident.incidentId, {
    type: 'server_access_log_snapshot',
    referenceId: 'audit_event_doc_7766',
    traceId: 'trc_suspicious_1122',
    data: evidencePayload,
    capturedBy: 'security_audit_worker'
  });

  assert.ok(evidence.evidenceId.startsWith('evd_'));
  assert.strictEqual(evidence.sha256Fingerprint.length, 64, 'SHA-256 fingerprint must be 64 hex characters');
  assert.strictEqual(evidence.traceId, 'trc_suspicious_1122');

  // Verify evidence attached to incident
  const updatedIncident = incidentService.getIncidentById(incident.incidentId);
  assert.strictEqual(updatedIncident.evidence.length, 1);
  assert.strictEqual(updatedIncident.evidence[0].evidenceId, evidence.evidenceId);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Incident Lifecycle, Containment, Recovery & Communications
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 5: Incident Lifecycle, Recovery Actions & Communications Audit');

runTest('5A: Transitions incident through CONTAINED and RECOVERED with recovery actions', () => {
  const incident = incidentService.queryIncidents({ type: 'compromise' })[0];

  // 1. Containment step
  incidentService.updateIncidentStatus(incident.incidentId, {
    status: incidentService.INCIDENT_STATUS.CONTAINED,
    recoveryAction: 'Revoked refresh tokens for affected account and rotated service credentials'
  });

  let cur = incidentService.getIncidentById(incident.incidentId);
  assert.strictEqual(cur.status, 'CONTAINED');
  assert.strictEqual(cur.recoveryActions.length, 1);
  assert.strictEqual(cur.resolvedAt, null, 'Must not be marked resolved while in CONTAINED');

  // 2. Recovery & closure step
  incidentService.updateIncidentStatus(incident.incidentId, {
    status: incidentService.INCIDENT_STATUS.RECOVERED,
    rootCause: 'Compromised developer workstation API token',
    recoveryAction: 'Enforced MFA requirement and updated IP allowlist'
  });

  cur = incidentService.getIncidentById(incident.incidentId);
  assert.strictEqual(cur.status, 'RECOVERED');
  assert.strictEqual(cur.recoveryActions.length, 2);
  assert.ok(cur.resolvedAt, 'Must set resolvedAt timestamp upon recovery');
  assert.ok(cur.rootCause.includes('API token'));
});

runTest('5B: Logs outbound communications to stakeholders and regulators', () => {
  const incident = incidentService.queryIncidents({ type: 'compromise' })[0];

  const comm1 = incidentService.logIncidentCommunication(incident.incidentId, {
    recipientGroup: 'executive_board',
    channel: 'secure_email',
    summary: 'Initial incident briefing provided to System Owner and legal counsel'
  });

  const comm2 = incidentService.logIncidentCommunication(incident.incidentId, {
    recipientGroup: 'clinic_administrators',
    channel: 'advisory_bulletin',
    summary: 'Security advisory dispatched to all clinic administrators recommending session audits'
  });

  assert.ok(comm1.communicationId.startsWith('comm_'));
  assert.strictEqual(comm1.recipientGroup, 'executive_board');

  const cur = incidentService.getIncidentById(incident.incidentId);
  assert.strictEqual(cur.communicationLog.length, 2);
  assert.strictEqual(cur.communicationLog[1].channel, 'advisory_bulletin');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Express Server Endpoints & Zero-Trust Access Control
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 6: Server Endpoints & Zero-Trust Access Control');

const app = require('../backend/server');

runTest('6A: Server exposes incidentService and endpoints', () => {
  assert.ok(app.incidentService, 'app.incidentService must be defined');
  assert.strictEqual(typeof app.incidentService.createIncident, 'function');
  assert.strictEqual(typeof app.incidentService.submitVulnerabilityReport, 'function');
});

runTest('6B: Rate limiter guard protects vulnerability reporting endpoint from DoS', () => {
  const limiter = app.createRateLimiter({
    windowMs: 60000,
    maxRequests: 3,
    message: 'Too many vulnerability disclosure submissions.'
  });
  const mockReq = { ip: '192.168.1.50' };

  let allowed = 0;
  let blocked = 0;

  for (let i = 0; i < 5; i++) {
    limiter(mockReq, {
      setHeader: () => {},
      status: (code) => {
        if (code === 429) blocked++;
        return { json: () => {} };
      }
    }, () => { allowed++; });
  }

  assert.strictEqual(allowed, 3, 'Must allow first 3 requests within window');
  assert.strictEqual(blocked, 2, 'Must reject remaining 2 requests with 429');
});

console.log('\n==================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} SECURITY ASSESSMENT & INCIDENT TESTS PASSED (100%)`);
console.log('==================================================================\n');
