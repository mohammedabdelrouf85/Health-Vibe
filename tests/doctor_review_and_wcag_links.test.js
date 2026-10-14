/**
 * Health Vibe AI - Automated Test Suite:
 * 1. Respiratory Assessment Walkthrough Tour (Request 22)
 * 2. WCAG AA / AAA Contrast System (Request 23)
 * 3. Footer Links & Zero href='#' Top-Jump Audit (Request 24)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🩺 HEALTH VIBE AI: DOCTOR REVIEW TOUR, WCAG & LINK AUDIT TEST");
console.log("==================================================================\n");

const indexHtmlPath = path.resolve(__dirname, "../app/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");

const clinicsHtmlPath = path.resolve(__dirname, "../app/clinics.html");
const clinicsHtmlContent = fs.readFileSync(clinicsHtmlPath, "utf8");

const stylesCssPath = path.resolve(__dirname, "../app/styles.css");
const stylesCssContent = fs.readFileSync(stylesCssPath, "utf8");

const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

const doctorTourJsPath = path.resolve(__dirname, "../app/modules/doctor/doctor-tour.js");
assert.ok(fs.existsSync(doctorTourJsPath), "app/modules/doctor/doctor-tour.js must exist");
const doctorTourJsContent = fs.readFileSync(doctorTourJsPath, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: WCAG Contrast Verification (Request 23)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 1: WCAG Contrast Verification for Secondary / Muted Text");

function parseHex(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

function getLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

// Dark Mode Contrast
const darkBg = "#07191b";
const darkCardBg = "#0d2427";
const darkMuted = "#b0d8d6";

const darkRatioBg = getContrastRatio(darkBg, darkMuted);
const darkRatioCard = getContrastRatio(darkCardBg, darkMuted);
console.log(`  Dark Mode: --muted (${darkMuted}) on --bg (${darkBg}) = ${darkRatioBg}:1 (WCAG AA requires >= 4.5:1)`);
console.log(`  Dark Mode: --muted (${darkMuted}) on card (${darkCardBg}) = ${darkRatioCard}:1`);

assert.ok(
  darkRatioBg >= 4.5,
  `Dark mode contrast ratio ${darkRatioBg}:1 must be >= 4.5:1 (WCAG AA)`
);
assert.ok(
  darkRatioBg >= 7.0,
  `Dark mode contrast ratio ${darkRatioBg}:1 exceeds WCAG AAA (>= 7.0:1) for elderly & pulmonary patients`
);

// Light Mode Contrast
const lightBg = "#ffffff";
const lightMuted = "#2e4d50";

const lightRatioBg = getContrastRatio(lightBg, lightMuted);
console.log(`  Light Mode: --muted (${lightMuted}) on --bg (${lightBg}) = ${lightRatioBg}:1 (WCAG AA requires >= 4.5:1)`);

assert.ok(
  lightRatioBg >= 4.5,
  `Light mode contrast ratio ${lightRatioBg}:1 must be >= 4.5:1 (WCAG AA)`
);
assert.ok(
  lightRatioBg >= 7.0,
  `Light mode contrast ratio ${lightRatioBg}:1 exceeds WCAG AAA (>= 7.0:1) for elderly & pulmonary patients`
);

// Verify styles.css contains the enhanced tokens
assert.ok(
  stylesCssContent.includes("--muted: #b0d8d6;"),
  "styles.css must define dark mode --muted as #b0d8d6"
);
assert.ok(
  stylesCssContent.includes("--muted: #2e4d50;"),
  "styles.css must define light mode --muted as #2e4d50"
);
assert.ok(
  stylesCssContent.includes("font-weight: 500;") || stylesCssContent.includes("font-weight: 600;"),
  "styles.css must have enhanced font-weight for muted text legibility"
);

console.log("  ✅ WCAG AA / AAA contrast tests passed.\n");

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: Hero Respiratory Assessment Card & Interactive Tour (Request 22)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 2: Hero Respiratory Card Clickability & 4-Step Review Tour Modal");

// Hero card attributes
assert.ok(
  indexHtmlContent.includes('id="heroRespiratoryCard"'),
  "index.html must have #heroRespiratoryCard"
);
assert.ok(
  indexHtmlContent.includes('onclick="openDoctorReviewTour()"'),
  "heroRespiratoryCard must have onclick='openDoctorReviewTour()'"
);
assert.ok(
  indexHtmlContent.includes('role="button"'),
  "heroRespiratoryCard must have role='button' for accessibility"
);
assert.ok(
  indexHtmlContent.includes('tabindex="0"'),
  "heroRespiratoryCard must have tabindex='0' for keyboard accessibility"
);
assert.ok(
  indexHtmlContent.includes("SpO2 = 95%"),
  "Hero card must display SpO2 = 95%"
);

// Tour Modal markup in index.html
assert.ok(
  indexHtmlContent.includes('id="doctorTourModal"'),
  "index.html must include #doctorTourModal"
);
assert.ok(
  indexHtmlContent.includes('id="tourStepTab-1"') &&
  indexHtmlContent.includes('id="tourStepTab-2"') &&
  indexHtmlContent.includes('id="tourStepTab-3"') &&
  indexHtmlContent.includes('id="tourStepTab-4"'),
  "Tour modal must have all 4 step tabs"
);
assert.ok(
  indexHtmlContent.includes('id="btnSimulateUnlock"'),
  "Tour modal must have #btnSimulateUnlock button"
);
assert.ok(
  indexHtmlContent.includes('id="tourStepIndicator"'),
  "Tour modal must have #tourStepIndicator"
);

// Tour controller module
assert.ok(
  doctorTourJsContent.includes("global.openDoctorReviewTour = openDoctorReviewTour;"),
  "doctor-tour.js must export openDoctorReviewTour"
);
assert.ok(
  doctorTourJsContent.includes("global.closeDoctorReviewTour = closeDoctorReviewTour;"),
  "doctor-tour.js must export closeDoctorReviewTour"
);
assert.ok(
  doctorTourJsContent.includes("global.goToDoctorTourStep = goToDoctorTourStep;"),
  "doctor-tour.js must export goToDoctorTourStep"
);
assert.ok(
  doctorTourJsContent.includes("global.simulateReportUnlock = simulateReportUnlock;"),
  "doctor-tour.js must export simulateReportUnlock"
);

// Script inclusion in index.html
assert.ok(
  indexHtmlContent.includes('src="./modules/doctor/doctor-tour.js'),
  "index.html must include doctor-tour.js script tag"
);

// Bilingual translations
assert.ok(
  i18nContent.includes("tourPrompt:") && i18nContent.includes("doctorTour:"),
  "i18n.js must have tourPrompt and doctorTour namespaces"
);
assert.ok(
  i18nContent.includes("كيف يراجع الطبيب حالة التقييم التنفسي (SpO2 = 95%) قبل فك القفل؟"),
  "i18n.js must have Arabic doctor tour title"
);
assert.ok(
  i18nContent.includes("How does the doctor review Respiratory Assessment (SpO2 = 95%) before unlock?"),
  "i18n.js must have English doctor tour title"
);

console.log("  ✅ Hero card clickability & doctor tour modal tests passed.\n");

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: Footer & Bottom Links Audit - Zero href='#' Top-Jump (Request 24)
// ─────────────────────────────────────────────────────────────────────────────
console.log("▶ TEST 3: Footer & Bottom Links Audit Across index.html & clinics.html");

function auditFileLinks(filename, content) {
  const aRegex = /<a\b[^>]*>/gi;
  let match;
  let totalLinks = 0;
  const brokenLinks = [];

  while ((match = aRegex.exec(content)) !== null) {
    totalLinks++;
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']*)["']/i);
    const href = hrefMatch ? hrefMatch[1] : null;

    if (!href || href === "#" || href.trim() === "" || href.startsWith("javascript:void(0)")) {
      brokenLinks.push({ tag, reason: "Empty or rogue '#' jumping to top" });
    } else if (href.startsWith("#")) {
      const targetId = href.substring(1);
      const idExists = new RegExp(`id=["']${targetId}["']`, "i").test(content) ||
                       new RegExp(`name=["']${targetId}["']`, "i").test(content);
      if (!idExists) {
        brokenLinks.push({ tag, reason: `Target #${targetId} does not exist in ${filename}` });
      }
    }
  }

  return { totalLinks, brokenLinks };
}

// Audit app/index.html
const indexAudit = auditFileLinks("index.html", indexHtmlContent);
console.log(`  index.html: Found ${indexAudit.totalLinks} links, ${indexAudit.brokenLinks.length} broken/rogue links.`);
assert.strictEqual(
  indexAudit.brokenLinks.length,
  0,
  `index.html must have 0 broken or href='#' links. Found: ${JSON.stringify(indexAudit.brokenLinks)}`
);

// Audit app/clinics.html
const clinicsAudit = auditFileLinks("clinics.html", clinicsHtmlContent);
console.log(`  clinics.html: Found ${clinicsAudit.totalLinks} links, ${clinicsAudit.brokenLinks.length} broken/rogue links.`);
assert.strictEqual(
  clinicsAudit.brokenLinks.length,
  0,
  `clinics.html must have 0 broken or href='#' links. Found: ${JSON.stringify(clinicsAudit.brokenLinks)}`
);

// Verify universal empty-hash jump prevention event listeners
assert.ok(
  doctorTourJsContent.includes('href === "#"'),
  "doctor-tour.js must have empty-hash event prevention guard for index.html"
);
assert.ok(
  clinicsHtmlContent.includes('href === "#"'),
  "clinics.html must have empty-hash event prevention guard"
);

console.log("  ✅ All footer and bottom links verified clean and non-broken.\n");

console.log("==================================================================");
console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! (Requests 22, 23, and 24)");
console.log("==================================================================");
