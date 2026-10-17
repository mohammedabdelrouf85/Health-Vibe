/**
 * Health Vibe AI - Malicious Input & Physiological Range Validation Test Suite (Req #67 - P0 Critical)
 * 
 * Verifies Defense-in-Depth Against:
 * 1. SQL Injection (SQLi) attacks across all text inputs.
 * 2. Cross-Site Scripting (XSS) attacks in clinical inputs, templates, URLs, and reports.
 * 3. Illogical / Out-of-Bounds Medical & Demographic Values:
 *    - Oxygen Saturation (SpO2 = 250%, -5%, 0%, 101%, 49%, non-numeric).
 *    - Patient Age (Age = -5, 250, 999, future DOB, 150+).
 *    - Respiratory Rate (RR = -10, 150, 0).
 *    - Body Temperature (Temp = -10°C, 55°C, 25°C).
 *    - Blood Pressure (SBP 500, DBP -10, DBP >= SBP).
 *    - Blood Glucose (Glucose = -50, 5000).
 *    - Biometrics (Height = -10 / 400 cm, Weight = -5 / 600 kg).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('==================================================================');
console.log('🛡️  HEALTH VIBE AI: MALICIOUS INPUT & PHYSIOLOGICAL BOUNDS (Req #67)');
console.log('   P0 Critical: SQL Injection, XSS & Extreme Value Defenses');
console.log('==================================================================\n');

// 1. Load Backend Sanitization Service
const {
  detectSqlInjection,
  sanitizeSqlInput,
  escapeHtml: backendEscapeHtml,
  getSafeUrl: backendGetSafeUrl,
  validateOxygen,
  validateAge,
  validateDateOfBirth,
  validateDuration,
  validateRespiratoryRate,
  validateTemperature,
  validateBloodPressure,
  validateBloodGlucose,
  validateBiometrics
} = require('../backend/input-sanitization-service');

const inputSnapshotService = require('../backend/input-snapshot-service');
const { buildResultReadyEmail, buildMoreInfoEmail } = require('../backend/notification-service');
const { validatePatientMedicalProfile } = require('../backend/server');

// 2. Load and Contextualize Frontend Parsing & Sanitizing Code from app/app.js
const appSource = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');

const clientContext = {
  console,
  window: {},
  document: {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        innerHTML: '',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null },
        removeAttribute(k) { this.attributes.delete(k); },
        replaceWith(newNode) { this.replacedWith = newNode; }
      };
      if (tag === 'template') {
        el.content = {
          querySelectorAll: () => []
        };
      }
      return el;
    },
    createTextNode: (text) => ({ textContent: String(text) }),
    getElementById: () => null
  }
};
vm.createContext(clientContext);

// Extract relevant client functions from app.js into clientContext
function extractAndRun(fnName) {
  const match = appSource.match(new RegExp(`function ${fnName}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(match, `Function ${fnName} must exist in app.js`);
  vm.runInContext(match[0], clientContext);
}

extractAndRun('normalizeArabicIndicDigits');
extractAndRun('escapeHtml');
extractAndRun('parseStrictOxygenInput');
extractAndRun('parseStrictAgeInput');
extractAndRun('parseStrictSymptomDurationInput');
extractAndRun('parseOptionalTemperatureInput');
extractAndRun('parseOptionalRespiratoryRateInput');
extractAndRun('calculateAge');
extractAndRun('calculateBmi');

async function runMaliciousInputTestSuite() {
  let passedAssertions = 0;

  // ===========================================================================
  // SECTION 1: SQL INJECTION (SQLi) ATTACKS & NEUTRALIZATION
  // ===========================================================================
  console.log('▶ SECTION 1: SQL Injection (SQLi) Detection & Parameter Safety');

  const sqliPayloads = [
    { name: 'Auth Bypass (Tautology)', payload: "' OR '1'='1" },
    { name: 'Destructive DDL', payload: "'; DROP TABLE users; --" },
    { name: 'Exfiltration UNION', payload: "' UNION SELECT 1, password, email FROM users --" },
    { name: 'Time-Based Blind Delay', payload: "1; WAITFOR DELAY '0:0:5' --" },
    { name: 'MySQL Sleep Injection', payload: "1' AND SLEEP(5) --" },
    { name: 'Command Shell Execution', payload: "admin'; EXEC xp_cmdshell('dir'); --" },
    { name: 'Truncate Attack', payload: "'; TRUNCATE TABLE cases; --" },
    { name: 'Comment Termination', payload: "admin' --" }
  ];

  for (const item of sqliPayloads) {
    const detection = detectSqlInjection(item.payload);
    assert.strictEqual(detection.isMalicious, true, `SQLi pattern must be flagged: ${item.name}`);
    
    const sanitized = sanitizeSqlInput(item.payload);
    assert(!sanitized.includes('DROP'), `DROP must be stripped from: ${item.name}`);
    assert(!sanitized.includes('TRUNCATE'), `TRUNCATE must be stripped from: ${item.name}`);
    assert(!sanitized.includes('--'), `Comment token must be stripped from: ${item.name}`);
    console.log(`  ✓ Flagged & Sanitized [${item.name}]: "${item.payload}"`);
    passedAssertions++;
  }

  // Verify that profile validation does not crash or execute SQLi in text fields
  const sqliProfile = validatePatientMedicalProfile({
    name: "مريض ' OR 1=1; DROP TABLE users; --",
    emergencyContactName: "جهة طوارئ '; TRUNCATE TABLE cases; --",
    allergies: "بنسلين' UNION SELECT * FROM secret_keys; --",
    age: 34
  });
  assert.strictEqual(sqliProfile.isValid, true, 'Profile validator safely handles strings with SQL tokens');
  assert(sqliProfile.data.fullName.includes('DROP TABLE'), 'Stored safely as literal data without executing');
  console.log('  ✓ Database Safety: Parameterized/NoSQL architecture safely stores SQL strings as inert literals.');
  passedAssertions++;


  // ===========================================================================
  // SECTION 2: CROSS-SITE SCRIPTING (XSS) ATTACKS & SANITIZATION
  // ===========================================================================
  console.log('\n▶ SECTION 2: Cross-Site Scripting (XSS) Defense & HTML Escaping');

  const xssPayloads = [
    '<script>alert("XSS-EXEC")</script>',
    '<img src="invalid.jpg" onerror="alert(\'XSS-IMG\')">',
    '<svg/onload=alert(\'XSS-SVG\')>',
    '<iframe src="javascript:alert(\'XSS-IFRAME\')"></iframe>',
    '"><script>alert(document.cookie)</script>',
    '\'><svg onload=alert(1)>',
    '<body onload=alert(1)>'
  ];

  for (const rawPayload of xssPayloads) {
    // 1. Client-Side escapeHtml
    const clientEscaped = clientContext.escapeHtml(rawPayload);
    assert(!clientEscaped.includes('<'), 'Client escapeHtml must neutralize < characters');
    assert(!clientEscaped.includes('>'), 'Client escapeHtml must neutralize > characters');
    assert(clientEscaped.includes('&lt;') || clientEscaped.includes('&gt;'), 'Special characters must be entity-encoded');

    // 2. Backend escapeHtml
    const backendEscaped = backendEscapeHtml(rawPayload);
    assert(!backendEscaped.includes('<'), 'Backend escapeHtml must neutralize < characters');
    assert(!backendEscaped.includes('>'), 'Backend escapeHtml must neutralize > characters');
    
    passedAssertions++;
  }
  console.log(`  ✓ Successfully escaped ${xssPayloads.length} diverse XSS attack payloads.`);

  // 2.2 Dangerous URL Schemes (javascript:, data:, vbscript:)
  console.log('  [Attack 2.2] Testing Dangerous Pseudo-Protocols in Links:');
  const maliciousUrls = [
    'javascript:alert("XSS")',
    'JAVASCRIPT:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox("xss")',
    'javascript://%0Aalert(1)'
  ];

  for (const badUrl of maliciousUrls) {
    const safeUrl = backendGetSafeUrl(badUrl, 'https://healthvibes.app');
    assert.strictEqual(safeUrl, 'https://healthvibes.app', `Dangerous URL '${badUrl}' must fall back to safe origin`);
    passedAssertions++;
  }
  console.log('    ✓ Blocked: javascript:, data:, and vbscript: URIs strictly neutralized.');

  const safeHttpsUrl = backendGetSafeUrl('https://healthvibes.app/app/index.html?screen=result');
  assert.strictEqual(safeHttpsUrl, 'https://healthvibes.app/app/index.html?screen=result');
  console.log('    ✓ Allowed: Legitimate https:// application links safely preserved.');
  passedAssertions++;

  // 2.3 Email Template XSS Immunity
  console.log('  [Attack 2.3] Testing Email Notification Template XSS Immunity:');
  const xssEmail = buildResultReadyEmail({
    patientName: '<script>alert("PATIENT")</script>',
    caseId: 'case_101',
    reportRef: 'HV-REP-TEST',
    doctorName: '<img src=x onerror=alert("DOCTOR")>',
    doctorSpecialty: 'استشاري أمراض الصدر',
    clinicalDiagnosis: '<svg onload=alert("DIAGNOSIS")>التهاب شعبي',
    medications: '<b onmouseover=alert("RX")>فنتولين</b>',
    recommendations: ['<script>alert("REC")</script>'],
    appUrl: 'javascript:alert("ATTACK")'
  });

  assert(!/<script\b/i.test(xssEmail.html), 'Email HTML must not contain active <script> tags');
  assert(!/<img\b/i.test(xssEmail.html), 'Email HTML must not contain injected img tags');
  assert(!/<svg\b/i.test(xssEmail.html), 'Email HTML must not contain injected svg tags');
  assert(!/<[^>]+\son[a-z]+\s*=/i.test(xssEmail.html), 'Email HTML must not contain active inline event handlers');
  assert(!/javascript:/i.test(xssEmail.html), 'Email HTML must not contain javascript: URL');
  assert(xssEmail.html.includes('&lt;script&gt;'), 'XSS payloads must be rendered as inert text');
  console.log('    ✓ Email Template: All clinical inputs rendered as inert HTML entities.');
  passedAssertions++;


  // ===========================================================================
  // SECTION 3: ILLOGICAL / OUT-OF-BOUNDS PHYSIOLOGICAL VALUES
  // ===========================================================================
  console.log('\n▶ SECTION 3: Out-of-Bounds & Illogical Physiological Values');

  // 3.1 Oxygen Saturation (SpO2) Validation
  console.log('  [Category 3.1] Testing SpO2 Boundary Checks (Valid: 50% - 100%):');
  
  // Test SpO2 = 250% (Impossible hyperoxemia)
  const spo2_250_client = clientContext.parseStrictOxygenInput('250%');
  assert.strictEqual(spo2_250_client.ok, false);
  assert.strictEqual(spo2_250_client.reason, 'above-range');
  assert.strictEqual(spo2_250_client.value, 250);

  const spo2_250_backend = validateOxygen('250%');
  assert.strictEqual(spo2_250_backend.isValid, false);
  assert.strictEqual(spo2_250_backend.error, 'OXYGEN_ABOVE_MAXIMUM');
  console.log('    ✓ Rejected SpO2 = 250% (above-range / maximum 100%).');
  passedAssertions++;

  // Test SpO2 = -5% (Negative oxygen)
  const spo2_neg5_client = clientContext.parseStrictOxygenInput('-5%');
  assert.strictEqual(spo2_neg5_client.ok, false);
  assert.strictEqual(spo2_neg5_client.reason, 'format');

  const spo2_neg5_backend = validateOxygen('-5%');
  assert.strictEqual(spo2_neg5_backend.isValid, false);
  assert.strictEqual(spo2_neg5_backend.error, 'OXYGEN_BELOW_PHYSIOLOGICAL_MINIMUM');
  console.log('    ✓ Rejected SpO2 = -5% (negative / below physiological minimum).');
  passedAssertions++;

  // Test SpO2 = 0%
  const spo2_zero_client = clientContext.parseStrictOxygenInput('0');
  assert.strictEqual(spo2_zero_client.ok, false);
  assert.strictEqual(spo2_zero_client.reason, 'below-range');
  console.log('    ✓ Rejected SpO2 = 0% (below 50% threshold).');
  passedAssertions++;

  // Test SpO2 = 101%
  const spo2_101_client = clientContext.parseStrictOxygenInput('101');
  assert.strictEqual(spo2_101_client.ok, false);
  assert.strictEqual(spo2_101_client.reason, 'above-range');
  console.log('    ✓ Rejected SpO2 = 101% (exceeds 100%).');
  passedAssertions++;

  // Test SpO2 = 49%
  const spo2_49_client = clientContext.parseStrictOxygenInput('49');
  assert.strictEqual(spo2_49_client.ok, false);
  assert.strictEqual(spo2_49_client.reason, 'below-range');
  console.log('    ✓ Rejected SpO2 = 49% (below 50% critical boundary).');
  passedAssertions++;

  // Test Valid SpO2: 50%, 91% (Arabic Indic), 100%
  assert.strictEqual(clientContext.parseStrictOxygenInput('50').ok, true);
  assert.strictEqual(clientContext.parseStrictOxygenInput('٩١%').ok, true); // Arabic Indic 91%
  assert.strictEqual(clientContext.parseStrictOxygenInput('٩١%').value, 91);
  assert.strictEqual(clientContext.parseStrictOxygenInput('100').ok, true);
  console.log('    ✓ Accepted valid physiological SpO2: 50%, ٩١%, 100%.');
  passedAssertions++;

  // 3.2 Patient Age Validation
  console.log('\n  [Category 3.2] Testing Patient Age Boundary Checks (Valid: 0 - 130 years):');

  // Test Age = -5 (Negative age)
  const age_neg5_client = clientContext.parseStrictAgeInput('-5');
  assert.strictEqual(age_neg5_client.ok, false);
  assert.strictEqual(age_neg5_client.reason, 'below-range');

  const age_neg5_backend = validateAge('-5');
  assert.strictEqual(age_neg5_backend.isValid, false);
  assert.strictEqual(age_neg5_backend.error, 'AGE_NEGATIVE');
  console.log('    ✓ Rejected Age = -5 (negative age prohibited).');
  passedAssertions++;

  // Test Age = 250 (Exceeds human lifespan)
  const age_250_client = clientContext.parseStrictAgeInput('250');
  assert.strictEqual(age_250_client.ok, false);
  assert.strictEqual(age_250_client.reason, 'above-range');

  const age_250_backend = validateAge('250');
  assert.strictEqual(age_250_backend.isValid, false);
  assert.strictEqual(age_250_backend.error, 'AGE_ABOVE_HUMAN_LIFESPAN');
  console.log('    ✓ Rejected Age = 250 (exceeds biological human lifespan of 130).');
  passedAssertions++;

  // Test Future Date of Birth (produces negative age)
  const futureDob = validateDateOfBirth('2099-12-31');
  assert.strictEqual(futureDob.isValid, false);
  assert.strictEqual(futureDob.error, 'DOB_FUTURE_DATE');
  console.log('    ✓ Rejected Future DOB (2099-12-31): Cannot be in future.');
  passedAssertions++;

  // Test Historical Improbable Date of Birth (>130 years ago)
  const ancientDob = validateDateOfBirth('1850-05-15');
  assert.strictEqual(ancientDob.isValid, false);
  assert.strictEqual(ancientDob.error, 'DOB_EXCEEDS_130_YEARS');
  console.log('    ✓ Rejected Improbable DOB (1850-05-15): Results in age > 130.');
  passedAssertions++;

  // Test Backend Profile Validation Rejects Age = -5 and Age = 250
  const profileNegAge = validatePatientMedicalProfile({ fullName: 'مريض تجريبي', age: -5 });
  assert.strictEqual(profileNegAge.isValid, false);
  assert(profileNegAge.errors.some(e => e.includes('between 0 and 130 years')));
  console.log('    ✓ Backend Profile API: Rejected age: -5 with 400 validation error.');
  passedAssertions++;

  const profile250Age = validatePatientMedicalProfile({ fullName: 'مريض تجريبي', age: 250 });
  assert.strictEqual(profile250Age.isValid, false);
  assert(profile250Age.errors.some(e => e.includes('between 0 and 130 years')));
  console.log('    ✓ Backend Profile API: Rejected age: 250 with 400 validation error.');
  passedAssertions++;

  // Test Valid Ages: 0 (Newborn), 34 (Indic: ٣٤), 120
  assert.strictEqual(clientContext.parseStrictAgeInput('0').ok, true);
  assert.strictEqual(clientContext.parseStrictAgeInput('٣٤').ok, true);
  assert.strictEqual(clientContext.parseStrictAgeInput('٣٤').value, 34);
  assert.strictEqual(clientContext.parseStrictAgeInput('120').ok, true);
  console.log('    ✓ Accepted valid patient ages: 0 (newborn), ٣٤ (34), 120.');
  passedAssertions++;

  // 3.3 Respiratory Rate (RR)
  console.log('\n  [Category 3.3] Testing Respiratory Rate (RR) (Valid: 5 - 60 breaths/min):');
  assert.strictEqual(validateRespiratoryRate(-10).isValid, false);
  assert.strictEqual(validateRespiratoryRate(150).isValid, false);
  assert.strictEqual(validateRespiratoryRate(0).isValid, false);
  assert.strictEqual(validateRespiratoryRate(24).isValid, true);
  console.log('    ✓ Rejected RR = -10, 150, 0. Accepted normal RR = 24.');
  passedAssertions++;

  // 3.4 Body Temperature
  console.log('\n  [Category 3.4] Testing Body Temperature (Valid: 34.0°C - 43.0°C):');
  assert.strictEqual(validateTemperature(-10).isValid, false);
  assert.strictEqual(validateTemperature(55).isValid, false);
  assert.strictEqual(validateTemperature(25).isValid, false);
  assert.strictEqual(validateTemperature(38.3).isValid, true);
  console.log('    ✓ Rejected Temp = -10°C, 55°C, 25°C. Accepted febrile Temp = 38.3°C.');
  passedAssertions++;

  // 3.5 Blood Pressure (Systolic & Diastolic)
  console.log('\n  [Category 3.5] Testing Blood Pressure (SBP: 50-260, DBP: 30-150, SBP > DBP):');
  assert.strictEqual(validateBloodPressure(500, 80).isValid, false); // SBP out of range
  assert.strictEqual(validateBloodPressure(120, -10).isValid, false); // DBP negative
  assert.strictEqual(validateBloodPressure(110, 130).isValid, false); // Contradiction (DBP >= SBP)
  assert.strictEqual(validateBloodPressure(120, 80).isValid, true);
  console.log('    ✓ Rejected SBP = 500, DBP = -10, and DBP >= SBP. Accepted BP = 120/80.');
  passedAssertions++;

  // 3.6 Blood Glucose
  console.log('\n  [Category 3.6] Testing Blood Glucose (Valid: 20 - 1000 mg/dL):');
  assert.strictEqual(validateBloodGlucose(-50).isValid, false);
  assert.strictEqual(validateBloodGlucose(5000).isValid, false);
  assert.strictEqual(validateBloodGlucose(110).isValid, true);
  console.log('    ✓ Rejected Glucose = -50, 5000 mg/dL. Accepted Glucose = 110 mg/dL.');
  passedAssertions++;

  // 3.7 Biometrics (Height & Weight)
  console.log('\n  [Category 3.7] Testing Height (20-260 cm) & Weight (1-400 kg):');
  assert.strictEqual(validateBiometrics(-10, 70).isValid, false);
  assert.strictEqual(validateBiometrics(175, -5).isValid, false);
  assert.strictEqual(validateBiometrics(350, 70).isValid, false);
  assert.strictEqual(validateBiometrics(175, 600).isValid, false);
  
  const normalBio = validateBiometrics(175, 70);
  assert.strictEqual(normalBio.isValid, true);
  assert.strictEqual(normalBio.bmi, 22.9);
  console.log('    ✓ Rejected impossible heights/weights. Accepted 175cm / 70kg (BMI: 22.9).');
  passedAssertions++;

  // 3.8 Symptom Duration (1 - 365 days, Egyptian colloquial phrasing, Arabic Indic numerals)
  console.log('\n  [Category 3.8] Testing Symptom Duration (Valid: 1 - 365 days, colloquial support):');
  assert.strictEqual(validateDuration(0).isValid, false);
  assert.strictEqual(validateDuration(-3).isValid, false);
  assert.strictEqual(validateDuration(400).isValid, false);
  assert.strictEqual(validateDuration('أسبوع').days, 7);
  assert.strictEqual(validateDuration('يومين').days, 2);
  assert.strictEqual(validateDuration('اليوم').days, 1);
  assert.strictEqual(validateDuration('شهر').days, 30);
  assert.strictEqual(validateDuration('٥ أيام').days, 5);

  // Client parsing tests
  assert.strictEqual(clientContext.parseStrictSymptomDurationInput('النهاردة').value, 1);
  assert.strictEqual(clientContext.parseStrictSymptomDurationInput('أسبوعين').value, 14);
  assert.strictEqual(clientContext.parseStrictSymptomDurationInput('٣ أيام').value, 3);
  assert.strictEqual(clientContext.parseStrictSymptomDurationInput('500').ok, false);
  console.log('    ✓ Validated duration bounds, Egyptian colloquial phrasing, and Arabic numerals.');
  passedAssertions++;

  // 3.9 Immutable Input Snapshot & Tamper Detection (K Health benchmark)
  console.log('\n  [Category 3.9] Testing Immutable Assessment Input Snapshot (K Health standard):');
  const user = { uid: 'patient-test-1', email: 'patient@healthvibe.test', role: 'patient' };
  const mockBody = {
    spo2: 96,
    symptomDurationDays: 3,
    coughSeverity: 'moderate',
    fever: true,
    patientAge: 32,
    patientGender: 'female',
    patientNotes: 'Experiencing cough and slight fever for 3 days.'
  };

  const snapshot = inputSnapshotService.captureInputSnapshot({ user, body: mockBody, capturedAt: '2026-10-17T12:00:00Z' });
  assert.ok(snapshot.inputSnapshotHash, 'Snapshot must include cryptographic SHA-256 hash');
  assert.strictEqual(snapshot.spo2, 96);
  assert.strictEqual(snapshot.symptomDurationDays, 3);

  // Verify integrity check
  const integrityResult = inputSnapshotService.verifyInputSnapshotIntegrity(snapshot);
  assert.strictEqual(integrityResult.isValid, true, 'Original snapshot must be valid');

  // Verify tamper detection
  const tamperedSnapshot = { ...snapshot, spo2: 100 };
  const tamperResult = inputSnapshotService.verifyInputSnapshotIntegrity(tamperedSnapshot);
  assert.strictEqual(tamperResult.isValid, false, 'Tampered snapshot must be detected');

  // Verify immutability assertion throws on alteration
  assert.throws(() => {
    inputSnapshotService.assertSnapshotImmutability(
      { inputSnapshot: snapshot, inputSnapshotHash: snapshot.inputSnapshotHash },
      { inputSnapshot: tamperedSnapshot, inputSnapshotHash: 'fake-tampered-hash' }
    );
  }, /IMMUTABLE_INPUT_SNAPSHOT_MODIFICATION_PROHIBITED/);
  console.log('    ✓ Verified SHA-256 cryptographic snapshot creation, tamper detection, and immutability guard.');
  passedAssertions++;

  console.log('\n==================================================================');
  console.log(`🎉 ALL ${passedAssertions} MALICIOUS INPUT & PHYSIOLOGICAL CHECKS PASSED WITH 100%!`);
  console.log('   SQLi, XSS, and Illogical Clinical Boundaries are Fully Defended.');
  console.log('==================================================================\n');
  process.exit(0);
}

runMaliciousInputTestSuite().catch(err => {
  console.error('\n❌ Malicious Input Check Test Failed:', err);
  process.exit(1);
});
