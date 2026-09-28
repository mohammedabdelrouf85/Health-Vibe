/**
 * Health Vibes AI - Enterprise Observability, Telemetry & Alerting Engine
 *
 * Implements:
 * 1. PII/PHI Redaction: Emails, phone numbers, national IDs, credentials, DOB, credit cards, JWTs.
 * 2. Multi-Category Error Capture: javascript, firebase, auth, api, notification, ai_service.
 * 3. Distributed Trace Identifiers: traceId correlation between client events and server logs.
 * 4. Measured Session-Based Crash-Free Rate: based strictly on observed sessions (or "Unavailable").
 * 5. Uptime & Slowness / Latency Monitoring: rolling p95/avg latency and availability tracking.
 * 6. Alert Engine with Deduplication & Service Recovery:
 *    - Increased Failures Alert
 *    - Slowness Alert (High Latency)
 *    - Deduplication: no duplicate alerts while in ALERTING state
 *    - Recovery: emits single resolution notice upon returning below threshold.
 */

const crypto = require('crypto');

// Supported Error Categories
const ERROR_CATEGORIES = Object.freeze({
  JAVASCRIPT: 'javascript',
  FIREBASE: 'firebase',
  AUTH: 'auth',
  API: 'api',
  NOTIFICATION: 'notification',
  AI_SERVICE: 'ai_service'
});

const ALERT_TYPES = Object.freeze({
  INCREASED_FAILURES: 'INCREASED_FAILURES',
  HIGH_LATENCY: 'HIGH_LATENCY'
});

const ALERT_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  ALERTING: 'ALERTING'
});

// PII Redaction Regular Expressions
const PII_PATTERNS = [
  // Email addresses
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
  // Egyptian National IDs (14 digits) or SSN format (3-2-4)
  { regex: /\b[23]\d{13}\b/g, replacement: '[REDACTED_NATIONAL_ID]' },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_NATIONAL_ID]' },
  // Phone numbers (international and Egyptian formats)
  { regex: /(?:\+?20|0)?1[0125]\d{8}\b/g, replacement: '[REDACTED_PHONE]' },
  { regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  // JWT Tokens
  { regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: '[REDACTED_JWT]' },
  // Credit card numbers (13-16 digits grouped or continuous)
  { regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[REDACTED_CARD]' },
  // Passwords, tokens, keys in key-value / json string representations
  { regex: /(["']?(?:password|passwd|secret|api[_-]?key|token|auth[a-z]*|bearer)["']?\s*[:=]\s*["']?)([^"',;&\s]{3,})/gi, replacement: '$1[REDACTED_SECRET]' },
  // Date of Birth
  { regex: /(["']?(?:dob|dateofbirth|birthdate)["']?\s*[:=]\s*["']?)(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/gi, replacement: '$1[REDACTED_DOB]' },
  // Patient names in URLs or query strings
  { regex: /([?&](?:patientName|fullName|patient_name|name)=)([^&]+)/gi, replacement: '$1[REDACTED_NAME]' }
];

/**
 * Deeply redacts PII/PHI from strings, objects, arrays, and errors.
 */
function redactPii(input) {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    let result = input;
    for (const { regex, replacement } of PII_PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result;
  }

  if (Array.isArray(input)) {
    return input.map(item => redactPii(item));
  }

  if (typeof input === 'object') {
    const redactedObj = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (['password', 'secret', 'token', 'authorization', 'bearer', 'apikey', 'api_key'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_SECRET]';
      } else if (['nationalid', 'national_id', 'ssn'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_NATIONAL_ID]';
      } else if (['dob', 'dateofbirth', 'birthdate'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_DOB]';
      } else if (['patientname', 'patient_name'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_NAME]';
      } else if (['phonenumber', 'phone', 'mobile'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_PHONE]';
      } else if (['email', 'useremail'].includes(lowerKey)) {
        redactedObj[key] = '[REDACTED_EMAIL]';
      } else {
        redactedObj[key] = redactPii(value);
      }
    }
    return redactedObj;
  }

  return input;
}

/**
 * Normalizes an arbitrary error into one of the 6 canonical categories.
 */
function categorizeError(type = '', message = '', source = '') {
  const t = String(type).toLowerCase();
  const m = String(message).toLowerCase();
  const s = String(source).toLowerCase();

  if (t.includes('ai') || t.includes('gemini') || m.includes('gemini') || m.includes('triage') || m.includes('inference') || s.includes('ai')) {
    return ERROR_CATEGORIES.AI_SERVICE;
  }
  if (t.includes('notification') || t.includes('smtp') || t.includes('email') || m.includes('smtp') || m.includes('mail') || s.includes('notification')) {
    return ERROR_CATEGORIES.NOTIFICATION;
  }
  if (t.includes('auth') || t.includes('token') || m.includes('id-token') || m.includes('unauthorized') || m.includes('auth/')) {
    return ERROR_CATEGORIES.AUTH;
  }
  if (t.includes('firestore') || t.includes('firebase') || t.includes('storage') || m.includes('permission_denied') || m.includes('firestore') || s.includes('firestore')) {
    return ERROR_CATEGORIES.FIREBASE;
  }
  if (t.includes('api') || t.includes('express') || t.includes('route') || t.includes('endpoint') || s.includes('server')) {
    return ERROR_CATEGORIES.API;
  }
  return ERROR_CATEGORIES.JAVASCRIPT;
}

// In-Memory Storage & Ring Buffers
const MAX_EVENTS = 500;
const eventLogRingBuffer = [];
const activeSessions = new Map(); // sessionId -> { sessionId, userId, startedAt, lastActiveAt, hasCrashed, crashErrorIds: [] }
const requestMetricsBuffer = []; // { timestamp, durationMs, statusCode, isError }
const MAX_METRICS_WINDOW = 200;

// Service Uptime & Probes
const serviceStartTime = Date.now();
const healthProbes = []; // { timestamp, status, latencyMs }
const MAX_PROBES = 100;

// Alert Engine State
const alertState = {
  [ALERT_TYPES.INCREASED_FAILURES]: {
    state: ALERT_STATES.NORMAL,
    activeAlert: null,
    threshold: 0.10, // 10% failure rate
    consecutive5xxThreshold: 3,
    consecutive5xxCount: 0
  },
  [ALERT_TYPES.HIGH_LATENCY]: {
    state: ALERT_STATES.NORMAL,
    activeAlert: null,
    p95ThresholdMs: 2000,
    avgThresholdMs: 1200
  }
};

const alertHistory = []; // Audit log of sent alerts and recoveries
let alertNotificationListeners = []; // Subscribers (e.g. email, webhooks, console)

/**
 * Generates a distributed trace identifier.
 */
function generateTraceId() {
  return `trc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Express Middleware: Attaches or propagates traceId on every HTTP request.
 */
function traceMiddleware(req, res, next) {
  const incomingTrace = req.headers['x-trace-id'] || req.headers['x-correlation-id'];
  const traceId = (typeof incomingTrace === 'string' && incomingTrace.trim())
    ? incomingTrace.trim()
    : generateTraceId();

  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);

  // Measure latency and capture request outcome
  const startHrTime = process.hrtime();
  res.once('finish', () => {
    const elapsedDiff = process.hrtime(startHrTime);
    const durationMs = Math.round((elapsedDiff[0] * 1000) + (elapsedDiff[1] / 1e6));
    recordRequestMetric({
      timestamp: Date.now(),
      durationMs,
      statusCode: res.statusCode,
      path: req.path,
      isError: res.statusCode >= 500
    });
  });

  next();
}

/**
 * Records a measured user session.
 */
function recordSession(sessionId, userId = 'anonymous', metadata = {}) {
  if (!sessionId) return null;
  const now = Date.now();
  let session = activeSessions.get(sessionId);

  if (!session) {
    session = {
      sessionId,
      userId: redactPii(userId),
      startedAt: now,
      lastActiveAt: now,
      hasCrashed: false,
      crashErrorIds: [],
      metadata: redactPii(metadata)
    };
    activeSessions.set(sessionId, session);
  } else {
    session.lastActiveAt = now;
  }
  return session;
}

/**
 * Marks a measured session as crashed upon encountering an unhandled or critical failure.
 */
function markSessionCrashed(sessionId, errorId = null) {
  if (!sessionId) return;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.hasCrashed = true;
    if (errorId && !session.crashErrorIds.includes(errorId)) {
      session.crashErrorIds.push(errorId);
    }
  }
}

/**
 * Calculates crashFreeRate based strictly on measured sessions.
 * Returns formatted percentage string (e.g. "98.50%") or "Unavailable" if no sessions measured.
 */
function calculateCrashFreeRate() {
  const totalSessions = activeSessions.size;
  if (totalSessions === 0) {
    return 'Unavailable';
  }

  let crashedCount = 0;
  for (const session of activeSessions.values()) {
    if (session.hasCrashed) {
      crashedCount++;
    }
  }

  const crashFreePercentage = ((totalSessions - crashedCount) / totalSessions) * 100;
  return `${crashFreePercentage.toFixed(2)}%`;
}

/**
 * Records an error event across the 6 supported categories with PII redaction and trace correlation.
 */
function recordMonitoringError({
  type = 'unspecified_error',
  category = null,
  message = 'Unknown error',
  stack = null,
  source = 'server',
  lineno = null,
  colno = null,
  url = null,
  userId = 'anonymous',
  userRole = 'unknown',
  screen = 'unknown',
  environment = process.env.NODE_ENV || 'development',
  severity = 'ERROR',
  traceId = null,
  sessionId = null,
  metadata = {}
} = {}) {
  const errorId = `err_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const effectiveTraceId = traceId || generateTraceId();
  const effectiveCategory = category && Object.values(ERROR_CATEGORIES).includes(category.toLowerCase())
    ? category.toLowerCase()
    : categorizeError(type, message, source);

  // Redact all PII before persisting
  const cleanMessage = redactPii(String(message || '').substring(0, 1000));
  const cleanStack = stack ? redactPii(String(stack).substring(0, 4000)) : null;
  const cleanUrl = url ? redactPii(String(url)) : null;
  const cleanMetadata = redactPii(metadata || {});

  const record = {
    errorId,
    traceId: effectiveTraceId,
    sessionId: sessionId || null,
    category: effectiveCategory,
    type,
    message: cleanMessage,
    stack: cleanStack,
    source,
    lineno,
    colno,
    url: cleanUrl,
    userId: redactPii(userId),
    userRole,
    screen,
    environment,
    severity: String(severity).toUpperCase(),
    metadata: cleanMetadata,
    timestamp: new Date().toISOString()
  };

  // If error is critical or uncaught, mark session as crashed
  if (sessionId && (record.severity === 'CRITICAL' || type.includes('uncaught') || type.includes('unhandled'))) {
    markSessionCrashed(sessionId, errorId);
  }

  eventLogRingBuffer.unshift(record);
  if (eventLogRingBuffer.length > MAX_EVENTS) {
    eventLogRingBuffer.pop();
  }

  // Evaluate alerts if this was an API or AI-service critical failure
  if (record.severity === 'CRITICAL' || effectiveCategory === ERROR_CATEGORIES.API) {
    evaluateFailureAlerts();
  }

  return record;
}

/**
 * Tracks request latency and status code in sliding window buffer.
 */
function recordRequestMetric(metric) {
  requestMetricsBuffer.unshift(metric);
  if (requestMetricsBuffer.length > MAX_METRICS_WINDOW) {
    requestMetricsBuffer.pop();
  }

  // Update consecutive 5xx counter
  if (metric.isError) {
    alertState[ALERT_TYPES.INCREASED_FAILURES].consecutive5xxCount++;
  } else {
    alertState[ALERT_TYPES.INCREASED_FAILURES].consecutive5xxCount = 0;
  }

  // Evaluate alerts on each incoming metric
  evaluateFailureAlerts();
  evaluateLatencyAlerts();
}

/**
 * Records an uptime health probe.
 */
function recordHealthProbe(status = 'UP', latencyMs = 10) {
  healthProbes.unshift({
    timestamp: Date.now(),
    status,
    latencyMs
  });
  if (healthProbes.length > MAX_PROBES) {
    healthProbes.pop();
  }
}

/**
 * Computes uptime and latency statistics.
 */
function getUptimeMetrics() {
  const totalSeconds = Math.floor((Date.now() - serviceStartTime) / 1000);

  // Uptime percentage based on probes
  let upCount = 0;
  for (const probe of healthProbes) {
    if (probe.status === 'UP') upCount++;
  }
  const uptimePercentage = healthProbes.length > 0
    ? Number(((upCount / healthProbes.length) * 100).toFixed(2))
    : 100.0;

  // Latency metrics from sliding window
  const latencies = requestMetricsBuffer.map(m => m.durationMs).sort((a, b) => a - b);
  const totalCount = latencies.length;
  const avgLatencyMs = totalCount > 0
    ? Math.round(latencies.reduce((sum, val) => sum + val, 0) / totalCount)
    : 0;
  const p95Index = Math.floor(totalCount * 0.95);
  const p95LatencyMs = totalCount > 0 ? (latencies[p95Index] || latencies[totalCount - 1]) : 0;

  // Error rate
  const errorCount = requestMetricsBuffer.filter(m => m.isError).length;
  const failureRatePct = totalCount > 0
    ? Number(((errorCount / totalCount) * 100).toFixed(2))
    : 0.0;

  let overallStatus = 'HEALTHY';
  if (failureRatePct >= 10 || p95LatencyMs >= 2000) {
    overallStatus = 'DEGRADED';
  }
  if (failureRatePct >= 50) {
    overallStatus = 'CRITICAL';
  }

  return {
    uptimeSeconds: totalSeconds,
    uptimePercentage: `${uptimePercentage}%`,
    status: overallStatus,
    avgLatencyMs,
    p95LatencyMs,
    totalRequestsMeasured: totalCount,
    failureRatePct: `${failureRatePct}%`,
    activeAlertsCount: getActiveAlerts().length
  };
}

/**
 * Subscribes a listener to alert notifications.
 */
function onAlertNotification(listener) {
  if (typeof listener === 'function') {
    alertNotificationListeners.push(listener);
  }
}

function clearAlertNotificationListeners() {
  alertNotificationListeners = [];
}

/**
 * Dispatches notification to listeners without throwing.
 */
function notifyAlertListeners(payload) {
  for (const listener of alertNotificationListeners) {
    try {
      listener(payload);
    } catch (e) {
      console.warn('[MONITORING ALERT] Listener error:', e.message);
    }
  }
}

/**
 * Evaluates Increased Failures Alert condition with deduplication and recovery.
 */
function evaluateFailureAlerts() {
  const failureConfig = alertState[ALERT_TYPES.INCREASED_FAILURES];
  const metrics = requestMetricsBuffer.slice(0, 30);
  const total = metrics.length;
  if (total < 5) return; // Need minimal statistical sample

  const errors = metrics.filter(m => m.isError).length;
  const failureRate = errors / total;
  const isBreached = failureRate >= failureConfig.threshold || failureConfig.consecutive5xxCount >= failureConfig.consecutive5xxThreshold;

  // State Transition: NORMAL -> ALERTING
  if (isBreached && failureConfig.state === ALERT_STATES.NORMAL) {
    failureConfig.state = ALERT_STATES.ALERTING;
    const alertId = `alt_fail_${Date.now()}`;
    const alertRecord = {
      alertId,
      type: ALERT_TYPES.INCREASED_FAILURES,
      severity: 'CRITICAL',
      triggeredAt: new Date().toISOString(),
      currentValue: `${(failureRate * 100).toFixed(2)}%`,
      threshold: `${(failureConfig.threshold * 100).toFixed(2)}%`,
      consecutive5xx: failureConfig.consecutive5xxCount,
      message: `CRITICAL ALERT: Increased failure rate detected at ${(failureRate * 100).toFixed(2)}% (threshold: ${(failureConfig.threshold * 100).toFixed(2)}%).`,
      status: 'ACTIVE'
    };
    failureConfig.activeAlert = alertRecord;
    alertHistory.unshift(alertRecord);
    notifyAlertListeners({ event: 'ALERT_TRIGGERED', alert: alertRecord });
    console.error(`[MONITORING ALERT TRIGGERED] ${alertRecord.message}`);
    return;
  }

  // De-duplication: Already in ALERTING state and still breached -> DO NOT send duplicate alert!
  if (isBreached && failureConfig.state === ALERT_STATES.ALERTING) {
    // Simply update current metric value in active alert
    if (failureConfig.activeAlert) {
      failureConfig.activeAlert.currentValue = `${(failureRate * 100).toFixed(2)}%`;
      failureConfig.activeAlert.consecutive5xx = failureConfig.consecutive5xxCount;
    }
    return;
  }

  // State Transition: ALERTING -> NORMAL (Recovery)
  if (!isBreached && failureConfig.state === ALERT_STATES.ALERTING) {
    failureConfig.state = ALERT_STATES.NORMAL;
    const resolvedAt = new Date().toISOString();
    const active = failureConfig.activeAlert;
    if (active) {
      active.status = 'RESOLVED';
      active.resolvedAt = resolvedAt;
    }
    failureConfig.activeAlert = null;

    const recoveryRecord = {
      type: ALERT_TYPES.INCREASED_FAILURES,
      event: 'SERVICE_RECOVERED',
      resolvedAt,
      message: `SERVICE RECOVERED: API failure rate returned to normal (${(failureRate * 100).toFixed(2)}%). Service operating normally.`,
      relatedAlertId: active ? active.alertId : null
    };
    alertHistory.unshift(recoveryRecord);
    notifyAlertListeners({ event: 'SERVICE_RECOVERED', recovery: recoveryRecord });
    console.info(`[MONITORING RECOVERY] ${recoveryRecord.message}`);
  }
}

/**
 * Evaluates High Latency / Slowness Alert condition with deduplication and recovery.
 */
function evaluateLatencyAlerts() {
  const latencyConfig = alertState[ALERT_TYPES.HIGH_LATENCY];
  const metrics = requestMetricsBuffer.slice(0, 30);
  const total = metrics.length;
  if (total < 5) return;

  const latencies = metrics.map(m => m.durationMs).sort((a, b) => a - b);
  const avg = Math.round(latencies.reduce((sum, v) => sum + v, 0) / total);
  const p95Index = Math.floor(total * 0.95);
  const p95 = latencies[p95Index] || latencies[total - 1];

  const isBreached = p95 >= latencyConfig.p95ThresholdMs || avg >= latencyConfig.avgThresholdMs;

  // State Transition: NORMAL -> ALERTING
  if (isBreached && latencyConfig.state === ALERT_STATES.NORMAL) {
    latencyConfig.state = ALERT_STATES.ALERTING;
    const alertId = `alt_lat_${Date.now()}`;
    const alertRecord = {
      alertId,
      type: ALERT_TYPES.HIGH_LATENCY,
      severity: 'WARN',
      triggeredAt: new Date().toISOString(),
      currentAvgMs: avg,
      currentP95Ms: p95,
      thresholdP95Ms: latencyConfig.p95ThresholdMs,
      message: `PERFORMANCE ALERT: System slowness detected. p95 latency is ${p95}ms (threshold: ${latencyConfig.p95ThresholdMs}ms), avg latency is ${avg}ms.`,
      status: 'ACTIVE'
    };
    latencyConfig.activeAlert = alertRecord;
    alertHistory.unshift(alertRecord);
    notifyAlertListeners({ event: 'ALERT_TRIGGERED', alert: alertRecord });
    console.warn(`[MONITORING ALERT TRIGGERED] ${alertRecord.message}`);
    return;
  }

  // De-duplication: Already in ALERTING state -> DO NOT send duplicate alert!
  if (isBreached && latencyConfig.state === ALERT_STATES.ALERTING) {
    if (latencyConfig.activeAlert) {
      latencyConfig.activeAlert.currentAvgMs = avg;
      latencyConfig.activeAlert.currentP95Ms = p95;
    }
    return;
  }

  // State Transition: ALERTING -> NORMAL (Recovery)
  if (!isBreached && latencyConfig.state === ALERT_STATES.ALERTING) {
    latencyConfig.state = ALERT_STATES.NORMAL;
    const resolvedAt = new Date().toISOString();
    const active = latencyConfig.activeAlert;
    if (active) {
      active.status = 'RESOLVED';
      active.resolvedAt = resolvedAt;
    }
    latencyConfig.activeAlert = null;

    const recoveryRecord = {
      type: ALERT_TYPES.HIGH_LATENCY,
      event: 'SERVICE_RECOVERED',
      resolvedAt,
      message: `SERVICE RECOVERED: Latency returned to normal levels (avg: ${avg}ms, p95: ${p95}ms).`,
      relatedAlertId: active ? active.alertId : null
    };
    alertHistory.unshift(recoveryRecord);
    notifyAlertListeners({ event: 'SERVICE_RECOVERED', recovery: recoveryRecord });
    console.info(`[MONITORING RECOVERY] ${recoveryRecord.message}`);
  }
}

/**
 * Returns all active alerts.
 */
function getActiveAlerts() {
  const active = [];
  for (const config of Object.values(alertState)) {
    if (config.state === ALERT_STATES.ALERTING && config.activeAlert) {
      active.push(config.activeAlert);
    }
  }
  return active;
}

/**
 * Filterable query API for event dashboard linked through trace identifiers.
 */
function queryEvents({ category = null, traceId = null, severity = null, limit = 50 } = {}) {
  let filtered = eventLogRingBuffer;

  if (category) {
    const cat = category.toLowerCase().trim();
    filtered = filtered.filter(e => e.category === cat);
  }

  if (traceId) {
    const trc = traceId.trim();
    filtered = filtered.filter(e => e.traceId === trc);
  }

  if (severity) {
    const sev = severity.toUpperCase().trim();
    filtered = filtered.filter(e => e.severity === sev);
  }

  return filtered.slice(0, Math.min(limit, 200));
}

/**
 * Resets state (useful for test isolation).
 */
function resetMonitoringState() {
  eventLogRingBuffer.length = 0;
  activeSessions.clear();
  requestMetricsBuffer.length = 0;
  healthProbes.length = 0;
  alertHistory.length = 0;
  for (const config of Object.values(alertState)) {
    config.state = ALERT_STATES.NORMAL;
    config.activeAlert = null;
    if ('consecutive5xxCount' in config) config.consecutive5xxCount = 0;
  }
}

module.exports = {
  ERROR_CATEGORIES,
  ALERT_TYPES,
  ALERT_STATES,
  redactPii,
  categorizeError,
  generateTraceId,
  traceMiddleware,
  recordSession,
  markSessionCrashed,
  calculateCrashFreeRate,
  recordMonitoringError,
  recordRequestMetric,
  recordHealthProbe,
  getUptimeMetrics,
  onAlertNotification,
  clearAlertNotificationListeners,
  evaluateFailureAlerts,
  evaluateLatencyAlerts,
  getActiveAlerts,
  alertHistory,
  queryEvents,
  resetMonitoringState
};
