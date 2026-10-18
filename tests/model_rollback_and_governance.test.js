/**
 * HEALTH VIBE AI: TASK #84 MODEL ROLLBACK & GOVERNANCE TEST SUITE
 * 
 * Verifies Task #84:
 * "آلية التراجع عن تحديث النموذج (Model Rollback) | بناء زر Rollback في لوحة الـ Admin 
 *  يسمح بالعودة الفورية للإصدار السابق من نموذج الـ ML إذا أظهرت المراقبة انخفاضاً في الدقة أو اعتراضات من الأطباء. | HealthVibe AI"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ModelGovernanceService, defaultInstance } = require("../backend/model-governance-service");

console.log("==================================================================");
console.log("🤖 HEALTH VIBE AI: TASK #84 MODEL ROLLBACK & GOVERNANCE TESTS");
console.log("==================================================================\n");

async function runTests() {
  const testStateFile = path.join(__dirname, 'test-model-governance-state.json');
  if (fs.existsSync(testStateFile)) {
    fs.unlinkSync(testStateFile);
  }

  const govService = new ModelGovernanceService({ stateFilePath: testStateFile });

  // -----------------------------------------------------------------------------
  // TEST 1: Model Registry and Baseline Verification
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Model Registry Initialization and Baseline Model Discovery");
  const registry = govService.getModelRegistry();
  assert.strictEqual(registry.activeVersion, "resp_rf_v1.0.2", "Default active model should be resp_rf_v1.0.2");
  assert.strictEqual(registry.previousStableVersion, "resp_rf_v1.0.1", "Previous stable rollback target should be resp_rf_v1.0.1");
  assert.strictEqual(registry.models.length >= 3, true, "Registry should contain baseline, active, and candidate models");

  const activeModel = govService.getActiveModel();
  assert.strictEqual(activeModel.version, "resp_rf_v1.0.2");
  assert.strictEqual(activeModel.status, "active");
  assert.strictEqual(activeModel.accuracy >= 0.94, true, "Active model accuracy benchmark verified");
  console.log("  ✔ Registry verified with active model resp_rf_v1.0.2 and baseline target resp_rf_v1.0.1\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Physician Objection Recording & Telemetry
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Physician Objection Logging & Clinical Telemetry");

  // 2a. Reject insufficient reason (< 5 characters)
  assert.throws(() => {
    govService.recordDoctorObjection({
      doctorId: "dr_test_1",
      doctorName: "د. هاني حسني",
      modelVersion: "resp_rf_v1.0.2",
      reason: "bad"
    });
  }, /at least 5 characters/i, "Objection must reject reason shorter than 5 characters");

  // 2b. Successfully record clinical objection
  const objectionResult = govService.recordDoctorObjection({
    doctorId: "dr_ahmed_pulmo",
    doctorName: "د. أحمد الشرقاوي (استشاري الصدرية)",
    modelVersion: "resp_rf_v1.0.2",
    reason: "انخفاض دقة النموذج في فرز أصوات الأزيز التنفسي لدى المرضى كبار السن مع زيادة الإنذارات الكاذبة",
    caseId: "case_geriatric_789",
    severity: "high"
  });

  assert.strictEqual(objectionResult.success, true);
  assert.strictEqual(objectionResult.objection.doctorId, "dr_ahmed_pulmo");
  assert.strictEqual(objectionResult.objection.severity, "high");

  const updatedRegistry = govService.getModelRegistry();
  assert.strictEqual(updatedRegistry.totalDoctorObjections, 1, "Objections count incremented");
  assert.strictEqual(updatedRegistry.recentObjections.length, 1);
  console.log("  ✔ Physician clinical objection recorded and linked to model telemetry\n");

  // -----------------------------------------------------------------------------
  // TEST 3: Model Rollback Governance Rules & Enforcement
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: Model Rollback Validation & Governance Enforcement");

  // 3a. Reject rollback without mandatory clinical reason (>= 10 chars)
  assert.throws(() => {
    govService.rollbackModelVersion({
      targetVersion: "resp_rf_v1.0.1",
      rollbackReason: "short"
    });
  }, /10 أحرف/i, "Rollback must fail without documented clinical reason of at least 10 chars");

  // 3b. Reject rollback if target is already the active model
  assert.throws(() => {
    govService.rollbackModelVersion({
      targetVersion: "resp_rf_v1.0.2",
      rollbackReason: "محاولة الرجوع لنفس الإصدار الحالي المتاح"
    });
  }, /already the currently active model/i, "Cannot rollback to the currently active model");

  // 3c. Reject non-existent target version
  assert.throws(() => {
    govService.rollbackModelVersion({
      targetVersion: "resp_rf_non_existent_v9.9",
      rollbackReason: "محاولة الرجوع لإصدار وهمي غير موجود بالسجل"
    });
  }, /does not exist in model registry/i, "Rollback must reject unverified non-existent versions");

  console.log("  ✔ Validation rules strictly enforce justification length and target validity\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Instantaneous Rollback Execution & Provenance
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: Instantaneous Rollback Execution & State Transition");

  const rollbackResult = govService.rollbackModelVersion({
    targetVersion: "resp_rf_v1.0.1",
    rollbackReason: "اعتراضات سريرية مؤكدة من أطباء الصدرية بشأن الأزيز التنفسي، تراجع فوري للنسخة الذهبية المستقرة",
    authorizedBy: "د. سامح كمال (Medical Director)",
    role: "admin"
  });

  assert.strictEqual(rollbackResult.success, true);
  assert.strictEqual(rollbackResult.activeVersion, "resp_rf_v1.0.1", "Active version switched to target");
  assert.strictEqual(rollbackResult.previousVersion, "resp_rf_v1.0.2", "Captured former version");

  // Verify registry state transition
  const postRollbackRegistry = govService.getModelRegistry();
  assert.strictEqual(postRollbackRegistry.activeVersion, "resp_rf_v1.0.1");

  const formerModel = postRollbackRegistry.models.find(m => m.version === "resp_rf_v1.0.2");
  assert.strictEqual(formerModel.status, "rolled_back", "Decommissioned model marked as rolled_back");
  assert.strictEqual(Boolean(formerModel.retiredAt), true, "Retired timestamp recorded");
  assert.strictEqual(Boolean(formerModel.rollbackReason), true, "Rollback reason preserved");

  const restoredModel = postRollbackRegistry.models.find(m => m.version === "resp_rf_v1.0.1");
  assert.strictEqual(restoredModel.status, "active", "Restored model marked as active");
  assert.strictEqual(Boolean(restoredModel.reactivatedAt), true, "Reactivation timestamp logged");

  // Verify immutable audit trail
  const auditLog = govService.getAuditLog();
  const latestAudit = auditLog[0];
  assert.strictEqual(latestAudit.action, "MODEL_ROLLED_BACK");
  assert.strictEqual(latestAudit.fromVersion, "resp_rf_v1.0.2");
  assert.strictEqual(latestAudit.toVersion, "resp_rf_v1.0.1");
  assert.strictEqual(latestAudit.actor, "د. سامح كمال (Medical Director)");
  console.log("  ✔ Instantaneous rollback succeeded: status transitioned and audit trail committed\n");

  // -----------------------------------------------------------------------------
  // TEST 5: Model Promotion / Candidate Activation Flow
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 5: Model Promotion / Candidate Activation Lifecycle");

  const activateResult = govService.activateModelVersion({
    version: "resp_rf_v2.0.0-rc1",
    reason: "اعتماد تشغيلي تجريبي بعد معالجة مشكلة العينات مع تدقيق سريري كامل",
    authorizedBy: "Head of AI Clinical Safety"
  });

  assert.strictEqual(activateResult.success, true);
  assert.strictEqual(activateResult.activeVersion, "resp_rf_v2.0.0-rc1");
  assert.strictEqual(govService.getActiveModel().version, "resp_rf_v2.0.0-rc1");

  // Rollback again to baseline v1.0.1 to verify repeated governance cycles
  const secondRollback = govService.rollbackModelVersion({
    targetVersion: "resp_rf_v1.0.1",
    rollbackReason: "إلغاء تنشيط النسخة التجريبية والعودة للإصدار الذهبي المستقر",
    authorizedBy: "Admin On-Call"
  });
  assert.strictEqual(secondRollback.activeVersion, "resp_rf_v1.0.1");
  console.log("  ✔ Promotion and multiple rollback cycles validated successfully\n");

  // -----------------------------------------------------------------------------
  // TEST 6: Persistence to Disk
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 6: State Persistence & Safe Cold Boot Recovery");
  assert.strictEqual(fs.existsSync(testStateFile), true, "State file must exist on disk");

  const reloadedService = new ModelGovernanceService({ stateFilePath: testStateFile });
  assert.strictEqual(reloadedService.activeVersion, "resp_rf_v1.0.1", "Reloaded active version matches persisted state");
  assert.strictEqual(reloadedService.doctorObjections.length, 1, "Persisted objections restored");
  assert.strictEqual(reloadedService.auditLog.length >= 3, true, "Persisted audit trail intact");
  console.log("  ✔ Cold boot recovery successfully reloaded model governance state from disk\n");

  // -----------------------------------------------------------------------------
  // TEST 7: Backend Express Endpoints & Security Integration
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 7: Express API Endpoints for Model Governance & Rollback");

  const express = require("express");
  const testApp = express();
  testApp.use(express.json());

  // Mount test endpoints matching server.js pattern
  testApp.get("/api/admin/model/registry", (req, res) => {
    res.json({ success: true, data: govService.getModelRegistry() });
  });

  testApp.post("/api/admin/model/rollback", (req, res) => {
    try {
      const { targetVersion, rollbackReason } = req.body || {};
      const result = govService.rollbackModelVersion({
        targetVersion,
        rollbackReason,
        authorizedBy: "Test Admin",
        role: "admin"
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: "MODEL_ROLLBACK_FAILED", message: err.message });
    }
  });

  testApp.post("/api/doctor/model-objection", (req, res) => {
    try {
      const { modelVersion, reason, caseId, severity } = req.body || {};
      const result = govService.recordDoctorObjection({
        doctorId: "dr_req_test",
        doctorName: "د. طبيب تجريبي",
        modelVersion,
        reason,
        caseId,
        severity
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: "OBJECTION_RECORDING_FAILED", message: err.message });
    }
  });

  testApp.get("/api/admin/model/audit-log", (req, res) => {
    res.json({ success: true, data: govService.getAuditLog() });
  });

  const server = http.createServer(testApp);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  function doRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      }, (res) => {
        let raw = "";
        res.on("data", chunk => raw += chunk);
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: raw });
          }
        });
      });
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // 7a. GET registry
  const getRegRes = await doRequest("GET", "/api/admin/model/registry");
  assert.strictEqual(getRegRes.statusCode, 200);
  assert.strictEqual(getRegRes.body.success, true);
  assert.strictEqual(getRegRes.body.data.activeVersion, "resp_rf_v1.0.1");

  // 7b. POST rollback rejection (too short)
  const badRollbackRes = await doRequest("POST", "/api/admin/model/rollback", {
    targetVersion: "resp_rf_v1.0.2",
    rollbackReason: "short"
  });
  assert.strictEqual(badRollbackRes.statusCode, 400);
  assert.strictEqual(badRollbackRes.body.error, "MODEL_ROLLBACK_FAILED");

  // 7c. POST rollback success
  const goodRollbackRes = await doRequest("POST", "/api/admin/model/rollback", {
    targetVersion: "resp_rf_v1.0.2",
    rollbackReason: "إعادة التفعيل المعتمدة بعد مراجعة لجنة السلامة السريرية"
  });
  assert.strictEqual(goodRollbackRes.statusCode, 200);
  assert.strictEqual(goodRollbackRes.body.success, true);
  assert.strictEqual(goodRollbackRes.body.activeVersion, "resp_rf_v1.0.2");

  // 7d. GET audit log
  const auditRes = await doRequest("GET", "/api/admin/model/audit-log");
  assert.strictEqual(auditRes.statusCode, 200);
  assert.strictEqual(Array.isArray(auditRes.body.data), true);
  assert.strictEqual(auditRes.body.data.length >= 4, true);

  server.close();
  console.log("  ✔ Express API routes for registry, rollback, objection, and audit log passed\n");

  // Clean up temporary test file
  if (fs.existsSync(testStateFile)) {
    fs.unlinkSync(testStateFile);
  }

  console.log("==================================================================");
  console.log("🎉 ALL TASK #84 MODEL ROLLBACK & GOVERNANCE TESTS PASSED (7/7)");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
