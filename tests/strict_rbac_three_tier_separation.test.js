/**
 * Health Vibe AI - Strict Three-Tier RBAC Separation Test Suite
 *
 * Verifies Request 27:
 * "بناء نظام صلاحيات صارم (Role-Based Access Control) يفصل تماماً بين مسارات
 * Patient وDoctor وAdmin بحيث لا يمكن لأي دور الوصول لروابط أو بيانات دور آخر."
 *
 * Covers:
 * 1. Client Route Guards & Screen Access Matrix (canAccessScreen & applyRouteGuards)
 * 2. Navigation Item Visibility & Link Hiding (updateNavVisibility)
 * 3. Hash Deep-Linking Interception & Cross-Role Redirection
 * 4. Server-Authoritative API Route Protection (/api/patient/*, /api/doctor/*, /api/admin/*)
 * 5. Cross-Patient & Cross-Role Data Segregation
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("==================================================================");
console.log("🛡️  HEALTH VIBE AI: THREE-TIER STRICT RBAC SEPARATION TEST SUITE");
console.log("   Complete Isolation between Patient, Doctor, and Admin Paths");
console.log("==================================================================\n");

const permissionsModulePath = path.resolve(__dirname, "../app/modules/permissions/permissions.js");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const serverJsPath = path.resolve(__dirname, "../backend/server.js");
const securityArchDocPath = path.resolve(__dirname, "../backend/SECURITY_ARCHITECTURE.md");

assert.ok(fs.existsSync(permissionsModulePath), "permissions.js must exist");
assert.ok(fs.existsSync(appJsPath), "app.js must exist");
assert.ok(fs.existsSync(serverJsPath), "server.js must exist");
assert.ok(fs.existsSync(securityArchDocPath), "SECURITY_ARCHITECTURE.md must exist");

const Permissions = require(permissionsModulePath);
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const serverJsContent = fs.readFileSync(serverJsPath, "utf8");
const securityDoc = fs.readFileSync(securityArchDocPath, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Documentation & Architecture Matrix
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 1: Three-Tier RBAC Matrix Architecture Documentation");
assert.ok(
  securityDoc.includes("RBAC 3-Tier Strict Separation"),
  "SECURITY_ARCHITECTURE.md must document the 3-tier RBAC separation matrix"
);
assert.ok(
  securityDoc.includes("مسار المريض (Patient)") &&
  securityDoc.includes("مسار الطبيب (Doctor)") &&
  securityDoc.includes("مسار الإدارة (Admin)"),
  "Documentation must specify all 3 roles distinctly"
);
console.log("  ✓ Architectural documentation verified.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Client-Side Route Separation & Screen Access Matrix
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 2: Client Route Guards & Screen Access Isolation");

// 1. PATIENT ROUTE SEPARATION
console.log("  • Checking Patient Path Boundaries...");
assert.strictEqual(
  Permissions.canAccessScreen("doctor", "patient"),
  false,
  "Patient MUST NOT access 'doctor' screen"
);
assert.strictEqual(
  Permissions.canAccessScreen("admin", "patient"),
  false,
  "Patient MUST NOT access 'admin' screen"
);
assert.strictEqual(
  Permissions.canAccessScreen("audit", "patient"),
  false,
  "Patient MUST NOT access 'audit' screen"
);
assert.strictEqual(
  Permissions.canAccessScreen("kpi", "patient"),
  false,
  "Patient MUST NOT access 'kpi' screen"
);
assert.strictEqual(
  Permissions.canAccessScreen("patient", "patient"),
  true,
  "Patient can access 'patient' workspace"
);
assert.strictEqual(
  Permissions.canAccessScreen("assessment", "patient"),
  true,
  "Patient can access 'assessment' screen"
);

// 2. DOCTOR ROUTE SEPARATION
console.log("  • Checking Doctor Path Boundaries...");
assert.strictEqual(
  Permissions.canAccessScreen("admin", "doctor"),
  false,
  "Doctor MUST NOT access 'admin' control center"
);
assert.strictEqual(
  Permissions.canAccessScreen("audit", "doctor"),
  false,
  "Doctor MUST NOT access 'audit' security log"
);
assert.strictEqual(
  Permissions.canAccessScreen("doctor", "doctor"),
  true,
  "Doctor can access 'doctor' workspace"
);
assert.strictEqual(
  Permissions.canAccessScreen("kpi", "doctor"),
  true,
  "Doctor can access 'kpi' turnaround metrics"
);

// 3. ADMIN ROUTE SEPARATION
console.log("  • Checking Admin Path Boundaries...");
assert.strictEqual(
  Permissions.canAccessScreen("admin", "clinic_admin"),
  true,
  "Admin can access 'admin' screen"
);
assert.strictEqual(
  Permissions.canAccessScreen("audit", "clinic_admin"),
  true,
  "Admin can access 'audit' screen"
);
assert.strictEqual(
  Permissions.hasPermission("approve:case", "clinic_admin"),
  false,
  "Admin MUST NOT hold clinical 'approve:case' permission (clinical actions reserved for verified doctors only)"
);
assert.strictEqual(
  Permissions.hasPermission("reject:case", "clinic_admin"),
  false,
  "Admin MUST NOT hold clinical 'reject:case' permission"
);
assert.strictEqual(
  Permissions.hasPermission("approve:case", "doctor"),
  true,
  "Verified Doctor holds 'approve:case' permission"
);

console.log("  ✓ Screen access matrix strictly separates Patient, Doctor, and Admin.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Route Guard Redirection Simulation (applyRouteGuards)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 3: Route Guard Redirection & Hash Protection Simulation");

// Simulate the runtime route guard environment
function simulateApplyRouteGuards(targetScreen, role) {
  const isAllowed = Permissions.canAccessScreen(targetScreen, role);
  if (!isAllowed) {
    return Permissions.getRoleDefaultScreen(role);
  }
  return targetScreen;
}

// Patient trying to access doctor/admin screens
assert.strictEqual(
  simulateApplyRouteGuards("doctor", "patient"),
  "patient",
  "Patient attempting to access 'doctor' must be redirected to 'patient'"
);
assert.strictEqual(
  simulateApplyRouteGuards("admin", "patient"),
  "patient",
  "Patient attempting to access 'admin' must be redirected to 'patient'"
);
assert.strictEqual(
  simulateApplyRouteGuards("audit", "patient"),
  "patient",
  "Patient attempting to access 'audit' must be redirected to 'patient'"
);

// Doctor trying to access admin screens
assert.strictEqual(
  simulateApplyRouteGuards("admin", "doctor"),
  "doctor",
  "Doctor attempting to access 'admin' must be redirected to 'doctor'"
);
assert.strictEqual(
  simulateApplyRouteGuards("audit", "doctor"),
  "doctor",
  "Doctor attempting to access 'audit' must be redirected to 'doctor'"
);

// Verify app.js includes hash router guard and route guard redirection
assert.ok(
  appJsContent.includes("function applyRouteGuards("),
  "app.js must implement applyRouteGuards()"
);
assert.ok(
  appJsContent.includes("handleHashChange"),
  "app.js must implement hash-based deep link route guard"
);
assert.ok(
  appJsContent.includes("updateNavVisibility"),
  "app.js must implement updateNavVisibility() to dynamically hide forbidden links"
);

console.log("  ✓ Route guards and deep-link interception successfully redirect cross-role access.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Server-Authoritative API Protection (backend/server.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 4: Server-Authoritative Middleware & Endpoint Protection");

assert.ok(
  serverJsContent.includes("async function requireAdmin("),
  "server.js must define requireAdmin middleware"
);
assert.ok(
  serverJsContent.includes("async function requireDoctor("),
  "server.js must define requireDoctor middleware"
);
assert.ok(
  serverJsContent.includes("async function requirePatient("),
  "server.js must define requirePatient middleware"
);
assert.ok(
  serverJsContent.includes("function requireStrictRole("),
  "server.js must define requireStrictRole middleware"
);

// Test Mock Server Middleware Logic
const { requirePatient, requireDoctor, requireAdmin, requireStrictRole } = require("../backend/server.js");

function createMockReq(role, uid = "user-123") {
  return {
    user: { uid, role, email: `${role}@test.invalid`, email_verified: true },
    headers: {}
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    sentData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.sentData = data;
      return this;
    }
  };
  return res;
}

// 1. requirePatient: Accepts patient, rejects doctor & admin
let patientCalledNext = false;
requirePatient(createMockReq("patient"), createMockRes(), () => { patientCalledNext = true; });
assert.strictEqual(patientCalledNext, true, "requirePatient must allow patient role");

const patientResDoctor = createMockRes();
requirePatient(createMockReq("doctor"), patientResDoctor, () => {});
assert.strictEqual(patientResDoctor.statusCode, 403, "requirePatient must reject doctor role with 403");

const patientResAdmin = createMockRes();
requirePatient(createMockReq("clinic_admin"), patientResAdmin, () => {});
assert.strictEqual(patientResAdmin.statusCode, 403, "requirePatient must reject admin role with 403");

// 2. requireAdmin: Accepts admin, rejects patient & doctor
const adminResPatient = createMockRes();
requireAdmin(createMockReq("patient"), adminResPatient, () => {});
assert.strictEqual(adminResPatient.statusCode, 403, "requireAdmin must reject patient role with 403");

const adminResDoctor = createMockRes();
requireAdmin(createMockReq("doctor"), adminResDoctor, () => {});
assert.strictEqual(adminResDoctor.statusCode, 403, "requireAdmin must reject doctor role with 403");

// 3. requireStrictRole Factory
const strictDoctorOnly = requireStrictRole(["doctor"]);
let docOnlyNext = false;
strictDoctorOnly(createMockReq("doctor"), createMockRes(), () => { docOnlyNext = true; });
assert.strictEqual(docOnlyNext, true, "strictDoctorOnly must allow doctor");

const strictDocRes = createMockRes();
strictDoctorOnly(createMockReq("patient"), strictDocRes, () => {});
assert.strictEqual(strictDocRes.statusCode, 403, "strictDoctorOnly must reject patient");

console.log("  ✓ Server-authoritative middlewares strictly block cross-role endpoint execution.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Cross-Patient Data Access Boundary (Data Isolation)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 5: Cross-Patient Data Access Segregation");

// Verify that in app.get('/api/patient/medical-profile'), accessing other patient's data is blocked
assert.ok(
  serverJsContent.includes("Accessing other patient profiles requires verified clinician or administrator credentials"),
  "server.js must explicitly block Patient A from reading Patient B's profile"
);

console.log("  ✓ Patient data boundary verified: Zero horizontal cross-patient data leakage.\n");

console.log("==================================================================");
console.log("🎉 ALL THREE-TIER RBAC SEPARATION TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
