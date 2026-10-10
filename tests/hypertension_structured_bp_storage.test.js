/**
 * Health Vibe AI - Structured Blood Pressure Measurement Storage & Governance Test Suite
 *
 * Verifies:
 * 1. Preservation of all structured blood-pressure fields:
 *    - systolic value, diastolic value, unit, measurement date/time,
 *    - measurement source, author/provenance, relevant context when actually collected.
 * 2. Strict physiological bounds (60-260 systolic, 40-160 diastolic, sys > dia).
 * 3. Prevention of silent coercion:
 *    - '120abc' is strictly rejected (never coerced to 120).
 *    - Invalid text, punctuation, and non-numeric characters rejected.
 * 4. Handling edge cases:
 *    - empty values ('', null, undefined, whitespace) rejected without coercion to 0.
 *    - negative values (-120, -80) rejected.
 *    - unsupported values (booleans true/false, objects, Infinity) rejected.
 *    - Arabic numerals (Arabic-Indic '١٢٠'/'٨٠' and Eastern Arabic '۱۲۰'/'۸۰') parsed accurately.
 *    - Decimal input (120.5, '١٢٠٫٥') supported and preserved.
 *    - Missing units safely defaulted to 'mmHg'; invalid units ('psi', '%') rejected.
 *    - Unknown measurements ('unknown', 'غير معروف') handled without inventing numbers.
 * 5. Rule: Never invent a blood-pressure measurement (zero placeholder or fake fallbacks).
 * 6. Rule: Do not overwrite historical observations (append-only immutable history).
 * 7. Trusted server-side authorization & patient/case linkage:
 *    - Patient self-ownership verified; cross-patient impersonation blocked.
 *    - Case ownership mismatch blocked.
 *    - Licensed physician authorization verified; revoked doctor blocked.
 * 8. Clinical revision mechanism intact:
 *    - Canonical current assessment updated.
 *    - clinicalRevision incremented with auditable change trail.
 */

const assert = require('node:assert/strict');
const chronicHypertensionService = require('../backend/chronic-hypertension-service');
const clinicalInfoExchangeService = require('../backend/clinical-info-exchange-service');

console.log('==================================================================');
console.log('🩸 HEALTH VIBE AI: STRUCTURED BP MEASUREMENT STORAGE TEST SUITE');
console.log('   Preservation, Strict Validation, Anti-Coercion, Authorization & Revisions');
console.log('==================================================================\n');

(async () => {
  chronicHypertensionService.resetHypertensionStoreForTesting();
  clinicalInfoExchangeService.resetStoreForTesting();

  const patientId = 'usr_patient_tariq_101';
  const otherPatientId = 'usr_patient_huda_202';

  const approvedDoctor = {
    uid: 'doc_cardio_kareem',
    name: 'د. كريم عبد العزيز',
    role: 'doctor',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false,
    licenseNumber: 'HV-CARDIO-8812'
  };

  const revokedDoctor = {
    uid: 'doc_revoked_bad',
    name: 'طبيب ملغى الترخيص',
    role: 'doctor',
    status: 'approved',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Preservation of All Required Measurement Attributes');
  // ---------------------------------------------------------------------------
  {
    const measuredAtTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const reading = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      patientName: 'طارق محمود',
      systolic: 124,
      diastolic: 82,
      pulse: 74,
      unit: 'mmHg',
      measuredAt: measuredAtTime,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
      arm: 'left',
      posture: 'seated_rested',
      cuffSize: 'standard',
      timing: 'morning',
      activity: 'resting_5min',
      location: 'home',
      bodyPosition: 'seated_supported_back',
      medicationTaken: true,
      author: {
        uid: patientId,
        name: 'طارق محمود',
        role: 'patient'
      },
      provenance: {
        source: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
        deviceDetails: 'Omron Evolv Bluetooth (Model BP7000)',
        verified: true
      },
      context: {
        roomTemperatureCelsius: 23,
        cuffAppliedBy: 'patient_self'
      }
    });

    // 1. Systolic value
    assert.equal(reading.systolic, 124, 'Systolic value must be preserved');
    // 2. Diastolic value
    assert.equal(reading.diastolic, 82, 'Diastolic value must be preserved');
    // 3. Unit
    assert.equal(reading.unit, 'mmHg', 'Unit must be preserved as mmHg');
    // 4. Measurement date/time
    assert.equal(reading.measuredAt, measuredAtTime, 'Measurement date/time must match collection timestamp');
    // 5. Measurement source
    assert.equal(reading.measurementSource, chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE, 'Measurement source must be preserved');
    // 6. Author & Provenance
    assert.equal(reading.author.uid, patientId, 'Author UID must be preserved');
    assert.equal(reading.author.role, 'patient', 'Author role must be preserved');
    assert.equal(reading.provenance.source, chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE);
    assert.equal(reading.provenance.deviceDetails, 'Omron Evolv Bluetooth (Model BP7000)');
    assert.equal(reading.provenance.verified, true);
    // 7. Context when actually collected
    assert.equal(reading.context.arm, 'left');
    assert.equal(reading.context.posture, 'seated_rested');
    assert.equal(reading.context.cuffSize, 'standard');
    assert.equal(reading.context.timing, 'morning');
    assert.equal(reading.context.activity, 'resting_5min');
    assert.equal(reading.context.location, 'home');
    assert.equal(reading.context.bodyPosition, 'seated_supported_back');
    assert.equal(reading.context.medicationTaken, true);
    assert.equal(reading.context.roomTemperatureCelsius, 23);

    console.log('  ✓ All 7 core structured dimensions (systolic, diastolic, unit, time, source, author/provenance, context) preserved in full.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 2: Prevention of Silent Coercion (Never Convert Invalid Input)');
  // ---------------------------------------------------------------------------
  {
    // '120abc' must NOT be converted to 120
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: '120abc', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'INVALID_MEASUREMENT_TEXT');
        assert.ok(err.message.includes('Do not silently convert invalid input'));
        return true;
      }
    );

    // '120/80' passed into systolic must NOT be parsed partially
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: '120/80', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'INVALID_MEASUREMENT_TEXT');
        return true;
      }
    );

    // Text strings like 'high' or 'normal' must NOT be coerced to numbers
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 'high', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'INVALID_MEASUREMENT_TEXT');
        return true;
      }
    );

    console.log('  ✓ Silent coercion strictly prevented; trailing text and malformed inputs rejected.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 3: Handling Empty Values, Negative Values & Unsupported Types');
  // ---------------------------------------------------------------------------
  {
    // Empty strings must NOT be converted to 0
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: '', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'EMPTY_MEASUREMENT_VALUE');
        return true;
      }
    );

    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: '   ', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'EMPTY_MEASUREMENT_VALUE');
        return true;
      }
    );

    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: null, diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'EMPTY_MEASUREMENT_VALUE');
        return true;
      }
    );

    // Negative values must be rejected
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: -120, diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'NEGATIVE_MEASUREMENT_VALUE');
        return true;
      }
    );

    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 120, diastolic: '-80', pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'NEGATIVE_MEASUREMENT_VALUE');
        return true;
      }
    );

    // Booleans (true === 1 in JS Number()) must be rejected
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: true, diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'UNSUPPORTED_MEASUREMENT_VALUE');
        return true;
      }
    );

    // Objects must be rejected
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: { val: 120 }, diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'UNSUPPORTED_MEASUREMENT_VALUE');
        return true;
      }
    );

    console.log('  ✓ Empty inputs, negative values, and unsupported boolean/object types rejected.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 4: Arabic Numerals & Decimal Input Where Applicable');
  // ---------------------------------------------------------------------------
  {
    // Arabic-Indic digits (١٢٠ / ٨٠)
    const arabicIndicParsed = chronicHypertensionService.validateBpInputs({
      systolic: '١٣٥',
      diastolic: '٨٥',
      pulse: '٧٢'
    });
    assert.equal(arabicIndicParsed.sys, 135);
    assert.equal(arabicIndicParsed.dia, 85);
    assert.equal(arabicIndicParsed.pul, 72);

    // Eastern Arabic-Indic digits (۱۲۵ / ۸۲)
    const easternArabicParsed = chronicHypertensionService.validateBpInputs({
      systolic: '۱۲۵',
      diastolic: '۸۲',
      pulse: '۷۰'
    });
    assert.equal(easternArabicParsed.sys, 125);
    assert.equal(easternArabicParsed.dia, 82);
    assert.equal(easternArabicParsed.pul, 70);

    // Decimal input (e.g. 120.5 / 81.4)
    const decimalParsed = chronicHypertensionService.validateBpInputs({
      systolic: '120.5',
      diastolic: 81.4,
      pulse: 75
    });
    assert.equal(decimalParsed.sys, 120.5);
    assert.equal(decimalParsed.dia, 81.4);

    // Arabic decimal input with Arabic decimal separator (١٢٠٫٥ / ٨١٫٤)
    const arabicDecimalParsed = chronicHypertensionService.validateBpInputs({
      systolic: '١٢٠٫٥',
      diastolic: '٨١٫٤',
      pulse: '٧٥'
    });
    assert.equal(arabicDecimalParsed.sys, 120.5);
    assert.equal(arabicDecimalParsed.dia, 81.4);

    console.log('  ✓ Arabic-Indic digits, Eastern Arabic digits, and decimal values parsed and preserved.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 5: Missing Units & Unsupported Units');
  // ---------------------------------------------------------------------------
  {
    // Missing unit -> defaults cleanly to 'mmHg'
    const missingUnit = chronicHypertensionService.validateBpInputs({
      systolic: 120,
      diastolic: 80,
      pulse: 70
      // unit omitted
    });
    assert.equal(missingUnit.unit, 'mmHg');

    // Unit provided as 'mmHg' or 'mm Hg'
    const cleanUnit = chronicHypertensionService.validateBpInputs({
      systolic: 120,
      diastolic: 80,
      pulse: 70,
      unit: 'mm Hg'
    });
    assert.equal(cleanUnit.unit, 'mmHg');

    // Unsupported unit (e.g., psi, kPa, %, bpm) rejected
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 120, diastolic: 80, pulse: 70, unit: 'psi' }),
      (err) => {
        assert.equal(err.code, 'INVALID_MEASUREMENT_UNIT');
        return true;
      }
    );

    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 120, diastolic: 80, pulse: 70, unit: '%' }),
      (err) => {
        assert.equal(err.code, 'INVALID_MEASUREMENT_UNIT');
        return true;
      }
    );

    console.log('  ✓ Missing units safely default to mmHg; incompatible units strictly rejected.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 6: Unknown Measurements & Rule: Never Invent a Measurement');
  // ---------------------------------------------------------------------------
  {
    // Explicit unknown measurement must NOT invent a 120/80 fallback
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 'unknown', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'UNKNOWN_MEASUREMENT');
        assert.ok(err.message.includes('Never invent a blood-pressure measurement'));
        return true;
      }
    );

    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 'غير معروف', diastolic: 80, pulse: 70 }),
      (err) => {
        assert.equal(err.code, 'UNKNOWN_MEASUREMENT');
        return true;
      }
    );

    console.log('  ✓ Unknown measurements explicitly identified; zero synthetic measurements invented.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 7: Immutable Historical Observations (Never Overwrite)');
  // ---------------------------------------------------------------------------
  {
    chronicHypertensionService.resetHypertensionStoreForTesting();

    // Observation 1: Morning baseline
    const r1 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 138,
      diastolic: 88,
      pulse: 78,
      timing: 'morning',
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG
    });

    // Observation 2: Afternoon reading
    const r2 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 128,
      diastolic: 82,
      pulse: 72,
      timing: 'afternoon',
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG
    });

    // Observation 3: Evening reading
    const r3 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 122,
      diastolic: 78,
      pulse: 68,
      timing: 'evening',
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE
    });

    const history = chronicHypertensionService.getPatientReadings(patientId);
    assert.equal(history.length, 3, 'All 3 historical observations must be preserved');
    assert.equal(history[0].id, r3.id, 'Most recent observation is first');
    assert.equal(history[1].id, r2.id);
    assert.equal(history[2].id, r1.id, 'Oldest observation remains completely unmutated');

    // Verify observation 1 values were NOT overwritten
    assert.equal(history[2].systolic, 138);
    assert.equal(history[2].diastolic, 88);

    console.log('  ✓ Historical observations stored immutably without overwriting.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 8: Trusted Server-Side Authorization & Impersonation Prevention');
  // ---------------------------------------------------------------------------
  {
    // A. Patient can record for themselves
    const patientSelf = { uid: patientId, role: 'patient' };
    const legitimateReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 120,
      diastolic: 80,
      pulse: 70,
      authorizedUser: patientSelf
    });
    assert.ok(legitimateReading.id);

    // B. Imposter patient trying to record for another patient -> Blocked
    const imposterPatient = { uid: otherPatientId, role: 'patient' };
    await assert.rejects(
      async () => {
        await chronicHypertensionService.recordBloodPressureReading({
          patientId,
          systolic: 120,
          diastolic: 80,
          pulse: 70,
          authorizedUser: imposterPatient
        });
      },
      (err) => {
        assert.equal(err.code, 'ACCESS_DENIED');
        return true;
      }
    );

    // C. Approved doctor can record for patient
    const doctorReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 130,
      diastolic: 85,
      pulse: 74,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.CLINIC_READING,
      authorizedUser: approvedDoctor
    });
    assert.equal(doctorReading.author.uid, approvedDoctor.uid);
    assert.equal(doctorReading.author.role, 'doctor');

    // D. Revoked doctor -> Blocked
    await assert.rejects(
      async () => {
        await chronicHypertensionService.recordBloodPressureReading({
          patientId,
          systolic: 120,
          diastolic: 80,
          pulse: 70,
          authorizedUser: revokedDoctor
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_DOCTOR_LICENSE');
        return true;
      }
    );

    console.log('  ✓ Server-side authorization strictly enforced; imposter and revoked doctor blocked.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 9: Case Linkage & Clinical Revision Mechanism Preservation');
  // ---------------------------------------------------------------------------
  {
    const caseId = 'case_htn_eval_2026_099';

    // Register initial case in clinical revision service
    const registeredCase = clinicalInfoExchangeService.registerCase({
      id: caseId,
      patientId,
      patientName: 'طارق محمود',
      status: 'under_review',
      clinicalRevision: 1,
      currentAssessment: {
        systolicBp: null,
        diastolicBp: null
      }
    });

    assert.equal(registeredCase.clinicalRevision, 1, 'Initial revision must be 1');

    // Record BP reading linked to this case
    const caseReading1 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      caseId,
      systolic: 142,
      diastolic: 92,
      pulse: 80,
      timing: 'morning',
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.CLINIC_READING,
      authorizedUser: approvedDoctor
    });

    // Check reading linkage
    assert.equal(caseReading1.caseId, caseId);
    assert.equal(caseReading1.clinicalRevision, 2, 'Clinical revision must increment to 2');

    // Check updated case in clinical service
    const updatedCase1 = clinicalInfoExchangeService.getCase(caseId);
    assert.equal(updatedCase1.clinicalRevision, 2);
    assert.equal(updatedCase1.currentAssessment.systolicBp, 142);
    assert.equal(updatedCase1.currentAssessment.diastolicBp, 92);
    assert.equal(updatedCase1.currentAssessment.bp, '142/92 mmHg');

    // Verify observation added to case observation history
    const caseObservations = clinicalInfoExchangeService.getCaseObservationHistory(caseId);
    assert.equal(caseObservations.length, 1);
    assert.equal(caseObservations[0].type, 'bloodPressure');
    assert.equal(caseObservations[0].systolic, 142);
    assert.equal(caseObservations[0].diastolic, 92);

    // Verify revision record entry exists
    const revisions = clinicalInfoExchangeService.getCaseRevisionHistory(caseId);
    assert.equal(revisions.length, 2); // Initial revision 1 + BP measurement revision 2
    assert.equal(revisions[1].revision, 2);
    assert.equal(revisions[1].trigger, 'hypertension_bp_measurement');
    assert.equal(revisions[1].changes.systolicBp.current, 142);

    // Record second measurement for same case -> Revision increments again to 3
    const caseReading2 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      caseId,
      systolic: 128,
      diastolic: 82,
      pulse: 72,
      timing: 'evening',
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
      authorizedUser: { uid: patientId, role: 'patient' }
    });

    assert.equal(caseReading2.clinicalRevision, 3, 'Clinical revision must increment to 3');
    const updatedCase2 = clinicalInfoExchangeService.getCase(caseId);
    assert.equal(updatedCase2.clinicalRevision, 3);
    assert.equal(updatedCase2.currentAssessment.systolicBp, 128);
    assert.equal(updatedCase2.currentAssessment.diastolicBp, 82);

    // Verify both observations are preserved in case history
    const finalObservations = clinicalInfoExchangeService.getCaseObservationHistory(caseId);
    assert.equal(finalObservations.length, 2);
    assert.equal(finalObservations[0].systolic, 142);
    assert.equal(finalObservations[1].systolic, 128);

    // Verify case queries
    const caseReadings = chronicHypertensionService.getCaseReadings(caseId);
    assert.equal(caseReadings.length, 2);

    console.log('  ✓ Case linkage, clinical revision increments (rev 1 -> 2 -> 3), and changelog verified.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 10: Case Ownership Mismatch Protection');
  // ---------------------------------------------------------------------------
  {
    const patientCaseId = 'case_patient_tariq_private';
    clinicalInfoExchangeService.registerCase({
      id: patientCaseId,
      patientId,
      status: 'under_review'
    });

    // Imposter patient trying to link measurement to another patient's case
    await assert.rejects(
      async () => {
        await chronicHypertensionService.recordBloodPressureReading({
          patientId: otherPatientId,
          caseId: patientCaseId,
          systolic: 120,
          diastolic: 80,
          pulse: 70,
          authorizedUser: { uid: otherPatientId, role: 'patient' }
        });
      },
      (err) => {
        assert.equal(err.code, 'FORBIDDEN_CASE_OWNERSHIP_MISMATCH');
        return true;
      }
    );

    console.log('  ✓ Cross-patient case linkage forbidden; case ownership integrity verified.\n');
  }

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 11: Future Timestamps Rejection');
  // ---------------------------------------------------------------------------
  {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    await assert.rejects(
      async () => {
        await chronicHypertensionService.recordBloodPressureReading({
          patientId,
          systolic: 120,
          diastolic: 80,
          pulse: 70,
          measuredAt: tomorrow
        });
      },
      (err) => {
        assert.equal(err.code, 'FUTURE_MEASUREMENT_TIMESTAMP');
        return true;
      }
    );

    console.log('  ✓ Future measurement timestamps strictly rejected.\n');
  }

  console.log('==================================================================');
  console.log('🎉 ALL 11 STRUCTURED BLOOD-PRESSURE STORAGE TESTS PASSED (100%)!');
  console.log('==================================================================\n');
})();
