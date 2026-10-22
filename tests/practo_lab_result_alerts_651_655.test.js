/**
 * Health Vibe AI - Practo Benchmark: Requested Lab Result Alerts Test Suite
 * Tasks #651, #652, #653, #654, #655
 *
 * Test Matrix:
 * 1. UI/UX Flow (#651): Patient test checklist, upload status badges, doctor inbox with review links, AR/EN.
 * 2. Backend & APIs (#652): createLabRequest, getPatientRequests, attachUploadToRequest, acknowledgeResult, inbox.
 * 3. Safety & Privacy (#653): Zero raw test values / diagnoses in notification body (minimal-PHI deep link only),
 *    AI never interprets lab findings, doctor-only access to review interface.
 * 4. Integration QA & Edge Cases (#654): Cross-patient upload attempts blocked, non-requested tests rejected,
 *    48h unreviewed result escalations, replacement upload re-alerting.
 * 5. Analytics & Logging (#655): Fulfilment rates, turnaround hours to upload & review, audit trail.
 */

'use strict';

const assert = require('assert');
const {
  LabResultAlertService,
  labResultAlertService,
  LAB_TESTS,
  REQUEST_STATUS,
  ITEM_STATUS,
  REVIEW_ESCALATION_HOURS
} = require('../backend/lab-result-alert-service');

const { LabRequestPanel } = require('../app/modules/appointments/feature-panels-641-670');

console.log('\n==================================================================');
console.log('🧪 HEALTH VIBE AI: PRACTO REQUESTED LAB ALERTS (TASKS #651-#655)');
console.log('   Doctor-Only Notifications, Zero-PHI Payloads & 48h Escalation');
console.log('==================================================================\n');

async function runTests() {
  let virtualTime = 1770000000000;
  const now = () => virtualTime;
  const service = new LabResultAlertService({ now });

  const doctor1 = { uid: 'doc_practo_01', role: 'doctor', displayName: 'Dr. Tariq' };
  const doctor2 = { uid: 'doc_practo_02', role: 'doctor', displayName: 'Dr. Mona' };
  const patient = { uid: 'pt_practo_01', role: 'patient' };
  const stranger = { uid: 'pt_stranger_99', role: 'patient' };
  const admin = { uid: 'admin_sys_01', role: 'super_admin' };

  // ==================================================================
  // TASK #652: Backend & APIs - Create Lab Request & Patient View
  // ==================================================================
  console.log('▶ TASK #652: Backend & APIs - Lab Investigation Requests & Checklists');
  {
    // Only doctors can create lab requests
    assert.throws(() => service.createLabRequest({ patientId: patient.uid, tests: ['cbc'] }, patient), /FORBIDDEN/);

    // Invalid test code rejected
    assert.throws(() => service.createLabRequest({ patientId: patient.uid, assessmentId: 'asmt_01', tests: ['invalid_test'] }, doctor1), /INVALID_TESTS/);

    const request = service.createLabRequest({
      patientId: patient.uid,
      assessmentId: 'asmt_pulmo_01',
      tests: ['cbc', 'sputum_culture', 'spirometry'],
      note: 'Please do sputum culture before starting antibiotic'
    }, doctor1);

    assert.ok(request.id.startsWith('labreq_'));
    assert.strictEqual(request.status, REQUEST_STATUS.PENDING);
    assert.strictEqual(request.items.length, 3);
    assert.strictEqual(request.items[0].status, ITEM_STATUS.AWAITING);

    const patientList = service.getPatientRequests(patient.uid, patient);
    assert.strictEqual(patientList.length, 1);
    assert.strictEqual(patientList[0].id, request.id);

    console.log('  ✓ Investigation request created and verified on patient checklist');
  }

  // ==================================================================
  // TASK #651: UI/UX Flow - Checklist & Doctor Inbox Rendering
  // ==================================================================
  console.log('▶ TASK #651: UI/UX Flow - Checklist Badges & Doctor Inbox in AR/EN');
  {
    const requests = service.getPatientRequests(patient.uid, patient);
    const htmlAr = LabRequestPanel.renderPatientChecklist(requests, LAB_TESTS, false);
    assert.ok(htmlAr.includes('dir="rtl"'));
    assert.ok(htmlAr.includes('صورة دم كاملة (CBC)'));
    assert.ok(htmlAr.includes('مطلوب الرفع'));
    assert.ok(htmlAr.includes('data-action="upload"'));

    const htmlEn = LabRequestPanel.renderPatientChecklist(requests, LAB_TESTS, true);
    assert.ok(htmlEn.includes('dir="ltr"'));
    assert.ok(htmlEn.includes('Complete Blood Count (CBC)'));
    assert.ok(htmlEn.includes('Upload result'));

    const sampleInbox = [{
      id: 'notif_1', doctorId: doctor1.uid, titleAr: 'تم رفع فحص', titleEn: 'Test uploaded',
      bodyAr: 'صورة دم', bodyEn: 'CBC', deepLink: '/doctor/lab/1', read: false
    }];
    const inboxHtml = LabRequestPanel.renderDoctorInbox(sampleInbox, false);
    assert.ok(inboxHtml.includes('doctorLabInbox'));
    assert.ok(inboxHtml.includes('/doctor/lab/1'));

    console.log('  ✓ Bilingual checklist and doctor inbox panels verified');
  }

  // ==================================================================
  // TASK #653: Safety & Privacy - Zero-PHI Notification & Doctor Integrity
  // ==================================================================
  console.log('▶ TASK #653: Safety & Privacy - Minimal-PHI Notification & Integrity');
  {
    const req = service.getPatientRequests(patient.uid, patient)[0];

    // Upload attachment by patient
    const { notification } = service.attachUploadToRequest(req.id, 'cbc', 'upload_cbc_99', patient);

    // Notification must be directed exclusively to the requesting doctor
    assert.strictEqual(notification.doctorId, doctor1.uid);
    assert.strictEqual(notification.kind, 'result_uploaded');

    // Zero raw test values, no diagnoses, no raw uploaded filenames in payload
    assert.strictEqual(notification.resultValue, undefined);
    assert.strictEqual(notification.diagnosis, undefined);
    assert.strictEqual(notification.fileName, undefined);
    assert.ok(notification.deepLink.startsWith('/doctor/lab-requests/'));

    // Another doctor cannot access doctor1 inbox
    assert.throws(() => service.getDoctorInbox(doctor1.uid, doctor2), /FORBIDDEN/);

    // Only requesting doctor can acknowledge / review result
    assert.throws(() => service.acknowledgeResult(req.id, 'cbc', doctor2), /FORBIDDEN/);
    assert.throws(() => service.acknowledgeResult(req.id, 'cbc', patient), /FORBIDDEN/);

    const reviewed = service.acknowledgeResult(req.id, 'cbc', doctor1);
    assert.strictEqual(reviewed.items.find(i => i.code === 'cbc').status, ITEM_STATUS.REVIEWED);

    console.log('  ✓ Zero-PHI notification payload and doctor-only review gate enforced');
  }

  // ==================================================================
  // TASK #654: Integration QA & Edge Cases - 48h Escalation & Replaced Uploads
  // ==================================================================
  console.log('▶ TASK #654: Integration QA & Edge Cases - 48h Escalation & Replacement Uploads');
  {
    const req = service.getPatientRequests(patient.uid, patient)[0];

    // Stranger cannot upload for patient request
    assert.throws(() => service.attachUploadToRequest(req.id, 'sputum_culture', 'up_fail', stranger), /FORBIDDEN/);

    // Unrequested test cannot be attached
    assert.throws(() => service.attachUploadToRequest(req.id, 'chest_xray', 'up_fail', patient), /TEST_NOT_REQUESTED/);

    // Attach sputum_culture
    service.attachUploadToRequest(req.id, 'sputum_culture', 'upload_sputum_01', patient);

    // Advance time 50 hours without doctor review -> escalates
    assert.strictEqual(service.escalateOverdueReviews().length, 0); // before 48h
    virtualTime += 50 * 3600000;
    const escalated = service.escalateOverdueReviews();
    assert.strictEqual(escalated.length, 1);
    assert.strictEqual(escalated[0].kind, 'review_overdue');
    assert.ok(escalated[0].titleAr.includes('٤٨ ساعة'));

    // Re-uploading replaces the result and re-alerts the doctor
    const { notification: replacementNotif } = service.attachUploadToRequest(req.id, 'sputum_culture', 'upload_sputum_02', patient);
    assert.strictEqual(replacementNotif.kind, 'result_replaced');

    console.log('  ✓ 48h overdue review escalation and replacement upload alerts verified');
  }

  // ==================================================================
  // TASK #655: Analytics & Logging
  // ==================================================================
  console.log('▶ TASK #655: Analytics & Logging - Fulfilment & Turnaround Metrics');
  {
    assert.throws(() => service.getAnalytics(patient), /FORBIDDEN/);
    const metrics = service.getAnalytics(admin);

    assert.ok(metrics.requestsCreated >= 1);
    assert.ok(metrics.resultsUploaded >= 2);
    assert.ok(metrics.resultsReviewed >= 1);
    assert.ok(metrics.overdueEscalations >= 1);
    assert.ok(metrics.fulfilmentRatePct > 0);

    const audit = service.audit.list();
    assert.ok(audit.some(e => e.type === 'LAB_REQUEST_CREATED'));
    assert.ok(audit.some(e => e.type === 'LAB_RESULT_ATTACHED'));
    assert.ok(audit.some(e => e.type === 'LAB_RESULT_REVIEWED'));

    console.log('  ✓ Turnaround analytics and audit trail verified');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL PRACTO REQUESTED LAB ALERT TESTS PASSED (TASKS #651-#655)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ PRACTO LAB ALERT TEST FAILED:', err);
  process.exit(1);
});
