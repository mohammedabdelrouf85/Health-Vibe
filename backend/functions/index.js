/**
 * Health Vibe AI - Firebase Cloud Functions
 * Automated server-side triggers for role management and Zero-Trust enforcement
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { inspectFileContent, MAX_FILE_SIZE_BYTES } = require('../upload-file-validation-service');

if (!admin.apps.length) {
  admin.initializeApp();
}

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
  const initialRole = ROLES.PATIENT;

  // 1. Assign cryptographic Custom Claims to Firebase JWT
  await admin.auth().setCustomUserClaims(user.uid, {
    role: initialRole,
    isOwner: false
  });

  // 2. Initialize Firestore user record
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    name: user.displayName || (user.email ? user.email.split('@')[0] : user.uid),
    role: initialRole,
    isOwner: false,
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
    // Approval/rejection is performed and audited by the authenticated API.
    // The only client-driven transition is cancellation of one's pending request.
    if (!targetUserId || beforeData.status !== 'pending' || afterData.status !== 'cancelled' ||
        beforeData.userId !== targetUserId) return null;
    const latest = await change.after.ref.get();
    const account = await admin.auth().getUser(targetUserId);
    if (!latest.exists || latest.data().status !== 'cancelled' ||
        account.customClaims?.role !== 'doctor_pending') return null;
    await admin.auth().setCustomUserClaims(targetUserId, {
      ...account.customClaims, role: ROLES.PATIENT, verifiedDoctor: false, doctorVerified: false
    });
    await admin.firestore().collection('users').doc(targetUserId).set({
      role: ROLES.PATIENT, verifiedDoctor: false, doctorVerified: false, doctorApplicationStatus: 'cancelled'
    }, { merge: true });
    await admin.firestore().collection('audit_events').add({ type: 'DOCTOR_APPLICATION_CANCELLED',
      userId: targetUserId, applicationId: context.params.appId,
      timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return null;
  });

exports.onDoctorApplicationCreated = functions.firestore
  .document('doctor_applications/{appId}')
  .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (!data || data.status !== 'pending' || !data.userId) return null;

    const latest = await snapshot.ref.get();
    const account = await admin.auth().getUser(data.userId);
    if (!latest.exists || latest.data().status !== 'pending' ||
        !['patient', 'doctor_pending'].includes(account.customClaims?.role || 'patient')) return null;
    await admin.firestore().collection('users').doc(data.userId).set({
      role: ROLES.DOCTOR_PENDING,
      doctorApplicationStatus: 'pending'
    }, { merge: true });

    await admin.auth().setCustomUserClaims(data.userId, {
      ...account.customClaims, verifiedDoctor: false,
      role: ROLES.DOCTOR_PENDING,
      doctorVerified: false
    });

    return null;
  });

/**
 * Server-side upload validation. Storage rules can check declared MIME metadata,
 * but only this trusted trigger inspects the uploaded bytes.
 */
exports.onStorageFileFinalized = functions.storage.object().onFinalize(async (object) => {
  const objectName = String(object.name || '');
  const parts = objectName.split('/');
  const isDoctorDocument = parts[0] === 'doctor_applications' && parts.length >= 4;
  const isCaseDocument = parts[0] === 'case_files' && parts.length === 5;
  const isMedicalUpload = parts[0] === 'medical_uploads' && parts.length === 5;
  if (!isDoctorDocument && !isCaseDocument && !isMedicalUpload) return null;

  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(objectName);
  const customMetadata = { ...(object.metadata || {}) };
  if (customMetadata.actualMimeValidated === 'true') return null;

  let validation;
  try {
    const size = Number(object.size || 0);
    if (size <= 0 || size > MAX_FILE_SIZE_BYTES) {
      validation = { valid: false, error: 'FILE_SIZE_NOT_ALLOWED' };
    } else {
      const [bytes] = await file.download();
      validation = inspectFileContent({
        buffer: bytes,
        fileName: parts[parts.length - 1],
        declaredMimeType: object.contentType,
        size
      });
    }
  } catch (error) {
    validation = { valid: false, error: 'FILE_CONTENT_UNREADABLE' };
  }

  if (!validation.valid) {
    if (isCaseDocument) {
      await admin.firestore().collection('case_files').doc(parts[3]).set({
        actualMimeValidated: false,
        scanStatus: 'rejected',
        availability: 'unavailable',
        uploadStatus: 'failed',
        failureCode: validation.error,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    }
    if (isMedicalUpload) {
      await admin.firestore().collection('medical_uploads').doc(parts[3]).set({
        actualMimeValidated: false,
        uploadStatus: 'failed',
        failureCode: validation.error,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    }
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    console.warn('[UPLOAD_VALIDATION] Rejected object:', { objectName, reason: validation.error });
    return null;
  }

  const validatedAt = new Date().toISOString();
  await file.setMetadata({
    contentType: validation.mimeType,
    metadata: {
      ...customMetadata,
      actualMimeValidated: 'true',
      detectedMimeType: validation.mimeType,
      validatedAt
    }
  });

  if (isCaseDocument) {
    await admin.firestore().collection('case_files').doc(parts[3]).set({
      actualMimeValidated: true,
      detectedContentType: validation.mimeType,
      actualFileSize: validation.size,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  if (isMedicalUpload) {
    await admin.firestore().collection('medical_uploads').doc(parts[3]).set({
      actualMimeValidated: true,
      detectedContentType: validation.mimeType,
      actualFileSize: validation.size,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return null;
});
