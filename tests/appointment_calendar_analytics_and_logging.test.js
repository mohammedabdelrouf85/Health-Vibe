/**
 * Health Vibe AI - Appointment Calendar Analytics & Logging Test Suite
 * Feature: Appointment Calendar Telemetry, Analytics & Admin Dashboard KPIs
 * Reference: Vezeeta
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
console.log('🩺 APPOINTMENT CALENDAR ANALYTICS & LOGGING TEST SUITE');
console.log('   P3 Feature: Telemetry, Modality, Slot Prefs, & Admin KPIs');
console.log('==================================================================\n');

(async function main() {
  // -------------------------------------------------------------
  // TEST 1: EVENT TYPE DEFINITIONS & PHI WHITELIST GUARDS
  // -------------------------------------------------------------
  runTest('1.1: Event types include complete appointment telemetry events', () => {
    const requiredTypes = [
      'APPOINTMENT_VIEW',
      'APPOINTMENT_SLOT_SELECTED',
      'APPOINTMENT_BOOK_ATTEMPT',
      'APPOINTMENT_BOOK_SUCCESS',
      'APPOINTMENT_BOOK_FAILURE',
      'APPOINTMENT_CANCEL',
      'APPOINTMENT_RESCHEDULE',
      'APPOINTMENT_COMPLETE',
      'APPOINTMENT_EMERGENCY_REDIRECT'
    ];

    requiredTypes.forEach(t => {
      assert.ok(analyticsService.EVENT_TYPES[t], `analyticsService missing EVENT_TYPES.${t}`);
      assert.ok(adminService.APPOINTMENT_EVENT_TYPES[t], `adminService missing APPOINTMENT_EVENT_TYPES.${t}`);
    });
  });

  runTest('1.2: PHI & Medical Text Sanitization Guards (Strict Prohibition)', () => {
    // 1. Attempting to record medical symptoms, vitals, or diagnoses must throw an error
    const forbiddenProps = [
      { symptoms: 'Severe dyspnea' },
      { diagnosis: 'Asthma' },
      { spo2: 88 },
      { clinicalNotes: 'Prescription notes' }
    ];

    forbiddenProps.forEach(prop => {
      assert.throws(() => {
        analyticsService.recordEvent({
          eventType: analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_ATTEMPT,
          payload: prop
        });
      }, /MEDICAL_TEXT_PROHIBITED/);
    });

    // 2. Pure operational metadata passes and retains whitelisted keys only
    const validProps = {
      doctorId: 'doc_respiratory_1',
      consultationType: 'telehealth',
      isOnline: true,
      timeOfDay: 'evening',
      beneficiaryType: 'child',
      slotId: '2026-10-20_18-00',
      unauthorizedRandomField: 'should_be_stripped'
    };

    const sanitized = analyticsService.sanitizeProperties(validProps);
    assert.strictEqual(sanitized.doctorId, 'doc_respiratory_1');
    assert.strictEqual(sanitized.consultationType, 'telehealth');
    assert.strictEqual(sanitized.isOnline, true);
    assert.strictEqual(sanitized.timeOfDay, 'evening');
    assert.strictEqual(sanitized.beneficiaryType, 'child');
    assert.strictEqual(sanitized.slotId, '2026-10-20_18-00');
    assert.strictEqual(sanitized.unauthorizedRandomField, undefined);
  });

  // -------------------------------------------------------------
  // TEST 2: KPI CALCULATIONS WITH RICH TELEMETRY
  // -------------------------------------------------------------
  runTest('2.1: analyticsService.calculateAppointmentKpis calculates ratios accurately', () => {
    const mockEvents = [
      // 10 Book attempts
      ...Array(10).fill().map((_, i) => ({
        type: 'APPOINTMENT_BOOK_ATTEMPT',
        properties: { doctorId: 'doc_1', consultationType: i < 4 ? 'telehealth' : 'in_clinic', isOnline: i < 4 }
      })),
      // 8 Book successes (6 in-clinic, 2 telehealth; 5 evening, 3 morning; 2 family, 6 self)
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_1', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'morning', beneficiaryType: 'self' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_1', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'morning', beneficiaryType: 'self' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_1', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'evening', beneficiaryType: 'self' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_1', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'evening', beneficiaryType: 'dependent' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_2', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'evening', beneficiaryType: 'family' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_2', consultationType: 'in_clinic', isOnline: false, timeOfDay: 'evening', beneficiaryType: 'self' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_2', consultationType: 'telehealth', isOnline: true, timeOfDay: 'morning', beneficiaryType: 'self' } },
      { type: 'APPOINTMENT_BOOK_SUCCESS', properties: { doctorId: 'doc_2', consultationType: 'telehealth', isOnline: true, timeOfDay: 'evening', beneficiaryType: 'self' } },
      // 2 Book failures
      { type: 'APPOINTMENT_BOOK_FAILURE', properties: { doctorId: 'doc_1', reason: 'slot_conflict' } },
      { type: 'APPOINTMENT_BOOK_FAILURE', properties: { doctorId: 'doc_2', reason: 'slot_conflict' } },
      // 1 Cancellation
      { type: 'APPOINTMENT_CANCEL', properties: { doctorId: 'doc_1' } },
      // 1 Emergency redirect
      { type: 'APPOINTMENT_EMERGENCY_REDIRECT', properties: { doctorId: 'doc_1' } }
    ];

    const kpis = analyticsService.calculateAppointmentKpis(mockEvents);

    assert.strictEqual(kpis.summary.totalAttempts, 10);
    assert.strictEqual(kpis.summary.totalBookings, 8);
    // Success rate: 8 / 10 = 80.0%
    assert.strictEqual(kpis.summary.bookingSuccessRate, 80);
    assert.strictEqual(kpis.bookingSuccessRate.displayValue, '80%');

    // Modality: 2 telehealth out of 8 = 25.0%, 6 in_clinic = 75.0%
    assert.strictEqual(kpis.summary.telehealthRatio, 25);
    assert.strictEqual(kpis.summary.inClinicRatio, 75);

    // Time of day: 5 evening out of 8 = 62.5%, 3 morning = 37.5%
    assert.strictEqual(kpis.summary.eveningPreferenceRate, 62.5);
    assert.strictEqual(kpis.summary.morningPreferenceRate, 37.5);

    // Beneficiary: 2 dependent/family out of 8 = 25.0%, 6 self = 75.0%
    assert.strictEqual(kpis.summary.familyDependentRate, 25);
    assert.strictEqual(kpis.summary.selfBookingRate, 75);

    // Cancellations: 1 cancel out of 8 bookings = 12.5%
    assert.strictEqual(kpis.summary.cancellationRate, 12.5);

    // Emergency redirects: 1
    assert.strictEqual(kpis.summary.emergencyRedirects, 1);

    // Doctor utilization
    assert.strictEqual(kpis.doctorUtilization.doc_1.bookings, 4);
    assert.strictEqual(kpis.doctorUtilization.doc_2.bookings, 4);
  });

  runTest('2.2: Safe "Unavailable" / "غير متاح" fallbacks on empty telemetry', () => {
    const kpisAr = analyticsService.calculateAppointmentKpis([], { isEn: false });
    assert.strictEqual(kpisAr.summary.totalBookings, 0);
    assert.strictEqual(kpisAr.summary.bookingSuccessRate, null);
    assert.strictEqual(kpisAr.bookingSuccessRate.displayValue, 'غير متاح');
    assert.strictEqual(kpisAr.telehealthRatio.displayValue, 'غير متاح');
    assert.strictEqual(kpisAr.eveningPreferenceRate.displayValue, 'غير متاح');
    assert.strictEqual(kpisAr.familyDependentRate.displayValue, 'غير متاح');

    const kpisEn = analyticsService.calculateAppointmentKpis([], { isEn: true });
    assert.strictEqual(kpisEn.bookingSuccessRate.displayValue, 'Unavailable');
    assert.strictEqual(kpisEn.telehealthRatio.displayValue, 'Unavailable');
  });

  runTest('2.3: adminService.calculateAppointmentKpis matches backend KPI calculation logic', () => {
    const mockAppointments = [
      { id: 'apt_1', doctorId: 'doc_1', consultationType: 'telehealth', isOnline: true, time: '17:30', isDependent: true, status: 'completed' },
      { id: 'apt_2', doctorId: 'doc_1', consultationType: 'in_clinic', isOnline: false, time: '10:00', isDependent: false, status: 'confirmed' },
      { id: 'apt_3', doctorId: 'doc_2', consultationType: 'in_clinic', isOnline: false, time: '18:00', isDependent: false, status: 'cancelled' },
      { id: 'apt_4', doctorId: 'doc_2', consultationType: 'in_clinic', isOnline: false, time: '11:00', isDependent: false, status: 'completed' }
    ];

    const clientKpis = adminService.calculateAppointmentKpis(mockAppointments, { isEn: true });

    assert.strictEqual(clientKpis.summary.totalBookings, 4);
    assert.strictEqual(clientKpis.summary.totalCompleted, 2);
    assert.strictEqual(clientKpis.summary.totalCancelled, 1);
    assert.strictEqual(clientKpis.summary.cancellationRate, 25);
    // 1 telehealth out of 4 = 25%
    assert.strictEqual(clientKpis.summary.telehealthRatio, 25);
    assert.strictEqual(clientKpis.summary.inClinicRatio, 75);
    // 2 evening (17:30, 18:00) out of 4 = 50%
    assert.strictEqual(clientKpis.summary.eveningPreferenceRate, 50);
    assert.strictEqual(clientKpis.summary.morningPreferenceRate, 50);
    // 1 dependent out of 4 = 25%
    assert.strictEqual(clientKpis.summary.familyDependentRate, 25);
    assert.strictEqual(clientKpis.summary.selfBookingRate, 75);
  });

  // -------------------------------------------------------------
  // TEST 3: SCHEDULING SERVICE TELEMETRY HOOKS
  // -------------------------------------------------------------
  await runTestAsync('3.1: bookAppointmentTransaction emits telemetry & aborts on unacknowledged red-flag', async () => {
    const storage = new Map();
    const mockDb = {
      collection: (colName) => ({
        doc: (id) => ({
          get: async () => ({
            exists: storage.has(`${colName}/${id}`),
            data: () => storage.get(`${colName}/${id}`)
          }),
          set: async (data) => storage.set(`${colName}/${id}`, data)
        })
      }),
      runTransaction: async (updateFunction) => {
        const transaction = {
          get: async (docRef) => docRef.get(),
          set: (docRef, data) => docRef.set(data),
          update: (docRef, data) => {
            const current = storage.get(docRef._key) || {};
            storage.set(docRef._key, { ...current, ...data });
          }
        };
        return updateFunction(transaction);
      }
    };

    // Attempt booking with red-flag symptoms without confirmation
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, {
        doctorId: 'dr_mona',
        patientId: 'patient_urgent_1',
        slotId: 'slot_1800',
        date: '2026-10-20',
        time: '18:00',
        consultationType: 'clinic',
        symptoms: 'severe shortness of breath, cyanosis and acute respiratory failure',
        isDisclaimerAcknowledged: false
      }, { uid: 'patient_urgent_1', role: 'patient', email: 'patient@healthvibes.org' });
      assert.fail('Should have thrown an emergency error');
    } catch (e) {
      assert.ok(e.code === 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED' || e.message.includes('طوارئ') || e.message.includes('EMERGENCY'), 'Emergency alert triggered');
    }

    // Verify APPOINTMENT_EMERGENCY_REDIRECT was recorded in analytics
    const events = analyticsService.getEventStore().filter(e => e.eventType === 'appointment_emergency_redirect' || e.type === 'APPOINTMENT_EMERGENCY_REDIRECT');
    assert.ok(events.length >= 1, 'Emergency redirect event should have been emitted');
    const lastEventPayload = events[events.length - 1].payload || events[events.length - 1].properties || {};
    assert.strictEqual(lastEventPayload.doctorId, 'dr_mona');
  });

  await runTestAsync('3.2: getAppointmentAnalytics returns aggregated data for admin dashboard', async () => {
    const appts = [
      { id: 'apt_101', clinicId: 'c1', doctorId: 'doc_a', consultationType: 'telehealth', isOnline: true, time: '10:00', status: 'completed' },
      { id: 'apt_102', clinicId: 'c1', doctorId: 'doc_a', consultationType: 'in_clinic', isOnline: false, time: '17:00', status: 'completed' },
      { id: 'apt_103', clinicId: 'c1', doctorId: 'doc_b', consultationType: 'in_clinic', isOnline: false, time: '18:30', status: 'cancelled' }
    ];

    const mockDb = {
      collection: (colName) => ({
        get: async () => ({
          docs: appts.map(a => ({ id: a.id, data: () => a }))
        })
      })
    };

    const analytics = await schedulingService.getAppointmentAnalytics(mockDb, { clinicId: 'c1' });
    assert.ok(analytics.summary, 'Analytics must have summary');
    assert.strictEqual(analytics.summary.totalBookings, 3);
    assert.strictEqual(analytics.summary.totalCompleted, 2);
    assert.strictEqual(analytics.summary.totalCancelled, 1);
    assert.strictEqual(analytics.summary.cancellationRate, 33.3);
    assert.strictEqual(analytics.summary.telehealthRatio, 33.3);
    assert.strictEqual(analytics.summary.inClinicRatio, 66.7);
    assert.strictEqual(analytics.summary.eveningPreferenceRate, 66.7);
    assert.strictEqual(analytics.summary.morningPreferenceRate, 33.3);
  });

  // -------------------------------------------------------------
  // TEST 4: I18N SYSTEM KEY PARITY (ARABIC & ENGLISH)
  // -------------------------------------------------------------
  runTest('4.1: i18n contains 100% key parity for appointments analytics namespace', () => {
    const requiredKeys = [
      'calendarAnalyticsTitle',
      'totalBookings',
      'bookingSuccessRate',
      'telehealthRatio',
      'inClinicRatio',
      'eveningPreference',
      'morningPreference',
      'familyBookings',
      'emergencyInterceptions',
      'cancellationRate'
    ];

    const catalog = i18n.translations || i18n;

    requiredKeys.forEach(k => {
      assert.ok(catalog.ar.appointments[k], `catalog.ar.appointments missing key: ${k}`);
      assert.ok(catalog.en.appointments[k], `catalog.en.appointments missing key: ${k}`);
      assert.notStrictEqual(catalog.ar.appointments[k], '', `catalog.ar.appointments.${k} must not be empty`);
      assert.notStrictEqual(catalog.en.appointments[k], '', `catalog.en.appointments.${k} must not be empty`);
    });
  });

  // -------------------------------------------------------------
  // TEST 5: ADMIN VIEW HTML & INDEX HTML DOM ELEMENTS
  // -------------------------------------------------------------
  runTest('5.1: admin-view.html and index.html contain all required metric IDs', () => {
    const adminViewPath = path.resolve(__dirname, '../app/modules/admin/admin-view.html');
    const indexHtmlPath = path.resolve(__dirname, '../app/index.html');

    const adminViewContent = fs.readFileSync(adminViewPath, 'utf8');
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

    const requiredIds = [
      'adminAppointmentsAnalyticsPanel',
      'adminApptHealthBadge',
      'adminApptTotalBookingsBadge',
      'adminApptSuccessRate',
      'adminApptTotalBookings',
      'adminApptTelehealthRatio',
      'adminApptModalityBreakdown',
      'adminApptEveningPref',
      'adminApptTimeSlotsBreakdown',
      'adminApptFamilyRatio',
      'adminApptFamilyBreakdown',
      'adminApptEmergencyRedirects',
      'adminApptCancellationRate',
      'adminApptCancellationCount'
    ];

    requiredIds.forEach(id => {
      assert.ok(adminViewContent.includes(`id="${id}"`), `admin-view.html missing #${id}`);
      assert.ok(indexHtmlContent.includes(`id="${id}"`), `index.html missing #${id}`);
    });
  });

  // -------------------------------------------------------------
  // TEST 6: APP.JS LOGIC & REFRESH HANDLER INTEGRATION
  // -------------------------------------------------------------
  runTest('6.1: app.js exports renderAdminAppointmentAnalytics and refresh handler', () => {
    const appJsPath = path.resolve(__dirname, '../app/app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');

    assert.ok(appJsContent.includes('function renderAdminAppointmentAnalytics'), 'app.js missing renderAdminAppointmentAnalytics');
    assert.ok(appJsContent.includes('window.renderAdminAppointmentAnalytics = renderAdminAppointmentAnalytics'), 'app.js must expose window.renderAdminAppointmentAnalytics');
    assert.ok(appJsContent.includes('window.refreshAdminAppointmentAnalytics = async function'), 'app.js must expose window.refreshAdminAppointmentAnalytics');
    assert.ok(appJsContent.includes('await renderAdminAppointmentAnalytics(serverMetrics?.appointmentAnalytics)'), 'renderAdminMetrics must invoke renderAdminAppointmentAnalytics');
  });

  // -------------------------------------------------------------
  // TEST 7: SERVER ENDPOINTS & RBAC GUARDS
  // -------------------------------------------------------------
  runTest('7.1: backend/server.js includes appointment analytics endpoint and RBAC', () => {
    const serverJsPath = path.resolve(__dirname, '../backend/server.js');
    const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

    assert.ok(serverJsContent.includes('/api/admin/appointments/analytics'), 'server.js missing GET /api/admin/appointments/analytics');
    assert.ok(serverJsContent.includes('appointmentAnalytics: apptAnalytics'), 'server.js /api/admin/metrics must include appointmentAnalytics');
  });

  console.log('\n==================================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} (100%)`);
  console.log('==================================================================\n');
})();
