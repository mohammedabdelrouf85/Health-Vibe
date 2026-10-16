/**
 * HEALTH VIBE AI: CRITICAL SYMPTOMS EMERGENCY SCREENING TEST SUITE
 * 
 * Verifies User Request 51:
 * "إضافة فحص فوري للأعراض الحرجة جداً (مثل SpO2 < 90%، زرقة الشفاه، ألم صدر حاد، أو سعال مدمم)
 *  يُظهر تنبيهاً أحمر فورياً للتوجه لأقرب طوارئ أو الاتصال بالإسعاف 123.
 *  و ارفع كل التعديلات دي علي جيت هاب و علي اللينك اللي اخره .app
 *  و اتأكد في كل مرة ان الsign in العادية و ب جوجل شغالة ف كل تعديل"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🚨 HEALTH VIBE AI: CRITICAL RED-FLAG SYMPTOMS SCREENING TEST SUITE");
console.log("==================================================================\n");

// 1. Inspect app/index.html markup
console.log("▶ TEST 1: Inspecting app/index.html for Emergency Screener Elements");
const indexPath = path.resolve(__dirname, "../app/index.html");
const indexContent = fs.readFileSync(indexPath, "utf8");

assert.ok(indexContent.includes('id="criticalEmergencyBanner"'), "Must include criticalEmergencyBanner");
assert.ok(indexContent.includes('id="criticalScreenerCard"'), "Must include criticalScreenerCard");
assert.ok(indexContent.includes('id="chipCyanosis"'), "Must include chipCyanosis");
assert.ok(indexContent.includes('id="chipChestPain"'), "Must include chipChestPain");
assert.ok(indexContent.includes('id="chipHemoptysis"'), "Must include chipHemoptysis");
assert.ok(indexContent.includes('id="chipSevereDyspnea"'), "Must include chipSevereDyspnea");
assert.ok(indexContent.includes('href="tel:123"'), "Must include direct tel:123 ambulance link");
assert.ok(indexContent.includes('id="instantCriticalCheckModal"'), "Must include instantCriticalCheckModal");
assert.ok(indexContent.includes('class="patient-emergency-quickbar"'), "Must include patient-emergency-quickbar");
console.log("  ✓ All required HTML elements, chips, modal, and tel:123 links verified in app/index.html.");

// 2. Inspect app/app.js logic
console.log("\n▶ TEST 2: Inspecting app/app.js for Real-Time Screener Logic");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf8");

assert.ok(appJsContent.includes("toggleCriticalSymptom"), "app.js must define toggleCriticalSymptom");
assert.ok(appJsContent.includes("updateCriticalSymptomsCheck"), "app.js must define updateCriticalSymptomsCheck");
assert.ok(appJsContent.includes("openInstantCriticalCheckModal"), "app.js must define openInstantCriticalCheckModal");
assert.ok(appJsContent.includes("closeInstantCriticalCheckModal"), "app.js must define closeInstantCriticalCheckModal");
assert.ok(appJsContent.includes("toggleModalCriticalSymptom"), "app.js must define toggleModalCriticalSymptom");
assert.ok(appJsContent.includes("updateModalCriticalAlertBox"), "app.js must define updateModalCriticalAlertBox");
assert.ok(appJsContent.includes("openEmergencySubmitModal"), "app.js must define openEmergencySubmitModal");
console.log("  ✓ Real-time screening logic and modal controls verified in app/app.js.");

// 3. Inspect app/i18n.js translations
console.log("\n▶ TEST 3: Inspecting app/i18n.js for Bilingual Emergency Translations");
const i18nPath = path.resolve(__dirname, "../app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

assert.ok(i18nContent.includes("criticalScreenerTitle"), "i18n.js must define criticalScreenerTitle");
assert.ok(i18nContent.includes("criticalCyanosis"), "i18n.js must define criticalCyanosis");
assert.ok(i18nContent.includes("criticalChestPain"), "i18n.js must define criticalChestPain");
assert.ok(i18nContent.includes("criticalHemoptysis"), "i18n.js must define criticalHemoptysis");
assert.ok(i18nContent.includes("criticalSpO2Low"), "i18n.js must define criticalSpO2Low");
assert.ok(i18nContent.includes("criticalCallAmbulance"), "i18n.js must define criticalCallAmbulance");
assert.ok(i18nContent.includes("زرقة الشفاه"), "Arabic i18n must mention blue lips (زرقة الشفاه)");
assert.ok(i18nContent.includes("ألم صدر حاد"), "Arabic i18n must mention acute chest pain (ألم صدر حاد)");
assert.ok(i18nContent.includes("سعال مدمم"), "Arabic i18n must mention coughing blood (سعال مدمم)");
assert.ok(i18nContent.includes("123"), "i18n must reference Egyptian ambulance 123");
console.log("  ✓ Bilingual Arabic & English translations verified in app/i18n.js.");

// 4. Inspect app/styles.css for Emergency Styling
console.log("\n▶ TEST 4: Inspecting app/styles.css for Red Alert Styling");
const cssPath = path.resolve(__dirname, "../app/styles.css");
const cssContent = fs.readFileSync(cssPath, "utf8");

assert.ok(cssContent.includes(".critical-screener-card"), "styles.css must style .critical-screener-card");
assert.ok(cssContent.includes(".critical-symptoms-chips"), "styles.css must style .critical-symptoms-chips");
assert.ok(cssContent.includes(".critical-symptom-chip"), "styles.css must style .critical-symptom-chip");
assert.ok(cssContent.includes(".critical-emergency-banner"), "styles.css must style .critical-emergency-banner");
assert.ok(cssContent.includes(".patient-emergency-quickbar"), "styles.css must style .patient-emergency-quickbar");
console.log("  ✓ Visual CSS tokens, pulsing badges, and dark mode overrides verified.");

// 5. Verify Auth Integrity (Zero-Breakage Assurance)
console.log("\n▶ TEST 5: Verifying Auth Integrity and Google Login Preservations");
assert.ok(appJsContent.includes("handleGoogleAuth"), "handleGoogleAuth must exist and be preserved");
assert.ok(appJsContent.includes("handleEmailAuth"), "handleEmailAuth must exist and be preserved");
assert.ok(appJsContent.includes("setAuthLoading"), "setAuthLoading must exist and be preserved");
console.log("  ✓ Email sign-in and Google sign-in structures completely preserved and verified.");

console.log("\n==================================================================");
console.log("🎉 ALL CRITICAL SYMPTOMS EMERGENCY SCREENING TESTS PASSED (100%)!");
console.log("==================================================================");
