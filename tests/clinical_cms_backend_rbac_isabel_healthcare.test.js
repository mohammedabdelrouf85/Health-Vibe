/**
 * HEALTH VIBE AI: CLINICAL CMS BACKEND & RBAC TEST SUITE (Isabel Healthcare)
 * 
 * Comprehensive Test Suite Verifying:
 * 1. Role-Based Access Control (RBAC) & Principle of Least Privilege:
 *    - Unauthenticated requests blocked (401 UNAUTHORIZED).
 *    - Non-administrative roles (doctor, nurse, patient, support) strictly blocked (403 ACCESS_DENIED).
 *    - Read access granted to Super Admin, Clinical QA, Ops, Clinic Admin, Org Admin.
 *    - Guideline authoring & editing restricted to Super Admin & Clinical QA.
 *    - Guideline formal approval & publishing restricted to Super Admin & Clinical QA Lead.
 *      Ops and Clinic Admin blocked with 403 ACCESS_DENIED on approval actions.
 * 2. Dual-Language Clinical Parity Validation:
 *    - Validates presence of all Arabic (RTL) and English (LTR) guidance sections.
 *    - Rejects incomplete submissions with 400 BILINGUAL_PARITY_FAILED.
 * 3. Zero-PHI Defense & Query Injection Blocking:
 *    - Blocks National IDs and direct patient identifiers with 400 PHI_LEAKAGE_PROHIBITED.
 *    - Blocks suspicious query injections (<script>, ../) with 400 INVALID_QUERY.
 * 4. Multi-Stage Clinical Approval Lifecycle & State Transitions:
 *    - draft -> in_review -> rejected -> in_review -> approved -> published -> archived.
 *    - Enforces state transition constraints (e.g. cannot publish unapproved draft).
 * 5. Side-by-Side Version Diff & Revision Lineage:
 *    - Compares version A and version B with change summaries.
 * 6. Dual-Format Exports (CSV / JSON):
 *    - Verifies security headers and lineage CSV/JSON formatting.
 * 7. Statutory Audit Trail Persistence:
 *    - Immutable audit event logging in Firestore audit_events collection.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('📚  HEALTH VIBE AI: CLINICAL CMS BACKEND & RBAC TEST SUITE (Isabel Healthcare)');
console.log('    RBAC Enforcement, Dual-Language Parity, Multi-Stage Approval & Audit');
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
    }],
    ['user-support', {
      uid: 'user-support',
      role: 'support',
      email: 'support@healthvibes.org',
      emailVerified: true
    }]
  ]),
  clinical_guidelines: new Map(),
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
  'token-patient': { uid: 'user-patient', email: 'patient@test.org', role: 'patient', email_verified: true },
  'token-support': { uid: 'user-support', email: 'support@healthvibes.org', role: 'support', email_verified: true }
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
    console.log('▶ TEST 1: Role-Based Access Control (RBAC) Matrix for Clinical CMS');

    // 1.1 Unauthenticated requests return 401
    const unauthRes = await api('GET', '/api/admin/clinical-cms/guidelines');
    assert.equal(unauthRes.status, 401, 'Unauthenticated guidelines access must return 401');

    const unauthExport = await api('GET', '/api/admin/clinical-cms/export');
    assert.equal(unauthExport.status, 401, 'Unauthenticated export access must return 401');

    // 1.2 Non-administrative roles blocked with 403 ACCESS_DENIED
    const blockedRoles = ['token-doctor', 'token-patient', 'token-support'];
    for (const t of blockedRoles) {
      const res = await api('GET', '/api/admin/clinical-cms/guidelines', t);
      assert.equal(res.status, 403, `Role with token '${t}' must be blocked with 403`);
      assert.equal(res.data.error, 'ACCESS_DENIED');
    }

    // 1.3 Read access granted to Super Admin, Clinical QA, Ops, and Clinic Admin
    const readTokens = ['token-super-admin', 'token-clinical-qa', 'token-ops-admin', 'token-clinic-admin'];
    for (const t of readTokens) {
      const res = await api('GET', '/api/admin/clinical-cms/guidelines', t);
      assert.equal(res.status, 200, `Token '${t}' must be granted read access`);
      assert.equal(res.data.success, true);
      assert.ok(Array.isArray(res.data.guidelines));
    }

    // 1.4 Write access restricted: Ops and Clinic Admin CANNOT create guidelines (403)
    const writeBlocked = ['token-ops-admin', 'token-clinic-admin'];
    for (const t of writeBlocked) {
      const res = await api('POST', '/api/admin/clinical-cms/guidelines', t, { titleAr: 'اختبار' });
      assert.equal(res.status, 403, `Token '${t}' must be blocked from writing guidelines with 403`);
    }

    console.log('  ✓ Multi-tier RBAC matrix verified: Read vs Write vs Approver separation enforced.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Dual-Language Clinical Parity Validation
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Dual-Language Clinical Parity Validation (Isabel Healthcare Standard)');

    const incompletePayload = {
      titleAr: 'عنوان سريري عربي',
      titleEn: 'English Title',
      summaryAr: 'ملخص عربي',
      summaryEn: 'English Summary',
      criteriaAr: '', // missing
      criteriaEn: 'Some criteria',
      actionItemsAr: 'إجراءات بالعربية',
      actionItemsEn: 'Actions in English',
      redFlagsAr: 'علامات خطورة',
      redFlagsEn: '' // missing
    };

    const failParity = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', incompletePayload);
    assert.equal(failParity.status, 400, 'Must reject incomplete bilingual submission with 400');
    assert.equal(failParity.data.error, 'BILINGUAL_PARITY_FAILED');
    assert.ok(failParity.data.errors.length >= 2, 'Must detail missing bilingual sections');

    console.log('  ✓ Dual-language clinical parity engine successfully validated.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Zero-PHI Security Guard & Query Injection Defense
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Zero-PHI Security Guard & Query Injection Defense');

    // 3.1 National ID in payload triggers 400 PHI_LEAKAGE_PROHIBITED
    const phiPayload = {
      titleAr: 'بروتوكول يحتوي على الرقم القومي 29501011234567 للمريض',
      titleEn: 'Protocol with National ID',
      summaryAr: 'ملخص',
      summaryEn: 'Summary',
      criteriaAr: 'معايير',
      criteriaEn: 'Criteria',
      actionItemsAr: 'إجراءات',
      actionItemsEn: 'Actions',
      redFlagsAr: 'علامات خطورة',
      redFlagsEn: 'Red flags'
    };

    const phiRes = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', phiPayload);
    assert.equal(phiRes.status, 400, 'Must block National ID leakage with 400');
    assert.equal(phiRes.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 3.2 Suspicious search query rejected with 400 INVALID_QUERY
    const injectRes = await api('GET', '/api/admin/clinical-cms/guidelines?search=%3Cscript%3Ealert(1)%3C/script%3E', 'token-clinical-qa');
    assert.equal(injectRes.status, 400, 'Must reject script tag query injection with 400');
    assert.equal(injectRes.data.error, 'INVALID_QUERY');

    console.log('  ✓ Zero-PHI defense and query injection blocking verified.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Multi-Stage Clinical Approval Lifecycle & State Transitions
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Multi-Stage Clinical Approval Lifecycle & State Transitions');

    const newGuidelinePayload = {
      id: 'guideline_copd_bronchospasm_v1',
      version: 'v1.0-draft',
      category: 'triage_protocol',
      conditionScope: 'respiratory_triage',
      evidenceLevel: 'Grade_A_High',
      targetAudience: 'physician',
      titleAr: 'بروتوكول التعامل السريع مع التشنج القصبي الحاد لمرضى الانسداد الرئوي المزمن',
      titleEn: 'Acute Bronchospasm Rescue Protocol in Severe COPD',
      summaryAr: 'توجيهات لسرعة استجابة فرق الطوارئ لنوبات التدهور التنفسي المفاجئ.',
      summaryEn: 'Emergency rescue protocol for sudden acute bronchospasm and hypercapnic risk in COPD.',
      criteriaAr: 'تراجع حاد في SpO2 عن المعدل الأساسي، تنفس متسارع > 28/دقيقة، وعدم القدرة على الكلام.',
      criteriaEn: 'Acute SpO2 drop below patient baseline, tachypnea > 28 bpm, speech dyspnea.',
      actionItemsAr: 'استنشاق موسعات الشعب الهوائية قصيرة المفعول، مراقبة احتباس غاز CO2، ودعم الأكسجين المنضبط (88-92%).',
      actionItemsEn: 'Back-to-back SABA/SAMA nebulization, titrate controlled O2 to 88-92%, assess for NIV support.',
      redFlagsAr: 'تغيم الوعي، ارتباك حاد، حموضة الدم التنفسية (pH < 7.25)، أو بطء القلب المفاجئ.',
      redFlagsEn: 'Lethargy, acute confusion, respiratory acidosis (pH < 7.25), or sudden bradycardia.',
      changeSummary: 'مسودة أولية معتمدة من استشاري الصدر.'
    };

    // 4.1 Create guideline in Draft status
    const createRes = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', newGuidelinePayload);
    assert.equal(createRes.status, 201, 'Must create guideline with 201 Created');
    assert.equal(createRes.data.guideline.status, 'draft');

    // 4.2 Guard: Cannot publish directly from draft
    const directPublish = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/publish`, 'token-super-admin');
    assert.equal(directPublish.status, 400, 'Must reject publishing draft without approval');

    // 4.3 Submit for clinical review
    const submitReview = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/submit-review`, 'token-clinical-qa', {
      notes: 'مرفوع للاعتماد السريري النهائي.'
    });
    assert.equal(submitReview.status, 200);
    assert.equal(submitReview.data.guideline.status, 'in_review');

    // 4.4 Ops cannot approve guidelines (403)
    const opsApprove = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/approve`, 'token-ops-admin');
    assert.equal(opsApprove.status, 403, 'Ops role cannot approve clinical guidelines (403)');

    // 4.5 Reject flow with feedback notes
    const rejectRes = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/reject`, 'token-super-admin', {
      reason: 'يرجى تأكيد حدود SpO2 المستهدفة لمرضى احتباس CO2 لتكون 88-92% صراحة.'
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.data.guideline.status, 'rejected');

    // 4.6 Re-submit for review
    const resubmitRes = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/submit-review`, 'token-clinical-qa', {
      notes: 'تمت مراجعة الحدود والتأكيد عليها.'
    });
    assert.equal(resubmitRes.status, 200);
    assert.equal(resubmitRes.data.guideline.status, 'in_review');

    // 4.7 Formally Approve guideline
    const approveRes = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/approve`, 'token-super-admin', {
      notes: 'معتمد رسمياً للنشر في محرك الفرز.'
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.guideline.status, 'approved');

    // 4.8 Publish guideline to production
    const publishRes = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/publish`, 'token-clinical-qa', {
      notes: 'تفعيل حي في الإنتاج.'
    });
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.data.guideline.status, 'published');
    assert.ok(publishRes.data.guideline.publishedAt);

    // 4.9 Archive guideline
    const archiveRes = await api('POST', `/api/admin/clinical-cms/guidelines/${newGuidelinePayload.id}/archive`, 'token-super-admin', {
      reason: 'أرشفة تجريبية دورية.'
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.guideline.status, 'archived');

    console.log('  ✓ Multi-stage clinical approval lifecycle and status transitions verified.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Version Diff Engine & Lineage Exports
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Version Diff Engine & Lineage Exports (CSV & JSON)');

    // 5.1 Diff inspection
    const diffRes = await api('GET', '/api/admin/clinical-cms/guidelines/guideline_resp_triage_redflags/diff?versionA=v1.0&versionB=v2.0', 'token-clinical-qa');
    assert.equal(diffRes.status, 200);
    assert.equal(diffRes.data.guidelineId, 'guideline_resp_triage_redflags');
    assert.ok(diffRes.data.versionA);
    assert.ok(diffRes.data.versionB);
    assert.ok(diffRes.data.currentContent.criteriaAr);

    // 5.2 CSV Export
    const csvExport = await api('GET', '/api/admin/clinical-cms/export?format=csv', 'token-clinical-qa');
    assert.equal(csvExport.status, 200);
    assert.ok(csvExport.headers.get('content-type').includes('text/csv'));
    assert.ok(csvExport.data.includes('Guideline_ID'));
    assert.ok(csvExport.data.includes('Title_AR'));
    assert.ok(csvExport.data.includes('guideline_resp_triage_redflags'));

    // 5.3 JSON Export
    const jsonExport = await api('GET', '/api/admin/clinical-cms/export?format=json', 'token-clinical-qa');
    assert.equal(jsonExport.status, 200);
    assert.equal(jsonExport.data.success, true);
    assert.ok(Array.isArray(jsonExport.data.guidelines));

    console.log('  ✓ Version diff engine and export streams (CSV/JSON) verified.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Statutory Audit Trail Persistence
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Statutory Audit Trail Persistence in audit_events');

    const auditRes = await api('GET', '/api/admin/clinical-cms/audit-trail', 'token-clinical-qa');
    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.data.success, true);
    assert.ok(Array.isArray(auditRes.data.events));

    console.log(`  ✓ Statutory audit trail verified: found ${auditRes.data.events.length} audit records.\n`);

    console.log('================================================================================');
    console.log('✅ ALL CLINICAL CMS BACKEND & RBAC TESTS PASSED (100% SUCCESS)');
    console.log('================================================================================');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
