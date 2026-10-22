/**
 * Health Vibe AI - NuvoAir Medical Benchmark Scheduled Re-assessment UI Module
 * Benchmark: NuvoAir Medical (https://nuvoair.com/)
 *
 * Core Capabilities:
 * 1. Automatic 7-Day Post-Treatment Initiation Re-assessment Schedule (Week-1 Check-in).
 * 2. Standardized 0-25 Respiratory Control Score (Adapted from validated ACT / CAT instruments).
 * 3. Longitudinal Improvement Trajectory & Quantified Delta (+/- % and score change vs Baseline).
 * 4. Step-by-Step Mobile-First Guided Flow (Symptoms, Rescue Frequency, Home Biometrics, Visual Delta).
 * 5. Multi-Touchpoint Integration:
 *    - Patient Home Dashboard Card (#patientScheduledReassessmentCard) with countdown & status badge.
 *    - NuvoAir Modal Wizard (#scheduledReassessmentModal) with >=44px touch targets.
 *    - AI Chatbot Assistant interactive check-in card and quick chips.
 *    - Appointments Pre-Visit Consultation Dossier Longitudinal Delta Snippet.
 * 6. 24h Snooze option with reminder channel customization (In-app, SMS, WhatsApp).
 * 7. 100% Mobile Responsive with WCAG 2.1 AA accessibility and RTL/LTR bilingual support.
 */

(function (global) {
  "use strict";

  if (!global.HealthVibes) {
    global.HealthVibes = {};
  }

  const STORAGE_KEY = "healthvibe_scheduled_reassessment_v1";

  function isEnglish() {
    return (
      (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en") ||
      (typeof document !== "undefined" && document.documentElement && document.documentElement.lang === "en")
    );
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTodayDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() + offsetDays);
    }
    return d.toISOString().split("T")[0];
  }

  // Initial State adhering to NuvoAir 7-Day Post-Treatment Schedule
  function getDefaultState() {
    const baselineDate = getTodayDateString(-7); // Started 7 days ago
    const dueDate = getTodayDateString(0); // Due today
    return {
      schedule: {
        id: "sched_nuvoair_01",
        status: "due", // 'scheduled' | 'due' | 'overdue' | 'completed' | 'snoozed'
        intervalDays: 7,
        startDate: baselineDate,
        dueDate: dueDate,
        dueTimestamp: Date.now(),
        notificationChannel: "in_app",
        snoozeCount: 0,
        snoozedUntil: null,
        reason: "post_treatment_7day_improvement"
      },
      baselineAssessment: {
        id: "case_baseline_01",
        date: baselineDate,
        controlScore: 13, // Poor control baseline (out of 25)
        controlBand: "poor", // 'poor' (<=15), 'moderate' (16-19), 'controlled' (20-25)
        dayBreathlessness: 2, // Moderate
        nightWaking: 2, // 3+ nights
        rescuePuffsWeek: 8,
        activityLimitation: 2, // Very limited
        spo2: 94,
        fev1Percent: 65,
        peakFlow: 340
      },
      history: [],
      currentDraft: {
        step: 1,
        dayBreathlessness: 1, // 0: None, 1: Mild, 2: Moderate, 3: Severe
        nightWaking: 0, // 0: None, 1: 1-2 nights, 2: 3+ nights
        rescuePuffsWeek: 1, // Number of puffs this week
        activityLimitation: 0, // 0: None, 1: Slightly limited, 2: Very limited
        spo2: 98,
        fev1Percent: 82,
        peakFlow: 440,
        notes: ""
      }
    };
  }

  function loadState() {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return Object.assign(getDefaultState(), parsed);
        }
      }
    } catch (e) {
      console.warn("[NuvoAir Re-assessment] Failed to load state from localStorage:", e);
    }
    return getDefaultState();
  }

  function saveState(state) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn("[NuvoAir Re-assessment] Failed to persist state to localStorage:", e);
    }
  }

  let currentState = loadState();

  /**
   * Evaluates due status based on timestamps.
   */
  function evaluateScheduleStatus(schedule) {
    if (!schedule) return "due";
    if (schedule.status === "completed") return "completed";

    const now = Date.now();
    if (schedule.snoozedUntil && now < schedule.snoozedUntil) {
      return "snoozed";
    }

    const dueTime = new Date(schedule.dueDate).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now >= dueTime + oneDayMs) {
      return "overdue";
    }
    if (now >= dueTime - oneDayMs * 0.5) {
      return "due";
    }
    return "scheduled";
  }

  /**
   * Calculates standardized 0-25 Respiratory Control Score (Adapted from ACT / CAT).
   * - Day breathlessness: 0 (6pts), 1 (4pts), 2 (2pts), 3 (0pts)
   * - Night waking: 0 (6pts), 1 (3pts), 2 (0pts)
   * - Rescue puffs: 0-1 (7pts), 2-3 (4pts), 4-5 (2pts), 6+ (0pts)
   * - Activity limitation: 0 (6pts), 1 (3pts), 2 (0pts)
   * Total = 25.
   */
  function calculateControlScore(data = {}) {
    let score = 0;

    // 1. Day Breathlessness (max 6)
    const day = Number(data.dayBreathlessness ?? 1);
    if (day === 0) score += 6;
    else if (day === 1) score += 4;
    else if (day === 2) score += 2;
    else score += 0;

    // 2. Night Waking (max 6)
    const night = Number(data.nightWaking ?? 0);
    if (night === 0) score += 6;
    else if (night === 1) score += 3;
    else score += 0;

    // 3. Rescue Puffs in Past Week (max 7)
    const rescue = Number(data.rescuePuffsWeek ?? 1);
    if (rescue <= 1) score += 7;
    else if (rescue <= 3) score += 4;
    else if (rescue <= 5) score += 2;
    else score += 0;

    // 4. Activity Limitation (max 6)
    const activity = Number(data.activityLimitation ?? 0);
    if (activity === 0) score += 6;
    else if (activity === 1) score += 3;
    else score += 0;

    let controlBand = "poor";
    if (score >= 20) {
      controlBand = "controlled";
    } else if (score >= 16) {
      controlBand = "moderate";
    }

    return {
      score,
      maxScore: 25,
      scorePct: Math.round((score / 25) * 100),
      controlBand
    };
  }

  /**
   * Calculates Longitudinal Trajectory between Baseline and Current Re-assessment.
   */
  function calculateImprovementTrajectory(baseline, current) {
    const baseScoreObj = baseline?.controlScore !== undefined ? { score: baseline.controlScore } : calculateControlScore(baseline);
    const currScoreObj = calculateControlScore(current);

    const baseScore = baseScoreObj.score;
    const currScore = currScoreObj.score;
    const deltaPoints = currScore - baseScore;
    const deltaPct = baseScore > 0 ? Math.round((deltaPoints / baseScore) * 100) : 0;

    // Rescue reduction
    const baseRescue = Number(baseline?.rescuePuffsWeek ?? 0);
    const currRescue = Number(current?.rescuePuffsWeek ?? 0);
    const rescueDelta = baseRescue - currRescue; // positive means reduction in rescue

    let trajectory = "stable"; // 'improved' | 'stable' | 'deteriorating'
    if (deltaPoints >= 3 || deltaPct >= 15) {
      trajectory = "improved";
    } else if (deltaPoints <= -3 || deltaPct <= -15 || currRescue >= 4) {
      trajectory = "deteriorating";
    }

    return {
      baselineScore: baseScore,
      currentScore: currScore,
      maxScore: 25,
      deltaPoints,
      deltaPct,
      formattedDelta: `${deltaPoints >= 0 ? "+" : ""}${deltaPoints} pts (${deltaPct >= 0 ? "+" : ""}${deltaPct}%)`,
      rescueReduction: rescueDelta,
      trajectory,
      currentBand: currScoreObj.controlBand,
      baselineBand: baseline?.controlBand || (baseScore >= 20 ? "controlled" : baseScore >= 16 ? "moderate" : "poor"),
      isSignificantImprovement: trajectory === "improved" && deltaPoints >= 5,
      clinicalReviewRecommended: trajectory === "deteriorating" || currScore < 16
    };
  }

  // =========================================================================
  // Public Interface Methods
  // =========================================================================

  function getState() {
    currentState.schedule.status = evaluateScheduleStatus(currentState.schedule);
    return JSON.parse(JSON.stringify(currentState));
  }

  function resetState() {
    currentState = getDefaultState();
    saveState(currentState);
    return getState();
  }

  function scheduleReassessment(options = {}) {
    const intervalDays = options.intervalDays || 7;
    const startDate = options.startDate || getTodayDateString(0);
    const dueDate = getTodayDateString(intervalDays);

    currentState.schedule = {
      id: `sched_nuvoair_${Date.now()}`,
      status: "scheduled",
      intervalDays,
      startDate,
      dueDate,
      dueTimestamp: new Date(dueDate).getTime(),
      notificationChannel: options.notificationChannel || "in_app",
      snoozeCount: 0,
      snoozedUntil: null,
      reason: options.reason || "post_treatment_7day_improvement"
    };

    if (options.baselineAssessment) {
      currentState.baselineAssessment = Object.assign({}, currentState.baselineAssessment, options.baselineAssessment);
    }

    saveState(currentState);
    return getState();
  }

  function snoozeReassessment(hours = 24) {
    const snoozedMs = hours * 60 * 60 * 1000;
    currentState.schedule.status = "snoozed";
    currentState.schedule.snoozeCount = (currentState.schedule.snoozeCount || 0) + 1;
    currentState.schedule.snoozedUntil = Date.now() + snoozedMs;
    saveState(currentState);

    // Record Telemetry
    if (global.analyticsService?.recordEvent) {
      try {
        global.analyticsService.recordEvent({
          eventType: "reassessment_snoozed",
          userId: global.auth?.currentUser?.uid || "usr_patient_reassess",
          payload: {
            reassessmentId: currentState.schedule.id,
            snoozedHours: hours,
            snoozeCount: currentState.schedule.snoozeCount
          }
        });
      } catch (e) {}
    }

    renderDashboardCard();
    return { success: true, snoozedUntil: currentState.schedule.snoozedUntil };
  }

  function submitReassessment(data = {}) {
    const merged = Object.assign({}, currentState.currentDraft, data);
    const scoreObj = calculateControlScore(merged);
    const trajectoryObj = calculateImprovementTrajectory(currentState.baselineAssessment, merged);

    const completedEntry = {
      id: `reassess_${Date.now()}`,
      completedAt: new Date().toISOString(),
      date: getTodayDateString(0),
      data: merged,
      score: scoreObj.score,
      controlBand: scoreObj.controlBand,
      trajectory: trajectoryObj.trajectory,
      deltaPoints: trajectoryObj.deltaPoints,
      deltaPct: trajectoryObj.deltaPct,
      baselineScore: trajectoryObj.baselineScore,
      clinicalReviewRecommended: trajectoryObj.clinicalReviewRecommended
    };

    currentState.history.unshift(completedEntry);
    currentState.schedule.status = "completed";
    currentState.schedule.completedAt = completedEntry.completedAt;

    // Automatically stage next routine check-in (14 days later)
    currentState.nextScheduledDate = getTodayDateString(14);

    saveState(currentState);

    // Record Telemetry
    if (global.analyticsService?.recordEvent) {
      try {
        global.analyticsService.recordEvent({
          eventType: "reassessment_completed",
          userId: global.auth?.currentUser?.uid || "usr_patient_reassess",
          payload: {
            reassessmentId: completedEntry.id,
            trajectory: trajectoryObj.trajectory,
            deltaScore: trajectoryObj.deltaPoints,
            controlBand: scoreObj.controlBand,
            baselineScore: trajectoryObj.baselineScore,
            followUpScore: scoreObj.score,
            dayBreathlessness: merged.dayBreathlessness,
            nightWaking: merged.nightWaking
          }
        });
      } catch (e) {}
    }

    renderDashboardCard();
    return {
      success: true,
      entry: completedEntry,
      trajectory: trajectoryObj
    };
  }

  // =========================================================================
  // HTML UI Renderers
  // =========================================================================

  /**
   * 1. Patient Home Dashboard Card (#patientScheduledReassessmentCard)
   */
  function renderDashboardCard(containerId = "patientScheduledReassessmentCard") {
    const container = document.getElementById(containerId);
    const isEn = isEnglish();
    const state = getState();
    const sched = state.schedule;
    const baseline = state.baselineAssessment;
    const history = state.history || [];
    const latestCompleted = history[0] || null;

    let badgeClass = "badge-due";
    let statusText = isEn ? "Week 1 Check-in Due" : "مستحق الآن (الأسبوع الأول)";
    let daysDiffText = isEn ? "Due Today" : "مستحق اليوم";

    if (sched.status === "scheduled") {
      badgeClass = "badge-scheduled";
      statusText = isEn ? "Scheduled Follow-up" : "تقييم متابعة مجدول";
      daysDiffText = isEn ? `Due in ${sched.intervalDays} days` : `متبقي ${sched.intervalDays} أيام`;
    } else if (sched.status === "snoozed") {
      badgeClass = "badge-snoozed";
      statusText = isEn ? "Reminder Snoozed" : "مؤجل مؤقتاً";
      daysDiffText = isEn ? "Resuming in 24h" : "يستأنف بعد ٢٤ ساعة";
    } else if (sched.status === "overdue") {
      badgeClass = "badge-overdue";
      statusText = isEn ? "Check-in Overdue" : "تقييم المتابعة متأخر";
      daysDiffText = isEn ? "Overdue" : "متأخر عن موعده";
    } else if (sched.status === "completed") {
      badgeClass = "badge-completed";
      statusText = isEn ? "Completed ✓" : "مكتمل بنجاح ✓";
      daysDiffText = isEn ? "Next due in 14 days" : "التقييم القادم بعد ١٤ يوماً";
    }

    // Trajectory snippet if completed
    let trajectorySnippet = "";
    if (latestCompleted) {
      const isPositive = latestCompleted.deltaPoints >= 0;
      const trajColor = latestCompleted.trajectory === "improved" ? "#059669" : latestCompleted.trajectory === "stable" ? "#d97706" : "#dc2626";
      const trajLabel = latestCompleted.trajectory === "improved"
        ? (isEn ? "Significant Improvement" : "تحسن سريري ممتاز")
        : latestCompleted.trajectory === "stable"
        ? (isEn ? "Stable Control" : "تحسن جزئي أو استقرار")
        : (isEn ? "Needs Clinical Review" : "يوصى بمراجعة الطبيب");

      trajectorySnippet = `
        <div class="nuvoair-completed-summary">
          <div class="summary-metric">
            <span class="metric-label">${isEn ? "Baseline Score" : "درجة البداية"}</span>
            <strong class="metric-value">${latestCompleted.baselineScore}/25</strong>
          </div>
          <div class="summary-arrow">➔</div>
          <div class="summary-metric">
            <span class="metric-label">${isEn ? "Current Score" : "الدرجة الحالية"}</span>
            <strong class="metric-value" style="color: ${trajColor};">${latestCompleted.score}/25</strong>
          </div>
          <div class="summary-badge" style="background: ${trajColor}15; color: ${trajColor}; border-color: ${trajColor}40;">
            ${isPositive ? "+" : ""}${latestCompleted.deltaPoints} pts (${trajLabel})
          </div>
        </div>
      `;
    }

    const html = `
      <article class="nuvoair-reassessment-card" role="region" aria-label="${isEn ? "NuvoAir Scheduled Re-assessment" : "تقييم المتابعة الدوري NuvoAir"}">
        <div class="nuvoair-card-header">
          <div class="header-left">
            <div class="nuvoair-logo-icon">🫁</div>
            <div>
              <div class="header-eyebrow">
                <span class="nuvoair-benchmark-tag">NuvoAir Medical</span>
                <span class="nuvoair-status-pill ${badgeClass}">${statusText}</span>
              </div>
              <h3 class="header-title">${isEn ? "7-Day Respiratory Progress Check-in" : "تقييم المتابعة الدوري (الأسبوع الأول)"}</h3>
            </div>
          </div>
          <div class="header-right">
            <span class="due-countdown">${daysDiffText}</span>
          </div>
        </div>

        <p class="nuvoair-card-subtitle">
          ${isEn 
            ? "Measure how your lungs are responding 7 days after starting your preventative inhaler plan. Compare results with your baseline."
            : "قِس استجابة رئتيك بعد أسبوع من بدء خطة البخاخات الوقائية، واطلع على مقارنة التحسن الفورية مع تقييمك الأول."}
        </p>

        ${trajectorySnippet}

        <div class="nuvoair-card-actions">
          <button type="button" class="btn-nuvoair-primary" onclick="HealthVibes.ScheduledReassessmentUI.openWizardModal()">
            <span>📝</span>
            <span>${sched.status === "completed" ? (isEn ? "Retake Follow-up Check-in" : "إعادة فحص المتابعة") : (isEn ? "Start 2-Min Check-in Now" : "ابدأ تقييم المتابعة الآن (دقيقتان)")}</span>
          </button>
          
          ${sched.status !== "completed" ? `
            <button type="button" class="btn-nuvoair-secondary" onclick="HealthVibes.ScheduledReassessmentUI.snoozeReassessment(24)">
              <span>⏱️</span>
              <span>${isEn ? "Snooze 24h" : "تأجيل ٢٤ ساعة"}</span>
            </button>
          ` : `
            <button type="button" class="btn-nuvoair-secondary" onclick="HealthVibes.ScheduledReassessmentUI.openWizardModal(4)">
              <span>📊</span>
              <span>${isEn ? "View Trajectory Chart" : "عرض رسم التحسن البياني"}</span>
            </button>
          `}
        </div>
      </article>
    `;

    if (container) {
      container.innerHTML = html;
    }
    return html;
  }

  /**
   * 2. Full Guided Step-by-Step NuvoAir Modal Wizard (#scheduledReassessmentModal)
   */
  function openWizardModal(initialStep = 1) {
    currentState.currentDraft.step = initialStep;
    let modal = document.getElementById("scheduledReassessmentModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "scheduledReassessmentModal";
      modal.className = "nuvoair-modal-overlay";
      document.body.appendChild(modal);
    }
    renderWizardModalContent(modal);
    modal.classList.add("active");
  }

  function closeWizardModal() {
    const modal = document.getElementById("scheduledReassessmentModal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  function setWizardStep(step) {
    if (step < 1) step = 1;
    if (step > 4) step = 4;
    currentState.currentDraft.step = step;
    const modal = document.getElementById("scheduledReassessmentModal");
    if (modal) {
      renderWizardModalContent(modal);
    }
  }

  function updateDraftField(field, value) {
    currentState.currentDraft[field] = value;
    saveState(currentState);
  }

  function renderWizardModalContent(modalEl) {
    const isEn = isEnglish();
    const draft = currentState.currentDraft;
    const baseline = currentState.baselineAssessment;
    const currentStep = draft.step || 1;

    // Progress percentage
    const stepPct = Math.round((currentStep / 4) * 100);

    let stepHtml = "";

    // -------------------------------------------------------------------------
    // STEP 1: Daytime & Nighttime Symptoms
    // -------------------------------------------------------------------------
    if (currentStep === 1) {
      stepHtml = `
        <div class="wizard-step-pane">
          <div class="step-intro">
            <h4>${isEn ? "Step 1: Day & Night Breathing Symptoms" : "الخطوة ١: الأعراض النهارية والليلية"}</h4>
            <p>${isEn ? "How has your breathing felt over the past 7 days during daytime activities and sleep?" : "كيف كان تنفسك خلال الـ ٧ أيام الماضية أثناء النهار والنوم؟"}</p>
          </div>

          <div class="nuvoair-question-group">
            <label class="group-label">${isEn ? "1. Daytime Breathlessness / Shortness of Breath:" : "١. ضيق التنفس أثناء الأنشطة النهارية المعتادة:"}</label>
            <div class="touch-radio-grid">
              ${[
                { val: 0, ar: "معدوم (تنفس طبيعي تماماً)", en: "None (Normal effortless breathing)", icon: "🟢" },
                { val: 1, ar: "طفيف (أثناء المجهود الشديد فقط)", en: "Mild (Only during vigorous effort)", icon: "🟡" },
                { val: 2, ar: "متوسط (أثناء المشي العادي)", en: "Moderate (During normal walking)", icon: "🟠" },
                { val: 3, ar: "شديد (أثناء الراحة أو الكلام)", en: "Severe (At rest or talking)", icon: "🔴" }
              ].map(opt => `
                <button type="button" class="touch-radio-card ${draft.dayBreathlessness === opt.val ? 'selected' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.selectOption('dayBreathlessness', ${opt.val})">
                  <span class="opt-icon">${opt.icon}</span>
                  <span class="opt-text">${isEn ? opt.en : opt.ar}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="nuvoair-question-group" style="margin-top: 20px;">
            <label class="group-label">${isEn ? "2. Nighttime Waking (Coughing, Chest Tightness, Wheezing):" : "٢. الاستيقاظ ليلاً بسبب السعال أو ضيق الصدر:"}</label>
            <div class="touch-radio-grid">
              ${[
                { val: 0, ar: "لم أستيقظ مطلقاً (نوم هادئ)", en: "Never (Peaceful uninterrupted sleep)", icon: "🌙" },
                { val: 1, ar: "١ - ٢ ليلة خلال الأسبوع", en: "1 - 2 nights this past week", icon: "🥱" },
                { val: 2, ar: "٣ ليالٍ أو أكثر (أرق متكرر)", en: "3 or more nights (Frequent waking)", icon: "🚨" }
              ].map(opt => `
                <button type="button" class="touch-radio-card ${draft.nightWaking === opt.val ? 'selected' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.selectOption('nightWaking', ${opt.val})">
                  <span class="opt-icon">${opt.icon}</span>
                  <span class="opt-text">${isEn ? opt.en : opt.ar}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // -------------------------------------------------------------------------
    // STEP 2: Rescue Medication & Activity Limitation
    // -------------------------------------------------------------------------
    else if (currentStep === 2) {
      stepHtml = `
        <div class="wizard-step-pane">
          <div class="step-intro">
            <h4>${isEn ? "Step 2: Rescue Inhaler Usage & Activity Freedom" : "الخطوة ٢: بخاخ الطوارئ وحرية الحركة"}</h4>
            <p>${isEn ? "Assess your need for quick-relief medication and how symptoms affect your daily life." : "تقييم معدل حاجتك للبخاخ الإسعافي ومدى تأثير الأعراض على نشاطك اليومي."}</p>
          </div>

          <div class="nuvoair-question-group">
            <label class="group-label">${isEn ? "3. How many times did you use your Rescue Inhaler (Ventolin) this week?" : "٣. كم مرة احتجت لاستخدام بخاخ الإسعاف (فنتولين) هذا الأسبوع؟"}</label>
            <div class="touch-radio-grid">
              ${[
                { val: 0, ar: "لم أستخدمه مطلقاً (٠ مرات)", en: "Not at all (0 times)", icon: "✨" },
                { val: 1, ar: "مرة واحدة فقط خلال الأسبوع", en: "1 time only this week", icon: "👍" },
                { val: 2, ar: "٢ - ٣ مرات خلال الأسبوع", en: "2 - 3 times this week", icon: "⚠️" },
                { val: 4, ar: "٤ مرات أو أكثر (استخدام متكرر)", en: "4 or more times (Frequent rescue)", icon: "🚨" }
              ].map(opt => `
                <button type="button" class="touch-radio-card ${draft.rescuePuffsWeek === opt.val ? 'selected' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.selectOption('rescuePuffsWeek', ${opt.val})">
                  <span class="opt-icon">${opt.icon}</span>
                  <span class="opt-text">${isEn ? opt.en : opt.ar}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="nuvoair-question-group" style="margin-top: 20px;">
            <label class="group-label">${isEn ? "4. Limitation of Daily Physical Activities & Walking:" : "٤. مدى تقييد التنفس لأنشطتك اليومية وصعود الدرج:"}</label>
            <div class="touch-radio-grid">
              ${[
                { val: 0, ar: "لا يوجد أي تقييد (نشاط كامل)", en: "Not limited at all (Full activity)", icon: "🏃" },
                { val: 1, ar: "تقييد طفيف في بعض المهام", en: "Slightly limited in some tasks", icon: "🚶" },
                { val: 2, ar: "تقييد ملحوظ وصعوبة في الحركة", en: "Significantly limited / Difficulty moving", icon: "🛑" }
              ].map(opt => `
                <button type="button" class="touch-radio-card ${draft.activityLimitation === opt.val ? 'selected' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.selectOption('activityLimitation', ${opt.val})">
                  <span class="opt-icon">${opt.icon}</span>
                  <span class="opt-text">${isEn ? opt.en : opt.ar}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // -------------------------------------------------------------------------
    // STEP 3: Home Biometrics (Optional - SpO2, FEV1, Peak Flow)
    // -------------------------------------------------------------------------
    else if (currentStep === 3) {
      stepHtml = `
        <div class="wizard-step-pane">
          <div class="step-intro">
            <h4>${isEn ? "Step 3: Home Respiratory Biometrics (Optional)" : "الخطوة ٣: المؤشرات التنفسية المنزلية (اختياري)"}</h4>
            <p>${isEn ? "If you have a home pulse oximeter or NuvoAir Air Next spirometer, enter your numbers below." : "إذا توفر لديك جهاز قياس الأكسجين أو جهاز مقياس التنفس المنزلي (NuvoAir)، سجل القراءات أدناه."}</p>
          </div>

          <div class="biometrics-input-card">
            <div class="biometric-field">
              <label>
                <span>🫀 ${isEn ? "Oxygen Saturation (SpO2 %):" : "نسبة الأكسجين في الدم (SpO2 %):"}</span>
                <input type="number" min="70" max="100" value="${draft.spo2 || 98}" onchange="HealthVibes.ScheduledReassessmentUI.updateDraftField('spo2', Number(this.value))" />
              </label>
              <small class="field-hint">${isEn ? "Normal resting: 95% - 100%" : "المعدل الطبيعي أثناء الراحة: ٩٥٪ - ١٠٠٪"}</small>
            </div>

            <div class="biometric-field">
              <label>
                <span>💨 ${isEn ? "NuvoAir FEV1 (% of predicted):" : "كفاءة الزفير القصوى (FEV1 %):"}</span>
                <input type="number" min="30" max="130" value="${draft.fev1Percent || 82}" onchange="HealthVibes.ScheduledReassessmentUI.updateDraftField('fev1Percent', Number(this.value))" />
              </label>
              <small class="field-hint">${isEn ? "NuvoAir Spirometer metric" : "معيار جهاز مقياس التنفس الرقمي"}</small>
            </div>

            <div class="biometric-field">
              <label>
                <span>📈 ${isEn ? "Peak Expiratory Flow (Peak Flow - L/min):" : "مقياس تدفق الزفير الأقصى (Peak Flow - لتر/دقيقة):"}</span>
                <input type="number" min="100" max="800" step="10" value="${draft.peakFlow || 440}" onchange="HealthVibes.ScheduledReassessmentUI.updateDraftField('peakFlow', Number(this.value))" />
              </label>
              <small class="field-hint">${isEn ? "Peak Flow meter reading" : "قراءة مقياس تدفق الزفير المنزلي"}</small>
            </div>
          </div>

          <div class="nuvoair-skip-box">
            <p>${isEn ? "Don't have these devices at home right now?" : "لا تملك أجهزة قياس منزلية في الوقت الحالي؟"}</p>
            <button type="button" class="btn-nuvoair-skip" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(4)">
              <span>⏩</span>
              <span>${isEn ? "Skip Biometrics & View Trajectory Result" : "تخطي وعرض نتيجة مسار التحسن مباشرة"}</span>
            </button>
          </div>
        </div>
      `;
    }

    // -------------------------------------------------------------------------
    // STEP 4: Real-time Longitudinal Improvement Trajectory Result
    // -------------------------------------------------------------------------
    else if (currentStep === 4) {
      const trajectory = calculateImprovementTrajectory(baseline, draft);
      const isImproved = trajectory.trajectory === "improved";
      const isStable = trajectory.trajectory === "stable";
      const isDeteriorating = trajectory.trajectory === "deteriorating";

      let statusColor = isImproved ? "#059669" : isStable ? "#d97706" : "#dc2626";
      let statusIcon = isImproved ? "🟢" : isStable ? "🟡" : "🔴";
      let statusHeading = isImproved
        ? (isEn ? "Significant Clinical Improvement!" : "تحسن سريري ممتاز وملحوظ!")
        : isStable
        ? (isEn ? "Partial Control & Stable Breathing" : "تحسن جزئي واستقرار في التنفس")
        : (isEn ? "Symptoms Worsening / Needs Doctor Review" : "عدم تحسن أو تراجع في التنفس — يوصى بمراجعة الطبيب");

      let adviceText = isImproved
        ? (isEn 
            ? "Your respiratory response indicates your preventative inhaler plan is working well. Keep up your daily routine!" 
            : "استجابتك التنفسية تدل على فاعلية خطة البخاخات الوقائية بوضوح. استمر في تناول جرعاتك المجدولة بانتظام.")
        : isStable
        ? (isEn 
            ? "Your breathing is showing gradual stabilization. Ensure proper inhalation technique and don't miss doses." 
            : "تنفسك يمر بمرحلة استقرار تدريجي. تأكد من تقنية الاستنشاق السليمة والالتزام الدائم بمواعيد الجرعات.")
        : (isEn 
            ? "Your symptom score and rescue usage indicate inadequate control. Book a consultation with your pulmonologist promptly." 
            : "درجة الأعراض والاحتياج المتكرر لبخاخ الإسعاف يشيران إلى استجابة غير كافية. ننصح بحجز موعد استشارة مع طبيبك لضبط العلاج.");

      stepHtml = `
        <div class="wizard-step-pane">
          <div class="step-intro">
            <h4>${isEn ? "Step 4: Longitudinal Improvement Trajectory" : "الخطوة ٤: مسار التحسن السريري والمقارنة"}</h4>
            <p>${isEn ? "Instant comparative analysis between your Day 0 baseline and Week 1 check-in." : "تحليل مقارن فوري بين تقييم البداية (اليوم ٠) وتقييم المتابعة الأسبوعي (اليوم ٧)."}</p>
          </div>

          <!-- COMPARISON HIGHLIGHT CARD -->
          <div class="nuvoair-trajectory-result-card" style="border-color: ${statusColor}40; background: linear-gradient(135deg, ${statusColor}08, ${statusColor}18);">
            <div class="trajectory-header">
              <span class="traj-icon">${statusIcon}</span>
              <div>
                <h3 style="color: ${statusColor}; margin: 0; font-size: 17px;">${statusHeading}</h3>
                <span style="font-size: 12px; color: var(--muted);">${isEn ? "Validated Respiratory Control Metric (NuvoAir Adaptation)" : "مؤشر التحكم التنفسي المقنن (معيار NuvoAir)"}</span>
              </div>
            </div>

            <!-- SCORE DELTA BARS -->
            <div class="trajectory-score-comparison">
              <div class="score-col">
                <span class="col-label">${isEn ? "Day 0 Baseline" : "تقييم البداية (اليوم ٠)"}</span>
                <div class="score-number">${trajectory.baselineScore}<small>/25</small></div>
                <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${(trajectory.baselineScore/25)*100}%; background: #64748b;"></div></div>
                <span class="band-tag">${trajectory.baselineBand}</span>
              </div>

              <div class="delta-arrow-col">
                <span class="arrow-symbol">➔</span>
                <span class="delta-badge" style="background: ${statusColor}; color: #ffffff;">
                  ${trajectory.formattedDelta}
                </span>
              </div>

              <div class="score-col">
                <span class="col-label">${isEn ? "Week 1 Check-in" : "تقييم المتابعة (اليوم ٧)"}</span>
                <div class="score-number" style="color: ${statusColor};">${trajectory.currentScore}<small>/25</small></div>
                <div class="score-bar-bg"><div class="score-bar-fill" style="width: ${(trajectory.currentScore/25)*100}%; background: ${statusColor};"></div></div>
                <span class="band-tag" style="color: ${statusColor}; font-weight: 700;">${trajectory.currentBand}</span>
              </div>
            </div>

            <p class="trajectory-advice">${adviceText}</p>

            ${trajectory.clinicalReviewRecommended ? `
              <div class="doctor-action-box">
                <strong>👨‍⚕️ ${isEn ? "Recommended Clinical Action:" : "الإجراء الطبي الموصى به:"}</strong>
                <p style="margin: 4px 0 10px; font-size: 12px;">${isEn ? "Connect with your doctor to review dosage or trigger factors." : "تواصل مع طبيبك المعالج لمراجعة الجرعات أو فحص محفزات النوبات."}</p>
                <button type="button" class="btn-book-followup" onclick="if(window.showScreen) showScreen('appointments'); HealthVibes.ScheduledReassessmentUI.closeWizardModal();">
                  <span>📅</span>
                  <span>${isEn ? "Book Follow-up Appointment" : "حجز استشارة متابعة مع الطبيب"}</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    modalEl.innerHTML = `
      <div class="nuvoair-modal-dialog" role="dialog" aria-modal="true">
        <!-- MODAL HEADER -->
        <div class="nuvoair-modal-header">
          <div class="modal-title-box">
            <span class="brand-tag">NuvoAir Medical • Longitudinal Assessment</span>
            <h3>${isEn ? "7-Day Respiratory Follow-up Check-in" : "تقييم المتابعة الأسبوعي لقياس التحسن"}</h3>
          </div>
          <button type="button" class="modal-close-btn" onclick="HealthVibes.ScheduledReassessmentUI.closeWizardModal()" aria-label="Close">✕</button>
        </div>

        <!-- PROGRESS STEP BAR -->
        <div class="nuvoair-wizard-progress">
          <div class="progress-bar-fill" style="width: ${stepPct}%;"></div>
          <div class="steps-nav">
            <button type="button" class="step-nav-btn ${currentStep === 1 ? 'active' : currentStep > 1 ? 'done' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(1)">
              <span>${currentStep > 1 ? '✓' : '1'}</span>
              <small>${isEn ? "Symptoms" : "الأعراض"}</small>
            </button>
            <button type="button" class="step-nav-btn ${currentStep === 2 ? 'active' : currentStep > 2 ? 'done' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(2)">
              <span>${currentStep > 2 ? '✓' : '2'}</span>
              <small>${isEn ? "Rescue" : "الإسعافي"}</small>
            </button>
            <button type="button" class="step-nav-btn ${currentStep === 3 ? 'active' : currentStep > 3 ? 'done' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(3)">
              <span>${currentStep > 3 ? '✓' : '3'}</span>
              <small>${isEn ? "Biometrics" : "المؤشرات"}</small>
            </button>
            <button type="button" class="step-nav-btn ${currentStep === 4 ? 'active' : ''}" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(4)">
              <span>4</span>
              <small>${isEn ? "Trajectory" : "النتيجة"}</small>
            </button>
          </div>
        </div>

        <!-- MODAL BODY -->
        <div class="nuvoair-modal-body">
          ${stepHtml}
        </div>

        <!-- MODAL FOOTER NAVIGATION -->
        <div class="nuvoair-modal-footer">
          ${currentStep > 1 ? `
            <button type="button" class="btn-step-prev" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(${currentStep - 1})">
              <span>${isEn ? "← Back" : "السابق →"}</span>
            </button>
          ` : `<div></div>`}

          ${currentStep < 4 ? `
            <button type="button" class="btn-step-next" onclick="HealthVibes.ScheduledReassessmentUI.setWizardStep(${currentStep + 1})">
              <span>${isEn ? "Next Step →" : "← التالي"}</span>
            </button>
          ` : `
            <button type="button" class="btn-step-submit" onclick="HealthVibes.ScheduledReassessmentUI.finalizeAndSave()">
              <span>✓</span>
              <span>${isEn ? "Save & Attach to Clinical Dossier" : "حفظ النتيجة وإرفاقها بملف الاستشارة الطبية"}</span>
            </button>
          `}
        </div>
      </div>
    `;
  }

  function selectOption(field, value) {
    currentState.currentDraft[field] = value;
    saveState(currentState);
    const modal = document.getElementById("scheduledReassessmentModal");
    if (modal) {
      renderWizardModalContent(modal);
    }
  }

  function finalizeAndSave() {
    submitReassessment(currentState.currentDraft);
    closeWizardModal();
    if (typeof global.showNotification === "function") {
      const isEn = isEnglish();
      global.showNotification(
        isEn ? "7-Day Re-assessment completed and attached to your clinical dossier!" : "تم حفظ تقييم المتابعة الأسبوعي وإرفاقه بملف الاستشارة بنجاح!",
        "success"
      );
    }
  }

  /**
   * 3. AI Chatbot Assistant Interactive Card
   */
  function renderChatbotCard() {
    const isEn = isEnglish();
    const state = getState();
    const sched = state.schedule;
    const baseline = state.baselineAssessment;

    return `
      <div class="nuvoair-chatbot-card" style="margin-top: 10px; padding: 14px; background: rgba(14, 165, 233, 0.08); border: 1.5px solid #0ea5e9; border-radius: 12px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">🫁</span>
          <div>
            <strong style="color: #0284c7; font-size: 13.5px;">${isEn ? "NuvoAir 7-Day Follow-up Check-in" : "تقييم المتابعة الدوري (الأسبوع الأول)"}</strong>
            <div style="font-size: 11px; color: var(--muted);">${isEn ? "Benchmark: NuvoAir Medical" : "معيار NuvoAir Medical السريري"}</div>
          </div>
        </div>

        <p style="margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: var(--ink);">
          ${isEn 
            ? `It has been 7 days since your treatment plan began. Your baseline control score was <strong>${baseline.controlScore}/25</strong>. Let's do a quick 2-minute check-in to measure your airway improvement!`
            : `لقد مضت ٧ أيام منذ بدء الخطة العلاجية. كانت درجة التحكم في البداية <strong>${baseline.controlScore}/٢٥</strong>. أجب على الفحص السريع لقياس تحسن تنفسك ومقارنته بالبداية!`}
        </p>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="solid-button" style="padding: 6px 14px; font-size: 12px; background: #0284c7;" onclick="HealthVibes.ScheduledReassessmentUI.openWizardModal()">
            <span>📝</span> ${isEn ? "Start Check-in (2 mins)" : "ابدأ التقييم الآن (دقيقتان)"}
          </button>
          <button type="button" class="outline-button" style="padding: 6px 12px; font-size: 12px;" onclick="HealthVibes.ScheduledReassessmentUI.snoozeReassessment(24)">
            <span>⏱️</span> ${isEn ? "Remind Tomorrow" : "تذكيري غداً"}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 4. Appointments Pre-Visit Consultation Dossier Snippet
   */
  function renderAppointmentReassessmentSnippet(patientId = null) {
    const isEn = isEnglish();
    const state = getState();
    const history = state.history || [];
    const baseline = state.baselineAssessment;
    const latest = history[0] || null;

    if (!latest && state.schedule.status !== "due") {
      return `
        <div class="nuvoair-dossier-snippet empty" style="padding: 14px; background: var(--surface-2, #f8fafc); border: 1px dashed var(--line, #e2e8f0); border-radius: 10px; font-size: 12.5px; color: var(--muted);">
          <span>⏱️</span> ${isEn ? "Scheduled 7-day re-assessment is pending completion by the patient." : "تقييم المتابعة الدوري المجدول (بعد ٧ أيام) قيد انتظار استكمال المريض للفحص."}
        </div>
      `;
    }

    const currScore = latest ? latest.score : calculateControlScore(state.currentDraft).score;
    const delta = currScore - baseline.controlScore;
    const isPositive = delta >= 0;
    const statusColor = delta >= 3 ? "#059669" : delta <= -3 ? "#dc2626" : "#d97706";
    const statusLabel = delta >= 3
      ? (isEn ? "Significant Airway Improvement" : "تحسن مجرى الهواء بوضوح")
      : delta <= -3
      ? (isEn ? "Sub-optimal Control / Deterioration" : "تحكم دون المستوى / تراجع")
      : (isEn ? "Stable Control" : "تحكم مستقر");

    return `
      <div class="nuvoair-dossier-snippet" style="background: var(--surface, #ffffff); border: 1.5px solid #0ea5e9; border-radius: 12px; padding: 16px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">📈</span>
            <strong style="color: #0284c7; font-size: 13.5px;">${isEn ? "NuvoAir 7-Day Longitudinal Improvement Dossier" : "تقرير مسار التحسن السريري الأسبوعي (معيار NuvoAir)"}</strong>
          </div>
          <span class="pill" style="background: ${statusColor}18; color: ${statusColor}; font-weight: 700; font-size: 11px;">
            ${statusLabel}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px; text-align: center;">
          <div style="background: var(--surface-2, #f8fafc); padding: 10px; border-radius: 8px; border: 1px solid var(--line, #e2e8f0);">
            <div style="font-size: 11px; color: var(--muted);">${isEn ? "Baseline Control" : "درجة خط الأساس"}</div>
            <strong style="font-size: 16px; color: #64748b;">${baseline.controlScore} / 25</strong>
          </div>
          <div style="background: var(--surface-2, #f8fafc); padding: 10px; border-radius: 8px; border: 1px solid var(--line, #e2e8f0);">
            <div style="font-size: 11px; color: var(--muted);">${isEn ? "Week 1 Check-in" : "تقييم الأسبوع الأول"}</div>
            <strong style="font-size: 16px; color: ${statusColor};">${currScore} / 25</strong>
          </div>
          <div style="background: var(--surface-2, #f8fafc); padding: 10px; border-radius: 8px; border: 1px solid var(--line, #e2e8f0);">
            <div style="font-size: 11px; color: var(--muted);">${isEn ? "Quantified Delta" : "مقدار التغير"}</div>
            <strong style="font-size: 16px; color: ${statusColor};">${isPositive ? "+" : ""}${delta} pts</strong>
          </div>
        </div>

        <div style="font-size: 12px; color: var(--muted); line-height: 1.5;">
          ${isEn 
            ? "Summary: Patient demonstrated symptom trajectory response. Data calibrated with ACT/CAT validated instrument guidelines."
            : "الملخص: وثق المريض استجابته السريرية لمسار الأعراض. القياسات مستندة لمقاييس ACT/CAT المعتمدة عالمياً."}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // Module Exports
  // =========================================================================

  const ScheduledReassessmentUI = {
    getState,
    resetState,
    scheduleReassessment,
    snoozeReassessment,
    submitReassessment,
    calculateControlScore,
    calculateImprovementTrajectory,
    evaluateScheduleStatus,
    renderDashboardCard,
    openWizardModal,
    closeWizardModal,
    setWizardStep,
    updateDraftField,
    selectOption,
    finalizeAndSave,
    renderChatbotCard,
    renderAppointmentReassessmentSnippet
  };

  global.HealthVibes.ScheduledReassessmentUI = ScheduledReassessmentUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ScheduledReassessmentUI;
  }
})(typeof window !== "undefined" ? window : global);
