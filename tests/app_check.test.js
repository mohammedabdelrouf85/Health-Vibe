/**
 * HEALTH VIBE AI: FIREBASE APP CHECK ATTESTATION TEST SUITE
 *
 * Verifies client configuration, server middleware wiring, and production
 * request behavior for valid, missing, expired, invalid, and independently
 * authenticated Firebase ID tokens.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

console.log("==================================================================");
console.log("HEALTH VIBE AI: FIREBASE APP CHECK ATTESTATION TEST SUITE");
console.log("Client Attestation, reCAPTCHA v3 & Zero-Trust Enforcement");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT_DIR, 'app');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const serverPath = path.join(BACKEND_DIR, 'server.js');

console.log("TEST 1: App Check SDK Script Tag in app/index.html");
const indexHtml = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf-8');
assert.ok(indexHtml.includes('firebase-app-check-compat.js'));
console.log("  OK: Firebase App Check compat script is loaded.");

console.log("\nTEST 2: App Check Environment Configuration");
const configCode = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf-8');
const RECAPTCHA_TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

function loadConfig(envName) {
  const sandbox = {
    window: {
      location: { hostname: envName === 'development' ? 'localhost' : 'healthvibe.ai', search: `?env=${envName}` },
      localStorage: { getItem: () => envName, setItem: () => {}, removeItem: () => {} }
    },
    localStorage: { getItem: () => envName, setItem: () => {}, removeItem: () => {} },
    URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    module: { exports: {} }
  };
  vm.runInNewContext(configCode, sandbox, { filename: path.join(APP_DIR, 'config.js') });
  return sandbox.window.HEALTH_VIBE_CONFIG.current;
}

const devCfg = loadConfig('development');
assert.equal(devCfg.appCheck.provider, "debug");
assert.ok(devCfg.appCheck.debugToken);

const prodCfg = loadConfig('production');
assert.equal(prodCfg.appCheck.provider, "recaptcha-v3");
assert.ok(prodCfg.appCheck.siteKey);
assert.notEqual(prodCfg.appCheck.siteKey, RECAPTCHA_TEST_SITE_KEY);
console.log("  OK: Provider and key presence are validated without printing secrets.");

console.log("\nTEST 3: Client-Side Activation & Token Retrieval");
const appJsCode = fs.readFileSync(path.join(APP_DIR, 'app.js'), 'utf-8');
assert.ok(appJsCode.includes("function initAppCheck("));
assert.ok(appJsCode.includes("function getAppCheckToken("));
assert.ok(appJsCode.includes("function authenticatedFetch("));
assert.ok(!appJsCode.includes(RECAPTCHA_TEST_SITE_KEY), "Client code must not fall back to the public reCAPTCHA test key.");
console.log("  OK: Client App Check methods exist and test-key fallback is absent.");

console.log("\nTEST 4: Backend App Check Middleware & Route Wiring");
const serverCode = fs.readFileSync(serverPath, 'utf-8');
assert.ok(serverCode.includes("async function verifyAppCheck("));
assert.ok(serverCode.includes("X-Firebase-AppCheck"));
assert.ok(serverCode.includes("app.use('/api'"));
assert.ok(serverCode.includes("APP_CHECK_PUBLIC_API_PATHS"));
assert.ok(!serverCode.includes("test-valid-app-check-token"));
assert.ok(!serverCode.includes("unverified-admin-fallback"));
console.log("  OK: Protected API routes are wired to App Check and mock production fallbacks are absent.");

console.log("\nTEST 5: Production Request Matrix");
const backendRequire = createRequire(serverPath);
const data = new Map([
  ['users/patient-user', { role: 'patient', emailVerified: true }]
]);

function snapshot(key) {
  return { id: key.split('/')[1], exists: data.has(key), data: () => data.get(key) };
}

function collection(name) {
  return {
    doc: id => ({ get: async () => snapshot(`${name}/${id}`) }),
    add: async value => {
      data.set(`${name}/${data.size + 1}`, value);
      return { id: `${data.size}` };
    },
    get: async () => ({ docs: [], empty: true }),
    where: () => ({ get: async () => ({ docs: [], empty: true }) }),
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], empty: true }) }) })
  };
}

const firestore = () => ({ collection });
firestore.FieldValue = {
  serverTimestamp: () => 'server-time',
  arrayUnion: value => [value],
  increment: value => value
};

const firebase = {
  apps: [{}],
  firestore,
  auth: () => ({
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'patient-id-token') {
        return { uid: 'patient-user', email: 'patient@example.test', role: 'patient', email_verified: true };
      }
      throw new Error('Invalid or expired Firebase ID token');
    }
  }),
  appCheck: () => ({
    verifyToken: async token => {
      if (token === 'valid-app-check') return { appId: 'health-vibes-web' };
      if (token === 'expired-app-check') throw new Error('App Check token expired');
      throw new Error('Invalid App Check token signature');
    }
  })
};

const sandbox = {
  require: name => {
    if (name === 'firebase-admin') return firebase;
    if (name === 'dotenv') return { config() {} };
    if (['./backup-service', './whatsapp-bot', './notification-service'].includes(name)) return {};
    return backendRequire(name);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  Buffer,
  setTimeout,
  clearTimeout,
  URL,
  console: { log() {}, info() {}, warn() {}, error() {} },
  process: {
    env: {
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'health-vibes-a4b3b',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-a4b3b',
      ENFORCE_APP_CHECK: 'true'
    },
    on() {},
    uptime: () => 1
  }
};

vm.runInNewContext(serverCode, sandbox, { filename: serverPath });

(async () => {
  const server = sandbox.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request({ appCheckToken, idToken = 'patient-id-token' } = {}) {
    const headers = { Authorization: `Bearer ${idToken}` };
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
    const response = await fetch(`${base}/api/auth/profile`, { headers });
    return { status: response.status, body: await response.json() };
  }

  try {
    assert.equal((await request({ appCheckToken: 'valid-app-check' })).status, 200, 'valid App Check and valid ID token should pass');

    const missing = await request();
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error, 'APP_CHECK_REQUIRED');

    const expired = await request({ appCheckToken: 'expired-app-check' });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error, 'APP_CHECK_INVALID');

    const invalid = await request({ appCheckToken: 'invalid-app-check' });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error, 'APP_CHECK_INVALID');

    const badUserToken = await request({ appCheckToken: 'valid-app-check', idToken: 'bad-user-token' });
    assert.equal(badUserToken.status, 403);
    assert.equal(badUserToken.body.error, 'FORBIDDEN');

    console.log("  OK: Valid, missing, expired, invalid, and independent user-token checks passed.");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log("\n==================================================================");
  console.log("ALL APP CHECK ATTESTATION TESTS PASSED");
  console.log("==================================================================");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
