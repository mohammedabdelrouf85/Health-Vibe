/**
 * Health Vibe AI - Admin Usage & Conversion Analytics Test Suite (Doctolib Benchmark)
 *
 * Verifies:
 * 1. Telemetry Event Types: Usage & conversion event constants present in EVENT_TYPES.
 * 2. Zero-PHI Safety: Payload sanitizer protects sensitive medical data while preserving telemetry metadata.
 * 3. Analytics Service (Backend): calculateUsageConversionKpis computes:
 *    - Registered patients count and additions
 *    - Completed assessments and triage priority distribution
 *    - Doctor average review turnaround time and SLA compliance (< 30 min)
 *    - Conversion rate to appointment booking, dossier lift (+34%), and consultation modality
 *    - 5-Stage multi-touch conversion funnel (Registered -> Started -> Completed -> Reviewed -> Booked)
 *    - Doctor performance leaderboard
 *    - Graceful "Unavailable" / "غير متاح" fallback on empty telemetry data
 *    - Clinic and time range filtering
 * 4. Client AdminService: calculateUsageConversionKpis parity across cases, appointments, and users.
 * 5. Server Endpoints: GET /api/admin/usage-conversion/analytics and /api/admin/metrics integration.
 * 6. HTML DOM Contract: All metric IDs and elements exist in both admin-view.html and index.html.
 * 7. Bidi Isolation: All SLA and ratio targets use <bdi class="bidi-isolate">.
 * 8. i18n Translation Parity: Complete Arabic and English catalog keys.
 * 9. Frontend Handlers in app.js: Exposure of render, refresh, filtering, and CSV export.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const analyticsService = require('../backend/analytics-service');
const AdminService = require('../app/modules/admin/admin-service');

console.log('==================================================================');
console.log('📈 DOCTOLIB USAGE & CONVERSION ANALYTICS: TEST SUITE');
console.log('   Registered Patients, Completed Triage, Doctor Review Time & Booking Conversion');
console.log('==================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

(async () => {
  // ----------------------------------------------------------------
  // 1. TELEMETRY EVENT TYPES
  // ----------------------------------------------------------------
  console.log('--- 1. Telemetry Event Constants ---');

  runTest('1.1: EVENT_TYPES includes usage and conversion constants', () => {
    assert.strictEqual(analyticsService.EVENT_TYPES.SIGNUP, 'signup');
    assert.strictEqual(analyticsService.EVENT_TYPES.ASSESSMENT_START, 'assessment_start');
    assert.strictEqual(analyticsService.EVENT_TYPES.ASSESSMENT_COMPLETE, 'assessment_complete');
    assert.strictEqual(analyticsService.EVENT_TYPES.DOCTOR_REVIEW, 'doctor_review');
    assert.strictEqual(analyticsService.EVENT_TYPES.APPOINTMENT_BOOK_SUCCESS, 'appointment_book_success');
    assert.strictEqual(analyticsService.EVENT_TYPES.PATIENT_REGISTERED, 'patient_registered');
    assert.strictEqual(analyticsService.EVENT_TYPES.CONVERSION_FUNNEL_ADVANCED, 'conversion_funnel_advanced');
    assert.strictEqual(analyticsService.EVENT_TYPES.BOOKING_CONVERTED_FROM_ASSESSMENT, 'booking_converted_from_assessment');
    assert.strictEqual(analyticsService.EVENT_TYPES.USAGE_ANALYTICS_VIEWED, 'usage_analytics_viewed');
  });

  // ----------------------------------------------------------------
  // 2. ZERO-PHI SAFETY IN TELEMETRY
  // ----------------------------------------------------------------
  console.log('\n--- 2. Zero-PHI Safety & Sanitization ---');

  runTest('2.1: Strictly blocks forbidden medical text while preserving operational telemetry metrics', () => {
    // 1. Clinical fields MUST throw MEDICAL_TEXT_PROHIBITED
    assert.throws(() => {
      analyticsService.sanitizeAndValidatePayload(
        analyticsService.EVENT_TYPES.DOCTOR_REVIEW,
        {
          doctorId: 'doc_cairo_1',
          clinicId: 'clinic_dokki',
          diagnosis: 'Severe acute bacterial pneumonia'
        }
      );
    }, /MEDICAL_TEXT_PROHIBITED/, 'Clinical diagnosis must be blocked');

    assert.throws(() => {
      analyticsService.sanitizeAndValidatePayload(
        analyticsService.EVENT_TYPES.ASSESSMENT_COMPLETE,
        {
          clinicId: 'clinic_dokki',
          clinicalNotes: 'Patient experiencing severe wheezing and rhonchi'
        }
      );
    }, /MEDICAL_TEXT_PROHIBITED/, 'Clinical notes must be blocked');

    // 2. Operational telemetry payload passes cleanly
    const operationalPayload = {
      doctorId: 'doc_cairo_1',
      clinicId: 'clinic_dokki',
      consultationType: 'video',
      dossierAttached: true,
      stage: 'reviewed',
      funnelStep: 4,
      responseTimeMs: 900000 // 15 mins
    };

    const sanitized = analyticsService.sanitizeAndValidatePayload(
      analyticsService.EVENT_TYPES.DOCTOR_REVIEW,
      operationalPayload
    );

    assert.ok(sanitized.cleanPayload);
    assert.strictEqual(sanitized.cleanPayload.doctorId, 'doc_cairo_1');
    assert.strictEqual(sanitized.cleanPayload.clinicId, 'clinic_dokki');
    assert.strictEqual(sanitized.cleanPayload.consultationType, 'video');
    assert.strictEqual(sanitized.cleanPayload.dossierAttached, true);
    assert.strictEqual(sanitized.cleanPayload.funnelStep, 4);
    assert.strictEqual(sanitized.cleanPayload.responseTimeMs, 900000);
  });

  // ----------------------------------------------------------------
  // 3. BACKEND ANALYTICS CALCULATION
  // ----------------------------------------------------------------
  console.log('\n--- 3. Backend calculateUsageConversionKpis ---');

  runTest('3.1: Computes registered patients, assessments, review times, conversion rate, and funnel', () => {
    const now = Date.now();
    const mockEvents = [
      // 4 signups
      { eventType: 'signup', userId: 'usr_1', timestamp: now - 3600000 },
      { eventType: 'signup', userId: 'usr_2', timestamp: now - 3000000 },
      { eventType: 'signup', userId: 'usr_3', timestamp: now - 2500000 },
      { eventType: 'patient_registered', userId: 'usr_4', timestamp: now - 2000000 },

      // 3 assessment starts
      { eventType: 'assessment_start', userId: 'usr_1', timestamp: now - 1800000 },
      { eventType: 'assessment_start', userId: 'usr_2', timestamp: now - 1700000 },
      { eventType: 'assessment_start', userId: 'usr_3', timestamp: now - 1600000 },

      // 3 assessment completes
      { eventType: 'assessment_complete', userId: 'usr_1', timestamp: now - 1500000, payload: { caseId: 'case_1', oxygenLevel: 88, priority: 'urgent' } },
      { eventType: 'assessment_complete', userId: 'usr_2', timestamp: now - 1400000, payload: { caseId: 'case_2', oxygenLevel: 91, priority: 'high' } },
      { eventType: 'assessment_complete', userId: 'usr_3', timestamp: now - 1300000, payload: { caseId: 'case_3', oxygenLevel: 96, priority: 'normal' } },

      // 2 doctor reviews (case 1 took 10 mins = 600,000ms, case 2 took 20 mins = 1,200,000ms)
      {
        eventType: 'doctor_review',
        userId: 'usr_1',
        timestamp: now - 900000,
        payload: { caseId: 'case_1', doctorId: 'doc_1', doctorName: 'د. أحمد سمير', clinicName: 'عيادة الدقي', responseTimeMs: 600000, priority: 'urgent' }
      },
      {
        eventType: 'doctor_review',
        userId: 'usr_2',
        timestamp: now - 200000,
        payload: { caseId: 'case_2', doctorId: 'doc_2', doctorName: 'د. منى محمود', clinicName: 'عيادة المهندسين', responseTimeMs: 1200000, priority: 'high' }
      },

      // 2 appointment bookings converted (1 telehealth with dossier, 1 in-clinic)
      {
        eventType: 'appointment_book_success',
        userId: 'usr_1',
        timestamp: now - 100000,
        payload: { doctorId: 'doc_1', consultationType: 'video', isOnlineConsultation: true, dossierAttached: true, linkedCaseId: 'case_1' }
      },
      {
        eventType: 'appointment_book_success',
        userId: 'usr_2',
        timestamp: now - 50000,
        payload: { doctorId: 'doc_2', consultationType: 'clinic', isOnlineConsultation: false, dossierAttached: false }
      }
    ];

    const result = analyticsService.calculateUsageConversionKpis(mockEvents, { isEn: false });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.benchmark, 'Doctolib');

    // 1. Registered Patients
    assert.strictEqual(result.registeredPatients.total, 4);
    assert.strictEqual(result.registeredPatients.today, 4);

    // 2. Completed Assessments
    assert.strictEqual(result.completedAssessments.started, 3);
    assert.strictEqual(result.completedAssessments.completed, 3);
    assert.strictEqual(result.completedAssessments.completionRate, 100);
    assert.strictEqual(result.completedAssessments.breakdown.urgent, 1);
    assert.strictEqual(result.completedAssessments.breakdown.high, 1);
    assert.strictEqual(result.completedAssessments.breakdown.normal, 1);

    // 3. Doctor Review Time (10m and 20m -> avg = 15m)
    assert.strictEqual(result.doctorReviewTime.avgMinutes, 15);
    assert.strictEqual(result.doctorReviewTime.medianMinutes, 20);
    assert.strictEqual(result.doctorReviewTime.urgentAvgMinutes, 10);
    assert.strictEqual(result.doctorReviewTime.slaComplianceRate, 100); // Both under 30m
    assert.strictEqual(result.doctorReviewTime.slaStatus, 'optimal');
    assert.strictEqual(result.doctorReviewTime.display, '15 دقيقة');

    // 4. Booking Conversion Rate (2 bookings / 3 completed = 66.7%)
    assert.strictEqual(result.conversion.totalBookingsConverted, 2);
    assert.strictEqual(result.conversion.conversionRate, 66.7);
    assert.strictEqual(result.conversion.dossierAttachedBookings, 1);
    assert.strictEqual(result.conversion.dossierAttachmentRate, 50);
    assert.strictEqual(result.conversion.modality.telehealth, 1);
    assert.strictEqual(result.conversion.modality.inClinic, 1);

    // 5. Funnel Steps
    assert.strictEqual(result.funnel.length, 5);
    assert.strictEqual(result.funnel[0].count, 4); // Registered
    assert.strictEqual(result.funnel[1].count, 3); // Started (75%)
    assert.strictEqual(result.funnel[2].count, 3); // Completed (100% of starts)
    assert.strictEqual(result.funnel[3].count, 2); // Reviewed
    assert.strictEqual(result.funnel[4].count, 2); // Booked (100% of reviews, 66.7% of completed)

    // 6. Doctor Leaderboard
    assert.strictEqual(result.doctorLeaderboard.length, 2);
    assert.strictEqual(result.doctorLeaderboard[0].doctorId, 'doc_1');
    assert.strictEqual(result.doctorLeaderboard[0].avgReviewTimeMinutes, 10);
    assert.strictEqual(result.doctorLeaderboard[0].convertedBookings, 1);
  });

  runTest('3.2: Handles empty telemetry events gracefully with "Unavailable" / "غير متاح"', () => {
    const emptyResultAr = analyticsService.calculateUsageConversionKpis([], { isEn: false });
    assert.strictEqual(emptyResultAr.success, true);
    assert.strictEqual(emptyResultAr.registeredPatients.total, 0);
    assert.strictEqual(emptyResultAr.completedAssessments.completionRate, null);
    assert.strictEqual(emptyResultAr.completedAssessments.completionRateDisplay, 'غير متاح');
    assert.strictEqual(emptyResultAr.doctorReviewTime.avgMinutes, null);
    assert.strictEqual(emptyResultAr.doctorReviewTime.display, 'غير متاح');
    assert.strictEqual(emptyResultAr.conversion.conversionRate, null);
    assert.strictEqual(emptyResultAr.conversion.conversionRateDisplay, 'غير متاح');

    const emptyResultEn = analyticsService.calculateUsageConversionKpis([], { isEn: true });
    assert.strictEqual(emptyResultEn.completedAssessments.completionRateDisplay, 'Unavailable');
    assert.strictEqual(emptyResultEn.doctorReviewTime.display, 'Unavailable');
    assert.strictEqual(emptyResultEn.conversion.conversionRateDisplay, 'Unavailable');
  });

  runTest('3.3: Filters accurately by clinicId and date range', () => {
    const now = Date.now();
    const events = [
      { eventType: 'signup', userId: 'u_cairo', clinicId: 'cairo_branch', timestamp: now - 1000 },
      { eventType: 'signup', userId: 'u_alex', clinicId: 'alex_branch', timestamp: now - 1000 },
      { eventType: 'assessment_complete', userId: 'u_cairo', clinicId: 'cairo_branch', timestamp: now - 800, payload: { caseId: 'c1' } },
      { eventType: 'assessment_complete', userId: 'u_alex', clinicId: 'alex_branch', timestamp: now - 800, payload: { caseId: 'c2' } }
    ];

    const cairoResult = analyticsService.calculateUsageConversionKpis(events, { clinicId: 'cairo_branch' });
    assert.strictEqual(cairoResult.registeredPatients.total, 1);
    assert.strictEqual(cairoResult.completedAssessments.completed, 1);

    const alexResult = analyticsService.calculateUsageConversionKpis(events, { clinicId: 'alex_branch' });
    assert.strictEqual(alexResult.registeredPatients.total, 1);
    assert.strictEqual(alexResult.completedAssessments.completed, 1);
  });

  // ----------------------------------------------------------------
  // 4. CLIENT ADMINSERVICE PARITY
  // ----------------------------------------------------------------
  console.log('\n--- 4. Client AdminService Parity ---');

  runTest('4.1: AdminService.calculateUsageConversionKpis computes metrics from cases, appointments, and users', () => {
    const mockCases = [
      { id: 'c1', status: 'approved', submittedAt: Date.now() - 3600000, doctorApprovedAt: Date.now() - 2400000, oxygenLevel: 88, doctorId: 'doc_1' }, // 20m
      { id: 'c2', status: 'approved', submittedAt: Date.now() - 3600000, doctorApprovedAt: Date.now() - 1800000, oxygenLevel: 95, doctorId: 'doc_1' }, // 30m
      { id: 'c3', status: 'pending', submittedAt: Date.now() - 1000000, oxygenLevel: 94 }
    ];

    const mockAppointments = [
      { id: 'a1', status: 'confirmed', linkedCaseId: 'c1', doctorId: 'doc_1', consultationType: 'video' },
      { id: 'a2', status: 'cancelled' }
    ];

    const mockUsers = [
      { id: 'u1', createdAt: Date.now() - 5000000 },
      { id: 'u2', createdAt: Date.now() - 4000000 }
    ];

    const result = AdminService.calculateUsageConversionKpis(mockCases, mockAppointments, mockUsers, { isEn: false });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.registeredPatients.total, 2);
    assert.strictEqual(result.completedAssessments.started, 3);
    assert.strictEqual(result.completedAssessments.completed, 2);
    assert.strictEqual(result.completedAssessments.completionRate, 67); // 2 of 3
    assert.strictEqual(result.doctorReviewTime.avgMinutes, 25); // (20 + 30)/2 = 25m
    assert.strictEqual(result.doctorReviewTime.slaComplianceRate, 100);
    assert.strictEqual(result.conversion.totalBookingsConverted, 1);
    assert.strictEqual(result.conversion.conversionRate, 50); // 1 booking / 2 completed
    assert.strictEqual(result.conversion.dossierAttachedBookings, 1);
  });

  // ----------------------------------------------------------------
  // 5. SERVER ENDPOINTS & RBAC GUARDS
  // ----------------------------------------------------------------
  console.log('\n--- 5. Server Endpoints & Integration ---');

  runTest('5.1: server.js exports GET /api/admin/usage-conversion/analytics and includes usageConversionAnalytics in /api/admin/metrics', () => {
    const serverPath = path.resolve(__dirname, '../backend/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    assert.ok(serverCode.includes('/api/admin/usage-conversion/analytics'), 'server.js missing GET /api/admin/usage-conversion/analytics');
    assert.ok(serverCode.includes('usageConversionAnalytics: usageConvAnalytics'), 'server.js /api/admin/metrics missing usageConversionAnalytics payload');
    assert.ok(serverCode.includes('requireAdmin'), 'Usage conversion endpoint must require admin authorization');
  });

  // ----------------------------------------------------------------
  // 6. HTML CONTRACT (admin-view.html & index.html)
  // ----------------------------------------------------------------
  console.log('\n--- 6. HTML Contract Parity ---');

  runTest('6.1: admin-view.html and index.html contain all required metric IDs and table containers', () => {
    const adminViewPath = path.resolve(__dirname, '../app/modules/admin/admin-view.html');
    const indexHtmlPath = path.resolve(__dirname, '../app/index.html');

    const adminViewContent = fs.readFileSync(adminViewPath, 'utf8');
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

    const requiredIds = [
      'adminUsageConversionAnalyticsPanel',
      'adminUsageHealthBadge',
      'adminUsageLastRefreshed',
      'btnRefreshUsageConversion',
      'btnExportUsageConversionCsv',
      'adminUsageClinicFilter',
      'adminUsageModeFilter',
      'adminUsageTableSearch',
      'usageTimeFilterGroup',
      'adminUsageHeroGrid',
      'cardUsageRegistered',
      'adminUsageRegisteredPatientsCount',
      'adminUsageRegisteredTodayBadge',
      'cardUsageAssessments',
      'adminUsageCompletedAssessmentsCount',
      'adminUsageCompletionRateBadge',
      'cardUsageReviewTime',
      'adminUsageAvgDoctorReviewTime',
      'adminUsageReviewSlaBadge',
      'cardUsageConversion',
      'adminUsageConversionRate',
      'adminUsageTotalBookingsBadge',
      'adminUsageDossierLiftBadge',
      'adminUsageFunnelContainer',
      'adminUsageFunnelStep1Count',
      'adminUsageFunnelStep2Count',
      'adminUsageFunnelStep3Count',
      'adminUsageFunnelStep4Count',
      'adminUsageFunnelStep5Count',
      'adminUsageDoctorLeaderboardTable',
      'adminUsageDoctorLeaderboardTbody',
      'adminUsageDoctorCountBadge',
      'adminUsagePatientJourneyTable',
      'adminUsagePatientJourneyTbody',
      'adminUsagePatientCountBadge'
    ];

    requiredIds.forEach(id => {
      assert.ok(adminViewContent.includes(`id="${id}"`), `admin-view.html missing #${id}`);
      assert.ok(indexHtmlContent.includes(`id="${id}"`), `index.html missing #${id}`);
    });
  });

  // ----------------------------------------------------------------
  // 7. BIDI ISOLATION & TEXT RENDERING
  // ----------------------------------------------------------------
  console.log('\n--- 7. BiDi Isolation & Typography ---');

  runTest('7.1: admin-view.html and index.html isolate mixed-direction metrics using <bdi class="bidi-isolate">', () => {
    const adminViewContent = fs.readFileSync(path.resolve(__dirname, '../app/modules/admin/admin-view.html'), 'utf8');
    const indexHtmlContent = fs.readFileSync(path.resolve(__dirname, '../app/index.html'), 'utf8');

    for (const [name, content] of [['admin-view.html', adminViewContent], ['index.html', indexHtmlContent]]) {
      assert.ok(content.includes('<bdi class="bidi-isolate">--%</bdi>'), `${name} missing isolated --%`);
      assert.ok(content.includes('<bdi class="bidi-isolate">&lt; 30 دقيقة</bdi>'), `${name} missing isolated < 30 minutes`);
    }
  });

  // ----------------------------------------------------------------
  // 8. BILINGUAL I18N PARITY
  // ----------------------------------------------------------------
  console.log('\n--- 8. Bilingual i18n Translation Parity ---');

  runTest('8.1: Both ar and en catalogs in i18n.js contain complete usageConversion keys', () => {
    const i18nContent = fs.readFileSync(path.resolve(__dirname, '../app/i18n.js'), 'utf8');

    const expectedKeys = [
      'usageConversionTitle',
      'usageConversionSubtitle',
      'registeredPatientsTitle',
      'completedAssessmentsTitle',
      'doctorReviewTimeTitle',
      'bookingConversionRateTitle',
      'conversionFunnelTitle',
      'funnelStageRegistered',
      'funnelStageStarted',
      'funnelStageCompleted',
      'funnelStageReviewed',
      'funnelStageBooked',
      'doctorConversionLeaderboardTitle',
      'patientJourneyLogTitle',
      'dossierConversionLift',
      'filterAllTime',
      'filterToday',
      'filter7Days',
      'filter30Days',
      'filterClinicAll',
      'filterModeAll',
      'filterModeClinic',
      'filterModeVideo',
      'exportCsvBtn',
      'refreshAnalyticsBtn'
    ];

    expectedKeys.forEach(key => {
      // Must appear at least twice (in ar and in en)
      const matches = (i18nContent.match(new RegExp(`${key}:`, 'g')) || []).length;
      assert.ok(matches >= 2, `i18n.js missing translation key: ${key} (found ${matches} occurrences)`);
    });
  });

  // ----------------------------------------------------------------
  // 9. APP.JS CLIENT-SIDE LOGIC & HANDLERS
  // ----------------------------------------------------------------
  console.log('\n--- 9. App.js Client-Side Logic & Export Handlers ---');

  runTest('9.1: app.js contains renderAdminUsageConversionAnalytics and wires up filters and export', () => {
    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');

    assert.ok(appJsContent.includes('async function renderAdminUsageConversionAnalytics'), 'app.js missing renderAdminUsageConversionAnalytics');
    assert.ok(appJsContent.includes('window.renderAdminUsageConversionAnalytics = renderAdminUsageConversionAnalytics'), 'app.js must expose window.renderAdminUsageConversionAnalytics');
    assert.ok(appJsContent.includes('window.refreshAdminUsageConversionAnalytics = async function'), 'app.js must expose window.refreshAdminUsageConversionAnalytics');
    assert.ok(appJsContent.includes('window.setUsageConversionTimeFilter = async function'), 'app.js must expose window.setUsageConversionTimeFilter');
    assert.ok(appJsContent.includes('window.setUsageConversionClinicFilter = async function'), 'app.js must expose window.setUsageConversionClinicFilter');
    assert.ok(appJsContent.includes('window.setUsageConversionModeFilter = async function'), 'app.js must expose window.setUsageConversionModeFilter');
    assert.ok(appJsContent.includes('window.filterUsageConversionTables = function'), 'app.js must expose window.filterUsageConversionTables');
    assert.ok(appJsContent.includes('window.exportAdminUsageConversionCsv = function'), 'app.js must expose window.exportAdminUsageConversionCsv');
    assert.ok(appJsContent.includes('await renderAdminUsageConversionAnalytics(serverMetrics?.usageConversionAnalytics)'), 'renderAdminMetrics must invoke renderAdminUsageConversionAnalytics');
  });

  // ----------------------------------------------------------------
  // 10. CSS STYLES INTEGRATION
  // ----------------------------------------------------------------
  console.log('\n--- 10. Scoped Admin CSS & Responsive Breakpoints ---');

  runTest('10.1: admin.css includes styled hero cards, conversion funnel, and table rules', () => {
    const adminCssContent = fs.readFileSync(path.resolve(__dirname, '../app/modules/admin/admin.css'), 'utf8');

    assert.ok(adminCssContent.includes('#adminUsageConversionAnalyticsPanel'), 'admin.css missing panel container ID');
    assert.ok(adminCssContent.includes('.usage-hero-grid'), 'admin.css missing .usage-hero-grid');
    assert.ok(adminCssContent.includes('.usage-kpi-card'), 'admin.css missing .usage-kpi-card');
    assert.ok(adminCssContent.includes('.usage-funnel-container'), 'admin.css missing .usage-funnel-container');
    assert.ok(adminCssContent.includes('.funnel-step'), 'admin.css missing .funnel-step');
    assert.ok(adminCssContent.includes('.usage-filter-toolbar'), 'admin.css missing .usage-filter-toolbar');
  });

  console.log('\n==================================================================');
  console.log(`🎉 ALL TESTS COMPLETED: ${passedCount}/${passedCount + failedCount} PASSED`);
  if (failedCount > 0) {
    console.error(`❌ ${failedCount} TESTS FAILED`);
    process.exit(1);
  } else {
    console.log('🌟 100% SUCCESS: Doctolib Usage & Conversion Analytics Verified!');
    console.log('==================================================================\n');
  }
})();
