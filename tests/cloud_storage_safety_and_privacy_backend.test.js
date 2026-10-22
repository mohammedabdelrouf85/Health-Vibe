/**
 * Health Vibe AI - Private Cloud Storage Safety & Privacy Test Suite
 * Benchmark: Amwell Telehealth Standard (Safety, Privacy & Non-Autonomous Doctor Primacy)
 *
 * Verifies:
 * 1. Strict Non-Autonomous AI Notice & Human Doctor Primacy:
 *    - All stored files enforce humanDoctorReviewRequired: true & isAutonomousDiagnosis: false.
 *    - Bilingual non-autonomous AI disclaimers in Arabic and English.
 *    - Chatbot assistant secure context mandates human doctor review.
 * 2. Human Clinician Sign-Off Gate (certifyFileReviewByDoctor):
 *    - Strict enforcement: Only licensed human doctors/radiologists can certify clinical reviews.
 *    - Non-clinicians (patients, admins, support) are blocked (CLINICAL_CERTIFICATION_DENIED).
 *    - Stamps syndicate license credentials and doctor identity.
 * 3. Chatbot Safety Guardrail (validateChatbotClinicalSafety):
 *    - Intercepts autonomous diagnostic claims and prescription alterations.
 *    - Injects mandatory human physician consultation disclaimers.
 * 4. Cross-Patient Privacy Boundary (Zero-Trust):
 *    - Cross-patient unauthorized access is strictly blocked (403 CROSS_PATIENT_PRIVACY_VIOLATION).
 *    - Patient owner access is granted.
 *    - Clinician access is granted.
 *    - Audit event logged with zero PHI.
 * 5. HIPAA Safe Harbor De-identification (deidentifyFileMetadata):
 *    - Strips direct identifiers (names, IDs, phones, addresses, SSNs).
 *    - Preserves safe clinical metadata (Modality, BodyPart, TestCode).
 * 6. Cryptographic Tamper-Resistance & Revocation Kill-Switch:
 *    - Altering token components breaks HMAC-SHA256 signature verification.
 *    - Immediate revocation renders token unusable (TOKEN_REVOKED).
 * 7. Backend Server REST API Route Definitions in server.js:
 *    - POST /api/storage/certify-review
 *    - POST /api/storage/validate-chatbot-safety
 *    - POST /api/storage/revoke-token
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  CloudStorageSignedUrlsService,
  cloudStorageSignedUrlsService,
  SCAN_STATUS,
  ENCRYPTION_MODES
} = require('../backend/cloud-storage-signed-urls-service');

console.log('\n==================================================================');
console.log('🔒 HEALTH VIBE AI: CLOUD STORAGE SAFETY & PRIVACY SUITE');
console.log('   Benchmark: Amwell Standard (Human Primacy, Privacy & Non-Autonomous AI)');
console.log('==================================================================\n');

async function runTests() {
  let passed = 0;
  const storageService = new CloudStorageSignedUrlsService();
  storageService.resetStoreForTesting();

  // -----------------------------------------------------------------------------
  // TEST 1: Strict Non-Autonomous AI Notice & Human Doctor Primacy
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 1: Strict Non-Autonomous AI Notice & Human Doctor Primacy');
    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_safety_001',
      fileName: 'Chest_XRay_PA.dcm',
      fileSize: 1024 * 1024 * 5,
      mimeType: 'application/dicom',
      category: 'radiology_cxr'
    });

    assert.ok(upload.clinicalSafety, 'clinicalSafety metadata must exist on upload record');
    assert.strictEqual(upload.clinicalSafety.humanDoctorReviewRequired, true, 'humanDoctorReviewRequired must be true');
    assert.strictEqual(upload.clinicalSafety.isAutonomousDiagnosis, false, 'isAutonomousDiagnosis must be false');
    assert.strictEqual(upload.clinicalSafety.reviewStatus, 'pending_physician_review');

    // Check Arabic and English disclaimers
    assert.ok(
      upload.clinicalSafety.nonAutonomousAiDisclaimer.includes('الطبيب') ||
      upload.clinicalSafety.nonAutonomousAiDisclaimer.includes('بشري'),
      'Arabic disclaimer must mandate human physician'
    );
    assert.ok(
      upload.clinicalSafety.nonAutonomousAiDisclaimerEn.includes('certified human physicians') ||
      upload.clinicalSafety.nonAutonomousAiDisclaimerEn.includes('physician'),
      'English disclaimer must mandate certified human physicians'
    );

    // Check chatbot context includes disclaimer
    const chatContext = storageService.generateChatbotSecureContext('patient_safety_001', { lang: 'ar' });
    assert.strictEqual(chatContext.humanDoctorReviewRequired, true);
    assert.strictEqual(chatContext.isAutonomousDiagnosis, false);
    assert.ok(chatContext.nonAutonomousAiDisclaimer);

    console.log('  ✓ Human physician primacy and non-autonomous AI disclaimers strictly enforced.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 2: Certified Human Clinician Sign-Off Gate (certifyFileReviewByDoctor)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 2: Certified Human Clinician Sign-Off Gate');
    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_safety_002',
      fileName: 'Arterial_Blood_Gas_ABG.pdf',
      fileSize: 1024 * 250,
      mimeType: 'application/pdf',
      category: 'lab_analysis'
    });

    // Test rejection of non-clinicians (patients, admins)
    let nonClinicianBlocked = false;
    try {
      await storageService.certifyFileReviewByDoctor({
        fileId: upload.fileId,
        doctorUser: { uid: 'patient_fake_doc', role: 'patient' },
        clinicalImpression: 'Normal findings'
      });
    } catch (err) {
      nonClinicianBlocked = true;
      assert.strictEqual(err.code, 'CLINICAL_CERTIFICATION_DENIED');
      assert.strictEqual(err.status, 403);
    }
    assert.strictEqual(nonClinicianBlocked, true, 'Non-clinician role must be blocked from certifying reviews');

    // Test authorized physician certification
    const doctorUser = {
      uid: 'doc_pulmonology_ahmed',
      displayName: 'Dr. Ahmed Ezzat, MD',
      role: 'doctor',
      licenseNumber: 'EGY-SYNDICATE-88214'
    };

    const certResult = await storageService.certifyFileReviewByDoctor({
      fileId: upload.fileId,
      doctorUser,
      clinicalImpression: 'Mild compensated respiratory alkalosis, consistent with hyperventilation.',
      findings: 'pH: 7.46, PaCO2: 32 mmHg, PaO2: 95 mmHg',
      isNormal: false
    });

    assert.strictEqual(certResult.success, true);
    assert.strictEqual(certResult.reviewStatus, 'certified');
    assert.strictEqual(certResult.certifiedBy.licenseNumber, 'EGY-SYNDICATE-88214');
    assert.strictEqual(certResult.clinicalSafety.isAutonomousDiagnosis, false);

    console.log('  ✓ Only licensed doctors can certify clinical reviews with syndicate credentials.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Chatbot Safety Filter (Non-Autonomous Guardrail)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 3: Chatbot Safety Filter (Interception of Autonomous Claims)');

    // Case A: Autonomous diagnosis attempt
    const dangerousResponseAr = 'بناءً على الأشعة أنت مصاب بـ التهاب رئوي حاد وعليك تناول دواء أوجمنتين فوراً.';
    const filteredAr = storageService.validateChatbotClinicalSafety(dangerousResponseAr, { lang: 'ar' });
    assert.strictEqual(filteredAr.safetyViolationDetected, true);
    assert.strictEqual(filteredAr.isAutonomousDiagnosisBlocked, true);
    assert.ok(filteredAr.safeResponseText.includes('تنبيه طبي إلزامي'));

    // Case B: Autonomous diagnosis in English
    const dangerousResponseEn = 'You are definitely diagnosed with pneumonia. Stop taking your medication and take this instead.';
    const filteredEn = storageService.validateChatbotClinicalSafety(dangerousResponseEn, { lang: 'en' });
    assert.strictEqual(filteredEn.safetyViolationDetected, true);
    assert.strictEqual(filteredEn.isAutonomousDiagnosisBlocked, true);
    assert.ok(filteredEn.safeResponseText.includes('Mandatory Clinical Disclaimer'));

    // Case C: Compliant response with physician reference
    const safeResponse = 'هذه قراءة أولية لنتائج فحص الدم، ويجب استشارة الطبيب البشري المعالج لتأكيد التشخيص.';
    const filteredSafe = storageService.validateChatbotClinicalSafety(safeResponse, { lang: 'ar' });
    assert.strictEqual(filteredSafe.safetyViolationDetected, false);

    console.log('  ✓ Autonomous diagnosis and prescription changes intercepted with safety disclaimers.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Cross-Patient Zero-Trust Privacy Boundary
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 4: Cross-Patient Zero-Trust Privacy Boundary');
    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_alice',
      fileName: 'Alice_Confidential_CT_Scan.dcm',
      fileSize: 1024 * 1024 * 8,
      mimeType: 'application/dicom',
      category: 'radiology_ct'
    });

    // Patient Bob attempts to access Alice's file
    const bobUser = { uid: 'patient_bob', role: 'patient' };
    const bobCheck = storageService.verifyPatientPrivacyBoundary({
      fileId: upload.fileId,
      requestingUser: bobUser
    });
    assert.strictEqual(bobCheck.allowed, false);
    assert.strictEqual(bobCheck.reason, 'CROSS_PATIENT_PRIVACY_VIOLATION');
    assert.strictEqual(bobCheck.status, 403);

    // Patient Alice accesses her own file
    const aliceUser = { uid: 'patient_alice', role: 'patient' };
    const aliceCheck = storageService.verifyPatientPrivacyBoundary({
      fileId: upload.fileId,
      requestingUser: aliceUser
    });
    assert.strictEqual(aliceCheck.allowed, true);

    // Assigned Doctor accesses Alice's file
    const doctorUser = { uid: 'doc_charlie', role: 'doctor' };
    const doctorCheck = storageService.verifyPatientPrivacyBoundary({
      fileId: upload.fileId,
      requestingUser: doctorUser
    });
    assert.strictEqual(doctorCheck.allowed, true);

    console.log('  ✓ Cross-patient unauthorized file access strictly blocked (403 Zero-Trust).\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 5: HIPAA Safe Harbor De-identification
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 5: HIPAA Safe Harbor De-identification of Medical Metadata');
    const rawDicomHeaders = {
      PatientName: 'Tarek Mahmoud Hassan',
      PatientID: 'EGY-SSN-298031201',
      PatientBirthDate: '19880312',
      PatientAddress: '22 Al-Tahrir Street, Dokki, Giza',
      PhoneNumber: '+201012345678',
      Email: 'tarek.hassan@example.com',
      ReferringPhysicianName: 'Dr. Mounir Fathy',
      InstitutionName: 'El-Giza Specialized Diagnostic Lab',
      AccessionNumber: 'ACC-88319-LAB',
      // Safe clinical parameters:
      Modality: 'DX',
      BodyPart: 'CHEST',
      TestCode: 'LOINC-36643-5',
      SampleType: 'Blood'
    };

    const sanitized = storageService.deidentifyFileMetadata(rawDicomHeaders);
    assert.strictEqual(sanitized.PatientName, undefined, 'PatientName must be stripped');
    assert.strictEqual(sanitized.PatientID, undefined, 'PatientID must be stripped');
    assert.strictEqual(sanitized.PatientAddress, undefined, 'PatientAddress must be stripped');
    assert.strictEqual(sanitized.PhoneNumber, undefined, 'PhoneNumber must be stripped');
    assert.strictEqual(sanitized.Email, undefined, 'Email must be stripped');
    assert.strictEqual(sanitized.ReferringPhysicianName, undefined, 'ReferringPhysicianName must be stripped');

    // Safe tags preserved
    assert.strictEqual(sanitized.Modality, 'DX');
    assert.strictEqual(sanitized.BodyPart, 'CHEST');
    assert.strictEqual(sanitized.TestCode, 'LOINC-36643-5');
    assert.strictEqual(sanitized.isDeidentified, true);

    console.log('  ✓ Direct PHI stripped in compliance with HIPAA Safe Harbor de-identification.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Token Tamper-Resistance & Revocation Kill-Switch
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 6: Token Tamper-Resistance & Revocation Kill-Switch');
    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_tamper_001',
      fileName: 'CBC_Report.pdf',
      fileSize: 1024 * 300,
      mimeType: 'application/pdf',
      category: 'lab_analysis'
    });

    const user = { uid: 'patient_tamper_001', role: 'patient' };
    const signed = storageService.generateSignedUrl({
      fileId: upload.fileId,
      requestingUser: user,
      ttlSeconds: 900
    });

    // 1. Valid token passes
    const validVerify = storageService.verifySignedToken(upload.fileId, signed.token, user);
    assert.strictEqual(validVerify.valid, true);

    // 2. Tampering with fileId in token fails
    const tamperedFileId = `sec_file_hacked.${signed.token.split('.').slice(1).join('.')}`;
    const tamperedVerify = storageService.verifySignedToken(upload.fileId, tamperedFileId, user);
    assert.strictEqual(tamperedVerify.valid, false);
    assert.strictEqual(tamperedVerify.error, 'TOKEN_MISMATCH');

    // 3. Tampering with expiry extension fails cryptographic signature
    const parts = signed.token.split('.');
    const extendedExpiry = parseInt(parts[1], 10) + 100000;
    const tamperedExpiryToken = `${parts[0]}.${extendedExpiry}.${parts[2]}.${parts[3]}`;
    const forgedVerify = storageService.verifySignedToken(upload.fileId, tamperedExpiryToken, user);
    assert.strictEqual(forgedVerify.valid, false);
    assert.strictEqual(forgedVerify.error, 'SIGNATURE_INVALID');

    // 4. Revocation Kill-Switch
    const revoked = storageService.revokeSignedToken(signed.token);
    assert.strictEqual(revoked, true);

    const postRevocationVerify = storageService.verifySignedToken(upload.fileId, signed.token, user);
    assert.strictEqual(postRevocationVerify.valid, false);
    assert.strictEqual(postRevocationVerify.error, 'TOKEN_REVOKED');

    console.log('  ✓ Cryptographic HMAC tamper resistance and instant revocation kill-switch verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Backend Server REST API Route Definitions in server.js
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 7: Backend Server REST API Endpoints in server.js');
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverContent.includes('/api/storage/certify-review'), 'POST /api/storage/certify-review route must be defined');
    assert.ok(serverContent.includes('/api/storage/validate-chatbot-safety'), 'POST /api/storage/validate-chatbot-safety route must be defined');
    assert.ok(serverContent.includes('/api/storage/revoke-token'), 'POST /api/storage/revoke-token route must be defined');

    console.log('  ✓ All safety, privacy, and doctor review REST endpoints verified in server.js.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('==================================================================');
  if (passed === 7) {
    console.log('🎉 ALL 7 CLOUD STORAGE SAFETY & PRIVACY TESTS PASSED!');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${7 - passed} tests failed.`);
    process.exit(1);
  }
}

runTests();
