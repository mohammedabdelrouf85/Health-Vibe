/**
 * Health Vibe AI - Doctor-Approved Case Follow-Up & Remote Monitoring Test Suite
 *
 * Verifies:
 * 1. Approved Doctor Role & Credential Gating (unapproved users blocked).
 * 2. Case-Linked Follow-up Plan Creation (tasks, appointments, reminders, discharge protocol).
 * 3. Step Completion, Delay Tracking & Responsible Person Assignment.
 * 4. Automatic Delay Escalations (Nurse Outreach & Urgent Physician Notification).
 * 5. Longitudinal Patient Risk Timeline & Trajectory Calculation.
 * 6. Remote Monitoring (RPM) Reliable Source Gating vs. Unverified Source Quarantine.
 * 7. Plan Modification (Versioning & Audit Trail) and Cancellation (Task/Reminder Purge).
 * 8. Clinical Decision Guard (Prevention of Unapproved Medical Decisions/Alerts).
 */

const assert = require('node:assert/strict');
const caseFollowupService = require('../backend/case-followup-service');

console.log('==================================================================');
console.log('📋 HEALTH VIBE AI: CASE FOLLOW-UP & REMOTE MONITORING TEST SUITE');
console.log('   Doctor Gating, Step Tracking, Escalations & Risk Timeline');
console.log('==================================================================\n');

(async () => {
  caseFollowupService.resetFollowupStoreForTesting();

  // Test Fixtures: Approved Doctor vs. Suspended Doctor
  const approvedDoctor = {
    uid: 'doc_pulmo_adel_402',
    name: 'د. عادل توفيق',
    licenseNumber: 'HV-PULMO-LIC-4491',
    specialty: 'أمراض الصدر والجهاز التنفسي',
    clinicId: 'clinic_al_amal_pulmo',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const suspendedDoctor = {
    uid: 'doc_suspended_999',
    name: 'طبيب ملغى الترخيص',
    licenseNumber: 'HV-REVOKED-999',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const patientId = 'usr_patient_hossam_45';
  const caseId = 'case_resp_acute_bronchitis_881';

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Doctor Credentials Gating (Physician-Only Plan Authorization)');
  // ---------------------------------------------------------------------------
  {
    // Attempt creation with suspended doctor
    await assert.rejects(
      async () => {
        await caseFollowupService.createFollowupPlan({
          caseId,
          patientId,
          doctorIdentity: suspendedDoctor,
          title: 'Unapproved Follow-up Plan'
        });
      },
      err => {
        assert.equal(err.code, 'DOCTOR_CREDENTIALS_REQUIRED');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Attempt creation without doctor credentials
    await assert.rejects(
      async () => {
        await caseFollowupService.createFollowupPlan({
          caseId,
          patientId,
          doctorIdentity: null,
          title: 'No Doctor Plan'
        });
      },
      err => {
        assert.equal(err.code, 'DOCTOR_CREDENTIALS_REQUIRED');
        return true;
      }
    );

    console.log('  ✓ Gating enforced: Only active and approved physicians can establish follow-up plans.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Creation of Case-Linked Follow-up Plan & Post-Discharge Protocol');
  // ---------------------------------------------------------------------------
  let activePlan;
  {
    const tasks = [
      {
        taskId: 'task_post_disch_call_48h',
        title: 'مكالمة تمريضية تتبعية خلال 48 ساعة من الخروج',
        category: 'nurse_outreach',
        dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        personResponsible: 'care_coordinator_nurse',
        isMilestone: true
      },
      {
        taskId: 'task_daily_vitals_spo2',
        title: 'قياس نسبة الأكسجين مرتين يومياً بالجهاز المعتمد',
        category: 'vital_sign_log',
        dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        personResponsible: 'patient',
        isMilestone: false
      }
    ];

    const appointments = [
      {
        appointmentId: 'appt_day_7_pulmo_clinic',
        type: 'IN_CLINIC_REVIEW',
        scheduledDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        doctorId: approvedDoctor.uid
      }
    ];

    const reminders = [
      {
        reminderId: 'rem_morning_inhaler',
        title: 'تذكير البخاخ الصباحي الموسع للشعب',
        scheduledTime: '08:00 AM'
      }
    ];

    const postDischargeDetails = {
      hospitalName: 'مستشفى السلام التخصصي',
      dischargeDate: new Date().toISOString(),
      dischargeDiagnosis: 'Acute Exacerbation of Bronchial Asthma / Hospitalized 3 Days',
      readmissionRiskTier: 'MODERATE',
      redFlagReturnPrecautions: [
        'Severe shortness of breath',
        'Fever > 38.5 C',
        'Chest pain'
      ],
      medicationReconciliationCompleted: true
    };

    const remoteMonitoringConfig = {
      enabled: true,
      allowedMetrics: ['SPO2', 'BLOOD_PRESSURE'],
      reliableSourcesOnly: true,
      alertThresholds: {
        spo2Min: 90,
        systolicMax: 180,
        systolicMin: 90
      }
    };

    activePlan = await caseFollowupService.createFollowupPlan({
      caseId,
      patientId,
      patientName: 'حسام الدين عبد الله',
      doctorIdentity: approvedDoctor,
      title: 'خطة متابعة ما بعد الخروج من المستشفى للالتهاب الشعبي الحاد',
      protocolType: caseFollowupService.PROTOCOL_TYPES.POST_HOSPITAL_DISCHARGE,
      tasks,
      appointments,
      reminders,
      postDischargeDetails,
      remoteMonitoringConfig
    });

    assert.equal(activePlan.caseId, caseId);
    assert.equal(activePlan.patientId, patientId);
    assert.equal(activePlan.doctor.name, approvedDoctor.name);
    assert.equal(activePlan.doctor.licenseNumber, approvedDoctor.licenseNumber);
    assert.equal(activePlan.status, caseFollowupService.PLAN_STATUS.ACTIVE);
    assert.equal(activePlan.version, 1);
    assert.equal(activePlan.tasks.length, 2);
    assert.equal(activePlan.appointments.length, 1);
    assert.equal(activePlan.reminders.length, 1);
    assert.equal(activePlan.digitalSignature.algorithm, 'HMAC-SHA256');
    assert.ok(activePlan.digitalSignature.signatureHash.length === 64);
    assert.equal(activePlan.postDischargeDetails.readmissionRiskTier, 'MODERATE');

    console.log('  ✓ Follow-up plan established with HMAC-SHA256 doctor signature and case anchor.');
    console.log('  ✓ Tasks, appointments, reminders, and post-discharge protocols properly initialized.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Step Completion, Delay Tracking & Responsible Party');
  // ---------------------------------------------------------------------------
  {
    const taskId = 'task_daily_vitals_spo2';
    // Complete task on time
    const resultOnTime = caseFollowupService.completeTaskStep({
      planId: activePlan.planId,
      taskId,
      completedBy: { uid: patientId, name: 'حسام الدين', role: 'patient' },
      completionNotes: 'تم القياس بنجاح بالجهاز المعتمد: الأكسجين 97% والنبض 74',
      actualMetrics: { spo2: 97, pulse: 74 },
      completionTimestamp: new Date(Date.now() + 10 * 3600 * 1000).toISOString() // Well before 24h dueDate
    });

    assert.equal(resultOnTime.task.status, caseFollowupService.TASK_STATUS.COMPLETED);
    assert.equal(resultOnTime.isDelayed, false);
    assert.equal(resultOnTime.delayHours, 0);
    assert.equal(resultOnTime.task.completedBy.role, 'patient');

    console.log('  ✓ Task step completed on time with metrics and actor audit trail.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Automatic Overdue Delay Audit & Care Escalations');
  // ---------------------------------------------------------------------------
  {
    // Fast-forward time to 30 hours after the 48h nurse call task was due
    const futureTimestamp = new Date(Date.now() + 80 * 3600 * 1000).toISOString();
    const audit = caseFollowupService.auditPlanDelaysAndOverdue(activePlan.planId, futureTimestamp);

    assert.ok(audit.overdueCount >= 1);
    assert.ok(audit.escalationCount >= 1);

    const nurseTaskAudit = audit.escalations.find(e => e.taskId === 'task_post_disch_call_48h');
    assert.ok(nurseTaskAudit, 'Overdue post-discharge task must generate escalation');
    assert.equal(nurseTaskAudit.tier, caseFollowupService.ESCALATION_TIERS.ATTENDING_PHYSICIAN_URGENT);
    assert.ok(nurseTaskAudit.delayHours > 24);

    console.log('  ✓ Overdue delay calculation verified (>24h delay detected).');
    console.log('  ✓ Automatic care escalation triggered to attending physician.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Patient Risk Timeline & Trajectory Progression');
  // ---------------------------------------------------------------------------
  {
    const timelineReport = caseFollowupService.getPatientRiskTimeline(patientId, caseId);

    assert.equal(timelineReport.patientId, patientId);
    assert.ok(timelineReport.eventCount >= 3);
    assert.ok(timelineReport.timeline.some(e => e.eventType === 'FOLLOWUP_PLAN_ESTABLISHED'));
    assert.ok(timelineReport.timeline.some(e => e.eventType === 'TASK_COMPLETED'));
    assert.ok(timelineReport.timeline.some(e => e.eventType === 'DELAY_ESCALATION_TRIGGERED'));

    console.log(`  ✓ Patient risk timeline verified (${timelineReport.eventCount} chronological events).`);
    console.log(`  ✓ Current risk tier evaluated as: ${timelineReport.currentRiskTier}, Trajectory: ${timelineReport.currentTrajectory}.`);
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Remote Monitoring (RPM) Reliable Source Gating & Threshold Alerts');
  // ---------------------------------------------------------------------------
  {
    // 1. Unreliable source telemetry (e.g. unknown manual log without device calibration)
    const unverifiedTelemetry = caseFollowupService.recordRemoteMonitoringTelemetry({
      planId: activePlan.planId,
      patientId,
      metricType: 'SPO2',
      value: 85, // Critical value, but from unverified source!
      unit: '%',
      source: 'unverified_manual_entry',
      isReliableSource: false
    });

    assert.equal(unverifiedTelemetry.status, 'ACCEPTED_OBSERVATIONAL_ONLY');
    assert.equal(unverifiedTelemetry.alertTriggered, false, 'Unreliable source MUST NOT trigger automated medical alerts');
    assert.ok(unverifiedTelemetry.governanceNote.includes('Unverified sources cannot trigger automated clinical alerts'));

    // 2. Reliable source telemetry (e.g. validated Bluetooth pulse oximeter)
    const verifiedTelemetry = caseFollowupService.recordRemoteMonitoringTelemetry({
      planId: activePlan.planId,
      patientId,
      metricType: 'SPO2',
      value: 88, // SpO2 < 90 triggers verified hypoxia alert
      unit: '%',
      source: 'bluetooth_ble_pulse_oximeter',
      isReliableSource: true,
      sourceDetails: { deviceModel: 'Nonin 3230 BLE Medical Oximeter', calibrated: true }
    });

    assert.equal(verifiedTelemetry.status, 'VERIFIED_ACCEPTED');
    assert.equal(verifiedTelemetry.alertTriggered, true);
    assert.equal(verifiedTelemetry.alertDetails.type, 'HYPOXIA_CRITICAL_RPM_ALERT');

    console.log('  ✓ Safety gate enforced: Unreliable source quarantined as observational without false alerts.');
    console.log('  ✓ Reliable source telemetry successfully evaluated against doctor-approved physiological thresholds.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Follow-up Plan Modification (Versioning & Audit Trail)');
  // ---------------------------------------------------------------------------
  {
    const modifiedPlan = caseFollowupService.modifyFollowupPlan({
      planId: activePlan.planId,
      doctorIdentity: approvedDoctor,
      modificationReason: 'استجابة سريرية جيدة - تعديل جدول المتابعة وإضافة فحص وظائف الرئة',
      updatedTasks: [
        ...activePlan.tasks,
        {
          taskId: 'task_spirometry_review',
          title: 'إجراء فحص كفاءة التنفس السبيرومتري',
          dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          personResponsible: 'pulmonology_technician'
        }
      ]
    });

    assert.equal(modifiedPlan.version, 2);
    assert.equal(modifiedPlan.tasks.length, 3);
    assert.ok(modifiedPlan.auditLog.some(a => a.action === 'PLAN_MODIFIED' && a.version === 2));
    assert.ok(modifiedPlan.digitalSignature.signatureHash.length === 64);

    console.log('  ✓ Plan modification verified: Version incremented to v2 with full cryptographic audit trail.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Clinical Decision Guard (Block Unapproved Medical Decisions)');
  // ---------------------------------------------------------------------------
  {
    // Non-doctor user attempting restricted action
    const coordinatorUser = { uid: 'usr_coord_12', role: 'coordinator', status: 'approved' };
    const patientUser = { uid: patientId, role: 'patient' };

    assert.throws(
      () => caseFollowupService.evaluateClinicalDecisionGuard({
        planId: activePlan.planId,
        proposedAction: 'MODIFY_DOSAGE',
        requestingUser: coordinatorUser
      }),
      /Action 'MODIFY_DOSAGE' is a restricted clinical decision that requires an actively approved physician/
    );

    assert.throws(
      () => caseFollowupService.evaluateClinicalDecisionGuard({
        planId: activePlan.planId,
        proposedAction: 'DISCONTINUE_MEDICATION',
        requestingUser: patientUser
      }),
      /Action 'DISCONTINUE_MEDICATION' is a restricted clinical decision that requires an actively approved physician/
    );

    // Approved doctor is allowed
    const doctorAllowed = caseFollowupService.evaluateClinicalDecisionGuard({
      planId: activePlan.planId,
      proposedAction: 'MODIFY_DOSAGE',
      requestingUser: approvedDoctor
    });
    assert.equal(doctorAllowed.allowed, true);

    console.log('  ✓ Clinical Decision Guard verified: Autonomous prescription/dosage changes strictly blocked.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 9: Plan Cancellation (Immediate Task & Reminder Purge)');
  // ---------------------------------------------------------------------------
  {
    const cancelResult = caseFollowupService.cancelFollowupPlan({
      planId: activePlan.planId,
      doctorIdentity: approvedDoctor,
      cancellationReason: 'تم تحويل المريض لمركز متقدم واستكمال الرعاية التخصصية'
    });

    assert.equal(cancelResult.plan.status, caseFollowupService.PLAN_STATUS.CANCELLED);
    assert.ok(cancelResult.cancelledTasksCount >= 1);

    // Verify all pending tasks were changed to CANCELLED
    for (const t of cancelResult.plan.tasks) {
      if (t.status !== caseFollowupService.TASK_STATUS.COMPLETED) {
        assert.equal(t.status, caseFollowupService.TASK_STATUS.CANCELLED);
      }
    }

    // Verify reminders are inactive
    for (const r of cancelResult.plan.reminders) {
      assert.equal(r.isActive, false);
    }

    console.log('  ✓ Plan cancellation verified: Pending tasks cancelled and scheduled reminders stopped.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL CASE FOLLOW-UP & REMOTE MONITORING TESTS PASSED (100%)!');
  console.log('==================================================================\n');
})();
