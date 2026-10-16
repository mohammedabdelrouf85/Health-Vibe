/**
 * Kry Benchmark Test Suite: Secure Report Links & Zero-PHI Messaging (Req #63)
 * Standards:
 * - Kry Telehealth security specification
 * - HMAC-SHA256 signed time-limited report access URLs
 * - Zero-PHI SMS and email notification payloads
 * - Strict patient authentication and identity binding (Zero-Trust)
 */

const assert = require('assert');
const crypto = require('crypto');
const {
  secureReportLinkService,
  generateSecureReportToken,
  verifySecureReportToken,
  generateSecureReportUrl,
  formatSecureReportSms,
  verifyZeroPhiCompliance
} = require('../backend/secure-report-link-service');

const {
  buildResultReadyEmail
} = require('../backend/notification-service');

describe('🔒 Kry Benchmark: Secure Report Links & Zero-PHI Messaging (Req #63)', () => {
  const patientId = 'patient_user_789';
  const caseId = 'case_resp_456';
  const reportRef = 'HV-REP-RESP-456';

  describe('1. Cryptographic HMAC-SHA256 Token Generation & Expiration', () => {
    it('should generate a valid signed token containing metadata, expiry, and signature', () => {
      const token = generateSecureReportToken({
        caseId,
        patientId,
        reportRef,
        expiresInHours: 48
      });

      assert.strictEqual(typeof token, 'string');
      const parts = token.split('.');
      assert.strictEqual(parts.length, 2, 'Token must be composed of base64payload.hmacSignature');

      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      assert.strictEqual(payload.caseId, caseId);
      assert.strictEqual(payload.patientId, patientId);
      assert.strictEqual(payload.reportRef, reportRef);
      assert(payload.expiresAt > Date.now(), 'Token expiry must be in the future');
    });

    it('should generate a full URL containing caseId and token', () => {
      const linkData = generateSecureReportUrl({
        caseId,
        patientId,
        reportRef,
        expiresInHours: 24,
        appUrl: 'https://healthvibes.app'
      });

      assert(linkData.url.startsWith('https://healthvibes.app/#screen-report?caseId=case_resp_456&token='));
      assert.strictEqual(linkData.caseId, caseId);
      assert.strictEqual(linkData.patientId, patientId);
      assert(new Date(linkData.expiresAt).getTime() > Date.now());
    });

    it('should successfully verify a valid signed token for the authorized patient', () => {
      const token = generateSecureReportToken({
        caseId,
        patientId,
        reportRef,
        expiresInHours: 48
      });

      const verification = verifySecureReportToken(token, patientId);
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.authorized, true);
      assert.strictEqual(verification.caseId, caseId);
      assert.strictEqual(verification.patientId, patientId);
      assert.strictEqual(verification.reportRef, reportRef);
    });
  });

  describe('2. Security Protections: Tampering, Expiration & Identity Mismatch', () => {
    it('should reject a tampered token where payload was altered', () => {
      const token = generateSecureReportToken({ caseId, patientId, reportRef, expiresInHours: 48 });
      const [payloadB64, sig] = token.split('.');
      
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      payload.caseId = 'hacked_case_id';
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${tamperedPayloadB64}.${sig}`;

      const verification = verifySecureReportToken(tamperedToken, patientId);
      assert.strictEqual(verification.valid, false);
      assert.strictEqual(verification.error, 'INVALID_SIGNATURE');
    });

    it('should reject a token that has expired', () => {
      // Generate token expired 1 hour ago
      const tokenData = secureReportLinkService.generateSignedReportToken({
        caseId,
        patientId,
        reportRef,
        expiresInHours: -1
      });

      const verification = verifySecureReportToken(tokenData.token, patientId);
      assert.strictEqual(verification.valid, false);
      assert.strictEqual(verification.error, 'LINK_EXPIRED');
    });

    it('should reject access if a logged-in user does not match the patient ID (Zero-Trust Identity Guard)', () => {
      const token = generateSecureReportToken({ caseId, patientId, reportRef, expiresInHours: 48 });
      const maliciousUserId = 'imposter_user_999';

      const verification = verifySecureReportToken(token, maliciousUserId);
      assert.strictEqual(verification.valid, false);
      assert.strictEqual(verification.error, 'IDENTITY_MISMATCH');
    });

    it('should allow clinician/admin to access the report with the token', () => {
      const token = generateSecureReportToken({ caseId, patientId, reportRef, expiresInHours: 48 });
      const doctorUserId = 'verified_pulmonologist_doc1';

      const verification = verifySecureReportToken(token, doctorUserId, { isClinicianOrAdmin: true });
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.authorized, true);
    });

    it('should reject malformed tokens cleanly without uncaught exceptions', () => {
      const badTokens = ['', null, undefined, 'abc', 'abc.def.ghi', 'invalid!base64.fake_sig'];
      badTokens.forEach(badToken => {
        const verification = verifySecureReportToken(badToken, patientId);
        assert.strictEqual(verification.valid, false);
      });
    });
  });

  describe('3. Zero-PHI SMS & Notification Generation (Kry Compliance)', () => {
    it('should format an Arabic SMS without any sensitive clinical diagnosis or vitals in SMS body', () => {
      const sms = formatSecureReportSms({
        patientName: 'أحمد محمود',
        reportRef: 'HV-REP-2026-99',
        caseId,
        patientId,
        language: 'ar'
      });

      assert(sms.text.includes('مرحباً أحمد محمود'));
      assert(sms.text.includes('تم اعتماد تقرير فحصك الطبي #HV-REP-2026-99'));
      assert(sms.text.includes('#screen-report?caseId='));
      assert(sms.text.includes('صالح لمدة 48 ساعة'));
      assert(sms.text.includes('يتطلب عرض التقرير تسجيل الدخول'));

      // Check Zero-PHI compliance
      const compliance = verifyZeroPhiCompliance(sms.text);
      assert.strictEqual(compliance.compliant, true);
      assert.strictEqual(compliance.leaks.length, 0);
    });

    it('should format an English SMS meeting Zero-PHI standards', () => {
      const sms = formatSecureReportSms({
        patientName: 'Sarah Jenkins',
        reportRef: 'HV-REP-2026-EN',
        caseId,
        patientId,
        language: 'en'
      });

      assert(sms.text.includes('Hello Sarah Jenkins'));
      assert(sms.text.includes('certified clinical report #HV-REP-2026-EN'));
      assert(sms.text.includes('Login is strictly required'));

      const compliance = verifyZeroPhiCompliance(sms.text);
      assert.strictEqual(compliance.compliant, true);
    });

    it('should detect and flag PHI if sensitive clinical terms were erroneously injected', () => {
      const unsafeMessage = 'Hello Ahmed, your diagnosis is Pneumonia and SpO2 is 88%. Take Ventolin.';
      const compliance = verifyZeroPhiCompliance(unsafeMessage);
      assert.strictEqual(compliance.compliant, false);
      assert(compliance.leaks.length >= 2, 'Must detect diagnosis and vitals leaks');
    });
  });

  describe('4. Notification Integration: Result Ready Email with Signed Link', () => {
    it('should include signed token URL and zero-PHI security notice in result ready email', () => {
      const email = buildResultReadyEmail({
        patientName: 'مريم علي',
        patientEmail: 'mariam@example.com',
        patientId: 'patient_mariam_101',
        caseId: 'case_mariam_202',
        reportRef: 'HV-REP-MARIAM-01',
        doctorName: 'د. خالد عبد الرحمن',
        doctorSpecialty: 'استشاري أمراض الصدر والجهاز التنفسي',
        doctorLicense: 'EGY-SYND-77889',
        clinicName: 'مركز رعاية الصدر المتقدم',
        clinicalDiagnosis: 'التهاب شعبي حاد مع حساسية صدرية',
        medications: 'بخاخ فنتولين مرتان يومياً',
        recommendations: ['الراحة التامة والابتعاد عن الأدخنة.']
      });

      assert(email.actionUrl.includes('token='), 'actionUrl must contain cryptographic token');
      assert(email.html.includes('معيار Kry'));
      assert(email.html.includes('حماية وتشفير البيانات الطبية'));
      assert(email.html.includes('د. خالد عبد الرحمن'));
    });
  });
});
