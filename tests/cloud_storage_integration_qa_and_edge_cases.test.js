/**
 * Health Vibe AI - Private Cloud Storage & Ephemeral Signed URLs Integration QA & Edge Cases Test Suite
 * Benchmark: Amwell Telehealth Standard (Appointments, Chatbot & Patient Files)
 *
 * Comprehensive QA & Medical Research Validation:
 * 1. End-to-End Appointment Flow: Multi-file pre-visit attachments, doctor review gate, signed URLs, certification.
 * 2. End-to-End Chatbot Flow: Chat session attachments, context generation (AR/EN), clinical safety filters.
 * 3. File Intake Boundary Conditions: 0-byte, 25MB boundary, 25MB+1B overflow, empty filenames.
 * 4. Anti-Malware Deep Defense: Executable blocks, disguised payloads (.exe.pdf), permanent quarantine, urgent alerts.
 * 5. Cryptographic Token Security Matrix: Valid verification, time forgery, signature tampering, expiration, kill-switch revocation.
 * 6. Zero-Trust Privacy & HIPAA Safe Harbor: Cross-patient isolation, non-clinical certification blocker, direct PII de-identification.
 * 7. Relational Database & Notifications Integration: Foreign key relationships, secondary indexing, audit logging, PRD Page 16 guard.
 * 8. 100% Bilingual Arabic / English Parity: Notifications, safety disclaimers, and i18n catalogs.
 * 9. RESTful API Server Endpoint Verification in server.js.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  CloudStorageSignedUrlsService,
  cloudStorageSignedUrlsService,
  SCAN_STATUS,
  ENCRYPTION_MODES
} = require('../backend/cloud-storage-signed-urls-service');

const { relationalDbService, RelationalDatabaseService } = require('../backend/relational-db-service');
const notificationService = require('../backend/notification-service');
const { translations } = require('../app/i18n.js');

console.log('\n==================================================================');
console.log('🧪 HEALTH VIBE AI: CLOUD STORAGE INTEGRATION QA & EDGE CASES');
console.log('   Benchmark: Amwell Standard (Appointments, Chatbot & Files)');
console.log('==================================================================\n');

async function runQaSuite() {
  let passed = 0;
  const storageService = new CloudStorageSignedUrlsService({
    relationalDb: relationalDbService,
    notificationService: notificationService
  });

  // -----------------------------------------------------------------------------
  // TEST 1: End-to-End Appointment Flow (Pre-Consultation Dossier & Signed URLs)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 1: End-to-End Appointment Flow (Pre-Visit Dossier & Doctor Review)');
    storageService.resetStoreForTesting();
    notificationService.clearNotificationHistoryLog();

    const patientId = 'patient_qa_appt_1';
    const appointmentId = 'appt_qa_visit_2026';

    // 1. Upload blood test and CT scan for an appointment
    const labFile = await storageService.registerPrivateUpload({
      patientId,
      fileName: 'Comprehensive_Metabolic_Panel.pdf',
      fileSize: 1024 * 512,
      mimeType: 'application/pdf',
      category: 'lab_analysis',
      appointmentId,
      source: 'appointment'
    });

    const ctScan = await storageService.registerPrivateUpload({
      patientId,
      fileName: 'Chest_HighRes_CT.dcm',
      fileSize: 1024 * 1024 * 12,
      mimeType: 'application/dicom',
      category: 'radiology_ct',
      appointmentId,
      source: 'appointment'
    });

    assert.strictEqual(labFile.scanStatus, SCAN_STATUS.CLEAN);
    assert.strictEqual(ctScan.scanStatus, SCAN_STATUS.CLEAN);
    assert.strictEqual(labFile.encryption.mode, ENCRYPTION_MODES.AES_256_GCM);

    // 2. Query appointment files from relational DB
    const apptFiles = relationalDbService.getSecureMedicalFilesByAppointment(appointmentId);
    assert.strictEqual(apptFiles.length, 2, 'Both files must be indexed by appointmentId in relational DB');

    // 3. Attending doctor generates ephemeral signed URL
    const doctorUser = {
      uid: 'doc_pulm_hassan',
      role: 'doctor',
      displayName: 'Dr. Hassan El-Kholy, MD',
      licenseNumber: 'EGY-DOC-77123'
    };

    const signedLab = storageService.generateSignedUrl({
      fileId: labFile.fileId,
      requestingUser: doctorUser,
      ttlSeconds: 900
    });
    assert.strictEqual(signedLab.success, true);
    assert.ok(signedLab.signedUrl.includes(labFile.fileId));
    assert.ok(signedLab.ttlSeconds <= 900);

    // 4. Attending doctor certifies clinical review
    const certLab = await storageService.certifyFileReviewByDoctor({
      fileId: labFile.fileId,
      doctorUser,
      clinicalImpression: 'Normal electrolytes and kidney function. Suitable for planned bronchoscopy.',
      findings: 'eGFR: 92 mL/min, Creatinine: 0.9 mg/dL',
      isNormal: true
    });

    assert.strictEqual(certLab.success, true);
    assert.strictEqual(certLab.reviewStatus, 'certified');
    assert.strictEqual(certLab.certifiedBy.licenseNumber, 'EGY-DOC-77123');

    // 5. Patient notification history check
    const { notifications: patientNotifs } = await notificationService.getUserNotificationHistory(null, patientId);
    assert.ok(patientNotifs.length >= 2, 'Patient must have received upload and result notifications');

    console.log('  ✓ Pre-consultation packaging, signed URLs, and doctor certification passed end-to-end.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 2: End-to-End Chatbot Flow (Chat Session & Bilingual Clinical Safety)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 2: End-to-End Chatbot Flow (Session Context & Bilingual Safety)');
    const patientId = 'patient_qa_chat_1';
    const sessionId = 'chat_qa_session_99';

    const prescriptionFile = await storageService.registerPrivateUpload({
      patientId,
      fileName: 'Doctor_Prescription_Symbicort.jpg',
      fileSize: 1024 * 350,
      mimeType: 'image/jpeg',
      category: 'prescription',
      sessionId,
      source: 'chatbot'
    });

    // 1. Relational DB lookup by chatbot session
    const sessionFiles = relationalDbService.getSecureMedicalFilesByChatSession(sessionId);
    assert.strictEqual(sessionFiles.length, 1);
    assert.strictEqual(sessionFiles[0].id, prescriptionFile.fileId);

    // 2. Chatbot Assistant secure context in Arabic & English
    const chatContextAr = storageService.generateChatbotSecureContext(patientId, { lang: 'ar' });
    assert.strictEqual(chatContextAr.humanDoctorReviewRequired, true);
    assert.strictEqual(chatContextAr.isAutonomousDiagnosis, false);
    assert.ok(chatContextAr.nonAutonomousAiDisclaimer.includes('الطبيب'));
    assert.ok(chatContextAr.filesSummary.includes('مشفر في Private Cloud Bucket'));

    const chatContextEn = storageService.generateChatbotSecureContext(patientId, { lang: 'en' });
    assert.strictEqual(chatContextEn.humanDoctorReviewRequired, true);
    assert.ok(chatContextEn.nonAutonomousAiDisclaimer.includes('certified human physicians'));
    assert.ok(chatContextEn.filesSummary.includes('Encrypted in Private Bucket'));

    // 3. Clinical Safety Filter Interception: Autonomous claim in Arabic
    const dangerousAr = 'بناءً على الروشتة المرفوعة أنت مصاب بـ أزمة ربوية وعليك تناول دواء بلميكورت مرتين يومياً.';
    const filterAr = storageService.validateChatbotClinicalSafety(dangerousAr, { lang: 'ar' });
    assert.strictEqual(filterAr.safetyViolationDetected, true);
    assert.strictEqual(filterAr.isAutonomousDiagnosisBlocked, true);
    assert.ok(filterAr.safeResponseText.includes('تنبيه طبي إلزامي'));

    // 4. Clinical Safety Filter Interception: Autonomous claim in English
    const dangerousEn = 'I diagnose you with severe acute bronchitis. Change your dosage to 400mcg.';
    const filterEn = storageService.validateChatbotClinicalSafety(dangerousEn, { lang: 'en' });
    assert.strictEqual(filterEn.safetyViolationDetected, true);
    assert.ok(filterEn.safeResponseText.includes('Mandatory Clinical Disclaimer'));

    console.log('  ✓ Chatbot session linking, bilingual clinical context, and safety filters verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 3: File Intake Boundary Conditions (0B, 25MB, 25MB+1B, Empty Names)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 3: File Intake Boundary Conditions (0B, 25MB, 25MB+1B, Empty Names)');

    // 1. Zero-byte file
    let zeroByteRejected = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_boundary',
        fileName: 'empty_lab_file.pdf',
        fileSize: 0,
        mimeType: 'application/pdf'
      });
    } catch (err) {
      zeroByteRejected = true;
      assert.ok(err.message.includes('greater than 0'));
    }
    assert.strictEqual(zeroByteRejected, true, '0-byte file must be rejected');

    // 2. Negative file size
    let negativeSizeRejected = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_boundary',
        fileName: 'negative_size.pdf',
        fileSize: -100,
        mimeType: 'application/pdf'
      });
    } catch (err) {
      negativeSizeRejected = true;
    }
    assert.strictEqual(negativeSizeRejected, true, 'Negative size must be rejected');

    // 3. Overflow file size (25MB + 1 byte = 26214401 bytes)
    let overflowRejected = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_boundary',
        fileName: 'huge_radiology_scan.dcm',
        fileSize: 25 * 1024 * 1024 + 1,
        mimeType: 'application/dicom'
      });
    } catch (err) {
      overflowRejected = true;
      assert.ok(err.message.includes('not exceed 25MB'));
    }
    assert.strictEqual(overflowRejected, true, 'File exceeding 25MB boundary must be rejected');

    // 4. Exact 25MB boundary (26214400 bytes)
    const exactMaxUpload = await storageService.registerPrivateUpload({
      patientId: 'patient_boundary',
      fileName: 'full_boundary_ct_scan.dcm',
      fileSize: 25 * 1024 * 1024,
      mimeType: 'application/dicom',
      category: 'radiology_ct'
    });
    assert.strictEqual(exactMaxUpload.fileSize, 25 * 1024 * 1024);
    assert.strictEqual(exactMaxUpload.scanStatus, SCAN_STATUS.CLEAN);

    // 5. Missing fileName or patientId
    let missingNameRejected = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_boundary',
        fileName: '',
        fileSize: 1024
      });
    } catch (err) {
      missingNameRejected = true;
    }
    assert.strictEqual(missingNameRejected, true, 'Empty fileName must be rejected');

    console.log('  ✓ File intake boundary conditions (0B, 25MB, 25MB+1B, empty name) verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Anti-Malware Deep Defense & Disguised Payloads (.exe.pdf)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 4: Anti-Malware Deep Defense & Disguised Payloads');

    // 1. Direct executable extension (.exe)
    let directExeBlocked = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_malware_test',
        fileName: 'trojan_installer.exe',
        fileSize: 1024 * 100,
        mimeType: 'application/octet-stream'
      });
    } catch (err) {
      directExeBlocked = true;
      assert.ok(err.message.includes('strictly prohibited'));
    }
    assert.strictEqual(directExeBlocked, true);

    // 2. Direct script extension (.sh)
    let shellScriptBlocked = false;
    try {
      await storageService.registerPrivateUpload({
        patientId: 'patient_malware_test',
        fileName: 'exploit_script.sh',
        fileSize: 1024,
        mimeType: 'text/plain'
      });
    } catch (err) {
      shellScriptBlocked = true;
    }
    assert.strictEqual(shellScriptBlocked, true);

    // 3. Disguised double-extension payload: fake_lab_report.exe.pdf
    storageService._filesStore.set('sec_disguised_trojan', {
      fileId: 'sec_disguised_trojan',
      fileName: 'fake_lab_report.exe.pdf',
      patientId: 'patient_malware_target',
      fileSize: 1024 * 80
    });

    const scanResult = await storageService.scanFileForMalware('sec_disguised_trojan');
    assert.strictEqual(scanResult.scanStatus, SCAN_STATUS.INFECTED);
    assert.strictEqual(scanResult.availability, 'blocked');
    assert.strictEqual(scanResult.malwareScanResult.actionTaken, 'QUARANTINE_PERMANENT');

    // 4. Verify urgent security notification was sent
    const { notifications: threatNotifs } = await notificationService.getUserNotificationHistory(null, 'patient_malware_target');
    assert.ok(threatNotifs.some(n => n.eventType === notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_THREAT && n.urgent === true));

    console.log('  ✓ Direct executables blocked, disguised payloads quarantined & urgent alerts sent.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Cryptographic Token Security & Anti-Tampering Matrix
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 5: Cryptographic Token Security & Anti-Tampering Matrix');

    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_crypto_test',
      fileName: 'Biochemistry_Panel.pdf',
      fileSize: 1024 * 400,
      mimeType: 'application/pdf',
      category: 'lab_analysis'
    });

    const requester = { uid: 'patient_crypto_test', role: 'patient' };
    const signed = storageService.generateSignedUrl({
      fileId: upload.fileId,
      requestingUser: requester,
      ttlSeconds: 900
    });

    // 1. Valid token succeeds
    const checkValid = storageService.verifySignedToken(upload.fileId, signed.token, requester);
    assert.strictEqual(checkValid.valid, true);
    assert.ok(checkValid.remainingSeconds > 0);

    // 2. Tampered file ID
    const forgedFileIdToken = `sec_other_file.${signed.token.split('.').slice(1).join('.')}`;
    const checkForgedFile = storageService.verifySignedToken(upload.fileId, forgedFileIdToken, requester);
    assert.strictEqual(checkForgedFile.valid, false);
    assert.strictEqual(checkForgedFile.error, 'TOKEN_MISMATCH');

    // 3. Expiration extension forgery
    const parts = signed.token.split('.');
    const extendedExpiry = parseInt(parts[1], 10) + 86400; // +1 day
    const forgedExpiryToken = `${parts[0]}.${extendedExpiry}.${parts[2]}.${parts[3]}`;
    const checkForgedExpiry = storageService.verifySignedToken(upload.fileId, forgedExpiryToken, requester);
    assert.strictEqual(checkForgedExpiry.valid, false);
    assert.strictEqual(checkForgedExpiry.error, 'SIGNATURE_INVALID');

    // 4. Altered signature hash
    const tamperedHashToken = `${parts[0]}.${parts[1]}.${parts[2]}.badf00dbadf00d112233445566778899`;
    const checkTamperedHash = storageService.verifySignedToken(upload.fileId, tamperedHashToken, requester);
    assert.strictEqual(checkTamperedHash.valid, false);
    assert.strictEqual(checkTamperedHash.error, 'SIGNATURE_INVALID');

    // 5. Expired token simulation
    const pastExpiry = Math.floor(Date.now() / 1000) - 100;
    const expiredToken = `${upload.fileId}.${pastExpiry}.nonce123.sig123`;
    const checkExpired = storageService.verifySignedToken(upload.fileId, expiredToken, requester);
    assert.strictEqual(checkExpired.valid, false);
    assert.strictEqual(checkExpired.error, 'SIGNED_URL_EXPIRED');

    // 6. Kill-Switch Instant Revocation
    storageService.revokeSignedToken(signed.token);
    const checkRevoked = storageService.verifySignedToken(upload.fileId, signed.token, requester);
    assert.strictEqual(checkRevoked.valid, false);
    assert.strictEqual(checkRevoked.error, 'TOKEN_REVOKED');

    console.log('  ✓ Cryptographic signature tampering, time forgery, and kill-switch revocation verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Zero-Trust Cross-Patient Privacy & Role Enforcement
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 6: Zero-Trust Cross-Patient Privacy & Role Enforcement');

    const patientA = 'patient_charlie_001';
    const patientB = 'patient_dana_002';

    const fileA = await storageService.registerPrivateUpload({
      patientId: patientA,
      fileName: 'Charlie_Private_Radiology.dcm',
      fileSize: 1024 * 1024 * 4,
      mimeType: 'application/dicom',
      category: 'radiology_cxr'
    });

    // 1. Cross-patient privacy boundary check: Dana attempts to access Charlie's file
    const danaUser = { uid: patientB, role: 'patient' };
    const boundaryCheck = storageService.verifyPatientPrivacyBoundary({
      fileId: fileA.fileId,
      requestingUser: danaUser
    });
    assert.strictEqual(boundaryCheck.allowed, false);
    assert.strictEqual(boundaryCheck.status, 403);
    assert.strictEqual(boundaryCheck.reason, 'CROSS_PATIENT_PRIVACY_VIOLATION');

    // 2. Generating signed URL by unauthorized patient B must throw ACCESS_DENIED
    let accessDeniedCaught = false;
    try {
      storageService.generateSignedUrl({
        fileId: fileA.fileId,
        requestingUser: danaUser
      });
    } catch (err) {
      accessDeniedCaught = true;
      assert.strictEqual(err.code, 'ACCESS_DENIED');
      assert.strictEqual(err.status, 403);
    }
    assert.strictEqual(accessDeniedCaught, true);

    // 3. Non-clinician certification blocker
    let nonClinicianCertBlocked = false;
    try {
      await storageService.certifyFileReviewByDoctor({
        fileId: fileA.fileId,
        doctorUser: { uid: 'billing_agent_01', role: 'billing' },
        clinicalImpression: 'Approved'
      });
    } catch (err) {
      nonClinicianCertBlocked = true;
      assert.strictEqual(err.code, 'CLINICAL_CERTIFICATION_DENIED');
    }
    assert.strictEqual(nonClinicianCertBlocked, true);

    // 4. HIPAA Safe Harbor De-identification
    const sampleHeaders = {
      PatientName: 'Charlie Brown',
      PatientID: 'ID-99887766',
      PatientAddress: '10 Zamalek, Cairo',
      PhoneNumber: '+201122334455',
      Modality: 'CR',
      BodyPart: 'CHEST'
    };
    const deidentified = storageService.deidentifyFileMetadata(sampleHeaders);
    assert.strictEqual(deidentified.PatientName, undefined);
    assert.strictEqual(deidentified.PatientID, undefined);
    assert.strictEqual(deidentified.Modality, 'CR');
    assert.strictEqual(deidentified.isDeidentified, true);

    console.log('  ✓ Zero-Trust cross-patient blocker, role security, and HIPAA Safe Harbor verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Relational Database & Notifications Integration
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 7: Relational Database & Notifications Integration');
    const testDb = new RelationalDatabaseService();

    // 1. PRD Page 16 guard test
    let kaggleRejected = false;
    try {
      await testDb.createSecureMedicalFile({
        patientId: 'patient_kaggle_test',
        fileName: 'kaggle_training_sample.dcm',
        source: 'kaggle_offline_dataset'
      });
    } catch (err) {
      kaggleRejected = true;
      assert.strictEqual(err.code, 'KAGGLE_OPERATIONAL_WRITE_BLOCKED');
    }
    assert.strictEqual(kaggleRejected, true);

    // 2. Schema creation and foreign key indexing
    const validFile = await testDb.createSecureMedicalFile({
      fileId: 'sec_rel_file_901',
      patientId: 'patient_rel_100',
      fileName: 'Renal_Function_Test.pdf',
      fileSize: 1024 * 200,
      mimeType: 'application/pdf',
      category: 'lab_analysis',
      appointmentId: 'appt_rel_999',
      sessionId: 'chat_rel_888'
    });

    assert.strictEqual(validFile.id, 'sec_rel_file_901');

    // Index lookups
    assert.strictEqual(testDb.getSecureMedicalFilesByPatient('patient_rel_100').length, 1);
    assert.strictEqual(testDb.getSecureMedicalFilesByAppointment('appt_rel_999').length, 1);
    assert.strictEqual(testDb.getSecureMedicalFilesByChatSession('chat_rel_888').length, 1);

    // 3. Health check metrics
    const health = testDb.getHealthStatus();
    assert.ok(health.metrics.secureMedicalFilesCount >= 1);

    // 4. Index cleanup on deletion
    await testDb.deleteSecureMedicalFile('sec_rel_file_901');
    assert.strictEqual(testDb.getSecureMedicalFilesByPatient('patient_rel_100').length, 0);
    assert.strictEqual(testDb.getSecureMedicalFilesByAppointment('appt_rel_999').length, 0);

    console.log('  ✓ Relational database foreign keys, indexes, health metrics, and guards confirmed.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 8: 100% Bilingual Parity for System & UI Notifications (Arabic & English)
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 8: 100% Bilingual Parity for Notifications & i18n Catalogs');

    const eventTypesToTest = [
      notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN,
      notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_THREAT,
      notificationService.NOTIFICATION_TYPES.APPOINTMENT_DOSSIER_UPDATED,
      notificationService.NOTIFICATION_TYPES.CHATBOT_FILE_ATTACHED,
      notificationService.NOTIFICATION_TYPES.SIGNED_URL_EXPIRING
    ];

    const testFileRecord = {
      fileId: 'sec_bilingual_test',
      fileName: 'Lipid_Profile.pdf',
      category: 'lab_analysis',
      patientId: 'patient_bilingual_user'
    };

    for (const evt of eventTypesToTest) {
      // Test Arabic dispatch
      const resAr = await notificationService.dispatchSecureStorageNotification({
        eventType: evt,
        fileRecord: testFileRecord,
        recipientId: 'patient_bilingual_user',
        lang: 'ar'
      });
      assert.strictEqual(resAr.success, true);
      assert.ok(resAr.title.length > 0);
      assert.ok(resAr.message.length > 0);

      // Test English dispatch
      const resEn = await notificationService.dispatchSecureStorageNotification({
        eventType: evt,
        fileRecord: testFileRecord,
        recipientId: 'patient_bilingual_user',
        lang: 'en'
      });
      assert.strictEqual(resEn.success, true);
      assert.ok(resEn.title.length > 0);
      assert.ok(resEn.message.length > 0);
    }

    // Check app/i18n.js parity for secureStorage namespace
    assert.ok(translations.ar.secureStorage, 'translations.ar.secureStorage must exist');
    assert.ok(translations.en.secureStorage, 'translations.en.secureStorage must exist');

    const arKeys = Object.keys(translations.ar.secureStorage);
    const enKeys = Object.keys(translations.en.secureStorage);

    assert.equal(arKeys.length, enKeys.length, `AR and EN secureStorage must have identical key count (${arKeys.length} vs ${enKeys.length})`);
    for (const key of arKeys) {
      assert.ok(enKeys.includes(key), `Key '${key}' from ar.secureStorage must be in en.secureStorage`);
    }

    console.log(`  ✓ 100% Bilingual parity verified across all ${arKeys.length} i18n keys and notification events.\n`);
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 9: REST API Endpoints Verification in server.js
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 9: REST API Endpoints Verification in server.js');
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    const requiredEndpoints = [
      '/api/storage/upload-private',
      '/api/storage/signed-url',
      '/api/storage/secure-file/:fileId',
      '/api/storage/patient-files/:patientId',
      '/api/storage/scan/:fileId',
      '/api/storage/link-appointment',
      '/api/storage/link-chat-session',
      '/api/storage/notify-dossier',
      '/api/storage/appointment-files/:appointmentId',
      '/api/storage/chatbot-context/:patientId',
      '/api/storage/certify-review',
      '/api/storage/validate-chatbot-safety',
      '/api/storage/revoke-token',
      '/api/storage/file/:fileId'
    ];

    for (const ep of requiredEndpoints) {
      assert.ok(serverContent.includes(ep), `Endpoint '${ep}' must be registered in server.js`);
    }

    console.log(`  ✓ All ${requiredEndpoints.length} REST API endpoints verified in server.js.\n`);
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 9 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('==================================================================');
  if (passed === 9) {
    console.log('🎉 ALL 9 CLOUD STORAGE INTEGRATION QA & EDGE CASES TESTS PASSED!');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${9 - passed} tests failed.`);
    process.exit(1);
  }
}

runQaSuite();
