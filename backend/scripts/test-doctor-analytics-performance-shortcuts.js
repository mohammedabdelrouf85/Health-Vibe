/**
 * QA & Performance Test Suite:
 * Doctor Performance Analytics & Upcoming Clinic Appointments (Performance & UX Polish)
 * Benchmark: TabeebHub (Sub-second < 1s SLA Guarantee & Rapid Keyboard Shortcuts)
 * Task: P2 High Priority | Product / Frontend | Doctor Analytics Performance & Shortcuts
 *
 * Verifies:
 * 1. Sub-second SLA Guarantee (< 1000ms) for Case & Medical History Dossier calculations & rendering
 * 2. In-Memory Doctor Analytics Caching (Zero-latency instant retrieval < 5ms)
 * 3. Bulk Preloading of Upcoming Appointments and Patient Dossiers for zero-lag inspection
 * 4. Telemetry Load Duration Recording & SLA Tracking (recordDoctorAnalyticsLoadMetric)
 * 5. Upcoming Appointments Keyboard Navigation (Cycling Up/Down between cards)
 * 6. Active Card Selection State & Boundary Capping
 * 7. Rapid Approval & Certification Execution (< 1000ms SLA)
 * 8. Visual Shortcuts Banner, SLA Badge Markup & <kbd> Badges in HTML
 * 9. Bilingual Shortcuts Help Modal Rendering & Dismissal
 * 10. CSS Performance, Keyboard Selection, and SLA Styling Verification in app/styles.css
 * 11. Application Integration in app/app.js with Telemetry Updates
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

console.log('⚡ Starting Doctor Analytics Performance & Shortcuts Tests (TabeebHub Benchmark)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Perf Test ${testsTotal}: ${name}`);
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

// ── Test 1: Sub-Second SLA Compliance for High-Volume Analytics (< 1000ms) ───
runTest('Sub-Second SLA Guarantee for 500 Cases and 100 Appointments (< 1000ms)', () => {
  const mockCases = [];
  const now = Date.now();
  for (let i = 0; i < 500; i++) {
    mockCases.push({
      id: `case-perf-${i}`,
      patientName: `مريض تجريبي ${i}`,
      patientNameEn: `Demo Patient ${i}`,
      mrn: `MRN-${1000 + i}`,
      condition: i % 4 === 0 ? 'asthma' : (i % 4 === 1 ? 'hypertension' : 'pneumonia'),
      clinicalDiagnosis: `Diagnosis for patient ${i}`,
      doctorApproved: i % 2 === 0,
      assignedAt: new Date(now - (i * 120000)).toISOString(),
      reviewedAt: new Date(now - (i * 60000)).toISOString()
    });
  }

  const mockAppts = [];
  for (let i = 0; i < 100; i++) {
    mockAppts.push({
      id: `appt-perf-${i}`,
      patientName: `مريض موعد ${i}`,
      patientNameEn: `Appointment Patient ${i}`,
      mrn: `MRN-A${i}`,
      timeStr: '10:30 AM',
      day: i % 2 === 0 ? 'today' : 'tomorrow',
      type: i % 2 === 0 ? 'in_person' : 'telehealth',
      status: 'confirmed',
      o2: 95,
      chiefComplaint: `Consultation reason for appointment ${i}`,
      caseId: `case-perf-${i}`
    });
  }

  const start = Date.now();
  const analyticsData = DoctorUI.calculateDoctorAnalytics(mockCases, mockAppts, { timeframe: 'all', isEn: true });
  const html = DoctorUI.renderDoctorAnalyticsDashboardHtml(analyticsData, true);
  const elapsed = Date.now() - start;

  assert(elapsed < 1000, `High-volume calculation and rendering took ${elapsed}ms; must be strictly < 1000ms SLA`);
  assert(html.includes('tabeeb-shortcuts-banner'), 'Rendered dashboard must include shortcuts banner');
  assert(html.includes('tabeeb-sla-chip'), 'Rendered dashboard must include SLA chip');
  assert(html.includes('< 1s SLA'), 'Rendered dashboard must display < 1s SLA badge');
  console.log(`     ⚡ Heavy rendering: 500 cases & 100 appointments rendered in ${elapsed}ms (Well under 1000ms SLA)`);
});

// ── Test 2: In-Memory Doctor Analytics Caching (Instant Zero-Latency) ────────
runTest('In-Memory Doctor Analytics Caching (cache, get, clear)', () => {
  assert.strictEqual(typeof DoctorUI.cacheDoctorAnalyticsData, 'function');
  assert.strictEqual(typeof DoctorUI.getCachedDoctorAnalyticsData, 'function');
  assert.strictEqual(typeof DoctorUI.clearDoctorAnalyticsCache, 'function');

  DoctorUI.clearDoctorAnalyticsCache();

  const apptId = 'appt-cache-test-01';
  const data = {
    id: apptId,
    patientName: 'أحمد محمود العوضي',
    chiefComplaint: 'فحص دوري لضغط الدم وضبط الجرعة'
  };

  assert.strictEqual(DoctorUI.getCachedDoctorAnalyticsData(apptId), null, 'Initially should be null');

  const startCache = Date.now();
  DoctorUI.cacheDoctorAnalyticsData(apptId, data);
  const retrieved = DoctorUI.getCachedDoctorAnalyticsData(apptId);
  const retrievalDuration = Date.now() - startCache;

  assert(retrievalDuration < 10, 'In-memory cache retrieval must be virtually zero latency (< 10ms)');
  assert.deepStrictEqual(retrieved, data, 'Cached object must match stored data');

  DoctorUI.clearDoctorAnalyticsCache();
  assert.strictEqual(DoctorUI.getCachedDoctorAnalyticsData(apptId), null, 'Cache must be empty after clear');
});

// ── Test 3: Bulk Preloading of Upcoming Appointments and Patient Dossiers ────
runTest('Bulk Preloading of Appointments (preloadDoctorAnalyticsBatch)', () => {
  assert.strictEqual(typeof DoctorUI.preloadDoctorAnalyticsBatch, 'function');

  DoctorUI.clearDoctorAnalyticsCache();

  const appointments = [
    { id: 'batch-appt-1', patientName: 'سارة خالد', caseId: 'case-batch-1' },
    { id: 'batch-appt-2', patientName: 'محمد حسن', caseId: 'case-batch-2' }
  ];

  const cases = [
    { id: 'case-batch-1', clinicalDiagnosis: 'Acute Asthma', baselineO2: 92 },
    { id: 'case-batch-2', clinicalDiagnosis: 'Hypertension Stage 1', baselineO2: 98 }
  ];

  const count = DoctorUI.preloadDoctorAnalyticsBatch(appointments, cases);
  assert.strictEqual(count, 4, 'Must preload both appointments and cases into fast memory cache');

  const cachedAppt = DoctorUI.getCachedDoctorAnalyticsData('batch-appt-1');
  assert.strictEqual(cachedAppt.patientName, 'سارة خالد');

  const cachedCase = DoctorUI.getCachedDoctorAnalyticsData('case-case-batch-1');
  assert.strictEqual(cachedCase.clinicalDiagnosis, 'Acute Asthma');
});

// ── Test 4: Telemetry Load Duration Recording & SLA Tracking ─────────────────
runTest('Telemetry Load Duration Recording & SLA Tracking', () => {
  assert.strictEqual(typeof DoctorUI.recordDoctorAnalyticsLoadMetric, 'function');
  assert.strictEqual(typeof DoctorUI.getLastDoctorAnalyticsLoadDuration, 'function');

  DoctorUI.recordDoctorAnalyticsLoadMetric('test-key', 42);
  assert.strictEqual(DoctorUI.getLastDoctorAnalyticsLoadDuration(), 42);

  // Negative values should be clamped to 0
  DoctorUI.recordDoctorAnalyticsLoadMetric('test-key', -15);
  assert.strictEqual(DoctorUI.getLastDoctorAnalyticsLoadDuration(), 0);
});

// ── Test 5: Upcoming Appointments Keyboard Navigation (Cycling Up/Down) ──────
runTest('Upcoming Appointments Keyboard Navigation (navigateDoctorUpcomingAppointments)', () => {
  assert.strictEqual(typeof DoctorUI.navigateDoctorUpcomingAppointments, 'function');
  assert.strictEqual(typeof DoctorUI.getActiveDoctorAppointmentId, 'function');
  assert.strictEqual(typeof DoctorUI.setActiveDoctorAppointmentId, 'function');

  // Mock DOM
  const cards = [
    { dataset: { apptId: 'appt-nav-1', caseId: 'case-1' }, classList: { add: () => {}, remove: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, focus: () => {}, scrollIntoView: () => {} },
    { dataset: { apptId: 'appt-nav-2', caseId: 'case-2' }, classList: { add: () => {}, remove: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, focus: () => {}, scrollIntoView: () => {} },
    { dataset: { apptId: 'appt-nav-3', caseId: 'case-3' }, classList: { add: () => {}, remove: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, focus: () => {}, scrollIntoView: () => {} }
  ];

  global.document = {
    querySelectorAll: (selector) => {
      if (selector === '.tabeeb-appt-card') return cards;
      return [];
    }
  };

  DoctorUI.setActiveDoctorAppointmentId('appt-nav-1');
  assert.strictEqual(DoctorUI.getActiveDoctorAppointmentId(), 'appt-nav-1');

  // Navigate Down (+1)
  const nextId = DoctorUI.navigateDoctorUpcomingAppointments(1);
  assert.strictEqual(nextId, 'appt-nav-2');
  assert.strictEqual(DoctorUI.getActiveDoctorAppointmentId(), 'appt-nav-2');

  // Navigate Down (+1)
  const nextId2 = DoctorUI.navigateDoctorUpcomingAppointments(1);
  assert.strictEqual(nextId2, 'appt-nav-3');

  // Boundary Capping at End
  const cappedEnd = DoctorUI.navigateDoctorUpcomingAppointments(1);
  assert.strictEqual(cappedEnd, 'appt-nav-3', 'Must cap at last appointment');

  // Navigate Up (-1)
  const prevId = DoctorUI.navigateDoctorUpcomingAppointments(-1);
  assert.strictEqual(prevId, 'appt-nav-2');

  delete global.document;
});

// ── Test 6: Rapid Approval & Certification Execution (< 1000ms SLA) ──────────
runTest('Rapid Approval & Certification Execution (< 1000ms SLA)', () => {
  assert.strictEqual(typeof DoctorUI.handleDoctorAnalyticsRapidApproval, 'function');

  let approvedCaseId = null;
  global.generateAndApproveReport = (id) => {
    approvedCaseId = id;
  };

  global.document = {
    getElementById: (id) => {
      if (id === 'doctorReviewAcknowledged') return { checked: false };
      return null;
    }
  };

  const start = Date.now();
  const success = DoctorUI.handleDoctorAnalyticsRapidApproval('case-rapid-01');
  const elapsed = Date.now() - start;

  assert.strictEqual(success, true, 'Rapid approval should return true');
  assert.strictEqual(approvedCaseId, 'case-rapid-01', 'Must invoke generateAndApproveReport with targeted caseId');
  assert(elapsed < 1000, `Rapid approval took ${elapsed}ms; must be strictly < 1000ms SLA`);

  delete global.generateAndApproveReport;
  delete global.document;
});

// ── Test 7: Visual Shortcuts Banner, SLA Badge Markup & <kbd> Badges ─────────
runTest('Visual Shortcuts Banner, SLA Badge Markup & <kbd> Badges', () => {
  const mockData = {
    timeframe: 'today',
    totalReviewed: 15,
    todayReviewed: 7,
    avgTatMinutes: 14,
    slaComplianceRate: 99.1,
    conditions: { asthma: 5, hypertension: 5, pneumonia: 3, blood: 1, metabolic: 1, other: 0 },
    upcomingAppointments: [
      {
        id: 'appt-k-1',
        patientName: 'عمر النجار',
        timeStr: '09:00 AM',
        day: 'today',
        type: 'in_person',
        status: 'waiting',
        o2: 96,
        chiefComplaint: 'متابعة سريرية',
        caseId: 'case-k-1'
      }
    ]
  };

  const htmlEn = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, true);
  const htmlAr = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, false);

  // Check shortcuts banner & SLA chip
  assert(htmlEn.includes('tabeeb-shortcuts-banner'), 'English dashboard must have tabeeb-shortcuts-banner');
  assert(htmlEn.includes('tabeeb-sla-chip'), 'English dashboard must have tabeeb-sla-chip');
  assert(htmlEn.includes('doctorAnalyticsLatency'), 'Must have doctorAnalyticsLatency element');

  // Check <kbd> badges in English
  assert(htmlEn.includes('<kbd class="tabeeb-kbd">Alt+1</kbd>'), 'Must have Alt+1 badge on Today');
  assert(htmlEn.includes('<kbd class="tabeeb-kbd">Alt+E</kbd>'), 'Must have Alt+E badge on Examine');
  assert(htmlEn.includes('<kbd class="tabeeb-kbd">Alt+D</kbd>'), 'Must have Alt+D badge on Dossier');
  assert(htmlEn.includes('<kbd class="tabeeb-kbd">Alt+R</kbd>'), 'Must have Alt+R badge on Reminder');

  // Check <kbd> badges in Arabic
  assert(htmlAr.includes('tabeeb-shortcuts-banner'), 'Arabic dashboard must have tabeeb-shortcuts-banner');
  assert(htmlAr.includes('<kbd class="tabeeb-kbd">Alt+1</kbd>'), 'Arabic must also feature Alt+1 badge');
  assert(htmlAr.includes('<kbd class="tabeeb-kbd">Alt+E</kbd>'), 'Arabic must feature Alt+E badge');
});

// ── Test 8: Bilingual Shortcuts Help Modal Rendering & Dismissal ────────────
runTest('Bilingual Shortcuts Help Modal Rendering & Dismissal', () => {
  assert.strictEqual(typeof DoctorUI.openDoctorAnalyticsShortcutsModal, 'function');
  assert.strictEqual(typeof DoctorUI.closeDoctorAnalyticsShortcutsModal, 'function');

  let modalElement = null;
  global.document = {
    getElementById: (id) => {
      if (id === 'tabeebAnalyticsShortcutsModal') return modalElement;
      return null;
    },
    createElement: () => {
      modalElement = {
        id: '',
        className: '',
        style: {},
        setAttribute: () => {},
        innerHTML: ''
      };
      return modalElement;
    },
    body: {
      appendChild: () => {}
    }
  };

  // English Modal
  global.currentLanguage = 'en';
  DoctorUI.openDoctorAnalyticsShortcutsModal();
  assert(modalElement.innerHTML.includes('Doctor Analytics & Clinic Schedule Shortcuts'), 'Must have English title');
  assert(modalElement.innerHTML.includes('Sub-Second Active'), 'Must display Sub-Second SLA indicator');
  assert.strictEqual(modalElement.style.display, 'flex');

  // Close
  DoctorUI.closeDoctorAnalyticsShortcutsModal();
  assert.strictEqual(modalElement.style.display, 'none');

  // Arabic Modal
  global.currentLanguage = 'ar';
  DoctorUI.openDoctorAnalyticsShortcutsModal();
  assert(modalElement.innerHTML.includes('اختصارات لوحة المفاتيح لإحصائيات الطبيب ومواعيد العيادة'), 'Must have Arabic title');
  assert(modalElement.innerHTML.includes('الاعتماد والتوثيق الطبي السريع'), 'Must mention rapid approval');

  delete global.document;
  delete global.currentLanguage;
});

// ── Test 9: CSS Verification in app/styles.css ──────────────────────────────
runTest('CSS Performance, Keyboard Selection, and SLA Styling in app/styles.css', () => {
  const stylesPath = path.join(__dirname, '../../app/styles.css');
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert(css.includes('.tabeeb-shortcuts-banner'), 'styles.css must define .tabeeb-shortcuts-banner');
  assert(css.includes('.tabeeb-sla-chip'), 'styles.css must define .tabeeb-sla-chip');
  assert(css.includes('.tabeeb-kbd'), 'styles.css must define .tabeeb-kbd');
  assert(css.includes('.tabeeb-appt-card.is-keyboard-selected'), 'styles.css must define .tabeeb-appt-card.is-keyboard-selected');
  assert(css.includes('.tabeeb-shortcuts-grid'), 'styles.css must define .tabeeb-shortcuts-grid');
});

// ── Test 10: Application Integration in app/app.js with Telemetry Updates ────
runTest('Application Integration in app/app.js with Telemetry Updates', () => {
  const appJsPath = path.join(__dirname, '../../app/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert(appJs.includes('recordDoctorAnalyticsLoadMetric'), 'app.js must invoke recordDoctorAnalyticsLoadMetric');
  assert(appJs.includes('doctorAnalyticsLatency'), 'app.js must update doctorAnalyticsLatency element');
  assert(appJs.includes('window.handleDoctorExamineAppt'), 'app.js must define window.handleDoctorExamineAppt');
  assert(appJs.includes('window.handleDoctorViewPatientDossier'), 'app.js must define window.handleDoctorViewPatientDossier');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('====================================================');
console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Analytics Performance & Shortcuts tests passed!`);
console.log('====================================================\n');
