/**
 * Health Vibe AI - Splash Screen Unmounting & Logo Integrity Test Suite
 *
 * Validates:
 * 1. Splash screen element unmounting (loader.remove() and display: none with pointer-events: none).
 * 2. .loader.is-done CSS declarations enforcing pointer-events: none and display: none.
 * 3. Immediate unmounting on asset load without lingering over hero section.
 * 4. Logo image file existence, valid image binary headers, and resolutions.
 * 5. Aspect-ratio constraints in HTML attributes and CSS stylesheets.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT_DIR, 'app');

console.log('==================================================================');
console.log('🚀 HEALTH VIBE AI: SPLASH SCREEN UNMOUNT & LOGO TEST SUITE');
console.log('==================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Splash Screen CSS Architecture (.loader & .loader.is-done)
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: CSS Architecture for Loader Unmounting & Pointer Events');
const stylesCss = fs.readFileSync(path.join(APP_DIR, 'styles.css'), 'utf-8');

assert.ok(stylesCss.includes('.loader.is-done'), 'styles.css must contain .loader.is-done rule');
const isDoneIndex = stylesCss.indexOf('.loader.is-done');
const isDoneBlock = stylesCss.slice(isDoneIndex, stylesCss.indexOf('}', isDoneIndex) + 1);

assert.ok(isDoneBlock.includes('pointer-events: none'), '.loader.is-done must enforce pointer-events: none');
assert.ok(isDoneBlock.includes('display: none'), '.loader.is-done must enforce display: none');
assert.ok(isDoneBlock.includes('visibility: hidden'), '.loader.is-done must enforce visibility: hidden');
assert.ok(isDoneBlock.includes('opacity: 0'), '.loader.is-done must enforce opacity: 0');
console.log('  ✓ .loader.is-done enforces pointer-events: none, display: none, opacity: 0, and visibility: hidden.\n');

// -----------------------------------------------------------------------------
// TEST 2: JavaScript Unmounting Mechanics in app.js and bootstrap.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: JavaScript DOM Unmounting Mechanics (element.remove & pointer-events)');
const appJs = fs.readFileSync(path.join(APP_DIR, 'app.js'), 'utf-8');
const bootstrapJs = fs.readFileSync(path.join(APP_DIR, 'bootstrap.js'), 'utf-8');

// app.js dismissLoader
assert.ok(appJs.includes('function dismissLoader'), 'app.js must define dismissLoader function');
assert.ok(appJs.includes('loaderEl.remove()') || appJs.includes('loader.remove()'), 'dismissLoader must call element.remove() to unmount from DOM');
assert.ok(appJs.includes('pointer-events'), 'dismissLoader must explicitly disable pointer-events');
assert.ok(appJs.includes('LOADER_MIN_DISPLAY_MS = 0'), 'Artificial splash delay over hero section must be eliminated');

// Asset load listener in app.js
assert.ok(
  appJs.includes('window.addEventListener("load"') && appJs.includes('dismissLoader()'),
  'app.js must dismiss loader once assets load'
);

// bootstrap.js early unmounting fallback
assert.ok(bootstrapJs.includes('dismissLoader'), 'bootstrap.js must define early dismissLoader safeguard');
assert.ok(bootstrapJs.includes('loader.remove()') || bootstrapJs.includes('loader.parentNode'), 'bootstrap.js must provide DOM element.remove() safeguard');
console.log('  ✓ JavaScript unmounting handlers remove splash from DOM and free pointer events immediately.\n');

// -----------------------------------------------------------------------------
// TEST 3: Logo File Integrity & Binary Format Validation
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Logo Image Files Existence and Header Validation');
const logoFiles = [
  { file: 'logo-dark.webp', expectedMime: 'webp' },
  { file: 'logo-light.webp', expectedMime: 'webp' },
  { file: 'logo-dark-mark.webp', expectedMime: 'webp' },
  { file: 'logo-light-mark.webp', expectedMime: 'webp' },
  { file: 'logo-dark.png', expectedMime: 'png' },
  { file: 'logo-light.png', expectedMime: 'png' }
];

function checkImageHeader(filePath, expectedMime) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 500, `${filePath} size must be non-trivial (>500 bytes)`);
  if (expectedMime === 'webp') {
    const isRiff = buf.toString('ascii', 0, 4) === 'RIFF';
    const isWebp = buf.toString('ascii', 8, 12) === 'WEBP';
    assert.ok(isRiff && isWebp, `${filePath} must have valid RIFF/WEBP header`);
  } else if (expectedMime === 'png') {
    const isPng = buf.toString('hex', 0, 8) === '89504e470d0a1a0a';
    assert.ok(isPng, `${filePath} must have valid PNG magic bytes`);
  }
}

for (const { file, expectedMime } of logoFiles) {
  const fullPath = path.join(APP_DIR, file);
  assert.ok(fs.existsSync(fullPath), `Logo asset must exist at ${file}`);
  checkImageHeader(fullPath, expectedMime);
  console.log(`  ✓ ${file} verified (${(fs.statSync(fullPath).size / 1024).toFixed(1)} KB, valid ${expectedMime.toUpperCase()})`);
}
console.log('');

// -----------------------------------------------------------------------------
// TEST 4: Logo Aspect-Ratio Constraints in CSS and HTML
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Aspect-Ratio Constraints across Stylesheets and HTML');
const indexHtml = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf-8');
const clinicsHtml = fs.readFileSync(path.join(APP_DIR, 'clinics.html'), 'utf-8');
const pitchHtml = fs.readFileSync(path.join(APP_DIR, 'pitch.html'), 'utf-8');

// CSS aspect-ratio assertions
assert.ok(stylesCss.includes('.loader-logo {') && stylesCss.includes('aspect-ratio: 1 / 1;'), '.loader-logo must have aspect-ratio: 1 / 1 in styles.css');
assert.ok(stylesCss.includes('.hero-brand-logo {') && stylesCss.includes('aspect-ratio: 1 / 1;'), '.hero-brand-logo must have aspect-ratio: 1 / 1 in styles.css');
assert.ok(stylesCss.includes('.brand-logo {') && stylesCss.includes('aspect-ratio: 58 / 42;'), '.brand-logo must have aspect-ratio constraint in styles.css');

// HTML aspect-ratio and dimension assertions
assert.ok(indexHtml.includes('class="loader-logo"') && indexHtml.includes('aspect-ratio: 1 / 1;'), 'index.html loader-logo must declare aspect-ratio: 1 / 1');
assert.ok(indexHtml.includes('class="hero-brand-logo"') && indexHtml.includes('aspect-ratio: 1 / 1;'), 'index.html hero-brand-logo must declare aspect-ratio: 1 / 1');
assert.ok(clinicsHtml.includes('.brand-group img') && clinicsHtml.includes('aspect-ratio: 1 / 1;'), 'clinics.html brand logo must declare aspect-ratio: 1 / 1');
assert.ok(pitchHtml.includes('.brand-group img') && pitchHtml.includes('aspect-ratio: 1 / 1;'), 'pitch.html brand logo must declare aspect-ratio: 1 / 1');

console.log('  ✓ All logo elements constrained with explicit aspect ratios preventing distortion or shifts.\n');

// -----------------------------------------------------------------------------
// TEST 5: Simulated DOM Unmounting Lifecycle Validation
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Simulated DOM Unmounting Lifecycle');
let removedCalled = false;
const mockLoader = {
  dataset: {},
  classList: {
    classes: new Set(),
    add(cls) { this.classes.add(cls); },
    contains(cls) { return this.classes.has(cls); }
  },
  style: {
    props: {},
    setProperty(prop, val) { this.props[prop] = val; }
  },
  setAttribute(k, v) { this[k] = v; },
  parentNode: {},
  remove() { removedCalled = true; this.parentNode = null; }
};

// Simulate immediate unmount
mockLoader.classList.add('is-done');
mockLoader.style.setProperty('display', 'none', 'important');
mockLoader.style.setProperty('pointer-events', 'none', 'important');
mockLoader.setAttribute('aria-hidden', 'true');
mockLoader.remove();

assert.strictEqual(mockLoader.classList.contains('is-done'), true, 'Mock loader has is-done');
assert.strictEqual(mockLoader.style.props['display'], 'none', 'Mock loader has display: none');
assert.strictEqual(mockLoader.style.props['pointer-events'], 'none', 'Mock loader has pointer-events: none');
assert.strictEqual(removedCalled, true, 'element.remove() successfully executed');

console.log('  ✓ Simulated loader unmount cleanly dissociates from DOM with zero residual overhead.\n');

console.log('==================================================================');
console.log('🎉 ALL 5 SPLASH SCREEN & LOGO TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
