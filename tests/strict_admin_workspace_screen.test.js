/**
 * Health Vibe AI - Admin Workspace & Governance Screen Test Suite
 * 
 * Verifies PRD Page 8 Requirement 42:
 * 1. Users, Doctors & Branches Statistics (إحصائيات المستخدمين والأطباء والفروع):
 *    - Real-time counts for users, doctors, clinic branches, cases, SpO2, completion, TAT.
 *    - Clinic / branch filtering dropdown (#adminBranchFilterSelect).
 *    - Clinical triage & risk distribution breakdown.
 * 2. Doctor Credential Verification Queue (طلبات توثيق الأطباء):
 *    - Applications list with license verification, specialty, attached documents.
 *    - Real-time search filter (#adminDoctorAppSearchInput) & status tabs.
 *    - Server endpoints for official approval & promotion and rejection.
 * 3. AI Model Quality & Performance Metrics (مؤشرات جودة وأداء نماذج الذكاء الاصطناعي):
 *    - Sensitivity, Specificity, Precision, ROC-AUC, Concordance Rate, Inference Latency.
 *    - Safety guardrails emergency escalation monitoring.
 *    - Model version comparison matrix (v1.2 Production vs v2.0 Staged).
 * 4. Full i18n Key Parity (Arabic and English) for the admin namespace.
 * 5. Server Security & RBAC: Only administrators can access admin metrics.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🏛️  HEALTH VIBE AI: ADMIN WORKSPACE & GOVERNANCE SCREEN TEST SUITE');
console.log('   PRD Page 8 Req 42: Statistics, Doctor Applications, and AI Performance');
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

// ── TEST 1: Admin Workspace Navigation Tabs & Realtime Badges ───────────────
console.log('▶ TEST 1: Admin Workspace Navigation Tabs & Badges');
(() => {
  assert.ok(htmlContent.includes('id="screen-admin"'), 'Missing #screen-admin container');
  assert.ok(htmlContent.includes('class="admin-workspace-tabs"'), 'Missing .admin-workspace-tabs navigation bar');

  // 3 Primary Workspace Tabs
  assert.ok(htmlContent.includes('id="tabAdminStats"'), 'Missing #tabAdminStats button');
  assert.ok(htmlContent.includes('id="tabAdminDoctorVerification"'), 'Missing #tabAdminDoctorVerification button');
  assert.ok(htmlContent.includes('id="tabAdminAiMetrics"'), 'Missing #tabAdminAiMetrics button');

  // Badges
  assert.ok(htmlContent.includes('id="adminStatsCountBadge"'), 'Missing #adminStatsCountBadge');
  assert.ok(htmlContent.includes('id="adminPendingAppsCountBadge"'), 'Missing #adminPendingAppsCountBadge');
  assert.ok(htmlContent.includes('id="adminAiConcordanceBadge"'), 'Missing #adminAiConcordanceBadge');

  // Tab switching triggers
  assert.ok(htmlContent.includes("switchAdminWorkspaceTab('stats')"), 'Missing switchAdminWorkspaceTab stats trigger');
  assert.ok(htmlContent.includes("switchAdminWorkspaceTab('doctor_verification')"), 'Missing switchAdminWorkspaceTab doctor_verification trigger');
  assert.ok(htmlContent.includes("switchAdminWorkspaceTab('ai_metrics')"), 'Missing switchAdminWorkspaceTab ai_metrics trigger');

  // Functions in app.js
  assert.ok(appJsContent.includes('function switchAdminWorkspaceTab'), 'Missing switchAdminWorkspaceTab implementation in app.js');
  assert.ok(appJsContent.includes('window.switchAdminWorkspaceTab = switchAdminWorkspaceTab'), 'switchAdminWorkspaceTab must be on window');

  console.log('  ✓ Verified 3 admin navigation tabs with count badges and tab switching.');
})();

// ── TEST 2: Users, Doctors & Branches Statistics View ───────────────────────
console.log('\n▶ TEST 2: Users, Doctors & Branches Statistics View');
(() => {
  assert.ok(htmlContent.includes('id="adminStatsView"'), 'Missing #adminStatsView container');
  assert.ok(htmlContent.includes('id="adminBranchFilterSelect"'), 'Missing #adminBranchFilterSelect dropdown');

  // Authoritative counters
  assert.ok(htmlContent.includes('id="adminUsersTotalCount"'), 'Missing #adminUsersTotalCount');
  assert.ok(htmlContent.includes('id="adminTotalDoctorsCount"'), 'Missing #adminTotalDoctorsCount');
  assert.ok(htmlContent.includes('id="adminBranchesCount"'), 'Missing #adminBranchesCount');
  assert.ok(htmlContent.includes('id="adminTotalCasesCount"'), 'Missing #adminTotalCasesCount');
  assert.ok(htmlContent.includes('id="adminPendingReviewsCount"'), 'Missing #adminPendingReviewsCount');
  assert.ok(htmlContent.includes('id="adminAvgSpO2Count"'), 'Missing #adminAvgSpO2Count');

  // Clinical distribution bars
  assert.ok(htmlContent.includes('id="adminDistUrgentCount"'), 'Missing #adminDistUrgentCount');
  assert.ok(htmlContent.includes('id="adminDistHighCount"'), 'Missing #adminDistHighCount');
  assert.ok(htmlContent.includes('id="adminDistNormalCount"'), 'Missing #adminDistNormalCount');
  assert.ok(htmlContent.includes('id="adminDistApprovedCount"'), 'Missing #adminDistApprovedCount');

  // Branch filter function
  assert.ok(appJsContent.includes('function filterAdminStatsByBranch'), 'Missing filterAdminStatsByBranch in app.js');
  assert.ok(appJsContent.includes('window.filterAdminStatsByBranch = filterAdminStatsByBranch'), 'filterAdminStatsByBranch must be on window');

  console.log('  ✓ Verified users, doctors, branches counters and clinical risk distribution.');
})();

// ── TEST 3: Doctor Credential Verification Queue View ───────────────────────
console.log('\n▶ TEST 3: Doctor Credential Verification Queue View');
(() => {
  assert.ok(htmlContent.includes('id="adminDoctorVerificationView"'), 'Missing #adminDoctorVerificationView container');
  assert.ok(htmlContent.includes('id="adminDoctorAppSearchInput"'), 'Missing #adminDoctorAppSearchInput search bar');
  assert.ok(htmlContent.includes('id="adminDoctorAppsList"'), 'Missing #adminDoctorAppsList container');
  assert.ok(htmlContent.includes('id="adminPendingAppsBadge"'), 'Missing #adminPendingAppsBadge');

  // Search filter function
  assert.ok(appJsContent.includes('function filterAdminDoctorApplications'), 'Missing filterAdminDoctorApplications in app.js');
  assert.ok(appJsContent.includes('window.filterAdminDoctorApplications = filterAdminDoctorApplications'), 'filterAdminDoctorApplications must be on window');

  // Administrative action handlers
  assert.ok(appJsContent.includes('approveDoctorApplication'), 'Missing approveDoctorApplication in app.js');
  assert.ok(appJsContent.includes('rejectDoctorApplication'), 'Missing rejectDoctorApplication in app.js');
  assert.ok(appJsContent.includes('promptAddDoctorVerificationToQueue'), 'Missing promptAddDoctorVerificationToQueue');

  console.log('  ✓ Verified doctor verification board, search filtering, and approval/rejection actions.');
})();

// ── TEST 4: Clinical AI Model Quality & Performance Metrics View ─────────────
console.log('\n▶ TEST 4: Clinical AI Model Quality & Performance Metrics View');
(() => {
  assert.ok(htmlContent.includes('id="adminAiMetricsView"'), 'Missing #adminAiMetricsView container');
  assert.ok(htmlContent.includes('id="adminAiMetricsBadge"'), 'Missing #adminAiMetricsBadge');

  // Core metrics
  assert.ok(htmlContent.includes('id="adminAiSensitivity"'), 'Missing #adminAiSensitivity');
  assert.ok(htmlContent.includes('id="adminAiSpecificity"'), 'Missing #adminAiSpecificity');
  assert.ok(htmlContent.includes('id="adminAiPrecision"'), 'Missing #adminAiPrecision');
  assert.ok(htmlContent.includes('id="adminAiAuc"'), 'Missing #adminAiAuc');
  assert.ok(htmlContent.includes('id="adminAiConcordance"'), 'Missing #adminAiConcordance');
  assert.ok(htmlContent.includes('id="adminAiLatency"'), 'Missing #adminAiLatency');

  // Safety guardrails & comparison matrix
  assert.ok(htmlContent.includes('id="adminAiGuardrails"'), 'Missing #adminAiGuardrails');
  assert.ok(htmlContent.includes('class="admin-benchmark-matrix"'), 'Missing .admin-benchmark-matrix table');
  assert.ok(htmlContent.includes('id="adminAiStagedSensitivity"'), 'Missing #adminAiStagedSensitivity');
  assert.ok(htmlContent.includes('id="adminAiStagedAuc"'), 'Missing #adminAiStagedAuc');

  console.log('  ✓ Verified AI quality metrics (Sensitivity, Specificity, AUC, Concordance, Latency, Benchmark Matrix).');
})();

// ── TEST 5: Backend Server Endpoints for Admin Workspace ────────────────────
console.log('\n▶ TEST 5: Backend Server Endpoints for Admin Workspace');
(() => {
  // GET /api/admin/metrics
  assert.ok(serverJsContent.includes("app.get('/api/admin/metrics'"), 'Missing GET /api/admin/metrics in backend/server.js');
  assert.ok(serverJsContent.includes('aiModelMetrics'), 'GET /api/admin/metrics must return aiModelMetrics');

  // POST /api/admin/approve-doctor-application
  assert.ok(serverJsContent.includes("app.post('/api/admin/approve-doctor-application'"), 'Missing POST /api/admin/approve-doctor-application');

  // POST /api/admin/reject-doctor-application
  assert.ok(serverJsContent.includes("app.post('/api/admin/reject-doctor-application'"), 'Missing POST /api/admin/reject-doctor-application');

  // RBAC checks
  assert.ok(serverJsContent.includes('requireAdmin'), 'Admin routes must enforce requireAdmin');

  console.log('  ✓ Verified GET /api/admin/metrics, doctor approval/rejection endpoints, and requireAdmin RBAC.');
})();

// ── TEST 6: Full i18n Key Parity for Admin Namespace ────────────────────────
console.log('\n▶ TEST 6: Full i18n Key Parity for Admin Namespace');
(() => {
  const i18nModule = require('../app/i18n.js');
  const arAdmin = i18nModule.translations.ar.admin;
  const enAdmin = i18nModule.translations.en.admin;

  assert.ok(arAdmin, 'translations.ar.admin is missing');
  assert.ok(enAdmin, 'translations.en.admin is missing');

  const requiredAdminKeys = [
    'tabStats',
    'tabDoctorVerification',
    'tabAiMetrics',
    'statsTitle',
    'statsSubtitle',
    'totalUsers',
    'totalDoctors',
    'totalBranches',
    'totalCases',
    'pendingReviews',
    'doctorVerificationTitle',
    'doctorVerificationSubtitle',
    'searchDoctorApps',
    'filterPending',
    'filterApproved',
    'filterRejected',
    'filterAll',
    'approveDoctorBtn',
    'rejectDoctorBtn',
    'addDoctorToQueue',
    'aiQualityTitle',
    'aiQualitySubtitle',
    'aiSensitivity',
    'aiSpecificity',
    'aiPrecision',
    'aiAuc',
    'aiConcordance',
    'aiLatency',
    'aiGuardrails',
    'aiModelComparison',
    'refreshMetrics'
  ];

  for (const key of requiredAdminKeys) {
    assert.ok(arAdmin[key], `Missing Arabic key: admin.${key}`);
    assert.ok(enAdmin[key], `Missing English key: admin.${key}`);
    assert.strictEqual(typeof arAdmin[key], 'string', `admin.${key} (ar) must be a string`);
    assert.strictEqual(typeof enAdmin[key], 'string', `admin.${key} (en) must be a string`);
    assert.ok(arAdmin[key].trim().length > 0, `admin.${key} (ar) must not be empty`);
    assert.ok(enAdmin[key].trim().length > 0, `admin.${key} (en) must not be empty`);
  }

  // Cross-check 100% mutual parity
  const arAllKeys = Object.keys(arAdmin);
  const enAllKeys = Object.keys(enAdmin);
  assert.strictEqual(arAllKeys.length, enAllKeys.length, 'Key counts between ar.admin and en.admin must match');
  for (const k of arAllKeys) {
    assert.ok(enAdmin[k], `Key '${k}' in ar.admin missing from en.admin`);
  }

  console.log(`  ✓ Verified all ${arAllKeys.length} admin workspace translation keys with 100% mutual parity.`);
})();

// ── TEST 7: CSS Styles Verification ─────────────────────────────────────────
console.log('\n▶ TEST 7: CSS Styles Verification');
(() => {
  assert.ok(cssContent.includes('.admin-workspace-tabs'), 'Missing .admin-workspace-tabs style');
  assert.ok(cssContent.includes('.admin-workspace-tab'), 'Missing .admin-workspace-tab style');
  assert.ok(cssContent.includes('.admin-ai-grid'), 'Missing .admin-ai-grid style');
  assert.ok(cssContent.includes('.admin-ai-metric-card'), 'Missing .admin-ai-metric-card style');
  assert.ok(cssContent.includes('.admin-benchmark-matrix'), 'Missing .admin-benchmark-matrix style');

  console.log('  ✓ Verified CSS styles for tabs, AI cards, and benchmark matrix.');
})();

console.log('\n================================================================================');
console.log('🎉 ALL ADMIN WORKSPACE & GOVERNANCE TESTS PASSED! (7/7)');
console.log('================================================================================');
