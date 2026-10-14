# Health Vibe AI - هندسة الأمان ومبدأ انعدام الثقة (Zero-Trust Security Architecture)

## 📌 المبدأ الأساسي: عدم الاعتماد على الواجهة الأمامية (Frontend) للتحقق من الصلاحيات

في التطبيقات الطبية والأنظمة الحساسة، **الواجهة الأمامية (Client/Frontend) تقع تحت السيطرة الكاملة للمستخدم**.
أي مستخدم يستطيع فتح أدوات المطور (Developer Tools / Console) والقيام بالآتي:
1. تغيير المتغيرات البرمجية محلياً (مثل كتابة `selectedRole = 'admin'`).
2. تعطيل شروط الواجهة (مثل تجاوز `if (hasPermission)` أو تعديل دالة `showScreen`).
3. إزالة فئات أو أنماط الإخفاء في المتصفح (`style.display = 'block'`).
4. استدعاء دوال الحفظ والاعتماد مباشرة من الكونسول.

**لذلك، تعتبر الواجهة الأمامية في نظام Health Vibe AI مجرد طبقة عرض وتسهيل تجربة مستخدم (Presentation & UX Only)، وليست خط الدفاع الأمني بأي شكل من الأشكال.**

---

## 🛡️ نموذج الحماية ثلاثي الطبقات (Three-Tier Defense-in-Depth)

```
+-------------------------------------------------------------------------+
| Layer 1: Database Boundary (Firestore Security Rules)                   |
| -> Google Firebase Servers enforce security rules at the TCP level.    |
| -> Direct rejections (Permission Denied) on unauthorized reads/writes.  |
+-------------------------------------------------------------------------+
                                    ▲
                                    │
+-------------------------------------------------------------------------+
| Layer 2: Server / Backend API & Cloud Functions (Zero-Trust)           |
| -> Cryptographic JWT Verification (admin.auth().verifyIdToken).        |
| -> Firebase Auth Custom Claims (tamper-proof claims signed by Google).  |
| -> Server-Authoritative Role Assignment & Doctor Verification Pipeline. |
+-------------------------------------------------------------------------+
                                    ▲
                                    │
+-------------------------------------------------------------------------+
| Layer 3: Client Layer (Server-Authoritative Synchronization)            |
| -> Never trusts mutable local variables (`selectedRole`).               |
| -> Calls `enforceServerPermission` querying `{ source: "server" }`.    |
| -> Automatically reverts client tampering upon any backend rejection.  |
+-------------------------------------------------------------------------+
```

---

### 1. طبقة قواعد أمان قاعدة البيانات (Firestore Security Rules):
- تنفذ مباشرة على خوادم Google المستقلة قبل وصول أي قراءة أو كتابة للبيانات.
- **منع تسريب بيانات المرضى:** لا يمكن لأي مريض قراءة حالات مرضى آخرين (`resource.data.userId == request.auth.uid`).
- **حظر تزوير الدور:** عند تحديث المستخدم لملفه، تفرض القواعد: `request.resource.data.role == resource.data.role`.
- **حظر تعديل المالك:** تفرض القواعد: `request.resource.data.isOwner == resource.data.isOwner`.
- **حصر الاعتماد الطبي بالأطباء فقط:** `cases` لا تُعتمد إلا إذا كان `isDoctor()` محققاً في قاعدة البيانات على الخادم.

### 2. طبقة الخادم والـ Backend API (`backend/server.js` & `functions/index.js`):
- التحقق من الـ `Authorization: Bearer <ID_TOKEN>` عبر `admin.auth().verifyIdToken(idToken)`.
- توثيق واعتماد الأطباء يتم عبر سيرفر موثوق يمنح **Custom Claims** مشفرة بمفتاح Google الخاص.
- تسجيل كافة التعديلات في جدول تدقيق أمني غير قابل للحذف أو التعديل (`audit_events`).

### 3. طبقة العميل (Client Anti-Tampering & Resynchronization):
- عند محاولة تنفيذ أي إجراء إداري أو طبي، يتم استدعاء `enforceServerPermission` التي تستعلم الخادم قسراً عبر `{ source: "server" }` لضمان عدم وجود تلاعب بذاكرة المتصفح.
- في حال استلام خطأ `permission-denied` من خادم Firestore، تلتقطه دالة `handleServerPermissionDenied` فوراً وتعيد ضبط واجهة المستخدم على دورها الحقيقي المسجل في قاعدة البيانات.

### 4. الإلزامية الصارمة لتأكيد البريد الإلكتروني (Mandatory Email Verification):
- **على مستوى قواعد Firestore:** تم تطبيق دالة `isEmailVerified()` لمنع إنشاء الحالات السريرية `cases`، أو تقديم طلبات توثيق الأطباء `doctor_applications`، أو اعتماد التشخيصات إلا بعد تأكيد البريد الإلكتروني (`request.auth.token.email_verified == true`).
- **على مستوى الـ Backend:** تم تطبيق Middleware `requireVerifiedEmail` الذي يفحص الرمز المشفر ويمنع العمليات الإدارية والطبية الحساسة بحظر `403 EMAIL_NOT_VERIFIED`.
- **على مستوى واجهة العميل (UX):** تم تطبيق دالة `enforceEmailVerification` مع نافذة حوار تفاعلية (`verifyRequiredModal`) تقوم بتحديث فوري لحالة الحساب (`user.reload()`) وتوفير خيارات التحقق وإعادة الإرسال الفوري.

---

### 5. نظام الصلاحيات الصارم والفصل التام بين مسارات Patient و Doctor و Admin (RBAC 3-Tier Strict Separation):

| البند / الدور | مسار المريض (Patient) | مسار الطبيب (Doctor) | مسار الإدارة (Admin) |
| :--- | :--- | :--- | :--- |
| **واجهة العمل الأساسية** | `#patient` (لوحة المتابعة الشخصية) | `#doctor` (طابور المراجعة السريرية) | `#admin` (مركز العمليات والإحصائيات) |
| **الشاشات المصرح بها** | `assessment`, `pending`, `result`, `history`, `appointments`, `report`, `profile` | `doctor`, `verification`, `history`, `report`, `appointments`, `profile`, `kpi` | `admin`, `audit`, `kpi`, `profile`, `feedback` |
| **حظر الروابط المتقاطعة** | 🚫 **محظور تماماً:** لا يمكن فتح شاشات الطبيب (`doctor`) أو الإدارة (`admin`, `audit`) | 🚫 **محظور تماماً:** لا يمكن فتح شاشات الإدارة (`admin`, `audit`) أو تعديل صلاحيات المستخدمين | 🚫 **محظور تماماً:** لا يمكن للأدمن اعتماد الحالات الطبية (الاعتماد محصور بالأطباء المرخصين فقط) |
| **عزل البيانات (Data Isolation)** | يرى بياناته وحالاته وتقاريره المعتمدة فقط (`auth.uid == patientId`) | يرى الحالات المسندة إليه أو لعيادته فقط؛ لا يمكنه الاطلاع على مرضى عيادات أخرى | لا يمكنه رؤية تفاصيل تشخيصية سريرية خاصة للمرضى خارج أغراض التدقيق والتشغيل (Least Privilege) |
| **حراس المسارات (Route Guards)** | دالة `applyRouteGuards` تحظر محاولات التسلل عبر الـ Hash (`#doctor`, `#admin`) وتعيد التوجيه فوراً | اعتراض وتدقيق الخادم الإلزامي `requireDoctor` | اعتراض وتدقيق الخادم الإلزامي `requireAdmin` و `requireSuperAdmin` |
| **التحكم بالواجهة (Navigation)** | دالة `updateNavVisibility` تخفي أزرار وروابط الأدوار الأخرى كلياً من القائمة والشريط السفلي | إخفاء روابط الإدارة نهائياً | إخفاء مسار التقييم الاسترشادي للمرضى |

---

### 6. حصر استعلامات الطبيب على المرضى المعينين له فقط (Assigned Patients Only Doctor Queries):

1. **على مستوى قواعد أمان فايربيس (Firestore Security Rules):**
   - في وثائق الحالات السريرية `/cases/{caseId}`: يسمح للطبيب بالقراءة فقط إذا كان هو الطبيب المسند للحالة (`resource.data.assignedDoctorId == request.auth.uid` أو `doctorId` أو `approvingDoctorId`).
   - في وثائق المرفقات الطبية `/case_files/{fileId}`: دالة `isAssignedDoctorForCaseId` تمنع الطبيب من تحميل أي تحاليل أو صور أشعة لحالات غير مسندة إليه.
   - في التقارير السريرية `/clinical_reports/{reportId}`: قراءة التقارير محصورة بالطبيب المعتمد والموقع للحالة.

2. **على مستوى استعلامات الواجهة والعميل (Client Firestore Queries):**
   - مستمع طابور الحالات المباشر `renderDoctorQueue` يطبق قسراً عامل تصفية `.where("assignedDoctorId", "==", user.uid)`.
   - دالة `getCases` تطبق استعلام `.where("assignedDoctorId", "==", user.uid)`.
   - دالة `renderDoctorQueueItems` و `selectDoctorCase` تعزل الذاكرة الحية عبر `isCaseAssignedToCurrentDoctor(c)` بحيث لا يتم رسم أي حالة لمريض تابع لطبيب آخر.

3. **على مستوى خادم الـ Backend والـ APIs:**
   - مسار الملف الطبي السريري `GET /api/patient/medical-profile`: يرفض طلب الطبيب استعراض بيانات أي مريض غير مسند إليه برمز خطأ `403 PATIENT_NOT_ASSIGNED_TO_DOCTOR`.
   - مسار الخط الزمني الموحد `GET /api/patient/timeline`: دالة `verifyTimelineAccess` في `timeline-service.js` تفحص ارتباط الطبيب بالمريض وترفض الاستعلام برمز `403 PATIENT_NOT_ASSIGNED_TO_DOCTOR` إذا لم يكن الطبيب مسنداً لأي فحص أو موعد مع المريض.

4. **على مستوى قاعدة البيانات العلائقية (PostgreSQL / Supabase RLS):**
   - سياسة RLS `doctor_assigned_patients_only` على جدول `patients`: تحصر استعلام `SELECT` بالمرضى المسندين للطبيب فقط.
   - سياسة RLS `doctor_assigned_cases_only` على جدول `clinical_cases`: تمنع استعراض أو تعديل الحالات التابعة لأطباء آخرين.
   - سياسة RLS `doctor_patient_history_access` على جدول `patient_history`: تمنع الطبيب من استعراض التاريخ الطبي لمرضى خارج عيادته واختصاصه.



