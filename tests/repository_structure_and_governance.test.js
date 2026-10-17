/**
 * Test Suite: Repository Structure & Architecture Governance (#68)
 * Verifies clean separation between frontend/, backend/, ml_models/, tests/, and docs/
 * with comprehensive README.md and .env.example.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🏗️ HEALTHVIBE AI: REPOSITORY STRUCTURE & GOVERNANCE TEST SUITE');
console.log('   Verifying Clean Separation: frontend/, backend/, ml_models/, tests/, docs/');
console.log('================================================================================\n');

const ROOT_DIR = path.resolve(__dirname, '..');

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 1. Mandatory Top-Level Directories Verification
// -----------------------------------------------------------------------------
console.log('▶ 1. Mandatory Top-Level Directories Check');

const REQUIRED_DIRS = [
  'frontend',
  'backend',
  'ml_models',
  'tests',
  'docs'
];

for (const dirName of REQUIRED_DIRS) {
  test(`Top-level directory '${dirName}/' must exist`, () => {
    const fullPath = path.join(ROOT_DIR, dirName);
    assert.ok(fs.existsSync(fullPath), `Directory '${dirName}' is missing.`);
    assert.ok(fs.statSync(fullPath).isDirectory(), `'${dirName}' must be a directory.`);
  });
}

// -----------------------------------------------------------------------------
// 2. Root Documentation & Environment Template Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 2. Root Documentation & Environment Template Check');

test("Master 'README.md' must exist at repository root and be comprehensive", () => {
  const readmePath = path.join(ROOT_DIR, 'README.md');
  assert.ok(fs.existsSync(readmePath), "Master 'README.md' must exist in root.");
  const content = fs.readFileSync(readmePath, 'utf8');
  assert.ok(content.length > 1000, "Master 'README.md' must be comprehensive (>1000 bytes).");
  assert.ok(content.includes('frontend/'), "README must document frontend/ domain.");
  assert.ok(content.includes('backend/'), "README must document backend/ domain.");
  assert.ok(content.includes('ml_models/'), "README must document ml_models/ domain.");
  assert.ok(content.includes('tests/'), "README must document tests/ domain.");
  assert.ok(content.includes('docs/'), "README must document docs/ domain.");
  assert.ok(content.includes('.env.example'), "README must mention .env.example.");
});

test("Environment template '.env.example' must exist at repository root", () => {
  const envPath = path.join(ROOT_DIR, '.env.example');
  assert.ok(fs.existsSync(envPath), "Root '.env.example' must exist.");
  const content = fs.readFileSync(envPath, 'utf8');
  assert.ok(content.includes('NODE_ENV'), "Must define NODE_ENV.");
  assert.ok(content.includes('FIREBASE_PROJECT_ID'), "Must define FIREBASE_PROJECT_ID.");
  assert.ok(content.includes('AES_256_GCM_SECRET_KEY'), "Must define AES_256_GCM_SECRET_KEY.");
  assert.ok(content.includes('OWNER_EMAILS'), "Must define OWNER_EMAILS.");
  assert.ok(content.includes('DEFAULT_MODEL_VERSION'), "Must define DEFAULT_MODEL_VERSION.");
});

// -----------------------------------------------------------------------------
// 3. Frontend Domain Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 3. Frontend Domain Architecture Check');

test("Frontend directory must contain README.md, package.json, and design system", () => {
  const frontDir = path.join(ROOT_DIR, 'frontend');
  assert.ok(fs.existsSync(path.join(frontDir, 'README.md')), "frontend/README.md must exist.");
  assert.ok(fs.existsSync(path.join(frontDir, 'package.json')), "frontend/package.json must exist.");
  assert.ok(fs.existsSync(path.join(frontDir, 'web', 'index.js')), "frontend/web/index.js must exist.");
  assert.ok(fs.existsSync(path.join(frontDir, 'mobile', 'README.md')), "frontend/mobile/README.md must exist.");
  assert.ok(fs.existsSync(path.join(frontDir, 'design-system', 'tokens.json')), "frontend/design-system/tokens.json must exist.");
});

// -----------------------------------------------------------------------------
// 4. Backend Domain Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 4. Backend Domain Architecture Check');

test("Backend directory must contain README.md, server.js, firestore.rules, and security services", () => {
  const backDir = path.join(ROOT_DIR, 'backend');
  assert.ok(fs.existsSync(path.join(backDir, 'README.md')), "backend/README.md must exist.");
  assert.ok(fs.existsSync(path.join(backDir, 'server.js')), "backend/server.js must exist.");
  assert.ok(fs.existsSync(path.join(backDir, 'firestore.rules')), "backend/firestore.rules must exist.");
  assert.ok(fs.existsSync(path.join(backDir, 'input-sanitization-service.js')), "input-sanitization-service.js must exist.");
  assert.ok(fs.existsSync(path.join(backDir, 'encryption-service.js')), "encryption-service.js must exist.");
});

// -----------------------------------------------------------------------------
// 5. Machine Learning Models Domain Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 5. Machine Learning Domain Architecture Check');

test("ml_models/ must contain README.md, MODEL_CARD.md, model_registry.json, and classifier", () => {
  const mlDir = path.join(ROOT_DIR, 'ml_models');
  assert.ok(fs.existsSync(path.join(mlDir, 'README.md')), "ml_models/README.md must exist.");
  assert.ok(fs.existsSync(path.join(mlDir, 'MODEL_CARD.md')), "ml_models/MODEL_CARD.md must exist.");
  assert.ok(fs.existsSync(path.join(mlDir, 'model_registry.json')), "ml_models/model_registry.json must exist.");
  assert.ok(fs.existsSync(path.join(mlDir, 'respiratory_rf_classifier.js')), "respiratory_rf_classifier.js must exist.");
  assert.ok(fs.existsSync(path.join(mlDir, 'feature_extractor.js')), "feature_extractor.js must exist.");
  assert.ok(fs.existsSync(path.join(mlDir, 'evaluate_models.js')), "evaluate_models.js must exist.");
});

test("ml_models registry must specify active production version 'resp_rf_v1.0.2'", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'ml_models', 'model_registry.json'), 'utf8'));
  assert.strictEqual(registry.active_production_version, 'resp_rf_v1.0.2');
  assert.ok(registry.models['resp_rf_v1.0.2'], "Model 'resp_rf_v1.0.2' must be registered.");
  assert.ok(registry.models['resp_rf_v1.0.2'].validation_metrics.sensitivity >= 0.95, "Sensitivity must exceed 95%.");
});

// -----------------------------------------------------------------------------
// 6. Tests Domain Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 6. Test Suite Domain Architecture Check');

test("tests/ directory must contain README.md and at least 150 test suites", () => {
  const testDir = path.join(ROOT_DIR, 'tests');
  assert.ok(fs.existsSync(path.join(testDir, 'README.md')), "tests/README.md must exist.");
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));
  assert.ok(testFiles.length >= 150, `Expected at least 150 test suites, found ${testFiles.length}`);
});

// -----------------------------------------------------------------------------
// 7. Docs Domain Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 7. Documentation Domain Architecture Check');

test("docs/ must contain README.md and categorized subdirectories", () => {
  const docsDir = path.join(ROOT_DIR, 'docs');
  assert.ok(fs.existsSync(path.join(docsDir, 'README.md')), "docs/README.md must exist.");

  const categories = ['architecture', 'clinical', 'security', 'legal', 'api', 'operations'];
  for (const cat of categories) {
    const catPath = path.join(docsDir, cat);
    assert.ok(fs.existsSync(catPath), `docs/${cat} must exist.`);
    const files = fs.readdirSync(catPath);
    assert.ok(files.length > 0, `docs/${cat} must not be empty.`);
  }
});

console.log('\n================================================================================');
console.log(`🎉 ALL REPOSITORY STRUCTURE CHECKS PASSED: ${passedCount}/${passedCount}`);
console.log('================================================================================\n');
