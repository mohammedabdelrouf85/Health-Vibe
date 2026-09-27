const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');

function makeElement(id) {
  const element = {
    id,
    _innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; }
  };
  Object.defineProperty(element, 'innerHTML', {
    get() { return this._innerHTML; },
    set(value) {
      this._innerHTML = String(value);
      if (value === '') this.children = [];
    }
  });
  return element;
}

const elements = {
  doctorQueueList: makeElement('doctorQueueList'),
  doctorReviewPanel: makeElement('doctorReviewPanel'),
  doctorQueueCount: makeElement('doctorQueueCount')
};

const context = {
  console,
  Date,
  state: {},
  currentLanguage: 'en',
  selectedRole: 'doctor',
  activeCaseId: null,
  auth: { currentUser: { uid: 'doctor-1', email: 'doctor1@example.test' } },
  ROLES: { DOCTOR: 'doctor' },
  CASE_STATUS: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    TRIAGED: 'triaged',
    ASSIGNED: 'assigned',
    UNDER_REVIEW: 'under_review',
    MORE_INFO_REQUESTED: 'more_info_requested',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ESCALATED: 'escalated',
    CLOSED: 'closed',
    PENDING: 'pending'
  },
  document: {
    getElementById: id => elements[id] || null,
    createElement: tag => ({ ...makeElement(tag), tagName: tag.toUpperCase() })
  },
  window: {},
  escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  toMillis: value => {
    if (!value) return 0;
    if (value.toMillis) return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  },
  isRealProductionRecord: c => !c.isDemo && !c.isTest,
  isTestOrDemoRecord: c => Boolean(c.isDemo || c.isTest),
  updateDoctorMiniKpiBar() {},
  selectDoctorCase(id) { context.activeCaseId = id; },
  getCaseStatusMeta: status => ({ icon: '', en: status, ar: status, pillClass: 'pending' })
};

vm.createContext(context);

function include(start, end) {
  const begin = appSource.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = appSource.indexOf(end, begin);
  assert.ok(finish > begin, end);
  vm.runInContext(appSource.slice(begin, finish), context);
}

include('let activeCaseId = null;', 'window.applyDiagPreset');
include('function renderDoctorQueueItems', 'async function renderDoctorQueue');
vm.runInContext(`
  globalThis.renderDoctorQueueItems = renderDoctorQueueItems;
  globalThis.setQueueState = function(filter, priority, sort, search) {
    currentDoctorQueueFilter = filter;
    currentDoctorPriorityFilter = priority;
    currentDoctorQueueSort = sort;
    currentDoctorQueueSearch = search;
  };
`, context);

function assignedCase(id, overrides = {}) {
  return {
    id,
    patientId: `patient-${id}`,
    patientName: `Patient ${id}`,
    patientEmail: `${id}@example.test`,
    assignedDoctorId: 'doctor-1',
    status: 'assigned',
    o2: 96,
    symptoms: 'cough',
    submittedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    ...overrides
  };
}

context.renderDoctorQueueItems([]);
assert.match(elements.doctorQueueList.innerHTML, /No Real Patient Cases in Queue/);

const largeQueue = Array.from({ length: 140 }, (_, index) => assignedCase(`case-${index}`, {
  o2: index % 10 === 0 ? 88 : (index % 5 === 0 ? 91 : 97),
  priority: index % 10 === 0 ? 'urgent' : (index % 5 === 0 ? 'high' : 'normal'),
  submittedAt: new Date(Date.now() - (index + 1) * 60000).toISOString()
}));
largeQueue.push(assignedCase('unassigned-hidden', { assignedDoctorId: 'doctor-2', patientName: 'Invisible Patient', o2: 85, priority: 'urgent' }));

context.setQueueState('all', 'all', 'waiting_desc', '');
context.state.doctorQueue = largeQueue;
context.renderDoctorQueueItems(largeQueue);
assert.equal(elements.doctorQueueList.children.length, 140);
assert.ok(!elements.doctorQueueList.children.some(child => child.dataset.caseId === 'unassigned-hidden'));

context.window.setDoctorPriorityFilter('urgent');
assert.equal(elements.doctorQueueList.children.length, 14);
assert.ok(elements.doctorQueueList.children.every(child => child.innerHTML.includes('Urgent')));

context.window.setDoctorQueueSearch('patient case-139');
assert.equal(elements.doctorQueueList.children.length, 0, 'search is applied on top of the active urgent filter');

context.window.setDoctorPriorityFilter('all');
context.window.setDoctorQueueSearch('patient case-139');
assert.equal(elements.doctorQueueList.children.length, 1);
assert.equal(elements.doctorQueueList.children[0].dataset.caseId, 'case-139');

context.window.setDoctorQueueSearch('');
context.window.setDoctorQueueSort('priority_desc');
assert.match(elements.doctorQueueList.children[0].innerHTML, /Urgent/);

console.log('PASS: doctor queue filters, search, sorting, empty/large queues, and unassigned doctor isolation.');
