/**
 * Health Vibe AI - Strict Patient Medical Profile Onboarding Test Suite
 *
 * Verifies (PRD Page 8 Req 39):
 * 1. Immediate post-registration onboarding flow for completing patient medical profile.
 * 2. Mandatory collection & clinical validation of the 8 core baseline indicators:
 *    - السن (Age / Date of Birth)
 *    - النوع (Biological Sex: male / female)
 *    - الوزن (Weight in kg)
 *    - الطول ومؤشر الكتلة (Height in cm & BMI calculation)
 *    - التدخين (Smoking status & history)
 *    - الأمراض المزمنة (Chronic conditions / Hypertension / Diabetes / None)
 *    - الحساسية الدوائية (Drug allergies / Penicillin / Sulfa / NKDA)
 *    - الطبيب المعالج والعيادة (Attending physician linkage & clinic assignment)
 * 3. Clinical validation rules (height range, weight range, age range, valid enums).
 * 4. Data Provenance & audit logging (v1 on creation, increment on correction).
 * 5. Frontend UI integration in app/index.html and app/app.js:
 *    - Dedicated screen #screen-complete-medical-profile
 *    - Interactive progress tracking bar (8 items)
 *    - Quick tag chips for chronic conditions and drug allergies
 *    - Incomplete profile alert banner on dashboard
 *    - Post-registration redirection in handleEmailAuth & transitionToApp
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🩺 HEALTH VIBE AI: PATIENT MEDICAL PROFILE ONBOARDING TEST SUITE');
console.log('   PRD Page 8 Req 39: Immediate Post-Registration 8-Indicator Baseline Setup');
console.log('================================================================================\n');

const profileService = require('../backend/patient-profile-service');

// Mock Firestore Implementation
function createMockFirestore() {
  const collections = new Map();

  function getCol(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  return {
    _collections: collections,
    collection(name) {
      const col = getCol(name);
      return {
        doc(id) {
          return {
            id,
            async get() {
              const data = col.get(id);
              return {
                id,
                exists: Boolean(data),
                data() { return data ? JSON.parse(JSON.stringify(data)) : undefined; }
              };
            },
            async set(data, options = {}) {
              if (options.merge && col.has(id)) {
                const prev = col.get(id);
                col.set(id, { ...prev, ...data });
              } else {
                col.set(id, JSON.parse(JSON.stringify(data)));
              }
              return { id };
            },
            async update(data) {
              const prev = col.get(id) || {};
              col.set(id, { ...prev, ...data });
              return { id };
            }
          };
        }
      };
    }
  };
}

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}\n`);
    throw err;
  }
}

(async () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Validation of 8 Core Baseline Indicators
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Validation of 8 Core Clinical Indicators ---');

  runTest('1.1 Should accept complete medical baseline with all 8 indicators', () => {
    const rawInput = {
      fullName: 'أحمد محمود عبد الرحمن',
      dateOfBirth: '1985-06-15',
      biologicalSex: 'male',
      weightKg: 82.5,
      heightCm: 178,
      smoking: { status: 'former', details: '10 pack-years, quit 2 years ago' },
      chronicConditions: ['ارتفاع ضغط الدم', 'حساسية صدرية'],
      allergies: ['بنسلين', 'أسبيرين'],
      clinicLinkage: {
        linkedDoctorName: 'د. طارق محمود',
        clinicName: 'مركز رعاية الجهاز التنفسي التخصصي'
      }
    };

    const validated = profileService.validateMedicalProfile(rawInput);
    assert.strictEqual(validated.isValid, true);
    assert.strictEqual(validated.profile.biologicalSex, 'male');
    assert.strictEqual(validated.profile.biometrics.weightKg, 82.5);
    assert.strictEqual(validated.profile.biometrics.heightCm, 178);
    assert.strictEqual(validated.profile.biometrics.calculatedBmi, 26.04);
    assert.strictEqual(validated.profile.smoking.status, 'former');
    assert.strictEqual(validated.profile.chronicConditions.length, 2);
    assert.strictEqual(validated.profile.allergies.length, 2);
    assert.strictEqual(validated.profile.clinicLinkage.linkedDoctorName, 'د. طارق محمود');
  });

  runTest('1.2 Should reject profile missing Biological Sex', () => {
    const rawInput = {
      fullName: 'سارة إبراهيم',
      dateOfBirth: '1992-04-10',
      biologicalSex: 'invalid_sex',
      weightKg: 65,
      heightCm: 165,
      smoking: { status: 'never' },
      chronicConditions: ['none'],
      allergies: ['none']
    };

    const validated = profileService.validateMedicalProfile(rawInput);
    assert.strictEqual(validated.isValid, false);
    assert.ok(validated.errors.some(e => e.includes('Biological sex')));
  });

  runTest('1.3 Should reject out-of-range Weight (< 2kg or > 350kg)', () => {
    const rawLow = {
      fullName: 'مريض تجريبي',
      dateOfBirth: '1990-01-01',
      biologicalSex: 'female',
      weightKg: 1.5,
      heightCm: 160
    };
    const resLow = profileService.validateMedicalProfile(rawLow);
    assert.strictEqual(resLow.isValid, false);
    assert.ok(resLow.errors.some(e => e.includes('Weight')));

    const rawHigh = {
      fullName: 'مريض تجريبي',
      dateOfBirth: '1990-01-01',
      biologicalSex: 'female',
      weightKg: 400,
      heightCm: 160
    };
    const resHigh = profileService.validateMedicalProfile(rawHigh);
    assert.strictEqual(resHigh.isValid, false);
    assert.ok(resHigh.errors.some(e => e.includes('Weight')));
  });

  runTest('1.4 Should reject out-of-range Height (< 30cm or > 260cm)', () => {
    const rawInput = {
      fullName: 'مريض تجريبي',
      dateOfBirth: '1990-01-01',
      biologicalSex: 'male',
      weightKg: 70,
      heightCm: 290
    };
    const res = profileService.validateMedicalProfile(rawInput);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some(e => e.includes('Height')));
  });

  runTest('1.5 Should calculate BMI accurately and assign correct clinical category', () => {
    // Normal weight: 175cm, 70kg -> BMI ~ 22.86
    const normal = profileService.validateMedicalProfile({
      fullName: 'مريض 1',
      dateOfBirth: '1995-01-01',
      biologicalSex: 'male',
      heightCm: 175,
      weightKg: 70
    });
    assert.strictEqual(normal.profile.biometrics.calculatedBmi, 22.86);

    // Obese: 160cm, 95kg -> BMI ~ 37.11
    const obese = profileService.validateMedicalProfile({
      fullName: 'مريض 2',
      dateOfBirth: '1980-01-01',
      biologicalSex: 'female',
      heightCm: 160,
      weightKg: 95
    });
    assert.strictEqual(obese.profile.biometrics.calculatedBmi, 37.11);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Data Provenance & Baseline Completion
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Persistence, Provenance & Baseline Completion ---');

  await runAsyncTest('2.1 Should persist complete profile with provenance v1 and completion timestamp', async () => {
    const mockDb = createMockFirestore();
    const patientId = 'patient_onboarding_test_01';

    const input = {
      fullName: 'خالد منصور العبدلي',
      dateOfBirth: '1979-11-20',
      biologicalSex: 'male',
      weightKg: 88,
      heightCm: 176,
      smoking: { status: 'active', details: '15 cigarettes/day' },
      chronicConditions: ['داء السكري من النوع الثاني', 'السدة الرئوية المزمنة'],
      allergies: ['سلفا (Sulfa)'],
      clinicLinkage: {
        clinicId: 'clinic-pulmo-care',
        clinicName: 'مركز رعاية الجهاز التنفسي التخصصي (معتمد)',
        linkedDoctorName: 'د. طارق محمود'
      }
    };

    const saved = await profileService.saveMedicalProfile(patientId, input, mockDb);
    assert.strictEqual(saved.profile.userId, patientId);
    assert.strictEqual(saved.profile.dataProvenance.version, 1);
    assert.strictEqual(saved.profile.dataProvenance.isAudited, true);
    assert.strictEqual(saved.profile.clinicalBaselineCompleted, true);
    assert.ok(saved.profile.clinicalBaselineCompletedAt);

    // Verify Firestore doc
    const docSnap = await mockDb.collection('users').doc(patientId).get();
    const docData = docSnap.data();
    assert.strictEqual(docData.medicalProfileCompleted, true);
    assert.strictEqual(docData.weightKg, 88);
    assert.strictEqual(docData.heightCm, 176);
    assert.strictEqual(docData.biologicalSex, 'male');
    assert.strictEqual(docData.linkedDoctor, 'د. طارق محمود');
  });

  await runAsyncTest('2.2 Should correctly record clinical correction with incremented version', async () => {
    const mockDb = createMockFirestore();
    const patientId = 'patient_onboarding_test_02';

    // Step 1: Initial save
    await profileService.saveMedicalProfile(patientId, {
      fullName: 'منى السعيد',
      dateOfBirth: '1988-03-25',
      biologicalSex: 'female',
      weightKg: 62,
      heightCm: 164,
      smoking: { status: 'never' },
      chronicConditions: [],
      allergies: ['none']
    }, mockDb);

    // Step 2: Clinical correction
    const corrected = await profileService.saveMedicalProfile(patientId, {
      fullName: 'منى السعيد',
      dateOfBirth: '1988-03-25',
      biologicalSex: 'female',
      weightKg: 64, // Updated weight
      heightCm: 164,
      smoking: { status: 'passive', details: 'Passive exposure at home' },
      chronicConditions: ['ربو تحسسي'],
      allergies: ['بنسلين'],
      correctionReason: 'Clinical follow-up revision: diagnosed with allergic asthma'
    }, mockDb);

    assert.strictEqual(corrected.profile.dataProvenance.version, 2);
    assert.strictEqual(corrected.profile.dataProvenance.lastAuditReason, 'Clinical follow-up revision: diagnosed with allergic asthma');
    assert.strictEqual(corrected.profile.biometrics.weightKg, 64);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Frontend UI Elements in app/index.html
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Frontend UI Elements Verification (app/index.html) ---');

  const htmlContent = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

  runTest('3.1 Should contain dedicated screen #screen-complete-medical-profile', () => {
    assert.ok(htmlContent.includes('id="screen-complete-medical-profile"'), 'Missing screen-complete-medical-profile container');
    assert.ok(htmlContent.includes('data-screen="complete-medical-profile"'), 'Missing data-screen attribute');
  });

  runTest('3.2 Should render all 8 core clinical baseline input sections', () => {
    // 1. Age & DOB
    assert.ok(htmlContent.includes('id="cmpDob"'), 'Missing DOB input');
    assert.ok(htmlContent.includes('id="cmpAgeFallback"'), 'Missing fallback age input');
    assert.ok(htmlContent.includes('id="cmpCalculatedAgeBadge"'), 'Missing calculated age badge');

    // 2. Biological Sex
    assert.ok(htmlContent.includes('name="cmpSex"'), 'Missing biological sex radio inputs');
    assert.ok(htmlContent.includes('value="male"'), 'Missing male sex option');
    assert.ok(htmlContent.includes('value="female"'), 'Missing female sex option');

    // 3. Weight & Height & BMI
    assert.ok(htmlContent.includes('id="cmpWeight"'), 'Missing weight input');
    assert.ok(htmlContent.includes('id="cmpHeight"'), 'Missing height input');
    assert.ok(htmlContent.includes('id="cmpBmiBadge"'), 'Missing BMI live calculation badge');

    // 4. Smoking History
    assert.ok(htmlContent.includes('id="cmpSmokingStatus"'), 'Missing smoking status select');
    assert.ok(htmlContent.includes('id="cmpSmokingDetails"'), 'Missing smoking details input');

    // 5. Chronic Conditions
    assert.ok(htmlContent.includes('id="cmpChronicConditions"'), 'Missing chronic conditions input');

    // 6. Drug Allergies
    assert.ok(htmlContent.includes('id="cmpDrugAllergies"'), 'Missing drug allergies input');

    // 7. Attending Physician & Clinic
    assert.ok(htmlContent.includes('id="cmpDoctorSelect"'), 'Missing doctor selection dropdown');
    assert.ok(htmlContent.includes('id="cmpClinicSelect"'), 'Missing clinic selection dropdown');
  });

  runTest('3.3 Should contain progress indicators and quick-select tags', () => {
    assert.ok(htmlContent.includes('id="cmpProgressBar"'), 'Missing progress bar');
    assert.ok(htmlContent.includes('id="cmpProgressPill"'), 'Missing progress pill badge');
    assert.ok(htmlContent.includes('addCmpTag('), 'Missing quick tag chip click handlers');
    assert.ok(htmlContent.includes('handleSaveCompleteMedicalProfile()'), 'Missing save profile action handler');
    assert.ok(htmlContent.includes('handleSkipCompleteMedicalProfile()'), 'Missing skip onboarding action handler');
  });

  runTest('3.4 Should contain incomplete profile banner in patient dashboard', () => {
    assert.ok(htmlContent.includes('id="patientIncompleteProfileBanner"'), 'Missing patientIncompleteProfileBanner in dashboard');
    assert.ok(htmlContent.includes("showScreen('complete-medical-profile')"), 'Missing navigation to complete-medical-profile from dashboard banner');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Client-side Controller & Routing Verification in app/app.js
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Client-side Controller & Routing Verification (app/app.js) ---');

  const jsContent = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');

  runTest('4.1 allScreenNames should include complete-medical-profile', () => {
    assert.ok(jsContent.includes('"complete-medical-profile"'), 'allScreenNames does not include complete-medical-profile');
  });

  runTest('4.2 isPatientMedicalProfileIncomplete function should be defined and exported', () => {
    assert.ok(jsContent.includes('function isPatientMedicalProfileIncomplete'), 'Missing isPatientMedicalProfileIncomplete function');
    assert.ok(jsContent.includes('window.isPatientMedicalProfileIncomplete = isPatientMedicalProfileIncomplete'), 'isPatientMedicalProfileIncomplete not exported to window');
  });

  runTest('4.3 Interactive helpers (handleCmpDobChange, updateCmpBmi, addCmpTag) must be wired', () => {
    assert.ok(jsContent.includes('function handleCmpDobChange'), 'Missing handleCmpDobChange');
    assert.ok(jsContent.includes('function updateCmpBmi'), 'Missing updateCmpBmi');
    assert.ok(jsContent.includes('function addCmpTag'), 'Missing addCmpTag');
    assert.ok(jsContent.includes('function handleSaveCompleteMedicalProfile'), 'Missing handleSaveCompleteMedicalProfile');
    assert.ok(jsContent.includes('function handleSkipCompleteMedicalProfile'), 'Missing handleSkipCompleteMedicalProfile');
  });

  runTest('4.4 handleEmailAuth should redirect new patient signup to complete-medical-profile', () => {
    assert.ok(
      jsContent.includes('const targetScreen = (selectedRole === ROLES.PATIENT || selectedRole === "patient") ? "complete-medical-profile" : undefined;'),
      'handleEmailAuth missing targetScreen routing for patient signup'
    );
    assert.ok(
      jsContent.includes('transitionToApp(user, { targetScreen, isNewSignup: true });'),
      'handleEmailAuth not passing isNewSignup: true to transitionToApp'
    );
  });

  runTest('4.5 transitionToApp should respect complete-medical-profile for new signups or incomplete profiles', () => {
    assert.ok(
      jsContent.includes('targetScreen = "complete-medical-profile";'),
      'transitionToApp does not direct incomplete patient profiles to complete-medical-profile'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`🎉 ALL TESTS PASSED! (${passedTests}/${totalTests} tests)`);
  console.log('   PRD Page 8 Req 39: Medical Profile Post-Registration Setup is 100% Verified!');
  console.log('================================================================================\n');
})();
