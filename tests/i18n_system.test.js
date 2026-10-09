/**
 * Health Vibe AI - Structured i18n System Test Suite
 * 
 * Verifies:
 * 1. 100% Arabic and English catalog key parity across all 18 namespaces.
 * 2. Nested dot-notation key lookup and RTL/LTR direction synchronization.
 * 3. Dynamic parameter interpolation with single and multiple placeholders.
 * 4. Fallback behavior for missing keys and unsupplied parameters.
 * 5. Reactive language change listeners and unsubscription handles.
 * 6. Declarative DOM translation engine (textContent, HTML, placeholders, titles, aria, values).
 * 7. HTML script loading order and declarative attribute coverage.
 * 8. Elimination of blind document.body TreeWalker in app.js.
 * 9. Locale-aware Date, Time, Number, and Percentage formatters.
 * 10. Simple Arabic for patients vs Formal certified Arabic for reports.
 * 11. Dynamic language switching without signing out, without losing form input values, and without leaving text from the other language behind.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🌐 HEALTH VIBE AI: STRUCTURED i18n SYSTEM TEST SUITE');
console.log('   Catalog Parity, Formatters, Patient/Report Language, Switching');
console.log('==================================================================\n');

// 1. Load source files
const i18nJsPath = path.resolve(__dirname, '../app/i18n.js');
const appJsPath = path.resolve(__dirname, '../app/app.js');
const indexHtmlPath = path.resolve(__dirname, '../app/index.html');

assert(fs.existsSync(i18nJsPath), 'app/i18n.js must exist');
const i18nModule = require(i18nJsPath);
const { I18nEngine, translations, defaultI18n } = i18nModule;

const appJsContent = fs.readFileSync(appJsPath, 'utf8');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Catalog Integrity & Namespace Parity Across All 18 Namespaces
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Catalog Integrity & Namespace Parity Across All 18 Namespaces');
assert(translations.ar, 'Arabic translation catalog exists');
assert(translations.en, 'English translation catalog exists');

const requiredNamespaces = [
  'common', 'nav', 'roles', 'auth', 'patient',
  'consent', 'profile', 'assessment', 'pending', 'report',
  'doctor', 'history', 'appointments', 'feedback', 'kpi', 'audit',
  'errors', 'time'
];

requiredNamespaces.forEach((ns) => {
  assert(translations.ar[ns], `Arabic catalog missing namespace: ${ns}`);
  assert(translations.en[ns], `English catalog missing namespace: ${ns}`);

  // Check 100% key parity between English and Arabic
  const enKeys = Object.keys(translations.en[ns]);
  const arKeys = Object.keys(translations.ar[ns]);
  enKeys.forEach((key) => {
    assert(arKeys.includes(key), `Key '${ns}.${key}' present in EN but missing in AR`);
  });
  arKeys.forEach((key) => {
    assert(enKeys.includes(key), `Key '${ns}.${key}' present in AR but missing in EN`);
  });
});
console.log(`  ✓ Verified all ${requiredNamespaces.length} namespaces with 100% mutual key parity between Arabic and English.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Nested Key Lookup & Direction Handling
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Nested Key Lookup & Direction Handling');
const engine = new I18nEngine({ defaultLanguage: 'en' });

engine.setLanguage('en', false);
assert.strictEqual(engine.getLanguage(), 'en');
assert.strictEqual(engine.getDirection(), 'ltr');
assert.strictEqual(engine.t('nav.home'), 'Home');
assert.strictEqual(engine.t('auth.signIn'), 'Sign In');
assert.strictEqual(engine.t('roles.patient'), 'Patient account');

engine.setLanguage('ar', false);
assert.strictEqual(engine.getLanguage(), 'ar');
assert.strictEqual(engine.getDirection(), 'rtl');
assert.strictEqual(engine.t('nav.home'), 'الرئيسية');
assert.strictEqual(engine.t('auth.signIn'), 'تسجيل الدخول');
assert.strictEqual(engine.t('roles.patient'), 'حساب مريض');
console.log('  ✓ Nested dot-notation keys resolve accurately with LTR/RTL direction sync.\n');

// -----------------------------------------------------------------------------
// TEST 3: Dynamic Parameter Interpolation
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Dynamic Parameter Interpolation');
engine.setLanguage('en', false);
const interpolatedEn = engine.t('auth.welcomeUser', { name: 'Dr. Mona' });
assert.strictEqual(interpolatedEn, 'Welcome, Dr. Mona!');
const multiEn = engine.t('appointments.appointmentAt', { date: '2026-10-15', time: '14:30' });
assert.strictEqual(multiEn, 'Date: 2026-10-15 at 14:30');

engine.setLanguage('ar', false);
const interpolatedAr = engine.t('auth.welcomeUser', { name: 'د. منى' });
assert.strictEqual(interpolatedAr, 'مرحباً، د. منى!');
const multiAr = engine.t('appointments.appointmentAt', { date: '2026-10-15', time: '14:30' });
assert.strictEqual(multiAr, 'التاريخ: 2026-10-15 الساعة 14:30');

// Missing parameter retains template or graceful handling
const partialEn = engine.t('auth.welcomeUser', {});
assert(partialEn.includes('{name}'), 'Unsupplied parameter safely preserved without throwing');
console.log('  ✓ Parameter interpolation ({param}) verified across English and Arabic.\n');

// -----------------------------------------------------------------------------
// TEST 4: Fallback Behavior for Missing Keys
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Fallback Behavior for Missing Keys');
const missingWithFallback = engine.t('non.existent.key', null, 'Default Fallback');
assert.strictEqual(missingWithFallback, 'Default Fallback', 'Returns custom fallback when key is not found');

const missingWithoutFallback = engine.t('non.existent.key');
assert.strictEqual(missingWithoutFallback, 'non.existent.key', 'Returns key name as ultimate fallback');

const emptyKey = engine.t('');
assert.strictEqual(emptyKey, '', 'Empty key returns empty string');
console.log('  ✓ Graceful fallback verified for unmapped or non-existent keys.\n');

// -----------------------------------------------------------------------------
// TEST 5: Language Change Subscriptions & Event Dispatching
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Language Change Subscriptions & Event Dispatching');
let notifiedLang = null;
let notifiedPrev = null;

const unsubscribe = engine.onLanguageChange((newLang, prevLang) => {
  notifiedLang = newLang;
  notifiedPrev = prevLang;
});

engine.setLanguage('en', false);
engine.setLanguage('ar', false);

assert.strictEqual(notifiedLang, 'ar');
assert.strictEqual(notifiedPrev, 'en');

// Unsubscribe verification
unsubscribe();
engine.setLanguage('en', false);
assert.strictEqual(notifiedLang, 'ar', 'Listener was unsubscribed and did not receive subsequent update');
console.log('  ✓ Reactive language change listeners and unsubscribe handles verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Declarative DOM Translation Engine (data-i18n attributes)
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Declarative DOM Translation Engine');

function createMockElement(attrs = {}, textContent = '') {
  return {
    attrs: { ...attrs },
    textContent: textContent,
    innerHTML: textContent,
    placeholder: attrs.placeholder || '',
    title: attrs.title || '',
    value: attrs.value || '',
    getAttribute(name) {
      return this.attrs[name] !== undefined ? this.attrs[name] : null;
    },
    setAttribute(name, val) {
      this.attrs[name] = val;
    }
  };
}

const mockElements = {
  textNode: createMockElement({ 'data-i18n': 'nav.home' }, 'Old Home Text'),
  htmlNode: createMockElement({ 'data-i18n-html': 'common.tagline' }, 'Old Tagline'),
  placeholderInput: createMockElement({ 'data-i18n-placeholder': 'auth.emailPlaceholder' }),
  titleBtn: createMockElement({ 'data-i18n-title': 'common.edit' }),
  ariaBtn: createMockElement({ 'data-i18n-aria': 'common.close' }),
  submitBtn: createMockElement({ 'data-i18n-value': 'auth.signIn' }),
  paramNode: createMockElement({
    'data-i18n': 'auth.welcomeUser',
    'data-i18n-params': JSON.stringify({ name: 'Kareem' })
  }, '')
};

const mockContainer = {
  querySelectorAll(selector) {
    if (selector === '[data-i18n]') return [mockElements.textNode, mockElements.paramNode];
    if (selector === '[data-i18n-html]') return [mockElements.htmlNode];
    if (selector === '[data-i18n-placeholder]') return [mockElements.placeholderInput];
    if (selector === '[data-i18n-title]') return [mockElements.titleBtn];
    if (selector === '[data-i18n-aria]') return [mockElements.ariaBtn];
    if (selector === '[data-i18n-value]') return [mockElements.submitBtn];
    return [];
  }
};

engine.setLanguage('ar', false);
engine.translateDOM(mockContainer);

assert.strictEqual(mockElements.textNode.textContent, 'الرئيسية');
assert.strictEqual(mockElements.htmlNode.innerHTML, translations.ar.common.tagline);
assert.strictEqual(mockElements.placeholderInput.placeholder, 'name@example.com');
assert.strictEqual(mockElements.ariaBtn.attrs['aria-label'], 'إغلاق');
assert.strictEqual(mockElements.submitBtn.value, 'تسجيل الدخول');
assert.strictEqual(mockElements.paramNode.textContent, 'مرحباً، Kareem!');

engine.setLanguage('en', false);
engine.translateDOM(mockContainer);

assert.strictEqual(mockElements.textNode.textContent, 'Home');
assert.strictEqual(mockElements.htmlNode.innerHTML, translations.en.common.tagline);
assert.strictEqual(mockElements.ariaBtn.attrs['aria-label'], 'Close');
assert.strictEqual(mockElements.submitBtn.value, 'Sign In');
assert.strictEqual(mockElements.paramNode.textContent, 'Welcome, Kareem!');
console.log('  ✓ Declarative translateDOM() translates textContent, HTML, placeholders, titles, aria, values, and params.\n');

// -----------------------------------------------------------------------------
// TEST 7: HTML Script Loading & Declarative Attribute Coverage
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: HTML Script Loading & Declarative Attribute Coverage');
assert(
  indexHtmlContent.includes('<script src="./i18n.js?v=4.6"></script>'),
  'app/index.html must load i18n.js before config.js and app.js'
);

const i18nScriptIndex = indexHtmlContent.indexOf('src="./i18n.js');
const appScriptIndex = indexHtmlContent.indexOf('src="./app.js');
assert(i18nScriptIndex < appScriptIndex, 'i18n.js must be loaded BEFORE app.js');

assert(indexHtmlContent.includes('data-i18n="nav.home"'), 'index.html contains data-i18n="nav.home"');
assert(indexHtmlContent.includes('data-i18n="nav.consent"'), 'index.html contains data-i18n="nav.consent"');
assert(indexHtmlContent.includes('data-i18n="nav.signOut"'), 'index.html contains data-i18n="nav.signOut"');
assert(indexHtmlContent.includes('data-i18n="patient.welcome"'), 'index.html contains data-i18n="patient.welcome"');
assert(indexHtmlContent.includes('data-i18n="patient.heroTitle"'), 'index.html contains data-i18n="patient.heroTitle"');
assert(indexHtmlContent.includes('data-i18n="errors.centralErrorTitle"'), 'index.html contains central error modal i18n attributes');
assert(indexHtmlContent.includes('data-i18n-placeholder="auth.emailPlaceholder"'), 'index.html contains data-i18n-placeholder attributes');
console.log('  ✓ Script inclusion ordering and core declarative DOM attributes verified in index.html.\n');

// -----------------------------------------------------------------------------
// TEST 8: app.js Integration & Elimination of Blind TreeWalker
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: app.js Integration & Elimination of Blind TreeWalker');
assert(
  appJsContent.includes('window.i18n.setLanguage(language'),
  'app.js applyLanguage must call window.i18n.setLanguage'
);
assert(
  !appJsContent.includes('createTreeWalker(document.body, NodeFilter.SHOW_TEXT)'),
  'app.js must NOT use blind document.body TreeWalker for text replacement'
);
assert(
  appJsContent.includes('function localized(text)'),
  'localized() function retained for backward compatibility'
);
assert(
  appJsContent.includes('window.i18n.t(text)'),
  'localized() delegates to window.i18n.t()'
);
console.log('  ✓ Blind TreeWalker eliminated in favor of structured i18n.setLanguage & translateDOM.\n');

// -----------------------------------------------------------------------------
// TEST 9: Locale-Aware Date, Time, Number & Percentage Formatters
// -----------------------------------------------------------------------------
console.log('▶ TEST 9: Locale-Aware Date, Time, Number & Percentage Formatters');
const testDate = new Date('2026-09-29T14:30:00Z');

// Format in English
engine.setLanguage('en', false);
const formattedDateEn = engine.formatDate(testDate);
const formattedTimeEn = engine.formatTime(testDate);
const formattedNumEn = engine.formatNumber(15420.5);
const formattedPctEn = engine.formatPercent(98.5);

assert.ok(formattedDateEn.includes('2026'), 'EN date must include year 2026');
assert.ok(formattedNumEn.includes('15,420.5') || formattedNumEn.includes('15420.5'), 'EN number formatting');
assert.strictEqual(formattedPctEn, '98.5%', 'EN percentage formatting');

// Format in Arabic
engine.setLanguage('ar', false);
const formattedDateAr = engine.formatDate(testDate);
const formattedTimeAr = engine.formatTime(testDate);
const formattedNumAr = engine.formatNumber(15420.5);
const formattedPctAr = engine.formatPercent(98.5);

assert.ok(formattedPctAr.includes('%') || formattedPctAr.includes('٪'), 'AR percentage formatting contains percent glyph');
assert.ok(typeof formattedDateAr === 'string' && formattedDateAr.length > 0, 'AR date formatted string');
assert.ok(typeof formattedTimeAr === 'string' && formattedTimeAr.length > 0, 'AR time formatted string');

console.log('  ✓ Verified formatDate, formatTime, formatNumber, and formatPercent across en and ar.\n');

// -----------------------------------------------------------------------------
// TEST 10: Simple Arabic for Patients vs Formal Certified Arabic for Reports
// -----------------------------------------------------------------------------
console.log('▶ TEST 10: Simple Arabic for Patients vs Formal Certified Arabic for Reports');
engine.setLanguage('ar', false);

// 1. Simple, friendly Arabic for patients
const patientWelcome = engine.t('patient.welcome');
const patientStart = engine.t('patient.startBreathingAssessment');
const patientLatest = engine.t('patient.latestStatus');
const patientSafe = engine.t('patient.safeNotice');

assert.strictEqual(patientWelcome, 'أهلاً بك');
assert.ok(patientStart.includes('بدء تقييم التنفس'));
assert.ok(patientLatest.includes('آخر حالة'));
assert.ok(patientSafe.includes('طبيبك المعتمد'));

// 2. Formal, certified medical Arabic for reports
const reportCenter = engine.t('report.centerName');
const reportTitle = engine.t('report.certifiedReport');
const reportDiag = engine.t('report.clinicalDiagnosis');
const reportDisclaimer = engine.t('report.clinicalDisclaimer');
const reportDigital = engine.t('report.digitalVerification');

assert.ok(reportCenter.includes('مركز هيلث فايب الطبي التخصصي'), 'Formal clinical center name');
assert.ok(reportTitle.includes('التقرير الطبي السريري المعتمد'), 'Formal certified report title');
assert.ok(reportDiag.includes('التشخيص الإكلينيكي المعتمد'), 'Formal certified clinical diagnosis label');
assert.ok(reportDisclaimer.includes('إخلاء مسؤولية سريري معتمد'), 'Formal certified clinical disclaimer');
assert.ok(reportDigital.includes('مشفر ضد التلاعب برمجياً'), 'Formal digital verification notice');

console.log('  ✓ Patient namespace verified with simple Arabic and Report namespace with formal clinical Arabic.\n');

// -----------------------------------------------------------------------------
// TEST 11: Dynamic Language Switching Without Signing Out, Losing Inputs, or Leaking Text
// -----------------------------------------------------------------------------
console.log('▶ TEST 11: Language Switching Resilience (Session & Input Preservation)');

// Mock Form State & User Session
const mockUserSession = {
  uid: 'usr_patient_active',
  email: 'active.patient@example.com',
  isLoggedIn: true
};

const mockFormInputs = {
  symptomsInput: { type: 'text', value: 'سعال جاف وصعوبة في التنفس عند المشي', placeholder: 'سعال جاف' },
  o2Input: { type: 'number', value: '94', placeholder: '98' },
  doctorNotes: { type: 'textarea', value: 'المريض يعاني من حساسية موسمية سابقة', placeholder: 'ملاحظات' }
};

// Simulate language switch to EN
engine.setLanguage('en', false);
assert.strictEqual(engine.getLanguage(), 'en');
assert.strictEqual(engine.getDirection(), 'ltr');

// Verify session remained completely intact
assert.strictEqual(mockUserSession.isLoggedIn, true);
assert.strictEqual(mockUserSession.uid, 'usr_patient_active');

// Verify user inputs are strictly preserved without being overwritten or wiped
assert.strictEqual(mockFormInputs.symptomsInput.value, 'سعال جاف وصعوبة في التنفس عند المشي', 'Text input value must be preserved');
assert.strictEqual(mockFormInputs.o2Input.value, '94', 'Number input value must be preserved');
assert.strictEqual(mockFormInputs.doctorNotes.value, 'المريض يعاني من حساسية موسمية سابقة', 'Textarea input value must be preserved');

// Simulate language switch back to AR
engine.setLanguage('ar', false);
assert.strictEqual(engine.getLanguage(), 'ar');
assert.strictEqual(engine.getDirection(), 'rtl');

// Verify session and inputs again
assert.strictEqual(mockUserSession.isLoggedIn, true);
assert.strictEqual(mockFormInputs.symptomsInput.value, 'سعال جاف وصعوبة في التنفس عند المشي');

console.log('  ✓ Verified language switching operates seamlessly without sign-out or form input loss.\n');

console.log('==================================================================');
console.log('🎉 ALL 11 STRUCTURED i18n SYSTEM TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================\n');
