/**
 * state_machine_guards.test.js
 *
 * Targeted tests for `executeDoctorTransition` atomic state machine & clinical revision logic:
 *
 *  1. Invalid state transition is rejected with 400 INVALID_STATUS_TRANSITION
 *  2. Attempt to modify a closed case is rejected with 409 CASE_ALREADY_CLOSED
 *  3. Idempotent duplicate transition returns 200 with idempotent:true (no writes)
 *  4. Successful transition records a complete statusHistory entry
 *  5. Approval without reviewed clinical revision is rejected with 400 CLINICAL_REVISION_REQUIRED
 *  6. Approval with stale clinical revision is atomically rejected with 409 CLINICAL_DATA_CONFLICT
 *  7. Approval with changed clinical inputs or patient reply is rejected with 409 CLINICAL_DATA_CONFLICT
 *  8. Approval with matching clinical revision succeeds atomically with 200
 *
 * Run with: node tests/state_machine_guards.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

// ── Mock Firestore ──────────────────────────────────────────────────────────

function buildDatabase(initialCaseData) {
  let caseRecord = { ...initialCaseData };
  let writes = 0;
  let auditWrites = 0;
  let lastUpdateData = null;

  const caseRef = {
    _data: () => caseRecord,
    update(data) { writes++; lastUpdateData = data; Object.assign(caseRecord, data); },
    set() {}
  };
  const auditRef = {
    set(data) { auditWrites++; }
  };

  const db = {
    collection(name) {
      return {
        doc(id) {
          if (name === 'cases') {
            return {
              ...caseRef,
              get: async () => ({
                exists: Boolean(caseRecord),
                data: () => ({ ...caseRecord })
              })
            };
          }
          if (name === 'audit_events') return auditRef;
          if (name === 'users') return { get: async () => ({ exists: false }) };
          return { get: async () => ({ exists: false }) };
        },
        where() { return { get: async () => ({ docs: [] }) }; },
        add: async () => ({ id: 'audit-auto' })
      };
    },
    async runTransaction(callback) {
      let pendingUpdates = [];
      let pendingSets = [];

      const txn = {
        async get(ref) {
          return {
            exists: Boolean(caseRecord),
            data: () => ({ ...caseRecord })
          };
        },
        update(ref, data) {
          pendingUpdates.push({ ref, data });
        },
        set(ref, data) {
          pendingSets.push({ ref, data });
        }
      };

      const result = await callback(txn);

      for (const { data } of pendingUpdates) {
        writes++;
        lastUpdateData = data;
        Object.assign(caseRecord, data);
      }
      for (const {} of pendingSets) {
        auditWrites++;
      }
      return result;
    },
    _writes: () => writes,
    _auditWrites: () => auditWrites,
    _lastUpdate: () => lastUpdateData,
    _record: () => caseRecord
  };

  return db;
}

// ── Load backend server in VM sandbox ─────────────────────────────────────

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

function buildFirebaseAdmin(db) {
  const firestore = () => db;
  firestore.FieldValue = {
    serverTimestamp: () => '__SERVER_TS__',
    arrayUnion: value => [value]
  };
  return {
    apps: [{}],
    firestore,
    auth: () => ({
      verifyIdToken: async token => ({
        uid: token,
        email: `${token}@example.test`,
        email_verified: true,
        role: 'doctor'
      })
    })
  };
}

function loadServer(db) {
  const firebase = buildFirebaseAdmin(db);
  const ctx = {
    require: name => {
      if (name === 'firebase-admin') return firebase;
      if (name === 'dotenv') return { config() {} };
      if (name === './whatsapp-bot' || name === './backup-service') return {};
      return backendRequire(name);
    },
    module: { exports: {} },
    __dirname: path.dirname(serverPath),
    process: {
      env: {
        NODE_ENV: 'development',
        FIREBASE_PROJECT_ID: 'health-vibes-dev',
        EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
        USE_FIREBASE_EMULATOR: 'true',
        FIRESTORE_EMULATOR_HOST: 'localhost:8080',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
        FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199'
      },
      on() {},
      uptime: () => 1
    },
    console, Buffer, setTimeout, clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(serverPath, 'utf8'), ctx);
  return ctx.module.exports;
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function callEndpoint(server, route, doctorToken, body) {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${doctorToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

// ── Test runner ─────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;
  let failed = 0;

  async function runTest(name, fn) {
    try {
      await fn();
      console.log(`  ✔  ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✘  ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }

  const doctorProfile = {
    role: 'doctor',
    doctorApplicationStatus: 'approved',
    verifiedDoctor: true,
    clinicId: 'clinic-a',
    status: 'active'
  };

  const verifiedApp = {
    userId: 'doctor-1',
    status: 'approved',
    name: 'Verified Doctor',
    licenseNumber: 'LIC-001',
    specialty: 'General Medicine',
    clinic: 'Health Vibe Clinic'
  };

  function attachDoctorAuth(db) {
    const origCollection = db.collection.bind(db);
    db.collection = (name) => {
      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => ({
              exists: id === 'doctor-1',
              data: () => id === 'doctor-1' ? doctorProfile : {}
            })
          })
        };
      }
      if (name === 'doctor_applications') {
        return {
          where: (field, op, uid) => ({
            get: async () => ({
              docs: uid === 'doctor-1' ? [{ id: 'app-1', data: () => verifiedApp }] : []
            })
          })
        };
      }
      return origCollection(name);
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 1 — Invalid state transition (draft → approved) must return 400
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Invalid transition (draft → approved) returns 400 INVALID_STATUS_TRANSITION', async () => {
    const db = buildDatabase({
      id: 'case-t1',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'draft',
      clinicalRevision: 1
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/approve-clinical-case', 'doctor-1', {
        caseId: 'case-t1',
        clinicalRevision: 1,
        clinicalDiagnosis: 'Diagnosis',
        clinicalNotes: 'Notes about the patient',
        recommendations: ['Follow up in 7 days']
      });
      assert.equal(result.status, 400, `Expected 400, got ${result.status}: ${JSON.stringify(result.data)}`);
      assert.equal(result.data.error, 'INVALID_STATUS_TRANSITION', JSON.stringify(result.data));
      assert.ok(result.data.message.includes('draft'), `Error message should mention 'draft': ${result.data.message}`);
      assert.equal(db._writes(), 0, 'No Firestore writes must occur for an invalid transition');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 2 — Attempt to modify a closed case must return 409
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Modifying a closed case returns 409 CASE_ALREADY_CLOSED', async () => {
    const db = buildDatabase({
      id: 'case-t2',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'closed',
      closedAt: '2026-01-01T00:00:00Z',
      closedBy: 'doctor-1'
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/escalate-clinical-case', 'doctor-1', {
        caseId: 'case-t2',
        note: 'Trying to reopen this case'
      });
      assert.equal(result.status, 409, `Expected 409, got ${result.status}: ${JSON.stringify(result.data)}`);
      assert.equal(result.data.error, 'CASE_ALREADY_CLOSED', JSON.stringify(result.data));
      assert.equal(db._writes(), 0, 'No Firestore writes must occur when case is closed');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 3 — Duplicate transition (idempotent) returns 200 without re-writing
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Duplicate transition (already in target status) is idempotent — 200, no writes', async () => {
    const db = buildDatabase({
      id: 'case-t3',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'more_info_requested'
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/transition-case-status', 'doctor-1', {
        caseId: 'case-t3',
        targetStatus: 'more_info_requested',
        note: 'Already requested — sending again by accident'
      });
      assert.equal(result.status, 200, `Expected 200 idempotent, got ${result.status}: ${JSON.stringify(result.data)}`);
      assert.ok(result.data.success, JSON.stringify(result.data));
      assert.ok(result.data.idempotent, 'Response must set idempotent:true for duplicate requests');
      assert.equal(db._writes(), 0, 'Idempotent duplicate must not write to Firestore');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 4 — Successful transition records complete statusHistory entry
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Successful transition records statusHistory with previousStatus, changedAt, changedByRole, reason', async () => {
    const db = buildDatabase({
      id: 'case-t4',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'under_review'
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const reasonNote = 'Need additional imaging results';
      const result = await callEndpoint(server, '/api/doctor/transition-case-status', 'doctor-1', {
        caseId: 'case-t4',
        targetStatus: 'more_info_requested',
        note: reasonNote
      });
      assert.equal(result.status, 200, `Expected 200, got ${result.status}: ${JSON.stringify(result.data)}`);
      assert.ok(result.data.success, JSON.stringify(result.data));

      const update = db._lastUpdate();
      assert.ok(update, 'Update must have been written');
      assert.ok(Array.isArray(update.statusHistory), 'statusHistory must be an array');
      const entry = update.statusHistory[0];
      assert.equal(entry.status, 'more_info_requested', 'entry.status');
      assert.equal(entry.previousStatus, 'under_review', 'entry.previousStatus must capture old status');
      assert.ok(entry.changedAt, 'entry.changedAt must be set');
      assert.ok(!isNaN(Date.parse(entry.changedAt)), `entry.changedAt must be an ISO date string, got: ${entry.changedAt}`);
      assert.equal(entry.changedByRole, 'doctor', 'entry.changedByRole must be "doctor"');
      assert.ok(entry.reason, 'entry.reason must be set');
      assert.equal(entry.reason, reasonNote, `entry.reason should match submitted note: ${entry.reason}`);
      assert.equal(entry.changedBy, 'doctor-1', 'entry.changedBy must be the actor uid');
      assert.equal(db._writes(), 1, 'Exactly one Firestore case update must occur');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 5 — Approval without reviewed clinical revision returns 400 CLINICAL_REVISION_REQUIRED
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Approval without clinical revision returns 400 CLINICAL_REVISION_REQUIRED', async () => {
    const db = buildDatabase({
      id: 'case-t5',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'under_review',
      clinicalRevision: 1
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/approve-clinical-case', 'doctor-1', {
        caseId: 'case-t5',
        clinicalDiagnosis: 'Bronchitis',
        clinicalNotes: 'Mild cough',
        recommendations: ['Rest']
        // clinicalRevision missing
      });
      assert.equal(result.status, 400, `Expected 400, got ${result.status}`);
      assert.equal(result.data.error, 'CLINICAL_REVISION_REQUIRED');
      assert.equal(db._writes(), 0, 'No writes on missing revision');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 6 — Approval with stale clinical revision returns 409 CLINICAL_DATA_CONFLICT
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Approval with stale revision (reviewed: 1, current: 2) returns 409 conflict', async () => {
    const db = buildDatabase({
      id: 'case-t6',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'under_review',
      clinicalRevision: 2, // case was updated by another tab to rev 2
      oxygenLevel: 88,
      patientResponse: 'Fever has increased'
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      // Doctor attempts approval with revision 1 they originally viewed
      const result = await callEndpoint(server, '/api/doctor/approve-clinical-case', 'doctor-1', {
        caseId: 'case-t6',
        clinicalRevision: 1,
        clinicalDiagnosis: 'Bronchitis',
        clinicalNotes: 'Preserving doctor notes',
        recommendations: ['Follow up']
      });
      assert.equal(result.status, 409, `Expected 409 conflict, got ${result.status}`);
      assert.equal(result.data.error, 'CLINICAL_DATA_CONFLICT');
      assert.ok(result.data.conflict, 'Response must include structured conflict data');
      assert.equal(result.data.conflict.currentRevision, 2);
      assert.equal(result.data.conflict.reviewedRevision, 1);
      assert.ok(result.data.conflict.updatedCase, 'Must return updated case data');
      assert.equal(result.data.conflict.updatedCase.oxygenLevel, 88);
      assert.equal(result.data.conflict.updatedCase.patientResponse, 'Fever has increased');
      assert.equal(db._writes(), 0, 'Atomic rollback: zero writes on conflict');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 7 — Approval with changed clinical inputs or patient reply returns 409
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Approval with changed clinical inputs/patient reply in baseline returns 409', async () => {
    const db = buildDatabase({
      id: 'case-t7',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'under_review',
      clinicalRevision: 1,
      oxygenLevel: 89,
      patientResponse: 'New reply from patient'
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/approve-clinical-case', 'doctor-1', {
        caseId: 'case-t7',
        clinicalRevision: 1,
        reviewedSnapshot: {
          oxygenLevel: 95, // doctor reviewed 95, but case is now 89
          patientResponse: null // doctor reviewed null, but case now has reply
        },
        clinicalDiagnosis: 'Bronchitis',
        clinicalNotes: 'Initial notes',
        recommendations: ['Follow up']
      });
      assert.equal(result.status, 409, `Expected 409 conflict, got ${result.status}`);
      assert.equal(result.data.error, 'CLINICAL_DATA_CONFLICT');
      assert.ok(result.data.conflict.changedFields.includes('oxygenLevel'));
      assert.ok(result.data.conflict.changedFields.includes('patientResponse'));
      assert.equal(db._writes(), 0, 'Atomic rollback: zero writes on conflict');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 8 — Approval with matching clinical revision succeeds atomically with 200
  // ────────────────────────────────────────────────────────────────────────────
  await runTest('Approval with matching clinical revision succeeds with 200 and records approval', async () => {
    const db = buildDatabase({
      id: 'case-t8',
      patientId: 'patient-1',
      assignedDoctorId: 'doctor-1',
      status: 'under_review',
      clinicalRevision: 2
    });
    attachDoctorAuth(db);

    const app = loadServer(db);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const result = await callEndpoint(server, '/api/doctor/approve-clinical-case', 'doctor-1', {
        caseId: 'case-t8',
        clinicalRevision: 2,
        clinicalDiagnosis: 'Verified Bronchial Irritation',
        clinicalNotes: 'Oxygen stable at 97%, lungs clear',
        recommendations: ['Follow up in 5 days'],
        medications: 'Salbutamol 100mcg'
      });
      assert.equal(result.status, 200, `Expected 200, got ${result.status}: ${JSON.stringify(result.data)}`);
      assert.ok(result.data.success);
      assert.equal(db._writes(), 1, 'Approval update written to Firestore');
      const update = db._lastUpdate();
      assert.equal(update.status, 'approved');
      assert.equal(update.doctorApproved, true);
      assert.equal(update.clinicalRevision, 2);
      assert.equal(update.approvingDoctorId, 'doctor-1');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})().catch(err => { console.error(err); process.exitCode = 1; });
