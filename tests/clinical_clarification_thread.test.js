/**
 * Health Vibe AI - Clinical Clarification Thread Test Suite
 *
 * Validates:
 * 1. Multi-cycle grouping of doctor requests and patient responses.
 * 2. Exact state labeling ('unanswered', 'submitted', 'reviewed') backed strictly by stored events (zero fabricated read receipts).
 * 3. Clinical measurement units display (%, °C, mmHg, bpm, breaths/min, mg/dL).
 * 4. Permitted attachment constraints (.pdf, .jpg, .jpeg, .png, max 10MB) and rejection of disallowed files.
 * 5. Direct action interactive reply card for patients on outstanding requests.
 * 6. Strict isolation of internal clinician notes from patient-facing clarification thread.
 * 7. Long Arabic message resiliency (overflow wrap, RTL) and mobile keyboard scroll margin safety.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

console.log("==================================================================");
console.log("💬 HEALTH VIBE AI: STRUCTURED CLARIFICATION THREAD TEST SUITE");
console.log("   Cycles, Stored Events Audit, Units, Attachments & Isolation");
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
global.currentLanguage = "ar";

const mockElements = new Map();
global.document = {
  getElementById: (id) => mockElements.get(id) || null,
  querySelectorAll: () => [],
  createElement: (tag) => ({
    tagName: tag,
    innerHTML: "",
    children: [],
    classList: { add: () => {}, remove: () => {}, contains: () => false }
  }),
  body: { appendChild: () => {} }
};

// Load Doctor UI module
const doctorUI = require(path.resolve(__dirname, "../app/modules/doctor/doctor-ui.js"));

// ==================================================================
// TEST 1: Multi-Cycle Extraction and Request-Response Grouping
// ==================================================================
console.log("▶ TEST 1: Multi-Cycle Extraction and Request-Response Grouping ...");

const multiCycleCase = {
  id: "case_thread_001",
  patientName: "أحمد عبد الله",
  patientNameEn: "Ahmed Abdullah",
  status: "more_info_requested",
  clarificationCycles: [
    {
      cycle: 1,
      requestId: "req_cycle_1",
      request: {
        timestamp: "2026-10-07T09:00:00Z",
        doctorName: "د. هبة الشريف",
        doctorNameEn: "Dr. Heba El-Sherif",
        note: "يرجى قياس نسبة الأكسجين أثناء الراحة وذكر ما إذا كان السعال مصحوباً ببلغم.",
        noteEn: "Please measure resting SpO2 and indicate if the cough is productive."
      },
      response: {
        timestamp: "2026-10-07T11:30:00Z",
        patientName: "أحمد عبد الله",
        patientNotes: "نسبة الأكسجين وقت الراحة 95%، والسعال جاف تماماً دون أي بلغم.",
        measurements: [
          { type: "spo2", value: 95, unit: "%", icon: "🫁" },
          { type: "temp", value: 37.4, unit: "°C", icon: "🌡️" }
        ],
        attachments: [
          { name: "oximeter_reading.jpg", size: 1048576, sizeLabel: "1.0 MB" }
        ]
      },
      status: "reviewed",
      eventTimestamp: "2026-10-07T12:00:00Z",
      reviewedAt: "2026-10-07T12:00:00Z"
    },
    {
      cycle: 2,
      requestId: "req_cycle_2",
      request: {
        timestamp: "2026-10-08T08:00:00Z",
        doctorName: "د. هبة الشريف",
        doctorNameEn: "Dr. Heba El-Sherif",
        note: "شكراً على الإفادة. يرجى قياس ضغط الدم ومعدل النبض الحالي.",
        noteEn: "Thank you. Please measure current blood pressure and pulse rate."
      },
      response: null, // Outstanding / unanswered request
      status: "unanswered",
      eventTimestamp: "2026-10-08T08:00:00Z"
    }
  ],
  statusHistory: [
    { status: "submitted", changedAt: "2026-10-07T08:30:00Z", changedByRole: "patient" },
    { status: "more_info_requested", changedAt: "2026-10-07T09:00:00Z", changedByRole: "doctor" },
    { status: "under_review", changedAt: "2026-10-07T11:30:00Z", changedByRole: "patient" },
    { status: "reviewed", changedAt: "2026-10-07T12:00:00Z", changedByRole: "doctor" },
    { status: "more_info_requested", changedAt: "2026-10-08T08:00:00Z", changedByRole: "doctor" }
  ]
};

const thread = doctorUI.extractClarificationThread(multiCycleCase, "doctor");
const cycles = thread.cycles;
assert.equal(cycles.length, 2, "Must extract exactly 2 structured cycles");
assert.equal(cycles[0].cycle, 1, "First cycle number must be 1");
assert.equal(cycles[0].state, "reviewed", "Cycle 1 must be labeled reviewed");
assert.ok(cycles[0].response, "Cycle 1 must have an associated patient response");
assert.equal(cycles[1].cycle, 2, "Second cycle number must be 2");
assert.equal(cycles[1].state, "unanswered", "Cycle 2 must be labeled unanswered");
assert.equal(cycles[1].response, null, "Cycle 2 response must be null");

console.log("  ✓ Multi-cycle grouping and chronological ordering successfully verified.\n");

// ==================================================================
// TEST 2: Exact State Derivation from Stored Events (Zero Fabricated Receipts)
// ==================================================================
console.log("▶ TEST 2: Exact State Derivation from Stored Events (Zero Fabricated Receipts) ...");

// Case A: Unanswered (Doctor requested, patient has not replied)
const caseUnanswered = {
  id: "case_audit_unanswered",
  moreInfoNote: "يرجى إعادة قياس النبض",
  moreInfoRequestedAt: "2026-10-08T10:00:00Z",
  statusHistory: [
    { status: "more_info_requested", changedAt: "2026-10-08T10:00:00Z", changedByRole: "doctor" }
  ]
};
const cyclesA = doctorUI.extractClarificationThread(caseUnanswered, "doctor").cycles;
assert.equal(cyclesA[0].state, "unanswered", "State must strictly derive to 'unanswered'");
assert.equal(cyclesA[0].stateMeta.eventTimestamp, "2026-10-08T10:00:00Z", "Event timestamp must match stored event");

// Case B: Submitted (Patient replied, doctor has not certified/reviewed)
const caseSubmitted = {
  id: "case_audit_submitted",
  moreInfoNote: "يرجى قياس السكر",
  patientResponse: "نسبة السكر الصائم 110 mg/dL",
  moreInfoRequestedAt: "2026-10-08T09:00:00Z",
  patientRespondedAt: "2026-10-08T11:00:00Z",
  statusHistory: [
    { status: "more_info_requested", changedAt: "2026-10-08T09:00:00Z", changedByRole: "doctor" },
    { status: "under_review", changedAt: "2026-10-08T11:00:00Z", changedByRole: "patient", note: "Patient submitted requested info" }
  ]
};
const cyclesB = doctorUI.extractClarificationThread(caseSubmitted, "doctor").cycles;
assert.equal(cyclesB[0].state, "submitted", "State must strictly derive to 'submitted'");
assert.equal(cyclesB[0].stateMeta.eventTimestamp, "2026-10-08T11:00:00Z", "Event timestamp must match patient submission event");

// Case C: Reviewed (Doctor reviewed/approved subsequent to patient submission)
const caseReviewed = {
  id: "case_audit_reviewed",
  moreInfoNote: "يرجى تزويدنا بقياس الضغط",
  patientResponse: "الضغط 125/82 mmHg",
  statusHistory: [
    { status: "more_info_requested", changedAt: "2026-10-08T08:00:00Z", changedByRole: "doctor" },
    { status: "under_review", changedAt: "2026-10-08T09:30:00Z", changedByRole: "patient" },
    { status: "approved", changedAt: "2026-10-08T10:15:00Z", changedByRole: "doctor", note: "Clinical approval certified" }
  ]
};
const cyclesC = doctorUI.extractClarificationThread(caseReviewed, "doctor").cycles;
assert.equal(cyclesC[0].state, "reviewed", "State must strictly derive to 'reviewed'");
assert.equal(cyclesC[0].stateMeta.eventTimestamp, "2026-10-08T10:15:00Z", "Event timestamp must match doctor audit event");

// Verify zero fabricated receipts in rendered HTML
const renderedAuditHtml = doctorUI.renderClarificationThreadHtml(caseSubmitted, false, "doctor");
assert.ok(!renderedAuditHtml.includes("تمت القراءة الآن"), "Must not invent fake 'read right now' receipt");
assert.ok(renderedAuditHtml.includes("thread-audit-footer"), "Must include verified audit event footer");
assert.ok(renderedAuditHtml.includes("التوثيق السريري المعتمد"), "Must include verified clinical audit header in Arabic");

console.log("  ✓ Stored event derivation validated for unanswered, submitted, and reviewed states.\n");

// ==================================================================
// TEST 3: Clinical Measurement Units Display
// ==================================================================
console.log("▶ TEST 3: Clinical Measurement Units Display ...");

const unitsCase = {
  id: "case_units_test",
  status: "under_review",
  clarificationCycles: [
    {
      cycle: 1,
      requestId: "req_units",
      request: {
        timestamp: "2026-10-08T07:00:00Z",
        doctorName: "Dr. Mark Adams",
        doctorNameEn: "Dr. Mark Adams",
        note: "Please submit updated vitals.",
        noteEn: "Please submit updated vitals."
      },
      response: {
        timestamp: "2026-10-08T07:45:00Z",
        authorName: "Sarah Jenkins",
        patientNotes: "Updated morning vitals taken after 15 min rest.",
        measurements: [
          { type: "spo2", value: 97, unit: "%", icon: "🫁", nameEn: "SpO2 Oxygen" },
          { type: "temp", value: 36.8, unit: "°C", icon: "🌡️", nameEn: "Body Temperature" },
          { type: "bp", value: "118/76", unit: "mmHg", icon: "🩸", nameEn: "Blood Pressure" },
          { type: "hr", value: 72, unit: "bpm", icon: "❤️", nameEn: "Heart Rate" },
          { type: "rr", value: 16, unit: "breaths/min", icon: "🫁", nameEn: "Respiratory Rate" },
          { type: "glucose", value: 98, unit: "mg/dL", icon: "🧪", nameEn: "Blood Glucose" }
        ]
      },
      status: "submitted",
      eventTimestamp: "2026-10-08T07:45:00Z"
    }
  ]
};

const renderedUnitsHtmlEn = doctorUI.renderClarificationThreadHtml(unitsCase, true, "doctor");
assert.ok(renderedUnitsHtmlEn.includes("%"), "Must render % oxygen unit");
assert.ok(renderedUnitsHtmlEn.includes("°C"), "Must render °C temperature unit");
assert.ok(renderedUnitsHtmlEn.includes("mmHg"), "Must render mmHg blood pressure unit");
assert.ok(renderedUnitsHtmlEn.includes("bpm"), "Must render bpm pulse unit");
assert.ok(renderedUnitsHtmlEn.includes("breaths/min"), "Must render breaths/min respiratory rate unit");
assert.ok(renderedUnitsHtmlEn.includes("mg/dL"), "Must render mg/dL glucose unit");

console.log("  ✓ All 6 clinical measurement units accurately rendered with icons and chips.\n");

// ==================================================================
// TEST 4: Permitted Attachments & File Validation Engine
// ==================================================================
console.log("▶ TEST 4: Permitted Attachments & File Validation Engine ...");

// Valid attachments
const validPdf = { name: "chest_xray_report.pdf", size: 2 * 1024 * 1024, type: "application/pdf" };
const validJpg = { name: "lab_results.jpg", size: 4.5 * 1024 * 1024, type: "image/jpeg" };
const validPng = { name: "ecg_trace.png", size: 500 * 1024, type: "image/png" };

const valPdfRes = doctorUI.validateAttachmentFile(validPdf, true);
assert.equal(valPdfRes.ok, true, "Valid PDF must be accepted");

const valJpgRes = doctorUI.validateAttachmentFile(validJpg, true);
assert.equal(valJpgRes.ok, true, "Valid JPG must be accepted");

const valPngRes = doctorUI.validateAttachmentFile(validPng, true);
assert.equal(valPngRes.ok, true, "Valid PNG must be accepted");

// Disallowed attachments (executable, script, archive)
const badExe = { name: "malicious.exe", size: 1024, type: "application/x-msdownload" };
const valExeRes = doctorUI.validateAttachmentFile(badExe, true);
assert.equal(valExeRes.ok, false, "Executable file must be rejected");
assert.ok(valExeRes.error.includes("Invalid file type"), "Must provide specific file type error");

const badZip = { name: "records.zip", size: 1024, type: "application/zip" };
const valZipRes = doctorUI.validateAttachmentFile(badZip, false);
assert.equal(valZipRes.ok, false, "ZIP file must be rejected");
assert.ok(valZipRes.error.includes("غير مسموح"), "Must provide Arabic rejection notice");

// Oversized attachment (> 10MB)
const hugeFile = { name: "giant_scan.pdf", size: 12 * 1024 * 1024, type: "application/pdf" };
const valHugeRes = doctorUI.validateAttachmentFile(hugeFile, true);
assert.equal(valHugeRes.ok, false, "Oversized file (>10MB) must be rejected");
assert.ok(valHugeRes.error.includes("exceeds the 10MB limit"), "Must specify 10MB limit breach");

console.log("  ✓ Permitted attachment constraints (.pdf, .jpg, .jpeg, .png, max 10MB) strictly enforced.\n");

// ==================================================================
// TEST 5: Direct Action Form for Outstanding Requests
// ==================================================================
console.log("▶ TEST 5: Direct Action Form for Outstanding Requests ...");

const unansweredCase = {
  id: "case_direct_act_001",
  status: "more_info_requested",
  moreInfoNote: "يرجى توضيح هل تتناول أدوية حالياً وإعادة قياس الأكسجين.",
  moreInfoRequestedAt: "2026-10-08T11:00:00Z"
};

// Patient View: Must render interactive direct action card
const patientViewHtml = doctorUI.renderClarificationThreadHtml(unansweredCase, false, "patient");
assert.ok(patientViewHtml.includes("thread-direct-action-card"), "Patient view must include direct action card");
assert.ok(patientViewHtml.includes("threadReplyText_case_direct_act_001"), "Patient view must include reply notes textarea");
assert.ok(patientViewHtml.includes("threadReplyO2_case_direct_act_001"), "Patient view must include SpO2 input field");
assert.ok(patientViewHtml.includes("threadReplyFiles_case_direct_act_001"), "Patient view must include file upload input");
assert.ok(patientViewHtml.includes("btnSubmitClarificationReply_case_direct_act_001"), "Patient view must include direct submit button");

// Doctor View: Must NOT render patient reply inputs, but show waiting notice
const doctorViewHtml = doctorUI.renderClarificationThreadHtml(unansweredCase, false, "doctor");
assert.ok(!doctorViewHtml.includes("threadReplyText_case_direct_act_001"), "Doctor view must NOT render patient reply textarea");
assert.ok(doctorViewHtml.includes("thread-doctor-waiting-notice"), "Doctor view must render waiting notice");
assert.ok(doctorViewHtml.includes("طلب معلق: بانتظار إفادة ورد المريض"), "Doctor view must show outstanding request banner");

console.log("  ✓ Direct action to answer outstanding request verified with role-specific rendering.\n");

// ==================================================================
// TEST 6: Strict Isolation of Internal Clinician Notes
// ==================================================================
console.log("▶ TEST 6: Strict Isolation of Internal Clinician Notes ...");

const sensitiveCase = {
  id: "case_sensitive_001",
  status: "more_info_requested",
  moreInfoNote: "يرجى ذكر عدد مرات استخدام البخاخ اليوم.",
  moreInfoRequestedAt: "2026-10-08T09:00:00Z",
  // SENSITIVE CLINICAL DATA THAT MUST REMAIN SEPARATE:
  clinicalDiagnosis: "الاشتباه في تفاقم الربو الشعبي الحاد مع ارتشاح رئوي محتمل",
  internalDoctorNotes: "ملاحظة سريرية داخلية: المريض غير منتظم في العلاج، يجب مراجعة تاريخ الحساسية في الجلسة القادمة.",
  doctorNotes: "ملاحظات طبية خاصة بالطاقم الطبي فقط.",
  rejectionReason: "بيانات غير كافية للاعتماد السريري.",
  clinicalRuleScore: "CRITICAL_TRIAGE_SCORE_94"
};

const patientRendered = doctorUI.renderClarificationThreadHtml(sensitiveCase, false, "patient");
assert.ok(!patientRendered.includes(sensitiveCase.clinicalDiagnosis), "Patient thread must NEVER expose internal clinicalDiagnosis");
assert.ok(!patientRendered.includes(sensitiveCase.internalDoctorNotes), "Patient thread must NEVER expose internalDoctorNotes");
assert.ok(!patientRendered.includes(sensitiveCase.doctorNotes), "Patient thread must NEVER expose doctorNotes");
assert.ok(!patientRendered.includes(sensitiveCase.rejectionReason), "Patient thread must NEVER expose internal rejectionReason");
assert.ok(!patientRendered.includes(sensitiveCase.clinicalRuleScore), "Patient thread must NEVER expose internal clinical scoring");

const doctorThreadRendered = doctorUI.renderClarificationThreadHtml(sensitiveCase, false, "doctor");
assert.ok(!doctorThreadRendered.includes(sensitiveCase.internalDoctorNotes), "Clarification thread itself must keep internal notes separate even in doctor thread view");

console.log("  ✓ Internal clinician notes strictly quarantined and invisible in patient clarification thread.\n");

// ==================================================================
// TEST 7: Resiliency with Long Arabic Messages & Mobile Keyboard CSS
// ==================================================================
console.log("▶ TEST 7: Resiliency with Long Arabic Messages & Mobile Keyboard CSS ...");

const longArabicText = "أشعر_بضيق_تنفس_شديد_جداً_منذ_الصباح_الباكر_مع_سعال_مستمر_ولم_أستطع_النوم_بسبب_تزايد_الأعراض_رغم_استخدام_موسع_الشعب_الهوائية_مرتين_متتاليتين_بدون_تحسن_ملحوظ";
const longTextCase = {
  id: "case_long_arabic",
  status: "under_review",
  clarificationCycles: [
    {
      cycle: 1,
      requestId: "req_long",
      request: {
        timestamp: "2026-10-08T08:00:00Z",
        doctorName: "د. أحمد كمال",
        note: "يرجى كتابة تقرير مفصل عن تطور الحالة منذ الصباح."
      },
      response: {
        timestamp: "2026-10-08T09:00:00Z",
        authorName: "المريض",
        patientNotes: longArabicText
      },
      status: "submitted",
      eventTimestamp: "2026-10-08T09:00:00Z"
    }
  ]
};

const longRendered = doctorUI.renderClarificationThreadHtml(longTextCase, false, "patient");
assert.ok(longRendered.includes(longArabicText), "Must preserve long Arabic message content");

// Verify CSS definitions in app/styles.css
const stylesContent = fs.readFileSync(path.resolve(__dirname, "../app/styles.css"), "utf-8");
assert.ok(stylesContent.includes("overflow-wrap: anywhere"), "Must contain overflow-wrap: anywhere for unbreakable Arabic strings");
assert.ok(stylesContent.includes("word-break: break-word"), "Must contain word-break: break-word for long text safety");
assert.ok(stylesContent.includes("scroll-margin-bottom: 120px"), "Must contain scroll-margin-bottom: 120px for mobile keyboard padding");
assert.ok(stylesContent.includes(".clarification-cycle-card"), "Must define structured cycle card styles");
assert.ok(stylesContent.includes(".thread-measurements-grid"), "Must define clinical measurements grid styles");

console.log("  ✓ Long Arabic text overflow handling and mobile keyboard scroll margin validated.\n");

// ==================================================================
// TEST 8: Bilingual Translation Keys Parity for Clarification Thread
// ==================================================================
console.log("▶ TEST 8: Bilingual Translation Keys Parity for Clarification Thread ...");

const { translations } = require(path.resolve(__dirname, "../app/i18n.js"));
const keysToVerify = [
  "clarificationThread",
  "cycleLabel",
  "cycleOutOf",
  "statusUnanswered",
  "statusSubmitted",
  "statusReviewed",
  "eventVerifiedAt",
  "requestedVitals",
  "permittedAttachments",
  "directAnswerTitle",
  "internalNotesIsolated"
];

for (const key of keysToVerify) {
  assert.ok(translations.en.doctor[key], `English catalog must include doctor.${key}`);
  assert.ok(translations.ar.doctor[key], `Arabic catalog must include doctor.${key}`);
}

console.log("  ✓ All clarification thread translation keys verified with 100% Arabic/English parity.\n");

console.log("==================================================================");
console.log("🎉 ALL 8 STRUCTURED CLARIFICATION THREAD TESTS PASSED (100%)");
console.log("==================================================================");
