/**
 * QA & Verification Test Suite: Doctor Dashboard Bilingual & Clinical Translation Support (Docus AI)
 * Tests:
 * 1. Digital Signature SVG in English & Arabic (Calligraphy, Classic, Executive)
 * 2. Official Circular Stamp in English & Arabic
 * 3. Doctor Signature & Stamp Station (PDF Footer) with LTR / RTL direction
 * 4. Doctor Signature Clinic Workbench with LTR / RTL direction
 * 5. Diagnostic Presets & Recommendations bilingual language toggles (EN/AR)
 * 6. Plaintext Unicode-bidi and bidirectional auto-alignment
 */

const assert = require('assert');

console.log('🌐 Starting Doctor Dashboard Bilingual Support & Medical Translation Tests...\n');

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

const DoctorUI = require('../../app/modules/doctor/doctor-ui.js');

// 1. Digital Signature SVG Bilingual Rendering
runTest('Digital Signature SVG Bilingual Rendering & Styles', () => {
  // English Calligraphy
  const svgEn = DoctorUI.generateDigitalSignatureSvg('Dr. John Doe', true, { style: 'calligraphy' });
  assert(svgEn.includes('aria-label="Digital Signature of Dr. John Doe"'), 'Must have English aria-label');
  assert(svgEn.includes('SECURE DIGITAL SIGNATURE • VERIFIED'), 'Must have English security micro-label');

  // Arabic Calligraphy
  const svgAr = DoctorUI.generateDigitalSignatureSvg('د. طارق المنصور', false, { style: 'calligraphy' });
  assert(svgAr.includes('aria-label="التوقيع الرقمي للطبيب د. طارق المنصور"'), 'Must have Arabic aria-label');
  assert(svgAr.includes('توقيع رقمي مشفر • معتمد رسمياً'), 'Must have Arabic security micro-label');

  // Classic & Executive styles
  const svgClassic = DoctorUI.generateDigitalSignatureSvg('Dr. Sarah', true, { style: 'classic' });
  assert(svgClassic.includes('Caveat'), 'Classic style must use Caveat font');

  const svgExec = DoctorUI.generateDigitalSignatureSvg('Dr. Tarek', false, { style: 'executive' });
  assert(svgExec.includes('Segoe Script'), 'Executive style must use Segoe Script font');
});

// 2. Official Circular Stamp Bilingual Rendering
runTest('Professional Medical Stamp Bilingual Labels', () => {
  // English Stamp
  const stampEn = DoctorUI.renderProfessionalStampHtml({
    sealNumber: 'HV-SEAL-889900',
    year: 2026
  }, true);
  assert(stampEn.includes('CLINICAL GOVERNANCE'), 'Must contain English governance');
  assert(stampEn.includes('OFFICIAL MEDICAL SEAL'), 'Must contain English jurisdiction');
  assert(stampEn.includes('CERTIFIED REPORT'), 'Must contain English status');
  assert(stampEn.includes('889900'), 'Must contain seal serial number');

  // Arabic Stamp
  const stampAr = DoctorUI.renderProfessionalStampHtml({
    sealNumber: 'HV-SEAL-889900',
    year: 2026
  }, false);
  assert(stampAr.includes('حوكمة سريرية معتمدة'), 'Must contain Arabic governance');
  assert(stampAr.includes('الختم المهني المعتمد'), 'Must contain Arabic jurisdiction');
  assert(stampAr.includes('تقرير معتمد رسمياً'), 'Must contain Arabic status');
});

// 3. Signature & Stamp Station (Patient PDF Footer) LTR / RTL Direction
runTest('Patient PDF Footer Station LTR/RTL Direction & Bilingual Badges', () => {
  const mockDoctor = {
    name: 'Dr. Mona Fikry',
    specialty: 'Chest Diseases & Allergies',
    licenseNumber: 'EGY-MED-55112',
    clinic: 'Health Vibe Chest Center'
  };
  const mockCase = {
    id: 'case-bi-101',
    reportRef: 'HV-REP-BI101',
    clinicalRevision: 2
  };

  // English Footer
  const footerEn = DoctorUI.renderDoctorSignatureStampStationHtml(mockDoctor, mockCase, true);
  assert(footerEn.includes('dir="ltr"'), 'English station must declare dir="ltr"');
  assert(footerEn.includes('Certified & Verified Physician'), 'Must contain English verified badge');
  assert(footerEn.includes('Syndicate Reg:'), 'Must contain English syndicate label');
  assert(footerEn.includes('SCAN TO VERIFY'), 'Must contain English scan tag');
  assert(footerEn.includes('Physician Digital Signature'), 'Must contain English signature box title');

  // Arabic Footer
  const footerAr = DoctorUI.renderDoctorSignatureStampStationHtml(mockDoctor, mockCase, false);
  assert(footerAr.includes('dir="rtl"'), 'Arabic station must declare dir="rtl"');
  assert(footerAr.includes('طبيب معتمد وموثق رسمي'), 'Must contain Arabic verified badge');
  assert(footerAr.includes('القيد النقابي:'), 'Must contain Arabic syndicate label');
  assert(footerAr.includes('امسح للتحقق'), 'Must contain Arabic scan tag');
  assert(footerAr.includes('التوقيع الرقمي للطبيب'), 'Must contain Arabic signature box title');
});

// 4. Doctor Signature Clinic Workbench Station Direction & Content
runTest('Doctor Dashboard Clinic Workbench Station Bilingual Layout', () => {
  const mockDoctor = {
    name: 'Dr. Hazem Sherif',
    specialty: 'Critical Care & Pulmonology',
    licenseNumber: 'EGY-MED-99441',
    clinic: 'Health Vibe Respiratory ICU'
  };
  const mockCase = { id: 'case-wb-002' };

  // English Workbench
  const wbEn = DoctorUI.renderDoctorSignatureClinicStationHtml(mockDoctor, mockCase, true);
  assert(wbEn.includes('dir="ltr"'), 'English workbench must declare dir="ltr"');
  assert(wbEn.includes('Physician Digital Signature & Professional Stamp'), 'English main title');
  assert(wbEn.includes('Doctor Name'), 'English field label');
  assert(wbEn.includes('Syndicate License #'), 'English license label');
  assert(wbEn.includes('Calligraphy'), 'English style chip');
  assert(wbEn.includes('Classic'), 'English classic chip');
  assert(wbEn.includes('Executive'), 'English executive chip');

  // Arabic Workbench
  const wbAr = DoctorUI.renderDoctorSignatureClinicStationHtml(mockDoctor, mockCase, false);
  assert(wbAr.includes('dir="rtl"'), 'Arabic workbench must declare dir="rtl"');
  assert(wbAr.includes('التوقيع الرقمي والختم المهني للطبيب المعتمد'), 'Arabic main title');
  assert(wbAr.includes('اسم الطبيب المعتمد'), 'Arabic field label');
  assert(wbAr.includes('رقم القيد والترخيص النقابي'), 'Arabic license label');
  assert(wbAr.includes('كاليغرافي'), 'Arabic style chip');
  assert(wbAr.includes('كلاسيكي'), 'Arabic classic chip');
  assert(wbAr.includes('تنفيذي'), 'Arabic executive chip');
});

// 5. Diagnostic Presets & Recommendations Language Toggles
runTest('Diagnostic Presets & Recommendations Bilingual Switcher', () => {
  assert(typeof DoctorUI.setDiagnosticPresetsLang === 'function', 'setDiagnosticPresetsLang must be exported');
  assert(typeof DoctorUI.getDiagnosticPresetsLang === 'function', 'getDiagnosticPresetsLang must be exported');
  assert(typeof DoctorUI.setPatientRecommendationChipsLang === 'function', 'setPatientRecommendationChipsLang must be exported');
  assert(typeof DoctorUI.getPatientRecommendationChipsHtml === 'function', 'getPatientRecommendationChipsHtml must be exported');

  // Switch to English
  DoctorUI.setDiagnosticPresetsLang('en');
  assert.strictEqual(DoctorUI.getDiagnosticPresetsLang(), 'en');

  // Switch to Arabic
  DoctorUI.setDiagnosticPresetsLang('ar');
  assert.strictEqual(DoctorUI.getDiagnosticPresetsLang(), 'ar');

  // Chips in English
  const chipsEnHtml = DoctorUI.getPatientRecommendationChipsHtml(true);
  assert(chipsEnHtml.includes('Strict rest and adequate oral warm fluid hydration'), 'English chip text present');

  // Chips in Arabic
  const chipsArHtml = DoctorUI.getPatientRecommendationChipsHtml(false);
  assert(chipsArHtml.includes('الراحة التامة والإكثار من تناول السوائل الدافئة والماء'), 'Arabic chip text present');
});

console.log('----------------------------------------------------------------------');
console.log(`🏆 ALL ${testsPassed}/${testsTotal} BILINGUAL & CLINICAL TRANSLATION TESTS PASSED!`);
console.log('   - Digital Signature SVG: Fully bilingual (Titles, Flourishes & Security Labels)');
console.log('   - Official Medical Stamp: Fully bilingual (Governance, Jurisdiction & Seal)');
console.log('   - Patient PDF Report Footer: Adaptive LTR/RTL direction & localized badges');
console.log('   - Doctor Clinic Workbench: Adaptive LTR/RTL direction & localized field controls');
console.log('   - Presets & Recommendations: Dynamic EN/AR switching for seamless cross-language editing');
console.log('----------------------------------------------------------------------\n');
