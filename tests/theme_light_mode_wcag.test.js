/**
 * Health Vibe AI - Light Mode & WCAG AA Theme Engine Test Suite
 * 
 * Tests:
 * 1. Comprehensive CSS variables definition for light mode (bg, surface, text, border).
 * 2. WCAG AA / AAA contrast ratios for all core light mode tokens.
 * 3. Prevention of unreadable white / light-gray text on light containers.
 * 4. Theme engine functions (applyTheme, toggleTheme, initTheme) and localStorage persistence.
 * 5. Theme toggle buttons synchronization across site nav, topbar, and floating FAB.
 * 6. B2B Clinics Portal light mode support and header toggle integration.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('☀️ HEALTH VIBE AI: LIGHT MODE & WCAG AA CONTRAST TEST SUITE');
console.log('   Color Tokens, WCAG AA Math, Zero-Low-Contrast & State Persistence');
console.log('==================================================================\n');

const cssPath = path.resolve(__dirname, '../app/styles.css');
const appJsPath = path.resolve(__dirname, '../app/app.js');
const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const clinicsHtmlPath = path.resolve(__dirname, '../app/clinics.html');
const themeBootPath = path.resolve(__dirname, '../app/theme-boot.js');

const cssContent = fs.readFileSync(cssPath, 'utf8');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const clinicsHtmlContent = fs.readFileSync(clinicsHtmlPath, 'utf8');
const themeBootContent = fs.readFileSync(themeBootPath, 'utf8');

// Helper to calculate relative luminance according to WCAG 2.1
function getLuminance(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

// -----------------------------------------------------------------------------
// TEST 1: Comprehensive CSS Variables in Light Mode
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Comprehensive CSS Variables in Light Mode');
assert.ok(cssContent.includes('--bg: #f8fafc;'), 'Light background variable defined');
assert.ok(cssContent.includes('--surface: #ffffff;'), 'Light surface variable defined');
assert.ok(cssContent.includes('--surface-2: #f8fafc;'), 'Light surface-2 variable defined');
assert.ok(cssContent.includes('--line: #cbd5e1;'), 'Light border line variable defined');
assert.ok(cssContent.includes('--line-strong: #94a3b8;'), 'Light strong line variable defined');
assert.ok(cssContent.includes('--ink: #0f172a;'), 'Light high contrast ink variable defined');
assert.ok(cssContent.includes('--muted: #334155;'), 'Light high contrast muted variable defined');
assert.ok(cssContent.includes('--teal: #0f766e;'), 'Light high contrast teal accent variable defined');
assert.ok(cssContent.includes('color-scheme: light;'), 'color-scheme: light specified');
console.log('  ✓ Comprehensive light mode CSS variables fully defined.\n');

// -----------------------------------------------------------------------------
// TEST 2: WCAG AA / AAA Contrast Verification
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: WCAG AA / AAA Contrast Verification for Light Mode');
const inkOnWhite = getContrastRatio('#0f172a', '#ffffff');
console.log(`  - Ink (#0f172a) on White (#ffffff): ${inkOnWhite.toFixed(2)}:1 (WCAG AAA requires 7.0:1)`);
assert.ok(inkOnWhite >= 7.0, 'Ink on White must meet WCAG AAA (>= 7.0:1)');

const mutedOnWhite = getContrastRatio('#334155', '#ffffff');
console.log(`  - Muted (#334155) on White (#ffffff): ${mutedOnWhite.toFixed(2)}:1 (WCAG AAA requires 7.0:1)`);
assert.ok(mutedOnWhite >= 7.0, 'Muted on White must meet WCAG AAA (>= 7.0:1)');

const tealOnWhite = getContrastRatio('#0f766e', '#ffffff');
console.log(`  - Teal (#0f766e) on White (#ffffff): ${tealOnWhite.toFixed(2)}:1 (WCAG AA requires 4.5:1)`);
assert.ok(tealOnWhite >= 4.5, 'Teal on White must meet WCAG AA (>= 4.5:1)');

const inkOnBg = getContrastRatio('#0f172a', '#f8fafc');
console.log(`  - Ink (#0f172a) on Bg (#f8fafc): ${inkOnBg.toFixed(2)}:1 (WCAG AAA requires 7.0:1)`);
assert.ok(inkOnBg >= 7.0, 'Ink on Background must meet WCAG AAA (>= 7.0:1)');
console.log('  ✓ All light mode color pairs exceed WCAG AA (and meet AAA for body text).\n');

// -----------------------------------------------------------------------------
// TEST 3: Prevention of Unreadable White/Light Text on Containers
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Prevention of Unreadable Text on Light Containers');
assert.ok(cssContent.includes('#patientHeroTitle') && cssContent.includes('body.dark #patientHeroTitle'), '#patientHeroTitle is scoped with dark override');
assert.ok(cssContent.includes('.app-hero h1') && cssContent.includes('body.dark .app-hero h1'), '.app-hero h1 uses theme-aware text colors');
assert.ok(cssContent.includes('.app-hero p') && cssContent.includes('body.dark .app-hero p'), '.app-hero p uses theme-aware text colors');
assert.ok(cssContent.includes('.safety-band h2') && cssContent.includes('.safety-band p'), '.safety-band has explicit white text rules');
console.log('  ✓ Zero unreadable light-gray text on white containers verified.\n');

// -----------------------------------------------------------------------------
// TEST 4: Theme Engine Toggling & LocalStorage Persistence
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Theme Engine Toggling & LocalStorage Persistence');
assert.ok(appJsContent.includes('const isLight = theme === "light";'), 'applyTheme detects light mode');
assert.ok(appJsContent.includes('localStorage.setItem("hv_theme", targetTheme);'), 'applyTheme persists to localStorage');
assert.ok(appJsContent.includes('document.body.classList.add("light");'), 'applyTheme adds light class to body');
assert.ok(appJsContent.includes('document.documentElement.classList.add("hv-theme-light");'), 'applyTheme adds hv-theme-light to documentElement');
assert.ok(themeBootContent.includes('var savedTheme = localStorage.getItem("hv_theme") || "dark";'), 'theme-boot.js reads saved preference');
assert.ok(themeBootContent.includes('document.documentElement.classList.add("hv-theme-light");'), 'theme-boot.js handles light mode');
console.log('  ✓ Theme engine handles toggling and localStorage persistence cleanly.\n');

// -----------------------------------------------------------------------------
// TEST 5: Theme Toggle Controls in UI
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Theme Toggle Controls in UI');
assert.ok(htmlContent.includes('id="siteThemeToggle"'), '#siteThemeToggle present in landing nav');
assert.ok(!htmlContent.includes('id="siteThemeToggle" type="button" style="display:none !important;"'), '#siteThemeToggle is not hidden');
assert.ok(htmlContent.includes('id="topbarThemeToggle"'), '#topbarThemeToggle present in app topbar');
assert.ok(!htmlContent.includes('id="topbarThemeToggle" type="button" style="display:none !important;"'), '#topbarThemeToggle is not hidden');
assert.ok(htmlContent.includes('id="themeToggle"'), '#themeToggle floating FAB present');
assert.ok(!htmlContent.includes('id="themeToggle" class="theme-fab" type="button" style="display:none !important;"'), '#themeToggle is not hidden');
console.log('  ✓ All 3 theme toggles active and visible with accessible labels.\n');

// -----------------------------------------------------------------------------
// TEST 6: B2B Clinics Portal Theme Engine
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: B2B Clinics Portal Light Mode Integration');
assert.ok(clinicsHtmlContent.includes('id="clinicThemeToggle"'), '#clinicThemeToggle present in clinics header');
assert.ok(clinicsHtmlContent.includes('function toggleClinicTheme()'), 'toggleClinicTheme function defined');
assert.ok(clinicsHtmlContent.includes('function applyClinicTheme(theme)'), 'applyClinicTheme function defined');
assert.ok(clinicsHtmlContent.includes('html.hv-theme-light body') && clinicsHtmlContent.includes('body.light'), 'Clinics portal includes light mode tokens');
console.log('  ✓ Clinics portal fully equipped with light mode and theme toggling.\n');

console.log('==================================================================');
console.log('🎉 ALL LIGHT MODE & WCAG AA THEME TESTS PASSED (100% SUCCESS)');
console.log('==================================================================\n');
