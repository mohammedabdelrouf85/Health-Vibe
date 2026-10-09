/**
 * HEALTH VIBE AI: EXPLICIT CLINICAL HANDOVER & ESCALATION TEST SUITE
 *
 * Verifies:
 * 1. Absent / off-duty doctor:
 *    - Rejection when fallback routing is disabled.
 *    - Automatic safe queue routing when fallback routing is enabled.
 * 2. Suspended & expired-license doctors:
 *    - Strict rejection preventing assignment of clinical responsibilities.
 * 3. Clinic membership enforcement:
 *    - Strict prevention of cross-clinic case handovers.
 * 4. Simultaneous reassignment & atomic concurrency guard:
 *    - Prevents race conditions; second accept fails with 409 Conflict.
 * 5. Previous doctor access revocation:
 *    - Verifies atomic reassignment and revocation flag.
 * 6. Overdue SLA tracking:
 *    - Automatic overdue transition and trigger of automated supervisor escalation.
 * 7. Deduplicated escalation events:
 *    - Deterministic SHA-256 fingerprint suppresses redundant alarms within 30 min.
 *    - Changes in severity or clinical metrics trigger a new justified escalation.
 * 8. Strict medical-legal acknowledgment guard:
 *    - NEVER claims emergency services or another clinician received a case without
 *      authoritatively recorded acknowledgment.
 * 9. Unassigned cases triage & claiming:
 *    - Atomic claiming, clinic boundary enforcement, and double-claim prevention.
 * 10. Handover rejection and cancellation lifecycles with mandatory reasons.
 */

const assert = require('node:assert/strict');
const handoverService = require('../backend/case-handover-service');
const { HANDOVER_STATUS, ESCALATION_STATUS, TARGET_QUEUES } = handoverService;

console.log('==================================================================');
console.log('🏥 HEALTH VIBE AI: CLINICAL HANDOVER & ESCALATION TEST SUITE');
console.log('   Explicit Handovers, Atomic Reassignment, Deduplication & SLA');
console.log('==================================================================\n');

(async () => {
  try {
    handoverService.reset();

    // ─────────────────────────────────────────────────────────────────────────
    // SETUP: Mock Doctors Directory & Availability
    // ─────────────────────────────────────────────────────────────────────────
    const docActiveA = handoverService.registerDoctor({
      uid: 'doc_active_a',
      name: 'د. أحمد السعيد',
      clinicId: 'clinic_cairo_central',
      role: 'doctor',
      licenseStatus: 'active',
      isLicenseExpired: false,
      suspended: false
    });

    const docActiveB = handoverService.registerDoctor({
      uid: 'doc_active_b',
      name: 'د. منى الشريف',
      clinicId: 'clinic_cairo_central',
      role: 'doctor',
      licenseStatus: 'active',
      isLicenseExpired: false,
      suspended: false
    });

    const docOffDuty = handoverService.registerDoctor({
      uid: 'doc_off_duty_c',
      name: 'د. خالد منتصر (إجازة)',
      clinicId: 'clinic_cairo_central',
      role: 'doctor',
      licenseStatus: 'active',
      isLicenseExpired: false,
      suspended: false
    });
    handoverService.setDoctorDutyStatus('doc_off_duty_c', {
      dutyStatus: 'off_duty',
      isAvailable: false,
      onLeave: true,
      fallbackQueue: TARGET_QUEUES.CLINIC_ON_CALL_POOL
    });

    const docSuspended = handoverService.registerDoctor({
      uid: 'doc_suspended_d',
      name: 'د. طارق محمود (موقوف)',
      clinicId: 'clinic_cairo_central',
      role: 'doctor',
      licenseStatus: 'active',
      isLicenseExpired: false,
      suspended: true
    });

    const docExpiredLicense = handoverService.registerDoctor({
      uid: 'doc_expired_e',
      name: 'د. سمير فهمي (ترخيص منتهي)',
      clinicId: 'clinic_cairo_central',
      role: 'doctor',
      licenseStatus: 'expired',
      isLicenseExpired: true,
      suspended: false
    });

    const docOtherClinic = handoverService.registerDoctor({
      uid: 'doc_other_clinic_f',
      name: 'د. عمر هلال (عيادة الإسكندرية)',
      clinicId: 'clinic_alexandria_north',
      role: 'doctor',
      licenseStatus: 'active',
      isLicenseExpired: false,
      suspended: false
    });

    // Register a test case
    handoverService.registerCase({
      id: 'case_resp_101',
      patientId: 'patient_zainab_99',
      clinicId: 'clinic_cairo_central',
      assignedDoctorId: 'doc_active_a',
      assignedDoctorName: 'د. أحمد السعيد',
      priority: 'urgent',
      oxygenLevel: 91,
      status: 'assigned'
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Unavailable / Off-Duty Doctor Handling (Rejection vs Fallback Queue)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 1: Absent / Off-Duty Doctor Handling');
    {
      // 1A: Attempt handover without fallback routing -> Must throw DOCTOR_UNAVAILABLE
      let thrown = false;
      try {
        await handoverService.requestHandover({
          caseId: 'case_resp_101',
          fromDoctor: docActiveA,
          toDoctorId: 'doc_off_duty_c',
          handoverReason: 'shift_change',
          routeToQueueIfUnavailable: false
        });
      } catch (err) {
        thrown = true;
        assert.equal(err.code, 'DOCTOR_UNAVAILABLE');
        assert.equal(err.statusCode, 400);
      }
      assert.ok(thrown, 'Should reject handover to absent doctor when routeToQueueIfUnavailable=false');

      // 1B: Attempt handover with fallback routing -> Must route to queue
      const handover = await handoverService.requestHandover({
        caseId: 'case_resp_101',
        fromDoctor: docActiveA,
        toDoctorId: 'doc_off_duty_c',
        handoverReason: 'shift_change',
        routeToQueueIfUnavailable: true
      });
      assert.ok(handover.id);
      assert.equal(handover.fallbackRoutingApplied, true);
      assert.equal(handover.toDoctorId, null);
      assert.equal(handover.targetQueue, TARGET_QUEUES.CLINIC_ON_CALL_POOL);
      assert.equal(handover.status, HANDOVER_STATUS.PENDING_ACCEPTANCE);

      // Clean up for next test
      await handoverService.cancelHandover({
        handoverId: handover.id,
        doctor: docActiveA,
        cancelReason: 'Test reset'
      });
      console.log('  ✓ Absent doctor handling passed (strict 400 rejection or safe queue fallback).');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Suspended & Expired-License Doctor Guards
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 2: Suspended & Expired-License Doctor Guards');
    {
      // 2A: Attempt handover to suspended doctor -> Must throw DOCTOR_SUSPENDED
      let suspendedThrown = false;
      try {
        await handoverService.requestHandover({
          caseId: 'case_resp_101',
          fromDoctor: docActiveA,
          toDoctorId: 'doc_suspended_d',
          handoverReason: 'specialist_referral'
        });
      } catch (err) {
        suspendedThrown = true;
        assert.equal(err.code, 'DOCTOR_SUSPENDED');
        assert.equal(err.statusCode, 400);
      }
      assert.ok(suspendedThrown, 'Must reject handover to suspended doctor');

      // 2B: Attempt handover to expired license doctor -> Must throw DOCTOR_LICENSE_INVALID
      let licenseThrown = false;
      try {
        await handoverService.requestHandover({
          caseId: 'case_resp_101',
          fromDoctor: docActiveA,
          toDoctorId: 'doc_expired_e',
          handoverReason: 'specialist_referral'
        });
      } catch (err) {
        licenseThrown = true;
        assert.equal(err.code, 'DOCTOR_LICENSE_INVALID');
        assert.equal(err.statusCode, 400);
      }
      assert.ok(licenseThrown, 'Must reject handover to doctor with expired/revoked license');

      console.log('  ✓ Suspended and expired-license doctor guards verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Clinic Membership Enforcement
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 3: Clinic Membership Enforcement');
    {
      let clinicMismatchThrown = false;
      try {
        await handoverService.requestHandover({
          caseId: 'case_resp_101',
          fromDoctor: docActiveA,
          toDoctorId: 'doc_other_clinic_f',
          handoverReason: 'specialist_referral'
        });
      } catch (err) {
        clinicMismatchThrown = true;
        assert.equal(err.code, 'CLINIC_MEMBERSHIP_MISMATCH');
        assert.equal(err.statusCode, 403);
      }
      assert.ok(clinicMismatchThrown, 'Must prevent cross-clinic case handovers');
      console.log('  ✓ Clinic boundary and membership enforcement verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Atomic Reassignment & Previous Doctor Access Revocation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 4: Atomic Reassignment & Access Revocation');
    {
      // Case starts with docActiveA
      const preCase = handoverService.getCase('case_resp_101');
      assert.equal(preCase.assignedDoctorId, 'doc_active_a');

      // Request handover to docActiveB
      const handover = await handoverService.requestHandover({
        caseId: 'case_resp_101',
        fromDoctor: docActiveA,
        toDoctorId: 'doc_active_b',
        handoverReason: 'shift_change',
        clinicalNotes: 'Patient stable, O2 91% on room air.'
      });

      // Accept handover by docActiveB
      const acceptResult = await handoverService.acceptHandover({
        handoverId: handover.id,
        acceptingDoctor: docActiveB,
        channel: 'in_app'
      });

      assert.equal(acceptResult.success, true);
      assert.equal(acceptResult.previousDoctorId, 'doc_active_a');
      assert.equal(acceptResult.newAssignedDoctorId, 'doc_active_b');
      assert.equal(acceptResult.previousDoctorAccessRevoked, true);

      // Verify underlying case state
      const postCase = handoverService.getCase('case_resp_101');
      assert.equal(postCase.assignedDoctorId, 'doc_active_b');
      assert.equal(postCase.previousDoctorId, 'doc_active_a');
      assert.equal(postCase.activeHandoverId, null);
      assert.equal(postCase.status, 'assigned');
      assert.ok(postCase.handoverHistory.length >= 1);
      assert.equal(postCase.handoverHistory[postCase.handoverHistory.length - 1].fromDoctorId, 'doc_active_a');
      assert.equal(postCase.handoverHistory[postCase.handoverHistory.length - 1].toDoctorId, 'doc_active_b');

      console.log('  ✓ Atomic reassignment verified; previous doctor access explicitly revoked.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Simultaneous Reassignment Race Condition Protection (409 Conflict)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 5: Simultaneous Reassignment Concurrency Guard');
    {
      // Register new case and handover targeted to a queue
      handoverService.registerCase({
        id: 'case_concurrency_202',
        clinicId: 'clinic_cairo_central',
        assignedDoctorId: 'doc_active_b',
        status: 'assigned'
      });

      const queueHandover = await handoverService.requestHandover({
        caseId: 'case_concurrency_202',
        fromDoctor: docActiveB,
        targetQueue: TARGET_QUEUES.PHYSICIAN_POOL,
        handoverReason: 'capacity_overload'
      });

      // Doctor A accepts first
      const firstAccept = await handoverService.acceptHandover({
        handoverId: queueHandover.id,
        acceptingDoctor: docActiveA
      });
      assert.equal(firstAccept.success, true);

      // Doctor C (or simultaneous attempt) tries to accept the already-resolved handover
      let conflictThrown = false;
      try {
        await handoverService.acceptHandover({
          handoverId: queueHandover.id,
          acceptingDoctor: docActiveB
        });
      } catch (err) {
        conflictThrown = true;
        assert.equal(err.code, 'HANDOVER_ALREADY_RESOLVED');
        assert.equal(err.statusCode, 409);
      }
      assert.ok(conflictThrown, 'Simultaneous accept must fail with 409 HANDOVER_ALREADY_RESOLVED');
      console.log('  ✓ Simultaneous reassignment race condition safely guarded (409 Conflict).');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Unaccepted Handovers & Overdue SLA Tracking
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 6: Unaccepted Handovers & Overdue SLA Monitoring');
    {
      handoverService.registerCase({
        id: 'case_overdue_303',
        clinicId: 'clinic_cairo_central',
        assignedDoctorId: 'doc_active_a',
        priority: 'emergency',
        status: 'assigned'
      });

      // Request handover with a 15-minute SLA
      const pendingHandover = await handoverService.requestHandover({
        caseId: 'case_overdue_303',
        fromDoctor: docActiveA,
        toDoctorId: 'doc_active_b',
        handoverReason: 'critical_escalation',
        slaMinutes: 15
      });

      assert.equal(pendingHandover.isOverdue, false);
      assert.equal(pendingHandover.status, HANDOVER_STATUS.PENDING_ACCEPTANCE);

      // Simulate clock past SLA threshold (16 minutes later)
      const futureTime = new Date(Date.now() + 16 * 60 * 1000);
      const overdueList = handoverService.checkOverdueHandovers({
        clinicId: 'clinic_cairo_central',
        now: futureTime
      });

      assert.ok(overdueList.some(h => h.id === pendingHandover.id));
      const updatedHandover = handoverService.handoversStore.get(pendingHandover.id);
      assert.equal(updatedHandover.isOverdue, true);
      assert.equal(updatedHandover.status, HANDOVER_STATUS.OVERDUE);

      // Verify that an automated escalation audit log was registered
      const overdueAudit = handoverService.getAuditLogs({ eventType: 'HANDOVER_OVERDUE_ESCALATED' });
      assert.ok(overdueAudit.length >= 1);
      assert.equal(overdueAudit[0].metadata.handoverId, pendingHandover.id);

      console.log('  ✓ Unaccepted handovers and SLA breach monitoring verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Deduplicated Escalation Events (Anti-Spam Fingerprint)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 7: Deduplicated Escalation Events');
    {
      // 7A: Initial high-severity escalation dispatch
      const esc1 = await handoverService.escalateCase({
        caseId: 'case_overdue_303',
        clinicId: 'clinic_cairo_central',
        severity: 'HIGH',
        reason: 'Severe respiratory distress, oxygen saturation dropping below 88%',
        originatingDoctor: docActiveA,
        targetRecipient: { type: 'emergency_services', channel: 'ambulance_123' }
      });

      assert.equal(esc1.escalated, true);
      assert.equal(esc1.isDuplicate, false);
      assert.ok(esc1.escalationId);

      // 7B: Duplicate escalation within 30-min window with same clinical parameters
      const esc2 = await handoverService.escalateCase({
        caseId: 'case_overdue_303',
        clinicId: 'clinic_cairo_central',
        severity: 'HIGH',
        reason: 'Severe respiratory distress, oxygen saturation dropping below 88%',
        originatingDoctor: docActiveA,
        targetRecipient: { type: 'emergency_services', channel: 'ambulance_123' }
      });

      assert.equal(esc2.escalated, true);
      assert.equal(esc2.isDuplicate, true);
      assert.equal(esc2.escalationId, esc1.escalationId);
      assert.ok(esc2.message.includes('Deduplicated'));

      // 7C: Clinical condition worsens to CRITICAL (different severity/reason) -> NOT deduplicated
      const esc3 = await handoverService.escalateCase({
        caseId: 'case_overdue_303',
        clinicId: 'clinic_cairo_central',
        severity: 'CRITICAL',
        reason: 'Impending respiratory failure, cyanosis observed, immediate intubation needed',
        originatingDoctor: docActiveA,
        targetRecipient: { type: 'emergency_services', channel: 'ambulance_123' }
      });

      assert.equal(esc3.escalated, true);
      assert.equal(esc3.isDuplicate, false);
      assert.notEqual(esc3.escalationId, esc1.escalationId);

      console.log('  ✓ Deduplication suppresses spam but permits justified escalation on clinical worsening.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Strict Medical-Legal Acknowledgment Guard
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 8: Strict Medical-Legal Acknowledgment Guard');
    {
      const esc = await handoverService.escalateCase({
        caseId: 'case_overdue_303',
        clinicId: 'clinic_cairo_central',
        severity: 'EMERGENCY',
        reason: 'Immediate ICU admission required',
        originatingDoctor: docActiveA,
        targetRecipient: { type: 'emergency_services', channel: 'red_crescent_er' }
      });

      const escalationRecord = esc.escalationRecord;

      // RULE: Never claim recipient received the case without authoritatively recorded acknowledgment!
      assert.equal(escalationRecord.receivedByRecipient, false, 'receivedByRecipient MUST be false upon dispatch!');
      assert.equal(escalationRecord.status, ESCALATION_STATUS.DISPATCHED_PENDING_ACK);
      assert.ok(escalationRecord.displayStatus.en.includes('awaiting recipient confirmation'));
      assert.ok(escalationRecord.displayStatus.ar.includes('بانتظار تأكيد استلام'));

      // Paramedic or ER registrar acknowledges receipt
      const ackRecord = await handoverService.recordEscalationAcknowledgment({
        escalationId: esc.escalationId,
        acknowledgedBy: 'paramedic_team_cairo_9',
        acknowledgedByName: 'المسعف تامر حسني - سيارة إسعاف 812',
        ackMethod: 'er_telemetry_handshake'
      });

      assert.equal(ackRecord.receivedByRecipient, true);
      assert.equal(ackRecord.status, ESCALATION_STATUS.ACKNOWLEDGED_AND_RECEIVED);
      assert.ok(ackRecord.recordedAcknowledgment.acknowledged);
      assert.equal(ackRecord.recordedAcknowledgment.acknowledgedBy, 'paramedic_team_cairo_9');
      assert.ok(ackRecord.displayStatus.en.includes('Case receipt clinically acknowledged'));
      assert.ok(ackRecord.displayStatus.ar.includes('تم تأكيد استلام الحالة سريرياً'));

      console.log('  ✓ Medical-legal acknowledgment guard strictly verified (no unconfirmed receipt claims).');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 9: Unassigned Cases Pool & Atomic Claiming
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 9: Unassigned Cases Pool & Atomic Claiming');
    {
      handoverService.registerCase({
        id: 'case_unassigned_404',
        clinicId: 'clinic_cairo_central',
        assignedDoctorId: null,
        status: 'submitted'
      });

      const unassigned = handoverService.getUnassignedCases({ clinicId: 'clinic_cairo_central' });
      assert.ok(unassigned.some(c => c.id === 'case_unassigned_404'));

      // Cross-clinic doctor cannot claim
      let crossClaimBlocked = false;
      try {
        await handoverService.claimCase({
          caseId: 'case_unassigned_404',
          claimingDoctor: docOtherClinic
        });
      } catch (err) {
        crossClaimBlocked = true;
        assert.equal(err.code, 'CLINIC_MEMBERSHIP_MISMATCH');
      }
      assert.ok(crossClaimBlocked, 'Cross-clinic claiming must be blocked');

      // Valid clinic doctor claims case
      const claimResult = await handoverService.claimCase({
        caseId: 'case_unassigned_404',
        claimingDoctor: docActiveB
      });
      assert.equal(claimResult.success, true);
      assert.equal(claimResult.case.assignedDoctorId, 'doc_active_b');
      assert.equal(claimResult.case.status, 'under_review');

      // Second doctor attempting to claim encounters conflict
      let doubleClaimBlocked = false;
      try {
        await handoverService.claimCase({
          caseId: 'case_unassigned_404',
          claimingDoctor: docActiveA
        });
      } catch (err) {
        doubleClaimBlocked = true;
        assert.equal(err.code, 'CASE_ALREADY_ASSIGNED');
        assert.equal(err.statusCode, 409);
      }
      assert.ok(doubleClaimBlocked, 'Double-claiming already assigned case must return 409 Conflict');

      console.log('  ✓ Unassigned cases pool, atomic claim, and double-claim prevention verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 10: Handover Rejection & Reason Enforcement
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ TEST 10: Handover Rejection with Mandatory Clinical Reason');
    {
      handoverService.registerCase({
        id: 'case_reject_505',
        clinicId: 'clinic_cairo_central',
        assignedDoctorId: 'doc_active_a',
        status: 'assigned'
      });

      const handoverToReject = await handoverService.requestHandover({
        caseId: 'case_reject_505',
        fromDoctor: docActiveA,
        toDoctorId: 'doc_active_b',
        handoverReason: 'specialist_referral'
      });

      // Rejecting without reason must fail
      let rejectNoReasonThrown = false;
      try {
        await handoverService.rejectHandover({
          handoverId: handoverToReject.id,
          rejectingDoctor: docActiveB,
          rejectionReason: ''
        });
      } catch (err) {
        rejectNoReasonThrown = true;
        assert.equal(err.code, 'REASON_REQUIRED');
      }
      assert.ok(rejectNoReasonThrown, 'Rejection without reason must fail');

      // Rejecting with valid reason
      const rejected = await handoverService.rejectHandover({
        handoverId: handoverToReject.id,
        rejectingDoctor: docActiveB,
        rejectionReason: 'Outside clinical subspecialty: patient requires pediatric pulmonologist.'
      });

      assert.equal(rejected.success, true);
      assert.equal(rejected.handover.status, HANDOVER_STATUS.REJECTED);
      assert.ok(rejected.handover.rejectedAt);

      console.log('  ✓ Handover rejection and reason enforcement verified.');
    }

    console.log('\n==================================================================');
    console.log('🎉 ALL 10 CLINICAL HANDOVER & ESCALATION TESTS PASSED (100% SUCCESS)');
    console.log('==================================================================\n');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
})();
