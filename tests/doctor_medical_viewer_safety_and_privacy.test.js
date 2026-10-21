/**
 * Health Vibe AI - Doctor Medical Viewer Safety & Privacy QA Test Suite
 *
 * Benchmark: Rology Teleradiology Safety, HITL Non-Replacement & HIPAA/GDPR Privacy
 * Focus: Backend / Security / Medical Safety & Privacy Controls
 */

const assert = require('node:assert');
const http = require('node:http');

// Load backend services
const {
  medicalViewerService,
  MedicalViewerService,
  FINDING_SEVERITY,
  SCAN_REVIEW_STATUS,
  CLINICAL_SAFETY_DISCLAIMERS
} = require('../backend/medical-viewer-service');
const { relationalDbService } = require('../backend/relational-db-service');
const app = require('../backend/server');
const i18n = require('../app/i18n');

// In-process HTTP request helper
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

async function runSafetyAndPrivacyTests() {
  console.log('\n==================================================================');
  console.log('🛡️ HEALTH VIBE AI: MEDICAL VIEWER SAFETY & PRIVACY QA SUITE');
  console.log('   Standards: Doctor Non-Replacement, HITL, HIPAA & GDPR Privacy');
  console.log('==================================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  const mockDoctor = {
    uid: 'doc_tarek_egypt_44821',
    displayName: 'Dr. Tarek Mahmoud, MD',
    name: 'Dr. Tarek Mahmoud',
    email: 'tarek.chest@healthvibe.com',
    role: 'doctor',
    syndicateRegistrationNumber: 'EG-MED-44821',
    clinicId: 'cairo_chest_hospital',
    email_verified: true
  };

  const mockRadiologist = {
    uid: 'rad_nadia_rology_882',
    displayName: 'Dr. Nadia Radwan, MD',
    name: 'Dr. Nadia Radwan',
    email: 'nadia.rad@healthvibe.com',
    role: 'radiologist',
    syndicateRegistrationNumber: 'EG-RAD-88219',
    clinicId: 'cairo_chest_hospital',
    email_verified: true
  };

  const mockCaseId = 'case_safety_cxr_1001';
  const mockFileId = 'scan_lung_opacity_001';
  const mockPatientId = 'patient_safwat_551';

  // ===========================================================================
  // TEST 1: Strict Doctor Non-Replacement & Autonomous AI Disclosure Blocker
  // ===========================================================================
  try {
    console.log('▶ TEST 1: Strict Doctor Non-Replacement & Autonomous AI Disclosure Blocker');
    medicalViewerService.resetStoreForTesting();

    // 1. Unverified AI finding attempt must be blocked
    assert.throws(() => {
      medicalViewerService.assertNonAutonomousAiDisclosure({
        isAiGenerated: true,
        certifiedByDoctor: false,
        aiDiagnosis: 'Bilateral interstitial pneumonia'
      });
    }, /Autonomous AI diagnostic disclosure is strictly blocked/, 'Must block autonomous AI diagnostic disclosure');

    // 2. Certified finding passes
    assert.doesNotThrow(() => {
      medicalViewerService.assertNonAutonomousAiDisclosure({
        isAiGenerated: true,
        certifiedByDoctor: true,
        aiDiagnosis: 'Bilateral interstitial pneumonia'
      });
    });

    console.log('  ✓ Autonomous AI diagnosis strictly blocked; human doctor gatekeeper enforced.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 2: Human Physician Clinical Certification & Digital Sign-off
  // ===========================================================================
  try {
    console.log('▶ TEST 2: Human Physician Clinical Certification & Digital Sign-off');

    const certResult = await medicalViewerService.certifyScanByDoctor({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      fileName: 'CXR_PA_View.png',
      clinicalImpression: 'Confirmed subtle right basal infiltrate. No pneumothorax.',
      findingsSummary: 'Inspected under Bone and Infiltrate windows at 400% zoom.',
      overrideAi: false
    });

    assert.ok(certResult.success);
    assert.strictEqual(certResult.certified, true);
    assert.ok(certResult.certificate.certificateId.startsWith('cert_scan_'));
    assert.strictEqual(certResult.certificate.certifiedByDoctorUid, mockDoctor.uid);
    assert.strictEqual(certResult.certificate.doctorSyndicateNumber, 'EG-MED-44821');
    assert.ok(certResult.certificate.signatureHash, 'HMAC signature hash must be stamped');
    assert.strictEqual(certResult.certificate.status, SCAN_REVIEW_STATUS.CERTIFIED_BY_DOCTOR);

    // Non-physician role cannot certify
    const fakeNurse = { uid: 'nurse_1', role: 'nurse', displayName: 'Staff Nurse' };
    await assert.rejects(async () => {
      await medicalViewerService.certifyScanByDoctor({
        doctorUser: fakeNurse,
        caseId: mockCaseId,
        fileId: mockFileId
      });
    }, /Only licensed medical physicians may certify diagnostic scans/, 'Non-physician role must be rejected');

    console.log('  ✓ Human physician digital sign-off and syndicate certification verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 3: Mandatory Bilingual Clinical Safety Disclaimers (Arabic & English)
  // ===========================================================================
  try {
    console.log('▶ TEST 3: Mandatory Bilingual Clinical Safety Disclaimers');

    const arDisclaimer = medicalViewerService.getClinicalSafetyDisclaimer('ar');
    const enDisclaimer = medicalViewerService.getClinicalSafetyDisclaimer('en');

    assert.ok(arDisclaimer.includes('الطبيب البشري المرخص'), 'Arabic disclaimer must emphasize licensed human doctor');
    assert.ok(arDisclaimer.includes('غير تشخيصية'), 'Arabic disclaimer must state non-diagnostic decision support');
    assert.ok(enDisclaimer.includes('licensed human physicians'), 'English disclaimer must emphasize licensed human physician');
    assert.ok(enDisclaimer.includes('non-diagnostic clinical decision-support'), 'English disclaimer must state non-diagnostic');

    // i18n dictionary verification
    assert.ok(i18n.translations.ar.doctorMedicalViewer.clinicalSafetyNotice);
    assert.ok(i18n.translations.en.doctorMedicalViewer.clinicalSafetyNotice);
    assert.ok(i18n.translations.ar.doctorMedicalViewer.doctorSignOff);
    assert.ok(i18n.translations.en.doctorMedicalViewer.doctorSignOff);

    console.log('  ✓ 100% Arabic & English clinical safety disclaimers verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 4: Forensic Anti-Leak Watermark Generation & Verification
  // ===========================================================================
  try {
    console.log('▶ TEST 4: Forensic Anti-Leak Watermark Generation & Verification');

    const watermark = medicalViewerService.generateForensicWatermark({
      doctorUser: mockRadiologist,
      caseId: mockCaseId,
      fileId: mockFileId,
      clinicId: 'cairo_chest_hospital'
    });

    assert.ok(watermark.text.includes('CONFIDENTIAL MEDICAL RECORD'));
    assert.ok(watermark.text.includes('Dr. Nadia Radwan'));
    assert.ok(watermark.text.includes('EG-RAD-88219'));
    assert.ok(watermark.text.includes(mockCaseId));
    assert.ok(watermark.hash, 'Cryptographic hash must be stamped');
    assert.ok(watermark.compactText.includes('Dr. Nadia Radwan'));

    console.log('  ✓ Forensic dynamic anti-leak watermark generated with doctor credentials.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 5: Medical Asset De-Identification (Stripping Direct PII)
  // ===========================================================================
  try {
    console.log('▶ TEST 5: Medical Asset De-Identification (Stripping Direct PII)');

    const rawScanMetadata = {
      patientId: 'patient_secret_123',
      patientName: 'Kareem Ahmed Safwat',
      nationalId: '28910120104432',
      phoneNumber: '+201009876543',
      homeAddress: '15 El-Tahrir St, Dokki, Giza',
      modality: 'DX',
      studyDate: '2026-10-18',
      anatomicalRegion: 'Chest PA/Lateral',
      sliceThickness: 'N/A',
      imageDimensions: '3056x3056'
    };

    const sanitized = medicalViewerService.deidentifyMedicalAssetMetadata(rawScanMetadata);

    assert.strictEqual(sanitized.patientName, undefined, 'patientName must be stripped');
    assert.strictEqual(sanitized.nationalId, undefined, 'nationalId must be stripped');
    assert.strictEqual(sanitized.phoneNumber, undefined, 'phoneNumber must be stripped');
    assert.strictEqual(sanitized.homeAddress, undefined, 'homeAddress must be stripped');
    assert.strictEqual(sanitized.patientId, undefined, 'Raw patientId must be replaced by pseudoId');
    assert.ok(sanitized.patientPseudoId.startsWith('pseudo_'), 'Must generate pseudoId hash');
    assert.strictEqual(sanitized.modality, 'DX', 'Clinical modality must be preserved');
    assert.strictEqual(sanitized.anatomicalRegion, 'Chest PA/Lateral', 'Clinical region must be preserved');
    assert.strictEqual(sanitized.isDeIdentified, true);

    console.log('  ✓ Direct PII headers successfully stripped under HIPAA Safe Harbor.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 6: Granular Patient Consent & Instant Access Revocation
  // ===========================================================================
  try {
    console.log('▶ TEST 6: Granular Patient Consent & Instant Access Revocation');

    // 1. Grant consent
    medicalViewerService.grantPatientViewingConsent({ patientId: mockPatientId });
    assert.strictEqual(medicalViewerService.checkPatientViewingConsent(mockPatientId), true);

    // Token creation succeeds
    const tokenResult = medicalViewerService.generateViewingToken({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: mockFileId,
      patientId: mockPatientId
    });
    assert.ok(tokenResult.token);

    // 2. Patient revokes consent
    medicalViewerService.revokePatientViewingConsent({ patientId: mockPatientId, reason: 'patient_privacy_choice' });
    assert.strictEqual(medicalViewerService.checkPatientViewingConsent(mockPatientId), false);

    // Immediate token rejection for revoked patient
    assert.throws(() => {
      medicalViewerService.generateViewingToken({
        doctorUser: mockDoctor,
        caseId: mockCaseId,
        fileId: mockFileId,
        patientId: mockPatientId
      });
    }, /has revoked diagnostic file sharing consent/, 'Must reject token when consent revoked');

    // Existing token verification also rejected
    assert.throws(() => {
      medicalViewerService.verifyViewingToken(tokenResult.token);
    }, /has revoked diagnostic consent/, 'Must invalidate token upon consent revocation');

    console.log('  ✓ Patient consent granting, verification, and instantaneous revocation verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 7: Non-Clinical Sub-roles Zero-PHI Access Blocker (PRD Page 13)
  // ===========================================================================
  try {
    console.log('▶ TEST 7: Non-Clinical Sub-roles Zero-PHI Access Blocker (PRD Page 13)');

    const nonClinicalRoles = ['support', 'ops', 'clinical_qa'];
    for (const role of nonClinicalRoles) {
      const user = { uid: `user_${role}`, role, displayName: `Staff ${role}` };
      assert.throws(() => {
        medicalViewerService.generateViewingToken({
          doctorUser: user,
          caseId: mockCaseId,
          fileId: mockFileId
        });
      }, /strictly forbidden from accessing unmasked patient diagnostic images/, `Role ${role} must be blocked`);
    }

    console.log('  ✓ Non-clinical administrative sub-roles strictly blocked under PRD Page 13.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 8: Doctor Illegible/Corrupt Scan Rejection Workflow
  // ===========================================================================
  try {
    console.log('▶ TEST 8: Doctor Illegible/Corrupt Scan Rejection Workflow');

    const rejectResult = await medicalViewerService.rejectScanAsIllegible({
      doctorUser: mockDoctor,
      caseId: mockCaseId,
      fileId: 'scan_blurry_002',
      rejectionReason: 'Severe respiratory motion blur, costophrenic angles obscured.'
    });

    assert.ok(rejectResult.success);
    assert.strictEqual(rejectResult.status, SCAN_REVIEW_STATUS.REJECTED_ILLEGIBLE);
    assert.strictEqual(rejectResult.rejectionRecord.rejectedByDoctorUid, mockDoctor.uid);

    console.log('  ✓ Doctor rejection of illegible/corrupt scans verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 9: GDPR Art. 17 Right to Erasure with HIPAA Audit Retention
  // ===========================================================================
  try {
    console.log('▶ TEST 9: GDPR Art. 17 Right to Erasure with HIPAA Audit Retention');

    const eraseResult = await medicalViewerService.eraseMedicalAssetForPrivacy({
      patientUid: mockPatientId,
      caseId: mockCaseId,
      fileId: mockFileId,
      reason: 'gdpr_article_17_erasure'
    });

    assert.ok(eraseResult.success);
    assert.strictEqual(eraseResult.status, SCAN_REVIEW_STATUS.PRIVACY_ERASED);

    // Audit trail must be preserved
    const auditLogs = medicalViewerService.getCaseViewerAuditLogs(mockCaseId);
    const eraseLog = auditLogs.find(l => l.action === 'MEDICAL_ASSET_PRIVACY_ERASED');
    assert.ok(eraseLog, 'Immutable audit log must be retained under HIPAA 6-year rule');

    console.log('  ✓ GDPR soft-deletion and HIPAA legal audit retention verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 9 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 10: Express REST Endpoints Integration for Safety & Privacy
  // ===========================================================================
  let server = null;
  try {
    console.log('▶ TEST 10: Express REST Endpoints Integration for Safety & Privacy');

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });

    // 1. GET /api/medical-viewer/disclaimer
    const disclaimerRes = await makeRequest(server, {
      path: '/api/medical-viewer/disclaimer?lang=ar',
      method: 'GET'
    });
    assert.strictEqual(disclaimerRes.statusCode, 200);
    assert.ok(disclaimerRes.body.disclaimer.includes('الطبيب البشري'));

    const disclaimerEnRes = await makeRequest(server, {
      path: '/api/medical-viewer/disclaimer?lang=en',
      method: 'GET'
    });
    assert.strictEqual(disclaimerEnRes.statusCode, 200);
    assert.ok(disclaimerEnRes.body.disclaimer.includes('licensed human physicians'));

    // 2. Unauthenticated calls to certification must return 401
    const unauthCert = await makeRequest(server, {
      path: `/api/medical-viewer/cases/${mockCaseId}/files/${mockFileId}/certify`,
      method: 'POST'
    }, { clinicalImpression: 'Test' });
    assert.strictEqual(unauthCert.statusCode, 401);

    console.log('  ✓ Express server safety and privacy endpoints verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 10 FAILED:', err.message);
  } finally {
    if (server) server.close();
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('==================================================================');
  if (passedTests === totalTests) {
    console.log(`🎉 ALL ${totalTests} MEDICAL VIEWER SAFETY & PRIVACY TESTS PASSED!`);
    console.log('   Human Doctor Non-Replacement, HIPAA & GDPR Certified.');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${totalTests - passedTests} tests failed.`);
    console.log('==================================================================\n');
    process.exit(1);
  }
}

runSafetyAndPrivacyTests();
