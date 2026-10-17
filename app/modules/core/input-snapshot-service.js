/**
 * Health Vibe AI - Client Input Snapshot Service
 * Standardized for Browser and Node.js environments.
 * 
 * Benchmark & Inspiration: K Health Clinical Auditing Standards
 * Freezes patient symptoms and vitals in an immutable JSON structure with SHA-256 digest.
 */

(function(global) {
  'use strict';

  const SNAPSHOT_VERSION = '1.0.0';

  /**
   * Pure JavaScript SHA-256 implementation for synchronous and deterministic hashing
   * without external dependencies or async Web Crypto limitations.
   */
  function sha256Sync(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let lengthProperty = 'length';
    let i, j;
    let result = '';

    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;

    let hash = sha256Sync.h = sha256Sync.h || [];
    const k = sha256Sync.k = sha256Sync.k || [];
    let primeCounter = k[lengthProperty];

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 300; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return ''; // Only ASCII
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;

    for (j = 0; j < words[lengthProperty];) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash;
      hash = hash.slice(0, 8);

      for (i = 0; i < 64; i++) {
        const i2 = i + j;
        const w15 = w[i - 15], w2 = w[i - 2];

        const a = hash[0], e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);

        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  function canonicalizeData(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonicalizeData);
    if (typeof value === 'object') {
      const sorted = {};
      const keys = Object.keys(value).sort();
      for (const k of keys) {
        if (k === 'hash' || k === 'inputSnapshotHash' || k === '_hash') continue;
        sorted[k] = canonicalizeData(value[k]);
      }
      return sorted;
    }
    return String(value);
  }

  function computeSnapshotHash(data) {
    // If running in Node.js with crypto available, prefer native crypto
    if (typeof require === 'function') {
      try {
        const crypto = require('crypto');
        if (crypto && typeof crypto.createHash === 'function') {
          return crypto.createHash('sha256').update(JSON.stringify(canonicalizeData(data)), 'utf8').digest('hex');
        }
      } catch (e) {}
    }
    const jsonStr = JSON.stringify(canonicalizeData(data));
    return sha256Sync(unescape(encodeURIComponent(jsonStr)));
  }

  function normalizeChoice(val) {
    if (val === true || val === 'yes' || val === 'نعم' || val === 'true') return 'yes';
    if (val === false || val === 'no' || val === 'لا' || val === 'false') return 'no';
    return 'unknown';
  }

  function captureInputSnapshot(params = {}) {
    const nowIso = params.capturedAt || params.submittedAt || new Date().toISOString();
    const raw = params.body || params;

    const o2 = Number(raw.oxygenLevel ?? raw.spo2 ?? raw.o2 ?? 95);
    const temperature = raw.temperature !== undefined && raw.temperature !== null && raw.temperature !== ''
      ? Number(raw.temperature)
      : (raw.vitals?.temperature ? Number(raw.vitals.temperature) : null);
    const respiratoryRate = raw.respiratoryRate !== undefined && raw.respiratoryRate !== null && raw.respiratoryRate !== ''
      ? Number(raw.respiratoryRate)
      : (raw.vitals?.respiratoryRate ? Number(raw.vitals.respiratoryRate) : null);

    const vitals = {
      oxygenLevel: o2,
      spo2: o2,
      temperature: Number.isFinite(temperature) ? temperature : null,
      temperatureUnit: '°C',
      respiratoryRate: Number.isFinite(respiratoryRate) ? respiratoryRate : null,
      respiratoryRateUnit: 'breaths/min',
      unit: '%'
    };

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

    let riskFactors = [];
    if (Array.isArray(raw.riskFactors)) riskFactors = raw.riskFactors.map(r => String(r).trim()).filter(Boolean);
    else if (Array.isArray(raw.riskFactorsRaw)) riskFactors = raw.riskFactorsRaw.map(r => String(r).trim()).filter(Boolean);

    const currentMedications = String(raw.currentMedications ?? raw.currentMedicationsRaw ?? raw.medications ?? '').trim().slice(0, 500);
    const patientNotes = String(raw.patientNotes ?? raw.notes ?? raw.notesRaw ?? '').trim().slice(0, 1000);

    const user = params.user || {};
    const patientProfile = {
      patientId: String(raw.patientId || raw.patientUid || user.uid || user.id || '').trim(),
      patientName: String(raw.patientName || raw.name || user.displayName || user.name || (user.email ? user.email.split('@')[0] : '') || 'Patient').trim(),
      patientEmail: String(raw.patientEmail || user.email || '').trim().toLowerCase(),
      patientDob: raw.patientDob || raw.dob || raw.dateOfBirth || user.dateOfBirth || null,
      patientAge: raw.patientAge !== undefined && raw.patientAge !== null && raw.patientAge !== ''
        ? String(raw.patientAge)
        : (raw.age !== undefined && raw.age !== null ? String(raw.age) : null),
      patientGender: raw.patientGender || raw.gender || user.gender || null,
      patientPhone: raw.patientPhone || raw.phone || user.phoneNumber || null,
      patientMedicalHistory: raw.patientMedicalHistory || raw.medicalHistory || user.medicalHistory || null
    };

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
      spo2: vitals.spo2,
      oxygenLevel: vitals.oxygenLevel,
      temperature: vitals.temperature,
      respiratoryRate: vitals.respiratoryRate,
      shortnessOfBreathScale: symptoms.shortnessOfBreathScale,
      coughSeverity: symptoms.coughSeverity,
      symptomDurationDays: symptoms.symptomDurationDays,
      chestPain: symptoms.chestPain,
      recentInfection: symptoms.recentInfection,
      asthmaCopdHistory: symptoms.asthmaCopdHistory,
      patientAge: patientProfile.patientAge,
      patientGender: patientProfile.patientGender,
      isImmutable: true
    };

    const hash = computeSnapshotHash(snapshotData);
    snapshotData.hash = hash;
    snapshotData.inputSnapshotHash = hash;

    return snapshotData;
  }

  function verifyInputSnapshotIntegrity(snapshot, expectedHash = null) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { isValid: false, error: 'SNAPSHOT_MISSING', expectedHash: expectedHash || '', actualHash: '' };
    }
    const target = expectedHash || snapshot.hash || snapshot.inputSnapshotHash;
    if (!target) return { isValid: false, error: 'NO_HASH', expectedHash: '', actualHash: '' };
    const computed = computeSnapshotHash(snapshot);
    const isValid = computed.toLowerCase() === target.toLowerCase();
    return {
      isValid,
      error: isValid ? undefined : 'HASH_MISMATCH',
      expectedHash: target,
      actualHash: computed
    };
  }

  const service = {
    SNAPSHOT_VERSION,
    canonicalizeData,
    computeSnapshotHash,
    captureInputSnapshot,
    verifyInputSnapshotIntegrity
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = service;
  }
  if (typeof global !== 'undefined') {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.InputSnapshotService = service;
    global.InputSnapshotService = service;
  }
})(typeof window !== 'undefined' ? window : global);
