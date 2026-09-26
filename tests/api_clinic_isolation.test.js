const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

const docs = {
  users: new Map([
    ['clinic-admin-a', { role: 'clinic_admin', clinicId: 'clinic-a', emailVerified: true }],
    ['clinic-admin-b', { role: 'clinic_admin', clinicId: 'clinic-b', emailVerified: true }],
    ['doctor-a', { role: 'doctor', clinicId: 'clinic-a', verifiedDoctor: true }],
    ['doctor-b', { role: 'doctor', clinicId: 'clinic-b', verifiedDoctor: true }]
  ]),
  cases: new Map([
    ['case-a', { patientId: 'patient-a', clinicId: 'clinic-a', status: 'submitted', submittedAt: Date.now() - 60000 }],
    ['case-b', { patientId: 'patient-b', clinicId: 'clinic-b', status: 'approved', doctorApproved: true, submittedAt: Date.now() - 120000, approvedAt: Date.now() - 30000 }]
  ]),
  audit_events: new Map()
};

function collection(name) {
  return {
    doc: id => ({
      get: async () => ({
        exists: docs[name]?.has(id) || false,
        data: () => docs[name].get(id)
      }),
      update: async data => {
        const current = docs[name].get(id);
        docs[name].set(id, { ...current, ...data });
      },
      set: async data => {
        docs[name].set(id, { ...(docs[name].get(id) || {}), ...data });
      }
    }),
    add: async data => {
      const id = `${name}-${docs[name].size + 1}`;
      docs[name].set(id, data);
      return { id };
    },
    get: async () => ({
      docs: Array.from(docs[name]?.entries() || []).map(([id, data]) => ({
        id,
        data: () => data
      })),
      empty: !docs[name] || docs[name].size === 0
    }),
    orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
    where: (field, op, value) => ({
      get: async () => ({
        docs: Array.from(docs[name]?.entries() || [])
          .filter(([, data]) => op === '==' && data[field] === value)
          .map(([id, data]) => ({ id, data: () => data }))
      })
    })
  };
}

const firestore = () => ({ collection });
firestore.FieldValue = {
  serverTimestamp: () => 'server-time',
  arrayUnion: value => [value]
};

const claims = {
  'clinic-a-token': { uid: 'clinic-admin-a', email: 'a@clinic.test', role: 'clinic_admin', email_verified: true },
  'clinic-b-token': { uid: 'clinic-admin-b', email: 'b@clinic.test', role: 'clinic_admin', email_verified: true }
};

const firebase = {
  apps: [{}],
  firestore,
  auth: () => ({
    verifyIdToken: async token => {
      if (!claims[token]) throw new Error('Invalid token');
      return { ...claims[token] };
    }
  })
};

const sandbox = {
  require: name => name === 'firebase-admin' ? firebase : name === 'dotenv' ? { config() {} }
    : name === './whatsapp-bot' || name === './backup-service' ? {} : backendRequire(name),
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199'
    },
    on() {},
    uptime: () => 1
  },
  console: { log() {}, info() {}, warn() {}, error() {} },
  Buffer,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), sandbox, { filename: serverPath });

(async () => {
  const server = sandbox.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, token, body) {
    const response = await fetch(base + route, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const kpiA = await request('GET', '/api/kpi/metrics?clinicId=clinic-b', 'clinic-a-token');
    assert.equal(kpiA.status, 200);
    assert.equal(kpiA.body.totalCases, 1);
    assert.equal(kpiA.body.completedCasesCount, 0);

    const kpiB = await request('GET', '/api/kpi/metrics', 'clinic-b-token');
    assert.equal(kpiB.status, 200);
    assert.equal(kpiB.body.totalCases, 1);
    assert.equal(kpiB.body.completedCasesCount, 1);

    const denied = await request('POST', '/api/admin/assign-case', 'clinic-a-token', {
      caseId: 'case-b',
      doctorId: 'doctor-a',
      doctorName: 'Clinic A Doctor'
    });
    assert.equal(denied.status, 403);

    const allowed = await request('POST', '/api/admin/assign-case', 'clinic-a-token', {
      caseId: 'case-a',
      doctorId: 'doctor-a',
      doctorName: 'Clinic A Doctor',
      clinicId: 'clinic-b'
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.equal(docs.cases.get('case-a').clinicId, 'clinic-a');

    console.log('PASS: API clinic isolation blocks foreign clinic IDs for KPI and case assignment.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
