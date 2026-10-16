/**
 * tests/appointment_dossier_analytics_and_logging.test.js
 *
 * Verification suite for:
 * - Pre-visit medical dossier attachment telemetry & logging
 * - Pre-visit doctor dossier review telemetry & engagement tracking
 * - KPI calculations: dossierAttachmentRate, previsitDoctorReviewRate, bookingSuccessRate
 * - Aggregated analytics in schedulingService.getAppointmentAnalytics
 * - Zero PHI leakage in telemetry payloads (HIPAA / GDPR / Saudi PDPL compliance)
 * - Access control & route security for GET /api/appointments/analytics
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsService = require('../backend/analytics-service');
const schedulingService = require('../backend/scheduling-service');

// Robust in-memory Firestore Mock supporting document & transaction semantics
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
            id: docId,
            get: async function () {
              const data = store.get(fullKey);
              return {
                id: docId,
                exists: Boolean(data),
                data: () => (data ? { ...data } : undefined)
              };
            },
            set: async function (data, opts = {}) {
              const existing = opts && opts.merge ? (store.get(fullKey) || {}) : {};
              const merged = { ...existing, ...data };
              store.set(fullKey, merged);
              return merged;
            },
            update: async function (data) {
              const existing = store.get(fullKey) || {};
              const updated = { ...existing };
              for (const [k, v] of Object.entries(data)) {
                if (k.includes('.')) {
                  const parts = k.split('.');
                  let target = updated;
                  for (let i = 0; i < parts.length - 1; i++) {
                    target[parts[i]] = target[parts[i]] || {};
                    target = target[parts[i]];
                  }
                  target[parts[parts.length - 1]] = v;
                } else {
                  updated[k] = v;
                }
              }
              store.set(fullKey, updated);
              return updated;
            }
          };
        },
        add: async function (data) {
          const id = data.id || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const fullKey = `${colName}/${id}`;
          store.set(fullKey, { ...data, id });
          return { id };
        },
        where: function (field, op, val) {
          return {
            where: function () { return this; },
            get: async function () {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (field && val !== undefined) {
                    if (v[field] === val) {
                      docs.push({ id: k.replace(`${colName}/`, ''), data: () => ({ ...v }) });
                    }
                  } else {
                    docs.push({ id: k.replace(`${colName}/`, ''), data: () => ({ ...v }) });
                  }
                }
              }
              return { docs, forEach: fn => docs.forEach(fn), empty: docs.length === 0, size: docs.length };
            }
          };
        },
        get: async function () {
          const docs = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(`${colName}/`)) {
              docs.push({ id: k.replace(`${colName}/`, ''), data: () => ({ ...v }) });
            }
          }
          return { docs, forEach: fn => docs.forEach(fn), empty: docs.length === 0, size: docs.length };
        }
      };
    },
    runTransaction: async function (updateFn) {
      const transaction = {
        get: async function (ref) { return await ref.get(); },
        set: function (ref, data, opts = {}) {
          const existing = (opts && opts.merge) ? (store.get(ref._key) || {}) : {};
          store.set(ref._key, { ...existing, ...data });
        },
        update: function (ref, data) {
          const existing = store.get(ref._key) || {};
          const updated = { ...existing };
          for (const [k, v] of Object.entries(data)) {
            if (k.includes('.')) {
              const parts = k.split('.');
              let target = updated;
              for (let i = 0; i < parts.length - 1; i++) {
                target[parts[i]] = target[parts[i]] || {};
                target = target[parts[i]];
              }
              target[parts[parts.length - 1]] = v;
            } else {
              updated[k] = v;
            }
          }
          store.set(ref._key, updated);
        }
      };
      return await updateFn(transaction);
    }
  };

  return db;
}

test('Appointment Dossier Analytics & Logging Suite', async (t) => {
  // Reset in-memory analytics state before testing
  analyticsService.resetAnalyticsState();

  await t.test('1. EVENT_TYPES includes dossier-specific event constants', () => {
    assert.equal(typeof analyticsService.EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT, 'string');
    assert.equal(typeof analyticsService.EVENT_TYPES.PREVISIT_DOSSIER_ACCESSED, 'string');
    assert.equal(typeof analyticsService.EVENT_TYPES.DOSSIER_LINKAGE_FAILED, 'string');
  });

  await t.test('2. Zero PHI Leakage: Telemetry metadata does not violate FORBIDDEN_MEDICAL_KEYS', () => {
    // Valid event without clinical details
    const validEvent = {
      eventType: analyticsService.EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT,
      userId: 'patient-401',
      clinicId: 'clinic-central',
      payload: {
        appointmentId: 'appt-100',
        doctorId: 'dr-pulm-01',
        hasAttachedReport: true,
        hasAttachedDossier: true,
        isDependent: false
      }
    };
    assert.doesNotThrow(() => {
      analyticsService.recordEvent(validEvent);
    });

    // Event with forbidden clinical details (diagnosis, symptoms, vitals)
    const invalidEvent = {
      eventType: analyticsService.EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT,
      userId: 'patient-401',
      clinicId: 'clinic-central',
      payload: {
        appointmentId: 'appt-100',
        diagnosis: 'Acute Bronchitis', // FORBIDDEN!
        symptoms: ['Cough', 'Wheezing'] // FORBIDDEN!
      }
    };
    assert.throws(() => {
      analyticsService.recordEvent(invalidEvent);
    }, /MEDICAL_TEXT_PROHIBITED/i);
  });

  await t.test('3. bookAppointmentTransaction records DOSSIER_ATTACHED_TO_APPOINTMENT and flags book success', async () => {
    const mockDb = createMockFirestore();
    analyticsService.resetAnalyticsState();

    const patientUser = { uid: 'user_tarek', email: 'tarek@example.com', role: 'patient', emailVerified: true };

    // Seed certified case
    await mockDb.collection('cases').doc('case_telemetry_01').set({
      id: 'case_telemetry_01',
      patientId: 'user_tarek',
      oxygenLevel: 97,
      diagnosis: 'حساسية صدرية خفيفة',
      status: 'approved',
      clinicalNotes: 'فحص سريري يظهر وظائف رئة مستقرة.'
    });

    const bookingPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      linkedCaseId: 'case_telemetry_01'
    };

    const saved = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);
    assert.ok(saved.id);
    assert.equal(saved.hasAttachedReport, true);
    assert.equal(saved.linkedCaseId, 'case_telemetry_01');

    // Verify events in telemetry
    const events = analyticsService.getInMemoryEvents();
    const bookSuccess = events.find(e => e.eventType === analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS);
    assert.ok(bookSuccess, 'APPOINTMENT_BOOK_SUCCESS must be recorded');
    assert.equal(bookSuccess.payload.hasAttachedReport, true);
    assert.equal(bookSuccess.payload.hasAttachedDossier, true);

    const dossierAttached = events.find(e => e.eventType === analyticsService.EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT);
    assert.ok(dossierAttached, 'DOSSIER_ATTACHED_TO_APPOINTMENT must be recorded');
    assert.equal(dossierAttached.payload.appointmentId, saved.id);
    assert.equal(dossierAttached.payload.doctorId, 'dr_mona');
  });

  await t.test('4. getAppointmentPrevisitDossier records PREVISIT_DOSSIER_ACCESSED with doctor role flag', async () => {
    const mockDb = createMockFirestore();
    analyticsService.resetAnalyticsState();

    // Seed appointment with attached report
    const apptId = 'appt_previsit_telemetry';
    await mockDb.collection('appointments').doc(apptId).set({
      id: apptId,
      patientId: 'user_tarek',
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      status: 'confirmed',
      hasAttachedReport: true,
      linkedCaseId: 'case_previsit_01'
    });

    await mockDb.collection('cases').doc('case_previsit_01').set({
      id: 'case_previsit_01',
      patientId: 'user_tarek',
      oxygenLevel: 96,
      diagnosis: 'استقرار تنفسي تام',
      status: 'approved'
    });

    const doctorUser = { uid: 'dr_mona', role: 'doctor' };
    const dossier = await schedulingService.getAppointmentPrevisitDossier(mockDb, apptId, doctorUser);
    assert.ok(dossier.success);

    const events = analyticsService.getInMemoryEvents();
    const accessEvent = events.find(e => e.eventType === analyticsService.EVENT_TYPES.PREVISIT_DOSSIER_ACCESSED);
    assert.ok(accessEvent, 'PREVISIT_DOSSIER_ACCESSED must be recorded');
    assert.equal(accessEvent.payload.appointmentId, apptId);
    assert.equal(accessEvent.payload.doctorId, 'dr_mona');
    assert.equal(accessEvent.payload.isDoctorReview, true);
  });

  await t.test('5. linkAppointmentCaseDossier records DOSSIER_ATTACHED_TO_APPOINTMENT for post-booking attachment', async () => {
    const mockDb = createMockFirestore();
    analyticsService.resetAnalyticsState();

    const apptId = 'appt_postlink_telemetry';
    await mockDb.collection('appointments').doc(apptId).set({
      id: apptId,
      patientId: 'patient_postlink',
      doctorId: 'dr_mona',
      hasAttachedReport: false
    });

    await mockDb.collection('cases').doc('case_resp_postlink').set({
      id: 'case_resp_postlink',
      patientId: 'patient_postlink',
      oxygenLevel: 98,
      status: 'approved'
    });

    const patientUser = { uid: 'patient_postlink', role: 'patient' };
    await schedulingService.linkAppointmentCaseDossier(mockDb, {
      appointmentId: apptId,
      caseId: 'case_resp_postlink'
    }, patientUser);

    const events = analyticsService.getInMemoryEvents();
    const linkEvent = events.find(e => e.eventType === analyticsService.EVENT_TYPES.DOSSIER_ATTACHED_TO_APPOINTMENT);
    assert.ok(linkEvent, 'DOSSIER_ATTACHED_TO_APPOINTMENT must be recorded on manual link');
    assert.equal(linkEvent.payload.isPostBookingLinkage, true);
  });

  await t.test('6. calculateAppointmentKpis correctly computes dossierAttachmentRate & previsitDoctorReviewRate', () => {
    // Generate synthetic telemetry events
    const testEvents = [
      // 10 successful bookings
      ...Array.from({ length: 6 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS,
        timestamp: new Date().toISOString(),
        payload: { hasAttachedReport: true, hasAttachedDossier: true }
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS,
        timestamp: new Date().toISOString(),
        payload: { hasAttachedReport: false }
      })),
      // 3 doctor pre-visit reviews
      ...Array.from({ length: 3 }, (_, i) => ({
        eventType: analyticsService.EVENT_TYPES.PREVISIT_DOSSIER_ACCESSED,
        timestamp: new Date().toISOString(),
        payload: { isDoctorReview: true }
      })),
      // 1 non-doctor access (e.g. nurse/receptionist)
      {
        eventType: analyticsService.EVENT_TYPES.PREVISIT_DOSSIER_ACCESSED,
        timestamp: new Date().toISOString(),
        payload: { isDoctorReview: false }
      }
    ];

    const kpis = analyticsService.calculateAppointmentKpis(testEvents);

    assert.ok(kpis.kpis.dossierAttachmentRate);
    assert.ok(kpis.kpis.previsitDoctorReviewRate);

    // 6 out of 10 bookings had attached dossier => 60.0%
    assert.equal(kpis.kpis.dossierAttachmentRate.rate, 60.0);
    assert.equal(kpis.kpis.dossierAttachmentRate.numeratorValue, 6);
    assert.equal(kpis.kpis.dossierAttachmentRate.denominatorValue, 10);
    assert.equal(kpis.summary.dossierAttachmentRate, 60.0);
    assert.equal(kpis.summary.totalWithDossier, 6);

    // 3 doctor reviews out of 6 appointments with dossier => 50.0%
    assert.equal(kpis.kpis.previsitDoctorReviewRate.rate, 50.0);
    assert.equal(kpis.kpis.previsitDoctorReviewRate.numeratorValue, 3);
    assert.equal(kpis.kpis.previsitDoctorReviewRate.denominatorValue, 6);
    assert.equal(kpis.summary.previsitDoctorReviewRate, 50.0);
    assert.equal(kpis.summary.doctorPrevisitReviews, 3);
  });

  await t.test('7. schedulingService.getAppointmentAnalytics aggregates database records with dossier rates', async () => {
    const mockDb = createMockFirestore();

    // Seed 4 appointments: 2 with attached reports, 2 without
    await mockDb.collection('appointments').doc('app-1').set({
      id: 'app-1',
      date: '2026-10-20',
      slotId: 'slot_1000',
      status: 'confirmed',
      hasAttachedReport: true
    });
    await mockDb.collection('appointments').doc('app-2').set({
      id: 'app-2',
      date: '2026-10-21',
      slotId: 'slot_1000',
      status: 'confirmed',
      linkedCaseId: 'case-123'
    });
    await mockDb.collection('appointments').doc('app-3').set({
      id: 'app-3',
      date: '2026-10-22',
      slotId: 'slot_1000',
      status: 'confirmed',
      hasAttachedReport: false
    });
    await mockDb.collection('appointments').doc('app-4').set({
      id: 'app-4',
      date: '2026-10-23',
      slotId: 'slot_1000',
      status: 'cancelled'
    });

    const analytics = await schedulingService.getAppointmentAnalytics(mockDb, {}, { role: 'clinic_admin' });
    assert.ok(analytics.summary);
    assert.equal(analytics.summary.totalBookings, 4);
    assert.equal(analytics.summary.totalWithDossier, 2);
    // 2 / 4 * 100 = 50.0%
    assert.equal(analytics.summary.dossierAttachmentRate, 50.0);
  });

  await t.test('8. Route contract: GET /api/appointments/analytics in backend/server.js with RBAC', () => {
    const fs = require('fs');
    const path = require('path');
    const serverCode = fs.readFileSync(path.join(__dirname, '../backend/server.js'), 'utf8');

    assert.ok(
      serverCode.includes("app.get('/api/appointments/analytics'"),
      'GET /api/appointments/analytics route must be registered in server.js'
    );
    assert.ok(
      serverCode.includes('requireAuth'),
      'Endpoint must require authenticated session'
    );
    assert.ok(
      serverCode.includes('ROLES.SUPER_ADMIN') && serverCode.includes('ROLES.CLINIC_ADMIN') && serverCode.includes('ROLES.DOCTOR'),
      'Endpoint must enforce RBAC for super_admin, clinic_admin, and doctor'
    );
  });
});
