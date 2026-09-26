const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const appSource = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const record = { id: 'case-clinical', patientId: 'patient-1', assignedDoctorId: 'doctor-1', status: 'under_review', oxygenLevel: 85 };
let application = { userId: 'doctor-1', status: 'approved', name: 'Verified Doctor', licenseNumber: 'VERIFIED-LICENSE', specialty: 'Recorded specialty', clinic: 'Recorded clinic' };
let writes = 0;
const database = { collection: name => ({
  where: (field, op, uid) => ({ get: async () => ({ docs: name === 'cases' ? [{ id: record.id, data: () => record }] : (application && application.userId === uid ? [{ id: 'verified-app', data: () => application }] : []) }) }),
  doc: id => ({
    get: async () => ({ exists: name === 'cases' && id === record.id, data: () => record }),
    update: async data => { writes++; Object.assign(record, data); }
  }),
  add: async () => ({ id: 'audit-1' })
}) };
const firestore = () => database;
firestore.FieldValue = { serverTimestamp: () => '2026-09-26T10:00:00Z', arrayUnion: value => [value] };
const firebase = { apps: [{}], firestore, auth: () => ({ verifyIdToken: async token => ({ uid: token, email: `${token}@example.test`, role: token === 'doctor-1' ? 'doctor' : 'patient', email_verified: true }) }) };
const serverContext = {
  require: name => name === 'firebase-admin' ? firebase : name === 'dotenv' ? { config() {} }
    : name === './whatsapp-bot' || name === './backup-service' ? {} : backendRequire(name),
  module: { exports: {} }, __dirname: path.dirname(serverPath),
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
  console, Buffer, setTimeout, clearTimeout
};
vm.createContext(serverContext);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), serverContext);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const elements = {};
for (const name of ['reportContainer', 'resultContainer', 'chatInput', 'chatMessages']) elements[name] = { innerHTML: '', value: '', children: [], appendChild(child) { this.children.push(child); } };
const client = {
  console, URL, currentLanguage: 'ar', selectedRole: 'patient',
  auth: { currentUser: { uid: 'patient-1', email: 'patient@example.test' } },
  window: { location: { href: 'https://example.test' } },
  LOGO_MARK_ASSETS: { light: 'logo', dark: 'logo' },
  document: { body: { classList: { contains: () => false } }, getElementById: id => elements[id] || null, createElement: () => ({ innerHTML: '' }) },
  db: database, escapeHtml, normalizeRole: value => value,
  ROLES: { DOCTOR: 'doctor', PATIENT: 'patient', SUPER_ADMIN: 'super_admin' },
  CASE_STATUS: { APPROVED: 'approved', SUBMITTED: 'submitted', REJECTED: 'rejected', MORE_INFO_REQUESTED: 'more_info_requested' },
  isRealProductionRecord: () => true, toMillis: () => 0, getCaseStatusMeta: () => ({ icon: '', en: 'Pending', ar: 'قيد المراجعة' }), isTestOrDemoRecord: () => false, isOwnerUser: () => false, isAdminRole: () => false, isSupportRole: () => false, isSupportUser: () => false,
  isCaseApprovedForPatient: c => c.status === 'approved' && c.doctorApproved === true,
  maskUnapprovedPatientCase: c => c,
  REPORT_VERSION: '1', MODEL_VERSION: '1',
  getPatientDatabaseHistoryRecords: async () => [{ ...record }],
  getClinicalGuardrailDisclaimer: () => '',
  evaluateClinicalGuardrails: () => ({ triggered: false })
};
vm.createContext(client);
function include(start, end) {
  const begin = appSource.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = appSource.indexOf(end, begin);
  assert.ok(finish > begin, end);
  vm.runInContext(appSource.slice(begin, finish), client);
}
include('function recordedClinicalText', 'window.setDoctorQueueFilter');
include('async function renderReportScreen', 'async function renderResultScreen');
include('async function renderResultScreen', 'async function renderPatientHistory');
include('async function getLatestApprovedReportForAssistant', 'async function renderAssistantScreen');
include('async function handleSendChatMessage', 'window.sendAssistantQuickPrompt');
include('window.generateAndApproveReport =', 'window.openCaseReport =');

(async () => {
  const server = serverContext.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, token, body) {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  client.callBackend = async route => {
    const result = await request(route, 'patient-1');
    if (result.status !== 200) throw new Error(result.data.error);
    return result.data;
  };
  try {
    const approval = { caseId: record.id, clinicalDiagnosis: 'Recorded diagnosis', clinicalNotes: 'Recorded note', recommendations: ['Recorded instruction'], medications: '', approvingDoctorName: 'FORGED', doctorLicense: 'FORGED' };
    let result = await request('/api/doctor/approve-clinical-case', 'doctor-1', approval);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(record.medications, '');
    assert.equal(record.doctorLicense, 'VERIFIED-LICENSE');
    assert.equal(record.approvingDoctorName, 'Verified Doctor');
    assert.equal(record.doctorIdentity.applicationId, 'verified-app');
    assert.equal((await request(`/api/reports/${record.id}/doctor-identity`, 'unrelated-patient')).status, 403);
    for (const language of ['ar', 'en']) {
      client.currentLanguage = language;
      const missing = language === 'ar' ? 'غير مسجل' : 'Not recorded';
      for (const medications of [undefined, null, '', '   ']) {
        record.medications = medications;
        await client.renderReportScreen(record.id);
        const html = elements.reportContainer.innerHTML;
        assert.ok(html.includes('official-certified-report'), html.slice(-300));
        assert.ok(html.includes('Recorded diagnosis'));
        assert.ok(html.includes('VERIFIED-LICENSE'));
        assert.ok(html.includes(missing));
        assert.doesNotMatch(html, /Salbutamol|سالبوتامول|Prednisolone|فاركولين|EGY-MED|FORGED/);
        for (const query of ['medication', 'diagnosis', 'advice', 'doctor', 'summary']) {
          for (const type of (query === 'medication' ? [null, 'treatment_prohibited', 'diagnosis_prohibited'] : [null])) {
            client.evaluateClinicalGuardrails = () => ({ triggered: Boolean(type), type, message: 'Guardrail' });
            elements.chatInput.value = query;
            await client.handleSendChatMessage();
            const reply = elements.chatMessages.children.at(-1).innerHTML;
            assert.doesNotMatch(reply, /Salbutamol|سالبوتامول|Prednisolone|فاركولين|EGY-MED|FORGED/);
            if (type === 'treatment_prohibited' || (!type && query === 'medication')) assert.ok(reply.includes(missing), reply);
          }
        }
      }
    }
    record.clinicalDiagnosis = '';
    record.doctorNote = 'This note is not a diagnosis';
    record.recommendations = [];
    assert.equal(client.getRecordedClinicalContent(record, false).diag, 'غير مسجل');
    assert.equal(client.getRecordedClinicalContent(record, false).recs[0], 'غير مسجل');
    await client.renderResultScreen();
    assert.ok(elements.resultContainer.innerHTML.includes('Not recorded'));
    assert.doesNotMatch(elements.resultContainer.innerHTML, /Monitor oxygen level twice daily|Follow-up with your doctor within 24-48/);
    delete record.oxygenLevel;
    await client.renderReportScreen(record.id);
    assert.doesNotMatch(elements.reportContainer.innerHTML, /95%|3 Days|Optimal Normal/);
    record.medications = 'Doctor recorded medication only';
    await client.renderReportScreen(record.id);
    assert.ok(elements.reportContainer.innerHTML.includes(record.medications));
    // Older free-text credentials cannot masquerade as verified credentials.
    application = null;
    await client.renderReportScreen(record.id);
    assert.ok(!elements.reportContainer.innerHTML.includes('VERIFIED-LICENSE'));
    record.status = 'under_review';
    const before = writes;
    result = await request('/api/doctor/approve-clinical-case', 'doctor-1', approval);
    assert.equal(result.status, 403);
    assert.equal(writes, before);
    // Unapproved records cannot expose diagnosis or medication in the assistant.
    client.evaluateClinicalGuardrails = () => ({ triggered: false });
    elements.chatInput.value = 'medication';
    await client.handleSendChatMessage();
    assert.ok(!elements.chatMessages.children.at(-1).innerHTML.includes('Doctor recorded medication only'));
    // Approval UI never fills empty medication fields automatically.
    let submitted;
    Object.assign(client, { enforcePermission: () => true, PERMISSIONS: { APPROVE_CASE: 'approve' }, showToast() {}, updateCaseStatus: async (...args) => { submitted = args; return false; } });
    elements.doctorDiagnosisInput = { value: 'Recorded diagnosis' };
    elements.doctorMedicationsInput = { value: '' };
    elements.doctorRecommendationsInput = { value: 'Recorded recommendation' };
    await client.window.generateAndApproveReport(record.id);
    assert.equal(submitted[3].medications, '');
    // Backend failure must never fall back to a direct client approval write.
    include('async function updateCaseStatus', 'let activeCaseId');
    client.PERMISSIONS.REVIEW_CASE = 'review';
    client.callBackend = async () => { throw new Error('Backend unavailable'); };
    client.handleServerPermissionDenied = () => false;
    client.getAuthErrorMessage = err => err.message;
    const beforeFailure = writes;
    assert.equal(await client.updateCaseStatus(record.id, 'approved', 'Recorded note', { clinicalDiagnosis: 'Recorded diagnosis', recommendations: ['Recorded instruction'] }), false);
    assert.equal(writes, beforeFailure);
    const { buildResultReadyEmail } = backendRequire('./notification-service');
    const email = buildResultReadyEmail({ caseId: record.id, medications: '', recommendations: [] });
    assert.ok(email.html.includes('غير مسجل'));
    assert.doesNotMatch(email.html, /منى سامي|متابعة العلامات الحيوية والراحة التامة/);
    assert.ok(!appSource.includes('synthesizeClinicalAssessment'));
    console.log('PASS: real approval API, verified credentials, report HTML, assistant branches, empty prescriptions, and email regression tests.');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
