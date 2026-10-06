/**
 * Health Vibes AI - Multi-Tenant Organization, Clinic, Membership & Billing Test Suite
 * 
 * Validates:
 * 1. Tenant Isolation: Independent organization boundaries (Org A vs Org B)
 * 2. Multi-Clinic Management & Switching within Organization
 * 3. Membership Management: Invitations, role modifications, clinic assignments & removals
 * 4. Billing & Independent Usage-Limit Enforcement (Quota guards & plan upgrade)
 * 5. Aggregate-Report Management: Multi-clinic rollups strictly isolated to parent org
 * 6. Per-Organization Branding, Custom Domain & Messaging (Zero secret leakage)
 * 7. B2B & Enterprise Plans with Custom Integrations (FHIR, HL7, Webhook) according to Contracts
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

console.log('================================================================================');
console.log('🏢 HEALTH VIBES AI: MULTI-TENANT ENTERPRISE & B2B TEST SUITE');
console.log('   Tenant Isolation, Clinic Switching, Memberships, Billing, Quotas & Branding');
console.log('================================================================================\n');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

const docs = {
  users: new Map([
    ['super-admin-uid', { role: 'super_admin', isOwner: true, emailVerified: true, email: 'owner@healthvibe.ai' }],
    ['org-a-admin-uid', { role: 'org_admin', orgRole: 'org_admin', orgId: 'org-alpha', emailVerified: true, email: 'admin@alphahealth.com' }],
    ['org-b-admin-uid', { role: 'org_admin', orgRole: 'org_admin', orgId: 'org-beta', emailVerified: true, email: 'admin@betamed.com' }],
    ['doctor-a-uid', { role: 'doctor', orgId: 'org-alpha', emailVerified: true, email: 'doctor@alphahealth.com', verifiedDoctor: true, doctorApplicationStatus: 'approved' }],
    ['doctor-b-uid', { role: 'doctor', orgId: 'org-beta', emailVerified: true, email: 'doctor@betamed.com', verifiedDoctor: true, doctorApplicationStatus: 'approved' }],
    ['new-member-uid', { role: 'doctor', emailVerified: true, email: 'newdoc@alphahealth.com' }]
  ]),
  organizations: new Map(),
  clinics: new Map(),
  org_memberships: new Map(),
  org_private_config: new Map(),
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
  'doctor-a-token': { uid: 'doctor-a-uid', email: 'doctor@alphahealth.com', role: 'doctor', orgId: 'org-alpha', email_verified: true },
  'doctor-b-token': { uid: 'doctor-b-uid', email: 'doctor@betamed.com', role: 'doctor', orgId: 'org-beta', email_verified: true }
};

const firebase = {
  apps: [{}],
  firestore,
  auth: () => ({
    verifyIdToken: async token => {
      if (!claims[token]) throw new Error('Invalid token');
      return { ...claims[token] };
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

  async function request(method, route, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(base + route, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsedBody = await response.json().catch(() => null);
    return { status: response.status, body: parsedBody };
  }

  let passedTests = 0;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Tenant Creation & Isolation Demonstration
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: Tenant Creation & Mutual Isolation Demonstration');

    // Create Organization A (B2B Pro with initial monthly quota limit of 2 for testing)
    const createOrgA = await request('POST', '/api/org/create', 'org-a-admin-token', {
      name: 'Alpha Health Group',
      slug: 'alpha-health',
      plan: 'b2b_pro',
      branding: {
        brandName: 'Alpha Health Care',
        primaryColor: '#10B981',
        secondaryColor: '#3B82F6',
        supportEmail: 'help@alphahealth.com'
      },
      domain: {
        customDomain: 'health.alphahealth.com'
      },
      messaging: {
        senderName: 'AlphaHealth AI'
      },
      messagingSecrets: {
        apiKey: 'sk_live_alpha_secret_key_12345'
      }
    });
    assert.equal(createOrgA.status, 201, `Failed to create Org A: ${JSON.stringify(createOrgA.body)}`);
    const orgAId = createOrgA.body.orgId;
    assert.ok(orgAId);

    // Overwrite Org A's assessment limit to 2 to specifically test usage-limit enforcement
    docs.organizations.get(orgAId).billing.monthlyAssessmentLimit = 2;

    // Create Organization B (Enterprise with Contract)
    const createOrgB = await request('POST', '/api/org/create', 'org-b-admin-token', {
      name: 'Beta Medical Network',
      slug: 'beta-med',
      plan: 'enterprise',
      contract: {
        contractId: 'CTR-ENT-BETAMED-2026',
        customSlaHours: 1,
        terms: 'Enterprise Multi-Hospital Service Level Agreement'
      },
      branding: {
        brandName: 'Beta Medical Systems',
        primaryColor: '#6366F1'
      },
      messagingSecrets: {
        apiKey: 'sk_live_beta_secret_key_67890'
      }
    });
    assert.equal(createOrgB.status, 201, `Failed to create Org B: ${JSON.stringify(createOrgB.body)}`);
    const orgBId = createOrgB.body.orgId;
    assert.ok(orgBId);

    // Strict Tenant Isolation: Org Admin A attempting to access Org B details must be blocked
    const crossOrgAccess = await request('GET', `/api/org/${orgBId}`, 'org-a-admin-token');
    assert.equal(crossOrgAccess.status, 403, 'Cross-organization access must be forbidden with 403');

    // Org Admin A accessing own Org A details succeeds
    const ownOrgAccess = await request('GET', `/api/org/${orgAId}`, 'org-a-admin-token');
    assert.equal(ownOrgAccess.status, 200);
    assert.equal(ownOrgAccess.body.organization.name, 'Alpha Health Group');

    console.log('  ✓ Organizations provisioned and mutual cross-tenant isolation verified.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Clinic Management & Independent Clinic Switching
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Multi-Clinic Management & Independent Clinic Switching');

    // Provision Clinic A1 and Clinic A2 under Org A
    const clinicA1Res = await request('POST', `/api/org/${orgAId}/clinics`, 'org-a-admin-token', {
      name: 'Alpha Downtown Respiratory Center',
      clinicId: 'clinic-a1',
      specialty: 'Pulmonology'
    });
    assert.equal(clinicA1Res.status, 201);

    const clinicA2Res = await request('POST', `/api/org/${orgAId}/clinics`, 'org-a-admin-token', {
      name: 'Alpha North Pediatrics Clinic',
      clinicId: 'clinic-a2',
      specialty: 'Pediatric Pulmonology'
    });
    assert.equal(clinicA2Res.status, 201);

    // Provision Clinic B1 under Org B
    const clinicB1Res = await request('POST', `/api/org/${orgBId}/clinics`, 'org-b-admin-token', {
      name: 'Beta Central Hospital Chest Care',
      clinicId: 'clinic-b1',
      specialty: 'General Chest'
    });
    assert.equal(clinicB1Res.status, 201);

    // List clinics for Org A: must contain ONLY Clinic A1 and A2, NEVER Clinic B1
    const listAClinics = await request('GET', `/api/org/${orgAId}/clinics`, 'org-a-admin-token');
    assert.equal(listAClinics.status, 200);
    const clinicIdsA = listAClinics.body.clinics.map(c => c.clinicId || c.id);
    assert.ok(clinicIdsA.includes('clinic-a1'));
    assert.ok(clinicIdsA.includes('clinic-a2'));
    assert.ok(!clinicIdsA.includes('clinic-b1'), 'Clinic B1 must not leak into Org A clinic list');

    // Setup Doctor A membership in Org A with assigned clinics [clinic-a1, clinic-a2]
    docs.org_memberships.set(`${orgAId}_doctor-a-uid`, {
      id: `${orgAId}_doctor-a-uid`,
      orgId: orgAId,
      userId: 'doctor-a-uid',
      email: 'doctor@alphahealth.com',
      orgRole: 'doctor',
      assignedClinicIds: ['clinic-a1', 'clinic-a2'],
      activeClinicId: 'clinic-a1',
      status: 'active'
    });

    // Doctor A switches active clinic from clinic-a1 to clinic-a2
    const switchRes = await request('POST', `/api/org/${orgAId}/switch-clinic`, 'doctor-a-token', {
      targetClinicId: 'clinic-a2'
    });
    assert.equal(switchRes.status, 200, `Switch clinic failed: ${JSON.stringify(switchRes.body)}`);
    assert.equal(switchRes.body.activeClinicId, 'clinic-a2');
    assert.equal(docs.org_memberships.get(`${orgAId}_doctor-a-uid`).activeClinicId, 'clinic-a2');

    // Doctor A attempts to switch to Clinic B1 (belonging to Org B): must be rejected
    const illegalSwitchForeign = await request('POST', `/api/org/${orgAId}/switch-clinic`, 'doctor-a-token', {
      targetClinicId: 'clinic-b1'
    });
    assert.equal(illegalSwitchForeign.status, 404, 'Switch to foreign organization clinic must be denied');

    console.log('  ✓ Multi-clinic provisioning and authorized clinic switching verified.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Membership Management (Invitations, Roles & Isolation)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Membership Management (Invitations, Roles & Independence)');

    // Org Admin A invites a new doctor with assignment to clinic-a1
    const inviteRes = await request('POST', `/api/org/${orgAId}/members/invite`, 'org-a-admin-token', {
      userId: 'new-member-uid',
      email: 'newdoc@alphahealth.com',
      orgRole: 'doctor',
      assignedClinicIds: ['clinic-a1']
    });
    assert.equal(inviteRes.status, 201);
    assert.equal(inviteRes.body.membership.orgRole, 'doctor');

    // Org Admin A updates the member's role to clinic_admin
    const updateMemRes = await request('PUT', `/api/org/${orgAId}/members/new-member-uid`, 'org-a-admin-token', {
      orgRole: 'clinic_admin',
      assignedClinicIds: ['clinic-a1', 'clinic-a2']
    });
    assert.equal(updateMemRes.status, 200);
    assert.equal(updateMemRes.body.membership.orgRole, 'clinic_admin');

    // Org Admin A removes member
    const deleteMemRes = await request('DELETE', `/api/org/${orgAId}/members/new-member-uid`, 'org-a-admin-token');
    assert.equal(deleteMemRes.status, 200);
    assert.equal(docs.org_memberships.has(`${orgAId}_new-member-uid`), false);

    // Verify Org B's memberships remain completely isolated and intact
    const listBMembers = await request('GET', `/api/org/${orgBId}/members`, 'org-b-admin-token');
    assert.equal(listBMembers.status, 200);
    assert.ok(listBMembers.body.members.every(m => m.orgId === orgBId));

    console.log('  ✓ Member invitations, role modifications, and removals operate independently.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Billing & Independent Usage-Limit Enforcement
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Billing & Independent Usage-Limit Enforcement');

    // Record Assessment 1 for Org A (Limit is 2)
    const assess1 = await request('POST', `/api/org/${orgAId}/record-assessment`, 'doctor-a-token');
    assert.equal(assess1.status, 200);
    assert.equal(assess1.body.currentUsage, 1);
    assert.equal(assess1.body.remaining, 1);

    // Record Assessment 2 for Org A (Usage reaches limit of 2)
    const assess2 = await request('POST', `/api/org/${orgAId}/record-assessment`, 'doctor-a-token');
    assert.equal(assess2.status, 200);
    assert.equal(assess2.body.currentUsage, 2);
    assert.equal(assess2.body.remaining, 0);

    // Record Assessment 3 for Org A: Exceeds quota -> Must receive 402 USAGE_LIMIT_EXCEEDED
    const assess3Exceeded = await request('POST', `/api/org/${orgAId}/record-assessment`, 'doctor-a-token');
    assert.equal(assess3Exceeded.status, 402, 'Assessment exceeding monthly limit must return HTTP 402');
    assert.equal(assess3Exceeded.body.error, 'USAGE_LIMIT_EXCEEDED');

    // Setup Doctor B membership in Org B with assigned clinic clinic-b1
    docs.org_memberships.set(`${orgBId}_doctor-b-uid`, {
      id: `${orgBId}_doctor-b-uid`,
      orgId: orgBId,
      userId: 'doctor-b-uid',
      email: 'doctor@betamed.com',
      orgRole: 'doctor',
      assignedClinicIds: ['clinic-b1'],
      activeClinicId: 'clinic-b1',
      status: 'active'
    });

    // Org B is on Enterprise plan (50,000 quota) and records assessment without interference
    const assessB = await request('POST', `/api/org/${orgBId}/record-assessment`, 'doctor-b-token');
    assert.equal(assessB.status, 200, `Assess B failed: ${JSON.stringify(assessB.body)}`);
    assert.equal(assessB.body.currentUsage, 1);
    assert.equal(docs.organizations.get(orgAId).billing.currentAssessmentUsage, 2, 'Org A usage counter unchanged');

    // Org Admin A upgrades Org A to Enterprise plan
    const upgradeRes = await request('PUT', `/api/org/${orgAId}/billing/plan`, 'org-a-admin-token', {
      plan: 'enterprise',
      contractDetails: {
        contractId: 'CTR-ENT-ALPHA-UPGRADE',
        terms: 'Enterprise SLA & 50K Monthly Assessments'
      }
    });
    assert.equal(upgradeRes.status, 200);
    assert.equal(upgradeRes.body.plan, 'enterprise');

    // Now Org A can record assessments again with expanded limit
    const assessAfterUpgrade = await request('POST', `/api/org/${orgAId}/record-assessment`, 'doctor-a-token');
    assert.equal(assessAfterUpgrade.status, 200);
    assert.equal(assessAfterUpgrade.body.currentUsage, 3);
    assert.equal(assessAfterUpgrade.body.limit, 50000);

    console.log('  ✓ Independent quota counters, 402 usage limit guards, and plan upgrades verified.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Aggregate-Report Management with Strict Segregation
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Aggregate-Report Management with Strict Multi-Tenant Segregation');

    // Populate cases across clinics:
    // Org A cases
    docs.cases.set('case-a1-1', { id: 'case-a1-1', orgId: orgAId, clinicId: 'clinic-a1', status: 'approved', doctorApproved: true, triageLevel: 'high', submittedAt: 1000, approvedAt: 2000 });
    docs.cases.set('case-a1-2', { id: 'case-a1-2', orgId: orgAId, clinicId: 'clinic-a1', status: 'submitted', triageLevel: 'moderate', submittedAt: 1000 });
    docs.cases.set('case-a2-1', { id: 'case-a2-1', orgId: orgAId, clinicId: 'clinic-a2', status: 'approved', doctorApproved: true, triageLevel: 'emergency', submittedAt: 1000, approvedAt: 3000 });
    // Org B cases
    docs.cases.set('case-b1-1', { id: 'case-b1-1', orgId: orgBId, clinicId: 'clinic-b1', status: 'approved', doctorApproved: true, triageLevel: 'low', submittedAt: 1000, approvedAt: 1500 });

    // Request aggregate report for Org A
    const reportARes = await request('GET', `/api/org/${orgAId}/reports/aggregate`, 'org-a-admin-token');
    assert.equal(reportARes.status, 200);
    const repA = reportARes.body;
    assert.equal(repA.aggregateMetrics.totalCases, 3, 'Org A must have exactly 3 cases');
    assert.equal(repA.aggregateMetrics.completedCasesCount, 2);
    assert.equal(repA.aggregateMetrics.highRiskCasesCount, 2); // 1 emergency + 1 high
    assert.ok(repA.clinicBreakdown['clinic-a1']);
    assert.ok(repA.clinicBreakdown['clinic-a2']);
    assert.equal(repA.clinicBreakdown['clinic-b1'], undefined, 'Clinic B1 must NEVER appear in Org A aggregate breakdown');

    // Request aggregate report for Org B
    const reportBRes = await request('GET', `/api/org/${orgBId}/reports/aggregate`, 'org-b-admin-token');
    assert.equal(reportBRes.status, 200);
    const repB = reportBRes.body;
    assert.equal(repB.aggregateMetrics.totalCases, 1, 'Org B must have exactly 1 case');
    assert.ok(repB.clinicBreakdown['clinic-b1']);
    assert.equal(repB.clinicBreakdown['clinic-a1'], undefined);

    console.log('  ✓ Cross-clinic aggregate reports roll up cleanly without cross-tenant data leaks.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Branding, Domain & Messaging Without Secret Leakage
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Per-Organization Branding, Domain & Messaging Without Secret Leakage');

    // Update branding for Org A
    const brandUpdate = await request('PUT', `/api/org/${orgAId}/branding`, 'org-a-admin-token', {
      brandName: 'Alpha Health Advanced Care',
      primaryColor: '#059669',
      logoUrl: 'https://cdn.alphahealth.com/logo.png',
      portalTitle: 'Alpha Health Smart Clinical Portal'
    });
    assert.equal(brandUpdate.status, 200);

    // Public lookup via custom domain
    const publicDomainLookup = await request('GET', '/api/public/branding?domain=health.alphahealth.com');
    assert.equal(publicDomainLookup.status, 200);
    assert.equal(publicDomainLookup.body.branding.brandName, 'Alpha Health Advanced Care');
    assert.equal(publicDomainLookup.body.branding.primaryColor, '#059669');
    assert.equal(publicDomainLookup.body.branding.logoUrl, 'https://cdn.alphahealth.com/logo.png');

    // Public lookup via slug
    const publicSlugLookup = await request('GET', '/api/public/branding?slug=alpha-health');
    assert.equal(publicSlugLookup.status, 200);
    assert.equal(publicSlugLookup.body.orgId, orgAId);

    // CRITICAL SECURITY ASSERTION: Zero secrets exposed in public branding!
    const serializedPublic = JSON.stringify(publicDomainLookup.body);
    assert.ok(!serializedPublic.includes('sk_live_alpha_secret_key_12345'), 'API key MUST NOT be present in public branding endpoint');
    assert.ok(!serializedPublic.includes('messagingSecrets'), 'messagingSecrets must not be exposed');
    assert.ok(!serializedPublic.includes('billing'), 'Billing data must not be leaked publicly');

    // Admin messaging endpoint returns masked API key preview
    const messagingRes = await request('GET', `/api/org/${orgAId}/messaging`, 'org-a-admin-token');
    assert.equal(messagingRes.status, 200);
    assert.equal(messagingRes.body.messaging.maskedApiKey, 'sk_l****2345');
    assert.ok(!JSON.stringify(messagingRes.body).includes('sk_live_alpha_secret_key_12345'), 'Plaintext secret never returned');

    console.log('  ✓ Public branding resolution verified and sensitive credentials strictly shielded.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: B2B vs Enterprise Custom Integrations (According to Contract)
    // -------------------------------------------------------------------------
    console.log('▶ TEST 7: Custom Integrations & Contract Entitlements (FHIR / HL7 / Webhook)');

    // Create a basic Starter Org (no enterprise contract)
    const starterOrgRes = await request('POST', '/api/org/create', 'super-admin-token', {
      name: 'Solo Practice Clinic',
      slug: 'solo-practice',
      plan: 'starter'
    });
    assert.equal(starterOrgRes.status, 201);
    const starterOrgId = starterOrgRes.body.orgId;

    // Starter plan attempts to configure custom FHIR integration: Must receive 403 UPGRADE_REQUIRED
    const unauthorizedInteg = await request('POST', `/api/org/${starterOrgId}/integrations/custom`, 'super-admin-token', {
      integrationType: 'FHIR_R4',
      name: 'Hospital Epic EMR Link',
      targetEndpoint: 'https://fhir.hospital.org/r4'
    });
    assert.equal(unauthorizedInteg.status, 403, 'Starter plan cannot configure custom enterprise integrations');
    assert.equal(unauthorizedInteg.body.error, 'UPGRADE_REQUIRED');

    // Enterprise Org B configures custom FHIR R4 integration under its Enterprise contract
    const fhirIntegRes = await request('POST', `/api/org/${orgBId}/integrations/custom`, 'org-b-admin-token', {
      integrationType: 'FHIR_R4',
      name: 'Beta Cerner Millenium Interop',
      targetEndpoint: 'https://cerner-fhir.betahospital.org/r4',
      eventSubscriptions: ['CASE_APPROVED', 'PATIENT_TRIAGE_EMERGENCY'],
      signingSecret: 'hmac_signing_secret_9988776655'
    });
    assert.equal(fhirIntegRes.status, 201);
    const integId = fhirIntegRes.body.integration.integrationId;
    assert.ok(integId);
    assert.equal(fhirIntegRes.body.integration.integrationType, 'FHIR_R4');
    assert.equal(fhirIntegRes.body.integration.maskedSecret, 'hmac****6655');

    // Verify signing secret stored in org_private_config and not leaked
    const privateConfigB = docs.org_private_config.get(orgBId);
    assert.equal(privateConfigB.integrationSecrets[integId].signingSecret, 'hmac_signing_secret_9988776655');

    // Test integration connection handshake
    const testHandshake = await request('POST', `/api/org/${orgBId}/integrations/${integId}/test`, 'org-b-admin-token');
    assert.equal(testHandshake.status, 200);
    assert.equal(testHandshake.body.status, 'CONNECTED');

    console.log('  ✓ Contract-bound enterprise integrations (FHIR/HL7) and secure secrets verified.\n');
    passedTests++;

    console.log('================================================================================');
    console.log(`🎉 ALL ${passedTests} MULTI-TENANT ENTERPRISE & B2B TESTS PASSED WITH 100% SUCCESS!`);
    console.log('================================================================================\n');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => {
  console.error('Multi-tenant test suite error:', err);
  process.exitCode = 1;
});
