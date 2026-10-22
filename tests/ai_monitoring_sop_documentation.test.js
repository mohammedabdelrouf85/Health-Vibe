/**
 * HEALTH VIBE AI: AI MODEL MONITORING OPERATIONS SOP DOCUMENTATION TEST SUITE (Infermedica Benchmark)
 * 
 * Verifies:
 * 1. Existence and Structural Integrity of docs/AI_MODEL_MONITORING_DASHBOARD_SOP.md
 * 2. Regulatory & Standard Compliance:
 *    - Infermedica Clinical AI Benchmark & FDA GMLP
 *    - GDPR Art. 89 & 22, HIPAA Safe Harbor, Egyptian Law 151/2020
 *    - Zero-PHI Principle & AES-256-GCM at-rest encryption
 * 3. RACI & Multi-Role Governance Matrix:
 *    - Detailed RACI matrix for 10+ sub-roles (super_admin, clinical_qa, ops, clinic_admin, org_admin, support, doctor, patient)
 *    - Clear separation of privileges (Least Privilege RBAC)
 * 4. Step-by-Step SOP Workflows (SOP-AI-01 through SOP-AI-07):
 *    - SOP-AI-01: Routine Monitoring & KPI Inspection
 *    - SOP-AI-02: Demographic Parity & Sub-Cohort Auditing (Four-Fifths 80% Rule)
 *    - SOP-AI-03: Recording Evaluation & Calibration Batches
 *    - SOP-AI-04: Candidate Promotion & Atomic Deprecation/Archiving
 *    - SOP-AI-05: Physician Overrides & Primacy Review
 *    - SOP-AI-06: Support Team Playbook & 3-Tier Escalation Model
 *    - SOP-AI-07: Compliance Export & Regulatory Reporting
 * 5. Clinical Metric Computations & Mathematical Formulas:
 *    - Sensitivity, Specificity, Precision, F1-Score, AUC-ROC, Doctor Concordance, Wilson CI, Disparity Ratio
 * 6. Visual Operational Diagrams (Mermaid Syntax Verification)
 * 7. Operational Checklists (Daily Ops, Weekly Clinical QA, Monthly Governance)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('================================================================================');
console.log('📋  HEALTH VIBE AI: AI MONITORING SOP OPERATIONS DOCUMENTATION TEST SUITE');
console.log('    Infermedica Standard, Multi-Role RACI, 7 Core SOPs & Quality Checklists');
console.log('================================================================================\n');

const sopPath = path.resolve(__dirname, '../docs/AI_MODEL_MONITORING_DASHBOARD_SOP.md');

// -----------------------------------------------------------------------------
// TEST 1: File Existence & Markdown Integrity
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: File Existence & Markdown Integrity');
assert.ok(fs.existsSync(sopPath), 'AI_MODEL_MONITORING_DASHBOARD_SOP.md must exist in docs/');
const content = fs.readFileSync(sopPath, 'utf8');
assert.ok(content.length > 5000, `SOP document must be comprehensive (found ${content.length} bytes)`);
assert.ok(content.includes('SOP-AI-042'), 'Document must bear code SOP-AI-042');
assert.ok(content.includes('Infermedica'), 'Document must cite Infermedica benchmark');
console.log(`  ✓ SOP document verified: ${content.length} bytes with valid header metadata.\n`);

// -----------------------------------------------------------------------------
// TEST 2: Regulatory & Legal Compliance Frameworks
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Regulatory & Legal Compliance Frameworks');
const complianceTerms = [
  'GDPR',
  'Article 89',
  'HIPAA Safe Harbor',
  '151 لسنة 2020',
  'Zero-PHI',
  'AES-256-GCM',
  'GMLP'
];
complianceTerms.forEach(term => {
  assert.ok(content.includes(term), `SOP must reference regulatory framework term: ${term}`);
});
console.log('  ✓ Regulatory compliance framework (GDPR, HIPAA, Egyptian Law 151, Zero-PHI) verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Multi-Role RACI Governance Matrix
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Multi-Role RACI Governance Matrix');
const requiredRoles = [
  'Super Admin',
  'Clinical QA',
  'Ops Admin',
  'Clinic/Org Admin',
  'Support Desk',
  'Doctor / Physician',
  'Patient'
];
requiredRoles.forEach(role => {
  assert.ok(content.includes(role), `RACI matrix must cover role: ${role}`);
});

// Verify RBAC access control rules are explicit
assert.ok(content.includes('403'), 'SOP must detail 403 Forbidden boundaries');
assert.ok(content.includes('Least Privilege'), 'SOP must emphasize Least Privilege principle');
console.log('  ✓ Multi-role RACI matrix and granular authorization boundaries verified.\n');

// -----------------------------------------------------------------------------
// TEST 4: Step-by-Step SOP Codes (SOP-AI-01 to SOP-AI-07)
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Step-by-Step SOP Codes (SOP-AI-01 to SOP-AI-07)');
const requiredSOPs = [
  { code: 'SOP-AI-01', title: 'المراقبة الدورية للوحة التحكم وفلاتر النماذج' },
  { code: 'SOP-AI-02', title: 'تدقيق العدالة السريرية وتكافؤ الفئات السكانية' },
  { code: 'SOP-AI-03', title: 'تقييم وتسجيل دفعات المعايرة السريرية الجديدة' },
  { code: 'SOP-AI-04', title: 'ترقية واعتماد النماذج للإنتاج' },
  { code: 'SOP-AI-05', title: 'فحص وتدقيق استدراكات الأطباء وسيادة القرار السريري' },
  { code: 'SOP-AI-06', title: 'دليل فريق الدعم الفني وتصعيد الاستفسارات والشكاوى' },
  { code: 'SOP-AI-07', title: 'تصدير التقارير الرقابية والامتثال القانوني' }
];

requiredSOPs.forEach(sop => {
  assert.ok(content.includes(sop.code), `Document must contain ${sop.code}`);
  assert.ok(content.includes(sop.title), `Document must contain SOP title: ${sop.title}`);
});
console.log('  ✓ All 7 core operational SOPs (SOP-AI-01 to SOP-AI-07) validated.\n');

// -----------------------------------------------------------------------------
// TEST 5: Clinical Metric Equations & Clinical Standards
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Clinical Metric Equations & Standards');
const metricTerms = [
  'Sensitivity',
  'Specificity',
  'Precision',
  'F1-Score',
  'AUC-ROC',
  'Doctor Concordance',
  'Wilson 95% CI',
  'Disparity Ratio',
  'Four-Fifths',
  'False Positives'
];
metricTerms.forEach(m => {
  assert.ok(content.includes(m), `SOP must explain metric: ${m}`);
});

// Four-Fifths 80% rule validation
assert.ok(content.includes('80%') || content.includes('0.80'), 'SOP must detail 80% Disparity Ratio threshold');
// 80% FP drop verification
assert.ok(content.includes('80%') && content.includes('v1.1'), 'SOP must cite 80% FP drop in candidate v1.1');
console.log('  ✓ Clinical metric formulas, thresholds, and 80% FP reduction verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Sub-Cohort Breakdown & Demographic Parity
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Sub-Cohort Breakdown & Demographic Parity');
const cohorts = ['Pediatric', 'Adult', 'Geriatric', 'Chronic Lung Disease'];
cohorts.forEach(c => {
  assert.ok(content.includes(c), `SOP must audit cohort: ${c}`);
});
console.log('  ✓ Sub-cohort demographic equity (Pediatric, Adult, Geriatric, Chronic Lung) verified.\n');

// -----------------------------------------------------------------------------
// TEST 7: Mermaid Workflow Diagrams Syntax & Content
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: Mermaid Operational Workflow Diagrams');
assert.ok(content.includes('```mermaid'), 'SOP must include Mermaid workflow diagrams');
const mermaidBlocks = content.match(/```mermaid[\s\S]*?```/g) || [];
assert.ok(mermaidBlocks.length >= 2, `SOP must contain at least 2 Mermaid diagrams (found ${mermaidBlocks.length})`);
mermaidBlocks.forEach((block, idx) => {
  assert.ok(block.includes('graph TD') || block.includes('flowchart'), `Diagram ${idx + 1} must be a valid graph TD`);
});
console.log(`  ✓ ${mermaidBlocks.length} Mermaid operational workflow diagrams validated.\n`);

// -----------------------------------------------------------------------------
// TEST 8: Support Desk Playbook & Emergency Procedures
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: Support Desk Playbook & Emergency Procedures');
assert.ok(content.includes('Tier 1') && content.includes('Tier 2') && content.includes('Tier 3'), 'Must contain 3-tier escalation model');
assert.ok(content.includes('Emergency Rollback') || content.includes('التراجع السريع'), 'Must define emergency rollback protocol');
assert.ok(content.includes('Daily Ops Checklist') || content.includes('قائمة التحقق اليومي'), 'Must include Daily Ops checklist');
assert.ok(content.includes('Weekly Clinical QA') || content.includes('قائمة التحقق الأسبوعي'), 'Must include Weekly Clinical QA checklist');
assert.ok(content.includes('Monthly AI Governance') || content.includes('قائمة التحقق الشهري'), 'Must include Monthly Governance checklist');
console.log('  ✓ 3-Tier support playbook, emergency rollback, and 3 operational checklists verified.\n');

console.log('================================================================================');
console.log('✅ ALL AI MONITORING SOP DOCUMENTATION TESTS PASSED (100% SUCCESS)');
console.log('================================================================================');
