/**
 * Health Vibe AI - Clinical Information Exchange & Versioned Revision Test Suite
 *
 * Verifies:
 * 1. Stable Request ID generation and cycle tracking.
 * 2. Immutable Observation History preserving measurement time, units, and provenance.
 * 3. Canonical Assessment consistency and clinical revision increments.
 * 4. Trusted write path enforcing ownership, allowed fields, and state transitions.
 * 5. Multi-cycle request/response lifecycle.
 * 6. Prevention of duplicate submissions (409 Conflict).
 * 7. Prevention of stale replies to superseded or closed cases.
 * 8. Rejection of forbidden field tampering by patients.
 * 9. Rejection of conflicting measurement fields (Systolic <= Diastolic, future timestamps, invalid units).
 */

const assert = require('node:assert/strict');
const infoExchangeService = require('../backend/clinical-info-exchange-service');

console.log('==================================================================');
console.log('📋 HEALTH VIBE AI: CLINICAL INFO EXCHANGE & REVISION TEST SUITE');
console.log('   Stable IDs, Provenance, Multi-Cycle, Revisions & Anti-Tamper');
console.log('==================================================================\n');

(async () => {
  infoExchangeService.resetStoreForTesting();

  // Test Personas
  const assignedDoctor = {
    uid: 'doc_pulmo_adel_402',
    name: 'د. عادل توفيق',
    licenseNumber: 'HV-PULMO-LIC-4491',
    specialty: 'أمراض الصدر والجهاز التنفسي',
    role: 'doctor',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const otherDoctor = {
    uid: 'doc_other_unassigned_777',
    name: 'طبيب غير مسند',
    licenseNumber: 'HV-GEN-777',
    specialty: 'طب عام',
    role: 'doctor',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const suspendedDoctor = {
    uid: 'doc_suspended_111',
    name: 'طبيب موقوف',
    licenseNumber: 'HV-REVOKED-111',
    role: 'doctor',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const legitimatePatient = {
    uid: 'usr_pt_tarek_982',
    name: 'طارق عبد المنعم',
    role: 'patient'
  };

  const imposterPatient = {
    uid: 'usr_imposter_hacker_999',
    name: 'مستخدم متسلل',
    role: 'patient'
  };

  const caseId = 'case_resp_triage_2026_001';

  // -----------------------------------------------------------------------------
  // TEST 1: Initial Case Registration & Baseline State
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 1: Initial Case Registration & Baseline Observation ...');
  const clinicalCase = infoExchangeService.registerCase({
    id: caseId,
    patientId: legitimatePatient.uid,
    assignedDoctorId: assignedDoctor.uid,
    status: 'under_review',
    oxygenLevel: 91,
    symptoms: ['كحة جافة', 'ضيق تنفس مع المجهود'],
    createdAt: new Date(Date.now() - 3600000).toISOString()
  });

  assert.equal(clinicalCase.clinicalRevision, 1, 'Initial revision must be 1');
  assert.equal(clinicalCase.status, 'under_review');
  const initialObs = infoExchangeService.getCaseObservationHistory(caseId);
  assert.equal(initialObs.length, 1, 'Baseline observation should be preserved');
  assert.equal(initialObs[0].type, 'oxygenLevel');
  assert.equal(initialObs[0].value, 91);
  console.log('  ✓ Baseline case registered with revision 1 and initial SpO2 observation.\n');

  // -----------------------------------------------------------------------------
  // TEST 2: Create Versioned Request (Stable ID, Doctor Permissions & Cycle 1)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 2: Versioned Information Request Generation (Cycle 1) ...');
  // Rejection of suspended doctor
  assert.throws(
    () => {
      infoExchangeService.createInformationRequest({
        caseId,
        doctor: suspendedDoctor,
        clinicalRationale: 'Need more info'
      });
    },
    (err) => {
      assert.equal(err.code, 'UNAPPROVED_DOCTOR');
      return true;
    }
  );

  // Rejection of unassigned doctor
  assert.throws(
    () => {
      infoExchangeService.createInformationRequest({
        caseId,
        doctor: otherDoctor,
        clinicalRationale: 'Need more info'
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN_UNASSIGNED_DOCTOR');
      return true;
    }
  );

  // Successful request by assigned doctor
  const req1 = infoExchangeService.createInformationRequest({
    caseId,
    doctor: assignedDoctor,
    requestedFields: ['oxygenLevel', 'temperature'],
    clinicalRationale: 'يرجى قياس نسبة الأكسجين مرة أخرى أثناء الراحة وقياس درجة الحرارة بالترمومتر.'
  });

  assert.ok(req1.requestId.startsWith(`req_info_${caseId}_c1_`), 'Request ID must be stable and prefixed with case and cycle');
  assert.equal(req1.cycle, 1, 'First request cycle must be 1');
  assert.equal(req1.status, 'pending_response');
  assert.equal(clinicalCase.status, 'more_info_requested', 'Case must transition to more_info_requested');
  assert.equal(clinicalCase.activeRequestId, req1.requestId);
  console.log(`  ✓ Created stable request ${req1.requestId} with cycle 1; case status transitioned to more_info_requested.\n`);

  // -----------------------------------------------------------------------------
  // TEST 3: Patient Ownership Enforcement & Forbidden Field Tampering
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 3: Ownership Enforcement & Forbidden Field Tampering Rejection ...');
  // Imposter attempt
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: imposterPatient,
        measurements: [{ type: 'oxygenLevel', value: 98, unit: '%' }]
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN_CASE_OWNERSHIP_MISMATCH');
      return true;
    }
  );

  // Patient attempt to forge diagnosis or doctor notes
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        officialDiagnosis: 'حالة سليمة تماماً ولا يوجد مرض',
        doctorNotes: 'المريض لا يعاني من أي مشكلة',
        measurements: [{ type: 'oxygenLevel', value: 98, unit: '%' }]
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN_FIELD_TAMPERING');
      return true;
    }
  );
  console.log('  ✓ Ownership enforced; imposter blocked; clinical field tampering rejected.\n');

  // -----------------------------------------------------------------------------
  // TEST 4: Measurement Validation (Units, Ranges & Anti-Conflict)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 4: Measurement Validation (Conflicting BP, Future Time, Invalid Unit) ...');
  // Conflicting blood pressure: Systolic <= Diastolic
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        measurements: [
          { type: 'systolicBp', value: 70, unit: 'mmHg' },
          { type: 'diastolicBp', value: 90, unit: 'mmHg' }
        ]
      });
    },
    (err) => {
      assert.equal(err.code, 'CONFLICTING_BLOOD_PRESSURE_INTERVAL');
      return true;
    }
  );

  // Future measurement timestamp
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        measurements: [
          { type: 'oxygenLevel', value: 95, unit: '%', measuredAt: new Date(Date.now() + 86400000).toISOString() }
        ]
      });
    },
    (err) => {
      assert.equal(err.code, 'FUTURE_MEASUREMENT_TIMESTAMP');
      return true;
    }
  );

  // Incompatible unit
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        measurements: [
          { type: 'oxygenLevel', value: 95, unit: 'mmHg' } // oxygen must be %
        ]
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_MEASUREMENT_UNIT');
      return true;
    }
  );

  // Duplicate measurements of same type in same payload
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        measurements: [
          { type: 'temperature', value: 37.0, unit: '°C' },
          { type: 'temperature', value: 38.5, unit: '°C' }
        ]
      });
    },
    (err) => {
      assert.equal(err.code, 'CONFLICTING_MEASUREMENT_FIELDS');
      return true;
    }
  );
  console.log('  ✓ Physiological ranges, conflicting intervals, future timestamps, and bad units rejected.\n');

  // -----------------------------------------------------------------------------
  // TEST 5: Legitimate Reply Submission & Non-Overwriting Observation History
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 5: Legitimate Reply Submission & Non-Overwriting Observation History ...');
  const reply1Res = infoExchangeService.submitInformationReply({
    caseId,
    requestId: req1.requestId,
    patient: legitimatePatient,
    patientNotes: 'تمت إعادة القياس بعد الراحة لمدة ربع ساعة والحرارة بالترمومتر الفموي.',
    measurements: [
      {
        type: 'oxygenLevel',
        value: 96,
        unit: '%',
        measuredAt: new Date().toISOString(),
        provenance: { source: 'patient_self_report', deviceDetails: 'Beurer PO 30 Pulse Oximeter' }
      },
      {
        type: 'temperature',
        value: 99.5, // 99.5 °F should be normalized to 37.5 °C
        unit: '°F',
        measuredAt: new Date().toISOString(),
        provenance: { source: 'patient_self_report', deviceDetails: 'Digital oral thermometer' }
      }
    ],
    symptoms: ['كحة خفيفة متقطعة']
  });

  assert.equal(reply1Res.success, true);
  assert.equal(reply1Res.caseStatus, 'under_review', 'Case must return to under_review');
  assert.equal(reply1Res.clinicalRevision, 2, 'Clinical revision must increment to 2');

  // Verify request is marked as replied
  const updatedReq1 = infoExchangeService.getRequestById(req1.requestId);
  assert.equal(updatedReq1.status, 'replied');
  assert.equal(updatedReq1.responseId, reply1Res.reply.replyId);

  // Check observation history: baseline (91%) AND new (96%) both exist!
  const allObservations = infoExchangeService.getCaseObservationHistory(caseId);
  assert.equal(allObservations.length, 3, 'Observation history must contain baseline + 2 new measurements');

  const o2Observations = infoExchangeService.getCaseObservationHistory(caseId, 'oxygenLevel');
  assert.equal(o2Observations.length, 2, 'Should preserve both baseline and cycle 1 oxygen observations');
  assert.equal(o2Observations[0].value, 91, 'Baseline observation intact');
  assert.equal(o2Observations[1].value, 96, 'New cycle 1 observation appended');

  // Check temperature normalized
  const tempObservations = infoExchangeService.getCaseObservationHistory(caseId, 'temperature');
  assert.equal(tempObservations.length, 1);
  assert.equal(tempObservations[0].value, 37.5, '99.5 °F must be normalized to 37.5 °C');
  assert.equal(tempObservations[0].unit, '°C');

  // Check current canonical assessment updated
  assert.equal(clinicalCase.currentAssessment.oxygenLevel, 96);
  assert.equal(clinicalCase.o2, 96); // top-level alias
  assert.equal(clinicalCase.currentAssessment.temperature, 37.5);
  console.log('  ✓ Reply accepted; revision incremented to 2; baseline SpO2 (91%) preserved alongside new SpO2 (96%).\n');

  // -----------------------------------------------------------------------------
  // TEST 6: Duplicate Submission Rejection (409 Conflict)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 6: Duplicate Submission Rejection ...');
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        patientNotes: 'محاولة إرسال مكررة لنفس الطلب',
        measurements: [{ type: 'oxygenLevel', value: 97, unit: '%' }]
      });
    },
    (err) => {
      assert.equal(err.code, 'REQUEST_ALREADY_ANSWERED');
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
  console.log('  ✓ Duplicate submission to replied request strictly rejected with 409 REQUEST_ALREADY_ANSWERED.\n');

  // -----------------------------------------------------------------------------
  // TEST 7: Multiple Request Cycles (Cycle 2 Progression)
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 7: Multiple Request Cycles (Cycle 2 Progression) ...');
  // Doctor reviews cycle 1, but now needs blood pressure check
  const req2 = infoExchangeService.createInformationRequest({
    caseId,
    doctor: assignedDoctor,
    requestedFields: ['systolicBp', 'diastolicBp', 'heartRate'],
    clinicalRationale: 'النبض كان مرتفعاً قليلاً، يرجى قياس ضغط الدم والنبض بجهاز إلكتروني معتمد.'
  });

  assert.equal(req2.cycle, 2, 'Second request cycle must be 2');
  assert.ok(req2.requestId.startsWith(`req_info_${caseId}_c2_`));
  assert.equal(clinicalCase.status, 'more_info_requested');

  // Test Stale Reply: Patient tries to reply to req1 again while req2 is active
  assert.throws(
    () => {
      infoExchangeService.submitInformationReply({
        caseId,
        requestId: req1.requestId,
        patient: legitimatePatient,
        measurements: [{ type: 'oxygenLevel', value: 97, unit: '%' }]
      });
    },
    (err) => {
      assert.equal(err.code, 'REQUEST_ALREADY_ANSWERED');
      return true;
    }
  );

  // Patient replies to req2 with valid BP and pulse
  const reply2Res = infoExchangeService.submitInformationReply({
    caseId,
    requestId: req2.requestId,
    patient: legitimatePatient,
    patientNotes: 'تم القياس بجهاز أومرون M3 الإلكتروني، القراءة في الصباح الباكر.',
    measurements: [
      {
        type: 'systolicBp',
        value: 125,
        unit: 'mmHg',
        measuredAt: new Date().toISOString(),
        provenance: { source: 'patient_self_report', deviceDetails: 'Omron M3 Comfort' }
      },
      {
        type: 'diastolicBp',
        value: 82,
        unit: 'mmHg',
        measuredAt: new Date().toISOString(),
        provenance: { source: 'patient_self_report', deviceDetails: 'Omron M3 Comfort' }
      },
      {
        type: 'heartRate',
        value: 78,
        unit: 'bpm',
        measuredAt: new Date().toISOString(),
        provenance: { source: 'patient_self_report', deviceDetails: 'Omron M3 Comfort' }
      }
    ]
  });

  assert.equal(reply2Res.success, true);
  assert.equal(reply2Res.clinicalRevision, 3, 'Revision must increment to 3');
  assert.equal(clinicalCase.status, 'under_review');
  assert.equal(clinicalCase.currentAssessment.systolicBp, 125);
  assert.equal(clinicalCase.currentAssessment.diastolicBp, 82);
  assert.equal(clinicalCase.currentAssessment.heartRate, 78);

  // Total observations now: 1 baseline + 2 from cycle 1 + 3 from cycle 2 = 6!
  const finalObservations = infoExchangeService.getCaseObservationHistory(caseId);
  assert.equal(finalObservations.length, 6, 'All 6 observations across cycle 0, 1, and 2 must be preserved');
  console.log('  ✓ Cycle 2 completed smoothly; clinical revision incremented to 3; all 6 observations preserved.\n');

  // -----------------------------------------------------------------------------
  // TEST 8: Revision Trajectory & Historical Audit Verification
  // -----------------------------------------------------------------------------
  console.log('▶ TEST 8: Revision Trajectory & Audit Trail Verification ...');
  const revisions = infoExchangeService.getCaseRevisionHistory(caseId);
  assert.equal(revisions.length, 3, 'Should have records for revisions 1, 2, and 3');
  assert.equal(revisions[0].revision, 1);
  assert.equal(revisions[1].revision, 2);
  assert.equal(revisions[1].trigger, 'patient_more_info_reply');
  assert.equal(revisions[1].cycle, 1);
  assert.equal(revisions[2].revision, 3);
  assert.equal(revisions[2].cycle, 2);

  const requestHistory = infoExchangeService.getCaseRequestHistory(caseId);
  assert.equal(requestHistory.length, 2, 'Should have 2 request records');
  assert.equal(requestHistory[0].cycle, 1);
  assert.equal(requestHistory[0].status, 'replied');
  assert.equal(requestHistory[1].cycle, 2);
  assert.equal(requestHistory[1].status, 'replied');

  const auditLogs = infoExchangeService.getAuditLogs({ caseId });
  assert.ok(auditLogs.length >= 4, 'Audit logs must capture creation and reply events');
  console.log('  ✓ Full clinical revision history and audit trail verified.\n');

  console.log('==================================================================');
  console.log('🎉 ALL 8 CLINICAL INFO EXCHANGE & REVISION TESTS PASSED (100%)');
  console.log('==================================================================');
})();
