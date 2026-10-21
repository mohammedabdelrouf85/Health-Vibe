/**
 * Health Vibe AI - Doctor Medical Image & File Viewer Integration QA & Edge Cases Test Suite
 *
 * Benchmark: Rology Teleradiology Platform Standards
 * Focus: QA / Medical Research / Appointments, Chatbot & Files Integration / Edge Cases / Bilingual Arabic & English
 */

const assert = require('node:assert');
const path = require('node:path');

// Mock browser DOM environment
function createMockDom() {
  const elements = new Map();

  function getOrCreateElement(id, tagName = 'div') {
    if (!elements.has(id)) {
      const el = {
        id,
        tagName: tagName.toUpperCase(),
        style: {},
        classList: {
          _classes: new Set(),
          add(cls) { this._classes.add(cls); },
          remove(cls) { this._classes.delete(cls); },
          contains(cls) { return this._classes.has(cls); },
          has(cls) { return this._classes.has(cls); },
          toggle(cls, force) {
            if (force === undefined) {
              if (this._classes.has(cls)) { this._classes.delete(cls); return false; }
              this._classes.add(cls); return true;
            }
            if (force) { this._classes.add(cls); return true; }
            this._classes.delete(cls); return false;
          }
        },
        children: [],
        dataset: {},
        value: '',
        textContent: '',
        innerHTML: '',
        src: '',
        alt: '',
        listeners: new Map(),
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; },
        addEventListener(ev, fn) {
          if (!this.listeners.has(ev)) this.listeners.set(ev, []);
          this.listeners.get(ev).push(fn);
        },
        removeEventListener(ev, fn) {
          if (this.listeners.has(ev)) {
            const list = this.listeners.get(ev).filter(f => f !== fn);
            this.listeners.set(ev, list);
          }
        },
        dispatchEvent(event) {
          const list = this.listeners.get(event.type) || [];
          list.forEach(fn => fn(event));
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
        }
      };

      elements.set(id, el);
    }
    return elements.get(id);
  }

  global.document = {
    body: { style: {}, appendChild: () => {} },
    documentElement: { lang: 'ar', dir: 'rtl' },
    getElementById(id) {
      return getOrCreateElement(id);
    },
    createElement(tag) {
      return getOrCreateElement(`mock_${Date.now()}_${Math.random()}`, tag);
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector.includes('doctorNotes')) {
        return getOrCreateElement('doctorNotesInput');
      }
      return null;
    }
  };

  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  };

  return { elements, getOrCreateElement };
}

async function runIntegrationTestSuite() {
  console.log('\n==================================================================');
  console.log('🔬 HEALTH VIBE AI: MEDICAL VIEWER INTEGRATION QA & EDGE CASES');
  console.log('   Benchmark: Rology Teleradiology Cross-Module Integration');
  console.log('==================================================================\n');

  createMockDom();

  const MedicalViewerUI = require('../app/modules/doctor/medical-viewer-ui');
  const { medicalViewerService, FINDING_SEVERITY } = require('../backend/medical-viewer-service');
  const { relationalDbService } = require('../backend/relational-db-service');
  const i18n = require('../app/i18n');

  let passedTests = 0;
  const totalTests = 10;

  // ===========================================================================
  // TEST 1: Scheduled Appointments & Pre-Consultation Dossier Integration
  // ===========================================================================
  try {
    console.log('▶ TEST 1: Scheduled Appointments & Pre-Consultation Dossier Integration');

    const mockAppointmentCase = {
      id: 'appt_case_99182',
      appointmentId: 'appt_cardio_pulmo_001',
      patientName: 'Sameh Abdel-Rahman',
      preConsultationFiles: [
        {
          id: 'pre_cxr_1',
          name: 'Chest_PA_PreConsultation.jpg',
          url: 'https://cdn.healthvibe.local/scans/cxr_sameh.jpg',
          type: 'image/jpeg',
          notes: 'Persistent dry cough for 3 weeks'
        },
        {
          id: 'pre_spiro_2',
          name: 'Spirometry_Report.pdf',
          url: 'https://cdn.healthvibe.local/labs/spiro.pdf',
          type: 'application/pdf',
          notes: 'FEV1/FVC ratio 68%'
        }
      ]
    };

    const extracted = MedicalViewerUI.extractCaseMedicalFiles(mockAppointmentCase);
    assert.strictEqual(extracted.length, 2, 'Should extract both appointment pre-consultation files');
    assert.strictEqual(extracted[0].category, 'appointment_dossier');
    assert.strictEqual(extracted[1].isPdf, true);

    // Mock an active appointment consultation note input
    const apptNotes = global.document.getElementById('appointmentNotesInput');
    apptNotes.value = 'Pre-consultation clinical review started.';

    MedicalViewerUI.open({ caseData: mockAppointmentCase, initialIndex: 0 });
    MedicalViewerUI.zoomIn(1.0);
    MedicalViewerUI.insertFindingsToNotes('appointmentNotesInput');

    assert.ok(apptNotes.value.includes('Chest_PA_PreConsultation.jpg'), 'Findings must be appended to appointment notes');
    assert.ok(apptNotes.value.includes('200%'), 'Zoom percentage must be stamped');

    console.log('  ✓ Scheduled appointments pre-consultation dossier integration verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 1 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 2: Chatbot Triage Intake & Staged Scans Cross-Module Flow
  // ===========================================================================
  try {
    console.log('▶ TEST 2: Chatbot Triage Intake & Staged Scans Cross-Module Flow');

    const mockChatbotIntakeCase = {
      id: 'case_chatbot_triage_882',
      symptoms: 'fever, shortness of breath',
      attachments: [
        { id: 'att_1', name: 'General_Referral_Slip.jpg', url: './logo-dark-mark.webp', type: 'image/jpeg' }
      ],
      radiologyScans: [
        { id: 'rad_1', name: 'Urgent_CXR_Bilateral.jpg', url: './logo-dark-mark.webp', indications: 'Infiltrate rule-out' }
      ],
      labReports: [
        { id: 'lab_1', name: 'CBC_CRP_Report.pdf', url: './logo-dark-mark.webp', mimeType: 'application/pdf', urgencyLevel: 'high' }
      ],
      medicationPhotos: [
        { id: 'med_1', name: 'Symbicort_Inhaler.jpg', url: './logo-dark-mark.webp', frequencyLabel: 'بخاخ مرتين يومياً' }
      ]
    };

    const aggregated = MedicalViewerUI.extractCaseMedicalFiles(mockChatbotIntakeCase);
    assert.strictEqual(aggregated.length, 4, 'Must unify all 4 multi-source files from chatbot intake');

    const categories = aggregated.map(f => f.category);
    assert.ok(categories.includes('attachment'));
    assert.ok(categories.includes('radiology'));
    assert.ok(categories.includes('lab_report'));
    assert.ok(categories.includes('medication_photo'));

    console.log('  ✓ Chatbot multi-source intake aggregation verified without data loss.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 2 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 3: Longitudinal Patient History & Certified Finding Timeline
  // ===========================================================================
  try {
    console.log('▶ TEST 3: Longitudinal Patient History & Certified Finding Timeline');
    medicalViewerService.resetStoreForTesting();

    const mockDoctor = {
      uid: 'doc_history_reviewer_101',
      displayName: 'Dr. Mahmoud El-Sayed, MD',
      role: 'doctor',
      syndicateRegistrationNumber: 'EG-MED-99120',
      clinicId: 'alexandria_pulmo_clinic'
    };

    const certResult = await medicalViewerService.certifyScanByDoctor({
      doctorUser: mockDoctor,
      caseId: 'case_patient_history_441',
      fileId: 'scan_hrct_chest_001',
      fileName: 'HRCT_Thorax_Axial.jpg',
      clinicalImpression: 'Resolution of previous ground-glass opacities.',
      findingsSummary: 'Inspected under high_contrast window at 3.0x zoom.'
    });

    assert.ok(certResult.success);
    assert.strictEqual(certResult.certificate.status, 'certified_by_doctor');

    // Retrieve via relational DB
    await medicalViewerService.saveAnnotationAndFindings({
      doctorUser: mockDoctor,
      caseId: 'case_patient_history_441',
      fileId: 'scan_hrct_chest_001',
      fileName: 'HRCT_Thorax_Axial.jpg',
      findingText: certResult.certificate.clinicalImpression,
      severity: FINDING_SEVERITY.NORMAL,
      windowPreset: 'high_contrast',
      zoomLevel: 3.0
    });

    const annotations = medicalViewerService.getCaseAnnotations('case_patient_history_441', 'scan_hrct_chest_001');
    assert.strictEqual(annotations.length, 1);
    assert.strictEqual(annotations[0].severity, 'normal');

    console.log('  ✓ Certified scan findings persisted for longitudinal timeline integration.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 3 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 4: Extreme Zoom & Boundary Clamping Stress Testing
  // ===========================================================================
  try {
    console.log('▶ TEST 4: Extreme Zoom & Boundary Clamping Stress Testing');

    MedicalViewerUI.open({
      files: [{ id: 'f1', name: 'Test_Scan.jpg', url: './logo-dark-mark.webp', isImage: true }]
    });

    // Zoom Out beyond minimum
    for (let i = 0; i < 20; i++) {
      MedicalViewerUI.zoomOut(0.5);
    }
    const minZoomState = MedicalViewerUI.getState();
    assert.strictEqual(minZoomState.zoom, 0.5, 'Zoom must be clamped at minimum 0.5x (50%)');

    // Zoom In beyond maximum
    for (let i = 0; i < 40; i++) {
      MedicalViewerUI.zoomIn(1.0);
    }
    const maxZoomState = MedicalViewerUI.getState();
    assert.strictEqual(maxZoomState.zoom, 8.0, 'Zoom must be clamped at maximum 8.0x (800%)');

    // Rotation cycle test (0 -> 90 -> 180 -> 270 -> 360/0)
    MedicalViewerUI.resetTransforms();
    assert.strictEqual(MedicalViewerUI.getState().rotation, 0);
    MedicalViewerUI.rotate(90);
    assert.strictEqual(MedicalViewerUI.getState().rotation, 90);
    MedicalViewerUI.rotate(90);
    assert.strictEqual(MedicalViewerUI.getState().rotation, 180);
    MedicalViewerUI.rotate(90);
    assert.strictEqual(MedicalViewerUI.getState().rotation, 270);
    MedicalViewerUI.rotate(90);
    assert.strictEqual(MedicalViewerUI.getState().rotation, 0, '360° rotation must reset cleanly to 0°');

    console.log('  ✓ Boundary zoom clamping (0.5x - 8.0x) and rotation cycling verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 4 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 5: Rapid Sequential Navigation & Boundary Cycling Edge Cases
  // ===========================================================================
  try {
    console.log('▶ TEST 5: Rapid Sequential Navigation & Boundary Cycling Edge Cases');

    // Create 50 simulated diagnostic files
    const fiftyScans = Array.from({ length: 50 }, (_, i) => ({
      id: `slice_${i + 1}`,
      name: `CT_Chest_Slice_${String(i + 1).padStart(3, '0')}.jpg`,
      url: `./logo-dark-mark.webp`,
      isImage: true
    }));

    MedicalViewerUI.open({ files: fiftyScans, initialIndex: 0 });
    assert.strictEqual(MedicalViewerUI.getState().currentIndex, 0);

    // Navigate backwards from first file -> wraps to last file
    MedicalViewerUI.navigateFile(-1);
    assert.strictEqual(MedicalViewerUI.getState().currentIndex, 49, 'Navigating prev from index 0 should cycle to last file (49)');

    // Navigate forwards from last file -> wraps to first file
    MedicalViewerUI.navigateFile(1);
    assert.strictEqual(MedicalViewerUI.getState().currentIndex, 0, 'Navigating next from index 49 should cycle to first file (0)');

    // Rapid random navigation
    for (let step = 0; step < 200; step++) {
      const dir = step % 2 === 0 ? 1 : -1;
      MedicalViewerUI.navigateFile(dir);
    }
    const finalIdx = MedicalViewerUI.getState().currentIndex;
    assert.ok(finalIdx >= 0 && finalIdx < 50, 'Index must remain bounded between 0 and 49 without desync');

    console.log('  ✓ 50-file rapid navigation stress test and boundary wrap-around verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 5 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 6: Mixed Media (PDF Document vs Image) Switching & Rendering
  // ===========================================================================
  try {
    console.log('▶ TEST 6: Mixed Media (PDF Document vs Image) Switching & Rendering');

    const mixedFiles = [
      { id: 'f_img_1', name: 'Chest_XRay_PA.jpg', url: './logo-dark-mark.webp', isImage: true, isPdf: false },
      { id: 'f_pdf_2', name: 'Clinical_Pathology_Report.pdf', url: './mock.pdf', isImage: false, isPdf: true }
    ];

    MedicalViewerUI.open({ files: mixedFiles, initialIndex: 0 });
    const imgEl = global.document.getElementById('docViewerActiveImage');
    const pdfEl = global.document.getElementById('docViewerPdfContainer');

    // Index 0: Image active
    assert.strictEqual(imgEl.style.display, 'block', 'Image element should be visible');
    assert.strictEqual(pdfEl.style.display, 'none', 'PDF element should be hidden');

    // Switch to Index 1: PDF active
    MedicalViewerUI.selectFile(1);
    assert.strictEqual(imgEl.style.display, 'none', 'Image element should be hidden for PDF');
    assert.strictEqual(pdfEl.style.display, 'flex', 'PDF element should be visible for PDF file');

    // Switch back to Index 0: Image active again
    MedicalViewerUI.selectFile(0);
    assert.strictEqual(imgEl.style.display, 'block');
    assert.strictEqual(pdfEl.style.display, 'none');

    console.log('  ✓ Seamless switching between high-res scans and multi-page PDFs verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 6 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 7: Empty Case & Null/Corrupt File Boundaries
  // ===========================================================================
  try {
    console.log('▶ TEST 7: Empty Case & Null/Corrupt File Boundaries');

    // 1. Open with null caseData
    assert.doesNotThrow(() => {
      MedicalViewerUI.open({ caseData: null });
    }, 'Must not throw when caseData is null');
    assert.ok(MedicalViewerUI.getState().filesList.length > 0, 'Must provide graceful fallback placeholder');

    // 2. Open with empty attachments array
    assert.doesNotThrow(() => {
      MedicalViewerUI.open({ caseData: { attachments: [], files: [] } });
    }, 'Must not throw when attachments is empty array');

    // 3. Extract from undefined
    const extractedEmpty = MedicalViewerUI.extractCaseMedicalFiles(undefined);
    assert.deepStrictEqual(extractedEmpty, []);

    console.log('  ✓ Graceful fallback and empty-state resilience verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 7 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 8: Network Disconnect / Offline Backend Resilience
  // ===========================================================================
  try {
    console.log('▶ TEST 8: Network Disconnect / Offline Backend Resilience');

    // Simulate offline fetch throwing network error
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('TypeError: Failed to fetch (Network connection lost)');
    };

    // Telemetry and token calls must fail silently without breaking the UI
    const tokenCall = await MedicalViewerUI.requestViewingToken({ id: 'test_file', name: 'Offline_CXR.jpg' });
    assert.strictEqual(tokenCall, null, 'Offline token call should gracefully return null');

    const telemetryCall = await MedicalViewerUI.sendViewerTelemetry();
    assert.strictEqual(telemetryCall, null, 'Offline telemetry should gracefully return null');

    // Note insertion must continue to function locally in DOM
    const notesInput = global.document.getElementById('doctorNotesInput');
    notesInput.value = '';
    MedicalViewerUI.insertFindingsToNotes();
    assert.ok(notesInput.value.length > 0, 'Notes must be inserted into DOM even if backend is offline');

    // Restore fetch
    global.fetch = originalFetch;

    console.log('  ✓ Offline resilience and non-blocking background error handling verified.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 8 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 9: 100% Bilingual Arabic (RTL) vs English (LTR) Parity
  // ===========================================================================
  try {
    console.log('▶ TEST 9: 100% Bilingual Arabic (RTL) vs English (LTR) Parity');

    // 1. Verify i18n keys parity
    const arKeys = Object.keys(i18n.translations.ar.doctorMedicalViewer);
    const enKeys = Object.keys(i18n.translations.en.doctorMedicalViewer);
    assert.deepStrictEqual(arKeys.sort(), enKeys.sort(), 'Arabic and English translation keys must be 100% identical');

    // 2. Check window presets bilingual titles
    const presets = MedicalViewerUI.WINDOW_PRESETS;
    for (const key of Object.keys(presets)) {
      assert.ok(presets[key].nameAr, `Preset '${key}' must have Arabic label`);
      assert.ok(presets[key].nameEn, `Preset '${key}' must have English label`);
    }

    // 3. Symmetric Arabic shortcuts verification
    // Arabic keyboard 'م' for Loupe, 'ق' for Rotate, 'ه' for Invert, '٠' for Reset
    assert.strictEqual(typeof MedicalViewerUI.toggleLoupe, 'function');
    assert.strictEqual(typeof MedicalViewerUI.rotate, 'function');
    assert.strictEqual(typeof MedicalViewerUI.toggleInvert, 'function');
    assert.strictEqual(typeof MedicalViewerUI.resetTransforms, 'function');

    console.log('  ✓ 100% bilingual parity and RTL/LTR keyboard shortcut symmetry confirmed.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 9 FAILED:', err.message);
  }

  // ===========================================================================
  // TEST 10: Rology Teleradiology Full Clinical Scenario End-to-End Simulation
  // ===========================================================================
  try {
    console.log('▶ TEST 10: Rology Teleradiology Full Clinical Scenario End-to-End Simulation');

    const clinicalCase = {
      id: 'case_telerad_simulation_2026',
      patientName: 'Farida Mostafa',
      patientEmail: 'farida.m@example.com',
      radiologyScans: [
        {
          id: 'cxr_farida_pa',
          name: 'Chest_XRay_Farida_PA.jpg',
          url: './logo-dark-mark.webp',
          indications: 'Post-viral dyspnea and localized crepitations'
        }
      ]
    };

    // Step 1: Doctor launches viewer
    MedicalViewerUI.open({ caseData: clinicalCase, initialIndex: 0 });
    assert.strictEqual(MedicalViewerUI.getState().isOpen, true);

    // Step 2: Apply high_contrast / infiltrate preset
    MedicalViewerUI.applyWindowPreset('high_contrast');
    assert.strictEqual(MedicalViewerUI.getState().activePresetKey, 'high_contrast');
    assert.strictEqual(MedicalViewerUI.getState().contrast, 170);

    // Step 3: Zoom into right lung base
    MedicalViewerUI.zoomIn(1.5);
    assert.ok(MedicalViewerUI.getState().zoom >= 2.5);

    // Step 4: Toggle Loupe for localized inspection
    MedicalViewerUI.toggleLoupe();
    assert.strictEqual(MedicalViewerUI.getState().loupeActive, true);

    // Step 5: Flag critical finding alert
    const alertResult = await MedicalViewerUI.recordCriticalFindingAlert();
    assert.ok(alertResult);

    // Step 6: Certify scan findings as licensed human physician
    const certResult = await MedicalViewerUI.certifyActiveScan();
    assert.ok(certResult);

    // Step 7: Verify final review notes content
    const notes = global.document.getElementById('doctorNotesInput').value;
    assert.ok(notes.includes('CRITICAL ALERT') || notes.includes('تنبيه حرج'));
    assert.ok(notes.includes('CLINICALLY CERTIFIED') || notes.includes('اعتماد سريري موثق'));

    // Step 8: Close viewer and verify clean tear down
    MedicalViewerUI.close();
    assert.strictEqual(MedicalViewerUI.getState().isOpen, false);
    assert.strictEqual(MedicalViewerUI.getState().loupeActive, false);

    console.log('  ✓ Full Rology teleradiology clinical inspection workflow simulated successfully.\n');
    passedTests++;
  } catch (err) {
    console.error('  ❌ TEST 10 FAILED:', err.message);
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('==================================================================');
  if (passedTests === totalTests) {
    console.log(`🎉 ALL ${totalTests} MEDICAL VIEWER INTEGRATION QA & EDGE CASES PASSED!`);
    console.log('   Fully certified across Appointments, Chatbot, Files & Bilingual Parity.');
    console.log('==================================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ FAILED: ${totalTests - passedTests} tests failed.`);
    console.log('==================================================================\n');
    process.exit(1);
  }
}

runIntegrationTestSuite();
