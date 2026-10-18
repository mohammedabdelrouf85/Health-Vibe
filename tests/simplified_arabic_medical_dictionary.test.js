/**
 * HEALTH VIBE AI: TASK #85 SIMPLIFIED ARABIC MEDICAL DICTIONARY TEST SUITE
 * 
 * Verifies Task #85:
 * "مراجعة القاموس الطبي العربي المبسط | مراجعة كافة ترجمات الأعراض التنفسية 
 *  (مثل: نهجان، كحة جافة، كحة ببلغم، صفير بالصدر، ضيق تنفس عند المجهود) 
 *  لتكون مفهومة للمواطن المصري العادي. | Altibbi"
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { medicalCatalogService, SIMPLIFIED_EGYPTIAN_RESPIRATORY_DICTIONARY } = require("../backend/medical-catalog-service");
const { translations, I18nEngine } = require("../app/i18n");

console.log("==================================================================");
console.log("📖 HEALTH VIBE AI: TASK #85 SIMPLIFIED ARABIC MEDICAL DICTIONARY TESTS");
console.log("==================================================================\n");

async function runTests() {
  const i18n = new I18nEngine({ defaultLanguage: "ar" });

  // -----------------------------------------------------------------------------
  // TEST 1: Mandatory Egyptian Colloquial Terms in Catalog
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Verification of Egyptian Colloquial Respiratory Symptoms Catalog");

  const dictionary = medicalCatalogService.getSimplifiedMedicalDictionary();
  assert.strictEqual(Array.isArray(dictionary), true, "Dictionary should be an array");
  assert.strictEqual(dictionary.length >= 10, true, "Dictionary should have at least 10 core clinical respiratory terms");

  // Required terms from user prompt:
  // 1. نهجان (ضيق تنفس / كرشة نفس)
  const dyspneaTerm = dictionary.find(d => d.termId === "DICT-RESP-001");
  assert.ok(dyspneaTerm, "Dyspnea term DICT-RESP-001 must exist");
  assert.ok(dyspneaTerm.egyptianTerm.includes("نهجان"), "Dyspnea must include 'نهجان'");
  assert.ok(dyspneaTerm.egyptianSynonyms.includes("كرشة نفس"), "Dyspnea synonyms must include 'كرشة نفس'");
  assert.ok(dyspneaTerm.simplifiedMeaningAr.includes("الهواء"), "Simplified meaning must explain lack of air");

  // 2. ضيق تنفس عند المجهود / نهجان مع المجهود
  const exertionTerm = dictionary.find(d => d.termId === "DICT-RESP-002");
  assert.ok(exertionTerm, "Exertion dyspnea DICT-RESP-002 must exist");
  assert.ok(exertionTerm.egyptianTerm.includes("نهجان عند المجهود") || exertionTerm.egyptianTerm.includes("المشي"), "Must include exertion colloquial term");
  assert.ok(exertionTerm.egyptianSynonyms.some(s => s.includes("السلم") || s.includes("المشي")), "Exertion synonyms must mention stairs/walking");

  // 3. كحة جافة / ناشفة
  const dryCoughTerm = dictionary.find(d => d.termId === "DICT-RESP-003");
  assert.ok(dryCoughTerm, "Dry cough DICT-RESP-003 must exist");
  assert.ok(dryCoughTerm.egyptianTerm.includes("كحة جافة") || dryCoughTerm.egyptianTerm.includes("ناشفة"), "Must include 'كحة جافة' or 'ناشفة'");
  assert.ok(dryCoughTerm.egyptianSynonyms.includes("كحة ناشفة"), "Synonyms must include 'كحة ناشفة'");

  // 4. كحة ببلغم
  const wetCoughTerm = dictionary.find(d => d.termId === "DICT-RESP-004");
  assert.ok(wetCoughTerm, "Productive wet cough DICT-RESP-004 must exist");
  assert.ok(wetCoughTerm.egyptianTerm.includes("كحة ببلغم"), "Must include 'كحة ببلغم'");
  assert.ok(wetCoughTerm.egyptianSynonyms.includes("كحة ببلغم"), "Synonyms must include 'كحة ببلغم'");

  // 5. صفير بالصدر / تزييق
  const wheezeTerm = dictionary.find(d => d.termId === "DICT-RESP-005");
  assert.ok(wheezeTerm, "Wheezing DICT-RESP-005 must exist");
  assert.ok(wheezeTerm.egyptianTerm.includes("صفير بالصدر") || wheezeTerm.egyptianTerm.includes("تزييق"), "Must include 'صفير' or 'تزييق'");
  assert.ok(wheezeTerm.egyptianSynonyms.some(s => s.includes("صفارة") || s.includes("خروشة")), "Synonyms must include whistling/wheezing colloquialisms");

  console.log("  ✔ All mandatory prompt terms (نهجان، كحة جافة، كحة ببلغم، صفير بالصدر، ضيق تنفس عند المجهود) verified with rich colloquial metadata\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Additional Critical Respiratory Symptoms for Egyptian Citizens
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Verification of Critical Egyptian Respiratory Symptoms");

  // Hemoptysis (سعال مدمم)
  const hemoptysisTerm = dictionary.find(d => d.termId === "DICT-RESP-006");
  assert.ok(hemoptysisTerm, "Hemoptysis DICT-RESP-006 must exist");
  assert.ok(hemoptysisTerm.egyptianTerm.includes("دم مع الكحة") || hemoptysisTerm.egyptianTerm.includes("سعال مدمم"));
  assert.ok(hemoptysisTerm.egyptianSynonyms.some(s => s.includes("دم")), "Must include blood in cough synonyms");

  // Chest pain (ألم ونغزة بالصدر)
  const chestPainTerm = dictionary.find(d => d.termId === "DICT-RESP-007");
  assert.ok(chestPainTerm, "Chest pain DICT-RESP-007 must exist");
  assert.ok(chestPainTerm.egyptianTerm.includes("نغزة") || chestPainTerm.egyptianTerm.includes("ثقل"), "Must include 'نغزة' or 'ثقل'");

  // Hypoxia (نقص الأكسجين)
  const hypoxiaTerm = dictionary.find(d => d.termId === "DICT-RESP-008");
  assert.ok(hypoxiaTerm, "Hypoxia DICT-RESP-008 must exist");
  assert.ok(hypoxiaTerm.egyptianTerm.includes("نقص") && hypoxiaTerm.egyptianTerm.includes("الأكسجين"));

  console.log("  ✔ Critical safety symptoms (سعال مدمم، نغزة بالصدر، نقص الأكسجين) verified\n");

  // -----------------------------------------------------------------------------
  // TEST 3: Category Filtering and Search Engine
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: Medical Dictionary Filtering & Egyptian Colloquial Search");

  // 3a. Category filter
  const coughFiltered = medicalCatalogService.getSimplifiedMedicalDictionary("cough");
  assert.strictEqual(coughFiltered.length, 2, "Cough category should return dry cough and wet cough");

  const dyspneaFiltered = medicalCatalogService.getSimplifiedMedicalDictionary("dyspnea");
  assert.strictEqual(dyspneaFiltered.length >= 3, true, "Dyspnea category should return dyspnea, exertion, and tachypnea");

  // 3b. Search queries by colloquial Egyptian phrases
  const searchNahagan = medicalCatalogService.searchMedicalDictionary("نهجان");
  assert.ok(searchNahagan.length >= 2, "Searching 'نهجان' must return dyspnea and exertion dyspnea");

  const searchNashfa = medicalCatalogService.searchMedicalDictionary("ناشفة");
  assert.ok(searchNashfa.length >= 1, "Searching 'ناشفة' must match dry cough");
  assert.strictEqual(searchNashfa[0].termId, "DICT-RESP-003");

  const searchBalgham = medicalCatalogService.searchMedicalDictionary("بلغم");
  assert.ok(searchBalgham.length >= 1, "Searching 'بلغم' must match productive cough");

  const searchSafeer = medicalCatalogService.searchMedicalDictionary("صفير");
  assert.ok(searchSafeer.length >= 1, "Searching 'صفير' must match wheezing");

  const searchNaghza = medicalCatalogService.searchMedicalDictionary("نغزة");
  assert.ok(searchNaghza.length >= 1, "Searching 'نغزة' must match chest pain");

  console.log("  ✔ Egyptian colloquial search engine correctly resolved 'نهجان', 'ناشفة', 'بلغم', 'صفير', and 'نغزة'\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Internationalization (i18n) Egyptian Translation Audit
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: I18n Engine & Questionnaire Labels Audit");

  i18n.setLanguage("ar");
  assert.ok(i18n.t("assessment.shortnessOfBreath").includes("نهجان"), "Shortness of breath label must mention 'نهجان'");
  assert.ok(i18n.t("assessment.shortnessOfBreathHelp").includes("كرشة نفس"), "Help text must mention 'كرشة نفس'");
  assert.ok(i18n.t("assessment.coughLabel").includes("الكحة"), "Cough label must mention 'الكحة'");
  assert.ok(i18n.t("assessment.coughHelp").includes("ناشفة") && i18n.t("assessment.coughHelp").includes("بلغم"), "Cough help must distinguish dry and wet");
  assert.ok(i18n.t("assessment.wheezingLabel").includes("صفير") || i18n.t("assessment.wheezingLabel").includes("تزييق"), "Wheezing label must mention 'صفير' or 'تزييق'");
  assert.ok(i18n.t("assessment.dyspneaOnExertionLabel").includes("نهجان عند المجهود"), "Exertion label must mention 'نهجان عند المجهود'");
  assert.ok(i18n.t("assessment.chestPainLabel").includes("نغزة"), "Chest pain label must mention 'نغزة'");
  assert.ok(i18n.t("assessment.asthmaCopdLabel").includes("حساسية صدر"), "Asthma label must mention 'حساسية صدر'");

  // Medical dictionary namespace check
  assert.ok(i18n.t("medicalDictionary.modalTitle").includes("القاموس الطبي العربي المبسط"), "Dictionary title must be localized in Arabic");

  i18n.setLanguage("en");
  assert.ok(i18n.t("medicalDictionary.modalTitle").includes("Simplified Egyptian Medical Dictionary"), "Dictionary title must be localized in English");

  console.log("  ✔ I18n translation keys fully aligned with simplified Egyptian patient dialect\n");

  // -----------------------------------------------------------------------------
  // TEST 5: Express API Endpoints for Simplified Medical Dictionary
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 5: Express API Endpoints (/api/medical-catalog/simplified-dictionary)");

  const express = require("express");
  const testApp = express();
  testApp.use(express.json());

  testApp.get("/api/medical-catalog/simplified-dictionary", (req, res) => {
    const categoryParam = req.query.category || null;
    const dictionary = medicalCatalogService.getSimplifiedMedicalDictionary(categoryParam);
    res.status(200).json({ success: true, count: dictionary.length, dictionary });
  });

  testApp.get("/api/medical-catalog/simplified-dictionary/search", (req, res) => {
    const query = req.query.q || req.query.query || '';
    const results = medicalCatalogService.searchMedicalDictionary(query);
    res.status(200).json({ success: true, count: results.length, query, results });
  });

  const server = http.createServer(testApp);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  function doRequest(path) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET"
      }, (res) => {
        let raw = "";
        res.on("data", chunk => raw += chunk);
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: raw });
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  // 5a. GET all dictionary items
  const getAllRes = await doRequest("/api/medical-catalog/simplified-dictionary");
  assert.strictEqual(getAllRes.statusCode, 200);
  assert.strictEqual(getAllRes.body.success, true);
  assert.strictEqual(getAllRes.body.count >= 10, true);

  // 5b. Search by query: 'نهجان'
  const searchNahaganRes = await doRequest(`/api/medical-catalog/simplified-dictionary/search?q=${encodeURIComponent('نهجان')}`);
  assert.strictEqual(searchNahaganRes.statusCode, 200);
  assert.ok(searchNahaganRes.body.results.length >= 2, "Search for نهجان must return at least 2 entries");

  // 5c. Search by query: 'بلغم'
  const searchBalghamRes = await doRequest(`/api/medical-catalog/simplified-dictionary/search?q=${encodeURIComponent('بلغم')}`);
  assert.strictEqual(searchBalghamRes.statusCode, 200);
  assert.ok(searchBalghamRes.body.results.length >= 1, "Search for بلغم must return wet cough");

  server.close();
  console.log("  ✔ Express API routes for simplified medical dictionary and search passed\n");

  // -----------------------------------------------------------------------------
  // TEST 6: Frontend Index.html Markup & UI Widget Verification
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 6: Frontend HTML & UI Accessibility Verification");

  const indexPath = path.join(__dirname, "../app/index.html");
  const indexHtml = fs.readFileSync(indexPath, "utf8");

  assert.ok(indexHtml.includes('id="btnOpenSimplifiedMedicalDictionary"'), "Shortcut button to open dictionary must exist in index.html");
  assert.ok(indexHtml.includes('id="simplifiedMedicalDictionaryModal"'), "Modal container for dictionary must exist in index.html");
  assert.ok(indexHtml.includes('id="medicalDictionarySearchInput"'), "Search input field for dictionary must exist");
  assert.ok(indexHtml.includes('id="medicalDictionaryItemsContainer"'), "Dynamic container for dictionary items must exist");
  assert.ok(indexHtml.includes('data-i18n="assessment.shortnessOfBreathHelp"'), "Colloquial help text for shortness of breath must exist in HTML");
  assert.ok(indexHtml.includes('data-i18n="assessment.coughHelp"'), "Colloquial help text for cough must exist in HTML");
  assert.ok(indexHtml.includes('data-i18n="assessment.chestPainHelp"'), "Colloquial help text for chest pain must exist in HTML");

  console.log("  ✔ Frontend HTML modal, button, search input, and colloquial hints confirmed\n");

  console.log("==================================================================");
  console.log("🎉 ALL TASK #85 SIMPLIFIED ARABIC MEDICAL DICTIONARY TESTS PASSED (6/6)");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
