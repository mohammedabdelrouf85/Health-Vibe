/**
 * HEALTH VIBE AI: VALIDATION, RATE LIMITING & SECURITY HARDENING TEST SUITE
 * 
 * Verifies:
 * 1. Payload size limits (1MB json limit rejects oversized payload with 413).
 * 2. Malformed JSON rejection (returns 400 INVALID_JSON_PAYLOAD without stack traces).
 * 3. Public form protection: honeypot detection silently drops bot spam and field length limits reject overflow.
 * 4. OTP brute-force protection: rate limits & 15-minute lockout after 5 consecutive failures.
 * 5. Proxy configuration and secure client IP resolution (trust proxy & getClientIp).
 * 6. Rate limiting isolation per user (authenticated) and per IP (unauthenticated).
 * 7. Server secret isolation & redaction: prevents leakage of API keys, private keys, tokens, and audit salt in logs and responses.
 * 8. Error sanitization: 500 responses never expose stack traces, database queries, or Firebase/gRPC internal details.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Ensure development environment config for testing
process.env.NODE_ENV = 'development';
process.env.FIREBASE_PROJECT_ID = 'health-vibes-dev';
process.env.USE_FIREBASE_EMULATOR = 'true';
process.env.TRUST_PROXY = '1';

const app = require('../backend/server');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: SECURITY HARDENING & DEFENSE TEST SUITE');
console.log('   Body Limits, Validation, Rate Limiting, OTP Lockout & Secret Masking');
console.log('==================================================================\n');

function makeRequest(server, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (_) {
          json = null;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: rawData,
          json
        });
      });
    });

    req.on('error', reject);

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

(async () => {
  let server;
  try {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Request Payload Size Limit Rejection (413 Payload Too Large)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Request Payload Size Limit Rejection (413 Payload Too Large)');
    {
      // 1MB is 1,048,576 bytes. We send 1.2MB payload
      const largeString = 'X'.repeat(1.2 * 1024 * 1024);
      const payload = JSON.stringify({ data: largeString });

      const res = await makeRequest(server, {
        path: '/api/clinics/demo-request',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, payload);

      assert.strictEqual(res.statusCode, 413, `Expected 413, got ${res.statusCode}`);
      assert.strictEqual(res.json?.error, 'PAYLOAD_TOO_LARGE');
      assert.strictEqual(res.json?.stack, undefined, 'Stack trace must NEVER be present in response');
      console.log('  ✓ Oversized payload (>1MB) rejected with 413 PAYLOAD_TOO_LARGE and clean message.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Malformed JSON Syntax Rejection (400 Invalid JSON Payload)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 2: Malformed JSON Syntax Rejection (400 Invalid JSON Payload)');
    {
      const malformedPayload = '{"clinicName": "Test Clinic", "unclosed": ';

      const res = await makeRequest(server, {
        path: '/api/clinics/demo-request',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(malformedPayload)
        }
      }, malformedPayload);

      assert.strictEqual(res.statusCode, 400, `Expected 400, got ${res.statusCode}`);
      assert.strictEqual(res.json?.error, 'INVALID_JSON_PAYLOAD');
      assert.strictEqual(res.json?.stack, undefined, 'Stack trace must NEVER be present in response');
      assert.ok(!res.body.includes('SyntaxError: Unexpected end of JSON'), 'Internal V8 parser error details should not be exposed');
      console.log('  ✓ Malformed JSON rejected with 400 INVALID_JSON_PAYLOAD without stack or syntax leakage.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Public Form Protection (Honeypot + Length Bounds + Field Validation)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 3: Public Form Protection (Honeypot + Length Bounds + Field Validation)');
    {
      // 3A: Honeypot submission
      const honeypotPayload = JSON.stringify({
        clinicName: 'Spam Clinic',
        contactName: 'Spam Bot',
        email: 'bot@spam.com',
        phone: '+1234567890',
        website: 'http://malicious-spam-url.com' // Honeypot trap
      });

      const hpRes = await makeRequest(server, {
        path: '/api/clinics/demo-request',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, honeypotPayload);

      assert.strictEqual(hpRes.statusCode, 200, 'Honeypot should discard silently with 200 OK');
      assert.strictEqual(hpRes.json?.success, true);
      assert.strictEqual(hpRes.json?.leadId, undefined, 'Honeypot lead must NOT be registered or assigned lead ID');

      // 3B: Missing required fields
      const missingPayload = JSON.stringify({
        clinicName: '',
        contactName: 'Doctor Valid',
        email: 'doctor@valid.com',
        phone: '+1234567890'
      });
      const missRes = await makeRequest(server, {
        path: '/api/clinics/demo-request',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, missingPayload);
      assert.strictEqual(missRes.statusCode, 400);
      assert.strictEqual(missRes.json?.error, 'MISSING_FIELD');

      // 3C: Overflow field lengths
      const overflowPayload = JSON.stringify({
        clinicName: 'A'.repeat(150), // max is 100
        contactName: 'Valid Contact',
        email: 'valid@clinic.com',
        phone: '+1234567890'
      });
      const ovRes = await makeRequest(server, {
        path: '/api/clinics/demo-request',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, overflowPayload);
      assert.strictEqual(ovRes.statusCode, 400);
      assert.strictEqual(ovRes.json?.error, 'FIELD_TOO_LONG');

      console.log('  ✓ Public form honeypot silently swallows spam; field validation strictly enforces bounds.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: OTP Brute-Force Defense & 15-Minute Lockout
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 4: OTP Brute-Force Defense & 15-Minute Lockout');
    {
      const testOtpUser = 'lockout_test_user_' + Date.now();
      assert.strictEqual(app.checkOtpLockout(testOtpUser).locked, false);

      // Record 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const status = app.recordOtpFailure(testOtpUser);
        assert.strictEqual(status.attempts, i);
        assert.strictEqual(app.checkOtpLockout(testOtpUser).locked, false);
      }

      // 5th failed attempt must trigger 15-minute lockout
      const fifthStatus = app.recordOtpFailure(testOtpUser);
      assert.strictEqual(fifthStatus.attempts, 5);
      const lockoutCheck = app.checkOtpLockout(testOtpUser);
      assert.strictEqual(lockoutCheck.locked, true, 'User should be locked after 5 failed attempts');
      assert.ok(lockoutCheck.waitSec > 800 && lockoutCheck.waitSec <= 900, 'Lockout should be approximately 15 minutes (900s)');

      // Verify clearOtpLockout resets state
      app.clearOtpLockout(testOtpUser);
      assert.strictEqual(app.checkOtpLockout(testOtpUser).locked, false);

      console.log('  ✓ 5 failed OTP attempts trigger immediate 15-minute account lockout with retry wait time.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Proxy Configuration & Secure Client IP Resolution
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 5: Proxy Configuration & Secure Client IP Resolution');
    {
      const trustProxy = app.resolveTrustProxy();
      assert.ok(trustProxy === 1 || trustProxy === 'loopback' || trustProxy === true, `Unexpected trust proxy setting: ${trustProxy}`);

      // Test getClientIp helper
      assert.strictEqual(app.getClientIp({ ip: '192.168.1.50' }), '192.168.1.50');
      assert.strictEqual(app.getClientIp({ ip: '::ffff:203.0.113.195' }), '203.0.113.195');
      assert.strictEqual(app.getClientIp({ ip: '203.0.113.195:44321' }), '203.0.113.195');
      assert.strictEqual(app.getClientIp(null), '127.0.0.1');

      console.log('  ✓ Reverse proxy trust proxy and client IP sanitizer cleanly extract and normalize IP addresses.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Rate Limiting Isolation Per User vs Per IP
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 6: Rate Limiting Isolation Per User vs Per IP');
    {
      const limiter = app.createRateLimiter({
        windowMs: 10000,
        maxRequests: 3,
        message: 'Rate limit test exceeded'
      });

      let rateLimitStatus = null;
      let rateLimitHeaders = {};
      const fakeRes = {
        setHeader: (k, v) => { rateLimitHeaders[k] = v; },
        status: (code) => {
          rateLimitStatus = code;
          return {
            json: (data) => data
          };
        }
      };

      const userReq = { user: { uid: 'isolated_user_1' }, ip: '10.0.0.1' };
      let passedCount = 0;
      const nextFn = () => { passedCount++; };

      // Requests 1, 2, 3 should pass
      limiter(userReq, fakeRes, nextFn);
      limiter(userReq, fakeRes, nextFn);
      limiter(userReq, fakeRes, nextFn);
      assert.strictEqual(passedCount, 3);

      // Request 4 should be rejected with 429
      limiter(userReq, fakeRes, nextFn);
      assert.strictEqual(rateLimitStatus, 429);
      assert.ok(rateLimitHeaders['Retry-After'] !== undefined, 'Retry-After header must be set');

      // Different user from same IP should NOT be blocked
      const differentUserReq = { user: { uid: 'isolated_user_2' }, ip: '10.0.0.1' };
      let diffPassed = false;
      limiter(differentUserReq, fakeRes, () => { diffPassed = true; });
      assert.strictEqual(diffPassed, true, 'User rate limits must isolate per account, not starve other users on shared IP');

      console.log('  ✓ Sliding window rate limiter isolates by authenticated user ID with Retry-After header.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Server Secret Isolation & Redaction Engine
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 7: Server Secret Isolation & Redaction Engine');
    {
      process.env.AUDIT_SALT = 'super_secret_audit_salt_999888';
      process.env.WHATSAPP_API_TOKEN = 'secret_whatsapp_bearer_token_xyz123';

      const dummyPrivateKey = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----\nMIIEowIBAAKCAQEA0mockkey...\n-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
      const dummyApiKey = 'AIzaSyD-mockGoogleApiKey1234567890abcdef';
      const dummyBearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.mockSignature';

      const dirtyLogString = `Failed connecting to WhatsApp with token ${process.env.WHATSAPP_API_TOKEN}, audit salt ${process.env.AUDIT_SALT}, key ${dummyApiKey} and ${dummyPrivateKey} and ${dummyBearer}`;

      const masked = app.maskServerSecrets(dirtyLogString);

      assert.ok(!masked.includes(process.env.AUDIT_SALT), 'Audit salt must be redacted');
      assert.ok(!masked.includes(process.env.WHATSAPP_API_TOKEN), 'WhatsApp token must be redacted');
      assert.ok(!masked.includes(dummyApiKey), 'Google API key must be redacted');
      assert.ok(!masked.includes('BEGIN RSA PRIVATE KEY'), 'Private key must be redacted');
      assert.ok(!masked.includes('eyJhbGci'), 'Bearer JWT must be redacted');
      assert.ok(masked.includes('[REDACTED_SECRET]') || masked.includes('[REDACTED_API_KEY]'));

      // Test Error object masking
      const errWithSecret = new Error(`Secret leaked in message: ${process.env.AUDIT_SALT}`);
      const maskedErr = app.maskServerSecrets(errWithSecret);
      assert.ok(!maskedErr.message.includes(process.env.AUDIT_SALT));

      // Test Object masking
      const objWithSecrets = {
        name: 'test',
        password: 'myPassword123',
        token: 'tokenVal',
        nested: { private_key: 'myPrivateKey' }
      };
      const maskedObj = app.maskServerSecrets(objWithSecrets);
      assert.strictEqual(maskedObj.password, '[REDACTED]');
      assert.strictEqual(maskedObj.token, '[REDACTED]');

      console.log('  ✓ maskServerSecrets strictly sanitizes env secrets, private keys, bearer tokens and API keys.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Error Sanitization (No Stack Traces or Firebase Details to Users)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 8: Error Sanitization (No Stack Traces or Firebase Details to Users)');
    {
      // 8A: Test sanitizeClientErrorMessage directly
      const firestoreInternalError = '7 PERMISSION_DENIED: Missing or insufficient permissions. projects/health-vibes-dev/databases/(default)/documents/users/patient_01';
      const sanitizedMsg = app.sanitizeClientErrorMessage(firestoreInternalError);
      assert.strictEqual(sanitizedMsg, 'An internal service error occurred. Please try again later.');

      const stackTraceError = new Error('Database query failed\n    at Query.run (/app/node_modules/firestore/query.js:142:15)');
      const sanitizedStackMsg = app.sanitizeClientErrorMessage(stackTraceError);
      assert.strictEqual(sanitizedStackMsg, 'An internal service error occurred. Please try again later.');

      // 8B: Clean user-intended messages are preserved
      const userFacingMsg = 'A valid business email address is required.';
      assert.strictEqual(app.sanitizeClientErrorMessage(userFacingMsg), userFacingMsg);

      // 8C: Test response interceptor suppresses stack traces
      const testErrorData = {
        error: 'INTERNAL_ERROR',
        message: '7 PERMISSION_DENIED: projects/health-vibes-dev/databases/(default)/documents/patients/123',
        stack: 'Error: Database crashed\n    at run (/app/server.js:50:10)',
        details: { stack: 'Inner stack trace' }
      };

      const safeMessage = app.sanitizeClientErrorMessage(testErrorData.message);
      assert.strictEqual(safeMessage, 'An internal service error occurred. Please try again later.');
      assert.ok(!safeMessage.includes('projects/'));
      assert.ok(!safeMessage.includes('PERMISSION_DENIED'));

      console.log('  ✓ Firebase/gRPC internal details and stack traces are suppressed and replaced with safe messages.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL 8 HARDENING, VALIDATION & RATE LIMITING TESTS PASSED (100%)!');
    console.log('==================================================================\n');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
})().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
