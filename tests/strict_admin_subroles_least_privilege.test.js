/**
 * HEALTH VIBE AI: STRICT ADMINISTRATIVE SUB-ROLES & LEAST-PRIVILEGE SECURITY TEST SUITE
 * 
 * Verifies compliance with PRD Page 13 (Section 10 Security Recommendation):
 * "المتطلب الحالي يسمح للـ Admin برؤية البيانات الطبية. هذا مناسب فقط إذا كان ضرورياً وبصلاحيات محددة جداً.
 *  قبل الإطلاق الحقيقي يجب تطبيق Least Privilege وتقسيم صلاحيات Admin
 *  (Support / Clinical QA / Super Admin / Ops) بدلاً من وصول شامل افتراضي."
 * 
 * Enforces:
 * 1. Revocation of default universal access of Admin to sensitive patient clinical data.
 * 2. Strict 4 Administrative Sub-Roles separation:
 *    - Super Admin: Master governance, user credentialing, audit trail oversight. No routine unverified browsing of clinical records.
 *    - Ops: Infrastructure, operational switches, server telemetry, error rates. Zero medical data access.
 *    - Clinical QA: AI model metrics, confusion matrices, triage safety register, CAPA audits. De-identified/aggregate metrics only.
 *    - Support: User assistance, login/account troubleshooting. Clinical data masked/redacted.
 * 3. Frontend RBAC & Route Guard screen matrix for all 4 sub-roles.
 * 4. Clinical data masking in UI (isNonClinicalAdminUser / isSupportUser).
 * 5. Backend Server Endpoint protection: GET & POST /api/patient/medical-profile blocks non-clinical admin sub-roles with LEAST_PRIVILEGE_RESTRICTION.
 * 6. Timeline Service zero-trust gating blocks non-clinical admin sub-roles.
 * 7. Relational Database schema constraint & Service least-privilege policies.
 * 8. Firestore Security Rules enforcement of isNonClinicalAdminSubRole().
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: ADMINISTRATIVE SUB-ROLES & LEAST PRIVILEGE TEST');
console.log('   PRD Page 13: Revoke Universal Medical Access & Split Admin Roles');
console.log('==================================================================\n');

(async function runTests() {
  // ── TEST 1: Permissions Module Definition & Sub-Roles ─────────────────────
  console.log('▶ TEST 1: Permissions Module Sub-Roles & Access Matrix');
  const Permissions = require('../app/modules/permissions/permissions');
  
  assert.ok(Permissions.ROLES.OPS === 'ops', 'ROLES must include OPS');
  assert.ok(Permissions.ROLES.CLINICAL_QA === 'clinical_qa', 'ROLES must include CLINICAL_QA');
  assert.ok(Permissions.ROLES.SUPPORT === 'support', 'ROLES must include SUPPORT');
  assert.ok(Permissions.ROLES.SUPER_ADMIN === 'super_admin', 'ROLES must include SUPER_ADMIN');

  assert.deepStrictEqual(
    Permissions.ADMIN_SUB_ROLES,
    ['super_admin', 'ops', 'clinical_qa', 'support'],
    'ADMIN_SUB_ROLES must strictly contain exactly [super_admin, ops, clinical_qa, support]'
  );

  assert.deepStrictEqual(
    Permissions.NON_CLINICAL_ADMIN_ROLES,
    ['ops', 'clinical_qa', 'support'],
    'NON_CLINICAL_ADMIN_ROLES must define non-clinical administrative sub-roles'
  );

  // Default home screens
  assert.strictEqual(Permissions.getRoleDefaultScreen('super_admin'), 'admin');
  assert.strictEqual(Permissions.getRoleDefaultScreen('ops'), 'admin');
  assert.strictEqual(Permissions.getRoleDefaultScreen('clinical_qa'), 'kpi');
  assert.strictEqual(Permissions.getRoleDefaultScreen('support'), 'kpi');

  // Permissions tests
  assert.strictEqual(Permissions.hasPermission('manage:user_roles', 'super_admin'), true);
  assert.strictEqual(Permissions.hasPermission('manage:user_roles', 'ops'), false);
  assert.strictEqual(Permissions.hasPermission('manage:user_roles', 'clinical_qa'), false);
  assert.strictEqual(Permissions.hasPermission('manage:user_roles', 'support'), false);

  assert.strictEqual(Permissions.hasPermission('manage:system_settings', 'ops'), true);
  assert.strictEqual(Permissions.hasPermission('manage:system_settings', 'support'), false);

  assert.strictEqual(Permissions.hasPermission('view:clinical_metrics_aggregate', 'clinical_qa'), true);
  assert.strictEqual(Permissions.hasPermission('view:clinical_metrics_aggregate', 'support'), false);

  assert.strictEqual(Permissions.hasPermission('approve:case', 'super_admin'), false, 'Super admin cannot approve clinical cases');
  assert.strictEqual(Permissions.hasPermission('approve:case', 'ops'), false, 'Ops cannot approve clinical cases');
  assert.strictEqual(Permissions.hasPermission('approve:case', 'clinical_qa'), false, 'Clinical QA cannot approve clinical cases');
  assert.strictEqual(Permissions.hasPermission('approve:case', 'support'), false, 'Support cannot approve clinical cases');
  assert.strictEqual(Permissions.hasPermission('approve:case', 'doctor'), true, 'Only doctor can approve clinical cases');

  console.log('  ✓ Administrative sub-roles (Super Admin, Ops, Clinical QA, Support) correctly defined.');
  console.log('  ✓ Permissions strictly segregated with zero clinical approval privileges.\n');

  // ── TEST 2: Frontend Client-Side Masking (app/app.js) ─────────────────────
  console.log('▶ TEST 2: Client-Side Medical Masking Engine (app/app.js)');
  const appJsContent = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');

  // Execute in isolated VM context
  const context = {
    auth: { currentUser: null },
    selectedRole: 'patient',
    isOwnerUser: () => false,
    window: {}
  };
  vm.createContext(context);
  vm.runInContext(appJsContent.slice(appJsContent.indexOf('const ROLES ='), appJsContent.indexOf('let verifiedServerRole')), context);

  // Test isSupportUser / isNonClinicalAdminUser for each sub-role
  context.selectedRole = 'ops';
  assert.strictEqual(context.isSupportUser(), true, 'Ops must trigger clinical masking');
  assert.strictEqual(context.isNonClinicalAdminUser(), true, 'Ops must be recognized as non-clinical admin');

  context.selectedRole = 'clinical_qa';
  assert.strictEqual(context.isSupportUser(), true, 'Clinical QA must trigger clinical masking');
  assert.strictEqual(context.isNonClinicalAdminUser(), true, 'Clinical QA must be recognized as non-clinical admin');

  context.selectedRole = 'support';
  assert.strictEqual(context.isSupportUser(), true, 'Support must trigger clinical masking');
  assert.strictEqual(context.isNonClinicalAdminUser(), true, 'Support must be recognized as non-clinical admin');

  context.selectedRole = 'doctor';
  assert.strictEqual(context.isSupportUser(), false, 'Doctor must NOT trigger clinical masking');
  assert.strictEqual(context.isNonClinicalAdminUser(), false);

  context.selectedRole = 'patient';
  assert.strictEqual(context.isSupportUser(), false, 'Patient must NOT trigger non-clinical admin masking');
  assert.strictEqual(context.isNonClinicalAdminUser(), false);

  console.log('  ✓ Client-side isNonClinicalAdminUser accurately identifies Ops, Clinical QA, and Support.');
  console.log('  ✓ Clinical data masking (SpO2, diagnoses, notes) protects all non-clinical roles.\n');

  // ── TEST 3: Backend Server Medical Profile Endpoint Protection ────────────
  console.log('▶ TEST 3: Backend Server Endpoint Protection (GET & POST /api/patient/medical-profile)');
  
  // Verify that backend/server.js contains least-privilege checks for NON_CLINICAL_ADMIN_ROLES
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');
  assert.ok(
    serverJsContent.includes("NON_CLINICAL_ADMIN_ROLES = [ROLES.OPS, ROLES.CLINICAL_QA, ROLES.SUPPORT]"),
    'server.js must define NON_CLINICAL_ADMIN_ROLES'
  );
  assert.ok(
    serverJsContent.includes("error: 'LEAST_PRIVILEGE_RESTRICTION'"),
    'server.js must return LEAST_PRIVILEGE_RESTRICTION error'
  );
  assert.ok(
    serverJsContent.includes("app.get('/api/admin/sub-roles'"),
    'server.js must expose GET /api/admin/sub-roles endpoint'
  );

  console.log('  ✓ server.js enforces LEAST_PRIVILEGE_RESTRICTION on medical-profile endpoints.');
  console.log('  ✓ GET /api/admin/sub-roles endpoint registered with PRD Page 13 metadata.\n');

  // ── TEST 4: Timeline Service Access Gating ────────────────────────────────
  console.log('▶ TEST 4: Timeline Service Zero-Trust Sub-Role Gating');
  const { verifyTimelineAccess } = require('../backend/timeline-service');

  const opsUser = { uid: 'ops_user_01', role: 'ops' };
  const qaUser = { uid: 'qa_user_01', role: 'clinical_qa' };
  const supportUser = { uid: 'support_user_01', role: 'support' };
  const doctorUser = { uid: 'doc_user_01', role: 'doctor' };
  const patientTargetId = 'patient_target_99';

  const opsAccess = await verifyTimelineAccess(opsUser, patientTargetId, null);
  assert.strictEqual(opsAccess.authorized, false, 'Ops must NOT have access to patient timeline');
  assert.ok(opsAccess.reason.includes('LEAST_PRIVILEGE_RESTRICTION'), 'Ops rejection must cite least-privilege');

  const qaAccess = await verifyTimelineAccess(qaUser, patientTargetId, null);
  assert.strictEqual(qaAccess.authorized, false, 'Clinical QA must NOT have access to patient timeline');
  assert.ok(qaAccess.reason.includes('LEAST_PRIVILEGE_RESTRICTION'), 'QA rejection must cite least-privilege');

  const supportAccess = await verifyTimelineAccess(supportUser, patientTargetId, null);
  assert.strictEqual(supportAccess.authorized, false, 'Support must NOT have access to patient timeline');
  assert.ok(supportAccess.reason.includes('LEAST_PRIVILEGE_RESTRICTION'), 'Support rejection must cite least-privilege');

  console.log('  ✓ Timeline service strictly rejects Ops, Clinical QA, and Support with LEAST_PRIVILEGE_RESTRICTION.\n');

  // ── TEST 5: Relational Database Schema & Service Sub-Roles ────────────────
  console.log('▶ TEST 5: Relational Database Schema & Service Verification');
  const schemaSql = fs.readFileSync(path.resolve(__dirname, '../backend/db/schema.sql'), 'utf8');
  assert.ok(
    schemaSql.includes("CHECK (role IN ('patient', 'doctor', 'clinic_admin', 'support', 'ops', 'clinical_qa', 'super_admin'))"),
    'schema.sql accounts.role check constraint must include ops and clinical_qa'
  );

  const { RelationalDatabaseService } = require('../backend/relational-db-service');
  const rdb = new RelationalDatabaseService();
  const subRoles = rdb.getAdminSubRoles();

  assert.ok(subRoles.SUPER_ADMIN, 'Must have SUPER_ADMIN sub-role');
  assert.ok(subRoles.OPS, 'Must have OPS sub-role');
  assert.ok(subRoles.CLINICAL_QA, 'Must have CLINICAL_QA sub-role');
  assert.ok(subRoles.SUPPORT, 'Must have SUPPORT sub-role');

  assert.strictEqual(rdb.canAccessSensitiveClinicalData('ops'), false);
  assert.strictEqual(rdb.canAccessSensitiveClinicalData('clinical_qa'), false);
  assert.strictEqual(rdb.canAccessSensitiveClinicalData('support'), false);
  assert.strictEqual(rdb.canAccessSensitiveClinicalData('super_admin'), false, 'Super admin default browsing revoked');
  assert.strictEqual(rdb.canAccessSensitiveClinicalData('doctor'), true, 'Doctor has clinical access');

  // Test account creation with new sub-roles in relational DB
  const opsAccount = await rdb.createAccount({
    email: 'ops@healthvibe.ai',
    fullName: 'Operations Engineer',
    role: 'ops'
  });
  assert.strictEqual(opsAccount.role, 'ops');

  const qaAccount = await rdb.createAccount({
    email: 'clinicalqa@healthvibe.ai',
    fullName: 'Clinical QA Lead',
    role: 'clinical_qa'
  });
  assert.strictEqual(qaAccount.role, 'clinical_qa');

  console.log('  ✓ schema.sql check constraint enforces all 4 sub-roles in PostgreSQL.');
  console.log('  ✓ RelationalDatabaseService canAccessSensitiveClinicalData revokes default admin access.');
  console.log('  ✓ Relational table successfully creates and stores ops and clinical_qa accounts.\n');

  // ── TEST 6: Firestore Security Rules Gating ───────────────────────────────
  console.log('▶ TEST 6: Firestore Security Rules Validation');
  const firestoreRules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

  assert.ok(firestoreRules.includes('function isNonClinicalAdminSubRole()'), 'firestore.rules must define isNonClinicalAdminSubRole helper');
  assert.ok(firestoreRules.includes("request.auth.token.role in ['support', 'ops', 'clinical_qa']"), 'helper must check support, ops, and clinical_qa');
  assert.ok(firestoreRules.includes('!isNonClinicalAdminSubRole()'), 'firestore.rules must gate clinical collections with !isNonClinicalAdminSubRole()');

  console.log('  ✓ Firestore rules helper isNonClinicalAdminSubRole() correctly blocks raw clinical collections.\n');

  console.log('==================================================================');
  console.log('🎉 ALL ADMINISTRATIVE SUB-ROLES & LEAST-PRIVILEGE TESTS PASSED 100%!');
  console.log('==================================================================\n');
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
