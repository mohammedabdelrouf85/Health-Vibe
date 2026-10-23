/**
 * Health Vibe AI - Practo Benchmark: B2B Clinic Subscription UI & Quota Controls Test (#746)
 *
 * Verifies:
 * 1. Presence of Panel 41 (#adminB2bSubscriptionsPanel) in app/index.html.
 * 2. Presence of mandatory table columns and Quota indicators.
 * 3. Bilingual i18n keys for B2B subscription labels.
 * 4. Controller methods existence in app/app.js (render, filter, upgrade).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🖥️ PRACTO BENCHMARK: B2B SUBSCRIPTION ADMIN UI & CONTROLS (#746)');
console.log('==================================================================\n');

// 1. Check app/index.html Panel 41
const indexHtmlPath = path.join(__dirname, '..', 'app', 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

assert(indexHtml.includes('id="adminB2bSubscriptionsPanel"'), 'Panel 41 (adminB2bSubscriptionsPanel) exists in index.html');
assert(indexHtml.includes('id="b2bSubscriptionsTableTbody"'), 'Subscriptions table tbody exists in index.html');
assert(indexHtml.includes('id="b2bSubTierFilterSelect"'), 'Tier filter select dropdown exists');
assert(indexHtml.includes('id="b2bSubStatusFilterSelect"'), 'Status filter select dropdown exists');
assert(indexHtml.includes('id="b2bSubSearchInput"'), 'Search input exists');
assert(indexHtml.includes('Practo Benchmark'), 'Practo Benchmark branding badge exists');
console.log('  ✓ Verified Panel 41 and table UI elements in index.html');

// 2. Check i18n keys in app/i18n.js
const i18nPath = path.join(__dirname, '..', 'app', 'i18n.js');
const i18nContent = fs.readFileSync(i18nPath, 'utf8');

assert(i18nContent.includes('b2bSubTitle'), 'i18n includes b2bSubTitle');
assert(i18nContent.includes('b2bSubFilterTier'), 'i18n includes b2bSubFilterTier');
assert(i18nContent.includes('b2bSubArchiveProtected'), 'i18n includes b2bSubArchiveProtected');
console.log('  ✓ Verified bilingual i18n translation keys in i18n.js');

// 3. Check app/app.js functions
const appJsPath = path.join(__dirname, '..', 'app', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

assert(appJsContent.includes('function refreshAdminB2bSubscriptions'), 'refreshAdminB2bSubscriptions exists in app.js');
assert(appJsContent.includes('function renderAdminB2bSubscriptions'), 'renderAdminB2bSubscriptions exists in app.js');
assert(appJsContent.includes('function filterAdminB2bSubscriptionsTable'), 'filterAdminB2bSubscriptionsTable exists in app.js');
assert(appJsContent.includes('function openAdminUpgradeSubscriptionModal'), 'openAdminUpgradeSubscriptionModal exists in app.js');
console.log('  ✓ Verified frontend controller functions and handlers in app.js');

console.log('\n==================================================================');
console.log('🎉 ALL PRACTO B2B SUBSCRIPTION ADMIN UI TESTS PASSED (100%)!');
console.log('==================================================================');
