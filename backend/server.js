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

      pendingReviews = cases.filter((item) => item.status === 'pending').length;
      urgentReviews = cases.filter((item) =>
        item.status === 'pending' &&
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
 * POST /api/doctor/approve-clinical-case
 * Server-authoritative endpoint for doctor case approval (strictly rejects non-doctors)
 */
app.post('/api/doctor/approve-clinical-case', requireAuth, requireVerifiedEmail, requireDoctor, async (req, res) => {
  const { caseId, clinicalNotes, recommendation } = req.body;

  if (!caseId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'caseId required.' });
  }

  try {
    if (db) {
      await db.collection('cases').doc(caseId).update({
        status: 'approved',
        doctorApproved: true,
        approvingDoctorId: req.user.uid,
        approvingDoctorEmail: req.user.email,
        clinicalNotes: clinicalNotes || '',
        recommendation: recommendation || '',
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('audit_events').add({
        type: 'CLINICAL_CASE_APPROVED',
        caseId: caseId,
        doctorId: req.user.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, message: 'Case approved by authorized physician.' });
  } catch (err) {
    console.error("[SERVER CASE APPROVAL ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[Health Vibe AI Backend] Server running securely on port ${PORT}`);
});

module.exports = app;
