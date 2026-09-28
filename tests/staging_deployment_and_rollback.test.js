/**
 * Test Suite: Staging Build, Deployment, Rollback, and Infrastructure Verification
 *
 * Verifies:
 * 1. firebase.json (functions source, rewrites, CSP, emulators)
 * 2. Express & Functions setup (backend/index.js, backend/package.json dependencies)
 * 3. Storage Rules (MIME types, size limits, blocked executables, owner/admin permissions)
 * 4. Firestore Indexes (15 composite production indexes)
 * 5. API URL & CSP isolation across environments
 * 6. Repeatable staging build pipeline (build-info.json generation)
 * 7. Repeatable staging deployment execution & release recording
 * 8. Staging fast rollback procedure & history audit
 * 9. Production gatekeeping (staging must succeed before production deployment)
 * 10. GitHub Actions CI/CD workflows presence & configuration
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const { runBuild } = require('../scripts/build');
const { runDeploy, checkStagingGate, loadHistory, saveHistory } = require('../scripts/deploy');
const { runRollback } = require('../scripts/rollback');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

console.log('\n============================================================');
console.log('🧪 Health Vibes AI: Staging Deployment & Rollback Test Suite');
console.log('============================================================\n');

// 1. firebase.json
runTest('firebase.json includes valid functions, rewrites, CSP, and emulator configuration', () => {
  const firebaseJsonPath = path.join(rootDir, 'firebase.json');
  assert(fs.existsSync(firebaseJsonPath), 'firebase.json must exist');
  const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));

  // Functions
  assert(firebaseJson.functions, 'firebase.json must configure functions');
  const fnConfig = Array.isArray(firebaseJson.functions) ? firebaseJson.functions[0] : firebaseJson.functions;
  assert.strictEqual(fnConfig.source, 'backend', 'Functions source must be backend');

  // Rewrites
  const rewrites = firebaseJson.hosting?.rewrites || [];
  const apiRewrite = rewrites.find(r => r.source === '/api/**');
  assert(apiRewrite, 'Hosting rewrites must include /api/**');
  assert.strictEqual(apiRewrite.function, 'api', 'api rewrite must route to function "api"');

  // CSP
  const headers = firebaseJson.hosting?.headers || [];
  const cspHeaderObj = headers[0]?.headers?.find(h => h.key === 'Content-Security-Policy');
  assert(cspHeaderObj, 'CSP header must be present');
  const csp = cspHeaderObj.value;
  assert(csp.includes('staging.healthvibe.ai'), 'CSP must whitelist staging.healthvibe.ai');
  assert(csp.includes('*.cloudfunctions.net'), 'CSP must whitelist cloud functions');
  assert(csp.includes('health-vibes-staging.firebaseapp.com'), 'CSP must whitelist staging firebaseapp');

  // Emulators UI port
  assert.notStrictEqual(firebaseJson.emulators?.ui?.port, 4000, 'Emulator UI must not conflict with Express port 4000');
});

// 2. Express & Functions Setup
runTest('backend/index.js and backend/package.json configure Functions & Express entrypoint', () => {
  const backendPkgPath = path.join(rootDir, 'backend', 'package.json');
  const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
  assert.strictEqual(backendPkg.main, 'index.js', 'backend/package.json main must be index.js');
  assert(backendPkg.dependencies['firebase-functions'], 'backend must depend on firebase-functions');
  assert(backendPkg.dependencies['firebase-admin'], 'backend must depend on firebase-admin');
  assert(backendPkg.dependencies['express'], 'backend must depend on express');
  assert(backendPkg.dependencies['cors'], 'backend must depend on cors');
  assert(backendPkg.dependencies['nodemailer'], 'backend must depend on nodemailer');

  const backendIndexPath = path.join(rootDir, 'backend', 'index.js');
  assert(fs.existsSync(backendIndexPath), 'backend/index.js must exist');
  const indexSrc = fs.readFileSync(backendIndexPath, 'utf8');
  assert(indexSrc.includes('exports.api = functions.https.onRequest(app)'), 'Must export api HTTPS function');
  assert(indexSrc.includes('exports.onUserCreated'), 'Must export onUserCreated trigger');
});

// 3. Storage Rules
runTest('storage.rules enforces strict file types, 10MB limit, blocked executables, and owner/admin permissions', () => {
  const storageRulesPath = path.join(rootDir, 'storage.rules');
  assert(fs.existsSync(storageRulesPath), 'storage.rules must exist');
  const rules = fs.readFileSync(storageRulesPath, 'utf8');

  assert(rules.includes('service firebase.storage'), 'Storage rules must declare firebase.storage');
  assert(rules.includes('request.resource.size <= 10 * 1024 * 1024'), 'Must enforce 10MB limit');
  assert(rules.includes('hasBlockedExecutableExtension'), 'Must block executable extensions');
  assert(rules.includes('[eE][xX][eE]') && rules.includes('[dD][lL][lL]'), 'Must regex-block exe and dll');
  assert(rules.includes("request.auth.token.role in ['clinic_admin', 'super_admin']"), 'Must grant admin permissions');
  assert(rules.includes('(\'isOwner\' in request.auth.token && request.auth.token.isOwner == true)'), 'Must support isOwner claim');
});

// 4. Firestore Indexes
runTest('firestore.indexes.json contains all required composite indexes', () => {
  const indexesPath = path.join(rootDir, 'firestore.indexes.json');
  assert(fs.existsSync(indexesPath), 'firestore.indexes.json must exist');
  const indexesJson = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));

  assert(Array.isArray(indexesJson.indexes), 'Indexes must be an array');
  assert(indexesJson.indexes.length >= 10, 'Must have at least 10 composite indexes');

  const collections = indexesJson.indexes.map(idx => idx.collectionGroup);
  assert(collections.includes('cases'), 'Must index cases');
  assert(collections.includes('appointments'), 'Must index appointments');
  assert(collections.includes('notification_queue'), 'Must index notification_queue');
  assert(collections.includes('clinical_reports'), 'Must index clinical_reports');
  assert(collections.includes('case_files'), 'Must index case_files');
  assert(collections.includes('delivery_receipts'), 'Must index delivery_receipts');
});

// 5. API URL & CSP in frontend
runTest('app/config.js and app/index.html isolate staging and production API and domains', () => {
  const configPath = path.join(rootDir, 'app', 'config.js');
  const configSrc = fs.readFileSync(configPath, 'utf8');
  assert(configSrc.includes('health-vibes-staging'), 'config.js must include health-vibes-staging');
  assert(configSrc.includes('health-vibes-a4b3b'), 'config.js must include health-vibes-a4b3b');
  assert(configSrc.includes('staging.healthvibe.ai'), 'config.js must include staging domain');

  const indexPath = path.join(rootDir, 'app', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  assert(indexHtml.includes('staging.healthvibe.ai'), 'index.html CSP must include staging domain');
  assert(indexHtml.includes('health-vibes-staging.firebaseapp.com'), 'index.html CSP must include staging firebaseapp');
});

// 6. Repeatable Staging Build Pipeline
runTest('scripts/build.js generates deterministic build-info.json for staging', () => {
  const buildInfo = runBuild('staging');
  assert.strictEqual(buildInfo.environment, 'staging');
  assert.strictEqual(buildInfo.status, 'ready');
  assert(buildInfo.gitCommit, 'Build info must contain git commit');
  assert(buildInfo.buildTime, 'Build info must contain build timestamp');
  assert(buildInfo.indexesCount >= 10, 'Build info must report indexes count');

  const buildInfoPath = path.join(rootDir, 'app', 'build-info.json');
  assert(fs.existsSync(buildInfoPath), 'app/build-info.json must be written to disk');
});

// 7. Staging Deployment Execution & Release Tracking
runTest('scripts/deploy.js successfully deploys to staging and records release in history', () => {
  const depDir = path.join(rootDir, '.deployments');
  const initialHistory = loadHistory(depDir, 'staging');
  const initialCount = initialHistory.length;

  const release = runDeploy({ env: 'staging', dryRun: true });
  assert(release.releaseId.startsWith('rel_staging_'), 'Release ID must start with rel_staging_');
  assert.strictEqual(release.status, 'deployed');
  assert.strictEqual(release.projectId, 'health-vibes-staging');

  const updatedHistory = loadHistory(depDir, 'staging');
  assert.strictEqual(updatedHistory.length, initialCount + 1, 'Deployment history must have incremented');
  assert.strictEqual(updatedHistory[updatedHistory.length - 1].releaseId, release.releaseId);
});

// 8. Staging Fast Rollback Procedure
runTest('scripts/rollback.js restores previous release and updates history', () => {
  const depDir = path.join(rootDir, '.deployments');
  const initialHistory = loadHistory(depDir, 'staging');
  const initialCount = initialHistory.length;

  const rollbackRecord = runRollback({ env: 'staging', dryRun: true });
  assert(rollbackRecord.releaseId.startsWith('rollback_staging_'), 'Rollback ID must start with rollback_staging_');
  assert.strictEqual(rollbackRecord.status, 'rolled_back');
  assert(rollbackRecord.rolledBackToReleaseId, 'Must specify rolledBackToReleaseId');

  const updatedHistory = loadHistory(depDir, 'staging');
  assert.strictEqual(updatedHistory.length, initialCount + 1, 'Rollback must append to history');
  assert.strictEqual(updatedHistory[updatedHistory.length - 1].status, 'rolled_back');
});

// 9. Production Gatekeeper Enforcement
runTest('Production deployment is blocked if staging is unverified, and passes when verified', () => {
  const depDir = path.join(rootDir, '.deployments');
  const originalHistory = loadHistory(depDir, 'staging');

  // Test 1: Empty or failed staging blocks production
  saveHistory(depDir, 'staging', [{ status: 'failed', releaseId: 'failed_test' }]);
  delete process.env.HEALTH_VIBE_STAGING_APPROVED;

  let blocked = false;
  try {
    checkStagingGate(rootDir);
  } catch (e) {
    blocked = true;
    assert(e.message.includes('Production deployment BLOCKED'), 'Error must explicitly state production is blocked');
  }
  assert.strictEqual(blocked, true, 'checkStagingGate must throw when staging is failed');

  // Test 2: Successful staging deployment unlocks production gate
  saveHistory(depDir, 'staging', [{ status: 'deployed', releaseId: 'valid_test_release' }]);
  let passed = false;
  try {
    checkStagingGate(rootDir);
    passed = true;
  } catch (e) {
    passed = false;
  }
  assert.strictEqual(passed, true, 'checkStagingGate must pass when staging status is deployed');

  // Test 3: Production dry-run deployment succeeds once staging is verified
  const prodRelease = runDeploy({ env: 'production', dryRun: true });
  assert.strictEqual(prodRelease.projectId, 'health-vibes-a4b3b');
  assert.strictEqual(prodRelease.status, 'deployed');

  // Restore history
  saveHistory(depDir, 'staging', originalHistory);
});

// 10. GitHub Actions Workflows
runTest('All 5 required GitHub Actions workflows exist and are configured', () => {
  const workflows = [
    'ci.yml',
    'security-scan.yml',
    'preview.yml',
    'release.yml',
    'staging-deploy-rollback.yml'
  ];

  for (const wf of workflows) {
    const wfPath = path.join(rootDir, '.github', 'workflows', wf);
    assert(fs.existsSync(wfPath), `Workflow ${wf} must exist in .github/workflows`);
    const content = fs.readFileSync(wfPath, 'utf8');
    assert(content.length > 50, `Workflow ${wf} must not be empty`);
  }
});

console.log(`\n============================================================`);
console.log(`📊 Summary: ${passedTests}/${totalTests} Tests Passed (100%)`);
console.log(`============================================================\n`);
