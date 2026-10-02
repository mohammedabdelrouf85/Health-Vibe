/**
 * Health Vibe AI - Chronic Hypertension & Blood Pressure Clinical Module Test Suite
 *
 * Verifies:
 * 1. Physiological validation & boundary checks (systolic, diastolic, pulse).
 * 2. Standardized clinical staging (Hypotension, Normal, Elevated, Stage 1, Stage 2, Crisis).
 * 3. Hemodynamic metrics: Mean Arterial Pressure (MAP) & Pulse Pressure.
 * 4. Clinical alerts: Crisis emergency safeguard, Stage 2 uncontrolled, Symptomatic hypotension.
 * 5. Chronic disease dashboard: Control rate, diurnal morning surge, stage distribution.
 * 6. Specialist follow-up plan generation and doctor role gating.
 * 7. Certified chronic reports with doctor license stamping and HMAC signatures.
 */

const assert = require('node:assert/strict');
const chronicHypertensionService = require('../backend/chronic-hypertension-service');

console.log('==================================================================');
console.log('🫀 HEALTH VIBE AI: CHRONIC HYPERTENSION MODULE TEST SUITE');
console.log('   Clinical Staging, Emergency Alerts, Dashboard & Certification');
console.log('==================================================================\n');

(async () => {
  chronicHypertensionService.resetHypertensionStoreForTesting();

  // Specialist Doctor Fixture
  const cardiologistDoctor = {
    uid: 'doc_cardio_yasser',
    name: 'د. ياسر المنشاوي',
    licenseNumber: 'HV-CARDIO-LIC-10928',
    specialty: 'أمراض القلب والأوعية الدموية وضغط الدم',
    clinic: 'مركز النيل التخصصي للقلب والباطنة',
    clinicId: 'clinic_nile_cardio',
    status: 'approved',
    licenseStatus: 'active',
    isLicenseExpired: false
  };

  const suspendedDoctor = {
    uid: 'doc_suspended_888',
    name: 'طبيب غير مرخص',
    licenseNumber: 'HV-REVOKED-888',
    status: 'revoked',
    licenseStatus: 'revoked',
    isLicenseExpired: true
  };

  const patientId = 'usr_patient_hossam_45';

  // ---------------------------------------------------------------------------
  console.log('▶ TEST 1: Physiological Validation & Input Safeguards');
  // ---------------------------------------------------------------------------
  {
    // Valid input
    const valid = chronicHypertensionService.validateBpInputs({ systolic: 125, diastolic: 82, pulse: 72 });
    assert.equal(valid.sys, 125);
    assert.equal(valid.dia, 82);
    assert.equal(valid.pul, 72);

    // Systolic <= Diastolic (Physiologically impossible)
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 80, diastolic: 120, pulse: 70 }),
      /Systolic BP \(80\) must be greater than Diastolic BP \(120\)/
    );

    // Systolic out of bounds
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 350, diastolic: 80, pulse: 70 }),
      /Invalid systolic blood pressure/
    );

    // Diastolic out of bounds
    assert.throws(
      () => chronicHypertensionService.validateBpInputs({ systolic: 120, diastolic: 25, pulse: 70 }),
      /Invalid diastolic blood pressure/
    );

    console.log('  ✓ Physiological range limits and systolic > diastolic invariants enforced.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 2: AHA/ACC Standardized Clinical Staging & MAP Calculations');
  // ---------------------------------------------------------------------------
  {
    // Normal (<120 and <80)
    const normal = chronicHypertensionService.classifyBloodPressure(115, 75);
    assert.equal(normal.stage, chronicHypertensionService.BP_STAGES.NORMAL);

    // Elevated (120-129 and <80)
    const elevated = chronicHypertensionService.classifyBloodPressure(124, 78);
    assert.equal(elevated.stage, chronicHypertensionService.BP_STAGES.ELEVATED);

    // Stage 1 (130-139 or 80-89)
    const stage1 = chronicHypertensionService.classifyBloodPressure(135, 84);
    assert.equal(stage1.stage, chronicHypertensionService.BP_STAGES.STAGE_1);

    // Stage 2 (140-179 or 90-119)
    const stage2 = chronicHypertensionService.classifyBloodPressure(150, 95);
    assert.equal(stage2.stage, chronicHypertensionService.BP_STAGES.STAGE_2);

    // Crisis (>= 180 or >= 120)
    const crisis = chronicHypertensionService.classifyBloodPressure(195, 125);
    assert.equal(crisis.stage, chronicHypertensionService.BP_STAGES.CRISIS);
    assert.equal(crisis.requiresEmergencySafeguard, true);

    // Hypotension (<90 or <60)
    const low = chronicHypertensionService.classifyBloodPressure(85, 55);
    assert.equal(low.stage, chronicHypertensionService.BP_STAGES.HYPOTENSION);

    // Hemodynamic calculations
    // MAP = (2*80 + 120) / 3 = 280 / 3 = 93.3
    const hemo = chronicHypertensionService.calculateHemodynamicMetrics(120, 80);
    assert.equal(hemo.map, 93.3);
    assert.equal(hemo.pulsePressure, 40);

    console.log('  ✓ All 6 clinical stages classified accurately according to international guidelines.');
    console.log('  ✓ Hemodynamic MAP and Pulse Pressure calculations verified.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Clinical Alerts Engine (Crisis Safeguards & Target Organ Damage)');
  // ---------------------------------------------------------------------------
  {
    // Hypertensive Crisis with Chest Pain -> Emergency Alert with Hotlines
    const crisisAlerts = chronicHypertensionService.evaluateHypertensionAlerts({
      sys: 190,
      dia: 122,
      pul: 95,
      symptoms: ['chest_pain', 'dyspnea'],
      classification: { stage: chronicHypertensionService.BP_STAGES.CRISIS }
    });

    assert.equal(crisisAlerts.length, 1);
    assert.equal(crisisAlerts[0].severity, 'emergency');
    assert.ok(crisisAlerts[0].titleEn.includes('CRITICAL HYPERTENSIVE EMERGENCY'));
    assert.ok(crisisAlerts[0].hotlines.includes('123 (Egypt)'));

    // Stage 2 Uncontrolled
    const stage2Alerts = chronicHypertensionService.evaluateHypertensionAlerts({
      sys: 155,
      dia: 92,
      pul: 74,
      symptoms: [],
      classification: { stage: chronicHypertensionService.BP_STAGES.STAGE_2 }
    });
    assert.equal(stage2Alerts[0].type, 'STAGE_2_UNCONTROLLED');
    assert.equal(stage2Alerts[0].severity, 'urgent');

    // Symptomatic Hypotension with Dizziness
    const lowAlerts = chronicHypertensionService.evaluateHypertensionAlerts({
      sys: 84,
      dia: 52,
      pul: 68,
      symptoms: ['dizziness'],
      classification: { stage: chronicHypertensionService.BP_STAGES.HYPOTENSION }
    });
    assert.equal(lowAlerts[0].type, 'SYMPTOMATIC_HYPOTENSION');

    console.log('  ✓ Hypertensive crisis triggered emergency safeguard with hotline dispatch.');
    console.log('  ✓ Stage 2 uncontrolled and symptomatic hypotension alerts confirmed.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Readings Ingestion Across Multiple Measurement Sources');
  // ---------------------------------------------------------------------------
  {
    // 1. Bluetooth digital cuff reading (Morning)
    const r1 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      patientName: 'حسام محمود',
      systolic: 145,
      diastolic: 92,
      pulse: 78,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
      timing: 'morning',
      arm: 'left',
      posture: 'seated_rested'
    });
    assert.equal(r1.measurementSource, 'bluetooth_device');
    assert.equal(r1.classification.stage, 'STAGE_2_HYPERTENSION');

    // 2. Manual log reading (Evening)
    const r2 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 132,
      diastolic: 84,
      pulse: 72,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
      timing: 'evening'
    });
    assert.equal(r2.classification.stage, 'STAGE_1_HYPERTENSION');

    // 3. In-clinic reading (Controlled after medication)
    const r3 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 122,
      diastolic: 78,
      pulse: 70,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.CLINIC_READING,
      timing: 'morning'
    });
    assert.equal(r3.classification.stage, 'ELEVATED');

    const history = chronicHypertensionService.getPatientReadings(patientId);
    assert.equal(history.length, 3);

    console.log('  ✓ Multi-source ingestion verified (Bluetooth cuff, manual log, clinic reading).');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Chronic Disease Dashboard Metrics & Diurnal Morning Surge');
  // ---------------------------------------------------------------------------
  {
    // Ingest additional readings to simulate a full monitoring cycle
    await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 128,
      diastolic: 79,
      pulse: 74,
      timing: 'evening'
    });

    const dashboard = chronicHypertensionService.calculateHypertensionDashboard(patientId);

    assert.equal(dashboard.hasData, true);
    assert.equal(dashboard.totalReadings, 4);
    assert.ok(dashboard.controlRatePercent >= 0 && dashboard.controlRatePercent <= 100);
    assert.ok(dashboard.averages.systolic > 0);
    assert.ok(dashboard.averages.diastolic > 0);
    assert.ok(dashboard.averages.map > 0);

    // Diurnal morning vs evening analysis
    assert.ok(dashboard.diurnalSurge.avgMorningSystolic !== null);
    assert.ok(dashboard.diurnalSurge.avgEveningSystolic !== null);
    assert.ok(dashboard.diurnalSurge.morningSurgeDelta !== null);

    // Stage distribution
    assert.ok(dashboard.stageDistribution[chronicHypertensionService.BP_STAGES.STAGE_2] >= 1);
    assert.ok(dashboard.stageDistribution[chronicHypertensionService.BP_STAGES.STAGE_1] >= 1);

    console.log(`  ✓ Dashboard computed: Control Rate = ${dashboard.controlRatePercent}%, Avg BP = ${dashboard.averages.systolic}/${dashboard.averages.diastolic} mmHg.`);
    console.log(`  ✓ Diurnal surge evaluated: Morning avg = ${dashboard.diurnalSurge.avgMorningSystolic}, Evening avg = ${dashboard.diurnalSurge.avgEveningSystolic}.`);
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Specialist Follow-up Protocol & Doctor Role Gating');
  // ---------------------------------------------------------------------------
  {
    // Unapproved doctor blocked
    await assert.rejects(
      async () => {
        await chronicHypertensionService.createOrUpdateFollowupPlan({
          patientId,
          doctorIdentity: suspendedDoctor,
          targetSystolic: 125,
          targetDiastolic: 80
        });
      },
      err => {
        assert.equal(err.code, 'DOCTOR_CREDENTIALS_REQUIRED');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Approved Cardiologist prescribes 7-day titration plan
    const plan = await chronicHypertensionService.createOrUpdateFollowupPlan({
      patientId,
      doctorIdentity: cardiologistDoctor,
      targetSystolic: 130,
      targetDiastolic: 80,
      protocol: '7_day_titration',
      dietarySodiumTargetMg: 1800,
      clinicalGuidance: 'قياس الصباح والمساء يومياً قبل أخذ دواء الضغط وتخفيف ملح الطعام.',
      prescribedRegimen: [
        { name: 'Amlodipine', dosage: '5 mg', timing: 'Morning' }
      ]
    });

    assert.equal(plan.patientId, patientId);
    assert.equal(plan.doctorName, cardiologistDoctor.name);
    assert.equal(plan.doctorLicense, cardiologistDoctor.licenseNumber);
    assert.equal(plan.targets.systolic, 130);
    assert.equal(plan.targets.sodiumLimitMgPerDay, 1800);

    const activePlan = chronicHypertensionService.getFollowupPlan(patientId);
    assert.equal(activePlan.planId, plan.planId);

    console.log('  ✓ Follow-up plan gating confirmed: Only licensed specialists can prescribe protocol.');
    console.log('  ✓ Target systolic <130 and sodium restriction (<1800mg) recorded in clinical plan.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Certified Chronic Disease Report & Cryptographic Stamping');
  // ---------------------------------------------------------------------------
  {
    // Doctor certifies the report
    const certifiedReport = await chronicHypertensionService.certifyChronicHypertensionReport({
      patientId,
      doctorIdentity: cardiologistDoctor,
      clinicalDiagnosis: 'ارتفاع ضغط دم أولي مرحلة ثانية مستجيب جزئياً للعلاج',
      managementPlan: 'الاستمرار على الأملوديبين 5 مجم مع إعادة التقييم بعد أسبوعين.',
      riskStratification: 'Moderate Cardiovascular Risk (ACC/AHA)'
    });

    assert.ok(certifiedReport.reportRef.startsWith('HV-HTN-REP-'));
    assert.equal(certifiedReport.doctor.name, cardiologistDoctor.name);
    assert.equal(certifiedReport.doctor.licenseNumber, cardiologistDoctor.licenseNumber);
    assert.equal(certifiedReport.digitalSignature.algorithm, 'HMAC-SHA256');
    assert.ok(certifiedReport.digitalSignature.signatureHash.length === 64);
    assert.ok(certifiedReport.summaryMetrics.averageBp.includes('mmHg'));

    // Check underlying readings were stamped as doctor certified
    const certifiedReadings = chronicHypertensionService.getPatientReadings(patientId);
    assert.equal(certifiedReadings[0].doctorCertified, true);
    assert.equal(certifiedReadings[0].certificationDetails.doctorLicense, cardiologistDoctor.licenseNumber);

    console.log('  ✓ Certified chronic report generated with physician provenance and HMAC-SHA256 signature.');
    console.log('  ✓ Underlying patient readings stamped as verified and linked to report reference.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Obstetric Pre-eclampsia Critical Alerts & Gestational Safeguards');
  // ---------------------------------------------------------------------------
  {
    const pregnantPatientId = 'usr_preg_mariam_28';

    // 1. Critical Pre-eclampsia: BP >= 160/110 during pregnancy (Emergency)
    const severeBpPreg = await chronicHypertensionService.recordBloodPressureReading({
      patientId: pregnantPatientId,
      patientName: 'مريم عادل',
      systolic: 165,
      diastolic: 112,
      pulse: 88,
      pregnancyStage: chronicHypertensionService.PREGNANCY_STAGES.THIRD_TRIMESTER,
      ageGroup: chronicHypertensionService.AGE_GROUPS.ADULT,
      symptoms: ['headache', 'blurred_vision']
    });

    assert.equal(severeBpPreg.hasEmergencyAlert, true);
    const preEclampsiaEmergency = severeBpPreg.alerts.find(a => a.type === 'PREECLAMPSIA_CRITICAL_EMERGENCY');
    assert.ok(preEclampsiaEmergency, 'Severe pre-eclampsia emergency alert must be triggered');
    assert.equal(preEclampsiaEmergency.severity, chronicHypertensionService.ALERT_SEVERITIES.EMERGENCY);
    assert.ok(preEclampsiaEmergency.hotlines.includes('123 (Egypt)'));

    // 2. Pre-eclampsia with neurological symptom at 142/92 (Emergency)
    const symptomPreg = await chronicHypertensionService.recordBloodPressureReading({
      patientId: pregnantPatientId,
      patientName: 'مريم عادل',
      systolic: 142,
      diastolic: 92,
      pulse: 80,
      pregnancyStage: chronicHypertensionService.PREGNANCY_STAGES.SECOND_TRIMESTER,
      symptoms: ['صداع شديد', 'زغللة بالعين']
    });
    assert.equal(symptomPreg.hasEmergencyAlert, true);
    assert.ok(symptomPreg.alerts.some(a => a.type === 'PREECLAMPSIA_CRITICAL_EMERGENCY'));

    // 3. Gestational Hypertension: >=140/90 without neurological/epigastric red flags (Urgent obstetric review)
    const gestationalOnly = await chronicHypertensionService.recordBloodPressureReading({
      patientId: pregnantPatientId,
      patientName: 'مريم عادل',
      systolic: 144,
      diastolic: 92,
      pulse: 78,
      pregnancyStage: chronicHypertensionService.PREGNANCY_STAGES.SECOND_TRIMESTER,
      symptoms: []
    });
    assert.equal(gestationalOnly.hasEmergencyAlert, false);
    const gestationalAlert = gestationalOnly.alerts.find(a => a.type === 'GESTATIONAL_HYPERTENSION_URGENT');
    assert.ok(gestationalAlert, 'Gestational hypertension alert must be triggered');
    assert.equal(gestationalAlert.severity, chronicHypertensionService.ALERT_SEVERITIES.URGENT);

    // 4. Non-pregnant patient at 144/92 should trigger Stage 2 Uncontrolled, NOT Pre-eclampsia
    const nonPregnantReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId: 'usr_non_preg_patient',
      patientName: 'سارة أحمد',
      systolic: 144,
      diastolic: 92,
      pulse: 76,
      pregnancyStage: chronicHypertensionService.PREGNANCY_STAGES.NONE,
      symptoms: []
    });
    assert.ok(!nonPregnantReading.alerts.some(a => a.type.includes('PREECLAMPSIA')));
    assert.ok(nonPregnantReading.alerts.some(a => a.type === 'STAGE_2_UNCONTROLLED'));

    console.log('  ✓ Obstetric pre-eclampsia critical alert triggered on severe BP and/or neurological red flags.');
    console.log('  ✓ Distinct gestational hypertension triage enforced without false positive pre-eclampsia in non-pregnant patients.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 9: Pediatric Age-Group Safeguards');
  // ---------------------------------------------------------------------------
  {
    const childPatientId = 'usr_pediatric_ali_10';
    const pediatricReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId: childPatientId,
      patientName: 'علي كمال (10 سنوات)',
      systolic: 122,
      diastolic: 78,
      pulse: 90,
      ageGroup: chronicHypertensionService.AGE_GROUPS.PEDIATRIC
    });

    const pedAlert = pediatricReading.alerts.find(a => a.type === 'PEDIATRIC_BP_SPECIALIST_REQUIRED');
    assert.ok(pedAlert, 'Pediatric BP requires specialist evaluation flag');
    assert.equal(pedAlert.severity, chronicHypertensionService.ALERT_SEVERITIES.URGENT);
    console.log('  ✓ Pediatric age group routed to percentile-based specialist interpretation.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 10: Chronic Disease Specialties Readiness Matrix & Verification Boundaries');
  // ---------------------------------------------------------------------------
  {
    const readiness = chronicHypertensionService.SPECIALTY_READINESS;

    // Hypertension must be VERIFIED_ACTIVE
    assert.equal(readiness.HYPERTENSION.status, 'VERIFIED_ACTIVE');
    assert.equal(readiness.HYPERTENSION.launchReadiness, true);
    assert.equal(readiness.HYPERTENSION.testCoveragePercent, 100);

    // Other 4 specialties must remain UNDER_SPECIALIST_REVIEW without premature claims of readiness
    const unverifiedSpecialties = ['DIABETES', 'CARDIAC_RISK', 'WEIGHT_METABOLIC', 'CLINICAL_NUTRITION'];
    for (const specKey of unverifiedSpecialties) {
      assert.equal(readiness[specKey].status, 'UNDER_SPECIALIST_REVIEW', `${specKey} must be UNDER_SPECIALIST_REVIEW`);
      assert.equal(readiness[specKey].launchReadiness, false, `${specKey} launchReadiness must be false`);
      assert.ok(readiness[specKey].reviewNotes.length > 0, `${specKey} must specify review notes`);
    }

    console.log('  ✓ Specialty readiness boundaries strictly verified: Hypertension active, 4 specialties under review.');
  }

  // ---------------------------------------------------------------------------
  console.log('\n▶ TEST 11: Diagnostic File Attachments, Specialty Consent & Appointment Linkage');
  // ---------------------------------------------------------------------------
  {
    const diagnosticPatientId = 'usr_diag_patient_tarek';

    // Reading with files, consent, and linked appointment
    const detailedReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId: diagnosticPatientId,
      patientName: 'طارق عبد العزيز',
      systolic: 132,
      diastolic: 84,
      pulse: 74,
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_BLE_MONITOR,
      specialtyConsent: {
        consented: true,
        consentTimestamp: new Date().toISOString(),
        consentScope: 'HYPERTENSION_SPECIALTY_MONITORING',
        version: 'v1.0'
      },
      attachedFiles: [
        {
          fileUrl: 'https://storage.healthvibe.ai/docs/echo_cardiogram_tarek.pdf',
          fileType: 'application/pdf',
          fileName: 'Echocardiogram_2026.pdf'
        }
      ],
      linkedAppointmentId: 'appt_htn_followup_7761'
    });

    assert.equal(detailedReading.specialtyConsent.consented, true);
    assert.equal(detailedReading.attachedFiles.length, 1);
    assert.equal(detailedReading.attachedFiles[0].fileName, 'Echocardiogram_2026.pdf');
    assert.equal(detailedReading.linkedAppointmentId, 'appt_htn_followup_7761');

    // Followup plan with linked appointment and files
    const planWithAppt = await chronicHypertensionService.createOrUpdateFollowupPlan({
      patientId: diagnosticPatientId,
      doctorIdentity: cardiologistDoctor,
      targetSystolic: 125,
      targetDiastolic: 78,
      protocol: 'maintenance_weekly',
      linkedAppointmentId: 'appt_htn_followup_7761',
      attachedFiles: detailedReading.attachedFiles
    });

    assert.equal(planWithAppt.linkedAppointmentId, 'appt_htn_followup_7761');
    assert.equal(planWithAppt.attachedFiles.length, 1);

    console.log('  ✓ Diagnostic file attachment, informed consent tracking, and appointment linkage verified.');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL CHRONIC HYPERTENSION & SPECIALTY TESTS PASSED (100% SUCCESS)!');
  console.log('==================================================================\n');
})();
