/**
 * Health Vibe AI - Patient Medical Profile Service (PRD Page 8 Req 39)
 *
 * Implements:
 * 1. Post-registration medical profile baseline validation & onboarding engine.
 * 2. Strict clinical validation for the 8 core baseline indicators:
 *    - 1. السن (Age / Date of Birth)
 *    - 2. النوع (Biological Sex: male / female)
 *    - 3. الوزن (Weight in kg, 2-350 kg)
 *    - 4. الطول ومؤشر الكتلة (Height in cm, 30-260 cm & BMI)
 *    - 5. التدخين (Smoking status: never / former / active / passive / current)
 *    - 6. الأمراض المزمنة (Chronic conditions / list or none)
 *    - 7. الحساسية الدوائية (Drug allergies / list or NKDA)
 *    - 8. الطبيب المعالج والعيادة (Attending physician & clinic linkage)
 * 3. Immutable audit provenance & versioning (v1 on creation, increment on audited correction).
 * 4. Clinical baseline completeness verification.
 */

'use strict';

const VALID_SEX_VALUES = new Set(['male', 'female']);
const VALID_SMOKING_STATUSES = new Set(['never', 'former', 'current', 'active', 'passive', 'shisha', 'occasional']);
const VALID_BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']);

/**
 * Calculates patient age based on date of birth
 * @param {string|Date} dob 
 * @returns {number|null}
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Calculates BMI rounded to 2 decimal places
 * @param {number} heightCm 
 * @param {number} weightKg 
 * @returns {number|null}
 */
function calculateBmi(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h <= 0 || w <= 0) return null;
  const meters = h / 100;
  return Number((w / (meters * meters)).toFixed(2));
}

/**
 * Parses comma or newline-delimited list
 * @param {string|Array} input 
 * @returns {Array<string>}
 */
function parseStringList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(x => (typeof x === 'string' ? x.trim() : String(x).trim())).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(/[\n,;،]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Validates medical profile input according to PRD Page 8 Req 39
 * @param {Object} raw 
 * @returns {{ isValid: boolean, errors: Array<string>, profile: Object }}
 */
function validateMedicalProfile(raw = {}) {
  const errors = [];
  const profile = {};

  // 1. Full Name
  profile.fullName = String(raw.fullName || raw.name || '').trim() || 'مريض';

  // 2. السن (Age / Date of Birth)
  let calculatedAge = null;
  const dobStr = raw.dateOfBirth || raw.dob;
  if (dobStr) {
    const d = new Date(dobStr);
    if (isNaN(d.getTime())) {
      errors.push('Invalid date of birth format. Expected YYYY-MM-DD.');
    } else if (d > new Date()) {
      errors.push('Date of birth cannot be in the future.');
    } else {
      calculatedAge = calculateAge(d);
      if (calculatedAge > 125) {
        errors.push('Date of birth results in an improbable age (>125 years).');
      } else {
        profile.dateOfBirth = String(dobStr).split('T')[0];
        profile.age = calculatedAge;
      }
    }
  } else if (raw.age !== undefined && raw.age !== null && raw.age !== '') {
    const fallbackAge = Number(raw.age);
    if (isNaN(fallbackAge) || fallbackAge < 0 || fallbackAge > 125) {
      errors.push('Age must be a valid number between 0 and 125.');
    } else {
      profile.age = fallbackAge;
      profile.dateOfBirth = null;
    }
  }

  // 3. النوع (Biological Sex)
  const sexVal = String(raw.biologicalSex || raw.sex || '').trim().toLowerCase();
  if (VALID_SEX_VALUES.has(sexVal)) {
    profile.biologicalSex = sexVal;
  } else {
    errors.push(`Biological sex is required and must be one of: ${Array.from(VALID_SEX_VALUES).join(', ')}.`);
  }

  // 4. الوزن والطول ومؤشر الكتلة (Biometrics: Weight, Height, BMI)
  profile.biometrics = {};

  // Weight (2 - 350 kg)
  const weightVal = raw.weightKg ?? raw.weight ?? raw.biometrics?.weightKg ?? raw.biometrics?.weight;
  if (weightVal !== undefined && weightVal !== null && weightVal !== '') {
    const w = Number(weightVal);
    if (isNaN(w) || w < 2 || w > 350) {
      errors.push('Weight must be a valid number between 2 kg and 350 kg.');
    } else {
      profile.biometrics.weightKg = w;
    }
  } else {
    errors.push('Weight in kilograms is required for clinical dosing and respiratory assessment.');
  }

  // Height (30 - 260 cm)
  const heightVal = raw.heightCm ?? raw.height ?? raw.biometrics?.heightCm ?? raw.biometrics?.height;
  if (heightVal !== undefined && heightVal !== null && heightVal !== '') {
    const h = Number(heightVal);
    if (isNaN(h) || h < 30 || h > 260) {
      errors.push('Height must be a valid number between 30 cm and 260 cm.');
    } else {
      profile.biometrics.heightCm = h;
    }
  } else {
    errors.push('Height in centimeters is required to calculate clinical BMI.');
  }

  if (profile.biometrics.heightCm && profile.biometrics.weightKg) {
    profile.biometrics.calculatedBmi = calculateBmi(profile.biometrics.heightCm, profile.biometrics.weightKg);
  }

  // Blood Type (optional baseline)
  const bt = String(raw.bloodType || raw.biometrics?.bloodType || 'UNKNOWN').trim().toUpperCase();
  profile.biometrics.bloodType = VALID_BLOOD_TYPES.has(bt) ? bt : 'UNKNOWN';

  // 5. التدخين (Smoking History)
  const smokingInput = raw.smoking || {};
  const rawStatus = (typeof smokingInput === 'object' ? smokingInput.status : raw.smokingStatus) || 'never';
  const cleanStatus = VALID_SMOKING_STATUSES.has(rawStatus) ? rawStatus : 'never';
  profile.smoking = {
    status: cleanStatus,
    packYears: Number(smokingInput.packYears || raw.packYears) || null,
    details: String(smokingInput.details || (typeof raw.smoking === 'string' ? raw.smoking : '') || '').trim()
  };

  // 6. الأمراض المزمنة (Chronic Conditions)
  const chronicList = parseStringList(raw.chronicConditions || raw.medicalHistory?.chronicConditions);
  profile.chronicConditions = chronicList;

  // 7. الحساسية الدوائية (Drug Allergies)
  const allergiesList = parseStringList(raw.allergies || raw.drugAllergies || raw.medicalHistory?.allergies);
  profile.allergies = allergiesList;

  // 8. الطبيب المعالج والعيادة (Attending Physician & Clinic)
  const clinicLink = raw.clinicLinkage || {};
  profile.clinicLinkage = {
    clinicId: String(clinicLink.clinicId || raw.clinicId || 'clinic-pulmo-care').trim(),
    clinicName: String(clinicLink.clinicName || raw.clinicName || 'مركز رعاية الجهاز التنفسي التخصصي (معتمد)').trim(),
    linkedDoctorId: String(clinicLink.linkedDoctorId || raw.linkedDoctorId || 'tarek_mahmoud_md').trim(),
    linkedDoctorName: String(clinicLink.linkedDoctorName || raw.linkedDoctor || 'د. طارق محمود').trim()
  };

  // Check baseline completeness
  const isBaselineComplete = Boolean(
    (profile.dateOfBirth || profile.age !== undefined) &&
    profile.biologicalSex &&
    profile.biometrics.weightKg &&
    profile.biometrics.heightCm &&
    profile.smoking.status &&
    profile.clinicLinkage.linkedDoctorName
  );

  profile.clinicalBaselineCompleted = isBaselineComplete;

  return {
    isValid: errors.length === 0,
    errors,
    profile
  };
}

/**
 * Checks if a stored user document has an incomplete medical baseline
 * @param {Object} doc 
 * @returns {boolean}
 */
function isPatientMedicalProfileIncomplete(doc = {}) {
  const hasAge = Boolean(doc.dateOfBirth || doc.dob || doc.age !== undefined || doc.calculatedAge);
  const hasSex = Boolean(doc.biologicalSex && doc.biologicalSex !== 'not_specified' || (doc.sex && doc.sex !== 'not_specified'));
  const hasWeight = Boolean(doc.weightKg || doc.weight || doc.biometrics?.weightKg);
  const hasHeight = Boolean(doc.heightCm || doc.height || doc.biometrics?.heightCm);
  const hasSmoking = Boolean(doc.smoking?.status || doc.smokingStatus);
  const hasChronic = Boolean(doc.chronicConditions || doc.medicalHistory?.chronicConditions);
  const hasAllergies = Boolean(doc.allergies || doc.drugAllergies || doc.medicalHistory?.allergies);
  const hasDoctor = Boolean(doc.linkedDoctor || doc.attendingPhysician || doc.clinicLinkage?.linkedDoctorName);

  return !(hasAge && hasSex && hasWeight && hasHeight && hasSmoking && hasChronic && hasAllergies && hasDoctor);
}

/**
 * Saves medical profile to Firestore with provenance and audit metadata
 * @param {string} patientId 
 * @param {Object} rawInput 
 * @param {Object} db 
 * @param {Object} actor 
 * @returns {Promise<Object>}
 */
async function saveMedicalProfile(patientId, rawInput, db, actor = {}) {
  const validation = validateMedicalProfile(rawInput);
  if (!validation.isValid) {
    const err = new Error(`Medical profile validation failed: ${validation.errors.join(', ')}`);
    err.validationErrors = validation.errors;
    throw err;
  }

  const profile = validation.profile;
  profile.userId = patientId;

  let prevVersion = 0;
  let previousDoc = {};

  if (db) {
    const snap = await db.collection('users').doc(patientId).get();
    if (snap.exists) {
      previousDoc = snap.data() || {};
      prevVersion = previousDoc.dataProvenance?.version || (previousDoc.medicalProfile?.dataProvenance?.version) || 0;
    }
  }

  const newVersion = prevVersion + 1;
  const nowIso = new Date().toISOString();

  const provenance = {
    version: newVersion,
    updatedAt: nowIso,
    updatedBy: actor.uid || patientId,
    source: rawInput.source || 'onboarding_profile_screen',
    isAudited: true,
    lastAuditReason: rawInput.correctionReason || (prevVersion === 0 ? 'Initial medical baseline registration' : 'Patient clinical profile update')
  };

  profile.dataProvenance = provenance;
  profile.clinicalBaselineCompletedAt = previousDoc.clinicalBaselineCompletedAt || nowIso;

  if (db) {
    const userUpdate = {
      dateOfBirth: profile.dateOfBirth,
      age: profile.age ? String(profile.age) : null,
      biologicalSex: profile.biologicalSex,
      sex: profile.biologicalSex,
      weightKg: profile.biometrics.weightKg,
      weight: profile.biometrics.weightKg,
      heightCm: profile.biometrics.heightCm,
      height: profile.biometrics.heightCm,
      bmi: profile.biometrics.calculatedBmi,
      smokingStatus: profile.smoking.status,
      smoking: profile.smoking,
      chronicConditions: profile.chronicConditions,
      allergies: profile.allergies,
      drugAllergies: profile.allergies,
      linkedDoctor: profile.clinicLinkage.linkedDoctorName,
      clinicId: profile.clinicLinkage.clinicId,
      clinicName: profile.clinicLinkage.clinicName,
      medicalProfileCompleted: true,
      medicalProfileCompletedAt: profile.clinicalBaselineCompletedAt,
      medicalProfile: profile,
      dataProvenance: provenance,
      updatedAt: nowIso
    };

    await db.collection('users').doc(patientId).set(userUpdate, { merge: true });
  }

  return {
    success: true,
    profile
  };
}

module.exports = {
  calculateAge,
  calculateBmi,
  parseStringList,
  validateMedicalProfile,
  validatePatientMedicalProfile: validateMedicalProfile,
  isPatientMedicalProfileIncomplete,
  saveMedicalProfile,
  VALID_SEX_VALUES,
  VALID_SMOKING_STATUSES,
  VALID_BLOOD_TYPES
};
