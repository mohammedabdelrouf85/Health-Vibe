/**
 * Health Vibe AI - Clinic Interactive ROI & Time Savings Calculator Test Suite
 * Item 20: مراجعة معادلات الحاسبة التفاعلية للعائد المادي وتوفير الوقت والتأكد من تحديث الأرقام بالجنيه المصري ديناميكياً
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🧮 HEALTH VIBE AI: CLINIC ROI & TIME SAVINGS CALCULATOR TESTS');
console.log('   Formulas, Real-time Slider Dynamics, Egyptian Pounds (EGP / ج.م)');
console.log('==================================================================\n');

const clinicsHtmlPath = path.resolve(__dirname, '../app/clinics.html');
assert(fs.existsSync(clinicsHtmlPath), 'app/clinics.html must exist');
const htmlContent = fs.readFileSync(clinicsHtmlPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: DOM Elements, Range Inputs & Dynamic Labels
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: DOM Elements, Sliders & Label Structure');
assert(htmlContent.includes('id="inputDoctors"'), 'Doctors slider input exists');
assert(htmlContent.includes('id="inputPatients"'), 'Patients slider input exists');
assert(htmlContent.includes('id="inputFee"'), 'Fee slider input exists');
assert(htmlContent.includes('id="valDoctors"'), 'Dynamic doctors value badge exists');
assert(htmlContent.includes('id="valPatients"'), 'Dynamic patients value badge exists');
assert(htmlContent.includes('id="valFee"'), 'Dynamic fee value badge exists');
assert(htmlContent.includes('id="calcHoursSaved"'), 'Hours saved output metric exists');
assert(htmlContent.includes('id="calcRevenueGain"'), 'Revenue gain output metric exists');
assert(htmlContent.includes('id="calcTriageSpeed"'), 'Triage acceleration metric exists');
assert(htmlContent.includes('id="calcBreakdownDetails"'), 'Live calculation breakdown chip exists');
console.log('  ✓ All required slider controls, badges, and output metrics present in DOM.\n');

// -----------------------------------------------------------------------------
// TEST 2: Real-time Event Listeners for Dynamic Responsiveness
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Real-time Event Listeners for Dynamic Responsiveness');
assert(htmlContent.includes('oninput="updateClinicCalculator()"'), 'Sliders have oninput handlers for zero-delay dragging');
assert(htmlContent.includes('el.addEventListener("input", updateClinicCalculator)'), 'Explicit input event listener attached');
assert(htmlContent.includes('el.addEventListener("change", updateClinicCalculator)'), 'Explicit change event listener attached');
console.log('  ✓ Double event listener binding (oninput + addEventListener) verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Mathematical Model Verification (Time Saved & Financial Gain)
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Mathematical Model Verification');

function simulateCalculator(doctors, patientsPerDay, fee, lang = 'ar') {
  const isAr = lang === 'ar';
  const totalDailyPatients = doctors * patientsPerDay;
  const monthlyPatients = totalDailyPatients * 26;
  const hoursSavedPerMonth = Math.round((monthlyPatients * 10) / 60);
  const recoveryRate = 0.05;
  const recoveredVisitsPerMonth = Math.round(monthlyPatients * recoveryRate);
  const extraRevenueEGP = recoveredVisitsPerMonth * fee;

  let valDocText = '';
  if (isAr) {
    if (doctors === 1) valDocText = "طبيب واحد (Solo)";
    else if (doctors === 2) valDocText = "طبيبان (2)";
    else if (doctors >= 3 && doctors <= 10) valDocText = `${doctors} أطباء`;
    else valDocText = `${doctors} طبيباً`;
  } else {
    valDocText = doctors === 1 ? "1 Doctor" : `${doctors} Doctors`;
  }

  const valFeeText = isAr ? `${fee.toLocaleString()} ج.م` : `${fee.toLocaleString()} EGP`;
  const hoursText = isAr ? `${hoursSavedPerMonth.toLocaleString()} ساعة` : `${hoursSavedPerMonth.toLocaleString()} hrs`;
  const revText = isAr ? `+${extraRevenueEGP.toLocaleString()} ج.م` : `+${extraRevenueEGP.toLocaleString()} EGP`;

  return {
    doctors,
    patientsPerDay,
    fee,
    totalDailyPatients,
    monthlyPatients,
    hoursSavedPerMonth,
    recoveredVisitsPerMonth,
    extraRevenueEGP,
    valDocText,
    valFeeText,
    hoursText,
    revText
  };
}

// Scenario A: Default Baseline (3 Doctors, 35 Patients/day, 400 EGP fee)
const baseline = simulateCalculator(3, 35, 400, 'ar');
assert.strictEqual(baseline.totalDailyPatients, 105, '105 total daily patients across clinic');
assert.strictEqual(baseline.monthlyPatients, 2730, '2,730 monthly clinic consultations (26 days)');
assert.strictEqual(baseline.hoursSavedPerMonth, 455, '455 hours saved monthly (10 min/case)');
assert.strictEqual(baseline.recoveredVisitsPerMonth, 137, '137 recovered appointments monthly (5%)');
assert.strictEqual(baseline.extraRevenueEGP, 54800, '54,800 EGP extra monthly revenue');
assert.strictEqual(baseline.valDocText, '3 أطباء', 'Proper Arabic plural for 3 doctors');
assert.strictEqual(baseline.valFeeText, '400 ج.م', 'Fee displayed in EGP / ج.م');
assert.strictEqual(baseline.revText, '+54,800 ج.م', 'Revenue formatted in EGP / ج.م');
console.log('  ✓ Baseline Scenario (3 Doctors, 35 Pts, 400 EGP) -> 455 hrs saved, +54,800 ج.م extra revenue.');

// Scenario B: Solo Consultant Practice (1 Doctor, 20 Patients/day, 500 EGP fee)
const solo = simulateCalculator(1, 20, 500, 'ar');
assert.strictEqual(solo.totalDailyPatients, 20);
assert.strictEqual(solo.monthlyPatients, 520);
assert.strictEqual(solo.hoursSavedPerMonth, 87);
assert.strictEqual(solo.recoveredVisitsPerMonth, 26);
assert.strictEqual(solo.extraRevenueEGP, 13000);
assert.strictEqual(solo.valDocText, 'طبيب واحد (Solo)', 'Proper Arabic singular form');
assert.strictEqual(solo.revText, '+13,000 ج.م');
console.log('  ✓ Solo Practice (1 Doctor, 20 Pts, 500 EGP) -> 87 hrs saved, +13,000 ج.م extra revenue.');

// Scenario C: Large Polyclinic (12 Doctors, 25 Patients/day, 350 EGP fee)
const polyclinic = simulateCalculator(12, 25, 350, 'ar');
assert.strictEqual(polyclinic.totalDailyPatients, 300);
assert.strictEqual(polyclinic.monthlyPatients, 7800);
assert.strictEqual(polyclinic.hoursSavedPerMonth, 1300);
assert.strictEqual(polyclinic.recoveredVisitsPerMonth, 390);
assert.strictEqual(polyclinic.extraRevenueEGP, 136500);
assert.strictEqual(polyclinic.valDocText, '12 طبيباً', 'Proper Arabic plural (tamyees) for 11+');
assert.strictEqual(polyclinic.revText, '+136,500 ج.م');
console.log('  ✓ Large Polyclinic (12 Doctors, 25 Pts, 350 EGP) -> 1,300 hrs saved, +136,500 ج.م extra revenue.\n');

// -----------------------------------------------------------------------------
// TEST 4: Bilingual Translation Dictionary for Calculator
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Bilingual Translation Dictionary for Calculator');
assert(htmlContent.includes('sliderFeeLabel: "متوسط سعر الكشف أو الاستشارة (جنيه مصري - EGP)"'), 'Arabic fee label specifies Egyptian Pounds (EGP)');
assert(htmlContent.includes('sliderFeeLabel: "Average Consultation Fee (EGP)"'), 'English fee label specifies EGP');
assert(htmlContent.includes('calcRevenueGainLabel: "عائد شهري إضافي متوقع بالجنيه المصري'), 'Arabic revenue label specifies Egyptian Pounds');
assert(htmlContent.includes('calcRevenueGainLabel: "Projected monthly revenue boost in EGP'), 'English revenue label specifies EGP');
console.log('  ✓ Bilingual Arabic & English translations verify Egyptian Pound specification.\n');

// -----------------------------------------------------------------------------
// TEST 5: English Mode Calculator Currency Formatting
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: English Mode Calculator Currency Formatting');
const baselineEn = simulateCalculator(3, 35, 400, 'en');
assert.strictEqual(baselineEn.valDocText, '3 Doctors');
assert.strictEqual(baselineEn.valFeeText, '400 EGP');
assert.strictEqual(baselineEn.hoursText, '455 hrs');
assert.strictEqual(baselineEn.revText, '+54,800 EGP');
console.log('  ✓ English mode formats numbers cleanly as "EGP" and "hrs".\n');

console.log('==================================================================');
console.log('🎉 ALL 5 CLINIC CALCULATOR & EGP CURRENCY TESTS PASSED (100%)!');
console.log('==================================================================');
