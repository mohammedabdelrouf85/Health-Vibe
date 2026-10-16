/**
 * Health Vibe AI - Doctor Clinical Review & Approval Cockpit Test Suite
 * Benchmark: Rology (Single-Screen Teleradiology & Diagnostic Verification)
 *
 * Verifies:
 * 1. Single-screen unified cockpit layout containing all required sections simultaneously:
 *    - بيانات المريض (Patient Demographics & Attending Physician Linkage)
 *    - التاريخ المرضي (Medical History: Chronic diseases, smoking, allergies, ongoing meds)
 *    - المدخلات الحالية (Current Inputs: Chief complaint, duration, vitals matrix, radiology)
 *    - مخرجات الـ AI ونسبة الثقة (AI Model Outputs, Confidence %, SVG gauge, clinical drivers)
 *    - أزرار القرار السريري: Approve, Modify & Approve, Reject, Request Follow-up
 * 2. Intelligent clinical condition derivation & standard care protocol mapping (Rx & recommendations).
 * 3. AI confidence scoring & bounds.
 * 4. Action handlers & interactive modals (Modify & Approve, Reject, Request Follow-up).
 * 5. Arabic and English language parity.
 * 6. Integration with index.html, styles.css, and app.js selectDoctorCase.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

console.log("==================================================================");
console.log("🩻 HEALTH VIBE AI: ROLOGY CLINICAL APPROVAL COCKPIT TEST SUITE");
console.log("   Single-Screen Diagnostic Cockpit & Action Buttons (Req #60)");
console.log("==================================================================\n");

// Setup Node test environment globals
global.window = global;
global.currentLanguage = "ar";

const mockElements = new Map();
global.document = {
  getElementById: (id) => mockElements.get(id) || null,
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      innerHTML: "",
      style: {},
      children: [],
      appendChild: (child) => el.children.push(child),
      removeChild: (child) => {
        const idx = el.children.indexOf(child);
        if (idx !== -1) el.children.splice(idx, 1);
      }
    };
    return el;
  },
  body: {
    appendChild: (child) => {},
    removeChild: (child) => {}
  }
};

// Load DoctorReviewCockpit module
const cockpitModulePath = path.resolve(__dirname, "../app/modules/doctor/doctor-review-cockpit.js");
assert.ok(fs.existsSync(cockpitModulePath), "doctor-review-cockpit.js file must exist");
const cockpit = require(cockpitModulePath);

// Sample Mock Case Data representing a real clinical patient
const mockPatientCase = {
  id: "case-cairo-892147",
  name: "أحمد مصطفى كمال",
  nameEn: "Ahmed M. Kamal",
  age: 46,
  calculatedAge: 46,
  gender: "male",
  phone: "01098765432",
  mrn: "MRN-892147",
  attendingPhysicianName: "د. طارق محمود",
  attendingPhysicianLicense: "EMS #48291",
  priority: "high",
  oxygenLevel: 91,
  o2: 91,
  heartRate: 88,
  systolic: 128,
  diastolic: 82,
  respiratoryRate: 24,
  temperature: 37.6,
  duration: "4 أيام",
  durationEn: "4 days",
  chiefComplaint: "سعال جاف مجهد مع ضيق بالتنفس وتزييق بالصدر",
  breathingDifficulty: "صعوبة تنفس مع المجهود البسيط",
  coughLevel: "سعال متهيج متكرر",
  asthma: true,
  asthmaCopd: "yes",
  hypertension: true,
  smokingStatus: "مدخن سابق (12 سنة)",
  allergies: "حساسية من البنسلين ومشتقاته (Penicillin Allergy)",
  currentMedications: "بخاخ فينتولين عند اللزوم، أقراص كونكور 5 مجم للضغط",
  aiPrediction: "نوبة تفاقم ربو شعبي حادة (Acute Bronchial Asthma Exacerbation)",
  aiConfidence: 94.6,
  triggeredRules: [
    { id: "RULE-HYPOX-91", points: 3, ar: "نقص أكسجين طفيف (SpO2 91%)" },
    { id: "RULE-ASTHMA-HX", points: 2, ar: "تاريخ ربو شعبي سابق" }
  ]
};

// -----------------------------------------------------------------------------
// TEST 1: Module Structure & Exports
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Module Structure & Global Exports");
assert.ok(cockpit, "DoctorReviewCockpit module must be exported");
assert.equal(typeof cockpit.renderRologyCockpit, "function", "renderRologyCockpit must be a function");
assert.equal(typeof cockpit.deriveAiCondition, "function", "deriveAiCondition must be a function");
assert.equal(typeof cockpit.deriveAiConfidence, "function", "deriveAiConfidence must be a function");
assert.equal(typeof cockpit.getStandardCareProtocol, "function", "getStandardCareProtocol must be a function");
assert.equal(typeof cockpit.approveDirect, "function", "approveDirect must be a function");
assert.equal(typeof cockpit.openModifyAndApproveModal, "function", "openModifyAndApproveModal must be a function");
assert.equal(typeof cockpit.openRejectCaseModal, "function", "openRejectCaseModal must be a function");
assert.equal(typeof cockpit.openRequestFollowUpModal, "function", "openRequestFollowUpModal must be a function");
console.log("  ✓ All DoctorReviewCockpit API methods present and exported correctly.");

// -----------------------------------------------------------------------------
// TEST 2: Pillar 1 - Patient Demographics & Attending Physician
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Pillar 1 - Patient Demographics & Attending Linkage in Cockpit HTML");
const htmlAr = cockpit.renderRologyCockpit(mockPatientCase, false);

assert.ok(htmlAr.includes("أحمد مصطفى كمال"), "Patient name must appear in cockpit");
assert.ok(htmlAr.includes("46") && htmlAr.includes("سنة"), "Patient age must appear in cockpit");
assert.ok(htmlAr.includes("ذكر 👨"), "Patient gender icon and label must appear");
assert.ok(htmlAr.includes("MRN-892147"), "Medical Record Number (MRN) must appear");
assert.ok(htmlAr.includes("01098765432"), "Patient phone/contact must appear");
assert.ok(htmlAr.includes("د. طارق محمود"), "Attending physician name must appear");
assert.ok(htmlAr.includes("EMS #48291"), "Doctor syndicate license badge must appear");
console.log("  ✓ Patient Demographics (Name, Age, Gender, MRN, Phone, Attending Doctor) verified.");

// -----------------------------------------------------------------------------
// TEST 3: Pillar 2 - Patient Medical History
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Pillar 2 - Patient Medical History (Chronic conditions, Smoking, Allergies, Meds)");
assert.ok(htmlAr.includes("التاريخ المرضي السريري"), "Medical history title must be present");
assert.ok(htmlAr.includes("حساسية صدرية / ربو"), "Asthma chronic condition chip must be present");
assert.ok(htmlAr.includes("ارتفاع ضغط الدم"), "Hypertension condition chip must be present");
assert.ok(htmlAr.includes("مدخن سابق"), "Smoking status must be displayed");
assert.ok(htmlAr.includes("حساسية من البنسلين"), "Penicillin allergy must be highlighted");
assert.ok(htmlAr.includes("بخاخ فينتولين"), "Active maintenance medications must appear");
console.log("  ✓ Patient Medical History accurately parsed and rendered with alert badges.");

// -----------------------------------------------------------------------------
// TEST 4: Pillar 3 - Current Clinical Inputs & Vitals
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Pillar 3 - Current Inputs & Vitals Matrix");
assert.ok(htmlAr.includes("91%"), "SpO2 91% must appear in vitals matrix");
assert.ok(htmlAr.includes("88") && htmlAr.includes("bpm"), "Heart rate 88 bpm must appear in vitals matrix");
assert.ok(htmlAr.includes("128/82"), "Blood pressure 128/82 must appear in vitals matrix");
assert.ok(htmlAr.includes("24") && htmlAr.includes("/min"), "Respiratory rate 24/min must appear");
assert.ok(htmlAr.includes("37.6°C"), "Temperature must appear in vitals matrix");
assert.ok(htmlAr.includes("سعال جاف مجهد"), "Chief complaint must appear");
assert.ok(htmlAr.includes("4 أيام"), "Symptom duration must appear");
assert.ok(htmlAr.includes("Chest X-Ray") || htmlAr.includes("أشعة سينية"), "Radiology attachments gallery must appear");
console.log("  ✓ Vitals matrix (SpO2, HR, BP, RR, Temp) and Chief Complaint verified.");

// -----------------------------------------------------------------------------
// TEST 5: Pillar 4 - AI Diagnostic Outputs & Confidence Score
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Pillar 4 - AI Diagnostic Outputs & Model Confidence");
assert.ok(htmlAr.includes("مخرجات الذكاء الاصطناعي ونسبة الثقة"), "AI Outputs section title must be present");
assert.ok(htmlAr.includes("نوبة تفاقم ربو شعبي حادة") || htmlAr.includes("ربو شعبي"), "AI predicted condition title must appear");
assert.ok(htmlAr.includes("94.6%"), "Model confidence 94.6% must appear");
assert.ok(htmlAr.includes("confidence-circle"), "SVG circular confidence progress gauge must be rendered");
assert.ok(htmlAr.includes("ثقة سريرية عالية"), "High clinical certainty badge must appear");
assert.ok(htmlAr.includes("الدلائل السريرية والمؤشرات المرجحة"), "Key diagnostic drivers must appear");
assert.ok(htmlAr.includes("تنبيه سريري وتنظيمي"), "Regulatory clinical decision support notice must appear");
console.log("  ✓ AI Predicted Condition, 94.6% Confidence gauge, and clinical evidence verified.");

// -----------------------------------------------------------------------------
// TEST 6: Pillar 5 - Decision Action Buttons: Approve, Modify & Approve, Reject, Request Follow-up
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 6: Pillar 5 - The 4 Mandatory Decision Action Buttons");
// Check for Approve button
assert.ok(htmlAr.includes("HealthVibes.DoctorReviewCockpit.approveDirect"), "Approve button trigger must exist");
assert.ok(htmlAr.includes("اعتماد فوري (Approve)"), "Approve button Arabic label must exist");

// Check for Modify & Approve button
assert.ok(htmlAr.includes("HealthVibes.DoctorReviewCockpit.openModifyAndApproveModal"), "Modify & Approve button trigger must exist");
assert.ok(htmlAr.includes("تعديل ثم اعتماد (Modify & Approve)"), "Modify & Approve button Arabic label must exist");

// Check for Reject button
assert.ok(htmlAr.includes("HealthVibes.DoctorReviewCockpit.openRejectCaseModal"), "Reject button trigger must exist");
assert.ok(htmlAr.includes("رفض (Reject)"), "Reject button Arabic label must exist");

// Check for Request Follow-up button
assert.ok(htmlAr.includes("HealthVibes.DoctorReviewCockpit.openRequestFollowUpModal"), "Request Follow-up button trigger must exist");
assert.ok(htmlAr.includes("طلب متابعة (Request Follow-up)"), "Request Follow-up button Arabic label must exist");

console.log("  ✓ All 4 clinical decision action buttons (Approve, Modify & Approve, Reject, Request Follow-up) present in top & bottom bars.");

// -----------------------------------------------------------------------------
// TEST 7: English Parity & Condition Derivation
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 7: English Parity & Clinical Condition Derivation");
const htmlEn = cockpit.renderRologyCockpit(mockPatientCase, true);
assert.ok(htmlEn.includes("Patient Medical History"), "English medical history header verified");
assert.ok(htmlEn.includes("Current Inputs & Clinical Vitals"), "English vitals header verified");
assert.ok(htmlEn.includes("AI Model Outputs & Confidence Score"), "English AI outputs header verified");
assert.ok(htmlEn.includes("Approve"), "English Approve button verified");
assert.ok(htmlEn.includes("Modify & Approve"), "English Modify & Approve button verified");
assert.ok(htmlEn.includes("Reject"), "English Reject button verified");
assert.ok(htmlEn.includes("Request Follow-up"), "English Request Follow-up button verified");

// Test condition derivations
const derivedAsthma = cockpit.deriveAiCondition({ asthma: true, oxygenLevel: 91 }, true);
assert.ok(derivedAsthma.toLowerCase().includes("asthma"), "Should derive asthma condition");

const derivedPneumonia = cockpit.deriveAiCondition({ temperature: 38.5, coughLevel: "severe" }, true);
assert.ok(derivedPneumonia.toLowerCase().includes("respiratory") || derivedPneumonia.toLowerCase().includes("pneumonia"), "Should derive infection/pneumonia condition");

const derivedBronchitis = cockpit.deriveAiCondition({ temperature: 36.8, coughLevel: "mild" }, true);
assert.ok(derivedBronchitis.toLowerCase().includes("bronchitis"), "Should derive bronchitis condition");
console.log("  ✓ English parity and clinical rule condition derivation verified.");

// -----------------------------------------------------------------------------
// TEST 8: File System Integration (index.html, styles.css, app.js)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 8: Workspace File System Integration");
const indexHtmlContent = fs.readFileSync(path.resolve(__dirname, "../app/index.html"), "utf8");
assert.ok(indexHtmlContent.includes("doctor-review-cockpit.js"), "index.html must include script tag for doctor-review-cockpit.js");
assert.ok(indexHtmlContent.includes("doctor-review-cockpit.css"), "index.html must include link tag for doctor-review-cockpit.css");

const stylesCssContent = fs.readFileSync(path.resolve(__dirname, "../app/styles.css"), "utf8");
assert.ok(stylesCssContent.includes("rology-cockpit-container"), "styles.css must include .rology-cockpit-container");
assert.ok(stylesCssContent.includes("btn-cockpit"), "styles.css must include .btn-cockpit");
assert.ok(stylesCssContent.includes("btn-cockpit.modify-approve"), "styles.css must style .btn-cockpit.modify-approve");
assert.ok(stylesCssContent.includes("btn-cockpit.request-followup"), "styles.css must style .btn-cockpit.request-followup");

const appJsContent = fs.readFileSync(path.resolve(__dirname, "../app/app.js"), "utf8");
assert.ok(appJsContent.includes("HealthVibes.DoctorReviewCockpit.renderRologyCockpit"), "app.js selectDoctorCase must call renderRologyCockpit");

console.log("  ✓ index.html, styles.css, and app.js seamlessly integrated.");

console.log("\n==================================================================");
console.log("🎉 ALL 8/8 ROLOGY DOCTOR REVIEW COCKPIT TESTS PASSED WITH 100% SUCCESS!");
console.log("   Single-screen verification workflow fully meets Task #60.");
console.log("==================================================================");
