/**
 * 🧪 DOCTOR SCHEDULE MANAGER: ANALYTICS & LOGGING TEST SUITE
 * 
 * Verifies Telemetry Tracking, Operational Metrics, Zero PHI Enforcement,
 * Admin Dashboard KPI Calculations, and Bilingual Reporting for Doctor Schedules (TabeebHub Standard).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const analyticsService = require('../backend/analytics-service');
const schedulingService = require('../backend/scheduling-service');
const adminService = require('../app/modules/admin/admin-service');
const { translations } = require('../app/i18n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

async function runSuite() {
  console.log('==================================================================');
  console.log('🧪 DOCTOR SCHEDULE MANAGER: ANALYTICS & LOGGING SUITE');
  console.log('   Telemetry Tracking, Operational KPIs & Zero-PHI Governance');
  console.log('==================================================================\n');

  console.log('--- 1. Telemetry Event Types & Contract Integrity ---');

  await runTest('analyticsService and adminService define all doctor schedule event types', () => {
    const requiredTypes = [
      'DOCTOR_SCHEDULE_UPDATED',
      'DOCTOR_LEAVE_REQUESTED',
      'DOCTOR_LEAVE_CANCELLED',
      'DOCTOR_SCHEDULE_VIEWED',
      'DOCTOR_SLOTS_ACCESSED'
    ];

    requiredTypes.forEach(typeKey => {
      assert.ok(analyticsService.EVENT_TYPES[typeKey], `analyticsService missing EVENT_TYPES.${typeKey}`);
      assert.ok(adminService.APPOINTMENT_EVENT_TYPES[typeKey], `adminService missing APPOINTMENT_EVENT_TYPES.${typeKey}`);
      assert.strictEqual(
        analyticsService.EVENT_TYPES[typeKey],
        adminService.APPOINTMENT_EVENT_TYPES[typeKey],
        `Value mismatch for ${typeKey}`
      );
    });
  });

  console.log('\n--- 2. Zero-PHI Telemetry Sanitization & Governance ---');

  await runTest('Sanitizes operational doctor schedule metadata safely', () => {
    const validPayload = {
      doctorId: 'dr_tarek_01',
      branchId: 'giza_dokki',
      slotDurationMinutes: 25,
      bufferBetweenSlotsMinutes: 5,
      workingDaysCount: 5,
      conflictingAppointmentsCount: 2,
      reasonType: 'vacation',
      isPrivileged: true,
      actorUid: 'admin_audit_01'
    };

    const sanitized = analyticsService.sanitizeAndValidatePayload(
      analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
      validPayload
    );

    assert.strictEqual(sanitized.ok, true);
    assert.strictEqual(sanitized.cleanPayload.doctorId, 'dr_tarek_01');
    assert.strictEqual(sanitized.cleanPayload.branchId, 'giza_dokki');
    assert.strictEqual(sanitized.cleanPayload.slotDurationMinutes, 25);
    assert.strictEqual(sanitized.cleanPayload.conflictingAppointmentsCount, 2);
    assert.strictEqual(sanitized.cleanPayload.reasonType, 'vacation');
  });

  await runTest('Strictly blocks and throws on prohibited clinical/medical keys in schedule telemetry', () => {
    const forbiddenPayloads = [
      { branchId: 'cairo_maadi', symptoms: 'Severe acute cough with dyspnea' },
      { branchId: 'giza_dokki', diagnosis: 'Pneumonia suspected' },
      { branchId: 'cairo_nasr_city', prescription: 'Amoxicillin 500mg' },
      { branchId: 'alex_smouha', chiefComplaint: 'Chest tightness for 3 days' },
      { branchId: 'cairo_maadi', clinicalNotes: 'Patient underwent respiratory triage' },
      { branchId: 'giza_dokki', spo2: 92 }
    ];

    forbiddenPayloads.forEach((badPayload, idx) => {
      assert.throws(
        () => {
          analyticsService.sanitizeAndValidatePayload(
            analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
            badPayload
          );
        },
        /MEDICAL_TEXT_PROHIBITED/,
        `Payload index ${idx} with PHI should have thrown MEDICAL_TEXT_PROHIBITED`
      );
    });
  });

  console.log('\n--- 3. Operational KPI Calculations (Backend Analytics Service) ---');

  await runTest('calculateAppointmentKpis accurately derives schedule and branch metrics', () => {
    const syntheticEvents = [
      // Dokki branch update (20m duration)
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
        payload: {
          doctorId: 'dr_01',
          branchId: 'giza_dokki',
          slotDurationMinutes: 20
        }
      },
      // Nasr City branch update (30m duration)
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
        payload: {
          doctorId: 'dr_02',
          branchId: 'cairo_nasr_city',
          slotDurationMinutes: 30
        }
      },
      // Maadi branch update (40m duration)
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED,
        payload: {
          doctorId: 'dr_03',
          branchId: 'cairo_maadi',
          slotDurationMinutes: 40
        }
      },
      // Emergency leave with 3 conflicting appointments
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_LEAVE_REQUESTED,
        payload: {
          doctorId: 'dr_01',
          branchId: 'giza_dokki',
          reasonType: 'medical_emergency',
          conflictingAppointmentsCount: 3
        }
      },
      // Another leave with 0 conflicts
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_LEAVE_REQUESTED,
        payload: {
          doctorId: 'dr_02',
          branchId: 'all',
          reasonType: 'conference',
          conflictingAppointmentsCount: 0
        }
      },
      // Leave cancellation
      {
        eventType: analyticsService.EVENT_TYPES.DOCTOR_LEAVE_CANCELLED,
        payload: {
          doctorId: 'dr_01',
          branchId: 'giza_dokki'
        }
      }
    ];

    const kpis = analyticsService.calculateAppointmentKpis(syntheticEvents, { isEn: true });

    assert.strictEqual(kpis.scheduleUpdateCount, 3, 'Should count 3 schedule updates');
    assert.strictEqual(kpis.leaveRequestsCount, 2, 'Should count 2 leave requests');
    assert.strictEqual(kpis.leaveCancellationsCount, 1, 'Should count 1 leave cancellation');

    // Average duration: (20 + 30 + 40) / 3 = 30 minutes
    assert.strictEqual(kpis.averageSlotDurationMinutes, 30, 'Average slot duration should be 30m');

    // Conflicted bookings count: 3 + 0 = 3
    assert.strictEqual(kpis.totalConflictedBookings, 3, 'Total conflicted bookings should be 3');

    // 3 branches configured (Dokki, Nasr City, Maadi) out of 4 -> 75%
    assert.strictEqual(kpis.branchCoverageRate, 75.0, 'Branch coverage rate should be 75%');
    assert.strictEqual(kpis.branchScheduleBreakdown.giza_dokki, 1);
    assert.strictEqual(kpis.branchScheduleBreakdown.cairo_nasr_city, 1);
    assert.strictEqual(kpis.branchScheduleBreakdown.cairo_maadi, 1);
    assert.strictEqual(kpis.branchScheduleBreakdown.alex_smouha, 0);

    // Summary block verification
    assert.strictEqual(kpis.summary.scheduleUpdateCount, 3);
    assert.strictEqual(kpis.summary.leaveRequestsCount, 2);
    assert.strictEqual(kpis.summary.averageSlotDurationMinutes, 30);
    assert.strictEqual(kpis.summary.branchCoverageRate, 75.0);
  });

  console.log('\n--- 4. Client Admin Service KPI Mirroring & Localized Formatting ---');

  await runTest('adminService.calculateAppointmentKpis computes metrics and localized displays', () => {
    const events = [
      { type: 'doctor_schedule_updated', payload: { branchId: 'giza_dokki', slotDurationMinutes: 20 } },
      { type: 'doctor_schedule_updated', payload: { branchId: 'alex_smouha', slotDurationMinutes: 30 } },
      { type: 'doctor_leave_requested', payload: { branchId: 'giza_dokki', conflictingAppointmentsCount: 1 } }
    ];

    // English localization
    const enKpis = adminService.calculateAppointmentKpis([], { events, isEn: true });
    assert.strictEqual(enKpis.scheduleUpdateCount, 2);
    assert.strictEqual(enKpis.leaveRequestsCount, 1);
    assert.strictEqual(enKpis.averageSlotDurationMinutes, 25);
    assert.strictEqual(enKpis.averageSlotDurationDisplay, '25 mins avg');
    assert.strictEqual(enKpis.branchCoverageRate, 50.0);
    assert.strictEqual(enKpis.branchCoverageDisplay, '50% branches active');

    // Arabic localization
    const arKpis = adminService.calculateAppointmentKpis([], { events, isEn: false });
    assert.strictEqual(arKpis.scheduleUpdateCount, 2);
    assert.strictEqual(arKpis.leaveRequestsCount, 1);
    assert.strictEqual(arKpis.averageSlotDurationMinutes, 25);
    assert.strictEqual(arKpis.averageSlotDurationDisplay, '25 دقيقة متوسط');
    assert.strictEqual(arKpis.branchCoverageRate, 50.0);
    assert.strictEqual(arKpis.branchCoverageDisplay, '50% فروع نشطة');
  });

  console.log('\n--- 5. Database Analytics Integration (schedulingService.getAppointmentAnalytics) ---');

  await runTest('schedulingService.getAppointmentAnalytics forwards schedule metrics into summary and dbSummary', async () => {
    const mockDb = {
      collection: (colName) => ({
        get: async () => ({
          docs: [
            { id: 'appt_1', data: () => ({ status: 'confirmed', consultationType: 'clinic', clinicId: 'cairo_nasr_city' }) },
            { id: 'appt_2', data: () => ({ status: 'completed', consultationType: 'video', isOnlineConsultation: true }) }
          ]
        })
      })
    };

    const events = [
      { eventType: analyticsService.EVENT_TYPES.DOCTOR_SCHEDULE_UPDATED, payload: { branchId: 'all', slotDurationMinutes: 30 } },
      { eventType: analyticsService.EVENT_TYPES.DOCTOR_LEAVE_REQUESTED, payload: { branchId: 'giza_dokki', conflictingAppointmentsCount: 1 } }
    ];

    const analytics = await schedulingService.getAppointmentAnalytics(mockDb, { events });

    assert.strictEqual(analytics.success, true);
    assert.ok(analytics.summary.scheduleUpdateCount !== undefined, 'summary should include scheduleUpdateCount');
    assert.strictEqual(analytics.summary.scheduleUpdateCount, 1);
    assert.strictEqual(analytics.summary.leaveRequestsCount, 1);
    assert.strictEqual(analytics.summary.averageSlotDurationMinutes, 30);
    assert.strictEqual(analytics.dbSummary.scheduleUpdateCount, 1);
    assert.strictEqual(analytics.dbSummary.leaveRequestsCount, 1);
  });

  console.log('\n--- 6. UI Contract: Admin Dashboard HTML Parity ---');

  await runTest('admin-view.html and index.html include Doctor Schedule KPI elements and i18n hooks', () => {
    const adminViewPath = path.join(__dirname, '../app/modules/admin/admin-view.html');
    const indexPath = path.join(__dirname, '../app/index.html');

    const adminViewContent = fs.readFileSync(adminViewPath, 'utf8');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    const requiredIds = [
      'adminDoctorScheduleUpdatesCount',
      'adminDoctorAvgDuration',
      'adminDoctorLeavesCount',
      'adminDoctorBranchCoverage'
    ];

    const requiredI18nKeys = [
      'doctorSchedule.scheduleUpdatesTitle',
      'doctorSchedule.leaveRequestsTitle'
    ];

    requiredIds.forEach(id => {
      assert.ok(adminViewContent.includes(`id="${id}"`), `admin-view.html missing #${id}`);
      assert.ok(indexContent.includes(`id="${id}"`), `index.html missing #${id}`);
    });

    requiredI18nKeys.forEach(key => {
      assert.ok(adminViewContent.includes(`data-i18n="${key}"`), `admin-view.html missing data-i18n="${key}"`);
      assert.ok(indexContent.includes(`data-i18n="${key}"`), `index.html missing data-i18n="${key}"`);
    });
  });

  console.log('\n--- 7. Bilingual Parity & i18n Completeness ---');

  await runTest('Arabic and English catalogs have complete parity for doctorSchedule analytics keys', () => {
    const arKeys = Object.keys(translations.ar.doctorSchedule || {});
    const enKeys = Object.keys(translations.en.doctorSchedule || {});

    const expectedAnalyticsKeys = [
      'scheduleUpdatesTitle',
      'leaveRequestsTitle',
      'avgSlotDurationTitle',
      'branchCoverageTitle',
      'branchScheduleBreakdownTitle'
    ];

    expectedAnalyticsKeys.forEach(k => {
      assert.ok(arKeys.includes(k), `Arabic doctorSchedule missing key: ${k}`);
      assert.ok(enKeys.includes(k), `English doctorSchedule missing key: ${k}`);
      assert.ok(translations.ar.doctorSchedule[k].length > 0, `Arabic key ${k} is empty`);
      assert.ok(translations.en.doctorSchedule[k].length > 0, `English key ${k} is empty`);
    });

    // Check complete 100% parity across doctorSchedule namespace
    const arMissingInEn = arKeys.filter(k => !enKeys.includes(k));
    const enMissingInAr = enKeys.filter(k => !arKeys.includes(k));

    assert.deepStrictEqual(arMissingInEn, [], 'All Arabic doctorSchedule keys must exist in English');
    assert.deepStrictEqual(enMissingInAr, [], 'All English doctorSchedule keys must exist in Arabic');
  });

  console.log('\n==================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('==================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
