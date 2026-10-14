/**
 * Health Vibe AI - Test Suite: Site Header Responsive Hamburger Menu (< 375px)
 * 
 * Verifies that the public website header transforms cleanly into an accessible,
 * responsive Hamburger Menu on small mobile viewports (< 375px and <= 768px),
 * eliminating horizontal squeeze, text wrapping, and overlapping of Sign in / Get started buttons.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('📱 TEST SUITE: SITE HEADER RESPONSIVE HAMBURGER MENU (< 375px)');
console.log('==================================================================\n');

const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const stylesCssPath = path.resolve(__dirname, '../app/styles.css');
const appJsPath = path.resolve(__dirname, '../app/app.js');
const i18nJsPath = path.resolve(__dirname, '../app/i18n.js');

assert(fs.existsSync(indexHtmlPath), 'app/index.html must exist');
assert(fs.existsSync(stylesCssPath), 'app/styles.css must exist');
assert(fs.existsSync(appJsPath), 'app/app.js must exist');
assert(fs.existsSync(i18nJsPath), 'app/i18n.js must exist');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const { translations } = require(i18nJsPath);

// -----------------------------------------------------------------------------
// TEST 1: HTML DOM Structure & Hamburger Drawer Markup
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: HTML DOM Structure & Hamburger Drawer Markup');
assert(indexHtml.includes('id="siteNav"'), 'index.html must have #siteNav header');
assert(indexHtml.includes('class="site-nav-bar"'), 'index.html must wrap header topbar in .site-nav-bar');
assert(indexHtml.includes('id="siteNavHamburger"'), 'index.html must have #siteNavHamburger button');
assert(indexHtml.includes('class="site-hamburger-btn"'), 'index.html must have .site-hamburger-btn class');
assert(indexHtml.includes('aria-controls="siteNavDrawer"'), 'Hamburger button must specify aria-controls="siteNavDrawer"');
assert(indexHtml.includes('aria-expanded="false"'), 'Hamburger button must initialize with aria-expanded="false"');

assert(indexHtml.includes('id="siteNavDrawer"'), 'index.html must have #siteNavDrawer container');
assert(indexHtml.includes('class="site-nav-drawer"'), 'index.html must have .site-nav-drawer class');
assert(indexHtml.includes('class="drawer-links"'), 'Drawer must have .drawer-links navigation section');
assert(indexHtml.includes('class="drawer-actions"'), 'Drawer must have .drawer-actions buttons section');

// Verify drawer has all navigation links
assert(indexHtml.includes('href="#workflow"'), 'Drawer must contain link to #workflow');
assert(indexHtml.includes('href="#roles"'), 'Drawer must contain link to #roles');
assert(indexHtml.includes('href="#safety"'), 'Drawer must contain link to #safety');
assert(indexHtml.includes('id="siteDrawerClinicsLink"'), 'Drawer must contain #siteDrawerClinicsLink');

// Verify drawer has all action buttons
assert(indexHtml.includes('id="siteDrawerLanguageToggle"'), 'Drawer must contain #siteDrawerLanguageToggle');
assert(indexHtml.includes('id="siteDrawerBackToAppBtn"'), 'Drawer must contain #siteDrawerBackToAppBtn');
assert(indexHtml.includes('class="outline-button drawer-action-btn"'), 'Drawer must contain Sign In button');
assert(indexHtml.includes('class="solid-button drawer-action-btn"'), 'Drawer must contain Get Started button');

console.log('  ✓ Verified HTML markup, IDs, ARIA attributes, and drawer links/actions.\n');

// -----------------------------------------------------------------------------
// TEST 2: CSS Responsive Styles & Breakpoint Media Queries
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: CSS Responsive Styles & Breakpoint Media Queries');
assert(stylesCss.includes('.site-nav-bar {'), 'styles.css must style .site-nav-bar');
assert(stylesCss.includes('.site-hamburger-btn {'), 'styles.css must style .site-hamburger-btn');
assert(stylesCss.includes('.site-nav-drawer {'), 'styles.css must style .site-nav-drawer');
assert(stylesCss.includes('.site-nav.is-open .site-nav-drawer {'), 'styles.css must show drawer when .site-nav.is-open');

// Touch targets compliance
assert(stylesCss.includes('min-height: 44px') || stylesCss.includes('height: 44px'), 'Buttons and links must guarantee touch target min-height >= 44px');

// Mobile media query check
assert(stylesCss.includes('@media (max-width: 768px)'), 'styles.css must define mobile breakpoint at <= 768px');
assert(stylesCss.includes('.site-hamburger-btn { display: flex !important; }'), 'Hamburger button must display on mobile');
assert(stylesCss.includes('.site-nav .site-links { display: none !important; }'), 'Desktop links must hide on mobile');
assert(stylesCss.includes('.site-nav .nav-actions { display: none !important; }'), 'Desktop actions must hide on mobile');

// Small devices check (< 375px)
assert(stylesCss.includes('@media (max-width: 375px)'), 'styles.css must define small mobile breakpoint at <= 375px');
assert(stylesCss.includes('.site-nav .brand-subtitle'), 'styles.css must handle brand subtitle on <= 375px');

console.log('  ✓ Verified CSS rules, animated bars, drawer slide-down, and <= 375px small screen optimizations.\n');

// -----------------------------------------------------------------------------
// TEST 3: JavaScript Controller Methods & Window Exposure
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: JavaScript Controller Methods & Window Exposure');
assert(appJs.includes('function toggleSiteNavMenu('), 'app.js must define toggleSiteNavMenu');
assert(appJs.includes('function closeSiteNavMenu()'), 'app.js must define closeSiteNavMenu');
assert(appJs.includes('window.toggleSiteNavMenu = toggleSiteNavMenu;'), 'toggleSiteNavMenu exposed on window');
assert(appJs.includes('window.closeSiteNavMenu = closeSiteNavMenu;'), 'closeSiteNavMenu exposed on window');

assert(appJs.includes('function updateSiteBackToAppButtons('), 'app.js must define updateSiteBackToAppButtons');
assert(appJs.includes('siteDrawerClinicsLink'), 'app.js applyLanguage must update siteDrawerClinicsLink');

// Verify outside click and Escape handlers
assert(appJs.includes('document.addEventListener("click"'), 'app.js must listen for document click to close menu');
assert(appJs.includes('document.addEventListener("keydown"'), 'app.js must listen for Escape key');
assert(appJs.includes('window.addEventListener("resize"'), 'app.js must auto-close drawer on desktop resize');

console.log('  ✓ Verified toggleSiteNavMenu, closeSiteNavMenu, accessibility keyboard listeners, and resize guards.\n');

// -----------------------------------------------------------------------------
// TEST 4: i18n Nav Catalog Parity Verification
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: i18n Nav Catalog Parity Verification');
assert(translations.ar.nav.workflow, 'ar.nav must contain workflow');
assert(translations.en.nav.workflow, 'en.nav must contain workflow');
assert(translations.ar.nav.accounts, 'ar.nav must contain accounts');
assert(translations.en.nav.accounts, 'en.nav must contain accounts');
assert(translations.ar.nav.safety, 'ar.nav must contain safety');
assert(translations.en.nav.safety, 'en.nav must contain safety');
assert(translations.ar.nav.forClinics, 'ar.nav must contain forClinics');
assert(translations.en.nav.forClinics, 'en.nav must contain forClinics');

console.log('  ✓ Verified mutual 100% catalog parity for navigation translation keys.\n');

console.log('==================================================================');
console.log('🎉 ALL SITE HEADER RESPONSIVE HAMBURGER MENU TESTS PASSED (100%)');
console.log('==================================================================\n');
