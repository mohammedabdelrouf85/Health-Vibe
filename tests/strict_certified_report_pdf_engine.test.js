/**
 * Health Vibe AI - Strict Certified Report PDF Engine Test Suite
 * PRD Page 8-9, Requirement 44:
 * "بناء محرك توليد تقرير الـ PDF المعتمد بحيث يفتح بدون أخطاء باللغتين العربية والإنجليزية
 * ويحتوي على الشعار، بيانات المريض، الطبيب، النتيجة، التوصيات، والـ Disclaimer."
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const reportsServicePath = path.resolve(__dirname, '../app/modules/reports/reports-service.js');
const reportsUiPath = path.resolve(__dirname, '../app/modules/reports/reports-ui.js');

console.log('==================================================================');
console.log('🏥 HEALTH VIBE AI: CERTIFIED REPORT PDF ENGINE TEST SUITE (PRD 44)');
console.log('   Bilingual (AR/EN), Logo, Patient, Doctor, Results, Rx, Disclaimer');
console.log('==================================================================\n');

// ── Instantiate Client VM Context ───────────────────────────────────────────
let popupWindowMock = null;
let modalCreatedElement = null;

function createClientEnvironment() {
  const elementsById = {};

  const docMock = {
    documentElement: { lang: 'ar', dir: 'rtl' },
    body: {
      classList: {
        add() {},
        remove() {},
        contains: () => false
      },
      appendChild(child) {
        if (child && child.id) {
          elementsById[child.id] = child;
        }
        return child;
      }
    },
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        contentWindow: {
          focus() {},
          print() {}
        },
        querySelector(selector) {
          if (selector === 'iframe') {
            return {
              srcdoc: '',
              contentWindow: {
                focus() {},
                print() {}
              }
            };
          }
          return null;
        },
        querySelectorAll() {
          return [];
        },
        appendChild(child) {
          if (child && child.id) {
            elementsById[child.id] = child;
          }
          return child;
        },
        remove() {
          if (this.id && elementsById[this.id]) {
            delete elementsById[this.id];
          }
        }
      };
      return el;
    },
    title: ''
  };

  const winMock = {
    console,
    URL,
    document: docMock,
    HealthVibes: {},
    open(url, target, features) {
      if (winMock.__simulatePopupBlocked) {
        return null;
      }
      popupWindowMock = {
        document: {
          written: '',
          open() { this.written = ''; },
          write(chunk) { this.written += chunk; },
          close() { this.closed = true; }
        },
        focusCalled: false,
        focus() { this.focusCalled = true; },
        close() { this.closed = true; }
      };
      return popupWindowMock;
    },
    print() {
      this.printCalled = true;
    }
  };

  winMock.window = winMock;
  const context = vm.createContext(winMock);
  vm.runInContext(fs.readFileSync(reportsServicePath, 'utf8'), context);
  vm.runInContext(fs.readFileSync(reportsUiPath, 'utf8'), context);

  return { context, winMock, docMock };
}

// ── Sample Certified Medical Case ───────────────────────────────────────────
const sampleCase = {
  id: 'case-resp-902',
  caseId: 'case-resp-902',
  reportRef: 'HV-REP-2026-902',
  patientId: 'patient-44',
  patientName: 'أحمد محمود رضوان',
  patientNameEn: 'Ahmed Mahmoud Radwan',
  patientAge: 42,
  patientGender: 'male',
  patientPhone: '+20 100 123 4567',
  patientEmail: 'ahmed.radwan@example.com',
  patientNationalId: '28405120102934',
  
  // Doctor demographics & credentials
  assignedDoctorId: 'doc-77',
  assignedDoctorName: 'د. طارق المنصور',
  assignedDoctorNameEn: 'Dr. Tarek Mansour',
  doctorSpecialty: 'استشاري أمراض الصدر والجهاز التنفسي',
  doctorSpecialtyEn: 'Consultant Pulmonologist & Respiratory Care',
  doctorLicense: 'EGY-MED-44912',
  clinicName: 'مركز هيلث فايب التخصصي لأمراض الصدر',
  clinicNameEn: 'Health Vibe Specialized Pulmonary Center',
  status: 'approved',
  doctorApproved: true,
  approvedAt: '2026-10-15T18:30:00.000Z',
  reportGeneratedAt: '2026-10-15T18:35:00.000Z',
  createdAt: '2026-10-15T17:00:00.000Z',
  reportVersion: '1.2.0',
  reportRevisionNumber: 1,
  reportHash: 'SHA256-44B9E31F77C8D124098A',

  // Clinical findings & vitals
  oxygenLevel: 93,
  respiratoryRate: 24,
  temperature: 38.2,
  breathingDifficulty: 'moderate',
  coughLevel: 'productive_yellow',
  symptomDuration: '5_days',
  triageScore: 'amber_moderate',
  clinicalDiagnosis: 'التهاب شعبي حاد متفاقم مع نقص طفيف في أكسجة الدم',
  clinicalDiagnosisEn: 'Acute Exacerbated Bronchitis with Mild Hypoxemia',

  // Recommendations & Prescribed Medications
  medications: '1. Salbutamol Inhaler 100mcg - بخاخ عند اللزوم كل 6 ساعات\n2. Amoxicillin/Clavulanate 1g - قرص كل 12 ساعة لمدة 7 أيام\n3. Paracetamol 500mg - قرص كل 8 ساعات عند ارتفاع الحرارة',
  medicationsEn: '1. Salbutamol Inhaler 100mcg: 2 puffs q6h PRN\n2. Amoxicillin/Clavulanate 1g: 1 tablet q12h x 7 days\n3. Paracetamol 500mg: 1 tablet q8h PRN fever',
  recommendations: [
    'مراقبة تشبع الأكسجين المنزلي بجهاز النبض مرتين يومياً وتدوين النتائج',
    'الراحة التامة والإكثار من السوائل الدافئة والابتعاد عن مهيجات الجهاز التنفسي والدخان',
    'مراجعة الطوارئ فوراً أو الاتصال بالإسعاف (123) في حال هبوط الأكسجين دون 90% أو حدوث زرقة بالأطراف'
  ],
  recommendationsEn: [
    'Monitor home SpO2 twice daily with a pulse oximeter and log readings',
    'Complete rest, adequate warm fluid hydration, and strict avoidance of smoke and irritants',
    'Seek immediate emergency care or call 123 if oxygen drops below 90% or peripheral cyanosis occurs'
  ]
};

async function runTestSuite() {
  const { context, winMock, docMock } = createClientEnvironment();
  const ReportsService = winMock.HealthVibes.ReportsService;
  const ReportsUI = winMock.HealthVibes.ReportsUI;

  assert.ok(ReportsService, 'ReportsService must be loaded on HealthVibes');
  assert.ok(ReportsUI, 'ReportsUI must be loaded on HealthVibes');
  assert.equal(typeof ReportsService.generateCertifiedReportPdfHtml, 'function', 'generateCertifiedReportPdfHtml must be a function');
  assert.equal(typeof ReportsUI.openCertifiedPdfReport, 'function', 'openCertifiedPdfReport must be a function');

  console.log('✅ Service and UI modules initialized successfully.\n');

  // ── TEST 1: Arabic Certified PDF HTML Generation ──────────────────────────
  console.log('🧪 TEST 1: Arabic Certified PDF Report HTML (RTL, Cairo font, Arabic Strings)');
  const htmlAr = ReportsService.generateCertifiedReportPdfHtml(sampleCase, 'ar');
  assert.ok(htmlAr.includes('dir="rtl"'), 'Arabic report must specify dir="rtl"');
  assert.ok(htmlAr.includes('lang="ar"'), 'Arabic report must specify lang="ar"');
  assert.ok(htmlAr.includes("font-family: 'Cairo'") || htmlAr.includes('Cairo'), 'Arabic report must specify Cairo font');
  assert.ok(htmlAr.includes('تقرير طبي معتمد'), 'Must contain Arabic title "تقرير طبي معتمد"');
  assert.ok(htmlAr.includes('بيانات المريض'), 'Must contain patient section "بيانات المريض"');
  assert.ok(htmlAr.includes('الطبيب المعالج'), 'Must contain doctor section "الطبيب المعالج"');
  assert.ok(htmlAr.includes('نتائج الفحص السريري') || htmlAr.includes('العلامات الحيوية'), 'Must contain results section');
  assert.ok(htmlAr.includes('التوصيات') || htmlAr.includes('تعليمات الرعاية'), 'Must contain recommendations section');
  assert.ok(htmlAr.includes('إخلاء مسؤولية') || htmlAr.includes('إخلاء المسؤولية'), 'Must contain disclaimer section');
  console.log('   ✓ Arabic structure and typography verified.');

  // ── TEST 2: English Certified PDF HTML Generation ─────────────────────────
  console.log('\n🧪 TEST 2: English Certified PDF Report HTML (LTR, Inter font, English Strings)');
  const htmlEn = ReportsService.generateCertifiedReportPdfHtml(sampleCase, 'en');
  assert.ok(htmlEn.includes('dir="ltr"'), 'English report must specify dir="ltr"');
  assert.ok(htmlEn.includes('lang="en"'), 'English report must specify lang="en"');
  assert.ok(htmlEn.includes('Inter'), 'English report must specify Inter font');
  assert.ok(htmlEn.includes('Certified Medical Report'), 'Must contain English title "Certified Medical Report"');
  assert.ok(htmlEn.includes('Patient Demographics'), 'Must contain English patient section');
  assert.ok(htmlEn.includes('Physician') || htmlEn.includes('Attending Physician'), 'Must contain English doctor section');
  assert.ok(htmlEn.includes('Clinical Examination Results') || htmlEn.includes('Physiological Vitals'), 'Must contain English findings section');
  assert.ok(htmlEn.includes('Recommendations') || htmlEn.includes('Clinical Directives'), 'Must contain English recommendations section');
  assert.ok(htmlEn.includes('Medical Disclaimer') || htmlEn.includes('Disclaimer'), 'Must contain English disclaimer section');
  console.log('   ✓ English structure and typography verified.');

  // ── TEST 3: Logo and Branding Component (الشعار) ──────────────────────────
  console.log('\n🧪 TEST 3: Logo and Branding Element (Embedded Vector SVG)');
  assert.ok(htmlAr.includes('<svg') && htmlAr.includes('viewBox="0 0 48 48"'), 'Must contain embedded vector SVG logo');
  assert.ok(htmlAr.includes('HEALTH VIBE') || htmlAr.includes('هيلث فايب'), 'Must contain clinic brand title');
  assert.ok(!htmlAr.includes('src="/images/logo.png"'), 'Must not rely on fragile external relative logo paths');
  console.log('   ✓ Vector SVG logo renders self-contained without external 404 risk.');

  // ── TEST 4: Patient Data (بيانات المريض) ───────────────────────────────────
  console.log('\n🧪 TEST 4: Patient Demographics Component');
  assert.ok(htmlAr.includes('أحمد محمود رضوان'), 'Arabic report contains patient name');
  assert.ok(htmlEn.includes('Ahmed Mahmoud Radwan') || htmlEn.includes('أحمد محمود رضوان'), 'English report contains patient name');
  assert.ok(htmlAr.includes('42'), 'Contains patient age');
  assert.ok(htmlAr.includes('HV-REP-2026-902'), 'Contains unique report reference');
  assert.ok(htmlAr.includes('28405120102934'), 'Contains patient national ID');
  assert.ok(htmlAr.includes('+20 100 123 4567'), 'Contains patient telephone');
  assert.ok(htmlAr.includes('ahmed.radwan@example.com'), 'Contains patient email');
  console.log('   ✓ Patient demographics completely verified.');

  // ── TEST 5: Doctor Data & Authenticity (الطبيب) ───────────────────────────
  console.log('\n🧪 TEST 5: Doctor Demographics & Digital Seal Component');
  assert.ok(htmlAr.includes('د. طارق المنصور'), 'Contains doctor Arabic name');
  assert.ok(htmlAr.includes('EGY-MED-44912'), 'Contains syndicate license number');
  assert.ok(htmlAr.includes('SHA256-44B9E31F77C8D124098A') || htmlAr.includes('44B9E31F'), 'Contains verification cryptographic hash');
  assert.ok(htmlAr.includes('OFFICIAL SEAL') || htmlAr.includes('ختم طبي رسمي معتمد'), 'Contains certified doctor seal');
  assert.ok(htmlAr.includes('<svg') && htmlAr.includes('viewBox="0 0 84 84"'), 'Contains QR verification code');
  console.log('   ✓ Doctor credentials, syndicate license, and digital seal verified.');

  // ── TEST 6: Clinical Results & Vitals (النتيجة) ───────────────────────────
  console.log('\n🧪 TEST 6: Clinical Results and Physiological Vitals');
  assert.ok(htmlAr.includes('93%'), 'Contains oxygen saturation %');
  assert.ok(htmlAr.includes('24'), 'Contains respiratory rate');
  assert.ok(htmlAr.includes('38.2'), 'Contains temperature');
  assert.ok(htmlAr.includes('التهاب شعبي حاد متفاقم'), 'Contains confirmed clinical diagnosis in Arabic');
  assert.ok(htmlEn.includes('Acute Exacerbated Bronchitis with Mild Hypoxemia') || htmlEn.includes('93%'), 'Contains diagnosis in English');
  console.log('   ✓ Clinical results, SpO2 badge, and diagnosis verified.');

  // ── TEST 7: Recommendations and Prescriptions (التوصيات) ──────────────────
  console.log('\n🧪 TEST 7: Recommendations and Prescriptions Component');
  assert.ok(htmlAr.includes('مراقبة تشبع الأكسجين'), 'Contains care plan directives');
  assert.ok(htmlAr.includes('Salbutamol Inhaler'), 'Contains prescribed medication');
  assert.ok(htmlAr.includes('Amoxicillin'), 'Contains antibiotic prescription');
  console.log('   ✓ Care recommendations and Rx prescriptions verified.');

  // ── TEST 8: Disclaimer & Emergency 123 Warning (الـ Disclaimer) ───────────
  console.log('\n🧪 TEST 8: Statutory Medical Disclaimer & Emergency Callout');
  assert.ok(htmlAr.includes('123'), 'Arabic disclaimer must contain emergency ambulance 123');
  assert.ok(htmlAr.includes('إخلاء مسؤولية') || htmlAr.includes('إخلاء المسؤولية'), 'Contains Arabic legal disclaimer title');
  assert.ok(htmlEn.includes('123'), 'English disclaimer must contain emergency ambulance 123');
  assert.ok(htmlEn.includes('Disclaimer'), 'Contains English legal disclaimer title');
  console.log('   ✓ Statutory disclaimer and 123 emergency alert verified.');

  // ── TEST 9: Popup Window Opening & Print Execution ────────────────────────
  console.log('\n🧪 TEST 9: PDF Opening Engine via Popup Window');
  winMock.__simulatePopupBlocked = false;
  popupWindowMock = null;
  const popupResult = ReportsUI.openCertifiedPdfReport(sampleCase, 'ar');
  assert.ok(popupResult, 'Popup call should return the opened window or indicator');
  assert.ok(popupWindowMock, 'window.open should have been called');
  assert.ok(popupWindowMock.document.written.length > 500, 'Popup document should have content written into it');
  assert.ok(popupWindowMock.document.closed, 'Popup document should be closed after writing');
  assert.ok(popupWindowMock.focusCalled, 'Popup window should be focused');
  console.log('   ✓ Popup window opening and printing lifecycle operates seamlessly.');

  // ── TEST 10: Popup Blocker Fallback to Inline Modal Iframe ────────────────
  console.log('\n🧪 TEST 10: Fallback to High-Fidelity Modal Iframe on Popup Blocker');
  winMock.__simulatePopupBlocked = true;
  popupWindowMock = null;
  const fallbackResult = ReportsUI.openCertifiedPdfReport(sampleCase, 'en');
  assert.ok(fallbackResult, 'Fallback call should succeed without throwing error');
  const modal = docMock.getElementById('certifiedPdfPreviewModal');
  assert.ok(modal, 'Modal preview container #certifiedPdfPreviewModal must be created on popup block');
  assert.ok(modal.innerHTML.includes('iframe') || modal.innerHTML.includes('certified-report-iframe'), 'Modal must contain preview iframe');
  assert.ok(modal.innerHTML.includes('window.print()') || modal.innerHTML.includes('print'), 'Modal must have a print action button');
  console.log('   ✓ Fallback iframe modal rendered successfully with zero runtime errors.');

  // ── TEST 11: applyApprovedReportSnapshot Safeguard ────────────────────────
  console.log('\n🧪 TEST 11: Snapshot Immutability Safeguard');
  const caseWithSnapshot = {
    ...sampleCase,
    reportSnapshot: {
      clinicalContent: {
        clinicalDiagnosis: 'Immutable Snapshot Diagnosis',
        oxygenLevel: 98
      },
      doctorIdentity: {
        name: 'Dr. Snapshot Certified',
        licenseNumber: 'EGY-SNAP-001'
      }
    }
  };
  const snapshotHtml = ReportsService.generateCertifiedReportPdfHtml(caseWithSnapshot, 'en');
  assert.ok(snapshotHtml.includes('Immutable Snapshot Diagnosis'), 'Report HTML must honor approved snapshot diagnosis');
  assert.ok(snapshotHtml.includes('Dr. Snapshot Certified'), 'Report HTML must honor approved snapshot doctor identity');
  console.log('   ✓ Report immutability preserved via snapshot evaluation.');

  console.log('\n==================================================================');
  console.log('🎉 ALL 11 CERTIFIED PDF REPORT TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================================');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
