/**
 * Health Vibe AI - Clinic Lead Database & Instant Email Dispatch Test Suite
 * Item 18: ربط نموذج طلب انضمام العيادات بقاعدة البيانات وخدمة البريد الفورية للـ Admin مع إظهار رسالة تأكيد ورقم طلب للمركز
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('==================================================================');
console.log('🏥 HEALTH VIBE AI: CLINIC LEAD DATABASE & EMAIL DISPATCH TESTS');
console.log('   Lead Persistence, Admin Instant Email, Confirmation Card & Ref');
console.log('==================================================================\n');

const clinicsHtmlPath = path.resolve(__dirname, '../app/clinics.html');
const serverJsPath = path.resolve(__dirname, '../backend/server.js');
const firestoreRulesPath = path.resolve(__dirname, '../backend/firestore.rules');

assert(fs.existsSync(clinicsHtmlPath), 'app/clinics.html must exist');
assert(fs.existsSync(serverJsPath), 'backend/server.js must exist');
assert(fs.existsSync(firestoreRulesPath), 'backend/firestore.rules must exist');

const clinicsHtmlContent = fs.readFileSync(clinicsHtmlPath, 'utf8');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');
const firestoreRulesContent = fs.readFileSync(firestoreRulesPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Firestore Security Rules Authorization for clinic_leads
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Firestore Security Rules for clinic_leads collection');
assert(firestoreRulesContent.includes('match /clinic_leads/{leadId}'), 'Security rules define match for clinic_leads');
assert(firestoreRulesContent.includes('allow create: if true;'), 'Security rules permit lead creation');
console.log('  ✓ Firestore security rules properly authorize clinic lead creation.\n');

// -----------------------------------------------------------------------------
// TEST 2: Confirmation UI & Tracking Reference Elements in clinics.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Confirmation UI & Tracking Reference Elements in clinics.html');
assert(clinicsHtmlContent.includes('id="leadSuccessAlert"'), 'leadSuccessAlert exists');
assert(clinicsHtmlContent.includes('id="leadSuccessTitle"'), 'leadSuccessTitle exists');
assert(clinicsHtmlContent.includes('id="leadSuccessMsg"'), 'leadSuccessMsg exists');
assert(clinicsHtmlContent.includes('id="leadRefLabel"'), 'leadRefLabel exists');
assert(clinicsHtmlContent.includes('id="leadSuccessRef"'), 'leadSuccessRef element exists for tracking number');
assert(clinicsHtmlContent.includes('id="btnCopyLeadRef"'), 'btnCopyLeadRef 1-click copy button exists');
assert(clinicsHtmlContent.includes('function copyLeadRef()'), 'copyLeadRef handler function defined');
assert(clinicsHtmlContent.includes('id="summaryClinicName"'), 'summaryClinicName element exists');
assert(clinicsHtmlContent.includes('id="summaryContactName"'), 'summaryContactName element exists');
assert(clinicsHtmlContent.includes('id="summaryPhone"'), 'summaryPhone element exists');
assert(clinicsHtmlContent.includes('id="summaryPackage"'), 'summaryPackage element exists');
assert(clinicsHtmlContent.includes('id="leadNextSteps"'), 'leadNextSteps element exists');
assert(clinicsHtmlContent.includes('id="leadWhatsAppBtn"'), 'leadWhatsAppBtn quick communication button exists');
assert(clinicsHtmlContent.includes('function resetClinicLeadForm()'), 'resetClinicLeadForm handler exists');
console.log('  ✓ Rich confirmation card, tracking reference badge, copy button, and summary elements verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Bilingual Arabic & English Support for Confirmation Card
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Bilingual Arabic & English Support for Confirmation Card');
assert(clinicsHtmlContent.includes('leadSuccessTitle: "تم تسجيل طلب انضمام المركز الطبي بنجاح!'), 'Arabic title defined in clinicTranslations.ar');
assert(clinicsHtmlContent.includes('leadSuccessTitle: "Clinic Onboarding Request Registered Successfully!'), 'English title defined in clinicTranslations.en');
assert(clinicsHtmlContent.includes('leadRefLabel: "رقم مرجع الطلب الخاص بمركزك'), 'Arabic ref label defined');
assert(clinicsHtmlContent.includes('leadRefLabel: "Your Clinic Tracking Reference ID:'), 'English ref label defined');
assert(clinicsHtmlContent.includes('btnCopyLeadRefText: "نسخ رقم الطلب"'), 'Arabic copy text defined');
assert(clinicsHtmlContent.includes('btnCopyLeadRefText: "Copy Reference ID"'), 'English copy text defined');
console.log('  ✓ Bilingual Arabic & English translations properly declared for confirmation card.\n');

// -----------------------------------------------------------------------------
// TEST 4: Client-side Firebase Firestore Integration in clinics.html
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Client-side Firebase Firestore Integration in clinics.html');
assert(clinicsHtmlContent.includes('firebase-firestore-compat.js'), 'Loads Firestore compat script');
assert(clinicsHtmlContent.includes('function getClinicFirestore()'), 'getClinicFirestore helper defined');
assert(clinicsHtmlContent.includes('firestore.collection("clinic_leads")'), 'Directly sets lead document in clinic_leads');
assert(clinicsHtmlContent.includes('localStorage.setItem("hv_last_clinic_lead"'), 'Persists lead to localStorage for offline redundancy');
console.log('  ✓ Client-side Firebase Firestore connection and offline localStorage redundancy verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: Backend Instant Admin Email Dispatch & Ingestion Route
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Backend Instant Admin Email Dispatch & Ingestion Route');
assert(serverJsContent.includes('createTransporter'), 'Server imports and uses createTransporter');
assert(serverJsContent.includes("type: 'CLINIC_LEAD_ADMIN_ALERT'"), 'Enqueues CLINIC_LEAD_ADMIN_ALERT in email_notifications');
assert(serverJsContent.includes("db.collection('clinic_leads')"), 'Saves lead to Firestore clinic_leads');
assert(serverJsContent.includes('transporter.sendMail('), 'Sends instant email via transporter');
assert(serverJsContent.includes('emailDispatched'), 'Returns emailDispatched status in response');

const { getSentEmailsLog, clearSentEmailsLog } = require('../backend/notification-service');
clearSentEmailsLog();

const app = require('../backend/server');
const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const testPayload = {
      clinicName: 'Al-Hayat Respiratory Specialized Hospital',
      contactName: 'Dr. Mahmoud El-Sayed',
      email: 'dr.mahmoud@alhayathospital.org',
      phone: '+201012345678',
      packageType: 'pilot',
      specialty: 'pulmonology',
      doctorCount: '6-15',
      city: 'Alexandria',
      notes: 'Testing automated instant admin dispatch and tracking reference'
    };

    const res = await makePostRequest(`${baseUrl}/api/clinics/demo-request`, testPayload);

    assert.strictEqual(res.statusCode, 201, 'Returns 201 Created');
    assert.strictEqual(res.body.success, true, 'Returns success: true');
    assert(res.body.leadId && res.body.leadId.startsWith('LEAD-'), 'Returns unique LEAD reference number');
    assert.strictEqual(res.body.emailDispatched, true, 'Reports emailDispatched: true');
    assert.strictEqual(res.body.isPilot, true, 'Tags pilot package correctly');
    assert.strictEqual(res.body.leadSummary.clinicName, testPayload.clinicName, 'Includes clinicName in summary');
    assert.strictEqual(res.body.leadSummary.phone, testPayload.phone, 'Includes phone in summary');

    // Verify email was captured in sentEmailsLog
    const sentLogs = getSentEmailsLog();
    assert(sentLogs.length >= 1, 'At least 1 email was sent via transport');
    const adminMail = sentLogs.find(m => m.subject.includes(res.body.leadId));
    assert(adminMail, 'Sent email contains the exact lead reference in subject');
    assert(adminMail.html.includes(testPayload.clinicName), 'Email HTML contains clinic name');
    assert(adminMail.html.includes(testPayload.contactName), 'Email HTML contains contact name');
    assert(adminMail.html.includes(testPayload.phone), 'Email HTML contains phone number');
    assert(adminMail.html.includes(res.body.leadId), 'Email HTML contains lead reference ID');

    console.log(`  ✓ Instant email verified: Sent to ${adminMail.to} with subject "${adminMail.subject}"`);
    console.log(`  ✓ Lead reference ${res.body.leadId} correctly generated, persisted, and confirmed.\n`);

    console.log('==================================================================');
    console.log('🎉 ALL 5 DATABASE & INSTANT EMAIL DISPATCH TESTS PASSED (100%)!');
    console.log('==================================================================');

    server.close();
    process.exit(0);
  } catch (err) {
    server.close();
    console.error('Test failed with error:', err);
    process.exit(1);
  }
});

function makePostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = JSON.stringify(data);

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
        } catch(e) {
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
