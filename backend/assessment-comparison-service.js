/**
 * Health Vibe AI - Certified Clinical Assessment Comparison & Longitudinal Tracking Service
 * 
 * Implements:
 * 1. Independent New Assessment Creation:
 *    - Creates independent assessment records preserving historical cases as baseline.
 * 2. Longitudinal Measurement Deltas & Comparisons:
 *    - Quantifies changes between latest and previous assessments.
 *    - Identifies measurement units (%, bpm, °C, breaths/min, mmHg).
 *    - Records exact timing and data sources (bluetooth oximeter, clinical entry, patient reported).
 *    - Explicitly flags missing measurements so missing data is never hidden or conflated with 0.
 * 3. Approved Report Comparison:
 *    - Analyzes diagnosis transitions, severity level shifts, and medication/recommendation adjustments.
 * 4. Multi-Point Longitudinal Chart Data:
 *    - Observational trend points across time for vitals and triage indices.
 *    - STRICT SAFETY GUARD: Chart is observational only and does NOT derive an automated AI diagnosis.
 * 5. Medical Summary Export:
 *    - Consolidates patient profile, assessment comparisons, measurement metadata, and plans.
 * 6. Doctor-Approved Reassessment Plan & Reminders:
 *    - Clinicians configure follow-up reassessment intervals.
 *    - Enqueues automated reminders for patients strictly according to doctor orders.
 */

const crypto = require('crypto');

// Standard Clinical Respiratory & Physiological Measurement Definitions
const STANDARD_MEASUREMENTS = Object.freeze({
  oxygenLevel: {
    key: 'oxygenLevel',
    labelEn: 'Oxygen Saturation (SpO2)',
    labelAr: 'تشبع الأكسجين في الدم (SpO2)',
    unit: '%',
    normalRange: { min: 95, max: 100 },
    criticalThreshold: 90,
    warningThreshold: 93,
    higherIsBetter: true
  },
  heartRate: {
    key: 'heartRate',
    labelEn: 'Heart Rate (Pulse)',
    labelAr: 'نبضات القلب (Pulse)',
    unit: 'bpm',
    normalRange: { min: 60, max: 100 },
    criticalThreshold: 120,
    warningThreshold: 100,
    higherIsBetter: null
  },
  respiratoryRate: {
    key: 'respiratoryRate',
    labelEn: 'Respiratory Rate',
    labelAr: 'معدل التنفس (Respiratory Rate)',
    unit: 'breaths/min',
    normalRange: { min: 12, max: 20 },
    criticalThreshold: 30,
    warningThreshold: 24,
    higherIsBetter: null
  },
  temperature: {
    key: 'temperature',
    labelEn: 'Body Temperature',
    labelAr: 'درجة حرارة الجسم',
    unit: '°C',
    normalRange: { min: 36.5, max: 37.5 },
    criticalThreshold: 39.0,
    warningThreshold: 38.0,
    higherIsBetter: null
  },
  bloodPressureSys: {
    key: 'bloodPressureSys',
    labelEn: 'Systolic Blood Pressure',
    labelAr: 'ضغط الدم الانقباضي',
    unit: 'mmHg',
    normalRange: { min: 90, max: 120 },
    criticalThreshold: 160,
    warningThreshold: 130,
    higherIsBetter: null
  },
  bloodPressureDia: {
    key: 'bloodPressureDia',
    labelEn: 'Diastolic Blood Pressure',
    labelAr: 'ضغط الدم الانبساطي',
    unit: 'mmHg',
    normalRange: { min: 60, max: 80 },
    criticalThreshold: 100,
    warningThreshold: 85,
    higherIsBetter: null
  }
});

// In-Memory Storage for Reassessment Plans
const inMemoryReassessmentPlans = new Map();

/**
 * Normalizes input measurement to clean float or null.
 */
function cleanNumericValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Formats a date into a clean YYYY-MM-DD HH:mm string.
 */
function formatDateDisplay(isoString) {
  if (!isoString) return 'Not recorded';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
  } catch (e) {
    return String(isoString);
  }
}

/**
 * Extracts and categorizes every physiological measurement from a case,
 * clearly identifying value, unit, timing, data source, and missing state.
 */
function identifyMeasurementsMetadata(caseData = {}) {
  const timestamp = caseData.createdAt || caseData.submittedAt || caseData.timestamp || null;
  const vitals = caseData.vitals || caseData.vitalSigns || {};
  const defaultSource = caseData.dataSource || caseData.source || 'patient_reported';

  const results = {};
  const missingList = [];
  const recordedList = [];

  for (const [key, def] of Object.entries(STANDARD_MEASUREMENTS)) {
    let rawVal = null;
    let timing = timestamp;
    let source = defaultSource;

    // Direct case field or nested vitals
    if (caseData[key] !== undefined && caseData[key] !== null) {
      rawVal = caseData[key];
    } else if (vitals[key] !== undefined && vitals[key] !== null) {
      rawVal = vitals[key];
    } else if (key === 'oxygenLevel' && (caseData.o2 !== undefined || vitals.o2 !== undefined)) {
      rawVal = caseData.o2 ?? vitals.o2;
    } else if (key === 'heartRate' && (caseData.pulse !== undefined || vitals.pulse !== undefined)) {
      rawVal = caseData.pulse ?? vitals.pulse;
    }

    const numVal = cleanNumericValue(rawVal);
    const isMissing = numVal === null;

    // Check custom source overrides (e.g. bluetooth pulse oximeter)
    if (key === 'oxygenLevel' && (caseData.oximeterDevice || caseData.bluetoothConnected)) {
      source = 'pulse_oximeter_bluetooth';
    } else if (caseData.enteredByNurse || caseData.nurseUid) {
      source = 'clinical_nurse_entry';
    } else if (caseData.enteredByDoctor || caseData.doctorUid) {
      source = 'physician_direct_entry';
    }

    const item = {
      key,
      labelEn: def.labelEn,
      labelAr: def.labelAr,
      value: numVal,
      unit: def.unit,
      timing,
      timingDisplay: formatDateDisplay(timing),
      dataSource: isMissing ? null : source,
      status: isMissing ? 'missing' : 'recorded',
      isMissing,
      normalRange: `${def.normalRange.min} - ${def.normalRange.max} ${def.unit}`
    };

    results[key] = item;
    if (isMissing) {
      missingList.push(item);
    } else {
      recordedList.push(item);
    }
  }

  // Symptom scales (cough, dyspnea)
  const breathingDifficulty = caseData.breathingDifficulty || caseData.dyspnea || null;
  const coughLevel = caseData.coughLevel || caseData.cough || null;

  results.breathingDifficulty = {
    key: 'breathingDifficulty',
    labelEn: 'Breathing Difficulty (Dyspnea)',
    labelAr: 'صعوبة وضيق التنفس',
    value: breathingDifficulty,
    unit: 'severity scale',
    timing: timestamp,
    timingDisplay: formatDateDisplay(timestamp),
    dataSource: defaultSource,
    status: breathingDifficulty ? 'recorded' : 'missing',
    isMissing: !breathingDifficulty
  };

  results.coughLevel = {
    key: 'coughLevel',
    labelEn: 'Cough Severity',
    labelAr: 'شدة السعال',
    value: coughLevel,
    unit: 'severity scale',
    timing: timestamp,
    timingDisplay: formatDateDisplay(timestamp),
    dataSource: defaultSource,
    status: coughLevel ? 'recorded' : 'missing',
    isMissing: !coughLevel
  };

  return {
    measurements: results,
    recordedCount: recordedList.length,
    missingCount: missingList.length,
    missingMeasurements: missingList,
    recordedMeasurements: recordedList,
    dataCompletenessRatio: Number((recordedList.length / Object.keys(STANDARD_MEASUREMENTS).length).toFixed(2))
  };
}

/**
 * Calculates comparative delta between two numeric measurements.
 */
function calculateNumericDelta(currentVal, previousVal, def) {
  if (currentVal === null && previousVal === null) {
    return {
      status: 'both_missing',
      delta: null,
      direction: 'no_data',
      summaryEn: 'Measurement missing in both assessments',
      summaryAr: 'القياس غير مسجل في كلا الفحصين'
    };
  }
  if (previousVal === null && currentVal !== null) {
    return {
      status: 'newly_recorded',
      delta: null,
      direction: 'recorded',
      summaryEn: `Newly recorded: ${currentVal} ${def.unit} (previously not recorded)`,
      summaryAr: `قياس جديد: ${currentVal} ${def.unit} (لم يسجل في الفحص السابق)`
    };
  }
  if (previousVal !== null && currentVal === null) {
    return {
      status: 'now_missing',
      delta: null,
      direction: 'missing',
      summaryEn: `Previously recorded: ${previousVal} ${def.unit} (missing in latest)`,
      summaryAr: `سجل سابقاً: ${previousVal} ${def.unit} (غير مسجل في الفحص الأخير)`
    };
  }

  const rawDelta = Number((currentVal - previousVal).toFixed(2));
  const absDelta = Math.abs(rawDelta);
  const sign = rawDelta > 0 ? '+' : (rawDelta < 0 ? '-' : '±');

  let direction = 'stable';
  if (def.higherIsBetter === true) {
    direction = rawDelta > 0 ? 'improved' : (rawDelta < 0 ? 'worsened' : 'stable');
  } else if (def.higherIsBetter === false) {
    direction = rawDelta < 0 ? 'improved' : (rawDelta > 0 ? 'worsened' : 'stable');
  } else {
    // For values like Heart Rate & Temp, approaching the normal center is improvement
    const mid = (def.normalRange.min + def.normalRange.max) / 2;
    const prevDist = Math.abs(previousVal - mid);
    const currDist = Math.abs(currentVal - mid);
    if (Math.abs(prevDist - currDist) < 0.1) {
      direction = 'stable';
    } else {
      direction = currDist < prevDist ? 'improved' : 'worsened';
    }
  }

  return {
    status: 'comparable',
    delta: rawDelta,
    absoluteDelta: absDelta,
    direction,
    summaryEn: `${sign}${absDelta} ${def.unit} (${previousVal} → ${currentVal} ${def.unit}) [${direction}]`,
    summaryAr: `${sign}${absDelta} ${def.unit} (${previousVal} إلى ${currentVal} ${def.unit}) [${direction === 'improved' ? 'تحسن' : direction === 'worsened' ? 'تراجع' : 'مستقر'}]`
  };
}

/**
 * Compares two patient assessments (latest vs previous baseline).
 */
function compareAssessments(latestCase = {}, previousCase = {}) {
  const latestMeta = identifyMeasurementsMetadata(latestCase);
  const previousMeta = identifyMeasurementsMetadata(previousCase);

  const measurementDeltas = {};

  for (const [key, def] of Object.entries(STANDARD_MEASUREMENTS)) {
    const curr = latestMeta.measurements[key];
    const prev = previousMeta.measurements[key];
    const deltaInfo = calculateNumericDelta(curr.value, prev.value, def);

    measurementDeltas[key] = {
      key,
      labelEn: def.labelEn,
      labelAr: def.labelAr,
      unit: def.unit,
      previous: {
        value: prev.value,
        timing: prev.timing,
        timingDisplay: prev.timingDisplay,
        dataSource: prev.dataSource,
        status: prev.status,
        isMissing: prev.isMissing
      },
      current: {
        value: curr.value,
        timing: curr.timing,
        timingDisplay: curr.timingDisplay,
        dataSource: curr.dataSource,
        status: curr.status,
        isMissing: curr.isMissing
      },
      currentValue: curr.value,
      previousValue: prev.value,
      isCurrentMissing: curr.isMissing,
      isPreviousMissing: prev.isMissing,
      source: curr.dataSource,
      timing: curr.timing,
      ...deltaInfo
    };
  }

  // Symptom Changes
  const prevDyspnea = previousCase.breathingDifficulty || 'none';
  const currDyspnea = latestCase.breathingDifficulty || 'none';
  const prevCough = previousCase.coughLevel || 'none';
  const currCough = latestCase.coughLevel || 'none';

  const symptomsComparison = {
    dyspnea: {
      previous: prevDyspnea,
      current: currDyspnea,
      changed: prevDyspnea !== currDyspnea
    },
    cough: {
      previous: prevCough,
      current: currCough,
      changed: prevCough !== currCough
    }
  };

  // Triage / Risk Level Shift
  const prevPriority = previousCase.priority || previousCase.triageLevel || 'normal';
  const currPriority = latestCase.priority || latestCase.triageLevel || 'normal';

  const priorityWeights = { urgent: 3, high: 2, normal: 1, standard: 1 };
  const prevWeight = priorityWeights[String(prevPriority).toLowerCase()] || 1;
  const currWeight = priorityWeights[String(currPriority).toLowerCase()] || 1;
  const triageTrend = currWeight < prevWeight ? 'improved' : (currWeight > prevWeight ? 'escalated' : 'stable');

  return {
    comparisonId: `cmp_${latestCase.id || 'curr'}_${previousCase.id || 'prev'}`,
    generatedAt: new Date().toISOString(),
    cases: {
      latest: {
        id: latestCase.id || null,
        timestamp: latestCase.createdAt || latestCase.submittedAt || null,
        triageLevel: currPriority,
        status: latestCase.status || 'pending'
      },
      previous: {
        id: previousCase.id || null,
        timestamp: previousCase.createdAt || previousCase.submittedAt || null,
        triageLevel: prevPriority,
        status: previousCase.status || 'pending'
      }
    },
    measurementDeltas,
    measurementsComparison: measurementDeltas,
    symptomsComparison,
    triageShift: {
      previous: prevPriority,
      current: currPriority,
      trend: triageTrend
    },
    missingInLatest: latestMeta.missingMeasurements.map(m => ({
      key: m.key,
      labelEn: m.labelEn,
      labelAr: m.labelAr,
      unit: m.unit
    })),
    missingMeasurementsInLatest: latestMeta.missingMeasurements,
    missingInPrevious: previousMeta.missingMeasurements.map(m => ({
      key: m.key,
      labelEn: m.labelEn,
      labelAr: m.labelAr,
      unit: m.unit
    }))
  };
}

/**
 * Compares two certified doctor-approved diagnostic reports.
 */
function compareApprovedReports(latestReport = {}, previousReport = {}) {
  const getDiag = (r) => r && (r.doctorDiagnosis || r.clinicalDiagnosis || r.diagnosis || r.doctorNote || null);
  const prevDiag = getDiag(previousReport) || 'غير مسجل';
  const currDiag = getDiag(latestReport) || 'غير مسجل';

  const diagnosisChanged = String(prevDiag).trim().toLowerCase() !== String(currDiag).trim().toLowerCase();

  // Medication parsing & comparison
  const parseMedList = (meds) => {
    if (!meds) return [];
    if (Array.isArray(meds)) return meds.map(m => String(m).trim());
    return String(meds).split(/[\n,;]+/).map(m => m.trim()).filter(Boolean);
  };

  const getMeds = (r) => r && (r.doctorPrescriptions || r.prescriptions || r.medications || r.currentMedications || []);
  const prevMeds = parseMedList(getMeds(previousReport));
  const currMeds = parseMedList(getMeds(latestReport));

  const addedMeds = currMeds.filter(m => !prevMeds.some(pm => pm.toLowerCase() === m.toLowerCase()));
  const removedMeds = prevMeds.filter(m => !currMeds.some(cm => cm.toLowerCase() === m.toLowerCase()));
  const unchangedMeds = currMeds.filter(m => prevMeds.some(pm => pm.toLowerCase() === m.toLowerCase()));

  // Doctor Provenance
  const prevDoc = previousReport.doctorName || previousReport.approvingDoctorName || previousReport.reviewedBy || 'غير مسجل';
  const currDoc = latestReport.doctorName || latestReport.approvingDoctorName || latestReport.reviewedBy || 'غير مسجل';

  const medsComparison = {
    previous: prevMeds,
    current: currMeds,
    added: addedMeds,
    removed: removedMeds,
    unchanged: unchangedMeds,
    changed: addedMeds.length > 0 || removedMeds.length > 0
  };

  return {
    reportComparisonId: `rep_cmp_${latestReport.reportRef || latestReport.id || 'curr'}_${previousReport.reportRef || previousReport.id || 'prev'}`,
    isDiagnosisModified: diagnosisChanged,
    latestDiagnosis: currDiag,
    previousDiagnosis: prevDiag,
    diagnosis: {
      previous: prevDiag,
      current: currDiag,
      changed: diagnosisChanged
    },
    medications: medsComparison,
    medicationsComparison: medsComparison,
    doctors: {
      previousDoctor: prevDoc,
      currentDoctor: currDoc,
      sameDoctor: prevDoc.toLowerCase() === currDoc.toLowerCase()
    },
    provenance: {
      previousApprovedAt: previousReport.approvedAt || previousReport.createdAt || null,
      currentApprovedAt: latestReport.approvedAt || latestReport.createdAt || null,
      previousReportRef: previousReport.reportRef || null,
      currentReportRef: latestReport.reportRef || null
    }
  };
}

/**
 * Builds multi-point chronological chart data for patient physiological trends.
 * STRICT SAFETY PRINCIPLE:
 * The chart is an observational representation of recorded measurements over time.
 * It strictly does NOT synthesize or derive an automated AI medical diagnosis.
 */
function buildPatientChartData(cases = []) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return {
      points: [],
      dataCount: 0,
      chartDisclaimer: 'The longitudinal chart is an observational display of physiological measurements over time. Diagnostic evaluation is strictly performed by authorized physicians.'
    };
  }

  // Sort chronological (oldest to newest for charting)
  const sorted = [...cases].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.submittedAt || a.timestamp || 0).getTime();
    const timeB = new Date(b.createdAt || b.submittedAt || b.timestamp || 0).getTime();
    return timeA - timeB;
  });

  const points = sorted.map((c, index) => {
    const meta = identifyMeasurementsMetadata(c);
    const ts = c.createdAt || c.submittedAt || c.timestamp || new Date().toISOString();
    return {
      index: index + 1,
      caseId: c.id || c.caseId || `case_${index + 1}`,
      timestamp: ts,
      date: String(ts).slice(0, 10),
      displayTime: formatDateDisplay(ts),
      triageLevel: c.priority || c.triageLevel || 'normal',
      status: c.status || 'pending',
      oxygenLevel: meta.measurements.oxygenLevel.value,
      heartRate: meta.measurements.heartRate.value,
      respiratoryRate: meta.measurements.respiratoryRate.value,
      temperature: meta.measurements.temperature.value,
      bloodPressureSys: meta.measurements.bloodPressureSys.value,
      bloodPressureDia: meta.measurements.bloodPressureDia.value,
      missingMeasurements: meta.missingMeasurements.map(m => m.key),
      symptoms: c.symptoms || (c.symptomList || [])
    };
  });

  return {
    points,
    dataCount: points.length,
    dateRange: {
      earliest: points[0]?.timestamp || null,
      latest: points[points.length - 1]?.timestamp || null
    },
    chartDisclaimer: 'The longitudinal chart is an observational display of physiological measurements over time. It does NOT generate or imply an automated medical diagnosis. Diagnostic interpretation is strictly performed by authorized physicians.',
    diagnosticPolicy: 'NO_AUTOMATED_DIAGNOSIS_FROM_CHART'
  };
}

/**
 * Creates and schedules a doctor-approved reassessment plan.
 * STRICT SAFETY RULE:
 * Reassessment triggers are planned exclusively by clinicians.
 * No automated diagnosis is derived from the chart.
 */
async function scheduleDoctorReassessmentPlan(db, options = {}) {
  const {
    patientId,
    doctorId,
    doctorName,
    doctorSpecialty = 'استشاري أمراض صدرية',
    interval,
    intervalHours,
    frequency = 'once',
    instructions = '',
    caseId = null
  } = options;

  if (!patientId) {
    const err = new Error('patientId is required to schedule reassessment plan.');
    err.code = 'INVALID_PATIENT';
    throw err;
  }
  if (!doctorId) {
    const err = new Error('doctorId is required. Reassessment plans must be approved by a verified physician.');
    err.code = 'CLINICIAN_REQUIRED';
    throw err;
  }

  let hours = 24;
  if (interval) {
    const match = String(interval).match(/^(\d+)([hd])?$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = (match[2] || 'h').toLowerCase();
      hours = unit === 'd' ? num * 24 : num;
    }
  } else if (intervalHours) {
    hours = Number(intervalHours) || 24;
  }

  const now = new Date();
  const scheduledTime = new Date(now.getTime() + hours * 3600 * 1000);
  const planId = `plan_reassess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = now.toISOString();

  const plan = {
    planId,
    id: planId,
    patientId,
    caseId,
    doctorId,
    doctorName: doctorName || 'الطبيب المعالج',
    doctor: {
      uid: doctorId,
      name: doctorName || 'الطبيب المعالج',
      specialty: doctorSpecialty
    },
    interval: interval || `${hours}h`,
    intervalHours: hours,
    frequency,
    instructions: instructions || 'مطلوب إجراء فحص تنفسي جديد لمتابعة استقرار نسبة الأكسجين والأعراض وفق الخطة العلاجية.',
    instructionsEn: 'Follow-up breathing assessment requested to monitor oxygen stability and symptoms according to treatment plan.',
    status: 'active',
    createdAt: nowIso,
    approvedAt: nowIso,
    scheduledAt: scheduledTime.toISOString(),
    scheduledFor: scheduledTime.toISOString(),
    completedAt: null,
    cancelledAt: null,
    // Safety requirement affirmation
    diagnosisPolicy: 'NO_AUTOMATED_DIAGNOSIS_FROM_CHART',
    disclaimer: 'This reminder is based on a doctor-approved reassessment plan and does not constitute a newly derived automated diagnosis.'
  };

  inMemoryReassessmentPlans.set(planId, plan);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('reassessment_plans').doc(planId).set(plan);
    } catch (e) {
      console.warn('[REASSESSMENT PLAN WARNING] Firestore save failed:', e.message);
    }
  }

  const result = {
    ok: true,
    planId,
    ...plan,
    plan
  };

  return result;
}

/**
 * Retrieves all reassessment plans for a patient.
 */
async function getPatientReassessmentPlans(db, patientId) {
  if (!patientId) return [];

  const plans = [];
  for (const p of inMemoryReassessmentPlans.values()) {
    if (p.patientId === patientId) {
      plans.push({ ...p });
    }
  }

  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('reassessment_plans').where('patientId', '==', patientId).get();
      if (snap && snap.docs) {
        snap.docs.forEach(d => {
          const data = d.data();
          if (data && data.planId && !inMemoryReassessmentPlans.has(data.planId)) {
            plans.push(data);
          }
        });
      }
    } catch (e) {}
  }

  plans.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return plans;
}

/**
 * Cancels an active reassessment plan.
 */
async function cancelReassessmentPlan(db, planId, actor = {}) {
  let plan = inMemoryReassessmentPlans.get(planId);

  if (!plan && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('reassessment_plans').doc(planId).get();
      if (snap.exists) plan = snap.data();
    } catch (e) {}
  }

  if (!plan) {
    const err = new Error(`Reassessment plan '${planId}' not found.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const nowIso = new Date().toISOString();
  plan.status = 'cancelled';
  plan.cancelledAt = nowIso;
  plan.cancelledBy = actor.uid || 'authorized_user';

  inMemoryReassessmentPlans.set(planId, plan);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('reassessment_plans').doc(planId).update({
        status: 'cancelled',
        cancelledAt: nowIso,
        cancelledBy: plan.cancelledBy
      });
    } catch (e) {}
  }

  return plan;
}

/**
 * Starts an independent new assessment for the patient.
 * Creates an entirely new case record, preserving all previous historical cases as baselines.
 */
async function createIndependentNewAssessment(db, options = {}) {
  const user = options.user || {};
  const assessmentData = options.assessmentData || {};
  const previousCaseId = options.previousCaseId || null;

  const resolvedUid = user.uid || user.id || options.patientId;
  if (!resolvedUid) {
    const err = new Error('Authenticated patient user is required to start an independent assessment.');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const resolvedUser = {
    uid: resolvedUid,
    email: user.email || options.patientEmail || '',
    displayName: user.displayName || user.name || options.patientName || 'Patient'
  };
  const resolvedData = Object.keys(assessmentData).length > 0 ? assessmentData : options;

  const caseId = `case_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const oxygenLevel = cleanNumericValue(resolvedData.oxygenLevel ?? resolvedData.o2);
  const heartRate = cleanNumericValue(resolvedData.heartRate ?? resolvedData.pulse);
  const respiratoryRate = cleanNumericValue(resolvedData.respiratoryRate);
  const temperature = cleanNumericValue(resolvedData.temperature);

  const priority = (oxygenLevel !== null && oxygenLevel > 0 && oxygenLevel < 90)
    ? 'urgent'
    : ((oxygenLevel !== null && oxygenLevel > 0 && oxygenLevel < 93) ? 'high' : 'normal');

  const newCase = {
    id: caseId,
    caseId,
    patientId: resolvedUser.uid,
    patientName: resolvedUser.displayName,
    patientEmail: resolvedUser.email,
    isIndependentAssessment: true,
    previousCaseId: previousCaseId || user.latestCaseId || null,
    oxygenLevel,
    o2: oxygenLevel,
    heartRate,
    pulse: heartRate,
    respiratoryRate,
    temperature,
    breathingDifficulty: assessmentData.breathingDifficulty || 'none',
    coughLevel: assessmentData.coughLevel || 'none',
    symptoms: Array.isArray(assessmentData.symptoms) ? assessmentData.symptoms : [],
    priority,
    triageLevel: priority,
    status: 'pending',
    dataSource: assessmentData.dataSource || 'patient_reported',
    createdAt: nowIso,
    submittedAt: nowIso,
    updatedAt: nowIso,
    notes: assessmentData.notes || '',
    clinicId: assessmentData.clinicId || user.clinicId || null,
    assignedDoctorId: assessmentData.assignedDoctorId || null,
    assignedDoctorName: assessmentData.assignedDoctorName || null
  };

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('cases').doc(caseId).set(newCase);
      // Link as user's latest case without overwriting previous case documents
      await db.collection('users').doc(user.uid).set({
        latestCaseId: caseId,
        latestAssessmentAt: nowIso,
        latestStatus: newCase.status,
        latestOxygenLevel: oxygenLevel
      }, { merge: true });
    } catch (e) {
      console.warn('[CREATE CASE WARNING] Firestore write failed:', e.message);
    }
  }

  newCase.ok = true;
  return newCase;
}

/**
 * Generates comprehensive Medical Summary Export (JSON and printable HTML structure).
 */
async function generateMedicalSummaryExport(dbOrPayload, patientIdOrOptions = {}) {
  let patient = {};
  let cases = [];
  let reports = [];
  let reassessmentPlans = [];

  // Check if first argument is a Firestore db instance
  if (dbOrPayload && typeof dbOrPayload.collection === 'function') {
    const db = dbOrPayload;
    const patientId = typeof patientIdOrOptions === 'string' ? patientIdOrOptions : (patientIdOrOptions.patientId || patientIdOrOptions.uid);

    try {
      const pDoc = await db.collection('users').doc(patientId).get();
      if (pDoc.exists) {
        patient = { uid: pDoc.id, ...pDoc.data() };
      } else {
        patient = { uid: patientId };
      }
    } catch (e) {
      patient = { uid: patientId };
    }

    try {
      const casesSnap = await db.collection('cases').where('patientId', '==', patientId).get();
      cases = (casesSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      cases = [];
    }

    try {
      reassessmentPlans = await getPatientReassessmentPlans(db, patientId);
    } catch (e) {
      reassessmentPlans = [];
    }
  } else if (dbOrPayload && typeof dbOrPayload === 'object') {
    patient = dbOrPayload.patient || {};
    cases = dbOrPayload.cases || [];
    reports = dbOrPayload.reports || [];
    if (dbOrPayload.reassessmentPlan) reassessmentPlans = [dbOrPayload.reassessmentPlan];
    if (dbOrPayload.reassessmentPlans) reassessmentPlans = dbOrPayload.reassessmentPlans;
  }

  const generatedAt = new Date().toISOString();
  const sortedCases = [...cases].sort((a, b) => new Date(b.createdAt || b.submittedAt || 0) - new Date(a.createdAt || a.submittedAt || 0));
  const latestCase = sortedCases[0] || null;
  const previousCase = sortedCases[1] || null;

  const comparison = (latestCase && previousCase) ? compareAssessments(latestCase, previousCase) : null;
  const chart = buildPatientChartData(cases);

  const exportPayload = {
    ok: true,
    exportVersion: 'HV-MED-SUMMARY-v1.0',
    patientId: patient.uid || patient.id || null,
    generatedAt,
    generatedAtDisplay: formatDateDisplay(generatedAt),
    patient: {
      uid: patient.uid || null,
      name: patient.name || patient.displayName || 'Confidential Patient',
      email: patient.email || null,
      nationalId: patient.nationalId ? '••••••••' + String(patient.nationalId).slice(-4) : 'Not recorded',
      age: patient.age || null,
      gender: patient.gender || null
    },
    latestAssessment: latestCase ? identifyMeasurementsMetadata(latestCase) : null,
    comparisonToBaseline: comparison,
    comparisonWithBaseline: comparison,
    longitudinalChartTrends: chart,
    activeReassessmentPlans: reassessmentPlans,
    doctorApprovedReassessmentPlan: reassessmentPlans[0] || null,
    certifiedReportsHistory: reports.map(r => ({
      reportRef: r.reportRef,
      clinicalDiagnosis: r.clinicalDiagnosis || r.diagnosis,
      doctorName: r.doctorName || r.approvingDoctorName,
      doctorSpecialty: r.doctorSpecialty,
      approvedAt: r.approvedAt,
      medications: r.medications,
      recommendations: r.recommendations
    })),
    clinicalSafetyAffirmation: {
      diagnosisAuthority: 'Strictly reserved for licensed medical physicians.',
      automatedChartDiagnosisAllowed: false,
      disclaimer: 'This medical summary is generated for clinical reference and patient empowerment. Longitudinal charts are observational; automated diagnoses are prohibited.'
    }
  };

  return exportPayload;
}

function clearReassessmentPlansLog() {
  inMemoryReassessmentPlans.clear();
}

module.exports = {
  STANDARD_MEASUREMENTS,
  identifyMeasurementsMetadata,
  calculateNumericDelta,
  compareAssessments,
  compareApprovedReports,
  buildPatientChartData,
  scheduleDoctorReassessmentPlan,
  getPatientReassessmentPlans,
  cancelReassessmentPlan,
  createIndependentNewAssessment,
  generateMedicalSummaryExport,
  clearReassessmentPlansLog
};
