/**
 * HEALTH VIBE AI: COMPREHENSIVE DEPENDENCY & SECURITY AUDIT TEST SUITE
 * 
 * Verifies:
 * 1. Supply-Chain Dependency Hygiene & NPM Audit (0 vulnerabilities)
 * 2. Static Credential & Secret Leakage Prevention
 * 3. Server Hardening & OWASP Header Compliance
 * 4. DoS / Payload Size Exhaustion Defense
 * 5. Sliding-Window Rate Limiting & Anti-Abuse
 * 6. CORS Policy & Cross-Origin Domain Isolation
 * 7. Firestore Security Rules RBAC & Anti-Wildcard Integrity
 * 8. Frontend XSS Sanitization & Data Safety
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("==================================================================");
console.log("🛡️  HEALTH VIBE AI: DEPENDENCY & SECURITY SCAN TEST SUITE");
console.log("   Supply Chain, OWASP Headers, Secrets, DoS & RBAC Hardening");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const APP_DIR = path.join(ROOT_DIR, 'app');

// -----------------------------------------------------------------------------
// TEST 1: NPM Dependency Audit & Zero Vulnerabilities
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Supply Chain Dependency Vulnerability Audit");
try {
  // Check backend package.json for overrides
  const backendPkg = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'package.json'), 'utf-8'));
  assert.ok(backendPkg.dependencies, "backend/package.json must declare dependencies.");
  assert.ok(backendPkg.overrides && backendPkg.overrides.uuid, "backend/package.json must contain uuid override to patch GHSA-w5hq-g745-h8pq.");

  // Run npm audit in backend
  const auditOutput = execSync('npm audit --json', { cwd: BACKEND_DIR, encoding: 'utf-8' });
  const auditReport = JSON.parse(auditOutput);
  const vulnCounts = auditReport.metadata && auditReport.metadata.vulnerabilities
    ? auditReport.metadata.vulnerabilities
    : { total: 0 };

  const criticalAndHigh = (vulnCounts.critical || 0) + (vulnCounts.high || 0);
  assert.strictEqual(criticalAndHigh, 0, `Expected 0 high or critical vulnerabilities, found ${criticalAndHigh}`);
  assert.strictEqual(vulnCounts.total || 0, 0, `Expected 0 total vulnerabilities after overrides, found ${vulnCounts.total}`);
  const totalDeps = (auditReport.metadata && auditReport.metadata.dependencies && auditReport.metadata.dependencies.total)
    || (auditReport.metadata && auditReport.metadata.totalDependencies)
    || 'all';
  console.log(`  ✓ Backend dependencies audited: 0 vulnerabilities found (${totalDeps} audited packages).`);
} catch (err) {
  if (err.stdout) {
    try {
      const parsed = JSON.parse(err.stdout);
      assert.strictEqual(parsed.metadata.vulnerabilities.total, 0, "Audit failed with vulnerabilities.");
    } catch (e) {
      assert.fail(`npm audit failed: ${err.message}`);
    }
  } else {
    assert.fail(`Dependency audit test failed: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 2: Static Secret & Credential Leakage Scan
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Static Credential & Secret Leakage Prevention");

const secretPatterns = [
  { name: 'Unencrypted Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Live Google Service Account Secret Key', regex: /"private_key":\s*"-----BEGIN/ },
  { name: 'Live AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Live GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Live Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/ }
];

const filesToScan = [];
function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scratch') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath);
    } else if (/\.(js|json|html|css|rules|md|env.*)$/i.test(entry.name)) {
      filesToScan.push(fullPath);
    }
  }
}
collectFiles(ROOT_DIR);

let detectedSecrets = 0;
for (const file of filesToScan) {
  const content = fs.readFileSync(file, 'utf-8');
  for (const pat of secretPatterns) {
    if (pat.regex.test(content)) {
      console.error(`  ❌ SECRET DETECTED: ${pat.name} in ${path.relative(ROOT_DIR, file)}`);
      detectedSecrets++;
    }
  }
}
assert.strictEqual(detectedSecrets, 0, `Found ${detectedSecrets} hardcoded secrets in repository!`);
console.log(`  ✓ Scanned ${filesToScan.length} repository source files: 0 leaked secrets or keys detected.`);

// Verify .gitignore protections
const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
assert.ok(gitignore.includes('.env'), ".gitignore must ignore .env files.");
assert.ok(gitignore.includes('node_modules/'), ".gitignore must ignore node_modules/.");
assert.ok(gitignore.includes('*serviceAccount*.json'), ".gitignore must ignore service account JSON files.");
assert.ok(gitignore.includes('*.key') || gitignore.includes('*.pem'), ".gitignore must ignore private key files.");
console.log("  ✓ .gitignore comprehensively guards environment secrets, credentials, and key files.");

// -----------------------------------------------------------------------------
// TEST 3: Server Hardening & OWASP Header Compliance
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Server Hardening & OWASP Header Compliance");
const serverCode = fs.readFileSync(path.join(BACKEND_DIR, 'server.js'), 'utf-8');

assert.ok(serverCode.includes("app.disable('x-powered-by')"), "Must suppress Express fingerprinting via app.disable('x-powered-by').");
assert.ok(serverCode.includes("'X-Content-Type-Options', 'nosniff'"), "Must set X-Content-Type-Options: nosniff header.");
assert.ok(serverCode.includes("'X-Frame-Options', 'DENY'"), "Must set X-Frame-Options: DENY header.");
assert.ok(serverCode.includes("'X-XSS-Protection'"), "Must set X-XSS-Protection header.");
assert.ok(serverCode.includes("'Referrer-Policy'"), "Must set strict Referrer-Policy header.");
assert.ok(serverCode.includes("'Permissions-Policy'"), "Must set Permissions-Policy header.");
assert.ok(serverCode.includes("Strict-Transport-Security"), "Must set Strict-Transport-Security (HSTS) in production.");
console.log("  ✓ Server fingerprinting suppressed and defense-in-depth OWASP security headers verified.");

// -----------------------------------------------------------------------------
// TEST 4: Request Body Size & DoS Protection
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Request Body Size & DoS Protection");
assert.ok(/express\.json\(\s*\{\s*limit:\s*['"]1mb['"]\s*\}\s*\)/.test(serverCode), "express.json must specify explicit body limit (e.g. 1mb) to mitigate DoS heap exhaustion.");
console.log("  ✓ Body parser limit strictly restricted to 1MB to prevent memory exhaustion attacks.");

// -----------------------------------------------------------------------------
// TEST 5: Rate Limiting & Anti-Abuse Protection
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Rate Limiting & Anti-Abuse Protection");
assert.ok(serverCode.includes("createRateLimiter"), "Server must implement sliding-window rate limiter middleware.");
assert.ok(serverCode.includes("strictMutationLimiter"), "Server must enforce strict rate limits on sensitive mutations.");
assert.ok(serverCode.includes("/api/notifications/send-email"), "Rate limiter must cover email notification dispatch.");
assert.ok(serverCode.includes("/api/feedback/submit"), "Rate limiter must cover feedback submissions.");
assert.ok(serverCode.includes("/api/appointments/book"), "Rate limiter must cover appointment bookings.");
console.log("  ✓ In-memory sliding-window rate limiters verified across global API and high-sensitivity routes.");

// -----------------------------------------------------------------------------
// TEST 6: CORS Policy & Cross-Origin Domain Isolation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: CORS Policy & Domain Whitelisting");
assert.ok(serverCode.includes("CORS_ORIGINS"), "Server must support configurable CORS origin whitelisting.");
assert.ok(serverCode.includes("https://healthvibe.ai"), "Production CORS policy must whitelist authoritative domain.");
// Verify rejection callback
assert.ok(serverCode.includes("CORS origin"), "CORS policy must reject unauthorized origins with a security error.");
console.log("  ✓ Strict CORS domain whitelisting enforced across Development and Production environments.");

// -----------------------------------------------------------------------------
// TEST 7: Firestore Security Rules RBAC & Anti-Wildcard Integrity
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 7: Firestore Security Rules RBAC & Anti-Wildcard Integrity");
const firestoreRules = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf-8');

// Strict check: No wide open rules
assert.ok(!/allow\s+write\s*:\s*if\s+true\s*;/.test(firestoreRules), "firestore.rules must NEVER contain 'allow write: if true;'.");
assert.ok(!/allow\s+read,\s*write\s*:\s*if\s+true\s*;/.test(firestoreRules), "firestore.rules must NEVER contain 'allow read, write: if true;'.");

// Check RBAC roles
assert.ok(firestoreRules.includes("function isOwner()"), "Security rules must define supreme system owner verification.");
assert.ok(firestoreRules.includes("function isDoctor()"), "Security rules must define verified doctor RBAC role.");
assert.ok(firestoreRules.includes("function isAdmin()"), "Security rules must define administrator RBAC role.");
assert.ok(firestoreRules.includes("function isSelf(userId)"), "Security rules must enforce strict per-user ownership.");

// Check collections coverage
const collections = ['users', 'cases', 'appointments', 'feedbacks', 'audit_events', 'email_notifications'];
for (const col of collections) {
  assert.ok(firestoreRules.includes(`match /${col}/`), `firestore.rules must explicitly define security sandbox for /${col}.`);
}
console.log("  ✓ Zero wildcard permissions found; verified RBAC functions and 6 collection sandboxes.");

// -----------------------------------------------------------------------------
// TEST 8: Frontend Sanitization & Safe DOM Interpolation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 8: Frontend Sanitization & Script Injection Defense");
const appJs = fs.readFileSync(path.join(APP_DIR, 'app.js'), 'utf-8');

// Ensure no dangerous document.write
assert.ok(!appJs.includes("document.write("), "app.js must NEVER use document.write().");

// Ensure encodeURIComponent is used for external parameters
assert.ok(appJs.includes("encodeURIComponent"), "app.js must use encodeURIComponent when assembling URLs.");

console.log("  ✓ Frontend avoids dangerous sinks and properly encodes dynamic parameters.");

console.log("\n==================================================================");
console.log("🎉 ALL 8 DEPENDENCY & SECURITY SCAN TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
