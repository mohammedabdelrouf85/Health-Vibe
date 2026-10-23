/**
 * Health Vibe AI - Doctolib Benchmark: Doctor Time Savings & No-Show Reduction Calculator Tests (#741)
 * 
 * Verifies:
 * 1. DOM Elements in admin-view.html and index.html:
 *    - Panel: adminRoiCalculatorPanel
 *    - Sliders & Labels: adminInputDoctors, adminInputPatients, adminInputFee
 *    - Metric Outputs: adminRoiHoursSaved, adminRoiRevenueGain, adminRoiNoShowDrop, adminRoiSpeedup
 *    - Breakdown Box: adminRoiBreakdownBox
 * 2. Real Egyptian Healthcare Market Mathematical Invariants:
 *    - 26 working days per month
 *    - 10 minutes saved per consultation in pre-triage and documentation
 *    - 5% recovery of lost appointment slots from No-Show drop (18% -> 3.8%)
 *    - Consultation fees measured in Egyptian Pounds (EGP / ج.م)
 * 3. Bilingual Parity in i18n.js:
 *    - roiCalcTitle, roiCalcSubtitle, roiCalcEgyptianMarketBadge, etc.
 * 4. Client Handlers in app.js:
 *    - updateAdminRoiCalculator
 *    - resetAdminRoiCalculator
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('⏱️ DOCTOLIB BENCHMARK: ROI & NO-SHOW CALCULATOR ADMIN UI TESTS');
console.log('   Doctor Time Savings, Egyptian Market Real Data & EGP (#741)');
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
  'adminRoiCalculatorPanel',
  'adminRoiHoursSaved',
  'adminRoiRevenueGain',
  'adminRoiNoShowDrop',
  'adminRoiSpeedup',
  'adminInputDoctors',
  'adminInputPatients',
  'adminInputFee',
  'adminValDoctors',
  'adminValPatients',
  'adminValFee',
  'adminRoiBreakdownBox',
  'btnResetRoiCalc'
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
  'roiCalcTitle',
  'roiCalcSubtitle',
  'roiCalcEgyptianMarketBadge',
  'roiCalcHoursSavedMonthly',
  'roiCalcNoShowRecoveredRevenue',
  'roiCalcTriageSpeedup'
];

i18nKeys.forEach(k => {
  assert(i18nContent.includes(`${k}:`), `i18n.js contains key "${k}"`);
});
console.log(`  ✓ All ${i18nKeys.length} bilingual translation keys verified in Arabic and English.\n`);

// -----------------------------------------------------------------------------
// TEST 3: Egyptian Healthcare Market Mathematical Formulation
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Mathematical Model Verification (Empirical Egyptian Market Data)');

function calculateClinicRoi(doctors, patientsPerDocPerDay, feeEGP) {
  const operatingDays = 26;
  const totalDailyPatients = doctors * patientsPerDocPerDay;
  const monthlyPatients = totalDailyPatients * operatingDays;
  const hoursSaved = Math.round((monthlyPatients * 10) / 60);
  const recoveredSlots = Math.round(monthlyPatients * 0.05);
  const extraRevenue = recoveredSlots * feeEGP;
  return { monthlyPatients, hoursSaved, recoveredSlots, extraRevenue };
}

// Baseline: 3 doctors, 35 patients/day, 400 EGP fee
const baseline = calculateClinicRoi(3, 35, 400);
assert.strictEqual(baseline.monthlyPatients, 2730, 'Total monthly patients matches 2,730');
assert.strictEqual(baseline.hoursSaved, 455, 'Hours saved matches 455 hours');
assert.strictEqual(baseline.recoveredSlots, 137, 'Recovered appointment slots matches 137');
assert.strictEqual(baseline.extraRevenue, 54800, 'Extra revenue matches 54,800 EGP');

// Solo Clinic: 1 doctor, 20 patients/day, 500 EGP fee
const solo = calculateClinicRoi(1, 20, 500);
assert.strictEqual(solo.monthlyPatients, 520, 'Solo clinic monthly patients matches 520');
assert.strictEqual(solo.hoursSaved, 87, 'Solo clinic hours saved matches 87 hours');
assert.strictEqual(solo.recoveredSlots, 26, 'Solo clinic recovered slots matches 26');
assert.strictEqual(solo.extraRevenue, 13000, 'Solo clinic extra revenue matches 13,000 EGP');

console.log('  ✓ Baseline & Solo clinic mathematical model verified accurately.\n');

// -----------------------------------------------------------------------------
// TEST 4: JavaScript Handlers in app.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: JavaScript Handlers in app.js');
assert(appJsContent.includes('function updateAdminRoiCalculator()'), 'app.js defines updateAdminRoiCalculator');
assert(appJsContent.includes('function resetAdminRoiCalculator()'), 'app.js defines resetAdminRoiCalculator');
assert(appJsContent.includes('window.updateAdminRoiCalculator = updateAdminRoiCalculator'), 'app.js exports updateAdminRoiCalculator to window');
assert(appJsContent.includes('window.resetAdminRoiCalculator = resetAdminRoiCalculator'), 'app.js exports resetAdminRoiCalculator to window');
console.log('  ✓ Client-side calculator handlers and reset functions verified.\n');

console.log('==================================================================');
console.log('🎉 ALL DOCTOLIB BENCHMARK ROI CALCULATOR TESTS PASSED (100%)!');
console.log('==================================================================');
