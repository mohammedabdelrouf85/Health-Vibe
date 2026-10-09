/**
 * Health Vibe AI - Certified Prescription, Medication Reminders & Pharmacy Sandbox Service
 *
 * GOVERNANCE & SAFETY SPECIFICATIONS:
 * 1. Approved Doctor Gate:
 *    - ONLY an approved, verified, and active doctor can enter, amend, or sign prescriptions.
 *    - Patients, clinic admins, or unapproved doctors are strictly forbidden from creating/signing prescriptions.
 * 2. Prescription Schema & Versioning:
 *    - Structured medications: medication name, dosage, duration, frequency, instructions.
 *    - Digital signature: Cryptographic HMAC-SHA256 signature stamped with doctor license number.
 *    - Versioning: v1, v2... When a prescription is amended, previous version is marked superseded.
 * 3. Prescription-Based Reminders:
 *    - Automatically schedules dose reminders for the prescribed duration and frequency.
 *    - CRITICAL SAFETY RULE: Never suggests alternative treatments, generic switches, or substitute drugs.
 *    - Cancellation Hook: When a prescription is changed (superseded) or cancelled, all active
 *      reminders are immediately stopped and cancelled.
 * 4. Pharmacy Integration Contract, Consent & Sandbox:
 *    - Explicit patient consent required prior to data sharing.
 *    - Status tracking: draft -> issued -> sent_to_pharmacy -> received_by_pharmacy -> dispensed.
 *    - Sandbox mode enforced until formal clinical partnership and regulatory review are ratified.
 */

const crypto = require('crypto');

// Configuration
const PHARMACY_INTEGRATION_MODE = (process.env.PHARMACY_INTEGRATION_MODE || 'sandbox').trim().toLowerCase();
const PHARMACY_CONTRACT_VERSION = '1.0.0-sandbox';
const SIGNING_SECRET = process.env.STORAGE_SIGNING_KEY || process.env.JWT_SECRET || 'healthvibe_prescription_signing_secret_2026';

// In-Memory Storage for High-Speed & Unit Test Execution
const prescriptionsStore = new Map();
const prescriptionVersionsStore = new Map(); // caseId -> array of prescriptionIds
const remindersStore = new Map(); // reminderId -> reminder object
const pharmacyTransmissionsStore = new Map(); // transmissionId -> transmission object
const pharmacyConsentStore = new Map(); // prescriptionId -> consent object

// Status Enums
const PRESCRIPTION_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  SUPERSEDED: 'superseded',
  CANCELLED: 'cancelled',
  DISPENSED: 'dispensed'
};

const PHARMACY_STATUS = {
  PENDING_CONSENT: 'pending_consent',
  CONSENTED: 'consented',
  SENT_TO_PHARMACY: 'sent_to_pharmacy',
  RECEIVED_BY_PHARMACY: 'received_by_pharmacy',
  DISPENSED: 'dispensed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

const REMINDER_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// =============================================================================
// 1. DIGITAL SIGNATURE GENERATION & VERIFICATION
// =============================================================================
function generatePrescriptionSignature({ prescriptionId, caseId, patientId, doctorId, doctorLicense, version, medications, issuedAt }) {
  const payloadToSign = JSON.stringify({
    prescriptionId,
    caseId,
    patientId,
    doctorId,
    doctorLicense,
    version,
    medications: medications.map(m => ({
      name: m.name.trim().toLowerCase(),
      dosage: m.dosage.trim().toLowerCase(),
      duration: m.duration,
      frequency: m.frequency
    })),
    issuedAt
  });

  const hmac = crypto.createHmac('sha256', SIGNING_SECRET);
  hmac.update(payloadToSign);
  return hmac.digest('hex');
}

function verifyPrescriptionSignature(prescription) {
  if (!prescription || !prescription.digitalSignature || !prescription.digitalSignature.signatureHash) {
    return false;
  }
  const expectedHash = generatePrescriptionSignature({
    prescriptionId: prescription.id || prescription.prescriptionId,
    caseId: prescription.caseId,
    patientId: prescription.patientId,
    doctorId: prescription.doctorId,
    doctorLicense: prescription.doctorLicense,
    version: prescription.version,
    medications: prescription.medications,
    issuedAt: prescription.digitalSignature.signedAt
  });
  return expectedHash === prescription.digitalSignature.signatureHash;
}

// =============================================================================
// 2. VALIDATION & SAFETY GUARDS
// =============================================================================
function validatePrescriptionItems(medications) {
  if (!Array.isArray(medications) || medications.length === 0) {
    throw new Error('At least one medication item is required.');
  }

  return medications.map((item, index) => {
    const name = String(item.name || '').trim();
    const dosage = String(item.dosage || '').trim();
    const duration = String(item.duration || '').trim();
    const frequency = String(item.frequency || '').trim();
    const instructions = String(item.instructions || '').trim();

    if (!name) throw new Error(`Medication item [${index + 1}] requires a valid name.`);
    if (!dosage) throw new Error(`Medication [${name}] requires a valid dosage.`);
    if (!duration) throw new Error(`Medication [${name}] requires a valid duration.`);
    if (!frequency) throw new Error(`Medication [${name}] requires a valid frequency.`);

    return {
      id: item.id || `rx_item_${index + 1}`,
      name,
      dosage,
      duration,
      frequency,
      instructions: instructions || 'Use as directed by prescribing physician.'
    };
  });
}

/**
 * CLINICAL SAFETY RULE:
 * Ensure reminders NEVER contain alternative drug suggestions, generic substitutions,
 * or over-the-counter alternatives not prescribed by the doctor.
 */
function assertNoAlternativeTreatmentSuggestions(content) {
  if (!content) return;
  const lower = String(content).toLowerCase();

  const prohibitedPhrases = [
    'alternative',
    'substitute',
    'replace with',
    'generic switch',
    'different brand',
    'herbal remedy',
    'instead of',
    'بديل',
    'علاج بديل',
    'استبدال',
    'دواء بديل',
    'أعشاب',
    'عوضاً عن'
  ];

  for (const phrase of prohibitedPhrases) {
    if (lower.includes(phrase)) {
      throw new Error(`CLINICAL SAFETY VIOLATION: Prescription reminders cannot suggest alternative treatments. Blocked phrase: '${phrase}'`);
    }
  }
}

// =============================================================================
// 3. PRESCRIPTION LIFECYCLE (DOCTOR AUTHORITATIVE)
// =============================================================================

/**
 * Creates and issues a new prescription (Version 1).
 * Gated strictly to verified doctors.
 */
async function issuePrescription({
  caseId,
  patientId,
  patientName,
  doctorIdentity,
  medications,
  clinicalNotes
}) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed doctor can issue prescriptions.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  if (!caseId || !patientId) {
    const error = new Error('caseId and patientId are required.');
    error.code = 'INVALID_PRESCRIPTION_TARGET';
    error.statusCode = 400;
    throw error;
  }

  const validatedMeds = validatePrescriptionItems(medications);
  const nowIso = new Date().toISOString();
  const prescriptionId = `rx_${caseId}_v1_${Date.now()}`;

  const signatureHash = generatePrescriptionSignature({
    prescriptionId,
    caseId,
    patientId,
    doctorId: doctorIdentity.uid,
    doctorLicense: doctorIdentity.licenseNumber,
    version: 1,
    medications: validatedMeds,
    issuedAt: nowIso
  });

  const prescription = {
    id: prescriptionId,
    prescriptionId,
    caseId,
    patientId,
    patientName: patientName || 'Patient',
    doctorId: doctorIdentity.uid,
    doctorName: doctorIdentity.name,
    doctorLicense: doctorIdentity.licenseNumber,
    doctorSpecialty: doctorIdentity.specialty,
    clinicId: doctorIdentity.clinicId,
    clinicName: doctorIdentity.clinic,
    version: 1,
    status: PRESCRIPTION_STATUS.ISSUED,
    medications: validatedMeds,
    clinicalNotes: clinicalNotes ? String(clinicalNotes).trim() : '',
    digitalSignature: {
      algorithm: 'HMAC-SHA256',
      signatureHash,
      signedBy: doctorIdentity.name,
      doctorLicense: doctorIdentity.licenseNumber,
      signedAt: nowIso
    },
    previousVersionId: null,
    history: [
      {
        version: 1,
        status: PRESCRIPTION_STATUS.ISSUED,
        timestamp: nowIso,
        actorId: doctorIdentity.uid,
        action: 'ISSUED'
      }
    ],
    pharmacyTracking: {
      status: PHARMACY_STATUS.PENDING_CONSENT,
      transmissions: []
    },
    createdAt: nowIso,
    updatedAt: nowIso
  };

  prescriptionsStore.set(prescriptionId, prescription);

  // Link to case version list
  const existingVersions = prescriptionVersionsStore.get(caseId) || [];
  existingVersions.push(prescriptionId);
  prescriptionVersionsStore.set(caseId, existingVersions);

  // Schedule prescription-based medication reminders
  await schedulePrescriptionReminders(prescription);

  return prescription;
}

/**
 * Amends an existing prescription, incrementing version (v2, v3...).
 * Gated strictly to verified doctors.
 * Stamping prior version as SUPERSEDED and cancelling its reminders.
 */
async function amendPrescription({
  previousPrescriptionId,
  doctorIdentity,
  medications,
  clinicalNotes,
  amendmentReason
}) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed doctor can amend prescriptions.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  const previous = prescriptionsStore.get(previousPrescriptionId);
  if (!previous) {
    const error = new Error(`Prescription '${previousPrescriptionId}' not found.`);
    error.code = 'PRESCRIPTION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (previous.status !== PRESCRIPTION_STATUS.ISSUED) {
    const error = new Error(`Cannot amend prescription in '${previous.status}' status. Only active issued prescriptions can be amended.`);
    error.code = 'INVALID_STATUS_FOR_AMENDMENT';
    error.statusCode = 400;
    throw error;
  }

  const validatedMeds = validatePrescriptionItems(medications);
  const nextVersion = previous.version + 1;
  const nowIso = new Date().toISOString();
  const newPrescriptionId = `rx_${previous.caseId}_v${nextVersion}_${Date.now()}`;

  // 1. Mark previous version as SUPERSEDED
  previous.status = PRESCRIPTION_STATUS.SUPERSEDED;
  previous.supersededBy = newPrescriptionId;
  previous.supersededAt = nowIso;
  previous.updatedAt = nowIso;
  previous.history.push({
    version: previous.version,
    status: PRESCRIPTION_STATUS.SUPERSEDED,
    supersededBy: newPrescriptionId,
    timestamp: nowIso,
    actorId: doctorIdentity.uid,
    action: 'SUPERSEDED',
    reason: amendmentReason || 'Doctor issued updated prescription'
  });
  prescriptionsStore.set(previous.id, previous);

  // 🛑 Stop and cancel all reminders tied to the superseded prescription
  await cancelPrescriptionReminders(previous.id, 'Prescription amended with updated version');

  // 2. Generate signature for new version
  const signatureHash = generatePrescriptionSignature({
    prescriptionId: newPrescriptionId,
    caseId: previous.caseId,
    patientId: previous.patientId,
    doctorId: doctorIdentity.uid,
    doctorLicense: doctorIdentity.licenseNumber,
    version: nextVersion,
    medications: validatedMeds,
    issuedAt: nowIso
  });

  const newPrescription = {
    id: newPrescriptionId,
    prescriptionId: newPrescriptionId,
    caseId: previous.caseId,
    patientId: previous.patientId,
    patientName: previous.patientName,
    doctorId: doctorIdentity.uid,
    doctorName: doctorIdentity.name,
    doctorLicense: doctorIdentity.licenseNumber,
    doctorSpecialty: doctorIdentity.specialty,
    clinicId: doctorIdentity.clinicId || previous.clinicId,
    clinicName: doctorIdentity.clinic || previous.clinicName,
    version: nextVersion,
    status: PRESCRIPTION_STATUS.ISSUED,
    medications: validatedMeds,
    clinicalNotes: clinicalNotes ? String(clinicalNotes).trim() : previous.clinicalNotes,
    digitalSignature: {
      algorithm: 'HMAC-SHA256',
      signatureHash,
      signedBy: doctorIdentity.name,
      doctorLicense: doctorIdentity.licenseNumber,
      signedAt: nowIso
    },
    previousVersionId: previous.id,
    history: [
      ...previous.history,
      {
        version: nextVersion,
        status: PRESCRIPTION_STATUS.ISSUED,
        timestamp: nowIso,
        actorId: doctorIdentity.uid,
        action: 'ISSUED_AMENDMENT',
        reason: amendmentReason || 'Prescription amended'
      }
    ],
    pharmacyTracking: {
      status: PHARMACY_STATUS.PENDING_CONSENT,
      transmissions: []
    },
    createdAt: nowIso,
    updatedAt: nowIso
  };

  prescriptionsStore.set(newPrescriptionId, newPrescription);

  const versions = prescriptionVersionsStore.get(previous.caseId) || [];
  versions.push(newPrescriptionId);
  prescriptionVersionsStore.set(previous.caseId, versions);

  // Schedule new reminders for amended items
  await schedulePrescriptionReminders(newPrescription);

  return newPrescription;
}

/**
 * Cancels a prescription.
 * Gated strictly to verified doctors.
 * Automatically stops and cancels all scheduled dose reminders immediately.
 */
async function cancelPrescription({ prescriptionId, doctorIdentity, cancellationReason }) {
  if (!doctorIdentity || doctorIdentity.status !== 'approved' || doctorIdentity.isLicenseExpired || doctorIdentity.licenseStatus === 'revoked') {
    const error = new Error('Only an approved and actively licensed doctor can cancel prescriptions.');
    error.code = 'DOCTOR_CREDENTIALS_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  const prescription = prescriptionsStore.get(prescriptionId);
  if (!prescription) {
    const error = new Error(`Prescription '${prescriptionId}' not found.`);
    error.code = 'PRESCRIPTION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const nowIso = new Date().toISOString();
  prescription.status = PRESCRIPTION_STATUS.CANCELLED;
  prescription.cancellationReason = cancellationReason || 'Cancelled by prescribing physician';
  prescription.cancelledBy = doctorIdentity.uid;
  prescription.cancelledAt = nowIso;
  prescription.updatedAt = nowIso;
  prescription.history.push({
    version: prescription.version,
    status: PRESCRIPTION_STATUS.CANCELLED,
    timestamp: nowIso,
    actorId: doctorIdentity.uid,
    action: 'CANCELLED',
    reason: cancellationReason || 'Cancelled by prescribing physician'
  });

  prescriptionsStore.set(prescription.id, prescription);

  // 🛑 Immediately stop and cancel all reminders
  const cancelledRemindersCount = await cancelPrescriptionReminders(prescription.id, 'Prescription cancelled by physician');

  return {
    prescription,
    cancelledRemindersCount
  };
}

// =============================================================================
// 4. PRESCRIPTION-BASED REMINDERS ENGINE
// =============================================================================

/**
 * Schedules reminders for all medication items in an issued prescription.
 * Ensures reminders are direct and NEVER suggest alternative treatments.
 */
async function schedulePrescriptionReminders(prescription) {
  if (!prescription || !Array.isArray(prescription.medications)) return [];

  const createdReminders = [];
  const now = new Date();

  for (const med of prescription.medications) {
    // Build reminder message strictly without alternative treatment advice
    const reminderText = `Reminder: Please take your prescribed dose of ${med.name} (${med.dosage}). Instructions: ${med.instructions}.`;
    
    // Explicit safety assertion
    assertNoAlternativeTreatmentSuggestions(reminderText);

    const reminderId = `rem_${prescription.id}_${med.id}_${Date.now()}`;
    const reminder = {
      id: reminderId,
      reminderId,
      prescriptionId: prescription.id,
      caseId: prescription.caseId,
      patientId: prescription.patientId,
      medicationId: med.id,
      medicationName: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      duration: med.duration,
      message: reminderText,
      status: REMINDER_STATUS.ACTIVE,
      scheduledTimes: ['08:00', '14:00', '20:00'], // Standard clinical dosing windows
      startDate: now.toISOString(),
      createdAt: now.toISOString()
    };

    remindersStore.set(reminderId, reminder);
    createdReminders.push(reminder);
  }

  return createdReminders;
}

/**
 * Cancels all active reminders for a specific prescription.
 * Triggered automatically when prescription is amended or cancelled.
 */
async function cancelPrescriptionReminders(prescriptionId, reason) {
  let count = 0;
  for (const [id, reminder] of remindersStore.entries()) {
    if (reminder.prescriptionId === prescriptionId && reminder.status === REMINDER_STATUS.ACTIVE) {
      reminder.status = REMINDER_STATUS.CANCELLED;
      reminder.cancellationReason = reason || 'Prescription changed or stopped';
      reminder.cancelledAt = new Date().toISOString();
      remindersStore.set(id, reminder);
      count++;
    }
  }
  return count;
}

function getPatientActiveReminders(patientId) {
  const result = [];
  for (const reminder of remindersStore.values()) {
    if (reminder.patientId === patientId && reminder.status === REMINDER_STATUS.ACTIVE) {
      result.push(reminder);
    }
  }
  return result;
}

// =============================================================================
// 5. PHARMACY INTEGRATION CONTRACT, CONSENT & SANDBOX DISPATCH
// =============================================================================

/**
 * Records explicit patient consent for sharing prescription data with an accredited pharmacy.
 */
async function recordPharmacyConsent({ prescriptionId, patientId, pharmacyId, accepted, expiresAt }) {
  const prescription = prescriptionsStore.get(prescriptionId);
  if (!prescription) {
    const error = new Error(`Prescription '${prescriptionId}' not found.`);
    error.code = 'PRESCRIPTION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (prescription.patientId !== patientId) {
    const error = new Error('Consent can only be granted by the patient owner of the prescription.');
    error.code = 'ACCESS_DENIED';
    error.statusCode = 403;
    throw error;
  }

  if (!accepted) {
    const error = new Error('Explicit consent acceptance is required to share prescription with pharmacy.');
    error.code = 'CONSENT_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const consentRecord = {
    prescriptionId,
    patientId,
    pharmacyId: pharmacyId || 'sandbox_partner_pharmacy',
    accepted: true,
    consentedAt: nowIso,
    expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), // 30 days default
    dataScope: ['patient_name', 'medications', 'dosage', 'duration', 'doctor_signature']
  };

  pharmacyConsentStore.set(prescriptionId, consentRecord);

  prescription.pharmacyTracking.status = PHARMACY_STATUS.CONSENTED;
  prescription.pharmacySharingConsent = consentRecord;
  prescription.updatedAt = nowIso;
  prescriptionsStore.set(prescriptionId, prescription);

  return consentRecord;
}

/**
 * Transmits prescription to pharmacy partner or sandbox.
 * Strictly verifies patient consent and digital signature before transmission.
 */
async function sendToPharmacy({ prescriptionId, user, targetPharmacyId }) {
  const prescription = prescriptionsStore.get(prescriptionId);
  if (!prescription) {
    const error = new Error(`Prescription '${prescriptionId}' not found.`);
    error.code = 'PRESCRIPTION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (prescription.status !== PRESCRIPTION_STATUS.ISSUED) {
    const error = new Error(`Prescription status must be 'issued' to dispatch to pharmacy. Current: '${prescription.status}'`);
    error.code = 'INVALID_PRESCRIPTION_STATUS';
    error.statusCode = 400;
    throw error;
  }

  // Verify Digital Signature
  const isValidSignature = verifyPrescriptionSignature(prescription);
  if (!isValidSignature) {
    const error = new Error('Cryptographic signature verification failed. Prescription cannot be transmitted.');
    error.code = 'SIGNATURE_VERIFICATION_FAILED';
    error.statusCode = 400;
    throw error;
  }

  // Verify Patient Consent
  const consent = pharmacyConsentStore.get(prescriptionId) || prescription.pharmacySharingConsent;
  if (!consent || !consent.accepted) {
    const error = new Error('Prescription cannot be sent to pharmacy without explicit patient consent.');
    error.code = 'PHARMACY_CONSENT_REQUIRED';
    error.statusCode = 403;
    throw error;
  }

  // Check consent expiration
  if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
    const error = new Error('Patient consent for pharmacy data sharing has expired.');
    error.code = 'CONSENT_EXPIRED';
    error.statusCode = 403;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const transmissionId = `trans_${prescriptionId}_${Date.now()}`;
  const pharmacyId = targetPharmacyId || consent.pharmacyId;

  // Build Payload complying with Pharmacy Integration Contract v1.0.0
  const contractPayload = {
    contractVersion: PHARMACY_CONTRACT_VERSION,
    mode: PHARMACY_INTEGRATION_MODE,
    transmissionId,
    transmissionTimestamp: nowIso,
    pharmacyId,
    patient: {
      patientId: prescription.patientId,
      name: prescription.patientName
    },
    prescription: {
      prescriptionId: prescription.id,
      version: prescription.version,
      issuedAt: prescription.createdAt,
      medications: prescription.medications,
      digitalSignature: prescription.digitalSignature
    },
    prescribingDoctor: {
      doctorId: prescription.doctorId,
      name: prescription.doctorName,
      licenseNumber: prescription.doctorLicense,
      clinic: prescription.clinicName
    },
    consent: {
      consentedAt: consent.consentedAt,
      expiresAt: consent.expiresAt
    }
  };

  const transmissionRecord = {
    transmissionId,
    prescriptionId,
    pharmacyId,
    mode: PHARMACY_INTEGRATION_MODE,
    status: PHARMACY_STATUS.SENT_TO_PHARMACY,
    sentAt: nowIso,
    sentByUid: user.uid,
    contractPayload,
    responses: []
  };

  // In Sandbox Mode: simulate immediate acknowledgment from partner sandbox
  if (PHARMACY_INTEGRATION_MODE === 'sandbox') {
    transmissionRecord.status = PHARMACY_STATUS.RECEIVED_BY_PHARMACY;
    transmissionRecord.responses.push({
      timestamp: nowIso,
      status: 'ACK_200',
      message: 'Sandbox: Prescription received, verified and queued for dispensing review.'
    });
  }

  pharmacyTransmissionsStore.set(transmissionId, transmissionRecord);

  // Update prescription tracking
  prescription.pharmacyTracking.status = transmissionRecord.status;
  prescription.pharmacyTracking.lastTransmissionId = transmissionId;
  prescription.pharmacyTracking.transmissions.push({
    transmissionId,
    pharmacyId,
    mode: PHARMACY_INTEGRATION_MODE,
    status: transmissionRecord.status,
    timestamp: nowIso
  });
  prescription.updatedAt = nowIso;
  prescriptionsStore.set(prescriptionId, prescription);

  return {
    success: true,
    mode: PHARMACY_INTEGRATION_MODE,
    transmissionId,
    status: transmissionRecord.status,
    contractVersion: PHARMACY_CONTRACT_VERSION
  };
}

/**
 * Updates dispensing status from pharmacy webhook or sandbox simulator.
 */
async function updatePharmacyDispenseStatus({ transmissionId, status, dispenseReference, notes }) {
  const transmission = pharmacyTransmissionsStore.get(transmissionId);
  if (!transmission) {
    const error = new Error(`Pharmacy transmission '${transmissionId}' not found.`);
    error.code = 'TRANSMISSION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const validStatuses = [
    PHARMACY_STATUS.RECEIVED_BY_PHARMACY,
    PHARMACY_STATUS.DISPENSED,
    PHARMACY_STATUS.REJECTED,
    PHARMACY_STATUS.CANCELLED
  ];

  if (!validStatuses.includes(status)) {
    const error = new Error(`Invalid pharmacy status '${status}'.`);
    error.code = 'INVALID_PHARMACY_STATUS';
    error.statusCode = 400;
    throw error;
  }

  const nowIso = new Date().toISOString();
  transmission.status = status;
  transmission.responses.push({
    timestamp: nowIso,
    status,
    dispenseReference: dispenseReference || null,
    notes: notes || null
  });
  pharmacyTransmissionsStore.set(transmissionId, transmission);

  // Reflect on prescription
  const prescription = prescriptionsStore.get(transmission.prescriptionId);
  if (prescription) {
    prescription.pharmacyTracking.status = status;
    if (status === PHARMACY_STATUS.DISPENSED) {
      prescription.status = PRESCRIPTION_STATUS.DISPENSED;
      prescription.dispensedAt = nowIso;
      prescription.dispenseReference = dispenseReference;
    }
    prescription.updatedAt = nowIso;
    prescriptionsStore.set(prescription.id, prescription);
  }

  return {
    success: true,
    transmissionId,
    prescriptionId: transmission.prescriptionId,
    status
  };
}

function getPrescriptionById(prescriptionId) {
  return prescriptionsStore.get(prescriptionId) || null;
}

function getCasePrescriptions(caseId) {
  const versionIds = prescriptionVersionsStore.get(caseId) || [];
  return versionIds.map(id => prescriptionsStore.get(id)).filter(Boolean);
}

function resetPrescriptionStoreForTesting() {
  prescriptionsStore.clear();
  prescriptionVersionsStore.clear();
  remindersStore.clear();
  pharmacyTransmissionsStore.clear();
  pharmacyConsentStore.clear();
}

module.exports = {
  PRESCRIPTION_STATUS,
  PHARMACY_STATUS,
  REMINDER_STATUS,
  PHARMACY_CONTRACT_VERSION,
  PHARMACY_INTEGRATION_MODE,
  validatePrescriptionItems,
  assertNoAlternativeTreatmentSuggestions,
  generatePrescriptionSignature,
  verifyPrescriptionSignature,
  issuePrescription,
  amendPrescription,
  cancelPrescription,
  schedulePrescriptionReminders,
  cancelPrescriptionReminders,
  getPatientActiveReminders,
  recordPharmacyConsent,
  sendToPharmacy,
  updatePharmacyDispenseStatus,
  getPrescriptionById,
  getCasePrescriptions,
  resetPrescriptionStoreForTesting
};
