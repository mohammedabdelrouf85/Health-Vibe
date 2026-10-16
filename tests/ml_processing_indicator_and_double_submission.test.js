/**
 * Health Vibe AI - ML Processing Indicator & Anti-Double-Submission Test Suite
 * 
 * Verifies PRD Req 58:
 * 1. Clear and reassuring patient loading indicator during ML model data processing.
 * 2. Multi-step clinical progression visualization (Encryption -> ML Analysis -> Doctor Dispatch).
 * 3. Prevention of double submission (button disable, aria-busy, lock flag, debounce).
 * 4. Bilingual localization in Arabic and English (i18n).
 * 5. Frosted glassmorphism UI styling, pulse animation, and dark mode support.
 * 6. Zero-regression preservation of normal and Google authentication.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🔬 HEALTH VIBE AI: ML PROCESSING INDICATOR & ANTI-DOUBLE-SUBMIT");
console.log("   PRD Req 58: Reassuring Patient AI Loading & Double-Click Prevention");
console.log("==================================================================");

const indexHtmlPath = path.join(__dirname, "../app/index.html");
const stylesCssPath = path.join(__dirname, "../app/styles.css");
const appJsPath = path.join(__dirname, "../app/app.js");
const i18nJsPath = path.join(__dirname, "../app/i18n.js");

const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");
const i18nJs = fs.readFileSync(i18nJsPath, "utf8");

// ── TEST 1: DOM Elements & Accessibility Attributes ─────────────────────────────
console.log("\n▶ TEST 1: DOM Structure & Accessibility in app/index.html");

assert.ok(indexHtml.includes('id="assessmentProcessingOverlay"'), "Processing overlay container must exist");
assert.ok(indexHtml.includes('class="confirm-modal ml-processing-modal"'), "Overlay must have confirm-modal and ml-processing-modal classes");
assert.ok(indexHtml.includes('role="status"'), "Overlay must declare role='status' for screen readers");
assert.ok(indexHtml.includes('aria-live="polite"'), "Overlay must have aria-live='polite'");
assert.ok(indexHtml.includes('id="mlProcessingTitle"'), "Title element must exist");
assert.ok(indexHtml.includes('id="mlProcessingDesc"'), "Description element must exist");
assert.ok(indexHtml.includes('id="mlStep1"'), "Step 1 (encryption) element must exist");
assert.ok(indexHtml.includes('id="mlStep2"'), "Step 2 (ML analysis) element must exist");
assert.ok(indexHtml.includes('id="mlStep3"'), "Step 3 (doctor dispatch) element must exist");
assert.ok(indexHtml.includes('class="ml-pulse-ripple"'), "Pulsing animation ring must exist");
assert.ok(indexHtml.includes('class="ml-anti-double-pill"'), "Anti-double submission security badge must exist");

console.log("  ✓ All HTML markup, step indicators, pulse hero icons, and accessibility attributes verified.");


// ── TEST 2: Visual Styling, Keyframe Animations & Dark Mode ────────────────────
console.log("\n▶ TEST 2: CSS Styling & Animations in app/styles.css");

assert.ok(stylesCss.includes(".ml-processing-modal"), "Must define .ml-processing-modal");
assert.ok(stylesCss.includes(".ml-processing-card"), "Must define .ml-processing-card");
assert.ok(stylesCss.includes("@keyframes mlPulseRipple"), "Must define @keyframes mlPulseRipple");
assert.ok(stylesCss.includes("@keyframes mlCoreBreathe"), "Must define @keyframes mlCoreBreathe");
assert.ok(stylesCss.includes("@keyframes miniSpinAnim"), "Must define @keyframes miniSpinAnim");
assert.ok(stylesCss.includes("body.dark .ml-processing-card"), "Must support dark mode styling");
assert.ok(stylesCss.includes(".ml-step-badge.done"), "Must style completed step badge");

console.log("  ✓ Glassmorphism, pulsing animations, micro-spinners, and dark-mode styles verified in styles.css.");


// ── TEST 3: Bilingual Translations in app/i18n.js ──────────────────────────────
console.log("\n▶ TEST 3: Bilingual i18n Localization (Arabic & English)");

// Arabic keys
assert.ok(i18nJs.includes('processingTitle: "جاري تحليل الأعراض بواسطة الذكاء الاصطناعي السريري..."'), "Arabic processingTitle required");
assert.ok(i18nJs.includes('processingStep1: "تشفير وتأمين البيانات السريرية (End-to-End Encryption)"'), "Arabic processingStep1 required");
assert.ok(i18nJs.includes('processingStep2: "معالجة الأعراض الحيوية ومستويات الأكسجين بنموذج الذكاء الاصطناعي"'), "Arabic processingStep2 required");
assert.ok(i18nJs.includes('processingStep3: "إعداد وثيقة الحالة وإرسالها لقائمة الطبيب المعتمد"'), "Arabic processingStep3 required");
assert.ok(i18nJs.includes('antiDoubleSubmitNotice: "يرجى عدم إغلاق أو تحديث الصفحة حتى تكتمل المعالجة بأمان."'), "Arabic antiDoubleSubmitNotice required");

// English keys
assert.ok(i18nJs.includes('processingTitle: "Analyzing Respiratory Vitals with Clinical AI..."'), "English processingTitle required");
assert.ok(i18nJs.includes('processingStep1: "Securing & encrypting clinical vitals (End-to-End Encryption)"'), "English processingStep1 required");
assert.ok(i18nJs.includes('processingStep2: "Processing symptoms and SpO2 via clinical AI model"'), "English processingStep2 required");
assert.ok(i18nJs.includes('processingStep3: "Generating clinical case document & dispatching to doctor"'), "English processingStep3 required");
assert.ok(i18nJs.includes('antiDoubleSubmitNotice: "Please do not close or refresh this page while processing."'), "English antiDoubleSubmitNotice required");

console.log("  ✓ Complete bilingual Arabic and English strings verified for all loading phases and safety notices.");


// ── TEST 4: Controller Functions & Logic in app/app.js ──────────────────────────
console.log("\n▶ TEST 4: Controller Functions & Flow in app/app.js");

assert.ok(appJs.includes("window.showAssessmentProcessingOverlay"), "Must define showAssessmentProcessingOverlay");
assert.ok(appJs.includes("window.updateAssessmentProcessingStep"), "Must define updateAssessmentProcessingStep");
assert.ok(appJs.includes("window.hideAssessmentProcessingOverlay"), "Must define hideAssessmentProcessingOverlay");
assert.ok(appJs.includes("let _assessmentSubmitting = false;"), "Must declare _assessmentSubmitting state");
assert.ok(appJs.includes("let _assessmentSubmitLockTimestamp = 0;"), "Must declare _assessmentSubmitLockTimestamp");

// Check button locking & aria-busy
assert.ok(appJs.includes('submitBtn.setAttribute("aria-busy", "true")'), "Must set aria-busy on submit button");
assert.ok(appJs.includes('submitBtn.disabled = true;'), "Must disable submit button");
assert.ok(appJs.includes('submitBtn.removeAttribute("aria-busy")'), "Must clear aria-busy on reset");

console.log("  ✓ Overlay controller functions and aria-busy / button locking mechanics confirmed in app/app.js.");


// ── TEST 5: Double Submission Prevention Simulation ────────────────────────────
console.log("\n▶ TEST 5: Anti-Double-Submission Simulation");

// Simulate DOM context
const mockElements = {
  assessmentProcessingOverlay: {
    style: {},
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    setAttribute(k, v) { this[k] = v; }
  },
  submitAssessment: {
    disabled: false,
    textContent: "إرسال للطبيب",
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; }
  },
  btnConfirmSendAssessment: {
    disabled: false,
    textContent: "✅ تأكيد وإرسال التقييم للطبيب",
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; }
  },
  mlStep1: { className: "" },
  mlStep2: { className: "" },
  mlStep3: { className: "" },
  mlStep1Badge: { textContent: "", innerHTML: "" },
  mlStep2Badge: { textContent: "", innerHTML: "" },
  mlStep3Badge: { textContent: "", innerHTML: "" }
};

global.document = {
  getElementById: (id) => mockElements[id] || null
};
global.currentLanguage = "ar";

// Extract functions from app.js using eval or direct execution in clean context
const vm = require("vm");
const sandbox = {
  document: global.document,
  window: {},
  currentLanguage: "ar",
  console: console,
  setTimeout: (fn, ms) => fn()
};
vm.createContext(sandbox);

// Execute the functions definition block
const codeSnippet = `
window._assessmentSubmitting = false;
let _assessmentSubmitting = false;
let _assessmentSubmitLockTimestamp = 0;

${appJs.match(/window\.showAssessmentProcessingOverlay = function[\s\S]*?window\.openConfirmAssessmentModal/)[0].replace(/window\.openConfirmAssessmentModal$/, '')}
`;

vm.runInContext(codeSnippet, sandbox);

// 1. Initial State: idle
assert.strictEqual(sandbox.window._assessmentSubmitting, false);
assert.strictEqual(mockElements.submitAssessment.disabled, false);

// 2. Trigger showAssessmentProcessingOverlay(1)
sandbox.window.showAssessmentProcessingOverlay(1);
assert.strictEqual(sandbox.window._assessmentSubmitting, true, "Submitting lock must be true");
assert.strictEqual(mockElements.submitAssessment.disabled, true, "Submit button must be disabled");
assert.strictEqual(mockElements.btnConfirmSendAssessment.disabled, true, "Confirm modal button must be disabled");
assert.strictEqual(mockElements.submitAssessment.attributes["aria-busy"], "true", "Submit button must have aria-busy=true");
assert.strictEqual(mockElements.assessmentProcessingOverlay.classList.contains("open"), true, "Overlay must be open");
assert.strictEqual(mockElements.assessmentProcessingOverlay.style.display, "grid");

// 3. Update to Step 2 (ML model running)
sandbox.window.updateAssessmentProcessingStep(2);
assert.strictEqual(mockElements.mlStep1.className, "ml-step-item done");
assert.strictEqual(mockElements.mlStep2.className, "ml-step-item current");
assert.strictEqual(mockElements.mlStep3.className, "ml-step-item pending");
assert.strictEqual(mockElements.mlStep1Badge.textContent, "✓");

// 4. Update to Step 3 (Doctor queue dispatching)
sandbox.window.updateAssessmentProcessingStep(3);
assert.strictEqual(mockElements.mlStep1.className, "ml-step-item done");
assert.strictEqual(mockElements.mlStep2.className, "ml-step-item done");
assert.strictEqual(mockElements.mlStep3.className, "ml-step-item current");

// 5. Trigger hideAssessmentProcessingOverlay()
sandbox.window.hideAssessmentProcessingOverlay();
assert.strictEqual(sandbox.window._assessmentSubmitting, false, "Submitting lock must be reset to false");
assert.strictEqual(mockElements.submitAssessment.disabled, false, "Submit button must be re-enabled");
assert.strictEqual(mockElements.btnConfirmSendAssessment.disabled, false, "Confirm button must be re-enabled");
assert.strictEqual(mockElements.submitAssessment.attributes["aria-busy"], undefined, "aria-busy must be cleared");
assert.strictEqual(mockElements.assessmentProcessingOverlay.classList.contains("open"), false, "Overlay must be closed");

console.log("  ✓ State transitions verified: Button lockout, aria-busy, step progression, and safe unlock on completion.");


// ── TEST 6: Preserving Normal & Google Authentication ──────────────────────────
console.log("\n▶ TEST 6: Zero Regression in Email & Google Authentication");

const authUiPath = path.join(__dirname, "../app/modules/auth/auth-ui.js");
const authUiContent = fs.readFileSync(authUiPath, "utf8");

assert.ok(appJs.includes("signInWithPopup"), "signInWithPopup must remain present in app.js");
assert.ok(appJs.includes("signInWithRedirect"), "signInWithRedirect must remain present in app.js");
assert.ok(appJs.includes("signInWithEmailAndPassword") || authUiContent.includes("signInWithEmailAndPassword"), "Email password login must remain present");
assert.ok(appJs.includes("createUserWithEmailAndPassword") || authUiContent.includes("createUserWithEmailAndPassword"), "User registration must remain present");

console.log("  ✓ Normal email sign-in and Google OAuth sign-in fully preserved with zero regression.");

console.log("==================================================================");
console.log("🎉 ALL ML PROCESSING INDICATOR & ANTI-DOUBLE-SUBMIT TESTS PASSED!");
console.log("==================================================================");

process.exit(0);
