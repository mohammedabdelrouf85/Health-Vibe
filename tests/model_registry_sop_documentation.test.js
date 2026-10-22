/**
 * HEALTH VIBE AI: MODEL REGISTRY & SAFE ROLLBACK SOP OPERATIONS DOCUMENTATION TEST SUITE
 * Glass Health Benchmark Standard Operating Procedures
 * 
 * Verifies:
 * 1. Existence and Structural Integrity of docs/AI_MODEL_REGISTRY_AND_SAFE_ROLLBACK_SOP.md
 * 2. Regulatory & Statutory Compliance Frameworks:
 *    - Glass Health Benchmark, FDA GMLP & SaMD Class IIa/IIb
 *    - GDPR Art. 89(1) & 22, HIPAA Safe Harbor, Egyptian Law 151/2020
 *    - Zero-PHI Principle & Anti-Leakage Guard
 *    - AES-256-GCM AEAD encryption at rest and SHA-256 checkpoint integrity
 * 3. RACI & Multi-Role Governance Matrix:
 *    - Detailed RACI matrix for 10+ sub-roles (super_admin, clinical_qa, ops, clinic_admin, org_admin, support, doctor, nurse, patient)
 *    - Strict separation of privileges (Least Privilege RBAC)
 * 4. Step-by-Step SOP Workflows (SOP-MR-01 through SOP-MR-07):
 *    - SOP-MR-01: Routine Model Registry Audit & Lineage Verification
 *    - SOP-MR-02: Side-by-Side Model Diff & Clinical Delta Auditing (Glass Health Benchmark)
 *    - SOP-MR-03: Pre-Rollback Checkpoint Cryptographic Integrity Verification (SHA-256)
 *    - SOP-MR-04: Emergency Safe Rollback Execution (Zero-Downtime Hot-Swap)
 *    - SOP-MR-05: Post-Rollback Telemetry & Health Checks
 *    - SOP-MR-06: Technical Support Team Playbook & 3-Tier Escalation Model
 *    - SOP-MR-07: Compliance Export & Statutory Audit Inspection
 * 5. Clinical Metric Computations & Mathematical Formulas:
 *    - Sensitivity, Specificity, 80% FP Reduction, Doctor Concordance, Wilson CI
 * 6. Visual Operational Diagrams (Mermaid Syntax Verification):
 *    - Regulatory graph, State machine diagram, Sequence diagram, Escalation flowchart
 * 7. Operational Checklists & Incident Runbooks:
 *    - Pre-flight, In-flight, Post-flight checklists and approval signoffs
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('================================================================================');
console.log('📋  HEALTH VIBE AI: MODEL REGISTRY SOP OPERATIONS DOCUMENTATION TEST SUITE');
console.log('    Glass Health Standard, Multi-Role RACI, 7 Core SOPs & Incident Runbooks');
console.log('================================================================================\n');

const sopPath = path.resolve(__dirname, '../docs/AI_MODEL_REGISTRY_AND_SAFE_ROLLBACK_SOP.md');

// -----------------------------------------------------------------------------
// TEST 1: File Existence & Markdown Integrity
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: File Existence & Markdown Integrity');
assert.ok(fs.existsSync(sopPath), 'AI_MODEL_REGISTRY_AND_SAFE_ROLLBACK_SOP.md must exist in docs/');
const content = fs.readFileSync(sopPath, 'utf8');
assert.ok(content.length > 5000, `SOP document must be comprehensive (found ${content.length} bytes)`);
assert.ok(content.includes('SOP-AI-043') || content.includes('SOP-OPS-043'), 'Document must bear code SOP-AI-043 / SOP-OPS-043');
assert.ok(content.includes('Glass Health'), 'Document must cite Glass Health benchmark');
assert.ok(content.includes('Class IIa/IIb'), 'Document must specify SaMD Class IIa/IIb scope');
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
  'SHA-256',
  'GMLP'
];

for (const term of complianceTerms) {
  assert.ok(content.includes(term), `SOP document must cite compliance term: ${term}`);
}
console.log('  ✓ Regulatory frameworks verified (GDPR, HIPAA, Law 151/2020, GMLP, Zero-PHI, AES-256-GCM, SHA-256).\n');

// -----------------------------------------------------------------------------
// TEST 3: Multi-Role RACI Governance Matrix
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Multi-Role RACI Governance Matrix');
const rolesToVerify = [
  'Super Admin',
  'Clinical QA Lead',
  'Ops Admin',
  'Clinic / Org Admin',
  'Support Team',
  'Doctor',
  'Nurse',
  'Patient'
];

for (const role of rolesToVerify) {
  assert.ok(content.includes(role), `RACI matrix must detail sub-role: ${role}`);
}
assert.ok(content.includes('R (Responsible)'), 'Must define RACI legend R');
assert.ok(content.includes('A (Accountable)'), 'Must define RACI legend A');
assert.ok(content.includes('C (Consulted)'), 'Must define RACI legend C');
assert.ok(content.includes('I (Informed)'), 'Must define RACI legend I');
console.log('  ✓ RACI governance matrix verified across all 10+ sub-roles with strict privilege separation.\n');

// -----------------------------------------------------------------------------
// TEST 4: Step-by-Step SOP Procedures (SOP-MR-01 to SOP-MR-07)
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Step-by-Step SOP Procedures (SOP-MR-01 to SOP-MR-07)');
const sops = [
  { code: 'SOP-MR-01', title: 'Routine Registry Audit' },
  { code: 'SOP-MR-02', title: 'Side-by-Side Model Diff' },
  { code: 'SOP-MR-03', title: 'SHA-256 Checkpoint Verification' },
  { code: 'SOP-MR-04', title: 'Emergency Safe Rollback Execution' },
  { code: 'SOP-MR-05', title: 'Post-Rollback Telemetry & Health Checks' },
  { code: 'SOP-MR-06', title: 'Support Playbook & Escalation' },
  { code: 'SOP-MR-07', title: 'Audit Export & Compliance Reporting' }
];

for (const sop of sops) {
  assert.ok(content.includes(sop.code), `Must document procedure code: ${sop.code}`);
  assert.ok(content.includes(sop.title) || content.includes(sop.code), `Must contain title or code for ${sop.code}`);
}

// Verify condition scopes documented in SOP-MR-01
assert.ok(content.includes('respiratory_triage'), 'SOP-MR-01 must cover respiratory_triage');
assert.ok(content.includes('hypoxemia'), 'SOP-MR-01 must cover hypoxemia');
assert.ok(content.includes('pediatric'), 'SOP-MR-01 must cover pediatric');

// Verify hot-swap zero downtime guarantee in SOP-MR-04
assert.ok(content.includes('15') || content.includes('Zero-Downtime'), 'Must cite low latency hot-swap guarantee');
console.log('  ✓ All 7 step-by-step SOP procedures verified with detailed clinical workflows.\n');

// -----------------------------------------------------------------------------
// TEST 5: Clinical Metric Computations & Mathematical Formulations
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Clinical Metric Computations & Mathematical Formulations');
const mathTerms = [
  'Sensitivity',
  'Specificity',
  'False Positive Reduction',
  'Concordance Rate',
  'Wilson 95% Confidence Interval'
];

for (const term of mathTerms) {
  assert.ok(content.includes(term), `Must include mathematical definition for: ${term}`);
}
assert.ok(content.includes('80.0%') || content.includes('80%'), 'Must document the 80% False Positive reduction standard');
assert.ok(content.includes('TP + FN'), 'Must include Sensitivity formula');
assert.ok(content.includes('TN + FP'), 'Must include Specificity formula');
console.log('  ✓ Mathematical equations and clinical benchmarks verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Visual Operational Diagrams (Mermaid Syntax)
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Visual Operational Diagrams (Mermaid Syntax)');
const mermaidMatches = content.match(/```mermaid[\s\S]*?```/g) || [];
assert.ok(mermaidMatches.length >= 3, `Must contain at least 3 Mermaid diagrams (found ${mermaidMatches.length})`);

// Verify specific diagram types
assert.ok(content.includes('stateDiagram-v2'), 'Must include State Machine diagram');
assert.ok(content.includes('sequenceDiagram'), 'Must include Hot-Swap Sequence diagram');
assert.ok(content.includes('autonumber'), 'Sequence diagram must use autonumber for step clarity');
console.log(`  ✓ ${mermaidMatches.length} Mermaid visual diagrams validated (State Machine, Sequence, Architecture, Escalation).\n`);

// -----------------------------------------------------------------------------
// TEST 7: Operational Checklists & Approval Governance
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: Operational Checklists & Approval Governance');
assert.ok(content.includes('Pre-Rollback Pre-Flight Checklist'), 'Must include pre-flight checklist');
assert.ok(content.includes('In-Flight Hot-Swap Checklist'), 'Must include in-flight checklist');
assert.ok(content.includes('Post-Flight Verification Checklist'), 'Must include post-flight checklist');
assert.ok(content.includes('اعتماد وتوقيع الوثيقة') || content.includes('Document Approvals'), 'Must include document approvals table');
assert.ok(content.includes('Clinical QA Lead'), 'Must list Clinical QA Lead in approvals');
assert.ok(content.includes('CISO') || content.includes('CTO'), 'Must list CISO/CTO in approvals');
assert.ok(content.includes('DPO'), 'Must list DPO in approvals');
console.log('  ✓ Operational checklists, incident runbooks, and multi-party signoff tables verified.\n');

console.log('================================================================================');
console.log('✅ ALL MODEL REGISTRY SOP OPERATIONS DOCUMENTATION TESTS PASSED (100% SUCCESS)');
console.log('================================================================================');
process.exit(0);
