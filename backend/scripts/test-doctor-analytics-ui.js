/**
 * Automated Test Suite: Doctor Performance Analytics & Upcoming Clinic Appointments
 * Benchmark: TabeebHub (Clinical Dashboard, TAT Response Benchmarks, Responsive Multi-Device UI/UX)
 * Task: P1 Critical MVP | Product / Frontend | Doctor Dashboard UI/UX
 *
 * Verifies:
 * 1. calculateDoctorAnalytics: Metrics calculations (Caseload, Today's Completed, TAT in min, SLA Adherence Rate).
 * 2. buildDoctorUpcomingAppointments: Schedule generation & filtering (All, Today, Tomorrow, In-Clinic, Telehealth).
 * 3. getDoctorAnalyticsI18n: Complete bilingual support (Arabic and Clinical English).
 * 4. renderDoctorAnalyticsDashboardHtml: KPI cards, TAT speed meter, condition breakdown, and appointment action buttons.
 * 5. CSS Responsive Rules: Touch target min-height >= 44px, tablet 2-col, mobile 1-col layouts.
 * 6. App Integration: Navigation tab, section container, and workspace controllers.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

console.log('📊 Starting Doctor Analytics & Upcoming Appointments Tests (TabeebHub Benchmark)...\n');

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

// Sample mock cases dataset
const now = Date.now();
const oneHourAgo = new Date(now - 3600000).toISOString();
const twentyMinsAgo = new Date(now - 1200000).toISOString();
const twoDaysAgo = new Date(now - 172800000).toISOString();

const mockCases = [
  {
    id: 'case-001',
    patientName: 'أحمد محمود',
    age: 52,
    gender: 'ذكر',
    status: 'approved',
    doctorApproved: true,
    condition: 'asthma',
    chiefComplaint: 'نوبة ربو حادة مع ضيق تنفس ليلي',
    o2: 91,
    assignedAt: new Date(now - 25 * 60 * 1000).toISOString(),
    reviewedAt: new Date(now - 5 * 60 * 1000).toISOString(), // TAT = 20 mins (< 30m SLA)
  },
  {
    id: 'case-002',
    patientName: 'سارة خالد',
    age: 39,
    gender: 'أنثى',
    status: 'approved',
    doctorApproved: true,
    condition: 'hypertension',
    chiefComplaint: 'صداع نصفي متكرر مع ارتفاع في قراءة الضغط 150/95',
    o2: 98,
    assignedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    reviewedAt: new Date(now - 45 * 60 * 1000).toISOString(), // TAT = 15 mins (< 30m SLA)
  },
  {
    id: 'case-003',
    patientName: 'عمر ياسين',
    age: 64,
    gender: 'ذكر',
    status: 'approved',
    doctorApproved: true,
    condition: 'pneumonia',
    chiefComplaint: 'سعال مستمر وحمى منذ 4 أيام مع إجهاد تنفسي',
    o2: 89,
    assignedAt: new Date(now - 120 * 60 * 1000).toISOString(),
    reviewedAt: new Date(now - 80 * 60 * 1000).toISOString(), // TAT = 40 mins (> 30m SLA)
  },
  {
    id: 'case-004',
    patientName: 'فاطمة النجار',
    age: 45,
    gender: 'أنثى',
    status: 'pending',
    doctorApproved: false,
    condition: 'blood',
    chiefComplaint: 'فحص دوري لسيولة الدم مع شحوب عام',
    o2: 96,
  },
  {
    id: 'case-005',
    patientName: 'كريم نبيل',
    age: 28,
    gender: 'ذكر',
    status: 'pending',
    doctorApproved: false,
    condition: 'metabolic',
    chiefComplaint: 'متابعة قياسات السكر التراكمي وتعديل الجرعة',
    o2: 97,
  }
];

// Sample mock appointments
const mockAppointments = [
  {
    id: 'appt-101',
    caseId: 'case-004',
    patientName: 'فاطمة النجار',
    age: 45,
    gender: 'أنثى',
    time: '10:30 ص',
    dateLabel: 'today',
    type: 'in_person',
    status: 'confirmed',
    complaint: 'فحص دوري لسيولة الدم مع شحوب عام',
    spo2: 96,
  },
  {
    id: 'appt-102',
    caseId: 'case-005',
    patientName: 'كريم نبيل',
    age: 28,
    gender: 'ذكر',
    time: '11:15 ص',
    dateLabel: 'today',
    type: 'telehealth',
    status: 'waiting',
    complaint: 'متابعة قياسات السكر التراكمي وتعديل الجرعة',
    spo2: 97,
  },
  {
    id: 'appt-103',
    caseId: 'case-006',
    patientName: 'خالد إبراهيم',
    age: 58,
    gender: 'ذكر',
    time: '01:00 م',
    dateLabel: 'tomorrow',
    type: 'in_person',
    status: 'confirmed',
    complaint: 'متابعة أعراض الربو بعد بخاخ الكورتيزون',
    spo2: 95,
  }
];

// TEST 1: Doctor Analytics Calculations (Caseload, TAT, SLA rate)
runTest('calculateDoctorAnalytics returns accurate KPIs, TAT, and SLA compliance', () => {
  const analytics = DoctorUI.calculateDoctorAnalytics(mockCases, mockAppointments, {
    timeframe: 'all',
    apptFilter: 'all'
  });

  assert.strictEqual(analytics.totalReviewed, 3, 'Total reviewed cases should be 3');
  assert.strictEqual(analytics.todayReviewed, 3, "Today's completed cases should be 3");
  assert.strictEqual(analytics.activeQueueCount, 2, 'Pending queue count should be 2');

  // TAT checks: (20 + 15 + 40) / 3 = 75 / 3 = 25 minutes
  assert.strictEqual(analytics.avgTatMinutes, 25, 'Average TAT should be 25 minutes');
  
  // SLA checks: 2 out of 3 cases under 30 minutes = 67%
  assert.strictEqual(analytics.slaComplianceRate, 67, 'SLA compliance rate should be 67%');

  // Condition breakdown check
  assert.strictEqual(analytics.conditions.asthma, 1, 'Asthma count should be 1');
  assert.strictEqual(analytics.conditions.hypertension, 1, 'Hypertension count should be 1');
  assert.strictEqual(analytics.conditions.pneumonia, 1, 'Pneumonia count should be 1');
  assert.strictEqual(analytics.conditions.blood, 1, 'Blood condition count should be 1');
  assert.strictEqual(analytics.conditions.metabolic, 1, 'Metabolic condition count should be 1');
});

// TEST 2: Upcoming Appointments Filter (All, Today, Tomorrow, In-Person, Telehealth)
runTest('buildDoctorUpcomingAppointments filters slots and consultations accurately', () => {
  // Filter: All
  const allAppts = DoctorUI.buildDoctorUpcomingAppointments(mockAppointments, [], { apptFilter: 'all' });
  assert.strictEqual(allAppts.length, 3, 'Should return all 3 appointments');

  // Filter: Today
  const todayAppts = DoctorUI.buildDoctorUpcomingAppointments(mockAppointments, [], { apptFilter: 'today' });
  assert.strictEqual(todayAppts.length, 2, "Should return 2 appointments for today");
  assert.ok(todayAppts.every(a => a.dateLabel === 'today'), "All should have dateLabel === 'today'");

  // Filter: Tomorrow
  const tomorrowAppts = DoctorUI.buildDoctorUpcomingAppointments(mockAppointments, [], { apptFilter: 'tomorrow' });
  assert.strictEqual(tomorrowAppts.length, 1, "Should return 1 appointment for tomorrow");
  assert.strictEqual(tomorrowAppts[0].id, 'appt-103');

  // Filter: In-person
  const inPersonAppts = DoctorUI.buildDoctorUpcomingAppointments(mockAppointments, [], { apptFilter: 'in_person' });
  assert.strictEqual(inPersonAppts.length, 2, "Should return 2 in-person appointments");
  assert.ok(inPersonAppts.every(a => a.type === 'in_person'));

  // Filter: Telehealth
  const telehealthAppts = DoctorUI.buildDoctorUpcomingAppointments(mockAppointments, [], { apptFilter: 'telehealth' });
  assert.strictEqual(telehealthAppts.length, 1, "Should return 1 telehealth appointment");
  assert.strictEqual(telehealthAppts[0].type, 'telehealth');
});

// TEST 3: Fallback Appointments Generation
runTest('buildDoctorUpcomingAppointments synthesizes clinic queue when appointments array is empty', () => {
  const pendingCases = [
    { id: 'p-1', patientName: 'طارق علي', age: 40, gender: 'ذكر', o2: 95, chiefComplaint: 'ألم بالصدر' }
  ];
  const synthesized = DoctorUI.buildDoctorUpcomingAppointments([], pendingCases, { apptFilter: 'all' });
  assert.ok(synthesized.length >= 1, 'Should synthesize at least 1 appointment from pending cases');
  assert.strictEqual(synthesized[0].patientName, 'طارق علي');
  assert.strictEqual(synthesized[0].caseId, 'p-1');
  assert.ok(synthesized[0].time, 'Synthesized appointment should have an assigned time');
});

// TEST 4: Bilingual Dictionary Coverage (Arabic vs English)
runTest('getDoctorAnalyticsI18n contains matching bilingual keys', () => {
  const ar = DoctorUI.getDoctorAnalyticsI18n(false);
  const en = DoctorUI.getDoctorAnalyticsI18n(true);

  assert.strictEqual(typeof ar.header.title, 'string', 'Arabic header title must exist');
  assert.strictEqual(typeof en.header.title, 'string', 'English header title must exist');
  assert.strictEqual(ar.header.title, 'إحصائيات أداء الطبيب وجدول مواعيد العيادة');
  assert.strictEqual(en.header.title, 'Doctor Performance Analytics & Clinic Schedule');

  // Validate critical sections exist in both languages
  const sections = ['header', 'timeframe', 'kpis', 'caseload', 'efficiency', 'appointments'];
  for (const sec of sections) {
    assert.ok(ar[sec], `Arabic dictionary should include section: ${sec}`);
    assert.ok(en[sec], `English dictionary should include section: ${sec}`);
  }

  // Validate specific bilingual keys
  assert.ok(ar.kpis.totalReviewedTitle && en.kpis.totalReviewedTitle);
  assert.ok(ar.kpis.avgTatTitle && en.kpis.avgTatTitle);
  assert.ok(ar.appointments.btnExamine && en.appointments.btnExamine);
  assert.ok(ar.appointments.btnDossier && en.appointments.btnDossier);
  assert.ok(ar.appointments.btnReminder && en.appointments.btnReminder);
});

// TEST 5: HTML Dashboard Rendering & Action Elements
runTest('renderDoctorAnalyticsDashboardHtml renders cards, charts, and 1-click action triggers', () => {
  const analytics = DoctorUI.calculateDoctorAnalytics(mockCases, mockAppointments, {
    timeframe: 'today',
    apptFilter: 'all'
  });

  const htmlAr = DoctorUI.renderDoctorAnalyticsDashboardHtml(analytics, false);

  assert.ok(htmlAr.includes('tabeeb-analytics-container'), 'HTML should contain main container');
  assert.ok(htmlAr.includes('tabeeb-kpis-grid'), 'HTML should contain KPI grid');
  assert.ok(htmlAr.includes('tat-bands-grid'), 'HTML should contain TAT bands grid');
  assert.ok(htmlAr.includes('caseload-bars-list'), 'HTML should contain Caseload bars list');
  assert.ok(htmlAr.includes('tabeeb-appt-card'), 'HTML should contain appointment cards');

  // Verify Action Buttons
  assert.ok(htmlAr.includes('handleDoctorExamineAppt'), 'Should wire handleDoctorExamineAppt onclick');
  assert.ok(htmlAr.includes('handleDoctorViewPatientDossier'), 'Should wire handleDoctorViewPatientDossier onclick');
  assert.ok(htmlAr.includes('handleDoctorSendApptReminder'), 'Should wire handleDoctorSendApptReminder onclick');

  // English Render check
  const htmlEn = DoctorUI.renderDoctorAnalyticsDashboardHtml(analytics, true);
  assert.ok(htmlEn.includes('Doctor Performance Analytics'), 'English HTML should render English titles');
  assert.ok(htmlEn.includes('Average Turnaround Time') || htmlEn.includes('SLA Adherence Rate') || htmlEn.includes('Review Speed & SLA Efficiency'), 'English HTML should render English SLA title');
});

// TEST 6: Responsive CSS Rules in app/styles.css
runTest('app/styles.css includes TabeebHub responsive layout & touch target rules', () => {
  const cssPath = path.join(__dirname, '../../app/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Check critical classes
  assert.ok(cssContent.includes('.tabeeb-analytics-section'), 'CSS must include .tabeeb-analytics-section');
  assert.ok(cssContent.includes('.tabeeb-kpis-grid'), 'CSS must include .tabeeb-kpis-grid');
  assert.ok(cssContent.includes('.tabeeb-dashboard-body'), 'CSS must include .tabeeb-dashboard-body');
  assert.ok(cssContent.includes('.tabeeb-appt-card'), 'CSS must include .tabeeb-appt-card');

  // Check Tablet Breakpoint (max-width: 1024px)
  assert.ok(cssContent.includes('@media (max-width: 1024px)'), 'CSS must include Tablet media query');

  // Check Mobile Breakpoint (max-width: 768px)
  assert.ok(cssContent.includes('@media (max-width: 768px)'), 'CSS must include Mobile media query');

  // Touch Target >= 44px on mobile buttons
  assert.ok(cssContent.includes('min-height: 44px; /* Touch target requirement >= 44px */'),
    'CSS must enforce >= 44px touch targets on mobile for clinic usability');
});

// TEST 7: HTML & App Integration (Workspace Nav Tab, Section, Controllers)
runTest('index.html and app.js are integrated with tabDoctorAnalytics and controllers', () => {
  const htmlPath = path.join(__dirname, '../../app/index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(htmlContent.includes('id="tabDoctorAnalytics"'), 'index.html must include tabDoctorAnalytics button');
  assert.ok(htmlContent.includes('id="doctorAnalyticsSection"'), 'index.html must include doctorAnalyticsSection');
  assert.ok(htmlContent.includes('id="doctorUpcomingApptsCount"'), 'index.html must include live appts counter badge');

  const appJsPath = path.join(__dirname, '../../app/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert.ok(appJsContent.includes("mode === 'analytics'") || appJsContent.includes("mode === \"analytics\"") || appJsContent.includes("setDoctorWorkspaceMode('analytics')"),
    'app.js must handle analytics mode in setDoctorWorkspaceMode');
  assert.ok(appJsContent.includes('window.renderDoctorAnalyticsDashboard'),
    'app.js must expose window.renderDoctorAnalyticsDashboard');
  assert.ok(appJsContent.includes('window.handleDoctorExamineAppt'),
    'app.js must expose window.handleDoctorExamineAppt');
  assert.ok(appJsContent.includes('window.handleDoctorViewPatientDossier'),
    'app.js must expose window.handleDoctorViewPatientDossier');
  assert.ok(appJsContent.includes('window.handleDoctorSendApptReminder'),
    'app.js must expose window.handleDoctorSendApptReminder');
});

console.log('====================================================');
console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Analytics tests passed successfully!`);
console.log('====================================================\n');
