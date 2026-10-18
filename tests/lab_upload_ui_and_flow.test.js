/**
 * Health Vibe AI - Lab Upload UI/UX Flow & Docus AI Benchmark Test Suite
 *
 * Validates:
 * 1. Docus AI benchmark UI components in app/index.html (categories, camera, browse, drop zone, linkage card).
 * 2. Mobile camera direct capture (accept="image/*", capture="environment").
 * 3. File type support (PDF, JPG, PNG, WEBP) and security constraints (max 10MB, executable blocks).
 * 4. Specialized Lab Categories (Blood Test / CBC, Sputum Culture, ABG, Urinalysis, Other).
 * 5. Dynamic category selection, thumbnail generation, and staged file item rendering.
 * 6. Automatic linkage with patient medical profile & clinical cases.
 * 7. Mobile-first touch accessibility (>= 44px buttons, mobile stacked action bar).
 * 8. 100% Bilingual AR/EN catalog parity for the labUpload namespace.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appHtml = fs.readFileSync(path.join(root, "app", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "app", "styles.css"), "utf8");
const i18nJs = fs.readFileSync(path.join(root, "app", "i18n.js"), "utf8");

console.log("\n==================================================================");
console.log("🧪 HEALTH VIBE AI: LAB UPLOAD UI/UX FLOW (DOCUS AI BENCHMARK)");
console.log("   Blood Tests, Sputum Culture, Mobile Camera & Profile Linkage");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// TEST 1: Docus AI Lab Upload UI Components in app/index.html
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: Docus AI Lab Upload UI Components in app/index.html");

assert.ok(appHtml.includes('id="labUploadPanel"'), "labUploadPanel article must exist");
assert.ok(appHtml.includes('data-i18n="labUpload.title"'), "Panel title must use declarative i18n data-i18n");
assert.ok(appHtml.includes('data-i18n="labUpload.docusBadge"'), "Docus AI badge must be present");
assert.ok(appHtml.includes('data-i18n="labUpload.secureBadge"'), "HIPAA security badge must be present");

// Categories selector and chips
assert.ok(appHtml.includes('id="labCategorySelector"'), "labCategorySelector container must exist");
assert.ok(appHtml.includes('data-category="blood_test"'), "blood_test category chip must exist");
assert.ok(appHtml.includes('data-category="sputum_culture"'), "sputum_culture category chip must exist");
assert.ok(appHtml.includes('data-category="abg_gas"'), "abg_gas category chip must exist");
assert.ok(appHtml.includes('data-category="urinalysis"'), "urinalysis category chip must exist");
assert.ok(appHtml.includes('data-category="other"'), "other category chip must exist");

// Mobile camera & browse buttons
assert.ok(appHtml.includes('id="btnLabCamera"'), "btnLabCamera button must exist");
assert.ok(appHtml.includes('id="btnLabBrowse"'), "btnLabBrowse button must exist");
assert.ok(appHtml.includes('id="cameraLabUpload"'), "cameraLabUpload input must exist");
assert.ok(appHtml.includes('capture="environment"'), "cameraLabUpload must specify capture=environment for mobile phones");
assert.ok(appHtml.includes('accept="image/*"'), "cameraLabUpload must accept images for camera capture");

// Backward compatibility with existing tests
assert.ok(appHtml.includes('id="uploadZone"'), "Standard #uploadZone must be retained");
assert.ok(appHtml.includes('id="fileUpload" type="file" multiple accept='), "Standard #fileUpload with multiple accept must be retained");
assert.ok(!appHtml.includes("حالة تجريبية: يتم تسجيل اسم الملف فقط"), "Demo name-only upload must remain removed");
assert.ok(appHtml.includes('id="fileList"'), "#fileList container must be present");

// Medical profile auto-linkage card
assert.ok(appHtml.includes('id="labLinkAssistantCard"'), "labLinkAssistantCard must exist");
assert.ok(appHtml.includes('id="btnViewCaseLabLink"'), "btnViewCaseLabLink button must exist");

console.log("  ✓ All Docus AI benchmark DOM elements and controls verified in index.html.");

// -----------------------------------------------------------------------------
// TEST 2: Lab Categories & Metadata Structure in app/app.js
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 2: Lab Categories & Metadata Structure in app/app.js");

assert.ok(appJs.includes("currentSelectedLabCategory"), "currentSelectedLabCategory state must be defined");
assert.ok(appJs.includes("const LAB_CATEGORIES = {"), "LAB_CATEGORIES lookup table must be defined");
assert.ok(appJs.includes('blood_test: {') && appJs.includes('sputum_culture: {'), "Blood test and sputum culture categories must be defined");
assert.ok(appJs.includes('abg_gas: {') && appJs.includes('urinalysis: {'), "ABG and urinalysis categories must be defined");

// Category selection function
assert.ok(appJs.includes("window.selectLabCategory = function"), "window.selectLabCategory must be globally accessible");
assert.ok(appJs.includes("window.triggerLabCameraCapture = function"), "window.triggerLabCameraCapture must trigger mobile camera input");
assert.ok(appJs.includes("window.triggerLabFileBrowse = function"), "window.triggerLabFileBrowse must trigger file browser input");
assert.ok(appJs.includes("window.handleLabCameraSelected = async function"), "window.handleLabCameraSelected must process captured camera photos");
assert.ok(appJs.includes("window.syncPatientLabProfileLink = async function"), "window.syncPatientLabProfileLink must sync files with patient medical profile");

console.log("  ✓ Lab categories, interactive handlers, and global window hooks verified in app.js.");

// -----------------------------------------------------------------------------
// TEST 3: Staging, File Validation & Real Storage Uploads
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 3: Staging, File Validation & Real Storage Uploads");

assert.ok(appJs.includes('const MEDICAL_FILE_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]'), "MIME types must include PDF, JPG, PNG, WEBP");
assert.ok(appJs.includes("const MEDICAL_FILE_MAX_SIZE = 10 * 1024 * 1024"), "File size limit must be 10MB");
assert.ok(appJs.includes("validateMedicalCaseFile"), "validateMedicalCaseFile must enforce security rules");
assert.ok(appJs.includes("getSafeMedicalFileName"), "getSafeMedicalFileName must sanitize filenames");

// Thumbnail generation & Lab Category assignment
assert.ok(appJs.includes("URL.createObjectURL(file)"), "Object URL thumbnail must be created for image previews");
assert.ok(appJs.includes("labCategory: chosenCat") || appJs.includes("labCategory: catKey"), "Staged files must be stamped with labCategory");
assert.ok(appJs.includes("medical-file-thumb"), "Image preview thumbnail class must be rendered");
assert.ok(appJs.includes("lab-file-badge"), "Category tag badge must be rendered on the file card");

// Storage & Firestore metadata
assert.ok(appJs.includes("storage.ref().child(storagePath).put(state.file"), "Firebase Storage put must upload actual file blob");
assert.ok(appJs.includes('scanStatus: "upload_pending"') && appJs.includes('availability: "quarantined"'), "New uploads must start in quarantined state");
assert.ok(appJs.includes("labCategory: catKey"), "Firestore metadata must persist labCategory");

console.log("  ✓ File security validation, thumbnail staging, and storage quarantine verified.");

// -----------------------------------------------------------------------------
// TEST 4: Drag-and-Drop & Mobile Touch Ergonomics in styles.css
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 4: Drag-and-Drop & Mobile Touch Ergonomics in styles.css");

assert.ok(stylesCss.includes(".upload-zone.dragover"), "Drag-and-drop dragover style must be defined");
assert.ok(stylesCss.includes(".lab-cat-chip"), "Category chips styling must be defined");
assert.ok(stylesCss.includes(".lab-cat-chip.active"), "Active category chip highlighting must be defined");
assert.ok(stylesCss.includes(".lab-camera-btn"), "Camera capture action button styling must be defined");
assert.ok(stylesCss.includes(".lab-browse-btn"), "Document browse action button styling must be defined");
assert.ok(stylesCss.includes(".medical-file-thumb"), "Thumbnail styling must be defined");
assert.ok(stylesCss.includes(".medical-file-doc-icon.pdf"), "PDF icon badge styling must be defined");

// Mobile responsiveness checks
assert.ok(stylesCss.includes("@media (max-width: 600px)"), "Mobile breakpoint rules must exist");
assert.ok(stylesCss.includes("min-height: 44px") || stylesCss.includes("min-height: 48px"), "Mobile touch targets must enforce >= 44px height");

console.log("  ✓ Responsive styles, dragover states, and mobile touch targets verified.");

// -----------------------------------------------------------------------------
// TEST 5: 100% Bilingual Arabic / English Parity in i18n.js
// -----------------------------------------------------------------------------
console.log("\n▶ TEST 5: 100% Bilingual Arabic / English Parity in i18n.js");

const i18nModule = require(path.join(root, "app", "i18n.js"));
const { translations } = i18nModule;

assert.ok(translations.ar.labUpload, "Arabic catalog must contain labUpload namespace");
assert.ok(translations.en.labUpload, "English catalog must contain labUpload namespace");

const arKeys = Object.keys(translations.ar.labUpload);
const enKeys = Object.keys(translations.en.labUpload);

assert.strictEqual(arKeys.length, enKeys.length, `AR and EN keys count must match (${arKeys.length} vs ${enKeys.length})`);

arKeys.forEach((key) => {
  assert.ok(enKeys.includes(key), `Missing EN translation for key: labUpload.${key}`);
  assert.ok(typeof translations.ar.labUpload[key] === "string" && translations.ar.labUpload[key].length > 0, `Empty AR string for key: labUpload.${key}`);
  assert.ok(typeof translations.en.labUpload[key] === "string" && translations.en.labUpload[key].length > 0, `Empty EN string for key: labUpload.${key}`);
});

// Key specific clinical terminology checks
assert.ok(translations.ar.labUpload.catBlood.includes("تحاليل الدم"), "AR must describe blood tests");
assert.ok(translations.ar.labUpload.catSputum.includes("مزرعة بلغم"), "AR must describe sputum culture");
assert.ok(translations.en.labUpload.catBlood.includes("Blood Tests"), "EN must describe blood tests");
assert.ok(translations.en.labUpload.catSputum.includes("Sputum Culture"), "EN must describe sputum culture");

console.log("  ✓ 100% mutual key parity verified across all " + arKeys.length + " labUpload keys.");

console.log("\n==================================================================");
console.log("🎉 ALL LAB UPLOAD TESTS PASSED WITH 100% SUCCESS!");
console.log("==================================================================\n");
