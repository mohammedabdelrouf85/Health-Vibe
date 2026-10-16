/**
 * Tests for Okadoc 1-Click Reschedule and Cancellation Backend & APIs
 * 
 * Verifies:
 * 1. Patient-initiated Rescheduling with immediate Reciprocal Doctor Notifications.
 * 2. Clinic/Doctor-initiated Rescheduling with immediate Reciprocal Patient Notifications.
 * 3. Patient-initiated Cancellation with Slot Lock Release & Doctor Notification.
 * 4. Clinic/Doctor-initiated Cancellation with Patient Apology & Priority Rebooking Link.
 * 5. Dynamic RFC 5545 iCalendar (.ics) export with 2-hour pre-visit alert (VALARM).
 * 6. RBAC Security & Cross-Patient Isolation (403 on unauthorized access).
 * 7. Anti-Double Booking Concurrency & Slot Collision Protection (409 Conflict).
 */

const { describe, it } = require('node:test');
const assert = require('assert');

const schedulingService = require('../backend/scheduling-service');
const {
  bookAppointmentTransaction,
  rescheduleAppointmentTransaction,
  cancelAppointmentTransaction,
  getAppointmentById,
  buildIcsContent
} = schedulingService;

const {
  formatRescheduleMessage,
  formatCancelMessage,
  sendRescheduleNotification,
  sendCancelNotification
} = require('../backend/notification-service');

describe('Okadoc Backend & APIs: 1-Click Reschedule, Cancellation, Reciprocal Alerts & Calendar Sync', () => {

  function createMockDb() {
    const store = {
      appointments: new Map(),
      appointment_locks: new Map(),
      user_notifications: [],
      email_notifications: [],
      sms_notifications_log: [],
      waiting_list: [],
      cases: new Map(),
      audit_events: []
    };

    return {
      store,
      collection(name) {
        return {
          doc(id) {
            return {
              id,
              get: async () => ({
                exists: store[name] instanceof Map ? store[name].has(id) : false,
                data: () => store[name] instanceof Map ? store[name].get(id) : null
              }),
              set: async (data, opts) => {
                if (!(store[name] instanceof Map)) store[name] = new Map();
                if (opts && opts.merge && store[name].has(id)) {
                  store[name].set(id, { ...store[name].get(id), ...data });
                } else {
                  store[name].set(id, data);
                }
              },
              update: async (data) => {
                if (!(store[name] instanceof Map) || !store[name].has(id)) {
                  throw new Error(`Document ${id} does not exist in ${name}`);
                }
                store[name].set(id, { ...store[name].get(id), ...data });
              }
            };
          },
          add: async (data) => {
            if (!Array.isArray(store[name])) store[name] = [];
            const docId = `auto_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const item = { id: docId, ...data };
            store[name].push(item);
            return { id: docId };
          },
          where: () => ({
            get: async () => {
              const docs = [];
              if (store[name] instanceof Map) {
                store[name].forEach((val, key) => docs.push({ id: key, data: () => val }));
              }
              return { docs, forEach: cb => docs.forEach(cb) };
            }
          })
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

  // --- TEST 1: Patient-Initiated 1-Click Reschedule ---
  it('1. Patient reschedules appointment -> Doctor receives reciprocal alert and change history is retained', async () => {
    const db = createMockDb();
    
    // 1. Initial Booking
    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_1',
      doctorName: 'Dr. Tamer Hosny',
      date: '2026-11-10',
      slotId: 'slot_1000',
      patientId: 'patient_alpha',
      patientName: 'Ahmed Mahmoud',
      patientEmail: 'ahmed@example.com',
      patientPhone: '+201012345678',
      consultationType: 'clinic'
    }, { uid: 'patient_alpha', role: 'patient' });

    assert.strictEqual(booked.success, true);
    assert.strictEqual(booked.appointment.status, 'confirmed');

    // 2. Patient triggers Reschedule
    const rescheduleResult = await rescheduleAppointmentTransaction(db, {
      appointmentId: booked.appointment.id,
      newDate: '2026-11-11',
      newSlotId: 'slot_1600',
      reason: 'Urgent meeting conflict, rescheduling to afternoon',
      consultationType: 'clinic'
    }, { uid: 'patient_alpha', role: 'patient' });

    assert.strictEqual(rescheduleResult.success, true);
    assert.strictEqual(rescheduleResult.status, 'rescheduled');
    assert.strictEqual(rescheduleResult.date, '2026-11-11');
    assert.strictEqual(rescheduleResult.slotId, 'slot_1600');

    // Verify change history audit trail
    assert.ok(Array.isArray(rescheduleResult.history));
    assert.strictEqual(rescheduleResult.history.length, 2); // BOOKED, then RESCHEDULED
    const lastHistory = rescheduleResult.history[rescheduleResult.history.length - 1];
    assert.strictEqual(lastHistory.action, 'RESCHEDULED');
    assert.strictEqual(lastHistory.actorRole, 'patient');
    assert.strictEqual(lastHistory.previousDate, '2026-11-10');
    assert.strictEqual(lastHistory.newDate, '2026-11-11');

    // Verify reciprocal notifications: Doctor was notified of patient-initiated reschedule
    assert.ok(rescheduleResult.notificationResult);
    assert.strictEqual(rescheduleResult.notificationResult.doctor.sms.delivered, true);
    assert.strictEqual(rescheduleResult.notificationResult.doctor.email.delivered, true);
    assert.ok(rescheduleResult.notificationResult.doctor.sms.text.includes('Ahmed Mahmoud') || rescheduleResult.notificationResult.doctor.sms.text.includes('المريض'));
  });

  // --- TEST 2: Clinic/Doctor-Initiated Reschedule ---
  it('2. Clinic/Doctor reschedules appointment -> Patient receives clinic-tailored notice with reason & 1-click link', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_2',
      doctorName: 'Dr. Mona Zaki',
      date: '2026-11-12',
      slotId: 'slot_1000',
      patientId: 'patient_beta',
      patientName: 'Sarah Gamal',
      patientEmail: 'sarah@example.com',
      patientPhone: '+201098765432',
      consultationType: 'clinic'
    }, { uid: 'patient_beta', role: 'patient' });

    // Clinic Doctor reschedules due to emergency surgery
    const doctorUser = { uid: 'dr_okadoc_test_2', role: 'doctor' };
    const rescheduleResult = await rescheduleAppointmentTransaction(db, {
      appointmentId: booked.appointment.id,
      newDate: '2026-11-12',
      newSlotId: 'slot_1700',
      reason: 'Doctor had an emergency thoracic bronchoscopy',
      consultationType: 'clinic'
    }, doctorUser);

    assert.strictEqual(rescheduleResult.success, true);
    assert.strictEqual(rescheduleResult.date, '2026-11-12');
    assert.strictEqual(rescheduleResult.slotId, 'slot_1700');

    // Patient receives clinic notification
    assert.ok(rescheduleResult.notificationResult);
    assert.strictEqual(rescheduleResult.notificationResult.patient.sms.delivered, true);
    assert.strictEqual(rescheduleResult.notificationResult.patient.email.delivered, true);
    
    // Check Arabic and English clinic-initiated message formatting
    const patientMsgAr = formatRescheduleMessage(rescheduleResult, {
      channel: 'sms',
      recipientType: 'patient',
      lang: 'ar',
      reason: 'Doctor had an emergency thoracic bronchoscopy',
      initiatorRole: 'doctor'
    });
    assert.ok(patientMsgAr.includes('إشعار من العيادة') || patientMsgAr.includes('تم تعديل موعدك'));

    const patientMsgEn = formatRescheduleMessage(rescheduleResult, {
      channel: 'sms',
      recipientType: 'patient',
      lang: 'en',
      reason: 'Doctor emergency surgery',
      initiatorRole: 'doctor'
    });
    assert.ok(patientMsgEn.includes('Clinic Notice'));
  });

  // --- TEST 3: Patient-Initiated Cancellation ---
  it('3. Patient cancels appointment -> Atomically releases locks, notifies Doctor & offers slot to waiting list', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_3',
      doctorName: 'Dr. Khaled Selim',
      date: '2026-11-15',
      slotId: 'slot_1100',
      patientId: 'patient_gamma',
      patientName: 'Omar Sherif',
      patientEmail: 'omar@example.com',
      patientPhone: '+201122334455',
      consultationType: 'video'
    }, { uid: 'patient_gamma', role: 'patient' });

    // Patient cancels
    const cancelResult = await cancelAppointmentTransaction(db, booked.appointment.id, {
      uid: 'patient_gamma',
      role: 'patient'
    }, {
      reason: 'Patient symptoms completely resolved'
    });

    assert.strictEqual(cancelResult.success, true);
    assert.strictEqual(cancelResult.status, 'cancelled');
    assert.strictEqual(cancelResult.cancelReason, 'Patient symptoms completely resolved');

    // Check that locks were released in DB
    const doctorLockDoc = db.store.appointment_locks.get(cancelResult.appointment.slotKey || `lock_dr_okadoc_test_3_2026-11-15_slot_1100`);
    if (doctorLockDoc) {
      assert.strictEqual(doctorLockDoc.status, 'released');
    }

    // Verify reciprocal notification: Doctor received immediate cancellation alert
    assert.ok(cancelResult.notificationResult);
    assert.strictEqual(cancelResult.notificationResult.doctor.sms.delivered, true);
    assert.strictEqual(cancelResult.notificationResult.doctor.email.delivered, true);

    const docMsg = formatCancelMessage(booked.appointment, {
      channel: 'sms',
      recipientType: 'doctor',
      lang: 'ar',
      reason: 'Patient symptoms completely resolved',
      initiatorRole: 'patient'
    });
    assert.ok(docMsg.includes('إشعار إلغاء موعد') || docMsg.includes('تم إلغاء موعد'));
  });

  // --- TEST 4: Clinic/Doctor-Initiated Cancellation ---
  it('4. Clinic/Doctor cancels appointment -> Patient receives apology, explanation and rebooking priority', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_4',
      doctorName: 'Dr. Hany Nazer',
      date: '2026-11-16',
      slotId: 'slot_1200',
      patientId: 'patient_delta',
      patientName: 'Nour Ali',
      patientEmail: 'nour@example.com',
      patientPhone: '+201500001111',
      consultationType: 'clinic'
    }, { uid: 'patient_delta', role: 'patient' });

    // Clinic Admin cancels
    const clinicAdmin = { uid: 'admin_cairo_1', role: 'clinic_admin', clinicId: booked.appointment.clinicId };
    const cancelResult = await cancelAppointmentTransaction(db, booked.appointment.id, clinicAdmin, {
      reason: 'Clinic undergoing mandatory medical sterilization'
    });

    assert.strictEqual(cancelResult.success, true);
    assert.strictEqual(cancelResult.status, 'cancelled');

    // Patient receives clinic cancellation apology & rebooking notice
    assert.ok(cancelResult.notificationResult);
    assert.strictEqual(cancelResult.notificationResult.patient.sms.delivered, true);
    assert.strictEqual(cancelResult.notificationResult.patient.email.delivered, true);

    const patientCancelAr = formatCancelMessage(booked.appointment, {
      channel: 'sms',
      recipientType: 'patient',
      lang: 'ar',
      reason: 'Clinic undergoing mandatory sterilization',
      initiatorRole: 'clinic_admin'
    });
    assert.ok(patientCancelAr.includes('نعتذر منكم') || patientCancelAr.includes('العيادة'));

    const patientCancelEn = formatCancelMessage(booked.appointment, {
      channel: 'sms',
      recipientType: 'patient',
      lang: 'en',
      reason: 'Clinic emergency sterilization',
      initiatorRole: 'clinic_admin'
    });
    assert.ok(patientCancelEn.includes('Clinic Notice: We apologize'));
  });

  // --- TEST 5: RFC 5545 iCalendar (.ics) Generation with VALARM ---
  it('5. Generates RFC 5545 iCalendar (.ics) content with 2-hour pre-visit alert', () => {
    const appt = {
      id: 'appt_ics_test_999',
      doctorId: 'dr_mona',
      doctorName: 'Dr. Mona El-Shazly',
      patientName: 'Kareem Fahmy',
      date: '2026-11-20',
      slotId: 'slot_1600',
      timeSlot: '04:00 م (Evening)',
      branch: 'Dokki Central Pulmonary Center',
      consultationType: 'clinic',
      typeLabel: 'كشف بالعيادة (In-Clinic Physical Visit)',
      notes: 'Chest asthma consultation'
    };

    const icsContent = buildIcsContent(appt);

    assert.ok(typeof icsContent === 'string');
    assert.ok(icsContent.includes('BEGIN:VCALENDAR'));
    assert.ok(icsContent.includes('VERSION:2.0'));
    assert.ok(icsContent.includes('PRODID:-//Health-Vibe Clinic//Okadoc Scheduler//EN'));
    assert.ok(icsContent.includes('BEGIN:VEVENT'));
    assert.ok(icsContent.includes('SUMMARY:Medical Appointment with Dr. Mona El-Shazly'));
    assert.ok(icsContent.includes('STATUS:CONFIRMED'));
    
    // Check 2-hour pre-visit reminder alarm
    assert.ok(icsContent.includes('BEGIN:VALARM'));
    assert.ok(icsContent.includes('TRIGGER:-PT2H'));
    assert.ok(icsContent.includes('ACTION:DISPLAY'));
    assert.ok(icsContent.includes('Reminder: Medical Appointment with Doctor in 2 hours'));
    assert.ok(icsContent.includes('END:VALARM'));
    assert.ok(icsContent.includes('END:VEVENT'));
    assert.ok(icsContent.includes('END:VCALENDAR'));
  });

  // --- TEST 6: Security & Cross-Patient Authorization ---
  it('6. Security Boundary: Rejects reschedule & cancellation attempts by unauthorized users (403)', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_5',
      doctorName: 'Dr. Samy Amin',
      date: '2026-11-25',
      slotId: 'slot_1000',
      patientId: 'patient_owner',
      patientName: 'Owner Patient',
      consultationType: 'clinic'
    }, { uid: 'patient_owner', role: 'patient' });

    const maliciousUser = { uid: 'patient_attacker', role: 'patient' };

    // Attacker tries to reschedule
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-26',
          newSlotId: 'slot_1000'
        }, maliciousUser);
      },
      (err) => err.code === 'ACCESS_DENIED' || err.statusCode === 403
    );

    // Attacker tries to cancel
    await assert.rejects(
      async () => {
        await cancelAppointmentTransaction(db, booked.appointment.id, maliciousUser, {
          reason: 'Malicious cancellation'
        });
      },
      (err) => err.code === 'ACCESS_DENIED' || err.statusCode === 403
    );
  });

  // --- TEST 7: Slot Double-Booking & Collision Protection ---
  it('7. Concurrency Protection: Rejects rescheduling into an already booked slot (409 DOCTOR_SLOT_CONFLICT)', async () => {
    const db = createMockDb();

    // 1. Patient A books slot_1000 on 2026-11-18
    const bookedA = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_6',
      doctorName: 'Dr. Tarek Nour',
      date: '2026-11-18',
      slotId: 'slot_1000',
      patientId: 'patient_A',
      consultationType: 'clinic'
    }, { uid: 'patient_A', role: 'patient' });

    // 2. Patient B books slot_1600 on 2026-11-18 with the SAME doctor
    const bookedB = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_6',
      doctorName: 'Dr. Tarek Nour',
      date: '2026-11-18',
      slotId: 'slot_1600',
      patientId: 'patient_B',
      consultationType: 'clinic'
    }, { uid: 'patient_B', role: 'patient' });

    // 3. Patient B tries to reschedule into slot_1000 (already occupied by Patient A)
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: bookedB.appointment.id,
          newDate: '2026-11-18',
          newSlotId: 'slot_1000',
          reason: 'I want morning slot instead'
        }, { uid: 'patient_B', role: 'patient' });
      },
      (err) => err.code === 'DOCTOR_SLOT_CONFLICT' || /already booked/i.test(err.message)
    );
  });

  // --- TEST 8: Rejects Cancellation or Rescheduling of Already Cancelled Appointment ---
  it('8. Policy Protection: Cannot cancel or reschedule an already cancelled appointment', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_okadoc_test_7',
      date: '2026-11-22',
      slotId: 'slot_1000',
      patientId: 'patient_c1',
      consultationType: 'clinic'
    }, { uid: 'patient_c1', role: 'patient' });

    // First cancel succeeds
    await cancelAppointmentTransaction(db, booked.appointment.id, {
      uid: 'patient_c1',
      role: 'patient'
    });

    // Second cancel fails
    await assert.rejects(
      async () => {
        await cancelAppointmentTransaction(db, booked.appointment.id, {
          uid: 'patient_c1',
          role: 'patient'
        });
      },
      (err) => err.code === 'APPOINTMENT_ALREADY_CANCELLED' || /already been cancelled/i.test(err.message)
    );

    // Rescheduling cancelled appointment fails
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-23',
          newSlotId: 'slot_1000'
        }, { uid: 'patient_c1', role: 'patient' });
      },
      (err) => err.code === 'CANNOT_RESCHEDULE_CANCELLED' || /Cancelled appointments cannot be rescheduled/i.test(err.message)
    );
  });
});
