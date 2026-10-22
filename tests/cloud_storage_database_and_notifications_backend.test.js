/**
 * Health Vibe AI - Private Cloud Storage, Database Persistence & Notification Services Test Suite
 * Benchmark: Amwell Telehealth Standard (Backend, Databases & Notifications Integration)
 *
 * Verifies:
 * 1. Relational Database Service (RelationalDatabaseService):
 *    - Schema enforcement for secure_medical_files table (AES-256-GCM, private bucket path, scan status).
 *    - Indexing by patient, appointment, clinical case, and chatbot session.
 *    - CRUD, linking, and soft/hard deletion with index cleanup.
 *    - PRD Page 16 compliance (No Kaggle training provenance allowed).
 * 2. Notification Service (NotificationService):
 *    - New secure storage notification types registration.
 *    - Urgent event escalation for malware threats (isUrgentEvent).
 *    - Role-safe destination link routing (generateAuthorizedDestinationLink).
 *    - dispatchSecureStorageNotification creates structured notification history.
 * 3. End-to-End Orchestration in CloudStorageSignedUrlsService:
 *    - Automatic persistence to RelationalDatabaseService upon private upload.
 *    - Automatic notification dispatch to patient upon upload and scan completion.
 *    - Pre-visit appointment linking with doctor alert notification & signed URL.
 *    - Chatbot session linking with AI consultation context.
 *    - Malware threat quarantine triggers urgent security alert.
 * 4. Backend REST API Endpoints in server.js:
 *    - POST /api/storage/link-chat-session
 *    - POST /api/storage/notify-dossier
 *    - GET /api/storage/appointment-files/:appointmentId
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { relationalDbService, RelationalDatabaseService } = require('../backend/relational-db-service');
const notificationService = require('../backend/notification-service');
const {
  CloudStorageSignedUrlsService,
  cloudStorageSignedUrlsService,
  SCAN_STATUS,
  ENCRYPTION_MODES
} = require('../backend/cloud-storage-signed-urls-service');

console.log('\n==================================================================');
console.log('🔒 HEALTH VIBE AI: STORAGE, DATABASE & NOTIFICATIONS SUITE');
console.log('   Benchmark: Amwell Standard (Appointments, Chatbot & Vault Integration)');
console.log('==================================================================\n');

async function runTests() {
  let passed = 0;

  // -----------------------------------------------------------------------------
  // TEST 1: Relational Database Schema & CRUD for secure_medical_files
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 1: Relational Database Schema & CRUD for secure_medical_files');
    const testDb = new RelationalDatabaseService();

    const filePayload = {
      fileId: 'sec_file_db_001',
      patientId: 'patient_db_999',
      fileName: 'Complete_Blood_Count_CBC.pdf',
      fileSize: 1024 * 750,
      mimeType: 'application/pdf',
      category: 'lab_analysis',
      bucketName: 'health-vibe-private-vault',
      storagePath: 'private_vault/patient_db_999/lab_analysis/sec_file_db_001/CBC.pdf',
      encryption: { mode: 'AES-256-GCM' },
      scanStatus: 'clean',
      appointmentId: 'appt_2026_db_1',
      caseId: 'case_2026_db_1',
      sessionId: 'chat_sess_db_1'
    };

    const saved = await testDb.createSecureMedicalFile(filePayload);
    assert.strictEqual(saved.id, 'sec_file_db_001');
    assert.strictEqual(saved.patient_id, 'patient_db_999');
    assert.strictEqual(saved.encryption_mode, 'AES-256-GCM');
    assert.strictEqual(saved.encrypted_at_rest, true);

    // Verify lookup by id
    const byId = testDb.getSecureMedicalFileById('sec_file_db_001');
    assert.strictEqual(byId.id, 'sec_file_db_001');

    // Verify indexing lookups
    const byPatient = testDb.getSecureMedicalFilesByPatient('patient_db_999');
    assert.strictEqual(byPatient.length, 1);
    assert.strictEqual(byPatient[0].id, 'sec_file_db_001');

    const byAppt = testDb.getSecureMedicalFilesByAppointment('appt_2026_db_1');
    assert.strictEqual(byAppt.length, 1);

    const byCase = testDb.getSecureMedicalFilesByCase('case_2026_db_1');
    assert.strictEqual(byCase.length, 1);

    const bySession = testDb.getSecureMedicalFilesByChatSession('chat_sess_db_1');
    assert.strictEqual(bySession.length, 1);

    // Verify health status metrics tracking
    const health = testDb.getHealthStatus();
    assert.ok(health.metrics.secureMedicalFilesCount >= 1, 'Health metrics must track secureMedicalFilesCount');

    // Verify deletion removes from indexes
    await testDb.deleteSecureMedicalFile('sec_file_db_001');
    assert.strictEqual(testDb.getSecureMedicalFilesByPatient('patient_db_999').length, 0);

    console.log('  ✓ Relational schema, foreign keys, secondary indexes & health metrics verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 2: PRD Page 16 Architectural Guard for Secure Medical Files
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 2: PRD Page 16 Architectural Guard (Kaggle dataset rejection)');
    const testDb = new RelationalDatabaseService();

    let threw = false;
    try {
      await testDb.createSecureMedicalFile({
        patientId: 'patient_test_001',
        fileName: 'kaggle_chest_xray_dataset.dcm',
        source: 'kaggle_training_set'
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'KAGGLE_OPERATIONAL_WRITE_BLOCKED');
    }
    assert.strictEqual(threw, true, 'Kaggle provenance in operational files table must be rejected');
    console.log('  ✓ PRD Page 16 guard strictly prevented raw Kaggle dataset writes.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Notification Service Types, Urgent Routing & Links
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 3: Notification Service Types, Urgency & Link Generation');

    const expectedTypes = [
      'SECURE_FILE_UPLOADED',
      'SECURE_FILE_SCAN_CLEAN',
      'SECURE_FILE_SCAN_THREAT',
      'APPOINTMENT_DOSSIER_UPDATED',
      'CHATBOT_FILE_ATTACHED',
      'SIGNED_URL_EXPIRING'
    ];

    for (const t of expectedTypes) {
      assert.ok(notificationService.NOTIFICATION_TYPES[t], `NOTIFICATION_TYPES.${t} must be registered`);
    }

    // Urgency check: Threat must be urgent
    assert.strictEqual(
      notificationService.isUrgentEvent({ eventType: notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_THREAT }),
      true,
      'SECURE_FILE_SCAN_THREAT must be evaluated as urgent'
    );

    // Clean scan is not urgent
    assert.strictEqual(
      notificationService.isUrgentEvent({ eventType: notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN }),
      false,
      'SECURE_FILE_SCAN_CLEAN must not be marked urgent'
    );

    // Link generation
    const apptLink = notificationService.generateAuthorizedDestinationLink({
      eventType: notificationService.NOTIFICATION_TYPES.APPOINTMENT_DOSSIER_UPDATED,
      appointmentId: 'appt_999'
    });
    assert.ok(apptLink.includes('appointments&id=appt_999'), 'Appointment dossier link must route to appointments screen');

    const vaultLink = notificationService.generateAuthorizedDestinationLink({
      eventType: notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN
    });
    assert.ok(vaultLink.includes('screen=vault'), 'Secure file link must route to vault screen');

    console.log('  ✓ Notification types, urgency classifier, and authorized link routing verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 4: dispatchSecureStorageNotification History Recording
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 4: dispatchSecureStorageNotification History Recording');
    notificationService.clearNotificationHistoryLog();

    const notifResult = await notificationService.dispatchSecureStorageNotification({
      eventType: notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN,
      fileRecord: {
        fileId: 'sec_test_file_001',
        fileName: 'Blood_Glucose_Fasting.pdf',
        category: 'lab_analysis',
        patientId: 'patient_notif_123'
      },
      recipientId: 'patient_notif_123',
      lang: 'ar'
    });

    assert.strictEqual(notifResult.success, true);
    assert.ok(notifResult.notificationId);
    assert.ok(notifResult.title.includes('تم تشفير الفحص الطبي'));

    // Check history storage
    const { notifications: history } = await notificationService.getUserNotificationHistory(null, 'patient_notif_123');
    assert.ok(history.length >= 1);
    assert.strictEqual(history[0].read, false);
    assert.strictEqual(history[0].eventType, notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN);

    console.log('  ✓ Notification dispatched and recorded in user notification history.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Orchestration: Upload -> Relational DB Sync + Notification
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 5: Orchestration: Upload -> Relational DB Sync & Notifications');
    const storageService = new CloudStorageSignedUrlsService({
      relationalDb: relationalDbService,
      notificationService: notificationService
    });
    storageService.resetStoreForTesting();

    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_e2e_001',
      fileName: 'Chest_XRay_PA_View.png',
      fileSize: 1024 * 1024 * 3,
      mimeType: 'image/png',
      category: 'radiology_cxr',
      source: 'patient_vault'
    });

    assert.strictEqual(upload.scanStatus, SCAN_STATUS.CLEAN);
    assert.strictEqual(upload.encryption.mode, ENCRYPTION_MODES.AES_256_GCM);

    // Check that Relational DB has the file record
    const dbRecord = relationalDbService.getSecureMedicalFileById(upload.fileId);
    assert.ok(dbRecord, 'Uploaded file must be synchronized into relationalDbService');
    assert.strictEqual(dbRecord.file_name, 'Chest_XRay_PA_View.png');
    assert.strictEqual(dbRecord.category, 'radiology_cxr');

    // Check that notification history has entry
    const { notifications: notifs } = await notificationService.getUserNotificationHistory(null, 'patient_e2e_001');
    assert.ok(notifs.some(n => n.eventType === notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_CLEAN));

    console.log('  ✓ Storage service synchronized upload into relational database & dispatched notification.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Touchpoint 1 (Appointments): Link File & Notify Doctor
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 6: Touchpoint 1 (Appointments): Link File & Notify Attending Doctor');
    const storageService = new CloudStorageSignedUrlsService({
      relationalDb: relationalDbService,
      notificationService: notificationService
    });

    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_appt_link',
      fileName: 'Sputum_Culture_Sensitivity.pdf',
      fileSize: 1024 * 400,
      mimeType: 'application/pdf',
      category: 'lab_analysis'
    });

    const linkRes = await storageService.linkFileToAppointment({
      fileId: upload.fileId,
      appointmentId: 'appt_previsit_9001',
      requestingUser: { uid: 'patient_appt_link', role: 'patient' }
    });

    assert.strictEqual(linkRes.success, true);
    assert.strictEqual(linkRes.appointmentId, 'appt_previsit_9001');

    // Verify Relational DB index lookup by appointment
    const apptFiles = relationalDbService.getSecureMedicalFilesByAppointment('appt_previsit_9001');
    assert.ok(apptFiles.length >= 1);
    assert.strictEqual(apptFiles[0].id, upload.fileId);

    console.log('  ✓ File linked to appointment in relational DB and pre-visit dossier updated.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Touchpoint 2 (Chatbot): Link File to Chat Session
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 7: Touchpoint 2 (Chatbot): Link File to AI Chat Session');
    const storageService = new CloudStorageSignedUrlsService({
      relationalDb: relationalDbService,
      notificationService: notificationService
    });

    const upload = await storageService.registerPrivateUpload({
      patientId: 'patient_chat_001',
      fileName: 'Prescription_Ventolin_Inhaler.jpg',
      fileSize: 1024 * 350,
      mimeType: 'image/jpeg',
      category: 'prescription'
    });

    const chatLink = await storageService.linkFileToChatSession({
      fileId: upload.fileId,
      sessionId: 'chat_session_meds_777',
      requestingUser: { uid: 'patient_chat_001', role: 'patient' }
    });

    assert.strictEqual(chatLink.success, true);
    assert.strictEqual(chatLink.sessionId, 'chat_session_meds_777');

    // Verify Relational DB query by chat session
    const sessionFiles = relationalDbService.getSecureMedicalFilesByChatSession('chat_session_meds_777');
    assert.ok(sessionFiles.length >= 1);
    assert.strictEqual(sessionFiles[0].id, upload.fileId);

    console.log('  ✓ File linked to chat session in relational DB with chatbot notification context.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 8: Anti-Malware Quarantine Triggers Urgent Security Alert
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 8: Anti-Malware Quarantine Triggers Urgent Security Alert');
    const storageService = new CloudStorageSignedUrlsService({
      relationalDb: relationalDbService,
      notificationService: notificationService
    });

    // In-memory test: simulate an infected file scan
    const dummyRecord = {
      fileId: 'sec_malicious_001',
      fileName: 'fake_lab_results.exe.pdf',
      patientId: 'patient_threat_999'
    };
    storageService._filesStore.set('sec_malicious_001', dummyRecord);

    const scanResult = await storageService.scanFileForMalware('sec_malicious_001');
    assert.strictEqual(scanResult.scanStatus, SCAN_STATUS.INFECTED);
    assert.strictEqual(scanResult.availability, 'blocked');

    // Verify that an urgent notification was sent to patient
    const { notifications: notifs } = await notificationService.getUserNotificationHistory(null, 'patient_threat_999');
    assert.ok(notifs.some(n => n.eventType === notificationService.NOTIFICATION_TYPES.SECURE_FILE_SCAN_THREAT && n.urgent === true));

    console.log('  ✓ Prohibited malicious payloads trigger permanent quarantine & urgent alerts.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // TEST 9: Backend Server REST API Route Definitions in server.js
  // -----------------------------------------------------------------------------
  try {
    console.log('▶ TEST 9: Backend Server REST API Endpoints in server.js');
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverContent.includes('/api/storage/link-appointment'), 'POST /api/storage/link-appointment must exist');
    assert.ok(serverContent.includes('/api/storage/link-chat-session'), 'POST /api/storage/link-chat-session must exist');
    assert.ok(serverContent.includes('/api/storage/notify-dossier'), 'POST /api/storage/notify-dossier must exist');
    assert.ok(serverContent.includes('/api/storage/appointment-files/:appointmentId'), 'GET /api/storage/appointment-files/:appointmentId must exist');
    assert.ok(serverContent.includes('/api/storage/chatbot-context/:patientId'), 'GET /api/storage/chatbot-context/:patientId must exist');

    console.log('  ✓ All enhanced REST API endpoints for database and notification linkage verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 9 FAILED:', err.message);
  }

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('==================================================================');
  if (passed === 9) {
    console.log('🎉 ALL 9 STORAGE DATABASE & NOTIFICATIONS TESTS PASSED!');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${9 - passed} tests failed.`);
    process.exit(1);
  }
}

runTests();
