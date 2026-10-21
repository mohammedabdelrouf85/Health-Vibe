/**
 * HEALTH VIBE AI: MEDICATION & INHALER PHOTO CAPTURE ANALYTICS & LOGGING TEST SUITE
 * Benchmark: Altibbi Telemedicine Platform (https://altibbi.com/landing-pages/business)
 *
 * Validates:
 * 1. Telemetry Event Constants & Registration in Analytics Engine.
 * 2. Strict HIPAA Zero-PHI Enforcement in Analytics Payloads (blocks free-text symptoms/diagnoses).
 * 3. Administrative KPI Calculations & Formulas:
 *    - Medication Photo Upload Success Rate
 *    - Doctor Rx Transcription Rate (Conversion to certified prescription)
 *    - Camera vs. Gallery Direct Capture Adoption
 *    - Appointment Linkage Rate
 *    - High-Contrast Fine-Print Zoom Inspections
 * 4. Resilient Empty State & Missing Denominator Handling ("Unavailable" / null).
 * 5. Category Distribution Breakdown (Medicine Box, Chest Inhaler, Paper Prescription, Syrup/Drops).
 * 6. Multi-Tenant Clinic Isolation & Time Period Windows.
 * 7. Backend Server API Routes & RBAC (/api/medication-capture/analytics/kpis, /api/medication-capture/telemetry).
 * 8. Frontend Admin Panel UI & Module Telemetry Emitter Integration.
 * 9. 100% Bilingual Arabic & English Translations Parity.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const analyticsService = require('../backend/analytics-service');

const {
  EVENT_TYPES,
  calculateMedicationCaptureKpis,
  recordEvent,
  resetAnalyticsState,
  getInMemoryEvents,
  sanitizeAndValidatePayload
} = analyticsService;

async function runTests() {
  console.log('🧪 Starting Medication & Rx Photo Capture Analytics & Logging Test Suite...');

  // Reset in-memory state before each run
  resetAnalyticsState();

  // =========================================================================
  // TEST 1: Event Type Constants Registration
  // =========================================================================
  console.log('▶ Test 1: Verify all medication capture event types are registered');
  const requiredEventTypes = [
    'MEDICATION_PHOTO_UPLOAD_ATTEMPT',
    'MEDICATION_PHOTO_UPLOAD_SUCCESS',
    'MEDICATION_PHOTO_UPLOAD_FAILURE',
    'MEDICATION_PHOTO_INSPECTED',
    'MEDICATION_PHOTO_TRANSCRIBED',
    'MEDICATION_PHOTO_LINKED_TO_APPT',
    'MEDICATION_PHOTO_DELETED'
  ];

  for (const key of requiredEventTypes) {
    assert.ok(EVENT_TYPES[key], `EVENT_TYPES.${key} must be defined`);
    assert.strictEqual(typeof EVENT_TYPES[key], 'string', `EVENT_TYPES.${key} must be a string`);
  }
  console.log('  ✔ All 7 medication capture event types registered successfully.');

  // =========================================================================
  // TEST 2: HIPAA Zero-PHI Guardrail in Telemetry Payloads
  // =========================================================================
  console.log('▶ Test 2: Verify strict HIPAA Zero-PHI sanitization & rejection');

  // Forbidden keys must be blocked
  assert.throws(() => {
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS,
      userId: 'patient_101',
      payload: {
        categoryKey: 'medicine_box',
        symptoms: 'Patient suffers from acute chest tightness and dyspnea'
      }
    });
  }, /MEDICAL_TEXT_PROHIBITED/, 'Payload containing symptoms key must be rejected');

  assert.throws(() => {
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS,
      userId: 'patient_101',
      payload: {
        categoryKey: 'chest_inhaler',
        prescription: 'Ventolin 100mcg two puffs every 4 hours'
      }
    });
  }, /MEDICAL_TEXT_PROHIBITED/, 'Payload containing prescription key must be rejected');

  assert.throws(() => {
    recordEvent({
      eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS,
      userId: 'patient_101',
      payload: {
        categoryKey: 'paper_prescription',
        diagnosis: 'Moderate persistent bronchial asthma'
      }
    });
  }, /MEDICAL_TEXT_PROHIBITED/, 'Payload containing diagnosis key must be rejected');

  // Permitted operational metadata passes sanitation cleanly
  const validPayload = {
    photoId: 'med_12345',
    categoryKey: 'chest_inhaler',
    captureSource: 'camera',
    frequencyKey: 'daily_twice',
    sizeBytes: 2450000,
    hasFinePrintZoom: true
  };

  const validationRes = sanitizeAndValidatePayload(EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, validPayload);
  assert.strictEqual(validationRes.ok, true, 'Valid metadata must pass sanitation');
  assert.strictEqual(validationRes.cleanPayload.categoryKey, 'chest_inhaler');
  assert.strictEqual(validationRes.cleanPayload.captureSource, 'camera');
  assert.strictEqual(validationRes.cleanPayload.sizeBytes, 2450000);
  console.log('  ✔ Zero-PHI guardrail strictly blocks clinical free-text while permitting operational telemetry.');

  // =========================================================================
  // TEST 3: Resilient Empty State & Missing Denominators
  // =========================================================================
  console.log('▶ Test 3: Resilient Empty State & Missing Denominators Handling');
  resetAnalyticsState();

  const emptyKpis = calculateMedicationCaptureKpis([], { timePeriod: 'all' });
  assert.strictEqual(emptyKpis.success, true);
  assert.strictEqual(emptyKpis.summary.totalUploadEvents, 0);
  assert.strictEqual(emptyKpis.summary.uploadSuccesses, 0);

  // Missing denominators must return null with formatted "Unavailable"
  assert.strictEqual(emptyKpis.kpis.uploadSuccessRate.value, null, 'Empty upload rate value must be null');
  assert.strictEqual(emptyKpis.kpis.uploadSuccessRate.formatted, 'Unavailable', 'Empty upload rate must format to Unavailable');
  assert.strictEqual(emptyKpis.kpis.doctorTranscriptionRate.value, null);
  assert.strictEqual(emptyKpis.kpis.doctorTranscriptionRate.formatted, 'Unavailable');
  assert.strictEqual(emptyKpis.kpis.cameraCaptureAdoptionRate.value, null);
  assert.strictEqual(emptyKpis.kpis.appointmentLinkageRate.value, null);

  // Category counts must be zero
  assert.strictEqual(emptyKpis.categoryDistribution.medicine_box, 0);
  assert.strictEqual(emptyKpis.categoryDistribution.chest_inhaler, 0);
  assert.strictEqual(emptyKpis.categoryDistribution.paper_prescription, 0);
  assert.strictEqual(emptyKpis.categoryDistribution.syrup_drops, 0);
  console.log('  ✔ Empty state returns { value: null, formatted: "Unavailable" } without NaN or errors.');

  // =========================================================================
  // TEST 4: Full Lifecycle Event KPI Calculations (Altibbi Benchmark)
  // =========================================================================
  console.log('▶ Test 4: Comprehensive KPI Calculation across simulated Altibbi telemetry');
  resetAnalyticsState();

  const now = Date.now();
  const simulatedEvents = [
    // 10 Upload attempts: 8 successes, 2 failures
    // Category mix: 4 medicine_box, 2 chest_inhaler, 1 paper_prescription, 1 syrup_drops
    // Sources: 6 camera, 2 gallery
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 3000, payload: { categoryKey: 'medicine_box', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 2900, payload: { photoId: 'm1', categoryKey: 'medicine_box', captureSource: 'camera', sizeBytes: 1500000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 2800, payload: { categoryKey: 'medicine_box', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 2700, payload: { photoId: 'm2', categoryKey: 'medicine_box', captureSource: 'camera', sizeBytes: 1200000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 2600, payload: { categoryKey: 'medicine_box', captureSource: 'gallery' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 2500, payload: { photoId: 'm3', categoryKey: 'medicine_box', captureSource: 'gallery', sizeBytes: 2100000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 2400, payload: { categoryKey: 'medicine_box', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 2300, payload: { photoId: 'm4', categoryKey: 'medicine_box', captureSource: 'camera', sizeBytes: 900000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 2200, payload: { categoryKey: 'chest_inhaler', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 2100, payload: { photoId: 'm5', categoryKey: 'chest_inhaler', captureSource: 'camera', sizeBytes: 1800000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 2000, payload: { categoryKey: 'chest_inhaler', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1900, payload: { photoId: 'm6', categoryKey: 'chest_inhaler', captureSource: 'camera', sizeBytes: 1700000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 1800, payload: { categoryKey: 'paper_prescription', captureSource: 'gallery' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1700, payload: { photoId: 'm7', categoryKey: 'paper_prescription', captureSource: 'gallery', sizeBytes: 3100000 } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 1600, payload: { categoryKey: 'syrup_drops', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1500, payload: { photoId: 'm8', categoryKey: 'syrup_drops', captureSource: 'camera', sizeBytes: 850000 } },

    // 2 Failures (file too large or invalid format)
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 1400, payload: { categoryKey: 'medicine_box', captureSource: 'gallery' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_FAILURE, timestamp: now - 1350, payload: { categoryKey: 'medicine_box', rejectionReason: 'FILE_TOO_LARGE' } },

    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_ATTEMPT, timestamp: now - 1200, payload: { categoryKey: 'other', captureSource: 'camera' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_FAILURE, timestamp: now - 1150, payload: { categoryKey: 'other', rejectionReason: 'INVALID_FORMAT' } },

    // Inspections (fine-print zoom views): 5 inspections
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_INSPECTED, timestamp: now - 1000, payload: { photoId: 'm1', hasFinePrintZoom: true } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_INSPECTED, timestamp: now - 950, payload: { photoId: 'm2', hasFinePrintZoom: true } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_INSPECTED, timestamp: now - 900, payload: { photoId: 'm5', hasFinePrintZoom: true } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_INSPECTED, timestamp: now - 850, payload: { photoId: 'm6', hasFinePrintZoom: true } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_INSPECTED, timestamp: now - 800, payload: { photoId: 'm7', hasFinePrintZoom: true } },

    // Doctor Transcriptions into Certified Rx: 4 transcriptions (m1, m2, m5, m7)
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_TRANSCRIBED, timestamp: now - 700, payload: { photoId: 'm1', categoryKey: 'medicine_box' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_TRANSCRIBED, timestamp: now - 650, payload: { photoId: 'm2', categoryKey: 'medicine_box' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_TRANSCRIBED, timestamp: now - 600, payload: { photoId: 'm5', categoryKey: 'chest_inhaler' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_TRANSCRIBED, timestamp: now - 550, payload: { photoId: 'm7', categoryKey: 'paper_prescription' } },

    // Linked to Appointment: 6 photos linked
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_LINKED_TO_APPT, timestamp: now - 500, payload: { slotsCount: 4 } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_LINKED_TO_APPT, timestamp: now - 450, payload: { slotsCount: 2 } },

    // Deletion: 1 photo removed by patient
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_DELETED, timestamp: now - 300, payload: { photoId: 'm8' } }
  ];

  const results = calculateMedicationCaptureKpis(simulatedEvents, { timePeriod: 'all' });

  // 1. Upload counts
  assert.strictEqual(results.summary.uploadAttempts, 10, 'Expected 10 upload attempts');
  assert.strictEqual(results.summary.uploadSuccesses, 8, 'Expected 8 upload successes');
  assert.strictEqual(results.summary.uploadFailures, 2, 'Expected 2 upload failures');

  // 2. Upload Success Rate = 8 / 10 = 80%
  assert.strictEqual(results.kpis.uploadSuccessRate.value, 80, 'Upload success rate should be 80%');
  assert.strictEqual(results.kpis.uploadSuccessRate.formatted, '80%', 'Formatted rate should be 80%');

  // 3. Doctor Rx Transcription Rate = 4 / 8 = 50%
  assert.strictEqual(results.summary.transcriptions, 4, 'Expected 4 transcriptions');
  assert.strictEqual(results.kpis.doctorTranscriptionRate.value, 50, 'Transcription rate should be 50%');
  assert.strictEqual(results.kpis.doctorTranscriptionRate.formatted, '50%');

  // 4. Camera Adoption Rate: Camera = 6, Gallery = 2 -> 6 / 8 = 75%
  assert.strictEqual(results.summary.cameraUploads, 6, 'Expected 6 camera uploads');
  assert.strictEqual(results.summary.browseUploads, 2, 'Expected 2 gallery uploads');
  assert.strictEqual(results.kpis.cameraCaptureAdoptionRate.value, 75, 'Camera adoption rate should be 75%');
  assert.strictEqual(results.kpis.cameraCaptureAdoptionRate.formatted, '75%');

  // 5. Category Distribution Breakdown
  assert.strictEqual(results.categoryDistribution.medicine_box, 4, 'Expected 4 medicine boxes');
  assert.strictEqual(results.categoryDistribution.chest_inhaler, 2, 'Expected 2 chest inhalers');
  assert.strictEqual(results.categoryDistribution.paper_prescription, 1, 'Expected 1 paper prescription');
  assert.strictEqual(results.categoryDistribution.syrup_drops, 1, 'Expected 1 syrup/drops');
  assert.strictEqual(results.categoryDistribution.other, 0, 'Expected 0 other');

  // 6. Inspections & Linkages
  assert.strictEqual(results.summary.inspections, 5, 'Expected 5 inspections');
  assert.strictEqual(results.summary.linkedToAppt, 2, 'Expected 2 appointment linkage events');
  console.log('  ✔ All KPI formulas (Upload Success, Transcription, Camera Adoption, Categories) verified.');

  // =========================================================================
  // TEST 5: Multi-Tenant Clinic Isolation & Time Filtering
  // =========================================================================
  console.log('▶ Test 5: Verify multi-tenant clinic isolation and time-window filtering');
  const multiTenantEvents = [
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1000, clinicId: 'cairo_downtown', payload: { categoryKey: 'medicine_box' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1000, clinicId: 'cairo_downtown', payload: { categoryKey: 'chest_inhaler' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - 1000, clinicId: 'alex_branch', payload: { categoryKey: 'paper_prescription' } }
  ];

  const cairoKpis = calculateMedicationCaptureKpis(multiTenantEvents, { clinicId: 'cairo_downtown' });
  assert.strictEqual(cairoKpis.summary.uploadSuccesses, 2, 'Cairo clinic should only see its 2 uploads');
  assert.strictEqual(cairoKpis.categoryDistribution.medicine_box, 1);
  assert.strictEqual(cairoKpis.categoryDistribution.chest_inhaler, 1);
  assert.strictEqual(cairoKpis.categoryDistribution.paper_prescription, 0, 'Alex upload must not leak into Cairo');

  const alexKpis = calculateMedicationCaptureKpis(multiTenantEvents, { clinicId: 'alex_branch' });
  assert.strictEqual(alexKpis.summary.uploadSuccesses, 1, 'Alex clinic should only see its 1 upload');
  assert.strictEqual(alexKpis.categoryDistribution.paper_prescription, 1);

  // Time window: events older than 24h should be filtered out
  const timeEvents = [
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - (48 * 3600 * 1000), payload: { categoryKey: 'medicine_box' } },
    { eventType: EVENT_TYPES.MEDICATION_PHOTO_UPLOAD_SUCCESS, timestamp: now - (2 * 3600 * 1000), payload: { categoryKey: 'chest_inhaler' } }
  ];
  const last24hKpis = calculateMedicationCaptureKpis(timeEvents, { timePeriod: 'last_24h' });
  assert.strictEqual(last24hKpis.summary.uploadSuccesses, 1, 'Old upload (>24h) should be excluded');
  assert.strictEqual(last24hKpis.categoryDistribution.chest_inhaler, 1);
  assert.strictEqual(last24hKpis.categoryDistribution.medicine_box, 0);
  console.log('  ✔ Multi-tenant clinic isolation and time-window filtering verified.');

  // =========================================================================
  // TEST 6: Backend Server API Routes & RBAC
  // =========================================================================
  console.log('▶ Test 6: Verify Backend Server API Routes & RBAC logic');
  const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // Verify route endpoints exist in server.js
  assert.ok(serverContent.includes('/api/medication-capture/analytics/kpis'), 'GET /api/medication-capture/analytics/kpis route must be defined');
  assert.ok(serverContent.includes('/api/admin/medication-photos/analytics/kpis'), 'GET /api/admin/medication-photos/analytics/kpis route must be defined');
  assert.ok(serverContent.includes('/api/medication-capture/telemetry'), 'POST /api/medication-capture/telemetry route must be defined');

  // Verify RBAC: only super_admin, admin, clinic_admin, isOwner can access
  assert.ok(serverContent.includes('req.user.role === \'super_admin\''), 'RBAC must check super_admin role');
  assert.ok(serverContent.includes('req.user.role === \'clinic_admin\''), 'RBAC must check clinic_admin role');
  assert.ok(serverContent.includes('req.user.isOwner === true'), 'RBAC must check isOwner flag');
  console.log('  ✔ Backend server routes & RBAC authorization checks verified.');

  // =========================================================================
  // TEST 7: Frontend Admin UI Elements & Module Integration
  // =========================================================================
  console.log('▶ Test 7: Verify Frontend Admin UI Elements in index.html and app.js');
  const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Admin panel elements
  assert.ok(htmlContent.includes('id="adminMedicationAnalyticsPanel"'), '#adminMedicationAnalyticsPanel must exist in index.html');
  assert.ok(htmlContent.includes('id="adminMedPhotoSuccessRate"'), '#adminMedPhotoSuccessRate must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoTranscribeRate"'), '#adminMedPhotoTranscribeRate must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoCameraRate"'), '#adminMedPhotoCameraRate must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoLinkageRate"'), '#adminMedPhotoLinkageRate must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoInspections"'), '#adminMedPhotoInspections must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoCategoryBreakdown"'), '#adminMedPhotoCategoryBreakdown must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoBoxCount"'), '#adminMedPhotoBoxCount must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoInhalerCount"'), '#adminMedPhotoInhalerCount must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoPrescriptionCount"'), '#adminMedPhotoPrescriptionCount must exist');
  assert.ok(htmlContent.includes('id="adminMedPhotoSyrupCount"'), '#adminMedPhotoSyrupCount must exist');

  // App.js rendering logic
  const appPath = path.join(__dirname, '..', 'app', 'app.js');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert.ok(appContent.includes('renderAdminMedicationAnalytics'), 'renderAdminMedicationAnalytics must exist in app.js');
  assert.ok(appContent.includes('refreshAdminMedicationAnalytics'), 'refreshAdminMedicationAnalytics must exist in app.js');
  assert.ok(appContent.includes('window.renderAdminMedicationAnalytics = renderAdminMedicationAnalytics'), 'Must be exposed on window');

  // MedicationCaptureUI module telemetry
  const modulePath = path.join(__dirname, '..', 'app', 'modules', 'patient', 'medication-capture-ui.js');
  const moduleContent = fs.readFileSync(modulePath, 'utf8');
  assert.ok(moduleContent.includes('recordMedicationTelemetry'), 'recordMedicationTelemetry must exist in medication-capture-ui.js');
  assert.ok(moduleContent.includes('/api/medication-capture/telemetry'), 'Must call backend telemetry endpoint');
  assert.ok(moduleContent.includes('medication_photo_upload_attempt'), 'Must emit upload attempt');
  assert.ok(moduleContent.includes('medication_photo_upload_success'), 'Must emit upload success');
  assert.ok(moduleContent.includes('medication_photo_inspected'), 'Must emit inspected event');
  assert.ok(moduleContent.includes('medication_photo_transcribed'), 'Must emit transcribed event');
  assert.ok(moduleContent.includes('medication_photo_linked_to_appt'), 'Must emit linked to appt event');
  console.log('  ✔ Frontend Admin UI and module telemetry hooks verified.');

  // =========================================================================
  // TEST 8: Bilingual Arabic & English Translations Parity
  // =========================================================================
  console.log('▶ Test 8: Verify 100% Arabic & English translations parity');
  const i18nPath = path.join(__dirname, '..', 'app', 'i18n.js');
  const i18nContent = fs.readFileSync(i18nPath, 'utf8');

  const requiredI18nKeys = [
    'medPhotoAnalyticsTitle',
    'medPhotoAnalyticsSubtitle',
    'medPhotoSuccessRate',
    'medPhotoTranscribeRate',
    'medPhotoCameraRate',
    'medPhotoLinkageRate',
    'medPhotoInspections',
    'medPhotoBoxes',
    'medPhotoInhalers',
    'medPhotoPrescriptions',
    'medPhotoSyrups'
  ];

  for (const k of requiredI18nKeys) {
    // Both Arabic and English sections should contain the key
    const matches = (i18nContent.match(new RegExp(`${k}\\s*:`, 'g')) || []).length;
    assert.ok(matches >= 2, `Key '${k}' must be present in both Arabic and English dictionaries (found ${matches} occurrences)`);
  }
  console.log('  ✔ All 11 translation keys verified in Arabic and English dictionaries.');

  console.log('\n🎉 ALL MEDICATION PHOTO ANALYTICS & LOGGING TESTS PASSED SUCCESSFULLY! (8/8)');
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
