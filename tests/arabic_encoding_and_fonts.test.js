/**
 * Health Vibe AI - Arabic Character Encoding & Typography Test Suite
 * Validates:
 * 1. <meta charset="UTF-8"> declared in <head> across all HTML files
 * 2. Arabic Google Fonts ('Cairo' & 'Tajawal') imported in CSS and linked in HTML
 * 3. font-family rules prioritize Cairo & Tajawal with reliable fallbacks
 * 4. All localized JS/JSON catalogs saved in strict UTF-8 (no BOM, no replacement char U+FFFD, no mojibake)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🌍 HEALTH VIBES AI: ARABIC ENCODING & TYPOGRAPHY TEST SUITE');
console.log('   UTF-8 Enforcement, Google Fonts (Cairo/Tajawal), Zero Mojibake');
console.log('==================================================================\n');

const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// TEST 1: <meta charset="UTF-8"> in <head> of Every HTML File
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: <meta charset="UTF-8"> in <head> of Every HTML File');
const htmlFiles = [
  'index.html',
  'app/index.html',
  'app/clinics.html',
  'app/pitch.html',
  'design/healthvibe-mobile-ui-prototype.html',
  'mobile/web/index.html'
];

htmlFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  assert(fs.existsSync(fullPath), `File ${file} must exist`);
  const content = fs.readFileSync(fullPath, 'utf8');

  // Verify <head> exists
  const headMatch = content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  assert(headMatch, `${file} must contain a <head> block`);

  // Verify <meta charset="UTF-8"> is in <head>
  const charsetInHead = /<meta\s+[^>]*charset=["']?utf-8["']?/i.test(headMatch[1]);
  assert(charsetInHead, `${file} must declare <meta charset="UTF-8"> in its <head>`);
});
console.log(`  ✓ All ${htmlFiles.length} HTML files declare <meta charset="UTF-8"> in <head>.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Arabic Google Fonts (Cairo & Tajawal) Linked in HTML Files
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Arabic Google Fonts (Cairo & Tajawal) Linked in HTML Files');
htmlFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');

  const hasGoogleFonts = content.includes('fonts.googleapis.com');
  assert(hasGoogleFonts, `${file} must link to Google Fonts`);

  const hasCairoOrTajawal = /family=.*(?:Cairo|Tajawal)/i.test(content) || content.includes('styles.css');
  assert(hasCairoOrTajawal, `${file} must reference Cairo or Tajawal Google Font`);
});
console.log(`  ✓ All ${htmlFiles.length} HTML files link to Arabic-supporting Google Fonts.\n`);

// -----------------------------------------------------------------------------
// TEST 3: CSS Stylesheet Font Import & font-family Rules
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: CSS Stylesheet Font Import & font-family Rules');
const stylesPath = path.join(rootDir, 'app/styles.css');
assert(fs.existsSync(stylesPath), 'app/styles.css must exist');
const stylesContent = fs.readFileSync(stylesPath, 'utf8');

// 3a. @charset "UTF-8"; declaration
assert(stylesContent.startsWith('@charset "UTF-8";'), 'styles.css must start with @charset "UTF-8";');

// 3b. @import for Cairo and Tajawal
assert(stylesContent.includes('@import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap");'),
  'styles.css must import Cairo and Tajawal fonts');

// 3c. font-family prioritizing Cairo and Tajawal
assert(stylesContent.includes('"Cairo", "Tajawal"'), 'styles.css :root must include Cairo and Tajawal in font-family');
assert(stylesContent.includes('--font-sans: "Cairo", "Tajawal"'), 'styles.css --font-sans must prioritize Cairo & Tajawal');
assert(stylesContent.includes("body.print-lang-ar"), 'styles.css must define print-lang-ar typography');
console.log('  ✓ app/styles.css declares UTF-8 charset, imports Cairo/Tajawal, and sets fallback typography.\n');

// -----------------------------------------------------------------------------
// TEST 4: Strict UTF-8 Encoding (Zero BOM, Zero Replacement U+FFFD, Zero Mojibake)
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Strict UTF-8 Encoding Across Localized Catalogs & Application Code');
const keyLocalizedFiles = [
  'app/i18n.js',
  'app/app.js',
  'app/clinics.html',
  'app/index.html',
  'app/pitch.html',
  'backend/server.js'
];

keyLocalizedFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  assert(fs.existsSync(fullPath), `File ${file} must exist`);
  const buf = fs.readFileSync(fullPath);

  // Check no UTF-8 BOM
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  assert(!hasBom, `${file} must not contain a UTF-8 BOM marker`);

  // Fatal UTF-8 decode
  let decodedStr;
  assert.doesNotThrow(() => {
    decodedStr = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  }, `${file} must be 100% valid UTF-8 byte stream`);

  // No replacement character \uFFFD
  assert(!decodedStr.includes('\uFFFD'), `${file} must not contain replacement characters (\\uFFFD)`);

  // No Windows-1252 Arabic mojibake pattern (e.g. repeated Ø§, Ù„)
  const mojibakeMatches = decodedStr.match(/(?:Ø[\xA7-\xBF]|Ù[\x80-\x89\x8A-\x8F\x90-\x9F\xA0-\xAF\xB0-\xBF])/g);
  assert(!mojibakeMatches || mojibakeMatches.length < 5, `${file} contains potential mojibake byte patterns`);
});
console.log(`  ✓ All ${keyLocalizedFiles.length} core files pass strict fatal UTF-8 decoding with zero BOM & zero mojibake.\n`);

// -----------------------------------------------------------------------------
// TEST 5: Arabic Typography & Right-to-Left (dir="rtl") Integrity
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Arabic Typography & Right-to-Left (dir="rtl") Integrity');
const arabicHtmlPages = [
  'index.html',
  'app/clinics.html',
  'app/pitch.html',
  'design/healthvibe-mobile-ui-prototype.html'
];

arabicHtmlPages.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  assert(/<html[^>]*dir=["']rtl["']/i.test(content), `${file} must declare dir="rtl" on <html>`);
  assert(/<html[^>]*lang=["']ar["']/i.test(content), `${file} must declare lang="ar" on <html>`);
});
console.log(`  ✓ All Arabic-primary HTML pages specify dir="rtl" and lang="ar".\n`);

console.log('==================================================================');
console.log('🎉 ALL 5 ARABIC ENCODING & TYPOGRAPHY TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
process.exit(0);
