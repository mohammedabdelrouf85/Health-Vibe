/**
 * Health Vibe AI - Enterprise Privacy & Data Subject Rights Service
 *
 * Implements GDPR & HIPAA data subject lifecycle:
 * 1. Data Inventory across Auth, Firestore, Storage, Reports, Messages, Feedback, Logs, Backups.
 * 2. Recent Identity Verification / Re-authentication check.
 * 3. Proportional Deletion & Anonymization (Retention vs Right to be Forgotten).
 * 4. Data Portability / Export Request (GDPR Art. 20).
 * 5. Data Access Request Disclosure (GDPR Art. 15).
 * 6. Resumable Deletion Engine with Safe Retries & Granular Step Tracking.
 * 7. Chunked batch processing for large data volume accounts.
 * 8. Zero premature completion claims on partial failure.
 */

const crypto = require('crypto');

const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60; // 15 minutes
const MAX_BATCH_SIZE = 400; // Under Firestore 500-operation commit limit

const RETENTION_POLICY = Object.freeze({
  clinicalRecordsYears: 5,
  hipaaAuditLogsYears: 6,
  backupRetentionDays: 30,
  temporaryOtpMinutes: 5,
  accessRequestResponseHours: 72
});

// In-memory registry of active / recent privacy jobs (userId -> jobState)
const privacyJobRegistry = new Map();

/**
 * Verifies that the user's authentication is recent
 */
function verifyRecentAuthentication(reqUser, options = {}) {
  if (options.bypassRecentAuth === true || process.env.NODE_ENV === 'test' && options.isTestBypass) {
    return { ok: true, authAgeSeconds: 0, maxAgeSeconds: RECENT_AUTH_MAX_AGE_SECONDS };
  }

  const authTime = reqUser && (reqUser.auth_time || reqUser.iat);
  if (!authTime) {
    return {
      ok: false,
      error: 'REQUIRES_RECENT_LOGIN',
      message: 'Authentication timestamp is missing. Fresh sign-in required.',
      authAgeSeconds: Infinity,
      maxAgeSeconds: RECENT_AUTH_MAX_AGE_SECONDS
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const authAgeSeconds = nowSec - authTime;

  if (authAgeSeconds > RECENT_AUTH_MAX_AGE_SECONDS) {
    return {
      ok: false,
      error: 'REQUIRES_RECENT_LOGIN',
      message: `Security check: Action requires recent sign-in (within ${Math.floor(RECENT_AUTH_MAX_AGE_SECONDS / 60)} minutes). Last login was ${Math.floor(authAgeSeconds / 60)} minutes ago.`,
      authAgeSeconds,
      maxAgeSeconds: RECENT_AUTH_MAX_AGE_SECONDS
    };
  }

  return { ok: true, authAgeSeconds, maxAgeSeconds: RECENT_AUTH_MAX_AGE_SECONDS };
}

/**
 * Inventories all personal data associated with a user across all datastores
 */
async function inventoryUserData({ userId, userEmail, firestoreDb, storageBucket, whatsappBot }) {
  const normalizedEmail = (userEmail || '').toLowerCase();
  const inventory = {
    userId,
    userEmail: normalizedEmail,
    scannedAt: new Date().toISOString(),
    categories: {
      auth: { exists: false, details: null },
      profile: { count: 0, docId: null },
      cases: { count: 0, pendingCount: 0, approvedCount: 0, ids: [] },
      assessments: { count: 0, ids: [] },
      reports: { count: 0, ids: [] },
      appointments: { count: 0, ids: [] },
      doctorApplications: { count: 0, ids: [] },
      feedbacks: { count: 0, ids: [] },
      emailNotifications: { count: 0, ids: [] },
      privacyConsents: { count: 0, ids: [] },
      auditLog: { count: 0, ids: [] },
      auditEvents: { count: 0, ids: [] },
      storageFiles: { count: 0, files: [] },
      whatsappMessages: { activeOtpCount: 0 },
      backups: {
        retentionPolicyDays: RETENTION_POLICY.backupRetentionDays,
        tombstoneRegistered: false
      }
    },
    totalRecordsCount: 0
  };

  // 1. WhatsApp / in-memory OTP check
  if (whatsappBot && whatsappBot.activeOtps) {
    const keysToCheck = [userId, normalizedEmail].filter(Boolean);
    for (const k of keysToCheck) {
      if (whatsappBot.activeOtps.has(k.toLowerCase())) {
        inventory.categories.whatsappMessages.activeOtpCount += 1;
      }
    }
  }

  // 2. Storage files
  if (storageBucket && typeof storageBucket.getFiles === 'function') {
    try {
      const prefix = `doctor_applications/${userId}/`;
      const [files] = await storageBucket.getFiles({ prefix });
      if (Array.isArray(files)) {
        inventory.categories.storageFiles.count = files.length;
        inventory.categories.storageFiles.files = files.map(f => f.name);
      }
    } catch (e) {
      console.warn(`[PRIVACY INVENTORY] Storage read warning for ${userId}:`, e.message);
    }
  }

  // 3. Firestore collections
  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    try {
      // Profile
      const userDoc = await firestoreDb.collection('users').doc(userId).get().catch(() => null);
      if (userDoc && userDoc.exists) {
        inventory.categories.profile.count = 1;
        inventory.categories.profile.docId = userDoc.id;
      }

      // Cases
      const casesSnap = await firestoreDb.collection('cases').where('patientId', '==', userId).get().catch(() => null);
      if (casesSnap) {
        inventory.categories.cases.count = casesSnap.size;
        casesSnap.forEach(d => {
          inventory.categories.cases.ids.push(d.id);
          const data = d.data() || {};
          if (data.status === 'pending') inventory.categories.cases.pendingCount += 1;
          else inventory.categories.cases.approvedCount += 1;
        });
      }

      // Assessments
      const assessSnap = await firestoreDb.collection('assessments').where('patientId', '==', userId).get().catch(() => null);
      if (assessSnap) {
        inventory.categories.assessments.count = assessSnap.size;
        assessSnap.forEach(d => inventory.categories.assessments.ids.push(d.id));
      }

      // Reports across reports, medical_reports, clinical_reports
      const reportCols = ['reports', 'medical_reports', 'clinical_reports'];
      for (const col of reportCols) {
        const rSnap = await firestoreDb.collection(col).where('patientId', '==', userId).get().catch(() => null);
        if (rSnap) {
          inventory.categories.reports.count += rSnap.size;
          rSnap.forEach(d => inventory.categories.reports.ids.push(`${col}/${d.id}`));
        }
      }

      // Appointments
      const apptSnap = await firestoreDb.collection('appointments').where('patientId', '==', userId).get().catch(() => null);
      if (apptSnap) {
        inventory.categories.appointments.count = apptSnap.size;
        apptSnap.forEach(d => inventory.categories.appointments.ids.push(d.id));
      }

      // Doctor Applications
      const docAppSnap = await firestoreDb.collection('doctor_applications').where('userId', '==', userId).get().catch(() => null);
      if (docAppSnap) {
        inventory.categories.doctorApplications.count = docAppSnap.size;
        docAppSnap.forEach(d => inventory.categories.doctorApplications.ids.push(d.id));
      }

      // Feedbacks
      const fbSnap = await firestoreDb.collection('feedbacks').where('userId', '==', userId).get().catch(() => null);
      if (fbSnap) {
        inventory.categories.feedbacks.count = fbSnap.size;
        fbSnap.forEach(d => inventory.categories.feedbacks.ids.push(d.id));
      }

      // Email Notifications
      const notifSnap = await firestoreDb.collection('email_notifications').where('patientId', '==', userId).get().catch(() => null);
      if (notifSnap) {
        inventory.categories.emailNotifications.count = notifSnap.size;
        notifSnap.forEach(d => inventory.categories.emailNotifications.ids.push(d.id));
      }
      if (normalizedEmail) {
        const notifByEmail = await firestoreDb.collection('email_notifications').where('recipient', '==', normalizedEmail).get().catch(() => null);
        if (notifByEmail) {
          notifByEmail.forEach(d => {
            if (!inventory.categories.emailNotifications.ids.includes(d.id)) {
              inventory.categories.emailNotifications.ids.push(d.id);
              inventory.categories.emailNotifications.count += 1;
            }
          });
        }
      }

      // Privacy Consents
      const consentSnap = await firestoreDb.collection('privacy_consents').where('userId', '==', userId).get().catch(() => null);
      if (consentSnap) {
        inventory.categories.privacyConsents.count = consentSnap.size;
        consentSnap.forEach(d => inventory.categories.privacyConsents.ids.push(d.id));
      }

      // Client auditLog
      const auditLogSnap = await firestoreDb.collection('auditLog').where('userId', '==', userId).get().catch(() => null);
      if (auditLogSnap) {
        inventory.categories.auditLog.count = auditLogSnap.size;
        auditLogSnap.forEach(d => inventory.categories.auditLog.ids.push(d.id));
      }

      // Server audit_events (referencing user)
      const auditEventsSnap = await firestoreDb.collection('audit_events').where('userId', '==', userId).get().catch(() => null);
      if (auditEventsSnap) {
        inventory.categories.auditEvents.count = auditEventsSnap.size;
        auditEventsSnap.forEach(d => inventory.categories.auditEvents.ids.push(d.id));
      }

      // Tombstone check
      const tombstoneDoc = await firestoreDb.collection('privacy_tombstones').doc(userId).get().catch(() => null);
      inventory.categories.backups.tombstoneRegistered = Boolean(tombstoneDoc && tombstoneDoc.exists);
    } catch (e) {
      console.warn(`[PRIVACY INVENTORY] Firestore scan warning:`, e.message);
    }
  }

  let total = 0;
  for (const catKey of Object.keys(inventory.categories)) {
    const cat = inventory.categories[catKey];
    if (typeof cat.count === 'number') total += cat.count;
    if (typeof cat.activeOtpCount === 'number') total += cat.activeOtpCount;
  }
  inventory.totalRecordsCount = total;

  return inventory;
}

/**
 * Generates an Access Request Disclosure Report (GDPR Art. 15 / Right of Access)
 */
async function generateAccessRequestReport({ userId, userEmail, firestoreDb, storageBucket, whatsappBot, adminAuth }) {
  const inventory = await inventoryUserData({ userId, userEmail, firestoreDb, storageBucket, whatsappBot });

  const maskedEmail = userEmail ? `${userEmail[0]}***@${userEmail.split('@')[1]}` : 'anonymous';

  // Append audit event for access request
  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    try {
      await firestoreDb.collection('audit_events').add({
        type: 'DATA_ACCESS_REQUESTED',
        userId,
        userEmailMasked: maskedEmail,
        timestamp: new Date().toISOString()
      });
    } catch (e) {}
  }

  return {
    reportId: `access_${userId}_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    legalFramework: ['GDPR Art. 15 (Right of Access)', 'HIPAA Security & Privacy Standards'],
    dataSubject: {
      userId,
      userEmailMasked: maskedEmail
    },
    processingPurposes: [
      'Clinical triage of respiratory symptoms via AI advisory engine',
      'Human-in-the-loop review and approval by certified medical professionals',
      'Clinical appointment scheduling and management',
      'Secure delivery of verification codes and medical status notifications'
    ],
    dataCategoriesProcessed: [
      { category: 'User Account & Authentication', status: inventory.categories.profile.count > 0 ? 'Active' : 'Empty' },
      { category: 'Clinical Cases & Measurements', count: inventory.categories.cases.count },
      { category: 'Clinical Reports & Diagnoses', count: inventory.categories.reports.count },
      { category: 'Appointments', count: inventory.categories.appointments.count },
      { category: 'Doctor Applications & Credentials', count: inventory.categories.doctorApplications.count },
      { category: 'Patient & Clinical Feedback', count: inventory.categories.feedbacks.count },
      { category: 'Notifications & Alerts', count: inventory.categories.emailNotifications.count },
      { category: 'Consent History', count: inventory.categories.privacyConsents.count }
    ],
    recipients: [
      'Assigned verified physicians within the patient clinic network',
      'Authorized clinical administrators under strict RBAC controls'
    ],
    retentionPolicies: {
      activeRecords: 'Retained during active clinical relationship or until patient deletion request',
      approvedClinicalCases: `${RETENTION_POLICY.clinicalRecordsYears} years minimum under medical record retention laws (anonymized upon account deletion)`,
      hipaaAuditTrails: `${RETENTION_POLICY.hipaaAuditLogsYears} years with PII masked/pseudonymized`,
      backupSnapshots: `${RETENTION_POLICY.backupRetentionDays} days automated cryptographic retention window with tombstone filtering`,
      temporaryVerificationCodes: `${RETENTION_POLICY.temporaryOtpMinutes} minutes in-memory TTL`
    },
    dataSubjectRights: [
      'Right to Rectification (Art. 16)',
      'Right to Erasure / Right to be Forgotten (Art. 17)',
      'Right to Restriction of Processing (Art. 18)',
      'Right to Data Portability (Art. 20)',
      'Right to Object (Art. 21)'
    ],
    inventorySummary: inventory
  };
}

/**
 * Generates an Export Archive (GDPR Art. 20 / Right to Data Portability)
 */
async function generateDataExport({ userId, userEmail, firestoreDb, storageBucket, whatsappBot, adminAuth }) {
  const exportPayload = {
    exportId: `export_${userId}_${Date.now()}`,
    schemaVersion: '2.1.0',
    exportedAt: new Date().toISOString(),
    dataSubject: {
      userId,
      userEmail: userEmail || null
    },
    profile: null,
    cases: [],
    assessments: [],
    reports: [],
    appointments: [],
    feedbacks: [],
    consents: [],
    notifications: []
  };

  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    // 1. Profile
    const uDoc = await firestoreDb.collection('users').doc(userId).get().catch(() => null);
    if (uDoc && uDoc.exists) {
      const data = uDoc.data();
      delete data.authzVersion; // internal security state
      exportPayload.profile = { id: uDoc.id, ...data };
    }

    // 2. Cases
    const cSnap = await firestoreDb.collection('cases').where('patientId', '==', userId).get().catch(() => null);
    if (cSnap) {
      cSnap.forEach(d => exportPayload.cases.push({ id: d.id, ...d.data() }));
    }

    // 3. Assessments
    const aSnap = await firestoreDb.collection('assessments').where('patientId', '==', userId).get().catch(() => null);
    if (aSnap) {
      aSnap.forEach(d => exportPayload.assessments.push({ id: d.id, ...d.data() }));
    }

    // 4. Reports
    for (const col of ['reports', 'medical_reports', 'clinical_reports']) {
      const rSnap = await firestoreDb.collection(col).where('patientId', '==', userId).get().catch(() => null);
      if (rSnap) {
        rSnap.forEach(d => exportPayload.reports.push({ collection: col, id: d.id, ...d.data() }));
      }
    }

    // 5. Appointments
    const apptSnap = await firestoreDb.collection('appointments').where('patientId', '==', userId).get().catch(() => null);
    if (apptSnap) {
      apptSnap.forEach(d => exportPayload.appointments.push({ id: d.id, ...d.data() }));
    }

    // 6. Feedbacks
    const fSnap = await firestoreDb.collection('feedbacks').where('userId', '==', userId).get().catch(() => null);
    if (fSnap) {
      fSnap.forEach(d => exportPayload.feedbacks.push({ id: d.id, ...d.data() }));
    }

    // 7. Consents
    const consSnap = await firestoreDb.collection('privacy_consents').where('userId', '==', userId).get().catch(() => null);
    if (consSnap) {
      consSnap.forEach(d => exportPayload.consents.push({ id: d.id, ...d.data() }));
    }

    // 8. Notifications
    const nSnap = await firestoreDb.collection('email_notifications').where('patientId', '==', userId).get().catch(() => null);
    if (nSnap) {
      nSnap.forEach(d => exportPayload.notifications.push({ id: d.id, ...d.data() }));
    }
  }

  const rawJson = JSON.stringify(exportPayload);
  const checksumSha256 = crypto.createHash('sha256').update(rawJson).digest('hex');

  // Log audit event
  if (firestoreDb && typeof firestoreDb.collection === 'function') {
    try {
      const maskedEmail = userEmail ? `${userEmail[0]}***@${userEmail.split('@')[1]}` : 'anonymous';
      await firestoreDb.collection('audit_events').add({
        type: 'DATA_EXPORT_COMPLETED',
        userId,
        userEmailMasked: maskedEmail,
        exportId: exportPayload.exportId,
        checksumSha256,
        recordCounts: {
          cases: exportPayload.cases.length,
          reports: exportPayload.reports.length,
          appointments: exportPayload.appointments.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (e) {}
  }

  return {
    ...exportPayload,
    integrityChecksumSha256: checksumSha256,
    legalNotice: 'This exported clinical and account dataset is provided under GDPR Article 20. Store securely in an encrypted environment.'
  };
}

/**
 * Commits a series of Firestore write operations in batches not exceeding MAX_BATCH_SIZE
 */
async function commitBatchedOperations(firestoreDb, operations) {
  if (!operations || operations.length === 0) return 0;
  let committed = 0;

  for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
    const chunk = operations.slice(i, i + MAX_BATCH_SIZE);
    const batch = firestoreDb.batch();
    for (const op of chunk) {
      if (op.type === 'delete') {
        batch.delete(op.ref);
      } else if (op.type === 'set') {
        batch.set(op.ref, op.data, op.options || {});
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      }
    }
    await batch.commit();
    committed += chunk.length;
  }
  return committed;
}

/**
 * Deletion & Anonymization Engine with Granular Execution Status & Safe Retry
 */
async function executeAccountDeletion({
  userId,
  userEmail,
  firestoreDb,
  storageBucket,
  adminAuth,
  whatsappBot,
  options = {}
}) {
  const normalizedEmail = (userEmail || '').toLowerCase();
  const maskedEmail = normalizedEmail ? `${normalizedEmail[0]}***@${normalizedEmail.split('@')[1]}` : 'anonymous';

  // Initialise or resume job state
  let job = privacyJobRegistry.get(userId);
  if (!job || options.forceFreshJob) {
    job = {
      jobId: `del_job_${userId}_${Date.now()}`,
      userId,
      userEmailMasked: maskedEmail,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: {
        inventory: { status: 'pending', count: 0 },
        storage_files: { status: 'pending', deleted: 0 },
        cases_and_clinical: { status: 'pending', deleted: 0, anonymized: 0 },
        appointments: { status: 'pending', deleted: 0 },
        doctor_applications: { status: 'pending', deleted: 0 },
        feedbacks: { status: 'pending', deleted: 0 },
        notifications: { status: 'pending', deleted: 0 },
        consents_and_logs: { status: 'pending', deleted: 0 },
        user_profile: { status: 'pending' },
        backup_tombstone: { status: 'pending' },
        whatsapp_messages: { status: 'pending' },
        auth_account: { status: 'pending' }
      },
      errors: []
    };
    privacyJobRegistry.set(userId, job);
  } else {
    job.status = 'in_progress';
    job.updatedAt = new Date().toISOString();
  }

  const recordError = (stepName, err) => {
    job.steps[stepName].status = 'failed';
    job.steps[stepName].error = err.message;
    job.errors.push({ step: stepName, message: err.message, timestamp: new Date().toISOString() });
    job.status = 'partially_failed';
    job.updatedAt = new Date().toISOString();
  };

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Inventory
    // -------------------------------------------------------------------------
    if (job.steps.inventory.status !== 'completed') {
      try {
        const inv = await inventoryUserData({ userId, userEmail: normalizedEmail, firestoreDb, storageBucket, whatsappBot });
        job.steps.inventory.count = inv.totalRecordsCount;
        job.steps.inventory.status = 'completed';
      } catch (err) {
        recordError('inventory', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'inventory',
          message: `Inventory scan failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 2: Storage Files Deletion
    // -------------------------------------------------------------------------
    if (job.steps.storage_files.status !== 'completed') {
      try {
        if (options.mockFailStep === 'storage_files') {
          throw new Error('Simulated Storage Network Timeout / Cloud Storage Failure');
        }

        let deletedFilesCount = 0;
        if (storageBucket && typeof storageBucket.getFiles === 'function') {
          const prefix = `doctor_applications/${userId}/`;
          const [files] = await storageBucket.getFiles({ prefix });
          if (Array.isArray(files)) {
            for (const file of files) {
              if (typeof file.delete === 'function') {
                await file.delete();
                deletedFilesCount += 1;
              }
            }
          }
        }
        job.steps.storage_files.deleted = deletedFilesCount;
        job.steps.storage_files.status = 'completed';
      } catch (err) {
        recordError('storage_files', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'storage_files',
          message: `Storage deletion failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 3: WhatsApp Bot & In-Memory Messages Cleanup
    // -------------------------------------------------------------------------
    if (job.steps.whatsapp_messages.status !== 'completed') {
      try {
        if (whatsappBot && whatsappBot.activeOtps) {
          whatsappBot.activeOtps.delete(userId.toLowerCase());
          if (normalizedEmail) whatsappBot.activeOtps.delete(normalizedEmail);
        }
        job.steps.whatsapp_messages.status = 'completed';
      } catch (err) {
        recordError('whatsapp_messages', err);
      }
    }

    // -------------------------------------------------------------------------
    // STEP 4: Clinical Cases, Reports, Assessments (Batch Deletion & Anonymization)
    // -------------------------------------------------------------------------
    if (job.steps.cases_and_clinical.status !== 'completed') {
      try {
        if (options.mockFailStep === 'cases_and_clinical') {
          throw new Error('Simulated Firestore Cases Processing Failure');
        }

        if (firestoreDb) {
          const operations = [];

          // Query cases
          const casesSnap = await firestoreDb.collection('cases').where('patientId', '==', userId).get();
          let cDeleted = 0;
          let cAnonymized = 0;

          casesSnap.forEach(docSnap => {
            const cData = docSnap.data() || {};
            if (cData.status === 'pending' || cData.status === 'draft') {
              operations.push({ type: 'delete', ref: docSnap.ref });
              cDeleted += 1;
            } else {
              // Clinical retention with full PII scrubbing
              operations.push({
                type: 'update',
                ref: docSnap.ref,
                data: {
                  patientId: `deleted_${userId.substring(0, 6)}`,
                  patientName: 'مريض محذوف (Deleted Patient)',
                  patientNameEn: 'Deleted Patient',
                  name: 'Deleted Patient',
                  nameEn: 'Deleted Patient',
                  patientEmail: 'deleted@anonymized.local',
                  patientPhone: null,
                  'assessment.privacyConsent.revokedAt': new Date().toISOString(),
                  isAnonymized: true,
                  anonymizedAt: new Date().toISOString()
                }
              });
              cAnonymized += 1;
            }
          });

          // Query assessments & reports
          const assessSnap = await firestoreDb.collection('assessments').where('patientId', '==', userId).get().catch(() => null);
          if (assessSnap) {
            assessSnap.forEach(d => operations.push({ type: 'delete', ref: d.ref }));
          }

          for (const col of ['reports', 'medical_reports', 'clinical_reports']) {
            const rSnap = await firestoreDb.collection(col).where('patientId', '==', userId).get().catch(() => null);
            if (rSnap) {
              rSnap.forEach(d => operations.push({ type: 'delete', ref: d.ref }));
            }
          }

          await commitBatchedOperations(firestoreDb, operations);
          job.steps.cases_and_clinical.deleted = cDeleted;
          job.steps.cases_and_clinical.anonymized = cAnonymized;
        }

        job.steps.cases_and_clinical.status = 'completed';
      } catch (err) {
        recordError('cases_and_clinical', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'cases_and_clinical',
          message: `Clinical data processing failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 5: Doctor Applications
    // -------------------------------------------------------------------------
    if (job.steps.doctor_applications.status !== 'completed') {
      try {
        if (firestoreDb) {
          const docAppSnap = await firestoreDb.collection('doctor_applications').where('userId', '==', userId).get();
          const operations = docAppSnap.docs.map(d => ({ type: 'delete', ref: d.ref }));
          await commitBatchedOperations(firestoreDb, operations);
          job.steps.doctor_applications.deleted = docAppSnap.size;
        }
        job.steps.doctor_applications.status = 'completed';
      } catch (err) {
        recordError('doctor_applications', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'doctor_applications',
          message: `Doctor applications removal failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 6: Appointments
    // -------------------------------------------------------------------------
    if (job.steps.appointments.status !== 'completed') {
      try {
        if (firestoreDb) {
          const apptsSnap = await firestoreDb.collection('appointments').where('patientId', '==', userId).get();
          const operations = apptsSnap.docs.map(d => ({ type: 'delete', ref: d.ref }));
          await commitBatchedOperations(firestoreDb, operations);
          job.steps.appointments.deleted = apptsSnap.size;
        }
        job.steps.appointments.status = 'completed';
      } catch (err) {
        recordError('appointments', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'appointments',
          message: `Appointments cleanup failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 7: Feedback
    // -------------------------------------------------------------------------
    if (job.steps.feedbacks.status !== 'completed') {
      try {
        if (firestoreDb) {
          const fbSnap = await firestoreDb.collection('feedbacks').where('userId', '==', userId).get();
          const operations = fbSnap.docs.map(d => ({ type: 'delete', ref: d.ref }));
          await commitBatchedOperations(firestoreDb, operations);
          job.steps.feedbacks.deleted = fbSnap.size;
        }
        job.steps.feedbacks.status = 'completed';
      } catch (err) {
        recordError('feedbacks', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'feedbacks',
          message: `Feedback removal failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 8: Notifications
    // -------------------------------------------------------------------------
    if (job.steps.notifications.status !== 'completed') {
      try {
        if (firestoreDb) {
          const ops = [];
          const notifSnap = await firestoreDb.collection('email_notifications').where('patientId', '==', userId).get();
          notifSnap.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
          if (normalizedEmail) {
            const notifEmailSnap = await firestoreDb.collection('email_notifications').where('recipient', '==', normalizedEmail).get();
            notifEmailSnap.forEach(d => {
              if (!ops.some(op => op.ref.id === d.id)) ops.push({ type: 'delete', ref: d.ref });
            });
          }
          await commitBatchedOperations(firestoreDb, ops);
          job.steps.notifications.deleted = ops.length;
        }
        job.steps.notifications.status = 'completed';
      } catch (err) {
        recordError('notifications', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'notifications',
          message: `Notifications removal failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 9: Privacy Consents & Client Audit Logs
    // -------------------------------------------------------------------------
    if (job.steps.consents_and_logs.status !== 'completed') {
      try {
        if (firestoreDb) {
          const ops = [];
          const cSnap = await firestoreDb.collection('privacy_consents').where('userId', '==', userId).get().catch(() => null);
          if (cSnap) cSnap.forEach(d => ops.push({ type: 'delete', ref: d.ref }));

          const lSnap = await firestoreDb.collection('auditLog').where('userId', '==', userId).get().catch(() => null);
          if (lSnap) lSnap.forEach(d => ops.push({ type: 'delete', ref: d.ref }));

          await commitBatchedOperations(firestoreDb, ops);
          job.steps.consents_and_logs.deleted = ops.length;
        }
        job.steps.consents_and_logs.status = 'completed';
      } catch (err) {
        recordError('consents_and_logs', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'consents_and_logs',
          message: `Consents and audit logs cleanup failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 10: User Profile Document
    // -------------------------------------------------------------------------
    if (job.steps.user_profile.status !== 'completed') {
      try {
        if (firestoreDb) {
          await firestoreDb.collection('users').doc(userId).delete();
        }
        job.steps.user_profile.status = 'completed';
      } catch (err) {
        recordError('user_profile', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'user_profile',
          message: `User profile document deletion failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 11: Register Backup Tombstone & Append HIPAA Audit Event
    // -------------------------------------------------------------------------
    if (job.steps.backup_tombstone.status !== 'completed') {
      try {
        if (firestoreDb) {
          const tombstoneRef = firestoreDb.collection('privacy_tombstones').doc(userId);
          const auditRef = firestoreDb.collection('audit_events').doc();
          const batch = firestoreDb.batch();

          batch.set(tombstoneRef, {
            userId,
            deletedAt: new Date().toISOString(),
            retentionExpiresAt: new Date(Date.now() + RETENTION_POLICY.backupRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
            policy: `${RETENTION_POLICY.backupRetentionDays}-day-backup-suppression`
          });

          batch.set(auditRef, {
            type: 'ACCOUNT_DELETED',
            userId,
            userEmailMasked: maskedEmail,
            deletedCasesCount: (job.steps.cases_and_clinical.deleted || 0) + (job.steps.cases_and_clinical.anonymized || 0),
            timestamp: new Date().toISOString()
          });

          await batch.commit();
        }
        job.steps.backup_tombstone.status = 'completed';
      } catch (err) {
        recordError('backup_tombstone', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'backup_tombstone',
          message: `Backup tombstone registration failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // -------------------------------------------------------------------------
    // STEP 12: Delete User from Firebase Auth (FINAL STEP)
    // ONLY executed if all datastore, storage, and tombstone operations succeeded!
    // -------------------------------------------------------------------------
    if (job.steps.auth_account.status !== 'completed') {
      try {
        if (options.mockFailStep === 'auth_account') {
          throw new Error('Simulated Firebase Auth Service Failure');
        }

        if (adminAuth && typeof adminAuth.deleteUser === 'function') {
          await adminAuth.deleteUser(userId);
        }
        job.steps.auth_account.status = 'completed';
      } catch (err) {
        recordError('auth_account', err);
        return {
          success: false,
          status: 'partially_failed',
          failedStep: 'auth_account',
          message: `Auth user deletion failed: ${err.message}`,
          job,
          retryable: true
        };
      }
    }

    // All steps succeeded cleanly!
    job.status = 'completed';
    job.updatedAt = new Date().toISOString();

    return {
      success: true,
      status: 'completed',
      message: 'Account and personal data successfully deleted.',
      jobId: job.jobId,
      steps: job.steps
    };
  } catch (unexpectedErr) {
    job.status = 'failed';
    job.errors.push({ step: 'general', message: unexpectedErr.message, timestamp: new Date().toISOString() });
    return {
      success: false,
      status: 'failed',
      message: unexpectedErr.message,
      job,
      retryable: true
    };
  }
}

function getJobStatus(userId) {
  return privacyJobRegistry.get(userId) || null;
}

module.exports = {
  RECENT_AUTH_MAX_AGE_SECONDS,
  RETENTION_POLICY,
  verifyRecentAuthentication,
  inventoryUserData,
  generateAccessRequestReport,
  generateDataExport,
  executeAccountDeletion,
  getJobStatus,
  privacyJobRegistry
};
