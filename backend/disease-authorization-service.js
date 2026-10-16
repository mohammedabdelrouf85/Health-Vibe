/**
 * Health Vibe AI - Unified Disease Authorization & Zero-Trust Governance Service
 *
 * UNIFIED AUTHORIZATION ARCHITECTURE:
 * Covers:
 * 1. Diabetes ('diabetes')
 * 2. Hypertension ('hypertension')
 * 3. Blood Clotting / Blood Disorders ('blood-disorders' / 'blood_disorders')
 * 4. Obesity ('obesity')
 *
 * CORE AUTHORIZATION POLICIES:
 * 1. Zero-Trust Parameter Hygiene:
 *    - Never trust role, patientId, doctorId, clinicId, or diseaseId supplied by the browser.
 *    - Requester identity and role MUST originate from the cryptographically verified JWT (req.user).
 *    - Untrusted client bodies/queries/headers cannot forge identity or elevate privilege.
 * 2. Patient Data Isolation:
 *    - Patients may access ONLY their own disease records (req.user.uid === patientId).
 *    - Direct API requests with a modified patientId or foreign ID are strictly rejected (403 ACCESS_DENIED).
 * 3. Doctor Assignment & Clinic Scope:
 *    - Doctors may access ONLY records they are authorized and assigned to review.
 *    - An unassigned doctor cannot access or approve a case/record (403 DOCTOR_NOT_ASSIGNED).
 *    - Doctors cannot cross into other clinics; records must match doctor.clinicId (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Revoked or expired doctor licenses immediately bar clinical actions (403 INVALID_DOCTOR_LICENSE).
 * 4. Administrator Configured Permissions:
 *    - Clinic Administrators (clinic_admin) may access records strictly within their configured clinic (403 CROSS_CLINIC_ACCESS_DENIED).
 *    - Platform Administrators (super_admin / owner) access according to configured administrative privileges.
 *    - Support staff have strictly non-clinical access; cannot read clinical diagnoses, notes, or secrets.
 * 5. Immediate Suspension Enforcement:
 *    - Suspended accounts (patient, doctor, admin) are blocked immediately with 403 ACCOUNT_SUSPENDED,
 *      even if their session token was issued prior to suspension.
 */

let auditService = null;
try {
  auditService = require('./audit-service');
} catch (e) {}

const SUPPORTED_DISEASES = {
  DIABETES: 'diabetes',
  HYPERTENSION: 'hypertension',
  BLOOD_DISORDERS: 'blood-disorders',
  OBESITY: 'obesity'
};

const DISEASE_ALIASES = {
  diabetes: 'diabetes',
  diabetes_mellitus: 'diabetes',
  hypertension: 'hypertension',
  chronic_hypertension: 'hypertension',
  bp: 'hypertension',
  'blood-disorders': 'blood-disorders',
  blood_disorders: 'blood-disorders',
  blood_clotting: 'blood-disorders',
  hematology: 'blood-disorders',
  obesity: 'obesity',
  metabolic: 'obesity',
  weight: 'obesity'
};

/**
 * Normalizes and validates disease identifier.
 */
function normalizeDiseaseId(rawDiseaseId) {
  if (!rawDiseaseId) {
    const err = new Error('diseaseId is required.');
    err.code = 'MISSING_DISEASE_ID';
    err.statusCode = 400;
    throw err;
  }

  const cleaned = String(rawDiseaseId).trim().toLowerCase();
  const canonical = DISEASE_ALIASES[cleaned];
  if (!canonical || !Object.values(SUPPORTED_DISEASES).includes(canonical)) {
    const err = new Error(`Unsupported disease module '${rawDiseaseId}'. Supported diseases: [diabetes, hypertension, blood-disorders, obesity]`);
    err.code = 'UNSUPPORTED_DISEASE';
    err.statusCode = 404;
    throw err;
  }
  return canonical;
}

/**
 * Validates whether an account is suspended or blocked.
 * Checks both token custom claims and database document attributes.
 */
function isAccountSuspended(user) {
  if (!user) return false;
  return Boolean(
    user.suspended === true ||
    user.status === 'suspended' ||
    user.accountStatus === 'suspended' ||
    user.disabled === true ||
    user.isSuspended === true
  );
}

/**
 * Resolves trusted identity attributes from verified token, stripping untrusted browser inputs.
 */
function sanitizeAuthContext(req) {
  const user = req.user || {};
  const isOwner = Boolean(user.isOwner);
  const trustedRole = user.role || 'patient';
  const trustedUid = user.uid;
  const trustedClinicId = user.clinicId || null;

  return {
    uid: trustedUid,
    role: trustedRole,
    isOwner,
    clinicId: trustedClinicId,
    email: user.email,
    name: user.displayName || user.name || user.email,
    isLicenseExpired: Boolean(user.isLicenseExpired),
    licenseStatus: user.licenseStatus || 'active',
    verifiedDoctor: Boolean(user.verifiedDoctor),
    suspended: isAccountSuspended(user)
  };
}

/**
 * Core Authorization Engine for Disease Information Access.
 *
 * @param {object} params
 * @param {object} params.user Verified authenticated user (from req.user)
 * @param {string} params.diseaseId Target disease ('diabetes', 'hypertension', 'blood-disorders', 'obesity')
 * @param {string} params.action Operation ('read:records', 'create:record', 'read:case', 'create:case', 'review:case', 'approve:case', 'read:report')
 * @param {string} [params.targetPatientId] Patient UID being accessed
 * @param {object} [params.record] Existing record/case being accessed (if applicable)
 * @param {string} [params.requestedClinicId] Clinic ID from request
 * @returns {object} { authorized: true, trustedContext }
 */
function authorizeDiseaseAccess({
  user,
  diseaseId,
  action = 'read:records',
  targetPatientId = null,
  record = null,
  requestedClinicId = null
}) {
  if (!user || !user.uid) {
    const err = new Error('Authentication required.');
    err.code = 'UNAUTHORIZED';
    err.statusCode = 401;
    throw err;
  }

  // 1. 🛑 BLOCK SUSPENDED ACCOUNTS IMMEDIATELY
  if (isAccountSuspended(user)) {
    const err = new Error('This account has been suspended by platform administration.');
    err.code = 'ACCOUNT_SUSPENDED';
    err.statusCode = 403;
    throw err;
  }

  // 2. Validate Disease Module
  const canonicalDisease = normalizeDiseaseId(diseaseId);

  // 3. Extract Trusted Identity (DO NOT TRUST browser-supplied role or IDs)
  const trustedRole = user.role || 'patient';
  const isOwner = Boolean(user.isOwner);
  const trustedUid = user.uid;
  const trustedClinicId = user.clinicId || null;

  // Determine effective patient ID from record or parameters
  const recordPatientId = record ? (record.patientId || record.userId) : null;
  const effectivePatientId = targetPatientId || recordPatientId || null;

  // 4. Role-Specific Authorization Matrices:

  // --- PATIENTS ---
  if (trustedRole === 'patient') {
    // Patients may access ONLY their own disease records
    if (effectivePatientId && effectivePatientId !== trustedUid) {
      const err = new Error('Access denied: Patients may access only their own disease records.');
      err.code = 'CROSS_PATIENT_ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }

    // Patients cannot perform doctor actions (review, approval)
    if (action.includes('review') || action.includes('approve') || action.includes('certify')) {
      const err = new Error('Access denied: Clinical review and approval require an authorized physician.');
      err.code = 'DOCTOR_PRIVILEGE_REQUIRED';
      err.statusCode = 403;
      throw err;
    }

    return {
      authorized: true,
      diseaseId: canonicalDisease,
      role: 'patient',
      patientId: trustedUid,
      isSelf: true
    };
  }

  // --- DOCTORS ---
  if (trustedRole === 'doctor') {
    // Check doctor license validity
    if (user.isLicenseExpired || user.licenseStatus === 'revoked') {
      const err = new Error('Doctor license is revoked or expired. Clinical access suspended.');
      err.code = 'INVALID_DOCTOR_LICENSE';
      err.statusCode = 403;
      throw err;
    }

    // Check doctor assignment to the specific record/case
    if (record) {
      const assignedDoctorId = record.assignedDoctorId ||
                               record.doctorId ||
                               record.approvingDoctorId ||
                               record.doctorUid ||
                               (record.assignedDoctor ? (record.assignedDoctor.uid || record.assignedDoctor.doctorId) : null);

      const recordClinicId = record.clinicId || null;

      // Cross-clinic check: doctor cannot access records belonging to another clinic
      if (recordClinicId && trustedClinicId && recordClinicId !== trustedClinicId && !isOwner) {
        const err = new Error('Access denied: Doctors cannot access disease records from another clinic.');
        err.code = 'CROSS_CLINIC_ACCESS_DENIED';
        err.statusCode = 403;
        throw err;
      }

      // Assignment verification: doctor must be assigned to review this record
      const isAssigned = (assignedDoctorId === trustedUid);
      const isClaimingUnassigned = (action === 'claim' && !assignedDoctorId && (!recordClinicId || recordClinicId === trustedClinicId));

      if (!isAssigned && !isClaimingUnassigned && !isOwner) {
        const err = new Error('Access denied: Doctors may access only records they are authorized and assigned to review.');
        err.code = 'DOCTOR_NOT_ASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    return {
      authorized: true,
      diseaseId: canonicalDisease,
      role: 'doctor',
      doctorId: trustedUid,
      clinicId: trustedClinicId
    };
  }

  // --- CLINIC ADMINISTRATORS ---
  if (trustedRole === 'clinic_admin') {
    if (!trustedClinicId && !isOwner) {
      const err = new Error('Clinic administrator account is not linked to an active clinic.');
      err.code = 'CLINIC_NOT_ASSIGNED';
      err.statusCode = 403;
      throw err;
    }

    // Clinic admins may access disease information ONLY according to their configured clinic
    if (record && record.clinicId && record.clinicId !== trustedClinicId && !isOwner) {
      const err = new Error('Access denied: Clinic administrators cannot access disease records from another clinic.');
      err.code = 'CROSS_CLINIC_ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }

    if (requestedClinicId && requestedClinicId !== trustedClinicId && !isOwner) {
      const err = new Error('Access denied: Cannot query disease information for a foreign clinic.');
      err.code = 'CROSS_CLINIC_ACCESS_DENIED';
      err.statusCode = 403;
      throw err;
    }

    // Clinic admins cannot perform medical diagnosis or doctor approval
    if (action.includes('approve') || action.includes('certify')) {
      const err = new Error('Access denied: Medical review approval requires a licensed physician.');
      err.code = 'PHYSICIAN_REQUIRED';
      err.statusCode = 403;
      throw err;
    }

    return {
      authorized: true,
      diseaseId: canonicalDisease,
      role: 'clinic_admin',
      clinicId: trustedClinicId
    };
  }

  // --- PLATFORM SUPER ADMINS & OWNERS ---
  if (trustedRole === 'super_admin' || isOwner) {
    return {
      authorized: true,
      diseaseId: canonicalDisease,
      role: isOwner ? 'owner' : 'super_admin',
      isOwner,
      clinicId: requestedClinicId || null
    };
  }

  // --- SUPPORT ROLE ---
  if (trustedRole === 'support') {
    // Support has no access to private clinical observations or doctor review notes
    const err = new Error('Access denied: Support role is restricted from viewing protected disease clinical records.');
    err.code = 'SUPPORT_ACCESS_RESTRICTED';
    err.statusCode = 403;
    throw err;
  }

  // Default Fallback: Unknown or Unauthorized Role
  const err = new Error(`Access denied: Role '${trustedRole}' is not authorized for disease records.`);
  err.code = 'FORBIDDEN_ROLE';
  err.statusCode = 403;
  throw err;
}

/**
 * Express Middleware: Unified Disease Authorization Guard
 */
function requireDiseaseAuth({
  action = 'read:records',
  getDiseaseId = req => req.params.diseaseId,
  getPatientId = req => req.params.patientId || req.body?.patientId,
  getRecord = null
} = {}) {
  return async (req, res, next) => {
    try {
      const diseaseId = typeof getDiseaseId === 'function' ? getDiseaseId(req) : req.params.diseaseId;
      const targetPatientId = typeof getPatientId === 'function' ? getPatientId(req) : (req.params.patientId || req.body?.patientId);
      const record = typeof getRecord === 'function' ? await getRecord(req) : null;
      const requestedClinicId = req.query?.clinicId || req.body?.clinicId || null;

      const authResult = authorizeDiseaseAccess({
        user: req.user,
        diseaseId,
        action,
        targetPatientId,
        record,
        requestedClinicId
      });

      req.diseaseAuth = authResult;
      next();
    } catch (err) {
      // Audit security denial
      if (auditService && typeof auditService.recordAuditEvent === 'function') {
        try {
          auditService.recordAuditEvent(null, {
            type: 'ACCESS_DENIED',
            actor: { uid: req.user?.uid || 'anonymous', role: req.user?.role || 'unknown' },
            action: `DISEASE_ACCESS_DENIED:${action}`,
            details: {
              error: err.code,
              message: err.message,
              url: req.originalUrl,
              method: req.method
            }
          }).catch(() => {});
        } catch (e) {}
      }

      res.status(err.statusCode || 403).json({
        error: err.code || 'ACCESS_DENIED',
        message: err.message
      });
    }
  };
}

module.exports = {
  SUPPORTED_DISEASES,
  DISEASE_ALIASES,
  normalizeDiseaseId,
  isAccountSuspended,
  sanitizeAuthContext,
  authorizeDiseaseAccess,
  requireDiseaseAuth
};
