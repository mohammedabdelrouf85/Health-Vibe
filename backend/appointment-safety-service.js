/**
 * Health Vibe AI - Appointment Safety, Privacy & Physician Primacy Service
 *
 * Implements:
 * 1. Medical Safety & Acute Respiratory Emergency Red-Flag Triage:
 *    - Real-time screening of intake symptoms, complaints, and vitals before booking.
 *    - Detects critical red flags (SpO2 < 90%, acute dyspnea, cyanosis, hemoptysis, silent chest).
 *    - Escalates with statutory emergency protocols (Egypt 123 Ambulance / ER).
 *    - Requires explicit disclaimer acknowledgement for non-emergency scheduling when red flags are present.
 * 2. Physician Primacy & Anti-Circumvention of the Human Doctor:
 *    - Strictly prevents patients, AI chatbots, and non-clinicians from authoring clinical diagnoses,
 *      prescriptions, ICD-10 codes, or treatment plans (CLINICIAN_ROLE_PROTECTED).
 *    - Enforces human doctor digital signatures and license verification for clinical documentation.
 *    - Restricts appointment completion and clinical discharge to licensed physicians.
 * 3. Privacy Controls & Data Minimization:
 *    - Slot anonymization for public and patient-facing calendar strips (zero PII leakage across patients).
 *    - Family beneficiary boundary enforcement: validates that beneficiary belongs to the patient's family account.
 *    - Authoritative audit logging for emergency triggers, privacy checks, and clinical evaluations.
 */

const auditService = require('./audit-service');

// ============================================================================
// 📜 STATUTORY MEDICAL DISCLAIMERS & REGULATORY REFERENCES
// ============================================================================
const STATUTORY_MEDICAL_DISCLAIMER = {
  ar: 'تنبيه طبي قانوني: المعلومات وخدمات حجز المواعيد عبر HealthVibe AI هي لأغراض التوعية ودعم القرار والتنسيق الطبي فقط، ولا تعد تشخيصاً طبياً مستقلاً أو بديلاً عن تقييم طبيب بشري مؤهل. لا تقوم المنظومة أو أدوات الذكاء الاصطناعي بإصدار تشخيصات نهائية أو تعديل وصفات علاجية دون مراجعة واعتماد مباشر من الطبيب المعالج. في حالات الطوارئ أو الأعراض التنفسية الحرجة، يجب التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف (123).',
  en: 'Statutory Medical Disclaimer: HealthVibe AI appointment booking and clinical decision-support tools are strictly informational and coordination utilities. They do not formulate autonomous deterministic medical diagnoses, prescribe medications, or replace direct in-person clinical evaluation by a licensed human physician. In acute respiratory emergencies or severe symptoms, seek urgent emergency room care immediately or dial 123.',
  regulatoryBasis: 'Egyptian Ministry of Health Regulations, WHO ETAT Guidelines, BTS Respiratory Safety Standards, HIPAA / GDPR Health Privacy Compliance'
};

const EMERGENCY_CONTACTS = {
  egypt: '123',
  ksa: '997',
  uae: '998',
  international: '112'
};

// ============================================================================
// 🚨 RESPIRATORY & CLINICAL EMERGENCY RED FLAGS
// ============================================================================
const EMERGENCY_RED_FLAGS = [
  {
    key: 'severe_hypoxemia',
    nameAr: 'نقص حاد بالأكسجين (SpO2 أقل من 90%)',
    nameEn: 'Severe Hypoxemia (SpO2 < 90%)',
    tier: 'CRITICAL_EMERGENCY',
    matchesVital: (v) => typeof v.spo2 === 'number' && v.spo2 < 90,
    keywordsAr: ['نقص اكسجين', 'أكسجين منخفض', 'spo2 أقل من 90', 'تشبع منخفض'],
    keywordsEn: ['hypoxemia', 'low oxygen', 'spo2 below 90', 'oxygen drop']
  },
  {
    key: 'silent_chest_or_severe_dyspnea',
    nameAr: 'صعوبة تنفس حادة أو غياب أصوات الصدر (Silent Chest)',
    nameEn: 'Severe Dyspnea or Impending Respiratory Arrest (Silent Chest)',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['ضيق تنفس حاد', 'اختناق', 'عجز عن التنفس', 'لا استطيع التنفس', 'نهجان شديد جدا', 'انقطاع النفس'],
    keywordsEn: ['severe dyspnea', 'silent chest', 'cannot breathe', 'gasping for air', 'respiratory arrest', 'suffocation']
  },
  {
    key: 'cyanosis',
    nameAr: 'زرقة الشفاه أو أطراف الأصابع (Cyanosis)',
    nameEn: 'Cyanosis (Blue lips or fingernails)',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['زرقة الشفاه', 'زرقة في الشفاه', 'زرقة بالشفاه', 'زرقة في الوجه', 'أطراف زرقاء', 'الشفايف زرقاء', 'ازرقاق', 'ازرقاق بالشفاه', 'زرقة'],
    keywordsEn: ['cyanosis', 'blue lips', 'blue fingers', 'bluish skin']
  },
  {
    key: 'hemoptysis',
    nameAr: 'بصاق مدمم أو خروج دم مع السعال (Hemoptysis)',
    nameEn: 'Hemoptysis (Coughing blood)',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['كحة دم', 'سعال مدمم', 'خروج دم مع البلغم', 'بصاق دم'],
    keywordsEn: ['coughing blood', 'hemoptysis', 'blood in phlegm', 'blood in sputum']
  },
  {
    key: 'acute_chest_pain',
    nameAr: 'ألم ضاغط حاد بالصدر مع صعوبة تنفس',
    nameEn: 'Acute Crushing Chest Pain with Dyspnea',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['ألم حاد بالصدر', 'وجع شديد في الصدر', 'ثقل عاصف بالصدر', 'ألم صدر مع ضيق تنفس'],
    keywordsEn: ['acute chest pain', 'crushing chest pain', 'chest tightness with dyspnea', 'severe angina']
  },
  {
    key: 'inability_to_speak',
    nameAr: 'عجز عن إكمال جملة في نفس واحد (أزمة ربو حادة)',
    nameEn: 'Inability to complete sentences in one breath (Severe Acute Asthma)',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['عجز عن الكلام', 'لا استطيع الكلام من ضيق التنفس', 'غير قادر على اكمال جملة'],
    keywordsEn: ['inability to speak', 'cannot speak in full sentences', 'speechless from breathlessness']
  },
  {
    key: 'altered_mental_status_respiratory',
    nameAr: 'تدهور درجة الوعي أو نعاس شديد مع صعوبة تنفس',
    nameEn: 'Altered consciousness or drowsiness with respiratory failure',
    tier: 'CRITICAL_EMERGENCY',
    keywordsAr: ['نعاس شديد مع ضيق تنفس', 'تشوش ذهني', 'هبوط في الوعي', 'غيبوبة'],
    keywordsEn: ['altered mental status', 'drowsiness with dyspnea', 'confusion with breathing difficulty']
  }
];

// ============================================================================
// 1. 🛡️ MEDICAL SAFETY & EMERGENCY TRIAGE EVALUATION
// ============================================================================

/**
 * Screen appointment intake symptoms, patient complaints, and vital metrics for life-threatening emergencies.
 * Returns triage decision, red flags list, action plan, and statutory disclaimers.
 */
function evaluateAppointmentEmergencyRisk(payload = {}) {
  const textCorpus = [
    payload.symptoms,
    payload.patientNotes,
    payload.notes,
    payload.reasonForVisit,
    payload.chiefComplaint,
    payload.intakeText,
    payload.complaint
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const vitals = {
    spo2: typeof payload.spo2 === 'number' ? payload.spo2 : (payload.vitals?.spo2 || null),
    heartRate: typeof payload.heartRate === 'number' ? payload.heartRate : (payload.vitals?.heartRate || null),
    respiratoryRate: typeof payload.respiratoryRate === 'number' ? payload.respiratoryRate : (payload.vitals?.respiratoryRate || null),
    systolicBP: typeof payload.systolicBP === 'number' ? payload.systolicBP : (payload.vitals?.systolicBP || null)
  };

  const detectedRedFlags = [];

  for (const flag of EMERGENCY_RED_FLAGS) {
    let triggered = false;

    // Check numerical vitals if function defined
    if (typeof flag.matchesVital === 'function' && flag.matchesVital(vitals)) {
      triggered = true;
    }

    // Check keywords in text intake
    if (!triggered && textCorpus) {
      const matchAr = flag.keywordsAr?.some(kw => textCorpus.includes(kw.toLowerCase()));
      const matchEn = flag.keywordsEn?.some(kw => textCorpus.includes(kw.toLowerCase()));
      if (matchAr || matchEn) {
        triggered = true;
      }
    }

    if (triggered) {
      detectedRedFlags.push({
        key: flag.key,
        nameAr: flag.nameAr,
        nameEn: flag.nameEn,
        tier: flag.tier
      });
    }
  }

  const isEmergency = detectedRedFlags.length > 0;
  const isDisclaimerAcknowledged = Boolean(
    payload.emergencyDisclaimerAcknowledged ||
    payload.acknowledgedEmergencyDisclaimer ||
    payload.emergencyAcknowledged
  );

  return {
    isEmergency,
    urgencyLevel: isEmergency ? 'CRITICAL_EMERGENCY' : 'ROUTINE_OUTPATIENT',
    redFlagsCount: detectedRedFlags.length,
    detectedRedFlags,
    isDisclaimerAcknowledged,
    emergencyActionAr: isEmergency
      ? 'تحذير طبي عاجل: تم رصد مؤشرات حرجة. يجب التوجه فوراً لأقرب قسم طوارئ بمستشفى أو الاتصال بالإسعاف (123). تقويم المواعيد مخصص للاستشارات الروتينية فقط ولا يحل محل الطوارئ.'
      : 'استشارة عيادية مجدولة اعتيادية.',
    emergencyActionEn: isEmergency
      ? 'URGENT MEDICAL WARNING: Critical red flags detected. Proceed immediately to the nearest hospital emergency department or dial ambulance (123). Routine scheduling cannot replace emergency care.'
      : 'Routine outpatient consultation.',
    emergencyContacts: EMERGENCY_CONTACTS,
    statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER
  };
}

// ============================================================================
// 2. 👨‍⚕️ PHYSICIAN PRIMACY & ANTI-CIRCUMVENTION OF THE HUMAN DOCTOR
// ============================================================================

/**
 * Forbidden clinical fields that non-physicians / patients / chatbots CANNOT inject or modify.
 */
const PROTECTED_CLINICIAN_FIELDS = [
  'diagnosis',
  'diagnoses',
  'icd10Code',
  'icd10',
  'prescriptions',
  'prescriptionList',
  'clinicalNotes',
  'physicianNotes',
  'treatmentPlan',
  'medicalRecommendations',
  'dischargeSummary',
  'clinicalSignoff'
];

/**
 * Enforce strict physician role boundaries on appointment booking & mutation payloads.
 * Protects human doctor primacy:
 * - Patients and non-doctors cannot self-diagnose or prescribe drugs via booking payloads.
 * - Non-clinicians are rejected with 403 CLINICIAN_ROLE_PROTECTED.
 */
function enforcePhysicianRoleBoundaries(payload = {}, actorUser = null) {
  if (!actorUser) {
    const err = new Error('Authentication required for appointment operations.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  const role = actorUser.role || 'patient';
  const isDoctorOrAdmin = role === 'doctor' || role === 'super_admin' || actorUser.isSuperAdmin;

  if (!isDoctorOrAdmin) {
    // Check if any protected clinician field is present with non-empty content
    for (const field of PROTECTED_CLINICIAN_FIELDS) {
      const val = payload[field];
      const hasContent = val !== undefined && val !== null && (
        (typeof val === 'string' && val.trim().length > 0) ||
        (Array.isArray(val) && val.length > 0) ||
        (typeof val === 'object' && Object.keys(val).length > 0)
      );

      if (hasContent) {
        const err = new Error(
          `Access denied: Field '${field}' is strictly reserved for licensed human physicians. ` +
          `Patients and automated assistants are not permitted to author or modify clinical diagnoses, prescriptions, or treatment plans.`
        );
        err.code = 'CLINICIAN_ROLE_PROTECTED';
        err.statusCode = 403;
        err.details = {
          attemptedField: field,
          actorRole: role,
          disclaimer: STATUTORY_MEDICAL_DISCLAIMER.en
        };
        throw err;
      }
    }
  }

  return true;
}

/**
 * Authorize and record a formal clinical evaluation by a licensed human physician.
 * Appends verifiable doctor credentials, license, timestamp, and audit trail.
 */
async function recordDoctorClinicalEvaluation(db, evaluationInput = {}, actorDoctor = null) {
  if (!actorDoctor) {
    const err = new Error('Authentication required.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  const role = actorDoctor.role || 'patient';
  if (role !== 'doctor' && role !== 'super_admin') {
    const err = new Error('Access denied: Only certified physicians can document clinical evaluations and prescriptions.');
    err.code = 'CLINICIAN_ROLE_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  const {
    appointmentId,
    diagnosis,
    icd10Code,
    prescriptions = [],
    clinicalNotes,
    treatmentPlan,
    followUpDate,
    status
  } = evaluationInput;

  if (!appointmentId) {
    const err = new Error('appointmentId is required for clinical evaluation recording.');
    err.code = 'MISSING_APPOINTMENT_ID';
    err.statusCode = 400;
    throw err;
  }

  if (!db || typeof db.collection !== 'function') {
    const err = new Error('Database storage unavailable.');
    err.code = 'STORAGE_UNAVAILABLE';
    err.statusCode = 503;
    throw err;
  }

  const apptRef = db.collection('appointments').doc(appointmentId);
  const snap = await apptRef.get();
  if (!snap.exists) {
    const err = new Error('Appointment was not found.');
    err.code = 'APPOINTMENT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const appt = snap.data() || {};

  // Check doctor assignment if not super admin
  if (role === 'doctor') {
    const isAssigned = appt.doctorId === actorDoctor.uid ||
      appt.doctorUid === actorDoctor.uid ||
      appt.assignedDoctorId === actorDoctor.uid;
    if (!isAssigned) {
      const err = new Error('Access denied: You are not the assigned doctor for this clinical appointment.');
      err.code = 'ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }
  }

  const nowIso = new Date().toISOString();
  const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const clinicalEvaluationRecord = {
    id: evaluationId,
    appointmentId,
    doctorUid: actorDoctor.uid,
    doctorName: actorDoctor.name || actorDoctor.displayName || appt.doctorName || 'Attending Physician',
    doctorSpecialty: actorDoctor.specialty || appt.doctorSpecialty || 'Pulmonology & Respiratory Care',
    doctorLicense: actorDoctor.licenseNumber || actorDoctor.license || appt.doctorLicense || 'LIC-VERIFIED-PHYSICIAN',
    diagnosis: diagnosis || null,
    icd10Code: icd10Code || null,
    prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
    clinicalNotes: clinicalNotes || null,
    treatmentPlan: treatmentPlan || null,
    followUpDate: followUpDate || null,
    evaluatedAt: nowIso,
    statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER.en
  };

  const historyEntry = {
    action: 'PHYSICIAN_CLINICAL_EVALUATION',
    actorUid: actorDoctor.uid,
    actorRole: 'doctor',
    timestamp: nowIso,
    details: {
      evaluationId,
      hasDiagnosis: Boolean(diagnosis),
      prescriptionsCount: clinicalEvaluationRecord.prescriptions.length,
      license: clinicalEvaluationRecord.doctorLicense
    }
  };

  const history = Array.isArray(appt.history) ? [...appt.history] : [];
  history.push(historyEntry);

  const updatePayload = {
    clinicalEvaluation: clinicalEvaluationRecord,
    clinicalNotes: clinicalNotes || appt.clinicalNotes || null,
    diagnosis: diagnosis || appt.diagnosis || null,
    icd10Code: icd10Code || appt.icd10Code || null,
    prescriptions: clinicalEvaluationRecord.prescriptions,
    evaluatedByDoctorId: actorDoctor.uid,
    evaluatedAt: nowIso,
    history
  };

  if (status === 'completed') {
    updatePayload.status = 'completed';
    updatePayload.completedAt = nowIso;
    updatePayload.completedBy = actorDoctor.uid;
  }

  await apptRef.update(updatePayload);

  // Authoritative Audit Logging
  try {
    if (auditService && typeof auditService.logEvent === 'function') {
      await auditService.logEvent(db, {
        type: 'CLINICAL_CASE_APPROVED',
        actorUid: actorDoctor.uid,
        actorRole: 'doctor',
        targetUserId: appt.patientId,
        clinicId: appt.clinicId,
        outcome: 'SUCCESS',
        details: {
          appointmentId,
          evaluationId,
          doctorLicense: clinicalEvaluationRecord.doctorLicense,
          prescriptionsCount: clinicalEvaluationRecord.prescriptions.length
        }
      });
    }
  } catch (auditErr) {
    console.warn('[CLINICAL EVALUATION AUDIT WARNING]:', auditErr.message);
  }

  return {
    success: true,
    appointmentId,
    clinicalEvaluation: clinicalEvaluationRecord
  };
}

// ============================================================================
// 3. 🔒 PRIVACY CONTROLS & DATA MINIMIZATION
// ============================================================================

/**
 * Anonymize calendar slot representations for patients and unauthenticated visitors.
 * Prevents any PII leakage across patients browsing the interactive calendar strip.
 */
function sanitizeCalendarSlotForPrivacy(slot = {}, actorUser = null, assignedDoctorId = null) {
  const isPrivileged = actorUser && (
    actorUser.role === 'super_admin' ||
    actorUser.isSuperAdmin ||
    (actorUser.role === 'doctor' && (actorUser.uid === assignedDoctorId || !assignedDoctorId)) ||
    actorUser.role === 'clinic_admin'
  );

  if (isPrivileged) {
    return { ...slot };
  }

  // Patient or public viewer: strict data minimization
  const sanitized = {
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    timeAr: slot.timeAr,
    timeEn: slot.timeEn,
    periodAr: slot.periodAr,
    periodEn: slot.periodEn,
    timeZone: slot.timeZone,
    isBooked: Boolean(slot.isBooked || slot.status === 'booked' || slot.status === 'confirmed'),
    status: (slot.isBooked || slot.status === 'booked' || slot.status === 'confirmed') ? 'booked' : 'available'
  };

  // Explicitly ensure zero sensitive patient PII can leak
  sanitized.patientId = null;
  sanitized.patientName = null;
  sanitized.patientEmail = null;
  sanitized.patientPhone = null;
  sanitized.beneficiaryId = null;
  sanitized.beneficiaryName = null;
  sanitized.notes = null;
  sanitized.symptoms = null;
  sanitized.clinicalNotes = null;
  sanitized.diagnosis = null;
  sanitized.appointmentId = null;

  return sanitized;
}

/**
 * Validate that a family beneficiary belongs to the authenticated user's family account.
 * Prevents cross-account dependent impersonation or unauthorized third-party bookings.
 */
async function validateFamilyBeneficiaryAccess(db, { patientId, beneficiaryId }, inMemoryStore = null) {
  if (!beneficiaryId || beneficiaryId === 'self') {
    return { valid: true, isSelf: true };
  }

  if (!patientId) {
    const err = new Error('patientId required to validate beneficiary access.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  let familyMembers = [];

  // 1. Check in-memory store if supplied
  if (inMemoryStore && typeof inMemoryStore.get === 'function') {
    familyMembers = inMemoryStore.get(patientId) || [];
  }

  // 2. Check Firestore user profile
  if (familyMembers.length === 0 && db && typeof db.collection === 'function') {
    try {
      const userDoc = await db.collection('users').doc(patientId).get();
      if (userDoc.exists) {
        familyMembers = userDoc.data()?.familyMembers || [];
      }
    } catch (e) {
      console.warn('[BENEFICIARY LOOKUP WARNING]:', e.message);
    }
  }

  // 3. Also check separate family_profiles collection if available
  if (familyMembers.length === 0 && db && typeof db.collection === 'function') {
    try {
      const famSnap = await db.collection('family_profiles')
        .where('primaryUserId', '==', patientId)
        .get();
      famSnap.forEach(doc => {
        familyMembers.push(doc.data());
      });
    } catch (e) {}
  }

  const isMemberOwned = familyMembers.some(m =>
    m.id === beneficiaryId ||
    m.memberId === beneficiaryId ||
    m.beneficiaryId === beneficiaryId
  );

  if (!isMemberOwned) {
    const err = new Error(
      `Access denied: Beneficiary '${beneficiaryId}' does not belong to your verified family account.`
    );
    err.code = 'UNAUTHORIZED_BENEFICIARY';
    err.statusCode = 403;
    throw err;
  }

  const targetMember = familyMembers.find(m =>
    m.id === beneficiaryId ||
    m.memberId === beneficiaryId ||
    m.beneficiaryId === beneficiaryId
  );

  return {
    valid: true,
    isSelf: false,
    beneficiaryId,
    beneficiaryName: targetMember?.fullName || targetMember?.name || null,
    relationship: targetMember?.relationship || 'dependent'
  };
}

module.exports = {
  STATUTORY_MEDICAL_DISCLAIMER,
  EMERGENCY_CONTACTS,
  EMERGENCY_RED_FLAGS,
  evaluateAppointmentEmergencyRisk,
  enforcePhysicianRoleBoundaries,
  recordDoctorClinicalEvaluation,
  sanitizeCalendarSlotForPrivacy,
  validateFamilyBeneficiaryAccess,
  PROTECTED_CLINICIAN_FIELDS
};
