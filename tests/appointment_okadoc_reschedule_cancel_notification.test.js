const { describe, it } = require('node:test');
const assert = require('assert');
const {
  bookAppointmentTransaction,
  rescheduleAppointmentTransaction,
  cancelAppointmentTransaction,
  APPOINTMENT_POLICY
} = require('../backend/scheduling-service');
const {
  formatRescheduleMessage,
  formatCancelMessage,
  sendRescheduleNotification,
  sendCancelNotification
} = require('../backend/notification-service');
const {
  buildIcsContent,
  getGoogleCalendarUrl,
  getOutlookCalendarUrl
} = require('../app/modules/appointments/appointments-ui');

describe('Okadoc Feature: 1-Click Reschedule, Cancellation & Calendar Notifications', () => {

  function createMockDb() {
    const store = {
      appointments: new Map(),
      auditLogs: []
    };

    return {
      store,
      collection(name) {
        return {
          doc(id) {
            return {
              id,
              get: async () => ({
                exists: store[name] ? store[name].has(id) : false,
                data: () => store[name] ? store[name].get(id) : null
              }),
              set: async (data, opts) => {
                if (!store[name]) store[name] = new Map();
                if (opts && opts.merge && store[name].has(id)) {
                  store[name].set(id, { ...store[name].get(id), ...data });
                } else {
                  store[name].set(id, data);
                }
              },
              update: async (data) => {
                if (!store[name] || !store[name].has(id)) {
                  throw new Error(`Document ${id} does not exist`);
                }
                store[name].set(id, { ...store[name].get(id), ...data });
              }
            };
          },
          add: async (data) => {
            if (!store[name]) store[name] = [];
            store[name].push(data);
            return { id: 'auto_' + Math.random().toString(36).substring(7) };
          }
        };
      },
      runTransaction: async (updateFunction) => {
        const transaction = {
          get: async (docRef) => docRef.get(),
          set: (docRef, data, opts) => docRef.set(data, opts),
          update: (docRef, data) => docRef.update(data)
        };
        return await updateFunction(transaction);
      }
    };
  }

  it('1. Successfully books an initial appointment with full Okadoc context', async () => {
    const db = createMockDb();
    const result = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_1',
      doctorName: 'Dr. Tamer Hosny',
      date: '2026-11-10',
      slotId: 'slot_1000',
      patientId: 'patient_oka_1',
      patientName: 'Rami Malek',
      patientPhone: '+201099998888',
      patientEmail: 'rami@example.com',
      consultationType: 'clinic',
      branch: 'Cairo - Maadi Branch'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'confirmed');
    assert.strictEqual(result.appointment.consultationType, 'clinic');
    assert.strictEqual(result.appointment.branch, 'Cairo - Maadi Branch');
  });

  it('2. Reschedules appointment with mode switch (Clinic -> Video / Commute Relief) and verifies audit', async () => {
    const db = createMockDb();
    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_2',
      doctorName: 'Dr. Mona Zaki',
      date: '2026-11-11',
      slotId: 'slot_1000',
      patientId: 'patient_oka_2',
      patientName: 'Yasmine Sabri',
      patientPhone: '+201011112222',
      patientEmail: 'yasmine@example.com',
      consultationType: 'clinic',
      branch: 'Nasr City Branch'
    });

    const patientUser = { uid: booked.appointment.patientId, role: 'patient' };
    const rescheduleResult = await rescheduleAppointmentTransaction(db, {
      appointmentId: booked.appointment.id,
      newDate: '2026-11-12',
      newSlotId: 'slot_1600',
      reason: 'Traffic congestion in Cairo - switched to video for commute relief',
      consultationType: 'video'
    }, patientUser);

    assert.strictEqual(rescheduleResult.success, true);
    assert.strictEqual(rescheduleResult.status, 'rescheduled');
    assert.strictEqual(rescheduleResult.appointment.date, '2026-11-12');
    assert.strictEqual(rescheduleResult.appointment.slotId, 'slot_1600');
    assert.strictEqual(rescheduleResult.appointment.consultationType, 'video');
    assert.strictEqual(rescheduleResult.appointment.isOnlineConsultation, true);
    assert.strictEqual(rescheduleResult.appointment.commuteReliefActive, true);
    assert.ok(Array.isArray(rescheduleResult.appointment.history));
    assert.strictEqual(rescheduleResult.appointment.history.length >= 2, true);
    const lastHistory = rescheduleResult.appointment.history[rescheduleResult.appointment.history.length - 1];
    assert.strictEqual(lastHistory.action, 'RESCHEDULED');
    assert.strictEqual(lastHistory.newDate, '2026-11-12');
  });

  it('3. Cancels appointment with reason tracking, frees slot, and prohibits double cancellation', async () => {
    const db = createMockDb();
    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_3',
      doctorName: 'Dr. Sherif Mounir',
      date: '2026-11-15',
      slotId: 'slot_1100',
      patientId: 'patient_oka_3',
      patientName: 'Kareem Abdelaziz',
      patientPhone: '+201033334444',
      patientEmail: 'kareem@example.com',
      consultationType: 'clinic'
    });

    const patientUser = { uid: booked.appointment.patientId, role: 'patient' };
    const cancelResult = await cancelAppointmentTransaction(db, {
      appointmentId: booked.appointment.id,
      reason: 'Personal unexpected conflict'
    }, patientUser);

    assert.strictEqual(cancelResult.success, true);
    assert.strictEqual(cancelResult.status, 'cancelled');
    assert.strictEqual(cancelResult.appointment.cancellationReason, 'Personal unexpected conflict');
    assert.ok(cancelResult.appointment.cancelledAt);

    // Attempting to cancel already cancelled appointment should fail gracefully
    await assert.rejects(
      async () => {
        await cancelAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          reason: 'Duplicate cancel'
        }, patientUser);
      },
      (err) => err.code === 'APPOINTMENT_ALREADY_CANCELLED' || /already been cancelled/i.test(err.message)
    );
  });

  it('4. Formats multi-channel bilingual reschedule notifications for Patient and Doctor', () => {
    const appt = {
      id: 'appt_resched_test_1',
      patientName: 'Amr Diab',
      doctorName: 'Dr. Magdi Yacoub',
      date: '2026-11-20',
      slotId: 'slot_1500',
      consultationType: 'video',
      isOnlineConsultation: true,
      branch: 'Remote Health-Vibe Clinic'
    };

    // Arabic Patient SMS
    const arSms = formatRescheduleMessage(appt, { channel: 'sms', recipientType: 'patient', lang: 'ar' });
    assert.ok(arSms.includes('تم تعديل موعدك بنجاح'));
    assert.ok(arSms.includes('د. Dr. Magdi Yacoub'));
    assert.ok(arSms.includes('2026-11-20'));
    assert.ok(arSms.includes('عن بُعد (فيديو)'));

    // English Patient SMS
    const enSms = formatRescheduleMessage(appt, { channel: 'sms', recipientType: 'patient', lang: 'en' });
    assert.ok(enSms.includes('Your appointment has been successfully rescheduled'));
    assert.ok(enSms.includes('Dr. Dr. Magdi Yacoub'));
    assert.ok(enSms.includes('2026-11-20'));
    assert.ok(enSms.includes('Remote Video Consultation'));

    // Doctor Notification
    const docSms = formatRescheduleMessage(appt, { channel: 'sms', recipientType: 'doctor', lang: 'ar' });
    assert.ok(docSms.includes('إشعار تعديل موعد'));
    assert.ok(docSms.includes('Amr Diab'));

    // Email templates
    const arEmail = formatRescheduleMessage(appt, { channel: 'email', recipientType: 'patient', lang: 'ar' });
    assert.ok(arEmail.subject.includes('تأكيد تعديل موعدك الطبي'));
    assert.ok(arEmail.body.includes('تم تحديث موعد استشارتك'));
    assert.ok(arEmail.body.includes('Health-Vibe'));
  });

  it('5. Formats multi-channel bilingual cancellation notifications for Patient and Doctor', () => {
    const appt = {
      id: 'appt_cancel_test_1',
      patientName: 'Nelly Karim',
      doctorName: 'Dr. Hany El-Nazer',
      date: '2026-11-22',
      slotId: 'slot_1000',
      consultationType: 'clinic'
    };

    // Arabic Cancel SMS
    const arCancel = formatCancelMessage(appt, { channel: 'sms', recipientType: 'patient', lang: 'ar', reason: 'Patient requested' });
    assert.ok(arCancel.includes('تم إلغاء موعدك الطبي بنجاح'));
    assert.ok(arCancel.includes('Dr. Hany El-Nazer'));

    // English Cancel Email
    const enCancelEmail = formatCancelMessage(appt, { channel: 'email', recipientType: 'patient', lang: 'en', reason: 'Schedule conflict' });
    assert.ok(enCancelEmail.subject.includes('Appointment Cancellation Confirmed'));
    assert.ok(enCancelEmail.body.includes('Nelly Karim'));
    assert.ok(enCancelEmail.body.includes('Schedule conflict'));

    // Doctor Cancel Notification
    const docCancel = formatCancelMessage(appt, { channel: 'sms', recipientType: 'doctor', lang: 'en', reason: 'Patient emergency' });
    assert.ok(docCancel.includes('Appointment Cancelled'));
    assert.ok(docCancel.includes('Nelly Karim'));
  });

  it('6. Sends multi-channel notifications via sendRescheduleNotification and sendCancelNotification', async () => {
    const appt = {
      id: 'appt_dispatch_1',
      patientName: 'Sherine',
      patientPhone: '+201055556666',
      patientEmail: 'sherine@example.com',
      doctorName: 'Dr. Khaled',
      date: '2026-11-25',
      slotId: 'slot_0900',
      consultationType: 'clinic'
    };

    const reschedNotif = await sendRescheduleNotification(appt, { reason: 'Shifted earlier' });
    assert.strictEqual(reschedNotif.patient.sms.delivered, true);
    assert.strictEqual(reschedNotif.patient.email.delivered, true);
    assert.strictEqual(reschedNotif.doctor.sms.delivered, true);
    assert.strictEqual(reschedNotif.doctor.email.delivered, true);

    const cancelNotif = await sendCancelNotification(appt, { reason: 'Work commitment' });
    assert.strictEqual(cancelNotif.patient.sms.delivered, true);
    assert.strictEqual(cancelNotif.patient.email.delivered, true);
    assert.strictEqual(cancelNotif.doctor.sms.delivered, true);
  });

  it('7. Generates valid iCalendar (.ics) RFC 5545 compliant calendar file', () => {
    const appt = {
      id: 'appt_ics_test_100',
      doctorName: 'Dr. Essam Heggy',
      specialtyEn: 'Cardiology',
      date: '2026-11-30',
      slotId: 'slot_1000',
      timeSlot: 'slot_1000',
      consultationType: 'clinic',
      branch: 'Mohandessin Branch, Giza'
    };

    const ics = buildIcsContent(appt);
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('VERSION:2.0'));
    assert.ok(ics.includes('PRODID:-//Health-Vibe Clinic//Okadoc Scheduler//EN'));
    assert.ok(ics.includes('BEGIN:VEVENT'));
    assert.ok(ics.includes('UID:appt_ics_test_100@healthvibe.com'));
    assert.ok(ics.includes('SUMMARY:Medical Appointment with Dr. Essam Heggy'));
    assert.ok(ics.includes('LOCATION:Mohandessin Branch\\, Giza'));
    assert.ok(ics.includes('BEGIN:VALARM'));
    assert.ok(ics.includes('TRIGGER:-PT2H'));
    assert.ok(ics.includes('END:VEVENT'));
    assert.ok(ics.includes('END:VCALENDAR'));
  });

  it('8. Generates valid web calendar URLs for Google Calendar and Outlook', () => {
    const appt = {
      id: 'appt_web_cal_1',
      doctorName: 'Dr. Laila Rashed',
      date: '2026-12-01',
      slotId: 'slot_1400',
      timeSlot: 'slot_1400',
      consultationType: 'video',
      videoJoinUrl: 'https://telehealth.healthvibe.com/join/room_123'
    };

    const googleUrl = getGoogleCalendarUrl(appt);
    assert.ok(googleUrl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
    assert.ok(googleUrl.includes(encodeURIComponent('Medical Appointment with Dr. Laila Rashed')));
    assert.ok(googleUrl.includes('20261201T140000'));

    const outlookUrl = getOutlookCalendarUrl(appt);
    assert.ok(outlookUrl.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose'));
    assert.ok(outlookUrl.includes('subject=Medical%20Appointment%20with%20Dr.%20Laila%20Rashed'));
  });

  it('9. Rejects rescheduling with invalid slot or date parameters', async () => {
    const db = createMockDb();
    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_4',
      doctorName: 'Dr. Ashraf',
      date: '2026-11-23',
      slotId: 'slot_1000',
      patientId: 'patient_oka_4',
      patientName: 'Farida',
      consultationType: 'clinic'
    });

    const patientUser = { uid: booked.appointment.patientId, role: 'patient' };
    // Missing newDate
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newSlotId: 'slot_1000'
        }, patientUser);
      },
      (err) => err.code === 'MISSING_PARAMETERS' || /required/i.test(err.message)
    );

    // Invalid newSlotId
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-24',
          newSlotId: 'invalid_slot_xyz'
        }, patientUser);
      },
      (err) => err.code === 'SLOT_NOT_AVAILABLE' || /not available/i.test(err.message)
    );
  });

  it('10. Rejects rescheduling when target slot is already booked by another patient', async () => {
    const db = createMockDb();
    // Patient A books 2026-12-01 slot_1000
    await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_5',
      doctorName: 'Dr. Hazem',
      date: '2026-12-01',
      slotId: 'slot_1000',
      patientId: 'patient_A',
      patientName: 'Patient A',
      consultationType: 'clinic'
    });

    // Patient B books 2026-12-01 slot_1100
    const bookedB = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_5',
      doctorName: 'Dr. Hazem',
      date: '2026-12-01',
      slotId: 'slot_1100',
      patientId: 'patient_B',
      patientName: 'Patient B',
      consultationType: 'clinic'
    });

    const patientUserB = { uid: bookedB.appointment.patientId, role: 'patient' };
    // Patient B tries to reschedule into Patient A's slot
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: bookedB.appointment.id,
          newDate: '2026-12-01',
          newSlotId: 'slot_1000'
        }, patientUserB);
      },
      (err) => err.code === 'DOCTOR_SLOT_CONFLICT' || /already booked/i.test(err.message)
    );
  });
});
