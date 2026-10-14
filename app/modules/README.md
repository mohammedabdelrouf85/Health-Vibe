# 🏗️ Health Vibe AI - Modular Architecture Guide

Health Vibe AI follows a **Feature-Based Modular Architecture** (هيكلية المكونات المستقلة حسب الميزة).
كل شاشة وميزة في النظام لها مجلد مستقل بالكامل يحتوي على ملفاتها الخاصة:
القالب (HTML)، التنسيق (CSS)، المنطق والبيانات (Service JS)، والواجهة وتفاعل المستخدم (UI JS).

---

## 📁 هيكل المجلدات (Folder Structure)

```text
app/modules/
├── core/                                # النواة المشتركة
│   ├── template-loader.js               # محرك تحميل وإدارة القوالب ديناميكياً
│   ├── validation.js                    # دوال التحقق من المدخلات
│   ├── error-handler.js                 # معالجة الأخطاء وحجب بيانات PII
│   └── async-context-manager.js         # إدارة سياق العمليات غير المتزامنة
├── auth/                                # ميزة تسجيل الدخول والتوثيق
│   ├── auth-view.html                   # قالب شاشة تسجيل الدخول والتبديل بين الحسابات
│   ├── auth.css                         # التنسيقات الخاصة بشاشات ونوافذ الدخول
│   ├── auth-service.js                  # منطق التوثيق مع Firebase والجلسات
│   ├── auth-ui.js                       # التحكم بالواجهة وتبديل التبويبات
│   └── auth-linking.js                  # ربط الحسابات وتفادي التعارضات
├── patient/                             # بوابة المريض
│   ├── patient-view.html                # قالب لوحة تحكم المريض وسجل التنفس
│   ├── patient.css                      # تنسيقات كروت المريض ومؤشرات القياس
│   ├── patient-service.js               # جلب بيانات المريض ومخطط الحالة
│   └── patient-ui.js                    # بناء كروت السجل الزمني
├── doctor/                              # محطة الطبيب
│   ├── doctor-view.html                 # قالب قائمة انتظار الحالات والاعتماد
│   ├── doctor.css                       # تنسيقات مؤشرات الأداء والفرز السريري
│   ├── doctor-service.js                # فلترة الحالات وترتيب الأولويات
│   └── doctor-ui.js                     # أزرار الإجراءات والتشخيص الطبي
├── admin/                               # لوحة الإدارة والحوكمة
│   ├── admin-view.html                  # قالب إحصائيات الإدارة والتدقيق الأمني
│   ├── admin.css                        # جداول وكروت الإدارة
│   ├── admin-service.js                 # جلب مؤشرات النظام واعتماد الأطباء
│   └── admin-ui.js                      # عرض تقارير التدقيق
├── appointments/                        # نظام المواعيد
│   ├── appointments-view.html           # قالب حجز المواعيد وقائمة الانتظار
│   ├── appointments.css                 # تنسيقات اختيار الفترات والتقويم
│   ├── appointments-service.js          # قفل الفترات ومنع الحجز المزدوج
│   └── appointments-ui.js               # رسم شرائح المواعيد
├── assessment/                          # تقييم الأعراض التنفسية
│   ├── assessment-view.html             # قالب استبيان الأعراض ومؤشر الأكسجين
│   ├── assessment.css                   # تنسيق مراحل التقييم ومؤشر التقدم
│   ├── assessment-service.js            # حساب درجة الخطورة والفرز السريري
│   ├── assessment-validation.js         # التحقق من دقة المدخلات السريرية
│   └── assessment-ui.js                 # التنقل بين خطوات التقييم
├── reports/                             # التقارير الطبية المعتمدة
│   ├── reports-view.html                # قالب التقرير الطبي المعتمد والتحقق
│   ├── reports.css                      # تنسيق الطباعة والعلامة المائية
│   ├── reports-service.js               # بناء اللقطة غير القابلة للتعديل
│   └── reports-ui.js                    # تصدير PDF وعرض رمز QR
├── diabetes/                            # موديول السكري
│   ├── diabetes-view.html
│   ├── diabetes-service.js
│   └── diabetes-ui.js
├── hypertension/                        # موديول ضغط الدم
│   ├── hypertension-view.html
│   ├── hypertension-service.js
│   └── hypertension-ui.js
└── disease/                             # لوحة الأمراض المزمنة
    ├── disease-dashboard-view.html
    ├── disease-dashboard-service.js
    └── disease-dashboard-ui.js
```

---

## 🚀 كيفية إضافة ميزة جديدة (How to Add a New Feature)

عند إضافة أي صفحة أو ميزة جديدة في المستقبل، اتبع نفس الخطوات المنظمة:

1. **أنشئ مجلد جديد داخل `app/modules/<feature-name>/`**:
   مثال: `app/modules/pharmacy/`
2. **أضف ملفات الميزة داخل المجلد**:
   * `<feature-name>-view.html`: القالب المنفصل للواجهة
   * `<feature-name>.css`: التنسيقات الخاصة بالميزة فقط
   * `<feature-name>-service.js`: معالجة البيانات واستدعاءات الـ API
   * `<feature-name>-ui.js`: معالجة تفاعلات المستخدم وأحداث الـ DOM
3. **سجّل الميزة في `template-loader.js`**:
   ```javascript
   TemplateLoader.register('pharmacy', {
     templatePath: './modules/pharmacy/pharmacy-view.html',
     cssPath: './modules/pharmacy/pharmacy.css',
     targetId: 'screen-pharmacy'
   });
   ```
4. **أضف رابط الـ CSS و Script في `app/index.html`**:
   ```html
   <link rel="stylesheet" href="./modules/pharmacy/pharmacy.css">
   ...
   <script defer src="./modules/pharmacy/pharmacy-service.js"></script>
   <script defer src="./modules/pharmacy/pharmacy-ui.js"></script>
   ```

بهذا الشكل يظل المشروع نظيفاً ومقسماً، وتكون كل ميزة معزولة تماماً في مجلدها المستقل دون أي تداخل!
