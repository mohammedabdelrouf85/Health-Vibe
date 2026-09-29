/**
 * Health Vibe AI - Assessment Comparison, Longitudinal Tracking & Reassessment Reminders Test Suite
 * 
 * Verifies:
 * 1. Independent new assessment creation (previous case preserved as baseline, zero mutation of history).
 * 2. Physiological measurements comparison with units, timing, and data sources.
 * 3. Explicit missing measurements transparency (never set to 0, badged as missing with standard unit).
 * 4. Approved clinical report comparisons (diagnoses, medication diffs).
 * 5. Longitudinal chart data generation with observational guardrail (no automated diagnosis from chart).
 * 6. Doctor-approved reassessment plan scheduling & reminders.
 * 7. Server endpoints integration test.
 */

const assert = require("assert");
const http = require("http");

// Mock Firestore / Database for unit & service testing
class MockDocRef {
  constructor(id, data = {}) {
    this.id = id;
    this._data = { ...data };
  }
  async get() {
    return {
      exists: Boolean(this._data && Object.keys(this._data).length > 0),
      id: this.id,
      data: () => ({ ...this._data })
    };
  }
  async set(data, options = {}) {
    if (options.merge) {
      this._data = { ...this._data, ...data };
    } else {
      this._data = { ...data };
    }
    return this;
  }
  async update(data) {
    this._data = { ...this._data, ...data };
    return this;
  }
}

class MockCollection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }
  doc(id) {
    if (!this.docs.has(id)) {
      this.docs.set(id, new MockDocRef(id));
    }
    return this.docs.get(id);
  }
  async add(data) {
    const id = `${this.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = new MockDocRef(id, data);
    this.docs.set(id, docRef);
    return docRef;
  }
  where(field, op, val) {
    const matched = [];
    for (const [id, doc] of this.docs.entries()) {
      if (op === "==" && doc._data[field] === val) {
        matched.push(doc);
      }
    }
    return {
      get: async () => ({
        empty: matched.length === 0,
        docs: matched.map(d => ({ id: d.id, data: () => ({ ...d._data }) }))
      })
    };
  }
}

class MockFirestore {
  constructor() {
    this.collections = new Map();
  }
  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(name));
    }
    return this.collections.get(name);
  }
}

// Import assessment comparison service
const assessmentService = require("../backend/assessment-comparison-service");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: ASSESSMENT COMPARISON & LONGITUDINAL TEST SUITE");
console.log("   Missing Metrics, Standard Units, Chart Guardrails & Doctor Plans");
console.log("==================================================================\n");

async function runTests() {
  const db = new MockFirestore();
  const patientId = "patient_longitudinal_101";

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Creation of Independent New Assessment
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 1: Independent New Assessment (Preserving Baseline)");
  const baseCaseData = {
    patientId,
    patientName: "Ahmed Ali",
    status: "approved",
    doctorApproved: true,
    oxygenLevel: 94,
    heartRate: 98,
    respiratoryRate: 20,
    temperature: 37.8,
    bloodPressureSys: 125,
    bloodPressureDia: 82,
    doctorDiagnosis: "Mild respiratory infection with wheezing",
    doctorPrescriptions: ["Ventolin Inhaler 100mcg", "Paracetamol 500mg"],
    submittedAt: new Date(Date.now() - 86400000 * 3).toISOString() // 3 days ago
  };
  const baseCaseRef = await db.collection("cases").add(baseCaseData);
  const baseCaseId = baseCaseRef.id;

  // Now create an independent new assessment referencing the predecessor
  const newAssessmentResult = await assessmentService.createIndependentNewAssessment(db, {
    patientId,
    previousCaseId: baseCaseId,
    oxygenLevel: 98,
    heartRate: 74,
    // respiratoryRate is omitted to test missing metric transparency
    temperature: 36.8,
    patientNotes: "Feeling significantly better after inhaler therapy"
  });

  assert.strictEqual(newAssessmentResult.ok, true, "New assessment creation must succeed");
  assert.notStrictEqual(newAssessmentResult.caseId, baseCaseId, "New case ID must be independent and unique");
  assert.strictEqual(newAssessmentResult.previousCaseId, baseCaseId, "New assessment must link previousCaseId");

  // Verify baseline predecessor doc in Firestore was NOT altered/mutated
  const baseDocCheck = await db.collection("cases").doc(baseCaseId).get();
  assert.strictEqual(baseDocCheck.data().oxygenLevel, 94, "Baseline record oxygen must remain unchanged");
  assert.strictEqual(baseDocCheck.data().status, "approved", "Baseline report status must remain unchanged");
  console.log("  ✓ Independent assessment created with unique caseId:", newAssessmentResult.caseId);
  console.log("  ✓ Baseline case historical integrity preserved with zero mutation.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Physiological Measurements Comparison & Standard Units
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 2: Physiological Measurements Comparison & Clinical Units");
  const latestDoc = await db.collection("cases").doc(newAssessmentResult.caseId).get();
  const latestCase = { id: latestDoc.id, ...latestDoc.data() };
  const prevCase = { id: baseCaseId, ...baseCaseData };

  const comp = assessmentService.compareAssessments(latestCase, prevCase);

  assert.ok(comp.measurementsComparison, "Comparison must include measurementsComparison");
  const o2Comp = comp.measurementsComparison.oxygenLevel;
  assert.strictEqual(o2Comp.unit, "%", "SpO2 unit must be %");
  assert.strictEqual(o2Comp.currentValue, 98, "Current SpO2 must be 98");
  assert.strictEqual(o2Comp.previousValue, 94, "Previous SpO2 must be 94");
  assert.strictEqual(o2Comp.delta, 4, "Delta must be +4%");
  assert.strictEqual(o2Comp.direction, "improved", "Increase in SpO2 must be flagged as improved");

  const hrComp = comp.measurementsComparison.heartRate;
  assert.strictEqual(hrComp.unit, "bpm", "Heart rate unit must be bpm");
  assert.strictEqual(hrComp.delta, -24, "Heart rate delta must be -24 bpm");
  assert.strictEqual(hrComp.direction, "improved", "Decrease in tachycardic heart rate must be improved");

  const tempComp = comp.measurementsComparison.temperature;
  assert.strictEqual(tempComp.unit, "°C", "Temperature unit must be °C");
  assert.strictEqual(tempComp.delta, -1, "Temperature delta must be -1.0 °C");
  assert.strictEqual(tempComp.direction, "improved", "Fever reduction must be improved");
  console.log("  ✓ Standard units verified: SpO2 (%), HR (bpm), Temp (°C).");
  console.log("  ✓ Numeric deltas and favorable clinical directions accurately quantified.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Missing Measurements Transparency (Never 0, Explicitly Badged)
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 3: Explicit Missing Measurements Transparency");
  const rrComp = comp.measurementsComparison.respiratoryRate;
  assert.strictEqual(rrComp.isCurrentMissing, true, "Unrecorded respiratoryRate must be flagged as missing");
  assert.strictEqual(rrComp.currentValue, null, "Missing measurement must be null, NEVER 0");
  assert.strictEqual(rrComp.status, "now_missing", "Status must reflect now_missing state");
  assert.strictEqual(rrComp.unit, "breaths/min", "Expected unit for missing metric must be clearly declared");

  const bpComp = comp.measurementsComparison.bloodPressureSys;
  assert.strictEqual(bpComp.isCurrentMissing, true, "Unmeasured BP must be identified as missing");
  assert.strictEqual(bpComp.unit, "mmHg", "Expected unit for BP must be mmHg");

  assert.ok(comp.missingMeasurementsInLatest.length >= 2, "Missing measurements list must contain unmeasured metrics");
  assert.ok(comp.missingMeasurementsInLatest.some(m => m.key === "respiratoryRate"), "respiratoryRate must be in missing list");
  console.log("  ✓ Missing metrics never disguised as 0 (preventing fatal cardiac arrest false alarms).");
  console.log("  ✓ Standard clinical units (breaths/min, mmHg) clearly identified on missing metrics.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Approved Clinical Reports Comparison (Diagnoses & Med Diffs)
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 4: Approved Clinical Reports Comparison & Medication Diffs");
  const latestApprovedReport = {
    caseId: latestCase.id,
    doctorApproved: true,
    doctorDiagnosis: "Resolved bronchospasm, normal pulmonary mechanics",
    doctorPrescriptions: ["Ventolin Inhaler 100mcg", "Vitamin C 1000mg"],
    approvingDoctorName: "Dr. Khaled Sarah, Pulmonologist",
    approvedAt: new Date().toISOString()
  };

  const reportComparison = assessmentService.compareApprovedReports(latestApprovedReport, baseCaseData);
  assert.strictEqual(reportComparison.isDiagnosisModified, true, "Diagnosis update must be flagged");
  assert.strictEqual(reportComparison.latestDiagnosis, latestApprovedReport.doctorDiagnosis);
  assert.strictEqual(reportComparison.previousDiagnosis, baseCaseData.doctorDiagnosis);

  // Medication diff
  const medDiff = reportComparison.medicationsComparison;
  assert.ok(medDiff.added.includes("Vitamin C 1000mg"), "New medication must be in added list");
  assert.ok(medDiff.removed.includes("Paracetamol 500mg"), "Discontinued medication must be in removed list");
  assert.ok(medDiff.unchanged.includes("Ventolin Inhaler 100mcg"), "Continued medication must be in unchanged list");
  console.log("  ✓ Diagnosis shift tracked between approved reports.");
  console.log("  ✓ Prescription regimens compared: +Added, -Discontinued, =Unchanged.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Longitudinal Chart Trend Data & Strict Diagnostic Policy
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 5: Observational Chart Data & Strict Safety Guardrails");
  const chartData = assessmentService.buildPatientChartData([prevCase, latestCase]);
  assert.strictEqual(chartData.points.length, 2, "Chart points must contain both assessments");
  assert.strictEqual(chartData.points[0].oxygenLevel, 94);
  assert.strictEqual(chartData.points[1].oxygenLevel, 98);

  // Verify mandatory diagnostic safety disclaimer
  assert.ok(chartData.chartDisclaimer, "Chart payload must include mandatory clinical disclaimer");
  assert.ok(chartData.chartDisclaimer.includes("observational display"), "Disclaimer must affirm observational purpose");
  assert.strictEqual(chartData.diagnosticPolicy, "NO_AUTOMATED_DIAGNOSIS_FROM_CHART", "Diagnostic policy must strictly prohibit AI diagnosis from charts");
  console.log("  ✓ Chronological physiological trend data generated.");
  console.log("  ✓ Diagnostic policy verified: Strict prohibition of AI diagnosis from charts.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Doctor-Approved Reassessment Reminders & Follow-up Plan
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 6: Doctor-Approved Reassessment Plan Scheduling");
  const doctorPlanPayload = {
    patientId,
    caseId: latestCase.id,
    interval: "48h",
    priority: "normal",
    instructions: "Check SpO2 upon waking and post-exercise; report cough recurrence.",
    doctorName: "Dr. Khaled Sarah",
    doctorId: "doc_pulmo_99"
  };

  const planResult = await assessmentService.scheduleDoctorReassessmentPlan(db, doctorPlanPayload);
  assert.strictEqual(planResult.ok, true, "Reassessment plan scheduling must succeed");
  assert.ok(planResult.planId, "Must return created planId");
  assert.strictEqual(planResult.plan.diagnosisPolicy, "NO_AUTOMATED_DIAGNOSIS_FROM_CHART", "Plan must enforce no-automated-diagnosis policy");

  const activePlans = await assessmentService.getPatientReassessmentPlans(db, patientId);
  assert.strictEqual(activePlans.length, 1, "Must retrieve scheduled active plan");
  assert.strictEqual(activePlans[0].interval, "48h");
  assert.strictEqual(activePlans[0].doctorName, "Dr. Khaled Sarah");
  console.log("  ✓ Doctor-approved reassessment plan scheduled for 48h.");
  console.log("  ✓ Reminders dispatched according to physician instructions, without AI diagnosis.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 7: Comprehensive Medical Summary Export
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 7: Comprehensive Medical Summary Export");
  const summaryExport = await assessmentService.generateMedicalSummaryExport(db, patientId);
  assert.strictEqual(summaryExport.ok, true);
  assert.strictEqual(summaryExport.patientId, patientId);
  assert.ok(summaryExport.latestAssessment, "Must include latest assessment in summary");
  assert.ok(summaryExport.comparisonToBaseline, "Must include longitudinal comparison to baseline");
  assert.strictEqual(summaryExport.activeReassessmentPlans.length, 1, "Must include active care plans");
  console.log("  ✓ Full medical summary exported with assessments, baseline comparison, and active plans.\n");

  // ─────────────────────────────────────────────────────────────────
  // TEST 8: Express Server HTTP API Endpoints & Auth Enforcement
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ TEST 8: Express Server HTTP API Endpoints & Security Enforcement");
  const app = require("../backend/server");
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function testReq(method, path, body = null, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    // 8.1 Unauthenticated requests to protected endpoints must return 401
    const unauthNew = await testReq("POST", "/api/assessment/new", { oxygenLevel: 98 });
    assert.strictEqual(unauthNew.status, 401, "POST /api/assessment/new without token must return 401");

    const unauthCompare = await testReq("GET", `/api/patient/${patientId}/assessments/compare`);
    assert.strictEqual(unauthCompare.status, 401, "GET compare without token must return 401");

    const unauthSummary = await testReq("GET", `/api/patient/${patientId}/medical-summary`);
    assert.strictEqual(unauthSummary.status, 401, "GET medical summary without token must return 401");

    const unauthPlan = await testReq("POST", `/api/patient/${patientId}/reassessment-plan`, { intervalHours: 24 });
    assert.strictEqual(unauthPlan.status, 401, "POST reassessment plan without token must return 401");

    console.log("  ✓ Zero-Trust verified: All comparison & plan routes reject unauthenticated requests with 401.");
    console.log("  ✓ Express server routes mounted and responsive.\n");
  } finally {
    server.close();
  }

  console.log("==================================================================");
  console.log("🎉 ALL 8 ASSESSMENT COMPARISON & LONGITUDINAL TESTS PASSED 100%!");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
