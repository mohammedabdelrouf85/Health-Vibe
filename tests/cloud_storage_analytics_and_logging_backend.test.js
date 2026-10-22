/**
 * Health Vibe AI - Private Cloud Storage & Ephemeral Signed URLs Analytics & Logging Tests
 *
 * Benchmark: Amwell Telehealth Platform Standards (https://amwell.com/)
 * Scope: P3 - أولوية متوسطة | Backend / Security | المواعيد والشات بوت والملفات (المراقبة وتحليلات الاستخدام (Analytics & Logging))
 *
 * Test Matrix:
 * 1. EVENT_TYPES registry and Zero-PHI telemetry payload validation.
 * 2. Upload telemetry tracking (attempts, successes, failures, encryption mode).
 * 3. Anti-malware scanning metrics (clean rate, threat blocks, scan latency).
 * 4. Ephemeral Signed URLs telemetry (issuances, verifications, expired drops, revocations).
 * 5. Multi-touchpoint attribution (appointment dossiers, chatbot cards, patient vault).
 * 6. Zero-Trust cross-patient privacy breach logging & HIPAA compliance.
 * 7. KPI aggregation engine (calculateSecureStorageKpis & getSecureStorageAnalytics) with "Unavailable" / "غير متاح" fallbacks.
 * 8. REST API endpoints RBAC authorization (401, 403, 200).
 * 9. Bilingual presentation and Amwell compliance benchmark metadata.
 */

'use strict';

const assert = require('assert');
const analyticsService = require('../backend/analytics-service');
const {
  CloudStorageSignedUrlsService,
  cloudStorageSignedUrlsService,
  SCAN_STATUS,
  ENCRYPTION_MODES
} = require('../backend/cloud-storage-signed-urls-service');

const app = require('../backend/server');

console.log('\n==================================================================');
console.log('🧪 HEALTH VIBE AI: SECURE STORAGE ANALYTICS & LOGGING TEST SUITE');
console.log('   Benchmark: Amwell Standard (Analytics, Telemetry & Admin KPIs)');
console.log('==================================================================\n');

async function runTests() {
  // Mock Users
  const patientUser = { uid: 'pt_analytics_001', role: 'patient' };
  const doctorUser = { uid: 'doc_analytics_001', role: 'doctor', displayName: 'Dr. Sarah Amwell' };
  const adminUser = { uid: 'admin_analytics_001', role: 'super_admin' };
  const intruderUser = { uid: 'pt_intruder_999', role: 'patient' };

  // ==================================================================
  // TEST 1: EVENT_TYPES Registry & Zero-PHI Telemetry Sanity
  // ==================================================================
  console.log('▶ TEST 1: EVENT_TYPES Registry & Zero-PHI Telemetry Sanity');
  {
    analyticsService.resetAnalyticsState();

    const expectedEvents = [
      'SECURE_STORAGE_UPLOAD_ATTEMPT',
      'SECURE_STORAGE_UPLOAD_SUCCESS',
      'SECURE_STORAGE_UPLOAD_FAILURE',
      'SECURE_STORAGE_SCAN_CLEAN',
      'SECURE_STORAGE_SCAN_BLOCKED',
      'SECURE_STORAGE_SIGNED_URL_ISSUED',
      'SECURE_STORAGE_SIGNED_URL_VERIFIED',
      'SECURE_STORAGE_SIGNED_URL_EXPIRED',
      'SECURE_STORAGE_TOKEN_REVOKED',
      'SECURE_STORAGE_TOUCHPOINT_LINKED',
      'SECURE_STORAGE_TOUCHPOINT_ACCESSED',
      'SECURE_STORAGE_PRIVACY_BREACH_BLOCKED',
      'SECURE_STORAGE_FILE_DELETED'
    ];

    for (const evt of expectedEvents) {
      assert.ok(
        analyticsService.EVENT_TYPES[evt],
        `EVENT_TYPES.${evt} must be defined in analytics-service.`
      );
    }

    // Operational telemetry recording succeeds
    const opResult = analyticsService.recordEvent({
      eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_SUCCESS,
      userId: patientUser.uid,
      payload: {
        fileId: 'sec_test_001',
        fileCategory: 'lab_analysis',
        fileSize: 1048576,
        encryptionMode: 'AES-256-GCM',
        source: 'patient_vault'
      }
    });
    assert.strictEqual(opResult.success, true, 'Operational telemetry event must record successfully.');

    // Prohibited clinical medical text / PHI rejection guard
    assert.throws(() => {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_SUCCESS,
        userId: patientUser.uid,
        payload: {
          fileId: 'sec_test_002',
          diagnosis: 'Acute Bronchitis', // FORBIDDEN KEY
          fileSize: 500000
        }
      });
    }, /MEDICAL_TEXT_PROHIBITED/, 'Telemetry must strictly reject events containing clinical diagnosis keys.');

    assert.throws(() => {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_SUCCESS,
        userId: patientUser.uid,
        payload: {
          fileId: 'sec_test_003',
          symptoms: 'Severe dyspnea and wheezing' // FORBIDDEN KEY
        }
      });
    }, /MEDICAL_TEXT_PROHIBITED/, 'Telemetry must strictly reject events containing clinical symptoms keys.');

    console.log('  ✓ EVENT_TYPES registered and Zero-PHI guard strictly enforced.');
  }

  // ==================================================================
  // TEST 2: Private Upload Telemetry & 100% AES-256 Encryption Tracking
  // ==================================================================
  console.log('▶ TEST 2: Private Upload Telemetry & 100% AES-256 Encryption Tracking');
  {
    analyticsService.resetAnalyticsState();
    cloudStorageSignedUrlsService.resetStoreForTesting();

    // 1. Successful upload
    const uploaded = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: patientUser.uid,
      fileName: 'cbc_blood_panel.pdf',
      fileSize: 2 * 1024 * 1024,
      mimeType: 'application/pdf',
      category: 'lab_analysis',
      source: 'patient_vault'
    });

    assert.ok(uploaded.fileId);
    assert.strictEqual(uploaded.encryption.mode, 'AES-256-GCM');

    const recorded = analyticsService.getInMemoryEvents();
    const attempts = recorded.filter(e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_ATTEMPT);
    const successes = recorded.filter(e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_SUCCESS);

    assert.strictEqual(attempts.length >= 1, true, 'SECURE_STORAGE_UPLOAD_ATTEMPT must be recorded.');
    assert.strictEqual(successes.length >= 1, true, 'SECURE_STORAGE_UPLOAD_SUCCESS must be recorded.');
    assert.strictEqual(successes[0].payload.encryptionMode, 'AES-256-GCM');
    assert.strictEqual(successes[0].payload.fileSize, 2 * 1024 * 1024);

    // 2. Failed upload (e.g. prohibited extension)
    try {
      await cloudStorageSignedUrlsService.registerPrivateUpload({
        patientId: patientUser.uid,
        fileName: 'malicious_script.exe',
        fileSize: 1024,
        category: 'lab_analysis'
      });
      assert.fail('Should have thrown on executable file.');
    } catch (_) {}

    const failures = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_FAILURE
    );
    assert.strictEqual(failures.length >= 1, true, 'SECURE_STORAGE_UPLOAD_FAILURE must be recorded for blocked uploads.');
    assert.strictEqual(failures[0].payload.reason, 'BLOCKED_EXTENSION');

    console.log('  ✓ Upload attempts, successes, failures, and AES-256 encryption status logged.');
  }

  // ==================================================================
  // TEST 3: Anti-Malware Scanning Telemetry (Clean vs Blocked)
  // ==================================================================
  console.log('▶ TEST 3: Anti-Malware Scanning Telemetry (Clean vs Blocked)');
  {
    analyticsService.resetAnalyticsState();
    cloudStorageSignedUrlsService.resetStoreForTesting();

    // 1. Upload clean file
    const file1 = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: patientUser.uid,
      fileName: 'chest_ct_scan.png',
      fileSize: 5 * 1024 * 1024,
      category: 'radiology_ct'
    });

    const cleanScans = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_SCAN_CLEAN
    );
    assert.strictEqual(cleanScans.length >= 1, true, 'SECURE_STORAGE_SCAN_CLEAN must be recorded.');
    assert.strictEqual(cleanScans[0].payload.engine, 'ClamAV-Cloud-Engine-v2026');
    assert.ok(typeof cleanScans[0].payload.scanDurationMs === 'number');

    // 2. Direct simulation of blocked malware threat
    cloudStorageSignedUrlsService._filesStore.set('threat_file_001', {
      fileId: 'threat_file_001',
      patientId: patientUser.uid,
      fileName: 'virus.exe.png',
      scanStatus: SCAN_STATUS.SCANNING
    });

    await cloudStorageSignedUrlsService.scanFileForMalware('threat_file_001');

    const blockedScans = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_SCAN_BLOCKED
    );
    assert.strictEqual(blockedScans.length >= 1, true, 'SECURE_STORAGE_SCAN_BLOCKED must be recorded for threats.');
    assert.strictEqual(blockedScans[0].payload.threatType, 'Prohibited.Executable.Payload');

    console.log('  ✓ Anti-malware clean pass and threat quarantine telemetry verified.');
  }

  // ==================================================================
  // TEST 4: Ephemeral Signed URLs & Kill-Switch Telemetry
  // ==================================================================
  console.log('▶ TEST 4: Ephemeral Signed URLs & Kill-Switch Telemetry');
  {
    analyticsService.resetAnalyticsState();
    cloudStorageSignedUrlsService.resetStoreForTesting();

    const file = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: patientUser.uid,
      fileName: 'lung_xray.png',
      fileSize: 3 * 1024 * 1024,
      category: 'radiology_cxr'
    });

    // 1. Issue signed URL
    const signed = cloudStorageSignedUrlsService.generateSignedUrl({
      fileId: file.fileId,
      requestingUser: doctorUser,
      ttlSeconds: 900
    });
    assert.ok(signed.signedUrl);

    const issuedEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_ISSUED
    );
    assert.strictEqual(issuedEvents.length >= 1, true, 'SECURE_STORAGE_SIGNED_URL_ISSUED must be logged.');
    assert.strictEqual(issuedEvents[0].payload.requesterRole, 'doctor');
    assert.strictEqual(issuedEvents[0].payload.ttlSeconds, 900);

    // 2. Verify token
    const verifyRes = cloudStorageSignedUrlsService.verifySignedToken(file.fileId, signed.token, doctorUser);
    assert.strictEqual(verifyRes.valid, true);

    const verifiedEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_VERIFIED
    );
    assert.strictEqual(verifiedEvents.length >= 1, true, 'SECURE_STORAGE_SIGNED_URL_VERIFIED must be logged.');

    // 3. Expired token simulation
    const expiredToken = `${file.fileId}.${Math.floor(Date.now() / 1000) - 100}.nonce123.sig123`;
    const expVerify = cloudStorageSignedUrlsService.verifySignedToken(file.fileId, expiredToken, doctorUser);
    assert.strictEqual(expVerify.valid, false);
    assert.strictEqual(expVerify.error, 'SIGNED_URL_EXPIRED');

    const expiredEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_EXPIRED
    );
    assert.strictEqual(expiredEvents.length >= 1, true, 'SECURE_STORAGE_SIGNED_URL_EXPIRED must be logged.');

    // 4. Revocation kill-switch
    const revoked = cloudStorageSignedUrlsService.revokeSignedToken(signed.token);
    assert.strictEqual(revoked, true);

    const revokedEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_TOKEN_REVOKED
    );
    assert.strictEqual(revokedEvents.length >= 1, true, 'SECURE_STORAGE_TOKEN_REVOKED must be logged.');

    console.log('  ✓ Token issuances, verifications, expiration drops, and kill-switch revocations logged.');
  }

  // ==================================================================
  // TEST 5: Multi-Touchpoint Attribution (Appointments, Chatbot, Vault)
  // ==================================================================
  console.log('▶ TEST 5: Multi-Touchpoint Attribution (Appointments, Chatbot, Vault)');
  {
    analyticsService.resetAnalyticsState();
    cloudStorageSignedUrlsService.resetStoreForTesting();

    // 1. Upload in Vault
    const f1 = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: patientUser.uid,
      fileName: 'lab_results.pdf',
      fileSize: 1024 * 1024,
      category: 'lab_analysis',
      source: 'patient_vault'
    });

    // 2. Link to Appointment
    await cloudStorageSignedUrlsService.linkFileToAppointment({
      fileId: f1.fileId,
      appointmentId: 'appt_tele_123',
      requestingUser: patientUser
    });

    // 3. Link to Chat Session
    await cloudStorageSignedUrlsService.linkFileToChatSession({
      fileId: f1.fileId,
      sessionId: 'chat_sess_456',
      requestingUser: patientUser
    });

    // 4. Generate Chatbot Context
    cloudStorageSignedUrlsService.generateChatbotSecureContext(patientUser.uid, { lang: 'ar' });

    const touchpointEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_TOUCHPOINT_LINKED ||
           e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_TOUCHPOINT_ACCESSED
    );

    assert.strictEqual(touchpointEvents.length >= 3, true, 'All touchpoint interactions must be captured.');

    const kpis = analyticsService.calculateSecureStorageKpis(analyticsService.getInMemoryEvents());
    assert.strictEqual(kpis.touchpoints.appointments >= 1, true, 'Appointment touchpoint counted.');
    assert.strictEqual(kpis.touchpoints.chatbot >= 1, true, 'Chatbot touchpoint counted.');

    console.log('  ✓ Multi-touchpoint attribution across appointments, chatbot, and vault confirmed.');
  }

  // ==================================================================
  // TEST 6: Zero-Trust HIPAA Privacy Compliance & Cross-Patient Breach Logs
  // ==================================================================
  console.log('▶ TEST 6: Zero-Trust HIPAA Privacy Compliance & Cross-Patient Breach Logs');
  {
    analyticsService.resetAnalyticsState();
    cloudStorageSignedUrlsService.resetStoreForTesting();

    const file = await cloudStorageSignedUrlsService.registerPrivateUpload({
      patientId: patientUser.uid,
      fileName: 'patient_mri.png',
      fileSize: 4 * 1024 * 1024,
      category: 'radiology_ct'
    });

    // Intruder attempts cross-patient access
    const boundaryCheck = cloudStorageSignedUrlsService.verifyPatientPrivacyBoundary({
      fileId: file.fileId,
      requestingUser: intruderUser
    });

    assert.strictEqual(boundaryCheck.allowed, false);
    assert.strictEqual(boundaryCheck.reason, 'CROSS_PATIENT_PRIVACY_VIOLATION');

    const breachEvents = analyticsService.getInMemoryEvents().filter(
      e => e.eventType === analyticsService.EVENT_TYPES.SECURE_STORAGE_PRIVACY_BREACH_BLOCKED
    );
    assert.strictEqual(breachEvents.length >= 1, true, 'SECURE_STORAGE_PRIVACY_BREACH_BLOCKED must be logged.');
    assert.strictEqual(breachEvents[0].payload.violatingRole, 'patient');

    // Confirm no patient PII is stored in the breach telemetry event
    assert.strictEqual(breachEvents[0].payload.patientName, undefined);
    assert.strictEqual(breachEvents[0].payload.diagnosis, undefined);

    console.log('  ✓ Cross-patient unauthorized breaches intercepted and logged with Zero-PHI.');
  }

  // ==================================================================
  // TEST 7: KPI Aggregator Engine (calculateSecureStorageKpis & Edge Cases)
  // ==================================================================
  console.log('▶ TEST 7: KPI Aggregator Engine (calculateSecureStorageKpis & Edge Cases)');
  {
    analyticsService.resetAnalyticsState();

    // 1. Empty state verification: Denominators are 0 -> returns "Unavailable" / "غير متاح"
    const emptyKpis = analyticsService.calculateSecureStorageKpis([]);
    assert.strictEqual(emptyKpis.kpis.uploadSuccessRate.rate, null);
    assert.strictEqual(emptyKpis.kpis.uploadSuccessRate.display, 'Unavailable');
    assert.strictEqual(emptyKpis.kpis.uploadSuccessRate.displayAr, 'غير متاح');
    assert.strictEqual(emptyKpis.kpis.encryptionComplianceRate.rate, null);
    assert.strictEqual(emptyKpis.kpis.cleanScanRate.rate, null);

    // 2. Populated state verification
    // 4 successful uploads, 1 failure
    for (let i = 0; i < 4; i++) {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_ATTEMPT,
        payload: { fileId: `file_${i}`, size: 1048576, category: 'lab_analysis' }
      });
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_SUCCESS,
        payload: {
          fileId: `file_${i}`,
          fileCategory: i === 0 ? 'lab_analysis' : i === 1 ? 'radiology_cxr' : i === 2 ? 'radiology_ct' : 'prescription_doc',
          fileSize: 1048576,
          encryptionMode: 'AES-256-GCM',
          source: 'patient_vault'
        }
      });
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_SCAN_CLEAN,
        payload: { fileId: `file_${i}`, scanDurationMs: 40 }
      });
    }

    analyticsService.recordEvent({
      eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_ATTEMPT,
      payload: { fileId: 'file_fail_01', size: 1024, category: 'other' }
    });
    analyticsService.recordEvent({
      eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_UPLOAD_FAILURE,
      payload: { fileId: 'file_fail_01', reason: 'BLOCKED_EXTENSION' }
    });

    // 3 verified tokens, 1 expired token
    for (let i = 0; i < 3; i++) {
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_ISSUED,
        payload: { fileId: `file_${i}`, ttlSeconds: 900, requesterRole: 'doctor' }
      });
      analyticsService.recordEvent({
        eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_VERIFIED,
        payload: { fileId: `file_${i}`, remainingSeconds: 600 }
      });
    }
    analyticsService.recordEvent({
      eventType: analyticsService.EVENT_TYPES.SECURE_STORAGE_SIGNED_URL_EXPIRED,
      payload: { fileId: 'file_expired', tokenPrefix: 'tok_exp' }
    });

    const calculated = analyticsService.calculateSecureStorageKpis(analyticsService.getInMemoryEvents());

    // Upload success rate: 4 successes / 5 attempts = 80%
    assert.strictEqual(calculated.kpis.uploadSuccessRate.rate, 80);
    assert.strictEqual(calculated.kpis.uploadSuccessRate.formatted, '80%');

    // Encryption compliance rate: 100% of successful files are encrypted
    assert.strictEqual(calculated.kpis.encryptionComplianceRate.rate, 100);
    assert.strictEqual(calculated.kpis.encryptionComplianceRate.formatted, '100%');

    // Clean scan rate: 4 clean / 4 scans = 100%
    assert.strictEqual(calculated.kpis.cleanScanRate.rate, 100);

    // Signed URLs verification success rate: 3 / (3 + 1) = 75%
    assert.strictEqual(calculated.kpis.signedUrlVerificationSuccessRate.rate, 75);
    assert.strictEqual(calculated.kpis.signedUrlExpirationRate.rate, 25);

    // Total storage volume check
    assert.strictEqual(calculated.summary.totalStorageBytes, 4 * 1048576);
    assert.strictEqual(calculated.summary.totalStorageFormatted, '4 MB');

    // Helper method getSecureStorageAnalytics()
    const helperResult = analyticsService.getSecureStorageAnalytics();
    assert.strictEqual(helperResult.kpis.uploadSuccessRate.rate, 80);

    console.log('  ✓ KPI calculations, percentage numerators/denominators, and fallbacks validated.');
  }

  // ==================================================================
  // TEST 8: REST API Endpoints Verification (RBAC & Responses)
  // ==================================================================
  console.log('▶ TEST 8: REST API Endpoints Verification (RBAC & Responses)');
  {
    // Helper to simulate express route call
    const testRoute = (path, method, user, query = {}) => {
      return new Promise((resolve) => {
        const req = {
          url: path,
          method,
          headers: user && user.token ? { authorization: `Bearer ${user.token}` } : {},
          query,
          body: {}
        };
        const res = {
          _status: 200,
          _json: null,
          status(code) { this._status = code; return this; },
          json(data) { this._json = data; resolve({ status: this._status, body: data }); }
        };

        // Find the route in express router
        const layer = app._router.stack.find(
          s => s.route && s.route.path === path && s.route.methods[method.toLowerCase()]
        );
        if (!layer) {
          return resolve({ status: 404, body: { error: 'ROUTE_NOT_FOUND' } });
        }

        const stack = layer.route.stack;
        if (!user) {
          // Unauthenticated: invoke requireAuth middleware (stack[0])
          stack[0].handle(req, res, () => {});
        } else {
          // Authenticated: attach verified user and invoke handler
          req.user = user;
          const handler = stack[stack.length - 1];
          handler.handle(req, res, () => {});
        }
      });
    };

    // 1. Unauthenticated request -> 401
    const unauth = await testRoute('/api/analytics/secure-storage', 'GET', null);
    assert.strictEqual(unauth.status, 401, 'Unauthenticated request to analytics must return 401.');

    // 2. Unauthorized role (regular patient without admin privileges) -> 403
    const forbidden = await testRoute('/api/analytics/secure-storage', 'GET', patientUser);
    assert.strictEqual(forbidden.status, 403, 'Patient user must receive 403 Forbidden for admin storage analytics.');
    assert.strictEqual(forbidden.body.error, 'FORBIDDEN');

    // 3. Authorized Super Admin -> 200
    const adminRes = await testRoute('/api/analytics/secure-storage', 'GET', adminUser);
    assert.strictEqual(adminRes.status, 200, 'Admin user must receive 200 OK for storage analytics.');
    assert.strictEqual(adminRes.body.success, true);
    assert.ok(adminRes.body.summary);
    assert.ok(adminRes.body.kpis);
    assert.ok(adminRes.body.touchpoints);
    assert.ok(adminRes.body.amwellBenchmark);

    // 4. Authorized Doctor -> 200
    const docRes = await testRoute('/api/storage/analytics/kpis', 'GET', doctorUser);
    assert.strictEqual(docRes.status, 200, 'Doctor user must receive 200 OK for storage analytics alias.');
    assert.strictEqual(docRes.body.success, true);

    console.log('  ✓ REST API RBAC enforcement (401 unauth, 403 patient, 200 admin/doctor) verified.');
  }

  // ==================================================================
  // TEST 9: Bilingual Parity & Amwell Benchmark Standards
  // ==================================================================
  console.log('▶ TEST 9: Bilingual Parity & Amwell Benchmark Standards');
  {
    const kpis = analyticsService.calculateSecureStorageKpis(analyticsService.getInMemoryEvents());

    // Amwell Benchmark specifications
    const benchmark = kpis.amwellBenchmark;
    assert.strictEqual(benchmark.platformStandard, 'Amwell Telehealth Secure Storage Standard');
    assert.strictEqual(benchmark.encryptionProtocol, 'AES-256-GCM / Cloud KMS at Rest');
    assert.strictEqual(benchmark.defaultSignedUrlTtlSeconds, 900);
    assert.strictEqual(benchmark.defaultSignedUrlTtlDisplay, '15 Minutes / 15 دقيقة');
    assert.strictEqual(benchmark.antivirusEngine, 'ClamAV-Cloud-Engine-v2026');
    assert.strictEqual(benchmark.zeroPhiTelemetryCertified, true);
    assert.strictEqual(benchmark.humanDoctorReviewGate, true);

    // Bilingual display for metrics
    assert.ok(kpis.summary.avgScanDurationDisplay.includes('ms'));
    assert.ok(kpis.summary.avgScanDurationDisplayAr.includes('ملي ثانية'));

    for (const kpiKey of Object.keys(kpis.kpis)) {
      const metric = kpis.kpis[kpiKey];
      assert.ok(metric.name, `${kpiKey} must have an English name`);
      assert.ok(metric.displayAr, `${kpiKey} must have an Arabic display`);
      assert.ok(metric.display, `${kpiKey} must have an English display`);
    }

    console.log('  ✓ 100% Bilingual parity and Amwell benchmark certification verified.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 9 SECURE STORAGE ANALYTICS & LOGGING TESTS PASSED (100%)!');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER EXCEPTION:', err);
  process.exit(1);
});
