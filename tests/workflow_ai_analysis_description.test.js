/**
 * Health Vibe AI - Test Suite: Workflow Step 2 AI Analysis Description Alignment (PRD Section 7.1)
 *
 * Verifies that the workflow section on the public landing page (Step 2: AI Analysis)
 * properly communicates the integration of a Validated Machine Learning Model + Clinical Rules
 * instead of the deprecated "Rule-based preliminary triage", fully aligning with PRD Section 7.1.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('🔬 TEST SUITE: WORKFLOW STEP 2 AI ANALYSIS DESCRIPTION (PRD 7.1)');
console.log('==================================================================\n');

const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const i18nJsPath = path.resolve(__dirname, '../app/i18n.js');
const appJsPath = path.resolve(__dirname, '../app/app.js');

assert(fs.existsSync(indexHtmlPath), 'app/index.html must exist');
assert(fs.existsSync(i18nJsPath), 'app/i18n.js must exist');
assert(fs.existsSync(appJsPath), 'app/app.js must exist');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const { I18nEngine, translations } = require(i18nJsPath);
const appJs = fs.readFileSync(appJsPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: index.html Workflow Step 2 Content Verification
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: index.html Workflow Step 2 Content Verification');
assert(indexHtml.includes('id="workflow"'), 'index.html must contain section #workflow');

// Verify old unvalidated phrasing is removed from Step 2
assert(
  !indexHtml.includes('Rule-based triage classification with unvalidated clinical indicators flagged'),
  'index.html Step 2 must no longer contain deprecated "Rule-based triage classification with unvalidated clinical indicators flagged"'
);

// Verify new validated ML + clinical rules text is present
assert(
  indexHtml.includes('Validated Machine Learning Model + Clinical Rules'),
  'index.html Step 2 must describe Validated Machine Learning Model + Clinical Rules'
);
assert(
  indexHtml.includes('PRD 7.1'),
  'index.html Step 2 must explicitly reference PRD 7.1 compliance'
);
assert(
  indexHtml.includes('data-i18n="workflow.step2Title"'),
  'index.html Step 2 title must have data-i18n="workflow.step2Title"'
);
assert(
  indexHtml.includes('data-i18n="workflow.step2Desc"'),
  'index.html Step 2 description must have data-i18n="workflow.step2Desc"'
);

console.log('  ✓ index.html accurately contains updated Step 2 markup and data-i18n tags.\n');

// -----------------------------------------------------------------------------
// TEST 2: i18n Catalog Verification (Arabic & English Parity)
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: i18n Catalog Verification (Arabic & English Parity)');
assert(translations.ar.workflow, 'translations.ar must have a workflow namespace');
assert(translations.en.workflow, 'translations.en must have a workflow namespace');

assert.strictEqual(translations.en.workflow.step2Title, 'AI Analysis');
assert(
  translations.en.workflow.step2Desc.includes('Validated Machine Learning Model + Clinical Rules'),
  'English workflow.step2Desc must include "Validated Machine Learning Model + Clinical Rules"'
);
assert(
  translations.en.workflow.step2Desc.includes('PRD 7.1'),
  'English workflow.step2Desc must reference PRD 7.1'
);

assert.strictEqual(translations.ar.workflow.step2Title, 'تحليل الذكاء الاصطناعي');
assert(
  translations.ar.workflow.step2Desc.includes('Validated Machine Learning Model + Clinical Rules') ||
  translations.ar.workflow.step2Desc.includes('تعلم آلي مدقق') ||
  translations.ar.workflow.step2Desc.includes('نماذج تعلم آلي'),
  'Arabic workflow.step2Desc must communicate validated machine learning models'
);
assert(
  translations.ar.workflow.step2Desc.includes('السريري') || translations.ar.workflow.step2Desc.includes('سريرية'),
  'Arabic workflow.step2Desc must communicate clinical rules'
);
assert(
  translations.ar.workflow.step2Desc.includes('7.1'),
  'Arabic workflow.step2Desc must reference PRD Section 7.1'
);

// Check mutual key parity for workflow namespace
const arKeys = Object.keys(translations.ar.workflow).sort();
const enKeys = Object.keys(translations.en.workflow).sort();
assert.deepStrictEqual(arKeys, enKeys, 'translations.ar.workflow and translations.en.workflow keys must match 100%');

console.log('  ✓ i18n catalogs verified with 100% Arabic and English parity for workflow namespace.\n');

// -----------------------------------------------------------------------------
// TEST 3: I18nEngine Translation & Switching Test
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: I18nEngine Translation & Switching Test');
const engine = new I18nEngine({ defaultLanguage: 'en' });

assert.strictEqual(engine.t('workflow.step2Title'), 'AI Analysis');
assert(engine.t('workflow.step2Desc').includes('Validated Machine Learning Model + Clinical Rules'));

engine.setLanguage('ar');
assert.strictEqual(engine.t('workflow.step2Title'), 'تحليل الذكاء الاصطناعي');
assert(engine.t('workflow.step2Desc').includes('Validated Machine Learning Model + Clinical Rules'));
assert(engine.t('workflow.step2Desc').includes('7.1'));

console.log('  ✓ I18nEngine dynamically translates workflow.step2 keys in both EN and AR.\n');

// -----------------------------------------------------------------------------
// TEST 4: app.js Translation Dictionary Coverage
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: app.js Translation Dictionary Coverage');
assert(
  appJs.includes('Validated Machine Learning Model + Clinical Rules'),
  'app.js must register the new validated ML model description in uiText'
);
assert(
  appJs.includes('PRD (القسم 7.1)'),
  'app.js must reference PRD (القسم 7.1)'
);

console.log('  ✓ app.js translation dictionary reflects the new clinical description.\n');

console.log('==================================================================');
console.log('🎉 ALL WORKFLOW AI ANALYSIS DESCRIPTION TESTS PASSED (100%)');
console.log('==================================================================\n');
