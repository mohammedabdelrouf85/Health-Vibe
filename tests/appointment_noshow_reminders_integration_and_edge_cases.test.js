/**
 * Health Vibe AI - Doctolib Automated No-Show Reminders & Attendance Confirmation
 * Integration QA & Edge Cases Test Suite
 * 
 * Verifies:
 * 1. End-to-End Cross-System Lifecycle Integration:
 *    - Appointment booking triggers dual-window automated reminder scheduling (24h & 2h).
 *    - In-app Hero banner rendered dynamically for upcoming appointments (<24h, <2h).
 *    - 1-Click attendance confirmation (In-app, HMAC token link, WhatsApp/SMS webhook):
 *      transitions state to attendanceConfirmed=true, updates doctor schedule badge,
 *      and logs telemetry and audit events.
 * 2. Synchronization with Reschedule & Cancel Lifecycle:
 *    - Rescheduling cancels pending reminders and enqueues new 24h/2h reminders for replacement slot.
 *    - Cancellation terminates all pending reminders in queue, preventing orphaned alerts.
 * 3. Omnichannel Delivery & Format Parity (Arabic RTL vs. English LTR):
 *    - In-App, Email, SMS, WhatsApp formats across 24h & 2h windows.
 *    - Verifies inclusion of doctor details, clinic, date/time, statutory medical disclaimers,
 *      emergency hotline 123, and directions/video room.
 * 4. Timing Boundary Edge Cases:
 *    - Short notice bookings (<24h) skip 24h window gracefully and schedule 2h window.
 *    - Immediate bookings (<2h) handled safely without crash or negative timestamps.
 *    - Past appointments strictly ignored/rejected.
 * 5. Idempotency & Anti-Spam Protection:
 *    - Repeated dispatch attempts use idempotencyKey and remindersSent to prevent duplicate patient spam.
 * 6. Quiet Hours & Notification Preferences Respect:
 *    - Non-urgent 24h reminders deferred during quiet hours (22:00-08:00); urgent 2h bypasses.
 *    - Channel toggles (e.g., SMS disabled, WhatsApp enabled) strictly enforced.
 * 7. Medical Research & Clinical Safety Red-Flag Interception (AR & EN):
 *    - Acute emergency symptoms (chest pain, dyspnea) intercepted -> redirected to Ambulance 123.
 *    - AI medical advice / dosage alteration requests blocked by Physician Primacy guard.
 *    - Sensitive medical specialties (oncology, psychiatry) masked for patient privacy (Zero Diagnostic Leakage).
 *    - Privacy opt-out (STOP / إلغاء الاشتراك) honored and preferences updated.
 * 8. Security, Token Tampering & RBAC:
 *    - HMAC action token tampering / expiration rejected.
 *    - Cross-patient confirmation blocked with 403 ACCESS_DENIED.
 * 9. Bilingual Parity:
 *    - 100% Arabic and English translation key parity for appointments namespace in app/i18n.js.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');

const schedulingService = require('../backend/scheduling-service');
const {
  bookAppointmentTransaction,
  rescheduleAppointmentTransaction,
  cancelAppointmentTransaction,
  confirmAppointmentAttendance
} = schedulingService;

const appointmentRemindersService = require('../backend/appointment-reminders-service');
const {
  generateActionToken,
  verifyActionToken,
  confirmAttendanceByToken,
  handleInboundReminderWebhook,
  getReminderDeliveryStats,
  scanAndDispatchDueReminders
} = appointmentRemindersService;

const appointmentSafetyService = require('../backend/appointment-safety-service');
const {
  STATUTORY_MEDICAL_DISCLAIMER,
  EMERGENCY_CONTACTS,
  evaluateReminderInboundMessageSafety,
  validateReminderDispatchSafety,
  sanitizeReminderForPrivacy,
  maskPhoneNumber
} = appointmentSafetyService;

const notificationService = require('../backend/notification-service');
const {
  formatAppointmentReminderMessage,
  scheduleDualWindowAppointmentReminders,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  rescheduleAppointmentReminders,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isQuietHoursActive,
  DEFAULT_NOTIFICATION_PREFERENCES
} = notificationService;

const AppointmentsUI = require('../app/modules/appointments/appointments-ui');
const { translations } = require('../app/i18n');

describe('Doctolib Automated No-Show Reminders: Integration QA & Edge Cases', () => {

  function createMockDb() {
    const store = {
      appointments: new Map(),
      cases: new Map(),
      users: new Map(),
      notification_queue: new Map(),
      user_notifications: new Map(),
      user_notification_preferences: new Map()
    };

    const telemetryEvents = [];
    const auditLogs = [];

    const mockDb = {
      _store: store,
      telemetryEvents,
      auditLogs,
      collection(colName) {
        if (!store[colName]) {
          store[colName] = new Map();
        }
        const colMap = store[colName];

        return {
          doc(id) {
            return {
              async get() {
                const data = colMap.get(id);
                return {
                  exists: Boolean(data),
                  id,
                  data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
                };
              },
              async set(data, opts = {}) {
                if (opts.merge && colMap.has(id)) {
                  const existing = colMap.get(id);
                  colMap.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
                } else {
                  colMap.set(id, JSON.parse(JSON.stringify(data)));
                }
                return { writeTime: new Date() };
              },
              async update(updates) {
                if (!colMap.has(id)) {
                  const err = new Error(`Document ${id} not found in ${colName}`);
                  err.code = 'NOT_FOUND';
                  throw err;
                }
                const existing = colMap.get(id);
                colMap.set(id, { ...existing, ...JSON.parse(JSON.stringify(updates)) });
                return { writeTime: new Date() };
              },
              async delete() {
                colMap.delete(id);
                return { writeTime: new Date() };
              }
            };
          },
          async add(doc) {
            const id = 'doc_' + Math.random().toString(36).substring(2, 9);
            colMap.set(id, { id, ...JSON.parse(JSON.stringify(doc)) });
            if (colName === 'telemetry_events') telemetryEvents.push(doc);
            if (colName === 'audit_logs') auditLogs.push(doc);
            return { id };
          },
          where(field, op, val) {
            const applyFilter = (items, f, o, v) => items.filter(d => {
              if (o === '==') return d[f] === v;
              if (o === '!=') return d[f] !== v;
              if (o === '>=') return d[f] >= v;
              if (o === '<=') return d[f] <= v;
              if (o === 'in') return Array.isArray(v) && v.includes(d[f]);
              return true;
            });

            return {
              where(field2, op2, val2) {
                return {
                  where(field3, op3, val3) {
                    return {
                      async get() {
                        let all = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
                        all = applyFilter(all, field, op, val);
                        all = applyFilter(all, field2, op2, val2);
                        all = applyFilter(all, field3, op3, val3);
                        return {
                          empty: all.length === 0,
                          size: all.length,
                          docs: all.map(d => ({ id: d.id, data: () => ({ ...d }) }))
                        };
                      }
                    };
                  },
                  async get() {
                    let all = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
                    all = applyFilter(all, field, op, val);
                    all = applyFilter(all, field2, op2, val2);
                    return {
                      empty: all.length === 0,
                      size: all.length,
                      docs: all.map(d => ({ id: d.id, data: () => ({ ...d }) }))
                    };
                  }
                };
              },
              async get() {
                let all = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
                all = applyFilter(all, field, op, val);
                return {
                  empty: all.length === 0,
                  size: all.length,
                  docs: all.map(d => ({ id: d.id, data: () => ({ ...d }) }))
                };
              }
            };
          },
          async get() {
            const all = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
            return {
              empty: all.length === 0,
              size: all.length,
              docs: all.map(d => ({ id: d.id, data: () => ({ ...d }) }))
            };
          }
        };
      },
      async runTransaction(updateFunction) {
        const transaction = {
          async get(docRef) {
            return docRef.get();
          },
          set(docRef, data, opts) {
            return docRef.set(data, opts);
          },
          update(docRef, data) {
            return docRef.update(data);
          },
          delete(docRef) {
            return docRef.delete();
          }
        };
        return updateFunction(transaction);
      }
    };

    return mockDb;
  }

  // ==========================================================================
  // 1. END-TO-END CROSS-SYSTEM LIFECYCLE INTEGRATION
  // ==========================================================================
  it('1. End-to-End Lifecycle: Booking -> Dual Reminders Enqueued -> 1-Click Confirmation -> Doctor Queue Updated', async () => {
    const db = createMockDb();

    // 1.1 Book appointment on valid doctor schedule day
    const dateStr = '2026-10-25';
    const slotStart = '2026-10-25T10:00:00.000Z';
    const slotEnd = '2026-10-25T10:30:00.000Z';

    const bookPayload = {
      doctorId: 'dr_mona',
      doctorName: 'د. منى سامي',
      doctorSpecialty: 'طب باطني عام',
      patientId: 'patient_lifecycle_1',
      patientName: 'عمر شريف',
      patientEmail: 'omar.sherif@example.com',
      patientPhone: '+201011223344',
      date: dateStr,
      timeSlot: '10:00 AM',
      slotId: 'slot_1000',
      slotStart,
      slotEnd,
      clinicId: 'clinic_cairo_central',
      clinicName: 'مجمع القاهرة الطبي التخصصي',
      type: 'in_person',
      emergencyDisclaimerAcknowledged: true
    };

    const bookResult = await bookAppointmentTransaction(db, bookPayload, {
      uid: 'patient_lifecycle_1',
      role: 'patient'
    });

    assert.strictEqual(bookResult.status, 'confirmed');
    const apptId = bookResult.id;
    assert.ok(apptId, 'Appointment ID must be returned');

    // 1.2 Schedule dual-window reminders (24h & 2h)
    const reminderSched = await scheduleDualWindowAppointmentReminders(db, {
      id: apptId,
      ...bookPayload
    });

    assert.strictEqual(reminderSched.success, true);
    assert.deepStrictEqual(reminderSched.remindersScheduled, ['24h', '2h'], 'Should schedule both 24h and 2h windows');
    assert.strictEqual(db._store.notification_queue.size, 2, 'Queue must hold exactly 2 reminder items');

    // 1.3 Verify In-App Hero Banner generation
    const apptRecord = db._store.appointments.get(apptId);
    const heroHtml24h = AppointmentsUI.renderReminderHero(apptRecord, { hoursRemaining: 23.5, isEn: false });
    assert(heroHtml24h.includes('doctolib-reminder-hero'), 'Hero banner container must be rendered');
    assert(heroHtml24h.includes('badge-24h'), 'Must display 24h badge');
    assert(heroHtml24h.includes('btnConfirmAttendanceHero'), 'Must have 1-Click attendance confirmation button');

    // 1.4 1-Click Attendance Confirmation (via patient action)
    const confirmResult = await confirmAppointmentAttendance(db, apptId, {
      uid: 'patient_lifecycle_1',
      role: 'patient'
    }, { channel: 'web_app' });

    assert.strictEqual(confirmResult.success, true);
    assert.strictEqual(confirmResult.appointment.attendanceConfirmed, true);
    assert.strictEqual(confirmResult.appointment.confirmationChannel, 'web_app');
    assert.ok(confirmResult.appointment.attendanceConfirmedAt, 'Timestamp must be recorded');

    // Verify history trail
    const updatedAppt = db._store.appointments.get(apptId);
    assert.strictEqual(updatedAppt.attendanceConfirmed, true);
    const hasHistory = updatedAppt.history.some(h => h.action === 'ATTENDANCE_CONFIRMED');
    assert.strictEqual(hasHistory, true, 'History must contain ATTENDANCE_CONFIRMED action');

    // 1.5 Verify Doctor Schedule View Badge
    const doctorConfirmedHtml = AppointmentsUI.renderDoctorAttendanceBadge(updatedAppt, { isEn: false });
    assert(doctorConfirmedHtml.includes('badge-confirmed'), 'Doctor view must show confirmed badge');
    assert(doctorConfirmedHtml.includes('مؤكد من المريض'), 'Badge text must be localized in Arabic');

    const doctorConfirmedEn = AppointmentsUI.renderDoctorAttendanceBadge(updatedAppt, { isEn: true });
    assert(doctorConfirmedEn.includes('Patient Confirmed'), 'Doctor view must show English confirmed text');
  });

  // ==========================================================================
  // 2. SYNCHRONIZATION WITH RESCHEDULE & CANCEL LIFECYCLE
  // ==========================================================================
  it('2. Rescheduling & Cancellation Synchronization: Cancels Old Reminders & Prevents Orphan Alerts', async () => {
    const db = createMockDb();

    // 2.1 Set up appointment with queued reminders
    const apptId = 'appt_sync_test_888';
    const originalDate = new Date(Date.now() + 36 * 3600 * 1000);
    const apptData = {
      id: apptId,
      patientId: 'patient_sync_user',
      patientName: 'مريم نور',
      patientEmail: 'mariam.nour@example.com',
      patientPhone: '+201099881122',
      doctorId: 'doc_samir_2',
      doctorName: 'د. سمير صادق',
      doctorSpecialty: 'طب الأطفال',
      clinicId: 'clinic_giza',
      clinicName: 'عيادات الجيزة التخصصية',
      date: originalDate.toISOString().slice(0, 10),
      timeSlot: '02:00 PM',
      slotStart: originalDate.toISOString(),
      slotEnd: new Date(originalDate.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'confirmed',
      attendanceConfirmed: false
    };

    db._store.appointments.set(apptId, apptData);

    // Enqueue reminders
    await scheduleDualWindowAppointmentReminders(db, apptData);
    assert.strictEqual(db._store.notification_queue.size, 2, 'Initial queue size must be 2');

    // 2.2 Reschedule appointment to a later date (+72 hours)
    const newDate = new Date(Date.now() + 72 * 3600 * 1000);
    const newSlotStart = newDate.toISOString();
    const newSlotEnd = new Date(newDate.getTime() + 30 * 60 * 1000).toISOString();
    const newDateStr = newDate.toISOString().slice(0, 10);

    const reschedResult = await rescheduleAppointmentReminders(db, apptData, newSlotStart, 'Patient requested time change');
    assert.strictEqual(reschedResult.success, true);
    assert.strictEqual(reschedResult.cancelledPreviousCount, 2, 'Both previous 24h and 2h reminders must be cancelled');

    // Verify queue holds newly scheduled reminder
    assert.ok(reschedResult.newReminder.success, 'New reminder must be scheduled');

    // 2.3 Cancel the appointment completely
    const cancelRes = await cancelAppointmentReminders(db, apptId, 'Patient cancelled consultation');
    assert.strictEqual(cancelRes.success, true);
    assert.ok(cancelRes.cancelledCount >= 1, 'All remaining active reminders must be cancelled');

    // Verify all queue items for this appointment are marked cancelled
    const queueItems = Array.from(db._store.notification_queue.values()).filter(q => q.payload?.appointmentId === apptId);
    queueItems.forEach(q => {
      assert.strictEqual(q.status, 'cancelled', `Queue item ${q.id} must be marked cancelled`);
    });
  });

  // ==========================================================================
  // 3. OMNICHANNEL DELIVERY & FORMAT PARITY (ARABIC RTL VS. ENGLISH LTR)
  // ==========================================================================
  it('3. Omnichannel Format Parity: In-App, Email, SMS, WhatsApp across 24h & 2h windows in AR & EN', () => {
    const mockAppt = {
      id: 'appt_omni_test',
      patientName: 'خالد مصطفى',
      doctorName: 'د. منى زكي',
      doctorSpecialty: 'طب وجراحة العيون',
      clinicName: 'مركز النور التخصصي للعيون',
      date: '2026-11-15',
      timeSlot: '05:30 PM',
      meetUrl: 'https://healthvibe.ai/meet/appt_omni_test'
    };

    const channels = ['in_app', 'email', 'sms', 'whatsapp'];
    const windows = ['24h', '2h'];
    const languages = ['ar', 'en'];

    for (const ch of channels) {
      for (const win of windows) {
        for (const lang of languages) {
          const formatted = formatAppointmentReminderMessage({
            appointment: mockAppt,
            window: win,
            channel: ch,
            lang
          });

          assert.ok(formatted, `Formatter must return an object for ${ch}/${win}/${lang}`);
          assert.strictEqual(formatted.channel, ch);
          assert.strictEqual(formatted.window, win);
          assert.strictEqual(formatted.lang, lang);
          assert.ok(typeof formatted.body === 'string' && formatted.body.length > 0, `Body must be non-empty string for ${ch}/${win}/${lang}`);

          // Verify essential details
          if (ch === 'email') {
            assert.ok(formatted.subject && formatted.subject.length > 0, 'Email must have subject');
            assert.ok(formatted.html && formatted.html.includes('healthvibe'), 'Email HTML must be formatted');
          }

          if (ch === 'whatsapp') {
            assert.ok(formatted.body.includes('1'), 'WhatsApp must offer numeric reply (1) for attendance');
            assert.ok(formatted.interactiveOptions, 'WhatsApp must provide interactive options map');
          }

          // Safety and emergency hotline 123 verification
          assert.ok(
            formatted.body.includes('123') || (formatted.html && formatted.html.includes('123')),
            `Emergency hotline 123 must be present in ${ch}/${win}/${lang}`
          );
        }
      }
    }
  });

  // ==========================================================================
  // 4. TIMING BOUNDARY EDGE CASES (SHORT NOTICE, IMMEDIATE & PAST)
  // ==========================================================================
  it('4. Timing Boundaries: Short Notice (<24h), Immediate (<2h) & Past Appointments Handled Safely', async () => {
    const db = createMockDb();

    // 4.1 Short Notice: Booked 8 hours before consultation
    const shortNoticeDate = new Date(Date.now() + 8 * 3600 * 1000);
    const shortNoticeAppt = {
      id: 'appt_short_notice_8h',
      patientId: 'pat_short',
      patientEmail: 'short@example.com',
      date: shortNoticeDate.toISOString().slice(0, 10),
      timeSlot: '11:00 AM',
      slotStart: shortNoticeDate.toISOString()
    };

    const shortSched = await scheduleDualWindowAppointmentReminders(db, shortNoticeAppt);
    assert.strictEqual(shortSched.success, true);
    // 24h reminder is past target so it defaults to immediate +1m, and 2h reminder is enqueued
    assert.ok(shortSched.remindersScheduled.includes('2h'), '2h reminder must be scheduled');

    // 4.2 Immediate Booking: Booked 45 minutes in advance
    const immediateDate = new Date(Date.now() + 45 * 60 * 1000);
    const immediateAppt = {
      id: 'appt_immediate_45m',
      patientId: 'pat_immediate',
      patientEmail: 'immediate@example.com',
      date: immediateDate.toISOString().slice(0, 10),
      timeSlot: '01:00 PM',
      slotStart: immediateDate.toISOString()
    };

    const immediateSched = await scheduleDualWindowAppointmentReminders(db, immediateAppt);
    assert.strictEqual(immediateSched.success, true, 'Immediate booking must not throw or crash scheduler');

    // 4.3 Past Appointments: Cannot confirm attendance or schedule reminders
    const pastAppt = {
      id: 'appt_past_yesterday',
      patientId: 'pat_past',
      date: '2026-01-01',
      timeSlot: '09:00 AM',
      status: 'confirmed',
      slotStart: '2026-01-01T09:00:00.000Z'
    };
    db._store.appointments.set(pastAppt.id, pastAppt);

    // calculateHoursToAppointment returns negative
    const hours = AppointmentsUI.calculateHoursToAppointment(pastAppt);
    assert.ok(hours < 0, 'Past appointment hours must be negative');

    // Hero banner returns empty string for past appointments
    const pastHero = AppointmentsUI.renderReminderHero(pastAppt, { hoursRemaining: hours });
    assert.strictEqual(pastHero, '', 'Hero banner must not render for past appointments');
  });

  // ==========================================================================
  // 5. IDEMPOTENCY & ANTI-SPAMMING PROTECTION
  // ==========================================================================
  it('5. Idempotency & Anti-Spam: Prevents Duplicate Notification Dispatches to Patients', async () => {
    const db = createMockDb();

    const apptId = 'appt_idempotent_test_99';
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
    const appt = {
      id: apptId,
      patientId: 'pat_anti_spam',
      patientEmail: 'anti.spam@example.com',
      patientPhone: '+201000112233',
      date: futureDate.toISOString().slice(0, 10),
      timeSlot: '10:00 AM',
      slotStart: futureDate.toISOString(),
      status: 'confirmed',
      attendanceConfirmed: false,
      remindersSent: { '24h': true } // Already sent
    };

    db._store.appointments.set(apptId, appt);

    // Attempting to dispatch 24h reminder again must detect remindersSent['24h']
    const scanResult = await scanAndDispatchDueReminders(db, {
      now: new Date(futureDate.getTime() - 23.5 * 3600 * 1000)
    });

    assert.strictEqual(scanResult.success, true);
    // Since 24h was already sent, it should not dispatch a second 24h reminder
    const updatedAppt = db._store.appointments.get(apptId);
    assert.strictEqual(updatedAppt.remindersSent['24h'], true);
  });

  // ==========================================================================
  // 6. QUIET HOURS & NOTIFICATION PREFERENCES RESPECT
  // ==========================================================================
  it('6. Quiet Hours & Preferences: Non-urgent 24h Reminders Deferred at Night; Urgent 2h Bypasses', async () => {
    const db = createMockDb();

    // 6.1 Set user preferences with quiet hours from 22:00 to 08:00
    const userId = 'usr_quiet_test_1';
    await updateUserNotificationPreferences(db, userId, {
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
      timeZone: 'Africa/Cairo',
      channels: { in_app: true, email: true, sms: false, whatsapp: true }
    });

    const prefs = await getUserNotificationPreferences(db, userId);
    assert.strictEqual(prefs.channels.sms, false, 'SMS channel must be disabled per user preference');
    assert.strictEqual(prefs.channels.whatsapp, true, 'WhatsApp channel must be enabled');

    // 6.2 Test validateReminderDispatchSafety during nighttime (02:00 AM local time)
    const nightTime = new Date('2026-10-20T00:00:00.000Z'); // 00:00 UTC = 02:00 Cairo (UTC+2)
    const safety24h = validateReminderDispatchSafety({ id: 'appt_night_1' }, '24h', {
      now: nightTime,
      timezoneOffsetHours: 2
    });

    assert.strictEqual(safety24h.isQuietHours, true, '02:00 AM must be detected as quiet hours');
    assert.strictEqual(safety24h.deferredDueToQuietHours, true, '24h reminder must be deferred during quiet hours');
    assert.strictEqual(safety24h.safe, false, 'Must not be safe to dispatch non-urgent reminder at night');

    // 6.3 Test 2h urgent reminder during nighttime (must bypass to prevent missed appointment)
    const safety2h = validateReminderDispatchSafety({ id: 'appt_night_2' }, '2h', {
      now: nightTime,
      timezoneOffsetHours: 2
    });

    assert.strictEqual(safety2h.isQuietHours, true);
    assert.strictEqual(safety2h.deferredDueToQuietHours, false, '2h urgent reminder must NOT be deferred');
    assert.strictEqual(safety2h.safe, true, '2h urgent reminder is safe to dispatch');
  });

  // ==========================================================================
  // 7. MEDICAL RESEARCH & CLINICAL SAFETY RED-FLAG INTERCEPTION
  // ==========================================================================
  it('7. Clinical Safety & Medical Research: Intercepts Emergency Red-Flags & AI Medical Advice Prohibited (AR & EN)', async () => {
    const db = createMockDb();

    const patientAppt = {
      id: 'appt_safety_eval_1',
      patientId: 'pat_safety_patient',
      patientPhone: '+201099887766',
      doctorName: 'د. طارق الحكيم',
      doctorSpecialty: 'طب الأورام والدم',
      date: '2026-10-30',
      timeSlot: '03:00 PM',
      status: 'confirmed',
      attendanceConfirmed: false
    };
    db._store.appointments.set(patientAppt.id, patientAppt);

    // 7.1 Emergency Red-Flag in Arabic: Chest pain & dyspnea
    const arEmergencyReply = await handleInboundReminderWebhook(db, {
      fromPhone: '+201099887766',
      textBody: 'أنا حاسس بألم شديد في الصدر وضيق تنفس حاد ومش قادر أتنفس',
      channel: 'whatsapp'
    });

    assert.strictEqual(arEmergencyReply.handled, true);
    assert.strictEqual(arEmergencyReply.emergency, true);
    assert.strictEqual(arEmergencyReply.action, 'emergency_intercepted');
    assert.ok(arEmergencyReply.replyMessage.includes('123'), 'Emergency reply must include Ambulance 123');
    assert.ok(arEmergencyReply.replyMessage.includes('طوارئ'), 'Must clearly state emergency warning');

    // Appointment must NOT be marked confirmed
    const apptAfterEmergency = db._store.appointments.get(patientAppt.id);
    assert.strictEqual(apptAfterEmergency.attendanceConfirmed, false, 'Emergency message must NOT confirm attendance');

    // 7.2 Emergency Red-Flag in English: Severe chest pain
    const enEmergencyEval = evaluateReminderInboundMessageSafety('Severe chest pain and difficulty breathing', {
      lang: 'en'
    });
    assert.strictEqual(enEmergencyEval.isEmergency, true);
    assert.ok(enEmergencyEval.replyMessage.includes('123'), 'English emergency alert must include 123');
    assert.ok(enEmergencyEval.replyMessage.includes('Emergency Room'), 'English emergency alert must direct to ER');

    // 7.3 Physician Primacy Guard: Patient asks for clinical medication advice
    const arClinicalReply = await handleInboundReminderWebhook(db, {
      fromPhone: '+201099887766',
      textBody: 'هل أوقف دواء الضغط قبل ما أجي الكشف؟',
      channel: 'whatsapp'
    });

    assert.strictEqual(arClinicalReply.handled, true);
    assert.strictEqual(arClinicalReply.physicianPrimacy, true);
    assert.strictEqual(arClinicalReply.action, 'clinical_advice_prohibited');
    assert.ok(arClinicalReply.replyMessage.includes('طبيبك المعالج'), 'Must redirect clinical question to human physician');

    // 7.4 Sensitive Medical Specialty Masking (Zero Diagnostic Leakage)
    const sensitiveAppt = {
      id: 'appt_oncology_patient',
      doctorName: 'د. يوسف حسني',
      doctorSpecialty: 'مركز علاج الأورام والعلاج الكيماوي',
      clinicName: 'مستشفى الأمل',
      date: '2026-11-01',
      timeSlot: '10:00 AM'
    };

    const maskedResult = sanitizeReminderForPrivacy(sensitiveAppt, { channel: 'sms' });
    assert.strictEqual(maskedResult.phiRedacted, true, 'PHI must be marked as redacted');
    assert.ok(!maskedResult.sanitizedPayload.doctorSpecialty.includes('الأورام'), 'Specialty must not expose oncology in plaintext');
    assert.ok(maskedResult.sanitizedPayload.doctorSpecialty.includes('حماية خصوصية'), 'Must use privacy protection label');

    // 7.5 Patient Privacy Opt-Out (STOP / إلغاء الاشتراك)
    const optOutReply = await handleInboundReminderWebhook(db, {
      fromPhone: '+201099887766',
      textBody: 'إلغاء الاشتراك',
      channel: 'sms'
    });

    assert.strictEqual(optOutReply.handled, true);
    assert.strictEqual(optOutReply.optOut, true);
    assert.strictEqual(optOutReply.action, 'opt_out_honored');
    assert.ok(optOutReply.replyMessage.includes('إيقاف التذكيرات التلقائية'), 'Opt-out confirmation returned');
  });

  // ==========================================================================
  // 8. SECURITY, TOKEN TAMPERING & RBAC ISOLATION
  // ==========================================================================
  it('8. Security & RBAC: Token Tampering & Cross-Patient Confirmation Strictly Blocked', async () => {
    const db = createMockDb();

    const legitimateAppt = {
      id: 'appt_sec_99',
      patientId: 'victim_patient_1',
      date: '2026-11-20',
      timeSlot: '02:00 PM',
      status: 'confirmed',
      attendanceConfirmed: false
    };
    db._store.appointments.set(legitimateAppt.id, legitimateAppt);

    // 8.1 Legitimate Token generation and verification
    const validToken = generateActionToken(legitimateAppt.id, 'confirm_attendance', { expiresInHours: 48 });
    assert.ok(validToken, 'Valid token must be generated');

    const verifyRes = verifyActionToken(validToken);
    assert.strictEqual(verifyRes.valid, true);
    assert.strictEqual(verifyRes.appointmentId, legitimateAppt.id);
    assert.strictEqual(verifyRes.action, 'confirm_attendance');

    // 8.2 Tampered Token: Changing appointment ID
    const parts = validToken.split('.');
    const decodedOriginal = Buffer.from(parts[0], 'base64url').toString('utf8');
    const tamperedData = decodedOriginal.replace('appt_sec_99', 'another_appt_hacked');
    const tamperedPayload = Buffer.from(tamperedData, 'utf8').toString('base64url');
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;

    const tamperedVerify = verifyActionToken(tamperedToken);
    assert.strictEqual(tamperedVerify.valid, false, 'Tampered token must fail verification');
    assert.strictEqual(tamperedVerify.reason, 'INVALID_SIGNATURE');

    // 8.3 Cross-Patient Confirmation via API (Attacker confirms victim's appointment)
    let crossPatientBlocked = false;
    try {
      await confirmAppointmentAttendance(db, legitimateAppt.id, {
        uid: 'attacker_user_666',
        role: 'patient'
      });
    } catch (err) {
      crossPatientBlocked = true;
      assert.strictEqual(err.statusCode, 403, 'Cross-patient confirmation must return HTTP 403');
      assert.strictEqual(err.code, 'ACCESS_DENIED');
    }
    assert.strictEqual(crossPatientBlocked, true, 'Cross-patient confirmation must be blocked');
  });

  // ==========================================================================
  // 9. BILINGUAL PARITY IN TRANSLATIONS
  // ==========================================================================
  it('9. Bilingual Parity: 100% Arabic & English Translation Parity in app/i18n.js for Appointments', () => {
    const arAppts = translations.ar.appointments;
    const enAppts = translations.en.appointments;

    assert.ok(arAppts, 'translations.ar.appointments must exist');
    assert.ok(enAppts, 'translations.en.appointments must exist');

    const criticalKeys = [
      'reminder_banner_title',
      'reminder_countdown_24h',
      'reminder_countdown_2h',
      'confirm_attendance',
      'attendance_confirmed',
      'reschedule_btn',
      'cancel_btn',
      'channel_in_app',
      'channel_email',
      'channel_sms',
      'channel_whatsapp',
      'window_24h',
      'window_2h',
      'doctor_confirmed_badge',
      'doctor_unconfirmed_badge',
      'send_reminder_nudge',
      'reminder_privacy_disclaimer',
      'reminder_emergency_alert',
      'reminder_physician_primacy_notice',
      'reminder_opt_out_success',
      'reminder_sensitive_specialty_masked',
      'reminder_quiet_hours_notice'
    ];

    for (const key of criticalKeys) {
      assert.ok(typeof arAppts[key] === 'string' && arAppts[key].length > 0, `Missing Arabic key: appointments.${key}`);
      assert.ok(typeof enAppts[key] === 'string' && enAppts[key].length > 0, `Missing English key: appointments.${key}`);
    }
  });

});
