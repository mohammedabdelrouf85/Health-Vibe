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
app.use(cors({ origin: true }));
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
  if (req.user.role === 'admin') {
    return next();
  }

  // Fallback to Firestore server document check (bypassing any client memory)
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data().role === 'admin') {
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
  let role = isOwner ? 'admin' : (req.user.role || 'patient');

  if (db && !isOwner) {
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (doc.exists && doc.data().role) {
      role = doc.data().role;
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
 * POST /api/admin/set-user-role
 * Server-authoritative endpoint to change a user's role and set Firebase Custom Claims
 */
app.post('/api/admin/set-user-role', requireAuth, requireAdmin, async (req, res) => {
  const { targetUserId, newRole } = req.body;

  if (!targetUserId || !['patient', 'doctor', 'admin'].includes(newRole)) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Valid targetUserId and newRole required.' });
  }

  try {
    // 1. Set cryptographic custom claims on Firebase Auth
    await admin.auth().setCustomUserClaims(targetUserId, { role: newRole });

    // 2. Update Firestore user document
    if (db) {
      await db.collection('users').doc(targetUserId).set({
        role: newRole,
        roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        roleUpdatedBy: req.user.email
      }, { merge: true });

      // 3. Append immutable audit event
      await db.collection('audit_events').add({
        type: 'SERVER_ROLE_CHANGE',
        targetUserId: targetUserId,
        newRole: newRole,
        assignedBy: req.user.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ success: true, message: `Successfully updated user role to ${newRole} on server.` });
  } catch (err) {
    console.error("[SERVER ROLE UPDATE ERROR]:", err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/approve-doctor-application
 * Server-authoritative endpoint to approve a doctor application and elevate their role
 */
app.post('/api/admin/approve-doctor-application', requireAuth, requireAdmin, async (req, res) => {
  const { applicationId, applicantUserId } = req.body;

  if (!applicationId || !applicantUserId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'applicationId and applicantUserId required.' });
  }

  try {
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
app.post('/api/doctor/approve-clinical-case', requireAuth, requireDoctor, async (req, res) => {
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
