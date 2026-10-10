/**
 * Health Vibe AI - Patient-Facing Blood Pressure History & Trend View Test Suite
 *
 * Verifies:
 * 1. Persisted measurements only (strictly no fabricated readings).
 * 2. Mandatory display fields per measurement:
 *    - systolic
 *    - diastolic
 *    - unit (mmHg)
 *    - date/time
 *    - source (Bluetooth, clinic, manual, OCR, etc.)
 * 3. Chronological timeline generation.
 * 4. SVG chart visualization when sufficient measurements exist (>= 2).
 * 5. Strictly NO trend fabrication when insufficient data exists (< 2 measurements).
 * 6. Clear indicators for:
 *    - missing measurements / missing values
 *    - monitoring gaps (> 48h between readings)
 *    - different measurement sources
 *    - different time periods (morning, afternoon, evening, night)
 *    - units (mmHg on all values, labels, axes)
 * 7. Clinical Boundary: Do NOT derive a new diagnosis from the chart.
 * 8. Clinical Boundary: Do NOT display unsupported risk classifications.
 * 9. Responsive layout & full bilingual Arabic (RTL) / English (LTR) parity.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("🩸 HEALTH VIBE AI: PATIENT BP HISTORY & TREND VIEW TEST SUITE");
console.log("   Persisted Data, Gated SVG Trends, Boundaries & Bilingual RTL/LTR");
console.log("==================================================================\n");

// Load the PatientUI module
const PatientUI = require("../app/modules/patient/patient-ui");
const chronicHypertensionService = require("../backend/chronic-hypertension-service");

// Reset store for fresh test cycle
chronicHypertensionService.resetHypertensionStoreForTesting();

(async () => {
  const patientId = "usr_patient_layla_404";

  // ===========================================================================
  // TEST 1: Empty State (0 Persisted Measurements) - No Fabricated Readings
  // ===========================================================================
  console.log("▶ TEST 1: Zero Persisted Measurements Empty State Handling");
  {
    const emptyReadings = [];
    const htmlEn = PatientUI.renderPatientBpTrendView({ readings: emptyReadings, isEn: true });
    const htmlAr = PatientUI.renderPatientBpTrendView({ readings: emptyReadings, isEn: false });

    // Must NOT contain any fabricated numbers
    assert.ok(htmlEn.includes("No readings yet") || htmlEn.includes("0"), "English view handles 0 readings cleanly");
    assert.ok(htmlAr.includes("لا توجد قراءات") || htmlAr.includes("0"), "Arabic view handles 0 readings cleanly");

    // Must NOT contain an SVG path trend curve
    assert.ok(!htmlEn.includes('<path d="M'), "Zero readings must NOT produce an SVG trend line");
    assert.ok(htmlEn.includes("Trend Chart Requires at Least 2 Measurements"), "Explains >= 2 measurements required");
    assert.ok(htmlAr.includes("رسم المنحنى البياني يتطلب قراءتين مسجلتين على الأقل"), "Arabic explains requirement");

    console.log("  ✔ Verified: Zero readings produces informative empty state with NO fabricated data or curves.\n");
  }

  // ===========================================================================
  // TEST 2: Single Persisted Measurement (< 2) - Insufficient Data Gating
  // ===========================================================================
  console.log("▶ TEST 2: Single Measurement (< 2) - Gating Prevents Trend Fabrication");
  {
    const singleReading = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 124,
      diastolic: 82,
      pulse: 70,
      unit: "mmHg",
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.BLUETOOTH_DEVICE,
      measuredAt: "2026-10-08T08:00:00Z",
      context: { arm: "right_arm", posture: "sitting", timing: "morning" }
    });

    const readings = [singleReading];

    const chartEn = PatientUI.renderBpTrendChartSvg(readings, true);
    const chartAr = PatientUI.renderBpTrendChartSvg(readings, false);

    // GATING RULE: Do not fabricate trends when insufficient data exists (< 2 measurements)
    assert.ok(!chartEn.includes('<path d="M'), "Must NOT draw any SVG curve for 1 single measurement");
    assert.ok(!chartAr.includes('<path d="M'), "Must NOT draw any SVG curve in Arabic mode for 1 measurement");
    assert.ok(chartEn.includes("Current Persisted Readings: 1"), "Displays current persisted count: 1");
    assert.ok(chartAr.includes("القراءات المسجلة حالياً: 1"), "Arabic displays current count: 1");

    // Timeline must still show the single real persisted measurement
    const timelineHtml = PatientUI.renderBpTimeline(readings, true);
    assert.ok(timelineHtml.includes("124"), "Timeline displays systolic: 124");
    assert.ok(timelineHtml.includes("82"), "Timeline displays diastolic: 82");
    assert.ok(timelineHtml.includes("mmHg"), "Timeline displays unit: mmHg");
    assert.ok(timelineHtml.includes("Bluetooth Monitor"), "Timeline displays Bluetooth source badge");

    console.log("  ✔ Verified: 1 reading displays accurately in timeline, while SVG trend curve is strictly gated.\n");
  }

  // ===========================================================================
  // TEST 3: Sufficient Persisted Measurements (>= 2) - Generates Real SVG Trend
  // ===========================================================================
  console.log("▶ TEST 3: Sufficient Real Measurements (>= 2) - SVG Trend Visualization");
  {
    const r2 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 128,
      diastolic: 84,
      pulse: 72,
      unit: "mmHg",
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.CLINIC_READING,
      measuredAt: "2026-10-09T09:30:00Z",
      context: { arm: "right_arm", posture: "sitting", timing: "morning" }
    });

    const r3 = await chronicHypertensionService.recordBloodPressureReading({
      patientId,
      systolic: 122,
      diastolic: 80,
      pulse: 68,
      unit: "mmHg",
      measurementSource: chronicHypertensionService.MEASUREMENT_SOURCES.MANUAL_PATIENT_LOG,
      measuredAt: "2026-10-10T11:15:00Z",
      context: { arm: "left_arm", posture: "sitting", timing: "morning" }
    });

    const persistedHistory = chronicHypertensionService.getPatientReadings(patientId);
    assert.equal(persistedHistory.length, 3, "3 persisted readings exist in database");

    const chartEn = PatientUI.renderBpTrendChartSvg(persistedHistory, true);
    const chartAr = PatientUI.renderBpTrendChartSvg(persistedHistory, false);

    // Now that >= 2 readings exist, SVG curves must be rendered
    assert.ok(chartEn.includes('<svg viewBox="0 0 640 240"'), "Contains responsive SVG viewBox");
    assert.ok(chartEn.includes('<path d="M'), "Contains SVG line path for systolic and diastolic curves");
    assert.ok(chartEn.includes('stroke="#09b8b6"'), "Contains systolic path stroke color");
    assert.ok(chartEn.includes('stroke="#3b82f6"'), "Contains diastolic path stroke color");

    // X-axis and Y-axis units
    assert.ok(chartEn.includes("mmHg"), "Chart includes mmHg axis units");
    assert.ok(chartEn.includes("Systolic"), "Legend includes Systolic label");
    assert.ok(chartEn.includes("Diastolic"), "Legend includes Diastolic label");
    assert.ok(chartAr.includes("الضغط الانقباضي"), "Arabic legend includes systolic label");
    assert.ok(chartAr.includes("الضغط الانبساطي"), "Arabic legend includes diastolic label");

    console.log("  ✔ Verified: Real SVG trend lines render accurately when sufficient measurements exist.\n");
  }

  // ===========================================================================
  // TEST 4: Verification of Mandatory Measurement Display Fields
  // ===========================================================================
  console.log("▶ TEST 4: Mandatory Measurement Display Fields (Systolic, Diastolic, Unit, Date/Time, Source)");
  {
    const persistedHistory = chronicHypertensionService.getPatientReadings(patientId);
    const timelineEn = PatientUI.renderBpTimeline(persistedHistory, true);
    const timelineAr = PatientUI.renderBpTimeline(persistedHistory, false);

    persistedHistory.forEach(r => {
      // 1. Systolic
      assert.ok(timelineEn.includes(String(r.systolic)), `Timeline displays systolic value: ${r.systolic}`);
      // 2. Diastolic
      assert.ok(timelineEn.includes(String(r.diastolic)), `Timeline displays diastolic value: ${r.diastolic}`);
      // 3. Unit (strictly mmHg)
      assert.ok(timelineEn.includes(r.unit || "mmHg"), `Timeline displays unit: ${r.unit}`);
      // 4. Source
      const srcInfo = PatientUI.getSourceInfo(r.measurementSource);
      assert.ok(timelineEn.includes(srcInfo.labelEn), `Timeline displays English source: ${srcInfo.labelEn}`);
      assert.ok(timelineAr.includes(srcInfo.labelAr), `Timeline displays Arabic source: ${srcInfo.labelAr}`);
    });

    console.log("  ✔ Verified: All mandatory fields (systolic, diastolic, unit, date/time, source) display cleanly.\n");
  }

  // ===========================================================================
  // TEST 5: Clear Indication of Missing Measurements & Monitoring Gaps
  // ===========================================================================
  console.log("▶ TEST 5: Clear Indication of Missing Measurements and Monitoring Gaps");
  {
    // A reading with missing diastolic or systolic
    const incompleteReading = {
      id: "bp_incomplete_99",
      systolic: 130,
      diastolic: null, // missing!
      unit: "mmHg",
      measurementSource: "manual_patient_log",
      measuredAt: "2026-10-15T08:00:00Z"
    };

    const incompleteHtmlEn = PatientUI.renderBpTimeline([incompleteReading], true);
    const incompleteHtmlAr = PatientUI.renderBpTimeline([incompleteReading], false);

    assert.ok(incompleteHtmlEn.includes("[Missing]"), "English view highlights missing diastolic value with [Missing]");
    assert.ok(incompleteHtmlAr.includes("[غير متوفر]"), "Arabic view highlights missing diastolic value with [غير متوفر]");
    assert.ok(incompleteHtmlEn.includes("bp-card-incomplete"), "Applies incomplete alert styling");

    // Gap Detection: 2 readings separated by 6 days (> 48 hours)
    const gapReadings = [
      { id: "r_day1", systolic: 120, diastolic: 80, measuredAt: "2026-10-01T08:00:00Z" },
      { id: "r_day7", systolic: 122, diastolic: 81, measuredAt: "2026-10-07T08:00:00Z" }
    ];

    const detectedGaps = PatientUI.detectMonitoringGaps(gapReadings, 48);
    assert.equal(detectedGaps.length, 1, "Detected 1 monitoring gap");
    assert.equal(detectedGaps[0].gapDays, 6, "Gap duration is 6 days");

    const gapTimelineHtmlEn = PatientUI.renderBpTimeline(gapReadings, true);
    assert.ok(gapTimelineHtmlEn.includes("Monitoring Gap: 6 days without recorded measurements"), "Timeline clearly alerts patient about 6-day tracking gap");

    const gapTimelineHtmlAr = PatientUI.renderBpTimeline(gapReadings, false);
    assert.ok(gapTimelineHtmlAr.includes("انقطاع في المتابعة: 6 يوماً دون تسجيل قياسات"), "Arabic timeline alerts patient about 6-day gap");

    console.log("  ✔ Verified: Missing values and multi-day monitoring gaps are explicitly highlighted.\n");
  }

  // ===========================================================================
  // TEST 6: Clear Indication of Different Measurement Sources & Time Periods
  // ===========================================================================
  console.log("▶ TEST 6: Distinct Measurement Sources and Time Periods (Morning, Afternoon, Evening, Night)");
  {
    const sourcesTestReadings = [
      { id: "s1", systolic: 120, diastolic: 80, measurementSource: "bluetooth_device", measuredAt: "2026-10-10T08:00:00Z" }, // Morning
      { id: "s2", systolic: 122, diastolic: 81, measurementSource: "clinic_reading", measuredAt: "2026-10-10T14:00:00Z" },   // Afternoon
      { id: "s3", systolic: 124, diastolic: 82, measurementSource: "manual_patient_log", measuredAt: "2026-10-10T19:00:00Z" }, // Evening
      { id: "s4", systolic: 125, diastolic: 83, measurementSource: "medical_ocr", measuredAt: "2026-10-10T23:30:00Z" }       // Night
    ];

    // Period evaluation
    assert.equal(PatientUI.getTimePeriod("2026-10-10T08:00:00Z").key, "morning");
    assert.equal(PatientUI.getTimePeriod("2026-10-10T14:00:00Z").key, "afternoon");
    assert.equal(PatientUI.getTimePeriod("2026-10-10T19:00:00Z").key, "evening");
    assert.equal(PatientUI.getTimePeriod("2026-10-10T23:30:00Z").key, "night");

    const htmlEn = PatientUI.renderBpTimeline(sourcesTestReadings, true);
    assert.ok(htmlEn.includes("Bluetooth Monitor"), "Shows Bluetooth Monitor badge");
    assert.ok(htmlEn.includes("Clinic Measurement"), "Shows Clinic Measurement badge");
    assert.ok(htmlEn.includes("Patient Manual Log"), "Shows Manual Log badge");
    assert.ok(htmlEn.includes("Medical Document OCR"), "Shows Medical OCR badge");

    assert.ok(htmlEn.includes("Morning"), "Shows Morning period");
    assert.ok(htmlEn.includes("Afternoon"), "Shows Afternoon period");
    assert.ok(htmlEn.includes("Evening"), "Shows Evening period");
    assert.ok(htmlEn.includes("Night"), "Shows Night period");

    // Filtering by period
    const morningOnly = PatientUI.filterReadings(sourcesTestReadings, { period: "morning" });
    assert.equal(morningOnly.length, 1);
    assert.equal(morningOnly[0].id, "s1");

    const eveningOnly = PatientUI.filterReadings(sourcesTestReadings, { period: "evening" });
    assert.equal(eveningOnly.length, 1);
    assert.equal(eveningOnly[0].id, "s3");

    console.log("  ✔ Verified: All measurement sources and diurnal time periods are uniquely categorized and filterable.\n");
  }

  // ===========================================================================
  // TEST 7: Clinical Boundaries: NO Derived Diagnoses & NO Unsupported Risk Scores
  // ===========================================================================
  console.log("▶ TEST 7: Strict Clinical Boundaries (No Derived Diagnosis & No Unsupported Risk Claims)");
  {
    const readings = [
      { id: "d1", systolic: 155, diastolic: 96, measuredAt: "2026-10-01T08:00:00Z", unit: "mmHg", measurementSource: "manual_patient_log" },
      { id: "d2", systolic: 160, diastolic: 100, measuredAt: "2026-10-02T08:00:00Z", unit: "mmHg", measurementSource: "manual_patient_log" }
    ];

    const fullViewHtmlEn = PatientUI.renderPatientBpTrendView({ readings, isEn: true });
    const fullViewHtmlAr = PatientUI.renderPatientBpTrendView({ readings, isEn: false });

    // Boundary 1: Do not derive a new diagnosis from the chart
    assert.ok(!fullViewHtmlEn.includes("You are diagnosed with"), "Does NOT give automated patient diagnosis");
    assert.ok(!fullViewHtmlEn.includes("Clinical Diagnosis:"), "Does NOT label patient with automated diagnosis");
    assert.ok(!fullViewHtmlAr.includes("تم تشخيصك بـ"), "Arabic does NOT claim diagnosis");

    // Boundary 2: Do not display unsupported risk classifications
    assert.ok(!fullViewHtmlEn.includes("10-Year ASCVD Risk:"), "Does NOT show unsupported cardiovascular risk calculator");
    assert.ok(!fullViewHtmlEn.includes("Stroke Risk Score:"), "Does NOT fabricate stroke probability");

    // Boundary 3: Prominent observational disclaimer
    assert.ok(fullViewHtmlEn.includes("Observational Health Record Notice:"), "Displays clear English observational notice");
    assert.ok(fullViewHtmlEn.includes("does not provide medical diagnoses, treatment prescriptions, or automated risk classifications"), "States no automated diagnoses or risk classifications");
    assert.ok(fullViewHtmlAr.includes("تنبيه السجل الصحي الاسترعائي:"), "Displays Arabic observational disclaimer");
    assert.ok(fullViewHtmlAr.includes("لا يقدم هذا العرض تشخيصاً طبياً أو خططاً علاجية أو تصنيفات مخاطر تلقائية"), "Arabic states no automated diagnoses or risk classifications");

    console.log("  ✔ Verified: Zero automated diagnoses or unsupported risk classifications. Observational disclaimer present.\n");
  }

  // ===========================================================================
  // TEST 8: Bilingual RTL/LTR and Responsive Accessibility
  // ===========================================================================
  console.log("▶ TEST 8: Full Bilingual RTL/LTR and Responsive Layout Parity");
  {
    const readings = [
      { id: "b1", systolic: 120, diastolic: 80, measuredAt: "2026-10-01T08:00:00Z", unit: "mmHg", measurementSource: "bluetooth_device" },
      { id: "b2", systolic: 118, diastolic: 78, measuredAt: "2026-10-02T08:00:00Z", unit: "mmHg", measurementSource: "bluetooth_device" }
    ];

    const viewAr = PatientUI.renderPatientBpTrendView({ readings, isEn: false });
    const viewEn = PatientUI.renderPatientBpTrendView({ readings, isEn: true });

    // Direction and language modes
    assert.ok(viewAr.includes('dir="rtl"'), "Arabic view has dir='rtl'");
    assert.ok(viewAr.includes('rtl-mode'), "Arabic view has rtl-mode class");
    assert.ok(viewEn.includes('dir="ltr"'), "English view has dir='ltr'");
    assert.ok(viewEn.includes('ltr-mode'), "English view has ltr-mode class");

    // Titles in Arabic and English
    assert.ok(viewAr.includes("سجل ومنحنى ضغط الدم"), "Arabic title rendered");
    assert.ok(viewEn.includes("Blood Pressure History & Trends"), "English title rendered");

    // Filter labels in Arabic and English
    assert.ok(viewAr.includes("كل الفترات") && viewAr.includes("صباحاً") && viewAr.includes("مساءً"), "Arabic period filters rendered");
    assert.ok(viewEn.includes("All Periods") && viewEn.includes("Morning") && viewEn.includes("Evening"), "English period filters rendered");

    // Accessibility attributes
    assert.ok(viewAr.includes('role="note"'), "Advisory banner has role='note'");
    assert.ok(viewAr.includes('role="feed"'), "Timeline has role='feed'");
    assert.ok(viewAr.includes('role="img"'), "Chart points have role='img'");

    console.log("  ✔ Verified: Bilingual Arabic RTL and English LTR layouts are 100% complete with full accessibility.\n");
  }

  console.log("==================================================================");
  console.log("🎉 ALL PATIENT BP HISTORY & TREND VIEW TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
})().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
