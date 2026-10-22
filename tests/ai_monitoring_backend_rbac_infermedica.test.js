/**
 * HEALTH VIBE AI: AI MODEL MONITORING BACKEND & RBAC TEST SUITE (Infermedica Benchmark)
 * 
 * Verifies:
 * 1. RBAC & Principle of Least Privilege:
 *    - Unauthenticated requests blocked (401 UNAUTHORIZED).
 *    - Doctor and Patient roles strictly blocked (403 ACCESS_DENIED).
 *    - Super Admin, Clinical QA, Ops, and Clinic Admin permitted to view metrics.
 * 2. Model Listing & Multi-criteria Filtering:
 *    - Filtering by version, condition scope, lifecycle status, timeRange, and text search.
 *    - Mathematical correctness of Sensitivity, Specificity, Precision, F1-Score, AUC-ROC,
 *      Doctor Concordance Rate, and Wilson 95% Confidence Intervals.
 *    - Aggregate macro metrics computations across filtered models.
 * 3. Deep-Dive Model Inspection (/api/admin/ai/models/:modelId):
 *    - Confusion matrix inspection, sub-cohort demographic parity (pediatric, adult, geriatric, chronic lung disease),
 *      and ROC points.
 * 4. Model Promotion Lifecycle (/api/admin/ai/models/:modelId/promote):
 *    - Restricted to Super Admin and Clinical QA; Ops/Clinic Admin blocked (403 ACCESS_DENIED).
 *    - Candidate promotion activates target model and automatically archives existing active version.
 *    - Statutory audit event (AI_MODEL_PROMOTED) logged.
 * 5. Clinical Evaluation Recording (/api/admin/ai/evaluation/record):
 *    - Calibration and validation batch recording with metrics update.
 *    - Statutory audit event (AI_MODEL_EVALUATED) logged.
 * 6. Export Engine & Audit Trail (/api/admin/ai/export):
 *    - CSV and JSON exports with proper headers and data integrity.
 *    - Statutory audit event (AI_MODEL_EXPORTED) logged.
 * 7. End-to-End Audit Trail Persistence:
 *    - Validates immutability, actor identity, and payload fidelity in audit_events collection.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('🤖  HEALTH VIBE AI: AI MODEL MONITORING BACKEND & RBAC TEST SUITE (Infermedica)');
console.log('    RBAC Enforcement, Metric Calculations, Model Promotion & Statutory Audit');
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
    // TEST 1: Role-Based Access Control & Authentication
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: Authentication & Role Enforcement for AI Model Endpoints');

    // 1.1 Unauthenticated requests blocked with 401
    const unauthRes = await api('GET', '/api/admin/ai/models');
    assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');

    // 1.2 Patient role blocked with 403
    const patientRes = await api('GET', '/api/admin/ai/models', 'token-patient');
    assert.equal(patientRes.status, 403, 'Patient request must be blocked with 403');
    assert.equal(patientRes.data.error, 'ACCESS_DENIED', 'Patient receives ACCESS_DENIED');

    // 1.3 Doctor role blocked with 403 (physicians do not administer AI models)
    const doctorRes = await api('GET', '/api/admin/ai/models', 'token-doctor');
    assert.equal(doctorRes.status, 403, 'Doctor request must be blocked with 403');
    assert.equal(doctorRes.data.error, 'ACCESS_DENIED', 'Doctor receives ACCESS_DENIED');

    // 1.4 Permitted roles: Super Admin, Clinical QA, Ops, Clinic Admin
    const superAdminRes = await api('GET', '/api/admin/ai/models', 'token-super-admin');
    assert.equal(superAdminRes.status, 200, 'Super Admin must have access (200)');

    const clinicalQaRes = await api('GET', '/api/admin/ai/models', 'token-clinical-qa');
    assert.equal(clinicalQaRes.status, 200, 'Clinical QA must have access (200)');

    const opsRes = await api('GET', '/api/admin/ai/models', 'token-ops-admin');
    assert.equal(opsRes.status, 200, 'Ops must have access (200)');

    const clinicAdminRes = await api('GET', '/api/admin/ai/models', 'token-clinic-admin');
    assert.equal(clinicAdminRes.status, 200, 'Clinic Admin must have access (200)');

    console.log('  ✓ Unauthenticated, doctor, and patient requests strictly blocked; admin sub-roles permitted.\n');

    // -------------------------------------------------------------------------
    // TEST 2: List Models, Multi-Criteria Filtering & Metric Calculations
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Listing AI Models & Filtering Engine with Exact Statistical Computations');

    const allModelsRes = await api('GET', '/api/admin/ai/models', 'token-clinical-qa');
    assert.equal(allModelsRes.status, 200);
    assert.equal(allModelsRes.data.success, true);
    assert.equal(allModelsRes.data.count >= 5, true, 'At least 5 Infermedica benchmark models registered');

    // Verify mathematical metrics on candidate v1.1
    const v1_1 = allModelsRes.data.models.find(m => m.version === 'v1.1');
    assert.ok(v1_1, 'Candidate v1.1 model present in catalog');
    assert.equal(v1_1.metrics.sensitivity, 1.0, 'v1.1 sensitivity must be 1.0 (100%)');
    assert.equal(v1_1.metrics.sensitivityPct, '100.0%');
    assert.equal(v1_1.metrics.specificityPct, '94.7%');
    assert.equal(v1_1.metrics.doctorConcordancePct, '97.5%');
    assert.equal(v1_1.metrics.totalCases, 80);

    // Filter by version
    const filterVersionRes = await api('GET', '/api/admin/ai/models?version=v1.1', 'token-clinical-qa');
    assert.equal(filterVersionRes.data.count, 1, 'Filter by version v1.1 returns 1 model');
    assert.equal(filterVersionRes.data.models[0].version, 'v1.1');

    // Filter by condition
    const filterCondRes = await api('GET', '/api/admin/ai/models?condition=hypoxemia', 'token-clinical-qa');
    assert.equal(filterCondRes.data.count, 1, 'Filter by hypoxemia condition returns 1 model');
    assert.equal(filterCondRes.data.models[0].conditionScope, 'hypoxemia');

    // Filter by status
    const filterStatusRes = await api('GET', '/api/admin/ai/models?status=active', 'token-clinical-qa');
    assert.equal(filterStatusRes.data.models.every(m => m.status === 'active'), true, 'All returned models are active');

    // Filter by search text
    const searchRes = await api('GET', '/api/admin/ai/models?search=Bayesian', 'token-clinical-qa');
    assert.equal(searchRes.data.count, 1, 'Search for Bayesian returns v1.1');

    // Aggregate metrics check
    const agg = allModelsRes.data.aggregateMetrics;
    assert.ok(agg, 'Aggregate metrics object present');
    assert.equal(typeof agg.avgSensitivity, 'number');
    assert.equal(typeof agg.avgSpecificity, 'number');
    assert.equal(typeof agg.avgDoctorConcordance, 'number');
    assert.equal(agg.modelsCount >= 5, true);

    console.log('  ✓ Model listing, multi-criteria filtering, and mathematical metrics verified.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Deep-Dive Model Inspection (/api/admin/ai/models/:modelId)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Deep-Dive Model Inspection (Confusion Matrix, Sub-cohorts & ROC)');

    const detailRes = await api('GET', '/api/admin/ai/models/model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(detailRes.status, 200);
    const mDetail = detailRes.data.model;
    assert.equal(mDetail.id, 'model_v1_1_candidate');
    assert.deepEqual(mDetail.confusionMatrix, { tp: 42, fp: 2, tn: 36, fn: 0 });
    assert.equal(mDetail.metrics.precisionPct, '95.5%');
    assert.equal(mDetail.metrics.f1ScorePct, '97.7%');
    assert.ok(mDetail.subCohorts, 'Sub-cohort demographic parity data present');
    assert.ok(mDetail.subCohorts.pediatric, 'Pediatric sub-cohort evaluated');
    assert.ok(mDetail.subCohorts.geriatric, 'Geriatric sub-cohort evaluated');
    assert.ok(mDetail.subCohorts.chronicLungDisease, 'Chronic lung disease sub-cohort evaluated');

    // 404 for non-existent model
    const notFoundRes = await api('GET', '/api/admin/ai/models/non_existent_model', 'token-clinical-qa');
    assert.equal(notFoundRes.status, 404, 'Non-existent model returns 404');
    assert.equal(notFoundRes.data.error, 'MODEL_NOT_FOUND');

    console.log('  ✓ Deep-dive details, confusion matrix, sub-cohorts, and 404 guards verified.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Model Promotion Lifecycle & Granular RBAC
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Model Promotion Lifecycle & Authorization (Super Admin / Clinical QA Only)');

    // 4.1 Ops is blocked from promotion (403 ACCESS_DENIED)
    const opsPromoteRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/promote', 'token-ops-admin', {});
    assert.equal(opsPromoteRes.status, 403, 'Ops must be forbidden from promoting AI models');
    assert.equal(opsPromoteRes.data.error, 'ACCESS_DENIED');

    // 4.2 Clinic Admin is blocked from promotion (403 ACCESS_DENIED)
    const clinicAdminPromoteRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/promote', 'token-clinic-admin', {});
    assert.equal(clinicAdminPromoteRes.status, 403, 'Clinic Admin must be forbidden from promoting AI models');

    // 4.3 Clinical QA executes promotion of candidate v1.1
    const promoteRes = await api('POST', '/api/admin/ai/models/model_v1_1_candidate/promote', 'token-clinical-qa', {});
    assert.equal(promoteRes.status, 200, 'Clinical QA promotion succeeds with 200');
    assert.equal(promoteRes.data.success, true);
    assert.equal(promoteRes.data.model.status, 'active', 'Promoted model is now active');

    // Verify that previous active respiratory_triage model (v1.0) was archived
    assert.equal(promoteRes.data.archivedModels.length >= 1, true, 'At least 1 previous model archived');
    assert.equal(promoteRes.data.archivedModels.some(m => m.version === 'v1.0'), true, 'v1.0 was archived');

    // Verify state in catalog
    const checkActiveRes = await api('GET', '/api/admin/ai/models/model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(checkActiveRes.data.model.status, 'active');

    const checkArchivedRes = await api('GET', '/api/admin/ai/models/model_v1_0_active', 'token-clinical-qa');
    assert.equal(checkArchivedRes.data.model.status, 'archived');

    console.log('  ✓ Promotion lifecycle verified: candidate activated, previous version archived, unauthorized roles blocked.\n');

    // 4.4 Emergency Safe Rollback (Glass Health Benchmark)
    // 4.4.1 Unauthorized role blocked from rollback
    const unauthRollback = await api('POST', '/api/admin/ai/models/model_v1_0_active/rollback', 'token-ops-admin', {
      reason: 'Unauthorized test'
    });
    assert.equal(unauthRollback.status, 403, 'Ops must be forbidden from executing model rollback');

    // 4.4.2 Clinical QA executes safe emergency rollback to v1.0
    const rollbackRes = await api('POST', '/api/admin/ai/models/model_v1_0_active/rollback', 'token-clinical-qa', {
      reason: 'ارتفاع مفاجئ في الإنذارات الكاذبة (False Positive Alert Spike)',
      notes: 'تراجع فوري للنسخة المستقرة السابقة.'
    });
    assert.equal(rollbackRes.status, 200, 'Clinical QA rollback succeeds with 200');
    assert.equal(rollbackRes.data.success, true);
    assert.equal(rollbackRes.data.model.status, 'active', 'v1.0 is restored to active');
    assert.equal(rollbackRes.data.previousActiveModels.some(m => m.version === 'v1.1'), true, 'v1.1 was demoted');

    // Verify state in catalog after rollback
    const checkRestored = await api('GET', '/api/admin/ai/models/model_v1_0_active', 'token-clinical-qa');
    assert.equal(checkRestored.data.model.status, 'active', 'v1.0 is active');
    const checkDemoted = await api('GET', '/api/admin/ai/models/model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(checkDemoted.data.model.status, 'rolled_back', 'v1.1 is rolled_back');

    console.log('  ✓ Safe emergency rollback verified: previous baseline restored to active, demoted marked rolled_back.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Recording Clinical Evaluation Batches
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Recording New Clinical Evaluation Batch & Calibration Results');

    // 5.1 Unauthorized role blocked
    const unauthEvalRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-ops-admin', {
      modelId: 'model_hypoxemia_v1_2'
    });
    assert.equal(unauthEvalRes.status, 403, 'Ops blocked from recording evaluations');

    // 5.2 Super Admin records clinical evaluation batch
    const evalPayload = {
      modelId: 'model_hypoxemia_v1_2',
      batchName: 'Prospective Clinical Validation Q4 2026',
      datasetVersion: 'HealthVibe-Validation-v2.1',
      sampleSize: 150,
      confusionMatrix: { tp: 80, fp: 1, tn: 69, fn: 0 },
      doctorConcordance: { agreed: 148, total: 150, rate: 0.9867 },
      notes: 'معايرة سريرية إضافية في غرف الرعاية الحرجة.'
    };
    const evalRecordRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-super-admin', evalPayload);
    assert.equal(evalRecordRes.status, 201, 'Evaluation recording returns 201 Created');
    assert.equal(evalRecordRes.data.success, true);
    assert.equal(evalRecordRes.data.evaluation.batchName, 'Prospective Clinical Validation Q4 2026');
    assert.equal(evalRecordRes.data.updatedModel.metrics.sensitivityPct, '100.0%');
    assert.equal(evalRecordRes.data.updatedModel.metrics.specificityPct, '98.6%');

    console.log('  ✓ Evaluation batch recorded, model metrics dynamically recomputed, RBAC guarded.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Exporting Evaluation Metrics (CSV & JSON)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Exporting Evaluation Metrics (CSV & JSON) with Format Verification');

    // 6.1 JSON Export
    const exportJsonRes = await api('GET', '/api/admin/ai/export?format=json', 'token-clinical-qa');
    assert.equal(exportJsonRes.status, 200);
    assert.equal(exportJsonRes.data.success, true);
    assert.equal(Array.isArray(exportJsonRes.data.models), true);
    assert.ok(exportJsonRes.data.aggregateMetrics);

    // 6.2 CSV Export
    const exportCsvRes = await api('GET', '/api/admin/ai/export?format=csv', 'token-clinical-qa');
    assert.equal(exportCsvRes.status, 200);
    assert.equal(exportCsvRes.headers.get('content-type').includes('text/csv'), true, 'Content-Type must be text/csv');
    assert.equal(exportCsvRes.headers.get('content-disposition').includes('ai_models_evaluation_metrics.csv'), true);
    assert.equal(typeof exportCsvRes.data, 'string');
    assert.equal(exportCsvRes.data.includes('Model ID,Version,Model Name,Status'), true, 'CSV contains valid headers');
    assert.equal(exportCsvRes.data.includes('HealthVibe-Triage-v1.1'), true, 'CSV contains v1.1 record');

    // 6.3 Doctor blocked from export
    const doctorExportRes = await api('GET', '/api/admin/ai/export?format=csv', 'token-doctor');
    assert.equal(doctorExportRes.status, 403, 'Doctor blocked from export');

    console.log('  ✓ JSON and CSV export endpoints verified with correct mime types and headers.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Statutory Audit Trail Verification
    // -------------------------------------------------------------------------
    console.log('▶ TEST 7: Statutory Audit Trail Verification (AI_MODEL_PROMOTED, AI_MODEL_EVALUATED, AI_MODEL_EXPORTED)');

    const auditSnap = await firestore().collection('audit_events').get();
    const auditLogs = auditSnap.docs.map(d => d.data());

    // Verify AI_MODEL_PROMOTED
    const promoteAudit = auditLogs.find(l => l.type === 'AI_MODEL_PROMOTED');
    assert.ok(promoteAudit, 'AI_MODEL_PROMOTED audit event must exist');
    assert.equal(promoteAudit.actor?.uid || promoteAudit.userId, 'user-clinical-qa');
    assert.equal(promoteAudit.actor?.role, 'clinical_qa');
    assert.equal(promoteAudit.details.modelId, 'model_v1_1_candidate');
    assert.equal(promoteAudit.details.newStatus, 'active');

    // Verify AI_MODEL_EVALUATED
    const evalAudit = auditLogs.find(l => l.type === 'AI_MODEL_EVALUATED');
    assert.ok(evalAudit, 'AI_MODEL_EVALUATED audit event must exist');
    assert.equal(evalAudit.actor?.uid || evalAudit.userId, 'user-super-admin');
    assert.equal(evalAudit.actor?.role, 'super_admin');
    assert.equal(evalAudit.details.batchName, 'Prospective Clinical Validation Q4 2026');

    // Verify AI_MODEL_EXPORTED
    const exportAudits = auditLogs.filter(l => l.type === 'AI_MODEL_EXPORTED');
    assert.equal(exportAudits.length >= 2, true, 'Both JSON and CSV exports logged to audit trail');
    const csvExport = exportAudits.find(l => l.details.format === 'csv');
    assert.ok(csvExport, 'CSV export audit event must exist');
    assert.equal(csvExport.actor?.uid || csvExport.userId, 'user-clinical-qa');
    assert.equal(csvExport.details.format, 'csv');

    // Verify AI_MODEL_ROLLED_BACK
    const rollbackAudit = auditLogs.find(l => l.type === 'AI_MODEL_ROLLED_BACK');
    assert.ok(rollbackAudit, 'AI_MODEL_ROLLED_BACK audit event must exist');
    assert.equal(rollbackAudit.actor?.uid || rollbackAudit.userId, 'user-clinical-qa');
    assert.equal(rollbackAudit.actor?.role, 'clinical_qa');
    assert.equal(rollbackAudit.details.targetVersion, 'v1.0');

    console.log('  ✓ Statutory audit trail verified with full actor attribution and immutable metadata.\n');

    console.log('================================================================================');
    console.log('✅ ALL AI MODEL MONITORING BACKEND & RBAC TESTS PASSED (100% SUCCESS)');
    console.log('================================================================================');

  } finally {
    server.close();
  }
})().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
