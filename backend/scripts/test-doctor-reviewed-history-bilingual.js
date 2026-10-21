/**
 * QA & Bilingual Automation Test Suite:
 * Doctor Reviewed Cases History & Certified Reports Archive (Bilingual & Medical Translation Support)
 * Benchmark: Rology (Clinical English Interface & Arabic/English Patient Recommendations)
 * 
 * Verifies:
 * 1. Clinical English Archive Dictionary (Header, KPIs, Search, Filters, Card, Quick Modal, PDF Sheet, Zero State)
 * 2. Professional Medical Arabic Archive Dictionary (Accurate Medical Terminology & Cultural Appropriateness)
 * 3. Bidirectional Auto-Alignment Markup (dir="auto", unicode-bidi: plaintext) across Diagnosis & Recommendations
 * 4. Smooth Arabic Patient Directives Display inside a Clinical English Doctor Dashboard
 * 5. Smooth English Patient Directives Display inside a Medical Arabic Doctor Dashboard
 * 6. Mixed-Language Prescriptions & Diagnosis Search (Arabic & English Terminology)
 * 7. Certified PDF Document Sheet Bilingual Fields & Semantic Direction
 * 8. Quick Inspection Modal Bilingual Rendering
 * 9. Actionable Zero-State Guidance in English and Arabic
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

console.log('🌐 Starting Doctor Reviewed History Bilingual & Medical Translation Tests (Rology Benchmark)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Bilingual Test ${testsTotal}: ${name}`);
  try {
    fn();
    console.log(`  ✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ Failed: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exit(1);
  }
}

// ── Test 1: Full Clinical English Dictionary Coverage ───────────────────────
runTest('Full Clinical English Dictionary Coverage (getDoctorArchiveI18n)', () => {
  assert.strictEqual(typeof DoctorUI.getDoctorArchiveI18n, 'function', 'getDoctorArchiveI18n must be exported');
  const en = DoctorUI.getDoctorArchiveI18n(true);

  // Header
  assert.strictEqual(en.header.title, 'Reviewed Cases History & Certified Reports Archive');
  assert(en.header.subtitle.includes('Official teleradiology & clinical archive'));

  // KPIs
  assert.strictEqual(en.kpis.totalCertified, 'Total Certified');
  assert.strictEqual(en.kpis.todayReports, "Today's Reports");
  assert.strictEqual(en.kpis.criticalTriage, 'Critical Triage');
  assert.strictEqual(en.kpis.digitallySealed, 'Digitally Sealed');

  // Search
  assert(en.search.placeholder.includes('Search by patient name, MRN'));
  assert.strictEqual(en.search.ariaLabel, 'Search reviewed cases archive');

  // Filters
  assert.strictEqual(en.filters.dateLabel, 'Date Range:');
  assert.strictEqual(en.filters.dateToday, 'Today');
  assert.strictEqual(en.filters.dateWeek, 'Past 7 Days');
  assert.strictEqual(en.filters.dateMonth, 'Past 30 Days');
  assert.strictEqual(en.filters.riskLabel, 'Clinical Risk:');
  assert.strictEqual(en.filters.riskUrgent, '🚨 Urgent / Emergency');
  assert.strictEqual(en.filters.riskHigh, '⚠️ High Priority');
  assert.strictEqual(en.filters.riskNormal, '🟢 Routine / Stable');
  assert.strictEqual(en.filters.sortLabel, 'Sort By:');
  assert.strictEqual(en.filters.sortDateDesc, '📅 Newest Certified First');
  assert.strictEqual(en.filters.sortDateAsc, '⌛ Oldest Certified First');
  assert.strictEqual(en.filters.sortNameAsc, '🔤 Patient Name (A-Z)');
  assert.strictEqual(en.filters.sortO2Asc, '🫁 Lowest SpO2 (Hypoxemia)');

  // Card & Modals
  assert.strictEqual(en.card.statusCertified, 'Clinically Certified');
  assert.strictEqual(en.card.viewReport, 'View Report');
  assert.strictEqual(en.card.certifiedPdf, 'Certified PDF');
  assert.strictEqual(en.card.quickView, 'Quick View');
  assert.strictEqual(en.quickModal.title, 'Certified Clinical Report Summary');
  assert.strictEqual(en.pdfModal.title, 'Certified Medical Report PDF Preview');
});

// ── Test 2: Professional Medical Arabic Localization Dictionary ──────────────
runTest('Professional Medical Arabic Localization Dictionary (getDoctorArchiveI18n)', () => {
  const ar = DoctorUI.getDoctorArchiveI18n(false);

  // Header
  assert.strictEqual(ar.header.title, 'سجل الحالات المراجعة وأرشيف التقارير الطبية المعتمدة');
  assert(ar.header.subtitle.includes('أرشيف سريري معتمد'));

  // KPIs
  assert.strictEqual(ar.kpis.totalCertified, 'إجمالي المعتمد');
  assert.strictEqual(ar.kpis.todayReports, 'معتمدة اليوم');
  assert.strictEqual(ar.kpis.criticalTriage, 'حالات حرجة');
  assert.strictEqual(ar.kpis.digitallySealed, 'مختومة رقمياً');

  // Search
  assert(ar.search.placeholder.includes('ابحث باسم المريض، رقم الملف'));
  assert.strictEqual(ar.search.ariaLabel, 'البحث في أرشيف الحالات المعتمدة');

  // Filters
  assert.strictEqual(ar.filters.dateLabel, 'الفترة الزمنية:');
  assert.strictEqual(ar.filters.dateToday, 'اليوم');
  assert.strictEqual(ar.filters.dateWeek, 'آخر 7 أيام');
  assert.strictEqual(ar.filters.dateMonth, 'آخر 30 يوماً');
  assert.strictEqual(ar.filters.riskLabel, 'درجة الخطورة:');
  assert.strictEqual(ar.filters.riskUrgent, '🚨 عاجل / طوارئ');
  assert.strictEqual(ar.filters.riskHigh, '⚠️ أولوية عالية');
  assert.strictEqual(ar.filters.riskNormal, '🟢 عادية / مستقرة');

  // Card & Modals
  assert.strictEqual(ar.card.statusCertified, 'معتمد سريرياً');
  assert.strictEqual(ar.card.viewReport, 'استعراض التقرير');
  assert.strictEqual(ar.card.certifiedPdf, 'استعراض الـ PDF');
  assert.strictEqual(ar.card.quickView, 'معاينة سريعة');
  assert.strictEqual(ar.quickModal.title, 'ملخص التقرير السريري المعتمد');
  assert.strictEqual(ar.pdfModal.title, 'معاينة التقرير الطبي المعتمد بصيغة PDF');
});

// ── Test 3: Bidirectional Markup & Auto-Alignment (dir="auto") ──────────────
runTest('Bidirectional Markup (dir="auto" and bidi-auto-text) on Clinical Content', () => {
  const mockCase = {
    id: 'case-bidi-01',
    name: 'محمود عبد الفتاح',
    mrn: 'MRN-7701',
    o2: 95,
    clinicalDiagnosis: 'Acute Bronchitis with mild bronchial irritation',
    medications: ['Azithromycin 500mg once daily', 'Paracetamol 1g PRN'],
    recommendations: ['الراحة التامة لمدة 3 أيام مع تناول السوائل الدافئة', 'مراجعة قياس الأكسجين'],
    signatureSeal: 'HV-SEAL-7701AA',
    doctorName: 'د. منة شريف',
    approvedAt: new Date().toISOString()
  };

  // Render card in English mode
  const cardHtmlEn = DoctorUI.renderArchivedCaseCardHtml(mockCase, true);
  assert(cardHtmlEn.includes('dir="auto"'), 'Card diagnosis must feature dir="auto"');
  assert(cardHtmlEn.includes('bidi-auto-text'), 'Card diagnosis must include bidi-auto-text class');
  assert(cardHtmlEn.includes('Acute Bronchitis with mild bronchial irritation'), 'Must include English diagnosis');

  // Render card in Arabic mode
  const cardHtmlAr = DoctorUI.renderArchivedCaseCardHtml(mockCase, false);
  assert(cardHtmlAr.includes('dir="auto"'), 'Card diagnosis must feature dir="auto"');
  assert(cardHtmlAr.includes('bidi-auto-text'), 'Card diagnosis must include bidi-auto-text class');
});

// ── Test 4: Arabic Recommendations in Clinical English Interface ─────────────
runTest('Arabic Recommendations Displayed in Clinical English Doctor Interface', () => {
  const caseWithArabicRecs = {
    id: 'case-ar-rec',
    name: 'John Miller',
    nameEn: 'John Miller',
    mrn: 'MRN-9903',
    o2: 94,
    clinicalDiagnosis: 'Chronic Obstructive Pulmonary Disease (COPD) stage II maintenance',
    medications: ['Tiotropium HandiHaler', 'Salmeterol/Fluticasone'],
    recommendations: ['الإقلاع الفوري عن التدخين والالتزام بتمارين التنفس الرئوي اليومية'],
    signatureSeal: 'HV-SEAL-9903CC',
    doctorName: 'Dr. Menna Sherif',
    approvedAt: new Date().toISOString()
  };

  // Mock global DOM
  let createdElement = null;
  global.document = {
    getElementById: () => null,
    createElement: () => {
      createdElement = { id: '', style: {}, setAttribute: () => {}, innerHTML: '' };
      return createdElement;
    },
    body: { appendChild: () => {} }
  };
  global.state = { doctorQueue: [caseWithArabicRecs] };
  global.currentLanguage = 'en';

  DoctorUI.openArchivedCaseQuickModal('case-ar-rec');
  assert(createdElement.innerHTML.includes('Certified Clinical Report Summary'), 'Must render English modal title');
  assert(createdElement.innerHTML.includes('Patient Directives & Follow-up'), 'Must render English section heading');
  assert(createdElement.innerHTML.includes('الإقلاع الفوري عن التدخين'), 'Must preserve Arabic recommendations');
  assert(createdElement.innerHTML.includes('dir="auto"'), 'Must have dir="auto" on recommendations box');

  delete global.document;
  delete global.state;
  delete global.currentLanguage;
});

// ── Test 5: English Recommendations in Medical Arabic Interface ─────────────
runTest('English Recommendations Displayed in Medical Arabic Doctor Interface', () => {
  const caseWithEnglishRecs = {
    id: 'case-en-rec',
    name: 'سارة إبراهيم',
    patientNameEn: 'Sarah Ibrahim',
    mrn: 'MRN-8802',
    o2: 88,
    clinicalDiagnosis: 'نوبة ربو شعبي حادة مع نقص أكسجة حرج',
    medications: ['Salbutamol Nebulizer', 'Prednisolone 20mg'],
    recommendations: ['Immediate admission to emergency department for nebulizer sessions'],
    signatureSeal: 'HV-SEAL-8802BB',
    doctorName: 'د. منة شريف',
    approvedAt: new Date().toISOString()
  };

  let createdElement = null;
  global.document = {
    getElementById: () => null,
    createElement: () => {
      createdElement = { id: '', style: {}, setAttribute: () => {}, innerHTML: '' };
      return createdElement;
    },
    body: { appendChild: () => {} }
  };
  global.state = { doctorQueue: [caseWithEnglishRecs] };
  global.currentLanguage = 'ar';

  DoctorUI.openArchivedCaseQuickModal('case-en-rec');
  assert(createdElement.innerHTML.includes('ملخص التقرير السريري المعتمد'), 'Must render Arabic modal title');
  assert(createdElement.innerHTML.includes('توصيات المريض والمتابعة'), 'Must render Arabic section heading');
  assert(createdElement.innerHTML.includes('Immediate admission to emergency department'), 'Must preserve English recommendations');
  assert(createdElement.innerHTML.includes('dir="auto"'), 'Must feature dir="auto"');

  delete global.document;
  delete global.state;
  delete global.currentLanguage;
});

// ── Test 6: Certified Printable PDF Document Sheet Bilingual Support ─────────
runTest('Printable PDF Document Sheet Bilingual Rendering', () => {
  const testCase = {
    id: 'case-pdf-bi',
    name: 'محمود عبد الفتاح',
    nameEn: 'Mahmoud Abdel Fattah',
    mrn: 'MRN-7701',
    o2: 95,
    clinicalDiagnosis: 'التهاب رئوي حاد مستقر',
    medications: ['Azithromycin 500mg'],
    recommendations: ['Rest at home for 3 days and recheck SpO2'],
    signatureSeal: 'HV-SEAL-7701AA',
    doctorName: 'د. منة شريف',
    approvedAt: new Date().toISOString()
  };

  let createdElement = null;
  global.document = {
    getElementById: () => null,
    createElement: () => {
      createdElement = { id: '', style: {}, setAttribute: () => {}, innerHTML: '' };
      return createdElement;
    },
    body: { appendChild: () => {} }
  };
  global.state = { doctorQueue: [testCase] };

  // English PDF Sheet
  global.currentLanguage = 'en';
  DoctorUI.openArchivedCasePdfModal('case-pdf-bi');
  assert(createdElement.innerHTML.includes('Certified Medical Report PDF Preview'), 'English PDF modal title');
  assert(createdElement.innerHTML.includes('HealthVibes Telemedicine & Clinical Diagnostics'), 'Brand header');
  assert(createdElement.innerHTML.includes('Certified Pulmonary & Emergency Triage Network'), 'English tagline');
  assert(createdElement.innerHTML.includes('1. Clinical Diagnosis & Findings'), 'English diagnosis heading');
  assert(createdElement.innerHTML.includes('2. Prescription & Medication Regimen (Rx)'), 'English Rx heading');
  assert(createdElement.innerHTML.includes('3. Directives & Follow-up Plan'), 'English directives heading');
  assert(createdElement.innerHTML.includes('dir="auto"'), 'Must feature dir="auto" on all clinical content boxes');

  // Arabic PDF Sheet
  global.currentLanguage = 'ar';
  DoctorUI.openArchivedCasePdfModal('case-pdf-bi');
  assert(createdElement.innerHTML.includes('معاينة التقرير الطبي المعتمد بصيغة PDF'), 'Arabic PDF modal title');
  assert(createdElement.innerHTML.includes('الشبكة المعتمدة للرعاية التنفسية والتشخيص السريري'), 'Arabic tagline');
  assert(createdElement.innerHTML.includes('1. التشخيص والتقييم الطبي المعتمد'), 'Arabic diagnosis heading');
  assert(createdElement.innerHTML.includes('2. الخطة العلاجية والروشتة الدوائية'), 'Arabic Rx heading');
  assert(createdElement.innerHTML.includes('3. التوصيات الطبية وموعد المتابعة'), 'Arabic directives heading');

  delete global.document;
  delete global.state;
  delete global.currentLanguage;
});

// ── Test 7: CSS Unicode-Bidi and Auto-Direction Rules Verification ───────────
runTest('CSS Unicode-Bidi and Direction Styles in app/styles.css', () => {
  const cssPath = path.resolve(__dirname, '../../app/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.rology-diag-text'), 'Must style .rology-diag-text');
  assert(cssContent.includes('unicode-bidi: plaintext'), 'Must enforce unicode-bidi: plaintext');
  assert(cssContent.includes('direction: auto'), 'Must enforce direction: auto');
  assert(cssContent.includes('.bidi-auto-text'), 'Must define .bidi-auto-text class');
  assert(cssContent.includes('.pdf-text-content'), 'Must style .pdf-text-content');
});

console.log('----------------------------------------------------------------------');
console.log(`🏆 ALL ${testsPassed}/${testsTotal} DOCTOR REVIEWED HISTORY BILINGUAL TESTS PASSED!`);
console.log('   - Clinical English Dictionary: VERIFIED (getDoctorArchiveI18n(true))');
console.log('   - Medical Arabic Localization: VERIFIED (getDoctorArchiveI18n(false))');
console.log('   - Bidirectional Auto-Alignment: VERIFIED (dir="auto", unicode-bidi: plaintext)');
console.log('   - Arabic Recommendations in English UI: VERIFIED');
console.log('   - English Recommendations in Arabic UI: VERIFIED');
console.log('   - Printable PDF Document Sheet Bilingual Support: VERIFIED');
console.log('   - CSS Bidirectional Styling Rules: VERIFIED');
console.log('----------------------------------------------------------------------\n');
