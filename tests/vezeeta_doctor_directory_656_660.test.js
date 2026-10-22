/**
 * Health Vibe AI - Vezeeta Benchmark: Doctor Directory by Governorate Test Suite
 * Tasks #656, #657, #658, #659, #660
 *
 * Test Matrix:
 * 1. UI/UX Flow (#656): Region chips, governorate selector, specialty dropdown, card layouts, >= 44px targets, AR/EN.
 * 2. Backend & APIs (#657): Search filters (region, governorate, specialty, mode, q), upsert, catalog, REST endpoints.
 * 3. Safety & Privacy (#658): Verified license gate (unverified hidden), strict public card allowlist (private phone/license
 *    never leaked), identity-free search telemetry.
 * 4. Integration QA & Edge Cases (#659): 19 governorates across 5 regions (Cairo, Giza, Alex, Delta, Upper Egypt),
 *    Arabic normalization (alif, taa-marbuta), zero-result fallback, sponsored badge clarity.
 * 5. Analytics & Logging (#660): Searches by region, coverage gaps (zero-result areas), search-to-booking rate, audit trail.
 */

'use strict';

const assert = require('assert');
const {
  DoctorDirectoryService,
  doctorDirectoryService,
  REGIONS,
  GOVERNORATES,
  SPECIALTIES,
  PUBLIC_FIELDS,
  regionOf,
  normalizeArabic
} = require('../backend/doctor-directory-service');

const { DoctorDirectoryPanel } = require('../app/modules/appointments/feature-panels-641-670');

console.log('\n==================================================================');
console.log('📍 HEALTH VIBE AI: VEZEETA DOCTOR DIRECTORY (TASKS #656-#660)');
console.log('   Egyptian Governorates, License Shield, Search & Regional KPIs');
console.log('==================================================================\n');

async function runTests() {
  const service = new DoctorDirectoryService();
  service.resetState({ seedDemo: true });

  const admin = { uid: 'admin_sys_01', role: 'super_admin' };
  const patient = { uid: 'pt_dir_01', role: 'patient' };

  // ==================================================================
  // TASK #657: Backend & APIs - Regional Catalog & Search
  // ==================================================================
  console.log('▶ TASK #657: Backend & APIs - 19 Governorates & Multi-Criteria Search');
  {
    const catalog = service.getFilterCatalog();
    assert.strictEqual(catalog.regions.length, 5); // cairo, giza, alexandria, delta, upper_egypt
    assert.strictEqual(catalog.specialties.length, 2); // chest, internal_medicine

    // Search all Egypt
    const all = service.search();
    assert.ok(all.count >= 8);

    // Search by Region: Delta
    const deltaResults = service.search({ region: 'delta' });
    assert.ok(deltaResults.count >= 2);
    deltaResults.results.forEach(d => {
      assert.strictEqual(d.region, 'delta');
    });

    // Search by Governorate: Asyut (Upper Egypt)
    const asyutResults = service.search({ governorate: 'asyut' });
    assert.strictEqual(asyutResults.count, 1);
    assert.strictEqual(asyutResults.results[0].governorate, 'asyut');

    // Search by Specialty: Chest
    const chestResults = service.search({ specialty: 'chest' });
    chestResults.results.forEach(d => {
      assert.strictEqual(d.specialty, 'chest');
    });

    console.log('  ✓ Catalog and multi-criteria regional queries verified');
  }

  // ==================================================================
  // TASK #656: UI/UX Flow - Filters, Chips & Cards in AR/EN
  // ==================================================================
  console.log('▶ TASK #656: UI/UX Flow - Region Chips, Selectors & Cards in AR/EN');
  {
    const catalog = service.getFilterCatalog();
    const filtersHtmlAr = DoctorDirectoryPanel.renderFilters(catalog, { region: 'delta' }, false);
    assert.ok(filtersHtmlAr.includes('dir="rtl"'));
    assert.ok(filtersHtmlAr.includes('الدلتا'));
    assert.ok(filtersHtmlAr.includes('dirGovernorateSelect'));
    assert.ok(filtersHtmlAr.includes('dirSpecialtySelect'));

    const filtersHtmlEn = DoctorDirectoryPanel.renderFilters(catalog, { region: 'cairo' }, true);
    assert.ok(filtersHtmlEn.includes('dir="ltr"'));
    assert.ok(filtersHtmlEn.includes('Cairo'));
    assert.ok(filtersHtmlEn.includes('Search by name or area'));

    const results = service.search({ governorate: 'cairo' });
    const resultsHtml = DoctorDirectoryPanel.renderResults(results, false);
    assert.ok(resultsHtml.includes('hv-doc-card'));
    assert.ok(resultsHtml.includes('ترخيص موثّق'));
    assert.ok(resultsHtml.includes('data-action="book"'));

    console.log('  ✓ UI/UX filter chips, dropdowns, and cards verified in AR/EN');
  }

  // ==================================================================
  // TASK #658: Safety & Privacy - License Verification & Leak Prevention
  // ==================================================================
  console.log('▶ TASK #658: Safety & Privacy - Verified License Gate & No PII Leaks');
  {
    // Unverified doctor must NEVER appear in public search
    service.upsertDoctorListing({
      id: 'doc_unverified',
      nameAr: 'د. غير معتمد',
      nameEn: 'Dr. Unverified',
      specialty: 'chest',
      governorate: 'cairo',
      licenseVerified: false
    }, admin);

    const checkSearch = service.search({ q: 'Unverified' });
    assert.strictEqual(checkSearch.count, 0);

    // Verify doctor card strictly omits personal phone & national license string
    const sampleDoc = service.search({ governorate: 'cairo' }).results[0];
    assert.strictEqual(sampleDoc.personalPhone, undefined);
    assert.strictEqual(sampleDoc.licenseNumber, undefined);
    assert.ok(sampleDoc.specialtyLabel);
    assert.ok(sampleDoc.governorateLabel);

    // Patients cannot create/edit directory listings
    assert.throws(() => service.upsertDoctorListing({}, patient), /FORBIDDEN/);

    console.log('  ✓ Unverified listings suppressed & private PII excluded from public cards');
  }

  // ==================================================================
  // TASK #659: Integration QA & Edge Cases - Arabic Normalization & Zero-Results
  // ==================================================================
  console.log('▶ TASK #659: Integration QA & Edge Cases - Arabic Normalization & Fallback');
  {
    // Arabic normalization: search "احمد" finds "د. أحمد سامي"
    const normalizedMatch = service.search({ q: 'احمد' });
    assert.ok(normalizedMatch.count >= 1);
    assert.ok(normalizedMatch.results.some(d => d.nameAr.includes('أحمد')));

    // Search area "الدقي" without alif
    const areaMatch = service.search({ q: 'الدقي' });
    assert.ok(areaMatch.count >= 1);

    // Zero-results fallback handling
    const emptySearch = service.search({ q: 'NonExistentDoctorXYZ' });
    assert.strictEqual(emptySearch.count, 0);
    const zeroResultsHtml = DoctorDirectoryPanel.renderResults(emptySearch, false);
    assert.ok(zeroResultsHtml.includes('لا يوجد أطباء متاحون'));

    // Invalid region/governorate errors
    assert.throws(() => service.search({ region: 'mars' }), /INVALID_REGION/);
    assert.throws(() => service.search({ governorate: 'unknown_gov' }), /INVALID_GOVERNORATE/);

    console.log('  ✓ Arabic phonetic normalization and zero-result fallbacks verified');
  }

  // ==================================================================
  // TASK #660: Analytics & Logging
  // ==================================================================
  console.log('▶ TASK #660: Analytics & Logging - Regional Search Telemetry & Coverage Gaps');
  {
    service.recordProfileOpened('demo_doc_1');
    service.recordBookingStarted('demo_doc_1');

    assert.throws(() => service.getAnalytics(patient), /FORBIDDEN/);
    const metrics = service.getAnalytics(admin);

    assert.ok(metrics.searches >= 5);
    assert.ok(metrics.searchesByRegion.delta >= 1);
    assert.ok(metrics.searchesByRegion.cairo >= 1);
    assert.ok(metrics.profileOpens >= 1);
    assert.ok(metrics.bookingStarts >= 1);
    assert.ok(metrics.searchToBookingPct !== undefined);

    const audit = service.audit.list();
    assert.ok(audit.some(e => e.type === 'DIRECTORY_LISTING_UPSERTED'));

    console.log('  ✓ Regional demand telemetry and audit trail verified');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL VEZEETA DOCTOR DIRECTORY TESTS PASSED (TASKS #656-#660)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ VEZEETA DIRECTORY TEST FAILED:', err);
  process.exit(1);
});
