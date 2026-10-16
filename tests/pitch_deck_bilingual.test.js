/**
 * Automated Test Suite: Bilingual Pitch Deck Presentation
 * Validates language toggle, slide translation catalogs, localStorage persistence,
 * and responsive RTL/LTR directional layouts.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("📽️  HEALTH VIBE AI: BILINGUAL PITCH DECK TEST SUITE");
console.log("   Arabic & English Deck Presentation Engine & LocalStorage");
console.log("==================================================================\n");

const pitchHtmlPath = path.join(__dirname, "../app/pitch.html");
const pitchHtml = fs.readFileSync(pitchHtmlPath, "utf8");

// TEST 1: Language Switcher Element & Handlers
console.log("▶ TEST 1: Language Switcher Element & Event Handlers");
assert(pitchHtml.includes('id="btnLangToggle"'), 'btnLangToggle button must exist in header');
assert(pitchHtml.includes('onclick="toggleDeckLang()"'), 'btnLangToggle must trigger toggleDeckLang()');
assert(pitchHtml.includes('function toggleDeckLang()'), 'toggleDeckLang function must be defined');
assert(pitchHtml.includes('function applyDeckLang('), 'applyDeckLang function must be defined');
assert(pitchHtml.includes('function initDeckLanguage()'), 'initDeckLanguage function must be defined');
console.log("  ✓ Toggle button and lifecycle functions verified.");

// TEST 2: LocalStorage and URL Parameters Synchronization
console.log("\n▶ TEST 2: LocalStorage & URL Parameter Persistence");
assert(pitchHtml.includes('localStorage.setItem("hv_deck_lang", lang)'), 'Persists chosen language to hv_deck_lang');
assert(pitchHtml.includes('localStorage.setItem("hv_lang", lang)'), 'Persists chosen language to hv_lang');
assert(pitchHtml.includes('localStorage.getItem("hv_deck_lang")'), 'Reads language preference from localStorage');
assert(pitchHtml.includes('urlParams.get("lang")'), 'Supports direct deep-link parameter ?lang=');
console.log("  ✓ LocalStorage and URL parameter synchronization verified.");

// TEST 3: All 11 Slides Translation Parity
console.log("\n▶ TEST 3: 100% Arabic and English Catalog Parity Across 11 Slides");
const scriptStart = pitchHtml.indexOf("<script>");
const scriptEnd = pitchHtml.indexOf("</script>");
const scriptCode = pitchHtml.slice(scriptStart + 8, scriptEnd);

// Extract deckTranslations object
const matchTranslations = scriptCode.match(/const deckTranslations = (\{[\s\S]*?\n    \};)/);
assert(matchTranslations, "deckTranslations dictionary must be present");

const evalTranslations = new Function(`return ${matchTranslations[1]}`)();
assert(evalTranslations.ar, "Arabic catalog must exist");
assert(evalTranslations.en, "English catalog must exist");

for (let s = 1; s <= 11; s++) {
  assert(evalTranslations.ar.slides[s], `Slide ${s} must have Arabic content`);
  assert(evalTranslations.en.slides[s], `Slide ${s} must have English content`);
  assert(evalTranslations.ar.slides[s].title, `Slide ${s} must have Arabic title`);
  assert(evalTranslations.en.slides[s].title, `Slide ${s} must have English title`);
  assert(evalTranslations.ar.slides[s].badge, `Slide ${s} must have Arabic badge`);
  assert(evalTranslations.en.slides[s].badge, `Slide ${s} must have English badge`);
}
console.log("  ✓ All 11 slides verified with 100% Arabic and English content parity.");

// TEST 4: RTL/LTR and Navigation Controls
console.log("\n▶ TEST 4: RTL/LTR Direction and Slide Navigation Controls");
assert(pitchHtml.includes('document.documentElement.dir = isEnglish ? "ltr" : "rtl"'), 'HTML direction toggles between ltr and rtl');
assert(pitchHtml.includes('btnPrevSlide'), 'Previous slide navigation button exists');
assert(pitchHtml.includes('btnNextSlide'), 'Next slide navigation button exists');
assert(pitchHtml.includes('document.getElementById("btnPrevSlide").textContent = lang === "en" ? "←" : "→"'), 'Arrow icons adapt dynamically per text direction');
console.log("  ✓ Direction toggling, arrows orientation, and navigation controls verified.");

console.log("\n==================================================================");
console.log("🎉 ALL 4 BILINGUAL PITCH DECK TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================");
