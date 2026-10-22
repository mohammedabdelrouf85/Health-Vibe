/**
 * Health Vibe AI - Saved Assistant Chat History (Esaal benchmark)
 * Tasks #667 (Backend), #668 (Safety & Privacy), #670 (Analytics)
 *
 * Lets a patient revisit the general health guidance the AI assistant gave them.
 * Safety & privacy rules:
 *  - The medical disclaimer is stamped on EVERY saved assistant message and is
 *    re-attached on every read; it cannot be removed by the client.
 *  - Assistant messages are immutable (integrity of what was actually said).
 *  - History is private to the patient. A doctor can only read a conversation the
 *    patient explicitly shared with that doctor; sharing is revocable.
 *  - Conversations that contained emergency red flags keep an emergency banner.
 *  - Patients can delete a conversation or export all of them; retention 365 days.
 *  - Analytics never contain message text.
 */

'use strict';

const kit = require('./feature-kit');

const RETENTION_DAYS = 365;
const MAX_MESSAGE_CHARS = 4000;

const DISCLAIMER = Object.freeze({
  ar: 'هذه إرشادات صحية عامة من مساعد ذكي ولا تُعد تشخيصاً أو بديلاً عن استشارة الطبيب. في الحالات الطارئة اتصل بـ 123.',
  en: 'This is general health guidance from an AI assistant, not a diagnosis or a substitute for a doctor. In an emergency call 123.'
});

const EMERGENCY_TERMS = [
  'can\'t breathe', 'cannot breathe', 'chest pain', 'blue lips', 'coughing blood', 'unconscious',
  'مش قادر اتنفس', 'ضيق تنفس شديد', 'ألم في الصدر', 'الم في الصدر', 'شفايف زرقا', 'كحة بدم', 'فقد الوعي'
];

class ChatHistoryService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.audit = kit.createAuditTrail('chat_history');
    this.analytics = kit.createAnalytics('chat_history');
    this.resetState();
  }

  resetState() {
    this.conversations = new Map();
    this.audit.reset();
    this.analytics.reset();
  }

  appendMessage(patientId, { conversationId, role, text }, user) {
    kit.requireUser(user);
    // Patients write their own turns; the assistant backend writes as 'system'.
    const isSystem = user.role === 'system';
    if (!isSystem && user.uid !== patientId) {
      throw new kit.FeatureError('FORBIDDEN', 'You can only write to your own conversations.', 403);
    }
    if (!['user', 'assistant'].includes(role)) throw new kit.FeatureError('INVALID_ROLE', 'role must be user or assistant.');
    if (role === 'assistant' && !isSystem) {
      throw new kit.FeatureError('FORBIDDEN', 'Assistant messages can only be written by the assistant service.', 403);
    }
    const clean = kit.sanitizeText(text, MAX_MESSAGE_CHARS);
    if (!clean) throw new kit.FeatureError('EMPTY_MESSAGE', 'Message text is required.');

    let convo = conversationId ? this.conversations.get(conversationId) : null;
    if (conversationId && !convo) throw new kit.FeatureError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
    if (convo && convo.patientId !== patientId) throw new kit.FeatureError('FORBIDDEN', 'Conversation belongs to another patient.', 403);
    if (!convo) {
      convo = {
        id: kit.newId('conv'),
        patientId,
        title: kit.redactPII(clean).slice(0, 60),
        createdAt: new Date(this.now()).toISOString(),
        updatedAt: null,
        hasEmergencyFlag: false,
        sharedWith: [],
        messages: []
      };
      this.conversations.set(convo.id, convo);
      this.analytics.track('chat_conversation_saved');
    }

    const message = Object.freeze({
      id: kit.newId('msg'),
      role,
      text: clean,
      at: new Date(this.now()).toISOString(),
      ...(role === 'assistant' ? { disclaimer: DISCLAIMER } : {})
    });
    convo.messages.push(message);
    convo.updatedAt = message.at;
    if (role === 'user' && this._isEmergency(clean)) {
      convo.hasEmergencyFlag = true;
      this.analytics.track('chat_emergency_flagged');
    }
    this.analytics.track('chat_message_saved', { role });
    return { conversationId: convo.id, message: this._withDisclaimer(message) };
  }

  /** Assistant messages are never editable. */
  editMessage(conversationId, messageId, _text, user) {
    kit.requireUser(user);
    this.audit.record('CHAT_EDIT_BLOCKED', user, { conversationId, messageId });
    throw new kit.FeatureError('MESSAGE_IMMUTABLE', 'Saved messages cannot be edited.', 403);
  }

  listConversations(patientId, user, { q } = {}) {
    kit.requireSelfOrAdmin(user, patientId);
    this._purgeExpired();
    const query = (kit.sanitizeText(q || '', 80)).toLowerCase();
    const list = [...this.conversations.values()]
      .filter(c => c.patientId === patientId)
      .filter(c => !query || c.messages.some(m => m.text.toLowerCase().includes(query)))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(c => ({
        id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt,
        messageCount: c.messages.length, hasEmergencyFlag: c.hasEmergencyFlag,
        sharedWithCount: c.sharedWith.length
      }));
    if (query) this.analytics.track('chat_history_searched', { resultCount: list.length });
    this.analytics.track('chat_history_listed');
    return { disclaimer: DISCLAIMER, conversations: list };
  }

  getConversation(conversationId, user) {
    const convo = this._get(conversationId);
    kit.requireUser(user);
    const isOwner = user.uid === convo.patientId;
    const isSharedDoctor = kit.isDoctor(user) && convo.sharedWith.includes(user.uid);
    if (!isOwner && !isSharedDoctor) {
      // Admins intentionally have NO read access to chat content.
      this.audit.record('CHAT_ACCESS_DENIED', user, { conversationId });
      throw new kit.FeatureError('FORBIDDEN', 'This conversation is private to the patient.', 403);
    }
    if (isSharedDoctor) this.audit.record('CHAT_READ_BY_SHARED_DOCTOR', user, { conversationId });
    this.analytics.track(isOwner ? 'chat_conversation_revisited' : 'chat_conversation_doctor_view');
    return {
      id: convo.id,
      title: convo.title,
      hasEmergencyFlag: convo.hasEmergencyFlag,
      emergencyBanner: convo.hasEmergencyFlag
        ? { ar: 'هذه المحادثة تضمنت أعراضاً طارئة. إذا استمرت الأعراض اتصل بـ 123 فوراً.', en: 'This conversation included emergency symptoms. If they persist, call 123 immediately.' }
        : null,
      disclaimer: DISCLAIMER,
      messages: convo.messages.map(m => this._withDisclaimer(m))
    };
  }

  shareWithDoctor(conversationId, doctorId, user) {
    const convo = this._get(conversationId);
    kit.requireUser(user);
    if (user.uid !== convo.patientId) throw new kit.FeatureError('FORBIDDEN', 'Only the patient can share a conversation.', 403);
    if (!doctorId) throw new kit.FeatureError('DOCTOR_REQUIRED', 'doctorId is required.');
    if (!convo.sharedWith.includes(doctorId)) convo.sharedWith.push(doctorId);
    this.analytics.track('chat_shared_with_doctor');
    this.audit.record('CHAT_SHARED', user, { conversationId, doctorId });
    return { sharedWith: convo.sharedWith.slice() };
  }

  revokeShare(conversationId, doctorId, user) {
    const convo = this._get(conversationId);
    kit.requireUser(user);
    if (user.uid !== convo.patientId) throw new kit.FeatureError('FORBIDDEN', 'Only the patient can revoke sharing.', 403);
    convo.sharedWith = convo.sharedWith.filter(d => d !== doctorId);
    this.audit.record('CHAT_SHARE_REVOKED', user, { conversationId, doctorId });
    return { sharedWith: convo.sharedWith.slice() };
  }

  deleteConversation(conversationId, user) {
    const convo = this._get(conversationId);
    kit.requireUser(user);
    if (user.uid !== convo.patientId) throw new kit.FeatureError('FORBIDDEN', 'Only the patient can delete this conversation.', 403);
    this.conversations.delete(conversationId);
    this.analytics.track('chat_conversation_deleted');
    this.audit.record('CHAT_DELETED', user, { conversationId });
    return { deleted: true };
  }

  exportHistory(patientId, user) {
    kit.requireUser(user);
    if (user.uid !== patientId) throw new kit.FeatureError('FORBIDDEN', 'Only the patient can export their history.', 403);
    const conversations = [...this.conversations.values()]
      .filter(c => c.patientId === patientId)
      .map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt, messages: c.messages.map(m => this._withDisclaimer(m)) }));
    this.analytics.track('chat_history_exported');
    return { exportedAt: new Date(this.now()).toISOString(), disclaimer: DISCLAIMER, conversations };
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const a = this.analytics;
    return {
      conversationsSaved: a.count('chat_conversation_saved'),
      messagesSaved: a.count('chat_message_saved'),
      historyOpens: a.count('chat_history_listed'),
      revisits: a.count('chat_conversation_revisited'),
      searches: a.count('chat_history_searched'),
      sharesWithDoctor: a.count('chat_shared_with_doctor'),
      doctorViews: a.count('chat_conversation_doctor_view'),
      deletions: a.count('chat_conversation_deleted'),
      exports: a.count('chat_history_exported'),
      emergencyFlagged: a.count('chat_emergency_flagged'),
      revisitRatePct: a.rate('chat_conversation_revisited', 'chat_conversation_saved')
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _withDisclaimer(m) {
    return m.role === 'assistant' ? { ...m, disclaimer: DISCLAIMER } : { ...m };
  }

  _isEmergency(text) {
    const lower = text.toLowerCase();
    return EMERGENCY_TERMS.some(t => lower.includes(t));
  }

  _get(id) {
    const c = this.conversations.get(id);
    if (!c) throw new kit.FeatureError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);
    return c;
  }

  _purgeExpired() {
    const cutoff = this.now() - RETENTION_DAYS * 86400000;
    for (const [id, c] of this.conversations) {
      if (new Date(c.updatedAt || c.createdAt).getTime() < cutoff) this.conversations.delete(id);
    }
  }
}

const chatHistoryService = new ChatHistoryService();

module.exports = {
  ChatHistoryService,
  chatHistoryService,
  DISCLAIMER,
  EMERGENCY_TERMS,
  RETENTION_DAYS
};
