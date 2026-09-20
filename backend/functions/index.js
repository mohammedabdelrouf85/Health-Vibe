/**
 * Health Vibe AI - Firebase Cloud Functions
 * Automated server-side triggers for role management and Zero-Trust enforcement
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const OWNER_EMAIL = 'mohammedabdelrouf85@gmail.com';

/**
 * Trigger: On User Creation (Auth Trigger)
 * Automatically sets safe default custom claims without relying on frontend
 */
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const email = (user.email || '').toLowerCase();
  const isOwner = email === OWNER_EMAIL.toLowerCase();
  const initialRole = isOwner ? 'admin' : 'patient';

  // 1. Assign cryptographic Custom Claims to Firebase JWT
  await admin.auth().setCustomUserClaims(user.uid, {
    role: initialRole,
    isOwner: isOwner
  });

  // 2. Initialize Firestore user record
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    name: user.displayName || user.email.split('@')[0],
    role: initialRole,
    isOwner: isOwner,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`[CLOUD FUNCTION] Initialized user ${user.uid} with server-authoritative role: ${initialRole}`);
});

/**
 * Trigger: On Doctor Application Updated (Firestore Trigger)
 * When an admin approves an application in Firestore, the backend automatically
 * upgrades the user's Auth Custom Claims to 'doctor'.
 */
exports.onDoctorApplicationUpdated = functions.firestore
  .document('doctor_applications/{appId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Detect transition to approved
    if (beforeData.status !== 'approved' && afterData.status === 'approved') {
      const targetUserId = afterData.userId;

      // Update Custom Claims on Firebase Auth
      await admin.auth().setCustomUserClaims(targetUserId, {
        role: 'doctor',
        doctorVerified: true
      });

      // Update User Document
      await admin.firestore().collection('users').doc(targetUserId).set({
        role: 'doctor',
        verifiedDoctor: true
      }, { merge: true });

      // Log to immutable audit trail
      await admin.firestore().collection('audit_events').add({
        type: 'SERVER_PROMOTED_DOCTOR_ROLE',
        userId: targetUserId,
        applicationId: context.params.appId,
        approvedBy: afterData.approvedBy || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[CLOUD FUNCTION] Automatically granted doctor custom claims to user: ${targetUserId}`);
    }
  });
