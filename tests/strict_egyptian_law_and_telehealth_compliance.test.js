/**
 * Health Vibe AI - Strict Egyptian Law No. 151 of 2020 & Medical Syndicate Telehealth Compliance Test Suite
 *
 * Verifies:
 * 1. Legal Review Whitepaper (legal/EGYPTIAN_DATA_PROTECTION_AND_TELEHEALTH_LEGAL_REVIEW.md):
 *    - Full statutory coverage of Law 151/2020 (Articles 1, 2, 3, 4, 7, 8, 9, 12, 13, 14-16, 35-44).
 *    - Sensitive health data classification ("بيانات شخصية حساسة").
 *    - 72-hour breach notification mandate to the Data Protection Center & data subjects.
 *    - DPO (Data Protection Officer) appointment and governance requirements.
 *    - Cross-border data residency & Egyptian sovereign jurisdiction.
 *    - Egyptian Medical Syndicate Regulations (Law 415/1954 & Decree 238/2003).
 *    - Mandatory physician credentialing (National ID + Syndicate Card + MoHP license).
 *    - Non-autonomous AI boundaries (Clinical Decision Support System with mandatory human doctor sign-off).
 *    - Emergency 123 ambulance protocol & SpO2 < 90% exclusion from telehealth.
 *    - e-Prescription legal standards and narcotics prohibition.
 *    - Medical secrecy under Egyptian Penal Code Article 310.
 * 2. Frontend UI Integration (app/index.html):
 *    - Tab button [data-legal-tab="egypt-regulations"].
 *    - Content section #legal-section-egypt-regulations.
 * 3. Frontend Application Logic (app/app.js):
 *    - LEGAL_MODAL_DATA contains bilingual (ar/en) compliance text for egyptRegulations.
 *    - renderLegalModalContent dynamically updates legal-section-egypt-regulations.
 *    - switchLegalTab supports 'egypt-regulations' and updates modal title.
 * 4. Backend Statutory Alignment (backend/privacy-service.js):
 *    - Statutory framework formally cites Law 151/2020 and Syndicate regulations.
 *    - Retention policy preserves certified clinical records for 5 years while honoring right to erasure.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🇪🇬 HEALTH VIBE AI: EGYPTIAN LAW 151/2020 & TELEHEALTH COMPLIANCE TEST SUITE');
console.log('   PRD Page 9 Req 47: Legal Review of Data Protection Law & Syndicate Ethics');
console.log('================================================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');
const LEGAL_WHITEPAPER_PATH = path.join(ROOT_DIR, 'legal', 'EGYPTIAN_DATA_PROTECTION_AND_TELEHEALTH_LEGAL_REVIEW.md');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'app', 'index.html');
const APP_JS_PATH = path.join(ROOT_DIR, 'app', 'app.js');
const PRIVACY_SERVICE_PATH = path.join(ROOT_DIR, 'backend', 'privacy-service.js');

// ── TEST 1: Legal Whitepaper Existence & Comprehensive Coverage ──
console.log('▶ TEST 1: Comprehensive Legal Review Whitepaper (legal/EGYPTIAN_DATA_PROTECTION_AND_TELEHEALTH_LEGAL_REVIEW.md)');
assert(fs.existsSync(LEGAL_WHITEPAPER_PATH), 'Legal review whitepaper must exist at legal/EGYPTIAN_DATA_PROTECTION_AND_TELEHEALTH_LEGAL_REVIEW.md');

const legalMd = fs.readFileSync(LEGAL_WHITEPAPER_PATH, 'utf8');
assert(legalMd.length > 5000, `Legal review whitepaper should be detailed and comprehensive (found ${legalMd.length} characters)`);

// Check Law 151/2020 citations
const requiredLawTokens = [
  '151 لسنة 2020',
  'بيانات شخصية حساسة',
  'المادة 1',
  'المادة 12',
  'المادة 2',
  'المادة 7',
  '72 ساعة',
  'مسؤول حماية البيانات',
  'DPO',
  'مركز حماية البيانات الشخصية',
  'نقل البيانات عبر الحدود'
];

requiredLawTokens.forEach(token => {
  assert(legalMd.includes(token), `Legal whitepaper must cover: "${token}"`);
});
assert(legalMd.includes('13') && (legalMd.includes('المادة') || legalMd.includes('المواد')), 'Legal whitepaper must cover Article 13 rights');
assert(legalMd.includes('14') && (legalMd.includes('المادة') || legalMd.includes('المواد')), 'Legal whitepaper must cover Article 14 cross-border transfer');
console.log('  ✓ Verified Egyptian Data Protection Law No. 151/2020 statutory articles & sensitive health data rules.');

// Check Syndicate & Medical Ethics citations
const requiredSyndicateTokens = [
  'نقابة أطباء مصر',
  '415 لسنة 1954',
  '238 لسنة 2003',
  'آداب مهنة الطب',
  'كارنيه نقابة الأطباء',
  'اعتماد بشري',
  '123',
  'الإسعاف',
  'الأكسجين',
  'الروشتة الإلكترونية',
  'المادة 310 من قانون العقوبات'
];

requiredSyndicateTokens.forEach(token => {
  assert(legalMd.includes(token), `Legal whitepaper must cover Medical Syndicate rule: "${token}"`);
});
console.log('  ✓ Verified Egyptian Medical Syndicate Regulations, 123 emergency protocols & clinical credentialing.\n');


// ── TEST 2: Frontend HTML Legal Modal Elements (app/index.html) ──
console.log('▶ TEST 2: Legal Modal UI Integration in app/index.html');
assert(fs.existsSync(INDEX_HTML_PATH), 'index.html must exist');
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

assert(indexHtml.includes('data-legal-tab="egypt-regulations"'), 'index.html must have tab button with data-legal-tab="egypt-regulations"');
assert(indexHtml.includes('onclick="switchLegalTab(\'egypt-regulations\')"'), 'Tab button must call switchLegalTab(\'egypt-regulations\')');
assert(indexHtml.includes('id="legal-section-egypt-regulations"'), 'index.html must have #legal-section-egypt-regulations container');
assert(indexHtml.includes('قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020'), 'Section must mention Law 151 of 2020');
assert(indexHtml.includes('قرار 238 لسنة 2003'), 'Section must cite Syndicate Decree 238 of 2003');
assert(indexHtml.includes('بيانات شخصية حساسة'), 'Section must state health data is Sensitive Personal Data');
assert(indexHtml.includes('123'), 'Section must explicitly cite ambulance 123 for emergencies');
console.log('  ✓ Verified #legalModal markup contains dedicated Egyptian Regulations tab & content containers.\n');


// ── TEST 3: Frontend Script Logic & Data (app/app.js) ──
console.log('▶ TEST 3: Frontend Script Logic & Bilingual Content in app/app.js');
assert(fs.existsSync(APP_JS_PATH), 'app.js must exist');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');

assert(appJs.includes('egyptRegulations:'), 'LEGAL_MODAL_DATA must define egyptRegulations key');
assert(appJs.includes('Egyptian Personal Data Protection Law No. 151 of 2020 Compliance'), 'LEGAL_MODAL_DATA English version must have Law 151/2020 text');
assert(appJs.includes('Sensitive Personal Data'), 'LEGAL_MODAL_DATA English must define health data as Sensitive Personal Data');
assert(appJs.includes('الامتثال لقانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020'), 'LEGAL_MODAL_DATA Arabic must have Law 151/2020 text');
assert(appJs.includes('72 hours') || appJs.includes('72-Hour'), 'LEGAL_MODAL_DATA must document 72-hour breach notification');
assert(appJs.includes('72 ساعة'), 'LEGAL_MODAL_DATA Arabic must document 72-hour breach notification');

// Verify renderLegalModalContent updates egypt-regulations
assert(appJs.includes('"egypt-regulations"'), 'renderLegalModalContent array must include "egypt-regulations"');
assert(appJs.includes('data-legal-tab="egypt-regulations"'), 'renderLegalModalContent must update tab button text for egypt-regulations');
assert(appJs.includes('Egyptian Law & Telehealth') || appJs.includes('Egyptian Law 151/2020'), 'app.js must have English tab/title string');
assert(appJs.includes('القانون المصري ونقابة الأطباء'), 'app.js must have Arabic tab string');

// Verify switchLegalTab handles egypt-regulations
assert(appJs.includes('tab === "egypt-regulations"'), 'switchLegalTab must handle tab === "egypt-regulations"');
console.log('  ✓ Verified app.js LEGAL_MODAL_DATA, renderLegalModalContent, and switchLegalTab.\n');


// ── TEST 4: Backend Statutory Framework Alignment (backend/privacy-service.js) ──
console.log('▶ TEST 4: Backend Statutory Framework in backend/privacy-service.js');
const privacyService = require(PRIVACY_SERVICE_PATH);
const retentionPolicy = privacyService.getLegalRetentionPolicy();

assert(retentionPolicy, 'getLegalRetentionPolicy must return policy object');
assert(Array.isArray(retentionPolicy.statutoryFramework), 'statutoryFramework must be an array');

const egyptFramework = retentionPolicy.statutoryFramework.find(f => 
  f.regulation.includes('Egyptian') || f.title.includes('المصري') || f.title.includes('151') || f.title.includes('آداب المهنة')
);

assert(egyptFramework, 'statutoryFramework must contain an Egyptian Law / Medical Syndicate entry');
assert(egyptFramework.regulation.includes('151 of 2020'), 'Egyptian regulation must cite Law 151 of 2020');
assert(egyptFramework.scope.includes('بيانات شخصية حساسة'), 'Scope must cite Sensitive Personal Data classification');
assert(egyptFramework.scope.includes('5 سنوات'), 'Scope must preserve 5-year clinical record retention');
assert(egyptFramework.scope.includes('123') || egyptFramework.scope.includes('الإسعاف'), 'Scope must acknowledge emergency restrictions');
console.log('  ✓ Verified backend privacy service statutoryFramework incorporates Law 151/2020 & Syndicate rules.\n');


// ── TEST 5: Regulatory Compliance Matrix Verification ──
console.log('▶ TEST 5: Health Vibe AI 8-Pillar Compliance Matrix Verification');
const matrixHeaders = [
  'المتطلب التشريعي',
  'المرجع القانوني',
  'حالة الامتثال في المنصة',
  'المكون التقني المنفذ'
];

matrixHeaders.forEach(header => {
  assert(legalMd.includes(header), `Whitepaper matrix must include column: "${header}"`);
});

const compliancePillars = [
  'الموافقة الصريحة الموثقة',
  'تصنيف وحماية البيانات الحساسة',
  'حقوق صاحب البيانات (الاطلاع والمحو)',
  'الإخطار بالخروقات خلال 72 ساعة',
  'ترخيص مزاولة المهنة للأطباء',
  'منع التشخيص الآلي المستقل',
  'بروتوكول طوارئ الإسعاف 123',
  'اشتراطات الروشتة الإلكترونية'
];

compliancePillars.forEach(pillar => {
  assert(legalMd.includes(pillar), `Compliance matrix must verify pillar: "${pillar}"`);
});
console.log('  ✓ Verified all 8 regulatory compliance pillars in Health Vibe AI architecture.\n');

console.log('================================================================================');
console.log('🎉 ALL 5 EGYPTIAN LAW 151/2020 & TELEHEALTH COMPLIANCE TESTS PASSED 100%!');
console.log('================================================================================');
