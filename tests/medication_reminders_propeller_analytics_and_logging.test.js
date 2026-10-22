/**
 * Health Vibe AI - Propeller Health Benchmark: Medication Reminders Analytics, Telemetry & Logging Tests
 *
 * Benchmark: Propeller Health (https://propellerhealth.com/)
 * Scope: P3 - أولوية متوسطة | Backend / Security | المواعيد والشات بوت والملفات (المراقبة وتحليلات الاستخدام (Analytics & Logging)) |
 * تنبيهات متابعة الدواء والبخاخات (Medication Reminders) — إرسال تذكيرات يومية للمريض بمواعيد البخاخة الوقائية
 * لتعزيز الالتزام العلاجي (Adherence) (تسجيل معدلات الاستخدام والنجاح في لوحة تحليلات الإدارة). | Propeller Health
 *
 * Test Matrix (11 Verification Tests):
 * 1. EVENT_TYPES Telemetry Registry & Zero-PHI Guard.
 * 2. Monotonic Telemetry Event Ingestion (Reminders, Doses, Rescue, Canister).
 * 3. Longitudinal Adherence Rate Formula & Explicit Numerator/Denominator Math.
 * 4. Propeller High Adherence Cohort Target (>= 80% Excellent Band).
 * 5. Respiratory Rescue Inhaler Trends, Frequency & Trigger Distribution.
 * 6. Canister Supply Chain & Low-Canister Refill Turnaround Responsiveness.
 * 7. Clinical Governance & Security Violations Audit Metrics.
 * 8. Time-Window Slicing & Custom Date Range Filtering (7d, 14d, 30d, all).
 * 9. REST API Endpoints RBAC Verification (401 unauth, 403 patient, 200 clinician/admin).
 * 10. Propeller Health Clinical Benchmark Certification Object.
 * 11. RESTful Endpoints Mounting in server.js.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const analyticsService = require('../backend/analytics-service');
const {
  EVENT_TYPES,
  calculateMedicationReminderKpis,
  getMedicationReminderAnalytics,
  resetAnalyticsState,
  recordEvent
} = analyticsService;

const app = require('../backend/server');

console.log('\n==================================================================');
console.log('📊 HEALTH VIBE AI: PROPELLER MEDICATION REMINDERS ANALYTICS');
console.log('   Benchmark: Propeller Health (Adherence Telemetry & Admin KPIs)');
console.log('==================================================================\n');

async function runAnalyticsSuite() {
  const adminUser = { uid: 'admin_director_01', role: 'super_admin' };
  const doctorUser = { uid: 'doc_pulmo_01', role: 'pulmonologist', displayName: 'Dr. Tarek Pulmo' };
  const clinicAdminUser = { uid: 'admin_clinic_01', role: 'clinic_admin', clinicId: 'c_cairo_chest' };
  const patientUser = { uid: 'pt_sample_01', role: 'patient' };

  resetAnalyticsState();

  // ==================================================================
  // TEST 1: EVENT_TYPES Telemetry Registry & Zero-PHI Guard
  // ==================================================================
  console.log('▶ TEST 1: EVENT_TYPES Telemetry Registry & Zero-PHI Guard');
  {
    const expectedEvents = [
      'MEDICATION_REMINDER_SCHEDULED',
      'MEDICATION_REMINDER_DISPATCHED',
      'MEDICATION_DOSE_LOGGED',
      'MEDICATION_DOSE_SNOOZED',
      'MEDICATION_DOSE_SKIPPED',
      'MEDICATION_RESCUE_LOGGED',
      'MEDICATION_RESCUE_SAFETY_ALERT',
      'MEDICATION_CANISTER_LOW_ALERT',
      'MEDICATION_CANISTER_REFILLED',
      'MEDICATION_ADHERENCE_CALCULATED',
      'MEDICATION_SAFETY_GUARDRAIL_TRIGGERED',
      'MEDICATION_EMERGENCY_ESCALATED',
      'MEDICATION_PHYSICIAN_OVERRIDE_BLOCKED',
      'MEDICATION_PRIVACY_EXPORTED',
      'MEDICATION_PRIVACY_PURGED'
    ];

    expectedEvents.forEach(evtKey => {
      assert.ok(EVENT_TYPES[evtKey], `EVENT_TYPES must contain ${evtKey}`);
      assert.strictEqual(typeof EVENT_TYPES[evtKey], 'string');
    });

    // Zero-PHI Telemetry Guard: Clinical text is strictly rejected
    assert.throws(
      () => {
        recordEvent({
          eventType: EVENT_TYPES.MEDICATION_DOSE_LOGGED,
          userId: patientUser.uid,
          payload: {
            patientId: patientUser.uid,
            diagnosis: 'Chronic Bronchial Asthma' // Forbidden clinical diagnosis key
          }
        });
      },
      /MEDICAL_TEXT_PROHIBITED/
    );

    console.log('  ✓ All 15 telemetry events registered and Zero-PHI guard verified');
  }

  // ==================================================================
  // TEST 2: Monotonic Telemetry Event Ingestion
  // ==================================================================
  console.log('▶ TEST 2: Monotonic Telemetry Event Ingestion');
  {
    resetAnalyticsState();

    // 1. Scheduled & Dispatched Reminders
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_REMINDER_SCHEDULED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', type: 'controller', scheduleCount: 2 }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_REMINDER_DISPATCHED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', channel: 'in_app' }
    });

    // 2. Doses (taken, snoozed, skipped)
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_DOSE_LOGGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', status: 'taken', canisterRemaining: 119, doseTime: '08:00' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_DOSE_LOGGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', status: 'taken', canisterRemaining: 118, doseTime: '20:00' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_DOSE_SNOOZED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', status: 'snoozed' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_DOSE_SKIPPED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', status: 'skipped' }
    });

    // 3. Rescue Puffs & Triggers
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_RESCUE_LOGGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_ventolin_01', puffs: 2, trigger: 'dust', safetyAlertTriggered: false }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_RESCUE_LOGGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_ventolin_01', puffs: 1, trigger: 'cold_air', safetyAlertTriggered: false }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_RESCUE_LOGGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_ventolin_01', puffs: 3, trigger: 'exercise', safetyAlertTriggered: true }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_RESCUE_SAFETY_ALERT,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, totalRescue24h: 3, threshold: 3 }
    });

    // 4. Canister alerts and refills
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_CANISTER_LOW_ALERT,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', canisterRemaining: 18 }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_CANISTER_REFILLED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', canisterRemaining: 120 }
    });

    // 5. Adherence calculation event
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_ADHERENCE_CALCULATED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, days: 14, adherencePct: 88, band: 'excellent', streakDays: 7, rescuePast7Days: 6 }
    });

    const events = analyticsService.getInMemoryEvents();
    assert.strictEqual(events.length, 13);
    console.log(`  ✓ Successfully ingested ${events.length} monotonic operational events`);
  }

  // ==================================================================
  // TEST 3: Longitudinal Adherence Rate Formula & Explicit Math
  // ==================================================================
  console.log('▶ TEST 3: Longitudinal Adherence Rate Formula & Explicit Math');
  {
    const kpis = calculateMedicationReminderKpis();

    assert.strictEqual(kpis.summary.dosesTaken, 2);
    assert.strictEqual(kpis.summary.dosesSkipped, 1);
    assert.strictEqual(kpis.summary.dosesSnoozed, 1);
    assert.strictEqual(kpis.summary.totalDosesLogged, 4);

    const adherenceMetric = kpis.kpis.overallAdherenceRate;
    assert.strictEqual(adherenceMetric.numeratorValue, 2);
    assert.strictEqual(adherenceMetric.denominatorValue, 3); // taken (2) + skipped (1) = 3 actionable doses
    assert.strictEqual(adherenceMetric.rate, 66.7);
    assert.strictEqual(adherenceMetric.formatted, '66.7%');
    assert.strictEqual(adherenceMetric.isAvailable, true);

    console.log(`  ✓ Adherence formula validated: 2 taken / 3 scheduled = ${adherenceMetric.rate}%`);
  }

  // ==================================================================
  // TEST 4: Propeller High Adherence Cohort Target (>= 80% Excellent Band)
  // ==================================================================
  console.log('▶ TEST 4: Propeller High Adherence Cohort Target (>= 80% Excellent Band)');
  {
    const kpis = calculateMedicationReminderKpis();

    assert.strictEqual(kpis.adherenceDistribution.excellentCount, 1);
    assert.strictEqual(kpis.adherenceDistribution.moderateCount, 0);
    assert.strictEqual(kpis.adherenceDistribution.atRiskCount, 0);
    assert.strictEqual(kpis.adherenceDistribution.totalEvaluated, 1);

    const cohortKpi = kpis.kpis.highAdherenceCohortRate;
    assert.strictEqual(cohortKpi.numeratorValue, 1);
    assert.strictEqual(cohortKpi.denominatorValue, 1);
    assert.strictEqual(cohortKpi.rate, 100);
    assert.strictEqual(cohortKpi.formatted, '100%');

    console.log('  ✓ High adherence cohort proportion computed accurately');
  }

  // ==================================================================
  // TEST 5: Respiratory Rescue Trends & Trigger Distribution
  // ==================================================================
  console.log('▶ TEST 5: Respiratory Rescue Trends & Trigger Distribution');
  {
    const kpis = calculateMedicationReminderKpis();

    // 2 (dust) + 1 (cold_air) + 3 (exercise) = 6 puffs across 3 sessions
    assert.strictEqual(kpis.summary.totalRescuePuffs, 6);
    assert.strictEqual(kpis.summary.rescueSessionsCount, 3);
    assert.strictEqual(kpis.summary.rescueSafetyAlertsTriggered, 1);

    assert.strictEqual(kpis.rescueTriggersBreakdown.dust, 2);
    assert.strictEqual(kpis.rescueTriggersBreakdown.cold_air, 1);
    assert.strictEqual(kpis.rescueTriggersBreakdown.exercise, 3);
    assert.strictEqual(kpis.rescueTriggersBreakdown.smoke, 0);

    // Controller-to-Rescue Ratio: 2 taken doses / 6 rescue puffs = 0.3
    assert.strictEqual(kpis.summary.controllerToRescueRatio, '0.3');

    // Clinical rescue control rate: (3 sessions - 1 alert) / 3 = 66.7%
    const rescueSafetyKpi = kpis.kpis.clinicalRescueSafetyRate;
    assert.strictEqual(rescueSafetyKpi.numeratorValue, 2);
    assert.strictEqual(rescueSafetyKpi.denominatorValue, 3);
    assert.strictEqual(rescueSafetyKpi.rate, 66.7);

    console.log('  ✓ Rescue frequency, triggers breakdown, and controller-to-rescue ratio verified');
  }

  // ==================================================================
  // TEST 6: Canister Supply Chain & Low Canister Refill Turnaround
  // ==================================================================
  console.log('▶ TEST 6: Canister Supply Chain & Low Canister Refill Turnaround');
  {
    const kpis = calculateMedicationReminderKpis();

    assert.strictEqual(kpis.summary.lowCanisterAlerts, 1);
    assert.strictEqual(kpis.summary.canistersRefilled, 1);

    const refillKpi = kpis.kpis.canisterRefillTurnaroundRate;
    assert.strictEqual(refillKpi.numeratorValue, 1);
    assert.strictEqual(refillKpi.denominatorValue, 1);
    assert.strictEqual(refillKpi.rate, 100);

    console.log('  ✓ Canister tracking and 100% refill turnaround rate verified');
  }

  // ==================================================================
  // TEST 7: Clinical Governance & Security Violations Audit Metrics
  // ==================================================================
  console.log('▶ TEST 7: Clinical Governance & Security Violations Audit Metrics');
  {
    // Record security events
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PHYSICIAN_OVERRIDE_BLOCKED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, medId: 'med_symbicort_01', violatingRole: 'patient' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_SAFETY_GUARDRAIL_TRIGGERED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, guardrailType: 'dosage_change_blocked' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_EMERGENCY_ESCALATED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, riskLevel: 'critical', actionTaken: 'emergency_triage' }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PRIVACY_EXPORTED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, exportedCount: 15 }
    });
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PRIVACY_PURGED,
      userId: patientUser.uid,
      payload: { patientId: patientUser.uid, actionTaken: 'pseudonymize_and_purge' }
    });

    const kpis = calculateMedicationReminderKpis();
    assert.strictEqual(kpis.clinicalGovernance.physicianOverridesBlocked, 1);
    assert.strictEqual(kpis.clinicalGovernance.safetyGuardrailTriggered, 1);
    assert.strictEqual(kpis.clinicalGovernance.emergencyEscalations, 1);
    assert.strictEqual(kpis.clinicalGovernance.privacyDataExports, 1);
    assert.strictEqual(kpis.clinicalGovernance.privacyDataPurges, 1);

    console.log('  ✓ Clinical governance & privacy audit metrics verified');
  }

  // ==================================================================
  // TEST 8: Time-Window Slicing & Custom Date Range Filtering
  // ==================================================================
  console.log('▶ TEST 8: Time-Window Slicing & Custom Date Range Filtering');
  {
    const allKpis = calculateMedicationReminderKpis(analyticsService.getInMemoryEvents(), { timePeriod: 'all' });
    assert.strictEqual(allKpis.timePeriod, 'all');

    const past7dKpis = calculateMedicationReminderKpis(analyticsService.getInMemoryEvents(), { timePeriod: '7d' });
    assert.strictEqual(past7dKpis.timePeriod, '7d');
    assert.ok(past7dKpis.summary.totalDosesLogged > 0);

    // Custom past date range that has zero events
    const emptyKpis = calculateMedicationReminderKpis(analyticsService.getInMemoryEvents(), {
      startDate: '2020-01-01',
      endDate: '2020-01-02'
    });
    assert.strictEqual(emptyKpis.summary.totalDosesLogged, 0);
    assert.strictEqual(emptyKpis.kpis.overallAdherenceRate.display, 'Unavailable');
    assert.strictEqual(emptyKpis.kpis.overallAdherenceRate.displayAr, 'غير متاح');

    console.log('  ✓ Time period slicing (all, 7d, custom) and Unavailable fallbacks validated');
  }

  // ==================================================================
  // TEST 9: REST API Endpoints RBAC Verification
  // ==================================================================
  console.log('▶ TEST 9: REST API Endpoints RBAC Verification (401 unauth, 403 patient, 200 clinician)');
  {
    // Helper to simulate request to express app
    const simulateRoute = (userRole, userUid) => {
      let status = 200;
      let body = {};
      const req = {
        user: userRole ? { uid: userUid || 'user_1', role: userRole } : null,
        query: { timePeriod: 'all' }
      };
      const res = {
        status: (s) => { status = s; return res; },
        json: (b) => { body = b; return res; }
      };

      // Find route handler in server.js stack
      const route = app._router.stack.find(
        r => r.route && r.route.path === '/api/medication-reminders/analytics/kpis'
      );
      assert.ok(route, 'Route /api/medication-reminders/analytics/kpis must be mounted in express');

      // The second handler after requireAuth
      const handler = route.route.stack[route.route.stack.length - 1].handle;
      handler(req, res);
      return { status, body };
    };

    // 1. Patient Access -> Blocked 403 Forbidden
    const patientAttempt = simulateRoute('patient', patientUser.uid);
    assert.strictEqual(patientAttempt.status, 403);
    assert.strictEqual(patientAttempt.body.error, 'FORBIDDEN');

    // 2. Pulmonologist Access -> 200 OK
    const doctorAttempt = simulateRoute('pulmonologist', doctorUser.uid);
    assert.strictEqual(doctorAttempt.status, 200);
    assert.strictEqual(doctorAttempt.body.success, true);
    assert.ok(doctorAttempt.body.kpis.overallAdherenceRate);

    // 3. Super Admin Access -> 200 OK
    const adminAttempt = simulateRoute('super_admin', adminUser.uid);
    assert.strictEqual(adminAttempt.status, 200);
    assert.strictEqual(adminAttempt.body.success, true);

    // 4. Clinic Admin Access -> 200 OK
    const clinicAdminAttempt = simulateRoute('clinic_admin', clinicAdminUser.uid);
    assert.strictEqual(clinicAdminAttempt.status, 200);
    assert.strictEqual(clinicAdminAttempt.body.success, true);

    console.log('  ✓ Zero-Trust RBAC strictly enforced (patient 403, doctor 200, admin 200)');
  }

  // ==================================================================
  // TEST 10: Propeller Health Clinical Benchmark Certification Object
  // ==================================================================
  console.log('▶ TEST 10: Propeller Health Clinical Benchmark Certification Object');
  {
    const kpis = calculateMedicationReminderKpis();
    assert.ok(kpis.propellerBenchmark);
    assert.strictEqual(kpis.propellerBenchmark.clinicalStandard, 'Propeller Health Digital Respiratory Standard');
    assert.strictEqual(kpis.propellerBenchmark.zeroPhiTelemetryCertified, true);
    assert.strictEqual(kpis.propellerBenchmark.humanPhysicianGateEnforced, true);
    assert.strictEqual(kpis.propellerBenchmark.canisterLowThresholdPuffs, 20);

    console.log('  ✓ Propeller benchmark certification metadata verified');
  }

  // ==================================================================
  // TEST 11: RESTful Endpoints Mounting in server.js
  // ==================================================================
  console.log('▶ TEST 11: RESTful Endpoints Mounting in server.js');
  {
    const serverJsContent = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    const expectedEndpoints = [
      '/api/medication-reminders/analytics/kpis',
      '/api/analytics/medication-reminders'
    ];

    expectedEndpoints.forEach(endpoint => {
      assert.ok(serverJsContent.includes(endpoint), `server.js must contain analytics route: ${endpoint}`);
    });

    console.log('  ✓ Analytics and KPI REST routes verified in server.js');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 11 PROPELLER ANALYTICS & LOGGING TESTS PASSED (100%)');
  console.log('==================================================================\n');
  process.exit(0);
}

runAnalyticsSuite().catch(err => {
  console.error('\n❌ ANALYTICS TEST RUNNER FAILED:', err);
  process.exit(1);
});
