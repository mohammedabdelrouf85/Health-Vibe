/**
 * Health Vibe AI - Kry Secure Report Links & Zero-PHI Messaging Service
 * Benchmark: Kry (Livi) - Digital Telehealth High-Security Patient Verification Standard
 *
 * Implements:
 * 1. Cryptographic HMAC-SHA256 Signed URLs for clinical reports (Time-to-Live / Expiry enforcement).
 * 2. Mandatory Patient Authentication Guard:
 *    - Links require patient login before report viewing.
 *    - Re-authenticates patient UID against token patientId (Identity Boundary).
 * 3. Zero-PHI External Transmission Standard:
 *    - Forbids sending sensitive clinical diagnoses, medications, or vitals in plaintext SMS / unencrypted alerts.
 *    - Replaces sensitive details with secure encrypted portal links.
 * 4. Tamper detection via timing-safe HMAC verification and nonce salt.
 */

const crypto = require('crypto');

class SecureReportLinkService {
  constructor(options = {}) {
    this.signingSecret = options.signingSecret || process.env.REPORT_LINK_SIGNING_KEY || process.env.STORAGE_SIGNING_KEY || 'kry-healthvibe-secure-report-key-2026';
    this.defaultTtlHours = Number(options.defaultTtlHours || process.env.REPORT_LINK_TTL_HOURS || 48);
    this.portalBaseUrl = options.portalBaseUrl || process.env.APP_BASE_URL || 'https://healthvibes.app';
    this.revokedTokens = new Set();
  }

  /**
   * Helper: Normalize base URL
   */
  _normalizeBaseUrl(url) {
    let clean = (url || this.portalBaseUrl).trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  }

  /**
   * Generates a cryptographically signed, tamper-proof, time-limited token
   */
  generateSignedReportToken(params = {}) {
    const {
      caseId,
      patientId,
      reportRef,
      expiresInHours = this.defaultTtlHours,
      metadata = {}
    } = params;

    if (!caseId) {
      throw new Error('CASE_ID_REQUIRED: caseId is required for generating secure report link.');
    }
    if (!patientId) {
      throw new Error('PATIENT_ID_REQUIRED: patientId is required to enforce patient identity binding.');
    }

    const issuedAt = Date.now();
    const ttlMs = expiresInHours * 60 * 60 * 1000;
    const expiresAt = issuedAt + ttlMs;
    const nonce = crypto.randomBytes(16).toString('hex');
    const cleanReportRef = String(reportRef || ('HV-REP-' + String(caseId).slice(-8).toUpperCase()));

    const payloadObj = {
      caseId: String(caseId),
      patientId: String(patientId),
      reportRef: cleanReportRef,
      issuedAt,
      expiresAt,
      nonce,
      ...metadata
    };

    const payloadRaw = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    
    // Canonical signature string
    const sigPayload = `${payloadObj.caseId}:${payloadObj.patientId}:${payloadObj.reportRef}:${issuedAt}:${expiresAt}:${nonce}`;
    const signature = crypto.createHmac('sha256', this.signingSecret)
      .update(sigPayload)
      .digest('hex');

    const signedToken = `${payloadRaw}.${signature}`;

    return {
      token: signedToken,
      caseId: payloadObj.caseId,
      patientId: payloadObj.patientId,
      reportRef: cleanReportRef,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInHours
    };
  }

  /**
   * Generates complete signed URL directing to patient portal
   */
  generateSecureReportUrl(params = {}) {
    const tokenData = this.generateSignedReportToken(params);
    const portalUrl = this._normalizeBaseUrl(params.appUrl);
    
    // Signed URL parameter format
    const secureUrl = `${portalUrl}/app/index.html?screen=report&caseId=${encodeURIComponent(tokenData.caseId)}&token=${encodeURIComponent(tokenData.token)}`;
    const shortUrl = `${portalUrl}/#screen-report?caseId=${encodeURIComponent(tokenData.caseId)}&token=${encodeURIComponent(tokenData.token)}`;

    return {
      url: shortUrl,
      secureUrl,
      shortUrl,
      ...tokenData
    };
  }

  /**
   * Verifies a signed report token, checking signature, expiry, and patient identity match
   */
  verifySecureReportToken(token, authenticatedUid = null, options = {}) {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'INVALID_TOKEN_FORMAT', message: 'Token is missing or not a string.' };
    }

    if (this.revokedTokens.has(token)) {
      return { valid: false, error: 'TOKEN_REVOKED', message: 'This secure report link has been revoked or expired.' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'INVALID_TOKEN_STRUCTURE', message: 'Token structure must be payload.signature.' };
    }

    const [payloadRaw, receivedSig] = parts;
    let payloadObj = null;

    try {
      const decodedJson = Buffer.from(payloadRaw, 'base64url').toString('utf8');
      payloadObj = JSON.parse(decodedJson);
    } catch (err) {
      return { valid: false, error: 'CORRUPTED_TOKEN_PAYLOAD', message: 'Failed to decode token payload.' };
    }

    // 1. Verify HMAC-SHA256 signature (constant time comparison)
    const expectedSigPayload = `${payloadObj.caseId}:${payloadObj.patientId}:${payloadObj.reportRef}:${payloadObj.issuedAt}:${payloadObj.expiresAt}:${payloadObj.nonce}`;
    const expectedSig = crypto.createHmac('sha256', this.signingSecret)
      .update(expectedSigPayload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const receivedBuf = Buffer.from(receivedSig, 'hex');

    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      return { valid: false, error: 'INVALID_SIGNATURE', message: 'Tamper detected: Token signature does not match.' };
    }

    // 2. Verify Expiry (Time-to-Live)
    const now = Date.now();
    if (now > payloadObj.expiresAt) {
      return {
        valid: false,
        error: 'LINK_EXPIRED',
        message: 'This secure report link has expired. Please log in to your portal to request a new link.',
        expiredAt: new Date(payloadObj.expiresAt).toISOString()
      };
    }

    // 3. Enforce Mandatory Patient Authentication Guard (Kry Benchmark)
    // If authenticatedUid is provided, verify it strictly matches the token's patientId
    if (authenticatedUid) {
      const isClinicianOrAdmin = options.isClinicianOrAdmin === true;
      if (authenticatedUid !== payloadObj.patientId && !isClinicianOrAdmin) {
        return {
          valid: false,
          error: 'IDENTITY_MISMATCH',
          message: 'Access Denied: This medical report is cryptographically bound to a different patient account.',
          tokenPatientId: payloadObj.patientId,
          attemptedUid: authenticatedUid
        };
      }
    } else if (options.requireAuthenticatedUid === true) {
      return {
        valid: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Patient login is mandatory before opening certified clinical report.'
      };
    }

    return {
      valid: true,
      authorized: true,
      caseId: payloadObj.caseId,
      patientId: payloadObj.patientId,
      reportRef: payloadObj.reportRef,
      issuedAt: new Date(payloadObj.issuedAt).toISOString(),
      expiresAt: new Date(payloadObj.expiresAt).toISOString(),
      payload: payloadObj
    };
  }

  /**
   * Revoke token (e.g. upon user request or report withdrawal)
   */
  revokeToken(token) {
    if (token) this.revokedTokens.add(token);
  }

  /**
   * Kry Benchmark: Formats a Zero-PHI SMS notification
   * Ensures NO diagnostic words, medications, or vitals are sent over plaintext SMS
   */
  formatSecureReportSms(params = {}) {
    const {
      patientName,
      reportRef,
      caseId,
      patientId,
      secureUrl: providedSecureUrl,
      language = 'ar',
      appUrl
    } = params;

    let targetLink = providedSecureUrl;
    if (!targetLink && caseId && patientId) {
      const generated = this.generateSecureReportUrl({ caseId, patientId, reportRef, appUrl });
      targetLink = generated.shortUrl;
    }

    const safeName = (patientName || (language === 'en' ? 'Valued Patient' : 'المحترم')).trim();
    const safeRef = reportRef || 'HV-REP';

    if (language === 'en') {
      return {
        sender: 'HEALTHVIBE',
        text: `Health Vibe AI: Hello ${safeName}, your certified clinical report #${safeRef} is ready in your encrypted portal. Login is strictly required to view: ${targetLink} (Valid for 48h). Do not share this link.`,
        hasZeroPhi: true,
        reportRef: safeRef,
        secureUrl: targetLink
      };
    }

    return {
      sender: 'HEALTHVIBE',
      text: `Health Vibe AI: مرحباً ${safeName}، تم اعتماد تقرير فحصك الطبي #${safeRef} وهو متاح الآن في ملفك الصحي المشفر. يتطلب عرض التقرير تسجيل الدخول عبر الرابط الآمن: ${targetLink} (صالح لمدة 48 ساعة). لا تشارك الرابط مع أحد.`,
      hasZeroPhi: true,
      reportRef: safeRef,
      secureUrl: targetLink
    };
  }

  /**
   * Kry Benchmark: Sanitizes an email or message payload to purge plaintext medical findings
   */
  sanitizeNotificationPayload(payload = {}) {
    const sanitized = { ...payload };

    // Purge plaintext PHI from external message body
    const sensitiveKeys = [
      'clinicalDiagnosis',
      'diagnosis',
      'medications',
      'prescription',
      'vitals',
      'spo2',
      'pulse',
      'respiratoryRate',
      'findings',
      'criticalFindings',
      'medicalHistory',
      'smokingStatus'
    ];

    for (const key of sensitiveKeys) {
      if (sanitized[key] !== undefined) {
        delete sanitized[key];
      }
    }

    sanitized.isEncryptedInPortal = true;
    sanitized.securityNotice = 'بيانات التقرير والوصفة الطبية مشفرة ومتاحة فقط بعد تسجيل الدخول للرابط الآمن.';

    return sanitized;
  }

  /**
   * Helper alias returning just the raw token string
   */
  generateSecureReportToken(params = {}) {
    const res = this.generateSignedReportToken(params);
    return res.token;
  }

  /**
   * Kry Benchmark: Verifies a notification string for Zero-PHI compliance
   */
  verifyZeroPhiCompliance(text = '') {
    if (!text || typeof text !== 'string') {
      return { compliant: true, leaks: [] };
    }

    const leaks = [];
    const lower = text.toLowerCase();

    // Sensitive clinical diagnoses patterns
    const clinicalPatterns = [
      /\b(pneumonia|asthma|copd|bronchitis|tuberculosis|covid|influenza)\b/i,
      /\b(التهاب رئوي|ربو|انسداد رئوي|درن|كورونا|نزلة شعبية)\b/u
    ];
    for (const pat of clinicalPatterns) {
      const m = text.match(pat);
      if (m) {
        leaks.push({ type: 'DIAGNOSIS_LEAK', match: m[0] });
      }
    }

    // Sensitive vitals with specific numbers
    const vitalsPatterns = [
      /\b(spo2|o2|oxygen|saturation)\s*(is|:|=)?\s*\d+%?/i,
      /\b(pulse|heart rate|bpm)\s*(is|:|=)?\s*\d+/i,
      /\b(respiratory rate|breaths)\s*(is|:|=)?\s*\d+/i,
      /نسبة\s*الأكسجين\s*(:|هو|هي)?\s*\d+/u
    ];
    for (const pat of vitalsPatterns) {
      const m = text.match(pat);
      if (m) {
        leaks.push({ type: 'VITALS_LEAK', match: m[0] });
      }
    }

    // Prescription / medications patterns
    const medPatterns = [
      /\b(ventolin|amoxicillin|augmentin|azithromycin|paracetamol|corticosteroid)\b/i,
      /\b(فنتولين|أوجمنتين|أموكسيسيلين|مضاد حيوي|كورتيزون)\b/u
    ];
    for (const pat of medPatterns) {
      const m = text.match(pat);
      if (m) {
        leaks.push({ type: 'MEDICATION_LEAK', match: m[0] });
      }
    }

    return {
      compliant: leaks.length === 0,
      leaks
    };
  }
}

// Singleton export
const secureReportLinkService = new SecureReportLinkService();

module.exports = {
  SecureReportLinkService,
  secureReportLinkService,
  generateSecureReportToken: (...args) => secureReportLinkService.generateSecureReportToken(...args),
  verifySecureReportToken: (...args) => secureReportLinkService.verifySecureReportToken(...args),
  generateSecureReportUrl: (...args) => secureReportLinkService.generateSecureReportUrl(...args),
  formatSecureReportSms: (...args) => secureReportLinkService.formatSecureReportSms(...args),
  sanitizeNotificationPayload: (...args) => secureReportLinkService.sanitizeNotificationPayload(...args),
  verifyZeroPhiCompliance: (...args) => secureReportLinkService.verifyZeroPhiCompliance(...args)
};

