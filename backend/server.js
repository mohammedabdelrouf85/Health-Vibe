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

// =============================================================================
// 🌍 DUAL ENVIRONMENT CONFIGURATION (Development vs Production)
// =============================================================================
const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const isDevelopment = NODE_ENV === 'development';
const isProduction = NODE_ENV === 'production';

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
  : (configuredOrigins.length > 0 ? configuredOrigins : ['https://healthvibe.ai', 'https://app.healthvibe.ai']);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin '${origin}' not allowed by ${NODE_ENV} environment policy.`));
  }
}));
app.use(express.json());

// Diagnostic Health Check Route for Dev & Prod
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'Health Vibe AI Server-Authoritative Backend',
    environment: NODE_ENV,
    isDevelopment,
    isProduction,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    corsAllowed: allowedOrigins,
    firebase: {
      initialized: Boolean(admin.apps.length),
      projectId: process.env.FIREBASE_PROJECT_ID || 'health-vibes-a4b3b',
      emulatorActive: Boolean(process.env.FIRESTORE_EMULATOR_HOST)
    }
  });
});

// Emulator Support (Development ONLY)
if (isDevelopment && (process.env.USE_FIREBASE_EMULATOR === 'true' || process.env.FIRESTORE_EMULATOR_HOST)) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  console.log(`[BACKEND DEV] Using local Firebase Emulators: Firestore (${process.env.FIRESTORE_EMULATOR_HOST}), Auth (${process.env.FIREBASE_AUTH_EMULATOR_HOST})`);
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'health-vibes-a4b3b';
    admin.initializeApp({ projectId });
    console.log(`[BACKEND] Firebase Admin initialized for [${projectId}] in [${NODE_ENV}] mode.`);
  } catch (err) {
    console.warn("[BACKEND WARNING] Firebase Admin SDK initialized with fallback:", err.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// System Owner Email (Hardcoded single source of truth for supreme administrative rights)
const OWNER_EMAIL = "mohammedabdelrouf85@gmail.com";
const REVOKED_VERIFICATION_EMAILS = new Set([
  "devilunderurwater@gmail.com"
]);
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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
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
 * Verifies that the user's email is verified (or the user is the system owner)
 */
function requireVerifiedEmail(req, res, next) {
  const email = (req.user.email || '').toLowerCase();
  if (email === OWNER_EMAIL.toLowerCase()) {
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
 * Verifies that the authenticated user holds the Admin role in Firestore or via Custom Claims.
 */
async function requireAdmin(req, res, next) {
  const uid = req.user.uid;
  const email = (req.user.email || '').toLowerCase();

  // Automatic Owner validation
  if (email === OWNER_EMAIL.toLowerCase()) {
    return next();
  }

  // Check custom claims
  if (ADMIN_ROLES.includes(normalizeRole(req.user.role))) {
    return next();
  }

  // Fallback to Firestore server document check (bypassing any client memory)
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && ADMIN_ROLES.includes(normalizeRole(userDoc.data().role))) {
      return next();
    }
  } catch (err) {
    console.error("[SERVER RBAC ERROR] Database role query failed:", err.message);
  }

  return res.status(403).json({
    error: 'ACCESS_DENIED',
    message: 'Server verification failed: Admin privileges are required to perform this action.'
  });
}

async function requireSuperAdmin(req, res, next) {
  const uid = req.user.uid;
  const email = (req.user.email || '').toLowerCase();

  if (email === OWNER_EMAIL.toLowerCase() || normalizeRole(req.user.role) === ROLES.SUPER_ADMIN) {
    return next();
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && normalizeRole(userDoc.data().role) === ROLES.SUPER_ADMIN) {
      return next();
    }
  } catch (err) {
    console.error("[SERVER RBAC ERROR] Database super admin verification query failed:", err.message);
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

  // Check custom claims
  if (req.user.role === 'doctor') {
    return next();
  }

  // Check server document
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data().role === 'doctor' && userDoc.data().doctorApplicationStatus === 'approved') {
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
  const isOwner = (req.user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
  let role = normalizeRole(req.user.role, isOwner);

  if (db && !isOwner) {
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (doc.exists && doc.data().role) {
      role = normalizeRole(doc.data().role, isOwner);
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
        reviewedBy: 'Clinical Governance & Pulmonology Board',
        reviewStatus: 'clinician-reviewed-rules',
        changelog: {
          ar: 'الإصدار السريري الأساسي المعتمد: فرز مبني على عتبات SpO2، ضيق التنفس، شدة السعال، ومدة الأعراض.',
          en: 'Baseline certified clinical release: rule-based triage based on SpO2 thresholds, dyspnea, cough severity, and symptom duration.'
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
        reviewedBy: 'Clinical Governance & Pulmonology Board',
        reviewStatus: 'clinician-reviewed-rules',
        changelog: {
          ar: 'تحديث سريري مرتقب: تعزيز حساسية عوامل الخطورة التنفسية المزمنة ومطابقة معايير الفرز الرئوي الإقليمية.',
          en: 'Candidate clinical update: enhanced sensitivity for chronic respiratory risk factors and aligned regional pulmonology triage.'
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
    let authUsersCount = 0;
    let authUsersToday = 0;
    let approvedDoctors = 0;
    let nextPageToken;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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

      const users = usersSnapshot.docs.map((doc) => doc.data());
      const apps = appsSnapshot.docs.map((doc) => doc.data());
      const cases = casesSnapshot.docs.map((doc) => doc.data());

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
    const email = (req.user.email || '').toLowerCase();
    const isOwner = email === OWNER_EMAIL.toLowerCase();
    const canView = isOwner || [...ADMIN_ROLES, ROLES.DOCTOR, ROLES.SUPPORT].includes(userRole);
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

    const casesSnapshot = await db.collection('cases').get();
    const cases = casesSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
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
 * POST /api/admin/set-user-role
 * Server-authoritative endpoint to change a user's role and set Firebase Custom Claims
 */
app.post('/api/admin/set-user-role', requireAuth, requireVerifiedEmail, requireSuperAdmin, async (req, res) => {
  const { targetUserId, newRole } = req.body;

  if (!targetUserId || !VALID_ROLES.includes(newRole)) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Valid targetUserId and newRole required.' });
  }

  if ([ROLES.DOCTOR_PENDING, ROLES.DOCTOR].includes(newRole)) {
    return res.status(400).json({
      error: 'INVALID_ROLE_TRANSITION',
      message: 'Doctor roles cannot be assigned manually. The account must enter doctor_pending through an application, then be approved through /api/admin/approve-doctor-application.'
    });
  }

  try {
    const targetUser = await admin.auth().getUser(targetUserId);
    const targetIsOwner = (targetUser.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();

    // 1. Set cryptographic custom claims on Firebase Auth
    await admin.auth().setCustomUserClaims(targetUserId, {
      role: normalizeRole(newRole, targetIsOwner),
      isOwner: targetIsOwner
    });

    // 2. Update Firestore user document
    if (db) {
      await db.collection('users').doc(targetUserId).set({
        role: normalizeRole(newRole, targetIsOwner),
        isOwner: targetIsOwner,
        roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        roleUpdatedBy: req.user.email
      }, { merge: true });

      // 3. Append immutable audit event
      await db.collection('audit_events').add({
        type: 'SERVER_ROLE_CHANGE',
        targetUserId: targetUserId,
        newRole: normalizeRole(newRole, targetIsOwner),
        assignedBy: req.user.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, message: `Successfully updated user role to ${normalizeRole(newRole, targetIsOwner)} on server.` });
  } catch (err) {
    console.error("[SERVER ROLE UPDATE ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/approve-doctor-application
 * Server-authoritative endpoint to approve a doctor application and elevate their role
 */
app.post('/api/admin/approve-doctor-application', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res) => {
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
    await admin.auth().setCustomUserClaims(applicantUserId, { role: 'doctor' });

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
      const caseDoc = await db.collection('cases').doc(caseId).get();
      if (!caseDoc.exists) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Case not found.' });
      }

      const caseData = caseDoc.data();
      const currentStatus = caseData.status || 'pending';
      const normalizedClinicalNotes = String(clinicalNotes || note || '').trim();
      const normalizedRecommendations = normalizeRecommendations(recommendations, recommendation);

      if (targetStatus === 'approved' && (!normalizedClinicalNotes || normalizedRecommendations.length === 0)) {
        return res.status(400).json({
          error: 'MISSING_CLINICAL_REPORT_DATA',
          message: 'Doctor clinical notes and at least one patient recommendation are required before approving a report.'
        });
      }

      // Zero-trust assigned physician check
      const assignedDoctor = caseData.assignedDoctorId || caseData.doctorId || caseData.doctorUid;
      if (assignedDoctor && assignedDoctor !== req.user.uid) {
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'Zero-Trust enforcement: This clinical case is assigned to another physician.'
        });
      }

      // Valid State Machine Transitions
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

      const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowedNext.includes(targetStatus)) {
        return res.status(400).json({
          error: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowedNext.join(', ')}]`
        });
      }

      const updateData = {
        status: targetStatus,
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: req.user.uid,
        lastUpdatedByEmail: req.user.email,
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: targetStatus,
          previousStatus: currentStatus,
          changedAt: new Date().toISOString(),
          changedBy: req.user.uid,
          changedByEmail: req.user.email,
          changedByName: req.user.name || req.user.displayName || 'Doctor',
          changedByRole: 'doctor',
          note: note || normalizedClinicalNotes || recommendation || `Status transitioned to ${targetStatus}`
        })
      };

      if (targetStatus === 'approved') {
        updateData.doctorApproved = true;
        updateData.approvingDoctorId = req.user.uid;
        updateData.approvingDoctorEmail = req.user.email;
        updateData.approvingDoctorName = approvingDoctorName || req.user.displayName || req.user.name || 'Doctor';
        updateData.doctorSpecialty = doctorSpecialty || 'Pulmonology & Respiratory Medicine';
        updateData.doctorLicense = doctorLicense || 'EGY-MED-20491';
        updateData.clinicName = clinicName || 'Health Vibes Specialized Clinics';
        updateData.reportRef = reportRef || `HV-REP-${caseId.slice(-8).toUpperCase()}`;
        updateData.reportGeneratedAt = reportGeneratedAt || new Date().toISOString();
        updateData.approvedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.generatedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.reportVersion = REPORT_VERSION;
        updateData.modelVersion = MODEL_VERSION;
        updateData.clinicalDiagnosis = clinicalDiagnosis || normalizedClinicalNotes;
        updateData.doctorNote = clinicalDiagnosis || normalizedClinicalNotes;
        updateData.clinicalNotes = clinicalDiagnosis || normalizedClinicalNotes;
        updateData.medications = medications || '';
        updateData.recommendation = normalizedRecommendations.join('\n');
        updateData.recommendations = normalizedRecommendations;
      } else if (targetStatus === 'more_info_requested') {
        updateData.moreInfoRequestedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.moreInfoNote = note || '';
      } else if (targetStatus === 'escalated') {
        updateData.escalatedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.escalationReason = note || '';
      } else if (targetStatus === 'closed') {
        updateData.closedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.closedBy = req.user.uid;
      }

      await db.collection('cases').doc(caseId).update(updateData);

      await db.collection('audit_events').add({
        type: `CLINICAL_CASE_${targetStatus.toUpperCase()}`,
        caseId: caseId,
        doctorId: req.user.uid,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        note: note || normalizedClinicalNotes || '',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // 📧 CLINICAL NOTIFICATION DISPATCH (Result Ready / More Info Requested)
      let notificationResult = null;
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
        notification: notificationResult
      });
    }

    return res.json({
      success: true,
      message: `Case status successfully updated to ${targetStatus}.`,
      targetStatus
    });
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

  const userRole = req.user.role || role || 'patient';
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
    const isDocOrAdmin = ['doctor', 'clinic_admin', 'super_admin'].includes(userRole) || (req.user.email && isSuperAdminUser(req.user.email));

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
      feedbacks.push(doc.data());
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
      if (clinicId) updateData.clinicId = clinicId;
      if (clinicName) updateData.clinicName = clinicName;

      await db.collection('cases').doc(caseId).update(updateData);

      await db.collection('audit_events').add({
        type: 'CASE_ASSIGNED_TO_DOCTOR',
        caseId: caseId,
        assignedDoctorId: doctorId,
        clinicId: clinicId || caseDoc.data().clinicId || null,
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

  const isValid = whatsappBot.verifyCode({
    userId,
    userEmail,
    code: String(code).trim(),
    phoneNumber
  });

  if (!isValid) {
    return res.status(400).json({
      error: 'CODE_MISMATCH',
      message: 'كود التحقق غير صحيح أو انتهت صلاحيته. يرجى طلب كود جديد من البوت.'
    });
  }

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
  whatsappBot.handleInboundWebhook(req.body);
  res.sendStatus(200);
});

/**
 * POST /api/user/delete-account
 * GDPR / HIPAA compliant account and clinical data deletion
 */
app.post('/api/user/delete-account', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const userEmail = (req.user.email || '').toLowerCase();

  try {
    // 1. Safeguard system owner from automated deletion
    const isOwner = userEmail === OWNER_EMAIL.toLowerCase();
    if (isOwner) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Platform owner account cannot be deleted via automated workflow.'
      });
    }

    if (db) {
      const batch = db.batch();

      // 2. Anonymize or remove user cases
      const casesSnapshot = await db.collection('cases').where('patientId', '==', userId).get();
      casesSnapshot.forEach(docSnap => {
        const cData = docSnap.data();
        if (cData.status === 'pending') {
          batch.delete(docSnap.ref);
        } else {
          // Maintain medical audit trail while purging PII
          batch.update(docSnap.ref, {
            patientId: `deleted_${userId.substring(0, 6)}`,
            patientName: 'مريض محذوف (Deleted Patient)',
            patientNameEn: 'Deleted Patient',
            name: 'Deleted Patient',
            nameEn: 'Deleted Patient',
            patientEmail: 'deleted@anonymized.local',
            'assessment.privacyConsent.revokedAt': new Date().toISOString(),
            isAnonymized: true
          });
        }
      });

      // 3. Remove doctor applications if any
      const docAppSnapshot = await db.collection('doctor_applications').where('userId', '==', userId).get();
      docAppSnapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      // 4. Delete user document from Firestore
      const userRef = db.collection('users').doc(userId);
      batch.delete(userRef);

      // 5. Append audit log
      const auditRef = db.collection('audit_events').doc();
      const maskedEmail = userEmail ? `${userEmail[0]}***@${userEmail.split('@')[1]}` : 'anonymous';
      batch.set(auditRef, {
        type: 'ACCOUNT_DELETED',
        userId: userId,
        userEmailMasked: maskedEmail,
        deletedCasesCount: casesSnapshot.size,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();
    }

    // 6. Delete user from Firebase Auth
    await admin.auth().deleteUser(userId);

    console.log(`[ACCOUNT DELETED]: User ${userId} successfully deleted from system.`);
    res.json({ success: true, message: 'Account and personal data successfully deleted.' });
  } catch (err) {
    console.error("[SERVER DELETE ACCOUNT ERROR]:", err);
    res.status(500).json({ error: 'DELETION_FAILED', message: err.message });
  }
});

const PORT = process.env.PORT || (isDevelopment ? 4000 : 8080);
app.listen(PORT, () => {
  console.log(`[Health Vibe AI Backend] Server running in [${NODE_ENV.toUpperCase()}] mode on port ${PORT}`);
});

module.exports = app;
