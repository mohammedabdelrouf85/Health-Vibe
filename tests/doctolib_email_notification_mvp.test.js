/**
 * Health Vibe AI - Doctolib Email Notification MVP Test Suite
 * Benchmark: Doctolib (Clinical Notifications, Doctor Case Queuing, Certified Report Delivery)
 *
 * Verifies:
 * 1. Doctor Notification on New Case for Review (buildNewCaseForDoctorEmail, notifyDoctorNewCase).
 * 2. Patient Notification on Certified Report Approval (buildResultReadyEmail, notifyPatientReportApproved).
 * 3. Template Dispatcher Routing (buildNotificationEmailTemplate) for new_case_for_review & report_approved.
 * 4. Priority Tiers (Urgent Red Flag vs Routine Standard) in subject & HTML badge.
 * 5. Doctor Credentials & Egyptian Syndicate License in Patient Email.
 * 6. PHI Privacy & Doctolib Confidentiality Notices.
 * 7. Server Endpoints in backend/server.js & Doctor Registry Email Integrity.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

console.log("==================================================================");
console.log("📧 HEALTH VIBE AI: DOCTOLIB EMAIL NOTIFICATION MVP TEST SUITE");
console.log("   Doctor New Case Alert & Patient Report Approval (Req #62)");
console.log("==================================================================\n");

// Load notification service
const notifModulePath = path.resolve(__dirname, '../backend/notification-service.js');
assert.ok(fs.existsSync(notifModulePath), "notification-service.js must exist");
const notifService = require(notifModulePath);

// Clear mock emails log
if (typeof notifService.clearSentEmailsLog === 'function') {
  notifService.clearSentEmailsLog();
}

// -----------------------------------------------------------------------------
// TEST 1: Doctor Notification Template (buildNewCaseForDoctorEmail)
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Doctor Notification Template for New Case (buildNewCaseForDoctorEmail)");

// 1.1 Routine case
const routineDocEmail = notifService.buildNewCaseForDoctorEmail({
  doctorName: "د. طارق محمود",
  doctorSpecialty: "أمراض الصدر والحساسية",
  caseId: "case-pulmo-78901",
  caseRef: "HV-CASE-78901",
  patientName: "أحمد علي",
  patientAge: 45,
  patientGender: "ذكر",
  priority: "routine",
  triageLevel: "اعتيادي",
  chiefComplaint: "سعال جاف مستمر منذ 4 أيام",
  vitals: { spo2: 97, pulse: 76, respiratoryRate: 16 },
  aiPrediction: "التهاب شعبي حاد وتهيج بالقصبات",
  aiConfidence: "95.2%",
  appUrl: "https://healthvibes.app"
});

assert.ok(routineDocEmail.subject.includes("حالة سريرية جديدة"), "Subject must announce new clinical case");
assert.ok(routineDocEmail.subject.includes("HV-CASE-78901"), "Subject must contain case reference");
assert.ok(routineDocEmail.html.includes("د. طارق محمود"), "HTML must contain doctor salutation");
assert.ok(routineDocEmail.html.includes("أحمد علي"), "HTML must contain patient name");
assert.ok(routineDocEmail.html.includes("97%"), "HTML must contain SpO2 vital reading");
assert.ok(routineDocEmail.html.includes("screen=doctor"), "HTML must contain link to doctor review cockpit");
assert.ok(routineDocEmail.html.includes("Doctolib Standard") || routineDocEmail.html.includes("إشعار سرية وخصوصية طبية"), "HTML must contain Doctolib confidentiality notice");

// 1.2 Urgent case
const urgentDocEmail = notifService.buildNewCaseForDoctorEmail({
  doctorName: "د. منى سامي",
  caseId: "case-urgent-11223",
  caseRef: "HV-CASE-11223",
  patientName: "سارة كمال",
  priority: "urgent",
  triageLevel: "عالي الخطورة",
  chiefComplaint: "ضيق تنفس حاد وتزرق بالأطراف",
  vitals: { spo2: 89, pulse: 118, respiratoryRate: 28 },
  aiPrediction: "نوبة ربو حادة مع نقص أكسجين"
});

assert.ok(urgentDocEmail.subject.includes("عاجل"), "Urgent case subject must include [عاجل]");
assert.ok(urgentDocEmail.html.includes("Tier 1"), "Urgent case HTML must include Tier 1 / Priority badge");

console.log("  ✓ Doctor notification template correctly formats routine & urgent cases with vitals and deep-links.");

// -----------------------------------------------------------------------------
// TEST 2: Patient Notification Template (buildResultReadyEmail / Report Approved)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Patient Notification Template on Report Approval (buildResultReadyEmail)");

const patientApprovalEmail = notifService.buildResultReadyEmail({
  patientName: "محمد عبد الرؤوف",
  caseId: "case-998877",
  reportRef: "HV-REP-998877",
  doctorName: "د. أحمد خليل",
  doctorSpecialty: "أمراض الصدر والحساسية المناعية",
  doctorLicense: "DOC-PULMO-38910",
  clinicName: "مركز الحياة الطبي العام (معتمد)",
  clinicalDiagnosis: "حساسية صدرية ونوبة ربو شعبي حادة",
  medications: "Salbutamol Inhaler 100mcg (2 puffs PRN), Budesonide 200mcg BID",
  recommendations: [
    "الراحة التامة وتجنب التعرض للأتربة والدخان",
    "إعادة قياس نسبة الأكسجين صباحاً ومساءً",
    "استشارة متابعة بعد 3 أيام"
  ],
  appUrl: "https://healthvibes.app"
});

assert.ok(patientApprovalEmail.subject.includes("تم اعتماد تقريرك الطبي السريري"), "Subject must announce certified report approval");
assert.ok(patientApprovalEmail.subject.includes("HV-REP-998877"), "Subject must contain report reference");
assert.ok(patientApprovalEmail.html.includes("محمد عبد الرؤوف"), "HTML must greet patient");
assert.ok(patientApprovalEmail.html.includes("د. أحمد خليل"), "HTML must state certified attending physician");
assert.ok(patientApprovalEmail.html.includes("DOC-PULMO-38910"), "HTML must state doctor Egyptian Syndicate license");
assert.ok(patientApprovalEmail.html.includes("مركز الحياة الطبي"), "HTML must state clinic name");
assert.ok(patientApprovalEmail.html.includes("حساسية صدرية ونوبة ربو"), "HTML must state clinical diagnosis");
assert.ok(patientApprovalEmail.html.includes("Salbutamol Inhaler"), "HTML must state prescribed medications (Rx)");
assert.ok(patientApprovalEmail.html.includes("screen=report"), "HTML must contain link to view patient report");
assert.ok(patientApprovalEmail.html.includes("اعتماد سريري موثق") || patientApprovalEmail.html.includes("Doctolib Standard"), "HTML must include Doctolib digital verification seal");

console.log("  ✓ Patient certified report approval email verified with doctor credentials, Rx, and verification seal.");

// -----------------------------------------------------------------------------
// TEST 3: Template Dispatcher Routing (buildNotificationEmailTemplate)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Template Dispatcher Routing (buildNotificationEmailTemplate)");

// 3.1 Routing for NEW_CASE_FOR_REVIEW
const routedDocCase = notifService.buildNotificationEmailTemplate(notifService.NOTIFICATION_TYPES.NEW_CASE_FOR_REVIEW, {
  doctorName: "د. طارق محمود",
  caseId: "case-route-01",
  caseRef: "HV-CASE-R01",
  chiefComplaint: "سعال وألم بالصدر"
});
assert.ok(routedDocCase.subject.includes("HV-CASE-R01"), "NEW_CASE_FOR_REVIEW must route to buildNewCaseForDoctorEmail");

// 3.2 Routing for REPORT_APPROVED
const routedReportApproved = notifService.buildNotificationEmailTemplate(notifService.NOTIFICATION_TYPES.REPORT_APPROVED, {
  patientName: "محمود",
  caseId: "case-route-02",
  reportRef: "HV-REP-R02",
  doctorName: "د. منى سامي"
});
assert.ok(routedReportApproved.subject.includes("HV-REP-R02"), "REPORT_APPROVED must route to buildResultReadyEmail");

console.log("  ✓ buildNotificationEmailTemplate routing confirmed for all Doctolib notification types.");

// -----------------------------------------------------------------------------
// TEST 4: Dispatch Function notifyDoctorNewCase (Simulated / Local Mode)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Dispatch Function notifyDoctorNewCase");

async function runDispatchTests() {
  const docResult = await notifService.notifyDoctorNewCase({
    doctorEmail: "dr.tarek@healthvibe.ai",
    doctorName: "د. طارق محمود",
    caseId: "case-dispatch-doc-01",
    caseRef: "HV-CASE-D01",
    patientName: "عمر فاروق",
    patientAge: 32,
    patientGender: "ذكر",
    priority: "routine",
    chiefComplaint: "أعراض حساسية موسمية",
    vitals: { spo2: 98, pulse: 72 }
  });

  assert.equal(docResult.success, true, "notifyDoctorNewCase must succeed");
  assert.equal(docResult.recipient, "dr.tarek@healthvibe.ai", "Recipient must match doctor email");
  assert.equal(docResult.providerAccepted, true, "Provider acceptance must be true");

  const sentLogs = notifService.getSentEmailsLog();
  const lastDocLog = sentLogs.find(l => l.to === "dr.tarek@healthvibe.ai");
  assert.ok(lastDocLog, "Email log must record sent doctor email");
  assert.ok(lastDocLog.subject.includes("HV-CASE-D01"), "Log record must have correct subject");

  console.log("  ✓ Doctor notification dispatched and provider acceptance verified.");

  // -----------------------------------------------------------------------------
  // TEST 5: Dispatch Function notifyPatientReportApproved
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 5: Dispatch Function notifyPatientReportApproved");

  const patientResult = await notifService.notifyPatientReportApproved({
    patientEmail: "patient.amr@gmail.com",
    patientName: "عمرو حسن",
    caseId: "case-dispatch-pat-01",
    reportRef: "HV-REP-D01",
    doctorName: "د. منى سامي",
    doctorSpecialty: "أمراض الصدر والعناية المركزة",
    doctorLicense: "DOC-PULMO-20491",
    clinicName: "مركز رعاية الجهاز التنفسي التخصصي (معتمد)",
    clinicalDiagnosis: "التهاب شعبي حاد وتهيج بالقصبات",
    medications: "Paracetamol 1000mg TID, Cough Syrup",
    recommendations: ["المتابعة بعد 5 أيام"]
  });

  assert.equal(patientResult.success, true, "notifyPatientReportApproved must succeed");
  assert.equal(patientResult.recipient, "patient.amr@gmail.com", "Recipient must match patient email");
  assert.equal(patientResult.providerAccepted, true, "Provider acceptance must be true");

  const lastPatientLog = notifService.getSentEmailsLog().find(l => l.to === "patient.amr@gmail.com");
  assert.ok(lastPatientLog, "Email log must record sent patient email");
  assert.ok(lastPatientLog.subject.includes("HV-REP-D01"), "Log record must have correct report reference");

  console.log("  ✓ Patient report approval notification dispatched and provider acceptance verified.");

  // -----------------------------------------------------------------------------
  // TEST 6: Backend Server.js Endpoints Contract Verification
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 6: Backend Server.js Endpoints Contract Verification");

  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../backend/server.js'), 'utf8');
  assert.ok(serverJsContent.includes("/api/notifications/notify-doctor-new-case"), "server.js must expose /api/notifications/notify-doctor-new-case");
  assert.ok(serverJsContent.includes("/api/notifications/notify-patient-report-approved"), "server.js must expose /api/notifications/notify-patient-report-approved");
  assert.ok(serverJsContent.includes("notifyDoctorNewCase"), "server.js must import notifyDoctorNewCase");
  assert.ok(serverJsContent.includes("notifyPatientReportApproved"), "server.js must import notifyPatientReportApproved");
  assert.ok(serverJsContent.includes("doctorLicense: updateData.doctorLicense"), "server.js must include doctorLicense in transition notification");

  console.log("  ✓ server.js endpoints and transitions verified.");

  // -----------------------------------------------------------------------------
  // TEST 7: Doctor Registry Email Integrity
  // -----------------------------------------------------------------------------
  console.log("\n▶ TEST 7: Doctor Registry Email Integrity in doctor-assignment-service.js");

  const { DoctorAssignmentService } = require(path.resolve(__dirname, '../backend/doctor-assignment-service.js'));
  const assignmentService = new DoctorAssignmentService();
  const verifiedDoctors = await assignmentService.getAvailableVerifiedPulmonologists();

  assert.ok(verifiedDoctors.length >= 3, "At least 3 verified pulmonologists must exist");
  for (const doc of verifiedDoctors) {
    assert.ok(doc.email && doc.email.includes("@"), `Doctor ${doc.fullName} must have a valid email address (got: ${doc.email})`);
    assert.ok(doc.syndicateId && doc.syndicateId.startsWith("DOC-PULMO-"), `Doctor ${doc.fullName} must have Egyptian Syndicate license`);
  }

  console.log(`  ✓ All ${verifiedDoctors.length} verified pulmonologists have valid email addresses and syndicate licenses.`);

  console.log("\n==================================================================");
  console.log("🎉 ALL 7/7 DOCTOLIB EMAIL NOTIFICATION TESTS PASSED (100%)!");
  console.log("   Doctor new case alert & patient report certification fully operational.");
  console.log("==================================================================");
}

runDispatchTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
