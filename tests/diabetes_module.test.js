/**
 * Health Vibe AI - Diabetes Clinical Module Foundation Test Suite
 *
 * Verifies:
 * 1. Dedicated Diabetes module foundation using existing application architecture.
 * 2. Strict 4-state field classification:
 *    - known value
 *    - unknown
 *    - not provided
 *    - not applicable
 * 3. Zero invented medical values, diagnoses, treatment plans, or patient history.
 * 4. Real persisted data operations (measurements, reviews, notes, follow-up, reports).
 * 5. Role-Based Permissions & Privacy Isolation:
 *    - Patients only see their own diabetes information.
 *    - Doctors only see diabetes information for patients they are authorized and assigned to review.
 *    - Admins follow existing administrative model with audit logging.
 * 6. Doctor assignment and clinical notes attribution.
 * 7. Assessment workflow and approved reports integration.
 * 8. 100% Arabic and English i18n translation parity across all keys.
 * 9. Non-diagnostic boundaries (no medical decision-making or autonomous dosing).
 * 10. Existing disease navigation and workspace screen preservation.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('==================================================================');
console.log('🩸 HEALTH VIBE AI: DIABETES CLINICAL MODULE TEST SUITE');
console.log('   4-State Clinical Integrity, RBAC, Real Persisted Data & i18n Parity');
console.log('==================================================================\n');

const rootDir = path.resolve(__dirname, '..');
const backendDiabetes = require(path.join(rootDir, 'backend/diabetes-service.js'));
const clientDiabetes = require(path.join(rootDir, 'app/modules/diabetes/diabetes-service.js'));
const clientDiabetesUi = require(path.join(rootDir, 'app/modules/diabetes/diabetes-ui.js'));
const { translations } = require(path.join(rootDir, 'app/i18n.js'));
const indexHtml = fs.readFileSync(path.join(rootDir, 'app/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'app/app.js'), 'utf8');

// Reset store before testing
backendDiabetes.resetDiabetesStoreForTesting();

// ---------------------------------------------------------------------------
console.log('▶ TEST 1: Strict 4-State Field Classification Engine');
// ---------------------------------------------------------------------------
{
  const { classifyClinicalField, CLINICAL_FIELD_STATE } = backendDiabetes;

  // 1. Known value
  const knownFasting = classifyClinicalField(105, { unit: 'mg/dL' });
  assert.equal(knownFasting.state, CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(knownFasting.value, 105);
  assert.equal(knownFasting.unit, 'mg/dL');
  assert.equal(knownFasting.isRecorded, true);

  // 2. Unknown (investigated but clinically undetermined)
  const unknownType = classifyClinicalField('unknown');
  assert.equal(unknownType.state, CLINICAL_FIELD_STATE.UNKNOWN);
  assert.equal(unknownType.value, null);
  assert.equal(unknownType.isRecorded, false);

  const unknownExplicit = classifyClinicalField(null, { isUnknown: true });
  assert.equal(unknownExplicit.state, CLINICAL_FIELD_STATE.UNKNOWN);

  // 3. Not provided (unsupplied by user or clinician)
  const notProvidedDate = classifyClinicalField(null);
  assert.equal(notProvidedDate.state, CLINICAL_FIELD_STATE.NOT_PROVIDED);
  assert.equal(notProvidedDate.value, null);
  assert.equal(notProvidedDate.isRecorded, false);

  const emptyStringField = classifyClinicalField('');
  assert.equal(emptyStringField.state, CLINICAL_FIELD_STATE.NOT_PROVIDED);

  // 4. Not applicable (does not apply to clinical context)
  const notApplicableInsulin = classifyClinicalField(null, { isApplicable: false });
  assert.equal(notApplicableInsulin.state, CLINICAL_FIELD_STATE.NOT_APPLICABLE);
  assert.equal(notApplicableInsulin.value, null);
  assert.equal(notApplicableInsulin.isRecorded, false);

  // Client service parity check
  const clientKnown = clientDiabetes.classifyClinicalField(6.8, { unit: '%' });
  assert.equal(clientKnown.state, clientDiabetes.CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(clientKnown.value, 6.8);

  console.log('  ✓ Verified 4 distinct states: known, unknown, not_provided, not_applicable without synthetic assumptions.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 2: Patient-Specific Diabetes Information & Absence of Fake Data');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';

  // Initially unpopulated profile: all clinical fields must cleanly report unrecorded states, NOT fake numbers
  const initialProfile = backendDiabetes.resolvePatientDiabetesInfo(patientId);
  assert.equal(initialProfile.patientId.value, patientId);
  assert.equal(initialProfile.diabetesType.state, backendDiabetes.CLINICAL_FIELD_STATE.NOT_PROVIDED);
  assert.equal(initialProfile.fastingTarget.state, backendDiabetes.CLINICAL_FIELD_STATE.NOT_PROVIDED);
  assert.equal(initialProfile.hba1cTarget.state, backendDiabetes.CLINICAL_FIELD_STATE.NOT_PROVIDED);
  assert.equal(initialProfile.activeInsulinRegimen.state, backendDiabetes.CLINICAL_FIELD_STATE.NOT_PROVIDED);

  // Save genuine real persisted data
  backendDiabetes.savePatientDiabetesInfo(patientId, {
    patientName: 'ليلى أحمد محمود',
    diabetesType: backendDiabetes.DIABETES_TYPES.TYPE_2,
    diagnosisDate: '2024-03-15',
    fastingTarget: 110,
    postprandialTarget: 140,
    hba1cTarget: 6.5,
    activeInsulinRegimen: 'none_metformin_only',
    assignedDoctorId: 'doc_endo_hassan_12',
    assignedDoctorName: 'د. حسن عبد الرحيم',
    comorbidities: 'Hypertension'
  });

  const updatedProfile = backendDiabetes.resolvePatientDiabetesInfo(patientId);
  assert.equal(updatedProfile.patientName.state, backendDiabetes.CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(updatedProfile.patientName.value, 'ليلى أحمد محمود');
  assert.equal(updatedProfile.diabetesType.state, backendDiabetes.CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(updatedProfile.diabetesType.value, 'type_2');
  assert.equal(updatedProfile.fastingTarget.state, backendDiabetes.CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(updatedProfile.fastingTarget.value, 110);
  assert.equal(updatedProfile.fastingTarget.unit, 'mg/dL');
  assert.equal(updatedProfile.hba1cTarget.value, 6.5);
  assert.equal(updatedProfile.assignedDoctorId.value, 'doc_endo_hassan_12');

  console.log('  ✓ Patient-specific fields cleanly distinguish persisted data from unrecorded data without synthetic defaults.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 3: Real Persisted Measurements Ingestion & Physiological Bounds');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';

  // Valid fasting glucose reading
  const reading1 = backendDiabetes.recordDiabetesMeasurement({
    patientId,
    type: 'fasting',
    value: 118,
    unit: 'mg/dL',
    source: backendDiabetes.MEASUREMENT_SOURCES.BLUETOOTH_GLUCOMETER,
    notes: 'Morning fasting before breakfast'
  });
  assert.ok(reading1.readingId.startsWith('dm_read_'));
  assert.equal(reading1.value, 118);
  assert.equal(reading1.type, 'fasting');

  // Valid HbA1c reading
  const reading2 = backendDiabetes.recordDiabetesMeasurement({
    patientId,
    type: 'hba1c',
    value: 6.9,
    unit: '%',
    source: backendDiabetes.MEASUREMENT_SOURCES.ACCREDITED_LAB_OCR,
    notes: 'Al Borg Lab certified analysis'
  });
  assert.equal(reading2.value, 6.9);
  assert.equal(reading2.type, 'hba1c');

  // Retrieve measurements
  const allReadings = backendDiabetes.getPatientMeasurements(patientId);
  assert.equal(allReadings.length, 2);

  // Invalid glucose out-of-bounds rejected
  assert.throws(
    () => backendDiabetes.recordDiabetesMeasurement({ patientId, type: 'fasting', value: 12 }),
    /must be between 20 and 1000 mg\/dL/
  );
  assert.throws(
    () => backendDiabetes.recordDiabetesMeasurement({ patientId, type: 'hba1c', value: 30 }),
    /must be between 3% and 25%/
  );

  console.log('  ✓ Ingestion of real measurements validated with physiological invariants; invalid bounds strictly rejected.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 4: Role-Based Permissions & Doctor Assignment Isolation');
// ---------------------------------------------------------------------------
{
  const patientA = 'usr_patient_alpha';
  const patientB = 'usr_patient_beta';
  const assignedDoctor = { uid: 'doc_assigned_101', role: 'doctor', email: 'doc.assigned@healthvibe.ai' };
  const unassignedDoctor = { uid: 'doc_intruder_999', role: 'doctor', email: 'doc.intruder@healthvibe.ai' };
  const clinicAdmin = { uid: 'adm_clinic_1', role: 'clinic_admin', clinicId: 'clinic_cairo' };
  const superAdmin = { uid: 'adm_super_0', role: 'super_admin' };

  // Set patient record with assigned doctor
  backendDiabetes.savePatientDiabetesInfo(patientA, {
    patientName: 'مريض تجريبي أ',
    assignedDoctorId: assignedDoctor.uid,
    clinicId: 'clinic_cairo'
  });

  const patientRecordA = backendDiabetes.resolvePatientDiabetesInfo(patientA);

  // 1. Patient Alpha accessing own data -> ALLOWED
  const accessPatientSelf = backendDiabetes.verifyAccessPermission({ uid: patientA, role: 'patient' }, patientA, patientRecordA);
  assert.equal(accessPatientSelf.authorized, true);

  // 2. Patient Alpha accessing Patient Beta's data -> STRICTLY BLOCKED
  const accessPatientCross = backendDiabetes.verifyAccessPermission({ uid: patientA, role: 'patient' }, patientB, {});
  assert.equal(accessPatientCross.authorized, false);
  assert.equal(accessPatientCross.reason, 'PATIENT_CAN_ONLY_ACCESS_OWN_DATA');

  // 3. Assigned Doctor accessing Patient Alpha -> ALLOWED
  const accessAssignedDoc = backendDiabetes.verifyAccessPermission(assignedDoctor, patientA, { assignedDoctorId: assignedDoctor.uid });
  assert.equal(accessAssignedDoc.authorized, true);

  // 4. Unassigned Doctor accessing Patient Alpha -> STRICTLY BLOCKED
  const accessUnassignedDoc = backendDiabetes.verifyAccessPermission(unassignedDoctor, patientA, { assignedDoctorId: assignedDoctor.uid });
  assert.equal(accessUnassignedDoc.authorized, false);
  assert.equal(accessUnassignedDoc.reason, 'DOCTOR_NOT_ASSIGNED_TO_PATIENT');

  // 5. Clinic Admin & Super Admin -> ALLOWED
  const accessAdmin = backendDiabetes.verifyAccessPermission(clinicAdmin, patientA, { clinicId: 'clinic_cairo' });
  assert.equal(accessAdmin.authorized, true);
  const accessSuper = backendDiabetes.verifyAccessPermission(superAdmin, patientA, {});
  assert.equal(accessSuper.authorized, true);

  // Client Service permission mirror verification
  const clientCheckSelf = clientDiabetes.canAccessPatientDiabetes({ uid: patientA }, 'patient', patientA, null);
  assert.equal(clientCheckSelf.allowed, true);
  const clientCheckIntruder = clientDiabetes.canAccessPatientDiabetes(unassignedDoctor, 'doctor', patientA, { assignedDoctorId: assignedDoctor.uid });
  assert.equal(clientCheckIntruder.allowed, false);

  console.log('  ✓ Patient privacy isolation enforced: patients see ONLY their own data; doctors see ONLY assigned patients.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 5: Doctor Clinical Notes & Formal Case Review Attribution');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';
  const doctor = {
    uid: 'doc_endo_hassan_12',
    name: 'د. حسن عبد الرحيم',
    licenseNumber: 'HV-LIC-ENDO-9921',
    specialty: 'Endocrinology & Diabetology'
  };

  // Add clinical note
  const note = backendDiabetes.addClinicalNote({
    patientId,
    doctorUid: doctor.uid,
    doctorName: doctor.name,
    doctorLicense: doctor.licenseNumber,
    noteText: 'Patient glycemic control is improving. Fasting glucose stable around 110-118 mg/dL.',
    category: 'longitudinal_monitoring'
  });
  assert.ok(note.noteId.startsWith('dm_note_'));
  assert.equal(note.author.uid, doctor.uid);
  assert.equal(note.author.name, doctor.name);

  // Record formal review
  const review = backendDiabetes.recordDoctorReview({
    patientId,
    doctorUid: doctor.uid,
    doctorName: doctor.name,
    doctorLicense: doctor.licenseNumber,
    doctorSpecialty: doctor.specialty,
    status: 'reviewed',
    observations: 'Good response to initial lifestyle interventions and metformin.',
    recommendations: ['Maintain daily morning fasting log', 'Repeat HbA1c in 90 days']
  });
  assert.ok(review.reviewId.startsWith('dm_rev_'));
  assert.equal(review.status, 'reviewed');
  assert.equal(review.recommendations.length, 2);

  // Retrieve notes and reviews
  const notes = backendDiabetes.getPatientClinicalNotes(patientId);
  assert.equal(notes.length, 1);
  const reviews = backendDiabetes.getPatientDoctorReviews(patientId);
  assert.equal(reviews.length, 1);

  console.log('  ✓ Doctor clinical notes and formal reviews recorded with verifiable physician identity attribution.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 6: Follow-up Protocol & Approved Reports Integration');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';

  // Set follow-up plan
  const plan = backendDiabetes.recordFollowupPlan({
    patientId,
    doctorUid: 'doc_endo_hassan_12',
    doctorName: 'د. حسن عبد الرحيم',
    scheduledDate: '2026-11-15',
    intervalDays: 90,
    protocolType: 'quarterly_glycemic_review',
    instructions: 'Perform 14-day continuous glucose monitoring log prior to consultation.'
  });
  assert.equal(plan.scheduledDate, '2026-11-15');
  assert.equal(plan.intervalDays, 90);

  const retrievedPlan = backendDiabetes.getPatientFollowupPlan(patientId);
  assert.equal(retrievedPlan.scheduledDateField.state, backendDiabetes.CLINICAL_FIELD_STATE.KNOWN);
  assert.equal(retrievedPlan.scheduledDateField.value, '2026-11-15');

  // Link approved report
  const report = backendDiabetes.linkApprovedReport({
    reportId: 'rep_dm_2026_001',
    patientId,
    reportRef: 'HV-REP-DM-8821',
    doctorIdentity: { name: 'د. حسن عبد الرحيم', licenseNumber: 'HV-LIC-ENDO-9921' },
    clinicalDiagnosis: 'Type 2 Diabetes Mellitus under glycemic control',
    approvedAt: '2026-10-09T14:00:00Z'
  });
  assert.equal(report.reportRef, 'HV-REP-DM-8821');

  const reports = backendDiabetes.getPatientApprovedReports(patientId);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reportId, 'rep_dm_2026_001');

  // Complete bundle inspection
  const bundle = backendDiabetes.getPatientDiabetesBundle(patientId);
  assert.equal(bundle.measurementsCount, 2);
  assert.equal(bundle.notesCount, 1);
  assert.equal(bundle.reviewsCount, 1);
  assert.equal(bundle.reportsCount, 1);

  console.log('  ✓ Follow-up plan and approved reports linked to patient record with verified metadata.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 7: 100% Arabic & English i18n Key Parity');
// ---------------------------------------------------------------------------
{
  assert.ok(translations.ar.diabetes, 'Arabic diabetes catalog namespace exists');
  assert.ok(translations.en.diabetes, 'English diabetes catalog namespace exists');

  const arKeys = Object.keys(translations.ar.diabetes).sort();
  const enKeys = Object.keys(translations.en.diabetes).sort();

  assert.equal(arKeys.length, enKeys.length, 'Key counts match between Arabic and English');
  assert.deepEqual(arKeys, enKeys, 'Exact key names match 100% across catalogs');

  // Verify key clinical keys are translated properly
  assert.ok(translations.ar.diabetes.moduleTitle.includes('السكري'));
  assert.ok(translations.en.diabetes.moduleTitle.includes('Diabetes'));
  assert.equal(translations.ar.diabetes.stateKnown, 'معلوم');
  assert.equal(translations.en.diabetes.stateKnown, 'Known');
  assert.equal(translations.ar.diabetes.stateUnknown, 'غير معروف');
  assert.equal(translations.en.diabetes.stateUnknown, 'Unknown');
  assert.equal(translations.ar.diabetes.stateNotProvided, 'لم يتم توفيره');
  assert.equal(translations.en.diabetes.stateNotProvided, 'Not provided');
  assert.equal(translations.ar.diabetes.stateNotApplicable, 'غير منطبق');
  assert.equal(translations.en.diabetes.stateNotApplicable, 'Not applicable');

  console.log(`  ✓ 100% mutual key parity verified across ${arKeys.length} Arabic and English translation keys.`);
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 8: HTML Script Loading & DOM Architecture');
// ---------------------------------------------------------------------------
{
  assert.ok(indexHtml.includes('id="screen-diabetes"'), 'screen-diabetes section exists in app/index.html');
  assert.ok(indexHtml.includes('modules/diabetes/diabetes-service.js'), 'diabetes-service.js included in app/index.html');
  assert.ok(indexHtml.includes('modules/diabetes/diabetes-ui.js'), 'diabetes-ui.js included in app/index.html');
  assert.ok(appJs.includes('HealthVibes.DiabetesUI.renderScreen'), 'DiabetesUI wired to showScreen in app.js');

  console.log('  ✓ HTML script loading and app.js showScreen wiring verified.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 9: Non-Diagnostic Boundaries & Governance Overview');
// ---------------------------------------------------------------------------
{
  const overview = backendDiabetes.getDiabetesModuleOverview();
  assert.equal(overview.moduleId, 'diabetes');
  assert.equal(overview.governanceStatus, 'UNDER_SPECIALIST_REVIEW');
  assert.equal(overview.readinessFlag, false);
  assert.ok(overview.clinicalDisclaimer.includes('Autonomous diagnosis or medication titration is strictly prohibited'));

  console.log('  ✓ Non-diagnostic boundaries verified; medical decision-making strictly prohibited.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 10: Structured Diabetes Assessment Data Model & Validation');
// ---------------------------------------------------------------------------
{
  const { validateDiabetesAssessmentInput, normalizeArabicIndicDigits } = backendDiabetes;

  // 1. Normalization of Arabic-Indic digits
  assert.equal(normalizeArabicIndicDigits('١٢٠'), '120');
  assert.equal(normalizeArabicIndicDigits('٥.٥'), '5.5');

  // 2. Non-forced fields: minimally populated assessment passes without error
  const minimalInput = {
    patientId: 'usr_patient_layla_99'
  };
  const minimalVal = validateDiabetesAssessmentInput(minimalInput);
  assert.equal(minimalVal.isValid, true);
  assert.equal(minimalVal.errors.length, 0);

  // 3. Physiological boundary checks for glucose (mg/dL and mmol/L) and HbA1c
  const invalidGlucose = {
    patientId: 'usr_patient_layla_99',
    measurements: {
      fasting: {
        value: 1200, // exceeds max 1000 mg/dL
        unit: 'mg/dL'
      }
    }
  };
  const invalidVal = validateDiabetesAssessmentInput(invalidGlucose);
  assert.equal(invalidVal.isValid, false);
  assert.ok(invalidVal.errors.some(e => e.message.includes('20-1000') || e.message.includes('out of bounds')));

  // 4. Future timestamps are rejected
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const futureInput = {
    patientId: 'usr_patient_layla_99',
    measurements: {
      random: {
        value: 140,
        unit: 'mg/dL',
        measuredAt: futureDate
      }
    }
  };
  const futureVal = validateDiabetesAssessmentInput(futureInput);
  assert.equal(futureVal.isValid, false);
  assert.ok(futureVal.errors.some(e => e.message.includes('future')));

  // 5. Patient cannot write doctor notes (anti-tampering)
  const patientTampering = {
    patientId: 'usr_patient_layla_99',
    doctorNotes: {
      text: 'Patient attempt to forge doctor notes'
    }
  };
  const tamperVal = validateDiabetesAssessmentInput(patientTampering, { isPatient: true });
  assert.equal(tamperVal.isValid, false);
  assert.ok(tamperVal.errors.some(e => e.field === 'doctorNotes'));

  // 6. Unit preservation: mmol/L and mmol/mol are preserved without conversion
  const validMmol = {
    patientId: 'usr_patient_layla_99',
    measurements: {
      fasting: {
        value: '٦.٢', // Arabic-indic string
        unit: 'mmol/L',
        measuredAt: '2026-10-09T08:00:00Z',
        source: 'cgm_sensor'
      },
      hba1c: {
        value: 48,
        unit: 'mmol/mol',
        measuredAt: '2026-10-08T10:00:00Z',
        source: 'accredited_lab_ocr'
      }
    }
  };
  const validMmolVal = validateDiabetesAssessmentInput(validMmol);
  assert.equal(validMmolVal.isValid, true);
  assert.equal(validMmolVal.sanitized.measurements.fasting.value, 6.2);
  assert.equal(validMmolVal.sanitized.measurements.fasting.unit, 'mmol/L');
  assert.equal(validMmolVal.sanitized.measurements.hba1c.value, 48);
  assert.equal(validMmolVal.sanitized.measurements.hba1c.unit, 'mmol/mol');

  console.log('  ✓ Structured assessment validation verified: optional fields, boundaries, unit preservation, anti-tampering.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 11: Structured Assessment Creation & Versioned Clinical Revision');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';
  const doctorActor = {
    uid: 'dr_hassan_endo_99',
    name: 'د. حسن عبد الرحيم',
    role: 'doctor'
  };

  // 1. Initial Assessment Creation (Revision 1)
  const initialData = {
    patientId,
    diabetesHistory: {
      status: 'known_diabetes',
      diabetesType: 'type_2',
      diagnosisYear: 2021,
      notes: 'Diagnosed at age 42 during annual checkup'
    },
    symptoms: {
      reported: ['polydipsia', 'fatigue'],
      notes: 'Mild thirst after high-carb dinners'
    },
    measurements: {
      fasting: {
        value: 128,
        unit: 'mg/dL',
        measuredAt: '2026-10-08T07:30:00Z',
        source: 'manual_patient_log'
      },
      hba1c: {
        value: 7.1,
        unit: '%',
        measuredAt: '2026-10-05T09:00:00Z',
        source: 'accredited_lab_ocr'
      }
    },
    medications: {
      details: 'Metformin 500mg BID with meals'
    },
    complications: {
      conditions: ['none_documented']
    },
    familyHistory: {
      hasFirstDegreeRelative: true,
      relativesDetails: 'Mother diagnosed with T2D at 50'
    },
    lifestyle: {
      physicalActivity: 'Moderate walking 3 times/week',
      dietaryPattern: 'Low glycemic index trial'
    },
    doctorNotes: {
      text: 'Patient shows consistent adherence to oral hypoglycemic therapy.'
    },
    followup: {
      scheduledDate: '2026-11-15',
      intervalDays: 30,
      instructions: 'Repeat fasting blood glucose and clinic review.'
    }
  };

  const createdAssessment = backendDiabetes.createDiabetesAssessment(initialData, doctorActor);
  assert.ok(createdAssessment.assessmentId, 'Assessment ID generated');
  assert.equal(createdAssessment.clinicalRevision, 1, 'Initial clinicalRevision is 1');
  assert.equal(createdAssessment.patientId, patientId);
  assert.equal(createdAssessment.diabetesHistory.diabetesType, 'type_2');
  assert.equal(createdAssessment.measurements.fasting.value, 128);
  assert.equal(createdAssessment.measurements.fasting.unit, 'mg/dL');

  // Verify observations ledger initialized with 2 measurements
  const initialObs = backendDiabetes.getAssessmentObservations(createdAssessment.assessmentId);
  assert.equal(initialObs.length, 2, 'Initial observations count is 2');
  assert.equal(initialObs[0].clinicalRevision, 1);
  assert.equal(initialObs[1].clinicalRevision, 1);

  // Verify revisions history contains Revision 1 record
  const revisionsList = backendDiabetes.getAssessmentRevisions(createdAssessment.assessmentId);
  assert.equal(revisionsList.length, 1);
  assert.equal(revisionsList[0].revision, 1);

  // 2. Clinical Revision (Revision 2): updates measurements and clinical history WITHOUT overwriting past records
  const updateData = {
    diabetesHistory: {
      notes: 'Updated note: patient started new exercise program'
    },
    measurements: {
      postprandial: {
        value: 154,
        unit: 'mg/dL',
        measuredAt: '2026-10-09T14:30:00Z',
        source: 'cgm_sensor'
      }
    },
    doctorNotes: {
      text: 'Postprandial glycemic excursions are within acceptable targets.'
    }
  };

  const updatedAssessment = backendDiabetes.updateDiabetesAssessment(createdAssessment.assessmentId, updateData, doctorActor);
  assert.equal(updatedAssessment.clinicalRevision, 2, 'Clinical revision incremented to 2');
  assert.equal(updatedAssessment.diabetesHistory.diabetesType, 'type_2', 'Past history preserved');

  // CRITICAL REQUIREMENT: Past observations ledger is PRESERVED, NOT overwritten
  const revisedObs = backendDiabetes.getAssessmentObservations(createdAssessment.assessmentId);
  assert.equal(revisedObs.length, 3, 'Historical observations ledger grew to 3 records (past measurements preserved!)');
  
  // Verify previous observations still exist intact
  const fastingObs = revisedObs.find(o => o.type === 'fasting');
  assert.ok(fastingObs, 'Fasting observation from revision 1 is still intact');
  assert.equal(fastingObs.value, 128);
  assert.equal(fastingObs.clinicalRevision, 1);

  const ppgObs = revisedObs.find(o => o.type === 'postprandial');
  assert.ok(ppgObs, 'Postprandial observation from revision 2 is appended');
  assert.equal(ppgObs.value, 154);
  assert.equal(ppgObs.clinicalRevision, 2);

  // Verify revisions ledger has 2 entries
  const revisedHistory = backendDiabetes.getAssessmentRevisions(createdAssessment.assessmentId);
  assert.equal(revisedHistory.length, 2, 'Two revision records present in change ledger');
  assert.equal(revisedHistory[1].revision, 2);

  // Bundle integration
  const patientBundle = backendDiabetes.getPatientDiabetesBundle(patientId);
  assert.ok(patientBundle.assessments.length >= 1, 'Assessments included in patient bundle');
  assert.equal(patientBundle.assessmentsCount, patientBundle.assessments.length);

  console.log('  ✓ Structured assessment created and revised with clinicalRevision increment and zero overwrites of historical measurements.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 12: Client Diabetes Service & Assessment UI Integration');
// ---------------------------------------------------------------------------
{
  assert.ok(typeof clientDiabetes.validateAssessmentInput === 'function', 'client validateAssessmentInput exported');
  assert.ok(typeof clientDiabetes.createAssessment === 'function', 'client createAssessment exported');
  assert.ok(typeof clientDiabetes.updateAssessment === 'function', 'client updateAssessment exported');
  assert.ok(typeof clientDiabetes.getPatientAssessments === 'function', 'client getPatientAssessments exported');
  assert.ok(typeof clientDiabetes.getAssessment === 'function', 'client getAssessment exported');

  // Client validation check
  const clientValidation = clientDiabetes.validateAssessmentInput({
    patientId: 'usr_layla',
    measurements: {
      fasting: {
        value: 110,
        unit: 'mg/dL'
      }
    }
  });
  assert.equal(clientValidation.isValid, true);

  // Client validation rejection for out-of-range value
  const clientInvalid = clientDiabetes.validateAssessmentInput({
    patientId: 'usr_layla',
    measurements: {
      fasting: {
        value: 15, // below 20 mg/dL limit
        unit: 'mg/dL'
      }
    }
  });
  assert.equal(clientInvalid.isValid, false);
  assert.ok(clientInvalid.errors.length > 0);

  // Verify UI exports
  assert.ok(typeof clientDiabetesUi.openAssessmentModal === 'function', 'openAssessmentModal exported on DiabetesUI');
  assert.ok(typeof clientDiabetesUi.handleSaveAssessment === 'function', 'handleSaveAssessment exported on DiabetesUI');

  console.log('  ✓ Client DiabetesService assessment methods and DiabetesUI handlers confirmed.');
}

// ---------------------------------------------------------------------------
console.log('\n▶ TEST 13: Absolute Prohibition on Autonomous Diagnosis / Treatment Plans');
// ---------------------------------------------------------------------------
{
  const patientId = 'usr_patient_layla_99';
  const assessments = backendDiabetes.getPatientDiabetesAssessments(patientId);
  assert.ok(assessments.length > 0);

  for (const asm of assessments) {
    // Assert NO diagnosis field was autonomously invented
    assert.equal(asm.autonomousDiagnosis, undefined);
    assert.equal(asm.automatedDiagnosticDecision, undefined);
    assert.equal(asm.treatmentRecommendation, undefined);
    assert.equal(asm.insulinDosingAlgorithm, undefined);
  }

  console.log('  ✓ Non-diagnostic constraint verified: zero autonomous diagnoses or treatment recommendations generated.');
}

console.log('\n==================================================================');
console.log('🎉 ALL 13 DIABETES CLINICAL MODULE TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================\n');

