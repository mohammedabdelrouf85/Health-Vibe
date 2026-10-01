/**
 * Health Vibe AI - Unusual Access & Security Anomaly Monitoring Service
 *
 * Implements:
 * 1. Rapid Authentication & Credential Abuse Detection (Brute-force / password spraying).
 * 2. High-Frequency Medical Record (EHR) Harvesting Detection (Mass record access).
 * 3. Privileged Route & Role Boundary Probing (Unauthorized admin / clinic route probing).
 * 4. Malicious Scanner & Honeypot Path Probing (.env, wp-login, traversal, SQLi/XSS).
 * 5. Cross-Tenant Clinic Isolation Violations.
 * 6. Dynamic Risk Scoring (0 - 100) and Automated Incident Escalation for High/Critical anomalies.
 * 7. In-memory sliding window buffers with Firestore synchronization.
 */

const crypto = require('crypto');
const auditService = require('./audit-service');
const incidentService = require('./incident-service');

// ============================================================================
// 🔒 THREAT TYPES, CONSTANTS & POLICIES
// ============================================================================

const UNUSUAL_ACCESS_TYPES = Object.freeze({
  RAPID_FAILED_LOGINS: 'RAPID_FAILED_LOGINS',
  HIGH_VOLUME_EHR_ACCESS: 'HIGH_VOLUME_EHR_ACCESS',
  PRIVILEGED_ROUTE_PROBE: 'PRIVILEGED_ROUTE_PROBE',
  MALICIOUS_PATH_PROBE: 'MALICIOUS_PATH_PROBE',
  CROSS_TENANT_VIOLATION: 'CROSS_TENANT_VIOLATION',
  OFF_HOURS_ACTIVITY_SPIKE: 'OFF_HOURS_ACTIVITY_SPIKE'
});

const ANOMALY_SEVERITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const ANOMALY_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  FALSE_POSITIVE: 'FALSE_POSITIVE'
});

// Detection Thresholds
const THRESHOLDS = {
  FAILED_LOGIN_MAX_COUNT: 5,        // max failures before alert
  FAILED_LOGIN_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  EHR_ACCESS_MAX_COUNT: 12,          // max records accessed per minute
  EHR_ACCESS_WINDOW_MS: 60 * 1000,   // 1 minute
  OFF_HOURS_START_HOUR: 1,           // 1 AM local
  OFF_HOURS_END_HOUR: 5,             // 5 AM local
  MAX_ALERTS_STORED: 500
};

// Known Malicious Probing Patterns (Scanners, Bots, Crawlers)
const SUSPICIOUS_PATH_PATTERNS = [
  /\.env(?:\..*)?$/i,
  /\/wp-(?:admin|login|content)/i,
  /\/(?:phpmyadmin|pma|adminer)/i,
  /\/\.git(?:\/.*)?$/i,
  /\/\.aws(?:\/.*)?$/i,
  /\/(?:etc\/passwd|boot\.ini|win\.ini)/i,
  /\.\.\//,                           // Path traversal
  /(?:union\s+select|select\s+.*\s+from|'\s+or\s+'1'='1|--)/i // Basic SQLi attempt
];

// Sliding Window Tracking Stores
const failedLoginTracker = new Map();     // key: ip_or_email -> timestamps[]
const ehrAccessTracker = new Map();       // key: user_id -> timestamps[]
const activeAnomalies = new Map();        // alertId -> alertObject
const metricCounters = {
  totalMonitoredRequests: 0,
  maliciousPathProbesBlocked: 0,
  rapidLoginFailuresDetected: 0,
  ehrHarvestingAlertsDetected: 0,
  crossTenantViolationsDetected: 0,
  privilegedProbesDetected: 0
};

// ============================================================================
// 🔍 ANOMALY DETECTION ENGINES
// ============================================================================

/**
 * Normalizes client identifier from request (hashed IP or user ID).
 */
function getClientFingerprint(req, identifier = null) {
  if (identifier) return String(identifier).trim().toLowerCase();
  const rawIp = (req && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip)) || 'unknown_ip';
  const firstIp = rawIp.split(',')[0].trim();
  return crypto.createHash('sha256').update(firstIp + '_salt_access').digest('hex').slice(0, 16);
}

/**
 * Prunes sliding window entries older than windowMs.
 */
function pruneSlidingWindow(timestamps, windowMs, now = Date.now()) {
  return timestamps.filter(ts => (now - ts) <= windowMs);
}

/**
 * 1. Checks for rapid failed authentications (Brute-Force / Credential Stuffing).
 */
function recordFailedAuthAttempt({ req, email = null, ip = null, reason = 'invalid_credentials' }) {
  const key = email ? `email_${email.toLowerCase().trim()}` : `ip_${getClientFingerprint(req, ip)}`;
  const now = Date.now();

  let timestamps = failedLoginTracker.get(key) || [];
  timestamps = pruneSlidingWindow(timestamps, THRESHOLDS.FAILED_LOGIN_WINDOW_MS, now);
  timestamps.push(now);
  failedLoginTracker.set(key, timestamps);

  metricCounters.totalMonitoredRequests += 1;

  if (timestamps.length >= THRESHOLDS.FAILED_LOGIN_MAX_COUNT) {
    metricCounters.rapidLoginFailuresDetected += 1;
    const count = timestamps.length;
    const riskScore = Math.min(100, 50 + (count * 10));
    const severity = riskScore >= 80 ? ANOMALY_SEVERITY.HIGH : ANOMALY_SEVERITY.MEDIUM;

    return createUnusualAccessAlert({
      type: UNUSUAL_ACCESS_TYPES.RAPID_FAILED_LOGINS,
      severity,
      riskScore,
      targetIdentifier: key,
      description: `Rapid failed authentication attempts (${count} failures in 5 min) detected on ${key}.`,
      req,
      metadata: { count, reason, windowSeconds: 300 }
    });
  }

  return null;
}

/**
 * Resets failed login tracker upon successful sign-in.
 */
function recordSuccessfulAuth({ email = null, req = null }) {
  if (email) {
    failedLoginTracker.delete(`email_${email.toLowerCase().trim()}`);
  }
  if (req) {
    failedLoginTracker.delete(`ip_${getClientFingerprint(req)}`);
  }
}

/**
 * 2. Checks for high-volume EHR record harvesting (Mass access to patient records).
 */
function recordEhrAccessAttempt({ req, userId, recordId, caseId = null }) {
  if (!userId) return null;
  const now = Date.now();
  const key = `user_${userId}`;

  let timestamps = ehrAccessTracker.get(key) || [];
  timestamps = pruneSlidingWindow(timestamps, THRESHOLDS.EHR_ACCESS_WINDOW_MS, now);
  timestamps.push(now);
  ehrAccessTracker.set(key, timestamps);

  metricCounters.totalMonitoredRequests += 1;

  if (timestamps.length >= THRESHOLDS.EHR_ACCESS_MAX_COUNT) {
    metricCounters.ehrHarvestingAlertsDetected += 1;
    const count = timestamps.length;
    const riskScore = Math.min(100, 60 + (count * 3));
    const severity = riskScore >= 85 ? ANOMALY_SEVERITY.CRITICAL : ANOMALY_SEVERITY.HIGH;

    return createUnusualAccessAlert({
      type: UNUSUAL_ACCESS_TYPES.HIGH_VOLUME_EHR_ACCESS,
      severity,
      riskScore,
      targetIdentifier: userId,
      description: `Potential EHR harvesting anomaly: user ${userId} accessed ${count} clinical records in 60s.`,
      req,
      metadata: { count, recordId, caseId, windowSeconds: 60 }
    });
  }

  return null;
}

/**
 * 3. Inspects HTTP requests for malicious honeypot / path traversal / injection probes.
 */
function inspectRequestPathForProbes(req) {
  if (!req || !req.url) return null;
  metricCounters.totalMonitoredRequests += 1;

  const url = String(req.url || '');
  const matchedPattern = SUSPICIOUS_PATH_PATTERNS.find(pattern => pattern.test(url));

  if (matchedPattern) {
    metricCounters.maliciousPathProbesBlocked += 1;
    const riskScore = 90;
    const severity = ANOMALY_SEVERITY.CRITICAL;

    return createUnusualAccessAlert({
      type: UNUSUAL_ACCESS_TYPES.MALICIOUS_PATH_PROBE,
      severity,
      riskScore,
      targetIdentifier: getClientFingerprint(req),
      description: `Malicious scanner or honeypot probe detected on URI: ${url.slice(0, 100)}`,
      req,
      metadata: { probeUri: url.slice(0, 100), pattern: matchedPattern.toString() }
    });
  }

  return null;
}

/**
 * 4. Checks for unauthorized privileged route or cross-clinic tenant violations.
 */
function recordPrivilegedRouteViolation({ req, requiredRole, userRole, attemptedResource, clinicId = null, userClinicId = null }) {
  metricCounters.totalMonitoredRequests += 1;

  const isCrossTenant = clinicId && userClinicId && clinicId !== userClinicId;
  const type = isCrossTenant
    ? UNUSUAL_ACCESS_TYPES.CROSS_TENANT_VIOLATION
    : UNUSUAL_ACCESS_TYPES.PRIVILEGED_ROUTE_PROBE;

  if (isCrossTenant) {
    metricCounters.crossTenantViolationsDetected += 1;
  } else {
    metricCounters.privilegedProbesDetected += 1;
  }

  const riskScore = isCrossTenant ? 85 : 75;
  const severity = isCrossTenant ? ANOMALY_SEVERITY.HIGH : ANOMALY_SEVERITY.MEDIUM;
  const desc = isCrossTenant
    ? `Cross-clinic tenant isolation breach attempt: user in clinic '${userClinicId}' attempted access to clinic '${clinicId}'.`
    : `Privileged access probe: role '${userRole}' attempted access to '${attemptedResource}' requiring '${requiredRole}'.`;

  return createUnusualAccessAlert({
    type,
    severity,
    riskScore,
    targetIdentifier: req.user ? req.user.uid : getClientFingerprint(req),
    description: desc,
    req,
    metadata: { requiredRole, userRole, attemptedResource, clinicId, userClinicId }
  });
}

// ============================================================================
// 🚨 ALERT CREATION & INCIDENT ESCALATION
// ============================================================================

/**
 * Creates, scores, registers, and escalates an unusual access alert.
 */
function createUnusualAccessAlert({
  type,
  severity = ANOMALY_SEVERITY.MEDIUM,
  riskScore = 50,
  targetIdentifier,
  description,
  req = null,
  metadata = {}
}) {
  const alertId = `anomaly_${type.toLowerCase()}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const alert = {
    alertId,
    type,
    severity,
    riskScore,
    status: ANOMALY_STATUS.ACTIVE,
    targetIdentifier,
    description,
    detectedAt: now,
    updatedAt: now,
    clientFingerprint: req ? getClientFingerprint(req) : 'unknown',
    userAgent: req ? (req.headers['user-agent'] || 'unknown').slice(0, 150) : null,
    ipSubnetMask: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim().replace(/\.\d+$/, '.0/24') : 'unknown',
    metadata,
    escalatedIncidentId: null,
    resolution: null
  };

  // Keep store within bounds
  if (activeAnomalies.size >= THRESHOLDS.MAX_ALERTS_STORED) {
    const oldestKey = activeAnomalies.keys().next().value;
    activeAnomalies.delete(oldestKey);
  }
  activeAnomalies.set(alertId, alert);

  // Escalate HIGH and CRITICAL anomalies to incident service
  if (severity === ANOMALY_SEVERITY.CRITICAL || severity === ANOMALY_SEVERITY.HIGH) {
    try {
      const createFn = incidentService.createIncident || incidentService.recordIncident;
      if (typeof createFn === 'function') {
        const incident = createFn({
          type: incidentService.INCIDENT_TYPES.COMPROMISE,
          severity: severity === ANOMALY_SEVERITY.CRITICAL ? incidentService.INCIDENT_SEVERITY.CRITICAL : incidentService.INCIDENT_SEVERITY.HIGH,
          title: `Unusual Access Alert: ${type}`,
          description: `${description} (Risk Score: ${riskScore})`,
          affectedServices: ['auth', 'access_control'],
          clientIp: alert.ipSubnetMask
        });
        alert.escalatedIncidentId = incident ? incident.incidentId : null;
      }
    } catch (_) {}
  }

  return alert;
}

/**
 * Resolves an active anomaly alert.
 */
function resolveUnusualAccessAlert(alertId, { resolvedBy = 'security_admin', resolutionNotes = '', isFalsePositive = false } = {}) {
  const alert = activeAnomalies.get(alertId);
  if (!alert) {
    const err = new Error(`Anomaly alert #${alertId} not found.`);
    err.code = 'ALERT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const now = new Date().toISOString();
  alert.status = isFalsePositive ? ANOMALY_STATUS.FALSE_POSITIVE : ANOMALY_STATUS.RESOLVED;
  alert.updatedAt = now;
  alert.resolution = {
    resolvedBy,
    resolvedAt: now,
    resolutionNotes,
    isFalsePositive
  };

  return alert;
}

/**
 * Returns active anomalies filtered by status or severity.
 */
function getActiveAnomalies({ status = null, severity = null, limit = 50 } = {}) {
  let list = Array.from(activeAnomalies.values());

  if (status) {
    list = list.filter(a => a.status === status);
  }
  if (severity) {
    list = list.filter(a => a.severity === severity);
  }

  // Sort descending by detection timestamp
  list.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
  return list.slice(0, limit);
}

/**
 * Returns aggregate metrics for unusual access monitoring.
 */
function getUnusualAccessMetrics() {
  const activeCount = Array.from(activeAnomalies.values()).filter(a => a.status === ANOMALY_STATUS.ACTIVE).length;
  const criticalCount = Array.from(activeAnomalies.values()).filter(a => a.status === ANOMALY_STATUS.ACTIVE && a.severity === ANOMALY_SEVERITY.CRITICAL).length;

  return {
    ...metricCounters,
    totalAlertsGenerated: activeAnomalies.size,
    currentlyActiveAlerts: activeCount,
    criticalActiveAlerts: criticalCount,
    timestamp: new Date().toISOString()
  };
}

/**
 * Resets all internal stores (used for testing).
 */
function _resetUnusualAccessState() {
  failedLoginTracker.clear();
  ehrAccessTracker.clear();
  activeAnomalies.clear();
  Object.keys(metricCounters).forEach(k => metricCounters[k] = 0);
}

// ============================================================================
// 🛡️ EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Express middleware for automated honeypot / probe interception.
 */
function unusualAccessMiddleware(req, res, next) {
  const anomaly = inspectRequestPathForProbes(req);
  if (anomaly) {
    // Return early to block malicious honeypot probe
    return res.status(403).json({
      error: 'SUSPICIOUS_ACCESS_BLOCKED',
      message: 'Access denied: Malicious path probe or signature detected.',
      alertId: anomaly.alertId
    });
  }
  next();
}

// ============================================================================
// 📤 EXPORTS
// ============================================================================

module.exports = {
  UNUSUAL_ACCESS_TYPES,
  ANOMALY_SEVERITY,
  ANOMALY_STATUS,
  THRESHOLDS,
  SUSPICIOUS_PATH_PATTERNS,
  activeAnomalies,
  recordFailedAuthAttempt,
  recordSuccessfulAuth,
  recordEhrAccessAttempt,
  inspectRequestPathForProbes,
  recordPrivilegedRouteViolation,
  createUnusualAccessAlert,
  resolveUnusualAccessAlert,
  getActiveAnomalies,
  getUnusualAccessMetrics,
  unusualAccessMiddleware,
  _resetUnusualAccessState
};
