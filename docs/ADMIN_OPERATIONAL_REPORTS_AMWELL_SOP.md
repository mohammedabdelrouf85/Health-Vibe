# 📑 إجراءات العمل القياسية للتقارير التشغيلية الدورية للإدارة (SOP - Periodic Operational Reports)
## (Operational Telehealth Utilization, Multi-Clinic Governance & Safe Reporting)
### كود الوثيقة: `SOP-OPS-046` | معيار أمويل للرعاية الافتراضية (Amwell Benchmark)

---

| **بيانات الوثيقة القياسية** | **التفاصيل التشغيلية والتنظيمية** |
|---|---|
| **كود الوثيقة (Document Code):** | `SOP-OPS-046` (Operations & Healthcare Executive Reporting Series) |
| **تاريخ الإصدار والاعتماد:** | 23 أكتوبر 2026 |
| **الإصدار الحالي:** | الإصدار v1.0 (Amwell Periodic Operational Reporting Benchmark) |
| **المعيار المرجعي للمنظومة:** | Amwell Telehealth Operations & Executive Clinical Utilization Standard |
| **تصنيف المنظومة:** | SaMD Class I / Administrative & Healthcare Operational Intelligence |
| **الأطر التشريعية والرقابية:** | GDPR Article 89(1) (Statistical Aggregation & De-identification)، قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020، HIPAA Safe Harbor (45 CFR § 164.514)، وإرشادات أمان وتصدير الملفات ضد هجمات حقن المعادلات (OWASP CSV Injection). |
| **الفئة المستهدفة:** | مدراء النظام العام (Super Admins)، مدراء العيادات والمراكز الصحية (Clinic & Hospital Admins)، مسؤولو التشغيل السريري (Clinical Ops Officers)، ومدققو الجودة والامتثال (Healthcare Compliance Auditors). |

---

## 1. الغرض ونطاق التطبيق (Purpose & Regulatory Scope)

تهدف هذه الوثيقة القياسية (`SOP-OPS-046`) إلى تأطير المعايير التشغيلية وإجراءات توليد وتصدير **التقارير التشغيلية الدورية (Operational Reports)** للإدارة في منصة **Health Vibe AI** وفق نموذج ومعايير **Amwell** الرائدة عالمياً في إدارة شبكات الرعاية الافتراضية والعيادات متعددة الفروع.

### الأهداف التشغيلية الرئيسية:
1. **توليد تقارير أداء دورية موحدة (Periodic Reporting Cycles):**
   إتاحة توليد تقارير إحصائية دورية (أسبوعية `Weekly`، شهرية `Monthly`، أو ربع سنوية `Quarterly`) تلخص أداء واستخدام المنصة، معدل تبني الرعاية عن بُعد (Telehealth Adoption Rate)، ونسب إتمام وإلغاء الاستشارات.
2. **الحماية المطلقة للبيانات الصحية والخصوصية (Zero-PHI Guarantee):**
   ضمان تجريد التقارير تماماً من أي تفاصيل تشخيصية فردية، أسماء مرضى، أرقام هواتف، أو أرقام قومية، مع الاعتماد الكلي على مجاميع ومؤشرات إحصائية مجهولة الهوية (*De-identified Statistical Aggregates*).
3. **تأمين قنوات التصدير ضد الاختراق (Safe CSV/PDF Export Architecture):**
   تحصين ملفات التقارير المصدرة ضد هجمات حقن معادلات جداول البيانات (*Formula Injection Neutralization*)، وتوفير حزم مشفرة بـ `AES-256-GCM` لحماية التخزين والنقل.
4. **حوكمة العزل متعدد المنشآت (Multi-Tenant Scoping & Strict RBAC):**
   تقييد مدراء العيادات والفروع لاستعراض وتصدير بيانات العيادة التابعين لها فقط ومنع أي اطلاع أو تسرب لمعلومات الفروع المنافسة.

---

## 2. مصفوفة الصلاحيات والحوكمة (RACI Matrix)

| الإجراء التشغيلي / الإداري | Super Admin | Clinic Admin | Ops Lead | Compliance Officer | Doctor | Patient |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **عرض التقارير التشغيلية الشاملة لكافة الفروع (`GET /api/admin/operational-reports`)** | **A / R** | حظر (403) | **C** | **I** | حظر (403) | حظر (403) |
| **استعراض تقرير الأداء التشغيلي للفرع المعين فقط** | **A** | **R** | **C** | **I** | حظر (403) | حظر (403) |
| **تصدير التقرير التشغيلي بصيغة CSV الآمنة (`/export?format=csv`)** | **A** | **R** (لعيادته) | **R** | **I** | حظر (403) | حظر (403) |
| **تصدير التقرير التشغيلي كـ PDF مشفر ومعتمد (`/export?format=pdf`)** | **A** | **R** (لعيادته) | **R** | **I** | حظر (403) | حظر (403) |
| **التحقق من بصمة التقرير المشفر بـ `AES-256-GCM`** | **A** | **R** | **I** | **R** | غير متاح | غير متاح |

* الرموز: **R** (مسؤول التنفيذ)، **A** (صاحب القرار والمساءل)، **C** (مستشار)، **I** (مبلّغ للعلم).

---

## 3. مؤشرات الأداء التشغيلية ومستهدفات أمويل (Core KPIs & Targets)

### 1. معدل تبني الرعاية عن بُعد (Telehealth Adoption Rate):
$$\text{Telehealth Adoption Rate} = \left( \frac{\text{Virtual Video Consultations}}{\text{Total Completed Consultations}} \right) \times 100$$
- **المستهدف القياسي (Amwell Benchmark):** $\ge 30\%$ إلى $35\%$ لتخفيف الضغط على المنشآت الطبية الحضورية.

### 2. معدل إتمام المواعيد (Appointment Completion Rate):
$$\text{Completion Rate} = \left( \frac{\text{Completed Appointments}}{\text{Total Booked Appointments}} \right) \times 100$$
- **المستهدف التشغيلي:** $\ge 80\%$.

### 3. معدل الإلغاء (Cancellation Rate):
$$\text{Cancellation Rate} = \left( \frac{\text{Cancelled Appointments}}{\text{Total Booked Appointments}} \right) \times 100$$
- **الحد الأقصى المسموح:** $\le 10\%$.

### 4. الالتزام باتفاقية زمن المراجعة الطبية (Review Turnaround SLA):
- الحد الأقصى لمراجعة تقارير الفرز السريري: أقل من 30 دقيقة للحالات العادية، وأقل من 5 دقائق للحالات المصنفة كحالات حرجة وطوارئ.

---

## 4. إرشادات الاستخدام وتصدير التقارير (Operational Playbook)

### خطوات توليد التقارير:
1. تسجيل الدخول إلى لوحة إدارة **Health Vibe AI**.
2. الانتقال إلى قسم **التقارير التشغيلية الدورية للإدارة (Amwell Benchmark)**.
3. تحديد الدورية المطلوبة (`أسبوعي`، `شهري`، `ربع سنوي`).
4. اختيار الفرع أو استعراض كافة الفروع (لمدير النظام العام).
5. مراجعة بطاقات المؤشرات الأربعة (`إجمالي الاستشارات`، `نسبة الرعاية عن بُعد`، `معدل إتمام المواعيد`، `متوسط وقت المراجعة الطبية`).
6. فحص جدول أداء الفروع للتأكد من التزام كل عيادة باتفاقية مستوى الخدمة (`SLA Compliance Rate`).

### سياسة التصدير الآمن (Zero-PHI Safe Export):
- عند الضغط على `تصدير تقرير CSV`، يقوم النظام تلقائياً بتطبيق خوارزمية تطهير المعادلات لمنع هجمات الاختراق وحقن الأكواد الخبيثة عبر البرامج المكتبية (Excel / Calc).
- عند الضغط على `تصدير تقرير PDF`، يتم توليد وثيقة تنفيذية منسقة بترميز رسمي وختم زمني وبصمة رقمية معتمدة `SHA-256`.
- تسجل كل عملية تصدير تلقائياً في قاعدة بيانات التدقيق بحدث `OPERATIONAL_REPORT_EXPORTED_CSV` أو `OPERATIONAL_REPORT_EXPORTED_PDF`.
