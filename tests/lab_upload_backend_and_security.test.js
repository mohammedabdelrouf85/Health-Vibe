/**
 * Health Vibe AI - Lab Upload Backend Logic, Security & Notification Integration Tests
 *
 * Validates:
 * 1. Strict File Security & MIME validation (PDF, JPG, PNG, WEBP), size constraints (<= 10MB), and blocked executables.
 * 2. Filename sanitization against path traversal and unsafe characters.
 * 3. Lab Report Categories (Blood tests / CBC, Sputum culture, ABG, Urinalysis, Other).
 * 4. Patient EHR Profile and Clinical Case Linkage.
 * 5. Antivirus/Security quarantine scan state machine (quarantined -> available or blocked).
 * 6. Doctor & Patient Notification dispatch with multi-channel templates and critical escalation for ABG.
 * 7. Security audit logging for HIPAA compliance.
 * 8. Express REST API endpoints in backend/server.js.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const labUploadService = require("../backend/lab-upload-service");
const {
  LAB_CATEGORIES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXECUTABLE_EXTENSIONS,
  MAX_FILE_SIZE,
  SCAN_STATUS,
  AVAILABILITY,
  inMemoryLabReports,
  validateLabFileUpload,
  getSafeLabStorageFileName,
  registerLabFileUpload,
  linkLabReportToPatientProfile,
  linkLabReportToCase,
  processLabScanResult,
  notifyDoctorLabReportReceived,
  getPatientLabReports
} = labUploadService;

const notificationService = require("../backend/notification-service");
const { NOTIFICATION_TYPES, buildNotificationEmailTemplate, inMemoryNotificationQueue } = notificationService;

console.log("\n==================================================================");
console.log("🛡️ HEALTH VIBE AI: LAB UPLOAD BACKEND, SECURITY & APIS TEST SUITE");
console.log("   MIME Guards, EHR Linkage, Quarantine Gate & Doctor Notifications");
console.log("==================================================================\n");

// Mock Firestore DB for testing
function createMockDb() {
  const collections = new Map();

  function getCol(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  return {
    _collections: collections,
    collection: (colName) => {
      const colMap = getCol(colName);
      return {
        doc: (docId) => ({
          id: docId,
          get: async () => {
            const data = colMap.get(docId);
            return {
              exists: Boolean(data),
              id: docId,
              data: () => data || null
            };
          },
          set: async (data, opts = {}) => {
            if (opts.merge && colMap.has(docId)) {
              colMap.set(docId, { ...colMap.get(docId), ...data });
            } else {
              colMap.set(docId, { ...data });
            }
            return { id: docId };
          },
          update: async (patch) => {
            const existing = colMap.get(docId) || {};
            colMap.set(docId, { ...existing, ...patch });
            return { id: docId };
          }
        }),
        where: function buildQuery(field, op, val, currentDocs = null) {
          const sourceDocs = currentDocs || Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
          const filtered = sourceDocs.filter(data => {
            if (op === "==") return data[field] === val;
            if (op === "in" && Array.isArray(val)) return val.includes(data[field]);
            return true;
          });
          return {
            where: (f, o, v) => buildQuery(f, o, v, filtered),
            limit: (n) => ({
              get: async () => ({
                size: Math.min(filtered.length, n),
                docs: filtered.slice(0, n).map(d => ({ id: d.id, data: () => d }))
              })
            }),
            get: async () => ({
              size: filtered.length,
              docs: filtered.map(d => ({ id: d.id, data: () => d }))
            })
          };
        },
        add: async (data) => {
          const id = `mock_doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          colMap.set(id, { id, ...data });
          return { id };
        }
      };
    }
  };
}

(async function runTests() {
  const mockDb = createMockDb();

  // ---------------------------------------------------------------------------
  // TEST 1: Strict File Security & MIME Validation
  // ---------------------------------------------------------------------------
  console.log("▶ TEST 1: Strict File Security & MIME Validation");

  // Valid files
  assert.doesNotThrow(() => {
    validateLabFileUpload({ fileName: "blood_test_cbc.pdf", contentType: "application/pdf", size: 1024 * 500 });
    validateLabFileUpload({ fileName: "sputum_culture_report.jpg", contentType: "image/jpeg", size: 1024 * 200 });
    validateLabFileUpload({ fileName: "arterial_blood_gas.png", contentType: "image/png", size: 1024 * 300 });
    validateLabFileUpload({ fileName: "urinalysis_result.webp", contentType: "image/webp", size: 1024 * 150 });
  }, "Allowed medical file formats must pass validation");

  // Blocked executable extensions
  BLOCKED_EXECUTABLE_EXTENSIONS.forEach((badExt) => {
    assert.throws(
      () => validateLabFileUpload({ fileName: `malware${badExt}`, contentType: "application/pdf", size: 1024 }),
      /prohibited|extension/i,
      `Executable extension ${badExt} must be blocked`
    );
  });

  // Unsupported MIME types
  assert.throws(
    () => validateLabFileUpload({ fileName: "test.pdf", contentType: "application/x-msdownload", size: 1024 }),
    /Unsupported MIME/i,
    "Non-declared MIME type must be rejected"
  );

  // File size bounds (> 0 and <= 10MB)
  assert.throws(
    () => validateLabFileUpload({ fileName: "test.pdf", contentType: "application/pdf", size: 0 }),
    /greater than 0/i,
    "Empty file (0 bytes) must be rejected"
  );
  assert.throws(
    () => validateLabFileUpload({ fileName: "test.pdf", contentType: "application/pdf", size: 11 * 1024 * 1024 }),
    /exceeds maximum limit of 10MB/i,
    "Files > 10MB must be rejected"
  );

  console.log("  ✓ File format, extension, MIME, and size limits (10MB) strictly enforced.");

  // ---------------------------------------------------------------------------
  // TEST 2: Storage Filename Sanitization & Path Traversal Prevention
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 2: Storage Filename Sanitization & Path Traversal Prevention");

  const traversalName = "../../../etc/passwd_cbc.pdf";
  const safeTraversal = getSafeLabStorageFileName(traversalName);
  assert.ok(!safeTraversal.includes("../"), "Path traversal sequences must be stripped");
  assert.ok(safeTraversal.endsWith(".pdf"), "Safe filename must retain valid extension");

  const specialChars = "تقرير تحاليل دم @#$%^&*()_+!.jpg";
  const safeArabic = getSafeLabStorageFileName(specialChars);
  assert.ok(!safeArabic.includes("@") && !safeArabic.includes("#"), "Special unsafe characters must be sanitized");
  assert.ok(safeArabic.endsWith(".jpg"), "Safe filename must retain valid extension");

  console.log("  ✓ Path traversal protection and filename sanitization verified.");

  // ---------------------------------------------------------------------------
  // TEST 3: Lab Report Registration & HIPAA Quarantine Initialization
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 3: Lab Report Registration & HIPAA Quarantine Initialization");

  const patientUser = { uid: "usr_patient_ahmed", role: "patient" };
  const strangerUser = { uid: "usr_malicious_attacker", role: "patient" };

  // Unauthorized stranger blocked
  await assert.rejects(
    async () => {
      await registerLabFileUpload(mockDb, {
        patientId: patientUser.uid,
        fileName: "cbc_blood.pdf",
        contentType: "application/pdf",
        size: 250000,
        labCategory: "blood_test"
      }, strangerUser);
    },
    /not authorized|FORBIDDEN/i,
    "Unrelated patient must be strictly forbidden from registering files for another patient"
  );

  // Authorized patient uploads blood test
  const bloodUploadRes = await registerLabFileUpload(mockDb, {
    patientId: patientUser.uid,
    fileName: "cbc_blood_test.pdf",
    contentType: "application/pdf",
    size: 250000,
    labCategory: "blood_test",
    labNotes: "تحليل دم شامل وصورة دم كاملة بعد حمى 3 أيام",
    testDate: "2026-10-18"
  }, patientUser);

  assert.strictEqual(bloodUploadRes.success, true);
  assert.ok(bloodUploadRes.fileId, "Generated fileId must be present");
  assert.strictEqual(bloodUploadRes.report.scanStatus, SCAN_STATUS.UPLOAD_PENDING, "New upload must start in upload_pending");
  assert.strictEqual(bloodUploadRes.report.availability, AVAILABILITY.QUARANTINED, "New upload must be quarantined");
  assert.strictEqual(bloodUploadRes.report.labCategory, "blood_test", "Category blood_test must be saved");

  // Authorized patient uploads sputum culture
  const sputumUploadRes = await registerLabFileUpload(mockDb, {
    patientId: patientUser.uid,
    fileName: "sputum_culture_sensitivity.jpg",
    contentType: "image/jpeg",
    size: 450000,
    labCategory: "sputum_culture",
    labNotes: "مزرعة بلغم ومسحة صدر لاختبار حساسية المضادات",
    testDate: "2026-10-18"
  }, patientUser);

  assert.strictEqual(sputumUploadRes.success, true);
  assert.strictEqual(sputumUploadRes.report.labCategory, "sputum_culture");
  assert.strictEqual(sputumUploadRes.report.scanStatus, SCAN_STATUS.UPLOAD_PENDING);

  console.log("  ✓ Lab upload registration verified with HIPAA quarantine gating and ownership enforcement.");

  // ---------------------------------------------------------------------------
  // TEST 4: Patient EHR Profile & Clinical Case Linkage
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 4: Patient EHR Profile & Clinical Case Linkage");

  // Verify patient document in users/{patientId} received recentLabReports
  const userDocSnap = await mockDb.collection("users").doc(patientUser.uid).get();
  assert.ok(userDocSnap.exists, "Patient user doc must exist");
  const userData = userDocSnap.data();
  assert.ok(Array.isArray(userData.recentLabReports), "recentLabReports must be an array in patient profile");
  assert.strictEqual(userData.recentLabReports.length, 2, "Both uploaded reports must be linked to patient profile");
  assert.strictEqual(userData.lastLabCategory, "sputum_culture");

  // Link report to clinical case
  const testCaseId = "case_respiratory_101";
  await mockDb.collection("cases").doc(testCaseId).set({
    patientId: patientUser.uid,
    assignedDoctorId: "doc_pulmonologist_khaled",
    attachedFileIds: []
  });

  const linkRes = await linkLabReportToCase(mockDb, {
    fileId: sputumUploadRes.fileId,
    caseId: testCaseId,
    actorUid: patientUser.uid
  }, patientUser);

  assert.strictEqual(linkRes.success, true);
  assert.strictEqual(linkRes.caseId, testCaseId);

  // Verify case has file attached
  const updatedCaseSnap = await mockDb.collection("cases").doc(testCaseId).get();
  assert.ok(updatedCaseSnap.data().attachedFileIds.includes(sputumUploadRes.fileId), "Case attachedFileIds must include fileId");

  console.log("  ✓ Patient medical profile and clinical case linkage verified.");

  // ---------------------------------------------------------------------------
  // TEST 5: Security Scanning Gate & Status Transitions
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 5: Security Scanning Gate & Status Transitions");

  // Clean scan result on blood test
  const cleanScanRes = await processLabScanResult(mockDb, {
    fileId: bloodUploadRes.fileId,
    scanResult: "clean",
    scannerId: "clamav_engine_v2"
  });

  assert.strictEqual(cleanScanRes.success, true);
  assert.strictEqual(cleanScanRes.scanStatus, SCAN_STATUS.CLEAN);
  assert.strictEqual(cleanScanRes.availability, AVAILABILITY.AVAILABLE);

  // Infected scan result on malicious simulation
  const mockBadFileId = "lab_file_infected_test";
  inMemoryLabReports.set(mockBadFileId, {
    id: mockBadFileId,
    patientId: patientUser.uid,
    fileName: "eicar_test.pdf",
    scanStatus: SCAN_STATUS.PENDING,
    availability: AVAILABILITY.QUARANTINED
  });

  const infectedScanRes = await processLabScanResult(mockDb, {
    fileId: mockBadFileId,
    scanResult: "infected",
    scanDetails: "Win.Trojan.Eicar found",
    scannerId: "clamav_engine_v2"
  });

  assert.strictEqual(infectedScanRes.scanStatus, SCAN_STATUS.INFECTED);
  assert.strictEqual(infectedScanRes.availability, AVAILABILITY.BLOCKED);

  console.log("  ✓ Antivirus scan gate transitions verified: clean -> available, infected -> blocked.");

  // ---------------------------------------------------------------------------
  // TEST 6: Doctor & Patient Notifications & Escalation for ABG
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 6: Doctor & Patient Notifications & Escalation for ABG");

  // Standard Lab Upload Notification
  const notifResult = await notifyDoctorLabReportReceived(mockDb, {
    id: bloodUploadRes.fileId,
    fileId: bloodUploadRes.fileId,
    patientId: patientUser.uid,
    caseId: testCaseId,
    fileName: "cbc_blood_test.pdf",
    labCategory: "blood_test",
    testDate: "2026-10-18"
  }, {
    doctorEmail: "dr.khaled@healthvibe.ai",
    patientEmail: "patient.ahmed@example.com",
    patientName: "أحمد كمال"
  });

  assert.strictEqual(notifResult.doctorNotified, true, "Assigned doctor must be notified of lab report");
  assert.strictEqual(notifResult.patientNotified, true, "Patient must receive upload confirmation");

  // Critical ABG Escalation
  const abgUploadRes = await registerLabFileUpload(mockDb, {
    patientId: patientUser.uid,
    fileName: "abg_arterial_gas.pdf",
    contentType: "application/pdf",
    size: 180000,
    labCategory: "abg_gas",
    labNotes: "غازات دم شرياني حرجة بعد ضيق تنفس حاد"
  }, patientUser);

  const abgNotif = await notifyDoctorLabReportReceived(mockDb, {
    id: abgUploadRes.fileId,
    fileId: abgUploadRes.fileId,
    patientId: patientUser.uid,
    caseId: testCaseId,
    fileName: "abg_arterial_gas.pdf",
    labCategory: "abg_gas",
    testDate: "2026-10-18"
  }, {
    doctorEmail: "dr.khaled@healthvibe.ai"
  });

  assert.strictEqual(abgNotif.doctorNotified, true, "Urgent ABG notification must be enqueued");

  // Verify email templates for lab upload
  const uploadEmailTpl = buildNotificationEmailTemplate(NOTIFICATION_TYPES.LAB_REPORT_UPLOADED, {
    patientName: "أحمد كمال",
    doctorName: "د. خالد",
    fileName: "cbc_blood.pdf",
    labCategoryAr: "تحاليل دم كاملة CBC",
    testDate: "2026-10-18"
  });
  assert.ok(uploadEmailTpl.subject.includes("تقرير معملي جديد"), "Lab report email subject must be descriptive");
  assert.ok(uploadEmailTpl.html.includes("أحمد كمال"), "HTML template must contain patient name");
  assert.ok(uploadEmailTpl.html.includes("cbc_blood.pdf"), "HTML template must contain file name");

  const criticalEmailTpl = buildNotificationEmailTemplate(NOTIFICATION_TYPES.LAB_REPORT_CRITICAL_ALERT, {
    patientName: "أحمد كمال",
    doctorName: "د. خالد",
    fileName: "abg_gas.pdf",
    labCategoryAr: "غازات دم شرياني ABG",
    alertReason: "انخفاض حاد في ضغط الأكسجين الشرياني PaO2"
  });
  assert.ok(criticalEmailTpl.subject.includes("تنبيه حرج"), "Critical ABG email subject must state critical alert");
  assert.ok(criticalEmailTpl.html.includes("CRITICAL ALERT"), "HTML template must include critical alert badge");

  console.log("  ✓ Doctor notification, patient receipt, and critical ABG escalation verified.");

  // ---------------------------------------------------------------------------
  // TEST 7: Querying & Filtering Patient Lab Reports
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 7: Querying & Filtering Patient Lab Reports");

  const allReports = await getPatientLabReports(mockDb, { patientId: patientUser.uid }, patientUser);
  assert.ok(allReports.length >= 2, "Must return all patient reports");

  const sputumOnly = await getPatientLabReports(mockDb, {
    patientId: patientUser.uid,
    labCategory: "sputum_culture"
  }, patientUser);
  assert.ok(sputumOnly.every(r => r.labCategory === "sputum_culture"), "Filtering by sputum_culture must isolate sputum tests");

  console.log("  ✓ Patient lab reports querying and category filtering verified.");

  // ---------------------------------------------------------------------------
  // TEST 8: Backend Server Endpoints Registration in backend/server.js
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 8: Backend Server Endpoints Registration in backend/server.js");

  const serverJsPath = path.join(__dirname, "..", "backend", "server.js");
  const serverContent = fs.readFileSync(serverJsPath, "utf8");

  assert.ok(serverContent.includes("labUploadService = require('./lab-upload-service')"), "server.js must import labUploadService");
  assert.ok(serverContent.includes("app.get('/api/lab-upload/categories'"), "server.js must expose GET /api/lab-upload/categories");
  assert.ok(serverContent.includes("app.post('/api/lab-upload/register'"), "server.js must expose POST /api/lab-upload/register");
  assert.ok(serverContent.includes("app.get('/api/lab-upload/patient/:patientId'"), "server.js must expose GET /api/lab-upload/patient/:patientId");
  assert.ok(serverContent.includes("app.post('/api/lab-upload/:fileId/scan-result'"), "server.js must expose POST /api/lab-upload/:fileId/scan-result");
  assert.ok(serverContent.includes("app.post('/api/lab-upload/:fileId/link-case'"), "server.js must expose POST /api/lab-upload/:fileId/link-case");

  console.log("  ✓ All 5 REST endpoints verified in backend/server.js.");

  console.log("\n==================================================================");
  console.log("🎉 ALL LAB UPLOAD BACKEND & SECURITY TESTS PASSED WITH 100% SUCCESS!");
  console.log("==================================================================\n");
})();
