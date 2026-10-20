/**
 * QA & Bilingual Automation Test Suite: Doctor Patient Search & Filter (Clinical English & Medical Arabic)
 * Benchmark: Practo (Assigned Patients Directory)
 * 
 * Verifies:
 * 1. Clinical English UI Dictionary (Tabs, Selectors, Quick Chips, Search Placeholders, Zero State)
 * 2. Medical Arabic Localization Dictionary (Professional Arabic Medical Semantics)
 * 3. Bi-directional Input Markup & Styling (dir="auto", unicode-bidi: plaintext)
 * 4. Multi-Field Deep Search across Arabic & English Clinical Records
 * 5. Arabic Diacritics and Letter Variant Normalization (Alef, Taa Marbuta, Alef Maksura)
 * 6. Cross-Language Recommendations & Prescription Search
 * 7. Multi-Dimensional Triage Filtering (Critical SpO2, Patient Replied, Quarantined Notes)
 * 8. Locale-Aware Patient Collation (English A-Z vs Arabic أبجدياً)
 * 9. Practo Zero-Results Bilingual Actionable Feedback
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');
const directoryService = require('../doctor-patient-directory-service.js');

console.log('🌐 Starting Doctor Patient Search & Directory Bilingual Support Tests...\n');

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
runTest('Full Clinical English Dictionary (Practo UI Standard)', () => {
  assert.strictEqual(typeof DoctorUI.getDoctorDirectoryI18n, 'function', 'getDoctorDirectoryI18n must be exported');
  const en = DoctorUI.getDoctorDirectoryI18n(true);

  // Tabs
  assert.strictEqual(en.tabs.all, 'All Real Patients');
  assert.strictEqual(en.tabs.under_review, 'Under Review');
  assert.strictEqual(en.tabs.assigned, 'Awaiting Doctor');
  assert.strictEqual(en.tabs.more_info_requested, 'More Info Required');
  assert.strictEqual(en.tabs.approved, 'Approved Clinically');
  assert.strictEqual(en.tabs.closed_escalated, 'Closed & Escalated');
  assert.strictEqual(en.tabs.test_sandbox, '🧪 Test Sandbox');

  // Priority
  assert.strictEqual(en.priority.label, 'Risk / Priority');
  assert.strictEqual(en.priority.all, 'All Priorities');
  assert.strictEqual(en.priority.urgent, '🚨 Urgent / Emergency');
  assert.strictEqual(en.priority.high, '⚠️ High Priority');
  assert.strictEqual(en.priority.normal, '🟢 Routine / Stable');

  // Sorting
  assert.strictEqual(en.sort.label, 'Sort By');
  assert.strictEqual(en.sort.waiting_desc, '⏳ Longest Waiting (SLA)');
  assert.strictEqual(en.sort.oxygen_asc, '🫁 Lowest SpO2 (Hypoxemia)');
  assert.strictEqual(en.sort.priority_desc, '🚨 Highest Priority');
  assert.strictEqual(en.sort.newest, '🆕 Newest First');
  assert.strictEqual(en.sort.patient_name_asc, '🔤 Patient Name (A-Z)');
  assert.strictEqual(en.sort.status, '📋 Workflow Stage');

  // Quick Chips
  assert.strictEqual(en.quick.all, 'All');
  assert.strictEqual(en.quick.critical_spo2, 'Critical SpO2 (<90%)');
  assert.strictEqual(en.quick.patient_replied, 'Patient Responded');
  assert.strictEqual(en.quick.awaiting_patient, 'Awaiting Patient Reply');
  assert.strictEqual(en.quick.with_private_notes, 'Confidential Notes Quarantined');
  assert.strictEqual(en.quick.stale_revision, 'Stale Clinical Revision');

  // Search & Zero Results
  assert(en.search.placeholder.includes('Search by patient name, MRN'));
  assert.strictEqual(en.search.ariaLabel, 'Search assigned patients directory');
  assert.strictEqual(en.zero.title, 'No Matching Patients Found');
  assert.strictEqual(en.zero.resetBtn, 'Reset Search & Filters');
  assert.strictEqual(en.zero.emptyQueueTitle, 'No Real Patient Cases in Queue');
});

// ── Test 2: Professional Medical Arabic Localization Dictionary ──────────────
runTest('Professional Medical Arabic Localization Dictionary', () => {
  const ar = DoctorUI.getDoctorDirectoryI18n(false);

  // Tabs
  assert.strictEqual(ar.tabs.all, 'الكل (مرضى فعليين)');
  assert.strictEqual(ar.tabs.under_review, 'قيد الفحص السريري');
  assert.strictEqual(ar.tabs.assigned, 'بانتظار الطبيب');
  assert.strictEqual(ar.tabs.more_info_requested, 'مطلوب بيانات');
  assert.strictEqual(ar.tabs.approved, 'معتمد سريرياً');
  assert.strictEqual(ar.tabs.closed_escalated, 'مغلق ومصعّد');
  assert.strictEqual(ar.tabs.test_sandbox, '🧪 بيئة الاختبار (Sandbox)');

  // Priority
  assert.strictEqual(ar.priority.label, 'درجة الخطورة السريرية');
  assert.strictEqual(ar.priority.all, 'كل الأولويات');
  assert.strictEqual(ar.priority.urgent, '🚨 عاجل / طوارئ');
  assert.strictEqual(ar.priority.high, '⚠️ أولوية عالية');
  assert.strictEqual(ar.priority.normal, '🟢 عادية / مستقرة');

  // Sorting
  assert.strictEqual(ar.sort.label, 'الترتيب حسب');
  assert.strictEqual(ar.sort.waiting_desc, '⏳ الأطول انتظاراً (SLA)');
  assert.strictEqual(ar.sort.oxygen_asc, '🫁 الأكسجين الأقل (نقص أكسجة)');
  assert.strictEqual(ar.sort.priority_desc, '🚨 الأعلى أولوية');
  assert.strictEqual(ar.sort.newest, '🆕 الأحدث أولاً');
  assert.strictEqual(ar.sort.patient_name_asc, '🔤 اسم المريض (أبجدياً)');
  assert.strictEqual(ar.sort.status, '📋 مرحلة سير العمل');

  // Quick Chips
  assert.strictEqual(ar.quick.all, 'الكل');
  assert.strictEqual(ar.quick.critical_spo2, 'أكسجين حرج (<90%)');
  assert.strictEqual(ar.quick.patient_replied, 'رد المريض متاح');
  assert.strictEqual(ar.quick.awaiting_patient, 'بانتظار رد المريض');
  assert.strictEqual(ar.quick.with_private_notes, 'ملاحظات سرية معزولة');
  assert.strictEqual(ar.quick.stale_revision, 'تحديث سريري معلق');

  // Search & Zero Results
  assert(ar.search.placeholder.includes('ابحث باسم المريض'));
  assert.strictEqual(ar.search.ariaLabel, 'البحث في قائمة المرضى المعينين');
  assert.strictEqual(ar.zero.title, 'لم يتم العثور على مرضى مطابقين');
  assert.strictEqual(ar.zero.resetBtn, 'إعادة ضبط البحث والفلترة');
  assert.strictEqual(ar.zero.emptyQueueTitle, 'لا توجد حالات سريرية حقيقية في قائمة الانتظار');
});

// ── Test 3: Bi-directional Text Entry Markup Verification (dir="auto") ────────
runTest('Bi-directional Input Attributes & Styling (dir="auto", unicode-bidi)', () => {
  const appJs = fs.readFileSync(path.resolve(__dirname, '../../app/app.js'), 'utf8');
  const stylesCss = fs.readFileSync(path.resolve(__dirname, '../../app/styles.css'), 'utf8');

  // Check search input dir="auto"
  assert(
    appJs.includes('id="doctorPatientSearchInput"') && appJs.includes('dir="auto"'),
    'doctorPatientSearchInput must have dir="auto" for natural AR/EN switching'
  );

  // Check recommendations input dir="auto"
  assert(
    appJs.includes('id="doctorRecommendationsInput"') && appJs.includes('dir="auto"'),
    'doctorRecommendationsInput must have dir="auto"'
  );

  // Check diagnosis input dir="auto"
  assert(
    appJs.includes('id="doctorDiagnosisInput"') && appJs.includes('dir="auto"'),
    'doctorDiagnosisInput must have dir="auto"'
  );

  // Check medications input dir="auto"
  assert(
    appJs.includes('id="doctorMedicationsInput"') && appJs.includes('dir="auto"'),
    'doctorMedicationsInput must have dir="auto"'
  );

  // Check CSS unicode-bidi: plaintext in .practo-search-input
  assert(
    stylesCss.includes('.practo-search-input') && stylesCss.includes('unicode-bidi: plaintext;'),
    'CSS .practo-search-input must specify unicode-bidi: plaintext'
  );
});

// ── Test 4: Arabic Diacritics & Letter Variant Normalization Search ───────────
runTest('Arabic Diacritics & Variant Normalization in Search', () => {
  const cases = [
    {
      id: 'case-ar-1',
      name: 'أَحْمَدُ مُصْطَفَى',
      fileNumber: 'FILE-AR-001',
      symptoms: 'ضيقٌ شَدِيدٌ في التَّنَفُّس',
      clinicalDiagnosis: 'نَوْبَةُ رَبْوٍ حَادَّة',
      o2: 91,
      status: 'under_review'
    },
    {
      id: 'case-ar-2',
      name: 'فاطمة إبراهيم',
      fileNumber: 'FILE-AR-002',
      symptoms: 'سعال جاف مع بلغم خفيف',
      clinicalDiagnosis: 'التهاب الشعب الهوائية',
      o2: 96,
      status: 'assigned'
    }
  ];

  // Search normalized Alef (احمد instead of أَحْمَدُ)
  const res1 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'احمد' });
  assert.strictEqual(res1.length, 1, 'Search for "احمد" must match "أَحْمَدُ"');
  assert.strictEqual(res1[0].id, 'case-ar-1');

  // Search without diacritics for diacritized diagnosis (ربو instead of رَبْوٍ)
  const res2 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'ربو' });
  assert.strictEqual(res2.length, 1, 'Search for "ربو" must match "رَبْوٍ"');

  // Search Taa Marbuta / Haa normalization (فاطمه instead of فاطمة)
  const res3 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'فاطمه' });
  assert.strictEqual(res3.length, 1, 'Search for "فاطمه" must match "فاطمة"');

  // Search Alef variant (ابراهيم instead of إبراهيم)
  const res4 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'ابراهيم' });
  assert.strictEqual(res4.length, 1, 'Search for "ابراهيم" must match "إبراهيم"');
});

// ── Test 5: Clinical English Deep Search (MRN, Symptoms, Diagnosis) ───────────
runTest('Clinical English Deep Search (Name, MRN, Symptoms, Diagnosis)', () => {
  const cases = [
    {
      id: 'case-en-1',
      patientNameEn: 'Eleanor Vance',
      mrn: 'MRN-90210',
      symptomsEn: 'Exertional dyspnea and wheezing',
      clinicalDiagnosis: 'Moderate Persistent Asthma with Bronchospasm',
      o2: 89,
      status: 'under_review'
    },
    {
      id: 'case-en-2',
      patientNameEn: 'David Miller',
      mrn: 'MRN-44109',
      symptomsEn: 'Productive purulent cough, low-grade fever',
      clinicalDiagnosis: 'Acute Bronchitis',
      o2: 97,
      status: 'assigned'
    }
  ];

  // Search by English Name
  const resName = DoctorUI.filterAndSortDoctorCases(cases, { search: 'Eleanor' });
  assert.strictEqual(resName.length, 1);
  assert.strictEqual(resName[0].id, 'case-en-1');

  // Search by MRN
  const resMrn = DoctorUI.filterAndSortDoctorCases(cases, { search: '90210' });
  assert.strictEqual(resMrn.length, 1);
  assert.strictEqual(resMrn[0].id, 'case-en-1');

  // Search by English symptom
  const resSymptom = DoctorUI.filterAndSortDoctorCases(cases, { search: 'wheezing' });
  assert.strictEqual(resSymptom.length, 1);
  assert.strictEqual(resSymptom[0].id, 'case-en-1');

  // Search by English diagnosis
  const resDiag = DoctorUI.filterAndSortDoctorCases(cases, { search: 'bronchitis' });
  assert.strictEqual(resDiag.length, 1);
  assert.strictEqual(resDiag[0].id, 'case-en-2');
});

// ── Test 6: Cross-Language Search for Recommendations & Prescriptions ────────
runTest('Cross-Language Search across Recommendations and Prescriptions', () => {
  const cases = [
    {
      id: 'case-cross-1',
      patientName: 'عمر خالد',
      medications: ['Salbutamol 100mcg Inhaler', 'Paracetamol 500mg'],
      recommendations: ['Maintain hydration', 'Rest for 48 hours'],
      o2: 94,
      status: 'under_review'
    },
    {
      id: 'case-cross-2',
      patientNameEn: 'Sarah Connor',
      medications: ['موسع شعب هوائية', 'مضاد للهستامين'],
      recommendations: ['تناول السوائل الدافئة بوفرة', 'الابتعاد عن التدخين'],
      o2: 98,
      status: 'approved'
    }
  ];

  // Search English medication on Arabic patient record
  const res1 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'salbutamol' });
  assert.strictEqual(res1.length, 1);
  assert.strictEqual(res1[0].id, 'case-cross-1');

  // Search Arabic recommendation on English patient record
  const res2 = DoctorUI.filterAndSortDoctorCases(cases, { search: 'السوائل الدافئه' });
  assert.strictEqual(res2.length, 1);
  assert.strictEqual(res2[0].id, 'case-cross-2');
});

// ── Test 7: Multi-Dimensional Quick Triage Filtering ─────────────────────────
runTest('Multi-Dimensional Quick Triage Filtering (Critical SpO2 & Patient Replied)', () => {
  const cases = [
    { id: 'c-crit', name: 'Critical Patient', o2: 88, priority: 'urgent', status: 'under_review' },
    { id: 'c-stable', name: 'Stable Patient', o2: 97, priority: 'normal', status: 'assigned' },
    { id: 'c-replied', name: 'Replied Patient', o2: 95, status: 'more_info_requested', patientResponse: 'I uploaded the X-ray' },
    { id: 'c-await', name: 'Waiting Patient', o2: 96, status: 'more_info_requested', patientResponse: null }
  ];

  // Critical SpO2 (<90%)
  const critFiltered = DoctorUI.filterAndSortDoctorCases(cases, { quickFilter: 'critical_spo2' });
  assert.strictEqual(critFiltered.length, 1);
  assert.strictEqual(critFiltered[0].id, 'c-crit');

  // Patient Replied
  const repliedFiltered = DoctorUI.filterAndSortDoctorCases(cases, { quickFilter: 'patient_replied' });
  assert.strictEqual(repliedFiltered.length, 1);
  assert.strictEqual(repliedFiltered[0].id, 'c-replied');

  // Awaiting Patient Reply
  const awaitFiltered = DoctorUI.filterAndSortDoctorCases(cases, { quickFilter: 'awaiting_patient' });
  assert.strictEqual(awaitFiltered.length, 1);
  assert.strictEqual(awaitFiltered[0].id, 'c-await');
});

// ── Test 8: Locale-Aware Patient Collation (English A-Z vs Arabic أبجدياً) ────
runTest('Locale-Aware Alphabetical Sorting Collation', () => {
  const arCases = [
    { id: 'ar-t', name: 'طارق عبد الله' },
    { id: 'ar-b', name: 'باسم محمود' },
    { id: 'ar-a', name: 'أحمد سعيد' }
  ];

  const sortedAr = DoctorUI.filterAndSortDoctorCases(arCases, {
    sort: 'patient_name_asc',
    isEn: false
  });

  assert.strictEqual(sortedAr[0].id, 'ar-a', 'Arabic A-Z must start with أحمد');
  assert.strictEqual(sortedAr[1].id, 'ar-b', 'Arabic A-Z must have باسم second');
  assert.strictEqual(sortedAr[2].id, 'ar-t', 'Arabic A-Z must have طارق third');

  const enCases = [
    { id: 'en-c', patientNameEn: 'Charlie Brown' },
    { id: 'en-a', patientNameEn: 'Alice Cooper' },
    { id: 'en-b', patientNameEn: 'Bob Dylan' }
  ];

  const sortedEn = DoctorUI.filterAndSortDoctorCases(enCases, {
    sort: 'patient_name_asc',
    isEn: true
  });

  assert.strictEqual(sortedEn[0].id, 'en-a', 'English A-Z must start with Alice');
  assert.strictEqual(sortedEn[1].id, 'en-b', 'English A-Z must have Bob second');
  assert.strictEqual(sortedEn[2].id, 'en-c', 'English A-Z must have Charlie third');
});

// ── Test 9: Zero-Results Feedback Dynamic Messaging ─────────────────────────
runTest('Zero-Results Dynamic Feedback in English and Arabic', () => {
  const enI18n = DoctorUI.getDoctorDirectoryI18n(true);
  const arI18n = DoctorUI.getDoctorDirectoryI18n(false);

  // Without query
  assert.strictEqual(
    enI18n.zero.noQuery,
    'No patient records meet the active filter and triage selection.'
  );
  assert.strictEqual(
    arI18n.zero.noQuery,
    'لا توجد حالات تطابق شروط الفلترة أو الفرز السريع المحددة.'
  );

  // With query
  assert.strictEqual(
    enI18n.zero.withQuery('NonExistentPatient'),
    'No assigned patient records matched "NonExistentPatient".'
  );
  assert.strictEqual(
    arI18n.zero.withQuery('مريض غير موجود'),
    'لا توجد نتائج مطابقة لبحثك: "مريض غير موجود".'
  );
});

// ── Test 10: Backend Directory Service Bilingual Search Parity ──────────────
runTest('Backend Directory Service Search Parity (Alef, Symptoms, Rx)', () => {
  const pool = [
    {
      id: 'back-1',
      name: 'أَحْمَدُ حَسَن',
      patientUid: 'patient-ar-1',
      fileNumber: 'FILE-B1',
      symptoms: 'نقص في الأكسجين',
      recommendations: ['استخدام موسع الشعب الهوائية'],
      o2: 89,
      status: 'under_review'
    },
    {
      id: 'back-2',
      nameEn: 'Alexander Fleming',
      patientUid: 'patient-en-1',
      fileNumber: 'FILE-B2',
      symptomsEn: 'Bacterial chest congestion',
      medications: ['Penicillin 500mg'],
      o2: 96,
      status: 'approved'
    }
  ];

  // Search normalized Alef on backend
  const resBackAr = directoryService.filterAndSortAssignedPatients(pool, { search: 'احمد' });
  assert.strictEqual(resBackAr.total, 1);
  assert.strictEqual(resBackAr.cases[0].id, 'back-1');

  // Search English medication on backend
  const resBackEn = directoryService.filterAndSortAssignedPatients(pool, { search: 'penicillin' });
  assert.strictEqual(resBackEn.total, 1);
  assert.strictEqual(resBackEn.cases[0].id, 'back-2');

  // Search Arabic recommendation on backend
  const resBackRec = directoryService.filterAndSortAssignedPatients(pool, { search: 'موسع الشعب' });
  assert.strictEqual(resBackRec.total, 1);
  assert.strictEqual(resBackRec.cases[0].id, 'back-1');
});

console.log('---------------------------------------------------------');
console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Search & Directory Bilingual Tests Passed Successfully!`);
