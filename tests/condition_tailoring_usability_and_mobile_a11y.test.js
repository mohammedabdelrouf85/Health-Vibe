/**
 * Health Vibe AI - Condition-Tailored Dashboard Usability & Mobile A11y QA Suite
 * (مرجع: Propeller Health - تخصيص لوحة المريض حسب حالته الصحية المسجلة)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ConditionTailoringService = require("../app/modules/patient/condition-tailoring-service.js");
const ConditionTailoringUI = require("../app/modules/patient/condition-tailoring-ui.js");
const i18n = require("../app/i18n.js");

console.log("=== Running Condition-Tailored Dashboard Usability & Mobile A11y QA Suite ===");

// ---------------------------------------------------------------------------
// Test 1: Condition Detection & SpO2 Elevation Logic (Propeller Health)
// ---------------------------------------------------------------------------
(function testConditionDetectionAndElevation() {
  console.log("Test 1: Condition Detection & Elevation Logic...");

  // Asthma/respiratory keywords
  const respProfile = { chronicConditions: ["Asthma", "Allergy"], diseases: [] };
  const detectedResp = ConditionTailoringService.detectPrimaryCondition(respProfile);
  assert.strictEqual(detectedResp, "respiratory", "Should detect respiratory for asthma patient");

  // Arabic keyword detection
  const arRespProfile = { chronicConditions: ["حساسية الصدر والربو"] };
  const detectedArResp = ConditionTailoringService.detectPrimaryCondition(arRespProfile);
  assert.strictEqual(detectedArResp, "respiratory", "Should detect respiratory from Arabic chronic disease");

  // Dashboard structure for respiratory
  const dashboard = ConditionTailoringService.resolveTailoredDashboard(respProfile, { spo2: 97, respiratoryRate: 15 });
  assert.strictEqual(dashboard.isRespiratoryElevated, true, "Respiratory dashboard must elevate respiratory indicators");
  assert.strictEqual(dashboard.telemetry[0].key, "spo2", "First telemetry item must be SpO2");
  assert.strictEqual(dashboard.telemetry[0].status, "normal", "97% SpO2 should be normal");

  // Critical threshold check
  const criticalDash = ConditionTailoringService.resolveTailoredDashboard(respProfile, { spo2: 90 });
  assert.strictEqual(criticalDash.telemetry[0].status, "critical", "<92% SpO2 should be critical");

  console.log("  ✓ Test 1 Passed: Respiratory condition and SpO2 elevation logic verified.");
})();

// ---------------------------------------------------------------------------
// Test 2: Condition Switcher & Schema Diversity
// ---------------------------------------------------------------------------
(function testSchemaDiversity() {
  console.log("Test 2: Schema Diversity (Hypertension, Diabetes, General)...");

  const hyperProfile = { primaryCondition: "hypertension" };
  const hyperDash = ConditionTailoringService.resolveTailoredDashboard(hyperProfile, { systolic: 150, diastolic: 92 });
  assert.strictEqual(hyperDash.conditionId, "hypertension");
  assert.strictEqual(hyperDash.telemetry[0].key, "systolic");
  assert.strictEqual(hyperDash.telemetry[0].status, "warning");

  const diabProfile = { primaryCondition: "diabetes" };
  const diabDash = ConditionTailoringService.resolveTailoredDashboard(diabProfile, { fastingGlucose: 195 });
  assert.strictEqual(diabDash.conditionId, "diabetes");
  assert.strictEqual(diabDash.telemetry[0].key, "fastingGlucose");
  assert.strictEqual(diabDash.telemetry[0].status, "warning");

  console.log("  ✓ Test 2 Passed: Schemas and clinical risk thresholds correctly mapped.");
})();

// ---------------------------------------------------------------------------
// Test 3: Accessibility Markup & ARIA Standards (WCAG 2.1 AA)
// ---------------------------------------------------------------------------
(function testAccessibilityMarkup() {
  console.log("Test 3: Accessibility Markup & ARIA Standards...");

  ConditionTailoringUI.service = ConditionTailoringService;
  ConditionTailoringUI.currentCondition = "respiratory";
  const html = ConditionTailoringUI.generateMarkup();

  // Region role and aria-label
  assert.ok(html.includes('role="region"'), "Hero container must have role='region'");
  assert.ok(html.includes('aria-label='), "Hero container must have aria-label");

  // Radio/pill group with aria-pressed
  assert.ok(html.includes('role="radiogroup"'), "Condition selector must have role='radiogroup'");
  assert.ok(html.includes('aria-pressed="true"'), "Active condition pill must have aria-pressed='true'");

  // Live status region for assistive technology
  assert.ok(html.includes('role="status"'), "Footer must have role='status' live region");
  assert.ok(html.includes('aria-live="polite"'), "Live region must have aria-live='polite'");

  // Action button has accessible label and icon aria-hidden
  assert.ok(html.includes('aria-hidden="true"'), "Decorative icons must have aria-hidden='true'");

  console.log("  ✓ Test 3 Passed: ARIA semantics and assistive attributes validated.");
})();

// ---------------------------------------------------------------------------
// Test 4: Touch Target Sizes & Responsive CSS (WCAG 2.5.5)
// ---------------------------------------------------------------------------
(function testTouchTargetsAndCss() {
  console.log("Test 4: Touch Target Sizes & Responsive CSS...");

  const cssPath = path.join(__dirname, "../app/modules/patient/condition-tailoring.css");
  assert.ok(fs.existsSync(cssPath), "condition-tailoring.css must exist");
  const css = fs.readFileSync(cssPath, "utf8");

  // Minimum 44px touch target validation for interactive buttons
  assert.ok(css.includes("min-height: 44px"), "Interactive elements must meet min 44px touch target (WCAG 2.5.5)");

  // Reduced motion media query
  assert.ok(css.includes("prefers-reduced-motion: reduce"), "Must contain prefers-reduced-motion support");

  // Mobile breakpoint
  assert.ok(css.includes("@media (max-width: 640px)"), "Must support compact mobile viewport (<640px)");

  // RTL Direction support
  assert.ok(css.includes('html[dir="rtl"]'), "Must support RTL directional adaptations");

  console.log("  ✓ Test 4 Passed: WCAG 2.5.5 touch targets and responsive CSS verified.");
})();

// ---------------------------------------------------------------------------
// Test 5: i18n Translation Parity (Arabic & English)
// ---------------------------------------------------------------------------
(function testTranslationParity() {
  console.log("Test 5: Translation Parity between AR and EN...");

  assert.ok(i18n.translations.ar.conditionTailoring, "Arabic conditionTailoring dictionary must exist");
  assert.ok(i18n.translations.en.conditionTailoring, "English conditionTailoring dictionary must exist");

  const arKeys = Object.keys(i18n.translations.ar.conditionTailoring).sort();
  const enKeys = Object.keys(i18n.translations.en.conditionTailoring).sort();

  assert.deepStrictEqual(arKeys, enKeys, "AR and EN conditionTailoring translation keys must match 100%");
  assert.ok(arKeys.length >= 15, "Must have comprehensive translations for all condition states");

  console.log("  ✓ Test 5 Passed: 100% translation key parity across languages.");
})();

// ---------------------------------------------------------------------------
// Test 6: Persistence & Storage Synchronization
// ---------------------------------------------------------------------------
(function testPersistenceSync() {
  console.log("Test 6: Persistence & Storage Synchronization...");

  ConditionTailoringService.setSavedCondition("test-patient-001", "hypertension");
  const saved = ConditionTailoringService.getSavedCondition("test-patient-001");
  assert.strictEqual(saved, "hypertension", "Saved condition must be retrieved correctly");

  // Fallback to respiratory default
  const defaultSaved = ConditionTailoringService.getSavedCondition("non-existent-patient-999");
  assert.strictEqual(defaultSaved, "respiratory", "Non-configured patient must default to respiratory");

  console.log("  ✓ Test 6 Passed: Condition preference persistence verified.");
})();

console.log("\n>>> ALL 6 CONDITION-TAILORED DASHBOARD QA TESTS PASSED! <<<\n");
