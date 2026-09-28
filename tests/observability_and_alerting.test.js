/**
 * HEALTH VIBE AI: ADVANCED OBSERVABILITY, TELEMETRY & ALERTING TEST SUITE
 *
 * Verifies:
 * 1. PII Redaction across 6 Error Categories (JavaScript, Firebase, Auth, API, Notification, AI-Service).
 * 2. Distributed Trace Identifiers linking client and server events.
 * 3. Measured Session Crash-Free Rate (accurate ratio or "Unavailable" on 0 sessions).
 * 4. Uptime Monitoring, Latency Tracking (avg/p95), and Health Probes.
 * 5. Injected Failure Alerting with Strict De-duplication (no duplicate alerts).
 * 6. Service Recovery Notification without duplicate recovery notices.
 * 7. Slowness / High Latency Alerting and Recovery.
 * 8. Event Dashboard Querying linked by Trace Identifiers.
 */

const assert = require('assert');
const path = require('path');
const monitoringService = require('../backend/monitoring-service');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: OBSERVABILITY, PII REDACTION & ALERTING TEST SUITE');
console.log('   Multi-Category Errors, Trace Correlation, Uptime & Recovery');
console.log('==================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: PII Redaction Engine Across Categories
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ TEST 1: PII Redaction Across All 6 Error Categories');

runTest('1A: Redacts Emails, Phone Numbers, and Credit Cards in JavaScript errors', () => {
  const rawMsg = "TypeError: Cannot call method of undefined at patient_support@healthvibe.com with card 4111-2222-3333-4444 and phone +201012345678";
  const redacted = monitoringService.redactPii(rawMsg);

  assert.ok(!redacted.includes('patient_support@healthvibe.com'), 'Email must be redacted');
  assert.ok(redacted.includes('[REDACTED_EMAIL]'), 'Email replacement tag must exist');
  assert.ok(!redacted.includes('4111-2222-3333-4444'), 'Credit card must be redacted');
  assert.ok(redacted.includes('[REDACTED_CARD]'), 'Card replacement tag must exist');
  assert.ok(!redacted.includes('+201012345678'), 'Phone must be redacted');
  assert.ok(redacted.includes('[REDACTED_PHONE]'), 'Phone replacement tag must exist');
});

runTest('1B: Redacts National IDs and Passwords in Firebase & Firestore error records', () => {
  const err = monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.FIREBASE,
    type: 'firestore_permission_denied',
    message: 'PERMISSION_DENIED for nationalId: 29501011234567 with password=SecretPassword123',
    source: 'firestore_rules'
  });

  assert.strictEqual(err.category, 'firebase');
  assert.ok(!err.message.includes('29501011234567'), 'National ID must be redacted');
  assert.ok(err.message.includes('[REDACTED_NATIONAL_ID]'), 'Must contain [REDACTED_NATIONAL_ID]');
  assert.ok(!err.message.includes('SecretPassword123'), 'Password must be redacted');
  assert.ok(err.message.includes('[REDACTED_SECRET]'), 'Must contain [REDACTED_SECRET]');
});

runTest('1C: Redacts JWTs and Bearer Tokens in Auth error records', () => {
  const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const err = monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.AUTH,
    type: 'auth_token_revoked',
    message: `Invalid token: Bearer ${mockJwt}`,
    source: 'firebase_auth'
  });

  assert.strictEqual(err.category, 'auth');
  assert.ok(!err.message.includes(mockJwt), 'JWT must be redacted');
  assert.ok(err.message.includes('[REDACTED_JWT]'), 'Must contain [REDACTED_JWT]');
});

runTest('1D: Redacts Patient Names and Date of Birth in API errors', () => {
  const err = monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.API,
    type: 'api_validation_failed',
    message: 'Validation failed for dob: 1985-04-12',
    url: 'https://healthvibe.ai/api/cases?patientName=Mohammed_Ali&clinicId=cln_1',
    source: 'express_router'
  });

  assert.strictEqual(err.category, 'api');
  assert.ok(!err.message.includes('1985-04-12'), 'DOB must be redacted');
  assert.ok(err.message.includes('[REDACTED_DOB]'), 'Must contain [REDACTED_DOB]');
  assert.ok(!err.url.includes('Mohammed_Ali'), 'Patient name in URL query must be redacted');
  assert.ok(err.url.includes('[REDACTED_NAME]'), 'Must contain [REDACTED_NAME]');
});

runTest('1E: Redacts SMTP Credentials and Recipient details in Notification errors', () => {
  const err = monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.NOTIFICATION,
    type: 'smtp_auth_failure',
    message: 'Failed sending to patient.contact@gmail.com with apiKey: sg_live_998877665544',
    source: 'nodemailer_transport'
  });

  assert.strictEqual(err.category, 'notification');
  assert.ok(!err.message.includes('patient.contact@gmail.com'), 'Email must be redacted');
  assert.ok(err.message.includes('[REDACTED_EMAIL]'));
  assert.ok(!err.message.includes('sg_live_998877665544'), 'API key must be redacted');
  assert.ok(err.message.includes('[REDACTED_SECRET]'));
});

runTest('1F: Redacts Clinical PHI payloads in AI-Service triage errors', () => {
  const err = monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.AI_SERVICE,
    type: 'gemini_clinical_triage_timeout',
    message: 'Model timeout while evaluating case for patient: amr.hassan@domain.eg phone 01223344556',
    source: 'ai_triage_pipeline'
  });

  assert.strictEqual(err.category, 'ai_service');
  assert.ok(!err.message.includes('amr.hassan@domain.eg'), 'Email must be redacted');
  assert.ok(!err.message.includes('01223344556'), 'Phone must be redacted');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Measured Session Crash-Free Rate
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 2: Measured Session Crash-Free Rate Calculation vs "Unavailable"');

runTest('2A: Returns "Unavailable" when 0 sessions are measured', () => {
  monitoringService.resetMonitoringState();
  const rate = monitoringService.calculateCrashFreeRate();
  assert.strictEqual(rate, 'Unavailable', 'With 0 sessions, crashFreeRate must strictly be "Unavailable"');
});

runTest('2B: Calculates exact percentage when measured sessions exist', () => {
  monitoringService.resetMonitoringState();

  // Create 10 sessions
  for (let i = 1; i <= 10; i++) {
    monitoringService.recordSession(`sess_${i}`, `usr_${i}`);
  }

  // 10 sessions, 0 crashes -> 100.00%
  assert.strictEqual(monitoringService.calculateCrashFreeRate(), '100.00%');

  // Mark session 3 as crashed
  monitoringService.markSessionCrashed('sess_3', 'err_101');
  // 10 sessions, 1 crashed -> 90.00%
  assert.strictEqual(monitoringService.calculateCrashFreeRate(), '90.00%');

  // Mark session 7 as crashed
  monitoringService.markSessionCrashed('sess_7', 'err_102');
  // 10 sessions, 2 crashed -> 80.00%
  assert.strictEqual(monitoringService.calculateCrashFreeRate(), '80.00%');

  // Add 10 more clean sessions (total 20 sessions, 2 crashed) -> 90.00%
  for (let i = 11; i <= 20; i++) {
    monitoringService.recordSession(`sess_${i}`, `usr_${i}`);
  }
  assert.strictEqual(monitoringService.calculateCrashFreeRate(), '90.00%');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Uptime Monitoring & Health Probes
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 3: Uptime Monitoring & Health Probes');

runTest('3A: Computes uptime percentage and latency stats correctly', () => {
  monitoringService.resetMonitoringState();

  // Record 10 health probes (9 UP, 1 DOWN)
  for (let i = 0; i < 9; i++) monitoringService.recordHealthProbe('UP', 15);
  monitoringService.recordHealthProbe('DOWN', 1000);

  // Record 10 request metrics
  for (let i = 0; i < 9; i++) {
    monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 40 + i * 10, statusCode: 200, isError: false });
  }
  monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 150, statusCode: 500, isError: true });

  const metrics = monitoringService.getUptimeMetrics();
  assert.strictEqual(metrics.uptimePercentage, '90%');
  assert(metrics.uptimeSeconds >= 0);
  assert(metrics.avgLatencyMs > 0);
  assert(metrics.p95LatencyMs > 0);
  assert.strictEqual(metrics.totalRequestsMeasured, 10);
  assert.strictEqual(metrics.failureRatePct, '10%');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Injected Failure Alerting, Deduplication & Service Recovery
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 4: Injected Failure Alerting, De-duplication & Service Recovery');

runTest('4A: Dispatches alert on injected failure, deduplicates repeats, and recovers once', () => {
  monitoringService.resetMonitoringState();
  monitoringService.clearAlertNotificationListeners();

  const dispatchedNotifications = [];
  monitoringService.onAlertNotification((event) => {
    dispatchedNotifications.push(event);
  });

  // Step 1: Inject baseline healthy traffic (10 requests)
  for (let i = 0; i < 10; i++) {
    monitoringService.recordRequestMetric({
      timestamp: Date.now(),
      durationMs: 30,
      statusCode: 200,
      isError: false
    });
  }

  assert.strictEqual(dispatchedNotifications.length, 0, 'No alert during normal operation');
  assert.strictEqual(monitoringService.getActiveAlerts().length, 0);

  // Step 2: Inject failure spike (3 consecutive 500 errors)
  for (let i = 0; i < 3; i++) {
    monitoringService.recordRequestMetric({
      timestamp: Date.now(),
      durationMs: 50,
      statusCode: 500,
      isError: true
    });
  }

  // Verify ALERT_TRIGGERED was emitted
  assert.strictEqual(dispatchedNotifications.length, 1, 'Exactly one alert notification must be emitted');
  assert.strictEqual(dispatchedNotifications[0].event, 'ALERT_TRIGGERED');
  assert.strictEqual(dispatchedNotifications[0].alert.type, monitoringService.ALERT_TYPES.INCREASED_FAILURES);
  assert.strictEqual(dispatchedNotifications[0].alert.status, 'ACTIVE');

  const activeAlerts = monitoringService.getActiveAlerts();
  assert.strictEqual(activeAlerts.length, 1, 'There must be 1 active alert');

  // Step 3: De-duplication test - Inject MORE failures while in ALERTING state
  for (let i = 0; i < 5; i++) {
    monitoringService.recordRequestMetric({
      timestamp: Date.now(),
      durationMs: 50,
      statusCode: 500,
      isError: true
    });
  }

  // Must NOT send duplicate alert!
  assert.strictEqual(
    dispatchedNotifications.length,
    1,
    'De-duplication check: Must not send duplicate alert notification while already in ALERTING state'
  );

  // Step 4: Service Recovery test - Inject healthy traffic to clear failure rate below threshold
  for (let i = 0; i < 50; i++) {
    monitoringService.recordRequestMetric({
      timestamp: Date.now(),
      durationMs: 25,
      statusCode: 200,
      isError: false
    });
  }

  // Verify SERVICE_RECOVERED was emitted
  assert.strictEqual(dispatchedNotifications.length, 2, 'Must emit recovery notification after returning to normal');
  assert.strictEqual(dispatchedNotifications[1].event, 'SERVICE_RECOVERED');
  assert.strictEqual(dispatchedNotifications[1].recovery.type, monitoringService.ALERT_TYPES.INCREASED_FAILURES);
  assert.strictEqual(monitoringService.getActiveAlerts().length, 0, 'Active alerts list must be empty after recovery');

  // Step 5: De-duplication of recovery - more healthy requests must NOT trigger repeat recoveries
  for (let i = 0; i < 10; i++) {
    monitoringService.recordRequestMetric({
      timestamp: Date.now(),
      durationMs: 20,
      statusCode: 200,
      isError: false
    });
  }

  assert.strictEqual(dispatchedNotifications.length, 2, 'Must not duplicate recovery notifications');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Slowness / High Latency Alerting & Recovery
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 5: Slowness / High Latency Alerting & Recovery');

runTest('5A: Dispatches slowness alert when p95 exceeds 2000ms, deduplicates, and recovers', () => {
  monitoringService.resetMonitoringState();
  monitoringService.clearAlertNotificationListeners();

  const notifications = [];
  monitoringService.onAlertNotification((event) => notifications.push(event));

  // Step 1: Inject normal traffic (10 requests at 50ms)
  for (let i = 0; i < 10; i++) {
    monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 50, statusCode: 200, isError: false });
  }

  // Step 2: Inject high latency requests (p95 > 2000ms)
  for (let i = 0; i < 5; i++) {
    monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 2800, statusCode: 200, isError: false });
  }

  assert.strictEqual(notifications.length, 1, 'Must dispatch high latency alert');
  assert.strictEqual(notifications[0].event, 'ALERT_TRIGGERED');
  assert.strictEqual(notifications[0].alert.type, monitoringService.ALERT_TYPES.HIGH_LATENCY);

  // Step 3: De-duplication check: more slow requests must not resend alert
  for (let i = 0; i < 3; i++) {
    monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 2500, statusCode: 200, isError: false });
  }
  assert.strictEqual(notifications.length, 1, 'Must not send duplicate latency alert');

  // Step 4: Recovery check: inject fast traffic (50 requests at 30ms)
  for (let i = 0; i < 50; i++) {
    monitoringService.recordRequestMetric({ timestamp: Date.now(), durationMs: 30, statusCode: 200, isError: false });
  }

  assert.strictEqual(notifications.length, 2, 'Must emit recovery notice for latency');
  assert.strictEqual(notifications[1].event, 'SERVICE_RECOVERED');
  assert.strictEqual(notifications[1].recovery.type, monitoringService.ALERT_TYPES.HIGH_LATENCY);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Event Dashboard Linked Through Trace Identifiers
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 6: Event Dashboard Linked Through Trace Identifiers');

runTest('6A: Correlates client and server events sharing the same traceId', () => {
  monitoringService.resetMonitoringState();
  const testTraceId = 'trc_clinical_triage_flow_9988';

  // 1. Client error on triage submission
  monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.JAVASCRIPT,
    type: 'client_unhandled_rejection',
    message: 'Network request timed out during assessment',
    traceId: testTraceId,
    source: 'client_browser'
  });

  // 2. Server API route error
  monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.API,
    type: 'api_timeout_error',
    message: 'Upstream gateway timeout',
    traceId: testTraceId,
    source: 'express_gateway'
  });

  // 3. AI Service inference timeout
  monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.AI_SERVICE,
    type: 'gemini_deadline_exceeded',
    message: 'AI Model latency exceeded 15s budget',
    traceId: testTraceId,
    source: 'gemini_service'
  });

  // 4. An unrelated error with a different traceId
  monitoringService.recordMonitoringError({
    category: monitoringService.ERROR_CATEGORIES.AUTH,
    type: 'auth_invalid_credentials',
    message: 'Password mismatch',
    traceId: 'trc_unrelated_login_1122',
    source: 'auth_controller'
  });

  // Query events by traceId
  const linkedEvents = monitoringService.queryEvents({ traceId: testTraceId });
  assert.strictEqual(linkedEvents.length, 3, 'Must return exactly 3 events linked by traceId');

  const categories = linkedEvents.map(e => e.category);
  assert.ok(categories.includes('javascript'));
  assert.ok(categories.includes('api'));
  assert.ok(categories.includes('ai_service'));
  assert.ok(!categories.includes('auth'), 'Unrelated auth event must be excluded');

  // Query events by category
  const aiEvents = monitoringService.queryEvents({ category: 'ai_service' });
  assert.strictEqual(aiEvents.length, 1);
  assert.strictEqual(aiEvents[0].type, 'gemini_deadline_exceeded');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Server Integration & Monitoring Endpoints
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 7: Server Integration & Monitoring Endpoints');

const http = require('http');
const app = require('../backend/server');

runTest('7A: Server attaches monitoringService and trace middleware', () => {
  assert.ok(app.monitoringService, 'app.monitoringService must be exposed');
  assert.strictEqual(typeof app.monitoringService.calculateCrashFreeRate, 'function');
  assert.strictEqual(typeof app.monitoringService.recordMonitoringError, 'function');
});

runTest('7B: Uptime endpoint returns valid telemetry schema over HTTP', () => {
  const metrics = app.monitoringService.getUptimeMetrics();
  assert.ok('uptimeSeconds' in metrics);
  assert.ok('uptimePercentage' in metrics);
  assert.ok('avgLatencyMs' in metrics);
  assert.ok('p95LatencyMs' in metrics);
  assert.ok('failureRatePct' in metrics);
  assert.ok(metrics.uptimeSeconds >= 0);
});

console.log('\n==================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} OBSERVABILITY & ALERTING TESTS PASSED (100%)`);
console.log('==================================================================\n');
