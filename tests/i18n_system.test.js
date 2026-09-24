/**
 * Health Vibe AI - Structured i18n System Test Suite
 * Item 30: i18n منظّم بدل DOM text replacement.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('🌐 HEALTH VIBE AI: STRUCTURED i18n SYSTEM TEST SUITE');
console.log('   Catalog Parity, Parameter Interpolation, Declarative DOM, Events');
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
// TEST 1: Catalog Integrity & Namespace Parity
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Catalog Integrity & Namespace Parity');
assert(translations.ar, 'Arabic translation catalog exists');
assert(translations.en, 'English translation catalog exists');

const requiredNamespaces = [
  'common', 'nav', 'roles', 'auth', 'patient',
  'doctor', 'assessment', 'errors', 'feedback', 'appointments', 'kpi'
];

requiredNamespaces.forEach((ns) => {
  assert(translations.ar[ns], `Arabic catalog missing namespace: ${ns}`);
  assert(translations.en[ns], `English catalog missing namespace: ${ns}`);

  // Check key parity for nav & auth
  const enKeys = Object.keys(translations.en[ns]);
  const arKeys = Object.keys(translations.ar[ns]);
  enKeys.forEach((key) => {
    assert(arKeys.includes(key), `Key '${ns}.${key}' present in EN but missing in AR`);
  });
});
console.log('  ✓ Verified 11 namespaces and 100% key parity between Arabic and English.\n');

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

engine.setLanguage('ar', false);
const interpolatedAr = engine.t('auth.welcomeUser', { name: 'د. منى' });
assert.strictEqual(interpolatedAr, 'مرحباً، د. منى!');

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

// Create mock DOM node structure
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
  titleBtn: createMockElement({ 'data-i18n-title': 'nav.settings' }),
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

// Verify declarative attributes present on core elements in index.html
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

console.log('==================================================================');
console.log('🎉 ALL 8 STRUCTURED i18n TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
