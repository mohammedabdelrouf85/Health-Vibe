/**
 * Health Vibe AI - Multi-Platform Wearable & Health Telemetry Integration Service
 * 
 * Ingestion layer for Blood Pressure and Glucose readings from:
 * - Apple Health (HealthKit)
 * - Google Health Connect (Android)
 * - Smartwatches (Apple Watch, Garmin, Fitbit, Samsung Galaxy Watch)
 * - Connected Bluetooth BLE Monitors & Continuous Glucose Monitors (CGM)
 * 
 * Safety & Quality Pipeline:
 * 1. Granular User Consent Verification per provider and metric.
 * 2. Physiological Plausibility Filtering (rejects sensor artifacts).
 * 3. Idempotent Deduplication (via sourceSyncId and deterministic SHA-256 fingerprint).
 * 4. Delay & Clock Skew Auditing (real-time vs. backlog vs. future skew).
 * 5. Disconnection & Lifecycle State Tracking.
 * 6. Observational Longitudinal Trends with strict NON-DIAGNOSTIC disclaimers.
 */

const crypto = require('crypto');

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

const SUPPORTED_PLATFORMS = {
  APPLE_HEALTH: 'apple_health',
  HEALTH_CONNECT: 'health_connect',
  GARMIN_CONNECT: 'garmin_connect',
  FITBIT_API: 'fitbit_api',
  DIRECT_BLE: 'direct_ble'
};

const SUPPORTED_METRICS = {
  BLOOD_PRESSURE: 'blood_pressure',
  BLOOD_GLUCOSE: 'blood_glucose'
};

const CONNECTION_STATES = {
  CONNECTED: 'connected',
  SYNCING: 'syncing',
  DISCONNECTED: 'disconnected',
  TOKEN_EXPIRED: 'token_expired',
  PERMISSION_REVOKED: 'permission_revoked',
  SYNC_ERROR: 'sync_error',
  PENDING_CONSENT: 'pending_consent'
};

const QUALITY_STATUS = {
  VALID: 'VALID',
  DUPLICATE_IGNORED: 'DUPLICATE_IGNORED',
  IMPLAUSIBLE_REJECTED: 'IMPLAUSIBLE_REJECTED',
  DELAYED_SYNC: 'DELAYED_SYNC',
  STALE_BACKLOG: 'STALE_BACKLOG',
  CLOCK_SKEW_FUTURE: 'CLOCK_SKEW_FUTURE',
  MISSING_CONSENT: 'MISSING_CONSENT'
};

const MMOL_TO_MGDL_FACTOR = 18.018;

// In-Memory Storage for state, deduplication index, and telemetry
const userConsentStore = new Map();       // key: `${patientId}_${provider}` -> consentObj
const connectionStateStore = new Map();   // key: `${patientId}_${provider}` -> connectionObj
const deduplicationIndex = new Set();     // set of fingerprint hashes / sourceSyncIds
const readingsStore = new Map();          // key: readingId -> readingObj
const patientReadingsIndex = new Map();   // key: patientId -> array of readingIds

// =============================================================================
// 1. PHYSIOLOGICAL PLAUSIBILITY VALIDATION
// =============================================================================

/**
 * Validates physiological plausibility for Blood Pressure readings.
 * Returns { isPlausible: boolean, reason?: string, sanitizedValue?: object }
 */
function validateBloodPressurePlausibility(val) {
  if (!val || typeof val !== 'object') {
    return { isPlausible: false, reason: 'Value must be an object with systolic and diastolic numbers.' };
  }

  const sys = Number(val.systolic);
  const dia = Number(val.diastolic);
  const pul = val.pulse !== undefined && val.pulse !== null ? Number(val.pulse) : null;

  if (isNaN(sys) || isNaN(dia)) {
    return { isPlausible: false, reason: 'Systolic and Diastolic must be numeric.' };
  }

  // Physiological bounds
  if (sys < 60 || sys > 260) {
    return { isPlausible: false, reason: `Systolic (${sys} mmHg) is outside physiological range [60-260 mmHg].` };
  }

  if (dia < 35 || dia > 160) {
    return { isPlausible: false, reason: `Diastolic (${dia} mmHg) is outside physiological range [35-160 mmHg].` };
  }

  if (sys <= dia + 10) {
    return { isPlausible: false, reason: `Systolic (${sys}) must exceed Diastolic (${dia}) by at least 10 mmHg.` };
  }

  if (pul !== null) {
    if (isNaN(pul) || pul < 35 || pul > 230) {
      return { isPlausible: false, reason: `Pulse (${pul} bpm) is outside physiological range [35-230 bpm].` };
    }
  }

  return {
    isPlausible: true,
    sanitizedValue: {
      systolic: Math.round(sys),
      diastolic: Math.round(dia),
      pulse: pul !== null ? Math.round(pul) : null
    }
  };
}

/**
 * Validates physiological plausibility for Blood Glucose readings.
 * Normalizes mg/dL and mmol/L equivalents.
 */
function validateBloodGlucosePlausibility(val, unit = 'mg/dL') {
  if (!val) {
    return { isPlausible: false, reason: 'Glucose value is required.' };
  }

  let rawGlucose = typeof val === 'object' ? Number(val.bloodGlucose || val.glucose || val.value) : Number(val);
  const normalizedUnit = String(unit).toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL';

  if (isNaN(rawGlucose)) {
    return { isPlausible: false, reason: 'Blood glucose must be numeric.' };
  }

  let glucoseMgdl = rawGlucose;
  let glucoseMmol = rawGlucose;

  if (normalizedUnit === 'mmol/L') {
    glucoseMgdl = Math.round(rawGlucose * MMOL_TO_MGDL_FACTOR * 10) / 10;
    glucoseMmol = Math.round(rawGlucose * 100) / 100;
  } else {
    glucoseMgdl = Math.round(rawGlucose * 10) / 10;
    glucoseMmol = Math.round((rawGlucose / MMOL_TO_MGDL_FACTOR) * 100) / 100;
  }

  // Physiological range: 25 to 550 mg/dL (1.4 to 30.5 mmol/L)
  if (glucoseMgdl < 25 || glucoseMgdl > 550) {
    return {
      isPlausible: false,
      reason: `Blood glucose (${glucoseMgdl} mg/dL / ${glucoseMmol} mmol/L) is outside physiological range [25-550 mg/dL].`
    };
  }

  const mealContext = (typeof val === 'object' && val.mealContext) ? String(val.mealContext).toLowerCase() : 'random';
  const specimenSource = (typeof val === 'object' && val.specimenSource) ? String(val.specimenSource).toLowerCase() : 'interstitial_fluid';

  return {
    isPlausible: true,
    sanitizedValue: {
      bloodGlucose: glucoseMgdl,
      bloodGlucoseMmol: glucoseMmol,
      mealContext,
      specimenSource
    }
  };
}

// =============================================================================
// 2. USER CONSENT MANAGEMENT
// =============================================================================

function registerUserConsent({
  patientId,
  provider,
  metricsAllowed = [SUPPORTED_METRICS.BLOOD_PRESSURE, SUPPORTED_METRICS.BLOOD_GLUCOSE],
  consented = true,
  consentVersion = 'v1.0'
}) {
  if (!patientId || !provider) {
    throw new Error('patientId and provider are required to register consent.');
  }

  const key = `${patientId}_${provider.toLowerCase()}`;
  const nowIso = new Date().toISOString();

  const consentRecord = {
    patientId,
    provider: provider.toLowerCase(),
    consented: Boolean(consented),
    metricsAllowed: Array.isArray(metricsAllowed) ? metricsAllowed.map(m => m.toLowerCase()) : [],
    consentTimestamp: nowIso,
    consentVersion,
    revocationTimestamp: consented ? null : nowIso,
    revocationReason: null
  };

  userConsentStore.set(key, consentRecord);
  return consentRecord;
}

function revokeUserConsent({ patientId, provider, reason = 'USER_INITIATED_DISCONNECT' }) {
  const key = `${patientId}_${provider.toLowerCase()}`;
  const existing = userConsentStore.get(key);
  const nowIso = new Date().toISOString();

  const updatedRecord = {
    patientId,
    provider: provider.toLowerCase(),
    consented: false,
    metricsAllowed: existing ? existing.metricsAllowed : [],
    consentTimestamp: existing ? existing.consentTimestamp : nowIso,
    consentVersion: existing ? existing.consentVersion : 'v1.0',
    revocationTimestamp: nowIso,
    revocationReason: reason
  };

  userConsentStore.set(key, updatedRecord);

  // Also update connection state to disconnected
  updateConnectionStatus({
    patientId,
    provider,
    status: CONNECTION_STATES.DISCONNECTED,
    errorDetails: `Consent revoked: ${reason}`
  });

  return updatedRecord;
}

function getUserConsentStatus(patientId, provider) {
  const key = `${patientId}_${provider.toLowerCase()}`;
  return userConsentStore.get(key) || null;
}

// =============================================================================
// 3. CONNECTION LIFECYCLE & DISCONNECTION HANDLING
// =============================================================================

function updateConnectionStatus({
  patientId,
  provider,
  status = CONNECTION_STATES.CONNECTED,
  deviceDetails = null,
  errorDetails = null
}) {
  if (!patientId || !provider) {
    throw new Error('patientId and provider are required.');
  }

  const key = `${patientId}_${provider.toLowerCase()}`;
  const nowIso = new Date().toISOString();
  const existing = connectionStateStore.get(key);

  const connectionRecord = {
    patientId,
    provider: provider.toLowerCase(),
    status,
    deviceDetails: deviceDetails || (existing ? existing.deviceDetails : null),
    lastSyncTimestamp: status === CONNECTION_STATES.CONNECTED ? nowIso : (existing ? existing.lastSyncTimestamp : null),
    errorDetails: errorDetails || null,
    updatedAt: nowIso
  };

  connectionStateStore.set(key, connectionRecord);
  return connectionRecord;
}

function disconnectProvider({ patientId, provider, reason = 'USER_DISCONNECTED' }) {
  revokeUserConsent({ patientId, provider, reason });
  return updateConnectionStatus({
    patientId,
    provider,
    status: CONNECTION_STATES.DISCONNECTED,
    errorDetails: reason
  });
}

function getConnectionSummary(patientId) {
  const connections = [];
  for (const [key, state] of connectionStateStore.entries()) {
    if (key.startsWith(`${patientId}_`)) {
      const consent = userConsentStore.get(key);
      connections.push({
        ...state,
        hasConsent: Boolean(consent && consent.consented),
        metricsAllowed: consent ? consent.metricsAllowed : []
      });
    }
  }
  return connections;
}

// =============================================================================
// 4. DEDUPLICATION & CLOCK SKEW AUDIT
// =============================================================================

function generateReadingFingerprint({ patientId, metricType, timestamp, valueString, sourceSyncId }) {
  if (sourceSyncId) {
    return `sync_${patientId}_${metricType}_${sourceSyncId}`;
  }
  // Round timestamp to the nearest minute to prevent microsecond drift duplicates
  const dateObj = new Date(timestamp);
  const roundedIso = !isNaN(dateObj.getTime())
    ? new Date(Math.floor(dateObj.getTime() / 60000) * 60000).toISOString()
    : String(timestamp);

  const rawKey = `${patientId}|${metricType}|${roundedIso}|${valueString}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function evaluateSyncDelayAndClockSkew(deviceTimestampIso, ingestionTimestampIso) {
  const deviceTime = new Date(deviceTimestampIso).getTime();
  const ingestionTime = new Date(ingestionTimestampIso).getTime();

  if (isNaN(deviceTime) || isNaN(ingestionTime)) {
    return { delaySeconds: 0, delayCategory: 'UNKNOWN_TIMING', isClockSkewFuture: false };
  }

  const diffMs = ingestionTime - deviceTime;
  const delaySeconds = Math.round(diffMs / 1000);

  // Future clock skew: device time is > 5 minutes in the future compared to ingestion time
  if (delaySeconds < -300) {
    return {
      delaySeconds,
      delayCategory: QUALITY_STATUS.CLOCK_SKEW_FUTURE,
      isClockSkewFuture: true
    };
  }

  // Real-time: synced within 15 minutes (900 seconds)
  if (delaySeconds <= 900) {
    return { delaySeconds: Math.max(0, delaySeconds), delayCategory: 'REAL_TIME', isClockSkewFuture: false };
  }

  // Stale backlog: synced after > 7 days (604,800 seconds)
  if (delaySeconds > 604800) {
    return { delaySeconds, delayCategory: QUALITY_STATUS.STALE_BACKLOG, isClockSkewFuture: false };
  }

  // Standard delayed sync: between 15m and 7 days
  return { delaySeconds, delayCategory: QUALITY_STATUS.DELAYED_SYNC, isClockSkewFuture: false };
}

// =============================================================================
// 5. INGESTION PIPELINE (BATCH & SINGLE)
// =============================================================================

async function ingestWearableReadings({
  patientId,
  provider,
  readings = [],
  deviceDetails = {},
  syncTimestamp = new Date().toISOString()
}) {
  if (!patientId || !provider) {
    throw new Error('patientId and provider are required for ingestion.');
  }

  const normalizedProvider = provider.toLowerCase();
  const consent = getUserConsentStatus(patientId, normalizedProvider);

  // Connection status update
  updateConnectionStatus({
    patientId,
    provider: normalizedProvider,
    status: CONNECTION_STATES.SYNCING,
    deviceDetails
  });

  const results = {
    totalReceived: readings.length,
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    staleBacklogCount: 0,
    acceptedReadings: [],
    rejectedReadings: []
  };

  const nowIso = syncTimestamp || new Date().toISOString();

  for (const item of readings) {
    const metricType = String(item.metricType || '').toLowerCase();
    const sourceSyncId = item.sourceSyncId || item.uuid || item.recordId || null;
    const deviceTimestamp = item.deviceTimestamp || item.timestamp || nowIso;
    const unit = item.unit || (metricType === SUPPORTED_METRICS.BLOOD_PRESSURE ? 'mmHg' : 'mg/dL');

    // 1. Consent Verification
    if (!consent || !consent.consented || !consent.metricsAllowed.includes(metricType)) {
      results.rejectedCount++;
      results.rejectedReadings.push({
        sourceSyncId,
        metricType,
        reason: 'Patient has not granted active consent for this provider or metric.',
        qualityStatus: QUALITY_STATUS.MISSING_CONSENT
      });
      continue;
    }

    // 2. Plausibility Validation
    let plausibilityResult;
    let valueString;

    if (metricType === SUPPORTED_METRICS.BLOOD_PRESSURE) {
      plausibilityResult = validateBloodPressurePlausibility(item.value);
      if (plausibilityResult.isPlausible) {
        valueString = `${plausibilityResult.sanitizedValue.systolic}/${plausibilityResult.sanitizedValue.diastolic}`;
      }
    } else if (metricType === SUPPORTED_METRICS.BLOOD_GLUCOSE) {
      plausibilityResult = validateBloodGlucosePlausibility(item.value, unit);
      if (plausibilityResult.isPlausible) {
        valueString = `${plausibilityResult.sanitizedValue.bloodGlucose}`;
      }
    } else {
      results.rejectedCount++;
      results.rejectedReadings.push({
        sourceSyncId,
        metricType,
        reason: `Unsupported metricType: '${metricType}'. Must be blood_pressure or blood_glucose.`,
        qualityStatus: QUALITY_STATUS.IMPLAUSIBLE_REJECTED
      });
      continue;
    }

    if (!plausibilityResult.isPlausible) {
      results.rejectedCount++;
      results.rejectedReadings.push({
        sourceSyncId,
        metricType,
        reason: plausibilityResult.reason,
        qualityStatus: QUALITY_STATUS.IMPLAUSIBLE_REJECTED,
        rawValue: item.value
      });
      continue;
    }

    // 3. Deduplication Check
    const fingerprint = generateReadingFingerprint({
      patientId,
      metricType,
      timestamp: deviceTimestamp,
      valueString,
      sourceSyncId
    });

    if (deduplicationIndex.has(fingerprint)) {
      results.duplicateCount++;
      continue; // Idempotently skip duplicate
    }

    // 4. Delay & Clock Skew Auditing
    const timing = evaluateSyncDelayAndClockSkew(deviceTimestamp, nowIso);
    if (timing.delayCategory === QUALITY_STATUS.STALE_BACKLOG) {
      results.staleBacklogCount++;
    }

    // 5. Build Normalized Stored Record
    const readingId = `wearable_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const normalizedRecord = {
      id: readingId,
      readingId,
      patientId,
      metricType,
      value: plausibilityResult.sanitizedValue,
      unit: metricType === SUPPORTED_METRICS.BLOOD_PRESSURE ? 'mmHg' : 'mg/dL',
      deviceTimestamp: new Date(deviceTimestamp).toISOString(),
      ingestionTimestamp: nowIso,
      syncDelaySeconds: timing.delaySeconds,
      device: {
        manufacturer: item.device?.manufacturer || deviceDetails.manufacturer || 'Generic',
        model: item.device?.model || deviceDetails.model || 'Connected Sensor',
        hardwareRevision: item.device?.hardwareRevision || deviceDetails.hardwareRevision || null,
        firmwareVersion: item.device?.firmwareVersion || deviceDetails.firmwareVersion || null,
        identifier: item.device?.identifier || deviceDetails.identifier || 'masked_id'
      },
      readingSource: normalizedProvider,
      sourceSyncId,
      userConsent: {
        consented: true,
        consentTimestamp: consent.consentTimestamp,
        consentVersion: consent.consentVersion
      },
      qualityStatus: {
        status: timing.isClockSkewFuture ? QUALITY_STATUS.CLOCK_SKEW_FUTURE : QUALITY_STATUS.VALID,
        delayCategory: timing.delayCategory,
        isClockSkewFuture: timing.isClockSkewFuture
      }
    };

    deduplicationIndex.add(fingerprint);
    readingsStore.set(readingId, normalizedRecord);

    const existingIds = patientReadingsIndex.get(patientId) || [];
    existingIds.unshift(readingId);
    patientReadingsIndex.set(patientId, existingIds);

    results.acceptedCount++;
    results.acceptedReadings.push(normalizedRecord);
  }

  // Update final connection status
  updateConnectionStatus({
    patientId,
    provider: normalizedProvider,
    status: CONNECTION_STATES.CONNECTED,
    deviceDetails
  });

  return results;
}

function getPatientWearableReadings(patientId, metricType = null, limit = 100) {
  const ids = patientReadingsIndex.get(patientId) || [];
  let readings = ids.map(id => readingsStore.get(id)).filter(Boolean);

  if (metricType) {
    readings = readings.filter(r => r.metricType === metricType.toLowerCase());
  }

  return readings.slice(0, limit);
}

// =============================================================================
// 6. OBSERVATIONAL WEARABLE TRENDS (STRICT NON-DIAGNOSTIC BOUNDARY)
// =============================================================================

/**
 * Calculates longitudinal wearable trends over a rolling window (7, 14, 30 days).
 * 
 * CRITICAL CLINICAL SAFETY RULE:
 * This method presents aggregated trends, moving averages, and time-in-range for
 * observational and doctor-discussion purposes ONLY. It explicitly tags every response
 * with `isDiagnosticDecision: false` and `requiresPhysicianReview: true`.
 */
function calculateWearableTrends(patientId, metricType, { timeframeDays = 14 } = {}) {
  const metric = String(metricType || '').toLowerCase();
  const allReadings = getPatientWearableReadings(patientId, metric, 500);

  const cutoff = new Date(Date.now() - (timeframeDays * 24 * 3600 * 1000)).getTime();
  const windowReadings = allReadings.filter(r => {
    const t = new Date(r.deviceTimestamp).getTime();
    return !isNaN(t) && t >= cutoff;
  });

  const baseResponse = {
    patientId,
    metricType: metric,
    timeframeDays,
    totalReadingsInWindow: windowReadings.length,
    hasData: windowReadings.length > 0,
    // 🛡️ Strict Clinical Boundary Governance
    isDiagnosticDecision: false,
    autonomousDiagnosisForbidden: true,
    requiresPhysicianReview: true,
    clinicalDisclaimer: 'Wearable telemetry trends are strictly observational and intended for clinical review with an attending physician. These calculations do NOT constitute an automated medical diagnosis or prescription change.'
  };

  if (windowReadings.length === 0) {
    return {
      ...baseResponse,
      summary: null,
      message: `No valid wearable readings recorded in the past ${timeframeDays} days.`
    };
  }

  if (metric === SUPPORTED_METRICS.BLOOD_PRESSURE) {
    let sumSys = 0;
    let sumDia = 0;
    let sumPul = 0;
    let inTargetCount = 0; // Target: < 130/80 mmHg

    let morningSysSum = 0;
    let morningCount = 0;
    let eveningSysSum = 0;
    let eveningCount = 0;

    for (const r of windowReadings) {
      sumSys += r.value.systolic;
      sumDia += r.value.diastolic;
      if (r.value.pulse) sumPul += r.value.pulse;

      if (r.value.systolic < 130 && r.value.diastolic < 80) {
        inTargetCount++;
      }

      const hour = new Date(r.deviceTimestamp).getHours();
      if (hour >= 6 && hour <= 11) {
        morningSysSum += r.value.systolic;
        morningCount++;
      } else if (hour >= 18 && hour <= 23) {
        eveningSysSum += r.value.systolic;
        eveningCount++;
      }
    }

    const n = windowReadings.length;
    const avgSys = Math.round(sumSys / n);
    const avgDia = Math.round(sumDia / n);
    const avgPul = sumPul > 0 ? Math.round(sumPul / n) : null;
    const controlPercent = Math.round((inTargetCount / n) * 100);

    const avgMorningSys = morningCount > 0 ? Math.round(morningSysSum / morningCount) : null;
    const avgEveningSys = eveningCount > 0 ? Math.round(eveningSysSum / eveningCount) : null;
    const diurnalDifference = (avgMorningSys !== null && avgEveningSys !== null) ? avgMorningSys - avgEveningSys : null;

    return {
      ...baseResponse,
      summary: {
        averageSystolic: avgSys,
        averageDiastolic: avgDia,
        averagePulse: avgPul,
        targetCompliancePercent: controlPercent,
        diurnalAnalysis: {
          morningAverageSystolic: avgMorningSys,
          eveningAverageSystolic: avgEveningSys,
          diurnalDifference
        },
        readingsCount: n
      }
    };
  }

  if (metric === SUPPORTED_METRICS.BLOOD_GLUCOSE) {
    let sumMgdl = 0;
    let inRangeCount = 0; // Time in range: 70 - 180 mg/dL
    let belowRangeCount = 0; // < 70 mg/dL
    let aboveRangeCount = 0; // > 180 mg/dL

    let fastingSum = 0;
    let fastingCount = 0;
    let postprandialSum = 0;
    let postprandialCount = 0;

    for (const r of windowReadings) {
      const g = r.value.bloodGlucose;
      sumMgdl += g;

      if (g >= 70 && g <= 180) {
        inRangeCount++;
      } else if (g < 70) {
        belowRangeCount++;
      } else {
        aboveRangeCount++;
      }

      if (r.value.mealContext === 'fasting') {
        fastingSum += g;
        fastingCount++;
      } else if (r.value.mealContext === 'postprandial') {
        postprandialSum += g;
        postprandialCount++;
      }
    }

    const n = windowReadings.length;
    const avgMgdl = Math.round((sumMgdl / n) * 10) / 10;
    const avgMmol = Math.round((avgMgdl / MMOL_TO_MGDL_FACTOR) * 100) / 100;

    const timeInRangePercent = Math.round((inRangeCount / n) * 100);
    const timeBelowRangePercent = Math.round((belowRangeCount / n) * 100);
    const timeAboveRangePercent = Math.round((aboveRangeCount / n) * 100);

    return {
      ...baseResponse,
      summary: {
        averageGlucoseMgdl: avgMgdl,
        averageGlucoseMmol: avgMmol,
        timeInRangePercent,       // 70 - 180 mg/dL (Target > 70%)
        timeBelowRangePercent,    // < 70 mg/dL (Target < 4%)
        timeAboveRangePercent,    // > 180 mg/dL (Target < 25%)
        fastingAverageMgdl: fastingCount > 0 ? Math.round((fastingSum / fastingCount) * 10) / 10 : null,
        postprandialAverageMgdl: postprandialCount > 0 ? Math.round((postprandialSum / postprandialCount) * 10) / 10 : null,
        readingsCount: n
      }
    };
  }

  return baseResponse;
}

// =============================================================================
// 7. TESTING & RESET UTILITY
// =============================================================================

function resetWearableStoreForTesting() {
  userConsentStore.clear();
  connectionStateStore.clear();
  deduplicationIndex.clear();
  readingsStore.clear();
  patientReadingsIndex.clear();
}

module.exports = {
  SUPPORTED_PLATFORMS,
  SUPPORTED_METRICS,
  CONNECTION_STATES,
  QUALITY_STATUS,
  validateBloodPressurePlausibility,
  validateBloodGlucosePlausibility,
  registerUserConsent,
  revokeUserConsent,
  getUserConsentStatus,
  updateConnectionStatus,
  disconnectProvider,
  getConnectionSummary,
  generateReadingFingerprint,
  evaluateSyncDelayAndClockSkew,
  ingestWearableReadings,
  getPatientWearableReadings,
  calculateWearableTrends,
  resetWearableStoreForTesting
};
