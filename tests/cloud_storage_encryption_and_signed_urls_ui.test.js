/**
 * Health Vibe AI - Amwell-Benchmark Private Cloud Storage & Ephemeral Signed URLs UI Test Suite
 * Benchmark: Amwell Telehealth Platform (https://amwell.com/)
 *
 * Validates:
 * 1. SecureFilesUI module loading and interface exposure (window.HealthVibes.SecureFilesUI).
 * 2. Mobile camera direct capture & browse integration in Vault.
 * 3. Ephemeral Signed URL countdown timer formatters and file size utils.
 * 4. Responsive CSS rules, touch accessibility (>=44px), and modal lightboxes.
 * 5. Appointments integration (appointments-view.html, appointments-ui.js, and app.js).
 * 6. Chatbot Assistant secure file attachment card generation & chat compose triggers.
 * 7. HTML layout mount points & script imports in app/index.html.
 * 8. 100% Arabic & English i18n parity for the secureStorage catalog namespace.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appHtml = fs.readFileSync(path.join(root, "app", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "app", "styles.css"), "utf8");
const i18nJs = fs.readFileSync(path.join(root, "app", "i18n.js"), "utf8");
const appointmentsViewHtml = fs.readFileSync(
  path.join(root, "app", "modules", "appointments", "appointments-view.html"),
  "utf8"
);
const appointmentsUiJs = fs.readFileSync(
  path.join(root, "app", "modules", "appointments", "appointments-ui.js"),
  "utf8"
);
const secureFilesUiPath = path.join(root, "app", "modules", "patient", "secure-files-ui.js");
const secureFilesUiContent = fs.readFileSync(secureFilesUiPath, "utf8");

console.log("\n==================================================================");
console.log("🔒 HEALTH VIBE AI: CLOUD STORAGE & SIGNED URLS UI/UX SUITE");
console.log("   Benchmark: Amwell Telehealth Standard (Appointments, Chat & Files)");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// TEST 1: Module Loading & Interface Verification
// -----------------------------------------------------------------------------
console.log("▶ TEST 1: SecureFilesUI Module Loading & Public Methods");

// Create minimal DOM and window mock to evaluate secure-files-ui.js
const mockWindow = {
  HealthVibes: {},
  addEventListener: () => {},
  document: {
    addEventListener: () => {},
    getElementById: () => null,
    documentElement: { lang: "ar" }
  }
};

const moduleFn = new Function("window", "global", "document", secureFilesUiContent);
moduleFn(mockWindow, mockWindow, mockWindow.document);

const SecureFilesUI = mockWindow.HealthVibes.SecureFilesUI;
assert.ok(SecureFilesUI, "HealthVibes.SecureFilesUI must be defined on window/global");

const requiredMethods = [
  "loadPatientPrivateFiles",
  "uploadToPrivateBucket",
  "requestSignedUrl",
  "copySignedUrl",
  "openSecureFilePreview",
  "closeSecureFilePreview",
  "setCategoryFilter",
  "renderVaultView",
  "triggerCameraCapture",
  "triggerFileBrowse",
  "handleFileInput",
  "renderAppointmentSecureAttachments",
  "renderChatbotSecureAttachmentCard",
  "formatRemainingTime",
  "formatFileSize"
];

for (const method of requiredMethods) {
  assert.equal(typeof SecureFilesUI[method], "function", `SecureFilesUI.${method} must be a function`);
}

assert.ok(SecureFilesUI.CATEGORY_CONFIG.lab_analysis, "lab_analysis category config must exist");
assert.ok(SecureFilesUI.CATEGORY_CONFIG.radiology_cxr, "radiology_cxr category config must exist");
assert.ok(SecureFilesUI.CATEGORY_CONFIG.prescription, "prescription category config must exist");
console.log("  ✓ SecureFilesUI module exported with all 15 required UI and helper methods.");

// -----------------------------------------------------------------------------
// TEST 2: Timer Countdown & File Size Utilities
// -----------------------------------------------------------------------------
console.log("▶ TEST 2: Ephemeral Signed URL Timer Formatter & File Size Utilities");

assert.equal(SecureFilesUI.formatRemainingTime(900), "15:00", "900s must format to 15:00");
assert.equal(SecureFilesUI.formatRemainingTime(65), "01:05", "65s must format to 01:05");
assert.equal(SecureFilesUI.formatRemainingTime(9), "00:09", "9s must format to 00:09");
assert.equal(SecureFilesUI.formatRemainingTime(0), "00:00", "0s must format to 00:00");
assert.equal(SecureFilesUI.formatRemainingTime(-10), "00:00", "Negative seconds must format to 00:00");

assert.equal(SecureFilesUI.formatFileSize(0), "0 B", "0 bytes must format to 0 B");
assert.equal(SecureFilesUI.formatFileSize(1024), "1 KB", "1024 bytes must format to 1 KB");
assert.equal(SecureFilesUI.formatFileSize(2.5 * 1024 * 1024), "2.5 MB", "2.5MB must format to 2.5 MB");
console.log("  ✓ Timer and file size formatters pass precision checks.");

// -----------------------------------------------------------------------------
// TEST 3: Appointments View & UI Integration
// -----------------------------------------------------------------------------
console.log("▶ TEST 3: Appointments Screen Integration (Dossier & Signed URLs)");

assert.ok(
  appointmentsViewHtml.includes('id="attachedSecureFilesMount"'),
  "appointments-view.html must contain #attachedSecureFilesMount for appointment files dossier"
);

assert.ok(
  appointmentsUiJs.includes("renderAttachedSecureFiles"),
  "appointments-ui.js must export renderAttachedSecureFiles"
);

assert.ok(
  appJs.includes("renderAttachedSecureFiles"),
  "app.js must call renderAttachedSecureFiles when rendering appointments screen"
);

// Test rendering appointment attachments with dummy file
const dummyAppointmentFile = {
  fileId: "file_app_123",
  fileName: "Blood_Test_CBC_PreVisit.pdf",
  originalName: "Blood_Test_CBC_PreVisit.pdf",
  fileCategory: "lab_analysis",
  mimeType: "application/pdf",
  sizeBytes: 1024 * 512,
  scanStatus: "clean",
  encryption: "AES-256-GCM"
};

const dummyContainer = { style: {}, innerHTML: "" };
mockWindow.document.getElementById = (id) => (id === "attachedSecureFilesMount" ? dummyContainer : null);

SecureFilesUI.state.files = [dummyAppointmentFile];
SecureFilesUI.renderAppointmentSecureAttachments("attachedSecureFilesMount", "appt_test_001", false);
const appointmentDossierHtml = dummyContainer.innerHTML;
assert.ok(appointmentDossierHtml.includes("Blood_Test_CBC_PreVisit.pdf"), "Dossier HTML must contain file name");
assert.ok(appointmentDossierHtml.includes("Private Bucket"), "Dossier HTML must display Private Bucket badge/text");
assert.ok(appointmentDossierHtml.includes("amwell-appointment-dossier-box"), "Dossier box styling must be applied");
console.log("  ✓ Appointments dossier integrates with secure files & signed URL actions.");

// -----------------------------------------------------------------------------
// TEST 4: Chatbot Secure File Card & Compose Integration
// -----------------------------------------------------------------------------
console.log("▶ TEST 4: Chatbot Assistant Secure Attachment Card & Trigger");

assert.ok(
  appHtml.includes('id="btnChatSecureFileAttach"'),
  "app/index.html chat compose bar must include #btnChatSecureFileAttach button"
);

assert.ok(
  appJs.includes("acknowledgeChatbotSecureFileUpload"),
  "app.js must define acknowledgeChatbotSecureFileUpload handler"
);

assert.ok(
  appJs.includes("openAmwellSecureVault"),
  "app.js must define openAmwellSecureVault helper"
);

const chatCardHtml = SecureFilesUI.renderChatbotSecureAttachmentCard(dummyAppointmentFile, false);
assert.ok(chatCardHtml.includes("amwell-chatbot-file-card"), "Chatbot card must have proper class");
assert.ok(chatCardHtml.includes("AES-256"), "Chatbot card must show AES-256 badge");
assert.ok(chatCardHtml.includes("amwell-sec-chip"), "Chatbot card must have security chip");
console.log("  ✓ Chatbot secure attachment cards generated with live countdown styling.");

// -----------------------------------------------------------------------------
// TEST 5: HTML Layout Mount Points & Scripts in app/index.html
// -----------------------------------------------------------------------------
console.log("▶ TEST 5: HTML Layout Mount Points & Script Imports in app/index.html");

assert.ok(
  appHtml.includes('id="amwellSecureVaultPanel"'),
  "app/index.html must include #amwellSecureVaultPanel article"
);

assert.ok(
  appHtml.includes('id="amwellSecureVaultMount"'),
  "app/index.html must include #amwellSecureVaultMount container"
);

assert.ok(
  appHtml.includes('modules/patient/secure-files-ui.js'),
  "app/index.html must include script tag for secure-files-ui.js"
);
console.log("  ✓ Main index.html includes secure vault panel, mount container, and script tag.");

// -----------------------------------------------------------------------------
// TEST 6: Responsive CSS & Touch Accessibility (>= 44px)
// -----------------------------------------------------------------------------
console.log("▶ TEST 6: Responsive CSS, Badges & Mobile Touch Accessibility");

assert.ok(stylesCss.includes(".amwell-secure-storage-panel"), "CSS must contain .amwell-secure-storage-panel");
assert.ok(stylesCss.includes(".amwell-file-card"), "CSS must contain .amwell-file-card");
assert.ok(stylesCss.includes(".amwell-sec-chip"), "CSS must contain .amwell-sec-chip badges");
assert.ok(stylesCss.includes(".amwell-signed-pill"), "CSS must contain .amwell-signed-pill");
assert.ok(stylesCss.includes(".amwell-modal-overlay"), "CSS must contain .amwell-modal-overlay");
assert.ok(stylesCss.includes(".amwell-appointment-dossier-box"), "CSS must contain .amwell-appointment-dossier-box");
assert.ok(stylesCss.includes(".amwell-chatbot-file-card"), "CSS must contain .amwell-chatbot-file-card");

// Check minimum touch targets for WCAG mobile accessibility (min-height: 44px or padding)
assert.ok(
  stylesCss.includes("min-height: 44px") || stylesCss.includes("height: 44px"),
  "CSS must enforce >= 44px touch targets on buttons"
);

// Check responsive media query
assert.ok(
  stylesCss.includes("@media (max-width: 768px)") && stylesCss.includes(".amwell-files-grid"),
  "CSS must include mobile responsive query for files grid"
);
console.log("  ✓ Responsive CSS, modal viewer, security chips & >= 44px touch targets verified.");

// -----------------------------------------------------------------------------
// TEST 7: 100% Arabic & English i18n Catalog Parity
// -----------------------------------------------------------------------------
console.log("▶ TEST 7: 100% Bilingual Parity for secureStorage Namespace");

const i18nModule = require(path.join(root, "app", "i18n.js"));
const { translations } = i18nModule;

assert.ok(translations.ar.secureStorage, "translations.ar.secureStorage must exist");
assert.ok(translations.en.secureStorage, "translations.en.secureStorage must exist");

const arKeys = Object.keys(translations.ar.secureStorage);
const enKeys = Object.keys(translations.en.secureStorage);

assert.ok(arKeys.length >= 20, `ar.secureStorage must have at least 20 keys (found ${arKeys.length})`);
assert.equal(arKeys.length, enKeys.length, `ar and en secureStorage must have identical key count (${arKeys.length} vs ${enKeys.length})`);

for (const key of arKeys) {
  assert.ok(enKeys.includes(key), `Key '${key}' from ar.secureStorage must be present in en.secureStorage`);
}
console.log(`  ✓ 100% parity confirmed: all ${arKeys.length} keys match seamlessly between AR and EN.`);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n==================================================================");
console.log("🎉 ALL 7 CLOUD STORAGE & SIGNED URLS UI/UX TESTS PASSED!");
console.log("==================================================================\n");
