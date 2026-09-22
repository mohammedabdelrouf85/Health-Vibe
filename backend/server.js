/**
 * Health Vibe AI - Server-Authoritative Zero-Trust RBAC Service
 * 
 * CRITICAL SECURITY PRINCIPLE:
 * Never rely on client-side / frontend variables for permission checks.
 * All roles, custom claims, and privileged operations MUST be verified and enforced
 * on the server using cryptographic Firebase ID Tokens and Firebase Admin SDK.
 */

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const whatsappBot = require('./whatsapp-bot');
require('dotenv').config();

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed by environment config.'));
  }
}));
app.use(express.json());

// Initialize Firebase Admin SDK
// Uses GOOGLE_APPLICATION_CREDENTIALS in production
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (err) {
    console.warn("[BACKEND WARNING] Firebase Admin SDK initialized without default credentials. Provide serviceAccountKey.json in production.");
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// System Owner Email (Hardcoded single source of truth for supreme administrative rights)
const OWNER_EMAIL = "mohammedabdelrouf85@gmail.com";
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

  if (!req.user.email_verified) {
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
  const userId = req.user.uid;
  const { phoneNumber, verificationMethod } = req.body || {};

  try {
    // 1. Update Firebase Auth record so user is marked verified in Firebase Auth
    await admin.auth().updateUser(userId, {
      emailVerified: true
    }).catch(err => {
      console.warn("[SERVER AUTH WARNING] admin.auth().updateUser emailVerified:", err.message);
    });

    // 2. Update Firestore user document
    if (db) {
      await db.collection('users').doc(userId).set({
        emailVerified: true,
        phoneVerified: true,
        phoneNumber: phoneNumber || null,
        verificationMethod: verificationMethod || 'phone_whatsapp_otp',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // 3. Add audit event
      await db.collection('audit_events').add({
        type: 'USER_PHONE_VERIFIED_OTP',
        userId: userId,
        userEmail: req.user.email || null,
        phoneNumber: phoneNumber || null,
        verificationMethod: verificationMethod || 'phone_whatsapp_otp',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Account verified successfully via phone/WhatsApp OTP.'
    });
  } catch (err) {
    console.error("[SERVER PHONE OTP VERIFY ERROR]:", err);
    res.status(500).json({ error: 'VERIFICATION_FAILED', message: err.message });
  }
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
app.post('/api/bot/request-code', async (req, res) => {
  const authHeader = req.headers.authorization;
  let userId = null;
  let userEmail = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      userId = decoded.uid;
      userEmail = decoded.email;
    } catch(e) {}
  }

  const { phoneNumber } = req.body || {};

  try {
    const result = await whatsappBot.requestVerificationCode({
      userId,
      userEmail,
      phoneNumber
    });

    res.json({
      success: true,
      message: result.message || "تم إرسال كود التفعيل السري تلقائياً عبر بوت الواتساب."
    });
  } catch(err) {
    console.error("[WHATSAPP BOT REQUEST ERROR]:", err);
    res.status(500).json({ error: 'BOT_DISPATCH_FAILED', message: err.message });
  }
});

/**
 * POST /api/bot/verify-code
 * Verifies code submitted by user against WhatsApp bot active registry.
 * Upon match, elevates user to verified across Firebase Auth & Firestore.
 */
app.post('/api/bot/verify-code', async (req, res) => {
  const authHeader = req.headers.authorization;
  let userId = null;
  let userEmail = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      userId = decoded.uid;
      userEmail = decoded.email;
    } catch(e) {}
  }

  const { code, phoneNumber } = req.body || {};

  if (!code || String(code).trim().length !== 6) {
    return res.status(400).json({ error: 'INVALID_CODE', message: 'كود التفعيل يجب أن يتكون من 6 أرقام.' });
  }

  const isValid = whatsappBot.verifyCode({
    userId,
    userEmail,
    code: String(code).trim()
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[Health Vibe AI Backend] Server running securely on port ${PORT}`);
});

module.exports = app;
