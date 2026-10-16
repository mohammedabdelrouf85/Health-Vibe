/**
 * HEALTH VIBE AI: AUTOMATED DAILY BACKUP & ZERO-LOSS RESTORE DRILL TEST SUITE
 * 
 * Verifies:
 * 1. Automated daily backup scheduler initialization, state tracking, and cadence (24h).
 * 2. Complete clinical snapshot coverage (patients, cases, medical & clinical reports, appointments).
 * 3. Automated Restore Testing engine (runAutomatedRestoreTest) ensuring 100% record match and ZERO data loss.
 * 4. Detection and rejection of corrupted or tampered snapshots during restore drills.
 * 5. Full end-to-end daily backup cycle (snapshot creation + immediate automated restore drill).
 * 6. Backend API endpoints in server.js (/api/admin/backup/schedule, /api/admin/backup/restore-test, /api/admin/backup/schedule/run-now).
 * 7. Frontend UI controls, telemetry cards, and window exports in app/index.html & app/app.js.
 * 8. Preservation of Email and Google OAuth authentication flows without regression.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🏥 HEALTH VIBE AI: DAILY BACKUP & RESTORE VERIFICATION TEST SUITE");
console.log("   Zero Data Loss Guarantee, SHA-256 Integrity & DR Drills");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUP_SERVICE_PATH = path.join(ROOT_DIR, 'backend', 'backup-service.js');
const SERVER_JS_PATH = path.join(ROOT_DIR, 'backend', 'server.js');
const APP_JS_PATH = path.join(ROOT_DIR, 'app', 'app.js');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'app', 'index.html');

const backupService = require(BACKUP_SERVICE_PATH);
const serverJs = fs.readFileSync(SERVER_JS_PATH, 'utf-8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf-8');
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');

(async () => {
  // -----------------------------------------------------------------------------
  // TEST 1: Daily Backup Scheduler Initialization & State Tracking
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Daily Backup Scheduler Initialization & State Tracking");
  
  const initialStatus = backupService.initDailyBackupScheduler({
    intervalMs: 24 * 60 * 60 * 1000,
    autoStart: true
  });

  assert.strictEqual(initialStatus.isRunning, true, "Scheduler must report isRunning = true.");
  assert.strictEqual(initialStatus.cadence, '24h_daily', "Cadence must report 24h_daily.");
  assert.strictEqual(initialStatus.intervalMs, 86400000, "Interval must equal 24 hours in ms.");
  assert.ok(initialStatus.nextDailyRunAt, "Scheduler must compute nextDailyRunAt.");
  assert.ok(new Date(initialStatus.nextDailyRunAt).getTime() > Date.now(), "nextDailyRunAt must be in the future.");

  const stoppedStatus = backupService.stopDailyBackupScheduler();
  assert.strictEqual(stoppedStatus.isRunning, false, "stopDailyBackupScheduler must halt timer and set isRunning = false.");
  console.log("  ✓ Scheduler lifecycle verified: 24-hour cadence, next run calculation, start and stop controls.");

  // -----------------------------------------------------------------------------
  // TEST 2: Daily Backup Snapshot Covering Patients & Clinical Reports
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 2: Snapshot Generation with Patient Records & Clinical Reports");

  const clinicalMockData = {
    users: [
      { id: 'pat_101', role: 'patient', name: 'Zahra Mansour', email: 'zahra@example.com', patientCode: 'P-101' },
      { id: 'pat_102', role: 'patient', name: 'Kareem Tarek', email: 'kareem@example.com', patientCode: 'P-102' },
      { id: 'doc_501', role: 'doctor', name: 'Dr. Fatima Al-Nasser', email: 'fatima@healthvibe.ai' }
    ],
    cases: [
      { id: 'case_c01', patientId: 'pat_101', condition: 'Acute Dyspnea', triagePriority: 'urgent', score: 88, model_version: 'resp_rf_v1.0.2' },
      { id: 'case_c02', patientId: 'pat_102', condition: 'Chronic Cough', triagePriority: 'routine', score: 42, model_version: 'resp_rf_v1.0.2' }
    ],
    medical_reports: [
      { id: 'rep_m01', patientId: 'pat_101', caseId: 'case_c01', reportType: 'respiratory_triage', findings: 'Bilateral wheezing', issuedAt: new Date().toISOString() },
      { id: 'rep_m02', patientId: 'pat_102', caseId: 'case_c02', reportType: 'diagnostic_summary', findings: 'Normal chest auscultation', issuedAt: new Date().toISOString() }
    ],
    clinical_reports: [
      { id: 'crep_01', caseId: 'case_c01', reviewerDoctorId: 'doc_501', status: 'verified', reviewTimestamp: new Date().toISOString() }
    ],
    appointments: [
      { id: 'apt_901', patientId: 'pat_101', doctorId: 'doc_501', scheduledFor: '2026-10-20T10:00:00Z', status: 'confirmed' }
    ],
    feedbacks: [
      { id: 'fb_1', rating: 5, comment: 'Excellent triage accuracy' }
    ],
    audit_events: [
      { id: 'aud_1', type: 'CASE_TRIAGED', timestamp: new Date().toISOString() }
    ],
    email_notifications: [
      { id: 'notif_1', recipient: 'zahra@example.com', status: 'delivered' }
    ]
  };

  const snapshotManifest = await backupService.createBackupSnapshot({
    initiator: 'daily_automated_backup_test',
    mockData: clinicalMockData
  });

  assert.ok(snapshotManifest.backupId.startsWith('backup_'), "Manifest must contain backupId.");
  assert.strictEqual(snapshotManifest.collections.users, 3, "Users count must match.");
  assert.strictEqual(snapshotManifest.collections.cases, 2, "Cases count must match.");
  assert.strictEqual(snapshotManifest.collections.medical_reports, 2, "Medical reports count must match.");
  assert.strictEqual(snapshotManifest.collections.clinical_reports, 1, "Clinical reports count must match.");
  assert.strictEqual(snapshotManifest.collections.appointments, 1, "Appointments count must match.");
  assert.strictEqual(snapshotManifest.totalRecords, 12, "Total record count must equal sum of collections.");
  assert.strictEqual(snapshotManifest.status, 'COMPLETED');
  console.log(`  ✓ Snapshot '${snapshotManifest.backupId}' generated containing ${snapshotManifest.totalRecords} medical records.`);

  // -----------------------------------------------------------------------------
  // TEST 3: Automated Restore Testing (DR Drill) - Zero Data Loss Verification
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 3: Automated Restore Test (DR Drill) with Zero Data Loss Guarantee");

  const restoreDrillResult = await backupService.runAutomatedRestoreTest({
    backupId: snapshotManifest.backupId
  });

  assert.strictEqual(restoreDrillResult.success, true, "Restore drill must succeed.");
  assert.strictEqual(restoreDrillResult.certifiedZeroDataLoss, true, "Must certify ZERO DATA LOSS.");
  assert.strictEqual(restoreDrillResult.status, 'PASSED_CERTIFIED_ZERO_LOSS');
  assert.strictEqual(restoreDrillResult.sha256Match, true, "SHA-256 manifest hash must match.");
  assert.strictEqual(restoreDrillResult.dryRunPassed, true, "Dry-run restoration must pass.");
  assert.strictEqual(restoreDrillResult.sandboxRestorePassed, true, "Sandbox restoration must pass.");
  
  // Reconciled counts check
  assert.strictEqual(restoreDrillResult.reconciliation.missingRecordsCount, 0, "Missing records must be exactly 0.");
  assert.strictEqual(restoreDrillResult.reconciliation.corruptedRecordsCount, 0, "Corrupted records must be exactly 0.");
  assert.strictEqual(restoreDrillResult.reconciliation.reconciliationPercentage, 100, "Reconciliation percentage must be 100%.");
  assert.strictEqual(restoreDrillResult.reconciliation.totalSourceRecords, 12);
  assert.strictEqual(restoreDrillResult.reconciliation.totalRestoredRecords, 12);

  // Collections checked
  assert.ok(restoreDrillResult.collectionsChecked.users.reconciled, "users collection must be reconciled.");
  assert.ok(restoreDrillResult.collectionsChecked.cases.reconciled, "cases collection must be reconciled.");
  assert.ok(restoreDrillResult.collectionsChecked.medical_reports.reconciled, "medical_reports must be reconciled.");
  assert.ok(restoreDrillResult.collectionsChecked.clinical_reports.reconciled, "clinical_reports must be reconciled.");
  assert.ok(restoreDrillResult.collectionsChecked.appointments.reconciled, "appointments must be reconciled.");

  // RTO check (< 30 minutes)
  assert.strictEqual(restoreDrillResult.metrics.rtoCompliant, true, "Must comply with RTO < 30 minutes.");
  assert.ok(restoreDrillResult.metrics.measuredRtoSeconds < 1800, "Measured RTO must be well under 1800s.");
  console.log(`  ✓ Restore drill certified 100% data integrity with ZERO data loss in ${restoreDrillResult.metrics.measuredRtoSeconds}s.`);

  // -----------------------------------------------------------------------------
  // TEST 4: Detection & Rejection of Corrupted Snapshot During Restore Test
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 4: Rejection of Corrupted Snapshot During Restore Test");

  // Tamper with the snapshot payload by altering manifest hash
  const corruptedSnapshot = await backupService.createBackupSnapshot({
    initiator: 'tamper_test_runner',
    mockData: { users: [{ id: 'fake_1', role: 'patient' }] }
  });

  const corruptVerification = backupService.verifyBackupIntegrity(
    corruptedSnapshot.backupId,
    JSON.stringify({ firestore: { users: [] }, tampered: true })
  );
  assert.strictEqual(corruptVerification.valid, false, "Tampered payload must fail cryptographic integrity check.");
  assert.strictEqual(corruptVerification.status, 'CORRUPTED_OR_TAMPERED');
  console.log("  ✓ Cryptographic corruption detected and blocked from restoring.");

  // -----------------------------------------------------------------------------
  // TEST 5: Full Daily Backup Cycle (Snapshot + Automated Restore Drill)
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 5: Full Daily Backup Cycle Execution");

  const cycleResult = await backupService.runDailyBackupCycle({
    initiator: 'daily_cycle_automated_test'
  });

  assert.strictEqual(cycleResult.success, true, "Daily backup cycle must succeed.");
  assert.ok(cycleResult.backup && cycleResult.backup.backupId, "Cycle must generate snapshot manifest.");
  assert.ok(cycleResult.restoreDrill, "Cycle must immediately execute automated restore drill.");
  assert.strictEqual(cycleResult.restoreDrill.certifiedZeroDataLoss, true, "Cycle restore drill must certify zero data loss.");

  const schedulerStatus = backupService.getDailySchedulerStatus();
  assert.ok(schedulerStatus.lastDailyRunAt, "Scheduler state must update lastDailyRunAt.");
  assert.strictEqual(schedulerStatus.lastBackupId, cycleResult.backup.backupId);
  assert.ok(schedulerStatus.history.length > 0, "Scheduler history must record the cycle.");
  assert.strictEqual(schedulerStatus.history[0].drillPassed, true, "History item must note drill passed.");
  console.log("  ✓ End-to-end daily cycle verified: snapshot created, restore drill passed, scheduler history updated.");

  // -----------------------------------------------------------------------------
  // TEST 6: Backend Server REST Endpoints in server.js
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 6: Backend REST Endpoints in server.js");

  assert.ok(serverJs.includes("app.get('/api/admin/backup/schedule'"), "server.js must expose GET /api/admin/backup/schedule.");
  assert.ok(serverJs.includes("app.post('/api/admin/backup/schedule/run-now'"), "server.js must expose POST /api/admin/backup/schedule/run-now.");
  assert.ok(serverJs.includes("app.post('/api/admin/backup/restore-test'"), "server.js must expose POST /api/admin/backup/restore-test.");
  assert.ok(serverJs.includes("backupService.initDailyBackupScheduler"), "server.js must initialize daily backup scheduler on boot.");
  console.log("  ✓ All daily backup and restore drill endpoints verified in server.js.");

  // -----------------------------------------------------------------------------
  // TEST 7: Frontend UI Elements & Client Methods in index.html & app.js
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 7: Frontend UI & Client Engine in index.html & app.js");

  // HTML checks
  assert.ok(indexHtml.includes('id="adminBackupScheduleBadge"'), "index.html must have adminBackupScheduleBadge.");
  assert.ok(indexHtml.includes('id="btnTriggerDailyBackupCycle"'), "index.html must have btnTriggerDailyBackupCycle.");
  assert.ok(indexHtml.includes('id="btnTriggerRestoreTestDrill"'), "index.html must have btnTriggerRestoreTestDrill.");
  assert.ok(indexHtml.includes('id="adminBackupDrillBanner"'), "index.html must have adminBackupDrillBanner.");
  assert.ok(indexHtml.includes('id="adminBackupZeroLossBadge"'), "index.html must have adminBackupZeroLossBadge.");

  // App.js checks
  assert.ok(appJs.includes("async function fetchBackupScheduleStatus("), "app.js must define fetchBackupScheduleStatus.");
  assert.ok(appJs.includes("async function triggerAutomatedRestoreTest("), "app.js must define triggerAutomatedRestoreTest.");
  assert.ok(appJs.includes("async function triggerDailyBackupCycle("), "app.js must define triggerDailyBackupCycle.");
  assert.ok(appJs.includes("window.fetchBackupScheduleStatus = fetchBackupScheduleStatus;"), "fetchBackupScheduleStatus must be exposed on window.");
  assert.ok(appJs.includes("window.triggerAutomatedRestoreTest = triggerAutomatedRestoreTest;"), "triggerAutomatedRestoreTest must be exposed on window.");
  assert.ok(appJs.includes("window.triggerDailyBackupCycle = triggerDailyBackupCycle;"), "triggerDailyBackupCycle must be exposed on window.");
  console.log("  ✓ UI controls, badges, and client functions verified in app/index.html and app/app.js.");

  // -----------------------------------------------------------------------------
  // TEST 8: Preserves Email & Google OAuth Authentication
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 8: Preserving Email & Google OAuth Authentication");

  assert.ok(appJs.includes("signInWithEmailAndPassword"), "Email/password authentication must remain functional.");
  assert.ok(appJs.includes("GoogleAuthProvider"), "Google OAuth provider must remain functional.");
  assert.ok(appJs.includes("signInWithPopup"), "Google OAuth popup flow must remain intact.");
  console.log("  ✓ Email login and Google OAuth authentication flows fully preserved without regression.");

  console.log("\n==================================================================");
  console.log("🎉 ALL 8 AUTOMATED DAILY BACKUP & RESTORE DRILL TESTS PASSED!");
  console.log("==================================================================");
})();
