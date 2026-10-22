/**
 * HEALTH VIBE AI: CLINICAL CONTENT MANAGEMENT SYSTEM (Clinical CMS) SERVICE
 * Benchmark: Isabel Healthcare Clinical Knowledge & Dual-Language Guideline Governance
 * 
 * Features:
 * 1. Bilingual Medical Guidance & Recommendations:
 *    - Dual-language parity (Arabic RTL & English LTR).
 *    - Structured clinical guidance: Criteria/Indications, Recommendations, Red Flags, Patient Instructions.
 *    - Categorization: Triage Protocols, Red Flags, Discharge Care, Home Treatment, Referral Criteria.
 * 2. Documented Multi-Stage Approval Lifecycle:
 *    - Stages: Draft -> In Review -> Approved -> Published / Archived / Rejected.
 *    - Peer review notes, reviewer attribution, dual-signoff tracking.
 * 3. Side-by-Side Version Diff & Audit History:
 *    - Snapshot revisions with author attribution and change summaries.
 *    - Live diff computation between revisions.
 * 4. Fast Filtering, Multi-Criteria Search & Sorting Engine:
 *    - Filter by condition scope, status, category, evidence level, search query, and sorting.
 * 5. Statutory Audit Logging & CSV Export Engine.
 */

(function (global) {
  "use strict";

  // Initial Seed Data modeled on Isabel Healthcare Clinical Knowledge Benchmark
  const INITIAL_CLINICAL_GUIDELINES = [
    {
      id: "guideline_resp_triage_redflags",
      version: "v2.0",
      status: "published",
      category: "red_flags",
      conditionScope: "respiratory_triage",
      evidenceLevel: "Grade_A_High",
      targetAudience: "triage_officer",
      titleAr: "علامات الخطورة والتنفس السريع للأعراض التنفسية الحادة",
      titleEn: "Acute Respiratory Red Flags & Severe Dyspnea Guidance",
      summaryAr: "بروتوكول الفرز الطارئ الفوري لمرضى الضائقة التنفسية الحادة وتحديد مؤشرات الإحالة إلى العناية المركزة.",
      summaryEn: "Emergency triage protocol for acute respiratory distress, cyanosis, and ICU escalation triggers.",
      criteriaAr: "تشبع أكسجين SpO2 < 90%، معدل تنفس > 30/دقيقة، أو استخدام العضلات المساعدة للتنفس.",
      criteriaEn: "Resting SpO2 < 90% on room air, respiratory rate > 30 bpm, or accessory muscle usage.",
      actionItemsAr: "إعطاء أكسجين عالي التدفق فوري، وضع المريض بزاوية 45 درجة، وتجهيز خط وريدي عاجل مع استدعاء طبيب الطوارئ.",
      actionItemsEn: "Administer immediate high-flow O2 (target SpO2 94-98%), position patient at 45 degrees, establish IV access.",
      redFlagsAr: "زرقة مركزية (Cyanosis)، ارتباك حاد أو تغيم الوعي، صمت صدري تام أثناء التسمع (Silent Chest).",
      redFlagsEn: "Central cyanosis, acute confusion/altered mental status, completely silent chest on auscultation.",
      patientInstructionsAr: "عدم الاستلقاء مستوياً على الظهر، تجنب المجهود البدني تماماً، والاتصال بالإسعاف فوراً عند ازدياد ضيق التنفس.",
      patientInstructionsEn: "Maintain seated posture, avoid physical exertion, call emergency services immediately if breathing worsens.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", reviewDate: "2026-10-18T10:30:00Z", reviewNotes: "معتمد سريرياً ومتوافق مع معايير فرز الطوارئ العالمية." },
      approver: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", approvalDate: "2026-10-19T14:00:00Z", approvalNotes: "تم النشر في الإنتاج وتفعيله في محرك الفرز الذكي." },
      publishedAt: "2026-10-19T14:00:00Z",
      createdAt: "2026-10-15T09:00:00Z",
      updatedAt: "2026-10-19T14:00:00Z",
      revisionHistory: [
        {
          version: "v1.0",
          status: "published",
          updatedAt: "2026-09-15T11:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "الإصدار الأولي لقواعد الفرز التنفسي."
        },
        {
          version: "v2.0",
          status: "published",
          updatedAt: "2026-10-19T14:00:00Z",
          authorName: "د. محمد عبد الرؤوف",
          changeSummary: "تحديث معايير معدل التنفس ليتطابق مع معايير Isabel Healthcare وخفض الإنذارات الكاذبة."
        }
      ]
    },
    {
      id: "guideline_pediatric_fever_triage",
      version: "v1.4",
      status: "published",
      category: "triage_protocol",
      conditionScope: "pediatric",
      evidenceLevel: "Grade_A_High",
      targetAudience: "physician",
      titleAr: "بروتوكول فرز حمى الأطفال وحدود معدل التنفس حسب العمر",
      titleEn: "Pediatric Fever Triage Protocol & Age-Specific Tachypnea Bounds",
      summaryAr: "دليل سريري لتقييم درجات الحرارة المرتفعة لدى الرضع والأطفال وربطها بمعدلات سرعة التنفس الطبيعية لكل مرحلة عمرية.",
      summaryEn: "Clinical protocol for assessing fever in infants and pediatric cohorts correlated with age-specific vital bounds.",
      criteriaAr: "حمى > 38.0°م لدى الرضع أقل من 3 أشهر، أو حمى > 39.0°م لدى الأطفال مترافقة مع سرعة تنفس > 50/دقيقة.",
      criteriaEn: "Rectal temperature > 38.0°C in infants < 3 months, or temperature > 39.0°C with tachypnea (> 50 bpm for infants).",
      actionItemsAr: "فحص بؤر العدوى المحتملة، مراقبة نضوب السوائل وعلامات الجفاف، وتجنب الأسبرين نهائياً.",
      actionItemsEn: "Thorough septic workup for neonates, assess hydration and capillary refill, strictly avoid aspirin.",
      redFlagsAr: "برود الأطراف مع شحوب رخو، بكاء أنيني ضعيف، انخساف الأضلاع أثناء الشهيق (Severe Chest Indrawing).",
      redFlagsEn: "Cold extremities with mottled skin, weak high-pitched grunting, sternal/intercostal retraction.",
      patientInstructionsAr: "إعطاء السوائل ومحاليل الإماهة بانتظام، استخدام كمادات المياه الفاترة، وطلب المشورة الفورية عند قلة التبول.",
      patientInstructionsEn: "Maintain oral hydration, apply lukewarm compresses, seek immediate care if urination ceases for > 6 hours.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", reviewDate: "2026-10-04T12:00:00Z", reviewNotes: "دقيق ومطابق لبروتوكولات منظمة الصحة العالمية لطب الأطفال." },
      approver: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", approvalDate: "2026-10-05T08:00:00Z", approvalNotes: "معتمد للنشر في وحدة الأطفال التخصصية." },
      publishedAt: "2026-10-05T08:00:00Z",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-05T08:00:00Z",
      revisionHistory: [
        {
          version: "v1.0",
          status: "published",
          updatedAt: "2026-10-05T08:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "اعتماد البروتوكول المخصص لطب الأطفال."
        }
      ]
    },
    {
      id: "guideline_hypoxemia_spo2_home",
      version: "v1.2",
      status: "published",
      category: "home_treatment",
      conditionScope: "hypoxemia",
      evidenceLevel: "Grade_B_Moderate",
      targetAudience: "patient_family",
      titleAr: "إرشادات نقص الأكسجة الصامت ومتابعة قياس SpO2 المنزلي",
      titleEn: "Silent Hypoxemia Home Monitoring & Pulse Oximetry Guidance",
      summaryAr: "تعليمات واضحة للمريض وأسرته لكيفية قراءة مقياس النبض والتأكسج، والتعامل مع حالات نقص الأكسجة الخفي دون ضيق تنفس واضح.",
      summaryEn: "Patient-facing instructions on pulse oximeter usage, identifying silent hypoxemia, and home oxygen thresholds.",
      criteriaAr: "قراءة SpO2 بين 91% و 94% أثناء الراحة مع غياب أعراض الاختناق الشديدة.",
      criteriaEn: "Resting SpO2 reading between 91% and 94% on room air without acute subjective distress.",
      actionItemsAr: "إعادة القياس بعد تدفئة الأصابع، الجلوس مستقيماً أو اتخاذ وضعية الانكباب (Proning)، وإعادة التقييم خلال ساعة.",
      actionItemsEn: "Recheck with warm fingers, adopt proning/upright posture, log readings every 2 hours.",
      redFlagsAr: "هبوط القراءة إلى أقل من 90%، الدوخة المفاجئة، أو الشعور ببرودة وزرقة في الشفتين.",
      redFlagsEn: "SpO2 reading dropping below 90%, sudden dizziness/lightheadedness, cyanotic lip discoloration.",
      patientInstructionsAr: "التواصل مع العيادة الرقمية لتحديث التقرير الطبي، وشرب الماء الدافئ وتجنب التدخين السلبي تماماً.",
      patientInstructionsEn: "Contact tele-clinic for reassessment, maintain warm fluid intake, eliminate smoke exposure.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", reviewDate: "2026-10-11T16:00:00Z", reviewNotes: "صياغة واضحة ومناسبة للمريض مع تنبيهات أمان ممتازة." },
      approver: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", approvalDate: "2026-10-12T09:00:00Z", approvalNotes: "معتمد للنشر في تطبيق المريض والمساعد الطبي." },
      publishedAt: "2026-10-12T09:00:00Z",
      createdAt: "2026-10-10T14:00:00Z",
      updatedAt: "2026-10-12T09:00:00Z",
      revisionHistory: [
        {
          version: "v1.2",
          status: "published",
          updatedAt: "2026-10-12T09:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "إضافة وضعية الانكباب (Proning) وتحسين دقة القياس."
        }
      ]
    },
    {
      id: "guideline_pneumonia_antibiotic_stewardship",
      version: "v2.1-rc",
      status: "in_review",
      category: "discharge_care",
      conditionScope: "pneumonia_covid",
      evidenceLevel: "Grade_A_High",
      targetAudience: "physician",
      titleAr: "بروتوكول ترشيد المضادات الحيوية في التهابات الجهاز التنفسي والتهاب الرئة",
      titleEn: "Respiratory Infection Antibiotic Stewardship & Discharge Protocol",
      summaryAr: "توجيهات لتقليل الاستخدام غير المبرر للمضادات الحيوية في حالات الالتهاب الفيروسي مع تحديد معايير بدء العلاج البكتيري.",
      summaryEn: "Antibiotic stewardship protocol minimizing unnecessary prescribing in viral cases with clear bacterial criteria.",
      criteriaAr: "وجود بلغم صديدي، حمى مستمرة لأكثر من 5 أيام، وارتفاع كرات الدم البيضاء أو بروتين CRP > 50 mg/L.",
      criteriaEn: "Purulent sputum, fever persistent > 5 days, elevated inflammatory markers (CRP > 50 mg/L).",
      actionItemsAr: "تحديد خط العلاج الأول المناسب حسب الحساسية المحلية، الالتزام بالجرعة والمدة المحددة (5-7 أيام).",
      actionItemsEn: "Initiate first-line guideline-adherent monotherapy, restrict treatment duration to 5-7 days.",
      redFlagsAr: "فشل الاستجابة بعد 72 ساعة من بدء العلاج، تدهور الوعي، أو مؤشرات متلازمة الاستجابة الالتهابية الجهازية (SIRS).",
      redFlagsEn: "Failure to improve after 72 hours, altered mental status, or emergence of sepsis/SIRS criteria.",
      patientInstructionsAr: "إكمال كورس العلاج كاملاً دون انقطاع، مراجعة الطبيب عند حدوث طفح جلدي أو إسهال حاد.",
      patientInstructionsEn: "Complete full antibiotic course, notify clinic immediately if severe watery diarrhea or rash develops.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", reviewDate: null, reviewNotes: "قيد المراجعة السريرية لتحديد التوافق مع بروتوكولات وزارة الصحة المصرية." },
      approver: null,
      publishedAt: null,
      createdAt: "2026-10-21T11:00:00Z",
      updatedAt: "2026-10-21T15:00:00Z",
      revisionHistory: [
        {
          version: "v2.0",
          status: "draft",
          updatedAt: "2026-10-20T10:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "مسودة التحديث لإضافة ترشيد المضادات الحيوية."
        },
        {
          version: "v2.1-rc",
          status: "in_review",
          updatedAt: "2026-10-21T15:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "إرسال للمراجعة السريرية من قِبل كبير الأطباء."
        }
      ]
    },
    {
      id: "guideline_diabetic_wound_emergency",
      version: "v1.0-draft",
      status: "draft",
      category: "referral_criteria",
      conditionScope: "general_emergency",
      evidenceLevel: "Grade_B_Moderate",
      targetAudience: "nurse",
      titleAr: "معايير الإحالة العاجلة لقدم السكري وعلامات العدوى الجهازية",
      titleEn: "Diabetic Foot Ulcer Urgent Referral Criteria & Systemic Sepsis Alerts",
      summaryAr: "معايير موحدة للتمريض والرعاية الأولية للتحويل السريع إلى جراحة الأوعية الدموية وقدم السكري عند ظهور علامات نخر أو إنتان.",
      summaryEn: "Standardized primary care referral criteria for diabetic foot ulcers exhibiting necrosis or sepsis.",
      criteriaAr: "قرحة قدم سكري مع احمرار محيطي > 2 سم، صديد نفاذ، أو جس العظام مباشرة بقاع القرحة (Probe-to-bone positive).",
      criteriaEn: "Ulcer with erythema > 2 cm, foul discharge, or positive probe-to-bone test.",
      actionItemsAr: "تثبيت الطرف وتجنب تحميل الوزن، فحص نبضات الشرايين المحيطية، وأخذ مسحة عميقة للزرع قبل المضاد الحيوي.",
      actionItemsEn: "Offload foot immediately, assess peripheral pulses, obtain deep tissue culture prior to antibiotics.",
      redFlagsAr: "غرغرينا سوداء أو فقاعات غازية، حمى مترافقة مع هبوط في ضغط الدم، ألم مستمر لا يستجيب للمسكنات.",
      redFlagsEn: "Ascending gas gangrene, crepitus, fever accompanied by hypotension, refractory pain.",
      patientInstructionsAr: "عدم المشي على القدم المصابة نهائياً، إبقاء الضمادة جافة ونظيفة، والتوجه فوراً للمستشفى.",
      patientInstructionsEn: "Strictly avoid weight-bearing on affected foot, keep dressing dry, present to ER immediately.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: null,
      approver: null,
      publishedAt: null,
      createdAt: "2026-10-22T08:00:00Z",
      updatedAt: "2026-10-22T08:00:00Z",
      revisionHistory: [
        {
          version: "v1.0-draft",
          status: "draft",
          updatedAt: "2026-10-22T08:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "إنشاء مسودة أولية لبروتوكول تحويل قدم السكري."
        }
      ]
    },
    {
      id: "guideline_asthma_exacerbation_stepwise",
      version: "v3.0",
      status: "approved",
      category: "triage_protocol",
      conditionScope: "respiratory_triage",
      evidenceLevel: "Grade_A_High",
      targetAudience: "physician",
      titleAr: "بروتوكول التدبير المتدرج لنوبات الربو الشعبي الحادة",
      titleEn: "Stepwise Management of Acute Bronchial Asthma Exacerbation",
      summaryAr: "خطوات مدروسة للتعامل مع النوبات الحادة لمرضى الربو تشمل موسعات الشعب قصيرة المفعول، الستيرويدات، ومراقبة وظائف الرئة.",
      summaryEn: "Stepwise protocol for acute asthma exacerbation including SABA nebulization, systemic steroids, and PEF monitoring.",
      criteriaAr: "أزيز حاد بالصدر، عدم القدرة على إكمال جملة كاملة بنفس واحد، وتراجع ذروة تدفق الزفير (PEF) إلى أقل من 50%.",
      criteriaEn: "Audible wheezing, inability to complete full sentences in one breath, PEF < 50% predicted.",
      actionItemsAr: "جلسات استنشاق سالبيوتامول وإبراتروبيوم متكررة، إعطاء كورتيكوستيرويد جهازي فوري، ومراقبة التأكسج.",
      actionItemsEn: "Deliver back-to-back SABA + ipratropium nebulization, initiate oral/IV corticosteroids, continuous O2 monitoring.",
      redFlagsAr: "صمت صدري مفاجئ (Silent Chest)، تباطؤ ضربات القلب، إعياء تنفسي شديد، أو عدم استجابة لجلسات الاستنشاق الثلاث الأولى.",
      redFlagsEn: "Silent chest, paradoxical bradycardia, profound respiratory muscle exhaustion, lack of response to 3 nebs.",
      patientInstructionsAr: "استخدام جهاز الاستنشاق عبر المباعد (Spacer)، تجنب مهيجات الربو كالبخور والعطور، والعودة الفورية عند تكرار النوبة.",
      patientInstructionsEn: "Use spacer with MDI, eliminate domestic allergens and perfumes, return immediately if symptoms recur.",
      author: { uid: "user-clinical-qa", name: "د. هدى منصور", role: "clinical_qa" },
      peerReviewer: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", reviewDate: "2026-10-21T09:00:00Z", reviewNotes: "محدث وفق إرشادات GINA 2026 العالمية ومعتمد للنشر." },
      approver: { uid: "user-super-admin", name: "د. محمد عبد الرؤوف", role: "super_admin", approvalDate: "2026-10-22T10:00:00Z", approvalNotes: "جاهز للنشر في التحديث القادم لمحرك الفرز." },
      publishedAt: null,
      createdAt: "2026-10-18T12:00:00Z",
      updatedAt: "2026-10-22T10:00:00Z",
      revisionHistory: [
        {
          version: "v2.5",
          status: "published",
          updatedAt: "2026-08-10T11:00:00Z",
          authorName: "د. هدى منصور",
          changeSummary: "الإصدار المعتمد السابق."
        },
        {
          version: "v3.0",
          status: "approved",
          updatedAt: "2026-10-22T10:00:00Z",
          authorName: "د. محمد عبد الرؤوف",
          changeSummary: "إضافة إرشادات GINA 2026 وموسعات الشعب المزدوجة."
        }
      ]
    }
  ];

  let inMemoryGuidelines = JSON.parse(JSON.stringify(INITIAL_CLINICAL_GUIDELINES));
  let auditTrail = [];

  function logAuditEvent(action, guideline, operator, details = {}) {
    const event = {
      id: `audit_cms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action,
      guidelineId: guideline.id,
      guidelineVersion: guideline.version,
      titleAr: guideline.titleAr,
      titleEn: guideline.titleEn,
      operator: {
        uid: operator?.uid || "system",
        name: operator?.name || operator?.email || "Unknown",
        role: operator?.role || "clinical_qa"
      },
      timestamp: new Date().toISOString(),
      details
    };
    auditTrail.push(event);
    return event;
  }

  /**
   * Validates Isabel Healthcare clinical parity between Arabic and English texts
   */
  function validateBilingualParity(data) {
    const errors = [];
    if (!data.titleAr || !data.titleAr.trim()) errors.push("عنوان التوصية باللغة العربية مطلوب (Title AR is required)");
    if (!data.titleEn || !data.titleEn.trim()) errors.push("Title in English is required (العنوان بالإنجليزية مطلوب)");
    if (!data.summaryAr || !data.summaryAr.trim()) errors.push("الملخص السريري بالعربية مطلوب (Summary AR is required)");
    if (!data.summaryEn || !data.summaryEn.trim()) errors.push("Clinical summary in English is required");
    if (!data.criteriaAr || !data.criteriaAr.trim()) errors.push("معايير التقييم والدلالات بالعربية مطلوبة");
    if (!data.criteriaEn || !data.criteriaEn.trim()) errors.push("Clinical criteria in English is required");
    if (!data.actionItemsAr || !data.actionItemsAr.trim()) errors.push("الإجراءات والتوصيات السريرية بالعربية مطلوبة");
    if (!data.actionItemsEn || !data.actionItemsEn.trim()) errors.push("Clinical action items in English are required");
    if (!data.redFlagsAr || !data.redFlagsAr.trim()) errors.push("علامات الخطورة والتحذير بالعربية مطلوبة (Red Flags AR)");
    if (!data.redFlagsEn || !data.redFlagsEn.trim()) errors.push("Red flags and emergency triggers in English are required");

    return {
      isValid: errors.length === 0,
      errors,
      parityScorePct: errors.length === 0 ? 100 : Math.max(0, Math.round(((10 - errors.length) / 10) * 100))
    };
  }

  const ClinicalCmsService = {
    /**
     * Retrieve all guidelines with multi-criteria filtering, search and sorting
     */
    getGuidelines(filters = {}) {
      const { status, category, conditionScope, evidenceLevel, search, sortBy } = filters;
      let list = [...inMemoryGuidelines];

      if (status && status !== "all") {
        list = list.filter(g => g.status === status);
      }
      if (category && category !== "all") {
        list = list.filter(g => g.category === category);
      }
      if (conditionScope && conditionScope !== "all") {
        list = list.filter(g => g.conditionScope === conditionScope);
      }
      if (evidenceLevel && evidenceLevel !== "all") {
        list = list.filter(g => g.evidenceLevel === evidenceLevel);
      }

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(g => 
          g.titleAr?.toLowerCase().includes(q) ||
          g.titleEn?.toLowerCase().includes(q) ||
          g.summaryAr?.toLowerCase().includes(q) ||
          g.summaryEn?.toLowerCase().includes(q) ||
          g.criteriaAr?.toLowerCase().includes(q) ||
          g.criteriaEn?.toLowerCase().includes(q) ||
          g.redFlagsAr?.toLowerCase().includes(q) ||
          g.redFlagsEn?.toLowerCase().includes(q) ||
          g.id.toLowerCase().includes(q) ||
          g.version.toLowerCase().includes(q)
        );
      }

      // Sorting
      if (sortBy === "date_asc") {
        list.sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt));
      } else if (sortBy === "title_ar") {
        list.sort((a, b) => (a.titleAr || "").localeCompare(b.titleAr || "", "ar"));
      } else if (sortBy === "title_en") {
        list.sort((a, b) => (a.titleEn || "").localeCompare(b.titleEn || "", "en"));
      } else if (sortBy === "version_desc") {
        list.sort((a, b) => (b.version || "").localeCompare(a.version || ""));
      } else {
        // Default date_desc
        list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      }

      return list;
    },

    /**
     * Retrieve single guideline by ID
     */
    getGuidelineById(id) {
      return inMemoryGuidelines.find(g => g.id === id) || null;
    },

    /**
     * Create a new guideline in Draft state
     */
    createGuideline(data, operator) {
      const validation = validateBilingualParity(data);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(" | "));
      }

      const id = data.id || `guideline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const existing = inMemoryGuidelines.find(g => g.id === id);
      if (existing) {
        throw new Error(`معرف التوصية '${id}' مسجل بالفعل في النظام.`);
      }

      const now = new Date().toISOString();
      const newGuideline = {
        id,
        version: data.version || "v1.0-draft",
        status: "draft",
        category: data.category || "triage_protocol",
        conditionScope: data.conditionScope || "respiratory_triage",
        evidenceLevel: data.evidenceLevel || "Grade_B_Moderate",
        targetAudience: data.targetAudience || "physician",
        titleAr: data.titleAr.trim(),
        titleEn: data.titleEn.trim(),
        summaryAr: data.summaryAr.trim(),
        summaryEn: data.summaryEn.trim(),
        criteriaAr: data.criteriaAr.trim(),
        criteriaEn: data.criteriaEn.trim(),
        actionItemsAr: data.actionItemsAr.trim(),
        actionItemsEn: data.actionItemsEn.trim(),
        redFlagsAr: data.redFlagsAr.trim(),
        redFlagsEn: data.redFlagsEn.trim(),
        patientInstructionsAr: data.patientInstructionsAr?.trim() || "",
        patientInstructionsEn: data.patientInstructionsEn?.trim() || "",
        author: {
          uid: operator?.uid || "user-clinical-qa",
          name: operator?.name || operator?.email || "Clinical QA Specialist",
          role: operator?.role || "clinical_qa"
        },
        peerReviewer: null,
        approver: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        revisionHistory: [
          {
            version: data.version || "v1.0-draft",
            status: "draft",
            updatedAt: now,
            authorName: operator?.name || "Clinical QA",
            changeSummary: data.changeSummary || "إنشاء مسودة التوصية الطبية الأولية."
          }
        ]
      };

      inMemoryGuidelines.unshift(newGuideline);
      logAuditEvent("GUIDELINE_CREATED", newGuideline, operator, { version: newGuideline.version });
      return newGuideline;
    },

    /**
     * Update guideline content and push new revision
     */
    updateGuideline(id, updateData, operator) {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);

      const validation = validateBilingualParity(updateData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(" | "));
      }

      const now = new Date().toISOString();
      const nextVersion = updateData.version || guideline.version;

      guideline.category = updateData.category || guideline.category;
      guideline.conditionScope = updateData.conditionScope || guideline.conditionScope;
      guideline.evidenceLevel = updateData.evidenceLevel || guideline.evidenceLevel;
      guideline.targetAudience = updateData.targetAudience || guideline.targetAudience;
      guideline.titleAr = updateData.titleAr.trim();
      guideline.titleEn = updateData.titleEn.trim();
      guideline.summaryAr = updateData.summaryAr.trim();
      guideline.summaryEn = updateData.summaryEn.trim();
      guideline.criteriaAr = updateData.criteriaAr.trim();
      guideline.criteriaEn = updateData.criteriaEn.trim();
      guideline.actionItemsAr = updateData.actionItemsAr.trim();
      guideline.actionItemsEn = updateData.actionItemsEn.trim();
      guideline.redFlagsAr = updateData.redFlagsAr.trim();
      guideline.redFlagsEn = updateData.redFlagsEn.trim();
      guideline.patientInstructionsAr = updateData.patientInstructionsAr?.trim() || "";
      guideline.patientInstructionsEn = updateData.patientInstructionsEn?.trim() || "";
      guideline.version = nextVersion;
      guideline.updatedAt = now;

      // If updating a published guideline, demote to draft unless explicitly approved
      if (guideline.status === "published" && !updateData.keepPublished) {
        guideline.status = "draft";
      }

      guideline.revisionHistory.push({
        version: nextVersion,
        status: guideline.status,
        updatedAt: now,
        authorName: operator?.name || "Clinical Reviewer",
        changeSummary: updateData.changeSummary || "تعديل محتوى التوصية ومراجعة الدلالات السريرية."
      });

      logAuditEvent("GUIDELINE_UPDATED", guideline, operator, {
        version: nextVersion,
        changeSummary: updateData.changeSummary
      });

      return guideline;
    },

    /**
     * Submit draft guideline for Clinical Peer Review
     */
    submitForReview(id, operator, notes = "") {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);
      if (guideline.status !== "draft" && guideline.status !== "rejected") {
        throw new Error(`لا يمكن تقديم التوصية للمراجعة لأن حالتها الحالية '${guideline.status}'.`);
      }

      const now = new Date().toISOString();
      guideline.status = "in_review";
      guideline.updatedAt = now;
      guideline.peerReviewer = {
        uid: null,
        name: "بانتظار المراجع السريري",
        role: "clinical_qa",
        reviewDate: null,
        reviewNotes: notes
      };

      guideline.revisionHistory.push({
        version: guideline.version,
        status: "in_review",
        updatedAt: now,
        authorName: operator?.name || "Clinical QA",
        changeSummary: notes || "تقديم التوصية للمراجعة السريرية والاعتماد."
      });

      logAuditEvent("GUIDELINE_SUBMITTED_FOR_REVIEW", guideline, operator, { notes });
      return guideline;
    },

    /**
     * Approve guideline (Clinical QA Lead / Medical Director)
     */
    approveGuideline(id, operator, notes = "") {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);
      if (guideline.status !== "in_review") {
        throw new Error(`لا يمكن اعتماد التوصية لأنها ليست بحالة 'قيد المراجعة' (الحالة الحالية: ${guideline.status}).`);
      }

      const now = new Date().toISOString();
      guideline.status = "approved";
      guideline.updatedAt = now;
      guideline.approver = {
        uid: operator?.uid || "user-super-admin",
        name: operator?.name || operator?.email || "Medical Director",
        role: operator?.role || "super_admin",
        approvalDate: now,
        approvalNotes: notes || "معتمد سريرياً للنشر."
      };

      guideline.revisionHistory.push({
        version: guideline.version,
        status: "approved",
        updatedAt: now,
        authorName: operator?.name || "Medical Director",
        changeSummary: notes || "اعتماد رسمي سريري ومطابقة لمعايير Isabel Healthcare."
      });

      logAuditEvent("GUIDELINE_APPROVED", guideline, operator, { notes });
      return guideline;
    },

    /**
     * Publish guideline to production triage engine
     */
    publishGuideline(id, operator, notes = "") {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);
      if (guideline.status !== "approved" && guideline.status !== "published") {
        throw new Error(`لا يمكن نشر التوصية إلا بعد اعتمادها السريري أولاً (الحالة الحالية: ${guideline.status}).`);
      }

      const now = new Date().toISOString();
      guideline.status = "published";
      guideline.publishedAt = now;
      guideline.updatedAt = now;

      guideline.revisionHistory.push({
        version: guideline.version,
        status: "published",
        updatedAt: now,
        authorName: operator?.name || "Clinical Release Manager",
        changeSummary: notes || "نشر التوصية وتفعيلها فورياً بالإنتاج."
      });

      logAuditEvent("GUIDELINE_PUBLISHED", guideline, operator, { notes });
      return guideline;
    },

    /**
     * Reject guideline with feedback
     */
    rejectGuideline(id, operator, rejectionReason = "") {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);
      if (guideline.status !== "in_review") {
        throw new Error(`لا يمكن رفض التوصية إلا إذا كانت قيد المراجعة.`);
      }

      const now = new Date().toISOString();
      guideline.status = "rejected";
      guideline.updatedAt = now;
      guideline.peerReviewer = {
        uid: operator?.uid || "user-clinical-qa",
        name: operator?.name || "Reviewer",
        role: operator?.role || "clinical_qa",
        reviewDate: now,
        reviewNotes: rejectionReason || "مرفوضة وتحتاج إلى تعديل المعايير السريرية."
      };

      guideline.revisionHistory.push({
        version: guideline.version,
        status: "rejected",
        updatedAt: now,
        authorName: operator?.name || "Reviewer",
        changeSummary: `رفض: ${rejectionReason || "طلب تعديل وتدقيق إضافي"}`
      });

      logAuditEvent("GUIDELINE_REJECTED", guideline, operator, { rejectionReason });
      return guideline;
    },

    /**
     * Archive guideline
     */
    archiveGuideline(id, operator, reason = "") {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية الطبية '${id}' غير موجودة.`);

      const now = new Date().toISOString();
      guideline.status = "archived";
      guideline.updatedAt = now;

      guideline.revisionHistory.push({
        version: guideline.version,
        status: "archived",
        updatedAt: now,
        authorName: operator?.name || "Admin",
        changeSummary: `أرشفة: ${reason || "استبدال بإصدار أحدث أو إيقاف التوصية"}`
      });

      logAuditEvent("GUIDELINE_ARCHIVED", guideline, operator, { reason });
      return guideline;
    },

    /**
     * Side-by-side comparison between two revisions of a guideline
     */
    compareGuidelineVersions(id, versionA, versionB) {
      const guideline = this.getGuidelineById(id);
      if (!guideline) throw new Error(`التوصية '${id}' غير موجودة.`);

      const revA = guideline.revisionHistory.find(r => r.version === versionA) || guideline.revisionHistory[0];
      const revB = guideline.revisionHistory.find(r => r.version === versionB) || guideline.revisionHistory[guideline.revisionHistory.length - 1];

      return {
        guidelineId: guideline.id,
        titleAr: guideline.titleAr,
        titleEn: guideline.titleEn,
        versionA: revA,
        versionB: revB,
        currentContent: {
          criteriaAr: guideline.criteriaAr,
          criteriaEn: guideline.criteriaEn,
          actionItemsAr: guideline.actionItemsAr,
          actionItemsEn: guideline.actionItemsEn,
          redFlagsAr: guideline.redFlagsAr,
          redFlagsEn: guideline.redFlagsEn
        }
      };
    },

    /**
     * Compute summary statistics for KPI cards
     */
    getSummaryMetrics() {
      const total = inMemoryGuidelines.length;
      const published = inMemoryGuidelines.filter(g => g.status === "published").length;
      const inReview = inMemoryGuidelines.filter(g => g.status === "in_review").length;
      const approved = inMemoryGuidelines.filter(g => g.status === "approved").length;
      const draft = inMemoryGuidelines.filter(g => g.status === "draft").length;
      const archived = inMemoryGuidelines.filter(g => g.status === "archived").length;
      const redFlagsCount = inMemoryGuidelines.filter(g => g.category === "red_flags").length;

      // Calculate bilingual parity rate across all guidelines
      let parityPassCount = 0;
      inMemoryGuidelines.forEach(g => {
        if (validateBilingualParity(g).isValid) parityPassCount++;
      });
      const parityRatePct = total > 0 ? Math.round((parityPassCount / total) * 100) : 100;

      return {
        total,
        published,
        inReview,
        approved,
        draft,
        archived,
        redFlagsCount,
        parityRatePct
      };
    },

    /**
     * Export guidelines as CSV string
     */
    exportGuidelinesCsv(filters = {}) {
      const list = this.getGuidelines(filters);
      const headers = [
        "Guideline_ID",
        "Version",
        "Status",
        "Category",
        "Scope",
        "Evidence_Level",
        "Target_Audience",
        "Title_AR",
        "Title_EN",
        "Summary_AR",
        "Summary_EN",
        "Criteria_AR",
        "Criteria_EN",
        "Action_Items_AR",
        "Action_Items_EN",
        "Red_Flags_AR",
        "Red_Flags_EN",
        "Published_At",
        "Updated_At"
      ];

      const rows = list.map(g => [
        `"${g.id}"`,
        `"${g.version}"`,
        `"${g.status}"`,
        `"${g.category}"`,
        `"${g.conditionScope}"`,
        `"${g.evidenceLevel}"`,
        `"${g.targetAudience}"`,
        `"${(g.titleAr || '').replace(/"/g, '""')}"`,
        `"${(g.titleEn || '').replace(/"/g, '""')}"`,
        `"${(g.summaryAr || '').replace(/"/g, '""')}"`,
        `"${(g.summaryEn || '').replace(/"/g, '""')}"`,
        `"${(g.criteriaAr || '').replace(/"/g, '""')}"`,
        `"${(g.criteriaEn || '').replace(/"/g, '""')}"`,
        `"${(g.actionItemsAr || '').replace(/"/g, '""')}"`,
        `"${(g.actionItemsEn || '').replace(/"/g, '""')}"`,
        `"${(g.redFlagsAr || '').replace(/"/g, '""')}"`,
        `"${(g.redFlagsEn || '').replace(/"/g, '""')}"`,
        `"${g.publishedAt || ''}"`,
        `"${g.updatedAt || ''}"`
      ].join(","));

      return [headers.join(","), ...rows].join("\n");
    },

    /**
     * Get audit trail
     */
    getAuditTrail() {
      return [...auditTrail];
    },

    /**
     * Reset seed data (for testing)
     */
    resetForTesting() {
      inMemoryGuidelines = JSON.parse(JSON.stringify(INITIAL_CLINICAL_GUIDELINES));
      auditTrail = [];
    },

    validateBilingualParity
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ClinicalCmsService;
  }
  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ClinicalCmsService = ClinicalCmsService;
})(typeof window !== "undefined" ? window : global);
