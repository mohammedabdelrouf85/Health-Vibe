/**
 * Health Vibe AI - Wearable Health Telemetry Integration Test Suite
 *
 * Verifies:
 * 1. Granular User Consent Management (registration, revocation, metric scoping).
 * 2. Multi-Platform Ingestion (Apple Health, Health Connect, Smartwatches).
 * 3. Physiological Plausibility Filtering (Blood pressure & Glucose).
 * 4. Idempotent Deduplication (sourceSyncId & SHA-256 fingerprint).
 * 5. Delay & Clock Skew Auditing (real-time, delayed sync, stale backlog, future clock skew).
 * 6. Disconnection & Lifecycle State Handling.
 * 7. Longitudinal Wearable Trends & Non-Diagnostic Boundary Enforcement.
 */

const assert = require('node:assert/strict');
const wearableService = require('../backend/wearable-integration-service');

console.log('==================================================================');
console.log('⌚ HEALTH VIBE AI: WEARABLE & TELEMETRY INTEGRATION TEST SUITE');
console.log('   Apple Health, Health Connect, Deduplication & Non-Diagnostic Trends');
console.log('==================================================================\n');

(async () => {
  wearableService.resetWearableStoreForTesting();

  const patientId = 'usr_patient_telemetry_99';
  const nowIso = new Date().toISOString();

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: User Consent Registration, Scoping & Revocation');
  // ---------------------------------------------------------------------------
  {
    // Register consent for Apple Health with BP and Glucose
    const consent = wearableService.registerUserConsent({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      metricsAllowed: [wearableService.SUPPORTED_METRICS.BLOOD_PRESSURE, wearableService.SUPPORTED_METRICS.BLOOD_GLUCOSE],
      consented: true,
      consentVersion: 'v1.0'
    });

    assert.equal(consent.patientId, patientId);
    assert.equal(consent.consented, true);
    assert.equal(consent.metricsAllowed.length, 2);
    assert.ok(consent.metricsAllowed.includes('blood_pressure'));
    assert.ok(consent.metricsAllowed.includes('blood_glucose'));

    const retrieved = wearableService.getUserConsentStatus(patientId, 'apple_health');
    assert.equal(retrieved.consented, true);

    // Ingesting without consent for unapproved provider should reject
    const unapprovedSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.GARMIN_CONNECT,
      readings: [
        {
          metricType: 'blood_pressure',
          value: { systolic: 120, diastolic: 80, pulse: 70 }
        }
      ]
    });

    assert.equal(unapprovedSync.acceptedCount, 0);
    assert.equal(unapprovedSync.rejectedCount, 1);
    assert.equal(unapprovedSync.rejectedReadings[0].qualityStatus, wearableService.QUALITY_STATUS.MISSING_CONSENT);

    console.log('  ✓ User consent recorded with granular metric scopes.');
    console.log('  ✓ Ingestion strictly blocked when active consent is missing.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Ingestion from Apple HealthKit (Blood Pressure)');
  // ---------------------------------------------------------------------------
  {
    const appleDevice = {
      manufacturer: 'Apple Inc.',
      model: 'Apple Watch Ultra 2',
      hardwareRevision: 'Watch7,5',
      firmwareVersion: '11.0.1',
      identifier: 'dev_apple_watch_ultra_902'
    };

    const syncReport = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      deviceDetails: appleDevice,
      readings: [
        {
          sourceSyncId: 'hk_bp_sample_001',
          metricType: 'blood_pressure',
          value: { systolic: 126, diastolic: 82, pulse: 68 },
          unit: 'mmHg',
          deviceTimestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString() // 3 mins ago
        }
      ]
    });

    assert.equal(syncReport.acceptedCount, 1);
    assert.equal(syncReport.duplicateCount, 0);

    const saved = syncReport.acceptedReadings[0];
    assert.equal(saved.metricType, 'blood_pressure');
    assert.equal(saved.value.systolic, 126);
    assert.equal(saved.value.diastolic, 82);
    assert.equal(saved.value.pulse, 68);
    assert.equal(saved.unit, 'mmHg');
    assert.equal(saved.device.manufacturer, 'Apple Inc.');
    assert.equal(saved.readingSource, 'apple_health');
    assert.equal(saved.userConsent.consented, true);
    assert.equal(saved.qualityStatus.delayCategory, 'REAL_TIME');

    console.log('  ✓ Apple Health Blood Pressure sample ingested with complete device & consent provenance.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Ingestion from Google Health Connect (Glucose mg/dL & mmol/L)');
  // ---------------------------------------------------------------------------
  {
    // Grant consent for Health Connect
    wearableService.registerUserConsent({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.HEALTH_CONNECT,
      metricsAllowed: [wearableService.SUPPORTED_METRICS.BLOOD_GLUCOSE]
    });

    const pixelDevice = {
      manufacturer: 'Google',
      model: 'Pixel Watch 3',
      identifier: 'dev_pixel_watch_771'
    };

    // Ingest glucose in mg/dL (fasting) and in mmol/L (postprandial)
    const glucoseSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.HEALTH_CONNECT,
      deviceDetails: pixelDevice,
      readings: [
        {
          sourceSyncId: 'hc_gluc_sample_001',
          metricType: 'blood_glucose',
          value: { bloodGlucose: 95, mealContext: 'fasting' },
          unit: 'mg/dL',
          deviceTimestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString()
        },
        {
          sourceSyncId: 'hc_gluc_sample_002',
          metricType: 'blood_glucose',
          value: { bloodGlucose: 7.2, mealContext: 'postprandial' }, // 7.2 mmol/L = ~130 mg/dL
          unit: 'mmol/L',
          deviceTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      ]
    });

    assert.equal(glucoseSync.acceptedCount, 2);
    assert.equal(glucoseSync.acceptedReadings[0].value.bloodGlucose, 95);
    assert.equal(glucoseSync.acceptedReadings[0].value.mealContext, 'fasting');

    // Check mmol/L normalized to mg/dL while retaining mmol/L field
    assert.equal(glucoseSync.acceptedReadings[1].value.bloodGlucoseMmol, 7.2);
    assert.ok(Math.abs(glucoseSync.acceptedReadings[1].value.bloodGlucose - 129.7) < 0.5);

    console.log('  ✓ Google Health Connect glucose ingested with meal context and dual mg/dL / mmol/L normalization.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Idempotent Deduplication (Sync ID & Hash Fingerprints)');
  // ---------------------------------------------------------------------------
  {
    // Resend the exact same Apple Health sample
    const duplicateSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      readings: [
        {
          sourceSyncId: 'hk_bp_sample_001', // already ingested in Test 2
          metricType: 'blood_pressure',
          value: { systolic: 126, diastolic: 82, pulse: 68 },
          unit: 'mmHg'
        }
      ]
    });

    assert.equal(duplicateSync.acceptedCount, 0);
    assert.equal(duplicateSync.duplicateCount, 1);

    // Resend without sourceSyncId but matching fingerprint (timestamp + value)
    const timestampFixed = new Date('2026-10-02T10:00:00.000Z').toISOString();
    const firstFingerprintSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      readings: [
        {
          metricType: 'blood_pressure',
          value: { systolic: 122, diastolic: 78, pulse: 65 },
          deviceTimestamp: timestampFixed
        }
      ]
    });
    assert.equal(firstFingerprintSync.acceptedCount, 1);

    const secondFingerprintSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      readings: [
        {
          metricType: 'blood_pressure',
          value: { systolic: 122, diastolic: 78, pulse: 65 },
          deviceTimestamp: timestampFixed // Same minute & values
        }
      ]
    });
    assert.equal(secondFingerprintSync.acceptedCount, 0);
    assert.equal(secondFingerprintSync.duplicateCount, 1);

    console.log('  ✓ Idempotent deduplication verified for explicit sync IDs and deterministic fingerprints.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Physiological Plausibility Filtering');
  // ---------------------------------------------------------------------------
  {
    const implausibleSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      readings: [
        // 1. Systolic <= Diastolic
        {
          metricType: 'blood_pressure',
          value: { systolic: 80, diastolic: 110 }
        },
        // 2. Systolic impossibly high
        {
          metricType: 'blood_pressure',
          value: { systolic: 350, diastolic: 80 }
        },
        // 3. Glucose impossibly high
        {
          metricType: 'blood_glucose',
          value: { bloodGlucose: 1200 },
          unit: 'mg/dL'
        },
        // 4. Glucose impossibly low (sensor error)
        {
          metricType: 'blood_glucose',
          value: { bloodGlucose: 10 },
          unit: 'mg/dL'
        }
      ]
    });

    assert.equal(implausibleSync.acceptedCount, 0);
    assert.equal(implausibleSync.rejectedCount, 4);
    for (const rej of implausibleSync.rejectedReadings) {
      assert.equal(rej.qualityStatus, wearableService.QUALITY_STATUS.IMPLAUSIBLE_REJECTED);
      assert.ok(rej.reason.length > 0);
    }

    console.log('  ✓ Physiological boundary rules rejected sensor errors and corrupted reading values.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Timing, Delays & Clock Skew Auditing');
  // ---------------------------------------------------------------------------
  {
    const pastTenDays = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const futureTenMins = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const delayReport = await wearableService.ingestWearableReadings({
      patientId,
      provider: wearableService.SUPPORTED_PLATFORMS.APPLE_HEALTH,
      readings: [
        // Stale backlog (> 7 days)
        {
          sourceSyncId: 'sample_backlog_01',
          metricType: 'blood_pressure',
          value: { systolic: 124, diastolic: 80 },
          deviceTimestamp: pastTenDays
        },
        // Future clock skew (> 5 minutes ahead)
        {
          sourceSyncId: 'sample_future_01',
          metricType: 'blood_pressure',
          value: { systolic: 125, diastolic: 81 },
          deviceTimestamp: futureTenMins
        }
      ]
    });

    assert.equal(delayReport.acceptedCount, 2);
    assert.equal(delayReport.staleBacklogCount, 1);

    const backlogItem = delayReport.acceptedReadings.find(r => r.sourceSyncId === 'sample_backlog_01');
    assert.equal(backlogItem.qualityStatus.delayCategory, wearableService.QUALITY_STATUS.STALE_BACKLOG);

    const futureItem = delayReport.acceptedReadings.find(r => r.sourceSyncId === 'sample_future_01');
    assert.equal(futureItem.qualityStatus.isClockSkewFuture, true);
    assert.equal(futureItem.qualityStatus.status, wearableService.QUALITY_STATUS.CLOCK_SKEW_FUTURE);

    console.log('  ✓ Clock skew and backlog delays properly flagged in telemetry metadata.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Disconnection & Connection State Lifecycle');
  // ---------------------------------------------------------------------------
  {
    // Disconnect Health Connect
    const disconnectRecord = wearableService.disconnectProvider({
      patientId,
      provider: 'health_connect',
      reason: 'User disconnected via mobile app settings.'
    });

    assert.equal(disconnectRecord.status, wearableService.CONNECTION_STATES.DISCONNECTED);

    const consentStatus = wearableService.getUserConsentStatus(patientId, 'health_connect');
    assert.equal(consentStatus.consented, false);

    // Syncing after disconnect should fail
    const blockedSync = await wearableService.ingestWearableReadings({
      patientId,
      provider: 'health_connect',
      readings: [
        {
          metricType: 'blood_glucose',
          value: { bloodGlucose: 110 }
        }
      ]
    });
    assert.equal(blockedSync.acceptedCount, 0);
    assert.equal(blockedSync.rejectedReadings[0].qualityStatus, wearableService.QUALITY_STATUS.MISSING_CONSENT);

    const summary = wearableService.getConnectionSummary(patientId);
    assert.ok(summary.length >= 2);
    const hcSummary = summary.find(s => s.provider === 'health_connect');
    assert.equal(hcSummary.hasConsent, false);

    console.log('  ✓ Disconnection state handled cleanly without data corruption.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Longitudinal Wearable Trends & NON-DIAGNOSTIC Boundary');
  // ---------------------------------------------------------------------------
  {
    // Seed 14 days of realistic blood pressure data for trend calculation
    const readingsBatch = [];
    const baseTime = Date.now();

    for (let day = 0; day < 10; day++) {
      const dayOffsetMs = day * 24 * 3600 * 1000;
      // Morning reading (8:00 AM)
      readingsBatch.push({
        sourceSyncId: `trend_bp_morn_${day}`,
        metricType: 'blood_pressure',
        value: { systolic: 125 + (day % 3), diastolic: 80 + (day % 2), pulse: 70 },
        deviceTimestamp: new Date(baseTime - dayOffsetMs - 16 * 3600 * 1000).toISOString()
      });
      // Evening reading (8:00 PM)
      readingsBatch.push({
        sourceSyncId: `trend_bp_eve_${day}`,
        metricType: 'blood_pressure',
        value: { systolic: 122 + (day % 2), diastolic: 78, pulse: 68 },
        deviceTimestamp: new Date(baseTime - dayOffsetMs - 4 * 3600 * 1000).toISOString()
      });
    }

    await wearableService.ingestWearableReadings({
      patientId,
      provider: 'apple_health',
      readings: readingsBatch
    });

    const trends = wearableService.calculateWearableTrends(patientId, 'blood_pressure', { timeframeDays: 14 });

    // Strict Clinical Safety Boundaries
    assert.equal(trends.isDiagnosticDecision, false, 'Trends must NEVER claim to be a diagnostic decision');
    assert.equal(trends.autonomousDiagnosisForbidden, true, 'Autonomous diagnosis must be explicitly forbidden');
    assert.equal(trends.requiresPhysicianReview, true, 'Physician review must be declared required');
    assert.ok(trends.clinicalDisclaimer.includes('strictly observational'), 'Clinical disclaimer must be present');

    // Verify statistical calculations
    assert.ok(trends.summary.readingsCount >= 20);
    assert.ok(trends.summary.averageSystolic >= 120 && trends.summary.averageSystolic <= 130);
    assert.ok(trends.summary.targetCompliancePercent > 0);
    assert.ok(trends.summary.diurnalAnalysis.morningAverageSystolic !== null);
    assert.ok(trends.summary.diurnalAnalysis.eveningAverageSystolic !== null);

    console.log('  ✓ Rolling wearable trends computed (Mean BP, compliance %, diurnal morning vs evening delta).');
    console.log('  ✓ CRITICAL GOVERNANCE ENFORCED: Autonomous diagnosis strictly forbidden; disclaimer attached.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL WEARABLE TELEMETRY INTEGRATION TESTS PASSED (100% SUCCESS)!');
  console.log('==================================================================\n');
})();
