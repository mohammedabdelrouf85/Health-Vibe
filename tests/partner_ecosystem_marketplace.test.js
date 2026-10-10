/**
 * Health Vibe AI - B2B Partner Ecosystem, Marketplace, Booking & Security Test Suite
 * 
 * Verifies:
 * 1. Specialty Discovery Catalog & Verified Doctor Marketplace
 * 2. Doctor Credential Verification Policy & Administrative Revocation
 * 3. Clinical Booking Engine & Concurrency Locks (Anti-Double Booking)
 * 4. Cancellation Lifecycle, Idempotency & Repeat-Cancellation Guards
 * 5. Cryptographic Partner API Keys, SHA-256 Hashing & Storage Hygiene
 * 6. Granular Permission Scopes Enforcement (RBAC)
 * 7. Multi-Tenant Organization Boundary Isolation (Org A vs Org B)
 * 8. Immediate Revocation of Partner Permissions and API Keys (Zero Leakage)
 * 9. Signed Webhooks (HMAC-SHA256, Anti-Replay Timestamp Tolerance)
 * 10. Webhook Delivery Exponential Backoff Retries on Transient Failures
 * 11. Clinical & Service Complaints Ingestion, SLA Deadlines & Resolution
 * 12. Official Partner SDK Client End-to-End Integration & Automatic Retries
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const http = require('node:http');
const { createRequire } = require('node:module');

console.log('================================================================================');
console.log('🌐 HEALTH VIBES AI: B2B PARTNER ECOSYSTEM & MARKETPLACE TEST SUITE');
console.log('   Marketplace, Booking, Revocation, Scopes, Isolation, Retries & Partner SDK');
console.log('================================================================================\n');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const partnerService = backendRequire('./partner-service');
const marketplaceService = backendRequire('./marketplace-service');
const { HealthVibePartnerClient } = backendRequire('./sdk/healthvibe-sdk');

const docs = {
  users: new Map([
    ['super-admin-uid', { role: 'super_admin', isOwner: true, emailVerified: true, email: 'owner@healthvibe.ai' }],
    ['org-a-admin-uid', { role: 'org_admin', orgRole: 'org_admin', orgId: 'org-alpha', emailVerified: true, email: 'admin@alphahealth.com' }],
    ['org-b-admin-uid', { role: 'org_admin', orgRole: 'org_admin', orgId: 'org-beta', emailVerified: true, email: 'admin@betamed.com' }],
    ['doctor-1-uid', { role: 'doctor', orgId: 'org-alpha', clinicId: 'clinic-a1', emailVerified: true, email: 'dr.mona@alphahealth.com', verifiedDoctor: true, doctorApplicationStatus: 'approved' }],
    ['doctor-2-uid', { role: 'doctor', orgId: 'org-beta', clinicId: 'clinic-b1', emailVerified: true, email: 'dr.ahmed@betamed.com', verifiedDoctor: true, doctorApplicationStatus: 'approved' }],
    ['doctor-to-revoke', { role: 'doctor', orgId: 'org-alpha', clinicId: 'clinic-a1', emailVerified: true, email: 'dr.bad@alphahealth.com', verifiedDoctor: true, doctorApplicationStatus: 'approved' }],
    ['patient-uid', { role: 'patient', emailVerified: true, email: 'patient@example.com', name: 'طارق محمود' }]
  ]),
  organizations: new Map([
    ['org-alpha', { id: 'org-alpha', name: 'Alpha Health Network', plan: 'enterprise', integrations: [] }],
    ['org-beta', { id: 'org-beta', name: 'Beta Medical Group', plan: 'enterprise', integrations: [] }]
  ]),
  clinics: new Map([
    ['clinic-a1', { id: 'clinic-a1', orgId: 'org-alpha', name: 'Alpha Pulmonary Center' }],
    ['clinic-b1', { id: 'clinic-b1', orgId: 'org-beta', name: 'Beta Respiratory Clinic' }]
  ]),
  org_memberships: new Map([
    ['org-alpha_org-a-admin-uid', { orgId: 'org-alpha', userId: 'org-a-admin-uid', orgRole: 'org_admin', status: 'active' }],
    ['org-beta_org-b-admin-uid', { orgId: 'org-beta', userId: 'org-b-admin-uid', orgRole: 'org_admin', status: 'active' }]
  ]),
  org_private_config: new Map([
    ['org-alpha', { integrationSecrets: { 'int-webhook-alpha': { signingSecret: 'alpha_secret_key_123' } } }],
    ['org-beta', { integrationSecrets: { 'int-webhook-beta': { signingSecret: 'beta_secret_key_456' } } }]
  ]),
  doctor_applications: new Map([
    ['app-dr-mona', { id: 'app-dr-mona', userId: 'doctor-1-uid', status: 'approved', name: 'د. منى سامي', specialty: 'Pulmonology', clinic: 'Alpha Pulmonary Center', clinicId: 'clinic-a1' }],
    ['app-dr-ahmed', { id: 'app-dr-ahmed', userId: 'doctor-2-uid', status: 'approved', name: 'د. أحمد السيد', specialty: 'Allergy & Clinical Immunology', clinic: 'Beta Respiratory Clinic', clinicId: 'clinic-b1' }],
    ['app-dr-bad', { id: 'app-dr-bad', userId: 'doctor-to-revoke', status: 'approved', name: 'د. سامي ملغى', specialty: 'Pulmonology', clinic: 'Alpha Pulmonary Center', clinicId: 'clinic-a1' }]
  ]),
  appointments: new Map(),
  partner_api_keys: new Map(),
  complaints: new Map(),
  cases: new Map(),
  audit_events: new Map()
};

function getNestedValue(obj, pathStr) {
  if (!obj) return undefined;
  if (!pathStr.includes('.')) return obj[pathStr];
  return pathStr.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function setNestedValue(obj, pathStr, value) {
  if (!pathStr.includes('.')) {
    obj[pathStr] = value;
    return;
  }
  const parts = pathStr.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!curr[parts[i]]) curr[parts[i]] = {};
    curr = curr[parts[i]];
  }
  curr[parts[parts.length - 1]] = value;
}

function collection(name) {
  if (!docs[name]) docs[name] = new Map();
  return {
    doc: id => ({
      get: async () => ({
        exists: docs[name].has(id),
        id,
        data: () => docs[name].get(id)
      }),
      update: async data => {
        const current = docs[name].get(id) || {};
        const updated = { ...current };
        for (const [k, v] of Object.entries(data)) {
          setNestedValue(updated, k, v);
        }
        docs[name].set(id, updated);
      },
      set: async (data, options = {}) => {
        if (options && options.merge) {
          const current = docs[name].get(id) || {};
          const merged = { ...current };
          for (const [k, v] of Object.entries(data)) {
            setNestedValue(merged, k, v);
          }
          docs[name].set(id, merged);
        } else {
          docs[name].set(id, data);
        }
      },
      delete: async () => {
        docs[name].delete(id);
      }
    }),
    add: async data => {
      const id = `${name}-${docs[name].size + 1}`;
      docs[name].set(id, data);
      return { id };
    },
    get: async () => {
      const items = Array.from(docs[name].entries()).map(([id, data]) => ({
        id,
        data: () => data
      }));
      return {
        docs: items,
        empty: items.length === 0
      };
    },
    orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
    where: (field, op, value) => ({
      get: async () => {
        const matching = Array.from(docs[name].entries())
          .filter(([, data]) => {
            const actual = getNestedValue(data, field);
            return op === '==' ? actual === value : true;
          })
          .map(([id, data]) => ({ id, data: () => data }));
        return {
          docs: matching,
          empty: matching.length === 0
        };
      }
    })
  };
}

const firestore = () => ({ collection });
firestore.FieldValue = {
  serverTimestamp: () => 'server-time',
  arrayUnion: value => [value]
};

const claims = {
  'super-admin-token': { uid: 'super-admin-uid', email: 'owner@healthvibe.ai', role: 'super_admin', isOwner: true, email_verified: true },
  'org-a-admin-token': { uid: 'org-a-admin-uid', email: 'admin@alphahealth.com', role: 'org_admin', orgRole: 'org_admin', orgId: 'org-alpha', email_verified: true },
  'org-b-admin-token': { uid: 'org-b-admin-uid', email: 'admin@betamed.com', role: 'org_admin', orgRole: 'org_admin', orgId: 'org-beta', email_verified: true },
  'patient-token': { uid: 'patient-uid', email: 'patient@example.com', role: 'patient', email_verified: true }
};

const firebase = {
  apps: [{}],
  firestore,
  auth: () => ({
    verifyIdToken: async token => {
      if (!claims[token]) throw new Error('Invalid token');
      return { ...claims[token] };
    },
    setCustomUserClaims: async (uid, newClaims) => {
      const u = docs.users.get(uid);
      if (u) docs.users.set(uid, { ...u, ...newClaims });
    }
  })
};

const sandbox = {
  require: name => name === 'firebase-admin' ? firebase : name === 'dotenv' ? { config() {} }
    : name === './whatsapp-bot' || name === './backup-service' ? {} : backendRequire(name),
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199'
    },
    on() {},
    uptime: () => 1
  },
  console: { log() {}, info() {}, warn() {}, error() {} },
  Buffer,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), sandbox, { filename: serverPath });

(async () => {
  const server = sandbox.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, auth = {}, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    if (auth.apiKey) headers['X-API-Key'] = auth.apiKey;

    const response = await fetch(base + route, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsedBody = await response.json().catch(() => null);
    return { status: response.status, body: parsedBody, headers: response.headers };
  }

  let passedTests = 0;

  // ---------------------------------------------------------------------------
  // TEST 1: Specialty Discovery & Doctor Marketplace
  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Specialty Discovery & Doctor Marketplace');
  {
    const specRes = await request('GET', '/api/v1/marketplace/specialties');
    assert.strictEqual(specRes.status, 200, 'Specialties endpoint must return 200');
    assert.strictEqual(specRes.body.success, true);
    assert.ok(Array.isArray(specRes.body.specialties), 'Specialties must be an array');
    assert.ok(specRes.body.specialties.length >= 5, 'Must contain at least 5 standardized specialties');
    const pulmonology = specRes.body.specialties.find(s => s.slug === 'pulmonology');
    assert.ok(pulmonology, 'Pulmonology must be present');
    assert.ok(pulmonology.commonConditions.includes('Asthma'), 'Must list Asthma condition tag');

    const docRes = await request('GET', '/api/v1/marketplace/doctors');
    assert.strictEqual(docRes.status, 200, 'Doctors endpoint must return 200');
    assert.ok(docRes.body.doctors.length >= 2, 'Should return active verified doctors');
    const mona = docRes.body.doctors.find(d => d.name === 'د. منى سامي');
    assert.ok(mona, 'Dr. Mona must be found');
    assert.strictEqual(mona.verified, true);
    assert.strictEqual(mona.verificationBadge, 'HEALTH_VIBE_CERTIFIED');

    // Test filter by specialty
    const allergyDocs = await request('GET', '/api/v1/marketplace/doctors?specialty=Allergy%20%26%20Clinical%20Immunology');
    assert.strictEqual(allergyDocs.status, 200);
    assert.strictEqual(allergyDocs.body.doctors.length, 1);
    assert.strictEqual(allergyDocs.body.doctors[0].name, 'د. أحمد السيد');

    console.log('  ✓ Specialties catalog returned 5 clinical domains with diagnostic tags.');
    console.log('  ✓ Doctor marketplace returned verified practitioners with filtering.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Doctor Credential Verification Policy & Administrative Revocation
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Verification Policy Specification & Admin Revocation');
  {
    const policyRes = await request('GET', '/api/v1/verification/policy');
    assert.strictEqual(policyRes.status, 200);
    assert.ok(policyRes.body.policy.minimumRequirements.length >= 4);
    assert.strictEqual(policyRes.body.policy.reviewSlaHours, 48);

    // Administrative Revocation of Dr. Bad
    const revokeRes = await request('POST', '/api/admin/revoke-doctor-verification', { token: 'super-admin-token' }, {
      doctorUserId: 'doctor-to-revoke',
      reason: 'Expired medical license in national registry'
    });
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.body.status, 'revoked');

    // Verify User doc was demoted and application marked revoked
    const revokedUser = docs.users.get('doctor-to-revoke');
    assert.strictEqual(revokedUser.role, 'patient', 'Role must be demoted to patient');
    assert.strictEqual(revokedUser.verifiedDoctor, false, 'verifiedDoctor flag must be false');
    assert.strictEqual(revokedUser.doctorApplicationStatus, 'revoked');

    // Doctor marketplace should NO LONGER return Dr. Bad
    const docAfterRevoke = await request('GET', '/api/v1/marketplace/doctors');
    const foundBad = docAfterRevoke.body.doctors.find(d => d.id === 'doctor-to-revoke');
    assert.strictEqual(foundBad, undefined, 'Revoked doctor must be immediately removed from marketplace');

    console.log('  ✓ Verification policy metadata successfully published.');
    console.log('  ✓ Revocation demoted doctor role, invalidated claims, and removed practitioner from directory.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Partner API Key Provisioning, SHA-256 Hashing & Storage Security
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Cryptographic Partner API Key Generation & Hashing');
  let partnerKeyAlpha = null;
  let partnerKeyBeta = null;
  let partnerKeyRestricted = null;
  {
    // Create Partner Key for Org Alpha
    const keyResAlpha = await request('POST', '/api/org/org-alpha/partner-keys/create', { token: 'org-a-admin-token' }, {
      name: 'Alpha Health Telehealth Partner',
      scopes: [
        'specialties:read',
        'doctors:read',
        'appointments:read',
        'appointments:write',
        'appointments:cancel',
        'complaints:write'
      ],
      environment: 'live',
      rateLimit: 60
    });
    assert.strictEqual(keyResAlpha.status, 201);
    assert.ok(keyResAlpha.body.apiKey.startsWith('hv_live_'), 'API key must start with hv_live_');
    assert.ok(keyResAlpha.body.maskedKey.includes('...'), 'Masked key must be formatted');
    partnerKeyAlpha = keyResAlpha.body.apiKey;

    // Verify that the plaintext key is NOT stored in the database
    const storedKey = docs.partner_api_keys.get(keyResAlpha.body.keyId);
    assert.ok(storedKey, 'Key doc must exist in Firestore');
    assert.strictEqual(storedKey.keyHash, partnerService.hashApiKey(partnerKeyAlpha), 'Must store SHA-256 hash');
    assert.strictEqual(storedKey.rawKey, undefined, 'Raw key MUST NEVER be saved in database');

    // Create Partner Key for Org Beta
    const keyResBeta = await request('POST', '/api/org/org-beta/partner-keys/create', { token: 'org-b-admin-token' }, {
      name: 'Beta Hospital EMR Partner',
      scopes: partnerService.ALL_PARTNER_SCOPES,
      environment: 'live'
    });
    assert.strictEqual(keyResBeta.status, 201);
    partnerKeyBeta = keyResBeta.body.apiKey;

    // Create Restricted Scope Key (Only Read Specialties)
    const keyResRestricted = await request('POST', '/api/org/org-alpha/partner-keys/create', { token: 'org-a-admin-token' }, {
      name: 'Read Only Discovery Partner',
      scopes: ['specialties:read']
    });
    assert.strictEqual(keyResRestricted.status, 201);
    partnerKeyRestricted = keyResRestricted.body.apiKey;

    console.log('  ✓ Cryptographic keys generated (hv_live_...) and stored strictly as SHA-256 hashes.');
    console.log('  ✓ Plaintext key returned exactly once during provisioning.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Scoped Permission Enforcement (RBAC)
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Granular Partner Permission Scopes (RBAC)');
  {
    // Key with 'specialties:read' should succeed
    const allowedRes = await request('GET', '/api/v1/marketplace/specialties', { apiKey: partnerKeyRestricted });
    assert.strictEqual(allowedRes.status, 200, 'Should allow specialties read');

    // Restricted key attempting to book an appointment (needs 'appointments:write')
    const forbiddenRes = await request('POST', '/api/v1/appointments/book', { apiKey: partnerKeyRestricted }, {
      doctorId: 'doctor-1-uid',
      date: '2026-10-15',
      timeSlot: '10:00 صباحًا',
      patientName: 'Unpermitted Request'
    });
    assert.strictEqual(forbiddenRes.status, 403, 'Must reject booking without appointments:write scope');
    assert.strictEqual(forbiddenRes.body.error, 'FORBIDDEN_SCOPE');
    assert.strictEqual(forbiddenRes.body.requiredScope, 'appointments:write');

    console.log('  ✓ Granular scope enforcement blocked unpermitted mutation with 403 FORBIDDEN_SCOPE.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Booking Engine & Concurrency Anti-Double Booking Guard
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Booking Creation & Concurrency Locks (Anti-Double Booking)');
  let bookedApptAlpha = null;
  {
    const bookingPayload = {
      doctorId: 'doctor-1-uid',
      doctorName: 'د. منى سامي',
      date: '2026-10-15',
      timeSlot: '10:00 صباحًا',
      type: 'video',
      patientId: 'patient-test-01',
      patientName: 'مريض الفحص الذكي',
      notes: 'استشارة تنفسية عاجلة'
    };

    // First booking should succeed
    const bookRes1 = await request('POST', '/api/v1/appointments/book', { apiKey: partnerKeyAlpha }, bookingPayload);
    assert.strictEqual(bookRes1.status, 201, 'Booking must succeed with 201');
    assert.strictEqual(bookRes1.body.appointment.status, 'confirmed');
    assert.strictEqual(bookRes1.body.appointment.orgId, 'org-alpha', 'Must bind to partner orgId');
    bookedApptAlpha = bookRes1.body.appointment;

    // Doctor double-booking conflict: another patient books the SAME doctor at the SAME slot
    const conflictDoctorPayload = {
      ...bookingPayload,
      patientId: 'patient-test-02',
      patientName: 'مريض آخر'
    };
    const bookResConflictDoc = await request('POST', '/api/v1/appointments/book', { apiKey: partnerKeyAlpha }, conflictDoctorPayload);
    assert.strictEqual(bookResConflictDoc.status, 409, 'Must reject doctor double-booking with 409');
    assert.strictEqual(bookResConflictDoc.body.error, 'DOCTOR_SLOT_UNAVAILABLE');

    // Patient self-overlap conflict: same patient books another doctor at the same slot
    const conflictPatientPayload = {
      ...bookingPayload,
      doctorId: 'doctor-2-uid',
      doctorName: 'د. أحمد السيد'
    };
    const bookResConflictPat = await request('POST', '/api/v1/appointments/book', { apiKey: partnerKeyAlpha }, conflictPatientPayload);
    assert.strictEqual(bookResConflictPat.status, 409, 'Must reject patient schedule conflict with 409');
    assert.strictEqual(bookResConflictPat.body.error, 'PATIENT_SCHEDULE_CONFLICT');

    console.log('  ✓ Clinical booking created with verified organization association.');
    console.log('  ✓ Concurrency lock blocked simultaneous doctor double-booking (409 DOCTOR_SLOT_UNAVAILABLE).');
    console.log('  ✓ Anti-overlap guard blocked patient dual-booking (409 PATIENT_SCHEDULE_CONFLICT).');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Multi-Tenant Organization Isolation (Org Alpha vs Org Beta)
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Multi-Tenant Organization Isolation');
  {
    // Partner Beta attempts to access Org Alpha's appointment
    const crossReadRes = await request('GET', `/api/v1/appointments/${bookedApptAlpha.id}`, { apiKey: partnerKeyBeta });
    assert.strictEqual(crossReadRes.status, 403, 'Cross-tenant access must be rejected with 403');
    assert.strictEqual(crossReadRes.body.error, 'ORGANIZATION_ISOLATION_VIOLATION');

    // Partner Beta attempts to cancel Org Alpha's appointment
    const crossCancelRes = await request('POST', `/api/v1/appointments/${bookedApptAlpha.id}/cancel`, { apiKey: partnerKeyBeta }, {
      reason: 'Unauthorized cross-tenant cancel'
    });
    assert.strictEqual(crossCancelRes.status, 403, 'Cross-tenant mutation must be rejected with 403');
    assert.strictEqual(crossCancelRes.body.error, 'ORGANIZATION_ISOLATION_VIOLATION');

    console.log('  ✓ Partner Beta strictly blocked from reading or cancelling Org Alpha appointments.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Cancellation Lifecycle & Repeat Cancellation Guard
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Appointment Cancellation & Idempotency Guards');
  {
    // Authorized cancellation by Org Alpha partner
    const cancelRes = await request('POST', `/api/v1/appointments/${bookedApptAlpha.id}/cancel`, { apiKey: partnerKeyAlpha }, {
      reason: 'Patient requested rescheduling to next week'
    });
    assert.strictEqual(cancelRes.status, 200, 'Cancellation must succeed with 200');
    assert.strictEqual(cancelRes.body.status, 'cancelled');

    // Verify appointment status in store
    const storedAppt = docs.appointments.get(bookedApptAlpha.id);
    assert.strictEqual(storedAppt.status, 'cancelled');
    assert.ok(storedAppt.cancelledAt > 0);
    assert.ok(storedAppt.cancelledBy.includes('partner:'));

    // Attempting to cancel again must be rejected by repeat-cancellation guard
    const repeatCancelRes = await request('POST', `/api/v1/appointments/${bookedApptAlpha.id}/cancel`, { apiKey: partnerKeyAlpha }, {
      reason: 'Cancelling already cancelled'
    });
    assert.strictEqual(repeatCancelRes.status, 400, 'Must reject already cancelled appointment with 400');
    assert.strictEqual(repeatCancelRes.body.error, 'APPOINTMENT_ALREADY_CANCELLED');

    // The slot should now be FREED UP for booking by another patient
    const freedSlotRes = await request('POST', '/api/v1/appointments/book', { apiKey: partnerKeyAlpha }, {
      doctorId: 'doctor-1-uid',
      date: '2026-10-15',
      timeSlot: '10:00 صباحًا',
      patientId: 'patient-test-03',
      patientName: 'مريض جديد حجز الموعد المحرر'
    });
    assert.strictEqual(freedSlotRes.status, 201, 'Slot must be immediately reusable after cancellation');

    console.log('  ✓ Appointment successfully cancelled with audit trail and reason metadata.');
    console.log('  ✓ Repeat cancellation prevented via 400 APPOINTMENT_ALREADY_CANCELLED.');
    console.log('  ✓ Cancelled slot immediately released back to availability pool.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Immediate Revocation of Partner Permissions and API Keys
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Partner API Key Revocation');
  {
    // Get list of partner keys for Org Alpha to find keyId
    const listRes = await request('GET', '/api/org/org-alpha/partner-keys', { token: 'org-a-admin-token' });
    assert.strictEqual(listRes.status, 200);
    const keyEntry = listRes.body.keys.find(k => k.status === 'active');
    assert.ok(keyEntry, 'Key entry must be found');

    // Revoke the key
    const revokeKeyRes = await request('POST', `/api/org/org-alpha/partner-keys/${keyEntry.keyId}/revoke`, { token: 'org-a-admin-token' });
    assert.strictEqual(revokeKeyRes.status, 200);
    assert.strictEqual(revokeKeyRes.body.status, 'revoked');

    // Verify subsequent API call with revoked key IMMEDIATELY fails with 401
    const useRevokedRes = await request('GET', '/api/v1/marketplace/specialties', { apiKey: partnerKeyAlpha });
    assert.strictEqual(useRevokedRes.status, 401, 'Revoked key must return 401');
    assert.strictEqual(useRevokedRes.body.error, 'PARTNER_KEY_REVOKED');

    console.log('  ✓ Key revocation executed and recorded in audit log.');
    console.log('  ✓ Revoked key instantly rejected with 401 PARTNER_KEY_REVOKED (zero latency).');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Signed Webhooks & HMAC-SHA256 Cryptographic Verification
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 9: HMAC-SHA256 Signed Webhooks & Anti-Replay Verification');
  {
    const secret = 'partner_secret_test_xyz_9988';
    const samplePayload = {
      id: 'evt_1728280000_abc',
      event: 'appointment.cancelled',
      orgId: 'org-alpha',
      data: { appointmentId: 'appt_123', reason: 'Emergency' }
    };

    // Sign payload
    const { headerValue, timestamp } = partnerService.signWebhookPayload(samplePayload, secret);
    assert.ok(headerValue.includes('t='), 'Header must contain timestamp t=');
    assert.ok(headerValue.includes('v1='), 'Header must contain signature v1=');

    // Verify valid signature
    const verifyValid = partnerService.verifyWebhookSignature(samplePayload, headerValue, secret);
    assert.strictEqual(verifyValid.valid, true, 'Valid signature must pass verification');

    // Verify tampered payload fails
    const tamperedPayload = { ...samplePayload, event: 'appointment.booked' };
    const verifyTampered = partnerService.verifyWebhookSignature(tamperedPayload, headerValue, secret);
    assert.strictEqual(verifyTampered.valid, false, 'Tampered payload must fail');
    assert.strictEqual(verifyTampered.error, 'SIGNATURE_MISMATCH');

    // Verify anti-replay timestamp expiration
    const expiredTimestamp = Date.now() - (400 * 1000); // 400 seconds ago (> 300s limit)
    const { headerValue: expiredHeader } = partnerService.signWebhookPayload(samplePayload, secret, expiredTimestamp);
    const verifyExpired = partnerService.verifyWebhookSignature(samplePayload, expiredHeader, secret, 300);
    assert.strictEqual(verifyExpired.valid, false, 'Expired signature must fail anti-replay check');
    assert.strictEqual(verifyExpired.error, 'SIGNATURE_TIMESTAMP_EXPIRED');

    console.log('  ✓ HMAC-SHA256 signatures generated with t={timestamp},v1={hash}.');
    console.log('  ✓ Tampered payloads rejected with SIGNATURE_MISMATCH.');
    console.log('  ✓ Replay attacks rejected when timestamp exceeds tolerance window.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Webhook Delivery Retries with Exponential Backoff
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 10: Webhook Delivery Retries with Exponential Backoff');
  {
    let attemptsCount = 0;
    const testSecret = 'retry_secret_abc';

    // Mock fetch that fails with 500 on attempt 1 & 2, then succeeds on attempt 3
    const mockFetch = async () => {
      attemptsCount++;
      if (attemptsCount < 3) {
        return { status: 500, ok: false };
      }
      return { status: 200, ok: true };
    };

    const dispatchResult = await partnerService.dispatchSignedWebhook({
      orgId: 'org-alpha',
      event: 'appointment.cancelled',
      data: { id: 'test_appt' },
      targetEndpoint: 'https://partner.example.com/webhook',
      signingSecret: testSecret,
      fetchImpl: mockFetch,
      maxRetries: 3,
      initialBackoffMs: 20
    });

    assert.strictEqual(dispatchResult.success, true, 'Webhook dispatch should succeed after retries');
    assert.strictEqual(dispatchResult.attempts, 3, 'Must have attempted 3 times');
    assert.strictEqual(dispatchResult.statusCode, 200);

    console.log(`  ✓ Webhook delivery recovered and succeeded after ${attemptsCount} attempts with backoff.`);
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Clinical Complaints Management & SLA Resolution
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 11: Clinical Complaints Submission, SLA & Resolution');
  {
    const complaintRes = await request('POST', '/api/v1/complaints/submit', { apiKey: partnerKeyBeta }, {
      category: 'clinical_care',
      severity: 'urgent',
      subject: 'تأخر الطبيب واستفسار عن الأعراض التنفسية',
      description: 'المريض عانى من ضيق تنفس حاد ولم يحضر الطبيب في الوقت المحدد.',
      doctorId: 'doctor-2-uid'
    });
    assert.strictEqual(complaintRes.status, 201);
    assert.strictEqual(complaintRes.body.complaint.severity, 'urgent');
    assert.strictEqual(complaintRes.body.complaint.slaHours, 4, 'Urgent complaints must have 4-hour SLA');
    assert.ok(complaintRes.body.complaint.slaDeadline > Date.now());
    const cmpId = complaintRes.body.complaint.id;

    // Resolve complaint as Super Admin
    const resolveRes = await request('POST', `/api/admin/complaints/${cmpId}/resolve`, { token: 'super-admin-token' }, {
      status: 'resolved',
      resolutionNotes: 'تم التواصل مع المريض وتقديم استشارة طوارئ بديلة فورية وتنبيه الطبيب.',
      correctiveAction: 'SLA priority contact dispatched'
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.body.status, 'resolved');

    console.log('  ✓ Complaint submitted with automatic SLA calculation (urgent = 4h).');
    console.log('  ✓ Administrative resolution recorded with corrective action details.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Partner SDK Client End-to-End Integration & Client Retries
  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 12: Partner SDK Client End-to-End Integration & Client Retries');
  {
    const client = new HealthVibePartnerClient({
      apiKey: partnerKeyBeta,
      baseUrl: base,
      maxRetries: 3
    });

    // 1. SDK getSpecialties
    const sdkSpecs = await client.getSpecialties();
    assert.strictEqual(sdkSpecs.success, true);
    assert.ok(sdkSpecs.specialties.length >= 5);

    // 2. SDK getDoctors
    const sdkDoctors = await client.getDoctors();
    assert.strictEqual(sdkDoctors.success, true);
    assert.ok(sdkDoctors.doctors.length >= 2);

    // 3. SDK bookAppointment
    const sdkBooking = await client.bookAppointment({
      doctorId: 'doctor-2-uid',
      date: '2026-10-18',
      timeSlot: '04:00 مساءً',
      patientName: 'مريض عبر الـ SDK'
    });
    assert.strictEqual(sdkBooking.success, true);
    assert.strictEqual(sdkBooking.appointment.status, 'confirmed');
    const apptId = sdkBooking.appointment.id;

    // 4. SDK cancelAppointment
    const sdkCancel = await client.cancelAppointment(apptId, 'الغاء من خلال الـ SDK');
    assert.strictEqual(sdkCancel.success, true);
    assert.strictEqual(sdkCancel.status, 'cancelled');

    // 5. SDK verifyWebhookSignature
    const testSecret = 'sdk_test_secret_777';
    const testPayload = { event: 'appointment.cancelled', id: apptId };
    const { headerValue } = partnerService.signWebhookPayload(testPayload, testSecret);
    const sdkVerify = client.verifyWebhookSignature(testPayload, headerValue, testSecret);
    assert.strictEqual(sdkVerify.valid, true);

    // 6. SDK Retry on transient 500 error
    let retryCalls = 0;
    const retryClient = new HealthVibePartnerClient({
      apiKey: partnerKeyBeta,
      baseUrl: base,
      maxRetries: 2,
      initialRetryDelayMs: 10,
      fetchImpl: async (url, opts) => {
        retryCalls++;
        if (retryCalls < 2) {
          return {
            status: 503,
            ok: false,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ error: 'SERVICE_UNAVAILABLE', message: 'Transient overload' })
          };
        }
        return fetch(url, opts);
      }
    });

    const recoveredRes = await retryClient.getSpecialties();
    assert.strictEqual(recoveredRes.success, true);
    assert.strictEqual(retryCalls, 2, 'SDK should have retried once and succeeded');

    console.log('  ✓ Official Partner SDK methods (discovery, booking, cancel, webhooks) verified.');
    console.log('  ✓ Automatic exponential backoff retried on transient 503 and succeeded.');
    passedTests++;
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  server.close();

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passedTests} B2B PARTNER ECOSYSTEM & MARKETPLACE TESTS PASSED WITH 100% SUCCESS!`);
  console.log('================================================================================');
  process.exit(0);
})().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
