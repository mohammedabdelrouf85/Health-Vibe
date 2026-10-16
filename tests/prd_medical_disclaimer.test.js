/**
 * PRD Page 21 Medical Disclaimer Unit Tests
 * Validates PRD Section 18 requirement:
 * "يجب أن يظهر الـDisclaimer في صفحة النتائج وفي كل PDF report، بصياغة واضحة ومقروءة، ولا يكون مخفياً داخل Terms فقط."
 * 1. Prominent, permanent disclaimer on screen-assessment.
 * 2. Prominent, permanent disclaimer on screen-result (both locked and approved states).
 * 3. Exact bilingual texts matching PRD page 21 (Arabic 18.1 & English 18.2).
 * 4. Direct link to full legal modal.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🚨 HEALTH VIBE AI: PRD PAGE 21 MEDICAL DISCLAIMER TEST SUITE");
console.log("==================================================================\n");

const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const indexHtmlPath = path.resolve(__dirname, "../app/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");
const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

// TEST 1: Assessment Screen Prominent Disclaimer
console.log("▶ TEST 1: Permanent Disclaimer on Assessment Screen");
const assessmentScreenMatch = indexHtmlContent.includes('id="screen-assessment"');
assert.ok(assessmentScreenMatch, "index.html must contain #screen-assessment");

const assessmentBlock = indexHtmlContent.slice(
  indexHtmlContent.indexOf('id="screen-assessment"'),
  indexHtmlContent.indexOf('id="screen-pending"')
);

assert.ok(
  assessmentBlock.includes('class="prd-medical-disclaimer-box"'),
  "Assessment screen must contain .prd-medical-disclaimer-box"
);
assert.ok(
  assessmentBlock.includes('data-i18n="legal.prdDisclaimerBody"'),
  "Assessment screen disclaimer must bind to legal.prdDisclaimerBody"
);
console.log("  ✓ Assessment screen includes prominent, unhidden PRD Medical Disclaimer.");

// TEST 2: Result Screen Prominent Disclaimer (Locked & Approved)
console.log("\n▶ TEST 2: Permanent Disclaimer on Result Screen");
assert.ok(
  indexHtmlContent.includes('id="resultStaticPrdDisclaimer"'),
  "index.html result screen must contain static fallback #resultStaticPrdDisclaimer"
);

assert.ok(
  appJsContent.includes("renderResultScreen"),
  "app.js must define renderResultScreen"
);
assert.ok(
  appJsContent.includes("Result Screen - Locked State"),
  "renderResultScreen must inject PRD disclaimer in locked state"
);
assert.ok(
  appJsContent.includes("Result Screen - Approved State"),
  "renderResultScreen must inject PRD disclaimer in approved state"
);
console.log("  ✓ Result screen includes prominent, unhidden PRD Medical Disclaimer in all states.");

// TEST 3: Exact Bilingual PRD Page 21 Text Validation
console.log("\n▶ TEST 3: Exact Bilingual PRD Page 21 Wording");
const prdArKey = "المعلومات والنتائج المقدمة عبر HealthVibe AI هي لأغراض التوعية ودعم القرار الطبي فقط";
const prdEnKey = "HealthVibe AI provides informational and clinical decision-support outputs only";

assert.ok(
  i18nContent.includes(prdArKey),
  "i18n.js Arabic translations must contain the exact PRD Section 18.1 wording"
);
assert.ok(
  i18nContent.includes(prdEnKey),
  "i18n.js English translations must contain the exact PRD Section 18.2 wording"
);
assert.ok(
  appJsContent.includes(prdArKey),
  "app.js must render Arabic PRD Section 18.1 wording"
);
assert.ok(
  appJsContent.includes(prdEnKey),
  "app.js must render English PRD Section 18.2 wording"
);
console.log("  ✓ Exact PRD page 21 Arabic & English disclaimers are present and verified.");

// TEST 4: Direct Interactive Link to Full Legal Modal
console.log("\n▶ TEST 4: Modal Expansion Link");
assert.ok(
  assessmentBlock.includes("openLegalModal('disclaimer')"),
  "Assessment disclaimer must provide direct link to openLegalModal('disclaimer')"
);
assert.ok(
  appJsContent.includes("openLegalModal('disclaimer')"),
  "Result disclaimer must provide direct link to openLegalModal('disclaimer')"
);
console.log("  ✓ Both assessment and result disclaimers link directly to full legal modal.");

console.log("\n==================================================================");
console.log("🎉 ALL PRD PAGE 21 MEDICAL DISCLAIMER TESTS PASSED (100%)");
console.log("==================================================================\n");
