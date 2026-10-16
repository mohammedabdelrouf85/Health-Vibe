/**
 * Health Vibe AI - Clinical Intake Rejection & Re-entry Service (K Health Pattern)
 *
 * Implements:
 * 1. Verified Doctor Authorization Guard (checks role, license, approved status).
 * 2. Doctor Patient Data Isolation & Assignment Verification (UNASSIGNED_DOCTOR_ACCESS_DENIED).
 * 3. Multi-Tenant Clinic Isolation Enforcement (CROSS_CLINIC_ACCESS_DENIED).
 * 4. Structured Clinical Rejection & Patient Re-entry Protocol.
 * 5. Immutable Security & Compliance Audit Log ('CASE_REJECTED_REENTRY_REQUESTED' / 'CASE_DEFINITIVELY_REJECTED').
 * 6. Patient Notification Dispatch (informing patient to re-measure and re-submit flagged inputs).
 * 7. Status Inspection & Telemetry Endpoint Handlers.
 */

'use strict';

const REJECTION_REENTRY_CATEGORIES = [
  'INCOMPLETE_MEASUREMENTS',
  'CONTRADICTORY_VITALS',
  'UNREADABLE_ATTACHMENTS',
  'CLINICAL_INCONSISTENCY',
  'OTHER_CLINICAL_JUSTIFICATION'
];

const REENTRY_REQUEST_FIELDS = [
  'spo2',
  'blood_pressure',
  'temperature',
  'symptoms_detail',
  'attachments',
  'medications'
];

const REJECTION_REENTRY_METADATA = {
  INCOMPLETE_MEASUREMENTS: {
    en: 'Incomplete / Missing Vital Measurements',
    ar: 'نقص القياسات أو المؤشرات الحيوية الأساسية',
    description: 'Essential clinical vitals such as SpO2 or blood pressure were omitted, preventing safe triage.'
  },
  CONTRADICTORY_VITALS: {
    en: 'Contradictory / Implausible Vital Readings',
    ar: 'قياسات أو مؤشرات حيوية متناقضة أو غير منطقية',
    description: 'Recorded values are physiologically contradictory or clinically implausible (e.g. sensor artifact).'
  },
  UNREADABLE_ATTACHMENTS: {
    en: 'Unreadable / Blurry Attachments & Labs',
    ar: 'مرفقات أو صور تحاليل/روشتات غير واضحة',
    description: 'Uploaded photos of lab tests, ECG or prescriptions are blurry, cropped, or illegible.'
  },
  CLINICAL_INCONSISTENCY: {
    en: 'Symptom-History Discrepancy',
    ar: 'عدم تطابق الأعراض مع التاريخ المرضي المسجل',
    description: 'Current symptoms contradict previously documented answers or intake responses.'
  },
  OTHER_CLINICAL_JUSTIFICATION: {
    en: 'Other Physician Clinical Justification',
    ar: 'مبررات سريرية أخرى يحددها الطبيب',
    description: 'Direct attending physician clinical assessment requiring intake correction.'
  }
};

/**
 * Sanitizes input text against XSS and HTML injection
 */
function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validates doctor eligibility to perform case rejection or request re-entry
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
      message: 'Only licensed physicians with doctor role can reject intakes or request re-entry.'
    };
  }

  const isApproved = doctorProfile.doctorApplicationStatus === 'approved' ||
                     doctorProfile.verifiedDoctor === true ||
                     doctorProfile.role === 'super_admin';
  if (!isApproved) {
    return {
      isAuthorized: false,
      code: 'DOCTOR_NOT_VERIFIED',
      message: 'Clinical rejection and re-entry requests require verified, approved doctor status.'
    };
  }

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

  // 1. Multi-Tenant Clinic Isolation Check
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
        message: 'Access denied: Case is assigned to another medical practitioner. Intake rejection and re-entry is restricted to the assigned clinician.'
      };
    }
  }

  return { isAllowed: true };
}

/**
 * Core processor for Reject / Request Re-entry workflow
 */
async function processRejectReentry({
  caseId,
  mode = 'reentry',
  reasonCategory,
  requiredFields = [],
  doctorNote,
  user,
  doctorProfile,
  doctorIdentity = null,
  db,
  metadata = {}
}) {
  // 1. Basic validation
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!['reentry', 'definitive_reject'].includes(mode)) {
    const err = new Error("mode must be either 'reentry' or 'definitive_reject'.");
    err.code = 'INVALID_MODE';
    err.statusCode = 400;
    throw err;
  }

  if (!reasonCategory || !REJECTION_REENTRY_CATEGORIES.includes(reasonCategory)) {
    const err = new Error(`reasonCategory must be one of: ${REJECTION_REENTRY_CATEGORIES.join(', ')}`);
    err.code = 'INVALID_REENTRY_CATEGORY';
    err.statusCode = 400;
    throw err;
  }

  const cleanNote = sanitizeText(doctorNote);
  if (!cleanNote || cleanNote.length < 10) {
    const err = new Error('A structured physician doctorNote of at least 10 characters is mandatory.');
    err.code = 'MANDATORY_NOTE_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  const validRequiredFields = Array.isArray(requiredFields)
    ? requiredFields.filter(f => REENTRY_REQUEST_FIELDS.includes(f))
    : [];

  if (mode === 'reentry' && validRequiredFields.length === 0) {
    const err = new Error('At least one valid required field must be specified for patient re-entry.');
    err.code = 'REQUIRED_FIELDS_EMPTY';
    err.statusCode = 400;
    throw err;
  }

  // 2. Verified Doctor RBAC Gate
  const authCheck = verifyDoctorAuthorization(doctorProfile, doctorIdentity);
  if (!authCheck.isAuthorized) {
    const err = new Error(authCheck.message);
    err.code = authCheck.code;
    err.statusCode = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const { doctorName, doctorLicense, doctorSpecialty } = authCheck;

  let caseData = {};
  let previousStatus = 'under_review';
  const targetStatus = mode === 'reentry' ? 'more_info_requested' : 'rejected';

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
    previousStatus = caseData.status || 'under_review';

    if (caseData.status === 'closed') {
      const err = new Error('Cannot reject or request re-entry for an already closed and archived case.');
      err.code = 'CASE_CLOSED';
      err.statusCode = 400;
      throw err;
    }

    // 3. Security & Isolation Gate
    const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
    if (!accessCheck.isAllowed) {
      const err = new Error(accessCheck.message);
      err.code = accessCheck.code;
      err.statusCode = accessCheck.statusCode || 403;
      throw err;
    }
  }

  const reentryRecord = {
    mode,
    isReentryRequest: mode === 'reentry',
    reasonCategory,
    rejectionReason: cleanNote,
    requiredFields: mode === 'reentry' ? validRequiredFields : [],
    flaggedBy: {
      uid: user.uid,
      name: doctorName,
      license: doctorLicense,
      email: user.email || '',
      specialty: doctorSpecialty
    },
    timestamp: nowIso
  };

  if (db) {
    const caseRef = db.collection('cases').doc(caseId);
    const existingHistory = Array.isArray(caseData.statusHistory) ? caseData.statusHistory : [];

    const newHistoryEntry = {
      status: targetStatus,
      changedAt: nowIso,
      changedBy: user.uid,
      changedByName: doctorName,
      changedByLicense: doctorLicense,
      changedByRole: 'doctor',
      reason: cleanNote,
      reentryMode: mode,
      reasonCategory
    };

    const updatePayload = {
      status: targetStatus,
      rejectionReason: cleanNote,
      rejectionCategory: reasonCategory,
      isReentryRequest: mode === 'reentry',
      reentryMode: mode,
      requiredFields: mode === 'reentry' ? validRequiredFields : [],
      doctorNote: cleanNote,
      doctorApproved: false,
      reentryRecord: reentryRecord,
      statusHistory: [...existingHistory, newHistoryEntry],
      updatedAt: nowIso
    };

    if (mode === 'reentry') {
      updatePayload.moreInfoRequestedAt = nowIso;
      updatePayload.moreInfoNote = cleanNote;
    } else {
      updatePayload.rejectedAt = nowIso;
    }

    await caseRef.update(updatePayload);

    // 4. Compliance & Security Audit Log
    const auditRecord = {
      eventType: mode === 'reentry' ? 'CASE_REJECTED_REENTRY_REQUESTED' : 'CASE_DEFINITIVELY_REJECTED',
      action: 'INTAKE_REJECT_REENTRY',
      caseId,
      performedBy: {
        uid: user.uid,
        name: doctorName,
        email: user.email || '',
        license: doctorLicense,
        role: user.role || 'doctor'
      },
      details: {
        mode,
        previousStatus,
        targetStatus,
        reasonCategory,
        requiredFields: mode === 'reentry' ? validRequiredFields : [],
        doctorNote: cleanNote
      },
      timestamp: nowIso,
      ipAddress: metadata.ip || '127.0.0.1',
      userAgent: metadata.userAgent || ''
    };

    await db.collection('audit_logs').add(auditRecord);

    // 5. Patient Notification Dispatch
    const patientRecipientId = caseData.patientId || caseData.userId;
    if (patientRecipientId) {
      const isEn = metadata.lang === 'en';
      const notificationTitle = mode === 'reentry'
        ? (isEn ? 'Assessment Intake Re-entry Required' : 'مطلوب إعادة إدخال بيانات التقييم المبدئي')
        : (isEn ? 'Assessment Submission Rejected' : 'تم رفض التقييم المبدئي');

      await db.collection('notifications').add({
        recipientId: patientRecipientId,
        type: mode === 'reentry' ? 'intake_reentry_requested' : 'case_rejected',
        caseId,
        title: notificationTitle,
        body: cleanNote,
        requiredFields: mode === 'reentry' ? validRequiredFields : [],
        isReentryRequest: mode === 'reentry',
        read: false,
        createdAt: nowIso
      });
    }
  }

  return {
    success: true,
    caseId,
    mode,
    targetStatus,
    previousStatus,
    message: mode === 'reentry'
      ? `Case intake rejected. Patient re-entry request issued for: [${validRequiredFields.join(', ')}].`
      : 'Case intake definitively rejected and recorded in compliance audit log.',
    reentryRecord
  };
}

/**
 * Retrieves intake rejection / re-entry details for a case
 */
async function getCaseRejectReentryStatus(caseId, { db, user, doctorProfile }) {
  if (!caseId) {
    const err = new Error('caseId is required.');
    err.code = 'CASE_ID_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  if (!db) {
    return {
      caseId,
      isReentryRequest: false,
      reentryRecord: null
    };
  }

  const caseDoc = await db.collection('cases').doc(caseId).get();
  if (!caseDoc || !caseDoc.exists) {
    const err = new Error('Case not found.');
    err.code = 'CASE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const caseData = caseDoc.data() || {};

  const accessCheck = verifyDoctorCaseAccess(caseData, user, doctorProfile);
  if (!accessCheck.isAllowed) {
    const err = new Error(accessCheck.message);
    err.code = accessCheck.code;
    err.statusCode = accessCheck.statusCode || 403;
    throw err;
  }

  return {
    success: true,
    caseId,
    status: caseData.status,
    isReentryRequest: Boolean(caseData.isReentryRequest),
    reentryMode: caseData.reentryMode || null,
    reasonCategory: caseData.rejectionCategory || null,
    rejectionReason: caseData.rejectionReason || null,
    requiredFields: caseData.requiredFields || [],
    reentryRecord: caseData.reentryRecord || null
  };
}

module.exports = {
  REJECTION_REENTRY_CATEGORIES,
  REENTRY_REQUEST_FIELDS,
  REJECTION_REENTRY_METADATA,
  sanitizeText,
  verifyDoctorAuthorization,
  verifyDoctorCaseAccess,
  processRejectReentry,
  getCaseRejectReentryStatus
};
