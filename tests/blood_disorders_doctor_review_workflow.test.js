/**
 * Health Vibe AI - Blood Clotting / Blood Disorders Doctor Review Workflow Test Suite
 *
 * Validates:
 * 1. Doctor Access Control: Doctors must only access authorized and assigned cases.
 * 2. Complete Clinical Data Display:
 *    - patient-provided information (symptoms, bleeding/thromboembolism history, anticoagulants)
 *    - laboratory results (INR, Platelets, D-Dimer, aPTT, Fibrinogen, etc.)
 *    - units (strictly preserved; never guessed when missing)
 *    - reference ranges (strictly preserved; never assumed when missing)
 *    - source documents (PDF reports, lab slips, scanned attachments)
 *    - historical observations (prior readings, longitudinal trends)
 *    - patient clarifications (patient responses to doctor inquiries)
 *    - doctor notes (clinical commentary and quarantined internal notes)
 * 3. Clear Distinction of the 5 Provenance Categories:
 *    - patient-entered information
 *    - imported information (EHR / LIS)
 *    - OCR-derived draft information (unverified scan)
 *    - doctor-verified information
 *    - approved information
 * 4. Clinical Guardrail: Do NOT treat OCR or patient-entered data as an approved medical fact.
 * 5. Revision Gating: Require the doctor to review current clinical revision before approval (HTTP 409 Conflict).
 * 6. Internal Doctor Notes Strict Quarantine from patient views and certified reports.
 * 7. Clinical Boundaries: Do NOT generate unsupported diagnosis or treatment.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🩸 HEALTH VIBE AI: BLOOD DISORDERS DOCTOR REVIEW WORKFLOW TEST SUITE");
console.log("   Clinical Data Review, 5-Tier Provenance, Revision Gating & Safety");
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
    classList: { contains: () => false, add: () => {}, remove: () => {} }
  }),
  body: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Load modules under test
const doctorUI = require(path.resolve(__dirname, "../app/modules/doctor/doctor-ui.js"));
const bloodDisordersService = require(path.resolve(__dirname, "../backend/blood-disorders-service.js"));
const observationService = require(path.resolve(__dirname, "../backend/blood-disorders-observation-service.js"));

(async () => {
  // Reset stores for clean isolated tests
  bloodDisordersService.resetBloodDisordersStoreForTesting();
  observationService.resetObservationStoreForTesting();

  // Test Personas
  const assignedHematologist = {
    uid: "doc_hem_tariq",
    id: "doc_hem_tariq",
    email: "dr.tariq@cairo-blood.eg",
    name: "د. طارق منصور",
    displayName: "Dr. Tariq Mansour",
    licenseNumber: "EGY-HEM-99120",
    specialty: "Hematology & Thrombosis",
    clinic: "عيادة أمراض وتجلط الدم التخصصية",
    role: "doctor",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false
  };

  const unassignedDoctor = {
    uid: "doc_unassigned_88",
    id: "doc_unassigned_88",
    email: "intruder.doc@unauthorized.test",
    name: "د. طبيب غير مكلف",
    displayName: "Dr. Unassigned Intruder",
    licenseNumber: "FORGED-8812",
    specialty: "طب عام",
    role: "doctor",
    status: "approved",
    licenseStatus: "active",
    isLicenseExpired: false
  };

  const patient = {
    uid: "pat_bd_review_01",
    id: "pat_bd_review_01",
    name: "سامي عبد الرحمن الشريف",
    nameEn: "Sami Abdel-Rahman Al-Sharif",
    age: 52,
    gender: "male"
  };

  // ===========================================================================
  // TEST 1: Doctor Access Control & Assignment Check
  // ===========================================================================
  console.log("▶ TEST 1: Doctor Access Control & Assignment Check");
  {
    const bdCase = {
      id: "case_hem_2026_001",
      patientId: patient.id,
      patientName: patient.name,
      assignedDoctorId: assignedHematologist.uid,
      assignedDoctorEmail: assignedHematologist.email,
      condition: "blood_disorders",
      specialty: "blood_disorders",
      conditionId: "vka_inr_monitoring",
      status: "under_review",
      clinicalRevision: 1
    };

    // 1. Assigned doctor is authorized
    assert.equal(doctorUI.isCaseAssignedToDoctor(bdCase, assignedHematologist), true, "Assigned hematologist must be authorized");

    // 2. Unassigned doctor is strictly rejected
    assert.equal(doctorUI.isCaseAssignedToDoctor(bdCase, unassignedDoctor), false, "Unassigned doctor must be rejected");

    // 3. Unassigned case rejects all doctors
    const unassignedCase = { ...bdCase, assignedDoctorId: null, assignedDoctorEmail: null };
    assert.equal(doctorUI.isCaseAssignedToDoctor(unassignedCase, assignedHematologist), false, "Unassigned case must deny access");

    console.log("  ✔ Access control enforced: only assigned hematologist can access case.");
  }

  // ===========================================================================
  // TEST 2: Clear Distinction of the 5 Provenance Categories
  // ===========================================================================
  console.log("▶ TEST 2: Clear Distinction of the 5 Provenance Categories");
  {
    const { PROVENANCE_CATEGORIES, getBloodDisorderProvenanceCategory, getBloodDisorderProvenanceBadge } = doctorUI;

    // 1. Patient-entered
    const patientItem = { source: "patient_entered", reviewStatus: "UNVERIFIED" };
    assert.equal(getBloodDisorderProvenanceCategory(patientItem), PROVENANCE_CATEGORIES.PATIENT_ENTERED);
    const patientBadge = getBloodDisorderProvenanceBadge(patientItem, true);
    assert.ok(patientBadge.includes("Patient-Entered (Unverified Draft)"), "Patient badge has distinct unverified draft label");
    assert.ok(patientBadge.includes("👤"), "Patient badge has patient icon");

    // 2. Imported (EHR / LIS)
    const importedItem = { source: "external_ehr_import", reviewStatus: "UNVERIFIED" };
    assert.equal(getBloodDisorderProvenanceCategory(importedItem), PROVENANCE_CATEGORIES.IMPORTED);
    const importedBadge = getBloodDisorderProvenanceBadge(importedItem, true);
    assert.ok(importedBadge.includes("External EHR / LIS Import"), "Imported badge has EHR/LIS label");
    assert.ok(importedBadge.includes("🏥"), "Imported badge has clinic/hospital icon");

    // 3. OCR-derived draft
    const ocrItem = { source: "medical_ocr_import", isOcrDraft: true, reviewStatus: "UNVERIFIED" };
    assert.equal(getBloodDisorderProvenanceCategory(ocrItem), PROVENANCE_CATEGORIES.OCR_DRAFT);
    const ocrBadge = getBloodDisorderProvenanceBadge(ocrItem, true);
    assert.ok(ocrBadge.includes("OCR Draft"), "OCR badge has OCR Draft label");
    assert.ok(ocrBadge.includes("Not Medical Fact"), "OCR badge explicitly warns not an approved medical fact");
    assert.ok(ocrBadge.includes("dashed"), "OCR badge has dashed border signaling draft nature");

    // 4. Doctor-verified
    const verifiedItem = { reviewStatus: "VERIFIED", isDoctorVerified: true };
    assert.equal(getBloodDisorderProvenanceCategory(verifiedItem), PROVENANCE_CATEGORIES.DOCTOR_VERIFIED);
    const verifiedBadge = getBloodDisorderProvenanceBadge(verifiedItem, true);
    assert.ok(verifiedBadge.includes("Doctor-Verified"), "Verified badge has Doctor-Verified label");
    assert.ok(verifiedBadge.includes("🟢"), "Verified badge has green verified indicator");

    // 5. Approved information (Final Certified Report)
    const approvedItem = { isApproved: true, reviewStatus: "APPROVED" };
    assert.equal(getBloodDisorderProvenanceCategory(approvedItem), PROVENANCE_CATEGORIES.APPROVED);
    const approvedBadge = getBloodDisorderProvenanceBadge(approvedItem, true);
    assert.ok(approvedBadge.includes("Approved Medical Fact"), "Approved badge has Approved Medical Fact label");
    assert.ok(approvedBadge.includes("🏆"), "Approved badge has certified trophy indicator");

    // Arabic parity check
    const arOcrBadge = getBloodDisorderProvenanceBadge(ocrItem, false);
    assert.ok(arOcrBadge.includes("OCR"), "Arabic OCR badge contains OCR");
    const arApprovedBadge = getBloodDisorderProvenanceBadge(approvedItem, false);
    assert.ok(arApprovedBadge.includes("حقيقة طبية معتمدة"), "Arabic approved badge verified");

    console.log("  ✔ All 5 provenance categories clearly distinguished with distinct visual tiers and labels.");
  }

  // ===========================================================================
  // TEST 3: Clinical Guardrails — Never Treat OCR or Patient Data as Approved Medical Facts
  // ===========================================================================
  console.log("▶ TEST 3: Clinical Guardrails (No Automated Approval of OCR/Patient Data)");
  {
    const sampleCase = {
      id: "case_hem_guardrail_01",
      conditionId: "vte_dvt_pe",
      condition: "blood_disorders",
      clinicalRevision: 1,
      laboratoryResults: [
        {
          testCode: "D_DIMER",
          testName: "D-Dimer",
          value: 1.8,
          unit: "ug/mL",
          referenceRange: { low: 0, high: 0.5 },
          source: "medical_ocr_import",
          isOcrDraft: true
        }
      ]
    };

    const reviewHtmlEn = doctorUI.renderBloodDisordersReviewSection(sampleCase, true);
    assert.ok(reviewHtmlEn.includes("OCR-derived text and patient-entered records are unverified auxiliary draft inputs"), "Must contain guardrail warning against OCR as fact");
    assert.ok(reviewHtmlEn.includes("must NEVER be treated as approved medical facts"), "Must explicitly prohibit treating OCR as fact");
    assert.ok(reviewHtmlEn.includes("System does NOT generate automated diagnoses or treatment recommendations"), "Must affirm zero automated diagnoses");

    // Arabic parity check
    const reviewHtmlAr = doctorUI.renderBloodDisordersReviewSection(sampleCase, false);
    assert.ok(reviewHtmlAr.includes("نصوص المسح الضوئي (OCR) وإفادات المريض هي مدخلات مسودة أولية ولا يجوز اعتبارها حقائق طبية معتمدة"), "Arabic guardrail notice verified");

    console.log("  ✔ Clinical guardrails enforced: OCR and patient data barred from approved medical fact status.");
  }

  // ===========================================================================
  // TEST 4: Comprehensive Doctor Review Data Rendering
  // ===========================================================================
  console.log("▶ TEST 4: Comprehensive Doctor Review Data Rendering (Vitals, Labs, Units, Ranges, Docs, Clarifications)");
  {
    const fullCase = {
      id: "case_hem_full_review",
      patientId: patient.id,
      patientName: patient.name,
      conditionId: "vka_inr_monitoring",
      condition: "blood_disorders",
      clinicalRevision: 1,
      clinicalIntake: {
        indication: "Deep Vein Thrombosis (Left Femoral Vein) - Warfarin Anticoagulation Management",
        bleedingHistory: "Minor gum bleeding when brushing teeth; no hematuria or melena",
        thromboembolismHistory: "Acute left leg DVT 3 weeks ago confirmed by Doppler ultrasound",
        anticoagulantTherapy: "Warfarin 5mg daily (Target INR: 2.0 - 3.0)",
        familyHistory: "Mother had pulmonary embolism at age 62",
        riskFactors: "Recent orthopedic knee surgery, reduced mobility"
      },
      laboratoryResults: [
        {
          testCode: "INR",
          testName: "International Normalized Ratio",
          value: 2.4,
          unit: "ratio",
          referenceRange: { low: 2.0, high: 3.0, unit: "ratio" },
          collectedAt: "2026-10-09T08:30:00.000Z",
          source: "lab_interface_import",
          reportingLab: "Al-Borg Diagnostics"
        },
        {
          testCode: "PLATELET_COUNT",
          testName: "Platelet Count",
          value: 195,
          unit: "x10^9/L",
          referenceRange: { low: 150, high: 450, unit: "x10^9/L" },
          collectedAt: "2026-10-09T08:30:00.000Z",
          source: "external_ehr_import",
          reportingLab: "Hospital LIS"
        },
        {
          testCode: "FACTOR_VIII",
          testName: "Factor VIII Activity",
          value: 85,
          unit: null, // Null unit (never assumed!)
          referenceRange: null, // Null range (never assumed!)
          collectedAt: null, // Null collection time (never assumed!)
          source: "patient_entered"
        }
      ],
      files: [
        { name: "inr_october_report.pdf", size: 1048576, type: "application/pdf", uploadedAt: "2026-10-09T09:00:00.000Z", source: "lab_interface_import" },
        { name: "ultrasound_doppler_scan.png", size: 524288, type: "image/png", uploadedAt: "2026-10-09T09:05:00.000Z", source: "medical_ocr_import" }
      ],
      historicalObservations: [
        { testCode: "INR", testName: "INR Trend", value: 1.7, unit: "ratio", collectedAt: "2026-09-25T10:00:00.000Z", source: "external_ehr_import" },
        { testCode: "INR", testName: "INR Trend", value: 2.1, unit: "ratio", collectedAt: "2026-10-02T10:00:00.000Z", source: "external_ehr_import" }
      ],
      clarifications: [
        { text: "Patient confirms taking 5mg Warfarin consistently at 6 PM every evening without missed doses.", submittedAt: "2026-10-09T11:00:00.000Z" }
      ],
      internalDoctorNotes: "Patient INR is therapeutic (2.4). Caution about concurrent NSAID use."
    };

    const reviewHtml = doctorUI.renderBloodDisordersReviewSection(fullCase, true);

    // 1. Patient-provided information
    assert.ok(reviewHtml.includes("Deep Vein Thrombosis"), "Indication rendered");
    assert.ok(reviewHtml.includes("Minor gum bleeding"), "Bleeding history rendered");
    assert.ok(reviewHtml.includes("Warfarin 5mg daily"), "Anticoagulant therapy rendered");
    assert.ok(reviewHtml.includes("Mother had pulmonary embolism"), "Family history rendered");

    // 2. Laboratory measurements
    assert.ok(reviewHtml.includes("International Normalized Ratio") && reviewHtml.includes("2.4"), "INR value rendered");
    assert.ok(reviewHtml.includes("Platelet Count") && reviewHtml.includes("195"), "Platelet count rendered");
    assert.ok(reviewHtml.includes("Factor VIII Activity") && reviewHtml.includes("85"), "Factor VIII rendered");

    // 3. Units & reference ranges missing values (never assumed!)
    assert.ok(reviewHtml.includes("— (Not specified)"), "Null unit displayed without assumption");
    assert.ok(reviewHtml.includes("— (Not provided by source)"), "Null reference range displayed without assumption");
    assert.ok(reviewHtml.includes("— (Not recorded)"), "Null date displayed without assumption");

    // 4. Source documents
    assert.ok(reviewHtml.includes("inr_october_report.pdf"), "PDF attachment rendered");
    assert.ok(reviewHtml.includes("ultrasound_doppler_scan.png"), "Image attachment rendered");

    // 5. Historical observations
    assert.ok(reviewHtml.includes("Historical Observations & Longitudinal Trends"), "Historical trend header present");
    assert.ok(reviewHtml.includes("1.7 ratio") || reviewHtml.includes("1.7"), "Prior INR value rendered");

    // 6. Patient clarifications
    assert.ok(reviewHtml.includes("Patient confirms taking 5mg Warfarin consistently"), "Patient clarification text rendered");

    // 7. Internal doctor notes
    assert.ok(reviewHtml.includes("Patient INR is therapeutic"), "Internal notes rendered in doctor workstation");
    assert.ok(reviewHtml.includes("Strictly Quarantined from Patient"), "Quarantine label present");

    console.log("  ✔ All clinical data elements (patient info, labs, units, ranges, source docs, trends, clarifications, doctor notes) fully rendered.");
  }

  // ===========================================================================
  // TEST 5: Internal Doctor Notes Strict Quarantine
  // ===========================================================================
  console.log("▶ TEST 5: Internal Doctor Notes Strict Quarantine from Patients");
  {
    const caseWithSecretNote = {
      id: "case_hem_secret_notes",
      internalDoctorNotes: "CONFIDENTIAL_CLINICAL_NOTE: Check for occult malignancy if unexplained thrombosis recurs.",
      clinicianQuarantineNotes: "Internal hematology tumor board discussion notes",
      clinicalDiagnosis: "Deep Vein Thrombosis, Left Lower Extremity"
    };

    // Scrub for patient
    const scrubbed = doctorUI.scrubInternalNotesForPatient(caseWithSecretNote);
    assert.equal(scrubbed.internalDoctorNotes, undefined, "internalDoctorNotes must be scrubbed");
    assert.equal(scrubbed.clinicianQuarantineNotes, undefined, "clinicianQuarantineNotes must be scrubbed");

    // String serialization check
    const serialized = JSON.stringify(scrubbed);
    assert.ok(!serialized.includes("CONFIDENTIAL_CLINICAL_NOTE"), "Patient serialized case must never contain internal note text");

    console.log("  ✔ Internal doctor notes quarantined and completely removed from patient views.");
  }

  // ===========================================================================
  // TEST 6: Revision Gating — Require Review of Latest Revision Before Approval (Server 409)
  // ===========================================================================
  console.log("▶ TEST 6: Revision Gating & Stale Approval Rejection (HTTP 409 Conflict)");
  {
    // Create actual case in blood disorders service
    const createdCase = await bloodDisordersService.recordPatientBloodDisorderCase({
      patientId: patient.id,
      patientName: patient.name,
      assignedDoctorId: assignedHematologist.uid,
      conditionId: "vka_inr_monitoring",
      clinicalIntake: {
        indication: "Atrial Fibrillation - Warfarin Therapy",
        anticoagulantTherapy: "Warfarin 4mg"
      },
      labResults: [
        { testCode: "INR", testName: "INR", value: 2.2, unit: "ratio" }
      ]
    });

    assert.equal(createdCase.clinicalRevision, 1, "Initial clinical revision is 1");
    createdCase.status = "under_review";

    // Now, patient submits new lab result or clarification -> Revision increments to 2, flagged as stale
    bloodDisordersService.recordCaseLabResults({
      caseId: createdCase.id,
      labMeasurements: [
        { testCode: "INR", testName: "INR Repeat", value: 3.8, unit: "ratio" } // High INR!
      ]
    });

    assert.equal(createdCase.clinicalRevision, 2, "Clinical revision incremented to 2");
    assert.equal(createdCase.isRevisionStale, true, "Case flagged as isRevisionStale");
    assert.equal(createdCase.hasNewInfo, true, "Case flagged as hasNewInfo");

    // UI shows stale banner
    const staleHtml = doctorUI.renderBloodDisordersReviewSection(createdCase, true);
    assert.ok(staleHtml.includes("New Clinical Information Received"), "UI renders stale revision banner");
    assert.ok(staleHtml.includes("Revision 2"), "Banner indicates Revision 2");

    // A. Doctor tries to approve with STALE revision 1 (1 < 2) -> Server MUST throw 409 STALE_CLINICAL_REVISION
    await assert.rejects(
      async () => {
        await bloodDisordersService.reviewAndApproveBloodDisorderCase({
          caseId: createdCase.id,
          reviewingDoctor: assignedHematologist,
          clinicalDiagnosis: "Atrial Fibrillation with therapeutic INR",
          treatmentPlan: "Continue current Warfarin dose",
          reviewedRevision: 1 // STALE! (1 < 2)
        });
      },
      (err) => {
        assert.equal(err.code, "STALE_CLINICAL_REVISION", "Must reject stale revision with STALE_CLINICAL_REVISION");
        assert.equal(err.statusCode, 409, "Must return HTTP 409 Conflict");
        assert.equal(err.currentRevision, 2);
        assert.equal(err.reviewedRevision, 1);
        return true;
      },
      "Stale approval attempt rejected with 409"
    );

    // B. Doctor tries to approve with omitted revision while case is flagged stale -> Also rejected with 409
    await assert.rejects(
      async () => {
        await bloodDisordersService.reviewAndApproveBloodDisorderCase({
          caseId: createdCase.id,
          reviewingDoctor: assignedHematologist,
          clinicalDiagnosis: "Atrial Fibrillation",
          treatmentPlan: "Continue dose"
          // reviewedRevision omitted!
        });
      },
      (err) => {
        assert.equal(err.code, "STALE_CLINICAL_REVISION", "Must reject omitted revision while stale");
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // C. Doctor acknowledges review of Revision 2 and approves with reviewedRevision = 2
    doctorUI.acknowledgeNewRevision(createdCase.id);
    const approvedResult = await bloodDisordersService.reviewAndApproveBloodDisorderCase({
      caseId: createdCase.id,
      reviewingDoctor: assignedHematologist,
      clinicalDiagnosis: "Atrial Fibrillation with supratherapeutic INR (3.8) - dose adjustment needed",
      treatmentPlan: "Hold Warfarin for 1 day, reduce to 3.5mg daily, recheck INR in 48 hours",
      reviewedRevision: 2
    });

    assert.equal(approvedResult.success, true);
    assert.equal(approvedResult.case.status, "approved");
    assert.equal(approvedResult.case.doctorApproved, true);
    assert.ok(approvedResult.case.reportRef.startsWith("HV-HEM-"), "Certified report reference generated");
    assert.equal(approvedResult.case.isRevisionStale, false, "Stale flag cleared after approval");

    console.log("  ✔ Revision gating verified: server rejects stale revision with 409 Conflict; requires review of latest revision.");
  }

  // ===========================================================================
  // TEST 7: Clinical Boundaries — No Auto-Generated Diagnosis or Treatment
  // ===========================================================================
  console.log("▶ TEST 7: Clinical Boundaries (Zero Auto-Generated Diagnoses / Prescriptions)");
  {
    const freshCase = await bloodDisordersService.recordPatientBloodDisorderCase({
      patientId: "pat_fresh_02",
      patientName: "نادية سالم",
      assignedDoctorId: assignedHematologist.uid,
      conditionId: "thrombocytopenia_investigation",
      clinicalIntake: { indication: "Low platelet count on routine CBC" },
      labResults: [
        { testCode: "PLATELET_COUNT", testName: "Platelets", value: 65, unit: "x10^9/L" }
      ]
    });

    // Check doctorUI draft notes are not auto-populated with AI treatment
    const draftNotes = doctorUI.getDraftNotes(freshCase.id);
    assert.equal(draftNotes, null, "Fresh case must NOT have pre-filled AI treatment plans");

    // Approval must strictly REJECT empty physician diagnosis
    await assert.rejects(
      async () => {
        await bloodDisordersService.reviewAndApproveBloodDisorderCase({
          caseId: freshCase.id,
          reviewingDoctor: assignedHematologist,
          clinicalDiagnosis: "", // Empty diagnosis!
          treatmentPlan: "Watch and wait"
        });
      },
      (err) => err.code === "PHYSICIAN_DIAGNOSIS_REQUIRED",
      "Must reject empty clinical diagnosis"
    );

    // Approval must strictly REJECT unassigned doctor
    await assert.rejects(
      async () => {
        await bloodDisordersService.reviewAndApproveBloodDisorderCase({
          caseId: freshCase.id,
          reviewingDoctor: unassignedDoctor,
          clinicalDiagnosis: "Immune Thrombocytopenia",
          treatmentPlan: "Prednisone regimen"
        });
      },
      (err) => err.code === "CASE_ASSIGNED_TO_OTHER_DOCTOR",
      "Must reject unassigned doctor"
    );

    console.log("  ✔ Clinical boundaries verified: explicit physician diagnosis required, zero auto-treatment.");
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL 7 BLOOD DISORDERS DOCTOR REVIEW WORKFLOW TESTS PASSED (100%)");
  console.log("==================================================================");
})();
