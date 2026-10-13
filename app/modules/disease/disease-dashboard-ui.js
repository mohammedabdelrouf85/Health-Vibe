/**
 * Health Vibe AI - Disease Dashboard UI Renderer
 * 
 * Renders the unified patient Disease dashboard, prioritizing the next required action
 * and strictly displaying only real account data from the 4 modules.
 */

(function (global) {
  "use strict";

  const t = (key) => {
    if (global.app && global.app.i18n && global.app.i18n.t) {
      return global.app.i18n.t(key);
    }
    return key;
  };

  /**
   * Translates module state ID to localized string.
   */
  function getStateLabel(state) {
    const stateMap = {
      'not_started': 'diseaseDashboard.stateNotStarted',
      'information_requested': 'diseaseDashboard.stateInfoRequested',
      'awaiting_review': 'diseaseDashboard.stateAwaitingReview',
      'under_review': 'diseaseDashboard.stateUnderReview',
      'approved': 'diseaseDashboard.stateApproved',
      'no_data': 'diseaseDashboard.stateNoData'
    };
    return t(stateMap[state] || 'diseaseDashboard.stateNoData');
  }

  /**
   * Returns appropriate CSS classes for a state pill.
   */
  function getStateClasses(state) {
    const classMap = {
      'not_started': 'pill bg-surface-variant text-on-surface-variant',
      'information_requested': 'pill bg-error text-on-error',
      'awaiting_review': 'pill bg-secondary text-on-secondary',
      'under_review': 'pill bg-primary text-on-primary',
      'approved': 'pill bg-success text-on-success',
      'no_data': 'pill bg-surface-variant text-on-surface-variant opacity-75'
    };
    return classMap[state] || classMap['no_data'];
  }

  /**
   * Renders a single disease module card.
   */
  function renderModuleCard(moduleData) {
    const title = t(`diseaseDashboard.${moduleData.titleKey}`);
    const stateLabel = getStateLabel(moduleData.state);
    const stateClasses = getStateClasses(moduleData.state);
    const actionLabel = t(`diseaseDashboard.${moduleData.nextAction}`);
    
    // Add real data snippets safely without fabricating values
    let dataSnippet = '';
    if (moduleData.rawData) {
      const rd = moduleData.rawData;
      const metrics = [];
      if (rd.assessmentsCount > 0) metrics.push(`Assessments: ${rd.assessmentsCount}`);
      if (rd.readingsCount > 0) metrics.push(`Readings: ${rd.readingsCount}`);
      if (rd.reportsCount > 0) metrics.push(`Reports: ${rd.reportsCount}`);
      if (metrics.length > 0) {
        dataSnippet = `<div class="text-sm text-muted mt-2">${metrics.join(' • ')}</div>`;
      }
    }

    // Determine the button action/target based on module
    // In a real app, this would use the router to navigate to the specific module screen
    const navAction = `data-route="disease-${moduleData.id}"`;

    return `
      <div class="panel cursor-pointer hover-lift transition-all" ${navAction} tabindex="0" aria-label="${title}. State: ${stateLabel}">
        <div class="panel-head flex items-center justify-between">
          <h3 class="text-lg font-bold text-on-surface">${title}</h3>
          <span class="${stateClasses}" aria-hidden="true">${stateLabel}</span>
        </div>
        <div class="panel-body pt-2">
          <p class="text-on-surface font-medium mb-1">${actionLabel}</p>
          ${dataSnippet}
          <div class="mt-4 flex justify-end">
            <button class="action-button primary small" aria-label="Open ${title}">
              ${t('common.details')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Next Required Action banner based on highest priority state across all modules.
   */
  function renderNextActionBanner(modulesObj) {
    const modules = Object.values(modulesObj);
    
    // Prioritization hierarchy for Next Action
    let topPriority = null;
    let priorityModule = null;

    for (const mod of modules) {
      if (mod.state === 'information_requested') {
        topPriority = 'information_requested';
        priorityModule = mod;
        break; // Highest possible priority
      } else if (mod.state === 'awaiting_review' && topPriority !== 'information_requested') {
        topPriority = 'awaiting_review';
        priorityModule = mod;
      } else if (mod.state === 'under_review' && topPriority !== 'information_requested' && topPriority !== 'awaiting_review') {
        topPriority = 'under_review';
        priorityModule = mod;
      }
    }

    if (!priorityModule) {
      // If no urgent actions, check for not_started
      priorityModule = modules.find(m => m.state === 'not_started');
      if (priorityModule) topPriority = 'not_started';
    }

    if (!priorityModule) {
      return ''; // No action banner needed if all approved or no data
    }

    const title = t(`diseaseDashboard.${priorityModule.titleKey}`);
    const actionLabel = t(`diseaseDashboard.${priorityModule.nextAction}`);
    
    return `
      <div class="notice-card bg-primary-container text-on-primary-container mb-6 rounded-lg p-4 border-l-4 border-primary">
        <h3 class="font-bold mb-1">${t('diseaseDashboard.nextRequiredActionHeader')}</h3>
        <p class="mb-2"><strong>${title}:</strong> ${actionLabel}</p>
        <button class="action-button primary" data-route="disease-${priorityModule.id}">
          ${t('common.action')}
        </button>
      </div>
    `;
  }

  /**
   * Evaluates questions and answers to produce clinical triage & differential assessment results.
   */
  function evaluateDifferentialTriage(answers) {
    const findings = [];
    let overallRisk = "low"; // low | moderate | high | urgent
    const differentials = [];

    // Metabolic / Diabetes screener
    const polyuria = answers.polyuria === "yes";
    const polydipsia = answers.polydipsia === "yes";
    const fatigue = answers.fatigue === "yes";
    if (polyuria || polydipsia) {
      findings.push({
        domain: "metabolic",
        titleEn: "Osmotic Symptoms (Polyuria / Polydipsia)",
        titleAr: "أعراض زيادة التبول والعطش الشديد",
        severity: polyuria && polydipsia ? "moderate" : "low"
      });
      differentials.push({
        conditionEn: "Impaired Glucose Tolerance / Diabetes Mellitus",
        conditionAr: "اعتلال تحمل الجلوكوز / داء السكري المحتمل",
        probability: polyuria && polydipsia ? "High Probability" : "Possible",
        probabilityAr: polyuria && polydipsia ? "احتمالية مرتفعة" : "احتمال وارد",
        actionEn: "Fasting Blood Glucose / HbA1c screening recommended",
        actionAr: "يوصى بإجراء فحص السكر الصائم وتحليل التراكمي (HbA1c)",
        route: "diabetes"
      });
      if (overallRisk === "low") overallRisk = "moderate";
    }

    // Cardiovascular / Hypertension screener
    const morningHeadache = answers.headache === "yes";
    const chestTightness = answers.chest_tightness === "yes";
    const palpitations = answers.palpitations === "yes";
    if (morningHeadache || chestTightness || palpitations) {
      const isUrgentCv = chestTightness;
      findings.push({
        domain: "cardiovascular",
        titleEn: chestTightness ? "Chest Tightness / Discomfort" : "Morning Occipital Headache / Palpitations",
        titleAr: chestTightness ? "ثقل وضغط بالصدر" : "صداع خلفي صباحي / خفقان",
        severity: isUrgentCv ? "urgent" : "moderate"
      });
      differentials.push({
        conditionEn: chestTightness ? "Cardiovascular Strain / Ischemic Risk" : "Essential Hypertension / Vascular Stress",
        conditionAr: chestTightness ? "إجهاد وعائي قلبي / احتمال نقص تروية" : "ارتفاع ضغط الدم الشرياني / إجهاد وعائي",
        probability: isUrgentCv ? "Clinical Priority" : "Moderate Likelihood",
        probabilityAr: isUrgentCv ? "أولوية سريرية طارئة" : "احتمالية متوسطة",
        actionEn: isUrgentCv ? "Immediate clinical evaluation & vitals check" : "Ambulatory blood pressure monitoring (ABPM)",
        actionAr: isUrgentCv ? "فحص سريري فوري وقياس العلامات الحيوية" : "مراقبة وتسجيل قراءات ضغط الدم المتكررة",
        route: "hypertension"
      });
      if (isUrgentCv) overallRisk = "urgent";
      else if (overallRisk === "low") overallRisk = "moderate";
    }

    // Hematology / Coagulation screener
    const easyBruising = answers.bruising === "yes";
    const legSwelling = answers.leg_swelling === "yes";
    if (easyBruising || legSwelling) {
      findings.push({
        domain: "hematology",
        titleEn: legSwelling ? "Unilateral Leg Swelling" : "Spontaneous Bruising / Petechiae",
        titleAr: legSwelling ? "تورم الساق / احتمال احتقان وريدي" : "كدمات تلقائية / قابلية للنزف",
        severity: legSwelling ? "high" : "moderate"
      });
      differentials.push({
        conditionEn: legSwelling ? "Deep Venous Thrombosis (DVT) / Venous Insufficiency" : "Coagulation / Platelet Disorder",
        conditionAr: legSwelling ? "اشتباه تخثر وريدي عميق (DVT) / قصور وريدي" : "اعتلال في التجلط أو الصفائح الدموية",
        probability: legSwelling ? "High Priority" : "Moderate Likelihood",
        probabilityAr: legSwelling ? "أولوية عالية" : "احتمال متوسط",
        actionEn: legSwelling ? "Duplex Ultrasound & D-dimer assessment" : "Complete Blood Count (CBC) & Coagulation Profile (PT/INR)",
        actionAr: legSwelling ? "فحص دوبلر للموجات الصوتية وتحليل D-dimer" : "تحليل صورة دم كاملة وفحص سيولة الدم (PT/INR)",
        route: "blood-disorders"
      });
      if (legSwelling && overallRisk !== "urgent") overallRisk = "high";
      else if (overallRisk === "low") overallRisk = "moderate";
    }

    // Metabolic / Weight & Dyspnea
    const weightGain = answers.weight_gain === "yes";
    const exertionalBreath = answers.exertional_breath === "yes";
    if (weightGain || exertionalBreath) {
      findings.push({
        domain: "metabolic_weight",
        titleEn: "Exertional Breathlessness / Weight Fluctuations",
        titleAr: "ضيق تنفس بالمجهود / تقلبات بالوزن",
        severity: "moderate"
      });
      differentials.push({
        conditionEn: "Metabolic Syndrome / Weight-Related Hemodynamic Load",
        conditionAr: "متلازمة التمثيل الغذائي / عبء حركي مرتبط بالوزن",
        probability: "Moderate Likelihood",
        probabilityAr: "احتمالية متوسطة",
        actionEn: "BMI calculation & metabolic lifestyle assessment",
        actionAr: "حساب مؤشر كتلة الجسم وتقييم النمط الأيضي",
        route: "obesity"
      });
      if (overallRisk === "low") overallRisk = "moderate";
    }

    if (differentials.length === 0) {
      differentials.push({
        conditionEn: "No Acute Differential Flags Detected",
        conditionAr: "لم يتم رصد مؤشرات خطورة حادة في الفرز",
        probability: "Low Clinical Risk",
        probabilityAr: "مستوى خطورة منخفض",
        actionEn: "Routine preventive wellness & periodic health screening",
        actionAr: "متابعة وقائية روتينية والفحص الدوري العام",
        route: "diabetes"
      });
    }

    return {
      overallRisk,
      findings,
      differentials
    };
  }

  // Active answers state for the interactive screener
  const currentAnswers = {
    polyuria: null,
    polydipsia: null,
    headache: null,
    chest_tightness: null,
    bruising: null,
    leg_swelling: null,
    weight_gain: null,
    exertional_breath: null
  };

  /**
   * Renders the interactive Clinical Triage questionnaire & evaluation engine component.
   */
  function renderTriageQuestionnaireEngine() {
    const isEn = (global.currentLanguage === "en") || (document.documentElement.lang === "en");

    const questions = [
      {
        id: "polyuria",
        icon: "💧",
        textEn: "Do you experience unusually frequent urination (polyuria), especially at night?",
        textAr: "هل تعاني من كثرة التبول بشكل غير معتاد خصوصاً أثناء الليل؟",
        categoryEn: "Metabolic",
        categoryAr: "التمثيل الغذائي"
      },
      {
        id: "polydipsia",
        icon: "🥤",
        textEn: "Do you have persistent intense thirst or unexplained dry mouth?",
        textAr: "هل تشعر بعطش شديد مستمر أو جفاف ملحوظ في الحلق غير مبرر؟",
        categoryEn: "Metabolic",
        categoryAr: "التمثيل الغذائي"
      },
      {
        id: "chest_tightness",
        icon: "❤️",
        textEn: "Do you feel persistent chest tightness, pressure, or unexplained heaviness?",
        textAr: "هل تشعر بثقل أو ضغط أو انزعاج مستمر في منطقة الصدر؟",
        categoryEn: "Cardiovascular",
        categoryAr: "القلب والأوعية"
      },
      {
        id: "headache",
        icon: "🤕",
        textEn: "Do you suffer from recurrent morning occipital headaches or visual disturbances?",
        textAr: "هل تصاب بصداع خلف الرأس متكرر عند الاستيقاظ أو تشوش بالرؤية؟",
        categoryEn: "Cardiovascular",
        categoryAr: "القلب والأوعية"
      },
      {
        id: "leg_swelling",
        icon: "🦵",
        textEn: "Do you notice sudden or persistent swelling in one or both lower legs?",
        textAr: "هل لاحظت تورماً مفاجئاً أو مستمراً في إحدى الساقين أو كلتيهما؟",
        categoryEn: "Coagulation",
        categoryAr: "الدورة الدموية والتجلط"
      },
      {
        id: "bruising",
        icon: "🩹",
        textEn: "Do you experience spontaneous bruising, prolonged bleeding, or petechiae?",
        textAr: "هل تظهر كدمات بالجسم تلقائياً دون اصطدام أو نزيف يستغرق وقتاً ليتوقف؟",
        categoryEn: "Hematology",
        categoryAr: "أمراض الدم"
      },
      {
        id: "exertional_breath",
        icon: "🫁",
        textEn: "Do you experience unusual shortness of breath with mild daily physical exertion?",
        textAr: "هل تواجه ضيقاً ملحوظاً في التنفس عند بذل مجهود بدني اعتيادي خفيف؟",
        categoryEn: "Cardiopulmonary",
        categoryAr: "القلب والجهاز التنفسي"
      },
      {
        id: "weight_gain",
        icon: "⚖️",
        textEn: "Have you experienced sudden unexplained weight fluctuations or central adiposity?",
        textAr: "هل حدثت تقلبات سريعة غير مبررة في الوزن أو تراكم متزايد للدهون الحشوية؟",
        categoryEn: "Metabolic Health",
        categoryAr: "الصحة الأيضية والوزن"
      }
    ];

    const questionsHtml = questions.map((q, idx) => {
      const qText = isEn ? q.textEn : q.textAr;
      const catText = isEn ? q.categoryEn : q.categoryAr;
      const currentVal = currentAnswers[q.id];
      const yesActive = currentVal === "yes" ? "active" : "";
      const noActive = currentVal === "no" ? "active" : "";

      return `
        <div class="triage-question-card panel p-4 mb-3 rounded-lg border border-border" data-question-id="${q.id}">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs px-2 py-0.5 rounded bg-surface-variant text-muted font-bold">${catText} • ${idx + 1}/${questions.length}</span>
            <span style="font-size: 18px;">${q.icon}</span>
          </div>
          <p class="font-semibold text-on-surface text-sm mb-3">${qText}</p>
          <div class="choice-group flex gap-2">
            <button type="button" class="choice action-button outline small ${yesActive}" data-qid="${q.id}" data-val="yes" style="flex: 1; padding: 6px 12px; font-size: 13px;">
              ${isEn ? "Yes" : "نعم"}
            </button>
            <button type="button" class="choice action-button outline small ${noActive}" data-qid="${q.id}" data-val="no" style="flex: 1; padding: 6px 12px; font-size: 13px;">
              ${isEn ? "No" : "لا"}
            </button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="clinical-triage-screener mt-8 p-6 panel rounded-xl shadow-sm border border-primary/20">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4 border-b border-border pb-3">
          <div>
            <h3 class="text-xl font-bold text-on-surface flex items-center gap-2">
              <span>🩺</span>
              <span>${isEn ? "Clinical Triage & Differential Assessment Screener" : "محرك الفرز السريري والتقييم التفريقي"}</span>
            </h3>
            <p class="text-sm text-muted mt-1">
              ${isEn ? "Interactive evidence-based questionnaire to evaluate multi-domain risk & prioritize physician consultations." : "استبيان تفاعلي معتمد لتقييم مستويات الخطورة المتعددة وتحديد أولويات المراجعة الطبية."}
            </p>
          </div>
          <span class="pill bg-primary/10 text-primary font-bold text-xs px-3 py-1 rounded-full">
            ${isEn ? "Deterministic Evaluation Engine" : "محرك الفرز المعياري"}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${questionsHtml}
        </div>

        <div class="mt-4 flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-border">
          <button type="button" id="btnEvaluateTriage" class="action-button primary flex items-center gap-2 px-6 py-2 rounded-lg font-bold">
            <span>⚡</span>
            <span>${isEn ? "Run Differential Triage Evaluation" : "تشغيل التقييم والفرز السريري"}</span>
          </button>
          <button type="button" id="btnResetTriage" class="action-button outline small px-4 py-2 text-muted">
            <span>${isEn ? "Reset Answers" : "إعادة التعيين"}</span>
          </button>
        </div>

        <div id="triageResultsContainer" class="mt-6" hidden></div>
      </section>
    `;
  }

  /**
   * Main render function for the Disease Dashboard screen.
   */
  async function renderScreen(containerEl) {
    if (!containerEl) return;
    
    // Resolve user reliably: supports active authenticated user, auth currentUser, or active demo session
    const activeUser = (typeof global.getActiveUser === "function") 
      ? global.getActiveUser() 
      : (global.auth && global.auth.currentUser);
    const uid = activeUser?.uid || (activeUser?.isDemo ? "demo_patient_active" : (global.currentUser?.uid || "demo_patient_active"));

    // Loading state
    containerEl.innerHTML = `
      <div class="p-8 text-center">
        <div class="spinner inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-muted" data-i18n="common.loading">${t('common.loading')}</p>
      </div>
    `;

    try {
      const data = await global.HealthVibes.DiseaseDashboardService.fetchDashboardData(uid);
      
      const bannerHtml = renderNextActionBanner(data);
      const gridHtml = `
        <div class="card-grid mt-4">
          ${renderModuleCard(data.diabetes)}
          ${renderModuleCard(data.hypertension)}
          ${renderModuleCard(data.bloodDisorders)}
          ${renderModuleCard(data.obesity)}
        </div>
      `;

      const questionnaireHtml = renderTriageQuestionnaireEngine();

      containerEl.innerHTML = `
        <section class="disease-dashboard-container max-w-7xl mx-auto p-4 md:p-8 animate-fade-in">
          <header class="mb-6">
            <h1 class="text-3xl font-bold text-on-surface" data-i18n="diseaseDashboard.title">${t('diseaseDashboard.title')}</h1>
            <p class="text-muted mt-2" data-i18n="diseaseDashboard.subtitle">${t('diseaseDashboard.subtitle')}</p>
          </header>
          
          ${bannerHtml}
          
          <h2 class="text-xl font-bold text-on-surface mb-4" data-i18n="diseaseDashboard.modulesOverview">${t('diseaseDashboard.modulesOverview')}</h2>
          ${gridHtml}

          <!-- Clinical Triage Questionnaire & Screener Engine -->
          ${questionnaireHtml}

          <div class="mt-8 text-center text-sm text-muted">
            <p data-i18n="diseaseDashboard.moduleDataNotice">${t('diseaseDashboard.moduleDataNotice')}</p>
          </div>
        </section>
      `;

      // Helper to dispatch screen navigation seamlessly
      const navigateTo = (target) => {
        if (typeof global.showScreen === "function") {
          global.showScreen(target);
        } else if (global.app && typeof global.app.navigate === "function") {
          global.app.navigate(target);
        }
      };

      // Module Cards & Action Banner Click Handlers
      const routeButtons = containerEl.querySelectorAll('[data-route]');
      routeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const route = btn.getAttribute('data-route');
          const cleanScreen = route ? route.replace(/^disease-/, '') : '';
          navigateTo(cleanScreen || route);
        });
      });

      // Interactive Screener Choice Listeners
      const choiceButtons = containerEl.querySelectorAll('.choice[data-qid]');
      choiceButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const qid = btn.getAttribute('data-qid');
          const val = btn.getAttribute('data-val');
          currentAnswers[qid] = val;

          // Toggle active class inside card
          const card = btn.closest('.triage-question-card');
          if (card) {
            card.querySelectorAll('.choice').forEach(b => b.classList.remove('active', 'primary'));
            btn.classList.add('active', 'primary');
          }
        });
      });

      // Reset Button Listener
      const btnReset = containerEl.querySelector('#btnResetTriage');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          Object.keys(currentAnswers).forEach(k => currentAnswers[k] = null);
          containerEl.querySelectorAll('.choice[data-qid]').forEach(b => b.classList.remove('active', 'primary'));
          const resBox = containerEl.querySelector('#triageResultsContainer');
          if (resBox) {
            resBox.hidden = true;
            resBox.innerHTML = '';
          }
        });
      }

      // Evaluation Engine Button Listener
      const btnEvaluate = containerEl.querySelector('#btnEvaluateTriage');
      if (btnEvaluate) {
        btnEvaluate.addEventListener('click', () => {
          const evalResult = evaluateDifferentialTriage(currentAnswers);
          const isEn = (global.currentLanguage === "en") || (document.documentElement.lang === "en");
          const resBox = containerEl.querySelector('#triageResultsContainer');
          if (!resBox) return;

          const riskBadgeClasses = {
            low: "bg-success/20 text-success border-success/40",
            moderate: "bg-warning/20 text-warning border-warning/40",
            high: "bg-secondary/20 text-secondary border-secondary/40",
            urgent: "bg-error/20 text-error border-error/40 animate-pulse"
          };

          const riskLabels = {
            low: isEn ? "Low Priority / Routine Monitoring" : "أولوية روتينية / متابعة اعتيادية",
            moderate: isEn ? "Moderate Priority / Differential Workup" : "أولوية متوسطة / استكمال فحص تفريقي",
            high: isEn ? "High Priority / Clinical Assessment" : "أولوية عالية / مراجعة سريرية متخصصة",
            urgent: isEn ? "🚨 Urgent / Emergency Pre-Triage Flag" : "🚨 فرز عاجل / يستوجب استشارة طبية فورية"
          };

          const diffItemsHtml = evalResult.differentials.map(d => `
            <div class="panel p-3 mb-2 rounded border border-border flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 class="font-bold text-on-surface text-sm">${isEn ? d.conditionEn : d.conditionAr}</h4>
                <p class="text-xs text-muted mt-0.5">${isEn ? d.actionEn : d.actionAr}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="pill bg-surface-variant text-on-surface text-xs px-2 py-1">${isEn ? d.probability : d.probabilityAr}</span>
                <button type="button" class="action-button primary small text-xs px-3 py-1" data-triage-target="${d.route}">
                  ${isEn ? "Open Module" : "فتح المسار"}
                </button>
              </div>
            </div>
          `).join("");

          resBox.hidden = false;
          resBox.innerHTML = `
            <div class="panel p-5 rounded-lg border-2 ${evalResult.overallRisk === 'urgent' ? 'border-error' : 'border-primary/30'} bg-surface animate-fade-in">
              <div class="flex items-center justify-between flex-wrap gap-3 mb-3 border-b border-border pb-3">
                <h3 class="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span>📊</span>
                  <span>${isEn ? "Differential Assessment & Triage Output" : "نتائج الفرز السريري والتقييم التفريقي"}</span>
                </h3>
                <span class="pill font-extrabold text-xs px-3 py-1 rounded-full border ${riskBadgeClasses[evalResult.overallRisk] || riskBadgeClasses.low}">
                  ${riskLabels[evalResult.overallRisk] || riskLabels.low}
                </span>
              </div>
              <div class="differentials-list mt-3">
                ${diffItemsHtml}
              </div>
            </div>
          `;

          // Bind navigation on generated differential buttons
          resBox.querySelectorAll('[data-triage-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const target = btn.getAttribute('data-triage-target');
              navigateTo(target);
            });
          });

          resBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }

    } catch (err) {
      console.error("[DiseaseDashboardUI] Failed to render dashboard:", err);
      containerEl.innerHTML = `<div class="p-8 text-center text-error">${t('common.error')}</div>`;
    }
  }

  const DiseaseDashboardUI = {
    renderScreen,
    evaluateDifferentialTriage
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiseaseDashboardUI = DiseaseDashboardUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DiseaseDashboardUI;
  }

})(typeof window !== "undefined" ? window : globalThis);

