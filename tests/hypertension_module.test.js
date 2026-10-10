/**
 * Health Vibe AI - Hypertension Clinical Module Test Suite
 *
 * Verifies:
 * 1. 4-State Field Classification & Data Integrity (known, unknown, not_provided, not_applicable).
 * 2. Real persisted measurements ingestion & physiological bounds (systolic > diastolic, valid ranges).
 * 3. Immutable historical clinical assessments & versioned revision management (clinicalRevision: 1, 2, ...).
 * 4. Doctor review, clinical notes, follow-up protocols, and certified reports.
 * 5. Role-based access permission & patient privacy isolation (stripping internal doctor notes for patient requests).
 * 6. 100% Arabic & English i18n key parity for hypertension namespace.
 * 7. Non-diagnostic boundaries & prohibition on autonomous AI diagnoses/risk scores.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const hypertensionService = require('../backend/hypertension-service');
const { translations } = require('../app/i18n.js');

console.log('==================================================================');
console.log('🫀 HEALTH VIBE AI: HYPERTENSION CLINICAL MODULE TEST SUITE');
console.log('   4-State Integrity, Immutability, Revisions, Privacy & i18n');
console.log('==================================================================\n');

(async () => {
  hypertensionService.resetHypertensionStoreForTesting();

  // Test Fixtures
  const patientActor = {
    uid: 'patient_samir_101',
    role: 'patient',
    displayName: 'Samir Al-Masri'
  };

  const doctorActor = {
    uid: 'doc_cardio_hassan',
    role: 'doctor',
    displayName: 'Dr. Hassan El-Khatib',
    licenseNumber: 'HV-CARDIO-LIC-9901',
    assignedPatientIds: ['patient_samir_101']
  };

  const unauthorizedDoctor = {
    uid: 'doc_unassigned_777',
    role: 'doctor',
    displayName: 'Dr. Unassigned',
    assignedPatientIds: []
  };

  const patientId = 'patient_samir_101';

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Strict 4-State Field Classification Engine');
  // ---------------------------------------------------------------------------
  {
    const known = hypertensionService.classifyClinicalField(135, { unit: 'mmHg', fieldKey: 'baselineSystolic' });
    assert.equal(known.state, 'known');
    assert.equal(known.value, 135);
    assert.equal(known.unit, 'mmHg');
    assert.equal(known.isRecorded, true);

    const unknown = hypertensionService.classifyClinicalField(null, { isUnknown: true, fieldKey: 'hypertensionStatus' });
    assert.equal(unknown.state, 'unknown');
    assert.equal(unknown.isRecorded, false);

    const notProvided = hypertensionService.classifyClinicalField(null, { fieldKey: 'comorbidities' });
    assert.equal(notProvided.state, 'not_provided');
    assert.equal(notProvided.isRecorded, false);

    const notApplicable = hypertensionService.classifyClinicalField(null, { isApplicable: false, fieldKey: 'pregnancyStage' });
    assert.equal(notApplicable.state, 'not_applicable');
    assert.equal(notApplicable.isRecorded, false);

    console.log('  ✓ 4-State clinical field classification verified (known, unknown, not_provided, not_applicable).');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Real Persisted Blood Pressure Readings & Physiological Safeguards');
  // ---------------------------------------------------------------------------
  {
    const reading = hypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 138,
      diastolic: 88,
      pulse: 76,
      position: 'sitting',
      arm: 'left',
      context: 'resting',
      source: 'bluetooth_device',
      notes: 'Morning resting reading'
    });

    assert.ok(reading.readingId.startsWith('htn_rd_'));
    assert.equal(reading.systolic, 138);
    assert.equal(reading.diastolic, 88);
    assert.equal(reading.map, 104.7);
    assert.equal(reading.pulsePressure, 50);

    // Verify physiological invariants
    assert.throws(
      () => hypertensionService.recordBloodPressureReading({ patientId, systolic: 80, diastolic: 120 }),
      /Systolic BP \(80\) must be greater than Diastolic BP \(120\)/
    );

    assert.throws(
      () => hypertensionService.recordBloodPressureReading({ patientId, systolic: 350, diastolic: 80 }),
      /Invalid systolic blood pressure/
    );

    const patientReadings = hypertensionService.getPatientReadings(patientId);
    assert.equal(patientReadings.length, 1);
    assert.equal(patientReadings[0].readingId, reading.readingId);

    console.log('  ✓ Real BP readings persisted and physiological range limits enforced.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Structured Assessment Creation & Immutable Revision Engine');
  // ---------------------------------------------------------------------------
  {
    const assessment = hypertensionService.createHypertensionAssessment({
      patientId,
      patientName: 'Samir Al-Masri',
      hypertensionHistory: {
        status: 'documented',
        stage: 'STAGE_1_HYPERTENSION',
        diagnosisDate: '2024-05-10'
      },
      measurements: {
        systolic: { value: 136, unit: 'mmHg', context: 'resting' },
        diastolic: { value: 86, unit: 'mmHg', context: 'resting' }
      },
      medications: {
        status: 'provided',
        currentText: 'Amlodipine 5mg once daily'
      },
      lifestyle: {
        status: 'provided',
        sodiumIntake: 'moderate',
        smokingStatus: 'non_smoker'
      }
    }, patientActor);

    assert.ok(assessment.assessmentId.startsWith('htn_asm_'));
    assert.equal(assessment.clinicalRevision, 1);
    assert.equal(assessment.currentRevisionId, `rev_${assessment.assessmentId}_1`);

    // Verify Revision 1 stored in immutable history
    const revs1 = hypertensionService.getAssessmentRevisions(assessment.assessmentId);
    assert.equal(revs1.length, 1);
    assert.equal(revs1[0].revision, 1);

    // Verify Observations ledger stored immutably
    const obsList1 = hypertensionService.getAssessmentObservationsHistory(assessment.assessmentId);
    assert.ok(obsList1.length >= 2);

    // Revise Assessment -> Revision 2
    const revised = hypertensionService.reviseHypertensionAssessment(assessment.assessmentId, {
      patientId,
      medications: {
        status: 'provided',
        currentText: 'Amlodipine 10mg once daily + Valsartan 80mg'
      },
      measurements: {
        systolic: { value: 128, unit: 'mmHg', context: 'resting' },
        diastolic: { value: 82, unit: 'mmHg', context: 'resting' }
      }
    }, doctorActor, 'medication_titration_update');

    assert.equal(revised.clinicalRevision, 2);
    assert.equal(revised.currentRevisionId, `rev_${assessment.assessmentId}_2`);

    const revs2 = hypertensionService.getAssessmentRevisions(assessment.assessmentId);
    assert.equal(revs2.length, 2);
    assert.equal(revs2[1].revision, 2);
    assert.equal(revs2[1].trigger, 'medication_titration_update');

    // Confirm initial assessment document was not erased
    const obsList2 = hypertensionService.getAssessmentObservationsHistory(assessment.assessmentId);
    assert.equal(obsList2.length, 4); // 2 initial + 2 revised observations preserved immutably

    console.log('  ✓ Structured assessment created & revised with immutable observation history and clinicalRevision increment.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Doctor Review, Clinical Notes, Follow-Up & Certified Reports');
  // ---------------------------------------------------------------------------
  {
    // Add Doctor Clinical Note
    const note = hypertensionService.addClinicalNote({
      patientId,
      doctorUid: doctorActor.uid,
      doctorName: doctorActor.displayName,
      doctorLicense: doctorActor.licenseNumber,
      category: 'treatment_plan',
      noteText: 'Patient responded well to dosage adjustment. Continue weekly BP logging.'
    });

    assert.ok(note.noteId.startsWith('htn_note_'));

    // Record Doctor Review
    const review = hypertensionService.recordDoctorReview({
      patientId,
      doctorUid: doctorActor.uid,
      doctorName: doctorActor.displayName,
      doctorLicense: doctorActor.licenseNumber,
      status: 'approved',
      observations: 'Controlled blood pressure achieved under combination therapy.',
      recommendations: ['Maintain low sodium diet (<2000mg/day)', 'Weekly morning BP check']
    });

    assert.ok(review.reviewId.startsWith('htn_rev_'));

    // Record Follow-up Plan
    const followup = hypertensionService.recordFollowupPlan({
      patientId,
      doctorUid: doctorActor.uid,
      doctorName: doctorActor.displayName,
      doctorIdentity: {
        uid: doctorActor.uid,
        name: doctorActor.displayName,
        status: 'approved',
        licenseStatus: 'active'
      },
      scheduledDate: '2026-11-15',
      intervalDays: 30,
      instructions: 'Return for clinical BP evaluation and kidney function lab test.'
    });

    assert.equal(followup.scheduledDate, '2026-11-15');

    // Certify Report
    let certifiedReport;
    try {
      certifiedReport = await hypertensionService.certifyChronicHypertensionReport(
        patientId,
        {
          uid: doctorActor.uid,
          name: doctorActor.displayName,
          licenseNumber: doctorActor.licenseNumber,
          specialty: 'Cardiology & Vascular Medicine',
          clinic: 'Health Vibe Cardiology Clinic',
          status: 'approved',
          licenseStatus: 'active'
        },
        'Essential Hypertension (ICD-10 I10) - Controlled',
        'Continue current antihypertensive therapy. Sodium restriction.',
        'LOW_RISK'
      );
    } catch (e) {
      console.error('Certify error details:', e);
      throw e;
    }

    assert.ok(certifiedReport, 'certifiedReport must be returned');
    assert.ok(certifiedReport.reportRef.startsWith('HV-HTN-') || certifiedReport.reportRef.startsWith('HV-CARDIO-'));
    assert.ok(certifiedReport.digitalSignature?.signatureHash);

    console.log('  ✓ Doctor reviews, clinical notes, follow-up, and certified reports verified.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Role-Based Access Control & Patient Privacy Isolation');
  // ---------------------------------------------------------------------------
  {
    // Patient Bundle request
    const patientBundle = hypertensionService.getPatientHypertensionBundle(patientId, patientActor);
    assert.equal(patientBundle.patientId, patientId);
    assert.equal(patientBundle.clinicalNotes.length, 0, 'Internal doctor clinicalNotes MUST be stripped for patient role');

    // Doctor Bundle request (Authorized)
    const doctorBundle = hypertensionService.getPatientHypertensionBundle(patientId, doctorActor);
    assert.equal(doctorBundle.patientId, patientId);
    assert.ok(doctorBundle.clinicalNotes.length > 0, 'Doctor role sees internal clinicalNotes');

    // Anti-tamper test: Patients cannot edit doctor notes or diagnoses directly
    assert.throws(
      () => hypertensionService.createHypertensionAssessment({
        patientId,
        doctorNotes: { text: 'Fake Doctor Note' },
        clinicalDiagnosis: 'Fake Diagnosis'
      }, patientActor),
      /Field 'doctorNotes' is protected and cannot be written by patient/
    );

    console.log('  ✓ Patient privacy isolation and anti-tampering guards enforced.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: 100% Arabic & English i18n Catalog Key Parity');
  // ---------------------------------------------------------------------------
  {
    assert.ok(translations.ar.hypertension, 'ar.hypertension catalog exists');
    assert.ok(translations.en.hypertension, 'en.hypertension catalog exists');

    const arKeys = Object.keys(translations.ar.hypertension).sort();
    const enKeys = Object.keys(translations.en.hypertension).sort();

    assert.deepEqual(arKeys, enKeys, 'ar.hypertension and en.hypertension must have identical key sets');
    assert.equal(arKeys.length, 41, 'Exactly 41 translation keys present in hypertension namespace');

    console.log(`  ✓ 100% mutual key parity verified across ${arKeys.length} Arabic and English translation keys.`);
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Safety & Non-Diagnostic Boundary Checks');
  // ---------------------------------------------------------------------------
  {
    hypertensionService.savePatientHypertensionRecord(patientId, {
      hypertensionStatus: 'documented'
    }, doctorActor);

    const bundle = hypertensionService.getPatientHypertensionBundle(patientId, patientActor);
    assert.equal(bundle.profileRecord.isDocumented, true);
    // Guarantee zero autonomous diagnoses exist on bundle
    assert.equal(bundle.profileRecord.autonomousDiagnosis, undefined);
    assert.equal(bundle.profileRecord.aiRiskScore, undefined);

    console.log('  ✓ Safety boundaries verified: zero autonomous diagnoses or AI risk scores generated.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL HYPERTENSION CLINICAL MODULE TESTS PASSED (100% SUCCESS)!');
  console.log('==================================================================\n');
})();
