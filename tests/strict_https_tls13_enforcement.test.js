/**
 * HEALTH VIBE AI: STRICT HTTPS & TLS 1.3 ENFORCEMENT TEST SUITE
 * 
 * Verifies compliance with User Request 36:
 * "فرض بروتوكول HTTPS / TLS 1.3 على كافة نطاقات وواجهات برمجة تطبيقات healthvibes.app
 *  ومنع أي اتصال غير مشفر."
 * 
 * Enforces:
 * 1. HSTS (HTTP Strict Transport Security) with max-age=31536000, includeSubDomains, preload.
 * 2. Mandatory 301 Permanent Redirect to HTTPS for all browser traffic on healthvibes.app.
 * 3. HTTP 426 Upgrade Required for insecure plaintext API calls.
 * 4. Strict rejection of deprecated TLS versions (SSLv3, TLS 1.0, TLS 1.1, TLS 1.2).
 * 5. Hardened TLS 1.3 ciphers and Node.js server options.
 * 6. Configuration validation across backend/server.js, firebase.json, and app/config.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🔒 HEALTH VIBE AI: HTTPS & TLS 1.3 ENFORCEMENT TEST SUITE');
console.log('   PRD Page 10 Compliance: In-Transit Encryption & Anti-Plaintext Guard');
console.log('==================================================================\n');

(async function runTests() {
  const {
    ENFORCED_DOMAINS,
    HSTS_POLICY_HEADER,
    TLS_13_SPEC,
    isEnforcedDomain,
    isRequestSecure,
    verifyTlsVersion,
    httpsAndTls13EnforcementMiddleware,
    getSecureTls13ServerOptions
  } = require('../backend/tls-security-service');

  // ── TEST 1: Enforced Domain Scope & Matching ──────────────────────────────
  console.log('▶ TEST 1: Enforced Domains Matching (healthvibes.app & Subdomains)');

  assert.ok(isEnforcedDomain('healthvibes.app'), 'Must enforce healthvibes.app root');
  assert.ok(isEnforcedDomain('api.healthvibes.app'), 'Must enforce api.healthvibes.app');
  assert.ok(isEnforcedDomain('app.healthvibes.app'), 'Must enforce app.healthvibes.app');
  assert.ok(isEnforcedDomain('clinic.healthvibes.app'), 'Must enforce arbitrary subdomains');
  assert.ok(isEnforcedDomain('health-vibes-a4b3b.web.app'), 'Must enforce Firebase live hosting domain');
  assert.ok(isEnforcedDomain('health-vibes-a4b3b.firebaseapp.com'), 'Must enforce Firebase alternate domain');
  assert.strictEqual(isEnforcedDomain('unrelated-domain.com'), false, 'Must not enforce external domains');

  console.log(`  ✓ Enforced domains list verified: ${ENFORCED_DOMAINS.join(', ')}`);
  console.log('  ✓ Subdomain wildcard pattern matching confirmed.\n');

  // ── TEST 2: HSTS Policy Parameter Verification ─────────────────────────────
  console.log('▶ TEST 2: HSTS Policy Header Validation (Preload & 1-Year Max-Age)');

  assert.ok(HSTS_POLICY_HEADER.includes('max-age=31536000'), 'HSTS must specify 1 full year (31536000 seconds)');
  assert.ok(HSTS_POLICY_HEADER.includes('includeSubDomains'), 'HSTS must include all subdomains');
  assert.ok(HSTS_POLICY_HEADER.includes('preload'), 'HSTS must specify preload list eligibility');

  console.log(`  ✓ HSTS Header: ${HSTS_POLICY_HEADER}\n`);

  // ── TEST 3: Browser HTTP ➔ HTTPS 301 Permanent Redirect ───────────────────
  console.log('▶ TEST 3: Browser Plaintext HTTP ➔ HTTPS 301 Permanent Redirect');

  let redirectedStatus = null;
  let redirectedUrl = null;
  const mockHeadersSet = {};

  const mockReqBrowser = {
    method: 'GET',
    url: '/login?ref=portal',
    originalUrl: '/login?ref=portal',
    headers: {
      host: 'healthvibes.app',
      'x-forwarded-proto': 'http' // Insecure plain HTTP!
    },
    secure: false
  };

  const mockResBrowser = {
    setHeader(k, v) { mockHeadersSet[k.toLowerCase()] = v; },
    redirect(status, url) {
      redirectedStatus = status;
      redirectedUrl = url;
    }
  };

  httpsAndTls13EnforcementMiddleware(mockReqBrowser, mockResBrowser, () => {});

  assert.strictEqual(redirectedStatus, 301, 'Insecure GET must trigger 301 Permanent Redirect');
  assert.strictEqual(redirectedUrl, 'https://healthvibes.app/login?ref=portal', 'Must redirect to HTTPS URL');
  assert.strictEqual(mockHeadersSet['strict-transport-security'], HSTS_POLICY_HEADER);

  console.log('  ✓ Insecure browser request intercepted and redirected 301 to HTTPS.');
  console.log(`  ✓ Target URL: ${redirectedUrl}\n`);

  // ── TEST 4: API Mutating Plaintext HTTP Prohibition (HTTP 426) ────────────
  console.log('▶ TEST 4: API Mutating Plaintext HTTP Rejection (HTTP 426 Upgrade Required)');

  let apiResponseStatus = null;
  let apiResponseBody = null;

  const mockReqApi = {
    method: 'POST',
    url: '/api/patient/assessments',
    originalUrl: '/api/patient/assessments',
    headers: {
      host: 'api.healthvibes.app',
      'x-forwarded-proto': 'http' // Insecure plain HTTP on API endpoint!
    },
    secure: false
  };

  const mockResApi = {
    setHeader() {},
    status(code) {
      apiResponseStatus = code;
      return {
        json(body) { apiResponseBody = body; }
      };
    }
  };

  httpsAndTls13EnforcementMiddleware(mockReqApi, mockResApi, () => {});

  assert.strictEqual(apiResponseStatus, 426, 'Insecure POST to API must return HTTP 426 Upgrade Required');
  assert.strictEqual(apiResponseBody.error, 'HTTPS_REQUIRED');
  assert.ok(apiResponseBody.message.includes('TLS 1.3'));
  assert.strictEqual(apiResponseBody.targetHttpsUrl, 'https://api.healthvibes.app/api/patient/assessments');

  console.log('  ✓ Plaintext POST rejected with HTTP 426 (Preventing plaintext credential/PHI leakage).');
  console.log(`  ✓ Error message: ${apiResponseBody.message}\n`);

  // ── TEST 5: TLS 1.3 Protocol Enforcement & Deprecated Version Rejection ────
  console.log('▶ TEST 5: Deprecated TLS Versions Rejection (< TLS 1.3)');

  const deprecatedProtocols = ['TLSv1.0', 'TLSv1.1', 'TLSv1.2', 'SSLv3'];

  for (const proto of deprecatedProtocols) {
    const check = verifyTlsVersion({
      headers: { 'x-tls-version': proto }
    });
    assert.strictEqual(check.compliant, false, `${proto} must be flagged non-compliant`);
    assert.ok(check.reason.includes('prohibited'));
  }

  // Compliant TLS 1.3 passes
  const validCheck = verifyTlsVersion({
    headers: { 'x-tls-version': 'TLSv1.3' }
  });
  assert.strictEqual(validCheck.compliant, true);

  console.log('  ✓ Deprecated versions (SSLv3, TLS 1.0, TLS 1.1, TLS 1.2) strictly rejected.');
  console.log('  ✓ TLS 1.3 protocol verified compliant.\n');

  // ── TEST 6: Hardened Node.js HTTPS Server TLS 1.3 Options ─────────────────
  console.log('▶ TEST 6: Node.js HTTPS Server TLS 1.3 Configuration');

  const tlsOptions = getSecureTls13ServerOptions();
  assert.strictEqual(tlsOptions.minVersion, 'TLSv1.3', 'minVersion must be TLSv1.3');
  assert.strictEqual(tlsOptions.maxVersion, 'TLSv1.3', 'maxVersion must be TLSv1.3');
  assert.ok(tlsOptions.ciphers.includes('TLS_AES_256_GCM_SHA384'));
  assert.ok(tlsOptions.ciphers.includes('TLS_CHACHA20_POLY1305_SHA256'));
  assert.ok(tlsOptions.ciphers.includes('TLS_AES_128_GCM_SHA256'));
  assert.strictEqual(tlsOptions.honorCipherOrder, true);

  console.log('  ✓ Server options configured with TLS 1.3 and modern forward-secret ciphers.\n');

  // ── TEST 7: Firebase Hosting & Client Config Inspection ────────────────────
  console.log('▶ TEST 7: Firebase Hosting & Client Auto-Upgrade Inspection');

  const firebaseJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firebase.json'), 'utf8'));
  const headers = firebaseJson.hosting.headers[0].headers;

  const hstsEntry = headers.find(h => h.key === 'Strict-Transport-Security');
  assert.ok(hstsEntry, 'firebase.json must contain Strict-Transport-Security');
  assert.strictEqual(hstsEntry.value, HSTS_POLICY_HEADER);

  const cspEntry = headers.find(h => h.key === 'Content-Security-Policy');
  assert.ok(cspEntry, 'firebase.json must contain Content-Security-Policy');
  assert.ok(cspEntry.value.includes('upgrade-insecure-requests;'), 'CSP must enforce upgrade-insecure-requests');

  const configJsContent = fs.readFileSync(path.resolve(__dirname, '../app/config.js'), 'utf8');
  assert.ok(configJsContent.includes('window.location.protocol === "http:"'), 'app/config.js must contain HTTP auto-upgrade check');
  assert.ok(configJsContent.includes('replace(/^http:/, "https:")'), 'app/config.js must replace http with https');

  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');
  assert.ok(serverJsContent.includes('httpsAndTls13EnforcementMiddleware'), 'backend/server.js must mount httpsAndTls13EnforcementMiddleware');

  console.log('  ✓ firebase.json verified with HSTS and CSP upgrade-insecure-requests.');
  console.log('  ✓ app/config.js verified with instant client-side HTTPS redirect.');
  console.log('  ✓ backend/server.js verified with top-level middleware mounting.\n');

  console.log('==================================================================');
  console.log('🎉 ALL HTTPS & TLS 1.3 ENFORCEMENT TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
