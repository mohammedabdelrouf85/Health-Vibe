/**
 * HEALTH VIBE AI: CLINICAL BACKUP & DISASTER RECOVERY (DR) TEST SUITE
 * 
 * Verifies:
 * 1. BACKUP_AND_RESTORE_PLAN.md policy compliance (RPO, RTO, PITR, HIPAA).
 * 2. Cryptographic snapshot generation with SHA-256 manifest.
 * 3. Integrity verification of pristine backup data.
 * 4. Detection and rejection of corrupted or tampered snapshots.
 * 5. Safety guard preventing blind restores without explicit confirmation tokens.
 * 6. Dry-run restoration validation mode.
 * 7. Server endpoints in backend/server.js (/api/admin/backup/*).
 * 8. UI containers and backup trigger controls in app/index.html.
 * 9. Window export availability in app/app.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🛡️  HEALTH VIBE AI: BACKUP & DISASTER RECOVERY (DR) TEST SUITE");
console.log("   RPO/RTO Metrics, SHA-256 Integrity, Dry-Runs & Guarded Restore");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, '..');
const PLAN_PATH = path.join(ROOT_DIR, 'BACKUP_AND_RESTORE_PLAN.md');
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
  // TEST 1: Policy & Documentation Compliance (BACKUP_AND_RESTORE_PLAN.md)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Policy Compliance in BACKUP_AND_RESTORE_PLAN.md");
  assert.ok(fs.existsSync(PLAN_PATH), "BACKUP_AND_RESTORE_PLAN.md must exist in root directory.");
  const planDoc = fs.readFileSync(PLAN_PATH, 'utf-8');

  assert.ok(planDoc.includes("RPO (Recovery Point Objective)"), "Plan must document RPO target.");
  assert.ok(planDoc.includes("< 15 minutes"), "Plan must specify RPO < 15 minutes.");
  assert.ok(planDoc.includes("RTO (Recovery Time Objective)"), "Plan must document RTO target.");
  assert.ok(planDoc.includes("< 30 minutes"), "Plan must specify RTO < 30 minutes.");
  assert.ok(planDoc.includes("Point-In-Time Recovery (PITR)"), "Plan must mandate PITR continuous logging.");
  assert.ok(planDoc.includes("SHA-256"), "Plan must require SHA-256 cryptographic manifests.");
  assert.ok(planDoc.includes("HIPAA"), "Plan must address HIPAA compliance.");
  console.log("  ✓ Architectural plan verified: RPO < 15m, RTO < 30m, PITR, and HIPAA alignment.");

  // -----------------------------------------------------------------------------
  // TEST 2: Snapshot Creation & SHA-256 Manifest Calculation
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 2: Snapshot Creation & Cryptographic Manifest");
  const mockDataset = {
    users: [
      { id: 'usr_doc_1', role: 'doctor', email: 'dr.samir@healthvibe.ai' },
      { id: 'usr_pat_1', role: 'patient', email: 'patient.omar@example.com' }
    ],
    cases: [
      { id: 'case_101', status: 'approved', triagePriority: 'urgent', score: 82 }
    ],
    appointments: [
      { id: 'appt_201', doctorId: 'usr_doc_1', patientId: 'usr_pat_1', status: 'confirmed' }
    ],
    feedbacks: [
      { id: 'fb_301', rating: 5, category: 'ai_triage' }
    ],
    audit_events: [
      { id: 'ae_401', type: 'CASE_APPROVED' }
    ],
    email_notifications: [
      { id: 'en_501', type: 'result_ready', status: 'sent' }
    ]
  };

  const manifest = await backupService.createBackupSnapshot({
    initiator: 'automated_test_runner',
    environment: 'development',
    mockData: mockDataset
  });

  assert.ok(manifest.backupId.startsWith('backup_'), "Manifest must contain unique backupId.");
  assert.strictEqual(manifest.totalRecords, 7, "Total records must equal sum of mock collections (2+1+1+1+1+1).");
  assert.strictEqual(manifest.collections.users, 2);
  assert.strictEqual(manifest.collections.cases, 1);
  assert.strictEqual(manifest.collections.appointments, 1);
  assert.ok(manifest.checksum && manifest.checksum.hash, "Manifest must include checksum hash.");
  assert.strictEqual(manifest.checksum.algorithm, 'SHA-256');
  assert.strictEqual(manifest.status, 'COMPLETED');
  console.log(`  ✓ Snapshot '${manifest.backupId}' created with SHA-256 hash: ${manifest.checksum.hash.substring(0, 16)}...`);

  // -----------------------------------------------------------------------------
  // TEST 3: Cryptographic Integrity Verification (Pristine Snapshot)
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 3: Cryptographic Integrity Verification (Pristine)");
  const pristineResult = backupService.verifyBackupIntegrity(manifest.backupId);
  assert.strictEqual(pristineResult.valid, true, "Pristine snapshot must pass integrity verification.");
  assert.strictEqual(pristineResult.status, 'VERIFIED_PRISTINE');
  assert.strictEqual(pristineResult.expectedHash, pristineResult.computedHash);
  console.log("  ✓ Snapshot verified: SHA-256 match confirmed.");

  // -----------------------------------------------------------------------------
  // TEST 4: Tampering & Corruption Detection Guard
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 4: Tampering & Corruption Detection Guard");
  const corruptedPayload = JSON.stringify({ ...mockDataset, cases: [{ id: 'case_hacked_malicious' }] });
  const corruptedResult = backupService.verifyBackupIntegrity(manifest.backupId, corruptedPayload);
  assert.strictEqual(corruptedResult.valid, false, "Tampered payload must fail integrity verification.");
  assert.strictEqual(corruptedResult.status, 'CORRUPTED_OR_TAMPERED');
  assert.notStrictEqual(corruptedResult.expectedHash, corruptedResult.computedHash);
  console.log("  ✓ Tampered/corrupted snapshot detected and blocked with CORRUPTED_OR_TAMPERED.");

  // -----------------------------------------------------------------------------
  // TEST 5: Restoration Safety Guard (Confirmation Token)
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 5: Restoration Safety Guard (Confirmation Token)");
  const restoreAttemptNoToken = await backupService.restoreBackupSnapshot(manifest.backupId, { confirmToken: '' });
  assert.strictEqual(restoreAttemptNoToken.success, false, "Restore without confirmation token must be blocked.");
  assert.strictEqual(restoreAttemptNoToken.error, 'CONFIRMATION_REQUIRED');

  const restoreAttemptWrongToken = await backupService.restoreBackupSnapshot(manifest.backupId, { confirmToken: 'RANDOM_TOKEN_123' });
  assert.strictEqual(restoreAttemptWrongToken.success, false, "Restore with wrong token must be blocked.");
  assert.strictEqual(restoreAttemptWrongToken.error, 'CONFIRMATION_REQUIRED');
  console.log("  ✓ Blind restores strictly rejected without exact confirmation token.");

  // -----------------------------------------------------------------------------
  // TEST 6: Dry-Run Restoration Validation
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 6: Dry-Run Restoration Execution");
  const validToken = `CONFIRM_RESTORE_${manifest.backupId}`;
  const dryRunResult = await backupService.restoreBackupSnapshot(manifest.backupId, {
    confirmToken: validToken,
    dryRun: true
  });
  assert.strictEqual(dryRunResult.success, true, "Dry-run restore with valid token must succeed.");
  assert.strictEqual(dryRunResult.dryRun, true);
  assert.ok(dryRunResult.message.includes("without modifying datastore"));
  console.log("  ✓ Dry-run restore drill successfully validated archive without modifying database.");

  // -----------------------------------------------------------------------------
  // TEST 7: Backend Endpoints in server.js
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 7: Backend Server Route Definitions in server.js");
  assert.ok(serverJs.includes("app.post('/api/admin/backup/create'"), "server.js must define POST /api/admin/backup/create.");
  assert.ok(serverJs.includes("app.get('/api/admin/backup/list'"), "server.js must define GET /api/admin/backup/list.");
  assert.ok(serverJs.includes("app.post('/api/admin/backup/verify'"), "server.js must define POST /api/admin/backup/verify.");
  assert.ok(serverJs.includes("app.post('/api/admin/backup/restore'"), "server.js must define POST /api/admin/backup/restore.");
  console.log("  ✓ All 4 administrative backup/DR endpoints verified in backend/server.js.");

  // -----------------------------------------------------------------------------
  // TEST 8: UI Elements in app/index.html
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 8: UI Telemetry & Action Elements in app/index.html");
  assert.ok(indexHtml.includes('id="adminBackupDRPanel"'), "index.html must contain adminBackupDRPanel.");
  assert.ok(indexHtml.includes('id="btnTriggerBackupSnapshot"'), "index.html must contain btnTriggerBackupSnapshot.");
  assert.ok(indexHtml.includes('id="adminBackupSnapshotsTableBody"'), "index.html must contain adminBackupSnapshotsTableBody.");
  assert.ok(indexHtml.includes('id="adminBackupRpoBadge"'), "index.html must contain adminBackupRpoBadge.");
  console.log("  ✓ Disaster recovery panel, trigger button, and snapshots table verified in app/index.html.");

  // -----------------------------------------------------------------------------
  // TEST 9: Global Window Exports in app/app.js
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 9: Global Window Exports in app/app.js");
  assert.ok(appJs.includes("window.triggerBackupSnapshot = triggerBackupSnapshot;"), "triggerBackupSnapshot must be exposed on window.");
  assert.ok(appJs.includes("window.fetchBackupSnapshotsList = fetchBackupSnapshotsList;"), "fetchBackupSnapshotsList must be exposed on window.");
  assert.ok(appJs.includes("window.verifyBackupSnapshot = verifyBackupSnapshot;"), "verifyBackupSnapshot must be exposed on window.");
  assert.ok(appJs.includes("window.restoreBackupSnapshot = restoreBackupSnapshot;"), "restoreBackupSnapshot must be exposed on window.");
  assert.ok(appJs.includes("window.renderAdminBackupUI = renderAdminBackupUI;"), "renderAdminBackupUI must be exposed on window.");
  console.log("  ✓ All 5 backup and disaster recovery functions exposed on window.");

  console.log("\n==================================================================");
  console.log("🎉 ALL 9 BACKUP & DISASTER RECOVERY TESTS PASSED WITH 100% SUCCESS!");
  console.log("==================================================================");
})();
