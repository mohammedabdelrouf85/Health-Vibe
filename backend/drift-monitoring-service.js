/**
 * Health Vibe AI - Shadow Testing & Population Drift Monitoring Engine
 * 
 * Implements:
 * 1. Shadow Testing of Candidate Rules:
 *    - Evaluates candidate rules alongside active release without modifying actual clinical decisions.
 *    - Quantifies concordance, discordance patterns, and safety metrics.
 * 2. Population & Triage Drift Monitoring:
 *    - Sliding-window telemetry of vital signs (SpO2), dyspnea, and output triage distributions.
 *    - Population Stability Index (PSI) calculation.
 *    - Early warning alerts for clinical distribution shift without silently changing decisions.
 */

const { evaluateRulesWithProvenance, getRulesRegistry } = require('./clinical-rules-governance');

// Sliding Window Telemetry Buffers (In-memory ring buffers)
const MAX_TELEMETRY_WINDOW = 200;
const MAX_SHADOW_LOGS = 500;

const assessmentTelemetryBuffer = [];
const shadowEvaluationsBuffer = [];
const driftAlertsLog = [];

// Historical Baseline Distributions (Derived from Specialist-Reviewed Baseline)
const CLINICAL_BASELINE = Object.freeze({
  meanOxygenLevel: 93.5,
  hypoxemiaRate: 0.20,       // Proportion with SpO2 < 90%
  dyspneaRate: 0.42,         // Proportion with dyspnea
  severeCoughRate: 0.25,     // Proportion with severe cough
  triageDistribution: {
    urgent: 0.35,
    high: 0.35,
    normal: 0.30
  }
});

// Drift Detection Thresholds
const DRIFT_THRESHOLDS = Object.freeze({
  maxMeanOxygenDelta: 2.0,      // Max acceptable deviation in mean SpO2 (%)
  maxUrgentRateDelta: 0.15,      // Max acceptable shift in urgent triage rate (15 percentage points)
  psiModerateDrift: 0.10,        // Population Stability Index moderate warning
  psiSignificantDrift: 0.25      // Population Stability Index significant alert
});

/**
 * Executes an assessment through the active ruleset and concurrently runs candidate in shadow mode.
 * GUARANTEE: The candidate shadow run NEVER affects the clinical decision or patient routing.
 */
function processAssessmentWithShadowTesting({ input, ruleSetId = 'breathing-triage' }) {
  const reg = getRulesRegistry(ruleSetId);
  const activeVer = reg.activeVersion;

  // 1. Authoritative Clinical Execution (Active Version)
  const activeResult = evaluateRulesWithProvenance({ input, ruleSetId, version: activeVer });

  // 2. Identify Candidate Version for Shadow Testing (if candidate or approved alternative exists)
  let candidateVer = null;
  for (const [verKey, verObj] of Object.entries(reg.versions)) {
    if (verKey !== activeVer && (verObj.status === 'approved' || verObj.status === 'candidate')) {
      candidateVer = verKey;
      break;
    }
  }

  let shadowResult = null;
  if (candidateVer) {
    // 3. Shadow Execution (Read-only; Zero Impact on Clinical Output)
    const shadowEval = evaluateRulesWithProvenance({ input, ruleSetId, version: candidateVer });
    const isDiscordant = activeResult.priority !== shadowEval.priority;
    let discordanceReason = null;

    if (isDiscordant) {
      discordanceReason = `Active (${activeResult.version}) routed as '${activeResult.priority}' (${activeResult.points} pts); Shadow (${shadowEval.version}) routed as '${shadowEval.priority}' (${shadowEval.points} pts).`;
    }

    shadowResult = {
      candidateVersion: candidateVer,
      shadowPriority: shadowEval.priority,
      shadowPoints: shadowEval.points,
      isDiscordant,
      discordanceReason,
      timestamp: new Date().toISOString()
    };

    // Buffer shadow telemetry
    shadowEvaluationsBuffer.push({
      subjectId: input.subjectId || 'anonymous',
      activeVersion: activeVer,
      activePriority: activeResult.priority,
      candidateVersion: candidateVer,
      candidatePriority: shadowEval.priority,
      isDiscordant,
      discordanceReason,
      timestamp: shadowResult.timestamp
    });

    if (shadowEvaluationsBuffer.length > MAX_SHADOW_LOGS) {
      shadowEvaluationsBuffer.shift();
    }
  }

  // 4. Record Telemetry for Population Drift Monitoring
  recordAssessmentTelemetry({
    oxygenLevel: Number(input.oxygenLevel || input.o2 || 0),
    breathingDifficulty: Boolean(input.breathingDifficulty === 'yes' || input.breathingDifficulty === 'نعم' || input.hasDyspnea),
    coughLevel: String(input.coughLevel || input.coughKey || 'none'),
    priority: activeResult.priority,
    timestamp: new Date().toISOString()
  });

  return {
    authoritativeResult: activeResult,
    shadowTesting: shadowResult
  };
}

/**
 * Records individual assessment metrics to telemetry sliding window.
 */
function recordAssessmentTelemetry(telemetry) {
  if (telemetry.oxygenLevel > 0) {
    assessmentTelemetryBuffer.push(telemetry);
    if (assessmentTelemetryBuffer.length > MAX_TELEMETRY_WINDOW) {
      assessmentTelemetryBuffer.shift();
    }
  }
}

/**
 * Computes Population Stability Index (PSI) between baseline and observed triage distributions.
 * PSI = sum((Actual - Expected) * ln(Actual / Expected))
 */
function calculatePsi(expectedDist, observedDist) {
  let psi = 0;
  const categories = Object.keys(expectedDist);

  for (const cat of categories) {
    const e = expectedDist[cat] || 0.001;
    const a = observedDist[cat] !== undefined && observedDist[cat] > 0 ? observedDist[cat] : 0.001;
    psi += (a - e) * Math.log(a / e);
  }

  return Number(Math.max(0, psi).toFixed(4));
}

/**
 * Evaluates population drift across sliding window vs clinical baseline.
 * Emits alerts without silently changing any clinical decisions.
 */
function evaluatePopulationDrift() {
  const n = assessmentTelemetryBuffer.length;
  if (n < 10) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleSize: n,
      minRequired: 10,
      message: 'Insufficient telemetry samples for statistically reliable drift evaluation.'
    };
  }

  let o2Sum = 0;
  let hypoxemiaCount = 0;
  let dyspneaCount = 0;
  let severeCoughCount = 0;
  const triageCounts = { urgent: 0, high: 0, normal: 0 };

  for (const item of assessmentTelemetryBuffer) {
    o2Sum += item.oxygenLevel;
    if (item.oxygenLevel < 90) hypoxemiaCount++;
    if (item.breathingDifficulty) dyspneaCount++;
    if (item.coughLevel === 'severe') severeCoughCount++;
    if (triageCounts[item.priority] !== undefined) {
      triageCounts[item.priority]++;
    }
  }

  const observedMeanO2 = Number((o2Sum / n).toFixed(2));
  const observedHypoxemiaRate = Number((hypoxemiaCount / n).toFixed(4));
  const observedDyspneaRate = Number((dyspneaCount / n).toFixed(4));
  const observedSevereCoughRate = Number((severeCoughCount / n).toFixed(4));

  const observedTriageDist = {
    urgent: Number((triageCounts.urgent / n).toFixed(4)),
    high: Number((triageCounts.high / n).toFixed(4)),
    normal: Number((triageCounts.normal / n).toFixed(4))
  };

  const psi = calculatePsi(CLINICAL_BASELINE.triageDistribution, observedTriageDist);

  // Check Drift Triggers
  const activeAlerts = [];
  const deltaO2 = Math.abs(observedMeanO2 - CLINICAL_BASELINE.meanOxygenLevel);
  const deltaUrgent = Math.abs(observedTriageDist.urgent - CLINICAL_BASELINE.triageDistribution.urgent);

  if (deltaO2 >= DRIFT_THRESHOLDS.maxMeanOxygenDelta) {
    activeAlerts.push({
      type: 'OXYGEN_DISTRIBUTION_DRIFT',
      severity: 'WARNING',
      message: `Population mean SpO2 (${observedMeanO2}%) shifted by ${deltaO2.toFixed(1)}% from baseline (${CLINICAL_BASELINE.meanOxygenLevel}%).`,
      timestamp: new Date().toISOString()
    });
  }

  if (deltaUrgent >= DRIFT_THRESHOLDS.maxUrgentRateDelta) {
    activeAlerts.push({
      type: 'URGENT_TRIAGE_SPIKE',
      severity: 'HIGH',
      message: `Urgent triage rate (${(observedTriageDist.urgent * 100).toFixed(1)}%) shifted by ${(deltaUrgent * 100).toFixed(1)}% from baseline (${(CLINICAL_BASELINE.triageDistribution.urgent * 100).toFixed(1)}%). Possible local outbreak or sensor bias.`,
      timestamp: new Date().toISOString()
    });
  }

  let driftStatus = 'STABLE';
  if (psi >= DRIFT_THRESHOLDS.psiSignificantDrift) {
    driftStatus = 'SIGNIFICANT_DRIFT';
    activeAlerts.push({
      type: 'PSI_SIGNIFICANT_DRIFT',
      severity: 'HIGH',
      message: `Population Stability Index (PSI = ${psi}) exceeds critical threshold (0.25). Immediate clinical safety audit recommended.`,
      timestamp: new Date().toISOString()
    });
  } else if (psi >= DRIFT_THRESHOLDS.psiModerateDrift) {
    driftStatus = 'MODERATE_DRIFT';
    activeAlerts.push({
      type: 'PSI_MODERATE_DRIFT',
      severity: 'MEDIUM',
      message: `Population Stability Index (PSI = ${psi}) indicates moderate distributional shift (threshold 0.10).`,
      timestamp: new Date().toISOString()
    });
  }

  // Record to alerts log
  for (const a of activeAlerts) {
    driftAlertsLog.push(a);
  }

  return {
    status: driftStatus,
    sampleSize: n,
    observedMetrics: {
      meanOxygenLevel: observedMeanO2,
      hypoxemiaRate: observedHypoxemiaRate,
      dyspneaRate: observedDyspneaRate,
      severeCoughRate: observedSevereCoughRate,
      triageDistribution: observedTriageDist
    },
    baselineMetrics: CLINICAL_BASELINE,
    psi,
    activeAlerts,
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Returns summary report of shadow testing performance.
 */
function getShadowTestingSummary() {
  const total = shadowEvaluationsBuffer.length;
  if (total === 0) {
    return {
      status: 'NO_SHADOW_DATA',
      totalEvaluations: 0,
      concordanceRate: null,
      discordantCount: 0,
      recentLogs: []
    };
  }

  let concordant = 0;
  const discordanceBreakdown = {};

  for (const log of shadowEvaluationsBuffer) {
    if (!log.isDiscordant) {
      concordant++;
    } else {
      const type = `${log.activePriority}_to_${log.candidatePriority}`;
      discordanceBreakdown[type] = (discordanceBreakdown[type] || 0) + 1;
    }
  }

  return {
    status: 'ACTIVE_SHADOW_TESTING',
    totalEvaluations: total,
    concordantCount: concordant,
    discordantCount: total - concordant,
    concordanceRate: Number((concordant / total).toFixed(4)),
    discordanceBreakdown,
    recentLogs: shadowEvaluationsBuffer.slice(-10)
  };
}

function clearTelemetryForTesting() {
  assessmentTelemetryBuffer.length = 0;
  shadowEvaluationsBuffer.length = 0;
  driftAlertsLog.length = 0;
}

module.exports = {
  processAssessmentWithShadowTesting,
  recordAssessmentTelemetry,
  evaluatePopulationDrift,
  getShadowTestingSummary,
  calculatePsi,
  clearTelemetryForTesting,
  CLINICAL_BASELINE,
  DRIFT_THRESHOLDS
};
