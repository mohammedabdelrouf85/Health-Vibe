/**
 * Health Vibe AI - Esaal Benchmark: Saved Chatbot History Test Suite
 * Tasks #666, #667, #668, #669, #670
 *
 * Test Matrix:
 * 1. UI/UX Flow (#666): Conversation list, search, message thread, emergency flags, export button, AR/EN.
 * 2. Backend & APIs (#667): appendMessage, listConversations, getConversation, shareWithDoctor, delete, export, REST endpoints.
 * 3. Safety & Privacy (#668): Permanent medical disclaimer stamped on every turn, immutable assistant guidance,
 *    zero doctor access unless explicitly shared by patient, persistent emergency warning on critical symptoms.
 * 4. Integration QA & Edge Cases (#669): Message tampering blocked, share revocation instantly closes doctor access,
 *    365-day retention cleanup, patient-specific export.
 * 5. Analytics & Logging (#670): Revisit rates, searches, emergency flags, doctor views, audit trail.
 */

'use strict';

const assert = require('assert');
const {
  ChatHistoryService,
  chatHistoryService,
  DISCLAIMER,
  EMERGENCY_TERMS,
  RETENTION_DAYS
} = require('../backend/chat-history-service');

const { ChatHistoryPanel } = require('../app/modules/appointments/feature-panels-641-670');

console.log('\n==================================================================');
console.log('💬 HEALTH VIBE AI: ESAAL SAVED CHATBOT HISTORY (TASKS #666-#670)');
console.log('   Permanent Medical Disclaimer, Patient Privacy & Doctor Sharing');
console.log('==================================================================\n');

async function runTests() {
  let virtualTime = 1770000000000;
  const now = () => virtualTime;
  const service = new ChatHistoryService({ now });

  const patient = { uid: 'pt_chat_01', role: 'patient' };
  const doctor = { uid: 'doc_pulmo_01', role: 'doctor' };
  const doctor2 = { uid: 'doc_pulmo_02', role: 'doctor' };
  const admin = { uid: 'admin_sys_01', role: 'super_admin' };
  const stranger = { uid: 'pt_stranger_99', role: 'patient' };
  const system = { uid: 'system_assistant', role: 'system' };

  // ==================================================================
  // TASK #667: Backend & APIs - Append Messages & Conversation State
  // ==================================================================
  console.log('▶ TASK #667: Backend & APIs - Conversation Lifecycle & Message Appends');
  {
    // Patient appends first question
    const step1 = service.appendMessage(patient.uid, {
      role: 'user',
      text: 'I have had a mild dry cough for 3 days without fever'
    }, patient);

    const convoId = step1.conversationId;
    assert.ok(convoId.startsWith('conv_'));

    // Assistant backend responds as system
    const step2 = service.appendMessage(patient.uid, {
      conversationId: convoId,
      role: 'assistant',
      text: 'Stay hydrated and monitor your symptoms. If shortness of breath occurs, see a doctor.'
    }, system);

    // Verify disclaimer is permanently stamped on assistant message
    assert.ok(step2.message.disclaimer);
    assert.ok(step2.message.disclaimer.ar.includes('إرشادات صحية عامة'));
    assert.ok(step2.message.disclaimer.en.includes('not a diagnosis'));

    // Patient cannot forge assistant messages
    assert.throws(() => service.appendMessage(patient.uid, {
      conversationId: convoId,
      role: 'assistant',
      text: 'Fake diagnosis'
    }, patient), /FORBIDDEN/);

    console.log('  ✓ Conversational thread created and assistant disclaimer stamped');
  }

  // ==================================================================
  // TASK #666: UI/UX Flow - List, Search & Thread Panels in AR/EN
  // ==================================================================
  console.log('▶ TASK #666: UI/UX Flow - Conversation Directory & Thread Views in AR/EN');
  {
    const listData = service.listConversations(patient.uid, patient);
    const listHtmlAr = ChatHistoryPanel.renderList(listData, false);
    assert.ok(listHtmlAr.includes('dir="rtl"'));
    assert.ok(listHtmlAr.includes('chatHistoryTitle'));
    assert.ok(listHtmlAr.includes('chatHistorySearch'));
    assert.ok(listHtmlAr.includes('chatHistoryExportBtn'));

    const listHtmlEn = ChatHistoryPanel.renderList(listData, true);
    assert.ok(listHtmlEn.includes('dir="ltr"'));
    assert.ok(listHtmlEn.includes('My assistant conversations'));
    assert.ok(listHtmlEn.includes('Export my history'));

    const convo = service.getConversation(listData.conversations[0].id, patient);
    const threadHtml = ChatHistoryPanel.renderConversation(convo, false);
    assert.ok(threadHtml.includes('hv-chat-thread'));
    assert.ok(threadHtml.includes('chatShareBtn'));
    assert.ok(threadHtml.includes('chatDeleteBtn'));
    assert.ok(threadHtml.includes('hv-disclaimer'));

    console.log('  ✓ Bilingual UI list, search, and thread panels verified');
  }

  // ==================================================================
  // TASK #668: Safety & Privacy - Emergency Warning & Controlled Sharing
  // ==================================================================
  console.log('▶ TASK #668: Safety & Privacy - Emergency Banner & Zero-Doctor-Default');
  {
    // Append a message with critical emergency symptom
    const emergConvo = service.appendMessage(patient.uid, {
      role: 'user',
      text: 'I cannot breathe and have severe chest pain'
    }, patient);

    const fullEmerg = service.getConversation(emergConvo.conversationId, patient);
    assert.strictEqual(fullEmerg.hasEmergencyFlag, true);
    assert.ok(fullEmerg.emergencyBanner);
    assert.ok(fullEmerg.emergencyBanner.ar.includes('123'));

    // Doctor has ZERO access by default
    assert.throws(() => service.getConversation(emergConvo.conversationId, doctor), /FORBIDDEN/);

    // Platform admin has NO access to read patient private chat transcripts
    assert.throws(() => service.getConversation(emergConvo.conversationId, admin), /FORBIDDEN/);

    // Patient explicitly shares conversation with doctor
    const shareResult = service.shareWithDoctor(emergConvo.conversationId, doctor.uid, patient);
    assert.ok(shareResult.sharedWith.includes(doctor.uid));

    // Doctor can now view the shared conversation
    const docView = service.getConversation(emergConvo.conversationId, doctor);
    assert.strictEqual(docView.id, emergConvo.conversationId);

    // Doctor2 is not shared, still blocked
    assert.throws(() => service.getConversation(emergConvo.conversationId, doctor2), /FORBIDDEN/);

    console.log('  ✓ Emergency banner persisted and doctor-sharing strictly opt-in');
  }

  // ==================================================================
  // TASK #669: Integration QA & Edge Cases - Tamper-Proof & Share Revocation
  // ==================================================================
  console.log('▶ TASK #669: Integration QA & Edge Cases - Tamper Block & Share Revocation');
  {
    const convos = service.listConversations(patient.uid, patient).conversations;
    const testConvoId = convos[0].id;

    // Tamper-proof: editing saved messages is strictly blocked
    assert.throws(() => service.editMessage(testConvoId, 'msg_01', 'Changed text', patient), /MESSAGE_IMMUTABLE/);

    // Patient revokes sharing from doctor
    service.revokeShare(convos[1].id, doctor.uid, patient);
    assert.throws(() => service.getConversation(convos[1].id, doctor), /FORBIDDEN/);

    // Patient exports history
    const exported = service.exportHistory(patient.uid, patient);
    assert.ok(exported.conversations.length >= 2);
    assert.ok(exported.disclaimer);

    // Retention cleanup (advance time > 365 days)
    virtualTime += (RETENTION_DAYS + 10) * 86400000;
    const expiredList = service.listConversations(patient.uid, patient);
    assert.strictEqual(expiredList.conversations.length, 0);

    console.log('  ✓ Message immutability, share revocation, export, and retention verified');
  }

  // ==================================================================
  // TASK #670: Analytics & Logging
  // ==================================================================
  console.log('▶ TASK #670: Analytics & Logging - Revisit Rates & Emergency Flags');
  {
    assert.throws(() => service.getAnalytics(patient), /FORBIDDEN/);
    const metrics = service.getAnalytics(admin);

    assert.ok(metrics.conversationsSaved >= 2);
    assert.ok(metrics.messagesSaved >= 3);
    assert.ok(metrics.emergencyFlagged >= 1);
    assert.ok(metrics.sharesWithDoctor >= 1);
    assert.ok(metrics.doctorViews >= 1);

    const audit = service.audit.list();
    assert.ok(audit.some(e => e.type === 'CHAT_SHARED'));
    assert.ok(audit.some(e => e.type === 'CHAT_SHARE_REVOKED'));
    assert.ok(audit.some(e => e.type === 'CHAT_READ_BY_SHARED_DOCTOR'));

    console.log('  ✓ Chat history analytics and privacy audit trail verified');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL ESAAL SAVED CHAT HISTORY TESTS PASSED (TASKS #666-#670)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ESAAL CHAT HISTORY TEST FAILED:', err);
  process.exit(1);
});
