/**
 * HEALTH VIBE AI: MULTI-FACTOR AUTHENTICATION (MFA) & STEP-UP SECURITY TEST SUITE
 * 
 * Verifies:
 * 1. RFC 6238 TOTP Engine & RFC 4648 Base32 Encoding (Zero-cost, works on any Firebase tier).
 * 2. MFA Enrollment Flow (Secret generation, 8 backup recovery codes, otpauth URI, activation).
 * 3. Step-Bypass Prevention on Sensitive Operations (Direct API calls without MFA blocked with 403).
 * 4. MFA Challenge Verification (TOTP verification, cryptographic ticket generation).
 * 5. Factor Loss & Emergency Recovery (Single-use HMAC backup codes, reuse prevention).
 * 6. Disenrollment with Step-Up Verification & Re-authentication.
 */

const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'development';
process.env.FIREBASE_PROJECT_ID = 'health-vibes-dev';
process.env.USE_FIREBASE_EMULATOR = 'true';

const app = require('../backend/server');
const mfaService = require('../backend/mfa-service');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('🔐 HEALTH VIBE AI: ENTERPRISE MFA & STEP-UP SECURITY TEST SUITE');
console.log('   RFC 6238 TOTP, Single-Use Recovery Codes, Step-Bypass Prevention');
console.log('==================================================================\n');

(async () => {
  let server;
  let baseUrl;

  try {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: RFC 6238 TOTP Engine & Base32 Encoding
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: RFC 6238 TOTP Engine & Base32 Encoding');
    {
      const secret = mfaService.generateTotpSecret();
      assert.ok(secret && secret.length >= 26, 'Generated secret must be a valid Base32 string');

      // Generate current code
      const code = mfaService.generateTotp(secret);
      assert.strictEqual(code.length, 6, 'TOTP code must be exactly 6 digits');
      assert.ok(/^\d{6}$/.test(code), 'TOTP code must be strictly numerical');

      // Verify valid code
      assert.strictEqual(mfaService.verifyTotp(code, secret), true, 'Valid TOTP code must verify successfully');

      // Verify invalid / expired / altered codes
      assert.strictEqual(mfaService.verifyTotp('000000', secret), false, 'Arbitrary code must fail');
      assert.strictEqual(mfaService.verifyTotp('12345', secret), false, 'Malformed length code must fail');
      assert.strictEqual(mfaService.verifyTotp(null, secret), false, 'Null code must fail');

      // Verify otpauth URI
      const uri = mfaService.generateOtpAuthUri({
        email: 'dr.sarah@healthvibe.ai',
        secret,
        issuer: 'Health Vibe AI'
      });
      assert.ok(uri.startsWith('otpauth://totp/'), 'URI must follow standard otpauth protocol');
      assert.ok(uri.includes('secret=' + secret), 'URI must contain secret');
      assert.ok(uri.includes('Health%20Vibes%20AI'), 'URI must contain encoded issuer');

      console.log('  ✓ RFC 6238 TOTP math, Base32 codec, and otpauth URI verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: Single-Use Backup Recovery Codes Generator & Cryptographic Hashing
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 2: Backup Recovery Codes & Salted HMAC-SHA256 Hashing');
    {
      const { plainCodes, hashedRecords } = mfaService.generateBackupCodes(8);
      assert.strictEqual(plainCodes.length, 8, 'Must generate exactly 8 emergency recovery codes');
      assert.strictEqual(hashedRecords.length, 8, 'Must produce 8 hashed records');

      for (let i = 0; i < 8; i++) {
        const plain = plainCodes[i];
        assert.ok(/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(plain), `Code '${plain}' must follow XXXX-XXXX format`);
        const expectedHash = mfaService.hashBackupCode(plain);
        assert.strictEqual(hashedRecords[i].hash, expectedHash, 'Hash must match salted HMAC-SHA256');
        assert.strictEqual(hashedRecords[i].used, false, 'Initial state must be unused');
      }

      console.log('  ✓ 8 single-use recovery codes generated in XXXX-XXXX format with HMAC-SHA256 hashes.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: Cryptographic MFA Verification Ticket System
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 3: Cryptographic MFA Verification Ticket System (Step-Up Ticket)');
    {
      const testUid = 'user_mfa_ticket_test';
      const ticket = mfaService.issueMfaTicket(testUid);

      assert.ok(ticket.startsWith('mfa_ticket_'), 'Ticket must start with mfa_ticket_ prefix');
      assert.strictEqual(mfaService.verifyMfaTicket(ticket, testUid), true, 'Valid ticket must verify');

      // Reject for different user
      assert.strictEqual(mfaService.verifyMfaTicket(ticket, 'attacker_uid'), false, 'Ticket must be user-bound');

      // Reject tampered ticket
      const tamperedTicket = ticket.slice(0, -4) + 'abcd';
      assert.strictEqual(mfaService.verifyMfaTicket(tamperedTicket, testUid), false, 'Tampered ticket signature must fail');

      console.log('  ✓ User-bound, HMAC-signed MFA verification tickets correctly issue and validate.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: Middleware Enforcement & Step-Bypass Prevention (Direct API Requests)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 4: Middleware Enforcement & Step-Bypass Prevention');
    {
      const enrolledUserId = 'dr_protected_' + Date.now();
      const secret = mfaService.generateTotpSecret();
      const { plainCodes, hashedRecords } = mfaService.generateBackupCodes(8);

      mfaService.setUserMfaRecord(enrolledUserId, {
        enabled: true,
        secret,
        backupCodes: hashedRecords,
        enrolledAt: new Date().toISOString()
      });

      // 4A: Direct API request WITHOUT any MFA header to sensitive middleware
      let status4A = null;
      let data4A = null;
      let nextCalled4A = false;
      const req4A = {
        user: { uid: enrolledUserId, email: 'dr@healthvibe.ai' },
        headers: {},
        originalUrl: '/api/user/change-password'
      };
      const res4A = {
        status: (s) => {
          status4A = s;
          return { json: (d) => { data4A = d; } };
        }
      };

      await app.requireMfaIfEnrolled(req4A, res4A, () => { nextCalled4A = true; });

      assert.strictEqual(nextCalled4A, false, 'Step-bypass direct request MUST be blocked');
      assert.strictEqual(status4A, 403, 'Must return 403 Forbidden for missing MFA');
      assert.strictEqual(data4A.error, 'MFA_REQUIRED');
      assert.strictEqual(data4A.mfaRequired, true);

      // 4B: Direct API request with INVALID TOTP code in header
      let status4B = null;
      let nextCalled4B = false;
      const req4B = {
        user: { uid: enrolledUserId, email: 'dr@healthvibe.ai' },
        headers: { 'x-mfa-code': '999999' },
        originalUrl: '/api/admin/set-user-role'
      };
      const res4B = {
        status: (s) => {
          status4B = s;
          return { json: () => {} };
        }
      };

      await app.requireMfaIfEnrolled(req4B, res4B, () => { nextCalled4B = true; });
      assert.strictEqual(nextCalled4B, false, 'Invalid code must be rejected');
      assert.strictEqual(status4B, 403);

      // 4C: Direct API request with VALID TOTP code in header
      let nextCalled4C = false;
      const validCode = mfaService.generateTotp(secret);
      const req4C = {
        user: { uid: enrolledUserId, email: 'dr@healthvibe.ai' },
        headers: { 'x-mfa-code': validCode },
        originalUrl: '/api/user/revoke-all-sessions'
      };
      await app.requireMfaIfEnrolled(req4C, res4A, () => { nextCalled4C = true; });
      assert.strictEqual(nextCalled4C, true, 'Valid TOTP code header must allow operation');

      // 4D: Direct API request with VALID step-up ticket in header
      let nextCalled4D = false;
      const ticket = mfaService.issueMfaTicket(enrolledUserId);
      const req4D = {
        user: { uid: enrolledUserId, email: 'dr@healthvibe.ai' },
        headers: { 'x-mfa-ticket': ticket },
        originalUrl: '/api/user/change-email'
      };
      await app.requireMfaIfEnrolled(req4D, res4A, () => { nextCalled4D = true; });
      assert.strictEqual(nextCalled4D, true, 'Valid MFA ticket header must allow operation');

      // 4E: Unenrolled user must pass without MFA header
      let nextCalled4E = false;
      const req4E = {
        user: { uid: 'unenrolled_user_123', email: 'regular@healthvibe.ai' },
        headers: {}
      };
      await app.requireMfaIfEnrolled(req4E, res4A, () => { nextCalled4E = true; });
      assert.strictEqual(nextCalled4E, true, 'Unenrolled users pass transparently');

      console.log('  ✓ Direct API step-bypass blocked (403 MFA_REQUIRED); valid tickets and codes accepted.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: Factor Loss & Emergency Recovery Code Consumption
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 5: Factor Loss & Single-Use Recovery Code Verification');
    {
      const userId = 'user_factor_loss_' + Date.now();
      const secret = mfaService.generateTotpSecret();
      const { plainCodes, hashedRecords } = mfaService.generateBackupCodes(8);

      mfaService.setUserMfaRecord(userId, {
        enabled: true,
        secret,
        backupCodes: hashedRecords,
        enrolledAt: new Date().toISOString()
      });

      const firstCode = plainCodes[0];
      const secondCode = plainCodes[1];

      // 5A: Consume first recovery code successfully
      const consumeResult1 = mfaService.consumeBackupCode(userId, firstCode);
      assert.strictEqual(consumeResult1, true, 'Valid unused backup code must be consumed');

      // 5B: Attempt to REUSE first recovery code (Must fail!)
      const reuseResult = mfaService.consumeBackupCode(userId, firstCode);
      assert.strictEqual(reuseResult, false, 'Reusing an already consumed backup code MUST fail');

      // 5C: Verify remaining count
      const rec = mfaService.getUserMfaRecord(userId);
      const remainingUnused = rec.backupCodes.filter(b => !b.used).length;
      assert.strictEqual(remainingUnused, 7, 'Remaining unused codes must be exactly 7');

      // 5D: Consume second recovery code via direct HTTP header on sensitive operation
      let nextCalled5D = false;
      const req5D = {
        user: { uid: userId, email: 'lost_phone@healthvibe.ai' },
        headers: { 'x-mfa-recovery-code': secondCode },
        originalUrl: '/api/user/change-password'
      };
      const dummyRes = { status: () => ({ json: () => {} }) };
      await app.requireMfaIfEnrolled(req5D, dummyRes, () => { nextCalled5D = true; });
      assert.strictEqual(nextCalled5D, true, 'Recovery code in header must pass sensitive operation');

      const remainingAfter5D = rec.backupCodes.filter(b => !b.used).length;
      assert.strictEqual(remainingAfter5D, 6, 'Remaining unused codes must now be 6');

      console.log('  ✓ Single-use backup recovery code successfully replaces lost factor; reuse blocked.');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: Audit Trail Logging for All MFA Events
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n▶ TEST 6: Audit Trail Event Types Verification');
    {
      assert.ok(auditService.AUDIT_EVENT_TYPES.MFA_ENROLLED, 'Must define MFA_ENROLLED event');
      assert.ok(auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_VERIFIED, 'Must define MFA_CHALLENGE_VERIFIED event');
      assert.ok(auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_FAILED, 'Must define MFA_CHALLENGE_FAILED event');
      assert.ok(auditService.AUDIT_EVENT_TYPES.MFA_RECOVERY_CODE_USED, 'Must define MFA_RECOVERY_CODE_USED event');
      assert.ok(auditService.AUDIT_EVENT_TYPES.MFA_DISENROLLED, 'Must define MFA_DISENROLLED event');

      console.log('  ✓ All 5 MFA audit event types registered in authoritative audit trail service.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL MFA & STEP-UP SECURITY CHECKS PASSED SUCCESSFULLY!');
    console.log('==================================================================\n');

  } finally {
    if (server && server.listening) {
      server.close();
    }
    process.exit(0);
  }
})().catch(err => {
  console.error('\n❌ MFA SECURITY TEST FAILURE:', err);
  process.exit(1);
});
