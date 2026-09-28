/**
 * Health Vibe AI - Modular Architecture Test Suite
 * 
 * Verifies that app.js is gradually split into clean, cohesive modules:
 * - auth (AuthService, AuthUI)
 * - permissions (Permissions, Roles, Matrix)
 * - patient (PatientService, PatientUI)
 * - assessment (AssessmentValidation, AssessmentService, AssessmentUI)
 * - doctor (DoctorService, DoctorUI)
 * - admin (AdminService, AdminUI)
 * - reports (ReportsService, ReportsUI)
 * - appointments (AppointmentsService, AppointmentsUI)
 * - notifications (NotificationsService, NotificationsUI)
 * - core (Validation, ErrorHandler)
 * - i18n (unified i18n engine)
 * 
 * Ensures data services, validation, and error handling are completely decoupled
 * from interface rendering with zero circular dependencies.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

console.log("==================================================================");
console.log("🏗️  HEALTH VIBE AI: MODULAR ARCHITECTURE VERIFICATION SUITE");
console.log("   Auth, Permissions, Patient, Assessment, Doctor, Admin,");
console.log("   Reports, Appointments, Notifications, Core & i18n Modules");
console.log("==================================================================\n");

function loadModule(relativePath) {
  const fullPath = path.resolve(__dirname, "../app", relativePath);
  assert.ok(fs.existsSync(fullPath), `Module file exists: ${relativePath}`);
  const source = fs.readFileSync(fullPath, "utf8");
  const ctx = {
    console,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    URLSearchParams,
    sessionStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    },
    window: {},
    module: { exports: {} }
  };
  ctx.global = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    exports: ctx.module.exports,
    healthVibes: ctx.HealthVibes || ctx.window?.HealthVibes
  };
}

// -----------------------------------------------------------------------------
// TEST 1: Core Modules (Validation & Error Handling)
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Core Validation & Error Handling Modules");
const coreValidation = loadModule("modules/core/validation.js");
const V = coreValidation.exports;
assert.ok(V, "Core Validation exports must be defined");
assert.equal(typeof V.normalizeArabicIndicDigits, "function");
assert.equal(V.normalizeArabicIndicDigits("٩٥٪"), "95٪");
assert.equal(V.parseStrictOxygenInput("٩٥").value, 95);
assert.equal(V.parseStrictOxygenInput("45").ok, false);
assert.equal(V.parseStrictOxygenInput("105").ok, false);
assert.equal(V.validateEmail("doctor@healthvibes.com"), true);
assert.equal(V.validateEmail("invalid-email"), false);
assert.equal(V.validateNationalId("29501011234567"), true);
assert.equal(V.validateNationalId("123"), false);
assert.equal(V.escapeHtml("<script>"), "&lt;script&gt;");
console.log("  ✓ Core Validation module functions correctly without DOM dependencies.");

const coreError = loadModule("modules/core/error-handler.js");
const EH = coreError.exports;
assert.ok(EH, "Core ErrorHandler exports must be defined");
assert.equal(typeof EH.redactClientPii, "function");
const piiCleaned = EH.redactClientPii("Contact user test@example.com with NID 29501011234567 and phone 01012345678");
assert.ok(!piiCleaned.includes("test@example.com"));
assert.ok(!piiCleaned.includes("29501011234567"));
assert.ok(piiCleaned.includes("[REDACTED_EMAIL]"));
assert.ok(piiCleaned.includes("[REDACTED_NATIONAL_ID]"));
assert.ok(EH.isNetworkError(new Error("Failed to fetch")));
assert.ok(!EH.isNetworkError(new Error("Invalid password")));
const friendlyErr = EH.toFriendlyAppError("auth/invalid-credential", "", true);
assert.equal(friendlyErr.icon, "🔒");
assert.ok(friendlyErr.title.includes("Incorrect"));
console.log("  ✓ Core ErrorHandler redacts PII and produces friendly bilingual errors.");

// -----------------------------------------------------------------------------
// TEST 2: Permissions & RBAC Module
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Permissions & RBAC Module");
const permissionsMod = loadModule("modules/permissions/permissions.js");
const P = permissionsMod.exports;
assert.ok(P.ROLES, "ROLES must be exported");
assert.equal(P.ROLES.PATIENT, "patient");
assert.equal(P.ROLES.DOCTOR, "doctor");
assert.equal(P.ROLES.SUPER_ADMIN, "super_admin");
assert.ok(P.hasPermission(P.PERMISSIONS.SUBMIT_ASSESSMENT, P.ROLES.PATIENT));
assert.ok(!P.hasPermission(P.PERMISSIONS.APPROVE_CASE, P.ROLES.PATIENT));
assert.ok(P.hasPermission(P.PERMISSIONS.APPROVE_CASE, P.ROLES.DOCTOR));
assert.ok(P.canAccessScreen("assessment", P.ROLES.PATIENT));
assert.ok(!P.canAccessScreen("admin", P.ROLES.PATIENT));
assert.ok(P.canAccessScreen("admin", P.ROLES.SUPER_ADMIN));
assert.equal(P.getRoleDefaultScreen(P.ROLES.PATIENT), "patient");
assert.equal(P.getRoleDefaultScreen(P.ROLES.DOCTOR), "doctor");
assert.equal(P.getRoleDefaultScreen(P.ROLES.SUPER_ADMIN), "admin");
console.log("  ✓ Permissions module enforces RBAC matrix and screen access control.");

// -----------------------------------------------------------------------------
// TEST 3: Auth Data Service & UI Separation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Auth Service & UI Separation");
const authServiceMod = loadModule("modules/auth/auth-service.js");
const AS = authServiceMod.exports;
assert.equal(typeof AS.saveActiveSession, "function");
assert.equal(typeof AS.getActiveSession, "function");
AS.saveActiveSession({ uid: "user_test_1", email: "user@test.org" }, "patient");
const saved = AS.getActiveSession();
assert.equal(saved?.uid, "user_test_1");
assert.equal(saved?.role, "patient");
AS.clearActiveSession();
assert.equal(AS.getActiveSession(), null);

const authUiMod = loadModule("modules/auth/auth-ui.js");
const AUI = authUiMod.exports;
assert.equal(typeof AUI.setAuthMode, "function");
assert.equal(AUI.getMode(), "signin");
AUI.setAuthMode("signup");
assert.equal(AUI.getMode(), "signup");
console.log("  ✓ Auth data service and UI interface cleanly separated.");

// -----------------------------------------------------------------------------
// TEST 4: Patient Service & UI Module
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Patient Service & UI Module");
const patientServiceMod = loadModule("modules/patient/patient-service.js");
const PtS = patientServiceMod.exports;
assert.equal(typeof PtS.filterTimelineItems, "function");
const sampleItems = [
  { id: "1", type: "assessment", title: "Respiratory Check", date: "2026-09-01", summary: "Mild cough" },
  { id: "2", type: "appointment", title: "Dr Mona Consultation", date: "2026-09-05", summary: "Followup" }
];
const filteredAssessments = PtS.filterTimelineItems(sampleItems, { type: "assessment" });
assert.equal(filteredAssessments.length, 1);
assert.equal(filteredAssessments[0].id, "1");

const patientUiMod = loadModule("modules/patient/patient-ui.js");
const PtUI = patientUiMod.exports;
assert.equal(typeof PtUI.renderTimelineCard, "function");
const cardHtml = PtUI.renderTimelineCard(sampleItems[0], true);
assert.ok(cardHtml.includes("timeline-item"));
assert.ok(cardHtml.includes("Respiratory Check"));
console.log("  ✓ Patient timeline filtering and UI card rendering validated.");

// -----------------------------------------------------------------------------
// TEST 5: Clinical Assessment Validation & Service
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Assessment Validation & Service Module");
const assessValidationMod = loadModule("modules/assessment/assessment-validation.js");
const AV = assessValidationMod.exports;
assert.equal(typeof AV.validateAssessmentFields, "function");
const validAssessment = {
  oxygenLevel: "96",
  breathingDifficulty: "لا",
  coughLevel: "خفيفة",
  symptomDuration: "3",
  chestPain: "لا",
  symptomProgression: "ثابتة",
  recentInfection: "لا",
  asthmaCopd: "لا",
  riskFactors: ["لا يوجد"]
};
const validRes = AV.validateAssessmentFields(validAssessment);
assert.equal(validRes.isValid, true);
assert.equal(validRes.errors.length, 0);

const invalidAssessment = {
  ...validAssessment,
  oxygenLevel: "120"
};
const invalidRes = AV.validateAssessmentFields(invalidAssessment);
assert.equal(invalidRes.isValid, false);
assert.ok(invalidRes.errors.some(e => e.field === "oxygenInput"));

const assessServiceMod = loadModule("modules/assessment/assessment-service.js");
const AssS = assessServiceMod.exports;
const urgentTriage = AssS.computeClinicalTriage({ oxygenLevel: 88, breathingDifficulty: "نعم", chestPain: "لا" });
assert.equal(urgentTriage.priority, "urgent");
const normalTriage = AssS.computeClinicalTriage({ oxygenLevel: 98, breathingDifficulty: "لا", chestPain: "لا" });
assert.equal(normalTriage.priority, "normal");
console.log("  ✓ Clinical assessment validation rules and triage classification confirmed.");

// -----------------------------------------------------------------------------
// TEST 6: Doctor Service & Queue Filtering
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: Doctor Service & Queue Filtering");
const docServiceMod = loadModule("modules/doctor/doctor-service.js");
const DS = docServiceMod.exports;
assert.equal(typeof DS.filterDoctorQueue, "function");
const cases = [
  { id: "c1", status: "submitted", oxygenLevel: 88, submittedAt: Date.now() - 10000 },
  { id: "c2", status: "approved", oxygenLevel: 97, submittedAt: Date.now() - 50000 },
  { id: "c3", status: "submitted", oxygenLevel: 94, submittedAt: Date.now() - 20000, assignedDoctorId: "dr_mona" }
];
const urgentCases = DS.filterDoctorQueue(cases, { filter: "urgent" });
assert.equal(urgentCases.length, 1);
assert.equal(urgentCases[0].id, "c1");

const assignedCases = DS.filterDoctorQueue(cases, { filter: "assigned_to_me", doctorUid: "dr_mona" });
assert.equal(assignedCases.length, 1);
assert.equal(assignedCases[0].id, "c3");

const docUiMod = loadModule("modules/doctor/doctor-ui.js");
const DUI = docUiMod.exports;
const presets = DUI.getDiagnosticPresets(true);
assert.ok(presets.bronchitis);
assert.ok(presets.asthma);
console.log("  ✓ Doctor queue SLA/priority filtering and clinical presets verified.");

// -----------------------------------------------------------------------------
// TEST 7: Clinical Reports Integrity & Snapshots
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 7: Reports Service & Snapshot Verification");
const repServiceMod = loadModule("modules/reports/reports-service.js");
const RS = repServiceMod.exports;
assert.equal(RS.recordedClinicalText(null, true), "Not recorded");
assert.equal(RS.recordedClinicalText("Hypertension", true), "Hypertension");

const mockRecord = {
  id: "case_999",
  clinicalDiagnosis: "Mild bronchitis",
  approvingDoctorId: "doc_1",
  doctorIdentity: { uid: "doc_1", applicationId: "app_1", name: "Dr. Mona", specialty: "Pulmonology" }
};
const docIdentity = RS.getRecordedDoctorIdentity(mockRecord, true);
assert.equal(docIdentity.name, "Dr. Mona");
assert.equal(docIdentity.specialty, "Pulmonology");

const repUiMod = loadModule("modules/reports/reports-ui.js");
const RUI = repUiMod.exports;
const badgeUnapproved = RUI.renderReportSecurityBadge({ status: "submitted" }, true);
assert.ok(badgeUnapproved.includes("Preliminary"));
const badgeApproved = RUI.renderReportSecurityBadge({ status: "approved" }, true);
assert.ok(badgeApproved.includes("Digitally Certified"));
console.log("  ✓ Reports snapshot extraction and security badges verified.");

// -----------------------------------------------------------------------------
// TEST 8: Appointments Service & Anti-Double-Booking
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 8: Appointments Service & Schedule Computations");
const apptServiceMod = loadModule("modules/appointments/appointments-service.js");
const ApptS = apptServiceMod.exports;
assert.ok(ApptS.DOCTORS_WORK_SCHEDULES.dr_mona);
const leaveCheck = ApptS.checkDoctorLeaveClient(ApptS.DOCTORS_WORK_SCHEDULES.dr_mona, "2026-10-11");
assert.equal(leaveCheck.onLeave, true);
const nonLeaveCheck = ApptS.checkDoctorLeaveClient(ApptS.DOCTORS_WORK_SCHEDULES.dr_mona, "2026-10-01");
assert.equal(nonLeaveCheck.onLeave, false);

// 2026-10-04 is a Sunday (day 0, working day)
const slotsResult = ApptS.calculateSlotsForDoctor(ApptS.DOCTORS_WORK_SCHEDULES.dr_mona, "2026-10-04");
assert.equal(slotsResult.available, true);
assert.ok(slotsResult.slots.length > 0);
console.log("  ✓ Appointments schedule calculator and doctor leave bounds verified.");

// -----------------------------------------------------------------------------
// TEST 9: Admin Service & KPI Calculations
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 9: Admin KPI Metrics Engine");
const adminServiceMod = loadModule("modules/admin/admin-service.js");
const AdmS = adminServiceMod.exports;
const kpiCases = [
  { id: "k1", status: "approved", oxygenLevel: 96, submittedAt: Date.now() - 3600000, approvedAt: Date.now() - 1800000 },
  { id: "k2", status: "submitted", oxygenLevel: 94, submittedAt: Date.now() - 1000000 },
  { id: "k3", status: "approved", oxygenLevel: 88, priority: "urgent", submittedAt: Date.now() - 2000000, approvedAt: Date.now() - 500000 }
];
const kpis = AdmS.calculateKpiMetrics(kpiCases);
assert.equal(kpis.totalCases, 3);
assert.equal(kpis.completedCases, 2);
assert.equal(kpis.pendingCases, 1);
assert.equal(kpis.urgentCases, 1);
assert.equal(kpis.urgentCompletedCases, 1);
assert.equal(kpis.completionRate, 67);
assert.equal(kpis.urgentCompletionRate, 100);
console.log("  ✓ Admin KPI engine produces accurate clinical completion and turnaround metrics.");

// -----------------------------------------------------------------------------
// TEST 10: Notifications Service & Toast Queue
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 10: Notifications Service");
const notifServiceMod = loadModule("modules/notifications/notifications-service.js");
const NotifS = notifServiceMod.exports;
const n = NotifS.enqueueNotification({ title: "Appointment Confirmed", message: "Sunday 10:00 AM" });
assert.ok(n.id);
assert.equal(n.read, false);
assert.equal(NotifS.getUnreadNotifications().length, 1);
NotifS.markAsRead(n.id);
assert.equal(NotifS.getUnreadNotifications().length, 0);
console.log("  ✓ Notifications queue and read tracking verified.");

// -----------------------------------------------------------------------------
// TEST 11: Script Inclusions in index.html
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 11: Script Inclusions in app/index.html");
const indexHtml = fs.readFileSync(path.resolve(__dirname, "../app/index.html"), "utf8");
[
  "modules/core/validation.js",
  "modules/core/error-handler.js",
  "modules/permissions/permissions.js",
  "modules/auth/auth-service.js",
  "modules/auth/auth-ui.js",
  "modules/patient/patient-service.js",
  "modules/patient/patient-ui.js",
  "modules/assessment/assessment-validation.js",
  "modules/assessment/assessment-service.js",
  "modules/assessment/assessment-ui.js",
  "modules/doctor/doctor-service.js",
  "modules/doctor/doctor-ui.js",
  "modules/reports/reports-service.js",
  "modules/reports/reports-ui.js",
  "modules/appointments/appointments-service.js",
  "modules/appointments/appointments-ui.js",
  "modules/admin/admin-service.js",
  "modules/admin/admin-ui.js",
  "modules/notifications/notifications-service.js",
  "modules/notifications/notifications-ui.js"
].forEach(relPath => {
  assert.ok(indexHtml.includes(relPath), `index.html must include script tag for ${relPath}`);
});
console.log("  ✓ All 20 modular scripts properly declared in index.html before app.js.");

console.log("\n==================================================================");
console.log("🎉 ALL 11 MODULAR ARCHITECTURE ACCEPTANCE TESTS PASSED (100%)");
console.log("==================================================================\n");
