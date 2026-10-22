/**
 * HEALTH VIBE AI: BRANCHES & CLINICS MANAGER TEST SUITE (Practo Benchmark)
 * 
 * Verifies:
 * 1. Comprehensive CRUD for Medical Centers, Hospitals, and Clinic Branches:
 *    - Physical addresses, phone numbers, map URLs, specialties, and doctor capacities.
 * 2. Fine-grained RBAC and Scoping:
 *    - Super Admin: global view, create, edit, delete (except primary).
 *    - Clinic Admin: scoped exclusively to assigned clinic (read/edit own branch, manage own doctors).
 *    - Cross-clinic privilege escalation blocked (403 ACCESS_DENIED).
 *    - Non-clinical sub-roles (Ops, Clinical QA, Support, Patients) blocked from write operations (403 ACCESS_DENIED).
 * 3. Primary Branch Protection:
 *    - Deletion of primary headquarters branch blocked (400 CANNOT_DELETE_PRIMARY_BRANCH).
 * 4. Doctor Branch Affiliation:
 *    - Linking / unlinking doctors with membership synchronization.
 * 5. Immutable Audit Trail Persistence:
 *    - CLINIC_BRANCH_CREATED, CLINIC_BRANCH_UPDATED, CLINIC_BRANCH_DELETED, CLINIC_DOCTORS_UPDATED
 *      persisted with actor identity, timestamp, and details.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

console.log('==================================================================');
console.log('🏥  HEALTH VIBE AI: BRANCHES & CLINICS MANAGER TEST SUITE (Practo)');
console.log('    RBAC Scoping, Branch CRUD, Map URLs, Doctor Affiliation & Audit');
console.log('==================================================================\n');

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
      specialty: 'أمراض الصدر والجهاز التنفسي',
      email: 'tarek@healthvibes.org',
      emailVerified: true,
      clinicMemberships: []
    }],
    ['user-doctor-2', {
      uid: 'user-doctor-2',
      role: 'doctor',
      name: 'د. منى الشريف',
      specialty: 'أمراض الباطنة العامة',
      email: 'mona@healthvibes.org',
      emailVerified: true,
      clinicMemberships: []
    }],
    ['user-patient-1', {
      uid: 'user-patient-1',
      role: 'patient',
      email: 'patient@test.org',
      emailVerified: true
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
  'token-support-admin': { uid: 'user-support-admin', email: 'support@healthvibes.org', role: 'support', email_verified: true },
  'token-patient-1': { uid: 'user-patient-1', email: 'patient@test.org', role: 'patient', email_verified: true }
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
    // ── TEST 1: Unauthenticated & Unauthorized Roles Blocked ────────────────
    console.log('▶ TEST 1: Authentication & Role Enforcement for Clinics Endpoints');
    const unauth = await api('GET', '/api/admin/clinics');
    assert.strictEqual(unauth.status, 401, 'Unauthenticated access must be rejected with 401');

    const patientAccess = await api('GET', '/api/admin/clinics', 'token-patient-1');
    assert.strictEqual(patientAccess.status, 403, 'Patient role must be rejected with 403 ACCESS_DENIED');
    console.log('  ✓ Unauthenticated and patient requests strictly blocked.\n');

    // ── TEST 2: Listing Clinic Branches with Super Admin & Filtering ───────
    console.log('▶ TEST 2: Super Admin Listing Clinics & City / Search Filtering');
    const listRes = await api('GET', '/api/admin/clinics', 'token-super-admin');
    assert.strictEqual(listRes.status, 200, 'Super Admin can list clinics');
    assert.ok(Array.isArray(listRes.data.clinics), 'Clinics should be an array');
    assert.ok(listRes.data.count >= 4, 'Must contain default clinics (Cairo, Giza, Alexandria, Telehealth)');

    // Filter by city: Alexandria
    const alexRes = await api('GET', '/api/admin/clinics?city=Alexandria', 'token-super-admin');
    assert.strictEqual(alexRes.status, 200);
    assert.ok(alexRes.data.clinics.every(c => c.city === 'Alexandria' || c.cityAr === 'Alexandria'), 'Filtered by Alexandria');

    // Search query: Dokki or التحرير
    const searchRes = await api('GET', '/api/admin/clinics?search=التحرير', 'token-super-admin');
    assert.strictEqual(searchRes.status, 200);
    assert.ok(searchRes.data.clinics.some(c => c.id === 'clinic_cairo_main'), 'Search matched Cairo main branch');
    console.log('  ✓ Super Admin lists all branches; city and search queries work accurately.\n');

    // ── TEST 3: Fine-grained Clinic Admin Scoping on List & Details ────────
    console.log('▶ TEST 3: Clinic Admin Scoping & Cross-Clinic Isolation');
    const cairoAdminList = await api('GET', '/api/admin/clinics', 'token-clinic-admin-cairo');
    assert.strictEqual(cairoAdminList.status, 200);
    assert.strictEqual(cairoAdminList.data.count, 1, 'Clinic Admin must be scoped ONLY to assigned clinic');
    assert.strictEqual(cairoAdminList.data.clinics[0].id, 'clinic_cairo_main');

    // Cairo admin reading Cairo clinic details: allowed
    const cairoDetail = await api('GET', '/api/admin/clinics/clinic_cairo_main', 'token-clinic-admin-cairo');
    assert.strictEqual(cairoDetail.status, 200);
    assert.strictEqual(cairoDetail.data.clinic.id, 'clinic_cairo_main');

    // Cairo admin attempting to read Giza clinic details: blocked 403
    const crossDetail = await api('GET', '/api/admin/clinics/clinic_giza_west', 'token-clinic-admin-cairo');
    assert.strictEqual(crossDetail.status, 403, 'Cross-clinic detail view must be blocked with 403');
    assert.strictEqual(crossDetail.data.error, 'ACCESS_DENIED');
    console.log('  ✓ Clinic Admin scoping verified: strict isolation from other branches.\n');

    // ── TEST 4: Register New Branch (Super Admin vs Clinic Admin vs Ops) ────
    console.log('▶ TEST 4: Registering New Medical Center / Branch (Practo CRUD)');
    // Clinic admin trying to create new branch: blocked
    const clinicAdminCreate = await api('POST', '/api/admin/clinics', 'token-clinic-admin-cairo', {
      nameAr: 'فرع مدينة نصر التخصصي',
      city: 'Cairo',
      addressAr: 'شارع عباس العقاد، مدينة نصر',
      phone: '+20 2 2270 9999'
    });
    assert.strictEqual(clinicAdminCreate.status, 403, 'Clinic Admin cannot create new clinic branches');

    // Non-clinical Ops admin trying to create new branch: blocked
    const opsCreate = await api('POST', '/api/admin/clinics', 'token-ops-admin', {
      nameAr: 'فرع المعادي',
      city: 'Cairo',
      addressAr: 'شارع النصر، المعادي',
      phone: '+20 2 2519 8888'
    });
    assert.strictEqual(opsCreate.status, 403, 'Ops admin cannot create new clinic branches');

    // Validation: missing phone number
    const invalidCreate = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: 'فرع النزهة الجديدة',
      city: 'Cairo',
      addressAr: 'شارع جوزيف تيتو'
    });
    assert.strictEqual(invalidCreate.status, 400, 'Missing phone must return 400 INVALID_REQUEST');

    // Valid branch creation by Super Admin
    const validCreate = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      id: 'clinic_nasr_city',
      nameAr: 'مستشفى هيلث فايب الدولي — فرع مدينة نصر',
      nameEn: 'HealthVibe International Hospital — Nasr City Branch',
      city: 'Cairo',
      cityAr: 'القاهرة',
      cityEn: 'Cairo',
      addressAr: '45 شارع عباس العقاد، المنطقة الأولى، مدينة نصر',
      addressEn: '45 Abbas El-Akkad St, First Zone, Nasr City',
      phone: '+20 2 2275 1111',
      mapUrl: 'https://maps.google.com/?q=30.0612,31.3412',
      doctorsCount: 5,
      activeSpecialties: ['أمراض الصدر والحساسية', 'العناية المركزة التنفسية'],
      isPrimary: false
    });
    assert.strictEqual(validCreate.status, 201, 'Super Admin successfully creates new branch');
    assert.strictEqual(validCreate.data.clinic.id, 'clinic_nasr_city');
    assert.strictEqual(validCreate.data.clinic.phone, '+20 2 2275 1111');
    assert.strictEqual(validCreate.data.clinic.mapUrl, 'https://maps.google.com/?q=30.0612,31.3412');

    // Verify audit log for CLINIC_BRANCH_CREATED
    const auditEvents = Array.from(docs.audit_events.values());
    const createEvent = auditEvents.find(e => e.type === 'CLINIC_BRANCH_CREATED' && e.clinicId === 'clinic_nasr_city');
    assert.ok(createEvent, 'Audit event CLINIC_BRANCH_CREATED must be recorded');
    assert.strictEqual(createEvent.actor.uid, 'user-super-admin');
    console.log('  ✓ Branch registered with map URL, physical address, and phone; audit event logged.\n');

    // ── TEST 5: Update Branch Details & Scoping Rules ───────────────────────
    console.log('▶ TEST 5: Updating Branch Details & Scoping Protections');
    // Giza admin updating their own branch: allowed
    const gizaUpdate = await api('PUT', '/api/admin/clinics/clinic_giza_west', 'token-clinic-admin-giza', {
      phone: '+20 2 3345 9999',
      mapUrl: 'https://maps.google.com/?q=30.0520,31.2005&z=17',
      addressAr: '28 شارع جامعة الدول العربية، بجوار محطة مترو التوفيقية، المهندسين'
    });
    assert.strictEqual(gizaUpdate.status, 200, 'Clinic admin can update their assigned branch');
    assert.strictEqual(gizaUpdate.data.clinic.phone, '+20 2 3345 9999');

    // Giza admin attempting to update Cairo branch: blocked 403
    const foreignUpdate = await api('PUT', '/api/admin/clinics/clinic_cairo_main', 'token-clinic-admin-giza', {
      phone: '+20 2 9999 9999'
    });
    assert.strictEqual(foreignUpdate.status, 403, 'Cross-clinic update must be blocked with 403');

    // Non-clinical Support admin attempting to update: blocked 403
    const supportUpdate = await api('PUT', '/api/admin/clinics/clinic_giza_west', 'token-support-admin', {
      phone: '+20 2 0000 0000'
    });
    assert.strictEqual(supportUpdate.status, 403, 'Support admin cannot edit branch details');

    // Verify audit log for CLINIC_BRANCH_UPDATED
    const updateEvent = Array.from(docs.audit_events.values()).find(
      e => e.type === 'CLINIC_BRANCH_UPDATED' && e.clinicId === 'clinic_giza_west'
    );
    assert.ok(updateEvent, 'Audit event CLINIC_BRANCH_UPDATED must be recorded');
    console.log('  ✓ Update operations strictly scoped with audit logs captured.\n');

    // ── TEST 6: Branch Deletion & Primary Branch Safeguard ──────────────────
    console.log('▶ TEST 6: Branch Deletion & Primary Headquarters Safeguard');
    // Attempting to delete primary headquarters branch (clinic_cairo_main)
    const delPrimary = await api('DELETE', '/api/admin/clinics/clinic_cairo_main', 'token-super-admin');
    assert.strictEqual(delPrimary.status, 400, 'Deleting primary branch must be rejected');
    assert.strictEqual(delPrimary.data.error, 'CANNOT_DELETE_PRIMARY_BRANCH');

    // Clinic admin attempting to delete any branch: blocked 403
    const clinicAdminDel = await api('DELETE', '/api/admin/clinics/clinic_nasr_city', 'token-clinic-admin-cairo');
    assert.strictEqual(clinicAdminDel.status, 403, 'Clinic admin cannot delete clinic branches');

    // Super admin deleting newly registered secondary branch
    const validDel = await api('DELETE', '/api/admin/clinics/clinic_nasr_city', 'token-super-admin');
    assert.strictEqual(validDel.status, 200, 'Super admin can delete secondary branch');

    // Verify branch is no longer in list
    const checkList = await api('GET', '/api/admin/clinics', 'token-super-admin');
    assert.ok(!checkList.data.clinics.some(c => c.id === 'clinic_nasr_city'), 'Deleted branch should be removed');

    // Verify audit log for CLINIC_BRANCH_DELETED
    const delEvent = Array.from(docs.audit_events.values()).find(
      e => e.type === 'CLINIC_BRANCH_DELETED' && e.clinicId === 'clinic_nasr_city'
    );
    assert.ok(delEvent, 'Audit event CLINIC_BRANCH_DELETED must be recorded');
    console.log('  ✓ Primary branch protected from deletion; secondary branch deleted with audit event.\n');

    // ── TEST 7: Doctor Branch Affiliation Management ────────────────────────
    console.log('▶ TEST 7: Doctor Branch Affiliation & Membership Synchronization');
    // Affiliate doctor 1 with Cairo clinic
    const affiliateRes = await api('POST', '/api/admin/clinics/clinic_cairo_main/doctors', 'token-clinic-admin-cairo', {
      doctorId: 'user-doctor-1',
      action: 'link',
      roleInClinic: 'senior_consultant'
    });
    assert.strictEqual(affiliateRes.status, 200, 'Affiliate doctor with clinic branch');
    assert.strictEqual(affiliateRes.data.status, 'approved');

    // Verify doctor now has Cairo clinic membership in user profile
    const doctorProfile = docs.users.get('user-doctor-1');
    const cairoMembership = (doctorProfile.clinicMemberships || []).find(m => m.clinicId === 'clinic_cairo_main');
    assert.ok(cairoMembership, 'Doctor profile must contain approved clinic membership');
    assert.strictEqual(cairoMembership.status, 'approved');
    assert.strictEqual(cairoMembership.roleInClinic, 'senior_consultant');

    // Giza clinic admin attempting to link doctor to Cairo clinic: blocked 403
    const crossDoctorLink = await api('POST', '/api/admin/clinics/clinic_cairo_main/doctors', 'token-clinic-admin-giza', {
      doctorId: 'user-doctor-2',
      action: 'link'
    });
    assert.strictEqual(crossDoctorLink.status, 403, 'Cross-clinic doctor management must be blocked 403');

    // Unlinking doctor
    const unlinkRes = await api('POST', '/api/admin/clinics/clinic_cairo_main/doctors', 'token-clinic-admin-cairo', {
      doctorId: 'user-doctor-1',
      action: 'unlink'
    });
    assert.strictEqual(unlinkRes.status, 200);
    assert.strictEqual(unlinkRes.data.status, 'revoked');

    // Verify audit log for CLINIC_DOCTORS_UPDATED
    const docAuditEvent = Array.from(docs.audit_events.values()).find(
      e => e.type === 'CLINIC_DOCTORS_UPDATED' && e.clinicId === 'clinic_cairo_main'
    );
    assert.ok(docAuditEvent, 'Audit event CLINIC_DOCTORS_UPDATED must be recorded');
    console.log('  ✓ Doctor affiliations synchronized with doctor profile and audit trail.\n');

    // ── TEST 8: Security & Legal: HTTPS Map URL & Phone Format Validation ────
    console.log('▶ TEST 8: Map URL Validation (HTTPS/Whitelisted Domains) & Phone Defense');
    // Insecure HTTP map URL rejected
    const httpMapRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: 'عيادة الدقي التجريبية',
      city: 'Giza',
      addressAr: 'شارع مصدق',
      phone: '+20 2 3760 1111',
      mapUrl: 'http://maps.google.com/?q=30.0,31.0'
    });
    assert.strictEqual(httpMapRes.status, 400, 'HTTP insecure map URL must be rejected');
    assert.strictEqual(httpMapRes.data.error, 'INVALID_MAP_URL');

    // Untrusted domain map URL rejected (prevent open redirect / SSRF)
    const untrustedMapRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: 'عيادة المهندسين',
      city: 'Giza',
      addressAr: 'شارع سوريا',
      phone: '+20 2 3760 2222',
      mapUrl: 'https://malicious-tracker.com/redirect'
    });
    assert.strictEqual(untrustedMapRes.status, 400, 'Untrusted map domain must be rejected');
    assert.strictEqual(untrustedMapRes.data.error, 'INVALID_MAP_URL');

    // Invalid phone number format rejected
    const invalidPhoneRes = await api('POST', '/api/admin/clinics', 'token-super-admin', {
      nameAr: 'عيادة الزمالك',
      city: 'Cairo',
      addressAr: 'شارع 26 يوليو',
      phone: 'invalid-alpha-phone-number',
      mapUrl: 'https://maps.google.com/?q=30.0,31.0'
    });
    assert.strictEqual(invalidPhoneRes.status, 400, 'Malformed phone number must be rejected');
    assert.strictEqual(invalidPhoneRes.data.error, 'INVALID_PHONE_FORMAT');
    console.log('  ✓ Insecure protocols, untrusted domains, and invalid phone formats strictly blocked.\n');

    // ── TEST 9: Security & Legal: Zero-PHI Directory & PII Masking Verification ──
    console.log('▶ TEST 9: Zero-PHI Verification & Doctor PII Masking in Branch Directory');
    const catalogRes = await api('GET', '/api/admin/clinics?includeDoctors=true', 'token-super-admin');
    assert.strictEqual(catalogRes.status, 200);

    catalogRes.data.clinics.forEach(c => {
      // 1. Zero PHI check
      assert.strictEqual(c.diagnoses, undefined, 'Branch directory must never contain diagnoses');
      assert.strictEqual(c.vitals, undefined, 'Branch directory must never contain vitals');
      assert.strictEqual(c.medicalHistory, undefined, 'Branch directory must never contain medical history');
      assert.strictEqual(c.symptoms, undefined, 'Branch directory must never contain symptoms');
      assert.strictEqual(c.cases, undefined, 'Branch directory must never contain raw clinical cases');

      // 2. Doctor PII masking check
      if (Array.isArray(c.doctors) && c.doctors.length > 0) {
        c.doctors.forEach(doc => {
          assert.strictEqual(doc.nationalId, undefined, 'Doctor national IDs must not leak');
          assert.strictEqual(doc.licenseDocumentUrl, undefined, 'Syndicate documents must not leak');
          if (doc.email) {
            assert.ok(doc.email.includes('***'), `Doctor email must be masked: ${doc.email}`);
          }
        });
      }
    });
    console.log('  ✓ Zero PHI confirmed across all branch records; doctor email addresses masked.\n');

    // ── TEST 10: Security & Legal: Cross-Clinic Patient Isolation Guard ────────
    console.log('▶ TEST 10: Cross-Clinic Medical Data Isolation Guard (/api/admin/clinics/:id/patients)');
    // Cairo admin attempting to query Giza clinic patients
    const crossPatientRes = await api('GET', '/api/admin/clinics/clinic_giza_west/patients', 'token-clinic-admin-cairo');
    assert.strictEqual(crossPatientRes.status, 403, 'Cross-clinic patient inquiry must be rejected with 403');
    assert.strictEqual(crossPatientRes.data.error, 'CROSS_CLINIC_LEAKAGE_PROHIBITED');

    // Non-clinical Ops admin attempting to query clinic patients
    const opsPatientRes = await api('GET', '/api/admin/clinics/clinic_cairo_main/patients', 'token-ops-admin');
    assert.strictEqual(opsPatientRes.status, 403, 'Ops admin must be barred from patient clinical rosters');
    assert.ok(
      opsPatientRes.data.error === 'ACCESS_DENIED' || opsPatientRes.data.error === 'LEAST_PRIVILEGE_RESTRICTION',
      'Must return ACCESS_DENIED or LEAST_PRIVILEGE_RESTRICTION'
    );

    // Verify audit event logged for cross-clinic leakage attempt
    const crossLeakEvent = Array.from(docs.audit_events.values()).find(
      e => e.type === 'CROSS_CLINIC_LEAKAGE_ATTEMPT_BLOCKED'
    );
    assert.ok(crossLeakEvent, 'Incident CROSS_CLINIC_LEAKAGE_ATTEMPT_BLOCKED must be audited');
    assert.strictEqual(crossLeakEvent.actor.uid, 'user-clinic-admin-cairo');
    console.log('  ✓ Cross-clinic patient leakage prevented; security violation logged to audit trail.\n');

    // ── TEST 11: Security & Legal: AES-256-GCM Encryption Service Integration ──
    console.log('▶ TEST 11: AES-256-GCM Encryption Service at Rest (AEAD)');
    const { encryptionService } = require('../backend/encryption-service');

    const sensitiveBranchData = JSON.stringify({
      hotlineDirectDispatchPin: '8849-SECRET-PIN',
      emergencyBackupPhone: '+20 100 888 7777',
      telehealthEncryptedStreamKey: 'stream_sec_xyz9988'
    });

    const encryptedEnvelope = encryptionService.encrypt(sensitiveBranchData, 'clinic_cairo_main');
    assert.strictEqual(encryptedEnvelope.algorithm, 'AES-256-GCM', 'Must use AES-256-GCM');
    assert.ok(encryptedEnvelope.ciphertext, 'Ciphertext must exist');
    assert.ok(encryptedEnvelope.iv, 'IV must exist (96 bits)');
    assert.ok(encryptedEnvelope.authTag, 'AuthTag must exist (128 bits)');

    // Decrypt and verify
    const decrypted = encryptionService.decrypt(encryptedEnvelope, 'clinic_cairo_main');
    const parsed = JSON.parse(decrypted);
    assert.strictEqual(parsed.hotlineDirectDispatchPin, '8849-SECRET-PIN');

    // Tampered AAD detection
    assert.throws(() => {
      encryptionService.decrypt(encryptedEnvelope, 'clinic_foreign_tampered');
    }, /DECRYPTION_AUTH_FAILED/, 'Tampered associated data must fail decryption');
    console.log('  ✓ AES-256-GCM encryption verified with cryptographic tamper resistance.\n');

    console.log('==================================================================');
    console.log('✅ ALL BRANCHES & CLINICS MANAGER TESTS PASSED (100% SUCCESS)');
    console.log('==================================================================\n');

  } finally {
    server.close();
  }
})();
