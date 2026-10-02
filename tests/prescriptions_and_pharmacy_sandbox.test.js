/**
 * Health Vibe AI - Certified Prescriptions, Reminders & Pharmacy Sandbox Test Suite
 *
 * Verifies:
 * 1. Approved Doctor Gate: Only active, verified doctors can issue/amend/cancel prescriptions.
 * 2. Prescription Schema & Cryptographic Signatures (HMAC-SHA256).
 * 3. Versioning (v1, v2...) with previous versions marked superseded.
 * 4. Reminders Lifecycle:
 *    - Direct dose reminders generated strictly without alternative treatment advice.
 *    - Active reminders automatically cancelled when prescription is amended or cancelled.
 * 5. Pharmacy Integration Contract, Consent & Sandbox:
 *    - Patient explicit consent enforced before dispatch.
 *    - Status tracking: draft -> issued -> sent_to_pharmacy -> received_by_pharmacy -> dispensed.
 *    - Sandbox mode isolation.
 */

const assert = require('node:assert/strict');
const prescriptionService = require('../backend/prescription-service');

console.log('==================================================================');
console.log('💊 HEALTH VIBE AI: PRESCRIPTIONS & PHARMACY SANDBOX TEST SUITE');
console.log('   Doctor Gating, Digital Signatures, Reminders & Sandbox Status');
console.log('==================================================================\n');

(async () => {
  prescriptionService.resetPrescriptionStoreForTesting();

  // Test Fixtures
  const verifiedDoctor = {
    uid: 'doc_mona_101',
    name: 'د. منى سامي',
    licenseNumber: 'HV-MD-LIC-20491',
    specialty: 'أمراض الصدر والحساسية',
    clinic: 'مركز القاهرة التخصصي للصدر',
    clinicId: 'clinic_cairo_main',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const suspendedDoctor = {
    uid: 'doc_suspended_999',
    name: 'د. موقوف',
    licenseNumber: 'HV-REVOKED-001',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const patient = {
    uid: 'usr_patient_ahmed',
    name: 'أحمد محمود',
    role: 'patient'
  };

  const standardMedications = [
    {
      name: 'Salbutamol Inhaler',
      dosage: '100 mcg / dose',
      duration: '7 days',
      frequency: 'Every 6 hours when needed',
      instructions: 'Inhale 2 puffs as directed during acute shortness of breath.'
    },
    {
      name: 'Budesonide Turbuhaler',
      dosage: '200 mcg',
      duration: '14 days',
      frequency: 'Twice daily',
      instructions: 'Rinse mouth with water after inhalation.'
    }
  ];

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Approved Doctor Role Gating');
  // ---------------------------------------------------------------------------
  {
    // Unapproved / revoked doctor must be rejected
    await assert.rejects(
      async () => {
        await prescriptionService.issuePrescription({
          caseId: 'case_001',
          patientId: patient.uid,
          patientName: patient.name,
          doctorIdentity: suspendedDoctor,
          medications: standardMedications
        });
      },
      err => {
        assert.equal(err.code, 'DOCTOR_CREDENTIALS_REQUIRED');
        assert.equal(err.statusCode, 403);
        return true;
      },
      'Revoked/suspended doctor was incorrectly allowed to issue prescription'
    );

    // Missing doctor identity
    await assert.rejects(
      async () => {
        await prescriptionService.issuePrescription({
          caseId: 'case_001',
          patientId: patient.uid,
          patientName: patient.name,
          doctorIdentity: null,
          medications: standardMedications
        });
      },
      err => {
        assert.equal(err.code, 'DOCTOR_CREDENTIALS_REQUIRED');
        return true;
      }
    );

    console.log('  ✓ Unapproved and suspended doctors strictly blocked with 403 Forbidden.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Prescription Schema & Cryptographic Signature (v1)');
  // ---------------------------------------------------------------------------
  let rxV1;
  {
    rxV1 = await prescriptionService.issuePrescription({
      caseId: 'case_001',
      patientId: patient.uid,
      patientName: patient.name,
      doctorIdentity: verifiedDoctor,
      medications: standardMedications,
      clinicalNotes: 'Initial acute bronchitis presentation with wheezing.'
    });

    assert.ok(rxV1.id.startsWith('rx_case_001_v1_'));
    assert.equal(rxV1.version, 1);
    assert.equal(rxV1.status, 'issued');
    assert.equal(rxV1.doctorId, verifiedDoctor.uid);
    assert.equal(rxV1.doctorLicense, verifiedDoctor.licenseNumber);
    assert.equal(rxV1.medications.length, 2);
    assert.equal(rxV1.medications[0].name, 'Salbutamol Inhaler');
    assert.equal(rxV1.medications[0].dosage, '100 mcg / dose');
    assert.equal(rxV1.medications[0].duration, '7 days');

    // Digital signature verification
    assert.equal(rxV1.digitalSignature.algorithm, 'HMAC-SHA256');
    assert.ok(rxV1.digitalSignature.signatureHash.length === 64);
    assert.equal(rxV1.digitalSignature.doctorLicense, verifiedDoctor.licenseNumber);

    const isValidSig = prescriptionService.verifyPrescriptionSignature(rxV1);
    assert.equal(isValidSig, true, 'Digital signature should be valid');

    // Tampered payload test
    const tampered = JSON.parse(JSON.stringify(rxV1));
    tampered.medications[0].dosage = '9999 mg lethal overdose';
    const isTamperedValid = prescriptionService.verifyPrescriptionSignature(tampered);
    assert.equal(isTamperedValid, false, 'Tampered medication payload must fail signature check');

    console.log('  ✓ Prescription v1 created with verified doctor license and HMAC-SHA256 signature.');
    console.log('  ✓ Tampering detection verified: altered medication payloads immediately fail.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Prescription-Based Reminders (Zero Alternative Suggestions)');
  // ---------------------------------------------------------------------------
  {
    const activeReminders = prescriptionService.getPatientActiveReminders(patient.uid);
    assert.equal(activeReminders.length, 2, 'Should create 2 active dose reminders');

    for (const rem of activeReminders) {
      assert.equal(rem.status, 'active');
      assert.equal(rem.prescriptionId, rxV1.id);
      assert.ok(rem.scheduledTimes.length > 0);
      assert.ok(rem.message.includes(rem.medicationName));

      // Assert no alternative treatment is suggested
      assert.doesNotThrow(() => {
        prescriptionService.assertNoAlternativeTreatmentSuggestions(rem.message);
      });
    }

    // Direct test of alternative treatment safety assertion
    assert.throws(
      () => {
        prescriptionService.assertNoAlternativeTreatmentSuggestions('You can try an alternative herbal remedy or generic switch instead.');
      },
      /CLINICAL SAFETY VIOLATION/,
      'Prohibited alternative treatment text must be blocked'
    );

    assert.throws(
      () => {
        prescriptionService.assertNoAlternativeTreatmentSuggestions('استخدم علاج بديل أو أعشاب عوضاً عن الدواء.');
      },
      /CLINICAL SAFETY VIOLATION/,
      'Arabic alternative treatment text must be blocked'
    );

    console.log('  ✓ Prescription-based reminders scheduled with prescribed doses.');
    console.log('  ✓ Clinical safety guard confirmed: Alternative treatment suggestions strictly prohibited.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Prescription Amendment & Automatic Reminder Cancellation (v2)');
  // ---------------------------------------------------------------------------
  let rxV2;
  {
    const amendedMedications = [
      {
        name: 'Budesonide Turbuhaler',
        dosage: '400 mcg (Increased dose)',
        duration: '10 days',
        frequency: 'Twice daily',
        instructions: 'Increased strength as directed by specialist.'
      }
    ];

    rxV2 = await prescriptionService.amendPrescription({
      previousPrescriptionId: rxV1.id,
      doctorIdentity: verifiedDoctor,
      medications: amendedMedications,
      clinicalNotes: 'Follow-up consultation: adjusted maintenance inhaler.',
      amendmentReason: 'Patient response requires stepped-up dose.'
    });

    assert.equal(rxV2.version, 2);
    assert.equal(rxV2.previousVersionId, rxV1.id);
    assert.equal(rxV2.status, 'issued');

    // Verify previous version status was updated to SUPERSEDED
    const updatedV1 = prescriptionService.getPrescriptionById(rxV1.id);
    assert.equal(updatedV1.status, 'superseded');
    assert.equal(updatedV1.supersededBy, rxV2.id);

    // Verify reminders for v1 are CANCELLED and only reminders for v2 are ACTIVE
    const allPatientReminders = prescriptionService.getPatientActiveReminders(patient.uid);
    assert.equal(allPatientReminders.length, 1, 'Should have only 1 active reminder for v2');
    assert.equal(allPatientReminders[0].prescriptionId, rxV2.id);
    assert.equal(allPatientReminders[0].medicationName, 'Budesonide Turbuhaler');
    assert.equal(allPatientReminders[0].dosage, '400 mcg (Increased dose)');

    // Verify history audit trail
    assert.equal(rxV2.history.length, 3); // ISSUED -> SUPERSEDED -> ISSUED_AMENDMENT

    console.log('  ✓ Prescription v2 successfully amended; prior version stamped as superseded.');
    console.log('  ✓ Reminders for superseded version automatically stopped and unscheduled.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Prescription Cancellation & Immediate Reminders Purge');
  // ---------------------------------------------------------------------------
  {
    // Create temporary prescription to test cancellation
    const tempRx = await prescriptionService.issuePrescription({
      caseId: 'case_cancel_test',
      patientId: 'patient_temp',
      patientName: 'مريض تجريبي',
      doctorIdentity: verifiedDoctor,
      medications: [
        {
          name: 'Amoxicillin',
          dosage: '500 mg',
          duration: '5 days',
          frequency: 'Three times daily',
          instructions: 'Take after meals'
        }
      ]
    });

    let tempReminders = prescriptionService.getPatientActiveReminders('patient_temp');
    assert.equal(tempReminders.length, 1);

    // Cancel prescription
    const cancelRes = await prescriptionService.cancelPrescription({
      prescriptionId: tempRx.id,
      doctorIdentity: verifiedDoctor,
      cancellationReason: 'Adverse allergy reported, discontinued.'
    });

    assert.equal(cancelRes.prescription.status, 'cancelled');
    assert.equal(cancelRes.cancelledRemindersCount, 1);

    // Verify active reminders are now zero
    tempReminders = prescriptionService.getPatientActiveReminders('patient_temp');
    assert.equal(tempReminders.length, 0, 'Cancelled prescription must have zero active reminders');

    console.log('  ✓ Prescription cancellation verified: active reminders immediately purged.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Pharmacy Integration Consent & Sandbox Dispatch');
  // ---------------------------------------------------------------------------
  {
    // 1. Attempt to dispatch to pharmacy WITHOUT patient consent
    await assert.rejects(
      async () => {
        await prescriptionService.sendToPharmacy({
          prescriptionId: rxV2.id,
          user: patient
        });
      },
      err => {
        assert.equal(err.code, 'PHARMACY_CONSENT_REQUIRED');
        assert.equal(err.statusCode, 403);
        return true;
      },
      'Prescription dispatch without patient consent must be blocked'
    );

    // 2. Patient grants explicit consent
    const consent = await prescriptionService.recordPharmacyConsent({
      prescriptionId: rxV2.id,
      patientId: patient.uid,
      pharmacyId: 'cairo_central_pharmacy',
      accepted: true
    });

    assert.equal(consent.accepted, true);
    assert.equal(consent.pharmacyId, 'cairo_central_pharmacy');

    // 3. Dispatch to Pharmacy Sandbox
    const dispatchResult = await prescriptionService.sendToPharmacy({
      prescriptionId: rxV2.id,
      user: patient
    });

    assert.equal(dispatchResult.success, true);
    assert.equal(dispatchResult.mode, 'sandbox');
    assert.equal(dispatchResult.status, 'received_by_pharmacy');
    assert.ok(dispatchResult.transmissionId.startsWith('trans_'));

    // 4. Sandbox Dispensing Status Transition
    const dispenseUpdate = await prescriptionService.updatePharmacyDispenseStatus({
      transmissionId: dispatchResult.transmissionId,
      status: 'dispensed',
      dispenseReference: 'DISP-CAIRO-2026-98124',
      notes: 'Dispensed original medications in sandbox partner environment'
    });

    assert.equal(dispenseUpdate.success, true);
    assert.equal(dispenseUpdate.status, 'dispensed');

    const updatedRx = prescriptionService.getPrescriptionById(rxV2.id);
    assert.equal(updatedRx.status, 'dispensed');
    assert.equal(updatedRx.dispenseReference, 'DISP-CAIRO-2026-98124');
    assert.equal(updatedRx.pharmacyTracking.status, 'dispensed');

    console.log('  ✓ Patient consent enforcement verified: unconsented transmission blocked.');
    console.log('  ✓ Sandbox dispatch executed with HMAC digital signature verification.');
    console.log('  ✓ End-to-end dispensing status tracking confirmed: issued -> sent -> received -> dispensed.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL PRESCRIPTION & PHARMACY SANDBOX TESTS PASSED 100%!');
  console.log('==================================================================\n');
})();
