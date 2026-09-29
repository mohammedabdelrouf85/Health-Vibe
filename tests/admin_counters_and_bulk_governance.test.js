/**
 * HEALTH VIBE AI: ADMIN COUNTERS, EVENT-BASED METRICS & BULK GOVERNANCE TEST SUITE
 * 
 * Verifies:
 * 1. Authoritative sources for all 9 counters: users, verified doctors, clinics,
 *    cases, appointments, active users, reported accounts, verification requests, support requests.
 * 2. Event-based metrics calculations (response time, approval time, patients/day, workload)
 *    with date-range and clinic filtering.
 * 3. Displaying "Unavailable" / "غير متاح" when data is missing (no deceptive zeros or fabricated baselines).
 * 4. Permitting only appropriate administrative bulk operations.
 * 5. Strict rejection of bulk clinical approvals (BULK_CLINICAL_APPROVAL_PROHIBITED).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const AdminService = require('../app/modules/admin/admin-service');

console.log('==================================================================');
console.log('🏛️  HEALTH VIBE AI: ADMIN COUNTERS & BULK GOVERNANCE TEST SUITE');
console.log('   Authoritative Counters, Event Metrics, Unavailable State & Bulk Guard');
console.log('==================================================================\n');

// Mock collections and records
const dataStore = new Map();
const userAccounts = {
  'super-admin': { uid: 'super-admin', role: 'super_admin', isOwner: true, email: 'admin@healthvibes.org', email_verified: true },
  'clinic-admin-cairo': { uid: 'clinic-admin-cairo', role: 'clinic_admin', clinicId: 'cairo-central', email: 'cairo.admin@healthvibes.org', email_verified: true },
  'doctor-tarek': { uid: 'doctor-tarek', role: 'doctor', clinicId: 'cairo-central', verifiedDoctor: true, email: 'tarek@healthvibes.org', email_verified: true },
  'patient-1': { uid: 'patient-1', role: 'patient', clinicId: 'cairo-central', email: 'p1@test.org', email_verified: true },
  'patient-2': { uid: 'patient-2', role: 'patient', clinicId: 'cairo-central', email: 'p2@test.org', email_verified: true },
  'patient-3': { uid: 'patient-3', role: 'patient', clinicId: 'cairo-central', email: 'p3@test.org', email_verified: true }
};

// Seed Firestore data
// 1. Users
Object.entries(userAccounts).forEach(([uid, u]) => {
  dataStore.set(`users/${uid}`, {
    ...u,
    status: 'active',
    lastActiveAt: new Date(Date.now() - 3600000).toISOString()
  });
});
// Add a reported / suspended account
dataStore.set('users/bad-user', {
  uid: 'bad-user',
  role: 'patient',
  status: 'suspended',
  suspended: true,
  accountStatus: 'suspended'
});

// 2. Doctor Applications (Verification Requests)
dataStore.set('doctor_applications/app-pending-1', {
  id: 'app-pending-1',
  userId: 'doc-pending-1',
  status: 'pending',
  clinic: 'Cairo Central Clinic'
});
dataStore.set('doctor_applications/app-approved-1', {
  id: 'app-approved-1',
  userId: 'doctor-tarek',
  status: 'approved',
  clinic: 'Cairo Central Clinic'
});

// 3. Clinics
dataStore.set('clinics/cairo-central', { id: 'cairo-central', name: 'Cairo Central Clinic', status: 'active' });
dataStore.set('clinics/alexandria-branch', { id: 'alexandria-branch', name: 'Alexandria Branch Clinic', status: 'active' });

// 4. Cases (Intake -> Review -> Approval)
const baseTime = Date.parse('2026-06-01T10:00:00Z');
dataStore.set('cases/case-1', {
  id: 'case-1',
  patientId: 'patient-1',
  clinicId: 'cairo-central',
  status: 'approved',
  submittedAt: new Date(baseTime).toISOString(),
  firstReviewedAt: new Date(baseTime + 10 * 60000).toISOString(), // 10 min response
  approvedAt: new Date(baseTime + 40 * 60000).toISOString(),     // 40 min approval
  assignedDoctorId: 'doctor-tarek',
  approvingDoctorName: 'Dr. Tarek'
});
dataStore.set('cases/case-2', {
  id: 'case-2',
  patientId: 'patient-2',
  clinicId: 'cairo-central',
  status: 'approved',
  submittedAt: new Date(baseTime + 60 * 60000).toISOString(),
  firstReviewedAt: new Date(baseTime + 80 * 60000).toISOString(), // 20 min response
  approvedAt: new Date(baseTime + 120 * 60000).toISOString(),    // 60 min approval
  assignedDoctorId: 'doctor-tarek',
  approvingDoctorName: 'Dr. Tarek'
});
dataStore.set('cases/case-3', {
  id: 'case-3',
  patientId: 'patient-3',
  clinicId: 'cairo-central',
  status: 'under_review',
  submittedAt: new Date(baseTime + 120 * 60000).toISOString(),
  firstReviewedAt: new Date(baseTime + 150 * 60000).toISOString(), // 30 min response
  assignedDoctorId: 'doctor-tarek'
});
// Demo case to ensure demo filtering
dataStore.set('cases/demo_case_ignore', {
  id: 'demo_case_ignore',
  isDemo: true,
  patientId: 'patient-demo',
  clinicId: 'cairo-central',
  status: 'approved'
});

// 5. Appointments
dataStore.set('appointments/appt-1', {
  id: 'appt-1',
  patientId: 'patient-1',
  clinicId: 'cairo-central',
  doctorId: 'doctor-tarek',
  status: 'confirmed',
  appointmentDate: new Date(baseTime).toISOString()
});
dataStore.set('appointments/demo_appt', {
  id: 'demo_appt',
  isDemo: true,
  patientId: 'patient-demo'
});

// 6. Support Requests & Feedback
dataStore.set('support_tickets/ticket-1', {
  id: 'ticket-1',
  status: 'open',
  title: 'Cannot access laboratory report'
});
dataStore.set('feedbacks/fb-1', {
  id: 'fb-1',
  status: 'open',
  reviewRequired: true,
  rating: 4
});

// 7. Reported Accounts
dataStore.set('reported_accounts/rep-1', {
  id: 'rep-1',
  targetUserId: 'bad-user',
  reason: 'Spam activity'
});

function createSnapshot(key) {
  const docData = dataStore.get(key);
  return {
    id: key.split('/')[1],
    exists: dataStore.has(key),
    data: () => docData
  };
}

function mockCollection(name, filters = []) {
  return {
    doc: id => ({
      get: async () => createSnapshot(`${name}/${id}`),
      set: async (val, opts) => {
        const existing = dataStore.get(`${name}/${id}`) || {};
        dataStore.set(`${name}/${id}`, opts && opts.merge ? { ...existing, ...val } : val);
      },
      update: async val => {
        const existing = dataStore.get(`${name}/${id}`) || {};
        dataStore.set(`${name}/${id}`, { ...existing, ...val });
      }
    }),
    where: (field, op, val) => mockCollection(name, [...filters, [field, op, val]]),
    orderBy: () => mockCollection(name, filters),
    limit: () => mockCollection(name, filters),
    get: async () => {
      const keys = [...dataStore.keys()].filter(k => k.startsWith(`${name}/`));
      const docs = keys.map(createSnapshot).filter(snap => {
        const d = snap.data();
        return filters.every(([f, op, val]) => op === '==' ? d[f] === val : true);
      });
      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach: fn => docs.forEach(fn)
      };
    }
  };
}

const mockFirestore = () => ({
  collection: mockCollection,
  batch: () => ({
    set: (ref, data) => ref.set(data),
    update: (ref, data) => ref.update(data),
    commit: async () => {}
  })
});
mockFirestore.FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: v => [v]
};

const mockFirebase = {
  apps: [{}],
  firestore: mockFirestore,
  auth: () => ({
    verifyIdToken: async (token) => {
      const u = userAccounts[token];
      if (!u) throw new Error(`Unknown token: ${token}`);
      return { ...u };
    },
    listUsers: async () => ({
      users: Object.values(userAccounts).map(u => ({
        uid: u.uid,
        email: u.email,
        customClaims: { role: u.role },
        metadata: { creationTime: '2026-01-01T00:00:00Z' }
      })),
      pageToken: null
    })
  })
};

const sandbox = {
  require: name => {
    if (name === 'firebase-admin') return mockFirebase;
    if (name === 'dotenv') return { config() {} };
    if (['./whatsapp-bot', './backup-service'].includes(name)) return {};
    return backendRequire(name);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true'
    },
    on() {},
    uptime: () => 1
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), sandbox);

const sandboxedApp = sandbox.module.exports;

// Async test runner
(async () => {
  const server = sandboxedApp.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, token, body = null) {
    const res = await fetch(base + route, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsed = await res.json();
    return { status: res.status, body: parsed };
  }

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Authoritative Sources for the 9 Counters
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 1: Authoritative Sources for the 9 Counters');
    const adminMetrics = await request('GET', '/api/admin/metrics', 'super-admin');

    assert.equal(adminMetrics.status, 200, 'GET /api/admin/metrics returns 200 for super_admin');
    assert.equal(adminMetrics.body.success, true);

    const { counters, sources } = adminMetrics.body;
    assert.ok(counters, 'Counters dictionary present');
    assert.ok(sources, 'Sources metadata present');

    const expectedKeys = [
      'users',
      'verifiedDoctors',
      'clinics',
      'cases',
      'appointments',
      'activeUsers',
      'reportedAccounts',
      'verificationRequests',
      'supportRequests'
    ];

    for (const key of expectedKeys) {
      assert.ok(key in counters, `Counter '${key}' exists in counters`);
      assert.equal(typeof counters[key], 'number', `Counter '${key}' is a number`);
      assert.ok(key in sources, `Source for '${key}' is documented`);
      assert.ok(sources[key].length > 10, `Source description for '${key}' is informative`);
    }

    // Verify concrete counter values from seeded data
    assert.equal(counters.verifiedDoctors, 1, 'Verified doctors counter equals 1');
    assert.equal(counters.cases, 3, 'Authentic non-demo cases counter equals 3');
    assert.equal(counters.appointments, 1, 'Authentic non-demo appointments counter equals 1');
    assert.equal(counters.verificationRequests, 1, 'Pending doctor applications counter equals 1');
    assert.equal(counters.reportedAccounts, 1, 'Reported accounts counter equals 1');
    assert.equal(counters.supportRequests, 2, 'Support requests counter equals 2 (1 ticket + 1 feedback)');
    assert.ok(counters.clinics >= 2, 'Clinics counter equals at least 2');

    console.log('  ✓ All 9 authoritative counters returned with verified data source origin:');
    expectedKeys.forEach(k => {
      console.log(`    - ${k.padEnd(22)}: ${counters[k]} (Source: ${sources[k].slice(0, 50)}...)`);
    });
    console.log('');

    // ---------------------------------------------------------------------------
    // TEST 2: Event-Based Calculations with Date-Range & Clinic Filtering (Backend)
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 2: Event-Based Metrics with Date-Range & Clinic Filtering (Backend)');

    const kpiFiltered = await request(
      'GET',
      '/api/kpi/metrics?startDate=2026-06-01&endDate=2026-06-02&clinicId=cairo-central',
      'super-admin'
    );

    assert.equal(kpiFiltered.status, 200, 'KPI metrics filtered by date-range and clinic returns 200');
    assert.equal(kpiFiltered.body.clinicId, 'cairo-central');
    assert.equal(kpiFiltered.body.totalCases, 3, 'Filtered to 3 non-demo cases for Cairo Central');
    assert.equal(kpiFiltered.body.completedCasesCount, 2, '2 cases approved');

    // Response time: [10, 20, 30] => avg = 20.0 min
    assert.equal(kpiFiltered.body.responseTime.isAvailable, true);
    assert.equal(kpiFiltered.body.responseTime.avgMinutes, 20);
    assert.equal(kpiFiltered.body.responseTime.display, '20 min');

    // Turnaround time: [40, 60] => avg = 50.0 min
    assert.equal(kpiFiltered.body.approvalTime.isAvailable, true);
    assert.equal(kpiFiltered.body.approvalTime.avgMinutes, 50);
    assert.equal(kpiFiltered.body.approvalTime.display, '50 min');

    // Patients per day: 3 patients over 2 days (2026-06-01 through 2026-06-02) => 1.5 patients/day
    assert.equal(kpiFiltered.body.patientsPerDay.isAvailable, true);
    assert.equal(kpiFiltered.body.patientsPerDay.distinctPatients, 3);
    assert.equal(kpiFiltered.body.patientsPerDay.value, 1.5);
    assert.equal(kpiFiltered.body.patientsPerDay.display, '1.5 patients/day');

    // Workload: 1 active case + 1 active appointment for Dr. Tarek => 2 items / 1 doctor = 2 items/doctor
    assert.equal(kpiFiltered.body.workload.isAvailable, true);
    assert.equal(kpiFiltered.body.workload.totalActiveItems, 2);
    assert.equal(kpiFiltered.body.workload.avgWorkloadPerDoctor, 2);

    console.log('  ✓ Backend /api/kpi/metrics accurately computes event-based metrics:');
    console.log(`    - Response Time: ${kpiFiltered.body.responseTime.display}`);
    console.log(`    - Approval Time: ${kpiFiltered.body.approvalTime.display}`);
    console.log(`    - Patients/Day:  ${kpiFiltered.body.patientsPerDay.display}`);
    console.log(`    - Workload:      ${kpiFiltered.body.workload.display}\n`);

    // ---------------------------------------------------------------------------
    // TEST 3: Clinic Isolation Guard
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 3: Clinic Isolation Guard');
    const crossClinicRes = await request(
      'GET',
      '/api/kpi/metrics?clinicId=alexandria-branch',
      'clinic-admin-cairo'
    );
    assert.equal(crossClinicRes.status, 403, 'Cross-clinic query by clinic_admin is rejected with HTTP 403');
    assert.equal(crossClinicRes.body.error, 'ACCESS_DENIED');
    console.log('  ✓ Clinic Admin cannot query metrics from unauthorized clinic (Strict 403 Isolation).\n');

    // ---------------------------------------------------------------------------
    // TEST 4: "Unavailable" Display When Data is Missing
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 4: "Unavailable" Display When Data is Missing');

    // Query for a date range with zero events
    const emptyRangeRes = await request(
      'GET',
      '/api/kpi/metrics?startDate=2024-01-01&endDate=2024-01-02&clinicId=cairo-central',
      'super-admin'
    );

    assert.equal(emptyRangeRes.status, 200);
    assert.equal(emptyRangeRes.body.totalCases, 0);

    // Missing metric objects must display "Unavailable" and "غير متاح"
    assert.equal(emptyRangeRes.body.responseTime.isAvailable, false);
    assert.equal(emptyRangeRes.body.responseTime.avgMinutes, null);
    assert.equal(emptyRangeRes.body.responseTime.display, 'Unavailable');
    assert.equal(emptyRangeRes.body.responseTime.displayAr, 'غير متاح');

    assert.equal(emptyRangeRes.body.approvalTime.isAvailable, false);
    assert.equal(emptyRangeRes.body.approvalTime.avgMinutes, null);
    assert.equal(emptyRangeRes.body.approvalTime.display, 'Unavailable');
    assert.equal(emptyRangeRes.body.approvalTime.displayAr, 'غير متاح');

    assert.equal(emptyRangeRes.body.patientsPerDay.isAvailable, false);
    assert.equal(emptyRangeRes.body.patientsPerDay.value, null);
    assert.equal(emptyRangeRes.body.patientsPerDay.display, 'Unavailable');
    assert.equal(emptyRangeRes.body.patientsPerDay.displayAr, 'غير متاح');

    // High level display summary
    assert.equal(emptyRangeRes.body.display.responseTime, 'Unavailable');
    assert.equal(emptyRangeRes.body.display.approvalTime, 'Unavailable');
    assert.equal(emptyRangeRes.body.display.patientsPerDay, 'Unavailable');
    assert.equal(emptyRangeRes.body.displayAr.responseTime, 'غير متاح');
    assert.equal(emptyRangeRes.body.displayAr.approvalTime, 'غير متاح');
    assert.equal(emptyRangeRes.body.displayAr.patientsPerDay, 'غير متاح');

    console.log('  ✓ Missing metrics strictly display "Unavailable" / "غير متاح" instead of deceptive 0s:');
    console.log(`    - Response Time: ${emptyRangeRes.body.display.responseTime} (${emptyRangeRes.body.displayAr.responseTime})`);
    console.log(`    - Approval Time: ${emptyRangeRes.body.display.approvalTime} (${emptyRangeRes.body.displayAr.approvalTime})`);
    console.log(`    - Patients/Day:  ${emptyRangeRes.body.display.patientsPerDay} (${emptyRangeRes.body.displayAr.patientsPerDay})\n`);

    // ---------------------------------------------------------------------------
    // TEST 5: Client-side AdminService Date-Range & Event Calculations
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 5: Client-side AdminService Metrics Engine');

    const clientEmpty = AdminService.calculateKpiMetrics([], { timeRange: 'all' });
    assert.equal(clientEmpty.responseTime.display, 'Unavailable');
    assert.equal(clientEmpty.approvalTime.display, 'Unavailable');
    assert.equal(clientEmpty.patientsPerDay.display, 'Unavailable');
    assert.equal(clientEmpty.workload.display, 'Unavailable');
    console.log('  ✓ Client-side AdminService displays "Unavailable" for empty datasets.');

    const sampleCases = [
      {
        id: 'c1',
        patientId: 'p1',
        clinicId: 'cairo',
        status: 'approved',
        submittedAt: '2026-07-01T10:00:00Z',
        firstReviewedAt: '2026-07-01T10:15:00Z', // 15 min
        approvedAt: '2026-07-01T10:45:00Z',      // 45 min
        approvingDoctorName: 'Dr. Tarek'
      }
    ];
    const clientCalc = AdminService.calculateKpiMetrics(sampleCases, {
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      clinicId: 'cairo'
    });
    assert.equal(clientCalc.responseTime.isAvailable, true);
    assert.equal(clientCalc.responseTime.avgMinutes, 15);
    assert.equal(clientCalc.approvalTime.isAvailable, true);
    assert.equal(clientCalc.approvalTime.avgMinutes, 45);
    assert.equal(clientCalc.patientsPerDay.isAvailable, true);
    assert.equal(clientCalc.patientsPerDay.value, 1);
    console.log('  ✓ Client-side AdminService event calculations match live events.\n');

    // ---------------------------------------------------------------------------
    // TEST 6: Appropriate Administrative Bulk Operations Permitted
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 6: Appropriate Administrative Bulk Operations Permitted');

    // 6.1 Bulk Notification
    const bulkNotify = await request('POST', '/api/admin/bulk-operations', 'super-admin', {
      action: 'bulk_notify',
      targetIds: ['patient-1', 'patient-2'],
      payload: { title: 'Holiday Hours Notice', body: 'Clinic hours updated for holiday.' }
    });
    assert.equal(bulkNotify.status, 200, 'bulk_notify succeeds');
    assert.equal(bulkNotify.body.action, 'bulk_notify');
    assert.equal(bulkNotify.body.processedCount, 2);
    console.log('  ✓ Administrative bulk notification allowed and processed.');

    // 6.2 Bulk Queue Routing
    const bulkQueue = await request('POST', '/api/admin/bulk-operations', 'super-admin', {
      action: 'bulk_assign_queue',
      targetIds: ['case-3'],
      payload: { targetQueue: 'urgent_triage' }
    });
    assert.equal(bulkQueue.status, 200, 'bulk_assign_queue succeeds');
    assert.equal(bulkQueue.body.action, 'bulk_assign_queue');
    assert.equal(bulkQueue.body.processedCount, 1);
    console.log('  ✓ Administrative bulk queue routing permitted.');

    // 6.3 Bulk User Status
    const bulkStatus = await request('POST', '/api/admin/bulk-operations', 'super-admin', {
      action: 'bulk_user_status',
      targetIds: ['bad-user'],
      payload: { status: 'suspended' }
    });
    assert.equal(bulkStatus.status, 200, 'bulk_user_status succeeds');
    assert.equal(bulkStatus.body.action, 'bulk_user_status');
    assert.equal(bulkStatus.body.processedCount, 1);
    console.log('  ✓ Administrative bulk account status update permitted.');

    // 6.4 Bulk Export
    const bulkExport = await request('POST', '/api/admin/bulk-operations', 'super-admin', {
      action: 'bulk_export',
      targetIds: ['log-1', 'log-2'],
      payload: { format: 'json' }
    });
    assert.equal(bulkExport.status, 200, 'bulk_export succeeds');
    assert.equal(bulkExport.body.action, 'bulk_export');
    console.log('  ✓ Administrative bulk export permitted.\n');

    // ---------------------------------------------------------------------------
    // TEST 7: Strict Prohibition of Bulk Clinical Approval
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 7: Strict Prohibition of Bulk Clinical Approval (Patient Safety Guard)');

    const forbiddenApprovalAttempts = [
      { action: 'bulk_approve', targetIds: ['case-1', 'case-2'] },
      { action: 'bulk_clinical_approval', targetIds: ['case-1', 'case-2'] },
      { action: 'approve', targetIds: ['case-1', 'case-2'] },
      { action: 'bulk_doctor_approval', targetIds: ['case-1', 'case-2'] },
      { action: 'bulk_assign_queue', targetIds: ['case-1'], payload: { status: 'approved' } },
      { action: 'bulk_notify', targetIds: ['case-1'], approveClinical: true }
    ];

    for (const badPayload of forbiddenApprovalAttempts) {
      const res = await request('POST', '/api/admin/bulk-operations', 'super-admin', badPayload);
      assert.equal(res.status, 403, `Action '${badPayload.action}' must return HTTP 403`);
      assert.equal(res.body.error, 'BULK_CLINICAL_APPROVAL_PROHIBITED');
      assert.ok(res.body.message.includes('Clinical approval requires individual'));
    }
    console.log('  ✓ All bulk clinical approval actions strictly blocked with HTTP 403 (BULK_CLINICAL_APPROVAL_PROHIBITED).');

    // Dedicated endpoints
    const direct1 = await request('POST', '/api/admin/bulk-approve-clinical-cases', 'super-admin', { cases: ['case-1'] });
    assert.equal(direct1.status, 403);
    assert.equal(direct1.body.error, 'BULK_CLINICAL_APPROVAL_PROHIBITED');

    const direct2 = await request('POST', '/api/admin/cases/bulk-approve', 'super-admin', { cases: ['case-1'] });
    assert.equal(direct2.status, 403);
    assert.equal(direct2.body.error, 'BULK_CLINICAL_APPROVAL_PROHIBITED');

    console.log('  ✓ Direct bulk approval endpoints intercepted and blocked:');
    console.log('    - POST /api/admin/bulk-approve-clinical-cases → 403 BULK_CLINICAL_APPROVAL_PROHIBITED');
    console.log('    - POST /api/admin/cases/bulk-approve          → 403 BULK_CLINICAL_APPROVAL_PROHIBITED\n');

    console.log('==================================================================');
    console.log('🎉 ALL 7 ADMIN COUNTERS & BULK GOVERNANCE TESTS PASSED (100%)');
    console.log('==================================================================\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
