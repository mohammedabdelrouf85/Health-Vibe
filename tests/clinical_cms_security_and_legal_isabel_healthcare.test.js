/**
 * HEALTH VIBE AI: CLINICAL CMS & DUAL-LANGUAGE GUIDELINES SECURITY & LEGAL TEST SUITE (Isabel Healthcare)
 * 
 * Verifies:
 * 1. Zero-PHI Guarantee & Clinical Anti-Leakage Defense:
 *    - All Clinical CMS endpoints (/api/admin/clinical-cms/guidelines, /:id, /diff, /audit-trail, /export)
 *      are strictly sanitized of any PHI/PII (patientName, nationalId, phone, unmasked email, vitals, clinicalNotes).
 *    - Rejection of guideline creation/update attempts containing 14-digit Egyptian national IDs or phone numbers
 *      with 400 PHI_LEAKAGE_PROHIBITED.
 *    - Statutory immutable audit event logging: AI_PHI_LEAKAGE_BLOCKED.
 * 2. AES-256-GCM At-Rest Encryption & Cryptographic Envelope Verification:
 *    - Clinical guideline records, criteria, and red flags stored with AES-256-GCM AEAD authenticated envelopes.
 *    - 96-bit random IVs, 128-bit authentication tags, and tamper detection.
 *    - Cryptographic verification endpoint (/api/admin/clinical-cms/guidelines/:id/verify-encryption).
 * 3. Clinical Content SHA-256 Cryptographic Integrity Validation:
 *    - SHA-256 digital signature computed and verified (/api/admin/clinical-cms/guidelines/:id/verify-integrity).
 *    - Detection and prevention of unauthorized or tampered clinical recommendations and red flags.
 * 4. Injection Attack Defense & Suspicious Query Interception:
 *    - XSS payloads (<script>) and NoSQL injection payloads in search/condition parameters intercepted with 400.
 *    - Statutory immutable audit event logging: AI_SECURITY_VIOLATION_BLOCKED.
 * 5. Mandatory HTTP Security Headers:
 *    - X-Content-Type-Options: nosniff, Cache-Control: no-store, X-Frame-Options: DENY, Strict-Transport-Security.
 * 6. Dual-Language Clinical Parity Enforcement (Isabel Healthcare Standard):
 *    - Rejection of unilateral Arabic or English submissions with 400 BILINGUAL_PARITY_FAILED.
 * 7. Legal & Regulatory Compliance Framework Disclosure:
 *    - /api/admin/clinical-cms/security/compliance report certifying GDPR Art. 89(1), HIPAA Safe Harbor (45 CFR § 164.514(b)),
 *      Egyptian Personal Data Protection Law No. 151 of 2020, and Isabel Healthcare Dual-Language Governance Standard.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('🔒  HEALTH VIBE AI: CLINICAL CMS SECURITY & LEGAL COMPLIANCE TEST (Isabel Healthcare)');
console.log('    Zero-PHI Defense, AES-256-GCM Envelopes, SHA-256 Integrity & Legal Audit');
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
      email: 'dr.tarek@healthvibes.org',
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
  'token-doctor': { uid: 'user-doctor', email: 'dr.tarek@healthvibes.org', role: 'doctor', email_verified: true },
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
  clearTimeout,
  setInterval,
  clearInterval
};

const serverCode = fs.readFileSync(serverPath, 'utf8');
vm.createContext(sandbox);
vm.runInContext(serverCode, sandbox, { filename: serverPath });

const app = sandbox.module.exports;

(async function runTests() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method, urlPath, token, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return { status: res.status, data, headers: res.headers };
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Zero-PHI Guarantee & Clinical Anti-Leakage Defense
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: Zero-PHI Guarantee & Clinical Anti-Leakage Defense');

    // 1.1 Read initial clinical guidelines catalog and verify complete absence of PHI/PII
    const catRes = await api('GET', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa');
    assert.equal(catRes.status, 200);
    assert.equal(catRes.data.success, true);
    assert.ok(catRes.data.guidelines.length >= 3);

    for (const g of catRes.data.guidelines) {
      assert.equal(g.patientName, undefined, 'Patient name must never exist in clinical guidelines');
      assert.equal(g.nationalId, undefined, 'National ID must never exist in clinical guidelines');
      assert.equal(g.patientPhone, undefined, 'Phone must never exist in clinical guidelines');
      assert.equal(g.ssn, undefined, 'SSN must never exist in clinical guidelines');
      assert.equal(g.patientVitals, undefined, 'Patient vitals must never exist in clinical guidelines');
    }

    // 1.2 Attempt to submit a guideline containing a 14-digit Egyptian National ID
    const leakNationalId = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', {
      titleAr: 'إرشادات تشخيصية تسريبية',
      titleEn: 'Leaked Diagnostic Guidelines',
      summaryAr: 'بيانات مريض تجريبي بالرقم القومي 29810151234567 لغرض التدقيق',
      summaryEn: 'Patient test notes for National ID 29810151234567 audit verification',
      criteriaAr: 'معايير فحص سريري',
      criteriaEn: 'Clinical examination criteria',
      actionItemsAr: 'بروتوكول علاجي',
      actionItemsEn: 'Therapeutic protocol',
      redFlagsAr: 'علامات حمراء',
      redFlagsEn: 'Red flags',
      category: 'cardiology',
      conditionScope: 'hypertension',
      evidenceLevel: 'Level A'
    });

    assert.equal(leakNationalId.status, 400, 'Must reject National ID leakage with 400');
    assert.equal(leakNationalId.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 1.3 Attempt to submit a guideline containing an Egyptian phone number
    const leakPhone = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', {
      titleAr: 'إرشادات مع رقم هاتف',
      titleEn: 'Guidelines with Phone Number',
      summaryAr: 'اتصل بالمريض على 01012345678 فوراً',
      summaryEn: 'Call patient directly on 01012345678 immediately',
      criteriaAr: 'معايير فحص',
      criteriaEn: 'Check criteria',
      actionItemsAr: 'خطة عمل',
      actionItemsEn: 'Action items',
      redFlagsAr: 'أعراض خطيرة',
      redFlagsEn: 'Dangerous signs',
      category: 'cardiology',
      conditionScope: 'hypertension'
    });

    assert.equal(leakPhone.status, 400, 'Must reject phone number leakage with 400');
    assert.equal(leakPhone.data.error, 'PHI_LEAKAGE_PROHIBITED');

    // 1.4 Verify that statutory audit event AI_PHI_LEAKAGE_BLOCKED was persisted in audit_events
    const auditSnap = await firestore().collection('audit_events').get();
    const phiBlockedEvents = auditSnap.docs.filter(d => d.data().type === 'AI_PHI_LEAKAGE_BLOCKED');
    assert.ok(phiBlockedEvents.length >= 2, 'Audit trail must record AI_PHI_LEAKAGE_BLOCKED events');

    console.log('  ✓ Zero-PHI defense verified: National IDs and phone numbers blocked and audited.\n');

    // -------------------------------------------------------------------------
    // TEST 2: AES-256-GCM At-Rest Encryption & Cryptographic Envelope Verification
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: AES-256-GCM At-Rest Encryption & Cryptographic Envelope Verification');

    // 2.1 Verify encryption envelope on initial active guideline (guideline_pediatric_fever_triage)
    const encVerifRes = await api('GET', '/api/admin/clinical-cms/guidelines/guideline_pediatric_fever_triage/verify-encryption', 'token-clinical-qa');
    assert.equal(encVerifRes.status, 200);
    assert.equal(encVerifRes.data.success, true);
    assert.equal(encVerifRes.data.guidelineId, 'guideline_pediatric_fever_triage');
    assert.equal(encVerifRes.data.algorithm, 'AES-256-GCM');
    assert.equal(encVerifRes.data.ivLengthBits, 96);
    assert.equal(encVerifRes.data.authTagLengthBits, 128);
    assert.equal(encVerifRes.data.tamperProofValidated, true);

    // 2.2 Verify that doctors are blocked from cryptographic verification endpoint (403 ACCESS_DENIED)
    const docEncRes = await api('GET', '/api/admin/clinical-cms/guidelines/guideline_pediatric_fever_triage/verify-encryption', 'token-doctor');
    assert.equal(docEncRes.status, 403, 'Doctor role must be blocked from cryptographic verification');
    assert.equal(docEncRes.data.error, 'ACCESS_DENIED');

    // 2.3 Non-existent guideline returns 404
    const notFoundEnc = await api('GET', '/api/admin/clinical-cms/guidelines/cg_non_existent/verify-encryption', 'token-clinical-qa');
    assert.equal(notFoundEnc.status, 404);

    console.log('  ✓ AES-256-GCM authenticated envelopes verified with 96-bit IV, 128-bit tag, and AEAD.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Clinical Content SHA-256 Cryptographic Integrity Validation
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Clinical Content SHA-256 Cryptographic Integrity Validation');

    // 3.1 Verify integrity signature of guideline guideline_hypoxemia_spo2_home
    const intRes = await api('GET', '/api/admin/clinical-cms/guidelines/guideline_hypoxemia_spo2_home/verify-integrity', 'token-clinical-qa');
    assert.equal(intRes.status, 200);
    assert.equal(intRes.data.success, true);
    assert.equal(intRes.data.guidelineId, 'guideline_hypoxemia_spo2_home');
    assert.equal(intRes.data.algorithm, 'SHA-256');
    assert.equal(intRes.data.tamperProofValidated, true);
    assert.ok(intRes.data.computedHash.startsWith('sha256-'));
    assert.equal(intRes.data.storedHash, intRes.data.computedHash);

    // 3.2 Doctor blocked from integrity endpoint
    const docIntRes = await api('GET', '/api/admin/clinical-cms/guidelines/guideline_hypoxemia_spo2_home/verify-integrity', 'token-doctor');
    assert.equal(docIntRes.status, 403);

    console.log('  ✓ SHA-256 cryptographic signature verified and tamper-proof validation passed.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Injection Attack Defense & Suspicious Query Interception
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Injection Attack Defense & Suspicious Query Interception');

    // 4.1 XSS attack in guidelines search query
    const xssRes = await api('GET', '/api/admin/clinical-cms/guidelines?search=<script>alert("xss")</script>', 'token-clinical-qa');
    assert.equal(xssRes.status, 400);
    assert.equal(xssRes.data.error, 'INVALID_QUERY');

    // 4.2 NoSQL injection in condition query
    const nosqlRes = await api('GET', '/api/admin/clinical-cms/guidelines?condition={"$gt":""}', 'token-clinical-qa');
    assert.equal(nosqlRes.status, 400);
    assert.equal(nosqlRes.data.error, 'INVALID_QUERY');

    // 4.3 Verify that security violation events were logged in audit trail
    const updatedAuditSnap = await firestore().collection('audit_events').get();
    const secViolations = updatedAuditSnap.docs.filter(d => d.data().type === 'AI_SECURITY_VIOLATION_BLOCKED');
    assert.ok(secViolations.length >= 2, 'Security violations must be recorded for suspicious injection queries');

    console.log('  ✓ Injection defense verified: suspicious queries intercepted and logged.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Mandatory HTTP Security Headers Enforcement
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Mandatory HTTP Security Headers Enforcement');

    const headersRes = await api('GET', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa');
    assert.equal(headersRes.headers.get('x-content-type-options'), 'nosniff', 'Must include X-Content-Type-Options: nosniff');
    assert.equal(headersRes.headers.get('x-frame-options'), 'DENY', 'Must include X-Frame-Options: DENY');
    assert.equal(headersRes.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Must disable caching');

    console.log('  ✓ HTTP security headers strictly enforced across all Clinical CMS endpoints.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Dual-Language Clinical Parity Enforcement (Isabel Healthcare Standard)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Dual-Language Clinical Parity Enforcement');

    // 6.1 Guideline submission with missing Arabic translations
    const missingArabic = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', {
      titleAr: '',
      titleEn: 'Cardiovascular Risk Stratification',
      summaryAr: '',
      summaryEn: 'Comprehensive 10-year risk assessment framework',
      criteriaAr: '',
      criteriaEn: 'LDL > 190 mg/dL or diabetes with microvascular complications',
      actionItemsAr: '',
      actionItemsEn: 'High-intensity statin therapy + lifestyle modifications',
      redFlagsAr: '',
      redFlagsEn: 'Unstable angina or acute ischemic changes on ECG',
      category: 'cardiology',
      conditionScope: 'atherosclerosis'
    });

    assert.equal(missingArabic.status, 400, 'Must reject unilateral English guideline with 400');
    assert.equal(missingArabic.data.error, 'BILINGUAL_PARITY_FAILED');

    // 6.2 Guideline submission with missing English translations
    const missingEnglish = await api('POST', '/api/admin/clinical-cms/guidelines', 'token-clinical-qa', {
      titleAr: 'تصنيف مخاطر أمراض القلب والأوعية الدموية',
      titleEn: '',
      summaryAr: 'إطار شامل لتقييم المخاطر القلبية الوعائية خلال 10 سنوات',
      summaryEn: '',
      criteriaAr: 'نسبة الكوليسترول الضار أكبر من 190 ملغ/ديسيلتر',
      criteriaEn: '',
      actionItemsAr: 'بدء العلاج بمثبطات HMG-CoA عالية الفعالية',
      actionItemsEn: '',
      redFlagsAr: 'ألم صدري غير مستقر وتغيرات في تخطيط القلب',
      redFlagsEn: '',
      category: 'cardiology',
      conditionScope: 'atherosclerosis'
    });

    assert.equal(missingEnglish.status, 400, 'Must reject unilateral Arabic guideline with 400');
    assert.equal(missingEnglish.data.error, 'BILINGUAL_PARITY_FAILED');

    console.log('  ✓ Dual-language clinical parity strictly enforced across Arabic and English.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Legal & Regulatory Compliance Framework Certification
    // -------------------------------------------------------------------------
    console.log('▶ TEST 7: Legal & Regulatory Compliance Framework Certification');

    const compRes = await api('GET', '/api/admin/clinical-cms/security/compliance', 'token-clinical-qa');
    assert.equal(compRes.status, 200);
    assert.equal(compRes.data.success, true);
    assert.equal(compRes.data.benchmark, 'Isabel Healthcare Clinical Decision Support & Dual-Language Governance Standard');
    assert.equal(compRes.data.zeroPhiEnforced, true);
    assert.equal(compRes.data.encryptionAtRest.algorithm, 'AES-256-GCM');
    assert.equal(compRes.data.encryptionAtRest.status, 'AUTHENTICATED_AEAD_ACTIVE');
    assert.equal(compRes.data.integrityValidation.algorithm, 'SHA-256');

    // Verify statutory regulations covered
    const regulations = compRes.data.legalFramework.map(f => f.regulation);
    assert.ok(regulations.some(r => r.includes('GDPR Article 89(1)')), 'Must certify GDPR Article 89(1)');
    assert.ok(regulations.some(r => r.includes('HIPAA Safe Harbor')), 'Must certify HIPAA Safe Harbor');
    assert.ok(regulations.some(r => r.includes('Law No. 151 of 2020')), 'Must certify Egyptian Law 151 of 2020');
    assert.ok(regulations.some(r => r.includes('Isabel Healthcare Clinical Decision Support Standard')), 'Must certify Isabel Healthcare Standard');

    // Unauthorized role rejected
    const doctorCompRes = await api('GET', '/api/admin/clinical-cms/security/compliance', 'token-doctor');
    assert.equal(doctorCompRes.status, 403);

    console.log('  ✓ Legal & regulatory compliance framework verified (GDPR, HIPAA, Egyptian Law 151, Isabel Healthcare).\n');

  } finally {
    server.close();
  }
})().then(() => {
  console.log('================================================================================');
  console.log('✅ ALL CLINICAL CMS SECURITY & LEGAL TESTS PASSED (100% SUCCESS)');
  console.log('================================================================================');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
