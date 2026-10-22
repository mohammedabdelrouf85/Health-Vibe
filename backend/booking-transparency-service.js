/**
 * Health Vibe AI - Booking Transparency: Fee & Expected Wait (CliniDo benchmark)
 * Tasks #662 (Backend), #663 (Safety & Privacy), #665 (Analytics)
 *
 * Shows the patient the consultation fee and the expected in-clinic waiting time
 * BEFORE they confirm a booking.
 * Safety & privacy rules:
 *  - Price lock: the fee the patient saw is held in a 15-minute quote. If the
 *    doctor's fee changes, confirmation is refused and the patient must re-review
 *    (no hidden price changes).
 *  - Fees are bounded (50–5000 EGP); every fee change is audited with the actor.
 *  - Wait time is an ESTIMATE shown as a range, computed from aggregated
 *    anonymous check-in→start durations (no patient identities stored).
 *  - High-risk (RED) patients are told not to wait for a routine slot and are
 *    pointed to the urgent/emergency path instead.
 */

'use strict';

const kit = require('./feature-kit');

const MIN_FEE_EGP = 50;
const MAX_FEE_EGP = 5000;
const QUOTE_TTL_MINUTES = 15;
const WAIT_SAMPLE_SIZE = 20;
const MIN_WAIT_SAMPLES = 3;
const MODES = ['clinic', 'video', 'followup'];

class BookingTransparencyService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.audit = kit.createAuditTrail('booking_transparency');
    this.analytics = kit.createAnalytics('booking_transparency');
    this.resetState();
  }

  resetState() {
    this.fees = new Map();        // doctorId -> { clinic, video, followup, currency, version }
    this.declaredWait = new Map(); // doctorId -> minutes
    this.waitSamples = new Map(); // doctorId -> [minutes]
    this.quotes = new Map();
    this.audit.reset();
    this.analytics.reset();
  }

  setDoctorFees(doctorId, fees, user) {
    kit.requireUser(user);
    if (!(kit.isDoctor(user) && user.uid === doctorId) && !kit.isAdmin(user)) {
      throw new kit.FeatureError('FORBIDDEN', 'Only the doctor or a clinic admin can set fees.', 403);
    }
    const prev = this.fees.get(doctorId);
    const next = { currency: 'EGP', version: (prev?.version || 0) + 1 };
    for (const mode of MODES) {
      const v = fees?.[mode] ?? prev?.[mode];
      if (v === undefined) continue;
      if (!Number.isInteger(v) || v < MIN_FEE_EGP || v > MAX_FEE_EGP) {
        throw new kit.FeatureError('INVALID_FEE', `Fee for ${mode} must be an integer between ${MIN_FEE_EGP} and ${MAX_FEE_EGP} EGP.`);
      }
      next[mode] = v;
    }
    if (fees?.declaredWaitMinutes !== undefined) {
      const w = fees.declaredWaitMinutes;
      if (!Number.isInteger(w) || w < 0 || w > 240) throw new kit.FeatureError('INVALID_WAIT', 'Declared wait must be 0–240 minutes.');
      this.declaredWait.set(doctorId, w);
    }
    this.fees.set(doctorId, next);
    this.audit.record('DOCTOR_FEE_CHANGED', user, { doctorId, from: prev || null, to: next });
    return { ...next };
  }

  /** Called by the clinic front-desk flow: anonymous duration only. */
  recordActualWait(doctorId, minutes) {
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 600) return;
    const list = this.waitSamples.get(doctorId) || [];
    list.push(Math.round(minutes));
    while (list.length > WAIT_SAMPLE_SIZE) list.shift();
    this.waitSamples.set(doctorId, list);
  }

  estimateWait(doctorId, mode = 'clinic') {
    if (mode === 'video') return { minMinutes: 0, maxMinutes: 10, typicalMinutes: 5, source: 'virtual_queue', isEstimate: true };
    const samples = this.waitSamples.get(doctorId) || [];
    if (samples.length >= MIN_WAIT_SAMPLES) {
      const sorted = [...samples].sort((a, b) => a - b);
      const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
      return { minMinutes: pick(0.25), maxMinutes: pick(0.75), typicalMinutes: pick(0.5), source: 'recent_visits', sampleSize: samples.length, isEstimate: true };
    }
    const declared = this.declaredWait.get(doctorId);
    if (declared !== undefined) {
      return { minMinutes: Math.max(0, declared - 10), maxMinutes: declared + 15, typicalMinutes: declared, source: 'doctor_declared', isEstimate: true };
    }
    return { minMinutes: null, maxMinutes: null, typicalMinutes: null, source: 'unknown', isEstimate: true };
  }

  /** Builds the pre-confirmation summary and locks the price for 15 minutes. */
  createQuote({ patientId, doctorId, mode = 'clinic', slotStartsAt, triage }, user) {
    kit.requireSelfOrAdmin(user, patientId);
    if (!MODES.includes(mode)) throw new kit.FeatureError('INVALID_MODE', 'Unknown consultation mode.');
    const fees = this.fees.get(doctorId);
    if (!fees || fees[mode] === undefined) {
      throw new kit.FeatureError('FEE_NOT_PUBLISHED', 'This doctor has not published a fee for this consultation type.', 409);
    }
    const quote = {
      id: kit.newId('quote'),
      patientId,
      doctorId,
      mode,
      slotStartsAt: slotStartsAt || null,
      feeEgp: fees[mode],
      currency: 'EGP',
      feeVersion: fees.version,
      wait: this.estimateWait(doctorId, mode),
      urgentNotice: triage === 'red',
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + QUOTE_TTL_MINUTES * 60000).toISOString(),
      status: 'open'
    };
    this.quotes.set(quote.id, quote);
    this.analytics.track('booking_quote_viewed', { mode, feeEgp: quote.feeEgp, waitKnown: quote.wait.source !== 'unknown' });
    return { ...quote };
  }

  confirmQuote(quoteId, user) {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new kit.FeatureError('QUOTE_NOT_FOUND', 'Quote not found.', 404);
    kit.requireSelfOrAdmin(user, quote.patientId);
    if (quote.status !== 'open') throw new kit.FeatureError('QUOTE_NOT_OPEN', `Quote is ${quote.status}.`, 409);
    if (new Date(quote.expiresAt).getTime() <= this.now()) {
      quote.status = 'expired';
      this.analytics.track('booking_quote_expired');
      throw new kit.FeatureError('QUOTE_EXPIRED', 'Price quote expired. Please review the details again.', 409);
    }
    const current = this.fees.get(quote.doctorId);
    if (!current || current.version !== quote.feeVersion || current[quote.mode] !== quote.feeEgp) {
      quote.status = 'stale';
      this.analytics.track('booking_price_changed_block');
      throw new kit.FeatureError('PRICE_CHANGED', 'The consultation fee changed. Please review the new price before confirming.', 409);
    }
    quote.status = 'confirmed';
    quote.confirmedAt = new Date(this.now()).toISOString();
    this.analytics.track('booking_quote_confirmed', { mode: quote.mode, feeEgp: quote.feeEgp });
    this.audit.record('BOOKING_CONFIRMED_WITH_QUOTE', user, { quoteId, feeEgp: quote.feeEgp });
    return { ...quote };
  }

  abandonQuote(quoteId, reason, user) {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new kit.FeatureError('QUOTE_NOT_FOUND', 'Quote not found.', 404);
    kit.requireSelfOrAdmin(user, quote.patientId);
    quote.status = 'abandoned';
    const allowed = ['price', 'wait_time', 'changed_mind', 'other'];
    this.analytics.track('booking_quote_abandoned', { reason: allowed.includes(reason) ? reason : 'other' });
    return { ...quote };
  }

  /** Compares an estimate with the real wait to track estimate accuracy. */
  recordEstimateAccuracy(estimatedTypical, actualMinutes) {
    if (!Number.isFinite(estimatedTypical) || !Number.isFinite(actualMinutes)) return;
    this.analytics.track('wait_estimate_accuracy', { absError: Math.abs(estimatedTypical - actualMinutes) });
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const a = this.analytics;
    const confirmed = a.events('booking_quote_confirmed');
    const abandonReasons = {};
    a.events('booking_quote_abandoned').forEach(e => { abandonReasons[e.props.reason] = (abandonReasons[e.props.reason] || 0) + 1; });
    const acc = a.events('wait_estimate_accuracy');
    return {
      quotesViewed: a.count('booking_quote_viewed'),
      quotesConfirmed: confirmed.length,
      quotesAbandoned: a.count('booking_quote_abandoned'),
      quotesExpired: a.count('booking_quote_expired'),
      priceChangeBlocks: a.count('booking_price_changed_block'),
      conversionRatePct: a.rate('booking_quote_confirmed', 'booking_quote_viewed'),
      abandonReasons,
      avgConfirmedFeeEgp: confirmed.length ? Math.round(confirmed.reduce((s, e) => s + e.props.feeEgp, 0) / confirmed.length) : 0,
      waitEstimateMaeMinutes: acc.length ? Math.round(acc.reduce((s, e) => s + e.props.absError, 0) / acc.length * 10) / 10 : null
    };
  }
}

const bookingTransparencyService = new BookingTransparencyService();

module.exports = {
  BookingTransparencyService,
  bookingTransparencyService,
  MIN_FEE_EGP,
  MAX_FEE_EGP,
  QUOTE_TTL_MINUTES,
  MODES
};
