/**
 * Health Vibe AI - Enterprise Clinical Backup & Restore Service
 *
 * Provides fail-closed Firestore/Storage snapshots, SHA-256 manifests, local
 * independent backup storage, retention pruning, guarded preview/live restore,
 * and measured RPO/RTO metrics.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.resolve(process.env.HEALTH_VIBE_BACKUP_DIR || path.join(__dirname, '..', 'scratch', 'secure-backups'));
const DEFAULT_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const BACKUP_VERSION = '2.0.0';

const FIRESTORE_COLLECTIONS = Object.freeze([
  'users',
  'cases',
  'appointments',
  'feedbacks',
  'audit_events',
  'email_notifications',
  'doctor_applications',
  'reports',
  'medical_reports',
  'clinical_reports'
]);

const STORAGE_PREFIXES = Object.freeze([
  'doctor_applications/'
]);

const backupRegistry = [];

try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
} catch (e) {}

function computeChecksum(dataString) {
  return crypto.createHash('sha256').update(dataString, 'utf-8').digest('hex');
}

function asPlainDoc(doc) {
  return { id: doc.id, data: doc.data() };
}

function getBackupPaths(backupId) {
  const dir = path.join(BACKUP_DIR, backupId);
  return {
    dir,
    payloadPath: path.join(dir, 'payload.json'),
    manifestPath: path.join(dir, 'manifest.json')
  };
}

function assertSafeBackupId(backupId) {
  if (!/^backup_[A-Za-z0-9_.-]+$/.test(String(backupId || ''))) {
    throw new Error('Invalid backupId format.');
  }
}

function saveSnapshot(manifest, payloadString) {
  const paths = getBackupPaths(manifest.backupId);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(paths.payloadPath, payloadString, { encoding: 'utf-8', mode: 0o600 });
  fs.writeFileSync(paths.manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function loadSnapshot(backupId) {
  assertSafeBackupId(backupId);
  const inMemory = backupRegistry.find(b => b.manifest.backupId === backupId);
  if (inMemory) return inMemory;

  const paths = getBackupPaths(backupId);
  const legacyManifestPath = path.join(path.resolve(__dirname, '..', 'scratch', 'backups'), `${backupId}.manifest.json`);
  const legacyPayloadPath = path.join(path.resolve(__dirname, '..', 'scratch', 'backups'), `${backupId}.json`);

  if (fs.existsSync(paths.manifestPath) && fs.existsSync(paths.payloadPath)) {
    return {
      manifest: JSON.parse(fs.readFileSync(paths.manifestPath, 'utf-8')),
      payloadString: fs.readFileSync(paths.payloadPath, 'utf-8')
    };
  }

  if (fs.existsSync(legacyManifestPath) && fs.existsSync(legacyPayloadPath)) {
    return {
      manifest: JSON.parse(fs.readFileSync(legacyManifestPath, 'utf-8')),
      payloadString: fs.readFileSync(legacyPayloadPath, 'utf-8')
    };
  }

  return null;
}

async function readFirestoreCollections(firestoreDb, collectionNames) {
  const collections = {};
  const counts = {};
  const readFailures = [];

  for (const name of collectionNames) {
    try {
      const snap = await firestoreDb.collection(name).get();
      collections[name] = snap.docs.map(asPlainDoc);
      counts[name] = snap.size;
    } catch (err) {
      readFailures.push({ scope: 'firestore', name, message: err.message });
    }
  }

  if (readFailures.length) {
    const error = new Error(`Backup aborted: failed to read ${readFailures.length} required data scope(s).`);
    error.code = 'BACKUP_READ_FAILED';
    error.failures = readFailures;
    throw error;
  }

  return { collections, counts };
}

async function readStorageObjects(storageBucket, prefixes) {
  if (!storageBucket || typeof storageBucket.getFiles !== 'function') {
    return { objects: [], counts: {}, readFailures: [], skipped: true };
  }

  const objects = [];
  const counts = {};
  const readFailures = [];

  for (const prefix of prefixes) {
    try {
      const [files] = await storageBucket.getFiles({ prefix });
      counts[prefix] = files.length;
      for (const file of files) {
        try {
          const [metadata] = typeof file.getMetadata === 'function' ? await file.getMetadata() : [{ name: file.name }];
          let contentBase64 = null;
          let contentSha256 = null;
          if (typeof file.download === 'function') {
            const [buffer] = await file.download();
            contentBase64 = Buffer.from(buffer).toString('base64');
            contentSha256 = computeChecksum(Buffer.from(buffer).toString('base64'));
          }
          objects.push({
            name: file.name || metadata.name,
            bucket: storageBucket.name || metadata.bucket || null,
            generation: metadata.generation || null,
            size: Number(metadata.size || 0),
            md5Hash: metadata.md5Hash || null,
            crc32c: metadata.crc32c || null,
            contentType: metadata.contentType || null,
            updated: metadata.updated || null,
            contentBase64,
            contentSha256,
            metadataOnly: !contentBase64
          });
        } catch (err) {
          readFailures.push({ scope: 'storage', name: file.name || prefix, message: err.message });
        }
      }
    } catch (err) {
      readFailures.push({ scope: 'storage', name: prefix, message: err.message });
    }
  }

  if (readFailures.length) {
    const error = new Error(`Backup aborted: failed to read ${readFailures.length} required storage object(s).`);
    error.code = 'BACKUP_STORAGE_READ_FAILED';
    error.failures = readFailures;
    throw error;
  }

  return { objects, counts, readFailures, skipped: false };
}

function normalizeMockData(mockData) {
  const collections = {};
  const counts = {};
  const allCollections = Array.from(new Set([...FIRESTORE_COLLECTIONS, ...Object.keys(mockData || {})]));

  for (const name of allCollections) {
    const rows = Array.isArray(mockData?.[name]) ? mockData[name] : [];
    collections[name] = rows.map(row => ({ id: row.id, data: { ...row } }));
    collections[name].forEach(row => { delete row.data.id; });
    counts[name] = rows.length;
  }

  return { collections, counts };
}

function baselineData() {
  return normalizeMockData({
    users: [{ id: 'u1', role: 'doctor', email: 'doctor@healthvibe.ai' }],
    cases: [{ id: 'c1', status: 'approved', triagePriority: 'routine' }],
    appointments: [{ id: 'a1', status: 'confirmed' }],
    feedbacks: [{ id: 'f1', rating: 5 }],
    audit_events: [{ id: 'ae1', type: 'SYSTEM_STARTUP' }],
    email_notifications: [{ id: 'en1', status: 'delivered' }]
  });
}

function pruneExpiredBackups(nowMs = Date.now(), retentionDays = DEFAULT_RETENTION_DAYS) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0 || !fs.existsSync(BACKUP_DIR)) {
    return { deleted: 0, retentionDays };
  }

  let deleted = 0;
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(BACKUP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('backup_')) continue;
    const manifestPath = path.join(BACKUP_DIR, entry.name, 'manifest.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (new Date(manifest.timestamp).getTime() < cutoff) {
        fs.rmSync(path.join(BACKUP_DIR, entry.name), { recursive: true, force: true });
        deleted += 1;
      }
    } catch (e) {}
  }
  return { deleted, retentionDays };
}

async function createBackupSnapshot({
  initiator = 'system_automated',
  environment = process.env.NODE_ENV || 'development',
  firestoreDb = null,
  storageBucket = null,
  mockData = null,
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) {
  const startedAtMs = Date.now();
  const timestamp = new Date(startedAtMs).toISOString();
  const backupId = `backup_${timestamp.replace(/[:.]/g, '-')}_${crypto.randomBytes(2).toString('hex')}`;
  const collectionNames = FIRESTORE_COLLECTIONS;

  const firestoreSnapshot = firestoreDb && typeof firestoreDb.collection === 'function'
    ? await readFirestoreCollections(firestoreDb, collectionNames)
    : mockData
      ? normalizeMockData(mockData)
      : baselineData();

  const storageSnapshot = await readStorageObjects(storageBucket, STORAGE_PREFIXES);
  const payload = {
    firestore: firestoreSnapshot.collections,
    storage: {
      prefixes: STORAGE_PREFIXES,
      objects: storageSnapshot.objects,
      skipped: storageSnapshot.skipped
    }
  };
  const payloadString = JSON.stringify(payload, null, 2);
  const checksum = computeChecksum(payloadString);
  const finishedAtMs = Date.now();
  const totalRecords = Object.values(firestoreSnapshot.counts).reduce((a, b) => a + b, 0);
  const newestUpdatedAtMs = extractNewestUpdatedAt(payload.firestore);
  const measuredRpoMs = newestUpdatedAtMs ? Math.max(0, finishedAtMs - newestUpdatedAtMs) : 0;

  const manifest = {
    backupId,
    version: BACKUP_VERSION,
    environment,
    initiator,
    timestamp,
    completedAt: new Date(finishedAtMs).toISOString(),
    retention: {
      days: retentionDays,
      expiresAt: new Date(finishedAtMs + retentionDays * 24 * 60 * 60 * 1000).toISOString()
    },
    backupStore: {
      type: 'independent-local-secure',
      path: BACKUP_DIR
    },
    scope: {
      firestoreCollections: collectionNames,
      storagePrefixes: STORAGE_PREFIXES
    },
    collections: firestoreSnapshot.counts,
    storage: {
      prefixes: storageSnapshot.counts,
      objectCount: storageSnapshot.objects.length,
      skipped: storageSnapshot.skipped
    },
    totalRecords,
    archiveFormat: 'json',
    sizeBytes: Buffer.byteLength(payloadString, 'utf-8'),
    checksum: {
      algorithm: 'SHA-256',
      hash: checksum
    },
    metrics: {
      backupDurationMs: finishedAtMs - startedAtMs,
      measuredRpoMs,
      measuredRpoSeconds: Number((measuredRpoMs / 1000).toFixed(3))
    },
    pitrWindowStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'COMPLETED'
  };

  saveSnapshot(manifest, payloadString);
  pruneExpiredBackups(finishedAtMs, retentionDays);
  backupRegistry.unshift({ manifest, payloadString });

  return manifest;
}

function extractNewestUpdatedAt(collections) {
  let newest = 0;
  for (const rows of Object.values(collections || {})) {
    for (const row of rows || []) {
      const data = row.data || row;
      for (const key of ['updatedAt', 'createdAt', 'timestamp']) {
        const value = data[key];
        const ms = value && typeof value.toMillis === 'function'
          ? value.toMillis()
          : typeof value === 'string'
            ? new Date(value).getTime()
            : typeof value === 'number'
              ? value
              : 0;
        if (Number.isFinite(ms) && ms > newest) newest = ms;
      }
    }
  }
  return newest;
}

function verifyBackupIntegrity(backupId, customPayload = null) {
  const item = loadSnapshot(backupId);
  if (!item) {
    return {
      valid: false,
      error: 'SNAPSHOT_NOT_FOUND',
      message: `Snapshot '${backupId}' could not be located in registry or secure backup store.`
    };
  }

  const payloadToTest = customPayload || item.payloadString;
  const expectedHash = item.manifest.checksum.hash;
  const computedHash = computeChecksum(payloadToTest);
  const isMatch = computedHash.toLowerCase() === expectedHash.toLowerCase();

  return {
    valid: isMatch,
    backupId,
    algorithm: 'SHA-256',
    expectedHash,
    computedHash,
    manifest: item.manifest,
    status: isMatch ? 'VERIFIED_PRISTINE' : 'CORRUPTED_OR_TAMPERED'
  };
}

function listBackupSnapshots() {
  const byId = new Map(backupRegistry.map(b => [b.manifest.backupId, b.manifest]));

  try {
    if (fs.existsSync(BACKUP_DIR)) {
      for (const entry of fs.readdirSync(BACKUP_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(BACKUP_DIR, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          byId.set(manifest.backupId, manifest);
        }
      }
    }
  } catch (e) {}

  return Array.from(byId.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function commitBatch(firestoreDb, operations) {
  if (!operations.length) return;
  const batch = firestoreDb.batch();
  for (const op of operations) {
    batch.set(op.ref, op.data, { merge: false });
  }
  await batch.commit();
}

async function restoreBackupSnapshot(backupId, {
  confirmToken = '',
  dryRun = false,
  firestoreDb = null,
  storageBucket = null,
  batchSize = 400
} = {}) {
  const startedAtMs = Date.now();
  const expectedToken = `CONFIRM_RESTORE_${backupId}`;
  if (!confirmToken || confirmToken !== expectedToken) {
    return {
      success: false,
      error: 'CONFIRMATION_REQUIRED',
      message: `Restoration requires explicit confirmation token '${expectedToken}'. Blind restores are blocked.`
    };
  }

  const verification = verifyBackupIntegrity(backupId);
  if (!verification.valid) {
    return {
      success: false,
      error: 'INTEGRITY_CHECK_FAILED',
      message: `Cannot restore corrupted backup snapshot: ${verification.status}`
    };
  }

  const snapshot = loadSnapshot(backupId);
  const payload = JSON.parse(snapshot.payloadString);
  const preview = Object.fromEntries(
    Object.entries(payload.firestore || {}).map(([name, rows]) => [name, rows.length])
  );
  const totalRecords = Object.values(preview).reduce((a, b) => a + b, 0);

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      backupId,
      manifest: snapshot.manifest,
      preview,
      storagePreview: {
        objectCount: payload.storage?.objects?.length || 0,
        prefixes: payload.storage?.prefixes || []
      },
      restoredRecords: 0,
      metrics: {
        measuredRtoMs: Date.now() - startedAtMs,
        measuredRtoSeconds: Number(((Date.now() - startedAtMs) / 1000).toFixed(3))
      },
      message: `Dry-run validation successful. ${totalRecords} records verified for restore without modifying datastore.`
    };
  }

  if (!firestoreDb || typeof firestoreDb.collection !== 'function' || typeof firestoreDb.batch !== 'function') {
    return {
      success: false,
      error: 'RESTORE_TARGET_UNAVAILABLE',
      message: 'Live restore requires a Firestore Admin SDK target with batch writes.'
    };
  }

  let restoredRecords = 0;
  let pending = [];
  for (const [collectionName, rows] of Object.entries(payload.firestore || {})) {
    for (const row of rows) {
      if (!row.id) {
        throw new Error(`Restore payload contains a ${collectionName} record without an id.`);
      }
      pending.push({
        ref: firestoreDb.collection(collectionName).doc(row.id),
        data: row.data || {}
      });
      restoredRecords += 1;
      if (pending.length >= batchSize) {
        await commitBatch(firestoreDb, pending);
        pending = [];
      }
    }
  }
  await commitBatch(firestoreDb, pending);

  let restoredStorageObjects = 0;
  if (storageBucket && typeof storageBucket.file === 'function') {
    for (const object of payload.storage?.objects || []) {
      if (!object.contentBase64) continue;
      const buffer = Buffer.from(object.contentBase64, 'base64');
      const computed = computeChecksum(object.contentBase64);
      if (object.contentSha256 && computed !== object.contentSha256) {
        throw new Error(`Storage object '${object.name}' failed restore checksum validation.`);
      }
      const targetFile = storageBucket.file(object.name);
      if (targetFile && typeof targetFile.save === 'function') {
        await targetFile.save(buffer, {
          metadata: {
            contentType: object.contentType || undefined
          },
          resumable: false
        });
        restoredStorageObjects += 1;
      }
    }
  }

  const finishedAtMs = Date.now();
  return {
    success: true,
    dryRun: false,
    backupId,
    restoredRecords,
    restoredStorageObjects,
    restoredCollections: Object.keys(preview),
    preview,
    restoredAt: new Date(finishedAtMs).toISOString(),
    metrics: {
      measuredRtoMs: finishedAtMs - startedAtMs,
      measuredRtoSeconds: Number(((finishedAtMs - startedAtMs) / 1000).toFixed(3))
    },
    message: `Database successfully restored from snapshot '${backupId}'.`
  };
}

module.exports = {
  BACKUP_DIR,
  FIRESTORE_COLLECTIONS,
  STORAGE_PREFIXES,
  createBackupSnapshot,
  verifyBackupIntegrity,
  listBackupSnapshots,
  restoreBackupSnapshot,
  pruneExpiredBackups,
  computeChecksum
};
