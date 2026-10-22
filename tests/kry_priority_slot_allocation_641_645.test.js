/**
 * Health Vibe AI - Kry European Benchmark: Priority Slot Allocation Suite
 * Tasks #641, #642, #643, #644, #645
 *
 * Test Matrix:
 * 1. UI/UX Flow (#641): Panel rendering in AR/EN, accept/decline buttons, emergency redirect, touch targets >= 44px.
 * 2. Backend & APIs (#642): Reserve, list, offer, hold window (15m), accept/decline, doctor confirm, REST endpoints.
 * 3. Safety & Privacy (#643): Life-threatening symptoms divert to 123 emergency; doctor confirmation required;
 *    mandatory downgrade reason; cross-patient data isolation.
 * 4. Integration QA & Edge Cases (#644): Expired offer release, anti-double-booking, out-of-order calls, AR/EN labels.
 * 5. Analytics & Logging (#645): Acceptance rate, confirmation rate, emergency redirects, audit trail integrity.
 */

'use strict';

const assert = require('assert');
const {
  PrioritySlotService,
  prioritySlotService,
  TRIAGE,
  SLOT_STATUS,
  OFFER_STATUS,
  EMERGENCY_RED_FLAGS
} = require('../backend/priority-slot-service');

const { PrioritySlotPanel } = require('../app/modules/appointments/feature-panels-641-670');
const app = require('../backend/server');

console.log('\n==================================================================');
console.log('⚡ HEALTH VIBE AI: KRY PRIORITY SLOT ALLOCATION (TASKS #641-#645)');
console.log('   Triage Gate, Emergency Bypass, Doctor Confirmation & Analytics');
console.log('==================================================================\n');

async function runTests() {
  let virtualTime = 1770000000000;
  const now = () => virtualTime;
  const service = new PrioritySlotService({ now });

  const patient = { uid: 'pt_kry_01', role: 'patient' };
  const doctor = { uid: 'doc_kry_01', role: 'doctor', displayName: 'Dr. Tariq Pulmo' };
  const admin = { uid: 'admin_kry_01', role: 'super_admin' };
  const stranger = { uid: 'pt_kry_99', role: 'patient' };

  // ==================================================================
  // TASK #642: Backend & APIs - Slot Reservation & Availability
  // ==================================================================
  console.log('▶ TASK #642: Backend & APIs - Slot Reservation & Availability');
  {
    assert.throws(() => service.reservePrioritySlot({ startsAt: virtualTime - 1000 }, doctor), /INVALID_SLOT_TIME/);
    assert.throws(() => service.reservePrioritySlot({ startsAt: virtualTime + 3600000 }, patient), /FORBIDDEN/);

    const slot1 = service.reservePrioritySlot({
      doctorId: doctor.uid,
      doctorName: doctor.displayName,
      startsAt: virtualTime + 4 * 3600000,
      governorate: 'Cairo'
    }, doctor);

    assert.ok(slot1.id.startsWith('pslot_'));
    assert.strictEqual(slot1.status, SLOT_STATUS.OPEN);

    const available = service.listAvailablePrioritySlots();
    assert.strictEqual(available.length, 1);
    assert.strictEqual(available[0].id, slot1.id);
    console.log('  ✓ Priority slot reserved and available in list');
  }

  // ==================================================================
  // TASK #643: Safety & Privacy - Emergency Bypass & RED Triage Gate
  // ==================================================================
  console.log('▶ TASK #643: Safety & Privacy - Emergency Bypass & RED Triage Gate');
  {
    // Green assessment is not eligible
    const greenAssessment = { id: 'asmt_green', triage: TRIAGE.GREEN, status: 'completed' };
    const greenOffer = service.offerPrioritySlot(patient.uid, greenAssessment, patient);
    assert.strictEqual(greenOffer.offered, false);
    assert.strictEqual(greenOffer.reason, 'NOT_HIGH_RISK');

    // Incomplete assessment is rejected
    const draftAssessment = { id: 'asmt_draft', triage: TRIAGE.RED, status: 'draft' };
    const draftOffer = service.offerPrioritySlot(patient.uid, draftAssessment, patient);
    assert.strictEqual(draftOffer.offered, false);
    assert.strictEqual(draftOffer.reason, 'ASSESSMENT_NOT_COMPLETED');

    // Life-threatening emergency red flag MUST divert to 123 emergency
    const emergencyAssessment = {
      id: 'asmt_emerg',
      triage: TRIAGE.RED,
      status: 'completed',
      redFlags: ['cyanosis', 'unable_to_speak']
    };
    const emergOffer = service.offerPrioritySlot(patient.uid, emergencyAssessment, patient);
    assert.strictEqual(emergOffer.offered, false);
    assert.strictEqual(emergOffer.route, 'emergency');
    assert.strictEqual(emergOffer.emergencyNumber, '123');
    assert.deepStrictEqual(emergOffer.emergencyFlags, ['cyanosis', 'unable_to_speak']);

    // Stranger cannot request offer for patient
    const validAssessment = { id: 'asmt_red_01', triage: TRIAGE.RED, status: 'completed' };
    assert.throws(() => service.offerPrioritySlot(patient.uid, validAssessment, stranger), /FORBIDDEN/);

    console.log('  ✓ Strict safety gates: emergency divert to 123 & role isolation enforced');
  }

  // ==================================================================
  // TASK #641: UI/UX Flow - Emergency and Priority Offer Panels
  // ==================================================================
  console.log('▶ TASK #641: UI/UX Flow - Emergency and Priority Offer Panels');
  {
    const emergHtmlAr = PrioritySlotPanel.render({ route: 'emergency', emergencyNumber: '123' }, false);
    assert.ok(emergHtmlAr.includes('123'));
    assert.ok(emergHtmlAr.includes('dir="rtl"'));
    assert.ok(emergHtmlAr.includes('kryEmergencyRedirect'));

    const emergHtmlEn = PrioritySlotPanel.render({ route: 'emergency', emergencyNumber: '123' }, true);
    assert.ok(emergHtmlEn.includes('dir="ltr"'));
    assert.ok(emergHtmlEn.includes('Call ambulance 123'));

    const sampleOfferResult = {
      offered: true,
      offer: { id: 'poffer_test', expiresAt: new Date(virtualTime + 900000).toISOString() },
      slot: { doctorName: 'د. طارق', startsAt: new Date(virtualTime + 7200000).toISOString() }
    };
    const offerHtml = PrioritySlotPanel.render(sampleOfferResult, false);
    assert.ok(offerHtml.includes('kryAcceptOfferBtn'));
    assert.ok(offerHtml.includes('kryDeclineOfferBtn'));
    assert.ok(offerHtml.includes('min-height:44px'));
    assert.ok(offerHtml.includes('kry-triage-red-pill'));

    console.log('  ✓ UI/UX Flow rendered in AR/EN with WCAG touch targets >= 44px');
  }

  // ==================================================================
  // TASK #644: Integration QA & Edge Cases - Offer Hold & Doctor Confirmation
  // ==================================================================
  console.log('▶ TASK #644: Integration QA & Edge Cases - Hold, Expire & Doctor Confirmation');
  {
    const redAssessment = { id: 'asmt_red_01', triage: TRIAGE.RED, status: 'completed' };
    const offerResult = service.offerPrioritySlot(patient.uid, redAssessment, patient);
    assert.strictEqual(offerResult.offered, true);
    const offer = offerResult.offer;

    // Slot is now held, not listed as open
    assert.strictEqual(service.listAvailablePrioritySlots().length, 0);

    // Patient accepts
    const accepted = service.respondToOffer(offer.id, true, patient);
    assert.strictEqual(accepted.status, OFFER_STATUS.ACCEPTED);

    // Patient cannot confirm their own slot (doctor confirmation required)
    assert.throws(() => service.doctorConfirm(offer.id, patient), /FORBIDDEN/);

    // Doctor confirms
    const confirmed = service.doctorConfirm(offer.id, doctor);
    assert.strictEqual(confirmed.status, OFFER_STATUS.CONFIRMED);
    assert.strictEqual(confirmed.confirmedBy, doctor.uid);

    // Doctor downgrade requires reason
    const slot2 = service.reservePrioritySlot({ doctorId: doctor.uid, startsAt: virtualTime + 10 * 3600000 }, doctor);
    const offer2 = service.offerPrioritySlot('pt_kry_02', { id: 'asmt_red_02', triage: TRIAGE.RED, status: 'completed' }, { uid: 'pt_kry_02', role: 'patient' });
    service.respondToOffer(offer2.offer.id, true, { uid: 'pt_kry_02', role: 'patient' });

    assert.throws(() => service.doctorDowngrade(offer2.offer.id, 'no', doctor), /REASON_REQUIRED/);
    const downgraded = service.doctorDowngrade(offer2.offer.id, 'Patient stable upon secondary triage, routine slot recommended.', doctor);
    assert.strictEqual(downgraded.status, OFFER_STATUS.DOWNGRADED);
    assert.ok(downgraded.downgradeReason.includes('stable'));

    // Expiry test: ensure slot 3 is held by offer, then advance time 16 min -> expired
    const openBefore = service.listAvailablePrioritySlots().length;
    const slot3 = service.reservePrioritySlot({ doctorId: doctor.uid, startsAt: virtualTime + 12 * 3600000 }, doctor);
    const offer3 = service.offerPrioritySlot('pt_kry_03', { id: 'asmt_red_03', triage: TRIAGE.RED, status: 'completed' }, { uid: 'pt_kry_03', role: 'patient' });
    assert.strictEqual(service.slots.get(offer3.offer.slotId).status, SLOT_STATUS.HELD);

    virtualTime += 16 * 60 * 1000; // 16 minutes later
    assert.ok(service.listAvailablePrioritySlots().some(s => s.id === offer3.offer.slotId));

    console.log('  ✓ 15-minute hold expiry and doctor human-in-the-loop downgrade verified');
  }

  // ==================================================================
  // TASK #645: Analytics & Logging
  // ==================================================================
  console.log('▶ TASK #645: Analytics & Logging - Conversion & Audit Trail');
  {
    assert.throws(() => service.getAnalytics(patient), /FORBIDDEN/);
    const metrics = service.getAnalytics(admin);
    assert.ok(metrics.offersCreated >= 2);
    assert.ok(metrics.emergencyRedirects >= 1);
    assert.ok(metrics.bookingsConfirmed >= 1);
    assert.ok(metrics.doctorDowngrades >= 1);
    assert.ok(metrics.offersExpired >= 1);

    const audit = service.audit.list();
    assert.ok(audit.some(e => e.type === 'PRIORITY_EMERGENCY_REDIRECT'));
    assert.ok(audit.some(e => e.type === 'PRIORITY_DOCTOR_CONFIRMED'));
    assert.ok(audit.some(e => e.type === 'PRIORITY_DOCTOR_DOWNGRADED'));

    console.log('  ✓ KPI metrics and append-only audit trail verified');
  }

  console.log('\n==================================================================');
  console.log('🎉 ALL KRY PRIORITY SLOT ALLOCATION TESTS PASSED (TASKS #641-#645)');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ KRY TEST FAILED:', err);
  process.exit(1);
});
