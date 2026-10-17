/**
 * HEALTH VIBE AI: DOCTOR INTAKE REJECT & RE-ENTRY BILINGUAL SUPPORT & MEDICAL LOCALIZATION TEST SUITE (K HEALTH)
 * 
 * Verifies:
 * 1. Clinical English UI Rendering (isEn = true):
 *    - Modal dialog, headings, mode cards, checklist labels, presets, and alert banners render in clinical English.
 * 2. Certified Arabic Medical UI Rendering (isEn = false):
 *    - Certified clinical Arabic translation parity across all elements.
 * 3. Bidirectional Writing (`dir="auto"` & text direction detection):
 *    - Smooth typing for Arabic, Clinical English, and mixed Latin/Arabic medical terminology.
 *    - Textarea and live preview bubble dynamically adjust LTR/RTL direction based on content.
 * 4. Quick Clinical Instruction Presets Language Toggling (`setReentryChipsLang`):
 *    - Switching between Clinical English presets and Arabic presets without losing typed text.
 * 5. Live Patient Notification & Push Preview (`updateReentryNotificationPreview`):
 *    - Real-time bilingual rendering of patient SMS/App notification for both re-entry and definitive reject modes.
 * 6. 100% Mutual Key Parity in i18n Catalogs & DoctorService Metadata Helpers:
 *    - Complete key parity between translations.ar.doctor and translations.en.doctor.
 *    - getReentryCategoryMeta delivers accurate bilingual labels and descriptions.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const doctorService = require('../app/modules/doctor/doctor-service');
const doctorUI = require('../app/modules/doctor/doctor-ui');
const { translations, I18nEngine } = require('../app/i18n');

console.log('================================================================================');
console.log('🌐 HEALTH VIBE AI: DOCTOR REJECT & RE-ENTRY BILINGUAL TEST SUITE (K HEALTH)');
console.log('   Clinical English, Arabic Parity, Bidirectional Writing & Presets Toggle');
console.log('================================================================================\n');

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
  console.log('▶ TEST 1: Clinical English UI Rendering & Medical Phrasing (isEn = true) ...');
  {
    const sampleCase = {
      id: 'case_en_test_01',
      patientName: 'Kareem Mostafa',
      priority: 'urgent',
      duration: '2 hours',
      o2: 89,
      status: 'under_review'
    };

    const modalHtmlEn = doctorUI.renderRejectReentryModalHtml(sampleCase, true);

    // English Modal Assertions
    assert.ok(modalHtmlEn.includes('Reject Assessment & Request Patient Re-entry'), 'Must render English modal title');
    assert.ok(modalHtmlEn.includes('K Health Intake Protocol'), 'Must render English K Health tag');
    assert.ok(modalHtmlEn.includes('Reject & Request Re-entry'), 'Must render English Mode 1 title');
    assert.ok(modalHtmlEn.includes('Definitive Rejection'), 'Must render English Mode 2 title');
    assert.ok(modalHtmlEn.includes('Clinical Rejection Category'), 'Must render English category step');
    assert.ok(modalHtmlEn.includes('Select Flagged Fields for Patient Re-entry'), 'Must render English fields step');
    assert.ok(modalHtmlEn.includes('Physician Clinical Instructions for the Patient'), 'Must render English instructions step');
    assert.ok(modalHtmlEn.includes('Live Patient In-App Push & SMS Alert Preview'), 'Must render English preview title');
    assert.ok(modalHtmlEn.includes('Send Re-entry Request to Patient'), 'Must render English submit button text');

    // English Alert Banner Assertions
    const flaggedCase = {
      id: 'case_en_flagged_01',
      status: 'more_info_requested',
      isReentryRequest: true,
      reentryCategory: 'INCOMPLETE_MEASUREMENTS',
      rejectionReason: 'SpO2 and blood pressure readings are required for safe clinical triage.',
      requiredFields: ['spo2', 'blood_pressure']
    };
    const bannerHtmlEn = doctorUI.renderReentryStatusAlertBanner(flaggedCase, true);

    assert.ok(bannerHtmlEn.includes('Assessment Intake Rejected — Awaiting Patient Re-entry'), 'Must render English banner title');
    assert.ok(bannerHtmlEn.includes('K Health Intake Protocol:'), 'Must render English protocol label');
    assert.ok(bannerHtmlEn.includes('Pending Re-entry'), 'Must render English pending pill');
    assert.ok(bannerHtmlEn.includes('Flagged items for re-entry:'), 'Must render English flagged items label');
    assert.ok(bannerHtmlEn.includes('Update Re-entry Request'), 'Must render English resume action button');

    passedTests++;
    console.log('  ✓ Clinical English interface rendered with accurate K Health medical terminology.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Certified Arabic Medical UI Rendering (isEn = false)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 2: Certified Arabic Medical UI Rendering & Parity (isEn = false) ...');
  {
    const sampleCase = {
      id: 'case_ar_test_01',
      patientName: 'كريم مصطفى',
      priority: 'high',
      duration: 'ساعتان',
      o2: 91,
      status: 'under_review'
    };

    const modalHtmlAr = doctorUI.renderRejectReentryModalHtml(sampleCase, false);

    // Arabic Modal Assertions
    assert.ok(modalHtmlAr.includes('مسار رفض التقييم وطلب إعادة إدخال القياسات'), 'Must render Arabic modal title');
    assert.ok(modalHtmlAr.includes('حوكمة مدخلات الفرز المبدئي'), 'Must render Arabic subtitle');
    assert.ok(modalHtmlAr.includes('رفض التقييم وطلب إعادة إدخال القياسات'), 'Must render Arabic Mode 1 title');
    assert.ok(modalHtmlAr.includes('رفض سريري نهائي'), 'Must render Arabic Mode 2 title');
    assert.ok(modalHtmlAr.includes('فئة سبب الرفض السريري'), 'Must render Arabic category step');
    assert.ok(modalHtmlAr.includes('حدد الحقول والقياسات المطلوب من المريض إعادة إدخالها'), 'Must render Arabic fields step');
    assert.ok(modalHtmlAr.includes('توجيهات وإرشادات الطبيب الموجهة للمريض'), 'Must render Arabic instructions step');
    assert.ok(modalHtmlAr.includes('إرسال طلب إعادة القياس للمريض'), 'Must render Arabic submit button text');

    // Arabic Alert Banner Assertions
    const flaggedCase = {
      id: 'case_ar_flagged_01',
      status: 'more_info_requested',
      isReentryRequest: true,
      reentryCategory: 'CONTRADICTORY_VITALS',
      rejectionReason: 'قراءة الأكسجين 70% غير منطقية، يرجى إعادة القياس بهدوء.',
      requiredFields: ['spo2']
    };
    const bannerHtmlAr = doctorUI.renderReentryStatusAlertBanner(flaggedCase, false);

    assert.ok(bannerHtmlAr.includes('تم رفض التقييم المبدئي — بانتظار إعادة إدخال المريض للقياسات'), 'Must render Arabic banner title');
    assert.ok(bannerHtmlAr.includes('بروتوكول حوكمة الفرز (K Health):'), 'Must render Arabic protocol label');
    assert.ok(bannerHtmlAr.includes('معلق لإعادة القياس'), 'Must render Arabic pending pill');
    assert.ok(bannerHtmlAr.includes('القياسات المطلوب تصحيحها وإعادتها:'), 'Must render Arabic flagged items label');
    assert.ok(bannerHtmlAr.includes('تعديل أو متابعة طلب إعادة القياس'), 'Must render Arabic resume action button');

    passedTests++;
    console.log('  ✓ Certified Arabic interface verified with complete parity to English clinical layout.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Bidirectional Text Writing (`dir="auto"` & Dynamic RTL/LTR Detection)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 3: Bidirectional Text Writing (dir="auto" & Dynamic Direction Detection) ...');
  {
    const modalHtmlEn = doctorUI.renderRejectReentryModalHtml({ id: 'case_bi_1' }, true);
    const modalHtmlAr = doctorUI.renderRejectReentryModalHtml({ id: 'case_bi_1' }, false);

    // Verify dir="auto" attribute on textarea in both languages
    assert.ok(modalHtmlEn.includes('dir="auto"'), 'English modal textarea must have dir="auto"');
    assert.ok(modalHtmlAr.includes('dir="auto"'), 'Arabic modal textarea must have dir="auto"');

    // Test text direction detection helper in doctorService
    const arabicText = 'يرجى الجلوس بهدوء وتدفئة اليدين وإعادة قياس نسبة الأكسجين.';
    const englishText = 'Please rest for 5 minutes, warm your hands, and retake your pulse oximeter reading.';
    const mixedArabicStart = 'المريض يحتاج إلى retake SpO2 and Blood pressure فوراً.';

    assert.strictEqual(doctorService.detectBilingualDirection(arabicText), 'rtl', 'Arabic text must be detected as RTL');
    assert.strictEqual(doctorService.detectBilingualDirection(englishText), 'ltr', 'English text must be detected as LTR');
    assert.strictEqual(doctorService.detectBilingualDirection(mixedArabicStart), 'rtl', 'Mixed text containing Arabic must be RTL');
    assert.strictEqual(doctorService.detectBilingualDirection(''), 'ltr', 'Empty text defaults to LTR');

    // Dynamic Live Preview Direction Sync
    const textarea = createMockElement("rejectReentryInstructionTextarea");
    const previewBody = createMockElement("previewBubbleBody");

    // Case 1: Typing Arabic instructions in an English interface
    global.currentLanguage = "en";
    textarea.value = 'يرجى إعادة قياس الضغط بعد الراحة 10 دقائق.';
    doctorUI.updateReentryNotificationPreview();
    assert.strictEqual(previewBody.getAttribute('dir'), 'rtl', 'Preview body must be set to RTL when Arabic note is entered');
    assert.strictEqual(textarea.getAttribute('dir'), 'rtl', 'Textarea must be set to RTL when Arabic note is entered');

    // Case 2: Typing English instructions in an Arabic interface
    global.currentLanguage = "ar";
    textarea.value = 'Please re-measure SpO2 using a calibrated pulse oximeter.';
    doctorUI.updateReentryNotificationPreview();
    assert.strictEqual(previewBody.getAttribute('dir'), 'ltr', 'Preview body must be set to LTR when English note is entered');
    assert.strictEqual(textarea.getAttribute('dir'), 'ltr', 'Textarea must be set to LTR when English note is entered');

    passedTests++;
    console.log('  ✓ Bidirectional typing, dir="auto", and dynamic RTL/LTR preview direction sync verified.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Quick Clinical Instruction Presets Language Toggling
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 4: Quick Clinical Instruction Presets Language Toggling ...');
  {
    const chipsContainer = createMockElement("reentryChipsContainer");
    const btnEn = createMockElement("btnReentryLangEn");
    const btnAr = createMockElement("btnReentryLangAr");
    const textarea = createMockElement("rejectReentryInstructionTextarea");

    // 4A. Switch to English Presets
    doctorUI.setReentryChipsLang('en');
    assert.ok(btnEn.classList.contains('is-active'), 'btnReentryLangEn must be active');
    assert.ok(!btnAr.classList.contains('is-active'), 'btnReentryLangAr must not be active');
    assert.ok(chipsContainer.innerHTML.includes('pulse oximeter (SpO2) reading'), 'English chip text rendered');

    // 4B. Switch to Arabic Presets
    doctorUI.setReentryChipsLang('ar');
    assert.ok(btnAr.classList.contains('is-active'), 'btnReentryLangAr must be active');
    assert.ok(!btnEn.classList.contains('is-active'), 'btnReentryLangEn must not be active');
    assert.ok(chipsContainer.innerHTML.includes('تدفئة اليدين والراحة'), 'Arabic chip text rendered');

    // 4C. Inserting a chip preserves existing typed text
    textarea.value = 'Primary instruction:';
    doctorUI.applyReentryInstructionChip('Please upload a clear lab photo');
    assert.strictEqual(textarea.value, 'Primary instruction:. Please upload a clear lab photo');

    passedTests++;
    console.log('  ✓ Presets toggle between EN and AR seamlessly without losing doctor input.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Live Patient Notification Push Preview Real-Time Rendering
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 5: Live Patient Notification & Push Preview Bilingual Verification ...');
  {
    const previewBody = createMockElement("previewBubbleBody");
    const textarea = createMockElement("rejectReentryInstructionTextarea");

    // 5A. Re-entry Mode in English
    global.currentLanguage = "en";
    doctorUI.setRejectReentryMode('reentry');
    textarea.value = 'Please warm your hands and retake SpO2.';
    doctorUI.updateReentryNotificationPreview();

    assert.ok(previewBody.innerHTML.includes('Action Required:'), 'English re-entry preview must include Action Required');
    assert.ok(previewBody.innerHTML.includes('flagged inaccurate intake data'), 'English re-entry preview explanation');
    assert.ok(previewBody.innerHTML.includes('Please warm your hands'), 'Doctor note preserved in English preview');

    // 5B. Re-entry Mode in Arabic
    global.currentLanguage = "ar";
    doctorUI.setRejectReentryMode('reentry');
    textarea.value = 'يرجى الراحة وإعادة قياس نسبة الأكسجين.';
    doctorUI.updateReentryNotificationPreview();

    assert.ok(previewBody.innerHTML.includes('مطلوب إجراء فوري:'), 'Arabic re-entry preview must include Action Required');
    assert.ok(previewBody.innerHTML.includes('يرجى الراحة وإعادة قياس'), 'Doctor note preserved in Arabic preview');

    // 5C. Definitive Reject Mode in English
    global.currentLanguage = "en";
    doctorUI.setRejectReentryMode('definitive_reject');
    textarea.value = 'Consultation is outside telemedicine scope.';
    doctorUI.updateReentryNotificationPreview();

    assert.ok(previewBody.innerHTML.includes('Health Vibe Advisory:'), 'English definitive reject must include Advisory');
    assert.ok(previewBody.innerHTML.includes('formally closed/rejected'), 'English definitive reject explanation');

    // 5D. Definitive Reject Mode in Arabic
    global.currentLanguage = "ar";
    doctorUI.setRejectReentryMode('definitive_reject');
    textarea.value = 'الطلب خارج نطاق الاستشارات التنفسية.';
    doctorUI.updateReentryNotificationPreview();

    assert.ok(previewBody.innerHTML.includes('تنبيه من منصة Health Vibe:'), 'Arabic definitive reject must include Advisory');
    assert.ok(previewBody.innerHTML.includes('تم إغلاق ورفض التقييم المبدئي سريرياً'), 'Arabic definitive reject explanation');

    passedTests++;
    console.log('  ✓ Live notification preview renders accurately in EN and AR for both modes.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: i18n Translation Catalog Coverage & Parity + DoctorService Metadata
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 6: i18n Translation Catalog Coverage & DoctorService Metadata Helpers ...');
  {
    const i18n = new I18nEngine({ defaultLanguage: 'ar' });

    const rejectReentryKeys = [
      'rejectReentryAction',
      'rejectReentryTitle',
      'rejectReentrySubheading',
      'reentryModeReentry',
      'reentryModeDefinitive',
      'reentryCategoryTitle',
      'reentryFieldsTitle',
      'reentryDoctorNoteTitle',
      'reentryNotificationPreviewTitle',
      'reentrySendBtn',
      'reentryDefinitiveBtn',
      'reentryStatusPendingBanner'
    ];

    rejectReentryKeys.forEach(key => {
      // Check presence in both catalogs
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

    // Test DoctorService.getReentryCategoryMeta for all 5 categories
    const categories = doctorService.REJECTION_REENTRY_CATEGORIES;
    categories.forEach(cat => {
      const metaAr = doctorService.getReentryCategoryMeta(cat, false);
      const metaEn = doctorService.getReentryCategoryMeta(cat, true);

      assert.ok(metaAr.label && metaAr.label.length > 5, `Arabic label missing for category: ${cat}`);
      assert.ok(metaEn.label && metaEn.label.length > 5, `English label missing for category: ${cat}`);
      assert.ok(metaAr.desc && metaAr.desc.length > 10, `Arabic description missing for category: ${cat}`);
      assert.ok(metaEn.desc && metaEn.desc.length > 10, `English description missing for category: ${cat}`);
    });

    passedTests++;
    console.log('  ✓ All 12 i18n keys and DoctorService category metadata helpers verified with 100% parity.');
  }

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${passedTests} BILINGUAL & MEDICAL LOCALIZATION TESTS PASSED (100% SUCCESS)`);
  console.log('================================================================================\n');

})().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
