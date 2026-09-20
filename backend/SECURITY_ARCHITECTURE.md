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
