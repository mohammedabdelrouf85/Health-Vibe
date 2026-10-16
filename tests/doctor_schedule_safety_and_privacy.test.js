/**
 * Health Vibe AI - Doctor Schedule Manager Safety & Privacy Test Suite
 *
 * Focus:
 * 1. Physician Primacy & Anti-Autonomous AI Circumvention:
 *    - Rejection of AI chatbots, automated bots, and patients from altering doctor schedules.
 *    - Cross-physician isolation: doctors cannot modify schedules of other doctors.
 * 2. Clinical Safety Guardrails:
 *    - Minimum consultation duration (>= 15 mins) to prevent superficial/substandard care.
 *    - Shift duration limits (<= 12 hours) to prevent physician fatigue.
 * 3. Privacy Controls & Data Minimization:
 *    - Redaction of doctor's private/medical leave notes from patient-facing views.
 *    - Masking internal identifiers and creator IDs.
 * 4. Statutory Medical Disclaimer Enforcement:
 *    - Inclusion of statutory legal disclaimers in all schedule/slot responses.
 * 5. Zero-PHI Leakage:
 *    - Prohibits clinical attributes in schedule telemetry and audit logging.
 */

const assert = require('assert');
const appointmentSafetyService = require('../backend/appointment-safety-service');
const doctorScheduleService = require('../backend/doctor-schedule-service');
const analyticsService = require('../backend/analytics-service');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('🛡️ DOCTOR SCHEDULE MANAGER: SAFETY & PRIVACY SUITE');
console.log('   Physician Primacy, Clinical Guardrails & Zero PHI Isolation');
console.log('==================================================================\n');

function createMockDb() {
  const store = new Map();
  return {
    collection: (collName) => ({
      doc: (docId) => ({
        get: async () => {
          const key = `${collName}/${docId}`;
          const val = store.get(key);
          return {
            exists: Boolean(val),
            data: () => val ? JSON.parse(JSON.stringify(val)) : null
          };
        },
        set: async (data, opts) => {
          const key = `${collName}/${docId}`;
          if (opts && opts.merge) {
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          } else {
            store.set(key, JSON.parse(JSON.stringify(data)));
          }
          return { id: docId };
        }
      }),
      add: async (data) => {
        const id = 'gen_' + Date.now();
        store.set(`${collName}/${id}`, JSON.parse(JSON.stringify(data)));
        return { id };
      }
    }),
    _store: store
  };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function runAll() {
  const db = createMockDb();

  console.log('--- 1. Physician Primacy & Anti-Autonomous AI Circumvention ---');

  await runTest('should reject autonomous AI chatbots attempting to alter doctor schedule', async () => {
    const aiUser = { uid: 'ai_chatbot_agent', role: 'ai_assistant', isAutonomousAi: true };
    assert.throws(
      () => {
        appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(aiUser, 'dr_tarek_01', 'UPDATE_SCHEDULE');
      },
      (err) => {
        assert.strictEqual(err.code, 'PHYSICIAN_SCHEDULE_PROTECTED');
        assert(err.message.includes('AI agents are strictly prohibited'));
        return true;
      }
    );
  });

  await runTest('should reject system bots from modifying working hours', async () => {
    const botUser = { uid: 'cron_bot', role: 'system_bot' };
    assert.throws(
      () => {
        appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(botUser, 'dr_tarek_01', 'UPDATE_SCHEDULE');
      },
      (err) => {
        assert.strictEqual(err.code, 'PHYSICIAN_SCHEDULE_PROTECTED');
        return true;
      }
    );
  });

  await runTest('should reject patients from modifying doctor schedule', async () => {
    const patientUser = { uid: 'pat_omar_99', role: 'patient' };
    assert.throws(
      () => {
        appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(patientUser, 'dr_tarek_01', 'UPDATE_SCHEDULE');
      },
      (err) => {
        assert.strictEqual(err.code, 'PHYSICIAN_SCHEDULE_PROTECTED');
        assert(err.message.includes('Patients are strictly forbidden'));
        return true;
      }
    );
  });

  await runTest('should enforce physician isolation and reject Doctor B modifying Doctor A schedule', async () => {
    const doctorB = { uid: 'dr_hassan_02', role: 'doctor' };
    assert.throws(
      () => {
        appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(doctorB, 'dr_tarek_01', 'UPDATE_SCHEDULE');
      },
      (err) => {
        assert.strictEqual(err.code, 'PHYSICIAN_SCHEDULE_PROTECTED');
        assert(err.message.includes('Physician schedule isolation'));
        return true;
      }
    );
  });

  await runTest('should permit doctor modifying their own schedule', async () => {
    const doctorSelf = { uid: 'dr_tarek_01', role: 'doctor' };
    const allowed = appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(doctorSelf, 'dr_tarek_01', 'UPDATE_SCHEDULE');
    assert.strictEqual(allowed, true);
  });

  await runTest('should permit authorized clinic administrator and super admin', async () => {
    const clinicAdmin = { uid: 'admin_cairo', role: 'clinic_admin' };
    const superAdmin = { uid: 'admin_root', role: 'super_admin' };
    assert.strictEqual(appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(clinicAdmin, 'dr_tarek_01'), true);
    assert.strictEqual(appointmentSafetyService.enforceDoctorSchedulePhysicianPrimacy(superAdmin, 'dr_tarek_01'), true);
  });

  console.log('\n--- 2. Clinical Safety Guardrails & Shift Capacity Limits ---');

  await runTest('should reject consultation slot durations under 15 minutes with UNSAFE_CONSULTATION_DURATION', () => {
    assert.throws(
      () => {
        appointmentSafetyService.validateDoctorScheduleClinicalGuardrails({
          slotDurationMinutes: 10 // Too short, violates thoroughness
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'UNSAFE_CONSULTATION_DURATION');
        assert(err.message.includes('cannot be less than 15 minutes'));
        return true;
      }
    );
  });

  await runTest('should reject excessive consultation slot durations over 120 minutes', () => {
    assert.throws(
      () => {
        appointmentSafetyService.validateDoctorScheduleClinicalGuardrails({
          slotDurationMinutes: 150
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'EXCESSIVE_SLOT_DURATION');
        return true;
      }
    );
  });

  await runTest('should reject continuous shift durations exceeding 12 hours without breaks', () => {
    assert.throws(
      () => {
        appointmentSafetyService.validateDoctorScheduleClinicalGuardrails({
          workingDays: {
            monday: { active: true, start: '08:00', end: '22:00' } // 14 hours
          }
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'EXCESSIVE_SHIFT_DURATION');
        assert(err.message.includes('exceeds 12 hours'));
        return true;
      }
    );
  });

  await runTest('should accept valid clinical slot durations and reasonable shifts', () => {
    const result = appointmentSafetyService.validateDoctorScheduleClinicalGuardrails({
      slotDurationMinutes: 20,
      bufferBetweenSlotsMinutes: 10,
      workingDays: {
        sunday: { active: true, start: '09:00', end: '17:00' },
        tuesday: { active: true, start: '10:00', end: '16:00' }
      }
    });
    assert.strictEqual(result, true);
  });

  console.log('\n--- 3. Privacy Controls & Redaction of Personal Doctor Notes ---');

  await runTest('should completely redact personal doctor leave notes for patient viewers', () => {
    const rawSchedule = {
      doctorId: 'dr_tarek_01',
      branches: { cairo_nasr_city: { slotDurationMinutes: 30 } },
      leaves: [
        {
          id: 'leave_confidential_01',
          branchId: 'all',
          startDate: '2026-11-20',
          endDate: '2026-11-22',
          status: 'approved',
          reasonType: 'medical_emergency',
          notes: 'Doctor undergoing private surgical procedure at Al-Salam hospital', // SENSITIVE
          createdBy: 'dr_tarek_01'
        }
      ]
    };

    const patientViewer = { uid: 'pat_omar_12', role: 'patient' };
    const sanitized = appointmentSafetyService.sanitizeDoctorScheduleForPrivacy(rawSchedule, patientViewer, 'dr_tarek_01');

    assert.strictEqual(sanitized.leaves[0].notes, null, 'Doctor personal leave notes must be strictly redacted for patients');
    assert.strictEqual(sanitized.leaves[0].createdBy, null, 'Creator UID must be redacted for patients');
    assert(sanitized.leaves[0].publicNoticeAr.includes('اعتذار الطبيب'), 'Should display professional public notice in Arabic');
    assert(sanitized.leaves[0].publicNoticeEn.includes('Doctor unavailable'), 'Should display professional public notice in English');
  });

  await runTest('should preserve private notes for the doctor themselves or clinic administrator', () => {
    const rawSchedule = {
      doctorId: 'dr_tarek_01',
      leaves: [
        {
          id: 'leave_confidential_01',
          status: 'approved',
          notes: 'Doctor undergoing private surgical procedure'
        }
      ]
    };

    const docSelf = { uid: 'dr_tarek_01', role: 'doctor' };
    const adminViewer = { uid: 'admin_clinic', role: 'clinic_admin' };

    const docView = appointmentSafetyService.sanitizeDoctorScheduleForPrivacy(rawSchedule, docSelf, 'dr_tarek_01');
    assert.strictEqual(docView.leaves[0].notes, 'Doctor undergoing private surgical procedure');

    const adminView = appointmentSafetyService.sanitizeDoctorScheduleForPrivacy(rawSchedule, adminViewer, 'dr_tarek_01');
    assert.strictEqual(adminView.leaves[0].notes, 'Doctor undergoing private surgical procedure');
  });

  await runTest('should redact private notes for third-party doctor without administrative rights', () => {
    const rawSchedule = {
      doctorId: 'dr_tarek_01',
      leaves: [
        {
          id: 'leave_confidential_01',
          status: 'approved',
          notes: 'Doctor undergoing private surgical procedure'
        }
      ]
    };

    const docOther = { uid: 'dr_other_physician', role: 'doctor' };
    const otherView = appointmentSafetyService.sanitizeDoctorScheduleForPrivacy(rawSchedule, docOther, 'dr_tarek_01');
    assert.strictEqual(otherView.leaves[0].notes, null, 'Other physicians without clinic admin rights must not see private notes');
  });

  console.log('\n--- 4. Statutory Medical Disclaimer Enforcement ---');

  await runTest('sanitized schedule and slot responses must include statutory medical disclaimer', () => {
    const rawSchedule = { doctorId: 'dr_tarek_01', branches: {} };
    const sanitized = appointmentSafetyService.sanitizeDoctorScheduleForPrivacy(rawSchedule, null, 'dr_tarek_01');
    assert(sanitized.statutoryDisclaimer, 'Schedule response must attach statutoryDisclaimer');
    assert(sanitized.statutoryDisclaimer.ar.includes('تنبيه طبي قانوني'));
    assert(sanitized.statutoryDisclaimer.en.includes('Statutory Medical Disclaimer'));
  });

  console.log('\n--- 5. Zero PHI Leakage in Schedule Telemetry & Auditing ---');

  await runTest('should forbid clinical diagnosis or patient symptoms in schedule telemetry', async () => {
    await assert.rejects(
      async () => {
        await analyticsService.logTelemetryEvent(db, {
          eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
          userId: 'dr_tarek_01',
          doctorId: 'dr_tarek_01',
          symptoms: 'Dyspnea and productive cough', // FORBIDDEN
          timestamp: new Date().toISOString()
        });
      },
      /MEDICAL_TEXT_PROHIBITED/
    );
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
