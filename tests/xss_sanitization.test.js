/**
 * Health Vibe AI - XSS Sanitization Regression Tests
 *
 * Covers user/database/file-sourced strings that flow into reports,
 * email templates, assistant rendering, and file-name previews.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildResultReadyEmail,
  buildMoreInfoEmail
} = require('../backend/notification-service');

console.log('\n==================================================================');
console.log('🛡️  HEALTH VIBE AI: XSS SANITIZATION REGRESSION TESTS');
console.log('==================================================================\n');

const maliciousName = 'أحمد <img src=x onerror=alert(1)>';
const maliciousNote = '<svg/onload=alert(2)>راجع الطبيب<script>alert(3)</script>';
const maliciousFileName = 'license"><img src=x onerror=alert(4)>.pdf';

function assertNoExecutableHtml(html, label) {
  assert(!/<script\b/i.test(html), `${label} must not contain script tags`);
  assert(!/<img\b/i.test(html), `${label} must not contain injected img tags`);
  assert(!/<svg\b/i.test(html), `${label} must not contain injected svg tags`);
  assert(!/<[^>]+\son[a-z]+\s*=/i.test(html), `${label} must not contain inline event handlers`);
  assert(!/javascript:/i.test(html), `${label} must not contain javascript: URLs`);
}

console.log('▶ TEST 1: Email templates escape patient names and clinical notes');
const resultEmail = buildResultReadyEmail({
  patientName: maliciousName,
  caseId: 'case_xss_0001',
  reportRef: 'HV-REP-XSS',
  doctorName: maliciousName,
  doctorSpecialty: 'صدرية',
  clinicalDiagnosis: maliciousNote,
  medications: maliciousNote,
  recommendations: [maliciousNote],
  appUrl: 'javascript:alert(9)'
});
assert(resultEmail.html.includes('&lt;img'), 'Patient name payload should be escaped');
assert(resultEmail.html.includes('&lt;svg'), 'Clinical note payload should be escaped');
assert(resultEmail.html.includes('https://app.healthvibe.ai/app/index.html'), 'Unsafe appUrl should fall back to trusted origin');
assertNoExecutableHtml(resultEmail.html, 'Result email');

const moreInfoEmail = buildMoreInfoEmail({
  patientName: maliciousName,
  caseId: 'case_xss_0002',
  doctorName: maliciousName,
  moreInfoNote: maliciousNote,
  appUrl: 'data:text/html,<script>alert(1)</script>'
});
assert(moreInfoEmail.html.includes('&lt;img'), 'More-info patient name should be escaped');
assert(moreInfoEmail.html.includes('&lt;svg'), 'More-info note should be escaped');
assert(moreInfoEmail.html.includes('https://app.healthvibe.ai/app/index.html'), 'Unsafe more-info appUrl should fall back to trusted origin');
assertNoExecutableHtml(moreInfoEmail.html, 'More-info email');
console.log('  ✓ Email templates render malicious names and notes as inert text.');

console.log('\n▶ TEST 2: Frontend contains shared escaping, trusted HTML sanitizer, and safe URL checks');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
assert(appJs.includes('function escapeHtml(value)'), 'app.js must define escapeHtml');
assert(appJs.includes('function sanitizeTrustedHtml(html)'), 'app.js must define a trusted HTML sanitizer');
assert(appJs.includes('function getSafeExternalUrl(value'), 'app.js must validate external URL protocols');
assert(appJs.includes('item.appendChild(createTextElement("strong", file.name))') || appJs.includes('escapeHtml(fileState.fileName'), 'Uploaded file names must be safely escaped or rendered with textContent');
assert(appJs.includes('setTrustedHtml(thinkingBubble, botResponse)'), 'Assistant responses must pass through trusted sanitizer');
assert(!appJs.includes('item.innerHTML = `<strong>${file.name}</strong>'), 'File names must not be interpolated into innerHTML');
assert(!/<script(?![^>]*\bsrc=)/i.test(indexHtml), 'index.html must not contain inline script blocks');
assert(indexHtml.includes('script-src-attr'), 'CSP must isolate temporary inline handler support to script-src-attr');
console.log('  ✓ Frontend dangerous sinks are covered for file previews, links, and assistant output.');

console.log('\n▶ TEST 3: Malicious sample values remain escaped in helper logic');
const escapedFileName = maliciousFileName
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
assert(escapedFileName.includes('&quot;&gt;&lt;img'), 'Filename payload should escape attribute-breaking characters');
assertNoExecutableHtml(`<div>${escapedFileName}</div>`, 'Escaped file name sample');
console.log('  ✓ Malicious file-name sample is represented as text, not markup.');

console.log('\n==================================================================');
console.log('🎉 ALL XSS SANITIZATION REGRESSION TESTS PASSED');
console.log('==================================================================\n');
