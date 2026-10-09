/**
 * Health Vibe AI - Patient Medical Profile, DOB, Clinical Relevance & Provenance Test Suite
 * 
 * Verifies:
 * 1. Date of birth parsing & exact calendar-based age calculation (eliminating free-text age).
 * 2. Biometric validation & Body Mass Index (BMI) dynamic calculation.
 * 3. Clinical relevance enforcement for biological sex & pregnancy (strictly female 12-55).
 * 4. Structured clinical baselines: emergency contact, allergies, chronic conditions, medications,
 *    surgeries, smoking details, family history, and hospital admissions.
 * 5. Optional health insurance handling.
 * 6. Data provenance tracking, versioning, timestamps, and auditable correction history.
 * 7. Trusted clinic and doctor identifier linkage.
 */

const assert = require('assert');
const app = require('../backend/server');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: PATIENT PROFILE, DOB & PROVENANCE TEST SUITE');
console.log('   DOB Age Calculation, Clinical Relevance, Provenance & Linkages');
console.log('==================================================================\n');

async function runTestSuite() {
  let passedTests = 0;
  const totalTests = 7;

  // -----------------------------------------------------------------------------
  // TEST 1: Exact Age Calculation from Date of Birth (No Free-Text)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Date of Birth & Dynamic Age Calculation');
  {
    const calculateAge = app.calculateAge;
    assert.strictEqual(typeof calculateAge, 'function', 'calculateAge must be exported on app');

    // Reference date: 2026-09-28
    const refDate = new Date('2026-09-28T12:00:00Z');

    // Case 1: Birthday already occurred this year
    const dob1 = '1990-05-15';
    assert.strictEqual(calculateAge(dob1, refDate), 36, '1990-05-15 on 2026-09-28 should be 36 years old');

    // Case 2: Birthday has not yet occurred this year
    const dob2 = '1990-11-20';
    assert.strictEqual(calculateAge(dob2, refDate), 35, '1990-11-20 on 2026-09-28 should be 35 years old');

    // Case 3: Birthday is today
    const dob3 = '2000-09-28';
    assert.strictEqual(calculateAge(dob3, refDate), 26, '2000-09-28 on 2026-09-28 should be 26 years old');

    // Case 4: Infant under 1 year
    const dob4 = '2026-01-10';
    assert.strictEqual(calculateAge(dob4, refDate), 0, '2026-01-10 on 2026-09-28 should be 0 years old');

    // Case 5: Invalid or missing dates
    assert.strictEqual(calculateAge(null), null, 'null DOB returns null');
    assert.strictEqual(calculateAge('invalid-date'), null, 'malformed date returns null');

    passedTests++;
    console.log('  ✓ Exact calendar-based age calculation verified across boundary conditions.');
  }

  // -----------------------------------------------------------------------------
  // TEST 2: Biometrics & BMI Calculation
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Biometrics & Dynamic BMI Calculation');
  {
    const calculateBmi = app.calculateBmi;
    assert.strictEqual(typeof calculateBmi, 'function', 'calculateBmi must be exported on app');

    // Normal: 175 cm, 70 kg -> 70 / (1.75^2) = 22.857 -> 22.9
    const bmiNormal = calculateBmi(175, 70);
    assert.strictEqual(bmiNormal, 22.9, `Expected BMI 22.9, got ${bmiNormal}`);

    // Overweight: 180 cm, 95 kg -> 95 / (1.80^2) = 29.32 -> 29.3
    const bmiOverweight = calculateBmi(180, 95);
    assert.strictEqual(bmiOverweight, 29.3, `Expected BMI 29.3, got ${bmiOverweight}`);

    // Edge cases
    assert.strictEqual(calculateBmi(0, 70), null, 'Height of 0 should return null BMI');
    assert.strictEqual(calculateBmi(175, -5), null, 'Negative weight should return null BMI');
    assert.strictEqual(calculateBmi(null, null), null, 'Missing biometrics should return null');

    passedTests++;
    console.log('  ✓ Biometric calculations and BMI formula accurately rounded to 1 decimal.');
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Clinical Relevance Enforcement for Sex & Pregnancy
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Clinical Relevance for Biological Sex & Pregnancy');
  {
    const evaluateRelevance = app.evaluatePregnancyClinicalRelevance;
    assert.strictEqual(typeof evaluateRelevance, 'function', 'evaluatePregnancyClinicalRelevance must be exported');

    // 1. Biological male: Pregnancy strictly non-applicable
    const maleCheck = evaluateRelevance('male', 28);
    assert.strictEqual(maleCheck.isClinicallyRelevant, false, 'Male must not have clinically relevant pregnancy');
    assert.match(maleCheck.reason, /not female/i);

    // 2. Pediatric female (<12): Non-applicable
    const pediatricCheck = evaluateRelevance('female', 8);
    assert.strictEqual(pediatricCheck.isClinicallyRelevant, false, 'Pediatric female (<12) must not have clinically relevant pregnancy');
    assert.match(pediatricCheck.reason, /pediatric/i);

    // 3. Post-menopausal female (>55): Non-applicable
    const seniorCheck = evaluateRelevance('female', 62);
    assert.strictEqual(seniorCheck.isClinicallyRelevant, false, 'Senior female (>55) must not have clinically relevant pregnancy');
    assert.match(seniorCheck.reason, /post-menopausal/i);

    // 4. Female in reproductive age (12-55): Clinically relevant
    const reproductiveCheck = evaluateRelevance('female', 29);
    assert.strictEqual(reproductiveCheck.isClinicallyRelevant, true, 'Female aged 29 must be clinically relevant');

    // Validate profile schema behavior:
    const profileValidation = app.validatePatientMedicalProfile({
      fullName: 'Sarah Johnson',
      dateOfBirth: '1995-04-12', // Age ~31
      sex: 'female',
      pregnancy: { status: 'pregnant', trimester: 2, dueDate: '2027-01-15' }
    });
    assert.strictEqual(profileValidation.isValid, true);
    assert.strictEqual(profileValidation.data.pregnancy.isClinicallyRelevant, true);
    assert.strictEqual(profileValidation.data.pregnancy.status, 'pregnant');
    assert.strictEqual(profileValidation.data.pregnancy.trimester, 2);

    // Male with submitted pregnancy data: Pregnancy data suppressed / marked not_applicable
    const maleProfileValidation = app.validatePatientMedicalProfile({
      fullName: 'David Smith',
      dateOfBirth: '1990-08-10',
      sex: 'male',
      pregnancy: { status: 'pregnant' } // Erroneous client input
    });
    assert.strictEqual(maleProfileValidation.isValid, true);
    assert.strictEqual(maleProfileValidation.data.pregnancy.isClinicallyRelevant, false);
    assert.strictEqual(maleProfileValidation.data.pregnancy.status, 'not_applicable');

    passedTests++;
    console.log('  ✓ Biological sex clinical necessity & conditional pregnancy relevance strictly enforced.');
  }

  // -----------------------------------------------------------------------------
  // TEST 4: Organized Medical History & Baseline Validation
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Structured Medical History Organization');
  {
    const rawData = {
      fullName: 'Tariq Al-Mansoor',
      phone: '+966501234567',
      dateOfBirth: '1988-03-20',
      emergencyContact: {
        name: 'Ahmad Al-Mansoor',
        relationship: 'Brother',
        phone: '+966509876543'
      },
      bloodType: 'O+',
      heightCm: 178,
      weightKg: 82,
      sex: 'male',
      allergies: 'Penicillin, Peanuts',
      chronicConditions: ['Asthma', 'Hypertension'],
      medications: 'Ventolin 100mcg, Lisinopril 10mg',
      surgeries: 'Appendectomy 2018',
      smoking: { status: 'former', packYears: 5, details: 'Quit 3 years ago' },
      familyHistory: ['Type 2 Diabetes (Father)', 'COPD (Uncle)'],
      hospitalAdmissions: ['Admitted for bronchial spasm (2022, 3 days)']
    };

    const res = app.validatePatientMedicalProfile(rawData);
    assert.strictEqual(res.isValid, true, `Validation failed: ${res.errors.join(', ')}`);
    
    // Check structured arrays and objects
    assert.deepStrictEqual(res.data.medicalHistory.allergies, ['Penicillin', 'Peanuts']);
    assert.deepStrictEqual(res.data.medicalHistory.chronicConditions, ['Asthma', 'Hypertension']);
    assert.strictEqual(res.data.medicalHistory.medications.length, 2);
    assert.strictEqual(res.data.medicalHistory.smoking.status, 'former');
    assert.strictEqual(res.data.medicalHistory.smoking.packYears, 5);
    assert.strictEqual(res.data.emergencyContact.name, 'Ahmad Al-Mansoor');
    assert.strictEqual(res.data.emergencyContact.relationship, 'Brother');
    assert.strictEqual(res.data.biometrics.bloodType, 'O+');
    assert.strictEqual(res.data.biometrics.bmi, 25.9);

    passedTests++;
    console.log('  ✓ Medical history cleanly parsed and structured into clinical baseline categories.');
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Optional Health Insurance Handling
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Optional Health Insurance Validation');
  {
    // Case A: Profile without insurance is 100% valid
    const noInsuranceProfile = app.validatePatientMedicalProfile({
      fullName: 'Layla Hassan',
      dateOfBirth: '2001-06-14',
      sex: 'female'
    });
    assert.strictEqual(noInsuranceProfile.isValid, true);
    assert.strictEqual(noInsuranceProfile.data.insurance.hasInsurance, false);
    assert.strictEqual(noInsuranceProfile.data.insurance.provider, '');

    // Case B: Profile with optional insurance correctly captures policy details
    const withInsuranceProfile = app.validatePatientMedicalProfile({
      fullName: 'Layla Hassan',
      dateOfBirth: '2001-06-14',
      sex: 'female',
      insurance: {
        hasInsurance: true,
        provider: 'Bupa Arabia',
        policyNumber: 'BUP-882910-KSA',
        groupNumber: 'GRP-VIP-09',
        expiryDate: '2027-12-31'
      }
    });
    assert.strictEqual(withInsuranceProfile.isValid, true);
    assert.strictEqual(withInsuranceProfile.data.insurance.hasInsurance, true);
    assert.strictEqual(withInsuranceProfile.data.insurance.provider, 'Bupa Arabia');
    assert.strictEqual(withInsuranceProfile.data.insurance.policyNumber, 'BUP-882910-KSA');

    passedTests++;
    console.log('  ✓ Health insurance confirmed strictly optional while maintaining full schema support.');
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Data Provenance, Update Tracking & Audited Corrections
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Data Provenance & Clinical Record Corrections');
  {
    const actor1 = { uid: 'user_patient_101', role: 'patient' };
    const actor2 = { uid: 'dr_sarah_respiratory', role: 'doctor_verified' };

    // Initial creation provenance
    const { provenance: prov1, correctionHistory: corr1 } = app.buildPatientProfileProvenance(actor1, {}, 'web_portal');
    assert.strictEqual(prov1.version, 1, 'Initial version must be 1');
    assert.strictEqual(prov1.correctionsCount, 0, 'Initial corrections count must be 0');
    assert.strictEqual(prov1.createdBy, 'user_patient_101');
    assert.strictEqual(prov1.source, 'web_portal');
    assert.strictEqual(corr1.length, 0, 'No correction history initially');

    // Standard update (patient updates phone number)
    const existingDoc = { dataProvenance: prov1, correctionHistory: corr1 };
    const { provenance: prov2, correctionHistory: corr2 } = app.buildPatientProfileProvenance(actor1, existingDoc, 'mobile_app');
    assert.strictEqual(prov2.version, 2, 'Version increments to 2');
    assert.strictEqual(prov2.correctionsCount, 0, 'Normal update does not increment corrections count');
    assert.strictEqual(prov2.updatedBy, 'user_patient_101');
    assert.strictEqual(prov2.source, 'mobile_app');

    // Formal clinical record correction with mandatory reason
    const docBeforeCorrection = { dataProvenance: prov2, correctionHistory: corr2 };
    const correctionReason = 'Corrected blood type from unknown to O+ following laboratory confirmatory test.';
    const { provenance: prov3, correctionHistory: corr3 } = app.buildPatientProfileProvenance(actor2, docBeforeCorrection, 'clinical_portal', correctionReason);

    assert.strictEqual(prov3.version, 3, 'Version increments to 3');
    assert.strictEqual(prov3.correctionsCount, 1, 'Corrections count increments to 1');
    assert.strictEqual(prov3.updatedBy, 'dr_sarah_respiratory');
    assert.strictEqual(prov3.updatedByType, 'doctor_verified');
    assert.strictEqual(corr3.length, 1, 'Correction history has 1 entry');
    assert.strictEqual(corr3[0].reason, correctionReason);
    assert.strictEqual(corr3[0].correctedBy, 'dr_sarah_respiratory');
    assert.strictEqual(corr3[0].previousVersion, 2);

    passedTests++;
    console.log('  ✓ Data provenance, versioning, timestamps, and audited corrections successfully verified.');
  }

  // -----------------------------------------------------------------------------
  // TEST 7: Trusted Clinic & Doctor Identifier Linkage
  // -----------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Trusted Clinic & Doctor Identifier Linkage');
  {
    const verifyLinkage = app.verifyPatientClinicAndDoctorLinkage;
    assert.strictEqual(typeof verifyLinkage, 'function', 'verifyPatientClinicAndDoctorLinkage must be exported');

    // Linkage with valid trusted IDs
    const linkage1 = await verifyLinkage({
      clinicId: 'clinic-pulmo-care',
      clinicName: 'Pulmonary Care Specialty Center',
      linkedDoctorId: 'dr_verified_chief_99',
      linkedDoctorName: 'Dr. Sarah Al-Otaibi'
    });

    assert.strictEqual(linkage1.clinicId, 'clinic-pulmo-care');
    assert.strictEqual(linkage1.linkedDoctorId, 'dr_verified_chief_99');
    assert.strictEqual(linkage1.verified, true);

    // Profile validation integrates trusted clinic linkage
    const profileWithLinkage = app.validatePatientMedicalProfile({
      fullName: 'Khaled Omar',
      dateOfBirth: '1979-10-04',
      sex: 'male',
      clinicId: 'clinic-central-01',
      linkedDoctorId: 'dr_verified_01',
      linkedDoctorName: 'Dr. Ahmad Consultant'
    });

    assert.strictEqual(profileWithLinkage.isValid, true);
    assert.strictEqual(profileWithLinkage.data.clinicLinkage.clinicId, 'clinic-central-01');
    assert.strictEqual(profileWithLinkage.data.clinicLinkage.linkedDoctorId, 'dr_verified_01');
    assert.strictEqual(profileWithLinkage.data.clinicLinkage.linkedDoctorName, 'Dr. Ahmad Consultant');

    passedTests++;
    console.log('  ✓ Clinic and doctor linkages secured with trusted identifiers.');
  }

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} PATIENT PROFILE & PROVENANCE TESTS PASSED (100%)!`);
  console.log('==================================================================\n');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
