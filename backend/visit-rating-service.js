/**
 * Health Vibe AI - Post-Visit Clinic Rating Service (Vezeeta benchmark)
 * Tasks #647 (Backend), #648 (Safety & Privacy), #650 (Analytics)
 *
 * Collects a patient's rating of the clinic & doctor after a COMPLETED visit.
 * Safety & privacy rules:
 *  - Only the patient of a completed appointment can rate it, once, within 14 days.
 *  - Comments are sanitised and stripped of phone numbers / emails / national IDs.
 *  - Ratings are published anonymously; a doctor only sees aggregates once at
 *    least MIN_RATINGS_FOR_DISPLAY ratings exist (prevents re-identification).
 *  - Doctors cannot edit, delete or reply-pressure ratings.
 *  - Comments that mention a possible clinical harm are routed to clinical
 *    governance review, NOT treated as a star score only.
 */

'use strict';

const kit = require('./feature-kit');

const RATING_WINDOW_DAYS = 14;
const MIN_RATINGS_FOR_DISPLAY = 3;
const REMINDER_DELAY_HOURS = 2;

const CRITERIA = ['overall', 'doctor', 'waitingTime', 'cleanliness', 'staff'];

/** Keywords (AR + EN) suggesting possible clinical harm -> governance review. */
const SAFETY_KEYWORDS = [
  'wrong medication', 'wrong dose', 'misdiagnos', 'got worse', 'allergic reaction', 'harm', 'negligence',
  'دواء غلط', 'جرعة غلط', 'تشخيص خاطئ', 'حالتي ساءت', 'حساسية', 'إهمال', 'اهمال'
];

class VisitRatingService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.audit = kit.createAuditTrail('visit_ratings');
    this.analytics = kit.createAnalytics('visit_ratings');
    this.resetState();
  }

  resetState() {
    this.visits = new Map();   // appointmentId -> completed visit
    this.ratings = new Map();  // appointmentId -> rating
    this.governanceQueue = [];
    this.audit.reset();
    this.analytics.reset();
  }

  /** Called by the appointments flow when a doctor marks a visit as completed. */
  registerCompletedVisit({ appointmentId, patientId, doctorId, clinicId = 'clinic_cairo_main', completedAt }) {
    if (!appointmentId || !patientId || !doctorId) {
      throw new kit.FeatureError('INVALID_VISIT', 'appointmentId, patientId and doctorId are required.');
    }
    const visit = {
      appointmentId, patientId, doctorId, clinicId,
      completedAt: new Date(completedAt || this.now()).toISOString(),
      reminderDueAt: new Date(new Date(completedAt || this.now()).getTime() + REMINDER_DELAY_HOURS * 3600000).toISOString()
    };
    this.visits.set(appointmentId, visit);
    this.analytics.track('rating_prompt_eligible');
    return visit;
  }

  /** Visits awaiting a rating whose reminder is due (for the notification scheduler). */
  getDueRatingReminders() {
    return [...this.visits.values()].filter(v =>
      !this.ratings.has(v.appointmentId) &&
      new Date(v.reminderDueAt).getTime() <= this.now() &&
      this._withinWindow(v)
    );
  }

  getPendingRatings(patientId, user) {
    kit.requireSelfOrAdmin(user, patientId);
    return [...this.visits.values()]
      .filter(v => v.patientId === patientId && !this.ratings.has(v.appointmentId) && this._withinWindow(v))
      .map(v => ({ appointmentId: v.appointmentId, doctorId: v.doctorId, completedAt: v.completedAt }));
  }

  recordPromptShown(appointmentId) {
    this.analytics.track('rating_prompt_shown', { appointmentId });
  }

  submitRating(appointmentId, payload, user) {
    kit.requireUser(user);
    const visit = this.visits.get(appointmentId);
    if (!visit) throw new kit.FeatureError('VISIT_NOT_COMPLETED', 'Only completed visits can be rated.', 409);
    if (visit.patientId !== user.uid) {
      throw new kit.FeatureError('FORBIDDEN', 'Only the patient who attended this visit can rate it.', 403);
    }
    if (this.ratings.has(appointmentId)) {
      throw new kit.FeatureError('ALREADY_RATED', 'This visit has already been rated.', 409);
    }
    if (!this._withinWindow(visit)) {
      throw new kit.FeatureError('RATING_WINDOW_CLOSED', `Ratings are accepted within ${RATING_WINDOW_DAYS} days of the visit.`, 409);
    }

    const scores = {};
    for (const c of CRITERIA) {
      const v = payload?.scores?.[c];
      if (v === undefined && c !== 'overall') continue;
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        throw new kit.FeatureError('INVALID_SCORE', `Score "${c}" must be an integer from 1 to 5.`);
      }
      scores[c] = v;
    }

    const rawComment = kit.sanitizeText(payload?.comment || '', 600);
    const comment = kit.redactPII(rawComment);
    const safetyFlag = this._detectSafetyConcern(rawComment);

    const rating = {
      id: kit.newId('rating'),
      appointmentId,
      doctorId: visit.doctorId,
      clinicId: visit.clinicId,
      patientId: visit.patientId, // stored privately, never published
      scores,
      comment,
      wouldRecommend: payload?.wouldRecommend === true,
      safetyFlag,
      moderation: safetyFlag ? 'governance_review' : 'published',
      createdAt: new Date(this.now()).toISOString()
    };
    this.ratings.set(appointmentId, Object.freeze(rating));

    if (safetyFlag) {
      this.governanceQueue.push({ ratingId: rating.id, appointmentId, doctorId: visit.doctorId, at: rating.createdAt });
      this.analytics.track('rating_safety_escalation');
      this.audit.record('RATING_SAFETY_ESCALATED', user, { ratingId: rating.id });
    }
    this.analytics.track('rating_submitted', { overall: scores.overall, hasComment: !!comment });
    this.audit.record('RATING_SUBMITTED', user, { ratingId: rating.id, appointmentId });
    return this._publicView(rating);
  }

  /** Ratings are immutable for doctors (and everyone else). */
  updateRating(appointmentId, _changes, user) {
    kit.requireUser(user);
    this.audit.record('RATING_EDIT_BLOCKED', user, { appointmentId });
    throw new kit.FeatureError('RATING_IMMUTABLE', 'Submitted ratings cannot be edited or deleted.', 403);
  }

  getDoctorSummary(doctorId, user) {
    kit.requireUser(user);
    const published = [...this.ratings.values()].filter(r => r.doctorId === doctorId && r.moderation === 'published');
    if (published.length < MIN_RATINGS_FOR_DISPLAY) {
      return { doctorId, count: published.length, hidden: true, reason: 'INSUFFICIENT_RATINGS' };
    }
    const avg = (key) => {
      const vals = published.map(r => r.scores[key]).filter(Number.isInteger);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
    };
    const averages = {};
    CRITERIA.forEach(c => { averages[c] = avg(c); });
    return {
      doctorId,
      count: published.length,
      hidden: false,
      averages,
      recommendPct: Math.round(published.filter(r => r.wouldRecommend).length / published.length * 100),
      comments: published.filter(r => r.comment).slice(-10).map(r => ({ text: r.comment, overall: r.scores.overall }))
    };
  }

  getGovernanceQueue(user) {
    kit.requireAdmin(user);
    return this.governanceQueue.slice();
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const a = this.analytics;
    const overall = a.events('rating_submitted').map(e => e.props.overall);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    overall.forEach(s => { distribution[s] += 1; });
    const promoters = overall.filter(s => s === 5).length;
    const detractors = overall.filter(s => s <= 3).length;
    return {
      eligibleVisits: a.count('rating_prompt_eligible'),
      promptsShown: a.count('rating_prompt_shown'),
      ratingsSubmitted: a.count('rating_submitted'),
      responseRatePct: a.rate('rating_submitted', 'rating_prompt_eligible'),
      averageOverall: overall.length ? Math.round(overall.reduce((x, y) => x + y, 0) / overall.length * 10) / 10 : 0,
      distribution,
      netPromoterLike: overall.length ? Math.round((promoters - detractors) / overall.length * 100) : 0,
      safetyEscalations: a.count('rating_safety_escalation')
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _withinWindow(visit) {
    return this.now() - new Date(visit.completedAt).getTime() <= RATING_WINDOW_DAYS * 86400000;
  }

  _detectSafetyConcern(text) {
    const lower = (text || '').toLowerCase();
    return SAFETY_KEYWORDS.some(k => lower.includes(k));
  }

  _publicView(rating) {
    const { patientId, ...rest } = rating;
    return rest;
  }
}

const visitRatingService = new VisitRatingService();

module.exports = {
  VisitRatingService,
  visitRatingService,
  CRITERIA,
  RATING_WINDOW_DAYS,
  MIN_RATINGS_FOR_DISPLAY,
  SAFETY_KEYWORDS
};
