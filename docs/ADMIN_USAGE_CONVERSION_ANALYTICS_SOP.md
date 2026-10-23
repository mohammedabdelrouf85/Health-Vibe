# 📊 إجراءات العمل القياسية للوحة تحليلات الاستخدام والتحويل (SOP - Usage & Conversion Analytics)
## (Operational Standards, Funnel Monitoring & Conversion Governance)
### كود الوثيقة: `SOP-ANA-045` | معيار دوكتوليب للرعاية الرقمية (Doctolib Benchmark)

---

| **بيانات الوثيقة القياسية** | **التفاصيل التشغيلية والسريرية** |
|---|---|
| **كود الوثيقة (Document Code):** | `SOP-ANA-045` (Operations & Analytics Governance Series) |
| **تاريخ الإصدار والاعتماد:** | 23 أكتوبر 2026 |
| **الإصدار الحالي:** | الإصدار v1.0 (Doctolib Usage & Conversion Analytics Benchmark) |
| **المعيار المرجعي للمنظومة:** | Doctolib Digital Health Utilization & Conversion Funnel Standard |
| **تصنيف المنظومة:** | SaMD Class I / Administrative & Operational Decision Support |
| **الأطر التشريعية والرقابية:** | GDPR Article 89(1) (Statistical Data Isolation)، قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020، HIPAA Safe Harbor (45 CFR § 164.514 - De-identification)، معايير أمان OWASP Top 10 API Security. |
| **الفئة المستهدفة:** | مدراء النظام العام (Super Admins)، مدراء العيادات والمراكز (Clinic Admins)، محللو البيانات التشغيلية (Healthcare Data Analysts)، مسؤولو الدعم الفني والجودة (Support & QA Teams). |

---

## 1. الغرض ونطاق التطبيق (Purpose & Regulatory Scope)

تهدف هذه الوثيقة القياسية (`SOP-ANA-045`) إلى تحديد السياسات التشغيلية، الرقابية، والتقنية لإدارة وتشغيل **لوحة تحليلات الاستخدام والتحويل (Usage & Conversion Analytics)** في منصة **Health Vibe AI** وفق معيار **Doctolib** العالمي.

### الأهداف التشغيلية الأساسية:
1. **متابعة التدفق الطبي والتشغيلي (5-Stage Conversion Funnel):**
   رصد مراحل رحلة المريض عبر مسار التحويل الخماسي:
   $$\text{Registered (المسجلين)} \longrightarrow \text{Triage Started (بدء الفرز)} \longrightarrow \text{Completed (مكتمل التقييم)} \longrightarrow \text{Doctor Reviewed (مراجعة الطبيب)} \longrightarrow \text{Booked (حجز موعد)}$$
2. **حوكمة أوقات الاستجابة ومراجعة الأطباء (Turnaround Time SLA):**
   ضمان ألا يتجاوز متوسط وقت مراجعة الأطباء للتقارير السريرية حاجز الـ 30 دقيقة للحالات العادية، و5 دقائق للحالات الحرجة والمصنفة `Priority 1 / Red Flag`.
3. **قياس أثر الملف الطبي المسبق (Clinical Dossier Booking Lift):**
   متابعة كفاءة الفرز السريري الذكي ومعدل زيادة حجز المواعيد الفعلي الناتج عن إعداد ملخص طبي أولي للطبيب (Lift Target: $+30\%$ إلى $+35\%$).
4. **حماية الخصوصية ومبدأ الصفر-بيانات صحية شخصية (Zero-PHI Guarantee):**
   الالتزام الصارم بعدم ظهور أي اسم، رقم قومي (14 رقماً)، هاتف، أو تفاصيل تشخيصية شخصية داخل مؤشرات ولوحات البيانات التشغيلية.

---

## 2. مصفوفة الصلاحيات والحوكمة (RACI Matrix)

| الإجراء التشغيلي / التحليلي | Super Admin | Clinic Admin | Data Analyst | Support Desk | Doctor | Patient |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **عرض المؤشرات العامة لكافة العيادات (`GET /api/admin/usage-conversion/analytics`)** | **A / R** | حظر (403) | **C** | حظر (403) | حظر (403) | حظر (403) |
| **عرض مؤشرات العيادة التابع لها حصراً** | **A** | **R** | **C** | **I** | حظر (403) | حظر (403) |
| **تصدير التقارير الإحصائية بصيغة CSV (`GET /export`)** | **A** | **R** (لعيادته) | **R** | حظر (403) | حظر (403) | حظر (403) |
| **فحص ومراجعة سجلات التدقيق والتتبع (`audit_events`)** | **A** | **R** (لعيادته) | **I** | حظر (403) | حظر (403) | حظر (403) |
| **تعديل معايير وأهداف أوقات الخدمة (SLA Thresholds)** | **A / R** | **C** | **C** | غير متاح | غير متاح | غير متاح |

* الرموز: **R** (مسؤول التنفيذ)، **A** (المعتمد والمساءل)، **C** (مستشار)، **I** (مبلّغ للعلم).

---

## 3. خطة ومؤشرات قياس الأداء (Core KPI Definitions & Calculations)

### 1. معدل التحول للحجز (Booking Conversion Rate):
$$\text{Conversion Rate} = \left( \frac{\text{Confirmed Appointment Bookings}}{\text{Completed Clinical Assessments}} \right) \times 100$$
- **الهدف التشغيلي (Benchmark):** أعلى من $40\%$.

### 2. متوسط وقت المراجعة الطبية (Doctor Review Turnaround Time):
$$\text{Average Review Time (min)} = \frac{\sum (\text{Doctor Approved At} - \text{Triage Completed At})}{\text{Total Reviewed Cases}}$$
- **الحد الأقصى المسموح (SLA):** $\le 30 \text{ دقيقة}$، وتصنف المؤشرات إلى:
  - 🟢 **ممتاز (Optimal):** أقل من 15 دقيقة.
  - 🟡 **مقبول (Standard):** من 15 إلى 30 دقيقة.
  - 🔴 **متأخر (Breached SLA):** أكثر من 30 دقيقة (يتطلب تنبيهاً فورياً لمدير العيادة).

### 3. أثر الملف الاسترشادي المكتمل (Clinical Dossier Lift):
مقارنة نسبة الحجز للمرضى الذين أتموا التقييم الذكي وأرفقوا تقريراً استرشادياً مقابل المرضى الذين لم يكملوا التقييم.

---

## 4. إرشادات الاستخدام وتصدير البيانات (Operational Guidelines)

### خطوات استخدام لوحة الإدارة:
1. تسجيل الدخول بحساب مصرح له (`super_admin` أو `clinic_admin`).
2. الانتقال إلى قسم **لوحة تحليلات الاستخدام والتحويل (Usage & Conversion Analytics)**.
3. استخدام محدد الفترة الزمنية (`اليوم`، `آخر 7 أيام`، `آخر 30 يوماً`، `مخصص`).
4. تصفية النتائج حسب العيادة (لمدير النظام العام)، أو استعراض العيادة المعينة تلقائياً لمدير العيادة.
5. التحقق من مؤشرات القمع الخماسي وتحديد أي نقطة انقطاع أو تسرب (Drop-off point).

### إجراءات تصدير البيانات (Safe CSV Export):
- النقر على زر `تصدير البيانات التشغيلية (Export CSV)`.
- يقوم الخادم تلقائياً بتطبيق حماية منع حقن المعادلات (Formula Injection Neutralization) عبر بادئة علامات الاقتباس للرموز (`=`, `+`, `-`, `@`).
- يتم توثيق عملية التصدير تلقائياً في جدول سجلات المراجعة بنوع حدث `USAGE_CONVERSION_ANALYTICS_EXPORTED` متضمناً معرّف المنفذ وتاريخ التصدير بدقة.

---

## 5. خطة الطوارئ ومعالجة انقطاع الخدمة والبيانات غير المتاحة (Fallback Protocol)

- في حال بدء عيادة جديدة بدون سجلات سابقة، تعرض الواجهة النص المعتمد: `"Unavailable"` / `"غير متاح"` دون أن تنهار الواجهة أو تتوقف الحسابات الرياضية.
- في حال رصد أي محاولة لتسريب معرفات المرضى (مثل أرقام الهواتف أو الأرقام القومية)، يعترض درع الأمان `Zero-PHI Guard` الحزمة، ويرسل استجابة `400 PHI_LEAKAGE_PROHIBITED`، ويوثق محاولة التسريب كحدث أمني فوري: `USAGE_CONVERSION_PHI_LEAKAGE_BLOCKED`.
