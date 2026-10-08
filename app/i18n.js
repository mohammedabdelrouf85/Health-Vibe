/**
 * Health Vibe AI - Structured Internationalization (i18n) Engine
 * 
 * Features:
 * - Declarative DOM translation via data-i18n attributes
 * - 100% Arabic and English catalog parity across 17 clinical & administrative namespaces
 * - Simple Arabic for patient interactions, and formal Arabic for certified medical reports
 * - Fallbacks with graceful degradation (no raw 'undefined' or missing strings)
 * - Dynamic parameter interpolation ({name}, {count}, {date}, etc.)
 * - Locale-aware Date, Time, Number, and Percentage formatters (ar-EG & en-US)
 * - Dynamic language switching without signing out or clearing form inputs
 * - RTL and LTR direction synchronization
 */

(function (global) {
  "use strict";

  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = ["ar", "en"];
  const STORAGE_KEY = "hv_lang";

  const translations = {
    ar: {
      common: {
        appName: "Health Vibe AI",
        tagline: "رعاية صحية مدعومة بالذكاء الاصطناعي وتحت مراجعة الطبيب",
        save: "حفظ",
        saved: "تم الحفظ",
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
        time: "الوقت",
        action: "الإجراء",
        details: "التفاصيل",
        download: "تنزيل",
        print: "طباعة",
        copy: "نسخ",
        copied: "تم النسخ",
        yes: "نعم",
        no: "لا",
        pts: "نقطة",
        yrs: "سنة",
        celsius: "°م",
        breathsPerMin: "نفس/دقيقة",
        percent: "%",
        selected: "تم الاختيار",
        notAvailable: "غير متوفر"
      },
      nav: {
        home: "الرئيسية",
        patient: "الرئيسية",
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
        publicLanding: "الموقع التعريفي الرئيسي",
        signOut: "تسجيل الخروج",
        switchAccount: "تبديل الحساب",
        deleteAccount: "حذف الحساب",
        menu: "المزيد"
      },
      roles: {
        patient: "حساب مريض",
        doctor: "حساب طبيب موثق",
        doctor_pending: "طبيب بانتظار الاعتماد",
        clinic_admin: "مدير عيادة",
        support: "دعم فني",
        super_admin: "Owner"
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
        deleteAccountPermanent: "تنبيه هام: هذا الإجراء نهائي ولا يمكن التراجع عنه!",
        switchAccount: "تبديل الحساب",
        switchAccountDesc: "يرجى تسجيل الدخول بالحساب الآخر",
        exportData: "تصدير بياناتي (Data Portability)",
        exportDataDesc: "تنزيل نسخة إلكترونية آمنة من كافة سجلاتك وبياناتك الطبية بصيغة JSON قابلة للنقل.",
        accessRequest: "طلب تقرير وصول للبيانات (GDPR Art. 15)",
        accessRequestDesc: "عرض تفصيلي لجميع البيانات الشخصية والسريرية المحفوظة وأغراض معالجتها وفترات الاحتفاظ بها.",
        recentAuthRequired: "فحص أمني: يتطلب هذا الإجراء الحساس إعادة التحقق الحديث من هويتك.",
        partialFailureRetry: "حدث فشل جزئي في بعض الخطوات، يمكنك إعادة المحاولة بأمان لاستكمال الحذف.",
        dataRetentionPolicy: "سياسة الاحتفاظ بالبيانات والنسخ الاحتياطية"
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
        medicalProfile: "الملف الطبي",
        welcomePersonalized: "أهلاً بك يا {name}، صحتك وسلامتك أولويتنا",
        safeNotice: "لا تقلق، طبيبك المعتمد سيراجع فحصك السريري ويصدر التقرير المناسب لحالتك.",
        recentAlerts: "تنبيهات المتابعة الطبية"
      },
      consent: {
        title: "الموافقة الطبية وسياسة الخصوصية",
        badgeRequired: "مطلوبة قبل الفحص",
        badgeAccepted: "تمت الموافقة بنجاح",
        desc: "Health Vibe يجمع بياناتك الصحية لتقييم خطورة إرشادي ثم يرسلها لطبيب معتمد قبل ظهور أي نتيجة نهائية. لحماية بياناتك والامتثال للمعايير الطبية، نرجو مراجعة وتأكيد بنود الموافقة أدناه:",
        dataProcessing: "معالجة البيانات السريرية (إلزامي): أوافق على استخدام بيانات الأعراض والقياسات الحيوية داخل مسار التقييم ومشاركتها مع الطبيب المعالج المعتمد.",
        aiAdvisory: "الطبيعة الإرشادية للذكاء الاصطناعي (إلزامي): أفهم أن مؤشر الذكاء الاصطناعي أداة فرز إرشادية غير مدققة سريرياً ولا تُعد تشخيصاً طبياً مستقلاً ولا تغني عن فحص الطبيب.",
        telemedicine: "التطبيب عن بعد والاستشارات السريرية: أوافق على تلقي التوجيهات الطبية والاستشارات الرقمية من الأطباء المرخصين عبر المنصة.",
        gdprRights: "حقوق الخصوصية وحذف البيانات: أعلم أن بإمكاني تصدير بياناتي أو سحب الموافقة أو طلب حذف الحساب نهائياً في أي وقت.",
        emergencyDisclaimer: "إقرار الطوارئ: أقر بأنه في حال الطوارئ الحادة أو ضيق التنفس الشديد يجب الاتصال بالإسعاف (123) فوراً دون انتظار التطبيق.",
        confirmBtn: "تأكيد الموافقة ومتابعة الفحص",
        withdrawBtn: "سحب الموافقة الطبية",
        notifications: "تنبيهات المتابعة والتقارير (اختياري): أوافق على استقبال إشعارات تحديث الحالة وتقارير الفحص الصادرة من الطبيب.",
        privacyNote: "🔒 خصوصيتك أولويتنا: يتم تشفير البيانات ولا يتم مشاركتها مع أي طرف ثالث لأغراض إعلانية. يمكنك مراجعة أو سحب الموافقة في أي وقت.",
        agreeBtn: "✓ أوافق والمتابعة لبدء فحص التنفس",
        profileBtn: "الملف الطبي",
        accessScope: "نطاق الوصول",
        rolePermissions: "صلاحيات الأدوار",
        patientAccess: "المريض: يرى بياناته ونتائجه المعتمدة فقط.",
        doctorAccess: "الطبيب: يرى الحالات المرتبطة به فقط مع سجل المراجعة.",
        adminAccess: "الإدارة: صلاحيات تشغيلية مقيدة حسب الدور مع سجل تدقيق.",
        legalStandards: "المعايير والوثائق القانونية والطبية:",
        legalDesc: "يمكنك قراءة الوثائق المعتمدة كاملة في أي وقت:",
        privacyPolicyBtn: "🔒 سياسة الخصوصية",
        termsBtn: "📜 شروط الاستخدام",
        disclaimerBtn: "🚨 إخلاء المسؤولية"
      },
      profile: {
        title: "الملف الطبي والتاريخ الصحي",
        personalInfo: "البيانات الأساسية",
        age: "العمر",
        gender: "النوع",
        male: "ذكر",
        female: "أنثى",
        bloodType: "فصيلة الدم",
        chronicConditions: "التشخيصات والأمراض المزمنة",
        allergies: "الحساسية الدوائية والغذائية",
        currentMedications: "الأدوية والعلاجات الحالية",
        emergencyContact: "جهة الاتصال في حالات الطوارئ",
        nationalId: "الرقم القومي (14 رقماً)",
        nationalIdPlaceholder: "أدخل الرقم القومي المكون من 14 رقماً",
        saveProfileBtn: "حفظ وتحديث الملف الطبي",
        saveSuccess: "تم تحديث الملف الطبي بنجاح"
      },
      assessment: {
        title: "تقييم التنفس",
        subtitle: "أدخل قياسات الأكسجين والأعراض الحالية لمشاركتها مع طبيبك المعالج",
        o2Label: "نسبة تشبع الأكسجين في الدم (SpO2 %)",
        o2Placeholder: "مثال: 98",
        symptomsLabel: "الأعراض الحالية",
        coughLabel: "شدة الكحة",
        coughNone: "لا توجد كحة",
        coughMild: "كحة خفيفة",
        coughModerate: "كحة متوسطة",
        coughSevere: "كحة شديدة ومستمرة",
        durationLabel: "مدة استمرار الأعراض",
        durationDays: "{count} أيام",
        confirmDisclaimer: "أقر بصحة هذه القياسات والأعراض ومشاركتها مع الطبيب المعالج",
        submitAssessment: "تأكيد وإرسال التقييم للطبيب",
        editInfo: "تعديل البيانات",
        emergencyNotice: "🚨 تنبيه طوارئ فوري",
        acuteHypoxia: "نقص أكسجين حاد — لا تنتظر مراجعة التطبيق",
        emergencyCallBtn: "الاتصال بالإسعاف فوراً (123)",
        firstAidTitle: "🫁 إرشادات الإسعافات الأولية لتسهيل التنفس",
        firstAidStep1: "اجلس في وضع مستقيم مائلاً قليلاً للأمام.",
        firstAidStep2: "تنفس ببطء عبر الأنف وازفر عبر الشفاه المضمومة.",
        firstAidStep3: "فك الملابس الضيقة حول الرقبة والصدر وتواجد في مكان جيد التهوية.",
        stepLabel: "الخطوة {step} من {total}",
        draftStatusEmpty: "لم يتم حفظ مسودة بعد",
        draftBannerText: "توجد مسودة محفوظة لهذا الحساب. يمكنك المتابعة أو البدء من جديد.",
        resumeDraft: "متابعة المسودة",
        discardDraft: "بدء جديد",
        shortnessOfBreath: "هل يوجد ضيق تنفس؟",
        tempLabel: "درجة الحرارة (اختياري)",
        respiratoryRateLabel: "معدل التنفس (اختياري)",
        chestPainLabel: "ألم بالصدر",
        symptomDurationLabel: "مدة الأعراض",
        symptomProgressionLabel: "تطور الأعراض",
        recentInfectionLabel: "عدوى حديثة",
        asthmaCopdLabel: "ربو أو COPD",
        riskFactorsLabel: "عوامل خطورة",
        improving: "تتحسن",
        stable: "ثابتة",
        worsening: "تسوء",
        unknown: "غير معروف"
      },
      pending: {
        title: "حالة مراجعة الفحص",
        heading: "فحصك بانتظار مراجعة واعتماد الطبيب",
        desc: "تم استلام الفحص بنجاح ونقله إلى ملف الطبيب المعالج المعتمد. حفاظاً على سلامتك، لن يصدر التقرير النهائي إلا بعد المراجعة السريرية.",
        step1: "إرسال الفحص السريري",
        step2: "الفرز الإرشادي بنموذج القواعد",
        step3: "المراجعة السريرية للطبيب",
        step4: "إصدار التقرير الطبي المعتمد",
        assignedDoctor: "الطبيب المسند إليه الفحص",
        submittedAt: "وقت الإرسال",
        statusBadge: "بانتظار مراجعة الطبيب",
        successTitle: "تم إرسال التقييم بنجاح",
        reviewNote: "يراجع الطبيب الأعراض والقياسات ونتيجة الذكاء الاصطناعي قبل إصدار التقرير النهائي.",
        caseId: "رقم الحالة",
        patientName: "المريض",
        oxygen: "نسبة الأكسجين",
        priority: "الأولوية",
        timelineReceive: "استلام البيانات",
        timelineAi: "تشغيل الذكاء الاصطناعي",
        timelineReview: "مراجعة الطبيب",
        timelineReport: "إصدار التقرير",
        returnHome: "العودة للرئيسية ومتابعة الحالة",
        viewHistory: "عرض سجل الفحوصات"
      },
      report: {
        centerName: "مركز هيلث فايب الطبي التخصصي",
        certifiedReport: "التقرير الطبي السريري المعتمد",
        physicianApproved: "معتمد سريرياً ورسمياً",
        caseRef: "رقم الحالة",
        patientName: "اسم المريض",
        age: "العمر",
        years: "سنة",
        phone: "هاتف المريض",
        attendingPhysician: "الطبيب المعتمد",
        specialtyAndClinic: "التخصص والعيادة",
        medicalLicense: "رقم ترخيص النقابة",
        approvalTime: "تاريخ ووقت الاعتماد",
        submittedTime: "تاريخ الفحص",
        vitalsTitle: "العلامات الحيوية والمؤشرات الفسيولوجية",
        oxygenSaturation: "نسبة تشبع الأكسجين (SpO2)",
        respiratoryRate: "معدل التنفس",
        temperature: "درجة الحرارة",
        clinicalDiagnosis: "التشخيص الإكلينيكي المعتمد",
        recommendations: "التوصيات والتعليمات السريرية",
        prescribedMedications: "الوصفة الدوائية المعتمدة",
        noMedications: "لم يقم الطبيب بتحديد وصفة دوائية في هذه الزيارة.",
        clinicalDisclaimer: "إخلاء مسؤولية سريري معتمد: هذا التقرير صادر عن طبيب مرخص ومعتمد، ويعكس تقييماً سريرياً مبنياً على الأعراض والقياسات المقدمة.",
        digitalVerification: "تقرير إلكتروني موثق ومشفر ضد التلاعب برمجياً وفق معايير الأمان الطبي.",
        printReport: "طباعة التقرير",
        downloadPdf: "تحميل PDF",
        withdrawnNotice: "⚠️ تم سحب هذا التقرير رسمياً من قِبل الطبيب المعالج لإعادة التقييم.",
        moreInfoTitle: "طلب إيضاحات أو قياسات إضافية",
        rejectionTitle: "تم فحص التقرير ورفضه من قِبل الطبيب",
        lockedTitle: "التقرير الطبي قيد المراجعة والاعتماد السريري",
        lockedDesc: "حفاظاً على سلامتك، لن يظهر التشخيص النهائي إلا بعد مراجعة واعتماد الطبيب المعالج.",
        emptyReportTitle: "لا يوجد تقرير طبي متاح حتى الآن",
        emptyReportDesc: "للحصول على تقرير طبي معتمد، يرجى إتمام تقييم التنفس أولاً ليتم إرساله ومراجعته واعتماده من قبل الطبيب المعالج."
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
        signOffWarning: "⚠️ هذه البيانات ستصل مباشرة إلى ملف المراجعة السريرية للطبيب المعتمد ولن يصدر تقرير للمريض قبل اعتماده.",
        allCases: "جميع الحالات",
        pendingOnly: "الحالات المعلقة",
        urgentOnly: "الحالات الحرجة",
        moreInfoRequested: "طلب إيضاحات إضافية",
        newInfoReceived: "تم استلام معلومات سريرية جديدة",
        staleNotice: "تم تقديم قياسات سريرية أو إفادات جديدة من المريض بعد الفحص المبدئي. تم قفل الاعتماد مؤقتاً لحين مراجعة وتأكيد التحديثات.",
        compareChanges: "مقارنة التغييرات والتدقيق",
        markReviewed: "تأكيد المراجعة وتفعيل الاعتماد",
        revision: "المراجعة السريرية",
        revisionStale: "محدثة (تتطلب التدقيق)",
        revisionVerified: "مدققة سريرياً",
        assessmentDate: "تاريخ التقييم السريري",
        draftPreserved: "مسودتك غير المحفوظة محفوظة ومسترجعة",
        approvalLocked: "الاعتماد مقفل: يجب مراجعة وتأكيد التحديثات أولاً",
        fieldComparison: "مقارنة الحقول والمراجعات السريرية",
        previousRevision: "المراجعة السابقة (الأساس)",
        latestRevision: "المراجعة الحالية (الجديدة)",
        clinicalDelta: "الفارق السريري والتطور",
        explicitReviewCheckbox: "أقر بأنني قمت بفحص وتدقيق كافة التحديثات السريرية، وأوقات القياس، ومصادر البيانات للمراجعة الجديدة.",
        backToQueue: "العودة لقائمة المرضى",
        tabInputs: "المدخلات والفرز",
        tabClarifications: "الاستفسارات والردود",
        tabNotes: "التشخيص والروشتة",
        tabTimeline: "المسار الزمني",
        tabAll: "جميع الأقسام",
        groupInputsTitle: "المدخلات السريرية والفرز الطبي",
        groupClarificationsTitle: "الاستفسارات وإفادات المريض",
        groupNotesTitle: "التشخيص الطبي السريري ومحرر التقرير",
        groupTimelineTitle: "سجل دورة حياة الحالة والتدقيق",
        clarificationThread: "مسار الاستفسارات والتدقيق السريري",
        cycleLabel: "الدورة السريرية",
        cycleOutOf: "الدورة {current} من {total}",
        statusUnanswered: "بانتظار رد المريض (معلق)",
        statusSubmitted: "تم تقديم الإفادة (بانتظار تدقيق الطبيب)",
        statusReviewed: "تمت المراجعة والتدقيق السريري",
        eventVerifiedAt: "موثق بسجل الحالة بتاريخ: {date}",
        requestedVitals: "المؤشرات والقياسات المطلوبة:",
        permittedAttachments: "المرفقات والتقارير المسموح بها:",
        permittedAttachmentsNote: "ملفات PDF، صور الأشعة والتحاليل JPEG/PNG (بحد أقصى 10 ميجابايت)",
        directAnswerTitle: "تقديم الإفادة والقياسات المطلوبة للطبيب:",
        directAnswerHint: "أدخل إجابتك، ملاحظاتك عن تطور الأعراض، أو القياسات المطلوبة...",
        directAnswerSubmit: "إرسال الإفادة السريرية للطبيب",
        attachedRecords: "الملفات والتقارير المرفقة:",
        noClarifications: "لا توجد استفسارات سريرية أو طلبات بيانات مفتوحة لهذه الحالة.",
        requestClarificationBtn: "طلب إيضاحات سريرية جديدة",
        internalNotesIsolated: "الملاحظات والتشخيصات الداخلية للطبيب منفصلة تماماً ومحجوبة عن المريض.",
        reviewReceivedReply: "فحص ومراجعة الإفادة الواردة",
        answerRequestAction: "تقديم الإفادة الآن",
        newObservationsReceived: "تم استلام قياسات محدثة:"
      },
      history: {
        title: "السجل الطبي الموحد",
        subtitle: "جميع التقييمات، التقارير، المواعيد، والملفات في مسار زمني واحد",
        searchPlaceholder: "ابحث في السجل الطبي (أعراض، تشخيص، أدوية، أطباء)...",
        allTypes: "جميع السجلات",
        filterType: "نوع السجل",
        assessments: "الفحوصات السريرية",
        reports: "التقارير المعتمدة",
        appointments: "المواعيد والاستشارات",
        attachments: "الملفات والفحوصات المرفقة",
        medications: "الأدوية والعلاجات",
        chronicConditions: "التشخيصات المزمنة",
        doctorNotes: "ملاحظات وتوجيهات الطبيب",
        startDate: "من تاريخ",
        endDate: "إلى تاريخ",
        emptyHistory: "لا توجد سجلات طبية مطابقة لخيارات البحث الحالية.",
        internalDoctorNote: "🔒 ملاحظة سريرية داخلية (محجوبة عن المريض)"
      },
      appointments: {
        title: "حجز ومتابعة المواعيد",
        upcoming: "المواعيد القادمة",
        noUpcoming: "لا توجد مواعيد مجدولة حالياً.",
        bookNew: "حجز موعد استشارة جديد",
        doctorSelect: "اختر الطبيب المعالج",
        dateSelect: "تاريخ الموعد",
        timeSelect: "الوقت المناسب",
        appointmentWith: "موعد مع: د. {doctor}",
        appointmentAt: "التاريخ: {date} الساعة {time}",
        cancelAppointment: "إلغاء الموعد",
        rescheduleAppointment: "تعديل الموعد"
      },
      feedback: {
        title: "التقييم والآراء السريرية",
        ratingLabel: "تقييمك للخدمة",
        commentPlaceholder: "أخبرنا برأيك أو اقتراحاتك لتحسين تجربة الرعاية الصحية...",
        submitBtn: "إرسال التقييم",
        successMsg: "شكراً لمشاركتنا رأيك القيّم!"
      },
      kpi: {
        dashboardTitle: "لوحة مؤشرات الأداء والعمليات السريرية",
        completionRate: "معدل إكمال التقييمات",
        responseTime: "متوسط زمن استجابة الطبيب",
        reportTurnaround: "متوسط وقت صدور التقرير المعتمد",
        crashFreeRate: "معدل خلو الأعطال",
        uptime: "نسبة الجاهزية التشغيلية (SLA)"
      },
      audit: {
        title: "سجل التدقيق والأمان السريري",
        subtitle: "تتبع كامل لجميع العمليات والوصول للسجلات الطبية",
        eventType: "نوع العملية",
        actor: "المستخدم المنفذ",
        timestamp: "التوقيت",
        ipAddress: "عنوان IP",
        status: "الحالة",
        details: "تفاصيل العملية"
      },
      errors: {
        centralErrorTitle: "أمان النظام",
        centralErrorDefault: "نعتذر، تعذر إتمام العملية المطلوبة حالياً.",
        centralErrorHint: "💡 يرجى المحاولة مرة أخرى، أو مراجعة الاتصال بالإنترنت.",
        supportRef: "ℹ️ مرجع الدعم الفني (Support Reference)",
        permissionDenied: "عفواً، ليس لديك صلاحية لإجراء هذه العملية.",
        networkError: "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.",
        invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        rateLimited: "تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً.",
        nationalIdInvalid: "الرقم القومي المصري يجب أن يتكون من 14 رقماً صالحاً.",
        unauthorized: "عفواً، هذه العملية تتطلب تسجيل الدخول أولاً.",
        notFound: "السجل المطلوب غير موجود أو تم حذفه.",
        serverError: "حدث خطأ غير متوقع في الخادم. تم تسجيل الخطأ للفحص."
      },
      time: {
        now: "الآن",
        minutesAgo: "منذ {count} دقيقة",
        hoursAgo: "منذ {count} ساعة",
        daysAgo: "منذ {count} يوم"
      }
    },

    en: {
      common: {
        appName: "Health Vibe AI",
        tagline: "AI-supported healthcare reviewed by doctors",
        save: "Save",
        saved: "Saved",
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
        time: "Time",
        action: "Action",
        details: "Details",
        download: "Download",
        print: "Print",
        copy: "Copy",
        copied: "Copied",
        yes: "Yes",
        no: "No",
        pts: "pts",
        yrs: "yrs",
        celsius: "°C",
        breathsPerMin: "breaths/min",
        percent: "%",
        selected: "Selected",
        notAvailable: "N/A"
      },
      nav: {
        home: "Home",
        patient: "Home",
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
        publicLanding: "Public Website / Landing",
        signOut: "Sign out",
        switchAccount: "Switch account",
        deleteAccount: "Delete account",
        menu: "Menu"
      },
      roles: {
        patient: "Patient account",
        doctor: "Verified doctor account",
        doctor_pending: "Pending doctor account",
        clinic_admin: "Clinic admin account",
        support: "Support account",
        super_admin: "Owner"
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
        deleteAccountPermanent: "Important Notice: This action is permanent and irreversible!",
        switchAccount: "Switch Account",
        switchAccountDesc: "Please sign in with another account",
        exportData: "Export My Data (Data Portability)",
        exportDataDesc: "Download a secure electronic archive of all your medical records and profile in portable JSON format.",
        accessRequest: "Data Access Request (GDPR Art. 15)",
        accessRequestDesc: "Detailed overview of all personal and clinical data processed, retention periods, and purposes.",
        recentAuthRequired: "Security check: This sensitive action requires recent identity re-authentication.",
        partialFailureRetry: "Partial failure occurred on some steps. You can retry safely to finish deletion.",
        dataRetentionPolicy: "Data & Backup Retention Policy"
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
        medicalProfile: "Medical Profile",
        welcomePersonalized: "Welcome, {name}! Your health and safety are our priority.",
        safeNotice: "Rest assured, your certified physician will review your clinical assessment and issue the appropriate care plan.",
        recentAlerts: "Clinical Follow-up Alerts"
      },
      consent: {
        title: "Medical Consent & Privacy Policy",
        badgeRequired: "Required before assessment",
        badgeAccepted: "Consent Accepted",
        desc: "Health Vibe collects your health data for indicative risk triage and forwards it to a certified physician before any final report is issued. To safeguard your privacy and comply with medical standards, please review and confirm the consent terms below:",
        dataProcessing: "Clinical Data Processing (Mandatory): I agree to the processing of symptom data and vitals within the assessment workflow and sharing them with the attending certified physician.",
        aiAdvisory: "Advisory AI Nature (Mandatory): I understand that the AI score is an unvalidated indicative triage tool, does not constitute an independent diagnosis, and never replaces a physician examination.",
        telemedicine: "Telehealth & Clinical Consultations: I consent to receiving digital medical guidance and telehealth consults from licensed physicians via the platform.",
        gdprRights: "Privacy Rights & Data Deletion: I know I can export my data, withdraw consent, or request complete account erasure at any time.",
        emergencyDisclaimer: "Emergency Disclaimer: I acknowledge that in acute emergencies or severe hypoxia, I must contact emergency services (123) immediately without waiting for the app.",
        confirmBtn: "Confirm Consent & Proceed",
        withdrawBtn: "Withdraw Consent",
        notifications: "Follow-up Alerts & Reports (Optional): I agree to receive case updates and doctor-approved clinical reports.",
        privacyNote: "🔒 Your privacy is our priority: Data is encrypted and never shared with third parties for marketing. You can review or withdraw consent at any time.",
        agreeBtn: "✓ Agree & Proceed to Breathing Assessment",
        profileBtn: "Medical Profile",
        accessScope: "Access Scope",
        rolePermissions: "Role Permissions",
        patientAccess: "Patient: Views only their personal data and certified results.",
        doctorAccess: "Doctor: Views assigned cases with full audit history.",
        adminAccess: "Admin: Restricted operational permissions with audit log.",
        legalStandards: "Legal & Clinical Regulatory Standards:",
        legalDesc: "You can review the approved compliance documents at any time:",
        privacyPolicyBtn: "🔒 Privacy Policy",
        termsBtn: "📜 Terms of Use",
        disclaimerBtn: "🚨 Clinical Disclaimer"
      },
      profile: {
        title: "Medical Profile & Clinical Baseline",
        personalInfo: "Personal Information",
        age: "Age",
        gender: "Gender",
        male: "Male",
        female: "Female",
        bloodType: "Blood Type",
        chronicConditions: "Chronic Conditions & Diagnoses",
        allergies: "Drug & Food Allergies",
        currentMedications: "Current Medications",
        emergencyContact: "Emergency Contact",
        nationalId: "National ID (14 digits)",
        nationalIdPlaceholder: "Enter 14-digit National ID",
        saveProfileBtn: "Save & Update Profile",
        saveSuccess: "Medical profile updated successfully"
      },
      assessment: {
        title: "Breathing Assessment",
        subtitle: "Enter your oxygen measurement and symptoms to share with your attending physician",
        o2Label: "Oxygen Saturation (SpO2 %)",
        o2Placeholder: "e.g., 98",
        symptomsLabel: "Current Symptoms",
        coughLabel: "Cough Severity",
        coughNone: "No cough",
        coughMild: "Mild cough",
        coughModerate: "Moderate cough",
        coughSevere: "Severe & persistent cough",
        durationLabel: "Symptom Duration",
        durationDays: "{count} days",
        confirmDisclaimer: "I confirm these measurements are accurate and agree to share them with the physician",
        submitAssessment: "Confirm and Submit Assessment to Doctor",
        editInfo: "Edit Information",
        emergencyNotice: "🚨 Immediate Emergency Warning",
        acuteHypoxia: "Acute Hypoxia — Do not wait for digital review",
        emergencyCallBtn: "Call Ambulance Immediately (123)",
        firstAidTitle: "🫁 First-Aid Guidelines to Ease Breathing",
        firstAidStep1: "Sit upright and lean slightly forward.",
        firstAidStep2: "Breathe in slowly through the nose and exhale through pursed lips.",
        firstAidStep3: "Loosen tight clothing around neck and chest; ensure adequate room ventilation.",
        stepLabel: "Step {step} of {total}",
        draftStatusEmpty: "No draft saved yet",
        draftBannerText: "A saved draft was found for this account. You may resume or start anew.",
        resumeDraft: "Resume Draft",
        discardDraft: "Start New",
        shortnessOfBreath: "Is there shortness of breath?",
        tempLabel: "Body Temperature (Optional)",
        respiratoryRateLabel: "Respiratory Rate (Optional)",
        chestPainLabel: "Chest Pain",
        symptomDurationLabel: "Symptom Duration",
        symptomProgressionLabel: "Symptom Progression",
        recentInfectionLabel: "Recent Infection",
        asthmaCopdLabel: "Asthma or COPD",
        riskFactorsLabel: "Risk Factors",
        improving: "Improving",
        stable: "Stable",
        worsening: "Worsening",
        unknown: "Unknown"
      },
      pending: {
        title: "Review Status",
        heading: "Your assessment is awaiting doctor review",
        desc: "Your assessment has been received and routed to your attending physician. For clinical safety, the certified report will only be released following physician review.",
        step1: "Assessment Submitted",
        step2: "AI Indicative Triage",
        step3: "Physician Clinical Review",
        step4: "Certified Report Issued",
        assignedDoctor: "Assigned Physician",
        submittedAt: "Submitted At",
        statusBadge: "Pending Doctor Review",
        successTitle: "Assessment Submitted Successfully",
        reviewNote: "The physician reviews symptoms, vital signs, and AI suggestions prior to final report approval.",
        caseId: "Case Number",
        patientName: "Patient",
        oxygen: "Oxygen Level",
        priority: "Priority",
        timelineReceive: "Data Received",
        timelineAi: "AI Processing",
        timelineReview: "Doctor Review",
        timelineReport: "Report Issuance",
        returnHome: "Return Home & Track Case",
        viewHistory: "View Assessment History"
      },
      report: {
        centerName: "Health Vibe Specialized Medical Center",
        certifiedReport: "Certified Clinical Assessment Report",
        physicianApproved: "Approved by Attending Physician",
        caseRef: "Case Reference",
        patientName: "Patient Name",
        age: "Age",
        years: "yrs",
        phone: "Patient Phone / Contact",
        attendingPhysician: "Attending Physician",
        specialtyAndClinic: "Specialty & Clinic",
        medicalLicense: "Medical License #",
        approvalTime: "Approval Time",
        submittedTime: "Submitted",
        vitalsTitle: "Recorded Vital Signs & Physiological Metrics",
        oxygenSaturation: "Oxygen Saturation (SpO2)",
        respiratoryRate: "Respiratory Rate",
        temperature: "Temperature",
        clinicalDiagnosis: "Certified Clinical Diagnosis",
        recommendations: "Physician Recommendations & Care Plan",
        prescribedMedications: "Prescribed Medications",
        noMedications: "No medications prescribed during this visit.",
        clinicalDisclaimer: "Certified Clinical Disclaimer: This report is certified by a licensed physician and reflects a clinical evaluation based on the recorded symptoms and vitals.",
        digitalVerification: "Digitally certified and tamper-evident medical record complying with healthcare data security standards.",
        printReport: "Print Report",
        downloadPdf: "Download PDF",
        withdrawnNotice: "⚠️ This report was formally withdrawn by the attending physician for re-evaluation.",
        moreInfoTitle: "Physician Requested Additional Information",
        rejectionTitle: "Assessment Not Approved / Rejected",
        lockedTitle: "Clinical Report Awaiting Doctor Approval",
        lockedDesc: "For your safety, the final diagnosis will not be displayed until reviewed and approved by your attending physician.",
        emptyReportTitle: "No Clinical Reports Available",
        emptyReportDesc: "To generate a certified medical report, please complete a breathing assessment first. Your evaluation will be reviewed and approved by a physician."
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
        signOffWarning: "⚠️ This data is transmitted directly to the verified doctor's clinical review file, and no patient report is issued prior to physician sign-off.",
        allCases: "All Cases",
        pendingOnly: "Pending Only",
        urgentOnly: "Urgent Only",
        moreInfoRequested: "More Info Requested",
        newInfoReceived: "New Clinical Information Received",
        staleNotice: "New patient observations or clinical answers were submitted after initial review. Approval is locked until you explicitly review these updates.",
        compareChanges: "Compare Changes & Review",
        markReviewed: "Confirm Review & Unlock Approval",
        revision: "Clinical Revision",
        revisionStale: "Stale (Review Required)",
        revisionVerified: "Clinically Verified",
        assessmentDate: "Assessment Date",
        draftPreserved: "Unsaved draft notes preserved",
        approvalLocked: "Approval locked: Review new information before approval",
        fieldComparison: "Field-Level Revision Comparison",
        previousRevision: "Previous Revision (Baseline)",
        latestRevision: "Latest Revision (Updated)",
        clinicalDelta: "Clinical Delta & Trend",
        explicitReviewCheckbox: "I certify that I have reviewed all updated clinical measurements, timestamps, and source provenance for this revision.",
        backToQueue: "Back to Patient Queue",
        tabInputs: "Inputs & Triage",
        tabClarifications: "Clarifications",
        tabNotes: "Notes & Rx",
        tabTimeline: "Timeline",
        tabAll: "All Sections",
        groupInputsTitle: "Clinical Inputs & Triage Assessment",
        groupClarificationsTitle: "Patient Clarifications & Updates",
        groupNotesTitle: "Physician Notes & Report Builder",
        groupTimelineTitle: "Case Status Lifecycle & Audit Trail",
        clarificationThread: "Clinical Clarification Thread",
        cycleLabel: "Clarification Cycle",
        cycleOutOf: "Cycle {current} of {total}",
        statusUnanswered: "Unanswered (Awaiting Patient)",
        statusSubmitted: "Submitted (Pending Doctor Review)",
        statusReviewed: "Reviewed & Certified",
        eventVerifiedAt: "Verified by case event on: {date}",
        requestedVitals: "Requested Clinical Observations:",
        permittedAttachments: "Permitted Attachments & Records:",
        permittedAttachmentsNote: "PDF reports, lab slips, JPEG/PNG radiograph images (Max 10 MB per file)",
        directAnswerTitle: "Provide Requested Information to Physician:",
        directAnswerHint: "Enter your reply, symptom progression details, or requested observations...",
        directAnswerSubmit: "Submit Clarification to Physician",
        attachedRecords: "Attached Medical Records:",
        noClarifications: "No clarification requests have been issued for this case.",
        requestClarificationBtn: "Request Clinical Clarification",
        internalNotesIsolated: "Internal clinician notes are kept strictly separate and hidden from patients.",
        reviewReceivedReply: "Review Received Clarification",
        answerRequestAction: "Answer Request Now",
        newObservationsReceived: "Updated observations received:"
      },
      history: {
        title: "Unified Medical History",
        subtitle: "All assessments, reports, appointments, and records in one timeline",
        searchPlaceholder: "Search medical records (symptoms, diagnosis, medications, doctors)...",
        allTypes: "All Records",
        filterType: "Record Type",
        assessments: "Clinical Assessments",
        reports: "Certified Reports",
        appointments: "Appointments & Consultations",
        attachments: "Attachments & Lab Files",
        medications: "Prescribed Medications",
        chronicConditions: "Chronic Conditions",
        doctorNotes: "Doctor Recommendations & Notes",
        startDate: "From Date",
        endDate: "To Date",
        emptyHistory: "No medical records match your current search criteria.",
        internalDoctorNote: "🔒 Internal Doctor Note (Confidential)"
      },
      appointments: {
        title: "Appointments & Consultations",
        upcoming: "Upcoming Appointments",
        noUpcoming: "No scheduled appointments at this time.",
        bookNew: "Book New Consultation",
        doctorSelect: "Select Doctor",
        dateSelect: "Appointment Date",
        timeSelect: "Available Time",
        appointmentWith: "Appointment with: Dr. {doctor}",
        appointmentAt: "Date: {date} at {time}",
        cancelAppointment: "Cancel Appointment",
        rescheduleAppointment: "Reschedule Appointment"
      },
      feedback: {
        title: "Clinical Feedback & Rating",
        ratingLabel: "Service Rating",
        commentPlaceholder: "Share your experience or suggestions to improve our healthcare service...",
        submitBtn: "Submit Feedback",
        successMsg: "Thank you for your valuable feedback!"
      },
      kpi: {
        dashboardTitle: "Clinical Operations & KPI Dashboard",
        completionRate: "Completion Rate",
        responseTime: "Doctor Response Time",
        reportTurnaround: "Report Turnaround Time",
        crashFreeRate: "Crash-Free Rate",
        uptime: "SLA Uptime"
      },
      audit: {
        title: "Clinical Audit & Security Log",
        subtitle: "Complete trace of all operational events and access to clinical records",
        eventType: "Event Type",
        actor: "Actor",
        timestamp: "Timestamp",
        ipAddress: "IP Address",
        status: "Status",
        details: "Event Details"
      },
      errors: {
        centralErrorTitle: "System Security",
        centralErrorDefault: "We apologize, the requested operation could not be completed.",
        centralErrorHint: "💡 Please try again or check your internet connection.",
        supportRef: "ℹ️ Support Reference",
        permissionDenied: "Permission denied for this operation.",
        networkError: "Unable to connect to the server. Please check your internet connection.",
        invalidCredentials: "Invalid email address or password.",
        rateLimited: "Rate limit exceeded. Please wait a moment before trying again.",
        nationalIdInvalid: "Egyptian National ID must be a valid 14-digit number.",
        unauthorized: "Authentication required for this operation.",
        notFound: "The requested record was not found or has been deleted.",
        serverError: "An unexpected server error occurred. The incident has been logged for review."
      },
      time: {
        now: "Just now",
        minutesAgo: "{count}m ago",
        hoursAgo: "{count}h ago",
        daysAgo: "{count}d ago"
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
     */
    t(key, params = null, fallback = "") {
      if (!key) return "";

      const lang = this.currentLanguage;

      // 1. Try structured catalog lookup in current language
      let result = getNestedValue(this.catalog[lang], key);

      // 2. Try structured catalog lookup in fallback language (en or ar)
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
     * Formats a date object or ISO string in the active locale.
     */
    formatDate(date, options = { dateStyle: "medium" }) {
      if (!date) return "";
      const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));
      if (isNaN(d.getTime())) return String(date);
      const locale = this.currentLanguage === "ar" ? "ar-EG" : "en-US";
      try {
        return new Intl.DateTimeFormat(locale, options).format(d);
      } catch (e) {
        return d.toLocaleDateString();
      }
    }

    /**
     * Formats a time in the active locale.
     */
    formatTime(date, options = { timeStyle: "short" }) {
      if (!date) return "";
      const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));
      if (isNaN(d.getTime())) return String(date);
      const locale = this.currentLanguage === "ar" ? "ar-EG" : "en-US";
      try {
        return new Intl.DateTimeFormat(locale, options).format(d);
      } catch (e) {
        return d.toLocaleTimeString();
      }
    }

    /**
     * Formats full date and time in the active locale.
     */
    formatDateTime(date, options = { dateStyle: "medium", timeStyle: "short" }) {
      if (!date) return "";
      const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));
      if (isNaN(d.getTime())) return String(date);
      const locale = this.currentLanguage === "ar" ? "ar-EG" : "en-US";
      try {
        return new Intl.DateTimeFormat(locale, options).format(d);
      } catch (e) {
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      }
    }

    /**
     * Formats a number with commas and standard locale-aware numerals.
     */
    formatNumber(num, options = {}) {
      if (num === null || num === undefined || num === "" || isNaN(Number(num))) return String(num ?? "");
      const locale = this.currentLanguage === "ar" ? "ar-EG" : "en-US";
      try {
        return new Intl.NumberFormat(locale, options).format(Number(num));
      } catch (e) {
        return String(num);
      }
    }

    /**
     * Formats a percentage value (e.g., 95 -> "95%" or "%95" / "٩٥٪")
     */
    formatPercent(num) {
      if (num === null || num === undefined || num === "" || isNaN(Number(num))) return String(num ?? "");
      const formatted = this.formatNumber(num);
      return this.currentLanguage === "ar" ? `%${formatted}` : `${formatted}%`;
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
     * Strictly preserves user-typed input field values.
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

      // 3. Placeholders (Preserves input value!)
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

      // 6. Values (explicitly tagged with [data-i18n-value])
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
