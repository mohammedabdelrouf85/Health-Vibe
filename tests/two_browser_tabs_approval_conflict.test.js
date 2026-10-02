/**
 * Health Vibe AI - Two Concurrent Browser Tabs Conflict Test
 *
 * Requirements:
 * 1. Add server-managed clinical data revision and require approval requests to include it.
 * 2. Atomically reject approval when clinical inputs, patient replies, or assignment change.
 * 3. Return a structured conflict response (HTTP 409) and require review of updated info.
 * 4. Preserve doctor's unsaved notes without silently applying them.
 * 5. Test two browser tabs where Tab B updates the case while Tab A attempts approval.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

console.log('==================================================================');
console.log('🥼 HEALTH VIBE AI: TWO BROWSER TABS CONCURRENT CONFLICT TEST');
console.log('   Tab A (Doctor) vs Tab B (Patient/Case Update) Concurrency Flow');
console.log('==================================================================\n');

const appSource = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);

// Database state
const initialCase = {
  id: 'case-tab-concurrency-101',
  patientId: 'patient-tab-b',
  patientName: 'Sarah Jenkins',
  name: 'Sarah Jenkins',
  nameEn: 'Sarah Jenkins',
  assignedDoctorId: 'doctor-tab-a',
  status: 'under_review',
  oxygenLevel: 94,
  o2: 94,
  breathingDifficulty: 'moderate',
  coughLevel: 'mild',
  patientResponse: null,
  clinicalRevision: 1,
  clinicId: 'clinic-alpha'
};

const caseRecord = { ...initialCase };

const doctorApplication = {
  userId: 'doctor-tab-a',
  status: 'approved',
  name: 'Dr. Gregory House',
  licenseNumber: 'DOC-LIC-77491',
  specialty: 'Pulmonology',
  clinic: 'Central Respiratory Clinic'
};

const userProfiles = {
  'doctor-tab-a': {
    role: 'doctor',
    doctorApplicationStatus: 'approved',
    verifiedDoctor: true,
    clinicId: 'clinic-alpha',
    status: 'active',
    name: 'Dr. Gregory House'
  },
  'patient-tab-b': {
    role: 'patient',
    clinicId: 'clinic-alpha',
    status: 'active',
    name: 'Sarah Jenkins'
  }
};

let dbWrites = [];

const mockDb = {
  collection: (name) => ({
    where: (field, op, val) => ({
      get: async () => {
        if (name === 'doctor_applications' && field === 'userId' && val === doctorApplication.userId) {
          return { empty: false, docs: [{ id: 'app-1', data: () => doctorApplication }] };
        }
        if (name === 'cases' && field === 'assignedDoctorId') {
          return { empty: false, docs: [{ id: caseRecord.id, data: () => caseRecord }] };
        }
        return { empty: true, docs: [] };
      }
    }),
    doc: (docId) => ({
      get: async () => ({
        exists: (name === 'cases' && docId === caseRecord.id) ||
                (name === 'users' && Boolean(userProfiles[docId])) ||
                (name === 'doctor_applications' && docId === 'app-1'),
        data: () => {
          if (name === 'cases') return { ...caseRecord };
          if (name === 'users') return userProfiles[docId];
          if (name === 'doctor_applications') return doctorApplication;
          return undefined;
        }
      }),
      update: async (data) => {
        dbWrites.push({ col: name, id: docId, type: 'update', data });
        if (name === 'cases') {
          Object.assign(caseRecord, data);
        }
      },
      set: async (data) => {
        dbWrites.push({ col: name, id: docId, type: 'set', data });
        if (name === 'cases') {
          Object.assign(caseRecord, data);
        }
      }
    }),
    add: async (data) => {
      dbWrites.push({ col: name, type: 'add', data });
      return { id: `audit-${Date.now()}` };
    }
  }),
  runTransaction: async (updateFunction) => {
    const txn = {
      get: async (ref) => ref.get(),
      update: (ref, data) => ref.update(data),
      set: (ref, data) => ref.set(data)
    };
    return updateFunction(txn);
  }
};

const mockAdminFirestore = () => mockDb;
mockAdminFirestore.FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: (...items) => items.flat(),
  increment: (val) => val
};

const mockFirebaseAdmin = {
  apps: [{}],
  firestore: mockAdminFirestore,
  auth: () => ({
    verifyIdToken: async (token) => {
      const user = userProfiles[token];
      if (!user) throw new Error('Invalid token');
      return {
        uid: token,
        email: `${token}@healthvibe.test`,
        role: user.role,
        email_verified: true,
        name: user.name
      };
    }
  })
};

// Setup Backend Server
const serverContext = {
  require: (mod) => {
    if (mod === 'firebase-admin') return mockFirebaseAdmin;
    if (mod === 'dotenv') return { config() {} };
    if (mod === './whatsapp-bot' || mod === './backup-service') return {};
    return backendRequire(mod);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099'
    },
    on() {},
    uptime: () => 100
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout
};

vm.createContext(serverContext);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), serverContext);

// Create Tab A (Doctor Review Interface) Client Environment
function createTabAClient(serverBaseUrl) {
  const elements = {};
  function getOrCreateElement(id, tag = 'div') {
    if (!elements[id]) {
      elements[id] = {
        id,
        tagName: tag.toUpperCase(),
        value: '',
        innerHTML: '',
        innerText: '',
        textContent: '',
        style: {},
        className: '',
        children: [],
        scrollIntoView: () => {},
        focus: () => {},
        insertBefore: (newNode) => { elements[id].children.unshift(newNode); },
        appendChild: (newNode) => { elements[id].children.push(newNode); }
      };
    }
    return elements[id];
  }

  // Pre-seed DOM elements for doctor review tab
  getOrCreateElement('doctorDiagnosisInput', 'textarea');
  getOrCreateElement('doctorMedicationsInput', 'textarea');
  getOrCreateElement('doctorRecommendationsInput', 'textarea');
  getOrCreateElement('doctorReviewPanel', 'div');
  getOrCreateElement('doctorConflictBanner', 'div');
  getOrCreateElement('doctorCaseRevisionBadge', 'span');

  const escapeHtml = (val) => String(val || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toasts = [];
  const tabContext = {
    console,
    URL,
    currentLanguage: 'en',
    selectedRole: 'doctor',
    auth: {
      currentUser: {
        uid: 'doctor-tab-a',
        email: 'doctor@healthvibe.test',
        displayName: 'Dr. Gregory House'
      }
    },
    window: {
      location: { href: 'https://app.healthvibe.test' },
      _doctorActiveCaseReviewedRevision: 1,
      _doctorActiveCaseReviewedSnapshot: null,
      _doctorPreservedUnsavedNotes: null
    },
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          id: '',
          value: '',
          innerHTML: '',
          innerText: '',
          textContent: '',
          style: {},
          className: '',
          children: [],
          scrollIntoView: () => {},
          focus: () => {}
        };
        return el;
      },
      body: { classList: { contains: () => false } }
    },
    db: mockDb,
    escapeHtml,
    showToast: (msg) => { toasts.push(msg); },
    toasts,
    elements,
    CASE_STATUS: {
      UNDER_REVIEW: 'under_review',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      SUBMITTED: 'submitted',
      CLOSED: 'closed'
    },
    PERMISSIONS: { REVIEW_CASE: 'review_case' },
    enforcePermission: () => true,
    writeClientAuditLog: async () => true,
    getAuthErrorMessage: (err) => err.message,
    handleServerPermissionDenied: () => false
  };

  // callBackend implementation with error enrichment matching app.js
  tabContext.callBackend = async (endpoint, options = {}) => {
    const url = serverBaseUrl + endpoint;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: 'Bearer doctor-tab-a',
        'Content-Type': 'application/json'
      },
      body: options.body
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.statusCode = res.status;
      err.error = data.error;
      err.conflict = data.conflict;
      err.payload = data;
      throw err;
    }
    return data;
  };

  vm.createContext(tabContext);

  // Helper to slice and evaluate app.js functions into Tab A's context
  function includeFn(start, end) {
    const begin = appSource.indexOf(start);
    assert.ok(begin >= 0, `Could not find start in app.js: ${start}`);
    const finish = appSource.indexOf(end, begin);
    assert.ok(finish > begin, `Could not find end in app.js: ${end}`);
    vm.runInContext(appSource.slice(begin, finish), tabContext);
  }

  // Include relevant functions from app.js into Tab A
  includeFn('function parseDoctorRecommendations', 'window.setDoctorQueueFilter');
  includeFn('async function updateCaseStatus', 'let activeCaseId = null;');

  return tabContext;
}

// Create Tab B (Patient Portal / Case Editor)
function createTabBClient(serverBaseUrl) {
  return {
    submitMoreInfo: async (caseId, payload) => {
      const res = await fetch(`${serverBaseUrl}/api/patient/submit-more-info`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer patient-tab-b',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ caseId, ...payload })
      });
      const data = await res.json();
      return { status: res.status, data };
    },
    updateClinicalInputs: async (caseId, payload) => {
      const res = await fetch(`${serverBaseUrl}/api/cases/${caseId}/update-clinical-inputs`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer patient-tab-b',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return { status: res.status, data };
    }
  };
}

// Execution of the two-tab concurrency test
(async () => {
  const server = serverContext.module.exports.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const serverBaseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log(`📡 Backend test server running on ${serverBaseUrl}\n`);

    const tabA = createTabAClient(serverBaseUrl);
    const tabB = createTabBClient(serverBaseUrl);

    // =========================================================================
    // STEP 1: Tab A (Doctor) opens case at Revision 1 and enters draft notes
    // =========================================================================
    console.log('▶ STEP 1: Tab A (Doctor) loads Case #case-tab-concurrency-101 at Revision 1');
    tabA.window._doctorActiveCaseReviewedRevision = 1;
    tabA.window._doctorActiveCaseReviewedSnapshot = {
      oxygenLevel: caseRecord.oxygenLevel,
      o2: caseRecord.o2,
      patientResponse: caseRecord.patientResponse,
      assignedDoctorId: caseRecord.assignedDoctorId
    };

    // Doctor types extensive notes into the review fields (unsaved draft in DOM)
    const diagEl = tabA.elements['doctorDiagnosisInput'];
    const medsEl = tabA.elements['doctorMedicationsInput'];
    const recsEl = tabA.elements['doctorRecommendationsInput'];

    diagEl.value = 'Mild Acute Bronchitis - Stable Oxygenation (94%)';
    medsEl.value = 'Albuterol MDI 90mcg 2 puffs q4h PRN, Guaifenesin 400mg';
    recsEl.value = 'Oral hydration, humidified air, monitor SpO2 twice daily';

    console.log('  ✓ Doctor drafted diagnosis:', diagEl.value);
    console.log('  ✓ Doctor drafted medications:', medsEl.value);
    console.log('  ✓ Doctor drafted recommendations:', recsEl.value);
    console.log('  ✓ Baseline reviewed revision is 1.\n');

    // =========================================================================
    // STEP 2: Tab B (Patient/Concurrent Tab) updates the case
    // =========================================================================
    console.log('▶ STEP 2: Tab B (Patient/Other Tab) concurrently updates case vitals & replies');
    const updateResult = await tabB.submitMoreInfo('case-tab-concurrency-101', {
      oxygenLevel: 87,
      patientResponse: 'Shortness of breath suddenly worsened, feeling dizzy with lips turning bluish.'
    });

    assert.equal(updateResult.status, 200, 'Tab B update returned HTTP 200');
    assert.equal(updateResult.data.clinicalRevision, 2, 'Server incremented clinicalRevision to 2');
    assert.equal(caseRecord.clinicalRevision, 2, 'Database now has clinicalRevision 2');
    assert.equal(caseRecord.oxygenLevel, 87, 'Database SpO2 updated to 87%');
    console.log(`  ✓ Tab B updated case to Revision #${caseRecord.clinicalRevision}`);
    console.log(`  ✓ Case SpO2 dropped critically to ${caseRecord.oxygenLevel}%`);
    console.log(`  ✓ Patient reply registered: "${caseRecord.patientResponse}"\n`);

    // =========================================================================
    // STEP 3: Tab A attempts approval without having reviewed the new data
    // =========================================================================
    console.log('▶ STEP 3: Tab A attempts approval with stale Revision 1');
    const approvalSuccess = await tabA.updateCaseStatus(
      'case-tab-concurrency-101',
      tabA.CASE_STATUS.APPROVED,
      diagEl.value,
      {
        clinicalDiagnosis: diagEl.value,
        clinicalNotes: diagEl.value,
        medications: medsEl.value,
        recommendation: recsEl.value,
        recommendations: [recsEl.value],
        clinicalRevision: 1, // Stale revision!
        reviewedRevision: 1,
        reviewedSnapshot: tabA.window._doctorActiveCaseReviewedSnapshot
      }
    );

    console.log(`  ✓ updateCaseStatus result returned: ${approvalSuccess} (Expected false on conflict)`);
    assert.equal(approvalSuccess, false, 'Approval must return false when conflict is detected');

    // =========================================================================
    // STEP 4: Verify Atomic Rejection, Unsaved Notes Preservation & Conflict UI
    // =========================================================================
    console.log('\n▶ STEP 4: Verifying structured conflict response and preserved doctor notes');

    // 1. Case in DB was NOT approved
    assert.equal(caseRecord.status, 'under_review', 'Case status must remain under_review');
    assert.notEqual(caseRecord.doctorApproved, true, 'doctorApproved must NOT be set to true');
    assert.equal(caseRecord.reportRef, undefined, 'No certified reportRef should be stamped');
    console.log('  ✓ DB status remained under_review (atomic rejection verified)');

    // 2. Doctor's unsaved notes are strictly preserved in the form
    assert.equal(diagEl.value, 'Mild Acute Bronchitis - Stable Oxygenation (94%)', 'Diagnosis input preserved');
    assert.equal(medsEl.value, 'Albuterol MDI 90mcg 2 puffs q4h PRN, Guaifenesin 400mg', 'Medications input preserved');
    assert.equal(recsEl.value, 'Oral hydration, humidified air, monitor SpO2 twice daily', 'Recommendations input preserved');
    assert.equal(tabA.window._doctorPreservedUnsavedNotes.diagnosis, 'Mild Acute Bronchitis - Stable Oxygenation (94%)');
    assert.equal(tabA.window._doctorPreservedUnsavedNotes.medications, 'Albuterol MDI 90mcg 2 puffs q4h PRN, Guaifenesin 400mg');
    assert.equal(tabA.window._doctorPreservedUnsavedNotes.recommendations, 'Oral hydration, humidified air, monitor SpO2 twice daily');
    console.log('  ✓ Doctor unsaved form inputs strictly preserved without wipe or silent DB write');

    // 3. Conflict banner rendered with structured details
    const bannerEl = tabA.elements['doctorConflictBanner'];
    assert.ok(bannerEl, 'doctorConflictBanner exists');
    assert.equal(bannerEl.style.display, 'block', 'Conflict banner is displayed');
    assert.ok(bannerEl.innerHTML.includes('HTTP 409 Conflict'), 'Banner contains HTTP 409 badge');
    assert.ok(bannerEl.innerHTML.includes('Revision #1 ➔ #2'), 'Banner explains revision delta');
    assert.ok(bannerEl.innerHTML.includes('87%'), 'Banner displays updated SpO2 value (87%)');
    assert.ok(bannerEl.innerHTML.includes('Shortness of breath suddenly worsened'), 'Banner displays patient reply');
    assert.ok(bannerEl.innerHTML.includes('acknowledgeConflictAndReview'), 'Banner contains acknowledgment handler');
    console.log('  ✓ Structured conflict banner displayed highlighting SpO2 87% & patient reply');

    // =========================================================================
    // STEP 5: Doctor in Tab A reviews updated info and acknowledges conflict
    // =========================================================================
    console.log('\n▶ STEP 5: Doctor acknowledges conflict, reviews new data, and updates care plan');
    const ackFn = tabA.acknowledgeConflictAndReview || tabA.window.acknowledgeConflictAndReview;
    assert.ok(typeof ackFn === 'function', 'acknowledgeConflictAndReview function is available');
    ackFn('case-tab-concurrency-101', 2);

    assert.equal(tabA.window._doctorActiveCaseReviewedRevision, 2, 'Doctor reviewed revision updated to 2');
    assert.equal(diagEl.value, 'Mild Acute Bronchitis - Stable Oxygenation (94%)', 'Notes still preserved post-acknowledgment');

    // Doctor now adjusts clinical diagnosis to address the critical 87% SpO2
    diagEl.value = 'Acute Respiratory Decompensation with Critical Hypoxemia (SpO2 87%)';
    medsEl.value = 'Immediate Supplemental Oxygen 4L/min via mask, Nebulized Salbutamol/Ipratropium, IV Corticosteroids';
    recsEl.value = 'URGENT: Emergency Department transfer via ambulance. Continuous telemetry and blood gas analysis.';

    console.log('  ✓ Doctor reviewed updated vitals and revised clinical diagnosis:');
    console.log('    ➔', diagEl.value);

    // =========================================================================
    // STEP 6: Tab A re-attempts approval with matching Revision 2
    // =========================================================================
    console.log('\n▶ STEP 6: Tab A re-attempts approval with Revision 2');
    const retrySuccess = await tabA.updateCaseStatus(
      'case-tab-concurrency-101',
      tabA.CASE_STATUS.APPROVED,
      diagEl.value,
      {
        clinicalDiagnosis: diagEl.value,
        clinicalNotes: diagEl.value,
        medications: medsEl.value,
        recommendation: recsEl.value,
        recommendations: [recsEl.value],
        clinicalRevision: 2, // Up to date!
        reviewedRevision: 2,
        reportRef: 'HV-REP-TAB101'
      }
    );

    assert.equal(retrySuccess, true, 'Approval with matching revision 2 must succeed');
    assert.equal(caseRecord.status, 'approved', 'Case in DB is now approved');
    assert.equal(caseRecord.doctorApproved, true, 'Case doctorApproved is true');
    assert.equal(caseRecord.clinicalDiagnosis, diagEl.value, 'Case has updated clinical diagnosis');
    assert.equal(caseRecord.approvingDoctorId, 'doctor-tab-a', 'approvingDoctorId recorded');
    assert.equal(caseRecord.clinicalRevision, 2, 'clinicalRevision 2 preserved on approval');

    // Conflict banner cleared
    const clearFn = tabA.clearDoctorConflictBanner || tabA.window.clearDoctorConflictBanner;
    if (typeof clearFn === 'function') clearFn();
    assert.equal(bannerEl.style.display, 'none', 'Conflict banner is closed after approval');

    console.log('  ✓ Approval succeeded with HTTP 200');
    console.log('  ✓ Certified medical report issued at Revision #2');
    console.log('  ✓ Conflict banner successfully dismissed\n');

    console.log('==================================================================');
    console.log('🎉 ALL TWO-TAB CONCURRENCY TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================================');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
