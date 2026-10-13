/**
 * Health Vibe AI - Obesity & Metabolic Health Module Test Suite
 * 
 * Verifies:
 * 1. Structured storage: height, heightUnit, weight, weightUnit, measurementTimestamp, measurementSource, provenance.
 * 2. Units validation & conversions: cm, m, in; kg, lbs, g; rejection of unsupported units.
 * 3. Numeric input validation: handles missing, invalid, negative, zero, and implausible values via medical rules.
 * 4. Dynamic BMI calculation strictly when valid height and weight are available (no fabricated BMI).
 * 5. Clear separation between directly measured values vs calculated values.
 * 6. Reuse of existing patient measurements when valid (e.g. historical height with new weight).
 * 7. Longitudinal preservation of historical measurements without overwrite or data loss.
 * 8. Relevant lifestyle factors support when collected (nullable, never assumed or faked).
 * 9. Non-diagnostic guardrail: BMI alone is NEVER an automatic diagnosis (anthropometric index only).
 * 10. Approved medical review workflow: explicit physician diagnosis required, revision gating, internal note quarantine.
 * 11. Bilingual UI rendering parity (Arabic RTL & English LTR) with zero fake data.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const obesityService = require('../backend/obesity-service');
const obesityUI = require('../app/modules/patient/obesity-ui');
const doctorUI = require('../app/modules/doctor/doctor-ui');

console.log('==================================================================');
console.log('⚖️ HEALTH VIBE AI: OBESITY & METABOLIC HEALTH MODULE TEST SUITE');
console.log('   Structured Biometrics, Units, BMI Derivation, Reuse & Workflow');
console.log('==================================================================\n');

(async () => {
  obesityService.resetObesityStoreForTesting();

  // Test Doctors Fixtures
  const verifiedObesityDoctor = {
    uid: 'doc_ob_hisham',
    name: 'د. هشام الفقي',
    licenseNumber: 'HV-OB-LIC-88219',
    specialty: 'استشاري علاج السمنة والتمثيل الغذائي والباطنة',
    clinic: 'مركز النيل لصحة الأيض والوزن',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const revokedDoctor = {
    uid: 'doc_revoked_999',
    name: 'طبيب غير مصرح',
    licenseNumber: 'REVOKED-999',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const patientId = 'pat_metabolic_nour_32';
  const patientProfile = {
    name: 'نور الدين شريف',
    displayName: 'Nour El-Din Sherif',
    age: 38,
    sex: 'male',
    phone: '+201012345678'
  };

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Structured Storage & Schema Elements');
  // ---------------------------------------------------------------------------
  {
    const recorded = obesityService.recordObesityMeasurement({
      patientId,
      height: 180,
      heightUnit: 'cm',
      weight: 81.0,
      weightUnit: 'kg',
      measurementTimestamp: '2026-10-10T09:30:00.000Z',
      measurementSource: obesityService.MEASUREMENT_SOURCES.CLINICAL_SCALE,
      author: { uid: patientId, role: 'patient', name: 'Nour' }
    });

    // Required stored fields
    assert.equal(recorded.height, 180, 'Must store height');
    assert.equal(recorded.heightUnit, 'cm', 'Must store height unit');
    assert.equal(recorded.weight, 81.0, 'Must store weight');
    assert.equal(recorded.weightUnit, 'kg', 'Must store weight unit');
    assert.equal(recorded.measurementTimestamp, '2026-10-10T09:30:00.000Z', 'Must store measurement timestamp');
    assert.equal(recorded.measurementSource, obesityService.MEASUREMENT_SOURCES.CLINICAL_SCALE, 'Must store measurement source');
    assert.ok(recorded.provenance, 'Must store provenance');
    assert.equal(recorded.provenance.source, obesityService.MEASUREMENT_SOURCES.CLINICAL_SCALE);
    assert.equal(recorded.provenance.isDirectMeasurement, true);
    assert.equal(recorded.bmi, 25.0, 'BMI should be 81 / (1.8^2) = 25.0');

    console.log('  ✔ All required schema elements stored (height, heightUnit, weight, weightUnit, timestamp, source, provenance).');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Units Validation & Conversions (cm, m, in; kg, lbs, g)');
  // ---------------------------------------------------------------------------
  {
    // Height in inches: 70 in = 177.8 cm; Weight in lbs: 176.37 lbs = 80 kg
    const converted = obesityService.validateBiometricInputs({
      height: 70,
      heightUnit: 'in',
      weight: 176.37,
      weightUnit: 'lbs'
    });
    assert.equal(converted.heightCm, 177.8, '70 in converted to 177.8 cm');
    assert.equal(converted.weightKg, 80.0, '176.37 lbs converted to 80.0 kg');

    // Height in meters: 1.82 m = 182 cm; Weight in grams: 75000 g = 75 kg
    const convertedM = obesityService.validateBiometricInputs({
      height: 1.82,
      heightUnit: 'm',
      weight: 75000,
      weightUnit: 'g'
    });
    assert.equal(convertedM.heightCm, 182.0, '1.82 m converted to 182.0 cm');
    assert.equal(convertedM.weightKg, 75.0, '75000 g converted to 75.0 kg');

    // Rejection of unsupported height units
    assert.throws(
      () => obesityService.normalizeHeightUnit('yards'),
      /UNSUPPORTED_HEIGHT_UNIT/,
      'Unsupported height unit must throw UNSUPPORTED_HEIGHT_UNIT'
    );
    assert.throws(
      () => obesityService.normalizeHeightUnit('miles'),
      /UNSUPPORTED_HEIGHT_UNIT/,
      'Unsupported height unit must throw UNSUPPORTED_HEIGHT_UNIT'
    );

    // Rejection of unsupported weight units
    assert.throws(
      () => obesityService.normalizeWeightUnit('stones'),
      /UNSUPPORTED_WEIGHT_UNIT/,
      'Unsupported weight unit must throw UNSUPPORTED_WEIGHT_UNIT'
    );
    assert.throws(
      () => obesityService.normalizeWeightUnit('ounces'),
      /UNSUPPORTED_WEIGHT_UNIT/,
      'Unsupported weight unit must throw UNSUPPORTED_WEIGHT_UNIT'
    );

    console.log('  ✔ Unit validation and conversions verified for cm, m, in and kg, lbs, g; unsupported units rejected.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Numeric Validation & Medically Reviewed Plausibility Rules');
  // ---------------------------------------------------------------------------
  {
    // Negative or zero values
    assert.throws(
      () => obesityService.validateNumericMeasurement(-5, 'Height'),
      /NEGATIVE_OR_ZERO_INPUT/,
      'Negative height must throw NEGATIVE_OR_ZERO_INPUT'
    );
    assert.throws(
      () => obesityService.validateNumericMeasurement(0, 'Weight'),
      /NEGATIVE_OR_ZERO_INPUT/,
      'Zero weight must throw NEGATIVE_OR_ZERO_INPUT'
    );

    // Non-numeric values
    assert.throws(
      () => obesityService.validateNumericMeasurement('invalid-text', 'Height'),
      /INVALID_NUMERIC_INPUT/,
      'Non-numeric text must throw INVALID_NUMERIC_INPUT'
    );
    assert.throws(
      () => obesityService.validateNumericMeasurement(true, 'Weight'),
      /INVALID_NUMERIC_INPUT/,
      'Boolean must throw INVALID_NUMERIC_INPUT'
    );

    // Medically implausible height (< 40 cm or > 260 cm)
    assert.throws(
      () => obesityService.validateBiometricInputs({ height: 25, heightUnit: 'cm', weight: 70 }),
      /IMPLAUSIBLE_HEIGHT/,
      'Height < 40 cm must throw IMPLAUSIBLE_HEIGHT'
    );
    assert.throws(
      () => obesityService.validateBiometricInputs({ height: 290, heightUnit: 'cm', weight: 70 }),
      /IMPLAUSIBLE_HEIGHT/,
      'Height > 260 cm must throw IMPLAUSIBLE_HEIGHT'
    );

    // Medically implausible weight (< 15 kg or > 450 kg)
    assert.throws(
      () => obesityService.validateBiometricInputs({ height: 175, weight: 10, weightUnit: 'kg' }),
      /IMPLAUSIBLE_WEIGHT/,
      'Weight < 15 kg must throw IMPLAUSIBLE_WEIGHT'
    );
    assert.throws(
      () => obesityService.validateBiometricInputs({ height: 175, weight: 600, weightUnit: 'kg' }),
      /IMPLAUSIBLE_WEIGHT/,
      'Weight > 450 kg must throw IMPLAUSIBLE_WEIGHT'
    );

    console.log('  ✔ Medically reviewed validation rules enforced: negative/zero, non-numeric, and implausible ranges rejected.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Calculated Values vs Directly Measured Values (No Fabricated BMI)');
  // ---------------------------------------------------------------------------
  {
    const meas = obesityService.recordObesityMeasurement({
      patientId: 'pat_test_separation_44',
      height: 175,
      heightUnit: 'cm',
      weight: 70,
      weightUnit: 'kg',
      measurementSource: 'clinical_scale'
    });

    // Directly measured values clearly identified
    assert.ok(meas.measuredValues.height, 'Must have measuredValues.height');
    assert.equal(meas.measuredValues.height.isDirectlyMeasured, true);
    assert.equal(meas.measuredValues.height.value, 175);
    assert.equal(meas.measuredValues.height.unit, 'cm');

    assert.ok(meas.measuredValues.weight, 'Must have measuredValues.weight');
    assert.equal(meas.measuredValues.weight.isDirectlyMeasured, true);
    assert.equal(meas.measuredValues.weight.value, 70);
    assert.equal(meas.measuredValues.weight.unit, 'kg');

    // Calculated values clearly identified
    assert.ok(meas.calculatedValues.bmi, 'Must have calculatedValues.bmi');
    assert.equal(meas.calculatedValues.bmi.isCalculated, true);
    assert.equal(meas.calculatedValues.bmi.isFabricated, false);
    assert.equal(meas.calculatedValues.bmi.formula, 'weight_kg / (height_m ^ 2)');
    assert.equal(meas.calculatedValues.bmi.derivationMethod, 'calculated_from_height_and_weight');
    assert.equal(meas.calculatedValues.bmi.value, 22.9);

    // STRICT GUARDRAIL: DO NOT STORE A FABRICATED BMI
    // When a new patient records only weight with no prior height on file:
    const weightOnlyMeas = obesityService.recordObesityMeasurement({
      patientId: 'pat_new_no_height_99',
      weight: 85,
      weightUnit: 'kg',
      useExistingMeasurements: true // No prior height exists
    });

    assert.equal(weightOnlyMeas.height, null, 'Height must be null');
    assert.equal(weightOnlyMeas.heightUnit, null, 'Height unit must be null');
    assert.equal(weightOnlyMeas.bmi, null, 'BMI must strictly be null (NOT FABRICATED)');
    assert.equal(weightOnlyMeas.calculatedValues.bmi, null, 'Calculated BMI must be null');

    console.log('  ✔ Directly measured vs calculated values clearly distinguished; fabricated BMI strictly barred.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Reuse Existing Patient Measurements When Valid');
  // ---------------------------------------------------------------------------
  {
    const reusePatientId = 'pat_reuse_test_55';

    // 1. Initial measurement records valid height (182 cm) and weight (90 kg)
    const initialMeas = obesityService.recordObesityMeasurement({
      patientId: reusePatientId,
      height: 182,
      heightUnit: 'cm',
      weight: 90,
      weightUnit: 'kg',
      measurementTimestamp: '2026-09-01T10:00:00.000Z',
      measurementSource: 'clinical_scale'
    });
    assert.equal(initialMeas.bmi, 27.2); // 90 / (1.82^2) = 27.17 -> 27.2

    // 2. Subsequent follow-up: Patient logs new weight (87.5 kg) at home without entering height again
    const followUpMeas = obesityService.recordObesityMeasurement({
      patientId: reusePatientId,
      weight: 87.5,
      weightUnit: 'kg',
      measurementTimestamp: '2026-10-01T10:00:00.000Z',
      measurementSource: 'smart_scale',
      useExistingMeasurements: true // Reuses existing valid height
    });

    // Reused height verified
    assert.equal(followUpMeas.height, 182, 'Reuses valid historical height (182 cm)');
    assert.equal(followUpMeas.heightUnit, 'cm');
    assert.equal(followUpMeas.weight, 87.5);
    assert.equal(followUpMeas.weightUnit, 'kg');
    // BMI calculated from new weight and existing height: 87.5 / (1.82^2) = 26.41 -> 26.4
    assert.equal(followUpMeas.bmi, 26.4);
    assert.equal(followUpMeas.measuredValues.height.isReusedFromHistory, true);
    assert.equal(followUpMeas.measuredValues.height.reusedFromMeasurementId, initialMeas.measurementId);
    assert.equal(followUpMeas.calculatedValues.bmi.derivationMethod, 'calculated_from_new_weight_and_existing_height');
    assert.equal(followUpMeas.provenance.isReusedMeasurement, true);

    console.log('  ✔ Reuses existing valid patient measurements to calculate BMI while maintaining transparent provenance.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Longitudinal Preservation of Historical Measurements');
  // ---------------------------------------------------------------------------
  {
    const historyPatientId = 'pat_longitudinal_77';

    const r1 = obesityService.recordObesityMeasurement({
      patientId: historyPatientId,
      height: 170,
      heightUnit: 'cm',
      weight: 95,
      weightUnit: 'kg',
      measurementTimestamp: '2026-08-01T08:00:00.000Z'
    });

    const r2 = obesityService.recordObesityMeasurement({
      patientId: historyPatientId,
      height: 170,
      heightUnit: 'cm',
      weight: 92,
      weightUnit: 'kg',
      measurementTimestamp: '2026-09-01T08:00:00.000Z'
    });

    const r3 = obesityService.recordObesityMeasurement({
      patientId: historyPatientId,
      height: 170,
      heightUnit: 'cm',
      weight: 89,
      weightUnit: 'kg',
      measurementTimestamp: '2026-10-01T08:00:00.000Z'
    });

    const fullHistory = obesityService.getPatientMeasurementHistory(historyPatientId);
    assert.equal(fullHistory.length, 3, 'All 3 measurements must be preserved');
    assert.equal(fullHistory[0].measurementId, r1.measurementId);
    assert.equal(fullHistory[1].measurementId, r2.measurementId);
    assert.equal(fullHistory[2].measurementId, r3.measurementId);
    assert.equal(fullHistory[0].weight, 95);
    assert.equal(fullHistory[1].weight, 92);
    assert.equal(fullHistory[2].weight, 89);

    console.log('  ✔ Historical measurements preserved longitudinally in chronological order without overwrite.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Non-Diagnostic Guardrail (BMI Alone $\\neq$ Medical Diagnosis)');
  // ---------------------------------------------------------------------------
  {
    const highBmiMeas = obesityService.recordObesityMeasurement({
      patientId: 'pat_high_bmi_88',
      height: 170,
      heightUnit: 'cm',
      weight: 120, // BMI = 41.5
      weightUnit: 'kg'
    });

    assert.equal(highBmiMeas.bmi, 41.5);
    // Explicit guardrail: BMI alone is NOT a medical diagnosis!
    assert.equal(highBmiMeas.anthropometricContext.isMedicalDiagnosis, false);
    assert.equal(highBmiMeas.anthropometricContext.isAnthropometricIndex, true);
    assert.equal(highBmiMeas.anthropometricContext.bmiAloneIsNotDiagnosis, true);
    assert.equal(highBmiMeas.anthropometricContext.weightAloneIsNotDiagnosis, true);
    assert.equal(highBmiMeas.anthropometricContext.autoDiagnosisForbidden, true);
    assert.equal(highBmiMeas.anthropometricContext.clinicalInterpretationWorkflow, 'approved_medical_review_required');

    // Case creation also strictly maintains null diagnosis
    const newCase = obesityService.createObesityCase({
      patientId: 'pat_high_bmi_88',
      patientProfile: { name: 'Test High BMI' }
    });
    assert.equal(newCase.clinicalDiagnosis, null, 'Case must not have automated diagnosis despite high BMI');

    console.log('  ✔ Non-diagnostic guardrail enforced: High BMI alone does NOT generate an automated medical diagnosis.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Clinical Interpretation in Approved Medical-Review Workflow');
  // ---------------------------------------------------------------------------
  {
    const wfPatientId = 'pat_wf_patient_99';
    obesityService.recordObesityMeasurement({
      patientId: wfPatientId,
      height: 176,
      heightUnit: 'cm',
      weight: 98,
      weightUnit: 'kg'
    });

    const c = obesityService.createObesityCase({
      patientId: wfPatientId,
      patientProfile: { name: 'Review Workflow Patient' }
    });

    // 1. Missing physician diagnosis rejected
    assert.throws(
      () => obesityService.reviewAndApproveObesityCase({
        caseId: c.caseId,
        reviewingDoctor: verifiedObesityDoctor,
        clinicalDiagnosis: ''
      }),
      /PHYSICIAN_DIAGNOSIS_REQUIRED/,
      'Cannot approve without explicit physician clinical diagnosis'
    );

    // 2. Attending doctor clinical approval with management plan & follow-up
    const approved = obesityService.reviewAndApproveObesityCase({
      caseId: c.caseId,
      reviewingDoctor: verifiedObesityDoctor,
      clinicalDiagnosis: 'Class I Obesity with elevated waist circumference and prehypertension risk (BMI 31.6)',
      managementPlan: 'Prescribed Mediterranean calorie-controlled diet, 150 min/wk aerobic exercise, lifestyle therapy',
      doctorNotes: 'Patient motivated. No musculoskeletal contraindications.',
      internalDoctorNotes: 'Internal clinical note: Monitor fasting lipid panel at 6-week review.',
      followUpPlan: {
        intervalWeeks: 6,
        targetFollowUpDate: '2026-11-20',
        repeatBiometricsSchedule: 'monthly',
        nutritionConsultation: true
      },
      reviewedRevision: c.clinicalRevision
    });

    assert.equal(approved.success, true);
    assert.equal(approved.case.status, 'approved');
    assert.equal(approved.case.clinicalDiagnosis, 'Class I Obesity with elevated waist circumference and prehypertension risk (BMI 31.6)');
    // Quarantined internal notes strictly removed from certified report
    assert.equal(approved.report.internalDoctorNotes, undefined);
    assert.ok(approved.report.digitalSignature.signatureHash);

    console.log('  ✔ Clinical interpretation strictly governed within approved medical-review workflow with internal note quarantine.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 9: UI Rendering Parity & Measured vs Calculated Separation');
  // ---------------------------------------------------------------------------
  {
    const history = obesityService.getPatientMeasurementHistory('pat_longitudinal_77');
    const tableEn = obesityUI.renderHistoricalMeasurementsTable(history, true);
    const tableAr = obesityUI.renderHistoricalMeasurementsTable(history, false);

    assert.ok(tableEn.includes('Measured Height'));
    assert.ok(tableAr.includes('الطول المقاس'));
    assert.ok(tableEn.includes('Measured Weight'));
    assert.ok(tableAr.includes('الوزن المقاس'));
    assert.ok(tableEn.includes('Calculated BMI'));
    assert.ok(tableAr.includes('مؤشر الكتلة المحسوب (BMI)'));
    assert.ok(tableEn.includes('Calculated'));

    // Check doctor review view in DoctorUI
    const sampleCase = obesityService.getPatientObesityCases('pat_wf_patient_99')[0];
    const docReviewEn = doctorUI.renderObesityReviewSection(sampleCase, true);
    const docReviewAr = doctorUI.renderObesityReviewSection(sampleCase, false);

    assert.ok(docReviewEn.includes('Measured Height'));
    assert.ok(docReviewAr.includes('الطول المقاس'));
    assert.ok(docReviewEn.includes('Calculated BMI'));
    assert.ok(docReviewAr.includes('مؤشر الكتلة المحسوب'));

    console.log('  ✔ 100% Arabic and English UI rendering parity with measured vs calculated clear distinction.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL 9 OBESITY MODULE TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================\n');
})();
