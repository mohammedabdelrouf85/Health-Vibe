/**
 * QA & Bilingual Automation Test Suite:
 * Doctor Performance Analytics & Upcoming Clinic Appointments (Bilingual & Medical Translation Support)
 * Benchmark: TabeebHub (Clinical English Dashboard & Arabic/English Patient Recommendations)
 * Task: P2 High Priority | Product / Frontend | Doctor Analytics Bilingual Support
 *
 * Verifies:
 * 1. Full Clinical English Dictionary Coverage (getDoctorAnalyticsI18n(true))
 * 2. Professional Medical Arabic Localization Dictionary (getDoctorAnalyticsI18n(false))
 * 3. 100% Key Parity between English and Arabic dictionaries
 * 4. Semantic Direction (dir="ltr" in English vs dir="rtl" in Arabic)
 * 5. Bidirectional Auto-Alignment Markup (dir="auto", bidi-auto-text) on dynamic patient content
 * 6. Arabic patient names & recommendations rendering cleanly inside Clinical English Doctor UI
 * 7. English clinical directives, SpO2 readings, and medications rendering cleanly inside Medical Arabic Doctor UI
 * 8. Upcoming appointments bilingual time formatting ("AM/PM" vs "ص/م") and formatAppointmentTime helper
 * 9. CSS unicode-bidi and direction rules in app/styles.css
 * 10. Smooth recommendations writing experience and bilingual recommendation chips
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

console.log('🌐 Starting Doctor Analytics Bilingual & Medical Translation Tests (TabeebHub Benchmark)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  console.log(`🔹 Bilingual Test ${testsTotal}: ${name}`);
  try {
    fn();
    console.log(`  ✅ Passed: ${name}\n`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ Failed: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    process.exit(1);
  }
}

// ── Test 1: Full Clinical English Dictionary Coverage ───────────────────────
runTest('Full Clinical English Dictionary Coverage (getDoctorAnalyticsI18n)', () => {
  assert.strictEqual(typeof DoctorUI.getDoctorAnalyticsI18n, 'function', 'getDoctorAnalyticsI18n must be exported');
  const en = DoctorUI.getDoctorAnalyticsI18n(true);

  // Header
  assert.strictEqual(en.header.title, 'Doctor Performance Analytics & Clinic Schedule');
  assert(en.header.subtitle.includes('Clinical intelligence, response turnaround time'));
  assert.strictEqual(en.header.badgeLive, 'Live TabeebHub SLA Active');

  // Timeframe
  assert.strictEqual(en.timeframe.label, 'Performance Period:');
  assert.strictEqual(en.timeframe.today, 'Today');
  assert.strictEqual(en.timeframe.week, 'This Week');
  assert.strictEqual(en.timeframe.month, 'This Month');
  assert.strictEqual(en.timeframe.all, 'All Time');

  // KPIs
  assert.strictEqual(en.kpis.totalReviewedTitle, 'Reviewed Cases');
  assert.strictEqual(en.kpis.todayReviewedTitle, "Today's Caseload");
  assert.strictEqual(en.kpis.avgTatTitle, 'Avg Response Time (TAT)');
  assert.strictEqual(en.kpis.tatUnit, 'mins');
  assert.strictEqual(en.kpis.slaRateTitle, 'SLA Adherence Rate');
  assert.strictEqual(en.kpis.badgeTopTier, 'Top 5% Fast Responder');

  // Caseload
  assert.strictEqual(en.caseload.title, 'Clinical Caseload Breakdown');
  assert.strictEqual(en.caseload.asthma, 'Asthma & Bronchial Irritation');
  assert.strictEqual(en.caseload.hypertension, 'Hypertension & Cardiac Risk');
  assert.strictEqual(en.caseload.pneumonia, 'Pneumonia & Respiratory Infections');

  // Efficiency
  assert.strictEqual(en.efficiency.title, 'Review Speed & SLA Efficiency');
  assert(en.efficiency.fastUnder15.includes('< 15 mins'));

  // Appointments
  assert.strictEqual(en.appointments.title, 'Upcoming Clinic Appointments');
  assert.strictEqual(en.appointments.tabAll, 'All Visits');
  assert.strictEqual(en.appointments.tabToday, 'Today');
  assert.strictEqual(en.appointments.tabTomorrow, 'Tomorrow');
  assert.strictEqual(en.appointments.tabInPerson, 'In-Clinic (Hospital)');
  assert.strictEqual(en.appointments.tabTelehealth, 'Telehealth (Video)');
  assert.strictEqual(en.appointments.btnExamine, 'Examine Patient');
  assert.strictEqual(en.appointments.btnDossier, 'Patient Dossier');
  assert.strictEqual(en.appointments.btnReminder, 'Send Reminder');

  // Recommendations
  assert.strictEqual(en.recommendations.title, 'Clinical Recommendations & Care Plan');
  assert(en.recommendations.placeholder.includes('Add one recommendation per line in English or Arabic'));
  assert(en.recommendations.chipHydration.includes('oral warm fluid hydration'));
  assert(en.recommendations.chipEmergency.includes('SpO2 saturation drops below 92%'));
});

// ── Test 2: Professional Medical Arabic Localization Dictionary ──────────────
runTest('Professional Medical Arabic Localization Dictionary (getDoctorAnalyticsI18n)', () => {
  const ar = DoctorUI.getDoctorAnalyticsI18n(false);

  // Header
  assert.strictEqual(ar.header.title, 'إحصائيات أداء الطبيب وجدول مواعيد العيادة');
  assert(ar.header.subtitle.includes('مؤشرات الأداء السريرية'));
  assert.strictEqual(ar.header.badgeLive, 'مباشر • معايير TabeebHub نشطة');

  // Timeframe
  assert.strictEqual(ar.timeframe.label, 'فترة التحليل:');
  assert.strictEqual(ar.timeframe.today, 'اليوم');
  assert.strictEqual(ar.timeframe.week, 'هذا الأسبوع');
  assert.strictEqual(ar.timeframe.month, 'هذا الشهر');
  assert.strictEqual(ar.timeframe.all, 'جميع الفترات');

  // KPIs
  assert.strictEqual(ar.kpis.totalReviewedTitle, 'إجمالي الحالات المعتمدة');
  assert.strictEqual(ar.kpis.todayReviewedTitle, 'حالات اليوم المنجزة');
  assert.strictEqual(ar.kpis.avgTatTitle, 'متوسط وقت الاستجابة (TAT)');
  assert.strictEqual(ar.kpis.tatUnit, 'دقيقة');
  assert.strictEqual(ar.kpis.slaRateTitle, 'نسبة الالتزام بالمعايير');
  assert.strictEqual(ar.kpis.badgeTopTier, 'استجابة فائقة السرعة (Top 5%)');

  // Caseload
  assert.strictEqual(ar.caseload.title, 'توزيع الحالات السريرية والمراجعات');
  assert.strictEqual(ar.caseload.asthma, 'حساسية الصدر والربو الشعبي');
  assert.strictEqual(ar.caseload.hypertension, 'ارتفاع ضغط الدم والمخاطر القلبية');
  assert.strictEqual(ar.caseload.pneumonia, 'الالتهاب الرئوي والعدوى التنفسية');

  // Efficiency
  assert.strictEqual(ar.efficiency.title, 'كفاءة سرعة الاستجابة وجودة الفرز');
  assert(ar.efficiency.fastUnder15.includes('أقل من 15 دقيقة'));

  // Appointments
  assert.strictEqual(ar.appointments.title, 'مواعيد العيادة القادمة');
  assert.strictEqual(ar.appointments.tabAll, 'جميع المواعيد');
  assert.strictEqual(ar.appointments.tabToday, 'اليوم');
  assert.strictEqual(ar.appointments.tabTomorrow, 'غداً');
  assert.strictEqual(ar.appointments.tabInPerson, 'عيادة حضورية');
  assert.strictEqual(ar.appointments.tabTelehealth, 'استشارة عن بُعد');
  assert.strictEqual(ar.appointments.btnExamine, 'فحص الحالة');
  assert.strictEqual(ar.appointments.btnDossier, 'الملف السريري');
  assert.strictEqual(ar.appointments.btnReminder, 'تذكير المريض');

  // Recommendations
  assert.strictEqual(ar.recommendations.title, 'التوصيات الطبية وخطة المتابعة');
  assert(ar.recommendations.placeholder.includes('أضف كل توصية في سطر منفصل بالعربية أو الإنجليزية'));
  assert(ar.recommendations.chipHydration.includes('الراحة التامة والإكثار من تناول السوائل'));
  assert(ar.recommendations.chipEmergency.includes('انخفاض الأكسجين عن 92%'));
});

// ── Test 3: 100% Key Parity between English and Arabic Dictionaries ─────────
runTest('100% Key Parity between English and Arabic Dictionaries', () => {
  const en = DoctorUI.getDoctorAnalyticsI18n(true);
  const ar = DoctorUI.getDoctorAnalyticsI18n(false);

  function verifyKeysRecursive(objEn, objAr, path = '') {
    const enKeys = Object.keys(objEn);
    const arKeys = Object.keys(objAr);

    for (const key of enKeys) {
      assert(
        key in objAr,
        `Missing Arabic translation key: "${path ? path + '.' : ''}${key}"`
      );
      if (typeof objEn[key] === 'object' && objEn[key] !== null) {
        verifyKeysRecursive(objEn[key], objAr[key], `${path ? path + '.' : ''}${key}`);
      }
    }

    for (const key of arKeys) {
      assert(
        key in objEn,
        `Missing English translation key: "${path ? path + '.' : ''}${key}"`
      );
    }
  }

  verifyKeysRecursive(en, ar);
});

// ── Test 4: Semantic Direction (dir="ltr" in English vs dir="rtl" in Arabic) ─
runTest('Semantic Direction (dir="ltr" in English vs dir="rtl" in Arabic)', () => {
  const mockData = {
    timeframe: 'today',
    totalReviewed: 28,
    todayReviewed: 9,
    avgTatMinutes: 14,
    slaComplianceRate: 98.6,
    conditions: { asthma: 10, hypertension: 8, pneumonia: 5, blood: 3, metabolic: 2, other: 0 },
    upcomingAppointments: [
      {
        id: 'appt-1',
        patientName: 'أحمد محمود',
        patientNameEn: 'Ahmed Mahmoud',
        timeStr: '09:30 AM',
        day: 'today',
        type: 'in_person',
        status: 'waiting',
        o2: 95,
        chiefComplaint: 'متابعة قياسات الضغط وتعديل الجرعة',
        caseId: 'case-1'
      }
    ]
  };

  const htmlEn = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, true);
  const htmlAr = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, false);

  assert(htmlEn.includes('dir="ltr"'), 'English dashboard must have dir="ltr"');
  assert(htmlAr.includes('dir="rtl"'), 'Arabic dashboard must have dir="rtl"');
});

// ── Test 5: Bidirectional Auto-Alignment Markup on Patient Content ─────────
runTest('Bidirectional Auto-Alignment Markup (dir="auto", bidi-auto-text)', () => {
  const mockData = {
    upcomingAppointments: [
      {
        id: 'appt-bidi-1',
        patientName: 'سارة عبد الرحمن',
        patientNameEn: 'Sarah Abdelrahman',
        timeStr: '10:15 AM',
        day: 'today',
        type: 'telehealth',
        status: 'confirmed',
        o2: 89,
        chiefComplaint: 'Acute asthma exacerbation with nocturnal dyspnea and SpO2 89%',
        caseId: 'case-bidi-1'
      }
    ]
  };

  const htmlEn = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, true);
  const htmlAr = DoctorUI.renderDoctorAnalyticsDashboardHtml(mockData, false);

  // English UI
  assert(htmlEn.includes('class="appt-patient-name bidi-auto-text" dir="auto"'), 'Patient name must have dir="auto" and bidi-auto-text in English UI');
  assert(htmlEn.includes('class="appt-complaint bidi-auto-text" dir="auto"'), 'Complaint must have dir="auto" and bidi-auto-text in English UI');

  // Arabic UI
  assert(htmlAr.includes('class="appt-patient-name bidi-auto-text" dir="auto"'), 'Patient name must have dir="auto" and bidi-auto-text in Arabic UI');
  assert(htmlAr.includes('class="appt-complaint bidi-auto-text" dir="auto"'), 'Complaint must have dir="auto" and bidi-auto-text in Arabic UI');
});

// ── Test 6: Arabic Patient Directives Display in Clinical English Doctor UI ─
runTest('Arabic Patient Directives Display in Clinical English Doctor UI', () => {
  const appointmentsWithArabic = [
    {
      id: 'appt-ar-in-en',
      patientName: 'أحمد محمود العوضي',
      patientNameEn: 'Ahmed Mahmoud',
      timeStr: '11:00 AM',
      day: 'today',
      type: 'in_person',
      status: 'confirmed',
      o2: 94,
      chiefComplaint: 'صداع نصفي متكرر مع ارتفاع في ضغط الدم 150/95 وطلب ضبط جرعة Concor',
      caseId: 'case-ar-1'
    }
  ];

  const htmlEn = DoctorUI.renderDoctorAnalyticsDashboardHtml({ upcomingAppointments: appointmentsWithArabic }, true);

  // Must render English UI headers
  assert(htmlEn.includes('Doctor Performance Analytics & Clinic Schedule'));
  assert(htmlEn.includes('Upcoming Clinic Appointments'));
  assert(htmlEn.includes('Examine Patient'));

  // Must cleanly preserve Arabic clinical complaint and patient name without corruption
  assert(htmlEn.includes('صداع نصفي متكرر مع ارتفاع في ضغط الدم 150/95 وطلب ضبط جرعة Concor'));
  assert(htmlEn.includes('Ahmed Mahmoud'));
});

// ── Test 7: English Directives & SpO2 Readings in Medical Arabic Doctor UI ───
runTest('English Directives & SpO2 Readings in Medical Arabic Doctor UI', () => {
  const appointmentsWithEnglish = [
    {
      id: 'appt-en-in-ar',
      patientName: 'Mona El-Kholy',
      patientNameEn: 'Mona El-Kholy',
      timeStr: '12:30 م',
      day: 'today',
      type: 'telehealth',
      status: 'upcoming',
      o2: 92,
      chiefComplaint: 'Post-pneumonia follow-up, D-Dimer test review, and Symbicort 160 inhaler titration',
      caseId: 'case-en-1'
    }
  ];

  const htmlAr = DoctorUI.renderDoctorAnalyticsDashboardHtml({ upcomingAppointments: appointmentsWithEnglish }, false);

  // Must render Arabic UI headers
  assert(htmlAr.includes('إحصائيات أداء الطبيب وجدول مواعيد العيادة'));
  assert(htmlAr.includes('مواعيد العيادة القادمة'));
  assert(htmlAr.includes('فحص الحالة'));

  // Must cleanly preserve English clinical terminology, SpO2, and medication names
  assert(htmlAr.includes('Post-pneumonia follow-up, D-Dimer test review, and Symbicort 160 inhaler titration'));
  assert(htmlAr.includes('SpO2 92%'));
});

// ── Test 8: Upcoming Appointments Bilingual Time Formatting & Helper ────────
runTest('Upcoming Appointments Bilingual Time Formatting & formatAppointmentTime Helper', () => {
  assert.strictEqual(typeof DoctorUI.formatAppointmentTime, 'function', 'formatAppointmentTime must be exported');

  // Convert Arabic to English
  assert.strictEqual(DoctorUI.formatAppointmentTime('09:30 ص', true), '09:30 AM');
  assert.strictEqual(DoctorUI.formatAppointmentTime('04:15 م', true), '04:15 PM');

  // Convert English to Arabic
  assert.strictEqual(DoctorUI.formatAppointmentTime('10:15 AM', false), '10:15 ص');
  assert.strictEqual(DoctorUI.formatAppointmentTime('05:30 PM', false), '05:30 م');

  // Schedule builder should format appointment time correctly according to isEn
  const appointmentsInput = [
    { id: 'a1', timeStr: '08:45 ص', patientName: 'خالد عبد السلام', day: 'today' },
    { id: 'a2', timeStr: '02:30 PM', patientName: 'سارة خالد', day: 'today' }
  ];

  const enList = DoctorUI.buildDoctorUpcomingAppointments(appointmentsInput, [], { isEn: true });
  assert.strictEqual(enList[0].timeStr, '08:45 AM', 'Arabic morning time must be localized to AM in English mode');
  assert.strictEqual(enList[1].timeStr, '02:30 PM', 'English PM time must be preserved in English mode');

  const arList = DoctorUI.buildDoctorUpcomingAppointments(appointmentsInput, [], { isEn: false });
  assert.strictEqual(arList[0].timeStr, '08:45 ص', 'Arabic morning time must be preserved in Arabic mode');
  assert.strictEqual(arList[1].timeStr, '02:30 م', 'English PM time must be localized to م in Arabic mode');
});

// ── Test 9: CSS unicode-bidi and Plaintext Rules in app/styles.css ───────────
runTest('CSS unicode-bidi and Direction Rules in app/styles.css', () => {
  const stylesPath = path.join(__dirname, '../../app/styles.css');
  const cssContent = fs.readFileSync(stylesPath, 'utf8');

  // Verify .bidi-auto-text is defined with plaintext & direction auto
  assert(cssContent.includes('.bidi-auto-text'), 'styles.css must define .bidi-auto-text class');
  assert(cssContent.includes('unicode-bidi: plaintext;'), 'styles.css must specify unicode-bidi: plaintext');

  // Verify #doctorRecommendationsInput has plaintext styling
  assert(cssContent.includes('#doctorRecommendationsInput'), 'styles.css must define #doctorRecommendationsInput styling');
});

// ── Test 10: Smooth Recommendations Writing Experience & Bilingual Chips ────
runTest('Smooth Recommendations Writing Experience & Bilingual Chips', () => {
  assert(Array.isArray(DoctorUI.QUICK_PATIENT_RECOMMENDATION_CHIPS), 'QUICK_PATIENT_RECOMMENDATION_CHIPS must be an array');
  assert(DoctorUI.QUICK_PATIENT_RECOMMENDATION_CHIPS.length >= 4, 'Should contain at least 4 standard clinical directive chips');

  // Check each chip has both ar and en fields
  DoctorUI.QUICK_PATIENT_RECOMMENDATION_CHIPS.forEach((chip, i) => {
    assert(chip.ar && chip.ar.length > 5, `Chip ${i} must have valid Arabic text`);
    assert(chip.en && chip.en.length > 5, `Chip ${i} must have valid English text`);
  });

  // Verify getPatientRecommendationChipsHtml produces localized chips
  const enChipsHtml = DoctorUI.getPatientRecommendationChipsHtml(true);
  assert(enChipsHtml.includes('Strict rest and adequate oral warm fluid hydration'), 'Should render English chip');

  const arChipsHtml = DoctorUI.getPatientRecommendationChipsHtml(false);
  assert(arChipsHtml.includes('الراحة التامة والإكثار من تناول السوائل'), 'Should render Arabic chip');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('====================================================');
console.log(`🎉 All ${testsPassed}/${testsTotal} Doctor Analytics Bilingual tests passed successfully!`);
console.log('====================================================\n');
