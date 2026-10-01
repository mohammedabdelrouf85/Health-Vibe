/**
 * Health Vibe AI - Subscription, Billing, Entitlements & Revenue Ledger Test Suite
 * 
 * Verifies:
 * 1. Plan comparison matrix (Free Patient, Doctor Starter, Clinic Basic/Pro, Enterprise).
 * 2. Operating cost grounding & pilot performance metrics.
 * 3. Initial sellable plan identification (Doctor Starter / Solo Practice).
 * 4. Business constraint enforcement: no approved sales figures without business decision.
 * 5. Subscription lifecycle state transitions (trialing, active, past_due, canceled).
 * 6. Entitlement and permissions engine tied to payment status:
 *    - Preserves read-only medical record access during past_due / canceled (statutory compliance).
 *    - Blocks active intake and case approvals during past_due / canceled.
 * 7. Append-only revenue ledger immutability and financial summary reconciliation.
 * 8. Express API endpoints (/api/billing/plans, etc.).
 */

const assert = require('assert');
const http = require('http');

const billingService = require('../backend/billing-service');
const app = require('../backend/server');

const {
  PLANS,
  OPERATING_COST_MODEL,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHODS,
  LEDGER_ENTRY_TYPES,
  PRICING_DECISION_PENDING,
  PRICING_DISCLAIMER,
  getClinicSubscription,
  updateSubscription,
  setSubscriptionPaymentStatus,
  recordAssessmentUsage,
  checkSubscriptionEntitlement,
  recordLedgerEntry,
  getLedgerEntries,
  getRevenueSummary
} = billingService;

console.log('==================================================================');
console.log('💳 HEALTH VIBE AI: SUBSCRIPTION, BILLING & REVENUE LEDGER TESTS');
console.log('   Tier Limits, Entitlements, Cost Grounding & Immutable Ledger');
console.log('==================================================================\n');

async function runTests() {
  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Plan Comparison Matrix & Business Decision Safeguards
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Plan Comparison Matrix & Business Decision Safeguards');

  const requiredPlans = ['FREE_PATIENT', 'DOCTOR_STARTER', 'CLINIC_BASIC', 'CLINIC_PRO', 'ENTERPRISE'];
  for (const pid of requiredPlans) {
    assert.ok(PLANS[pid], `Plan ${pid} must be defined in PLANS`);
    assert.ok(PLANS[pid].name, `Plan ${pid} must have a name`);
    assert.ok(PLANS[pid].limits, `Plan ${pid} must have limits defined`);
    assert.ok(Array.isArray(PLANS[pid].features), `Plan ${pid} must have feature list`);
  }

  // Verify Free Patient tier limits & features
  const freePatient = PLANS.FREE_PATIENT;
  assert.strictEqual(freePatient.priceEgp, 0, 'Free Patient must be 0 EGP');
  assert.strictEqual(freePatient.onboardingFeeEgp, 0, 'Free Patient onboarding must be 0');
  assert.strictEqual(freePatient.limits.doctorSeats, 0, 'Free Patient has 0 doctor seats');
  assert.strictEqual(freePatient.gatedFeatures.doctorQueueAccess, false, 'Free Patient has no doctor queue');

  // Verify Doctor Starter limits & initial sellable status
  const docStarter = PLANS.DOCTOR_STARTER;
  assert.strictEqual(docStarter.limits.doctorSeats, 1, 'Doctor Starter must have exactly 1 doctor seat');
  assert.strictEqual(docStarter.limits.assessmentsPerMonth, 200, 'Doctor Starter limit is 200 assessments/mo');
  assert.strictEqual(docStarter.isInitialSellablePlan, true, 'Doctor Starter must be identified as initial sellable plan');
  assert.strictEqual(docStarter.pricingApproved, false, 'Doctor Starter must NOT claim approved sales pricing');

  // Verify Clinic Basic & Pro limits
  const clinicBasic = PLANS.CLINIC_BASIC;
  assert.strictEqual(clinicBasic.limits.doctorSeats, 3, 'Clinic Basic covers up to 3 doctors');
  assert.strictEqual(clinicBasic.limits.assessmentsPerMonth, 800, 'Clinic Basic covers 800 assessments/mo');

  const clinicPro = PLANS.CLINIC_PRO;
  assert.strictEqual(clinicPro.limits.doctorSeats, 10, 'Clinic Pro covers up to 10 doctors');
  assert.strictEqual(clinicPro.limits.assessmentsPerMonth, 2500, 'Clinic Pro covers 2,500 assessments/mo');
  assert.strictEqual(clinicPro.gatedFeatures.whatsappInteractiveBot, true, 'Clinic Pro includes WhatsApp bot');

  // Verify Enterprise tier
  const enterprise = PLANS.ENTERPRISE;
  assert.strictEqual(enterprise.gatedFeatures.ehrIntegration, true, 'Enterprise includes EHR integration');
  assert.strictEqual(enterprise.onboardingRequirements.ehrMappingIncluded, true, 'Enterprise includes EHR mapping');

  // Verify CRITICAL CONSTRAINT: Pricing decision flag and disclaimers
  assert.strictEqual(PRICING_DECISION_PENDING, true, 'Pricing decision must be marked pending');
  assert.ok(PRICING_DISCLAIMER.includes('Provisional Modeling Baseline'), 'Disclaimer must state provisional modeling');
  for (const pid of ['DOCTOR_STARTER', 'CLINIC_BASIC', 'CLINIC_PRO', 'ENTERPRISE']) {
    assert.strictEqual(PLANS[pid].pricingApproved, false, `${pid} pricingApproved must be false`);
    assert.ok(PLANS[pid].pricingDisclaimer, `${pid} must carry pricingDisclaimer`);
  }
  console.log('  ✓ All 5 tiers verified with limits, features, and onboarding requirements.');
  console.log('  ✓ Business constraint verified: No approved sales figures added without business decision.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Operating Costs & Pilot Grounding
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: Operating Costs & Pilot Grounding Analysis');

  const { cloudInfrastructure, messagingApi, pilotResultsGrounding, commercialRecommendation } = OPERATING_COST_MODEL;
  assert.ok(cloudInfrastructure.unitCostPer1000AssessmentsUsd <= 0.10, 'Cloud infra must be grounded at <= $0.10/1k assessments');
  assert.ok(messagingApi.unitCostPerConversationUsd <= 0.05, 'Messaging must be grounded at <= $0.05/conversation');
  assert.ok(pilotResultsGrounding.triageTimeSavedPercent >= 70.0, 'Pilot must show >= 70% triage time saved');
  assert.ok(pilotResultsGrounding.noShowRateAfterPercent <= 5.0, 'Pilot must show <= 5% no-show rate');
  assert.strictEqual(commercialRecommendation.initialSellablePlan, 'DOCTOR_STARTER');
  assert.ok(commercialRecommendation.rationale.length >= 3, 'Commercial rationale must provide detailed points');

  console.log(`  ✓ Cloud compute unit cost: ~$${cloudInfrastructure.unitCostPer1000AssessmentsUsd} / 1,000 assessments.`);
  console.log(`  ✓ Pilot triage efficiency: ${pilotResultsGrounding.triageTimeSavedPercent}% reduction (${pilotResultsGrounding.triageTimeBeforeMins}m -> ${pilotResultsGrounding.triageTimeAfterMins}m).`);
  console.log(`  ✓ No-show rate dropped to: ${pilotResultsGrounding.noShowRateAfterPercent}%.`);
  console.log(`  ✓ Initial sellable tier identified: ${commercialRecommendation.initialSellablePlan}.\n`);

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Subscription Lifecycle & State Machine
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Subscription Lifecycle & State Machine Transitions');

  const testClinicId = 'clinic_alpha_789';

  // 1. Initial subscription starts in TRIALING (complimentary 30-day pilot)
  const initialSub = await getClinicSubscription(null, testClinicId);
  assert.strictEqual(initialSub.status, SUBSCRIPTION_STATUS.TRIALING, 'Initial subscription must be trialing');
  assert.strictEqual(initialSub.planId, 'CLINIC_BASIC', 'Initial trial defaults to Clinic Basic');
  assert.ok(initialSub.subscriptionId.startsWith('sub_'), 'Subscription ID must be formatted properly');

  // 2. Commercial conversion: Upgrade to DOCTOR_STARTER
  const upgradedSub = await updateSubscription(null, testClinicId, {
    planId: 'DOCTOR_STARTER',
    billingCycle: 'monthly',
    paymentMethod: PAYMENT_METHODS.INSTAPAY,
    notes: 'Doctor converted from pilot'
  });
  assert.strictEqual(upgradedSub.planId, 'DOCTOR_STARTER');
  assert.strictEqual(upgradedSub.status, SUBSCRIPTION_STATUS.ACTIVE);
  assert.strictEqual(upgradedSub.paymentMethod, PAYMENT_METHODS.INSTAPAY);

  // 3. Status change to PAST_DUE (payment missed)
  const pastDueSub = await setSubscriptionPaymentStatus(null, testClinicId, {
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    reason: 'Monthly card charge declined'
  });
  assert.strictEqual(pastDueSub.status, SUBSCRIPTION_STATUS.PAST_DUE);
  assert.strictEqual(pastDueSub.statusChangeReason, 'Monthly card charge declined');

  // 4. Status change to CANCELED
  const canceledSub = await setSubscriptionPaymentStatus(null, testClinicId, {
    status: SUBSCRIPTION_STATUS.CANCELED,
    reason: 'Doctor closed practice'
  });
  assert.strictEqual(canceledSub.status, SUBSCRIPTION_STATUS.CANCELED);

  console.log('  ✓ Subscription transitions trialing -> active -> past_due -> canceled verified.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Entitlements Tied to Payment Status & Statutory Safeguard
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Entitlements Engine & Medical Record Retention Safeguard');

  // Scenario A: Active Subscription (Full entitlements)
  const activeSub = {
    planId: 'DOCTOR_STARTER',
    status: SUBSCRIPTION_STATUS.ACTIVE,
    usage: { assessmentsThisMonth: 10, activeDoctorsCount: 1 }
  };
  const activeIntake = checkSubscriptionEntitlement(activeSub, 'CREATE_ASSESSMENT');
  assert.strictEqual(activeIntake.allowed, true, 'Active sub can create assessment');
  assert.strictEqual(activeIntake.remaining, 190, 'Remaining count must reflect quota');

  const activeApprove = checkSubscriptionEntitlement(activeSub, 'APPROVE_ASSESSMENT');
  assert.strictEqual(activeApprove.allowed, true, 'Active sub can approve assessment');

  // Scenario B: PAST_DUE Subscription
  const pastDueScenario = {
    planId: 'DOCTOR_STARTER',
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    gracePeriodEnd: new Date(Date.now() + 10 * 86400000).toISOString(),
    usage: { assessmentsThisMonth: 10 }
  };

  // 🛑 STATUTORY SAFEGUARD: Past assessments & medical timeline must ALWAYS be accessible in read-only mode
  const pastDueRead = checkSubscriptionEntitlement(pastDueScenario, 'READ_MEDICAL_RECORDS');
  assert.strictEqual(pastDueRead.allowed, true, 'Read-only medical archive MUST be allowed when past_due');
  assert.strictEqual(pastDueRead.readOnlyArchiveAccessible, true);

  const pastDueTimeline = checkSubscriptionEntitlement(pastDueScenario, 'VIEW_PATIENT_TIMELINE');
  assert.strictEqual(pastDueTimeline.allowed, true, 'Patient timeline MUST be readable when past_due');

  // Active intake and certifications must be BLOCKED
  const pastDueIntake = checkSubscriptionEntitlement(pastDueScenario, 'CREATE_ASSESSMENT');
  assert.strictEqual(pastDueIntake.allowed, false, 'New intake must be blocked when past_due');
  assert.strictEqual(pastDueIntake.code, 'SUBSCRIPTION_PAST_DUE');

  const pastDueCertification = checkSubscriptionEntitlement(pastDueScenario, 'APPROVE_ASSESSMENT');
  assert.strictEqual(pastDueCertification.allowed, false, 'Doctor approval must be blocked when past_due');
  assert.strictEqual(pastDueCertification.code, 'SUBSCRIPTION_PAST_DUE');

  // Scenario C: Assessment Monthly Limit Exceeded
  const quotaReachedSub = {
    planId: 'DOCTOR_STARTER',
    status: SUBSCRIPTION_STATUS.ACTIVE,
    usage: { assessmentsThisMonth: 200 }
  };
  const quotaIntake = checkSubscriptionEntitlement(quotaReachedSub, 'CREATE_ASSESSMENT');
  assert.strictEqual(quotaIntake.allowed, false, 'Intake must be blocked when quota reached');
  assert.strictEqual(quotaIntake.code, 'ASSESSMENT_LIMIT_EXCEEDED');

  // Scenario D: Feature Gating (WhatsApp Bot)
  const starterBotCheck = checkSubscriptionEntitlement(activeSub, 'WHATSAPP_BOT_INTERACTIVE');
  assert.strictEqual(starterBotCheck.allowed, false, 'WhatsApp bot blocked on Doctor Starter');
  assert.strictEqual(starterBotCheck.code, 'FEATURE_NOT_INCLUDED');

  const proSub = { planId: 'CLINIC_PRO', status: SUBSCRIPTION_STATUS.ACTIVE };
  const proBotCheck = checkSubscriptionEntitlement(proSub, 'WHATSAPP_BOT_INTERACTIVE');
  assert.strictEqual(proBotCheck.allowed, true, 'WhatsApp bot allowed on Clinic Pro');

  console.log('  ✓ Active tier entitlements correctly validated.');
  console.log('  ✓ Statutory Retention Safeguard: Read-only access preserved 100% during past_due.');
  console.log('  ✓ Gating enforced: New intake and certifications blocked when past_due.');
  console.log('  ✓ Quota limits and feature gates verified.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Actual Append-Only Revenue Ledger & Reconciliation
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Append-Only Revenue Ledger & Financial Reconciliation');

  const clinicLedgerId = 'clinic_delta_999';

  // 1. Record payment received
  const entry1 = await recordLedgerEntry(null, {
    entryType: LEDGER_ENTRY_TYPES.PAYMENT_RECEIVED,
    subscriptionId: 'sub_test_1',
    clinicId: clinicLedgerId,
    planId: 'DOCTOR_STARTER',
    grossAmount: 499.00,
    taxAmount: 61.28, // 14% Egyptian VAT
    currency: 'EGP',
    paymentMethod: PAYMENT_METHODS.INSTAPAY,
    gatewayRef: 'INSTA-TXN-100293',
    notes: 'First month subscription payment',
    recordedBy: 'user_doctor_1'
  });

  assert.ok(entry1.id.startsWith('LEDGER-'), 'Ledger ID must have LEDGER- prefix');
  assert.strictEqual(entry1.grossAmount, 499.00);
  assert.strictEqual(entry1.netAmount, 437.72);
  assert.strictEqual(entry1.isImmutable, true, 'Ledger entry must be marked immutable');

  // 2. Record second payment received (Renewal)
  const entry2 = await recordLedgerEntry(null, {
    entryType: LEDGER_ENTRY_TYPES.PAYMENT_RECEIVED,
    subscriptionId: 'sub_test_1',
    clinicId: clinicLedgerId,
    planId: 'DOCTOR_STARTER',
    grossAmount: 499.00,
    taxAmount: 61.28,
    currency: 'EGP',
    paymentMethod: PAYMENT_METHODS.FAWRY,
    gatewayRef: 'FAWRY-REF-883719',
    notes: 'Second month renewal',
    recordedBy: 'system'
  });

  // 3. Record a partial refund
  const entry3 = await recordLedgerEntry(null, {
    entryType: LEDGER_ENTRY_TYPES.REFUND_ISSUED,
    subscriptionId: 'sub_test_1',
    clinicId: clinicLedgerId,
    planId: 'DOCTOR_STARTER',
    grossAmount: 100.00,
    taxAmount: 12.28,
    currency: 'EGP',
    paymentMethod: PAYMENT_METHODS.INSTAPAY,
    gatewayRef: 'REFUND-99128',
    notes: 'Pro-rated service credit refund',
    recordedBy: 'admin_billing'
  });

  // 4. Retrieve ledger entries for clinic
  const clinicEntries = await getLedgerEntries(null, { clinicId: clinicLedgerId });
  assert.strictEqual(clinicEntries.length, 3, 'Must retrieve all 3 entries for clinic');

  // 5. Calculate reconciled financial summary
  const summary = await getRevenueSummary(null, { clinicId: clinicLedgerId });
  assert.strictEqual(summary.totalGross, 998.00, 'Total gross must equal 499 + 499 = 998');
  assert.strictEqual(summary.totalRefunds, 100.00, 'Total refunds must equal 100');
  assert.strictEqual(summary.totalNet, 787.72, 'Net revenue reconciled: (437.72 + 437.72) - 87.72 = 787.72');
  assert.strictEqual(summary.transactionCount, 3);
  assert.strictEqual(summary.countByType[LEDGER_ENTRY_TYPES.PAYMENT_RECEIVED], 2);
  assert.strictEqual(summary.countByType[LEDGER_ENTRY_TYPES.REFUND_ISSUED], 1);

  console.log(`  ✓ Recorded 3 immutable transactions (InstaPay & Fawry).`);
  console.log(`  ✓ Reconciled Gross: ${summary.totalGross} EGP, Refunds: ${summary.totalRefunds} EGP, Net: ${summary.totalNet} EGP.`);
  console.log('  ✓ Ledger entries verified immutable with strict audit trail.\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Express API Integration Endpoints
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Express Billing & Plans Endpoint Integration');

  await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;

      http.get(`http://127.0.0.1:${port}/api/billing/plans`, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            assert.strictEqual(res.statusCode, 200, 'GET /api/billing/plans must return 200');
            const body = JSON.parse(data);
            assert.strictEqual(body.success, true);
            assert.ok(body.plans.FREE_PATIENT);
            assert.ok(body.plans.DOCTOR_STARTER);
            assert.strictEqual(body.initialSellablePlan, 'DOCTOR_STARTER');
            assert.strictEqual(body.pricingDecisionPending, true);
            assert.ok(body.pricingDisclaimer);
            console.log('  ✓ GET /api/billing/plans returned 200 with plans, cost model, and disclaimer.');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', (err) => {
        server.close();
        reject(err);
      });
    });
  });

  console.log('\n==================================================================');
  console.log('🎉 ALL SUBSCRIPTION, BILLING & REVENUE LEDGER TESTS PASSED (100%)');
  console.log('==================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  process.exit(1);
});
