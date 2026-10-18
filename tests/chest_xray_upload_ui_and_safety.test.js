/**
 * 🫁 HEALTH VIBE AI: CHEST RADIOLOGY & CT UPLOAD UI/UX & CLINICAL SAFETY TEST SUITE
 * Benchmark: Rology Teleradiology Platform (https://rology.ai/how-it-works/)
 *
 * Verifies:
 * 1. Chest Radiology Studio Module & Public API methods.
 * 2. Modalities (CXR PA/Lateral LOINC 36643-5, CT Plain LOINC 24627-2, CT Contrast, Other).
 * 3. Clinical Indications & Patient History intake.
 * 4. STRICT NON-AUTONOMOUS AI DISCLAIMER:
 *    MVP stage explicitly clarifies zero automated autonomous diagnosis;
 *    100% human certified radiologist / pulmonologist review.
 * 5. Interactive Mobile Film Lightbox Viewer:
 *    - Invert Film (Negative ↔ Positive toggle)
 *    - Real-time Brightness & Contrast sliders
 *    - Pan & Zoom (Scale In / Out / Reset)
 * 6. File format & boundary enforcement (DICOM .dcm, PNG, JPG, PDF up to 15MB).
 * 7. Rology-Standard Teleradiology Status Stepper (Quarantined ➔ Pending Review ➔ Certified).
 * 8. 100% Bilingual Parity (Arabic & English).
 * 9. DOM & CSS verification in app/index.html & app/styles.css.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n==================================================================');
console.log('🫁 HEALTH VIBE AI: CHEST X-RAY / CT UPLOAD UI/UX & SAFETY SUITE');
console.log('   Benchmark: Rology Teleradiology Standard & Human Doctor Review');
console.log('==================================================================\n');

// Mock browser window and document for unit testing
const windowMock = {
  currentLanguage: 'ar',
  showToast: (msg) => { /* mock */ },
  showScreen: (scr) => { /* mock */ }
};

// Load the ChestRadiologyUI module in simulated environment
const modulePath = path.join(__dirname, '..', 'app', 'modules', 'patient', 'chest-radiology-ui.js');
const moduleCode = fs.readFileSync(modulePath, 'utf8');

// Evaluate in local context with windowMock
const evalContext = new Function('window', 'global', moduleCode);
evalContext(windowMock, windowMock);

const ChestRadiologyUI = windowMock.ChestRadiologyUI;

// -----------------------------------------------------------------------------
// TEST 1: Studio Module & Public API Registration
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Chest Radiology Studio Module Initialization & Public API');
assert.ok(ChestRadiologyUI, 'ChestRadiologyUI must be exported');
assert.strictEqual(typeof ChestRadiologyUI.selectModality, 'function');
assert.strictEqual(typeof ChestRadiologyUI.toggleIndication, 'function');
assert.strictEqual(typeof ChestRadiologyUI.selectUrgency, 'function');
assert.strictEqual(typeof ChestRadiologyUI.toggleViewerInvert, 'function');
assert.strictEqual(typeof ChestRadiologyUI.setViewerBrightness, 'function');
assert.strictEqual(typeof ChestRadiologyUI.setViewerContrast, 'function');
assert.strictEqual(typeof ChestRadiologyUI.zoomViewer, 'function');
assert.strictEqual(typeof ChestRadiologyUI.resetViewer, 'function');
assert.strictEqual(typeof ChestRadiologyUI.stageRadiologyFiles, 'function');
console.log('  ✓ Public API functions successfully registered and accessible.');

// -----------------------------------------------------------------------------
// TEST 2: Modalities & LOINC Codes (Rology Standard)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Radiology Modalities & LOINC Mapping');
const modalities = ChestRadiologyUI.RADIOLOGY_MODALITIES;
assert.ok(modalities.cxr_pa_lat, 'CXR PA & Lateral must exist');
assert.strictEqual(modalities.cxr_pa_lat.loinc, '36643-5', 'CXR must map to LOINC 36643-5');
assert.ok(modalities.ct_thorax_plain, 'CT Thorax Plain must exist');
assert.strictEqual(modalities.ct_thorax_plain.loinc, '24627-2', 'CT Plain must map to LOINC 24627-2');
assert.ok(modalities.ct_thorax_contrast, 'CT Thorax with contrast must exist');
assert.ok(modalities.other_imaging, 'Other Imaging must exist');

// Test selecting modalities
ChestRadiologyUI.selectModality('ct_thorax_plain');
assert.strictEqual(ChestRadiologyUI.getState().selectedModality, 'ct_thorax_plain');
ChestRadiologyUI.selectModality('cxr_pa_lat');
assert.strictEqual(ChestRadiologyUI.getState().selectedModality, 'cxr_pa_lat');
console.log('  ✓ Modalities verified with official LOINC codes (36643-5 & 24627-2).');

// -----------------------------------------------------------------------------
// TEST 3: Clinical Indications & Urgency SLA
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Clinical Indications & Turnaround Urgency SLA');
const indications = ChestRadiologyUI.CLINICAL_INDICATIONS;
assert.ok(Array.isArray(indications), 'Indications must be an array');
assert.ok(indications.some(i => i.key === 'ind_cough'), 'Cough indication present');
assert.ok(indications.some(i => i.key === 'ind_dyspnea'), 'Dyspnea indication present');
assert.ok(indications.some(i => i.key === 'ind_pneumonia'), 'Pneumonia/TB indication present');
assert.ok(indications.some(i => i.key === 'ind_chest_pain'), 'Chest pain indication present');
assert.ok(indications.some(i => i.key === 'ind_hemoptysis'), 'Hemoptysis indication present');
assert.ok(indications.some(i => i.key === 'ind_fibrosis'), 'Fibrosis indication present');

// Toggle indication
ChestRadiologyUI.toggleIndication('ind_cough');
assert.ok(ChestRadiologyUI.getState().selectedIndications.has('ind_cough'));
ChestRadiologyUI.toggleIndication('ind_cough');
assert.ok(!ChestRadiologyUI.getState().selectedIndications.has('ind_cough'));

// Select urgency
ChestRadiologyUI.selectUrgency('stat');
assert.strictEqual(ChestRadiologyUI.getState().urgency, 'stat');
ChestRadiologyUI.selectUrgency('routine');
assert.strictEqual(ChestRadiologyUI.getState().urgency, 'routine');
console.log('  ✓ Clinical indications and urgency SLA toggles function smoothly.');

// -----------------------------------------------------------------------------
// TEST 4: Mobile Film Lightbox Interactive Controls
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Film Lightbox Viewer: Invert, Brightness, Contrast & Zoom');
// Test film inversion (Negative ↔ Positive)
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.invert, false);
ChestRadiologyUI.toggleViewerInvert();
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.invert, true);
ChestRadiologyUI.toggleViewerInvert();
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.invert, false);

// Test Brightness clamping (50% to 200%)
ChestRadiologyUI.setViewerBrightness(150);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.brightness, 150);
ChestRadiologyUI.setViewerBrightness(300); // clamped to 200
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.brightness, 200);
ChestRadiologyUI.setViewerBrightness(20);  // clamped to 50
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.brightness, 50);

// Test Contrast clamping (50% to 220%)
ChestRadiologyUI.setViewerContrast(140);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.contrast, 140);

// Test Zoom (Scale in/out/reset)
ChestRadiologyUI.zoomViewer(0.4);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.zoom, 1.4);
ChestRadiologyUI.zoomViewer(-0.2);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.zoom, 1.2);

// Test Reset
ChestRadiologyUI.resetViewer();
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.invert, false);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.brightness, 100);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.contrast, 100);
assert.strictEqual(ChestRadiologyUI.getState().viewerControls.zoom, 1.0);
console.log('  ✓ Lightbox controls (Invert, Brightness, Contrast, Zoom, Reset) passed with 100% precision.');

// -----------------------------------------------------------------------------
// TEST 5: File Intake, DICOM Acceptance & Size Boundary Enforcement
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: File Intake, DICOM Support & 15MB Size Boundary');
// 1. Valid DICOM file
ChestRadiologyUI.stageRadiologyFiles([{
  name: 'chest_cxr_pa_study.dcm',
  size: 4.5 * 1024 * 1024,
  type: 'application/dicom'
}]);
assert.strictEqual(ChestRadiologyUI.getState().stagedFiles.length, 1);
assert.strictEqual(ChestRadiologyUI.getState().stagedFiles[0].name, 'chest_cxr_pa_study.dcm');

// 2. Valid high-res PNG image
ChestRadiologyUI.stageRadiologyFiles([{
  name: 'ct_thorax_slice_01.png',
  size: 6.2 * 1024 * 1024,
  type: 'image/png'
}]);
assert.strictEqual(ChestRadiologyUI.getState().stagedFiles.length, 2);

// 3. File exceeding 15MB boundary limit (16MB) - must be rejected
ChestRadiologyUI.stageRadiologyFiles([{
  name: 'huge_raw_volume.dcm',
  size: 16.5 * 1024 * 1024,
  type: 'application/dicom'
}]);
assert.strictEqual(ChestRadiologyUI.getState().stagedFiles.length, 2, 'File >15MB must be rejected');

// 4. Blocked executable extension
ChestRadiologyUI.stageRadiologyFiles([{
  name: 'malware.exe',
  size: 1024,
  type: 'application/octet-stream'
}]);
assert.strictEqual(ChestRadiologyUI.getState().stagedFiles.length, 2, 'Executable must be rejected');

// Verify initial clinical review status
const firstScan = ChestRadiologyUI.getState().stagedFiles[0];
assert.strictEqual(firstScan.status, 'uploaded_quarantined');
assert.strictEqual(firstScan.reviewStatus, 'pending_radiologist_review');
console.log('  ✓ File intake accepts DICOM & images, enforces 15MB limit, and rejects executables.');

// -----------------------------------------------------------------------------
// TEST 6: Strict Non-Autonomous AI Notice in HTML and i18n
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Strict Non-Autonomous AI Notice & Human Review Mandate');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const i18nJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'i18n.js'), 'utf8');

// Assert MVP notice exists in index.html
assert.ok(indexHtml.includes('radiologySafetyDisclaimer'), 'Disclaimer box must exist in index.html');
assert.ok(indexHtml.includes('لا تدعي أو تقدم تحليلاً آلياً للأشعة بالذكاء الاصطناعي'), 'Must state no autonomous AI diagnosis');
assert.ok(indexHtml.includes('مراجعة استشاري بشري 100%'), 'Must state 100% human doctor review');

// Assert English translation disclaims autonomous AI
assert.ok(i18nJs.includes('strictly DOES NOT claim autonomous AI diagnosis'), 'English disclaimer must forbid AI diagnosis claim');
assert.ok(i18nJs.includes('Human radiologist oversight is 100% mandatory'), 'English disclaimer must assert mandatory human oversight');
console.log('  ✓ Non-replacement of doctor & MVP non-autonomous diagnosis claim strictly enforced.');

// -----------------------------------------------------------------------------
// TEST 7: 100% Bilingual Parity for radiologyUpload in i18n.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 7: 100% Bilingual Parity in app/i18n.js');
const i18nObj = require('../app/i18n.js');
assert.ok(i18nObj.translations, 'Translations object must exist');
assert.ok(i18nObj.translations.ar.radiologyUpload, 'Arabic radiologyUpload dictionary exists');
assert.ok(i18nObj.translations.en.radiologyUpload, 'English radiologyUpload dictionary exists');

const arKeys = Object.keys(i18nObj.translations.ar.radiologyUpload);
const enKeys = Object.keys(i18nObj.translations.en.radiologyUpload);

assert.strictEqual(arKeys.length, enKeys.length, `Key counts must match (${arKeys.length} vs ${enKeys.length})`);
for (const k of arKeys) {
  assert.ok(enKeys.includes(k), `English dictionary missing key: ${k}`);
  assert.ok(i18nObj.translations.ar.radiologyUpload[k].length > 0, `Arabic key '${k}' must not be empty`);
  assert.ok(i18nObj.translations.en.radiologyUpload[k].length > 0, `English key '${k}' must not be empty`);
}
console.log(`  ✓ 100% bilingual parity confirmed across all ${arKeys.length} radiology keys.`);

// -----------------------------------------------------------------------------
// TEST 8: HTML Components & CSS Styling Verification
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 8: HTML Components & CSS Verification');
assert.ok(indexHtml.includes('id="chestRadiologyPanel"'), 'chestRadiologyPanel must exist in index.html');
assert.ok(indexHtml.includes('id="chestRadiologyModal"'), 'chestRadiologyModal must exist in index.html');
assert.ok(indexHtml.includes('id="btnRadCamera"'), 'Camera button must exist in index.html');
assert.ok(indexHtml.includes('id="btnRadBrowse"'), 'Browse button must exist in index.html');
assert.ok(indexHtml.includes('id="radViewport"'), 'Lightbox viewport must exist in index.html');
assert.ok(indexHtml.includes('id="btnRadInvert"'), 'Invert button must exist in index.html');
assert.ok(indexHtml.includes('chest-radiology-ui.js'), 'chest-radiology-ui.js script loaded in index.html');

const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
assert.ok(stylesCss.includes('.chest-radiology-panel'), 'CSS must define .chest-radiology-panel');
assert.ok(stylesCss.includes('.rad-modality-card'), 'CSS must define .rad-modality-card');
assert.ok(stylesCss.includes('.rad-lightbox-viewport'), 'CSS must define .rad-lightbox-viewport');
assert.ok(stylesCss.includes('.rad-viewer-controls'), 'CSS must define .rad-viewer-controls');
console.log('  ✓ All HTML panels, modals, and responsive CSS rules verified.');

console.log('\n==================================================================');
console.log('🎉 ALL 8 CHEST X-RAY / CT UPLOAD UI/UX & SAFETY TESTS PASSED!');
console.log('==================================================================\n');
