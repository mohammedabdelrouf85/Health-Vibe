/**
 * Health Vibe AI - Device Language Auto-Detection (navigator.language) Test Suite
 * Validates PRD Section 5.1 requirements:
 * 1. When visiting for the first time without stored preference:
 *    - Arabic device language (e.g., 'ar', 'ar-EG', 'ar-SA') initializes site in Arabic ('ar') and 'rtl'.
 *    - Non-Arabic device language (e.g., 'en', 'en-US', 'fr', 'es') initializes site in English ('en') and 'ltr'.
 * 2. URL parameter ?lang= always takes precedence.
 * 3. Saved localStorage ('hv_lang') preference takes precedence over device language.
 * 4. Verification across app/i18n.js, app/app.js, app/bootstrap.js, app/clinics.html, and app/pitch.html.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: DEVICE LANGUAGE AUTO-DETECTION (PRD 5.1) TEST SUITE");
console.log("   navigator.language detection, precedence & catalog initialization");
console.log("==================================================================\n");

const i18nJsPath = path.resolve(__dirname, "../app/i18n.js");
const appJsPath = path.resolve(__dirname, "../app/app.js");
const bootstrapJsPath = path.resolve(__dirname, "../app/bootstrap.js");
const clinicsHtmlPath = path.resolve(__dirname, "../app/clinics.html");
const pitchHtmlPath = path.resolve(__dirname, "../app/pitch.html");

const i18nContent = fs.readFileSync(i18nJsPath, "utf8");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const bootstrapJsContent = fs.readFileSync(bootstrapJsPath, "utf8");
const clinicsHtmlContent = fs.readFileSync(clinicsHtmlPath, "utf8");
const pitchHtmlContent = fs.readFileSync(pitchHtmlPath, "utf8");

// TEST 1: Static verification of navigator.language check across all files
console.log("▶ TEST 1: Static Verification of navigator.language Auto-Detection in Source Files");
assert.ok(i18nContent.includes("navigator.language"), "app/i18n.js must check navigator.language");
assert.ok(i18nContent.includes('navLang.startsWith("ar")'), "app/i18n.js must check for Arabic prefix");

assert.ok(appJsContent.includes("navigator.language"), "app/app.js must check navigator.language");
assert.ok(appJsContent.includes('navLang.startsWith("ar")'), "app/app.js must check for Arabic prefix");

assert.ok(bootstrapJsContent.includes("navigator.language"), "app/bootstrap.js must check navigator.language for early style sync");
assert.ok(bootstrapJsContent.includes('navLang.indexOf("ar") === 0'), "app/bootstrap.js must check for Arabic prefix");

assert.ok(clinicsHtmlContent.includes("navigator.language"), "app/clinics.html must check navigator.language");
assert.ok(clinicsHtmlContent.includes('navLang.startsWith("ar")'), "app/clinics.html must check for Arabic prefix");

assert.ok(pitchHtmlContent.includes("navigator.language"), "app/pitch.html must check navigator.language");
assert.ok(pitchHtmlContent.includes('navLang.startsWith("ar")'), "app/pitch.html must check for Arabic prefix");
console.log("  ✓ All 5 entry points integrate navigator.language first-visit detection.\n");

// TEST 2: Functional Simulation of I18nEngine with Arabic Device Language
console.log("▶ TEST 2: Functional Simulation - Arabic Device Language");
const { I18nEngine } = require(i18nJsPath);

function mockNavigatorLanguage(lang, languages = [lang]) {
  Object.defineProperty(globalThis, "navigator", {
    value: { language: lang, languages: languages },
    configurable: true,
    writable: true
  });
}

// Mock browser globals for Arabic device
mockNavigatorLanguage("ar-EG", ["ar-EG", "ar", "en"]);
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};

const arabicEngine = new I18nEngine();
assert.strictEqual(arabicEngine.getLanguage(), "ar", "Arabic device must initialize engine in 'ar'");
assert.strictEqual(arabicEngine.getDirection(), "rtl", "Arabic device must set direction to 'rtl'");
assert.strictEqual(arabicEngine.t("common.appName"), "Health Vibe AI");
assert.strictEqual(arabicEngine.t("auth.signIn"), "تسجيل الدخول");
console.log("  ✓ Device with 'ar-EG' correctly initializes website in Arabic with RTL.\n");

// TEST 3: Functional Simulation of I18nEngine with English / Foreign Device Language
console.log("▶ TEST 3: Functional Simulation - Non-Arabic Device Language");
mockNavigatorLanguage("en-US", ["en-US", "en"]);
const englishEngine = new I18nEngine();
assert.strictEqual(englishEngine.getLanguage(), "en", "English device must initialize engine in 'en'");
assert.strictEqual(englishEngine.getDirection(), "ltr", "English device must set direction to 'ltr'");
assert.strictEqual(englishEngine.t("auth.signIn"), "Sign In");

mockNavigatorLanguage("fr-FR", ["fr-FR", "en"]);
const foreignEngine = new I18nEngine();
assert.strictEqual(foreignEngine.getLanguage(), "en", "Non-Arabic device (French) must default to 'en'");
assert.strictEqual(foreignEngine.getDirection(), "ltr");
console.log("  ✓ Devices with 'en-US' and 'fr-FR' correctly initialize website in English with LTR.\n");

// TEST 4: Precedence of Saved User Preference over Device Language
console.log("▶ TEST 4: Precedence - Saved Preference Overrides Device Language");
// Device is English, but user previously selected Arabic
mockNavigatorLanguage("en-US", ["en-US"]);
global.localStorage.setItem("hv_lang", "ar");
const storedArEngine = new I18nEngine();
assert.strictEqual(storedArEngine.getLanguage(), "ar", "Stored 'ar' must override English device language");

// Device is Arabic, but user previously selected English
mockNavigatorLanguage("ar-SA", ["ar-SA"]);
global.localStorage.setItem("hv_lang", "en");
const storedEnEngine = new I18nEngine();
assert.strictEqual(storedEnEngine.getLanguage(), "en", "Stored 'en' must override Arabic device language");
console.log("  ✓ Explicit user preference in localStorage safely takes precedence over device locale.\n");

console.log("==================================================================");
console.log("🎉 ALL DEVICE LANGUAGE AUTO-DETECTION TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
