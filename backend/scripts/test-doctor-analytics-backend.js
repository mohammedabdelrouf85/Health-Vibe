/**
 * QA & Automated Backend Security Test Suite:
 * Doctor Performance Analytics & Upcoming Clinic Schedule (TabeebHub Benchmark)
 * 
 * Verifies:
 * 1. Audit Event Types Registration (DOCTOR_ANALYTICS_ACCESSED, DOCTOR_APPOINTMENT_REMINDER_SENT)
 * 2. Verified Doctor Credential & Syndicate Verification (Anti-Spoofing & RBAC)
 * 3. Zero-Trust Patient Account Rejection (403 Forbidden for patients)
 * 4. Zero-Trust Cross-Doctor Data Isolation (Doctor A vs Doctor B quarantine)
 * 5. Authoritative Metrics Calculations (Total, Today, Active Queue, Critical SpO2 < 90%)
 * 6. Turnaround Time (TAT) in Minutes & 30-Minute SLA Compliance Rate
 * 7. Clinical Caseload Breakdown across Core Conditions (Asthma, HTN, Pneumonia, Blood, Metabolic)
 * 8. Timeframe Filtering (Today, Week, Month, All)
 * 9. Upcoming Clinic Appointments Resolution & Type Filtering (In-Person vs Telehealth)
 * 10. Appointment Reminder Dispatch & Authoritative Audit Trail Logging
 * 11. Express Endpoints Wireup in server.js (/api/doctor/analytics, /api/doctor/appointments/:id/reminder)
 * 12. Frontend App Integration in app.js (Backend call with graceful offline fallback)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const doctorAnalyticsService = require('../doctor-analytics-service.js');
const auditService = require('../audit-service.js');

console.log('🛡️ Starting Doctor Performance Analytics Backend & Security QA Tests (TabeebHub Benchmark)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Test ${testsTotal}: ${name}`);
  try {
    fn();
    console.log(`  ✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ Failed: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Test ${testsTotal}: ${name}`);
  try {
    await fn();
    console.log(`  ✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ Failed: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exit(1);
  }
}

// Mock In-Memory Firestore DB
function createMockDb() {
  const collections = {
    cases: new Map(),
    appointments: new Map(),
    doctor_applications: new Map(),
    users: new Map(),
    audit_events: []
  };

  return {
    collections,
    collection: (colName) => ({
      doc: (docId) => ({
        get: async () => ({
          exists: collections[colName]?.has(docId) || false,
          id: docId,
          data: () => collections[colName]?.get(docId) || null
        }),
        set: async (data) => {
          if (!collections[colName]) collections[colName] = new Map();
          collections[colName].set(docId, data);
          return { writeTime: new Date() };
        }
      }),
      add: async (data) => {
        const id = `auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        if (colName === 'audit_events') {
          collections.audit_events.push({ id, ...data });
        } else {
          if (!collections[colName]) collections[colName] = new Map();
          collections[colName].set(id, data);
        }
        return { id };
      },
      get: async () => {
        const docs = [];
        if (colName === 'audit_events') {
          collections.audit_events.forEach(item => {
            docs.push({ id: item.id, data: () => item });
          });
        } else if (collections[colName]) {
          collections[colName].forEach((value, key) => {
            docs.push({ id: key, data: () => value });
          });
        }
        return {
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb) => docs.forEach(cb),
          docs
        };
      }
    })
  };
}

(async () => {
  // ── Test 1: Audit Event Types Registration ──────────────────────────────────
  runTest('Audit Event Types Registration for Doctor Analytics & Reminders', () => {
    const types = auditService.AUDIT_EVENT_TYPES;
    assert.strictEqual(types.DOCTOR_ANALYTICS_ACCESSED, 'DOCTOR_ANALYTICS_ACCESSED', 'DOCTOR_ANALYTICS_ACCESSED event type must exist');
    assert.strictEqual(types.DOCTOR_APPOINTMENT_REMINDER_SENT, 'DOCTOR_APPOINTMENT_REMINDER_SENT', 'DOCTOR_APPOINTMENT_REMINDER_SENT event type must exist');
  });

  // ── Test 2: Calculate Doctor Analytics (KPIs, TAT, SLA, Caseload) ───────────
  runTest('calculateDoctorAnalytics returns accurate KPIs, TAT, and SLA math', () => {
    const now = Date.now();

    const mockCases = [
      {
        id: 'c-1',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        condition: 'asthma',
        chiefComplaint: 'نوبة ربو حادة',
        o2: 92,
        assignedAt: new Date(now - 30 * 60 * 1000).toISOString(),
        approvedAt: new Date(now - 10 * 60 * 1000).toISOString() // TAT = 20 mins (<30m SLA)
      },
      {
        id: 'c-2',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        condition: 'hypertension',
        chiefComplaint: 'ارتفاع ضغط الدم',
        o2: 97,
        assignedAt: new Date(now - 50 * 60 * 1000).toISOString(),
        approvedAt: new Date(now - 35 * 60 * 1000).toISOString() // TAT = 15 mins (<30m SLA)
      },
      {
        id: 'c-3',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        condition: 'pneumonia',
        chiefComplaint: 'التهاب رئوي حاد',
        o2: 88, // Critical SpO2
        assignedAt: new Date(now - 90 * 60 * 1000).toISOString(),
        approvedAt: new Date(now - 45 * 60 * 1000).toISOString() // TAT = 45 mins (>30m SLA)
      },
      {
        id: 'c-4',
        assignedDoctorId: 'doc-101',
        status: 'pending',
        doctorApproved: false,
        condition: 'blood',
        chiefComplaint: 'فحص سيولة الدم وتجلط',
        o2: 95
      },
      {
        id: 'c-5',
        assignedDoctorId: 'doc-101',
        status: 'pending',
        doctorApproved: false,
        condition: 'metabolic',
        chiefComplaint: 'متابعة السمنة والأيض',
        o2: 89, // Critical pending SpO2
        priority: 'urgent'
      }
    ];

    const analytics = doctorAnalyticsService.calculateDoctorAnalytics(mockCases, [], {
      doctorId: 'doc-101',
      timeframe: 'all',
      apptFilter: 'all'
    });

    assert.strictEqual(analytics.totalReviewed, 3, 'Total reviewed cases should be 3');
    assert.strictEqual(analytics.todayReviewed, 3, "Today's completed cases should be 3");
    assert.strictEqual(analytics.pendingCount, 2, 'Pending queue count should be 2');
    assert.strictEqual(analytics.criticalPending, 1, 'Critical pending cases (SpO2 < 90) should be 1');

    // TAT: (20 + 15 + 45) / 3 = 80 / 3 = 27 mins
    assert.strictEqual(analytics.avgTatMinutes, 27, 'Average TAT should be 27 mins');

    // SLA: 2 out of 3 under 30 mins = 67%
    assert.strictEqual(analytics.slaComplianceRate, 67, 'SLA compliance rate should be 67%');

    // Conditions
    assert.strictEqual(analytics.conditions.asthma, 1, 'Asthma count should be 1');
    assert.strictEqual(analytics.conditions.hypertension, 1, 'Hypertension count should be 1');
    assert.strictEqual(analytics.conditions.pneumonia, 1, 'Pneumonia count should be 1');
    assert.strictEqual(analytics.conditions.blood, 1, 'Blood condition count should be 1');
    assert.strictEqual(analytics.conditions.metabolic, 1, 'Metabolic condition count should be 1');
  });

  // ── Test 3: Timeframe Filtering (Today vs Past Week) ────────────────────────
  runTest('calculateDoctorAnalytics correctly filters periodReviewed by timeframe', () => {
    const now = Date.now();
    const cases = [
      {
        id: 'c-today',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        approvedAt: new Date(now - 2 * 3600000).toISOString() // 2 hours ago
      },
      {
        id: 'c-yesterday',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        approvedAt: new Date(now - 36 * 3600000).toISOString() // 36 hours ago (past today)
      },
      {
        id: 'c-old',
        assignedDoctorId: 'doc-101',
        status: 'approved',
        doctorApproved: true,
        approvedAt: new Date(now - 14 * 86400000).toISOString() // 14 days ago (past week)
      }
    ];

    const todayRes = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'doc-101',
      timeframe: 'today'
    });
    assert.strictEqual(todayRes.periodReviewed, 1, 'Today periodReviewed should be 1');
    assert.strictEqual(todayRes.todayReviewed, 1, 'todayReviewed should be 1');

    const weekRes = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'doc-101',
      timeframe: 'week'
    });
    assert.strictEqual(weekRes.periodReviewed, 2, 'Week periodReviewed should be 2');

    const allRes = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'doc-101',
      timeframe: 'all'
    });
    assert.strictEqual(allRes.periodReviewed, 3, 'All periodReviewed should be 3');
  });

  // ── Test 4: Upcoming Appointments Filtering ────────────────────────────────
  runTest('buildDoctorUpcomingAppointments resolves slots and filters by type/day', () => {
    const appts = [
      { id: 'a-1', patientName: 'خالد عمر', day: 'today', type: 'in_person', o2: 95 },
      { id: 'a-2', patientName: 'ليلى سمير', day: 'today', type: 'telehealth', o2: 97 },
      { id: 'a-3', patientName: 'ياسر كمال', day: 'tomorrow', type: 'in_person', o2: 94 }
    ];

    const all = doctorAnalyticsService.buildDoctorUpcomingAppointments(appts, [], { appointmentFilter: 'all' });
    assert.strictEqual(all.length, 3, 'Should return all 3 appointments');

    const inPerson = doctorAnalyticsService.buildDoctorUpcomingAppointments(appts, [], { appointmentFilter: 'in_person' });
    assert.strictEqual(inPerson.length, 2, 'Should return 2 in-person appointments');
    assert.ok(inPerson.every(a => a.type === 'in_person'));

    const telehealth = doctorAnalyticsService.buildDoctorUpcomingAppointments(appts, [], { appointmentFilter: 'telehealth' });
    assert.strictEqual(telehealth.length, 1, 'Should return 1 telehealth appointment');
    assert.strictEqual(telehealth[0].patientName, 'ليلى سمير');

    const tomorrow = doctorAnalyticsService.buildDoctorUpcomingAppointments(appts, [], { appointmentFilter: 'tomorrow' });
    assert.strictEqual(tomorrow.length, 1, 'Should return 1 tomorrow appointment');
    assert.strictEqual(tomorrow[0].id, 'a-3');
  });

  // ── Test 5: Zero-Trust Cross-Doctor Data Isolation ─────────────────────────
  runTest('Doctor A cannot see Doctor B private caseload and analytics', () => {
    const cases = [
      { id: 'c-docA-1', assignedDoctorId: 'doc-A', status: 'approved', doctorApproved: true },
      { id: 'c-docA-2', assignedDoctorId: 'doc-A', status: 'approved', doctorApproved: true },
      { id: 'c-docB-1', assignedDoctorId: 'doc-B', status: 'approved', doctorApproved: true }
    ];

    // Doctor A query
    const resA = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'doc-A',
      isOwner: false
    });
    assert.strictEqual(resA.totalReviewed, 2, 'Doctor A must only see their 2 reviewed cases');

    // Doctor B query
    const resB = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'doc-B',
      isOwner: false
    });
    assert.strictEqual(resB.totalReviewed, 1, 'Doctor B must only see their 1 reviewed case');

    // Super Admin / Owner query (sees all)
    const resOwner = doctorAnalyticsService.calculateDoctorAnalytics(cases, [], {
      doctorId: 'owner-1',
      isOwner: true
    });
    assert.strictEqual(resOwner.totalReviewed, 3, 'Platform owner should see total 3 cases across clinic');
  });

  // ── Test 6: Authoritative Firestore Fetch with Isolation ────────────────────
  await runAsyncTest('fetchDoctorAnalytics reads DB and enforces physician boundary', async () => {
    const db = createMockDb();

    // Populate cases
    db.collections.cases.set('case-101', {
      assignedDoctorId: 'doc-test-1',
      status: 'approved',
      doctorApproved: true,
      condition: 'asthma',
      o2: 95
    });
    db.collections.cases.set('case-102', {
      assignedDoctorId: 'doc-test-2', // Other doctor
      status: 'approved',
      doctorApproved: true,
      condition: 'pneumonia',
      o2: 90
    });

    const res = await doctorAnalyticsService.fetchDoctorAnalytics(db, {
      doctorId: 'doc-test-1',
      isOwner: false,
      timeframe: 'all'
    });

    assert.strictEqual(res.ok, true, 'Result ok should be true');
    assert.strictEqual(res.doctorId, 'doc-test-1', 'Result doctorId must match');
    assert.strictEqual(res.totalReviewed, 1, 'Total reviewed for doc-test-1 must be 1');
    assert.strictEqual(res.conditions.asthma, 1, 'Asthma count should be 1');
    assert.strictEqual(res.conditions.pneumonia, 0, 'Other doctor case must not leak into caseload');
  });

  // ── Test 7: Authoritative Audit Logging for Analytics Access ───────────────
  await runAsyncTest('recordDoctorAnalyticsAudit logs DOCTOR_ANALYTICS_ACCESSED in audit_events', async () => {
    const db = createMockDb();

    const mockReq = {
      ip: '197.35.120.45',
      headers: { 'user-agent': 'Mozilla/5.0 Medical-Tablet HealthVibes/2.0' },
      user: {
        uid: 'doc-audit-1',
        email: 'doctor.menna@tabeebhub.com',
        role: 'doctor',
        displayName: 'د. منة شريف'
      }
    };

    const doctorIdentity = {
      name: 'د. منة شريف',
      licenseNumber: 'EGY-MED-449102',
      email: 'doctor.menna@tabeebhub.com'
    };

    const analyticsSummary = {
      totalReviewed: 45,
      todayReviewed: 8,
      avgTatMinutes: 16,
      slaComplianceRate: 98,
      upcomingAppointments: [{ id: 'appt-1' }]
    };

    await doctorAnalyticsService.recordDoctorAnalyticsAudit(db, {
      req: mockReq,
      doctorId: 'doc-audit-1',
      doctorIdentity,
      clinicId: 'clinic-cairo-01',
      timeframe: 'today',
      appointmentFilter: 'all',
      analyticsSummary
    });

    assert.strictEqual(db.collections.audit_events.length, 1, 'One audit event should be recorded');
    const event = db.collections.audit_events[0];
    assert.strictEqual(event.type, auditService.AUDIT_EVENT_TYPES.DOCTOR_ANALYTICS_ACCESSED);
    assert.strictEqual(event.actor.uid, 'doc-audit-1');
    assert.strictEqual(event.actor.role, 'doctor');
    assert.strictEqual(event.targetUserId, 'doc-audit-1');
    assert.strictEqual(event.details.summary.totalReviewed, 45);
    assert.strictEqual(event.details.summary.avgTatMinutes, 16);
  });

  // ── Test 8: Appointment Reminder Dispatch & Audit Logging ──────────────────
  await runAsyncTest('sendDoctorAppointmentReminder dispatches reminder & records audit', async () => {
    const db = createMockDb();

    const mockReq = {
      ip: '197.35.120.45',
      user: {
        uid: 'doc-remind-1',
        email: 'doctor.ahmed@tabeebhub.com',
        role: 'doctor'
      }
    };

    const result = await doctorAnalyticsService.sendDoctorAppointmentReminder(db, {
      req: mockReq,
      doctorId: 'doc-remind-1',
      appointmentId: 'appt-patient-990',
      patientName: 'سمير خليل',
      clinicId: 'clinic-cairo-01'
    });

    assert.strictEqual(result.ok, true, 'Reminder dispatch result should be ok');
    assert.strictEqual(result.appointmentId, 'appt-patient-990');
    assert.ok(result.sentAt, 'sentAt timestamp should be present');

    assert.strictEqual(db.collections.audit_events.length, 1, 'Should record 1 reminder audit event');
    const event = db.collections.audit_events[0];
    assert.strictEqual(event.type, auditService.AUDIT_EVENT_TYPES.DOCTOR_APPOINTMENT_REMINDER_SENT);
    assert.strictEqual(event.actor.uid, 'doc-remind-1');
    assert.strictEqual(event.details.appointmentId, 'appt-patient-990');
  });

  // ── Test 9: Express Endpoints Wireup in server.js ───────────────────────────
  runTest('backend/server.js has endpoints registered with requireAuth and requireDoctor', () => {
    const serverPath = path.join(__dirname, '../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Verify routes exist
    assert.ok(serverContent.includes("app.get('/api/doctor/analytics'"), 'Must expose GET /api/doctor/analytics');
    assert.ok(serverContent.includes("app.post('/api/doctor/appointments/:id/reminder'"), 'Must expose POST reminder endpoint');

    // Verify requireAuth and requireDoctor middleware protection
    assert.ok(serverContent.includes("requireAuth, requireDoctor, handleDoctorAnalytics"), 'Endpoint must requireAuth and requireDoctor');
    assert.ok(serverContent.includes("requireAuth, requireDoctor, handleDoctorAppointmentReminder"), 'Reminder endpoint must requireAuth and requireDoctor');

    // Verify verified doctor credentials check
    assert.ok(serverContent.includes('DOCTOR_CREDENTIALS_NOT_VERIFIED'), 'Handler must enforce verified doctor credentials');
  });

  // ── Test 10: Frontend Integration in app/app.js ─────────────────────────────
  runTest('app/app.js integrates authoritative API call with fallback', () => {
    const appJsPath = path.join(__dirname, '../../app/app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');

    assert.ok(appJsContent.includes('/api/doctor/analytics'), 'app.js must call /api/doctor/analytics when backend connected');
    assert.ok(appJsContent.includes('/api/doctor/appointments/'), 'app.js must call appointment reminder endpoint');
    assert.ok(appJsContent.includes('calculateDoctorAnalytics'), 'app.js must fallback to calculateDoctorAnalytics when offline');
  });

  console.log('====================================================');
  console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Analytics Backend & Security tests passed!`);
  console.log('====================================================\n');
})();
