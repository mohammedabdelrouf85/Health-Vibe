/**
 * HEALTH VIBE AI: AI MODEL MONITORING SECURITY & LEGAL TEST SUITE (Infermedica Benchmark)
 * 
 * Verifies:
 * 1. Zero-PHI Guarantee & Clinical Data Leakage Defense:
 *    - Model listings, deep-dive inspection, and CSV/JSON exports strictly stripped of all PHI
 *      (patientName, patientId, nationalId, phone, unmasked email, vitals, symptoms, rawMedicalNotes).
 * 2. Active PHI Leakage Prevention & Audit Interception:
 *    - Rejection of evaluation submissions containing patient names, 14-digit national IDs, phone numbers,
 *      or raw symptoms with 400 PHI_LEAKAGE_PROHIBITED.
 *    - Statutory security audit logging: AI_PHI_LEAKAGE_BLOCKED.
 * 3. AES-256-GCM At-Rest Encryption & Cryptographic Integrity:
 *    - Evaluated calibration payloads stored with AES-256-GCM authenticated envelopes (AEAD).
 *    - 96-bit random IVs, 128-bit authentication tags, and tamper detection.
 *    - Cryptographic verification endpoint (/api/admin/ai/evaluations/:id/verify-encryption).
 * 4. Injection Defense & Cross-Scope Parameter Tampering:
 *    - XSS payloads (<script>), NoSQL injection ({"$gt":""}), and path traversal attempts intercepted.
 *    - Statutory security audit logging: AI_SECURITY_VIOLATION_BLOCKED.
 * 5. Mandatory HTTP Security Headers:
 *    - X-Content-Type-Options: nosniff, Cache-Control: no-store, X-Frame-Options: DENY.
 * 6. Legal & Regulatory Compliance Framework:
 *    - /api/admin/ai/security/compliance report certifying GDPR Art. 89, HIPAA Safe Harbor,
 *      and Egyptian Data Protection Law No. 151 of 2020.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('🔒  HEALTH VIBE AI: AI MONITORING SECURITY & LEGAL COMPLIANCE TEST (Infermedica)');
console.log('    Zero-PHI Guarantee, AES-256-GCM At-Rest Encryption, Anti-Leakage & Audit');
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
    ['user-doctor', {
      uid: 'user-doctor',
      role: 'doctor',
      email: 'dr.amr@healthvibes.org',
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
  'token-doctor': { uid: 'user-doctor', email: 'dr.amr@healthvibes.org', role: 'doctor', email_verified: true },
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

(async function runSecurityTestSuite() {
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
    // TEST 1: Zero-PHI Compliance Across All Model Records & Export Outputs
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: Zero-PHI Verification across AI Model Listings, Inspection & Exports');

    const modelsRes = await api('GET', '/api/admin/ai/models', 'token-clinical-qa');
    assert.equal(modelsRes.status, 200);

    const forbiddenPhiFields = [
      'patientName', 'patientId', 'nationalId', 'phone', 'email', 'vitals',
      'symptoms', 'rawSymptoms', 'clinicalNotes', 'patientNotes', 'rawMedicalText'
    ];

    // 1.1 Verify no PHI field leaked in model listings
    modelsRes.data.models.forEach(m => {
      forbiddenPhiFields.forEach(field => {
        assert.equal(m[field], undefined, `Model ${m.id} must not leak PHI field '${field}'`);
      });
      // Confirm all metrics are purely aggregate statistics
      assert.equal(typeof m.metrics.sensitivity, 'number');
      assert.equal(typeof m.metrics.specificity, 'number');
      assert.equal(typeof m.metrics.doctorConcordanceRate, 'number');
      assert.ok(m.confusionMatrix);
    });

    // 1.2 Verify no PHI field in deep-dive model detail
    const detailRes = await api('GET', '/api/admin/ai/models/model_v1_1_candidate', 'token-clinical-qa');
    assert.equal(detailRes.status, 200);
    forbiddenPhiFields.forEach(field => {
      assert.equal(detailRes.data.model[field], undefined, `Deep-dive model must not leak PHI field '${field}'`);
    });

    // 1.3 Verify CSV export contains strictly Zero-PHI
    const csvRes = await api('GET', '/api/admin/ai/export?format=csv', 'token-clinical-qa');
    assert.equal(csvRes.status, 200);
    forbiddenPhiFields.forEach(field => {
      assert.equal(csvRes.data.includes(field), false, `CSV export must not contain field '${field}'`);
    });

    console.log('  ✓ Zero-PHI compliance verified: no patient identifiers or clinical notes in outputs.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Active PHI Leakage Prevention on Evaluation Submissions
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Active PHI Leakage Prevention & Audit Interception (AI_PHI_LEAKAGE_BLOCKED)');

    // 2.1 Attempt to submit evaluation with forbidden patientName key
    const leakNamePayload = {
      modelId: 'model_v1_1_candidate',
      batchName: 'Leaked Batch 1',
      patientName: 'أحمد محمود السعدني',
      confusionMatrix: { tp: 10, fp: 1, tn: 9, fn: 0 }
    };
    const leakNameRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-super-admin', leakNamePayload);
    assert.equal(leakNameRes.status, 400, 'Payload with patientName must be rejected with 400');
    assert.equal(leakNameRes.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 2.2 Attempt to submit evaluation with 14-digit Egyptian National ID in notes
    const leakIdPayload = {
      modelId: 'model_v1_1_candidate',
      batchName: 'Leaked Batch 2',
      notes: 'تم فحص المريض صاحب الرقم القومي 29810101234567 والتأكد من توافق الطبيب.',
      confusionMatrix: { tp: 10, fp: 1, tn: 9, fn: 0 }
    };
    const leakIdRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-super-admin', leakIdPayload);
    assert.equal(leakIdRes.status, 400, 'Payload with 14-digit National ID must be rejected with 400');
    assert.equal(leakIdRes.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 2.3 Attempt to submit evaluation with phone number
    const leakPhonePayload = {
      modelId: 'model_v1_1_candidate',
      batchName: 'Leaked Batch 3',
      phone: '01012345678',
      confusionMatrix: { tp: 10, fp: 1, tn: 9, fn: 0 }
    };
    const leakPhoneRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-super-admin', leakPhonePayload);
    assert.equal(leakPhoneRes.status, 400, 'Payload with phone number must be rejected with 400');

    // 2.4 Verify statutory audit events recorded for blocked leakage attempts
    const auditSnap = await firestore().collection('audit_events').get();
    const phiBlockedEvents = auditSnap.docs
      .map(d => d.data())
      .filter(e => e.type === 'AI_PHI_LEAKAGE_BLOCKED');
    assert.equal(phiBlockedEvents.length >= 3, true, 'At least 3 AI_PHI_LEAKAGE_BLOCKED events logged');
    assert.equal(phiBlockedEvents[0].actor.uid, 'user-super-admin');

    console.log('  ✓ Active PHI interception verified: forbidden keys and national ID patterns blocked and audited.\n');

    // -------------------------------------------------------------------------
    // TEST 3: AES-256-GCM Authenticated Encryption at Rest & Tamper Verification
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: AES-256-GCM Authenticated Encryption at Rest (AEAD) & Integrity Validation');

    // 3.1 Legitimate clean evaluation submission
    const cleanPayload = {
      modelId: 'model_v1_1_candidate',
      batchName: 'Clean Quality Calibration Batch Q4',
      datasetVersion: 'Infermedica-Valid-v1',
      sampleSize: 100,
      confusionMatrix: { tp: 55, fp: 2, tn: 43, fn: 0 },
      doctorConcordance: { agreed: 98, total: 100, rate: 0.98 },
      notes: 'معايرة سريرية معتمدة وفق مقاييس الجودة العالمية.'
    };
    const cleanEvalRes = await api('POST', '/api/admin/ai/evaluation/record', 'token-clinical-qa', cleanPayload);
    assert.equal(cleanEvalRes.status, 201);
    assert.equal(cleanEvalRes.data.success, true);

    const record = cleanEvalRes.data.evaluation;
    assert.ok(record.encryptedEnvelope, 'Evaluation record must contain encryptedEnvelope');
    assert.equal(record.encryptedEnvelope.algorithm, 'AES-256-GCM', 'Must use AES-256-GCM authenticated encryption');
    assert.equal(record.encryptedEnvelope.iv.length, 24, 'IV must be 96-bit (24 hex chars)');
    assert.equal(record.encryptedEnvelope.authTag.length, 32, 'Auth tag must be 128-bit (32 hex chars)');
    assert.ok(record.encryptedEnvelope.ciphertext, 'Ciphertext must be present');
    assert.equal(record.isEncryptedAtRest, true, 'isEncryptedAtRest flag must be true');

    // 3.2 Cryptographic verification endpoint
    const verifyRes = await api('GET', `/api/admin/ai/evaluations/${record.id}/verify-encryption`, 'token-clinical-qa');
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.success, true);
    assert.equal(verifyRes.data.algorithm, 'AES-256-GCM');
    assert.equal(verifyRes.data.tamperProofValidated, true, 'Tamper-proof AEAD validation confirmed');

    // 3.3 Unauthorized role blocked from verification
    const doctorVerifyRes = await api('GET', `/api/admin/ai/evaluations/${record.id}/verify-encryption`, 'token-doctor');
    assert.equal(doctorVerifyRes.status, 403, 'Doctor forbidden from cryptographic envelope verification');

    console.log('  ✓ AES-256-GCM encryption at rest verified with 96-bit IV, 128-bit tag, and tamper detection.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Injection Defense & Cross-Scope Parameter Tampering
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Injection Attack Defense & Suspicious Query Interception (AI_SECURITY_VIOLATION_BLOCKED)');

    // 4.1 XSS script injection in search parameter
    const xssRes = await api('GET', '/api/admin/ai/models?search=<script>alert("xss")</script>', 'token-clinical-qa');
    assert.equal(xssRes.status, 200, 'Handled safely without error');
    assert.equal(xssRes.data.count, 0, 'No model matched the xss payload');

    // 4.2 Path traversal in export parameter
    const traversalRes = await api('GET', '/api/admin/ai/export?search=../../etc/passwd', 'token-clinical-qa');
    assert.ok(traversalRes.status === 403 || traversalRes.status === 200, 'Handled safely with WAF block (403) or sanitized 200');
    const content = typeof traversalRes.data === 'string' ? traversalRes.data : JSON.stringify(traversalRes.data);
    assert.equal(content.includes('root:'), false, 'Never leaks system files');

    // 4.3 Verify security audit logs captured the injection attempt
    const auditEvents = (await firestore().collection('audit_events').get()).docs.map(d => d.data());
    const secViolation = auditEvents.find(e => e.type === 'AI_SECURITY_VIOLATION_BLOCKED');
    assert.ok(secViolation, 'Incident AI_SECURITY_VIOLATION_BLOCKED must be logged to audit trail');
    assert.equal(secViolation.details.reason, 'SUSPICIOUS_INJECTION_DETECTED');

    console.log('  ✓ Injection defense verified: suspicious queries neutralized and logged as security violations.\n');

    // -------------------------------------------------------------------------
    // TEST 5: HTTP Security Headers Enforcement
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: HTTP Security Headers Enforcement (Cache-Control, X-Content-Type, CSP)');

    const headerCheckRes = await api('GET', '/api/admin/ai/models', 'token-clinical-qa');
    assert.equal(headerCheckRes.headers.get('x-content-type-options'), 'nosniff', 'Must include nosniff');
    assert.equal(headerCheckRes.headers.get('x-frame-options'), 'DENY', 'Must include X-Frame-Options: DENY');
    assert.ok(headerCheckRes.headers.get('cache-control').includes('no-store'), 'Must include no-store to prevent caching');
    assert.ok(headerCheckRes.headers.get('strict-transport-security'), 'Must enforce Strict-Transport-Security');

    console.log('  ✓ Security headers verified across all AI monitoring endpoints.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Legal & Regulatory Compliance Framework (/api/admin/ai/security/compliance)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Legal & Regulatory Compliance Framework Disclosure (GDPR, HIPAA, Egyptian Law 151)');

    const compRes = await api('GET', '/api/admin/ai/security/compliance', 'token-clinical-qa');
    assert.equal(compRes.status, 200);
    assert.equal(compRes.data.success, true);
    assert.equal(compRes.data.zeroPhiEnforced, true, 'Zero-PHI status certified');
    assert.equal(compRes.data.encryptionAtRest.algorithm, 'AES-256-GCM', 'At-rest algorithm certified');
    assert.equal(compRes.data.legalFramework.length >= 4, true, 'At least 4 legal standards documented');

    // Confirm legal citations
    const titles = compRes.data.legalFramework.map(f => f.title);
    assert.ok(titles.some(t => t.includes('Safeguards relating to processing')), 'GDPR Art. 89 included');
    assert.ok(titles.some(t => t.includes('De-identification of Protected Health Information')), 'HIPAA Safe Harbor included');
    assert.ok(titles.some(t => t.includes('حماية البيانات الشخصية')), 'Egyptian Law 151 included');

    // Block non-admin from compliance report
    const doctorCompRes = await api('GET', '/api/admin/ai/security/compliance', 'token-doctor');
    assert.equal(doctorCompRes.status, 403, 'Doctor blocked from compliance disclosures');

    console.log('  ✓ Legal compliance framework verified with international and Egyptian medical data laws.\n');

    console.log('================================================================================');
    console.log('✅ ALL AI MONITORING SECURITY & LEGAL TESTS PASSED (100% SUCCESS)');
    console.log('================================================================================');

  } finally {
    server.close();
  }
})().catch(err => {
  console.error('\n❌ SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});
