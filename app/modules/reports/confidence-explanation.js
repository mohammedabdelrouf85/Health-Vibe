/**
 * Health Vibe AI - Confidence Explanation Module (Ada Health Standard)
 *
 * Implements Task #86:
 * Converts statistical ML model confidence scores into reassuring, patient-friendly
 * clinical alignment explanations post-physician approval, while preserving
 * exact numerical precision in doctor-facing cockpits, review queues, and audit trails.
 */

(function (global) {
  "use strict";

  /** Return a recorded model score only; never invent a clinical confidence value. */
  function deriveAiConfidence(c) {
    if (!c) return null;
    if (typeof c.modelConfidenceNumeric === "number" && c.modelConfidenceNumeric > 0) {
      return c.modelConfidenceNumeric;
    }
    if (typeof c.aiConfidence === "number" && c.aiConfidence > 0) {
      return c.aiConfidence;
    }
    if (typeof c.confidenceScore === "number" && c.confidenceScore > 0) {
      return c.confidenceScore;
    }
    if (typeof c.confidence === "number" && c.confidence > 0) {
      const pct = c.confidence <= 1 ? c.confidence * 100 : c.confidence;
      return pct;
    }
    return null;
  }

  /**
   * Translates model confidence score into Ada Health simplified explanation
   * @param {object|number} caseOrScore Case object or numeric score
   * @param {object} [options]
   * @param {boolean} [options.isApproved=false]
   * @param {string} [options.language='ar'] 'ar' | 'en'
   * @param {string} [options.role='patient'] 'patient' | 'doctor' | 'admin' | 'support'
   * @returns {object}
   */
  function getConfidenceExplanation(caseOrScore, options = {}) {
    const isRecord = typeof caseOrScore === "object" && caseOrScore !== null;
    const caseData = isRecord ? caseOrScore : {};
    const numericScore = typeof caseOrScore === "number" ? caseOrScore : deriveAiConfidence(caseData);

    const isApproved = typeof options.isApproved === "boolean"
      ? options.isApproved
      : (isRecord ? Boolean(caseData.status === "approved" || caseData.doctorApproved || caseData.isApproved) : false);

    const isEn = options.language === "en" || options.isEn === true;
    const role = String(options.role || "patient").toLowerCase();
    const isDoctorOrAdmin = role === "doctor" || role === "admin" || role === "super_admin";

    const reassuranceTooltipAr = "هذه العبارة تلخص نتيجة التقييم بعد مراجعة الطبيب. وهي لا تمثل تشخيصاً مستقلاً أو ضماناً لنتيجة صحية؛ اتبع توصيات طبيبك واسأله عما تحتاج إلى توضيحه.";
    const reassuranceTooltipEn = "This is a plain-language summary of the assessment after your doctor’s review. It is not a diagnosis or a guarantee; follow your doctor’s advice and ask them about anything unclear.";

    // Locked state (prior to doctor approval)
    if (!isApproved) {
      return {
        tier: "locked",
        pillClass: "pending",
        color: "#f59e0b",
        badgeText: isEn ? "Locked until doctor approval" : "مغلق حتى الاعتماد الطبي",
        badgeTextAr: "مغلق حتى الاعتماد الطبي",
        badgeTextEn: "Locked until doctor approval",
        explanation: isEn
          ? "For your safety, clinical assessment indicators and confidence alignment remain securely held until reviewed and approved by your attending physician."
          : "حفاظاً على سلامتك، تظل مخرجات التقييم ونسب التوافق الإحصائي محجوبة حتى المراجعة والاعتماد السريري الكامل من الطبيب المعالج.",
        explanationAr: "حفاظاً على سلامتك، تظل مخرجات التقييم ونسب التوافق الإحصائي محجوبة حتى المراجعة والاعتماد السريري الكامل من الطبيب المعالج.",
        explanationEn: "For your safety, clinical assessment indicators and confidence alignment remain securely held until reviewed and approved by your attending physician.",
        reassuranceTooltip: isEn ? reassuranceTooltipEn : reassuranceTooltipAr,
        reassuranceTooltipAr,
        reassuranceTooltipEn,
        patientScoreDisplay: isEn ? "Locked until approval" : "مغلق حتى الاعتماد",
        modelConfidenceNumeric: isDoctorOrAdmin ? numericScore : null,
        visibleScore: isDoctorOrAdmin && numericScore !== null ? `${numericScore}%` : null,
        isApproved: false
      };
    }

    // Patient wording is based on doctor review, never on a statistical threshold.
    if (numericScore === null || numericScore >= 70) {
      const badgeTextAr = "راجع الطبيب نتيجة التقييم";
      const badgeTextEn = "Your doctor reviewed the assessment";
      const explanationAr = "راجع الطبيب نتيجة التقييم وأصدر التوجيهات الطبية الموضحة في تقريرك.";
      const explanationEn = "Your doctor reviewed the assessment and provided the care guidance in your report.";

      return {
        tier: "high",
        pillClass: "ok",
        color: "#10b981",
        badgeText: isEn ? badgeTextEn : badgeTextAr,
        badgeTextAr,
        badgeTextEn,
        explanation: isEn ? explanationEn : explanationAr,
        explanationAr,
        explanationEn,
        reassuranceTooltip: isEn ? reassuranceTooltipEn : reassuranceTooltipAr,
        reassuranceTooltipAr,
        reassuranceTooltipEn,
        patientScoreDisplay: isEn ? badgeTextEn : badgeTextAr,
        modelConfidenceNumeric: isDoctorOrAdmin ? numericScore : null,
        visibleScore: isDoctorOrAdmin && numericScore !== null ? `${numericScore}%` : (isEn ? badgeTextEn : badgeTextAr),
        isApproved: true
      };
    }

    const badgeTextAr = "راجع الطبيب نتيجة التقييم";
    const badgeTextEn = "Your doctor reviewed the assessment";
    const explanationAr = "راجع الطبيب نتيجة التقييم وأصدر التوجيهات الطبية الموضحة في تقريرك.";
    const explanationEn = "Your doctor reviewed the assessment and provided the care guidance in your report.";
    return {
      tier: "preliminary",
      pillClass: "pending",
      color: "#f59e0b",
      badgeText: isEn ? badgeTextEn : badgeTextAr,
      badgeTextAr,
      badgeTextEn,
      explanation: isEn ? explanationEn : explanationAr,
      explanationAr,
      explanationEn,
      reassuranceTooltip: isEn ? reassuranceTooltipEn : reassuranceTooltipAr,
      reassuranceTooltipAr,
      reassuranceTooltipEn,
      patientScoreDisplay: isEn ? badgeTextEn : badgeTextAr,
      modelConfidenceNumeric: isDoctorOrAdmin ? numericScore : null,
      visibleScore: isDoctorOrAdmin && numericScore !== null ? `${numericScore}%` : (isEn ? badgeTextEn : badgeTextAr),
      isApproved: true
    };
  }

  /**
   * Renders compact inline badge for Patient Dashboard with explanation trigger
   * @param {object} caseData
   * @param {boolean} isEn
   * @param {boolean} isApproved
   * @returns {string} HTML markup
   */
  function renderPatientConfidenceBadgeHtml(caseData, isEn, isApproved) {
    const conf = getConfidenceExplanation(caseData, { isApproved, language: isEn ? "en" : "ar", role: "patient" });
    const tooltipEscaped = (conf.reassuranceTooltip || "").replace(/"/g, "&quot;");
    const infoTitle = isEn ? "Learn about Clinical Alignment" : "توضيح معنى التوافق السريري";

    return `
      <div class="patient-confidence-badge-wrap" style="display: inline-flex; align-items: center; gap: 6px;">
        <span class="pill ${conf.pillClass}" style="font-size: 11.5px; font-weight: 700;">
          ${conf.badgeText}
        </span>
        <button type="button" class="ada-reassurance-btn" onclick="window.HealthVibes && window.HealthVibes.ConfidenceExplanation ? window.HealthVibes.ConfidenceExplanation.showReassuranceModal('${isEn ? "en" : "ar"}') : alert('${tooltipEscaped}')" title="${infoTitle}" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: 0.85; line-height: 1;">
          ℹ️
        </button>
      </div>
    `;
  }

  /**
   * Renders dedicated Ada Health Reassurance Card for Certified Clinical Report
   * @param {object} caseData
   * @param {boolean} isEn
   * @param {boolean} isApproved
   * @param {string} role 'patient' | 'doctor'
   * @returns {string} HTML markup
   */
  function renderReportConfidenceCardHtml(caseData, isEn, isApproved, role = "patient") {
    const isDoctor = role === "doctor" || role === "admin";
    const conf = getConfidenceExplanation(caseData, { isApproved, language: isEn ? "en" : "ar", role });

    const doctorExtraBadge = isDoctor ? `
      <div style="background: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.3); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: var(--teal); font-family: monospace; display: flex; align-items: center; gap: 6px;">
        <span>🎯</span>
        <strong>${isEn ? "Doctor CDS Confidence Metric:" : "دقة النموذج في لوحة الطبيب:"} ${conf.modelConfidenceNumeric}%</strong>
      </div>
    ` : "";

    return `
      <div class="ada-confidence-report-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <h4 style="margin: 0; font-size: 14.5px; color: var(--teal-2); display: flex; align-items: center; gap: 8px;">
            <span>🛡️</span> ${isEn ? "Clinical Alignment & Certainty (Ada Health Standard)" : "مؤشر التوافق السريري المعتمد (معيار Ada Health)"}
          </h4>
          <span class="pill ${conf.pillClass}" style="font-size: 11px; font-weight: 700;">
            ${conf.badgeText}
          </span>
        </div>

        <div style="background: var(--surface-2); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;">
          <strong style="color: var(--ink); font-size: 13.5px; display: block; margin-bottom: 4px;">
            ${conf.explanation}
          </strong>
          <small style="color: var(--muted); font-size: 12px; line-height: 1.5; display: block;">
            ${isEn
              ? "This is a plain-language summary of the assessment after your doctor’s review. It is not a diagnosis or a guarantee; follow your doctor’s advice and ask them about anything unclear."
              : "هذا ملخص مبسط لنتيجة التقييم بعد مراجعة الطبيب، ولا يمثل تشخيصاً مستقلاً أو ضماناً لنتيجة صحية. اتبع توصيات طبيبك واسأله عما تحتاج إلى توضيحه."}
          </small>
        </div>

        ${doctorExtraBadge}

        <!-- REASSURANCE EDUCATIONAL NOTICE -->
        <div style="background: rgba(16, 185, 129, 0.06); border: 1px dashed rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 10px 14px; display: flex; align-items: flex-start; gap: 10px; margin-top: 10px;">
          <span style="font-size: 18px; line-height: 1;">💡</span>
          <p style="margin: 0; font-size: 12px; line-height: 1.6; color: var(--ink);">
            <strong>${isEn ? "Patient Note: " : "توضيح طمأنينة للمريض: "}</strong>
            ${conf.reassuranceTooltip}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Shows an educational modal explaining Ada Health Confidence concept
   * @param {string} language
   */
  function showReassuranceModal(language = "ar") {
    if (typeof document === "undefined") return;
    const isEn = language === "en";

    let modal = document.getElementById("adaReassuranceModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "adaReassuranceModal";
      modal.className = "modal-overlay no-print";
      modal.style.cssText = "position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; padding:16px;";
      document.body.appendChild(modal);
    }

    modal.style.display = "flex";
    modal.innerHTML = `
      <div style="background: var(--surface, #ffffff); max-width: 540px; width: 100%; border-radius: 16px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); border: 1px solid var(--line, #e2e8f0); position: relative; text-align: ${isEn ? "left" : "right"}; direction: ${isEn ? "ltr" : "rtl"}; font-family: inherit;">
        <button type="button" onclick="document.getElementById('adaReassuranceModal').style.display='none'" style="position: absolute; ${isEn ? "right: 16px" : "left: 16px"}; top: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--muted, #64748b); line-height: 1;">&times;</button>

        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
          <span style="font-size: 28px;">🩺</span>
          <h3 style="margin: 0; font-size: 17px; color: var(--ink, #0f172a);">
            ${isEn ? "Understanding Clinical Alignment" : "ماذا يعني مؤشر التوافق السريري؟"}
          </h3>
        </div>

        <div style="background: rgba(14, 165, 164, 0.08); border-radius: 12px; padding: 14px; margin-bottom: 16px; font-size: 13.5px; line-height: 1.6; color: var(--ink, #0f172a);">
          <strong>${isEn ? "Ada Health Reassurance Principle:" : "مبدأ الطمأنينة الطبية (معيار Ada Health):"}</strong>
          <p style="margin: 6px 0 0;">
            ${isEn
              ? "The statistical score is an estimate produced by the model. Your doctor reviews the assessment and makes the clinical decision; the score does not predict your outcome."
              : "النسبة الإحصائية تقدير ينتجه النموذج، ويراجع الطبيب التقييم ويتخذ القرار السريري. هذه النسبة لا تتنبأ بمآل حالتك."}
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; font-size: 13px;">
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="color: #10b981; font-weight: bold; font-size: 16px;">✓</span>
            <div>
              <strong>${isEn ? "Supervised Care:" : "إشراف طبي بشري كامل:"}</strong>
              <span style="color: var(--muted, #64748b);">${isEn ? "The model does not make the final clinical decision." : "النموذج لا يتخذ القرار السريري النهائي."}</span>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
            <div>
              <strong>${isEn ? "Clear & Reassuring Language:" : "صياغة مبسطة وغير مقلقة:"}</strong>
              <span style="color: var(--muted, #64748b);">${isEn ? " Raw mathematical statistics are converted to clear clinical context." : " تحويل الإحصائيات الرقمية إلى صياغة سريرية هادئة ومفهومة دون إثارة القلق."}</span>
            </div>
          </div>
        </div>

        <button type="button" class="solid-button" onclick="document.getElementById('adaReassuranceModal').style.display='none'" style="width: 100%; padding: 10px; font-weight: 700; font-size: 14px; border-radius: 8px; justify-content: center;">
          ${isEn ? "Got it, Thank you" : "فهمت، شكراً لك"}
        </button>
      </div>
    `;
  }

  const ConfidenceExplanation = {
    deriveAiConfidence,
    getConfidenceExplanation,
    renderPatientConfidenceBadgeHtml,
    renderReportConfidenceCardHtml,
    showReassuranceModal
  };

  // Expose to global window
  if (typeof global !== "undefined") {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.ConfidenceExplanation = ConfidenceExplanation;
  }

  // CommonJS export for Node.js backend and test suites
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ConfidenceExplanation;
  }
})(typeof window !== "undefined" ? window : global);
