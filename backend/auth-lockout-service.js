/**
 * Health Vibe AI - Enterprise Brute-Force Defense & Security Monitoring Engine
 *
 * Implements:
 * 1. Strict Consecutive Failed Login Attempt Tracking (Max 5 attempts).
 * 2. Automatic 15-Minute Temporary Lockout (Rate Limiting / Lockout, 900s).
 * 3. Security Monitoring Log Recording:
 *    - Structured audit logging to Firestore 'audit_events' & 'security_audit_logs'.
 *    - Masked PII (email masked, IP subnet masked / hashed, zero raw passwords).
 *    - Automatic escalation to Unusual Access and Incident Response services.
 * 4. Dual-Key Enforcement: Tracks by both normalized user email AND client IP.
 * 5. Automatic Sliding Window Reset on Successful Authentication.
 * 6. Super Admin Account Unlock Governance & Audit Trail.
 */

const crypto = require('crypto');

let auditService = null;
try { auditService = require('./audit-service'); } catch (_) {}

let unusualAccessService = null;
try { unusualAccessService = require('./unusual-access-service'); } catch (_) {}

let incidentService = null;
try { incidentService = require('./incident-service'); } catch (_) {}

// ============================================================================
// 🔒 CONSTANTS & THRESHOLDS (OWASP / HIPAA Enterprise Standard)
// ============================================================================

const LOCKOUT_CONFIG = Object.freeze({
  MAX_FAILED_ATTEMPTS: 5,                  // Max consecutive failures before lockout
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,    // 15 minutes lockout (900 seconds)
  ATTEMPT_WINDOW_MS: 15 * 60 * 1000,      // 15-minute rolling window for failures
  MAX_STORED_LOGS: 1000                   // Ring buffer maximum entries
});

const SECURITY_LOG_TYPES = Object.freeze({
  LOGIN_ATTEMPT_FAILED: 'LOGIN_ATTEMPT_FAILED',
  BRUTE_FORCE_LOCKOUT_TRIGGERED: 'BRUTE_FORCE_LOCKOUT_TRIGGERED',
  LOGIN_LOCKOUT_BLOCKED: 'LOGIN_LOCKOUT_BLOCKED',
  ACCOUNT_LOCKOUT_CLEARED: 'ACCOUNT_LOCKOUT_CLEARED',
  SUSPICIOUS_LOGIN_PATTERN: 'SUSPICIOUS_LOGIN_PATTERN'
});

// ============================================================================
// 📦 IN-MEMORY TRACKING STORES (Synchronized with Server Runtime)
// ============================================================================

// Key: 'email:<normalized>' or 'ip:<clean_ip>' -> LockoutRecord
const lockoutRegistry = new Map();

// In-Memory Security Monitoring Log Ring Buffer
const securityMonitoringLogs = [];

// ============================================================================
// 🛠️ SANITIZATION & NORMALIZATION UTILITIES
// ============================================================================

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return '127.0.0.1';
  let clean = rawIp.split(',')[0].trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace('::ffff:', '');
  }
  return clean;
}

function maskEmail(email) {
  if (auditService && typeof auditService.maskEmail === 'function') {
    return auditService.maskEmail(email);
  }
  if (!email || typeof email !== 'string') return '***';
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

function sanitizeIp(rawIp) {
  if (auditService && typeof auditService.sanitizeIp === 'function') {
    return auditService.sanitizeIp(rawIp);
  }
  const clean = normalizeIp(rawIp);
  const subnet = clean.includes('.') ? clean.replace(/\.\d+$/, '.0/24') : 'unknown/64';
  const hash = crypto.createHash('sha256').update(clean + '_hv_salt').digest('hex').slice(0, 16);
  return { subnetMask: subnet, ipHash: hash };
}

// ============================================================================
// 🛡️ LOCKOUT CORE ENGINE
// ============================================================================

/**
 * Checks if an email identifier or IP is currently locked out.
 * @param {string} identifier - User email or username
 * @param {string} [ip] - Client IP address
 * @returns {object} { locked: boolean, waitSec: number, lockedUntil: number, attempts: number, remainingAttempts: number }
 */
function checkLockout(identifier, ip = null) {
  const now = Date.now();
  const emailKey = identifier ? `email:${normalizeEmail(identifier)}` : null;
  const ipKey = ip ? `ip:${normalizeIp(ip)}` : null;

  // 1. Check Email Lockout Record
  if (emailKey && lockoutRegistry.has(emailKey)) {
    const record = lockoutRegistry.get(emailKey);
    if (record.lockedUntil && now < record.lockedUntil) {
      const waitSec = Math.max(Math.ceil((record.lockedUntil - now) / 1000), 1);
      return {
        locked: true,
        waitSec,
        lockedUntil: record.lockedUntil,
        attempts: record.attempts,
        remainingAttempts: 0,
        lockedType: 'email',
        key: emailKey
      };
    } else if (record.lockedUntil && now >= record.lockedUntil) {
      // Lockout duration expired: reset attempts
      record.attempts = 0;
      record.lockedUntil = 0;
      lockoutRegistry.set(emailKey, record);
    }
  }

  // 2. Check IP Lockout Record
  if (ipKey && lockoutRegistry.has(ipKey)) {
    const record = lockoutRegistry.get(ipKey);
    if (record.lockedUntil && now < record.lockedUntil) {
      const waitSec = Math.max(Math.ceil((record.lockedUntil - now) / 1000), 1);
      return {
        locked: true,
        waitSec,
        lockedUntil: record.lockedUntil,
        attempts: record.attempts,
        remainingAttempts: 0,
        lockedType: 'ip',
        key: ipKey
      };
    } else if (record.lockedUntil && now >= record.lockedUntil) {
      record.attempts = 0;
      record.lockedUntil = 0;
      lockoutRegistry.set(ipKey, record);
    }
  }

  const currentAttempts = (emailKey && lockoutRegistry.get(emailKey)?.attempts) || 0;
  return {
    locked: false,
    waitSec: 0,
    lockedUntil: 0,
    attempts: currentAttempts,
    remainingAttempts: Math.max(LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS - currentAttempts, 0),
    lockedType: null,
    key: null
  };
}

/**
 * Records a failed login attempt. If the 5th consecutive failure occurs,
 * triggers immediate 15-minute temporary lockout and emits a Security Monitoring Log event.
 *
 * @param {object} params
 * @param {string} params.email - Attempted email address
 * @param {string} [params.ip] - Client IP address
 * @param {object} [params.req] - Express request object
 * @param {string} [params.reason] - Failure reason (e.g., 'auth/wrong-password')
 * @param {string} [params.userAgent] - Browser User-Agent
 * @param {object} [params.db] - Firestore db instance
 * @returns {Promise<object>} Result status
 */
async function recordFailedAttempt({ email, ip = null, req = null, reason = 'invalid_credentials', userAgent = null, db = null }) {
  const now = Date.now();
  const cleanEmail = normalizeEmail(email);
  const cleanIp = normalizeIp(ip || (req?.headers ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip) : null));
  const effectiveAgent = userAgent || (req?.headers ? req.headers['user-agent'] : 'unknown');

  // Check if already locked out
  const existingStatus = checkLockout(cleanEmail, cleanIp);
  if (existingStatus.locked) {
    // Record rejection of attempted login during active lockout
    const logEntry = recordSecurityMonitoringLog({
      type: SECURITY_LOG_TYPES.LOGIN_LOCKOUT_BLOCKED,
      email: cleanEmail,
      ip: cleanIp,
      reason: 'attempt_while_account_locked',
      attempts: existingStatus.attempts,
      waitSec: existingStatus.waitSec,
      userAgent: effectiveAgent,
      db
    });

    return {
      locked: true,
      waitSec: existingStatus.waitSec,
      lockedUntil: existingStatus.lockedUntil,
      attempts: existingStatus.attempts,
      remainingAttempts: 0,
      alreadyLocked: true,
      logEntry
    };
  }

  // Update Failure Counters
  const keysToUpdate = [];
  if (cleanEmail) keysToUpdate.push(`email:${cleanEmail}`);
  if (cleanIp) keysToUpdate.push(`ip:${cleanIp}`);

  let triggeredLockout = false;
  let finalWaitSec = 0;
  let finalAttempts = 0;
  let lockedUntil = 0;

  for (const key of keysToUpdate) {
    const record = lockoutRegistry.get(key) || {
      attempts: 0,
      firstAttemptAt: now,
      lastAttemptAt: now,
      lockedUntil: 0,
      history: []
    };

    // Rolling window check: if last attempt was outside the window, reset count
    if (now - record.lastAttemptAt > LOCKOUT_CONFIG.ATTEMPT_WINDOW_MS) {
      record.attempts = 0;
      record.firstAttemptAt = now;
    }

    record.attempts += 1;
    record.lastAttemptAt = now;
    finalAttempts = Math.max(finalAttempts, record.attempts);

    if (record.attempts >= LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_CONFIG.LOCKOUT_DURATION_MS;
      lockedUntil = record.lockedUntil;
      triggeredLockout = true;
      finalWaitSec = Math.ceil(LOCKOUT_CONFIG.LOCKOUT_DURATION_MS / 1000);
    }

    lockoutRegistry.set(key, record);
  }

  if (triggeredLockout) {
    // 🚨 5 CONSECUTIVE FAILURES REACHED: TRIGGER SECURITY MONITORING LOG & LOCKOUT
    const secLog = await recordSecurityMonitoringLog({
      type: SECURITY_LOG_TYPES.BRUTE_FORCE_LOCKOUT_TRIGGERED,
      email: cleanEmail,
      ip: cleanIp,
      reason,
      attempts: finalAttempts,
      waitSec: finalWaitSec,
      lockedUntil: new Date(lockedUntil).toISOString(),
      userAgent: effectiveAgent,
      req,
      db
    });

    // Notify Unusual Access anomaly engine
    if (unusualAccessService && typeof unusualAccessService.recordFailedAuthAttempt === 'function') {
      try {
        unusualAccessService.recordFailedAuthAttempt({
          req,
          email: cleanEmail,
          ip: cleanIp,
          reason: `brute_force_5_consecutive_failures: ${reason}`
        });
      } catch (_) {}
    }

    // Escalate to Incident Service
    if (incidentService && typeof incidentService.createIncident === 'function') {
      try {
        incidentService.createIncident({
          type: incidentService.INCIDENT_TYPES?.COMPROMISE || 'compromise',
          severity: incidentService.INCIDENT_SEVERITY?.HIGH || 'HIGH',
          title: `Brute-Force Account Lockout Triggered: ${maskEmail(cleanEmail)}`,
          description: `5 consecutive failed login attempts detected. Temporary 15-minute lockout applied to protect credential integrity.`,
          affectedServices: ['auth', 'user_sessions'],
          clientIp: sanitizeIp(cleanIp).subnetMask
        });
      } catch (_) {}
    }

    return {
      locked: true,
      waitSec: finalWaitSec,
      lockedUntil,
      attempts: finalAttempts,
      remainingAttempts: 0,
      lockoutTriggered: true,
      logEntry: secLog
    };
  }

  // Not locked yet: return remaining attempts before lockout
  const remaining = Math.max(LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS - finalAttempts, 0);

  const warnLog = await recordSecurityMonitoringLog({
    type: SECURITY_LOG_TYPES.LOGIN_ATTEMPT_FAILED,
    email: cleanEmail,
    ip: cleanIp,
    reason,
    attempts: finalAttempts,
    remainingAttempts: remaining,
    userAgent: effectiveAgent,
    req,
    db
  });

  return {
    locked: false,
    waitSec: 0,
    lockedUntil: 0,
    attempts: finalAttempts,
    remainingAttempts: remaining,
    lockoutTriggered: false,
    logEntry: warnLog
  };
}

/**
 * Resets consecutive failed attempts and unlocks on successful authentication.
 *
 * @param {object} params
 * @param {string} params.email - Authenticated user email
 * @param {string} [params.ip] - Client IP address
 * @param {object} [params.req] - Express request object
 * @returns {object} Reset status
 */
function recordSuccessfulLogin({ email, ip = null, req = null }) {
  const cleanEmail = normalizeEmail(email);
  const cleanIp = normalizeIp(ip || (req?.headers ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip) : null));

  if (cleanEmail) {
    lockoutRegistry.delete(`email:${cleanEmail}`);
  }
  if (cleanIp) {
    lockoutRegistry.delete(`ip:${cleanIp}`);
  }

  if (unusualAccessService && typeof unusualAccessService.recordSuccessfulAuth === 'function') {
    try {
      unusualAccessService.recordSuccessfulAuth({ email: cleanEmail, req });
    } catch (_) {}
  }

  return { cleared: true, email: cleanEmail, ip: cleanIp };
}

/**
 * Super Admin Unlock Functionality: Manually clears a locked account and logs administrative action.
 *
 * @param {string} identifier - Email or IP to unlock
 * @param {string} [adminUid] - UID of the administrator unlocking the account
 * @param {object} [db] - Firestore db instance
 * @returns {Promise<object>} Unlock status
 */
async function clearLockout(identifier, adminUid = 'system', db = null) {
  const clean = normalizeEmail(identifier);
  const cleanIp = normalizeIp(identifier);

  const deletedEmail = lockoutRegistry.delete(`email:${clean}`);
  const deletedIp = lockoutRegistry.delete(`ip:${cleanIp}`);
  const deletedDirect = lockoutRegistry.delete(identifier);

  const cleared = deletedEmail || deletedIp || deletedDirect;

  // Record administrative unlock in Security Monitoring Log
  const logEntry = await recordSecurityMonitoringLog({
    type: SECURITY_LOG_TYPES.ACCOUNT_LOCKOUT_CLEARED,
    email: clean.includes('@') ? clean : null,
    ip: !clean.includes('@') ? cleanIp : null,
    adminUid,
    reason: `Administrative unlock by ${adminUid}`,
    db
  });

  return {
    cleared: true,
    target: identifier,
    adminUid,
    logEntry
  };
}

// ============================================================================
// 📝 SECURITY MONITORING LOG RECORDER
// ============================================================================

/**
 * Records an immutable security event in the Security Monitoring Log buffer & Firestore.
 */
async function recordSecurityMonitoringLog({
  type,
  email = null,
  ip = null,
  reason = 'unknown',
  attempts = 0,
  waitSec = 0,
  lockedUntil = null,
  remainingAttempts = 0,
  adminUid = null,
  userAgent = null,
  req = null,
  db = null
}) {
  const nowIso = new Date().toISOString();
  const rawIp = ip || (req?.headers ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip) : '127.0.0.1');
  const ipMeta = sanitizeIp(rawIp);
  const emailMasked = email ? maskEmail(email) : 'anonymous';

  const eventId = `sec_mon_${type.toLowerCase()}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const securityEvent = {
    eventId,
    type,
    category: 'AUTHENTICATION_ABUSE_PREVENTION',
    severity: type === SECURITY_LOG_TYPES.BRUTE_FORCE_LOCKOUT_TRIGGERED ? 'HIGH' : (type === SECURITY_LOG_TYPES.LOGIN_LOCKOUT_BLOCKED ? 'MEDIUM' : 'INFO'),
    target: {
      emailMasked,
      ipSubnet: ipMeta.subnetMask,
      ipHash: ipMeta.ipHash
    },
    consecutiveAttempts: attempts,
    threshold: LOCKOUT_CONFIG.MAX_FAILED_ATTEMPTS,
    lockoutDurationSeconds: waitSec || (type === SECURITY_LOG_TYPES.BRUTE_FORCE_LOCKOUT_TRIGGERED ? 900 : 0),
    lockedUntil: lockedUntil || null,
    remainingAttempts,
    adminUid: adminUid || null,
    reason,
    userAgent: (userAgent || 'unknown').slice(0, 150),
    timestamp: nowIso
  };

  // Keep in-memory ring buffer within size limit
  if (securityMonitoringLogs.length >= LOCKOUT_CONFIG.MAX_STORED_LOGS) {
    securityMonitoringLogs.shift();
  }
  securityMonitoringLogs.push(securityEvent);

  // Structured console log for enterprise SIEM integration
  console.info('[SECURITY MONITORING LOG]', JSON.stringify({
    eventId: securityEvent.eventId,
    type: securityEvent.type,
    severity: securityEvent.severity,
    target: securityEvent.target,
    consecutiveAttempts: securityEvent.consecutiveAttempts,
    waitSec: securityEvent.lockoutDurationSeconds,
    timestamp: securityEvent.timestamp
  }));

  // Synchronize to Firestore 'audit_events' / 'security_audit_logs' if database is available
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('security_audit_logs').add({
        ...securityEvent,
        createdAt: nowIso
      });
    } catch (err) {
      console.warn('[SECURITY MONITORING PERSISTENCE WARNING]: Failed to write to security_audit_logs:', err.message);
    }
  }

  // Also record to standard audit service if present
  if (auditService && typeof auditService.recordAuditEvent === 'function') {
    try {
      await auditService.recordAuditEvent(db, {
        type: securityEvent.type,
        actor: { uid: adminUid || 'security_engine', role: 'security_monitor', emailMasked },
        targetUserId: emailMasked,
        details: {
          consecutiveAttempts: attempts,
          lockoutDurationSeconds: securityEvent.lockoutDurationSeconds,
          reason,
          ipSubnet: ipMeta.subnetMask
        },
        outcome: type === SECURITY_LOG_TYPES.BRUTE_FORCE_LOCKOUT_TRIGGERED ? 'LOCKOUT_ACTIVATED' : 'PROCESSED'
      });
    } catch (_) {}
  }

  return securityEvent;
}

// ============================================================================
// 📊 QUERY & INSPECTION APIS
// ============================================================================

function getSecurityMonitoringLogs(filter = {}) {
  let logs = [...securityMonitoringLogs];
  if (filter.type) {
    logs = logs.filter(l => l.type === filter.type);
  }
  if (filter.severity) {
    logs = logs.filter(l => l.severity === filter.severity);
  }
  if (filter.emailMasked) {
    logs = logs.filter(l => l.target?.emailMasked === filter.emailMasked);
  }
  if (filter.limit) {
    logs = logs.slice(-filter.limit);
  }
  return logs;
}

function getActiveLockouts() {
  const now = Date.now();
  const active = [];
  for (const [key, record] of lockoutRegistry.entries()) {
    if (record.lockedUntil && now < record.lockedUntil) {
      active.push({
        key,
        attempts: record.attempts,
        waitSec: Math.ceil((record.lockedUntil - now) / 1000),
        lockedUntil: new Date(record.lockedUntil).toISOString(),
        firstAttemptAt: new Date(record.firstAttemptAt).toISOString(),
        lastAttemptAt: new Date(record.lastAttemptAt).toISOString()
      });
    }
  }
  return active;
}

function _resetStateForTesting() {
  lockoutRegistry.clear();
  securityMonitoringLogs.length = 0;
}

// ============================================================================
// 🚦 EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Express middleware that checks login lockout before routing request to authentication handlers.
 */
function authLockoutMiddleware(req, res, next) {
  const email = req.body?.email || req.query?.email || null;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip;

  const status = checkLockout(email, ip);
  if (status.locked) {
    res.setHeader('Retry-After', status.waitSec);
    return res.status(429).json({
      error: 'ACCOUNT_LOCKED',
      message: `تم قفل الحساب مؤقتاً بسبب تكرار 5 محاولات تسجيل دخول خاطئة متتالية. يرجى الانتظار ${status.waitSec} ثانية قبل إعادة المحاولة.`,
      retryAfterSeconds: status.waitSec,
      consecutiveAttempts: status.attempts,
      lockedUntil: new Date(status.lockedUntil).toISOString()
    });
  }

  next();
}

module.exports = {
  LOCKOUT_CONFIG,
  SECURITY_LOG_TYPES,
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
  clearLockout,
  recordSecurityMonitoringLog,
  getSecurityMonitoringLogs,
  getActiveLockouts,
  authLockoutMiddleware,
  normalizeEmail,
  normalizeIp,
  maskEmail,
  sanitizeIp,
  _resetStateForTesting
};
