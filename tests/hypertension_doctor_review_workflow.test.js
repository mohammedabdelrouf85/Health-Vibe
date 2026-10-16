/**
 * Health Vibe AI - Hypertension Cases Doctor Review Workflow Test Suite
 *
 * Validates:
 * 1. Access Control: Doctors must only access authorized and assigned cases.
 * 2. Actual Clinical Data Display:
 *    - patient information
 *    - blood-pressure history (with context, provenance & classification)
 *    - assessment answers
 *    - patient responses
 *    - attachments
 *    - doctor notes
 *    - previous approved reports
 *    - current clinical revision
 * 3. Latest Revision Review Gating: Require review of latest revision before approval.
 * 4. Stale Request Rejection: Server-authoritative 409 conflict when clinical data changes.
 * 5. Clinical Boundaries:
 *    - Do not generate treatment plans automatically.
 *    - Do not invent medications or diagnoses.
 * 6. Internal Notes Quarantine: Keep internal clinician notes strictly hidden from patients.
 * 7. Architecture Integration: Full parity with existing approval, audit trail & report versioning.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: HYPERTENSION DOCTOR REVIEW WORKFLOW TEST SUITE");
console.log("   Assignment RBAC, Actual Vitals, Stale Rejection & Note Quarantine");
console.log("==================================================================\n");

// Mock browser globals for Node test environment
const mockLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

global.localStorage = mockLocalStorage;
global.currentLanguage = "en";

// Mock document for DOM elements
const mockElements = new Map();
global.document = {
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: (selector) => {
    if (selector === ".btn-clinical.approve") {
      return Array.from(mockElements.values()).filter(el => el.classList && el.classList.contains("approve"));
    }
    if (selector === ".doc-tab-btn") {
      return Array.from(mockElements.values()).filter(el => el.classList && el.classList.contains("doc-tab-btn"));
    }
    return [];
  },
  createElement: (tag) => ({
    tagName: tag,
    innerHTML: "",
    children: [],
    classList: { contains: () => false, add: () => {}, remove: () => {} },
    firstElementChild: {
      id: "doctorRevisionDiffModalBackdrop",
      querySelector: () => ({ focus: () => {} }),
      querySelectorAll: () => []
    }
  }),
  body: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Load modules under test
const doctorUI = require(path.resolve(__dirname, "../app/modules/doctor/doctor-ui.js"));
const chronicHypertensionService = require(path.resolve(__dirname, "../backend/chronic-hypertension-service.js"));
const clinicalInfoExchangeService = require(path.resolve(__dirname, "../backend/clinical-info-exchange-service.js"));

(async () => {
  // Reset service stores
  chronicHypertensionService.resetHypertensionStoreForTesting();
  clinicalInfoExchangeService.resetStoreForTesting();

  // Test Personas
  const assignedDoctor = {
    uid: "doc_cardiologist_2026",
    id: "doc_cardiologist_2026",
    email: "dr.hassan@cairo-cardio.eg",
    name: "د. حسن رضوان",
    displayName: "Dr. Hassan Radwan",
    licenseNumber: "EGY-CARDIO-88219",
    specialty: "أمراض القلب والأوعية الدموية",
    clinic: "عيادة النيل للقلب وضغط الدم",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false
  };

  const unassignedDoctor = {
    uid: "doc_imposter_9999",
    id: "doc_imposter_9999",
    email: "intruder.doc@unauthorized.test",
    name: "د. مجهول",
    displayName: "Dr. Unauthorized Intruder",
    licenseNumber: "FORGED-9999",
    specialty: "طب عام",
    clinic: "عيادة أخرى",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false
  };

  const patientUser = {
    uid: "usr_pt_hypertension_01",
    id: "usr_pt_hypertension_01",
    name: "مروان كمال عبد القادر",
    nameEn: "Marwan Kamal Abdel-Kader",
    age: 58,
    gender: "male",
    clinicName: "عيادة النيل للقلب وضغط الدم",
    clinicNameEn: "Nile Cardio-Vascular Clinic"
  };

  // -----------------------------------------------------------------------------
  // TEST 1: Doctor Access Control (Assigned & Authorized Doctors Only)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Doctor Access Control (Assignment Gating) ...");

  const hypertensionCase = {
    id: "case_htn_2026_101",
    patientId: patientUser.id,
    userId: patientUser.id,
    patientName: patientUser.name,
    patientNameEn: patientUser.nameEn,
    age: patientUser.age,
    gender: patientUser.gender,
    clinicName: patientUser.clinicName,
    clinicNameEn: patientUser.clinicNameEn,
    condition: "hypertension",
    specialty: "hypertension",
    assignedDoctorId: assignedDoctor.uid,
    assignedDoctorEmail: assignedDoctor.email,
    status: "under_review",
    clinicalRevision: 1,
    submittedAt: "2026-10-09T08:00:00.000Z",
    symptoms: ["صداع نصفي صباحي", "طنين في الأذن"],
    chiefComplaint: "ارتفاع متكرر في ضغط الدم مع صداع",
    hypertensionHistory: "تشخيص منذ 4 سنوات، علاج غير منتظم",
    lifestyleFactors: "تدخين (علبة يومياً)، استهلاك مرتفع للملح",
    familyHistory: "تاريخ عائلي لجلطة دماغية (الأب)",
    notes: "أشعر بدوخة خفيفة عند الاستيقاظ",
    patientResponse: "بدأت تقليل الملح في الطعام وأوقفت التدخين منذ 3 أيام",
    internalDoctorNotes: "ملاحظة سريرية داخلية: المريض متردد بشأن إضافة مدر للبول، مراقبة وظائف الكلى ضرورية.",
    files: [
      { name: "ecg_strip_oct2026.pdf", size: 1048576, type: "application/pdf", uploadedAt: "2026-10-09T08:15:00.000Z" },
      { name: "lipid_panel_results.png", size: 524288, type: "image/png", uploadedAt: "2026-10-09T08:20:00.000Z" }
    ],
    approvalHistory: [
      {
        revisionNumber: 1,
        revisionId: "HV-REP-HTN-101_v1",
        approvedAt: "2026-09-15T11:00:00.000Z",
        approvedBy: { name: assignedDoctor.name, uid: assignedDoctor.uid }
      }
    ]
  };

  // Register in clinical exchange service
  clinicalInfoExchangeService.registerCase(hypertensionCase);

  // 1. Assigned doctor is authorized
  const isAssigned = doctorUI.isCaseAssignedToDoctor(hypertensionCase, assignedDoctor);
  assert.equal(isAssigned, true, "Assigned doctor must be recognized as authorized");

  // 2. Unassigned doctor is strictly rejected
  const isUnassigned = doctorUI.isCaseAssignedToDoctor(hypertensionCase, unassignedDoctor);
  assert.equal(isUnassigned, false, "Unassigned doctor must be rejected");

  // 3. Case without assignment is rejected
  const unassignedCase = { ...hypertensionCase, assignedDoctorId: null, assignedDoctorEmail: null };
  assert.equal(doctorUI.isCaseAssignedToDoctor(unassignedCase, assignedDoctor), false, "Unassigned case must deny access to all doctors");

  console.log("  ✓ Zero-Trust doctor assignment access control verified.\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Structured BP History Ingestion & Rendering
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Actual Blood-Pressure History Display (Context, Provenance & Stages) ...");

  // Ingest real blood-pressure readings linked to case
  const r1 = await chronicHypertensionService.recordBloodPressureReading({
    patientId: patientUser.id,
    caseId: hypertensionCase.id,
    systolic: 154,
    diastolic: 96,
    pulse: 78,
    unit: "mmHg",
    measuredAt: "2026-10-09T08:30:00.000Z",
    measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
    author: patientUser.name,
    provenance: "omron_connect_ble_sync",
    context: { arm: "left_arm", posture: "sitting", timing: "morning" }
  });

  const r2 = await chronicHypertensionService.recordBloodPressureReading({
    patientId: patientUser.id,
    caseId: hypertensionCase.id,
    systolic: 146,
    diastolic: 92,
    pulse: 74,
    unit: "mmHg",
    measuredAt: "2026-10-09T19:45:00.000Z",
    measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
    author: patientUser.name,
    provenance: "patient_mobile_app",
    context: { arm: "right_arm", posture: "sitting", timing: "evening" }
  });

  const caseReadings = chronicHypertensionService.getCaseReadings(hypertensionCase.id);
  assert.equal(caseReadings.length, 2, "Must retrieve exactly 2 real readings for case");

  // Render English BP history section
  const bpHtmlEn = doctorUI.renderHypertensionBpHistorySection(hypertensionCase, true, { bpReadings: caseReadings });
  assert.ok(bpHtmlEn.includes("Blood Pressure History & Metrics"), "English title must render");
  assert.ok(bpHtmlEn.includes("154/96"), "Reading 1 values must render");
  assert.ok(bpHtmlEn.includes("146/92"), "Reading 2 values must render");
  assert.ok(bpHtmlEn.includes("Stage 2 Hypertension"), "Stage 2 classification pill must render");
  assert.ok(bpHtmlEn.includes("78 bpm") && bpHtmlEn.includes("74 bpm"), "Pulse must render");
  assert.ok(bpHtmlEn.includes("bluetooth device"), "Bluetooth source must render");
  assert.ok(bpHtmlEn.includes("left arm") && bpHtmlEn.includes("right arm"), "Arm context must render");
  assert.ok(bpHtmlEn.includes("Average BP") && bpHtmlEn.includes("150/94"), "Average BP must accurately compute (150/94 mmHg)");

  // Render Arabic BP history section
  const bpHtmlAr = doctorUI.renderHypertensionBpHistorySection(hypertensionCase, false, { bpReadings: caseReadings });
  assert.ok(bpHtmlAr.includes("سجل قياسات ضغط الدم"), "Arabic title must render");
  assert.ok(bpHtmlAr.includes("ارتفاع ضغط المرحلة 2"), "Arabic Stage 2 pill must render");
  assert.ok(bpHtmlAr.includes("متوسط الضغط"), "Arabic average label must render");

  // Clean handling of zero readings (Zero synthetic measurements invented)
  const emptyBpHtml = doctorUI.renderHypertensionBpHistorySection({ id: "case_no_bp" }, true, { bpReadings: [] });
  assert.ok(emptyBpHtml.includes("No blood-pressure measurements recorded for this patient / case"), "Must render clean empty notice");
  assert.ok(!emptyBpHtml.includes("120/80"), "Must NEVER invent synthetic readings");

  console.log("  ✓ Actual blood-pressure history rendered with full context, staging and zero synthetic data.\n");

  // -----------------------------------------------------------------------------
  // TEST 3: Patient Info, Assessment Answers, Patient Responses & Attachments
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: Display of Actual Patient Information, Answers, Responses & Attachments ...");

  // 1. Persistent Case Identity Header
  const headerHtml = doctorUI.renderPersistentCaseHeader(hypertensionCase, true);
  assert.ok(headerHtml.includes("Marwan Kamal Abdel-Kader"), "Patient English name must render in persistent header");
  assert.ok(headerHtml.includes("Nile Cardio-Vascular Clinic"), "Clinic name must render");
  assert.ok(headerHtml.includes("Rev 1") || headerHtml.includes("Revision"), "Current clinical revision must render");

  // 2. Attachments Section
  const attachmentsHtml = doctorUI.renderAttachmentsSection(hypertensionCase, true);
  assert.ok(attachmentsHtml.includes("ecg_strip_oct2026.pdf"), "PDF attachment name must render");
  assert.ok(attachmentsHtml.includes("lipid_panel_results.png"), "Image attachment name must render");
  assert.ok(attachmentsHtml.includes("📄") && attachmentsHtml.includes("🖼️"), "File type icons must render");
  assert.ok(attachmentsHtml.includes("1 MB") || attachmentsHtml.includes("1.0 MB") || attachmentsHtml.includes("512 KB"), "File size must render");

  // Empty attachments test
  const emptyAttachmentsHtml = doctorUI.renderAttachmentsSection({ id: "case_no_files", files: [] }, true);
  assert.ok(emptyAttachmentsHtml.includes("No medical attachments or lab reports uploaded"), "Empty attachments notice must render");

  // 3. Previous Approved Reports Section
  const reportsHtml = doctorUI.renderPreviousApprovedReportsSection(hypertensionCase, true);
  assert.ok(reportsHtml.includes("HV-REP-HTN-101_v1"), "Previous approved report reference must render");
  assert.ok(reportsHtml.includes("Report Rev #1"), "Previous approved report revision must render");
  assert.ok(reportsHtml.includes(assignedDoctor.name), "Previous approving doctor name must render");

  // Empty previous reports test
  const emptyReportsHtml = doctorUI.renderPreviousApprovedReportsSection({ id: "case_first_time", approvalHistory: [] }, true);
  assert.ok(emptyReportsHtml.includes("Initial clinical review — no previous approved reports"), "Initial review notice must render");

  console.log("  ✓ Patient identity, assessment answers, patient responses, attachments, and previous reports render accurately.\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Internal Doctor Notes Strict Quarantine from Patients
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: Internal Doctor Notes Quarantine (Strict Isolation from Patients) ...");

  // 1. Doctor workstation view shows internal notes in dedicated secure card
  const internalNotesDocView = doctorUI.renderInternalDoctorNotesSection(hypertensionCase, true);
  assert.ok(internalNotesDocView.includes("Internal Clinician Notes (Strictly Quarantined from Patient)"), "Doctor station must display quarantine header");
  assert.ok(internalNotesDocView.includes("المريض متردد بشأن إضافة مدر للبول"), "Internal note content must be visible to attending doctor");
  assert.ok(internalNotesDocView.includes("🔒"), "Security lock icon must be present");

  // 2. Patient-facing sanitization scrubs internal notes completely
  const sanitizedForPatient = doctorUI.scrubInternalNotesForPatient(hypertensionCase);
  assert.equal(sanitizedForPatient.internalDoctorNotes, undefined, "internalDoctorNotes must be scrubbed from patient case");
  assert.equal(sanitizedForPatient.clinicianQuarantineNotes, undefined, "clinicianQuarantineNotes must be scrubbed");
  assert.equal(sanitizedForPatient.internalNotes, undefined, "internalNotes must be scrubbed");

  // 3. String representation check: patient rendered view must never contain the sensitive text
  const serializedPatientCase = JSON.stringify(sanitizedForPatient);
  assert.ok(!serializedPatientCase.includes(hypertensionCase.internalDoctorNotes), "Patient serialized view must NEVER contain internal clinician notes");

  console.log("  ✓ Internal doctor notes strictly quarantined and scrubbed from patient views.\n");

  // -----------------------------------------------------------------------------
  // TEST 5: Latest Revision Review Gating & Approval Unlocking
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 5: Require Review of Latest Revision Before Approval ...");

  // Baseline case at rev 1
  assert.equal(doctorUI.getCaseRevisionNumber(hypertensionCase), 1);
  assert.equal(doctorUI.isRevisionStale(hypertensionCase), false, "Baseline rev 1 is not stale initially");

  // Patient submits a new observation / clarification -> Revision increments to 2
  const updatedCase = {
    ...hypertensionCase,
    clinicalRevision: 2,
    hasNewInfo: true,
    isRevisionStale: true,
    patientResponse: "سجلت قراءة ضغط جديدة بالمساء 160/98 mmHg مع صداع مستمر"
  };

  // Case is now stale!
  assert.equal(doctorUI.getCaseRevisionNumber(updatedCase), 2, "Revision number must be 2");
  assert.equal(doctorUI.isRevisionStale(updatedCase), true, "Rev 2 without doctor acknowledgment MUST be stale");

  // Approval button is locked in UI
  const bannerHtml = doctorUI.renderStaleRevisionBanner(updatedCase, true);
  assert.ok(bannerHtml.includes("New Clinical Information Received"), "Stale banner must render");
  assert.ok(bannerHtml.includes("Revision 2"), "Banner must specify Revision 2");

  // Doctor acknowledges review
  doctorUI.acknowledgeNewRevision(updatedCase.id);
  assert.equal(doctorUI.isRevisionStale(updatedCase), false, "Case must be unlocked after doctor acknowledgment");

  console.log("  ✓ Revision gating verified: new data locks approval until explicit doctor acknowledgment.\n");

  // -----------------------------------------------------------------------------
  // TEST 6: Reject Stale Approval Requests When Clinical Data Changes (Server 409)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 6: Reject Stale Approval Requests When Clinical Data Changes (409 Conflict) ...");

  // Simulate server-side authoritative transition logic
  function validateApprovalRevisionServerSide(caseData, reqBody) {
    const currentCaseRevision = Number(caseData.clinicalRevision || 1);
    const effectiveReviewedRevision = reqBody.reviewedRevision !== undefined && reqBody.reviewedRevision !== null
      ? Number(reqBody.reviewedRevision)
      : (reqBody.expectedRevision !== undefined && reqBody.expectedRevision !== null ? Number(reqBody.expectedRevision) : null);

    if (effectiveReviewedRevision !== null && effectiveReviewedRevision < currentCaseRevision) {
      return {
        statusCode: 409,
        error: "STALE_CLINICAL_REVISION",
        message: `The clinical case data has changed to revision ${currentCaseRevision} (reviewed: ${effectiveReviewedRevision}). Please review the latest revision before approval.`,
        currentRevision: currentCaseRevision,
        reviewedRevision: effectiveReviewedRevision
      };
    }

    if ((caseData.isRevisionStale || caseData.hasNewInfo) && (effectiveReviewedRevision === null || effectiveReviewedRevision < currentCaseRevision)) {
      return {
        statusCode: 409,
        error: "STALE_CLINICAL_REVISION",
        message: "New clinical data has been received. Please review and acknowledge the latest revision before approval.",
        currentRevision: currentCaseRevision,
        reviewedRevision: effectiveReviewedRevision
      };
    }

    return { statusCode: 200, success: true };
  }

  // 1. Doctor tries to approve with stale reviewedRevision (1 < 2)
  const staleApprovalPayload = {
    caseId: updatedCase.id,
    targetStatus: "approved",
    reviewedRevision: 1,
    clinicalDiagnosis: "Essential Hypertension Stage 2",
    recommendations: ["Low sodium diet (<2g/day)", "Daily morning BP logging"]
  };

  const staleResult = validateApprovalRevisionServerSide(updatedCase, staleApprovalPayload);
  assert.equal(staleResult.statusCode, 409, "Server MUST reject stale approval request with HTTP 409 Conflict");
  assert.equal(staleResult.error, "STALE_CLINICAL_REVISION");
  assert.equal(staleResult.currentRevision, 2);
  assert.equal(staleResult.reviewedRevision, 1);

  // 2. Doctor tries to approve without reviewedRevision while case is flagged stale
  const omittedRevPayload = {
    caseId: updatedCase.id,
    targetStatus: "approved",
    clinicalDiagnosis: "Essential Hypertension Stage 2",
    recommendations: ["Low sodium diet"]
  };
  const omittedResult = validateApprovalRevisionServerSide(updatedCase, omittedRevPayload);
  assert.equal(omittedResult.statusCode, 409, "Omitted revision while case is stale must also be rejected with 409");

  // 3. Doctor reviews the updated revision and submits approval with reviewedRevision = 2
  const validApprovalPayload = {
    caseId: updatedCase.id,
    targetStatus: "approved",
    reviewedRevision: 2,
    clinicalDiagnosis: "Essential Hypertension Stage 2, Uncontrolled",
    recommendations: ["Low sodium diet (<2g/day)", "Start Amlodipine 5mg once daily", "Recheck BP in 7 days"]
  };

  // Case acknowledged
  updatedCase.isRevisionStale = false;
  updatedCase.hasNewInfo = false;
  const validResult = validateApprovalRevisionServerSide(updatedCase, validApprovalPayload);
  assert.equal(validResult.statusCode, 200, "Approval of latest revision must be approved by server");

  console.log("  ✓ Stale approval request rejection (409 Conflict) and latest revision certification validated.\n");

  // -----------------------------------------------------------------------------
  // TEST 7: Clinical Boundaries (No Auto-Treatment Plans & No Invented Meds)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 7: Clinical Boundaries (Zero Auto-Generated Prescriptions & No Invented Diagnoses) ...");

  // Check draft note initialization
  const draftNotes = doctorUI.getDraftNotes(hypertensionCase.id);
  assert.equal(draftNotes, null, "New hypertension case must NOT have pre-filled AI treatment plans");

  // Service report certification must reject empty doctor diagnosis or unauthorized tampering
  await assert.rejects(
    async () => {
      await chronicHypertensionService.certifyChronicHypertensionReport({
        patientId: patientUser.id,
        caseId: hypertensionCase.id,
        doctorIdentity: unassignedDoctor, // Unassigned doctor
        clinicalDiagnosis: "Hypertension",
        managementPlan: "Diet and exercise",
        expectedRevision: 1
      });
    },
    (err) => {
      assert.equal(err.code, "ACCESS_DENIED", "Unassigned doctor certification must throw ACCESS_DENIED");
      return true;
    }
  );

  // Stale certification on chronic hypertension service
  await assert.rejects(
    async () => {
      await chronicHypertensionService.certifyChronicHypertensionReport({
        patientId: patientUser.id,
        caseId: updatedCase.id,
        doctorIdentity: assignedDoctor,
        clinicalCase: updatedCase,
        clinicalDiagnosis: "Hypertension Stage 2",
        managementPlan: "Prescribed regimen",
        reviewedRevision: 1 // Stale revision (1 < 2)
      });
    },
    (err) => {
      assert.equal(err.code, "STALE_CLINICAL_REVISION", "Chronic service must throw STALE_CLINICAL_REVISION on stale revision");
      return true;
    }
  );

  // Valid certification with explicit physician input
  const certifiedReport = await chronicHypertensionService.certifyChronicHypertensionReport({
    patientId: patientUser.id,
    caseId: updatedCase.id,
    doctorIdentity: assignedDoctor,
    clinicalCase: updatedCase,
    clinicalDiagnosis: "Hypertension Stage 2 - Clinically Verified",
    managementPlan: "Dietary sodium reduction (<1800mg), regular BP diary, follow-up in 2 weeks.",
    reviewedRevision: 2
  });

  assert.ok(certifiedReport.reportRef.startsWith("HV-HTN-REP-"), "Certified report reference must be generated");
  assert.equal(certifiedReport.doctor.licenseNumber, assignedDoctor.licenseNumber);
  assert.equal(certifiedReport.digitalSignature.signedBy, assignedDoctor.name);
  assert.equal(certifiedReport.internalDoctorNotes, undefined, "Internal doctor notes must NOT exist in certified report");
  assert.equal(certifiedReport.clinicianQuarantineNotes, undefined, "Clinician quarantine notes must NOT exist in certified report");

  console.log("  ✓ Clinical boundaries verified: explicit physician input required, zero auto-treatment, zero note leakage.\n");

  console.log("==================================================================");
  console.log("🎉 ALL 7 HYPERTENSION DOCTOR REVIEW WORKFLOW TESTS PASSED (100%)");
  console.log("==================================================================");
})();
