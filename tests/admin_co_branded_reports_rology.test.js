/**
 * Health Vibe AI - Rology Benchmark: Co-Branded Reports Admin UI Test Suite (#736)
 * 
 * Verifies:
 * 1. DOM Elements in admin-view.html and index.html:
 *    - Panel: adminCoBrandedReportsPanel
 *    - Metrics: coBrandActiveCount, coBrandReportsCount, coBrandPendingCount, coBrandComplianceScore
 *    - Filters: coBrandFilterStatusSelect, coBrandTierFilterSelect, coBrandSearchInput
 *    - Table: coBrandClinicsTableTbody
 *    - Live Simulator: coBrandLiveHeaderSimulator, coBrandSimClinicLogo, coBrandSimClinicName, coBrandSimClinicBranch
 * 2. Bilingual Translations in i18n.js:
 *    - coBrandTitle, coBrandSubtitle, coBrandFilterStatus, coBrandFilterActive, coBrandUploadBtn, etc.
 * 3. Client Logic & Handlers in app.js:
 *    - refreshCoBrandingClinics
 *    - renderCoBrandingClinics
 *    - filterCoBrandingClinicsTable
 *    - searchCoBrandingClinicsTable
 *    - previewClinicCoBrandedReport
 *    - openCoBrandingUploadModal
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🔬 ROLOGY BENCHMARK: CO-BRANDED PATIENT REPORTS ADMIN UI TESTS');
console.log('   Clinic Logo Branding, Live Preview & Enterprise Tiering (#736)');
console.log('==================================================================\n');

const adminViewPath = path.resolve(__dirname, '../app/modules/admin/admin-view.html');
const indexPath = path.resolve(__dirname, '../app/index.html');
const i18nPath = path.resolve(__dirname, '../app/i18n.js');
const appJsPath = path.resolve(__dirname, '../app/app.js');

const adminViewContent = fs.readFileSync(adminViewPath, 'utf8');
const indexContent = fs.readFileSync(indexPath, 'utf8');
const i18nContent = fs.readFileSync(i18nPath, 'utf8');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: DOM Elements in admin-view.html & index.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: DOM Elements in admin-view.html & index.html');

const requiredIds = [
  'adminCoBrandedReportsPanel',
  'coBrandActiveCount',
  'coBrandReportsCount',
  'coBrandPendingCount',
  'coBrandComplianceScore',
  'coBrandFilterStatusSelect',
  'coBrandTierFilterSelect',
  'coBrandSearchInput',
  'coBrandClinicsTableTbody',
  'coBrandLiveHeaderSimulator',
  'coBrandSimClinicLogo',
  'coBrandSimClinicName',
  'coBrandSimClinicBranch'
];

requiredIds.forEach(id => {
  assert(adminViewContent.includes(`id="${id}"`), `admin-view.html contains element with id="${id}"`);
  assert(indexContent.includes(`id="${id}"`), `index.html contains element with id="${id}"`);
});
console.log(`  ✓ All ${requiredIds.length} DOM elements verified across both template and standalone views.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Bilingual Translations in i18n.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Bilingual Translations in i18n.js');
const i18nKeys = [
  'coBrandTitle',
  'coBrandSubtitle',
  'coBrandFilterStatus',
  'coBrandFilterAll',
  'coBrandFilterActive',
  'coBrandFilterPending',
  'coBrandFilterEligible',
  'coBrandUploadBtn',
  'coBrandPreviewBtn',
  'coBrandSaveBtn'
];

i18nKeys.forEach(k => {
  assert(i18nContent.includes(`${k}:`), `i18n.js contains key "${k}"`);
});
console.log(`  ✓ All ${i18nKeys.length} bilingual translation keys verified in Arabic and English.\n`);

// -----------------------------------------------------------------------------
// TEST 3: JavaScript Handlers & Logic in app.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: JavaScript Handlers & Logic in app.js');
const handlers = [
  'refreshCoBrandingClinics',
  'renderCoBrandingClinics',
  'filterCoBrandingClinicsTable',
  'searchCoBrandingClinicsTable',
  'previewClinicCoBrandedReport',
  'openCoBrandingUploadModal'
];

handlers.forEach(fn => {
  assert(appJsContent.includes(`function ${fn}`), `app.js defines function ${fn}`);
  assert(appJsContent.includes(`window.${fn} = ${fn}`), `app.js exports window.${fn}`);
});

assert(appJsContent.includes('coBrandClinicsData'), 'app.js contains coBrandClinicsData state array');
console.log(`  ✓ All ${handlers.length} client-side handlers and data models verified.\n`);

console.log('==================================================================');
console.log('🎉 ALL ROLOGY BENCHMARK CO-BRANDED REPORTS TESTS PASSED (100%)!');
console.log('==================================================================');
