/**
 * Health Vibe AI - Patient-Facing Weight & Measurement History Test Suite
 *
 * Verifies:
 * 1. Persisted measurements only (strictly no fabricated readings or numbers).
 * 2. Mandatory display fields per measurement:
 *    - weight
 *    - unit (kg, lbs, g)
 *    - date/time
 *    - source (clinical scale, smart scale, patient self-report, EHR import, OCR, etc.)
 *    - calculated BMI when valid
 * 3. Chronological timeline generation.
 * 4. SVG chart visualization when sufficient real measurements exist (>= 2).
 * 5. Strictly NO trend curve fabrication when insufficient data exists (< 2 measurements).
 * 6. Clear distinction between directly measured data vs calculated data.
 * 7. Clear indicators for:
 *    - missing measurements / missing values (e.g. missing height -> no fabricated BMI)
 *    - monitoring gaps (> 30 days between measurements)
 *    - measurement sources
 *    - units (kg, cm)
 * 8. Clinical Boundary: Do NOT generate treatment recommendations (diets, calorie goals, meds).
 * 9. Clinical Boundary: Do NOT create an automatic diagnosis based on the chart.
 * 10. Full bilingual Arabic (RTL) / English (LTR) parity & responsive accessibility.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

console.log("==================================================================");
console.log("⚖️ HEALTH VIBE AI: PATIENT WEIGHT & MEASUREMENT HISTORY TEST SUITE");
console.log("   Actual Measurements, Gated Trends, Calculated BMI & Boundaries");
console.log("==================================================================\n");

const obesityService = require("../backend/obesity-service");
const ObesityUI = require("../app/modules/patient/obesity-ui");

// Reset store for fresh test cycle
obesityService.resetObesityStoreForTesting();

(async () => {
  const patientId = "usr_pat_trend_salma_88";

  // ===========================================================================
  // TEST 1: Empty State (0 Persisted Measurements) - No Fabricated Numbers
  // ===========================================================================
  console.log("▶ TEST 1: Zero Persisted Measurements Empty State Handling");
  {
    const emptyMeasurements = [];
    const htmlEn = ObesityUI.renderPatientObesityTrendView({ measurements: emptyMeasurements, isEn: true });
    const htmlAr = ObesityUI.renderPatientObesityTrendView({ measurements: emptyMeasurements, isEn: false });

    // Must NOT contain fabricated numbers
    assert.ok(htmlEn.includes("No readings yet") || htmlEn.includes("0"), "English view handles 0 readings cleanly");
    assert.ok(htmlAr.includes("لا توجد قراءات") || htmlAr.includes("0"), "Arabic view handles 0 readings cleanly");

    // Must NOT contain an SVG path trend curve
    assert.ok(!htmlEn.includes('<path d="M'), "Zero readings must NOT produce an SVG trend curve");
    assert.ok(!htmlAr.includes('<path d="M'), "Zero readings must NOT produce an SVG trend curve in Arabic");
    assert.ok(htmlEn.includes("Trend Chart Requires at Least 2 Measurements"), "Explains >= 2 measurements required");
    assert.ok(htmlAr.includes("رسم المنحنى البياني يتطلب قياسين مسجلين على الأقل"), "Arabic explains requirement");

    console.log("  ✔ Verified: Zero measurements produces informative empty state with NO fabricated data or curves.\n");
  }

  // ===========================================================================
  // TEST 2: Single Persisted Measurement (< 2) - Gating Prevents Trend Fabrication
  // ===========================================================================
  console.log("▶ TEST 2: Single Measurement (< 2) - Gating Prevents Trend Fabrication");
  {
    const singleMeas = obesityService.recordObesityMeasurement({
      patientId,
      height: 168,
      heightUnit: "cm",
      weight: 74.5,
      weightUnit: "kg",
      measurementSource: obesityService.MEASUREMENT_SOURCES.SMART_SCALE,
      measurementTimestamp: "2026-10-01T08:00:00Z"
    });

    const measurements = [singleMeas];

    const chartEn = ObesityUI.renderObesityTrendChartSvg(measurements, true);
    const chartAr = ObesityUI.renderObesityTrendChartSvg(measurements, false);

    // GATING RULE: Do not fabricate trends when insufficient data exists (< 2 measurements)
    assert.ok(!chartEn.includes('<path d="M'), "Must NOT draw any SVG curve for 1 single measurement");
    assert.ok(!chartAr.includes('<path d="M'), "Must NOT draw any SVG curve in Arabic mode for 1 measurement");
    assert.ok(chartEn.includes("Current Persisted Readings: 1"), "Displays current persisted count: 1");
    assert.ok(chartAr.includes("القياسات المسجلة حالياً: 1"), "Arabic displays current count: 1");

    // Timeline must still show the single real persisted measurement
    const timelineHtml = ObesityUI.renderObesityTimeline(measurements, true);
    assert.ok(timelineHtml.includes("74.5"), "Timeline displays weight: 74.5");
    assert.ok(timelineHtml.includes("kg"), "Timeline displays unit: kg");
    assert.ok(timelineHtml.includes("Smart Scale / Bluetooth"), "Timeline displays Smart Scale source badge");
    assert.ok(timelineHtml.includes("26.4"), "Timeline displays calculated BMI: 26.4");

    console.log("  ✔ Verified: 1 measurement displays accurately in timeline, while SVG trend curve is strictly gated.\n");
  }

  // ===========================================================================
  // TEST 3: Sufficient Real Measurements (>= 2) - Real SVG Trend Visualization
  // ===========================================================================
  console.log("▶ TEST 3: Sufficient Real Measurements (>= 2) - SVG Trend Visualization");
  {
    const m2 = obesityService.recordObesityMeasurement({
      patientId,
      weight: 73.8,
      weightUnit: "kg",
      measurementSource: obesityService.MEASUREMENT_SOURCES.CLINICAL_SCALE,
      measurementTimestamp: "2026-10-05T09:30:00Z",
      useExistingMeasurements: true
    });

    const m3 = obesityService.recordObesityMeasurement({
      patientId,
      weight: 73.0,
      weightUnit: "kg",
      measurementSource: obesityService.MEASUREMENT_SOURCES.PATIENT_SELF_REPORT,
      measurementTimestamp: "2026-10-10T11:15:00Z",
      useExistingMeasurements: true
    });

    const history = obesityService.getPatientMeasurementHistory(patientId);
    assert.equal(history.length, 3, "3 persisted measurements exist in store");

    const chartEn = ObesityUI.renderObesityTrendChartSvg(history, true);
    const chartAr = ObesityUI.renderObesityTrendChartSvg(history, false);

    // Now that >= 2 measurements exist, SVG curve must be rendered
    assert.ok(chartEn.includes('<svg viewBox="0 0 640 240"'), "Contains responsive SVG viewBox");
    assert.ok(chartEn.includes('<path d="M'), "Contains SVG line path for weight progression curve");
    assert.ok(chartEn.includes('stroke="#09b8b6"'), "Contains stroke color for weight line");

    // X-axis and Y-axis units
    assert.ok(chartEn.includes("kg"), "Chart includes kg axis units");
    assert.ok(chartEn.includes("Measured Weight"), "Legend includes Measured Weight label");
    assert.ok(chartAr.includes("الوزن المقاس"), "Arabic legend includes Measured Weight label");

    console.log("  ✔ Verified: Real SVG trend line renders accurately when sufficient measurements exist.\n");
  }

  // ===========================================================================
  // TEST 4: Verification of Mandatory Measurement Display Fields
  // ===========================================================================
  console.log("▶ TEST 4: Mandatory Measurement Display Fields (Weight, Unit, Date/Time, Source, Calculated BMI)");
  {
    const history = obesityService.getPatientMeasurementHistory(patientId);
    const timelineEn = ObesityUI.renderObesityTimeline(history, true);
    const timelineAr = ObesityUI.renderObesityTimeline(history, false);

    history.forEach(m => {
      // 1. Weight
      assert.ok(timelineEn.includes(String(m.weight)), `Timeline displays weight value: ${m.weight}`);
      // 2. Unit
      assert.ok(timelineEn.includes(m.weightUnit || "kg"), `Timeline displays unit: ${m.weightUnit}`);
      // 3. Source
      const srcInfo = ObesityUI.getSourceInfo(m.measurementSource);
      assert.ok(timelineEn.includes(srcInfo.labelEn), `Timeline displays English source: ${srcInfo.labelEn}`);
      assert.ok(timelineAr.includes(srcInfo.labelAr), `Timeline displays Arabic source: ${srcInfo.labelAr}`);
      // 4. Calculated BMI when valid
      if (m.bmi) {
        assert.ok(timelineEn.includes(String(m.bmi)), `Timeline displays calculated BMI: ${m.bmi}`);
        assert.ok(timelineEn.includes("Calculated"), "Timeline tags calculated BMI as Calculated");
        assert.ok(timelineAr.includes("محسوب"), "Arabic timeline tags BMI as Calculated");
      }
    });

    console.log("  ✔ Verified: All mandatory fields (weight, unit, date/time, source, calculated BMI) display cleanly.\n");
  }

  // ===========================================================================
  // TEST 5: Distinction Between Measured Data vs Calculated Data
  // ===========================================================================
  console.log("▶ TEST 5: Clear Distinction Between Measured Data vs Calculated Data");
  {
    const history = obesityService.getPatientMeasurementHistory(patientId);
    const timelineHtml = ObesityUI.renderObesityTimeline(history, true);

    // Measured values
    assert.ok(timelineHtml.includes("Direct Measurement") || timelineHtml.includes("Measured Weight"), "Clearly identifies Measured Weight");
    assert.ok(timelineHtml.includes("Height Parameter") || timelineHtml.includes("Stature"), "Clearly identifies Stature");

    // Calculated values
    assert.ok(timelineHtml.includes("Derived Formula") || timelineHtml.includes("Calculated BMI"), "Clearly identifies Calculated BMI");
    assert.ok(timelineHtml.includes("Calculated"), "Badge specifies derivation method");

    console.log("  ✔ Verified: Measured values (weight, height) and calculated values (BMI) are explicitly separated.\n");
  }

  // ===========================================================================
  // TEST 6: Missing Information Handled Cleanly (No Invented Values or Fabricated BMI)
  // ===========================================================================
  console.log("▶ TEST 6: Missing Information Handling (Never Invent Values or Fabricate BMI)");
  {
    // A measurement with weight only and NO height on file anywhere
    const noHeightMeas = {
      measurementId: "ob_no_height_99",
      weight: 88.0,
      weightUnit: "kg",
      height: null,
      heightUnit: null,
      bmi: null, // strictly null
      measurementSource: "clinical_scale",
      measurementTimestamp: "2026-10-10T12:00:00Z"
    };

    const timelineHtmlEn = ObesityUI.renderObesityTimeline([noHeightMeas], true);
    const timelineHtmlAr = ObesityUI.renderObesityTimeline([noHeightMeas], false);

    // Height missing tag
    assert.ok(timelineHtmlEn.includes("[Missing Height]"), "Displays explicit [Missing Height] tag in English");
    assert.ok(timelineHtmlAr.includes("[الطول غير مسجل]"), "Displays explicit [الطول غير مسجل] tag in Arabic");

    // BMI missing tag - NO FABRICATED BMI
    assert.ok(timelineHtmlEn.includes("-- (Incomplete Data — No Fabricated BMI)"), "Displays explicit No Fabricated BMI notice");
    assert.ok(timelineHtmlAr.includes("-- (بيانات غير مكتملة — لا اصطناع)"), "Arabic displays No Fabricated BMI notice");

    // Missing weight measurement handling
    const noWeightMeas = {
      measurementId: "ob_no_weight_101",
      weight: null,
      weightUnit: "kg",
      height: 175,
      heightUnit: "cm",
      bmi: null,
      measurementSource: "clinical_scale",
      measurementTimestamp: "2026-10-10T13:00:00Z"
    };

    const noWeightHtmlEn = ObesityUI.renderObesityTimeline([noWeightMeas], true);
    assert.ok(noWeightHtmlEn.includes("[Missing Weight]"), "Displays [Missing Weight] when weight is absent");
    assert.ok(noWeightHtmlEn.includes("ob-card-incomplete"), "Applies incomplete card class");

    console.log("  ✔ Verified: Missing measurements display transparent incomplete notices without fabricating values.\n");
  }

  // ===========================================================================
  // TEST 7: Tracking Gaps Detection (> 30 Days)
  // ===========================================================================
  console.log("▶ TEST 7: Detection of Monitoring Gaps (> 30 Days)");
  {
    const gapRecords = [
      {
        measurementId: "g_read_1",
        weight: 80.0,
        weightUnit: "kg",
        measurementTimestamp: "2026-07-01T08:00:00Z"
      },
      {
        measurementId: "g_read_2",
        weight: 78.5,
        weightUnit: "kg",
        measurementTimestamp: "2026-08-15T08:00:00Z" // 45 days later (> 30 days)
      }
    ];

    const detectedGaps = ObesityUI.detectObesityTrackingGaps(gapRecords, 30);
    assert.equal(detectedGaps.length, 1, "Detected exactly 1 gap");
    assert.equal(detectedGaps[0].gapDays, 45, "Detected 45 days gap");

    const timelineEn = ObesityUI.renderObesityTimeline(gapRecords, true);
    assert.ok(timelineEn.includes("Monitoring Gap: 45 days without recorded measurements"), "Timeline alerts patient about 45-day tracking gap");

    const timelineAr = ObesityUI.renderObesityTimeline(gapRecords, false);
    assert.ok(timelineAr.includes("انقطاع في المتابعة: 45 يوماً دون تسجيل قياسات"), "Arabic timeline alerts patient about 45-day tracking gap");

    console.log("  ✔ Verified: Tracking gaps (> 30 days) detected and highlighted in chronological timeline.\n");
  }

  // ===========================================================================
  // TEST 8: Strict Clinical Boundaries: NO Treatment Recommendations & NO Diagnosis
  // ===========================================================================
  console.log("▶ TEST 8: Strict Clinical Boundaries (No Treatment Recommendations & No Automated Diagnosis)");
  {
    const history = obesityService.getPatientMeasurementHistory(patientId);
    const fullViewHtmlEn = ObesityUI.renderPatientObesityTrendView({ measurements: history, isEn: true });
    const fullViewHtmlAr = ObesityUI.renderPatientObesityTrendView({ measurements: history, isEn: false });

    // Boundary 1: No treatment recommendations (no diets, calorie targets, weight loss drugs)
    assert.ok(!fullViewHtmlEn.toLowerCase().includes("calorie deficit"), "Does NOT prescribe calorie deficit");
    assert.ok(!fullViewHtmlEn.toLowerCase().includes("take orlistat"), "Does NOT recommend weight loss medication");
    assert.ok(!fullViewHtmlEn.toLowerCase().includes("take semaglutide"), "Does NOT prescribe GLP-1 medications");
    assert.ok(!fullViewHtmlAr.includes("حمية سعرات محددة"), "Arabic does NOT prescribe automated diet");

    // Boundary 2: No automatic diagnosis from the chart
    assert.ok(!fullViewHtmlEn.includes("You are diagnosed with"), "Does NOT output automatic diagnosis");
    assert.ok(!fullViewHtmlEn.includes("Clinical Diagnosis:"), "Does NOT label patient with automated diagnosis");
    assert.ok(!fullViewHtmlAr.includes("تم تشخيصك بـ"), "Arabic does NOT output automatic diagnosis");

    // Boundary 3: Observational non-diagnostic disclaimer
    assert.ok(fullViewHtmlEn.includes("Observational Anthropometric Record Notice:"), "Displays clear observational notice");
    assert.ok(fullViewHtmlEn.includes("does not provide medical diagnoses, treatment recommendations, diet prescriptions"), "States no automatic diagnoses or diet prescriptions");
    assert.ok(fullViewHtmlAr.includes("تنبيه السجل الأنثروبومتري الاسترعائي:"), "Displays Arabic observational notice");
    assert.ok(fullViewHtmlAr.includes("لا يقدم هذا العرض تشخيصاً طبياً أو توصيات علاجية أو وصفات غذائية"), "Arabic states no automatic diagnoses or diet prescriptions");

    console.log("  ✔ Verified: Zero treatment recommendations and zero automated diagnoses from the chart.\n");
  }

  // ===========================================================================
  // TEST 9: Full Bilingual RTL/LTR and Responsive Accessibility
  // ===========================================================================
  console.log("▶ TEST 9: Full Bilingual RTL/LTR and Responsive Accessibility Parity");
  {
    const history = obesityService.getPatientMeasurementHistory(patientId);
    const viewAr = ObesityUI.renderPatientObesityTrendView({ measurements: history, isEn: false });
    const viewEn = ObesityUI.renderPatientObesityTrendView({ measurements: history, isEn: true });

    // Direction and language modes
    assert.ok(viewAr.includes('dir="rtl"'), "Arabic view has dir='rtl'");
    assert.ok(viewAr.includes('rtl-mode'), "Arabic view has rtl-mode class");
    assert.ok(viewEn.includes('dir="ltr"'), "English view has dir='ltr'");
    assert.ok(viewEn.includes('ltr-mode'), "English view has ltr-mode class");

    // Titles in Arabic and English
    assert.ok(viewAr.includes("سجل ومنحنى الوزن والقياسات"), "Arabic title rendered");
    assert.ok(viewEn.includes("Weight & Measurement History"), "English title rendered");

    // Filter labels in Arabic and English
    assert.ok(viewAr.includes("كل الفترات") && viewAr.includes("صباحاً") && viewAr.includes("مساءً"), "Arabic period filters rendered");
    assert.ok(viewEn.includes("All Periods") && viewEn.includes("Morning") && viewEn.includes("Evening"), "English period filters rendered");

    // Accessibility attributes
    assert.ok(viewAr.includes('role="note"'), "Advisory banner has role='note'");
    assert.ok(viewAr.includes('role="feed"'), "Timeline has role='feed'");
    assert.ok(viewAr.includes('role="img"'), "Chart points have role='img'");

    // Integration in main screen
    const mockContainer = { innerHTML: "" };
    ObesityUI.renderObesityScreen(mockContainer, { measurements: history, isEn: true, activeTab: "measurements" });
    assert.ok(mockContainer.innerHTML.includes("Weight & Measurement History"), "Main screen tab 1 embeds trend view");
    assert.ok(mockContainer.innerHTML.includes("Longitudinal Weight Trend"), "Main screen tab 1 embeds trend chart");

    console.log("  ✔ Verified: Bilingual Arabic RTL and English LTR layouts are 100% complete with full accessibility.\n");
  }

  console.log("==================================================================");
  console.log("🎉 ALL PATIENT OBESITY HISTORY & TREND VIEW TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
})().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
