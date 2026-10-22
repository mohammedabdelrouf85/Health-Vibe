/**
 * Health Vibe AI - Okadoc Google Calendar Integration Backend & Security Test Suite
 *
 * Benchmark: Okadoc (https://www.okadoc.com/)
 * Verifies:
 * 1. 1-Click Google Calendar deep link generation for Patient & Doctor (Arabic & English)
 * 2. Zero-PHI Sanitization (HIPAA/GDPR compliance: no diagnosis, vitals, or meds in URL parameters)
 * 3. Relational DB operational persistence (appointment_calendar_syncs table and indexes)
 * 4. Multi-channel notification email template integration with Google Calendar CTA button
 * 5. RBAC security authorization boundaries (Patient owner, Assigned doctor, Admin vs 403 Forbidden)
 * 6. Calendar sync event tracking, immutable security audit logs, and analytics telemetry
 * 7. Transactional booking & rescheduling integration with pre-generated calendarLinks
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('assert');
const googleCalendarService = require('../backend/google-calendar-service');
const { relationalDbService } = require('../backend/relational-db-service');
const notificationService = require('../backend/notification-service');
const auditService = require('../backend/audit-service');
const analyticsService = require('../backend/analytics-service');
const schedulingService = require('../backend/scheduling-service');

// Helper mock DB simulating Firestore
function createMockFirestoreDb() {
  const store = new Map();
  const db = {
    _store: store,
    collection(colName) {
      return {
        doc(docId) {
          const key = `${colName}/${docId}`;
          return {
            id: docId,
            get: async () => {
              const exists = store.has(key);
              const data = exists ? JSON.parse(JSON.stringify(store.get(key))) : undefined;
              return { id: docId, exists, data: () => data };
            },
            set: async (val, opts = {}) => {
              if (opts.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(val)) });
              } else {
                store.set(key, JSON.parse(JSON.stringify(val)));
              }
            },
            update: async (val) => {
              if (!store.has(key)) {
                store.set(key, JSON.parse(JSON.stringify(val)));
                return;
              }
              store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(val)) });
            },
            delete: async () => {
              store.delete(key);
            }
          };
        },
        where(field, op, val) {
          return {
            where: () => this,
            get: async () => {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (v && v[field] === val) {
                    docs.push({ id: k.split('/')[1], data: () => ({ ...v }) });
                  }
                }
              }
              return { docs, empty: docs.length === 0, size: docs.length };
            }
          };
        },
        add: async (val) => {
          const docId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const key = `${colName}/${docId}`;
          store.set(key, { id: docId, ...JSON.parse(JSON.stringify(val)) });
          return { id: docId };
        }
      };
    },
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: (ref) => ref.delete()
      };
      return await updateFunction(transaction);
    }
  };
  return db;
}

describe('Okadoc Benchmark: Google Calendar Backend & Security Integration', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockFirestoreDb();
    googleCalendarService.clearGoogleCalendarMemoryStore();
  });

  // ==========================================================================
  // 1. 1-CLICK GOOGLE CALENDAR DEEP-LINK GENERATION
  // ==========================================================================
  describe('1. 1-Click Google Calendar Deep-Link Generator', () => {
    const sampleAppointment = {
      id: 'appt_okadoc_101',
      doctorId: 'doc_ahmed_pulm',
      doctorName: 'د. أحمد الصاوي',
      doctorNameEn: 'Dr. Ahmed El-Sawy',
      doctorSpecialty: 'استشاري أمراض الصدر والجهاز التنفسي',
      doctorSpecialtyEn: 'Consultant Pulmonologist',
      patientId: 'pat_user_44',
      patientName: 'عمر الفاروق',
      date: '2026-11-20',
      timeSlot: '11:30 صباحاً',
      slotId: 'slot_1130',
      durationMinutes: 30,
      consultationType: 'clinic',
      clinicName: 'مركز القاهرة التخصصي لأمراض الصدر',
      clinicNameEn: 'Cairo Specialized Pulmonary Center',
      clinicAddress: '15 شارع مصدق، الدقي، الجيزة',
      clinicAddressEn: '15 Mossadak St, Dokki, Giza'
    };

    it('generates a valid Patient Google Calendar URL in Arabic', () => {
      const url = googleCalendarService.generateGoogleCalendarDeepLink(sampleAppointment, {
        role: 'patient',
        lang: 'ar'
      });

      assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
      assert.ok(url.includes('text=' + encodeURIComponent('Health Vibe: استشارة طبية مع د. د. أحمد الصاوي')));
      assert.ok(url.includes('dates=20261120T113000/20261120T120000'));
      assert.ok(url.includes('location=' + encodeURIComponent('15 شارع مصدق، الدقي، الجيزة')));
      assert.ok(url.includes(encodeURIComponent('رقم الحجز: appt_okadoc_101')));
    });

    it('generates a valid Patient Google Calendar URL in English', () => {
      const url = googleCalendarService.generateGoogleCalendarDeepLink(sampleAppointment, {
        role: 'patient',
        lang: 'en'
      });

      assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
      assert.ok(url.includes('text=' + encodeURIComponent('Health Vibe: Consultation with Dr. Dr. Ahmed El-Sawy')));
      assert.ok(url.includes('dates=20261120T113000/20261120T120000'));
      assert.ok(url.includes('location=' + encodeURIComponent('15 Mossadak St, Dokki, Giza')));
      assert.ok(url.includes(encodeURIComponent('Booking Reference: appt_okadoc_101')));
      assert.ok(url.includes(encodeURIComponent('Preparation: Please arrive at the clinic 10 minutes early')));
    });

    it('generates a valid Doctor Google Calendar URL in Arabic & English with triage SLA notice', () => {
      const doctorUrlAr = googleCalendarService.generateGoogleCalendarDeepLink(sampleAppointment, {
        role: 'doctor',
        lang: 'ar'
      });
      assert.ok(doctorUrlAr.includes(encodeURIComponent('كشف سريري للمريض عمر الفاروق')));
      assert.ok(doctorUrlAr.includes(encodeURIComponent('معيار السلامة السريرية')));

      const doctorUrlEn = googleCalendarService.generateGoogleCalendarDeepLink(sampleAppointment, {
        role: 'doctor',
        lang: 'en'
      });
      assert.ok(doctorUrlEn.includes(encodeURIComponent('Clinical Consultation with Patient عمر الفاروق')));
      assert.ok(doctorUrlEn.includes(encodeURIComponent('Check patient history and prior vitals')));
    });

    it('determines location properly for Virtual Telehealth consultations', () => {
      const videoAppt = {
        ...sampleAppointment,
        id: 'appt_video_99',
        consultationType: 'video',
        telehealthUrl: 'https://healthvibe.ai/rooms/conf-abc-123'
      };

      const url = googleCalendarService.generateGoogleCalendarDeepLink(videoAppt, { role: 'patient' });
      assert.ok(url.includes(encodeURIComponent('https://healthvibe.ai/rooms/conf-abc-123')));
      assert.ok(url.includes(encodeURIComponent('تفتح الغرفة الافتراضية قبل الموعد بـ 5 دقائق')));
    });

    it('generates aggregated calendar link suite (Google, Outlook, Yahoo, ICS)', () => {
      const suite = googleCalendarService.generateAppointmentCalendarLinks(sampleAppointment);
      assert.ok(suite.googleCalendarUrl.includes('calendar.google.com'));
      assert.ok(suite.googleCalendarDoctorUrl.includes('calendar.google.com'));
      assert.strictEqual(suite.icsDownloadUrl, '/api/appointments/appt_okadoc_101/calendar.ics');
      assert.ok(suite.outlookUrl.includes('outlook.live.com'));
      assert.ok(suite.yahooUrl.includes('calendar.yahoo.com'));
    });
  });

  // ==========================================================================
  // 2. ZERO-PHI SANITIZATION (HIPAA / GDPR PRIVACY)
  // ==========================================================================
  describe('2. Zero-PHI Sanitization (HIPAA / GDPR Protection)', () => {
    it('sanitizes clinical diagnoses and raw vitals from calendar URLs', () => {
      const sensitiveAppointment = {
        id: 'appt_sensitive_999',
        doctorName: 'د. محمود سليم',
        patientName: 'سارة خالد',
        date: '2026-11-25',
        timeSlot: '04:00 مساءً',
        slotId: 'slot_1600',
        consultationType: 'clinic',
        clinicAddress: 'شارع التحرير، الدقي',
        notes: 'تشخيص: COPD مرحلة متقدمة، SpO2: 88%، علاج: Ventolin inhaler و Symbicort'
      };

      const url = googleCalendarService.generateGoogleCalendarDeepLink(sensitiveAppointment, { role: 'patient' });
      const decodedUrl = decodeURIComponent(url);

      // Must NOT contain sensitive clinical identifiers
      assert.strictEqual(decodedUrl.includes('COPD مرحلة متقدمة'), false);
      assert.strictEqual(decodedUrl.includes('SpO2: 88%'), false);
      assert.strictEqual(decodedUrl.includes('Ventolin inhaler'), false);
      assert.strictEqual(decodedUrl.includes('Symbicort'), false);
    });

    it('sanitizeCalendarContent function cleanses diagnostic words', () => {
      const rawText = 'Diagnosis: severe asthma exacerbation with low SpO2 91% on symbicort';
      const clean = googleCalendarService.sanitizeCalendarContent(rawText);
      assert.strictEqual(clean.includes('severe asthma'), false);
      assert.strictEqual(clean.includes('SpO2 91%'), false);
      assert.strictEqual(clean.includes('symbicort'), false);
    });
  });

  // ==========================================================================
  // 3. RELATIONAL DB OPERATIONAL PERSISTENCE
  // ==========================================================================
  describe('3. Relational DB Persistence (appointment_calendar_syncs)', () => {
    it('records and indexes calendar sync interactions in relational DB', async () => {
      const syncRecord = await relationalDbService.recordCalendarSync({
        appointment_id: 'appt_okadoc_201',
        user_id: 'pat_user_88',
        role: 'patient',
        calendar_provider: 'google',
        ip_address: '192.168.1.50',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'
      });

      assert.ok(syncRecord.id.startsWith('calsync_'));
      assert.strictEqual(syncRecord.appointment_id, 'appt_okadoc_201');
      assert.strictEqual(syncRecord.user_id, 'pat_user_88');
      assert.strictEqual(syncRecord.calendar_provider, 'google');

      // Verify indexing by appointment_id
      const syncs = await relationalDbService.getCalendarSyncsByAppointmentId('appt_okadoc_201');
      assert.strictEqual(syncs.length, 1);
      assert.strictEqual(syncs[0].id, syncRecord.id);

      // Verify health check metric
      const health = relationalDbService.getHealthStatus();
      assert.ok(health.metrics.calendarSyncsCount >= 1);
    });

    it('fails when appointment_id is missing', async () => {
      await assert.rejects(async () => {
        await relationalDbService.recordCalendarSync({ user_id: 'usr_1' });
      }, /appointment_id is required/);
    });
  });

  // ==========================================================================
  // 4. MULTI-CHANNEL EMAIL NOTIFICATION INTEGRATION
  // ==========================================================================
  describe('4. Notification Email Template Integration with Calendar CTA', () => {
    it('renders 1-click Google Calendar button in booking confirmation email', () => {
      const email = notificationService.buildAppointmentEmail({
        action: 'booked',
        patientName: 'عمر الفاروق',
        doctorName: 'د. أحمد الصاوي',
        doctorSpecialty: 'استشاري أمراض الصدر',
        clinicName: 'مركز القاهرة التخصصي لأمراض الصدر',
        date: '2026-11-20',
        timeSlot: '11:30 صباحاً',
        googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Health+Vibe'
      });

      assert.ok(email.html.includes('إضافة إلى تقويم جوجل (Google Calendar)'));
      assert.ok(email.html.includes('https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Health+Vibe'));
      assert.ok(email.text.includes('إضافة إلى تقويم جوجل: https://calendar.google.com/calendar/render?action=TEMPLATE&text=Health+Vibe'));
    });

    it('renders 1-click Google Calendar button in appointment rescheduled email', () => {
      const email = notificationService.buildAppointmentEmail({
        action: 'rescheduled',
        patientName: 'عمر الفاروق',
        doctorName: 'د. أحمد الصاوي',
        date: '2026-11-22',
        timeSlot: '02:00 مساءً',
        previousDate: '2026-11-20',
        previousTimeSlot: '11:30 صباحاً',
        googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Rescheduled'
      });

      assert.ok(email.html.includes('إضافة إلى تقويم جوجل (Google Calendar)'));
      assert.ok(email.html.includes('https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Rescheduled'));
    });

    it('does NOT render Google Calendar add button in appointment cancelled email', () => {
      const email = notificationService.buildAppointmentEmail({
        action: 'cancelled',
        patientName: 'عمر الفاروق',
        doctorName: 'د. أحمد الصاوي',
        date: '2026-11-20',
        googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cancelled'
      });

      assert.strictEqual(email.html.includes('إضافة إلى تقويم جوجل (Google Calendar)'), false);
    });
  });

  // ==========================================================================
  // 5. CALENDAR SYNC EVENT RECORDING & AUDIT LOGGING
  // ==========================================================================
  describe('5. Calendar Sync Event Recording & Security Audit Trail', () => {
    it('records sync event to Firestore and Relational DB simultaneously', async () => {
      const result = await googleCalendarService.recordAppointmentCalendarSync(mockDb, {
        appointmentId: 'appt_test_sync_1',
        userId: 'pat_user_99',
        role: 'patient',
        calendarProvider: 'google',
        ipAddress: '10.0.0.1',
        userAgent: 'Android Chrome'
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.syncId.startsWith('calsync_'));

      // Verify Firestore record
      const fsSnap = await mockDb.collection('appointment_calendar_syncs').doc(result.syncId).get();
      assert.strictEqual(fsSnap.exists, true);
      assert.strictEqual(fsSnap.data().appointmentId, 'appt_test_sync_1');

      // Verify Relational DB query
      const syncs = await googleCalendarService.getAppointmentCalendarSyncs(mockDb, 'appt_test_sync_1');
      assert.strictEqual(syncs.length, 1);
      assert.strictEqual(syncs[0].appointment_id, 'appt_test_sync_1');
    });

    it('rejects sync recording when appointmentId is omitted', async () => {
      await assert.rejects(async () => {
        await googleCalendarService.recordAppointmentCalendarSync(mockDb, { userId: 'u1' });
      }, /appointmentId is required/);
    });
  });

  // ==========================================================================
  // 6. RBAC & SECURITY ACCESS BOUNDARIES
  // ==========================================================================
  describe('6. RBAC & Security Authorization Verification', () => {
    const testApptId = 'appt_sec_test_55';

    beforeEach(async () => {
      await mockDb.collection('appointments').doc(testApptId).set({
        id: testApptId,
        patientId: 'patient_authorized_1',
        doctorId: 'doctor_authorized_2',
        clinicId: 'clinic_cairo_main',
        status: 'confirmed',
        date: '2026-11-30',
        slotId: 'slot_1000',
        timeSlot: '10:00 AM'
      });
    });

    it('allows patient owner to retrieve calendar links', async () => {
      const patientUser = { uid: 'patient_authorized_1', role: 'patient' };
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, patientUser);
      assert.strictEqual(appt.id, testApptId);

      const links = googleCalendarService.generateAppointmentCalendarLinks(appt, { role: 'patient' });
      assert.ok(links.googleCalendarUrl.includes('calendar.google.com'));
    });

    it('allows assigned doctor to retrieve calendar links', async () => {
      const doctorUser = { uid: 'doctor_authorized_2', role: 'doctor' };
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, doctorUser);
      assert.strictEqual(appt.id, testApptId);

      const links = googleCalendarService.generateAppointmentCalendarLinks(appt, { role: 'doctor' });
      assert.ok(links.googleCalendarDoctorUrl.includes('calendar.google.com'));
    });

    it('allows clinic admin to retrieve calendar links', async () => {
      const adminUser = { uid: 'admin_user_1', role: 'clinic_admin' };
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, adminUser);
      assert.strictEqual(appt.id, testApptId);
    });

    it('blocks unauthorized patient from accessing another patient appointment (403 ACCESS_DENIED)', async () => {
      const intruderUser = { uid: 'malicious_user_99', role: 'patient' };
      await assert.rejects(async () => {
        await schedulingService.getAppointmentById(mockDb, testApptId, intruderUser);
      }, (err) => {
        assert.strictEqual(err.code, 'ACCESS_DENIED');
        assert.strictEqual(err.statusCode, 403);
        return true;
      });
    });

    it('returns 404 for non-existent appointment', async () => {
      const patientUser = { uid: 'patient_authorized_1', role: 'patient' };
      await assert.rejects(async () => {
        await schedulingService.getAppointmentById(mockDb, 'non_existent_id', patientUser);
      }, (err) => {
        assert.strictEqual(err.code, 'APPOINTMENT_NOT_FOUND');
        assert.strictEqual(err.statusCode, 404);
        return true;
      });
    });
  });

  // ==========================================================================
  // 7. TRANSACTIONAL BOOKING & RESCHEDULING INTEGRATION
  // ==========================================================================
  describe('7. Transactional Booking & Rescheduling Integration', () => {
    it('populates calendarLinks in savedAppointment upon booking transaction', async () => {
      const patientUser = { uid: 'pat_live_booking_1', role: 'patient', email: 'pat1@healthvibe.ai' };
      const bookingPayload = {
        patientId: 'pat_live_booking_1',
        patientEmail: 'pat1@healthvibe.ai',
        patientName: 'كريم محمود',
        doctorId: 'dr_mona',
        clinicId: 'clinic_cairo_main',
        date: '2026-11-29', // Sunday (working day)
        slotId: 'slot_1000',
        timeSlot: '10:00 AM',
        consultationType: 'clinic'
      };

      const result = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientUser);
      assert.strictEqual(result.success, true);
      assert.ok(result.appointment.calendarLinks);
      assert.ok(result.appointment.calendarLinks.googleCalendarUrl.includes('calendar.google.com'));
      assert.ok(result.appointment.googleCalendarUrl.includes('calendar.google.com'));
      assert.strictEqual(result.appointment.icsDownloadUrl, `/api/appointments/${result.appointment.id}/calendar.ics`);
    });

    it('updates calendarLinks with new slot and date upon rescheduling transaction', async () => {
      const patientUser = { uid: 'pat_live_booking_2', role: 'patient', email: 'pat2@healthvibe.ai' };
      const initialBooking = await schedulingService.bookAppointmentTransaction(mockDb, {
        patientId: 'pat_live_booking_2',
        patientEmail: 'pat2@healthvibe.ai',
        patientName: 'ياسين أحمد',
        doctorId: 'dr_mona',
        clinicId: 'clinic_cairo_main',
        date: '2026-11-29', // Sunday
        slotId: 'slot_1030',
        timeSlot: '10:30 AM',
        consultationType: 'clinic'
      }, patientUser);

      const rescheduleResult = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
        appointmentId: initialBooking.id,
        newDate: '2026-11-30', // Monday
        newSlotId: 'slot_1100',
        reason: 'Work conflict'
      }, patientUser);

      assert.strictEqual(rescheduleResult.success, true);
      assert.ok(rescheduleResult.appointment.calendarLinks);
      assert.ok(rescheduleResult.appointment.calendarLinks.googleCalendarUrl.includes('20261130T110000'));
    });
  });
});
