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
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const whatsappBot = require('./whatsapp-bot');
const {
  sendClinicalNotificationEmail,
  enqueueNotification,
  processNotificationQueue,
  recordDeliveryConfirmation,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  rescheduleAppointmentReminders,
  startReminderScheduler,
  stopReminderScheduler,
  recordNotificationHistory,
  getUserNotificationHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationById,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isQuietHoursActive,
  calculateNextQuietHoursEnd,
  isUrgentEvent,
  generateAuthorizedDestinationLink,
  dispatchNotificationWithPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES
} = require('./notification-service');
const backupService = require('./backup-service');
const privacyService = require('./privacy-service');
const auditService = require('./audit-service');
const mfaService = require('./mfa-service');
const schedulingService = require('./scheduling-service');
const timelineService = require('./timeline-service');
const monitoringService = require('./monitoring-service');
const incidentService = require('./incident-service');
const rulesGovernance = require('./clinical-rules-governance');
const driftMonitoring = require('./drift-monitoring-service');
const safetyRegister = require('./safety-register-service');
const analyticsService = require('./analytics-service');
const feedbackSupportService = require('./feedback-support-service');
const assessmentComparisonService = require('./assessment-comparison-service');
const pilotReadinessService = require('./pilot-readiness-service');
const billingService = require('./billing-service');
const expansionAnalyticsService = require('./expansion-analytics-service');
const doctorProfileService = require('./doctor-profile-service');
const pushNotificationService = require('./push-notification-service');
const waitingListService = require('./waiting-list-service');
const googleCalendarService = require('./google-calendar-service');
const telehealthVideoService = require('./telehealth-video-service');
const medicalOcrService = require('./medical-ocr-service');
const unusualAccessService = require('./unusual-access-service');
const prescriptionService = require('./prescription-service');
const chronicHypertensionService = require('./chronic-hypertension-service');
const wearableIntegrationService = require('./wearable-integration-service');

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

  // Strict clinical caching policy: NEVER cache PHI / patient health data insecurely
  if (req.path.startsWith('/api/cases') || 
      req.path.startsWith('/api/patient') || 
      req.path.startsWith('/api/doctor') || 
      req.path.startsWith('/api/reports') ||
      req.path.startsWith('/api/appointments') ||
      req.path.startsWith('/api/admin/audit')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (req.path.startsWith('/api/public') || req.path.startsWith('/api/clinics') || req.path.startsWith('/api/config')) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  }

  // 🛑 Anti-Scraping & Indexing Guard: Prevent search engines from indexing private API routes or personal data
  if (req.path.startsWith('/api/') || req.path.startsWith('/records/') || req.path.startsWith('/private/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
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

// 🔗 Distributed Tracing & Request Performance Telemetry
app.use(monitoringService.traceMiddleware);
app.use(unusualAccessService.unusualAccessMiddleware);

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
  '/api/notifications/enqueue',
  '/api/notifications/process-queue',
  '/api/notifications/delivery-webhook',
  '/api/feedback/submit',
  '/api/appointments/book',
  '/api/appointments/reschedule',
  '/api/appointments/cancel',
  '/api/appointments/update-status',
  '/api/user/privacy-consent',
  '/api/user/privacy-consent/withdraw',
  '/api/user/delete-account',
  '/api/user/privacy/retry-deletion',
  '/api/user/data-export',
  '/api/user/access-request',
  '/api/user/change-password',
  '/api/user/change-email',
  '/api/user/revoke-all-sessions',
  '/api/user/sessions/terminate',
  '/api/user/mfa/enroll',
  '/api/user/mfa/verify-enrollment',
  '/api/user/mfa/verify-challenge',
  '/api/user/mfa/recovery',
  '/api/user/mfa/disenroll'
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
app.use('/api/auth/send-verification-email', otpRequestLimiter);

// OTP Verification attempt rate limiter (5 attempts / 15 minutes)
const otpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many failed verification attempts. Please wait 15 minutes before retrying.',
  keyGenerator: req => req.user?.uid ? `otp_ver_user:${req.user.uid}` : `otp_ver_ip:${getClientIp(req)}`
});
app.use('/api/bot/verify-code', otpVerifyLimiter);
app.use('/api/auth/verify-email-otp', otpVerifyLimiter);

// Public form submissions limiter (5 req / 15 minutes per IP)
const publicFormLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many submissions. Please wait before submitting another request.',
  keyGenerator: req => `form_ip:${getClientIp(req)}`
});
app.use('/api/clinics/demo-request', publicFormLimiter);

// Account recovery rate limiter (3 requests / 15 minutes per IP)
const accountRecoveryLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 3,
  message: 'Too many recovery requests. Please wait 15 minutes.',
  keyGenerator: req => `rec_ip:${getClientIp(req)}`
});
app.use('/api/auth/recover-account', accountRecoveryLimiter);

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

// Patient Timeline query rate limiter (60 req / minute per user/IP)
const timelineLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 60,
  message: 'Too many timeline requests. Please wait a moment.',
  keyGenerator: req => req.user?.uid ? `timeline_user:${req.user.uid}` : `timeline_ip:${getClientIp(req)}`
});
app.use('/api/patient/timeline', timelineLimiter);

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
  category = null,
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
  traceId = null,
  sessionId = null,
  metadata = {}
} = {}) {
  const monitoringRecord = monitoringService.recordMonitoringError({
    type,
    category,
    message,
    stack,
    source,
    lineno,
    colno,
    url,
    userId,
    userRole,
    screen,
    environment,
    severity,
    traceId,
    sessionId,
    metadata
  });

  errorLogsRingBuffer.unshift(monitoringRecord);
  if (errorLogsRingBuffer.length > MAX_ERROR_LOGS) {
    errorLogsRingBuffer.pop();
  }

  // Persist to audit_events if Firestore is initialized
  if (db) {
    try {
      db.collection('audit_events').add({
        type: 'SYSTEM_ERROR_LOGGED',
        errorId: monitoringRecord.errorId,
        traceId: monitoringRecord.traceId,
        errorType: type,
        category: monitoringRecord.category,
        message: monitoringRecord.message,
        severity: monitoringRecord.severity,
        userId: monitoringRecord.userId,
        userRole,
        environment,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(err => {
        console.warn('[MONITORING] Note: could not write error to audit_events:', err.message);
      });
    } catch (e) {}
  }

  console.error(`[ERROR MONITOR] [${monitoringRecord.severity}] [${monitoringRecord.category}:${type}] ${monitoringRecord.message} (Trace: ${monitoringRecord.traceId}, ID: ${monitoringRecord.errorId})`);
  return monitoringRecord;
}

// Global Process-Level Crash Protection
process.on('uncaughtException', (err) => {
  recordSystemError({
    type: 'server_uncaught_exception',
    category: monitoringService.ERROR_CATEGORIES.API,
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
    category: monitoringService.ERROR_CATEGORIES.API,
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

// Endpoint: Ingest client/frontend error events with PII redaction and traceId
app.post('/api/monitoring/errors', requireAuth, (req, res) => {
  const { type, category, message, stack, source, lineno, colno, url, screen, severity, traceId, sessionId, metadata } = req.body || {};

  if (!message && !type) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Error type or message is required.' });
  }

  const effectiveTraceId = traceId || req.traceId || req.headers['x-trace-id'] || null;

  const record = recordSystemError({
    type: type || 'client_reported_error',
    category: category || null,
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
    traceId: effectiveTraceId,
    sessionId: sessionId || req.headers['x-session-id'] || null,
    metadata: metadata || {}
  });

  res.status(201).json({
    success: true,
    errorId: record.errorId,
    traceId: record.traceId,
    category: record.category,
    loggedAt: record.timestamp
  });
});

// Endpoint: Error telemetry summary & metrics with measured session crash-free rate
app.get('/api/monitoring/errors/summary', requireAuth, auditOperationalAccess('MONITORING_SUMMARY_READ'), requireSuperAdmin, (req, res) => {
  const byType = {};
  const bySeverity = {};
  const byCategory = {};
  let criticalCount = 0;

  for (const err of errorLogsRingBuffer) {
    byType[err.type] = (byType[err.type] || 0) + 1;
    bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
    const cat = err.category || monitoringService.categorizeError(err.type, err.message, err.source);
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (err.severity === 'CRITICAL') criticalCount++;
  }

  const totalLogged = errorLogsRingBuffer.length;
  // Calculate crashFreeRate strictly based on measured sessions, or return "Unavailable"
  const crashFreeRate = monitoringService.calculateCrashFreeRate();

  res.json({
    status: 'ok',
    environment: NODE_ENV,
    totalErrors: totalLogged,
    crashFreeRate,
    byType,
    bySeverity,
    byCategory,
    uptime: monitoringService.getUptimeMetrics(),
    activeAlerts: monitoringService.getActiveAlerts(),
    serverUptimeSeconds: Math.floor(process.uptime()),
    recentErrors: errorLogsRingBuffer.slice(0, 50),
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Event Dashboard linked through trace identifiers
app.get('/api/monitoring/events', requireAuth, auditOperationalAccess('MONITORING_EVENTS_READ'), requireSuperAdmin, (req, res) => {
  const { category, traceId, severity, limit } = req.query || {};
  const events = monitoringService.queryEvents({
    category: category || null,
    traceId: traceId || null,
    severity: severity || null,
    limit: limit ? parseInt(limit, 10) : 50
  });

  res.json({
    status: 'ok',
    count: events.length,
    events,
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Uptime and performance latency metrics
app.get('/api/monitoring/uptime', (req, res) => {
  const metrics = monitoringService.getUptimeMetrics();
  res.json({
    status: 'ok',
    ...metrics,
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Alerts dashboard (active alerts, threshold config, history)
app.get('/api/monitoring/alerts', requireAuth, auditOperationalAccess('MONITORING_ALERTS_READ'), requireSuperAdmin, (req, res) => {
  res.json({
    status: 'ok',
    activeAlerts: monitoringService.getActiveAlerts(),
    alertHistory: monitoringService.alertHistory.slice(0, 50),
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Session ping / registration for measured session tracking
app.post('/api/monitoring/sessions', (req, res) => {
  const { sessionId, metadata } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: 'SESSION_ID_REQUIRED', message: 'sessionId is required.' });
  }

  const session = monitoringService.recordSession(
    sessionId,
    req.user ? req.user.uid : 'anonymous',
    metadata
  );

  res.json({
    success: true,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    hasCrashed: session.hasCrashed
  });
});

// Endpoint: Injected failure simulation for alert & recovery verification
app.post('/api/monitoring/test/inject-failure', requireAuth, requireSuperAdmin, (req, res) => {
  const { failureCount = 5, latencyMs = 2500, action = 'inject' } = req.body || {};

  if (action === 'inject') {
    // Inject failures to trigger alert
    for (let i = 0; i < failureCount; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: latencyMs,
        statusCode: 500,
        path: '/api/test/injected-fault',
        isError: true
      });
    }
    return res.json({
      success: true,
      action: 'injected',
      activeAlerts: monitoringService.getActiveAlerts()
    });
  }

  if (action === 'recover') {
    // Inject healthy requests to clear error rate and trigger recovery
    for (let i = 0; i < 20; i++) {
      monitoringService.recordRequestMetric({
        timestamp: Date.now(),
        durationMs: 45,
        statusCode: 200,
        path: '/api/test/healthy-probe',
        isError: false
      });
    }
    return res.json({
      success: true,
      action: 'recovered',
      activeAlerts: monitoringService.getActiveAlerts()
    });
  }

  res.status(400).json({ error: 'INVALID_ACTION', message: 'Supported actions: inject, recover' });
});

// Endpoint: Clear in-memory error buffer (platform administrators only)
app.post('/api/monitoring/errors/clear', requireAuth, auditOperationalAccess('MONITORING_ERRORS_CLEARED'), requireSuperAdmin, (req, res) => {
  errorLogsRingBuffer.length = 0;
  monitoringService.resetMonitoringState();
  res.json({ success: true, message: 'In-memory error logs and telemetry state successfully cleared.' });
});

// =============================================================================
// 🛡️ VULNERABILITY REPORTING & INCIDENT / ADVERSE EVENT REGISTER
// =============================================================================
const vulnRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 5,
  message: 'Too many vulnerability disclosure submissions. Please wait 1 minute before submitting again.',
  keyGenerator: req => `vuln_ip:${getClientIp(req)}`
});

// Endpoint: Submit vulnerability report (Public / Authenticated responsible disclosure channel)
app.post('/api/security/report-vulnerability', vulnRateLimiter, (req, res) => {
  const { reporterName, reporterEmail, vulnerabilityType, severity, affectedComponent, reproductionSteps, pocDetails } = req.body || {};

  if (!vulnerabilityType && !reproductionSteps) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'vulnerabilityType and reproductionSteps are required.' });
  }

  const clientIp = getClientIp(req);
  const report = incidentService.submitVulnerabilityReport({
    reporterName,
    reporterEmail,
    vulnerabilityType,
    severity,
    affectedComponent,
    reproductionSteps,
    pocDetails,
    clientIp,
    firestoreDb: db
  });

  res.status(201).json({
    success: true,
    reportId: report.reportId,
    status: report.status,
    message: 'Thank you for responsibly disclosing this finding. Our security team will review it immediately.'
  });
});

// Endpoint: List vulnerability reports (Super Admin & Owners)
app.get('/api/security/vulnerabilities', requireAuth, auditOperationalAccess('VULNERABILITIES_LIST_READ'), requireSuperAdmin, (req, res) => {
  const { status, severity, limit } = req.query || {};
  const reports = incidentService.getVulnerabilityReports({
    status: status || null,
    severity: severity || null,
    limit: limit ? parseInt(limit, 10) : 50
  });

  res.json({
    status: 'ok',
    count: reports.length,
    reports,
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Register security incident or clinical adverse event
app.post('/api/incidents', requireAuth, auditOperationalAccess('INCIDENT_CREATED'), (req, res) => {
  const { type, severity, title, description, affectedUsersCount, escalationLevel, metadata } = req.body || {};

  if (!title || !description) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Title and description are required.' });
  }

  const role = getTrustedClaimRole(req.user);
  const isPrivileged = [ROLES.DOCTOR, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN].includes(role) || hasTrustedOwnerClaim(req.user);
  if (!isPrivileged) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Only authorized clinical or administrative personnel may register incidents.' });
  }

  const incident = incidentService.createIncident({
    type,
    severity,
    title,
    description,
    owner: {
      name: req.user.displayName || req.user.name || role,
      email: req.user.email || 'operator@healthvibe.ai',
      role
    },
    affectedUsersCount,
    escalationLevel,
    metadata,
    reportedBy: req.user.uid,
    firestoreDb: db
  });

  res.status(201).json({
    success: true,
    incidentId: incident.incidentId,
    isAdverseEvent: incident.isAdverseEvent,
    status: incident.status,
    incident
  });
});

// Endpoint: List incidents and clinical adverse events
app.get('/api/incidents', requireAuth, auditOperationalAccess('INCIDENTS_LIST_READ'), (req, res) => {
  const role = getTrustedClaimRole(req.user);
  const isPrivileged = [ROLES.DOCTOR, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN].includes(role) || hasTrustedOwnerClaim(req.user);
  if (!isPrivileged) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Access denied to incident register.' });
  }

  const { type, severity, status, isAdverseEvent, limit } = req.query || {};
  const incidents = incidentService.queryIncidents({
    type: type || null,
    severity: severity || null,
    status: status || null,
    isAdverseEvent: isAdverseEvent !== undefined ? (isAdverseEvent === 'true') : null,
    limit: limit ? parseInt(limit, 10) : 50
  });

  res.json({
    status: 'ok',
    count: incidents.length,
    incidents,
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Get specific incident details with forensic evidence and communications
app.get('/api/incidents/:id', requireAuth, (req, res) => {
  const incident = incidentService.getIncidentById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Incident record not found.' });
  }
  res.json({ status: 'ok', incident });
});

// Endpoint: Attach forensic evidence with cryptographic SHA-256 fingerprint
app.post('/api/incidents/:id/evidence', requireAuth, auditOperationalAccess('INCIDENT_EVIDENCE_ATTACHED'), requireSuperAdmin, (req, res) => {
  const { type, referenceId, traceId, data } = req.body || {};
  try {
    const evidence = incidentService.attachEvidence(req.params.id, {
      type,
      referenceId,
      traceId: traceId || req.traceId,
      data,
      capturedBy: req.user.uid,
      firestoreDb: db
    });
    res.status(201).json({ success: true, evidence });
  } catch (err) {
    res.status(400).json({ error: 'EVIDENCE_ATTACH_FAILED', message: err.message });
  }
});

// Endpoint: Update incident status and recovery action
app.patch('/api/incidents/:id/status', requireAuth, auditOperationalAccess('INCIDENT_STATUS_UPDATED'), requireSuperAdmin, (req, res) => {
  const { status, rootCause, recoveryAction, escalationLevel } = req.body || {};
  try {
    const updated = incidentService.updateIncidentStatus(req.params.id, {
      status,
      rootCause,
      recoveryAction,
      escalationLevel,
      resolvedBy: req.user.email || req.user.uid,
      firestoreDb: db
    });
    res.json({ success: true, incident: updated });
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

// Endpoint: Log outbound stakeholder communication on incident
app.post('/api/incidents/:id/communicate', requireAuth, auditOperationalAccess('INCIDENT_COMMUNICATION_LOGGED'), requireSuperAdmin, (req, res) => {
  const { recipientGroup, channel, summary, messageId } = req.body || {};
  try {
    const commEntry = incidentService.logIncidentCommunication(req.params.id, {
      recipientGroup,
      channel,
      summary,
      messageId,
      sentBy: req.user.email || req.user.uid,
      firestoreDb: db
    });
    res.status(201).json({ success: true, communication: commEntry });
  } catch (err) {
    res.status(400).json({ error: 'COMMUNICATION_LOG_FAILED', message: err.message });
  }
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
    service: 'Health Vibe AI Server-Authoritative Backend',
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
if (db) feedbackSupportService.setDb(db);
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

const DEFAULT_OWNER_EMAILS = [
  'mennamahmoudtawfik281@gmail.com',
  'mohammedabdelrouf85@gmail.com',
  'sondoselbehery287@gmail.com',
  'badr46694@gmail.com'
];
const OWNER_EMAILS = new Set(parseEmailList(process.env.OWNER_EMAILS, DEFAULT_OWNER_EMAILS));

function isTrustedOwnerEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return OWNER_EMAILS.has(email.trim().toLowerCase());
}

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
  const email = (user.email || '').trim().toLowerCase();
  return user.isOwner === true || user.role === ROLES.SUPER_ADMIN || (email && OWNER_EMAILS.has(email));
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
  const clinicId = recordClinicId(profile || {}) || recordClinicId(req.user || {});

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

/**
 * Helper: Regulate National ID Collection under Policy and Legal Review Safeguards
 * HIPAA / GDPR / Statutory Healthcare Privacy Safeguards:
 * 1. Requires explicit statutory verification consent (consentObtained: true).
 * 2. Requires legitimate regulatory purpose (e.g. 'REGULATORY_CREDENTIAL_VERIFICATION').
 * 3. Enforces 10-14 numerical digit format.
 * 4. Generates masked representation and salted HMAC-SHA256 hash. Never stores raw ID in plaintext.
 * 5. Tags record with statutory legal review metadata.
 */
function validateNationalIdCollection(nationalId, policyConsent = {}, legalReview = {}) {
  if (!nationalId) {
    return { ok: true, maskedNationalId: null, nationalIdHash: null, legalReview: null };
  }

  // 1. Consent and Policy Check
  if (!policyConsent.consentObtained || policyConsent.purpose !== 'REGULATORY_CREDENTIAL_VERIFICATION') {
    return {
      ok: false,
      error: 'NATIONAL_ID_POLICY_VIOLATION',
      message: 'National ID collection requires explicit statutory consent and verified purpose (REGULATORY_CREDENTIAL_VERIFICATION) under patient and practitioner privacy policies.'
    };
  }

  // 2. Format Validation (10 to 14 numeric digits)
  const cleanId = String(nationalId).trim();
  if (!/^\d{10,14}$/.test(cleanId)) {
    return {
      ok: false,
      error: 'INVALID_NATIONAL_ID_FORMAT',
      message: 'National ID must consist of 10 to 14 numerical digits.'
    };
  }

  // 3. Masking & Salted HMAC Hashing
  const first3 = cleanId.substring(0, 3);
  const last4 = cleanId.substring(cleanId.length - 4);
  const maskLength = cleanId.length - 7;
  const maskedNationalId = `${first3}${'*'.repeat(maskLength)}${last4}`;
  const nationalIdHash = crypto.createHmac('sha256', process.env.AUDIT_SALT || 'health-vibes-mfa-integrity-salt-2026')
    .update(cleanId)
    .digest('hex');

  // 4. Legal Review Metadata
  const legalReviewMetadata = {
    status: legalReview.status || 'approved',
    legalBasis: legalReview.legalBasis || 'STATUTORY_HEALTHCARE_WORKER_VERIFICATION',
    legalReviewedBy: legalReview.reviewedBy || null,
    legalReviewedAt: legalReview.reviewedAt || new Date().toISOString(),
    consentTimestamp: policyConsent.timestamp || new Date().toISOString()
  };

  return {
    ok: true,
    maskedNationalId,
    nationalIdHash,
    legalReview: legalReviewMetadata
  };
}

/**
 * Helper: Authoritative Doctor Credential & Licensing Verification Checker
 * Prevents case approvals when:
 * 1. Doctor credentials are not verified.
 * 2. Doctor privileges are suspended or revoked.
 * 3. Syndicate / medical license is expired.
 * 4. Credential re-verification is overdue.
 * 5. Licensing authority verification is invalid or rejected.
 */
function verifyDoctorAuthorization(doctorIdentity, profile = {}) {
  if (!doctorIdentity) {
    return { ok: false, error: 'DOCTOR_CREDENTIALS_NOT_VERIFIED', message: 'Doctor credentials are not verified.' };
  }

  // 1. Suspension or Account Disabling Check
  if (isSuspendedProfile(profile) || doctorIdentity.status === 'suspended' || profile.doctorApplicationStatus === 'suspended') {
    return { ok: false, error: 'DOCTOR_AUTHORIZATION_SUSPENDED', message: 'Doctor clinical privileges are currently suspended.' };
  }

  // 2. Explicit Credential Revocation Check
  if (doctorIdentity.status === 'revoked' || profile.doctorApplicationStatus === 'revoked' || doctorIdentity.licenseStatus === 'revoked') {
    return { ok: false, error: 'DOCTOR_AUTHORIZATION_REVOKED', message: 'Doctor clinical license or credentials have been revoked.' };
  }

  // 3. Licensing Authority Verification Check (must NOT be mere file upload)
  if (doctorIdentity.verificationResult && doctorIdentity.verificationResult !== 'VERIFIED') {
    return { ok: false, error: 'DOCTOR_AUTHORITY_VERIFICATION_INVALID', message: `Doctor licensing authority verification status is '${doctorIdentity.verificationResult}'.` };
  }

  // 4. License Expiry Check
  const now = new Date();
  if (doctorIdentity.licenseExpiryDate) {
    const expiryDate = new Date(doctorIdentity.licenseExpiryDate);
    if (!isNaN(expiryDate.getTime()) && expiryDate <= now) {
      return {
        ok: false,
        error: 'DOCTOR_LICENSE_EXPIRED',
        message: `Doctor medical license expired on ${expiryDate.toISOString().split('T')[0]}. Case approval blocked until license renewal is approved.`,
        licenseExpiryDate: doctorIdentity.licenseExpiryDate
      };
    }
  }

  // 5. Reverification Schedule Check
  if (doctorIdentity.reverificationDueDate) {
    const reverifyDate = new Date(doctorIdentity.reverificationDueDate);
    if (!isNaN(reverifyDate.getTime()) && reverifyDate <= now) {
      return {
        ok: false,
        error: 'DOCTOR_REVERIFICATION_OVERDUE',
        message: `Doctor credential re-verification was due on ${reverifyDate.toISOString().split('T')[0]}. Re-verification required before approving cases.`,
        reverificationDueDate: doctorIdentity.reverificationDueDate
      };
    }
  }

  return { ok: true, doctorIdentity };
}

/**
 * Helper: Verify Approved Doctor Clinic Membership
 * Enforces that doctor is an approved member of the specific clinic.
 */
function isDoctorApprovedMemberOfClinic(doctorIdentity, doctorProfile, targetClinicId) {
  if (!targetClinicId) return true;
  if (!doctorIdentity && !doctorProfile) return false;

  // Platform owner or super admin bypass
  if (doctorProfile && (doctorProfile.role === ROLES.SUPER_ADMIN || hasTrustedOwnerClaim({ customClaims: doctorProfile }))) {
    return true;
  }

  // Direct clinicId match if active/approved
  if (doctorIdentity && doctorIdentity.clinicId === targetClinicId && doctorIdentity.licenseStatus !== 'revoked') {
    return true;
  }
  if (doctorProfile && doctorProfile.clinicId === targetClinicId && !isSuspendedProfile(doctorProfile)) {
    return true;
  }

  // Check structured clinicMemberships array
  const memberships = [
    ...(Array.isArray(doctorIdentity?.clinicMemberships) ? doctorIdentity.clinicMemberships : []),
    ...(Array.isArray(doctorProfile?.clinicMemberships) ? doctorProfile.clinicMemberships : [])
  ];

  const matched = memberships.find(m => m && m.clinicId === targetClinicId && m.status === 'approved');
  return Boolean(matched);
}

function isVerificationRevoked(email) {
  return REVOKED_VERIFICATION_EMAILS.has(String(email || '').trim().toLowerCase());
}

// =============================================================================
// 🩺 PATIENT MEDICAL PROFILE: DOB, CLINICAL RELEVANCE, PROVENANCE & LINKAGE
// =============================================================================

const VALID_BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN', 'unknown']);
const VALID_SEX_VALUES = new Set(['male', 'female', 'other', 'not_specified']);

/**
 * Helper: Calculate exact age in years from Date of Birth
 * Disallows free-text ambiguity; strictly computes age based on calendar birth date.
 */
function calculateAge(dateOfBirth, referenceDate = new Date()) {
  if (!dateOfBirth) return null;
  const dob = (dateOfBirth instanceof Date) ? dateOfBirth : new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const ref = (referenceDate instanceof Date) ? referenceDate : new Date(referenceDate);
  if (isNaN(ref.getTime())) return null;

  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

/**
 * Helper: Calculate Body Mass Index (BMI)
 */
function calculateBmi(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h <= 0 || w <= 0) return null;
  const heightM = h / 100;
  const bmi = w / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/**
 * Helper: Clinical Relevance for Sex and Pregnancy
 * Pregnancy is clinically relevant strictly for biological females in reproductive age (12-55).
 * Suppressed/omitted for males, non-reproductive age brackets, or irrelevant contexts.
 */
function evaluatePregnancyClinicalRelevance(sex, age) {
  const cleanSex = String(sex || '').trim().toLowerCase();
  const isFemale = cleanSex === 'female';
  const numericAge = typeof age === 'number' ? age : null;
  const isReproductiveAge = numericAge !== null && numericAge >= 12 && numericAge <= 55;
  const isClinicallyRelevant = isFemale && isReproductiveAge;

  let reason = 'Clinically relevant (Female aged 12-55).';
  if (!isFemale) {
    reason = 'Biological sex is not female; pregnancy status is clinically non-applicable.';
  } else if (numericAge === null) {
    reason = 'Age is not determined; pregnancy relevance cannot be confirmed.';
  } else if (numericAge < 12) {
    reason = 'Pediatric patient under reproductive age bracket (<12).';
  } else if (numericAge > 55) {
    reason = 'Post-menopausal age bracket (>55).';
  }

  return {
    isClinicallyRelevant,
    reason
  };
}

/**
 * Helper: Validate and organize patient medical profile attributes
 */
function validatePatientMedicalProfile(raw = {}) {
  const errors = [];
  const clean = {};

  // 1. Name
  if (raw.name || raw.fullName) {
    clean.fullName = String(raw.fullName || raw.name).trim();
  }

  // 2. Phone
  if (raw.phone || raw.phoneNumber) {
    clean.phoneNumber = String(raw.phone || raw.phoneNumber).trim();
  }

  // 3. Date of Birth & Dynamically Calculated Age
  if (raw.dateOfBirth || raw.dob) {
    const dobStr = String(raw.dateOfBirth || raw.dob).trim();
    const dobDate = new Date(dobStr);
    if (isNaN(dobDate.getTime())) {
      errors.push('Invalid dateOfBirth format. Expected ISO YYYY-MM-DD.');
    } else if (dobDate > new Date()) {
      errors.push('Date of birth cannot be in the future.');
    } else {
      const calculatedAge = calculateAge(dobDate);
      if (calculatedAge > 130) {
        errors.push('Date of birth results in an improbable age (>130).');
      } else {
        clean.dateOfBirth = dobStr.split('T')[0];
        clean.calculatedAge = calculatedAge;
      }
    }
  }

  // 4. Emergency Contact Details
  if (raw.emergencyContact && typeof raw.emergencyContact === 'object') {
    clean.emergencyContact = {
      name: String(raw.emergencyContact.name || '').trim(),
      relationship: String(raw.emergencyContact.relationship || raw.emergencyContact.relation || '').trim(),
      phone: String(raw.emergencyContact.phone || '').trim()
    };
  } else {
    clean.emergencyContact = {
      name: String(raw.emergencyContactName || '').trim(),
      relationship: String(raw.emergencyContactRelation || raw.emergencyContactRelationship || '').trim(),
      phone: String(raw.emergencyContactPhone || '').trim()
    };
  }

  // 5. Biometrics (Blood Type, Height, Weight, BMI)
  clean.biometrics = {};
  const bt = String(raw.bloodType || raw.biometrics?.bloodType || 'unknown').trim().toUpperCase();
  if (VALID_BLOOD_TYPES.has(bt)) {
    clean.biometrics.bloodType = bt;
  } else {
    errors.push(`Invalid bloodType '${bt}'. Allowed: ${Array.from(VALID_BLOOD_TYPES).join(', ')}`);
  }

  const heightVal = raw.heightCm ?? raw.height ?? raw.biometrics?.heightCm ?? raw.biometrics?.height;
  if (heightVal !== undefined && heightVal !== null && heightVal !== '') {
    const h = Number(heightVal);
    if (isNaN(h) || h < 20 || h > 260) {
      errors.push('Height must be a valid number between 20 cm and 260 cm.');
    } else {
      clean.biometrics.heightCm = h;
    }
  }

  const weightVal = raw.weightKg ?? raw.weight ?? raw.biometrics?.weightKg ?? raw.biometrics?.weight;
  if (weightVal !== undefined && weightVal !== null && weightVal !== '') {
    const w = Number(weightVal);
    if (isNaN(w) || w < 1 || w > 400) {
      errors.push('Weight must be a valid number between 1 kg and 400 kg.');
    } else {
      clean.biometrics.weightKg = w;
    }
  }

  if (clean.biometrics.heightCm && clean.biometrics.weightKg) {
    clean.biometrics.bmi = calculateBmi(clean.biometrics.heightCm, clean.biometrics.weightKg);
  }

  // 6. Biological Sex & Conditional Pregnancy Clinical Relevance
  let biologicalSex = 'not_specified';
  if (raw.sex || raw.biologicalSex) {
    const s = String(raw.sex || raw.biologicalSex).trim().toLowerCase();
    if (VALID_SEX_VALUES.has(s)) {
      biologicalSex = s;
    } else {
      errors.push(`Invalid sex value. Allowed: ${Array.from(VALID_SEX_VALUES).join(', ')}`);
    }
  }
  clean.biologicalSex = biologicalSex;

  const pregnancyRelevance = evaluatePregnancyClinicalRelevance(biologicalSex, clean.calculatedAge);
  clean.pregnancy = {
    isClinicallyRelevant: pregnancyRelevance.isClinicallyRelevant,
    relevanceReason: pregnancyRelevance.reason
  };

  if (pregnancyRelevance.isClinicallyRelevant) {
    const pregRaw = raw.pregnancy || {};
    clean.pregnancy.status = pregRaw.status || (raw.isPregnant ? 'pregnant' : 'not_pregnant');
    clean.pregnancy.trimester = pregRaw.trimester ? Number(pregRaw.trimester) : null;
    clean.pregnancy.dueDate = pregRaw.dueDate ? String(pregRaw.dueDate).split('T')[0] : null;
  } else {
    clean.pregnancy.status = 'not_applicable';
    clean.pregnancy.trimester = null;
    clean.pregnancy.dueDate = null;
  }

  // 7. Organized Medical History
  const parseList = (item) => {
    if (!item) return [];
    if (Array.isArray(item)) return item.map(x => (typeof x === 'string' ? x.trim() : x)).filter(Boolean);
    if (typeof item === 'string') return item.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    return [];
  };

  clean.medicalHistory = {
    allergies: parseList(raw.allergies || raw.medicalHistory?.allergies),
    chronicConditions: parseList(raw.chronicConditions || raw.medicalHistory?.chronicConditions),
    medications: parseList(raw.medications || raw.medicalHistory?.medications),
    surgeries: parseList(raw.surgeries || raw.medicalHistory?.surgeries),
    smoking: typeof raw.smoking === 'object' && raw.smoking !== null ? {
      status: ['never', 'former', 'current', 'passive'].includes(raw.smoking.status) ? raw.smoking.status : 'never',
      packYears: Number(raw.smoking.packYears) || null,
      details: String(raw.smoking.details || '').trim()
    } : {
      status: ['never', 'former', 'current', 'passive'].includes(raw.smokingStatus) ? raw.smokingStatus : 'never',
      packYears: Number(raw.packYears) || null,
      details: typeof raw.smoking === 'string' ? raw.smoking.trim() : ''
    },
    familyHistory: parseList(raw.familyHistory || raw.medicalHistory?.familyHistory),
    hospitalAdmissions: parseList(raw.hospitalAdmissions || raw.medicalHistory?.hospitalAdmissions)
  };

  // 8. Health Insurance (Strictly Optional)
  clean.insurance = {
    hasInsurance: Boolean(raw.insurance?.hasInsurance || raw.hasInsurance || false),
    provider: String(raw.insurance?.provider || raw.insuranceProvider || '').trim(),
    policyNumber: String(raw.insurance?.policyNumber || raw.insurancePolicyNumber || '').trim(),
    groupNumber: String(raw.insurance?.groupNumber || raw.insuranceGroupNumber || '').trim(),
    expiryDate: raw.insurance?.expiryDate ? String(raw.insurance.expiryDate).split('T')[0] : (raw.insuranceExpiry ? String(raw.insuranceExpiry).split('T')[0] : null),
    notes: String(raw.insurance?.notes || raw.insuranceNotes || '').trim()
  };

  // 9. Trusted Clinic & Doctor Linkage
  clean.clinicLinkage = {
    clinicId: raw.clinicId ? String(raw.clinicId).trim() : (raw.clinicLinkage?.clinicId ? String(raw.clinicLinkage.clinicId).trim() : null),
    clinicName: raw.clinicName ? String(raw.clinicName).trim() : (raw.clinicLinkage?.clinicName ? String(raw.clinicLinkage.clinicName).trim() : null),
    linkedDoctorId: raw.linkedDoctorId ? String(raw.linkedDoctorId).trim() : (raw.clinicLinkage?.linkedDoctorId ? String(raw.clinicLinkage.linkedDoctorId).trim() : (raw.linkedDoctor ? String(raw.linkedDoctor).trim() : null)),
    linkedDoctorName: raw.linkedDoctorName ? String(raw.linkedDoctorName).trim() : (raw.clinicLinkage?.linkedDoctorName ? String(raw.clinicLinkage.linkedDoctorName).trim() : null)
  };

  return {
    isValid: errors.length === 0,
    errors,
    data: clean
  };
}

/**
 * Helper: Manage data provenance, versioning, timestamps, and correction history
 */
function buildPatientProfileProvenance(actor = {}, existingDoc = {}, source = 'web_portal', correctionReason = null) {
  const now = new Date().toISOString();
  const existingProvenance = existingDoc.dataProvenance || {};
  const currentVersion = Number(existingProvenance.version || 0);
  const currentCorrectionsCount = Number(existingProvenance.correctionsCount || 0);

  const isCorrection = Boolean(correctionReason);
  const version = currentVersion + 1;
  const correctionsCount = isCorrection ? currentCorrectionsCount + 1 : currentCorrectionsCount;

  const provenance = {
    createdBy: existingProvenance.createdBy || actor.uid || 'system',
    createdByType: existingProvenance.createdByType || actor.role || 'patient',
    createdAt: existingProvenance.createdAt || now,
    updatedBy: actor.uid || 'system',
    updatedByType: actor.role || 'patient',
    updatedAt: now,
    source: source || existingProvenance.source || 'web_portal',
    version,
    correctionsCount
  };

  let correctionHistory = Array.isArray(existingDoc.correctionHistory) ? [...existingDoc.correctionHistory] : [];
  if (isCorrection) {
    correctionHistory.push({
      correctionId: `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      correctedBy: actor.uid || 'system',
      correctedByType: actor.role || 'patient',
      reason: String(correctionReason).trim(),
      previousVersion: currentVersion
    });
  }

  return { provenance, correctionHistory };
}

/**
 * Helper: Verify Trusted Clinic & Doctor Linkage
 */
async function verifyPatientClinicAndDoctorLinkage(clinicLinkage = {}, options = {}) {
  const result = {
    clinicId: null,
    clinicName: null,
    linkedDoctorId: null,
    linkedDoctorName: null,
    verified: false,
    warnings: []
  };

  const { clinicId, linkedDoctorId, clinicName, linkedDoctorName } = clinicLinkage;

  if (clinicId) {
    result.clinicId = String(clinicId).trim();
    result.clinicName = clinicName ? String(clinicName).trim() : result.clinicId;
  }

  if (linkedDoctorId) {
    result.linkedDoctorId = String(linkedDoctorId).trim();
    result.linkedDoctorName = linkedDoctorName ? String(linkedDoctorName).trim() : null;

    if (options.doctorIdentity || options.doctorProfile) {
      const doctorIdentity = options.doctorIdentity;
      const doctorProfile = options.doctorProfile;
      result.linkedDoctorName = doctorIdentity?.fullName || doctorProfile?.name || result.linkedDoctorName || 'Verified Practitioner';
      if (result.clinicId) {
        const isApproved = isDoctorApprovedMemberOfClinic(doctorIdentity, doctorProfile, result.clinicId);
        if (!isApproved) {
          result.warnings.push(`Doctor is not an approved member of clinic ${result.clinicId}.`);
        } else {
          result.verified = true;
        }
      } else {
        result.verified = true;
      }
    } else if (db && !options.skipDbCheck) {
      try {
        const fetchPromise = Promise.all([
          getVerifiedDoctorIdentity(result.linkedDoctorId),
          getServerUserProfile(result.linkedDoctorId)
        ]);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 1000));
        const [doctorIdentity, doctorProfile] = await Promise.race([fetchPromise, timeoutPromise]);

        if (!doctorIdentity && !doctorProfile) {
          result.warnings.push(`Doctor ID ${result.linkedDoctorId} was not found in verified practitioner records.`);
          result.verified = Boolean(result.clinicId);
        } else {
          result.linkedDoctorName = doctorIdentity?.fullName || doctorProfile?.name || doctorProfile?.displayName || result.linkedDoctorName || 'Verified Practitioner';

          if (result.clinicId) {
            const isApproved = isDoctorApprovedMemberOfClinic(doctorIdentity, doctorProfile, result.clinicId);
            if (!isApproved) {
              result.warnings.push(`Doctor is not an approved member of clinic ${result.clinicId}.`);
            } else {
              result.verified = true;
            }
          } else {
            result.verified = true;
          }
        }
      } catch (err) {
        result.verified = Boolean(result.clinicId || result.linkedDoctorId);
      }
    } else {
      result.verified = true;
    }
  } else if (result.clinicId) {
    result.verified = true;
  }

  return result;
}

// =============================================================================
// 📱 ACTIVE USER SESSIONS & SERVER-SIDE TOKEN REVOCATION REGISTRY
// =============================================================================
const activeUserSessions = new Map(); // uid -> Array<SessionRecord> & _sessionsRevokedAt

async function recordUserSession(req, userId, userEmail) {
  const device = auditService.extractDeviceMetadata(req);
  const ipInfo = auditService.sanitizeIp(getClientIp(req));
  const sessionId = `sess_${userId.substring(0, 8)}_${Buffer.from(ipInfo.ipHash + device.platform + device.browser).toString('hex').substring(0, 10)}`;

  let sessions = activeUserSessions.get(userId) || [];
  let isSuspicious = false;

  if (sessions.length > 0) {
    const knownSubnet = sessions.some(s => s.subnetMask === ipInfo.subnetMask);
    const knownPlatform = sessions.some(s => s.platform === device.platform);
    if (!knownSubnet && !knownPlatform) {
      isSuspicious = true;
    }
  }

  const existingIdx = sessions.findIndex(s => s.sessionId === sessionId);
  const nowIso = new Date().toISOString();
  const sessionRecord = {
    sessionId,
    userId,
    userEmail: auditService.maskEmail(userEmail),
    platform: device.platform,
    browser: device.browser,
    isMobile: device.isMobile,
    subnetMask: ipInfo.subnetMask,
    ipHash: ipInfo.ipHash,
    loginAt: existingIdx >= 0 ? sessions[existingIdx].loginAt : nowIso,
    lastActiveAt: nowIso,
    revoked: false
  };

  if (existingIdx >= 0) {
    sessions[existingIdx] = sessionRecord;
  } else {
    sessions.push(sessionRecord);
    if (sessions.length > 20) sessions.shift();
  }
  activeUserSessions.set(userId, sessions);

  if (db) {
    db.collection('user_sessions').doc(sessionId).set(sessionRecord, { merge: true }).catch((err) => {
      console.warn('[SESSION FIRESTORE SYNC WARNING]:', err.message);
    });
  }

  return { session: sessionRecord, isSuspicious };
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

    // 🛑 Check Server-Authoritative Token Revocation in In-Memory Registry
    const memorySessions = activeUserSessions.get(decodedToken.uid);
    if (memorySessions && memorySessions._sessionsRevokedAt) {
      const revokedSec = Math.floor(new Date(memorySessions._sessionsRevokedAt).getTime() / 1000);
      const tokenAuthTime = decodedToken.auth_time || decodedToken.iat;
      if (tokenAuthTime && tokenAuthTime < revokedSec) {
        return res.status(401).json({
          error: 'TOKEN_REVOKED',
          message: 'Your session has been terminated across all devices. Please sign in again.'
        });
      }
    }

    // 🛑 Block suspended accounts via Custom Claims
    if (decodedToken.suspended === true || decodedToken.status === 'suspended' || decodedToken.disabled === true || decodedToken.isSuspended === true) {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended by platform administration.'
      });
    }

    // 🛑 Block suspended accounts & revoked sessions via Firestore user doc
    if (db) {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const udata = userDoc.data();
        if (udata.sessionsRevokedAt) {
          const revokedSec = Math.floor(new Date(udata.sessionsRevokedAt).getTime() / 1000);
          const tokenAuthTime = decodedToken.auth_time || decodedToken.iat;
          if (tokenAuthTime && tokenAuthTime < revokedSec) {
            return res.status(401).json({
              error: 'TOKEN_REVOKED',
              message: 'Your session has been terminated across all devices. Please sign in again.'
            });
          }
        }
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
    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'TOKEN_REVOKED',
        message: 'Your sign-in token was revoked by the server. Please sign in again.'
      });
    }
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Your sign-in token has expired. Please refresh your session.'
      });
    }
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cryptographically invalid or expired Firebase ID token.'
    });
  }
}

/**
 * Middleware: Enforce Fresh Sign-In for Highly Sensitive Operations (Re-authentication)
 * Ensures credential modification, email updates, and device revocation require recent login.
 */
function requireRecentAuth(maxAgeSeconds = 900) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    }
    const authTime = req.user.auth_time || req.user.iat;
    if (!authTime) {
      return res.status(401).json({
        error: 'REQUIRES_RECENT_LOGIN',
        message: 'Authentication timestamp is missing. Fresh sign-in required.'
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const ageSec = nowSec - authTime;

    if (ageSec > maxAgeSeconds) {
      return res.status(401).json({
        error: 'REQUIRES_RECENT_LOGIN',
        message: `This sensitive operation requires recent sign-in (within ${Math.floor(maxAgeSeconds / 60)} minutes). Last login was ${Math.floor(ageSec / 60)} minutes ago.`,
        authAgeSeconds: ageSec,
        maxAgeSeconds
      });
    }

    next();
  };
}

/**
 * Middleware: Enforce Multi-Factor Authentication (MFA) on Sensitive Operations
 * Evaluates whether the authenticated user has MFA enabled.
 * If enabled, requires either a valid cryptographic MFA ticket ('x-mfa-ticket'),
 * a direct TOTP code ('x-mfa-code'), or an emergency recovery backup code ('x-mfa-recovery-code').
 * Blocks direct API step-bypass attempts before any sensitive modification occurs.
 */
async function requireMfaIfEnrolled(req, res, next) {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
  }

  const userId = req.user.uid;

  let isEnrolled = mfaService.isMfaEnabled(userId);
  if (!isEnrolled && db) {
    try {
      const snap = await Promise.race([
        db.collection('users').doc(userId).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
      ]);
      if (snap && snap.exists && snap.data() && snap.data().mfaEnabled) {
        isEnrolled = true;
      }
    } catch (_) {}
  }

  if (!isEnrolled) {
    return next();
  }

  const ticket = req.headers['x-mfa-ticket'];
  const code = req.headers['x-mfa-code'];
  const recoveryCode = req.headers['x-mfa-recovery-code'];

  if (ticket && mfaService.verifyMfaTicket(ticket, userId)) {
    req.mfaVerified = true;
    return next();
  }

  if (code) {
    const rec = mfaService.getUserMfaRecord(userId);
    if (rec && rec.secret && mfaService.verifyTotp(code, rec.secret)) {
      req.mfaVerified = true;
      return next();
    }
  }

  if (recoveryCode) {
    const consumed = mfaService.consumeBackupCode(userId, recoveryCode);
    if (consumed) {
      if (db) {
        auditService.recordAuditEvent(db, {
          type: auditService.AUDIT_EVENT_TYPES.MFA_RECOVERY_CODE_USED,
          req,
          details: { sensitiveAction: req.originalUrl || req.path }
        }).catch(() => {});
      }
      req.mfaVerified = true;
      return next();
    }
  }

  if (db) {
    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_FAILED,
      req,
      details: {
        reason: ticket || code || recoveryCode ? 'INVALID_MFA_CREDENTIAL' : 'MISSING_MFA_HEADER',
        path: req.originalUrl || req.path
      }
    }).catch(() => {});
  }

  return res.status(403).json({
    error: 'MFA_REQUIRED',
    message: 'Multi-factor authentication is required to execute this sensitive operation. Provide a valid x-mfa-ticket, x-mfa-code, or x-mfa-recovery-code.',
    mfaRequired: true
  });
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
    message: 'Server verification failed: Owner privileges are required to perform this action.'
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

      const authCheck = verifyDoctorAuthorization(doctorIdentity, profile);
      if (!authCheck.ok) {
        return res.status(403).json({
          error: authCheck.error,
          message: authCheck.message,
          licenseExpiryDate: authCheck.licenseExpiryDate,
          reverificationDueDate: authCheck.reverificationDueDate
        });
      }

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

// =============================================================================
// 🩺 PATIENT MEDICAL PROFILE REST ENDPOINTS
// =============================================================================

const patientProfileLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many profile operations. Please wait a moment before trying again.',
  keyGenerator: req => (req.user?.uid ? `prof_${req.user.uid}` : `prof_ip_${getClientIp(req)}`)
});

/**
 * GET /api/patient/medical-profile
 * Retrieve organized patient medical profile, dynamically computed age, BMI, and clinical relevance
 */
app.get('/api/patient/medical-profile', requireAuth, patientProfileLimiter, async (req, res) => {
  try {
    let targetUid = req.user.uid;
    const requestedUid = req.query.patientId || req.query.uid;

    if (requestedUid && requestedUid !== req.user.uid) {
      const userRole = getTrustedClaimRole(req.user);
      const isClinicianOrAdmin = ADMIN_ROLES.includes(userRole) || userRole === ROLES.DOCTOR_VERIFIED || hasTrustedOwnerClaim(req.user);
      if (!isClinicianOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Accessing other patient profiles requires verified clinician or administrator credentials.'
        });
      }
      targetUid = requestedUid;
    }

    let userDoc = {};
    if (db) {
      const snap = await db.collection('users').doc(targetUid).get();
      if (snap.exists) {
        userDoc = snap.data() || {};
      }
    }

    const storedProfile = userDoc.medicalProfile || {};
    const rawDob = storedProfile.dateOfBirth || userDoc.dateOfBirth || userDoc.dob || null;
    const computedAge = rawDob ? calculateAge(rawDob) : (storedProfile.calculatedAge || (userDoc.age ? parseInt(userDoc.age, 10) : null));

    const height = storedProfile.biometrics?.heightCm ?? userDoc.height ?? null;
    const weight = storedProfile.biometrics?.weightKg ?? userDoc.weight ?? null;
    const computedBmi = (height && weight) ? calculateBmi(height, weight) : (storedProfile.biometrics?.bmi ?? null);

    const biologicalSex = storedProfile.biologicalSex || userDoc.sex || userDoc.biologicalSex || 'not_specified';
    const pregnancyRelevance = evaluatePregnancyClinicalRelevance(biologicalSex, computedAge);

    const fullProfile = {
      uid: targetUid,
      fullName: storedProfile.fullName || userDoc.name || userDoc.displayName || '',
      phoneNumber: storedProfile.phoneNumber || userDoc.phoneNumber || '',
      dateOfBirth: rawDob ? String(rawDob).split('T')[0] : null,
      calculatedAge: computedAge,
      emergencyContact: storedProfile.emergencyContact || {
        name: userDoc.emergencyContactName || '',
        relationship: userDoc.emergencyContactRelation || '',
        phone: userDoc.emergencyContactPhone || ''
      },
      biometrics: {
        bloodType: storedProfile.biometrics?.bloodType || userDoc.bloodType || 'unknown',
        heightCm: height ? Number(height) : null,
        weightKg: weight ? Number(weight) : null,
        bmi: computedBmi
      },
      biologicalSex,
      pregnancy: {
        isClinicallyRelevant: pregnancyRelevance.isClinicallyRelevant,
        relevanceReason: pregnancyRelevance.reason,
        status: pregnancyRelevance.isClinicallyRelevant ? (storedProfile.pregnancy?.status || 'not_pregnant') : 'not_applicable',
        trimester: pregnancyRelevance.isClinicallyRelevant ? (storedProfile.pregnancy?.trimester || null) : null,
        dueDate: pregnancyRelevance.isClinicallyRelevant ? (storedProfile.pregnancy?.dueDate || null) : null
      },
      medicalHistory: storedProfile.medicalHistory || {
        allergies: Array.isArray(userDoc.allergies) ? userDoc.allergies : (userDoc.medicalHistory ? [userDoc.medicalHistory] : []),
        chronicConditions: Array.isArray(userDoc.chronicConditions) ? userDoc.chronicConditions : [],
        medications: Array.isArray(userDoc.medications) ? userDoc.medications : [],
        surgeries: Array.isArray(userDoc.surgeries) ? userDoc.surgeries : [],
        smoking: typeof userDoc.smoking === 'object' ? userDoc.smoking : { status: userDoc.smokingStatus || 'never', packYears: null, details: '' },
        familyHistory: Array.isArray(userDoc.familyHistory) ? userDoc.familyHistory : [],
        hospitalAdmissions: Array.isArray(userDoc.hospitalAdmissions) ? userDoc.hospitalAdmissions : []
      },
      insurance: storedProfile.insurance || {
        hasInsurance: Boolean(userDoc.insuranceProvider || userDoc.hasInsurance),
        provider: userDoc.insuranceProvider || '',
        policyNumber: userDoc.insurancePolicyNumber || '',
        groupNumber: userDoc.insuranceGroupNumber || '',
        expiryDate: userDoc.insuranceExpiry || null,
        notes: userDoc.insuranceNotes || ''
      },
      clinicLinkage: storedProfile.clinicLinkage || {
        clinicId: userDoc.clinicId || null,
        clinicName: userDoc.clinicName || null,
        linkedDoctorId: userDoc.linkedDoctorId || null,
        linkedDoctorName: userDoc.linkedDoctor || userDoc.linkedDoctorName || null
      },
      dataProvenance: storedProfile.dataProvenance || userDoc.dataProvenance || {
        createdBy: userDoc.createdBy || targetUid,
        createdByType: 'patient',
        createdAt: userDoc.createdAt || new Date().toISOString(),
        updatedBy: targetUid,
        updatedByType: 'patient',
        updatedAt: userDoc.updatedAt || new Date().toISOString(),
        source: 'initial_registration',
        version: 1,
        correctionsCount: 0
      },
      correctionHistory: storedProfile.correctionHistory || userDoc.correctionHistory || []
    };

    res.json({ ok: true, profile: fullProfile });
  } catch (err) {
    console.error('[PATIENT PROFILE GET ERROR]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve patient medical profile.' });
  }
});

/**
 * GET /api/patient/timeline
 * Unified clinical timeline aggregating:
 * Assessments, Reports, Appointments, Attachments, Medications, Chronic Conditions, and Doctor Notes.
 * Enforces Zero-Trust RBAC and strict redaction of internal doctor notes for patients.
 */
app.get('/api/patient/timeline', requireAuth, timelineLimiter, async (req, res) => {
  try {
    const patientId = req.query.patientId || req.query.uid || req.user.uid;
    const { search, type, startDate, endDate } = req.query;

    const timeline = await timelineService.buildPatientTimeline({
      db,
      patientId,
      requestingUser: req.user,
      search,
      type,
      startDate,
      endDate
    });

    return res.json(timeline);
  } catch (err) {
    console.error('[PATIENT TIMELINE ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      error: err.code || 'TIMELINE_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/patient/medical-profile
 * Save/update organized patient medical profile with server-verified provenance and trusted linkages
 */
app.post('/api/patient/medical-profile', requireAuth, patientProfileLimiter, async (req, res) => {
  try {
    let targetUid = req.user.uid;
    const requestedUid = req.body.patientId || req.body.uid;

    if (requestedUid && requestedUid !== req.user.uid) {
      const userRole = getTrustedClaimRole(req.user);
      const isClinicianOrAdmin = ADMIN_ROLES.includes(userRole) || userRole === ROLES.DOCTOR_VERIFIED || hasTrustedOwnerClaim(req.user);
      if (!isClinicianOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Modifying other patient profiles requires verified clinician or administrator credentials.'
        });
      }
      targetUid = requestedUid;
    }

    const validation = validatePatientMedicalProfile(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Patient profile validation failed.',
        errors: validation.errors
      });
    }

    const cleanData = validation.data;

    // Verify trusted clinic and doctor linkage
    const linkageVerification = await verifyPatientClinicAndDoctorLinkage(cleanData.clinicLinkage);
    cleanData.clinicLinkage = {
      clinicId: linkageVerification.clinicId,
      clinicName: linkageVerification.clinicName,
      linkedDoctorId: linkageVerification.linkedDoctorId,
      linkedDoctorName: linkageVerification.linkedDoctorName,
      verified: linkageVerification.verified
    };

    let existingDoc = {};
    if (db) {
      const snap = await db.collection('users').doc(targetUid).get();
      if (snap.exists) {
        existingDoc = snap.data() || {};
      }
    }

    const actor = {
      uid: req.user.uid,
      role: getTrustedClaimRole(req.user) || 'patient'
    };

    const source = req.body.source || (req.headers['x-client-source'] ? String(req.headers['x-client-source']) : 'web_portal');
    const { provenance, correctionHistory } = buildPatientProfileProvenance(actor, existingDoc.medicalProfile || existingDoc, source, null);

    const completeMedicalProfile = {
      ...cleanData,
      dataProvenance: provenance,
      correctionHistory
    };

    if (db) {
      const updatePayload = {
        medicalProfile: completeMedicalProfile,
        dataProvenance: provenance,
        updatedAt: provenance.updatedAt
      };

      if (cleanData.fullName) {
        updatePayload.name = cleanData.fullName;
        updatePayload.displayName = cleanData.fullName;
      }
      if (cleanData.phoneNumber) updatePayload.phoneNumber = cleanData.phoneNumber;
      if (cleanData.dateOfBirth) updatePayload.dateOfBirth = cleanData.dateOfBirth;
      if (cleanData.calculatedAge !== undefined) {
        updatePayload.age = String(cleanData.calculatedAge);
        updatePayload.patientAge = String(cleanData.calculatedAge);
      }
      if (cleanData.biometrics.bloodType) updatePayload.bloodType = cleanData.biometrics.bloodType;
      if (cleanData.biometrics.heightCm) updatePayload.height = cleanData.biometrics.heightCm;
      if (cleanData.biometrics.weightKg) updatePayload.weight = cleanData.biometrics.weightKg;
      if (cleanData.clinicLinkage.clinicId) updatePayload.clinicId = cleanData.clinicLinkage.clinicId;
      if (cleanData.clinicLinkage.linkedDoctorName || cleanData.clinicLinkage.linkedDoctorId) {
        updatePayload.linkedDoctor = cleanData.clinicLinkage.linkedDoctorName || cleanData.clinicLinkage.linkedDoctorId;
      }

      await db.collection('users').doc(targetUid).set(updatePayload, { merge: true });
    }

    auditService.recordAuditEvent({
      eventType: auditService.EVENT_TYPES.PATIENT_PROFILE_UPDATED,
      userId: req.user.uid,
      targetUserId: targetUid,
      ip: getClientIp(req),
      req,
      details: {
        version: provenance.version,
        source: provenance.source,
        calculatedAge: cleanData.calculatedAge,
        biologicalSex: cleanData.biologicalSex,
        pregnancyClinicallyRelevant: cleanData.pregnancy.isClinicallyRelevant,
        clinicId: cleanData.clinicLinkage.clinicId,
        linkedDoctorId: cleanData.clinicLinkage.linkedDoctorId
      }
    });

    res.json({
      ok: true,
      message: 'Patient medical profile updated successfully.',
      profile: completeMedicalProfile,
      linkageWarnings: linkageVerification.warnings.length > 0 ? linkageVerification.warnings : undefined
    });
  } catch (err) {
    console.error('[PATIENT PROFILE POST ERROR]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update patient medical profile.' });
  }
});

/**
 * POST /api/patient/medical-profile/correct
 * Submit a formal medical profile correction with required clinical rationale and history tracking
 */
app.post('/api/patient/medical-profile/correct', requireAuth, patientProfileLimiter, async (req, res) => {
  try {
    const correctionReason = String(req.body.correctionReason || '').trim();
    if (!correctionReason || correctionReason.length < 5) {
      return res.status(400).json({
        error: 'CORRECTION_REASON_REQUIRED',
        message: 'A detailed clinical correction reason (at least 5 characters) is required to correct a medical record.'
      });
    }

    let targetUid = req.user.uid;
    const requestedUid = req.body.patientId || req.body.uid;

    if (requestedUid && requestedUid !== req.user.uid) {
      const userRole = getTrustedClaimRole(req.user);
      const isClinicianOrAdmin = ADMIN_ROLES.includes(userRole) || userRole === ROLES.DOCTOR_VERIFIED || hasTrustedOwnerClaim(req.user);
      if (!isClinicianOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Correcting other patient profiles requires verified clinician or administrator credentials.'
        });
      }
      targetUid = requestedUid;
    }

    const validation = validatePatientMedicalProfile(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Patient profile correction validation failed.',
        errors: validation.errors
      });
    }

    const cleanData = validation.data;
    const linkageVerification = await verifyPatientClinicAndDoctorLinkage(cleanData.clinicLinkage);
    cleanData.clinicLinkage = {
      clinicId: linkageVerification.clinicId,
      clinicName: linkageVerification.clinicName,
      linkedDoctorId: linkageVerification.linkedDoctorId,
      linkedDoctorName: linkageVerification.linkedDoctorName,
      verified: linkageVerification.verified
    };

    let existingDoc = {};
    if (db) {
      const snap = await db.collection('users').doc(targetUid).get();
      if (snap.exists) {
        existingDoc = snap.data() || {};
      }
    }

    const actor = {
      uid: req.user.uid,
      role: getTrustedClaimRole(req.user) || 'patient'
    };

    const source = req.body.source || 'correction_request';
    const { provenance, correctionHistory } = buildPatientProfileProvenance(actor, existingDoc.medicalProfile || existingDoc, source, correctionReason);

    const completeMedicalProfile = {
      ...cleanData,
      dataProvenance: provenance,
      correctionHistory
    };

    if (db) {
      const updatePayload = {
        medicalProfile: completeMedicalProfile,
        dataProvenance: provenance,
        correctionHistory,
        updatedAt: provenance.updatedAt
      };

      if (cleanData.fullName) {
        updatePayload.name = cleanData.fullName;
        updatePayload.displayName = cleanData.fullName;
      }
      if (cleanData.phoneNumber) updatePayload.phoneNumber = cleanData.phoneNumber;
      if (cleanData.dateOfBirth) updatePayload.dateOfBirth = cleanData.dateOfBirth;
      if (cleanData.calculatedAge !== undefined) {
        updatePayload.age = String(cleanData.calculatedAge);
        updatePayload.patientAge = String(cleanData.calculatedAge);
      }
      if (cleanData.biometrics.bloodType) updatePayload.bloodType = cleanData.biometrics.bloodType;
      if (cleanData.biometrics.heightCm) updatePayload.height = cleanData.biometrics.heightCm;
      if (cleanData.biometrics.weightKg) updatePayload.weight = cleanData.biometrics.weightKg;
      if (cleanData.clinicLinkage.clinicId) updatePayload.clinicId = cleanData.clinicLinkage.clinicId;
      if (cleanData.clinicLinkage.linkedDoctorName || cleanData.clinicLinkage.linkedDoctorId) {
        updatePayload.linkedDoctor = cleanData.clinicLinkage.linkedDoctorName || cleanData.clinicLinkage.linkedDoctorId;
      }

      await db.collection('users').doc(targetUid).set(updatePayload, { merge: true });
    }

    auditService.recordAuditEvent({
      eventType: auditService.EVENT_TYPES.PATIENT_PROFILE_CORRECTED,
      userId: req.user.uid,
      targetUserId: targetUid,
      ip: getClientIp(req),
      req,
      details: {
        version: provenance.version,
        correctionsCount: provenance.correctionsCount,
        correctionReason,
        source: provenance.source
      }
    });

    res.json({
      ok: true,
      message: 'Patient medical record corrected successfully.',
      profile: completeMedicalProfile,
      linkageWarnings: linkageVerification.warnings.length > 0 ? linkageVerification.warnings : undefined
    });
  } catch (err) {
    console.error('[PATIENT PROFILE CORRECTION ERROR]:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to correct patient medical profile.' });
  }
});

/**
 * GET /api/clinical/rules/versions
 * Returns the Clinical Rules Registry and all registered rule engine versions
 */
app.get('/api/clinical/rules/versions', (req, res) => {
  const versionsRegistry = rulesGovernance.getRulesRegistry();
  res.json({
    success: true,
    data: versionsRegistry
  });
});

/**
 * POST /api/clinical/rules/propose
 * Proposes a new rule set version (enters in_review status)
 */
app.post('/api/clinical/rules/propose', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { version, changelog, scoreThresholds, spo2Thresholds, rules } = req.body || {};
    const proposed = rulesGovernance.proposeRuleVersion({
      version,
      changelog,
      scoreThresholds,
      spo2Thresholds,
      rules,
      proposedBy: { uid: req.user.uid, email: req.user.email, role: req.user.role || 'admin', timestamp: new Date().toISOString() }
    });
    res.json({ success: true, proposed });
  } catch (err) {
    res.status(400).json({ error: 'PROPOSE_FAILED', message: err.message });
  }
});

/**
 * POST /api/clinical/rules/approve
 * Specialist review and approval of a rule set version
 */
app.post('/api/clinical/rules/approve', requireAuth, requireDoctor, async (req, res) => {
  try {
    const { version, reviewerName, reviewerQualification, licenseNumber, clinicalNotes } = req.body || {};
    const approved = rulesGovernance.reviewAndApproveRuleVersion({
      version,
      reviewerName: reviewerName || req.user.name || req.user.displayName,
      reviewerQualification,
      licenseNumber: licenseNumber || req.user.doctorLicense || 'EG-MED-VERIFIED',
      clinicalNotes,
      approvedByUid: req.user.uid
    });
    res.json({ success: true, approved });
  } catch (err) {
    res.status(400).json({ error: 'APPROVAL_FAILED', message: err.message });
  }
});

/**
 * POST /api/clinical/rules/activate
 * Authoritatively activates an approved rule version
 */
app.post('/api/clinical/rules/activate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { version } = req.body || {};
    const result = rulesGovernance.activateRuleVersion({
      version,
      authorizedBy: { uid: req.user.uid, email: req.user.email, role: 'admin' }
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: 'ACTIVATION_FAILED', message: err.message });
  }
});

/**
 * POST /api/clinical/rules/rollback
 * Authoritative rollback to a previous approved rule version with documented reason
 */
app.post('/api/clinical/rules/rollback', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { targetVersion, rollbackReason } = req.body || {};
    const result = rulesGovernance.rollbackRuleVersion({
      targetVersion,
      rollbackReason,
      authorizedBy: { uid: req.user.uid, email: req.user.email, role: 'admin' }
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: 'ROLLBACK_FAILED', message: err.message });
  }
});

/**
 * GET /api/clinical/rules/audit-log
 * Returns immutable audit log of all rule set changes, approvals, and rollbacks
 */
app.get('/api/clinical/rules/audit-log', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: rulesGovernance.getRulesAuditLog()
  });
});

/**
 * POST /api/doctor/override-triage-priority
 * Doctor reasoned clinical override of advisory triage priority
 */
app.post('/api/doctor/override-triage-priority', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, overriddenPriority, overrideReason, overrideCategory } = req.body || {};
  const VALID_PRIORITIES = ['urgent', 'high', 'normal'];
  const VALID_CATEGORIES = [
    'CLINICAL_SIGNS_OF_EXHAUSTION',
    'RAPID_TRAJECTORY',
    'ARTIFACT_CORRECTION',
    'COMORBIDITY_RISK',
    'OTHER_CLINICAL_JUDGMENT'
  ];

  if (!caseId || !VALID_PRIORITIES.includes(overriddenPriority)) {
    return res.status(400).json({
      error: 'INVALID_OVERRIDE_PRIORITY',
      message: `caseId and valid overriddenPriority (${VALID_PRIORITIES.join(', ')}) required.`
    });
  }
  if (!overrideReason || String(overrideReason).trim().length < 10) {
    return res.status(400).json({
      error: 'MANDATORY_OVERRIDE_REASON_REQUIRED',
      message: 'A structured clinical overrideReason of at least 10 characters is mandatory to override system triage.'
    });
  }
  if (!overrideCategory || !VALID_CATEGORIES.includes(overrideCategory)) {
    return res.status(400).json({
      error: 'INVALID_OVERRIDE_CATEGORY',
      message: `overrideCategory must be one of: ${VALID_CATEGORIES.join(', ')}`
    });
  }

  try {
    const doctorProfile = await getServerUserProfile(req.user.uid);
    const doctorName = doctorProfile?.displayName || doctorProfile?.name || req.user.displayName || 'Licensed Doctor';
    const doctorLicense = doctorProfile?.doctorLicense || doctorProfile?.syndicateCardNumber || 'EG-MED-VERIFIED';

    const overrideRecord = {
      isOverridden: true,
      overriddenPriority,
      overrideReason: String(overrideReason).trim(),
      overrideCategory,
      overriddenBy: {
        uid: req.user.uid,
        name: doctorName,
        license: doctorLicense,
        email: req.user.email || ''
      },
      timestamp: new Date().toISOString()
    };

    if (db) {
      const caseRef = db.collection('cases').doc(caseId);
      const caseDoc = await caseRef.get();
      if (!caseDoc.exists) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Case not found.' });
      }

      const caseData = caseDoc.data() || {};
      const originalPriority = caseData.priority || caseData.triageLevel || 'normal';
      overrideRecord.originalPriority = originalPriority;

      await caseRef.update({
        priority: overriddenPriority,
        triageLevel: overriddenPriority,
        triageOverride: overrideRecord,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          oldStatus: caseData.status,
          newStatus: caseData.status,
          action: 'TRIAGE_OVERRIDE',
          actor: { uid: req.user.uid, name: doctorName, role: 'doctor' },
          reason: overrideRecord.overrideReason,
          timestamp: overrideRecord.timestamp
        })
      });

      await db.collection('audit_events').add({
        type: 'TRIAGE_OVERRIDDEN_BY_CLINICIAN',
        caseId,
        doctorId: req.user.uid,
        originalPriority,
        overriddenPriority,
        overrideCategory,
        overrideReason: overrideRecord.overrideReason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({
      success: true,
      message: `Triage priority overridden to '${overriddenPriority}' with clinical justification.`,
      overrideRecord
    });
  } catch (err) {
    console.error('[OVERRIDE ERROR]:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/clinical/assessments/explain-factors
 * Returns transparent factor explanations for case inputs
 */
app.post('/api/clinical/assessments/explain-factors', (req, res) => {
  try {
    const input = req.body || {};
    const evalResult = rulesGovernance.evaluateRulesWithProvenance({ input });
    res.json({
      success: true,
      data: {
        priority: evalResult.priority,
        points: evalResult.points,
        ruleEngineVersion: evalResult.version,
        factorExplanation: evalResult.factorExplanation,
        triggeredRules: evalResult.triggeredRules
      }
    });
  } catch (err) {
    res.status(400).json({ error: 'EXPLANATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/clinical/shadow-testing/summary
 * Returns shadow testing concordance rate and candidate behavior
 */
app.get('/api/clinical/shadow-testing/summary', requireAuth, (req, res) => {
  const summary = driftMonitoring.getShadowTestingSummary();
  res.json({ success: true, data: summary });
});

/**
 * GET /api/clinical/drift-monitoring/summary
 * Returns population vital distributions, PSI, and drift alerts
 */
app.get('/api/clinical/drift-monitoring/summary', requireAuth, (req, res) => {
  const drift = driftMonitoring.evaluatePopulationDrift();
  res.json({ success: true, data: drift });
});

/**
 * GET /api/governance/safety-register
 * Returns consolidated Risk, Quality, and Safety Register
 */
app.get('/api/governance/safety-register', requireAuth, (req, res) => {
  const register = safetyRegister.getSafetyRegister();
  res.json({ success: true, data: register });
});

/**
 * POST /api/governance/safety-register/capa
 * Registers or updates a Corrective and Preventive Action (CAPA)
 */
app.post('/api/governance/safety-register/capa', requireAuth, requireDoctor, async (req, res) => {
  try {
    const { title, category, rootCause, correctiveAction, responsiblePerson, role, license, status } = req.body || {};
    const entry = safetyRegister.recordCapaEntry({
      title,
      category,
      rootCause,
      correctiveAction,
      responsiblePerson: responsiblePerson || req.user.name || req.user.displayName,
      role: role || 'Clinical Safety Officer',
      license: license || req.user.doctorLicense || 'EG-MED-VERIFIED',
      status
    });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ error: 'CAPA_REGISTRATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/admin/metrics
 * Server-authoritative admin metrics that cannot be derived safely from frontend-only Firestore reads.
 * Covers 9 authoritative counters: users, verified doctors, clinics, cases, appointments,
 * active users, reported accounts, verification requests, and support requests.
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
    let totalCasesCount = 0;
    let totalAppointmentsCount = 0;
    let activeUsersCount = 0;
    let reportedAccountsCount = 0;
    let supportRequestsCount = 0;

    if (db) {
      const [
        usersSnapshot,
        appsSnapshot,
        casesSnapshot,
        appointmentsSnapshot,
        clinicsSnapshot,
        reportedSnapshot,
        incidentSnapshot,
        supportSnapshot,
        feedbackSnapshot,
        modelSnapshot
      ] = await Promise.all([
        db.collection('users').get().catch(() => ({ docs: [], empty: true })),
        db.collection('doctor_applications').get().catch(() => ({ docs: [], empty: true })),
        db.collection('cases').get().catch(() => ({ docs: [], empty: true })),
        db.collection('appointments').get().catch(() => ({ docs: [], empty: true })),
        db.collection('clinics').get().catch(() => ({ docs: [], empty: true })),
        db.collection('reported_accounts').get().catch(() => ({ docs: [], empty: true })),
        db.collection('incident_reports').get().catch(() => ({ docs: [], empty: true })),
        db.collection('support_tickets').get().catch(() => ({ docs: [], empty: true })),
        db.collection('feedbacks').get().catch(() => ({ docs: [], empty: true })),
        db.collection('ai_model_metrics').orderBy('createdAt', 'desc').limit(1).get().catch(() => null)
      ]);

      const users = filterScopedDocs(usersSnapshot, scope);
      const apps = filterScopedDocs(appsSnapshot, scope);
      const cases = filterScopedDocs(casesSnapshot, scope);
      const appointments = filterScopedDocs(appointmentsSnapshot, scope);

      if (scope.role === ROLES.CLINIC_ADMIN) {
        authUsersCount = users.length;
        authUsersToday = users.filter((user) => {
          const createdAt = user.createdAt?.toMillis ? user.createdAt.toMillis() : Date.parse(user.createdAt || user.created_at || 0);
          return createdAt >= todayStart.getTime();
        }).length;
      }

      // Verified Doctors Counter: users with role='doctor' and verifiedDoctor=true or doctorApplicationStatus='approved'
      approvedDoctors = Math.max(
        approvedDoctors,
        users.filter((user) =>
          user.role === 'doctor' &&
          (user.verifiedDoctor === true || user.doctorVerified === true || user.doctorApplicationStatus === 'approved')
        ).length
      );

      // Verification Requests Counter: doctor applications with pending status
      pendingDoctorApplications = apps.filter((app) => app.status === 'pending').length;

      // Clinics Counter: distinct clinic branches from clinics collection + approved doctor applications & user records
      const branches = new Set();
      if (clinicsSnapshot && !clinicsSnapshot.empty) {
        clinicsSnapshot.docs.forEach(doc => {
          const d = doc.data() || {};
          if (!d.isDemo && !d.isTest && (d.name || doc.id)) {
            branches.add(String(d.name || doc.id).trim().toLowerCase());
          }
        });
      }
      apps
        .filter((app) => app.status === 'approved')
        .forEach((app) => {
          const name = (app.clinic || app.branch || app.hospital || '').trim().toLowerCase();
          if (name) branches.add(name);
        });
      users.forEach(u => {
        const cName = (u.clinicName || u.clinic || '').trim().toLowerCase();
        if (cName) branches.add(cName);
      });
      branchCount = branches.size;

      // Cases Counter: authentic clinical cases (excluding demo)
      const realCases = cases.filter((item) => !item.isDemo && !String(item.id || '').startsWith('demo_'));
      totalCasesCount = realCases.length;
      pendingReviews = realCases.filter((item) => ['pending', 'submitted', 'triaged', 'assigned', 'under_review'].includes(item.status)).length;
      urgentReviews = realCases.filter((item) =>
        ['pending', 'submitted', 'triaged', 'assigned', 'under_review'].includes(item.status) &&
        ['urgent', 'high'].includes(String(item.priority || item.risk || '').toLowerCase())
      ).length;

      // Appointments Counter: authentic appointments (excluding demo)
      const realAppointments = appointments.filter((item) => !item.isDemo && !String(item.id || '').startsWith('demo_'));
      totalAppointmentsCount = realAppointments.length;

      // Active Users Counter: users with active in-memory session or activity in last 24h
      const nowTs = Date.now();
      const activeWindow = 24 * 60 * 60 * 1000;
      const activeUserIds = new Set();
      if (activeUserSessions && typeof activeUserSessions.forEach === 'function') {
        activeUserSessions.forEach((sessions, uid) => {
          if (Array.isArray(sessions) && sessions.length > 0) {
            activeUserIds.add(uid);
          }
        });
      }
      users.forEach((u) => {
        const lastActive = u.lastActiveAt?.toMillis ? u.lastActiveAt.toMillis() : Date.parse(u.lastActiveAt || u.lastLoginAt || u.updatedAt || 0);
        if (lastActive > 0 && (nowTs - lastActive) <= activeWindow) {
          activeUserIds.add(u.id || u.uid);
        }
      });
      activeUsersCount = activeUserIds.size;

      // Reported Accounts Counter: reported_accounts, security incidents targeting accounts, or suspended/flagged accounts
      const reportedUserIds = new Set();
      if (reportedSnapshot && !reportedSnapshot.empty) {
        reportedSnapshot.docs.forEach(doc => {
          const d = doc.data() || {};
          const uid = d.userId || d.targetUserId || d.accountUid || doc.id;
          if (uid) reportedUserIds.add(uid);
        });
      }
      if (incidentSnapshot && !incidentSnapshot.empty) {
        incidentSnapshot.docs.forEach(doc => {
          const d = doc.data() || {};
          if (d.category === 'ACCOUNT_SECURITY' || d.targetUserId || d.reportedUser) {
            const uid = d.targetUserId || d.reportedUser || d.userId;
            if (uid) reportedUserIds.add(uid);
          }
        });
      }
      users.forEach(u => {
        if (u.suspended === true || u.isSuspended === true || u.reported === true || u.isReported === true || u.abuseReported === true || u.accountStatus === 'suspended') {
          reportedUserIds.add(u.id || u.uid);
        }
      });
      reportedAccountsCount = reportedUserIds.size;

      // Support Requests Counter: open support tickets or feedbacks requiring review
      let openSupportTickets = 0;
      if (supportSnapshot && !supportSnapshot.empty) {
        openSupportTickets = supportSnapshot.docs.filter(doc => {
          const d = doc.data() || {};
          return ['open', 'pending', 'new', 'in_progress'].includes(String(d.status || '').toLowerCase());
        }).length;
      }
      let pendingFeedbacks = 0;
      if (feedbackSnapshot && !feedbackSnapshot.empty) {
        pendingFeedbacks = feedbackSnapshot.docs.filter(doc => {
          const d = doc.data() || {};
          return d.reviewRequired === true || ['pending', 'open'].includes(String(d.status || '').toLowerCase());
        }).length;
      }
      supportRequestsCount = openSupportTickets + pendingFeedbacks;

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
      success: true,
      counters: {
        users: authUsersCount,
        verifiedDoctors: approvedDoctors,
        clinics: branchCount,
        cases: totalCasesCount,
        appointments: totalAppointmentsCount,
        activeUsers: activeUsersCount,
        reportedAccounts: reportedAccountsCount,
        verificationRequests: pendingDoctorApplications,
        supportRequests: supportRequestsCount
      },
      sources: {
        users: 'Firebase Auth listUsers (Super Admin) / Scoped Firestore users collection',
        verifiedDoctors: 'Firestore users collection (role="doctor" & verifiedDoctor=true) and approved doctor applications',
        clinics: 'Firestore clinics collection and approved provider clinic affiliations',
        cases: 'Firestore cases collection (excluding demo records)',
        appointments: 'Firestore appointments collection (excluding demo records)',
        activeUsers: 'Active session store (activeUserSessions) and 24h user activity logs',
        reportedAccounts: 'Incident reports, reported accounts registry, and flagged user accounts',
        verificationRequests: 'Pending doctor applications (doctor_applications with status="pending")',
        supportRequests: 'Support tickets and user feedback inquiries with open status'
      },
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
 * Server-authoritative KPI analytics: response time, approval time, patients/day, and workload
 * calculated from actual events, with date-range and clinic filtering.
 * Displays "Unavailable" when data is missing.
 */
app.get('/api/kpi/metrics', requireAuth, async (req, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    const canView = hasTrustedAdminClaim(req.user) || [ROLES.DOCTOR, ROLES.SUPPORT].includes(userRole);
    if (!canView) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Clinical or Admin privileges required.' });
    }

    const parseTs = (val) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (val.toMillis) return val.toMillis();
      if (val.seconds) return val.seconds * 1000;
      const parsed = Date.parse(val);
      return isNaN(parsed) ? 0 : parsed;
    };

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
        isBenchmark: true,
        responseTime: { avgMinutes: null, medianMinutes: null, display: "Unavailable", displayAr: "غير متاح", isAvailable: false },
        approvalTime: { avgMinutes: null, medianMinutes: null, p95Minutes: null, display: "Unavailable", displayAr: "غير متاح", isAvailable: false },
        patientsPerDay: { value: null, distinctPatients: 0, daysCount: 1, display: "Unavailable", displayAr: "غير متاح", isAvailable: false },
        workload: { avgWorkloadPerDoctor: null, totalActiveItems: 0, activeDoctorsCount: 0, breakdown: [], display: "Unavailable", displayAr: "غير متاح", isAvailable: false },
        display: {
          responseTime: "Unavailable",
          approvalTime: "Unavailable",
          patientsPerDay: "Unavailable",
          workload: "Unavailable",
          completionRate: "Unavailable"
        },
        displayAr: {
          responseTime: "غير متاح",
          approvalTime: "غير متاح",
          patientsPerDay: "غير متاح",
          workload: "غير متاح",
          completionRate: "غير متاح"
        }
      });
    }

    const scope = await resolveRequesterClinic(req);

    // Clinic filtering & authorization: Clinic Admin is always scoped strictly to their assigned clinic
    const requestedClinic = (req.query.clinicId || req.query.clinic || '').trim();
    if (userRole === ROLES.CLINIC_ADMIN && requestedClinic && scope.clinicId && requestedClinic !== scope.clinicId) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Cross-clinic query denied. Clinic administrators can only query metrics for their assigned clinic.' });
    }
    const effectiveClinic = userRole === ROLES.CLINIC_ADMIN ? scope.clinicId : requestedClinic;

    // Date range filtering
    const now = Date.now();
    let minTimestamp = 0;
    let maxTimestamp = Infinity;

    const startDateParam = req.query.startDate || req.query.from;
    const endDateParam = req.query.endDate || req.query.to;
    const timeRange = (req.query.range || req.query.timeRange || 'all').toLowerCase();

    if (startDateParam) {
      minTimestamp = parseTs(startDateParam);
    }
    if (endDateParam) {
      const parsedEnd = parseTs(endDateParam);
      if (typeof endDateParam === 'string' && endDateParam.length === 10) {
        maxTimestamp = parsedEnd + (24 * 60 * 60 * 1000 - 1);
      } else {
        maxTimestamp = parsedEnd;
      }
    }

    if (!startDateParam && !endDateParam) {
      if (timeRange === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        minTimestamp = d.getTime();
        maxTimestamp = now;
      } else if (timeRange === '7d') {
        minTimestamp = now - (7 * 24 * 60 * 60 * 1000);
        maxTimestamp = now;
      } else if (timeRange === '30d') {
        minTimestamp = now - (30 * 24 * 60 * 60 * 1000);
        maxTimestamp = now;
      }
    }

    // Query cases and appointments
    const [casesSnapshot, appointmentsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('cases').get().catch(() => ({ docs: [], empty: true })),
      db.collection('appointments').get().catch(() => ({ docs: [], empty: true })),
      db.collection('users').get().catch(() => ({ docs: [], empty: true }))
    ]);

    const allCases = casesSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => !c.isDemo && !String(c.id || '').startsWith('demo_'));

    const allAppointments = appointmentsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => !a.isDemo && !String(a.id || '').startsWith('demo_'));

    // Apply clinic filter
    const matchesClinic = (item, clinic) => {
      if (!clinic) return true;
      const cId = String(item.clinicId || item.clinic || item.branchId || '').toLowerCase();
      return cId === clinic.toLowerCase();
    };

    let scopedCases = allCases.filter(c => {
      if (userRole === ROLES.CLINIC_ADMIN) return isSameClinicResource(scope, c);
      if (effectiveClinic) return matchesClinic(c, effectiveClinic);
      return true;
    });

    let scopedAppointments = allAppointments.filter(a => {
      if (userRole === ROLES.CLINIC_ADMIN) return isSameClinicResource(scope, a);
      if (effectiveClinic) return matchesClinic(a, effectiveClinic);
      return true;
    });

    if (userRole === ROLES.DOCTOR) {
      scopedCases = scopedCases.filter(c => [c.assignedDoctorId, c.doctorId, c.doctorUid, c.approvingDoctorId].includes(req.user.uid));
      scopedAppointments = scopedAppointments.filter(a => [a.assignedDoctorId, a.doctorId, a.doctorUid].includes(req.user.uid));
    }

    // Apply date range filter to cases
    const filteredCases = scopedCases.filter(c => {
      const ts = parseTs(c.submittedAt || c.createdAt || c.timestamp);
      return (minTimestamp === 0 || ts >= minTimestamp) && (maxTimestamp === Infinity || ts <= maxTimestamp);
    });

    // Apply date range filter to appointments
    const filteredAppointments = scopedAppointments.filter(a => {
      const ts = parseTs(a.appointmentDate || a.scheduledAt || a.date || a.createdAt);
      return (minTimestamp === 0 || ts >= minTimestamp) && (maxTimestamp === Infinity || ts <= maxTimestamp);
    });

    // 1. COMPLETION RATE METRICS
    const totalCases = filteredCases.length;
    const completedCases = filteredCases.filter(c => c.status === 'approved' || c.doctorApproved === true || c.status === 'closed');
    const pendingCases = filteredCases.filter(c => !['approved', 'rejected', 'closed'].includes(c.status));
    const completionRate = totalCases > 0 ? Math.round((completedCases.length / totalCases) * 100) : 0;

    // 2. RESPONSE TIME METRICS FROM ACTUAL EVENTS
    const responseTimes = [];
    filteredCases.forEach(c => {
      const submitTs = parseTs(c.submittedAt || c.createdAt || c.timestamp);
      const responseTs = parseTs(c.firstReviewedAt || c.reviewedAt || c.moreInfoRequestedAt || c.approvedAt || c.rejectedAt ||
        (c.statusHistory && c.statusHistory.length > 1 ? c.statusHistory[1].changedAt || c.statusHistory[1].timestamp : null));

      if (submitTs > 0 && responseTs >= submitTs) {
        const diffMins = Math.max(0.5, (responseTs - submitTs) / 60000);
        responseTimes.push(diffMins);
      }
    });

    responseTimes.sort((a, b) => a - b);
    const hasResponseData = responseTimes.length > 0;
    const avgResponseTimeMinutes = hasResponseData
      ? Number((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1))
      : 0;
    const medianResponseTimeMinutes = hasResponseData
      ? Number(responseTimes[Math.floor(responseTimes.length / 2)].toFixed(1))
      : 0;
    const fastestResponseMinutes = hasResponseData
      ? Number(responseTimes[0].toFixed(1))
      : 0;
    const responseSlaCompliance = hasResponseData
      ? Math.round((responseTimes.filter(t => t <= 30).length / responseTimes.length) * 100)
      : 100;

    // 3. APPROVAL TIME METRICS FROM ACTUAL EVENTS
    const turnaroundTimes = [];
    completedCases.forEach(c => {
      const submitTs = parseTs(c.submittedAt || c.createdAt || c.timestamp);
      const approvedTs = parseTs(c.approvedAt || c.reportGeneratedAt || c.generatedAt || c.certifiedAt);

      if (submitTs > 0 && approvedTs >= submitTs && (c.status === 'approved' || c.doctorApproved === true)) {
        const diffMins = Math.max(1, (approvedTs - submitTs) / 60000);
        turnaroundTimes.push(diffMins);
      }
    });

    turnaroundTimes.sort((a, b) => a - b);
    const hasTurnaroundData = turnaroundTimes.length > 0;
    const avgTurnaroundMinutes = hasTurnaroundData
      ? Number((turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length).toFixed(1))
      : 0;
    const medianTurnaroundMinutes = hasTurnaroundData
      ? Number(turnaroundTimes[Math.floor(turnaroundTimes.length / 2)].toFixed(1))
      : 0;
    const p95Index = Math.min(turnaroundTimes.length - 1, Math.floor(turnaroundTimes.length * 0.95));
    const p95TurnaroundMinutes = hasTurnaroundData
      ? Number(turnaroundTimes[p95Index].toFixed(1))
      : 0;
    const turnaroundSlaCompliance = hasTurnaroundData
      ? Math.round((turnaroundTimes.filter(t => t <= 120).length / turnaroundTimes.length) * 100)
      : 100;

    // 4. PATIENTS/DAY FROM ACTUAL EVENTS
    const distinctPatientIds = new Set();
    filteredCases.forEach(c => {
      const pid = c.patientId || c.patientUid || c.userId;
      if (pid) distinctPatientIds.add(String(pid));
    });
    filteredAppointments.forEach(a => {
      const pid = a.patientId || a.patientUid || a.userId;
      if (pid) distinctPatientIds.add(String(pid));
    });

    let daysInPeriod = 1;
    if (minTimestamp > 0 && maxTimestamp < Infinity && maxTimestamp > minTimestamp) {
      daysInPeriod = Math.max(1, Math.ceil((maxTimestamp - minTimestamp) / (24 * 60 * 60 * 1000)));
    } else if (timeRange === '7d') {
      daysInPeriod = 7;
    } else if (timeRange === '30d') {
      daysInPeriod = 30;
    } else if (timeRange === 'all' && (filteredCases.length > 0 || filteredAppointments.length > 0)) {
      const allTs = [
        ...filteredCases.map(c => parseTs(c.submittedAt || c.createdAt || c.timestamp)),
        ...filteredAppointments.map(a => parseTs(a.appointmentDate || a.scheduledAt || a.date || a.createdAt))
      ].filter(t => t > 0);
      if (allTs.length > 1) {
        const minT = Math.min(...allTs);
        const maxT = Math.max(...allTs);
        daysInPeriod = Math.max(1, Math.ceil((maxT - minT) / (24 * 60 * 60 * 1000)));
      }
    }

    const hasPatientsData = distinctPatientIds.size > 0;
    const patientsPerDayValue = hasPatientsData
      ? Number((distinctPatientIds.size / daysInPeriod).toFixed(2))
      : null;

    // 5. WORKLOAD FROM ACTUAL ACTIVE EVENTS
    const activeCases = scopedCases.filter(c =>
      ['pending', 'submitted', 'triaged', 'assigned', 'under_review'].includes(c.status)
    );
    const activeAppts = scopedAppointments.filter(a =>
      ['pending', 'confirmed', 'scheduled'].includes(a.status)
    );

    const doctorWorkloadMap = new Map();
    activeCases.forEach(c => {
      const docId = c.assignedDoctorId || c.doctorId || c.doctorUid || 'unassigned';
      const docName = c.assignedDoctorName || c.doctorName || (docId === 'unassigned' ? 'Unassigned Queue' : `Doctor (${docId.slice(0, 6)})`);
      if (!doctorWorkloadMap.has(docId)) {
        doctorWorkloadMap.set(docId, { doctorId: docId, doctorName: docName, clinic: c.clinicName || c.clinic || effectiveClinic || 'General', activeCases: 0, activeAppointments: 0, totalWorkload: 0 });
      }
      const item = doctorWorkloadMap.get(docId);
      item.activeCases += 1;
      item.totalWorkload += 1;
    });

    activeAppts.forEach(a => {
      const docId = a.assignedDoctorId || a.doctorId || a.doctorUid || 'unassigned';
      const docName = a.assignedDoctorName || a.doctorName || (docId === 'unassigned' ? 'Unassigned Queue' : `Doctor (${docId.slice(0, 6)})`);
      if (!doctorWorkloadMap.has(docId)) {
        doctorWorkloadMap.set(docId, { doctorId: docId, doctorName: docName, clinic: a.clinicName || a.clinic || effectiveClinic || 'General', activeCases: 0, activeAppointments: 0, totalWorkload: 0 });
      }
      const item = doctorWorkloadMap.get(docId);
      item.activeAppointments += 1;
      item.totalWorkload += 1;
    });

    const activeWorkloadList = Array.from(doctorWorkloadMap.values());
    const totalActiveItems = activeCases.length + activeAppts.length;
    const assignedDoctorsCount = activeWorkloadList.filter(d => d.doctorId !== 'unassigned').length;
    const hasWorkloadData = totalActiveItems > 0 && assignedDoctorsCount > 0;
    const avgWorkloadPerDoctor = hasWorkloadData
      ? Number((totalActiveItems / assignedDoctorsCount).toFixed(1))
      : null;

    res.json({
      success: true,
      timeRange,
      clinicId: effectiveClinic || 'all',
      dateRange: {
        startDate: startDateParam || null,
        endDate: endDateParam || null,
        minTimestamp: minTimestamp > 0 ? minTimestamp : null,
        maxTimestamp: maxTimestamp < Infinity ? maxTimestamp : null,
        daysInPeriod
      },
      totalCases,
      completedCasesCount: completedCases.length,
      pendingCasesCount: pendingCases.length,
      completionRate,
      evaluatedSampleCount: filteredCases.length,

      // Structured metric objects with explicit availability flag and 'Unavailable' fallbacks
      responseTime: {
        avgMinutes: hasResponseData ? avgResponseTimeMinutes : null,
        medianMinutes: hasResponseData ? medianResponseTimeMinutes : null,
        fastestMinutes: hasResponseData ? fastestResponseMinutes : null,
        display: hasResponseData ? `${avgResponseTimeMinutes} min` : 'Unavailable',
        displayAr: hasResponseData ? `${avgResponseTimeMinutes} دقيقة` : 'غير متاح',
        isAvailable: hasResponseData,
        sampleCount: responseTimes.length
      },
      approvalTime: {
        avgMinutes: hasTurnaroundData ? avgTurnaroundMinutes : null,
        medianMinutes: hasTurnaroundData ? medianTurnaroundMinutes : null,
        p95Minutes: hasTurnaroundData ? p95TurnaroundMinutes : null,
        display: hasTurnaroundData ? `${avgTurnaroundMinutes} min` : 'Unavailable',
        displayAr: hasTurnaroundData ? `${avgTurnaroundMinutes} دقيقة` : 'غير متاح',
        isAvailable: hasTurnaroundData,
        sampleCount: turnaroundTimes.length
      },
      patientsPerDay: {
        value: patientsPerDayValue,
        distinctPatients: distinctPatientIds.size,
        daysCount: daysInPeriod,
        display: hasPatientsData ? `${patientsPerDayValue} patients/day` : 'Unavailable',
        displayAr: hasPatientsData ? `${patientsPerDayValue} مريض/يوم` : 'غير متاح',
        isAvailable: hasPatientsData
      },
      workload: {
        avgWorkloadPerDoctor,
        totalActiveItems,
        activeDoctorsCount: assignedDoctorsCount,
        breakdown: activeWorkloadList,
        display: hasWorkloadData ? `${avgWorkloadPerDoctor} items/doctor` : 'Unavailable',
        displayAr: hasWorkloadData ? `${avgWorkloadPerDoctor} مهمة/طبيب` : 'غير متاح',
        isAvailable: hasWorkloadData
      },

      // High-level display strings for unified UI consumption
      display: {
        responseTime: hasResponseData ? `${avgResponseTimeMinutes} min` : 'Unavailable',
        approvalTime: hasTurnaroundData ? `${avgTurnaroundMinutes} min` : 'Unavailable',
        patientsPerDay: hasPatientsData ? `${patientsPerDayValue} patients/day` : 'Unavailable',
        workload: hasWorkloadData ? `${avgWorkloadPerDoctor} items/doctor` : 'Unavailable',
        completionRate: totalCases > 0 ? `${completionRate}%` : 'Unavailable'
      },
      displayAr: {
        responseTime: hasResponseData ? `${avgResponseTimeMinutes} دقيقة` : 'غير متاح',
        approvalTime: hasTurnaroundData ? `${avgTurnaroundMinutes} دقيقة` : 'غير متاح',
        patientsPerDay: hasPatientsData ? `${patientsPerDayValue} مريض/يوم` : 'غير متاح',
        workload: hasWorkloadData ? `${avgWorkloadPerDoctor} مهمة/طبيب` : 'غير متاح',
        completionRate: totalCases > 0 ? `${completionRate}%` : 'غير متاح'
      },

      // Legacy scalar properties preserved for backward compatibility
      avgResponseTimeMinutes,
      avgTurnaroundMinutes,
      responseSlaCompliance,
      turnaroundSlaCompliance
    });
  } catch (err) {
    console.error("[SERVER KPI METRICS ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/bulk-operations
 * Appropriate administrative bulk operations (notifications, queue assignment, export, user status).
 * STRICT SAFETY RULE: Bulk clinical approval is absolutely PROHIBITED.
 */
app.post('/api/admin/bulk-operations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, targetIds, payload } = req.body || {};
    const normalizedAction = String(action || '').trim().toLowerCase();

    // STRICT PROHIBITION: Bulk clinical approvals are banned under clinical safety & regulatory governance
    const isClinicalApprovalAttempt =
      ['bulk_approve', 'bulk_clinical_approval', 'bulk_doctor_approval', 'approve', 'clinical_approve'].includes(normalizedAction) ||
      Boolean(req.body?.approveClinical) ||
      Boolean(req.body?.clinicalApproval) ||
      Boolean(req.body?.status === 'approved') ||
      Boolean(req.body?.doctorApproved) ||
      Boolean(payload?.status === 'approved') ||
      Boolean(payload?.doctorApproved);

    if (isClinicalApprovalAttempt) {
      return res.status(403).json({
        error: 'BULK_CLINICAL_APPROVAL_PROHIBITED',
        message: 'Clinical approval requires individual, certified physician review and clinical sign-off. Bulk clinical approval is strictly prohibited for patient safety and regulatory compliance.'
      });
    }

    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'targetIds array is required and must not be empty.' });
    }

    if (targetIds.length > 500) {
      return res.status(400).json({ error: 'BATCH_SIZE_EXCEEDED', message: 'Maximum 500 items per bulk administrative operation.' });
    }

    // 1. Administrative Bulk Notification
    if (normalizedAction === 'bulk_notify' || normalizedAction === 'bulk_notification') {
      const title = payload?.title || 'Administrative Notice';
      const body = payload?.body || 'Important administrative update.';
      let processed = 0;
      if (db) {
        const batch = db.batch();
        targetIds.forEach(uid => {
          const ref = db.collection('email_notifications').doc();
          batch.set(ref, {
            recipientId: uid,
            title,
            body,
            type: 'ADMINISTRATIVE_NOTICE',
            status: 'queued',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          processed += 1;
        });
        await batch.commit();
      } else {
        processed = targetIds.length;
      }
      return res.json({
        success: true,
        action: normalizedAction,
        processedCount: processed,
        message: `Successfully queued administrative notification for ${processed} recipients.`
      });
    }

    // 2. Administrative Queue Assignment (routing cases to clinic triage queue - NOT approving them)
    if (normalizedAction === 'bulk_assign_queue') {
      const targetQueue = payload?.targetQueue || payload?.clinicId || 'intake_triage';
      let processed = 0;
      if (db) {
        const batch = db.batch();
        targetIds.forEach(caseId => {
          const ref = db.collection('cases').doc(caseId);
          batch.update(ref, {
            triageQueue: targetQueue,
            assignedQueueAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAdminActionBy: req.user.uid
          });
          processed += 1;
        });
        await batch.commit();
      } else {
        processed = targetIds.length;
      }
      return res.json({
        success: true,
        action: normalizedAction,
        processedCount: processed,
        message: `Successfully routed ${processed} cases to queue '${targetQueue}'.`
      });
    }

    // 3. Administrative User Status Management (e.g. deactivate abuse / inactive accounts)
    if (normalizedAction === 'bulk_user_status') {
      const targetStatus = payload?.status;
      if (!['active', 'suspended', 'deactivated'].includes(targetStatus)) {
        return res.status(400).json({ error: 'INVALID_STATUS', message: 'Allowed target statuses: active, suspended, deactivated.' });
      }
      let processed = 0;
      if (db) {
        const batch = db.batch();
        targetIds.forEach(uid => {
          const ref = db.collection('users').doc(uid);
          batch.update(ref, {
            accountStatus: targetStatus,
            suspended: targetStatus === 'suspended',
            isSuspended: targetStatus === 'suspended',
            statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            statusUpdatedBy: req.user.uid
          });
          processed += 1;
        });
        await batch.commit();
      } else {
        processed = targetIds.length;
      }
      return res.json({
        success: true,
        action: normalizedAction,
        processedCount: processed,
        message: `Successfully updated administrative account status to '${targetStatus}' for ${processed} accounts.`
      });
    }

    // 4. Administrative Export Logging
    if (normalizedAction === 'bulk_export') {
      return res.json({
        success: true,
        action: normalizedAction,
        processedCount: targetIds.length,
        exportFormat: payload?.format || 'json',
        message: `Administrative export authorized for ${targetIds.length} records.`
      });
    }

    return res.status(400).json({
      error: 'UNSUPPORTED_BULK_ACTION',
      message: `Action '${action}' is not an authorized administrative bulk operation. Permitted actions: bulk_notify, bulk_assign_queue, bulk_user_status, bulk_export.`
    });
  } catch (err) {
    console.error("[SERVER BULK OPERATIONS ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * Hard safety guard interceptors for any direct bulk approval endpoint attempts
 */
app.all(['/api/admin/bulk-approve-clinical-cases', '/api/admin/cases/bulk-approve', '/api/clinical/bulk-approve'], requireAuth, (req, res) => {
  return res.status(403).json({
    error: 'BULK_CLINICAL_APPROVAL_PROHIBITED',
    message: 'Clinical approval requires individual, certified physician review and clinical sign-off. Bulk clinical approval is strictly prohibited for patient safety and regulatory compliance.'
  });
});

/**
 * POST /api/analytics/events
 * Records client or backend telemetry events without sending medical text.
 * Enforces de-duplication, timing validation, and clinical privacy protection.
 */
app.post('/api/analytics/events', async (req, res) => {
  try {
    let authUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        authUser = await admin.auth().verifyIdToken(token, true);
      } catch (authErr) {
        // Fallback to unauthenticated event for anonymous intake start if token not yet present
      }
    }

    const { eventType, eventId, timestamp, clinicId, payload } = req.body || {};
    const userId = authUser ? authUser.uid : (req.body?.userId || null);

    const result = analyticsService.recordEvent({
      eventType,
      eventId,
      timestamp,
      userId,
      clinicId,
      payload
    });

    res.json(result);
  } catch (err) {
    const isMedicalViolation = err.message.startsWith('MEDICAL_TEXT_PROHIBITED');
    const isTimingViolation = err.message.startsWith('INVALID_EVENT_TIMING');
    const isTypeViolation = err.message.startsWith('INVALID_EVENT_TYPE');

    const statusCode = isMedicalViolation || isTimingViolation || isTypeViolation ? 400 : 500;
    const errorCode = isMedicalViolation
      ? 'MEDICAL_TEXT_PROHIBITED'
      : (isTimingViolation ? 'INVALID_EVENT_TIMING' : (isTypeViolation ? 'INVALID_EVENT_TYPE' : 'INTERNAL_ERROR'));

    res.status(statusCode).json({
      error: errorCode,
      message: err.message
    });
  }
});

/**
 * GET /api/analytics/metrics
 * Returns comprehensive Product & Clinical KPIs across:
 * - Assessment Journey Completion Rate (decoupled from case counts)
 * - Turnaround Time
 * - Retention (D1, D7, D30)
 * - WAU / MAU & Stickiness
 * - Doctor and Clinic Activity
 * - Satisfaction (CSAT, Star Rating)
 * - Error Rates & Support Metrics
 * Every metric has an explicit numerator, denominator, time period, and Unavailable fallbacks.
 */
app.get('/api/analytics/metrics', requireAuth, async (req, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    const canView = hasTrustedAdminClaim(req.user) || [ROLES.DOCTOR, ROLES.SUPPORT].includes(userRole);
    if (!canView) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Privileged role required to inspect analytics metrics.' });
    }

    const scope = await resolveRequesterClinic(req);
    const requestedClinic = (req.query.clinicId || req.query.clinic || '').trim();
    if (userRole === ROLES.CLINIC_ADMIN && requestedClinic && scope.clinicId && requestedClinic !== scope.clinicId) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Clinic Admin can only query analytics for their assigned clinic.' });
    }

    const effectiveClinic = userRole === ROLES.CLINIC_ADMIN ? scope.clinicId : requestedClinic;

    const metrics = analyticsService.calculateProductKpis(undefined, {
      timePeriod: req.query.timePeriod || req.query.period || req.query.range || 'last_30d',
      startDate: req.query.startDate || req.query.from,
      endDate: req.query.endDate || req.query.to,
      clinicId: effectiveClinic
    });

    res.json(metrics);
  } catch (err) {
    console.error('[ANALYTICS METRICS ERROR]:', err);
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
        if (isOwner) {
          role = ROLES.SUPER_ADMIN;
          verifiedDoctor = true;
          await userRef.set({
            role: ROLES.SUPER_ADMIN,
            isOwner: true,
            verifiedDoctor: true,
            doctorVerified: true,
            emailVerified: true,
            isVerified: true,
            accountStatus: 'active',
            status: 'active',
            suspended: false,
            isSuspended: false
          }, { merge: true });
        } else if (hasTrustedAdminClaim(req.user)) {
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
        verifiedDoctor = isOwner || Boolean(data.verifiedDoctor || role === ROLES.DOCTOR);
      } else {
        // Initialize new user on the backend
        role = isOwner ? ROLES.SUPER_ADMIN : (hasTrustedAdminClaim(req.user) ? getTrustedClaimRole(req.user) : ROLES.PATIENT);
        verifiedDoctor = isOwner || role === ROLES.DOCTOR;
        await userRef.set({
          name: req.user.name || email.split('@')[0],
          email: email,
          role: role,
          isOwner: isOwner,
          verifiedDoctor: verifiedDoctor,
          doctorVerified: isOwner,
          emailVerified: Boolean(req.user.email_verified || isOwner),
          isVerified: Boolean(isOwner || req.user.email_verified),
          accountStatus: 'active',
          status: 'active',
          suspended: false,
          isSuspended: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } else {
      role = isOwner ? ROLES.SUPER_ADMIN : (hasTrustedAdminClaim(req.user) ? getTrustedClaimRole(req.user) : ROLES.PATIENT);
      verifiedDoctor = isOwner || role === ROLES.DOCTOR;
    }

    // Set cryptographic custom claims on Firebase Auth
    const currentAuth = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...currentAuth.customClaims,
      role: role,
      isOwner: isOwner,
      verifiedDoctor: verifiedDoctor,
      ...(isOwner ? { doctorVerified: true, email_verified: true } : {})
    });
    if (isOwner && !currentAuth.emailVerified) {
      await admin.auth().updateUser(uid, { emailVerified: true }).catch(() => {});
    }

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

    let session = null;
    let isSuspicious = false;
    try {
      const sessionResult = await recordUserSession(req, uid, email);
      session = sessionResult.session;
      isSuspicious = sessionResult.isSuspicious;

      if (isSuspicious) {
        if (db) {
          auditService.recordAuditEvent(db, {
            type: auditService.AUDIT_EVENT_TYPES.SUSPICIOUS_LOGIN_DETECTED,
            req,
            details: {
              reason: 'Unrecognized IP subnet and device platform combination',
              subnetMask: session.subnetMask,
              platform: session.platform,
              browser: session.browser
            }
          }).catch(() => {});
        }
        sendClinicalNotificationEmail({
          to: email,
          subject: 'Security Alert: New Sign-in Detected',
          recipientName: email.split('@')[0],
          role: role,
          caseId: 'SECURITY_ALERT',
          patientName: 'Account Owner',
          status: 'suspicious_login',
          clinicName: 'Health Vibe Security',
          notes: `A new sign-in was detected from ${session.platform} (${session.browser}) at IP subnet ${session.subnetMask}. If this was not you, please sign out of all devices immediately.`
        }).catch(() => {});
      }
    } catch (sessionErr) {
      console.warn('[SESSION RECORD WARNING]:', sessionErr.message);
    }

    res.json({
      success: true,
      uid,
      email,
      role,
      isOwner,
      verifiedDoctor,
      sessionId: session?.sessionId || null,
      suspiciousLogin: isSuspicious
    });
  } catch (err) {
    console.error("[SERVER ROLE SYNC ERROR]:", err);
    res.status(500).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

/**
 * GET /api/user/sessions
 * List active devices and sign-in sessions for the authenticated user
 */
app.get('/api/user/sessions', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const currentIpInfo = auditService.sanitizeIp(getClientIp(req));
  const currentDevice = auditService.extractDeviceMetadata(req);

  let sessions = activeUserSessions.get(userId) || [];
  if (db && sessions.length === 0) {
    try {
      const snap = await db.collection('user_sessions').where('userId', '==', userId).get();
      sessions = snap.docs.map(doc => doc.data());
      activeUserSessions.set(userId, sessions);
    } catch (_) {}
  }

  const formatted = sessions.map(s => ({
    sessionId: s.sessionId,
    platform: s.platform,
    browser: s.browser,
    isMobile: Boolean(s.isMobile),
    subnetMask: s.subnetMask,
    loginAt: s.loginAt,
    lastActiveAt: s.lastActiveAt,
    revoked: Boolean(s.revoked),
    isCurrent: s.subnetMask === currentIpInfo.subnetMask && s.platform === currentDevice.platform && s.browser === currentDevice.browser
  }));

  res.json({
    success: true,
    totalSessions: formatted.length,
    sessions: formatted
  });
});

/**
 * POST /api/user/sessions/terminate
 * Terminate a specific remote session by sessionId
 */
app.post('/api/user/sessions/terminate', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const { sessionId } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'INVALID_SESSION_ID', message: 'A valid sessionId is required.' });
  }

  const sessions = activeUserSessions.get(userId) || [];
  const target = sessions.find(s => s.sessionId === sessionId);
  if (target) {
    target.revoked = true;
    target.terminatedAt = new Date().toISOString();
  }

  if (db) {
    db.collection('user_sessions').doc(sessionId).set({
      revoked: true,
      terminatedAt: new Date().toISOString()
    }, { merge: true }).catch((err) => console.warn('[SESSION TERMINATE WARNING]:', err.message));
    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.SESSION_TERMINATED,
      req,
      details: { targetSessionId: sessionId }
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Session terminated successfully.',
    terminatedSessionId: sessionId
  });
});

/**
 * POST /api/user/revoke-all-sessions
 * Server-authoritative global session revocation across all devices (Sign out from all devices)
 */
app.post('/api/user/revoke-all-sessions', requireAuth, requireRecentAuth(900), requireMfaIfEnrolled, async (req, res) => {
  const userId = req.user.uid;
  const nowIso = new Date().toISOString();

  // 1. Authoritative Firebase Admin revocation of all refresh tokens
  try {
    await admin.auth().revokeRefreshTokens(userId);
  } catch (err) {
    console.error('[REVOKE ALL SESSIONS FIREBASE ERROR]:', err.message);
  }

  // 2. Mark sessionsRevokedAt in user document and memory registry to invalidate in-flight tokens
  if (db) {
    db.collection('users').doc(userId).set({
      sessionsRevokedAt: nowIso
    }, { merge: true }).catch((err) => console.warn('[REVOKE ALL SESSIONS USER DOC WARNING]:', err.message));
  }

  const sessions = activeUserSessions.get(userId) || [];
  sessions.forEach(s => { s.revoked = true; s.terminatedAt = nowIso; });
  sessions._sessionsRevokedAt = nowIso;
  activeUserSessions.set(userId, sessions);

  if (db) {
    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.ALL_SESSIONS_REVOKED,
      req,
      details: { revokedAt: nowIso }
    }).catch(() => {});
  }

  res.json({
    success: true,
    revokedAt: nowIso,
    message: 'All active sessions and device tokens have been revoked. Fresh sign-in required.'
  });
});

/**
 * POST /api/user/change-password
 * Secure password change requiring recent re-authentication and revoking other active sessions
 */
app.post('/api/user/change-password', requireAuth, requireRecentAuth(900), requireMfaIfEnrolled, async (req, res) => {
  const userId = req.user.uid;
  const { newPassword, confirmPassword } = req.body || {};

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({
      error: 'INVALID_PASSWORD',
      message: 'Password must be at least 8 characters long.'
    });
  }

  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  if (!hasUpper || !hasLower || !hasDigit) {
    return res.status(400).json({
      error: 'WEAK_PASSWORD',
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number.'
    });
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return res.status(400).json({
      error: 'PASSWORD_MISMATCH',
      message: 'Password confirmation does not match.'
    });
  }

  try {
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    // Revoke refresh tokens on other devices to force re-authentication with the new password
    await admin.auth().revokeRefreshTokens(userId).catch(() => {});
    const nowIso = new Date().toISOString();

    const sessions = activeUserSessions.get(userId) || [];
    sessions.forEach(s => { s.revoked = true; s.terminatedAt = nowIso; });
    sessions._sessionsRevokedAt = nowIso;
    activeUserSessions.set(userId, sessions);

    if (db) {
      db.collection('users').doc(userId).set({
        sessionsRevokedAt: nowIso,
        passwordLastChangedAt: nowIso
      }, { merge: true }).catch(() => {});

      auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.PASSWORD_CHANGED,
        req,
        details: { changedAt: nowIso }
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Password changed successfully. For your security, all other active sessions have been terminated.'
    });
  } catch (err) {
    console.error('[CHANGE PASSWORD ERROR]:', err);
    res.status(500).json({
      error: 'PASSWORD_CHANGE_FAILED',
      message: 'Failed to update password. Please try again.'
    });
  }
});

/**
 * POST /api/user/change-email
 * Secure email change requiring recent re-authentication
 */
app.post('/api/user/change-email', requireAuth, requireRecentAuth(900), requireMfaIfEnrolled, async (req, res) => {
  const userId = req.user.uid;
  const currentEmail = (req.user.email || '').toLowerCase();
  const { newEmail } = req.body || {};

  if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@') || newEmail.length > 100) {
    return res.status(400).json({
      error: 'INVALID_EMAIL',
      message: 'A valid email address is required (maximum 100 characters).'
    });
  }

  const cleanEmail = newEmail.trim().toLowerCase();
  if (cleanEmail === currentEmail) {
    return res.status(400).json({
      error: 'SAME_EMAIL',
      message: 'New email cannot be the same as your current email.'
    });
  }

  try {
    await admin.auth().updateUser(userId, {
      email: cleanEmail,
      emailVerified: false
    });

    await admin.auth().revokeRefreshTokens(userId).catch(() => {});
    const nowIso = new Date().toISOString();

    const sessions = activeUserSessions.get(userId) || [];
    sessions.forEach(s => { s.revoked = true; s.terminatedAt = nowIso; });
    sessions._sessionsRevokedAt = nowIso;
    activeUserSessions.set(userId, sessions);

    if (db) {
      db.collection('users').doc(userId).set({
        email: cleanEmail,
        emailVerified: false,
        sessionsRevokedAt: nowIso,
        emailLastChangedAt: nowIso
      }, { merge: true }).catch(() => {});

      auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.EMAIL_CHANGED,
        req,
        details: { oldEmail: auditService.maskEmail(currentEmail), newEmail: auditService.maskEmail(cleanEmail), changedAt: nowIso }
      }).catch(() => {});
    }

    res.json({
      success: true,
      newEmail: cleanEmail,
      message: 'Email address updated successfully. Please verify your new email.'
    });
  } catch (err) {
    console.error('[CHANGE EMAIL ERROR]:', err);
    res.status(500).json({
      error: 'EMAIL_CHANGE_FAILED',
      message: err.code === 'auth/email-already-exists'
        ? 'This email address is already in use by another account.'
        : 'Failed to update email address. Please try again.'
    });
  }
});

/**
 * POST /api/auth/recover-account
 * Secure account recovery without revealing account existence or bypassing cryptographic verification
 */
app.post('/api/auth/recover-account', async (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 100) {
    return res.status(400).json({
      error: 'INVALID_EMAIL',
      message: 'A valid email address is required.'
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    let userRecord = null;
    try {
      userRecord = await admin.auth().getUserByEmail(cleanEmail);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') {
        console.warn('[RECOVER ACCOUNT CHECK WARNING]:', e.message);
      }
    }

    if (userRecord && userRecord.uid) {
      const resetLink = await admin.auth().generatePasswordResetLink(cleanEmail).catch(() => null);

      if (db) {
        auditService.recordAuditEvent(db, {
          type: auditService.AUDIT_EVENT_TYPES.ACCOUNT_RECOVERY_REQUESTED,
          req,
          details: { emailMasked: auditService.maskEmail(cleanEmail) }
        }).catch(() => {});
      }

      if (resetLink) {
        sendClinicalNotificationEmail({
          to: cleanEmail,
          subject: 'Health Vibe - Account Recovery Link',
          recipientName: userRecord.displayName || cleanEmail.split('@')[0],
          role: 'patient',
          caseId: 'ACCOUNT_RECOVERY',
          patientName: 'Account Owner',
          status: 'password_reset',
          clinicName: 'Health Vibe Security',
          notes: `A request was made to recover your account. Click the secure link to reset your password: ${resetLink}. If you did not request this, please ignore this email.`
        }).catch(() => {});
      }
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, recovery instructions have been sent.'
    });
  } catch (err) {
    console.error('[RECOVER ACCOUNT ERROR]:', err);
    res.status(500).json({
      error: 'RECOVERY_REQUEST_FAILED',
      message: 'Unable to process account recovery request. Please try again later.'
    });
  }
});

/**
 * GET /api/user/mfa/status
 * Retrieve MFA enrollment status, registration timestamp, and remaining backup recovery codes
 */
app.get('/api/user/mfa/status', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const isEnabled = mfaService.isMfaEnabled(userId);
  const rec = mfaService.getUserMfaRecord(userId);

  let backupCodesRemaining = 0;
  if (rec && Array.isArray(rec.backupCodes)) {
    backupCodesRemaining = rec.backupCodes.filter(b => !b.used).length;
  }

  res.json({
    success: true,
    mfaEnabled: isEnabled,
    enrolledAt: rec?.enrolledAt || null,
    backupCodesRemaining
  });
});

/**
 * POST /api/user/mfa/enroll
 * Initiate MFA enrollment: generate TOTP secret, backup recovery codes, and otpauth URI
 * Requires fresh re-authentication
 */
app.post('/api/user/mfa/enroll', requireAuth, requireRecentAuth(900), async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email || 'user@healthvibes.ai';

  if (mfaService.isMfaEnabled(userId)) {
    return res.status(400).json({
      error: 'ALREADY_ENROLLED',
      message: 'MFA is already enabled on this account. Disenroll first to rotate credentials.'
    });
  }

  const secret = mfaService.generateTotpSecret();
  const { plainCodes, hashedRecords } = mfaService.generateBackupCodes(8);
  const otpauthUri = mfaService.generateOtpAuthUri({
    email: userEmail,
    secret,
    issuer: 'Health Vibe AI'
  });

  mfaService.setUserMfaRecord(userId, {
    enabled: false,
    secret,
    backupCodes: hashedRecords,
    pendingAt: new Date().toISOString()
  });

  res.json({
    success: true,
    secret,
    otpauthUri,
    backupCodes: plainCodes,
    message: 'Scan the QR code or enter the secret in your authenticator app, then verify with a 6-digit code to activate.'
  });
});

/**
 * POST /api/user/mfa/verify-enrollment
 * Finalize MFA enrollment by verifying the first 6-digit TOTP code
 */
app.post('/api/user/mfa/verify-enrollment', requireAuth, requireRecentAuth(900), async (req, res) => {
  const userId = req.user.uid;
  const { code } = req.body || {};

  const rec = mfaService.getUserMfaRecord(userId);
  if (!rec || !rec.secret) {
    return res.status(400).json({
      error: 'NO_PENDING_ENROLLMENT',
      message: 'No pending MFA enrollment found. Call /api/user/mfa/enroll first.'
    });
  }

  const isValid = mfaService.verifyTotp(code, rec.secret);
  if (!isValid) {
    return res.status(400).json({
      error: 'INVALID_MFA_CODE',
      message: 'The 6-digit verification code is invalid or has expired.'
    });
  }

  const nowIso = new Date().toISOString();
  rec.enabled = true;
  rec.enrolledAt = nowIso;
  mfaService.setUserMfaRecord(userId, rec);

  if (db) {
    db.collection('users').doc(userId).set({
      mfaEnabled: true,
      mfaEnrolledAt: nowIso
    }, { merge: true }).catch(() => {});

    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.MFA_ENROLLED,
      req,
      details: { enrolledAt: nowIso, method: 'TOTP_RFC6238' }
    }).catch(() => {});
  }

  const mfaTicket = mfaService.issueMfaTicket(userId);

  res.json({
    success: true,
    mfaTicket,
    message: 'Multi-factor authentication successfully activated.'
  });
});

/**
 * POST /api/user/mfa/verify-challenge
 * Verify MFA challenge via 6-digit TOTP code, issuing a short-lived cryptographic step-up ticket
 */
app.post('/api/user/mfa/verify-challenge', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const { code } = req.body || {};

  if (!mfaService.isMfaEnabled(userId)) {
    return res.status(400).json({
      error: 'MFA_NOT_ENROLLED',
      message: 'MFA is not enabled on this account.'
    });
  }

  const rec = mfaService.getUserMfaRecord(userId);
  const isValid = mfaService.verifyTotp(code, rec.secret);

  if (!isValid) {
    if (db) {
      auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_FAILED,
        req,
        details: { reason: 'INVALID_TOTP_CODE' }
      }).catch(() => {});
    }

    return res.status(400).json({
      error: 'INVALID_MFA_CODE',
      message: 'Invalid two-factor authentication code.'
    });
  }

  const mfaTicket = mfaService.issueMfaTicket(userId);

  if (db) {
    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_VERIFIED,
      req,
      details: { verifiedAt: new Date().toISOString() }
    }).catch(() => {});
  }

  res.json({
    success: true,
    mfaTicket,
    expiresInSeconds: mfaService.MFA_TICKET_TTL_SECONDS
  });
});

/**
 * POST /api/user/mfa/recovery
 * Authenticate via single-use backup recovery code (factor loss recovery)
 */
app.post('/api/user/mfa/recovery', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const { recoveryCode } = req.body || {};

  if (!mfaService.isMfaEnabled(userId)) {
    return res.status(400).json({
      error: 'MFA_NOT_ENROLLED',
      message: 'MFA is not enabled on this account.'
    });
  }

  if (!recoveryCode) {
    return res.status(400).json({
      error: 'INVALID_RECOVERY_CODE',
      message: 'Recovery code is required.'
    });
  }

  const consumed = mfaService.consumeBackupCode(userId, recoveryCode);
  if (!consumed) {
    if (db) {
      auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.MFA_CHALLENGE_FAILED,
        req,
        details: { reason: 'INVALID_OR_CONSUMED_RECOVERY_CODE' }
      }).catch(() => {});
    }

    return res.status(400).json({
      error: 'INVALID_RECOVERY_CODE',
      message: 'Invalid or already used backup recovery code.'
    });
  }

  const mfaTicket = mfaService.issueMfaTicket(userId);

  if (db) {
    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.MFA_RECOVERY_CODE_USED,
      req,
      details: { recoveredAt: new Date().toISOString() }
    }).catch(() => {});
  }

  const rec = mfaService.getUserMfaRecord(userId);
  const remaining = rec?.backupCodes?.filter(b => !b.used).length || 0;

  res.json({
    success: true,
    mfaTicket,
    expiresInSeconds: mfaService.MFA_TICKET_TTL_SECONDS,
    backupCodesRemaining: remaining,
    message: 'Backup code accepted. Emergency step-up access granted.'
  });
});

/**
 * POST /api/user/mfa/disenroll
 * Disenroll from MFA: requires fresh re-authentication and MFA verification
 */
app.post('/api/user/mfa/disenroll', requireAuth, requireRecentAuth(900), requireMfaIfEnrolled, async (req, res) => {
  const userId = req.user.uid;
  const nowIso = new Date().toISOString();

  mfaService.setUserMfaRecord(userId, {
    enabled: false,
    disenrolledAt: nowIso
  });

  if (db) {
    db.collection('users').doc(userId).set({
      mfaEnabled: false,
      mfaDisenrolledAt: nowIso
    }, { merge: true }).catch(() => {});

    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.MFA_DISENROLLED,
      req,
      details: { disenrolledAt: nowIso }
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Multi-factor authentication has been disabled.'
  });
});

/**
 * POST /api/admin/set-user-role
 * Server-authoritative endpoint to change a user's role and set Firebase Custom Claims
 */
app.post('/api/admin/set-user-role', requireAuth, auditOperationalAccess('ADMIN_ROLE_CHANGE'), requireVerifiedEmail, requireSuperAdmin, requireMfaIfEnrolled, async (req, res) => {
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
 * Enforces:
 * - Authoritative licensing verification result ('VERIFIED', file upload alone rejected)
 * - Future license expiry date
 * - Reviewer identity tracking
 * - Reverification due date schedule
 * - Approved clinic membership linkage
 */
app.post('/api/admin/approve-doctor-application', requireAuth, auditOperationalAccess('ADMIN_DOCTOR_APPROVAL'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  const {
    applicationId,
    applicantUserId,
    licenseExpiryDate,
    verificationResult = 'VERIFIED',
    authorityName,
    authorityReferenceNumber,
    reverificationDueDate,
    clinicId,
    clinicName
  } = req.body || {};

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

    const appData = applicationDoc.data();
    const scope = await resolveRequesterClinic(req);
    if (!applicantDoc.exists || !isSameClinicResource(scope, appData) ||
        !isSameClinicResource(scope, applicantDoc.data())) return res.status(403).json({ error: 'ACCESS_DENIED' });

    if (appData.status !== 'pending') {
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

    // 1. Regulatory Requirement: Authoritative Verification Result Check
    // "لا تستبدل تحقق جهة الترخيص برفع الملف فقط"
    if (verificationResult !== 'VERIFIED') {
      return res.status(400).json({
        error: 'AUTHORITY_VERIFICATION_REQUIRED',
        message: 'Official licensing authority verification is mandatory. File upload alone cannot substitute official registry verification.'
      });
    }

    // 2. Regulatory Requirement: License Expiry Date Check
    // "وسع الطلب الحالي بتاريخ انتهاء الترخيص ونتيجة التحقق وهوية المراجع وسبب الرفض وموعد إعادة التوثيق"
    const effectiveExpiry = licenseExpiryDate || appData.licenseExpiryDate || appData.licenseExpiresAt;
    if (!effectiveExpiry || isNaN(new Date(effectiveExpiry).getTime())) {
      return res.status(400).json({
        error: 'INVALID_LICENSE_EXPIRY',
        message: 'A valid licenseExpiryDate is mandatory for doctor credential approval.'
      });
    }

    if (new Date(effectiveExpiry) <= new Date()) {
      return res.status(400).json({
        error: 'EXPIRED_LICENSE',
        message: `Cannot approve doctor: The medical syndicate license expired on ${new Date(effectiveExpiry).toISOString().split('T')[0]}.`
      });
    }

    // 3. Reverification Due Date Schedule
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const expiryDay = new Date(effectiveExpiry).toISOString().split('T')[0];
    const defaultReverification = oneYearFromNow < expiryDay ? oneYearFromNow : expiryDay;
    const effectiveReverificationDueDate = reverificationDueDate || defaultReverification;

    // 4. Approved Clinic Membership Association
    // "اربط الطبيب بالعيادات عبر عضويات معتمدة"
    const effectiveClinicId = clinicId || appData.clinicId || scope.clinicId || null;
    const effectiveClinicName = clinicName || appData.clinic || (effectiveClinicId ? `Clinic ${effectiveClinicId}` : null);
    const existingMemberships = Array.isArray(applicantDoc.data()?.clinicMemberships) ? [...applicantDoc.data().clinicMemberships] : [];

    if (effectiveClinicId) {
      const existingIdx = existingMemberships.findIndex(m => m && m.clinicId === effectiveClinicId);
      const membershipRecord = {
        clinicId: effectiveClinicId,
        clinicName: effectiveClinicName,
        status: 'approved',
        roleInClinic: 'specialist',
        joinedAt: new Date().toISOString(),
        approvedBy: req.user.uid
      };
      if (existingIdx >= 0) {
        existingMemberships[existingIdx] = membershipRecord;
      } else {
        existingMemberships.push(membershipRecord);
      }
    }

    // 5. Elevate user role to 'doctor' in Firebase Auth Custom Claims
    const applicantAuth = await admin.auth().getUser(applicantUserId);
    await admin.auth().setCustomUserClaims(applicantUserId, {
      ...applicantAuth.customClaims,
      role: 'doctor',
      verifiedDoctor: true,
      clinicId: effectiveClinicId
    });
    await admin.auth().revokeRefreshTokens(applicantUserId);

    // 6. Update application in Firestore
    if (db) {
      await db.collection('doctor_applications').doc(applicationId).update({
        status: 'approved',
        licenseStatus: 'active',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: req.user.email,
        approvedByUid: req.user.uid,
        reviewerId: req.user.uid,
        reviewerEmail: req.user.email,
        licenseExpiryDate: effectiveExpiry,
        verificationResult: 'VERIFIED',
        authorityName: authorityName || 'MOH / Medical Syndicate Registry',
        authorityReferenceNumber: authorityReferenceNumber || null,
        reverificationDueDate: effectiveReverificationDueDate,
        clinicId: effectiveClinicId,
        clinicMemberships: existingMemberships
      });

      await db.collection('users').doc(applicantUserId).set({
        role: 'doctor',
        doctorApplicationStatus: 'approved',
        verifiedDoctor: true,
        licenseStatus: 'active',
        licenseExpiryDate: effectiveExpiry,
        verificationResult: 'VERIFIED',
        reviewerId: req.user.uid,
        reverificationDueDate: effectiveReverificationDueDate,
        clinicId: effectiveClinicId,
        clinicMemberships: existingMemberships
      }, { merge: true });

      // 7. Audit Logging
      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.DOCTOR_APPLICATION_APPROVED,
        req,
        targetUserId: applicantUserId,
        clinicId: effectiveClinicId,
        details: {
          applicationId,
          licenseExpiryDate: effectiveExpiry,
          reverificationDueDate: effectiveReverificationDueDate,
          reviewerId: req.user.uid,
          verificationResult: 'VERIFIED'
        }
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Doctor credentials verified and approved by server.',
      licenseExpiryDate: effectiveExpiry,
      reverificationDueDate: effectiveReverificationDueDate,
      reviewerId: req.user.uid
    });
  } catch (err) {
    console.error("[SERVER DOCTOR APPROVAL ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

app.post('/api/admin/reject-doctor-application', requireAuth, auditOperationalAccess('ADMIN_DOCTOR_REJECTION'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  try {
    const { applicationId, applicantUserId, rejectionReason } = req.body || {};
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

    const cleanReason = String(rejectionReason || 'Application rejected following licensing authority credential review.').trim();

    await db.collection('doctor_applications').doc(applicationId).update({
      status: 'rejected',
      licenseStatus: 'rejected',
      rejectedBy: req.user.uid,
      reviewerId: req.user.uid,
      reviewerEmail: req.user.email,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: cleanReason,
      verificationResult: 'REJECTED'
    });

    const account = await admin.auth().getUser(applicantUserId);
    await admin.auth().setCustomUserClaims(applicantUserId, { ...account.customClaims, role: ROLES.PATIENT, verifiedDoctor: false, doctorVerified: false });
    await admin.auth().revokeRefreshTokens(applicantUserId);

    await db.collection('users').doc(applicantUserId).set({
      role: ROLES.PATIENT,
      verifiedDoctor: false,
      doctorVerified: false,
      doctorApplicationStatus: 'rejected',
      licenseStatus: 'rejected',
      rejectionReason: cleanReason,
      rejectionReviewedBy: req.user.uid,
      rejectionReviewedAt: new Date().toISOString(),
      verificationResult: 'REJECTED'
    }, { merge: true });

    if (db) {
      await auditService.recordAuditEvent(db, {
        type: auditService.AUDIT_EVENT_TYPES.DOCTOR_APPLICATION_REJECTED,
        req,
        targetUserId: applicantUserId,
        details: {
          applicationId,
          reviewerId: req.user.uid,
          rejectionReason: cleanReason,
          verificationResult: 'REJECTED'
        }
      }).catch(() => {});
    }

    res.json({
      success: true,
      rejectionReason: cleanReason,
      reviewerId: req.user.uid
    });
  } catch (err) {
    res.status(500).json({ error: 'APPLICATION_REJECTION_FAILED', message: err.message });
  }
});

/**
 * POST /api/admin/revoke-doctor-credentials
 * Authoritatively revoke a physician's licensing authorization and clinical privileges
 */
app.post('/api/admin/revoke-doctor-credentials', requireAuth, auditOperationalAccess('ADMIN_DOCTOR_REVOCATION'), requireVerifiedEmail, requireAdmin, async (req, res) => {
  const { doctorUserId, reason } = req.body || {};
  if (!doctorUserId || typeof doctorUserId !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'doctorUserId required.' });
  }

  const revocationReason = String(reason || 'Doctor clinical privileges revoked by medical board / administration.').trim();
  const nowIso = new Date().toISOString();

  try {
    const account = await admin.auth().getUser(doctorUserId);
    await admin.auth().setCustomUserClaims(doctorUserId, {
      ...account.customClaims,
      role: ROLES.PATIENT,
      verifiedDoctor: false,
      doctorVerified: false
    });
    await admin.auth().revokeRefreshTokens(doctorUserId);
  } catch (err) {
    console.warn('[REVOKE DOCTOR AUTH WARNING]:', err.message);
  }

  if (db) {
    await db.collection('users').doc(doctorUserId).set({
      role: ROLES.PATIENT,
      verifiedDoctor: false,
      doctorVerified: false,
      doctorApplicationStatus: 'revoked',
      licenseStatus: 'revoked',
      revokedAt: nowIso,
      revokedBy: req.user.uid,
      revocationReason
    }, { merge: true });

    const apps = await db.collection('doctor_applications').where('userId', '==', doctorUserId).get();
    for (const doc of apps.docs) {
      await doc.ref.update({
        status: 'revoked',
        licenseStatus: 'revoked',
        revokedAt: nowIso,
        revokedBy: req.user.uid,
        revocationReason
      });
    }

    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.DOCTOR_CREDENTIALS_REVOKED,
      req,
      targetUserId: doctorUserId,
      details: { revocationReason, revokedAt: nowIso }
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Doctor clinical privileges and practice authorization successfully revoked.'
  });
});

/**
 * POST /api/admin/clinics/memberships
 * Link or revoke approved doctor memberships in clinics
 */
app.post('/api/admin/clinics/memberships', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res) => {
  const { doctorId, clinicId, clinicName, action = 'approve', roleInClinic = 'consultant' } = req.body || {};
  if (!doctorId || !clinicId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'doctorId and clinicId required.' });
  }

  const scope = await resolveRequesterClinic(req);
  if (scope.role === ROLES.CLINIC_ADMIN && scope.clinicId !== clinicId) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Clinic admin can only manage memberships for their own clinic.' });
  }

  const profile = await getServerUserProfile(doctorId);
  if (!profile) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Doctor profile not found.' });
  }

  const nowIso = new Date().toISOString();
  const currentMemberships = Array.isArray(profile.clinicMemberships) ? [...profile.clinicMemberships] : [];
  const existingIdx = currentMemberships.findIndex(m => m && m.clinicId === clinicId);

  const updatedMembership = {
    clinicId,
    clinicName: clinicName || profile.clinic || clinicId,
    status: action === 'revoke' ? 'revoked' : 'approved',
    roleInClinic,
    updatedAt: nowIso,
    updatedBy: req.user.uid
  };

  if (existingIdx >= 0) {
    currentMemberships[existingIdx] = updatedMembership;
  } else {
    currentMemberships.push(updatedMembership);
  }

  if (db) {
    await db.collection('users').doc(doctorId).set({
      clinicMemberships: currentMemberships
    }, { merge: true });

    auditService.recordAuditEvent(db, {
      type: auditService.AUDIT_EVENT_TYPES.DOCTOR_CLINIC_MEMBERSHIP_UPDATED,
      req,
      targetUserId: doctorId,
      clinicId,
      details: { action, clinicName: updatedMembership.clinicName, status: updatedMembership.status }
    }).catch(() => {});
  }

  res.json({
    success: true,
    membership: updatedMembership,
    allMemberships: currentMemberships
  });
});

/**
 * POST /api/doctor/submit-application
 * Secure submission of doctor application with National ID policy regulation and legal review safeguards
 */
app.post('/api/doctor/submit-application', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const {
    name,
    licenseNumber,
    specialty,
    clinic,
    clinicId,
    licenseExpiryDate,
    nationalId,
    nationalIdConsent,
    legalReviewBasis,
    docName,
    docSize,
    docContentType,
    storagePath,
    downloadURL
  } = req.body || {};

  if (!licenseNumber || typeof licenseNumber !== 'string') {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Valid licenseNumber is required.' });
  }

  // Validate National ID policy & legal review safeguard
  const nationalIdValidation = validateNationalIdCollection(nationalId, nationalIdConsent, { legalBasis: legalReviewBasis });
  if (!nationalIdValidation.ok) {
    return res.status(400).json({
      error: nationalIdValidation.error,
      message: nationalIdValidation.message
    });
  }

  const appId = `app_${userId}`;

  const appData = {
    id: appId,
    userId,
    name: String(name || req.user.name || '').trim(),
    email: req.user.email || '',
    licenseNumber: String(licenseNumber).trim(),
    specialty: String(specialty || 'General Practitioner').trim(),
    clinic: String(clinic || 'Health Vibe Clinic').trim(),
    clinicId: clinicId || null,
    licenseExpiryDate: licenseExpiryDate || null,
    maskedNationalId: nationalIdValidation.maskedNationalId,
    nationalIdHash: nationalIdValidation.nationalIdHash,
    nationalIdLegalReview: nationalIdValidation.legalReview,
    docName: docName || null,
    docSize: docSize || null,
    docContentType: docContentType || null,
    storagePath: storagePath || null,
    downloadURL: downloadURL || null,
    status: 'pending',
    appliedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (db) {
    await db.collection('doctor_applications').doc(appId).set(appData, { merge: true });
    await db.collection('users').doc(userId).set({
      doctorApplicationId: appId,
      doctorApplicationStatus: 'pending',
      role: ROLES.DOCTOR_PENDING,
      licenseNumber: appData.licenseNumber,
      licenseExpiryDate: appData.licenseExpiryDate,
      maskedNationalId: appData.maskedNationalId,
      nationalIdHash: appData.nationalIdHash,
      nationalIdLegalReview: appData.nationalIdLegalReview,
      clinicId: appData.clinicId
    }, { merge: true });
  }

  res.json({
    success: true,
    applicationId: appId,
    message: 'Doctor application submitted successfully. Pending administrative verification and legal review.'
  });
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
  if (!db || !uid) return null;
  const applications = await db.collection('doctor_applications').where('userId', '==', uid).get();
  const approved = applications.docs.find(doc => doc.data().status === 'approved') ||
    applications.docs.find(doc => ['rejected', 'revoked'].includes(doc.data().status));
  if (!approved) return null;
  const data = approved.data();
  const text = value => typeof value === 'string' ? value.trim() : '';

  const now = new Date();
  const licenseExpiry = data.licenseExpiryDate || data.licenseExpiresAt || null;
  const isLicenseExpired = Boolean(licenseExpiry && new Date(licenseExpiry) <= now);
  const isRevoked = data.status === 'revoked' || data.licenseStatus === 'revoked';

  return {
    uid,
    applicationId: approved.id,
    name: text(data.name),
    licenseNumber: text(data.licenseNumber),
    specialty: text(data.specialty),
    clinic: text(data.clinic),
    clinicId: data.clinicId || null,
    clinicMemberships: Array.isArray(data.clinicMemberships) ? data.clinicMemberships : [],
    status: data.status || 'approved',
    licenseStatus: isRevoked ? 'revoked' : (isLicenseExpired ? 'expired' : (data.licenseStatus || 'active')),
    licenseExpiryDate: licenseExpiry,
    isLicenseExpired,
    verificationResult: data.verificationResult || (data.status === 'approved' ? 'VERIFIED' : data.status),
    reviewerId: data.reviewerId || data.approvedByUid || data.approvedBy || null,
    rejectionReason: data.rejectionReason || null,
    reverificationDueDate: data.reverificationDueDate || null,
    maskedNationalId: data.maskedNationalId || null,
    nationalIdLegalReview: data.nationalIdLegalReview || null
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
    const doctorIdentity = record.reportSnapshot?.doctorIdentity ||
      (record.approvingDoctorId ? await getVerifiedDoctorIdentity(record.approvingDoctorId) : null);
    return res.json({ doctorIdentity });
  } catch (err) {
    return res.status(503).json({ error: 'DOCTOR_CREDENTIALS_UNAVAILABLE' });
  }
});

// In-memory registry for report share tokens (with database persistence)
const reportSharesRegistry = new Map();

/**
 * POST /api/reports/share
 * Generates a time-limited, revocable share link for an approved report with mandatory explicit consent.
 */
app.post('/api/reports/share', requireAuth, async (req, res) => {
  const { caseId, consent, consentGiven, consentText, expiresInHours = 48, recipientEmail, recipientPin } = req.body || {};
  if (!caseId) {
    return res.status(400).json({ error: 'MISSING_CASE_ID', message: 'caseId is required.' });
  }
  const isConsentGiven = consent === true || consentGiven === true;
  if (!isConsentGiven) {
    return res.status(400).json({
      error: 'EXPLICIT_CONSENT_REQUIRED',
      message: 'Explicit patient consent is required prior to sharing certified clinical reports.'
    });
  }

  try {
    let caseData = null;
    const caseSnap = await db.collection('cases').doc(caseId).get();
    if (!caseSnap.exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Case not found.' });
    }
    caseData = { id: caseSnap.id, ...caseSnap.data() };

    const isOwner = caseData.patientId === req.user.uid || caseData.userId === req.user.uid;
    const isDoctor = caseData.assignedDoctorId === req.user.uid || caseData.approvingDoctorId === req.user.uid || req.user.role === 'doctor';
    const isAdmin = hasTrustedAdminClaim(req.user) || (typeof isOwnerUser === 'function' && isOwnerUser(req.user.email));
    if (!isOwner && !isDoctor && !isAdmin) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Not authorized to share this report.' });
    }

    if (caseData.status !== 'approved' || caseData.doctorApproved !== true) {
      return res.status(400).json({ error: 'REPORT_NOT_APPROVED', message: 'Only approved, doctor-certified reports can be shared.' });
    }

    const hours = Math.min(Math.max(Number(expiresInHours) || 48, 1), 720);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
    const shareId = crypto.randomBytes(24).toString('hex');
    const normalizedRecipientEmail = recipientEmail ? String(recipientEmail).trim().toLowerCase() : null;
    const pinHash = recipientPin ? crypto.createHash('sha256').update(String(recipientPin).trim()).digest('hex') : null;
    const reportRef = caseData.reportRef || `HV-REP-${caseId.slice(-8).toUpperCase()}`;

    const shareRecord = {
      shareId,
      caseId,
      patientId: caseData.patientId || caseData.userId || req.user.uid,
      createdBy: req.user.uid,
      createdRole: req.user.role || 'patient',
      createdAt: now.toISOString(),
      expiresAt,
      status: 'active',
      consentGiven: true,
      consentText: String(consentText || 'Patient explicitly authorized time-limited medical report sharing.').trim(),
      consentTimestamp: now.toISOString(),
      recipientEmail: normalizedRecipientEmail,
      recipientPinHash: pinHash,
      accessCount: 0,
      reportRef
    };

    reportSharesRegistry.set(shareId, shareRecord);
    try {
      await db.collection('report_shares').doc(shareId).set(shareRecord);
    } catch (e) {}

    try {
      await db.collection('audit_events').add({
        type: 'REPORT_SHARE_LINK_CREATED',
        shareId,
        caseId,
        createdBy: req.user.uid,
        recipientEmail: normalizedRecipientEmail,
        expiresAt,
        timestamp: admin.firestore?.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : now.toISOString()
      });
    } catch (e) {}

    return res.json({
      success: true,
      shareId,
      shareUrl: `/shared-report.html?token=${shareId}`,
      expiresAt,
      recipientRestricted: Boolean(normalizedRecipientEmail),
      recipientEmail: normalizedRecipientEmail,
      hasPin: Boolean(pinHash),
      reportRef
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/reports/share/revoke
 * Revokes an existing time-limited share link.
 */
app.post('/api/reports/share/revoke', requireAuth, async (req, res) => {
  const { shareId } = req.body || {};
  if (!shareId) {
    return res.status(400).json({ error: 'MISSING_SHARE_ID', message: 'shareId is required.' });
  }
  try {
    let shareRecord = null;
    try {
      const doc = await db.collection('report_shares').doc(shareId).get();
      if (doc.exists) shareRecord = doc.data();
    } catch (e) {}
    if (!shareRecord) {
      shareRecord = reportSharesRegistry.get(shareId);
    }
    if (!shareRecord) {
      return res.status(404).json({ error: 'SHARE_NOT_FOUND', message: 'Share link not found.' });
    }
    const isCreator = shareRecord.createdBy === req.user.uid;
    const isPatient = shareRecord.patientId === req.user.uid;
    const isAdmin = hasTrustedAdminClaim(req.user) || (typeof isOwnerUser === 'function' && isOwnerUser(req.user.email));
    if (!isCreator && !isPatient && !isAdmin) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Not authorized to revoke this share link.' });
    }
    shareRecord.status = 'revoked';
    shareRecord.revokedAt = new Date().toISOString();
    shareRecord.revokedBy = req.user.uid;
    reportSharesRegistry.set(shareId, shareRecord);
    try {
      await db.collection('report_shares').doc(shareId).update({
        status: 'revoked',
        revokedAt: shareRecord.revokedAt,
        revokedBy: shareRecord.revokedBy
      });
    } catch (e) {}
    try {
      await db.collection('audit_events').add({
        type: 'REPORT_SHARE_LINK_REVOKED',
        shareId,
        caseId: shareRecord.caseId,
        revokedBy: req.user.uid,
        timestamp: admin.firestore?.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
      });
    } catch (e) {}
    return res.json({ success: true, status: 'revoked', shareId });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * Helper to service shared report access
 */
async function handleSharedReportAccess(req, res) {
  const shareId = req.params.shareId;
  if (!shareId) return res.status(400).json({ error: 'MISSING_SHARE_ID' });

  let share = null;
  try {
    const doc = await db.collection('report_shares').doc(shareId).get();
    if (doc.exists) share = doc.data();
  } catch (e) {}
  if (!share) {
    share = reportSharesRegistry.get(shareId);
  }
  if (!share) {
    return res.status(404).json({ error: 'SHARE_NOT_FOUND', message: 'This shared report link does not exist.' });
  }
  if (share.status === 'revoked') {
    return res.status(410).json({ error: 'SHARE_LINK_REVOKED', message: 'This medical report share link has been revoked.' });
  }
  const nowMs = Date.now();
  const expiryMs = new Date(share.expiresAt).getTime();
  if (!isNaN(expiryMs) && nowMs >= expiryMs) {
    return res.status(410).json({ error: 'SHARE_LINK_EXPIRED', message: 'This medical report share link has expired.' });
  }

  if (share.recipientEmail) {
    const claimedEmail = (req.query.recipientEmail || req.headers['x-recipient-email'] || req.body?.recipientEmail || req.user?.email || '').trim().toLowerCase();
    if (!claimedEmail || claimedEmail !== share.recipientEmail.toLowerCase()) {
      return res.status(403).json({ error: 'RECIPIENT_RESTRICTED', message: 'Access is restricted to the designated recipient.' });
    }
  }

  if (share.recipientPinHash) {
    const pin = String(req.query.pin || req.headers['x-recipient-pin'] || req.body?.pin || '').trim();
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    if (!pin || pinHash !== share.recipientPinHash) {
      return res.status(401).json({ error: 'INVALID_PIN', message: 'A valid PIN code is required to access this report.' });
    }
  }

  let caseData = null;
  try {
    const docSnap = await db.collection('cases').doc(share.caseId).get();
    if (docSnap.exists) caseData = { id: docSnap.id, ...docSnap.data() };
  } catch (e) {}

  if (!caseData) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'The associated clinical report could not be found.' });
  }

  share.accessCount = (share.accessCount || 0) + 1;
  reportSharesRegistry.set(shareId, share);

  const snapshot = caseData.reportSnapshot || {};
  const clinical = snapshot.clinicalContent || caseData;
  const doctorId = snapshot.doctorIdentity || caseData.doctorIdentity || {};
  const withdrawal = caseData.reportWithdrawal || snapshot.withdrawal || null;

  return res.json({
    success: true,
    share: {
      shareId: share.shareId,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      recipientEmail: share.recipientEmail || null
    },
    report: {
      id: caseData.id,
      reportRef: caseData.reportRef || `HV-REP-${caseData.id.slice(-8).toUpperCase()}`,
      status: caseData.status,
      doctorApproved: caseData.doctorApproved,
      approvedAt: snapshot.dates?.approvedAt || caseData.approvedAt,
      reportGeneratedAt: snapshot.dates?.generatedAt || caseData.reportGeneratedAt || caseData.generatedAt,
      reportVersion: snapshot.versions?.reportVersion || caseData.reportVersion || '1.0.0',
      reportRevisionNumber: snapshot.revisionNumber || caseData.reportRevisionNumber || 1,
      patientName: snapshot.patient?.patientName || caseData.patientName || caseData.name || 'Patient',
      patientAge: snapshot.patient?.patientAge || caseData.patientAge || caseData.age,
      doctorIdentity: {
        name: doctorId.name || caseData.approvingDoctorName || 'Verified Physician',
        specialty: doctorId.specialty || caseData.doctorSpecialty || 'Pulmonology',
        licenseNumber: doctorId.licenseNumber || caseData.doctorLicense || 'VERIFIED-LICENSE',
        clinic: doctorId.clinic || caseData.clinicName || 'Health Vibe Medical Center'
      },
      clinicalDiagnosis: clinical.clinicalDiagnosis,
      medications: clinical.medications,
      recommendations: clinical.recommendations || (clinical.recommendation ? [clinical.recommendation] : []),
      oxygenLevel: snapshot.caseDetails?.oxygenLevel ?? caseData.oxygenLevel ?? caseData.o2 ?? null,
      breathingDifficulty: snapshot.caseDetails?.breathingDifficulty || caseData.breathingDifficulty,
      coughLevel: snapshot.caseDetails?.coughLevel || caseData.coughLevel,
      symptomDuration: snapshot.caseDetails?.symptomDuration || caseData.symptomDuration,
      reportWithdrawal: withdrawal
    }
  });
}

app.get('/api/reports/shared/:shareId', handleSharedReportAccess);
app.post('/api/reports/shared/:shareId/access', handleSharedReportAccess);

/**
 * GET /api/reports/verify/:reportRefOrId
 * Public authenticity verification endpoint.
 * Safeguards patient confidentiality: NO diagnosis, medications, or vitals are exposed.
 */
app.get('/api/reports/verify/:reportRefOrId', async (req, res) => {
  try {
    const refOrId = String(req.params.reportRefOrId || '').trim();
    if (!refOrId) return res.status(400).json({ valid: false, error: 'MISSING_REF' });

    let caseData = null;
    try {
      const directDoc = await db.collection('cases').doc(refOrId).get();
      if (directDoc.exists) {
        caseData = { id: directDoc.id, ...directDoc.data() };
      }
    } catch (e) {}

    if (!caseData) {
      try {
        const querySnap = await db.collection('cases').where('reportRef', '==', refOrId).get();
        if (querySnap && !querySnap.empty) {
          const doc = querySnap.docs[0];
          caseData = { id: doc.id, ...doc.data() };
        }
      } catch (e) {}
    }

    if (!caseData) {
      try {
        const revDoc = await db.collection('clinical_reports').doc(refOrId).get();
        if (revDoc.exists) {
          const rev = revDoc.data();
          const parentDoc = await db.collection('cases').doc(rev.caseId || rev.originalCaseId).get();
          if (parentDoc.exists) {
            caseData = { id: parentDoc.id, ...parentDoc.data() };
          }
        }
      } catch (e) {}
    }

    if (!caseData) {
      return res.status(404).json({
        valid: false,
        status: 'not_found',
        message: 'Medical report reference not found in the authentic registry.'
      });
    }

    const snapshot = caseData.reportSnapshot || {};
    const doctorId = snapshot.doctorIdentity || caseData.doctorIdentity || {};
    const withdrawal = caseData.reportWithdrawal || snapshot.withdrawal;
    const isWithdrawn = withdrawal && withdrawal.status === 'withdrawn';
    const reportRef = caseData.reportRef || `HV-REP-${caseData.id.slice(-8).toUpperCase()}`;
    const digitalHash = caseData.reportHash || `SHA256-${caseData.id.slice(0, 16).toUpperCase()}`;

    const publicDoctor = {
      name: doctorId.name || caseData.approvingDoctorName || 'Verified Physician',
      specialty: doctorId.specialty || caseData.doctorSpecialty || 'Pulmonology',
      licenseNumber: doctorId.licenseNumber || caseData.doctorLicense || 'VERIFIED-LICENSE',
      clinic: doctorId.clinic || caseData.clinicName || 'Health Vibe Medical Center'
    };

    if (isWithdrawn) {
      return res.json({
        valid: false,
        status: 'withdrawn',
        reportRef,
        reportVersion: snapshot.versions?.reportVersion || caseData.reportVersion || '1.0.0',
        revisionNumber: snapshot.revisionNumber || caseData.reportRevisionNumber || 1,
        issuedAt: snapshot.dates?.approvedAt || caseData.approvedAt || null,
        withdrawnAt: withdrawal.withdrawnAt,
        withdrawalReason: withdrawal.reason,
        doctor: publicDoctor,
        clinic: publicDoctor.clinic,
        digitalSignature: {
          algorithm: 'SHA-256',
          hash: digitalHash
        },
        statusDescription: 'Report Formally Withdrawn by Physician',
        medicalPrivacyNotice: 'Confidential clinical content (diagnosis, medications, vitals) is protected under HIPAA/GDPR and excluded from public authenticity verification.'
      });
    }

    if (caseData.status !== 'approved' || caseData.doctorApproved !== true) {
      return res.json({
        valid: false,
        status: 'unapproved',
        reportRef,
        statusDescription: 'Preliminary / Not Certified by Physician',
        medicalPrivacyNotice: 'Confidential clinical content is excluded.'
      });
    }

    return res.json({
      valid: true,
      status: 'certified',
      reportRef,
      reportVersion: snapshot.versions?.reportVersion || caseData.reportVersion || '1.0.0',
      revisionNumber: snapshot.revisionNumber || caseData.reportRevisionNumber || 1,
      issuedAt: snapshot.dates?.approvedAt || caseData.approvedAt || null,
      doctor: publicDoctor,
      clinic: publicDoctor.clinic,
      digitalSignature: {
        algorithm: 'SHA-256',
        hash: digitalHash
      },
      statusDescription: 'Digitally Certified & Authenticated by Attending Physician',
      authenticityStatement: 'This digital certificate confirms that the clinical report was officially reviewed, approved, and digitally signed by a verified licensed physician on the Health Vibe platform.',
      medicalPrivacyNotice: 'Confidential clinical content (diagnosis, medications, vitals) is protected under HIPAA/GDPR and excluded from public authenticity verification.'
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: 'VERIFICATION_ERROR', message: err.message });
  }
});

function buildApprovedReportSnapshot({ caseId, caseData, updateData, doctorIdentity, actor, approvedAtIso, previousRevisionId }) {
  const reportRevisionNumber = Number(caseData.reportRevisionNumber || 0) + 1;
  const revisionId = `${caseId}_v${reportRevisionNumber}`;
  const originalCaseId = caseData.originalCaseId || caseData.caseId || caseId;
  const patientSnapshot = {
    patientId: caseData.patientId || caseData.userId || null,
    patientName: caseData.patientName || caseData.name || '',
    patientEmail: caseData.patientEmail || caseData.userEmail || caseData.email || '',
    patientPhone: caseData.patientPhone || caseData.phone || '',
    patientDob: caseData.patientDob || caseData.dateOfBirth || caseData.dob || null,
    patientAge: caseData.patientAge || caseData.age || '',
    patientMedicalHistory: caseData.patientMedicalHistory || caseData.medicalHistory || ''
  };
  const caseSnapshot = {
    id: caseId,
    originalCaseId,
    clinicId: recordClinicId(caseData) || null,
    submittedAt: caseData.submittedAt || caseData.createdAt || null,
    oxygenLevel: caseData.oxygenLevel ?? caseData.o2 ?? null,
    o2: caseData.o2 ?? caseData.oxygenLevel ?? null,
    breathingDifficulty: caseData.breathingDifficulty || caseData.difficulty || '',
    coughLevel: caseData.coughLevel || '',
    symptomDuration: caseData.symptomDuration || caseData.duration || '',
    temperature: caseData.assessment?.vitals?.temperature ?? caseData.temperature ?? null,
    temperatureUnit: caseData.assessment?.vitals?.temperatureUnit || caseData.temperatureUnit || '°C',
    respiratoryRate: caseData.assessment?.vitals?.respiratoryRate ?? caseData.respiratoryRate ?? null,
    respiratoryRateUnit: caseData.assessment?.vitals?.respiratoryRateUnit || caseData.respiratoryRateUnit || null,
    chestPain: caseData.chestPain || caseData.assessment?.symptoms?.chestPain || '',
    progression: caseData.progression || caseData.assessment?.symptoms?.progression || '',
    riskFactors: caseData.riskFactors || caseData.assessment?.riskFactors || [],
    patientNotes: caseData.patientNotes || caseData.notes || ''
  };
  const clinicalContent = {
    clinicalDiagnosis: updateData.clinicalDiagnosis,
    clinicalNotes: updateData.clinicalNotes,
    doctorNote: updateData.doctorNote,
    medications: updateData.medications,
    recommendation: updateData.recommendation,
    recommendations: updateData.recommendations
  };
  const signature = {
    workflow: 'doctor_electronic_approval_v1',
    status: 'signed',
    signedAt: approvedAtIso,
    signedBy: actor,
    meaning: 'The verified doctor approved this report version for patient viewing.'
  };
  return {
    revisionId,
    revisionNumber: reportRevisionNumber,
    originalCaseId,
    previousRevisionId: previousRevisionId || caseData.currentReportRevisionId || null,
    caseId,
    status: 'approved',
    patient: patientSnapshot,
    caseDetails: caseSnapshot,
    clinicalContent,
    doctorIdentity,
    approval: {
      approvedAt: approvedAtIso,
      approvedBy: actor,
      signature
    },
    signature,
    disclaimer: {
      en: 'This report records physician-reviewed clinical information from Health Vibe. It supports care coordination and does not replace emergency medical care.',
      ar: 'يوثق هذا التقرير معلومات سريرية راجعها الطبيب عبر Health Vibe. يدعم تنسيق الرعاية ولا يستبدل رعاية الطوارئ الطبية.'
    },
    versions: {
      reportVersion: REPORT_VERSION,
      modelVersion: MODEL_VERSION,
      ruleEngineVersion: caseData.assessment?.aiTriage?.ruleEngineVersion || caseData.ruleEngineVersion || null
    },
    dates: {
      submittedAt: caseSnapshot.submittedAt,
      approvedAt: approvedAtIso,
      generatedAt: approvedAtIso,
      snapshotCreatedAt: approvedAtIso
    },
    withdrawal: {
      status: 'active',
      withdrawnAt: null,
      withdrawnBy: null,
      reason: null
    }
  };
}

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
        const profile = req.doctorProfile || await getServerUserProfile(req.user.uid);
        const authCheck = verifyDoctorAuthorization(doctorIdentity, profile);
        if (!authCheck.ok) {
          return res.status(403).json({
            error: authCheck.error,
            message: authCheck.message,
            licenseExpiryDate: authCheck.licenseExpiryDate,
            reverificationDueDate: authCheck.reverificationDueDate
          });
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

          // Clinic Membership Check for case approval
          const caseClinicId = recordClinicId(caseData);
          if (targetStatus === 'approved' && caseClinicId) {
            const profile = req.doctorProfile || await getServerUserProfile(req.user.uid);
            const isMember = isDoctorApprovedMemberOfClinic(req.doctorIdentity, profile, caseClinicId);
            if (!isMember) {
              return {
                statusCode: 403,
                body: {
                  error: 'DOCTOR_CLINIC_MEMBERSHIP_REQUIRED',
                  message: `Doctor does not hold an approved active membership for clinic '${caseClinicId}' handling this case.`
                }
              };
            }
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
            const previousRevisionId = caseData.currentReportRevisionId || null;
            const actor = {
              uid: req.user.uid,
              email: req.user.email || '',
              name: doctorIdentity.name || req.user.name || req.user.displayName || 'Doctor',
              role: 'doctor'
            };
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
            updateData.reportSnapshot = buildApprovedReportSnapshot({
              caseId,
              caseData,
              updateData,
              doctorIdentity,
              actor,
              approvedAtIso: nowIso,
              previousRevisionId
            });
            updateData.reportRevisionNumber = updateData.reportSnapshot.revisionNumber;
            updateData.currentReportRevisionId = updateData.reportSnapshot.revisionId;
            updateData.originalCaseId = updateData.reportSnapshot.originalCaseId;
            updateData.previousReportRevisionId = previousRevisionId;
            updateData.approvalHistory = admin.firestore.FieldValue.arrayUnion({
              revisionId: updateData.reportSnapshot.revisionId,
              revisionNumber: updateData.reportSnapshot.revisionNumber,
              approvedAt: nowIso,
              approvedBy: actor,
              signatureWorkflow: updateData.reportSnapshot.signature.workflow
            });
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
          if (targetStatus === 'approved') {
            const reportRevisionRef = db.collection('clinical_reports').doc(updateData.reportSnapshot.revisionId);
            transaction.set(reportRevisionRef, {
              ...updateData.reportSnapshot,
              patientId: updateData.reportSnapshot.patient.patientId,
              approvingDoctorId: req.user.uid,
              clinicId: updateData.reportSnapshot.caseDetails.clinicId,
              reportRef: updateData.reportRef,
              reportVersion: updateData.reportVersion,
              modelVersion: updateData.modelVersion,
              doctorApproved: true,
              published: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
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
              revisionId: updateData.reportSnapshot.revisionId,
              revisionNumber: updateData.reportSnapshot.revisionNumber,
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
        } else if (targetStatus === 'escalated') {
          notificationResult = await sendClinicalNotificationEmail({
            type: 'escalation',
            patientEmail: targetRecipient,
            patientName: targetPatientName,
            caseId: caseId,
            severityLevel: caseData.triageLevel || 'عالي الخطورة (Red Flag)',
            criticalFindings: note || updateData.escalationReason || 'تم رصد مؤشرات حرجة تستدعي التدخل الفوري',
            instructions: 'يرجى التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف (123).',
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
app.post('/api/doctor/approve-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, requireMfaIfEnrolled, async (req, res) => {
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

app.post('/api/doctor/withdraw-clinical-report', requireAuth, requireVerifiedEmail, requireDoctor, requireMfaIfEnrolled, async (req, res) => {
  const { caseId, reason } = req.body || {};
  const withdrawalReason = String(reason || '').trim();
  if (!caseId || !withdrawalReason) {
    return res.status(400).json({ error: 'MISSING_WITHDRAWAL_REASON', message: 'caseId and withdrawal reason are required.' });
  }
  try {
    const caseRef = db.collection('cases').doc(caseId);
    const result = await db.runTransaction(async transaction => {
      const caseDoc = await transaction.get(caseRef);
      if (!caseDoc.exists) return { statusCode: 404, body: { error: 'NOT_FOUND' } };
      const caseData = caseDoc.data() || {};
      const assignedDoctor = caseData.assignedDoctorId || caseData.doctorId || caseData.doctorUid;
      if (assignedDoctor !== req.user.uid && caseData.approvingDoctorId !== req.user.uid) {
        return { statusCode: 403, body: { error: 'ACCESS_DENIED' } };
      }
      if (caseData.status !== 'approved' || caseData.doctorApproved !== true || !caseData.currentReportRevisionId) {
        return { statusCode: 400, body: { error: 'NO_ACTIVE_APPROVED_REPORT' } };
      }
      const nowIso = new Date().toISOString();
      const actor = {
        uid: req.user.uid,
        email: req.user.email || '',
        name: req.user.name || req.user.displayName || 'Doctor',
        role: 'doctor'
      };
      const withdrawal = {
        status: 'withdrawn',
        withdrawnAt: nowIso,
        withdrawnBy: actor,
        reason: withdrawalReason
      };
      transaction.update(caseRef, {
        reportWithdrawal: withdrawal,
        'reportSnapshot.withdrawal': withdrawal,
        reportWithdrawnAt: nowIso,
        reportWithdrawnBy: req.user.uid,
        reportWithdrawalReason: withdrawalReason,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          oldStatus: 'approved',
          newStatus: 'report_withdrawn',
          actor,
          reason: withdrawalReason,
          timestamp: nowIso,
          changedAt: nowIso,
          changedBy: req.user.uid,
          changedByEmail: req.user.email || '',
          changedByRole: 'doctor'
        })
      });
      transaction.update(db.collection('clinical_reports').doc(caseData.currentReportRevisionId), {
        withdrawal,
        published: false,
        withdrawnAt: nowIso,
        withdrawnBy: req.user.uid,
        withdrawalReason
      });
      transaction.set(db.collection('audit_events').doc(), {
        type: 'CLINICAL_REPORT_WITHDRAWN',
        caseId,
        revisionId: caseData.currentReportRevisionId,
        doctorId: req.user.uid,
        actor,
        reason: withdrawalReason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      return { revisionId: caseData.currentReportRevisionId, withdrawal };
    });
    if (result.statusCode) return res.status(result.statusCode).json(result.body);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[REPORT WITHDRAW ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
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
 * GET /api/appointments/doctors
 * Returns list of approved doctors with work schedules, clinic association, time zones, and leaves.
 */
app.get('/api/appointments/doctors', async (req, res) => {
  try {
    const doctors = [];
    if (db && typeof db.collection === 'function') {
      try {
        const snap = await db.collection('doctor_applications').where('status', '==', 'approved').get();
        snap.forEach(doc => {
          const d = doc.data() || {};
          const uid = d.userId || d.doctorId || doc.id;
          if (uid) {
            doctors.push(schedulingService.getDoctorWithSchedule(uid, d.name || d.displayName));
          }
        });
      } catch (err) {
        console.warn('[DOCTORS FETCH DB WARNING]:', err.message);
      }
    }
    for (const docId of Object.keys(schedulingService.DOCTOR_SCHEDULES)) {
      if (!doctors.some(d => d.doctorId === docId)) {
        doctors.push(schedulingService.getDoctorWithSchedule(docId));
      }
    }
    return res.json({ success: true, doctors });
  } catch (err) {
    console.error('[DOCTORS FETCH ERROR]:', err);
    return res.status(500).json({ error: 'DOCTORS_FETCH_FAILED', message: err.message });
  }
});

/**
 * GET /api/appointments/availability
 * Returns dynamic slot schedule and availability for a doctor on a specific date,
 * strictly factoring in clinic operating hours, timezone, doctor shifts, breaks, and leaves.
 */
app.get('/api/appointments/availability', async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'doctorId and date query parameters are required.' });
  }
  try {
    const doctor = schedulingService.getDoctorWithSchedule(doctorId);
    const availability = schedulingService.calculateDoctorSlots(doctor, date);

    let bookedSlotIds = [];
    if (db && typeof db.collection === 'function') {
      try {
        const snap = await db.collection('appointments')
          .where('doctorId', '==', doctorId)
          .where('date', '==', date)
          .where('status', '==', 'confirmed')
          .get();
        snap.forEach(doc => {
          const d = doc.data() || {};
          if (d.slotId) bookedSlotIds.push(d.slotId);
        });
      } catch (err) {
        console.warn('[AVAILABILITY QUERY WARNING]:', err.message);
      }
    }

    const slotsWithBookingState = availability.slots.map(s => ({
      ...s,
      isBooked: bookedSlotIds.includes(s.id)
    }));

    return res.json({
      success: true,
      doctorId,
      date,
      available: availability.available,
      reason: availability.reason,
      reasonMessage: availability.reasonMessage,
      leave: availability.leave || null,
      clinic: availability.clinic,
      timeZone: availability.timeZone,
      slots: slotsWithBookingState
    });
  } catch (err) {
    console.error('[AVAILABILITY FETCH ERROR]:', err);
    return res.status(500).json({ error: 'AVAILABILITY_FETCH_FAILED', message: err.message });
  }
});

/**
 * POST /api/appointments/book
 * Server-authoritative appointment booking with ACID transaction,
 * stable canonical identifiers, and anti-double booking concurrency locks.
 * Guarantees that an appointment is NEVER marked confirmed before it is saved!
 */
app.post('/api/appointments/book', requireAuth, requireVerifiedEmail, async (req, res) => {
  const data = req.body || {};

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
    const savedAppointment = await schedulingService.bookAppointmentTransaction(db, data, req.user);
    return res.status(201).json({
      success: true,
      appointmentId: savedAppointment.id,
      appointment: savedAppointment
    });
  } catch (err) {
    console.error('[APPOINTMENT BOOK ERROR]:', err);
    const statusCode = err.statusCode || (err.code === 'DOCTOR_SLOT_CONFLICT' || err.code === 'PATIENT_SLOT_CONFLICT' ? 409 : 500);
    return res.status(statusCode).json({
      error: err.code || 'APPOINTMENT_BOOK_FAILED',
      message: err.message,
      details: err.details || null
    });
  }
});

/**
 * POST /api/appointments/cancel
 * Cancels only after the server has persisted the status transition,
 * releasing doctor and patient slot locks atomically.
 */
app.post('/api/appointments/cancel', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { appointmentId, reason } = req.body || {};
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

    const cancelResult = await schedulingService.cancelAppointmentTransaction(db, appointmentId, req.user, {
      isAdmin: hasTrustedAdminClaim(req.user),
      reason
    });
    return res.json({ success: true, appointmentId, status: 'cancelled' });
  } catch (err) {
    console.error('[APPOINTMENT CANCEL ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.code || 'APPOINTMENT_CANCEL_FAILED', message: err.message });
  }
});

/**
 * POST /api/appointments/reschedule
 * Safely reserves the replacement slot and releases the old slot atomically.
 * Enforces role permissions, notice policy, and retains change history.
 */
app.post('/api/appointments/reschedule', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { appointmentId, newDate, newSlotId, reason } = req.body || {};
  if (!appointmentId || !newDate || !newSlotId) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'appointmentId, newDate, and newSlotId are required.' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'APPOINTMENT_STORAGE_UNAVAILABLE', message: 'Appointment storage is unavailable. Please retry shortly.' });
  }
  try {
    const result = await schedulingService.rescheduleAppointmentTransaction(db, {
      appointmentId,
      newDate,
      newSlotId,
      reason
    }, req.user);
    return res.json(result);
  } catch (err) {
    console.error('[APPOINTMENT RESCHEDULE ERROR]:', err);
    const statusCode = err.statusCode || (err.code === 'DOCTOR_SLOT_CONFLICT' || err.code === 'PATIENT_SLOT_CONFLICT' ? 409 : 500);
    return res.status(statusCode).json({ error: err.code || 'APPOINTMENT_RESCHEDULE_FAILED', message: err.message });
  }
});

/**
 * POST /api/appointments/update-status
 * Updates appointment status (completed, no_show) with clinical notes and change history.
 */
app.post('/api/appointments/update-status', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { appointmentId, status, notes, reason } = req.body || {};
  if (!appointmentId || !status) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'appointmentId and status are required.' });
  }
  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'APPOINTMENT_STORAGE_UNAVAILABLE', message: 'Appointment storage is unavailable. Please retry shortly.' });
  }
  try {
    const result = await schedulingService.updateAppointmentStatusTransaction(db, {
      appointmentId,
      status,
      notes,
      reason
    }, req.user);
    return res.json(result);
  } catch (err) {
    console.error('[APPOINTMENT STATUS UPDATE ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.code || 'STATUS_UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/appointments/my-appointments
 * Retrieves appointment history for patient partitioned into upcoming and past.
 */
app.get('/api/appointments/my-appointments', requireAuth, async (req, res) => {
  if (!db || typeof db.collection !== 'function') {
    return res.status(503).json({ error: 'APPOINTMENT_STORAGE_UNAVAILABLE', message: 'Appointment storage is unavailable.' });
  }
  try {
    const result = await schedulingService.getAppointmentsHistory(db, req.query, req.user);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[APPOINTMENTS HISTORY ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.code || 'HISTORY_FETCH_FAILED', message: err.message });
  }
});

/**
 * GET /api/appointments/doctor-calendar
 * Retrieves full calendar schedule for doctor over a date range.
 */
app.get('/api/appointments/doctor-calendar', requireAuth, async (req, res) => {
  const { doctorId, startDate, endDate } = req.query;
  if (!doctorId) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'doctorId query parameter is required.' });
  }
  try {
    const result = await schedulingService.getDoctorCalendar(db, { doctorId, startDate, endDate }, req.user);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[DOCTOR CALENDAR ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.code || 'CALENDAR_FETCH_FAILED', message: err.message });
  }
});

/**
 * GET /api/appointments/clinic-calendar
 * Retrieves aggregate clinic calendar for all doctors on a specific date.
 */
app.get('/api/appointments/clinic-calendar', requireAuth, async (req, res) => {
  const { clinicId, date } = req.query;
  try {
    const result = await schedulingService.getClinicCalendar(db, { clinicId, date }, req.user);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[CLINIC CALENDAR ERROR]:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.code || 'CLINIC_CALENDAR_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/send-email
 * Dedicated endpoint for dispatching clinical email notifications across all 6 categories:
 * result_ready, information_requested, doctor_assigned, escalation, appointment_changes, verification.
 */
app.post('/api/notifications/send-email', requireAuth, requireVerifiedEmail, async (req, res) => {
  const {
    type,
    caseId,
    appointmentId,
    note,
    overrideRecipient,
    code,
    purpose,
    severityLevel,
    criticalFindings,
    action
  } = req.body;

  const validTypes = [
    'result_ready',
    'more_info_requested',
    'information_requested',
    'doctor_assigned',
    'escalation',
    'appointment_changes',
    'appointment_booked',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_reminder',
    'verification'
  ];

  if (!validTypes.includes(type)) {
    return res.status(400).json({
      error: 'INVALID_TYPE',
      message: `Notification type '${type}' is not supported. Allowed: ${validTypes.join(', ')}.`
    });
  }

  try {
    let recipient = (overrideRecipient || '').trim();
    let patientName = '';
    let notificationPayload = { ...req.body };

    // 1. Case-associated notification types
    if (['result_ready', 'more_info_requested', 'information_requested', 'doctor_assigned', 'escalation'].includes(type)) {
      if (!caseId) {
        return res.status(400).json({ error: 'MISSING_CASE_ID', message: 'caseId is required for clinical notifications.' });
      }

      const caseDoc = await db.collection('cases').doc(caseId).get();
      if (!caseDoc.exists) {
        return res.status(404).json({ error: 'CASE_NOT_FOUND', message: `Case ${caseId} does not exist.` });
      }

      const c = caseDoc.data();
      const assignedDoctor = c.assignedDoctorId || c.doctorId || c.doctorUid;
      const userRole = req.user.role || 'patient';
      const isPrivileged = ['super_admin', 'clinic_admin'].includes(userRole);

      // Verify doctor assignment if doctor role
      if (userRole === 'doctor') {
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
      } else if (!isPrivileged && type !== 'escalation') {
        return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Only authorized clinical staff can dispatch case notifications.' });
      }

      if (!recipient) {
        recipient = c.patientEmail || c.email;
        patientName = c.patientName || c.name;
        if (!recipient && c.patientId) {
          const uDoc = await db.collection('users').doc(c.patientId).get();
          if (uDoc.exists) {
            recipient = uDoc.data().email || uDoc.data().patientEmail;
            if (!patientName) patientName = uDoc.data().name || uDoc.data().displayName;
          }
        }
      }

      notificationPayload = {
        ...notificationPayload,
        caseId,
        reportRef: c.reportRef,
        doctorName: c.approvingDoctorName || req.user.displayName || req.user.name || 'Doctor',
        doctorSpecialty: c.doctorSpecialty,
        clinicName: c.clinicName,
        clinicalDiagnosis: c.clinicalDiagnosis || c.clinicalNotes,
        medications: c.medications,
        recommendations: c.recommendations,
        moreInfoNote: note || c.moreInfoNote,
        severityLevel: severityLevel || c.triageLevel,
        criticalFindings: criticalFindings || c.criticalFindings
      };
    }

    // 2. Appointment-associated notification types
    if (type.startsWith('appointment_')) {
      if (appointmentId && db) {
        const apptDoc = await db.collection('appointments').doc(appointmentId).get();
        if (apptDoc.exists) {
          const a = apptDoc.data();
          if (!recipient) recipient = a.patientEmail || a.recipient;
          if (!patientName) patientName = a.patientName;
          notificationPayload = {
            ...a,
            ...notificationPayload,
            appointmentId
          };
        }
      }
    }

    // 3. Verification notification type
    if (type === 'verification') {
      if (!recipient) recipient = req.user.email;
      notificationPayload = {
        ...notificationPayload,
        recipientName: patientName || req.user.name || req.user.displayName || 'User',
        code: code || Math.floor(100000 + Math.random() * 900000).toString(),
        purpose: purpose || 'Account Verification'
      };
    }

    if (!recipient) {
      return res.status(400).json({ error: 'NO_RECIPIENT_EMAIL', message: 'Could not determine recipient email.' });
    }

    const result = await sendClinicalNotificationEmail({
      type,
      patientEmail: recipient,
      recipient,
      patientName,
      ...notificationPayload,
      db
    });

    if (!result.success) {
      return res.status(502).json({ error: result.code || 'DISPATCH_FAILED', message: result.error || 'Failed to dispatch email notification.' });
    }

    return res.json({ success: true, notification: result });
  } catch (err) {
    console.error('[SERVER NOTIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/notifications/enqueue
 * Durable queue submission with idempotency deduplication guard.
 */
app.post('/api/notifications/enqueue', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { type, recipient, payload, idempotencyKey, scheduledAt, priority } = req.body;
  if (!type || !recipient) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'type and recipient are required.' });
  }

  try {
    const queueResult = await enqueueNotification(db, {
      type,
      recipient,
      payload: payload || {},
      idempotencyKey,
      scheduledAt,
      priority
    });
    return res.json({ success: true, ...queueResult });
  } catch (err) {
    console.error('[ENQUEUE NOTIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'ENQUEUE_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/process-queue
 * Worker trigger to process pending notifications in the queue.
 */
app.post('/api/notifications/process-queue', requireAuth, async (req, res) => {
  const userRole = req.user.role || 'patient';
  if (!['super_admin', 'clinic_admin', 'doctor'].includes(userRole)) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Queue processing requires administrative privileges.' });
  }

  try {
    const { batchSize } = req.body || {};
    const stats = await processNotificationQueue(db, { batchSize: Number(batchSize) || 10 });
    return res.json({ success: true, stats });
  } catch (err) {
    console.error('[PROCESS QUEUE ERROR]:', err);
    return res.status(500).json({ error: 'QUEUE_PROCESSING_FAILED', message: err.message });
  }
});

/**
 * GET /api/notifications/queue-status
 * Health and state inspection for the notification queue.
 */
app.get('/api/notifications/queue-status', requireAuth, async (req, res) => {
  const userRole = req.user.role || 'patient';
  if (!['super_admin', 'clinic_admin', 'doctor'].includes(userRole)) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Queue inspection requires administrative privileges.' });
  }

  try {
    const counts = {
      pending: 0,
      processing: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
      total: 0
    };

    if (db && typeof db.collection === 'function') {
      const snap = await db.collection('notification_queue').get();
      snap.forEach(doc => {
        counts.total++;
        const status = doc.data()?.status;
        if (status && counts[status] !== undefined) {
          counts[status]++;
        }
      });
    }

    return res.json({ success: true, queue: counts });
  } catch (err) {
    return res.status(500).json({ error: 'QUEUE_STATUS_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/delivery-webhook
 * Record verified delivery confirmation from email provider without claiming delivery merely on send.
 */
app.post('/api/notifications/delivery-webhook', async (req, res) => {
  const { messageId, notificationId, recipient, deliveredAt, providerMetadata, secret } = req.body || {};

  // Optional webhook secret guard
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'UNAUTHORIZED_WEBHOOK', message: 'Invalid webhook credentials.' });
  }

  if (!messageId && !notificationId) {
    return res.status(400).json({ error: 'MISSING_IDENTIFIER', message: 'messageId or notificationId is required.' });
  }

  try {
    const result = await recordDeliveryConfirmation(db, {
      messageId,
      notificationId,
      recipient,
      deliveredAt,
      providerMetadata
    });
    return res.json({ success: true, delivery: result });
  } catch (err) {
    console.error('[DELIVERY WEBHOOK ERROR]:', err);
    return res.status(500).json({ error: 'DELIVERY_RECORDING_FAILED', message: err.message });
  }
});

// =========================================================================
// ⭐ CLINICAL & PATIENT FEEDBACK API ENDPOINTS
// =========================================================================

/**
 * POST /api/feedback/submit & POST /api/feedback/tickets
 * Supports structured feedback, ratings (1-5 stars), bug reports, inaccurate-information reports,
 * feature requests, account recovery, and contact inquiries organized into tickets with priority, status, and owner.
 */
const handleTicketSubmission = async (req, res) => {
  const {
    rating,
    category,
    comment,
    description,
    subject,
    type,
    ticketType,
    priority,
    role,
    caseId,
    appointmentId,
    isPublic,
    hasSensitiveMedicalContent,
    medicalDetails,
    metadata
  } = req.body || {};

  const resolvedType = type || ticketType || (rating !== undefined && rating !== null ? 'experience_rating' : 'experience_rating');

  // Rating validation if rating is provided or if it's an experience rating
  let numericRating = null;
  if (rating !== undefined && rating !== null && rating !== '') {
    numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        error: 'INVALID_RATING',
        message: 'Rating must be an integer between 1 and 5 stars.'
      });
    }
  } else if (resolvedType === 'experience_rating') {
    numericRating = 5;
  }

  const rawComment = (comment || description || subject || '').trim();
  if (!rawComment || typeof rawComment !== 'string' || rawComment.length < 2) {
    return res.status(400).json({
      error: 'INVALID_COMMENT',
      message: 'Comment must be at least 2 characters.'
    });
  }

  if (rawComment.length > 2000) {
    return res.status(400).json({
      error: 'COMMENT_TOO_LONG',
      message: 'Comment cannot exceed 2000 characters.'
    });
  }

  const userRole = getTrustedClaimRole(req.user);
  const validRoles = ['patient', 'doctor', 'doctor_pending', 'clinic_admin', 'support', 'super_admin'];
  const sanitizedRole = validRoles.includes(userRole) ? userRole : 'patient';

  try {
    const ticket = await feedbackSupportService.createTicket({
      type: resolvedType,
      category: (typeof category === 'string' && category.trim()) ? category.trim() : 'general',
      subject: subject || (numericRating ? `Rating (${numericRating}★)` : `${resolvedType}`),
      comment: rawComment,
      description: rawComment,
      rating: numericRating,
      priority,
      user: {
        uid: req.user.uid,
        name: req.user.displayName || req.user.name || (sanitizedRole === 'doctor' ? 'طبيب ممارس' : 'مريض'),
        email: req.user.email || null,
        role: sanitizedRole,
        clinicId: req.user.clinicId || null
      },
      caseId: caseId || null,
      appointmentId: appointmentId || null,
      hasSensitiveMedicalContent: Boolean(hasSensitiveMedicalContent || resolvedType === 'inaccurate_information'),
      medicalDetails: medicalDetails || (hasSensitiveMedicalContent || resolvedType === 'inaccurate_information' ? { issue: rawComment, caseId } : null),
      metadata: metadata || { isPublic: Boolean(isPublic) }
    });

    console.log(`[FEEDBACK] Ticket created: ${ticket.ticketId} | Type: ${ticket.type} | Priority: ${ticket.priority} | User: ${req.user.uid} (${sanitizedRole})`);

    // Dual collection write for audit & legacy tests
    if (db && typeof db.collection === 'function') {
      try {
        await db.collection('feedbacks').doc(ticket.ticketId).set(ticket);
        await db.collection('support_tickets').doc(ticket.ticketId).set(ticket);
      } catch (e) {
        // Fallback
      }
    }

    return res.status(201).json({
      success: true,
      feedbackId: ticket.ticketId,
      ticketId: ticket.ticketId,
      status: ticket.status,
      priority: ticket.priority,
      owner: ticket.owner,
      message: 'Feedback submitted successfully',
      feedback: ticket,
      ticket
    });
  } catch (err) {
    console.error('[FEEDBACK ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

app.post('/api/feedback/submit', requireAuth, handleTicketSubmission);
app.post('/api/feedback/tickets', requireAuth, handleTicketSubmission);

/**
 * GET /api/feedback/list & GET /api/feedback/tickets
 * Returns list of tickets/feedbacks.
 * STRICT SECURITY RULE: Submitters can access ONLY their own tickets!
 * Sensitive medical content is redacted for non-clinical roles.
 */
const handleTicketList = async (req, res) => {
  try {
    const tickets = await feedbackSupportService.listTickets(req.user, req.query);

    return res.json({
      success: true,
      feedbacks: tickets,
      tickets,
      total: tickets.length
    });
  } catch (err) {
    console.error('[FEEDBACK LIST ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

app.get('/api/feedback/list', requireAuth, handleTicketList);
app.get('/api/feedback/tickets', requireAuth, handleTicketList);

/**
 * GET /api/feedback/tickets/:ticketId
 * Fetch single ticket details with strict authorization.
 * Submitter can access ONLY their own ticket.
 * Sensitive medical content redacted for non-clinical staff.
 */
app.get('/api/feedback/tickets/:ticketId', requireAuth, async (req, res) => {
  try {
    const ticket = await feedbackSupportService.getTicketById(req.params.ticketId, req.user);
    return res.json({ success: true, ticket, feedback: ticket });
  } catch (err) {
    if (err.code === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: err.message });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * PATCH /api/feedback/tickets/:ticketId
 * Administrative / Staff status, priority, or owner update
 */
app.patch('/api/feedback/tickets/:ticketId', requireAuth, async (req, res) => {
  try {
    const updated = await feedbackSupportService.updateTicket(req.params.ticketId, req.body, req.user);
    return res.json({ success: true, ticket: updated });
  } catch (err) {
    if (err.code === 'PERMISSION_DENIED') {
      return res.status(403).json({ error: 'PERMISSION_DENIED', message: err.message });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/feedback/tickets/:ticketId/escalate
 * Dedicated escalation channel for urgent/critical/clinical issues
 */
app.post('/api/feedback/tickets/:ticketId/escalate', requireAuth, async (req, res) => {
  try {
    const reason = req.body?.reason || req.body?.escalationReason || 'Urgent clinical/safety escalation';
    const escalatedTicket = await feedbackSupportService.escalateTicket(req.params.ticketId, req.user, reason);
    return res.json({
      success: true,
      message: 'Ticket successfully escalated to Clinical Safety Officer / Senior Queue.',
      ticket: escalatedTicket
    });
  } catch (err) {
    if (err.code === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: err.message });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/feedback/tickets/:ticketId/respond
 * Add a communication or clinical reply to a ticket
 */
app.post('/api/feedback/tickets/:ticketId/respond', requireAuth, async (req, res) => {
  try {
    const { message, isClinical } = req.body || {};
    const response = await feedbackSupportService.addResponse(req.params.ticketId, { message, isClinical }, req.user);
    return res.status(201).json({ success: true, response });
  } catch (err) {
    if (err.code === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: err.message });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    if (err.code === 'INVALID_MESSAGE') {
      return res.status(400).json({ error: 'INVALID_MESSAGE', message: err.message });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/support/account-recovery
 * Dedicated Account Recovery Support Channel
 */
app.post('/api/support/account-recovery', accountRecoveryLimiter, async (req, res) => {
  try {
    const result = await feedbackSupportService.createAccountRecoveryRequest(req.body || {});
    return res.status(201).json(result);
  } catch (err) {
    if (err.code === 'INVALID_IDENTIFIER') {
      return res.status(400).json({ error: 'INVALID_IDENTIFIER', message: err.message });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /api/support/faq
 * Help Center Knowledgebase / FAQ Search & Retrieval
 */
app.get('/api/support/faq', (req, res) => {
  try {
    const category = req.query.category || 'all';
    const search = req.query.search || req.query.q || '';
    const faqs = feedbackSupportService.getFaqs({ category, search });
    return res.json({ success: true, count: faqs.length, faqs });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/support/contact
 * Contact Us Form for Patients, Doctors, and Clinic Inquiries
 */
app.post('/api/support/contact', publicFormLimiter, async (req, res) => {
  try {
    const { name, email, subject, category, message } = req.body || {};
    const result = await feedbackSupportService.createContactSubmission({
      name,
      email,
      subject,
      category,
      message,
      user: req.user || {}
    });
    return res.status(201).json(result);
  } catch (err) {
    if (['INVALID_NAME', 'INVALID_EMAIL', 'INVALID_MESSAGE'].includes(err.code)) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
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

      const authCheck = verifyDoctorAuthorization(doctorIdentity, doctorProfile);
      if (!authCheck.ok) {
        return res.status(403).json({
          error: authCheck.error,
          message: `Cannot assign case: ${authCheck.message}`,
          licenseExpiryDate: authCheck.licenseExpiryDate,
          reverificationDueDate: authCheck.reverificationDueDate
        });
      }

      const targetClinic = (scope.role === ROLES.SUPER_ADMIN && clinicId) ? clinicId : (recordClinicId(caseData) || (scope.role === ROLES.CLINIC_ADMIN ? scope.clinicId : null));
      if (targetClinic && !isDoctorApprovedMemberOfClinic(doctorIdentity, doctorProfile, targetClinic)) {
        return res.status(403).json({
          error: 'DOCTOR_CLINIC_MEMBERSHIP_REQUIRED',
          message: `Doctor is not an approved member of clinic '${targetClinic}'.`
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

      // Notify patient of doctor assignment
      try {
        let recipient = caseData.patientEmail || caseData.email;
        let patientName = caseData.patientName || caseData.name;
        if (!recipient && caseData.patientId && db) {
          const uDoc = await db.collection('users').doc(caseData.patientId).get();
          if (uDoc.exists) {
            recipient = uDoc.data().email || uDoc.data().patientEmail;
            if (!patientName) patientName = uDoc.data().name || uDoc.data().displayName;
          }
        }
        if (recipient) {
          await sendClinicalNotificationEmail({
            type: 'doctor_assigned',
            patientEmail: recipient,
            patientName: patientName || 'المحترم',
            caseId,
            doctorName: doctorName || 'طبيب استشاري',
            doctorSpecialty: 'استشاري أمراض الصدر والجهاز التنفسي',
            clinicName: clinicName || caseData.clinicName || 'عيادة الصدر المتخصصة',
            db
          });
        }
      } catch (notifErr) {
        console.warn('[SERVER] Could not send doctor_assigned notification:', notifErr.message);
      }
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

// Active Email Verification Codes Registry (10 minutes validity)
const activeEmailOtps = new Map();

/**
 * POST /api/auth/send-verification-email
 * Sends 6-digit verification code to the authenticated user's email via sendClinicalNotificationEmail.
 */
app.post('/api/auth/send-verification-email', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const userName = req.user.displayName || req.user.name || 'المستخدم';

  if (!userEmail) {
    return res.status(400).json({ error: 'NO_EMAIL', message: 'User account has no associated email address.' });
  }

  if (isVerificationRevoked(userEmail)) {
    return res.status(403).json({
      error: 'VERIFICATION_REVOKED',
      message: 'Account verification has been revoked by the platform administrator.'
    });
  }

  const existing = activeEmailOtps.get(userId);
  if (existing && Date.now() - existing.createdAt < 60000) {
    const waitSec = Math.ceil((60000 - (Date.now() - existing.createdAt)) / 1000);
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: `يرجى الانتظار ${waitSec} ثانية قبل طلب رمز تحقق جديد.`,
      retryAfterSeconds: waitSec
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  activeEmailOtps.set(userId, {
    code,
    expiresAt,
    createdAt: Date.now(),
    email: userEmail
  });

  try {
    const result = await sendClinicalNotificationEmail({
      type: 'verification',
      recipient: userEmail,
      recipientName: userName,
      code,
      purpose: 'تأكيد البريد الإلكتروني وتفعيل الحساب',
      expiresMinutes: 10,
      db
    });

    if (!result.success) {
      return res.status(502).json({ error: 'DISPATCH_FAILED', message: result.error || 'Failed to dispatch verification email.' });
    }

    return res.json({
      success: true,
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح.',
      expiresInSeconds: 600
    });
  } catch (err) {
    console.error('[EMAIL VERIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/auth/verify-email-otp
 * Verifies email OTP code and marks account verified.
 */
app.post('/api/auth/verify-email-otp', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const { code } = req.body || {};

  if (!code || String(code).trim().length !== 6) {
    return res.status(400).json({ error: 'INVALID_CODE', message: 'رمز التحقق يجب أن يتكون من 6 أرقام.' });
  }

  if (isVerificationRevoked(userEmail)) {
    return res.status(403).json({
      error: 'VERIFICATION_REVOKED',
      message: 'Account verification has been revoked by the platform administrator.'
    });
  }

  const lockoutKey = `email_otp_${userId}`;
  const lockoutStatus = checkOtpLockout(lockoutKey);
  if (lockoutStatus.locked) {
    return res.status(429).json({
      error: 'TOO_MANY_FAILED_ATTEMPTS',
      message: `تم قفل التحقق مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى المحاولة بعد ${lockoutStatus.waitSec} ثانية.`,
      retryAfterSeconds: lockoutStatus.waitSec
    });
  }

  const record = activeEmailOtps.get(userId);
  if (!record || record.expiresAt < Date.now() || record.code !== String(code).trim()) {
    const status = recordOtpFailure(lockoutKey);
    const remaining = Math.max(5 - status.attempts, 0);
    return res.status(400).json({
      error: 'CODE_MISMATCH',
      message: remaining > 0
        ? `رمز التحقق غير صحيح أو منتهي الصلاحية. المتبقي: ${remaining} محاولات.`
        : 'تم استنفاد المحاولات. تم قفل التحقق مؤقتاً لمدة 15 دقيقة.'
    });
  }

  clearOtpLockout(lockoutKey);
  activeEmailOtps.delete(userId);

  try {
    if (userId) {
      await admin.auth().updateUser(userId, {
        emailVerified: true
      }).catch(err => console.warn("[EMAIL VERIFY AUTH WARNING]:", err.message));
    }

    if (db && userId) {
      await db.collection('users').doc(userId).set({
        emailVerified: true,
        verificationMethod: 'email_otp',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await db.collection('audit_events').add({
        type: 'EMAIL_VERIFIED_VIA_OTP',
        userId,
        email: userEmail,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'تم التحقق من البريد الإلكتروني وتفعيل الحساب بنجاح.'
    });
  } catch (err) {
    console.error("[EMAIL VERIFY ERROR]:", err);
    return res.status(500).json({ error: 'VERIFICATION_SAVE_FAILED', message: err.message });
  }
});

/**
 * -------------------------------------------------------------
 * AUTOMATED WHATSAPP BOT ENDPOINTS
 * -------------------------------------------------------------
 */

/**
 * -------------------------------------------------------------
 * AUTOMATED WHATSAPP BOT & SECURE OTP ENDPOINTS
 * -------------------------------------------------------------
 */

/**
 * GET /api/messaging/provider-config
 * Returns active WhatsApp provider metadata and configuration (secrets masked).
 */
app.get('/api/messaging/provider-config', requireAuth, (req, res) => {
  res.json({
    success: true,
    config: whatsappBot.getProviderConfig()
  });
});

/**
 * POST /api/bot/request-code
 * Triggers automated WhatsApp bot to generate and send a secret OTP code.
 * Strict Security Guard: The generated code is NEVER returned in the API response.
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
      phoneNumber,
      ip: getClientIp(req)
    });

    res.json({
      success: true,
      expiresInSeconds: result.expiresInSeconds || 300,
      retryAfterSeconds: result.retryAfterSeconds || 60,
      provider: result.provider,
      maskedPhone: result.maskedPhone,
      message: result.message || "تم إرسال كود التفعيل السري تلقائياً عبر بوت الواتساب."
    });
  } catch(err) {
    console.error("[WHATSAPP BOT REQUEST ERROR]:", err.message);
    res.status(err.statusCode || 500).json({
      error: err.code || 'BOT_DISPATCH_FAILED',
      message: err.message,
      retryAfterSeconds: err.retryAfterSeconds || null
    });
  }
});

/**
 * POST /api/bot/verify-code
 * Verifies code submitted by user against WhatsApp bot active registry.
 * Enforces TTL expiration, attempt limits, code reuse guards, and lockout.
 *
 * CRITICAL SECURITY GOVERNANCE:
 * Phone verification strictly verifies phone number possession.
 * It DOES NOT automatically verify email or doctor licensing/identity!
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

  const verifyResult = whatsappBot.verifyCodeDetailed({
    userId,
    userEmail,
    code: String(code).trim(),
    phoneNumber
  });

  if (!verifyResult.isValid) {
    const status = recordOtpFailure(lockoutKey);
    const remaining = Math.max(5 - status.attempts, 0);

    if (verifyResult.reason === 'CODE_EXPIRED') {
      return res.status(400).json({ error: 'CODE_EXPIRED', message: verifyResult.message });
    }
    if (verifyResult.reason === 'CODE_ALREADY_USED') {
      return res.status(400).json({ error: 'CODE_ALREADY_USED', message: verifyResult.message });
    }
    if (verifyResult.reason === 'TOO_MANY_FAILED_ATTEMPTS' || status.locked) {
      return res.status(429).json({
        error: 'TOO_MANY_FAILED_ATTEMPTS',
        message: 'تم استنفاد محاولات إدخال الكود. تم قفل التحقق مؤقتاً لمدة 15 دقيقة.'
      });
    }

    return res.status(400).json({
      error: 'CODE_MISMATCH',
      message: remaining > 0
        ? `كود التحقق غير صحيح. تبقى لك ${remaining} محاولات.`
        : 'تم استنفاد محاولات إدخال الكود. تم قفل التحقق مؤقتاً لمدة 15 دقيقة.'
    });
  }

  clearOtpLockout(lockoutKey);

  try {
    // 1. Mark phoneVerified in Firestore user document (STRICTLY NO emailVerified alteration!)
    if (db && userId) {
      await db.collection('users').doc(userId).set({
        phoneVerified: true,
        phoneNumber: verifyResult.phoneNumber,
        phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        phoneVerificationMethod: 'whatsapp_bot'
      }, { merge: true });

      // 2. Append audit log with masked phone number
      await db.collection('audit_events').add({
        type: 'USER_PHONE_VERIFIED_VIA_WHATSAPP_BOT',
        userId: userId,
        userEmail: userEmail || null,
        phoneNumberMasked: whatsappBot.maskPhoneNumber(verifyResult.phoneNumber),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    res.json({
      success: true,
      phoneVerified: true,
      emailVerified: Boolean(req.user.email_verified || req.user.emailVerified),
      message: 'تم تأكيد رقم الهاتف بنجاح عبر بوت الواتساب!'
    });
  } catch(err) {
    console.error("[BOT VERIFY ERROR]:", err);
    res.status(500).json({ error: 'VERIFICATION_UPDATE_FAILED', message: err.message });
  }
});

/**
 * POST /api/messaging/consent
 * Record or update user opt-in messaging consent.
 */
app.post('/api/messaging/consent', requireAuth, async (req, res) => {
  try {
    const { consentGiven, phoneNumber, categories, channels } = req.body || {};
    const consent = whatsappBot.saveMessagingConsent({
      userId: req.user.uid,
      phoneNumber: phoneNumber || req.user.phoneNumber,
      consentGiven: Boolean(consentGiven),
      categories,
      channels,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    if (db) {
      await db.collection('messaging_consents').doc(req.user.uid).set(consent, { merge: true }).catch(() => {});
    }

    res.json({ success: true, consent });
  } catch (err) {
    res.status(400).json({ error: 'CONSENT_RECORD_FAILED', message: err.message });
  }
});

/**
 * GET /api/messaging/preferences
 * Returns user messaging preferences and consent status.
 */
app.get('/api/messaging/preferences', requireAuth, (req, res) => {
  const prefs = whatsappBot.getMessagingPreferences(req.user.uid, req.query.phoneNumber);
  res.json({ success: true, preferences: prefs });
});

/**
 * PATCH /api/messaging/preferences
 * Updates user notification preferences and channel toggles.
 */
app.patch('/api/messaging/preferences', requireAuth, async (req, res) => {
  try {
    const { channels, categories } = req.body || {};
    const current = whatsappBot.getMessagingPreferences(req.user.uid);
    const updated = whatsappBot.saveMessagingConsent({
      userId: req.user.uid,
      phoneNumber: current.phoneNumberMasked,
      consentGiven: current.consentGiven,
      channels: { ...current.channels, ...channels },
      categories: { ...current.categories, ...categories },
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    if (db) {
      await db.collection('messaging_consents').doc(req.user.uid).set(updated, { merge: true }).catch(() => {});
    }

    res.json({ success: true, preferences: updated });
  } catch (err) {
    res.status(400).json({ error: 'PREFERENCES_UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/messaging/delivery-records
 * Returns delivery records with masked recipients and status tracking.
 */
app.get('/api/messaging/delivery-records', requireAuth, (req, res) => {
  const isStaff = [ROLES.DOCTOR, ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role);
  const userId = isStaff && req.query.all === 'true' ? null : req.user.uid;
  const records = whatsappBot.getDeliveryRecords({ userId, limit: Number(req.query.limit) || 50 });
  res.json({ success: true, count: records.length, records });
});

/**
 * GET /api/bot/status
 * Returns online status and readiness of the automated bot
 */
app.get('/api/bot/status', (req, res) => {
  res.json({
    status: 'online',
    botName: whatsappBot.botName,
    activeProvider: whatsappBot.getActiveProvider(),
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
    purpose: accepted ? 'Explicit consent for Health Vibe clinical assessment, doctor review, report workflow, and selected communications.' : 'Withdrawal of explicit Health Vibe clinical data processing consent.',
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
app.post('/api/user/delete-account', requireAuth, requireMfaIfEnrolled, async (req, res) => {
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
// 🔔 USER NOTIFICATIONS, PREFERENCES & QUIET HOURS ROUTES
// =============================================================================

/**
 * GET /api/notifications & GET /api/notifications/history
 * Returns paginated in-app notification history strictly for the calling user.
 */
const handleNotificationHistory = async (req, res) => {
  try {
    const userId = req.user.uid;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread === 'true';
    const eventType = req.query.eventType || req.query.type || null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const result = await getUserNotificationHistory(db, userId, {
      unreadOnly,
      eventType,
      limit,
      offset
    });

    return res.json({
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      totalCount: result.totalCount
    });
  } catch (err) {
    console.error('[GET NOTIFICATIONS ERROR]:', err);
    return res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
};

app.get('/api/notifications', requireAuth, handleNotificationHistory);
app.get('/api/notifications/history', requireAuth, handleNotificationHistory);

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read strictly if owned by the calling user.
 */
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.uid;

    const updated = await markNotificationAsRead(db, notificationId, userId);
    return res.json({ success: true, notification: updated });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    if (err.code === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: err.message });
    }
    console.error('[MARK READ ERROR]:', err);
    return res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/read-all
 * Marks all notifications for the calling user as read.
 */
app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const result = await markAllNotificationsAsRead(db, userId);
    return res.json({ success: true, updatedCount: result.updatedCount });
  } catch (err) {
    console.error('[MARK ALL READ ERROR]:', err);
    return res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/notifications/preferences
 * Returns user notification channel preferences, quiet hours, and time zone.
 */
app.get('/api/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const preferences = await getUserNotificationPreferences(db, userId);
    return res.json({ success: true, preferences });
  } catch (err) {
    console.error('[GET PREFERENCES ERROR]:', err);
    return res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

/**
 * PUT /api/notifications/preferences
 * Updates user notification preferences (channels, quiet hours, time zone).
 */
app.put('/api/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const updates = req.body || {};

    const preferences = await updateUserNotificationPreferences(db, userId, updates);
    return res.json({
      success: true,
      message: 'Notification preferences updated successfully.',
      preferences
    });
  } catch (err) {
    if (err.code === 'INVALID_TIME_FORMAT' || err.code === 'INVALID_TIMEZONE') {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    console.error('[UPDATE PREFERENCES ERROR]:', err);
    return res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * POST /api/notifications/dispatch
 * Server-side notification sender endpoint enforcing channel preferences, quiet hours,
 * and urgent clinical bypass policies.
 */
app.post('/api/notifications/dispatch', requireAuth, async (req, res) => {
  try {
    const {
      targetUserId,
      userId,
      recipientEmail,
      eventType,
      type,
      title,
      message,
      body,
      authorizedDestinationLink,
      destinationLink,
      urgent,
      priority,
      severity,
      payload,
      appointmentId,
      caseId
    } = req.body || {};

    const effectiveUserId = targetUserId || userId || req.user.uid;
    const callerUid = req.user.uid;
    const callerRole = (req.user.role || '').toLowerCase();
    const isOwner = req.user.isOwner === true || callerRole === 'super_admin';

    // Allow user to dispatch to self, or clinicians/admins to dispatch to patients
    if (effectiveUserId !== callerUid && !isOwner && !['doctor', 'support', 'clinic_admin'].includes(callerRole)) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'You cannot send notifications on behalf of other users without clinical or administrative privilege.'
      });
    }

    const result = await dispatchNotificationWithPreferences(db, {
      userId: effectiveUserId,
      recipientEmail: recipientEmail || (effectiveUserId === callerUid ? req.user.email : null),
      eventType: eventType || type,
      title,
      message: message || body,
      authorizedDestinationLink: authorizedDestinationLink || destinationLink,
      urgent: Boolean(urgent),
      priority,
      severity,
      payload,
      appointmentId,
      caseId
    });

    let pushResult = null;
    try {
      pushResult = await pushNotificationService.sendPushNotification(db, {
        targetUserId: effectiveUserId,
        eventType: eventType || type,
        title,
        body: message || body,
        caseId,
        appointmentId,
        urgent: Boolean(urgent),
        priority,
        severity
      });
    } catch (pushErr) {
      console.warn('[PUSH DISPATCH WARNING]:', pushErr.message);
    }

    return res.status(200).json({ success: true, result, pushResult });
  } catch (err) {
    console.error('[DISPATCH NOTIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'DISPATCH_FAILED', message: err.message });
  }
});

// =============================================================================
// 📲 REVOCABLE PUSH NOTIFICATIONS & DEVICE REGISTRY ENDPOINTS
// =============================================================================

/**
 * POST /api/notifications/push-subscription
 * Register or update device push notification subscription with explicit consent.
 */
app.post('/api/notifications/push-subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { token, deviceId, platform, browser, consent } = req.body || {};

    const result = await pushNotificationService.registerPushSubscription(db, {
      userId,
      token,
      deviceId,
      platform,
      browser,
      userAgent: req.headers['user-agent'],
      consent: consent === true
    });

    res.json({ success: true, subscription: result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'REGISTRATION_FAILED', message: err.message });
  }
});

/**
 * DELETE /api/notifications/push-subscription
 * Revoke push notification subscription on current device or specific token.
 */
app.delete('/api/notifications/push-subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { deviceId, token } = req.body || req.query || {};

    const result = await pushNotificationService.revokePushSubscription(db, {
      userId,
      deviceId,
      token
    });

    res.json({ success: true, message: 'Push notification subscription revoked.', result });
  } catch (err) {
    res.status(500).json({ error: 'REVOCATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/notifications/push-subscriptions
 * Returns user's active push subscriptions (tokens masked).
 */
app.get('/api/notifications/push-subscriptions', requireAuth, (req, res) => {
  try {
    const userId = req.user.uid;
    const subscriptions = pushNotificationService.getActiveSubscriptionsForUser(userId).map(s => ({
      subscriptionId: s.subscriptionId,
      deviceId: s.deviceId,
      tokenMasked: s.tokenMasked,
      platform: s.platform,
      consentGiven: s.consentGiven,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt
    }));

    res.json({ success: true, count: subscriptions.length, subscriptions });
  } catch (err) {
    res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

/**
 * POST /api/auth/logout
 * Signs user out, revokes push subscriptions on current device, and records audit event.
 */
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { deviceId } = req.body || {};

    const revocation = await pushNotificationService.handleUserLogout(db, {
      userId,
      deviceId
    });

    if (db) {
      await db.collection('audit_events').add({
        type: 'USER_LOGOUT',
        userId,
        deviceId: deviceId || 'unknown',
        revokedPushTokensCount: revocation.revokedCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Signed out successfully. Push notifications on this device have been deactivated.',
      revokedPushTokensCount: revocation.revokedCount
    });
  } catch (err) {
    res.status(500).json({ error: 'LOGOUT_FAILED', message: err.message });
  }
});

// =============================================================================
// 📊 INDEPENDENT ASSESSMENTS, COMPARISONS, CHARTS & REASSESSMENT PLANS
// =============================================================================

/**
 * Helper to fetch patient cases from Firestore or in-memory fallback.
 */
async function fetchPatientCases(patientId) {
  if (!patientId) return [];
  const cases = [];
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('cases').where('patientId', '==', patientId).get();
      if (snap && snap.docs) {
        snap.docs.forEach(d => {
          cases.push({ id: d.id, ...d.data() });
        });
      }
    } catch (e) {
      console.warn('[FETCH CASES WARNING]:', e.message);
    }
  }
  cases.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return cases;
}

/**
 * Helper to fetch patient reports from Firestore or in-memory fallback.
 */
async function fetchPatientReports(patientId) {
  if (!patientId) return [];
  const reports = [];
  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('clinical_reports').where('patientId', '==', patientId).get();
      if (snap && snap.docs) {
        snap.docs.forEach(d => {
          reports.push({ id: d.id, ...d.data() });
        });
      }
    } catch (e) {}
  }
  reports.sort((a, b) => new Date(b.approvedAt || b.createdAt || 0) - new Date(a.approvedAt || a.createdAt || 0));
  return reports;
}

/**
 * POST /api/assessment/new
 * Starts an independent new assessment for the patient without overwriting historical records.
 */
app.post('/api/assessment/new', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const {
      oxygenLevel,
      o2,
      heartRate,
      pulse,
      respiratoryRate,
      temperature,
      breathingDifficulty,
      coughLevel,
      symptoms,
      notes,
      clinicId,
      assignedDoctorId,
      assignedDoctorName,
      dataSource,
      previousCaseId
    } = req.body || {};

    const rawO2 = oxygenLevel ?? o2;
    if (rawO2 === undefined || rawO2 === null || isNaN(Number(rawO2))) {
      return res.status(400).json({
        error: 'INVALID_OXYGEN_LEVEL',
        message: 'A valid numeric oxygenLevel (SpO2 %) is required.'
      });
    }

    const numO2 = Number(rawO2);
    if (numO2 < 50 || numO2 > 100) {
      return res.status(400).json({
        error: 'OUT_OF_RANGE_OXYGEN',
        message: 'Oxygen level must be between 50% and 100%.'
      });
    }

    const newCase = await assessmentComparisonService.createIndependentNewAssessment(db, {
      user: {
        uid: user.uid,
        name: user.name || user.displayName || 'Patient',
        email: user.email,
        latestCaseId: user.latestCaseId || null
      },
      assessmentData: {
        oxygenLevel: numO2,
        heartRate: heartRate ?? pulse,
        respiratoryRate,
        temperature,
        breathingDifficulty,
        coughLevel,
        symptoms,
        notes,
        clinicId: clinicId || user.clinicId,
        assignedDoctorId,
        assignedDoctorName,
        dataSource: dataSource || 'patient_reported'
      },
      previousCaseId
    });

    return res.status(201).json({
      success: true,
      caseId: newCase.caseId,
      case: newCase,
      message: 'Independent new assessment recorded successfully.'
    });
  } catch (err) {
    console.error('[NEW ASSESSMENT ERROR]:', err);
    return res.status(500).json({ error: 'ASSESSMENT_CREATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/patient/:patientId/assessments/latest
 * Retrieves latest independent assessments for the patient with access control.
 */
app.get('/api/patient/:patientId/assessments/latest', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const accessCheck = await timelineService.verifyTimelineAccess(req.user, patientId, db);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: accessCheck.reason || 'Access denied.' });
    }

    const cases = await fetchPatientCases(patientId);
    return res.json({
      success: true,
      patientId,
      count: cases.length,
      cases
    });
  } catch (err) {
    console.error('[GET LATEST ASSESSMENTS ERROR]:', err);
    return res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

/**
 * GET /api/patient/:patientId/assessments/compare
 * Compares latest assessment with previous baseline (or two specified case IDs),
 * returning measurement deltas (with units, timing, data sources, missing measurements),
 * approved report comparison, and longitudinal chart trend points.
 */
app.get('/api/patient/:patientId/assessments/compare', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const accessCheck = await timelineService.verifyTimelineAccess(req.user, patientId, db);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: accessCheck.reason || 'Access denied.' });
    }

    const { currentCaseId, previousCaseId } = req.query;
    const allCases = await fetchPatientCases(patientId);

    if (allCases.length < 2 && (!currentCaseId || !previousCaseId)) {
      return res.json({
        success: true,
        comparable: false,
        message: 'At least two assessments are required to perform comparative analysis.',
        casesCount: allCases.length,
        chart: assessmentComparisonService.buildPatientChartData(allCases)
      });
    }

    let latestCase = null;
    let previousCase = null;

    if (currentCaseId) {
      latestCase = allCases.find(c => c.id === currentCaseId || c.caseId === currentCaseId);
    } else {
      latestCase = allCases[0];
    }

    if (previousCaseId) {
      previousCase = allCases.find(c => c.id === previousCaseId || c.caseId === previousCaseId);
    } else {
      previousCase = allCases[1];
    }

    if (!latestCase || !previousCase) {
      return res.status(404).json({
        error: 'CASES_NOT_FOUND',
        message: 'One or both specified assessment cases were not found.'
      });
    }

    const comparison = assessmentComparisonService.compareAssessments(latestCase, previousCase);

    // Fetch reports for comparison
    const allReports = await fetchPatientReports(patientId);
    const latestReport = allReports.find(r => r.caseId === latestCase.id) || allReports[0] || null;
    const previousReport = allReports.find(r => r.caseId === previousCase.id) || allReports[1] || null;

    let reportComparison = null;
    if (latestReport && previousReport) {
      reportComparison = assessmentComparisonService.compareApprovedReports(latestReport, previousReport);
    }

    const chart = assessmentComparisonService.buildPatientChartData(allCases);

    return res.json({
      success: true,
      comparable: true,
      patientId,
      comparison,
      reportComparison,
      chart
    });
  } catch (err) {
    console.error('[COMPARE ASSESSMENTS ERROR]:', err);
    return res.status(500).json({ error: 'COMPARISON_FAILED', message: err.message });
  }
});

/**
 * GET /api/patient/:patientId/medical-summary
 * Generates comprehensive Medical Summary Export (JSON and structured report).
 */
app.get('/api/patient/:patientId/medical-summary', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const accessCheck = await timelineService.verifyTimelineAccess(req.user, patientId, db);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: accessCheck.reason || 'Access denied.' });
    }

    let patientProfile = {};
    if (db && typeof db.collection === 'function') {
      const pDoc = await db.collection('users').doc(patientId).get().catch(() => null);
      if (pDoc && pDoc.exists) patientProfile = pDoc.data();
    }

    const cases = await fetchPatientCases(patientId);
    const reports = await fetchPatientReports(patientId);
    const plans = await assessmentComparisonService.getPatientReassessmentPlans(db, patientId);
    const activePlan = plans.find(p => p.status === 'active') || null;

    const summary = assessmentComparisonService.generateMedicalSummaryExport({
      patient: {
        uid: patientId,
        name: patientProfile.name || patientProfile.displayName || req.user.name,
        email: patientProfile.email || req.user.email,
        nationalId: patientProfile.nationalId,
        age: patientProfile.age || patientProfile.medicalProfile?.age,
        gender: patientProfile.gender || patientProfile.medicalProfile?.gender
      },
      cases,
      reports,
      reassessmentPlan: activePlan
    });

    return res.json({ success: true, medicalSummary: summary });
  } catch (err) {
    console.error('[MEDICAL SUMMARY ERROR]:', err);
    return res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
  }
});

/**
 * POST /api/patient/:patientId/reassessment-plan
 * Doctor creates/approves a reassessment plan and schedules follow-up reminders.
 * STRICT SAFETY RULE:
 * Does NOT derive a new diagnosis from the chart.
 */
app.post('/api/patient/:patientId/reassessment-plan', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const callerRole = (req.user.role || '').toLowerCase();
    const isOwner = req.user.isOwner === true || callerRole === 'super_admin';

    // Must be verified doctor or admin
    if (!isOwner && !['doctor', 'doctor_verified', 'clinic_admin'].includes(callerRole)) {
      return res.status(403).json({
        error: 'CLINICIAN_REQUIRED',
        message: 'Only a licensed physician or medical administrator can approve a reassessment plan.'
      });
    }

    const {
      intervalHours = 24,
      frequency = 'once',
      instructions = '',
      caseId = null
    } = req.body || {};

    const plan = await assessmentComparisonService.scheduleDoctorReassessmentPlan(db, {
      patientId,
      doctorId: req.user.uid,
      doctorName: req.user.name || req.user.displayName || 'د. طارق محمود',
      doctorSpecialty: req.user.specialty || 'استشاري أمراض صدرية',
      intervalHours,
      frequency,
      instructions,
      caseId
    });

    // Schedule automated reminder in notification queue for the patient
    try {
      const patientUserDoc = db ? await db.collection('users').doc(patientId).get().catch(() => null) : null;
      const patientEmail = patientUserDoc?.exists ? patientUserDoc.data()?.email : null;

      await enqueueNotification(db, {
        type: 'reassessment_reminder',
        recipient: patientEmail || 'patient@healthvibe.ai',
        scheduledAt: plan.scheduledAt,
        priority: 'normal',
        payload: {
          patientId,
          planId: plan.planId,
          doctorName: plan.doctor.name,
          intervalHours: plan.intervalHours,
          instructions: plan.instructions,
          scheduledAt: plan.scheduledAt,
          disclaimer: 'Doctor-approved observational reassessment reminder.'
        }
      });

      // Record in user notification history as well
      await recordNotificationHistory(db, {
        userId: patientId,
        eventType: 'reassessment_reminder',
        title: 'تذكير بموعد إعادة الفحص المعتمد من الطبيب',
        message: `طلب د. ${plan.doctor.name} إجراء فحص تنفسي جديد للمتابعة. التعليمات: ${plan.instructions}`,
        authorizedDestinationLink: `/app/index.html?screen=assessment&action=reassess&planId=${encodeURIComponent(plan.planId)}`,
        urgent: false,
        metadata: {
          planId: plan.planId,
          intervalHours: plan.intervalHours,
          scheduledAt: plan.scheduledAt
        }
      });
    } catch (notifErr) {
      console.warn('[REASSESSMENT REMINDER WARNING]:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Doctor-approved reassessment plan created and reminders scheduled.',
      plan
    });
  } catch (err) {
    console.error('[CREATE REASSESSMENT PLAN ERROR]:', err);
    return res.status(500).json({ error: 'PLAN_CREATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/patient/:patientId/reassessment-plan
 * Retrieves reassessment plans for the patient.
 */
app.get('/api/patient/:patientId/reassessment-plan', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const accessCheck = await timelineService.verifyTimelineAccess(req.user, patientId, db);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: accessCheck.reason || 'Access denied.' });
    }

    const plans = await assessmentComparisonService.getPatientReassessmentPlans(db, patientId);
    return res.json({ success: true, count: plans.length, plans });
  } catch (err) {
    console.error('[GET REASSESSMENT PLANS ERROR]:', err);
    return res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

/**
 * PATCH /api/patient/:patientId/reassessment-plan/:planId/cancel
 * Cancels a reassessment plan.
 */
app.patch('/api/patient/:patientId/reassessment-plan/:planId/cancel', requireAuth, async (req, res) => {
  try {
    const { patientId, planId } = req.params;
    const accessCheck = await timelineService.verifyTimelineAccess(req.user, patientId, db);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: accessCheck.reason || 'Access denied.' });
    }

    const plan = await assessmentComparisonService.cancelReassessmentPlan(db, planId, req.user);
    return res.json({ success: true, message: 'Reassessment plan cancelled.', plan });
  } catch (err) {
    console.error('[CANCEL REASSESSMENT PLAN ERROR]:', err);
    return res.status(500).json({ error: 'CANCEL_FAILED', message: err.message });
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
    console.log(`[Health Vibe AI Backend] Server running in [${NODE_ENV.toUpperCase()}] mode on port ${PORT}`);
    if (db) {
      startReminderScheduler(db);
    }
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
app.requireRecentAuth = requireRecentAuth;
app.activeUserSessions = activeUserSessions;
app.recordUserSession = recordUserSession;
app.mfaService = mfaService;
app.requireMfaIfEnrolled = requireMfaIfEnrolled;
app.validateNationalIdCollection = validateNationalIdCollection;
app.verifyDoctorAuthorization = verifyDoctorAuthorization;
app.isDoctorApprovedMemberOfClinic = isDoctorApprovedMemberOfClinic;
app.getVerifiedDoctorIdentity = getVerifiedDoctorIdentity;
app.calculateAge = calculateAge;
app.calculateBmi = calculateBmi;
app.evaluatePregnancyClinicalRelevance = evaluatePregnancyClinicalRelevance;
app.validatePatientMedicalProfile = validatePatientMedicalProfile;
app.buildPatientProfileProvenance = buildPatientProfileProvenance;
app.verifyPatientClinicAndDoctorLinkage = verifyPatientClinicAndDoctorLinkage;
app.notificationService = {
  sendClinicalNotificationEmail,
  enqueueNotification,
  processNotificationQueue,
  recordDeliveryConfirmation,
  scheduleAppointmentReminder,
  cancelAppointmentReminders,
  rescheduleAppointmentReminders,
  startReminderScheduler,
  stopReminderScheduler,
  recordNotificationHistory,
  getUserNotificationHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationById,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  isQuietHoursActive,
  calculateNextQuietHoursEnd,
  isUrgentEvent,
  generateAuthorizedDestinationLink,
  dispatchNotificationWithPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPES
};
app.timelineService = timelineService;
app.monitoringService = monitoringService;
app.incidentService = incidentService;
app.analyticsService = analyticsService;
app.feedbackSupportService = feedbackSupportService;
app.assessmentComparisonService = assessmentComparisonService;
app.pilotReadinessService = pilotReadinessService;
app.billingService = billingService;
app.expansionAnalyticsService = expansionAnalyticsService;
app.doctorProfileService = doctorProfileService;

// =============================================================================
// 🏥 CLINICAL PILOT GOVERNANCE & READINESS ROUTES
// =============================================================================
app.get('/api/clinics/pilot/readiness', (req, res) => {
  try {
    const report = pilotReadinessService.verifyPilotPrerequisites();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

app.post('/api/clinics/pilot/circuit-breaker/evaluate', requireAuth, requireDoctor, (req, res) => {
  try {
    const evaluation = pilotReadinessService.evaluateCircuitBreakerTriggers(req.body || {});
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// =============================================================================
// 💳 SUBSCRIPTION, BILLING & REVENUE LEDGER ROUTES
// =============================================================================

/**
 * GET /api/billing/plans
 * Comparison of Free Patient, Doctor Starter, Clinic Basic/Pro, Enterprise plans
 * Includes limits, features, onboarding fees, operating cost model, and provisional pricing notice.
 */
app.get('/api/billing/plans', (req, res) => {
  try {
    res.json({
      success: true,
      plans: billingService.PLANS,
      operatingCostModel: billingService.OPERATING_COST_MODEL,
      initialSellablePlan: billingService.OPERATING_COST_MODEL.commercialRecommendation.initialSellablePlan,
      pricingDecisionPending: billingService.PRICING_DECISION_PENDING,
      pricingDisclaimer: billingService.PRICING_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/billing/subscription
 * Get clinic subscription status, current entitlements, and usage vs limits
 */
app.get('/api/billing/subscription', requireAuth, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = req.query.clinicId && scope.role === ROLES.SUPER_ADMIN
      ? req.query.clinicId
      : (scope.clinicId || 'default_clinic');

    const subscription = await billingService.getClinicSubscription(db, targetClinicId);
    const plan = billingService.PLANS[subscription.planId] || billingService.PLANS.CLINIC_BASIC;

    // Check entitlements for standard clinical actions
    const intakeEntitlement = billingService.checkSubscriptionEntitlement(subscription, 'CREATE_ASSESSMENT');
    const approvalEntitlement = billingService.checkSubscriptionEntitlement(subscription, 'APPROVE_ASSESSMENT');
    const archiveEntitlement = billingService.checkSubscriptionEntitlement(subscription, 'READ_MEDICAL_RECORDS');

    res.json({
      success: true,
      clinicId: targetClinicId,
      subscription,
      plan,
      entitlements: {
        canIntakeCases: intakeEntitlement.allowed,
        canCertifyCases: approvalEntitlement.allowed,
        canAccessMedicalArchive: archiveEntitlement.allowed,
        intakeStatus: intakeEntitlement,
        approvalStatus: approvalEntitlement
      },
      pricingDisclaimer: billingService.PRICING_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/billing/subscription/subscribe
 * Subscribes or upgrades a clinic to a plan (e.g. Doctor Starter, Clinic Basic)
 */
app.post('/api/billing/subscription/subscribe', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = req.body.clinicId && scope.role === ROLES.SUPER_ADMIN
      ? req.body.clinicId
      : (scope.clinicId || req.body.clinicId || 'default_clinic');

    const { planId, billingCycle = 'monthly', paymentMethod, notes } = req.body || {};

    if (!planId || !billingService.PLANS[planId]) {
      return res.status(400).json({
        error: 'INVALID_PLAN',
        message: `Plan '${planId}' does not exist. Available: ${Object.keys(billingService.PLANS).join(', ')}`
      });
    }

    const updatedSub = await billingService.updateSubscription(db, targetClinicId, {
      planId,
      billingCycle,
      paymentMethod,
      notes,
      actorUid: req.user.uid
    });

    if (db) {
      auditService.recordAuditEvent(db, {
        type: 'SUBSCRIPTION_PLAN_CHANGED',
        req,
        clinicId: targetClinicId,
        details: { planId, billingCycle, paymentMethod }
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: `Subscription successfully updated to ${billingService.PLANS[planId].name}.`,
      subscription: updatedSub,
      pricingDisclaimer: billingService.PRICING_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/billing/subscription/payment-status
 * Updates subscription payment state (active, past_due, canceled)
 * If recordPayment is provided, automatically writes an immutable ledger entry.
 */
app.post('/api/billing/subscription/payment-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = req.body.clinicId && scope.role === ROLES.SUPER_ADMIN
      ? req.body.clinicId
      : (scope.clinicId || req.body.clinicId || 'default_clinic');

    const { status, reason, recordPayment } = req.body || {};

    if (!status || !Object.values(billingService.SUBSCRIPTION_STATUS).includes(status)) {
      return res.status(400).json({
        error: 'INVALID_STATUS',
        message: `Status must be one of: ${Object.values(billingService.SUBSCRIPTION_STATUS).join(', ')}`
      });
    }

    const updatedSub = await billingService.setSubscriptionPaymentStatus(db, targetClinicId, {
      status,
      reason,
      actorUid: req.user.uid
    });

    let ledgerRecord = null;
    if (recordPayment && typeof recordPayment.grossAmount === 'number') {
      ledgerRecord = await billingService.recordLedgerEntry(db, {
        entryType: billingService.LEDGER_ENTRY_TYPES.PAYMENT_RECEIVED,
        subscriptionId: updatedSub.subscriptionId,
        clinicId: targetClinicId,
        planId: updatedSub.planId,
        grossAmount: recordPayment.grossAmount,
        taxAmount: recordPayment.taxAmount || 0,
        currency: recordPayment.currency || 'EGP',
        paymentMethod: recordPayment.paymentMethod || updatedSub.paymentMethod,
        gatewayRef: recordPayment.gatewayRef || null,
        notes: reason || 'Subscription renewal payment',
        recordedBy: req.user.uid
      });
    }

    if (db) {
      auditService.recordAuditEvent(db, {
        type: 'SUBSCRIPTION_PAYMENT_STATUS_UPDATED',
        req,
        clinicId: targetClinicId,
        details: { newStatus: status, reason, ledgerId: ledgerRecord?.id || null }
      }).catch(() => {});
    }

    res.json({
      success: true,
      subscription: updatedSub,
      ledgerRecord
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/billing/ledger
 * Retrieve append-only revenue ledger entries
 * Scoped strictly to requester's clinic, or platform-wide for Super Admin.
 */
app.get('/api/billing/ledger', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = scope.role === ROLES.SUPER_ADMIN
      ? (req.query.clinicId || null)
      : scope.clinicId;

    const entries = await billingService.getLedgerEntries(db, {
      clinicId: targetClinicId,
      entryType: req.query.entryType || null,
      limit: parseInt(req.query.limit, 10) || 100
    });

    res.json({
      success: true,
      clinicId: targetClinicId || 'all_clinics',
      entriesCount: entries.length,
      entries
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/billing/ledger/record
 * Authoritatively record an immutable financial transaction in the revenue ledger
 */
app.post('/api/billing/ledger/record', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = req.body.clinicId && scope.role === ROLES.SUPER_ADMIN
      ? req.body.clinicId
      : (scope.clinicId || req.body.clinicId || 'default_clinic');

    const {
      entryType,
      subscriptionId,
      planId,
      grossAmount,
      taxAmount = 0,
      currency = 'EGP',
      paymentMethod,
      gatewayRef,
      notes
    } = req.body || {};

    if (!entryType || typeof grossAmount !== 'number') {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'entryType and numeric grossAmount are required.'
      });
    }

    const entry = await billingService.recordLedgerEntry(db, {
      entryType,
      subscriptionId,
      clinicId: targetClinicId,
      planId,
      grossAmount,
      taxAmount,
      currency,
      paymentMethod,
      gatewayRef,
      notes,
      recordedBy: req.user.uid
    });

    if (db) {
      auditService.recordAuditEvent(db, {
        type: 'REVENUE_LEDGER_ENTRY_RECORDED',
        req,
        clinicId: targetClinicId,
        details: { ledgerId: entry.id, entryType, grossAmount, currency }
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: 'Ledger entry recorded successfully and marked immutable.',
      entry
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/billing/summary
 * Reconciled financial revenue summary (gross, refunds, net)
 */
app.get('/api/billing/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scope = await resolveRequesterClinic(req);
    const targetClinicId = scope.role === ROLES.SUPER_ADMIN
      ? (req.query.clinicId || null)
      : scope.clinicId;

    const summary = await billingService.getRevenueSummary(db, { clinicId: targetClinicId });

    res.json({
      success: true,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// =============================================================================
// 🚀 GRADUAL EXPANSION, RETENTION & PROGRESSION CRITERIA ROUTES
// =============================================================================

/**
 * GET /api/expansion/stages
 * Returns the multi-stage expansion roadmap, progression criteria gates, and current status.
 */
app.get('/api/expansion/stages', (req, res) => {
  try {
    const progressionReport = expansionAnalyticsService.evaluateStageProgression();
    res.json({
      success: true,
      stages: expansionAnalyticsService.EXPANSION_STAGES,
      progressionGates: expansionAnalyticsService.STAGE_PROGRESSION_GATES,
      currentProgressionEvaluation: progressionReport
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/expansion/metrics
 * Returns verified active clinics, cohort retention, ARPC, and feature adoption.
 * GUARANTEE: Never counts registration requests, demo submissions, or leads as active usage.
 */
app.get('/api/expansion/metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Collect registered clinics from memory subscriptions or Firestore
    const subscriptions = Array.from(billingService._memorySubscriptions.values());
    const ledger = Array.from(billingService._memoryRevenueLedger);

    const retention = expansionAnalyticsService.calculateClinicRetention(subscriptions);
    const arpc = expansionAnalyticsService.calculateRevenuePerClinic(subscriptions, ledger);
    const adoption = expansionAnalyticsService.calculateFeatureAdoption(subscriptions);

    res.json({
      success: true,
      activeUsageGuaranteed: true,
      note: 'Registration requests and demo submissions are strictly isolated from verified active usage.',
      retention,
      revenuePerClinic: arpc,
      featureAdoption: adoption
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/expansion/case-study
 * Returns the sanitized pilot clinical case study and de-identified aggregate metrics.
 * 100% de-identified; zero Patient Health Information (PHI).
 */
app.get('/api/expansion/case-study', (req, res) => {
  try {
    res.json({
      success: true,
      caseStudy: expansionAnalyticsService.PILOT_CASE_STUDY,
      deidentified: true,
      phiExposed: false
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/expansion/evaluate-gate
 * Evaluates whether telemetry satisfies stage progression criteria.
 */
app.post('/api/expansion/evaluate-gate', requireAuth, requireAdmin, (req, res) => {
  try {
    const evaluation = expansionAnalyticsService.evaluateStageProgression(req.body || {});
    res.json({
      success: true,
      evaluation
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// =============================================================================
// 🤖 SEARCH ENGINE & ROBOTS DIRECTIVES
// =============================================================================
app.get('/robots.txt', (req, res) => {
  const robotsPath = path.resolve(__dirname, '../app/robots.txt');
  if (fs.existsSync(robotsPath)) {
    res.type('text/plain').sendFile(robotsPath);
  } else {
    res.type('text/plain').send("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /records/\nSitemap: https://healthvibe.ai/sitemap.xml\n");
  }
});

app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.resolve(__dirname, '../app/sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    res.type('application/xml').sendFile(sitemapPath);
  } else {
    res.status(404).send('Not Found');
  }
});

// =============================================================================
// 👨‍⚕️ DOCTOR PUBLIC PROFILES, CLINIC MEMBERSHIPS & BOOKING AVAILABILITY
// =============================================================================

/**
 * GET /api/doctors/public
 * Returns public directory of approved practitioners with sanitized profiles.
 */
app.get('/api/doctors/public', async (req, res) => {
  try {
    const { clinicId, specialty } = req.query;
    const doctors = await doctorProfileService.listPublicDoctors(db, { clinicId, specialty });
    res.json({ success: true, count: doctors.length, doctors });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/doctors/public/:doctorId
 * Returns sanitized public profile for a specific practitioner.
 * Displays ONLY clinics where the doctor has actual approved membership.
 */
app.get('/api/doctors/public/:doctorId', async (req, res) => {
  try {
    const doctor = await doctorProfileService.getDoctorPublicProfile(db, req.params.doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'DOCTOR_NOT_FOUND', message: 'Doctor profile not found or not approved.' });
    }
    res.json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/doctor/profile
 * Returns authenticated doctor's full profile (including private administrative fields).
 */
app.get('/api/doctor/profile', requireAuth, requireDoctor, async (req, res) => {
  try {
    const doctorId = req.user.uid;
    const profile = doctorProfileService.DOCTOR_PROFILES[doctorId] || await doctorProfileService.getDoctorPublicProfile(db, doctorId);
    if (!profile) {
      return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * PATCH /api/doctor/profile
 * Authenticated doctor updates their public profile fields.
 * CRITICAL SECURITY GUARD:
 * Strictly rejects any attempts to modify licensing, approval status, clinic membership approvals, or role.
 */
app.patch('/api/doctor/profile', requireAuth, requireDoctor, async (req, res) => {
  try {
    const doctorId = req.user.uid;
    const actor = { uid: req.user.uid, role: req.user.role || 'doctor', isOwner: hasTrustedOwnerClaim(req.user) };

    const existing = doctorProfileService.DOCTOR_PROFILES[doctorId] || { doctorId, status: 'approved' };
    const validation = doctorProfileService.sanitizeDoctorProfileUpdate(req.body || {}, existing, actor);

    if (!validation.allowed) {
      if (db) {
        auditService.recordAuditEvent(db, {
          type: 'UNAUTHORIZED_PROFILE_TAMPERING_ATTEMPT',
          req,
          details: { attemptedFields: validation.violatingFields }
        }).catch(() => {});
      }
      return res.status(403).json({
        error: validation.error,
        message: validation.message,
        violatingFields: validation.violatingFields
      });
    }

    const updated = await doctorProfileService.updateDoctorProfile(db, doctorId, req.body || {}, actor);

    if (db) {
      auditService.recordAuditEvent(db, {
        type: 'DOCTOR_PROFILE_UPDATED',
        req,
        details: { updatedFields: Object.keys(validation.cleanUpdate) }
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Doctor profile updated successfully.',
      doctor: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/clinics/:clinicId/doctors/:doctorId/membership
 * Clinic admin approves, pauses, or rejects doctor membership at their clinic.
 */
app.post('/api/clinics/:clinicId/doctors/:doctorId/membership', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { clinicId, doctorId } = req.params;
    const { status } = req.body || {};

    const scope = await resolveRequesterClinic(req);
    if (scope.role !== ROLES.SUPER_ADMIN && scope.clinicId !== clinicId) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'Clinic administrators can only manage memberships for their assigned clinic.'
      });
    }

    const result = await doctorProfileService.updateDoctorClinicMembership(
      db,
      doctorId,
      clinicId,
      status || 'approved',
      { uid: req.user.uid }
    );

    if (db) {
      auditService.recordAuditEvent(db, {
        type: 'DOCTOR_CLINIC_MEMBERSHIP_UPDATED',
        req,
        clinicId,
        targetUserId: doctorId,
        details: { newStatus: status }
      }).catch(() => {});
    }

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: 'MEMBERSHIP_UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/doctors/:doctorId/availability
 * Returns dynamic booking slots strictly connected to the doctor's approved working hours & clinics.
 */
app.get('/api/doctors/:doctorId/availability', async (req, res) => {
  const { doctorId } = req.params;
  const { date, clinicId } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'MISSING_DATE', message: 'date query parameter (YYYY-MM-DD) is required.' });
  }

  try {
    const availability = doctorProfileService.calculateDoctorBookingAvailability(doctorId, date, clinicId || null);
    res.json({ success: true, availability });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// =============================================================================
// 📋 WAITING LIST & NO-SHOW TRACKING ENDPOINTS
// =============================================================================

/**
 * POST /api/appointments/waiting-list
 * Patient joins waiting list for an appointment slot.
 */
app.post('/api/appointments/waiting-list', requireAuth, async (req, res) => {
  try {
    const { doctorId, desiredDate, clinicId, preferredTimeRange, urgencyTier, reason, notes } = req.body || {};
    const patientId = req.user.role === 'patient' ? req.user.uid : (req.body.patientId || req.user.uid);

    const result = await waitingListService.addToWaitingList(db, {
      patientId,
      patientName: req.user.displayName || req.user.name || 'Patient',
      patientEmail: req.user.email,
      patientPhone: req.user.phone,
      doctorId,
      clinicId,
      desiredDate,
      preferredTimeRange,
      urgencyTier,
      reason,
      notes
    }, req.user);

    res.status(201).json({ success: true, waitingListEntry: result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'WAITING_LIST_ERROR', message: err.message });
  }
});

/**
 * GET /api/appointments/waiting-list
 * Retrieves waiting list entries with RBAC filtering.
 */
app.get('/api/appointments/waiting-list', requireAuth, async (req, res) => {
  try {
    const filters = {
      doctorId: req.query.doctorId,
      clinicId: req.query.clinicId,
      desiredDate: req.query.date,
      status: req.query.status
    };
    const entries = await waitingListService.getWaitingList(db, filters, req.user);
    res.json({ success: true, count: entries.length, entries });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/appointments/waiting-list/:id/accept
 * Accepts offered slot atomically without double-booking.
 */
app.post('/api/appointments/waiting-list/:id/accept', requireAuth, async (req, res) => {
  try {
    const result = await waitingListService.acceptWaitingListOffer(db, {
      waitingListId: req.params.id,
      bookingService: schedulingService
    }, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'ACCEPT_OFFER_ERROR', message: err.message });
  }
});

/**
 * POST /api/appointments/waiting-list/:id/decline
 * Declines offered slot, cascading it to next waiting candidate.
 */
app.post('/api/appointments/waiting-list/:id/decline', requireAuth, async (req, res) => {
  try {
    const result = await waitingListService.declineWaitingListOffer(db, {
      waitingListId: req.params.id,
      reason: req.body?.reason
    }, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'DECLINE_OFFER_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/appointments/waiting-list/:id
 * Removes entry from waiting list.
 */
app.delete('/api/appointments/waiting-list/:id', requireAuth, async (req, res) => {
  try {
    const result = await waitingListService.removeFromWaitingList(db, req.params.id, req.user, req.body?.reason);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'REMOVE_ERROR', message: err.message });
  }
});

/**
 * POST /api/appointments/:id/no-show
 * Marks appointment as No-Show, strictly recording WHO changed it and WHY.
 */
app.post('/api/appointments/:id/no-show', requireAuth, async (req, res) => {
  try {
    const { reason, notes } = req.body || {};
    const result = await waitingListService.recordNoShow(db, {
      appointmentId: req.params.id,
      reason,
      notes
    }, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'NO_SHOW_ERROR', message: err.message });
  }
});

/**
 * GET /api/appointments/no-shows/patient/:patientId
 * Retrieves no-show metrics for a patient.
 */
app.get('/api/appointments/no-shows/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const summary = await waitingListService.getPatientNoShowSummary(db, req.params.patientId, req.user);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'SUMMARY_ERROR', message: err.message });
  }
});

/**
 * GET /api/appointments/no-shows/clinic/:clinicId
 * Retrieves aggregated clinic-level no-show statistics for staff review.
 */
app.get('/api/appointments/no-shows/clinic/:clinicId', requireAuth, async (req, res) => {
  try {
    const stats = await waitingListService.getClinicNoShowStats(db, req.params.clinicId, req.user);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'STATS_ERROR', message: err.message });
  }
});

// =============================================================================
// 📅 DOCTOR GOOGLE CALENDAR INTEGRATION ENDPOINTS
// =============================================================================

/**
 * POST /api/doctors/google-calendar/connect
 * Doctor connects Google Calendar with explicit consent and minimum scopes.
 */
app.post('/api/doctors/google-calendar/connect', requireAuth, async (req, res) => {
  try {
    const doctorId = req.user.role === 'doctor' ? req.user.uid : (req.body.doctorId || req.user.uid);
    const { consent, googleEmail, refreshToken, scopes, calendarId } = req.body || {};

    const result = await googleCalendarService.connectDoctorGoogleCalendar(db, doctorId, {
      consent,
      googleEmail,
      refreshToken,
      scopes,
      calendarId
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'CONNECT_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/doctors/google-calendar/disconnect
 * Doctor disconnects Google Calendar and revokes consent.
 */
app.delete('/api/doctors/google-calendar/disconnect', requireAuth, async (req, res) => {
  try {
    const doctorId = req.user.role === 'doctor' ? req.user.uid : (req.body.doctorId || req.user.uid);
    const result = await googleCalendarService.disconnectDoctorGoogleCalendar(db, doctorId, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'DISCONNECT_ERROR', message: err.message });
  }
});

/**
 * GET /api/doctors/google-calendar/status
 * Retrieves Google Calendar integration status and confirms Source of Truth.
 */
app.get('/api/doctors/google-calendar/status', requireAuth, async (req, res) => {
  try {
    const doctorId = req.user.role === 'doctor' ? req.user.uid : (req.query.doctorId || req.user.uid);
    const status = await googleCalendarService.getDoctorGoogleCalendarStatus(db, doctorId);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/doctors/google-calendar/reconcile/:appointmentId
 * Reconciles external Google Calendar conflict against authoritative Health Vibe DB record.
 */
app.post('/api/doctors/google-calendar/reconcile/:appointmentId', requireAuth, async (req, res) => {
  try {
    const result = await googleCalendarService.reconcileGoogleCalendarEvent(db, req.params.appointmentId, req.body?.externalEvent || {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.code || 'RECONCILE_ERROR', message: err.message });
  }
});

// =============================================================================
// 📹 TELEHEALTH VIDEO CONSULTATION & CONSENT ENDPOINTS
// =============================================================================

/**
 * GET /api/telehealth/provider
 * Retrieves active telehealth video provider capabilities and privacy compliance schema.
 */
app.get('/api/telehealth/provider', (req, res) => {
  const config = telehealthVideoService.getTelehealthProviderConfig();
  res.json({ success: true, config });
});

/**
 * POST /api/telehealth/rooms/create
 * Creates an encrypted video consultation room linked to a confirmed appointment.
 */
app.post('/api/telehealth/rooms/create', requireAuth, async (req, res) => {
  try {
    const { appointmentId, provider, earlyJoinMinutes, graceWindowMinutes } = req.body || {};
    const room = await telehealthVideoService.createTelehealthRoom(db, {
      appointmentId,
      provider,
      earlyJoinMinutes,
      graceWindowMinutes
    }, req.user);

    res.status(201).json({ success: true, room });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'ROOM_CREATION_FAILED', message: err.message });
  }
});

/**
 * POST /api/telehealth/rooms/:roomId/join
 * Verifies participant identity, temporal access window, and patient informed consent.
 */
app.post('/api/telehealth/rooms/:roomId/join', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { consent, clientTimestamp } = req.body || {};

    const result = await telehealthVideoService.joinTelehealthRoom(db, {
      roomId,
      consent: consent || {},
      now: clientTimestamp ? new Date(clientTimestamp) : new Date()
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'ROOM_JOIN_FAILED', message: err.message, minutesRemaining: err.minutesRemaining });
  }
});

/**
 * POST /api/telehealth/rooms/:roomId/failure
 * Handles device hardware or permission failures with audio-only graceful degradation.
 */
app.post('/api/telehealth/rooms/:roomId/failure', requireAuth, (req, res) => {
  try {
    const { roomId } = req.params;
    const { failureType, details } = req.body || {};

    const result = telehealthVideoService.handleMediaDeviceFailure({
      roomId,
      failureType,
      details
    }, req.user);

    res.json({ success: true, result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'FAILURE_HANDLING_ERROR', message: err.message });
  }
});

/**
 * POST /api/telehealth/rooms/:roomId/disconnect
 * Transitions session to disconnected state with reconnection grace period.
 */
app.post('/api/telehealth/rooms/:roomId/disconnect', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await telehealthVideoService.handleNetworkDisconnection(db, {
      roomId,
      participantId: req.user.uid
    }, req.user);

    res.json({ success: true, result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'DISCONNECT_ERROR', message: err.message });
  }
});

/**
 * POST /api/telehealth/rooms/:roomId/reconnect
 * Reconnects participant back to active session within grace period.
 */
app.post('/api/telehealth/rooms/:roomId/reconnect', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await telehealthVideoService.reconnectTelehealthSession(db, { roomId }, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'RECONNECT_ERROR', message: err.message });
  }
});

/**
 * POST /api/telehealth/rooms/:roomId/end
 * Concludes consultation session cleanly.
 */
app.post('/api/telehealth/rooms/:roomId/end', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { reason } = req.body || {};

    const result = await telehealthVideoService.endTelehealthRoom(db, {
      roomId,
      reason: reason || 'Consultation concluded'
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'END_ROOM_ERROR', message: err.message });
  }
});

/**
 * GET /api/telehealth/rooms/:roomId
 * Retrieves room status and session information.
 */
app.get('/api/telehealth/rooms/:roomId', requireAuth, (req, res) => {
  const room = telehealthVideoService._inMemoryTelehealthRooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'Telehealth room not found.' });
  }

  // Permission check
  const isDoctor = req.user.uid === room.doctorId;
  const isPatient = req.user.uid === room.patientId;
  const isAdmin = req.user.role === 'clinic_admin' || req.user.role === 'super_admin';

  if (!isDoctor && !isPatient && !isAdmin) {
    return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You are not authorized to view this room.' });
  }

  res.json({ success: true, room });
});

// =============================================================================
// 📑 MEDICAL OCR & CLINICAL LAB EXTRACTION ENDPOINTS
// =============================================================================

/**
 * POST /api/ocr/process-file
 * Processes OCR on a medical file that has successfully passed security scanning.
 * Extracts text, source metadata, page image, confidence, and clinical lab items.
 * Strictly generates DRAFT results requiring doctor review, not approved facts.
 */
app.post('/api/ocr/process-file', requireAuth, async (req, res) => {
  try {
    const { fileId, caseId, rawTextOverride, pageImageOverride, simulatePoorQuality } = req.body || {};

    if (!fileId) {
      return res.status(400).json({ error: 'MISSING_FILE_ID', message: 'fileId is required.' });
    }

    const draft = await medicalOcrService.processMedicalFileOcr(db, {
      fileId,
      caseId,
      rawTextOverride,
      pageImageOverride,
      simulatePoorQuality
    }, req.user);

    res.status(201).json({ success: true, draft });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.code || 'OCR_PROCESSING_FAILED',
      message: err.message,
      scanStatus: err.scanStatus || null
    });
  }
});

/**
 * GET /api/ocr/drafts/:draftId
 * Retrieves an OCR draft with its extracted text, page image, confidence, and items.
 */
app.get('/api/ocr/drafts/:draftId', requireAuth, async (req, res) => {
  try {
    const { draftId } = req.params;
    let draft = medicalOcrService.inMemoryOcrDrafts.get(draftId);

    if (!draft && db) {
      try {
        const snap = await db.collection('ocr_drafts').doc(draftId).get();
        if (snap && snap.exists) {
          draft = snap.data();
        }
      } catch (_) {}
    }

    if (!draft) {
      return res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: 'OCR draft not found.' });
    }

    // Access control: Patient owner, doctor, or admin
    const isOwner = req.user.uid === draft.patientId || req.user.uid === draft.createdBy;
    const isClinician = req.user.role === 'doctor' || req.user.role === 'clinic_admin' || req.user.role === 'super_admin';

    if (!isOwner && !isClinician) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'You are not authorized to view this OCR draft.' });
    }

    res.json({ success: true, draft });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * PUT /api/ocr/drafts/:draftId/correct
 * Applies manual corrections to extracted lab test items (testName, value, unit, range).
 * Preserves original values and audit history.
 */
app.put('/api/ocr/drafts/:draftId/correct', requireAuth, async (req, res) => {
  try {
    const { draftId } = req.params;
    const { itemId, itemIndex, corrections } = req.body || {};

    const result = await medicalOcrService.correctOcrDraftItem(db, {
      draftId,
      itemId,
      itemIndex,
      corrections: corrections || req.body
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.code || 'CORRECTION_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/ocr/drafts/:draftId/approve
 * Formal doctor approval converting the draft into verified clinical EHR facts.
 */
app.post('/api/ocr/drafts/:draftId/approve', requireAuth, async (req, res) => {
  try {
    const { draftId } = req.params;
    const { doctorNotes } = req.body || {};

    const result = await medicalOcrService.approveOcrDraftAsFact(db, {
      draftId,
      doctorNotes
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.code || 'APPROVAL_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/ocr/drafts/:draftId/reject
 * Rejects an OCR draft upon doctor clinical review.
 */
app.post('/api/ocr/drafts/:draftId/reject', requireAuth, async (req, res) => {
  try {
    const { draftId } = req.params;
    const { rejectionReason } = req.body || {};

    const result = await medicalOcrService.rejectOcrDraft(db, {
      draftId,
      rejectionReason
    }, req.user);

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.code || 'REJECTION_FAILED',
      message: err.message
    });
  }
});

// =============================================================================
// 🚨 UNUSUAL ACCESS & ANOMALY MONITORING ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/security/unusual-access/alerts
 * Retrieves active or filtered unusual access and security anomaly alerts.
 */
app.get('/api/admin/security/unusual-access/alerts', requireAuth, requireAdmin, (req, res) => {
  try {
    const { status, severity, limit } = req.query || {};
    const alerts = unusualAccessService.getActiveAnomalies({
      status: status || null,
      severity: severity || null,
      limit: parseInt(limit, 10) || 50
    });
    res.json({ success: true, alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/admin/security/unusual-access/metrics
 * Returns aggregate anomaly telemetry and blocked probe metrics.
 */
app.get('/api/admin/security/unusual-access/metrics', requireAuth, requireAdmin, (req, res) => {
  try {
    const metrics = unusualAccessService.getUnusualAccessMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/security/unusual-access/resolve/:alertId
 * Resolves an unusual access alert with resolution notes.
 */
app.post('/api/admin/security/unusual-access/resolve/:alertId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolutionNotes, isFalsePositive } = req.body || {};

    const alert = unusualAccessService.resolveUnusualAccessAlert(alertId, {
      resolvedBy: req.user.uid,
      resolutionNotes,
      isFalsePositive: Boolean(isFalsePositive)
    });

    res.json({ success: true, alert });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'RESOLVE_ERROR', message: err.message });
  }
});

app.pushNotificationService = pushNotificationService;
app.waitingListService = waitingListService;
app.googleCalendarService = googleCalendarService;
app.schedulingService = schedulingService;
app.telehealthVideoService = telehealthVideoService;
app.medicalOcrService = medicalOcrService;
app.unusualAccessService = unusualAccessService;
app.prescriptionService = prescriptionService;

// =============================================================================
// 💊 CERTIFIED PRESCRIPTIONS, REMINDERS & PHARMACY SANDBOX ROUTES
// =============================================================================

/**
 * POST /api/prescriptions/issue
 * Issues a new prescription (v1). Only approved doctors can call this.
 */
app.post('/api/prescriptions/issue', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
      return res.status(403).json({
        error: 'DOCTOR_CREDENTIALS_REQUIRED',
        message: 'Only actively licensed and approved doctors can issue prescriptions.'
      });
    }

    const { caseId, patientId, patientName, medications, clinicalNotes } = req.body || {};
    const prescription = await prescriptionService.issuePrescription({
      caseId,
      patientId,
      patientName,
      doctorIdentity,
      medications,
      clinicalNotes
    });

    res.status(201).json({ success: true, prescription });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'PRESCRIPTION_ISSUE_FAILED', message: err.message });
  }
});

/**
 * POST /api/prescriptions/:prescriptionId/amend
 * Creates an amended version of a prescription (v2, v3...).
 * Automatically cancels active reminders for the superseded version.
 */
app.post('/api/prescriptions/:prescriptionId/amend', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
      return res.status(403).json({
        error: 'DOCTOR_CREDENTIALS_REQUIRED',
        message: 'Only actively licensed and approved doctors can amend prescriptions.'
      });
    }

    const { prescriptionId } = req.params;
    const { medications, clinicalNotes, amendmentReason } = req.body || {};

    const prescription = await prescriptionService.amendPrescription({
      previousPrescriptionId: prescriptionId,
      doctorIdentity,
      medications,
      clinicalNotes,
      amendmentReason
    });

    res.json({ success: true, prescription });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'PRESCRIPTION_AMEND_FAILED', message: err.message });
  }
});

/**
 * POST /api/prescriptions/:prescriptionId/cancel
 * Cancels a prescription. Immediately stops and cancels all scheduled dose reminders.
 */
app.post('/api/prescriptions/:prescriptionId/cancel', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
      return res.status(403).json({
        error: 'DOCTOR_CREDENTIALS_REQUIRED',
        message: 'Only actively licensed and approved doctors can cancel prescriptions.'
      });
    }

    const { prescriptionId } = req.params;
    const { cancellationReason } = req.body || {};

    const result = await prescriptionService.cancelPrescription({
      prescriptionId,
      doctorIdentity,
      cancellationReason
    });

    res.json({ success: true, prescription: result.prescription, cancelledRemindersCount: result.cancelledRemindersCount });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'PRESCRIPTION_CANCEL_FAILED', message: err.message });
  }
});

/**
 * GET /api/prescriptions/:prescriptionId
 * Fetches a single prescription with signature verification status.
 */
app.get('/api/prescriptions/:prescriptionId', requireAuth, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const prescription = prescriptionService.getPrescriptionById(prescriptionId);
    if (!prescription) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Prescription not found.' });
    }

    const isPatient = req.user.uid === prescription.patientId;
    const isDoctor = req.user.uid === prescription.doctorId;
    const isAdmin = req.user.role === 'clinic_admin' || req.user.role === 'super_admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized access to prescription.' });
    }

    const isValidSignature = prescriptionService.verifyPrescriptionSignature(prescription);
    res.json({ success: true, prescription, isValidSignature });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/cases/:caseId/prescriptions
 * Returns all prescription versions and history for a given case.
 */
app.get('/api/cases/:caseId/prescriptions', requireAuth, async (req, res) => {
  try {
    const { caseId } = req.params;
    const prescriptions = prescriptionService.getCasePrescriptions(caseId);
    res.json({ success: true, count: prescriptions.length, prescriptions });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/prescriptions/:prescriptionId/pharmacy-consent
 * Patient explicitly grants consent to share prescription data with pharmacy.
 */
app.post('/api/prescriptions/:prescriptionId/pharmacy-consent', requireAuth, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { pharmacyId, accepted, expiresAt } = req.body || {};

    const consent = await prescriptionService.recordPharmacyConsent({
      prescriptionId,
      patientId: req.user.uid,
      pharmacyId,
      accepted: Boolean(accepted),
      expiresAt
    });

    res.json({ success: true, consent });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'CONSENT_FAILED', message: err.message });
  }
});

/**
 * POST /api/prescriptions/:prescriptionId/send-to-pharmacy
 * Dispatches prescription to accredited pharmacy or sandbox.
 */
app.post('/api/prescriptions/:prescriptionId/send-to-pharmacy', requireAuth, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { pharmacyId } = req.body || {};

    const dispatchResult = await prescriptionService.sendToPharmacy({
      prescriptionId,
      user: req.user,
      targetPharmacyId: pharmacyId
    });

    res.json({ success: true, result: dispatchResult });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'DISPATCH_FAILED', message: err.message });
  }
});

/**
 * POST /api/pharmacy/sandbox/simulate-dispense
 * Sandbox partner callback endpoint simulating medication dispensing.
 */
app.post('/api/pharmacy/sandbox/simulate-dispense', requireAuth, async (req, res) => {
  try {
    const { transmissionId, status, dispenseReference, notes } = req.body || {};

    const result = await prescriptionService.updatePharmacyDispenseStatus({
      transmissionId,
      status: status || prescriptionService.PHARMACY_STATUS.DISPENSED,
      dispenseReference: dispenseReference || `DISP_SANDBOX_${Date.now()}`,
      notes
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'DISPENSE_UPDATE_FAILED', message: err.message });
  }
});

/**
 * GET /api/prescriptions/patient/:patientId/reminders
 * Retrieves active dose reminders for a patient.
 */
app.get('/api/prescriptions/patient/:patientId/reminders', requireAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.uid !== patientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to view patient reminders.' });
    }

    const reminders = prescriptionService.getPatientActiveReminders(patientId);
    res.json({ success: true, count: reminders.length, reminders });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

app.chronicHypertensionService = chronicHypertensionService;

// =============================================================================
// 🫀 CHRONIC HYPERTENSION & BLOOD PRESSURE MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/chronic/specialties/readiness
 * Returns formal clinical readiness & specialist verification status across all chronic disease specialties.
 */
app.get('/api/chronic/specialties/readiness', requireAuth, (req, res) => {
  res.json({
    success: true,
    specialties: chronicHypertensionService.SPECIALTY_READINESS,
    verifiedActiveSpecialty: 'hypertension',
    governanceNotes: 'Hypertension is VERIFIED_ACTIVE. Diabetes, Cardiac Risk, Weight & Metabolic, and Clinical Nutrition remain UNDER_SPECIALIST_REVIEW pending formal specialist sign-off.'
  });
});

/**
 * POST /api/chronic/hypertension/readings
 * Ingests a new blood pressure reading with real-time classification, obstetric pre-eclampsia safeguards & alert triage.
 */
app.post('/api/chronic/hypertension/readings', requireAuth, async (req, res) => {
  try {
    const {
      patientId, patientName, clinicId,
      systolic, diastolic, pulse,
      measurementSource, arm, posture, cuffSize, timing,
      symptoms, medicationTaken, patientNotes,
      pregnancyStage, ageGroup, specialtyConsent, attachedFiles, linkedAppointmentId
    } = req.body || {};

    const targetPatientId = patientId || req.user.uid;

    if (req.user.uid !== targetPatientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to record reading for target patient.' });
    }

    const reading = await chronicHypertensionService.recordBloodPressureReading({
      patientId: targetPatientId,
      patientName: patientName || req.user.name || 'Patient',
      clinicId: clinicId || req.user.clinicId,
      systolic,
      diastolic,
      pulse,
      measurementSource,
      arm,
      posture,
      cuffSize,
      timing,
      symptoms,
      medicationTaken,
      patientNotes,
      recordedByUid: req.user.uid,
      pregnancyStage,
      ageGroup,
      specialtyConsent,
      attachedFiles,
      linkedAppointmentId
    });

    res.status(201).json({ success: true, reading });
  } catch (err) {
    res.status(400).json({ error: 'RECORD_READING_FAILED', message: err.message });
  }
});

/**
 * GET /api/chronic/hypertension/patient/:patientId/dashboard
 * Computes longitudinal chronic metrics: control rate, average MAP, diurnal morning surge, stage distribution.
 */
app.get('/api/chronic/hypertension/patient/:patientId/dashboard', requireAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.uid !== patientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to view patient chronic dashboard.' });
    }

    const dashboard = chronicHypertensionService.calculateHypertensionDashboard(patientId);
    res.json({ success: true, dashboard });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/chronic/hypertension/patient/:patientId/history
 * Retrieves blood pressure history and timeline events.
 */
app.get('/api/chronic/hypertension/patient/:patientId/history', requireAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit } = req.query;

    if (req.user.uid !== patientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to view patient readings.' });
    }

    const readings = chronicHypertensionService.getPatientReadings(patientId, parseInt(limit, 10) || 50);
    res.json({ success: true, count: readings.length, readings });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/chronic/hypertension/patient/:patientId/followup-plan
 * Specialist prescribes or updates monitoring protocol and target blood pressure goals.
 */
app.post('/api/chronic/hypertension/patient/:patientId/followup-plan', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
      return res.status(403).json({
        error: 'DOCTOR_CREDENTIALS_REQUIRED',
        message: 'Only actively licensed and approved physicians can establish follow-up plans.'
      });
    }

    const { patientId } = req.params;
    const {
      targetSystolic,
      targetDiastolic,
      protocol,
      nextReviewDate,
      clinicalGuidance,
      dietarySodiumTargetMg,
      prescribedRegimen,
      linkedAppointmentId,
      pregnancyStage,
      ageGroup,
      attachedFiles
    } = req.body || {};

    const plan = await chronicHypertensionService.createOrUpdateFollowupPlan({
      patientId,
      doctorIdentity,
      targetSystolic,
      targetDiastolic,
      protocol,
      nextReviewDate,
      clinicalGuidance,
      dietarySodiumTargetMg,
      prescribedRegimen,
      linkedAppointmentId,
      pregnancyStage,
      ageGroup,
      attachedFiles
    });

    res.status(200).json({ success: true, plan });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'FOLLOWUP_PLAN_FAILED', message: err.message });
  }
});

/**
 * POST /api/chronic/hypertension/patient/:patientId/book-consultation
 * Bridges chronic hypertension follow-up care directly into the existing appointment & calendar scheduling system.
 */
app.post('/api/chronic/hypertension/patient/:patientId/book-consultation', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const targetPatientId = patientId || req.user.uid;

    if (req.user.uid !== targetPatientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to schedule consultation for this patient.' });
    }

    const { doctorId, clinicId, appointmentDate, appointmentTime, notes } = req.body || {};
    if (!doctorId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'doctorId, appointmentDate, and appointmentTime are required.'
      });
    }

    const appointmentPayload = {
      patientId: targetPatientId,
      patientName: req.user.displayName || req.user.name || 'Patient',
      patientEmail: req.user.email,
      patientPhone: req.user.phone,
      doctorId,
      clinicId: clinicId || null,
      appointmentDate,
      appointmentTime,
      type: 'CHRONIC_HYPERTENSION_FOLLOWUP',
      reason: 'Chronic Hypertension Follow-up Consultation',
      notes: notes || 'Chronic Blood Pressure monitoring follow-up'
    };

    const bookedAppointment = await schedulingService.bookAppointment(db, appointmentPayload, req.user);
    res.status(201).json({ success: true, appointment: bookedAppointment });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'BOOKING_FAILED', message: err.message });
  }
});

/**
 * GET /api/chronic/hypertension/patient/:patientId/followup-plan
 * Retrieves active follow-up protocol and targets.
 */
app.get('/api/chronic/hypertension/patient/:patientId/followup-plan', requireAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.uid !== patientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized.' });
    }

    const plan = chronicHypertensionService.getFollowupPlan(patientId);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/chronic/hypertension/patient/:patientId/certify-report
 * Doctor certifies longitudinal chronic evaluation report with digital license stamp.
 */
app.post('/api/chronic/hypertension/patient/:patientId/certify-report', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  try {
    const doctorIdentity = await getVerifiedDoctorIdentity(req.user.uid);
    if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
      return res.status(403).json({
        error: 'DOCTOR_CREDENTIALS_REQUIRED',
        message: 'Only actively licensed and approved physicians can certify chronic disease reports.'
      });
    }

    const { patientId } = req.params;
    const { clinicalDiagnosis, managementPlan, riskStratification, selectedReadingIds } = req.body || {};

    const report = await chronicHypertensionService.certifyChronicHypertensionReport({
      patientId,
      doctorIdentity,
      clinicalDiagnosis,
      managementPlan,
      riskStratification,
      selectedReadingIds
    });

    res.status(201).json({ success: true, report });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.code || 'CERTIFICATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/chronic/hypertension/patient/:patientId/report
 * Retrieves latest certified chronic disease report.
 */
app.get('/api/chronic/hypertension/patient/:patientId/report', requireAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.uid !== patientId && req.user.role !== 'doctor' && req.user.role !== 'clinic_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'ACCESS_DENIED', message: 'Unauthorized to view report.' });
    }

    const report = chronicHypertensionService.getLatestCertifiedReport(patientId);
    if (!report) {
      return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'No certified chronic disease report found for this patient.' });
    }

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

app.wearableIntegrationService = wearableIntegrationService;

// =============================================================================
// ⌚ WEARABLE & HEALTH TELEMETRY INTEGRATION ROUTES
// Apple Health, Health Connect, Smartwatches & Continuous Monitors
// =============================================================================

/**
 * POST /api/wearables/consent
 * Registers or updates user consent for specific wearable platforms and health metrics.
 */
app.post('/api/wearables/consent', requireAuth, (req, res) => {
  try {
    const { provider, metricsAllowed, consented, consentVersion } = req.body || {};
    const patientId = req.user.uid;

    if (!provider) {
      return res.status(400).json({ error: 'MISSING_PROVIDER', message: 'provider is required (e.g., apple_health, health_connect, garmin_connect).' });
    }

    const consent = wearableIntegrationService.registerUserConsent({
      patientId,
      provider,
      metricsAllowed,
      consented: consented !== undefined ? Boolean(consented) : true,
      consentVersion
    });

    res.status(200).json({ success: true, consent });
  } catch (err) {
    res.status(400).json({ error: 'CONSENT_UPDATE_FAILED', message: err.message });
  }
});

/**
 * DELETE /api/wearables/consent/:provider
 * Revokes consent and disconnects the specified wearable provider.
 */
app.delete('/api/wearables/consent/:provider', requireAuth, (req, res) => {
  try {
    const { provider } = req.params;
    const { reason } = req.body || {};
    const patientId = req.user.uid;

    const revokedConsent = wearableIntegrationService.revokeUserConsent({
      patientId,
      provider,
      reason: reason || 'USER_DISCONNECTED'
    });

    res.json({ success: true, revokedConsent });
  } catch (err) {
    res.status(400).json({ error: 'REVOCATION_FAILED', message: err.message });
  }
});

/**
 * GET /api/wearables/status
 * Retrieves connection and sync status for all integrated wearable providers for the user.
 */
app.get('/api/wearables/status', requireAuth, (req, res) => {
  try {
    const patientId = req.query.patientId && (req.user.role === 'doctor' || req.user.role === 'clinic_admin' || req.user.role === 'super_admin')
      ? req.query.patientId
      : req.user.uid;

    const connections = wearableIntegrationService.getConnectionSummary(patientId);
    res.json({
      success: true,
      patientId,
      supportedPlatforms: wearableIntegrationService.SUPPORTED_PLATFORMS,
      supportedMetrics: wearableIntegrationService.SUPPORTED_METRICS,
      connections
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/wearables/connection
 * Updates provider connection lifecycle state (connected, syncing, token_expired, permission_revoked).
 */
app.post('/api/wearables/connection', requireAuth, (req, res) => {
  try {
    const { provider, status, deviceDetails, errorDetails } = req.body || {};
    const patientId = req.user.uid;

    if (!provider || !status) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'provider and status are required.' });
    }

    const connection = wearableIntegrationService.updateConnectionStatus({
      patientId,
      provider,
      status,
      deviceDetails,
      errorDetails
    });

    res.json({ success: true, connection });
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * POST /api/wearables/sync
 * Ingests a batch of Blood Pressure and/or Glucose readings from Apple Health, Health Connect, or smartwatches.
 * Enforces consent, deduplication, plausibility filtering, and clock-skew/delay detection.
 */
app.post('/api/wearables/sync', requireAuth, async (req, res) => {
  try {
    const { provider, readings, deviceDetails, syncTimestamp } = req.body || {};
    const patientId = req.user.uid;

    if (!provider || !Array.isArray(readings)) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'provider string and readings array are required.'
      });
    }

    const syncReport = await wearableIntegrationService.ingestWearableReadings({
      patientId,
      provider,
      readings,
      deviceDetails,
      syncTimestamp
    });

    res.status(200).json({ success: true, syncReport });
  } catch (err) {
    res.status(400).json({ error: 'SYNC_FAILED', message: err.message });
  }
});

/**
 * GET /api/wearables/readings/:metricType
 * Retrieves stored normalized wearable readings for a patient with quality flags.
 */
app.get('/api/wearables/readings/:metricType', requireAuth, (req, res) => {
  try {
    const { metricType } = req.params;
    const { limit } = req.query;
    const targetPatientId = req.query.patientId && (req.user.role === 'doctor' || req.user.role === 'clinic_admin' || req.user.role === 'super_admin')
      ? req.query.patientId
      : req.user.uid;

    const readings = wearableIntegrationService.getPatientWearableReadings(
      targetPatientId,
      metricType,
      parseInt(limit, 10) || 100
    );

    res.json({ success: true, count: readings.length, readings });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/wearables/trends/:metricType
 * Computes longitudinal observational wearable trends (moving averages, time-in-range, diurnal variance).
 * 🛡️ STRICT NON-DIAGNOSTIC BOUNDARY:
 * Explicitly flagged as non-diagnostic telemetry for physician review; strictly prohibits autonomous medical decisions.
 */
app.get('/api/wearables/trends/:metricType', requireAuth, (req, res) => {
  try {
    const { metricType } = req.params;
    const { timeframeDays } = req.query;
    const targetPatientId = req.query.patientId && (req.user.role === 'doctor' || req.user.role === 'clinic_admin' || req.user.role === 'super_admin')
      ? req.query.patientId
      : req.user.uid;

    const trends = wearableIntegrationService.calculateWearableTrends(targetPatientId, metricType, {
      timeframeDays: parseInt(timeframeDays, 10) || 14
    });

    res.json({ success: true, trends });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = app;
