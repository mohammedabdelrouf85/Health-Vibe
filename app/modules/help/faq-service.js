/**
 * Health Vibe AI - Help & FAQ Service (مرجع: Esaal)
 * Manages clinical help categories, bilingual Q&A catalog, real-time search,
 * user helpfulness ratings, and support inquiry dispatch.
 */

(function (global) {
  "use strict";

  // Catalog of standard clinical and platform questions & answers
  const FAQ_CATALOG = [
    {
      id: "faq_platform_workflow",
      category: "platform",
      tags: ["workflow", "how it works", "symptoms", "خطوات", "كيف يعمل", "أعراض"],
      question: {
        ar: "كيف تعمل منصة Health Vibe الذكية؟",
        en: "How does the Health Vibe AI platform work?"
      },
      answer: {
        ar: "تقوم بإدخال الأعراض والقياسات الحيوية (كالضغط والسكر والأكسجين)، فيقوم محرك الذكاء الاصطناعي السريري بتحليلها مبدئياً وتجهيز مسودة تقييم متكاملة، ثم تُحال الحالة فوراً إلى طبيب مرخص لمراجعتها واعتماد التقرير النهائي وإرشادك بدقة.",
        en: "You input your symptoms and vital signs (blood pressure, glucose, oxygen). The clinical AI engine performs a preliminary triage analysis, which is then immediately routed to a licensed physician for review and final certified report approval."
      },
      icon: "🩺"
    },
    {
      id: "faq_doctor_role",
      category: "doctor",
      tags: ["doctor", "physician", "human review", "طبيب", "دور الطبيب", "مراجعة بشرية"],
      question: {
        ar: "ما هو دور الطبيب البشري، وهل الذكاء الاصطناعي بديل عنه؟",
        en: "What is the physician's role, and does AI replace doctors?"
      },
      answer: {
        ar: "الذكاء الاصطناعي لا يحل أبداً محل الطبيب. دوره مقتصر على فرز البيانات السريرية بسرعة لتوفير الوقت. كل قرار طبي أو تقرير معتمد يصدر فقط بعد مراجعة دقيقة وتوقيع إلكتروني من طبيب بشري مرخص ومسجل بنقابة الأطباء.",
        en: "AI never replaces a physician. Its purpose is purely clinical triage assistance to speed up workflows. Every medical assessment and certified report is strictly reviewed and digitally signed by a licensed physician before delivery."
      },
      icon: "👨‍⚕️"
    },
    {
      id: "faq_data_privacy",
      category: "privacy",
      tags: ["privacy", "security", "hipaa", "data", "خصوصية", "أمان", "تشفير"],
      question: {
        ar: "كيف تضمن المنصة خصوصية وأمان سجلاتي الطبية؟",
        en: "How does the platform ensure the privacy of my medical records?"
      },
      answer: {
        ar: "نلتزم بأعلى معايير الأمان الطبي المتوافقة مع HIPAA وGDPR. جميع البيانات مشفرة أثناء النقل والتخزين بتشفير AES-256، ولا يمكن لأي طرف ثالث أو شركة إعلانية الاطلاع على سجلاتك. بياناتك ملكك وحدك ولطبيبك المشرف.",
        en: "We adhere to HIPAA and GDPR clinical compliance standards. All records are protected using AES-256 end-to-end encryption in transit and at rest. No third parties or advertisers have access to your health records."
      },
      icon: "🔒"
    },
    {
      id: "faq_emergency_warning",
      category: "urgent",
      tags: ["emergency", "hospital", "urgent", "طوارئ", "حالات حرجة", "مستشفى"],
      question: {
        ar: "ماذا أفعل إذا كانت حالتي طارئة أو حرجة؟",
        en: "What should I do if my condition is an urgent emergency?"
      },
      answer: {
        ar: "Health Vibe مخصصة للاستشارات والتقييمات الطبية غير الطارئة. في حال وجود ألم حاد في الصدر، ضيق تنفس شديد، هبوط حاد بالوعي، أو نزيف مستمر، يجب التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف (123 في مصر).",
        en: "Health Vibe is designed for non-emergency triage and clinical assessments. In the event of acute chest pain, severe shortness of breath, loss of consciousness, or profuse bleeding, proceed immediately to the nearest ER or call 123."
      },
      icon: "🚨"
    },
    {
      id: "faq_report_sharing",
      category: "platform",
      tags: ["report", "share", "pdf", "تقرير", "مشاركة", "عائلة"],
      question: {
        ar: "هل يمكنني مشاركة التقرير الطبي المعتمد مع عائلتي أو طبيبي الخاص؟",
        en: "Can I share my certified medical report with family or my private doctor?"
      },
      answer: {
        ar: "نعم، بمجرد اعتماد الطبيب للتقرير يمكنك تحميله بصيغة PDF مشفرة وموقعة برمز تحقق QR، أو إرسال رابط مشاركة آمن ومحدد الصلاحية لأفراد أسرتك للاطمئنان.",
        en: "Yes. Once approved by the physician, you can download a cryptographically signed PDF with a verification QR code, or generate a time-limited secure share link for family members."
      },
      icon: "📋"
    },
    {
      id: "faq_family_profiles",
      category: "platform",
      tags: ["family", "elderly", "children", "عائلة", "كبار سن", "أطفال"],
      question: {
        ar: "هل أستطيع إضافة والدي المسن أو أطفالي على نفس حسابي؟",
        en: "Can I add my elderly parents or children under my account?"
      },
      answer: {
        ar: "نعم، توفر المنصة ميزة 'ملفات العائلة' (Family Profiles) التي تتيح لك إضافة أفراد عائلتك وإدارة قياساتهم وسجلاتهم الطبية بشكل منفصل ومحمي تماماً من هاتفك.",
        en: "Yes! Family Profiles allows you to add dependents (elderly parents, children, spouses) and track their vitals with strict data isolation from a single mobile device."
      },
      icon: "👨‍👩‍👧‍👦"
    }
  ];

  // In-memory feedback storage for ratings
  const feedbackStore = new Map();

  const FAQService = {
    CATEGORIES: [
      { id: "all", ar: "جميع الأسئلة", en: "All Questions", icon: "🌐" },
      { id: "platform", ar: "كيف تعمل المنصة", en: "How Platform Works", icon: "🩺" },
      { id: "doctor", ar: "دور الطبيب البشري", en: "Physician's Role", icon: "👨‍⚕️" },
      { id: "privacy", ar: "الخصوصية والأمان", en: "Privacy & Security", icon: "🔒" },
      { id: "urgent", ar: "الطوارئ والإسعاف", en: "Emergency & Urgent Care", icon: "🚨" }
    ],

    /**
     * Retrieves all FAQ items, optionally filtered by category.
     * @param {string} [categoryId='all']
     * @returns {Array<Object>}
     */
    getFaqs(categoryId = "all") {
      if (!categoryId || categoryId === "all") {
        return [...FAQ_CATALOG];
      }
      return FAQ_CATALOG.filter(item => item.category === categoryId);
    },

    /**
     * Searches FAQs using bilingual keyword matching with relevance ranking.
     * @param {string} query - Search term in Arabic or English
     * @param {string} [categoryId='all'] - Optional category filter
     * @returns {Array<Object>} Ranked matching FAQ items
     */
    searchFaqs(query, categoryId = "all") {
      if (!query || typeof query !== "string" || !query.trim()) {
        return this.getFaqs(categoryId);
      }

      const q = query.trim().toLowerCase();
      const list = this.getFaqs(categoryId);

      return list
        .map(item => {
          let score = 0;
          const qAr = item.question.ar.toLowerCase();
          const qEn = item.question.en.toLowerCase();
          const aAr = item.answer.ar.toLowerCase();
          const aEn = item.answer.en.toLowerCase();

          // Title exact match
          if (qAr.includes(q) || qEn.includes(q)) score += 10;
          // Tag match
          if (item.tags.some(t => t.toLowerCase().includes(q))) score += 7;
          // Body answer match
          if (aAr.includes(q) || aEn.includes(q)) score += 3;

          return { item, score };
        })
        .filter(res => res.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(res => res.item);
    },

    /**
     * Submits user helpfulness rating for an FAQ item.
     * @param {string} faqId
     * @param {boolean} isHelpful
     * @param {string} [userId='anonymous']
     * @returns {Object}
     */
    rateFaq(faqId, isHelpful, userId = "anonymous") {
      const item = FAQ_CATALOG.find(f => f.id === faqId);
      if (!item) {
        throw new Error(`FAQ item not found: ${faqId}`);
      }

      const key = `${faqId}:${userId}`;
      const record = {
        faqId,
        userId,
        isHelpful: !!isHelpful,
        timestamp: new Date().toISOString()
      };
      feedbackStore.set(key, record);

      return {
        success: true,
        faqId,
        feedback: record
      };
    },

    /**
     * Dispatches a quick support question or callback request (مرجع: Esaal).
     * @param {Object} payload
     * @returns {Object}
     */
    submitSupportInquiry(payload) {
      const { name, phoneOrEmail, message, urgency = "normal", userId = "guest" } = payload || {};
      if (!message || message.trim().length < 5) {
        throw new Error("Message must be at least 5 characters long");
      }

      const ticket = {
        id: "ticket_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        userId,
        name: (name || "Anonymous Patient").trim(),
        contact: (phoneOrEmail || "Not provided").trim(),
        message: message.trim(),
        urgency,
        status: "open",
        createdAt: new Date().toISOString()
      };

      return {
        success: true,
        ticketId: ticket.id,
        ticket
      };
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FAQService;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.FAQService = FAQService;
  }
})(typeof window !== "undefined" ? window : global);
