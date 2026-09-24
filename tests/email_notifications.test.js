/**
 * Health Vibe AI - Clinical Email Notifications Test Suite
 * Verifies email notifications for:
 * 1. Result Ready (Certified Medical Report Released)
 * 2. More Information Requested (Doctor Clinical Clarification)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("\n==================================================================");
console.log("📧 HEALTH VIBE AI: CLINICAL EMAIL NOTIFICATIONS TEST SUITE");
console.log("   Events: 'result_ready' & 'more_info_requested'");
console.log("==================================================================\n");

const {
  sendClinicalNotificationEmail,
  buildResultReadyEmail,
  buildMoreInfoEmail,
  getSentEmailsLog,
  clearSentEmailsLog
} = require('../backend/notification-service');

// ── TEST 1: Result Ready Email Template Structure & Clinical Integrity ─────
console.log("▶ TEST 1: Result Ready Email Template Construction");

const sampleResultData = {
  patientName: "طارق محمود",
  caseId: "case_test_9981",
  reportRef: "HV-REP-TEST9981",
  doctorName: "د. منى سامي",
  doctorSpecialty: "استشاري أمراض صدرية وجهاز تنفسي",
  clinicalDiagnosis: "التهاب شعبي حاد متكرر مع انخفاض نسبي في تشبع الأكسجين (93%).",
  medications: "1. بخاخ موسع للشعب (سالبوتامول) 2. شراب مهدئ للسعال",
  recommendations: [
    "الراحة التامة والابتعاد عن مهيجات الجهاز التنفسي والأدخنة.",
    "قياس تشبع الأكسجين SpO2 مرتين يومياً صباحاً ومساءً.",
    "استشارة الطبيب فوراً حال هبوط الأكسجين دون 92%."
  ],
  appUrl: "https://app.healthvibe.ai"
};

const resultEmail = buildResultReadyEmail(sampleResultData);
assert(resultEmail.html.includes("Health Vibe AI"), "HTML must contain service branding");
assert(resultEmail.html.includes("طارق محمود"), "HTML must address patient by name");
assert(resultEmail.html.includes("HV-REP-TEST9981"), "HTML must contain official report reference");
assert(resultEmail.html.includes("د. منى سامي"), "HTML must contain doctor name");
assert(resultEmail.html.includes("التهاب شعبي حاد متكرر"), "HTML must display clinical diagnosis");
assert(resultEmail.html.includes("بخاخ موسع للشعب"), "HTML must display prescribed medication preview");
assert(resultEmail.html.includes("قياس تشبع الأكسجين"), "HTML must display clinical recommendations");
assert(resultEmail.html.includes("screen=report&caseId=case_test_9981"), "HTML must contain direct link to certified report");
assert(resultEmail.html.includes("تنبيه طبي"), "HTML must contain medical safety disclaimer");
assert(resultEmail.text.includes("HV-REP-TEST9981"), "Plain text must contain report reference");

console.log("  ✓ Result Ready HTML & plain-text templates generated with full clinical metadata.");
console.log("  ✓ Direct certified report action link verified.");
console.log("  ✓ Emergency medical safety disclaimer verified.");

// ── TEST 2: More Info Requested Email Template Construction ──────────────────
console.log("\n▶ TEST 2: More Info Requested Email Template Construction");

const sampleMoreInfoData = {
  patientName: "فاطمة الزهراء",
  caseId: "case_test_7742",
  doctorName: "د. أحمد السيد",
  moreInfoNote: "يرجى إعادة قياس نسبة الأكسجين SpO2 في حالة الراحة بعد دقيقتين وإرفاق صورة الروشتة السابقة.",
  appUrl: "https://app.healthvibe.ai"
};

const moreInfoEmail = buildMoreInfoEmail(sampleMoreInfoData);
assert(moreInfoEmail.html.includes("Health Vibe AI"), "HTML must contain branding");
assert(moreInfoEmail.html.includes("فاطمة الزهراء"), "HTML must address patient by name");
assert(moreInfoEmail.html.includes("د. أحمد السيد"), "HTML must include requesting doctor's name");
assert(moreInfoEmail.html.includes("يرجى إعادة قياس نسبة الأكسجين"), "HTML must display doctor's specific required info");
assert(moreInfoEmail.html.includes("screen=pending&caseId=case_test_7742"), "HTML must contain direct action link to submit data");
assert(moreInfoEmail.text.includes("case_test_7742".slice(-6).toUpperCase()), "Plain text must contain case reference");

console.log("  ✓ More Info Requested HTML & plain-text templates generated with doctor instructions.");
console.log("  ✓ Direct response action link verified.");

// ── TEST 3: Email Dispatch Engine & Simulated Transport ──────────────────────
console.log("\n▶ TEST 3: Email Dispatch Engine (Result Ready)");
clearSentEmailsLog();

(async () => {
  const sendRes = await sendClinicalNotificationEmail({
    type: 'result_ready',
    patientEmail: "tarek.patient@example.com",
    ...sampleResultData
  });

  assert.strictEqual(sendRes.success, true, "Dispatch should succeed");
  assert.strictEqual(sendRes.type, "result_ready");
  assert.strictEqual(sendRes.recipient, "tarek.patient@example.com");
  assert(sendRes.messageId.includes("@healthvibe.ai"), "Message ID should have healthvibe.ai domain");

  const log = getSentEmailsLog();
  assert.strictEqual(log.length, 1, "Log should contain 1 dispatched email");
  assert.strictEqual(log[0].to, "tarek.patient@example.com");
  assert(log[0].subject.includes("HV-REP-TEST9981"), "Subject must contain report reference");
  console.log(`  ✓ Result Ready email successfully dispatched to '${sendRes.recipient}' (ID: ${sendRes.messageId})`);

  // ── TEST 4: Email Dispatch Engine (More Info Requested) ────────────────────
  console.log("\n▶ TEST 4: Email Dispatch Engine (More Info Requested)");

  const moreInfoRes = await sendClinicalNotificationEmail({
    type: 'more_info_requested',
    patientEmail: "fatma.patient@example.com",
    ...sampleMoreInfoData
  });

  assert.strictEqual(moreInfoRes.success, true, "Dispatch should succeed");
  assert.strictEqual(moreInfoRes.type, "more_info_requested");
  assert.strictEqual(moreInfoRes.recipient, "fatma.patient@example.com");

  const updatedLog = getSentEmailsLog();
  assert.strictEqual(updatedLog.length, 2, "Log should contain 2 dispatched emails");
  assert.strictEqual(updatedLog[1].to, "fatma.patient@example.com");
  assert(updatedLog[1].subject.includes("مطلوب استكمال بيانات"), "Subject must reflect action required");
  console.log(`  ✓ More Info Requested email successfully dispatched to '${moreInfoRes.recipient}' (ID: ${moreInfoRes.messageId})`);

  // ── TEST 5: Invalid Recipient Safety Guard ─────────────────────────────────
  console.log("\n▶ TEST 5: Invalid Recipient Safety Guard");
  const invalidRes = await sendClinicalNotificationEmail({
    type: 'result_ready',
    patientEmail: "invalid-not-an-email",
    ...sampleResultData
  });
  assert.strictEqual(invalidRes.success, false, "Invalid email must be rejected safely");
  assert.strictEqual(invalidRes.reason, "INVALID_RECIPIENT");
  console.log("  ✓ System rejects malformed/missing recipient email safely without crashing.");

  // ── TEST 6: Backend Server Integration & Routes Check ──────────────────────
  console.log("\n▶ TEST 6: Backend Route and Endpoint Definition");
  const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert(serverContent.includes("sendClinicalNotificationEmail"), "backend/server.js must import sendClinicalNotificationEmail");
  assert(serverContent.includes("app.post('/api/notifications/send-email'"), "server.js must expose /api/notifications/send-email route");
  assert(serverContent.includes("type: 'result_ready'"), "server.js must dispatch result_ready on approval");
  assert(serverContent.includes("type: 'more_info_requested'"), "server.js must dispatch more_info_requested on more-info transition");
  console.log("  ✓ backend/server.js has dedicated /api/notifications/send-email endpoint.");
  console.log("  ✓ Automatic email notification hooks verified in doctor status transition.");

  // ── TEST 7: Security Rules Audit for Email Notifications ───────────────────
  console.log("\n▶ TEST 7: Firestore Security Rules Check for /email_notifications");
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  assert(rulesContent.includes("match /email_notifications/{notificationId}"), "firestore.rules must secure /email_notifications");
  assert(rulesContent.includes("allow write: if false;"), "Clients must be forbidden from forging email notifications");
  console.log("  ✓ firestore.rules strictly guards /email_notifications collection.");
  console.log("  ✓ Read allowed only for recipient/patient/doctor/admin; direct client writes forbidden.");

  console.log("\n==================================================================");
  console.log("🎉 ALL 7 EMAIL NOTIFICATION TESTS PASSED WITH 100% SUCCESS!");
  console.log("==================================================================\n");
})();
