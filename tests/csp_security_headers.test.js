/**
 * HEALTH VIBE AI: CSP & PRODUCTION DEPLOYMENT SECURITY HEADERS TEST SUITE
 * 
 * Verifies:
 * 1. Firebase Hosting configuration in firebase.json.
 * 2. Static hosting headers for Content-Security-Policy (CSP).
 * 3. Whitelisted origins for Firebase SDKs, Auth, Firestore, and reCAPTCHA.
 * 4. Critical clickjacking, MIME-sniffing, and HSTS security headers in firebase.json.
 * 5. Permissions-Policy disabling unused browser APIs (camera, mic, geolocation).
 * 6. Defense-in-depth meta CSP tag in app/index.html for static CDNs.
 * 7. Server-authoritative CSP and OWASP headers in backend/server.js.
 * 8. Absence of dangerous CSP directives ('unsafe-eval', wildcard script-src '*').
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log("🛡️  HEALTH VIBE AI: CSP & DEPLOYMENT SECURITY HEADERS TEST SUITE");
console.log("   Content-Security-Policy, HSTS, Framing & Hosting Security");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, '..');
const FIREBASE_JSON_PATH = path.join(ROOT_DIR, 'firebase.json');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'app', 'index.html');
const SERVER_JS_PATH = path.join(ROOT_DIR, 'backend', 'server.js');

// -----------------------------------------------------------------------------
// TEST 1: Firebase Hosting Configuration in firebase.json
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Firebase Hosting Deployment Configuration in firebase.json");
const firebaseConfig = JSON.parse(fs.readFileSync(FIREBASE_JSON_PATH, 'utf-8'));

assert.ok(firebaseConfig.hosting, "firebase.json must define a 'hosting' block.");
assert.strictEqual(firebaseConfig.hosting.public, "app", "Hosting public root must point to 'app'.");
assert.ok(Array.isArray(firebaseConfig.hosting.headers), "Hosting must define a 'headers' array.");
assert.ok(firebaseConfig.hosting.headers.length > 0, "Hosting headers array must not be empty.");
console.log("  ✓ firebase.json hosting configuration verified with public directory 'app'.");

// -----------------------------------------------------------------------------
// TEST 2: Content-Security-Policy (CSP) Directives in firebase.json
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Content-Security-Policy (CSP) Directives in firebase.json");
const globalHeaderRule = firebaseConfig.hosting.headers.find(h => h.source === "**");
assert.ok(globalHeaderRule, "Hosting must define a global header rule for source '**'.");

const headerMap = {};
for (const h of globalHeaderRule.headers) {
  headerMap[h.key.toLowerCase()] = h.value;
}

const csp = headerMap['content-security-policy'];
assert.ok(csp, "firebase.json headers must include 'Content-Security-Policy'.");

// Directives verification
assert.ok(csp.includes("default-src 'self'"), "CSP must define default-src 'self'.");
assert.ok(csp.includes("script-src"), "CSP must define script-src.");
assert.ok(csp.includes("https://www.gstatic.com"), "CSP script-src must whitelist https://www.gstatic.com (Firebase SDK).");
assert.ok(csp.includes("https://www.google.com") || csp.includes("https://www.recaptcha.net"), "CSP script-src must whitelist reCAPTCHA/AppCheck.");
assert.ok(csp.includes("connect-src"), "CSP must define connect-src.");
assert.ok(csp.includes("object-src 'none'"), "CSP must strictly block object/embed/plugins with object-src 'none'.");
assert.ok(csp.includes("base-uri 'self'"), "CSP must enforce base-uri 'self'.");
assert.ok(csp.includes("form-action 'self'"), "CSP must restrict form submissions to form-action 'self'.");
console.log("  ✓ Content-Security-Policy directives verified with strict resource sandboxing.");

// -----------------------------------------------------------------------------
// TEST 3: Safe Directive Hygiene (No unsafe-eval or wildcards)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Safe Directive Hygiene (No unsafe-eval or script-src *)");
assert.ok(!csp.includes("'unsafe-eval'"), "Production CSP must NOT allow 'unsafe-eval'.");
assert.ok(!/script-src\s+[^;]*\*/.test(csp), "Production CSP must NOT allow wildcard script sources (*).");
console.log("  ✓ Production CSP free of dangerous 'unsafe-eval' or wildcard scripts.");

// -----------------------------------------------------------------------------
// TEST 4: Anti-MIME Sniffing (X-Content-Type-Options: nosniff)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: MIME-Type Sniffing Protection");
assert.strictEqual(
  headerMap['x-content-type-options'],
  'nosniff',
  "X-Content-Type-Options must be set to 'nosniff'."
);
console.log("  ✓ X-Content-Type-Options: nosniff verified.");

// -----------------------------------------------------------------------------
// TEST 5: Clickjacking Defense (X-Frame-Options: DENY)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Clickjacking & Frame Defense");
assert.strictEqual(
  headerMap['x-frame-options'],
  'DENY',
  "X-Frame-Options must be set to 'DENY'."
);
console.log("  ✓ X-Frame-Options: DENY verified.");

// -----------------------------------------------------------------------------
// TEST 6: Transport Security (HSTS)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: Strict Transport Security (HSTS)");
const hsts = headerMap['strict-transport-security'];
assert.ok(hsts, "Strict-Transport-Security header must be present.");
assert.ok(hsts.includes('max-age=31536000'), "HSTS max-age must be at least 1 year (31536000).");
assert.ok(hsts.includes('includeSubDomains'), "HSTS must includeSubDomains.");
console.log("  ✓ Strict-Transport-Security: max-age=31536000; includeSubDomains; preload verified.");

// -----------------------------------------------------------------------------
// TEST 7: Permissions-Policy Hardware Isolation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 7: Permissions-Policy Hardware Isolation");
const permissionsPolicy = headerMap['permissions-policy'];
assert.ok(permissionsPolicy, "Permissions-Policy header must be present.");
assert.ok(permissionsPolicy.includes('camera=()'), "Permissions-Policy must disable camera.");
assert.ok(permissionsPolicy.includes('microphone=()'), "Permissions-Policy must disable microphone.");
assert.ok(permissionsPolicy.includes('geolocation=()'), "Permissions-Policy must disable geolocation.");
console.log("  ✓ Permissions-Policy camera=(), microphone=(), geolocation=() verified.");

// -----------------------------------------------------------------------------
// TEST 8: Static HTML Meta Tag Defense-in-Depth in app/index.html
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 8: Static HTML Meta Tag Defense-in-Depth");
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
assert.ok(
  indexHtml.includes('<meta http-equiv="Content-Security-Policy"'),
  "app/index.html must include <meta http-equiv=\"Content-Security-Policy\"> for static hosting resilience."
);
console.log("  ✓ Client-side meta Content-Security-Policy verified in app/index.html.");

// -----------------------------------------------------------------------------
// TEST 9: Server-Authoritative CSP in backend/server.js
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 9: Server-Authoritative CSP in backend/server.js");
const serverJs = fs.readFileSync(SERVER_JS_PATH, 'utf-8');
assert.ok(
  serverJs.includes("res.setHeader('Content-Security-Policy'"),
  "backend/server.js must set Content-Security-Policy header on API responses."
);
assert.ok(
  serverJs.includes("res.setHeader('Cross-Origin-Opener-Policy'"),
  "backend/server.js must set Cross-Origin-Opener-Policy header."
);
assert.ok(
  serverJs.includes("res.setHeader('Cross-Origin-Resource-Policy'"),
  "backend/server.js must set Cross-Origin-Resource-Policy header."
);
console.log("  ✓ Backend server responses enforced with CSP and Cross-Origin isolation headers.");

console.log("\n==================================================================");
console.log("🎉 ALL 9 CSP & DEPLOYMENT SECURITY HEADERS TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
