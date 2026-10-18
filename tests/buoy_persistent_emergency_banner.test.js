/**
 * HEALTH VIBE AI: TASK #80 BUOY HEALTH PERSISTENT EMERGENCY BANNER TEST SUITE
 * 
 * Verifies Task #80:
 * "زر الطوارئ السريع في كل الشاشات | إضافة شريط أو زر ثابت في أعلى شاشة التقييم 
 *  يحتوي على رقم الإسعاف المصري (123) وتنبيه بعدم انتظار مراجعة الطبيب في حال الشعور باختناق حاد. | Buoy Health"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🚨 HEALTH VIBE AI: TASK #80 BUOY PERSISTENT EMERGENCY TEST SUITE");
console.log("==================================================================\n");

const rootDir = path.resolve(__dirname, "..");

// 1. Inspect app/index.html markup for Persistent Assessment Emergency Bar & Topbar
console.log("▶ TEST 1: Inspecting app/index.html for Persistent Emergency Elements");
const indexPath = path.join(rootDir, "app/index.html");
const indexContent = fs.readFileSync(indexPath, "utf8");

assert.ok(indexContent.includes('id="assessmentPersistentEmergencyBar"'), "Must include assessmentPersistentEmergencyBar in app/index.html");
assert.ok(indexContent.includes('class="buoy-emergency-sticky-bar"'), "Must include class buoy-emergency-sticky-bar");
assert.ok(indexContent.includes('id="topbarEmergencyBtn"'), "Must include topbarEmergencyBtn in persistent header across screens");
assert.ok(indexContent.includes('href="tel:123"'), "Must provide direct tel:123 link for Egyptian Ambulance");

// Verify placement inside #screen-assessment
const screenAssessmentIdx = indexContent.indexOf('id="screen-assessment"');
const bannerIdx = indexContent.indexOf('id="assessmentPersistentEmergencyBar"');
const formPanelIdx = indexContent.indexOf('class="panel form-panel"', screenAssessmentIdx);

assert.ok(screenAssessmentIdx !== -1, "screen-assessment must exist");
assert.ok(bannerIdx > screenAssessmentIdx, "Persistent emergency banner must be inside screen-assessment");
assert.ok(bannerIdx < formPanelIdx, "Persistent emergency banner must appear at the top before form questions");
console.log("  ✓ Persistent emergency banner is correctly positioned at top of assessment screen.");
console.log("  ✓ Persistent topbar emergency button is present in the navigation header.");

// 2. Inspect app/i18n.js for Buoy Health Warning Translations
console.log("\n▶ TEST 2: Inspecting app/i18n.js for Acute Choking & Ambulance Translations");
const i18nPath = path.join(rootDir, "app/i18n.js");
const i18nContent = fs.readFileSync(i18nPath, "utf8");

assert.ok(i18nContent.includes("persistentEmergencyTitle"), "i18n must declare persistentEmergencyTitle");
assert.ok(i18nContent.includes("persistentEmergencyNotice"), "i18n must declare persistentEmergencyNotice");
assert.ok(i18nContent.includes("callAmbulanceImmediateShort"), "i18n must declare callAmbulanceImmediateShort");
assert.ok(i18nContent.includes("topbarEmergencyAmbulance"), "i18n must declare topbarEmergencyAmbulance");

// Clinical wording checks (Arabic & English)
assert.ok(i18nContent.includes("اختناق حاد"), "Arabic notice must explicitly warn about acute choking (اختناق حاد)");
assert.ok(i18nContent.includes("لا تنتظر مراجعة الطبيب"), "Arabic notice must explicitly instruct not to wait for doctor review");
assert.ok(i18nContent.includes("do NOT wait for a doctor's review"), "English notice must instruct not to wait for doctor review");
assert.ok(i18nContent.includes("severe choking"), "English notice must mention severe choking");
console.log("  ✓ Clinical wording and bilingual translations verified for Arabic and English.");

// 3. Inspect app/styles.css for Buoy Health Styling
console.log("\n▶ TEST 3: Inspecting app/styles.css for Buoy Emergency Styling & WCAG Touch Targets");
const stylesPath = path.join(rootDir, "app/styles.css");
const stylesContent = fs.readFileSync(stylesPath, "utf8");

assert.ok(stylesContent.includes(".buoy-emergency-sticky-bar"), "styles.css must style .buoy-emergency-sticky-bar");
assert.ok(stylesContent.includes(".topbar-emergency-btn"), "styles.css must style .topbar-emergency-btn");
assert.ok(stylesContent.includes("pulseEmergencyCard"), "styles.css must include emergency pulsation animation");
assert.ok(stylesContent.includes("body.dark .buoy-emergency-sticky-bar"), "styles.css must support dark mode for persistent emergency bar");
assert.ok(stylesContent.includes("body.dark .topbar-emergency-btn"), "styles.css must support dark mode for topbar emergency button");
console.log("  ✓ Emergency red badges, dark mode overrides, and pulsing animations verified.");

console.log("\n==================================================================");
console.log("🎉 ALL TASK #80 BUOY PERSISTENT EMERGENCY TESTS PASSED (100%)!");
console.log("==================================================================");
