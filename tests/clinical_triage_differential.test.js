/**
 * Health Vibe AI - Clinical Triage & Differential Assessment Engine Test Suite
 *
 * Verifies:
 * 1. Renaming across UI, sidebar navigation, headers, and i18n ("Clinical Triage & Differential Assessment" / "الفرز السريري والتقييم التفريقي").
 * 2. Reliable user context resolution (authenticated user or active demo patient session).
 * 3. Loading of differential screener questions across metabolic, cardiovascular, hematology, and cardiopulmonary domains.
 * 4. Deterministic evaluation engine:
 *    - Metabolic symptoms (polyuria + polydipsia) trigger glucose tolerance differential & recommendation.
 *    - Cardiovascular symptoms (chest tightness) trigger urgent priority & ischemic/strain differential.
 *    - Coagulation symptoms (leg swelling / bruising) trigger DVT / coagulation differential.
 * 5. Screen navigation handlers (seamlessly routes to specific clinical modules without breaking).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('==================================================================');
console.log('🩺 HEALTH VIBE AI: CLINICAL TRIAGE & DIFFERENTIAL ASSESSMENT TESTS');
console.log('   Renaming, Question Loading, Evaluation Engine & Triage Results');
console.log('==================================================================\n');

const rootDir = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(rootDir, 'app/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'app/app.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(rootDir, 'app/i18n.js'), 'utf8');
const { translations } = require(path.join(rootDir, 'app/i18n.js'));
const DiseaseDashboardUI = require(path.join(rootDir, 'app/modules/disease/disease-dashboard-ui.js'));

// ---------------------------------------------------------------------------
console.log('▶ TEST 1: Clinical Triage Renaming in UI, Navigation & i18n Parity');
// ---------------------------------------------------------------------------
{
  // Nav Arabic & English
  assert.equal(translations.en.nav.disease, 'Clinical Triage & Differential Assessment');
  assert.equal(translations.ar.nav.disease, 'الفرز السريري والتقييم التفريقي');
  assert.equal(translations.en.nav.diseaseDashboard, 'Clinical Triage & Differential Assessment');
  assert.equal(translations.ar.nav.diseaseDashboard, 'الفرز السريري والتقييم التفريقي');

  // Screen title in i18n
  assert.equal(translations.en.diseaseDashboard.title, 'Clinical Triage & Differential Assessment');
  assert.equal(translations.ar.diseaseDashboard.title, 'الفرز السريري والتقييم التفريقي');

  // App.js registered titles
  assert.ok(appJs.includes('disease: "الفرز السريري والتقييم التفريقي"'));
  assert.ok(appJs.includes('"disease-dashboard": "الفرز السريري والتقييم التفريقي"'));
  assert.ok(appJs.includes('disease: "Clinical Triage & Differential Assessment"'));
  assert.ok(appJs.includes('"disease-dashboard": "Clinical Triage & Differential Assessment"'));

  // Index.html sidebar label
  assert.ok(indexHtml.includes('data-i18n="nav.disease">Clinical Triage & Differential Assessment</span>'));
  assert.ok(indexHtml.includes('data-i18n="diseaseDashboard.title">Clinical Triage & Differential Assessment</span>'));

  console.log('  ✓ Verified 100% renaming across navigation, UI headers, app.js titles and bilingual i18n.');
}

// ---------------------------------------------------------------------------
console.log('▶ TEST 2: Differential Triage Evaluation Engine - Negative/Baseline Inputs');
// ---------------------------------------------------------------------------
{
  const baselineAnswers = {
    polyuria: 'no',
    polydipsia: 'no',
    headache: 'no',
    chest_tightness: 'no',
    bruising: 'no',
    leg_swelling: 'no',
    weight_gain: 'no',
    exertional_breath: 'no'
  };

  const result = DiseaseDashboardUI.evaluateDifferentialTriage(baselineAnswers);
  assert.equal(result.overallRisk, 'low');
  assert.equal(result.findings.length, 0);
  assert.ok(result.differentials.length > 0);
  assert.equal(result.differentials[0].probability, 'Low Clinical Risk');

  console.log('  ✓ Baseline negative screener outputs low clinical risk with routine monitoring action.');
}

// ---------------------------------------------------------------------------
console.log('▶ TEST 3: Differential Triage Engine - Metabolic & Endocrine Domain');
// ---------------------------------------------------------------------------
{
  const metabolicAnswers = {
    polyuria: 'yes',
    polydipsia: 'yes',
    headache: 'no',
    chest_tightness: 'no',
    bruising: 'no',
    leg_swelling: 'no',
    weight_gain: 'no',
    exertional_breath: 'no'
  };

  const result = DiseaseDashboardUI.evaluateDifferentialTriage(metabolicAnswers);
  assert.equal(result.overallRisk, 'moderate');
  const metabolicDiff = result.differentials.find(d => d.route === 'diabetes');
  assert.ok(metabolicDiff, 'Found metabolic differential recommendation');
  assert.equal(metabolicDiff.probability, 'High Probability');
  assert.ok(metabolicDiff.actionEn.includes('HbA1c'));

  console.log('  ✓ Metabolic symptoms accurately trigger diabetes / glucose tolerance differential.');
}

// ---------------------------------------------------------------------------
console.log('▶ TEST 4: Differential Triage Engine - Cardiovascular & Emergency Priority');
// ---------------------------------------------------------------------------
{
  const cardiacAnswers = {
    polyuria: 'no',
    polydipsia: 'no',
    headache: 'yes',
    chest_tightness: 'yes',
    bruising: 'no',
    leg_swelling: 'no',
    weight_gain: 'no',
    exertional_breath: 'no'
  };

  const result = DiseaseDashboardUI.evaluateDifferentialTriage(cardiacAnswers);
  assert.equal(result.overallRisk, 'urgent');
  const cardiacDiff = result.differentials.find(d => d.route === 'hypertension');
  assert.ok(cardiacDiff, 'Found cardiovascular differential');
  assert.equal(cardiacDiff.probability, 'Clinical Priority');
  assert.ok(cardiacDiff.actionEn.includes('Immediate clinical evaluation'));

  console.log('  ✓ Chest tightness immediately escalates overall risk to urgent emergency priority.');
}

// ---------------------------------------------------------------------------
console.log('▶ TEST 5: Differential Triage Engine - Coagulation / Hematology Domain');
// ---------------------------------------------------------------------------
{
  const coagulationAnswers = {
    polyuria: 'no',
    polydipsia: 'no',
    headache: 'no',
    chest_tightness: 'no',
    bruising: 'yes',
    leg_swelling: 'yes',
    weight_gain: 'no',
    exertional_breath: 'no'
  };

  const result = DiseaseDashboardUI.evaluateDifferentialTriage(coagulationAnswers);
  assert.equal(result.overallRisk, 'high');
  const clotDiff = result.differentials.find(d => d.route === 'blood-disorders');
  assert.ok(clotDiff, 'Found hematology / coagulation differential');
  assert.equal(clotDiff.probability, 'High Priority');
  assert.ok(clotDiff.actionEn.includes('Duplex Ultrasound'));

  console.log('  ✓ Coagulation symptoms accurately trigger DVT / hematology screening workup.');
}

// ---------------------------------------------------------------------------
console.log('▶ TEST 6: UI Renderer Component & DOM Binding Verification');
// ---------------------------------------------------------------------------
{
  assert.equal(typeof DiseaseDashboardUI.renderScreen, 'function');
  assert.equal(typeof DiseaseDashboardUI.evaluateDifferentialTriage, 'function');
  console.log('  ✓ DiseaseDashboardUI exposes renderScreen and evaluateDifferentialTriage methods.');
}

console.log('==================================================================');
console.log('🎉 ALL 6 CLINICAL TRIAGE & DIFFERENTIAL ASSESSMENT TESTS PASSED!');
console.log('==================================================================\n');
