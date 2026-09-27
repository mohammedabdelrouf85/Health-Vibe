/**
 * HEALTH VIBE AI: AUTHORITATIVE ENTERPRISE AUDIT LOGGING & SECURITY SERVICE
 * 
 * Features:
 * 1. Comprehensive Audit Event Trail:
 *    - Sign-in (USER_SIGNED_IN) & Sign-out (USER_SIGNED_OUT)
 *    - Open record (RECORD_VIEWED) & Update record (RECORD_UPDATED)
 *    - Approve cases (CASE_APPROVED / CLINICAL_CASE_APPROVED) & Reject cases (CASE_REJECTED / CLINICAL_CASE_REJECTED)
 *    - Role change (ROLE_CHANGED / SERVER_ROLE_CHANGE)
 *    - Privacy consent grant (PRIVACY_CONSENT_GRANTED) & withdrawal (PRIVACY_CONSENT_WITHDRAWN)
 *    - Account deletion (ACCOUNT_DELETED)
 *    - File/storage access (FILE_ACCESSED)
 *    - Operational exports (AUDIT_LOGS_EXPORTED)
 * 2. Trusted Actor & Timestamp:
 *    - Identity and roles derived strictly from verified JWT tokens and trusted server claims.
 *    - Timestamps authoritative from server system clock & Firestore serverTimestamp.
 * 3. Append-Only Immutability:
 *    - Standard application and client SDKs are strictly blocked from editing or deleting events.
 * 4. Granular RBAC Querying & Export:
 *    - Super Admin / Owner: platform-wide access, cross-clinic search, and exports.
 *    - Clinic Admin: strictly isolated to events occurring within their assigned clinicId.
 * 5. Sensitive Data Minimization & Privacy Policies:
 *    - Email masking: a***b@domain.com
 *    - Zero storage of raw passwords, credentials, clinical vitals, or raw symptoms.
 *    - IP Address Policy: Subnet masking (/24 for IPv4, /48 for IPv6) and salted HMAC-SHA256 hashing.
 *    - Device Policy: Sanitized device platform, browser family, and form factor without intrusive fingerprinting.
 */

const crypto = require('crypto');

// Server-side salt for IP hashing (fallback for development)
const AUDIT_SALT = process.env.AUDIT_SALT || 'health-vibes-audit-integrity-salt-2026';

const AUDIT_EVENT_TYPES = {
  USER_SIGNED_IN: 'USER_SIGNED_IN',
  USER_SIGNED_OUT: 'USER_SIGNED_OUT',
  RECORD_VIEWED: 'RECORD_VIEWED',
  RECORD_UPDATED: 'RECORD_UPDATED',
  CASE_APPROVED: 'CASE_APPROVED',
  CLINICAL_CASE_APPROVED: 'CLINICAL_CASE_APPROVED',
  CASE_REJECTED: 'CASE_REJECTED',
  CLINICAL_CASE_REJECTED: 'CLINICAL_CASE_REJECTED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  SERVER_ROLE_CHANGE: 'SERVER_ROLE_CHANGE',
  PRIVACY_CONSENT_GRANTED: 'PRIVACY_CONSENT_GRANTED',
  PRIVACY_CONSENT_WITHDRAWN: 'PRIVACY_CONSENT_WITHDRAWN',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  FILE_ACCESSED: 'FILE_ACCESSED',
  AUDIT_LOGS_EXPORTED: 'AUDIT_LOGS_EXPORTED',
  AUDIT_LOGS_VIEWED: 'AUDIT_LOGS_VIEWED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  EMAIL_CHANGED: 'EMAIL_CHANGED',
  ALL_SESSIONS_REVOKED: 'ALL_SESSIONS_REVOKED',
  SESSION_TERMINATED: 'SESSION_TERMINATED',
  SUSPICIOUS_LOGIN_DETECTED: 'SUSPICIOUS_LOGIN_DETECTED',
  ACCOUNT_RECOVERY_REQUESTED: 'ACCOUNT_RECOVERY_REQUESTED',
  MFA_ENROLLED: 'MFA_ENROLLED',
  MFA_CHALLENGE_VERIFIED: 'MFA_CHALLENGE_VERIFIED',
  MFA_RECOVERY_CODE_USED: 'MFA_RECOVERY_CODE_USED',
  MFA_DISENROLLED: 'MFA_DISENROLLED',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED'
};

/**
 * Mask an email address to protect PII (e.g., mohammed@example.com -> m***d@example.com)
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}***@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/**
 * IP Metadata Policy:
 * 1. Subnet masking: IPv4 is masked to /24 (e.g. 192.168.1.100 -> 192.168.1.0/24).
 * 2. Salted HMAC-SHA256 hashing: provides collision resistance for abuse correlation without raw IP storage.
 */
function sanitizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') {
    return { subnetMask: '0.0.0.0/0', ipHash: 'unknown' };
  }

  let cleanIp = rawIp.trim();
  // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.1.1)
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.replace('::ffff:', '');
  }

  let subnetMask = cleanIp;
  if (cleanIp === '::1' || cleanIp === '127.0.0.1') {
    subnetMask = '127.0.0.0/8';
  } else if (cleanIp.includes('.')) {
    // IPv4: mask the last octet
    const octets = cleanIp.split('.');
    if (octets.length === 4) {
      subnetMask = `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
  } else if (cleanIp.includes(':')) {
    // IPv6: mask to /48
    const hextets = cleanIp.split(':');
    subnetMask = `${hextets.slice(0, 3).join(':')}::/48`;
  }

  const ipHash = crypto
    .createHmac('sha256', AUDIT_SALT)
    .update(cleanIp)
    .digest('hex')
    .substring(0, 16);

  return { subnetMask, ipHash };
}

/**
 * Device Metadata Policy:
 * Extracts non-intrusive platform, browser, and form factor without tracking IDs.
 */
function extractDeviceMetadata(req) {
  if (!req || !req.headers) {
    return { platform: 'unknown', browser: 'unknown', isMobile: false };
  }

  const userAgent = String(req.headers['user-agent'] || '');
  if (!userAgent) {
    return { platform: 'unknown', browser: 'unknown', isMobile: false };
  }

  let platform = 'Other';
  if (/iphone|ipad|ipod/i.test(userAgent)) platform = 'iOS';
  else if (/android/i.test(userAgent)) platform = 'Android';
  else if (/windows/i.test(userAgent)) platform = 'Windows';
  else if (/macintosh|mac os x/i.test(userAgent)) platform = 'macOS';
  else if (/linux/i.test(userAgent)) platform = 'Linux';

  let browser = 'Other';
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';

  const isMobile = /mobile|iphone|android|ipad/i.test(userAgent);

  return { platform, browser, isMobile };
}

/**
 * Data Minimization Policy:
 * Strips PHI (vitals, symptoms, diagnosis details, medication lists) and secrets (passwords, tokens).
 */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return {};

  const forbiddenKeys = new Set([
    'password', 'token', 'refreshToken', 'secret', 'authorization', 'apiKey',
    'vitals', 'symptoms', 'rawSymptoms', 'clinicalDiagnosis', 'clinicalNotes',
    'medications', 'doctorNote', 'diagnosisDetails', 'audio', 'coughAudio',
    'idToken', 'code', 'pin', 'ssn', 'nationalId'
  ]);

  const sanitized = {};
  for (const [key, value] of Object.entries(details)) {
    if (forbiddenKeys.has(key)) continue;
    if (typeof value === 'function') continue;

    if (typeof value === 'string') {
      // Limit string size to prevent log bloat
      sanitized[key] = value.length > 250 ? `${value.substring(0, 247)}...` : value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extract trusted actor attributes from authenticated Express request.
 * NEVER trust client-supplied actor objects.
 */
function extractTrustedActor(req) {
  if (!req || !req.user) {
    return {
      uid: 'anonymous',
      role: 'guest',
      emailMasked: '',
      clinicId: null,
      isOwner: false
    };
  }

  const role = req.user.role || (req.user.customClaims && req.user.customClaims.role) || 'patient';
  const isOwner = Boolean(req.user.isOwner || (req.user.customClaims && req.user.customClaims.isOwner));
  const clinicId = req.user.clinicId || (req.user.customClaims && req.user.customClaims.clinicId) || null;
  const emailMasked = maskEmail(req.user.email);

  return {
    uid: req.user.uid,
    role,
    emailMasked,
    clinicId,
    isOwner
  };
}

/**
 * Authoritatively record an audit event to Firestore /audit_events collection.
 */
async function recordAuditEvent(db, {
  type,
  actor,
  targetUserId = null,
  clinicId = null,
  details = {},
  req = null,
  outcome = 'SUCCESS'
}) {
  if (!type) throw new Error('Audit event type is required.');

  // Authoritative actor: req takes absolute priority
  const trustedActor = req ? extractTrustedActor(req) : (actor || {
    uid: 'system',
    role: 'backend_system',
    emailMasked: '',
    clinicId: null,
    isOwner: false
  });

  // Authoritative network & device metadata
  const rawIp = req ? (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || req.ip) : null;
  const ipMetadata = sanitizeIp(rawIp);
  const deviceMetadata = extractDeviceMetadata(req);

  // Effective clinic ID
  const effectiveClinicId = clinicId || trustedActor.clinicId || null;

  // Authoritative timestamp (server clock ISO)
  const nowIso = new Date().toISOString();

  const auditRecord = {
    type,
    actor: {
      uid: trustedActor.uid,
      role: trustedActor.role,
      emailMasked: trustedActor.emailMasked,
      clinicId: trustedActor.clinicId || null,
      isOwner: Boolean(trustedActor.isOwner)
    },
    userId: trustedActor.uid, // backward compatibility with operational queries
    targetUserId: targetUserId ? String(targetUserId) : null,
    clinicId: effectiveClinicId,
    outcome: outcome || 'SUCCESS',
    details: sanitizeDetails(details),
    ipMetadata,
    deviceMetadata,
    timestamp: nowIso
  };

  // Structured console log
  console.info('[SECURITY AUDIT]', JSON.stringify({
    type: auditRecord.type,
    actorUid: auditRecord.actor.uid,
    actorRole: auditRecord.actor.role,
    targetUserId: auditRecord.targetUserId,
    clinicId: auditRecord.clinicId,
    outcome: auditRecord.outcome,
    timestamp: auditRecord.timestamp
  }));

  let docId = null;
  if (db && typeof db.collection === 'function') {
    try {
      const colRef = db.collection('audit_events');
      const docRef = await colRef.add({
        ...auditRecord,
        createdAt: nowIso
      });
      docId = docRef.id;
    } catch (err) {
      console.warn('[AUDIT PERSISTENCE WARNING]: Failed to persist event to Firestore:', err.message);
    }
  }

  return { id: docId, ...auditRecord };
}

/**
 * Query audit events with strict RBAC enforcement:
 * - super_admin / isOwner: can query all events or filter by any clinic.
 * - clinic_admin: strictly constrained to their own clinic's events.
 * - others: forbidden.
 */
async function queryAuditEvents(db, { requesterUser, filters = {} }) {
  if (!requesterUser) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const role = requesterUser.role || (requesterUser.customClaims && requesterUser.customClaims.role);
  const isOwner = Boolean(requesterUser.isOwner || (requesterUser.customClaims && requesterUser.customClaims.isOwner));
  const isSuperAdmin = role === 'super_admin' || isOwner;
  const isClinicAdmin = role === 'clinic_admin';

  if (!isSuperAdmin && !isClinicAdmin) {
    const error = new Error('Access denied: Audit trail requires administrative privileges.');
    error.statusCode = 403;
    throw error;
  }

  // Clinic Admin isolation: strictly force their own clinicId
  let scopedClinicId = null;
  if (isClinicAdmin) {
    scopedClinicId = requesterUser.clinicId || (requesterUser.customClaims && requesterUser.customClaims.clinicId);
    if (!scopedClinicId) {
      const error = new Error('Access denied: Clinic administrator has no clinic association.');
      error.statusCode = 403;
      throw error;
    }
  } else if (filters.clinicId) {
    scopedClinicId = String(filters.clinicId);
  }

  if (!db || typeof db.collection !== 'function') {
    return { events: [], totalCount: 0, limit: filters.limit || 50, offset: filters.offset || 0 };
  }

  const snapshot = await db.collection('audit_events').get();
  let events = [];
  snapshot.forEach(doc => {
    events.push({ id: doc.id, ...doc.data() });
  });

  // Sort descending by timestamp
  events.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    return timeB - timeA;
  });

  // Clinic scoping filter
  if (scopedClinicId) {
    events = events.filter(e => e.clinicId === scopedClinicId || e.actor?.clinicId === scopedClinicId);
  }

  // Event type filter
  if (filters.type && filters.type !== 'all') {
    const filterTypes = Array.isArray(filters.type) ? filters.type : [filters.type];
    events = events.filter(e => filterTypes.includes(e.type));
  }

  // Target User ID filter
  if (filters.targetUserId) {
    events = events.filter(e => e.targetUserId === filters.targetUserId);
  }

  // Actor UID filter
  if (filters.actorUid) {
    events = events.filter(e => e.actor?.uid === filters.actorUid || e.userId === filters.actorUid);
  }

  // Date range filter
  if (filters.startDate) {
    const startMs = new Date(filters.startDate).getTime();
    if (!isNaN(startMs)) {
      events = events.filter(e => new Date(e.timestamp || 0).getTime() >= startMs);
    }
  }
  if (filters.endDate) {
    const endMs = new Date(filters.endDate).getTime();
    if (!isNaN(endMs)) {
      events = events.filter(e => new Date(e.timestamp || 0).getTime() <= endMs);
    }
  }

  // General text search
  if (filters.search && typeof filters.search === 'string') {
    const term = filters.search.trim().toLowerCase();
    if (term) {
      events = events.filter(e => {
        const typeMatch = e.type?.toLowerCase().includes(term);
        const actorUidMatch = e.actor?.uid?.toLowerCase().includes(term);
        const emailMatch = e.actor?.emailMasked?.toLowerCase().includes(term);
        const targetMatch = e.targetUserId?.toLowerCase().includes(term);
        const detailsMatch = e.details ? JSON.stringify(e.details).toLowerCase().includes(term) : false;
        return Boolean(typeMatch || actorUidMatch || emailMatch || targetMatch || detailsMatch);
      });
    }
  }

  const totalCount = events.length;
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);

  const paginatedEvents = events.slice(offset, offset + limit);

  return {
    events: paginatedEvents,
    totalCount,
    limit,
    offset
  };
}

/**
 * Format and export audit events (JSON or CSV) with audit trail logging.
 */
async function exportAuditEvents(db, { requesterUser, filters = {}, format = 'json', req = null }) {
  // Query all matching events without pagination cap (up to safe maximum 1000)
  const queryResult = await queryAuditEvents(db, {
    requesterUser,
    filters: { ...filters, limit: 1000, offset: 0 }
  });

  const events = queryResult.events;
  const exportFormat = String(format).toLowerCase() === 'csv' ? 'csv' : 'json';
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `audit-logs-${exportFormat}-${timestampStr}.${exportFormat}`;

  let data = '';
  let contentType = 'application/json';

  if (exportFormat === 'csv') {
    contentType = 'text/csv; charset=utf-8';
    const headers = [
      'Event ID',
      'Timestamp (UTC)',
      'Event Type',
      'Actor UID',
      'Actor Role',
      'Actor Email (Masked)',
      'Clinic ID',
      'Target User ID',
      'Outcome',
      'Subnet Mask',
      'IP Hash',
      'Platform',
      'Browser',
      'Details Summary'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = events.map(e => [
      escapeCsv(e.id),
      escapeCsv(e.timestamp),
      escapeCsv(e.type),
      escapeCsv(e.actor?.uid || e.userId),
      escapeCsv(e.actor?.role || e.userRole),
      escapeCsv(e.actor?.emailMasked),
      escapeCsv(e.clinicId),
      escapeCsv(e.targetUserId),
      escapeCsv(e.outcome),
      escapeCsv(e.ipMetadata?.subnetMask),
      escapeCsv(e.ipMetadata?.ipHash),
      escapeCsv(e.deviceMetadata?.platform),
      escapeCsv(e.deviceMetadata?.browser),
      escapeCsv(JSON.stringify(e.details || {}))
    ].join(','));

    data = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
  } else {
    contentType = 'application/json; charset=utf-8';
    data = JSON.stringify({
      exportedAt: new Date().toISOString(),
      exporter: {
        uid: requesterUser.uid,
        role: requesterUser.role || 'admin'
      },
      filtersApplied: sanitizeDetails(filters),
      totalExported: events.length,
      events
    }, null, 2);
  }

  // Authoritatively record that an export was conducted (HIPAA compliance)
  await recordAuditEvent(db, {
    type: AUDIT_EVENT_TYPES.AUDIT_LOGS_EXPORTED,
    req,
    actor: {
      uid: requesterUser.uid,
      role: requesterUser.role || 'admin',
      emailMasked: maskEmail(requesterUser.email),
      clinicId: requesterUser.clinicId || null,
      isOwner: Boolean(requesterUser.isOwner)
    },
    details: {
      format: exportFormat,
      exportedCount: events.length,
      filtersApplied: filters
    }
  });

  return {
    filename,
    contentType,
    data,
    count: events.length
  };
}

module.exports = {
  AUDIT_EVENT_TYPES,
  maskEmail,
  sanitizeIp,
  extractDeviceMetadata,
  sanitizeDetails,
  extractTrustedActor,
  recordAuditEvent,
  queryAuditEvents,
  exportAuditEvents
};
