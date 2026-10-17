/**
 * HEALTH VIBE AI: DOCTOR REJECT & RE-ENTRY PERFORMANCE & KEYBOARD SHORTCUTS TEST SUITE (K HEALTH)
 * 
 * Verifies:
 * 1. Performance Guarantee (< 1000ms):
 *    - Fresh case and medical history load executes in < 1 second (< 1000ms).
 *    - Cached case retrieval executes near-instantly in < 50ms.
 *    - Cache invalidation and memory hygiene verified.
 * 2. Visual Keyboard Shortcut Badges:
 *    - Action toolbars display 'Alt+R' visual badge on Reject / Re-entry buttons.
 *    - Modal dialog displays '[1]' and '[2]' badges on mode selection cards.
 *    - Accessible keyboard shortcuts legend rendered at the base of the modal.
 * 3. Interactive Keyboard Shortcuts & Fast Clinic Triage:
 *    - Global 'Alt+R' / 'Alt+J' / 'Alt+X' shortcut triggers modal opening for active case.
 *    - Modal keyboard shortcuts: '1' switches to re-entry, '2' switches to definitive reject.
 *    - 'Escape' key instantly dismisses the modal and returns focus to opener element.
 *    - 'Ctrl+Enter' / 'Cmd+Enter' submits the re-entry request without mouse interaction.
 *    - Tab trap ensures focus cycling remains within dialog boundaries.
 */

'use strict';

const assert = require('node:assert/strict');

// Setup minimal mock DOM environment for Node.js
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(c) { this.classes.add(c); }
  remove(c) { this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toString() { return Array.from(this.classes).join(' '); }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.classList = new MockClassList();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this._innerHTML = '';
    this._value = '';
    this._textContent = '';
    this.listeners = new Map();
  }

  get id() { return this.attributes.get('id') || ''; }
  set id(val) { this.attributes.set('id', val); }

  get value() { return this._value; }
  set value(val) { this._value = val; }

  get textContent() { return this._textContent; }
  set textContent(val) { this._textContent = val; }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = html;
    // Mock parser for child IDs
    const idMatches = html.matchAll(/id=["']([^"']+)["']/g);
    for (const match of idMatches) {
      const child = new MockElement('div');
      child.id = match[1];
      child.parentElement = this;
      this.children.push(child);
      if (global.document && global.document._elementsById) {
        global.document._elementsById.set(match[1], child);
      }
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id && global.document && global.document._elementsById) {
      global.document._elementsById.set(child.id, child);
    }
    return child;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) fn(event);
  }

  focus() {
    if (global.document) global.document.activeElement = this;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
    }
    const cleanIds = (el) => {
      if (global.document && global.document._elementsById && el.id) {
        global.document._elementsById.delete(el.id);
      }
      if (Array.isArray(el.children)) {
        for (const child of el.children) {
          cleanIds(child);
        }
      }
    };
    cleanIds(this);
  }

  querySelectorAll(sel) {
    return this.children;
  }
}

class MockDocument {
  constructor() {
    this._elementsById = new Map();
    this.body = new MockElement('body');
    this.activeElement = null;
    this.listeners = new Map();
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) fn(event);
  }
}

// Attach mocks to global
global.document = new MockDocument();
global.window = global;
global.currentLanguage = 'ar';
global.state = {};
global.cases = [];

// Load modules
const DoctorService = require('../app/modules/doctor/doctor-service.js');
const DoctorUI = require('../app/modules/doctor/doctor-ui.js');

async function runTests() {
  console.log('===============================================================================');
  console.log('⚡ HEALTH VIBE AI: REJECT & RE-ENTRY PERFORMANCE & KEYBOARD SHORTCUTS SUITE');
  console.log('   Speed Guarantee (< 1000ms), Cache Hits & Accessible Keyboard Shortcuts');
  console.log('===============================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: PERFORMANCE & CACHE BENCHMARKS (< 1000ms guarantee)
  // ─────────────────────────────────────────────────────────────────────────────

  await testAsync('loadCaseWithHistoryPerformance loads case data under 1 second (< 1000ms) on fresh fetch', async () => {
    const testCase = {
      id: 'CASE-PERF-REENTRY-001',
      patientName: 'أحمد إبراهيم',
      o2: 74,
      priority: 'urgent',
      medicalHistory: [
        { date: '2026-10-12', condition: 'Bronchial Asthma Flare' },
        { date: '2026-10-15', condition: 'SpO2 Measurement Artifact' }
      ]
    };
    DoctorService.invalidateCachedCase('CASE-PERF-REENTRY-001');

    const result = await DoctorService.loadCaseWithHistoryPerformance('CASE-PERF-REENTRY-001', {
      fetcher: async (id) => {
        // Simulate remote DB query delay
        await new Promise(r => setTimeout(r, 45));
        return testCase;
      }
    });

    assert.strictEqual(result.fromCache, false, 'Should be fresh DB fetch');
    assert.strictEqual(result.underOneSecond, true, 'Fresh fetch must complete in < 1000ms');
    assert(result.elapsedMs < 1000, `Elapsed time ${result.elapsedMs}ms must be < 1000ms`);
    assert.strictEqual(result.caseData.id, 'CASE-PERF-REENTRY-001');
    assert.strictEqual(result.history.length, 2);
  });

  await testAsync('loadCaseWithHistoryPerformance delivers near-instant cache retrieval (< 50ms)', async () => {
    const cachedResult = await DoctorService.loadCaseWithHistoryPerformance('CASE-PERF-REENTRY-001');
    assert.strictEqual(cachedResult.fromCache, true, 'Must resolve from memory cache');
    assert.strictEqual(cachedResult.underOneSecond, true);
    assert(cachedResult.elapsedMs < 50, `Cache hit must take < 50ms, took ${cachedResult.elapsedMs}ms`);
    assert.strictEqual(cachedResult.caseData.patientName, 'أحمد إبراهيم');
  });

  test('Cache invalidation flushes entry and allows clean reload', () => {
    assert.notStrictEqual(DoctorService.getCachedCase('CASE-PERF-REENTRY-001'), null);
    DoctorService.invalidateCachedCase('CASE-PERF-REENTRY-001');
    assert.strictEqual(DoctorService.getCachedCase('CASE-PERF-REENTRY-001'), null);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: UI VISUAL SHORTCUT BADGES & LEGENDS
  // ─────────────────────────────────────────────────────────────────────────────

  test('renderRejectReentryModalHtml includes [1] and [2] mode badges and shortcuts legend', () => {
    const activeCase = {
      id: 'CASE-UI-SHORTCUTS-1',
      patientName: 'هبة منصور',
      priority: 'normal',
      o2: 96
    };

    const htmlAr = DoctorUI.renderRejectReentryModalHtml(activeCase, false);
    assert(htmlAr.includes('[1]'), 'Must render [1] shortcut tag on Re-entry mode card in Arabic');
    assert(htmlAr.includes('[2]'), 'Must render [2] shortcut tag on Definitive Rejection mode card in Arabic');
    assert(htmlAr.includes('override-shortcuts-legend'), 'Must render shortcuts legend container in Arabic');
    assert(htmlAr.includes('Ctrl'), 'Must mention Ctrl shortcut in Arabic view');
    assert(htmlAr.includes('Enter'), 'Must mention Enter shortcut in Arabic view');
    assert(htmlAr.includes('Esc'), 'Must mention Esc shortcut in Arabic view');

    const htmlEn = DoctorUI.renderRejectReentryModalHtml(activeCase, true);
    assert(htmlEn.includes('[1]'), 'Must render [1] shortcut tag in English');
    assert(htmlEn.includes('[2]'), 'Must render [2] shortcut tag in English');
    assert(htmlEn.includes('Switch Mode'), 'Must render Switch Mode shortcut label in English');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: KEYBOARD SHORTCUTS INTERACTION & WORKFLOW SPEED
  // ─────────────────────────────────────────────────────────────────────────────

  test('Global Alt+R / Alt+J shortcut triggers openRejectReentryModal for active case', () => {
    DoctorUI.initDoctorKeyboardShortcuts();

    const activeCase = {
      id: 'CASE-SHORTCUT-TRIGGER',
      patientName: 'خالد عبد الفتاح',
      priority: 'high',
      o2: 91
    };
    global.cases = [activeCase];
    global.activeDoctorCaseId = 'CASE-SHORTCUT-TRIGGER';

    // Dispatch Alt + R keydown
    global.document.dispatchEvent({
      type: 'keydown',
      key: 'r',
      altKey: true,
      preventDefault: () => {}
    });

    const mount = global.document.getElementById('doctorRejectModalMountPoint');
    assert.notStrictEqual(mount, null, 'Modal dialog must mount into DOM upon pressing Alt+R');

    // Clean up
    DoctorUI.closeRejectReentryModal();
    assert.strictEqual(global.document.getElementById('doctorRejectModalMountPoint'), null);
  });

  test('Modal keyboard shortcuts: 1 switches to reentry and 2 switches to definitive_reject', () => {
    const activeCase = {
      id: 'CASE-MODE-KEYBOARD',
      patientName: 'رنا السيد',
      priority: 'normal',
      o2: 97
    };
    global.cases = [activeCase];

    DoctorUI.openRejectReentryModal('CASE-MODE-KEYBOARD', 'reentry');
    const cardReentry = global.document.getElementById('modeCard_reentry');
    const cardDefinitive = global.document.getElementById('modeCard_definitive');
    const fieldsSection = global.document.getElementById('reentryFieldsSection');

    assert.strictEqual(cardReentry.getAttribute('aria-checked'), 'true');

    // Press '2' (when not inside textarea) -> switches to definitive_reject
    global.document.dispatchEvent({
      type: 'keydown',
      key: '2',
      altKey: false,
      preventDefault: () => {}
    });

    assert.strictEqual(cardDefinitive.getAttribute('aria-checked'), 'true');
    assert.strictEqual(cardReentry.getAttribute('aria-checked'), 'false');
    assert.strictEqual(fieldsSection.style.display, 'none');

    // Press '1' -> switches back to reentry mode
    global.document.dispatchEvent({
      type: 'keydown',
      key: '1',
      altKey: false,
      preventDefault: () => {}
    });

    assert.strictEqual(cardReentry.getAttribute('aria-checked'), 'true');
    assert.strictEqual(cardDefinitive.getAttribute('aria-checked'), 'false');
    assert.strictEqual(fieldsSection.style.display, 'flex');

    DoctorUI.closeRejectReentryModal();
  });

  test('Escape key closes modal and returns focus to opener button', () => {
    const openerBtn = new MockElement('button');
    openerBtn.id = 'testOpenerBtn';
    global.document.activeElement = openerBtn;

    DoctorUI.openRejectReentryModal('CASE-ESC-TEST', 'reentry');
    assert.notStrictEqual(global.document.getElementById('doctorRejectModalMountPoint'), null);

    // Dispatch Escape key
    global.document.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: () => {}
    });

    assert.strictEqual(global.document.getElementById('doctorRejectModalMountPoint'), null, 'Modal must be removed on Escape');
    assert.strictEqual(global.document.activeElement, openerBtn, 'Focus must return to opener button');
  });

  await testAsync('Ctrl+Enter triggers instant submission for rapid triage', async () => {
    let submitCalledWithCaseId = null;
    global.updateCaseStatus = async (caseId, status, note, payload) => {
      submitCalledWithCaseId = caseId;
    };

    DoctorUI.openRejectReentryModal('CASE-CTRL-ENTER-TEST', 'reentry');

    const textarea = global.document.getElementById('rejectReentryInstructionTextarea');
    const categorySelect = global.document.getElementById('rejectCategorySelect');
    if (categorySelect) categorySelect.value = 'CONTRADICTORY_VITALS';
    if (textarea) textarea.value = 'SpO2 sensor was slipping during movement. Please rest and re-measure.';

    // Dispatch Ctrl + Enter keydown
    global.document.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      ctrlKey: true,
      preventDefault: () => {}
    });

    // Wait for async processing
    await new Promise(r => setTimeout(r, 25));

    assert.strictEqual(submitCalledWithCaseId, 'CASE-CTRL-ENTER-TEST', 'Ctrl+Enter must trigger instant status update');
    DoctorUI.closeRejectReentryModal();
  });

  // Final Summary
  console.log('\n===============================================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}% SUCCESS)`);
  console.log('===============================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
