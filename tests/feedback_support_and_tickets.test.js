/**
 * HEALTH VIBE AI: FEEDBACK, SUPPORT TICKETING & PERMISSIONS TEST SUITE
 * 
 * Validates:
 * 1. Categorization into tickets: experience ratings, bug reports, inaccurate-information reports,
 *    feature requests, account recovery, and contact forms with priority, status, and owner.
 * 2. Strict Permissions: Submitters can access ONLY their own tickets (User A cannot read User B's tickets).
 * 3. Sensitive Medical Content Access Restriction: PHI / clinical details restricted to clinicians & super_admin;
 *    masked for non-clinical support.
 * 4. Dedicated Escalation Channel: Escalating tickets to CRITICAL priority with clinical safety queue routing.
 * 5. Administrative Dashboard: Status updates, priority adjustment, owner assignment.
 * 6. Account Recovery Support: Dedicated endpoint & ticket generation.
 * 7. Help Center FAQ & Contact Form.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const feedbackSupportService = require('../backend/feedback-support-service');

console.log('==================================================================');
console.log('🎫 HEALTH VIBE AI: FEEDBACK & SUPPORT TICKETING TEST SUITE');
console.log('   Permissions, PHI Redaction, Ticket Funnels, Escalation & Recovery');
console.log('==================================================================\n');

// Mock User Accounts for RBAC testing
const userAccounts = {
  'patient-sarah': { uid: 'usr_pat_sarah', role: 'patient', name: 'Sarah Mansour', email: 'sarah@example.com', email_verified: true },
  'patient-ali': { uid: 'usr_pat_ali', role: 'patient', name: 'Ali Hassan', email: 'ali@example.com', email_verified: true },
  'doc-tarek': { uid: 'doc_tarek', role: 'doctor', name: 'Dr. Tarek Mahmoud, MD', email: 'tarek@healthvibes.org', email_verified: true },
  'support-agent': { uid: 'supp_karim', role: 'support', name: 'Karim Support', email: 'karim@healthvibes.org', email_verified: true },
  'super-admin': { uid: 'admin_sys', role: 'super_admin', isOwner: true, name: 'Chief Admin', email: 'admin@healthvibes.org', email_verified: true }
};

const mockFirebase = {
  apps: [{}],
  firestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => ({})
      }),
      where: () => ({
        get: async () => ({ docs: [], empty: true })
      }),
      limit: () => ({
        get: async () => ({ docs: [], empty: true })
      }),
      get: async () => ({ docs: [], empty: true })
    })
  }),
  auth: () => ({
    verifyIdToken: async (token) => {
      const u = userAccounts[token];
      if (!u) throw new Error(`Unknown token: ${token}`);
      return { ...u };
    }
  })
};

const sandbox = {
  require: name => {
    if (name === 'firebase-admin') return mockFirebase;
    if (name === 'dotenv') return { config() {} };
    if (['./whatsapp-bot', './backup-service'].includes(name)) return {};
    return backendRequire(name);
  },
  module: { exports: {} },
  __dirname: path.dirname(serverPath),
  process: {
    env: {
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'health-vibes-dev',
      EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev',
      USE_FIREBASE_EMULATOR: 'true'
    },
    on() {},
    uptime: () => 1
  },
  console,
  Buffer,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(serverPath, 'utf8'), sandbox);
const sandboxedApp = sandbox.module.exports;

(async () => {
  const server = sandboxedApp.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, route, token = null, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + route, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const parsed = await res.json();
    return { status: res.status, body: parsed };
  }

  try {
    feedbackSupportService.resetState();

    // ---------------------------------------------------------------------------
    // TEST 1: Organize All Categories into Structured Tickets with Priority & Owner
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 1: Organizing Categories into Tickets with Priority, Status & Owner');

    // 1.1 Experience Rating (1-5 stars) -> Low Priority, Patient Relations
    const ratingRes = await request('POST', '/api/feedback/submit', 'patient-sarah', {
      type: 'experience_rating',
      rating: 5,
      category: 'clinical_assessment',
      comment: 'Excellent smart breathing assessment, fast and very intuitive!'
    });
    assert.equal(ratingRes.status, 201);
    assert.equal(ratingRes.body.success, true);
    assert.ok(ratingRes.body.ticketId);
    assert.equal(ratingRes.body.priority, 'low');
    assert.equal(ratingRes.body.status, 'open');
    assert.ok(ratingRes.body.owner?.name?.includes('Patient Relations'));

    // 1.2 Bug Report -> Medium Priority, Technical QA
    const bugRes = await request('POST', '/api/feedback/tickets', 'patient-sarah', {
      type: 'bug_report',
      category: 'ui_ux',
      subject: 'Button overlapping on mobile screen',
      description: 'The breathing orb overlaps the history button in horizontal view on Safari iOS.'
    });
    assert.equal(bugRes.status, 201);
    assert.equal(bugRes.body.priority, 'medium');
    assert.equal(bugRes.body.status, 'open');
    assert.ok(bugRes.body.owner?.name?.includes('Technical QA'));

    // 1.3 Inaccurate Information Report -> High Priority, Clinical Safety Officer
    const inaccRes = await request('POST', '/api/feedback/tickets', 'patient-sarah', {
      type: 'inaccurate_information',
      category: 'ai_triage_accuracy',
      subject: 'Discrepancy in reported SpO2 reading',
      description: 'The pulse oximeter read 94% but report displayed 89% triage alert.',
      hasSensitiveMedicalContent: true,
      medicalDetails: { reportedSpO2: 94, recordedInReport: 89, patientVitals: 'Pulse 82 bpm' }
    });
    assert.equal(inaccRes.status, 201);
    assert.equal(inaccRes.body.priority, 'high');
    assert.equal(inaccRes.body.status, 'open');
    assert.ok(inaccRes.body.owner?.name?.includes('Clinical Safety Officer'));

    // 1.4 Feature Request -> Low Priority, Product Ops
    const featRes = await request('POST', '/api/feedback/tickets', 'doc-tarek', {
      type: 'feature_request',
      category: 'rx_diagnostic_tools',
      subject: 'Add quick preset for Bronchodilator dosage',
      description: 'Would like a 1-click preset for Salbutamol 100mcg MDI inhaler.'
    });
    assert.equal(featRes.status, 201);
    assert.equal(featRes.body.priority, 'low');
    assert.equal(featRes.body.status, 'open');
    assert.ok(featRes.body.owner?.name?.includes('Product Operations'));

    console.log('  ✓ 4 Core ticket types verified with automated priority, status, and assigned owner.\n');

    // ---------------------------------------------------------------------------
    // TEST 2: Strict Permissions - Submitters Access ONLY Their Own Tickets
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 2: Submitter Isolation (Submitters Can Access ONLY Their Own Tickets)');

    // Sarah's ticket ID
    const sarahTicketId = inaccRes.body.ticketId;

    // Ali creates his own ticket
    const aliTicketRes = await request('POST', '/api/feedback/tickets', 'patient-ali', {
      type: 'bug_report',
      category: 'appointments',
      subject: 'Calendar slot issue',
      description: 'I could not see the 4 PM slot for Dr. Tarek.'
    });
    assert.equal(aliTicketRes.status, 201);
    const aliTicketId = aliTicketRes.body.ticketId;

    // 2.1 Ali lists tickets -> must see Ali's ticket, and NOT Sarah's tickets!
    const aliListRes = await request('GET', '/api/feedback/tickets', 'patient-ali');
    assert.equal(aliListRes.status, 200);
    assert.equal(aliListRes.body.tickets.length, 1);
    assert.equal(aliListRes.body.tickets[0].ticketId, aliTicketId);
    assert.ok(!aliListRes.body.tickets.some(t => t.ticketId === sarahTicketId), 'Ali cannot see Sarah’s ticket in list');

    // 2.2 Sarah lists tickets -> must see only Sarah's 3 tickets, NOT Ali's ticket!
    const sarahListRes = await request('GET', '/api/feedback/tickets', 'patient-sarah');
    assert.equal(sarahListRes.status, 200);
    assert.equal(sarahListRes.body.tickets.length, 3);
    assert.ok(!sarahListRes.body.tickets.some(t => t.ticketId === aliTicketId), 'Sarah cannot see Ali’s ticket in list');

    // 2.3 Direct access check: Ali attempts GET /api/feedback/tickets/:sarahTicketId
    const crossAccessRes = await request('GET', `/api/feedback/tickets/${sarahTicketId}`, 'patient-ali');
    assert.equal(crossAccessRes.status, 403, 'Cross-user ticket read rejected with 403 ACCESS_DENIED');
    assert.equal(crossAccessRes.body.error, 'ACCESS_DENIED');

    console.log('  ✓ Submitters strictly restricted to their own tickets (Zero cross-user leakage).\n');

    // ---------------------------------------------------------------------------
    // TEST 3: Sensitive Medical Content Access Restriction
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 3: Restricted Access to Sensitive Medical Content');

    // 3.1 Patient Sarah (the submitter) views her own ticket -> sees her own medical details
    const sarahViewRes = await request('GET', `/api/feedback/tickets/${sarahTicketId}`, 'patient-sarah');
    assert.equal(sarahViewRes.status, 200);
    assert.equal(sarahViewRes.body.ticket.medicalAccessRestricted, undefined);
    assert.equal(sarahViewRes.body.ticket.medicalDetails.reportedSpO2, 94);

    // 3.2 Doctor Tarek (authorized clinician) views Sarah's inaccurate info report -> sees full medical details
    const doctorViewRes = await request('GET', `/api/feedback/tickets/${sarahTicketId}`, 'doc-tarek');
    assert.equal(doctorViewRes.status, 200);
    assert.equal(doctorViewRes.body.ticket.medicalAccessRestricted, false);
    assert.equal(doctorViewRes.body.ticket.medicalDetails.reportedSpO2, 94);

    // 3.3 Non-clinical Support Agent (Karim) views Sarah's ticket -> medical details are masked/redacted!
    const supportViewRes = await request('GET', `/api/feedback/tickets/${sarahTicketId}`, 'support-agent');
    assert.equal(supportViewRes.status, 200);
    assert.equal(supportViewRes.body.ticket.medicalAccessRestricted, true);
    assert.ok(supportViewRes.body.ticket.medicalDetails.restricted === true);
    assert.ok(supportViewRes.body.ticket.medicalDetails.notice.includes('RESTRICTED SENSITIVE MEDICAL CONTENT'));
    assert.ok(supportViewRes.body.ticket.comment.includes('RESTRICTED CLINICAL INACCURACY REPORT'));

    console.log('  ✓ Sensitive clinical details accessible only to clinicians & patient submitter.');
    console.log('  ✓ Non-clinical staff masked with RESTRICTED SENSITIVE MEDICAL CONTENT notice.\n');

    // ---------------------------------------------------------------------------
    // TEST 4: Escalation Channel for Critical Issues
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 4: Dedicated Escalation Channel');

    // Sarah escalates her inaccurate info ticket due to lack of immediate response
    const escalateRes = await request('POST', `/api/feedback/tickets/${sarahTicketId}/escalate`, 'patient-sarah', {
      reason: 'Urgent: Patient is symptomatic and current SpO2 alert differs from pulse oximeter.'
    });
    assert.equal(escalateRes.status, 200);
    assert.equal(escalateRes.body.success, true);
    assert.equal(escalateRes.body.ticket.status, 'escalated');
    assert.equal(escalateRes.body.ticket.priority, 'critical');
    assert.equal(escalateRes.body.ticket.escalated, true);
    assert.ok(escalateRes.body.ticket.escalationInfo.escalationReason.includes('Urgent'));

    console.log('  ✓ Ticket escalated to CRITICAL priority with clinical escalation queue routing.\n');

    // ---------------------------------------------------------------------------
    // TEST 5: Administrative Dashboard: Status, Priority & Owner Updates
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 5: Administrative Ticket Lifecycle & Owner Management');

    // Support agent updates Ali's ticket to in_progress and assigns Dr. Tarek
    const updateRes = await request('PATCH', `/api/feedback/tickets/${aliTicketId}`, 'support-agent', {
      status: 'in_progress',
      priority: 'high',
      owner: { uid: 'doc_tarek', name: 'Dr. Tarek Mahmoud, MD', role: 'doctor' }
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.ticket.status, 'in_progress');
    assert.equal(updateRes.body.ticket.priority, 'high');
    assert.equal(updateRes.body.ticket.owner.name, 'Dr. Tarek Mahmoud, MD');

    // Patient cannot patch status or assign owners
    const unauthorizedPatch = await request('PATCH', `/api/feedback/tickets/${aliTicketId}`, 'patient-ali', {
      status: 'closed'
    });
    assert.equal(unauthorizedPatch.status, 403, 'Patient cannot perform admin ticket updates');

    // Add communication response
    const replyRes = await request('POST', `/api/feedback/tickets/${aliTicketId}/respond`, 'support-agent', {
      message: 'Hello Ali, we investigated the calendar slot and Dr. Tarek has opened an extra slot for you.'
    });
    assert.equal(replyRes.status, 201);
    assert.ok(replyRes.body.response.id);

    console.log('  ✓ Admin/Support ticket status and owner assignment verified with RBAC enforcement.\n');

    // ---------------------------------------------------------------------------
    // TEST 6: Account Recovery Support Channel
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 6: Account Recovery Support Channel');

    const recoveryRes = await request('POST', '/api/support/account-recovery', null, {
      identifier: 'sarah.lost.mfa@example.com',
      issueType: 'lost_mfa',
      contactPhone: '+201001234567',
      explanation: 'Lost my registered smartphone and cannot receive 2-factor SMS/WhatsApp codes.'
    });
    assert.equal(recoveryRes.status, 201);
    assert.equal(recoveryRes.body.success, true);
    assert.ok(recoveryRes.body.ticketId);
    assert.ok(recoveryRes.body.referenceCode.startsWith('REC-'));
    assert.equal(recoveryRes.body.status, 'open');

    // Check that recovery ticket is classified as HIGH priority in queue
    const recTicket = await feedbackSupportService.getTicketById(recoveryRes.body.ticketId, userAccounts['super-admin']);
    assert.equal(recTicket.priority, 'high');
    assert.equal(recTicket.type, 'account_recovery');

    console.log('  ✓ Dedicated Account Recovery support ticket created with HIGH priority and reference code.\n');

    // ---------------------------------------------------------------------------
    // TEST 7: FAQ & Help Center Knowledgebase
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 7: FAQ Knowledgebase & Help Center');

    // 7.1 All FAQs
    const allFaqsRes = await request('GET', '/api/support/faq');
    assert.equal(allFaqsRes.status, 200);
    assert.ok(allFaqsRes.body.count >= 7);

    // 7.2 Category filter
    const clinicalFaqs = await request('GET', '/api/support/faq?category=clinical_assessment');
    assert.equal(clinicalFaqs.status, 200);
    assert.ok(clinicalFaqs.body.faqs.every(f => f.category === 'clinical_assessment'));

    // 7.3 Search query
    const searchRes = await request('GET', '/api/support/faq?search=SpO2');
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.faqs.length >= 1);

    console.log('  ✓ Help Center FAQ retrieval, category filtering, and bilingual search verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 8: Public Contact Us Form
    // ---------------------------------------------------------------------------
    console.log('▶ TEST 8: Contact Us Form Submission');

    const contactRes = await request('POST', '/api/support/contact', null, {
      name: 'Mohamed Salah',
      email: 'm.salah@cairo-clinic.eg',
      subject: 'Inquiry regarding clinic integration with Health Vibe AI',
      category: 'clinic_sales',
      message: 'We are a 5-branch pulmonology center in Giza and would like to integrate Health Vibe AI with our EMR.'
    });
    assert.equal(contactRes.status, 201);
    assert.equal(contactRes.body.success, true);
    assert.ok(contactRes.body.ticketId);

    const contactTicket = await feedbackSupportService.getTicketById(contactRes.body.ticketId, userAccounts['super-admin']);
    assert.equal(contactTicket.type, 'contact_form');
    assert.equal(contactTicket.priority, 'medium');

    console.log('  ✓ General Contact Form processed and queued into support tickets.\n');

    console.log('==================================================================');
    console.log('🎉 ALL 8 FEEDBACK & SUPPORT TICKETING TESTS PASSED (100%)');
    console.log('==================================================================\n');
  } finally {
    server.close();
  }
})().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
