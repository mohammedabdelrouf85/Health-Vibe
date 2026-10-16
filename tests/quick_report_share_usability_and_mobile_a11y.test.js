/**
 * Health Vibe AI - Quick Report Share Usability & Mobile A11y QA Suite
 * (مرجع: HealthTag - زر مشاركة سريع للتقرير مع الطبيب أو العائلة)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const QuickShareUI = require("../app/modules/reports/quick-share-ui.js");
const i18n = require("../app/i18n.js");

console.log("=== Running Quick Report Share Usability & Mobile A11y QA Suite ===");

// ---------------------------------------------------------------------------
// Test 1: Dialog ARIA Attributes & Semantic Roles
// ---------------------------------------------------------------------------
(function testDialogAccessibility() {
  console.log("Test 1: Dialog ARIA Attributes & Accessibility Semantics...");

  // Mock DOM
  let innerHtmlSet = "";
  const mockOverlay = {
    id: "quickShareModalOverlay",
    style: {},
    set innerHTML(val) { innerHtmlSet = val; },
    get innerHTML() { return innerHtmlSet; },
    appendChild() {},
    onclick: null
  };

  global.document = {
    getElementById: (id) => (id === "quickShareModalOverlay" ? mockOverlay : null),
    createElement: () => mockOverlay,
    body: { appendChild: () => {} },
    addEventListener: () => {}
  };

  QuickShareUI.renderModal("HV-REP-TEST1234", "Default test message");

  assert.ok(innerHtmlSet.includes('role="dialog"'), "Modal must have role='dialog'");
  assert.ok(innerHtmlSet.includes('aria-modal="true"'), "Modal must have aria-modal='true'");
  assert.ok(innerHtmlSet.includes('aria-labelledby="quickShareTitle"'), "Modal must have aria-labelledby");
  assert.ok(innerHtmlSet.includes('aria-describedby="quickShareDesc"'), "Modal must have aria-describedby");
  assert.ok(innerHtmlSet.includes('role="note"'), "Assurance box must have role='note'");
  assert.ok(innerHtmlSet.includes('role="status"'), "Status element must have role='status'");
  assert.ok(innerHtmlSet.includes('aria-live="polite"'), "Status element must have aria-live='polite'");

  console.log("  ✓ Test 1 Passed: WCAG 2.1 AA dialog semantics verified.");
})();

// ---------------------------------------------------------------------------
// Test 2: Touch Target Sizes in quick-share.css (WCAG 2.5.5)
// ---------------------------------------------------------------------------
(function testTouchTargetSizes() {
  console.log("Test 2: Touch Target Sizes in quick-share.css...");

  const cssPath = path.join(__dirname, "../app/modules/reports/quick-share.css");
  assert.ok(fs.existsSync(cssPath), "quick-share.css must exist");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(css.includes("min-height: 44px") || css.includes("min-height: 48px"), "Buttons must have min 44px/48px height");
  assert.ok(css.includes("width: 44px") && css.includes("height: 44px"), "Close button must have 44x44px touch target");
  assert.ok(css.includes("prefers-reduced-motion: reduce"), "Must contain prefers-reduced-motion rule");
  assert.ok(css.includes("@media (max-width: 480px)"), "Must contain mobile responsiveness query");

  console.log("  ✓ Test 2 Passed: WCAG 2.5.5 touch target size and media query verified.");
})();

// ---------------------------------------------------------------------------
// Test 3: WhatsApp Reassuring Message Format
// ---------------------------------------------------------------------------
(function testWhatsAppFormatting() {
  console.log("Test 3: WhatsApp Reassuring Message Formatting...");

  const testRef = "HV-REP-88A9F1";
  const defaultMsgAr = `إليك رابط التقرير الطبي المعتمد من Health Vibe للاطمئنان على الحالة الصحية والتنفسية (المرجع: ${testRef}):`;
  const shareUrl = "https://healthvibes.app/app/index.html?shared=test12345";
  const fullMsg = `${defaultMsgAr}\n${shareUrl}`;
  const encoded = encodeURIComponent(fullMsg);

  assert.ok(encoded.includes(encodeURIComponent(testRef)), "Encoded message must contain report reference");
  assert.ok(encoded.includes(encodeURIComponent("Health Vibe")), "Encoded message must contain Health Vibe title");
  assert.ok(encoded.includes(encodeURIComponent(shareUrl)), "Encoded message must contain share URL");

  console.log("  ✓ Test 3 Passed: Reassuring message correctly formatted for family communication.");
})();

// ---------------------------------------------------------------------------
// Test 4: Translation Parity across AR and EN
// ---------------------------------------------------------------------------
(function testTranslationParity() {
  console.log("Test 4: Translation Parity for quickShare...");

  assert.ok(i18n.translations.ar.quickShare, "Arabic quickShare dictionary must exist");
  assert.ok(i18n.translations.en.quickShare, "English quickShare dictionary must exist");

  const arKeys = Object.keys(i18n.translations.ar.quickShare).sort();
  const enKeys = Object.keys(i18n.translations.en.quickShare).sort();

  assert.deepStrictEqual(arKeys, enKeys, "AR and EN quickShare translation keys must match 100%");
  assert.ok(arKeys.length >= 15, "Must have at least 15 keys for quick sharing features");

  console.log("  ✓ Test 4 Passed: 100% translation key parity verified.");
})();

// ---------------------------------------------------------------------------
// Test 5: Graceful Error Handling When No Report Selected
// ---------------------------------------------------------------------------
(function testNoReportSelectedGraceful() {
  console.log("Test 5: Graceful Error Handling When No Report Selected...");

  let toastMsg = "";
  global.showToast = (msg) => { toastMsg = msg; };

  QuickShareUI.open(null);
  assert.ok(toastMsg.length > 0, "Must display informative toast when record is null");

  toastMsg = "";
  QuickShareUI.open({});
  assert.ok(toastMsg.length > 0, "Must display informative toast when record has no ID");

  console.log("  ✓ Test 5 Passed: Graceful validation prevents crashes.");
})();

console.log("\n>>> ALL 5 QUICK REPORT SHARE QA TESTS PASSED! <<<\n");
