/**
 * Test Suite: Clinical Data Isolation Engine
 * Validates strict segregation of test, mock, and sandbox data from authentic patient records
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("================================================================================");
console.log("🧪 HEALTH VIBE AI: DATA ISOLATION & SANDBOX SEGREGATION TEST SUITE");
console.log("================================================================================");

// Load functions from app.js
const appCode = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf-8");

function extractFunction(fnName, code) {
  const match = code.match(new RegExp(`function ${fnName}\\s*\\([\\s\\S]*?\\n\\}`));
  if (match) {
    return new Function(`return ${match[0]}`)();
  }
  return null;
}

const isTestOrDemoRecord = extractFunction("isTestOrDemoRecord", appCode);
global.isTestOrDemoRecord = isTestOrDemoRecord;
const isRealProductionRecord = extractFunction("isRealProductionRecord", appCode);
global.isRealProductionRecord = isRealProductionRecord;

assert(typeof isTestOrDemoRecord === "function", "isTestOrDemoRecord should be a function in app.js");
assert(typeof isRealProductionRecord === "function", "isRealProductionRecord should be a function in app.js");

let passedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Test Category 1: Detection of Test / Demo / Mock records
// -----------------------------------------------------------------------------
console.log("\n📦 Category 1: Detection of Test / Demo / Mock records");

runTest("Flags records with explicit boolean flags (isDemo, isTest, isMock, isSeed)", () => {
  assert.strictEqual(isTestOrDemoRecord({ isDemo: true, id: "c1" }), true);
  assert.strictEqual(isTestOrDemoRecord({ isTest: true, id: "c2" }), true);
  assert.strictEqual(isTestOrDemoRecord({ isMock: true, id: "c3" }), true);
  assert.strictEqual(isTestOrDemoRecord({ isSample: true, id: "c4" }), true);
  assert.strictEqual(isTestOrDemoRecord({ isSeed: true, id: "c5" }), true);
});

runTest("Flags records with test/sandbox environment tag", () => {
  assert.strictEqual(isTestOrDemoRecord({ environment: "test", id: "c6" }), true);
  assert.strictEqual(isTestOrDemoRecord({ environment: "sandbox", id: "c7" }), true);
  assert.strictEqual(isTestOrDemoRecord({ environment: "demo", id: "c8" }), true);
  assert.strictEqual(isTestOrDemoRecord({ env: "test", id: "c9" }), true);
});

runTest("Flags records with test/mock ID prefixes", () => {
  assert.strictEqual(isTestOrDemoRecord({ id: "demo_case_99" }), true);
  assert.strictEqual(isTestOrDemoRecord({ id: "mock_patient_12" }), true);
  assert.strictEqual(isTestOrDemoRecord({ id: "test_case_301" }), true);
  assert.strictEqual(isTestOrDemoRecord({ id: "sample_record_4" }), true);
  assert.strictEqual(isTestOrDemoRecord({ id: "seed_vital_5" }), true);
  assert.strictEqual(isTestOrDemoRecord({ id: "fake_session_1" }), true);
});

runTest("Flags records with mock/test emails", () => {
  assert.strictEqual(isTestOrDemoRecord({ patientEmail: "demo@healthvibe.ai" }), true);
  assert.strictEqual(isTestOrDemoRecord({ patientEmail: "test_case_patient@hospital.org" }), true);
  assert.strictEqual(isTestOrDemoRecord({ userEmail: "demo_user_123@example.com" }), true);
  assert.strictEqual(isTestOrDemoRecord({ email: "mock_patient@gmail.com" }), true);
});

runTest("Flags records with mock/demo patient names", () => {
  assert.strictEqual(isTestOrDemoRecord({ patientName: "Demo Patient" }), true);
  assert.strictEqual(isTestOrDemoRecord({ patientName: "مريض تجريبي للتجربة" }), true);
  assert.strictEqual(isTestOrDemoRecord({ patientName: "حالة تجريبية فحص" }), true);
  assert.strictEqual(isTestOrDemoRecord({ patientName: "Test Patient #4" }), true);
});

// -----------------------------------------------------------------------------
// Test Category 2: Authentic Production Record Verification
// -----------------------------------------------------------------------------
console.log("\n🏥 Category 2: Authentic Production Patient Records");

runTest("Accurately identifies authentic production patient records", () => {
  const authenticPatient = {
    id: "case_real_78129",
    patientId: "usr_ahmed_123",
    patientName: "أحمد محمود سالم",
    patientEmail: "ahmed.salem@gmail.com",
    oxygenLevel: 96,
    o2: 96,
    environment: "production",
    isDemo: false,
    isTest: false,
    status: "assigned"
  };

  assert.strictEqual(isTestOrDemoRecord(authenticPatient), false);
  assert.strictEqual(isRealProductionRecord(authenticPatient), true);
});

// -----------------------------------------------------------------------------
// Test Category 3: Doctor Queue Partitioning & Medical History Segregation
// -----------------------------------------------------------------------------
console.log("\n🛡️ Category 3: Strict Segregation & Filtering in Queues and History");

runTest("Doctor Queue: Real patient tabs NEVER include test/mock cases", () => {
  const mixedCases = [
    { id: "case_real_01", patientName: "فاطمة إبراهيم", patientEmail: "fatma@domain.com", o2: 95, status: "under_review", isDemo: false },
    { id: "case_real_02", patientName: "سارة حسن", patientEmail: "sara@domain.com", o2: 92, status: "approved", isDemo: false },
    { id: "demo_case_999", patientName: "مريض تجريبي", patientEmail: "demo@healthvibe.ai", o2: 88, status: "under_review", isDemo: true },
    { id: "mock_002", patientName: "Mock Patient", patientEmail: "mock_patient@test.com", o2: 90, status: "assigned", isMock: true },
    { id: "test_case_55", patientName: "Test Case", patientEmail: "test_case_55@example.com", o2: 97, status: "approved", isTest: true }
  ];

  // 1. Normal tabs strictly filter for isRealProductionRecord
  const realCases = mixedCases.filter(isRealProductionRecord);
  assert.strictEqual(realCases.length, 2);
  assert.strictEqual(realCases.every(c => !isTestOrDemoRecord(c)), true);
  assert.deepStrictEqual(realCases.map(c => c.id), ["case_real_01", "case_real_02"]);

  // 2. Sandbox tab exclusively contains test/mock records
  const sandboxCases = mixedCases.filter(isTestOrDemoRecord);
  assert.strictEqual(sandboxCases.length, 3);
  assert.strictEqual(sandboxCases.every(c => isTestOrDemoRecord(c)), true);
  assert.deepStrictEqual(sandboxCases.map(c => c.id), ["demo_case_999", "mock_002", "test_case_55"]);
});

runTest("Patient Medical History: Test data is permanently blocked from leaking into patient records", () => {
  const patientRecords = [
    { id: "hist_rec_01", patientId: "patient_uid_1", o2: 98, isDemo: false, status: "approved" },
    { id: "demo_case_77", patientId: "patient_uid_1", o2: 85, isDemo: true, status: "approved" },
    { id: "hist_rec_02", patientId: "patient_uid_1", o2: 96, isDemo: false, status: "approved" }
  ];

  const isolatedHistory = patientRecords.filter(isRealProductionRecord);
  assert.strictEqual(isolatedHistory.length, 2);
  assert.strictEqual(isolatedHistory.some(r => r.id === "demo_case_77"), false);
  assert.deepStrictEqual(isolatedHistory.map(r => r.id), ["hist_rec_01", "hist_rec_02"]);
});

console.log("\n================================================================================");
console.log(`🎉 ALL ${passedCount} DATA ISOLATION TESTS PASSED WITH 100% SUCCESS!`);
console.log("================================================================================\n");
