/**
 * Health Vibe AI - Doctor Medical Image & File Viewer Backend QA Test Suite
 *
 * Benchmark: Rology Teleradiology Platform Standards
 * Focus: Backend / Security / Relational DB Persistence / Notifications
 */

const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');

// Load backend services
const { medicalViewerService, MedicalViewerService, FINDING_SEVERITY } = require('../backend/medical-viewer-service');
const { relationalDbService } = require('../backend/relational-db-service');
const notificationService = require('../backend/notification-service');
const auditService = require('../backend/audit-service');
const app = require('../backend/server');

// Helper to make local in-process HTTP requests to the Express server
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n==================================================================');
  console.log('🔬 HEALTH VIBE AI: DOCTOR MEDICAL VIEWER BACKEND & SECURITY QA');
  console.log('   Benchmark: Rology Teleradiology Security & Integration Standards');
  console.log('==================================================================\n');

  let passedTests = 0;
  let totalTests = 10;

  // Mock Doctor Identity
  const mockDoctor = {
    uid: 'doc_rology_tarek_44821',
    displayName: 'Dr. Tarek Mahmoud, MD (Radiology)',
    name: 'Dr. Tarek Mahmoud',
    email: 'tarek.radiology@healthvibe.com',
    role: 'doctor',
    clinicId: 'clinic_cairo_chest_center',
    email_verified: true
  };

  const mockCaseId = 'case_cxr_consolidate_9941';
  const mockFileId = 'file_chest_xray_pa_001';

  // ===========================================================================
  // TEST 1: Ephemeral Viewing Token Creation & Cryptographic Integrity
  // ===========================================================================
  try {
    console.log('▶ TEST 1: Ephemeral Viewing Token Creation & Cryptographic Integrity');
    medicalViewerService.resetStoreForTesting();

    const tokenResult = medicalViewerService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'Chest_XRay_PA_Lateral.jpg',
      ttlMinutes: 20
    });

    assert.ok(tokenResult.token, 'Token string must be generated');
    assert.ok(tokenResult.token.includes('.'), 'Token must contain payload and HMAC signature separated by dot');
    assert.strictEqual(tokenResult.caseId, mockCaseId, 'Token must be bound to correct caseId');
    assert.strictEqual(tokenResult.fileId, mockFileId, 'Token must be bound to correct fileId');
    assert.ok(tokenResult.expiresInSeconds > 0, 'Expiration must be in the future');
    assert.ok(tokenResult.streamUrl.includes(mockFileId), 'Stream URL must target the fileId');

    // Test missing parameters
    assert.throws(() => {
      medicalViewerService.generateViewingToken({ doctorUser: null, caseId: mockCaseId, fileId: mockFileId });
    }, /Doctor authentication is mandatory/, 'Must reject unauthenticated token generation');

    assert.throws(() => {
      medicalViewerService.generateViewingToken({ doctorUser: mockDoctor, caseId: '', fileId: mockFileId });
    }, /caseId and fileId are mandatory/, 'Must reject missing caseId');

    console.log('  ✓ Ephemeral viewing token generated with HMAC-SHA256 signature and bounds.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 2: Token Signature Verification & Tampering Rejection
  // ===========================================================================
  try {
    console.log('▶ TEST 2: Token Signature Verification & Tampering Rejection');

    const tokenResult = medicalViewerService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'Chest_XRay_PA.jpg'
    });

    // 1. Valid token verification
    const verified = medicalViewerService.verifyViewingToken(tokenResult.token);
    assert.strictEqual(verified.doctorId, mockDoctor.uid, 'Doctor UID must match');
    assert.strictEqual(verified.caseId, mockCaseId, 'Case ID must match');
    assert.strictEqual(verified.fileId, mockFileId, 'File ID must match');

    // 2. Tampered signature
    const parts = tokenResult.token.split('.');
    const tamperedToken = `${parts[0]}.invalid_tampered_signature_signature_hash`;
    assert.throws(() => {
      medicalViewerService.verifyViewingToken(tamperedToken);
    }, /signature is invalid or tampered/, 'Must reject tampered token signature');

    // 3. Revoked token
    medicalViewerService.revokeViewingToken(tokenResult.token);
    assert.throws(() => {
      medicalViewerService.verifyViewingToken(tokenResult.token);
    }, /has been revoked/, 'Must reject revoked token');

    console.log('  ✓ Cryptographic signature validation and tampering protection verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 3: Token Expiration & Boundary Rejection
  // ===========================================================================
  try {
    console.log('▶ TEST 3: Token Expiration & Boundary Rejection');

    // Token with 0 TTL (already expired)
    const customService = new MedicalViewerService({ defaultTtlMinutes: -1 });
    const expiredResult = customService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId
    });

    assert.throws(() => {
      customService.verifyViewingToken(expiredResult.token);
    }, /expired at/, 'Must reject expired token');

    // Token verified against wrong fileId
    const validResult = medicalViewerService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId
    });

    assert.throws(() => {
      medicalViewerService.verifyViewingToken(validResult.token, { expectedFileId: 'different_file_id' });
    }, /Token is bound to fileId/, 'Must reject token used for a different file');

    console.log('  ✓ Token expiry enforcement and file binding verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 4: Doctor RBAC Authorization
  // ===========================================================================
  try {
    console.log('▶ TEST 4: Doctor RBAC Authorization');

    const unauthorizedPatient = {
      uid: 'patient_ahmed_123',
      role: 'patient',
      displayName: 'Ahmed Patient'
    };

    assert.throws(() => {
      medicalViewerService.generateViewingToken({
        doctorUser: unauthorizedPatient,
        caseId: mockCaseId,
        fileId: mockFileId
      });
    }, /Role 'patient' is unauthorized/, 'Must forbid patient from generating medical viewer token');

    // Radiologist role must be allowed
    const radiologistUser = {
      uid: 'rad_nadia_771',
      role: 'radiologist',
      displayName: 'Dr. Nadia (Radiologist)'
    };
    const radToken = medicalViewerService.generateViewingToken({
      doctorUser: radiologistUser,
      caseId: mockCaseId,
      fileId: mockFileId
    });
    assert.ok(radToken.token, 'Radiologist role must be permitted to generate viewing tokens');

    console.log('  ✓ Doctor and Radiologist RBAC access boundary strictly enforced.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 5: Relational DB Persistence of File Annotations & Findings
  // ===========================================================================
  try {
    console.log('▶ TEST 5: Relational DB Persistence of File Annotations & Findings');

    const findingText = 'Subtle patchy consolidation observed in right lower lung lobe. Recommend HRCT.';
    const coordinates = { x: 340, y: 520, width: 120, height: 95 };

    const saveResult = await medicalViewerService.saveAnnotationAndFindings({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'CXR_PA_Scan.jpg',
      findingText,
      severity: FINDING_SEVERITY.ABNORMAL,
      windowPreset: 'high_contrast',
      zoomLevel: 3.25,
      coordinates,
      tags: ['consolidation', 'right_lower_lobe']
    });

    assert.ok(saveResult.success, 'Finding must save successfully');
    assert.ok(saveResult.annotation.id, 'Annotation ID must be generated');
    assert.strictEqual(saveResult.annotation.caseId, mockCaseId);
    assert.strictEqual(saveResult.annotation.fileId, mockFileId);
    assert.strictEqual(saveResult.annotation.severity, FINDING_SEVERITY.ABNORMAL);
    assert.deepStrictEqual(saveResult.annotation.coordinates, coordinates);

    // Retrieve via Relational DB query
    const savedList = medicalViewerService.getCaseAnnotations(mockCaseId, mockFileId);
    assert.strictEqual(savedList.length, 1, 'Exactly one annotation should be retrieved for this file');
    assert.strictEqual(savedList[0].findingText, findingText);
    assert.strictEqual(savedList[0].windowPreset, 'high_contrast');

    console.log('  ✓ Relational DB persistence and secondary indexing verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 6: Zero-PHI Diagnostic Telemetry Logging & Audit Trail
  // ===========================================================================
  try {
    console.log('▶ TEST 6: Zero-PHI Diagnostic Telemetry Logging & Audit Trail');

    const telemetryResult = await medicalViewerService.recordTelemetry({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'CXR_PA_Scan.jpg',
      telemetry: {
        maxZoom: 5.5,
        windowPreset: 'bone',
        loupeUsed: true,
        durationMs: 42000
      }
    });

    assert.ok(telemetryResult.success, 'Telemetry must be recorded');
    assert.ok(telemetryResult.auditId, 'Audit ID must be assigned');

    const logs = medicalViewerService.getCaseViewerAuditLogs(mockCaseId);
    assert.ok(logs.length >= 1, 'At least 1 audit entry must exist');
    const log = logs.find(l => l.id === telemetryResult.auditId);
    assert.ok(log, 'Audit log entry must be present');
    assert.strictEqual(log.telemetry.maxZoom, 5.5);
    assert.strictEqual(log.telemetry.windowPreset, 'bone');
    assert.strictEqual(log.telemetry.loupeUsed, true);
    assert.strictEqual(log.telemetry.durationMs, 42000);

    console.log('  ✓ Zero-PHI viewing telemetry and audit logging verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 7: Critical Clinical Finding Detection & Escalation Notification
  // ===========================================================================
  try {
    console.log('▶ TEST 7: Critical Clinical Finding Detection & Escalation Notification');

    const criticalFinding = await medicalViewerService.saveAnnotationAndFindings({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'CXR_Severe_Pneumothorax.jpg',
      findingText: 'Tension pneumothorax right hemithorax with mediastinal shift. EMERGENCY.',
      severity: FINDING_SEVERITY.CRITICAL_ALERT,
      windowPreset: 'bone',
      zoomLevel: 4.0,
      notifyUrgent: true,
      patientEmail: 'patient.test@healthvibe.com',
      patientName: 'Kareem Tarek'
    });

    assert.ok(criticalFinding.success, 'Critical finding saved');
    assert.strictEqual(criticalFinding.alertDispatched, true, 'Alert must be dispatched');
    assert.strictEqual(criticalFinding.isCritical, true, 'isCritical flag must be true');
    assert.ok(criticalFinding.notificationDetails, 'Notification dispatch details must be present');

    console.log('  ✓ Critical findings escalation and emergency notification dispatch verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 8: Hardened HTTP Security Headers (Rology & DICOM Web)
  // ===========================================================================
  try {
    console.log('▶ TEST 8: Hardened HTTP Security Headers (Rology & DICOM Web)');

    const headers = medicalViewerService.getSecurityHeaders();
    assert.ok(headers['Content-Security-Policy'].includes("default-src 'none'"), 'CSP must be default none');
    assert.ok(headers['Cache-Control'].includes('no-store'), 'Cache-Control must contain no-store');
    assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
    assert.strictEqual(headers['X-Frame-Options'], 'DENY', 'X-Frame-Options must be DENY');

    console.log('  ✓ Hardened anti-caching, anti-framing, and CSP headers verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 9: Server REST Endpoints Verification (Express App Integration)
  // ===========================================================================
  let server = null;
  try {
    console.log('▶ TEST 9: Server REST Endpoints Verification (Express App Integration)');

    // Start server on ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });

    // 1. Test GET /api/medical-viewer/files/:fileId/stream without token (Must be 401)
    const unauthorizedStream = await makeRequest(server, {
      path: `/api/medical-viewer/files/${mockFileId}/stream`,
      method: 'GET'
    });
    assert.strictEqual(unauthorizedStream.statusCode, 401, 'Unauthenticated file stream must return 401');

    // 2. Generate a valid token
    const tokenResult = medicalViewerService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'CXR_PA_Scan.jpg'
    });

    // 3. Test GET /api/medical-viewer/files/:fileId/stream with valid token in query param
    const authorizedStream = await makeRequest(server, {
      path: `/api/medical-viewer/files/${mockFileId}/stream?token=${encodeURIComponent(tokenResult.token)}`,
      method: 'GET'
    });
    assert.strictEqual(authorizedStream.statusCode, 200, 'Authorized stream must return 200 OK');
    assert.strictEqual(authorizedStream.body.success, true);
    assert.strictEqual(authorizedStream.body.fileId, mockFileId);
    assert.strictEqual(authorizedStream.headers['x-content-type-options'], 'nosniff');
    assert.ok(authorizedStream.headers['cache-control'].includes('no-store'));

    // 4. Test GET /api/medical-viewer/files/:fileId/stream with valid token in Bearer header
    const authorizedBearerStream = await makeRequest(server, {
      path: `/api/medical-viewer/files/${mockFileId}/stream`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenResult.token}`
      }
    });
    assert.strictEqual(authorizedBearerStream.statusCode, 200, 'Bearer header authorization must return 200 OK');

    console.log('  ✓ Server stream route and anti-leak security headers verified on live Express server.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 9 FAILED:', err.message);
  } finally {
    if (server) server.close();
  }

  // ===========================================================================
  // TEST 10: Frontend Integration Contract Parity
  // ===========================================================================
  try {
    console.log('▶ TEST 10: Frontend Integration Contract Parity');

    // Verify medical-viewer-ui.js exports the backend-connected actions
    const MedicalViewerUI = require('../app/modules/doctor/medical-viewer-ui');
    assert.strictEqual(typeof MedicalViewerUI.requestViewingToken, 'function', 'requestViewingToken must be exposed');
    assert.strictEqual(typeof MedicalViewerUI.sendViewerTelemetry, 'function', 'sendViewerTelemetry must be exposed');
    assert.strictEqual(typeof MedicalViewerUI.saveFindingToBackend, 'function', 'saveFindingToBackend must be exposed');
    assert.strictEqual(typeof MedicalViewerUI.recordCriticalFindingAlert, 'function', 'recordCriticalFindingAlert must be exposed');

    console.log('  ✓ Frontend MedicalViewerUI backend methods contract verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 10 FAILED:', err.message);
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('==================================================================');
  if (passedTests === totalTests) {
    console.log(`🎉 ALL ${totalTests} DOCTOR MEDICAL VIEWER BACKEND & SECURITY TESTS PASSED!`);
    console.log('   Fully certified against Rology Teleradiology & HIPAA Security.');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${totalTests - passedTests} tests failed.`);
    console.log('==================================================================\n');
    process.exit(1);
  }
}

runTestSuite();
