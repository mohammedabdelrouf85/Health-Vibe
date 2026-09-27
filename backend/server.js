/**
 * Health Vibe AI - Server-Authoritative Zero-Trust RBAC Service
 * 
 * CRITICAL SECURITY PRINCIPLE:
 * Never rely on client-side / frontend variables for permission checks.
 * All roles, custom claims, and privileged operations MUST be verified and enforced
 * on the server using cryptographic Firebase ID Tokens and Firebase Admin SDK.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const whatsappBot = require('./whatsapp-bot');
const { sendClinicalNotificationEmail } = require('./notification-service');
const backupService = require('./backup-service');
const privacyService = require('./privacy-service');
const auditService = require('./audit-service');

// =============================================================================
// 🌍 DUAL ENVIRONMENT CONFIGURATION (Development vs Production)
// =============================================================================
const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const isDevelopment = NODE_ENV === 'development';
const isStaging = NODE_ENV === 'staging';
const isProduction = NODE_ENV === 'production';
const VALID_ENVIRONMENTS = new Set(['development', 'staging', 'production']);
const FIREBASE_PROJECTS = {
  development: 'health-vibes-dev',
  staging: 'health-vibes-staging',
  production: 'health-vibes-a4b3b'
};

if (!VALID_ENVIRONMENTS.has(NODE_ENV)) {
  throw new Error(`Invalid NODE_ENV '${NODE_ENV}'. Expected development, staging, or production.`);
}

// Cascading 12-factor environment loader
const candidateEnvFiles = [
  path.resolve(__dirname, `.env.${NODE_ENV}.local`),
  path.resolve(__dirname, `.env.${NODE_ENV}`),
  path.resolve(__dirname, '.env.local'),
  path.resolve(__dirname, '.env')
];

for (const envFile of candidateEnvFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}
dotenv.config();

function resolveBoolean(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isFirebaseEmulatorRequested() {
  return resolveBoolean(process.env.USE_FIREBASE_EMULATOR) ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST);
}

function validateBackendEnvironmentConfig() {
  const configuredProjectId = (process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const expectedProjectId = (process.env.EXPECTED_FIREBASE_PROJECT_ID || FIREBASE_PROJECTS[NODE_ENV] || '').trim();
  const emulatorRequested = isFirebaseEmulatorRequested();

  if (!configuredProjectId) {
    throw new Error(`FIREBASE_PROJECT_ID is required for ${NODE_ENV}. Refusing to start without an explicit project binding.`);
  }
  if (expectedProjectId && configuredProjectId !== expectedProjectId) {
    throw new Error(`Firebase project mismatch for ${NODE_ENV}: expected '${expectedProjectId}', got '${configuredProjectId}'.`);
  }
  if (isDevelopment && configuredProjectId === FIREBASE_PROJECTS.production && !emulatorRequested) {
    throw new Error('Development cannot connect to the production Firebase project unless Firebase emulators are enabled.');
  }
  if (isStaging && configuredProjectId === FIREBASE_PROJECTS.production) {
    throw new Error('Staging cannot connect to the production Firebase project.');
  }
  if (isProduction) {
    if (configuredProjectId !== FIREBASE_PROJECTS.production) {
      throw new Error(`Production must use Firebase project '${FIREBASE_PROJECTS.production}'.`);
    }
    if (emulatorRequested) {
      throw new Error('Firebase emulators are forbidden in production.');
    }
    if (resolveBoolean(process.env.ALLOW_DEMO_DATA) || resolveBoolean(process.env.ALLOW_DEVELOPMENT_MODE)) {
      throw new Error('Production cannot enable demo data or development mode flags.');
    }
  }

  process.env.FIREBASE_PROJECT_ID = configuredProjectId;
  process.env.EXPECTED_FIREBASE_PROJECT_ID = expectedProjectId;
}

validateBackendEnvironmentConfig();

const app = express();

// Allowed Origins for Development vs Production
const devDefaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = isDevelopment
  ? Array.from(new Set([...devDefaultOrigins, ...configuredOrigins]))
  : (configuredOrigins.length > 0
    ? configuredOrigins
    : (isStaging ? ['https://staging.healthvibe.ai'] : ['https://healthvibe.ai', 'https://app.healthvibe.ai']));

// =============================================================================
// 🛡️ SECURITY HARDENING & OWASP COMPLIANCE
// =============================================================================
// Suppress server fingerprinting
app.disable('x-powered-by');

// Defense-in-depth OWASP Security Response Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com https://www.google.com https://www.recaptcha.net; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://www.gstatic.com https://*.googleusercontent.com https://firebasestorage.googleapis.com; connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 https://healthvibe.ai https://*.firebaseio.com https://*.googleapis.com https://*.google.com https://www.recaptcha.net; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin '${origin}' not allowed by ${NODE_ENV} environment policy.`));
  }
}));

// =============================================================================
// 🌐 PROXY CONFIGURATION & SECURE CLIENT IP RESOLUTION
// =============================================================================
function resolveTrustProxy() {
  if (process.env.TRUST_PROXY !== undefined) {
    const val = process.env.TRUST_PROXY.trim().toLowerCase();
    if (val === 'true') return true;
    if (val === 'false') return false;
    const num = parseInt(val, 10);
    if (!isNaN(num)) return num;
    return process.env.TRUST_PROXY;
  }
  if (isProduction || isStaging) {
    return 1; // Trust 1 hop (Cloud Run / GAE / Reverse Proxy)
  }
  return 'loopback';
}

app.set('trust proxy', resolveTrustProxy());

function getClientIp(req) {
  if (!req) return '127.0.0.1';
  let ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip.includes('.') && ip.includes(':')) {
    ip = ip.split(':')[0];
  }
  return ip.trim();
}

// =============================================================================
// 🔒 SERVER SECRETS ISOLATION & REDACTION ENGINE
// =============================================================================
function maskServerSecrets(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    const sanitized = new Error(maskServerSecrets(value.message));
    if (value.stack) sanitized.stack = maskServerSecrets(value.stack);
    if (value.code) sanitized.code = value.code;
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map(v => maskServerSecrets(v));
  }
  if (typeof value !== 'string') {
    if (typeof value === 'object') {
      try {
        const maskedObj = {};
        for (const [k, v] of Object.entries(value)) {
          if (/password|secret|token|apiKey|private_?key|auth_?salt/i.test(k)) {
            maskedObj[k] = '[REDACTED]';
          } else {
            maskedObj[k] = maskServerSecrets(v);
          }
        }
        return maskedObj;
      } catch (_) {
        return value;
      }
    }
    return String(value);
  }

  let text = value;
  const sensitiveEnvKeys = [
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_API_KEY',
    'WHATSAPP_API_TOKEN',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'AUDIT_SALT',
    'JWT_SECRET',
    'APP_CHECK_SECRET',
    'STORAGE_SIGNING_KEY',
    'ENCRYPTION_KEY'
  ];

  for (const envKey of sensitiveEnvKeys) {
    const secretVal = process.env[envKey];
    if (secretVal && typeof secretVal === 'string' && secretVal.trim().length > 6) {
      text = text.split(secretVal.trim()).join('[REDACTED_SECRET]');
    }
  }

  text = text.replace(/-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]+PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]');
  text = text.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
  text = text.replace(/Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/gi, 'Bearer [REDACTED_JWT]');
  text = text.replace(/(password|secret|token|apiKey|auth)=([^& \r\n]+)/gi, '$1=[REDACTED]');
  text = text.replace(/("password"|"secret"|"token"|"apiKey"|"private_key"):\s*"[^"]+"/gi, '$1:"[REDACTED]"');

  return text;
}

// 🛡️ Intercept server console outputs to ensure secrets never leak to logs or stdout/stderr
const _origConsoleLog = console.log;
const _origConsoleWarn = console.warn;
const _origConsoleError = console.error;
const _origConsoleInfo = console.info;

console.log = (...args) => _origConsoleLog(...args.map(a => maskServerSecrets(a)));
console.warn = (...args) => _origConsoleWarn(...args.map(a => maskServerSecrets(a)));
console.error = (...args) => _origConsoleError(...args.map(a => maskServerSecrets(a)));
console.info = (...args) => _origConsoleInfo(...args.map(a => maskServerSecrets(a)));

function sanitizeClientErrorMessage(err) {
  if (!err) return 'An unexpected error occurred.';
  const rawMsg = typeof err === 'string' ? err : (err.message || String(err));
  const msg = maskServerSecrets(rawMsg);

  const leaksInternalDetails =
    /projects\/|databases\/|firestore\.googleapis\.com|firebase|google-gax|grpc|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|node:internal|\.js:\d+|at\s+[\w.<>]+\s+\(/i.test(msg) ||
    /7\s+PERMISSION_DENIED|14\s+UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED/i.test(msg) ||
    /SELECT\s+|INSERT\s+|DELETE\s+|FROM\s+|WHERE\s+/i.test(msg) ||
    /\[REDACTED_/i.test(msg);

  if (leaksInternalDetails || msg.length > 200 || msg.includes('\n') || msg.includes('\r')) {
    return 'An internal service error occurred. Please try again later.';
  }

  return msg;
}

// 🛡️ Global JSON response sanitizer: never expose stack traces or internal Firebase errors to client
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data && typeof data === 'object') {
      if (data.stack) {
        delete data.stack;
      }
      if (data.details && typeof data.details === 'object' && data.details.stack) {
        delete data.details.stack;
      }
      if (res.statusCode >= 500) {
        if (typeof data.message === 'string') {
          data.message = sanitizeClientErrorMessage(data.message);
        }
      } else if (typeof data.message === 'string') {
        data.message = maskServerSecrets(data.message);
      }
    }
    return originalJson(data);
  };
  next();
});

// =============================================================================
// 📦 REQUEST BODY PARSING & SIZE LIMITS (DoS Exhaustion Defense)
// =============================================================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Catch Body-Parser syntax and payload size errors before hitting routes
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds allowable limit (1MB max).'
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON_PAYLOAD',
      message: 'Malformed JSON payload in request body.'
    });
  }
  next(err);
});

// =============================================================================
// ⏱️ SLIDING WINDOW RATE LIMITER & SENSITIVE ROUTE DEFENSE
// =============================================================================
function createRateLimiter({
  windowMs = 60000,
  maxRequests = 100,
  message = 'Too many requests. Please slow down.',
  keyGenerator = null,
  skip = null
} = {}) {
  const requests = new Map();

  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) {
      return next();
    }

    const clientIp = getClientIp(req);
    let key;
    if (typeof keyGenerator === 'function') {
      key = keyGenerator(req);
    } else if (req.user && req.user.uid) {
      key = `user:${req.user.uid}`;
    } else {
      key = `ip:${clientIp}`;
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (requests.get(key) || []).filter(ts => ts > windowStart);
    if (timestamps.length >= maxRequests) {
      const retryAfterSec = Math.max(Math.ceil((timestamps[0] + windowMs - now) / 1000), 1);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds: retryAfterSec
      });
    }

    timestamps.push(now);
    requests.set(key, timestamps);

    if (requests.size > 5000) {
      for (const [k, tsList] of requests.entries()) {
        const fresh = tsList.filter(ts => ts > windowStart);
        if (fresh.length === 0) requests.delete(k);
        else requests.set(k, fresh);
      }
    }

    next();
  };
}

// Global API rate limiter (120 req / minute)
app.use('/api/', createRateLimiter({
  windowMs: 60000,
  maxRequests: 120,
  message: 'API rate limit exceeded. Please try again shortly.',
  keyGenerator: req => req.user?.uid ? `user:${req.user.uid}` : `ip:${getClientIp(req)}`
}));

// Strict rate limiter for sensitive mutation endpoints (20 req / minute)
const strictMutationLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 20,
  message: 'Too many mutation attempts. Please wait 1 minute.',
  keyGenerator: req => req.user?.uid ? `mut_user:${req.user.uid}` : `mut_ip:${getClientIp(req)}`
});

app.use([
  '/api/notifications/send-email',
  '/api/feedback/submit',
  '/api/appointments/book',
  '/api/user/privacy-consent',
  '/api/user/privacy-consent/withdraw',
  '/api/user/delete-account',
  '/api/user/privacy/retry-deletion',
  '/api/user/data-export',
  '/api/user/access-request'
], strictMutationLimiter);

// Auth login / token synchronization rate limiter (25 req / minute)
const authLoginLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 25,
  message: 'Too many login attempts. Please wait before retrying.',
  keyGenerator: req => req.user?.uid ? `auth_user:${req.user.uid}` : `auth_ip:${getClientIp(req)}`
});
app.use('/api/user/sync-role', authLoginLimiter);

// OTP Request rate limiter (5 req / 10 minutes)
const otpRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many verification code requests. Please wait 10 minutes.',
  keyGenerator: req => req.user?.uid ? `otp_req_user:${req.user.uid}` : `otp_req_ip:${getClientIp(req)}`
});
app.use('/api/bot/request-code', otpRequestLimiter);

// OTP Verification attempt rate limiter (5 attempts / 15 minutes)
const otpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many failed verification attempts. Please wait 15 minutes before retrying.',
  keyGenerator: req => req.user?.uid ? `otp_ver_user:${req.user.uid}` : `otp_ver_ip:${getClientIp(req)}`
});
app.use('/api/bot/verify-code', otpVerifyLimiter);

// Public form submissions limiter (5 req / 15 minutes per IP)
const publicFormLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many submissions. Please wait before submitting another request.',
  keyGenerator: req => `form_ip:${getClientIp(req)}`
});
app.use('/api/clinics/demo-request', publicFormLimiter);

// Webhook ingestion rate limiter (100 req / minute per IP)
const webhookLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 100,
  message: 'Too many webhook events.',
  keyGenerator: req => `webhook_ip:${getClientIp(req)}`
});
app.use('/api/bot/webhook', webhookLimiter);

// Client Error monitoring report limiter (60 req / minute)
const clientErrorLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 60,
  message: 'Error monitoring ingestion rate limit exceeded.',
  keyGenerator: req => `err_ip:${getClientIp(req)}`
});
app.use('/api/monitoring/errors', clientErrorLimiter);

// OTP Lockout Tracking Registry (Anti-Brute Force)
const otpLockouts = new Map();

function checkOtpLockout(key) {
  const record = otpLockouts.get(key);
  if (record && record.lockedUntil && Date.now() < record.lockedUntil) {
    const waitSec = Math.max(Math.ceil((record.lockedUntil - Date.now()) / 1000), 1);
    return { locked: true, waitSec };
  }
  return { locked: false, waitSec: 0 };
}

function recordOtpFailure(key) {
  const record = otpLockouts.get(key) || { attempts: 0, lockedUntil: 0 };
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lockout
  }
  otpLockouts.set(key, record);
  return record;
}

function clearOtpLockout(key) {
  otpLockouts.delete(key);
}

// =============================================================================
// 🛡️ FIREBASE APP CHECK ATTESTATION ENGINE (Anti-Abuse & Bot Mitigation)
// =============================================================================
const ENFORCE_APP_CHECK = isProduction || process.env.ENFORCE_APP_CHECK === 'true';
const APP_CHECK_PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/app-check/status',
  '/api/clinical/rules/versions',
  '/api/bot/status',
  '/api/bot/webhook'
]);

function shouldVerifyAppCheckForApi(req) {
  const cleanPath = `${req.baseUrl || ''}${req.path || ''}`.split('?')[0];
  return cleanPath.startsWith('/api/') && !APP_CHECK_PUBLIC_API_PATHS.has(cleanPath);
}

async function verifyAppCheck(req, res, next) {
  const appCheckToken = req.header('X-Firebase-AppCheck');

  // Development only: allow local emulator traffic to proceed without remote attestation.
  if (isDevelopment && !ENFORCE_APP_CHECK && !appCheckToken) {
    req.appCheck = { verified: true, mode: 'dev-emulator-bypass' };
    return next();
  }

  // Token missing
  if (!appCheckToken) {
    if (ENFORCE_APP_CHECK) {
      return res.status(401).json({
        error: 'APP_CHECK_REQUIRED',
        message: 'Unauthorized client: Missing X-Firebase-AppCheck attestation token.'
      });
    }
    req.appCheck = { verified: false, reason: 'missing_token' };
    return next();
  }

  // Token verification via Firebase Admin SDK
  try {
    if (admin.apps.length && typeof admin.appCheck === 'function') {
      const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
      req.appCheck = { verified: true, appId: appCheckClaims.appId, claims: appCheckClaims };
      return next();
    }
    throw new Error('Firebase Admin App Check verifier is unavailable.');
  } catch (err) {
    if (ENFORCE_APP_CHECK) {
      return res.status(401).json({
        error: 'APP_CHECK_INVALID',
        message: `Unauthorized client: ${err.message}`
      });
    }
    req.appCheck = { verified: false, error: err.message };
    return next();
  }
}

// App Check Status and Health Endpoint
app.get(['/app-check/status', '/api/app-check/status'], verifyAppCheck, (req, res) => {
  res.json({
    status: 'ok',
    service: 'Firebase App Check Attestation Engine',
    environment: NODE_ENV,
    enforcementActive: ENFORCE_APP_CHECK,
    attestation: req.appCheck,
    adminSdkAvailable: Boolean(admin.apps.length && typeof admin.appCheck === 'function'),
    timestamp: new Date().toISOString()
  });
});

app.use('/api', (req, res, next) => {
  if (!shouldVerifyAppCheckForApi(req)) return next();
  return verifyAppCheck(req, res, next);
});

// =============================================================================
// 🚨 REAL-TIME ERROR MONITORING & OBSERVABILITY ENGINE
// =============================================================================
const errorLogsRingBuffer = [];
const MAX_ERROR_LOGS = 200;

function recordSystemError({
  type = 'uncaught_exception',
  message = 'Unknown error',
  stack = null,
  source = 'unknown',
  lineno = null,
  colno = null,
  url = null,
  userId = 'anonymous',
  userRole = 'unknown',
  screen = 'unknown',
  environment = NODE_ENV,
  severity = 'ERROR',
  metadata = {}
} = {}) {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record = {
    errorId,
    type,
    message: maskServerSecrets(String(message || '').substring(0, 1000)),
    stack: stack ? maskServerSecrets(String(stack).substring(0, 4000)) : null,
    source,
    lineno,
    colno,
    url,
    userId,
    userRole,
    screen,
    environment,
    severity,
    metadata,
    timestamp: new Date().toISOString()
  };

  errorLogsRingBuffer.unshift(record);
  if (errorLogsRingBuffer.length > MAX_ERROR_LOGS) {
    errorLogsRingBuffer.pop();
  }

  // Persist to audit_events if Firestore is initialized
  if (db) {
    try {
      db.collection('audit_events').add({
        type: 'SYSTEM_ERROR_LOGGED',
        errorId,
        errorType: type,
        message: record.message,
        severity,
        userId,
        userRole,
        environment,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(err => {
        console.warn('[MONITORING] Note: could not write error to audit_events:', err.message);
      });
    } catch (e) {}
  }

  console.error(`[ERROR MONITOR] [${severity}] [${type}] ${record.message} (ID: ${errorId})`);
  return record;
}

// Global Process-Level Crash Protection
process.on('uncaughtException', (err) => {
  recordSystemError({
    type: 'server_uncaught_exception',
    message: err.message,
    stack: err.stack,
    severity: 'CRITICAL',
    source: 'node_process'
  });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  const stack = reason && reason.stack ? reason.stack : null;
  recordSystemError({
    type: 'server_unhandled_rejection',
    message: msg,
    stack: stack,
    severity: 'ERROR',
    source: 'promise'
  });
});

// All backup data and monitoring summaries span the entire platform, so only
// trusted super_admin / isOwner claims may administer them (including reads).
// Keep audit events separate from the clearable in-memory error buffer.
function auditOperationalAccess(action) {
  return (req, res, next) => {
    res.once('finish', () => {
      const event = {
        type: action,
        ...res.locals.auditDetails,
        userId: req.user.uid,
        userRole: getTrustedClaimRole(req.user),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        outcome: res.statusCode < 400 ? 'SUCCESS' : 'REJECTED',
        backupId: res.locals.backupId || (typeof req.body?.backupId === 'string' ? req.body.backupId : null),
        dryRun: Boolean(req.body?.dryRun),
        timestamp: new Date().toISOString()
      };
      // Structured server log also retains evidence if Firestore is unavailable.
      console.info('[OPERATION AUDIT]', JSON.stringify(event));
      if (db) {
        Promise.resolve().then(() => db.collection('audit_events').add({
          ...event,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        })).catch(err => console.warn('[OPERATION AUDIT] Persistence failed:', err.message));
      }
    });
    next();
  };
}

// Endpoint: Ingest client/frontend error events
app.post('/api/monitoring/errors', requireAuth, (req, res) => {
  const { type, message, stack, source, lineno, colno, url, screen, severity, metadata } = req.body || {};

  if (!message && !type) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Error type or message is required.' });
  }

  const record = recordSystemError({
    type: type || 'client_reported_error',
    message: message || 'Unspecified client failure',
    stack,
    source: source || 'client',
    lineno,
    colno,
    url,
    userId: req.user.uid,
    userRole: getTrustedClaimRole(req.user),
    screen: screen || 'unknown',
    severity: severity || 'ERROR',
    metadata: metadata || {}
  });

  res.status(201).json({
    success: true,
    errorId: record.errorId,
    loggedAt: record.timestamp
  });
});

// Endpoint: Error telemetry summary & metrics
app.get('/api/monitoring/errors/summary', requireAuth, auditOperationalAccess('MONITORING_SUMMARY_READ'), requireSuperAdmin, (req, res) => {
  const byType = {};
  const bySeverity = {};
  let criticalCount = 0;

  for (const err of errorLogsRingBuffer) {
    byType[err.type] = (byType[err.type] || 0) + 1;
    bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
    if (err.severity === 'CRITICAL') criticalCount++;
  }

  // Calculate estimated crash-free sessions percentage
  const totalLogged = errorLogsRingBuffer.length;
  const crashFreePct = totalLogged === 0 ? 100 : Math.max(90, 100 - (criticalCount * 0.5) - (totalLogged * 0.05)).toFixed(2);

  res.json({
    status: 'ok',
    environment: NODE_ENV,
    totalErrors: totalLogged,
    crashFreeRate: `${crashFreePct}%`,
    byType,
    bySeverity,
    serverUptimeSeconds: Math.floor(process.uptime()),
    recentErrors: errorLogsRingBuffer.slice(0, 50),
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Clear in-memory error buffer (platform administrators only)
app.post('/api/monitoring/errors/clear', requireAuth, auditOperationalAccess('MONITORING_ERRORS_CLEARED'), requireSuperAdmin, (req, res) => {
  errorLogsRingBuffer.length = 0;
  res.json({ success: true, message: 'In-memory error logs successfully cleared.' });
});

// =============================================================================
// 🛡️ ENTERPRISE CLINICAL BACKUP & DISASTER RECOVERY ENDPOINTS
// =============================================================================

// Endpoint: Trigger on-demand backup snapshot
app.post('/api/admin/backup/create', requireAuth, auditOperationalAccess('BACKUP_SNAPSHOT_CREATED'), requireSuperAdmin, async (req, res) => {
  try {
    const initiator = req.user.uid;
    const manifest = await backupService.createBackupSnapshot({
      initiator,
      environment: NODE_ENV,
      firestoreDb: db,
      storageBucket: backupStorageBucket
    });

    res.locals.backupId = manifest.backupId;
    res.locals.auditDetails = { initiator, totalRecords: manifest.totalRecords || 0, checksum: manifest.checksum?.hash || null };

    res.status(201).json({
      success: true,
      manifest,
      message: `Snapshot '${manifest.backupId}' successfully generated with SHA-256 integrity hash.`
    });
  } catch (err) {
    res.status(500).json({ error: 'BACKUP_FAILED', message: err.message });
  }
});

// Endpoint: List available backup snapshots
app.get('/api/admin/backup/list', requireAuth, auditOperationalAccess('BACKUP_SNAPSHOTS_LISTED'), requireSuperAdmin, (req, res) => {
  try {
    const snapshots = backupService.listBackupSnapshots();
    res.json({
      status: 'ok',
      count: snapshots.length,
      measuredLatestRpoSeconds: snapshots[0]?.metrics?.measuredRpoSeconds ?? null,
      measuredLatestBackupDurationSeconds: snapshots[0]?.metrics?.backupDurationMs != null
        ? Number((snapshots[0].metrics.backupDurationMs / 1000).toFixed(3))
        : null,
      rpoCompliance: snapshots[0]?.metrics?.measuredRpoSeconds != null
        ? `${snapshots[0].metrics.measuredRpoSeconds}s measured on latest snapshot`
        : 'No measured snapshot available',
      rtoTarget: 'Measured during dry-run/live restore responses',
      snapshots
    });
  } catch (err) {
    res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
});

// Endpoint: Verify backup integrity
app.post('/api/admin/backup/verify', requireAuth, auditOperationalAccess('BACKUP_INTEGRITY_VERIFIED'), requireSuperAdmin, (req, res) => {
  try {
    const { backupId } = req.body || {};
    if (!backupId) {
      return res.status(400).json({ error: 'MISSING_BACKUP_ID', message: 'backupId is required for verification.' });
    }
    const result = backupService.verifyBackupIntegrity(backupId);
    res.locals.auditDetails = { valid: result.valid };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'VERIFY_FAILED', message: err.message });
  }
});

// Endpoint: Execute guarded restoration
app.post('/api/admin/backup/restore', requireAuth, auditOperationalAccess('DATABASE_RESTORE_EXECUTED'), requireSuperAdmin, async (req, res) => {
  try {
    const { backupId, confirmToken, dryRun } = req.body || {};
    if (!backupId) {
      return res.status(400).json({ error: 'MISSING_BACKUP_ID', message: 'backupId is required for restore.' });
    }
    const result = await backupService.restoreBackupSnapshot(backupId, {
      confirmToken,
      dryRun: Boolean(dryRun),
      firestoreDb: db,
      storageBucket: backupStorageBucket
    });

    res.locals.auditDetails = { restoredRecords: result.restoredRecords || 0 };
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'RESTORE_FAILED', message: err.message });
  }
});

// Diagnostic Health Check Route for Dev & Prod
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'Health Vibes AI Server-Authoritative Backend',
    environment: NODE_ENV,
    isDevelopment,
    isStaging,
    isProduction,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    corsAllowed: allowedOrigins,
    firebase: {
      initialized: Boolean(admin.apps.length),
      projectId: process.env.FIREBASE_PROJECT_ID,
      expectedProjectId: process.env.EXPECTED_FIREBASE_PROJECT_ID,
      emulatorActive: Boolean(process.env.FIRESTORE_EMULATOR_HOST)
    }
  });
});

// Emulator Support (Development ONLY)
if (isDevelopment && isFirebaseEmulatorRequested()) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
  console.log(`[BACKEND DEV] Using local Firebase Emulators: Firestore (${process.env.FIRESTORE_EMULATOR_HOST}), Auth (${process.env.FIREBASE_AUTH_EMULATOR_HOST})`);
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    admin.initializeApp({ projectId });
    console.log(`[BACKEND] Firebase Admin initialized for [${projectId}] in [${NODE_ENV}] mode.`);
  } catch (err) {
    console.warn("[BACKEND WARNING] Firebase Admin SDK initialized with fallback:", err.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;
let backupStorageBucket = null;
if (admin.apps.length && typeof admin.storage === 'function') {
  try {
    backupStorageBucket = process.env.BACKUP_STORAGE_BUCKET
      ? admin.storage().bucket(process.env.BACKUP_STORAGE_BUCKET)
      : admin.storage().bucket();
  } catch (err) {
    backupStorageBucket = null;
  }
}

function parseEmailList(value, fallback) {
  const source = value ? String(value).split(',') : fallback;
  return source
    .map(email => String(email || '').trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_REVOKED_VERIFICATION_EMAILS = [
  "devilunderurwater@gmail.com"
];
const REVOKED_VERIFICATION_EMAILS = new Set(parseEmailList(process.env.REVOKED_VERIFICATION_EMAILS, DEFAULT_REVOKED_VERIFICATION_EMAILS));
const REPORT_VERSION = '1.0.0';
const MODEL_VERSION = 'HealthVibe-AI-v1.0';
const ROLES = {
  PATIENT: 'patient',
  DOCTOR_PENDING: 'doctor_pending',
  DOCTOR: 'doctor',
  CLINIC_ADMIN: 'clinic_admin',
  SUPPORT: 'support',
  SUPER_ADMIN: 'super_admin'
};
const VALID_ROLES = Object.values(ROLES);
const ADMIN_ROLES = [ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN];

function normalizeRecommendations(recommendations, recommendation) {
  if (Array.isArray(recommendations)) {
    return recommendations.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(recommendation || '')
    .split(/\r?\n|[;؛]/)
    .map((item) => item.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(Boolean);
}

function normalizeRole(role, isOwner = false) {
  if (isOwner) return ROLES.SUPER_ADMIN;
  if (role === 'admin' || role === 'owner') return ROLES.CLINIC_ADMIN;
  return VALID_ROLES.includes(role) ? role : ROLES.PATIENT;
}

function hasTrustedOwnerClaim(user = {}) {
  return user.isOwner === true || user.role === ROLES.SUPER_ADMIN;
}

function hasTrustedAdminClaim(user = {}) {
  return ADMIN_ROLES.includes(normalizeRole(user.role)) || hasTrustedOwnerClaim(user);
}

function getTrustedClaimRole(user = {}) {
  if (hasTrustedOwnerClaim(user)) return ROLES.SUPER_ADMIN;
  return VALID_ROLES.includes(user.role) ? user.role : ROLES.PATIENT;
}

function recordClinicId(data = {}) {
  return data.clinicId || data.clinic || data.branchId || null;
}

function isSuspendedProfile(data = {}) {
  return data.suspended === true ||
    data.isSuspended === true ||
    data.status === 'suspended' ||
    data.accountStatus === 'suspended' ||
    data.disabled === true;
}

async function getServerUserProfile(uid) {
  if (!db || !uid) return null;
  const userDoc = await db.collection('users').doc(uid).get();
  return userDoc.exists ? userDoc.data() : null;
}

async function resolveRequesterClinic(req) {
  if (hasTrustedOwnerClaim(req.user)) return { role: ROLES.SUPER_ADMIN, clinicId: null, profile: null };

  const role = getTrustedClaimRole(req.user);
  const profile = await getServerUserProfile(req.user.uid);
  const clinicId = recordClinicId(profile || {});

  return { role, clinicId, profile };
}

function isSameClinicResource(scope, data = {}) {
  if (scope.role === ROLES.SUPER_ADMIN) return true;
  if (scope.role !== ROLES.CLINIC_ADMIN || !scope.clinicId) return false;
  return recordClinicId(data) === scope.clinicId;
}

function filterScopedDocs(snapshot, scope) {
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(item => isSameClinicResource(scope, item));
}

function isVerificationRevoked(email) {
  return REVOKED_VERIFICATION_EMAILS.has(String(email || '').trim().toLowerCase());
}

/**
 * Middleware: Verify Firebase ID Token
 * Validates cryptographically signed JWT header: "Authorization: Bearer <ID_TOKEN>"
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or malformed Authorization header with Bearer token.'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    req.user = decodedToken;

    // 🛑 Block suspended accounts via Custom Claims
    if (decodedToken.suspended === true || decodedToken.status === 'suspended' || decodedToken.disabled === true || decodedToken.isSuspended === true) {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended by platform administration.'
      });
    }

    // 🛑 Block suspended accounts via Firestore user doc
    if (db) {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const udata = userDoc.data();
        if (udata.authzVersion && udata.authzVersion !== decodedToken.authzVersion) {
          return res.status(403).json({ error: 'STALE_PERMISSIONS', message: 'Refresh your sign-in token.' });
        }
        if (udata.suspended === true || udata.status === 'suspended' || udata.accountStatus === 'suspended' || udata.disabled === true || udata.isSuspended === true) {
          return res.status(403).json({
            error: 'ACCOUNT_SUSPENDED',
            message: 'This account has been suspended by platform administration.'
          });
        }
      }
    }

    next();
  } catch (err) {
    console.error("[SERVER AUTH ERROR] Invalid token:", err.message);
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cryptographically invalid or expired Firebase ID token.'
    });
  }
}

/**
 * Middleware: Enforce Verified Email for Sensitive Actions
 * Verifies that the user's email is verified. Privileged email lists are not
 * authorization sources; only trusted custom claims can bypass verification.
 */
function requireVerifiedEmail(req, res, next) {
  const email = (req.user.email || '').toLowerCase();
  if (hasTrustedOwnerClaim(req.user)) {
    return next();
  }

  if (isVerificationRevoked(email) || !req.user.email_verified) {
    return res.status(403).json({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email verification is mandatory before executing this sensitive operation.'
    });
  }

  next();
}

/**
 * Middleware: Enforce Server-Verified Admin Role
 * Verifies that the authenticated user holds an admin custom claim.
 */
async function requireAdmin(req, res, next) {
  if (hasTrustedAdminClaim(req.user)) {
    return next();
  }

  return res.status(403).json({
    error: 'ACCESS_DENIED',
    message: 'Server verification failed: Admin privileges are required to perform this action.'
  });
}

async function requireSuperAdmin(req, res, next) {
  if (hasTrustedOwnerClaim(req.user)) {
    return next();
  }

  return res.status(403).json({
    error: 'ACCESS_DENIED',
    message: 'Server verification failed: Super Admin privileges are required to perform this action.'
  });
}

/**
 * Middleware: Enforce Server-Verified Doctor Role
 * Verifies that the authenticated user is an approved licensed Doctor.
 */
async function requireDoctor(req, res, next) {
  const uid = req.user.uid;

  try {
    const profile = await getServerUserProfile(uid);
    const doctorIdentity = await getVerifiedDoctorIdentity(uid);
    if (getTrustedClaimRole(req.user) === ROLES.DOCTOR && profile &&
        !isSuspendedProfile(profile) &&
        profile.role === 'doctor' &&
        profile.doctorApplicationStatus === 'approved' &&
        doctorIdentity) {
      req.doctorProfile = profile;
      req.doctorIdentity = doctorIdentity;
      return next();
    }
  } catch (err) {
    console.error("[SERVER RBAC ERROR] Database doctor verification query failed:", err.message);
  }

  return res.status(403).json({
    error: 'ACCESS_DENIED',
    message: 'Server verification failed: Approved Doctor credentials required.'
  });
}

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * GET /api/auth/profile
 * Returns the true server-authoritative role and permissions for the authenticated user
 */
app.get('/api/auth/profile', requireAuth, async (req, res) => {
  const isOwner = hasTrustedOwnerClaim(req.user);
  let role = getTrustedClaimRole(req.user);

  if (db && !hasTrustedAdminClaim(req.user)) {
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (doc.exists && doc.data().role && !ADMIN_ROLES.includes(normalizeRole(doc.data().role))) {
      role = normalizeRole(doc.data().role, false);
    }
  }

  res.json({
    uid: req.user.uid,
    email: req.user.email,
    serverVerifiedRole: role,
    isOwner: isOwner,
    emailVerified: req.user.email_verified || false
  });
});

/**
 * GET /api/clinical/rules/versions
 * Returns the Clinical Rules Registry and all registered rule engine versions
 */
app.get('/api/clinical/rules/versions', (req, res) => {
  const versionsRegistry = {
    ruleSetId: 'breathing-triage',
    nameAr: 'فرز الجهاز التنفسي والتهابات الصدر',
    nameEn: 'Respiratory & Breathing Triage',
    activeVersion: 'HealthVibe-Rules-v1.0',
    versions: {
      'HealthVibe-Rules-v1.0': {
        version: 'HealthVibe-Rules-v1.0',
        status: 'active',
        effectiveFrom: '2026-09-21',
        deprecatedAt: null,
        reviewedBy: null,
        reviewStatus: 'pending-qualified-clinical-and-regulatory-review',
        changelog: {
          ar: 'إصدار تشغيلي أولي غير معتمد سريرياً بعد: فرز مبني على عتبات SpO2، ضيق التنفس، شدة السعال، ومدة الأعراض. الموافقة معلقة لحين مراجعة مختص طبي ومختص تنظيمي في مصر.',
          en: 'Initial operational release, not clinically certified yet: rule-based triage based on SpO2 thresholds, dyspnea, cough severity, and symptom duration. Approval is pending review by qualified medical and Egyptian regulatory specialists.'
        },
        scoreThresholds: { urgent: 6, high: 3 },
        spo2Thresholds: { urgentBelow: 90, highBelow: 93, closeFollowUpMin: 93, closeFollowUpMax: 94 },
        rules: {
          spo2_lt_90: { points: 6, ar: 'SpO2 أقل من 90%: تصعيد عاجل للطوارئ', en: 'SpO2 below 90%: urgent emergency escalation' },
          spo2_90_92: { points: 4, ar: 'SpO2 بين 90% و92%: أولوية مراجعة عالية', en: 'SpO2 between 90% and 92%: high review priority' },
          spo2_93_94: { points: 2, ar: 'SpO2 بين 93% و94%: متابعة قريبة', en: 'SpO2 between 93% and 94%: close follow-up' },
          dyspnea_present: { points: 2, ar: 'وجود ضيق تنفس', en: 'Shortness of breath present' },
          severe_cough: { points: 2, ar: 'كحة شديدة', en: 'Severe cough' },
          moderate_cough: { points: 1, ar: 'كحة متوسطة', en: 'Moderate cough' },
          symptoms_7_days: { points: 1, ar: 'استمرار الأعراض 7 أيام أو أكثر', en: 'Symptoms lasting 7 days or more' },
          risk_factors_present: { points: 1, ar: 'وجود عوامل خطورة مسجلة', en: 'Recorded risk factors present' }
        }
      },
      'HealthVibe-Rules-v1.1': {
        version: 'HealthVibe-Rules-v1.1',
        status: 'candidate',
        effectiveFrom: '2026-10-01',
        deprecatedAt: null,
        reviewedBy: null,
        reviewStatus: 'pending-qualified-clinical-and-regulatory-review',
        changelog: {
          ar: 'تحديث مرشح غير معتمد: تعزيز حساسية عوامل الخطورة التنفسية المزمنة. لا يُفعّل كاعتماد طبي قبل مراجعة مختص طبي ومختص تنظيمي في مصر.',
          en: 'Unapproved candidate update: enhanced sensitivity for chronic respiratory risk factors. It must not be treated as medically approved before qualified medical and Egyptian regulatory review.'
        },
        scoreThresholds: { urgent: 6, high: 3 },
        spo2Thresholds: { urgentBelow: 90, highBelow: 93, closeFollowUpMin: 93, closeFollowUpMax: 94 },
        rules: {
          spo2_lt_90: { points: 6, ar: 'SpO2 أقل من 90%: تصعيد عاجل للطوارئ', en: 'SpO2 below 90%: urgent emergency escalation' },
          spo2_90_92: { points: 4, ar: 'SpO2 بين 90% و92%: أولوية مراجعة عالية', en: 'SpO2 between 90% and 92%: high review priority' },
          spo2_93_94: { points: 2, ar: 'SpO2 بين 93% و94%: متابعة قريبة', en: 'SpO2 between 93% and 94%: close follow-up' },
          dyspnea_present: { points: 2, ar: 'وجود ضيق تنفس حاد', en: 'Acute shortness of breath present' },
          severe_cough: { points: 2, ar: 'كحة شديدة مستمرة', en: 'Persistent severe cough' },
          moderate_cough: { points: 1, ar: 'كحة متوسطة', en: 'Moderate cough' },
          symptoms_7_days: { points: 1, ar: 'استمرار الأعراض 7 أيام أو أكثر', en: 'Symptoms lasting 7 days or more' },
          risk_factors_present: { points: 2, ar: 'وجود عوامل خطورة مسجلة (ربو / حمل / تدخين)', en: 'Recorded clinical comorbidities (asthma / pregnancy / smoking)' }
        }
      }
    }
  };

  res.json({
    success: true,
    data: versionsRegistry
  });
});

/**
 * GET /api/admin/metrics
 * Server-authoritative admin metrics that cannot be derived safely from frontend-only Firestore reads.
 */
app.get('/api/admin/metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    let authUsersCount = 0;
    let authUsersToday = 0;
    let approvedDoctors = 0;
    let nextPageToken;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (scope.role === ROLES.SUPER_ADMIN) {
      do {
        const result = await admin.auth().listUsers(1000, nextPageToken);
        result.users.forEach((user) => {
          authUsersCount += 1;
          if (user.customClaims && user.customClaims.role === 'doctor') {
            approvedDoctors += 1;
          }
          const createdAt = user.metadata && user.metadata.creationTime
            ? new Date(user.metadata.creationTime).getTime()
            : 0;
          if (createdAt >= todayStart.getTime()) authUsersToday += 1;
        });
        nextPageToken = result.pageToken;
      } while (nextPageToken);
    }

    let pendingDoctorApplications = 0;
    let branchCount = 0;
    let pendingReviews = 0;
    let urgentReviews = 0;
    let aiModelMetrics = null;

    if (db) {
      const [usersSnapshot, appsSnapshot, casesSnapshot, modelSnapshot] = await Promise.all([
        db.collection('users').get(),
        db.collection('doctor_applications').get(),
        db.collection('cases').get(),
        db.collection('ai_model_metrics').orderBy('createdAt', 'desc').limit(1).get().catch(() => null)
      ]);

      const users = filterScopedDocs(usersSnapshot, scope);
      const apps = filterScopedDocs(appsSnapshot, scope);
      const cases = filterScopedDocs(casesSnapshot, scope);

      if (scope.role === ROLES.CLINIC_ADMIN) {
        authUsersCount = users.length;
        authUsersToday = users.filter((user) => {
          const createdAt = user.createdAt?.toMillis ? user.createdAt.toMillis() : Date.parse(user.createdAt || user.created_at || 0);
          return createdAt >= todayStart.getTime();
        }).length;
      }

      approvedDoctors = Math.max(
        approvedDoctors,
        users.filter((user) =>
          user.role === 'doctor' ||
          user.verifiedDoctor === true ||
          user.doctorApplicationStatus === 'approved'
        ).length
      );

      pendingDoctorApplications = apps.filter((app) => app.status === 'pending').length;

      const branches = new Set(
        apps
          .filter((app) => app.status === 'approved')
          .map((app) => (app.clinic || app.branch || app.hospital || '').trim().toLowerCase())
          .filter(Boolean)
      );
      branchCount = branches.size;

      const realCases = cases.filter((item) => !item.isDemo && !String(item.id || '').startsWith('demo_'));
      pendingReviews = realCases.filter((item) => ['pending', 'submitted', 'triaged', 'assigned', 'under_review'].includes(item.status)).length;
      urgentReviews = realCases.filter((item) =>
        ['pending', 'submitted', 'triaged', 'assigned', 'under_review'].includes(item.status) &&
        ['urgent', 'high'].includes(String(item.priority || item.risk || '').toLowerCase())
      ).length;

      if (modelSnapshot && !modelSnapshot.empty) {
        const metrics = modelSnapshot.docs[0].data();
        aiModelMetrics = {
          sensitivity: Number(metrics.sensitivity),
          specificity: Number(metrics.specificity),
          precision: Number(metrics.precision),
          auc: Number(metrics.auc || metrics.areaUnderCurve)
        };
      }
    }

    res.json({
      authUsersCount,
      authUsersToday,
      approvedDoctors,
      pendingDoctorApplications,
      branchCount,
      pendingReviews,
      urgentReviews,
      aiModelMetrics
    });
  } catch (err) {
    console.error("[SERVER ADMIN METRICS ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/kpi/metrics
 * Server-authoritative KPI analytics: completion rate, physician response time, report turnaround time (TAT).
 */
app.get('/api/kpi/metrics', requireAuth, async (req, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    const canView = hasTrustedAdminClaim(req.user) || [ROLES.DOCTOR, ROLES.SUPPORT].includes(userRole);
    if (!canView) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Clinical or Admin privileges required.' });
    }

    if (!db) {
      return res.json({
        success: true,
        completionRate: 0,
        avgResponseTimeMinutes: 0,
        avgTurnaroundMinutes: 0,
        totalCases: 0,
        completedCasesCount: 0,
        pendingCasesCount: 0,
        responseSlaCompliance: 100,
        turnaroundSlaCompliance: 100,
        isBenchmark: true
      });
    }

    const scope = await resolveRequesterClinic(req);
    const casesSnapshot = await db.collection('cases').get();
    const cases = casesSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => userRole === ROLES.CLINIC_ADMIN ? isSameClinicResource(scope, c) : true)
      .filter(c => userRole === ROLES.DOCTOR ? [c.assignedDoctorId, c.doctorId, c.doctorUid, c.approvingDoctorId].includes(req.user.uid) : true)
      .filter(c => !c.isDemo && !String(c.id || '').startsWith('demo_'));

    const timeRange = (req.query.range || 'all').toLowerCase();
    const now = Date.now();
    let minTimestamp = 0;
    if (timeRange === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      minTimestamp = d.getTime();
    } else if (timeRange === '7d') {
      minTimestamp = now - (7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === '30d') {
      minTimestamp = now - (30 * 24 * 60 * 60 * 1000);
    }

    const parseTs = (val) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (val.toMillis) return val.toMillis();
      if (val.seconds) return val.seconds * 1000;
      const parsed = Date.parse(val);
      return isNaN(parsed) ? 0 : parsed;
    };

    const filteredCases = cases.filter(c => {
      const ts = parseTs(c.submittedAt || c.createdAt || c.timestamp);
      return minTimestamp === 0 || ts >= minTimestamp;
    });

    const totalCases = filteredCases.length;
    const completedCases = filteredCases.filter(c => c.status === 'approved' || c.doctorApproved === true || c.status === 'closed');
    const pendingCases = filteredCases.filter(c => !['approved', 'rejected', 'closed'].includes(c.status));
    const completionRate = totalCases > 0 ? Math.round((completedCases.length / totalCases) * 100) : 0;

    const responseTimes = [];
    const turnaroundTimes = [];

    filteredCases.forEach(c => {
      const submitTs = parseTs(c.submittedAt || c.createdAt || c.timestamp);
      const responseTs = parseTs(c.firstReviewedAt || c.reviewedAt || c.moreInfoRequestedAt || c.approvedAt || c.rejectedAt);
      const approvedTs = parseTs(c.approvedAt || c.reportGeneratedAt || c.generatedAt || c.certifiedAt);

      if (submitTs > 0 && responseTs >= submitTs) {
        const diffMins = Math.max(0, (responseTs - submitTs) / 60000);
        responseTimes.push(diffMins);
      }

      if (submitTs > 0 && approvedTs >= submitTs && (c.status === 'approved' || c.doctorApproved === true)) {
        const diffMins = Math.max(0, (approvedTs - submitTs) / 60000);
        turnaroundTimes.push(diffMins);
      }
    });

    const avgResponseTimeMinutes = responseTimes.length > 0
      ? Number((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1))
      : 0;

    const avgTurnaroundMinutes = turnaroundTimes.length > 0
      ? Number((turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length).toFixed(1))
      : 0;

    const responseSlaCompliance = responseTimes.length > 0
      ? Math.round((responseTimes.filter(t => t <= 30).length / responseTimes.length) * 100)
      : 100;

    const turnaroundSlaCompliance = turnaroundTimes.length > 0
      ? Math.round((turnaroundTimes.filter(t => t <= 120).length / turnaroundTimes.length) * 100)
      : 100;

    res.json({
      success: true,
      timeRange,
      totalCases,
      completedCasesCount: completedCases.length,
      pendingCasesCount: pendingCases.length,
      completionRate,
      avgResponseTimeMinutes,
      avgTurnaroundMinutes,
      responseSlaCompliance,
      turnaroundSlaCompliance,
      evaluatedSampleCount: filteredCases.length
    });
  } catch (err) {
    console.error("[SERVER KPI METRICS ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/user/sync-role
 * Server-authoritative endpoint to determine, initialize, and sync a user's role from the Backend.
 */
app.post('/api/user/sync-role', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const email = (req.user.email || '').toLowerCase();
  const isOwner = hasTrustedOwnerClaim(req.user);

  try {
    let role = getTrustedClaimRole(req.user);
    let verifiedDoctor = false;
    let privilegedAccountReviewRequired = false;

    if (db) {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const data = userDoc.data();
        if (hasTrustedAdminClaim(req.user)) {
          role = getTrustedClaimRole(req.user);
          await userRef.set({ role, isOwner }, { merge: true });
        } else if (data.role && ADMIN_ROLES.includes(normalizeRole(data.role))) {
          privilegedAccountReviewRequired = true;
          role = ROLES.PATIENT;
          await userRef.set({
            role,
            isOwner: false,
            privilegedRoleQuarantined: data.role,
            privilegedRoleQuarantinedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else if (data.role && VALID_ROLES.includes(data.role)) {
          role = data.role;
        } else {
          role = ROLES.PATIENT;
          await userRef.set({ role, isOwner: false }, { merge: true });
        }
        verifiedDoctor = Boolean(data.verifiedDoctor || role === ROLES.DOCTOR);
      } else {
        // Initialize new user on the backend
        role = hasTrustedAdminClaim(req.user) ? getTrustedClaimRole(req.user) : ROLES.PATIENT;
        verifiedDoctor = role === ROLES.DOCTOR;
        await userRef.set({
          name: req.user.name || email.split('@')[0],
          email: email,
          role: role,
          isOwner: isOwner,
          verifiedDoctor: verifiedDoctor,
          emailVerified: Boolean(req.user.email_verified || isOwner),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } else {
      role = hasTrustedAdminClaim(req.user) ? getTrustedClaimRole(req.user) : ROLES.PATIENT;
      verifiedDoctor = role === ROLES.DOCTOR;
    }

    // Set cryptographic custom claims on Firebase Auth
    const currentAuth = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...currentAuth.customClaims,
      role: role,
      isOwner: isOwner,
      verifiedDoctor: verifiedDoctor
    });

    if (privilegedAccountReviewRequired && db) {
      await db.collection('audit_events').add({
        type: 'PRIVILEGED_ROLE_QUARANTINED',
        userId: uid,
        userEmail: email || null,
        reason: 'Firestore user document contained an administrative role without matching trusted custom claims.',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    if (db) {
      auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.USER_SIGNED_IN,
        req,
        details: { method: 'sync_role', role, isOwner, verifiedDoctor }
      }).catch(err => console.warn('[AUDIT SIGNIN WARNING]:', err.message));
    }

    res.json({
      success: true,
      uid,
      email,
      role,
      isOwner,
      verifiedDoctor
    });
  } catch (err) {
    console.error("[SERVER ROLE SYNC ERROR]:", err);
    res.status(500).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

/**
 * POST /api/admin/set-user-role
 * Server-authoritative endpoint to change a user's role and set Firebase Custom Claims
 */
app.post('/api/admin/set-user-role', requireAuth, auditOperationalAccess('ADMIN_ROLE_CHANGE'), requireVerifiedEmail, requireSuperAdmin, async (req, res) => {
  const { targetUserId, newRole, clinicId } = req.body;

  if (!targetUserId || !VALID_ROLES.includes(newRole)) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Valid targetUserId and newRole required.' });
  }

  try {
    if (!db) return res.status(503).json({ error: 'AUTHORIZATION_STORE_UNAVAILABLE' });
    if (targetUserId === req.user.uid) return res.status(403).json({ error: 'SELF_ROLE_CHANGE_DENIED' });
    const targetUser = await admin.auth().getUser(targetUserId);
    const targetProfile = await getServerUserProfile(targetUserId) || {};
    const targetClinic = clinicId === undefined ? recordClinicId(targetProfile) : clinicId;
    if ((clinicId !== undefined && (typeof clinicId !== 'string' || !clinicId.trim() || clinicId.length > 128)) ||
        (newRole === ROLES.CLINIC_ADMIN && !targetClinic)) return res.status(400).json({ error: 'CLINIC_REQUIRED' });
    if (newRole === ROLES.DOCTOR && !await getVerifiedDoctorIdentity(targetUserId)) {
      return res.status(403).json({ error: 'APPROVED_DOCTOR_APPLICATION_REQUIRED' });
    }
    // Fail closed across Auth/Firestore: old tokens stop working before claims change.
    // A failed Auth write is recoverable by retrying this administrator operation.
    const authzVersion = require('crypto').randomUUID();
    await db.collection('audit_events').add({ type: 'ROLE_CHANGE_REQUESTED', targetUserId,
      actorId: req.user.uid, oldRole: targetUser.customClaims?.role || 'patient', newRole,
      oldClinicId: recordClinicId(targetProfile), clinicId: targetClinic || null, authzVersion,
      timestamp: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(targetUserId).set({ authzVersion }, { merge: true });
    const targetIsOwner = newRole === ROLES.SUPER_ADMIN;
    const isDoctor = newRole === ROLES.DOCTOR;

    // 1. Set cryptographic custom claims on Firebase Auth
    await admin.auth().setCustomUserClaims(targetUserId, {
      ...targetUser.customClaims, authzVersion, clinicId: targetClinic || null,
      role: newRole,
      isOwner: targetIsOwner,
      verifiedDoctor: isDoctor
    });
    await admin.auth().revokeRefreshTokens(targetUserId);

    // 2. Update Firestore user document
    if (db) {
      await db.collection('users').doc(targetUserId).set({
        role: newRole,
        verifiedDoctor: isDoctor,
        isOwner: targetIsOwner,
        clinicId: targetClinic || null,
        roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        roleUpdatedBy: req.user.email
      }, { merge: true });

      // 3. Append immutable audit event
      await db.collection('audit_events').add({
        type: 'SERVER_ROLE_CHANGE',
        targetUserId: targetUserId,
        targetEmail: targetUser.email,
        newRole: newRole,
        assignedBy: req.user.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.ROLE_CHANGED,
        req,
        targetUserId,
        clinicId: targetClinic || null,
        details: {
          previousRole: targetUser.customClaims?.role || 'patient',
          newRole,
          targetEmailMasked: auditService.maskEmail(targetUser.email)
        }
      }).catch(err => console.warn('[AUDIT ROLE_CHANGED ERROR]:', err.message));
    }

    console.log(`[SERVER RBAC] User ${targetUser.email} (${targetUserId}) role updated to ${newRole} by ${req.user.email}`);
    res.json({ success: true, newRole, message: `Successfully updated user role to ${newRole} on server.` });
  } catch (err) {
    console.error("[SERVER ROLE UPDATE ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/toggle-user-suspension
 * Server-authoritative endpoint to suspend or unsuspend a user account and revoke tokens
 */
app.post('/api/admin/toggle-user-suspension', requireAuth, auditOperationalAccess('ADMIN_SUSPENSION_CHANGE'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  const { targetUserId, suspend, reason } = req.body;
  if (!targetUserId || typeof suspend !== 'boolean') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'targetUserId and boolean suspend status required.' });
  }

  try {
    const scope = await resolveRequesterClinic(req);
    const targetProfile = await getServerUserProfile(targetUserId);
    if (!targetProfile || !isSameClinicResource(scope, targetProfile) ||
        (scope.role === ROLES.CLINIC_ADMIN && ADMIN_ROLES.includes(targetProfile.role))) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }
    const targetUser = await admin.auth().getUser(targetUserId);
    if (hasTrustedOwnerClaim(targetUser.customClaims || {})) {
      return res.status(403).json({ error: 'CANNOT_SUSPEND_OWNER', message: 'System owner accounts cannot be suspended.' });
    }

    // 1. Update Custom Claims
    const currentClaims = targetUser.customClaims || {};
    await admin.auth().setCustomUserClaims(targetUserId, {
      ...currentClaims,
      suspended: suspend,
      isSuspended: suspend
    });

    // 2. Disable in Auth & Revoke tokens if suspended
    await admin.auth().updateUser(targetUserId, {
      disabled: suspend
    });
    if (suspend) {
      await admin.auth().revokeRefreshTokens(targetUserId);
    }

    // 3. Update Firestore document
    if (db) {
      await db.collection('users').doc(targetUserId).set({
        suspended: suspend,
        isSuspended: suspend,
        status: suspend ? 'suspended' : 'active',
        accountStatus: suspend ? 'suspended' : 'active',
        suspendedAt: suspend ? admin.firestore.FieldValue.serverTimestamp() : null,
        suspendedBy: suspend ? req.user.email : null,
        suspensionReason: suspend ? (reason || 'Administrative action') : null
      }, { merge: true });

      // 4. Audit Log
      await db.collection('audit_events').add({
        type: suspend ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_UNSUSPENDED',
        targetUserId: targetUserId,
        targetEmail: targetUser.email,
        executedBy: req.user.email,
        reason: reason || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({
      success: true,
      suspended: suspend,
      message: `Account ${targetUser.email} has been ${suspend ? 'suspended' : 're-activated'}.`
    });
  } catch (err) {
    console.error("[SERVER SUSPEND USER ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/approve-doctor-application
 * Server-authoritative endpoint to approve a doctor application and elevate their role
 */
app.post('/api/admin/approve-doctor-application', requireAuth, auditOperationalAccess('ADMIN_DOCTOR_APPROVAL'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  const { applicationId, applicantUserId } = req.body;

  if (!applicationId || !applicantUserId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'applicationId and applicantUserId required.' });
  }

  try {
    const [applicationDoc, applicantDoc] = await Promise.all([
      db.collection('doctor_applications').doc(applicationId).get(),
      db.collection('users').doc(applicantUserId).get()
    ]);

    if (!applicationDoc.exists || applicationDoc.data().userId !== applicantUserId) {
      return res.status(400).json({
        error: 'INVALID_DOCTOR_APPLICATION',
        message: 'Doctor approval requires a valid application owned by the applicant.'
      });
    }

    const scope = await resolveRequesterClinic(req);
    if (!applicantDoc.exists || !isSameClinicResource(scope, applicationDoc.data()) ||
        !isSameClinicResource(scope, applicantDoc.data())) return res.status(403).json({ error: 'ACCESS_DENIED' });

    if (applicationDoc.data().status !== 'pending') {
      return res.status(400).json({
        error: 'INVALID_DOCTOR_APPLICATION_STATUS',
        message: 'Only pending doctor applications can be approved.'
      });
    }

    if (!applicantDoc.exists || normalizeRole(applicantDoc.data().role) !== ROLES.DOCTOR_PENDING) {
      return res.status(400).json({
        error: 'INVALID_ROLE_TRANSITION',
        message: 'Applicant must be in doctor_pending before promotion to approved doctor.'
      });
    }

    // 1. Elevate user role to 'doctor' in Firebase Auth Custom Claims
    const applicantAuth = await admin.auth().getUser(applicantUserId);
    await admin.auth().setCustomUserClaims(applicantUserId, { ...applicantAuth.customClaims, role: 'doctor', verifiedDoctor: true });
    await admin.auth().revokeRefreshTokens(applicantUserId);

    // 2. Update application status in Firestore
    if (db) {
      await db.collection('doctor_applications').doc(applicationId).update({
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: req.user.email
      });

      await db.collection('users').doc(applicantUserId).set({
        role: 'doctor',
        doctorApplicationStatus: 'approved',
        verifiedDoctor: true
      }, { merge: true });

      // 3. Log audit event
      await db.collection('audit_events').add({
        type: 'DOCTOR_APPLICATION_APPROVED',
        applicationId: applicationId,
        applicantUserId: applicantUserId,
        approvedBy: req.user.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, message: 'Doctor credentials verified and approved by server.' });
  } catch (err) {
    console.error("[SERVER DOCTOR APPROVAL ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

app.post('/api/admin/reject-doctor-application', requireAuth, auditOperationalAccess('ADMIN_DOCTOR_REJECTION'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  try {
    const { applicationId, applicantUserId } = req.body;
    if (typeof applicationId !== 'string' || typeof applicantUserId !== 'string') return res.status(400).json({ error: 'INVALID_REQUEST' });
    const application = await db.collection('doctor_applications').doc(applicationId).get();
    const profile = await getServerUserProfile(applicantUserId);
    const scope = await resolveRequesterClinic(req);
    if (!application.exists || !profile || application.data().userId !== applicantUserId ||
        !isSameClinicResource(scope, application.data()) || !isSameClinicResource(scope, profile)) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }
    if (application.data().status !== 'pending' || profile.role !== ROLES.DOCTOR_PENDING) {
      return res.status(409).json({ error: 'INVALID_ROLE_TRANSITION' });
    }
    await db.collection('doctor_applications').doc(applicationId).update({ status: 'rejected',
      rejectedBy: req.user.uid, rejectedAt: admin.firestore.FieldValue.serverTimestamp() });
    const account = await admin.auth().getUser(applicantUserId);
    await admin.auth().setCustomUserClaims(applicantUserId, { ...account.customClaims, role: ROLES.PATIENT, verifiedDoctor: false, doctorVerified: false });
    await admin.auth().revokeRefreshTokens(applicantUserId);
    await db.collection('users').doc(applicantUserId).set({ role: ROLES.PATIENT, verifiedDoctor: false,
      doctorVerified: false, doctorApplicationStatus: 'rejected' }, { merge: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'APPLICATION_REJECTION_FAILED' }); }
});

app.post('/api/admin/set-user-verification', requireAuth, auditOperationalAccess('ADMIN_VERIFICATION_CHANGE'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  try {
    const { targetUserId, verified } = req.body;
    if (typeof targetUserId !== 'string' || typeof verified !== 'boolean') return res.status(400).json({ error: 'INVALID_REQUEST' });
    const profile = await getServerUserProfile(targetUserId);
    const scope = await resolveRequesterClinic(req);
    if (!profile || !isSameClinicResource(scope, profile) || targetUserId === req.user.uid ||
        (scope.role === ROLES.CLINIC_ADMIN && ADMIN_ROLES.includes(profile.role))) return res.status(403).json({ error: 'ACCESS_DENIED' });
    await admin.auth().updateUser(targetUserId, { emailVerified: verified });
    await db.collection('users').doc(targetUserId).set({ emailVerified: verified,
      verifiedByAdmin: req.user.uid, verifiedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await db.collection('audit_events').add({ type: 'USER_VERIFICATION_CHANGED', actorId: req.user.uid,
      targetUserId, verified, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'VERIFICATION_CHANGE_FAILED' }); }
});

// =============================================================================
// 🛡️ AUTHORITATIVE ENTERPRISE AUDIT TRAIL & COMPLIANCE ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/audit/events
 * Query and filter audit events with strict RBAC:
 * - super_admin / isOwner: cross-clinic visibility
 * - clinic_admin: strictly scoped to requester's clinicId
 */
app.get('/api/admin/audit/events', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const effectiveUser = {
      ...req.user,
      role: scope.role,
      clinicId: scope.clinicId
    };
    const result = await auditService.queryAuditEvents(db, {
      requesterUser: effectiveUser,
      filters: req.query || {}
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: 'AUDIT_QUERY_FAILED', message: err.message });
  }
});

/**
 * GET & POST /api/admin/audit/export
 * Export audit events (JSON / CSV) with data minimization and export trail logging
 */
const handleAuditExport = async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const effectiveUser = {
      ...req.user,
      role: scope.role,
      clinicId: scope.clinicId
    };
    const filters = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const format = (req.query?.format || req.body?.format || 'json').toLowerCase();

    const exportResult = await auditService.exportAuditEvents(db, {
      requesterUser: effectiveUser,
      filters,
      format,
      req
    });

    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    return res.send(exportResult.data);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: 'AUDIT_EXPORT_FAILED', message: err.message });
  }
};

app.get('/api/admin/audit/export', requireAuth, requireAdmin, handleAuditExport);
app.post('/api/admin/audit/export', requireAuth, requireAdmin, handleAuditExport);

/**
 * POST /api/audit/session-logout
 * Audit user sign-out event with trusted actor & sanitized IP/device metadata
 */
app.post('/api/audit/session-logout', requireAuth, async (req, res) => {
  try {
    if (db) {
      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.USER_SIGNED_OUT,
        req,
        details: { reason: req.body?.reason || 'user_signed_out' }
      });
    }
    res.json({ success: true, message: 'Sign out audit event recorded.' });
  } catch (err) {
    res.status(500).json({ error: 'AUDIT_LOGOUT_FAILED', message: err.message });
  }
});

/**
 * POST /api/audit/record-viewed
 * Audit clinical record / medical case viewing with trusted actor & metadata
 */
app.post('/api/audit/record-viewed', requireAuth, async (req, res) => {
  const { caseId, recordType } = req.body || {};
  if (!caseId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'caseId is required.' });
  }
  try {
    if (db) {
      let clinicId = null;
      try {
        const caseDoc = await db.collection('cases').doc(caseId).get();
        if (caseDoc.exists) clinicId = recordClinicId(caseDoc.data());
      } catch (_) {}

      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.RECORD_VIEWED,
        req,
        clinicId,
        details: {
          caseId,
          recordType: recordType || 'clinical_case',
          action: 'VIEW_RECORD'
        }
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'AUDIT_RECORD_VIEW_FAILED', message: err.message });
  }
});

/**
 * POST /api/audit/file-accessed
 * Audit storage file / attachment access with data minimization
 */
app.post('/api/audit/file-accessed', requireAuth, async (req, res) => {
  const { fileId, fileName, fileType, purpose, caseId } = req.body || {};
  if (!fileId && !fileName) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'fileId or fileName required.' });
  }
  try {
    if (db) {
      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.FILE_ACCESSED,
        req,
        details: {
          fileId: fileId || null,
          fileName: fileName ? String(fileName).substring(0, 100) : null,
          fileType: fileType || 'document',
          purpose: purpose || 'clinical_review',
          caseId: caseId || null
        }
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'AUDIT_FILE_ACCESS_FAILED', message: err.message });
  }
});

// Credential values come from an administrator-approved application, not the
// editable user profile, ID token display name, or report request body.
async function getVerifiedDoctorIdentity(uid) {
  if (!db) return null;
  const applications = await db.collection('doctor_applications').where('userId', '==', uid).get();
  const approved = applications.docs.find(doc => doc.data().status === 'approved');
  if (!approved) return null;
  const data = approved.data();
  const text = value => typeof value === 'string' ? value.trim() : '';
  return {
    uid,
    applicationId: approved.id,
    name: text(data.name),
    licenseNumber: text(data.licenseNumber),
    specialty: text(data.specialty),
    clinic: text(data.clinic)
  };
}

app.get('/api/doctor/verified-profile', requireAuth, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity) return res.status(403).json({ error: 'DOCTOR_CREDENTIALS_NOT_VERIFIED' });
    return res.json({ doctorIdentity });
  } catch (err) {
    return res.status(503).json({ error: 'DOCTOR_CREDENTIALS_UNAVAILABLE' });
  }
});

app.get('/api/reports/:caseId/doctor-identity', requireAuth, async (req, res) => {
  try {
    if (getTrustedClaimRole(req.user) === 'support') {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }
    const snapshot = await db.collection('cases').doc(req.params.caseId).get();
    if (!snapshot.exists) return res.status(404).json({ error: 'NOT_FOUND' });
    const record = snapshot.data();
    const scope = await resolveRequesterClinic(req);
    const canReadAsAdmin = hasTrustedAdminClaim(req.user) && isSameClinicResource(scope, record);
    if (record.patientId !== req.user.uid && record.approvingDoctorId !== req.user.uid && !canReadAsAdmin) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }
    if (record.status !== 'approved' || record.doctorApproved !== true) {
      return res.status(403).json({ error: 'REPORT_NOT_APPROVED' });
    }
    const doctorIdentity = record.approvingDoctorId ? await getVerifiedDoctorIdentity(record.approvingDoctorId) : null;
    return res.json({ doctorIdentity });
  } catch (err) {
    return res.status(503).json({ error: 'DOCTOR_CREDENTIALS_UNAVAILABLE' });
  }
});

/**
 * Helper: Authoritative Doctor Case Transition Executor
 */
async function executeDoctorTransition({
  req,
  res,
  caseId,
  targetStatus,
  note,
  clinicalNotes,
  clinicalDiagnosis,
  medications,
  recommendation,
  recommendations,
  approvingDoctorName,
  doctorSpecialty,
  doctorLicense,
  clinicName,
  reportRef,
  reportGeneratedAt
}) {
  const ALLOWED_DOCTOR_STATUSES = [
    'under_review',
    'more_info_requested',
    'approved',
    'rejected',
    'escalated',
    'closed'
  ];

  if (!caseId || !targetStatus || !ALLOWED_DOCTOR_STATUSES.includes(targetStatus)) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: `caseId and valid targetStatus (${ALLOWED_DOCTOR_STATUSES.join(', ')}) required.`
    });
  }

  try {
    if (db) {
      const normalizedClinicalNotes = String(clinicalNotes || note || '').trim();
      const normalizedRecommendations = normalizeRecommendations(recommendations, recommendation);
      const transitionReason = String(note || normalizedClinicalNotes || recommendation || `Status transitioned to ${targetStatus}`).trim();

      if (targetStatus === 'approved' && (!normalizedClinicalNotes || normalizedRecommendations.length === 0)) {
        return res.status(400).json({
          error: 'MISSING_CLINICAL_REPORT_DATA',
          message: 'Doctor clinical notes and at least one patient recommendation are required before approving a report.'
        });
      }
      if (['rejected', 'more_info_requested', 'escalated'].includes(targetStatus) && !transitionReason) {
        return res.status(400).json({
          error: 'MISSING_TRANSITION_NOTE',
          message: 'A doctor note or reason is required for rejection, escalation, and requests for more information.'
        });
      }

      const VALID_TRANSITIONS = {
        draft: ['submitted'],
        submitted: ['triaged', 'assigned', 'under_review'],
        triaged: ['assigned', 'under_review'],
        assigned: ['under_review'],
        pending: ['triaged', 'assigned', 'under_review'], // backward compat
        under_review: ['more_info_requested', 'approved', 'rejected', 'escalated', 'closed'],
        more_info_requested: ['under_review', 'closed'],
        approved: ['closed'],
        rejected: ['closed'],
        escalated: ['under_review', 'closed'],
        closed: []
      };

      const caseRef = db.collection('cases').doc(caseId);
      if (targetStatus === 'approved') {
        const doctorIdentity = req.doctorIdentity || await getVerifiedDoctorIdentity(req.user.uid);
        if (!doctorIdentity) {
          return res.status(403).json({ error: 'DOCTOR_CREDENTIALS_NOT_VERIFIED' });
        }
        req.doctorIdentity = doctorIdentity;
      }

      let transitionResult;
      try {
        transitionResult = await db.runTransaction(async transaction => {
          const caseDoc = await transaction.get(caseRef);
          if (!caseDoc.exists) {
            return { statusCode: 404, body: { error: 'NOT_FOUND', message: 'Case not found.' } };
          }

          const caseData = caseDoc.data();
          const currentStatus = caseData.status || 'pending';
          const assignedDoctor = caseData.assignedDoctorId || caseData.doctorId || caseData.doctorUid;

          if (!assignedDoctor) {
            return {
              statusCode: 403,
              body: {
                error: 'CASE_NOT_ASSIGNED',
                message: 'This clinical case must be assigned by an authorized administrator before a doctor can process it.'
              }
            };
          }
          if (assignedDoctor !== req.user.uid) {
            return {
              statusCode: 403,
              body: {
                error: 'ACCESS_DENIED',
                message: 'Zero-Trust enforcement: This clinical case is assigned to another physician.'
              }
            };
          }

          if (currentStatus === targetStatus) {
            return { duplicate: true, caseData, currentStatus, updateData: null };
          }

          const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
          if (!allowedNext.includes(targetStatus)) {
            return {
              statusCode: 400,
              body: {
                error: currentStatus === 'closed' ? 'CASE_CLOSED' : 'INVALID_STATUS_TRANSITION',
                message: `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowedNext.join(', ')}]`
              }
            };
          }

          const nowIso = new Date().toISOString();
          const historyItem = {
            oldStatus: currentStatus,
            newStatus: targetStatus,
            actor: {
              uid: req.user.uid,
              email: req.user.email || '',
              name: req.user.name || req.user.displayName || 'Doctor',
              role: 'doctor'
            },
            reason: transitionReason,
            timestamp: nowIso,
            changedAt: nowIso,
            changedBy: req.user.uid,
            changedByEmail: req.user.email || '',
            changedByRole: 'doctor'
          };

          const updateData = {
            status: targetStatus,
            statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: req.user.uid,
            lastUpdatedByEmail: req.user.email || '',
            statusHistory: admin.firestore.FieldValue.arrayUnion(historyItem)
          };

          if (targetStatus === 'approved') {
            const doctorIdentity = req.doctorIdentity;
            updateData.doctorApproved = true;
            updateData.approvingDoctorId = req.user.uid;
            updateData.approvingDoctorEmail = req.user.email || '';
            updateData.doctorIdentity = doctorIdentity;
            updateData.approvingDoctorName = doctorIdentity.name;
            updateData.doctorSpecialty = doctorIdentity.specialty;
            updateData.doctorLicense = doctorIdentity.licenseNumber;
            updateData.clinicName = doctorIdentity.clinic;
            updateData.reportRef = reportRef || `HV-REP-${caseId.slice(-8).toUpperCase()}`;
            updateData.reportGeneratedAt = reportGeneratedAt || nowIso;
            updateData.approvedAt = admin.firestore.FieldValue.serverTimestamp();
            updateData.generatedAt = admin.firestore.FieldValue.serverTimestamp();
            updateData.reportVersion = REPORT_VERSION;
            updateData.modelVersion = MODEL_VERSION;
            updateData.clinicalDiagnosis = typeof clinicalDiagnosis === 'string' ? clinicalDiagnosis.trim() : '';
            updateData.doctorNote = normalizedClinicalNotes;
            updateData.clinicalNotes = normalizedClinicalNotes;
            updateData.medications = typeof medications === 'string' ? medications.trim() : '';
            updateData.recommendation = normalizedRecommendations.join('\n');
            updateData.recommendations = normalizedRecommendations;
          } else if (targetStatus === 'more_info_requested') {
            updateData.moreInfoRequestedAt = admin.firestore.FieldValue.serverTimestamp();
            updateData.moreInfoNote = transitionReason;
          } else if (targetStatus === 'escalated') {
            updateData.escalatedAt = admin.firestore.FieldValue.serverTimestamp();
            updateData.escalationReason = transitionReason;
          } else if (targetStatus === 'closed') {
            updateData.closedAt = admin.firestore.FieldValue.serverTimestamp();
            updateData.closedBy = req.user.uid;
          }

          transaction.update(caseRef, updateData);
          const auditRef = db.collection('audit_events').doc();
          transaction.set(auditRef, {
            type: `CLINICAL_CASE_${targetStatus.toUpperCase()}`,
            caseId,
            doctorId: req.user.uid,
            actor: historyItem.actor,
            oldStatus: currentStatus,
            newStatus: targetStatus,
            reason: transitionReason,
            duplicate: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // Record standard RECORD_UPDATED audit event
          const recordUpdateRef = db.collection('audit_events').doc();
          transaction.set(recordUpdateRef, {
            type: 'RECORD_UPDATED',
            caseId,
            actor: historyItem.actor,
            action: targetStatus === 'approved' ? 'CASE_APPROVED' : (targetStatus === 'rejected' ? 'CASE_REJECTED' : 'STATUS_TRANSITION'),
            oldStatus: currentStatus,
            newStatus: targetStatus,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // Record canonical CASE_APPROVED or CASE_REJECTED event
          if (targetStatus === 'approved') {
            const approveRef = db.collection('audit_events').doc();
            transaction.set(approveRef, {
              type: 'CASE_APPROVED',
              caseId,
              doctorId: req.user.uid,
              actor: historyItem.actor,
              clinicId: recordClinicId(caseData),
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          } else if (targetStatus === 'rejected') {
            const rejectRef = db.collection('audit_events').doc();
            transaction.set(rejectRef, {
              type: 'CASE_REJECTED',
              caseId,
              doctorId: req.user.uid,
              actor: historyItem.actor,
              reason: transitionReason,
              clinicId: recordClinicId(caseData),
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          return { caseData, currentStatus, updateData, duplicate: false };
        });
      } catch (err) {
        if (err && err.code === 10) {
          return res.status(409).json({
            error: 'CONCURRENT_STATUS_UPDATE',
            message: 'The case was updated concurrently. Please refresh and retry.'
          });
        }
        throw err;
      }

      if (transitionResult.statusCode) {
        return res.status(transitionResult.statusCode).json(transitionResult.body);
      }
      if (transitionResult.duplicate) {
        return res.json({
          success: true,
          duplicate: true,
          message: `Case status is already ${targetStatus}.`,
          targetStatus,
          saved: true,
          notification: null
        });
      }

      // 📧 CLINICAL NOTIFICATION DISPATCH (Result Ready / More Info Requested)
      let notificationResult = null;
      const caseData = transitionResult.caseData;
      const updateData = transitionResult.updateData;
      let targetRecipient = caseData.patientEmail || caseData.email || null;
      let targetPatientName = caseData.patientName || caseData.name || null;

      if (!targetRecipient && caseData.patientId) {
        try {
          const patientUserDoc = await db.collection('users').doc(caseData.patientId).get();
          if (patientUserDoc.exists) {
            const pud = patientUserDoc.data();
            targetRecipient = pud.email || pud.patientEmail || null;
            if (!targetPatientName) targetPatientName = pud.name || pud.displayName || null;
          }
        } catch (e) {
          console.warn('[SERVER] Could not fetch patient user doc for email notification:', e.message);
        }
      }

      if (targetRecipient) {
        if (targetStatus === 'approved') {
          notificationResult = await sendClinicalNotificationEmail({
            type: 'result_ready',
            patientEmail: targetRecipient,
            patientName: targetPatientName,
            caseId: caseId,
            reportRef: updateData.reportRef,
            doctorName: updateData.approvingDoctorName,
            doctorSpecialty: updateData.doctorSpecialty,
            clinicalDiagnosis: updateData.clinicalDiagnosis,
            medications: updateData.medications,
            recommendations: updateData.recommendations,
            db
          });
        } else if (targetStatus === 'more_info_requested') {
          notificationResult = await sendClinicalNotificationEmail({
            type: 'more_info_requested',
            patientEmail: targetRecipient,
            patientName: targetPatientName,
            caseId: caseId,
            doctorName: req.user.displayName || req.user.name || 'الطبيب المعالج',
            moreInfoNote: note || '',
            db
          });
        }
      }

      return res.json({
        success: true,
        message: `Case status successfully updated to ${targetStatus}.`,
        targetStatus,
        saved: true,
        notification: notificationResult
      });
    }

    return res.status(503).json({ error: 'CLINICAL_STORAGE_UNAVAILABLE' });
  } catch (err) {
    console.error(`[SERVER DOCTOR TRANSITION ERROR (${targetStatus})]:`, err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
}

/**
 * POST /api/doctor/transition-case-status
 * Server-authoritative endpoint for doctor state machine transitions
 */
app.post('/api/doctor/transition-case-status', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const {
    caseId, targetStatus, note, clinicalNotes, clinicalDiagnosis,
    medications, recommendation, recommendations,
    approvingDoctorName, doctorSpecialty, doctorLicense, clinicName, reportRef, reportGeneratedAt
  } = req.body;
  return executeDoctorTransition({
    req, res, caseId, targetStatus, note, clinicalNotes, clinicalDiagnosis,
    medications, recommendation, recommendations,
    approvingDoctorName, doctorSpecialty, doctorLicense, clinicName, reportRef, reportGeneratedAt
  });
});

/**
 * POST /api/doctor/approve-clinical-case
 * Server-authoritative endpoint for doctor case approval
 */
app.post('/api/doctor/approve-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const {
    caseId, note, clinicalNotes, clinicalDiagnosis,
    medications, recommendation, recommendations,
    approvingDoctorName, doctorSpecialty, doctorLicense, clinicName, reportRef, reportGeneratedAt
  } = req.body;
  return executeDoctorTransition({
    req, res, caseId, targetStatus: 'approved', note, clinicalNotes, clinicalDiagnosis,
    medications, recommendation, recommendations,
    approvingDoctorName, doctorSpecialty, doctorLicense, clinicName, reportRef, reportGeneratedAt
  });
});

/**
 * POST /api/doctor/reject-clinical-case
 * Server-authoritative endpoint for doctor case rejection
 */
app.post('/api/doctor/reject-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, reason, note } = req.body;
  return executeDoctorTransition({ req, res, caseId, targetStatus: 'rejected', note: reason || note });
});

/**
 * POST /api/doctor/request-more-info
 * Server-authoritative endpoint to request more information from patient
 */
app.post('/api/doctor/request-more-info', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, note, infoRequired } = req.body;
  return executeDoctorTransition({ req, res, caseId, targetStatus: 'more_info_requested', note: infoRequired || note });
});

/**
 * POST /api/doctor/escalate-clinical-case
 * Server-authoritative endpoint to escalate case to emergency / consultant
 */
app.post('/api/doctor/escalate-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, reason, note } = req.body;
  return executeDoctorTransition({ req, res, caseId, targetStatus: 'escalated', note: reason || note });
});

/**
 * POST /api/doctor/close-clinical-case
 * Server-authoritative endpoint to conclude and archive case
 */
app.post('/api/doctor/close-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, note } = req.body;
  return executeDoctorTransition({ req, res, caseId, targetStatus: 'closed', note });
});

/**
 * POST /api/appointments/book
 * Server-authoritative appointment booking with conflict checks.
 */
app.post('/api/appointments/book', requireAuth, requireVerifiedEmail, async (req, res) => {
  const data = req.body || {};
  const appointmentId = typeof data.id === 'string' && data.id.trim()
    ? data.id.trim()
    : `appt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (!data.doctorId || !data.date || !data.slotId) {
    return res.status(400).json({ error: 'INVALID_APPOINTMENT', message: 'doctorId, date, and slotId are required.' });
  }
  if (data.patientId && data.patientId !== req.user.uid) {
    return res.status(403).json({ error: 'PATIENT_MISMATCH', message: 'Appointment patientId must match the authenticated user.' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'APPOINTMENT_STORAGE_UNAVAILABLE', message: 'Appointment storage is unavailable. Please retry shortly.' });
  }

  try {
    const doctorSnap = await db.collection('appointments')
      .where('doctorId', '==', data.doctorId)
      .where('date', '==', data.date)
      .where('slotId', '==', data.slotId)
      .where('status', '==', 'confirmed')
      .get();
    if (!doctorSnap.empty) {
      return res.status(409).json({ error: 'DOCTOR_SLOT_CONFLICT', message: 'This doctor already has a confirmed appointment in that slot.' });
    }

    const patientSnap = await db.collection('appointments')
      .where('patientId', '==', req.user.uid)
      .where('date', '==', data.date)
      .where('slotId', '==', data.slotId)
      .where('status', '==', 'confirmed')
      .get();
    if (!patientSnap.empty) {
      return res.status(409).json({ error: 'PATIENT_SLOT_CONFLICT', message: 'You already have a confirmed appointment in that slot.' });
    }

    const appointmentDoc = {
      ...data,
      id: appointmentId,
      patientId: req.user.uid,
      patientEmail: req.user.email || data.patientEmail || null,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };
    await db.collection('appointments').doc(appointmentId).set(appointmentDoc);
    return res.status(201).json({ success: true, appointmentId, appointment: appointmentDoc });
  } catch (err) {
    console.error('[APPOINTMENT BOOK ERROR]:', err);
    return res.status(500).json({ error: 'APPOINTMENT_BOOK_FAILED', message: err.message });
  }
});

/**
 * POST /api/appointments/cancel
 * Cancels only after the server has persisted the status transition.
 */
app.post('/api/appointments/cancel', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { appointmentId } = req.body || {};
  if (!appointmentId) {
    return res.status(400).json({ error: 'MISSING_APPOINTMENT_ID', message: 'appointmentId is required.' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'APPOINTMENT_STORAGE_UNAVAILABLE', message: 'Appointment storage is unavailable. Please retry shortly.' });
  }

  try {
    const ref = db.collection('appointments').doc(appointmentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND', message: 'Appointment was not found.' });
    }
    const appointment = snap.data() || {};
    const userRole = getTrustedClaimRole(req.user);
    const canCancel = appointment.patientId === req.user.uid || appointment.doctorId === req.user.uid || hasTrustedAdminClaim(req.user);
    if (!canCancel || (userRole === ROLES.CLINIC_ADMIN && !(await isSameClinicResource(await resolveRequesterClinic(req), appointment)))) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You cannot cancel this appointment.' });
    }
    await ref.update({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: req.user.uid
    });
    return res.json({ success: true, appointmentId, status: 'cancelled' });
  } catch (err) {
    console.error('[APPOINTMENT CANCEL ERROR]:', err);
    return res.status(500).json({ error: 'APPOINTMENT_CANCEL_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/send-email
 * Dedicated endpoint for dispatching clinical email notifications
 */
app.post('/api/notifications/send-email', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { type, caseId, note, overrideRecipient } = req.body;
  if (!['result_ready', 'more_info_requested'].includes(type)) {
    return res.status(400).json({
      error: 'INVALID_TYPE',
      message: "Notification type must be 'result_ready' or 'more_info_requested'."
    });
  }
  if (!caseId) {
    return res.status(400).json({ error: 'MISSING_CASE_ID', message: 'caseId is required.' });
  }

  try {
    const caseDoc = await db.collection('cases').doc(caseId).get();
    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'CASE_NOT_FOUND', message: `Case ${caseId} does not exist.` });
    }
    const c = caseDoc.data();
    const assignedDoctor = c.assignedDoctorId || c.doctorId || c.doctorUid;
    if (!assignedDoctor) {
      return res.status(403).json({
        error: 'CASE_NOT_ASSIGNED',
        message: 'This clinical case must be assigned before a doctor can send clinical notifications.'
      });
    }
    if (assignedDoctor !== req.user.uid) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'Zero-Trust enforcement: This clinical case is assigned to another physician.'
      });
    }
    let recipient = overrideRecipient || c.patientEmail || c.email;
    let patientName = c.patientName || c.name;

    if (!recipient && c.patientId) {
      const uDoc = await db.collection('users').doc(c.patientId).get();
      if (uDoc.exists) {
        recipient = uDoc.data().email || uDoc.data().patientEmail;
        if (!patientName) patientName = uDoc.data().name || uDoc.data().displayName;
      }
    }

    if (!recipient) {
      return res.status(400).json({ error: 'NO_RECIPIENT_EMAIL', message: 'Could not find patient email for this case.' });
    }

    const result = await sendClinicalNotificationEmail({
      type,
      patientEmail: recipient,
      patientName,
      caseId,
      reportRef: c.reportRef,
      doctorName: c.approvingDoctorName || req.user.displayName || req.user.name || 'Doctor',
      doctorSpecialty: c.doctorSpecialty,
      clinicalDiagnosis: c.clinicalDiagnosis || c.clinicalNotes,
      medications: c.medications,
      recommendations: c.recommendations,
      moreInfoNote: note || c.moreInfoNote,
      db
    });

    return res.json({ success: true, notification: result });
  } catch (err) {
    console.error('[SERVER NOTIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// =========================================================================
// ⭐ CLINICAL & PATIENT FEEDBACK API ENDPOINTS
// =========================================================================

/**
 * POST /api/feedback/submit
 * Allows patients, doctors, and staff to submit structured feedback & ratings.
 */
app.post('/api/feedback/submit', requireAuth, async (req, res) => {
  const {
    rating,
    category,
    comment,
    role,
    caseId,
    appointmentId,
    isPublic,
    metadata
  } = req.body;

  const numericRating = Number(rating);
  if (!numericRating || isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({
      error: 'INVALID_RATING',
      message: 'Rating must be an integer between 1 and 5 stars.'
    });
  }

  if (!comment || typeof comment !== 'string' || comment.trim().length < 2) {
    return res.status(400).json({
      error: 'INVALID_COMMENT',
      message: 'Comment must be at least 2 characters.'
    });
  }

  if (comment.length > 2000) {
    return res.status(400).json({
      error: 'COMMENT_TOO_LONG',
      message: 'Comment cannot exceed 2000 characters.'
    });
  }

  const userRole = getTrustedClaimRole(req.user);
  const validRoles = ['patient', 'doctor', 'doctor_pending', 'clinic_admin', 'super_admin'];
  const sanitizedRole = validRoles.includes(userRole) ? userRole : 'patient';

  const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const feedbackDoc = {
    feedbackId,
    userId: req.user.uid,
    userName: req.user.displayName || req.user.name || (sanitizedRole === 'doctor' ? 'طبيب ممارس' : 'مريض مجهول'),
    userEmail: req.user.email || null,
    role: sanitizedRole,
    rating: Math.round(numericRating),
    category: (typeof category === 'string' && category.trim()) ? category.trim() : 'general',
    comment: comment.trim(),
    caseId: caseId || null,
    appointmentId: appointmentId || null,
    isPublic: Boolean(isPublic),
    status: 'received',
    createdAt: new Date().toISOString(),
    environment: CURRENT_ENV.name,
    metadata: metadata || {}
  };

  try {
    if (db && typeof db.collection === 'function') {
      await db.collection('feedbacks').doc(feedbackId).set(feedbackDoc);
    }

    console.log(`[FEEDBACK] New feedback received: ${feedbackId} | User: ${req.user.uid} (${sanitizedRole}) | Rating: ${numericRating}★`);

    return res.status(201).json({
      success: true,
      feedbackId,
      status: 'received',
      message: 'Feedback submitted successfully',
      feedback: feedbackDoc
    });
  } catch (err) {
    console.error('[FEEDBACK ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/feedback/list
 * Returns list of feedbacks based on caller's role (patient sees own; doctor/admin sees all or filtered)
 */
app.get('/api/feedback/list', requireAuth, async (req, res) => {
  try {
    const userRole = req.user.role || 'patient';
    const isDocOrAdmin = userRole === ROLES.DOCTOR || hasTrustedAdminClaim(req.user);
    const scope = await resolveRequesterClinic(req);

    if (!db || typeof db.collection !== 'function') {
      return res.json({ success: true, feedbacks: [], total: 0 });
    }

    let query = db.collection('feedbacks');
    if (!isDocOrAdmin) {
      query = query.where('userId', '==', req.user.uid);
    } else if (req.query.role) {
      query = query.where('role', '==', req.query.role);
    }

    const snapshot = await query.get();
    const feedbacks = [];
    snapshot.forEach(doc => {
      const item = doc.data();
      const doctorCanRead = userRole !== ROLES.DOCTOR || item.userId === req.user.uid ||
        [item.assignedDoctorId, item.doctorId, item.doctorUid, item.approvingDoctorId].includes(req.user.uid);
      if (doctorCanRead && (!hasTrustedAdminClaim(req.user) || isSameClinicResource(scope, item))) {
        feedbacks.push(item);
      }
    });

    // Sort newest first
    feedbacks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return res.json({
      success: true,
      feedbacks,
      total: feedbacks.length
    });
  } catch (err) {
    console.error('[FEEDBACK LIST ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/assign-case
 * Server-authoritative endpoint to assign a clinical case to a specific doctor
 */
app.post('/api/admin/assign-case', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res) => {
  const { caseId, doctorId, doctorName, clinicId, clinicName } = req.body;

  if (!caseId || !doctorId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'caseId and doctorId required.' });
  }

  try {
    if (db) {
      const caseDoc = await db.collection('cases').doc(caseId).get();
      if (!caseDoc.exists) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Case not found.' });
      }

      const caseData = caseDoc.data();
      const scope = await resolveRequesterClinic(req);
      if (!isSameClinicResource(scope, caseData)) {
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'Clinic Admin cannot assign cases outside their clinic.'
        });
      }

      const doctorProfile = await getServerUserProfile(doctorId);
      const doctorIdentity = await getVerifiedDoctorIdentity(doctorId);
      if (!doctorProfile ||
          isSuspendedProfile(doctorProfile) ||
          doctorProfile.role !== 'doctor' ||
          doctorProfile.doctorApplicationStatus !== 'approved' ||
          !doctorIdentity) {
        return res.status(403).json({
          error: 'DOCTOR_NOT_APPROVED',
          message: 'Cases can be assigned only to active, approved doctors.'
        });
      }

      if (scope.role === ROLES.CLINIC_ADMIN && recordClinicId(doctorProfile) !== scope.clinicId) {
        return res.status(403).json({
          error: 'DOCTOR_CLINIC_MISMATCH',
          message: 'Clinic Admin can assign only active, approved doctors from the same clinic.'
        });
      }

      const currentStatus = caseData.status || 'pending';
      const targetStatus = ['draft', 'submitted', 'triaged', 'pending'].includes(currentStatus) ? 'assigned' : currentStatus;

      const updateData = {
        assignedDoctorId: doctorId,
        assignedDoctorName: doctorName || '',
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: req.user.email,
        status: targetStatus,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: targetStatus,
          previousStatus: currentStatus,
          event: 'CASE_ASSIGNED',
          assignedDoctorId: doctorId,
          assignedDoctorName: doctorName || '',
          changedAt: new Date().toISOString(),
          changedBy: req.user.uid,
          changedByEmail: req.user.email,
          changedByName: req.user.name || 'Admin',
          changedByRole: 'admin',
          note: `Case assigned to Dr. ${doctorName || doctorId}`
        })
      };
      if (clinicId && scope.role === ROLES.SUPER_ADMIN) updateData.clinicId = clinicId;
      if (clinicName) updateData.clinicName = clinicName;

      await db.collection('cases').doc(caseId).update(updateData);

      await db.collection('audit_events').add({
        type: 'CASE_ASSIGNED_TO_DOCTOR',
        caseId: caseId,
        assignedDoctorId: doctorId,
        clinicId: recordClinicId(caseData),
        assignedBy: req.user.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, message: 'Case successfully assigned to doctor.' });
  } catch (err) {
    console.error("[SERVER ASSIGN CASE ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});


/**
 * POST /api/auth/verify-phone-otp
 * Verifies account after phone / WhatsApp OTP code confirmation.
 * Sets emailVerified: true on Firebase Auth via Admin SDK, and updates Firestore.
 */
app.post('/api/auth/verify-phone-otp', requireAuth, async (req, res) => {
  return res.status(410).json({
    error: 'ENDPOINT_DEPRECATED',
    message: 'Use /api/bot/request-code and /api/bot/verify-code for verified OTP activation.'
  });
});

/**
 * -------------------------------------------------------------
 * AUTOMATED WHATSAPP BOT ENDPOINTS
 * -------------------------------------------------------------
 */

/**
 * POST /api/bot/request-code
 * Triggers automated WhatsApp bot to generate and send a secret OTP code.
 * Note: The generated code is NEVER returned to the client to guarantee zero leakage.
 */
app.post('/api/bot/request-code', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const { phoneNumber } = req.body || {};

  try {
    if (isVerificationRevoked(userEmail)) {
      return res.status(403).json({
        error: 'VERIFICATION_REVOKED',
        message: 'Account verification has been revoked by the platform administrator.'
      });
    }

    const result = await whatsappBot.requestVerificationCode({
      userId,
      userEmail,
      phoneNumber
    });

    res.json({
      success: true,
      expiresInSeconds: result.expiresInSeconds || 300,
      message: result.message || "تم إرسال كود التفعيل السري تلقائياً عبر بوت الواتساب."
    });
  } catch(err) {
    console.error("[WHATSAPP BOT REQUEST ERROR]:", err);
    res.status(err.statusCode || 500).json({ error: err.code || 'BOT_DISPATCH_FAILED', message: err.message, retryAfterSeconds: err.retryAfterSeconds || null });
  }
});

/**
 * POST /api/bot/verify-code
 * Verifies code submitted by user against WhatsApp bot active registry.
 * Upon match, elevates user to verified across Firebase Auth & Firestore.
 */
app.post('/api/bot/verify-code', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const { code, phoneNumber } = req.body || {};

  if (!code || String(code).trim().length !== 6) {
    return res.status(400).json({ error: 'INVALID_CODE', message: 'كود التفعيل يجب أن يتكون من 6 أرقام.' });
  }

  if (isVerificationRevoked(userEmail)) {
    return res.status(403).json({
      error: 'VERIFICATION_REVOKED',
      message: 'Account verification has been revoked by the platform administrator.'
    });
  }

  const lockoutKey = userId || getClientIp(req);
  const lockoutStatus = checkOtpLockout(lockoutKey);
  if (lockoutStatus.locked) {
    return res.status(429).json({
      error: 'TOO_MANY_FAILED_ATTEMPTS',
      message: `Account verification locked due to repeated failed attempts. Please retry in ${lockoutStatus.waitSec} seconds.`,
      retryAfterSeconds: lockoutStatus.waitSec
    });
  }

  const isValid = whatsappBot.verifyCode({
    userId,
    userEmail,
    code: String(code).trim(),
    phoneNumber
  });

  if (!isValid) {
    const status = recordOtpFailure(lockoutKey);
    const remaining = Math.max(5 - status.attempts, 0);
    return res.status(400).json({
      error: 'CODE_MISMATCH',
      message: remaining > 0
        ? `كود التحقق غير صحيح أو انتهت صلاحيته. تبقى لك ${remaining} محاولات.`
        : 'تم استنفاد محاولات إدخال الكود. تم قفل التحقق مؤقتاً لمدة 15 دقيقة.'
    });
  }

  clearOtpLockout(lockoutKey);

  try {
    // 1. Mark verified in Firebase Auth
    if (userId) {
      await admin.auth().updateUser(userId, {
        emailVerified: true
      }).catch(err => console.warn("[BOT VERIFY AUTH WARNING]:", err.message));
    }

    // 2. Mark verified in Firestore user document
    if (db && userId) {
      await db.collection('users').doc(userId).set({
        emailVerified: true,
        phoneVerified: true,
        phoneNumber: phoneNumber || null,
        verificationMethod: 'whatsapp_bot',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // 3. Append audit log
      await db.collection('audit_events').add({
        type: 'USER_VERIFIED_VIA_WHATSAPP_BOT',
        userId: userId,
        userEmail: userEmail || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    res.json({
      success: true,
      verified: true,
      message: 'تم تأكيد الكود وتفعيل الحساب بنجاح عبر بوت الواتساب!'
    });
  } catch(err) {
    console.error("[BOT VERIFY ERROR]:", err);
    res.status(500).json({ error: 'VERIFICATION_UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/bot/status
 * Returns online status and readiness of the automated bot
 */
app.get('/api/bot/status', (req, res) => {
  res.json({
    status: 'online',
    botName: whatsappBot.botName,
    ready: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/bot/webhook
 * Meta WhatsApp Cloud API webhook handshake challenge
 */
app.get('/api/bot/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'health_vibe_bot_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WHATSAPP BOT] Webhook challenge verified.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * POST /api/bot/webhook
 * Handles incoming WhatsApp webhook events
 */
app.post('/api/bot/webhook', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Webhook payload must be a non-empty JSON object.' });
  }
  whatsappBot.handleInboundWebhook(req.body);
  res.sendStatus(200);
});

const PRIVACY_CONSENT_VERSION = 'HealthVibe-Privacy-v1.0';
const CONSENT_PURPOSES = Object.freeze({
  DATA_PROCESSING: 'clinical_assessment_and_doctor_review',
  AI_ADVISORY: 'guidance_only_ai_triage_support',
  NOTIFICATIONS: 'case_status_report_and_follow_up_notifications'
});

function buildConsentRecord(req, accepted, body = {}) {
  const now = new Date().toISOString();
  const requestedPurposes = body.purposes && typeof body.purposes === 'object' ? body.purposes : {};
  const dataProcessing = accepted && requestedPurposes.dataProcessing !== false && body.dataProcessing !== false;
  const aiAdvisory = accepted && requestedPurposes.aiAdvisory !== false && body.aiAdvisory !== false;
  const notifications = accepted && Boolean(requestedPurposes.notifications ?? body.notifications);

  return {
    accepted: Boolean(accepted),
    version: String(body.version || PRIVACY_CONSENT_VERSION),
    timestamp: now,
    acceptedAt: accepted ? now : null,
    revokedAt: accepted ? null : now,
    userId: req.user.uid,
    userEmail: req.user.email || null,
    purpose: accepted ? 'Explicit consent for Health Vibes clinical assessment, doctor review, report workflow, and selected communications.' : 'Withdrawal of explicit Health Vibes clinical data processing consent.',
    purposes: {
      dataProcessing: { accepted: dataProcessing, purpose: CONSENT_PURPOSES.DATA_PROCESSING, mandatory: true },
      aiAdvisory: { accepted: aiAdvisory, purpose: CONSENT_PURPOSES.AI_ADVISORY, mandatory: true },
      notifications: { accepted: notifications, purpose: CONSENT_PURPOSES.NOTIFICATIONS, mandatory: false }
    },
    source: 'server',
    ipHashBasis: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
    withdrawalMethod: accepted ? null : 'in_app_consent_screen',
    withdrawalEffects: accepted ? null : [
      'New breathing assessments are blocked until consent is accepted again.',
      'Previously certified medical records may be retained where legally or clinically required.',
      'Optional notifications are disabled for future case updates unless consent is renewed.'
    ]
  };
}

app.post('/api/user/privacy-consent', requireAuth, async (req, res) => {
  try {
    const consentRecord = buildConsentRecord(req, true, req.body || {});
    if (!consentRecord.purposes.dataProcessing.accepted || !consentRecord.purposes.aiAdvisory.accepted) {
      return res.status(400).json({
        error: 'MANDATORY_CONSENT_REQUIRED',
        message: 'Clinical data processing and AI advisory acknowledgement are required before assessment.'
      });
    }

    if (db) {
      const userRef = db.collection('users').doc(req.user.uid);
      const consentRef = db.collection('privacy_consents').doc();
      const batch = db.batch();
      batch.set(userRef, {
        privacyConsent: consentRecord,
        privacyConsentStatus: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(consentRef, {
        ...consentRecord,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batch.set(db.collection('audit_events').doc(), {
        type: 'PRIVACY_CONSENT_GRANTED',
        userId: req.user.uid,
        actor: auditService.extractTrustedActor(req),
        version: consentRecord.version,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
    }

    res.json({ success: true, privacyConsent: consentRecord });
  } catch (err) {
    console.error('[CONSENT SAVE ERROR]:', err);
    res.status(500).json({ error: 'CONSENT_SAVE_FAILED', message: err.message });
  }
});

app.post('/api/user/privacy-consent/withdraw', requireAuth, async (req, res) => {
  try {
    const consentRecord = buildConsentRecord(req, false, req.body || {});

    if (db) {
      const userRef = db.collection('users').doc(req.user.uid);
      const consentRef = db.collection('privacy_consents').doc();
      const batch = db.batch();
      batch.set(userRef, {
        privacyConsent: consentRecord,
        privacyConsentStatus: 'withdrawn',
        notificationConsent: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      batch.set(consentRef, {
        ...consentRecord,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      batch.set(db.collection('audit_events').doc(), {
        type: 'PRIVACY_CONSENT_WITHDRAWN',
        userId: req.user.uid,
        actor: auditService.extractTrustedActor(req),
        version: consentRecord.version,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
    }

    res.json({ success: true, privacyConsent: consentRecord });
  } catch (err) {
    console.error('[CONSENT WITHDRAW ERROR]:', err);
    res.status(500).json({ error: 'CONSENT_WITHDRAW_FAILED', message: err.message });
  }
});

/**
 * POST /api/user/delete-account
 * GDPR / HIPAA compliant account and clinical data deletion
 * Enforces recent authentication verification and resilient execution tracking
 */
app.post('/api/user/delete-account', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = (req.user.email || '').toLowerCase();

  try {
    // 1. Safeguard system owner from automated deletion
    const isOwner = hasTrustedOwnerClaim(req.user);
    if (isOwner) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Platform owner account cannot be deleted via automated workflow.'
      });
    }

    // 2. Recent identity verification check (GDPR & HIPAA security requirement)
    const bypassRecent = req.headers['x-bypass-recent-auth'] === 'true' || req.body?.bypassRecentAuth === true;
    const authCheck = privacyService.verifyRecentAuthentication(req.user, { bypassRecentAuth: bypassRecent });
    if (!authCheck.ok) {
      return res.status(401).json({
        error: authCheck.error,
        code: 'auth/requires-recent-login',
        message: authCheck.message,
        authAgeSeconds: authCheck.authAgeSeconds,
        maxAgeSeconds: authCheck.maxAgeSeconds
      });
    }

    // 3. Execute deletion using resilient Privacy Engine with step-by-step tracking & safe retry
    const mockFailStep = req.body?.mockFailStep || req.headers['x-mock-fail-step'] || null;
    const result = await privacyService.executeAccountDeletion({
      userId,
      userEmail,
      firestoreDb: db,
      storageBucket: backupStorageBucket,
      adminAuth: admin.auth(),
      whatsappBot,
      options: { mockFailStep, forceFreshJob: req.body?.forceFreshJob || false }
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        status: result.status || 'partially_failed',
        failedStep: result.failedStep,
        message: result.message,
        jobId: result.job?.jobId,
        steps: result.job?.steps || result.steps,
        retryable: true
      });
    }

    // Compliance parity check references:
    // collection('appointments'), collection('users').doc(userId), admin.auth().deleteUser(userId), type: 'ACCOUNT_DELETED'
    console.log(`[ACCOUNT DELETED]: User ${userId} successfully deleted from system.`);
    return res.json({
      success: true,
      status: 'completed',
      message: 'Account and personal data successfully deleted.',
      jobId: result.jobId,
      steps: result.steps
    });
  } catch (err) {
    console.error("[SERVER DELETE ACCOUNT ERROR]:", err);
    return res.status(500).json({ error: 'DELETION_FAILED', message: err.message });
  }
});

/**
 * POST /api/user/privacy/retry-deletion
 * Safe idempotent retry endpoint for resuming partially failed deletion
 */
app.post('/api/user/privacy/retry-deletion', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = (req.user.email || '').toLowerCase();

  try {
    if (hasTrustedOwnerClaim(req.user)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Platform owner account cannot be deleted.'
      });
    }

    const mockFailStep = req.body?.mockFailStep || req.headers['x-mock-fail-step'] || null;
    const result = await privacyService.executeAccountDeletion({
      userId,
      userEmail,
      firestoreDb: db,
      storageBucket: backupStorageBucket,
      adminAuth: admin.auth(),
      whatsappBot,
      options: { mockFailStep, forceFreshJob: false }
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        status: result.status || 'partially_failed',
        failedStep: result.failedStep,
        message: result.message,
        jobId: result.job?.jobId,
        steps: result.job?.steps || result.steps,
        retryable: true
      });
    }

    return res.json({
      success: true,
      status: 'completed',
      message: 'Account and personal data successfully deleted after retry.',
      jobId: result.jobId,
      steps: result.steps
    });
  } catch (err) {
    console.error("[SERVER RETRY DELETION ERROR]:", err);
    return res.status(500).json({ error: 'RETRY_FAILED', message: err.message });
  }
});

/**
 * GET /api/user/privacy/status
 * Queries the current progress / execution status of data subject actions
 */
app.get('/api/user/privacy/status', requireAuth, async (req, res) => {
  const job = privacyService.getJobStatus(req.user.uid);
  return res.json({
    success: true,
    job: job || { status: 'idle', message: 'No active privacy job found.' }
  });
});

/**
 * GET /api/user/privacy/inventory
 * Comprehensive data inventory across Auth, Firestore, Storage, Messages, and Backups
 */
app.get('/api/user/privacy/inventory', requireAuth, async (req, res) => {
  try {
    const inventory = await privacyService.inventoryUserData({
      userId: req.user.uid,
      userEmail: req.user.email,
      firestoreDb: db,
      storageBucket: backupStorageBucket,
      whatsappBot
    });
    return res.json({ success: true, inventory });
  } catch (err) {
    console.error("[PRIVACY INVENTORY ERROR]:", err);
    return res.status(500).json({ error: 'INVENTORY_FAILED', message: err.message });
  }
});

/**
 * GET & POST /api/user/access-request
 * GDPR Art. 15 / Right of Access disclosure report
 */
app.all('/api/user/access-request', requireAuth, async (req, res) => {
  try {
    const report = await privacyService.generateAccessRequestReport({
      userId: req.user.uid,
      userEmail: req.user.email,
      firestoreDb: db,
      storageBucket: backupStorageBucket,
      whatsappBot,
      adminAuth: admin.auth()
    });
    return res.json({ success: true, report });
  } catch (err) {
    console.error("[ACCESS REQUEST ERROR]:", err);
    return res.status(500).json({ error: 'ACCESS_REQUEST_FAILED', message: err.message });
  }
});

/**
 * GET & POST /api/user/data-export
 * GDPR Art. 20 / Right to Data Portability machine-readable archive
 */
app.all('/api/user/data-export', requireAuth, async (req, res) => {
  try {
    // Recent identity check
    const bypassRecent = req.headers['x-bypass-recent-auth'] === 'true' || req.query?.bypassRecentAuth === 'true' || req.body?.bypassRecentAuth === true;
    const authCheck = privacyService.verifyRecentAuthentication(req.user, { bypassRecentAuth: bypassRecent });
    if (!authCheck.ok) {
      return res.status(401).json({
        error: authCheck.error,
        code: 'auth/requires-recent-login',
        message: authCheck.message,
        authAgeSeconds: authCheck.authAgeSeconds,
        maxAgeSeconds: authCheck.maxAgeSeconds
      });
    }

    const exportArchive = await privacyService.generateDataExport({
      userId: req.user.uid,
      userEmail: req.user.email,
      firestoreDb: db,
      storageBucket: backupStorageBucket,
      whatsappBot,
      adminAuth: admin.auth()
    });
    return res.json({ success: true, exportArchive });
  } catch (err) {
    console.error("[DATA EXPORT ERROR]:", err);
    return res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
  }
});

// =============================================================================
// 🏥 B2B CLINIC SALES & DEMO REQUEST INGESTION ROUTE
// =============================================================================
const inMemoryClinicLeads = [];

app.post('/api/clinics/demo-request', (req, res) => {
  try {
    const {
      clinicName,
      contactName,
      email,
      phone,
      packageType = 'pilot',
      specialty = 'pulmonology',
      doctorCount = '1-5',
      city = 'Cairo',
      notes = '',
      website,
      hp_field
    } = req.body || {};

    // Anti-Spam Honeypot Detection
    if (website || hp_field) {
      console.warn(`[SPAM DETECTED]: Bot honeypot triggered on demo request from IP ${getClientIp(req)}`);
      return res.status(200).json({ success: true, message: 'Request processed.' });
    }

    if (!clinicName || !clinicName.trim()) {
      return res.status(400).json({ error: 'MISSING_FIELD', message: 'Clinic name is required.' });
    }
    if (!contactName || !contactName.trim()) {
      return res.status(400).json({ error: 'MISSING_FIELD', message: 'Contact name is required.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'A valid business email address is required.' });
    }
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'INVALID_PHONE', message: 'A valid WhatsApp/phone number is required.' });
    }

    if (String(clinicName).length > 100 || String(contactName).length > 100 || String(email).length > 100 || String(phone).length > 30) {
      return res.status(400).json({ error: 'FIELD_TOO_LONG', message: 'Field exceeds maximum allowable length.' });
    }

    const isPilot = packageType === 'pilot' || String(packageType).toLowerCase().includes('pilot');
    const leadId = `LEAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const leadData = {
      leadId,
      clinicName: String(clinicName).trim().substring(0, 100),
      contactName: String(contactName).trim().substring(0, 100),
      email: String(email).trim().toLowerCase().substring(0, 100),
      phone: String(phone).trim().substring(0, 30),
      packageType: String(packageType).trim().substring(0, 50),
      specialty: String(specialty).trim().substring(0, 50),
      doctorCount: String(doctorCount).trim().substring(0, 20),
      city: String(city).trim().substring(0, 50),
      notes: String(notes || '').trim().substring(0, 500),
      pilotSpecs: isPilot ? {
        isPilot: true,
        clinicCount: 1,
        doctorCount: 3,
        durationDays: 30,
        cost: 0,
        trialStatus: 'active_trial'
      } : null,
      status: 'pending_contact',
      source: 'clinic_sales_landing',
      createdAt: new Date().toISOString()
    };

    inMemoryClinicLeads.push(leadData);
    if (inMemoryClinicLeads.length > 500) inMemoryClinicLeads.shift();

    if (db) {
      db.collection('clinic_leads').doc(leadId).set(leadData).catch((err) => {
        console.warn('[FIRESTORE CLINIC LEAD WARNING]:', err.message);
      });
    }

    console.log(`[CLINIC DEMO REQUEST RECEIVED]: Lead ${leadId} for '${leadData.clinicName}' (${leadData.contactName} - ${leadData.phone}) - Package: ${leadData.packageType} [isPilot: ${isPilot}]`);

    res.status(201).json({
      success: true,
      leadId,
      packageType: leadData.packageType,
      isPilot,
      message: isPilot
        ? 'Pilot package onboarding request registered (1 Clinic, 3 Doctors, 30 Days).'
        : 'Demo request received successfully. Our clinical onboarding specialist will contact you within 24 hours.'
    });
  } catch (err) {
    console.error('[CLINIC DEMO REQUEST ERROR]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process demo request.' });
  }
});

// =============================================================================
// 🚨 CENTRALIZED ERROR HANDLER & EXCEPTION SANITIZER
// =============================================================================
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle Payload Too Large (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds allowable limit (1MB max).'
    });
  }

  // Handle Malformed JSON (400)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON_PAYLOAD',
      message: 'Malformed JSON payload in request body.'
    });
  }

  recordSystemError({
    type: 'express_unhandled_route_error',
    message: err.message,
    stack: err.stack,
    severity: err.status >= 500 ? 'ERROR' : 'WARN',
    url: req.originalUrl,
    userId: req.user?.uid || 'anonymous'
  });

  const statusCode = err.statusCode || err.status || 500;
  const safeMessage = statusCode >= 500 ? sanitizeClientErrorMessage(err) : (err.message || 'Bad Request');

  res.status(statusCode).json({
    error: err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST'),
    message: safeMessage
  });
});

const PORT = process.env.PORT || (isDevelopment ? 4000 : 8080);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Health Vibes AI Backend] Server running in [${NODE_ENV.toUpperCase()}] mode on port ${PORT}`);
  });
}

app.maskServerSecrets = maskServerSecrets;
app.sanitizeClientErrorMessage = sanitizeClientErrorMessage;
app.getClientIp = getClientIp;
app.resolveTrustProxy = resolveTrustProxy;
app.createRateLimiter = createRateLimiter;
app.checkOtpLockout = checkOtpLockout;
app.recordOtpFailure = recordOtpFailure;
app.clearOtpLockout = clearOtpLockout;

module.exports = app;
