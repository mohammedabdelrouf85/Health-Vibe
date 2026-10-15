/**
 * tests/bidi_text_rendering.test.js
 * Verification test suite for bidirectional text rendering in Arabic (RTL) mode.
 * Verifies that numbers, percentages, mathematical operators (<, >, ≥, ≤),
 * SLAs, and stats are protected from reverse rendering (e.g. "4% >" instead of "< 4%").
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

console.log("==================================================================");
console.log("🔤 HEALTH VIBE AI: BIDIRECTIONAL TEXT RENDERING VERIFICATION SUITE");
console.log("   Numeric figures, percentages, comparison operators in RTL mode");
console.log("==================================================================\n");

let passedTests = 0;

function runTest(name, fn) {
  try {
    process.stdout.write(`▶ ${name} ... `);
    fn();
    console.log("✓ PASSED");
    passedTests++;
  } catch (err) {
    console.log("✗ FAILED");
    console.error(err);
    process.exit(1);
  }
}

// 1. i18n isolateBidi and formatBidiPercent helper tests
runTest("TEST 1: i18n BiDi isolation helper functions", () => {
  const { isolateBidi, formatBidiPercent, defaultI18n } = require(path.join(ROOT, "app", "i18n.js"));

  assert.strictEqual(typeof isolateBidi, "function", "isolateBidi should be a function");
  assert.strictEqual(typeof formatBidiPercent, "function", "formatBidiPercent should be a function");
  assert.strictEqual(typeof defaultI18n.isolateBidi, "function", "defaultI18n.isolateBidi should exist");
  assert.strictEqual(typeof defaultI18n.formatBidiPercent, "function", "defaultI18n.formatBidiPercent should exist");

  // Basic isolation
  assert.strictEqual(
    isolateBidi("< 4%"),
    '<bdi class="bidi-isolate">< 4%</bdi>',
    "Should wrap '< 4%' in <bdi class='bidi-isolate'>"
  );
  assert.strictEqual(
    isolateBidi("RPO < 15m"),
    '<bdi class="bidi-isolate">RPO < 15m</bdi>',
    "Should wrap 'RPO < 15m' in <bdi class='bidi-isolate'>"
  );
  assert.strictEqual(
    formatBidiPercent(98.5),
    '<bdi class="bidi-isolate">98.5%</bdi>',
    "Should format percent with <bdi> tag"
  );

  // Edge cases
  assert.strictEqual(isolateBidi(""), "");
  assert.strictEqual(isolateBidi(null), "");
  assert.strictEqual(isolateBidi(undefined), "");
  assert.strictEqual(formatBidiPercent(""), "");
  assert.strictEqual(formatBidiPercent(null), "");
});

// 2. CSS rules in styles.css
runTest("TEST 2: BiDi isolation CSS rules in app/styles.css", () => {
  const stylesPath = path.join(ROOT, "app", "styles.css");
  const css = fs.readFileSync(stylesPath, "utf-8");

  assert.ok(css.includes("unicode-bidi: isolate"), "styles.css must include 'unicode-bidi: isolate'");
  assert.ok(css.includes(".bidi-isolate"), "styles.css must style .bidi-isolate");
  assert.ok(css.includes("bdi"), "styles.css must style bdi tags");
  assert.ok(css.includes('[dir="rtl"] bdi') || css.includes('[dir="rtl"] .bidi-isolate'), "styles.css must have RTL overrides for bdi/.bidi-isolate");
  assert.ok(css.includes("direction: ltr !important"), "styles.css RTL overrides must enforce direction: ltr !important");
});

// 3. pitch.html BiDi rules and slide markup
runTest("TEST 3: pitch.html slide numbers and comparison operators in <bdi>", () => {
  const pitchPath = path.join(ROOT, "app", "pitch.html");
  const pitchHtml = fs.readFileSync(pitchPath, "utf-8");

  // Style checks
  assert.ok(pitchHtml.includes(".stat-number"), "pitch.html styles must target .stat-number");
  assert.ok(pitchHtml.includes("unicode-bidi: isolate"), "pitch.html must define unicode-bidi: isolate");
  assert.ok(pitchHtml.includes("bdi"), "pitch.html must define bdi styles");

  // Markup checks for <bdi> wrappers
  assert.ok(pitchHtml.includes("<bdi class=\"bidi-isolate\">RPO &lt; 15</bdi>"), "Slide 4 RPO must be wrapped in <bdi>");
  assert.ok(pitchHtml.includes("<bdi>&lt; 4%</bdi>"), "Slide 5 '< 4%' must be wrapped in <bdi>");
  assert.ok(pitchHtml.includes("<bdi>70%</bdi>"), "Slide 5 '70%' must be wrapped in <bdi>");
  assert.ok(pitchHtml.includes("<bdi>12 min</bdi>"), "Slide 5 '12 min' must be wrapped in <bdi>");
  assert.ok(pitchHtml.includes("<bdi>100+</bdi>"), "Slide 5 '100+' must be wrapped in <bdi>");
  assert.ok(pitchHtml.includes("<bdi>$4.2B</bdi>"), "Slide 6 '$4.2B' must be wrapped in <bdi>");

  // Script dynamic update checks
  assert.ok(pitchHtml.includes("<bdi>${m.val}</bdi>"), "Dynamic slide metrics must wrap m.val in <bdi>");
});

// 4. clinics.html trust metrics and calculator BiDi rules
runTest("TEST 4: clinics.html trust metrics & calculator results isolation", () => {
  const clinicsPath = path.join(ROOT, "app", "clinics.html");
  const clinicsHtml = fs.readFileSync(clinicsPath, "utf-8");

  // Style checks
  assert.ok(clinicsHtml.includes("unicode-bidi: isolate"), "clinics.html styles must include unicode-bidi: isolate");
  assert.ok(clinicsHtml.includes(".trust-metric-item strong"), "clinics.html styles must target trust metrics");

  // Markup checks
  assert.ok(clinicsHtml.includes('<strong id="metric1Val"><bdi>'), "metric1Val must contain <bdi>");
  assert.ok(clinicsHtml.includes('<strong id="metric2Val"><bdi>'), "metric2Val must contain <bdi>");
  assert.ok(clinicsHtml.includes('<strong id="calcHoursSaved"><bdi>'), "calcHoursSaved must contain <bdi>");
  assert.ok(clinicsHtml.includes('<strong id="calcRevenueGain"><bdi>'), "calcRevenueGain must contain <bdi>");
  assert.ok(clinicsHtml.includes('<strong id="calcTriageSpeed"><bdi>'), "calcTriageSpeed must contain <bdi>");
  assert.ok(clinicsHtml.includes('calcHoursSaved").innerHTML = `<bdi>'), "calcHoursSaved dynamic update must be wrapped in <bdi>");
  assert.ok(clinicsHtml.includes('calcRevenueGain").innerHTML = `<bdi>'), "calcRevenueGain dynamic update must be wrapped in <bdi>");
  assert.ok(clinicsHtml.includes('calcTriageSpeed') && clinicsHtml.includes('id === "calcTriageSpeed"'), "calcTriageSpeed must be handled in applyClinicLang");
});

// 5. admin-view.html and index.html KPI & SLA targets isolation
runTest("TEST 5: admin-view.html and index.html target figures isolation", () => {
  const adminViewPath = path.join(ROOT, "app", "modules", "admin", "admin-view.html");
  const indexPath = path.join(ROOT, "app", "index.html");

  const adminHtml = fs.readFileSync(adminViewPath, "utf-8");
  const indexHtml = fs.readFileSync(indexPath, "utf-8");

  // Check admin-view.html
  assert.ok(adminHtml.includes('<bdi class="bidi-isolate">SpO2 &lt; 90%</bdi>'), "admin-view.html must isolate SpO2 < 90%");
  assert.ok(adminHtml.includes('<bdi class="bidi-isolate">&lt; 30 دقيقة</bdi>'), "admin-view.html must isolate < 30 minutes");
  assert.ok(adminHtml.includes('<bdi class="bidi-isolate">≥ 90%</bdi>'), "admin-view.html must isolate ≥ 90%");
  assert.ok(adminHtml.includes('<bdi class="bidi-isolate">RPO &lt; 15m (PITR)</bdi>'), "admin-view.html must isolate RPO < 15m");

  // Check index.html
  assert.ok(indexHtml.includes('<bdi class="bidi-isolate">SpO2 &lt; 90%</bdi>'), "index.html must isolate SpO2 < 90%");
  assert.ok(indexHtml.includes('<bdi class="bidi-isolate">&lt; 30 دقيقة</bdi>'), "index.html must isolate < 30 minutes");
  assert.ok(indexHtml.includes('<bdi class="bidi-isolate">≥ 90%</bdi>'), "index.html must isolate ≥ 90%");
  assert.ok(indexHtml.includes('<bdi class="bidi-isolate">RPO &lt; 15m (PITR)</bdi>'), "index.html must isolate RPO < 15m");
});

// 6. UI modules assessment and doctor delta cell isolation
runTest("TEST 6: Comparison UI & Doctor UI delta isolation", () => {
  const assessComparisonPath = path.join(ROOT, "app", "modules", "assessment", "assessment-comparison-ui.js");
  const doctorUiPath = path.join(ROOT, "app", "modules", "doctor", "doctor-ui.js");
  const diabetesUiPath = path.join(ROOT, "app", "modules", "diabetes", "diabetes-ui.js");

  const assessJs = fs.readFileSync(assessComparisonPath, "utf-8");
  const doctorJs = fs.readFileSync(doctorUiPath, "utf-8");
  const diabetesJs = fs.readFileSync(diabetesUiPath, "utf-8");

  assert.ok(assessJs.includes('<bdi class="bidi-isolate">'), "assessment-comparison-ui.js must wrap deltas in <bdi class='bidi-isolate'>");
  assert.ok(doctorJs.includes('<bdi class="bidi-isolate">'), "doctor-ui.js must wrap table values and deltas in <bdi class='bidi-isolate'>");
  assert.ok(diabetesJs.includes('<bdi class="bidi-isolate">'), "diabetes-ui.js must wrap clinical target ranges in <bdi class='bidi-isolate'>");
});

console.log("\n==================================================================");
console.log(`🎉 ALL ${passedTests} BIDIRECTIONAL TEXT RENDERING TESTS PASSED!`);
console.log("==================================================================\n");
