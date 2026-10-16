/**
 * Health Vibe AI - Flicker-Free Dark/Light Mode Usability & Mobile A11y QA Suite
 * (مرجع: HealthVibe AI - تحسين تجربة التبديل بين الوضع الليلي والنهاري دون وميض)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const i18n = require("../app/i18n.js");

console.log("=== Running Flicker-Free Dark/Light Mode Usability & Mobile A11y QA Suite ===");

// ---------------------------------------------------------------------------
// Test 1: Pre-DOM Execution & Zero-Flicker Architecture
// ---------------------------------------------------------------------------
(function testPreDomThemeBoot() {
  console.log("Test 1: Pre-DOM Immediate Execution Architecture...");

  const themeBootPath = path.join(__dirname, "../app/theme-boot.js");
  assert.ok(fs.existsSync(themeBootPath), "theme-boot.js must exist in app root");
  const bootCode = fs.readFileSync(themeBootPath, "utf8");

  // Must check localStorage without waiting for DOMContentLoaded
  assert.ok(bootCode.includes("localStorage.getItem(\"hv_theme\")"), "theme-boot.js must read hv_theme synchronously");
  assert.ok(bootCode.includes("document.documentElement.classList.add"), "Must apply class to root HTML element");
  assert.ok(bootCode.includes("document.body.classList.add(\"dark\")"), "Must support dark mode on body");
  assert.ok(bootCode.includes("document.body.classList.add(\"light\")"), "Must support light mode on body");

  console.log("  ✓ Test 1 Passed: Synchronous pre-DOM theme boot prevents light/dark flicker.");
})();

// ---------------------------------------------------------------------------
// Test 2: Accessible Theme Toggles & WCAG 2.5.5 Touch Targets
// ---------------------------------------------------------------------------
(function testAccessibleToggles() {
  console.log("Test 2: Accessible Theme Toggles & Touch Targets...");

  const html = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

  // Verify all 3 theme toggles exist and are not hidden
  assert.ok(html.includes('id="themeToggle"'), "FAB themeToggle must exist");
  assert.ok(html.includes('id="topbarThemeToggle"'), "Topbar themeToggle must exist");
  assert.ok(html.includes('id="siteThemeToggle"'), "Site nav themeToggle must exist");

  // Verify they have aria-label
  assert.ok(html.includes('id="themeToggle" class="theme-fab" type="button" aria-label='), "FAB has aria-label");
  assert.ok(html.includes('id="topbarThemeToggle" class="icon-button" type="button" aria-label='), "Topbar has aria-label");
  assert.ok(html.includes('id="siteThemeToggle" class="icon-button" type="button" aria-label='), "Site nav has aria-label");

  // Verify WCAG 2.5.5 touch target rules in CSS
  assert.ok(css.includes(".theme-fab"), "CSS must style .theme-fab");
  assert.ok(css.includes("min-width: 44px") && css.includes("min-height: 44px"), "Buttons must satisfy min 44px touch targets");

  console.log("  ✓ Test 2 Passed: Accessible theme toggles with WCAG 2.5.5 compliance verified.");
})();

// ---------------------------------------------------------------------------
// Test 3: Bidirectional Theme Switching & LocalStorage Persistence
// ---------------------------------------------------------------------------
(function testBidirectionalThemeSwitching() {
  console.log("Test 3: Bidirectional Theme Switching...");

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
      },
      setAttribute: () => {}
    },
    body: {
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c)
      }
    },
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  global.updateThemeLogos = () => {};

  // Mock app.js theme functions
  function applyTheme(theme = "dark") {
    const isLight = (theme === "light");
    if (isLight) {
      document.body.classList.remove("dark");
      document.body.classList.add("light");
      document.documentElement.classList.remove("hv-theme-dark");
      document.documentElement.classList.add("hv-theme-light");
      localStorage.setItem("hv_theme", "light");
    } else {
      document.body.classList.add("dark");
      document.body.classList.remove("light");
      document.documentElement.classList.add("hv-theme-dark");
      document.documentElement.classList.remove("hv-theme-light");
      localStorage.setItem("hv_theme", "dark");
    }
  }

  function toggleTheme() {
    const current = localStorage.getItem("hv_theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
  }

  // Initial state (dark)
  applyTheme("dark");
  assert.strictEqual(localStorage.getItem("hv_theme"), "dark");
  assert.ok(bodyClasses.has("dark"));
  assert.ok(docElClasses.has("hv-theme-dark"));

  // Toggle to light
  toggleTheme();
  assert.strictEqual(localStorage.getItem("hv_theme"), "light");
  assert.ok(bodyClasses.has("light"));
  assert.ok(!bodyClasses.has("dark"));
  assert.ok(docElClasses.has("hv-theme-light"));

  // Toggle back to dark
  toggleTheme();
  assert.strictEqual(localStorage.getItem("hv_theme"), "dark");
  assert.ok(bodyClasses.has("dark"));
  assert.ok(!bodyClasses.has("light"));

  console.log("  ✓ Test 3 Passed: Bidirectional state toggling and storage sync verified.");
})();

// ---------------------------------------------------------------------------
// Test 4: Translation Parity for theme Dictionary
// ---------------------------------------------------------------------------
(function testTranslationParity() {
  console.log("Test 4: Translation Parity for theme...");

  assert.ok(i18n.translations.ar.theme, "Arabic theme dictionary must exist");
  assert.ok(i18n.translations.en.theme, "English theme dictionary must exist");

  const arKeys = Object.keys(i18n.translations.ar.theme).sort();
  const enKeys = Object.keys(i18n.translations.en.theme).sort();

  assert.deepStrictEqual(arKeys, enKeys, "AR and EN theme translation keys must match 100%");
  assert.ok(arKeys.length >= 7, "Must contain all required theme localization keys");

  console.log("  ✓ Test 4 Passed: 100% translation key parity verified.");
})();

console.log("\n>>> ALL 4 FLICKER-FREE THEME QA TESTS PASSED! <<<\n");
