/**
 * Health Vibe AI - Raw i18n Keys Elimination & Fallback Helper Test Suite
 *
 * Verifies that:
 * 1. Missing keys such as "patient.compareAssessments", "profile.*", and "diabetes.*"
 *    are populated in both Arabic and English translation catalogs with 100% parity.
 * 2. getFallbackText(key, fallback) converts raw dot-notation keys into human-readable text.
 * 3. translateDOM() never leaves or writes raw dot-notation keys into the DOM.
 * 4. Module UI t() functions provide graceful fallbacks without returning truthy raw key strings.
 */

const assert = require("assert");
const { I18nEngine, defaultI18n, translations, getFallbackText } = require("../app/i18n.js");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: RAW i18n KEYS ELIMINATION & FALLBACK TESTS");
console.log("==================================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`  ✓ ${testName}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${testName}`);
    console.error(`    Error: ${err.message}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Explicit Resolution of "patient.compareAssessments" in AR and EN
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 1: Resolution of patient.compareAssessments");
runTest("patient.compareAssessments resolves to correct Arabic and English text", () => {
  defaultI18n.setLanguage("en", false);
  const enText = defaultI18n.t("patient.compareAssessments");
  assert.strictEqual(enText, "Compare Assessments");

  defaultI18n.setLanguage("ar", false);
  const arText = defaultI18n.t("patient.compareAssessments");
  assert.strictEqual(arText, "مقارنة التقييمات السريرية");

  // Reset to ar default
  defaultI18n.setLanguage("ar", false);
});

// -----------------------------------------------------------------------------
// Test 2: Catalog Parity for Newly Added Keys & Profile Keys
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Profile & Common Catalog Additions Parity");
runTest("All profile.* and common.* keys exist in both ar and en", () => {
  const profileKeys = [
    "subtitle", "fullName", "dob", "phone", "emergencyName", "emergencyRelation", "emergencyPhone",
    "biometrics", "height", "weight", "clinicalSexTitle", "clinicalSexNote", "biologicalSex",
    "medicalHistoryTitle", "chronic", "medications", "surgeries", "familyHistory", "hospitalAdmissions",
    "smokingStatus", "smokingDetails", "insuranceTitle", "insuranceOptional", "insuranceNote",
    "insuranceProvider", "insurancePolicy", "insuranceGroup", "insuranceExpiry",
    "trustedLinkageTitle", "trustedLinkageNote", "clinicLabel", "doctorLabel"
  ];

  for (const key of profileKeys) {
    const arVal = translations.ar.profile[key];
    const enVal = translations.en.profile[key];
    assert.ok(arVal, `Missing ar.profile.${key}`);
    assert.ok(enVal, `Missing en.profile.${key}`);
    assert.notStrictEqual(arVal, `profile.${key}`);
    assert.notStrictEqual(enVal, `profile.${key}`);
  }

  // Common additions
  assert.ok(translations.ar.common.name);
  assert.ok(translations.en.common.name);
  assert.ok(translations.ar.common.refresh);
  assert.ok(translations.en.common.refresh);
});

// -----------------------------------------------------------------------------
// Test 3: getFallbackText() Conversion & Acronym Handling
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: getFallbackText() Helper Function");
runTest("getFallbackText converts unmapped dot-notation keys into title-cased copy", () => {
  assert.strictEqual(getFallbackText("patient.compareAssessments"), "Compare Assessments");
  assert.strictEqual(getFallbackText("patient.medicalHistoryRecord"), "Medical History Record");
  assert.strictEqual(getFallbackText("analytics.userEngagementRate"), "User Engagement Rate");
  assert.strictEqual(getFallbackText("settings.account_security"), "Account Security");
});

runTest("getFallbackText handles clinical and technical acronyms", () => {
  assert.strictEqual(getFallbackText("profile.dob"), "Date of Birth");
  assert.strictEqual(getFallbackText("patient.vitals.bmi"), "BMI");
  assert.strictEqual(getFallbackText("lab.hba1c"), "HbA1c");
  assert.strictEqual(getFallbackText("reports.ai"), "AI");
  assert.strictEqual(getFallbackText("dashboard.kpi"), "KPI");
  assert.strictEqual(getFallbackText("pulmonology.copd"), "COPD");
  assert.strictEqual(getFallbackText("respiratory.fev1"), "FEV1");
  assert.strictEqual(getFallbackText("respiratory.fvc"), "FVC");
  assert.strictEqual(getFallbackText("blood.inr"), "INR");
  assert.strictEqual(getFallbackText("vitals.spo2"), "SpO2");
});

runTest("getFallbackText handles generic leaf nodes with parent context", () => {
  assert.strictEqual(getFallbackText("emergencyContact.name"), "Emergency Contact Name");
  assert.strictEqual(getFallbackText("clinicalSex.title"), "Clinical Sex Title");
  assert.strictEqual(getFallbackText("consultation.note"), "Consultation Note");
});

runTest("getFallbackText respects explicit custom fallback parameter", () => {
  assert.strictEqual(getFallbackText("random.missingKey", "Custom Button Label"), "Custom Button Label");
  // If the provided fallback is itself the raw key, it falls back to formatting
  assert.strictEqual(getFallbackText("random.missingKey", "random.missingKey"), "Missing Key");
});

runTest("getFallbackText gracefully handles empty or non-string inputs", () => {
  assert.strictEqual(getFallbackText(""), "");
  assert.strictEqual(getFallbackText(null), "");
  assert.strictEqual(getFallbackText(undefined), "");
  assert.strictEqual(getFallbackText(12345), "");
});

// -----------------------------------------------------------------------------
// Test 4: translateDOM() Prevents Raw Keys from Appearing in the DOM
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: translateDOM() Raw Key Immunity");
function createMockElement(attrs = {}, textContent = "") {
  return {
    attrs: { ...attrs },
    textContent: textContent,
    innerHTML: textContent,
    placeholder: attrs.placeholder || "",
    title: attrs.title || "",
    value: attrs.value || "",
    getAttribute(name) {
      return this.attrs[name] !== undefined ? this.attrs[name] : null;
    },
    setAttribute(name, val) {
      this.attrs[name] = val;
    }
  };
}

runTest("translateDOM() replaces missing key with human-readable fallback instead of raw key", () => {
  const elements = {
    test1: createMockElement({ "data-i18n": "patient.compareAssessments" }),
    test2: createMockElement({ "data-i18n": "customModule.experimentalFeature" }),
    test3: createMockElement({ "data-i18n": "unmapped.button" }, "Existing Button Copy"),
    test4: createMockElement({ "data-i18n-placeholder": "profile.dob" }),
    test5: createMockElement({ "data-i18n-title": "unmapped.actionTooltip" }),
    test6: createMockElement({ "data-i18n-aria": "unmapped.closeDialog" }),
    test7: createMockElement({ "data-i18n-value": "unmapped.submitAction" })
  };

  const mockRoot = {
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return [elements.test1, elements.test2, elements.test3];
      if (selector === "[data-i18n-html]") return [];
      if (selector === "[data-i18n-placeholder]") return [elements.test4];
      if (selector === "[data-i18n-title]") return [elements.test5];
      if (selector === "[data-i18n-aria]") return [elements.test6];
      if (selector === "[data-i18n-value]") return [elements.test7];
      return [];
    }
  };

  const engine = new I18nEngine({ defaultLanguage: "en" });
  engine.translateDOM(mockRoot);

  // test1: Known key
  assert.strictEqual(elements.test1.textContent, "Compare Assessments");

  // test2: Unmapped key with no pre-existing text -> should be formatted fallback, NOT raw key
  assert.strictEqual(elements.test2.textContent, "Experimental Feature");
  assert.notStrictEqual(elements.test2.textContent, "customModule.experimentalFeature");

  // test3: Unmapped key with existing human-readable text -> preserves existing human text
  assert.strictEqual(elements.test3.textContent, "Existing Button Copy");
  assert.notStrictEqual(elements.test3.textContent, "unmapped.button");

  // test4: Placeholder with unmapped acronym key
  assert.strictEqual(elements.test4.placeholder, "Date of Birth");

  // test5: Title with unmapped key
  assert.strictEqual(elements.test5.title, "Action Tooltip");

  // test6: Aria label with unmapped key
  assert.strictEqual(elements.test6.attrs["aria-label"], "Close Dialog");

  // test7: Value with unmapped key
  assert.strictEqual(elements.test7.value, "Submit Action");
});

// -----------------------------------------------------------------------------
// Test 5: Module UI Fallback Evaluation (Prevent truthy raw key bypassing ||)
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: Module UI Fallback Evaluation");
runTest("Local UI t() helper does not return truthy raw key when translation is missing", () => {
  // Simulate mock environment without i18n
  const mockGlobal = {
    getFallbackText
  };

  // Function signature mimicking our updated diabetes/hypertension UI t()
  function moduleT(key, params = {}, fallback = "") {
    let res = "";
    if (typeof mockGlobal.HealthVibes?.i18n?.t === "function") {
      res = mockGlobal.HealthVibes.i18n.t(key, params, fallback);
    } else if (typeof mockGlobal.t === "function") {
      res = mockGlobal.t(key, params, fallback);
    }
    if (res && res !== key) return res;
    if (fallback) return fallback;
    if (typeof mockGlobal.getFallbackText === "function") {
      return mockGlobal.getFallbackText(key);
    }
    return "";
  }

  // When key is missing and default is given via ||
  const labelWithOr = moduleT("missing.dashboardTitle") || "Fallback Title";
  assert.strictEqual(labelWithOr, "Dashboard Title");

  // When key is missing and custom fallback is passed
  const labelWithParam = moduleT("missing.saveAction", {}, "Save Plan");
  assert.strictEqual(labelWithParam, "Save Plan");
});

console.log("\n==================================================================");
if (testsFailed === 0) {
  console.log(`🎉 ALL ${testsPassed} RAW i18n KEYS ELIMINATION TESTS PASSED!`);
} else {
  console.error(`❌ ${testsFailed} TESTS FAILED.`);
  process.exit(1);
}
console.log("==================================================================");
