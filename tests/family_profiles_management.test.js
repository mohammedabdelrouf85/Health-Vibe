/**
 * Health Vibe AI - Family Profiles & Dependents Management Test Suite
 *
 * Verifies:
 * 1. Family member validation, boundary limits & relationship catalog.
 * 2. Exact calendar age calculation and demographic categorization (elderly, child, infant).
 * 3. Dynamic BMI calculation and clinical biometrics.
 * 4. Active profile switching, persistence, and event dispatching.
 * 5. Medical record segregation and case tagging (zero cross-dependent leakage).
 * 6. Backend REST API endpoints (GET, POST, PUT, DELETE /api/patient/family-members) & Audit Trail.
 * 7. UI accessibility, responsive mobile sheet styling, and bilingual i18n key parity.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { createRequire } = require('module');

const familyService = require('../app/modules/patient/family-service');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('👨‍👩‍👧‍👦 HEALTH VIBE AI: FAMILY PROFILES & DEPENDENTS TEST SUITE');
console.log('   Clinical Segregation, Age/BMI Computation, REST API & A11y');
console.log('==================================================================\n');

// Mock User Accounts for Multi-User Isolation Testing
const userAccounts = {
  'token-primary-ahmad': {
    uid: 'usr_primary_ahmad',
    role: 'patient',
    name: 'Ahmad Mansour',
    email: 'ahmad.mansour@example.com',
    email_verified: true
  },
  'token-primary-sara': {
    uid: 'usr_primary_sara',
    role: 'patient',
    name: 'Sara El-Sayed',
    email: 'sara.elsayed@example.com',
    email_verified: true
  },
  'token-doctor-tarek': {
    uid: 'dr_tarek_001',
    role: 'doctor',
    name: 'Dr. Tarek Mahmoud',
    email: 'tarek@healthvibes.org',
    email_verified: true
  }
};

// Mock In-Memory Firestore Database
function createMockFirestore() {
  const store = {};

  function getCollection(colName) {
    if (!store[colName]) store[colName] = new Map();
    return store[colName];
  }

  return {
    _store: store,
    collection(colName) {
      const colMap = getCollection(colName);
      return {
        doc(docId) {
          const id = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          return {
            id,
            async get() {
              const data = colMap.get(id);
              return {
                id,
                exists: Boolean(data),
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set(data, options = {}) {
              const prev = colMap.get(id) || {};
              const merged = (options && options.merge) ? { ...prev, ...data } : { ...data };
              colMap.set(id, merged);
              return { writeTime: new Date() };
            },
            async update(data) {
              const prev = colMap.get(id);
              if (!prev) throw new Error(`Document ${id} does not exist for update`);
              const updated = { ...prev, ...data };
              colMap.set(id, updated);
              return { writeTime: new Date() };
            },
            async delete() {
              colMap.delete(id);
            }
          };
        },
        async add(data) {
          const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          colMap.set(id, { ...data, id });
          return {
            id,
            async get() {
              return { id, exists: true, data: () => data };
            }
          };
        },
        where(field, op, val) {
          return {
            async get() {
              const allDocs = Array.from(colMap.entries()).map(([id, d]) => ({ id, ...d }));
              const filtered = allDocs.filter(d => {
                if (op === '==') return d[field] === val;
                if (op === 'in') return Array.isArray(val) && val.includes(d[field]);
                return true;
              });
              return {
                empty: filtered.length === 0,
                size: filtered.length,
                docs: filtered.map(d => ({
                  id: d.id,
                  data: () => ({ ...d })
                }))
              };
            }
          };
        }
      };
    }
  };
}

async function runTests() {
  let passedSuites = 0;
  const totalSuites = 7;

  // -----------------------------------------------------------------------------
  // SUITE 1: Family Member Validation, Boundary Limits & Relationship Catalog
  // -----------------------------------------------------------------------------
  console.log('▶ SUITE 1: Family Member Validation, Limits & Relationship Catalog');
  {
    const { validateFamilyMember, RELATIONSHIPS, VALID_BLOOD_TYPES } = familyService;

    // 1.1 Verify complete relationship catalog
    const expectedRelations = ['father', 'mother', 'son', 'daughter', 'infant', 'spouse', 'grandparent', 'other'];
    expectedRelations.forEach(rel => {
      assert.ok(RELATIONSHIPS[rel], `Relationship ${rel} must be present in catalog`);
      assert.ok(RELATIONSHIPS[rel].ar, `Relationship ${rel} must have Arabic translation`);
      assert.ok(RELATIONSHIPS[rel].en, `Relationship ${rel} must have English translation`);
    });

    // 1.2 Valid payload
    const validPayload = {
      name: 'فاطمة محمود',
      relationship: 'mother',
      dateOfBirth: '1962-04-10',
      sex: 'female',
      bloodType: 'A+',
      chronicDiseases: ['Hypertension', 'Type 2 Diabetes'],
      allergies: ['Penicillin'],
      currentMedications: ['Amlodipine 5mg', 'Metformin 500mg'],
      heightCm: 160,
      weightKg: 68,
      notes: 'تحتاج قياس الضغط صباحاً'
    };
    const validRes = validateFamilyMember(validPayload);
    assert.strictEqual(validRes.isValid, true, 'Valid payload must pass validation');
    assert.strictEqual(validRes.data.name, 'فاطمة محمود');
    assert.strictEqual(validRes.data.relationship, 'mother');
    assert.strictEqual(validRes.data.category, 'elderly');
    assert.strictEqual(validRes.data.bloodType, 'A+');
    assert.strictEqual(validRes.data.chronicDiseases.length, 2);
    assert.strictEqual(validRes.data.allergies.length, 1);

    // 1.3 Validation failure: Empty/Short name
    const invalidNameRes = validateFamilyMember({ ...validPayload, name: ' ' });
    assert.strictEqual(invalidNameRes.isValid, false);
    assert.ok(invalidNameRes.errors.some(e => e.includes('Name')));

    // 1.4 Validation failure: Invalid relationship
    const invalidRelRes = validateFamilyMember({ ...validPayload, relationship: 'neighbor' });
    assert.strictEqual(invalidRelRes.isValid, false);
    assert.ok(invalidRelRes.errors.some(e => e.includes('relationship')));

    // 1.5 Validation failure: Future birth date
    const futureDob = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];
    const invalidFutureDobRes = validateFamilyMember({ ...validPayload, dateOfBirth: futureDob });
    assert.strictEqual(invalidFutureDobRes.isValid, false);
    assert.ok(invalidFutureDobRes.errors.some(e => e.includes('future')));

    // 1.6 Validation failure: Impossible age (> 125)
    const impossibleDobRes = validateFamilyMember({ ...validPayload, dateOfBirth: '1850-01-01' });
    assert.strictEqual(impossibleDobRes.isValid, false);
    assert.ok(impossibleDobRes.errors.some(e => e.includes('125')));

    // 1.7 Blood type validation & normalization
    const invalidBloodRes = validateFamilyMember({ ...validPayload, bloodType: 'X_UNKNOWN' });
    assert.strictEqual(invalidBloodRes.isValid, false);
    assert.ok(invalidBloodRes.errors.some(e => e.includes('blood')));

    console.log('  ✓ Relationship catalog contains all 8 authentic familial roles.');
    console.log('  ✓ Schema enforces strict boundary limits on names, dates, ages, and blood types.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUITE 2: Exact Calendar Age Calculation & Demographic Categorization
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 2: Exact Calendar Age Calculation & Demographic Categorization');
  {
    const { calculateAge, categorizeDemographics, getAvatarMeta } = familyService;
    const refDate = new Date('2026-10-15T12:00:00Z');

    // 2.1 Calendar age edge cases
    // Birthday passed this year
    assert.strictEqual(calculateAge('1960-03-10', refDate), 66);
    // Birthday upcoming this year
    assert.strictEqual(calculateAge('1960-12-25', refDate), 65);
    // Birthday is today
    assert.strictEqual(calculateAge('2000-10-15', refDate), 26);
    // Infant under 1 year
    assert.strictEqual(calculateAge('2026-02-01', refDate), 0);

    // 2.2 Demographic categorization: Elderly (>= 60)
    assert.strictEqual(categorizeDemographics(60), 'elderly');
    assert.strictEqual(categorizeDemographics(75), 'elderly');

    // 2.3 Demographic categorization: Child (< 18 and >= 2)
    assert.strictEqual(categorizeDemographics(17), 'child');
    assert.strictEqual(categorizeDemographics(5), 'child');

    // 2.4 Demographic categorization: Infant (< 2)
    assert.strictEqual(categorizeDemographics(1), 'infant');
    assert.strictEqual(categorizeDemographics(0), 'infant');

    // 2.5 Demographic categorization: Adult (18-59)
    assert.strictEqual(categorizeDemographics(18), 'adult');
    assert.strictEqual(categorizeDemographics(35), 'adult');
    assert.strictEqual(categorizeDemographics(59), 'adult');

    // 2.6 Avatar metadata & emoji resolution
    const elderlyMaleMeta = getAvatarMeta({ calculatedAge: 70, sex: 'male', relationship: 'father' });
    assert.strictEqual(elderlyMaleMeta.category, 'elderly');
    assert.strictEqual(elderlyMaleMeta.emoji, '👴');
    assert.strictEqual(elderlyMaleMeta.badgeLabelAr, 'كبار سن');

    const elderlyFemaleMeta = getAvatarMeta({ calculatedAge: 68, sex: 'female', relationship: 'mother' });
    assert.strictEqual(elderlyFemaleMeta.emoji, '👵');

    const childMaleMeta = getAvatarMeta({ calculatedAge: 8, sex: 'male', relationship: 'son' });
    assert.strictEqual(childMaleMeta.category, 'child');
    assert.strictEqual(childMaleMeta.emoji, '👦');
    assert.strictEqual(childMaleMeta.badgeLabelAr, 'طفل');

    const infantMeta = getAvatarMeta({ calculatedAge: 1, sex: 'female', relationship: 'infant' });
    assert.strictEqual(infantMeta.category, 'infant');
    assert.strictEqual(infantMeta.emoji, '👶');
    assert.strictEqual(infantMeta.badgeLabelAr, 'رضيع');

    console.log('  ✓ Exact calendar age verified across all boundary conditions.');
    console.log('  ✓ Demographic classification accurately distinguishes elderly, children, infants, and adults.');
    console.log('  ✓ Avatar emojis and bilingual demographic tags assigned correctly.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUITE 3: Dynamic BMI Calculation & Clinical Biometrics
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 3: Dynamic BMI Calculation & Clinical Biometrics');
  {
    const { calculateBmi } = familyService;

    // 3.1 Normal BMI: 175 cm, 70 kg -> 70 / (1.75^2) = 22.857 -> 22.9
    const bmiNormal = calculateBmi(175, 70);
    assert.strictEqual(bmiNormal, 22.9);

    // 3.2 Underweight: 168 cm, 45 kg -> 45 / (1.68^2) = 15.94 -> 15.9
    const bmiUnder = calculateBmi(168, 45);
    assert.strictEqual(bmiUnder, 15.9);

    // 3.3 Overweight: 170 cm, 78 kg -> 78 / (1.70^2) = 26.989 -> 27.0
    const bmiOver = calculateBmi(170, 78);
    assert.strictEqual(bmiOver, 27.0);

    // 3.4 Obese: 165 cm, 95 kg -> 95 / (1.65^2) = 34.89 -> 34.9
    const bmiObese = calculateBmi(165, 95);
    assert.strictEqual(bmiObese, 34.9);

    // 3.5 Invalid / missing values
    assert.strictEqual(calculateBmi(null, 70), null);
    assert.strictEqual(calculateBmi(175, null), null);
    assert.strictEqual(calculateBmi(0, 70), null);
    assert.strictEqual(calculateBmi(-10, 70), null);

    console.log('  ✓ Dynamic BMI computation adheres to WHO clinical standards with 1-decimal precision.');
    console.log('  ✓ Robust handling of edge cases and missing biometric inputs.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUITE 4: Active Profile Switching, Persistence & Event Dispatching
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 4: Active Profile Switching, Persistence & Event Dispatching');
  {
    const testUid = 'usr_test_switching_101';

    // 4.1 Initial state: Primary profile is active
    const initialContext = familyService.getActiveProfile(testUid, { displayName: 'Ahmad Mansour' });
    assert.strictEqual(initialContext.isPrimary, true);
    assert.strictEqual(initialContext.memberId, null);
    assert.strictEqual(initialContext.profile.name, 'Ahmad Mansour');

    // 4.2 Add a family member and switch active context
    const addRes = familyService.addFamilyMember(testUid, {
      name: 'يوسف أحمد',
      relationship: 'son',
      dateOfBirth: '2018-06-15',
      sex: 'male',
      heightCm: 125,
      weightKg: 26
    });
    assert.strictEqual(addRes.success, true);
    const sonMember = addRes.member;

    // Switch to son
    let eventReceived = null;
    const mockWindow = {
      dispatchEvent: (evt) => { eventReceived = evt; }
    };
    const originalWindow = global.window;
    global.window = mockWindow;

    const switchedContext = familyService.setActiveProfile(testUid, sonMember.id);
    assert.strictEqual(switchedContext.isPrimary, false);
    assert.strictEqual(switchedContext.memberId, sonMember.id);
    assert.strictEqual(switchedContext.profile.name, 'يوسف أحمد');
    assert.strictEqual(switchedContext.profile.relationship, 'son');

    // Verify custom event dispatch
    assert.ok(eventReceived, 'familyProfileChanged event must be dispatched on window');
    assert.strictEqual(eventReceived.detail.primaryUid, testUid);
    assert.strictEqual(eventReceived.detail.activeProfileId, sonMember.id);
    assert.strictEqual(eventReceived.detail.isPrimary, false);
    assert.strictEqual(eventReceived.detail.profile.name, 'يوسف أحمد');

    // Switch back to Primary profile
    const revertedContext = familyService.setActiveProfile(testUid, 'primary');
    assert.strictEqual(revertedContext.isPrimary, true);
    assert.strictEqual(revertedContext.memberId, null);
    assert.strictEqual(eventReceived.detail.isPrimary, true);

    // Restore original window
    global.window = originalWindow;

    console.log('  ✓ Seamless profile switching without page reload.');
    console.log('  ✓ Dispatches custom DOM event "familyProfileChanged" with full context payload.');
    console.log('  ✓ Safe reversion back to primary account profile verified.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUITE 5: Medical Record Segregation & Case Tagging (Zero Data Leakage)
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 5: Medical Record Segregation & Case Tagging (Zero Cross-Leakage)');
  {
    const { tagCaseWithFamilyContext, filterRecordsByActiveProfile } = familyService;

    const primaryContext = { isPrimary: true, memberId: null, profile: { name: 'Ahmad' } };
    const grandmaContext = {
      isPrimary: false,
      memberId: 'fam_grandma_99',
      profile: {
        id: 'fam_grandma_99',
        name: 'فاطمة محمود',
        relationship: 'mother',
        category: 'elderly',
        dateOfBirth: '1955-08-12',
        calculatedAge: 71,
        sex: 'female'
      }
    };
    const sonContext = {
      isPrimary: false,
      memberId: 'fam_son_77',
      profile: {
        id: 'fam_son_77',
        name: 'يوسف أحمد',
        relationship: 'son',
        category: 'child',
        dateOfBirth: '2018-06-15',
        calculatedAge: 8,
        sex: 'male'
      }
    };

    // 5.1 Case Tagging: Primary case
    const rawCaseAhmad = { symptoms: 'كحة جافة', vitals: { spo2: 98, heartRate: 72 } };
    const taggedAhmad = tagCaseWithFamilyContext(rawCaseAhmad, primaryContext);
    assert.strictEqual(taggedAhmad.isFamilyMember, false);
    assert.strictEqual(taggedAhmad.familyMemberId, null);

    // 5.2 Case Tagging: Grandma case
    const rawCaseGrandma = { symptoms: 'ضيق تنفس مع خفقان', vitals: { spo2: 92, heartRate: 88 } };
    const taggedGrandma = tagCaseWithFamilyContext(rawCaseGrandma, grandmaContext);
    assert.strictEqual(taggedGrandma.isFamilyMember, true);
    assert.strictEqual(taggedGrandma.familyMemberId, 'fam_grandma_99');
    assert.strictEqual(taggedGrandma.patientName, 'فاطمة محمود');
    assert.strictEqual(taggedGrandma.familyRelationship, 'mother');
    assert.strictEqual(taggedGrandma.familyDemographicCategory, 'elderly');
    assert.strictEqual(taggedGrandma.patientAge, 71);
    assert.strictEqual(taggedGrandma.patientSex, 'female');

    // 5.3 Case Tagging: Son case
    const rawCaseSon = { symptoms: 'حمى ورشح', vitals: { spo2: 99, heartRate: 100 } };
    const taggedSon = tagCaseWithFamilyContext(rawCaseSon, sonContext);
    assert.strictEqual(taggedSon.isFamilyMember, true);
    assert.strictEqual(taggedSon.familyMemberId, 'fam_son_77');
    assert.strictEqual(taggedSon.familyDemographicCategory, 'child');

    // 5.4 Medical Record Segregation (filterRecordsByActiveProfile)
    const combinedClinicalHistory = [
      { id: 'case_001', isFamilyMember: false, diagnosis: 'Normal' },
      { id: 'case_002', isFamilyMember: true, familyMemberId: 'fam_grandma_99', diagnosis: 'COPD' },
      { id: 'case_003', isFamilyMember: true, familyMemberId: 'fam_son_77', diagnosis: 'Bronchitis' },
      { id: 'case_004', isFamilyMember: false, diagnosis: 'Seasonal Allergies' },
      { id: 'case_005', isFamilyMember: true, familyMemberId: 'fam_grandma_99', diagnosis: 'Hypertension follow-up' }
    ];

    // Primary view: MUST only contain Ahmad's cases (cases 1 and 4)
    const primaryView = filterRecordsByActiveProfile(combinedClinicalHistory, primaryContext);
    assert.strictEqual(primaryView.length, 2);
    assert.deepStrictEqual(primaryView.map(c => c.id), ['case_001', 'case_004']);
    assert.ok(!primaryView.some(c => c.diagnosis === 'COPD'), 'Grandma COPD must NOT leak to Primary profile');
    assert.ok(!primaryView.some(c => c.familyMemberId === 'fam_son_77'), 'Son records must NOT leak to Primary profile');

    // Grandma view: MUST only contain Grandma's cases (cases 2 and 5)
    const grandmaView = filterRecordsByActiveProfile(combinedClinicalHistory, grandmaContext);
    assert.strictEqual(grandmaView.length, 2);
    assert.deepStrictEqual(grandmaView.map(c => c.id), ['case_002', 'case_005']);
    assert.ok(!grandmaView.some(c => c.id === 'case_001'), 'Primary cases must NOT leak to Grandma profile');
    assert.ok(!grandmaView.some(c => c.id === 'case_003'), 'Son cases must NOT leak to Grandma profile');

    // Son view: MUST only contain Son's cases (case 3)
    const sonView = filterRecordsByActiveProfile(combinedClinicalHistory, sonContext);
    assert.strictEqual(sonView.length, 1);
    assert.deepStrictEqual(sonView.map(c => c.id), ['case_003']);

    console.log('  ✓ Case tagging accurately enriches clinical assessment with dependent demographics.');
    console.log('  ✓ 100% Medical record segregation: Zero data leakage between primary and family profiles.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUITE 6: Backend REST API Endpoints & Enterprise Audit Logging
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 6: Backend REST API Endpoints & Enterprise Audit Logging');
  {
    // Load Sandboxed Express Server
    const serverPath = path.resolve(__dirname, '../backend/server.js');
    const mockDb = createMockFirestore();

    const mockFirebase = {
      apps: [{}],
      firestore: () => mockDb,
      auth: () => ({
        verifyIdToken: async (token) => {
          const u = userAccounts[token];
          if (!u) throw new Error(`Unknown mock token: ${token}`);
          return { ...u };
        }
      })
    };

    const backendRequireInstance = createRequire(serverPath);
    const backendRequire = (mod) => {
      if (mod === 'firebase-admin') return mockFirebase;
      if (mod === 'dotenv') return { config() {} };
      if (['./whatsapp-bot', './backup-service'].includes(mod)) return {};
      return backendRequireInstance(mod);
    };

    const sandbox = {
      require: backendRequire,
      module: { exports: {} },
      __dirname: path.dirname(serverPath),
      process: {
        env: {
          NODE_ENV: 'development',
          FIREBASE_PROJECT_ID: 'health-vibes-dev',
          EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
          USE_FIREBASE_EMULATOR: 'true'
        },
        on() {},
        uptime: () => 1
      },
      console,
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(serverPath, 'utf8'), sandbox);
    const sandboxedApp = sandbox.module.exports;

    const server = sandboxedApp.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(method, route, token = null, body = null) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(base + route, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const parsed = await res.json().catch(() => ({}));
      return { status: res.status, body: parsed };
    }

    try {
      // 6.1 Unauthenticated access -> 401
      const unauthRes = await request('GET', '/api/patient/family-members');
      assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must be rejected with 401');

      // 6.2 GET initially empty for Ahmad
      const getInitialRes = await request('GET', '/api/patient/family-members', 'token-primary-ahmad');
      assert.strictEqual(getInitialRes.status, 200);
      assert.strictEqual(getInitialRes.body.success, true);
      assert.strictEqual(getInitialRes.body.familyMembers.length, 0);

      // 6.3 POST add family member (Elderly Mother)
      const postElderlyRes = await request('POST', '/api/patient/family-members', 'token-primary-ahmad', {
        name: 'فاطمة محمود',
        relationship: 'mother',
        dateOfBirth: '1958-09-20',
        sex: 'female',
        chronicDiseases: ['Hypertension'],
        allergies: ['Penicillin'],
        bloodType: 'O+'
      });
      assert.strictEqual(postElderlyRes.status, 201, 'Valid member addition returns 201');
      assert.strictEqual(postElderlyRes.body.success, true);
      assert.ok(postElderlyRes.body.member.id);
      assert.strictEqual(postElderlyRes.body.member.category, 'elderly');
      const motherId = postElderlyRes.body.member.id;

      // 6.4 POST add family member (Infant Child)
      const postInfantRes = await request('POST', '/api/patient/family-members', 'token-primary-ahmad', {
        name: 'آدم أحمد',
        relationship: 'infant',
        dateOfBirth: '2025-11-01',
        sex: 'male',
        bloodType: 'B+'
      });
      assert.strictEqual(postInfantRes.status, 201);
      assert.strictEqual(postInfantRes.body.member.category, 'infant');
      const infantId = postInfantRes.body.member.id;

      // 6.5 Verify GET returns both members
      const getBothRes = await request('GET', '/api/patient/family-members', 'token-primary-ahmad');
      assert.strictEqual(getBothRes.body.count, 2);
      assert.ok(getBothRes.body.familyMembers.some(m => m.id === motherId));
      assert.ok(getBothRes.body.familyMembers.some(m => m.id === infantId));

      // 6.6 Cross-Patient Isolation: Patient Sara queries -> MUST see 0 members of Ahmad!
      const getSaraRes = await request('GET', '/api/patient/family-members', 'token-primary-sara');
      assert.strictEqual(getSaraRes.body.count, 0, 'Sara must not see any of Ahmad family members');

      // Sara attempts to edit Ahmad's mother -> MUST return 404 / NOT_FOUND
      const hackPutRes = await request('PUT', `/api/patient/family-members/${motherId}`, 'token-primary-sara', {
        name: 'Hacked Name'
      });
      assert.strictEqual(hackPutRes.status, 404, 'Cross-patient update must be blocked with 404');

      // 6.7 PUT update mother's profile
      const putRes = await request('PUT', `/api/patient/family-members/${motherId}`, 'token-primary-ahmad', {
        chronicDiseases: ['Hypertension', 'Osteoporosis'],
        weightKg: 65,
        heightCm: 158
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.success, true);
      assert.strictEqual(putRes.body.member.chronicDiseases.length, 2);
      assert.strictEqual(putRes.body.member.calculatedBmi, 26.0);

      // 6.8 DELETE remove infant member
      const delRes = await request('DELETE', `/api/patient/family-members/${infantId}`, 'token-primary-ahmad');
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.body.success, true);

      // Verify infant is gone
      const getAfterDel = await request('GET', '/api/patient/family-members', 'token-primary-ahmad');
      assert.strictEqual(getAfterDel.body.count, 1);
      assert.strictEqual(getAfterDel.body.familyMembers[0].id, motherId);

      // 6.9 Verify Enterprise Audit Log Events
      const auditEvents = auditService.getInMemoryAuditEvents();
      const familyAuditEvents = auditEvents.filter(e => 
        e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_ADDED ||
        e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_UPDATED ||
        e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_REMOVED
      );
      assert.ok(familyAuditEvents.length >= 3, 'Audit trail must record additions, updates, and removals');
      assert.ok(familyAuditEvents.some(e => e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_ADDED));
      assert.ok(familyAuditEvents.some(e => e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_UPDATED));
      assert.ok(familyAuditEvents.some(e => e.type === auditService.AUDIT_EVENT_TYPES.FAMILY_MEMBER_REMOVED));

      console.log('  ✓ REST API endpoints (GET, POST, PUT, DELETE) verified end-to-end.');
      console.log('  ✓ Strict multi-tenant patient isolation: Cross-patient access completely blocked.');
      console.log('  ✓ Enterprise audit trail logs FAMILY_MEMBER_ADDED, UPDATED, and REMOVED events.');
      passedSuites++;
    } finally {
      server.close();
    }
  }

  // -----------------------------------------------------------------------------
  // SUITE 7: UI Accessibility, Responsive Stylesheet & Translation Parity
  // -----------------------------------------------------------------------------
  console.log('\n▶ SUITE 7: UI Accessibility, Responsive Stylesheet & Translation Parity');
  {
    // 7.1 Bilingual translation catalog parity
    const { translations } = require('../app/i18n');
    assert.ok(translations, 'i18n translations must be exported');

    const arFamily = translations.ar?.family || {};
    const enFamily = translations.en?.family || {};

    assert.ok(Object.keys(arFamily).length > 0, 'Arabic family translations must exist');
    assert.ok(Object.keys(enFamily).length > 0, 'English family translations must exist');

    const arKeys = Object.keys(arFamily).sort();
    const enKeys = Object.keys(enFamily).sort();
    assert.deepStrictEqual(arKeys, enKeys, 'Arabic and English family translation keys must have 100% parity');

    // 7.2 Stylesheet responsiveness & touch ergonomics
    const cssPath = path.resolve(__dirname, '../app/modules/patient/family-profiles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('-webkit-overflow-scrolling: touch'), 'Momentum scrolling must be enabled for mobile chips');
    assert.ok(cssContent.includes('639.98px') || cssContent.includes('640px'), 'Mobile bottom sheet media query must be configured');
    assert.ok(cssContent.includes('prefers-reduced-motion: reduce'), 'Reduced motion accessibility must be supported');
    assert.ok(cssContent.includes('min-height: 44px') || cssContent.includes('min-height: 48px'), 'Touch targets must be at least 44px');

    // 7.3 HTML Template Mounts
    const indexPath = path.resolve(__dirname, '../app/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('patientFamilySwitcher'), 'index.html must include #patientFamilySwitcher mount');
    assert.ok(indexContent.includes('patientFamilyActiveBanner'), 'index.html must include #patientFamilyActiveBanner mount');
    assert.ok(indexContent.includes('profileFamilyManagementContainer'), 'index.html must include #profileFamilyManagementContainer mount');
    assert.ok(indexContent.includes('family-service.js'), 'index.html must link family-service.js');
    assert.ok(indexContent.includes('family-ui.js'), 'index.html must link family-ui.js');

    const patientViewPath = path.resolve(__dirname, '../app/modules/patient/patient-view.html');
    const patientViewContent = fs.readFileSync(patientViewPath, 'utf8');
    assert.ok(patientViewContent.includes('patientFamilySwitcher'), 'patient-view.html must include #patientFamilySwitcher');
    assert.ok(patientViewContent.includes('patientFamilyActiveBanner'), 'patient-view.html must include #patientFamilyActiveBanner');

    console.log('  ✓ 100% Bilingual translation parity verified across all family keys.');
    console.log('  ✓ Responsive CSS adheres to mobile ergonomics (>= 44px touch targets, momentum scroll, bottom sheet).');
    console.log('  ✓ HTML templates verified with complete UI container mounts.');
    passedSuites++;
  }

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedSuites}/${totalSuites} FAMILY PROFILES TEST SUITES PASSED (100%)!`);
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ FAMILY PROFILES TEST SUITE FAILED:', err);
  process.exit(1);
});
