/**
 * Health Vibe AI - CliniDo Consultation Type Analytics & Logging Suite
 *
 * Verifies:
 * 1. EVENT_TYPES includes consultation type and commute relief telemetry constants.
 * 2. Zero PHI Leakage: Telemetry metadata does not violate FORBIDDEN_MEDICAL_KEYS.
 * 3. bookingAppointmentTransaction records commuteReliefActive and consultationType in book success events.
 * 4. rescheduleAppointmentTransaction records APPOINTMENT_RESCHEDULE and CONSULTATION_MODE_SWITCHED.
 * 5. calculateAppointmentKpis computes commuteReliefRate, estimatedTrafficHoursSaved, and consultationTypeBreakdown.
 * 6. schedulingService.getAppointmentAnalytics aggregates database records with commute relief metrics.
 * 7. AdminService.calculateAppointmentKpis generates display-ready localized figures.
 * 8. HTML contract: Admin analytics cards and badges exist in admin-view.html and index.html.
 * 9. 100% i18n parity for admin analytics keys across Arabic and English catalogs.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const analyticsService = require('../backend/analytics-service');
const schedulingService = require('../backend/scheduling-service');
const AdminService = require('../app/modules/admin/admin-service');

console.log('==================================================================');
console.log('📊 CLINIDO CONSULTATION TYPE: ANALYTICS & LOGGING SUITE');
console.log('   Egypt Commute Relief, Modality Breakdown & Admin Telemetry');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

function createMockFirestore() {
  const store = new Map();

  const db = {
    _store: store,
    collection: function (colName) {
      return {
        doc: function (docId) {
          const fullKey = `${colName}/${docId}`;
          return {
            _key: fullKey,
            get: async function () {
              const data = store.get(fullKey);
              return { exists: Boolean(data), data: () => data, id: docId };
            },
            set: async function (data, options = {}) {
              const existing = options && options.merge ? (store.get(fullKey) || {}) : {};
              const merged = { ...existing, ...data };
              store.set(fullKey, merged);
              return merged;
            },
            update: async function (data) {
              const existing = store.get(fullKey) || {};
              for (const [k, v] of Object.entries(data)) {
                if (k.includes('.')) {
                  const parts = k.split('.');
                  let curr = existing;
                  for (let i = 0; i < parts.length - 1; i++) {
                    curr[parts[i]] = curr[parts[i]] || {};
                    curr = curr[parts[i]];
                  }
                  curr[parts[parts.length - 1]] = v;
                } else {
                  existing[k] = v;
                }
              }
              store.set(fullKey, existing);
              return existing;
            }
          };
        },
        get: async function () {
          const docs = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(`${colName}/`)) {
              docs.push({ id: k.replace(`${colName}/`, ''), data: () => v });
            }
          }
          return { docs, size: docs.length };
        }
      };
    },
    runTransaction: async function (updateFn) {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, options) => docRef.set(data, options),
        update: (docRef, data) => docRef.update(data)
      };
      return await updateFn(transaction);
    }
  };

  return db;
}

(async function () {
  console.log('--- 1. Telemetry Event Constants & Whitelist ---');

  runTest('should include consultation type and commute relief event constants in EVENT_TYPES', () => {
    assert.strictEqual(analyticsService.EVENT_TYPES.CONSULTATION_TYPE_SELECTED, 'consultation_type_selected');
    assert.strictEqual(analyticsService.EVENT_TYPES.COMMUTE_RELIEF_VIEWED, 'commute_relief_viewed');
    assert.strictEqual(analyticsService.EVENT_TYPES.CONSULTATION_MODE_SWITCHED, 'consultation_mode_switched');

    assert.strictEqual(AdminService.APPOINTMENT_EVENT_TYPES.CONSULTATION_TYPE_SELECTED, 'consultation_type_selected');
    assert.strictEqual(AdminService.APPOINTMENT_EVENT_TYPES.COMMUTE_RELIEF_VIEWED, 'commute_relief_viewed');
    assert.strictEqual(AdminService.APPOINTMENT_EVENT_TYPES.CONSULTATION_MODE_SWITCHED, 'consultation_mode_switched');
  });

  console.log('\n--- 2. Zero PHI Leakage in Telemetry Payloads ---');

  runTest('should redact medical notes, diagnosis and symptoms while preserving consultation metadata', () => {
    const dirtyPayload = {
      appointmentId: 'appt_clean_01',
      doctorId: 'dr_mona',
      consultationType: 'video',
      previousConsultationType: 'clinic',
      modeSwitched: true,
      commuteReliefActive: true,
      branch: 'dokki_central',
      source: 'web_portal',
      // Forbidden medical fields:
      symptoms: 'ضيق تنفس شديد',
      spo2: 88,
      diagnosis: 'Severe Asthma Exacerbation',
      prescription: 'Ventolin 100mcg'
    };

    assert.throws(() => {
      analyticsService.sanitizeAndValidatePayload(
        analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS,
        dirtyPayload
      );
    }, /MEDICAL_TEXT_PROHIBITED/);

    // Clean payload should be accepted with allowed keys
    const cleanPayload = {
      appointmentId: 'appt_clean_01',
      doctorId: 'dr_mona',
      consultationType: 'video',
      previousConsultationType: 'clinic',
      modeSwitched: true,
      commuteReliefActive: true,
      branch: 'dokki_central',
      source: 'web_portal'
    };

    const res = analyticsService.sanitizeAndValidatePayload(
      analyticsService.EVENT_TYPES.CONSULTATION_MODE_SWITCHED,
      cleanPayload
    );

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.cleanPayload.consultationType, 'video');
    assert.strictEqual(res.cleanPayload.commuteReliefActive, true);
    assert.strictEqual(res.cleanPayload.modeSwitched, true);
    assert.strictEqual(res.cleanPayload.branch, 'dokki_central');
  });

  console.log('\n--- 3. Event Recording on Booking & Rescheduling ---');

  await runAsyncTest('should record commuteReliefActive in APPOINTMENT_BOOK_SUCCESS event', async () => {
    analyticsService.resetAnalyticsState();
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_telemetry_v', email: 'telemetry@example.com', role: 'patient' };

    await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    const events = analyticsService.getInMemoryEvents();
    const bookSuccess = events.find(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS);
    assert.ok(bookSuccess, 'APPOINTMENT_BOOK_SUCCESS recorded');
    assert.strictEqual(bookSuccess.payload.consultationType, 'video');
    assert.strictEqual(bookSuccess.payload.commuteReliefActive, true);
  });

  await runAsyncTest('should record APPOINTMENT_RESCHEDULE and CONSULTATION_MODE_SWITCHED when switching mode', async () => {
    analyticsService.resetAnalyticsState();
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_telemetry_resched', email: 'resched@example.com', role: 'patient' };

    // Initial clinic booking
    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-27',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    // Reschedule to video to avoid traffic
    await schedulingService.rescheduleAppointmentTransaction(mockDb, {
      appointmentId: appt.id,
      newDate: '2026-10-28',
      newSlotId: 'slot_1100',
      consultationType: 'video',
      reason: 'Switch to video to avoid Cairo rush hour'
    }, patientUser);

    const events = analyticsService.getInMemoryEvents();
    const reschedEvt = events.find(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_RESCHEDULE);
    assert.ok(reschedEvt, 'APPOINTMENT_RESCHEDULE recorded');
    assert.strictEqual(reschedEvt.payload.consultationType, 'video');
    assert.strictEqual(reschedEvt.payload.previousConsultationType, 'clinic');
    assert.strictEqual(reschedEvt.payload.modeSwitched, true);
    assert.strictEqual(reschedEvt.payload.commuteReliefActive, true);

    const switchEvt = events.find(e => e.eventType === analyticsService.EVENT_TYPES.CONSULTATION_MODE_SWITCHED);
    assert.ok(switchEvt, 'CONSULTATION_MODE_SWITCHED recorded');
    assert.strictEqual(switchEvt.payload.previousConsultationType, 'clinic');
    assert.strictEqual(switchEvt.payload.consultationType, 'video');
    assert.strictEqual(switchEvt.payload.commuteReliefActive, true);
  });

  console.log('\n--- 4. calculateAppointmentKpis Computation ---');

  runTest('should compute commuteReliefRate, estimatedTrafficHoursSaved and modality breakdown', () => {
    const mockEvents = [
      // 3 Video consultations
      { eventType: 'appointment_book_success', payload: { consultationType: 'video', isOnline: true, commuteReliefActive: true } },
      { eventType: 'appointment_book_success', payload: { consultationType: 'video', isOnline: true, commuteReliefActive: true } },
      { eventType: 'appointment_book_success', payload: { consultationType: 'video', isOnline: true, commuteReliefActive: true } },
      // 1 Followup consultation
      { eventType: 'appointment_book_success', payload: { consultationType: 'followup', isOnline: true, commuteReliefActive: true } },
      // 1 Clinic consultation
      { eventType: 'appointment_book_success', payload: { consultationType: 'clinic', isOnline: false, commuteReliefActive: false } }
    ];

    const kpis = analyticsService.calculateAppointmentKpis(mockEvents);

    assert.strictEqual(kpis.totalBookings, 5);
    assert.strictEqual(kpis.breakdown.videoCount, 3);
    assert.strictEqual(kpis.breakdown.followupCount, 1);
    assert.strictEqual(kpis.breakdown.inClinicCount, 1);
    assert.strictEqual(kpis.breakdown.commuteReliefCount, 4);

    // 4 / 5 * 100 = 80.0%
    assert.strictEqual(kpis.commuteReliefRate.rate, 80.0);
    assert.strictEqual(kpis.commuteReliefRate.display, '80%');

    // 4 visits * 1.5 hrs = 6.0 hrs saved
    assert.strictEqual(kpis.estimatedTrafficHoursSaved, 6.0);

    // Modality breakdown
    const b = kpis.consultationTypeBreakdown;
    assert.strictEqual(b.video.count, 3);
    assert.strictEqual(b.video.ratio, 60.0);
    assert.strictEqual(b.followup.count, 1);
    assert.strictEqual(b.followup.ratio, 20.0);
    assert.strictEqual(b.clinic.count, 1);
    assert.strictEqual(b.clinic.ratio, 20.0);
  });

  runTest('should handle empty telemetry events with graceful Unavailable display', () => {
    const kpis = analyticsService.calculateAppointmentKpis([]);
    assert.strictEqual(kpis.totalBookings, 0);
    assert.strictEqual(kpis.commuteReliefRate.rate, null);
    assert.strictEqual(kpis.commuteReliefRate.display, 'Unavailable');
    assert.strictEqual(kpis.commuteReliefRate.displayAr, 'غير متاح');
    assert.strictEqual(kpis.estimatedTrafficHoursSaved, 0);
  });

  console.log('\n--- 5. Database Persisted Analytics (schedulingService.getAppointmentAnalytics) ---');

  await runAsyncTest('should aggregate persisted appointments into commute relief metrics and breakdown', async () => {
    const mockDb = createMockFirestore();

    // Seed 4 appointments in Firestore
    await mockDb.collection('appointments').doc('appt_db_01').set({
      id: 'appt_db_01',
      status: 'confirmed',
      consultationType: 'video',
      commuteReliefActive: true,
      clinicId: 'clinic_cairo_main'
    });
    await mockDb.collection('appointments').doc('appt_db_02').set({
      id: 'appt_db_02',
      status: 'completed',
      consultationType: 'video',
      commuteReliefActive: true,
      clinicId: 'clinic_cairo_main'
    });
    await mockDb.collection('appointments').doc('appt_db_03').set({
      id: 'appt_db_03',
      status: 'confirmed',
      consultationType: 'followup',
      commuteReliefActive: true,
      clinicId: 'clinic_cairo_main'
    });
    await mockDb.collection('appointments').doc('appt_db_04').set({
      id: 'appt_db_04',
      status: 'confirmed',
      consultationType: 'clinic',
      commuteReliefActive: false,
      clinicId: 'clinic_cairo_main'
    });

    const analytics = await schedulingService.getAppointmentAnalytics(mockDb, { clinicId: 'clinic_cairo_main' });

    assert.strictEqual(analytics.success, true);
    assert.strictEqual(analytics.summary.totalBookings, 4);
    assert.strictEqual(analytics.summary.commuteReliefCount, 3);
    assert.strictEqual(analytics.summary.commuteReliefRate, 75.0); // 3 / 4 * 100 = 75%
    assert.strictEqual(analytics.summary.estimatedTrafficHoursSaved, 4.5); // 3 * 1.5 = 4.5 hrs

    assert.strictEqual(analytics.summary.consultationTypeBreakdown.video, 2);
    assert.strictEqual(analytics.summary.consultationTypeBreakdown.followup, 1);
    assert.strictEqual(analytics.summary.consultationTypeBreakdown.clinic, 1);
    assert.strictEqual(analytics.summary.consultationTypeBreakdown.commuteRelief, 3);

    assert.strictEqual(analytics.dbSummary.video, 2);
    assert.strictEqual(analytics.dbSummary.followup, 1);
    assert.strictEqual(analytics.dbSummary.commuteRelief, 3);
  });

  console.log('\n--- 6. Client AdminService KPI Parity ---');

  runTest('should compute localized display properties in AdminService.calculateAppointmentKpis', () => {
    const rawAppts = [
      { id: 'a1', status: 'confirmed', consultationType: 'video', commuteReliefActive: true },
      { id: 'a2', status: 'confirmed', consultationType: 'video', commuteReliefActive: true },
      { id: 'a3', status: 'confirmed', consultationType: 'clinic', commuteReliefActive: false }
    ];

    const resEn = AdminService.calculateAppointmentKpis(rawAppts, { isEn: true });
    assert.strictEqual(resEn.commuteReliefCount, 2);
    assert.strictEqual(resEn.commuteReliefRate, 66.7);
    assert.strictEqual(resEn.commuteReliefRateDisplay, '66.7%');
    assert.strictEqual(resEn.estimatedTrafficHoursSaved, 3.0);
    assert.strictEqual(resEn.estimatedTrafficHoursSavedDisplay, '3 hrs traffic saved');

    const resAr = AdminService.calculateAppointmentKpis(rawAppts, { isEn: false });
    assert.strictEqual(resAr.commuteReliefRateDisplayAr, '66.7%');
    assert.strictEqual(resAr.estimatedTrafficHoursSavedDisplay, '3 ساعة زحام موفرة');
  });

  console.log('\n--- 7. Admin Dashboard HTML Contract ---');

  runTest('should include commute relief KPI card and consultation breakdown in admin-view.html and index.html', () => {
    const adminHtml = fs.readFileSync(path.join(__dirname, '../app/modules/admin/admin-view.html'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

    for (const [name, content] of [['admin-view.html', adminHtml], ['index.html', indexHtml]]) {
      assert.ok(content.includes('adminApptCommuteReliefRate'), `${name} must include adminApptCommuteReliefRate`);
      assert.ok(content.includes('adminApptCommuteHoursSaved'), `${name} must include adminApptCommuteHoursSaved`);
      assert.ok(content.includes('adminApptConsultationBreakdown'), `${name} must include adminApptConsultationBreakdown`);
      assert.ok(content.includes('appointments.commuteReliefAdoptionRate'), `${name} must include i18n attribute for commuteReliefAdoptionRate`);
    }
  });

  console.log('\n--- 8. Bilingual i18n Catalog Parity ---');

  runTest('should include translation keys for commute relief analytics in Arabic and English catalogs', () => {
    const i18nPath = path.join(__dirname, '../app/i18n.js');
    const i18nContent = fs.readFileSync(i18nPath, 'utf8');

    const requiredKeys = [
      'commuteReliefAdoptionRate',
      'commuteHoursSavedTitle',
      'consultationTypeBreakdownTitle',
      'commuteHoursSavedLabel'
    ];

    for (const k of requiredKeys) {
      assert.ok(i18nContent.includes(`${k}:`), `app/i18n.js must include key: ${k}`);
    }
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
