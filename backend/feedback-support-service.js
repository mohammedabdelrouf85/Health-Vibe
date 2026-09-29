/**
 * Health Vibe AI - Feedback, Support Ticketing & Help Center Service
 * 
 * Manages:
 * 1. Categorized Support & Feedback Tickets:
 *    - Experience Ratings (1-5 stars)
 *    - Bug Reports
 *    - Inaccurate Information Reports (Clinical Safety & PHI Protection)
 *    - Feature Requests
 *    - Account Recovery Requests
 *    - Contact Us Forms
 * 2. Strict Permissions & Access Guards:
 *    - Submitters can access ONLY their own tickets.
 *    - Restricted access to sensitive medical content: Non-clinical roles see masked PHI.
 * 3. Escalation Channel: Direct routing to Clinical Safety Officers / Admin Escalations.
 * 4. FAQ & Help Center Knowledgebase.
 */

const crypto = require('crypto');

const TICKET_TYPES = {
  EXPERIENCE_RATING: 'experience_rating',
  BUG_REPORT: 'bug_report',
  INACCURATE_INFORMATION: 'inaccurate_information',
  FEATURE_REQUEST: 'feature_request',
  ACCOUNT_RECOVERY: 'account_recovery',
  CONTACT_FORM: 'contact_form'
};

const TICKET_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const TICKET_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

const DEFAULT_OWNERS = {
  [TICKET_TYPES.INACCURATE_INFORMATION]: {
    uid: 'clin_safety_officer',
    name: 'Clinical Safety Officer (Prof. Ahmed Hegazy, MD)',
    role: 'clinical_safety_officer'
  },
  [TICKET_TYPES.ACCOUNT_RECOVERY]: {
    uid: 'account_sec_agent',
    name: 'Security & Identity Verification Desk',
    role: 'support'
  },
  [TICKET_TYPES.BUG_REPORT]: {
    uid: 'tech_qa_lead',
    name: 'Technical QA & Platform Ops',
    role: 'support'
  },
  [TICKET_TYPES.FEATURE_REQUEST]: {
    uid: 'product_ops_lead',
    name: 'Product Operations Team',
    role: 'support'
  },
  [TICKET_TYPES.EXPERIENCE_RATING]: {
    uid: 'patient_relations_desk',
    name: 'Patient Relations & Experience Desk',
    role: 'support'
  },
  [TICKET_TYPES.CONTACT_FORM]: {
    uid: 'frontdesk_support',
    name: 'General Support Helpdesk',
    role: 'support'
  }
};

const FAQ_DATABASE = [
  {
    id: 'faq_assess_01',
    category: 'clinical_assessment',
    categoryNameAr: 'الفحص السريري الذكي',
    categoryNameEn: 'Smart Clinical Assessment',
    questionAr: 'كيف يعمل فحص الجهاز التنفسي الذكي في Health Vibes؟',
    questionEn: 'How does the Health Vibes smart respiratory assessment work?',
    answerAr: 'يحلل النظام الأعراض المدخلة (السعال، ضيق التنفس، درجة الحرارة، وأكسجة الدم SpO2) وفق خوارزميات سريرية معتمدة ومقيدة بحواجز أمان صارمة. يقوم النظام بتصنيف أولي للمخاطر وتوجيهه مباشرة للطبيب الممارس للمراجعة والاعتماد.',
    answerEn: 'The system evaluates entered symptoms (cough, dyspnea, temperature, and SpO2 oxygenation) using certified clinical algorithms bounded by strict safety guardrails. It produces a preliminary risk triage routed directly to a verified doctor for review and approval.'
  },
  {
    id: 'faq_assess_02',
    category: 'clinical_assessment',
    categoryNameAr: 'الفحص السريري الذكي',
    categoryNameEn: 'Smart Clinical Assessment',
    questionAr: 'هل يحل فحص الذكاء الاصطناعي محل التشخيص الطبي المباشر؟',
    questionEn: 'Does the AI assessment replace direct medical diagnosis?',
    answerAr: 'لا، بشكل قاطع. المنظومة أداة إرشادية وفرز سريري للمساعدة الطبية وليست بديلاً عن الاستشارة الطبية المباشرة أو التدخل الإسعافي. في حالات الطوارئ يجب الاتصال بالإسعاف (123) فوراً.',
    answerEn: 'Strictly no. The platform provides clinical decision support and triage assistance, never replacing direct physician evaluation or emergency care. For acute emergencies, contact ambulance services (123) immediately.'
  },
  {
    id: 'faq_priv_01',
    category: 'privacy_security',
    categoryNameAr: 'الخصوصية وأمان البيانات',
    categoryNameEn: 'Privacy & Data Security',
    questionAr: 'كيف تتم حماية بياناتي الصحية والشخصية؟',
    questionEn: 'How are my health and personal data protected?',
    answerAr: 'تخضع جميع البيانات لمعايير HIPAA Safe Harbor وGDPR؛ حيث تُشفر البيانات أثناء النقل والراحة (AES-256)، ويُفصل سجل القياسات الطبية عن المعرفات المباشرة، مع حظر مشاركة أي بيانات مع أطراف ثالثة.',
    answerEn: 'All data adheres to HIPAA Safe Harbor and GDPR standards. Data is encrypted in transit and at rest (AES-256), clinical observations are decoupled from direct identifiers, and sharing with third parties is strictly prohibited.'
  },
  {
    id: 'faq_priv_02',
    category: 'privacy_security',
    categoryNameAr: 'الخصوصية وأمان البيانات',
    categoryNameEn: 'Privacy & Data Security',
    questionAr: 'من يمتلك حق الوصول إلى ملفي ونتائج الفحص؟',
    questionEn: 'Who has access to my profile and test results?',
    answerAr: 'أنت وطبيبك المعالج المرتبط بالحالة فقط هما من يمكنهما الاطلاع على تفاصيل الفحص الطبي. الطاقم الإداري يمتلك وصولاً تشغيلياً مقيداً دون إمكانية فك تشفير المحتوى السريري الحساس.',
    answerEn: 'Only you and your assigned treating physician have access to your detailed clinical report. Operational staff have restricted administrative access with sensitive medical content masked.'
  },
  {
    id: 'faq_appt_01',
    category: 'appointments_reviews',
    categoryNameAr: 'المواعيد والمراجعة الطبية',
    categoryNameEn: 'Appointments & Doctor Reviews',
    questionAr: 'كم يستغرق الطبيب لمراجعة واعتماد تقرير الفحص؟',
    questionEn: 'How long does a doctor take to review and approve an assessment report?',
    answerAr: 'تُراجع الحالات ذات الأولوية العاجلة خلال 15-30 دقيقة على مدار الساعة، بينما تستغرق الحالات الروتينية ما بين ساعتين إلى 24 ساعة كحد أقصى.',
    answerEn: 'High-priority urgent cases are reviewed within 15-30 minutes round-the-clock, while routine assessments are reviewed within 2 to 24 hours.'
  },
  {
    id: 'faq_rec_01',
    category: 'account_recovery',
    categoryNameAr: 'استعادة الحساب والدخول',
    categoryNameEn: 'Account Recovery & Access',
    questionAr: 'كيف أستعيد حسابي في حال فقدان كلمة المرور أو الهاتف المسجل؟',
    questionEn: 'How do I recover my account if I lose my password or registered phone?',
    answerAr: 'يمكنك استخدام خيار "نسيت كلمة المرور" لاستلام رابط استعادة عبر البريد، أو تقديم طلب "استعادة الحساب" في مركز المساعدة ليتم التحقق من هويتك بواسطة مكتب أمان الحسابات وتفعيل الدخول.',
    answerEn: 'You can use the "Forgot Password" link on the sign-in screen, or submit an "Account Recovery" ticket in the Help Center for identity verification and access recovery by our security team.'
  },
  {
    id: 'faq_safe_01',
    category: 'clinical_safety',
    categoryNameAr: 'السلامة السريرية وتصحيح المعلومات',
    categoryNameEn: 'Clinical Safety & Inaccuracy Reporting',
    questionAr: 'ماذا أفعل إذا لاحظت معلومة غير دقيقة في تقريري أو التقييم السريري؟',
    questionEn: 'What should I do if I notice inaccurate information in my report or assessment?',
    answerAr: 'يمكنك فوراً تقديم بلاغ "معلومات غير دقيقة" من قسم الملاحظات؛ ويُصنف البلاغ كأولوية قصوى ويُصعد مباشرة إلى ضابط السلامة السريرية (Clinical Safety Officer) لمراجعته سريرياً وإجراء التصحيح المعتمد.',
    answerEn: 'Submit an "Inaccurate Information" report through the Feedback section. It is automatically classified as High Priority and escalated directly to the Clinical Safety Officer for clinical review and correction.'
  }
];

class FeedbackSupportService {
  constructor(firestoreDb = null) {
    this.db = firestoreDb;
    this.tickets = new Map();
    this.auditLogs = [];
  }

  setDb(firestoreDb) {
    this.db = firestoreDb;
  }

  /**
   * Resets in-memory storage (useful for clean unit tests).
   */
  resetState() {
    this.tickets.clear();
    this.auditLogs = [];
  }

  /**
   * Generates a unique secure ticket ID.
   */
  generateTicketId(type = 'tkt') {
    const prefix = type.slice(0, 3);
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(3).toString('hex');
    return `${prefix}_${ts}_${rand}`;
  }

  /**
   * Determines ticket priority based on type and input parameters.
   */
  determinePriority(type, requestedPriority, hasSensitiveMedicalContent) {
    if (requestedPriority && Object.values(TICKET_PRIORITIES).includes(requestedPriority)) {
      return requestedPriority;
    }
    if (type === TICKET_TYPES.INACCURATE_INFORMATION) {
      return TICKET_PRIORITIES.HIGH;
    }
    if (type === TICKET_TYPES.ACCOUNT_RECOVERY) {
      return TICKET_PRIORITIES.HIGH;
    }
    if (hasSensitiveMedicalContent) {
      return TICKET_PRIORITIES.HIGH;
    }
    if (type === TICKET_TYPES.BUG_REPORT) {
      return TICKET_PRIORITIES.MEDIUM;
    }
    if (type === TICKET_TYPES.CONTACT_FORM) {
      return TICKET_PRIORITIES.MEDIUM;
    }
    return TICKET_PRIORITIES.LOW;
  }

  /**
   * Creates and persists a new ticket.
   */
  async createTicket({
    type = TICKET_TYPES.EXPERIENCE_RATING,
    category = 'general',
    subject = '',
    comment = '',
    description = '',
    rating = null,
    priority = null,
    user = {},
    caseId = null,
    appointmentId = null,
    clinicId = null,
    hasSensitiveMedicalContent = false,
    medicalDetails = null,
    metadata = {}
  }) {
    const textContent = (comment || description || subject || '').trim();
    if (textContent.length < 2) {
      const err = new Error('Ticket content must be at least 2 characters long.');
      err.code = 'INVALID_CONTENT';
      throw err;
    }
    if (textContent.length > 5000) {
      const err = new Error('Ticket content cannot exceed 5000 characters.');
      err.code = 'CONTENT_TOO_LONG';
      throw err;
    }

    if (rating !== null && rating !== undefined) {
      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        const err = new Error('Rating must be an integer between 1 and 5 stars.');
        err.code = 'INVALID_RATING';
        throw err;
      }
    }

    const validTypes = Object.values(TICKET_TYPES);
    const sanitizedType = validTypes.includes(type) ? type : TICKET_TYPES.EXPERIENCE_RATING;

    // Automatic sensitive medical content detection
    const isMedicalInaccuracy = sanitizedType === TICKET_TYPES.INACCURATE_INFORMATION;
    const finalSensitiveFlag = Boolean(hasSensitiveMedicalContent || isMedicalInaccuracy || medicalDetails);

    const calculatedPriority = this.determinePriority(sanitizedType, priority, finalSensitiveFlag);
    const defaultOwner = DEFAULT_OWNERS[sanitizedType] || DEFAULT_OWNERS[TICKET_TYPES.CONTACT_FORM];

    const ticketId = this.generateTicketId(sanitizedType);
    const nowIso = new Date().toISOString();

    const ticket = {
      ticketId,
      id: ticketId,
      type: sanitizedType,
      category: String(category || 'general').trim(),
      subject: subject ? String(subject).trim() : (sanitizedType === TICKET_TYPES.EXPERIENCE_RATING ? `Rating (${rating || 5}★)` : `${sanitizedType.replace(/_/g, ' ')}`),
      comment: textContent,
      description: textContent,
      rating: rating ? Math.round(Number(rating)) : null,
      priority: calculatedPriority,
      status: TICKET_STATUSES.OPEN,
      owner: defaultOwner ? { ...defaultOwner } : null,
      assignedTo: defaultOwner?.uid || null,
      escalated: false,
      escalationInfo: null,
      hasSensitiveMedicalContent: finalSensitiveFlag,
      medicalDetails: finalSensitiveFlag ? (medicalDetails || { text: textContent, reportedIssue: subject }) : null,
      userId: user.uid || 'guest_user',
      userName: user.name || user.displayName || (user.role === 'doctor' ? 'طبيب ممارس' : 'مستخدم'),
      userEmail: user.email || null,
      userRole: user.role || 'patient',
      clinicId: clinicId || user.clinicId || null,
      caseId: caseId || null,
      appointmentId: appointmentId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      metadata: metadata || {},
      responses: [],
      history: [
        {
          action: 'CREATED',
          performedBy: user.uid || 'guest_user',
          role: user.role || 'guest',
          timestamp: nowIso,
          details: `Ticket created with type '${sanitizedType}' and priority '${calculatedPriority}'.`
        }
      ]
    };

    // Save to memory
    this.tickets.set(ticketId, ticket);

    // Save to Firestore if available
    if (this.db && typeof this.db.collection === 'function') {
      try {
        await this.db.collection('feedbacks').doc(ticketId).set(ticket);
        await this.db.collection('support_tickets').doc(ticketId).set(ticket);
      } catch (err) {
        console.warn('[FEEDBACK SERVICE] Firestore persistence fallback:', err.message);
      }
    }

    return ticket;
  }

  /**
   * Checks whether a requester is authorized to view a specific ticket.
   * STRICT RULE: Submitters can access ONLY their own tickets.
   */
  canUserAccessTicket(user = {}, ticket = {}) {
    if (!ticket || !ticket.ticketId) return false;
    const uid = user.uid || '';
    const role = (user.role || '').toLowerCase();
    const isOwner = user.isOwner === true || role === 'super_admin';

    // 1. Super Admin or Owner can access all tickets
    if (isOwner) return true;

    // 2. The submitter can ALWAYS access their own ticket
    if (uid && ticket.userId === uid) return true;

    // 3. Assigned owner can access
    if (uid && (ticket.assignedTo === uid || ticket.owner?.uid === uid)) return true;

    // 4. Authorized support role can access
    if (role === 'support') {
      // Clinic isolation if applicable
      if (user.clinicId && ticket.clinicId && user.clinicId !== ticket.clinicId) {
        return false;
      }
      return true;
    }

    // 5. Authorized clinic admin can access clinic-scoped tickets
    if (role === 'clinic_admin') {
      if (!user.clinicId || !ticket.clinicId) return false;
      return user.clinicId === ticket.clinicId;
    }

    // 6. Doctor role can access if assigned, or if it is a clinical inaccuracy / case report related to them
    if (role === 'doctor') {
      if (ticket.type === TICKET_TYPES.INACCURATE_INFORMATION && (!ticket.clinicId || ticket.clinicId === user.clinicId)) {
        return true;
      }
      if (ticket.caseId && [ticket.assignedDoctorId, ticket.doctorId, ticket.doctorUid].includes(uid)) {
        return true;
      }
      return false;
    }

    // Otherwise strictly rejected
    return false;
  }

  /**
   * Checks whether a user has clinical credentials to view sensitive medical content.
   */
  hasClinicalAccess(user = {}) {
    const role = (user.role || '').toLowerCase();
    const isOwner = user.isOwner === true || role === 'super_admin';
    return isOwner || role === 'doctor' || role === 'doctor_verified' || role === 'clinical_safety_officer';
  }

  /**
   * Applies sensitive medical content redaction.
   * If a ticket has sensitive medical content, non-clinical viewers (e.g. general support)
   * receive a redacted version of medicalDetails.
   */
  redactTicketForUser(ticket, user = {}) {
    if (!ticket) return null;
    const cloned = JSON.parse(JSON.stringify(ticket));

    // If submitter is viewing their own ticket, they see their own content
    if (user.uid && user.uid === ticket.userId) {
      return cloned;
    }

    // If viewer has clinical access or super admin, they see full unredacted content
    if (this.hasClinicalAccess(user)) {
      cloned.medicalAccessRestricted = false;
      return cloned;
    }

    // Non-clinical viewer: mask sensitive medical fields
    if (ticket.hasSensitiveMedicalContent) {
      cloned.medicalAccessRestricted = true;
      cloned.medicalDetails = {
        restricted: true,
        notice: '[RESTRICTED SENSITIVE MEDICAL CONTENT - CLINICAL SAFETY CREDENTIALS REQUIRED]',
        noticeAr: '[محتوى طبي حساس مقيد - يتطلب اعتماد ضابط السلامة السريرية]'
      };
      if (ticket.type === TICKET_TYPES.INACCURATE_INFORMATION) {
        cloned.comment = '[RESTRICTED CLINICAL INACCURACY REPORT - Medical content hidden from non-clinical staff]';
        cloned.description = '[RESTRICTED CLINICAL INACCURACY REPORT - Medical content hidden from non-clinical staff]';
      }
    }

    return cloned;
  }

  /**
   * Retrieves a single ticket by ID with strict access control and sensitive content redaction.
   */
  async getTicketById(ticketId, user = {}) {
    let ticket = this.tickets.get(ticketId);

    // If not found in memory, try Firestore
    if (!ticket && this.db && typeof this.db.collection === 'function') {
      try {
        const snap = await this.db.collection('support_tickets').doc(ticketId).get();
        if (snap.exists) {
          ticket = snap.data();
          this.tickets.set(ticketId, ticket);
        } else {
          const fbSnap = await this.db.collection('feedbacks').doc(ticketId).get();
          if (fbSnap.exists) {
            ticket = fbSnap.data();
            this.tickets.set(ticketId, ticket);
          }
        }
      } catch (err) {
        console.warn('[FEEDBACK SERVICE] Firestore get error:', err.message);
      }
    }

    if (!ticket) {
      const err = new Error(`Ticket '${ticketId}' not found.`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (!this.canUserAccessTicket(user, ticket)) {
      const err = new Error(`Access denied. You do not have permission to view ticket '${ticketId}'.`);
      err.code = 'ACCESS_DENIED';
      throw err;
    }

    return this.redactTicketForUser(ticket, user);
  }

  /**
   * Lists tickets visible to the caller based on role and filters.
   * Submitters see ONLY their own tickets.
   */
  async listTickets(user = {}, filters = {}) {
    const uid = user.uid || '';
    const role = (user.role || 'patient').toLowerCase();
    const isOwner = user.isOwner === true || role === 'super_admin';
    const isSupportOrAdmin = isOwner || ['support', 'clinic_admin'].includes(role);

    // Collect all in-memory tickets
    const allTickets = Array.from(this.tickets.values());

    // Merge with Firestore if available
    if (this.db && typeof this.db.collection === 'function') {
      try {
        let query = this.db.collection('support_tickets');
        if (!isSupportOrAdmin && role !== 'doctor') {
          query = query.where('userId', '==', uid);
        }
        const snap = await query.limit(100).get();
        snap.forEach(doc => {
          const d = doc.data();
          if (d && d.ticketId && !this.tickets.has(d.ticketId)) {
            this.tickets.set(d.ticketId, d);
            allTickets.push(d);
          }
        });
      } catch (e) {
        // Fallback to in-memory
      }
    }

    // Filter tickets
    const accessible = allTickets.filter(t => {
      // 1. Ownership & Role filter
      if (!this.canUserAccessTicket(user, t)) {
        return false;
      }

      // 2. Type filter
      if (filters.type && filters.type !== 'all' && t.type !== filters.type) {
        return false;
      }

      // 3. Status filter
      if (filters.status && filters.status !== 'all' && t.status !== filters.status) {
        return false;
      }

      // 4. Priority filter
      if (filters.priority && filters.priority !== 'all' && t.priority !== filters.priority) {
        return false;
      }

      // 5. Clinic filter
      if (filters.clinicId && t.clinicId && t.clinicId !== filters.clinicId) {
        return false;
      }

      return true;
    });

    // Redact each ticket appropriately
    const result = accessible
      .map(t => this.redactTicketForUser(t, user))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return result;
  }

  /**
   * Escalates an open ticket to high priority and clinical/senior escalation queue.
   */
  async escalateTicket(ticketId, actor = {}, reason = '') {
    const rawTicket = this.tickets.get(ticketId);
    if (!rawTicket) {
      const err = new Error(`Ticket '${ticketId}' not found.`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (!this.canUserAccessTicket(actor, rawTicket)) {
      const err = new Error('Access denied to escalate this ticket.');
      err.code = 'ACCESS_DENIED';
      throw err;
    }

    const nowIso = new Date().toISOString();
    const escalationTarget = rawTicket.hasSensitiveMedicalContent || rawTicket.type === TICKET_TYPES.INACCURATE_INFORMATION
      ? DEFAULT_OWNERS[TICKET_TYPES.INACCURATE_INFORMATION]
      : { uid: 'senior_admin_desk', name: 'Senior Operations Escalation Desk', role: 'super_admin' };

    rawTicket.status = TICKET_STATUSES.ESCALATED;
    rawTicket.priority = TICKET_PRIORITIES.CRITICAL;
    rawTicket.owner = { ...escalationTarget };
    rawTicket.assignedTo = escalationTarget.uid;
    rawTicket.escalated = true;
    rawTicket.updatedAt = nowIso;
    rawTicket.escalationInfo = {
      escalatedAt: nowIso,
      escalatedBy: actor.uid || 'authorized_user',
      escalatorRole: actor.role || 'user',
      escalationReason: reason || 'Urgent escalation requested due to severity or clinical concern.',
      targetQueue: escalationTarget.name
    };

    rawTicket.history.push({
      action: 'ESCALATED',
      performedBy: actor.uid || 'authorized_user',
      role: actor.role || 'user',
      timestamp: nowIso,
      details: `Ticket escalated to CRITICAL priority. Target: ${escalationTarget.name}. Reason: ${reason || 'Not specified'}`
    });

    // Update DB
    if (this.db && typeof this.db.collection === 'function') {
      try {
        await this.db.collection('support_tickets').doc(ticketId).set(rawTicket, { merge: true });
        await this.db.collection('feedbacks').doc(ticketId).set(rawTicket, { merge: true });
      } catch (e) {
        // Fallback
      }
    }

    return this.redactTicketForUser(rawTicket, actor);
  }

  /**
   * Updates ticket status, priority, or assigned owner (Admin / Support / Clinician action).
   */
  async updateTicket(ticketId, updates = {}, actor = {}) {
    const rawTicket = this.tickets.get(ticketId);
    if (!rawTicket) {
      const err = new Error(`Ticket '${ticketId}' not found.`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    const actorRole = (actor.role || '').toLowerCase();
    const isOwnerOrAdmin = actor.isOwner === true || ['super_admin', 'clinic_admin', 'support'].includes(actorRole);
    const isAssignedDoctor = actorRole === 'doctor' && (rawTicket.assignedTo === actor.uid || rawTicket.type === TICKET_TYPES.INACCURATE_INFORMATION);

    if (!isOwnerOrAdmin && !isAssignedDoctor) {
      const err = new Error('Administrative, support, or assigned clinical privilege required to update tickets.');
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    const nowIso = new Date().toISOString();

    if (updates.status && Object.values(TICKET_STATUSES).includes(updates.status)) {
      rawTicket.status = updates.status;
      rawTicket.history.push({
        action: 'STATUS_CHANGED',
        performedBy: actor.uid,
        role: actor.role,
        timestamp: nowIso,
        details: `Status updated to '${updates.status}'.`
      });
    }

    if (updates.priority && Object.values(TICKET_PRIORITIES).includes(updates.priority)) {
      rawTicket.priority = updates.priority;
      rawTicket.history.push({
        action: 'PRIORITY_CHANGED',
        performedBy: actor.uid,
        role: actor.role,
        timestamp: nowIso,
        details: `Priority updated to '${updates.priority}'.`
      });
    }

    if (updates.owner) {
      rawTicket.owner = {
        uid: updates.owner.uid || 'assigned_staff',
        name: updates.owner.name || 'Support Staff',
        role: updates.owner.role || 'support'
      };
      rawTicket.assignedTo = rawTicket.owner.uid;
      rawTicket.history.push({
        action: 'OWNER_ASSIGNED',
        performedBy: actor.uid,
        role: actor.role,
        timestamp: nowIso,
        details: `Ticket assigned to '${rawTicket.owner.name}'.`
      });
    }

    rawTicket.updatedAt = nowIso;

    if (this.db && typeof this.db.collection === 'function') {
      try {
        await this.db.collection('support_tickets').doc(ticketId).set(rawTicket, { merge: true });
        await this.db.collection('feedbacks').doc(ticketId).set(rawTicket, { merge: true });
      } catch (e) {
        // Fallback
      }
    }

    return this.redactTicketForUser(rawTicket, actor);
  }

  /**
   * Adds a reply response to a ticket.
   */
  async addResponse(ticketId, { message, isClinical = false }, actor = {}) {
    const rawTicket = this.tickets.get(ticketId);
    if (!rawTicket) {
      const err = new Error(`Ticket '${ticketId}' not found.`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (!this.canUserAccessTicket(actor, rawTicket)) {
      const err = new Error('Access denied.');
      err.code = 'ACCESS_DENIED';
      throw err;
    }

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      const err = new Error('Response message must be at least 2 characters long.');
      err.code = 'INVALID_MESSAGE';
      throw err;
    }

    const nowIso = new Date().toISOString();
    const responseItem = {
      id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: actor.uid || 'anonymous',
      senderName: actor.name || actor.displayName || (actor.role === 'doctor' ? 'طبيب ممارس' : 'دعم العملاء'),
      senderRole: actor.role || 'user',
      message: message.trim(),
      isClinical: Boolean(isClinical && this.hasClinicalAccess(actor)),
      createdAt: nowIso
    };

    rawTicket.responses.push(responseItem);
    rawTicket.updatedAt = nowIso;

    rawTicket.history.push({
      action: 'RESPONSE_ADDED',
      performedBy: actor.uid,
      role: actor.role,
      timestamp: nowIso,
      details: `New response added by ${responseItem.senderName}.`
    });

    if (this.db && typeof this.db.collection === 'function') {
      try {
        await this.db.collection('support_tickets').doc(ticketId).set(rawTicket, { merge: true });
      } catch (e) {
        // Fallback
      }
    }

    return responseItem;
  }

  /**
   * Processes an Account Recovery request.
   */
  async createAccountRecoveryRequest({
    identifier,
    issueType = 'lost_mfa',
    contactEmail,
    contactPhone,
    explanation
  }) {
    if (!identifier || String(identifier).trim().length < 3) {
      const err = new Error('Valid account identifier (email or phone) is required for recovery.');
      err.code = 'INVALID_IDENTIFIER';
      throw err;
    }

    const ticket = await this.createTicket({
      type: TICKET_TYPES.ACCOUNT_RECOVERY,
      category: 'account_security',
      subject: `Account Recovery Request: ${identifier} (${issueType})`,
      description: explanation || `Account recovery requested for ${identifier}. Issue type: ${issueType}. Contact: ${contactEmail || contactPhone || identifier}`,
      priority: TICKET_PRIORITIES.HIGH,
      user: {
        uid: `recovery_${Date.now()}`,
        name: 'Account Recovery Submitter',
        email: contactEmail || (identifier.includes('@') ? identifier : null),
        role: 'patient'
      },
      metadata: {
        identifier,
        issueType,
        contactEmail,
        contactPhone,
        recoveryRequestedAt: new Date().toISOString()
      }
    });

    return {
      success: true,
      ticketId: ticket.ticketId,
      referenceCode: `REC-${ticket.ticketId.slice(-6).toUpperCase()}`,
      status: ticket.status,
      message: 'Account recovery ticket created successfully. Our security desk will review and verify your identity.',
      messageAr: 'تم تسجيل طلب استعادة الحساب بنجاح، وسيقوم مكتب الأمان بمراجعة البيانات والتحقق من الهوية.'
    };
  }

  /**
   * Processes a public or authenticated Contact Us submission.
   */
  async createContactSubmission({
    name,
    email,
    subject,
    category = 'general',
    message,
    user = {}
  }) {
    if (!name || name.trim().length < 2) {
      const err = new Error('Name must be at least 2 characters long.');
      err.code = 'INVALID_NAME';
      throw err;
    }
    if (!email || !email.includes('@')) {
      const err = new Error('A valid email address is required.');
      err.code = 'INVALID_EMAIL';
      throw err;
    }
    if (!message || message.trim().length < 5) {
      const err = new Error('Message must be at least 5 characters long.');
      err.code = 'INVALID_MESSAGE';
      throw err;
    }

    const ticket = await this.createTicket({
      type: TICKET_TYPES.CONTACT_FORM,
      category: category || 'contact_inquiry',
      subject: subject || 'Contact Us Inquiry',
      description: message.trim(),
      priority: TICKET_PRIORITIES.MEDIUM,
      user: {
        uid: user.uid || `contact_${Date.now()}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: user.role || 'guest'
      },
      metadata: {
        clientSource: 'contact_form',
        submittedAt: new Date().toISOString()
      }
    });

    return {
      success: true,
      ticketId: ticket.ticketId,
      status: ticket.status,
      message: 'Your inquiry has been received. Our team will contact you shortly.',
      messageAr: 'تم استلام استفسارك بنجاح، وسيتواصل معك فريق الدعم في أقرب وقت.'
    };
  }

  /**
   * Returns FAQ items filtered by category or search query.
   */
  getFaqs({ category = 'all', search = '' } = {}) {
    let list = [...FAQ_DATABASE];
    if (category && category !== 'all') {
      list = list.filter(item => item.category === category);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(item =>
        item.questionAr.toLowerCase().includes(q) ||
        item.questionEn.toLowerCase().includes(q) ||
        item.answerAr.toLowerCase().includes(q) ||
        item.answerEn.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return list;
  }
}

const feedbackSupportService = new FeedbackSupportService();

module.exports = feedbackSupportService;
module.exports.FeedbackSupportService = FeedbackSupportService;
module.exports.TICKET_TYPES = TICKET_TYPES;
module.exports.TICKET_PRIORITIES = TICKET_PRIORITIES;
module.exports.TICKET_STATUSES = TICKET_STATUSES;
module.exports.FAQ_DATABASE = FAQ_DATABASE;
