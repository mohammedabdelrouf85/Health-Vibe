/**
 * Health Vibe AI - Clinical Metric Calculation Engine
 * 
 * Computes:
 * 1. Confusion Matrix (TP, FP, TN, FN)
 * 2. Diagnostic Performance (Sensitivity, Specificity, PPV, NPV) with Wilson 95% CIs
 * 3. Discrimination (ROC-AUC via Wilcoxon-Mann-Whitney & Trapezoidal integration)
 * 4. Calibration (Brier Score, Expected Calibration Error [ECE], Calibration Curve Bins)
 * 
 * SCIENTIFIC APPLICABILITY GUARD:
 * Metrics are calculated ONLY where scientifically applicable and supported by data.
 * When preconditions (e.g. presence of both positive and negative cases, well-defined probabilities)
 * are not satisfied, returns explicit reason and null value rather than deceptive or invalid metrics.
 */

(function (global) {
  "use strict";

  /**
   * Calculates Wilson score confidence interval for a proportion.
   * @param {number} successes
   * @param {number} trials
   * @param {number} z e.g. 1.96 for 95% CI
   */
  function calculateWilsonCi(successes, trials, z = 1.96) {
    if (trials <= 0) return { lower: null, upper: null };
    const p = successes / trials;
    const z2 = z * z;
    const denom = 1 + z2 / trials;
    const center = p + z2 / (2 * trials);
    const rad = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
    return {
      lower: Number(Math.max(0, (center - rad) / denom).toFixed(4)),
      upper: Number(Math.min(1, (center + rad) / denom).toFixed(4))
    };
  }

  /**
   * Computes 2x2 confusion matrix for binary outcome.
   * @param {Array<number>} yTrue Array of 0 or 1
   * @param {Array<number>} yPred Array of 0 or 1
   */
  function calculateConfusionMatrix(yTrue, yPred) {
    if (!Array.isArray(yTrue) || !Array.isArray(yPred) || yTrue.length !== yPred.length) {
      throw new Error("yTrue and yPred must be arrays of equal length");
    }

    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const actual = Number(yTrue[i]);
      const pred = Number(yPred[i]);
      if (actual === 1 && pred === 1) tp++;
      else if (actual === 0 && pred === 1) fp++;
      else if (actual === 0 && pred === 0) tn++;
      else if (actual === 1 && pred === 0) fn++;
    }

    return {
      tp,
      fp,
      tn,
      fn,
      total: yTrue.length,
      actualPositive: tp + fn,
      actualNegative: tn + fp,
      predictedPositive: tp + fp,
      predictedNegative: tn + fn
    };
  }

  /**
   * Computes clinical diagnostic metrics (Sensitivity, Specificity, PPV, NPV).
   * Guards against zero denominators with explicit scientific applicability metadata.
   * @param {object} matrix Output of calculateConfusionMatrix
   */
  function calculateDiagnosticMetrics(matrix) {
    const { tp, fp, tn, fn, actualPositive, actualNegative, predictedPositive, predictedNegative } = matrix;

    // 1. Sensitivity (Recall)
    const sensApplicable = actualPositive > 0;
    const sensitivity = sensApplicable ? tp / actualPositive : null;
    const sensCi = sensApplicable ? calculateWilsonCi(tp, actualPositive) : { lower: null, upper: null };

    // 2. Specificity
    const specApplicable = actualNegative > 0;
    const specificity = specApplicable ? tn / actualNegative : null;
    const specCi = specApplicable ? calculateWilsonCi(tn, actualNegative) : { lower: null, upper: null };

    // 3. Positive Predictive Value (PPV / Precision)
    const ppvApplicable = predictedPositive > 0;
    const ppv = ppvApplicable ? tp / predictedPositive : null;
    const ppvCi = ppvApplicable ? calculateWilsonCi(tp, predictedPositive) : { lower: null, upper: null };

    // 4. Negative Predictive Value (NPV)
    const npvApplicable = predictedNegative > 0;
    const npv = npvApplicable ? tn / predictedNegative : null;
    const npvCi = npvApplicable ? calculateWilsonCi(tn, predictedNegative) : { lower: null, upper: null };

    return {
      sensitivity: {
        applicable: sensApplicable,
        value: sensitivity !== null ? Number(sensitivity.toFixed(4)) : null,
        percentage: sensitivity !== null ? `${(sensitivity * 100).toFixed(1)}%` : "N/A",
        ci95: sensCi,
        reason: sensApplicable ? null : "No actual positive ground-truth cases present"
      },
      specificity: {
        applicable: specApplicable,
        value: specificity !== null ? Number(specificity.toFixed(4)) : null,
        percentage: specificity !== null ? `${(specificity * 100).toFixed(1)}%` : "N/A",
        ci95: specCi,
        reason: specApplicable ? null : "No actual negative ground-truth cases present"
      },
      ppv: {
        applicable: ppvApplicable,
        value: ppv !== null ? Number(ppv.toFixed(4)) : null,
        percentage: ppv !== null ? `${(ppv * 100).toFixed(1)}%` : "N/A",
        ci95: ppvCi,
        reason: ppvApplicable ? null : "No positive predictions made (predictedPositive = 0)"
      },
      npv: {
        applicable: npvApplicable,
        value: npv !== null ? Number(npv.toFixed(4)) : null,
        percentage: npv !== null ? `${(npv * 100).toFixed(1)}%` : "N/A",
        ci95: npvCi,
        reason: npvApplicable ? null : "No negative predictions made (predictedNegative = 0)"
      }
    };
  }

  /**
   * Computes Receiver Operating Characteristic Area Under Curve (ROC-AUC).
   * Applicable ONLY when both positive and negative classes exist.
   * @param {Array<number>} yTrue Array of 0 or 1
   * @param {Array<number>} yScores Array of continuous risk scores or probabilities
   */
  function calculateRocAuc(yTrue, yScores) {
    if (!Array.isArray(yTrue) || !Array.isArray(yScores) || yTrue.length !== yScores.length) {
      return { applicable: false, value: null, reason: "Arrays must be non-empty and of equal length" };
    }

    if (yTrue.length < 2) {
      return { applicable: false, value: null, reason: "Sample size too small for ROC calculation (N < 2)" };
    }

    let nPos = 0, nNeg = 0;
    const paired = [];
    for (let i = 0; i < yTrue.length; i++) {
      const y = Number(yTrue[i]);
      const s = Number(yScores[i]);
      if (!Number.isFinite(s)) {
        return { applicable: false, value: null, reason: "Non-finite score encountered in yScores" };
      }
      if (y === 1) nPos++;
      else if (y === 0) nNeg++;
      else {
        return { applicable: false, value: null, reason: `Invalid ground truth label: ${yTrue[i]} (must be 0 or 1)` };
      }
      paired.push({ y, score: s });
    }

    // Precondition: Both classes must be present
    if (nPos === 0) {
      return { applicable: false, value: null, reason: "ROC-AUC is scientifically inapplicable: no positive cases exist (nPos = 0)" };
    }
    if (nNeg === 0) {
      return { applicable: false, value: null, reason: "ROC-AUC is scientifically inapplicable: no negative cases exist (nNeg = 0)" };
    }

    // Sort by score ascending to compute Wilcoxon-Mann-Whitney rank sum
    paired.sort((a, b) => a.score - b.score);

    let rankSumPos = 0;
    let i = 0;
    while (i < paired.length) {
      let j = i;
      // Handle ties by averaging ranks
      while (j < paired.length - 1 && paired[j + 1].score === paired[i].score) {
        j++;
      }
      const tiedCount = j - i + 1;
      const averageRank = i + 1 + (tiedCount - 1) / 2; // 1-indexed
      for (let k = i; k <= j; k++) {
        if (paired[k].y === 1) {
          rankSumPos += averageRank;
        }
      }
      i = j + 1;
    }

    // U = R_pos - nPos * (nPos + 1) / 2
    const uStatistic = rankSumPos - (nPos * (nPos + 1)) / 2;
    const auc = uStatistic / (nPos * nNeg);

    // Compute curve points for inspection (FPR, TPR)
    const thresholds = Array.from(new Set(paired.map(p => p.score))).sort((a, b) => b - a);
    const rocPoints = [{ fpr: 0, tpr: 0, threshold: Infinity }];
    for (const thresh of thresholds) {
      let curTp = 0, curFp = 0;
      for (const p of paired) {
        if (p.score >= thresh) {
          if (p.y === 1) curTp++;
          else curFp++;
        }
      }
      rocPoints.push({
        fpr: Number((curFp / nNeg).toFixed(4)),
        tpr: Number((curTp / nPos).toFixed(4)),
        threshold: thresh
      });
    }
    rocPoints.push({ fpr: 1, tpr: 1, threshold: -Infinity });

    return {
      applicable: true,
      value: Number(auc.toFixed(4)),
      nPos,
      nNeg,
      uStatistic,
      rocPoints,
      reason: null
    };
  }

  /**
   * Computes Calibration Metrics:
   * 1. Brier Score: mean squared error between probabilities and binary labels
   * 2. Expected Calibration Error (ECE)
   * 3. Maximum Calibration Error (MCE)
   * 4. Binned Calibration Curve
   * @param {Array<number>} yTrue Array of 0 or 1
   * @param {Array<number>} yProbs Array of probabilities in [0.0, 1.0]
   * @param {number} numBins Default 5 bins (0.2 width)
   */
  function calculateCalibration(yTrue, yProbs, numBins = 5) {
    if (!Array.isArray(yTrue) || !Array.isArray(yProbs) || yTrue.length !== yProbs.length) {
      return { applicable: false, brierScore: null, ece: null, reason: "Arrays must be non-empty and of equal length" };
    }

    if (yTrue.length === 0) {
      return { applicable: false, brierScore: null, ece: null, reason: "Sample size is 0" };
    }

    let brierSum = 0;
    const n = yTrue.length;

    // Validate probabilities
    for (let i = 0; i < n; i++) {
      const y = Number(yTrue[i]);
      const p = Number(yProbs[i]);
      if (y !== 0 && y !== 1) {
        return { applicable: false, brierScore: null, ece: null, reason: `Invalid label at index ${i}: ${yTrue[i]}` };
      }
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        return { applicable: false, brierScore: null, ece: null, reason: `Invalid probability at index ${i}: ${yProbs[i]} (must be in [0, 1])` };
      }
      brierSum += Math.pow(p - y, 2);
    }

    const brierScore = brierSum / n;

    // Binned calibration evaluation
    const bins = [];
    const binSize = 1.0 / numBins;
    for (let b = 0; b < numBins; b++) {
      const lower = b * binSize;
      const upper = (b + 1) * binSize;
      bins.push({
        binIndex: b,
        lower: Number(lower.toFixed(2)),
        upper: Number(upper.toFixed(2)),
        count: 0,
        probSum: 0,
        trueSum: 0
      });
    }

    for (let i = 0; i < n; i++) {
      const p = yProbs[i];
      const y = yTrue[i];
      let binIdx = Math.floor(p / binSize);
      if (binIdx >= numBins) binIdx = numBins - 1; // edge case for p = 1.0
      bins[binIdx].count++;
      bins[binIdx].probSum += p;
      bins[binIdx].trueSum += y;
    }

    let eceSum = 0;
    let maxCalibrationError = 0;
    const curveBins = [];

    for (const b of bins) {
      if (b.count > 0) {
        const meanPred = b.probSum / b.count;
        const observedRate = b.trueSum / b.count;
        const absDiff = Math.abs(observedRate - meanPred);
        eceSum += (b.count / n) * absDiff;
        if (absDiff > maxCalibrationError) {
          maxCalibrationError = absDiff;
        }
        curveBins.push({
          binRange: `[${b.lower}, ${b.upper}]`,
          count: b.count,
          meanPredictedProbability: Number(meanPred.toFixed(4)),
          observedEventRate: Number(observedRate.toFixed(4)),
          calibrationGap: Number(absDiff.toFixed(4))
        });
      } else {
        curveBins.push({
          binRange: `[${b.lower}, ${b.upper}]`,
          count: 0,
          meanPredictedProbability: null,
          observedEventRate: null,
          calibrationGap: null
        });
      }
    }

    return {
      applicable: true,
      brierScore: Number(brierScore.toFixed(4)),
      ece: Number(eceSum.toFixed(4)),
      mce: Number(maxCalibrationError.toFixed(4)),
      sampleCount: n,
      curveBins,
      reason: null
    };
  }

  const MetricsEngine = {
    calculateWilsonCi,
    calculateConfusionMatrix,
    calculateDiagnosticMetrics,
    calculateRocAuc,
    calculateCalibration
  };

  global.HealthVibesMetrics = MetricsEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MetricsEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
