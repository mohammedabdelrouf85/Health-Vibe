/**
 * Automated Test Suite: Doctor Reviewed Cases History & Certified Reports Archive
 * Benchmark: Rology (Clinical Archive, Instant PDF Preview, Multi-Device Responsive UI/UX)
 * Task: P1 Critical MVP | Product / Frontend | Doctor Dashboard UI/UX
 * 
 * Verifies:
 * 1. Approved Case Identification & Separation (isCaseReviewedOrApproved)
 * 2. Multi-Dimensional Archive Filtering (Search, Date Periods, Clinical Risk, Sorting)
 * 3. Rology Clinical Card Component Rendering (Vitals, Diagnosis, Official Seal, Action Buttons)
 * 4. Summary Archive Metrics / KPI Strip (Total Certified, Today, Critical, 100% Sealed)
 * 5. Interactive Quick Inspection Modal (openArchivedCaseQuickModal)
 * 6. Certified Printable PDF Document Viewer Modal (openArchivedCasePdfModal)
 * 7. Mobile, Tablet & Desktop Responsive CSS Rules (Touch Targets >= 44px, Grid Layouts)
 * 8. Workspace Segmented Navigation Integration (Worklist vs Reviewed History Archive)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

console.log('📚 Starting Doctor Reviewed Cases History & Archive Tests (Rology Benchmark)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Test ${testsTotal}: ${name}`);
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

// Mock dataset
const now = Date.now();
const testCases = [
  {
    id: 'rev-case-1',
    name: 'محمود عبد الفتاح',
    patientNameEn: 'Mahmoud Abdel Fattah',
    fileNumber: 'MRN-7701',
    nationalId: '29810101234567',
    age: 48,
    gender: 'ذكر',
    o2: 94,
    status: 'approved',
    doctorApproved: true,
    priority: 'normal',
    clinicalDiagnosis: 'التهاب رئوي حاد مستقر مع تحسن ملحوظ في التهوية الرئوية',
    medications: ['Azithromycin 500mg', 'Paracetamol 1g'],
    recommendations: ['الراحة التامة لمدة 3 أيام', 'مراجعة قياس الأكسجين'],
    signatureSeal: 'HV-SEAL-7701AA',
    doctorName: 'د. منة شريف',
    approvedAt: new Date(now - (2 * 3600000)).toISOString() // 2 hours ago (Today)
  },
  {
    id: 'rev-case-2',
    name: 'سارة إبراهيم',
    patientNameEn: 'Sarah Ibrahim',
    fileNumber: 'MRN-8802',
    nationalId: '29905051234568',
    age: 32,
    gender: 'أنثى',
    o2: 88,
    status: 'approved',
    doctorApproved: true,
    priority: 'urgent',
    clinicalDiagnosis: 'نوبة ربو شعبي حادة مع نقص أكسجة حرج (SpO2 88%)',
    medications: ['Salbutamol Nebulizer', 'Prednisolone 20mg'],
    recommendations: ['التوجه فوراً لقسم الطوارئ', 'جلسة استنشاق موسع شعب'],
    signatureSeal: 'HV-SEAL-8802BB',
    doctorName: 'د. منة شريف',
    approvedAt: new Date(now - (3 * 86400000)).toISOString() // 3 days ago (This week)
  },
  {
    id: 'rev-case-3',
    name: 'John Miller',
    patientNameEn: 'John Miller',
    fileNumber: 'MRN-9903',
    nationalId: '1098765432',
    age: 65,
    gender: 'Male',
    o2: 96,
    status: 'approved',
    doctorApproved: true,
    priority: 'high',
    clinicalDiagnosis: 'Chronic Obstructive Pulmonary Disease (COPD) stage II maintenance',
    medications: ['Tiotropium HandiHaler', 'Salmeterol/Fluticasone'],
    recommendations: ['Smoking cessation program', 'Pulmonary rehab exercises'],
    signatureSeal: 'HV-SEAL-9903CC',
    doctorName: 'Dr. Menna Sherif',
    approvedAt: new Date(now - (20 * 86400000)).toISOString() // 20 days ago (This month)
  },
  {
    id: 'unrev-case-4',
    name: 'كريم عادل',
    status: 'under_review',
    doctorApproved: false,
    priority: 'normal',
    o2: 97
  }
];

// ── Test 1: Case Approved Detection (isCaseReviewedOrApproved) ───────────────
runTest('Approved Case Identification & Segregation (isCaseReviewedOrApproved)', () => {
  assert.strictEqual(typeof DoctorUI.isCaseReviewedOrApproved, 'function');
  assert.strictEqual(DoctorUI.isCaseReviewedOrApproved(testCases[0]), true, 'Case 1 is approved');
  assert.strictEqual(DoctorUI.isCaseReviewedOrApproved(testCases[1]), true, 'Case 2 is approved');
  assert.strictEqual(DoctorUI.isCaseReviewedOrApproved(testCases[2]), true, 'Case 3 is approved');
  assert.strictEqual(DoctorUI.isCaseReviewedOrApproved(testCases[3]), false, 'Case 4 is under_review, not reviewed');
});

// ── Test 2: Multi-Field Search in Reviewed Archive ───────────────────────────
runTest('Multi-Field Deep Search across Archived Patient Records', () => {
  // Search by Arabic name
  const resNameAr = DoctorUI.filterDoctorReviewedHistory(testCases, { search: 'محمود' });
  assert.strictEqual(resNameAr.length, 1);
  assert.strictEqual(resNameAr[0].id, 'rev-case-1');

  // Search by MRN
  const resMrn = DoctorUI.filterDoctorReviewedHistory(testCases, { search: '8802' });
  assert.strictEqual(resMrn.length, 1);
  assert.strictEqual(resMrn[0].id, 'rev-case-2');

  // Search by English Diagnosis
  const resDiag = DoctorUI.filterDoctorReviewedHistory(testCases, { search: 'COPD' });
  assert.strictEqual(resDiag.length, 1);
  assert.strictEqual(resDiag[0].id, 'rev-case-3');

  // Search by Arabic Medication
  const resMed = DoctorUI.filterDoctorReviewedHistory(testCases, { search: 'Salbutamol' });
  assert.strictEqual(resMed.length, 1);
  assert.strictEqual(resMed[0].id, 'rev-case-2');
});

// ── Test 3: Date Period Filtering in Archive ─────────────────────────────────
runTest('Date Period Filtering (Today, Past 7 Days, Past 30 Days, All)', () => {
  // Today filter -> only case 1
  const resToday = DoctorUI.filterDoctorReviewedHistory(testCases, { dateFilter: 'today' });
  assert.strictEqual(resToday.length, 1);
  assert.strictEqual(resToday[0].id, 'rev-case-1');

  // Past 7 Days -> cases 1 & 2
  const resWeek = DoctorUI.filterDoctorReviewedHistory(testCases, { dateFilter: 'week' });
  assert.strictEqual(resWeek.length, 2);

  // Past 30 Days -> cases 1, 2, 3
  const resMonth = DoctorUI.filterDoctorReviewedHistory(testCases, { dateFilter: 'month' });
  assert.strictEqual(resMonth.length, 3);
});

// ── Test 4: Clinical Risk Filtering & Sorting in Archive ─────────────────────
runTest('Clinical Risk Filtering and Multi-Option Sorting', () => {
  // Urgent risk filter
  const resUrgent = DoctorUI.filterDoctorReviewedHistory(testCases, { priority: 'urgent' });
  assert.strictEqual(resUrgent.length, 1);
  assert.strictEqual(resUrgent[0].id, 'rev-case-2');

  // Sort by lowest SpO2 ascending
  const sortedO2 = DoctorUI.filterDoctorReviewedHistory(testCases, { sort: 'o2_asc' });
  assert.strictEqual(sortedO2[0].id, 'rev-case-2', 'Lowest SpO2 (88%) must be first');

  // Sort by oldest date ascending
  const sortedDateAsc = DoctorUI.filterDoctorReviewedHistory(testCases, { sort: 'date_asc' });
  assert.strictEqual(sortedDateAsc[0].id, 'rev-case-3', 'Oldest approval (20 days ago) must be first');
});

// ── Test 5: Rology Clinical Card Component Rendering ─────────────────────────
runTest('Rology Clinical Card Component Rendering (Vitals, Seal, Actions)', () => {
  const cardHtml = DoctorUI.renderArchivedCaseCardHtml(testCases[0], false);

  assert(cardHtml.includes('محمود عبد الفتاح'), 'Must include patient name');
  assert(cardHtml.includes('MRN-7701'), 'Must include MRN');
  assert(cardHtml.includes('94%'), 'Must display SpO2 vital');
  assert(cardHtml.includes('التهاب رئوي حاد'), 'Must include diagnosis snippet');
  assert(cardHtml.includes('HV-SEAL-7701AA'), 'Must include digital seal badge');
  assert(cardHtml.includes('viewArchivedCaseReport'), 'Must wire view report action');
  assert(cardHtml.includes('viewArchivedCasePdf'), 'Must wire view PDF action');
  assert(cardHtml.includes('openArchivedCaseQuickModal'), 'Must wire quick review modal');
});

// ── Test 6: Rology Archive Station Header & Summary KPIs ─────────────────────
runTest('Rology Archive Station Header & Summary KPI Strip', () => {
  const archiveHtml = DoctorUI.renderDoctorReviewedHistoryHtml({
    cases: testCases,
    isEn: true
  });

  assert(archiveHtml.includes('Reviewed Cases History & Certified Reports Archive'), 'Must render English title');
  assert(archiveHtml.includes('Total Certified'), 'Must include Total KPI');
  assert(archiveHtml.includes("Today's Reports"), 'Must include Today KPI');
  assert(archiveHtml.includes('Critical Triage'), 'Must include Critical KPI');
  assert(archiveHtml.includes('100%'), 'Must include 100% digital seal rate');
  assert(archiveHtml.includes('rology-archive-grid'), 'Must render cards grid');
});

// ── Test 7: Interactive Quick Inspection & PDF Modals ────────────────────────
runTest('Quick Review & Certified PDF Modal Triggers', () => {
  assert.strictEqual(typeof DoctorUI.openArchivedCaseQuickModal, 'function');
  assert.strictEqual(typeof DoctorUI.closeArchivedCaseQuickModal, 'function');
  assert.strictEqual(typeof DoctorUI.openArchivedCasePdfModal, 'function');
  assert.strictEqual(typeof DoctorUI.closeArchivedCasePdfModal, 'function');

  // Verify DOM creation in node mock
  let createdElement = null;
  global.document = {
    getElementById: () => null,
    createElement: (tag) => {
      createdElement = {
        id: '',
        style: {},
        setAttribute: () => {},
        innerHTML: ''
      };
      return createdElement;
    },
    body: {
      appendChild: () => {}
    }
  };
  global.state = { doctorQueue: testCases };

  DoctorUI.openArchivedCaseQuickModal('rev-case-1');
  assert(createdElement.innerHTML.includes('محمود عبد الفتاح'));
  assert(createdElement.innerHTML.includes('MRN-7701'));

  DoctorUI.openArchivedCasePdfModal('rev-case-1');
  assert(createdElement.innerHTML.includes('HealthVibes Telemedicine & Clinical Diagnostics'));
  assert(createdElement.innerHTML.includes('printableCertifiedReportSheet'));

  delete global.document;
  delete global.state;
});

// ── Test 8: Responsive Layout & Mobile/Tablet CSS Verification ────────────────
runTest('Responsive CSS Rules for Mobile (<768px) and Tablet (<1024px)', () => {
  const stylesCss = fs.readFileSync(path.resolve(__dirname, '../../app/styles.css'), 'utf8');

  // Verify nav bar and archive container classes
  assert(stylesCss.includes('.rology-workspace-nav-bar'), 'Must define .rology-workspace-nav-bar');
  assert(stylesCss.includes('.rology-archive-grid'), 'Must define .rology-archive-grid');
  assert(stylesCss.includes('.rology-archive-card'), 'Must define .rology-archive-card');

  // Verify tablet breakpoint (<1024px)
  assert(stylesCss.includes('@media (max-width: 1024px)'), 'Must include tablet media query');

  // Verify mobile breakpoint (<768px) with min 44px touch targets
  assert(stylesCss.includes('@media (max-width: 768px)'), 'Must include mobile media query');
  assert(stylesCss.includes('min-height: 44px') || stylesCss.includes('min-height: 48px'), 'Must enforce mobile touch targets >= 44px');
});

// ── Test 9: Workspace Mode Switcher Integration in index.html & app.js ───────
runTest('Workspace Navigation & Integration in index.html and app.js', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../app/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.resolve(__dirname, '../../app/app.js'), 'utf8');

  // Check switcher markup in index.html
  assert(indexHtml.includes('id="doctorWorkspaceNavBar"'), 'index.html must contain doctorWorkspaceNavBar');
  assert(indexHtml.includes('id="tabDoctorWorklist"'), 'index.html must contain tabDoctorWorklist');
  assert(indexHtml.includes('id="tabDoctorReviewedHistory"'), 'index.html must contain tabDoctorReviewedHistory');
  assert(indexHtml.includes('id="doctorReviewedHistorySection"'), 'index.html must contain doctorReviewedHistorySection');

  // Check controllers in app.js
  assert(appJs.includes('window.setDoctorWorkspaceMode = function'), 'app.js must define setDoctorWorkspaceMode');
  assert(appJs.includes('window.renderDoctorReviewedHistory = async function'), 'app.js must define renderDoctorReviewedHistory');
  assert(appJs.includes('window.viewArchivedCasePdf = function'), 'app.js must define viewArchivedCasePdf');
  assert(appJs.includes('window.viewArchivedCaseReport = function'), 'app.js must define viewArchivedCaseReport');
});

console.log('---------------------------------------------------------');
console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Reviewed Cases History Tests Passed Successfully!`);
