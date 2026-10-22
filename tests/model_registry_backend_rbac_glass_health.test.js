/**
 * HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK BACKEND & RBAC TEST SUITE (Glass Health)
 * 
 * Comprehensive Test Suite Verifying:
 * 1. Role-Based Access Control (RBAC) & Principle of Least Privilege:
 *    - Unauthenticated requests blocked (401 UNAUTHORIZED).
 *    - Non-administrative roles (doctor, nurse, patient) strictly blocked (403 ACCESS_DENIED).
 *    - Model Registry read access granted to Super Admin, Clinical QA, Ops, and Clinic Admin.
 *    - Safe Rollback execution strictly restricted to AI Model Managers (Super Admin & Clinical QA).
 *      Ops and Clinic Admin blocked with 403 ACCESS_DENIED when attempting rollback.
 * 2. Model Registry Catalog & Lineage Verification (/api/admin/ai/registry):
 *    - Lineage metadata: release dates, checkpoints, architectures, parameter counts, dataset versions.
 *    - Multi-criteria filtering: condition scope, lifecycle status, time range, text search.
 *    - Dynamic sorting: date_desc, date_asc, version_desc, sensitivity_desc, etc.
 *    - Scope-level summary aggregation and rollback eligibility determination.
 * 3. Deep-Dive Model Inspection (/api/admin/ai/registry/:modelId):
 *    - Sub-cohort demographic parity, confusion matrix, and active baseline correlation.
 *    - 404 guards for non-existent models.
 * 4. Side-by-Side Model Diff Engine (/api/admin/ai/registry/diff):
 *    - Delta calculations for sensitivity, specificity, precision, F1, AUC, and FP/FN deltas.
 *    - Verification of safety neutrality (sensitivity >= 100%) and FP reduction.
 *    - Default baseline fallback to current active model in the same condition scope.
 * 5. Instant Safe Rollback Execution (/api/admin/ai/registry/:modelId/rollback):
 *    - Zero-downtime hot-swap atomic state transitions (candidate -> active, previous active -> rolled_back).
 *    - Zero-PHI defense in rollback reason/notes (blocks National IDs, patient emails with 400).
 *    - Statutory immutable audit event persistence (AI_MODEL_ROLLED_BACK).
 * 6. Rollback History Trail (/api/admin/ai/registry/history/rollbacks):
 *    - Querying historical rollback events from audit store.
 *    - Verification of operator attribution, rollback notes, and ISO timestamps.
 * 7. Lineage Export Engine & Security Headers (/api/admin/ai/registry/export):
 *    - CSV and JSON export verification with full lineage columns.
 *    - Verification of security headers and parameter injection protection.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('📜  HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK BACKEND & RBAC TEST SUITE');
console.log('    RBAC Enforcement, Rollback Hot-Swap, Lineage Diffs & Audit Persistence');
console.log('================================================================================\n');

// Mock data stores for Firestore
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
      email: 'clinic.admin@healthvibes.org',
      emailVerified: true
    }],
    ['user-doctor', {
      uid: 'user-doctor',
      role: 'doctor',
      email: 'doctor@healthvibes.org',
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
  'token-clinic-admin': { uid: 'user-clinic-admin', email: 'clinic.admin@healthvibes.org', role: 'clinic_admin', clinicId: 'clinic_cairo_main', email_verified: true },
  'token-doctor': { uid: 'user-doctor', email: 'doctor@healthvibes.org', role: 'doctor', email_verified: true },
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

(async function runTestSuite() {
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
    // TEST 1: Authentication & Role-Based Access Control (RBAC) Matrix
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: Role-Based Access Control (RBAC) Matrix for Model Registry');

    // 1.1 Unauthenticated requests return 401
    const unauthRegistry = await api('GET', '/api/admin/ai/registry');
    assert.equal(unauthRegistry.status, 401, 'Unauthenticated registry access must return 401');

    const unauthDiff = await api('GET', '/api/admin/ai/registry/diff?to=model_v1_1_candidate');
    assert.equal(unauthDiff.status, 401, 'Unauthenticated diff access must return 401');

    const unauthRollback = await api('POST', '/api/admin/ai/registry/model_v1_1_candidate/rollback', null, {});
    assert.equal(unauthRollback.status, 401, 'Unauthenticated rollback must return 401');

    // 1.2 Non-administrative roles (patient & doctor) return 403 ACCESS_DENIED
    const patientRegistry = await api('GET', '/api/admin/ai/registry', 'token-patient');
    assert.equal(patientRegistry.status, 403, 'Patient cannot access model registry');
    assert.equal(patientRegistry.data.error, 'ACCESS_DENIED');

    const doctorRegistry = await api('GET', '/api/admin/ai/registry', 'token-doctor');
    assert.equal(doctorRegistry.status, 403, 'Doctor cannot access model registry');
    assert.equal(doctorRegistry.data.error, 'ACCESS_DENIED');

    const doctorRollback = await api('POST', '/api/admin/ai/registry/model_v1_1_candidate/rollback', 'token-doctor', {});
    assert.equal(doctorRollback.status, 403, 'Doctor cannot execute emergency rollback');

    // 1.3 Read access granted to Super Admin, Clinical QA, Ops Admin, Clinic Admin
    const superAdminRes = await api('GET', '/api/admin/ai/registry', 'token-super-admin');
    assert.equal(superAdminRes.status, 200, 'Super Admin must have registry read access');

    const clinicalQaRes = await api('GET', '/api/admin/ai/registry', 'token-clinical-qa');
    assert.equal(clinicalQaRes.status, 200, 'Clinical QA must have registry read access');

    const opsAdminRes = await api('GET', '/api/admin/ai/registry', 'token-ops-admin');
    assert.equal(opsAdminRes.status, 200, 'Ops Admin must have registry read access');

    const clinicAdminRes = await api('GET', '/api/admin/ai/registry', 'token-clinic-admin');
    assert.equal(clinicAdminRes.status, 200, 'Clinic Admin must have registry read access');

    // 1.4 Strict Separation of Privilege on Rollback:
    // Ops Admin and Clinic Admin can read registry, but CANNOT execute rollbacks!
    const opsRollback = await api('POST', '/api/admin/ai/registry/model_v1_1_candidate/rollback', 'token-ops-admin', { reason: 'Test' });
    assert.equal(opsRollback.status, 403, 'Ops Admin must be strictly blocked from rollback');
    assert.equal(opsRollback.data.error, 'ACCESS_DENIED');

    const clinicAdminRollback = await api('POST', '/api/admin/ai/registry/model_v1_1_candidate/rollback', 'token-clinic-admin', { reason: 'Test' });
    assert.equal(clinicAdminRollback.status, 403, 'Clinic Admin must be strictly blocked from rollback');
    assert.equal(clinicAdminRollback.data.error, 'ACCESS_DENIED');

    console.log('  ✓ RBAC matrix strictly enforced: Unauthorized roles blocked, privilege separation intact.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Model Registry Lineage Metadata & Listing Engine
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Model Registry Lineage Metadata & Fast Filtering Engine');

    const registryRes = await api('GET', '/api/admin/ai/registry', 'token-clinical-qa');
    assert.equal(registryRes.status, 200);
    assert.equal(registryRes.data.success, true);
    assert.ok(registryRes.data.totalModels >= 5, 'Must contain at least 5 registered models');
    assert.ok(registryRes.data.activeCount >= 2, 'Must contain active production models');
    assert.ok(registryRes.data.candidateCount >= 1, 'Must contain candidate models');

    // Verify Glass Health Lineage properties on each model record
    const candidateModel = registryRes.data.models.find(m => m.id === 'model_v1_1_candidate');
    assert.ok(candidateModel, 'Candidate model v1.1 must exist in registry');
    assert.equal(candidateModel.version, 'v1.1');
    assert.equal(candidateModel.releaseDate, '2026-10-20');
    assert.equal(candidateModel.trainingCheckpoint, 'chk_triage_v1.1_b80_final');
    assert.equal(candidateModel.datasetVersion, 'HealthVibe-Validation-v2.1');
    assert.equal(candidateModel.parametersCount, '128K Rules & Weights');
    assert.equal(candidateModel.architecture, 'Rule-Based + Bayesian Expert System');
    assert.equal(candidateModel.rollbackEligibility, true, 'Candidate model must be eligible for rollback');
    assert.ok(candidateModel.activeBaselineInScope, 'Must link to active baseline in scope');
    assert.equal(candidateModel.activeBaselineInScope.version, 'v1.0');

    // 2.2 Filter by condition scope
    const respFilterRes = await api('GET', '/api/admin/ai/registry?condition=respiratory_triage', 'token-clinical-qa');
    assert.equal(respFilterRes.status, 200);
    assert.ok(respFilterRes.data.models.every(m => m.conditionScope === 'respiratory_triage'), 'All filtered models must match condition');

    // 2.3 Filter by status
    const candidateFilterRes = await api('GET', '/api/admin/ai/registry?status=candidate', 'token-clinical-qa');
    assert.equal(candidateFilterRes.status, 200);
    assert.ok(candidateFilterRes.data.models.every(m => m.status === 'candidate'), 'All filtered models must be candidate');

    // 2.4 Text search across lineage and architecture
    const searchRes = await api('GET', '/api/admin/ai/registry?search=Bayesian', 'token-clinical-qa');
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.models.length >= 1);
    assert.equal(searchRes.data.models[0].id, 'model_v1_1_candidate');

    // 2.5 Dynamic Sorting by release date and sensitivity
    const sortDateDescRes = await api('GET', '/api/admin/ai/registry?sortBy=date_desc', 'token-clinical-qa');
    assert.equal(sortDateDescRes.status, 200);
    const dates = sortDateDescRes.data.models.map(m => new Date(m.releaseDate || m.evaluationDate).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      assert.ok(dates[i] >= dates[i + 1], 'Models must be sorted by date descending');
    }

    // 2.6 Scopes summary structure
    assert.ok(registryRes.data.scopesSummary.respiratory_triage, 'Must include respiratory_triage in scopesSummary');
    assert.equal(registryRes.data.scopesSummary.respiratory_triage.activeModel.version, 'v1.0');

    console.log('  ✓ Lineage metadata, fast filtering, text search, and sorting verified.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Deep-Dive Model Inspection (/api/admin/ai/registry/:modelId)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Deep-Dive Model Inspection & Demographic Sub-cohorts');

    const inspectRes = await api('GET', '/api/admin/ai/registry/model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(inspectRes.status, 200);
    assert.equal(inspectRes.data.model.id, 'model_v1_1_candidate');
    assert.equal(inspectRes.data.model.metrics.sensitivity, 1.0);
    assert.equal(inspectRes.data.model.metrics.sensitivityPct, '100.0%');
    assert.ok(inspectRes.data.model.subCohorts, 'Must include sub-cohorts demographic parity');
    assert.equal(inspectRes.data.model.subCohorts.pediatric.sensitivity, 1.0);
    assert.equal(inspectRes.data.model.subCohorts.geriatric.concordance, 1.0);

    // 3.2 Non-existent model returns 404
    const notFoundRes = await api('GET', '/api/admin/ai/registry/non_existent_model_xyz', 'token-clinical-qa');
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.data.error, 'MODEL_NOT_FOUND');

    console.log('  ✓ Deep-dive inspection, demographic sub-cohorts, and 404 guards verified.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Side-by-Side Model Diff Engine (/api/admin/ai/registry/diff)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Side-by-Side Model Diff Engine (Glass Health Benchmark)');

    // 4.1 Compare v1.1 candidate with v1.0 active baseline
    const diffRes = await api('GET', '/api/admin/ai/registry/diff?from=model_v1_0_active&to=model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(diffRes.status, 200);
    assert.equal(diffRes.data.success, true);
    assert.equal(diffRes.data.fromModel.version, 'v1.0');
    assert.equal(diffRes.data.toModel.version, 'v1.1');

    const delta = diffRes.data.delta;
    assert.equal(delta.isSafetyNeutral, true, 'v1.1 candidate must be safety neutral (sensitivity >= 100%)');
    assert.equal(delta.isFpImproved, true, 'v1.1 false positives must be improved compared to v1.0');
    assert.equal(delta.fpDelta, -8, 'False positive count should decrease by 8 (from 10 to 2)');
    assert.ok(delta.specificityDelta > 0, 'Specificity must increase with candidate model');
    assert.ok(delta.concordanceDelta > 0, 'Doctor concordance must increase');
    assert.ok(delta.subCohortsDelta.pediatric, 'Must include pediatric cohort delta');

    // 4.2 Default baseline resolution (omitting 'from' parameter defaults to active baseline)
    const defaultDiffRes = await api('GET', '/api/admin/ai/registry/diff?to=model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(defaultDiffRes.status, 200);
    assert.equal(defaultDiffRes.data.fromModel.version, 'v1.0', 'Must automatically resolve active baseline in scope');

    // 4.3 Missing target model returns 400
    const missingDiffRes = await api('GET', '/api/admin/ai/registry/diff', 'token-clinical-qa');
    assert.equal(missingDiffRes.status, 400);

    console.log('  ✓ Side-by-side diff delta, safety-neutrality, and FP reduction verified.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Safe Rollback Execution & Statutory Audit Trail
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Safe Rollback Execution & Zero-Downtime Hot-Swap');

    // 5.1 Zero-PHI Defense on rollback notes and reason:
    // Any attempt to include patient national ID or personal email in rollback notes must be blocked!
    const phiRollbackRes = await api('POST', '/api/admin/ai/registry/model_v1_0_active/rollback', 'token-clinical-qa', {
      reason: 'Rollback due to patient issue',
      notes: 'Patient National ID: 29801011234567 experienced diagnostic anomaly'
    });
    assert.equal(phiRollbackRes.status, 400, 'Must block rollback request with PHI leakage');
    assert.equal(phiRollbackRes.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 5.2 Execute valid Safe Rollback: Promote v1.1 first, then rollback to v1.0
    // First promote v1.1 to active to simulate production upgrade
    const promoteRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/promote', 'token-super-admin');
    assert.equal(promoteRes.status, 200);
    assert.equal(promoteRes.data.model.status, 'active');

    // Now execute emergency rollback back to v1.0 baseline
    const rollbackRes = await api('POST', '/api/admin/ai/registry/model_v1_0_active/rollback', 'token-clinical-qa', {
      reason: 'Rollback test: Reverting to certified v1.0 baseline after anomaly drill',
      notes: 'Operational safety drill executed without downtime.'
    });
    assert.equal(rollbackRes.status, 200);
    assert.equal(rollbackRes.data.success, true);
    assert.equal(rollbackRes.data.model.status, 'active', 'Target model v1.0 must now be active');
    assert.equal(rollbackRes.data.demotedModel.status, 'rolled_back', 'Previously active model v1.1 must be demoted to rolled_back');
    assert.ok(rollbackRes.data.rollbackEvent, 'Must return rollback event');

    // 5.3 Verify via Registry GET that state change persisted
    const updatedRegistryRes = await api('GET', '/api/admin/ai/registry?condition=respiratory_triage', 'token-clinical-qa');
    const v1_0 = updatedRegistryRes.data.models.find(m => m.version === 'v1.0');
    const v1_1 = updatedRegistryRes.data.models.find(m => m.version === 'v1.1');
    assert.equal(v1_0.status, 'active', 'v1.0 must be verified active in registry');
    assert.equal(v1_1.status, 'rolled_back', 'v1.1 must be verified rolled_back in registry');

    // 5.4 Test backward compatible endpoint POST /api/admin/ai/models/:modelId/rollback
    const legacyRollbackRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/rollback', 'token-super-admin', {
      reason: 'Re-activating candidate via legacy rollback path'
    });
    assert.equal(legacyRollbackRes.status, 200, 'Legacy rollback route must function identically');
    assert.equal(legacyRollbackRes.data.model.status, 'active');

    console.log('  ✓ Safe rollback hot-swap, status demotion, and Zero-PHI guard verified.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Rollback History Trail (/api/admin/ai/registry/history/rollbacks)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Statutory Rollback Audit Trail Retrieval');

    const historyRes = await api('GET', '/api/admin/ai/registry/history/rollbacks', 'token-clinical-qa');
    assert.equal(historyRes.status, 200);
    assert.ok(historyRes.data.count >= 1, 'Must contain recorded rollback audit events');
    const latestEvent = historyRes.data.events[0];
    assert.equal(latestEvent.type, 'AI_MODEL_ROLLED_BACK');
    assert.ok(latestEvent.details.reason, 'Must contain rollback reason');
    assert.ok(latestEvent.actor?.uid, 'Must contain actor attribution');

    console.log('  ✓ Rollback history trail accurately queried from audit store.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Lineage Export Engine & Security Headers
    // -------------------------------------------------------------------------
    console.log('▶ TEST 7: Lineage Export Engine & Security Headers');

    // 7.1 JSON Export
    const exportJsonRes = await api('GET', '/api/admin/ai/registry/export?format=json', 'token-clinical-qa');
    assert.equal(exportJsonRes.status, 200);
    assert.equal(exportJsonRes.data.success, true);
    assert.ok(exportJsonRes.data.models.length >= 5);

    // 7.2 CSV Export with Lineage Columns
    const exportCsvRes = await api('GET', '/api/admin/ai/registry/export?format=csv', 'token-clinical-qa');
    assert.equal(exportCsvRes.status, 200);
    assert.equal(exportCsvRes.headers.get('content-type').includes('text/csv'), true);
    assert.equal(exportCsvRes.headers.get('content-disposition').includes('ai_model_registry_lineage.csv'), true);
    assert.equal(exportCsvRes.data.includes('Release Date'), true, 'CSV must include Release Date header');
    assert.equal(exportCsvRes.data.includes('Training Checkpoint'), true, 'CSV must include Training Checkpoint header');
    assert.equal(exportCsvRes.data.includes('Parameters Count'), true, 'CSV must include Parameters Count header');

    // 7.3 Security Headers
    assert.equal(exportCsvRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(exportCsvRes.headers.get('x-frame-options'), 'DENY');

    // 7.4 Parameter injection detection in registry search
    await api('GET', '/api/admin/ai/registry?search=<script>alert("xss")</script>', 'token-clinical-qa');
    const auditSnap = await firestore().collection('audit_events').get();
    const secViolation = auditSnap.docs.find(d => d.data().type === 'AI_SECURITY_VIOLATION_BLOCKED');
    assert.ok(secViolation, 'Security violation must be recorded for suspicious injection search query');

    console.log('  ✓ Lineage CSV export, security headers, and injection detection verified.\n');

  } finally {
    server.close();
  }
})().then(() => {
  console.log('================================================================================');
  console.log('✅ ALL MODEL REGISTRY & SAFE ROLLBACK BACKEND/RBAC TESTS PASSED (100% SUCCESS)');
  console.log('================================================================================');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
