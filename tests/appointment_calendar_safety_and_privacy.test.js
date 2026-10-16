/**
 * Health Vibe AI - Appointment Calendar Safety, Medical Privacy & Physician Primacy Tests
 *
 * Benchmark: Vezeeta & CliniDo Clinical Governance
 *
 * Verifies:
 * 1. Emergency Red-Flag Triage:
 *    - Real-time screening for SpO2 < 90%, cyanosis, silent chest, hemoptysis.
 *    - Strict rejection if emergency disclaimer is unacknowledged (EMERGENCY_TRIAGE_ESCALATION_REQUIRED).
 *    - Proper escalation with 123 emergency ambulance contacts and non-emergency statutory disclaimer.
 * 2. Physician Primacy & Anti-Circumvention (منع أي تجاوز لدور الطبيب البشري):
 *    - Blocks patients, AI chatbots, and non-physicians from authoring clinical diagnoses or prescriptions (CLINICIAN_ROLE_PROTECTED).
 *    - Validates human doctor digital signature and medical license verification.
 *    - Ensures clinical discharge and completion is reserved for attending physicians.
 * 3. Privacy Controls & Data Minimization (تطبيق قيود الخصوصية):
 *    - Slot anonymization for multi-patient interactive calendar strips (zero PII leakage).
 *    - Cross-account family beneficiary access control (UNAUTHORIZED_BENEFICIARY).
 *    - Authoritative compliance audit trails for safety and privacy mutations.
 */

const assert = require('assert');
const schedulingService = require('../backend/scheduling-service');
const appointmentSafetyService = require('../backend/appointment-safety-service');

// ============================================================================
// 🧪 MOCK FIRESTORE DATABASE
// ============================================================================
function createMockDb() {
  const collections = new Map();

  function getCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  const db = {
    _collections: collections,
    collection: function (collName) {
      const coll = getCollection(collName);
      return {
        doc: function (docId) {
          return {
            get: async function () {
              const data = coll.get(docId);
              return {
                id: docId,
                exists: Boolean(data),
                data: () => (data ? { ...data } : undefined)
              };
            },
            set: async function (data, options = {}) {
              const current = coll.get(docId) || {};
              const merged = options.merge ? { ...current, ...data } : { ...data, id: docId };
              coll.set(docId, merged);
              return { id: docId, ...merged };
            },
            update: async function (data) {
              const current = coll.get(docId);
              if (!current) throw new Error(`Document ${docId} not found in ${collName}`);
              const updated = { ...current, ...data };
              coll.set(docId, updated);
              return updated;
            },
            delete: async function () {
              coll.delete(docId);
              return { success: true };
            }
          };
        },
        where: function (field, op, val) {
          return {
            where: function (f2, op2, v2) {
              return {
                get: async function () {
                  const docs = [];
                  for (const [id, item] of coll.entries()) {
                    let match1 = false;
                    if (op === '==') match1 = item[field] === val;
                    else if (op === 'in') match1 = Array.isArray(val) && val.includes(item[field]);

                    let match2 = false;
                    if (op2 === '==') match2 = item[f2] === v2;
                    else if (op2 === 'in') match2 = Array.isArray(v2) && v2.includes(item[f2]);

                    if (match1 && match2) {
                      docs.push({ id, data: () => ({ ...item }) });
                    }
                  }
                  return {
                    docs,
                    empty: docs.length === 0,
                    size: docs.length,
                    forEach: (fn) => docs.forEach(fn)
                  };
                }
              };
            },
            get: async function () {
              const docs = [];
              for (const [id, item] of coll.entries()) {
                let match = false;
                if (op === '==') match = item[field] === val;
                else if (op === 'in') match = Array.isArray(val) && val.includes(item[field]);
                if (match) {
                  docs.push({ id, data: () => ({ ...item }) });
                }
              }
              return {
                docs,
                empty: docs.length === 0,
                size: docs.length,
                forEach: (fn) => docs.forEach(fn)
              };
            }
          };
        },
        add: async function (data) {
          const autoId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          coll.set(autoId, { ...data, id: autoId });
          return { id: autoId };
        }
      };
    },
    runTransaction: async function (callback) {
      const transaction = {
        get: async function (docRef) {
          return await docRef.get();
        },
        set: function (docRef, data, options = {}) {
          docRef.set(data, options);
        },
        update: function (docRef, data) {
          docRef.update(data);
        }
      };
      return await callback(transaction);
    }
  };

  return db;
}

// ============================================================================
// 🚀 RUN SAFETY & PRIVACY TEST SUITE
// ============================================================================
async function runSafetyAndPrivacyTestSuite() {
  console.log('\n================================================================================');
  console.log('🛡️ HEALTH VIBE AI: APPOINTMENTS SAFETY, PRIVACY & PHYSICIAN PRIMACY TESTS');
  console.log('================================================================================\n');

  let passed = 0;
  const targetDate = '2026-10-19'; // Monday - working day for Dr. Mona

  // --------------------------------------------------------------------------
  // TEST 1: Acute Emergency Red-Flag Triage & Escalation
  // --------------------------------------------------------------------------
  console.log('▶ TEST 1: Acute Emergency Red-Flag Triage & Escalation Protocol');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const patientUser = { uid: 'patient_emergency_1', role: 'patient', email: 'emergency@healthvibe.ai' };

    // Attempt booking with critical hypoxemia and acute cyanosis without disclaimer acknowledgement
    let blockedAsEmergency = false;
    try {
      await schedulingService.bookAppointmentTransaction(db, {
        doctorId: 'dr_mona',
        date: targetDate,
        slotId: 'slot_1000',
        spo2: 86, // SpO2 < 90%
        symptoms: 'ضيق تنفس حاد مع زرقة في الشفاه وعجز عن الكلام',
        emergencyDisclaimerAcknowledged: false
      }, patientUser);
    } catch (err) {
      if (err.code === 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED' && err.statusCode === 422) {
        blockedAsEmergency = true;
        assert.ok(err.details.isEmergency, 'Triage details must mark isEmergency=true');
        assert.strictEqual(err.details.urgencyLevel, 'CRITICAL_EMERGENCY');
        assert.ok(err.details.detectedRedFlags.length >= 2, 'Should detect severe_hypoxemia and cyanosis/dyspnea');
        assert.strictEqual(err.details.emergencyContacts.egypt, '123', 'Must provide official Egypt emergency 123 hotline');
        assert.ok(err.details.statutoryDisclaimer.en.includes('123'), 'Disclaimer must emphasize immediate 123 emergency dispatch');
      } else {
        throw err;
      }
    }
    assert.ok(blockedAsEmergency, 'Emergency red-flag booking must be rejected with 422 EMERGENCY_TRIAGE_ESCALATION_REQUIRED');
    console.log('  ✓ Routine booking blocked when unacknowledged critical red flags detected (SpO2: 86%, Cyanosis).');
    console.log('  ✓ Official Egyptian ambulance contact (123) and hospital ER guidance returned.');

    // Now proceed with explicit acknowledgement (patient already in ER seeking scheduled follow-up)
    const confirmedAppt = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_1000',
      spo2: 86,
      symptoms: 'ضيق تنفس حاد مع زرقة في الشفاه وعجز عن الكلام',
      emergencyDisclaimerAcknowledged: true
    }, patientUser);

    assert.strictEqual(confirmedAppt.status, 'confirmed');
    assert.strictEqual(confirmedAppt.emergencyRiskFlag, true);
    assert.strictEqual(confirmedAppt.triageUrgency, 'CRITICAL_EMERGENCY');
    assert.strictEqual(confirmedAppt.physicianPrimacyGuaranteed, true);
    assert.ok(confirmedAppt.statutoryMedicalDisclaimer.includes('123'));
    console.log('  ✓ Acknowledged booking succeeds with statutory medical disclaimer & emergency risk tags attached.');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 2: Physician Primacy & Anti-Circumvention (منع أي تجاوز لدور الطبيب البشري)
  // --------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Physician Primacy & Anti-Circumvention Enforcement');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const patientUser = { uid: 'patient_curious', role: 'patient', email: 'curious@healthvibe.ai' };

    // 1. Patient attempts to inject a self-diagnosis or AI chatbot diagnosis during booking
    let diagnosisBlocked = false;
    try {
      await schedulingService.bookAppointmentTransaction(db, {
        doctorId: 'dr_mona',
        date: targetDate,
        slotId: 'slot_1130',
        diagnosis: 'Acute Severe Asthma Exacerbation (Self-Assessed)',
        icd10Code: 'J45.901'
      }, patientUser);
    } catch (err) {
      if (err.code === 'CLINICIAN_ROLE_PROTECTED' && err.statusCode === 403) {
        diagnosisBlocked = true;
        assert.ok(err.message.includes('strictly reserved for licensed human physicians'));
      } else {
        throw err;
      }
    }
    assert.ok(diagnosisBlocked, 'Non-clinician diagnosis injection must be rejected with 403 CLINICIAN_ROLE_PROTECTED');
    console.log('  ✓ Self-diagnosis and automated AI diagnosis injection strictly blocked (HTTP 403).');

    // 2. Patient attempts to inject prescription orders during booking
    let prescriptionBlocked = false;
    try {
      await schedulingService.bookAppointmentTransaction(db, {
        doctorId: 'dr_mona',
        date: targetDate,
        slotId: 'slot_1130',
        prescriptions: [{ drug: 'Ventolin Inhaler 100mcg', dose: '2 puffs q4h' }]
      }, patientUser);
    } catch (err) {
      if (err.code === 'CLINICIAN_ROLE_PROTECTED' && err.statusCode === 403) {
        prescriptionBlocked = true;
      }
    }
    assert.ok(prescriptionBlocked, 'Non-clinician prescription authoring must be rejected with 403 CLINICIAN_ROLE_PROTECTED');
    console.log('  ✓ Unauthorized prescription authoring strictly blocked (HTTP 403 CLINICIAN_ROLE_PROTECTED).');

    // 3. Legitimate booking with ordinary patient complaint proceeds smoothly
    const validBooking = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_1130',
      reasonForVisit: 'سعال مستمر منذ أسبوعين وأرغب في تقييم الطبيب المختص',
      symptoms: 'كحة جافة خفيفة'
    }, patientUser);

    assert.strictEqual(validBooking.status, 'confirmed');
    assert.strictEqual(validBooking.diagnosis, undefined);
    assert.strictEqual(validBooking.physicianPrimacyGuaranteed, true);
    console.log('  ✓ Patient chief complaint recorded without circumventing human clinician evaluation.');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 3: Doctor Clinical Documentation, Digital Signature & RBAC
  // --------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Doctor Clinical Evaluation & Verifiable Digital Signature');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const patientUser = { uid: 'patient_eval_target', role: 'patient' };
    const attendingDoctor = {
      uid: 'dr_mona',
      role: 'doctor',
      name: 'د. منى سامي',
      specialty: 'أمراض الصدر والحساسية',
      licenseNumber: 'EGY-MED-449102'
    };
    const unauthorizedDoctor = {
      uid: 'dr_impostor',
      role: 'doctor',
      name: 'د. دخيل غير معتمد',
      licenseNumber: 'EGY-MED-999999'
    };

    // Book legitimate appointment
    const appt = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_1600',
      reasonForVisit: 'فحص دوري لحساسية الصدر'
    }, patientUser);

    // 1. Unauthorized doctor attempts to record clinical notes for Dr. Mona's patient
    let impostorBlocked = false;
    try {
      await appointmentSafetyService.recordDoctorClinicalEvaluation(db, {
        appointmentId: appt.id,
        diagnosis: 'Allergic Asthma',
        clinicalNotes: 'Unauthorized entry'
      }, unauthorizedDoctor);
    } catch (err) {
      if (err.code === 'ACCESS_DENIED' && err.statusCode === 403) {
        impostorBlocked = true;
      }
    }
    assert.ok(impostorBlocked, 'Unassigned doctor must be blocked from modifying clinical evaluation');
    console.log('  ✓ Cross-doctor clinical note tampering rejected with 403 ACCESS_DENIED.');

    // 2. Patient attempts to author their own clinical evaluation
    let patientBlocked = false;
    try {
      await appointmentSafetyService.recordDoctorClinicalEvaluation(db, {
        appointmentId: appt.id,
        diagnosis: 'Self diagnosis',
        clinicalNotes: 'Patient clinical notes'
      }, patientUser);
    } catch (err) {
      if (err.code === 'CLINICIAN_ROLE_REQUIRED' && err.statusCode === 403) {
        patientBlocked = true;
      }
    }
    assert.ok(patientBlocked, 'Patient cannot invoke clinical evaluation API');
    console.log('  ✓ Patient barred from clinical evaluation authoring (HTTP 403 CLINICIAN_ROLE_REQUIRED).');

    // 3. Attending physician records verified clinical diagnosis and prescriptions
    const evalResult = await appointmentSafetyService.recordDoctorClinicalEvaluation(db, {
      appointmentId: appt.id,
      diagnosis: 'حساسية شعبية موسمية متوسطة (Moderate Allergic Bronchial Asthma)',
      icd10Code: 'J45.40',
      prescriptions: [
        { drug: 'Symbicort 160/4.5', dose: '1 inhalation twice daily', duration: '30 days' },
        { drug: 'Desloratadine 5mg', dose: '1 tablet at bedtime', duration: '14 days' }
      ],
      clinicalNotes: 'تم فحص الصدر بالسماعة: وجود تزييق خفيف منتشر. نسبة الأكسجين 98%. استجابة ممتازة لموسعات الشعب.',
      treatmentPlan: 'تجنب الأتربة والروائح النفاذة. مراجعة العيادة بعد شهر أو فور حدوث أي ضيق تنفس حاد.',
      followUpDate: '2026-11-19',
      status: 'completed'
    }, attendingDoctor);

    assert.strictEqual(evalResult.success, true);
    assert.strictEqual(evalResult.clinicalEvaluation.doctorUid, 'dr_mona');
    assert.strictEqual(evalResult.clinicalEvaluation.doctorLicense, 'EGY-MED-449102');
    assert.strictEqual(evalResult.clinicalEvaluation.prescriptions.length, 2);
    assert.ok(evalResult.clinicalEvaluation.statutoryDisclaimer.includes('123'));

    // Check appointment document in database
    const updatedSnap = await db.collection('appointments').doc(appt.id).get();
    const updatedData = updatedSnap.data();
    assert.strictEqual(updatedData.status, 'completed');
    assert.strictEqual(updatedData.diagnosis, 'حساسية شعبية موسمية متوسطة (Moderate Allergic Bronchial Asthma)');
    assert.strictEqual(updatedData.evaluatedByDoctorId, 'dr_mona');
    assert.ok(updatedData.history.some(h => h.action === 'PHYSICIAN_CLINICAL_EVALUATION'));
    console.log('  ✓ Human physician evaluation recorded with verifiable license EGY-MED-449102 & completed status.');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 4: Calendar Strip Slot Anonymization & Patient Privacy Protection
  // --------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Interactive Calendar Strip Privacy & Zero-PII Leakage');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const patientAlice = { uid: 'user_alice_secret', role: 'patient', email: 'alice@secret.com' };
    const patientBob = { uid: 'user_bob_viewer', role: 'patient', email: 'bob@viewer.com' };

    // Alice books an appointment containing sensitive personal and clinical data
    const aliceAppt = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_1000',
      patientName: 'سارة عبد الرحمن',
      patientEmail: 'sarah.private@example.com',
      patientPhone: '+201009876543',
      beneficiaryName: 'والدتي المريضة',
      symptoms: 'اشتباه حساسية صدرية مع كحة ليلية مستمرة'
    }, patientAlice);

    // 1. Bob views the calendar range (as a browsing patient)
    const bobCalendar = await schedulingService.getDoctorCalendarRange(db, {
      doctorId: 'dr_mona',
      startDate: targetDate,
      daysCount: 1
    }, patientBob);

    const targetDay = bobCalendar.days[0];
    const bookedSlotForBob = targetDay.morningSlots.find(s => s.id === 'slot_1000');

    assert.ok(bookedSlotForBob, 'Booked slot must exist in the calendar');
    assert.strictEqual(bookedSlotForBob.isBooked, true);
    assert.strictEqual(bookedSlotForBob.status, 'booked');

    // Strict privacy verification: Zero leakage of Alice's PII to Bob
    assert.strictEqual(bookedSlotForBob.patientName, null, 'patientName must be null for other patients');
    assert.strictEqual(bookedSlotForBob.patientId, null, 'patientId must be null for other patients');
    assert.strictEqual(bookedSlotForBob.patientEmail, null, 'patientEmail must be null for other patients');
    assert.strictEqual(bookedSlotForBob.patientPhone, null, 'patientPhone must be null for other patients');
    assert.strictEqual(bookedSlotForBob.beneficiaryName, null, 'beneficiaryName must be null for other patients');
    assert.strictEqual(bookedSlotForBob.symptoms, null, 'symptoms must be null for other patients');
    assert.strictEqual(bookedSlotForBob.appointmentId, null, 'appointmentId must be null for other patients');
    console.log('  ✓ Patient Bob browsing calendar receives anonymized slot (status: booked, 0% PII leakage).');

    // 2. An unauthenticated public web visitor views getDoctorCalendar
    const publicCal = await schedulingService.getDoctorCalendar(db, {
      doctorId: 'dr_mona',
      startDate: targetDate,
      endDate: targetDate
    }, null);

    const pubDay = publicCal.days[0];
    const pubBookedSlot = pubDay.slots.find(s => s.id === 'slot_1000');
    assert.strictEqual(pubBookedSlot.isBooked, true);
    assert.strictEqual(pubBookedSlot.patientName, null);
    assert.strictEqual(pubBookedSlot.patientId, null);
    console.log('  ✓ Unauthenticated public visitor receives strictly anonymized slot representations.');

    // 3. Dr. Mona (assigned physician) views internal calendar
    const doctorCal = await schedulingService.getDoctorCalendar(db, {
      doctorId: 'dr_mona',
      startDate: targetDate,
      endDate: targetDate
    }, { uid: 'dr_mona', role: 'doctor' });

    const docDay = doctorCal.days[0];
    const docBookedSlot = docDay.slots.find(s => s.id === 'slot_1000');
    assert.strictEqual(docBookedSlot.isBooked, true);
    assert.strictEqual(docBookedSlot.patientName, 'سارة عبد الرحمن');
    console.log('  ✓ Assigned physician Dr. Mona securely accesses patient intake name for clinical preparation.');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 5: Family Beneficiary Access Control & Isolation
  // --------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Family Beneficiary Access Control & Impersonation Defense');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const primaryPatient = { uid: 'parent_user_10', role: 'patient', email: 'parent@healthvibe.ai' };

    // Mock in-memory family store for parent_user_10 with authorized dependent: child_salma
    const mockFamilyStore = new Map();
    mockFamilyStore.set('parent_user_10', [
      {
        id: 'child_salma',
        fullName: 'سلمى أحمد',
        relationship: 'daughter',
        dateOfBirth: '2018-05-10',
        biologicalSex: 'female'
      }
    ]);

    // 1. Patient attempts to book for an unauthorized third-party beneficiary ID
    let unauthorizedBeneficiaryBlocked = false;
    try {
      await schedulingService.bookAppointmentTransaction(db, {
        doctorId: 'dr_mona',
        date: targetDate,
        slotId: 'slot_1830',
        beneficiaryId: 'stranger_patient_99',
        _inMemoryStore: mockFamilyStore
      }, primaryPatient);
    } catch (err) {
      if (err.code === 'UNAUTHORIZED_BENEFICIARY' && err.statusCode === 403) {
        unauthorizedBeneficiaryBlocked = true;
      }
    }
    assert.ok(unauthorizedBeneficiaryBlocked, 'Unauthorized beneficiary booking must be rejected with 403');
    console.log('  ✓ Unauthorized dependent booking strictly rejected (HTTP 403 UNAUTHORIZED_BENEFICIARY).');

    // 2. Patient books for their authorized family member 'child_salma'
    const familyBooking = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_1830',
      beneficiaryId: 'child_salma',
      reasonForVisit: 'متابعة حساسية الصدر لابنتي',
      _inMemoryStore: mockFamilyStore
    }, primaryPatient);

    assert.strictEqual(familyBooking.status, 'confirmed');
    assert.strictEqual(familyBooking.beneficiaryId, 'child_salma');
    assert.strictEqual(familyBooking.beneficiaryName, 'سلمى أحمد');
    assert.strictEqual(familyBooking.beneficiaryRelationship, 'daughter');
    console.log('  ✓ Authorized dependent booking verified and linked to verified family account.');
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 6: Completion Role Guard & Autonomous Script Protection
  // --------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Completion Role Guard (Anti-AI Autonomous Discharge)');
  {
    const db = createMockDb();
    schedulingService.clearMemorySlotLocks();

    const patientUser = { uid: 'patient_simple', role: 'patient' };
    const doctorUser = { uid: 'dr_mona', role: 'doctor' };

    const appt = await schedulingService.bookAppointmentTransaction(db, {
      doctorId: 'dr_mona',
      date: targetDate,
      slotId: 'slot_2000',
      reasonForVisit: 'استشارة مسائية'
    }, patientUser);

    // 1. Patient or non-doctor attempts to mark appointment completed
    let patientCompletionBlocked = false;
    try {
      await schedulingService.updateAppointmentStatusTransaction(db, {
        appointmentId: appt.id,
        status: 'completed',
        notes: 'Patient marked self as completed'
      }, patientUser);
    } catch (err) {
      if (err.code === 'ACCESS_DENIED' && err.statusCode === 403) {
        patientCompletionBlocked = true;
      }
    }
    assert.ok(patientCompletionBlocked, 'Patients cannot mark appointments completed');
    console.log('  ✓ Non-clinician status completion attempt rejected with 403 ACCESS_DENIED.');

    // 2. Assigned doctor marks appointment completed with mandatory clinical notes
    const completedAppt = await schedulingService.updateAppointmentStatusTransaction(db, {
      appointmentId: appt.id,
      status: 'completed',
      notes: 'تمت الاستشارة السريرية واعتماد خطة العلاج الدوائي'
    }, doctorUser);

    assert.strictEqual(completedAppt.status, 'completed');
    assert.strictEqual(completedAppt.statusUpdatedBy, 'dr_mona');
    assert.ok(completedAppt.completedAt);
    console.log('  ✓ Attending physician successfully completes appointment with clinical notes.');
    passed++;
  }

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passed} APPOINTMENT SAFETY, MEDICAL PRIVACY & PHYSICIAN PRIMACY TESTS PASSED (100% GREEN)!`);
  console.log('================================================================================\n');
}

runSafetyAndPrivacyTestSuite().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
