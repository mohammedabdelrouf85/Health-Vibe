/**
 * Health Vibe AI - Blood Clotting / Blood Disorders Module Test Suite
 *
 * Validates:
 * 1. Multi-Condition Architecture (Not assumed to be one single disease):
 *    - Thrombosis (DVT, PE)
 *    - Thrombophilia (Factor V Leiden, Antiphospholipid Syndrome)
 *    - Anticoagulation Management (VKA/Warfarin INR tracking)
 *    - Bleeding Disorders & Coagulopathies (Hemophilia, vWD)
 *    - Platelet Disorders & Thrombocytopenia
 * 2. Medical Reviewer Specification Management:
 *    - Allows medical reviewers to define and customize conditions and required fields before clinical logic.
 *    - Requires verified physician role and license; blocks unauthorized edits.
 *    - Preserves reviewer provenance, license, timestamp, and versioning.
 * 3. Structured Patient Information & Intake:
 *    - Personal & family thrombotic and bleeding history.
 *    - Anticoagulant medication, provoking risk factors, presenting symptoms.
 * 4. Structured Laboratory Results:
 *    - Validates real laboratory tests (PT, INR, aPTT, D-Dimer, Platelets, Fibrinogen, Factor VIII).
 *    - Never invents laboratory results; rejects invalid/empty/negative/future-dated values.
 * 5. Clinical Boundary: ZERO Automatic Diagnoses:
 *    - System strictly leaves diagnosis unpopulated until physician reviews.
 *    - Case approval requires explicit physician-authored diagnosis.
 * 6. Doctor Assignment & Review Workflow:
 *    - Zero-Trust doctor assignment enforcement.
 *    - Internal doctor notes quarantined from patients.
 * 7. Approved Reports & Cryptographic Stamping:
 *    - Formal report snapshot, HMAC-SHA256 signature, reportRef, doctor license.
 * 8. Follow-up Protocol:
 *    - Next recommended lab date, monitoring frequency, red-flag precautions.
 * 9. Integration with Existing Architecture:
 *    - Patient records, cases, audit logs, file attachments, and localization.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🩹 HEALTH VIBE AI: BLOOD DISORDERS & HEMATOLOGY FOUNDATION TEST SUITE");
console.log("   Multi-Condition Registry, Medical Reviewer Specs, Labs & Approvals");
console.log("==================================================================\n");

const bloodDisordersService = require("../backend/blood-disorders-service");
const BloodDisordersUI = require("../app/modules/patient/blood-disorders-ui");

(async () => {
  bloodDisordersService.resetBloodDisordersStoreForTesting();

  const patientId = "usr_patient_hassan_88";
  const approvedHematologist = {
    uid: "doc_hem_tariq",
    name: "د. طارق المنشاوي",
    displayName: "Dr. Tariq Al-Minshawi",
    role: "doctor",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false,
    licenseNumber: "HV-HEM-9021",
    specialty: "Consultant Hematologist"
  };

  const otherDoctor = {
    uid: "doc_other_unassigned",
    name: "طبيب غير مخصص",
    role: "doctor",
    status: "approved",
    licenseStatus: "active",
    licenseNumber: "HV-GEN-1100"
  };

  const revokedDoctor = {
    uid: "doc_revoked_bad",
    name: "طبيب ملغى الترخيص",
    role: "doctor",
    status: "approved",
    licenseStatus: "revoked",
    isLicenseExpired: true,
    licenseNumber: "HV-REV-0000"
  };

  // ===========================================================================
  // TEST 1: Multi-Condition Foundation (Does NOT Assume a Single Disease)
  // ===========================================================================
  console.log("▶ TEST 1: Multi-Condition Hematology Foundation");
  {
    const conditions = bloodDisordersService.getRegisteredConditions();
    assert.ok(conditions.length >= 5, "Registry contains at least 5 distinct hematological conditions");

    const categories = new Set(conditions.map(c => c.category));
    assert.ok(categories.has(bloodDisordersService.CONDITION_CATEGORIES.THROMBOSIS), "Supports Thrombosis");
    assert.ok(categories.has(bloodDisordersService.CONDITION_CATEGORIES.THROMBOPHILIA), "Supports Thrombophilia");
    assert.ok(categories.has(bloodDisordersService.CONDITION_CATEGORIES.ANTICOAGULATION), "Supports Anticoagulation Monitoring");
    assert.ok(categories.has(bloodDisordersService.CONDITION_CATEGORIES.BLEEDING), "Supports Bleeding Disorders");
    assert.ok(categories.has(bloodDisordersService.CONDITION_CATEGORIES.PLATELET), "Supports Platelet Disorders");

    // Check specific condition archetypes
    assert.ok(bloodDisordersService.getConditionById("dvt_pe_thrombosis"), "DVT / PE condition exists");
    assert.ok(bloodDisordersService.getConditionById("thrombophilia_screening"), "Thrombophilia condition exists");
    assert.ok(bloodDisordersService.getConditionById("vka_inr_monitoring"), "VKA INR Monitoring condition exists");
    assert.ok(bloodDisordersService.getConditionById("bleeding_coagulopathy"), "Bleeding coagulopathy condition exists");
    assert.ok(bloodDisordersService.getConditionById("thrombocytopenia_investigation"), "Thrombocytopenia condition exists");

    console.log("  ✓ Verified: Registry supports distinct condition categories across hematology.\n");
  }

  // ===========================================================================
  // TEST 2: Medical Reviewer Specification Management & Authorization
  // ===========================================================================
  console.log("▶ TEST 2: Medical Reviewer Specification Customization & RBAC");
  {
    // 1. Non-doctor cannot define or edit specifications
    assert.throws(
      () => bloodDisordersService.defineOrUpdateConditionSpecification({
        conditionId: "custom_antiphospholipid",
        nameEn: "Antiphospholipid Syndrome",
        nameAr: "متلازمة أضداد الفوسفوليبيد",
        reviewingDoctor: { uid: patientId, role: "patient" } // patient attempt!
      }),
      (err) => err.code === "ACCESS_DENIED_DOCTOR_REQUIRED",
      "Patient cannot define condition specifications"
    );

    // 2. Revoked doctor cannot define specifications
    assert.throws(
      () => bloodDisordersService.defineOrUpdateConditionSpecification({
        conditionId: "custom_antiphospholipid",
        nameEn: "Antiphospholipid Syndrome",
        reviewingDoctor: revokedDoctor
      }),
      (err) => err.code === "INVALID_DOCTOR_LICENSE",
      "Revoked doctor cannot define condition specifications"
    );

    // 3. Approved hematologist defines / customizes condition specification
    const updatedSpec = bloodDisordersService.defineOrUpdateConditionSpecification({
      conditionId: "custom_antiphospholipid",
      nameEn: "Antiphospholipid Syndrome (APS)",
      nameAr: "متلازمة أضداد الفوسفوليبيد (متلازمة هيوز)",
      category: bloodDisordersService.CONDITION_CATEGORIES.THROMBOPHILIA,
      descriptionEn: "Autoimmune hypercoagulable state characterized by arterial/venous thromboses and pregnancy complications.",
      descriptionAr: "حالة فرط تجلط مناعية ذاتية تتميز بجلطات شريانية أو وريدية ومضاعفات الحمل.",
      clinicalGuidelinesRef: "Sydney Consensus / EULAR APS Guidelines 2023",
      requiredClinicalFields: ["thromboticPhenotype", "pregnancyLossTrimester", "livedoReticularis"],
      requiredLabPanels: ["LUPUS_ANTICOAGULANT", "ANTI_CARDIOLIPIN_IGG", "ANTI_BETA2_GLYCOPROTEIN_I"],
      status: bloodDisordersService.SPECIFICATION_STATUS.ACTIVE_SUPPORTED,
      reviewerNotes: "Verified by hematology committee. Ready for clinical cases.",
      reviewingDoctor: approvedHematologist
    });

    assert.equal(updatedSpec.conditionId, "custom_antiphospholipid");
    assert.equal(updatedSpec.status, bloodDisordersService.SPECIFICATION_STATUS.ACTIVE_SUPPORTED);
    assert.equal(updatedSpec.lastReviewedBy.uid, approvedHematologist.uid);
    assert.equal(updatedSpec.lastReviewedBy.licenseNumber, approvedHematologist.licenseNumber);
    assert.equal(updatedSpec.specificationVersion, 1);

    // Verify stored in registry
    const fetched = bloodDisordersService.getConditionById("custom_antiphospholipid");
    assert.ok(fetched, "Custom condition successfully registered");
    assert.equal(fetched.requiredLabPanels.length, 3);

    console.log("  ✓ Verified: Medical reviewer can define condition specs before clinical logic execution.\n");
  }

  // ===========================================================================
  // TEST 3: Structured Patient Information & Case Intake
  // ===========================================================================
  console.log("▶ TEST 3: Structured Patient Clinical History & Case Intake");
  {
    const newCase = await bloodDisordersService.recordPatientBloodDisorderCase({
      patientId,
      conditionId: "vka_inr_monitoring",
      patientInfo: {
        name: "حسن عبد الرحيم",
        age: 58,
        gender: "male",
        bloodGroup: "O+"
      },
      clinicalIntake: {
        indication: "Deep vein thrombosis post-orthopedic surgery (Right femoral vein)",
        thromboticHistory: ["Right femoral DVT (2026-08-15)"],
        bleedingHistory: ["No prior major bleeding events"],
        activeAnticoagulant: "Warfarin",
        anticoagulantDose: "5 mg once daily",
        lastDoseTakenAt: "2026-10-09T20:00:00Z",
        targetInr: "2.0 - 3.0",
        provokingRiskFactors: ["Right total knee arthroplasty", "Postoperative immobility"],
        presentingSymptoms: ["Mild residual right calf tightness"],
        pregnancyStatus: "none",
        patientNotes: "Taking medication consistently at 8 PM daily with vitamin K stable diet."
      },
      attachedFiles: [
        { fileId: "doc_doppler_scan_01", fileName: "Doppler_Ultrasound_Leg.pdf", fileType: "application/pdf" }
      ],
      assignedDoctorId: approvedHematologist.uid,
      authorizedUser: { uid: patientId, role: "patient" }
    });

    assert.ok(newCase.id.startsWith("case_bd_"));
    assert.equal(newCase.patientId, patientId);
    assert.equal(newCase.conditionId, "vka_inr_monitoring");
    assert.equal(newCase.clinicalIntake.activeAnticoagulant, "Warfarin");
    assert.equal(newCase.assignedDoctorId, approvedHematologist.uid);
    assert.equal(newCase.status, "pending");

    // ZERO AUTOMATIC DIAGNOSIS CHECK
    assert.equal(newCase.clinicalDiagnosis, null, "Clinical diagnosis must remain null upon intake");
    assert.equal(newCase.doctorApproved, false, "Case must NOT be auto-approved");

    console.log("  ✓ Verified: Structured patient information preserved; zero automated diagnoses created.\n");
  }

  // ===========================================================================
  // TEST 4: Structured Laboratory Results & Anti-Fabrication Safeguards
  // ===========================================================================
  console.log("▶ TEST 4: Structured Laboratory Results (Zero Invented Labs)");
  {
    // 1. Rejects empty lab values
    assert.throws(
      () => bloodDisordersService.validateLabMeasurement({ testCode: "INR", value: "" }),
      (err) => err.code === "EMPTY_LAB_VALUE",
      "Empty lab value rejected"
    );

    // 2. Rejects non-numeric / malformed strings
    assert.throws(
      () => bloodDisordersService.validateLabMeasurement({ testCode: "INR", value: "high_inr_text" }),
      (err) => err.code === "INVALID_LAB_NUMERIC_VALUE",
      "Text instead of numeric value rejected"
    );

    // 3. Rejects negative lab values
    assert.throws(
      () => bloodDisordersService.validateLabMeasurement({ testCode: "INR", value: -2.5 }),
      (err) => err.code === "NEGATIVE_LAB_VALUE",
      "Negative lab value rejected"
    );

    // 4. Rejects unsupported units
    assert.throws(
      () => bloodDisordersService.validateLabMeasurement({ testCode: "PT", value: 13.5, unit: "mmHg" }),
      (err) => err.code === "INVALID_LAB_UNIT",
      "Unsupported unit for PT rejected"
    );

    // 5. Rejects future timestamps
    const futureIso = new Date(Date.now() + 86400000).toISOString();
    assert.throws(
      () => bloodDisordersService.validateLabMeasurement({ testCode: "INR", value: 2.4, collectedAt: futureIso }),
      (err) => err.code === "FUTURE_LAB_TIMESTAMP",
      "Future collection timestamp rejected"
    );

    // 6. Validates real authentic lab results
    const validInr = bloodDisordersService.validateLabMeasurement({
      testCode: "INR",
      value: "2.4", // string parses cleanly
      unit: "ratio",
      collectedAt: "2026-10-10T09:00:00Z",
      reportingLab: "Al-Borg Clinical Laboratory",
      attachedLabReportFiles: ["report_lab_inr_oct10.pdf"]
    });

    assert.equal(validInr.testCode, "INR");
    assert.equal(validInr.value, 2.4);
    assert.equal(validInr.unit, "ratio");
    assert.equal(validInr.reportingLab, "Al-Borg Clinical Laboratory");

    // Append to patient case
    const cases = bloodDisordersService.getPatientCases(patientId);
    const targetCaseId = cases[0].id;

    const appendRes = bloodDisordersService.recordCaseLabResults({
      caseId: targetCaseId,
      labMeasurements: [
        validInr,
        {
          testCode: "PT",
          value: 14.2,
          unit: "seconds",
          collectedAt: "2026-10-10T09:00:00Z",
          reportingLab: "Al-Borg Clinical Laboratory"
        },
        {
          testCode: "PLATELET_COUNT",
          value: 230,
          unit: "x10^9/L",
          collectedAt: "2026-10-10T09:00:00Z",
          reportingLab: "Al-Borg Clinical Laboratory"
        }
      ]
    });

    assert.equal(appendRes.newLabsCount, 3);
    assert.equal(appendRes.clinicalRevision, 2);

    console.log("  ✓ Verified: Laboratory results strictly validated; zero synthetic results invented.\n");
  }

  // ===========================================================================
  // TEST 5: Doctor Review, Assignment RBAC & Human Physician Diagnosis Gating
  // ===========================================================================
  console.log("▶ TEST 5: Doctor Review Workflow, Assignment Check & Approval Gating");
  {
    const cases = bloodDisordersService.getPatientCases(patientId);
    const caseId = cases[0].id;

    // 1. Unassigned doctor cannot approve
    await assert.rejects(
      async () => bloodDisordersService.reviewAndApproveBloodDisorderCase({
        caseId,
        reviewingDoctor: otherDoctor,
        clinicalDiagnosis: "DVT therapeutic Warfarin"
      }),
      (err) => err.code === "CASE_ASSIGNED_TO_OTHER_DOCTOR",
      "Unassigned doctor blocked from approval"
    );

    // 2. Physician MUST explicitly provide clinical diagnosis (cannot be empty)
    await assert.rejects(
      async () => bloodDisordersService.reviewAndApproveBloodDisorderCase({
        caseId,
        reviewingDoctor: approvedHematologist,
        clinicalDiagnosis: "" // empty!
      }),
      (err) => err.code === "PHYSICIAN_DIAGNOSIS_REQUIRED",
      "Approval blocked without explicit physician diagnosis"
    );

    // 3. Approved hematologist reviews case, writes diagnosis, and approves
    const reviewResult = await bloodDisordersService.reviewAndApproveBloodDisorderCase({
      caseId,
      reviewingDoctor: approvedHematologist,
      clinicalDiagnosis: "Therapeutic anticoagulation on Warfarin for provoked right lower-extremity DVT. Current INR 2.4 within target range (2.0 - 3.0).",
      clinicalNotes: "Patient exhibits stable therapeutic anticoagulation. No signs of recurrent thrombosis or active bleeding.",
      internalNotes: "CONFIDENTIAL CLINICIAN NOTE: Inquire about planned duration (complete 3-month course until Nov 15, then stop).",
      treatmentPlan: "Maintain Warfarin 5 mg daily at 8 PM. Maintain stable dietary vitamin K intake. Avoid NSAIDs.",
      followUpSchedule: {
        nextLabDate: "2026-10-24T09:00:00Z", // 14 days later
        monitoringFrequency: "biweekly",
        targetGoals: "Target INR 2.0 - 3.0",
        redFlagSymptoms: [
          "Uncontrolled nosebleeds or bleeding gums",
          "Black tarry stools or blood in urine",
          "Sudden chest pain or shortness of breath",
          "Severe sudden limb swelling or pain"
        ],
        instructions: "Repeat INR test on Oct 24 morning and upload results."
      }
    });

    assert.ok(reviewResult.success);
    assert.equal(reviewResult.case.status, "approved");
    assert.equal(reviewResult.case.doctorApproved, true);
    assert.ok(reviewResult.case.reportRef.startsWith("HV-HEM-"));

    // Verify certified report snapshot
    const report = reviewResult.report;
    assert.ok(report);
    assert.equal(report.clinicalDiagnosis.includes("Therapeutic anticoagulation"), true);
    assert.equal(report.approvingDoctor.uid, approvedHematologist.uid);
    assert.equal(report.approvingDoctor.licenseNumber, approvedHematologist.licenseNumber);
    assert.ok(report.digitalSignature.signatureHash);

    // QUARANTINE CHECK: internal doctor notes must NEVER appear in certified report!
    assert.equal(report.internalDoctorNotes, undefined, "Internal doctor notes quarantined from certified report");

    console.log("  ✓ Verified: Explicit human diagnosis required. Approved report signed and stamped.\n");
  }

  // ===========================================================================
  // TEST 6: Structured Follow-Up Protocol Verification
  // ===========================================================================
  console.log("▶ TEST 6: Structured Follow-Up Protocol Prescription");
  {
    const protocol = bloodDisordersService.getFollowupProtocol(patientId);
    assert.ok(protocol, "Follow-up protocol stored for patient");
    assert.equal(protocol.monitoringFrequency, "biweekly");
    assert.equal(protocol.nextLabDate, "2026-10-24T09:00:00Z");
    assert.ok(protocol.redFlagSymptoms.length >= 3, "Contains red-flag bleeding/thrombosis alert symptoms");
    assert.equal(protocol.prescribingDoctor.licenseNumber, approvedHematologist.licenseNumber);

    console.log("  ✓ Verified: Structured follow-up protocol with repeat lab date and precautions recorded.\n");
  }

  // ===========================================================================
  // TEST 7: UI Component & Bilingual (RTL/LTR) Localization
  // ===========================================================================
  console.log("▶ TEST 7: UI Rendering, Table Parity & Bilingual Support");
  {
    const conditions = bloodDisordersService.getRegisteredConditions();
    const cases = bloodDisordersService.getPatientCases(patientId);

    // 1. Conditions Registry View
    const registryHtmlEn = BloodDisordersUI.renderConditionsRegistry(conditions, true, true);
    const registryHtmlAr = BloodDisordersUI.renderConditionsRegistry(conditions, false, true);

    assert.ok(registryHtmlEn.includes("Venous Thromboembolism"), "English condition name present");
    assert.ok(registryHtmlAr.includes("الانصمام الخثاري الوريدي"), "Arabic condition name present");
    assert.ok(registryHtmlEn.includes("Required Laboratory Panels"), "English lab panels header present");
    assert.ok(registryHtmlAr.includes("التحاليل المخبرية المطلوبة"), "Arabic lab panels header present");

    // 2. Laboratory Results Table
    const approvedCase = cases[0];
    const labTableEn = BloodDisordersUI.renderLaboratoryResultsTable(approvedCase.laboratoryResults, true);
    const labTableAr = BloodDisordersUI.renderLaboratoryResultsTable(approvedCase.laboratoryResults, false);

    assert.ok(labTableEn.includes("INR"), "Table displays INR test code");
    assert.ok(labTableEn.includes("2.4"), "Table displays measured INR value");
    assert.ok(labTableEn.includes("Al-Borg Clinical Laboratory"), "Table displays performing lab");
    assert.ok(labTableAr.includes("النسبة المعيارية الدولية"), "Arabic lab name displayed");

    // 3. Full Screen Assembler
    const fullScreenEn = BloodDisordersUI.renderBloodDisordersScreen({
      conditions,
      cases,
      isEn: true,
      currentUser: { role: "patient" },
      activeTab: "conditions"
    });
    const fullScreenAr = BloodDisordersUI.renderBloodDisordersScreen({
      conditions,
      cases,
      isEn: false,
      currentUser: { role: "patient" },
      activeTab: "conditions"
    });

    assert.ok(fullScreenEn.includes('dir="ltr"'), "English layout has dir='ltr'");
    assert.ok(fullScreenAr.includes('dir="rtl"'), "Arabic layout has dir='rtl'");
    assert.ok(fullScreenEn.includes("Clinical Boundary & Non-Diagnostic Oversight"), "English non-diagnostic alert present");
    assert.ok(fullScreenAr.includes("إطار الأمان السريري والإشراف الطبي"), "Arabic clinical boundary alert present");

    console.log("  ✓ Verified: UI renders structured conditions, labs, and bilingual layouts without fake mock data.\n");
  }

  console.log("==================================================================");
  console.log("🎉 ALL BLOOD DISORDERS MODULE FOUNDATION TESTS PASSED (100%)!");
  console.log("==================================================================");
})().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
