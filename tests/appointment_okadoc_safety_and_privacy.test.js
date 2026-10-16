/**
 * Tests for Okadoc 1-Click Reschedule and Cancellation: Safety & Privacy Controls
 * 
 * Category: المواعيد والشات بوت والملفات (ضوابط السلامة والأمان الطبي (Safety & Privacy))
 * Feature: إعادة جدولة أو إلغاء الموعد بضغطة زر — تطبيق قيود الخصوصية ومنع أي تجاوز لدور الطبيب البشري
 * 
 * Verifies:
 * 1. Physician Primacy Enforcement: Non-physicians cannot inject diagnoses, prescriptions,
 *    treatment plans, or clinical signoffs during rescheduling or cancellation (403 CLINICIAN_ROLE_PROTECTED).
 * 2. Autonomous AI Chatbot Circumvention Guardrail: AI chatbots cannot unilaterally mutate or cancel appointments (403 AUTONOMOUS_AI_MUTATION_PROHIBITED).
 * 3. Acute Emergency Triage Screening during Rescheduling: Intercepts severe dyspnea, cyanosis, and SpO2 < 90% (422 EMERGENCY_TRIAGE_ESCALATION_REQUIRED).
 * 4. Calendar Privacy & Data Minimization: Strips raw PHI, diagnoses, and vitals from .ics exports while appending statutory medical notice.
 * 5. Cross-Patient Privacy Isolation & Zero PII Leakage across appointments and calendar strips.
 * 6. Statutory Medical Disclaimer & Human Physician Primacy Guarantee in notifications.
 */

const { describe, it } = require('node:test');
const assert = require('assert');

const schedulingService = require('../backend/scheduling-service');
const {
  bookAppointmentTransaction,
  rescheduleAppointmentTransaction,
  cancelAppointmentTransaction,
  buildIcsContent,
  sanitizeCalendarSlotForPrivacy
} = schedulingService;

const appointmentSafetyService = require('../backend/appointment-safety-service');
const {
  STATUTORY_MEDICAL_DISCLAIMER,
  enforcePhysicianRoleBoundaries,
  validateAppointmentMutationSafety
} = appointmentSafetyService;

const {
  formatRescheduleMessage,
  formatCancelMessage
} = require('../backend/notification-service');

describe('Okadoc Safety & Privacy: 1-Click Reschedule & Cancellation Guardrails', () => {

  function createMockDb() {
    const store = {
      appointments: new Map(),
      appointment_locks: new Map(),
      user_notifications: [],
      email_notifications: [],
      sms_notifications_log: [],
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

  // --- 1. Physician Primacy: Blocks Non-Physicians from Self-Prescribing or Diagnosing during Reschedule ---
  it('1. Physician Primacy: Blocks patient from injecting diagnosis or prescriptions during reschedule', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_primacy_1',
      doctorName: 'Dr. Mona Zaki',
      date: '2026-11-23',
      slotId: 'slot_1000',
      patientId: 'patient_p1',
      patientName: 'Kareem Ahmed',
      consultationType: 'clinic'
    }, { uid: 'patient_p1', role: 'patient' });

    // Patient attempts to inject prescriptions & diagnosis into rescheduling payload
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-24',
          newSlotId: 'slot_1100',
          diagnosis: 'Chronic Bronchial Asthma Stage 3',
          prescriptions: ['Salbutamol 100mcg', 'Prednisolone 20mg']
        }, { uid: 'patient_p1', role: 'patient' });
      },
      (err) => err.code === 'CLINICIAN_ROLE_PROTECTED' && err.statusCode === 403
    );
  });

  // --- 2. Physician Primacy: Blocks Non-Physicians from Injecting Diagnoses during Cancellation ---
  it('2. Physician Primacy: Blocks non-physician injection of clinical signoff or prescriptions in cancellation options', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_primacy_2',
      doctorName: 'Dr. Tamer Hosny',
      date: '2026-11-22',
      slotId: 'slot_1000',
      patientId: 'patient_p2',
      consultationType: 'clinic'
    }, { uid: 'patient_p2', role: 'patient' });

    // Patient attempts to cancel with clinical treatment plan or prescription injection
    await assert.rejects(
      async () => {
        await cancelAppointmentTransaction(db, booked.appointment.id, {
          uid: 'patient_p2',
          role: 'patient'
        }, {
          reason: 'Cancelling appointment',
          prescriptions: ['Amoxicillin 500mg'],
          clinicalSignoff: 'Patient self-discharged'
        });
      },
      (err) => err.code === 'CLINICIAN_ROLE_PROTECTED' && err.statusCode === 403
    );
  });

  // --- 3. Autonomous AI Chatbot Circumvention Guardrail ---
  it('3. AI Bot Guardrail: Strictly prohibits autonomous AI chatbots from unilaterally rescheduling or cancelling appointments', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_primacy_3',
      date: '2026-11-23',
      slotId: 'slot_1000',
      patientId: 'patient_p3',
      consultationType: 'clinic'
    }, { uid: 'patient_p3', role: 'patient' });

    const aiBotUser = { uid: 'gemini_bot_9', role: 'ai_assistant', isAutonomousAi: true };

    // AI Bot attempts autonomous reschedule
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-24',
          newSlotId: 'slot_1000'
        }, aiBotUser);
      },
      (err) => err.code === 'AUTONOMOUS_AI_MUTATION_PROHIBITED' && err.statusCode === 403
    );

    // AI Bot attempts autonomous cancellation
    await assert.rejects(
      async () => {
        await cancelAppointmentTransaction(db, booked.appointment.id, aiBotUser, {
          reason: 'Autonomous bot cancellation'
        });
      },
      (err) => err.code === 'AUTONOMOUS_AI_MUTATION_PROHIBITED' && err.statusCode === 403
    );
  });

  // --- 4. Acute Respiratory Emergency Screening during Reschedule ---
  it('4. Medical Safety: Intercepts acute emergency symptoms (SpO2 < 90% or severe dyspnea) during reschedule with 422 escalation', async () => {
    const db = createMockDb();

    const booked = await bookAppointmentTransaction(db, {
      doctorId: 'dr_primacy_4',
      date: '2026-11-25',
      slotId: 'slot_1000',
      patientId: 'patient_p4',
      consultationType: 'clinic'
    }, { uid: 'patient_p4', role: 'patient' });

    // Patient reports critical emergency symptoms while rescheduling
    await assert.rejects(
      async () => {
        await rescheduleAppointmentTransaction(db, {
          appointmentId: booked.appointment.id,
          newDate: '2026-11-26',
          newSlotId: 'slot_1000',
          symptoms: 'عندي ضيق تنفس حاد واختناق وزرقة الشفاه',
          spo2: 84
        }, { uid: 'patient_p4', role: 'patient' });
      },
      (err) => {
        return err.code === 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED' &&
          err.statusCode === 422 &&
          err.details?.detectedRedFlags?.length > 0;
      }
    );
  });

  // --- 5. Calendar Privacy & Zero PHI Leakage (.ics) ---
  it('5. Calendar Privacy: Strips raw clinical diagnosis and SpO2 from .ics calendar export and appends statutory notice', () => {
    const sensitiveAppt = {
      id: 'appt_priv_123',
      doctorId: 'dr_mona',
      doctorName: 'Dr. Mona El-Shazly',
      patientName: 'Secret Patient',
      date: '2026-11-28',
      slotId: 'slot_1600',
      timeSlot: '04:00 م',
      branch: 'Dokki Branch',
      consultationType: 'clinic',
      // Raw sensitive notes that must be sanitized:
      notes: 'Consultation note diagnosis: Tuberculosis (سل نشط) and spo2: 82% critical'
    };

    const ics = buildIcsContent(sensitiveAppt);

    // Ensure raw disease marker and SpO2 are sanitized
    assert.strictEqual(ics.includes('Tuberculosis'), false);
    assert.strictEqual(ics.includes('سل نشط'), false);
    assert.strictEqual(ics.includes('spo2: 82%'), false);

    // Ensure statutory physician evaluation notice is present
    assert.ok(ics.includes('Notice: Medical appointment requires direct clinical evaluation by a licensed human physician. In emergency\\, call 123.'));
    assert.ok(ics.includes('STATUS:CONFIRMED'));
    assert.ok(ics.includes('BEGIN:VALARM'));
  });

  // --- 6. Slot Anonymization for Public/Patient Calendar Strips ---
  it('6. Data Minimization: Redacts all patient PII and clinical metadata when third parties view calendar slots', () => {
    const rawBookedSlot = {
      id: 'slot_1000',
      startTime: '10:00',
      endTime: '10:30',
      timeAr: '10:00 ص',
      timeEn: '10:00 AM',
      isBooked: true,
      status: 'confirmed',
      patientId: 'patient_confidential',
      patientName: 'Confidential Patient',
      patientEmail: 'confidential@example.com',
      patientPhone: '+201000000000',
      clinicalNotes: 'Severe COPD exacerbation',
      linkedCaseId: 'case_secret_123',
      emergencyRiskFlag: true,
      spo2: 88
    };

    // Another patient viewing the slot
    const sanitized = sanitizeCalendarSlotForPrivacy(rawBookedSlot, { uid: 'other_patient', role: 'patient' });

    assert.strictEqual(sanitized.isBooked, true);
    assert.strictEqual(sanitized.status, 'booked');
    assert.strictEqual(sanitized.patientId, null);
    assert.strictEqual(sanitized.patientName, null);
    assert.strictEqual(sanitized.patientEmail, null);
    assert.strictEqual(sanitized.patientPhone, null);
    assert.strictEqual(sanitized.clinicalNotes, null);
    assert.strictEqual(sanitized.linkedCaseId, null);
    assert.strictEqual(sanitized.spo2, null);
  });

  // --- 7. Statutory Medical Notice in Notifications ---
  it('7. Notifications Integrity: Email notifications include statutory human physician notice', () => {
    const sampleAppt = {
      doctorName: 'د. منى زكي',
      patientName: 'أحمد محمود',
      date: '2026-11-30',
      slotId: '10:00 ص'
    };

    const reschedEmail = formatRescheduleMessage(sampleAppt, {
      channel: 'email',
      recipientType: 'patient',
      lang: 'ar',
      reason: 'تحديث موعد',
      initiatorRole: 'patient'
    });
    assert.ok(reschedEmail.text.includes('تنبيه طبي قانوني') || reschedEmail.text.includes('الطبيب البشري المعالج'));
    assert.ok(reschedEmail.text.includes('123'));

    const cancelEmail = formatCancelMessage(sampleAppt, {
      channel: 'email',
      recipientType: 'patient',
      lang: 'en',
      reason: 'Patient cancelled',
      initiatorRole: 'patient'
    });
    assert.ok(cancelEmail.text.includes('Statutory Medical Notice') || cancelEmail.text.includes('human physician'));
    assert.ok(cancelEmail.text.includes('123'));
  });
});
