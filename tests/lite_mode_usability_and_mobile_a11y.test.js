/**
 * Health Vibe AI - Lite Mode for Low-End Devices Usability & Mobile A11y QA Suite
 * (مرجع: Vezeeta - توفير نسخة خفيفة للعمل على الأجهزة الضعيفة)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const LiteModeService = require("../app/modules/core/lite-mode-service.js");
const i18n = require("../app/i18n.js");

console.log("=== Running Lite Mode for Low-End Devices Usability & Mobile A11y QA Suite ===");

// ---------------------------------------------------------------------------
// Test 1: Hardware Capability Auto-Detection Logic
// ---------------------------------------------------------------------------
(function testHardwareAutoDetection() {
  console.log("Test 1: Hardware Auto-Detection Logic...");

  // Mock low-end phone (Budget Android in Egypt, e.g. 4 cores, 2GB RAM)
  const lowNav = {
    hardwareConcurrency: 4,
    deviceMemory: 2
  };
  assert.strictEqual(LiteModeService.detectLowEndHardware(lowNav), true, "Should detect 4-core, 2GB device as low-end");

  // Mock flagship phone (8 cores, 8GB RAM)
  const highNav = {
    hardwareConcurrency: 8,
    deviceMemory: 8
  };
  assert.strictEqual(LiteModeService.detectLowEndHardware(highNav), false, "Should not detect 8-core, 8GB device as low-end");

  // Low bandwidth connection
  const saverNav = {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    connection: { saveData: true }
  };
  assert.strictEqual(LiteModeService.detectLowEndHardware(saverNav), true, "Save-data mode should trigger low-end optimization");

  console.log("  ✓ Test 1 Passed: Hardware capabilities and data-saver conditions accurately detected.");
})();

// ---------------------------------------------------------------------------
// Test 2: DOM Class Manipulation & Persistence Synchronization
// ---------------------------------------------------------------------------
(function testDomClassesAndPersistence() {
  console.log("Test 2: DOM Class Manipulation & Persistence Synchronization...");

  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
  };

  const docElClasses = new Set();
  const bodyClasses = new Set();

  global.document = {
    documentElement: {
      classList: {
        add: (c) => docElClasses.add(c),
        remove: (c) => docElClasses.delete(c),
        contains: (c) => docElClasses.has(c)
      }
    },
    body: {
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c)
      }
    }
  };

  // Explicitly enable Lite Mode
  LiteModeService.setLiteMode(true);
  assert.strictEqual(localStorage.getItem("healthvibe_lite_mode"), "true");
  assert.ok(docElClasses.has("hv-lite-mode"), "document.documentElement must have .hv-lite-mode");
  assert.ok(bodyClasses.has("hv-lite-mode"), "document.body must have .hv-lite-mode");

  // Toggle off
  LiteModeService.toggle();
  assert.strictEqual(localStorage.getItem("healthvibe_lite_mode"), "false");
  assert.ok(!docElClasses.has("hv-lite-mode"), "document.documentElement must not have .hv-lite-mode");
  assert.ok(!bodyClasses.has("hv-lite-mode"), "document.body must not have .hv-lite-mode");

  console.log("  ✓ Test 2 Passed: DOM class lifecycle and local storage sync verified.");
})();

// ---------------------------------------------------------------------------
// Test 3: CSS Neutralization Rules in lite-mode.css
// ---------------------------------------------------------------------------
(function testCssNeutralizationRules() {
  console.log("Test 3: CSS Neutralization Rules in lite-mode.css...");

  const cssPath = path.join(__dirname, "../app/modules/core/lite-mode.css");
  assert.ok(fs.existsSync(cssPath), "lite-mode.css must exist");
  const css = fs.readFileSync(cssPath, "utf8");

  // Animation suppression
  assert.ok(css.includes("animation-duration: 0.001ms !important"), "Must eliminate animation durations");
  assert.ok(css.includes("transition-duration: 0.001ms !important"), "Must eliminate transition durations");

  // Backdrop filter & blur elimination
  assert.ok(css.includes("backdrop-filter: none !important"), "Must disable expensive GPU backdrop filters");
  assert.ok(css.includes("box-shadow: none !important"), "Must eliminate box-shadows on cards");

  // Touch targets for toggle button
  assert.ok(css.includes("min-height: 44px"), "Toggle button must satisfy WCAG 2.5.5 min 44px height");

  console.log("  ✓ Test 3 Passed: CSS animation neutralization and GPU reduction verified.");
})();

// ---------------------------------------------------------------------------
// Test 4: Translation Parity for liteMode Dictionary
// ---------------------------------------------------------------------------
(function testTranslationParity() {
  console.log("Test 4: Translation Parity for liteMode...");

  assert.ok(i18n.translations.ar.liteMode, "Arabic liteMode dictionary must exist");
  assert.ok(i18n.translations.en.liteMode, "English liteMode dictionary must exist");

  const arKeys = Object.keys(i18n.translations.ar.liteMode).sort();
  const enKeys = Object.keys(i18n.translations.en.liteMode).sort();

  assert.deepStrictEqual(arKeys, enKeys, "AR and EN liteMode translation keys must match 100%");
  assert.ok(arKeys.length >= 10, "Must contain all required lite mode localization keys");

  console.log("  ✓ Test 4 Passed: 100% translation key parity verified.");
})();

console.log("\n>>> ALL 4 LITE MODE QA TESTS PASSED! <<<\n");
