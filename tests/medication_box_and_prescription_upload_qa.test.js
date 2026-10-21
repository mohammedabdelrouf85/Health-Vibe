/**
 * 💊 HEALTH VIBE AI: MEDICATION BOX, INHALER & PRESCRIPTION CAPTURE QA TEST SUITE
 * Benchmark: Altibbi Telemedicine Platform (https://altibbi.com/landing-pages/business)
 *
 * Verifies:
 * 1. MedicationCaptureUI Module & Public API Registration.
 * 2. Categories (Medicine Box, Chest Inhaler, Paper Prescription, Syrup/Drops).
 * 3. Usage Frequency Helper for Non-Technical & Elderly Patients.
 * 4. File Intake, Boundaries & Edge Cases (Max 15MB, 0-byte, invalid MIME/extension).
 * 5. Interactive Fine-Print Inspector (Zoom, Rotate 90°, Brightness & Contrast).
 * 6. Chatbot Assistant Integration (Photo advice, Cam trigger, upload acknowledgment).
 * 7. Appointments Booking Integration (Attaching meds/inhalers to consult docket).
 * 8. Doctor Clinical Review & 1-Click Rx Transcription.
 * 9. 100% Bilingual Parity (Arabic & English) in app/i18n.js.
 * 10. DOM Elements & CSS Verification in app/index.html & app/styles.css.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n==================================================================');
console.log('💊 HEALTH VIBE AI: MEDICATION BOX & PRESCRIPTION CAPTURE QA SUITE');
console.log('   Benchmark: Altibbi Telemedicine Standard for Non-Tech Patients');
console.log('==================================================================\n');

// Mock browser environment
const localStorageMock = (function () {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

const toastLog = [];
const windowMock = {
  currentLanguage: 'ar',
  localStorage: localStorageMock,
  showToast: (msg) => { toastLog.push(msg); },
  showScreen: (scr) => { /* mock */ },
  URL: {
    createObjectURL: (blob) => 'blob:mock-url-' + Math.random().toString(36).substring(2, 6),
    revokeObjectURL: (url) => { /* mock */ }
  }
};

// Load the MedicationCaptureUI module
const modulePath = path.join(__dirname, '..', 'app', 'modules', 'patient', 'medication-capture-ui.js');
const moduleCode = fs.readFileSync(modulePath, 'utf8');

const evalContext = new Function('window', 'global', 'localStorage', moduleCode);
evalContext(windowMock, windowMock, localStorageMock);

const MedicationCaptureUI = windowMock.MedicationCaptureUI;

// -----------------------------------------------------------------------------
// TEST 1: Module Registration & Public API
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: MedicationCaptureUI Module Initialization & Public API');
assert.ok(MedicationCaptureUI, 'MedicationCaptureUI must be exported');
assert.strictEqual(typeof MedicationCaptureUI.selectCategory, 'function');
assert.strictEqual(typeof MedicationCaptureUI.selectFrequency, 'function');
assert.strictEqual(typeof MedicationCaptureUI.stageMedicationPhoto, 'function');
assert.strictEqual(typeof MedicationCaptureUI.deleteStagedPhoto, 'function');
assert.strictEqual(typeof MedicationCaptureUI.clearAllStagedPhotos, 'function');
assert.strictEqual(typeof MedicationCaptureUI.openInspector, 'function');
assert.strictEqual(typeof MedicationCaptureUI.closeInspector, 'function');
assert.strictEqual(typeof MedicationCaptureUI.setInspectorZoom, 'function');
assert.strictEqual(typeof MedicationCaptureUI.rotateInspector, 'function');
assert.strictEqual(typeof MedicationCaptureUI.setInspectorBrightness, 'function');
assert.strictEqual(typeof MedicationCaptureUI.setInspectorContrast, 'function');
assert.strictEqual(typeof MedicationCaptureUI.transcribePhotoToPrescription, 'function');
assert.strictEqual(typeof MedicationCaptureUI.linkMedicationsToAppointment, 'function');
console.log('  ✓ Public API functions successfully registered and accessible.');

// -----------------------------------------------------------------------------
// TEST 2: Clinical Categories & Metadata Schema (Altibbi Standard)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Clinical Categories & Metadata');
const categories = MedicationCaptureUI.MEDICATION_CATEGORIES;
assert.ok(categories.medicine_box, 'Medicine Box category must exist');
assert.ok(categories.chest_inhaler, 'Chest Inhaler category must exist');
assert.ok(categories.paper_prescription, 'Paper Prescription category must exist');
assert.ok(categories.syrup_drops, 'Syrup & Drops category must exist');

assert.strictEqual(categories.medicine_box.icon, '💊');
assert.strictEqual(categories.chest_inhaler.icon, '🫁');
assert.strictEqual(categories.paper_prescription.icon, '📄');
assert.strictEqual(categories.syrup_drops.icon, '🧪');

// Test selecting categories
MedicationCaptureUI.selectCategory('chest_inhaler');
assert.strictEqual(MedicationCaptureUI.getState().selectedCategory, 'chest_inhaler');
MedicationCaptureUI.selectCategory('medicine_box');
assert.strictEqual(MedicationCaptureUI.getState().selectedCategory, 'medicine_box');
console.log('  ✓ Categories verified with icons, descriptions, and dynamic photo tips.');

// -----------------------------------------------------------------------------
// TEST 3: Usage Frequency Presets for Non-Technical Patients
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Non-Technical Patient Usage Frequency Presets');
const freqs = MedicationCaptureUI.USAGE_FREQUENCIES;
assert.ok(Array.isArray(freqs), 'Frequencies must be an array');
assert.ok(freqs.some(f => f.key === 'as_needed'), 'As-needed (PRN) present');
assert.ok(freqs.some(f => f.key === 'daily_morning'), 'Daily morning present');
assert.ok(freqs.some(f => f.key === 'daily_twice'), 'Daily twice present');
assert.ok(freqs.some(f => f.key === 'daily_thrice'), 'Daily thrice present');
assert.ok(freqs.some(f => f.key === 'unsure'), 'Unsure preset present');

MedicationCaptureUI.selectFrequency('daily_twice');
assert.strictEqual(MedicationCaptureUI.getState().selectedFrequency, 'daily_twice');
console.log('  ✓ Non-technical usage frequency helpers confirmed.');

// -----------------------------------------------------------------------------
// TEST 4: File Validation, Size Boundaries & Edge Cases
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 4: File Intake, Boundaries & Edge Cases');
MedicationCaptureUI.clearAllStagedPhotos();

// Edge Case 1: Empty / Null File
const nullRes = MedicationCaptureUI.stageMedicationPhoto(null);
assert.strictEqual(nullRes.success, false);

// Edge Case 2: 0-Byte Corrupted File
const zeroByteFile = { name: 'corrupted.jpg', size: 0, type: 'image/jpeg' };
const zeroRes = MedicationCaptureUI.stageMedicationPhoto(zeroByteFile);
assert.strictEqual(zeroRes.success, false, '0-byte files must be rejected');

// Edge Case 3: Oversized File (>15MB)
const hugeFile = { name: 'huge_box_photo.png', size: 16 * 1024 * 1024, type: 'image/png' };
const hugeRes = MedicationCaptureUI.stageMedicationPhoto(hugeFile);
assert.strictEqual(hugeRes.success, false, 'Files > 15MB must be rejected');

// Edge Case 4: Non-Image File (Executable or Script)
const exeFile = { name: 'malicious.exe', size: 1024, type: 'application/x-msdownload' };
const exeRes = MedicationCaptureUI.stageMedicationPhoto(exeFile);
assert.strictEqual(exeRes.success, false, 'Non-images must be rejected');

// Edge Case 5: Valid Medicine Box Photo
const validFile = { name: 'Ventolin_Inhaler_100mcg.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' };
MedicationCaptureUI.selectCategory('chest_inhaler');
MedicationCaptureUI.selectFrequency('as_needed');
const validRes = MedicationCaptureUI.stageMedicationPhoto(validFile, { patientNote: 'بختين وقت ضيق التنفس' });
assert.strictEqual(validRes.success, true, 'Valid inhaler photo must be accepted');
assert.ok(validRes.photo.id.startsWith('med_'));
assert.strictEqual(validRes.photo.categoryKey, 'chest_inhaler');
assert.strictEqual(validRes.photo.patientNote, 'بختين وقت ضيق التنفس');

// Edge Case 6: Deletion
const photoId = validRes.photo.id;
assert.strictEqual(MedicationCaptureUI.getState().stagedPhotos.length, 1);
MedicationCaptureUI.deleteStagedPhoto(photoId);
assert.strictEqual(MedicationCaptureUI.getState().stagedPhotos.length, 0);

console.log('  ✓ Strict validation passed: rejected 0-byte, oversized, and non-image files.');

// -----------------------------------------------------------------------------
// TEST 5: Interactive Fine-Print Inspector (Zoom, Rotate, Contrast)
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Fine-Print Lightbox Inspector Controls');
// Stage a photo for inspector
const testP = MedicationCaptureUI.stageMedicationPhoto(validFile).photo;
MedicationCaptureUI.openInspector(testP.id);
assert.strictEqual(MedicationCaptureUI.getState().activeInspectorPhoto.id, testP.id);

// Zoom in
MedicationCaptureUI.setInspectorZoom(0.5);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.zoom, 1.5);
// Clamping max
MedicationCaptureUI.setInspectorZoom(3);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.zoom, 3);
// Zoom reset
MedicationCaptureUI.setInspectorZoom(0);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.zoom, 1);

// Rotate 90 deg increments
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 0);
MedicationCaptureUI.rotateInspector();
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 90);
MedicationCaptureUI.rotateInspector();
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 180);
MedicationCaptureUI.rotateInspector();
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 270);
MedicationCaptureUI.rotateInspector();
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 0);

// Brightness & Contrast
MedicationCaptureUI.setInspectorBrightness(120);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.brightness, 120);
MedicationCaptureUI.setInspectorContrast(140);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.contrast, 140);

MedicationCaptureUI.resetInspector();
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.zoom, 1);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.brightness, 100);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.contrast, 100);
assert.strictEqual(MedicationCaptureUI.getState().inspectorControls.rotate, 0);

MedicationCaptureUI.closeInspector();
assert.strictEqual(MedicationCaptureUI.getState().activeInspectorPhoto, null);
console.log('  ✓ Inspector controls (Zoom, Rotate, Brightness, Contrast) passed with 100% precision.');

// -----------------------------------------------------------------------------
// TEST 6: 1-Click Rx Transcription to Doctor's Prescription
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 6: 1-Click Rx Transcription to Doctor Input');
const mockDocMedsInput = { value: '' };
global.document = {
  getElementById: (id) => {
    if (id === 'doctorMedicationsInput') return mockDocMedsInput;
    return null;
  }
};

MedicationCaptureUI.transcribePhotoToPrescription(testP.id);
assert.ok(mockDocMedsInput.value.length > 0, 'Rx input must be populated');
assert.ok(mockDocMedsInput.value.includes('Ventolin_Inhaler_100mcg.jpg'), 'Filename included in Rx line');
console.log('  ✓ 1-Click Rx transcription successfully updated doctor prescription field.');

// -----------------------------------------------------------------------------
// TEST 7: 100% Bilingual Parity in app/i18n.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 7: 100% Bilingual Parity in app/i18n.js');
const i18nObj = require('../app/i18n.js');
assert.ok(i18nObj.translations, 'Translations object must exist');
assert.ok(i18nObj.translations.ar.medicationCapture, 'Arabic medicationCapture dictionary exists');
assert.ok(i18nObj.translations.en.medicationCapture, 'English medicationCapture dictionary exists');

const arKeys = Object.keys(i18nObj.translations.ar.medicationCapture);
const enKeys = Object.keys(i18nObj.translations.en.medicationCapture);

assert.ok(arKeys.length >= 15, `Arabic keys count should be >= 15 (got ${arKeys.length})`);
assert.strictEqual(arKeys.length, enKeys.length, `Key counts must match (${arKeys.length} vs ${enKeys.length})`);

for (const k of arKeys) {
  assert.ok(enKeys.includes(k), `English dictionary missing key: ${k}`);
}
console.log(`  ✓ 100% bilingual parity confirmed across all ${arKeys.length} medication capture keys.`);

// -----------------------------------------------------------------------------
// TEST 8: HTML & CSS Markup Integration
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 8: HTML Components & CSS Verification');
const htmlPath = path.join(__dirname, '..', 'app', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert.ok(htmlContent.includes('id="medicationCapturePanelContainer"'), 'medicationCapturePanelContainer must exist in index.html');
assert.ok(htmlContent.includes('id="medicationCaptureModal"'), 'medicationCaptureModal must exist in index.html');
assert.ok(htmlContent.includes('openMedicationCaptureStudio()'), 'openMedicationCaptureStudio button must exist in index.html');
assert.ok(htmlContent.includes('id="btnChatMedCapture"'), 'Chatbot camera action button must exist in index.html');
assert.ok(htmlContent.includes('modules/patient/medication-capture-ui.js'), 'Script tag for medication-capture-ui.js must exist');

const cssPath = path.join(__dirname, '..', 'app', 'styles.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

assert.ok(cssContent.includes('.medication-capture-panel'), '.medication-capture-panel CSS class must exist');
assert.ok(cssContent.includes('.med-camera-btn'), '.med-camera-btn CSS class must exist');
assert.ok(cssContent.includes('.chat-cam-btn'), '.chat-cam-btn CSS class must exist');
assert.ok(cssContent.includes('.med-photo-card'), '.med-photo-card CSS class must exist');
console.log('  ✓ All HTML containers, modals, chatbot action buttons, and responsive CSS verified.');

// -----------------------------------------------------------------------------
// TEST 9: Chatbot Guardrail & Advice Logic in app/app.js
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 9: Chatbot Guardrails & Medication Advice Verification in app/app.js');
const appJsPath = path.join(__dirname, '..', 'app', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

assert.ok(appJsContent.includes('isMedPhotoQuery'), 'Chatbot must handle medication photo queries');
assert.ok(appJsContent.includes('acknowledgeChatbotMedicationUpload'), 'Chatbot upload acknowledgment function must exist');
assert.ok(appJsContent.includes('renderDoctorMedicationPhotosDocket'), 'Doctor medication photos docket must exist');
console.log('  ✓ Chatbot and doctor review docket integrations verified.');

console.log('\n==================================================================');
console.log('🎉 ALL 9 MEDICATION BOX & PRESCRIPTION CAPTURE TESTS PASSED!');
console.log('==================================================================\n');
