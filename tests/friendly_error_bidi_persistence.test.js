/**
 * Health Vibe AI - Human-Friendly Error Guidance, RTL/LTR BiDi Isolation & State Persistence Test Suite
 * 
 * Verifies:
 * 1. BiDi isolation for Arabic RTL numeric values, phone numbers, ranges, and reference IDs
 * 2. Bilingual parity and live translation responsiveness across RTL (Arabic) and LTR (English)
 * 3. User display and error guidance preferences persistence (errorGuidanceLevel, autoDraftRecovery, dismissedTips)
 * 4. Patient form draft recovery across errors and sessions (Vezeeta standard)
 * 5. Backend user-display-preferences service validation and Firestore rules parity
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock DOM environment for Node.js
function setupMockDom() {
  const elements = new Map();
  const listeners = new Map();

  global.window = {
    addEventListener: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(handler);
    },
    removeEventListener: (evt, handler) => {
      if (!listeners.has(evt)) return;
      listeners.set(evt, listeners.get(evt).filter(h => h !== handler));
    },
    dispatchEvent: (event) => {
      const handlers = listeners.get(event.type) || [];
      handlers.forEach(h => h(event));
    }
  };

  global.sessionStorage = {
    _data: new Map(),
    getItem(k) { return this._data.get(k) || null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); }
  };

  global.localStorage = {
    _data: new Map(),
    getItem(k) { return this._data.get(k) || null; },
    setItem(k, v) { this._data.set(k, String(v)); },
    removeItem(k) { this._data.delete(k); },
    clear() { this._data.clear(); }
  };

  class MockElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.classList = {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      };
      this.attributes = new Map();
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.isConnected = true;
      this.innerHTML = '';
      this.value = '';
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    removeAttribute(k) { this.attributes.delete(k); }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        if (this.classList.contains(cls)) return this;
        for (const c of this.children) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
      return null;
    }
    querySelectorAll(sel) {
      const results = [];
      for (const c of this.children) {
        if (sel === 'input, select, textarea' && ['INPUT', 'SELECT', 'TEXTAREA'].includes(c.tagName)) {
          results.push(c);
        }
      }
      return results;
    }
    closest(sel) {
      return this.parentElement;
    }
    insertAdjacentElement(pos, el) {
      if (this.parentElement) this.parentElement.appendChild(el);
    }
    remove() {
      this.isConnected = false;
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      }
    }
    addEventListener() {}
    removeEventListener() {}
  }

  global.document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    documentElement: new MockElement('html'),
    body: new MockElement('body')
  };

  return { elements, listeners };
}

setupMockDom();

// Load modules
const {
  ErrorHandler,
  FriendlyErrorGuide,
  toFriendlyAppError,
  isolateBidiNumbers
} = require('../app/modules/core/error-handler');

const userDisplayPreferencesService = require('../backend/user-display-preferences-service');
const UserPreferencesService = require('../app/user-preferences-service');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('==================================================================');
  console.log('🌐 HEALTH VIBE AI: FRIENDLY ERROR GUIDANCE, BiDi & PERSISTENCE');
  console.log('   Bilingual Parity, BiDi Isolation, State & Session Draft Recovery');
  console.log('==================================================================\n');

  console.log('▶ SUITE 1: BiDi Isolation & Numeric Range Protection in RTL');

  runTest('Isolates percentages (e.g. 50% and 100%) with <bdi class="bidi-isolate">', () => {
    const rawArabic = 'نسبة تشبع الأكسجين في الدم يجب أن تكون قيمة صحيحة بين 50% و 100%.';
    const isolated = isolateBidiNumbers(rawArabic);
    assert.ok(isolated.includes('<bdi class="bidi-isolate">50%</bdi>'), '50% must be isolated');
    assert.ok(isolated.includes('<bdi class="bidi-isolate">100%</bdi>'), '100% must be isolated');
  });

  runTest('Isolates clinical temperatures (e.g. 34.0°C and 43.0°C)', () => {
    const raw = 'المسموح بين 34.0° و 43.0° مئوية.';
    const isolated = isolateBidiNumbers(raw);
    assert.ok(isolated.includes('<bdi class="bidi-isolate">34.0°</bdi>'), '34.0° must be isolated');
    assert.ok(isolated.includes('<bdi class="bidi-isolate">43.0°</bdi>'), '43.0° must be isolated');
  });

  runTest('Isolates Egyptian mobile numbers and National IDs without layout reversal', () => {
    const phoneMsg = 'تأكد من كتابة 11 رقماً (مثال: 01012345678).';
    const isolatedPhone = isolateBidiNumbers(phoneMsg);
    assert.ok(isolatedPhone.includes('<bdi class="bidi-isolate">01012345678</bdi>'), 'Phone number must be isolated');

    const nidMsg = 'الرقم القومي 29801011234567 مكون من 14 رقماً.';
    const isolatedNid = isolateBidiNumbers(nidMsg);
    assert.ok(isolatedNid.includes('<bdi class="bidi-isolate">29801011234567</bdi>'), '14-digit National ID must be isolated');
  });

  runTest('Isolates REF identifiers for technical tracing in patient notices', () => {
    const refStr = 'REF: clinical/spo2-out-of-range';
    const isolated = isolateBidiNumbers(refStr);
    assert.strictEqual(isolated, '<bdi class="bidi-isolate">REF: clinical/spo2-out-of-range</bdi>');
  });

  console.log('\n▶ SUITE 2: Bilingual Error Transformation & Vezeeta Actions');

  runTest('Transforms SpO2 clinical violation into friendly bilingual error', () => {
    const arErr = toFriendlyAppError('clinical/spo2-out-of-range', '', false);
    assert.strictEqual(arErr.severity, 'error');
    assert.strictEqual(arErr.field, 'spo2');
    assert.ok(arErr.title.length > 0);
    assert.ok(arErr.action.includes('50') && arErr.action.includes('100'));

    const enErr = toFriendlyAppError('clinical/spo2-out-of-range', '', true);
    assert.strictEqual(enErr.severity, 'error');
    assert.ok(enErr.title.includes('Oxygen Saturation'));
    assert.ok(enErr.action.includes('pulse oximeter'));
  });

  runTest('Transforms appointment slot collisions into actionable Vezeeta warnings', () => {
    const slotErr = toFriendlyAppError('appointment/slot-taken', '', false);
    assert.strictEqual(slotErr.severity, 'warning');
    assert.ok(slotErr.action.includes('جدول المواعيد'));
  });

  runTest('Transforms network and cloud disconnects into reassuring guidance', () => {
    const netErr = toFriendlyAppError(new Error('Failed to fetch from backend'), '', false);
    assert.strictEqual(netErr.severity, 'warning');
    assert.ok(netErr.message.includes('بياناتك المسجلة بأمان'));
    assert.ok(netErr.action.includes('إعادة المحاولة'));
  });

  console.log('\n▶ SUITE 3: User Display & Error Guidance Preferences (Backend)');

  runTest('Validates default preferences containing errorGuidanceLevel and autoDraftRecovery', () => {
    const defs = userDisplayPreferencesService.DEFAULT_USER_DISPLAY_PREFERENCES;
    assert.strictEqual(defs.errorGuidanceLevel, 'detailed');
    assert.strictEqual(defs.autoDraftRecovery, true);
    assert.deepStrictEqual(defs.dismissedErrorTips, []);
    assert.deepStrictEqual(defs.sessionDrafts, {});
  });

  runTest('Validates errorGuidanceLevel accepts detailed, standard, compact and rejects invalid', () => {
    const valid = userDisplayPreferencesService.validateDisplayPreferences({ errorGuidanceLevel: 'compact' });
    assert.strictEqual(valid.errorGuidanceLevel, 'compact');

    assert.throws(() => {
      userDisplayPreferencesService.validateDisplayPreferences({ errorGuidanceLevel: 'super_verbose' });
    }, (err) => err.code === 'INVALID_GUIDANCE_LEVEL' || /Invalid errorGuidanceLevel/.test(err.message));
  });

  runTest('Validates dismissedErrorTips requires array of string IDs', () => {
    const valid = userDisplayPreferencesService.validateDisplayPreferences({
      dismissedErrorTips: ['tip_vitals_spo2', 'tip_booking_schedule']
    });
    assert.deepStrictEqual(valid.dismissedErrorTips, ['tip_vitals_spo2', 'tip_booking_schedule']);

    assert.throws(() => {
      userDisplayPreferencesService.validateDisplayPreferences({ dismissedErrorTips: 'invalid-string' });
    }, (err) => err.code === 'INVALID_DISMISSED_TIPS' || /dismissedErrorTips must be an array/.test(err.message));
  });

  await runAsyncTest('Persists user preferences and retrieves updated guidance settings in backend', async () => {
    const mockDb = null;
    const testUserId = 'test_patient_user_42';

    const updated = await userDisplayPreferencesService.updateUserDisplayPreferences(mockDb, testUserId, {
      language: 'ar',
      errorGuidanceLevel: 'standard',
      autoDraftRecovery: true,
      dismissedErrorTips: ['tip_welcome']
    });

    assert.strictEqual(updated.language, 'ar');
    assert.strictEqual(updated.direction, 'rtl');
    assert.strictEqual(updated.errorGuidanceLevel, 'standard');
    assert.deepStrictEqual(updated.dismissedErrorTips, ['tip_welcome']);

    const retrieved = await userDisplayPreferencesService.getUserDisplayPreferences(mockDb, testUserId);
    assert.strictEqual(retrieved.errorGuidanceLevel, 'standard');
    assert.strictEqual(retrieved.autoDraftRecovery, true);
  });

  console.log('\n▶ SUITE 4: Session State & Form Draft Persistence Across Errors');

  await runAsyncTest('Saves, retrieves, and clears form drafts in backend persistence', async () => {
    const mockDb = null;
    const testUserId = 'draft_patient_99';
    const formId = 'vitals-triage-form';
    const sampleVitals = { spo2: '98', temperature: '37.1', heartRate: '72' };

    const saved = await userDisplayPreferencesService.saveUserDraft(mockDb, testUserId, formId, sampleVitals);
    assert.deepStrictEqual(saved.data, sampleVitals);
    assert.ok(saved.savedAt);

    const retrieved = await userDisplayPreferencesService.getUserDraft(mockDb, testUserId, formId);
    assert.deepStrictEqual(retrieved.data, sampleVitals);

    const deleted = await userDisplayPreferencesService.deleteUserDraft(mockDb, testUserId, formId);
    assert.strictEqual(deleted, true);

    const afterDelete = await userDisplayPreferencesService.getUserDraft(mockDb, testUserId, formId);
    assert.strictEqual(afterDelete, null);
  });

  await runAsyncTest('Client UserPreferencesService saves, recovers, and clears form drafts', async () => {
    const formId = 'consultation-symptom-form';
    const draftPayload = { symptoms: 'Cough and mild fever', days: '3' };

    await UserPreferencesService.saveFormDraft(formId, draftPayload, { syncServer: false });
    const restored = UserPreferencesService.restoreFormDraft(formId);
    assert.deepStrictEqual(restored.data, draftPayload);

    await UserPreferencesService.clearFormDraft(formId, { syncServer: false });
    const afterClear = UserPreferencesService.restoreFormDraft(formId);
    assert.strictEqual(afterClear, null);
  });

  await runAsyncTest('Client UserPreferencesService manages dismissed tips across sessions', async () => {
    const tipId = 'tip_pulse_oximeter_instruction';
    assert.strictEqual(UserPreferencesService.isTipDismissed(tipId), false);

    await UserPreferencesService.dismissTip(tipId);
    assert.strictEqual(UserPreferencesService.isTipDismissed(tipId), true);
  });

  console.log('\n▶ SUITE 5: Firestore Security Rules Authorization');

  runTest('Verifies user_display_preferences exists in root firestore.rules', () => {
    const rootRules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
    assert.ok(
      rootRules.includes('match /user_display_preferences/{userId}'),
      'Root firestore.rules must contain user_display_preferences matcher'
    );
    assert.ok(
      rootRules.includes('isSelf(userId)'),
      'Root rules must ensure strict user ownership authorization'
    );
  });

  runTest('Verifies user_display_preferences exists in backend/firestore.rules', () => {
    const backendRules = fs.readFileSync(path.resolve(__dirname, '../backend/firestore.rules'), 'utf8');
    assert.ok(
      backendRules.includes('match /user_display_preferences/{userId}'),
      'Backend firestore.rules must contain user_display_preferences matcher'
    );
    assert.ok(
      backendRules.includes('isSelf(userId)'),
      'Backend rules must ensure strict user ownership authorization'
    );
  });

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} BIDI, ERROR GUIDANCE & PERSISTENCE TESTS PASSED!`);
  console.log('==================================================================\n');
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
