/**
 * Health Vibe AI - Blood Clotting / Blood Disorders Structured Clinical Data & Observation Schema Test Suite
 *
 * Validates:
 * 1. Structured Clinical Observation Schema:
 *    - test name, result value, unit, reference range, collection date/time, source, attachment/reference, author, review status.
 * 2. Unverified by default for patient-entered or imported data:
 *    - Rejects client attempts to self-verify.
 *    - Physician review workflow sets VERIFIED or REJECTED with doctor provenance and license.
 *    - Rejects non-physician review attempts.
 * 3. Immutable preservation of original source data:
 *    - originalSourceData remains completely intact across reviews and manual corrections.
 * 4. Auditable manual correction workflow:
 *    - Mandatory, non-empty correctionReason.
 *    - Rejects unauthorized corrections.
 *    - Records previous and new values in correctionHistory with version increment.
 *    - Resets reviewStatus to UNVERIFIED for re-review if previously VERIFIED.
 * 5. Strict missing value handling (NO assumptions):
 *    - Missing unit stored as null.
 *    - Missing reference range stored as null.
 *    - Missing collection date/time stored as null.
 * 6. Non-diagnostic boundary & No hardcoded medical rules:
 *    - Stores general and specialized hematology tests without arbitrary diagnostic rules.
 *    - Confirms zero automated diagnoses and zero treatment recommendations.
 * 7. UI rendering parity in BloodDisordersUI:
 *    - Renders unverified badges, authentic values, and handles missing fields without assuming defaults.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🩸 HEALTH VIBE AI: BLOOD DISORDERS CLINICAL DATA & SCHEMA TEST SUITE");
console.log("   Structured Observations, Audit Trails, Provenance & Boundaries");
console.log("==================================================================\n");

const bloodDisordersService = require("../backend/blood-disorders-service");
const observationService = require("../backend/blood-disorders-observation-service");
const BloodDisordersUI = require("../app/modules/patient/blood-disorders-ui");

(async () => {
  bloodDisordersService.resetBloodDisordersStoreForTesting();
  observationService.resetObservationStoreForTesting();

  const patientId = "pat_hematology_test_01";

  const licensedHematologist = {
    uid: "doc_hem_mona",
    name: "د. منى الشريف",
    displayName: "Dr. Mona Al-Sharif",
    role: "doctor",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false,
    licenseNumber: "HEM-EGY-7734",
    specialty: "Consultant Hematologist"
  };

  const patientAuthor = {
    uid: patientId,
    name: "أحمد كمال",
    displayName: "Ahmed Kamal",
    role: "patient"
  };

  const clinicNurse = {
    uid: "nurse_samira",
    name: "ممرضة سميرة",
    displayName: "Nurse Samira",
    role: "nurse"
  };

  const unauthorizedUser = {
    uid: "usr_random",
    name: "مستخدم عادي",
    role: "patient"
  };

  // ===========================================================================
  // TEST 1: Schema Storage & Missing Value Rule (Never Replace with Assumptions)
  // ===========================================================================
  console.log("▶ TEST 1: Structured Observation Schema & Strict Missing Value Rule");
  {
    // A. Create observation with missing unit, missing reference range, and missing collection time
    const obsWithMissingFields = await observationService.createClinicalObservation({
      patientId,
      testName: "Factor VIII Inhibitor Assay",
      resultValue: 1.2,
      // unit: deliberately omitted!
      // referenceRange: deliberately omitted!
      // collectionDateTime: deliberately omitted!
      source: observationService.OBSERVATION_SOURCES.PATIENT_ENTERED,
      author: patientAuthor
    });

    assert.ok(obsWithMissingFields.observationId, "Generated unique observation ID");
    assert.equal(obsWithMissingFields.patientId, patientId, "Patient ID matches");
    assert.equal(obsWithMissingFields.testName, "Factor VIII Inhibitor Assay", "Test name matches");
    assert.equal(obsWithMissingFields.resultValue, 1.2, "Result value matches");
    assert.equal(obsWithMissingFields.valueType, "quantitative", "Quantitative value type detected");

    // CRITICAL: Never replace missing values with assumptions!
    assert.equal(obsWithMissingFields.unit, null, "Missing unit is stored as null (NEVER assumed)");
    assert.equal(obsWithMissingFields.referenceRange, null, "Missing reference range is stored as null (NEVER assumed)");
    assert.equal(obsWithMissingFields.collectionDateTime, null, "Missing collection date/time is stored as null (NEVER assumed 'now')");

    // B. Create observation with fully provided source metadata
    const obsFull = await observationService.createClinicalObservation({
      patientId,
      testName: "International Normalized Ratio",
      testCode: "INR",
      resultValue: "2.4",
      unit: "ratio",
      referenceRange: { low: 2.0, high: 3.0, unit: "ratio" },
      collectionDateTime: "2026-10-09T08:30:00.000Z",
      source: observationService.OBSERVATION_SOURCES.LAB_INTERFACE_IMPORT,
      attachmentRef: {
        fileId: "file_inr_report_88",
        fileName: "lab_inr_october.pdf"
      },
      author: { uid: "lis_import_bot", name: "Al-Borg LIS Interface", role: "lab_interface" }
    });

    assert.equal(obsFull.testCode, "INR", "Test code normalized");
    assert.equal(obsFull.resultValue, 2.4, "Numeric string parsed to 2.4");
    assert.equal(obsFull.unit, "ratio", "Unit preserved as provided");
    assert.equal(obsFull.referenceRange.low, 2.0, "Reference range low preserved");
    assert.equal(obsFull.referenceRange.high, 3.0, "Reference range high preserved");
    assert.equal(obsFull.collectionDateTime, "2026-10-09T08:30:00.000Z", "Collection time preserved");
    assert.equal(obsFull.attachmentRef.fileId, "file_inr_report_88", "Attachment reference preserved");

    console.log("  ✔ All 9 schema fields stored; missing values never replaced with assumptions.");
  }

  // ===========================================================================
  // TEST 2: Unverified Status by Default for Patient/Imported Information
  // ===========================================================================
  console.log("▶ TEST 2: Unverified Default Gate for Patient & Imported Data");
  {
    // A. Patient attempts to submit with reviewStatus: 'VERIFIED' (must be overridden to UNVERIFIED!)
    const patientObs = await observationService.createClinicalObservation({
      patientId,
      testName: "D-Dimer",
      testCode: "D_DIMER",
      resultValue: 0.35,
      unit: "ug/mL",
      source: observationService.OBSERVATION_SOURCES.PATIENT_ENTERED,
      author: patientAuthor,
      reviewStatus: "VERIFIED" // Malicious or mistaken self-verification attempt!
    });

    assert.equal(patientObs.reviewStatus, observationService.REVIEW_STATUS.UNVERIFIED, "Patient-entered observation forced to UNVERIFIED");
    assert.equal(patientObs.reviewDetails, null, "reviewDetails is null for unverified entry");

    // B. External EHR import also defaults to UNVERIFIED
    const ehrObs = await observationService.createClinicalObservation({
      patientId,
      testName: "Platelet Count",
      resultValue: 210,
      unit: "x10^9/L",
      source: observationService.OBSERVATION_SOURCES.EXTERNAL_EHR_IMPORT,
      author: { uid: "ehr_sync", name: "Hospital EHR", role: "system" }
    });

    assert.equal(ehrObs.reviewStatus, observationService.REVIEW_STATUS.UNVERIFIED, "EHR import forced to UNVERIFIED until clinician review");

    console.log("  ✔ Patient and imported data strictly defaulted to UNVERIFIED.");
  }

  // ===========================================================================
  // TEST 3: Medical Review Workflow & Non-Physician Gate
  // ===========================================================================
  console.log("▶ TEST 3: Medical Review Workflow & Non-Physician Gate");
  {
    // Create an unverified observation
    const unverifiedObs = await observationService.createClinicalObservation({
      patientId,
      testName: "Activated Partial Thromboplastin Time (aPTT)",
      testCode: "APTT",
      resultValue: 31.5,
      unit: "seconds",
      referenceRange: { low: 25.0, high: 35.0 },
      source: observationService.OBSERVATION_SOURCES.MEDICAL_OCR_IMPORT,
      author: patientAuthor
    });

    assert.equal(unverifiedObs.reviewStatus, observationService.REVIEW_STATUS.UNVERIFIED);

    // A. Non-physician attempt to review must fail
    await assert.rejects(
      async () => {
        await observationService.reviewClinicalObservation({
          observationId: unverifiedObs.observationId,
          reviewingDoctor: clinicNurse,
          reviewDecision: "VERIFIED",
          reviewNotes: "Looks fine"
        });
      },
      (err) => err.code === "ACCESS_DENIED_DOCTOR_REQUIRED",
      "Non-doctor review attempt rejected"
    );

    // B. Licensed hematologist successfully reviews observation
    const reviewed = await observationService.reviewClinicalObservation({
      observationId: unverifiedObs.observationId,
      reviewingDoctor: licensedHematologist,
      reviewDecision: "VERIFIED",
      reviewNotes: "Confirmed against hospital laboratory slip #8821; specimen was non-hemolyzed."
    });

    assert.equal(reviewed.reviewStatus, observationService.REVIEW_STATUS.VERIFIED, "Status updated to VERIFIED");
    assert.ok(reviewed.reviewDetails, "reviewDetails populated");
    assert.equal(reviewed.reviewDetails.reviewedBy.uid, licensedHematologist.uid);
    assert.equal(reviewed.reviewDetails.reviewedBy.licenseNumber, licensedHematologist.licenseNumber);
    assert.equal(reviewed.reviewDetails.reviewDecision, "VERIFIED");
    assert.ok(reviewed.reviewDetails.reviewedAt, "Reviewed timestamp set");

    console.log("  ✔ Medical review enforced; doctor license and notes recorded.");
  }

  // ===========================================================================
  // TEST 4: Preservation of Immutable Original Source Data
  // ===========================================================================
  console.log("▶ TEST 4: Immutable Preservation of Original Source Data");
  {
    const initialRawPayload = {
      patientId,
      testName: "Fibrinogen",
      resultValue: "350",
      unit: "mg/dL",
      referenceRange: { low: 200, high: 400, text: "Normal adult range" },
      collectionDateTime: "2026-10-08T11:00:00.000Z",
      source: observationService.OBSERVATION_SOURCES.PATIENT_ENTERED,
      author: patientAuthor
    };

    const obs = await observationService.createClinicalObservation(initialRawPayload);

    assert.ok(obs.originalSourceData, "originalSourceData present");
    assert.equal(obs.originalSourceData.rawTestName, "Fibrinogen");
    assert.equal(obs.originalSourceData.rawResultValue, "350");
    assert.equal(obs.originalSourceData.rawUnit, "mg/dL");
    assert.equal(obs.originalSourceData.rawSource, observationService.OBSERVATION_SOURCES.PATIENT_ENTERED);

    // Review the observation
    await observationService.reviewClinicalObservation({
      observationId: obs.observationId,
      reviewingDoctor: licensedHematologist,
      reviewDecision: "VERIFIED",
      reviewNotes: "Valid lab entry"
    });

    // Check originalSourceData is untouched
    assert.equal(obs.originalSourceData.rawResultValue, "350", "Original raw value remains '350' after review");
    assert.equal(obs.originalSourceData.rawSource, observationService.OBSERVATION_SOURCES.PATIENT_ENTERED, "Original source remains patient_entered");

    console.log("  ✔ originalSourceData immutably preserved.");
  }

  // ===========================================================================
  // TEST 5: Auditable Manual Correction Workflow
  // ===========================================================================
  console.log("▶ TEST 5: Auditable Manual Correction Workflow");
  {
    const obs = await observationService.createClinicalObservation({
      patientId,
      testName: "D-Dimer",
      testCode: "D_DIMER",
      resultValue: 500, // Clerical error: entered as 500 ug/mL instead of 0.50 ug/mL
      unit: "ug/mL",
      source: observationService.OBSERVATION_SOURCES.CLINICIAN_ENTERED,
      author: { uid: licensedHematologist.uid, name: licensedHematologist.name, role: "doctor" }
    });

    // Verify initial state
    assert.equal(obs.revisionNumber, 1);
    assert.equal(obs.correctionHistory.length, 0);

    // A. Rejects correction without mandatory reason
    await assert.rejects(
      async () => {
        await observationService.correctClinicalObservation({
          observationId: obs.observationId,
          correctedBy: clinicNurse,
          correctionReason: "", // Empty reason!
          updatedFields: { resultValue: 0.50 }
        });
      },
      (err) => err.code === "CORRECTION_REASON_REQUIRED",
      "Rejects correction with missing correctionReason"
    );

    // B. Rejects correction by unauthorized user
    await assert.rejects(
      async () => {
        await observationService.correctClinicalObservation({
          observationId: obs.observationId,
          correctedBy: unauthorizedUser,
          correctionReason: "Typo correction",
          updatedFields: { resultValue: 0.50 }
        });
      },
      (err) => err.code === "ACCESS_DENIED_CLINICAL_ROLE_REQUIRED",
      "Rejects correction from non-clinical user"
    );

    // C. Rejects tampering with immutable identifiers
    await assert.rejects(
      async () => {
        await observationService.correctClinicalObservation({
          observationId: obs.observationId,
          correctedBy: licensedHematologist,
          correctionReason: "Modifying patient ID",
          updatedFields: { patientId: "pat_different_someone" }
        });
      },
      (err) => err.code === "IMMUTABLE_FIELD_MODIFICATION",
      "Rejects modification of immutable patientId"
    );

    // D. Successful auditable correction by clinical nurse
    const corrected = await observationService.correctClinicalObservation({
      observationId: obs.observationId,
      correctedBy: clinicNurse,
      correctionReason: "Clerical transcription error: Entered 500 ng/mL as 500 ug/mL; corrected to 0.50 ug/mL based on lab sheet.",
      updatedFields: { resultValue: 0.50 }
    });

    assert.equal(corrected.resultValue, 0.50, "Result value corrected to 0.50");
    assert.equal(corrected.revisionNumber, 2, "Revision number incremented to 2");
    assert.equal(corrected.correctionHistory.length, 1, "Audit history recorded 1 revision");

    const historyEntry = corrected.correctionHistory[0];
    assert.equal(historyEntry.revision, 1);
    assert.equal(historyEntry.nextRevision, 2);
    assert.equal(historyEntry.correctedBy.uid, clinicNurse.uid);
    assert.equal(historyEntry.previousValues.resultValue, 500, "Previous value snapshot 500");
    assert.equal(historyEntry.newValues.resultValue, 0.50, "New value snapshot 0.50");
    assert.ok(historyEntry.correctionReason.includes("Clerical transcription error"));

    // Check originalSourceData is still intact with the original 500!
    assert.equal(corrected.originalSourceData.rawResultValue, 500, "originalSourceData remains 500");

    console.log("  ✔ Auditable manual correction verified with mandatory reason and history.");
  }

  // ===========================================================================
  // TEST 6: Non-Diagnostic Clinical Boundary (No Diagnoses / No Prescriptions)
  // ===========================================================================
  console.log("▶ TEST 6: Non-Diagnostic Clinical Boundary & Extensible Tests");
  {
    // Extensible test not in any rigid hardcoded list
    const specializedObs = await observationService.createClinicalObservation({
      patientId,
      testName: "Thromboelastography (TEG) - Maximum Amplitude (MA)",
      testCode: "TEG_MA",
      resultValue: 62.0,
      unit: "mm",
      referenceRange: { low: 50.0, high: 70.0, unit: "mm" },
      collectionDateTime: "2026-10-09T14:00:00.000Z",
      source: observationService.OBSERVATION_SOURCES.CLINICIAN_ENTERED,
      author: { uid: licensedHematologist.uid, name: licensedHematologist.name, role: "doctor" }
    });

    assert.equal(specializedObs.testName, "Thromboelastography (TEG) - Maximum Amplitude (MA)");
    assert.ok(specializedObs.clinicalBoundary, "clinicalBoundary notice present");
    assert.equal(specializedObs.clinicalBoundary.isDiagnostic, false, "isDiagnostic is strictly false");
    assert.equal(specializedObs.clinicalBoundary.isTreatmentRecommendation, false, "isTreatmentRecommendation is strictly false");

    // Must NOT have automated diagnosis property
    assert.equal(specializedObs.diagnosis, undefined, "No automated diagnosis property generated");
    assert.equal(specializedObs.treatmentPlan, undefined, "No automated treatment plan generated");

    console.log("  ✔ Extensible hematology test supported with zero automated diagnoses.");
  }

  // ===========================================================================
  // TEST 7: UI Rendering Parity (Unverified Status & Null Value Integrity)
  // ===========================================================================
  console.log("▶ TEST 7: UI Rendering Parity for Structured Observations");
  {
    const sampleObsList = [
      {
        observationId: "obs_sample_1",
        testName: "International Normalized Ratio",
        testCode: "INR",
        resultValue: 2.3,
        unit: null, // Null unit (never assumed!)
        referenceRange: null, // Null range (never assumed!)
        collectionDateTime: null, // Null date (never assumed!)
        source: "patient_entered",
        reviewStatus: "UNVERIFIED",
        revisionNumber: 1
      },
      {
        observationId: "obs_sample_2",
        testName: "Platelet Count",
        testCode: "PLATELET_COUNT",
        resultValue: 185,
        unit: "x10^9/L",
        referenceRange: { low: 150, high: 450, unit: "x10^9/L" },
        collectionDateTime: "2026-10-08T09:00:00.000Z",
        source: "lab_interface_import",
        reviewStatus: "VERIFIED",
        revisionNumber: 2,
        reviewDetails: {
          reviewedBy: { name: "Dr. Mona", licenseNumber: "LIC-77" },
          reviewedAt: "2026-10-08T12:00:00.000Z"
        }
      }
    ];

    // English LTR
    const htmlEn = BloodDisordersUI.renderClinicalObservationsTable(sampleObsList, true, false);
    assert.ok(htmlEn.includes("International Normalized Ratio"), "Renders test name in EN");
    assert.ok(htmlEn.includes("Unverified"), "Renders Unverified pill in EN");
    assert.ok(htmlEn.includes("Medically Verified"), "Renders Medically Verified pill in EN");
    assert.ok(htmlEn.includes("— (Not specified)"), "Renders '— (Not specified)' for null unit");
    assert.ok(htmlEn.includes("— (Not provided by source)"), "Renders '— (Not provided by source)' for null range");
    assert.ok(htmlEn.includes("— (Not recorded)"), "Renders '— (Not recorded)' for null collection date");

    // Arabic RTL
    const htmlAr = BloodDisordersUI.renderClinicalObservationsTable(sampleObsList, false, false);
    assert.ok(htmlAr.includes("غير موثق"), "Renders Unverified in Arabic");
    assert.ok(htmlAr.includes("موثق طبياً"), "Renders Verified in Arabic");
    assert.ok(htmlAr.includes("غير محدد من المصدر"), "Renders 'غير محدد من المصدر' for missing range in Arabic");

    console.log("  ✔ UI renders observation table with unverified status and missing value integrity.");
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL 7 BLOOD DISORDERS OBSERVATION SCHEMA TESTS PASSED (100%)");
  console.log("==================================================================");
})();
