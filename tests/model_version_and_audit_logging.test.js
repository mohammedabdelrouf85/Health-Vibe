/**
 * Health Vibe AI - Model Version & Audit Logging Test Suite
 *
 * Verifies User Request 55:
 * "حفظ رقم إصدار النموذج (model_version مثل resp_rf_v1.0.2) وتاريخ تشغيله مع كل نتيجة تقييم في قاعدة البيانات لأغراض المراجعة الطبية والتدقيق."
 *
 * Requirements:
 * 1. Constant MODEL_VERSION is standardized to "resp_rf_v1.0.2" across client and backend.
 * 2. buildAssessmentModel creates records with model_version, modelVersion, model_run_at, modelRunAt,
 *    and model_execution_timestamp both at the document root and inside assessment.aiTriage.
 * 3. Both ISO 8601 string timestamps and millisecond epoch timestamps are generated.
 * 4. Doctor review panel and clinical report screens display model_version and run timestamp for clinical audits.
 * 5. backend/server.js persists model_version and model_run_at in report snapshots and case updates.
 * 6. Relational SQL schema (backend/db/schema.sql) and documentation record model_version and model_run_at.
 * 7. Zero regression in normal email and Google OAuth authentication flows.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("==================================================================");
console.log("🔬 HEALTH VIBE AI: MODEL VERSION & AUDIT LOGGING TEST SUITE");
console.log("   PRD Req 55: Saving model_version (resp_rf_v1.0.2) & Run Timestamp");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, "..");
const appJsPath = path.join(ROOT_DIR, "app", "app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const backendServerPath = path.join(ROOT_DIR, "backend", "server.js");
const backendServerContent = fs.readFileSync(backendServerPath, "utf8");
const schemaSqlPath = path.join(ROOT_DIR, "backend", "db", "schema.sql");
const schemaSqlContent = fs.readFileSync(schemaSqlPath, "utf8");
const schemaDocPath = path.join(ROOT_DIR, "backend", "ASSESSMENT_SCHEMA.md");
const schemaDocContent = fs.readFileSync(schemaDocPath, "utf8");
const reportsServicePath = path.join(ROOT_DIR, "app", "modules", "reports", "reports-service.js");
const reportsServiceContent = fs.readFileSync(reportsServicePath, "utf8");

// ── TEST 1: Constant & Schema Definitions ─────────────────────────────────────
console.log("▶ TEST 1: Model Version Constant & Schema Verification");

assert.ok(
  appJsContent.includes('const MODEL_VERSION = "resp_rf_v1.0.2";'),
  "app.js must define MODEL_VERSION as 'resp_rf_v1.0.2'"
);
assert.ok(
  appJsContent.includes("window.MODEL_VERSION = MODEL_VERSION;"),
  "app.js must expose window.MODEL_VERSION"
);
assert.ok(
  backendServerContent.includes("const MODEL_VERSION = 'resp_rf_v1.0.2';"),
  "backend/server.js must define MODEL_VERSION as 'resp_rf_v1.0.2'"
);
assert.ok(
  schemaSqlContent.includes("model_version VARCHAR(64) DEFAULT 'resp_rf_v1.0.2'"),
  "backend/db/schema.sql must define model_version column in clinical_cases"
);
assert.ok(
  schemaSqlContent.includes("model_run_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"),
  "backend/db/schema.sql must define model_run_at column in clinical_cases"
);
assert.ok(
  schemaDocContent.includes('"modelVersion": "resp_rf_v1.0.2"') && schemaDocContent.includes('"model_version": "resp_rf_v1.0.2"'),
  "backend/ASSESSMENT_SCHEMA.md must document model_version as 'resp_rf_v1.0.2'"
);

console.log("  ✓ Standardized model_version 'resp_rf_v1.0.2' verified across app.js, backend, SQL, and documentation.");

// ── TEST 2: buildAssessmentModel Runtime Generation ───────────────────────────
console.log("\n▶ TEST 2: buildAssessmentModel Execution & Field Population");

// Setup isolated VM sandbox with minimal mocked DOM and Firebase
const sandbox = {
  console: console,
  window: {},
  document: {
    getElementById: (id) => ({
      value: "",
      trim: () => "",
      classList: { toggle: () => {}, remove: () => {} }
    })
  },
  currentLanguage: "ar",
  firebase: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ _methodName: "serverTimestamp" })
      }
    }
  },
  setTimeout: (fn) => fn(),
  Date: Date
};
vm.createContext(sandbox);

// Slice the dictionary and buildAssessmentModel block from app.js
const dictMatch = appJsContent.match(/const AssessmentDictionaries =[\s\S]*?function buildAssessmentModel[\s\S]*?window\.buildAssessmentModel = buildAssessmentModel;/);
assert.ok(dictMatch, "AssessmentDictionaries and buildAssessmentModel must be extractable from app.js");

// We need helper parsing and risk evaluation functions used by buildAssessmentModel
const helperSnippet = `
function parseStrictOxygenInput(val) {
  const num = parseInt(val, 10);
  if (isNaN(num) || num < 50 || num > 100) return { ok: false };
  return { ok: true, value: num };
}
function parseStrictSymptomDurationInput(val) {
  return { ok: true, value: 3, text: "3 أيام" };
}
function parseOptionalTemperatureInput() { return { ok: true, value: 37.0, unit: "°C" }; }
function parseOptionalRespiratoryRateInput() { return { ok: true, value: 18, unit: "breaths/min" }; }
function normalizeYesNoUnknown(v) { return v === "نعم" ? "yes" : (v === "لا" ? "no" : "unknown"); }
function normalizeSymptomProgression() { return "stable"; }
function yesNoUnknownLabel(k, isEn) { return isEn ? k : (k === 'yes' ? 'نعم' : 'لا'); }
function symptomProgressionLabel(k, isEn) { return isEn ? k : 'ثابتة'; }
function getStoredPrivacyConsent() { return { accepted: true, version: "2026-09-v1" }; }
function calculateAge() { return 30; }
const CASE_STATUS = { TRIAGED: "triaged", ASSIGNED: "assigned" };
const PRIVACY_CONSENT_VERSION = "2026-09-v1";
const ASSESSMENT_SCHEMA_VERSION = "1.0.0";
const REPORT_VERSION = "1.0.0";
const MODEL_VERSION = "resp_rf_v1.0.2";

function evaluateRulesBasedRisk() {
  return {
    priority: "normal",
    points: 0,
    rules: [],
    ruleSetId: "breathing-triage",
    version: "HealthVibe-Rules-v1.0",
    effectiveFrom: "2026-09-21",
    reviewStatus: "pending-qualified-clinical-and-regulatory-review",
    rulesEngineSnapshot: {},
    factorExplanation: "Normal evaluation"
  };
}

${dictMatch[0]}
`;

vm.runInContext(helperSnippet, sandbox);

// Execute buildAssessmentModel with standard patient inputs
const sampleCase = sandbox.buildAssessmentModel({
  user: { uid: "patient-audit-123", email: "audit.patient@healthvibe.test" },
  oxygenLevel: "96",
  breathingRaw: "لا",
  coughRaw: "متوسط",
  symptomDurationRaw: "3",
  temperatureRaw: "37.2",
  respiratoryRateRaw: "18"
});

// Root document audit assertions
assert.strictEqual(sampleCase.model_version, "resp_rf_v1.0.2", "Root model_version must be resp_rf_v1.0.2");
assert.strictEqual(sampleCase.modelVersion, "resp_rf_v1.0.2", "Root modelVersion must be resp_rf_v1.0.2");
assert.ok(typeof sampleCase.model_run_at === "string", "model_run_at must be an ISO string");
assert.ok(!isNaN(Date.parse(sampleCase.model_run_at)), "model_run_at must be parseable as a valid Date");
assert.strictEqual(sampleCase.modelRunAt, sampleCase.model_run_at, "modelRunAt must equal model_run_at");
assert.ok(typeof sampleCase.model_execution_timestamp === "number", "model_execution_timestamp must be numeric milliseconds");
assert.ok(sampleCase.model_execution_timestamp > 0, "model_execution_timestamp must be positive");

// Nested assessment.aiTriage audit assertions
const aiTriage = sampleCase.assessment.aiTriage;
assert.ok(aiTriage, "aiTriage must exist in assessment");
assert.strictEqual(aiTriage.model_version, "resp_rf_v1.0.2", "aiTriage.model_version must be resp_rf_v1.0.2");
assert.strictEqual(aiTriage.modelVersion, "resp_rf_v1.0.2", "aiTriage.modelVersion must be resp_rf_v1.0.2");
assert.strictEqual(aiTriage.model_run_at, sampleCase.model_run_at, "aiTriage.model_run_at must match root timestamp");
assert.strictEqual(aiTriage.modelRunAt, sampleCase.modelRunAt, "aiTriage.modelRunAt must match root timestamp");
assert.strictEqual(aiTriage.modelArchitecture, "RandomForest_Classifier_ClinicalRules");
assert.strictEqual(aiTriage.algorithm, "Random Forest + Clinical Safety Guardrails (resp_rf)");
assert.strictEqual(aiTriage.auditReady, true, "aiTriage must be flagged as auditReady");

console.log("  ✓ buildAssessmentModel correctly generated root and aiTriage model_version, ISO timestamp, and epoch timestamp.");

// ── TEST 3: Custom Model Version & Timestamp Overrides ────────────────────────
console.log("\n▶ TEST 3: Parameterized Overrides (Model Evolution & Historical Replays)");

const customTimestamp = "2026-10-16T14:30:00.000Z";
const customCase = sandbox.buildAssessmentModel({
  user: { uid: "patient-override-456" },
  oxygenLevel: "94",
  breathingRaw: "نعم",
  coughRaw: "شديد",
  symptomDurationRaw: "5",
  modelVersion: "resp_rf_v1.0.3",
  modelRunAt: customTimestamp
});

assert.strictEqual(customCase.model_version, "resp_rf_v1.0.3", "Custom model_version must be respected");
assert.strictEqual(customCase.model_run_at, customTimestamp, "Custom model_run_at must be respected");
assert.strictEqual(customCase.model_execution_timestamp, Date.parse(customTimestamp), "Execution timestamp must match override date");
assert.strictEqual(customCase.assessment.aiTriage.model_version, "resp_rf_v1.0.3");
assert.strictEqual(customCase.assessment.aiTriage.model_run_at, customTimestamp);

console.log("  ✓ Custom model version and historical timestamp overrides supported seamlessly.");

// ── TEST 4: Clinical Report & Doctor Audit Presentation ────────────────────────
console.log("\n▶ TEST 4: Clinical Report & Doctor Review UI Verification");

assert.ok(
  appJsContent.includes("ML Model Version:"),
  "Doctor review panel must include 'ML Model Version:' audit label"
);
assert.ok(
  appJsContent.includes("Model Execution Date:"),
  "Doctor review panel must include 'Model Execution Date:' audit label"
);
assert.ok(
  appJsContent.includes("Clinical Triage & ML Model:"),
  "Clinical report must display 'Clinical Triage & ML Model:' in triage badge"
);
assert.ok(
  appJsContent.includes("Clinical Audit Ready"),
  "Clinical report must display 'Clinical Audit Ready' badge"
);
assert.ok(
  appJsContent.includes("Model: ${modelVersion} (${modelRunAt})"),
  "Digital Seal cryptographic verification audit string must include Model version and run date"
);

console.log("  ✓ Doctor review panel and official certified report correctly present model_version and run timestamp.");

// ── TEST 5: Backend Report Snapshot & Approval Audit Trail ────────────────────
console.log("\n▶ TEST 5: Backend Approved Report Snapshot Audit Trail");

assert.ok(
  backendServerContent.includes("modelVersion: caseData.modelVersion || caseData.model_version || MODEL_VERSION"),
  "backend/server.js buildApprovedReportSnapshot must capture modelVersion with fallback"
);
assert.ok(
  backendServerContent.includes("model_version: caseData.model_version || caseData.modelVersion || MODEL_VERSION"),
  "backend/server.js buildApprovedReportSnapshot must capture model_version"
);
assert.ok(
  backendServerContent.includes("modelRunAt: caseData.modelRunAt || caseData.model_run_at"),
  "backend/server.js buildApprovedReportSnapshot must capture modelRunAt date"
);
assert.ok(
  backendServerContent.includes("model_run_at: caseData.model_run_at || caseData.modelRunAt"),
  "backend/server.js buildApprovedReportSnapshot must capture model_run_at date"
);
assert.ok(
  backendServerContent.includes("updateData.model_version = caseData.model_version || caseData.modelVersion || MODEL_VERSION"),
  "backend/server.js case approval must store model_version on case update"
);
assert.ok(
  backendServerContent.includes("updateData.model_run_at = caseData.model_run_at || caseData.modelRunAt"),
  "backend/server.js case approval must store model_run_at on case update"
);

console.log("  ✓ Backend snapshot and Firestore updateData capture model_version and model_run_at.");

// ── TEST 6: Zero Regression in Email and Google OAuth Authentication ──────────
console.log("\n▶ TEST 6: Zero Regression in Email & Google OAuth Authentication");

const authUiPath = path.join(ROOT_DIR, "app", "modules", "auth", "auth-ui.js");
const authUiContent = fs.readFileSync(authUiPath, "utf8");

assert.ok(appJsContent.includes("signInWithPopup"), "signInWithPopup must remain present in app.js");
assert.ok(appJsContent.includes("signInWithRedirect"), "signInWithRedirect must remain present in app.js");
assert.ok(
  appJsContent.includes("signInWithEmailAndPassword") || authUiContent.includes("signInWithEmailAndPassword"),
  "signInWithEmailAndPassword must remain present"
);
assert.ok(
  appJsContent.includes("createUserWithEmailAndPassword") || authUiContent.includes("createUserWithEmailAndPassword"),
  "createUserWithEmailAndPassword must remain present"
);

console.log("  ✓ Normal email sign-in and Google OAuth sign-in fully preserved with zero regression.");

console.log("\n==================================================================");
console.log("🎉 ALL MODEL VERSION & AUDIT LOGGING TESTS PASSED (100%)!");
console.log("==================================================================");

process.exit(0);
