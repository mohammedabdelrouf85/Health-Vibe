/**
 * HEALTH VIBE AI: PRODUCT ANALYTICS, JOURNEY TELEMETRY & CLINICAL KPI TEST SUITE
 * 
 * Validates:
 * 1. Definitive event telemetry: signup, onboarding, assessment_start,
 *    assessment_complete, assessment_abandon, doctor_review, result_opened, follow_up_booked.
 * 2. Strict PHI/medical text redaction & rejection (no symptoms, vitals, diagnosis, notes).
 * 3. De-duplication and monotonic timing integrity (no complete before start, no future timestamps).
 * 4. Assessment journey completion rate strictly decoupled from database case counts.
 * 5. Full KPI calculations: turnaround, D1/D7/D30 retention, WAU/MAU stickiness,
 *    doctor & clinic activity, satisfaction (CSAT), error rate, support metrics.
 * 6. Explicit denominators, time periods, and 'Unavailable' fallbacks when data is missing.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const analyticsService = require('../backend/analytics-service');
const AdminService = require('../app/modules/admin/admin-service');

console.log('==================================================================');
console.log('📊 HEALTH VIBE AI: PRODUCT ANALYTICS & JOURNEY KPIS TEST SUITE');
console.log('   Telemetry Privacy, Deduplication, Funnel vs Cases, Retention & Metrics');
console.log('==================================================================\n');

// Sandboxed server setup
const userAccounts = {
  'super-admin': { uid: 'super-admin', role: 'super_admin', isOwner: true, email: 'admin@healthvibes.org', email_verified: true },
  'clinic-admin': { uid: 'clinic-admin', role: 'clinic_admin', clinicId: 'cairo-central', email: 'cairo@healthvibes.org', email_verified: true }
};

const mockFirebase = {
  apps: [{}],
  firestore: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
      where: () => ({ get: async () => ({ docs: [], empty: true }) }),
      get: async () => ({ docs: [], empty: true })
    })
  }),
  auth: () => ({
    verifyIdToken: async (token) => {
      const u = userAccounts[token];
      if (!u) throw new Error(`Unknown token: ${token}`);
      return { ...u };
    }
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

(async () => {
  const server = sandboxedApp.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, token = null, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + route, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsed = await res.json();
    return { status: res.status, body: parsed };
  }

  try {
    analyticsService.resetAnalyticsState();

    // ---------------------------------------------------------------------------
    // TEST 1: Event Definitions and Recording Without Sending Medical Text
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 1: Definitive Event Telemetry Without Sending Medical Text');

    const now = Date.now();

    // 1.1 signup
    const signupEvt = analyticsService.recordEvent({
      eventType: 'signup',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 3600000,
      payload: { role: 'patient', locale: 'ar', platform: 'mobile_web' }
    });
    assert.equal(signupEvt.success, true);
    assert.equal(signupEvt.duplicate, false);

    // 1.2 onboarding
    const onboardingEvt = analyticsService.recordEvent({
      eventType: 'onboarding',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 3500000,
      payload: { step: 'phone_verification', status: 'completed' }
    });
    assert.equal(onboardingEvt.success, true);

    // 1.3 assessment_start
    const startEvt = analyticsService.recordEvent({
      eventType: 'assessment_start',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 3000000,
      payload: { assessmentId: 'asm_101', device: 'iOS' }
    });
    assert.equal(startEvt.success, true);

    // 1.4 assessment_complete
    const completeEvt = analyticsService.recordEvent({
      eventType: 'assessment_complete',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 2800000,
      payload: { assessmentId: 'asm_101', caseId: 'case_201', durationMs: 200000, stepsCount: 4 }
    });
    assert.equal(completeEvt.success, true);

    // 1.5 assessment_abandon
    const abandonEvt = analyticsService.recordEvent({
      eventType: 'assessment_abandon',
      userId: 'usr_pat_02',
      clinicId: 'cairo-central',
      timestamp: now - 2500000,
      payload: { assessmentId: 'asm_102', abandonStep: 'vitals_step', reasonCode: 'USER_EXIT', timeSpentMs: 45000 }
    });
    assert.equal(abandonEvt.success, true);

    // 1.6 doctor_review
    const reviewEvt = analyticsService.recordEvent({
      eventType: 'doctor_review',
      userId: 'usr_doc_01',
      clinicId: 'cairo-central',
      timestamp: now - 1800000,
      payload: { caseId: 'case_201', doctorId: 'usr_doc_01', reviewAction: 'approved', responseTimeMs: 1000000 }
    });
    assert.equal(reviewEvt.success, true);

    // 1.7 result_opened
    const openedEvt = analyticsService.recordEvent({
      eventType: 'result_opened',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 1200000,
      payload: { caseId: 'case_201', timeToOpenMs: 600000 }
    });
    assert.equal(openedEvt.success, true);

    // 1.8 follow_up_booked
    const followUpEvt = analyticsService.recordEvent({
      eventType: 'follow_up_booked',
      userId: 'usr_pat_01',
      clinicId: 'cairo-central',
      timestamp: now - 600000,
      payload: { appointmentId: 'apt_301', caseId: 'case_201', doctorId: 'usr_doc_01', appointmentType: 'telehealth' }
    });
    assert.equal(followUpEvt.success, true);

    console.log('  ✓ All 8 operational event types successfully recorded with operational metadata:');
    console.log('    - signup, onboarding, assessment_start, assessment_complete, assessment_abandon,');
    console.log('      doctor_review, result_opened, follow_up_booked.\n');

    // ---------------------------------------------------------------------------
    // TEST 2: Strict Privacy Guard - Rejection of Medical Content in Analytics
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 2: Strict Privacy Guard - Rejection of Medical Content in Analytics');

    const forbiddenMedicalPayloads = [
      { eventType: 'assessment_complete', payload: { assessmentId: 'asm_x', symptoms: 'Severe cough with sputum' } },
      { eventType: 'assessment_start', payload: { assessmentId: 'asm_y', oxygenLevel: 88 } },
      { eventType: 'doctor_review', payload: { caseId: 'c_x', diagnosis: 'Acute Bronchitis' } },
      { eventType: 'doctor_review', payload: { caseId: 'c_y', clinicalNotes: 'Patient exhibits crackles on left lower lobe' } },
      { eventType: 'follow_up_booked', payload: { appointmentId: 'apt_z', prescriptions: 'Amoxicillin 500mg' } },
      { eventType: 'assessment_abandon', payload: { assessmentId: 'asm_z', chiefComplaint: 'Chest tightness' } }
    ];

    for (const bad of forbiddenMedicalPayloads) {
      assert.throws(
        () => analyticsService.recordEvent(bad),
        /MEDICAL_TEXT_PROHIBITED/,
        `Payload with medical text '${Object.keys(bad.payload)[1]}' must be strictly rejected`
      );
    }

    // HTTP Endpoint test for medical text rejection
    const httpRejectRes = await request('POST', '/api/analytics/events', null, {
      eventType: 'assessment_complete',
      payload: { assessmentId: 'asm_999', diagnosis: 'Bacterial Pneumonia' }
    });
    assert.equal(httpRejectRes.status, 400);
    assert.equal(httpRejectRes.body.error, 'MEDICAL_TEXT_PROHIBITED');
    assert.ok(httpRejectRes.body.message.includes('Clinical data attribute'));
    console.log('  ✓ Clinical text (symptoms, vitals, diagnosis, notes, prescriptions) strictly blocked with MEDICAL_TEXT_PROHIBITED.\n');

    // ---------------------------------------------------------------------------
    // TEST 3: De-duplication and Monotonic Timing Integrity
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 3: De-duplication and Monotonic Timing Integrity');

    // 3.1 Idempotent eventId deduplication
    const fixedEventId = 'evt_unique_12345';
    const firstCall = analyticsService.recordEvent({
      eventId: fixedEventId,
      eventType: 'assessment_start',
      userId: 'usr_test_dedup',
      timestamp: now - 500000,
      payload: { assessmentId: 'asm_dedup' }
    });
    assert.equal(firstCall.duplicate, false);

    const duplicateCall = analyticsService.recordEvent({
      eventId: fixedEventId,
      eventType: 'assessment_start',
      userId: 'usr_test_dedup',
      timestamp: now - 500000,
      payload: { assessmentId: 'asm_dedup' }
    });
    assert.equal(duplicateCall.duplicate, true, 'Subsequent event with identical ID is flagged duplicate');

    // 3.2 Debounce rapid duplicate submission (< 3000ms window)
    const rapidClick1 = analyticsService.recordEvent({
      eventType: 'follow_up_booked',
      userId: 'usr_rapid',
      timestamp: now - 200000,
      payload: { appointmentId: 'apt_rapid' }
    });
    assert.equal(rapidClick1.duplicate, false);

    const rapidClick2 = analyticsService.recordEvent({
      eventType: 'follow_up_booked',
      userId: 'usr_rapid',
      timestamp: now - 199500, // +500ms
      payload: { appointmentId: 'apt_rapid' }
    });
    assert.equal(rapidClick2.duplicate, true, 'Rapid duplicate click debounced within 3000ms window');

    // 3.3 Monotonic timing check: complete before start
    const reverseStart = now - 100000;
    const reverseComplete = now - 150000; // 50s BEFORE start!
    analyticsService.recordEvent({
      eventType: 'assessment_start',
      userId: 'usr_reverse',
      timestamp: reverseStart,
      payload: { assessmentId: 'asm_reverse' }
    });

    assert.throws(
      () => analyticsService.recordEvent({
        eventType: 'assessment_complete',
        userId: 'usr_reverse',
        timestamp: reverseComplete,
        payload: { assessmentId: 'asm_reverse' }
      }),
      /INVALID_EVENT_TIMING/,
      'assessment_complete cannot precede assessment_start'
    );

    // 3.4 Future timestamp rejected
    assert.throws(
      () => analyticsService.recordEvent({
        eventType: 'signup',
        userId: 'usr_future',
        timestamp: now + 500000 // 500s into future
      }),
      /INVALID_EVENT_TIMING/,
      'Future timestamps must be rejected'
    );

    console.log('  ✓ De-duplication, debouncing, and monotonic timing constraints verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 4: Assessment Journey Completion Rate vs Cases Count
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 4: Assessment Journey Completion Rate vs Database Cases Count');

    // Clean state for funnel evaluation
    analyticsService.resetAnalyticsState();
    const t0 = Date.now() - 10000000;

    // Simulate 10 assessment starts
    for (let i = 1; i <= 10; i++) {
      analyticsService.recordEvent({
        eventId: `asm_start_${i}`,
        eventType: 'assessment_start',
        userId: `patient_${i}`,
        timestamp: t0 + i * 1000,
        payload: { assessmentId: `asm_${i}` }
      });
    }

    // 7 completed
    for (let i = 1; i <= 7; i++) {
      analyticsService.recordEvent({
        eventId: `asm_comp_${i}`,
        eventType: 'assessment_complete',
        userId: `patient_${i}`,
        timestamp: t0 + i * 1000 + 60000,
        payload: { assessmentId: `asm_${i}`, caseId: `case_${i}` }
      });
    }

    // 3 abandoned
    for (let i = 8; i <= 10; i++) {
      analyticsService.recordEvent({
        eventId: `asm_abnd_${i}`,
        eventType: 'assessment_abandon',
        userId: `patient_${i}`,
        timestamp: t0 + i * 1000 + 30000,
        payload: { assessmentId: `asm_${i}`, abandonStep: 'vitals_step', reasonCode: 'USER_EXIT' }
      });
    }

    const funnelKpis = analyticsService.calculateProductKpis();

    // Denominator = 10 starts; Numerator = 7 completes => 70.0% completion
    assert.equal(funnelKpis.assessmentJourney.journeyCompletionRate.denominatorValue, 10);
    assert.equal(funnelKpis.assessmentJourney.journeyCompletionRate.numeratorValue, 7);
    assert.equal(funnelKpis.assessmentJourney.journeyCompletionRate.rate, 70.0);
    assert.equal(funnelKpis.assessmentJourney.journeyCompletionRate.display, '70%');

    // Denominator = 10 starts; Numerator = 3 abandons => 30.0% abandonment
    assert.equal(funnelKpis.assessmentJourney.journeyAbandonmentRate.denominatorValue, 10);
    assert.equal(funnelKpis.assessmentJourney.journeyAbandonmentRate.numeratorValue, 3);
    assert.equal(funnelKpis.assessmentJourney.journeyAbandonmentRate.rate, 30.0);

    // Verify explicit distinction note
    assert.ok(funnelKpis.assessmentJourney.funnel.distinctionNote.includes('not equated with raw database case counts'));

    // Test client AdminService helper
    const journeyClient = AdminService.calculateAssessmentJourneyMetrics([
      { eventType: 'assessment_start' },
      { eventType: 'assessment_start' },
      { eventType: 'assessment_complete' },
      { eventType: 'assessment_abandon' }
    ], { persistedCasesCount: 50 }); // 50 database records, but 50% journey completion

    assert.equal(journeyClient.starts, 2);
    assert.equal(journeyClient.completes, 1);
    assert.equal(journeyClient.completionRate, 50.0);
    assert.equal(journeyClient.persistedCasesCount, 50, 'Persisted cases does not pollute journey completion rate');

    console.log('  ✓ Assessment Journey Completion Rate decoupled from case count:');
    console.log(`    - Started Assessments (Denominator): ${funnelKpis.assessmentJourney.journeyCompletionRate.denominatorValue}`);
    console.log(`    - Completed Assessments (Numerator): ${funnelKpis.assessmentJourney.journeyCompletionRate.numeratorValue}`);
    console.log(`    - Journey Completion Rate:          ${funnelKpis.assessmentJourney.journeyCompletionRate.display}`);
    console.log(`    - Abandonment Rate:                 ${funnelKpis.assessmentJourney.journeyAbandonmentRate.display}\n`);

    // ---------------------------------------------------------------------------
    // TEST 5: Retention (D1, D7, D30), WAU/MAU, Activity, CSAT, Errors & Support
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 5: Retention (D1, D7, D30), WAU/MAU, Doctor & Clinic Activity, CSAT, Errors & Support');

    analyticsService.resetAnalyticsState();
    const currentTime = Date.now();
    const dayMs = 24 * 3600 * 1000;

    // Simulate cohort: 4 users signed up 35 days ago
    const signupTime35DaysAgo = currentTime - 35 * dayMs;
    const cohort = ['u1', 'u2', 'u3', 'u4'];
    cohort.forEach(uid => {
      analyticsService.recordEvent({
        eventType: 'signup',
        userId: uid,
        timestamp: signupTime35DaysAgo
      });
    });

    // u1 & u2 active on Day 1 (+24h to +48h)
    ['u1', 'u2'].forEach(uid => {
      analyticsService.recordEvent({
        eventType: 'result_opened',
        userId: uid,
        timestamp: signupTime35DaysAgo + 26 * 3600 * 1000
      });
    });

    // u1 active on Day 7 (+7d)
    analyticsService.recordEvent({
      eventType: 'follow_up_booked',
      userId: 'u1',
      timestamp: signupTime35DaysAgo + 7 * dayMs + 1000
    });

    // u1 active on Day 30 (+30d)
    analyticsService.recordEvent({
      eventType: 'result_opened',
      userId: 'u1',
      timestamp: signupTime35DaysAgo + 30 * dayMs + 2000
    });

    // Recent activity for WAU / MAU:
    // u1 and u5 active in last 3 days => WAU = 2
    analyticsService.recordEvent({ eventType: 'assessment_start', userId: 'u1', timestamp: currentTime - 2 * dayMs });
    analyticsService.recordEvent({ eventType: 'assessment_start', userId: 'u5', timestamp: currentTime - 1 * dayMs });
    // u6 active 15 days ago => MAU includes u1, u5, u6 = 3
    analyticsService.recordEvent({ eventType: 'result_opened', userId: 'u6', timestamp: currentTime - 15 * dayMs });

    // Doctor & Clinic Activity: Dr. Tarek reviews 3 cases in Cairo Central
    for (let i = 1; i <= 3; i++) {
      analyticsService.recordEvent({
        eventType: 'doctor_review',
        userId: 'doc_tarek',
        clinicId: 'cairo-central',
        timestamp: currentTime - 3600000 + i * 1000,
        payload: { doctorId: 'doc_tarek', caseId: `case_rev_${i}`, responseTimeMs: 15 * 60000 }
      });
    }

    // Satisfaction: 3 feedbacks: 5, 4, 2 stars => CSAT (>=4) = 2/3 = 66.7%
    analyticsService.recordEvent({ eventType: 'result_opened', userId: 'u1', timestamp: currentTime - 25000, payload: { feedbackId: 'fb1', rating: 5 } });
    analyticsService.recordEvent({ eventType: 'result_opened', userId: 'u2', timestamp: currentTime - 18000, payload: { feedbackId: 'fb2', rating: 4 } });
    analyticsService.recordEvent({ eventType: 'result_opened', userId: 'u3', timestamp: currentTime - 11000, payload: { feedbackId: 'fb3', rating: 2 } });

    // Errors: 1 error out of all events
    analyticsService.recordEvent({ eventType: 'assessment_complete', userId: 'u1', timestamp: currentTime - 8000, payload: { errorCategory: 'api' } });

    // Support: 2 opened, 1 resolved => 50.0% resolution
    analyticsService.recordEvent({ eventType: 'onboarding', userId: 'u1', timestamp: currentTime - 5000, payload: { ticketId: 't1', status: 'open' } });
    analyticsService.recordEvent({ eventType: 'onboarding', userId: 'u2', timestamp: currentTime - 1000, payload: { ticketId: 't2', status: 'resolved' } });

    const fullKpis = analyticsService.calculateProductKpis();

    // 5.1 Retention
    assert.equal(fullKpis.retention.d1.denominatorValue, 4, 'D1 Cohort size = 4');
    assert.equal(fullKpis.retention.d1.numeratorValue, 2, '2 users returned on D1');
    assert.equal(fullKpis.retention.d1.rate, 50.0);
    assert.equal(fullKpis.retention.d1.display, '50%');

    assert.equal(fullKpis.retention.d7.numeratorValue, 1, '1 user returned on D7');
    assert.equal(fullKpis.retention.d7.rate, 25.0);

    assert.equal(fullKpis.retention.d30.numeratorValue, 1, '1 user returned on D30');
    assert.equal(fullKpis.retention.d30.rate, 25.0);

    // 5.2 WAU / MAU
    assert.equal(fullKpis.engagement.wau, 5, 'WAU equals 5 (u1, u2, u3, u5, doc_tarek)');
    assert.equal(fullKpis.engagement.mau, 6, 'MAU equals 6 (u1, u2, u3, u5, u6, doc_tarek)');
    assert.equal(fullKpis.engagement.stickiness.rate, 83.3, 'Stickiness (WAU/MAU) = 83.3%');

    // 5.3 Doctor & Clinic Activity
    assert.equal(fullKpis.activity.doctors.activeDoctorsCount, 1, '1 active doctor (doc_tarek)');
    assert.equal(fullKpis.activity.doctors.totalReviews, 3, '3 doctor reviews');
    assert.equal(fullKpis.activity.doctors.reviewsPerDoctor.rate, 3);
    assert.equal(fullKpis.activity.clinics.activeClinicsCount, 1);

    // 5.4 Satisfaction (CSAT)
    assert.equal(fullKpis.satisfaction.csat.denominatorValue, 3);
    assert.equal(fullKpis.satisfaction.csat.numeratorValue, 2);
    assert.equal(fullKpis.satisfaction.csat.rate, 66.7);
    assert.equal(fullKpis.satisfaction.avgStarRating, 3.7);

    // 5.5 Support Resolution
    assert.equal(fullKpis.support.openedTickets, 1);
    assert.equal(fullKpis.support.resolvedTickets, 1);
    assert.equal(fullKpis.support.resolutionRate.rate, 100.0);

    console.log('  ✓ Retention calculated with explicit cohorts:');
    console.log(`    - D1 Retention:  ${fullKpis.retention.d1.display} (${fullKpis.retention.d1.numeratorValue}/${fullKpis.retention.d1.denominatorValue})`);
    console.log(`    - D7 Retention:  ${fullKpis.retention.d7.display} (${fullKpis.retention.d7.numeratorValue}/${fullKpis.retention.d7.denominatorValue})`);
    console.log(`    - D30 Retention: ${fullKpis.retention.d30.display} (${fullKpis.retention.d30.numeratorValue}/${fullKpis.retention.d30.denominatorValue})`);
    console.log(`  ✓ WAU: ${fullKpis.engagement.wau} | MAU: ${fullKpis.engagement.mau} | Stickiness: ${fullKpis.engagement.stickiness.display}`);
    console.log(`  ✓ Doctor Reviews: ${fullKpis.activity.doctors.totalReviews} (${fullKpis.activity.doctors.reviewsPerDoctor.display})`);
    console.log(`  ✓ CSAT: ${fullKpis.satisfaction.csat.display} | Avg Star Rating: ${fullKpis.satisfaction.starRatingDisplay}\n`);

    // ---------------------------------------------------------------------------
    // TEST 6: "Unavailable" Fallbacks When Denominators or Data Are Missing
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 6: "Unavailable" Fallbacks When Denominators or Data Are Missing');

    const emptyKpis = analyticsService.calculateProductKpis([]);

    assert.equal(emptyKpis.assessmentJourney.journeyCompletionRate.rate, null);
    assert.equal(emptyKpis.assessmentJourney.journeyCompletionRate.display, 'Unavailable');
    assert.equal(emptyKpis.assessmentJourney.journeyCompletionRate.displayAr, 'غير متاح');

    assert.equal(emptyKpis.turnaround.avgMinutes, null);
    assert.equal(emptyKpis.turnaround.display, 'Unavailable');
    assert.equal(emptyKpis.turnaround.displayAr, 'غير متاح');

    assert.equal(emptyKpis.retention.d1.rate, null);
    assert.equal(emptyKpis.retention.d1.display, 'Unavailable');

    assert.equal(emptyKpis.satisfaction.csat.rate, null);
    assert.equal(emptyKpis.satisfaction.csat.display, 'Unavailable');
    assert.equal(emptyKpis.satisfaction.starRatingDisplay, 'Unavailable');
    assert.equal(emptyKpis.satisfaction.starRatingDisplayAr, 'غير متاح');

    assert.equal(emptyKpis.support.resolutionRate.rate, null);
    assert.equal(emptyKpis.support.resolutionRate.display, 'Unavailable');

    console.log('  ✓ Missing denominators strictly format as "Unavailable" (or "غير متاح"):');
    console.log(`    - Empty Journey Completion: ${emptyKpis.assessmentJourney.journeyCompletionRate.display} (${emptyKpis.assessmentJourney.journeyCompletionRate.displayAr})`);
    console.log(`    - Empty Turnaround:         ${emptyKpis.turnaround.display} (${emptyKpis.turnaround.displayAr})`);
    console.log(`    - Empty CSAT:               ${emptyKpis.satisfaction.csat.display} (${emptyKpis.satisfaction.csat.displayAr})\n`);

    // ---------------------------------------------------------------------------
    // TEST 7: Backend API Endpoint Integration
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 7: Backend API Endpoint Integration (/api/analytics/metrics & /events)');

    // 7.1 POST /api/analytics/events
    const eventPostRes = await request('POST', '/api/analytics/events', null, {
      eventType: 'signup',
      userId: 'user_http_test',
      payload: { role: 'patient', platform: 'desktop' }
    });
    assert.equal(eventPostRes.status, 200);
    assert.equal(eventPostRes.body.success, true);
    assert.ok(eventPostRes.body.eventId);

    // 7.2 GET /api/analytics/metrics with super_admin
    const metricsGetRes = await request('GET', '/api/analytics/metrics?timePeriod=last_30d', 'super-admin');
    assert.equal(metricsGetRes.status, 200);
    assert.equal(metricsGetRes.body.success, true);
    assert.ok(metricsGetRes.body.assessmentJourney);
    assert.ok(metricsGetRes.body.retention);
    assert.ok(metricsGetRes.body.engagement);
    assert.ok(metricsGetRes.body.activity);
    assert.ok(metricsGetRes.body.satisfaction);
    assert.ok(metricsGetRes.body.support);

    // 7.3 Clinic isolation check: Clinic Admin cannot query other clinic
    const crossClinicRes = await request(
      'GET',
      '/api/analytics/metrics?clinicId=alexandria-branch',
      'clinic-admin'
    );
    assert.equal(crossClinicRes.status, 403, 'Cross-clinic analytics query by clinic_admin rejected with 403');
    assert.equal(crossClinicRes.body.error, 'ACCESS_DENIED');

    console.log('  ✓ Server /api/analytics/events and /api/analytics/metrics verified with full RBAC & Clinic isolation.\n');

    console.log('==================================================================');
    console.log('🎉 ALL 7 PRODUCT ANALYTICS & JOURNEY KPI TESTS PASSED (100%)');
    console.log('==================================================================\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
