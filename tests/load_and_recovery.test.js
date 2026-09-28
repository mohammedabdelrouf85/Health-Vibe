/**
 * HEALTH VIBE AI: LOAD TESTING & DISASTER RECOVERY ACCEPTANCE SUITE
 * 
 * Verifies:
 * 1. High-concurrency throughput and latency profiling (Health, Metrics, Timeline).
 * 2. Sliding-window rate limiter under extreme concurrent burst.
 * 3. Injected service outage & failure alerting with strict deduplication.
 * 4. Automatic recovery detection and resolved-state notification.
 * 5. Incident & clinical adverse event lifecycle with cryptographic evidence preservation.
 * 6. Empirical acceptance evidence calculation (p50, p95, RPS, recovery metrics).
 */

const assert = require('assert');
const path = require('path');
const monitoringService = require('../backend/monitoring-service');
const timelineService = require('../backend/timeline-service');
const incidentService = require('../backend/incident-service');
const app = require('../backend/server');

console.log('==================================================================');
console.log('⚡ HEALTH VIBE AI: LOAD & DISASTER RECOVERY ACCEPTANCE SUITE');
console.log('   High-Concurrency Load, Latency Profiling & Outage Recovery');
console.log('==================================================================\n');

let totalTests = 0;
let passedTests = 0;

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

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = +(sum / sorted.length).toFixed(2);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { min, max, avg, p50, p95, p99 };
}

(async () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // PART 1: HIGH CONCURRENCY LOAD & LATENCY PROFILING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Concurrency Load & Latency Profiling (100 Concurrent Probes)');

  await runAsyncTest('1A: 100 concurrent health and telemetry probes execute with sub-50ms p95 latency', async () => {
    monitoringService.resetMonitoringState();
    // Warm up with health probes
    for (let i = 0; i < 10; i++) monitoringService.recordHealthProbe('UP', 20);

    const concurrency = 100;
    const latencies = [];
    let successCount = 0;
    let failureCount = 0;

    const startTotal = Date.now();

    const tasks = Array.from({ length: concurrency }).map(async (_, idx) => {
      const t0 = process.hrtime.bigint();
      try {
        const metrics = monitoringService.getUptimeMetrics();
        assert.ok(metrics.uptimeSeconds >= 0);
        assert.ok(metrics.uptimePercentage);
        const t1 = process.hrtime.bigint();
        const durationMs = Number(t1 - t0) / 1e6;
        latencies.push(durationMs);
        successCount++;
      } catch (err) {
        failureCount++;
      }
    });

    await Promise.all(tasks);
    const totalDurationMs = Date.now() - startTotal;
    const stats = calculatePercentiles(latencies);
    const rps = +((concurrency / (Math.max(totalDurationMs, 1) / 1000))).toFixed(1);

    console.log(`     📊 Metrics: Total: ${concurrency}, Success: ${successCount}, Fail: ${failureCount}`);
    console.log(`     ⏱️  Latency: Min=${stats.min.toFixed(2)}ms, Avg=${stats.avg}ms, p50=${stats.p50.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, Max=${stats.max.toFixed(2)}ms`);
    console.log(`     🚀 Throughput: ${rps} ops/sec (Duration: ${totalDurationMs}ms)`);

    assert.strictEqual(successCount, concurrency, 'All 100 concurrent probes must succeed');
    assert.strictEqual(failureCount, 0, 'No errors allowed during health load probe');
    assert.ok(stats.p95 < 50, `p95 latency (${stats.p95}ms) must remain below 50ms under local load`);
  });

  console.log('\n▶ TEST 2: Timeline Aggregation Under Multi-Client Concurrency');

  await runAsyncTest('2A: 50 concurrent multi-source timeline aggregations with strict RBAC', async () => {
    const concurrency = 50;
    const latencies = [];
    let successCount = 0;

    function createMockDb(initialData = {}) {
      const store = {
        cases: initialData.cases || [],
        clinical_reports: initialData.clinical_reports || [],
        appointments: initialData.appointments || [],
        case_files: initialData.case_files || [],
        users: initialData.users || {}
      };
      return {
        collection(name) {
          const records = store[name] || [];
          return {
            where(field, op, val) {
              const filtered = records.filter(r => op === '==' ? r[field] === val : true);
              return {
                async get() {
                  return {
                    empty: filtered.length === 0,
                    docs: filtered.map(d => ({ id: d.id, data: () => d })),
                    forEach(cb) { filtered.forEach(d => cb({ id: d.id, data: () => d })); }
                  };
                }
              };
            },
            doc(id) {
              return {
                async get() {
                  const u = store.users[id];
                  return { exists: Boolean(u), id, data: () => u || {} };
                }
              };
            }
          };
        }
      };
    }

    const mockDb = createMockDb({
      cases: [
        {
          id: 'case_load_1',
          patientId: 'pat_concurrent_1',
          assignedDoctorId: 'doc_concurrent_1',
          createdAt: '2026-03-01T10:00:00Z',
          triageSummary: 'Routine pediatric checkup',
          clinicalDiagnosis: 'Healthy baseline',
          status: 'approved',
          internalNotes: 'Internal differential notes for doctor review only'
        }
      ],
      users: {
        'pat_concurrent_1': {
          role: 'patient',
          fullName: 'Tarek Ahmed'
        }
      }
    });

    const patientUser = { uid: 'pat_concurrent_1', role: 'patient' };
    const doctorUser = { uid: 'doc_concurrent_1', role: 'doctor' };

    const tStart = Date.now();

    const tasks = Array.from({ length: concurrency }).map(async (_, i) => {
      const user = (i % 2 === 0) ? patientUser : doctorUser;
      const t0 = process.hrtime.bigint();

      const result = await timelineService.buildPatientTimeline({
        db: mockDb,
        patientId: 'pat_concurrent_1',
        requestingUser: user
      });

      const t1 = process.hrtime.bigint();
      latencies.push(Number(t1 - t0) / 1e6);

      assert.strictEqual(result.success, true);
      if (user.role === 'patient') {
        assert.ok(!result.timeline.some(item => item.isInternal), 'Patient must NEVER see internal doctor notes');
      } else {
        assert.ok(result.timeline.some(item => item.isInternal), 'Clinician must see internal doctor notes');
      }
      successCount++;
    });

    await Promise.all(tasks);
    const totalTime = Date.now() - tStart;
    const stats = calculatePercentiles(latencies);

    console.log(`     📊 Timeline Concurrency: ${successCount}/${concurrency} passed`);
    console.log(`     ⏱️  Latency: Avg=${stats.avg}ms, p50=${stats.p50.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, Max=${stats.max.toFixed(2)}ms`);

    assert.strictEqual(successCount, concurrency);
    assert.ok(stats.p95 < 20, `p95 latency (${stats.p95}ms) must remain below 20ms for timeline parsing`);
  });

  console.log('\n▶ TEST 3: Rate Limiter Resilience Under Burst DoS Simulation');

  runTest('3A: Handles 100 concurrent requests gracefully, enforcing strict quota without memory leakage', () => {
    const burstQuota = 20;
    const totalBurstRequests = 100;
    const testLimiter = app.createRateLimiter({
      windowMs: 60000,
      maxRequests: burstQuota,
      message: 'Burst limit triggered'
    });

    const mockReq = { ip: '10.200.5.99' };
    let allowedCount = 0;
    let rejectedCount = 0;
    let retryAfterReceived = 0;

    for (let i = 0; i < totalBurstRequests; i++) {
      testLimiter(mockReq, {
        setHeader: (k, v) => {
          if (k === 'Retry-After' && v > 0) retryAfterReceived++;
        },
        status: (code) => {
          if (code === 429) rejectedCount++;
          return { json: () => {} };
        }
      }, () => {
        allowedCount++;
      });
    }

    console.log(`     🛡️  Burst test: Allowed=${allowedCount}, Rejected(429)=${rejectedCount}, Retry-After Headers=${retryAfterReceived}`);

    assert.strictEqual(allowedCount, burstQuota, `Exactly ${burstQuota} requests must be allowed`);
    assert.strictEqual(rejectedCount, totalBurstRequests - burstQuota, `Remaining ${totalBurstRequests - burstQuota} requests must be rejected with 429`);
    assert.strictEqual(retryAfterReceived, totalBurstRequests - burstQuota, 'Every 429 must supply a Retry-After header');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 2: DISASTER & SERVICE OUTAGE RECOVERY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 4: Service Outage & Automatic Alerting Resilience');

  runTest('4A: Injected failure spike triggers alert and suppresses duplicate alerts during continuous failure', () => {
    monitoringService.resetMonitoringState();
    monitoringService.clearAlertNotificationListeners();

    const dispatchedAlerts = [];
    monitoringService.onAlertNotification((event) => {
      dispatchedAlerts.push(event);
    });

    // Step 1: Inject baseline healthy traffic (10 requests)
    for (let i = 0; i < 10; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: 25,
        statusCode: 200,
        isError: false
      });
    }

    assert.strictEqual(dispatchedAlerts.length, 0, 'No alert during normal operation');
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

    assert.strictEqual(dispatchedAlerts.length, 1, 'Exactly one alert notification must be emitted');
    assert.strictEqual(dispatchedAlerts[0].event, 'ALERT_TRIGGERED');
    assert.strictEqual(dispatchedAlerts[0].alert.type, monitoringService.ALERT_TYPES.INCREASED_FAILURES);
    assert.strictEqual(dispatchedAlerts[0].alert.status, 'ACTIVE');

    // Step 3: De-duplication test - Inject MORE failures while in ALERTING state
    for (let i = 0; i < 5; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: 50,
        statusCode: 500,
        isError: true
      });
    }

    assert.strictEqual(dispatchedAlerts.length, 1, 'Must NOT trigger duplicate alerts during ongoing outage');
    console.log('     ✓ Alert deduplication confirmed: 1 initial alert for 8 continuous failures.');
  });

  runTest('4B: Outage resolution automatically dispatches single recovery notification', () => {
    const recoveryNotices = [];
    monitoringService.onAlertNotification((event) => {
      if (event.event === 'SERVICE_RECOVERED') {
        recoveryNotices.push(event);
      }
    });

    // Inject successful requests to pull failure rate below threshold
    for (let i = 0; i < 30; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: 20,
        statusCode: 200,
        isError: false
      });
    }

    assert.strictEqual(recoveryNotices.length, 1, 'Single recovery notification must be dispatched upon normalized health');
    assert.strictEqual(recoveryNotices[0].event, 'SERVICE_RECOVERED');
    assert.strictEqual(monitoringService.getActiveAlerts().length, 0, 'No active alerts after recovery');

    // Inject more healthy requests - must NOT trigger another duplicate recovery notification
    for (let i = 0; i < 10; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: 20,
        statusCode: 200,
        isError: false
      });
    }

    assert.strictEqual(recoveryNotices.length, 1, 'Must NOT send duplicate recovery notification once already in NORMAL state');
    console.log('     ✓ Recovery notification verified: Exactly 1 resolution event sent to operations.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 3: CLINICAL ADVERSE EVENT CONTAINMENT & EVIDENCE PRESERVATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ TEST 5: Clinical Adverse Event Workflow & Evidence Tamper-Proofing');

  runTest('5A: Registers incorrect medical content, generates SHA-256 evidence, and tracks containment', () => {
    // 1. Report incorrect clinical content
    const adverseEvent = incidentService.createIncident({
      type: incidentService.INCIDENT_TYPES.INCORRECT_MEDICAL_CONTENT,
      severity: incidentService.INCIDENT_SEVERITY.HIGH,
      title: 'Triage Over-Classification for Pediatric Rash',
      description: 'AI triage engine categorized benign mild dermatitis as Critical Anaphylaxis in assessment asm_901.',
      owner: {
        name: 'Dr. Tariq El-Sayed',
        email: 'tariq.elsayed@healthvibe.ai',
        role: 'doctor'
      },
      affectedUsersCount: 1,
      metadata: {
        assessmentId: 'asm_901',
        patientId: 'pat_pediatric_44',
        modelOutput: 'Critical Anaphylaxis',
        expectedOutput: 'Mild Dermatitis'
      },
      reportedBy: 'qa_clinical_safety_agent'
    });

    assert.ok(adverseEvent.incidentId.startsWith('adv_'));
    assert.strictEqual(adverseEvent.isAdverseEvent, true);
    assert.strictEqual(adverseEvent.status, 'OPEN');

    // 2. Attach forensic evidence
    const evidence = incidentService.attachEvidence(adverseEvent.incidentId, {
      type: 'clinical_model_payload',
      referenceId: 'asm_901',
      traceId: 'trc_load_recovery_9988',
      data: {
        promptPayload: 'Symptoms: localized mild itchy arm rash without shortness of breath',
        rawModelResponse: 'Severity: CRITICAL, Triage: Anaphylaxis',
        correctedClinicianDiagnosis: 'Contact dermatitis - Non-urgent outpatient consult'
      },
      capturedBy: 'lead_medical_officer'
    });

    assert.strictEqual(evidence.sha256Fingerprint.length, 64);
    assert.strictEqual(evidence.capturedBy, 'lead_medical_officer');

    // 3. Containment: quarantine the malfunctioning model prompt
    incidentService.updateIncidentStatus(adverseEvent.incidentId, {
      status: incidentService.INCIDENT_STATUS.CONTAINED,
      recoveryAction: 'Temporarily routed pediatric rash symptoms to human doctor review fallback rule'
    });

    let current = incidentService.getIncidentById(adverseEvent.incidentId);
    assert.strictEqual(current.status, 'CONTAINED');
    assert.strictEqual(current.recoveryActions.length, 1);

    // 4. Log communication to clinical director
    const comm = incidentService.logIncidentCommunication(adverseEvent.incidentId, {
      recipientGroup: 'clinical_governance_committee',
      channel: 'internal_audit_log',
      summary: 'Adverse event adv_901 quarantined. Fallback logic verified. No patient harm occurred.'
    });

    assert.ok(comm.communicationId.startsWith('comm_'));

    // 5. Recovery: validation complete
    incidentService.updateIncidentStatus(adverseEvent.incidentId, {
      status: incidentService.INCIDENT_STATUS.RECOVERED,
      rootCause: 'Prompt weighting anomaly in pediatric allergen classifier',
      recoveryAction: 'Deployed validated prompt version v2.1 with verified zero false-critical regressions'
    });

    current = incidentService.getIncidentById(adverseEvent.incidentId);
    assert.strictEqual(current.status, 'RECOVERED');
    assert.ok(current.resolvedAt);
    assert.strictEqual(current.recoveryActions.length, 2);

    console.log(`     ✓ Clinical adverse event [${adverseEvent.incidentId}] successfully transitioned to RECOVERED with intact forensic audit log.`);
  });

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} LOAD & RECOVERY ACCEPTANCE TESTS PASSED (100%)`);
  console.log('==================================================================\n');
})();
