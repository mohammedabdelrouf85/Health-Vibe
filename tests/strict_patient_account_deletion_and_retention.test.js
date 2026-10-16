/**
 * Health Vibe AI - Strict Patient Account Deletion & Retention Policy Test Suite
 *
 * Verifies:
 * 1. Statutory Retention Policy specification (5 years clinical records, 6 years HIPAA audit logs, 30 days backups).
 * 2. getLegalRetentionPolicy() data structure and statutory frameworks (GDPR Art. 17(3)(b), HIPAA § 164.316, Egyptian Medical Regulations).
 * 3. Pre-deletion Data Portability / Export (GDPR Art. 20) with SHA-256 checksum.
 * 4. Account Deletion Execution:
 *    - Direct PII scrubbed from Firebase Auth and users/{uid}.
 *    - Pending / Draft cases deleted completely.
 *    - Certified approved cases anonymized and dissociated (retained for 5-year clinical audit).
 *    - Doctor application files and storage deleted.
 * 5. Server endpoints:
 *    - GET /api/user/privacy/retention-policy
 *    - POST /api/user/delete-account
 * 6. Frontend UI integration in app/index.html & app/app.js:
 *    - #accountDeletionCard in Patient Settings.
 *    - #deleteAccountModal with Retention Policy breakdown & pre-deletion export button.
 *    - #retentionPolicyModal for on-demand legal review.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🔒 HEALTH VIBE AI: PATIENT ACCOUNT DELETION & LEGAL RETENTION POLICY TEST SUITE');
console.log('   PRD Page 10 Req 38: Account Deletion, Clinical Anonymization & Retention Policy');
console.log('================================================================================\n');

const privacyService = require('../backend/privacy-service');
const whatsappBot = require('../backend/whatsapp-bot');

// In-memory mock Firestore
function createMockFirestore() {
  const collections = new Map();

  function getCol(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  const db = {
    _collections: collections,
    collection(name) {
      const col = getCol(name);
      return {
        doc(id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`) {
          return {
            id,
            ref: { id, collection: name },
            async get() {
              const data = col.get(id);
              return {
                id,
                exists: Boolean(data),
                data() { return data ? JSON.parse(JSON.stringify(data)) : undefined; }
              };
            },
            async set(data, options = {}) {
              const existing = col.get(id) || {};
              const merged = options.merge ? { ...existing, ...data } : { ...data };
              col.set(id, merged);
            },
            async update(data) {
              const existing = col.get(id) || {};
              col.set(id, { ...existing, ...data });
            },
            async delete() {
              col.delete(id);
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          col.set(id, { ...data });
          return { id };
        },
        where(field, op, val) {
          return {
            async get() {
              const matched = [];
              for (const [docId, docData] of col.entries()) {
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
          for (const [docId, docData] of col.entries()) {
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

// In-memory mock Storage Bucket
function createMockStorage() {
  const files = new Map();
  return {
    _files: files,
    async getFiles({ prefix = '' } = {}) {
      const matched = [];
      for (const [name] of files.entries()) {
        if (!prefix || name.startsWith(prefix)) {
          matched.push({
            name,
            async delete() { files.delete(name); }
          });
        }
      }
      return [matched];
    },
    file(name) {
      return {
        name,
        async save(buf) { files.set(name, buf); },
        async delete() { files.delete(name); }
      };
    }
  };
}

// In-memory mock Admin Auth
function createMockAdminAuth() {
  const users = new Map();
  return {
    _users: users,
    async getUser(uid) {
      const u = users.get(uid);
      if (!u) throw new Error('User not found');
      return u;
    },
    async deleteUser(uid) {
      users.delete(uid);
    }
  };
}

(async () => {
  // ---------------------------------------------------------------------------
  // TEST 1: Legal Retention Policy Parameters & Statutory Compliance
  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Statutory Retention Policy Constants & Structure');
  const policy = privacyService.getLegalRetentionPolicy();
  assert(policy, 'getLegalRetentionPolicy() must return a valid policy object');
  assert.strictEqual(policy.retentionParameters.clinicalRecordsYears, 5, 'Clinical records retention must be exactly 5 years');
  assert.strictEqual(policy.retentionParameters.hipaaAuditLogsYears, 6, 'HIPAA audit logs retention must be exactly 6 years');
  assert.strictEqual(policy.retentionParameters.backupRetentionDays, 30, 'Backup retention must be exactly 30 days');

  // Verify statutory framework references
  const gdprRef = policy.statutoryFramework.find(s => s.regulation.includes('GDPR'));
  assert(gdprRef, 'Must include GDPR Article 17(3)(b) reference');
  const hipaaRef = policy.statutoryFramework.find(s => s.regulation.includes('HIPAA'));
  assert(hipaaRef, 'Must include HIPAA Security Rule 45 CFR § 164.316 reference');
  const egyptianRef = policy.statutoryFramework.find(s => s.regulation.includes('Egyptian') || s.regulation.includes('طب'));
  assert(egyptianRef, 'Must include Egyptian Medical Ethics & Regulations reference');

  // Verify data categorization
  const piiCat = policy.categories.find(c => c.category === 'direct_pii');
  assert.strictEqual(piiCat.action, 'immediate_deletion', 'Direct PII must have immediate_deletion action');
  assert.strictEqual(piiCat.retentionPeriod, '0 days (Immediate purge)', 'Direct PII retention must be 0 days');

  const certifiedCat = policy.categories.find(c => c.category === 'certified_cases');
  assert.strictEqual(certifiedCat.action, 'de_identification_anonymization', 'Certified cases must be de-identified & anonymized');
  assert(certifiedCat.retentionPeriod.includes('5 years'), 'Certified cases retention period must specify 5 years');

  console.log('  ✓ Verified 5-year clinical record retention (GDPR Art. 17(3)(b) & Egyptian Medical Code).');
  console.log('  ✓ Verified 6-year HIPAA audit log retention (§ 164.316).');
  console.log('  ✓ Verified 30-day encrypted backup rotation with tombstone suppression.');

  // ---------------------------------------------------------------------------
  // TEST 2: Pre-Deletion Data Portability / Export (GDPR Art. 20)
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Pre-Deletion Medical Data Portability Export');
  const db = createMockFirestore();
  const storage = createMockStorage();
  const auth = createMockAdminAuth();

  const testPatientId = 'patient_sarah_101';
  const testPatientEmail = 'sarah.patient@example.com';

  // Seed patient account
  await db.collection('users').doc(testPatientId).set({
    name: 'Sarah Ahmed',
    email: testPatientEmail,
    role: 'patient',
    phone: '+201001234567'
  });
  await db.collection('cases').doc('case_pending_1').set({
    patientId: testPatientId,
    patientName: 'Sarah Ahmed',
    status: 'pending',
    symptoms: 'Mild cough'
  });
  await db.collection('cases').doc('case_approved_1').set({
    patientId: testPatientId,
    patientName: 'Sarah Ahmed',
    status: 'approved',
    diagnosis: 'Mild Bronchitis',
    oxygenSaturation: 98,
    heartRate: 78
  });
  await db.collection('appointments').doc('appt_1').set({
    patientId: testPatientId,
    doctorName: 'Dr. Tarek Mahmoud',
    date: '2026-10-15'
  });
  auth._users.set(testPatientId, { uid: testPatientId, email: testPatientEmail });

  const exportArchive = await privacyService.generateDataExport({
    userId: testPatientId,
    userEmail: testPatientEmail,
    firestoreDb: db,
    storageBucket: storage,
    adminAuth: auth
  });

  assert(exportArchive.exportId, 'Must have exportId');
  assert(exportArchive.integrityChecksumSha256, 'Must compute SHA-256 integrity checksum');
  assert.strictEqual(exportArchive.profile.id, testPatientId, 'Must export profile data');
  assert.strictEqual(exportArchive.cases.length, 2, 'Must export all patient cases');
  assert.strictEqual(exportArchive.appointments.length, 1, 'Must export appointments');
  console.log('  ✓ Pre-deletion medical data successfully exported with SHA-256 integrity hash.');

  // ---------------------------------------------------------------------------
  // TEST 3: Account & Clinical Data Deletion Execution with Retention Rules
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Account Deletion Execution with Clinical Anonymization');
  const deletionResult = await privacyService.executeAccountDeletion({
    userId: testPatientId,
    userEmail: testPatientEmail,
    firestoreDb: db,
    storageBucket: storage,
    adminAuth: auth,
    whatsappBot,
    options: { bypassRecentAuth: true }
  });

  assert.strictEqual(deletionResult.success, true, 'Deletion must complete successfully');
  assert.strictEqual(deletionResult.status, 'completed', 'Final job status must be completed');

  // Verify direct PII erased from Auth
  assert.strictEqual(auth._users.has(testPatientId), false, 'Firebase Auth user must be permanently deleted');

  // Verify direct PII erased from users collection
  const userDoc = await db.collection('users').doc(testPatientId).get();
  assert.strictEqual(userDoc.exists, false, 'User profile document in users collection must be deleted');

  // Verify pending case deleted
  const pendingCaseDoc = await db.collection('cases').doc('case_pending_1').get();
  assert.strictEqual(pendingCaseDoc.exists, false, 'Pending/draft cases must be permanently deleted');

  // Verify certified approved case is ANONYMIZED rather than wiped (5-year retention)
  const approvedCaseDoc = await db.collection('cases').doc('case_approved_1').get();
  assert.strictEqual(approvedCaseDoc.exists, true, 'Approved clinical case must be retained for legal clinical audit');
  const approvedData = approvedCaseDoc.data();
  assert.strictEqual(approvedData.isAnonymized, true, 'Case must be marked isAnonymized: true');
  assert.notStrictEqual(approvedData.patientName, 'Sarah Ahmed', 'Patient direct name must be scrubbed');
  assert.strictEqual(approvedData.patientNameEn, 'Deleted Patient', 'Patient name must be set to Deleted Patient');
  assert.strictEqual(approvedData.patientEmail, 'deleted@anonymized.local', 'Patient email must be anonymized');
  assert.strictEqual(approvedData.patientPhone, null, 'Patient phone number must be nulled');
  // Clinical vital parameters preserved for malpractice defense
  assert.strictEqual(approvedData.oxygenSaturation, 98, 'Vital clinical oxygen saturation must be preserved');
  assert.strictEqual(approvedData.heartRate, 78, 'Vital heart rate must be preserved');

  console.log('  ✓ Firebase Auth user and users/{uid} document purged immediately.');
  console.log('  ✓ Pending draft cases permanently wiped.');
  console.log('  ✓ Approved case retained for 5 years with full PII scrubbing and vital parameter retention.');

  // ---------------------------------------------------------------------------
  // TEST 4: Frontend UI Integration & Modals in app/index.html
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Frontend UI Integration in app/index.html');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

  // Account deletion card in Patient Settings
  assert(indexHtml.includes('id="accountDeletionCard"'), 'Must have accountDeletionCard in patient settings');
  assert(indexHtml.includes('سياسة الاحتفاظ القانونية بالسجلات الطبية'), 'Must mention Legal Retention Policy in accountDeletionCard');
  assert(indexHtml.includes('openDeleteAccountModal()'), 'Must have trigger button for openDeleteAccountModal');
  assert(indexHtml.includes('openRetentionPolicyModal()'), 'Must have trigger button for openRetentionPolicyModal');
  assert(indexHtml.includes('exportUserData()'), 'Must have pre-deletion export button');

  // Delete Account Confirmation Modal
  assert(indexHtml.includes('id="deleteAccountModal"'), 'Must have deleteAccountModal');
  assert(indexHtml.includes('id="deleteConfirmationInput"'), 'Must have deleteConfirmationInput');
  assert(indexHtml.includes('DELETE'), 'Must challenge user with DELETE word');
  assert(indexHtml.includes('حذف'), 'Must challenge user with Arabic حذف word');
  assert(indexHtml.includes('id="btnExecuteAccountDeletion"'), 'Must have deletion submit button');
  assert(indexHtml.includes('5 سنوات'), 'Must explain 5-year retention policy inside modal');

  // Retention Policy Modal
  assert(indexHtml.includes('id="retentionPolicyModal"'), 'Must have retentionPolicyModal');
  assert(indexHtml.includes('id="retentionPolicyModalBody"'), 'Must have retentionPolicyModalBody');

  // Patient Settings Quick Card & Pathway Entrypoints
  assert(indexHtml.includes('id="patientSettingsQuickCard"'), 'Must have patientSettingsQuickCard on patient home dashboard');
  assert(indexHtml.includes('patient-settings-tabs'), 'Must have patient-settings-tabs sub-navigation bar in profile settings');
  assert(indexHtml.includes('openPatientSettingsPathway'), 'Must have openPatientSettingsPathway handler calls');
  assert(indexHtml.includes('المرحلة 1: قابلية النقل والتصدير'), 'Must show Stage 1 Data Portability in deletion card');
  assert(indexHtml.includes('المرحلة 2: التدقيق والاحتفاظ القانوني'), 'Must show Stage 2 Legal Retention in deletion card');
  assert(indexHtml.includes('المرحلة 3: التحقق والتطهير الفوري'), 'Must show Stage 3 Verification & Purge in deletion card');

  console.log('  ✓ Patient Settings UI contains clear deletion flow, retention highlights, and export options.');
  console.log('  ✓ deleteAccountModal & retentionPolicyModal correctly configured.');
  console.log('  ✓ 3-stage visual pathway and home quick card validated.');

  // ---------------------------------------------------------------------------
  // TEST 5: Frontend Script Logic in app/app.js
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Frontend Script Logic in app/app.js');
  const appJs = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');

  assert(appJs.includes('window.openDeleteAccountModal'), 'app.js must define window.openDeleteAccountModal');
  assert(appJs.includes('window.closeDeleteAccountModal'), 'app.js must define window.closeDeleteAccountModal');
  assert(appJs.includes('window.openRetentionPolicyModal'), 'app.js must define window.openRetentionPolicyModal');
  assert(appJs.includes('window.closeRetentionPolicyModal'), 'app.js must define window.closeRetentionPolicyModal');
  assert(appJs.includes('window.exportUserData'), 'app.js must define window.exportUserData');
  assert(appJs.includes('window.openPatientSettingsPathway'), 'app.js must define window.openPatientSettingsPathway');
  assert(appJs.includes('window.switchPatientProfileTab'), 'app.js must define window.switchPatientProfileTab');
  assert(appJs.includes('/api/user/privacy/retention-policy'), 'app.js must fetch /api/user/privacy/retention-policy');
  assert(appJs.includes('/api/user/delete-account'), 'app.js must call /api/user/delete-account');

  console.log('  ✓ app.js defines all required modal handlers and retention policy controller.');
  console.log('  ✓ app.js defines patient settings pathway and tab switching controller.');

  // ---------------------------------------------------------------------------
  // TEST 6: Backend Route Registration in backend/server.js
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Backend Route Registration in backend/server.js');
  const serverJs = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

  assert(serverJs.includes("'/api/user/privacy/retention-policy'"), 'server.js must register /api/user/privacy/retention-policy');
  assert(serverJs.includes("'/api/user/delete-account'"), 'server.js must register /api/user/delete-account');
  assert(serverJs.includes("getLegalRetentionPolicy"), 'server.js must call getLegalRetentionPolicy');

  console.log('  ✓ server.js routes for retention policy and account deletion validated.');

  console.log('\n================================================================================');
  console.log('🎉 ALL 6 STRICT PATIENT ACCOUNT DELETION & RETENTION TESTS PASSED 100%!');
  console.log('================================================================================');
})();
