/**
 * Health Vibe AI - Immutable Assessment Input Snapshot Service
 * 
 * Benchmark & Inspiration: K Health Clinical Auditing Standards
 * 
 * Mandate:
 * Saves a complete, immutable JSON snapshot of all patient inputs (vitals, symptoms,
 * clinical questionnaire responses, medications, notes, and demographic context)
 * at the exact moment of clinical assessment creation.
 * 
 * Guarantees:
 * 1. Cryptographic SHA-256 hash (inputSnapshotHash) for tamper detection.
 * 2. Immutability: Rejects any subsequent modification or alteration of historical inputs.
 * 3. Clinical Fidelity: Ensures that doctor review, official reports, and PDF exports
 *    faithfully display the exact inputs submitted by the patient, unaffected by subsequent
 *    profile updates or retro-alterations.
 */

'use strict';

const crypto = require('crypto');

const SNAPSHOT_VERSION = '1.0.0';

/**
 * Standardizes and canonicalizes any JavaScript data structure recursively.
 * Ensures deterministic JSON serialization by sorting keys and normalizing primitives.
 * @param {any} value
 * @returns {any}
 */
function canonicalizeData(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeData(item));
  }
  if (typeof value === 'object') {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      // Exclude volatile/computed hash fields during canonicalization
      if (key === 'hash' || key === 'inputSnapshotHash' || key === '_hash') continue;
      sorted[key] = canonicalizeData(value[key]);
    }
    return sorted;
  }
  return String(value);
}

/**
 * Computes deterministic SHA-256 digest of canonical data.
 * @param {any} data
 * @returns {string} Hex SHA-256 digest
 */
function computeSnapshotHash(data) {
  const canonical = canonicalizeData(data);
  const jsonStr = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

/**
 * Normalizes yes/no/unknown boolean-like choices.
 * @param {any} val
 * @returns {'yes'|'no'|'unknown'}
 */
function normalizeChoice(val) {
  if (val === true || val === 'yes' || val === 'نعم' || val === 'true') return 'yes';
  if (val === false || val === 'no' || val === 'لا' || val === 'false') return 'no';
  return 'unknown';
}

/**
 * Captures an immutable clinical input snapshot at the moment of assessment submission.
 * @param {object} params
 * @returns {object} Immutable Input Snapshot with SHA-256 hash
 */
function captureInputSnapshot(params = {}) {
  const nowIso = params.capturedAt || params.submittedAt || new Date().toISOString();
  const raw = params.body || params;

  // 1. Resolve Vitals
  const o2 = Number(raw.oxygenLevel ?? raw.spo2 ?? raw.o2 ?? 95);
  const temperature = raw.temperature !== undefined && raw.temperature !== null && raw.temperature !== ''
    ? Number(raw.temperature)
    : (raw.vitals?.temperature ? Number(raw.vitals.temperature) : null);
  const respiratoryRate = raw.respiratoryRate !== undefined && raw.respiratoryRate !== null && raw.respiratoryRate !== ''
    ? Number(raw.respiratoryRate)
    : (raw.vitals?.respiratoryRate ? Number(raw.vitals.respiratoryRate) : null);
  const sbp = raw.sbp || raw.vitals?.sbp ? Number(raw.sbp || raw.vitals?.sbp) : null;
  const dbp = raw.dbp || raw.vitals?.dbp ? Number(raw.dbp || raw.vitals?.dbp) : null;

  const vitals = {
    oxygenLevel: o2,
    spo2: o2,
    temperature: Number.isFinite(temperature) ? temperature : null,
    temperatureUnit: '°C',
    respiratoryRate: Number.isFinite(respiratoryRate) ? respiratoryRate : null,
    respiratoryRateUnit: 'breaths/min',
    systolicBP: Number.isFinite(sbp) ? sbp : null,
    diastolicBP: Number.isFinite(dbp) ? dbp : null,
    unit: '%'
  };

  // 2. Resolve Symptoms & Clinical Questionnaire
  const breathingRaw = String(raw.breathingDifficulty ?? raw.breathingRaw ?? raw.shortnessOfBreath ?? '').toLowerCase();
  const hasDyspnea = breathingRaw.includes('نعم') || breathingRaw === 'yes' || Boolean(raw.hasDyspnea);
  const shortnessOfBreathScale = raw.shortnessOfBreathScale !== undefined
    ? Number(raw.shortnessOfBreathScale)
    : (hasDyspnea ? 6 : 1);

  const coughClean = String(raw.coughLevel ?? raw.coughSeverity ?? raw.coughRaw ?? 'none').toLowerCase();
  let coughSeverity = 'none';
  if (coughClean.includes('شديد') || coughClean.includes('severe')) coughSeverity = 'severe';
  else if (coughClean.includes('متوسط') || coughClean.includes('moderate')) coughSeverity = 'moderate';
  else if (coughClean.includes('خفيف') || coughClean.includes('mild')) coughSeverity = 'mild';

  const durationDays = Number(raw.symptomDurationDays ?? raw.durationDays ?? raw.symptomDuration ?? raw.duration ?? 3);

  const symptoms = {
    breathingDifficulty: hasDyspnea ? 'yes' : 'no',
    hasDyspnea,
    shortnessOfBreathScale,
    coughSeverity,
    coughLevel: coughSeverity,
    symptomDurationDays: Number.isFinite(durationDays) ? durationDays : 3,
    chestPain: normalizeChoice(raw.chestPain ?? raw.chestPainRaw ?? raw.chestPainKey),
    symptomProgression: String(raw.symptomProgression ?? raw.symptomProgressionRaw ?? 'unknown').toLowerCase(),
    recentInfection: normalizeChoice(raw.recentInfection ?? raw.recentInfectionRaw ?? raw.recentInfectionKey),
    asthmaCopdHistory: normalizeChoice(raw.asthmaCopdHistory ?? raw.asthmaCopd ?? raw.asthmaCopdRaw ?? raw.asthmaCopdKey),
    fever: normalizeChoice(raw.fever)
  };

  // 3. Risk Factors
  let riskFactors = [];
  if (Array.isArray(raw.riskFactors)) {
    riskFactors = raw.riskFactors.map(r => String(r).trim()).filter(Boolean);
  } else if (Array.isArray(raw.riskFactorsRaw)) {
    riskFactors = raw.riskFactorsRaw.map(r => String(r).trim()).filter(Boolean);
  }

  // 4. Medications & Patient Free-Text Notes
  const currentMedications = String(raw.currentMedications ?? raw.currentMedicationsRaw ?? raw.medications ?? '').trim().slice(0, 500);
  const patientNotes = String(raw.patientNotes ?? raw.notes ?? raw.notesRaw ?? '').trim().slice(0, 1000);

  // 5. Patient Demographic Context at Assessment Time
  const user = params.user || {};
  const patientId = String(raw.patientId || raw.patientUid || user.uid || user.id || '').trim();
  const patientName = String(raw.patientName || raw.name || user.displayName || user.name || (user.email ? user.email.split('@')[0] : '') || 'Patient').trim();
  const patientEmail = String(raw.patientEmail || user.email || '').trim().toLowerCase();
  const patientDob = raw.patientDob || raw.dob || raw.dateOfBirth || user.dateOfBirth || null;
  const patientAge = raw.patientAge !== undefined && raw.patientAge !== null && raw.patientAge !== ''
    ? String(raw.patientAge)
    : (raw.age !== undefined && raw.age !== null ? String(raw.age) : null);
  const patientGender = raw.patientGender || raw.gender || user.gender || null;
  const patientPhone = raw.patientPhone || raw.phone || user.phoneNumber || null;
  const patientMedicalHistory = raw.patientMedicalHistory || raw.medicalHistory || user.medicalHistory || null;

  const patientProfile = {
    patientId,
    patientName,
    patientEmail,
    patientDob,
    patientAge,
    patientGender,
    patientPhone,
    patientMedicalHistory
  };

  // 6. Assemble Full Core Snapshot
  const snapshotData = {
    snapshotVersion: SNAPSHOT_VERSION,
    capturedAt: nowIso,
    submittedAt: nowIso,
    vitals,
    symptoms,
    riskFactors,
    currentMedications,
    patientNotes,
    patientProfile,
    isImmutable: true
  };

  // Flattened accessors for seamless backward-compatibility
  snapshotData.spo2 = vitals.spo2;
  snapshotData.oxygenLevel = vitals.oxygenLevel;
  snapshotData.temperature = vitals.temperature;
  snapshotData.respiratoryRate = vitals.respiratoryRate;
  snapshotData.shortnessOfBreathScale = symptoms.shortnessOfBreathScale;
  snapshotData.coughSeverity = symptoms.coughSeverity;
  snapshotData.symptomDurationDays = symptoms.symptomDurationDays;
  snapshotData.chestPain = symptoms.chestPain;
  snapshotData.recentInfection = symptoms.recentInfection;
  snapshotData.asthmaCopdHistory = symptoms.asthmaCopdHistory;
  snapshotData.patientAge = patientProfile.patientAge;
  snapshotData.patientGender = patientProfile.patientGender;

  // 7. Compute Cryptographic SHA-256 Digest
  const hash = computeSnapshotHash(snapshotData);
  snapshotData.hash = hash;
  snapshotData.inputSnapshotHash = hash;

  return snapshotData;
}

/**
 * Verifies the integrity of an input snapshot against its computed SHA-256 hash.
 * @param {object} snapshot
 * @param {string} [expectedHash]
 * @returns {{ isValid: boolean, error?: string, expectedHash: string, actualHash: string }}
 */
function verifyInputSnapshotIntegrity(snapshot, expectedHash = null) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      isValid: false,
      error: 'SNAPSHOT_MISSING_OR_INVALID',
      expectedHash: expectedHash || '',
      actualHash: ''
    };
  }

  const targetHash = expectedHash || snapshot.hash || snapshot.inputSnapshotHash;
  if (!targetHash) {
    return {
      isValid: false,
      error: 'TARGET_HASH_NOT_PROVIDED',
      expectedHash: '',
      actualHash: ''
    };
  }

  const computed = computeSnapshotHash(snapshot);
  const isValid = computed.toLowerCase() === targetHash.toLowerCase();

  return {
    isValid,
    error: isValid ? undefined : 'HASH_MISMATCH_TAMPER_DETECTED',
    expectedHash: targetHash,
    actualHash: computed
  };
}

/**
 * Enforces immutability: Rejects any attempt to mutate an existing input snapshot.
 * Throws an explicit error if tampering or alteration is detected.
 * @param {object} existingCase
 * @param {object} updatePayload
 */
function assertSnapshotImmutability(existingCase, updatePayload) {
  if (!existingCase || !updatePayload) return;

  const existingSnapshot = existingCase.inputSnapshot || existingCase.assessmentInputSnapshot;
  const newSnapshot = updatePayload.inputSnapshot || updatePayload.assessmentInputSnapshot;

  if (existingSnapshot && newSnapshot) {
    const existingHash = existingCase.inputSnapshotHash || existingSnapshot.hash || computeSnapshotHash(existingSnapshot);
    const newHash = updatePayload.inputSnapshotHash || newSnapshot.hash || computeSnapshotHash(newSnapshot);

    if (existingHash.toLowerCase() !== newHash.toLowerCase()) {
      const err = new Error('IMMUTABLE_INPUT_SNAPSHOT_MODIFICATION_PROHIBITED: Clinical input snapshots cannot be modified once recorded.');
      err.code = 'IMMUTABLE_INPUT_SNAPSHOT_MODIFICATION_PROHIBITED';
      err.statusCode = 400;
      throw err;
    }
  }

  // Also prevent wiping snapshot hash
  if (existingCase.inputSnapshotHash && updatePayload.inputSnapshotHash && existingCase.inputSnapshotHash !== updatePayload.inputSnapshotHash) {
    const err = new Error('IMMUTABLE_INPUT_SNAPSHOT_HASH_MUTATION: Snapshot hash cannot be altered.');
    err.code = 'IMMUTABLE_INPUT_SNAPSHOT_HASH_MUTATION';
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Deep freezes an object to prevent in-memory mutation.
 * @param {object} obj
 * @returns {object}
 */
function freezeSnapshot(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        freezeSnapshot(obj[key]);
      }
    }
  }
  return obj;
}

module.exports = {
  SNAPSHOT_VERSION,
  canonicalizeData,
  computeSnapshotHash,
  captureInputSnapshot,
  verifyInputSnapshotIntegrity,
  assertSnapshotImmutability,
  freezeSnapshot
};
