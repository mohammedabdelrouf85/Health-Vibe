/**
 * HEALTH VIBE AI: BRANCHES & CLINICS MANAGER QA & AUDIT TEST SUITE (Practo Benchmark)
 * 
 * Comprehensive QA & Audit Verification:
 * 1. Multi-Role Authorization & Least Privilege Matrix (9+ Sub-Roles):
 *    - super_admin, clinic_admin, doctor, ops, clinical_qa, support, nurse, receptionist, patient, unauthenticated.
 * 2. Scoping & Cross-Clinic Isolation:
 *    - Strict multi-tenant isolation, cross-clinic write/read blocking, foreign patient inquiry blocking.
 * 3. Security, Input Fuzzing & Injection Defense:
 *    - HTTPS map URL whitelisting (SSRF/open redirect defense).
 *    - Phone number E.164 format and SQL/script injection defense.
 *    - Stored XSS sanitization in names and physical addresses.
 *    - Primary headquarters branch deletion safeguard.
 *    - Body-level role escalation attempt defense.
 * 4. Statutory & Security Audit Trail Verification:
 *    - CLINIC_BRANCH_CREATED, CLINIC_BRANCH_UPDATED, CLINIC_BRANCH_DELETED,
 *      CLINIC_DOCTORS_UPDATED, CROSS_CLINIC_LEAKAGE_ATTEMPT_BLOCKED.
 * 5. Zero-PHI Leakage & Doctor PII Masking Compliance:
 *    - Zero patient health information across all directory endpoints.
 *    - Masked doctor emails and shielded syndicate credentials.
 * 6. Edge Cases & Error Handling:
 *    - 404 for unknown clinics, 400 for missing mandatory parameters, 403 for unverified email.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('================================================================================');
console.log('🧪  HEALTH VIBE AI: BRANCHES & CLINICS MANAGER QA & AUDIT TEST SUITE (Practo)');
console.log('    Multi-Role RBAC Matrix, Least Privilege, Zero-PHI & Audit Logging');
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
    ['user-clinic-admin-cairo', {
      uid: 'user-clinic-admin-cairo',
      role: 'clinic_admin',
      clinicId: 'clinic_cairo_main',
      email: 'cairo.admin@healthvibes.org',
      emailVerified: true
    }],
    ['user-clinic-admin-giza', {
      uid: 'user-clinic-admin-giza',
      role: 'clinic_admin',
      clinicId: 'clinic_giza_west',
      email: 'giza.admin@healthvibes.org',
      emailVerified: true
    }],
    ['user-ops-admin', {
      uid: 'user-ops-admin',
      role: 'ops',
      email: 'ops@healthvibes.org',
      emailVerified: true
    }],
    ['user-clinical-qa-admin', {
      uid: 'user-clinical-qa-admin',
      role: 'clinical_qa',
      email: 'qa@healthvibes.org',
      emailVerified: true
    }],
    ['user-support-admin', {
      uid: 'user-support-admin',
      role: 'support',
      email: 'support@healthvibes.org',
      emailVerified: true
    }],
    ['user-doctor-1', {
      uid: 'user-doctor-1',
      role: 'doctor',
      name: 'د. طارق السعدني',
      specialty: 'أمراض الصدر والحساسية',
      email: 'tarek@healthvibes.org',
      emailVerified: true,
      nationalId: '28910101234567',
      licenseDocumentUrl: 'https://storage.healthvibe.internal/docs/license-1.pdf',
      clinicMemberships: []
    }],
    ['user-doctor-2', {
      uid: 'user-doctor-2',
      role: 'doctor',
      name: 'د. منى الشريف',
      specialty: 'أمراض الباطنة العامة',
      email: 'mona@healthvibes.org',
      emailVerified: true,
      nationalId: '29202021234568',
      licenseDocumentUrl: 'https://storage.healthvibe.internal/docs/license-2.pdf',
      clinicMemberships: []
    }],
    ['user-nurse-1', {
      uid: 'user-nurse-1',
      role: 'nurse',
      email: 'nurse@healthvibes.org',
      emailVerified: true
    }],
    ['user-receptionist-1', {
      uid: 'user-receptionist-1',
      role: 'receptionist',
      email: 'reception@healthvibes.org',
      emailVerified: true
    }],
    ['user-patient-1', {
      uid: 'user-patient-1',
      role: 'patient',
      email: 'patient1@test.org',
      emailVerified: true
    }],
    ['user-unverified-admin', {
      uid: 'user-unverified-admin',
      role: 'super_admin',
      isOwner: false,
      email: 'unverified@healthvibes.org',
      emailVerified: false
    }]
  ]),
  clinics: new Map(),
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
      empty: !docs[name] || docs[name].size === 0
    }),
    where: (field, op, value) => ({
      get: async () => ({
        docs: Array.from(docs[name]?.entries() || [])
          .filter(([, data]) => {
            if (op === '==') return data[field] === value;
            return false;
          })
          .map(([id, data]) => ({ id, data: () => data })),
        empty: Array.from(docs[name]?.entries() || []).filter(([, d]) => d[field] === value).length === 0
      })
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
  'token-clinic-admin-cairo': { uid: 'user-clinic-admin-cairo', email: 'cairo.admin@healthvibes.org', role: 'clinic_admin', clinicId: 'clinic_cairo_main', email_verified: true },
  'token-clinic-admin-giza': { uid: 'user-clinic-admin-giza', email: 'giza.admin@healthvibes.org', role: 'clinic_admin', clinicId: 'clinic_giza_west', email_verified: true },
  'token-ops-admin': { uid: 'user-ops-admin', email: 'ops@healthvibes.org', role: 'ops', email_verified: true },
  'token-clinical-qa-admin': { uid: 'user-clinical-qa-admin', email: 'qa@healthvibes.org', role: 'clinical_qa', email_verified: true },
  'token-support-admin': { uid: 'user-support-admin', email: 'support@healthvibes.org', role: 'support', email_verified: true },
  'token-doctor-1': { uid: 'user-doctor-1', email: 'tarek@healthvibes.org', role: 'doctor', email_verified: true },
  'token-doctor-2': { uid: 'user-doctor-2', email: 'mona@healthvibes.org', role: 'doctor', email_verified: true },
  'token-nurse-1': { uid: 'user-nurse-1', email: 'nurse@healthvibes.org', role: 'nurse', email_verified: true },
  'token-receptionist-1': { uid: 'user-receptionist-1', email: 'reception@healthvibes.org', role: 'receptionist', email_verified: true },
  'token-patient-1': { uid: 'user-patient-1', email: 'patient1@test.org', role: 'patient', email_verified: true },
  'token-unverified-clinic-admin': { uid: 'user-unverified-clinic-admin', email: 'unverified@healthvibes.org', role: 'clinic_admin', clinicId: 'clinic_cairo_main', isOwner: false, email_verified: false }
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

(async function runQAAuditTestSuite() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, token = null, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${base}${url}`, opts);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 1: Comprehensive Sub-Roles RBAC Matrix (Positive & Negative Controls)
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 1: Multi-Role Authorization & Least Privilege Matrix (9+ Sub-Roles)');

    // 1.1 Unauthenticated requests are rejected with 401 across all endpoints
    const unauthList = await api('GET', '/api/admin/clinics');
    assert.strictEqual(unauthList.status, 401, 'Anonymous request must be rejected with 401');

    const unauthPost = await api('POST', '/api/admin/clinics', null, { nameAr: 'فرع مجهول' });
    assert.strictEqual(unauthPost.status, 401, 'Anonymous POST must be rejected with 401');

    // 1.2 Patient role blocked from all admin clinic endpoints (403 ACCESS_DENIED)
    const patientList = await api('GET', '/api/admin/clinics', 'token-patient-1');
    assert.strictEqual(patientList.status, 403, 'Patient cannot list admin clinics');

    const patientCreate = await api('POST', '/api/admin/clinics', 'token-patient-1', {
      nameAr: 'فرع المريض',
      city: 'Cairo',
      addressAr: 'مصر الجديدة',
      phone: '+20 2 2450 1111'
    });
    assert.strictEqual(patientCreate.status, 403, 'Patient cannot create clinics');

    // 1.3 Clinical Staff roles (Nurse, Receptionist, Doctor) blocked from admin clinic management
    for (const [tokenName, roleName] of [
      ['token-doctor-1', 'Doctor'],
      ['token-nurse-1', 'Nurse'],
      ['token-receptionist-1', 'Receptionist']
    ]) {
      const staffList = await api('GET', '/api/admin/clinics', tokenName);
      assert.strictEqual(staffList.status, 403, `${roleName} cannot browse administrative clinics catalog`);

      const staffCreate = await api('POST', '/api/admin/clinics', tokenName, {
        nameAr: `فرع ${roleName}`,
        city: 'Cairo',
        addressAr: 'شارع المعز',
        phone: '+20 2 2500 0000'
      });
      assert.strictEqual(staffCreate.status, 403, `${roleName} cannot register new clinic branches`);
    }

    // 1.4 Administrative Sub-Roles (Ops, Clinical QA, Support)
    // Least Privilege: Non-clinical sub-roles are strictly blocked from administrative clinic management
    for (const [tokenName, roleName] of [
      ['token-ops-admin', 'Ops'],
      ['token-clinical-qa-admin', 'Clinical QA'],
      ['token-support-admin', 'Support']
    ]) {
      // Blocked from listing admin clinics
      const subRoleList = await api('GET', '/api/admin/clinics', tokenName);
      assert.strictEqual(subRoleList.status, 403, `${roleName} must be blocked from administrative clinics catalog`);

      // Blocked from creating branches
      const subRoleCreate = await api('POST', '/api/admin/clinics', tokenName, {
        nameAr: `فرع ${roleName} التجريبي`,
        city: 'Cairo',
        addressAr: 'شارع مصطفى النحاس',
        phone: '+20 2 2270 1234'
      });
      assert.strictEqual(subRoleCreate.status, 403, `${roleName} must be blocked from branch creation`);

      // Blocked from modifying branches
      const subRolePut = await api('PUT', '/api/admin/clinics/clinic_cairo_main', tokenName, {
        phone: '+20 2 9999 8888'
      });
      assert.strictEqual(subRolePut.status, 403, `${roleName} must be blocked from modifying branch data`);

      // Blocked from deleting branches
      const subRoleDel = await api('DELETE', '/api/admin/clinics/clinic_cairo_main', tokenName);
      assert.strictEqual(subRoleDel.status, 403, `${roleName} must be blocked from deleting branches`);

      // Blocked from affiliating doctors
      const subRoleDoc = await api('POST', '/api/admin/clinics/clinic_cairo_main/doctors', tokenName, {
        doctorId: 'user-doctor-1',
        action: 'link'
      });
      assert.strictEqual(subRoleDoc.status, 403, `${roleName} must be blocked from managing doctor affiliations`);
    }

    // 1.5 Unverified Email account blocked by requireVerifiedEmail
    const unverifiedUpdate = await api('PUT', '/api/admin/clinics/clinic_cairo_main', 'token-unverified-clinic-admin', {
      phone: '+20 2 2275 9999'
    });
    assert.strictEqual(unverifiedUpdate.status, 403, 'Unverified email account must be rejected with 403');
    assert.strictEqual(unverifiedUpdate.data.error, 'EMAIL_NOT_VERIFIED');

    console.log('  ✓ 9+ Sub-Roles verified against authorization matrix with strict least privilege.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 2: Multi-Tenant Scoping & Cross-Clinic Isolation QA
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 2: Multi-Tenant Scoping & Cross-Clinic Isolation QA');

    // Cairo Clinic Admin only sees Cairo clinic
    const cairoAdminList = await api('GET', '/api/admin/clinics', 'token-clinic-admin-cairo');
    assert.strictEqual(cairoAdminList.status, 200);
    assert.strictEqual(cairoAdminList.data.count, 1, 'Clinic Admin must be strictly scoped to 1 assigned clinic');
    assert.strictEqual(cairoAdminList.data.clinics[0].id, 'clinic_cairo_main');

    // Cairo Clinic Admin reading Giza details: blocked 403
    const foreignRead = await api('GET', '/api/admin/clinics/clinic_giza_west', 'token-clinic-admin-cairo');
    assert.strictEqual(foreignRead.status, 403, 'Cross-clinic detail view must be blocked 403 ACCESS_DENIED');
    assert.strictEqual(foreignRead.data.error, 'ACCESS_DENIED');

    // Cairo Clinic Admin reading Giza doctors: blocked 403
    const foreignDoctors = await api('GET', '/api/admin/clinics/clinic_giza_west/doctors', 'token-clinic-admin-cairo');
    assert.strictEqual(foreignDoctors.status, 403, 'Cross-clinic doctor list view must be blocked 403 ACCESS_DENIED');

    // Cairo Clinic Admin updating Giza details: blocked 403
    const foreignUpdate = await api('PUT', '/api/admin/clinics/clinic_giza_west', 'token-clinic-admin-cairo', {
      phone: '+20 2 3345 1111'
    });
    assert.strictEqual(foreignUpdate.status, 403, 'Cross-clinic update must be blocked 403 ACCESS_DENIED');

    // Cairo Clinic Admin linking doctor to Giza: blocked 403
    const foreignLink = await api('POST', '/api/admin/clinics/clinic_giza_west/doctors', 'token-clinic-admin-cairo', {
      doctorId: 'user-doctor-1',
      action: 'link'
    });
    assert.strictEqual(foreignLink.status, 403, 'Cross-clinic doctor management must be blocked 403 ACCESS_DENIED');

    console.log('  ✓ Multi-tenant scoping and zero-leakage cross-clinic boundaries fully verified.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 3: Penetration Testing, Input Fuzzing & Injection Defense
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 3: Penetration Testing, Input Fuzzing & Injection Defense');

    // 3.1 Map URL SSRF and XSS Vectors
    const maliciousMapUrls = [
      'javascript:alert("XSS")',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://ftp.example.com/map',
      'http://maps.google.com/?q=30.0,31.0', // Insecure HTTP
      'https://evil-phishing-site.com/maps',
      'https://maps.google.com.attacker.com/redirect'
    ];

    for (const badUrl of maliciousMapUrls) {
      const res = await api('POST', '/api/admin/clinics', 'token-super-admin', {
        nameAr: 'فرع فحص الأمان',
        city: 'Cairo',
        addressAr: 'شارع الهرم',
        phone: '+20 2 3585 0000',
        mapUrl: badUrl
      });
      assert.strictEqual(res.status, 400, `Malicious or untrusted URL must be rejected: ${badUrl}`);
      assert.strictEqual(res.data.error, 'INVALID_MAP_URL');
    }

    // 3.2 Trusted Whitelisted Map Providers Accepted
    const validMapUrls = [
      'https://maps.google.com/?q=30.0444,31.2357',
      'https://goo.gl/maps/abc123xyz',
      'https://www.openstreetmap.org/#map=16/30.0444/31.2357',
      'https://waze.com/ul?ll=30.0444,31.2357&navigate=yes'
    ];

    for (const [idx, goodUrl] of validMapUrls.entries()) {
      const branchId = `clinic_map_test_${idx + 1}`;
      const res = await api('POST', '/api/admin/clinics', 'token-super-admin', {
        id: branchId,
        nameAr: `فرع اختبار الخريطة ${idx + 1}`,
        city: 'Giza',
        addressAr: 'شارع النيل، الدقي',
        phone: `+20 2 3760 000${idx + 1}`,
        mapUrl: goodUrl
      });
      assert.strictEqual(res.status, 201, `Whitelisted map provider must be accepted: ${goodUrl}`);
      assert.strictEqual(res.data.clinic.mapUrl, goodUrl);
      // Clean up test branch
      await api('DELETE', `/api/admin/clinics/${branchId}`, 'token-super-admin');
    }

    // 3.3 Phone Number Fuzzing & Injection Defense
    const maliciousPhones = [
      'abc-def-ghij',
      '+20 2 3345\' OR \'1\'=\'1',
      '<script>alert(1)</script>',
      '12345', // Too short (<8)
      '+20 100 1234 5678 9999 8888 7777 6666' // Too long (>25)
    ];

    for (const badPhone of maliciousPhones) {
      const res = await api('POST', '/api/admin/clinics', 'token-super-admin', {
        nameAr: 'فرع فحص الهاتف',
        city: 'Cairo',
        addressAr: 'شارع رمسيس',
        phone: badPhone
      });
      assert.strictEqual(res.status, 400, `Malformed phone number must be rejected: ${badPhone}`);
      assert.strictEqual(res.data.error, 'INVALID_PHONE_FORMAT');
    }

    // 3.4 Stored XSS Sanitization in Branch Name and Physical Address
    const xssCreation = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      id: 'clinic_xss_sanitized',
      nameAr: '<script>alert("XSS")</script>مستشفى النيل التخصصي',
      nameEn: 'Nile Special Hospital <b onmouseover=alert(1)>HQ</b>',
      city: 'Cairo',
      addressAr: '<img src=x onerror=alert("pwned")> 15 شارع كورنيش النيل، المعادي',
      phone: '+20 2 2525 9999'
    });
    assert.strictEqual(xssCreation.status, 201);
    assert.ok(!xssCreation.data.clinic.nameAr.includes('<script>'), 'HTML script tags must be stripped from nameAr');
    assert.ok(!xssCreation.data.clinic.addressAr.includes('<img'), 'HTML img tags must be stripped from addressAr');
    assert.ok(!xssCreation.data.clinic.addressAr.includes('onerror'), 'Event handlers must be stripped');
    // Clean up
    await api('DELETE', '/api/admin/clinics/clinic_xss_sanitized', 'token-super-admin');

    // 3.5 Role Escalation & Field Tampering in Request Body
    const bodyTamperRes = await api('PUT', '/api/admin/clinics/clinic_cairo_main', 'token-clinic-admin-cairo', {
      role: 'super_admin',
      isOwner: true,
      isPrimary: false, // Trying to downgrade primary headquarters
      id: 'clinic_hijacked_id',
      phone: '+20 2 2275 8888'
    });
    assert.strictEqual(bodyTamperRes.status, 200);
    // Verify core protected properties were not tampered
    assert.strictEqual(bodyTamperRes.data.clinic.id, 'clinic_cairo_main', 'Document ID must remain immutable');
    assert.strictEqual(bodyTamperRes.data.clinic.isPrimary, true, 'isPrimary flag must remain true');

    // 3.6 Primary Branch Deletion Safeguard
    const delPrimaryRes = await api('DELETE', '/api/admin/clinics/clinic_cairo_main', 'token-super-admin');
    assert.strictEqual(delPrimaryRes.status, 400, 'Deleting primary headquarters branch must be blocked');
    assert.strictEqual(delPrimaryRes.data.error, 'CANNOT_DELETE_PRIMARY_BRANCH');

    console.log('  ✓ Penetration tests, injection payloads, XSS defense, and tamper safeguards verified.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 4: Statutory & Security Audit Trail Compliance
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 4: Statutory & Security Audit Trail Compliance');

    // Register a secondary branch to trigger lifecycle audit events
    const branchToAudit = 'clinic_shoubra_audit';
    const createRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      id: branchToAudit,
      nameAr: 'مركز هيلث فايب الطبي — فرع شبرا',
      city: 'Cairo',
      addressAr: '120 شارع شبرا الرئيسي',
      phone: '+20 2 2202 3333',
      mapUrl: 'https://maps.google.com/?q=30.0800,31.2500'
    });
    assert.strictEqual(createRes.status, 201);

    // Update branch
    const updateRes = await api('PUT', `/api/admin/clinics/${branchToAudit}`, 'token-super-admin', {
      phone: '+20 2 2202 4444'
    });
    assert.strictEqual(updateRes.status, 200);

    // Link doctor
    const linkRes = await api('POST', `/api/admin/clinics/${branchToAudit}/doctors`, 'token-super-admin', {
      doctorId: 'user-doctor-2',
      action: 'link',
      roleInClinic: 'consultant'
    });
    assert.strictEqual(linkRes.status, 200);

    // Unlink doctor
    const unlinkRes = await api('POST', `/api/admin/clinics/${branchToAudit}/doctors`, 'token-super-admin', {
      doctorId: 'user-doctor-2',
      action: 'unlink'
    });
    assert.strictEqual(unlinkRes.status, 200);

    // Trigger blocked cross-clinic patient access to test security incident logging
    const leakAttempt = await api('GET', `/api/admin/clinics/${branchToAudit}/patients`, 'token-clinic-admin-cairo');
    assert.strictEqual(leakAttempt.status, 403);
    assert.strictEqual(leakAttempt.data.error, 'CROSS_CLINIC_LEAKAGE_PROHIBITED');

    // Delete branch
    const deleteRes = await api('DELETE', `/api/admin/clinics/${branchToAudit}`, 'token-super-admin');
    assert.strictEqual(deleteRes.status, 200);

    // Inspect audit events recorded in audit_events collection
    const allAuditEvents = Array.from(docs.audit_events.values());

    const expectedEventTypes = [
      'CLINIC_BRANCH_CREATED',
      'CLINIC_BRANCH_UPDATED',
      'CLINIC_DOCTORS_UPDATED',
      'CROSS_CLINIC_LEAKAGE_ATTEMPT_BLOCKED',
      'CLINIC_BRANCH_DELETED'
    ];

    for (const eventType of expectedEventTypes) {
      const match = allAuditEvents.find(e => e.type === eventType && (e.clinicId === branchToAudit || e.details?.clinicId === branchToAudit || e.details?.attemptedClinicId === branchToAudit));
      assert.ok(match, `Statutory audit event must be logged: ${eventType}`);
      assert.ok(match.actor && match.actor.uid, `Audit event ${eventType} must have actor.uid`);
      assert.ok(match.timestamp, `Audit event ${eventType} must have timestamp`);
    }

    console.log('  ✓ Complete statutory audit lifecycle (Create, Update, Link, Unlink, Leak-Block, Delete) audited.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 5: Zero-PHI Directory & Doctor PII Masking Verification
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 5: Zero-PHI Directory & Doctor PII Masking Verification');

    // 5.1 Test all 3 listing / detail endpoints
    const endpointsToVerify = [
      '/api/admin/clinics?includeDoctors=true',
      '/api/admin/clinics/clinic_cairo_main',
      '/api/admin/clinics/clinic_cairo_main/doctors'
    ];

    for (const ep of endpointsToVerify) {
      const res = await api('GET', ep, 'token-super-admin');
      assert.strictEqual(res.status, 200, `Endpoint ${ep} should return 200`);

      const payloadString = JSON.stringify(res.data);

      // Verify ZERO patient PHI keywords
      assert.ok(!payloadString.includes('"diagnoses"'), `Endpoint ${ep} must not contain diagnoses`);
      assert.ok(!payloadString.includes('"vitals"'), `Endpoint ${ep} must not contain vitals`);
      assert.ok(!payloadString.includes('"prescriptions"'), `Endpoint ${ep} must not contain prescriptions`);
      assert.ok(!payloadString.includes('"medicalHistory"'), `Endpoint ${ep} must not contain medicalHistory`);
      assert.ok(!payloadString.includes('"symptoms"'), `Endpoint ${ep} must not contain symptoms`);

      // Verify ZERO unmasked doctor credentials
      assert.ok(!payloadString.includes('28910101234567'), `Doctor nationalId must not leak in ${ep}`);
      assert.ok(!payloadString.includes('license-1.pdf'), `Doctor license scan must not leak in ${ep}`);
      
      // If doctor email is present, verify it is masked
      if (res.data.doctors && Array.isArray(res.data.doctors)) {
        res.data.doctors.forEach(doc => {
          if (doc.email) {
            assert.ok(doc.email.includes('***'), `Doctor email must be masked in ${ep}: ${doc.email}`);
          }
        });
      }
    }

    console.log('  ✓ Zero-PHI compliance and Doctor PII masking verified across all directory endpoints.\n');

    // ═════════════════════════════════════════════════════════════════════════════
    // SUITE 6: Quality, Reliability & Edge Cases
    // ═════════════════════════════════════════════════════════════════════════════
    console.log('▶ SUITE 6: Quality, Reliability & Edge Cases');

    // 6.1 Non-existent clinic returns 404
    const notFoundRes = await api('GET', '/api/admin/clinics/clinic_non_existent_9999', 'token-super-admin');
    assert.strictEqual(notFoundRes.status, 404, 'Non-existent clinic ID must return 404');
    assert.strictEqual(notFoundRes.data.error, 'NOT_FOUND');

    // 6.2 Missing mandatory fields on create returns 400
    const emptyNameRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: '',
      city: 'Cairo',
      addressAr: 'شارع الأزهر',
      phone: '+20 2 2590 1111'
    });
    assert.strictEqual(emptyNameRes.status, 400, 'Empty clinic name must return 400 INVALID_REQUEST');

    // 6.3 Missing physical address for physical branch returns 400
    const emptyAddrRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: 'فرع بدون عنوان',
      city: 'Cairo',
      addressAr: '',
      phone: '+20 2 2590 2222',
      isVirtual: false
    });
    assert.strictEqual(emptyAddrRes.status, 400, 'Missing physical address must return 400 INVALID_REQUEST');

    // 6.4 Linking doctor with invalid doctorId returns 404
    const invalidDocRes = await api('POST', '/api/admin/clinics/clinic_cairo_main/doctors', 'token-super-admin', {
      doctorId: 'user-doctor-non-existent',
      action: 'link'
    });
    assert.strictEqual(invalidDocRes.status, 404, 'Linking non-existent doctor must return 404');

    console.log('  ✓ Edge cases, missing fields, and error states handled reliably.\n');

    console.log('================================================================================');
    console.log('✅ ALL 6 QA & AUDIT SUITES PASSED (100% SUCCESS)');
    console.log('================================================================================\n');

  } finally {
    server.close();
  }
})();
