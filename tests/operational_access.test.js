const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute the actual Express app with isolated Firebase and backup boundaries.
// No live credentials, Firestore writes, or real restores are used.
const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const audit = [];
const calls = [];
const profiles = new Map();
const claims = {
  patient: { uid: 'patient-1', role: 'patient' },
  doctor: { uid: 'doctor-1', role: 'doctor' },
  clinic: { uid: 'clinic-1', role: 'clinic_admin' },
  admin: { uid: 'admin-1', role: 'super_admin' },
  owner: { uid: 'owner-1', isOwner: true },
  suspended: { uid: 'suspended-1', role: 'super_admin', suspended: true },
  dbSuspended: { uid: 'blocked-1', role: 'super_admin' },
  noRole: { uid: 'no-role' }
};
profiles.set('blocked-1', { suspended: true });
// A writable profile cannot elevate a patient into a platform administrator.
profiles.set('patient-1', { role: 'super_admin', isOwner: true });
const firestore = () => ({ collection: name => ({
  doc: uid => ({ get: async () => ({ exists: profiles.has(uid), data: () => profiles.get(uid) }) }),
  add: async event => { assert.equal(name, 'audit_events'); audit.push(event); }
}) });
firestore.FieldValue = { serverTimestamp: () => 'server-time' };
const firebase = {
  apps: [{}], firestore,
  auth: () => ({ verifyIdToken: async token => {
    if (!claims[token]) throw new Error('Invalid or expired token');
    return { ...claims[token] };
  } })
};
const backup = {
  createBackupSnapshot: async opts => { calls.push(['create', opts]); return { backupId: 'snapshot-1' }; },
  listBackupSnapshots: () => { calls.push(['list']); return []; },
  verifyBackupIntegrity: id => { calls.push(['verify', id]); return { valid: true }; },
  restoreBackupSnapshot: async (id, opts) => { calls.push(['restore', id, opts]); return { success: true, dryRun: opts.dryRun }; }
};
const sandbox = {
  require: name => name === 'firebase-admin' ? firebase : name === './backup-service' ? backup
    : name === './whatsapp-bot' ? {} : name === 'dotenv' ? { config() {} } : backendRequire(name),
  module: { exports: {} }, __dirname: path.dirname(serverPath),
  process: { env: { NODE_ENV: 'development' }, on() {}, uptime: () => 1 },
  console: { log() {}, info() {}, warn() {}, error() {} },
  Buffer, setTimeout, clearTimeout
};
vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), sandbox, { filename: serverPath });
const app = sandbox.module.exports;
const administrativeRoutes = [
  ['GET', '/api/monitoring/errors/summary'],
  ['POST', '/api/monitoring/errors/clear'],
  ['POST', '/api/admin/backup/create'],
  ['GET', '/api/admin/backup/list'],
  ['POST', '/api/admin/backup/verify'],
  ['POST', '/api/admin/backup/restore']
];

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let requests = 0;
  async function request(method, route, token, body = {}) {
    requests++;
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    for (const [method, route] of administrativeRoutes) {
      for (const [token, expected] of [[null, 401], ['invalid', 403], ['expired', 403], ['patient', 403], ['doctor', 403], ['clinic', 403], ['noRole', 403], ['suspended', 403], ['dbSuspended', 403]]) {
        const before = calls.length;
        const result = await request(method, route, token, { role: 'super_admin', isOwner: true, initiator: 'forged', backupId: 'snapshot-1' });
        assert.equal(result.status, expected, `${token}: ${method} ${route}`);
        assert.equal(calls.length, before, 'Rejected requests must not call backup services');
      }
    }
    assert.equal((await request('POST', '/api/monitoring/errors', null, { message: 'anonymous' })).status, 401);
    for (const token of ['patient', 'doctor']) {
      assert.equal((await request('POST', '/api/monitoring/errors', token, {
        message: 'test error', userId: 'forged', userRole: 'super_admin'
      })).status, 201);
    }
    // A forbidden clear must leave the buffer untouched.
    await request('POST', '/api/monitoring/errors/clear', 'patient');
    const summary = await request('GET', '/api/monitoring/errors/summary', 'admin');
    assert.equal(summary.body.totalErrors, 2);
    assert.equal(summary.body.recentErrors[0].userId, 'doctor-1');
    assert.equal(summary.body.recentErrors[0].userRole, 'doctor');
    assert.equal(summary.body.recentErrors[1].userId, 'patient-1');
    for (const token of ['admin', 'owner']) {
      for (const [method, route] of administrativeRoutes) {
        const result = await request(method, route, token, { backupId: 'snapshot-1', initiator: 'forged', userId: 'forged', dryRun: true });
        assert.ok(result.status === 200 || result.status === 201, `${token}: ${route}`);
      }
    }
    for (const call of calls.filter(c => c[0] === 'create')) {
      assert.ok(['admin-1', 'owner-1'].includes(call[1].initiator));
    }
    assert.equal((await request('GET', '/api/monitoring/errors/summary', 'admin')).body.totalErrors, 0);
    await request('POST', '/api/admin/backup/restore', 'admin', { backupId: 'snapshot-1', dryRun: false });
    await new Promise(resolve => setImmediate(resolve));
    for (const type of ['MONITORING_SUMMARY_READ', 'MONITORING_ERRORS_CLEARED', 'BACKUP_SNAPSHOT_CREATED', 'BACKUP_SNAPSHOTS_LISTED', 'BACKUP_INTEGRITY_VERIFIED', 'DATABASE_RESTORE_EXECUTED']) {
      assert.ok(audit.some(e => e.type === type && e.userId === 'admin-1' && e.userRole === 'super_admin' && e.outcome === 'SUCCESS'), type);
      assert.ok(audit.some(e => e.type === type && e.userId === 'patient-1' && e.outcome === 'REJECTED'), `${type} denied audit`);
    }
    assert.ok(audit.some(e => e.type === 'DATABASE_RESTORE_EXECUTED' && e.dryRun === true));
    assert.ok(audit.some(e => e.type === 'DATABASE_RESTORE_EXECUTED' && e.dryRun === false));
    assert.ok(audit.every(e => e.userId !== 'forged'));
    console.log(`PASS: ${requests} HTTP requests verify operational RBAC, identity, audit, and denied side effects.`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
