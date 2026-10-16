/**
 * Health Vibe AI - Clinical Triage Risk Override & AI Feedback Service
 *
 * Implements:
 * 1. Verified Doctor Authorization Guard (checks role, license, approved status).
 * 2. Doctor Patient Data Isolation & Assignment Verification (UNASSIGNED_DOCTOR_ACCESS_DENIED).
 * 3. Clinic Isolation Enforcement (CROSS_CLINIC_ACCESS_DENIED).
 * 4. Reasoned Human Clinical Override of Infermedica / Advisory Risk Level with XSS Sanitization.
 * 5. Immutable Security & Compliance Audit Log ('TRIAGE_OVERRIDDEN_BY_CLINICIAN').
 * 6. Ground-Truth Feedback Loop ('ai_model_feedback') for Infermedica continuous calibration.
 * 7. Triage override status retrieval and governance telemetry export.
 */

'use strict';

const VALID_OVERRIDE_PRIORITIES = ['urgent', 'high', 'normal'];

const VALID_OVERRIDE_CATEGORIES = [
  'CLINICAL_SIGNS_OF_EXHAUSTION',
  'RAPID_TRAJECTORY',
  'ARTIFACT_CORRECTION',
  'COMORBIDITY_RISK',
  'OTHER_CLINICAL_JUDGMENT'
];

const OVERRIDE_CATEGORY_METADATA = {
  CLINICAL_SIGNS_OF_EXHAUSTION: {
    en: 'Clinical Signs of Exhaustion / Respiratory Distress',
    ar: 'علامات الإجهاد السريري أو الإنهاك التنفسي',
    description: 'Physician observed accessory muscle usage, severe tachypnea, or lethargy not captured in self-reported scores.'
  },
  RAPID_TRAJECTORY: {
    en: 'Rapid Deterioration Trajectory',
    ar: 'مسار التدهور الحاد أو السريع للأعراض',
    description: 'Patient trajectory indicates steep worsening over hours despite borderline initial vitals.'
  },
  ARTIFACT_CORRECTION: {
    en: 'Pulse Oximeter / Measurement Artifact Correction',
    ar: 'تصحيح خطأ قياس أو تشويش قراءة الجهاز',
    description: 'Clinical evaluation determined sensor error, hypothermia artifact, or miscalibration.'
  },
  COMORBIDITY_RISK: {
    en: 'High-Risk Unaccounted Comorbidities',
    ar: 'عوامل خطورة وأمراض مصاحبة حرجة',
    description: 'High-risk underlying immunocompromised or severe cardiopulmonary disease requiring escalated monitoring.'
  },
  OTHER_CLINICAL_JUDGMENT: {
    en: 'Other Structured Clinical Judgment',
    ar: 'تقدير سريري تخصصي معلل',
    description: 'Physician diagnosis based on bedside clinical examination and auscultation.'
  }
};

/**
 * Sanitizes rationale text against XSS and injection
 */
function sanitizeRationaleText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validates doctor eligibility to perform triage override
 */
function verifyDoctorAuthorization(doctorProfile, doctorIdentity = null) {
  if (!doctorProfile) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_PROFILE_NOT_FOUND',
      message: 'Doctor profile could not be resolved from server registry.'
    };
  }

  if (doctorProfile.role !== 'doctor' && doctorProfile.role !== 'super_admin') {
    return {
      isAuthorized: false,
      code: 'INSUFFICIENT_ROLE',
      message: 'Only licensed physicians with doctor role can override triage risk levels.'
    };
  }

  const isApproved = doctorProfile.doctorApplicationStatus === 'approved' ||
                     doctorProfile.verifiedDoctor === true ||
                     doctorProfile.role === 'super_admin';
  if (!isApproved) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_NOT_VERIFIED',
      message: 'Clinical triage override requires verified, approved doctor status.'
    };
  }

  // Check suspension or revocation if recorded
  if (doctorProfile.licenseStatus === 'suspended' || doctorProfile.licenseStatus === 'revoked') {
    return {
      isAuthorized: false,
      code: 'DOCTOR_LICENSE_INACTIVE',
      message: `Doctor license is currently ${doctorProfile.licenseStatus}.`
    };
  }

  const doctorName = doctorProfile.displayName || doctorProfile.name || 'Licensed Doctor';
  const doctorLicense = doctorIdentity?.licenseNumber || doctorProfile.doctorLicense || doctorProfile.syndicateCardNumber || doctorProfile.licenseNumber || 'EG-MED-VERIFIED';
  const doctorSpecialty = doctorIdentity?.specialty || doctorProfile.specialty || 'General / Respiratory Medicine';

  return {
    isAuthorized: true,
    doctorName,
    doctorLicense,
    doctorSpecialty
  };
}

/**
 * Verifies doctor assignment and clinic isolation on a specific case
 */
function verifyDoctorCaseAccess(caseData, user, doctorProfile = null) {
  if (!caseData || !user) return { isAllowed: true };

  const userUid = user.uid || user.id;
  const userEmail = String(user.email || '').toLowerCase();
  const isSuperAdmin = user.role === 'super_admin' || doctorProfile?.role === 'super_admin';

  if (isSuperAdmin) {
    return { isAllowed: true };
  }

  // 1. Clinic Isolation Check
  if (caseData.clinicId) {
    const doctorClinicId = doctorProfile?.clinicId || doctorProfile?.clinic || user.clinicId;
    let clinicMatched = doctorClinicId === caseData.clinicId;

    if (!clinicMatched && Array.isArray(doctorProfile?.clinics)) {
      clinicMatched = doctorProfile.clinics.some(c => {
        const id = typeof c === 'string' ? c : (c.clinicId || c.id);
        const status = typeof c === 'object' ? c.status : 'approved';
        return id === caseData.clinicId && status !== 'revoked';
      });
    }

    if (!clinicMatched && doctorClinicId) {
      return {
        isAllowed: false,
        code: 'CROSS_CLINIC_ACCESS_DENIED',
        statusCode: 403,
        message: 'Access denied: Patient case belongs to another clinic organization.'
      };
    }
  }

  // 2. Doctor Assignment Check
  const assignedDoctorId = caseData.assignedDoctorId || caseData.doctorId || caseData.doctorUid;
  const assignedDoctorEmail = String(caseData.assignedDoctorEmail || caseData.doctorEmail || '').toLowerCase();

  if (assignedDoctorId || assignedDoctorEmail) {
    const matchesId = assignedDoctorId && assignedDoctorId === userUid;
    const matchesEmail = assignedDoctorEmail && userEmail && assignedDoctorEmail === userEmail;

    if (!matchesId && !matchesEmail) {
      return {
        isAllowed: false,
        code: 'UNASSIGNED_DOCTOR_ACCESS_DENIED',
        statusCode: 403,
        message: 'Access denied: Case is assigned to another medical practitioner. Triage risk override is restricted to the assigned physician.'
      };
    }
  }

  return { isAllowed: true };
}

/**
 * Core processor for reasoned clinical triage override
 */
async function processTriageOverride({
  caseId,
  overriddenPriority,
  overrideReason,
  overrideCategory,
  user,
  doctorProfile,
  doctorIdentity = null,
  db,
  metadata = {}
}) {
  // 1. Priority Validation
  if (!caseId || !VALID_OVERRIDE_PRIORITIES.includes(overriddenPriority)) {
    const err = new Error(`caseId and valid overriddenPriority (${VALID_OVERRIDE_PRIORITIES.join(', ')}) required.`);
    err.code = 'INVALID_OVERRIDE_PRIORITY';
    err.statusCode = 400;
    throw err;
  }

  // 2. Reason Validation & Sanitization (Minimum 10 characters mandatory)
  const cleanReason = sanitizeRationaleText(overrideReason);
  if (!cleanReason || cleanReason.length < 10) {
    const err = new Error('A structured clinical overrideReason of at least 10 characters is mandatory to override system triage.');
    err.code = 'MANDATORY_OVERRIDE_REASON_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // 3. Category Validation
  if (!overrideCategory || !VALID_OVERRIDE_CATEGORIES.includes(overrideCategory)) {
    const err = new Error(`overrideCategory must be one of: ${VALID_OVERRIDE_CATEGORIES.join(', ')}`);
    err.code = 'INVALID_OVERRIDE_CATEGORY';
    err.statusCode = 400;
    throw err;
  }

  // 4. Verified Doctor RBAC Gate
  const authCheck = verifyDoctorAuthorization(doctorProfile, doctorIdentity);
  if (!authCheck.isAuthorized) {
    const err = new Error(authCheck.message);
    err.code = authCheck.code;
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const { doctorName, doctorLicense, doctorSpecialty } = authCheck;

  const overrideRecord = {
    isOverridden: true,
    overriddenPriority,
    overrideReason: cleanReason,
    overrideCategory,
    overriddenBy: {
      uid: user.uid,
      name: doctorName,
      license: doctorLicense,
      email: user.email || '',
      specialty: doctorSpecialty
    },
    modelTarget: 'Infermedica / HealthVibe-Rules-v1.0',
    timestamp: nowIso
  };

  let originalPriority = 'normal';
  let caseData = {};

  if (db) {
    const caseRef = db.collection('cases').doc(caseId);
    const caseDoc = await caseRef.get();
    if (!caseDoc || !caseDoc.exists) {
      const err = new Error('Case not found.');
      err.code = 'CASE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    caseData = caseDoc.data() || {};

    // 5. Patient Data Isolation & Assignment Check
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }

    // 6. Case Lifecycle Protection (Cannot override closed cases)
    if (caseData.status === 'closed') {
      const err = new Error('Cannot override triage risk level on a closed and archived case.');
      err.code = 'CASE_CLOSED';
      err.statusCode = 400;
      throw err;
    }

    originalPriority = caseData.priority || caseData.triageLevel || caseData.assessment?.aiTriage?.priority || 'normal';
    overrideRecord.originalPriority = originalPriority;

    // Determine direction
    let direction = 'MODIFIED';
    if (originalPriority === 'normal' && (overriddenPriority === 'high' || overriddenPriority === 'urgent')) {
      direction = 'ESCALATED';
    } else if (originalPriority === 'urgent' && (overriddenPriority === 'high' || overriddenPriority === 'normal')) {
      direction = 'DE_ESCALATED';
    } else if (originalPriority === 'high' && overriddenPriority === 'normal') {
      direction = 'DE_ESCALATED';
    } else if (originalPriority === 'high' && overriddenPriority === 'urgent') {
      direction = 'ESCALATED';
    }

    // A. Update Case Document
    const updatePayload = {
      priority: overriddenPriority,
      triageLevel: overriddenPriority,
      triageOverride: overrideRecord,
      updatedAt: nowIso
    };

    // Append to status history
    const historyEntry = {
      oldStatus: caseData.status || 'open',
      newStatus: caseData.status || 'open',
      action: 'TRIAGE_OVERRIDE',
      actor: { uid: user.uid, name: doctorName, role: 'doctor', license: doctorLicense },
      reason: overrideRecord.overrideReason,
      category: overrideCategory,
      fromPriority: originalPriority,
      toPriority: overriddenPriority,
      timestamp: nowIso
    };

    if (caseRef.update) {
      try {
        const admin = require('firebase-admin');
        if (admin?.firestore?.FieldValue?.arrayUnion) {
          updatePayload.statusHistory = admin.firestore.FieldValue.arrayUnion(historyEntry);
        }
      } catch (e) {
        const currentHistory = Array.isArray(caseData.statusHistory) ? caseData.statusHistory : [];
        updatePayload.statusHistory = [...currentHistory, historyEntry];
      }
      await caseRef.update(updatePayload);
    }

    // B. Immutable Audit Event Log
    const auditRecord = {
      type: 'TRIAGE_OVERRIDDEN_BY_CLINICIAN',
      caseId,
      doctorId: user.uid,
      doctorName,
      doctorLicense,
      doctorEmail: user.email || '',
      actorRole: user.role || 'doctor',
      verifiedDoctor: true,
      originalPriority,
      overriddenPriority,
      overrideCategory,
      overrideReason: overrideRecord.overrideReason,
      modelTarget: 'Infermedica / Rules Engine',
      provenance: 'AI_INFERMEDICA_RULES_OVERRIDE',
      clinicId: caseData.clinicId || null,
      patientId: caseData.patientId || null,
      ip: metadata.ip || '127.0.0.1',
      userAgent: metadata.userAgent || '',
      timestamp: nowIso
    };

    if (db.collection('audit_events') && db.collection('audit_events').add) {
      await db.collection('audit_events').add(auditRecord);
    }

    // C. Ground-Truth AI Feedback Telemetry for Infermedica
    const feedbackRecord = {
      feedbackType: 'TRIAGE_RISK_OVERRIDE',
      caseId,
      originalAiPriority: originalPriority,
      physicianVerifiedPriority: overriddenPriority,
      discordance: originalPriority !== overriddenPriority,
      direction,
      clinicalCategory: overrideCategory,
      clinicalRationale: overrideRecord.overrideReason,
      vitalsSnapshot: {
        o2: Number(caseData.o2 ?? caseData.oxygenLevel ?? 0),
        temperature: caseData.temperature || null,
        heartRate: caseData.heartRate || null,
        duration: caseData.duration || null,
        symptoms: Array.isArray(caseData.symptoms) ? caseData.symptoms : []
      },
      physician: {
        uid: user.uid,
        name: doctorName,
        license: doctorLicense
      },
      modelEngine: 'Infermedica / HealthVibe-Rules-v1.0',
      calibratedForTraining: true,
      recordedAt: nowIso,
      timestamp: nowIso
    };

    if (db.collection('ai_model_feedback') && db.collection('ai_model_feedback').add) {
      await db.collection('ai_model_feedback').add(feedbackRecord);
    }
  }

  return {
    success: true,
    caseId,
    previousPriority: originalPriority,
    newPriority: overriddenPriority,
    triageOverride: overrideRecord
  };
}

/**
 * Retrieves triage override state for a specific case with access control
 */
async function getCaseTriageOverride(caseId, { db, user = null, doctorProfile = null }) {
  if (!caseId) {
    const err = new Error('caseId parameter required.');
    err.code = 'MISSING_CASE_ID';
    err.statusCode = 400;
    throw err;
  }

  if (!db) {
    const err = new Error('Database not available.');
    err.code = 'DB_UNAVAILABLE';
    err.statusCode = 503;
    throw err;
  }

  const caseDoc = await db.collection('cases').doc(caseId).get();
  if (!caseDoc || !caseDoc.exists) {
    const err = new Error('Case not found.');
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const caseData = caseDoc.data() || {};

  // Access isolation verification if user is supplied
  if (user) {
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }
  }

  return {
    success: true,
    caseId,
    priority: caseData.priority || caseData.triageLevel || 'normal',
    isOverridden: Boolean(caseData.triageOverride?.isOverridden),
    triageOverride: caseData.triageOverride || null,
    originalPriority: caseData.triageOverride?.originalPriority || caseData.priority || 'normal'
  };
}

/**
 * Exports AI model ground truth telemetry
 */
async function getAiFeedbackTelemetry({ db, limit = 50 }) {
  if (!db) {
    return {
      success: true,
      totalOverrides: 0,
      escalatedCount: 0,
      deescalatedCount: 0,
      modifiedCount: 0,
      categoryDistribution: {},
      recentOverrides: []
    };
  }

  const query = db.collection('ai_model_feedback').where('feedbackType', '==', 'TRIAGE_RISK_OVERRIDE');
  const snapshot = await query.get();

  const records = [];
  let escalatedCount = 0;
  let deescalatedCount = 0;
  let modifiedCount = 0;
  const categoryCounts = {};

  const docs = snapshot.docs || [];
  for (const doc of docs) {
    const d = typeof doc.data === 'function' ? doc.data() : doc;
    records.push({ id: doc.id, ...d });
    if (d.direction === 'ESCALATED') escalatedCount++;
    else if (d.direction === 'DE_ESCALATED') deescalatedCount++;
    else modifiedCount++;

    const cat = d.clinicalCategory || 'OTHER_CLINICAL_JUDGMENT';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  return {
    success: true,
    totalOverrides: records.length,
    escalatedCount,
    deescalatedCount,
    modifiedCount,
    categoryDistribution: categoryCounts,
    modelTarget: 'Infermedica / HealthVibe-Rules-v1.0',
    recentOverrides: records.slice(-limit)
  };
}

module.exports = {
  VALID_OVERRIDE_PRIORITIES,
  VALID_OVERRIDE_CATEGORIES,
  OVERRIDE_CATEGORY_METADATA,
  sanitizeRationaleText,
  verifyDoctorAuthorization,
  verifyDoctorCaseAccess,
  processTriageOverride,
  getCaseTriageOverride,
  getAiFeedbackTelemetry
};
