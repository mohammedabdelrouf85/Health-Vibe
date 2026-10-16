/**
 * Health Vibe AI - Okadoc 1-Click Reschedule & Cancellation Analytics & Logging Test Suite
 *
 * Verifies:
 * 1. Event Constant Definitions in backend analyticsService and client adminService:
 *    - APPOINTMENT_RESCHEDULE_ATTEMPT, APPOINTMENT_RESCHEDULE_SUCCESS, APPOINTMENT_RESCHEDULE_FAILURE
 *    - APPOINTMENT_CANCEL_ATTEMPT, APPOINTMENT_CANCEL_SUCCESS, APPOINTMENT_CANCEL_FAILURE
 *    - RECIPROCAL_NOTIFICATION_DISPATCHED, ONE_CLICK_REBOOK_CLICKED, ONE_CLICK_REBOOK_SUCCESS, CALENDAR_ICS_DOWNLOADED
 * 2. Zero-PHI Guardrails & Sanitization:
 *    - Strict rejection of medical text, diagnoses, symptoms, vitals, prescriptions.
 *    - Safe transmission of operational metadata (appointmentId, reason category, initiatorRole, channels).
 * 3. Telemetry Event Lifecycle during rescheduleAppointmentTransaction:
 *    - Records attempt, success, reciprocal notification dispatch, and failure on error.
 * 4. Telemetry Event Lifecycle during cancelAppointmentTransaction:
 *    - Records attempt, success, reciprocal notification dispatch, and failure on error.
 * 5. Server-side KPI Engine (analyticsService.calculateAppointmentKpis):
 *    - rescheduleRate, rescheduleSuccessRate, cancellationSuccessRate, reciprocalAlertDispatchRate, oneClickRebookRate.
 *    - Explicit numerators, denominators, and Unavailable / غير متاح fallback when denominator is missing.
 * 6. Reasons Categorization Breakdown & Initiator Roles:
 *    - conflict, emergency, recovered, commute, doctor_request, other.
 *    - patientCount, clinicCount, doctorCount.
 * 7. Authoritative Database Aggregation (schedulingService.getAppointmentAnalytics):
 *    - Compiles real database records, historical mutations, and merges with telemetry.
 * 8. Client Parity (AdminService.calculateAppointmentKpis):
 *    - Generates matching calculations and display strings in Arabic and English.
 * 9. Bilingual Catalog Parity in app/i18n.js:
 *    - 100% key parity across Arabic and English appointments namespaces.
 */

const assert = require('assert');
const analyticsService = require('../backend/analytics-service');
const schedulingService = require('../backend/scheduling-service');
const adminService = require('../app/modules/admin/admin-service');
const i18n = require('../app/i18n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runTestAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('==================================================================');
console.log('⚡ OKADOC 1-CLICK RESCHEDULE & CANCELLATION ANALYTICS TEST SUITE');
console.log('   P3 Feature: Telemetry, Logging, Success KPIs & Admin Dashboard');
console.log('==================================================================\n');

(async function main() {
  // -------------------------------------------------------------
  // TEST 1: EVENT TYPE DEFINITIONS IN BACKEND AND CLIENT
  // -------------------------------------------------------------
  runTest('1.1: Event types include complete Okadoc 1-click telemetry constants', () => {
    const requiredTypes = [
      'APPOINTMENT_RESCHEDULE_ATTEMPT',
      'APPOINTMENT_RESCHEDULE_SUCCESS',
      'APPOINTMENT_RESCHEDULE_FAILURE',
      'APPOINTMENT_CANCEL_ATTEMPT',
      'APPOINTMENT_CANCEL_SUCCESS',
      'APPOINTMENT_CANCEL_FAILURE',
      'RECIPROCAL_NOTIFICATION_DISPATCHED',
      'ONE_CLICK_REBOOK_CLICKED',
      'ONE_CLICK_REBOOK_SUCCESS',
      'CALENDAR_ICS_DOWNLOADED'
    ];

    requiredTypes.forEach(t => {
      assert.ok(analyticsService.EVENT_TYPES[t], `analyticsService missing EVENT_TYPES.${t}`);
      assert.ok(adminService.APPOINTMENT_EVENT_TYPES[t], `adminService missing APPOINTMENT_EVENT_TYPES.${t}`);
    });
  });

  // -------------------------------------------------------------
  // TEST 2: ZERO-PHI PRIVACY GUARDRAILS
  // -------------------------------------------------------------
  runTest('2.1: Rejects telemetry events containing clinical text or vitals', () => {
    const forbiddenProps = [
      { symptoms: 'Acute coughing and wheezing' },
      { diagnosis: 'Asthma exacerbation' },
      { spo2: 89 },
      { vital: 'HR 110 bpm' },
      { prescription: 'Ventolin inhaler' },
      { clinicalNotes: 'Patient requires emergency care' }
    ];

    forbiddenProps.forEach(prop => {
      assert.throws(() => {
        analyticsService.recordEvent({
          eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT,
          userId: 'usr_pat_1',
          payload: prop
        });
      }, /MEDICAL_TEXT_PROHIBITED/);
    });
  });

  runTest('2.2: Permits non-PHI operational metadata for reschedules and cancellations', () => {
    const validPayload = {
      appointmentId: 'appt_123',
      doctorId: 'doc_respiratory_1',
      date: '2026-10-25',
      slotId: 'slot_10-00',
      reason: 'Work schedule conflict',
      initiatorRole: 'patient',
      channels: ['sms', 'email']
    };

    const res = analyticsService.recordEvent({
      eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_SUCCESS,
      userId: 'usr_pat_1',
      payload: validPayload
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.eventId);
  });

  // -------------------------------------------------------------
  // TEST 3: RESCHEDULE TELEMETRY LIFECYCLE
  // -------------------------------------------------------------
  await runTestAsync('3.1: rescheduleAppointmentTransaction records attempt, success & reciprocal alert', async () => {
    analyticsService.resetAnalyticsState();

    const mockAppointment = {
      id: 'appt_telemetry_test_1',
      patientId: 'pat_user_1',
      doctorId: 'doc_pulmo_1',
      doctorName: 'Dr. Tarek Pulmonology',
      clinicId: 'cairo_maadi',
      date: '2026-10-20',
      slotId: 'slot_1100',
      timeSlot: '11:00 ص',
      timeSlotEn: '11:00 AM',
      status: 'confirmed'
    };

    const mockDb = {
      collection: (colName) => ({
        doc: (docId) => ({
          get: async () => ({
            exists: docId === 'appt_telemetry_test_1',
            data: () => ({ ...mockAppointment })
          }),
          update: async () => {}
        })
      })
    };

    const actorPatient = { uid: 'pat_user_1', role: 'patient' };
    const res = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: 'appt_telemetry_test_1',
      newDate: '2026-10-22',
      newSlotId: 'slot_1000',
      reason: 'Work conflict'
    }, actorPatient);

    assert.strictEqual(res.success, true);

    const events = analyticsService.getInMemoryEvents();
    const attempts = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT);
    const successes = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_SUCCESS);
    const reciprocalDispatches = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.RECIPROCAL_NOTIFICATION_DISPATCHED);

    assert.strictEqual(attempts.length >= 1, true, 'Should emit APPOINTMENT_RESCHEDULE_ATTEMPT');
    assert.strictEqual(successes.length >= 1, true, 'Should emit APPOINTMENT_RESCHEDULE_SUCCESS');
    assert.strictEqual(reciprocalDispatches.length >= 1, true, 'Should emit RECIPROCAL_NOTIFICATION_DISPATCHED');
  });

  await runTestAsync('3.2: rescheduleAppointmentTransaction records failure event on error', async () => {
    analyticsService.resetAnalyticsState();

    const mockDb = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false })
        })
      })
    };

    let caughtError = null;
    try {
      await schedulingService.rescheduleAppointmentTransaction(mockDb, {
        appointmentId: 'appt_non_existent',
        newDate: '2026-10-22',
        newSlotId: 'slot_10-00'
      }, { uid: 'pat_user_1', role: 'patient' });
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError, 'Expected non-existent appointment to throw');
    const events = analyticsService.getInMemoryEvents();
    const failures = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_FAILURE);
    assert.strictEqual(failures.length >= 1, true, 'Should record APPOINTMENT_RESCHEDULE_FAILURE');
    assert.strictEqual(failures[0].payload.errorCode, 'APPOINTMENT_NOT_FOUND');
  });

  // -------------------------------------------------------------
  // TEST 4: CANCELLATION TELEMETRY LIFECYCLE
  // -------------------------------------------------------------
  await runTestAsync('4.1: cancelAppointmentTransaction records attempt, success & reciprocal alert', async () => {
    analyticsService.resetAnalyticsState();

    const mockAppointment = {
      id: 'appt_cancel_test_1',
      patientId: 'pat_user_2',
      doctorId: 'doc_pulmo_1',
      clinicId: 'cairo_maadi',
      date: '2026-10-25',
      slotId: 'slot_11-00',
      timeSlot: '11:00 ص',
      status: 'confirmed'
    };

    const mockDb = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ ...mockAppointment })
          }),
          update: async () => {}
        })
      })
    };

    const actor = { uid: 'pat_user_2', role: 'patient' };
    const res = await schedulingService.cancelAppointmentTransaction(mockDb, 'appt_cancel_test_1', actor, {
      reason: 'Symptoms improved'
    });

    assert.strictEqual(res.success, true);
    const events = analyticsService.getInMemoryEvents();
    const attempts = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_ATTEMPT);
    const successes = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_SUCCESS);
    const reciprocalDispatches = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.RECIPROCAL_NOTIFICATION_DISPATCHED);

    assert.strictEqual(attempts.length >= 1, true, 'Should record APPOINTMENT_CANCEL_ATTEMPT');
    assert.strictEqual(successes.length >= 1, true, 'Should record APPOINTMENT_CANCEL_SUCCESS');
    assert.strictEqual(reciprocalDispatches.length >= 1, true, 'Should record RECIPROCAL_NOTIFICATION_DISPATCHED');
  });

  await runTestAsync('4.2: cancelAppointmentTransaction records failure event on missing appointment', async () => {
    analyticsService.resetAnalyticsState();

    const mockDb = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false })
        })
      })
    };

    let caughtError = null;
    try {
      await schedulingService.cancelAppointmentTransaction(mockDb, 'appt_missing_999', { uid: 'pat_user_1', role: 'patient' });
    } catch (e) {
      caughtError = e;
    }

    assert.ok(caughtError);
    const events = analyticsService.getInMemoryEvents();
    const failures = events.filter(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_FAILURE);
    assert.strictEqual(failures.length >= 1, true, 'Should record APPOINTMENT_CANCEL_FAILURE');
    assert.strictEqual(failures[0].payload.errorCode, 'APPOINTMENT_NOT_FOUND');
  });

  // -------------------------------------------------------------
  // TEST 5: CALCULATE APPOINTMENT KPIS (ANALYTICS SERVICE)
  // -------------------------------------------------------------
  runTest('5.1: calculateAppointmentKpis computes accurate rates with explicit numerators and denominators', () => {
    const testEvents = [
      // 10 booking attempts, 8 confirmed bookings
      ...Array.from({ length: 10 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_ATTEMPT,
        payload: { attemptId: `att_${i}` }
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS,
        payload: { appointmentId: `appt_${i}`, doctorId: 'doc_1', consultationType: 'clinic' }
      })),
      // 4 reschedule attempts, 3 successes, 1 failure
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT, payload: { appointmentId: 'appt_1' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT, payload: { appointmentId: 'appt_2' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT, payload: { appointmentId: 'appt_3' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_ATTEMPT, payload: { appointmentId: 'appt_4' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_SUCCESS, payload: { appointmentId: 'appt_1', reason: 'Work schedule conflict', initiatorRole: 'patient' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_SUCCESS, payload: { appointmentId: 'appt_2', reason: 'Cairo commute traffic', initiatorRole: 'patient' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_SUCCESS, payload: { appointmentId: 'appt_3', reason: 'Doctor requested change', initiatorRole: 'doctor' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE_FAILURE, payload: { appointmentId: 'appt_4', errorCode: 'SLOT_NOT_AVAILABLE' } },
      // 3 cancellation attempts, 2 successes, 1 failure
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_ATTEMPT, payload: { appointmentId: 'appt_5' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_ATTEMPT, payload: { appointmentId: 'appt_6' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_ATTEMPT, payload: { appointmentId: 'appt_7' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_SUCCESS, payload: { appointmentId: 'appt_5', reason: 'Recovered completely', initiatorRole: 'patient' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_SUCCESS, payload: { appointmentId: 'appt_6', reason: 'Clinic requested cancellation', initiatorRole: 'clinic_admin' } },
      { eventType: analyticsService.EVENT_TYPES.APPOINTMENT_CANCEL_FAILURE, payload: { appointmentId: 'appt_7', errorCode: 'PAST_APPOINTMENT' } },
      // 4 reciprocal notification alerts dispatched
      ...Array.from({ length: 4 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.RECIPROCAL_NOTIFICATION_DISPATCHED,
        payload: { action: i < 2 ? 'rescheduled' : 'cancelled' }
      })),
      // 1-click rebooking: 2 clicks, 1 rebooked successfully
      { eventType: analyticsService.EVENT_TYPES.ONE_CLICK_REBOOK_CLICKED, payload: { appointmentId: 'appt_6' } },
      { eventType: analyticsService.EVENT_TYPES.ONE_CLICK_REBOOK_CLICKED, payload: { appointmentId: 'appt_8' } },
      { eventType: analyticsService.EVENT_TYPES.ONE_CLICK_REBOOK_SUCCESS, payload: { appointmentId: 'appt_6_rebooked' } },
      // Calendar ICS downloads
      { eventType: analyticsService.EVENT_TYPES.CALENDAR_ICS_DOWNLOADED, payload: { appointmentId: 'appt_1' } }
    ];

    const kpis = analyticsService.calculateAppointmentKpis(testEvents, { isEn: true });

    // 1. Reschedule Rate: 3 reschedules / 8 confirmed = 37.5%
    assert.strictEqual(kpis.rescheduleRate.rate, 37.5);
    assert.strictEqual(kpis.rescheduleRate.numeratorValue, 3);
    assert.strictEqual(kpis.rescheduleRate.denominatorValue, 8);

    // 2. Reschedule Success Rate: 3 successes / 4 attempts = 75.0%
    assert.strictEqual(kpis.rescheduleSuccessRate.rate, 75.0);
    assert.strictEqual(kpis.rescheduleSuccessRate.numeratorValue, 3);
    assert.strictEqual(kpis.rescheduleSuccessRate.denominatorValue, 4);

    // 3. Cancellation Success Rate: 2 successes / 3 attempts = 66.7%
    assert.strictEqual(kpis.cancellationSuccessRate.rate, 66.7);
    assert.strictEqual(kpis.cancellationSuccessRate.numeratorValue, 2);
    assert.strictEqual(kpis.cancellationSuccessRate.denominatorValue, 3);

    // 4. Reciprocal Notification Dispatch Rate: 4 alerts / 5 modifications (3 resched + 2 cancel) = 80.0%
    assert.strictEqual(kpis.reciprocalAlertDispatchRate.rate, 80.0);
    assert.strictEqual(kpis.reciprocalAlertDispatchRate.numeratorValue, 4);
    assert.strictEqual(kpis.reciprocalAlertDispatchRate.denominatorValue, 5);

    // 5. 1-Click Rebooking Rate: 1 rebook / 2 clicks = 50.0%
    assert.strictEqual(kpis.oneClickRebookRate.rate, 50.0);
    assert.strictEqual(kpis.oneClickRebookRate.numeratorValue, 1);
    assert.strictEqual(kpis.oneClickRebookRate.denominatorValue, 2);

    // 6. Reasons breakdown validation
    assert.strictEqual(kpis.rescheduleReasonsBreakdown.conflict, 1);
    assert.strictEqual(kpis.rescheduleReasonsBreakdown.commute, 1);
    assert.strictEqual(kpis.rescheduleReasonsBreakdown.doctor_request, 1);
    assert.strictEqual(kpis.cancellationReasonsBreakdown.recovered, 1);
    assert.strictEqual(kpis.cancellationReasonsBreakdown.doctor_request, 1);

    // 7. Initiator breakdown validation
    assert.strictEqual(kpis.initiatorBreakdown.patientCount, 3); // 2 reschedules + 1 cancel
    assert.strictEqual(kpis.initiatorBreakdown.doctorCount, 1);
    assert.strictEqual(kpis.initiatorBreakdown.clinicCount, 1);
  });

  runTest('5.2: Returns Unavailable / غير متاح gracefully when denominator is zero', () => {
    const emptyEn = analyticsService.calculateAppointmentKpis([], { isEn: true });
    assert.strictEqual(emptyEn.rescheduleRate.rate, null);
    assert.strictEqual(emptyEn.rescheduleRate.display, 'Unavailable');
    assert.strictEqual(emptyEn.rescheduleSuccessRate.rate, null);
    assert.strictEqual(emptyEn.rescheduleSuccessRate.display, 'Unavailable');
    assert.strictEqual(emptyEn.reciprocalAlertDispatchRate.rate, null);
    assert.strictEqual(emptyEn.reciprocalAlertDispatchRate.display, 'Unavailable');

    const emptyAr = analyticsService.calculateAppointmentKpis([], { isEn: false });
    assert.strictEqual(emptyAr.rescheduleRate.displayAr, 'غير متاح');
    assert.strictEqual(emptyAr.rescheduleSuccessRate.displayAr, 'غير متاح');
    assert.strictEqual(emptyAr.cancellationSuccessRate.displayAr, 'غير متاح');
  });

  // -------------------------------------------------------------
  // TEST 6: AUTHORITATIVE DB AGGREGATION IN SCHEDULING SERVICE
  // -------------------------------------------------------------
  await runTestAsync('6.1: getAppointmentAnalytics computes DB metrics, reschedule rate, and breakdown', async () => {
    const mockAppointments = [
      { id: '1', status: 'confirmed', date: '2026-10-20', time: '10:00' },
      { id: '2', status: 'completed', date: '2026-10-21', time: '11:00' },
      {
        id: '3',
        status: 'rescheduled',
        date: '2026-10-22',
        time: '18:00',
        rescheduledAt: '2026-10-18T10:00:00Z',
        rescheduleReason: 'Schedule conflict',
        rescheduledByRole: 'patient',
        history: [{ action: 'RESCHEDULED', reason: 'Schedule conflict', actorRole: 'patient' }]
      },
      {
        id: '4',
        status: 'cancelled',
        date: '2026-10-23',
        time: '09:00',
        cancelReason: 'Doctor requested change due to surgery',
        cancelledByRole: 'doctor',
        history: [{ action: 'CANCELLED', reason: 'Doctor requested change due to surgery', actorRole: 'doctor' }]
      }
    ];

    const mockDb = {
      collection: (col) => {
        if (col === 'appointments') {
          return {
            get: async () => ({
              docs: mockAppointments.map(a => ({ id: a.id, data: () => a }))
            })
          };
        }
        return { get: async () => ({ docs: [] }) };
      }
    };

    const analytics = await schedulingService.getAppointmentAnalytics(mockDb, {
      timePeriod: 'Rolling 30 Days'
    });

    assert.strictEqual(analytics.success, true);
    assert.strictEqual(analytics.summary.totalBookings, 4);
    assert.strictEqual(analytics.summary.totalRescheduled, 1);
    assert.strictEqual(analytics.summary.totalCancelled, 1);
    // Reschedule rate: 1 / 4 = 25.0%
    assert.strictEqual(analytics.summary.rescheduleRate, 25.0);
    // Cancellation rate: 1 / 4 = 25.0%
    assert.strictEqual(analytics.summary.cancellationRate, 25.0);

    // Verify reasons breakdown
    assert.strictEqual(analytics.summary.rescheduleReasonsBreakdown.conflict, 1);
    assert.strictEqual(analytics.summary.cancellationReasonsBreakdown.doctor_request, 1);

    // Verify initiator breakdown
    assert.strictEqual(analytics.summary.initiatorBreakdown.patientCount, 1);
    assert.strictEqual(analytics.summary.initiatorBreakdown.doctorCount, 1);

    // Verify dbSummary
    assert.strictEqual(analytics.dbSummary.totalPersisted, 4);
    assert.strictEqual(analytics.dbSummary.rescheduled, 1);
    assert.strictEqual(analytics.dbSummary.cancelled, 1);
  });

  // -------------------------------------------------------------
  // TEST 7: CLIENT ADMIN SERVICE PARITY & LOCALIZED DISPLAYS
  // -------------------------------------------------------------
  runTest('7.1: adminService.calculateAppointmentKpis derives display-ready localized figures', () => {
    const rawAppts = [
      { id: 'a1', status: 'confirmed' },
      { id: 'a2', status: 'confirmed' },
      { id: 'a3', status: 'rescheduled', rescheduleReason: 'Traffic jam', rescheduledByRole: 'patient' },
      { id: 'a4', status: 'cancelled', cancelReason: 'Emergency hospital closure', cancelledByRole: 'clinic_admin' }
    ];

    const telemetryEvents = [
      { eventType: 'appointment_reschedule_attempt' },
      { eventType: 'appointment_reschedule_success', payload: { reason: 'Traffic jam' } },
      { eventType: 'appointment_cancel_attempt' },
      { eventType: 'appointment_cancel_success', payload: { reason: 'Emergency' } },
      { eventType: 'reciprocal_notification_dispatched' },
      { eventType: 'reciprocal_notification_dispatched' }
    ];

    const enRes = adminService.calculateAppointmentKpis(rawAppts, { events: telemetryEvents, isEn: true });
    assert.strictEqual(enRes.rescheduleRate, 25.0);
    assert.strictEqual(enRes.rescheduleRateDisplay, '25%');
    assert.strictEqual(enRes.rescheduleSuccessRate, 100.0);
    assert.strictEqual(enRes.rescheduleSuccessRateDisplay, '100%');
    assert.strictEqual(enRes.cancellationSuccessRate, 100.0);
    assert.strictEqual(enRes.cancellationSuccessRateDisplay, '100%');
    assert.strictEqual(enRes.reciprocalAlertDispatchRate, 100.0);
    assert.strictEqual(enRes.reciprocalAlertDispatchRateDisplay, '100%');

    const arRes = adminService.calculateAppointmentKpis(rawAppts, { events: telemetryEvents, isEn: false });
    assert.strictEqual(arRes.rescheduleRateDisplayAr, '25%');
    assert.strictEqual(arRes.rescheduleSuccessRateDisplayAr, '100%');
    assert.strictEqual(arRes.cancellationSuccessRateDisplayAr, '100%');
    assert.strictEqual(arRes.reciprocalAlertDispatchRateDisplayAr, '100%');

    // Test with empty dataset
    const emptyEn = adminService.calculateAppointmentKpis([], { events: [], isEn: true });
    assert.strictEqual(emptyEn.rescheduleRateDisplay, 'Unavailable');
    assert.strictEqual(emptyEn.rescheduleSuccessRateDisplay, 'Unavailable');

    const emptyAr = adminService.calculateAppointmentKpis([], { events: [], isEn: false });
    assert.strictEqual(emptyAr.rescheduleRateDisplayAr, 'غير متاح');
    assert.strictEqual(emptyAr.rescheduleSuccessRateDisplayAr, 'غير متاح');
  });

  // -------------------------------------------------------------
  // TEST 8: 100% BILINGUAL CATALOG PARITY IN I18N
  // -------------------------------------------------------------
  runTest('8.1: Full key parity between Arabic and English appointments translations', () => {
    const arAppointments = i18n.translations.ar.appointments;
    const enAppointments = i18n.translations.en.appointments;

    const requiredKeys = [
      'rescheduleRate',
      'rescheduleSuccessRate',
      'cancellationSuccessRate',
      'reciprocalAlertDispatchRate',
      'oneClickRebookRate',
      'rescheduleReasonsBreakdownTitle',
      'cancellationReasonsBreakdownTitle',
      'initiatorBreakdownTitle',
      'initiatorPatient',
      'initiatorClinic',
      'initiatorDoctor'
    ];

    requiredKeys.forEach(key => {
      assert.ok(arAppointments[key], `Missing Arabic i18n key: ${key}`);
      assert.ok(enAppointments[key], `Missing English i18n key: ${key}`);
    });

    const arKeys = Object.keys(arAppointments);
    const enKeys = Object.keys(enAppointments);
    const missingInEn = arKeys.filter(k => !enKeys.includes(k));
    const missingInAr = enKeys.filter(k => !arKeys.includes(k));

    assert.deepStrictEqual(missingInEn, [], `Keys present in Arabic but missing in English: ${missingInEn.join(', ')}`);
    assert.deepStrictEqual(missingInAr, [], `Keys present in English but missing in Arabic: ${missingInAr.join(', ')}`);
    assert.strictEqual(arKeys.length, enKeys.length, 'Catalog count must match 1:1');
  });

  console.log(`\n==================================================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log(`==================================================================\n`);
})().catch(err => {
  console.error('\n❌ TEST RUNNER TERMINATED WITH ERROR:', err);
  process.exit(1);
});
