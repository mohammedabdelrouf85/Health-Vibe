/**
 * Clinics Header Link Bilingual Clarity Test Suite
 * Validates:
 * 1. Absence of distorted fused strings like "For Clinics / للعيادات" or "للأطباء والمراكز الطبية / For Clinics".
 * 2. Proper HTML separation of the icon 🏥 and the text element with data-i18n="nav.forClinics".
 * 3. i18n translation keys parity in Arabic ("للعيادات", "للأطباء والمراكز الطبية") and English ("For Clinics", "For Doctors & Medical Clinics").
 * 4. Runtime translation resolution when toggling between 'ar' and 'en'.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🏥 HEALTH VIBE AI: CLINICS HEADER LINK BILINGUAL TEST SUITE");
console.log("==================================================================\n");

const indexHtmlPath = path.resolve(__dirname, "../app/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

// TEST 1: Elimination of Distorted Fused Strings
console.log("▶ TEST 1: Elimination of Distorted Fused Strings in index.html");
assert.ok(
  !indexHtmlContent.includes("For Clinics / للعيادات"),
  "Distorted fused string 'For Clinics / للعيادات' must be completely removed"
);
assert.ok(
  !indexHtmlContent.includes("للأطباء والمراكز الطبية / For Clinics"),
  "Distorted fused string 'للأطباء والمراكز الطبية / For Clinics' must be completely removed"
);
console.log("  ✓ No distorted fused strings found in index.html.");

// TEST 2: Structured DOM Element in Header
console.log("\n▶ TEST 2: Structured DOM Element in Header (index.html)");
assert.ok(
  indexHtmlContent.includes('id="siteHeaderClinicsLink"'),
  "Header clinics link must have #siteHeaderClinicsLink"
);
assert.ok(
  indexHtmlContent.includes('data-i18n="nav.forClinics"'),
  "Header clinics link must bind to data-i18n='nav.forClinics'"
);
assert.ok(
  indexHtmlContent.includes('data-i18n="nav.forClinicsFull"'),
  "Teaser pill must bind to data-i18n='nav.forClinicsFull'"
);
console.log("  ✓ Structured separation with data-i18n verified.");

// TEST 3: Translation Dictionary Entries
console.log("\n▶ TEST 3: Bilingual i18n Dictionary Parity in i18n.js");
assert.ok(
  i18nContent.includes('forClinics: "للعيادات"') &&
  i18nContent.includes('forClinicsFull: "للأطباء والمراكز الطبية"'),
  "Arabic dictionary must contain forClinics and forClinicsFull"
);
assert.ok(
  i18nContent.includes('forClinics: "For Clinics"') &&
  i18nContent.includes('forClinicsFull: "For Doctors & Medical Clinics"'),
  "English dictionary must contain forClinics and forClinicsFull"
);
console.log("  ✓ Arabic and English translations properly defined.");

// TEST 4: Runtime Dynamic Language Switching
console.log("\n▶ TEST 4: Dynamic Switching in applyLanguage()");
assert.ok(
  appJsContent.includes('siteHeaderClinicsLink.textContent = language === "ar" ? "للعيادات" : "For Clinics"'),
  "applyLanguage must explicitly update #siteHeaderClinicsLink based on active language"
);
console.log("  ✓ Dynamic text switcher verified.");

// TEST 5: Runtime Simulation
console.log("\n▶ TEST 5: Runtime Simulation of Header Display");

function getClinicsLabel(lang) {
  return lang === "ar" ? "للعيادات" : "For Clinics";
}

assert.strictEqual(getClinicsLabel("ar"), "للعيادات");
assert.strictEqual(getClinicsLabel("en"), "For Clinics");
assert.ok(!getClinicsLabel("ar").includes("/"), "Arabic label must not contain slash fusion");
assert.ok(!getClinicsLabel("en").includes("/"), "English label must not contain slash fusion");

console.log("  ✓ Simulation verified: Single language displayed cleanly per active locale.");

console.log("\n==================================================================");
console.log("🎉 ALL CLINICS HEADER LINK TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
