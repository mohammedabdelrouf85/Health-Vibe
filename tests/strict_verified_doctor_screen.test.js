/**
 * Health Vibe AI - Verified Doctor Workspace Test Suite
 * 
 * Verifies PRD Page 8 Requirement 41:
 * 1. Assigned Patients Directory (قائمة المرضى المرتبطين بالطبيب):
 *    - Directory of patients linked to the authenticated doctor with clinical vitals (Age, Sex, BMI, Chronic Conditions, Allergies, Last Visit).
 *    - Search and condition filters.
 *    - Direct action to inspect medical timeline.
 * 2. Pending Review Queue (طابور الحالات المعلقة للمراجعة):
 *    - Live triage queue with counts, priority tags, SpO2, and immediate launch of #doctorReviewPanel.
 * 3. Approved Reports History Ledger (سجل التقارير المعتمدة):
 *    - Archive of digitally certified reports approved and stamped with the physician's electronic signature.
 *    - Search by diagnosis/patient and period filters.
 * 4. Data Isolation & Security:
 *    - Doctors must only access cases and patients assigned to their physician ID.
 * 5. Full i18n Parity (Arabic & English) across all doctor workspace keys.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🩺 HEALTH VIBE AI: VERIFIED DOCTOR WORKSPACE TEST SUITE');
console.log('   PRD Page 8 Req 41: Assigned Patients, Pending Queue, and Approved Reports');
console.log('================================================================================\n');

const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const appJsPath = path.join(__dirname, '..', 'app', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

const i18nPath = path.join(__dirname, '..', 'app', 'i18n.js');
const i18nContent = fs.readFileSync(i18nPath, 'utf8');

const cssPath = path.join(__dirname, '..', 'app', 'styles.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const serverJsPath = path.join(__dirname, '..', 'backend', 'server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

// ── TEST 1: Doctor Screen Header and Workspace Navigation Tabs ──────────────
console.log('▶ TEST 1: Doctor Screen Header and Workspace Navigation Tabs');
(() => {
  assert.ok(htmlContent.includes('id="screen-doctor"'), 'Missing #screen-doctor container');
  assert.ok(htmlContent.includes('class="doctor-workspace-tabs"'), 'Missing .doctor-workspace-tabs navigation bar');
  
  // 3 Primary Workspace Tabs
  assert.ok(htmlContent.includes('id="tabDoctorPendingQueue"'), 'Missing #tabDoctorPendingQueue button');
  assert.ok(htmlContent.includes('id="tabDoctorAssignedPatients"'), 'Missing #tabDoctorAssignedPatients button');
  assert.ok(htmlContent.includes('id="tabDoctorApprovedReports"'), 'Missing #tabDoctorApprovedReports button');

  // Real-time badge indicators
  assert.ok(htmlContent.includes('id="docPendingQueueCountBadge"'), 'Missing #docPendingQueueCountBadge');
  assert.ok(htmlContent.includes('id="docAssignedPatientsCountBadge"'), 'Missing #docAssignedPatientsCountBadge');
  assert.ok(htmlContent.includes('id="docApprovedReportsCountBadge"'), 'Missing #docApprovedReportsCountBadge');

  // Onclick triggers
  assert.ok(htmlContent.includes("switchDoctorWorkspaceTab('pending_queue')"), 'Missing switchDoctorWorkspaceTab pending_queue trigger');
  assert.ok(htmlContent.includes("switchDoctorWorkspaceTab('assigned_patients')"), 'Missing switchDoctorWorkspaceTab assigned_patients trigger');
  assert.ok(htmlContent.includes("switchDoctorWorkspaceTab('approved_reports')"), 'Missing switchDoctorWorkspaceTab approved_reports trigger');

  console.log('  ✓ Verified 3 workspace navigation tabs with count badges and click handlers.');
})();

// ── TEST 2: Pending Review Queue (طابور الحالات المعلقة) ─────────────────────
console.log('\n▶ TEST 2: Pending Review Queue Layout & Triage Review Panel');
(() => {
  assert.ok(htmlContent.includes('id="doctorWorkspaceLayout"'), 'Missing #doctorWorkspaceLayout');
  assert.ok(htmlContent.includes('id="doctorQueuePanel"'), 'Missing #doctorQueuePanel');
  assert.ok(htmlContent.includes('id="doctorQueueList"'), 'Missing #doctorQueueList');
  assert.ok(htmlContent.includes('id="doctorReviewPanel"'), 'Missing #doctorReviewPanel');

  // Logic in app.js
  assert.ok(appJsContent.includes('function switchDoctorWorkspaceTab'), 'Missing switchDoctorWorkspaceTab implementation');
  assert.ok(appJsContent.includes('window.switchDoctorWorkspaceTab = switchDoctorWorkspaceTab'), 'switchDoctorWorkspaceTab must be on window');

  // Verify doctor queue rendering and badge update
  assert.ok(appJsContent.includes('docPendingQueueCountBadge'), 'Missing reference to docPendingQueueCountBadge in app.js');
  assert.ok(appJsContent.includes('docAssignedPatientsCountBadge'), 'Missing reference to docAssignedPatientsCountBadge in app.js');
  assert.ok(appJsContent.includes('docApprovedReportsCountBadge'), 'Missing reference to docApprovedReportsCountBadge in app.js');

  console.log('  ✓ Verified Pending Queue layout, triage queue panel, and badge updates.');
})();

// ── TEST 3: Assigned Patients Directory (قائمة المرضى المرتبطين بالطبيب) ─────
console.log('\n▶ TEST 3: Assigned Patients Directory');
(() => {
  assert.ok(htmlContent.includes('id="doctorAssignedPatientsView"'), 'Missing #doctorAssignedPatientsView container');
  assert.ok(htmlContent.includes('id="doctorPatientSearchInput"'), 'Missing #doctorPatientSearchInput search bar');
  assert.ok(htmlContent.includes('id="doctorPatientConditionFilter"'), 'Missing #doctorPatientConditionFilter filter dropdown');
  assert.ok(htmlContent.includes('id="doctorAssignedPatientsList"'), 'Missing #doctorAssignedPatientsList container');

  // Check functions in app.js
  assert.ok(appJsContent.includes('async function loadDoctorAssignedPatients'), 'Missing loadDoctorAssignedPatients function');
  assert.ok(appJsContent.includes('function renderDoctorAssignedPatientsList'), 'Missing renderDoctorAssignedPatientsList function');
  assert.ok(appJsContent.includes('function filterDoctorAssignedPatients'), 'Missing filterDoctorAssignedPatients function');
  assert.ok(appJsContent.includes('function filterDoctorAssignedPatientsByCondition'), 'Missing filterDoctorAssignedPatientsByCondition function');
  assert.ok(appJsContent.includes('window.loadDoctorAssignedPatients = loadDoctorAssignedPatients'), 'loadDoctorAssignedPatients must be on window');

  // Timeline button handler
  assert.ok(appJsContent.includes('openPatientTimelineModal'), 'Missing openPatientTimelineModal helper');

  console.log('  ✓ Verified Assigned Patients directory with search, condition filtering, and timeline triggers.');
})();

// ── TEST 4: Approved Reports History Ledger (سجل التقارير المعتمدة) ──────────
console.log('\n▶ TEST 4: Approved Reports History Ledger');
(() => {
  assert.ok(htmlContent.includes('id="doctorApprovedReportsView"'), 'Missing #doctorApprovedReportsView container');
  assert.ok(htmlContent.includes('id="doctorApprovedReportSearchInput"'), 'Missing #doctorApprovedReportSearchInput');
  assert.ok(htmlContent.includes('id="doctorApprovedReportDateFilter"'), 'Missing #doctorApprovedReportDateFilter');
  assert.ok(htmlContent.includes('id="doctorApprovedReportsList"'), 'Missing #doctorApprovedReportsList');

  // Check functions in app.js
  assert.ok(appJsContent.includes('async function loadDoctorApprovedReports'), 'Missing loadDoctorApprovedReports function');
  assert.ok(appJsContent.includes('function renderDoctorApprovedReportsList'), 'Missing renderDoctorApprovedReportsList function');
  assert.ok(appJsContent.includes('function filterDoctorApprovedReports'), 'Missing filterDoctorApprovedReports function');
  assert.ok(appJsContent.includes('function filterDoctorApprovedReportsByPeriod'), 'Missing filterDoctorApprovedReportsByPeriod function');
  assert.ok(appJsContent.includes('window.loadDoctorApprovedReports = loadDoctorApprovedReports'), 'loadDoctorApprovedReports must be on window');

  console.log('  ✓ Verified Approved Reports ledger with diagnosis/patient search and period filters.');
})();

// ── TEST 5: Backend Server Endpoints for Doctor Workspace ───────────────────
console.log('\n▶ TEST 5: Backend Server Endpoints for Doctor Workspace');
(() => {
  // GET /api/doctor/assigned-patients
  assert.ok(serverJsContent.includes("app.get('/api/doctor/assigned-patients'"), 'Missing /api/doctor/assigned-patients endpoint');
  assert.ok(serverJsContent.includes('assignedDoctorId') || serverJsContent.includes('doctorUid'), 'Must check assigned doctor in backend');

  // GET /api/doctor/approved-reports
  assert.ok(serverJsContent.includes("app.get('/api/doctor/approved-reports'"), 'Missing /api/doctor/approved-reports endpoint');

  // RBAC checks
  assert.ok(serverJsContent.includes("requireDoctor"), 'Doctor endpoints must enforce requireDoctor');

  console.log('  ✓ Verified /api/doctor/assigned-patients and /api/doctor/approved-reports with RBAC.');
})();

// ── TEST 6: Strict Data Isolation and Client In-Memory Filter ────────────────
console.log('\n▶ TEST 6: Strict Data Isolation and In-Memory Filter');
(() => {
  // Required by tests/strict_doctor_assigned_queries.test.js
  assert.ok(
    appJsContent.includes('docs = docs.filter(c => isCaseAssignedToCurrentDoctor(c));'),
    'app.js must preserve strict snapshot filtering docs = docs.filter(c => isCaseAssignedToCurrentDoctor(c));'
  );

  assert.ok(
    appJsContent.includes('isCaseAssignedToCurrentDoctor'),
    'app.js must enforce isCaseAssignedToCurrentDoctor'
  );

  console.log('  ✓ Verified strict physician isolation and snapshot query guards.');
})();

// ── TEST 7: Full i18n Key Parity (Arabic and English) ───────────────────────
console.log('\n▶ TEST 7: Full i18n Key Parity for Doctor Workspace');
(() => {
  const i18nModule = require('../app/i18n.js');
  const arDoctor = i18nModule.translations.ar.doctor;
  const enDoctor = i18nModule.translations.en.doctor;

  assert.ok(arDoctor, 'translations.ar.doctor is missing');
  assert.ok(enDoctor, 'translations.en.doctor is missing');

  const requiredDoctorKeys = [
    'tabPendingQueue',
    'tabAssignedPatients',
    'tabApprovedReports',
    'pendingQueueDesc',
    'assignedPatientsDesc',
    'approvedReportsDesc',
    'searchPatients',
    'searchApprovedReports',
    'patientMrn',
    'lastAssessment',
    'totalAssessments',
    'viewTimeline',
    'viewCertifiedReport',
    'noAssignedPatients',
    'noApprovedReports',
    'doctorVerifiedBadge',
    'certifiedAt',
    'certifiedDiagnosis',
    'prescriptionsSummary'
  ];

  for (const key of requiredDoctorKeys) {
    assert.ok(arDoctor[key], `Missing Arabic key: doctor.${key}`);
    assert.ok(enDoctor[key], `Missing English key: doctor.${key}`);
    assert.strictEqual(typeof arDoctor[key], 'string', `doctor.${key} (ar) must be a string`);
    assert.strictEqual(typeof enDoctor[key], 'string', `doctor.${key} (en) must be a string`);
    assert.ok(arDoctor[key].trim().length > 0, `doctor.${key} (ar) must not be empty`);
    assert.ok(enDoctor[key].trim().length > 0, `doctor.${key} (en) must not be empty`);
  }

  console.log(`  ✓ Verified all ${requiredDoctorKeys.length} doctor workspace translation keys across Arabic and English.`);
})();

// ── TEST 8: CSS Theme and Layout Verification ───────────────────────────────
console.log('\n▶ TEST 8: CSS Theme and Layout Verification');
(() => {
  assert.ok(cssContent.includes('.doctor-workspace-tabs'), 'Missing .doctor-workspace-tabs style');
  assert.ok(cssContent.includes('.doctor-workspace-tab'), 'Missing .doctor-workspace-tab style');
  assert.ok(cssContent.includes('.doctor-assigned-patient-card'), 'Missing .doctor-assigned-patient-card style');
  assert.ok(cssContent.includes('.doctor-approved-report-card'), 'Missing .doctor-approved-report-card style');

  // Verify WCAG requirement for light theme
  assert.ok(cssContent.includes('--muted: #2e4d50;'), 'Must maintain WCAG compliant --muted in light theme');

  console.log('  ✓ Verified CSS styles for tabs, patient cards, report cards, and WCAG compliance.');
})();

console.log('\n================================================================================');
console.log('🎉 ALL VERIFIED DOCTOR WORKSPACE TESTS PASSED! (8/8)');
console.log('================================================================================');
