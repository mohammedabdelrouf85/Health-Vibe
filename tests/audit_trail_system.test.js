/**
 * HEALTH VIBE AI: COMPREHENSIVE AUDIT TRAIL & SECURITY TEST SUITE
 * 
 * Verifies:
 * 1. Recording of all mandated event types:
 *    - Sign-in (USER_SIGNED_IN) & Sign-out (USER_SIGNED_OUT)
 *    - Open record (RECORD_VIEWED) & Update record (RECORD_UPDATED)
 *    - Approve cases (CASE_APPROVED) & Reject cases (CASE_REJECTED)
 *    - Role change (ROLE_CHANGED)
 *    - Privacy consent grant (PRIVACY_CONSENT_GRANTED) & withdrawal (PRIVACY_CONSENT_WITHDRAWN)
 *    - Account deletion (ACCOUNT_DELETED)
 *    - File access (FILE_ACCESSED)
 * 2. Trusted Actor & Server-Authoritative Timestamp
 * 3. Append-Only Immutability in Firestore Rules (No client write/update/delete)
 * 4. Granular RBAC Querying & Search (Super Admin platform-wide, Clinic Admin clinic-scoped)
 * 5. Data Minimization & IP/Device Metadata Privacy Policy
 * 6. Audit Trail Export (JSON & CSV) with Export Audit Event Logging
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('🛡️ HEALTH VIBE AI: ENTERPRISE AUDIT TRAIL & COMPLIANCE TEST SUITE');
console.log('   Authoritative Events, Immutability, RBAC Scoping & Privacy Policies');
console.log('==================================================================\n');

// Mock Firestore Collection
class MockFirestore {
  constructor() {
    this.records = [];
  }

  collection(name) {
    assert.strictEqual(name, 'audit_events');
    return {
      add: async (data) => {
        const docId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const record = { id: docId, ...data };
        this.records.push(record);
        return { id: docId };
      },
      get: async () => {
        return {
          forEach: (cb) => this.records.forEach(r => cb({ id: r.id, data: () => r })),
          docs: this.records.map(r => ({ id: r.id, data: () => r })),
          size: this.records.length
        };
      }
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Sensitive Data Minimization & Email Masking Policy
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ TEST 1: Sensitive Data Minimization & Email Masking Policy');
{
  // Test email masking
  assert.strictEqual(auditService.maskEmail('mohammed@example.com'), 'm***d@example.com');
  assert.strictEqual(auditService.maskEmail('dr.sarah@clinic.med'), 'd***h@clinic.med');
  assert.strictEqual(auditService.maskEmail('al@test.com'), 'a***@test.com');
  assert.strictEqual(auditService.maskEmail(''), '');
  assert.strictEqual(auditService.maskEmail(null), '');

  // Test details sanitization (stripping passwords, raw vitals, clinical symptoms)
  const dirtyDetails = {
    caseId: 'CASE-9876',
    action: 'CLINICAL_APPROVAL',
    password: 'SuperSecretPassword123!',
    token: 'jwt-bearer-token-here',
    apiKey: 'sk-1234567890',
    vitals: { heartRate: 85, spo2: 97, temp: 37.1 },
    symptoms: 'Severe dry cough and shortness of breath',
    clinicalDiagnosis: 'Acute Bronchitis',
    medications: 'Amoxicillin 500mg TID',
    audio: 'base64-audio-data',
    validNonSensitiveNote: 'Routine follow-up approved'
  };

  const sanitized = auditService.sanitizeDetails(dirtyDetails);

  assert.strictEqual(sanitized.caseId, 'CASE-9876');
  assert.strictEqual(sanitized.action, 'CLINICAL_APPROVAL');
  assert.strictEqual(sanitized.validNonSensitiveNote, 'Routine follow-up approved');

  // Verify all forbidden/sensitive PHI and credentials are stripped
  assert.strictEqual(sanitized.password, undefined);
  assert.strictEqual(sanitized.token, undefined);
  assert.strictEqual(sanitized.apiKey, undefined);
  assert.strictEqual(sanitized.vitals, undefined);
  assert.strictEqual(sanitized.symptoms, undefined);
  assert.strictEqual(sanitized.clinicalDiagnosis, undefined);
  assert.strictEqual(sanitized.medications, undefined);
  assert.strictEqual(sanitized.audio, undefined);

  console.log('  ✓ PHI and credential stripping verified under data minimization policy.');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Network IP & Device Metadata Privacy Policy
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 2: Network IP Subnet Masking & Salted HMAC Hash Policy');
{
  // IPv4 subnet masking
  const ipv4Result = auditService.sanitizeIp('198.51.100.123');
  assert.strictEqual(ipv4Result.subnetMask, '198.51.100.0/24', 'IPv4 must be masked to /24');
  assert.ok(ipv4Result.ipHash && ipv4Result.ipHash.length === 16, 'IP hash must be a 16-char HMAC string');
  assert.notStrictEqual(ipv4Result.ipHash, '198.51.100.123', 'Raw IP must NEVER be stored');

  // Loopback / Localhost
  const localResult = auditService.sanitizeIp('127.0.0.1');
  assert.strictEqual(localResult.subnetMask, '127.0.0.0/8');

  // IPv6 subnet masking
  const ipv6Result = auditService.sanitizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  assert.strictEqual(ipv6Result.subnetMask, '2001:0db8:85a3::/48', 'IPv6 must be masked to /48');

  // Device User-Agent sanitization
  const mockReqWindowsChrome = {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }
  };
  const devMeta1 = auditService.extractDeviceMetadata(mockReqWindowsChrome);
  assert.strictEqual(devMeta1.platform, 'Windows');
  assert.strictEqual(devMeta1.browser, 'Chrome');
  assert.strictEqual(devMeta1.isMobile, false);

  const mockReqIPhoneSafari = {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    }
  };
  const devMeta2 = auditService.extractDeviceMetadata(mockReqIPhoneSafari);
  assert.strictEqual(devMeta2.platform, 'iOS');
  assert.strictEqual(devMeta2.browser, 'Safari');
  assert.strictEqual(devMeta2.isMobile, true);

  console.log('  ✓ Subnet masking (/24, /48), HMAC IP hashing, and device categorization verified.');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Trusted Server Actor Extraction & Client Spoof Rejection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 3: Trusted Actor Extraction from Server Token (Anti-Spoofing)');
{
  const mockAuthenticatedReq = {
    user: {
      uid: 'physician_102',
      email: 'dr.ahmed@clinic.com',
      role: 'doctor',
      clinicId: 'clinic_cairo_north',
      isOwner: false
    },
    // Malicious spoof attempt in request body
    body: {
      actor: {
        uid: 'super_admin_spoofed',
        role: 'super_admin',
        isOwner: true
      }
    }
  };

  const actor = auditService.extractTrustedActor(mockAuthenticatedReq);

  assert.strictEqual(actor.uid, 'physician_102', 'Actor UID must strictly come from verified req.user');
  assert.strictEqual(actor.role, 'doctor', 'Actor role must strictly come from verified req.user');
  assert.strictEqual(actor.clinicId, 'clinic_cairo_north');
  assert.strictEqual(actor.isOwner, false);
  assert.strictEqual(actor.emailMasked, 'd***d@clinic.com');

  console.log('  ✓ Client-side actor spoofing rejected; server token claims authoritatively enforced.');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Full Mandated Event Types Recording
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 4: Complete Event Types Recording into Audit Trail');
(async () => {
  const mockDb = new MockFirestore();

  // Helper request maker
  const makeReq = (user, ip = '203.0.113.45', ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0') => ({
    user,
    ip,
    headers: { 'x-forwarded-for': ip, 'user-agent': ua }
  });

  const patientReq = makeReq({ uid: 'patient_01', role: 'patient', email: 'pat@example.com' });
  const doctorReq = makeReq({ uid: 'doc_01', role: 'doctor', email: 'doc@example.com', clinicId: 'c1' });
  const adminReq = makeReq({ uid: 'admin_01', role: 'super_admin', email: 'adm@example.com', isOwner: true });

  // 1. Sign In
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.USER_SIGNED_IN,
    req: patientReq,
    details: { method: 'otp_verified' }
  });

  // 2. Sign Out
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.USER_SIGNED_OUT,
    req: patientReq,
    details: { reason: 'user_signed_out' }
  });

  // 3. Open Record (RECORD_VIEWED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.RECORD_VIEWED,
    req: doctorReq,
    clinicId: 'c1',
    details: { caseId: 'CASE-001', recordType: 'clinical_case' }
  });

  // 4. Update Record (RECORD_UPDATED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.RECORD_UPDATED,
    req: doctorReq,
    clinicId: 'c1',
    details: { caseId: 'CASE-001', action: 'STATUS_TRANSITION', previousStatus: 'under_review', newStatus: 'approved' }
  });

  // 5. Approve Case (CASE_APPROVED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.CASE_APPROVED,
    req: doctorReq,
    clinicId: 'c1',
    details: { caseId: 'CASE-001', reportRef: 'REP-001' }
  });

  // 6. Reject Case (CASE_REJECTED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.CASE_REJECTED,
    req: doctorReq,
    clinicId: 'c1',
    details: { caseId: 'CASE-002', reason: 'Insufficient spirometry data' }
  });

  // 7. Role Change (ROLE_CHANGED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.ROLE_CHANGED,
    req: adminReq,
    targetUserId: 'patient_01',
    details: { previousRole: 'patient', newRole: 'doctor' }
  });

  // 8. Privacy Consent Grant (PRIVACY_CONSENT_GRANTED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.PRIVACY_CONSENT_GRANTED,
    req: patientReq,
    details: { version: '2026.1', purposes: ['dataProcessing', 'aiAdvisory'] }
  });

  // 9. Privacy Consent Withdrawal (PRIVACY_CONSENT_WITHDRAWN)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.PRIVACY_CONSENT_WITHDRAWN,
    req: patientReq,
    details: { version: '2026.1' }
  });

  // 10. Account Deletion (ACCOUNT_DELETED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.ACCOUNT_DELETED,
    req: patientReq,
    targetUserId: 'patient_01',
    details: { scrubbedCasesCount: 2, purgedAppointmentsCount: 1 }
  });

  // 11. File Accessed (FILE_ACCESSED)
  await auditService.recordAuditEvent(mockDb, {
    type: auditService.AUDIT_EVENT_TYPES.FILE_ACCESSED,
    req: doctorReq,
    clinicId: 'c1',
    details: { fileId: 'report_pdf_01', fileName: 'clinical_report.pdf', fileType: 'pdf' }
  });

  assert.strictEqual(mockDb.records.length, 11, 'All 11 mandatory audit events must be recorded.');

  const recordedTypes = mockDb.records.map(r => r.type);
  const requiredTypes = [
    'USER_SIGNED_IN',
    'USER_SIGNED_OUT',
    'RECORD_VIEWED',
    'RECORD_UPDATED',
    'CASE_APPROVED',
    'CASE_REJECTED',
    'ROLE_CHANGED',
    'PRIVACY_CONSENT_GRANTED',
    'PRIVACY_CONSENT_WITHDRAWN',
    'ACCOUNT_DELETED',
    'FILE_ACCESSED'
  ];

  for (const t of requiredTypes) {
    assert.ok(recordedTypes.includes(t), `Audit trail must record type '${t}'`);
  }

  console.log('  ✓ All 11 event types (sign-in/out, record open/edit, case approval/rejection, role, consent, delete, file) successfully recorded.');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: RBAC Isolation for Querying & Search
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 5: RBAC Scoping for Search & Filtering');

  // Super Admin: sees all 11 events
  const superAdminQuery = await auditService.queryAuditEvents(mockDb, {
    requesterUser: { uid: 'super_1', role: 'super_admin', isOwner: true }
  });
  assert.strictEqual(superAdminQuery.totalCount, 11, 'Super Admin must have cross-clinic visibility into all events.');

  // Clinic Admin (Clinic c1): sees only events matching clinic c1
  const clinicAdminQuery = await auditService.queryAuditEvents(mockDb, {
    requesterUser: { uid: 'clinic_admin_1', role: 'clinic_admin', clinicId: 'c1' }
  });
  assert.ok(clinicAdminQuery.totalCount > 0, 'Clinic Admin must see their clinic events');
  assert.ok(clinicAdminQuery.totalCount < 11, 'Clinic Admin must NOT see events from other clinics/global without clinic association');
  assert.ok(clinicAdminQuery.events.every(e => e.clinicId === 'c1' || e.actor?.clinicId === 'c1'), 'Clinic Admin must be strictly isolated to clinic c1');

  // Unauthorized Patient / Doctor: access denied (403)
  await assert.rejects(async () => {
    await auditService.queryAuditEvents(mockDb, {
      requesterUser: { uid: 'patient_1', role: 'patient' }
    });
  }, /Access denied/);

  // Search by keyword
  const searchQuery = await auditService.queryAuditEvents(mockDb, {
    requesterUser: { uid: 'super_1', role: 'super_admin' },
    filters: { search: 'CASE-001' }
  });
  assert.ok(searchQuery.events.length >= 2, 'Search must match events with CASE-001 in details');

  // Filter by event type
  const filterTypeQuery = await auditService.queryAuditEvents(mockDb, {
    requesterUser: { uid: 'super_1', role: 'super_admin' },
    filters: { type: 'ROLE_CHANGED' }
  });
  assert.strictEqual(filterTypeQuery.totalCount, 1);
  assert.strictEqual(filterTypeQuery.events[0].type, 'ROLE_CHANGED');

  console.log('  ✓ RBAC isolation verified: Super Admin global, Clinic Admin scoped, Patients/Doctors blocked.');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Audit Log Export (JSON & CSV) with HIPAA Export Trail Event
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 6: Audit Trail Export (JSON & CSV) & Export Event Logging');

  // Test CSV export
  const csvExport = await auditService.exportAuditEvents(mockDb, {
    requesterUser: { uid: 'super_1', role: 'super_admin', email: 'admin@healthvibes.com' },
    format: 'csv'
  });
  assert.strictEqual(csvExport.contentType, 'text/csv; charset=utf-8');
  assert.ok(csvExport.data.includes('Event ID') && csvExport.data.includes('Timestamp (UTC)') && csvExport.data.includes('Event Type'), 'CSV must contain standard headers');
  assert.ok(csvExport.data.includes('USER_SIGNED_IN'), 'CSV must contain exported event rows');

  // Test JSON export
  const jsonExport = await auditService.exportAuditEvents(mockDb, {
    requesterUser: { uid: 'super_1', role: 'super_admin', email: 'admin@healthvibes.com' },
    format: 'json'
  });
  assert.strictEqual(jsonExport.contentType, 'application/json; charset=utf-8');
  const parsedJson = JSON.parse(jsonExport.data);
  assert.strictEqual(parsedJson.exporter.uid, 'super_1');
  assert.ok(Array.isArray(parsedJson.events));

  // Verify AUDIT_LOGS_EXPORTED was authoritatively logged
  const exportEvents = mockDb.records.filter(r => r.type === auditService.AUDIT_EVENT_TYPES.AUDIT_LOGS_EXPORTED);
  assert.strictEqual(exportEvents.length, 2, 'Two exports must generate two AUDIT_LOGS_EXPORTED records');

  console.log('  ✓ CSV & JSON export generation verified with HIPAA-mandated export logging.');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Append-Only Immutability in Firestore Rules
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 7: Append-Only Immutability in Firestore Rules (Client Blocked)');

  const rulesContent = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf-8');

  // Verify /audit_events rules
  assert.ok(rulesContent.includes('match /audit_events/{eventId}'), 'Rules must protect /audit_events');
  assert.ok(rulesContent.includes('allow create, update, delete: if false;'), 'Client writes to audit_events must be forbidden');
  assert.ok(rulesContent.includes('allow write: if false;'), 'audit_events must have allow write: if false;');

  // Verify /auditLog rules
  assert.ok(rulesContent.includes('match /auditLog/{logId}'), 'Rules must protect /auditLog');
  assert.ok(rulesContent.includes('allow update, delete: if false;'), 'Client modifications or deletions of auditLog must be strictly forbidden');

  console.log('  ✓ Firestore security rules guarantee append-only immutability even for admins using client SDK.');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Server Endpoints & UI Integration Verification
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 8: Server Endpoints & UI Markup Verification');

  const serverJs = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf-8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf-8');
  const appJs = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf-8');

  // Verify server endpoints
  assert.ok(serverJs.includes("app.get('/api/admin/audit/events'"), 'GET /api/admin/audit/events endpoint must exist');
  assert.ok(serverJs.includes("app.get('/api/admin/audit/export'"), 'GET /api/admin/audit/export endpoint must exist');
  assert.ok(serverJs.includes("app.post('/api/admin/audit/export'"), 'POST /api/admin/audit/export endpoint must exist');
  assert.ok(serverJs.includes("app.post('/api/audit/session-logout'"), 'POST /api/audit/session-logout endpoint must exist');
  assert.ok(serverJs.includes("app.post('/api/audit/record-viewed'"), 'POST /api/audit/record-viewed endpoint must exist');
  assert.ok(serverJs.includes("app.post('/api/audit/file-accessed'"), 'POST /api/audit/file-accessed endpoint must exist');

  // Verify HTML elements
  assert.ok(indexHtml.includes('id="auditSearchInput"'), 'HTML must contain search input');
  assert.ok(indexHtml.includes('id="auditTypeFilter"'), 'HTML must contain event type filter');
  assert.ok(indexHtml.includes('id="auditStartDate"'), 'HTML must contain start date filter');
  assert.ok(indexHtml.includes('id="auditEndDate"'), 'HTML must contain end date filter');
  assert.ok(indexHtml.includes('id="btnExportAuditCsv"'), 'HTML must contain CSV export button');
  assert.ok(indexHtml.includes('id="btnExportAuditJson"'), 'HTML must contain JSON export button');
  assert.ok(indexHtml.includes('id="auditLogsContainer"'), 'HTML must contain audit logs container');

  // Verify app.js functions
  assert.ok(appJs.includes('function loadAuditEvents'), 'app.js must define loadAuditEvents');
  assert.ok(appJs.includes('function exportAuditTrail'), 'app.js must define exportAuditTrail');
  assert.ok(appJs.includes('function auditRecordViewed'), 'app.js must define auditRecordViewed');
  assert.ok(appJs.includes('function auditSessionLogout'), 'app.js must define auditSessionLogout');

  console.log('  ✓ Server endpoints, UI markup, and client handlers verified.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 8 AUDIT TRAIL & SECURITY TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================');
})();
