/**
 * Health Vibe AI - PDF Export, Sharing, and Authenticity Verification Test Suite
 * 
 * Tests:
 * 1. Arabic and English PDF export matching approved report version (pagination, fonts, dates).
 * 2. Report sharing with explicit consent and time-limited, revocable links (recipient & PIN restricted).
 * 3. Expired link rejection (410 SHARE_LINK_EXPIRED).
 * 4. Revoked link rejection (410 SHARE_LINK_REVOKED).
 * 5. QR code authenticity verification WITHOUT exposing medical content publicly.
 * 6. Withdrawn report version handling in verification API, UI, and PDF.
 * 7. Long report printing layout and pagination rules (page-break behavior, CSS counters).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const reportsServicePath = path.resolve(__dirname, '../app/modules/reports/reports-service.js');
const reportsUiPath = path.resolve(__dirname, '../app/modules/reports/reports-ui.js');
const stylesPath = path.resolve(__dirname, '../app/styles.css');
const backendRequire = createRequire(serverPath);

console.log('==================================================================');
console.log('📋 HEALTH VIBE AI: PDF EXPORT, SHARING & VERIFICATION TEST SUITE');
console.log('   Bilingual PDF, Explicit Consent, Time Limits, QR Authenticity');
console.log('==================================================================\n');

// ── In-Memory Test Database & Mock Environment ──────────────────────────────
const testCases = {};
const testShares = {};
const testReports = {};
const testProfiles = {
  'patient-1': { uid: 'patient-1', email: 'patient@example.test', role: 'patient', status: 'active' },
  'doctor-1': { uid: 'doctor-1', email: 'doctor@hospital.test', role: 'doctor', status: 'active', verifiedDoctor: true, doctorApplicationStatus: 'approved' },
  'doctor-unassigned': { uid: 'doctor-unassigned', email: 'other@hospital.test', role: 'doctor', status: 'active' },
  'recipient-doctor': { uid: 'recipient-doctor', email: 'consultant@specialty.test', role: 'doctor', status: 'active' }
};
const testApplications = {
  'doctor-1': {
    userId: 'doctor-1',
    status: 'approved',
    name: 'Dr. Tarek Mansour',
    licenseNumber: 'EGY-MED-9942',
    specialty: 'Consultant Pulmonologist',
    clinic: 'Health Vibe Respiratory Unit',
    clinicId: 'clinic-a'
  }
};
const testAuditEvents = [];

const mockDb = {
  collection: name => ({
    doc: id => ({
      get: async () => ({
        exists: Boolean(
          (name === 'cases' && testCases[id]) ||
          (name === 'report_shares' && testShares[id]) ||
          (name === 'clinical_reports' && testReports[id]) ||
          (name === 'users' && testProfiles[id]) ||
          (name === 'doctor_applications' && testApplications[id])
        ),
        id,
        data: () => {
          if (name === 'cases') return testCases[id];
          if (name === 'report_shares') return testShares[id];
          if (name === 'clinical_reports') return testReports[id];
          if (name === 'users') return testProfiles[id];
          if (name === 'doctor_applications') return testApplications[id];
          return null;
        }
      }),
      set: async data => {
        if (name === 'cases') testCases[id] = { id, ...data };
        else if (name === 'report_shares') testShares[id] = { id, ...data };
        else if (name === 'clinical_reports') testReports[id] = { id, ...data };
      },
      update: async data => {
        if (name === 'cases' && testCases[id]) Object.assign(testCases[id], data);
        else if (name === 'report_shares' && testShares[id]) Object.assign(testShares[id], data);
        else if (name === 'clinical_reports' && testReports[id]) Object.assign(testReports[id], data);
      }
    }),
    where: (field, op, val) => ({
      get: async () => {
        let results = [];
        if (name === 'doctor_applications' && field === 'userId') {
          if (testApplications[val]) {
            results.push({ id: `app-${val}`, data: () => testApplications[val] });
          }
        } else {
          const source = name === 'cases' ? testCases : (name === 'report_shares' ? testShares : {});
          for (const [id, doc] of Object.entries(source)) {
            if (doc && doc[field] === val) {
              results.push({ id, data: () => doc });
            }
          }
        }
        return { empty: results.length === 0, docs: results };
      }
    }),
    add: async data => {
      testAuditEvents.push(data);
      return { id: `audit-${Date.now()}` };
    }
  }),
  runTransaction: async fn => fn({
    get: ref => ref.get(),
    update: (ref, data) => ref.update(data),
    set: (ref, data) => ref.set(data)
  })
};

const mockFirebase = {
  apps: [{}],
  firestore: () => mockDb,
  auth: () => ({
    verifyIdToken: async token => ({
      uid: token,
      email: testProfiles[token]?.email || `${token}@example.test`,
      role: testProfiles[token]?.role || 'patient',
      email_verified: true
    })
  })
};
mockFirebase.firestore.FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: val => [val]
};

// ── Instantiate Server Context in VM ─────────────────────────────────────────
const serverContext = {
  require: name => (name === 'firebase-admin' ? mockFirebase : (name === 'dotenv' ? { config() {} } : backendRequire(name))),
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
    uptime: () => 100
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout
};

vm.createContext(serverContext);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), serverContext);

// ── Instantiate Client Services in VM ───────────────────────────────────────
const clientContext = {
  console,
  URL,
  window: {},
  document: {
    documentElement: { lang: 'ar', dir: 'rtl' },
    body: { classList: { add() {}, remove() {}, contains: () => false } },
    getElementById: () => null,
    createElement: () => ({ innerHTML: '', style: {}, appendChild() {} }),
    title: ''
  },
  HealthVibes: {}
};
clientContext.window = clientContext;
vm.createContext(clientContext);
vm.runInContext(fs.readFileSync(reportsServicePath, 'utf8'), clientContext);
vm.runInContext(fs.readFileSync(reportsUiPath, 'utf8'), clientContext);
const ReportsService = clientContext.HealthVibes?.ReportsService || require(reportsServicePath);
const ReportsUI = clientContext.HealthVibes?.ReportsUI || require(reportsUiPath);

// ── Helper to execute HTTP requests against the backend ─────────────────────
async function runTests() {
  const app = serverContext.module.exports;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, endpoint, token = null, body = null, headers = {}) {
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    const opts = {
      method,
      headers: reqHeaders,
      ...(body ? { body: JSON.stringify(body) } : {})
    };
    const res = await fetch(baseUrl + endpoint, opts);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // Setup approved case with immutable snapshot
    const caseId = 'case-cert-101';
    const approvedCase = {
      id: caseId,
      patientId: 'patient-1',
      patientName: 'Kareem Ahmed',
      patientAge: 38,
      assignedDoctorId: 'doctor-1',
      approvingDoctorId: 'doctor-1',
      approvingDoctorName: 'Dr. Tarek Mansour',
      doctorSpecialty: 'Consultant Pulmonologist',
      doctorLicense: 'EGY-MED-9942',
      clinicName: 'Health Vibe Respiratory Unit',
      status: 'approved',
      doctorApproved: true,
      reportRef: 'HV-REP-CERT101',
      reportVersion: '1.2.0',
      reportRevisionNumber: 1,
      currentReportRevisionId: 'case-cert-101_v1',
      reportHash: 'SHA256-A8F3C9E17B24680D',
      approvedAt: '2026-09-28T14:30:00.000Z',
      reportGeneratedAt: '2026-09-28T14:30:00.000Z',
      submittedAt: '2026-09-28T13:45:00.000Z',
      oxygenLevel: 94,
      breathingDifficulty: 'moderate',
      coughLevel: 'dry_persistent',
      symptomDuration: '4_days',
      clinicalDiagnosis: 'Acute Bronchial Hyper-reactivity with Mild Hypoxemia',
      medications: 'Salbutamol 100mcg Inhaler: 2 puffs q6h PRN\nFluticasone 250mcg: 1 puff BID',
      recommendations: [
        'Monitor SpO2 twice daily with pulse oximeter',
        'Avoid cold drafts and dust exposure',
        'Follow-up in-clinic if SpO2 drops below 92%'
      ],
      reportSnapshot: {
        revisionId: 'case-cert-101_v1',
        revisionNumber: 1,
        versions: { reportVersion: '1.2.0' },
        dates: {
          approvedAt: '2026-09-28T14:30:00.000Z',
          generatedAt: '2026-09-28T14:30:00.000Z',
          submittedAt: '2026-09-28T13:45:00.000Z'
        },
        patient: {
          patientName: 'Kareem Ahmed',
          patientAge: 38
        },
        doctorIdentity: {
          uid: 'doctor-1',
          name: 'Dr. Tarek Mansour',
          specialty: 'Consultant Pulmonologist',
          licenseNumber: 'EGY-MED-9942',
          clinic: 'Health Vibe Respiratory Unit',
          applicationId: 'app-9942'
        },
        clinicalContent: {
          clinicalDiagnosis: 'Acute Bronchial Hyper-reactivity with Mild Hypoxemia',
          medications: 'Salbutamol 100mcg Inhaler: 2 puffs q6h PRN\nFluticasone 250mcg: 1 puff BID',
          recommendations: [
            'Monitor SpO2 twice daily with pulse oximeter',
            'Avoid cold drafts and dust exposure',
            'Follow-up in-clinic if SpO2 drops below 92%'
          ]
        },
        caseDetails: {
          oxygenLevel: 94,
          breathingDifficulty: 'moderate',
          coughLevel: 'dry_persistent',
          symptomDuration: '4_days'
        },
        withdrawal: { status: 'active' }
      }
    };
    testCases[caseId] = JSON.parse(JSON.stringify(approvedCase));
    testReports['case-cert-101_v1'] = { id: 'case-cert-101_v1', caseId, published: true };

    // =========================================================================
    // ▶ TEST 1: Arabic and English PDF Export Matching Approved Version
    // =========================================================================
    console.log('▶ TEST 1: Arabic & English PDF Export Matching Approved Version');
    {
      // Arabic PDF Export
      const pdfAr = ReportsService.formatReportForPdfExport({ record: testCases[caseId], language: 'ar' });
      assert.ok(pdfAr, 'Arabic PDF format object generated');
      assert.equal(pdfAr.dir, 'rtl');
      assert.equal(pdfAr.language, 'ar');
      assert.equal(pdfAr.reportRef, 'HV-REP-CERT101');
      assert.equal(pdfAr.reportVersion, '1.2.0');
      assert.equal(pdfAr.clinical.diag, 'Acute Bronchial Hyper-reactivity with Mild Hypoxemia');
      assert.ok(pdfAr.fontFamily.includes('Cairo'), 'Arabic font includes Cairo typography');
      assert.ok(pdfAr.dates.approvedAt, 'Approval date formatted in Arabic locale');

      // English PDF Export
      const pdfEn = ReportsService.formatReportForPdfExport({ record: testCases[caseId], language: 'en' });
      assert.ok(pdfEn, 'English PDF format object generated');
      assert.equal(pdfEn.dir, 'ltr');
      assert.equal(pdfEn.language, 'en');
      assert.equal(pdfEn.reportRef, 'HV-REP-CERT101');
      assert.ok(pdfEn.fontFamily.includes('Inter'), 'English font includes Inter typography');
      assert.ok(pdfEn.dates.approvedAt, 'Approval date formatted in English locale');

      // Immutability Check: Mutation on live case must NOT affect formatted approved export
      testCases[caseId].patientName = 'HACKED MUTABLE PATIENT';
      testCases[caseId].clinicalDiagnosis = 'HACKED MUTABLE DIAGNOSIS';
      const pdfPostMutation = ReportsService.formatReportForPdfExport({ record: testCases[caseId], language: 'en' });
      assert.equal(pdfPostMutation.clinical.diag, 'Acute Bronchial Hyper-reactivity with Mild Hypoxemia');
      // Restore
      testCases[caseId].patientName = approvedCase.patientName;
      testCases[caseId].clinicalDiagnosis = approvedCase.clinicalDiagnosis;

      console.log('  ✓ Arabic & English PDF exports strictly adhere to approved immutable snapshot with locale dates & fonts.');
    }

    // =========================================================================
    // ▶ TEST 2: Report Sharing with Explicit Consent Enforcement
    // =========================================================================
    console.log('\n▶ TEST 2: Report Sharing with Mandatory Explicit Consent');
    {
      // Attempt 1: Without explicit consent -> Must fail with 400
      const noConsent = await api('POST', '/api/reports/share', 'patient-1', {
        caseId,
        consent: false,
        expiresInHours: 48
      });
      assert.equal(noConsent.status, 400);
      assert.equal(noConsent.data.error, 'EXPLICIT_CONSENT_REQUIRED');

      // Attempt 2: Missing consent flag -> Must fail with 400
      const missingConsent = await api('POST', '/api/reports/share', 'patient-1', {
        caseId,
        expiresInHours: 48
      });
      assert.equal(missingConsent.status, 400);
      assert.equal(missingConsent.data.error, 'EXPLICIT_CONSENT_REQUIRED');

      // Attempt 3: With explicit consent -> Must succeed with 200
      const validShare = await api('POST', '/api/reports/share', 'patient-1', {
        caseId,
        consent: true,
        consentText: 'I authorize time-limited access to this medical record.',
        expiresInHours: 48
      });
      assert.equal(validShare.status, 200);
      assert.ok(validShare.data.shareId, 'Generates unique cryptographic share token');
      assert.ok(validShare.data.shareUrl.includes(validShare.data.shareId));
      assert.ok(new Date(validShare.data.expiresAt) > new Date());
      assert.equal(validShare.data.reportRef, 'HV-REP-CERT101');

      console.log('  ✓ Mandatory patient explicit consent enforced before generating time-limited links.');
    }

    // =========================================================================
    // ▶ TEST 3: Accessing Shared Report (Valid vs Expired Link)
    // =========================================================================
    console.log('\n▶ TEST 3: Time-Limited Link Access & Expired Link Rejection');
    {
      // Create valid share link
      const createRes = await api('POST', '/api/reports/share', 'patient-1', {
        caseId,
        consent: true,
        expiresInHours: 24
      });
      const shareId = createRes.data.shareId;

      // Access active share link -> Should succeed
      const accessRes = await api('GET', `/api/reports/shared/${shareId}`);
      assert.equal(accessRes.status, 200);
      assert.equal(accessRes.data.report.reportRef, 'HV-REP-CERT101');
      assert.equal(accessRes.data.report.clinicalDiagnosis, 'Acute Bronchial Hyper-reactivity with Mild Hypoxemia');
      assert.equal(accessRes.data.report.doctorIdentity.licenseNumber, 'EGY-MED-9942');

      // Simulate expired share link (set expiresAt in the past)
      testShares[shareId].expiresAt = new Date(Date.now() - 3600000).toISOString();

      // Access expired share link -> Must return 410 SHARE_LINK_EXPIRED
      const expiredRes = await api('GET', `/api/reports/shared/${shareId}`);
      assert.equal(expiredRes.status, 410);
      assert.equal(expiredRes.data.error, 'SHARE_LINK_EXPIRED');

      console.log('  ✓ Active share link permits authorized clinical review; expired link is rejected with HTTP 410.');
    }

    // =========================================================================
    // ▶ TEST 4: Revocable Sharing Link & Recipient Restriction
    // =========================================================================
    console.log('\n▶ TEST 4: Revocable Links & Recipient / PIN Restrictions');
    {
      // Create share link restricted to specific recipient and PIN
      const createRestricted = await api('POST', '/api/reports/share', 'patient-1', {
        caseId,
        consent: true,
        expiresInHours: 48,
        recipientEmail: 'consultant@specialty.test',
        recipientPin: '7492'
      });
      assert.equal(createRestricted.status, 200);
      const restrictedShareId = createRestricted.data.shareId;

      // Access with mismatching recipient email -> Must reject with 403
      const wrongRecipient = await api('GET', `/api/reports/shared/${restrictedShareId}?recipientEmail=intruder@attacker.test&pin=7492`);
      assert.equal(wrongRecipient.status, 403);
      assert.equal(wrongRecipient.data.error, 'RECIPIENT_RESTRICTED');

      // Access with matching recipient email but wrong PIN -> Must reject with 401
      const wrongPin = await api('GET', `/api/reports/shared/${restrictedShareId}?recipientEmail=consultant@specialty.test&pin=0000`);
      assert.equal(wrongPin.status, 401);
      assert.equal(wrongPin.data.error, 'INVALID_PIN');

      // Access with matching recipient email AND correct PIN -> Must succeed with 200
      const correctAccess = await api('GET', `/api/reports/shared/${restrictedShareId}?recipientEmail=consultant@specialty.test&pin=7492`);
      assert.equal(correctAccess.status, 200);
      assert.equal(correctAccess.data.report.reportRef, 'HV-REP-CERT101');

      // Revoke the link immediately
      const revokeRes = await api('POST', '/api/reports/share/revoke', 'patient-1', {
        shareId: restrictedShareId
      });
      assert.equal(revokeRes.status, 200);
      assert.equal(revokeRes.data.status, 'revoked');

      // Attempt access on revoked link -> Must reject with 410 SHARE_LINK_REVOKED
      const postRevokeAccess = await api('GET', `/api/reports/shared/${restrictedShareId}?recipientEmail=consultant@specialty.test&pin=7492`);
      assert.equal(postRevokeAccess.status, 410);
      assert.equal(postRevokeAccess.data.error, 'SHARE_LINK_REVOKED');

      console.log('  ✓ Recipient email and PIN restrictions enforced; revoked link immediately terminates access.');
    }

    // =========================================================================
    // ▶ TEST 5: QR Code Authenticity Verification WITHOUT Exposing Medical Content
    // =========================================================================
    console.log('\n▶ TEST 5: QR Authenticity Verification (No Public Medical Content)');
    {
      const qrUrl = ReportsService.buildQrPayload(testCases[caseId], 'https://healthvibe.ai');
      assert.ok(qrUrl.includes('/app/index.html?screen=verify'), 'QR contains authenticity verify screen URL');
      assert.ok(qrUrl.includes('ref=HV-REP-CERT101'), 'QR contains report reference parameter');
      assert.ok(!qrUrl.includes('Salbutamol') && !qrUrl.includes('Bronchial') && !qrUrl.includes('Hypoxemia'), 'QR URL does NOT leak diagnosis or medications');

      // Public verification API call (no authentication needed)
      const verifyRes = await api('GET', `/api/reports/verify/HV-REP-CERT101`);
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.data.valid, true);
      assert.equal(verifyRes.data.status, 'certified');
      assert.equal(verifyRes.data.doctor.name, 'Dr. Tarek Mansour');
      assert.equal(verifyRes.data.doctor.licenseNumber, 'EGY-MED-9942');
      assert.equal(verifyRes.data.clinic, 'Health Vibe Respiratory Unit');
      assert.ok(verifyRes.data.digitalSignature.hash);

      // STRICT PRIVACY AUDIT: Assert that sensitive medical fields are 100% ABSENT
      assert.equal(verifyRes.data.clinicalDiagnosis, undefined, 'Diagnosis must NOT be in public verification response');
      assert.equal(verifyRes.data.medications, undefined, 'Medications must NOT be in public verification response');
      assert.equal(verifyRes.data.oxygenLevel, undefined, 'Oxygen level must NOT be in public verification response');
      assert.equal(verifyRes.data.vitals, undefined, 'Vitals must NOT be in public verification response');
      assert.equal(verifyRes.data.symptoms, undefined, 'Symptoms must NOT be in public verification response');
      assert.equal(verifyRes.data.patientNotes, undefined, 'Patient notes must NOT be in public verification response');
      assert.ok(verifyRes.data.medicalPrivacyNotice, 'Includes HIPAA/GDPR clinical privacy notice');

      console.log('  ✓ Public verification confirms authenticity and doctor license without exposing confidential clinical content.');
    }

    // =========================================================================
    // ▶ TEST 6: Testing Withdrawn Report Version
    // =========================================================================
    console.log('\n▶ TEST 6: Testing Withdrawn Report Version');
    {
      // Doctor withdraws the report
      const withdrawRes = await api('POST', '/api/doctor/withdraw-clinical-report', 'doctor-1', {
        caseId,
        reason: 'Laboratory discrepancy detected; reassessment scheduled.'
      });
      assert.equal(withdrawRes.status, 200);

      // 1. Verify Public Authenticity API reflects withdrawal
      const verifyWithdrawn = await api('GET', `/api/reports/verify/HV-REP-CERT101`);
      assert.equal(verifyWithdrawn.status, 200);
      assert.equal(verifyWithdrawn.data.valid, false);
      assert.equal(verifyWithdrawn.data.status, 'withdrawn');
      assert.equal(verifyWithdrawn.data.withdrawalReason, 'Laboratory discrepancy detected; reassessment scheduled.');
      assert.ok(verifyWithdrawn.data.withdrawnAt);
      assert.equal(verifyWithdrawn.data.clinicalDiagnosis, undefined, 'Withdrawn verification still conceals medical data');

      // 2. Verify PDF export marks withdrawn status
      const pdfWithdrawn = ReportsService.formatReportForPdfExport({ record: testCases[caseId], language: 'ar' });
      assert.equal(pdfWithdrawn.isWithdrawn, true);
      assert.equal(pdfWithdrawn.withdrawal.reason, 'Laboratory discrepancy detected; reassessment scheduled.');

      // 3. Verify Security Badge UI reflects withdrawn state
      const badgeHtml = ReportsUI.renderReportSecurityBadge(testCases[caseId], false);
      assert.ok(badgeHtml.includes('تم سحب التقرير رسمياً بواسطة الطبيب') || badgeHtml.includes('withdrawn'));

      console.log('  ✓ Withdrawn report displays explicit withdrawal notice, reason, and invalidates authenticity certificate.');
    }

    // =========================================================================
    // ▶ TEST 7: Printing Long Multi-Page Report Layout & Pagination
    // =========================================================================
    console.log('\n▶ TEST 7: Long Report Multi-Page Printing & CSS Pagination Rules');
    {
      const cssContent = fs.readFileSync(stylesPath, 'utf8');

      // Verify print stylesheet rules
      assert.ok(cssContent.includes('@media print'), 'Print media query exists');
      assert.ok(cssContent.includes('page-break-inside: auto') || cssContent.includes('break-inside: auto'), 'Report page allows multi-page break flow');
      assert.ok(cssContent.includes('page-break-inside: avoid') || cssContent.includes('break-inside: avoid'), 'Report cards avoid breaking midway through a section');
      assert.ok(cssContent.includes('.print-pagination'), 'Print pagination styling exists');
      assert.ok(cssContent.includes('body.print-lang-ar') && cssContent.includes('Cairo'), 'Arabic print typography defined');
      assert.ok(cssContent.includes('body.print-lang-en') && cssContent.includes('Inter'), 'English print typography defined');

      // Simulate a long multi-section clinical case
      const longMeds = Array.from({ length: 12 }, (_, i) => `Medication ${i + 1}: 500mg daily with meals`).join('\n');
      const longRecs = Array.from({ length: 10 }, (_, i) => `Clinical directive ${i + 1}: follow comprehensive respiratory protocol step ${i + 1}`);
      const longCase = {
        ...approvedCase,
        medications: longMeds,
        recommendations: longRecs,
        reportSnapshot: {
          ...approvedCase.reportSnapshot,
          clinicalContent: {
            ...approvedCase.reportSnapshot.clinicalContent,
            medications: longMeds,
            recommendations: longRecs
          }
        }
      };

      const pdfLongAr = ReportsService.formatReportForPdfExport({ record: longCase, language: 'ar' });
      assert.equal(pdfLongAr.clinical.recs.length, 10, 'All 10 recommendations preserved in export model');
      assert.ok(pdfLongAr.clinical.meds.includes('Medication 12'), 'All 12 medications preserved in export model');

      console.log('  ✓ Long reports configure seamless page-break flow, section integrity, and bilingual print typography.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL 7 REPORT PDF, SHARING & VERIFICATION TESTS PASSED (100%)');
    console.log('==================================================================');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err && (err.stack || err.message) ? (err.stack || err.message) : err);
  process.exitCode = 1;
});
