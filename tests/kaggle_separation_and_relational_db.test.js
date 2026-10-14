/**
 * Health Vibe AI - Automated Test Suite:
 * Kaggle Training Separation & Secure Relational Database (PostgreSQL / Supabase)
 *
 * Verifies Request 26 & PRD Page 16 (Section 13.1 Technical Correction):
 * "فصل بيانات Kaggle تماماً عن قاعدة بيانات التشغيل، واستخدام Kaggle للتدريب فقط
 * مع إنشاء قاعدة بيانات علائقية آمنة (PostgreSQL / Supabase) لحفظ الحسابات والـ Patient History"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🗄️  HEALTH VIBE AI: KAGGLE SEPARATION & RELATIONAL DB TEST SUITE");
console.log("   PRD Page 16 Compliance: ML Sandbox vs Operational PostgreSQL");
console.log("==================================================================\n");

const ROOT_DIR = path.resolve(__dirname, "..");
const SCHEMA_SQL_PATH = path.join(ROOT_DIR, "backend", "db", "schema.sql");
const KAGGLE_SERVICE_PATH = path.join(ROOT_DIR, "backend", "kaggle-training-service.js");
const RELATIONAL_SERVICE_PATH = path.join(ROOT_DIR, "backend", "relational-db-service.js");
const DOC_PATH = path.join(ROOT_DIR, "backend", "DATA_ISOLATION_KAGGLE_POSTGRES.md");

// Verify files exist
assert.ok(fs.existsSync(SCHEMA_SQL_PATH), "backend/db/schema.sql must exist");
assert.ok(fs.existsSync(KAGGLE_SERVICE_PATH), "backend/kaggle-training-service.js must exist");
assert.ok(fs.existsSync(RELATIONAL_SERVICE_PATH), "backend/relational-db-service.js must exist");
assert.ok(fs.existsSync(DOC_PATH), "backend/DATA_ISOLATION_KAGGLE_POSTGRES.md must exist");

const schemaSqlContent = fs.readFileSync(SCHEMA_SQL_PATH, "utf8");
const docContent = fs.readFileSync(DOC_PATH, "utf8");

const { KaggleTrainingService, kaggleTrainingService } = require("../backend/kaggle-training-service");
const { RelationalDatabaseService, relationalDbService } = require("../backend/relational-db-service");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: PRD Page 16 Technical Mandate & Documentation
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 1: PRD Page 16 Technical Correction Mandate Verification");
assert.ok(
  docContent.includes("Kaggle ليس Production Database"),
  "Documentation must cite the exact PRD Page 16 technical correction"
);
assert.ok(
  docContent.includes("PostgreSQL / Supabase"),
  "Documentation must specify PostgreSQL / Supabase as the relational operational database"
);
assert.ok(
  docContent.includes("patient_history"),
  "Documentation must cover accounts, patients, and patient_history"
);
console.log("  ✓ PRD Page 16 citation and architectural separation documented.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Kaggle Dataset Isolation & Prohibited Operational Access
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 2: Kaggle Dataset Training-Only Isolation & Anti-Leakage Guard");

const trainingService = new KaggleTrainingService();

// 1. Must block operational database operations on Kaggle
assert.throws(
  () => {
    trainingService.assertNotOperationalDatabase("store_patient_account");
  },
  /ARCHITECTURAL_VIOLATION_PRD_PAGE_16/,
  "Kaggle service must reject store_patient_account"
);

assert.throws(
  () => {
    trainingService.assertNotOperationalDatabase("store_patient_history");
  },
  /ARCHITECTURAL_VIOLATION_PRD_PAGE_16/,
  "Kaggle service must reject store_patient_history"
);

// 2. Validates approved offline training benchmarks
const validSource = trainingService.validateTrainingDatasetSource("kaggle/respiratory-sound-database");
assert.strictEqual(validSource.isValid, true);
assert.strictEqual(validSource.operationalStorageAllowed, false);

assert.throws(
  () => {
    trainingService.validateTrainingDatasetSource("unverified-public-dump");
  },
  /approved offline training benchmark/,
  "Must reject unverified training sources"
);

// 3. Prohibits live patient identifiers in training sets (Zero-PHI safe harbor)
const dirtyTrainingSample = [
  { age: 45, spo2: 95, cough_duration_days: 5 },
  { age: 52, spo2: 92, national_id: "28406120102931" } // Leaked PHI!
];

assert.throws(
  () => {
    trainingService.verifyZeroPhi(dirtyTrainingSample);
  },
  /DATA_LEAKAGE_GUARD/,
  "Kaggle service must detect and block live PHI identifiers in training data"
);

const cleanTrainingSample = [
  { age: 45, spo2: 95, cough_duration_days: 5, label: 1 },
  { age: 52, spo2: 92, cough_duration_days: 12, label: 2 }
];
const phiCheck = trainingService.verifyZeroPhi(cleanTrainingSample);
assert.strictEqual(phiCheck.zeroPhiCertified, true);

// 4. Model Artifact Registration (exporting statistical parameters without raw patient data)
const modelArtifact = trainingService.registerModelArtifact({
  moduleName: "respiratory",
  modelVersion: "2.1.0",
  trainingSource: "kaggle/respiratory-sound-database",
  metrics: { accuracy: 0.94, precision: 0.93, recall: 0.95 },
  featuresList: ["spo2", "pulse", "cough_severity", "temperature"],
  confusionMatrix: { tp: 95, fp: 5, tn: 93, fn: 7 }
});

assert.ok(modelArtifact.artifactId.startsWith("MOD-RESPIRATORY-2.1.0"));
assert.strictEqual(modelArtifact.metrics.accuracy, 0.94);
assert.strictEqual(modelArtifact.zeroPhiCertified, true);

console.log("  ✓ Kaggle dataset boundary strictly verified (Training only, zero PHI, zero operational access).\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: PostgreSQL / Supabase SQL Schema DDL Integrity
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 3: Relational SQL Schema DDL Integrity (backend/db/schema.sql)");

// Tables verification
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS accounts"), "Schema must define 'accounts' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS doctor_profiles"), "Schema must define 'doctor_profiles' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS patients"), "Schema must define 'patients' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS clinical_cases"), "Schema must define 'clinical_cases' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS patient_history"), "Schema must define 'patient_history' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS audit_logs"), "Schema must define 'audit_logs' table");
assert.ok(schemaSqlContent.includes("CREATE TABLE IF NOT EXISTS ml_training_registry"), "Schema must define 'ml_training_registry' table");

// Foreign keys & Constraints
assert.ok(schemaSqlContent.includes("REFERENCES accounts(id)"), "Must have foreign key reference to accounts(id)");
assert.ok(schemaSqlContent.includes("REFERENCES patients(id)"), "Must have foreign key reference to patients(id)");
assert.ok(schemaSqlContent.includes("REFERENCES doctor_profiles(id)"), "Must have foreign key reference to doctor_profiles(id)");

// Row Level Security (RLS)
assert.ok(schemaSqlContent.includes("ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;"), "accounts must have RLS enabled");
assert.ok(schemaSqlContent.includes("ALTER TABLE patients ENABLE ROW LEVEL SECURITY;"), "patients must have RLS enabled");
assert.ok(schemaSqlContent.includes("ALTER TABLE patient_history ENABLE ROW LEVEL SECURITY;"), "patient_history must have RLS enabled");
assert.ok(schemaSqlContent.includes("CREATE POLICY patient_self_access"), "Must define patient_self_access policy");
assert.ok(schemaSqlContent.includes("CREATE POLICY patient_history_self_view"), "Must define patient_history_self_view policy");
assert.ok(schemaSqlContent.includes("CREATE POLICY doctor_patient_history_access"), "Must define doctor_patient_history_access policy");

console.log("  ✓ Relational SQL DDL verified with tables, foreign keys, indexes, and RLS policies.\n");

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Operational Relational Database Service (Accounts, RBAC, Profiles)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 4: Operational Relational Database Service (Accounts & RBAC)");

(async function runAsyncTests() {
  const db = new RelationalDatabaseService();

  // 1. Create Patient Account
  const patientAccount = await db.createAccount({
    email: "tarek.patient@healthvibes.app",
    fullName: "طارق عبد المنعم",
    role: "patient",
    phone: "01012345678",
    emailVerified: true
  });

  assert.ok(patientAccount.id, "Account must have generated UUID");
  assert.strictEqual(patientAccount.email, "tarek.patient@healthvibes.app");
  assert.strictEqual(patientAccount.role, "patient");

  // 2. Duplicate email constraint (PostgreSQL 23505)
  await assert.rejects(
    async () => {
      await db.createAccount({
        email: "tarek.patient@healthvibes.app",
        fullName: "طارق مكرر",
        role: "patient"
      });
    },
    /already exists/,
    "Must enforce unique constraint on email"
  );

  // 3. Create Doctor Account & Doctor Profile
  const doctorAccount = await db.createAccount({
    email: "dr.mamdouh@healthvibes.app",
    fullName: "د. أحمد ممدوح",
    role: "doctor",
    phone: "01098765432",
    emailVerified: true
  });

  const doctorProfile = await db.createDoctorProfile({
    accountId: doctorAccount.id,
    syndicateId: "SYN-EGY-14892",
    specialty: "Pulmonology",
    verificationStatus: "verified",
    clinicName: "Cairo Respiratory Center",
    consultationFee: 300.00
  });

  assert.strictEqual(doctorProfile.syndicate_id, "SYN-EGY-14892");
  assert.strictEqual(doctorProfile.verification_status, "verified");

  // 4. Create Patient Profile
  const patientProfile = await db.createPatientProfile({
    accountId: patientAccount.id,
    dateOfBirth: "1980-05-15",
    gender: "male",
    bloodGroup: "O+",
    emergencyContactName: "منى عبد المنعم",
    emergencyContactPhone: "01099887766",
    assignedDoctorId: doctorProfile.id,
    medicalConsentAccepted: true
  });

  assert.strictEqual(patientProfile.blood_group, "O+");
  assert.strictEqual(patientProfile.assigned_doctor_id, doctorProfile.id);

  console.log("  ✓ Operational account and profile relational CRUD verified.\n");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Operational Pre-Triage Cases & Atomic Patient History Timeline
  // ───────────────────────────────────────────────────────────────────────────
  console.log("▶ TEST 5: Pre-Triage Case & Atomic Patient History Timeline Append");

  // 1. Submit pre-triage case
  const clinicalCase = await db.createClinicalCase({
    patientId: patientProfile.id,
    assignedDoctorId: doctorProfile.id,
    diseaseModule: "respiratory",
    triageLevel: "moderate",
    vitals: { spo2: 95, pulse: 88, respiratoryRate: 22, temperature: 37.2 },
    symptoms: ["cough", "mild_dyspnea", "chest_tightness"],
    aiRiskScore: 0.58,
    aiConfidence: 0.94,
    aiDifferentialAnalysis: { acute_bronchitis: 0.72, viral_uri: 0.18, bronchial_hyperresponsiveness: 0.10 }
  });

  assert.strictEqual(clinicalCase.approval_status, "pending_doctor_review");
  assert.strictEqual(clinicalCase.vitals.spo2, 95);

  // 2. Doctor certifies case -> atomic transaction generates certified Patient History entry
  const { certifiedCase, patientHistoryRecord } = await db.approveCaseAndCommitHistory({
    caseId: clinicalCase.id,
    doctorId: doctorProfile.id,
    doctorName: "د. أحمد ممدوح",
    diagnosis: "التهاب شعبي حاد خفيف (Acute Bronchitis - Mild)",
    doctorNotes: "المؤشرات الحيوية مستقرة. لا يوجد مؤشرات لتفاقم نقص الأكسجين.",
    treatmentRecommendations: [
      "راحة تامة لمدة 48 ساعة",
      "تناول سوائل دافئة وترطيب كافٍ",
      "مراجعة الطوارئ فوراً إذا انخفض SpO2 عن 92%"
    ]
  });

  assert.strictEqual(certifiedCase.approval_status, "approved_certified");
  assert.ok(certifiedCase.certified_at);

  assert.ok(patientHistoryRecord.id);
  assert.strictEqual(patientHistoryRecord.patient_id, patientProfile.id);
  assert.strictEqual(patientHistoryRecord.case_id, clinicalCase.id);
  assert.strictEqual(patientHistoryRecord.disease_module, "respiratory");
  assert.strictEqual(patientHistoryRecord.clinical_revision, 1);
  assert.strictEqual(patientHistoryRecord.doctor_name, "د. أحمد ممدوح");
  assert.strictEqual(patientHistoryRecord.is_patient_visible, true);

  // 3. Query Patient History with visibility filtering
  const patientHistory = await db.getPatientHistory(patientProfile.id, { patientVisibleOnly: true });
  assert.strictEqual(patientHistory.length, 1);
  assert.strictEqual(patientHistory[0].diagnosis, "التهاب شعبي حاد خفيف (Acute Bronchitis - Mild)");
  assert.strictEqual(patientHistory[0].vitals_snapshot.spo2, 95);

  console.log("  ✓ Pre-triage case creation, doctor approval, and Patient History timeline verified.\n");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Kaggle Operational Boundary Enforcement (Write Prevention)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("▶ TEST 6: Kaggle Operational Boundary Enforcement in Relational DB Service");

  // Attempt to write Kaggle-sourced data into operational patient tables
  const kagglePayload = {
    patientId: patientProfile.id,
    source: "kaggle_respiratory_dump_v1",
    summary: "Simulated Kaggle record"
  };

  await assert.rejects(
    async () => {
      await db.createPatientHistoryEntry(kagglePayload);
    },
    /PRD_PAGE_16_GUARD/,
    "Relational DB service must block any Kaggle training records from entering operational tables"
  );

  console.log("  ✓ Kaggle operational write blocker verified.\n");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Immutable Audit Logging & Health Status
  // ───────────────────────────────────────────────────────────────────────────
  console.log("▶ TEST 7: Immutable Audit Logging & Health Status Engine");

  const auditLogs = await db.getAuditLogs({ limit: 10 });
  assert.ok(auditLogs.length >= 2, "Audit logs must record account creation and patient history events");

  const health = db.getHealthStatus();
  assert.strictEqual(health.status, "healthy");
  assert.strictEqual(health.schemaVersion, "2.1.0-relational");
  assert.ok(health.prdCompliance.includes("PRD Page 16"));
  assert.ok(health.kaggleSeparation.includes("STRICT_BOUNDARY_ACTIVE"));
  assert.strictEqual(health.metrics.accountsCount, 2);
  assert.strictEqual(health.metrics.patientHistoryRecordsCount, 1);

  console.log("  ✓ Audit logs and relational health check metrics confirmed.\n");

  console.log("==================================================================");
  console.log("🎉 ALL TESTS PASSED! Kaggle separation and Relational DB verified!");
  console.log("==================================================================");
})();
