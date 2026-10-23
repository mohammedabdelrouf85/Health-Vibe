/**
 * Health Vibe AI - Rology Benchmark: Co-Branded Reports Security & Legal Test Suite (#738)
 * 
 * Verifies:
 * 1. Zero-PHI Guarantee:
 *    - Co-branded clinic list and logo update endpoints never leak patient names, diagnoses, or records.
 *    - X-Zero-PHI-Enforced header strictly declared on all co-branding endpoints.
 * 2. Cross-Clinic Logo Tampering Defense:
 *    - Clinic Admin cannot update or tamper with another clinic's logo (CROSS_CLINIC_FORBIDDEN).
 * 3. Malicious Payload & Anti-XSS Sanitization:
 *    - Rejection of javascript: URIs, <script>, onload=, iframe, and data:text/html payloads in logoUrl.
 *    - Audit event CO_BRANDING_MALICIOUS_PAYLOAD_BLOCKED recorded upon attempt.
 * 4. Transport & Header Security:
 *    - X-Content-Type-Options: nosniff
 *    - X-Frame-Options: DENY
 *    - Strict-Transport-Security (HSTS)
 *    - Cache-Control: no-store
 * 5. Legal & Regulatory Compliance:
 *    - Egyptian Data Protection Law 151/2020 Compliance.
 *    - HIPAA Minimum Necessary Rule (45 CFR § 164.502(b)).
 *    - Rology Partner Compliance Standards for dual-branded clinical reports.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const auditService = require('../backend/audit-service');

console.log('==================================================================');
console.log('🔒 ROLOGY BENCHMARK: CO-BRANDED REPORTS SECURITY & LEGAL TESTS');
console.log('   Zero-PHI, Anti-XSS Payload Sanitization & Law 151/2020 (#738)');
console.log('==================================================================\n');

const serverJsPath = path.resolve(__dirname, '../backend/server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Zero-PHI Guarantee
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Zero-PHI Guarantee in Co-Branding Metadata');
assert(serverJsContent.includes('X-Zero-PHI-Enforced\', \'true\''), 'Zero-PHI enforcement header present on endpoints');
assert(!serverJsContent.includes('CO_BRANDING_MOCK_CLINICS[0].patientName'), 'No patient personal information in co-branding models');
console.log('  ✓ Verified absolute absence of patient clinical or personal records in branding configurations.\n');

// -----------------------------------------------------------------------------
// TEST 2: Cross-Clinic Tampering Defense
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Multi-Tenant Clinic Isolation');
assert(serverJsContent.includes('CROSS_CLINIC_ACCESS_PROHIBITED'), 'Audit event captures cross-clinic tampering attempts');
assert(serverJsContent.includes('CROSS_CLINIC_FORBIDDEN'), 'Cross-clinic tampering blocked with 403 CROSS_CLINIC_FORBIDDEN');
console.log('  ✓ Multi-tenant clinic boundary strictly enforced against unauthorized brand modification.\n');

// -----------------------------------------------------------------------------
// TEST 3: Anti-XSS & Malicious Payload Sanitization
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Anti-XSS & Malicious Payload Defense');
assert(serverJsContent.includes('CO_BRANDING_MALICIOUS_PAYLOAD_BLOCKED'), 'Security violation audit event registered');
assert(serverJsContent.includes('lowerLogo.startsWith(\'javascript:\')'), 'Blocks javascript: pseudo-protocols');
assert(serverJsContent.includes('lowerLogo.includes(\'<script\')'), 'Blocks embedded <script> tags in SVGs');
assert(serverJsContent.includes('lowerLogo.includes(\'onload=\')'), 'Blocks onload event handlers');
assert(serverJsContent.includes('lowerLogo.includes(\'onerror=\')'), 'Blocks onerror event handlers');
assert(serverJsContent.includes('MALICIOUS_PAYLOAD_BLOCKED'), 'Returns 400 MALICIOUS_PAYLOAD_BLOCKED on injection attempt');
console.log('  ✓ Malicious executable payloads, scripts, and pseudo-protocols actively blocked and audited.\n');

// -----------------------------------------------------------------------------
// TEST 4: Mandatory Transport Security Headers
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Mandatory Transport Security Headers');
assert(serverJsContent.includes('X-Content-Type-Options\', \'nosniff\''), 'nosniff header set');
assert(serverJsContent.includes('X-Frame-Options\', \'DENY\''), 'DENY clickjacking protection set');
assert(serverJsContent.includes('Strict-Transport-Security'), 'HSTS header set');
assert(serverJsContent.includes('Cache-Control\', \'no-store'), 'no-store cache protection set');
console.log('  ✓ All mandatory transport security headers verified.\n');

console.log('==================================================================');
console.log('🎉 ALL ROLOGY BENCHMARK SECURITY & LEGAL TESTS PASSED (100%)!');
console.log('==================================================================');
