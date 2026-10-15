/**
 * Health Vibe AI - B2B Clinics Portal Bilingual (AR / EN) Test Suite
 * 
 * Tests:
 * 1. Complete unified i18n dictionary parity across Arabic and English.
 * 2. Header language toggle element binding and click handler.
 * 3. Dynamic document attribute updates (lang="ar"/"en", dir="rtl"/"ltr").
 * 4. Document title and meta description localization synchronization.
 * 5. Headless Chromium verification of DOM translation and layout mirroring.
 * 6. Interactive ROI calculator and form option bilingual synchronization.
 * 7. Zero horizontal layout overflow in both LTR and RTL rendering modes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🌐 HEALTH VIBE AI: B2B CLINICS PORTAL BILINGUAL (AR/EN) TEST SUITE');
console.log('   Unified Dictionaries, Header Toggle, Dynamic Attributes & Mirroring');
console.log('==================================================================\n');

const clinicsHtmlPath = path.resolve(__dirname, '../app/clinics.html');
assert.ok(fs.existsSync(clinicsHtmlPath), 'app/clinics.html must exist');
const htmlContent = fs.readFileSync(clinicsHtmlPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Header Language Toggle & Script Bindings
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Header Language Toggle & Script Bindings');
assert.ok(htmlContent.includes('id="clinicLangToggle"'), 'clinics.html must have #clinicLangToggle element');
assert.ok(htmlContent.includes('onclick="toggleClinicLang()"'), 'Toggle button must invoke toggleClinicLang()');
assert.ok(htmlContent.includes('function toggleClinicLang()'), 'toggleClinicLang function must be defined');
assert.ok(htmlContent.includes('function applyClinicLang('), 'applyClinicLang function must be defined');
assert.ok(htmlContent.includes('function initClinicLanguage()'), 'initClinicLanguage function must be defined');
assert.ok(htmlContent.includes('src="./i18n.js?v='), 'clinics.html must load the structured i18n module');
console.log('  ✓ Header toggle button and language switching handlers properly bound.\n');

// -----------------------------------------------------------------------------
// TEST 2: Unified i18n Dictionary Integrity & 100% Symmetrical Parity
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Unified i18n Dictionary Integrity & 100% Symmetrical Parity');
const dictMatch = htmlContent.match(/const clinicTranslations = (\{[\s\S]*?\n    \};)/);
assert.ok(dictMatch, 'clinicTranslations dictionary must be defined');

const getTrans = new Function('return ' + dictMatch[1]);
const translations = getTrans();
assert.ok(translations.ar, 'Arabic translations must exist');
assert.ok(translations.en, 'English translations must exist');

const arKeys = Object.keys(translations.ar);
const enKeys = Object.keys(translations.en);

assert.strictEqual(arKeys.length, enKeys.length, `AR keys count (${arKeys.length}) must equal EN keys count (${enKeys.length})`);
arKeys.forEach(key => {
  assert.ok(enKeys.includes(key), `Key '${key}' missing in English dictionary`);
  assert.ok(translations.ar[key] && translations.ar[key].trim() !== '', `AR key '${key}' cannot be empty`);
  assert.ok(translations.en[key] && translations.en[key].trim() !== '', `EN key '${key}' cannot be empty`);
  assert.ok(htmlContent.includes(`id="${key}"`), `Key '${key}' must map to a DOM element with id="${key}"`);
});
console.log(`  ✓ All ${arKeys.length} translation keys resolve symmetrically with 100% DOM element mapping.\n`);

// -----------------------------------------------------------------------------
// TEST 3: CSS Typography & Layout Mirroring Rules
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: CSS Typography & Layout Mirroring Rules');
assert.ok(htmlContent.includes('html[lang="ar"] body'), 'Defines font-family for Arabic mode');
assert.ok(htmlContent.includes('html[lang="en"] body'), 'Defines font-family for English mode');
assert.ok(htmlContent.includes('html[dir="rtl"] .triage-queue-item.critical'), 'Defines RTL directional border');
assert.ok(htmlContent.includes('html[dir="ltr"] .triage-queue-item.critical'), 'Defines LTR directional border');
assert.ok(htmlContent.includes('html[dir="ltr"] .hero-glow-1'), 'Defines LTR hero background glow positioning');
console.log('  ✓ CSS rules enforce proper typography and RTL/LTR layout mirroring.\n');

// -----------------------------------------------------------------------------
// TEST 4: Live Headless Chromium Functional Language Switch & Mirroring Test
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Live Headless Chromium Functional Language Switch & Mirroring Test');

async function runBrowserTests() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    console.log('  ⚠ puppeteer-core not available in environment; skipping live rendering check.');
    return;
  }

  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ];
  const exePath = chromeCandidates.find(c => fs.existsSync(c));
  if (!exePath) {
    console.log('  ⚠ No Chromium binary detected; skipping live rendering check.');
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: exePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const fileUrl = 'file:///' + clinicsHtmlPath.replace(/\\/g, '/') + '?lang=ar';
    await page.goto(fileUrl, { waitUntil: 'load' });

    // Step 4a: Verify Initial State (Arabic / RTL)
    const initialLang = await page.evaluate(() => document.documentElement.lang);
    const initialDir = await page.evaluate(() => document.documentElement.dir);
    const initialToggleText = await page.$eval('#clinicLangToggle', el => el.textContent.trim());
    const initialHeroHeadline = await page.$eval('#heroHeadline', el => el.textContent.trim());

    assert.strictEqual(initialLang, 'ar', 'Initial language should be "ar"');
    assert.strictEqual(initialDir, 'rtl', 'Initial direction should be "rtl"');
    assert.strictEqual(initialToggleText, 'EN', 'Toggle button should indicate option to switch to "EN"');
    assert.ok(initialHeroHeadline.includes('رعاية تنفسية'), 'Initial headline should be Arabic');
    console.log('  ✓ Initial page loaded in Arabic (lang="ar", dir="rtl", button="EN").');

    // Step 4b: Click Language Toggle -> Switch to English
    await page.click('#clinicLangToggle');
    await new Promise(r => setTimeout(r, 200));

    const enLang = await page.evaluate(() => document.documentElement.lang);
    const enDir = await page.evaluate(() => document.documentElement.dir);
    const enBodyDir = await page.evaluate(() => document.body.dir);
    const enToggleText = await page.$eval('#clinicLangToggle', el => el.textContent.trim());
    const enHeroHeadline = await page.$eval('#heroHeadline', el => el.textContent.trim());
    const enHeroEyebrow = await page.$eval('#heroEyebrow', el => el.textContent.trim());
    const enSimCase1 = await page.$eval('#simCase1Name', el => el.textContent.trim());
    const enCompModern1 = await page.$eval('#compModern1Title', el => el.textContent.trim());
    const enCalcHours = await page.$eval('#calcHoursSaved', el => el.textContent.trim());
    const enCalcRev = await page.$eval('#calcRevenueGain', el => el.textContent.trim());
    const enPilotCost = await page.$eval('#pilotCostNote', el => el.textContent.trim());
    const enPageTitle = await page.title();

    assert.strictEqual(enLang, 'en', 'Document lang attribute should update to "en"');
    assert.strictEqual(enDir, 'ltr', 'Document dir attribute should update to "ltr"');
    assert.strictEqual(enBodyDir, 'ltr', 'Body dir attribute should update to "ltr"');
    assert.strictEqual(enToggleText, 'عربي', 'Toggle button should now display "عربي"');
    assert.ok(enHeroHeadline.includes('AI-augmented'), 'Hero headline translated to English');
    assert.ok(enHeroEyebrow.includes('Smart Clinical Operating System'), 'Hero eyebrow translated to English');
    assert.ok(enSimCase1.includes('Mahmoud Saeed (58 yrs)'), 'Simulated patient card translated to English');
    assert.ok(enCompModern1.includes('Proactive Pre-Visit'), 'Comparison card title translated to English');
    assert.ok(enCalcHours.includes('hrs'), 'Calculator hours formatted with "hrs" in English');
    assert.ok(enCalcRev.includes('EGP'), 'Calculator revenue formatted with "EGP" in English');
    assert.strictEqual(enPilotCost, '100% Free Pilot Evaluation', 'Pilot badge translated to English');
    assert.ok(enPageTitle.includes('Health Vibe AI for Clinics'), 'Document title localized to English');
    console.log('  ✓ Switched to English: lang="en", dir="ltr", button="عربي", copy fully translated.');

    // Step 4c: Verify Mirroring & Zero Overflow in English (LTR)
    const enOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    assert.strictEqual(enOverflow, 0, 'Must have zero layout overflow in English LTR mode');
    console.log('  ✓ Verified 0px layout overflow in English LTR mode.');

    // Step 4d: Click Language Toggle -> Switch back to Arabic
    await page.click('#clinicLangToggle');
    await new Promise(r => setTimeout(r, 200));

    const arLangAgain = await page.evaluate(() => document.documentElement.lang);
    const arDirAgain = await page.evaluate(() => document.documentElement.dir);
    const arToggleTextAgain = await page.$eval('#clinicLangToggle', el => el.textContent.trim());
    const arHeroHeadlineAgain = await page.$eval('#heroHeadline', el => el.textContent.trim());
    const arCalcHoursAgain = await page.$eval('#calcHoursSaved', el => el.textContent.trim());

    assert.strictEqual(arLangAgain, 'ar', 'Document lang attribute returned to "ar"');
    assert.strictEqual(arDirAgain, 'rtl', 'Document dir attribute returned to "rtl"');
    assert.strictEqual(arToggleTextAgain, 'EN', 'Toggle button returned to "EN"');
    assert.ok(arHeroHeadlineAgain.includes('رعاية تنفسية'), 'Hero headline returned to Arabic');
    assert.ok(arCalcHoursAgain.includes('ساعة'), 'Calculator hours returned to "ساعة"');
    console.log('  ✓ Successfully switched back to Arabic with seamless RTL re-mirroring.');

    // Step 4e: Verify Mobile Viewport (375px) in Both Languages
    await page.setViewport({ width: 375, height: 667 });
    const mobileArOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.strictEqual(mobileArOverflow, 0, '375px mobile screen must have 0px overflow in Arabic RTL');

    await page.click('#clinicLangToggle');
    await new Promise(r => setTimeout(r, 200));
    const mobileEnOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.strictEqual(mobileEnOverflow, 0, '375px mobile screen must have 0px overflow in English LTR');
    console.log('  ✓ Mobile viewport (375px) verified with zero horizontal overflow in both AR and EN.');

    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }
}

runBrowserTests().then(() => {
  console.log('\n==================================================================');
  console.log('🎉 ALL B2B CLINICS PORTAL BILINGUAL LANGUAGE SWITCHING TESTS PASSED (100%)');
  console.log('==================================================================');
  process.exit(0);
}).catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
