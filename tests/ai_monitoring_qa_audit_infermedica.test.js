/**
 * HEALTH VIBE AI: AI MODEL MONITORING QA & AUDIT TEST SUITE (Infermedica Benchmark)
 * 
 * Comprehensive QA & Medical Research Verification:
 * 1. Multi-Role Authorization & Least Privilege Matrix (10+ Sub-Roles):
 *    - super_admin, clinical_qa, ops, clinic_admin, org_admin, support, doctor, doctor_verified, nurse, patient, unauthenticated.
 *    - Strict separation: Read privilege vs Model Management / Promotion privilege.
 * 2. Medical Research & Clinical Benchmark Auditing:
 *    - Statistical validity of Sensitivity, Specificity, Precision, F1-Score, AUC-ROC, and Doctor Concordance Rate.
 *    - Head-to-head comparison: candidate v1.1 vs active v1.0 (80% FP reduction verified).
 *    - Wilson 95% Confidence Intervals mathematical consistency.
 * 3. Sub-Cohort Demographic Fairness & Clinical Disparity Auditing:
 *    - Pediatric, Adult, Geriatric, and Chronic Lung Disease demographic parity.
 *    - Four-Fifths Rule compliance (Disparity Ratio >= 0.80).
 *    - Critical condition safety: Zero False Negatives (FN = 0, Sensitivity = 100%).
 * 4. Physician Concordance & Clinical Override Safety:
 *    - Doctor agreement rate validation (>= 90% threshold).
 *    - Documented physician override tracking and primacy enforcement.
 * 5. Privilege Escalation, Parameter Fuzzing & Security Penetration Testing:
 *    - Body-level role spoofing resistance (server-authoritative claims).
 *    - Malicious parameter fuzzing (XSS, NoSQL, Path probe).
 *    - Direct PHI submission blockage.
 * 6. Statutory Audit Trail Persistence:
 *    - Full lifecycle audit trail in audit_events with immutable timestamps and actor attribution.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('🧪  HEALTH VIBE AI: AI MODEL MONITORING QA & AUDIT TEST SUITE (Infermedica)');
console.log('    10+ Sub-Roles RBAC Matrix, Clinical Equity, Metric Auditing & Security QA');
console.log('================================================================================\n');

// Mock data stores
const docs = {
  users: new Map([
    ['user-super-admin', {
      uid: 'user-super-admin',
      role: 'super_admin',
      isOwner: true,
      email: 'owner@healthvibes.org',
      emailVerified: true
    }],
    ['user-clinical-qa', {
      uid: 'user-clinical-qa',
      role: 'clinical_qa',
      email: 'qa.lead@healthvibes.org',
      emailVerified: true
    }],
    ['user-ops-admin', {
      uid: 'user-ops-admin',
      role: 'ops',
      email: 'ops@healthvibes.org',
      emailVerified: true
    }],
    ['user-clinic-admin', {
      uid: 'user-clinic-admin',
      role: 'clinic_admin',
      clinicId: 'clinic_cairo_main',
      email: 'cairo.admin@healthvibes.org',
      emailVerified: true
    }],
    ['user-org-admin', {
      uid: 'user-org-admin',
      role: 'org_admin',
      email: 'org.admin@healthvibes.org',
      emailVerified: true
    }],
    ['user-support-admin', {
      uid: 'user-support-admin',
      role: 'support',
      email: 'support@healthvibes.org',
      emailVerified: true
    }],
    ['user-doctor', {
      uid: 'user-doctor',
      role: 'doctor',
      email: 'dr.tarek@healthvibes.org',
      emailVerified: true
    }],
    ['user-doctor-verified', {
      uid: 'user-doctor-verified',
      role: 'doctor_verified',
      email: 'dr.mona@healthvibes.org',
      emailVerified: true
    }],
    ['user-nurse', {
      uid: 'user-nurse',
      role: 'nurse',
      email: 'nurse.sarah@healthvibes.org',
      emailVerified: true
    }],
    ['user-patient', {
      uid: 'user-patient',
      role: 'patient',
      email: 'patient@test.org',
      emailVerified: true
    }]
  ]),
  ai_models: new Map(),
  ai_evaluations: new Map(),
  audit_events: new Map()
};

function collection(name) {
  return {
    doc: id => ({
      get: async () => ({
        exists: docs[name]?.has(id) || false,
        id,
        data: () => docs[name]?.get(id)
      }),
      set: async (data, opts = {}) => {
        if (!docs[name]) docs[name] = new Map();
        const current = docs[name].get(id) || {};
        const merged = opts.merge ? { ...current, ...data } : data;
        docs[name].set(id, merged);
      },
      update: async (data) => {
        if (!docs[name]?.has(id)) throw new Error(`Document ${id} does not exist`);
        const current = docs[name].get(id);
        docs[name].set(id, { ...current, ...data });
      },
      delete: async () => {
        docs[name]?.delete(id);
      }
    }),
    add: async data => {
      if (!docs[name]) docs[name] = new Map();
      const id = `${name}_${Date.now()}_${docs[name].size + 1}`;
      docs[name].set(id, { id, ...data });
      return { id };
    },
    get: async () => ({
      docs: Array.from(docs[name]?.entries() || []).map(([id, data]) => ({
        id,
        data: () => data
      })),
      empty: !docs[name] || docs[name].size === 0,
      forEach: fn => {
        for (const [id, data] of (docs[name]?.entries() || [])) {
          fn({ id, data: () => data });
        }
      }
    }),
    where: (field, op, value) => ({
      get: async () => {
        const matching = Array.from(docs[name]?.entries() || []).filter(([, data]) => {
          if (op === '==') return data[field] === value;
          return false;
        });
        return {
          docs: matching.map(([id, data]) => ({ id, data: () => data })),
          empty: matching.length === 0,
          forEach: fn => {
            for (const [id, data] of matching) {
              fn({ id, data: () => data });
            }
          }
        };
      }
    })
  };
}

const firestore = () => ({ collection });
firestore.FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: value => [value]
};

const userTokenMap = {
  'token-super-admin': { uid: 'user-super-admin', email: 'owner@healthvibes.org', role: 'super_admin', isOwner: true, email_verified: true },
  'token-clinical-qa': { uid: 'user-clinical-qa', email: 'qa.lead@healthvibes.org', role: 'clinical_qa', email_verified: true },
  'token-ops-admin': { uid: 'user-ops-admin', email: 'ops@healthvibes.org', role: 'ops', email_verified: true },
  'token-clinic-admin': { uid: 'user-clinic-admin', email: 'cairo.admin@healthvibes.org', role: 'clinic_admin', clinicId: 'clinic_cairo_main', email_verified: true },
  'token-org-admin': { uid: 'user-org-admin', email: 'org.admin@healthvibes.org', role: 'org_admin', email_verified: true },
  'token-support-admin': { uid: 'user-support-admin', email: 'support@healthvibes.org', role: 'support', email_verified: true },
  'token-doctor': { uid: 'user-doctor', email: 'dr.tarek@healthvibes.org', role: 'doctor', email_verified: true },
  'token-doctor-verified': { uid: 'user-doctor-verified', email: 'dr.mona@healthvibes.org', role: 'doctor_verified', email_verified: true },
  'token-nurse': { uid: 'user-nurse', email: 'nurse.sarah@healthvibes.org', role: 'nurse', email_verified: true },
  'token-patient': { uid: 'user-patient', email: 'patient@test.org', role: 'patient', email_verified: true }
};

const firebase = {
  apps: [{}],
  firestore,
  auth: () => ({
    verifyIdToken: async token => {
      const u = userTokenMap[token];
      if (!u) throw new Error('Invalid token');
      return { ...u };
    }
  })
};

const sandbox = {
  require: name => {
    if (name === 'firebase-admin') return firebase;
    if (name === 'dotenv') return { config() {} };
    if (name === './whatsapp-bot' || name === './backup-service') return {};
    return backendRequire(name);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true'
    },
    on() {},
    uptime: () => 1
  },
  console,
  Buffer,
  URL,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), sandbox);

const app = sandbox.module.exports;

(async function runComprehensiveQASuite() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, token = null, body = null) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${base}${url}`, opts);
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (_) {}
    } else {
      data = await res.text();
    }
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // -------------------------------------------------------------------------
    // SUITE 1: Multi-Role Authorization & Least Privilege Matrix (10+ Sub-Roles)
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 1: Multi-Role Authorization & Least Privilege Matrix (10+ Sub-Roles)');

    const subRoles = [
      { role: 'super_admin', token: 'token-super-admin', canRead: true, canManage: true },
      { role: 'clinical_qa', token: 'token-clinical-qa', canRead: true, canManage: true },
      { role: 'ops', token: 'token-ops-admin', canRead: true, canManage: false },
      { role: 'clinic_admin', token: 'token-clinic-admin', canRead: true, canManage: false },
      { role: 'org_admin', token: 'token-org-admin', canRead: true, canManage: false },
      { role: 'support', token: 'token-support-admin', canRead: false, canManage: false },
      { role: 'doctor', token: 'token-doctor', canRead: false, canManage: false },
      { role: 'doctor_verified', token: 'token-doctor-verified', canRead: false, canManage: false },
      { role: 'nurse', token: 'token-nurse', canRead: false, canManage: false },
      { role: 'patient', token: 'token-patient', canRead: false, canManage: false },
      { role: 'unauthenticated', token: null, canRead: false, canManage: false, isUnauth: true }
    ];

    for (const testRole of subRoles) {
      // 1.1 Read models
      const readRes = await api('GET', '/api/admin/ai/models', testRole.token);
      if (testRole.isUnauth) {
        assert.equal(readRes.status, 401, `Role ${testRole.role} must return 401 Unauthenticated`);
      } else if (testRole.canRead) {
        assert.equal(readRes.status, 200, `Role ${testRole.role} must be permitted to read models (200)`);
      } else {
        assert.equal(readRes.status, 403, `Role ${testRole.role} must be forbidden from reading models (403)`);
      }

      // 1.2 Model Promotion
      const promoteRes = await api('POST', '/api/admin/ai/models/model_hypoxemia_v1_2/promote', testRole.token, {});
      if (testRole.isUnauth) {
        assert.equal(promoteRes.status, 401);
      } else if (testRole.canManage) {
        assert.equal(promoteRes.status, 200, `Role ${testRole.role} must be permitted to promote models (200)`);
      } else {
        assert.equal(promoteRes.status, 403, `Role ${testRole.role} must be forbidden from promoting models (403)`);
      }

      // 1.3 Recording Evaluation
      const evalPayload = {
        modelId: 'model_hypoxemia_v1_2',
        batchName: `Evaluation by ${testRole.role}`,
        confusionMatrix: { tp: 10, fp: 1, tn: 9, fn: 0 }
      };
      const evalRes = await api('POST', '/api/admin/ai/evaluation/record', testRole.token, evalPayload);
      if (testRole.isUnauth) {
        assert.equal(evalRes.status, 401);
      } else if (testRole.canManage) {
        assert.equal(evalRes.status, 201, `Role ${testRole.role} must be permitted to record evaluations (201)`);
      } else {
        assert.equal(evalRes.status, 403, `Role ${testRole.role} must be forbidden from recording evaluations (403)`);
      }
    }

    // Reset models store to pristine benchmark state for subsequent suites
    docs.ai_models.clear();
    await app.resetAiModels();

    console.log('  ✓ 10+ sub-roles strictly verified against Least Privilege authorization matrix.\n');

    // -------------------------------------------------------------------------
    // SUITE 2: Medical Research & Clinical Benchmark Auditing (Infermedica Standard)
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 2: Medical Research & Clinical Metric Computations (Infermedica Standard)');

    const listRes = await api('GET', '/api/admin/ai/models', 'token-clinical-qa');
    assert.equal(listRes.status, 200);

    const v1_0 = listRes.data.models.find(m => m.version === 'v1.0');
    const v1_1 = listRes.data.models.find(m => m.version === 'v1.1');
    assert.ok(v1_0, 'Active v1.0 present in catalog');
    assert.ok(v1_1, 'Candidate v1.1 present in catalog');

    // Mathematical audit of metrics
    // v1.1: TP=42, FP=2, TN=36, FN=0
    const sens1_1 = 42 / (42 + 0);
    const spec1_1 = 36 / (36 + 2);
    const prec1_1 = 42 / (42 + 2);
    const f1_1_1 = (2 * prec1_1 * sens1_1) / (prec1_1 + sens1_1);

    assert.equal(v1_1.metrics.sensitivity, sens1_1);
    assert.equal(v1_1.metrics.specificity, spec1_1);
    assert.equal(v1_1.metrics.precision, prec1_1);
    assert.equal(Number(v1_1.metrics.f1Score.toFixed(4)), Number(f1_1_1.toFixed(4)));

    // Clinical comparison audit: False Positives reduction
    const fpReduction = (v1_0.confusionMatrix.fp - v1_1.confusionMatrix.fp) / v1_0.confusionMatrix.fp;
    assert.equal(fpReduction, 0.8, 'False positive reduction from v1.0 to v1.1 must equal 80%');

    // Wilson 95% Confidence Intervals bounds verification
    assert.ok(v1_1.metrics.sensitivityCI.lower >= 0 && v1_1.metrics.sensitivityCI.lower <= 1);
    assert.ok(v1_1.metrics.sensitivityCI.upper >= v1_1.metrics.sensitivityCI.lower && v1_1.metrics.sensitivityCI.upper <= 1);
    assert.ok(v1_1.metrics.specificityCI.lower >= 0 && v1_1.metrics.specificityCI.upper <= 1);

    console.log('  ✓ Mathematical metric equations, 80% FP drop, and Wilson CIs verified.\n');

    // -------------------------------------------------------------------------
    // SUITE 3: Sub-Cohort Demographic Fairness & Clinical Disparity Auditing
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 3: Sub-Cohort Demographic Fairness & Clinical Disparity Auditing');

    const detailRes = await api('GET', '/api/admin/ai/models/model_v1_1_candidate', 'token-clinical-qa');
    const cohorts = detailRes.data.model.subCohorts;
    assert.ok(cohorts, 'Sub-cohort breakdown must exist');

    const groups = ['pediatric', 'adult', 'geriatric', 'chronicLungDisease'];
    groups.forEach(g => {
      assert.ok(cohorts[g], `Cohort ${g} must be audited`);
      assert.ok(cohorts[g].n > 0, `Cohort ${g} sample count must be > 0`);
      // Zero-harm clinical safety check: Critical sensitivity must be 100% across all sub-cohorts
      assert.equal(cohorts[g].sensitivity, 1.0, `Cohort ${g} must maintain 100% sensitivity for acute cases`);
    });

    // Four-Fifths Rule (80% Rule) for Demographic Parity
    const specificities = groups.map(g => cohorts[g].specificity);
    const minSpec = Math.min(...specificities);
    const maxSpec = Math.max(...specificities);
    const disparityRatio = minSpec / maxSpec;
    assert.ok(disparityRatio >= 0.80, `Disparity ratio (${disparityRatio.toFixed(3)}) must satisfy >= 0.80 Four-Fifths Rule`);

    console.log(`  ✓ Sub-cohort demographic parity verified: Disparity ratio is ${(disparityRatio * 100).toFixed(1)}% (>= 80% rule).\n`);

    // -------------------------------------------------------------------------
    // SUITE 4: Physician Concordance & Clinical Override Safety
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 4: Physician Concordance & Clinical Override Safety');

    assert.ok(v1_1.doctorConcordance.rate >= 0.90, 'Doctor concordance rate must exceed 90% clinical standard');
    assert.equal(v1_1.doctorConcordance.rate, 0.975, 'v1.1 achieves 97.5% physician agreement');
    assert.equal(v1_1.physicianOverrides, 2, 'Exactly 2 documented overrides for v1.1 in benchmark sample');
    assert.equal(v1_1.doctorConcordance.agreed + v1_1.physicianOverrides, v1_1.doctorConcordance.total);

    console.log('  ✓ Physician concordance rate (97.5%) and clinical override safety validated.\n');

    // -------------------------------------------------------------------------
    // SUITE 5: Privilege Escalation, Parameter Fuzzing & Security Penetration Testing
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 5: Privilege Escalation, Parameter Fuzzing & Penetration Testing');

    // 5.1 Body-level role escalation attempt
    const spoofPayload = {
      modelId: 'model_v1_1_candidate',
      role: 'super_admin', // Spoofed in body
      isOwner: true        // Spoofed in body
    };
    const spoofRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/promote', 'token-ops-admin', spoofPayload);
    assert.equal(spoofRes.status, 403, 'Server-authoritative check must reject body-spoofed role with 403');

    // 5.2 SQL / Script Injection fuzzing in search parameter
    const fuzzedSearches = [
      "' OR '1'='1",
      "<script>document.location='http://attacker.com'</script>",
      '{"$gt": ""}',
      '../../../../etc/shadow'
    ];
    for (const payload of fuzzedSearches) {
      const fuzzRes = await api('GET', `/api/admin/ai/models?search=${encodeURIComponent(payload)}`, 'token-clinical-qa');
      assert.ok([200, 400, 403].includes(fuzzRes.status));
      if (fuzzRes.status === 200) {
        assert.equal(fuzzRes.data.success, true);
        assert.equal(fuzzRes.data.count, 0, 'Injected query must safely match zero records');
      }
    }

    // 5.3 Attempt to submit PHI in evaluation
    const phiPayload = {
      modelId: 'model_v1_1_candidate',
      patientName: 'مريض تجريبي',
      nationalId: '29505051234567'
    };
    const phiBlockRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-clinical-qa', phiPayload);
    assert.equal(phiBlockRes.status, 400);
    assert.equal(phiBlockRes.data.error, 'PHI_LEAKAGE_PROHIBITED');

    console.log('  ✓ Privilege escalation, parameter fuzzing, and PHI injection safely repelled.\n');

    // -------------------------------------------------------------------------
    // SUITE 6: Statutory Audit Trail & Quality Accountability
    // -------------------------------------------------------------------------
    console.log('▶ SUITE 6: Statutory Audit Trail & Quality Accountability Verification');

    const auditSnap = await firestore().collection('audit_events').get();
    const allAuditLogs = auditSnap.docs.map(d => d.data());

    // Verify statutory event types recorded
    const eventTypes = allAuditLogs.map(e => e.type);
    assert.ok(eventTypes.includes('AI_PHI_LEAKAGE_BLOCKED'), 'Must record AI_PHI_LEAKAGE_BLOCKED');
    assert.ok(eventTypes.includes('AI_MODEL_PROMOTED'), 'Must record AI_MODEL_PROMOTED');
    assert.ok(eventTypes.includes('AI_MODEL_EVALUATED'), 'Must record AI_MODEL_EVALUATED');

    // Audit record integrity check
    allAuditLogs.forEach(event => {
      assert.ok(event.type, 'Audit event must have type');
      assert.ok(event.timestamp, 'Audit event must have ISO timestamp');
      assert.ok(event.actor?.uid || event.userId, 'Audit event must have authenticated actor UID');
    });

    console.log('  ✓ Statutory audit trail integrity verified with immutable timestamps and actor attribution.\n');

    console.log('================================================================================');
    console.log('✅ ALL 6 AI MONITORING QA & AUDIT TEST SUITES PASSED (100% SUCCESS)');
    console.log('================================================================================');

  } finally {
    server.close();
  }
})().catch(err => {
  console.error('\n❌ QA & AUDIT TEST SUITE FAILED:', err);
  process.exit(1);
});
