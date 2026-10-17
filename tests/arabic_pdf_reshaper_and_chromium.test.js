/**
 * Health Vibe AI - Arabic Reshaper & Chromium HTML-to-PDF Test Suite
 * Requirement #70: "إصلاح عرض الخطوط العربية في تقارير الـ PDF عبر استخدام Arabic Reshaper + bidi
 * أو توليد التقرير عبر HTML-to-PDF Chromium بخط عربي مدمج."
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Modules under test
const arabicReshaper = require('../backend/arabic-reshaper-service');
const clientReshaper = require('../app/modules/reports/arabic-reshaper-service');
const chromiumPdfService = require('../backend/chromium-pdf-service');
const ReportsService = require('../app/modules/reports/reports-service');

let passedTests = 0;
let totalTests = 0;

async function runTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('--- STARTING REQUIREMENT #70 ARABIC PDF RESHAPER & CHROMIUM TEST SUITE ---');

  // =============================================================================
  // SECTION 1: ARABIC RESHAPER GLYPH SHAPING & LIGATURES
  // =============================================================================
  console.log('\n[Suite 1: Arabic Reshaper Glyph Shaping]');

  await runTest('1.1 Should correctly identify Arabic text vs non-Arabic', () => {
    assert.strictEqual(arabicReshaper.isArabic('تقرير طبي معتمد'), true);
    assert.strictEqual(arabicReshaper.isArabic('Certified Medical Report'), false);
    assert.strictEqual(arabicReshaper.isArabic('12345'), false);
    assert.strictEqual(arabicReshaper.isArabic('Dr. Ahmed أحمد'), true);
  });

  await runTest('1.2 Should strip Arabic tashkeel/harakat when requested', () => {
    const withTashkeel = 'تَقْرِيرٌ طِبِّيٌّ مُعْتَمَدٌ';
    const stripped = arabicReshaper.stripTashkeel(withTashkeel);
    assert.strictEqual(stripped, 'تقرير طبي معتمد');
  });

  await runTest('1.3 Should shape isolated characters into Presentation Forms-B', () => {
    const shapedB = arabicReshaper.reshape('ب');
    assert.strictEqual(shapedB.charCodeAt(0), 0xFE8F);

    const shapedAlefHamza = arabicReshaper.reshape('أ');
    assert.strictEqual(shapedAlefHamza.charCodeAt(0), 0xFE83);
  });

  await runTest('1.4 Should shape dual-connecting letters into initial, medial, and final forms', () => {
    // Word 'طبيب':
    // ط (initial 0xFEC3) + ب (medial 0xFE92) + ي (medial 0xFEF4) + ب (final 0xFE90)
    const shapedTabib = arabicReshaper.reshape('طبيب');
    assert.strictEqual(shapedTabib.charCodeAt(0), 0xFEC3, 'Initial Taa');
    assert.strictEqual(shapedTabib.charCodeAt(1), 0xFE92, 'Medial Baa');
    assert.strictEqual(shapedTabib.charCodeAt(2), 0xFEF4, 'Medial Yaa');
    assert.strictEqual(shapedTabib.charCodeAt(3), 0xFE90, 'Final Baa');
  });

  await runTest('1.5 Should correctly handle non-connecting letters (Alif, Dal, Raa, Waw)', () => {
    // Word 'أحمد':
    // أ (isolated 0xFE83) + ح (initial 0xFEA3) + م (medial 0xFEE4) + د (final 0xFEAA)
    const shapedAhmed = arabicReshaper.reshape('أحمد');
    assert.strictEqual(shapedAhmed.charCodeAt(0), 0xFE83, 'Isolated Alif with Hamza');
    assert.strictEqual(shapedAhmed.charCodeAt(1), 0xFEA3, 'Initial Haa');
    assert.strictEqual(shapedAhmed.charCodeAt(2), 0xFEE4, 'Medial Meem');
    assert.strictEqual(shapedAhmed.charCodeAt(3), 0xFEAA, 'Final Dal');
  });

  await runTest('1.6 Should generate standard Lam-Alef isolated ligature (لا -> 0xFEFB)', () => {
    const shaped = arabicReshaper.reshape('لا');
    assert.strictEqual(shaped.charCodeAt(0), 0xFEFB, 'Lam-Alef isolated ligature');
  });

  await runTest('1.7 Should generate standard Lam-Alef final ligature (ـلا -> 0xFEFC)', () => {
    // Word 'سلام' (Seen + Lam + Alef + Meem)
    // س (initial 0xFEB3) + لا (final ligature 0xFEFC) + م (final 0xFEE0)
    const shaped = arabicReshaper.reshape('سلام');
    assert.strictEqual(shaped.charCodeAt(1), 0xFEFC, 'Lam-Alef final ligature');
  });

  await runTest('1.8 Client-side reshaper should match backend reshaper identically', () => {
    const text = 'مركز هيلث فايب الطبي التخصصي';
    const backendResult = arabicReshaper.reshape(text);
    const clientResult = clientReshaper.reshape(text);
    assert.strictEqual(backendResult, clientResult);
  });

  // =============================================================================
  // SECTION 2: BIDIRECTIONAL (BIDI) REORDERING ENGINE
  // =============================================================================
  console.log('\n[Suite 2: Bidirectional Reordering]');

  await runTest('2.1 Should invert pure Arabic strings for LTR PDF canvases', () => {
    const text = 'تقرير معتمد';
    const reshaped = arabicReshaper.reshape(text);
    const bidi = arabicReshaper.bidi(reshaped);
    assert.notStrictEqual(bidi, text);
    assert.strictEqual(bidi.endsWith(reshaped.charAt(0)), true);
  });

  await runTest('2.2 Should preserve left-to-right numbers in mixed clinical strings', () => {
    const clinicalVitals = 'ضغط الدم 120/80 مللم زئبق';
    const processed = arabicReshaper.processArabic(clinicalVitals);
    assert.ok(processed.includes('120/80'), 'Vitals numeric string preserved');
  });

  await runTest('2.3 Should preserve Latin brand names and IDs in mixed text', () => {
    const reportHeader = 'التقرير الطبي HV-REP-902 لعام 2026';
    const processed = arabicReshaper.processArabic(reportHeader);
    assert.ok(processed.includes('HV-REP-902'), 'Preserved report reference code');
    assert.ok(processed.includes('2026'), 'Preserved year digits');
  });

  // =============================================================================
  // SECTION 3: REPORTS SERVICE ARABIC RESHAPING INTEGRATION
  // =============================================================================
  console.log('\n[Suite 3: Reports Service Integration]');

  await runTest('3.1 ReportsService should expose Arabic reshaping helper functions', () => {
    assert.strictEqual(typeof ReportsService.getArabicReshaper, 'function');
    assert.strictEqual(typeof ReportsService.reshapeArabicText, 'function');
    assert.strictEqual(typeof ReportsService.bidiReorder, 'function');
    assert.strictEqual(typeof ReportsService.processArabicForPdf, 'function');
  });

  await runTest('3.2 ReportsService.processArabicForPdf should shape Arabic text', () => {
    const raw = 'التشخيص السريري النهائي';
    const shaped = ReportsService.processArabicForPdf(raw);
    assert.notStrictEqual(shaped, raw);
    assert.ok(typeof shaped === 'string' && shaped.length > 0);
  });

  await runTest('3.3 generateCertifiedReportPdfHtml should include Cairo + Tajawal fonts and OpenType font-feature-settings', () => {
    const mockRecord = {
      id: 'rep-70-test-01',
      reportRef: 'HV-REP-2026-70',
      patientName: 'عمر الفاروق',
      caseId: 'case-70',
      clinicalDiagnosis: 'التهاب حاد في الشعب الهوائية',
      medications: 'أموكسيسيلين 500 ملغ كل 8 ساعات',
      recommendations: ['الراحة التامة لمدة 3 أيام', 'شرب السوائل الدافئة'],
      createdAt: new Date().toISOString()
    };

    const html = ReportsService.generateCertifiedReportPdfHtml(mockRecord, 'ar');
    assert.ok(html.includes('dir="rtl"'), 'Includes dir=rtl');
    assert.ok(html.includes('lang="ar"'), 'Includes lang=ar');
    assert.ok(html.includes('Cairo'), 'Includes Cairo font');
    assert.ok(html.includes('Tajawal'), 'Includes Tajawal font');
    assert.ok(html.includes('font-feature-settings'), 'Includes font-feature-settings for ligatures');
    assert.ok(html.includes('optimizeLegibility'), 'Includes optimizeLegibility');
    assert.ok(html.includes('unicode-bidi'), 'Includes unicode-bidi isolation');
    assert.ok(html.includes('window.downloadCertifiedPdf'), 'Includes download certified PDF button handler');
  });

  // =============================================================================
  // SECTION 4: CHROMIUM HTML-TO-PDF GENERATION
  // =============================================================================
  console.log('\n[Suite 4: Chromium HTML-to-PDF Engine]');

  await runTest('4.1 prepareHtmlForChromiumPdf should inject embedded print styling and HarfBuzz rules', () => {
    const simpleHtml = '<html><head><title>Test Report</title></head><body><h1>تقرير طبي</h1></body></html>';
    const prepared = chromiumPdfService.prepareHtmlForChromiumPdf(simpleHtml);
    assert.ok(prepared.includes('hv-arabic-embedded-print-rules'));
    assert.ok(prepared.includes('font-feature-settings: "kern" 1, "liga" 1'));
    assert.ok(prepared.includes('A4 portrait'));
  });

  await runTest('4.2 generateFallbackPdfBuffer should output a compliant %PDF-1.4 file', () => {
    const html = '<html><head><title>HealthVibe Report 902</title></head><body>Content</body></html>';
    const buffer = chromiumPdfService.generateFallbackPdfBuffer(html);
    assert.ok(Buffer.isBuffer(buffer));
    assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
    assert.ok(buffer.toString('utf8').includes('%%EOF'));
    assert.ok(buffer.toString('utf8').includes('HealthVibe AI Arabic PDF Engine'));
  });

  await runTest('4.3 generatePdfFromHtml should produce a valid PDF Buffer', async () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تقرير فحص سريري معتمد</title>
        <style>
          body { font-family: 'Cairo', sans-serif; direction: rtl; }
        </style>
      </head>
      <body>
        <h2>مركز هيلث فايب الطبي التخصصي</h2>
        <p>اسم المريض: طارق عبد العزيز</p>
        <p>التشخيص: تعافي تام ولله الحمد</p>
      </body>
      </html>
    `;

    const pdfBuffer = await chromiumPdfService.generatePdfFromHtml(sampleHtml);
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 500, `Buffer length ${pdfBuffer.length} must be substantial`);
    assert.strictEqual(pdfBuffer.slice(0, 5).toString('ascii'), '%PDF-');
  });

  // =============================================================================
  // SECTION 5: PYTHON-BIDI REFERENCE SCRIPT VERIFICATION
  // =============================================================================
  console.log('\n[Suite 5: Python Arabic Reshaper Script]');

  await runTest('5.1 scripts/arabic_pdf_reshaper.py should exist and contain reference reshaper logic', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'arabic_pdf_reshaper.py');
    assert.ok(fs.existsSync(scriptPath), 'Script file must exist');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('reshape_arabic_for_pdf'));
    assert.ok(content.includes('arabic_reshaper'));
    assert.ok(content.includes('python-bidi') || content.includes('bidi.algorithm'));
  });

  // =============================================================================
  // SECTION 6: BACKEND SERVER API ROUTES VERIFICATION
  // =============================================================================
  console.log('\n[Suite 6: Server API Routes]');

  await runTest('6.1 Express server should have /api/reports/html-to-pdf and /api/reports/reshape-arabic registered', async () => {
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverCode.includes("app.post('/api/reports/html-to-pdf'"));
    assert.ok(serverCode.includes("app.post('/api/reports/reshape-arabic'"));
  });

  // Final report
  console.log(`\n=======================================================`);
  console.log(` REQUIREMENT #70 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log(`=======================================================\n`);
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
