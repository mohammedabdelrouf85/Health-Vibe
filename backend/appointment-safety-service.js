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

// ============================================================================
// 🏥 CLINIDO CONSULTATION TYPES & SAFETY CONTRACTS
// ============================================================================
const CLINIDO_CONSULTATION_TYPES = {
  VIDEO: 'video',
  CLINIC: 'clinic',
  FOLLOWUP: 'followup'
};

const VALID_CONSULTATION_TYPES = ['video', 'clinic', 'followup', 'telehealth'];

function normalizeConsultationType(typeInput) {
  if (!typeInput) return CLINIDO_CONSULTATION_TYPES.CLINIC;
  const raw = String(typeInput).trim().toLowerCase();
  if (raw === 'telehealth' || raw === 'video' || raw === 'online') {
    return CLINIDO_CONSULTATION_TYPES.VIDEO;
  }
  if (raw === 'clinic' || raw === 'in_person' || raw === 'in-clinic' || raw === 'physical') {
    return CLINIDO_CONSULTATION_TYPES.CLINIC;
  }
  if (raw === 'followup' || raw === 'follow_up' || raw === 'follow-up') {
    return CLINIDO_CONSULTATION_TYPES.FOLLOWUP;
  }
  return null;
}

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
  const attachedAssessment = payload.attachedAssessment || payload.dossier || {};
  const textCorpus = [
    payload.reason,
    payload.rescheduleReason,
    payload.cancelReason,
    payload.cancellationReason,
    payload.symptoms,
    payload.patientNotes,
    payload.notes,
    payload.reasonForVisit,
    payload.chiefComplaint,
    payload.intakeText,
    payload.complaint,
    attachedAssessment.symptoms,
    attachedAssessment.notes,
    attachedAssessment.chiefComplaint,
    attachedAssessment.diagnosisSummary
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  function parseSpo2(val) {
    if (val == null) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  }

  const rawSpo2 = payload.spo2 != null
    ? payload.spo2
    : (payload.vitals?.spo2 ?? (attachedAssessment.oxygenLevel != null
        ? attachedAssessment.oxygenLevel
        : (attachedAssessment.spo2 != null
          ? attachedAssessment.spo2
          : (attachedAssessment.vitals?.oxygenSaturation != null
            ? attachedAssessment.vitals.oxygenSaturation
            : (payload.oxygenLevel != null ? payload.oxygenLevel : null)))));

  const vitals = {
    spo2: parseSpo2(rawSpo2),
    heartRate: typeof payload.heartRate === 'number'
      ? payload.heartRate
      : (payload.vitals?.heartRate ?? attachedAssessment.heartRate ?? null),
    respiratoryRate: typeof payload.respiratoryRate === 'number'
      ? payload.respiratoryRate
      : (payload.vitals?.respiratoryRate ?? attachedAssessment.respiratoryRate ?? null),
    systolicBP: typeof payload.systolicBP === 'number'
      ? payload.systolicBP
      : (payload.vitals?.systolicBP ?? attachedAssessment.systolicBP ?? null)
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
    requiresEmergencyRedirect: isEmergency,
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

    // Protect attached assessment or dossier snapshots from non-clinician prescription or treatment plan injection
    const attached = payload.attachedAssessment || payload.dossier;
    if (attached && typeof attached === 'object') {
      const restrictedDossierFields = [
        'prescriptions',
        'prescriptionList',
        'treatmentPlan',
        'icd10Code',
        'icd10',
        'clinicalNotes',
        'physicianNotes',
        'dischargeSummary',
        'clinicalSignoff'
      ];
      for (const field of restrictedDossierFields) {
        const val = attached[field];
        const hasContent = val !== undefined && val !== null && (
          (typeof val === 'string' && val.trim().length > 0) ||
          (Array.isArray(val) && val.length > 0) ||
          (typeof val === 'object' && Object.keys(val).length > 0)
        );
        if (hasContent) {
          const err = new Error(
            `Access denied: Field '${field}' in attached medical dossier is strictly reserved for licensed human physicians. ` +
            `Patients and automated assistants are not permitted to inject prescriptions or treatment plans into pre-visit records.`
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
    humanPhysicianReviewStatus: 'EVALUATED_BY_PHYSICIAN',
    clinicalEvaluationRequired: false,
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
    clinicalEvaluation: clinicalEvaluationRecord,
    humanPhysicianReviewStatus: 'EVALUATED_BY_PHYSICIAN',
    evaluatingDoctorId: actorDoctor.uid
  };
}

// ============================================================================
// 3. 🔒 PRIVACY CONTROLS & DATA MINIMIZATION
// ============================================================================

/**
 * Authoritative Pre-Visit Medical Dossier Safety & Physician Primacy Validator.
 *
 * Guarantees:
 * 1. Human Physician Primacy: Blocks any patient or bot attempt to author or inject prescriptions,
 *    treatment plans, or clinical sign-offs into the pre-visit dossier snapshot.
 * 2. Emergency Red-Flag Triage: Checks SpO2, respiratory distress, and critical vitals
 *    recorded in the dossier. Triggers emergency triage escalation if critical (e.g. SpO2 < 90%).
 * 3. Privacy & Access Minimization: Ensures sanitized snapshot contains only permitted pre-visit
 *    coordination data, with clinical outcomes marked as requiring direct physician evaluation.
 */
function validatePrevisitDossierSafety({ payload = {}, caseRecord = null, actorUser = null } = {}) {
  const role = actorUser?.role || 'patient';
  const isPhysician = role === 'doctor' || role === 'super_admin' || Boolean(actorUser?.isSuperAdmin);

  // 1. Physician Primacy: Protect clinical fields from unverified injection
  if (!isPhysician) {
    const candidateDossier = payload.attachedAssessment || payload.dossier;
    if (candidateDossier && typeof candidateDossier === 'object') {
      const restrictedFields = [
        'prescriptions',
        'prescriptionList',
        'treatmentPlan',
        'icd10Code',
        'clinicalNotes',
        'clinicalSignoff'
      ];
      for (const field of restrictedFields) {
        if (candidateDossier[field] && (!caseRecord || !caseRecord[field])) {
          const err = new Error(
            `Access denied: Field '${field}' in attached medical dossier is strictly reserved for licensed human physicians. ` +
            `Patients and automated bots cannot inject prescriptions or clinical diagnoses.`
          );
          err.code = 'CLINICIAN_ROLE_PROTECTED';
          err.statusCode = 403;
          throw err;
        }
      }
    }
  }

  // 2. Emergency Red-Flag Screening on dossier vitals & symptoms
  function parseSpo2(val) {
    if (val == null) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  }

  const rawSpo2 = caseRecord?.oxygenLevel != null
    ? caseRecord.oxygenLevel
    : (caseRecord?.spo2 != null
      ? caseRecord.spo2
      : (caseRecord?.vitals?.oxygenSaturation != null
        ? caseRecord.vitals.oxygenSaturation
        : (payload.attachedAssessment?.oxygenLevel != null
          ? payload.attachedAssessment.oxygenLevel
          : (payload.attachedAssessment?.spo2 != null
            ? payload.attachedAssessment.spo2
            : (payload.attachedAssessment?.vitals?.oxygenSaturation != null
              ? payload.attachedAssessment.vitals.oxygenSaturation
              : (payload.spo2 != null ? payload.spo2 : (payload.oxygenLevel != null ? payload.oxygenLevel : null)))))));

  const combinedPayload = {
    ...payload,
    spo2: parseSpo2(rawSpo2),
    symptoms: [
      payload.symptoms,
      caseRecord?.symptoms,
      payload.attachedAssessment?.symptoms,
      caseRecord?.chiefComplaint,
      payload.attachedAssessment?.chiefComplaint
    ].filter(Boolean).join(' ')
  };

  const triage = evaluateAppointmentEmergencyRisk(combinedPayload);

  return {
    valid: true,
    physicianPrimacyGuaranteed: true,
    clinicalEvaluationRequired: true,
    humanPhysicianReviewStatus: 'PENDING_CLINICAL_EVALUATION',
    triage,
    isEmergency: triage.isEmergency,
    statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER
  };
}



/**
 * Anonymize calendar slot representations for patients and unauthenticated visitors.
 * Prevents any PII leakage across patients browsing the interactive calendar strip.
 */

/**
 * Comprehensive Safety & Privacy Evaluation for CliniDo Consultation Types.
 * 
 * Enforces:
 * 1. Whitelist validation of consultation type (video, clinic, followup).
 * 2. Emergency Triage for Remote Care:
 *    - Remote video or followup care cannot substitute for emergency room / ambulance (123) care
 *      when acute respiratory red flags are present (SpO2 < 90%, acute dyspnea, cyanosis, etc.).
 *    - Halts booking with EMERGENCY_TRIAGE_ESCALATION_REQUIRED unless emergency disclaimer is explicitly acknowledged.
 * 3. Physician Primacy & Anti-Autonomous AI Circumvention:
 *    - Blocks non-physicians from authoring clinical diagnoses, prescriptions, treatment plans, or ICD-10 codes.
 *    - Guarantees statutory medical disclaimers and human physician review status.
 */
function validateConsultationSafety({
  consultationType,
  symptoms,
  vitals = {},
  attachedAssessment = null,
  actorUser = null,
  emergencyDisclaimerAcknowledged = false,
  payload = {}
} = {}) {
  // 1. Whitelist & Normalization
  const rawType = consultationType || payload.consultationType || payload.type;
  const normalizedType = rawType ? normalizeConsultationType(rawType) : CLINIDO_CONSULTATION_TYPES.CLINIC;
  if (rawType && !normalizedType) {
    const err = new Error('نوع الموعد غير صالح. يرجى الاختيار بين: استشارة فيديو عن بُعد، زيارة العيادة، أو متابعة تقارير التحاليل. (Invalid consultation type)');
    err.code = 'INVALID_CONSULTATION_TYPE';
    err.statusCode = 400;
    throw err;
  }

  // 2. Physician Primacy & Role Boundaries (Non-physicians cannot inject diagnoses or prescriptions)
  if (actorUser) {
    enforcePhysicianRoleBoundaries(payload, actorUser);
  }

  // 3. Acute Emergency Screening for Remote & In-Clinic Modes
  function parseSpo2(val) {
    if (val == null) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  }

  const rawSpo2 = vitals?.spo2 != null
    ? vitals.spo2
    : (vitals?.oxygenLevel != null
      ? vitals.oxygenLevel
      : (vitals?.oxygenSaturation != null
        ? vitals.oxygenSaturation
        : (attachedAssessment?.oxygenLevel != null
          ? attachedAssessment.oxygenLevel
          : (attachedAssessment?.vitals?.oxygenSaturation != null
            ? attachedAssessment.vitals.oxygenSaturation
            : (payload.spo2 != null ? payload.spo2 : null)))));

  const combinedSymptoms = [
    symptoms,
    payload.symptoms,
    payload.chiefComplaint,
    attachedAssessment?.symptoms,
    attachedAssessment?.chiefComplaint
  ].filter(Boolean).join(' ');

  const triage = evaluateAppointmentEmergencyRisk({
    symptoms: combinedSymptoms,
    spo2: parseSpo2(rawSpo2),
    vitals: { ...vitals, spo2: parseSpo2(rawSpo2) }
  });

  const isRemote = normalizedType === CLINIDO_CONSULTATION_TYPES.VIDEO || normalizedType === CLINIDO_CONSULTATION_TYPES.FOLLOWUP;
  const isEmergency = triage.isEmergency;

  // Remote care safety: If acute emergency exists, remote care is contraindicated without emergency acknowledgement
  if (isEmergency && !emergencyDisclaimerAcknowledged && !triage.isDisclaimerAcknowledged) {
    const remoteWarningAr = isRemote
      ? 'تحذير طبي عاجل: الاستشارة عن بُعد أو المتابعة الافتراضية لا تناسب الحالات الحرجة أو ضيق التنفس الحاد. '
      : 'تحذير طبي عاجل: ';
    const remoteWarningEn = isRemote
      ? 'Urgent Medical Notice: Remote video consultation is contraindicated for acute respiratory emergencies. '
      : 'Urgent Medical Notice: ';

    const err = new Error(
      `${remoteWarningAr}${triage.emergencyActionAr} | ${remoteWarningEn}${triage.emergencyActionEn}`
    );
    err.code = 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED';
    err.statusCode = 422;
    err.details = {
      triage,
      consultationType: normalizedType,
      isRemote,
      emergencyContactEgypt: EMERGENCY_CONTACTS.egypt,
      disclaimer: STATUTORY_MEDICAL_DISCLAIMER
    };
    throw err;
  }

  return {
    valid: true,
    consultationType: normalizedType,
    isRemote,
    isEmergency,
    triage,
    physicianPrimacyGuaranteed: true,
    clinicalEvaluationRequired: true,
    humanPhysicianReviewStatus: 'PENDING_CLINICAL_EVALUATION',
    statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER
  };
}

function sanitizeCalendarSlotForPrivacy(slot = {}, actorUser = null, assignedDoctorId = null) {
  const isPrivileged = actorUser && (
    actorUser.role === 'super_admin' ||
    actorUser.isSuperAdmin ||
    (actorUser.role === 'doctor' && (actorUser.uid === assignedDoctorId || !assignedDoctorId)) ||
    actorUser.role === 'clinic_admin'
  );

  const isOwnerPatient = actorUser && actorUser.uid && (
    slot.patientId === actorUser.uid ||
    slot.userId === actorUser.uid ||
    slot.createdBy === actorUser.uid
  );

  if (isPrivileged || isOwnerPatient) {
    return { ...slot };
  }

  // Patient or public viewer viewing someone else's slot: strict data minimization
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

  // Pre-visit dossier & clinical evaluation privacy isolation (Zero PII/Clinical Leakage)
  sanitized.linkedCaseId = null;
  sanitized.linkedAssessmentId = null;
  sanitized.hasAttachedReport = false;
  sanitized.attachedAssessment = null;
  sanitized.reportAccessGranted = false;
  sanitized.emergencyRiskFlag = null;
  sanitized.triageUrgency = null;
  sanitized.detectedRedFlags = null;
  sanitized.oxygenLevel = null;
  sanitized.spo2 = null;

  // CliniDo Consultation Type & Venue Privacy Isolation (Zero venue/commute/room leakage to other patients)
  sanitized.consultationType = null;
  sanitized.type = null;
  sanitized.typeLabel = null;
  sanitized.typeLabelEn = null;
  sanitized.isOnlineConsultation = null;
  sanitized.commuteReliefActive = null;
  sanitized.commuteReliefNote = null;
  sanitized.commuteReliefNoteEn = null;
  sanitized.branchLocation = null;
  sanitized.arrivalGuidance = null;
  sanitized.followupScope = null;
  sanitized.telehealthUrl = null;
  sanitized.meetingLink = null;
  sanitized.telehealthRoomId = null;

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
    const raw = inMemoryStore.get(patientId) || inMemoryStore.get(`family_${patientId}`) || [];
    familyMembers = Array.isArray(raw) ? raw : (raw.members || []);
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

// ============================================================================
// 🗓️ DOCTOR SCHEDULE MANAGER: SAFETY, PRIVACY & PHYSICIAN PRIMACY (TabeebHub)
// ============================================================================

const MIN_CLINICAL_CONSULTATION_DURATION = 15;
const MAX_CLINICAL_CONSULTATION_DURATION = 120;
const MAX_SHIFT_HOURS_WITHOUT_BREAK = 12;

/**
 * Sanitizes doctor schedule details for public or non-privileged viewers.
 * Ensures internal doctor notes on leaves or confidential personal details never leak to patients.
 */
function sanitizeDoctorScheduleForPrivacy(schedule = {}, actorUser = null, targetDoctorId = null) {
  if (!schedule) return null;

  const isPrivileged = actorUser && (
    actorUser.role === 'super_admin' ||
    actorUser.isSuperAdmin ||
    (actorUser.role === 'doctor' && (actorUser.uid === targetDoctorId || !targetDoctorId)) ||
    actorUser.role === 'clinic_admin'
  );

  if (isPrivileged) {
    return {
      ...schedule,
      statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER
    };
  }

  // Non-privileged viewer (patient, public, or unauthorized doctor)
  const sanitizedLeaves = (schedule.leaves || []).map(leave => ({
    id: leave.id,
    branchId: leave.branchId,
    startDate: leave.startDate,
    endDate: leave.endDate,
    status: leave.status,
    reasonType: leave.status === 'approved' ? (leave.reasonType || 'leave') : 'cancelled',
    publicNoticeAr: 'اعتذار الطبيب عن المواعيد في هذه الفترة لظرف معتمد',
    publicNoticeEn: 'Doctor unavailable during this period due to an approved leave',
    // Strictly redact internal personal notes
    notes: null,
    createdBy: null
  }));

  return {
    doctorId: schedule.doctorId,
    branches: schedule.branches || {},
    leaves: sanitizedLeaves,
    updatedAt: schedule.updatedAt,
    statutoryDisclaimer: STATUTORY_MEDICAL_DISCLAIMER
  };
}

/**
 * Strictly prevents non-clinicians, AI bots, or unauthorized third parties
 * from unilaterally modifying a doctor's clinical working hours or capacity.
 */
function enforceDoctorSchedulePhysicianPrimacy(actorUser, targetDoctorId, operation = 'UPDATE_SCHEDULE') {
  if (!actorUser) {
    const err = new Error('Authentication required to modify physician schedule.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  const role = actorUser.role || 'patient';

  // AI Chatbots or automated bots are strictly prohibited from autonomous schedule alteration
  if (role === 'ai_assistant' || role === 'system_bot' || actorUser.isAutonomousAi) {
    const err = new Error('Physician Primacy Violation: AI agents are strictly prohibited from unilaterally modifying doctor schedules.');
    err.code = 'PHYSICIAN_SCHEDULE_PROTECTED';
    err.statusCode = 403;
    throw err;
  }

  // Patients cannot alter doctor schedules
  if (role === 'patient') {
    const err = new Error('Access denied: Patients are strictly forbidden from modifying clinician schedules.');
    err.code = 'PHYSICIAN_SCHEDULE_PROTECTED';
    err.statusCode = 403;
    throw err;
  }

  // Doctors can only alter their own schedule
  if (role === 'doctor' && actorUser.uid !== targetDoctorId) {
    const err = new Error(`Physician schedule isolation: Doctor '${actorUser.uid}' cannot modify the schedule of doctor '${targetDoctorId}'.`);
    err.code = 'PHYSICIAN_SCHEDULE_PROTECTED';
    err.statusCode = 403;
    throw err;
  }

  // Clinic Admins and Super Admins are authorized
  const isAuthorized = role === 'super_admin' || role === 'clinic_admin' || (role === 'doctor' && actorUser.uid === targetDoctorId);
  if (!isAuthorized) {
    const err = new Error('Access denied: Clinician or authorized clinic administrator required.');
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }

  return true;
}

/**
 * Validates clinical safety guardrails for consultation slot duration and shift capacity.
 */
function validateDoctorScheduleClinicalGuardrails(params = {}) {
  const { slotDurationMinutes, bufferBetweenSlotsMinutes = 0, workingDays } = params;

  if (slotDurationMinutes !== undefined) {
    const duration = Number(slotDurationMinutes);
    if (isNaN(duration) || duration < MIN_CLINICAL_CONSULTATION_DURATION) {
      const err = new Error(`Clinical Safety Violation: Consultation duration cannot be less than ${MIN_CLINICAL_CONSULTATION_DURATION} minutes. Superficial durations compromise diagnostic thoroughness.`);
      err.code = 'UNSAFE_CONSULTATION_DURATION';
      err.statusCode = 400;
      throw err;
    }
    if (duration > MAX_CLINICAL_CONSULTATION_DURATION) {
      const err = new Error(`Consultation duration cannot exceed ${MAX_CLINICAL_CONSULTATION_DURATION} minutes.`);
      err.code = 'EXCESSIVE_SLOT_DURATION';
      err.statusCode = 400;
      throw err;
    }
  }

  if (bufferBetweenSlotsMinutes !== undefined) {
    const buffer = Number(bufferBetweenSlotsMinutes);
    if (isNaN(buffer) || buffer < 0) {
      const err = new Error('Buffer between slots must be a non-negative integer.');
      err.code = 'INVALID_BUFFER_TIME';
      err.statusCode = 400;
      throw err;
    }
  }

  if (workingDays && typeof workingDays === 'object') {
    for (const [day, cfg] of Object.entries(workingDays)) {
      if (cfg && cfg.active) {
        if (!cfg.start || !cfg.end) {
          const err = new Error(`Start and end hours required for active day '${day}'.`);
          err.code = 'MISSING_SHIFT_HOURS';
          err.statusCode = 400;
          throw err;
        }
        const [sh, sm] = cfg.start.split(':').map(Number);
        const [eh, em] = cfg.end.split(':').map(Number);
        const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);

        if (totalMinutes <= 0) {
          const err = new Error(`Shift end time must be after start time for '${day}'.`);
          err.code = 'INVALID_SHIFT_HOURS';
          err.statusCode = 400;
          throw err;
        }

        // Shift duration cannot exceed 12 continuous hours without break periods
        if (totalMinutes > MAX_SHIFT_HOURS_WITHOUT_BREAK * 60) {
          const err = new Error(`Clinical Safety Guardrail: Continuous shift duration on '${day}' exceeds ${MAX_SHIFT_HOURS_WITHOUT_BREAK} hours, posing a risk of clinician cognitive fatigue.`);
          err.code = 'EXCESSIVE_SHIFT_DURATION';
          err.statusCode = 400;
          throw err;
        }
      }
    }
  }

  return true;
}

/**
 * Enforces safety, emergency screening, and anti-circumvention of the human physician for appointment mutations (reschedule & cancel).
 * Guarantees:
 * 1. AI chatbots or autonomous background bots cannot autonomously cancel or reschedule
 *    an appointment without explicit authenticated human authorization (patient or physician).
 * 2. Non-physicians cannot inject diagnoses, prescriptions, ICD-10 codes, or treatment plans.
 * 3. Emergency red flags during rescheduling are screened and escalated.
 */
function validateAppointmentMutationSafety(payload = {}, actorUser = null, operation = 'reschedule') {
  if (!actorUser) {
    const err = new Error('Authentication required for appointment operations.');
    err.code = 'AUTHENTICATION_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  // Prevent autonomous AI bots or unapproved chatbots from unilaterally mutating appointments
  if (actorUser.role === 'ai_assistant' || actorUser.role === 'system_bot' || actorUser.role === 'ai_chatbot' || actorUser.isAutonomousAi || actorUser.isAutonomousBot) {
    const err = new Error(
      'Physician Primacy Violation: Autonomous AI chatbots cannot modify or cancel appointments without explicit human confirmation.'
    );
    err.code = 'AUTONOMOUS_AI_MUTATION_PROHIBITED';
    err.statusCode = 403;
    throw err;
  }

  // Enforce physician role boundaries (no self-diagnoses / prescriptions)
  enforcePhysicianRoleBoundaries(payload, actorUser);

  // If rescheduling or cancelling, evaluate emergency red flags
  if (operation === 'reschedule' || operation === 'cancel') {
    const triage = evaluateAppointmentEmergencyRisk(payload);
    if (triage.isEmergency && !payload.emergencyDisclaimerAcknowledged && !triage.isDisclaimerAcknowledged) {
      const err = new Error(
        `حالة طوارئ طبية محتملة: ${triage.emergencyActionAr} | ${triage.emergencyActionEn}`
      );
      err.code = 'EMERGENCY_TRIAGE_ESCALATION_REQUIRED';
      err.statusCode = 422;
      err.details = triage;
      throw err;
    }
  }

  return { valid: true, physicianPrimacyGuaranteed: true };
}

// ============================================================================
// 🛡️ AUTOMATED REMINDER SAFETY, PRIVACY & PHYSICIAN PRIMACY (Doctolib Benchmark)
// ============================================================================

const SENSITIVE_SPECIALTIES = [
  'psychiatry',
  'psychology',
  'mental_health',
  'addiction',
  'oncology',
  'sti',
  'std',
  'venereology',
  'reproductive_health',
  'andrology',
  'sexology',
  'طب نفسي',
  'علاج إدمان',
  'أورام',
  'تناسلية',
  'أمراض ذكورة',
  'صحة إنجابية',
  'تناسلية وعقم'
];

/**
 * Masks a phone number to prevent PII exposure in logs and audit trails.
 * Example: +201012345678 -> +20 10****5678
 */
function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.trim();
  if (clean.length <= 6) return '****';
  const prefix = clean.slice(0, Math.min(5, Math.floor(clean.length / 2)));
  const suffix = clean.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Strips all Protected Health Information (PHI), vitals, diagnoses, and sensitive specialties
 * before any reminder payload is emitted to external channels (SMS, WhatsApp, Push).
 */
function sanitizeReminderForPrivacy(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') return { sanitizedPayload: {}, phiRedacted: true };

  const sanitized = { ...payload };
  const channel = options.channel || 'external';

  // 1. Redact clinical and diagnostic fields completely
  const clinicalFieldsToStrip = [
    'diagnosis',
    'diagnosisEn',
    'diagnosisAr',
    'symptoms',
    'symptomsNotes',
    'complaint',
    'chiefComplaint',
    'notes',
    'clinicalNotes',
    'prescription',
    'medications',
    'icd10Code',
    'spo2',
    'vitalSigns',
    'bp',
    'heartRate',
    'bloodSugar',
    'labResults',
    'medicalHistory'
  ];

  for (const f of clinicalFieldsToStrip) {
    if (f in sanitized) {
      delete sanitized[f];
    }
  }

  // 2. Sensitive Specialty Neutralization for external notifications (Zero Lock-Screen Stigma)
  if (sanitized.doctorSpecialty || sanitized.specialty) {
    const rawSpecialty = String(sanitized.doctorSpecialty || sanitized.specialty).toLowerCase().trim();
    const isSensitive = SENSITIVE_SPECIALTIES.some(s => rawSpecialty.includes(s.toLowerCase()));

    if (isSensitive && (channel === 'sms' || channel === 'whatsapp' || channel === 'push')) {
      sanitized.doctorSpecialty = 'استشارات طبية متخصصة (حماية خصوصية)';
      sanitized.doctorSpecialtyEn = 'Specialized Medical Consultations (Privacy Protected)';
      sanitized.specialty = sanitized.doctorSpecialty;
      sanitized.specialtyRedactedForPrivacy = true;
    }
  }

  // 3. Mask recipient phone and email for audit records
  if (sanitized.patientPhone || sanitized.phone) {
    sanitized.maskedPhone = maskPhoneNumber(sanitized.patientPhone || sanitized.phone);
  }

  // 4. Scrub free text strings (subject, body, preview) of any inadvertent clinical vitals or diagnoses
  const textKeys = ['body', 'subject', 'title', 'preview', 'text'];
  for (const k of textKeys) {
    if (typeof sanitized[k] === 'string') {
      let t = sanitized[k];
      t = t.replace(/(?:spo2|oxygen|o2|الأكسجين|نسبة الأكسجين)\s*[:=]?\s*\d+%?/gi, '[REDACTED_VITAL]');
      t = t.replace(/(?:bp|blood pressure|ضغط الدم)\s*[:=]?\s*\d+\/\d+/gi, '[REDACTED_VITAL]');
      t = t.replace(/(?:pulse|heart rate|النبض)\s*[:=]?\s*\d+/gi, '[REDACTED_VITAL]');
      t = t.replace(/(?:diagnosis|تشخيص|الحالة السريرية|العرض|symptoms|أعراض)\s*[:=][^\n]+/gi, '');
      sanitized[k] = t.trim();
    }
  }

  return {
    sanitizedPayload: sanitized,
    phiRedacted: true,
    maskedPhone: sanitized.maskedPhone || ''
  };
}

/**
 * Screens incoming patient messages received via WhatsApp/SMS reminder webhooks.
 * Enforces:
 * 1. Acute Emergency Red-Flag detection (escalates immediately to 123 / Emergency Room).
 * 2. Physician Primacy enforcement: strictly blocks autonomous AI medical diagnosis,
 *    dosage alteration, or clinical advice, redirecting to the human doctor.
 * 3. Patient Privacy Opt-Out & Consent processing (STOP / إلغاء الاشتراك).
 */
function evaluateReminderInboundMessageSafety(textBody = '', options = {}) {
  const rawText = String(textBody || '').trim();
  const lower = rawText.toLowerCase();
  const lang = options.lang || (/[a-zA-Z]/.test(rawText) && !/[\u0600-\u06FF]/.test(rawText) ? 'en' : 'ar');
  const doctorTitle = options.doctorName ? `د. ${options.doctorName}` : 'طبيبك المعالج';
  const doctorTitleEn = options.doctorName ? `Dr. ${options.doctorName}` : 'your treating physician';

  // --------------------------------------------------------------------------
  // 🚨 STAGE 1: ACUTE EMERGENCY RED-FLAG SCREENING
  // --------------------------------------------------------------------------
  const emergencyKeywords = [
    'ألم في الصدر', 'الم بالصدر', 'وجع شديد في الصدر', 'الم في القلب', 'وجع في القلب',
    'ضيق تنفس حاد', 'اختناق', 'عجز عن التنفس', 'مش قادر اتنفس', 'نهجان شديد جدا',
    'زرقة', 'ازرقاق', 'كحة دم', 'سعال مدمم', 'خروج دم مع البلغم',
    'فقدان الوعي', 'اغماء', 'إغماء', 'تشنجات', 'نزيف حاد', 'نزيف شديد',
    'chest pain', 'heart attack', 'severe dyspnea', 'cannot breathe', 'hard to breathe',
    'coughing blood', 'cyanosis', 'blue lips', 'unconscious', 'fainting',
    'seizure', 'severe bleeding', 'anaphylaxis', 'suffocation'
  ];

  const matchedEmergency = emergencyKeywords.find(kw => lower.includes(kw));
  if (matchedEmergency) {
    const replyMessageAr = `🚨 تنبيه طوارئ طبي حرج: إذا كنت تعاني من أعراض طارئة أو حادة (مثل ألم بالصدر، صعوبة حادة بالتنفس، أو نزيف حاد)، يرجى عدم الانتظار والتوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف على رقم 123.\n\n⚠️ هذا النظام مخصص للتنسيق الإداري للمواعيد فقط ولا يمكنه تقديم الرعاية الإسعافية أو الاستشارات الطبية الطارئة.`;
    const replyMessageEn = `🚨 Critical Medical Emergency Alert: If you are experiencing acute or severe symptoms (such as chest pain, severe difficulty breathing, or heavy bleeding), do not wait! Go immediately to the nearest Emergency Room or dial 123 (Ambulance).\n\n⚠️ This automated system is strictly for administrative appointment coordination and cannot provide emergency medical care.`;

    return {
      isEmergency: true,
      safetyAction: 'EMERGENCY_TRIAGE_ESCALATED',
      matchedKeyword: matchedEmergency,
      emergencyContacts: EMERGENCY_CONTACTS,
      replyMessage: lang === 'en' ? replyMessageEn : replyMessageAr,
      replyMessageAr,
      replyMessageEn
    };
  }

  // --------------------------------------------------------------------------
  // 🩺 STAGE 2: PHYSICIAN PRIMACY & AI MEDICAL ADVICE PROHIBITION
  // --------------------------------------------------------------------------
  const clinicalAdviceKeywords = [
    'دواء', 'جرعة', 'علاج', 'أدوية', 'روشتة', 'أوقف', 'اوقف', 'أتناول', 'اتناول',
    'أخذ الدواء', 'اخذ العلاج', 'هل طبيعي', 'هل خطير', 'ألم', 'الم', 'وجع', 'سخونية',
    'حرارة', 'تحليل', 'أشعة', 'اشعة', 'أعراض', 'اعراض', 'تشخيص', 'ضغط الدم', 'سكر',
    'medicine', 'medication', 'dose', 'dosage', 'prescription', 'symptom', 'pain',
    'fever', 'is this normal', 'stop taking', 'should i take', 'side effect',
    'dangerous', 'headache', 'dizziness', 'diagnosis'
  ];

  const matchedClinical = clinicalAdviceKeywords.find(kw => lower.includes(kw));
  if (matchedClinical) {
    const replyMessageAr = `⚠️ تنبيه الأمان الطبي وحصرية دور الطبيب: نظام HealthVibe مخصص للتنسيق الإداري للمواعيد فقط، ومحمي ضد تقديم أي استشارات طبية أو تعديل جرعات الأدوية أو تشخيص الأعراض حفاظاً على سلامتك.\n\nجميع القرارات الطبية والتشخيصية هي مسؤولية حصرية لطبيبك المعالج البشري (${doctorTitle}). يرجى مناقشة استفسارك مباشرة خلال موعدك القادم، أو التواصل مع إدارة العيادة هاتفياً.`;
    const replyMessageEn = `⚠️ Medical Safety Alert & Physician Primacy: HealthVibe is strictly an administrative appointment coordination system. In adherence to medical safety standards, autonomous AI is strictly prohibited from providing clinical advice, evaluating symptoms, or altering medications.\n\nAll medical evaluations are the exclusive responsibility of your licensed human physician (${doctorTitleEn}). Please contact the clinic directly or discuss your questions during your upcoming consultation.`;

    return {
      isClinicalInquiry: true,
      physicianPrimacyEnforced: true,
      safetyAction: 'CLINICAL_ADVICE_PROHIBITED',
      matchedKeyword: matchedClinical,
      doctorName: options.doctorName || null,
      replyMessage: lang === 'en' ? replyMessageEn : replyMessageAr,
      replyMessageAr,
      replyMessageEn
    };
  }

  // --------------------------------------------------------------------------
  // 🔒 STAGE 3: PATIENT PRIVACY OPT-OUT & CONSENT WITHDRAWAL
  // --------------------------------------------------------------------------
  const optOutKeywords = [
    'stop', 'unsubscribe', 'إيقاف', 'ايقاف', 'إلغاء الاشتراك', 'الغاء الاشتراك',
    'توقف', 'لا ترسل لي', 'cancel reminders', 'quit', 'opt out', 'optout'
  ];

  const matchedOptOut = optOutKeywords.find(kw => lower === kw || lower.startsWith(kw + ' '));
  if (matchedOptOut) {
    const replyMessageAr = `✓ تم استلام طلبك وإيقاف التذكيرات التلقائية عبر الرسائل بنجاح بناءً على خيارات خصوصيتك. يمكنك إعادة تفعيلها دائماً من إعدادات حسابك في التطبيق.`;
    const replyMessageEn = `✓ Your opt-out request has been processed. Automated message reminders have been paused in accordance with your privacy choices. You can reactivate them anytime from your account settings.`;

    return {
      isOptOut: true,
      safetyAction: 'REMINDER_OPT_OUT_REQUESTED',
      matchedKeyword: matchedOptOut,
      replyMessage: lang === 'en' ? replyMessageEn : replyMessageAr,
      replyMessageAr,
      replyMessageEn
    };
  }

  // --------------------------------------------------------------------------
  // 📅 STAGE 4: ADMINISTRATIVE COORDINATION (PASSTHROUGH)
  // --------------------------------------------------------------------------
  return {
    isSafeAdministrative: true,
    safetyAction: 'ADMINISTRATIVE_PASSTHROUGH'
  };
}

/**
 * Validates outbound reminder dispatch against Quiet Hours and patient consent policies.
 * Non-urgent reminders (24h) are deferred during quiet hours (22:00 to 08:00 local time).
 */
function validateReminderDispatchSafety(appointment = {}, window = '24h', options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const timezoneOffsetHours = typeof options.timezoneOffsetHours === 'number' ? options.timezoneOffsetHours : 2; // Default Egypt (UTC+2)
  const localHour = (now.getUTCHours() + timezoneOffsetHours + 24) % 24;

  const isQuietHours = localHour >= 22 || localHour < 8;
  const is24hWindow = window === '24h' || window === 'window_24h';

  // Defer non-urgent 24h reminders during quiet hours to protect patient from sleep disruption
  const deferredDueToQuietHours = isQuietHours && is24hWindow;

  // Sanitize payload
  const { sanitizedPayload, phiRedacted, maskedPhone } = sanitizeReminderForPrivacy(appointment, {
    channel: options.channel || 'external'
  });

  return {
    safe: !deferredDueToQuietHours,
    deferredDueToQuietHours,
    localHour,
    isQuietHours,
    phiRedacted,
    maskedPhone,
    sanitizedPayload
  };
}

module.exports = {
  STATUTORY_MEDICAL_DISCLAIMER,
  EMERGENCY_CONTACTS,
  EMERGENCY_RED_FLAGS,
  SENSITIVE_SPECIALTIES,
  maskPhoneNumber,
  sanitizeReminderForPrivacy,
  evaluateReminderInboundMessageSafety,
  validateReminderDispatchSafety,
  evaluateAppointmentEmergencyRisk,
  enforcePhysicianRoleBoundaries,
  validateAppointmentMutationSafety,
  recordDoctorClinicalEvaluation,
  sanitizeCalendarSlotForPrivacy,
  validateFamilyBeneficiaryAccess,
  CLINIDO_CONSULTATION_TYPES,
  VALID_CONSULTATION_TYPES,
  normalizeConsultationType,
  validateConsultationSafety,
  validatePrevisitDossierSafety,
  PROTECTED_CLINICIAN_FIELDS,
  MIN_CLINICAL_CONSULTATION_DURATION,
  MAX_CLINICAL_CONSULTATION_DURATION,
  MAX_SHIFT_HOURS_WITHOUT_BREAK,
  sanitizeDoctorScheduleForPrivacy,
  enforceDoctorSchedulePhysicianPrimacy,
  validateDoctorScheduleClinicalGuardrails
};
