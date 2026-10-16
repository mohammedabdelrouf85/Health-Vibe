/**
 * Health Vibe AI - PRD Page 11 Tri-Color Clinical Risk System Test Suite
 * Requirement: 50
 * 
 * Validates:
 * 1. Risk Tier Evaluation (Green = Low Risk / مطمئن, Yellow = Caution / يحتاج متابعة, Red = High Risk / متابعة عاجلة)
 * 2. Physiological boundary conditions (SpO2 >= 95%, 90-94%, < 90%)
 * 3. CSS styling, color tokens, and needle positioning for .risk-meter and .pill.risk-*
 * 4. Report generation integration (Header badge and clinical banner)
 * 5. Result screen rendering (Dynamic needle class, badge, summary row)
 * 6. Multilingual i18n dictionary parity (Arabic & English)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🚦 HEALTH VIBE AI: PRD PAGE 11 TRI-COLOR CLINICAL RISK SYSTEM TEST");
console.log("   Green (Low Risk), Yellow (Caution), Red (High Risk)");
console.log("==================================================================\n");

// 1. Setup Environment
global.window = global;
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

const reportsServicePath = path.join(__dirname, "../app/modules/reports/reports-service.js");
const appJsPath = path.join(__dirname, "../app/app.js");
const stylesCssPath = path.join(__dirname, "../app/styles.css");
const i18nPath = path.join(__dirname, "../app/i18n.js");

const ReportsService = require(reportsServicePath);

// Test 1: Algorithm Tier Mapping
console.log("🧪 TEST 1: Clinical Risk Tier Evaluation (All 3 Tiers & Boundaries)");
const getClinicalRiskTier = ReportsService.getClinicalRiskTier;
assert(typeof getClinicalRiskTier === "function", "getClinicalRiskTier must be exported");

// Low Risk cases
const normalCase = { oxygenLevel: 98, priority: "low" };
const lowTierAr = getClinicalRiskTier(normalCase, false);
const lowTierEn = getClinicalRiskTier(normalCase, true);

assert.strictEqual(lowTierAr.tier, "low");
assert.strictEqual(lowTierAr.color, "#18a058");
assert.strictEqual(lowTierAr.badgeClass, "risk-low");
assert.strictEqual(lowTierAr.label, "مطمئن");
assert.strictEqual(lowTierEn.label, "Low Risk");
console.log("   ✓ Low Risk (Green / مطمئن) properly evaluated for SpO2 = 98%");

// Caution cases (SpO2 90-94%)
const cautionCase1 = { oxygenLevel: 94, priority: "routine" };
const cautionCase2 = { oxygenLevel: 90, priority: "medium" };
const cautionTierAr = getClinicalRiskTier(cautionCase1, false);
const cautionTierEn = getClinicalRiskTier(cautionCase2, true);

assert.strictEqual(cautionTierAr.tier, "caution");
assert.strictEqual(cautionTierAr.color, "#d97706");
assert.strictEqual(cautionTierAr.badgeClass, "risk-caution");
assert.strictEqual(cautionTierAr.label, "يحتاج متابعة");
assert.strictEqual(cautionTierEn.label, "Caution");
console.log("   ✓ Caution (Yellow / يحتاج متابعة) properly evaluated for SpO2 in [90%, 94%]");

// High Risk cases (SpO2 < 90% or urgent priority)
const highCase1 = { oxygenLevel: 88, priority: "routine" };
const highCase2 = { oxygenLevel: 96, priority: "urgent" };
const highTierAr = getClinicalRiskTier(highCase1, false);
const highTierEn = getClinicalRiskTier(highCase2, true);

assert.strictEqual(highTierAr.tier, "high");
assert.strictEqual(highTierAr.color, "#dc2626");
assert.strictEqual(highTierAr.badgeClass, "risk-high");
assert.strictEqual(highTierAr.label, "متابعة عاجلة");
assert.strictEqual(highTierEn.label, "High Risk");
console.log("   ✓ High Risk (Red / متابعة عاجلة) properly evaluated for SpO2 < 90% and urgent priority");

// Test 2: CSS Styles Verification
console.log("\n🧪 TEST 2: CSS Color Tokens & Dynamic Risk Meter Needle Positions");
const stylesContent = fs.readFileSync(stylesCssPath, "utf8");

assert(stylesContent.includes(".risk-meter.low span"), "CSS must contain .risk-meter.low span");
assert(stylesContent.includes("left: 15%"), "Low risk needle must be at left: 15%");
assert(stylesContent.includes("#18a058"), "Low risk needle border must be #18a058");

assert(stylesContent.includes(".risk-meter.caution span"), "CSS must contain .risk-meter.caution span");
assert(stylesContent.includes("left: 50%"), "Caution needle must be at left: 50%");
assert(stylesContent.includes("#d97706"), "Caution needle border must be #d97706");

assert(stylesContent.includes(".risk-meter.high span"), "CSS must contain .risk-meter.high span");
assert(stylesContent.includes("left: 85%"), "High risk needle must be at left: 85%");
assert(stylesContent.includes("#dc2626"), "High risk needle border must be #dc2626");

assert(stylesContent.includes(".pill.risk-low"), "CSS must contain .pill.risk-low");
assert(stylesContent.includes(".pill.risk-caution"), "CSS must contain .pill.risk-caution");
assert(stylesContent.includes(".pill.risk-high"), "CSS must contain .pill.risk-high");
console.log("   ✓ CSS tokens, pill badges, and needle coordinates (15%, 50%, 85%) fully verified");

// Test 3: Certified Report HTML Integration
console.log("\n🧪 TEST 3: Certified Report HTML Header Badge & Clinical Banner");
const sampleRecord = {
  id: "case-tier-test-01",
  patientName: "أحمد منصور",
  patientNationalId: "1234567890",
  oxygenLevel: 92,
  symptoms: ["سعال مستمر", "ضيق تنفس خفيف"],
  diagnosis: "نزلة شعبية حادة",
  doctorNotes: "المريض يحتاج متابعة سريرية بعد 48 ساعة واستخدام موسع الشعب.",
  recommendations: ["الراحة التامة", "استخدام البخاخ عند اللزوم"],
  prescriptions: [{ name: "Ventolin Inhaler", dose: "2 puffs Q6H" }],
  doctorIdentity: {
    name: "د. هاني شاكر",
    licenseNumber: "DOC-998811",
    specialty: "استشاري الأمراض الصدرية",
    clinic: "عيادة الصدرية التخصصية"
  }
};

const reportHtmlAr = ReportsService.generateCertifiedReportPdfHtml(sampleRecord, false);
const reportHtmlEn = ReportsService.generateCertifiedReportPdfHtml(sampleRecord, true);

// Verify Arabic Banner and Header Badge
assert(reportHtmlAr.includes("risk-badge-caution"), "Arabic report must include caution risk badge");
assert(reportHtmlAr.includes("يحتاج متابعة"), "Arabic report must include 'يحتاج متابعة'");
assert(reportHtmlAr.includes("prd-risk-banner"), "Arabic report must include PRD risk banner");
assert(reportHtmlAr.includes("مستوى الخطورة السريرية (PRD صفحة 11)"), "Arabic report banner title present");

// Verify English Banner and Header Badge
assert(reportHtmlEn.includes("risk-badge-caution"), "English report must include caution risk badge");
assert(reportHtmlEn.includes("Caution"), "English report must include 'Caution'");
assert(reportHtmlEn.includes("Clinical Risk Tier (PRD Page 11)"), "English report banner title present");
console.log("   ✓ Certified Report HTML generates PRD Page 11 Risk Banner & Header Badges");

// Test 4: app.js Result Screen Integration
console.log("\n🧪 TEST 4: app.js Result Screen Integration & Fallback");
const appJsContent = fs.readFileSync(appJsPath, "utf8");

assert(appJsContent.includes("function getClinicalRiskTier"), "app.js must define getClinicalRiskTier");
assert(appJsContent.includes("window.getClinicalRiskTier = getClinicalRiskTier"), "app.js must expose window.getClinicalRiskTier");
assert(appJsContent.includes("class=\"risk-meter ${escapeHtml(riskTier.meterClass || riskTier.tier)}\""), "Result screen must set dynamic risk meter class");
assert(appJsContent.includes("class=\"pill ${escapeHtml(riskTier.badgeClass)}\""), "Result screen must render risk pill badge");
assert(appJsContent.includes("Clinical Risk Tier (PRD p.11)"), "Result screen must render PRD Page 11 clinical risk row");
console.log("   ✓ app.js renderResultScreen verified for dynamic meter class, pill badge, and summary row");

// Test 5: i18n Dictionary Verification
console.log("\n🧪 TEST 5: i18n Translation Dictionary Parity");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

assert(i18nContent.includes("riskLow: \"مطمئن\""), "i18n Arabic must contain riskLow");
assert(i18nContent.includes("riskCaution: \"يحتاج متابعة\""), "i18n Arabic must contain riskCaution");
assert(i18nContent.includes("riskHigh: \"متابعة عاجلة\""), "i18n Arabic must contain riskHigh");
assert(i18nContent.includes("riskLow: \"Low Risk\""), "i18n English must contain riskLow");
assert(i18nContent.includes("riskCaution: \"Caution\""), "i18n English must contain riskCaution");
assert(i18nContent.includes("riskHigh: \"High Risk\""), "i18n English must contain riskHigh");
console.log("   ✓ i18n dictionary has 100% parity for PRD Page 11 risk keys");

console.log("\n==================================================================");
console.log("🎉 ALL 5 PRD PAGE 11 TRI-COLOR RISK SYSTEM TESTS PASSED (100%)!");
console.log("==================================================================");
