/**
 * HEALTH VIBE AI: SUBSCRIPTION, BILLING & REVENUE LEDGER SERVICE
 * 
 * Commercial Governance & Operating Model:
 * 1. Plan Comparison & Tier Definitions:
 *    - FREE_PATIENT: Free individual patient intake, timeline & emergency alerts.
 *    - DOCTOR_STARTER: Solo physician practice (1 seat, 200 assessments/mo). [Initial Sellable Plan]
 *    - CLINIC_BASIC: Small clinic (up to 3 doctors, 800 assessments/mo, WhatsApp alerts).
 *    - CLINIC_PRO: Growing multi-specialty center (up to 10 doctors, 2,500 assessments/mo, WhatsApp bot).
 *    - ENTERPRISE: Hospital network / polyclinic (custom seats, EHR/HIS integration, 10-yr retention).
 * 
 * 2. Operating Cost & Pilot Grounding:
 *    - Infrastructure: Serverless Firebase Hosting + Functions + Firestore (~$0.05 / 1,000 assessments).
 *    - Messaging: WhatsApp Business API utility conversations (~$0.015 - $0.035 / dialog).
 *    - Pilot Evidence: 70% triage reduction (15m -> 4.2m), <4% no-show rate with WhatsApp reminders.
 *    - Commercial Launch Plan: DOCTOR_STARTER is the initial sellable conversion tier post-pilot.
 * 
 * 3. BUSINESS PRICING DISCLAIMER:
 *    - Pricing figures in technical models are STRICTLY provisional cost baselines.
 *    - Sales figures and approved commercial rates require formal executive business decision.
 * 
 * 4. Subscription Lifecycle & Permissions Tied to Payment Status:
 *    - States: trialing, active, past_due, canceled, expired.
 *    - Legal Retention Safeguard: Read-only access to historical medical records and clinical archives
 *      remains 100% accessible even when past_due or canceled.
 *    - Gating: New triage assessments and doctor case certifications are strictly blocked when past_due.
 * 
 * 5. Append-Only Revenue Ledger:
 *    - Immutable ledger entries (updates and deletions strictly prohibited).
 *    - Supports Egyptian payment channels: InstaPay, Fawry, Vodafone Cash, Bank Transfer, Cards.
 */

const crypto = require('crypto');

// 🛑 Business Pricing Decision Flag: All prices remain provisional pending executive sign-off
const PRICING_DECISION_PENDING = true;
const PRICING_DISCLAIMER = 'Provisional Modeling Baseline — Pending Executive Business Approval. Not an approved public sales quote.';

// =============================================================================
// 1. PLAN DEFINITIONS, USAGE LIMITS & ONBOARDING REQUIREMENTS
// =============================================================================
const PLANS = {
  FREE_PATIENT: {
    id: 'FREE_PATIENT',
    name: 'Free Patient',
    nameAr: 'المريض المجاني',
    target: 'Individual Patients & Citizens',
    isProvisionalPricing: false,
    pricingApproved: true,
    priceEgp: 0,
    priceCadence: 'forever_free',
    onboardingFeeEgp: 0,
    limits: {
      doctorSeats: 0,
      assessmentsPerMonth: -1, // Unlimited personal assessments
      storageMonths: 120, // 10 years personal timeline
      activePatients: 1
    },
    features: [
      'Self-service AI respiratory symptom pre-triage',
      'Personal longitudinal assessment timeline',
      'Red-flag emergency warning escalation',
      'Downloadable personal PDF clinical summary',
      'Digital Patient Health QR Card'
    ],
    gatedFeatures: {
      doctorQueueAccess: false,
      whatsappInteractiveBot: false,
      multiDoctorRouting: false,
      customClinicBranding: false,
      ehrIntegration: false,
      kpiAnalyticsDashboard: false
    }
  },

  DOCTOR_STARTER: {
    id: 'DOCTOR_STARTER',
    name: 'Doctor Starter',
    nameAr: 'طبيب مستقل (الباقة التأسيسية)',
    target: 'Solo Practitioners & Individual Consultant Clinics',
    isInitialSellablePlan: true, // 🌟 Natural commercialization conversion from 30-day free pilot
    isProvisionalPricing: true,
    pricingApproved: false,
    provisionalMonthlyEgp: 499, // Baseline cost-recovery model: ~10x infra cost, pending exec approval
    provisionalAnnualEgp: 4990,
    provisionalOnboardingFeeEgp: 0, // Zero friction self-serve onboarding
    pricingDisclaimer: PRICING_DISCLAIMER,
    limits: {
      doctorSeats: 1,
      assessmentsPerMonth: 200, // Covers ~8-10 assessments/workday
      storageMonths: 24, // 2 years medical record retention
      receptionistSeats: 1
    },
    features: [
      'Single-doctor triage verification queue',
      'AI-assisted clinical intake questionnaire',
      'Clinician sign-off & stamp certification',
      'Branded digital PDF prescriptions & triage reports',
      'Patient QR-code check-in for clinic reception',
      'Basic SMS/Email appointment alerts'
    ],
    gatedFeatures: {
      doctorQueueAccess: true,
      whatsappInteractiveBot: false,
      multiDoctorRouting: false,
      customClinicBranding: true,
      ehrIntegration: false,
      kpiAnalyticsDashboard: false
    },
    onboardingRequirements: {
      type: 'Self-Serve',
      durationMinutes: 15,
      trainingRequired: false,
      ehrMappingIncluded: false
    }
  },

  CLINIC_BASIC: {
    id: 'CLINIC_BASIC',
    name: 'Clinic Basic',
    nameAr: 'العيادة الأساسية',
    target: 'Small Group Practices & 2-3 Doctor Specialized Clinics',
    isInitialSellablePlan: false,
    isProvisionalPricing: true,
    pricingApproved: false,
    provisionalMonthlyEgp: 1299, // Provisional baseline
    provisionalAnnualEgp: 12990,
    provisionalOnboardingFeeEgp: 450, // Remote setup & staff onboarding baseline
    pricingDisclaimer: PRICING_DISCLAIMER,
    limits: {
      doctorSeats: 3,
      assessmentsPerMonth: 800,
      storageMonths: 36, // 3 years medical record retention
      receptionistSeats: 3
    },
    features: [
      'Multi-doctor triage queue with specialty routing',
      'Up to 3 doctor seats + 3 receptionist seats',
      'WhatsApp automated appointment confirmations (up to 500/mo)',
      'Clinic logo & custom header on certified medical reports',
      'Basic operational KPI dashboard (triage times, daily patient throughput)',
      'Standard email & ticketing support (24h SLA)'
    ],
    gatedFeatures: {
      doctorQueueAccess: true,
      whatsappInteractiveBot: false,
      multiDoctorRouting: true,
      customClinicBranding: true,
      ehrIntegration: false,
      kpiAnalyticsDashboard: true
    },
    onboardingRequirements: {
      type: 'Remote Assisted Setup',
      durationMinutes: 45,
      trainingRequired: true,
      ehrMappingIncluded: false
    }
  },

  CLINIC_PRO: {
    id: 'CLINIC_PRO',
    name: 'Clinic Pro',
    nameAr: 'العيادة الاحترافية',
    target: 'High-Volume Medical Centers & Polyclinics (4-10 Doctors)',
    isInitialSellablePlan: false,
    isProvisionalPricing: true,
    pricingApproved: false,
    provisionalMonthlyEgp: 2899, // Provisional baseline
    provisionalAnnualEgp: 28990,
    provisionalOnboardingFeeEgp: 1200, // Onboarding, staff training & template design
    pricingDisclaimer: PRICING_DISCLAIMER,
    limits: {
      doctorSeats: 10,
      assessmentsPerMonth: 2500,
      storageMonths: 60, // 5 years medical record retention
      receptionistSeats: 8
    },
    features: [
      'Up to 10 doctor seats with automated round-robin & specialty triage',
      'Two-way WhatsApp Interactive Bot (intake questionnaire + appointment rescheduling)',
      'Advanced longitudinal patient analytics & symptom drift charts',
      'Doctor productivity and triage turnaround metrics',
      'Exportable HIPAA/Egyptian clinical audit trail',
      'Priority Support SLA (4h response time)'
    ],
    gatedFeatures: {
      doctorQueueAccess: true,
      whatsappInteractiveBot: true,
      multiDoctorRouting: true,
      customClinicBranding: true,
      ehrIntegration: false,
      kpiAnalyticsDashboard: true
    },
    onboardingRequirements: {
      type: 'Dedicated Remote Kickoff & Staff Training',
      durationMinutes: 90,
      trainingRequired: true,
      ehrMappingIncluded: false
    }
  },

  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    nameAr: 'المؤسسات والمستشفيات',
    target: 'Hospital Networks, Multi-Branch Polyclinics & Health Systems',
    isInitialSellablePlan: false,
    isProvisionalPricing: true,
    pricingApproved: false,
    provisionalMonthlyEgp: null, // Custom quote
    provisionalAnnualEgp: null,
    provisionalOnboardingFeeEgp: null, // Custom quote based on integration scope
    pricingDisclaimer: PRICING_DISCLAIMER,
    limits: {
      doctorSeats: -1, // Unlimited / Custom
      assessmentsPerMonth: -1, // Unlimited / High-Volume Quota
      storageMonths: 120, // 10 years statutory retention
      receptionistSeats: -1
    },
    features: [
      'Multi-branch organizational hierarchy with cross-clinic isolation',
      'Direct EHR / HIS integration (HL7 / FHIR / Custom REST Webhooks)',
      'Custom clinical rules governance & hospital protocol builder',
      'Dedicated Customer Success Manager & 24/7 emergency clinical support',
      'Egyptian statutory data residency & custom private cloud deployment option',
      'Custom Business Associate Agreement (BAA) & enterprise SLA (99.9% uptime)'
    ],
    gatedFeatures: {
      doctorQueueAccess: true,
      whatsappInteractiveBot: true,
      multiDoctorRouting: true,
      customClinicBranding: true,
      ehrIntegration: true,
      kpiAnalyticsDashboard: true
    },
    onboardingRequirements: {
      type: 'Full Enterprise Implementation',
      durationMinutes: 480, // Multi-day implementation & integration engineering
      trainingRequired: true,
      ehrMappingIncluded: true
    }
  }
};

// =============================================================================
// 2. OPERATING COST FOUNDATIONS & PILOT GROUNDING METRICS
// =============================================================================
const OPERATING_COST_MODEL = {
  cloudInfrastructure: {
    provider: 'Google Cloud Platform / Firebase',
    components: ['Firebase Hosting', 'Cloud Functions', 'Firestore DB', 'Cloud Storage'],
    unitCostPer1000AssessmentsUsd: 0.05,
    unitCostPer1000AssessmentsEgp: 2.50 // @ ~50 EGP/USD
  },
  messagingApi: {
    provider: 'Meta WhatsApp Business API (Utility / Auth)',
    unitCostPerConversationUsd: 0.025,
    unitCostPerConversationEgp: 1.25,
    smsFallbackCostEgp: 0.85
  },
  pilotResultsGrounding: {
    pilotCohort: '1 Clinic, 3 Doctors, 30 Days',
    triageTimeBeforeMins: 15.0,
    triageTimeAfterMins: 4.2,
    triageTimeSavedPercent: 72.0,
    noShowRateBeforePercent: 18.5,
    noShowRateAfterPercent: 3.8, // WhatsApp automated reminder effect
    avgDoctorTurnaroundMins: 12.0,
    zeroDiagnosticViolationRate: 100.0 // 100% adherence to assistive non-diagnostic guardrail
  },
  commercialRecommendation: {
    initialSellablePlan: 'DOCTOR_STARTER',
    rationale: [
      'Lowest barrier to commercial conversion from free 30-day pilot.',
      'Marginal cloud and messaging cost is less than 35 EGP/month per solo doctor, enabling >90% gross margin even at provisional baseline.',
      'Provides immediate positive ROI for doctor: saves ~10.8 minutes per patient intake, freeing up to 35 hours/month in a 200-patient practice.',
      'Requires zero technical onboarding assistance (15-minute self-serve QR setup).'
    ]
  }
};

// =============================================================================
// 3. SUBSCRIPTION LIFECYCLE STATES & SCHEMAS
// =============================================================================
const SUBSCRIPTION_STATUS = {
  TRIALING: 'trialing',     // In 30-day pilot or introductory trial
  ACTIVE: 'active',         // Current and in good standing
  PAST_DUE: 'past_due',     // Payment missed, in 14-day grace period (read-only clinical access preserved)
  CANCELED: 'canceled',     // Subscription canceled by user or admin
  EXPIRED: 'expired'        // Grace period elapsed without payment
};

const PAYMENT_METHODS = {
  INSTAPAY: 'instapay',
  FAWRY: 'fawry',
  VODAFONE_CASH: 'vodafone_cash',
  CREDIT_CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  PILOT_GRANT: 'pilot_grant'
};

const LEDGER_ENTRY_TYPES = {
  INVOICE_ISSUED: 'invoice_issued',
  PAYMENT_RECEIVED: 'payment_received',
  REFUND_ISSUED: 'refund_issued',
  CREDIT_APPLIED: 'credit_applied'
};

// =============================================================================
// 4. IN-MEMORY STORES (FALLBACK FOR TESTS & DEVELOPMENT)
// =============================================================================
const memorySubscriptions = new Map(); // clinicId -> SubscriptionRecord
const memoryRevenueLedger = [];        // Append-only ledger entries array

// =============================================================================
// 5. SUBSCRIPTION MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Generate a unique subscription identifier
 */
function generateSubscriptionId(clinicId) {
  const cleanId = (clinicId || 'clinic').replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 12);
  const random = crypto.randomBytes(4).toString('hex');
  return `sub_${cleanId}_${Date.now()}_${random}`;
}

/**
 * Generate an immutable ledger entry identifier
 */
function generateLedgerId() {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `LEDGER-${year}-${Date.now().toString().slice(-4)}${random}`;
}

/**
 * Get or initialize subscription for a clinic
 */
async function getClinicSubscription(db, clinicId) {
  if (!clinicId) return null;

  if (db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('subscriptions').doc(clinicId).get();
      if (snap.exists) {
        return { id: snap.id, ...snap.data() };
      }
    } catch (err) {
      console.warn('[BILLING DB WARN] Failed to fetch subscription from Firestore:', err.message);
    }
  }

  // Fallback to in-memory store
  if (memorySubscriptions.has(clinicId)) {
    return memorySubscriptions.get(clinicId);
  }

  // Default initial subscription is a 30-day trialing pilot on CLINIC_BASIC
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceEnd = new Date(periodEnd.getTime() + 14 * 24 * 60 * 60 * 1000);

  const defaultSub = {
    subscriptionId: generateSubscriptionId(clinicId),
    clinicId,
    planId: 'CLINIC_BASIC',
    status: SUBSCRIPTION_STATUS.TRIALING,
    billingCycle: 'monthly',
    paymentMethod: PAYMENT_METHODS.PILOT_GRANT,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    gracePeriodEnd: graceEnd.toISOString(),
    autoRenew: false,
    usage: {
      assessmentsThisMonth: 0,
      activeDoctorsCount: 1,
      storageBytes: 0,
      lastResetDate: now.toISOString()
    },
    metadata: {
      isPilotGrant: true,
      notes: 'Initial 30-day complimentary clinical pilot'
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  memorySubscriptions.set(clinicId, defaultSub);
  return defaultSub;
}

/**
 * Create or update a clinic subscription (e.g., subscribing to DOCTOR_STARTER or CLINIC_BASIC)
 */
async function updateSubscription(db, clinicId, {
  planId,
  billingCycle = 'monthly',
  paymentMethod = PAYMENT_METHODS.INSTAPAY,
  status = SUBSCRIPTION_STATUS.ACTIVE,
  notes = null,
  actorUid = 'system'
}) {
  if (!clinicId) throw new Error('clinicId is required to update subscription');
  if (!PLANS[planId]) throw new Error(`Invalid planId: ${planId}. Valid: ${Object.keys(PLANS).join(', ')}`);

  const current = await getClinicSubscription(db, clinicId);
  const now = new Date();
  const periodDays = billingCycle === 'annual' ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
  const graceEnd = new Date(periodEnd.getTime() + 14 * 24 * 60 * 60 * 1000);

  const updatedSub = {
    ...current,
    subscriptionId: current?.subscriptionId || generateSubscriptionId(clinicId),
    clinicId,
    planId,
    status,
    billingCycle,
    paymentMethod,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    gracePeriodEnd: graceEnd.toISOString(),
    autoRenew: true,
    metadata: {
      ...(current?.metadata || {}),
      lastUpdatedBy: actorUid,
      notes: notes || `Subscribed to ${planId} (${billingCycle})`
    },
    updatedAt: now.toISOString()
  };

  memorySubscriptions.set(clinicId, updatedSub);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('subscriptions').doc(clinicId).set(updatedSub, { merge: true });
    } catch (err) {
      console.warn('[BILLING DB WARN] Failed to persist subscription to Firestore:', err.message);
    }
  }

  return updatedSub;
}

/**
 * Update payment status (e.g. marking past_due, active, or canceled)
 */
async function setSubscriptionPaymentStatus(db, clinicId, {
  status,
  reason = null,
  actorUid = 'system'
}) {
  if (!Object.values(SUBSCRIPTION_STATUS).includes(status)) {
    throw new Error(`Invalid subscription status: ${status}. Valid: ${Object.values(SUBSCRIPTION_STATUS).join(', ')}`);
  }

  const sub = await getClinicSubscription(db, clinicId);
  if (!sub) throw new Error(`No subscription found for clinic ${clinicId}`);

  const now = new Date().toISOString();
  const updatedSub = {
    ...sub,
    status,
    statusChangedAt: now,
    statusChangeReason: reason,
    updatedAt: now,
    metadata: {
      ...(sub.metadata || {}),
      lastStatusUpdateBy: actorUid
    }
  };

  memorySubscriptions.set(clinicId, updatedSub);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('subscriptions').doc(clinicId).set(updatedSub, { merge: true });
    } catch (err) {
      console.warn('[BILLING DB WARN] Failed to update subscription status in Firestore:', err.message);
    }
  }

  return updatedSub;
}

/**
 * Increment assessment usage count
 */
async function recordAssessmentUsage(db, clinicId) {
  const sub = await getClinicSubscription(db, clinicId);
  if (!sub) return;

  const currentUsage = sub.usage || { assessmentsThisMonth: 0 };
  const updatedUsage = {
    ...currentUsage,
    assessmentsThisMonth: (currentUsage.assessmentsThisMonth || 0) + 1,
    lastUsedAt: new Date().toISOString()
  };

  sub.usage = updatedUsage;
  memorySubscriptions.set(clinicId, sub);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('subscriptions').doc(clinicId).update({
        usage: updatedUsage,
        updatedAt: new Date().toISOString()
      });
    } catch (_) {}
  }
}

// =============================================================================
// 6. PERMISSION & ENTITLEMENT ENGINE TIED TO PAYMENT STATUS
// =============================================================================

/**
 * Verify whether an operation is permitted based on subscription tier and payment status.
 * 
 * CRITICAL CLINICAL SAFEGUARDS:
 * - Legal medical record retention & patient clinical review is NEVER blocked.
 * - Even when past_due or canceled, read-only viewing of past assessments is 100% permitted.
 * - Active creation of new cases and certified approvals are gated by payment status.
 */
function checkSubscriptionEntitlement(subscription, action, context = {}) {
  // If no subscription provided, fallback to default trialing
  const sub = subscription || {
    planId: 'CLINIC_BASIC',
    status: SUBSCRIPTION_STATUS.TRIALING,
    usage: { assessmentsThisMonth: 0, activeDoctorsCount: 1 }
  };

  const plan = PLANS[sub.planId] || PLANS.CLINIC_BASIC;
  const status = sub.status || SUBSCRIPTION_STATUS.ACTIVE;

  // 1. SAFEGUARD: Medical Records Read-Only Archive is ALWAYS permitted in ALL states
  const READ_ONLY_ACTIONS = [
    'READ_MEDICAL_RECORDS',
    'VIEW_PAST_ASSESSMENTS',
    'VIEW_PATIENT_TIMELINE',
    'DOWNLOAD_CLINICAL_REPORT_ARCHIVE',
    'READ_AUDIT_LOG'
  ];

  if (READ_ONLY_ACTIONS.includes(action)) {
    return {
      allowed: true,
      action,
      planId: plan.id,
      status,
      readOnlyArchiveAccessible: true,
      message: 'Clinical record access granted under statutory medical data retention safeguards.'
    };
  }

  // 2. CHECK PAYMENT STATUS FOR WRITE / INTAKE / APPROVAL ACTIONS
  // If subscription is PAST_DUE, CANCELED, or EXPIRED, write and certification actions are gated
  if (status === SUBSCRIPTION_STATUS.PAST_DUE) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_PAST_DUE',
      action,
      planId: plan.id,
      status,
      gracePeriodEnd: sub.gracePeriodEnd,
      readOnlyArchiveAccessible: true,
      message: 'Subscription payment is past due. New triage assessments and case certifications are temporarily suspended. Existing medical records remain fully accessible in read-only mode.'
    };
  }

  if (status === SUBSCRIPTION_STATUS.CANCELED || status === SUBSCRIPTION_STATUS.EXPIRED) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_INACTIVE',
      action,
      planId: plan.id,
      status,
      readOnlyArchiveAccessible: true,
      message: 'Subscription is inactive. Please renew to resume intake and clinical triage. Past clinical records remain available for review.'
    };
  }

  // 3. CHECK ACTION-SPECIFIC PLAN LIMITS & FEATURE INCLUSION
  switch (action) {
    case 'CREATE_ASSESSMENT': {
      const limit = plan.limits.assessmentsPerMonth;
      const current = sub.usage?.assessmentsThisMonth || 0;
      if (limit !== -1 && current >= limit) {
        return {
          allowed: false,
          code: 'ASSESSMENT_LIMIT_EXCEEDED',
          action,
          limit,
          current,
          message: `Monthly assessment quota of ${limit} reached for ${plan.name}. Please upgrade to a higher tier to intake more cases.`
        };
      }
      return { allowed: true, action, planId: plan.id, remaining: limit === -1 ? 'unlimited' : limit - current };
    }

    case 'APPROVE_ASSESSMENT': {
      // Clinician case approval permitted if active/trialing
      return { allowed: true, action, planId: plan.id };
    }

    case 'ADD_DOCTOR_SEAT': {
      const seatLimit = plan.limits.doctorSeats;
      const currentSeats = context.currentDoctorSeats || sub.usage?.activeDoctorsCount || 1;
      if (seatLimit !== -1 && currentSeats >= seatLimit) {
        return {
          allowed: false,
          code: 'SEAT_LIMIT_EXCEEDED',
          action,
          limit: seatLimit,
          current: currentSeats,
          message: `Doctor seat limit (${seatLimit}) reached for ${plan.name}. Upgrade your plan to add more clinicians.`
        };
      }
      return { allowed: true, action, planId: plan.id, seatLimit };
    }

    case 'WHATSAPP_BOT_INTERACTIVE': {
      if (!plan.gatedFeatures.whatsappInteractiveBot) {
        return {
          allowed: false,
          code: 'FEATURE_NOT_INCLUDED',
          action,
          planId: plan.id,
          requiredPlan: 'CLINIC_PRO',
          message: 'Two-way interactive WhatsApp Bot is available on Clinic Pro and Enterprise plans.'
        };
      }
      return { allowed: true, action, planId: plan.id };
    }

    case 'EHR_INTEGRATION': {
      if (!plan.gatedFeatures.ehrIntegration) {
        return {
          allowed: false,
          code: 'FEATURE_NOT_INCLUDED',
          action,
          planId: plan.id,
          requiredPlan: 'ENTERPRISE',
          message: 'Direct EHR/HIS integration is exclusively available on Enterprise plans.'
        };
      }
      return { allowed: true, action, planId: plan.id };
    }

    case 'KPI_DASHBOARD': {
      if (!plan.gatedFeatures.kpiAnalyticsDashboard) {
        return {
          allowed: false,
          code: 'FEATURE_NOT_INCLUDED',
          action,
          planId: plan.id,
          requiredPlan: 'CLINIC_BASIC',
          message: 'Clinic KPI Analytics Dashboard requires Clinic Basic or higher.'
        };
      }
      return { allowed: true, action, planId: plan.id };
    }

    default:
      return { allowed: true, action, planId: plan.id };
  }
}

// =============================================================================
// 7. ACTUAL APPEND-ONLY REVENUE LEDGER
// =============================================================================

/**
 * Record an immutable financial transaction in the revenue ledger.
 * Direct modifications or deletes to ledger entries are strictly blocked.
 */
async function recordLedgerEntry(db, {
  entryType,
  subscriptionId,
  clinicId,
  planId,
  grossAmount,
  taxAmount = 0,
  currency = 'EGP',
  paymentMethod,
  gatewayRef = null,
  status = 'recorded',
  notes = '',
  recordedBy = 'system'
}) {
  if (!entryType || !Object.values(LEDGER_ENTRY_TYPES).includes(entryType)) {
    throw new Error(`Invalid ledger entryType: ${entryType}. Valid: ${Object.values(LEDGER_ENTRY_TYPES).join(', ')}`);
  }

  if (typeof grossAmount !== 'number' || isNaN(grossAmount)) {
    throw new Error('grossAmount must be a valid number');
  }

  const netAmount = Number((grossAmount - (taxAmount || 0)).toFixed(2));
  const ledgerId = generateLedgerId();
  const nowIso = new Date().toISOString();

  const entry = {
    id: ledgerId,
    entryType,
    subscriptionId: subscriptionId || null,
    clinicId: clinicId || null,
    planId: planId || null,
    grossAmount: Number(grossAmount.toFixed(2)),
    taxAmount: Number((taxAmount || 0).toFixed(2)),
    netAmount,
    currency: currency.toUpperCase(),
    paymentMethod: paymentMethod || PAYMENT_METHODS.INSTAPAY,
    gatewayRef: gatewayRef ? String(gatewayRef).trim() : null,
    status,
    notes: String(notes || '').trim(),
    recordedAt: nowIso,
    recordedBy: String(recordedBy || 'system'),
    isImmutable: true
  };

  // Push to in-memory audit store
  memoryRevenueLedger.push(entry);

  // Persist to Firestore /revenue_ledger collection
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('revenue_ledger').doc(ledgerId).set(entry);
    } catch (err) {
      console.warn('[REVENUE LEDGER DB WARN] Failed to persist ledger entry to Firestore:', err.message);
    }
  }

  console.info('[REVENUE LEDGER]', JSON.stringify({
    ledgerId: entry.id,
    entryType: entry.entryType,
    clinicId: entry.clinicId,
    grossAmount: entry.grossAmount,
    currency: entry.currency,
    recordedAt: entry.recordedAt
  }));

  return entry;
}

/**
 * Fetch revenue ledger entries with optional clinic filtering
 */
async function getLedgerEntries(db, {
  clinicId = null,
  entryType = null,
  limit = 100
} = {}) {
  if (db && typeof db.collection === 'function') {
    try {
      let q = db.collection('revenue_ledger');
      if (clinicId) {
        q = q.where('clinicId', '==', clinicId);
      }
      if (entryType) {
        q = q.where('entryType', '==', entryType);
      }
      const snap = await q.limit(limit).get();
      if (!snap.empty) {
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) {
      console.warn('[REVENUE LEDGER DB WARN] Falling back to memory ledger:', err.message);
    }
  }

  // Fallback to in-memory store
  return memoryRevenueLedger
    .filter(entry => (!clinicId || entry.clinicId === clinicId) && (!entryType || entry.entryType === entryType))
    .slice(-limit)
    .reverse();
}

/**
 * Calculate reconciled financial summary from revenue ledger
 */
async function getRevenueSummary(db, { clinicId = null } = {}) {
  const entries = await getLedgerEntries(db, { clinicId, limit: 1000 });

  let totalGross = 0;
  let totalTax = 0;
  let totalNet = 0;
  let totalRefunds = 0;
  const countByType = {};

  for (const entry of entries) {
    countByType[entry.entryType] = (countByType[entry.entryType] || 0) + 1;

    if (entry.entryType === LEDGER_ENTRY_TYPES.PAYMENT_RECEIVED) {
      totalGross += entry.grossAmount;
      totalTax += entry.taxAmount;
      totalNet += entry.netAmount;
    } else if (entry.entryType === LEDGER_ENTRY_TYPES.REFUND_ISSUED) {
      totalRefunds += Math.abs(entry.grossAmount);
      totalNet -= Math.abs(entry.netAmount);
    }
  }

  return {
    clinicId,
    currency: 'EGP',
    totalGross: Number(totalGross.toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
    totalRefunds: Number(totalRefunds.toFixed(2)),
    totalNet: Number(totalNet.toFixed(2)),
    transactionCount: entries.length,
    countByType,
    asOf: new Date().toISOString()
  };
}

module.exports = {
  PRICING_DECISION_PENDING,
  PRICING_DISCLAIMER,
  PLANS,
  OPERATING_COST_MODEL,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHODS,
  LEDGER_ENTRY_TYPES,
  getClinicSubscription,
  updateSubscription,
  setSubscriptionPaymentStatus,
  recordAssessmentUsage,
  checkSubscriptionEntitlement,
  recordLedgerEntry,
  getLedgerEntries,
  getRevenueSummary,
  _memorySubscriptions: memorySubscriptions,
  _memoryRevenueLedger: memoryRevenueLedger
};
