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
        notAvailable: "غير متوفر",
        diseaseCategoryTitle: "الأمراض",
        diseaseUnderPrep: "قيد الإعداد والتجهيز السريري",
        diabetesTitle: "وحدة داء السكري",
        diabetesDesc: "قسم سريري متخصص لمتابعة مستويات السكر في الدم، واستشارات الغدد الصماء، والخطط العلاجية المعتمدة.",
        hypertensionTitle: "وحدة ارتفاع ضغط الدم",
        hypertensionDesc: "قسم سريري لمراقبة ضغط الدم، ومؤشرات الدورة الدموية، ومتابعة صحة القلب والأوعية الدموية.",
        bloodDisordersTitle: "وحدة تجلط الدم واضطرابات الدم",
        bloodDisordersDesc: "قسم سريري متخصص لمتابعة سيولة وتجلط الدم واعتلالات الدم ومراجعة التحاليل التخصصية.",
        obesityTitle: "وحدة علاج السمنة والتمثيل الغذائي",
        obesityDesc: "قسم سريري متخصص في إدارة الوزن، ومؤشر كتلة الجسم، وخطط التغذية العلاجية تحت إشراف طبي.",
        diseaseClinicalNotice: "الوحدة التخصصية تخضع للتجهيز السريري المعتمد وفق معايير الرعاية الطبية. لا يتم عرض أي بيانات أو نتائج غير موثقة سريرياً.",
        backToHome: "العودة للرئيسية"
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
        menu: "المزيد",
        disease: "الأمراض",
        diabetes: "داء السكري",
        hypertension: "ارتفاع ضغط الدم",
        bloodDisorders: "تجلط الدم / اضطرابات الدم",
        obesity: "السمنة"
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
        dataRetentionPolicy: "سياسة الاحتفاظ بالبيانات والنسخ الاحتياطية",
        providersTitle: "إدارة وسائل تسجيل الدخول وربط الحسابات",
        providersSubtitle: "يمكنك ربط حسابك بـ Google وكلمة المرور للوصول الآمن، مع الحفاظ الكامل على سجلك الطبي ومعرّفك UID.",
        firebaseUidPreserved: "معرّف السجلات الطبية (Firebase UID) محفوظ ومقترن بحسابك دائماً",
        providerGoogle: "حساب Google",
        providerPassword: "البريد الإلكتروني وكلمة المرور",
        providerConnected: "متصل ومفعل",
        providerNotConnected: "غير مرتبط",
        linkGoogleBtn: "ربط حساب Google",
        setPasswordBtn: "تعيين كلمة مرور للبريد",
        unlinkProviderBtn: "إلغاء الربط",
        unlinkBlockedLastMethod: "لا يمكن إلغاء وسيلة تسجيل الدخول الوحيدة المتبقية لحسابك لتفادي قفل الحساب وفقدان الوصول.",
        linkingSuccess: "تم ربط وسيلة تسجيل الدخول بنجاح! معرّف حسابك وسجلاتك الطبية محفوظة بالكامل.",
        unlinkingSuccess: "تم إلغاء ربط وسيلة تسجيل الدخول بنجاح.",
        linkingCanceled: "تم إلغاء عملية الربط.",
        conflictAlreadyInUse: "وسيلة تسجيل الدخول هذه مرتبطة بالفعل بحساب آخر. لحماية سرية المرضى، لا يمكن دمج السجلات الطبية تلقائياً.",
        conflictRecoveryGuide: "إرشادات الاستعادة: سجل الدخول بحسابك الآخر مباشرة، أو أثبت ملكية الحسابين للتنسيق مع الدعم الطبي.",
        accountSuspendedNotice: "هذا الحساب موقوف حالياً من قِبل إدارة المنصة. تم تجميد كافة عمليات ربط أو تعديل وسائل تسجيل الدخول.",
        noEmailAutoMergeNotice: "سياسة الأمان السريري: السجلات الطبية مقترنة بالمعرّف UID، ويحظر تماماً دمج أي سجلات بناءً على تطابق البريد فقط.",
        enterPasswordToLink: "أدخل كلمة المرور الجديدة لربط البريد بالحساب",
        reauthRequiredPrompt: "تأكيد الهوية: يرجى إدخال كلمة المرور الحالية لاستكمال العملية الحساسة بأمان"
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
      },
      diabetes: {
        moduleTitle: "وحدة داء السكري ومراقبة نسبة السكر",
        specialtyScope: "المسار التخصصي لأمراض الغدد الصماء والسكري",
        statusReview: "قيد المراجعة المتخصصة",
        governanceBadge: "بيانات موثقة فقط",
        tabOverview: "نظرة عامة",
        tabPatientInfo: "بيانات المريض",
        tabMeasurements: "القياسات والتحاليل",
        tabAssessments: "التقييمات السريرية",
        tabDoctorReview: "مراجعة الطبيب والملاحظات",
        tabFollowup: "المتابعة والزيارات",
        tabReports: "التقارير المعتمدة",
        overviewNoticeTitle: "الحوكمة السريرية وسلامة البيانات الطبية",
        overviewNoticeBody: "تدير هذه الوحدة السجلات السريرية لداء السكري ومستويات الجلوكوز بدقة متناهية. كل حقل يعكس بيانات سريرية حقيقية موثقة دون أي افتراضات أو قيم اصطناعية.",
        fourStateRule: "التصنيف السريري الصارم لكل حقل: معلوم، مجهول، لم يتم توفيره، غير منطبق.",
        humanReviewRule: "المراجعة المستقلة لطبيب الغدد الصماء شرط أساسي لأي اعتماد.",
        totalMeasurements: "القياسات المسجلة",
        clinicalNotesCount: "ملاحظات الطبيب",
        reviewsCount: "المراجعات الطبية",
        approvedReportsCount: "التقارير المعتمدة",
        recordsLogged: "قراءات موثقة مسجلة",
        noMeasurementsYet: "لا توجد قراءات مسجلة حتى الآن",
        notesRecorded: "ملاحظات سريرية مسجلة بالملف",
        noNotesYet: "لا توجد ملاحظات سريرية حتى الآن",
        reviewsCompleted: "مراجعات متخصصة مكتملة",
        noReviewsYet: "لا توجد مراجعات مسجلة حتى الآن",
        certifiedAvailable: "تقارير معتمدة جاهزة",
        noApprovedReportsYet: "لا توجد تقارير معتمدة حتى الآن",
        guidelinesTitle: "المعايير والأدلة الإرشادية السريرية المرجعية",
        patientInfoTitle: "الملف السريري للمريض",
        patientInfoSubtitle: "سجلات سريرية حقيقية مع تمييز دقيق لحالة كل حقل.",
        fieldLabel: "المؤشر السريري",
        fieldStatus: "الحالة المسجلة والقيمة",
        paramPatientId: "المعرف الطبي للمريض",
        paramPatientName: "اسم المريض",
        paramType: "تصنيف داء السكري",
        paramDiagnosisDate: "تاريخ التشخيص",
        paramFastingTarget: "الهدف لسكر الصائم",
        paramPostprandialTarget: "الهدف لسكر ما بعد الوجبة",
        paramHba1cTarget: "الهدف للسكر التراكمي (HbA1c)",
        paramActiveInsulin: "النظام العلاجي للإنسولين",
        paramComorbidities: "الأمراض المصاحبة الموثقة",
        paramAssignedDoctor: "الطبيب المعالج المخصص",
        paramLastReviewed: "تاريخ آخر مراجعة سريرية",
        measurementsTitle: "قياسات السكر والمؤشرات الحيوية",
        measurementsSubtitle: "قراءات السكر والسكر التراكمي والكيتونات المسجلة فعلياً.",
        btnLogMeasurement: "تسجيل قراءة جديدة",
        noMeasurementsHeading: "لا توجد قياسات مسجلة للمريض",
        noMeasurementsText: "لم يتم تسجيل أي قراءات لمستوى السكر أو التحاليل المخبرية لهذا المريض بعد.",
        measType: "نوع القياس / السياق",
        measValue: "القيمة",
        measSource: "مصدر القراءة",
        typeFasting: "سكر الدم الصائم (FBG)",
        typePostprandial: "سكر الدم بعد الأكل بساعتين (PPG)",
        typeRandom: "سكر الدم العشوائي (RBG)",
        typeBedtime: "سكر الدم قبل النوم",
        typeHba1c: "السكر التراكمي (HbA1c)",
        typeKetones: "الكيتونات",
        srcManual: "تسجيل يدوي من المريض",
        srcCgm: "مستشعر السكر المستمر (CGM)",
        srcBgm: "جهاز قياس السكر بالبلوتوث (BGM)",
        srcClinic: "قراءة سريرية بالعيادة",
        srcLab: "تقرير معمل معتمد (OCR)",
        assessmentsTitle: "التقييمات السريرية لداء السكري",
        assessmentsSubtitle: "متكاملة مع محرك التقييمات السريرية الموحد بالمنصة.",
        btnNewAssessment: "بدء تقييم سريري",
        noAssessmentsHeading: "لا يوجد سجل تقييمات سابقة",
        noAssessmentsText: "لا توجد تقييمات خاصة بداء السكري مسجلة. يمكنك بدء تقييم جديد عبر المحرك المعتمد.",
        btnStartAssessment: "بدء التقييم الآن",
        doctorReviewTitle: "مراجعة الطبيب المعالج والملاحظات السريرية",
        doctorReviewSubtitle: "استشارات الطبيب المرخص والملاحظات السريرية التتابعية.",
        btnAddNote: "إضافة ملاحظة سريرية",
        btnRecordReview: "تسجيل مراجعة الطبيب",
        assignmentTitle: "الطبيب المتخصص المعين للحالة",
        noDoctorAssigned: "لم يتم تعيين طبيب معالج بعد",
        assignedSpecialistDesc: "استشاري / أخصائي الغدد الصماء والسكري المسؤول",
        pendingAssignmentDesc: "الحالة في انتظار التعيين ضمن قائمة الفرز السريري",
        notesHeading: "الملاحظات السريرية واستشارات المتابعة",
        noNotesNotice: "لا توجد ملاحظات استشارية سريرية مسجلة بالملف.",
        reviewsHistoryHeading: "سجل المراجعات الطبية المعتمدة",
        noReviewsNotice: "لا توجد مراجعات طبية رسمية مسجلة بعد.",
        recommendations: "التوصيات الطبية:",
        followupTitle: "خطة المتابعة الدورية ومراقبة السكر",
        followupSubtitle: "المواعيد المحددة لإعادة الفحص وتحليل التراكمي وفحص المضاعفات.",
        btnBookConsultation: "حجز موعد متابعة",
        noFollowupHeading: "لم يتم تحديد خطة متابعة بعد",
        noFollowupText: "لم يقم الطبيب المعالج بعد بتحديد موعد أو بروتوكول للمتابعة الدورية لهذا المريض.",
        scheduledDate: "تاريخ المراجعة القادمة",
        intervalDays: "فترة المتابعة الدورية",
        instructions: "تعليمات الطبيب المعالج",
        reportsTitle: "التقارير الطبية المعتمدة",
        reportsSubtitle: "التقارير الرسمية الموقعة والمعتمدة من الأطباء المرخصين.",
        noReportsHeading: "لا توجد تقارير معتمدة",
        noReportsText: "لم يصدر أي تقرير طبي معتمد لهذا المريض في مسار داء السكري حتى الآن.",
        approvingDoctor: "الطبيب المعتمد",
        btnViewReport: "عرض التقرير المعتمد",
        modalLogTitle: "تسجيل قياس سريري حقيقي",
        formType: "نوع القياس",
        formValue: "القيمة (مجم/ديسيلتر أو % للتراكمي)",
        formSource: "مصدر القياس",
        formNotes: "سياق القياس / ملاحظات (اختياري)",
        modalNoteTitle: "إضافة ملاحظة استشارة سريرية",
        noteTextLabel: "الملاحظة السريرية",
        modalReviewTitle: "تسجيل مراجعة الطبيب المعالج",
        reviewObservations: "الملاحظات السريرية للحالة",
        reviewRecommendations: "التوصيات الطبية (سطر لكل توصية)",
        accessDeniedTitle: "تم رفض الوصول: خصوصية وعزل بيانات المريض",
        accessDeniedBody: "وفقاً لسياسة الخصوصية وأمان البيانات الطبية، لا يمكن عرض بيانات مريض آخر.",
        doctorNotAssignedNotice: "ليس لديك صلاحية للاطلاع على هذا الملف لأنك لست الطبيب المعالج المخصص لمراجعة هذا المريض.",
        privacyIsolationNotice: "يمكنك فقط الاطلاع على بياناتك السريرية الخاصة بك.",
        authRequiredTitle: "تسجيل الدخول مطلوب",
        authRequiredBody: "يرجى تسجيل الدخول للوصول إلى متابعة داء السكري المخصصة لك.",
        stateKnown: "معلوم",
        stateUnknown: "غير معروف",
        stateUnknownDesc: "تم الاستقصاء سريرياً ولكن الحالة غير معروفة",
        stateNotProvided: "لم يتم توفيره",
        stateNotProvidedDesc: "لم يقدمه المريض أو الطبيب بعد",
        stateNotApplicable: "غير منطبق",
        stateNotApplicableDesc: "لا ينطبق على السياق السريري للمريض",
        structuredAssessmentTitle: "التقييم السريري المُنظّم لداء السكري",
        btnNewStructuredAssessment: "تقييم منظم جديد",
        btnReviseAssessment: "تحديث ومراجعة التقييم السريري",
        clinicalRevisionBadge: "المراجعة السريرية",
        sectionHistory: "تاريخ وحالة داء السكري",
        sectionSymptoms: "الأعراض السريرية المشاهدة",
        sectionMeasurements: "قياسات السكر والفحوصات المخبرية",
        sectionMedications: "أدوية السكري الحالية",
        sectionComplications: "المضاعفات السريرية الموثقة",
        sectionFamilyHistory: "التاريخ العائلي للسكري",
        sectionLifestyle: "نمط الحياة والنشاط البدني",
        sectionDoctorNotes: "ملاحظات الطبيب المعالج",
        sectionFollowup: "بروتوكول المتابعة السريرية",
        observationHistory: "سجل القياسات السريرية التاريخية المحفوظة",
        lblRevision: "المراجعة",
        lblAuthor: "المصدر / جهة التوثيق",
        lblTimestamp: "التاريخ والوقت",
        lblUnit: "الوحدة",
        lblValue: "القيمة",
        modalAssessmentTitle: "استمارة التقييم السريري المنظم لداء السكري",
        modalReviseTitle: "تحديث التقييم السريري (مراجعة جديدة)",
        fieldStatusLabel: "حالة السكري",
        fieldDiabetesType: "نوع السكري الموثق سريرياً",
        fieldDiagnosisDate: "تاريخ أو سنة التشخيص",
        fieldSymptomsList: "الأعراض المشاهدة",
        fieldFastingGlucose: "سكر الدم الصائم (FBG)",
        fieldPostprandialGlucose: "سكر الدم بعد الأكل (PPG)",
        fieldRandomGlucose: "سكر الدم العشوائي (RBG)",
        fieldHba1c: "السكر التراكمي (HbA1c)",
        fieldMeasurementUnit: "وحدة القياس",
        fieldMeasurementSource: "مصدر القياس",
        fieldMedicationsList: "الأدوية الموثقة والجرعات",
        fieldComplicationsList: "المضاعفات الموثقة",
        fieldFamilyHistoryNotes: "تفاصيل التاريخ العائلي",
        fieldLifestyleNotes: "النظام الغذائي والنشاط البدني",
        fieldDoctorNotesInput: "ملاحظات الطبيب (للأطباء فقط)",
        fieldFollowupDate: "تاريخ المتابعة القادمة",
        fieldFollowupInterval: "فترة المتابعة (بالأيام)",
        fieldFollowupInstructions: "تعليمات المتابعة السريرية",
        btnSaveAssessment: "حفظ سجل التقييم",
        btnSubmitRevision: "اعتماد المراجعة السريرية",
        savedAssessmentSuccess: "تم حفظ سجل التقييم السريري بنجاح",
        savedRevisionSuccess: "تم تسجيل المراجعة السريرية الجديدة بنجاح",
        noAssessmentsDesc: "لم يتم تسجيل أي تقييم سريري منظم لداء السكري لهذا المريض بعد.",
        reviewWorkflowTitle: "مراجعة الطبيب والاعتماد السريري لداء السكري",
        patientIdentityTitle: "هوية المريض والبيانات التعريفية",
        assessmentDateLabel: "تاريخ التقييم",
        clinicalRevisionLabel: "المراجعة السريرية",
        submittedInfoHeading: "البيانات السريرية المدخلة للسكري",
        historicalMeasurementsHeading: "القياسات السجلية وتتبع سكر الدم",
        patientClarificationsHeading: "استفسارات وإفادات المريض",
        relevantAttachmentsHeading: "المرفقات والتقارير الطبية",
        doctorNotesHeading: "ملاحظات الطبيب السريرية",
        previousApprovedReportsHeading: "التقارير الطبية المعتمدة السابقة",
        btnReviewCurrentRevision: "مراجعة وتدقيق المراجعة السريرية الحالية",
        reviewModalTitle: "تدقيق ومراجعة بيانات المراجعة السريرية",
        certifyRevisionReviewCheckbox: "أقر بأنني قمت شخصياً بفحص ومراجعة كافة البيانات والقياسات السريرية في هذه المراجعة.",
        btnConfirmReviewAndUnlock: "تأكيد المراجعة وفك قفل الاعتماد",
        staleReviewBannerTitle: "تم استلام معلومات سريرية جديدة",
        staleReviewBannerDesc: "تم تحديث البيانات أو القياسات السريرية بعد الفحص. يلزم إعادة المراجعة قبل الاعتماد.",
        approvalLockedNotice: "الاعتماد مقفل: يجب فحص وتأكيد المراجعة السريرية الحالية قبل الاعتماد.",
        btnApproveDiabetesReport: "اعتماد وإصدار التقرير الطبي للسكري",
        conflictBannerTitle: "تعارض في البيانات السريرية (HTTP 409)",
        conflictBannerDesc: "تم تعديل البيانات السريرية بشكل متزامن. تم الحفاظ على مسودة ملاحظاتك كاملة دون فقدان.",
        nonDiagnosticNotice: "يحظر التوليد الآلي للتشخيص أو جرعات الأدوية. يجب أن يصدر المحتوى السريري النهائي من الطبيب المعتمد.",
        diagInputLabel: "التشخيص الطبي السريري المعتمد *",
        medsInputLabel: "الخطة العلاجية والروشتة الدوائية (Rx)",
        recsInputLabel: "التوصيات الطبية وخطة المتابعة *",
        noAttachmentsNotice: "لا توجد ملفات أو تقارير مرفقة.",
        noClarificationsNotice: "لا توجد استفسارات مفتوحة أو إفادات معلقة.",
        noPreviousReportsNotice: "لا توجد تقارير معتمدة سابقة بالملف.",
        viewCertifiedReport: "عرض التقرير المعتمد",
        reviewStatusVerified: "مراجعة مدققة",
        reviewStatusPending: "مطلوب المراجعة",
        unsavedNotesPreservedNotice: "تم الحفاظ على مسودة الملاحظات غير المحفوظة.",
        patientDashboardTitle: "لوحة متابعة السكري",
        patientDashboardSubtitle: "متابعة القياسات، التقارير المعتمدة، واستفسارات الفريق الطبي",
        currentDocumentedStatus: "حالة السكري الموثقة حاليًا",
        statusDocumented: "بيانات موثقة",
        statusMissing: "غير متوفرة",
        statusAwaitingReview: "بانتظار مراجعة الطبيب",
        statusDoctorApproved: "معتمد طبيًا",
        nextActionHeading: "الإجراء المطلوب التالي",
        actionReplyClarification: "الرد على استفسار الطبيب المعلق",
        actionLogFirstMeasurement: "تسجيل أول قراءة لسكر الدم لبدء خطة المتابعة",
        actionLogMeasurement: "تسجيل قراءة سكر الدم",
        actionAwaitingDoctorReview: "بياناتك قيد المراجعة المتخصصة — لا يوجد إجراء مطلوب منك حاليًا",
        actionReviewApprovedReport: "الاطلاع على تقريرك الطبي وخطة المتابعة المعتمدة",
        actionAllUpToDate: "سجلاتك محدثة بالكامل — استمر في المتابعة حسب خطة الطبيب",
        recentMeasurementsHeading: "أحدث القياسات المسجلة",
        measurementDateLabel: "تاريخ ووقت القياس",
        measurementUnitLabel: "الوحدة",
        outstandingInquiriesHeading: "استفسارات الطبيب المعلقة",
        noInquiriesNotice: "لا توجد استفسارات معلقة من طبيبك حاليًا",
        btnReplyToDoctor: "إرسال رد للطبيب",
        doctorApprovedFollowupHeading: "خطة المتابعة المعتمدة من الطبيب",
        noApprovedFollowupNotice: "ستظهر خطة المتابعة هنا بمجرد اعتمادها رسميًا من طبيبك المعالج",
        approvedReportsHeading: "التقارير الطبية المعتمدة",
        noApprovedReportsPatientNotice: "لا توجد تقارير معتمدة بعد — تصدر التقارير الطبية فقط بعد اعتماد الطبيب المختص",
        clinicalGovernancePatientNotice: "البيانات المعروضة مستخرجة بالكامل من سجلاتك الطبية الحقيقية. لا يتم عرض ملاحظات الطبيب الداخلية أو التفسيرات غير المعتمدة.",
        replyModalTitle: "الرد على استفسار الطبيب المعالج",
        replyInputLabel: "توضيحك / إجابتك",
        btnSubmitReply: "إرسال التوضيح للطبيب",
        replySuccessMessage: "تم إرسال توضيحك بنجاح وسيتلقاه طبيبك في مراجعته القادمة",
        statusLegendTitle: "دليل حالات البيانات السريرية",
        emptyMeasurementsPatientMessage: "لم يتم تسجيل أي قراءات لسكر الدم أو التراكمي في سجلك حتى الآن",
        targetRangesHeading: "المستويات المستهدفة المعتمدة",
        treatmentRegimenHeading: "النظام العلاجي الموثق"
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
        notAvailable: "N/A",
        diseaseCategoryTitle: "Disease",
        diseaseUnderPrep: "Under Clinical Preparation",
        diabetesTitle: "Diabetes Module",
        diabetesDesc: "Specialized clinical module for blood glucose monitoring, endocrine consultations, and certified care plans.",
        hypertensionTitle: "Hypertension Module",
        hypertensionDesc: "Clinical module for blood pressure tracking, hemodynamic indicators, and cardiovascular health follow-up.",
        bloodDisordersTitle: "Blood Clotting & Blood Disorders Module",
        bloodDisordersDesc: "Specialized clinical module for coagulation profiles, hematology consultations, and lab review.",
        obesityTitle: "Obesity & Metabolic Health Module",
        obesityDesc: "Specialized clinical module for weight management, BMI assessment, and clinical nutrition plans.",
        diseaseClinicalNotice: "This specialized module is under certified clinical preparation adhering to medical care standards. No unverified data or clinical results are displayed.",
        backToHome: "Return to Home"
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
        menu: "Menu",
        disease: "Disease",
        diabetes: "Diabetes",
        hypertension: "Hypertension",
        bloodDisorders: "Blood Clotting / Blood Disorders",
        obesity: "Obesity"
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
        dataRetentionPolicy: "Data & Backup Retention Policy",
        providersTitle: "Authentication Providers & Account Linking",
        providersSubtitle: "Connect Google and Email/Password for secure access while keeping medical records and Firebase UID preserved.",
        firebaseUidPreserved: "Clinical records are permanently tied to this Firebase UID and preserved across linked providers",
        providerGoogle: "Google Account",
        providerPassword: "Email & Password",
        providerConnected: "Connected & Active",
        providerNotConnected: "Not Connected",
        linkGoogleBtn: "Link Google Account",
        setPasswordBtn: "Set Password for Email",
        unlinkProviderBtn: "Unlink Provider",
        unlinkBlockedLastMethod: "Cannot remove your only remaining sign-in method. You must keep at least one active method to avoid lockout.",
        linkingSuccess: "Sign-in provider linked successfully! Your Firebase UID and clinical records remain preserved.",
        unlinkingSuccess: "Sign-in provider unlinked successfully.",
        linkingCanceled: "Linking process was canceled.",
        conflictAlreadyInUse: "This credential is already linked to another Health Vibes account. Medical records cannot be merged automatically.",
        conflictRecoveryGuide: "Recovery guide: Sign in using that account directly, or prove ownership of both accounts to consult clinical support.",
        accountSuspendedNotice: "This account is suspended by platform administration. Modifying authentication providers is currently blocked.",
        noEmailAutoMergeNotice: "Clinical security policy: Records are strictly bound to your UID. Records are never merged based solely on matching email strings.",
        enterPasswordToLink: "Enter a new password to link email authentication to this account",
        reauthRequiredPrompt: "Identity Verification: Please enter your current password to complete this sensitive security operation"
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
      },
      diabetes: {
        moduleTitle: "Diabetes Mellitus & Glycemic Control Module",
        specialtyScope: "Endocrinology & Diabetology Specialized Track",
        statusReview: "Under Specialist Review",
        governanceBadge: "Verified Data Only",
        tabOverview: "Overview",
        tabPatientInfo: "Patient Information",
        tabMeasurements: "Measurements",
        tabAssessments: "Clinical Assessments",
        tabDoctorReview: "Doctor Review & Notes",
        tabFollowup: "Follow-up",
        tabReports: "Approved Reports",
        overviewNoticeTitle: "Clinical Data Governance & Medical Integrity",
        overviewNoticeBody: "This specialized module manages endocrine clinical records and glycemic biomarkers with certified integrity. Every field reflects real clinical entry without assumptions or synthetic defaults.",
        fourStateRule: "Strict 4-State Field Classification: Known, Unknown, Not Provided, Not Applicable.",
        humanReviewRule: "Independent Endocrinology Specialist Review strictly required.",
        totalMeasurements: "Persisted Measurements",
        clinicalNotesCount: "Doctor Clinical Notes",
        reviewsCount: "Doctor Reviews",
        approvedReportsCount: "Approved Reports",
        recordsLogged: "Verified readings logged",
        noMeasurementsYet: "No readings logged yet",
        notesRecorded: "Clinical observations on file",
        noNotesYet: "No clinical notes on file",
        reviewsCompleted: "Specialist reviews completed",
        noReviewsYet: "No reviews on record",
        certifiedAvailable: "Certified reports ready",
        noApprovedReportsYet: "No approved reports yet",
        guidelinesTitle: "Governing Clinical Practice Guidelines",
        patientInfoTitle: "Patient Clinical Profile",
        patientInfoSubtitle: "Real persisted records with explicit field-state tracking.",
        fieldLabel: "Clinical Parameter",
        fieldStatus: "Recorded State & Value",
        paramPatientId: "Patient Identifier",
        paramPatientName: "Patient Name",
        paramType: "Diabetes Classification",
        paramDiagnosisDate: "Date of Diagnosis",
        paramFastingTarget: "Target Fasting Blood Glucose",
        paramPostprandialTarget: "Target Postprandial Glucose",
        paramHba1cTarget: "Target HbA1c",
        paramActiveInsulin: "Active Insulin Regimen",
        paramComorbidities: "Documented Comorbidities",
        paramAssignedDoctor: "Assigned Attending Doctor",
        paramLastReviewed: "Last Clinical Review Date",
        measurementsTitle: "Glycemic & Biomarker Measurements",
        measurementsSubtitle: "Real recorded blood glucose, HbA1c, and ketone readings.",
        btnLogMeasurement: "Log Real Measurement",
        noMeasurementsHeading: "No Persisted Measurements Recorded",
        noMeasurementsText: "No blood glucose or laboratory measurements have been recorded yet for this patient.",
        measType: "Measurement Type / Context",
        measValue: "Value",
        measSource: "Measurement Source",
        typeFasting: "Fasting Blood Glucose (FBG)",
        typePostprandial: "Postprandial (2-hr post-meal)",
        typeRandom: "Random Blood Glucose (RBG)",
        typeBedtime: "Bedtime Blood Glucose",
        typeHba1c: "Glycated Hemoglobin (HbA1c)",
        typeKetones: "Ketones",
        srcManual: "Manual Patient Log",
        srcCgm: "Continuous Glucose Monitor (CGM)",
        srcBgm: "Bluetooth Glucometer (BGM)",
        srcClinic: "In-Clinic Reading",
        srcLab: "Accredited Lab Report (OCR)",
        assessmentsTitle: "Diabetes Clinical Assessments",
        assessmentsSubtitle: "Integrated with the unified clinical assessment engine.",
        btnNewAssessment: "Initiate Clinical Assessment",
        noAssessmentsHeading: "Zero Assessment History",
        noAssessmentsText: "No diabetes-specific assessments on file. You can start a new clinical assessment via the existing engine.",
        btnStartAssessment: "Start Assessment",
        doctorReviewTitle: "Attending Physician Review & Clinical Notes",
        doctorReviewSubtitle: "Licensed medical professional consultation and longitudinal clinical observations.",
        btnAddNote: "Add Clinical Note",
        btnRecordReview: "Record Doctor Review",
        assignmentTitle: "Assigned Medical Specialist",
        noDoctorAssigned: "No attending doctor assigned yet",
        assignedSpecialistDesc: "Endocrinologist / Diabetologist in charge",
        pendingAssignmentDesc: "Case awaiting doctor assignment in triage queue",
        notesHeading: "Clinical Observations & Consultation Notes",
        noNotesNotice: "No clinical consultation notes recorded on file.",
        reviewsHistoryHeading: "Formal Reviews on Record",
        noReviewsNotice: "No formal doctor reviews on record.",
        recommendations: "Clinical Recommendations:",
        followupTitle: "Chronic Follow-up & Glycemic Monitoring Plan",
        followupSubtitle: "Scheduled specialist evaluations, repeat HbA1c tests, and complication screening intervals.",
        btnBookConsultation: "Book Follow-up Appointment",
        noFollowupHeading: "No Follow-up Plan Prescribed Yet",
        noFollowupText: "The attending endocrinologist has not yet set a formal follow-up interval for this patient.",
        scheduledDate: "Scheduled Review Date",
        intervalDays: "Monitoring Interval",
        instructions: "Specialist Instructions",
        reportsTitle: "Certified Medical Reports",
        reportsSubtitle: "Formal medical reports signed and approved by licensed physicians.",
        noReportsHeading: "Zero Approved Reports",
        noReportsText: "No approved medical reports have been certified yet for this patient in diabetes.",
        approvingDoctor: "Approving Doctor",
        btnViewReport: "View Certified Report",
        modalLogTitle: "Log Real Measurement",
        formType: "Measurement Type",
        formValue: "Value (mg/dL or % for HbA1c)",
        formSource: "Measurement Source",
        formNotes: "Context / Patient Notes (Optional)",
        modalNoteTitle: "Add Clinical Consultation Note",
        noteTextLabel: "Clinical Observation / Note",
        modalReviewTitle: "Record Attending Doctor Review",
        reviewObservations: "Clinical Observations",
        reviewRecommendations: "Specialist Recommendations (One per line)",
        accessDeniedTitle: "Access Denied: Patient Privacy Isolation",
        accessDeniedBody: "Under medical privacy governance, you cannot view another patient's clinical records.",
        doctorNotAssignedNotice: "You are not authorized to view this patient's diabetes records because you are not assigned as their attending physician.",
        privacyIsolationNotice: "You can only access your own clinical diabetes information.",
        authRequiredTitle: "Authentication Required",
        authRequiredBody: "Please sign in to access personalized clinical diabetes tracking.",
        stateKnown: "Known",
        stateUnknown: "Unknown",
        stateUnknownDesc: "Clinically investigated but status is unknown",
        stateNotProvided: "Not provided",
        stateNotProvidedDesc: "Unsupplied by patient or clinician",
        stateNotApplicable: "Not applicable",
        stateNotApplicableDesc: "Does not apply to this clinical context",
        structuredAssessmentTitle: "Structured Diabetes Clinical Assessment",
        btnNewStructuredAssessment: "New Structured Assessment",
        btnReviseAssessment: "Revise Clinical Assessment",
        clinicalRevisionBadge: "Clinical Revision",
        sectionHistory: "Diabetes History & Status",
        sectionSymptoms: "Relevant Observed Symptoms",
        sectionMeasurements: "Glycemic & Laboratory Measurements",
        sectionMedications: "Current Diabetes Medications",
        sectionComplications: "Relevant Documented Complications",
        sectionFamilyHistory: "Family History",
        sectionLifestyle: "Lifestyle & Physical Activity",
        sectionDoctorNotes: "Attending Physician Notes",
        sectionFollowup: "Clinical Follow-up Protocol",
        observationHistory: "Preserved Historical Measurements Ledger",
        lblRevision: "Revision",
        lblAuthor: "Author / Provenance",
        lblTimestamp: "Date & Time",
        lblUnit: "Unit",
        lblValue: "Value",
        modalAssessmentTitle: "Structured Diabetes Clinical Assessment",
        modalReviseTitle: "Revise Clinical Assessment (New Revision)",
        fieldStatusLabel: "Diabetes Status",
        fieldDiabetesType: "Documented Diabetes Type",
        fieldDiagnosisDate: "Diagnosis Date / Year",
        fieldSymptomsList: "Observed Symptoms",
        fieldFastingGlucose: "Fasting Blood Glucose (FBG)",
        fieldPostprandialGlucose: "Postprandial Blood Glucose (PPG)",
        fieldRandomGlucose: "Random Blood Glucose (RBG)",
        fieldHba1c: "Glycated Hemoglobin (HbA1c)",
        fieldMeasurementUnit: "Measurement Unit",
        fieldMeasurementSource: "Measurement Source",
        fieldMedicationsList: "Documented Medications & Dosages",
        fieldComplicationsList: "Documented Complications",
        fieldFamilyHistoryNotes: "Family History Details",
        fieldLifestyleNotes: "Diet & Physical Activity",
        fieldDoctorNotesInput: "Doctor Notes (Physicians Only)",
        fieldFollowupDate: "Follow-up Scheduled Date",
        fieldFollowupInterval: "Interval (Days)",
        fieldFollowupInstructions: "Follow-up Instructions",
        btnSaveAssessment: "Save Assessment Record",
        btnSubmitRevision: "Submit Revision",
        savedAssessmentSuccess: "Assessment record saved successfully",
        savedRevisionSuccess: "New clinical revision created successfully",
        noAssessmentsDesc: "No structured diabetes assessments have been submitted for this patient yet.",
        reviewWorkflowTitle: "Diabetes Doctor Review & Clinical Certification",
        patientIdentityTitle: "Patient Identity & Clinical Demographics",
        assessmentDateLabel: "Assessment Date",
        clinicalRevisionLabel: "Clinical Revision",
        submittedInfoHeading: "Submitted Diabetes Information",
        historicalMeasurementsHeading: "Historical Measurements & Glycemic Ledger",
        patientClarificationsHeading: "Patient Clarifications & Inquiries",
        relevantAttachmentsHeading: "Relevant Medical Attachments",
        doctorNotesHeading: "Doctor Clinical Notes",
        previousApprovedReportsHeading: "Previous Approved Reports",
        btnReviewCurrentRevision: "Review Current Clinical Revision",
        reviewModalTitle: "Review Current Clinical Revision",
        certifyRevisionReviewCheckbox: "I certify that I have personally reviewed all clinical data and measurements in this revision.",
        btnConfirmReviewAndUnlock: "Confirm Review & Unlock Approval",
        staleReviewBannerTitle: "New Clinical Information Received",
        staleReviewBannerDesc: "Patient clinical data or measurements have changed since review. Re-review required before approval.",
        approvalLockedNotice: "Approval locked: You must review and acknowledge the current clinical revision before approving.",
        btnApproveDiabetesReport: "Approve & Certify Diabetes Report",
        conflictBannerTitle: "Clinical Data Conflict (HTTP 409)",
        conflictBannerDesc: "Clinical inputs changed concurrently. Your unsaved notes have been strictly preserved.",
        nonDiagnosticNotice: "Autonomous diagnosis or medication dosing is strictly prohibited. Final clinical content must be authored by the attending physician.",
        diagInputLabel: "Physician Clinical Diagnosis & Assessment *",
        medsInputLabel: "Prescription & Medical Regimen (Rx)",
        recsInputLabel: "Patient Recommendations & Care Plan *",
        noAttachmentsNotice: "No medical attachments or lab reports uploaded.",
        noClarificationsNotice: "No active clarification requests or patient replies.",
        noPreviousReportsNotice: "No previously approved reports on file.",
        viewCertifiedReport: "View Certified Report",
        reviewStatusVerified: "Revision Verified",
        reviewStatusPending: "Review Required",
        unsavedNotesPreservedNotice: "Unsaved draft notes preserved.",
        patientDashboardTitle: "Diabetes Care Dashboard",
        patientDashboardSubtitle: "Track measurements, approved reports, and clinical inquiries",
        currentDocumentedStatus: "Current Documented Diabetes Status",
        statusDocumented: "Documented",
        statusMissing: "Missing",
        statusAwaitingReview: "Awaiting Doctor Review",
        statusDoctorApproved: "Doctor Approved",
        nextActionHeading: "Next Required Patient Action",
        actionReplyClarification: "Reply to pending doctor clarification",
        actionLogFirstMeasurement: "Log your first blood glucose reading to initiate care",
        actionLogMeasurement: "Log Blood Glucose Reading",
        actionAwaitingDoctorReview: "Your records are under doctor review — no action needed from you at this time",
        actionReviewApprovedReport: "Review your certified medical report and approved follow-up plan",
        actionAllUpToDate: "All records are up to date — continue tracking as advised by your doctor",
        recentMeasurementsHeading: "Recent Recorded Measurements",
        measurementDateLabel: "Measurement Date & Time",
        measurementUnitLabel: "Unit",
        outstandingInquiriesHeading: "Outstanding Doctor Inquiries",
        noInquiriesNotice: "No pending clarification requests from your doctor",
        btnReplyToDoctor: "Reply to Doctor",
        doctorApprovedFollowupHeading: "Doctor-Approved Follow-up Plan",
        noApprovedFollowupNotice: "Your follow-up plan will appear here once officially approved by your physician",
        approvedReportsHeading: "Doctor-Approved Reports",
        noApprovedReportsPatientNotice: "No approved reports yet — certified reports are released exclusively after specialist review",
        clinicalGovernancePatientNotice: "All displayed information is sourced strictly from your authentic medical records. Internal doctor notes and unapproved clinical interpretations are not displayed.",
        replyModalTitle: "Reply to Attending Physician's Inquiry",
        replyInputLabel: "Your Response / Clarification",
        btnSubmitReply: "Submit Clarification to Doctor",
        replySuccessMessage: "Your clarification was successfully submitted to your physician",
        statusLegendTitle: "Clinical Data Status Legend",
        emptyMeasurementsPatientMessage: "No glucose or HbA1c readings have been recorded in your profile yet",
        targetRangesHeading: "Doctor-Approved Target Ranges",
        treatmentRegimenHeading: "Documented Treatment Regimen"
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
