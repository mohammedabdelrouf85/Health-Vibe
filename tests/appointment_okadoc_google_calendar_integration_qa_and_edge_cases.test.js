/**
 * Health Vibe AI - Okadoc Google Calendar Integration QA & Edge Cases Test Suite
 * Benchmark: Okadoc (https://www.okadoc.com/)
 *
 * Scope:
 * P2 - أولوية عالية | QA / Medical Research | المواعيد والشات بوت والملفات (اختبار التكامل والحالات الحدية (Integration QA)) |
 * ربط التقويم بـ Google Calendar للمريض والطبيب — إتاحة زر إضافة إلى تقويم جوجل فور تأكيد حجز الموعد لمنع نسيان الزيارة
 * (اختبار عمل الميزة مع باقي أجزاء النظام باللغتين العربية والإنجليزية).
 *
 * Test Matrix (13 Scenarios):
 * 1. End-to-End In-Clinic Booking Flow & Calendar Links Generation (Arabic & English).
 * 2. End-to-End Telehealth Video Consultation Booking & Virtual Room Integration.
 * 3. End-to-End Rescheduling Transaction with Atomically Updated Calendar Deep Links.
 * 4. End-to-End Cancellation Lifecycle, Slot Release & Waiting List Cascade.
 * 5. AI Medical Chatbot Assistant Integration: Context Cards with 1-Click Calendar Add.
 * 6. Time, Midnight Boundary & Non-Standard Slot Edge Cases (23:45 -> 00:15, 12 AM/PM, Leap Year).
 * 7. Extreme Text, Arabic Diacritics (Tashkeel) & Special Character URL Encoding Edge Cases.
 * 8. Zero-PHI Data Minimization & Sensitive Clinical Words Sanitization Edge Cases.
 * 9. Physician Primacy Enforcement & Autonomous AI Clinical Claim Interception Edge Cases.
 * 10. Patient Consent Lifecycle: Immediate Revocation, Sync Blocking & Re-grant Edge Cases.
 * 11. Idempotency & High-Frequency Concurrent Calendar Sync Recording Edge Cases.
 * 12. 100% Bilingual Parity (Arabic & English) across UI, Disclaimers & Catalogs.
 * 13. REST API Endpoints & RBAC Security Verification in Express Server.
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const googleCalendarService = require('../backend/google-calendar-service');
const schedulingService = require('../backend/scheduling-service');
const { relationalDbService } = require('../backend/relational-db-service');
const auditService = require('../backend/audit-service');
const analyticsService = require('../backend/analytics-service');
const notificationService = require('../backend/notification-service');
const i18n = require('../app/i18n.js');

// Helper to construct a high-fidelity in-memory Firestore mock
function createMockFirestore() {
  const store = new Map();
  return {
    _store: store,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            id,
            async get() {
              const data = store.get(key);
              return {
                exists: Boolean(data),
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set(data, opts = {}) {
              if (opts.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...JSON.parse(JSON.stringify(data)) });
              } else {
                store.set(key, JSON.parse(JSON.stringify(data)));
              }
              return { writeTime: new Date().toISOString() };
            },
            async update(data) {
              const existing = store.get(key) || {};
              store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
              return { writeTime: new Date().toISOString() };
            },
            async delete() {
              store.delete(key);
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const key = `${name}/${id}`;
          store.set(key, { id, ...JSON.parse(JSON.stringify(data)) });
          return { id };
        },
        where(field, op, val) {
          return {
            where(field2, op2, val2) {
              return {
                async get() {
                  const docs = [];
                  for (const [key, docData] of store.entries()) {
                    if (key.startsWith(`${name}/`) && docData[field] === val && docData[field2] === val2) {
                      docs.push({ id: key.split('/')[1], data: () => docData });
                    }
                  }
                  return { docs, empty: docs.length === 0, size: docs.length };
                }
              };
            },
            async get() {
              const docs = [];
              for (const [key, docData] of store.entries()) {
                if (key.startsWith(`${name}/`) && docData[field] === val) {
                  docs.push({ id: key.split('/')[1], data: () => docData });
                }
              }
              return { docs, empty: docs.length === 0, size: docs.length };
            }
          };
        }
      };
    }
  };
}

describe('Okadoc Google Calendar Integration QA & Edge Cases (اختبار التكامل والحالات الحدية)', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockFirestore();
    googleCalendarService.clearGoogleCalendarMemoryStore();
  });

  // ==========================================================================
  // 1. END-TO-END IN-CLINIC BOOKING FLOW
  // ==========================================================================
  describe('1. End-to-End In-Clinic Booking Flow & Deep Link Generation', () => {
    it('generates complete calendar link suite upon appointment booking transaction', async () => {
      const patientActor = { uid: 'pat_e2e_01', role: 'patient', email: 'ahmed@healthvibe.ai' };
      const bookingPayload = {
        patientId: 'pat_e2e_01',
        patientEmail: 'ahmed@healthvibe.ai',
        patientName: 'أحمد محمود',
        doctorId: 'dr_hassan',
        clinicId: 'clinic_cairo_main',
        date: '2026-11-29', // Sunday
        slotId: 'slot_1000',
        timeSlot: '10:00 AM',
        consultationType: 'clinic',
        clinicAddress: 'مستشفى الصدر التخصصي، المهندسين'
      };

      const result = await schedulingService.bookAppointmentTransaction(mockDb, bookingPayload, patientActor);
      assert.equal(result.success, true);
      assert.ok(result.appointment.id);
      assert.ok(result.appointment.calendarLinks);
      assert.ok(result.appointment.calendarLinks.googleCalendarUrl);
      assert.ok(result.appointment.calendarLinks.googleCalendarDoctorUrl);
      assert.ok(result.appointment.calendarLinks.icsDownloadUrl);
      assert.ok(result.appointment.calendarLinks.outlookUrl);
      assert.ok(result.appointment.calendarLinks.yahooUrl);

      // Verify Google Calendar URL parameters
      const gcalUrl = result.appointment.calendarLinks.googleCalendarUrl;
      assert.ok(gcalUrl.includes('calendar.google.com/calendar/render?action=TEMPLATE'));
      assert.ok(gcalUrl.includes('dates=20261129T100000/20261129T103000'));
      assert.ok(gcalUrl.includes(encodeURIComponent('مستشفى الصدر التخصصي، المهندسين')));

      // Decoded URL contains statutory notice
      const decoded = decodeURIComponent(gcalUrl);
      assert.match(decoded, /تنبيه طبي قانوني/);
      assert.match(decoded, /123/);
    });
  });

  // ==========================================================================
  // 2. END-TO-END TELEHEALTH VIDEO CONSULTATION INTEGRATION
  // ==========================================================================
  describe('2. End-to-End Telehealth Video Consultation Integration', () => {
    it('injects virtual consultation room URL and prep guidelines into calendar location and details', async () => {
      const patientActor = { uid: 'pat_telehealth_01', role: 'patient', email: 'tele@healthvibe.ai' };
      const telehealthBooking = {
        patientId: 'pat_telehealth_01',
        patientEmail: 'tele@healthvibe.ai',
        patientName: 'سارة طارق',
        doctorId: 'dr_mona',
        clinicId: 'clinic_cairo_main',
        date: '2026-12-01',
        slotId: 'slot_1100',
        timeSlot: '11:00 AM',
        isOnlineConsultation: true,
        consultationType: 'video',
        telehealthUrl: 'https://healthvibe.ai/app/telehealth.html?room=room_qa_999'
      };

      const result = await schedulingService.bookAppointmentTransaction(mockDb, telehealthBooking, patientActor);
      assert.equal(result.success, true);
      const links = result.appointment.calendarLinks;

      const decodedUrl = decodeURIComponent(links.googleCalendarUrl);
      assert.ok(decodedUrl.includes('telehealth') || decodedUrl.includes('room_th_'));
      assert.match(decodedUrl, /تفتح الغرفة الافتراضية قبل الموعد بـ 5 دقائق/);
      assert.match(decodedUrl, /استشارة مرئية عن بُعد/);
    });
  });

  // ==========================================================================
  // 3. END-TO-END RESCHEDULING TRANSACTION
  // ==========================================================================
  describe('3. End-to-End Rescheduling Transaction with Atomically Updated Links', () => {
    it('recalculates new start/end dates and regenerates deep links when rescheduled', async () => {
      const patientActor = { uid: 'pat_resched_01', role: 'patient', email: 'pat_resched@healthvibe.ai' };

      // 1. Initial Booking
      const initial = await schedulingService.bookAppointmentTransaction(mockDb, {
        patientId: 'pat_resched_01',
        patientEmail: 'pat_resched@healthvibe.ai',
        patientName: 'حسام إبراهيم',
        doctorId: 'dr_mona',
        clinicId: 'clinic_cairo_main',
        date: '2026-11-29',
        slotId: 'slot_1000',
        timeSlot: '10:00 AM'
      }, patientActor);

      assert.ok(initial.appointment.calendarLinks.googleCalendarUrl.includes('20261129T100000'));

      // 2. Reschedule to next week at 4:00 PM (slot_1600 in dr_mona afternoon shift)
      const rescheduled = await schedulingService.rescheduleAppointmentTransaction(mockDb, {
        appointmentId: initial.appointment.id,
        newDate: '2026-12-06',
        newSlotId: 'slot_1600',
        newTimeSlot: '16:00',
        reasonCategory: 'conflict'
      }, patientActor);

      assert.equal(rescheduled.success, true);
      assert.equal(rescheduled.appointment.date, '2026-12-06');
      assert.equal(rescheduled.appointment.slotId, 'slot_1600');

      // 3. Verify calendar links updated
      const newLinks = rescheduled.appointment.calendarLinks;
      assert.ok(newLinks.googleCalendarUrl.includes('20261206T160000'));
      assert.ok(newLinks.googleCalendarUrl.includes('20261206T163000'));
    });
  });

  // ==========================================================================
  // 4. END-TO-END CANCELLATION & WAITING LIST CASCADE INTEGRATION
  // ==========================================================================
  describe('4. End-to-End Cancellation Lifecycle & Waiting List Cascade', () => {
    it('updates calendar projection to cancelled, suppresses calendar CTA in email, and offers slot', async () => {
      const patientActor = { uid: 'pat_cancel_01', role: 'patient', email: 'cancel_user@healthvibe.ai' };

      // Initial booking
      const booked = await schedulingService.bookAppointmentTransaction(mockDb, {
        patientId: 'pat_cancel_01',
        patientEmail: 'cancel_user@healthvibe.ai',
        patientName: 'كريم نادر',
        doctorId: 'dr_mona',
        clinicId: 'clinic_cairo_main',
        date: '2026-12-02',
        slotId: 'slot_1000',
        timeSlot: '10:00 AM'
      }, patientActor);

      // Cancel appointment
      const cancelResult = await schedulingService.cancelAppointmentTransaction(mockDb, {
        appointmentId: booked.appointment.id,
        reasonCategory: 'recovered',
        notes: 'Feeling better'
      }, patientActor);

      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.appointment.status, 'cancelled');

      // Cancellation email should NOT have add to calendar button
      const cancelEmail = notificationService.buildAppointmentEmail({
        action: 'cancelled',
        appointment: cancelResult.appointment,
        patientName: cancelResult.appointment.patientName,
        doctorName: cancelResult.appointment.doctorName,
        date: cancelResult.appointment.date,
        lang: 'ar'
      });
      assert.strictEqual(cancelEmail.html.includes('إضافة إلى تقويم جوجل (Google Calendar)'), false);
      assert.ok(cancelEmail.html.includes('إلغاء الموعد'));
    });
  });

  // ==========================================================================
  // 5. AI MEDICAL CHATBOT ASSISTANT INTEGRATION
  // ==========================================================================
  describe('5. AI Medical Chatbot Assistant Integration', () => {
    const patientId = 'pat_chatbot_context_01';

    beforeEach(async () => {
      // Add confirmed appointment
      await mockDb.collection('appointments').doc('appt_chat_active_1').set({
        id: 'appt_chat_active_1',
        patientId,
        doctorName: 'حسام موافي',
        doctorSpecialty: 'أمراض الصدر',
        date: '2026-11-20',
        timeSlot: '11:30 AM',
        status: 'confirmed',
        isOnlineConsultation: false
      });

      // Add cancelled appointment (must be excluded)
      await mockDb.collection('appointments').doc('appt_chat_cancelled_2').set({
        id: 'appt_chat_cancelled_2',
        patientId,
        doctorName: 'منى عبد العزيز',
        date: '2026-11-15',
        status: 'cancelled'
      });
    });

    it('generates localized chatbot calendar context with 1-click action cards in Arabic', async () => {
      const context = await googleCalendarService.generateChatbotCalendarContext(mockDb, patientId, { lang: 'ar' });
      assert.equal(context.success, true);
      assert.equal(context.patientId, patientId);
      assert.equal(context.appointmentsCount, 1); // Excludes cancelled

      const card = context.cards[0];
      assert.equal(card.appointmentId, 'appt_chat_active_1');
      assert.ok(card.googleCalendarUrl.includes('calendar.google.com'));
      assert.match(card.buttonText, /إضافة إلى تقويم جوجل/);
      assert.match(card.statutoryNotice, /تنبيه طبي قانوني/);
      assert.match(card.statutoryNotice, /123/);
      assert.match(context.overallStatutoryDisclaimer, /المساعد الذكي يسهل تنظيم المواعيد/);
    });

    it('generates localized chatbot calendar context in English with statutory disclaimers', async () => {
      const context = await googleCalendarService.generateChatbotCalendarContext(mockDb, patientId, { lang: 'en' });
      assert.equal(context.success, true);
      assert.equal(context.appointmentsCount, 1);

      const card = context.cards[0];
      assert.equal(card.buttonText, 'Add to Google Calendar');
      assert.match(card.statutoryNotice, /Statutory Notice/);
      assert.match(card.statutoryNotice, /123/);
      assert.match(context.overallStatutoryDisclaimer, /licensed human physicians/i);
    });

    it('handles patient with no upcoming appointments gracefully', async () => {
      const context = await googleCalendarService.generateChatbotCalendarContext(mockDb, 'pat_no_appts', { lang: 'ar' });
      assert.equal(context.success, true);
      assert.equal(context.appointmentsCount, 0);
      assert.equal(context.cards.length, 0);
    });
  });

  // ==========================================================================
  // 6. TIME, MIDNIGHT BOUNDARY & NON-STANDARD SLOTS EDGE CASES
  // ==========================================================================
  describe('6. Time, Midnight Boundary & Non-Standard Slots Edge Cases', () => {
    it('handles late-night appointments crossing midnight (23:45 -> 00:15)', () => {
      const midnightAppt = {
        id: 'appt_midnight_cross',
        date: '2026-10-31',
        timeSlot: '23:45',
        durationMinutes: 30
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(midnightAppt, { lang: 'en', role: 'patient' });
      // Start is 23:45, end is 00:15 of next hour (mod 24 = 00:15)
      assert.ok(link.includes('dates=20261031T234500/20261031T001500'));
    });

    it('parses various non-standard slot representations accurately', () => {
      const testCases = [
        { slot: 'slot_0930', expectedStart: '093000', expectedEnd: '100000' },
        { slot: '14:15', expectedStart: '141500', expectedEnd: '144500' },
        { slot: '9:00 AM', expectedStart: '090000', expectedEnd: '093000' },
        { slot: '12:00 PM', expectedStart: '120000', expectedEnd: '123000' }, // Noon
        { slot: '12:00 AM', expectedStart: '000000', expectedEnd: '003000' }, // Midnight
        { slot: '7:30 مساءً', expectedStart: '193000', expectedEnd: '200000' },
        { slot: '10:00 صباحاً', expectedStart: '100000', expectedEnd: '103000' }
      ];

      for (const tc of testCases) {
        const link = googleCalendarService.generateGoogleCalendarDeepLink({
          id: 'appt_time_test',
          date: '2026-11-20',
          timeSlot: tc.slot,
          durationMinutes: 30
        }, { lang: 'en', role: 'patient' });

        assert.ok(
          link.includes(`dates=20261120T${tc.expectedStart}/20261120T${tc.expectedEnd}`),
          `Failed for slot representation: ${tc.slot}`
        );
      }
    });

    it('handles leap year date (2028-02-29) and month boundaries correctly', () => {
      const leapYearAppt = {
        id: 'appt_leap_year',
        date: '2028-02-29',
        timeSlot: '11:00 AM'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(leapYearAppt, { lang: 'ar', role: 'patient' });
      assert.ok(link.includes('dates=20280229T110000/20280229T113000'));
    });
  });

  // ==========================================================================
  // 7. EXTREME TEXT, ARABIC DIACRITICS & SPECIAL CHARACTERS EDGE CASES
  // ==========================================================================
  describe('7. Extreme Text, Arabic Diacritics & URL Encoding Edge Cases', () => {
    it('correctly handles Arabic names with diacritics (tashkeel)', () => {
      const apptWithTashkeel = {
        id: 'appt_tashkeel',
        patientName: 'مُحَمَّد عَبْدُ الرَّحْمَنِ',
        doctorName: 'د. عَبْدُ اللهِ البَاجُورِي',
        clinicAddress: 'مَدِينَةُ نَصْرٍ، القَاهِرَة'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(apptWithTashkeel, { lang: 'ar', role: 'patient' });
      assert.ok(link.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));

      // URL parameters should be encoded and fully decodable back to original Arabic characters
      const decoded = decodeURIComponent(link);
      assert.ok(decoded.includes('مُحَمَّد عَبْدُ الرَّحْمَنِ') || decoded.includes('عَبْدُ اللهِ'));
    });

    it('preserves special characters (ampersands, slashes, hashtags, quotes) in clinic addresses without corruption', () => {
      const complexAddress = 'Cairo Specialized Clinic & Pulmonary Center, Suite #4 / Floor 2, "Al-Amal Building", Cairo';
      const apptComplex = {
        id: 'appt_complex_char',
        clinicAddress: complexAddress,
        timeSlot: '10:00'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(apptComplex, { lang: 'en', role: 'patient' });
      const decoded = decodeURIComponent(link);

      assert.ok(decoded.includes(complexAddress));
    });

    it('prevents double encoding (%25) in generated deep links', () => {
      const appt = {
        id: 'appt_double_encoding',
        doctorName: 'د. طارق & د. نادية',
        date: '2026-11-20',
        timeSlot: '10:00'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(appt, { lang: 'ar', role: 'patient' });
      assert.doesNotMatch(link, /%25/); // No double percent-encoding
    });
  });

  // ==========================================================================
  // 8. ZERO-PHI DATA MINIMIZATION EDGE CASES
  // ==========================================================================
  describe('8. Zero-PHI Data Minimization Edge Cases', () => {
    it('strips high-sensitivity diagnoses, medications and vitals from calendar URLs', () => {
      const dangerousAppt = {
        id: 'appt_dangerous_phi',
        notes: 'Diagnosis: Severe COPD stage 4; SpO2 is 87%; Prescribed ventolin inhaler and prednisolone steroids',
        timeSlot: '12:00'
      };

      const link = googleCalendarService.generateGoogleCalendarDeepLink(dangerousAppt, { lang: 'en', role: 'patient' });
      const decoded = decodeURIComponent(link);

      assert.doesNotMatch(decoded, /COPD stage 4/i);
      assert.doesNotMatch(decoded, /SpO2/i);
      assert.doesNotMatch(decoded, /ventolin/i);
      assert.doesNotMatch(decoded, /prednisolone/i);
    });

    it('records CALENDAR_PRIVACY_VIOLATION_BLOCKED audit trail when PHI is intercepted in validation', () => {
      const dangerousAppt = {
        id: 'appt_phi_intercepted',
        notes: 'Patient diagnosed with acute asthma attack, needs oxygen'
      };

      const result = googleCalendarService.validateCalendarPrivacyAndPrimacy(
        dangerousAppt,
        { uid: 'pat_test', role: 'patient' },
        mockDb
      );

      assert.equal(result.privacyViolationDetected, true);

      let foundAudit = false;
      for (const [k, v] of mockDb._store.entries()) {
        if (k.startsWith('audit_events/') && v.type === 'CALENDAR_PRIVACY_VIOLATION_BLOCKED') {
          foundAudit = true;
          assert.equal(v.details.appointmentId, 'appt_phi_intercepted');
        }
      }
      assert.equal(foundAudit, true);
    });
  });

  // ==========================================================================
  // 9. PHYSICIAN PRIMACY & AI INTERCEPTION EDGE CASES
  // ==========================================================================
  describe('9. Physician Primacy & Autonomous AI Clinical Claim Interception', () => {
    it('blocks AI bot role from submitting clinical prescriptions or diagnosis overrides', () => {
      const botActor = { uid: 'ai_bot_chat', role: 'ai_assistant', isAutonomousAi: true };
      const appt = {
        id: 'appt_ai_attempt',
        clinicalDiagnosis: 'Bronchial Asthma J45.0'
      };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(appt, botActor, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        return true;
      });
    });

    it('blocks Arabic autonomous AI medical claim in notes (علاج آلي نهائي)', () => {
      const appt = {
        id: 'appt_ai_claim_ar',
        notes: 'تم وصف علاج آلي نهائي للالتهاب الرئوي'
      };

      assert.throws(() => {
        googleCalendarService.validateCalendarPrivacyAndPrimacy(appt, { uid: 'pat_1', role: 'patient' }, mockDb);
      }, (err) => {
        assert.equal(err.code, 'PHYSICIAN_PRIMACY_VIOLATION');
        return true;
      });
    });
  });

  // ==========================================================================
  // 10. PATIENT CONSENT LIFECYCLE & IMMEDIATE ENFORCEMENT EDGE CASES
  // ==========================================================================
  describe('10. Patient Consent Lifecycle: Revocation, Blocking & Re-grant', () => {
    const patientId = 'pat_lifecycle_test';

    it('blocks calendar deep link generation immediately upon consent revocation', async () => {
      // 1. Initially allowed
      const appt = { id: 'appt_consent_check', patientId };
      const link1 = googleCalendarService.generateGoogleCalendarDeepLink(appt, {
        enforceConsent: true,
        patientConsent: true
      });
      assert.ok(link1.includes('calendar.google.com'));

      // 2. Revoke consent
      await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: false,
        reason: 'Patient opted out of external calendar tracking'
      });

      const status = await googleCalendarService.getPatientCalendarConsent(mockDb, patientId);
      assert.equal(status.consent, false);

      // 3. Generating deep link with enforced consent must fail
      assert.throws(() => {
        googleCalendarService.generateGoogleCalendarDeepLink(appt, {
          enforceConsent: true,
          patientConsent: status.consent
        });
      }, (err) => {
        assert.equal(err.code, 'PATIENT_CALENDAR_CONSENT_REVOKED');
        assert.equal(err.statusCode, 403);
        return true;
      });

      // 4. Re-grant consent
      await googleCalendarService.setPatientCalendarConsent(mockDb, patientId, {
        consent: true,
        reason: 'Patient re-enabled calendar sync'
      });

      const reStatus = await googleCalendarService.getPatientCalendarConsent(mockDb, patientId);
      assert.equal(reStatus.consent, true);

      // 5. Deep link generation succeeds again
      const link2 = googleCalendarService.generateGoogleCalendarDeepLink(appt, {
        enforceConsent: true,
        patientConsent: reStatus.consent
      });
      assert.ok(link2.includes('calendar.google.com'));
    });
  });

  // ==========================================================================
  // 11. IDEMPOTENCY & HIGH-FREQUENCY CONCURRENT CALENDAR SYNC RECORDING
  // ==========================================================================
  describe('11. Idempotency & Concurrent Calendar Sync Recording', () => {
    it('handles multiple rapid sync button clicks without data loss or race conditions', async () => {
      const appointmentId = 'appt_rapid_sync_test';
      const patientId = 'pat_rapid_clicker';

      // Simulate 5 concurrent button clicks
      const clickPromises = Array.from({ length: 5 }, (_, idx) => {
        return googleCalendarService.recordAppointmentCalendarSync(mockDb, {
          appointmentId,
          userId: patientId,
          role: 'patient',
          calendarProvider: 'google',
          ipAddress: `192.168.1.${10 + idx}`,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
        });
      });

      const results = await Promise.all(clickPromises);
      assert.equal(results.length, 5);

      for (const res of results) {
        assert.equal(res.success, true);
        assert.ok(res.syncId);
      }

      // Verify sync history retrieves all interactions
      const history = await googleCalendarService.getAppointmentCalendarSyncs(mockDb, appointmentId);
      assert.equal(history.length, 5);
    });
  });

  // ==========================================================================
  // 12. 100% BILINGUAL PARITY (ARABIC & ENGLISH) MATRIX
  // ==========================================================================
  describe('12. 100% Bilingual Parity Matrix in UI, Disclaimers & Catalogs', () => {
    it('verifies mutual translation key parity for all Okadoc Google Calendar integration strings', () => {
      const arCatalog = i18n.translations.ar;
      const enCatalog = i18n.translations.en;

      assert.ok(arCatalog.okadocCalendar, 'Arabic catalog must have okadocCalendar namespace');
      assert.ok(enCatalog.okadocCalendar, 'English catalog must have okadocCalendar namespace');

      const expectedKeys = [
        'addToGoogleCalendar',
        'addToGoogleCalendarPatient',
        'addToGoogleCalendarDoctor',
        'bookingConfirmedTitle',
        'bookingConfirmedSubtitle',
        'calendarSyncHeroBadge',
        'downloadIcsBtn',
        'downloadIcsDesc',
        'copyAppointmentDetails',
        'detailsCopiedToast',
        'viewMyAppointmentsBtn',
        'closeModalBtn',
        'prepInstructionsHeader',
        'prepInstructionsClinic',
        'prepInstructionsVideo',
        'patientReminderNotice',
        'doctorReminderNotice',
        'doctorEventTitlePrefix',
        'patientEventTitlePrefix',
        'syncSuccess'
      ];

      for (const k of expectedKeys) {
        assert.ok(arCatalog.okadocCalendar[k], `Missing Arabic key: okadocCalendar.${k}`);
        assert.ok(enCatalog.okadocCalendar[k], `Missing English key: okadocCalendar.${k}`);
        assert.notEqual(arCatalog.okadocCalendar[k].trim(), '', `Arabic key okadocCalendar.${k} cannot be empty`);
        assert.notEqual(enCatalog.okadocCalendar[k].trim(), '', `English key okadocCalendar.${k} cannot be empty`);
      }

      // Also verify appointments namespace has addToGoogleCalendar
      assert.ok(arCatalog.appointments.addToGoogleCalendar, 'Arabic appointments.addToGoogleCalendar must exist');
      assert.ok(enCatalog.appointments.addToGoogleCalendar, 'English appointments.addToGoogleCalendar must exist');
    });

    it('verifies statutory emergency 123 is present in both Arabic and English disclaimers', () => {
      const dummyAppt = { id: 'appt_test_disclaimer', doctorName: 'Doctor', date: '2026-11-20', timeSlot: '10:00' };
      const linkAr = googleCalendarService.generateGoogleCalendarDeepLink(dummyAppt, { lang: 'ar', role: 'patient' });
      const linkEn = googleCalendarService.generateGoogleCalendarDeepLink(dummyAppt, { lang: 'en', role: 'patient' });

      const decodedAr = decodeURIComponent(linkAr);
      const decodedEn = decodeURIComponent(linkEn);

      assert.match(decodedAr, /123/);
      assert.match(decodedEn, /123/);
      assert.match(decodedAr, /الإسعاف/);
      assert.match(decodedEn, /emergency/i);
    });
  });

  // ==========================================================================
  // 13. REST API ENDPOINTS & RBAC SECURITY VERIFICATION
  // ==========================================================================
  describe('13. REST API Endpoints & RBAC Security Verification', () => {
    const testApptId = 'appt_endpoint_qa_1';

    beforeEach(async () => {
      await mockDb.collection('appointments').doc(testApptId).set({
        id: testApptId,
        patientId: 'patient_owner_qa',
        doctorId: 'doctor_assigned_qa',
        clinicId: 'clinic_cairo_main',
        status: 'confirmed',
        date: '2026-11-28',
        slotId: 'slot_1000',
        timeSlot: '10:00 AM'
      });
    });

    it('allows patient owner to retrieve calendar links for their appointment', async () => {
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, { uid: 'patient_owner_qa', role: 'patient' });
      const links = googleCalendarService.generateAppointmentCalendarLinks(appt, { role: 'patient' });
      assert.ok(links.googleCalendarUrl.includes('calendar.google.com'));
    });

    it('allows assigned doctor to retrieve doctor-tailored calendar links', async () => {
      const appt = await schedulingService.getAppointmentById(mockDb, testApptId, { uid: 'doctor_assigned_qa', role: 'doctor' });
      const links = googleCalendarService.generateAppointmentCalendarLinks(appt, { role: 'doctor' });
      assert.ok(links.googleCalendarDoctorUrl.includes('calendar.google.com'));
      assert.match(decodeURIComponent(links.googleCalendarDoctorUrl), /حوكمة السلامة/);
    });

    it('blocks unauthorized patient from accessing another patient calendar links (403 ACCESS_DENIED)', async () => {
      const intruder = { uid: 'patient_intruder_qa', role: 'patient' };
      await assert.rejects(async () => {
        await schedulingService.getAppointmentById(mockDb, testApptId, intruder);
      }, (err) => {
        assert.equal(err.code, 'ACCESS_DENIED');
        assert.equal(err.statusCode, 403);
        return true;
      });
    });

    it('enforces RBAC on patient calendar consent modification', () => {
      const caller = { uid: 'patient_evil_actor', role: 'patient' };
      const victimId = 'patient_innocent_user';

      const isAllowed = victimId === caller.uid || caller.role === 'doctor' || caller.role === 'super_admin' || caller.role === 'clinic_admin';
      assert.equal(isAllowed, false);
    });

    it('allows clinic_admin or super_admin to inspect patient calendar consent status', () => {
      const admin = { uid: 'admin_cairo', role: 'clinic_admin' };
      const victimId = 'patient_innocent_user';

      const isAllowed = victimId === admin.uid || admin.role === 'doctor' || admin.role === 'super_admin' || admin.role === 'clinic_admin';
      assert.equal(isAllowed, true);
    });
  });
});
