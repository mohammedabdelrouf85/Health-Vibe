/**
 * Health Vibe AI - Structured Internationalization (i18n) Engine
 * Replaces unstructured DOM TreeWalker replacement with declarative,
 * structured, and key-based translations with parameter interpolation.
 */

(function (global) {
  "use strict";

  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = ["ar", "en"];
  const STORAGE_KEY = "hv_lang";

  const translations = {
    ar: {
      common: {
        appName: "Health Vibes",
        tagline: "رعاية صحية مدعومة بالذكاء الاصطناعي وتحت مراجعة الطبيب",
        save: "حفظ",
        close: "إغلاق",
        cancel: "إلغاء",
        confirm: "تأكيد",
        delete: "حذف",
        edit: "تعديل",
        loading: "جارٍ التحميل...",
        retry: "إعادة المحاولة",
        understood: "حسناً، فهمت",
        systemSecurity: "أمان النظام",
        viewHistory: "عرض السجل",
        complete: "مكتمل",
        incomplete: "غير مكتمل",
        pending: "قيد الانتظار",
        approved: "معتمد",
        verified: "موثق",
        lightMode: "الوضع الفاتح",
        darkMode: "الوضع الداكن",
        menu: "القائمة",
        more: "المزيد",
        success: "تم بنجاح",
        error: "حدث خطأ",
        signOut: "تسجيل الخروج",
        search: "بحث...",
        back: "رجوع",
        next: "التالي",
        submit: "إرسال",
        status: "الحالة",
        date: "التاريخ",
        action: "الإجراء"
      },
      nav: {
        home: "الرئيسية",
        consent: "الموافقة والخصوصية",
        profile: "الملف الطبي",
        assessment: "تقييم التنفس",
        pending: "حالة المراجعة",
        result: "النتيجة",
        history: "السجل الطبي",
        appointments: "المواعيد",
        feedback: "التقييم والآراء",
        assistant: "المساعد الطبي",
        verification: "توثيق الطبيب",
        doctor: "لوحة الطبيب",
        report: "التقرير",
        admin: "لوحة الإدارة",
        audit: "سجل التدقيق",
        kpi: "لوحة المؤشرات",
        clinicsSales: "حلول العيادات (Sales)",
        signOut: "تسجيل الخروج",
        menu: "المزيد"
      },
      roles: {
        patient: "حساب مريض",
        doctor: "حساب طبيب موثق",
        doctor_pending: "طبيب بانتظار الاعتماد",
        clinic_admin: "مدير عيادة",
        support: "دعم فني",
        super_admin: "مدير عام للنظام"
      },
      auth: {
        signIn: "تسجيل الدخول",
        createAccount: "إنشاء حساب",
        fullName: "الاسم بالكامل",
        fullNamePlaceholder: "أدخل اسمك بالكامل",
        email: "البريد الإلكتروني",
        emailPlaceholder: "name@example.com",
        password: "كلمة المرور",
        passwordPlaceholder: "أدخل كلمة المرور",
        rememberMe: "تذكرني",
        rememberMeTip: "تنبيه أمني: ألغِ التحديد إذا كنت تستخدم حاسوباً مشتركاً في العيادة أو المستشفى.",
        sessionLockedTitle: "الجلسة مؤمنة تلقائياً",
        sessionLockedDesc: "تم تأمين الشاشة لحماية خصوصية بيانات المرضى وسجلاتهم الطبية وفقاً لمعايير الأمان السريري.",
        resumeSession: "استئناف الجلسة",
        lockedUserLabel: "الحساب المفتوح",
        lockScreenHipaaBadge: "أمان سريري • HIPAA",
        workstationPersonal: "حاسوب موثوق (دائم)",
        workstationShared: "محطة مشتركة (مؤقت)",
        forgotPassword: "نسيت كلمة المرور؟",
        continueWithGoogle: "المتابعة بحساب جوجل",
        accountRole: "دور الحساب",
        emailVerificationNeeded: "تأكيد البريد الإلكتروني مطلوب",
        emailVerificationDesc: "يرجى تأكيد بريدك الإلكتروني لحماية حسابك والوصول إلى كافة الميزات السريرية.",
        resendVerification: "إعادة إرسال الرابط",
        checkStatus: "تحقق الآن",
        whatsappVerify: "تفعيل عبر بوت الواتساب",
        resetPassword: "استعادة كلمة المرور",
        sendResetLink: "إرسال رابط الاستعادة",
        backToSignIn: "العودة لتسجيل الدخول",
        authRequired: "يجب تسجيل الدخول أولاً.",
        welcomeUser: "مرحباً، {name}!",
        signOutConfirm: "هل أنت متأكد من تسجيل الخروج؟",
        deleteAccountTitle: "حذف الحساب والبيانات السريرية",
        deleteAccountPermanent: "تنبيه هام: هذا الإجراء نهائي ولا يمكن التراجع عنه!"
      },
      patient: {
        welcome: "أهلاً بك",
        heroTitle: "تابع تنفسك مع طبيبك في مسار سريري واضح وآمن",
        heroSubtitle: "أدخل الأعراض والقياسات، وسيتلقى طبيبك تقديراً أولياً لقواعد الخطورة قبل اعتماد التقرير الطبي النهائي.",
        startBreathingAssessment: "بدء تقييم التنفس",
        viewHistory: "عرض السجل",
        latestStatus: "آخر حالة",
        noRecentAssessment: "لا يوجد فحص حديث",
        oxygenLevel: "نسبة الأكسجين",
        ruleScore: "مؤشر قواعد غير مُتحقق",
        doctor: "الطبيب",
        nextAppointment: "الموعد القادم",
        followUpConsultation: "استشارة متابعة",
        latestReport: "آخر تقرير",
        resultStatus: "حالة النتيجة",
        waitingForDoctor: "بانتظار الطبيب",
        medicalProfile: "الملف الطبي"
      },
      doctor: {
        dashboardTitle: "مراجعة الحالات والفرز السريري",
        reviewQueue: "قائمة الفرز والمراجعة",
        approveReport: "اعتماد وإصدار التقرير الطبي",
        requestFollowUp: "طلب متابعة إضافية",
        clinicalNotes: "الملاحظات السريرية",
        patientName: "اسم المريض",
        o2Level: "نسبة الأكسجين",
        urgency: "مستوى الاستعجال",
        signOffWarning: "⚠️ هذه البيانات ستصل مباشرة إلى ملف المراجعة السريرية للطبيب المعتمد ولن يصدر تقرير للمريض قبل اعتماده."
      },
      assessment: {
        title: "تقييم التنفس",
        o2Label: "نسبة تشبع الأكسجين في الدم (SpO2 %)",
        symptomsLabel: "الأعراض الحالية",
        confirmDisclaimer: "أقر بصحة هذه القياسات والأعراض",
        submitAssessment: "تأكيد وإرسال التقييم للطبيب",
        editInfo: "تعديل البيانات",
        emergencyNotice: "🚨 تنبيه طوارئ فوري",
        acuteHypoxia: "نقص أكسجين حاد — لا تنتظر مراجعة التطبيق",
        firstAidTitle: "🫁 إرشادات الإسعافات الأولية لتسهيل التنفس"
      },
      errors: {
        centralErrorTitle: "أمان النظام",
        centralErrorDefault: "نعتذر، تعذر إتمام العملية المطلوبة حالياً.",
        centralErrorHint: "💡 يرجى المحاولة مرة أخرى، أو مراجعة الاتصال بالإنترنت.",
        supportRef: "ℹ️ مرجع الدعم الفني (Support Reference)",
        permissionDenied: "عفواً، ليس لديك صلاحية لإجراء هذه العملية."
      },
      feedback: {
        title: "التقييم والآراء السريرية",
        ratingLabel: "تقييمك للخدمة",
        commentPlaceholder: "أخبرنا برأيك أو اقتراحاتك لتحسين تجربة الرعاية الصحية...",
        submitBtn: "إرسال التقييم",
        successMsg: "شكراً لمشاركتنا رأيك القيّم!"
      },
      appointments: {
        title: "حجز ومتابعة المواعيد",
        upcoming: "المواعيد القادمة",
        noUpcoming: "لا توجد مواعيد مجدولة حالياً.",
        bookNew: "حجز موعد استشارة جديد",
        doctorSelect: "اختر الطبيب المعالج",
        dateSelect: "تاريخ الموعد",
        timeSelect: "الوقت المناسب"
      },
      kpi: {
        dashboardTitle: "لوحة مؤشرات الأداء والعمليات السريرية",
        completionRate: "معدل إكمال التقييمات",
        responseTime: "متوسط زمن استجابة الطبيب",
        reportTurnaround: "متوسط وقت صدور التقرير المعتمد",
        crashFreeRate: "معدل خلو الأعطال",
        uptime: "نسبة الجاهزية التشغيلية (SLA)"
      }
    },

    en: {
      common: {
        appName: "Health Vibes",
        tagline: "AI-supported healthcare reviewed by doctors",
        save: "Save",
        close: "Close",
        cancel: "Cancel",
        confirm: "Confirm",
        delete: "Delete",
        edit: "Edit",
        loading: "Loading...",
        retry: "Try Again",
        understood: "Understood",
        systemSecurity: "System Security",
        viewHistory: "View History",
        complete: "Complete",
        incomplete: "Incomplete",
        pending: "Pending",
        approved: "Approved",
        verified: "Verified",
        lightMode: "Light",
        darkMode: "Dark",
        menu: "Menu",
        more: "More",
        success: "Success",
        error: "An error occurred",
        signOut: "Sign out",
        search: "Search...",
        back: "Back",
        next: "Next",
        submit: "Submit",
        status: "Status",
        date: "Date",
        action: "Action"
      },
      nav: {
        home: "Home",
        consent: "Consent & Privacy",
        profile: "Medical Profile",
        assessment: "Breathing Assessment",
        pending: "Review Status",
        result: "Result",
        history: "History",
        appointments: "Appointments",
        feedback: "Feedback & Rating",
        assistant: "Medical Assistant",
        verification: "Doctor Verification",
        doctor: "Doctor Dashboard",
        report: "Report",
        admin: "Admin Dashboard",
        audit: "Audit Log",
        kpi: "KPI Dashboard",
        clinicsSales: "Clinic Solutions (Sales)",
        signOut: "Sign out",
        menu: "Menu"
      },
      roles: {
        patient: "Patient account",
        doctor: "Verified doctor account",
        doctor_pending: "Pending doctor account",
        clinic_admin: "Clinic admin account",
        support: "Support account",
        super_admin: "Super admin account"
      },
      auth: {
        signIn: "Sign In",
        createAccount: "Create Account",
        fullName: "Full Name",
        fullNamePlaceholder: "Enter your full name",
        email: "Email Address",
        emailPlaceholder: "name@example.com",
        password: "Password",
        passwordPlaceholder: "Enter password",
        rememberMe: "Remember me",
        rememberMeTip: "Security tip: Uncheck if using a shared clinic or hospital computer.",
        sessionLockedTitle: "Session Auto-Locked",
        sessionLockedDesc: "Screen locked due to clinical inactivity to safeguard patient medical records and Protected Health Information (PHI).",
        resumeSession: "Resume Session",
        lockedUserLabel: "Active Account",
        lockScreenHipaaBadge: "Clinical Security • HIPAA",
        workstationPersonal: "Trusted Device (Persistent)",
        workstationShared: "Shared Station (Session-only)",
        forgotPassword: "Forgot password?",
        continueWithGoogle: "Continue with Google",
        accountRole: "Account role",
        emailVerificationNeeded: "Email verification needed",
        emailVerificationDesc: "Please verify your email address to secure your account and access all clinical features.",
        resendVerification: "Resend Verification",
        checkStatus: "Check Status",
        whatsappVerify: "Verify via WhatsApp Bot",
        resetPassword: "Reset Password",
        sendResetLink: "Send Reset Link",
        backToSignIn: "Back to Sign In",
        authRequired: "Authentication required.",
        welcomeUser: "Welcome, {name}!",
        signOutConfirm: "Are you sure you want to sign out?",
        deleteAccountTitle: "Delete Account & Clinical Data",
        deleteAccountPermanent: "Important Notice: This action is permanent and irreversible!"
      },
      patient: {
        welcome: "Welcome",
        heroTitle: "Track breathing with your doctor in one clear path",
        heroSubtitle: "Enter symptoms and measurements. The doctor receives a rule-based risk preview before approving any report shown to you.",
        startBreathingAssessment: "Start breathing assessment",
        viewHistory: "View history",
        latestStatus: "Latest status",
        noRecentAssessment: "No recent assessment",
        oxygenLevel: "Oxygen level",
        ruleScore: "Rule score (not clinically validated)",
        doctor: "Doctor",
        nextAppointment: "Next appointment",
        followUpConsultation: "Follow-up consultation",
        latestReport: "Latest report",
        resultStatus: "Result status",
        waitingForDoctor: "Waiting for doctor",
        medicalProfile: "Medical Profile"
      },
      doctor: {
        dashboardTitle: "Doctor Review & Clinical Triage",
        reviewQueue: "Review Queue",
        approveReport: "Certify & Approve Report",
        requestFollowUp: "Request Follow-up Consultation",
        clinicalNotes: "Clinical Notes",
        patientName: "Patient Name",
        o2Level: "Oxygen Level",
        urgency: "Urgency",
        signOffWarning: "⚠️ This data is transmitted directly to the verified doctor's clinical review file, and no patient report is issued prior to physician sign-off."
      },
      assessment: {
        title: "Breathing Assessment",
        o2Label: "Oxygen Saturation (SpO2 %)",
        symptomsLabel: "Current Symptoms",
        confirmDisclaimer: "I confirm these measurements are accurate",
        submitAssessment: "Confirm and Submit Assessment to Doctor",
        editInfo: "Edit Information",
        emergencyNotice: "🚨 Immediate Emergency Warning",
        acuteHypoxia: "Acute Hypoxia — Do not wait for digital review",
        firstAidTitle: "🫁 First-Aid Guidelines to Ease Breathing"
      },
      errors: {
        centralErrorTitle: "System Security",
        centralErrorDefault: "We apologize, the requested operation could not be completed.",
        centralErrorHint: "💡 Please try again or check your internet connection.",
        supportRef: "ℹ️ Support Reference",
        permissionDenied: "Permission denied for this operation."
      },
      feedback: {
        title: "Clinical Feedback & Rating",
        ratingLabel: "Service Rating",
        commentPlaceholder: "Share your experience or suggestions to improve our healthcare service...",
        submitBtn: "Submit Feedback",
        successMsg: "Thank you for your valuable feedback!"
      },
      appointments: {
        title: "Appointments & Consultations",
        upcoming: "Upcoming Appointments",
        noUpcoming: "No scheduled appointments at this time.",
        bookNew: "Book New Consultation",
        doctorSelect: "Select Doctor",
        dateSelect: "Appointment Date",
        timeSelect: "Available Time"
      },
      kpi: {
        dashboardTitle: "Clinical Operations & KPI Dashboard",
        completionRate: "Completion Rate",
        responseTime: "Doctor Response Time",
        reportTurnaround: "Report Turnaround Time",
        crashFreeRate: "Crash-Free Rate",
        uptime: "SLA Uptime"
      }
    }
  };

  /**
   * Safe getter for nested objects by dot-notation path
   */
  function getNestedValue(obj, path) {
    if (!obj || typeof obj !== "object" || !path) return undefined;
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  /**
   * Interpolate parameters into string: "Hello, {name}!" -> "Hello, Ahmed!"
   */
  function interpolate(text, params) {
    if (!text || typeof text !== "string" || !params || typeof params !== "object") {
      return text;
    }
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match;
    });
  }

  /**
   * Core I18n Engine Class
   */
  class I18nEngine {
    constructor(options = {}) {
      this.defaultLanguage = options.defaultLanguage || DEFAULT_LANGUAGE;
      this.supportedLanguages = options.supportedLanguages || SUPPORTED_LANGUAGES;
      this.catalog = translations;
      this.listeners = [];

      // Determine initial language
      let initialLang = this.defaultLanguage;
      try {
        if (typeof localStorage !== "undefined") {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && this.supportedLanguages.includes(stored)) {
            initialLang = stored;
          }
        }
      } catch (e) {}

      this.currentLanguage = initialLang;
    }

    getLanguage() {
      return this.currentLanguage;
    }

    getDirection(lang = this.currentLanguage) {
      return lang === "ar" ? "rtl" : "ltr";
    }

    /**
     * Translates a structured key with optional interpolation params and fallback.
     * Also checks flat legacy mappings for complete backward compatibility.
     *
     * @param {string} key - e.g. "nav.home", "auth.welcomeUser", or legacy string
     * @param {Object} [params] - interpolation variables e.g. { name: "Ahmed" }
     * @param {string} [fallback] - default string if translation missing
     */
    t(key, params = null, fallback = "") {
      if (!key) return "";

      const lang = this.currentLanguage;

      // 1. Try structured catalog lookup in current language
      let result = getNestedValue(this.catalog[lang], key);

      // 2. Try structured catalog lookup in fallback language (en)
      if (result === undefined && lang !== this.defaultLanguage) {
        result = getNestedValue(this.catalog[this.defaultLanguage], key);
      }

      // 3. Fallback to legacy window.uiText or window.enToAr if available
      if (result === undefined && typeof window !== "undefined") {
        const trimmed = typeof key === "string" ? key.trim() : key;
        if (lang === "en" && window.uiText && window.uiText[trimmed]) {
          result = window.uiText[trimmed];
        } else if (lang === "ar" && window.enToAr && window.enToAr[trimmed]) {
          result = window.enToAr[trimmed];
        }
      }

      // 4. Fallback value or original key
      if (result === undefined) {
        result = (fallback !== "" && fallback !== undefined) ? fallback : key;
      }

      // 5. Parameter interpolation
      return interpolate(String(result), params);
    }

    /**
     * Sets the active language, updates document attributes, persists to storage,
     * triggers declarative DOM updates, and notifies listeners.
     */
    setLanguage(lang, updateDOM = true) {
      if (!this.supportedLanguages.includes(lang)) {
        console.warn(`[i18n] Language '${lang}' not supported. Using '${this.defaultLanguage}'.`);
        lang = this.defaultLanguage;
      }

      const prevLang = this.currentLanguage;
      this.currentLanguage = lang;

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, lang);
        }
      } catch (e) {}

      // Update HTML root attributes
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = lang;
        document.documentElement.dir = this.getDirection(lang);
      }

      // Translate DOM declaratively if requested
      if (updateDOM && typeof document !== "undefined") {
        this.translateDOM(document);
      }

      // Dispatch custom DOM event
      if (typeof document !== "undefined" && typeof document.dispatchEvent === "function") {
        try {
          const event = new CustomEvent("hv:languageChanged", {
            detail: {
              language: lang,
              direction: this.getDirection(lang),
              previousLanguage: prevLang
            }
          });
          document.dispatchEvent(event);
        } catch (e) {}
      }

      // Notify registered subscribers
      this.listeners.forEach((fn) => {
        try {
          fn(lang, prevLang);
        } catch (err) {
          console.error("[i18n] Listener error:", err);
        }
      });

      return lang;
    }

    /**
     * Subscribe to language change events.
     * @param {Function} callback - fn(newLang, prevLang)
     * @returns {Function} unsubscribe function
     */
    onLanguageChange(callback) {
      if (typeof callback === "function") {
        this.listeners.push(callback);
      }
      return () => {
        this.listeners = this.listeners.filter((fn) => fn !== callback);
      };
    }

    /**
     * Register additional translations dynamically into a namespace.
     */
    registerTranslations(lang, namespace, strings) {
      if (!this.catalog[lang]) {
        this.catalog[lang] = {};
      }
      if (namespace) {
        this.catalog[lang][namespace] = {
          ...(this.catalog[lang][namespace] || {}),
          ...strings
        };
      } else {
        this.catalog[lang] = {
          ...this.catalog[lang],
          ...strings
        };
      }
    }

    /**
     * Declarative DOM Translator:
     * Fast, targeted scan of elements bearing data-i18n attributes.
     * Avoids unstructured TreeWalker replacement and prevents corruption of dynamic data.
     *
     * Supported attributes:
     * - [data-i18n]: updates textContent
     * - [data-i18n-html]: updates innerHTML (safe static markup)
     * - [data-i18n-placeholder]: updates placeholder attribute
     * - [data-i18n-title]: updates title attribute
     * - [data-i18n-aria]: updates aria-label attribute
     * - [data-i18n-value]: updates value attribute (inputs/buttons)
     * - [data-i18n-params]: JSON string of parameters for interpolation
     */
    translateDOM(root = document) {
      if (!root || typeof root.querySelectorAll !== "function") return;

      const parseParams = (el) => {
        const raw = el.getAttribute("data-i18n-params");
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      };

      // 1. Text content
      const textEls = root.querySelectorAll("[data-i18n]");
      for (let i = 0; i < textEls.length; i++) {
        const el = textEls[i];
        const key = el.getAttribute("data-i18n");
        if (key) {
          const params = parseParams(el);
          el.textContent = this.t(key, params);
        }
      }

      // 2. Safe HTML markup
      const htmlEls = root.querySelectorAll("[data-i18n-html]");
      for (let i = 0; i < htmlEls.length; i++) {
        const el = htmlEls[i];
        const key = el.getAttribute("data-i18n-html");
        if (key) {
          const params = parseParams(el);
          el.innerHTML = this.t(key, params);
        }
      }

      // 3. Placeholders
      const placeholderEls = root.querySelectorAll("[data-i18n-placeholder]");
      for (let i = 0; i < placeholderEls.length; i++) {
        const el = placeholderEls[i];
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) {
          const params = parseParams(el);
          el.placeholder = this.t(key, params);
        }
      }

      // 4. Tooltip / Titles
      const titleEls = root.querySelectorAll("[data-i18n-title]");
      for (let i = 0; i < titleEls.length; i++) {
        const el = titleEls[i];
        const key = el.getAttribute("data-i18n-title");
        if (key) {
          const params = parseParams(el);
          el.title = this.t(key, params);
        }
      }

      // 5. Accessibility Aria Labels
      const ariaEls = root.querySelectorAll("[data-i18n-aria]");
      for (let i = 0; i < ariaEls.length; i++) {
        const el = ariaEls[i];
        const key = el.getAttribute("data-i18n-aria");
        if (key) {
          const params = parseParams(el);
          el.setAttribute("aria-label", this.t(key, params));
        }
      }

      // 6. Values (Submit / Action buttons)
      const valueEls = root.querySelectorAll("[data-i18n-value]");
      for (let i = 0; i < valueEls.length; i++) {
        const el = valueEls[i];
        const key = el.getAttribute("data-i18n-value");
        if (key) {
          const params = parseParams(el);
          el.value = this.t(key, params);
        }
      }
    }
  }

  // Singleton instance
  const defaultI18n = new I18nEngine();

  // Export to browser window
  if (typeof window !== "undefined") {
    window.I18nEngine = I18nEngine;
    window.i18n = defaultI18n;
    window.t = function (key, params, fallback) {
      return defaultI18n.t(key, params, fallback);
    };
  }

  // Export to CommonJS / Node.js for automated testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      I18nEngine,
      translations,
      defaultI18n
    };
  }

})(typeof window !== "undefined" ? window : globalThis);
