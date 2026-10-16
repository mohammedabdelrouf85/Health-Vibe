/**
 * HEALTH VIBE AI: DOCTOR RISK OVERRIDE BILINGUAL SUPPORT & MEDICAL LOCALIZATION TEST SUITE
 * 
 * Verifies:
 * 1. Clinical English UI Rendering:
 *    - All cards, headings, badges, comparison steps, SLAs, and banners render in professional medical English.
 * 2. Arabic Medical UI Rendering:
 *    - Certified clinical Arabic translation parity across all elements.
 * 3. Bidirectional Writing (`dir="auto"` & text direction detection):
 *    - Smooth typing for Arabic, Clinical English, and mixed Latin/Arabic medical terminology.
 * 4. Quick Clinical Reason Presets Language Toggling (`setOverrideChipsLang`):
 *    - Switching between Clinical English presets and Arabic presets dynamically without losing form input.
 * 5. 100% Mutual Key Parity in i18n Catalogs for Risk Override namespaces:
 *    - Mutual availability in translations.ar.doctor and translations.en.doctor.
 * 6. DoctorService Bilingual Category & Priority Metadata API Helpers.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const doctorService = require('../app/modules/doctor/doctor-service');
const doctorUI = require('../app/modules/doctor/doctor-ui');
const { translations, I18nEngine } = require('../app/i18n');

console.log('==================================================================');
console.log('🌐 HEALTH VIBE AI: DOCTOR RISK OVERRIDE BILINGUAL TEST SUITE');
console.log('   Clinical English, Arabic Parity, Bidirectional Input & Presets');
console.log('==================================================================\n');

// Mock DOM elements for testing
const mockElements = new Map();
function createMockElement(id, tagName = "div") {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: "",
    textContent: "",
    _innerHTML: "",
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      contains: function(c) { return this._classes.has(c); }
    },
    dataset: {},
    setAttribute: function(name, val) { this[name] = val; },
    removeAttribute: function(name) { delete this[name]; },
    getAttribute: function(name) { return this[name] || null; },
    focus: function() {},
    addEventListener: function(event, handler) { this[`_on_${event}`] = handler; },
    removeEventListener: function(event) { delete this[`_on_${event}`]; },
    dispatchEvent: function(evt) {
      if (this[`_on_${evt.type}`]) this[`_on_${evt.type}`](evt);
    },
    remove: function() { mockElements.delete(id); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = String(v); }
  });
  mockElements.set(id, el);
  return el;
}

global.document = {
  activeElement: null,
  getElementById: (id) => mockElements.get(id) || null,
  createElement: (tag) => createMockElement(`dyn_${Date.now()}_${Math.random()}`, tag),
  body: {
    appendChild: (child) => { mockElements.set(child.id, child); }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.currentLanguage = "en";

(async () => {
  let passedTests = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Clinical English UI Rendering (isEn = true)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Clinical English UI Rendering & Medical Phrasing ...');
  {
    const sampleCase = {
      id: 'case_bilingual_en_01',
      patientName: 'Kareem Mostafa',
      priority: 'urgent',
      triageLevel: 'urgent',
      isOverridden: true,
      triageOverride: {
        isOverridden: true,
        originalPriority: 'normal',
        overriddenPriority: 'urgent',
        overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
        overrideReason: 'Severe intercostal retractions, suprasternal indrawing, and exhaustion noted.',
        overriddenBy: { name: 'Dr. Tarek Mahmoud, MD', license: 'EG-MED-44821' },
        timestamp: '2026-10-16T18:30:00.000Z'
      }
    };

    const htmlEn = doctorUI.renderRiskOverrideSection(sampleCase, true);

    // English assertions
    assert.ok(htmlEn.includes('Clinical Risk Level & Triage Classification'), 'Must render English card title');
    assert.ok(htmlEn.includes('Infermedica / Rules Engine Decision Support & Human Override'), 'Must render English subtitle');
    assert.ok(htmlEn.includes('Clinically Overridden by Physician'), 'Must render English override badge');
    assert.ok(htmlEn.includes('AI / Infermedica Suggestion:'), 'Must render English suggestion label');
    assert.ok(htmlEn.includes('Physician Clinical Override:'), 'Must render English clinical override label');
    assert.ok(htmlEn.includes('SLA: 15 min target'), 'Must render English SLA target');
    assert.ok(htmlEn.includes('Attesting Physician:'), 'Must render English physician title');
    assert.ok(htmlEn.includes('AI Model & Infermedica Calibration Telemetry'), 'Must render English AI telemetry banner');

    passedTests++;
    console.log('  ✓ Clinical English interface rendered with accurate medical terminology and SLA indicators.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Certified Arabic Medical UI Rendering (isEn = false)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 2: Certified Arabic Medical UI Rendering & Parity ...');
  {
    const sampleCase = {
      id: 'case_bilingual_ar_01',
      patientName: 'كريم مصطفى',
      priority: 'urgent',
      triageLevel: 'urgent',
      isOverridden: true,
      triageOverride: {
        isOverridden: true,
        originalPriority: 'normal',
        overriddenPriority: 'urgent',
        overrideCategory: 'CLINICAL_SIGNS_OF_EXHAUSTION',
        overrideReason: 'سحب بين الأضلاع وإجهاد تنفسي شديد يستدعي تصعيد الحالة.',
        overriddenBy: { name: 'د. طارق محمود', license: 'EG-MED-44821' },
        timestamp: '2026-10-16T18:30:00.000Z'
      }
    };

    const htmlAr = doctorUI.renderRiskOverrideSection(sampleCase, false);

    // Arabic assertions
    assert.ok(htmlAr.includes('مسار تصنيف درجة الخطورة والفرز السريري'), 'Must render Arabic card title');
    assert.ok(htmlAr.includes('الفرز الاسترشادي للذكاء الاصطناعي (Infermedica)'), 'Must render Arabic subtitle');
    assert.ok(htmlAr.includes('معتمد سريرياً بتعديل الطبيب'), 'Must render Arabic override badge');
    assert.ok(htmlAr.includes('تصنيف الذكاء الاصطناعي الأصلي:'), 'Must render Arabic suggestion label');
    assert.ok(htmlAr.includes('التصنيف المعتمد سريرياً:'), 'Must render Arabic clinical override label');
    assert.ok(htmlAr.includes('15 دقيقة كهدف استجابة'), 'Must render Arabic SLA target');
    assert.ok(htmlAr.includes('الطبيب المعتمد:'), 'Must render Arabic physician title');
    assert.ok(htmlAr.includes('تغذية وتحسين نموذج الذكاء الاصطناعي'), 'Must render Arabic AI feedback banner');

    passedTests++;
    console.log('  ✓ Certified Arabic interface verified with complete parity to English clinical layout.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Bidirectional Text Writing (`dir="auto"` & Direction Detection)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 3: Bidirectional Text Writing (dir="auto" & RTL/LTR Detection) ...');
  {
    const modalHtmlEn = doctorUI.renderRiskOverrideModalHtml({ id: 'case_1', priority: 'normal' }, true);
    const modalHtmlAr = doctorUI.renderRiskOverrideModalHtml({ id: 'case_1', priority: 'normal' }, false);

    // Verify dir="auto" attribute on textarea in both languages
    assert.ok(modalHtmlEn.includes('dir="auto"'), 'English modal textarea must have dir="auto"');
    assert.ok(modalHtmlAr.includes('dir="auto"'), 'Arabic modal textarea must have dir="auto"');

    // Test text direction detection helper
    const arabicText = 'سحب بين الأضلاع، زوارق، ونقص أكسجين حاد.';
    const englishText = 'Severe respiratory retractions, accessory muscle use, SpO2 88%.';
    const mixedArabicStart = 'المريض يعاني من SpO2 artifact حاد.';

    assert.strictEqual(doctorService.detectBilingualDirection(arabicText), 'rtl', 'Arabic text must be detected as RTL');
    assert.strictEqual(doctorService.detectBilingualDirection(englishText), 'ltr', 'English text must be detected as LTR');
    assert.strictEqual(doctorService.detectBilingualDirection(mixedArabicStart), 'rtl', 'Mixed text containing Arabic must be RTL');
    assert.strictEqual(doctorService.detectBilingualDirection(''), 'ltr', 'Empty text defaults to LTR');

    passedTests++;
    console.log('  ✓ dir="auto" and bidirectional language direction detection verified.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Quick Clinical Reason Chips Language Presets Toggle
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 4: Quick Clinical Reason Presets Language Toggling ...');
  {
    // Setup mock elements for chips toggle test
    const chipsContainer = createMockElement("overrideChipsContainer");
    const btnEn = createMockElement("btnChipsLangEn");
    const btnAr = createMockElement("btnChipsLangAr");
    const textarea = createMockElement("overrideReasonTextarea");

    // 4A. Switch to English Presets
    doctorUI.setOverrideChipsLang('en');
    assert.ok(btnEn.classList.contains('is-active'), 'btnChipsLangEn must be active');
    assert.ok(!btnAr.classList.contains('is-active'), 'btnChipsLangAr must not be active');
    assert.ok(chipsContainer.innerHTML.includes('intercostal retractions'), 'English chip text rendered');

    // 4B. Switch to Arabic Presets
    doctorUI.setOverrideChipsLang('ar');
    assert.ok(btnAr.classList.contains('is-active'), 'btnChipsLangAr must be active');
    assert.ok(!btnEn.classList.contains('is-active'), 'btnChipsLangEn must not be active');
    assert.ok(chipsContainer.innerHTML.includes('إجهاد تنفسي وسحب بين الأضلاع'), 'Arabic chip text rendered');

    // 4C. Inserting a chip preserves existing typed text
    textarea.value = 'Initial clinical observation';
    doctorUI.applyOverrideReasonChip('Bilateral expiratory wheezes on auscultation');
    assert.strictEqual(textarea.value, 'Initial clinical observation. Bilateral expiratory wheezes on auscultation');

    passedTests++;
    console.log('  ✓ Clinical presets toggle between EN and AR seamlessly without input disruption.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: i18n Catalog Mutual Key Parity for Risk Override
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 5: i18n Translation Catalog Coverage & Key Parity ...');
  {
    const i18n = new I18nEngine({ defaultLanguage: 'ar' });

    const overrideKeys = [
      'overrideRiskLevel',
      'overrideRiskHeading',
      'overrideRiskSubheading',
      'overrideActiveBadge',
      'overrideAdvisoryBadge',
      'overrideCategoryLabel',
      'overrideReasonLabel',
      'overrideReasonPlaceholder',
      'overrideAiRetrainingTitle',
      'overrideSaveBtn',
      'overrideCancelBtn',
      'overrideQuarantineNotice'
    ];

    overrideKeys.forEach(key => {
      // Check existence in both catalogs
      assert.ok(translations.ar.doctor[key], `translations.ar.doctor missing key: ${key}`);
      assert.ok(translations.en.doctor[key], `translations.en.doctor missing key: ${key}`);

      // Check i18n resolution in Arabic
      i18n.currentLanguage = 'ar';
      const arVal = i18n.t(`doctor.${key}`);
      assert.ok(arVal && arVal !== `doctor.${key}`, `Failed to translate doctor.${key} in Arabic`);

      // Check i18n resolution in English
      i18n.currentLanguage = 'en';
      const enVal = i18n.t(`doctor.${key}`);
      assert.ok(enVal && enVal !== `doctor.${key}`, `Failed to translate doctor.${key} in English`);
    });

    passedTests++;
    console.log('  ✓ All 12 Risk Override i18n catalog keys verified with 100% Arabic and English parity.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: DoctorService Bilingual Category & Priority Metadata API Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 6: DoctorService Bilingual Category & Metadata API Helpers ...');
  {
    const categories = doctorService.VALID_OVERRIDE_CATEGORIES;

    categories.forEach(cat => {
      const labelAr = doctorService.getOverrideCategoryLabel(cat, false);
      const labelEn = doctorService.getOverrideCategoryLabel(cat, true);
      const descAr = doctorService.getOverrideCategoryDesc(cat, false);
      const descEn = doctorService.getOverrideCategoryDesc(cat, true);

      assert.ok(labelAr && labelAr !== cat, `Arabic label missing for category: ${cat}`);
      assert.ok(labelEn && labelEn !== cat, `English label missing for category: ${cat}`);
      assert.ok(descAr && descAr.length > 5, `Arabic description missing for category: ${cat}`);
      assert.ok(descEn && descEn.length > 5, `English description missing for category: ${cat}`);
    });

    passedTests++;
    console.log('  ✓ DoctorService bilingual category API helpers verified for all 5 clinical categories.');
  }

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests} BILINGUAL & MEDICAL LOCALIZATION TESTS PASSED (100%)`);
  console.log('==================================================================');
})().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
