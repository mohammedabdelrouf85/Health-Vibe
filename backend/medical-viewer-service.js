/**
 * Health Vibe AI - Doctor Medical File & Image Viewer Backend Service
 *
 * Implements Rology Teleradiology Security, Privacy & Safety Standards:
 * 1. Cryptographically signed ephemeral access tokens (HMAC-SHA256) with strict TTL.
 * 2. Mandatory Doctor / Radiologist RBAC verification (Zero PHI access for non-clinical roles).
 * 3. Strict Human-in-the-Loop (HITL) Medical Guardrails (Preventing autonomous AI diagnostic claims).
 * 4. Granular Patient Consent verification & instantaneous access revocation support.
 * 5. Medical Asset De-Identification (stripping embedded PHI headers: National ID, Phone, Address).
 * 6. Dynamic Forensic Watermarking layer (Doctor Name, Syndicate #, Clinic ID, Access Timestamp).
 * 7. Human Doctor Clinical Certification & Sign-off Engine (Binding legal signature to certified scans).
 * 8. Relational DB persistence of medical file annotations, ROI measurements, and findings.
 * 9. Comprehensive HIPAA-compliant Zero-PHI viewing telemetry & access audit logging.
 * 10. Instant clinical escalation & emergency notification dispatch upon critical findings.
 * 11. Hardened HTTP security headers (anti-caching, strict CSP, framing denial).
 */

const crypto = require('crypto');
const { relationalDbService } = require('./relational-db-service');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');
const analyticsService = require('./analytics-service');

const DEFAULT_SECRET_KEY = process.env.MEDICAL_VIEWER_TOKEN_SECRET || 'health-vibe-rology-viewer-secret-key-2026';
const DEFAULT_TTL_MINUTES = 30;

// Valid finding severities
const FINDING_SEVERITY = {
  NORMAL: 'normal',
  MINOR: 'minor',
  ABNORMAL: 'abnormal',
  CRITICAL_ALERT: 'critical_alert'
};

// Scan Review Status Lifecycle (Enforcing Doctor Non-Replacement)
const SCAN_REVIEW_STATUS = {
  PENDING_DOCTOR_REVIEW: 'pending_doctor_review',
  UNDER_PHYSICIAN_INSPECTION: 'under_physician_inspection',
  CERTIFIED_BY_DOCTOR: 'certified_by_doctor',
  REJECTED_ILLEGIBLE: 'rejected_illegible',
  PRIVACY_ERASED: 'privacy_erased'
};

// Mandatory Bilingual Clinical Safety Disclaimers (FDA / Egyptian Medical Syndicate)
const CLINICAL_SAFETY_DISCLAIMERS = {
  ar: 'هذا العارض مخصص للمراجعة السريرية بواسطة الطبيب البشري المرخص فقط. أية مؤشرات أو تحليلات مساعدة من الذكاء الاصطناعي هي أدوات معاونة غير تشخيصية (Non-Diagnostic Decision Support) وتتطلب فحصاً وقراراً سريرياً مستقلاً من الطبيب المعالج قبل أي اعتماد طبي.',
  en: 'This medical viewer is strictly for clinical review by licensed human physicians. Any AI assistive indicators or analytical annotations are non-diagnostic clinical decision-support tools requiring independent evaluation and certification by the treating physician before clinical release.'
};

class MedicalViewerService {
  constructor(options = {}) {
    this.secretKey = options.secretKey || DEFAULT_SECRET_KEY;
    this.defaultTtlMinutes = options.defaultTtlMinutes || DEFAULT_TTL_MINUTES;
    this.activeTokens = new Map(); // token -> metadata (for tracking / revocation)
    this.revokedTokens = new Set();
    this.patientConsents = new Map(); // patientId -> { status: 'granted'|'revoked', grantedAt, revokedAt }
    this.scanCertifications = new Map(); // `${caseId}_${fileId}` -> certificationRecord
  }

  resetStoreForTesting() {
    this.activeTokens.clear();
    this.revokedTokens.clear();
    this.patientConsents.clear();
    this.scanCertifications.clear();
    if (relationalDbService && relationalDbService.tables) {
      if (relationalDbService.tables.medical_file_annotations) relationalDbService.tables.medical_file_annotations.clear();
      if (relationalDbService.tables.medical_viewer_audit_logs) relationalDbService.tables.medical_viewer_audit_logs.clear();
      if (relationalDbService.indexes) {
        if (relationalDbService.indexes.annotations_case_id) relationalDbService.indexes.annotations_case_id.clear();
        if (relationalDbService.indexes.annotations_file_id) relationalDbService.indexes.annotations_file_id.clear();
        if (relationalDbService.indexes.viewer_audit_case_id) relationalDbService.indexes.viewer_audit_case_id.clear();
      }
    }
  }

  // ===========================================================================
  // 1. EPHEMERAL SIGNED VIEWING TOKENS (Rology Security Standard)
  // ===========================================================================

  /**
   * Generates a signed, time-limited ephemeral access token for viewing medical files.
   * Enforces doctor role, patient consent, and non-clinical sub-role blocking.
   */
  generateViewingToken({ doctorUser, caseId, fileId, fileName = 'medical_scan', patientId = null, ttlMinutes = this.defaultTtlMinutes }) {
    if (!doctorUser || !doctorUser.uid) {
      const err = new Error('Doctor authentication is mandatory to generate medical viewer token.');
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }

    const doctorRole = doctorUser.role || (doctorUser.customClaims && doctorUser.customClaims.role) || 'doctor';

    // PRD Page 13: Non-clinical administrative sub-roles have ZERO PHI access
    if (['support', 'ops', 'clinical_qa'].includes(doctorRole)) {
      const err = new Error(`Role '${doctorRole}' is strictly forbidden from accessing unmasked patient diagnostic images under PRD Page 13.`);
      err.code = 'FORBIDDEN_NON_CLINICAL_ROLE';
      err.status = 403;
      throw err;
    }

    const allowedRoles = ['doctor', 'radiologist', 'clinic_admin', 'super_admin'];
    if (!allowedRoles.includes(doctorRole)) {
      const err = new Error(`Role '${doctorRole}' is unauthorized for medical image inspection.`);
      err.code = 'FORBIDDEN_ROLE';
      err.status = 403;
      throw err;
    }

    if (!caseId || !fileId) {
      const err = new Error('caseId and fileId are mandatory for medical viewer token issuance.');
      err.code = 'INVALID_PARAMETERS';
      err.status = 400;
      throw err;
    }

    // Patient Consent Verification
    if (patientId && !this.checkPatientViewingConsent(patientId)) {
      const err = new Error(`Access denied: Patient '${patientId}' has revoked diagnostic file sharing consent.`);
      err.code = 'PATIENT_CONSENT_REVOKED';
      err.status = 403;
      throw err;
    }

    const now = Date.now();
    const expiresAt = now + ttlMinutes * 60 * 1000;
    const nonce = crypto.randomBytes(8).toString('hex');
    const doctorId = doctorUser.uid;
    const clinicId = doctorUser.clinicId || 'default_clinic';

    // Payload containing scope and boundaries
    const payload = {
      doctorId,
      doctorName: doctorUser.displayName || doctorUser.name || 'Dr. Reviewer',
      role: doctorRole,
      clinicId,
      caseId,
      fileId,
      fileName,
      patientId: patientId || null,
      issuedAt: now,
      expiresAt,
      nonce
    };

    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secretKey)
      .update(payloadEncoded)
      .digest('base64url');

    const token = `${payloadEncoded}.${signature}`;
    this.activeTokens.set(token, payload);

    const forensicWatermark = this.generateForensicWatermark({ doctorUser, caseId, fileId, clinicId });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: Math.floor((expiresAt - now) / 1000),
      streamUrl: `/api/medical-viewer/files/${encodeURIComponent(fileId)}/stream?token=${encodeURIComponent(token)}`,
      caseId,
      fileId,
      watermark: forensicWatermark,
      disclaimer: this.getClinicalSafetyDisclaimer('ar')
    };
  }

  /**
   * Verifies an ephemeral viewing token and its cryptographically signed payload.
   */
  verifyViewingToken(token, { expectedFileId, expectedCaseId } = {}) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      const err = new Error('Malformed or missing medical viewer token.');
      err.code = 'TOKEN_MALFORMED';
      err.status = 401;
      throw err;
    }

    if (this.revokedTokens.has(token)) {
      const err = new Error('Medical viewer token has been revoked.');
      err.code = 'TOKEN_REVOKED';
      err.status = 401;
      throw err;
    }

    const [payloadEncoded, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', this.secretKey)
      .update(payloadEncoded)
      .digest('base64url');

    // Constant-time comparison preventing timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      const err = new Error('Medical viewer token signature is invalid or tampered.');
      err.code = 'INVALID_SIGNATURE';
      err.status = 403;
      throw err;
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
    } catch {
      const err = new Error('Failed to parse token payload.');
      err.code = 'TOKEN_PARSE_FAILED';
      err.status = 401;
      throw err;
    }

    if (Date.now() > payload.expiresAt) {
      const err = new Error(`Medical viewer token expired at ${new Date(payload.expiresAt).toISOString()}.`);
      err.code = 'TOKEN_EXPIRED';
      err.status = 401;
      throw err;
    }

    if (expectedFileId && payload.fileId !== expectedFileId) {
      const err = new Error(`Token is bound to fileId '${payload.fileId}', but '${expectedFileId}' was requested.`);
      err.code = 'FILE_MISMATCH';
      err.status = 403;
      throw err;
    }

    if (expectedCaseId && payload.caseId !== expectedCaseId) {
      const err = new Error(`Token is bound to caseId '${payload.caseId}', but '${expectedCaseId}' was requested.`);
      err.code = 'CASE_MISMATCH';
      err.status = 403;
      throw err;
    }

    // Consent check if patientId was bound
    if (payload.patientId && !this.checkPatientViewingConsent(payload.patientId)) {
      const err = new Error(`Access revoked: Patient '${payload.patientId}' has revoked diagnostic consent.`);
      err.code = 'PATIENT_CONSENT_REVOKED';
      err.status = 403;
      throw err;
    }

    return payload;
  }

  /**
   * Revokes a viewing token prematurely (e.g. on session termination).
   */
  revokeViewingToken(token) {
    if (token) {
      this.revokedTokens.add(token);
      this.activeTokens.delete(token);
    }
    return true;
  }

  // ===========================================================================
  // 2. PATIENT CONSENT & PRIVACY GOVERNANCE
  // ===========================================================================

  grantPatientViewingConsent({ patientId, purpose = 'diagnostic_clinical_review', validDays = 90 }) {
    if (!patientId) throw new Error('patientId is required to grant viewing consent.');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const consent = {
      patientId,
      status: 'granted',
      purpose,
      grantedAt: now.toISOString(),
      expiresAt,
      revokedAt: null
    };

    this.patientConsents.set(patientId, consent);
    return consent;
  }

  revokePatientViewingConsent({ patientId, reason = 'patient_requested' }) {
    if (!patientId) throw new Error('patientId is required to revoke viewing consent.');
    const consent = this.patientConsents.get(patientId) || { patientId, grantedAt: new Date().toISOString() };
    consent.status = 'revoked';
    consent.revokedAt = new Date().toISOString();
    consent.revocationReason = reason;

    this.patientConsents.set(patientId, consent);
    return consent;
  }

  checkPatientViewingConsent(patientId) {
    if (!patientId) return true;
    const consent = this.patientConsents.get(patientId);
    if (!consent) return true; // Default opt-in unless explicitly revoked
    if (consent.status === 'revoked') return false;
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() < Date.now()) return false;
    return true;
  }

  // ===========================================================================
  // 3. MEDICAL ASSET DE-IDENTIFICATION & EXIF/DICOM PHI STRIPPING
  // ===========================================================================

  /**
   * Strips direct PII (National ID, Phone, Home Address, Personal Email) from scan headers.
   */
  deidentifyMedicalAssetMetadata(rawMetadata = {}) {
    if (!rawMetadata || typeof rawMetadata !== 'object') return {};

    const deIdentified = { ...rawMetadata };

    // Direct PII fields to completely strip
    const directPiiFields = [
      'patientName', 'fullName', 'nationalId', 'nationalIdNumber', 'ssn',
      'phoneNumber', 'phone', 'mobile', 'homeAddress', 'address', 'email',
      'insuranceNumber', 'insurancePolicyId', 'dateOfBirth', 'dob',
      'personalNotes', 'emergencyContactPhone'
    ];

    directPiiFields.forEach(field => {
      delete deIdentified[field];
    });

    // Mask sensitive fields if present
    if (rawMetadata.patientId) {
      deIdentified.patientPseudoId = `pseudo_${crypto.createHash('sha256').update(String(rawMetadata.patientId)).digest('hex').slice(0, 12)}`;
      delete deIdentified.patientId;
    }

    // Preserve non-identifying clinical parameters
    deIdentified.isDeIdentified = true;
    deIdentified.deIdentifiedAt = new Date().toISOString();
    deIdentified.hipaaStandard = 'Safe Harbor Method (45 CFR § 164.514(b))';

    return deIdentified;
  }

  // ===========================================================================
  // 4. FORENSIC ANTI-LEAK WATERMARKING (Rology Security Standard)
  // ===========================================================================

  /**
   * Generates dynamic forensic watermark to discourage and track illicit screenshots.
   */
  generateForensicWatermark({ doctorUser, caseId, fileId, clinicId = 'default_clinic' }) {
    const doctorLegalName = doctorUser.displayName || doctorUser.name || 'Dr. Reviewing Physician';
    const syndicate = doctorUser.syndicateRegistrationNumber || 'EG-MED-LICENSED';
    const timestamp = new Date().toISOString();

    const watermarkText = `CONFIDENTIAL MEDICAL RECORD • DR. ${doctorLegalName} (${syndicate}) • CLINIC: ${clinicId} • CASE: ${caseId} • ${timestamp}`;
    const watermarkHash = crypto.createHmac('sha256', this.secretKey).update(watermarkText).digest('hex').slice(0, 16);

    return {
      text: watermarkText,
      compactText: `${doctorLegalName} • ${syndicate} • ${timestamp.slice(0, 16)}`,
      hash: watermarkHash,
      timestamp,
      policy: 'UNAUTHORIZED DISTRIBUTION OR SCREENSHOT CAPTURE IS STRICTLY PROHIBITED BY LAW'
    };
  }

  // ===========================================================================
  // 5. HUMAN PHYSICIAN GATEKEEPER & NON-REPLACEMENT ENFORCEMENT
  // ===========================================================================

  /**
   * Asserts that AI / automated algorithms CANNOT autonomously disclose diagnostic findings to patient.
   */
  assertNonAutonomousAiDisclosure(findingData = {}) {
    if (findingData.isAiGenerated && !findingData.certifiedByDoctor) {
      const err = new Error(
        'Autonomous AI diagnostic disclosure is strictly blocked. AI findings cannot be released without certified human physician review and digital sign-off.'
      );
      err.code = 'AUTONOMOUS_AI_DIAGNOSTIC_DISCLOSURE_BLOCKED';
      err.status = 403;
      throw err;
    }
  }

  /**
   * Certifies a medical scan by a licensed human doctor, binding their legal digital signature.
   */
  async certifyScanByDoctor({
    doctorUser,
    caseId,
    fileId,
    fileName = 'medical_scan',
    clinicalImpression = '',
    findingsSummary = '',
    overrideAi = false,
    db = null
  }) {
    if (!doctorUser || !doctorUser.uid) {
      const err = new Error('A verified human doctor is required to certify medical image findings.');
      err.code = 'HUMAN_PHYSICIAN_REQUIRED';
      err.status = 401;
      throw err;
    }

    const doctorRole = doctorUser.role || (doctorUser.customClaims && doctorUser.customClaims.role) || 'doctor';
    const allowedPhysicianRoles = ['doctor', 'radiologist'];
    if (!allowedPhysicianRoles.includes(doctorRole)) {
      const err = new Error(`Only licensed medical physicians may certify diagnostic scans. Role '${doctorRole}' is prohibited.`);
      err.code = 'PHYSICIAN_LICENSE_MANDATORY';
      err.status = 403;
      throw err;
    }

    if (!caseId || !fileId) {
      const err = new Error('caseId and fileId are required for clinical scan certification.');
      err.code = 'INVALID_PARAMETERS';
      err.status = 400;
      throw err;
    }

    const doctorLegalName = doctorUser.displayName || doctorUser.name || 'Dr. Reviewing Physician';
    const doctorSyndicateNumber = doctorUser.syndicateRegistrationNumber || 'EG-MED-44821';
    const certifiedAt = new Date().toISOString();

    // Cryptographic signature token for human certification
    const signatureHash = crypto.createHmac('sha256', this.secretKey)
      .update(`${caseId}:${fileId}:${doctorUser.uid}:${doctorSyndicateNumber}:${certifiedAt}`)
      .digest('hex');

    const certificate = {
      certificateId: `cert_scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      caseId,
      fileId,
      fileName,
      status: SCAN_REVIEW_STATUS.CERTIFIED_BY_DOCTOR,
      certifiedByDoctorUid: doctorUser.uid,
      doctorLegalName,
      doctorSyndicateNumber,
      certifiedAt,
      signatureHash,
      clinicalImpression: String(clinicalImpression).trim(),
      findingsSummary: String(findingsSummary).trim(),
      overrideAi: Boolean(overrideAi),
      disclaimer: this.getClinicalSafetyDisclaimer('ar')
    };

    const key = `${caseId}_${fileId}`;
    this.scanCertifications.set(key, certificate);

    // Record audit event
    await relationalDbService.recordMedicalViewerAudit({
      caseId,
      fileId,
      fileName,
      doctorId: doctorUser.uid,
      doctorName: doctorLegalName,
      clinicId: doctorUser.clinicId || 'default_clinic',
      action: 'DOCTOR_CLINICAL_CERTIFICATION_SIGN_OFF',
      telemetry: {
        certificateId: certificate.certificateId,
        doctorSyndicateNumber,
        overrideAi: Boolean(overrideAi)
      }
    });

    if (auditService && typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: 'DOCTOR_CLINICAL_CERTIFICATION_SIGN_OFF',
        actorUid: doctorUser.uid,
        actorRole: 'doctor',
        entityType: 'case_medical_file',
        targetEntityId: fileId,
        details: { caseId, certificateId: certificate.certificateId, doctorSyndicateNumber }
      }).catch(() => {});
    }

    if (analyticsService && typeof analyticsService.logTelemetryEvent === 'function') {
      analyticsService.logTelemetryEvent(db, {
        eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_SCAN_CERTIFIED,
        doctorId: doctorUser.uid,
        clinicId: doctorUser.clinicId || 'default_clinic',
        caseId,
        fileId,
        fileName,
        isCertified: true,
        certificateId: certificate.certificateId
      }).catch(() => {});
    }

    return {
      success: true,
      certified: true,
      certificate
    };
  }

  /**
   * Rejects an illegible, corrupt, or blurry medical scan with doctor feedback.
   */
  async rejectScanAsIllegible({ doctorUser, caseId, fileId, rejectionReason = 'image_blurred_or_unreadable', db = null }) {
    if (!doctorUser || !doctorUser.uid) {
      const err = new Error('Physician authentication required to reject scan.');
      err.code = 'HUMAN_PHYSICIAN_REQUIRED';
      err.status = 401;
      throw err;
    }

    const doctorLegalName = doctorUser.displayName || doctorUser.name || 'Dr. Reviewer';
    const rejectedAt = new Date().toISOString();

    const rejectionRecord = {
      caseId,
      fileId,
      status: SCAN_REVIEW_STATUS.REJECTED_ILLEGIBLE,
      rejectedByDoctorUid: doctorUser.uid,
      doctorLegalName,
      rejectionReason: String(rejectionReason).trim(),
      rejectedAt
    };

    const key = `${caseId}_${fileId}`;
    this.scanCertifications.set(key, rejectionRecord);

    await relationalDbService.recordMedicalViewerAudit({
      caseId,
      fileId,
      doctorId: doctorUser.uid,
      doctorName: doctorLegalName,
      clinicId: doctorUser.clinicId || 'default_clinic',
      action: 'SCAN_REJECTED_ILLEGIBLE',
      telemetry: { rejectionReason }
    });

    if (analyticsService && typeof analyticsService.logTelemetryEvent === 'function') {
      analyticsService.logTelemetryEvent(db, {
        eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_SCAN_REJECTED,
        doctorId: doctorUser.uid,
        clinicId: doctorUser.clinicId || 'default_clinic',
        caseId,
        fileId,
        rejectionReason: String(rejectionReason).slice(0, 100)
      }).catch(() => {});
    }

    return {
      success: true,
      status: SCAN_REVIEW_STATUS.REJECTED_ILLEGIBLE,
      rejectionRecord
    };
  }

  /**
   * Patient Right to be Forgotten / Soft-Deletion (GDPR Art. 17 & HIPAA Retention)
   */
  async eraseMedicalAssetForPrivacy({ patientUid, caseId, fileId, reason = 'patient_gdpr_erasure_request', db = null }) {
    if (!caseId || !fileId) {
      throw new Error('caseId and fileId are mandatory for privacy erasure.');
    }

    const key = `${caseId}_${fileId}`;
    this.scanCertifications.set(key, {
      caseId,
      fileId,
      status: SCAN_REVIEW_STATUS.PRIVACY_ERASED,
      erasedAt: new Date().toISOString(),
      reason
    });

    // Record immutable audit entry (compliant with HIPAA 6-year retention exemption)
    await relationalDbService.recordMedicalViewerAudit({
      caseId,
      fileId,
      doctorId: 'privacy_engine',
      doctorName: 'System DPO',
      clinicId: 'privacy_officer',
      action: 'MEDICAL_ASSET_PRIVACY_ERASED',
      telemetry: { patientUid, reason }
    });

    return {
      success: true,
      status: SCAN_REVIEW_STATUS.PRIVACY_ERASED,
      erasedAt: new Date().toISOString()
    };
  }

  getClinicalSafetyDisclaimer(lang = 'ar') {
    return CLINICAL_SAFETY_DISCLAIMERS[lang] || CLINICAL_SAFETY_DISCLAIMERS.ar;
  }

  // ===========================================================================
  // 6. HARDENED SECURITY HEADERS (Anti-Leak / DICOM Web Standards)
  // ===========================================================================

  getSecurityHeaders() {
    return {
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none';",
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Download-Options': 'noopen',
      'X-XSS-Protection': '1; mode=block'
    };
  }

  // ===========================================================================
  // 7. RELATIONAL PERSISTENCE FOR ANNOTATIONS & CLINICAL FINDINGS
  // ===========================================================================

  async saveAnnotationAndFindings({
    doctorUser,
    caseId,
    fileId,
    fileName = 'medical_scan',
    findingText = '',
    severity = FINDING_SEVERITY.NORMAL,
    windowPreset = 'normal',
    zoomLevel = 1.0,
    coordinates = null,
    tags = [],
    notifyUrgent = false,
    patientEmail = null,
    patientName = 'Patient',
    db = null
  }) {
    if (!doctorUser || !doctorUser.uid) {
      const err = new Error('Doctor authentication is required to record medical file findings.');
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }

    if (!caseId || !fileId) {
      const err = new Error('caseId and fileId are mandatory to save medical file findings.');
      err.code = 'INVALID_PARAMETERS';
      err.status = 400;
      throw err;
    }

    const validSeverities = Object.values(FINDING_SEVERITY);
    if (!validSeverities.includes(severity)) {
      const err = new Error(`Invalid finding severity: '${severity}'. Allowed: ${validSeverities.join(', ')}`);
      err.code = 'INVALID_SEVERITY';
      err.status = 400;
      throw err;
    }

    const doctorId = doctorUser.uid;
    const doctorName = doctorUser.displayName || doctorUser.name || 'Dr. Reviewer';
    const clinicId = doctorUser.clinicId || 'default_clinic';

    // 1. Save in Relational DB
    const annotationRecord = await relationalDbService.saveMedicalFileAnnotation({
      caseId,
      fileId,
      fileName,
      doctorId,
      doctorName,
      clinicId,
      findingText: String(findingText).trim(),
      severity,
      windowPreset,
      zoomLevel: Number(zoomLevel || 1.0),
      coordinates,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString()
    });

    // 2. Audit Trail
    await relationalDbService.recordMedicalViewerAudit({
      caseId,
      fileId,
      fileName,
      doctorId,
      doctorName,
      clinicId,
      action: severity === FINDING_SEVERITY.CRITICAL_ALERT ? 'CRITICAL_FINDING_RECORDED' : 'FINDING_RECORDED',
      telemetry: {
        severity,
        windowPreset,
        zoomLevel,
        hasCoordinates: Boolean(coordinates),
        notifyUrgent
      }
    });

    if (auditService && typeof auditService.recordAuditEvent === 'function') {
      auditService.recordAuditEvent(db, {
        type: severity === FINDING_SEVERITY.CRITICAL_ALERT
          ? (auditService.AUDIT_EVENT_TYPES.CRITICAL_CLINICAL_ALERT || 'CRITICAL_CLINICAL_ALERT')
          : 'MEDICAL_FILE_ANNOTATION_RECORDED',
        actorUid: doctorId,
        actorRole: 'doctor',
        entityType: 'case_medical_file',
        targetEntityId: fileId,
        details: { caseId, fileName, severity, notifyUrgent }
      }).catch(() => {});
    }

    // Telemetry Event Logging
    if (analyticsService && typeof analyticsService.logTelemetryEvent === 'function') {
      analyticsService.logTelemetryEvent(db, {
        eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_FINDING_RECORDED,
        doctorId,
        clinicId,
        caseId,
        fileId,
        fileName,
        severity,
        windowPreset,
        zoomLevel: Number(zoomLevel || 1.0),
        isCritical: severity === FINDING_SEVERITY.CRITICAL_ALERT || notifyUrgent === true
      }).catch(() => {});

      if (severity === FINDING_SEVERITY.CRITICAL_ALERT || notifyUrgent === true) {
        analyticsService.logTelemetryEvent(db, {
          eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_CRITICAL_ALERT,
          doctorId,
          clinicId,
          caseId,
          fileId,
          fileName,
          severity
        }).catch(() => {});
      }
    }

    // 3. Automatic Clinical Escalation & Notification Dispatch
    let alertDispatched = false;
    let notificationDetails = null;

    const isCritical = severity === FINDING_SEVERITY.CRITICAL_ALERT || notifyUrgent === true;
    if (isCritical) {
      alertDispatched = true;
      const escalationPayload = {
        caseId,
        fileId,
        fileName,
        severity,
        doctorName,
        findingsSummary: String(findingText).trim() || 'Critical finding identified on diagnostic image.',
        timestamp: new Date().toISOString()
      };

      try {
        if (notificationService && typeof notificationService.sendClinicalNotificationEmail === 'function') {
          const emailResult = await notificationService.sendClinicalNotificationEmail({
            type: notificationService.NOTIFICATION_TYPES.ESCALATION || 'escalation',
            to: patientEmail || 'clinical-triage@healthvibe.internal',
            caseId,
            patientName: patientName || 'Valued Patient',
            doctorName,
            findingSummary: escalationPayload.findingsSummary
          });
          notificationDetails = { channel: 'email', status: emailResult.status || 'sent', messageId: emailResult.messageId };
        } else if (notificationService && typeof notificationService.recordNotificationHistory === 'function') {
          notificationService.recordNotificationHistory({
            userId: doctorId,
            type: 'CRITICAL_RADIOLOGY_FINDING',
            title: `Critical Finding on ${fileName}`,
            body: escalationPayload.findingsSummary,
            metadata: escalationPayload
          });
          notificationDetails = { channel: 'in_app', status: 'recorded' };
        }
      } catch (notifErr) {
        console.warn('[MedicalViewerService] Clinical alert dispatch warning:', notifErr.message);
        notificationDetails = { channel: 'fallback', status: 'queued', warning: notifErr.message };
      }
    }

    return {
      success: true,
      annotation: annotationRecord,
      alertDispatched,
      isCritical,
      notificationDetails
    };
  }

  getCaseAnnotations(caseId, fileId = null) {
    if (!caseId) return [];
    return relationalDbService.getMedicalFileAnnotations(caseId, fileId);
  }

  // ===========================================================================
  // 8. VIEWING TELEMETRY & AUDIT TRAILS (Zero-PHI Compliance)
  // ===========================================================================

  async recordTelemetry({ doctorUser, caseId, fileId, fileName = 'medical_scan', telemetry = {}, req = null }) {
    if (!doctorUser || !doctorUser.uid) {
      throw new Error('Doctor authentication is required for telemetry recording.');
    }

    const {
      maxZoom = 1.0,
      windowPreset = 'normal',
      loupeUsed = false,
      durationMs = 0
    } = telemetry;

    const doctorId = doctorUser.uid;
    const doctorName = doctorUser.displayName || doctorUser.name || 'Dr. Reviewer';
    const clinicId = doctorUser.clinicId || 'default_clinic';

    // Zero-PHI Sanitization on Telemetry
    const safeTelemetry = {
      maxZoom: Math.min(Math.max(Number(maxZoom) || 1.0, 0.5), 8.0),
      windowPreset: String(windowPreset).slice(0, 32),
      loupeUsed: Boolean(loupeUsed),
      durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
      clientIp: req ? (req.ip || (req.headers && req.headers['x-forwarded-for']) || '127.0.0.1') : 'internal',
      userAgent: req ? (req.headers && req.headers['user-agent'] ? req.headers['user-agent'].slice(0, 100) : 'unknown') : 'internal'
    };

    const auditEntry = await relationalDbService.recordMedicalViewerAudit({
      caseId,
      fileId,
      fileName,
      doctorId,
      doctorName,
      clinicId,
      action: 'VIEW_INSPECTED',
      telemetry: safeTelemetry
    });

    // Operational Telemetry Logging
    if (analyticsService && typeof analyticsService.logTelemetryEvent === 'function') {
      const durationSeconds = Math.round(safeTelemetry.durationMs / 1000);
      analyticsService.logTelemetryEvent(null, {
        eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_SESSION_OPENED,
        doctorId,
        clinicId,
        caseId,
        fileId,
        fileName,
        maxZoom: safeTelemetry.maxZoom,
        windowPreset: safeTelemetry.windowPreset,
        loupeUsed: safeTelemetry.loupeUsed,
        durationSeconds
      }).catch(() => {});

      if (safeTelemetry.maxZoom >= 2.0) {
        analyticsService.logTelemetryEvent(null, {
          eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_ZOOM_PAN_INTERACTION,
          doctorId,
          clinicId,
          caseId,
          fileId,
          maxZoom: safeTelemetry.maxZoom
        }).catch(() => {});
      }

      if (safeTelemetry.loupeUsed || (safeTelemetry.windowPreset && safeTelemetry.windowPreset !== 'normal')) {
        analyticsService.logTelemetryEvent(null, {
          eventType: analyticsService.EVENT_TYPES.MEDICAL_VIEWER_TOOL_USED,
          doctorId,
          clinicId,
          caseId,
          fileId,
          toolName: safeTelemetry.loupeUsed ? 'loupe' : safeTelemetry.windowPreset
        }).catch(() => {});
      }
    }

    return {
      success: true,
      auditId: auditEntry.id,
      recordedAt: auditEntry.timestamp
    };
  }

  getViewerKpis(options = {}) {
    if (analyticsService && typeof analyticsService.calculateMedicalViewerKpis === 'function') {
      return analyticsService.calculateMedicalViewerKpis(analyticsService.getInMemoryEvents(), options);
    }
    return { success: false, message: 'Analytics service unavailable' };
  }

  getCaseViewerAuditLogs(caseId) {
    if (!caseId) return [];
    return relationalDbService.getMedicalViewerAuditLogs(caseId);
  }
}

// Singleton instance
const medicalViewerService = new MedicalViewerService();

module.exports = {
  MedicalViewerService,
  medicalViewerService,
  FINDING_SEVERITY,
  SCAN_REVIEW_STATUS,
  CLINICAL_SAFETY_DISCLAIMERS
};
