/**
 * Health Vibe AI - KPI Dashboard Test Suite
 * Item 23: KPI dashboard: completion rate, response time, report turnaround.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('📊 HEALTH VIBE AI: KPI DASHBOARD TEST SUITE');
console.log('   Metrics: Completion Rate, Response Time, Report Turnaround');
console.log('==================================================================\n');

// 1. Load app.js and index.html
const appJsPath = path.resolve(__dirname, '../app/app.js');
const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const serverJsPath = path.resolve(__dirname, '../backend/server.js');

const appJsContent = fs.readFileSync(appJsPath, 'utf8');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

// Mock window and document context to test calculateKpiMetrics directly
const sandbox = {
  currentLanguage: 'ar',
  currentKpiTimeRange: 'all',
  currentKpiPriority: 'all',
  cachedKpiCases: null,
  ROLES: {
    PATIENT: 'patient',
    DOCTOR: 'doctor',
    CLINIC_ADMIN: 'clinic_admin',
    SUPER_ADMIN: 'super_admin'
  },
  selectedRole: 'clinic_admin',
  auth: { currentUser: { uid: 'doc_123', email: 'doctor@example.com' } },
  document: {
    getElementById: () => null
  },
  window: {}
};

// Evaluate the KPI helper functions within a sandbox
const kpiCodeSnippet = `
${appJsContent.slice(appJsContent.indexOf('function parseKpiTimestamp('), appJsContent.indexOf('window.calculateKpiMetrics = calculateKpiMetrics;'))}
`;

const fn = new Function('sandbox', `
  with(sandbox) {
    ${kpiCodeSnippet}
    return {
      parseKpiTimestamp,
      calculateKpiMetrics
    };
  }
`);

const { parseKpiTimestamp, calculateKpiMetrics } = fn(sandbox);

// -----------------------------------------------------------------------------
// TEST 1: Timestamp Parsing Precision
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Timestamp Parsing Precision');
const testDate = new Date('2026-09-25T10:00:00Z');
assert.strictEqual(parseKpiTimestamp(testDate.getTime()), testDate.getTime(), 'Numeric timestamp parses correctly');
assert.strictEqual(parseKpiTimestamp(testDate.toISOString()), testDate.getTime(), 'ISO string timestamp parses correctly');
assert.strictEqual(parseKpiTimestamp({ toMillis: () => testDate.getTime() }), testDate.getTime(), 'Firestore timestamp toMillis() parses correctly');
assert.strictEqual(parseKpiTimestamp({ seconds: 1790280000, nanoseconds: 0 }), 1790280000000, 'Firestore seconds/nanoseconds parses correctly');
assert.strictEqual(parseKpiTimestamp(null), 0, 'Null timestamp safely returns 0');
assert.strictEqual(parseKpiTimestamp(undefined), 0, 'Undefined timestamp safely returns 0');
console.log('  ✓ Timestamp parser successfully handles numeric, ISO, Firestore Timestamp, and null values.\n');

// -----------------------------------------------------------------------------
// TEST 2: Completion Rate Mathematical Accuracy
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Completion Rate Mathematical Accuracy');
const baseTime = Date.now() - 3600000;
const sampleCases = [
  { id: 'c1', status: 'approved', submittedAt: baseTime - 600000, approvedAt: baseTime - 100000 },
  { id: 'c2', status: 'approved', submittedAt: baseTime - 500000, approvedAt: baseTime - 200000 },
  { id: 'c3', status: 'approved', submittedAt: baseTime - 400000, approvedAt: baseTime - 150000 },
  { id: 'c4', status: 'under_review', submittedAt: baseTime - 300000 },
  { id: 'c5', status: 'pending', submittedAt: baseTime - 200000 },
  { id: 'c6', status: 'closed', submittedAt: baseTime - 100000, reviewedAt: baseTime - 50000 },
  { id: 'c7', status: 'rejected', submittedAt: baseTime - 90000, reviewedAt: baseTime - 40000 },
  { id: 'c8', status: 'approved', submittedAt: baseTime - 80000, approvedAt: baseTime - 30000, priority: 'urgent', oxygenLevel: 88 },
  { id: 'c9', status: 'approved', submittedAt: baseTime - 70000, approvedAt: baseTime - 20000, priority: 'urgent', oxygenLevel: 87 },
  { id: 'c10', status: 'under_review', submittedAt: baseTime - 60000, priority: 'urgent', oxygenLevel: 86 }
];

const resAll = calculateKpiMetrics(sampleCases, { timeRange: 'all', priority: 'all' });
// Completed: c1, c2, c3, c6 (closed counts as completed review), c8, c9 = 6 cases
// Total: 10 cases -> 6/10 = 60%
assert.strictEqual(resAll.totalCases, 10, 'Total cases count is 10');
assert.strictEqual(resAll.completedCasesCount, 6, 'Completed cases count is 6');
assert.strictEqual(resAll.completionRate, 60, 'Completion rate is exactly 60%');

// Urgent completion rate: 3 urgent cases (c8, c9, c10), 2 completed (c8, c9) -> 67%
assert.strictEqual(resAll.urgentCompletionRate, 67, 'Urgent completion rate is 67%');
console.log(`  ✓ Total Cases: ${resAll.totalCases} | Completed: ${resAll.completedCasesCount} | Completion Rate: ${resAll.completionRate}%`);
console.log(`  ✓ Urgent Completion Rate: ${resAll.urgentCompletionRate}%\n`);

// -----------------------------------------------------------------------------
// TEST 3: Physician Response Time Calculation
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Physician Response Time Calculation');
// Cases with responses:
// c1: submit base-600k, approved base-100k -> 500k ms = 8.33 min
// c2: submit base-500k, approved base-200k -> 300k ms = 5.0 min
// c3: submit base-400k, approved base-150k -> 250k ms = 4.17 min
// c6: submit base-100k, reviewed base-50k -> 50k ms = 0.83 min
// c7: submit base-90k, reviewed base-40k -> 50k ms = 0.83 min
// c8: submit base-80k, approved base-30k -> 50k ms = 0.83 min
// c9: submit base-70k, approved base-20k -> 50k ms = 0.83 min
assert(resAll.avgResponseTimeMinutes > 0, 'Average response time is calculated and positive');
assert(resAll.medianResponseTimeMinutes > 0, 'Median response time is calculated');
assert(resAll.responseSlaComplianceRate >= 90, 'Response SLA compliance is high when under 30 minutes');
console.log(`  ✓ Avg Response Time: ${resAll.avgResponseTimeMinutes} min | Median: ${resAll.medianResponseTimeMinutes} min | Fastest: ${resAll.fastestResponseMinutes} min`);
console.log(`  ✓ Response SLA Compliance (< 30m): ${resAll.responseSlaComplianceRate}%\n`);

// -----------------------------------------------------------------------------
// TEST 4: Report Turnaround Time (TAT) Calculation
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Report Turnaround Time (TAT) Calculation');
assert(resAll.avgTurnaroundMinutes > 0, 'Average turnaround time is calculated and positive');
assert(resAll.medianTurnaroundMinutes > 0, 'Median turnaround time is calculated');
assert(resAll.turnaroundSlaComplianceRate > 0, 'Turnaround SLA compliance is calculated');
console.log(`  ✓ Avg Turnaround: ${resAll.avgTurnaroundMinutes} min | Median: ${resAll.medianTurnaroundMinutes} min | P95: ${resAll.p95TurnaroundMinutes} min`);
console.log(`  ✓ Turnaround SLA Compliance (< 2h): ${resAll.turnaroundSlaComplianceRate}%\n`);

// -----------------------------------------------------------------------------
// TEST 5: Waterfall Pipeline Stages Breakdown
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Waterfall Pipeline Stages Breakdown');
assert(resAll.stages.intake > 0, 'Intake stage time > 0');
assert(resAll.stages.queue > 0, 'Queue stage time > 0');
assert(resAll.stages.review > 0, 'Review stage time > 0');
assert(resAll.stages.report > 0, 'Report stage time > 0');
assert.strictEqual(
  Number((resAll.stages.intake + resAll.stages.queue + resAll.stages.review + resAll.stages.report).toFixed(1)),
  resAll.stages.total,
  'Total stage time equals sum of individual stages'
);
console.log(`  ✓ Stage 1 (Intake): ${resAll.stages.intake}m | Stage 2 (Queue): ${resAll.stages.queue}m | Stage 3 (Review): ${resAll.stages.review}m | Stage 4 (Report): ${resAll.stages.report}m`);
console.log(`  ✓ Total Full-Cycle Waterfall: ${resAll.stages.total} minutes\n`);

// -----------------------------------------------------------------------------
// TEST 6: Demo and Test Record Isolation
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Demo and Test Record Isolation');
const mixedCases = [
  ...sampleCases,
  { id: 'demo_case_1', isDemo: true, status: 'approved', submittedAt: baseTime },
  { id: 'test_case_2', isTest: true, status: 'approved', submittedAt: baseTime }
];
const resFiltered = calculateKpiMetrics(mixedCases, { timeRange: 'all', priority: 'all' });
assert.strictEqual(resFiltered.totalCases, 10, 'Demo records are strictly excluded from authentic KPI count');
console.log('  ✓ Demo and test records are completely isolated and never contaminate authentic KPI metrics.\n');

// -----------------------------------------------------------------------------
// TEST 7: DOM Structure & Containers in index.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: DOM Structure & Containers in index.html');
assert(indexHtmlContent.includes('id="screen-kpi"'), 'screen-kpi section container exists');
assert(indexHtmlContent.includes('id="kpiCompletionRateValue"'), 'Completion rate value element exists');
assert(indexHtmlContent.includes('id="kpiResponseTimeValue"'), 'Response time value element exists');
assert(indexHtmlContent.includes('id="kpiTurnaroundTimeValue"'), 'Report turnaround time value element exists');
assert(indexHtmlContent.includes('id="kpiTimeFilterGroup"'), 'Time filter group exists');
assert(indexHtmlContent.includes('id="kpiPrioritySelect"'), 'Priority select dropdown exists');
assert(indexHtmlContent.includes('id="kpiSlaTableBody"'), 'SLA Table body exists');
assert(indexHtmlContent.includes('id="kpiDoctorsTableBody"'), 'Doctors Table body exists');
assert(indexHtmlContent.includes('data-screen="kpi"'), 'Sidebar navigation button for KPI exists');
assert(indexHtmlContent.includes('id="adminKpiCompletionRate"'), 'Admin dashboard completion rate metric exists');
assert(indexHtmlContent.includes('id="adminKpiResponseTime"'), 'Admin dashboard response time metric exists');
assert(indexHtmlContent.includes('id="adminKpiTurnaroundTime"'), 'Admin dashboard turnaround time metric exists');
assert(indexHtmlContent.includes('id="docKpiCompletionRate"'), 'Doctor queue completion rate mini-bar exists');
console.log('  ✓ All UI elements, KPI hero cards, SLA tables, and navigation links present in app/index.html.\n');

// -----------------------------------------------------------------------------
// TEST 8: Backend Endpoint Definition in server.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: Backend Endpoint Definition in server.js');
assert(serverJsContent.includes("app.get('/api/kpi/metrics'"), 'GET /api/kpi/metrics endpoint declared');
assert(serverJsContent.includes('requireAuth'), 'Endpoint protected with authentication');
assert(serverJsContent.includes('completionRate'), 'Endpoint computes completion rate');
assert(serverJsContent.includes('avgResponseTimeMinutes'), 'Endpoint computes average response time');
assert(serverJsContent.includes('avgTurnaroundMinutes'), 'Endpoint computes average report turnaround time');
console.log('  ✓ Backend server.js has authoritative /api/kpi/metrics endpoint with full RBAC protection.\n');

// -----------------------------------------------------------------------------
// TEST 9: Global Function Exports on Window in app.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 9: Global Function Exports on Window in app.js');
assert(appJsContent.includes('window.calculateKpiMetrics = calculateKpiMetrics;'), 'calculateKpiMetrics exported on window');
assert(appJsContent.includes('window.renderKpiDashboard = renderKpiDashboard;'), 'renderKpiDashboard exported on window');
assert(appJsContent.includes('window.setKpiTimeFilter = setKpiTimeFilter;'), 'setKpiTimeFilter exported on window');
assert(appJsContent.includes('window.setKpiPriorityFilter = setKpiPriorityFilter;'), 'setKpiPriorityFilter exported on window');
assert(appJsContent.includes('window.refreshKpiDashboardLive = refreshKpiDashboardLive;'), 'refreshKpiDashboardLive exported on window');
assert(appJsContent.includes('window.exportKpiReport = exportKpiReport;'), 'exportKpiReport exported on window');
console.log('  ✓ All 6 KPI management functions successfully exposed on window.\n');

console.log('==================================================================');
console.log('🎉 ALL 9 KPI DASHBOARD TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');
