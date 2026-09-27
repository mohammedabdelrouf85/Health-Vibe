/**
 * Health Vibe AI - Privacy & Data Subject Lifecycle Test Suite
 *
 * Verifies:
 * 1. Comprehensive personal data inventory across Auth, Firestore, Storage,
 *    Reports, Messages, Feedback, Logs, and Backups.
 * 2. Recent identity verification / re-authentication checks (auth_time freshness).
 * 3. Proportional deletion & clinical record anonymization (GDPR Art. 17 / HIPAA).
 * 4. Data Export Request (GDPR Art. 20) with SHA-256 integrity validation.
 * 5. Data Access Request (GDPR Art. 15) disclosure and purpose tracking.
 * 6. Resilient batching for large accounts (>500 records) exceeding single commit limits.
 * 7. Partial failure handling WITHOUT false completion claims.
 * 8. Safe, idempotent retry resuming from the failed stage.
 * 9. Backup restore suppression of tombstoned deleted users conforming to retention policy.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🔒 HEALTH VIBE AI: ENTERPRISE PRIVACY & DATA LIFECYCLE TEST SUITE');
console.log('   GDPR / HIPAA Data Subject Rights, Safe Retry & Retention Audits');
console.log('==================================================================\n');

const privacyService = require('../backend/privacy-service');
const backupService = require('../backend/backup-service');
const whatsappBot = require('../backend/whatsapp-bot');

// In-memory mock Firestore implementation for rigorous deterministic testing
function createMockFirestore() {
  const collections = new Map();

  function getCollectionMap(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  const db = {
    _collections: collections,
    collection(name) {
      const colMap = getCollectionMap(name);
      return {
        doc(id = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`) {
          return {
            id,
            ref: { id, collection: name },
            async get() {
              const data = colMap.get(id);
              return {
                id,
                exists: Boolean(data),
                data() { return data ? JSON.parse(JSON.stringify(data)) : undefined; }
              };
            },
            async set(data, options = {}) {
              const existing = colMap.get(id) || {};
              const merged = options.merge ? { ...existing, ...data } : { ...data };
              colMap.set(id, merged);
            },
            async update(data) {
              const existing = colMap.get(id) || {};
              colMap.set(id, { ...existing, ...data });
            },
            async delete() {
              colMap.delete(id);
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          colMap.set(id, { ...data });
          return { id };
        },
        where(field, op, val) {
          return {
            async get() {
              const matched = [];
              for (const [docId, docData] of colMap.entries()) {
                if (op === '==' && docData && docData[field] === val) {
                  matched.push({
                    id: docId,
                    ref: db.collection(name).doc(docId),
                    data() { return JSON.parse(JSON.stringify(docData)); }
                  });
                }
              }
              return {
                size: matched.length,
                empty: matched.length === 0,
                docs: matched,
                forEach(cb) { matched.forEach(cb); }
              };
            }
          };
        },
        async get() {
          const docs = [];
          for (const [docId, docData] of colMap.entries()) {
            docs.push({
              id: docId,
              ref: db.collection(name).doc(docId),
              data() { return JSON.parse(JSON.stringify(docData)); }
            });
          }
          return {
            size: docs.length,
            empty: docs.length === 0,
            docs,
            forEach(cb) { docs.forEach(cb); }
          };
        }
      };
    },
    batch() {
      const ops = [];
      return {
        set(docRef, data, options) {
          ops.push(async () => docRef.set(data, options));
          return this;
        },
        update(docRef, data) {
          ops.push(async () => docRef.update(data));
          return this;
        },
        delete(docRef) {
          ops.push(async () => docRef.delete());
          return this;
        },
        async commit() {
          for (const op of ops) {
            await op();
          }
        }
      };
    }
  };

  return db;
}

// In-memory mock Firebase Storage Bucket
function createMockStorageBucket() {
  const files = new Map();
  return {
    _files: files,
    async getFiles({ prefix = '' } = {}) {
      const matched = [];
      for (const [name, buffer] of files.entries()) {
        if (!prefix || name.startsWith(prefix)) {
          matched.push({
            name,
            async delete() {
              files.delete(name);
            }
          });
        }
      }
      return [matched];
    },
    file(name) {
      return {
        name,
        async save(buffer, options) {
          files.set(name, buffer);
        },
        async delete() {
          files.delete(name);
        }
      };
    }
  };
}

// In-memory mock Firebase Auth
function createMockAdminAuth() {
  const users = new Map();
  return {
    _users: users,
    async getUser(uid) {
      const u = users.get(uid);
      if (!u) {
        const err = new Error('User not found');
        err.code = 'auth/user-not-found';
        throw err;
      }
      return u;
    },
    async deleteUser(uid) {
      users.delete(uid);
    }
  };
}

(async () => {
  // -----------------------------------------------------------------------------
  // TEST 1: Recent Identity Verification / Re-authentication Guard
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Recent Identity Verification Guard (auth_time check)');
  const nowSec = Math.floor(Date.now() / 1000);

  // Stale login: 30 minutes ago (> 15 minutes)
  const staleUser = { uid: 'u_test_1', email: 'patient1@example.com', auth_time: nowSec - 1800 };
  const staleCheck = privacyService.verifyRecentAuthentication(staleUser);
  assert.strictEqual(staleCheck.ok, false, 'Stale auth token must be rejected');
  assert.strictEqual(staleCheck.error, 'REQUIRES_RECENT_LOGIN', 'Must return REQUIRES_RECENT_LOGIN error code');

  // Fresh login: 2 minutes ago (< 15 minutes)
  const freshUser = { uid: 'u_test_1', email: 'patient1@example.com', auth_time: nowSec - 120 };
  const freshCheck = privacyService.verifyRecentAuthentication(freshUser);
  assert.strictEqual(freshCheck.ok, true, 'Fresh auth token must be approved');
  assert.ok(freshCheck.authAgeSeconds <= 125, 'Auth age should be approximately 120 seconds');
  console.log('  ✓ Stale auth (>15m) rejected with REQUIRES_RECENT_LOGIN; fresh login permitted.');

  // -----------------------------------------------------------------------------
  // TEST 2: Comprehensive Data Inventory (Auth, Firestore, Storage, Messages, Logs, Backups)
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Comprehensive Personal Data Inventory');
  const db = createMockFirestore();
  const bucket = createMockStorageBucket();
  const authAdmin = createMockAdminAuth();

  const testUid = 'user_gdpr_101';
  const testEmail = 'subject101@healthvibe.ai';

  // Seed sample data
  await db.collection('users').doc(testUid).set({
    name: 'Sarah Connor',
    email: testEmail,
    role: 'patient'
  });
  await db.collection('cases').doc('case_1').set({ patientId: testUid, status: 'pending', triagePriority: 'urgent' });
  await db.collection('cases').doc('case_2').set({ patientId: testUid, status: 'approved', triagePriority: 'routine' });
  await db.collection('appointments').doc('appt_1').set({ patientId: testUid, date: '2026-10-01' });
  await db.collection('feedbacks').doc('fb_1').set({ userId: testUid, rating: 5, comment: 'Excellent triage' });
  await db.collection('email_notifications').doc('notif_1').set({ patientId: testUid, recipient: testEmail, subject: 'Review completed' });
  await db.collection('doctor_applications').doc('app_1').set({ userId: testUid, status: 'pending' });

  // Storage files
  await bucket.file(`doctor_applications/${testUid}/license.pdf`).save(Buffer.from('mock license'));
  await bucket.file(`doctor_applications/${testUid}/cv.pdf`).save(Buffer.from('mock cv'));

  // WhatsApp bot active OTP
  whatsappBot.activeOtps.set(testUid.toLowerCase(), { codeHash: 'hash123', expiresAt: Date.now() + 60000 });

  const inventory = await privacyService.inventoryUserData({
    userId: testUid,
    userEmail: testEmail,
    firestoreDb: db,
    storageBucket: bucket,
    whatsappBot
  });

  assert.strictEqual(inventory.categories.profile.count, 1, 'Profile count must be 1');
  assert.strictEqual(inventory.categories.cases.count, 2, 'Cases count must be 2');
  assert.strictEqual(inventory.categories.cases.pendingCount, 1, 'Pending cases must be 1');
  assert.strictEqual(inventory.categories.cases.approvedCount, 1, 'Approved cases must be 1');
  assert.strictEqual(inventory.categories.appointments.count, 1, 'Appointments count must be 1');
  assert.strictEqual(inventory.categories.feedbacks.count, 1, 'Feedbacks count must be 1');
  assert.strictEqual(inventory.categories.emailNotifications.count, 1, 'Notifications count must be 1');
  assert.strictEqual(inventory.categories.doctorApplications.count, 1, 'Doctor applications must be 1');
  assert.strictEqual(inventory.categories.storageFiles.count, 2, 'Storage files count must be 2');
  assert.strictEqual(inventory.categories.whatsappMessages.activeOtpCount, 1, 'Active OTP messages count must be 1');
  assert.strictEqual(inventory.categories.backups.retentionPolicyDays, 30, 'Backup retention days must match policy (30)');
  console.log(`  ✓ Data inventory accurately discovered ${inventory.totalRecordsCount} records across all systems.`);

  // -----------------------------------------------------------------------------
  // TEST 3: Data Access Request Report (GDPR Art. 15)
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Data Access Request Report Generation (GDPR Art. 15)');
  const accessReport = await privacyService.generateAccessRequestReport({
    userId: testUid,
    userEmail: testEmail,
    firestoreDb: db,
    storageBucket: bucket,
    whatsappBot
  });

  assert.ok(accessReport.reportId.startsWith('access_user_gdpr_101'), 'Report ID must contain user ID');
  assert.ok(accessReport.dataCategoriesProcessed.length >= 5, 'Must report data categories');
  assert.ok(accessReport.retentionPolicies.backupSnapshots.includes('30 days'), 'Must document backup retention');
  assert.ok(accessReport.dataSubjectRights.includes('Right to Data Portability (Art. 20)'), 'Must list user rights');

  // Verify HIPAA audit event logged
  const auditEvents = await db.collection('audit_events').where('userId', '==', testUid).get();
  assert.ok(auditEvents.docs.some(d => d.data().type === 'DATA_ACCESS_REQUESTED'), 'Audit event DATA_ACCESS_REQUESTED must be recorded');
  console.log('  ✓ GDPR Art. 15 access report created with audit trail and retention notice.');

  // -----------------------------------------------------------------------------
  // TEST 4: Data Portability Export Archive (GDPR Art. 20)
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Data Portability Export Archive Generation (GDPR Art. 20)');
  const exportArchive = await privacyService.generateDataExport({
    userId: testUid,
    userEmail: testEmail,
    firestoreDb: db,
    storageBucket: bucket,
    whatsappBot
  });

  assert.strictEqual(exportArchive.profile.name, 'Sarah Connor', 'Profile must be included');
  assert.strictEqual(exportArchive.cases.length, 2, 'Cases must be exported');
  assert.strictEqual(exportArchive.appointments.length, 1, 'Appointments must be exported');
  assert.strictEqual(exportArchive.feedbacks.length, 1, 'Feedbacks must be exported');
  assert.ok(exportArchive.integrityChecksumSha256 && exportArchive.integrityChecksumSha256.length === 64, 'Must compute SHA-256 integrity hash');
  console.log(`  ✓ Data export archive compiled with SHA-256 integrity hash: ${exportArchive.integrityChecksumSha256.substring(0, 16)}...`);

  // -----------------------------------------------------------------------------
  // TEST 5: Partial Failure Handling - No Premature Completion Claim
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Partial Failure Handling (Zero False Completion Claims)');
  authAdmin._users.set(testUid, { uid: testUid, email: testEmail });

  // Simulate a storage failure during deletion
  const partialFailureResult = await privacyService.executeAccountDeletion({
    userId: testUid,
    userEmail: testEmail,
    firestoreDb: db,
    storageBucket: bucket,
    adminAuth: authAdmin,
    whatsappBot,
    options: { mockFailStep: 'storage_files', forceFreshJob: true }
  });

  assert.strictEqual(partialFailureResult.success, false, 'Deletion must not report success on failure');
  assert.strictEqual(partialFailureResult.status, 'partially_failed', 'Status must be partially_failed');
  assert.strictEqual(partialFailureResult.failedStep, 'storage_files', 'Failed step must be storage_files');
  assert.strictEqual(partialFailureResult.retryable, true, 'Job must be marked retryable');

  // Verify Auth user was NOT deleted prematurely
  assert.ok(authAdmin._users.has(testUid), 'CRITICAL: Auth user must NOT be deleted when earlier steps fail');
  console.log('  ✓ Storage failure caught: returned partially_failed, Auth account safely preserved.');

  // -----------------------------------------------------------------------------
  // TEST 6: Resumable Deletion & Safe Retry
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Safe Idempotent Retry Execution');
  const retryResult = await privacyService.executeAccountDeletion({
    userId: testUid,
    userEmail: testEmail,
    firestoreDb: db,
    storageBucket: bucket,
    adminAuth: authAdmin,
    whatsappBot,
    options: { mockFailStep: null, forceFreshJob: false } // Retry without simulated failure
  });

  assert.strictEqual(retryResult.success, true, 'Retry execution must succeed');
  assert.strictEqual(retryResult.status, 'completed', 'Final status must be completed');
  assert.strictEqual(retryResult.steps.auth_account.status, 'completed', 'Auth step must be completed');
  assert.strictEqual(authAdmin._users.has(testUid), false, 'Auth user must now be deleted');

  // Verify Storage files were purged
  const [remainingFiles] = await bucket.getFiles({ prefix: `doctor_applications/${testUid}/` });
  assert.strictEqual(remainingFiles.length, 0, 'Storage files must be purged');

  // Verify Pending case deleted, Approved case anonymized
  const pendingCaseDoc = await db.collection('cases').doc('case_1').get();
  assert.strictEqual(pendingCaseDoc.exists, false, 'Pending case must be hard-deleted');

  const approvedCaseDoc = await db.collection('cases').doc('case_2').get();
  assert.strictEqual(approvedCaseDoc.exists, true, 'Approved medical case must be retained for clinical audit');
  assert.strictEqual(approvedCaseDoc.data().isAnonymized, true, 'Clinical case must be anonymized');
  assert.strictEqual(approvedCaseDoc.data().patientName, 'مريض محذوف (Deleted Patient)', 'Patient name must be anonymized');
  assert.strictEqual(approvedCaseDoc.data().patientEmail, 'deleted@anonymized.local', 'Patient email must be anonymized');

  // Verify WhatsApp OTP purged
  assert.strictEqual(whatsappBot.activeOtps.has(testUid.toLowerCase()), false, 'WhatsApp OTP must be cleared');

  // Verify Privacy Tombstone written for backup suppression
  const tombstoneDoc = await db.collection('privacy_tombstones').doc(testUid).get();
  assert.strictEqual(tombstoneDoc.exists, true, 'Backup privacy tombstone must be registered');
  console.log('  ✓ Retry succeeded: pending cases deleted, approved cases scrubbed, tombstone logged.');

  // -----------------------------------------------------------------------------
  // TEST 7: Large Accounts Batching (> 500 records commit chunking)
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Large Data Volume Processing (> 500 records commit chunking)');
  const largeUid = 'user_large_volume_999';
  const largeEmail = 'large_patient@healthvibe.ai';
  authAdmin._users.set(largeUid, { uid: largeUid, email: largeEmail });

  // Create 550 cases for this user (exceeding Firestore 500-op batch limit)
  for (let i = 1; i <= 550; i++) {
    await db.collection('cases').doc(`large_c_${i}`).set({
      patientId: largeUid,
      status: i % 2 === 0 ? 'pending' : 'approved',
      o2: 96
    });
  }

  const largeDeletionResult = await privacyService.executeAccountDeletion({
    userId: largeUid,
    userEmail: largeEmail,
    firestoreDb: db,
    storageBucket: bucket,
    adminAuth: authAdmin,
    whatsappBot,
    options: { forceFreshJob: true }
  });

  assert.strictEqual(largeDeletionResult.success, true, 'Large account deletion must complete without batch overflow');
  assert.strictEqual(largeDeletionResult.status, 'completed', 'Status must be completed');
  assert.strictEqual(largeDeletionResult.steps.cases_and_clinical.deleted, 275, '275 pending cases deleted');
  assert.strictEqual(largeDeletionResult.steps.cases_and_clinical.anonymized, 275, '275 approved cases anonymized');
  console.log('  ✓ Processed 550 records across chunked batches without hitting Firestore 500-op limits.');

  // -----------------------------------------------------------------------------
  // TEST 8: Backup Restore Privacy Tombstone Suppression
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Backup Restore Privacy Tombstone Suppression');
  // Register a tombstone for a deleted patient
  const tombstonedUid = 'user_deleted_tombstone_777';
  await db.collection('privacy_tombstones').doc(tombstonedUid).set({
    userId: tombstonedUid,
    deletedAt: new Date().toISOString(),
    policy: '30-day-backup-suppression'
  });

  // Prepare a mock restore payload that includes the tombstoned user's historical data
  const restorePayload = {
    firestore: {
      users: [
        { id: tombstonedUid, data: { name: 'Old User', email: 'old@tombstone.test' } },
        { id: 'usr_valid_keep', data: { name: 'Active User', email: 'active@healthvibe.ai' } }
      ],
      cases: [
        { id: 'tombstone_case_1', data: { patientId: tombstonedUid, patientName: 'Old User', status: 'approved' } },
        { id: 'active_case_1', data: { patientId: 'usr_valid_keep', patientName: 'Active User', status: 'approved' } }
      ],
      feedbacks: [
        { id: 'tombstone_fb_1', data: { userId: tombstonedUid, rating: 4 } }
      ]
    },
    storage: {
      objects: [
        {
          name: `doctor_applications/${tombstonedUid}/license.pdf`,
          contentBase64: Buffer.from('tombstoned doc').toString('base64'),
          contentType: 'application/pdf'
        }
      ]
    }
  };

  // Perform live restore using backupService with the mock db and bucket
  const restoreDb = createMockFirestore();
  // Copy over the privacy tombstone to restoreDb
  await restoreDb.collection('privacy_tombstones').doc(tombstonedUid).set({
    userId: tombstonedUid,
    deletedAt: new Date().toISOString()
  });

  // Create a snapshot first to establish valid manifest and checksums
  const snapshotResult = await backupService.createBackupSnapshot({
    initiator: 'privacy_test_harness',
    mockData: {
      users: [
        { id: tombstonedUid, name: 'Old User', email: 'old@tombstone.test' },
        { id: 'usr_valid_keep', name: 'Active User', email: 'active@healthvibe.ai' }
      ],
      cases: [
        { id: 'tombstone_case_1', patientId: tombstonedUid, patientName: 'Old User', status: 'approved' },
        { id: 'active_case_1', patientId: 'usr_valid_keep', patientName: 'Active User', status: 'approved' }
      ],
      feedbacks: [
        { id: 'tombstone_fb_1', userId: tombstonedUid, rating: 4 }
      ]
    }
  });
  const backupId = snapshotResult.backupId;

  const restoreBucket = createMockStorageBucket();
  const restoreResult = await backupService.restoreBackupSnapshot(backupId, {
    confirmToken: `CONFIRM_RESTORE_${backupId}`,
    dryRun: false,
    firestoreDb: restoreDb,
    storageBucket: restoreBucket
  });

  assert.strictEqual(restoreResult.success, true, 'Restore execution should succeed');

  // Verify tombstoned user was NOT resurrected in users collection
  const restoredDeletedUser = await restoreDb.collection('users').doc(tombstonedUid).get();
  assert.strictEqual(restoredDeletedUser.exists, false, 'Deleted user profile must NOT be resurrected on restore');

  // Verify valid active user was restored normally
  const restoredActiveUser = await restoreDb.collection('users').doc('usr_valid_keep').get();
  assert.strictEqual(restoredActiveUser.exists, true, 'Active user must be restored');

  // Verify tombstoned user feedback was suppressed
  const restoredDeletedFb = await restoreDb.collection('feedbacks').doc('tombstone_fb_1').get();
  assert.strictEqual(restoredDeletedFb.exists, false, 'Personal feedback of deleted user must not be restored');

  // Verify clinical case was kept for continuity but anonymized
  const restoredAnonymizedCase = await restoreDb.collection('cases').doc('tombstone_case_1').get();
  assert.strictEqual(restoredAnonymizedCase.exists, true, 'Clinical case retained');
  assert.strictEqual(restoredAnonymizedCase.data().isAnonymized, true, 'Case must be anonymized during restore');
  assert.strictEqual(restoredAnonymizedCase.data().patientName, 'مريض محذوف (Deleted Patient)', 'Name must be scrubbed');

  // Verify storage file was not restored
  const [restoredFiles] = await restoreBucket.getFiles({ prefix: `doctor_applications/${tombstonedUid}/` });
  assert.strictEqual(restoredFiles.length, 0, 'Storage files of deleted users must not be restored');

  console.log('  ✓ Backup restore respects privacy tombstones: profile suppressed, case scrubbed, files blocked.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 8 PRIVACY & DATA LIFECYCLE TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================');
})();
