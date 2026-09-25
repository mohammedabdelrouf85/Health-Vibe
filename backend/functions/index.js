/**
 * Health Vibe AI - Firebase Cloud Functions
 * Automated server-side triggers for role management and Zero-Trust enforcement
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const OWNER_EMAILS = [
  'mohammedabdelrouf85@gmail.com',
  'raouf.work@gmail.com',
  'admin@healthvibe.ai',
  'badr.ahmed.biotech@gmail.com'
];
const ROLES = {
  PATIENT: 'patient',
  DOCTOR_PENDING: 'doctor_pending',
  DOCTOR: 'doctor',
  SUPER_ADMIN: 'super_admin'
};

/**
 * Trigger: On User Creation (Auth Trigger)
 * Automatically sets safe default custom claims without relying on frontend
 */
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const email = (user.email || '').toLowerCase();
  const isOwner = OWNER_EMAILS.some(o => o.toLowerCase() === email);
  const initialRole = isOwner ? ROLES.SUPER_ADMIN : ROLES.PATIENT;

  // 1. Assign cryptographic Custom Claims to Firebase JWT
  await admin.auth().setCustomUserClaims(user.uid, {
    role: initialRole,
    isOwner: isOwner
  });

  // 2. Initialize Firestore user record
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    name: user.displayName || (user.email ? user.email.split('@')[0] : user.uid),
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

    const targetUserId = afterData.userId;
    if (!targetUserId || beforeData.status === afterData.status) return null;

    if (afterData.status === 'pending') {
      await admin.auth().setCustomUserClaims(targetUserId, {
        role: ROLES.DOCTOR_PENDING,
        doctorVerified: false
      });
      await admin.firestore().collection('users').doc(targetUserId).set({
        role: ROLES.DOCTOR_PENDING,
        doctorApplicationStatus: 'pending'
      }, { merge: true });
    } else if (afterData.status === 'rejected' || afterData.status === 'cancelled') {
      await admin.auth().setCustomUserClaims(targetUserId, {
        role: ROLES.PATIENT,
        doctorVerified: false
      });
      await admin.firestore().collection('users').doc(targetUserId).set({
        role: ROLES.PATIENT,
        verifiedDoctor: false,
        doctorApplicationStatus: afterData.status
      }, { merge: true });
    } else if (afterData.status === 'approved') {
      // Update Custom Claims on Firebase Auth
      await admin.auth().setCustomUserClaims(targetUserId, {
        role: ROLES.DOCTOR,
        doctorVerified: true
      });

      // Update User Document
      await admin.firestore().collection('users').doc(targetUserId).set({
        role: ROLES.DOCTOR,
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
    return null;
  });

exports.onDoctorApplicationCreated = functions.firestore
  .document('doctor_applications/{appId}')
  .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (!data || data.status !== 'pending' || !data.userId) return null;

    await admin.firestore().collection('users').doc(data.userId).set({
      role: ROLES.DOCTOR_PENDING,
      doctorApplicationStatus: 'pending'
    }, { merge: true });

    await admin.auth().setCustomUserClaims(data.userId, {
      role: ROLES.DOCTOR_PENDING,
      doctorVerified: false
    });

    return null;
  });
