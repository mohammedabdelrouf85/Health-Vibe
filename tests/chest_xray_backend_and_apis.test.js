/**
 * Health Vibe AI - Chest Radiology Backend, Security & APIs Test Suite
 * Benchmark: Rology Teleradiology Platform Standards
 * Focus: Backend / Security / LOINC Codes / PACS & DICOM / Doctor Notifications
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { radiologyService, RADIOLOGY_MODALITIES, URGENCY_LEVELS, STUDY_STATUS, MAX_RADIOLOGY_FILE_SIZE } = require('../backend/radiology-service');

async function runTestSuite() {
  console.log('\n==================================================================');
  console.log('🩻 HEALTH VIBE AI: CHEST RADIOLOGY BACKEND & APIS QA SUITE');
  console.log('   Benchmark: Rology Teleradiology & LOINC Standard');
  console.log('==================================================================\n');

  let passed = 0;
  radiologyService.resetStoreForTesting();

  // TEST 1: Modalities & Official LOINC Mapping
  try {
    console.log('▶ TEST 1: Modalities & Official LOINC Mapping');
    const modalities = radiologyService.getModalities();
    assert.strictEqual(modalities.cxr_pa_lat.loinc, '36643-5', 'CXR must have LOINC 36643-5');
    assert.strictEqual(modalities.ct_thorax_plain.loinc, '24627-2', 'CT Plain must have LOINC 24627-2');
    assert.ok(modalities.cxr_pa_lat.turnaroundHours.stat <= 2, 'STAT turnaround must be <= 2 hours');
    console.log('  ✓ Official LOINC codes and turnaround SLA hours verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // TEST 2: Strict File Intake & 15MB Size Boundary Validation
  try {
    console.log('▶ TEST 2: Strict File Intake & 15MB Size Boundary Validation');
    assert.throws(() => {
      radiologyService.validateRadiologyFile({ fileName: 'scan.exe', fileSize: 1024 });
    }, /not permitted/, 'Must block executable extensions');

    assert.throws(() => {
      radiologyService.validateRadiologyFile({ fileName: 'scan.dcm', fileSize: 0 });
    }, /empty/, 'Must block 0-byte files');

    assert.throws(() => {
      radiologyService.validateRadiologyFile({ fileName: 'huge_ct.dcm', fileSize: 16 * 1024 * 1024 });
    }, /exceeds maximum allowable 15MB limit/, 'Must enforce 15MB boundary');

    const validDicom = radiologyService.validateRadiologyFile({ fileName: 'chest_pa.dcm', fileSize: 14 * 1024 * 1024, mimeType: 'application/dicom' });
    assert.strictEqual(validDicom.valid, true);
    console.log('  ✓ File intake, extension whitelisting, and 15MB limit verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // TEST 3: Study Upload & Teleradiology State Lifecycle
  try {
    console.log('▶ TEST 3: Study Upload & Teleradiology State Lifecycle');
    const uploadRes = await radiologyService.uploadRadiologyStudy({
      patientId: 'patient_ahmed_101',
      clinicId: 'cairo_chest_center',
      modality: 'cxr_pa_lat',
      indications: ['ind_dyspnea', 'ind_cough'],
      urgency: 'routine',
      clinicalNotes: 'Shortness of breath on exertion.',
      fileName: 'PA_Chest_Scan.jpg',
      fileSize: 4500000,
      mimeType: 'image/jpeg'
    });

    assert.strictEqual(uploadRes.success, true);
    assert.ok(uploadRes.studyId.startsWith('rad_study_'));
    assert.strictEqual(uploadRes.study.status, STUDY_STATUS.PENDING_RADIOLOGIST);
    assert.strictEqual(uploadRes.study.loincCode, '36643-5');
    assert.strictEqual(uploadRes.study.humanReviewRequired, true);

    const retrieved = radiologyService.getStudyById(uploadRes.studyId);
    assert.strictEqual(retrieved.studyId, uploadRes.studyId);
    console.log('  ✓ Radiology study intake and initial teleradiology state verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // TEST 4: Urgent & STAT Escalation and Notification Dispatch
  try {
    console.log('▶ TEST 4: Urgent & STAT Escalation and Notification Dispatch');
    const statUpload = await radiologyService.uploadRadiologyStudy({
      patientId: 'patient_urgent_202',
      clinicId: 'cairo_chest_center',
      modality: 'ct_thorax_plain',
      indications: ['ind_hemoptysis'],
      urgency: 'stat',
      clinicalNotes: 'Suspected acute pulmonary embolism.',
      fileName: 'CTPA_Angio.dcm',
      fileSize: 12000000,
      mimeType: 'application/dicom'
    });

    assert.strictEqual(statUpload.success, true);
    assert.strictEqual(statUpload.urgentAlertDispatched, true);
    assert.strictEqual(statUpload.study.slaHours, 2, 'STAT study must have 2-hour SLA');
    console.log('  ✓ Emergency STAT turnaround SLA and urgent doctor alert dispatch verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // TEST 5: Radiologist Clinical Certification Sign-off
  try {
    console.log('▶ TEST 5: Radiologist Clinical Certification Sign-off');
    const doctorUser = {
      uid: 'doc_radiologist_tarek',
      displayName: 'Dr. Tarek Mahmoud, MD (Radiology)',
      role: 'radiologist',
      licenseNumber: 'EGY-RAD-44910'
    };

    const patientStudies = radiologyService.getPatientStudies('patient_ahmed_101');
    assert.ok(patientStudies.length > 0);
    const studyId = patientStudies[0].studyId;

    const certRes = await radiologyService.certifyStudyByRadiologist({
      studyId,
      doctorUser,
      findings: 'Clear bilateral lung fields, normal cardiothoracic ratio.',
      clinicalImpression: 'Normal chest radiograph (No acute consolidation).',
      isNormal: true
    });

    assert.strictEqual(certRes.success, true);
    assert.strictEqual(certRes.certifiedStatus, STUDY_STATUS.CERTIFIED);
    assert.strictEqual(certRes.certifiedBy.licenseNumber, 'EGY-RAD-44910');

    // Reject unverified role
    await assert.rejects(async () => {
      await radiologyService.certifyStudyByRadiologist({
        studyId,
        doctorUser: { uid: 'pat_bad', role: 'patient' },
        findings: 'test'
      });
    }, /Only licensed physicians/);

    console.log('  ✓ Radiologist digital sign-off and syndicate license stamping verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // TEST 6: Doctor Rejection of Blurry / Motion-Artifact Scans
  try {
    console.log('▶ TEST 6: Doctor Rejection of Blurry / Motion-Artifact Scans');
    const rejectStudy = await radiologyService.uploadRadiologyStudy({
      patientId: 'patient_blurry_303',
      modality: 'cxr_pa_lat',
      fileName: 'blurry_lateral.jpg',
      fileSize: 2000000,
      mimeType: 'image/jpeg'
    });

    const rejectRes = await radiologyService.rejectStudyAsIllegible({
      studyId: rejectStudy.studyId,
      doctorUser: { uid: 'doc_1', role: 'doctor' },
      rejectionReason: 'Severe breathing motion artifact across lower lung bases'
    });

    assert.strictEqual(rejectRes.success, true);
    assert.strictEqual(rejectRes.status, STUDY_STATUS.REJECTED_ILLEGIBLE);
    console.log('  ✓ Illegible/corrupt scan rejection workflow verified.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // TEST 7: Backend Server REST API Endpoints in server.js
  try {
    console.log('▶ TEST 7: Backend Server REST API Endpoints in server.js');
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverContent.includes('/api/radiology/upload'), 'POST /api/radiology/upload route must be defined');
    assert.ok(serverContent.includes('/api/radiology/studies/:patientId'), 'GET /api/radiology/studies/:patientId route must be defined');
    assert.ok(serverContent.includes('/api/radiology/studies/:studyId/certify'), 'POST /api/radiology/studies/:studyId/certify route must be defined');
    assert.ok(serverContent.includes('/api/radiology/studies/:studyId/reject'), 'POST /api/radiology/studies/:studyId/reject route must be defined');
    assert.ok(serverContent.includes('/api/radiology/disclaimer'), 'GET /api/radiology/disclaimer route must be defined');
    assert.ok(serverContent.includes('/api/radiology/analytics/kpis'), 'GET /api/radiology/analytics/kpis route must be defined');

    console.log('  ✓ All 6 radiology REST API endpoints verified in server.js.\n');
    passed++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  console.log('==================================================================');
  if (passed === 7) {
    console.log('🎉 ALL 7 CHEST RADIOLOGY BACKEND & APIS TESTS PASSED!');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${7 - passed} tests failed.`);
    process.exit(1);
  }
}

runTestSuite();
