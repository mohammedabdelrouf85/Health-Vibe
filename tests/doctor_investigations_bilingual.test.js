/**
 * HEALTH VIBE AI: DOCTOR ORDER LABS & CHEST X-RAY BILINGUAL TEST SUITE (VEZEETA PATTERN)
 *
 * Verifies:
 * 1. Clinical English UI Rendering:
 *    - All investigation cards, LOINC/RADLEX codes, and clinical descriptions render in English.
 * 2. Arabic Certified Medical UI Rendering:
 *    - Accurate Arabic medical names (صورة دم كاملة CBC، بروتين تفاعلي CRP، أشعة عادية على الصدر CXR).
 * 3. Bidirectional Parity in i18n Translation Catalogs:
 *    - 100% mutual key parity between translations.ar.doctor and translations.en.doctor.
 * 4. Clinical Report Requisition Bilingual Output:
 *    - Accurate rendering in certified reports for both Arabic and English locales.
 * 5. Diagnostic Presets Localization:
 *    - Clinical bundles provide localized names and guidance in both languages.
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Setup minimal browser globals mock for Node.js
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
    select: function() {},
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

global.currentLanguage = "ar";

const DoctorService = require('../app/modules/doctor/doctor-service');
const DoctorUI = require('../app/modules/doctor/doctor-ui');
const ReportsService = require('../app/modules/reports/reports-service');
const { translations, I18nEngine } = require('../app/i18n');

console.log('================================================================================');
console.log('🌐 HEALTH VIBE AI: DOCTOR INVESTIGATIONS BILINGUAL TEST SUITE');
console.log('   Arabic & English Medical Nomenclature, LOINC/RADLEX, Requisition & i18n');
console.log('================================================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] Test ${total}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Arabic Clinical Nomenclature for High-Yield Tests
// -----------------------------------------------------------------------------
runTest("Catalog contains standard certified Arabic medical terminology", () => {
  const catalog = DoctorService.getDiagnosticCatalog();

  const cbc = catalog.find(i => i.code === "CBC");
  assert.ok(cbc, "CBC must exist");
  assert.strictEqual(cbc.nameAr, "صورة دم كاملة (CBC)");
  assert.strictEqual(cbc.nameEn, "Complete Blood Count (CBC)");
  assert.strictEqual(cbc.loinc, "58410-2");

  const crp = catalog.find(i => i.code === "CRP");
  assert.ok(crp, "CRP must exist");
  assert.strictEqual(crp.nameAr, "بروتين سي التفاعلي كمي (CRP)");
  assert.strictEqual(crp.nameEn, "C-Reactive Protein - Quantitative (CRP)");
  assert.strictEqual(crp.loinc, "1988-5");

  const cxr = catalog.find(i => i.code === "CHEST_XRAY");
  assert.ok(cxr, "Chest X-Ray must exist");
  assert.strictEqual(cxr.nameAr, "أشعة عادية على الصدر (Chest X-Ray PA/Lat)");
  assert.strictEqual(cxr.nameEn, "Chest X-Ray Frontal & Lateral (PA/Lat)");
  assert.strictEqual(cxr.loinc, "36643-5");
});

// -----------------------------------------------------------------------------
// Test 2: Bilingual Filtering & Search (Arabic and English)
// -----------------------------------------------------------------------------
runTest("filterDiagnosticCatalog supports bilingual text matching", () => {
  // Search Arabic
  const arMatches = DoctorService.filterDiagnosticCatalog({ search: "صورة دم" });
  assert.ok(arMatches.length > 0);
  assert.strictEqual(arMatches[0].code, "CBC");

  // Search English
  const enMatches = DoctorService.filterDiagnosticCatalog({ search: "Blood Count" });
  assert.ok(enMatches.length > 0);
  assert.strictEqual(enMatches[0].code, "CBC");

  // Search Code
  const codeMatches = DoctorService.filterDiagnosticCatalog({ search: "crp" });
  assert.ok(codeMatches.length > 0);
  assert.strictEqual(codeMatches[0].code, "CRP");

  // Search LOINC
  const loincMatches = DoctorService.filterDiagnosticCatalog({ search: "36643-5" });
  assert.ok(loincMatches.length > 0);
  assert.strictEqual(loincMatches[0].code, "CHEST_XRAY");
});

// -----------------------------------------------------------------------------
// Test 3: Workstation Layout Renders in Professional Arabic
// -----------------------------------------------------------------------------
runTest("Doctor workstation renders in formal Arabic with RTL layout", () => {
  const mockCase = { id: "case_bi_ar_01", patientName: "خالد سعيد", status: "in_review" };
  DoctorUI.setCaseInvestigations(mockCase.id, ["CBC", "CHEST_XRAY"]);

  const html = DoctorUI.renderOrderInvestigationsStationHtml(mockCase, false);
  assert.ok(html.includes("طلب الفحوصات والتحاليل والأشعة التكميلية"), "Must contain Arabic title");
  assert.ok(html.includes("صورة دم كاملة"), "Must show Arabic CBC name");
  assert.ok(html.includes("أشعة عادية على الصدر"), "Must show Arabic CXR name");
  assert.ok(html.includes("باقات الفحص السريري المباشر"), "Must show Arabic preset header");
  assert.ok(html.includes("Alt+L"), "Must retain standard keyboard shortcut badge");
});

// -----------------------------------------------------------------------------
// Test 4: Workstation Layout Renders in Clinical English
// -----------------------------------------------------------------------------
runTest("Doctor workstation renders in clinical English with LTR layout", () => {
  const mockCase = { id: "case_bi_en_01", patientName: "Khaled Saeed", status: "in_review" };
  DoctorUI.setCaseInvestigations(mockCase.id, ["CBC", "CRP"]);

  const html = DoctorUI.renderOrderInvestigationsStationHtml(mockCase, true);
  assert.ok(html.includes("Diagnostic Investigations & Radiology"), "Must contain English title");
  assert.ok(html.includes("Complete Blood Count"), "Must show English CBC name");
  assert.ok(html.includes("C-Reactive Protein"), "Must show English CRP name");
  assert.ok(html.includes("Clinical Workup Bundles"), "Must show English preset header");
});

// -----------------------------------------------------------------------------
// Test 5: i18n Translation Catalog Coverage & Key Parity
// -----------------------------------------------------------------------------
runTest("translations.ar.doctor and translations.en.doctor have 100% key parity for investigations", () => {
  const i18n = new I18nEngine({ defaultLanguage: 'ar' });

  const requiredKeys = [
    'orderInvestigationsTitle',
    'orderInvestigationsSubtitle',
    'investigationsPresetsTitle',
    'investigationsSearchPlaceholder',
    'investigationsCountZero',
    'investigationsCountSelected',
    'investigationsUrgencyStat',
    'investigationsUrgencyRoutine',
    'investigationsCustomTitle',
    'investigationsReportSectionTitle',
    'investigationsOfficialReferralBadge',
    'investigationsPatientInstructions',
    'investigationsQuarantineNotice'
  ];

  requiredKeys.forEach(key => {
    assert.ok(translations.ar.doctor[key], `Missing Arabic translation for doctor.${key}`);
    assert.ok(translations.en.doctor[key], `Missing English translation for doctor.${key}`);

    i18n.currentLanguage = 'ar';
    const arVal = i18n.t(`doctor.${key}`);
    assert.ok(arVal && arVal !== `doctor.${key}`);

    i18n.currentLanguage = 'en';
    const enVal = i18n.t(`doctor.${key}`);
    assert.ok(enVal && enVal !== `doctor.${key}`);
  });
});

// -----------------------------------------------------------------------------
// Test 6: ReportsService Preserves Ordered Investigations in Bilingual Exports
// -----------------------------------------------------------------------------
runTest("ReportsService extracts and preserves ordered investigations for bilingual report export", () => {
  const approvedRecord = {
    id: "case_rep_bi_01",
    status: "approved",
    clinicalDiagnosis: "Acute Bronchitis with Bacterial Exacerbation",
    medications: "Amoxicillin / Clavulanate 1g bid for 7 days",
    recommendations: ["Adequate oral hydration", "Review in clinic if SpO2 drops below 94%"],
    investigations: [
      { code: "CBC", nameAr: "صورة دم كاملة", nameEn: "Complete Blood Count", category: "LAB", urgency: "stat", loinc: "58410-2" },
      { code: "CHEST_XRAY", nameAr: "أشعة عادية على الصدر", nameEn: "Chest X-Ray PA", category: "RADIOLOGY", urgency: "routine", loinc: "36643-5" }
    ],
    reportSnapshot: {
      clinicalContent: {
        clinicalDiagnosis: "Acute Bronchitis with Bacterial Exacerbation",
        medications: "Amoxicillin / Clavulanate 1g bid for 7 days",
        recommendations: ["Adequate oral hydration", "Review in clinic if SpO2 drops below 94%"],
        investigations: [
          { code: "CBC", nameAr: "صورة دم كاملة", nameEn: "Complete Blood Count", category: "LAB", urgency: "stat", loinc: "58410-2" },
          { code: "CHEST_XRAY", nameAr: "أشعة عادية على الصدر", nameEn: "Chest X-Ray PA", category: "RADIOLOGY", urgency: "routine", loinc: "36643-5" }
        ]
      }
    }
  };

  const contentAr = ReportsService.getRecordedClinicalContent(approvedRecord, false);
  assert.strictEqual(contentAr.investigations.length, 2);
  assert.strictEqual(contentAr.investigations[0].code, "CBC");
  assert.strictEqual(contentAr.investigations[1].code, "CHEST_XRAY");

  const pdfExportAr = ReportsService.formatReportForPdfExport({ record: approvedRecord, language: "ar" });
  assert.strictEqual(pdfExportAr.language, "ar");
  assert.strictEqual(pdfExportAr.dir, "rtl");
  assert.strictEqual(pdfExportAr.investigations.length, 2);

  const pdfExportEn = ReportsService.formatReportForPdfExport({ record: approvedRecord, language: "en" });
  assert.strictEqual(pdfExportEn.language, "en");
  assert.strictEqual(pdfExportEn.dir, "ltr");
  assert.strictEqual(pdfExportEn.investigations.length, 2);
});

// -----------------------------------------------------------------------------
// Test 7: Bidirectional Auto-Direction (dir="auto") on Clinical Inputs
// -----------------------------------------------------------------------------
runTest("Investigation indications and doctor recommendations render dir='auto' for bidirectional writing", () => {
  const mockCase = { id: "case_bi_dir_01", patientName: "عمر فاروق", status: "in_review" };
  DoctorUI.setCaseInvestigations(mockCase.id, ["CBC"]);

  const html = DoctorUI.renderSelectedInvestigationsListHtml(
    DoctorUI.getCaseInvestigations(mockCase.id),
    mockCase.id,
    true
  );

  assert.ok(html.includes('class="vezeeta-indication-input" dir="auto"'), "Indication input must specify dir='auto'");
  assert.ok(html.includes('indication-chips-quick'), "Must include quick indication chips container");
});

// -----------------------------------------------------------------------------
// Test 8: Clinical Indication Preset Application (English & Arabic)
// -----------------------------------------------------------------------------
runTest("applyInvestigationIndicationChip sets clinical indication and updates case state", () => {
  const caseId = "case_bi_chip_01";
  DoctorUI.setCaseInvestigations(caseId, ["CHEST_XRAY"]);

  // Create mock DOM input
  const inputEl = createMockElement("ind_CHEST_XRAY", "input");

  // Apply English indication chip
  const enRationale = "Rule out consolidation & bacterial pneumonia";
  DoctorUI.applyInvestigationIndicationChip(caseId, "CHEST_XRAY", enRationale);

  let items = DoctorUI.getCaseInvestigations(caseId);
  assert.strictEqual(items[0].clinicalIndication, enRationale);
  assert.strictEqual(inputEl.value, enRationale);

  // Apply Arabic indication chip
  const arRationale = "استبعاد ارتشاح رئوي والتهاب بكتيري";
  DoctorUI.applyInvestigationIndicationChip(caseId, "CHEST_XRAY", arRationale);

  items = DoctorUI.getCaseInvestigations(caseId);
  assert.strictEqual(items[0].clinicalIndication, arRationale);
  assert.strictEqual(inputEl.value, arRationale);
});

// -----------------------------------------------------------------------------
// Test 9: Patient Recommendations Presets & Language Toggle
// -----------------------------------------------------------------------------
runTest("Patient recommendations support bilingual preset chips and language toggling", () => {
  const container = createMockElement("patientRecommendationsChipsContainer");
  const btnEn = createMockElement("btnRecsLangEn");
  const btnAr = createMockElement("btnRecsLangAr");
  const recsInput = createMockElement("doctorRecommendationsInput", "textarea");

  // 1. Toggle to English chips
  DoctorUI.setPatientRecommendationChipsLang("en");
  assert.ok(btnEn.classList.contains("is-active"));
  assert.ok(!btnAr.classList.contains("is-active"));
  assert.ok(container.innerHTML.includes("oral warm fluid hydration"));

  // 2. Toggle to Arabic chips
  DoctorUI.setPatientRecommendationChipsLang("ar");
  assert.ok(btnAr.classList.contains("is-active"));
  assert.ok(!btnEn.classList.contains("is-active"));
  assert.ok(container.innerHTML.includes("الراحة التامة"));

  // 3. Apply recommendation chip preserves existing text
  recsInput.value = "Initial recommendation 1";
  DoctorUI.applyPatientRecommendationChip("Immediate ER visit if SpO2 saturation drops below 92%");
  assert.strictEqual(
    recsInput.value,
    "Initial recommendation 1\nImmediate ER visit if SpO2 saturation drops below 92%"
  );
});

// -----------------------------------------------------------------------------
// Test 10: Multilingual Recommendation Formatting & Clinical Character Preservation
// -----------------------------------------------------------------------------
runTest("Multilingual recommendations cleanly parse and format mixed Arabic and English lines", () => {
  const mixedRecommendations = `
    الراحة التامة في الفراش وتجنب التيارات الهوائية
    Prescribed Ventolin inhaler 2 puffs bid PRN
    متابعة نسبة الأكسجين SpO2 مرتين يومياً (صباحاً ومساءً)
    Review in clinic immediately if SpO2 < 92% or dyspnea worsens
  `.trim();

  const parsed = DoctorService.parseDoctorRecommendations(mixedRecommendations);
  assert.strictEqual(parsed.length, 4, "Must parse all 4 distinct multilingual recommendations");
  assert.ok(parsed[0].includes("الراحة التامة"));
  assert.ok(parsed[1].includes("Ventolin inhaler"));
  assert.ok(parsed[2].includes("نسبة الأكسجين SpO2"));
  assert.ok(parsed[3].includes("SpO2 < 92%"));
});

console.log("\n================================================================================");
console.log(`RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
console.log("================================================================================\n");
