/**
 * Health Vibe AI - Requested Lab Result Doctor Alerts (Practo benchmark)
 * Tasks #652 (Backend), #653 (Safety & Privacy), #655 (Analytics)
 *
 * When a doctor requests investigations in an assessment and the patient later
 * uploads one of them, ONLY the requesting doctor is alerted.
 * Safety & privacy rules:
 *  - Notification payloads carry NO result values, diagnosis or file names —
 *    only "a requested result is ready for your review" + a deep link.
 *  - The platform never interprets the result in the alert; the doctor reviews it.
 *  - Patients can only fulfil their own requests; only the requesting doctor
 *    (or an admin) can view/acknowledge them.
 *  - Unreviewed results are re-surfaced to the doctor after 48h (no silent loss).
 */

'use strict';

const kit = require('./feature-kit');

const REVIEW_ESCALATION_HOURS = 48;

const LAB_TESTS = {
  cbc: { ar: 'صورة دم كاملة (CBC)', en: 'Complete Blood Count (CBC)' },
  sputum_culture: { ar: 'مزرعة بلغم', en: 'Sputum Culture' },
  abg: { ar: 'غازات الدم الشرياني (ABG)', en: 'Arterial Blood Gases (ABG)' },
  chest_xray: { ar: 'أشعة صدر', en: 'Chest X-ray' },
  spirometry: { ar: 'قياس وظائف التنفس', en: 'Spirometry' },
  crp: { ar: 'سرعة الترسيب / CRP', en: 'CRP' }
};

const REQUEST_STATUS = { PENDING: 'pending', PARTIAL: 'partial', FULFILLED: 'fulfilled' };
const ITEM_STATUS = { AWAITING: 'awaiting_upload', UPLOADED: 'uploaded', REVIEWED: 'reviewed' };

class LabResultAlertService {
  constructor({ now = () => Date.now(), notifier = null } = {}) {
    this.now = now;
    this.notifier = notifier; // optional (doctorId, payload) => void
    this.audit = kit.createAuditTrail('lab_result_alerts');
    this.analytics = kit.createAnalytics('lab_result_alerts');
    this.resetState();
  }

  resetState() {
    this.requests = new Map();
    this.notifications = [];
    this.audit.reset();
    this.analytics.reset();
  }

  createLabRequest({ patientId, assessmentId, tests, note }, user) {
    kit.requireUser(user);
    if (!kit.isDoctor(user)) throw new kit.FeatureError('FORBIDDEN', 'Only doctors can request investigations.', 403);
    if (!patientId || !assessmentId) throw new kit.FeatureError('INVALID_REQUEST', 'patientId and assessmentId are required.');
    const unique = [...new Set(Array.isArray(tests) ? tests : [])];
    if (unique.length === 0 || unique.some(t => !LAB_TESTS[t])) {
      throw new kit.FeatureError('INVALID_TESTS', `Tests must be from: ${Object.keys(LAB_TESTS).join(', ')}.`);
    }
    const request = {
      id: kit.newId('labreq'),
      patientId,
      assessmentId,
      doctorId: user.uid,
      doctorName: user.displayName || 'Doctor',
      note: kit.sanitizeText(note || '', 300),
      status: REQUEST_STATUS.PENDING,
      createdAt: new Date(this.now()).toISOString(),
      items: unique.map(code => ({ code, status: ITEM_STATUS.AWAITING, uploadId: null, uploadedAt: null, reviewedAt: null }))
    };
    this.requests.set(request.id, request);
    this.analytics.track('lab_request_created', { tests: unique.length });
    this.audit.record('LAB_REQUEST_CREATED', user, { requestId: request.id, patientId });
    return this._clone(request);
  }

  /** Patient checklist: what the doctor asked for and what is still missing. */
  getPatientRequests(patientId, user) {
    kit.requireSelfOrAdmin(user, patientId);
    return [...this.requests.values()].filter(r => r.patientId === patientId).map(r => this._clone(r));
  }

  /** Called after a patient upload passes the existing lab-upload security scan. */
  attachUploadToRequest(requestId, testCode, uploadId, user) {
    const request = this._getRequest(requestId);
    kit.requireUser(user);
    if (user.uid !== request.patientId) {
      throw new kit.FeatureError('FORBIDDEN', 'Patients can only upload results for their own requests.', 403);
    }
    const item = request.items.find(i => i.code === testCode);
    if (!item) throw new kit.FeatureError('TEST_NOT_REQUESTED', 'This test was not requested by your doctor.', 400);
    if (!uploadId) throw new kit.FeatureError('UPLOAD_REQUIRED', 'uploadId is required.');

    const isReplacement = item.status !== ITEM_STATUS.AWAITING;
    item.status = ITEM_STATUS.UPLOADED;
    item.uploadId = uploadId;
    item.uploadedAt = new Date(this.now()).toISOString();
    item.reviewedAt = null;
    this._refreshStatus(request);

    const notification = this._notifyDoctor(request, item, isReplacement);
    this.analytics.track('lab_result_uploaded', {
      hoursToUpload: (this.now() - new Date(request.createdAt).getTime()) / 3600000,
      replacement: isReplacement
    });
    this.audit.record('LAB_RESULT_ATTACHED', user, { requestId, testCode });
    return { request: this._clone(request), notification };
  }

  getDoctorInbox(doctorId, user) {
    kit.requireUser(user);
    if (user.uid !== doctorId && !kit.isAdmin(user)) {
      throw new kit.FeatureError('FORBIDDEN', 'Doctors can only view their own result inbox.', 403);
    }
    return this.notifications.filter(n => n.doctorId === doctorId);
  }

  acknowledgeResult(requestId, testCode, user) {
    const request = this._getRequest(requestId);
    kit.requireUser(user);
    if (user.uid !== request.doctorId && !kit.isAdmin(user)) {
      throw new kit.FeatureError('FORBIDDEN', 'Only the requesting doctor can review this result.', 403);
    }
    const item = request.items.find(i => i.code === testCode);
    if (!item || item.status !== ITEM_STATUS.UPLOADED) {
      throw new kit.FeatureError('NOTHING_TO_REVIEW', 'No uploaded result awaiting review.', 409);
    }
    item.status = ITEM_STATUS.REVIEWED;
    item.reviewedAt = new Date(this.now()).toISOString();
    this.notifications.filter(n => n.requestId === requestId && n.testCode === testCode).forEach(n => { n.read = true; });
    this.analytics.track('lab_result_reviewed', { hoursToReview: (this.now() - new Date(item.uploadedAt).getTime()) / 3600000 });
    this.audit.record('LAB_RESULT_REVIEWED', user, { requestId, testCode });
    return this._clone(request);
  }

  /** Scheduler hook: re-alerts the doctor for results unreviewed after 48h. */
  escalateOverdueReviews() {
    const escalated = [];
    for (const request of this.requests.values()) {
      for (const item of request.items) {
        if (item.status !== ITEM_STATUS.UPLOADED || item.escalated) continue;
        if (this.now() - new Date(item.uploadedAt).getTime() >= REVIEW_ESCALATION_HOURS * 3600000) {
          item.escalated = true;
          escalated.push(this._notifyDoctor(request, item, false, true));
          this.analytics.track('lab_review_escalated');
        }
      }
    }
    return escalated;
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const a = this.analytics;
    const avg = (name, prop) => {
      const ev = a.events(name);
      return ev.length ? Math.round(ev.reduce((s, e) => s + e.props[prop], 0) / ev.length * 10) / 10 : 0;
    };
    const allItems = [...this.requests.values()].flatMap(r => r.items);
    return {
      requestsCreated: a.count('lab_request_created'),
      resultsUploaded: a.count('lab_result_uploaded'),
      resultsReviewed: a.count('lab_result_reviewed'),
      doctorAlertsSent: a.count('lab_doctor_alert_sent'),
      overdueEscalations: a.count('lab_review_escalated'),
      fulfilmentRatePct: allItems.length ? Math.round(allItems.filter(i => i.status !== ITEM_STATUS.AWAITING).length / allItems.length * 1000) / 10 : 0,
      reviewRatePct: a.rate('lab_result_reviewed', 'lab_result_uploaded'),
      avgHoursToUpload: avg('lab_result_uploaded', 'hoursToUpload'),
      avgHoursToReview: avg('lab_result_reviewed', 'hoursToReview')
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _notifyDoctor(request, item, isReplacement, isEscalation = false) {
    // Minimal-PHI payload: no values, no file name, no diagnosis.
    const notification = {
      id: kit.newId('labnotif'),
      doctorId: request.doctorId,
      requestId: request.id,
      testCode: item.code,
      kind: isEscalation ? 'review_overdue' : (isReplacement ? 'result_replaced' : 'result_uploaded'),
      titleAr: isEscalation ? 'نتيجة فحص بانتظار مراجعتك منذ ٤٨ ساعة' : 'تم رفع نتيجة فحص طلبتها',
      titleEn: isEscalation ? 'A requested result has awaited your review for 48h' : 'A result you requested has been uploaded',
      bodyAr: `${LAB_TESTS[item.code].ar} — افتح التطبيق للمراجعة.`,
      bodyEn: `${LAB_TESTS[item.code].en} — open the app to review.`,
      deepLink: `/doctor/lab-requests/${request.id}`,
      read: false,
      at: new Date(this.now()).toISOString()
    };
    this.notifications.push(notification);
    if (typeof this.notifier === 'function') this.notifier(request.doctorId, notification);
    this.analytics.track('lab_doctor_alert_sent', { kind: notification.kind });
    return notification;
  }

  _refreshStatus(request) {
    const uploaded = request.items.filter(i => i.status !== ITEM_STATUS.AWAITING).length;
    request.status = uploaded === 0 ? REQUEST_STATUS.PENDING
      : uploaded === request.items.length ? REQUEST_STATUS.FULFILLED : REQUEST_STATUS.PARTIAL;
  }

  _getRequest(id) {
    const r = this.requests.get(id);
    if (!r) throw new kit.FeatureError('REQUEST_NOT_FOUND', 'Lab request not found.', 404);
    return r;
  }

  _clone(r) {
    return JSON.parse(JSON.stringify(r));
  }
}

const labResultAlertService = new LabResultAlertService();

module.exports = {
  LabResultAlertService,
  labResultAlertService,
  LAB_TESTS,
  REQUEST_STATUS,
  ITEM_STATUS,
  REVIEW_ESCALATION_HOURS
};
