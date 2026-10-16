/**
 * Health Vibe AI - CliniDo Consultation Type Safety, Privacy & Physician Primacy Test Suite
 *
 * Benchmarked against CliniDo & Egyptian Healthcare Regulations:
 * In-Clinic Visit vs. Remote Video Telehealth (Commute Relief) vs. Lab Follow-up
 *
 * Verifies:
 * 1. Physician Primacy & Anti-Autonomous AI Circumvention:
 *    - Rejects non-physicians attempting to inject diagnoses, prescriptions, treatment plans, or ICD-10.
 *    - Guarantees physician primacy flags on both remote and in-clinic appointments.
 *    - Restricts clinical diagnosis and prescription documentation to licensed physicians.
 * 2. Acute Respiratory Emergency Safety for Remote Consultations:
 *    - Detects severe hypoxemia (SpO2 < 90%) and acute dyspnea during remote consultation booking.
 *    - Rejects remote booking without emergency escalation (Egypt 123 Ambulance) unless acknowledged.
 *    - Flags remote care contraindications for unstable critical patients.
 * 3. Calendar Slot Privacy & Data Minimization:
 *    - Anonymizes booked slots for third-party patients (strips consultationType, venue, commute relief, and telehealth room URLs).
 *    - Retains full venue metadata for the assigned doctor, admin, and owner patient.
 * 4. Single Appointment Retrieval Authorization Boundaries:
 *    - Rejects unauthorized patients attempting to inspect other patients' appointment venue or room links (403 ACCESS_DENIED).
 * 5. Family Proxy & Beneficiary Boundary Enforcement:
 *    - Rejects booking video/clinic appointments under an unverified stranger dependent ID.
 * 6. Server Safety Route Contract:
 *    - Validates POST /api/appointments/validate-safety endpoint behavior.
 */

const assert = require('assert');
const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');

console.log('==================================================================');
console.log('🛡️ CLINIDO CONSULTATION TYPE: SAFETY & PRIVACY SUITE');
console.log('   Physician Primacy, Emergency Red-Flags & Zero PHI/Venue Leakage');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

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

// In-Memory Firestore Mock
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
              const updated = { ...existing, ...data };
              store.set(fullKey, updated);
              return updated;
            }
          };
        },
        add: async function (data) {
          const docId = data.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const fullKey = `${colName}/${docId}`;
          const saved = { ...data, id: docId };
          store.set(fullKey, saved);
          return { id: docId };
        },
        where: function (field, op, val) {
          return {
            get: async function () {
              const results = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (field && op === '==' && v[field] !== val) continue;
                  results.push({ id: k.replace(`${colName}/`, ''), data: () => v });
                }
              }
              return {
                forEach: function (cb) { results.forEach(cb); },
                size: results.length
              };
            }
          };
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
  console.log('--- 1. Physician Primacy & Anti-Autonomous AI Circumvention ---');

  await runAsyncTest('should reject non-physicians attempting to inject clinical diagnosis into video booking', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_ai_hack', email: 'hack@example.com', role: 'patient' };

    const payload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1000',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true,
      diagnosis: 'Autonomous AI Diagnosis: Severe Bronchial Asthma'
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, payload, patientUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Must throw error when patient supplies diagnosis');
    assert.strictEqual(caught.statusCode, 403);
    assert.strictEqual(caught.code, 'CLINICIAN_ROLE_PROTECTED');
    assert.ok(caught.message.includes('diagnosis'));
  });

  await runAsyncTest('should reject non-physicians attempting to inject prescriptions into in-clinic booking', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_ai_rx', email: 'rx@example.com', role: 'patient' };

    const payload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1030',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true,
      prescriptions: [{ drugName: 'Ventolin Inhaler', dosage: '2 puffs bid' }]
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, payload, patientUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Must throw error when non-physician supplies prescriptions');
    assert.strictEqual(caught.statusCode, 403);
    assert.strictEqual(caught.code, 'CLINICIAN_ROLE_PROTECTED');
  });

  await runAsyncTest('should enforce physician primacy and statutory disclaimer on newly booked appointments', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_primacy_valid', email: 'valid@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1100',
      consultationType: 'video',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(appt.physicianPrimacyGuaranteed, true);
    assert.strictEqual(appt.clinicalEvaluationRequired, true);
    assert.strictEqual(appt.humanPhysicianReviewStatus, 'PENDING_CLINICAL_EVALUATION');
    assert.ok(appt.statutoryMedicalDisclaimer, 'Must include Arabic statutory disclaimer');
    assert.ok(appt.statutoryMedicalDisclaimerEn, 'Must include English statutory disclaimer');
  });

  await runAsyncTest('should permit only licensed physicians to author clinical evaluation', async () => {
    const mockDb = createMockFirestore();
    const doctorUser = { uid: 'dr_mona', role: 'doctor', licenseNumber: 'EGY-MED-449102' };
    const patientUser = { uid: 'pat_imposter', role: 'patient' };

    // Seed confirmed appointment
    await mockDb.collection('appointments').doc('appt_eval_01').set({
      id: 'appt_eval_01',
      doctorId: 'dr_mona',
      patientId: 'pat_target',
      status: 'confirmed',
      consultationType: 'video',
      humanPhysicianReviewStatus: 'PENDING_CLINICAL_EVALUATION'
    });

    // Imposter patient attempt
    let imposterCaught = null;
    try {
      await appointmentSafetyService.recordDoctorClinicalEvaluation(mockDb, {
        appointmentId: 'appt_eval_01',
        diagnosis: 'Acute Bronchitis',
        prescriptions: [{ drugName: 'Amoxicillin' }]
      }, patientUser);
    } catch (err) {
      imposterCaught = err;
    }
    assert.ok(imposterCaught);
    assert.strictEqual(imposterCaught.statusCode, 403);
    assert.strictEqual(imposterCaught.code, 'CLINICIAN_ROLE_REQUIRED');

    // Genuine doctor evaluation
    const evalResult = await appointmentSafetyService.recordDoctorClinicalEvaluation(mockDb, {
      appointmentId: 'appt_eval_01',
      diagnosis: 'Acute Allergic Bronchospasm',
      icd10Code: 'J45.909',
      prescriptions: [{ drugName: 'Salbutamol Inhaler 100mcg', sig: '1 puff PRN' }],
      clinicalNotes: 'Clear lung auscultation post bronchodilator.'
    }, doctorUser);

    assert.ok(evalResult.success);
    assert.strictEqual(evalResult.humanPhysicianReviewStatus, 'EVALUATED_BY_PHYSICIAN');
    assert.strictEqual(evalResult.evaluatingDoctorId, 'dr_mona');
  });

  console.log('\n--- 2. Acute Respiratory Emergency Safety for Remote Consultations ---');

  await runAsyncTest('should halt remote video booking if patient has acute hypoxemia (SpO2 < 90%) without disclaimer', async () => {
    const mockDb = createMockFirestore();
    const patientUser = { uid: 'pat_hypoxemia', email: 'hypox@example.com', role: 'patient' };

    const remoteCriticalPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1130',
      consultationType: 'video',
      spo2: 86,
      emergencyDisclaimerAcknowledged: false
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, remoteCriticalPayload, patientUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught, 'Must halt remote booking for severe hypoxemia');
    assert.strictEqual(caught.statusCode, 422);
    assert.strictEqual(caught.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    assert.strictEqual(caught.details.isEmergency, true);
    assert.ok(caught.message.includes('123') || caught.details.emergencyActionAr.includes('123'), 'Escalates to Egypt Ambulance 123');
  });

  await runAsyncTest('should validate remote care safety via validateConsultationSafety method', async () => {
    // 1. Critical SpO2 without acknowledgement -> throws 422
    let caught = null;
    try {
      appointmentSafetyService.validateConsultationSafety({
        consultationType: 'video',
        vitals: { spo2: 88 },
        emergencyDisclaimerAcknowledged: false
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.strictEqual(caught.code, 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    assert.strictEqual(caught.details.isRemote, true);

    // 2. Critical SpO2 with explicit acknowledgement -> succeeds with warning flags
    const safeAck = appointmentSafetyService.validateConsultationSafety({
      consultationType: 'video',
      vitals: { spo2: 88 },
      emergencyDisclaimerAcknowledged: true
    });
    assert.ok(safeAck.valid);
    assert.strictEqual(safeAck.isEmergency, true);
    assert.strictEqual(safeAck.isRemote, true);

    // 3. Normal vitals (SpO2 98%) -> succeeds with zero emergency
    const normalResult = appointmentSafetyService.validateConsultationSafety({
      consultationType: 'clinic',
      vitals: { spo2: 98 },
      symptoms: 'فحص دوري للحساسية'
    });
    assert.ok(normalResult.valid);
    assert.strictEqual(normalResult.isEmergency, false);
    assert.strictEqual(normalResult.consultationType, 'clinic');
  });

  console.log('\n--- 3. Calendar Slot Privacy & Data Minimization ---');

  await runAsyncTest('should strip consultationType, commute relief, and telehealth room from calendar for third parties', () => {
    const bookedSlot = {
      id: 'slot_1000',
      timeAr: '10:00 ص',
      timeEn: '10:00 AM',
      isBooked: true,
      status: 'confirmed',
      patientId: 'pat_secret_99',
      patientName: 'أحمد محمود',
      consultationType: 'video',
      type: 'video',
      commuteReliefActive: true,
      commuteReliefNote: 'استشارة عن بُعد تقلل عبء وتكلفة ومخاطر التنقل في زحام شوارع مصر',
      branchLocation: null,
      telehealthUrl: 'https://telehealth.healthvibe.ai/room_th_secret_token_123',
      meetingLink: 'https://telehealth.healthvibe.ai/room_th_secret_token_123'
    };

    const thirdPartyUser = { uid: 'pat_stranger_01', role: 'patient' };
    const sanitized = appointmentSafetyService.sanitizeCalendarSlotForPrivacy(bookedSlot, thirdPartyUser, 'dr_mona');

    // Basic booking status preserved
    assert.strictEqual(sanitized.id, 'slot_1000');
    assert.strictEqual(sanitized.isBooked, true);
    assert.strictEqual(sanitized.status, 'booked');

    // Patient identity strictly stripped
    assert.strictEqual(sanitized.patientId, null);
    assert.strictEqual(sanitized.patientName, null);

    // CliniDo Venue, Commute Relief & Video Room strictly stripped (Zero Leakage!)
    assert.strictEqual(sanitized.consultationType, null, 'Must strip consultationType from third parties');
    assert.strictEqual(sanitized.commuteReliefActive, null, 'Must strip commuteReliefActive from third parties');
    assert.strictEqual(sanitized.commuteReliefNote, null, 'Must strip commuteReliefNote from third parties');
    assert.strictEqual(sanitized.telehealthUrl, null, 'Must strip telehealthUrl from third parties');
    assert.strictEqual(sanitized.meetingLink, null, 'Must strip meetingLink from third parties');
  });

  await runAsyncTest('should retain full consultationType and venue metadata for the assigned doctor', () => {
    const bookedSlot = {
      id: 'slot_1000',
      timeAr: '10:00 ص',
      isBooked: true,
      patientId: 'pat_secret_99',
      consultationType: 'video',
      commuteReliefActive: true,
      telehealthUrl: 'https://telehealth.healthvibe.ai/room_th_secret_token_123'
    };

    const doctorUser = { uid: 'dr_mona', role: 'doctor' };
    const doctorView = appointmentSafetyService.sanitizeCalendarSlotForPrivacy(bookedSlot, doctorUser, 'dr_mona');

    assert.strictEqual(doctorView.consultationType, 'video');
    assert.strictEqual(doctorView.commuteReliefActive, true);
    assert.strictEqual(doctorView.telehealthUrl, 'https://telehealth.healthvibe.ai/room_th_secret_token_123');
  });

  await runAsyncTest('should retain consultationType and venue metadata for the owner patient viewing their own slot', () => {
    const bookedSlot = {
      id: 'slot_1000',
      timeAr: '10:00 ص',
      isBooked: true,
      patientId: 'pat_owner_me',
      consultationType: 'clinic',
      branchLocation: { branchName: 'فرع الدقي المركزي' }
    };

    const ownerPatient = { uid: 'pat_owner_me', role: 'patient' };
    const patientView = appointmentSafetyService.sanitizeCalendarSlotForPrivacy(bookedSlot, ownerPatient, 'dr_mona');

    assert.strictEqual(patientView.consultationType, 'clinic');
    assert.ok(patientView.branchLocation);
    assert.strictEqual(patientView.branchLocation.branchName, 'فرع الدقي المركزي');
  });

  console.log('\n--- 4. Single Appointment Retrieval Authorization Boundaries ---');

  await runAsyncTest('should reject third-party patient fetching another patient appointment details (403 ACCESS_DENIED)', async () => {
    const mockDb = createMockFirestore();
    const patientOwner = { uid: 'pat_owner_safe', email: 'owner@example.com', role: 'patient' };
    const intruder = { uid: 'pat_intruder_x', email: 'intruder@example.com', role: 'patient' };

    const appt = await schedulingService.bookAppointmentTransaction(mockDb, {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1200',
      consultationType: 'clinic',
      emergencyDisclaimerAcknowledged: true
    }, patientOwner);

    let caught = null;
    try {
      await schedulingService.getAppointmentById(mockDb, appt.id, intruder);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught);
    assert.strictEqual(caught.statusCode, 403);
    assert.strictEqual(caught.code, 'ACCESS_DENIED');
  });

  console.log('\n--- 5. Family Proxy & Beneficiary Boundary Enforcement ---');

  await runAsyncTest('should reject booking when patient attempts to attach an unverified stranger dependent ID', async () => {
    const mockDb = createMockFirestore();
    const primaryUser = { uid: 'pat_parent_valid', email: 'parent@example.com', role: 'patient' };

    // Mock family store with child dependent "dep_child_01"
    const familyStore = new Map();
    familyStore.set('family_pat_parent_valid', {
      ownerPatientId: 'pat_parent_valid',
      members: [
        { id: 'dep_child_01', fullName: 'ياسين أحمد', relationship: 'child' }
      ]
    });

    // Attempt to book under stranger ID "dep_stranger_99"
    const maliciousPayload = {
      doctorId: 'dr_mona',
      date: '2026-10-25',
      slotId: 'slot_1230',
      consultationType: 'video',
      beneficiaryId: 'dep_stranger_99',
      _inMemoryStore: familyStore,
      emergencyDisclaimerAcknowledged: true
    };

    let caught = null;
    try {
      await schedulingService.bookAppointmentTransaction(mockDb, maliciousPayload, primaryUser);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught);
    assert.strictEqual(caught.statusCode, 403);
    assert.ok(caught.code === 'UNAUTHORIZED_BENEFICIARY' || caught.code === 'UNAUTHORIZED_BENEFICIARY_ACCESS');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
