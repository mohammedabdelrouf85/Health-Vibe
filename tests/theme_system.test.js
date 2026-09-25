const fs = require('fs');
const assert = require('assert');
const path = require('path');

console.log('==================================================================');
console.log('🌙 HEALTH VIBE AI: THEME DEFAULT & TOGGLE TEST SUITE');
console.log('   Dark Mode Default, Parity, State Persistence, DOM Synchronization');
console.log('==================================================================\n');

const htmlContent = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/styles.css'), 'utf8');

// 1. Dark Mode Default in HTML and CSS
console.log('▶ TEST 1: Dark Mode Default Setup in HTML and CSS');
assert(htmlContent.includes('<body class="dark">'), 'body must start with class="dark"');
assert(htmlContent.includes('var themeDefaultVersion = "2026-09-25-dark-v5";'), 'HTML has dark-v5 version');
assert(appJsContent.includes('const themeDefaultVersion = "2026-09-25-dark-v5";'), 'app.js has dark-v5 version');
assert(cssContent.includes('--bg: #07191b;'), 'Dark background variable in root');
assert(cssContent.includes('color-scheme: dark;'), 'Color scheme dark');
console.log('  ✓ HTML and CSS default to dark mode tokens and body.dark class.\n');

// 2. Immediate inline theme sync script
console.log('▶ TEST 2: Inline Script for Immediate Body Theme Sync');
assert(htmlContent.includes('localStorage.getItem("hv_theme") || "dark"'), 'Inline script defaults to dark');
assert(htmlContent.includes('document.body.classList.add("dark")'), 'Inline script applies dark class to body');
console.log('  ✓ Immediate theme sync script present in body head to prevent light flashes.\n');

// 3. Theme Toggle Controls & Event Handlers
console.log('▶ TEST 3: Theme Toggle Elements & Handlers');
assert(htmlContent.includes('id="themeToggle"'), 'Floating theme toggle FAB present');
assert(!htmlContent.includes('id="topbarThemeToggle"'), 'Topbar theme toggle removed per user request');
assert(htmlContent.includes('id="siteThemeToggle"'), 'Site nav theme toggle present');
assert(htmlContent.includes('onclick="toggleTheme()"'), 'Theme toggle has onclick handler');
assert(appJsContent.includes('window.toggleTheme = toggleTheme;'), 'toggleTheme exposed on window');
assert(appJsContent.includes('window.applyTheme = applyTheme;'), 'applyTheme exposed on window');
assert(appJsContent.includes('window.initTheme = initTheme;'), 'initTheme exposed on window');
console.log('  ✓ Topbar toggle removed; floating FAB and site toggle active with global exports.\n');

// 4. i18n Key Resolution for Patient Home Screen
console.log('▶ TEST 4: i18n Key Resolution for Screen Title');
const { defaultI18n } = require('../app/i18n.js');
defaultI18n.setLanguage('ar', false);
assert.strictEqual(defaultI18n.t('nav.patient'), 'الرئيسية');
defaultI18n.setLanguage('en', false);
assert.strictEqual(defaultI18n.t('nav.patient'), 'Home');
assert(appJsContent.includes('const navKey = activeScreenName === "patient" ? "home" : activeScreenName;'), 'app.js handles patient -> home mapping');
console.log('  ✓ nav.patient translates to Home/الرئيسية with zero raw key leakage.\n');

console.log('==================================================================');
console.log('🎉 ALL THEME TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================\n');
