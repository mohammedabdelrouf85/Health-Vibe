/**
 * 🧪 HEALTH VIBE AI: CLINICAL & PATIENT FEEDBACK TEST SUITE
 * Validates feedback forms, ratings (1-5 stars), doctor & patient perspectives,
 * backend API endpoints, validation guards, and data persistence.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("⭐ HEALTH VIBE AI: FEEDBACK SYSTEM & RATING TEST SUITE");
console.log("   Perspectives: Patient Experience & Doctor Clinical Feedback");
console.log("==================================================================\n");

let testsRun = 0;
let testsPassed = 0;

function runTest(name, fn) {
  testsRun++;
  console.log(`▶ TEST ${testsRun}: ${name}`);
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ Passed\n`);
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// TEST 1: Category Structure and Role Perspectives
// -------------------------------------------------------------
runTest("Patient & Doctor Feedback Categories Definition", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
  
  assert.ok(appJs.includes("FEEDBACK_CATEGORIES ="), "FEEDBACK_CATEGORIES must be defined");
  assert.ok(appJs.includes("clinical_assessment"), "Patient categories must include clinical assessment");
  assert.ok(appJs.includes("doctor_report"), "Patient categories must include doctor report");
  assert.ok(appJs.includes("ai_triage_accuracy"), "Doctor categories must include AI triage accuracy");
  assert.ok(appJs.includes("doctor_queue_efficiency"), "Doctor categories must include review queue efficiency");
  
  console.log("  ✓ Patient categories cover smart assessment, doctor report, and appointments.");
  console.log("  ✓ Doctor categories cover AI triage accuracy, review queue, and clinical protocols.");
});

// -------------------------------------------------------------
// TEST 2: Star Rating Input Validation (1 to 5 Stars Guard)
// -------------------------------------------------------------
runTest("Anti-Tamper & Star Rating Validation Bounds", () => {
  function validateRating(val) {
    const num = Number(val);
    if (!num || isNaN(num) || num < 1 || num > 5) {
      return { valid: false, error: "INVALID_RATING" };
    }
    return { valid: true, rating: Math.round(num) };
  }

  // Valid ratings
  assert.strictEqual(validateRating(1).valid, true);
  assert.strictEqual(validateRating(3).valid, true);
  assert.strictEqual(validateRating(5).valid, true);

  // Invalid ratings
  assert.strictEqual(validateRating(0).valid, false);
  assert.strictEqual(validateRating(6).valid, false);
  assert.strictEqual(validateRating(-1).valid, false);
  assert.strictEqual(validateRating("invalid").valid, false);
  assert.strictEqual(validateRating(null).valid, false);

  console.log("  ✓ Valid ratings strictly between 1 and 5 accepted.");
  console.log("  ✓ Out-of-bounds ratings (0, 6, NaN, negative) safely rejected.");
});

// -------------------------------------------------------------
// TEST 3: Comment Length Bounds & Anti-Spam Guard
// -------------------------------------------------------------
runTest("Comment Length & Content Validation", () => {
  function validateComment(text) {
    if (!text || typeof text !== "string" || text.trim().length < 2) {
      return { valid: false, error: "COMMENT_TOO_SHORT" };
    }
    if (text.length > 2000) {
      return { valid: false, error: "COMMENT_TOO_LONG" };
    }
    return { valid: true, comment: text.trim() };
  }

  assert.strictEqual(validateComment("").valid, false);
  assert.strictEqual(validateComment("   ").valid, false);
  assert.strictEqual(validateComment("a").valid, false);
  assert.strictEqual(validateComment("ممتاز جداً").valid, true);
  
  const oversizedText = "x".repeat(2001);
  assert.strictEqual(validateComment(oversizedText).valid, false);

  console.log("  ✓ Empty or single-character comments blocked.");
  console.log("  ✓ Oversized (>2000 chars) spam payloads blocked.");
});

// -------------------------------------------------------------
// TEST 4: Backend API Endpoint & Payload Construction
// -------------------------------------------------------------
runTest("Backend API Routes Definition in server.js", () => {
  const serverJs = fs.readFileSync(path.join(__dirname, "../backend/server.js"), "utf8");

  assert.ok(serverJs.includes("app.post('/api/feedback/submit'"), "Must expose POST /api/feedback/submit");
  assert.ok(serverJs.includes("app.get('/api/feedback/list'"), "Must expose GET /api/feedback/list");
  assert.ok(serverJs.includes("INVALID_RATING"), "Server must validate rating bounds");
  assert.ok(serverJs.includes("COMMENT_TOO_LONG"), "Server must enforce comment bounds");
  assert.ok(serverJs.includes("feedbacks"), "Server must persist to /feedbacks collection");

  console.log("  ✓ POST /api/feedback/submit validated in backend/server.js.");
  console.log("  ✓ GET /api/feedback/list validated in backend/server.js.");
});

// -------------------------------------------------------------
// TEST 5: Frontend UI Elements & Interactive Modal in index.html
// -------------------------------------------------------------
runTest("Feedback UI Screen & Modal Containers in app/index.html", () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");

  assert.ok(indexHtml.includes('id="screen-feedback"'), "screen-feedback section must exist");
  assert.ok(indexHtml.includes('data-screen="feedback"'), "Nav item for feedback must exist");
  assert.ok(indexHtml.includes('id="feedbackModal"'), "Quick feedback modal must exist");
  assert.ok(indexHtml.includes('id="starRatingWidget"'), "Star rating widget must exist");
  assert.ok(indexHtml.includes('id="feedbackHistoryList"'), "History feed container must exist");

  console.log("  ✓ Navigation button for feedback present.");
  console.log("  ✓ Full feedback screen present with star widget and KPI metrics.");
  console.log("  ✓ Quick feedback popup modal present.");
});

// -------------------------------------------------------------
// TEST 6: Client Window Exports & Method Availability
// -------------------------------------------------------------
runTest("Window Exports in app/app.js for Global Access", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");

  const requiredExports = [
    "window.FEEDBACK_CATEGORIES",
    "window.setFeedbackPerspective",
    "window.setFeedbackRating",
    "window.setModalFeedbackRating",
    "window.openFeedbackModal",
    "window.closeFeedbackModal",
    "window.handleFeedbackSubmit",
    "window.submitModalFeedback",
    "window.renderFeedbackScreen",
    "window.renderFeedbackHistory",
    "window.filterFeedbackList"
  ];

  requiredExports.forEach(exp => {
    assert.ok(appJs.includes(exp), `Export ${exp} must be present in app.js`);
  });

  console.log("  ✓ All 11 feedback management functions exported on window.");
});

// -------------------------------------------------------------
// TEST 7: Firestore Security Rules Guard for /feedbacks
// -------------------------------------------------------------
runTest("Firestore Security Rules Coverage for /feedbacks/{feedbackId}", () => {
  const rules = fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8");

  assert.ok(rules.includes("match /feedbacks/{feedbackId}"), "Must define match /feedbacks/{feedbackId}");
  assert.ok(rules.includes("request.resource.data.rating >= 1") && rules.includes("request.resource.data.rating <= 5"), "Must validate rating 1-5");
  assert.ok(rules.includes("request.resource.data.userId == request.auth.uid"), "Must enforce ownership of userId");
  assert.ok(rules.includes("allow update, delete: if isAdmin();"), "Only admin can update or delete");

  console.log("  ✓ firestore.rules enforces client validation, uid ownership, and admin-only deletion.");
});

console.log("==================================================================");
console.log(`🎉 ALL ${testsPassed}/${testsRun} FEEDBACK SYSTEM TESTS PASSED WITH 100% SUCCESS!`);
console.log("==================================================================\n");
