/**
 * Health Vibe AI - Priority Slot Allocation Service (Kry benchmark)
 * Tasks #642 (Backend), #643 (Safety & Privacy), #645 (Analytics)
 *
 * Reserves near-term urgent slots for patients whose assessment was triaged RED
 * (High Risk). Safety rules:
 *  - Only RED triage is eligible; the triage must come from a completed assessment.
 *  - Life-threatening red flags are NEVER routed to a clinic slot: the patient is
 *    directed to emergency services (123 in Egypt) instead.
 *  - AI triage can only OFFER a provisional slot. A human doctor must confirm the
 *    booking, and may downgrade the priority with a mandatory written reason.
 *  - Offers are held for a limited window so the same slot is never double-booked.
 */

'use strict';

const kit = require('./feature-kit');

const PRIORITY_WINDOW_HOURS = 48;
const OFFER_HOLD_MINUTES = 15;
const EMERGENCY_NUMBER_EG = '123';

const TRIAGE = { RED: 'red', AMBER: 'amber', GREEN: 'green' };

/** Symptoms that must go to the emergency department, not a booked slot. */
const EMERGENCY_RED_FLAGS = [
  'cyanosis', 'unable_to_speak', 'altered_consciousness', 'spo2_below_90',
  'chest_pain_severe', 'hemoptysis_massive'
];

const SLOT_STATUS = { OPEN: 'open', HELD: 'held', PENDING_DOCTOR: 'pending_doctor', CONFIRMED: 'confirmed' };
const OFFER_STATUS = {
  OFFERED: 'offered', ACCEPTED: 'accepted', DECLINED: 'declined', EXPIRED: 'expired',
  CONFIRMED: 'confirmed', DOWNGRADED: 'downgraded'
};

class PrioritySlotService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.audit = kit.createAuditTrail('priority_slots');
    this.analytics = kit.createAnalytics('priority_slots');
    this.resetState();
  }

  resetState() {
    this.slots = new Map();
    this.offers = new Map();
    this.audit.reset();
    this.analytics.reset();
  }

  // ── Doctor-reserved urgent capacity ────────────────────────────────────────
  reservePrioritySlot({ doctorId, doctorName, startsAt, governorate = 'Cairo' }, user) {
    kit.requireUser(user);
    if (!kit.isDoctor(user) && !kit.isAdmin(user)) {
      throw new kit.FeatureError('FORBIDDEN', 'Only doctors or clinic admins can reserve urgent slots.', 403);
    }
    const start = new Date(startsAt).getTime();
    if (!Number.isFinite(start) || start <= this.now()) {
      throw new kit.FeatureError('INVALID_SLOT_TIME', 'Urgent slot must be in the future.');
    }
    const slot = {
      id: kit.newId('pslot'),
      doctorId: doctorId || user.uid,
      doctorName: doctorName || user.displayName || 'Doctor',
      startsAt: new Date(start).toISOString(),
      governorate,
      status: SLOT_STATUS.OPEN
    };
    this.slots.set(slot.id, slot);
    this.audit.record('PRIORITY_SLOT_RESERVED', user, { slotId: slot.id });
    return slot;
  }

  listAvailablePrioritySlots() {
    this._expireStaleOffers();
    const horizon = this.now() + PRIORITY_WINDOW_HOURS * 3600 * 1000;
    return [...this.slots.values()]
      .filter(s => s.status === SLOT_STATUS.OPEN)
      .filter(s => { const t = new Date(s.startsAt).getTime(); return t > this.now() && t <= horizon; })
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  // ── Eligibility & safety gate ──────────────────────────────────────────────
  evaluateEligibility(assessment) {
    if (!assessment || !assessment.id || assessment.status !== 'completed') {
      return { eligible: false, route: 'standard', reason: 'ASSESSMENT_NOT_COMPLETED' };
    }
    const flags = Array.isArray(assessment.redFlags) ? assessment.redFlags : [];
    const emergencyFlags = flags.filter(f => EMERGENCY_RED_FLAGS.includes(f));
    if (emergencyFlags.length > 0) {
      return { eligible: false, route: 'emergency', emergencyNumber: EMERGENCY_NUMBER_EG, emergencyFlags, reason: 'EMERGENCY_RED_FLAGS' };
    }
    if (assessment.triage !== TRIAGE.RED) {
      return { eligible: false, route: 'standard', reason: 'NOT_HIGH_RISK' };
    }
    return { eligible: true, route: 'priority', reason: 'HIGH_RISK_TRIAGE' };
  }

  // ── Offer lifecycle ────────────────────────────────────────────────────────
  offerPrioritySlot(patientId, assessment, user) {
    kit.requireSelfOrAdmin(user, patientId);
    this.analytics.track('priority_eligibility_checked', { triage: assessment?.triage });

    const eligibility = this.evaluateEligibility(assessment);
    if (eligibility.route === 'emergency') {
      this.analytics.track('priority_emergency_redirect');
      this.audit.record('PRIORITY_EMERGENCY_REDIRECT', user, { patientId, assessmentId: assessment.id });
      return { offered: false, ...eligibility };
    }
    if (!eligibility.eligible) return { offered: false, ...eligibility };

    const existing = [...this.offers.values()].find(o => o.patientId === patientId && o.status === OFFER_STATUS.OFFERED);
    if (existing) return { offered: true, offer: existing, reused: true, ...eligibility };

    const slot = this.listAvailablePrioritySlots()[0];
    if (!slot) {
      this.analytics.track('priority_no_capacity');
      return { offered: false, route: 'priority', reason: 'NO_PRIORITY_CAPACITY', fallback: 'waiting_list_urgent' };
    }

    slot.status = SLOT_STATUS.HELD;
    const offer = {
      id: kit.newId('poffer'),
      patientId,
      slotId: slot.id,
      doctorId: slot.doctorId,
      assessmentId: assessment.id,
      triage: assessment.triage,
      status: OFFER_STATUS.OFFERED,
      offeredAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + OFFER_HOLD_MINUTES * 60000).toISOString(),
      requiresDoctorConfirmation: true
    };
    this.offers.set(offer.id, offer);
    this.analytics.track('priority_offer_created');
    this.audit.record('PRIORITY_SLOT_OFFERED', user, { offerId: offer.id, slotId: slot.id });
    return { offered: true, offer, slot: { ...slot }, ...eligibility };
  }

  respondToOffer(offerId, accept, user) {
    const offer = this._getOffer(offerId);
    kit.requireSelfOrAdmin(user, offer.patientId);
    this._expireStaleOffers();
    if (offer.status !== OFFER_STATUS.OFFERED) {
      throw new kit.FeatureError('OFFER_NOT_ACTIVE', `Offer is ${offer.status}.`, 409);
    }
    const slot = this.slots.get(offer.slotId);
    if (accept) {
      offer.status = OFFER_STATUS.ACCEPTED;
      slot.status = SLOT_STATUS.PENDING_DOCTOR;
      this.analytics.track('priority_offer_accepted', { minutesToAccept: (this.now() - new Date(offer.offeredAt)) / 60000 });
    } else {
      offer.status = OFFER_STATUS.DECLINED;
      slot.status = SLOT_STATUS.OPEN;
      this.analytics.track('priority_offer_declined');
    }
    this.audit.record(accept ? 'PRIORITY_OFFER_ACCEPTED' : 'PRIORITY_OFFER_DECLINED', user, { offerId });
    return { ...offer };
  }

  /** Human-in-the-loop: only the slot's doctor (or admin) finalises the booking. */
  doctorConfirm(offerId, user) {
    const offer = this._getOffer(offerId);
    this._requireOfferDoctor(offer, user);
    if (offer.status !== OFFER_STATUS.ACCEPTED) {
      throw new kit.FeatureError('OFFER_NOT_ACCEPTED', 'Patient must accept before doctor confirmation.', 409);
    }
    offer.status = OFFER_STATUS.CONFIRMED;
    offer.confirmedBy = user.uid;
    this.slots.get(offer.slotId).status = SLOT_STATUS.CONFIRMED;
    this.analytics.track('priority_booking_confirmed');
    this.audit.record('PRIORITY_DOCTOR_CONFIRMED', user, { offerId });
    return { ...offer };
  }

  /** Doctor clinical judgement overrides AI triage; a reason is mandatory. */
  doctorDowngrade(offerId, reason, user) {
    const offer = this._getOffer(offerId);
    this._requireOfferDoctor(offer, user);
    const cleanReason = kit.sanitizeText(reason, 500);
    if (cleanReason.length < 5) {
      throw new kit.FeatureError('REASON_REQUIRED', 'A clinical reason is required to downgrade priority.');
    }
    offer.status = OFFER_STATUS.DOWNGRADED;
    offer.downgradeReason = cleanReason;
    this.slots.get(offer.slotId).status = SLOT_STATUS.OPEN;
    this.analytics.track('priority_doctor_downgrade');
    this.audit.record('PRIORITY_DOCTOR_DOWNGRADED', user, { offerId, reason: cleanReason });
    return { ...offer };
  }

  /** Patient-facing view never exposes other patients' data or raw clinical notes. */
  getPatientOffers(patientId, user) {
    kit.requireSelfOrAdmin(user, patientId);
    this._expireStaleOffers();
    return [...this.offers.values()]
      .filter(o => o.patientId === patientId)
      .map(({ downgradeReason, ...rest }) => ({ ...rest, hasDoctorNote: !!downgradeReason }));
  }

  getAnalytics(user) {
    kit.requireAdmin(user);
    const a = this.analytics;
    const acceptedEvents = a.events('priority_offer_accepted');
    const avgMinutes = acceptedEvents.length
      ? Math.round(acceptedEvents.reduce((s, e) => s + e.props.minutesToAccept, 0) / acceptedEvents.length * 10) / 10
      : 0;
    return {
      eligibilityChecks: a.count('priority_eligibility_checked'),
      offersCreated: a.count('priority_offer_created'),
      offersAccepted: a.count('priority_offer_accepted'),
      offersDeclined: a.count('priority_offer_declined'),
      offersExpired: a.count('priority_offer_expired'),
      bookingsConfirmed: a.count('priority_booking_confirmed'),
      doctorDowngrades: a.count('priority_doctor_downgrade'),
      emergencyRedirects: a.count('priority_emergency_redirect'),
      noCapacityEvents: a.count('priority_no_capacity'),
      acceptanceRatePct: a.rate('priority_offer_accepted', 'priority_offer_created'),
      confirmationRatePct: a.rate('priority_booking_confirmed', 'priority_offer_accepted'),
      avgMinutesToAccept: avgMinutes
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _getOffer(offerId) {
    const offer = this.offers.get(offerId);
    if (!offer) throw new kit.FeatureError('OFFER_NOT_FOUND', 'Offer not found.', 404);
    return offer;
  }

  _requireOfferDoctor(offer, user) {
    kit.requireUser(user);
    if (!(kit.isDoctor(user) && user.uid === offer.doctorId) && !kit.isAdmin(user)) {
      throw new kit.FeatureError('FORBIDDEN', 'Only the assigned doctor can confirm or change this booking.', 403);
    }
  }

  _expireStaleOffers() {
    for (const offer of this.offers.values()) {
      if (offer.status === OFFER_STATUS.OFFERED && new Date(offer.expiresAt).getTime() <= this.now()) {
        offer.status = OFFER_STATUS.EXPIRED;
        const slot = this.slots.get(offer.slotId);
        if (slot) slot.status = SLOT_STATUS.OPEN;
        this.analytics.track('priority_offer_expired');
      }
    }
  }
}

const prioritySlotService = new PrioritySlotService();

module.exports = {
  PrioritySlotService,
  prioritySlotService,
  TRIAGE,
  SLOT_STATUS,
  OFFER_STATUS,
  EMERGENCY_RED_FLAGS,
  EMERGENCY_NUMBER_EG,
  PRIORITY_WINDOW_HOURS,
  OFFER_HOLD_MINUTES
};
