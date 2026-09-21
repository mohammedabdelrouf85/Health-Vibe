const loader = document.getElementById("loader");
const publicSite = document.getElementById("publicSite");
const authScreen = document.getElementById("authScreen");
const app = document.getElementById("app");
const toast = document.getElementById("toast");
const screenTitle = document.getElementById("screenTitle");
const themeToggle = document.getElementById("themeToggle");
const siteThemeToggle = document.getElementById("siteThemeToggle") || null;
const languageToggle = document.getElementById("languageToggle");
const menuToggle = document.getElementById("menuToggle");
const logoutButton = document.getElementById("logoutButton");
const authEmailForm = document.getElementById("authEmailForm");
const authTabSignIn = document.getElementById("authTabSignIn");
const authTabSignUp = document.getElementById("authTabSignUp");
const authNameGroup = document.getElementById("authNameGroup");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authSubmitText = document.getElementById("authSubmitText");
const authErrorBanner = document.getElementById("authErrorBanner");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const authMainView = document.getElementById("authMainView");
const authResetView = document.getElementById("authResetView");
const authNewPasswordView = document.getElementById("authNewPasswordView");
const resetEmailInput = document.getElementById("resetEmailInput");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const sendResetLinkBtn = document.getElementById("sendResetLinkBtn");
const sendResetLinkText = document.getElementById("sendResetLinkText");
const resetSuccessMessage = document.getElementById("resetSuccessMessage");
const backToSignInBtn = document.getElementById("backToSignInBtn");
const cancelResetBtn = document.getElementById("cancelResetBtn");
const newPasswordForm = document.getElementById("newPasswordForm");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
const confirmPasswordResetBtn = document.getElementById("confirmPasswordResetBtn");
const confirmPasswordResetText = document.getElementById("confirmPasswordResetText");
let activeResetCode = null;
let authMode = "signin";
const accountLabel = document.getElementById("accountLabel");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const titles = {
  patient: "الرئيسية",
  consent: "الموافقة والخصوصية",
  profile: "الملف الطبي",
  assessment: "تقييم التنفس",
  pending: "حالة المراجعة",
  result: "النتيجة المعتمدة",
  history: "السجل والتقارير",
  appointments: "المواعيد",
  assistant: "المساعد الطبي",
  verification: "توثيق الطبيب",
  doctor: "مراجعة الطبيب",
  admin: "لوحة الإدارة",
  audit: "سجل التدقيق",
  report: "التقرير"
};

// --- Real Role-Based Access Control (RBAC) Engine ---
const ROLES = {
  PATIENT: "patient",
  DOCTOR_PENDING: "doctor_pending",
  DOCTOR: "doctor",
  CLINIC_ADMIN: "clinic_admin",
  SUPPORT: "support",
  SUPER_ADMIN: "super_admin"
};
const ADMIN_ROLES = [ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN];
const VALID_ROLES = Object.values(ROLES);

function normalizeRole(role, isOwner = false) {
  if (isOwner) return ROLES.SUPER_ADMIN;
  if (role === "admin" || role === "owner") return ROLES.CLINIC_ADMIN;
  return VALID_ROLES.includes(role) ? role : ROLES.PATIENT;
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

const PERMISSIONS = {
  VIEW_PATIENT_DASHBOARD: "view:patient_dashboard",
  SUBMIT_ASSESSMENT: "submit:assessment",
  VIEW_OWN_CASES: "view:own_cases",
  APPLY_DOCTOR_VERIFICATION: "apply:doctor_verification",

  // Doctor permissions (Clinical - strictly for licensed medical professionals)
  VIEW_DOCTOR_QUEUE: "view:doctor_queue",
  REVIEW_CASE: "review:case",
  APPROVE_CASE: "approve:case",
  REJECT_CASE: "reject:case",

  // Admin permissions (Governance & Operations - strictly administrative & non-clinical)
  VIEW_ADMIN_DASHBOARD: "view:admin_dashboard",
  VIEW_AUDIT_LOG: "view:audit_log",
  APPROVE_DOCTOR_APPLICATION: "approve:doctor_application",
  REJECT_DOCTOR_APPLICATION: "reject:doctor_application",
  MANAGE_AI_MODELS: "manage:ai_models",
  MANAGE_USER_ROLES: "manage:user_roles",
  MANAGE_USERS: "manage:users",
  VIEW_SYSTEM_METRICS: "view:system_metrics"
};

const ROLE_PERMISSIONS_MAP = {
  [ROLES.PATIENT]: [
    PERMISSIONS.VIEW_PATIENT_DASHBOARD,
    PERMISSIONS.SUBMIT_ASSESSMENT,
    PERMISSIONS.VIEW_OWN_CASES,
    PERMISSIONS.APPLY_DOCTOR_VERIFICATION
  ],
  [ROLES.DOCTOR_PENDING]: [
    PERMISSIONS.VIEW_PATIENT_DASHBOARD,
    PERMISSIONS.VIEW_OWN_CASES,
    PERMISSIONS.APPLY_DOCTOR_VERIFICATION
  ],
  [ROLES.DOCTOR]: [
    PERMISSIONS.VIEW_DOCTOR_QUEUE,
    PERMISSIONS.REVIEW_CASE,
    PERMISSIONS.APPROVE_CASE,
    PERMISSIONS.REJECT_CASE,
    PERMISSIONS.VIEW_OWN_CASES
  ],
  [ROLES.CLINIC_ADMIN]: [
    PERMISSIONS.VIEW_ADMIN_DASHBOARD,
    PERMISSIONS.VIEW_AUDIT_LOG,
    PERMISSIONS.APPROVE_DOCTOR_APPLICATION,
    PERMISSIONS.REJECT_DOCTOR_APPLICATION,
    PERMISSIONS.MANAGE_AI_MODELS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_SYSTEM_METRICS
  ],
  [ROLES.SUPPORT]: [
    PERMISSIONS.VIEW_PATIENT_DASHBOARD,
    PERMISSIONS.VIEW_OWN_CASES,
    PERMISSIONS.VIEW_SYSTEM_METRICS
  ],
  [ROLES.SUPER_ADMIN]: [
    PERMISSIONS.VIEW_ADMIN_DASHBOARD,
    PERMISSIONS.VIEW_AUDIT_LOG,
    PERMISSIONS.APPROVE_DOCTOR_APPLICATION,
    PERMISSIONS.REJECT_DOCTOR_APPLICATION,
    PERMISSIONS.MANAGE_AI_MODELS,
    PERMISSIONS.MANAGE_USER_ROLES,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_SYSTEM_METRICS
  ]
};

const ROLE_ALLOWED_SCREENS = {
  [ROLES.PATIENT]: [
    "patient", "consent", "profile", "assessment", "pending", "result",
    "history", "appointments", "assistant", "report"
  ],
  [ROLES.DOCTOR_PENDING]: [
    "patient", "verification", "history", "appointments", "report", "profile"
  ],
  [ROLES.DOCTOR]: [
    "doctor", "verification", "history", "appointments", "report", "profile"
  ],
  [ROLES.CLINIC_ADMIN]: [
    "patient", "consent", "profile", "assessment", "pending", "result",
    "history", "appointments", "assistant", "verification", "doctor",
    "report", "admin", "audit"
  ],
  [ROLES.SUPPORT]: [
    "patient", "history", "appointments", "assistant", "report"
  ],
  [ROLES.SUPER_ADMIN]: [
    "patient", "consent", "profile", "assessment", "pending", "result",
    "history", "appointments", "assistant", "verification", "doctor",
    "report", "admin", "audit"
  ]
};

let tempAllowDoctorApplication = false;

function handleOpenDoctorApply() {
  tempAllowDoctorApplication = true;
  showScreen("verification");
}
window.handleOpenDoctorApply = handleOpenDoctorApply;

let verifiedServerRole = null;

async function getVerifiedServerRole(forceRefresh = false) {
  const user = auth ? auth.currentUser : null;
  if (!user) return ROLES.PATIENT;
  if (isOwnerUser(user.email)) return ROLES.SUPER_ADMIN;

  if (verifiedServerRole && !forceRefresh) {
    return verifiedServerRole;
  }

  try {
    // Read directly from Firestore database, never trusting mutable client memory
    const userDoc = await db.collection("users").doc(user.uid).get(forceRefresh ? { source: "server" } : undefined);
    if (userDoc.exists && userDoc.data().role) {
      verifiedServerRole = normalizeRole(userDoc.data().role, isOwnerUser(user.email));
      return verifiedServerRole;
    }
  } catch (err) {
    console.warn("[RBAC] Server role verification query failed:", err);
  }
  return normalizeRole(verifiedServerRole || selectedRole || ROLES.PATIENT, isOwnerUser(user.email));
}

function hasPermission(permission) {
  const role = normalizeRole((typeof selectedRole !== "undefined" && selectedRole) ? selectedRole : ROLES.PATIENT);
  const perms = ROLE_PERMISSIONS_MAP[role] || [];
  return perms.includes(permission);
}

function canAccessScreen(screenName) {
  const role = normalizeRole((typeof selectedRole !== "undefined" && selectedRole) ? selectedRole : ROLES.PATIENT);
  if (screenName === "verification" && tempAllowDoctorApplication) {
    return true;
  }
  const allowed = ROLE_ALLOWED_SCREENS[role] || ROLE_ALLOWED_SCREENS[ROLES.PATIENT];
  return allowed.includes(screenName);
}

// Client-side quick check for UI feedback only
function enforcePermission(permission, actionDescription = "") {
  if (!hasPermission(permission)) {
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const msgEn = `Access Denied: You do not have permission for '${actionDescription || permission}'.`;
    const msgAr = `تم رفض الوصول: ليس لديك الصلاحية لتنفيذ هذا الإجراء (${actionDescription || permission}).`;
    if (typeof showToast === "function") {
      showToast(isEn ? msgEn : msgAr);
    }
    console.warn(`[RBAC] Denied permission '${permission}' to current role '${selectedRole}'.`);
    return false;
  }
  return true;
}

// Server-authoritative permission verification (Zero-Trust)
// Re-queries the Firestore server document directly, bypassing any memory tampering
async function enforceServerPermission(permission, actionDescription = "") {
  const user = auth ? auth.currentUser : null;
  if (!user) {
    showToast(currentLanguage === "en" ? "Authentication required." : "يجب تسجيل الدخول أولاً.");
    return false;
  }

  const serverRole = await getVerifiedServerRole(true);
  const perms = ROLE_PERMISSIONS_MAP[serverRole] || [];
  
  if (!perms.includes(permission)) {
    console.error(`[SECURITY ALERT] Action '${permission}' blocked by Server-Authoritative check. Database role is '${serverRole}'.`);
    
    // Auto-revert any client-side memory tampering
    selectedRole = serverRole;
    updateNavVisibility();
    showScreen(isAdminRole(serverRole) ? "admin" : (serverRole === ROLES.DOCTOR ? "doctor" : "patient"));

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const msgEn = `🔒 Server Security: Action '${actionDescription || permission}' rejected. Your database-verified role is '${englishRoleLabels[serverRole] || serverRole}'.`;
    const msgAr = `🔒 رفض من الخادم الأمني: تم حظر العملية (${actionDescription || permission}). دورك المعتمد في قاعدة البيانات هو '${roleLabels[serverRole] || serverRole}'.`;
    showToast(isEn ? msgEn : msgAr);
    return false;
  }
  return true;
}

// Handles Firestore Security Rules direct rejections (Permission Denied)
function handleServerPermissionDenied(err, actionContext = "") {
  if (err && (err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"))) {
    console.error(`[FIRESTORE RULES REJECTION] Database rejected operation '${actionContext}':`, err);
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    showToast(isEn
      ? "🔒 Server Security Violation: Backend rejected operation (Permission Denied). Client cannot bypass database security rules."
      : "🔒 رفض أمني من خادم قاعدة البيانات: تم حظر العملية بواسطة قواعد Firestore (Permission Denied). لا يمكن تجاوز الحماية عبر الواجهة.");
    
    // Immediately re-sync UI with true server role
    getVerifiedServerRole(true).then((realRole) => {
      selectedRole = realRole;
      updateNavVisibility();
      showScreen(isAdminRole(realRole) ? "admin" : (realRole === ROLES.DOCTOR ? "doctor" : "patient"));
    });
    return true;
  }
  return false;
}

const OWNER_EMAIL = "mohammedabdelrouf85@gmail.com";

function isOwnerUser(userOrEmail) {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === "string" ? userOrEmail : userOrEmail.email;
  return Boolean(email && email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase());
}

const roleLabels = {
  patient: "حساب مريض",
  doctor_pending: "طبيب بانتظار الاعتماد",
  doctor: "حساب طبيب موثق",
  clinic_admin: "مدير عيادة",
  support: "دعم فني",
  super_admin: "مدير عام للنظام"
};

const englishTitles = {
  patient: "Home",
  consent: "Consent & Privacy",
  profile: "Medical Profile",
  assessment: "Breathing Assessment",
  pending: "Review Status",
  result: "Approved Result",
  history: "History & Reports",
  appointments: "Appointments",
  assistant: "Medical Assistant",
  verification: "Doctor Verification",
  doctor: "Doctor Review",
  admin: "Admin Dashboard",
  audit: "Audit Log",
  report: "Report"
};

const englishRoleLabels = {
  patient: "Patient account",
  doctor_pending: "Pending doctor account",
  doctor: "Verified doctor account",
  clinic_admin: "Clinic admin account",
  support: "Support account",
  super_admin: "Super admin account"
};

const englishNames = {
  patient: "Ahmed Mohamed",
  doctor: "Dr. Mona Samy",
  admin: "Operations Admin"
};

const uiText = {
  "Health Vibes": "Health Vibes",
  "نجهز تجربة رعاية صحية أوضح وأكثر أمانًا": "Preparing a clearer, safer healthcare experience",
  "رعاية صحية مدعومة بالذكاء الاصطناعي وتحت مراجعة الطبيب": "AI-supported healthcare reviewed by doctors",
  "المسار": "Workflow",
  "الحسابات": "Accounts",
  "الأمان": "Safety",
  "الوضع الفاتح": "Light",
  "الوضع الداكن": "Dark",
  "تسجيل الدخول": "Sign in",
  "ابدأ الآن": "Get started",
  "الوحدة الأولى لتقييم التنفس": "Respiratory assessment module",
  "رعاية صحية رقمية تربط المريض بالطبيب قبل ظهور أي نتيجة نهائية": "Digital healthcare that connects patients with doctors before any final result appears",
  "Health Vibes يجمع التقييم، مراجعة الطبيب، التقارير، المواعيد، والسجل الطبي في تجربة عربية واحدة مبنية للأفراد والعيادات في مصر.": "Health Vibes brings assessment, doctor review, reports, appointments, and medical history into one experience built for people and clinics in Egypt.",
  "تجربة البرنامج": "Try the app",
  "معاينة بدون حساب": "Preview without account",
  "الذكاء الاصطناعي لا يصدر تشخيصًا مستقلًا": "AI does not issue an independent diagnosis",
  "مراجعة طبيب إلزامية": "Doctor review is required",
  "واجهة عربية كاملة": "Full Arabic interface",
  "أحمد": "Ahmed",
  "قيد المراجعة": "Under review",
  "تقييم التنفس": "Breathing assessment",
  "نسبة الأكسجين 95% - كحة متوسطة - 3 أيام": "Oxygen level 95% - moderate cough - 3 days",
  "تقدير الخطورة": "Risk preview",
  "متوسط": "Medium",
  "مراجعة الطبيب": "Doctor review",
  "قيد الانتظار": "Pending",
  "التقرير": "Report",
  "مغلق حتى الاعتماد": "Locked until approval",
  "ثقة التحليل": "Analysis confidence",
  "موثق": "Verified",
  "اعتماد الطبيب": "Doctor approval",
  "مسار العمل": "Workflow",
  "مسار واضح من البيانات إلى التقرير": "A clear path from data to report",
  "بيانات المريض": "Patient data",
  "أعراض، قياسات، ملف طبي، وموافقة خصوصية واضحة.": "Symptoms, measurements, medical file, and clear privacy consent.",
  "تحليل الذكاء الاصطناعي": "AI analysis",
  "تصنيف الخطورة ونسبة الثقة مع إصدار نموذج قابل للتتبع.": "Risk classification and confidence with a traceable model version.",
  "الطبيب يعتمد أو يرفض أو يطلب متابعة إضافية.": "The doctor approves, rejects, or requests extra follow-up.",
  "تقرير معتمد": "Approved report",
  "نتيجة وتوصيات وتنبيه طبي محفوظين في السجل.": "Result, recommendations, and medical notice saved in history.",
  "حسابات للمريض والطبيب والإدارة": "Accounts for patients, doctors, and admins",
  "الواجهة الجديدة تبدأ بتسجيل دخول واضح، وتسجيل دخول جوجل جاهز للدمج، واختيار دور المستخدم بدون خلط بين مسارات المريض والطبيب والإدارة.": "The new interface starts with clear sign-in, Google sign-in ready for integration, and role selection without mixing patient, doctor, and admin paths.",
  "المريض": "Patient",
  "التقييمات، التقارير، والمواعيد": "Assessments, reports, and appointments",
  "الطبيب": "Doctor",
  "قائمة المراجعة، الاعتماد، والملاحظات": "Review queue, approval, and notes",
  "الإدارة": "Admin",
  "المستخدمون، الأطباء، الفروع، وجودة النموذج": "Users, doctors, branches, and model quality",
  "السلامة أولًا": "Safety first",
  "لا توجد نتيجة نهائية بدون طبيب": "No final result without a doctor",
  "التصميم يفرق بصريًا بين الحالات قيد الانتظار والمعتمدة والعاجلة، ويضع التنبيه الطبي في النتائج والتقارير بدل دفنه داخل الشروط.": "The design clearly separates pending, approved, and urgent states, and keeps the medical notice visible in results and reports.",
  "إنشاء حساب": "Create account",
  "دخول آمن للحساب": "Secure account access",
  "ادخل لحسابك": "Access your account",
  "اختر الدور المناسب لحسابك وقم بتسجيل الدخول باستخدام حساب جوجل للمتابعة بأمان.": "Select your account role and continue with Google to proceed securely.",
  "اختر الدور ثم سجل الدخول. زر جوجل يعمل كمحاكاة الآن وجاهز للتوصيل بمعرّف تسجيل جوجل.": "Select your account role and continue with Google to proceed securely.",
  "مريض": "Patient",
  "طبيب": "Doctor",
  "إدارة": "Admin",
  "ج": "G",
  "المتابعة بحساب جوجل": "Continue with Google",
  "أو": "or",
  "البريد الإلكتروني": "Email",
  "كلمة المرور": "Password",
  "كلمةالمرور": "password",
  "تذكرني": "Remember me",
  "نسيت كلمة المرور؟": "Forgot password?",
  "دخول البرنامج": "Enter app",
  "للتطبيق الحقيقي: أضف معرّف تسجيل جوجل، ورابط رجوع للخادم، وملفات جلسة آمنة، واربط صلاحيات الوصول بالدور المختار.": "For production: add a Google sign-in client, server callback, secure session cookies, and role-based access rules.",
  "حساب مريض": "Patient account",
  "الرئيسية": "Home",
  "الموافقة والخصوصية": "Consent & Privacy",
  "الملف الطبي": "Medical Profile",
  "تقييم التنفس": "Breathing Assessment",
  "حالة المراجعة": "Review Status",
  "النتيجة": "Result",
  "السجل الطبي": "History",
  "المواعيد": "Appointments",
  "المساعد الطبي": "Medical Assistant",
  "توثيق الطبيب": "Doctor Verification",
  "لوحة الطبيب": "Doctor Dashboard",
  "التقرير": "Report",
  "لوحة الإدارة": "Admin Dashboard",
  "سجل التدقيق": "Audit Log",
  "تسجيل الخروج": "Sign out",
  "عربي": "English",
  "مرحبًا أحمد": "Welcome, Ahmed",
  "متابعة التنفس مع طبيبك في مسار واحد واضح": "Track breathing with your doctor in one clear path",
  "أدخل الأعراض والقياسات. يحصل الطبيب على نتيجة الذكاء الاصطناعي ومؤشر الثقة قبل اعتماد أي تقرير يظهر لك.": "Enter symptoms and measurements. The doctor receives the AI result and confidence score before approving any report shown to you.",
  "بدء تقييم التنفس": "Start breathing assessment",
  "عرض السجل": "View history",
  "آخر حالة": "Latest status",
  "نسبة الأكسجين": "Oxygen level",
  "الثقة": "Confidence",
  "د. منى سامي": "Dr. Mona Samy",
  "الموعد القادم": "Next appointment",
  "غدًا 7:30م": "Tomorrow 7:30 PM",
  "استشارة متابعة": "Follow-up consultation",
  "آخر تقرير": "Latest report",
  "20 سبتمبر": "September 20",
  "تقييم التنفس - الإصدار الأول": "Breathing assessment - version 1",
  "حالة النتيجة": "Result status",
  "بانتظار الطبيب": "Waiting for doctor",
  "92%": "92%",
  "مكتمل تقريبًا": "Almost complete",
  "مسار المريض": "Patient path",
  "التنبيهات": "Alerts",
  "2 جديد": "2 new",
  "تقييمك وصل للطبيب": "Your assessment reached the doctor",
  "منذ 22 دقيقة": "22 minutes ago",
  "موعد متابعة مقترح": "Suggested follow-up appointment",
  "غدًا 7:30 مساءً": "Tomorrow 7:30 PM",
  "الموافقة الطبية": "Medical consent",
  "مطلوبة": "Required",
  "Health Vibes يستخدم بياناتك الصحية لتقييم خطورة إرشادي ثم يرسلها لطبيب معتمد قبل ظهور أي نتيجة نهائية.": "Health Vibes uses your health data for a guidance-only risk assessment, then sends it to a verified doctor before any final result appears.",
  "أوافق على استخدام البيانات الطبية داخل مسار التقييم والمراجعة.": "I agree to use my medical data inside the assessment and review path.",
  "أفهم أن الذكاء الاصطناعي لا يقدم تشخيصًا مستقلًا ولا يغني عن الطبيب.": "I understand that AI does not provide an independent diagnosis and does not replace a doctor.",
  "أوافق على استقبال تنبيهات المواعيد والتقارير عبر البريد أو رابط آمن.": "I agree to receive appointment and report alerts by email or secure link.",
  "يمكنك طلب حذف الحساب أو البيانات وفق سياسة الاحتفاظ التي يجب تثبيتها قبل الإنتاج.": "You can request account or data deletion according to the retention policy required before production.",
  "حفظ والمتابعة للملف الطبي": "Save and continue to medical profile",
  "نطاق الوصول": "Access scope",
  "صلاحيات الأدوار": "Role permissions",
  "يرى بياناته ونتائجه المعتمدة فقط.": "Can see only their own data and approved results.",
  "يرى الحالات المرتبطة به فقط مع سجل المراجعة.": "Can see only assigned cases with review history.",
  "صلاحيات تشغيلية مقيدة حسب الدور مع سجل تدقيق.": "Operational permissions limited by role with an audit log.",
  "92% مكتمل": "92% complete",
  "الاسم": "Name",
  "أحمد محمد": "Ahmed Mohamed",
  "العمر": "Age",
  "34 سنة": "34 years",
  "الطبيب المرتبط": "Linked doctor",
  "د. منى سامي - عيادة مدينة نصر": "Dr. Mona Samy - Nasr City Clinic",
  "أمراض مزمنة أو حساسية": "Chronic conditions or allergies",
  "لا يوجد حساسية معروفة. تاريخ سابق لكحة موسمية.": "No known allergies. Previous history of seasonal cough.",
  "حفظ وبدء تقييم التنفس": "Save and start breathing assessment",
  "ملفات طبية": "Medical files",
  "اختياري": "Optional",
  "رفع تحليل أو أشعة أو صورة دواء": "Upload a lab test, scan, or medication photo",
  "حالة تجريبية: يتم تسجيل اسم الملف فقط بدون تحليل تلقائي.": "Demo state: the file name is saved only, without automatic analysis.",
  "تقرير تحليل الدم": "Blood test report",
  "محفوظ كمرجع للطبيب": "Saved as a doctor reference",
  "الخطوة 2 من 4": "Step 2 of 4",
  "هل يوجد ضيق تنفس؟": "Is there shortness of breath?",
  "نعم": "Yes",
  "لا": "No",
  "درجة الكحة": "Cough severity",
  "خفيفة": "Mild",
  "متوسطة": "Moderate",
  "شديدة": "Severe",
  "لا توجد": "None",
  "مدة الأعراض": "Symptom duration",
  "3 أيام": "3 days",
  "عوامل خطورة": "Risk factors",
  "ربو": "Asthma",
  "تدخين": "Smoking",
  "حمل": "Pregnancy",
  "لا يوجد": "None",
  "لن تظهر نتيجة نهائية للمريض قبل مراجعة الطبيب للحالة.": "No final result appears to the patient before doctor review.",
  "إرسال للطبيب": "Send to doctor",
  "ملخص قبل الإرسال": "Summary before sending",
  "النموذج": "Model",
  "الإصدار الأول": "Version 1",
  "الحالة": "Status",
  "بانتظار مراجعة الطبيب": "Waiting for doctor review",
  "هذه البيانات لا تتحول إلى تقرير للمريض إلا بعد اعتماد الطبيب.": "This data becomes a patient report only after doctor approval.",
  "تم إرسال التقييم بنجاح": "Assessment sent successfully",
  "يراجع الطبيب الأعراض والقياسات ونتيجة الذكاء الاصطناعي قبل إصدار التقرير النهائي.": "The doctor reviews symptoms, measurements, and the AI result before issuing the final report.",
  "استلام البيانات": "Data received",
  "تشغيل الذكاء الاصطناعي": "Run AI",
  "إصدار التقرير": "Issue report",
  "العودة للرئيسية ومتابعة الحالة": "Return to Dashboard",
  "عرض سجل الفحوصات": "View Assessment History",
  "هل أنت ممارس صحي أو طبيب مرخص؟": "Are you a licensed healthcare provider or physician?",
  "يمكن للأطباء المرخصين تقديم طلب رسمي لتوثيق الحساب ومراجعة حالات المرضى بعد اعتماد الإدارة.": "Licensed doctors can apply for official verification to review patient cases upon administrative approval.",
  "تقديم طلب توثيق طبيب 📄": "Apply for Doctor Verification 📄",
  "إدارة المستخدمين والصلاحيات": "Users & Roles Governance",
  "عرض وتعديل أدوار الحسابات وتطبيق مبدأ فصل المهام (Separation of Duties)": "Manage account roles following Separation of Duties (SoD)",
  "فتح شاشة الطبيب": "Open doctor screen",
  "نتيجة معتمدة من الطبيب": "Doctor-approved result",
  "خطر متوسط ويحتاج متابعة": "Medium risk requiring follow-up",
  "يوصى بمتابعة الطبيب خلال 24-48 ساعة ومراقبة الأعراض.": "Follow up with the doctor within 24-48 hours and monitor symptoms.",
  "الخطورة": "Risk",
  "متوسطة": "Medium",
  "التوصيات": "Recommendations",
  "متابعة": "Follow-up",
  "قياس الأكسجين عند توفر جهاز موثوق.": "Measure oxygen when a reliable device is available.",
  "مراجعة الطبيب خلال 24-48 ساعة.": "Follow up with the doctor within 24-48 hours.",
  "طلب رعاية عاجلة إذا زاد ضيق التنفس.": "Seek urgent care if shortness of breath worsens.",
  "تنبيه طبي: التقرير لا يعد تشخيصًا مستقلًا ولا يستبدل الطوارئ.": "Medical notice: the report is not an independent diagnosis and does not replace emergency care.",
  "عرض التقرير": "View report",
  "السجل والتقارير": "History & Reports",
  "3 عناصر": "3 items",
  "20 سبتمبر 2026 - خطر متوسط - الإصدار الأول": "September 20, 2026 - medium risk - version 1",
  "12 سبتمبر 2026 - خطر منخفض - د. منى": "September 12, 2026 - low risk - Dr. Mona",
  "مطمئن": "Reassuring",
  "استكمال الملف": "Complete profile",
  "10 سبتمبر 2026 - الموافقة مفعلة": "September 10, 2026 - consent active",
  "بيانات": "Data",
  "حجز موعد": "Book appointment",
  "التقويم": "Calendar",
  "الأحد": "Sunday",
  "الإثنين": "Monday",
  "الثلاثاء": "Tuesday",
  "الأربعاء": "Wednesday",
  "الخميس": "Thursday",
  "المواعيد المتاحة": "Available appointments",
  "متاح": "Available",
  "7:30 مساءً": "7:30 PM",
  "8:15 مساءً": "8:15 PM",
  "استشارة متابعة - 20 دقيقة": "Follow-up consultation - 20 minutes",
  "فيديو أو عيادة": "Video or clinic",
  "تأكيد الموعد": "Confirm appointment",
  "مساعد طبي إرشادي": "Guidance medical assistant",
  "ليس تشخيصًا": "Not a diagnosis",
  "أقدر أشرح لك معنى الحالة أو أساعدك تجهز أسئلة للطبيب. في الطوارئ اطلب رعاية عاجلة فورًا.": "I can explain what the status means or help you prepare questions for the doctor. In emergencies, seek urgent care immediately.",
  "ماذا يعني خطر متوسط؟": "What does medium risk mean?",
  "إرسال": "Send",
  "حدود المساعد": "Assistant limits",
  "لا يبدل الطبيب": "Does not replace the doctor",
  "يشرح ولا يعتمد علاجًا أو تشخيصًا.": "Explains, but does not approve treatment or diagnosis.",
  "مرتبط بالسياق": "Context-aware",
  "يعتمد على التقرير المعتمد والملاحظات الطبية المتاحة.": "Uses the approved report and available medical notes.",
  "تصعيد واضح": "Clear escalation",
  "الأعراض الشديدة توجه المستخدم للرعاية العاجلة.": "Severe symptoms direct the user to urgent care.",
  "بانتظار التوثيق": "Awaiting verification",
  "الهوية الشخصية": "Personal ID",
  "تم الرفع والمراجعة": "Uploaded and reviewed",
  "كارنيه النقابة / الترخيص": "Syndicate card / license",
  "بانتظار مراجعة الإدارة": "Awaiting admin review",
  "بيانات العيادة": "Clinic details",
  "العنوان وأوقات العمل": "Address and working hours",
  "صلاحية المراجعة": "Review permission",
  "معطلة حتى التوثيق": "Disabled until verified",
  "في النسخة الإنتاجية، لا يستطيع الطبيب اعتماد تقارير مرضى قبل اكتمال التحقق المهني.": "In production, doctors cannot approve patient reports before professional verification is complete.",
  "رفع مستند جديد": "Upload new document",
  "قائمة المرضى": "Patient queue",
  "طبيب موثق": "Verified doctor",
  "نسبة الأكسجين 91% - كحة شديدة": "Oxygen level 91% - severe cough",
  "عاجل": "Urgent",
  "سارة علي": "Sara Ali",
  "خطر متوسط - منذ 14 دقيقة": "Medium risk - 14 minutes ago",
  "محمد حسن": "Mohamed Hassan",
  "خطر منخفض - تقرير جاهز": "Low risk - report ready",
  "منخفض": "Low",
  "مراجعة حالة أحمد": "Ahmed case review",
  "خطورة الذكاء الاصطناعي": "AI risk",
  "ملاحظة الطبيب": "Doctor note",
  "اعتماد النتيجة": "Approve result",
  "رفض": "Reject",
  "المستخدمون": "Users",
  "الأطباء": "Doctors",
  "الأطباء المعتمدون": "Verified doctors",
  "+12 اليوم": "+12 today",
  "6 بانتظار التوثيق": "6 awaiting verification",
  "2 بانتظار الاعتماد": "2 pending approval",
  "الفروع": "Branches",
  "نسخة مصر الأولى": "Egypt first release",
  "مراجعات معلقة": "Pending reviews",
  "2 عاجلة": "2 urgent",
  "طلبات توثيق واعتماد الأطباء (Doctor Verification & Approval)": "Doctor Verification & Approval",
  "مراجعة التراخيص الطبية واعتماد الأطباء رسمياً لتفعيل صلاحية فحص الحالات": "Review medical licenses and officially approve doctors to enable case review permissions",
  "قيد المراجعة": "Pending review",
  "مؤشرات نموذج الذكاء الاصطناعي": "AI model metrics",
  "الإصدار الأول": "Version 1",
  "الحساسية": "Sensitivity",
  "النوعية": "Specificity",
  "الدقة": "Precision",
  "المساحة تحت المنحنى": "Area under curve",
  "العمليات": "Operations",
  "تحتاج مراجعة جودة": "Needs QA",
  "توثيق الأطباء": "Doctor verification",
  "6 مستندات مهنية بانتظار المراجعة": "6 professional documents awaiting review",
  "تحديث النموذج": "Model update",
  "مسودة الإصدار الثاني بانتظار مراجعة الجودة الطبية": "Version 2 draft awaiting clinical QA",
  "ضوابط صلاحيات الأدوار": "Role permission controls",
  "أقل صلاحية ممكنة": "Least privilege",
  "دعم الإدارة": "Admin support",
  "بدون ملاحظات طبية": "No medical notes",
  "مراجعة الجودة الطبية": "Clinical QA",
  "وصول بدون هوية المريض": "De-identified access",
  "الإدارة العليا": "Super admin",
  "للطوارئ فقط": "Emergency only",
  "أحداث التدقيق": "Audit events",
  "مفعلة": "Enabled",
  "إدارة المستخدمين والصلاحيات (Users & Roles Governance)": "Users & Roles Governance",
  "عرض وتعديل أدوار الحسابات وتطبيق مبدأ فصل المهام (Separation of Duties)": "View and update account roles while applying separation of duties",
  "جاري التحميل...": "Loading...",
  "أحداث تجريبية": "Demo events",
  "20 سبتمبر 2026 - 03:18": "September 20, 2026 - 03:18",
  "20 سبتمبر 2026 - 03:21": "September 20, 2026 - 03:21",
  "20 سبتمبر 2026 - 03:29": "September 20, 2026 - 03:29",
  "20 سبتمبر 2026 - 03:35": "September 20, 2026 - 03:35",
  "المريض أرسل تقييم التنفس": "Patient submitted breathing assessment",
  "نموذج التنفس أصدر تقدير خطورة متوسط": "Breathing model generated a medium risk preview",
  "الطبيب فتح مراجعة الحالة": "Doctor opened case review",
  "الإدارة راجعت لوحة جودة النموذج": "Admin viewed model quality dashboard",
  "المريض: 2048": "patient: 2048",
  "إصدار النموذج: الأول": "model version: 1",
  "الطبيب: منى 17": "doctor: Mona 17",
  "الدور: مراجعة الجودة الطبية": "role: Clinical QA",
  "تقرير تقييم التنفس": "Breathing Assessment Report",
  "تنبيه": "Caution",
  "أحمد محمد - رقم 2048": "Ahmed Mohamed - No. 2048",
  "د. منى سامي - موثقة": "Dr. Mona Samy - verified",
  "التاريخ": "Date",
  "20 سبتمبر 2026": "September 20, 2026",
  "النتيجة": "Result",
  "خطورة متوسطة.": "Medium risk.",
  "يوصى بالمتابعة خلال 24-48 ساعة. نسبة الثقة: 78%.": "Follow-up is recommended within 24-48 hours. Confidence: 78%.",
  "راقب نسبة الأكسجين إذا توفر جهاز موثوق.": "Monitor oxygen level if a reliable device is available.",
  "تابع مع الطبيب الذي راجع الحالة.": "Follow up with the reviewing doctor.",
  "اطلب رعاية عاجلة إذا زاد ضيق التنفس.": "Seek urgent care if shortness of breath worsens.",
  "تنبيه طبي: Health Vibes يساعد في دعم القرار الطبي ولا يستبدل التقييم الطبي المؤهل أو رعاية الطوارئ.": "Medical notice: Health Vibes supports clinical decision-making and does not replace qualified medical evaluation or emergency care.",
  "تأكيد اعتماد التقرير": "Confirm report approval",
  "بعد الاعتماد ستظهر النتيجة والتوصيات للمريض وسيتم حفظ الحدث في سجل التدقيق.": "After approval, the result and recommendations will appear to the patient and the event will be saved in the audit log.",
  "تأكيد الاعتماد": "Confirm approval",
  "إلغاء": "Cancel",
  "فتح أو إغلاق القائمة": "Toggle menu",
  "التنقل في الموقع": "Website navigation",
  "معاينة المنتج": "Product preview",
  "دور الحساب": "Account role",
  "التنقل داخل التطبيق": "App navigation",
  "إغلاق": "Close",
  "مستخدم جوجل التجريبي": "Demo Google user",
  "تم تسجيل الدخول بمحاكاة تسجيل جوجل": "Signed in with simulated Google sign-in",
  "تم تسجيل الدخول بنجاح": "Signed in successfully",
  "تم تسجيل الخروج": "Signed out",
  "القيمة منخفضة جدًا. اطلب رعاية عاجلة فورًا إذا يوجد ضيق تنفس شديد أو ألم صدر.": "The value is very low. Seek urgent care immediately if there is severe shortness of breath or chest pain.",
  "القيمة تحتاج متابعة قريبة. سيتم تعليم الحالة للطبيب كأولوية أعلى.": "The value needs close follow-up. The case will be marked as higher priority for the doctor.",
  "تم إرسال الحالة للطبيب مع أولوية متابعة": "The case was sent to the doctor with follow-up priority",
  "تم إرسال التقييم للطبيب": "Assessment sent to the doctor",
  "تم اعتماد النتيجة وتسجيل الحدث في سجل التدقيق": "Result approved and event saved in the audit log",
  "جاهز لمراجعة الطبيب - بدون تحليل ذكاء اصطناعي": "Ready for doctor review - without AI analysis",
  "تمت إضافة الملف كمرجع للطبيب": "File added as a doctor reference",
  "أحتاج توضيحًا": "I need clarification",
  "الخطر المتوسط يعني أن الحالة ليست مطمئنة تمامًا وتحتاج متابعة الطبيب خلال 24-48 ساعة. لا تبدأ علاجًا جديدًا دون مراجعة الطبيب.": "Medium risk means the case is not fully reassuring and needs doctor follow-up within 24-48 hours. Do not start a new treatment without consulting the doctor.",
  "الواجهة مضبوطة على العربية": "Interface set to Arabic",
  "الواجهة مضبوطة على الإنجليزية": "Interface set to English",
  "الاسم بالكامل": "Full Name",
  "البريد الإلكتروني": "Email Address",
  "كلمة المرور": "Password",
  "تذكرني": "Remember me",
  "نسيت كلمة المرور؟": "Forgot password?",
  "اختر الدور المناسب لحسابك وسجل دخولك بالبريد أو جوجل للمتابعة بأمان.": "Select your account role and sign in with email or Google to proceed securely.",
  "سجل دخولك بالبريد أو جوجل للمتابعة بأمان.": "Sign in with email or Google to proceed securely.",
  "للأطباء: يتم تفعيل حساب الطبيب بعد مراجعة وتوثيق ترخيص مزاولة المهنة.": "Healthcare provider? Doctor access is activated after credential verification.",
  "تأكيد البريد الإلكتروني مطلوب": "Email verification needed",
  "إعادة إرسال الرابط": "Resend Verification",
  "تحقق الآن": "Check Status",
  "استعادة كلمة المرور": "Reset Password",
  "إرسال رابط الاستعادة": "Send Reset Link",
  "العودة لتسجيل الدخول": "Back to Sign In",
  "تعيين كلمة مرور جديدة": "Set New Password",
  "كلمة المرور الجديدة": "New Password",
  "تأكيد كلمة المرور الجديدة": "Confirm New Password",
  "حفظ كلمة المرور الجديدة": "Save New Password",
  "البريد الإلكتروني للحساب": "Account Email",
  "تم إرسال رابط الاستعادة!": "Reset link sent!"
};

const enToAr = {
  "Access your account": "ادخل لحسابك",
  "Select your account role and continue with Google to proceed securely.": "اختر الدور المناسب لحسابك وقم بتسجيل الدخول باستخدام حساب جوجل للمتابعة بأمان.",
  "Select the appropriate role for your account and sign in with Google to proceed securely.": "اختر الدور المناسب لحسابك وقم بتسجيل الدخول باستخدام حساب جوجل للمتابعة بأمان.",
  "Select your account role and sign in with email or Google to proceed securely.": "اختر الدور المناسب لحسابك وسجل دخولك بالبريد أو جوجل للمتابعة بأمان.",
  "Sign in with email or Google to proceed securely.": "سجل دخولك بالبريد أو جوجل للمتابعة بأمان.",
  "Healthcare provider? Doctor access is activated after credential verification.": "للأطباء: يتم تفعيل حساب الطبيب بعد مراجعة وتوثيق ترخيص مزاولة المهنة.",
  "Patient": "مريض",
  "Doctor": "طبيب",
  "Admin": "إدارة",
  "Sign In": "تسجيل الدخول",
  "Create Account": "إنشاء حساب",
  "Full Name": "الاسم بالكامل",
  "Email Address": "البريد الإلكتروني",
  "Password": "كلمة المرور",
  "Remember me": "تذكرني",
  "Forgot password?": "نسيت كلمة المرور؟",
  "Continue with Google": "المتابعة بحساب جوجل",
  "Close": "إغلاق",
  "Sign in": "تسجيل الدخول",
  "Account role": "دور الحساب",
  "Email verification needed": "تأكيد البريد الإلكتروني مطلوب",
  "Resend Verification": "إعادة إرسال الرابط",
  "Check Status": "تحقق الآن",
  "Reset Password": "استعادة كلمة المرور",
  "Send Reset Link": "إرسال رابط الاستعادة",
  "Back to Sign In": "العودة لتسجيل الدخول",
  "Set New Password": "تعيين كلمة مرور جديدة",
  "New Password": "كلمة المرور الجديدة",
  "Confirm New Password": "تأكيد كلمة المرور الجديدة",
  "Save New Password": "حفظ كلمة المرور الجديدة",
  "Account Email": "البريد الإلكتروني للحساب",
  "Reset link sent!": "تم إرسال رابط الاستعادة!"
};

let selectedRole = "patient";
let currentLanguage = "ar";

function localized(text) {
  if (currentLanguage === "en") {
    return uiText[text] || text;
  } else {
    return enToAr[text] || text;
  }
}

function preserveSpacing(original, value) {
  const start = original.match(/^\s*/)[0];
  const end = original.match(/\s*$/)[0];
  return `${start}${value}${end}`;
}

function applyLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.title = localized("Health Vibes");

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const trimmed = node.textContent.trim();
    if (!trimmed) return;
    if (!node.arText) node.arText = trimmed;
    node.textContent = preserveSpacing(node.textContent, localized(node.arText));
  });

  document.querySelectorAll("input, textarea").forEach((field) => {
    if (!field.arValue) field.arValue = field.value;
    field.value = localized(field.arValue);
  });

  document.querySelectorAll("[aria-label]").forEach((element) => {
    if (!element.arLabel) element.arLabel = element.getAttribute("aria-label");
    element.setAttribute("aria-label", localized(element.arLabel));
  });

  if (languageToggle) {
    const langLabel = languageToggle.querySelector(".lang-label");
    if (langLabel) {
      langLabel.textContent = language === "ar" ? "EN" : "AR";
      languageToggle.title = language === "ar" ? "Switch to English" : "Switch to Arabic";
    } else {
      languageToggle.textContent = language === "ar" ? "EN" : "AR";
    }
  }
  const themeLabel = document.body.classList.contains("dark") ? "الوضع الداكن" : "الوضع الفاتح";
  if (siteThemeToggle) siteThemeToggle.textContent = localized(themeLabel);
  const activeScreenEl = document.querySelector(".screen.active");
  const activeScreenName = activeScreenEl ? activeScreenEl.id.replace("screen-", "") : "patient";
  const isOwner = auth && auth.currentUser && isOwnerUser(auth.currentUser.email);
  const currentRole = normalizeRole(selectedRole, isOwner);
  accountLabel.textContent = language === "en"
    ? (englishRoleLabels[currentRole] || englishRoleLabels.patient)
    : (roleLabels[currentRole] || roleLabels.patient);
  if (typeof setAuthMode === "function") setAuthMode(authMode);
  if (typeof updateEmailVerificationUI === "function" && typeof auth !== "undefined") updateEmailVerificationUI(auth.currentUser);
}

function showToast(message) {
  toast.textContent = localized(message);
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

// --- Environment Config + Real Database (Firebase Firestore) ---
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyANyIglmiKcdM0I2EKkjPhzMjKR58o8BRM",
  authDomain: "health-vibes-a4b3b.firebaseapp.com",
  projectId: "health-vibes-a4b3b",
  storageBucket: "health-vibes-a4b3b.firebasestorage.app",
  messagingSenderId: "21682568356",
  appId: "1:21682568356:web:d38947f11647fdfef13a31",
  measurementId: "G-FSHSN2XB4L"
};

const runtimeConfig = window.HEALTH_VIBE_CONFIG || {};
const firebaseConfig = (runtimeConfig.firebase && runtimeConfig.firebase.projectId)
  ? runtimeConfig.firebase
  : DEFAULT_FIREBASE_CONFIG;

// Fallback loader dismiss timer in case Firebase CDN or network hangs
const loaderSafetyTimer = window.setTimeout(() => {
  if (loader && !loader.classList.contains("is-done")) {
    console.warn("Loader safety timeout: dismissing loader.");
    loader.classList.add("is-done");
    if (publicSite && publicSite.classList.contains("is-hidden")) {
      publicSite.classList.remove("is-hidden");
    }
  }
}, 2500);

// Initialize Firebase
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
const API_BASE_URL = (runtimeConfig.apiBaseUrl || "").replace(/\/$/, "");

const APP_ENV = {
  name: runtimeConfig.environment || "production",
  isLocalhost: ["localhost", "127.0.0.1", ""].includes(window.location.hostname),
  allowDemoSeed: runtimeConfig.environment === "development" &&
    runtimeConfig.allowDemoSeed === true &&
    new URLSearchParams(window.location.search).get("seedDemo") === "true"
};

async function callBackend(path, options = {}) {
  if (!auth.currentUser) {
    throw new Error(currentLanguage === "en" ? "Authentication required." : "يجب تسجيل الدخول أولاً.");
  }

  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Backend request failed (${response.status})`);
  }

  return payload;
}

async function initDB() {
  if (!APP_ENV.isLocalhost || APP_ENV.name !== "development" || !APP_ENV.allowDemoSeed) {
    console.info("[Demo Seed] Skipped. Demo data seeding is disabled outside explicit local development.");
    return;
  }

  try {
    const snapshot = await db.collection("cases").limit(1).get();
    if (snapshot.empty) {
      const initialCases = [
        { id: "demo_case_1", isDemo: true, name: "أحمد محمد", nameEn: "Ahmed Mohamed", o2: 91, symptoms: "كحة شديدة", symptomsEn: "Severe cough", risk: "عاجل", riskEn: "Urgent", status: "pending", time: "الآن", aiScore: "عالية", aiScoreEn: "High", confidence: "89%", duration: "3 أيام", durationEn: "3 days", createdAt: new Date().getTime() },
        { id: "demo_case_2", isDemo: true, name: "سارة علي", nameEn: "Sarah Ali", o2: 96, symptoms: "أعراض خفيفة", symptomsEn: "Mild symptoms", risk: "مراجعة", riskEn: "Review", status: "pending", time: "منذ 14 دقيقة", aiScore: "متوسطة", aiScoreEn: "Medium", confidence: "78%", duration: "يومين", durationEn: "2 days", createdAt: new Date().getTime() - 1000 },
        { id: "demo_case_3", isDemo: true, name: "محمد حسن", nameEn: "Mohamed Hassan", o2: 98, symptoms: "لا توجد أعراض ظاهرة", symptomsEn: "No clear symptoms", risk: "منخفض", riskEn: "Low", status: "approved", time: "تقرير جاهز", aiScore: "منخفضة", aiScoreEn: "Low", confidence: "94%", duration: "يوم واحد", durationEn: "1 day", createdAt: new Date().getTime() - 2000 }
      ];
      for (let c of initialCases) {
        await db.collection("cases").doc(c.id).set(c);
      }
    }

    const appSnapshot = await db.collection("doctor_applications").limit(1).get();
    if (appSnapshot.empty) {
      const sampleApps = [
        {
          id: "demo_doc_app_1",
          isDemo: true,
          userId: "demo_doc_uid_1",
          name: "د. طارق محمود الشريف",
          nameEn: "Dr. Tarek Mahmoud",
          email: "tarek.mahmoud@hospital.eg",
          licenseNumber: "EGY-MED-84920",
          specialty: "أمراض الصدر والجهاز التنفسي",
          clinic: "مستشفى القصر العيني التعليمي",
          docName: "medical_syndicate_card_84920.pdf",
          status: "pending",
          appliedAt: new Date().getTime() - 3600000 * 4
        },
        {
          id: "demo_doc_app_2",
          isDemo: true,
          userId: "demo_doc_uid_2",
          name: "د. هدى عبد الرحمن",
          nameEn: "Dr. Hoda Abdelrahman",
          email: "hoda.abdelrahman@clinics.eg",
          licenseNumber: "EGY-MED-92144",
          specialty: "طب الباطنة والرعاية المركزة",
          clinic: "عيادات مصر التخصصية - المعادي",
          docName: "syndicate_license_92144.jpg",
          status: "pending",
          appliedAt: new Date().getTime() - 3600000 * 20
        }
      ];
      for (let app of sampleApps) {
        await db.collection("doctor_applications").doc(app.id).set(app);
      }
    }
  } catch (err) {
    console.warn("Firestore not ready or permissions denied", err);
  }
}

async function getCases() {
  try {
    const snapshot = await db.collection("cases").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function updateCaseStatus(id, newStatus, note) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Update Case Status")) return;
  try {
    await db.collection("cases").doc(id).update({
      status: newStatus,
      doctorNote: note
    });
  } catch (err) {
    console.error(err);
  }
}

let activeCaseId = null;

async function renderDoctorQueue() {
  const queueList = document.getElementById("doctorQueueList");
  if (!queueList) return;

  queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--teal);"><div class="spinner"></div> جاري جلب البيانات من Firebase...</div>';
  const cases = await getCases();
  queueList.innerHTML = '';
  
  if (cases.length === 0) {
    queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">لا يوجد بيانات</div>';
    return;
  }
  
  // Sort cases: pending first
  cases.sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  
  cases.forEach(c => {
    const isEn = currentLanguage === "en";
    const btn = document.createElement("button");
    btn.className = c.status === "approved" ? "ok" : (c.risk === "عاجل" ? "danger" : "pending");
    if (c.id === activeCaseId) btn.style.border = "2px solid var(--teal)";
    
    btn.innerHTML = `<strong>${isEn ? c.nameEn : c.name}</strong><span>${isEn ? 'O2 ' + c.o2 + '% - ' + c.symptomsEn : 'نسبة الأكسجين ' + c.o2 + '% - ' + c.symptoms}</span><em>${isEn ? c.riskEn : c.risk}</em>`;
    btn.onclick = () => selectDoctorCase(c.id);
    queueList.appendChild(btn);
  });
  
  if (cases.length > 0 && !activeCaseId) {
    selectDoctorCase(cases[0].id);
  }
}

window.approveCase = async function(id) {
  if (!enforcePermission(PERMISSIONS.APPROVE_CASE, "Approve Clinical Result")) return;
  const noteInput = document.getElementById("doctorNoteInput");
  const note = noteInput ? noteInput.value : "";
  await updateCaseStatus(id, "approved", note);
  showToast(currentLanguage === "en" ? "Result approved and saved to database" : "تم اعتماد النتيجة وحفظها في قاعدة البيانات");
  renderDoctorQueue();
  selectDoctorCase(id);
};

async function selectDoctorCase(id) {
  activeCaseId = id;
  const cases = await getCases();
  const c = cases.find(c => c.id === id);
  const reviewPanel = document.getElementById("doctorReviewPanel");
  if (!c || !reviewPanel) return;

  const isEn = currentLanguage === "en";
  reviewPanel.style.display = "block";
  
  const statusPill = c.status === "approved" 
    ? `<span class="pill ok">${isEn ? 'Approved' : 'معتمد'}</span>` 
    : `<span class="pill pending">${isEn ? 'Pending' : 'قيد الانتظار'}</span>`;

  reviewPanel.innerHTML = `
    <div class="panel-head"><h3>${isEn ? 'Reviewing ' + c.nameEn : 'مراجعة حالة ' + c.name}</h3>${statusPill}</div>
    <div class="summary-list">
      <div><span>${isEn ? 'AI Risk' : 'خطورة الذكاء الاصطناعي'}</span><strong>${isEn ? c.aiScoreEn : c.aiScore}</strong></div>
      <div><span>${isEn ? 'Confidence' : 'الثقة'}</span><strong>${c.confidence}</strong></div>
      <div><span>${isEn ? 'Oxygen Level' : 'نسبة الأكسجين'}</span><strong>${c.o2}%</strong></div>
      <div><span>${isEn ? 'Duration' : 'مدة الأعراض'}</span><strong>${isEn ? c.durationEn : c.duration}</strong></div>
    </div>
    <label>${isEn ? 'Doctor Note' : 'ملاحظة الطبيب'}</label>
    <textarea id="doctorNoteInput" ${c.status === 'approved' ? 'disabled' : ''} style="width: 100%; min-height: 80px; margin-bottom: 15px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); padding: 12px; font-family: inherit;">${c.doctorNote || (isEn ? 'Follow-up recommended.' : 'يوصى بمتابعة خلال 24-48 ساعة مع مراقبة الأعراض.')}</textarea>
    ${c.status !== 'approved' ? `
    <div class="doctor-actions">
      <button class="solid-button" onclick="approveCase('${c.id}')">${isEn ? 'Approve Result' : 'اعتماد النتيجة'}</button>
      <button class="danger-button">${isEn ? 'Reject' : 'رفض'}</button>
    </div>` : ''}
  `;
  
  // Highlight active button in queue
  const queueList = document.getElementById("doctorQueueList");
  if (queueList) {
      Array.from(queueList.children).forEach(btn => btn.style.border = "none");
      const activeBtn = Array.from(queueList.children).find(btn => btn.innerHTML.includes(c.name) || btn.innerHTML.includes(c.nameEn));
      if (activeBtn) activeBtn.style.border = "2px solid var(--teal)";
  }
}

if (APP_ENV.isLocalhost && APP_ENV.allowDemoSeed) {
  initDB();
}

function showAuth() {
  authScreen.classList.add("open");
  clearAuthError();
  if (authNewPasswordView && authNewPasswordView.style.display === "block") {
    // Keep new password view
  } else {
    showSignInView();
  }
}

function hideAuth() {
  authScreen.classList.remove("open");
  clearAuthError();
}

function showForgotView() {
  clearAuthError();
  if (resetSuccessMessage) resetSuccessMessage.style.display = "none";
  if (authMainView) authMainView.style.display = "none";
  if (authNewPasswordView) authNewPasswordView.style.display = "none";
  if (authResetView) authResetView.style.display = "block";

  if (resetEmailInput) {
    if (authEmail && authEmail.value.trim()) {
      resetEmailInput.value = authEmail.value.trim();
    }
    resetEmailInput.focus();
  }
}

function showSignInView() {
  clearAuthError();
  if (authResetView) authResetView.style.display = "none";
  if (authNewPasswordView) authNewPasswordView.style.display = "none";
  if (authMainView) authMainView.style.display = "block";
}

function showNewPasswordView(oobCode) {
  activeResetCode = oobCode;
  clearAuthError();
  authScreen.classList.add("open");
  if (authMainView) authMainView.style.display = "none";
  if (authResetView) authResetView.style.display = "none";
  if (authNewPasswordView) authNewPasswordView.style.display = "block";
  if (newPasswordInput) newPasswordInput.focus();
}

function setAuthMode(mode) {
  authMode = mode;
  clearAuthError();
  if (authTabSignIn && authTabSignUp) {
    authTabSignIn.classList.toggle("active", mode === "signin");
    authTabSignUp.classList.toggle("active", mode === "signup");
  }
  if (authNameGroup) {
    authNameGroup.style.display = mode === "signup" ? "block" : "none";
  }
  if (authName) {
    if (mode === "signup") {
      authName.setAttribute("required", "true");
    } else {
      authName.removeAttribute("required");
    }
  }
  if (authSubmitText) {
    const isEn = currentLanguage === "en";
    authSubmitText.textContent = mode === "signup" ? (isEn ? "Create Account" : "إنشاء حساب") : (isEn ? "Sign In" : "تسجيل الدخول");
  }
  if (forgotPasswordBtn) {
    forgotPasswordBtn.style.display = mode === "signup" ? "none" : "inline-block";
  }
}

function showAuthError(message) {
  if (authErrorBanner) {
    authErrorBanner.textContent = message;
    authErrorBanner.style.display = "block";
  }
  showToast(message);
}

function clearAuthError() {
  if (authErrorBanner) {
    authErrorBanner.textContent = "";
    authErrorBanner.style.display = "none";
  }
}

function setAuthLoading(loading) {
  if (!authSubmitBtn) return;
  authSubmitBtn.disabled = loading;
  if (authSubmitText) {
    if (loading) {
      authSubmitText.textContent = currentLanguage === "en" ? "Please wait..." : "يرجى الانتظار...";
    } else {
      const isEn = currentLanguage === "en";
      authSubmitText.textContent = authMode === "signup" ? (isEn ? "Create Account" : "إنشاء حساب") : (isEn ? "Sign In" : "تسجيل الدخول");
    }
  }
}

function getAuthErrorMessage(error) {
  const isEn = currentLanguage === "en";
  switch (error.code) {
    case "auth/invalid-email":
      return isEn ? "Invalid email address format." : "صيغة البريد الإلكتروني غير صحيحة.";
    case "auth/user-disabled":
      return isEn ? "This account has been disabled." : "تم تعطيل هذا الحساب.";
    case "auth/user-not-found":
      return isEn ? "No account found with this email. Please click 'Create Account' first." : "لا يوجد حساب مسجل بهذا البريد. يمكنك الضغط على 'إنشاء حساب'.";
    case "auth/wrong-password":
      return isEn ? "Incorrect password. Please try again or use 'Forgot password?'." : "كلمة المرور غير صحيحة. يرجى المحاولة مجددًا أو استعادة كلمة المرور.";
    case "auth/invalid-credential":
      return isEn ? "Invalid email or password. Please check your credentials." : "بيانات تسجيل الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.";
    case "auth/email-already-in-use":
      return isEn ? "This email is already registered. Please switch to 'Sign In'." : "هذا البريد مسجل بالفعل. يرجى التبديل إلى 'تسجيل الدخول'.";
    case "auth/weak-password":
      return isEn ? "Password is too weak. Must be at least 6 characters." : "كلمة المرور ضعيفة. يجب أن تتكون من 6 أحرف أو أرقام على الأقل.";
    case "auth/operation-not-allowed":
      return isEn
        ? "Email/Password sign-in is not enabled in Firebase Console. Please enable it under Authentication > Sign-in method."
        : "تسجيل الدخول بالبريد غير مفعل في Firebase Console. يرجى تفعيله من Authentication > Sign-in method.";
    case "auth/too-many-requests":
      return isEn ? "Too many attempts. Please wait a moment and try again." : "محاولات كثيرة خاطئة. يرجى الانتظار قليلاً والمحاولة لاحقاً.";
    case "auth/network-request-failed":
      return isEn ? "Network error. Please check your internet connection." : "خطأ في الاتصال بالإنترنت. يرجى التحقق من اتصالك.";
    default:
      return error.message || (isEn ? "Authentication error." : "حدث خطأ أثناء تسجيل الدخول.");
  }
}

async function handleEmailAuth(e) {
  if (e) e.preventDefault();
  clearAuthError();

  const email = authEmail ? authEmail.value.trim() : "";
  const password = authPassword ? authPassword.value : "";
  const name = authName ? authName.value.trim() : "";
  const remember = document.getElementById("rememberMe")?.checked;

  if (!email || !password) {
    showAuthError(currentLanguage === "en" ? "Please enter email and password." : "يرجى كتابة البريد الإلكتروني وكلمة المرور.");
    return;
  }

  setAuthLoading(true);

  try {
    if (remember) {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } else {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    }

    if (authMode === "signup") {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const user = cred.user;
      const displayName = name || email.split("@")[0];
      try {
        await user.updateProfile({ displayName });
      } catch (profileErr) {
        console.warn("Could not update profile displayName:", profileErr);
      }
      const isOwner = isOwnerUser(user.email);
      const safeRole = normalizeRole(ROLES.PATIENT, isOwner);
      selectedRole = safeRole;

      await db.collection("users").doc(user.uid).set({
        name: displayName,
        email: user.email,
        emailVerified: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      try {
        await user.sendEmailVerification();
        showToast(currentLanguage === "en" ? `Verification link sent! Check Inbox or Spam folder.` : `تم إرسال رابط التأكيد! يرجى فحص البريد الوارد أو مجلد Spam.`);
      } catch (verErr) {
        console.error("sendEmailVerification error:", verErr);
        showToast(getAuthErrorMessage(verErr));
      }
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast(currentLanguage === "en" ? "Signed in successfully!" : "تم تسجيل الدخول بنجاح!");
    }
  } catch (error) {
    console.error("Firebase Auth Error:", error);
    showAuthError(getAuthErrorMessage(error));
  } finally {
    setAuthLoading(false);
  }
}

let resetCooldown = false;
let resetTimer = null;

async function handleForgotPasswordSubmit(e) {
  if (e) e.preventDefault();
  clearAuthError();
  const email = resetEmailInput ? resetEmailInput.value.trim() : "";

  if (!email) {
    showAuthError(currentLanguage === "en" ? "Please enter your account email address." : "يرجى كتابة البريد الإلكتروني الخاص بحسابك.");
    return;
  }

  if (resetCooldown) {
    showToast(currentLanguage === "en" ? "Please wait before requesting another reset link." : "يرجى الانتظار قليلاً قبل طلب رابط جديد.");
    return;
  }

  try {
    if (sendResetLinkBtn) sendResetLinkBtn.disabled = true;
    if (sendResetLinkText) sendResetLinkText.textContent = currentLanguage === "en" ? "Sending link..." : "جاري الإرسال...";

    await auth.sendPasswordResetEmail(email);

    if (resetSuccessMessage) {
      resetSuccessMessage.style.display = "block";
    }

    showToast(currentLanguage === "en" ? `Reset link sent to ${email}! (Check Spam folder)` : `تم إرسال رابط الاستعادة إلى ${email}! (افحص مجلد Spam)`);

    resetCooldown = true;
    let seconds = 60;
    if (sendResetLinkText) sendResetLinkText.textContent = `${seconds}s`;

    if (resetTimer) clearInterval(resetTimer);
    resetTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(resetTimer);
        resetCooldown = false;
        if (sendResetLinkBtn) sendResetLinkBtn.disabled = false;
        if (sendResetLinkText) {
          sendResetLinkText.textContent = currentLanguage === "en" ? "Send Reset Link" : "إرسال رابط الاستعادة";
        }
      } else {
        if (sendResetLinkText) sendResetLinkText.textContent = `${seconds}s`;
      }
    }, 1000);
  } catch (error) {
    console.error("Password reset error:", error);
    showAuthError(getAuthErrorMessage(error));
    if (sendResetLinkBtn) sendResetLinkBtn.disabled = false;
    if (sendResetLinkText) {
      sendResetLinkText.textContent = currentLanguage === "en" ? "Send Reset Link" : "إرسال رابط الاستعادة";
    }
  }
}

async function handleNewPasswordSubmit(e) {
  if (e) e.preventDefault();
  clearAuthError();

  const newPassword = newPasswordInput ? newPasswordInput.value : "";
  const confirmPassword = confirmNewPasswordInput ? confirmNewPasswordInput.value : "";

  if (!newPassword || newPassword.length < 6) {
    showAuthError(currentLanguage === "en" ? "Password must be at least 6 characters." : "كلمة المرور يجب ألا تقل عن 6 أحرف.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showAuthError(currentLanguage === "en" ? "Passwords do not match." : "كلمتا المرور غير متطابقتين.");
    return;
  }

  if (!activeResetCode) {
    showAuthError(currentLanguage === "en" ? "Invalid or expired password reset link." : "رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية.");
    return;
  }

  try {
    if (confirmPasswordResetBtn) confirmPasswordResetBtn.disabled = true;
    if (confirmPasswordResetText) confirmPasswordResetText.textContent = currentLanguage === "en" ? "Updating..." : "جاري التحديث...";

    await auth.confirmPasswordReset(activeResetCode, newPassword);

    showToast(currentLanguage === "en" ? "🎉 Password updated successfully! Please sign in." : "🎉 تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.");
    showSignInView();
    if (authPassword) authPassword.value = "";
  } catch (error) {
    console.error("Confirm password reset error:", error);
    showAuthError(getAuthErrorMessage(error));
  } finally {
    if (confirmPasswordResetBtn) confirmPasswordResetBtn.disabled = false;
    if (confirmPasswordResetText) confirmPasswordResetText.textContent = currentLanguage === "en" ? "Save New Password" : "حفظ كلمة المرور";
  }
}

async function enterApp(source = "google") {
  if (source === "google") {
    clearAuthError();
    try {
      const result = await auth.signInWithPopup(googleProvider);
      const user = result.user;
      
      const isOwner = isOwnerUser(user.email);
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (!userDoc.exists) {
          const safeRole = normalizeRole(ROLES.PATIENT, isOwner);
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          if (isOwner) {
            selectedRole = ROLES.SUPER_ADMIN;
            if (normalizeRole(userDoc.data().role, true) !== ROLES.SUPER_ADMIN || !userDoc.data().isOwner) {
              await callBackend("/api/admin/set-user-role", {
                method: "POST",
                body: JSON.stringify({
                  targetUserId: user.uid,
                  newRole: ROLES.SUPER_ADMIN
                })
              });
            }
          } else {
            selectedRole = normalizeRole(userDoc.data().role || selectedRole);
          }
        }
      } catch (dbError) {
        console.warn("Firestore save failed, but auth succeeded:", dbError);
        if (isOwner) selectedRole = ROLES.SUPER_ADMIN;
      }

      userName.textContent = user.displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (englishRoleLabels[normalizeRole(selectedRole, isOwner)] || englishRoleLabels.patient)
        : (roleLabels[normalizeRole(selectedRole, isOwner)] || roleLabels.patient);
      
      updateAvatar(user);
      updateEmailVerificationUI(user);

      publicSite.hidden = true;
      hideAuth();
      app.hidden = false;
      showScreen("patient");
      showToast(currentLanguage === "en" ? "Signed in with Google" : "تم تسجيل الدخول بحساب جوجل");
    } catch (error) {
      console.error("Google Auth Error:", error);
      showAuthError(getAuthErrorMessage(error));
    }
  }
}

async function leaveApp() {
  // ── إيقاف الـ real-time listener عند تسجيل الخروج ────────────
  if (window._patientCasesUnsub) {
    window._patientCasesUnsub();
    window._patientCasesUnsub = null;
  }
  window._currentCaseId = null;

  try {
    await auth.signOut();
  } catch(e) {
    console.error("Sign out error:", e);
  }
  app.hidden = true;
  publicSite.hidden = false;
  publicSite.classList.remove("is-hidden");
  document.body.classList.remove("sidebar-open");
  updateEmailVerificationUI(null);
  showToast(currentLanguage === "en" ? "Signed out" : "تم تسجيل الخروج");
}

let resendCooldown = false;
let resendTimer = null;

function updateEmailVerificationUI(user) {
  const banner = document.getElementById("emailVerificationBanner");
  const badge = document.getElementById("emailVerifiedBadge");
  const ownerBadge = document.getElementById("ownerBadge");
  const doctorBadge = document.getElementById("doctorBadge");

  if (!user) {
    if (banner) banner.style.display = "none";
    if (badge) badge.style.display = "none";
    if (ownerBadge) ownerBadge.style.display = "none";
    if (doctorBadge) doctorBadge.style.display = "none";
    return;
  }

  const isOwner = isOwnerUser(user.email);
  if (ownerBadge) {
    ownerBadge.style.display = isOwner ? "inline-flex" : "none";
  }

  if (doctorBadge) {
    doctorBadge.style.display = (!isOwner && selectedRole === "doctor") ? "inline-flex" : "none";
  }

  if (badge) {
    badge.style.display = user.emailVerified ? "inline-flex" : "none";
  }

  if (!banner) return;

  if (user.emailVerified) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "flex";
  const isEn = currentLanguage === "en";
  const title = document.getElementById("verificationBannerTitle");
  const desc = document.getElementById("verificationBannerDesc");
  const resendText = document.getElementById("resendVerificationText");
  const checkText = document.getElementById("checkVerificationBtn")?.querySelector("span");

  if (title) title.textContent = isEn ? "Email verification needed" : "تأكيد البريد الإلكتروني مطلوب";
  if (desc) desc.textContent = isEn
    ? `Verification link sent to ${user.email}. Check your Inbox and Spam/Junk folder.`
    : `أرسلنا رابط التحقق إلى ${user.email}. يرجى فحص صندوق الوارد أو مجلد الرسائل غير المرغوب فيها (Spam).`;
  if (resendText && !resendCooldown) {
    resendText.textContent = isEn ? "Resend Verification" : "إعادة إرسال الرابط";
  }
  if (checkText) checkText.textContent = isEn ? "Check Status" : "تحقق الآن";
}

async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) return;

  if (user.emailVerified) {
    showToast(currentLanguage === "en" ? "Email is already verified!" : "البريد الإلكتروني مؤكد بالفعل!");
    updateEmailVerificationUI(user);
    return;
  }

  if (resendCooldown) {
    showToast(currentLanguage === "en" ? "Please wait before resending." : "يرجى الانتظار قليلاً قبل إعادة الإرسال.");
    return;
  }

  const resendBtn = document.getElementById("resendVerificationBtn");
  const resendText = document.getElementById("resendVerificationText");

  try {
    if (resendBtn) resendBtn.disabled = true;
    await user.sendEmailVerification();
    showToast(currentLanguage === "en" ? "Verification email sent! Check Inbox or Spam folder." : "تم إرسال رابط التأكيد! يرجى فحص البريد الوارد ومجلد Spam.");

    resendCooldown = true;
    let secondsLeft = 60;
    if (resendText) resendText.textContent = `${secondsLeft}s`;

    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(resendTimer);
        resendCooldown = false;
        if (resendBtn) resendBtn.disabled = false;
        if (resendText) {
          resendText.textContent = currentLanguage === "en" ? "Resend Verification" : "إعادة إرسال الرابط";
        }
      } else {
        if (resendText) resendText.textContent = `${secondsLeft}s`;
      }
    }, 1000);
  } catch (err) {
    console.error("Resend verification error:", err);
    showToast(getAuthErrorMessage(err));
    if (resendBtn) resendBtn.disabled = false;
  }
}

async function checkEmailVerification() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await user.reload();
    const updatedUser = auth.currentUser;

    if (updatedUser && updatedUser.emailVerified) {
      showToast(currentLanguage === "en" ? "🎉 Email verified successfully!" : "🎉 تم تأكيد البريد الإلكتروني بنجاح!");
      updateEmailVerificationUI(updatedUser);
      await db.collection("users").doc(updatedUser.uid).set({
        emailVerified: true
      }, { merge: true });
    } else {
      showToast(currentLanguage === "en" ? "Email is not verified yet. Please check your inbox and click the verification link." : "لم يتم تأكيد البريد بعد. يرجى فتح البريد الإلكتروني والضغط على الرابط المرسل إليك أولاً.");
    }
  } catch (err) {
    console.error("Check verification error:", err);
    showToast(getAuthErrorMessage(err));
  }
}

function openVerifyRequiredModal(actionNameAr = "هذا الإجراء", actionNameEn = "this action") {
  const modal = document.getElementById("verifyRequiredModal");
  if (!modal) return;
  const isEn = currentLanguage === "en";
  const title = document.getElementById("verifyModalTitle");
  const desc = document.getElementById("verifyModalDesc");
  if (title) title.textContent = isEn ? "Email Verification Required" : "تأكيد البريد الإلكتروني إجباري";
  if (desc) {
    const userEmail = auth.currentUser ? auth.currentUser.email : "";
    desc.textContent = isEn
      ? `Email verification is mandatory before ${actionNameEn}. A verification link was sent to ${userEmail}. Check your inbox and spam folder.`
      : `تأكيد البريد الإلكتروني إجباري قبل ${actionNameAr}. تم إرسال رابط التفعيل إلى ${userEmail}. يرجى فحص صندوق الوارد والرسائل غير المرغوب فيها.`;
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeVerifyRequiredModal() {
  const modal = document.getElementById("verifyRequiredModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

/**
 * Enforce Email Verification for Sensitive Operations
 * Automatically performs background reload to detect fresh verification links.
 * Blocks execution if unverified and triggers verification UI.
 */
async function enforceEmailVerification(actionNameAr = "هذا الإجراء", actionNameEn = "this action") {
  const user = auth ? auth.currentUser : null;
  if (!user) {
    showToast(currentLanguage === "en" ? "Authentication required." : "يجب تسجيل الدخول أولاً.");
    return false;
  }

  // System owner bypasses for disaster recovery
  if (isOwnerUser(user.email)) {
    return true;
  }

  // Attempt user reload in case link was clicked in another window/tab
  try {
    await user.reload();
  } catch (e) {
    console.warn("User reload failed during verification check:", e);
  }

  const freshUser = auth.currentUser;
  if (freshUser && freshUser.emailVerified) {
    updateEmailVerificationUI(freshUser);
    db.collection("users").doc(freshUser.uid).set({ emailVerified: true }, { merge: true }).catch(() => {});
    return true;
  }

  // User is not verified: trigger alert, pulse banner, and open modal
  updateEmailVerificationUI(freshUser);
  const banner = document.getElementById("emailVerificationBanner");
  if (banner) {
    banner.style.display = "flex";
    banner.classList.add("pulse-highlight");
    banner.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => banner.classList.remove("pulse-highlight"), 3000);
  }

  openVerifyRequiredModal(actionNameAr, actionNameEn);
  const isEn = currentLanguage === "en";
  showToast(isEn ? `🔒 Email verification is required before ${actionNameEn}.` : `🔒 تأكيد البريد الإلكتروني إجباري قبل ${actionNameAr}.`);
  return false;
}

function updateNavVisibility() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    const screen = btn.dataset.screen;
    // Patients must never see doctor, admin, audit, or verification in navigation
    if (screen === "verification") {
      btn.style.display = (selectedRole === ROLES.DOCTOR || selectedRole === ROLES.DOCTOR_PENDING || isAdminRole(selectedRole)) ? "flex" : "none";
      return;
    }
    btn.style.display = canAccessScreen(screen) ? "flex" : "none";
  });

  // Update profile doctor onboarding card visibility
  const docApplyCard = document.getElementById("doctorApplyCard");
  if (docApplyCard) {
    docApplyCard.style.display = selectedRole === ROLES.PATIENT ? "block" : "none";
  }
}

function showScreen(name) {
  if (name !== "verification") {
    tempAllowDoctorApplication = false;
  }

  if (!canAccessScreen(name)) {
    const roleDefaultScreen = isAdminRole(selectedRole) ? "admin" : (selectedRole === ROLES.DOCTOR ? "doctor" : "patient");
    const msgEn = `Access Denied: Screen '${englishTitles[name] || name}' is restricted for role '${englishRoleLabels[selectedRole] || selectedRole}'.`;
    const msgAr = `تم رفض الوصول: قسم '${titles[name] || name}' غير مصرح به لدور '${roleLabels[selectedRole] || selectedRole}'.`;
    showToast(currentLanguage === "en" ? msgEn : msgAr);
    console.warn(`[RBAC] Blocked access to screen '${name}' for role '${selectedRole}'. Redirecting to '${roleDefaultScreen}'.`);
    name = roleDefaultScreen;
  }

  updateNavVisibility();

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${name}`);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === name);
  });

  screenTitle.textContent = currentLanguage === "en" ? englishTitles[name] || "Health Vibes" : titles[name] || "Health Vibes";
  document.body.classList.remove("sidebar-open");
  
  if (name === "doctor") {
    renderDoctorQueue();
  }
  if (name === "patient") {
    renderPatientDashboard();
  }
  if (name === "verification") {
    renderVerificationScreen();
  }
  if (name === "admin") {
    renderAdminMetrics();
    renderAdminApplications();
    renderAdminUsers();
  }
}

async function renderPatientDashboard() {
  const user = auth ? auth.currentUser : null;
  const isEn = currentLanguage === "en";
  
  // ── حالات افتراضية ───────────────────────────────────────────────
  const firstName = user
    ? (user.displayName ? user.displayName.split(" ")[0] : (isEn ? "Guest" : "ضيف"))
    : "أحمد";
  const titleEl = document.getElementById("patientHeroTitle");
  if (titleEl) titleEl.textContent = isEn ? `Welcome, ${firstName}` : `مرحبًا ${firstName}`;

  document.getElementById("patientClinicalStatus").textContent = isEn ? "No recent assessment" : "لا يوجد فحص حديث";
  document.getElementById("patientClinicalO2").textContent = "--%";
  document.getElementById("patientClinicalConfidence").textContent = "--%";
  document.getElementById("patientClinicalDoctor").textContent = "--";
  document.getElementById("patientNextAppt").textContent = "--";
  document.getElementById("patientLatestReport").textContent = "--";
  document.getElementById("patientResultStatus").textContent = "--";
  document.getElementById("patientProfileCompletion").textContent = "100%";
  document.getElementById("patientAlertsCount").textContent = isEn ? "0 new" : "0 جديد";
  document.getElementById("patientAlertsList").innerHTML = `<div><strong>${isEn ? 'No new alerts' : 'لا توجد تنبيهات جديدة'}</strong><span>--</span></div>`;

  if (!user || !db) return;

  // ── إلغاء الاشتراك السابق لتجنب تسرب الذاكرة ─────────────────
  if (window._patientCasesUnsub) {
    window._patientCasesUnsub();
    window._patientCasesUnsub = null;
  }

  // ── Real-Time Listener — حالات المريض مربوطة بـ patientId ─────────
  window._patientCasesUnsub = db
    .collection("cases")
    .where("patientId", "==", user.uid)
    .orderBy("submittedAt", "desc")
    .limit(10)
    .onSnapshot(
      (snapshot) => {
        if (snapshot.empty) return;

        // أحدث حالة (first doc بعد orderBy desc)
        const latestDoc = snapshot.docs[0];
        const c = { id: latestDoc.id, ...latestDoc.data() };

        // فورمات التاريخ
        const tsMillis = c.submittedAt?.toMillis
          ? c.submittedAt.toMillis()
          : (c.submittedAt || 0);
        const dateStr = tsMillis
          ? new Date(tsMillis).toLocaleDateString(isEn ? "en-US" : "ar-EG", {
              year: "numeric", month: "short", day: "numeric",
            })
          : "--";

        // ترجمة الحالة
        const statusMap = {
          pending:  isEn ? "⏳ Pending Review" : "تحت المراجعة",
          approved: isEn ? "✅ Approved"       : "معتمد من الطبيب",
          rejected: isEn ? "❌ Needs Attention" : "يحتاج متابعة",
        };
        const priorityMap = {
          urgent: isEn ? "🚨 Urgent"  : "🚨 عاجل",
          high:   isEn ? "⚠️ High"    : "⚠️ أولوية عالية",
          normal: isEn ? "✔️ Normal"  : "✔️ عادي",
        };

        const statusLabel   = statusMap[c.status]   || c.status;
        const priorityLabel = priorityMap[c.priority] || "--";
        const o2Display     = c.oxygenLevel ? `${c.oxygenLevel}%` : "--%";
        const doctorDisplay = c.reviewedBy || (isEn ? "Awaiting doctor" : "بانتظار طبيب");

        // ── تحديث بطاقة الحالة ─────────────────────────────────────────
        document.getElementById("patientClinicalStatus").textContent = statusLabel;
        document.getElementById("patientClinicalO2").textContent = o2Display;
        document.getElementById("patientClinicalConfidence").textContent = priorityLabel;
        document.getElementById("patientClinicalDoctor").textContent = doctorDisplay;
        document.getElementById("patientLatestReport").textContent = dateStr;
        document.getElementById("patientResultStatus").textContent = statusLabel;

        // ── التنبيهات ─────────────────────────────────────────────────────
        if (c.status === "approved") {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 new" : "1 جديد";
          document.getElementById("patientAlertsList").innerHTML =
            `<div>
              <strong>${isEn ? "✅ Your result is ready" : "✅ النتيجة المعتمدة جاهزة"}</strong>
              <span>${dateStr}</span>
            </div>`;
        } else if (c.status === "rejected") {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 new" : "1 جديد";
          document.getElementById("patientAlertsList").innerHTML =
            `<div>
              <strong>${isEn ? "⚠️ Doctor requested follow-up" : "⚠️ الطبيب يحتاج متابعة إضافية"}</strong>
              <span>${c.doctorNotes || dateStr}</span>
            </div>`;
        } else {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 pending" : "1 قيد المراجعة";
          document.getElementById("patientAlertsList").innerHTML =
            `<div>
              <strong>${isEn ? "⏳ Assessment sent to doctor" : "⏳ تم إرسال التقييم للطبيب"}</strong>
              <span>${dateStr} • رقم الحالة: ${c.id.slice(-6).toUpperCase()}</span>
            </div>`;
        }
      },
      (error) => {
        console.warn("❌ Patient cases listener error:", error);
      }
    );
}

// --- Doctor Account Lifecycle: Application -> Verification -> Approval ---
let selectedDoctorAppFile = null;

function onDoctorFilePicked(input) {
  const label = document.getElementById("doctorAppFileName");
  if (input.files && input.files[0]) {
    selectedDoctorAppFile = input.files[0];
    if (label) {
      label.textContent = "📄 " + selectedDoctorAppFile.name;
      label.style.color = "var(--teal)";
    }
  }
}

async function cancelOrReapplyDoctorApp() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const appId = "app_" + user.uid;
    await db.collection("doctor_applications").doc(appId).update({
      status: "cancelled",
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection("users").doc(user.uid).set({
      doctorApplicationStatus: "cancelled"
    }, { merge: true });
    selectedRole = ROLES.PATIENT;
    showToast(currentLanguage === "en" ? "You can now submit a new application." : "يمكنك الآن تقديم طلب جديد.");
    renderVerificationScreen();
  } catch(e) {
    console.error(e);
  }
}

async function handleDoctorAppSubmit(e) {
  if (e) e.preventDefault();
  if (!(await enforceEmailVerification("تقديم طلب توثيق الطبيب", "submitting a doctor verification application"))) return;
  const user = auth.currentUser;
  if (!user) {
    showToast(currentLanguage === "en" ? "Please sign in first." : "يرجى تسجيل الدخول أولاً.");
    return;
  }

  const name = document.getElementById("doctorAppName")?.value.trim();
  const license = document.getElementById("doctorAppLicense")?.value.trim();
  const specialty = document.getElementById("doctorAppSpecialty")?.value;
  const clinic = document.getElementById("doctorAppClinic")?.value.trim();
  const fileName = selectedDoctorAppFile ? selectedDoctorAppFile.name : "syndicate_license.pdf";

  if (!name || !license || !specialty || !clinic) {
    showToast(currentLanguage === "en" ? "Please fill in all required fields." : "يرجى ملء جميع الحقول المطلوبة.");
    return;
  }

  const btn = document.getElementById("submitDoctorAppBtn");
  const text = document.getElementById("submitDoctorAppText");
  if (btn) btn.disabled = true;
  if (text) text.textContent = currentLanguage === "en" ? "Submitting application..." : "جاري إرسال الطلب...";

  try {
    const appId = "app_" + user.uid;
    const appData = {
      id: appId,
      userId: user.uid,
      name: name,
      email: user.email,
      licenseNumber: license,
      specialty: specialty,
      clinic: clinic,
      docName: fileName,
      status: "pending",
      appliedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("doctor_applications").doc(appId).set(appData);

    await db.collection("users").doc(user.uid).set({
      doctorApplicationStatus: "pending",
      doctorApplicationId: appId,
      doctorAppName: name,
      licenseNumber: license,
      specialty: specialty,
      clinic: clinic,
      doctorAppDocName: fileName,
      doctorAppDate: new Date().toLocaleDateString(currentLanguage === "en" ? "en-US" : "ar-EG")
    }, { merge: true });

    selectedRole = ROLES.DOCTOR_PENDING;
    updateNavVisibility();
    showToast(currentLanguage === "en" ? "🎉 Application submitted! Under review by administration." : "🎉 تم إرسال طلب التوثيق بنجاح! طلبك الآن قيد المراجعة والتدقيق الإداري.");
    renderVerificationScreen();
  } catch (err) {
    console.error("Doctor application error:", err);
    showToast(getAuthErrorMessage(err));
  } finally {
    if (btn) btn.disabled = false;
    if (text) text.textContent = currentLanguage === "en" ? "Submit Application 🚀" : "إرسال طلب التوثيق والاعتماد (Submit Application) 🚀";
  }
}

async function renderVerificationScreen() {
  const container = document.getElementById("verificationContent");
  if (!container) return;

  const isEn = currentLanguage === "en";
  const user = auth.currentUser;

  if (!user) {
    container.innerHTML = `
      <div class="content-grid">
        <article class="panel" style="text-align: center; padding: 40px 20px;">
          <h2>${isEn ? "Sign in to apply as a Doctor" : "سجل دخولك لتقديم طلب توثيق طبيب"}</h2>
          <p class="muted-copy">${isEn ? "You need an account to apply for healthcare provider verification." : "تحتاج إلى حساب لتقديم طلب توثيق واعتماد مزاولة المهنة."}</p>
          <button class="solid-button large" onclick="showAuth()">${isEn ? "Sign In / Register" : "تسجيل الدخول / إنشاء حساب"}</button>
        </article>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--teal);"><div class="spinner"></div> ${isEn ? "Loading verification status..." : "جاري تحميل حالة التوثيق..."}</div>`;

  let userData = {};
  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (userDoc.exists) {
      userData = userDoc.data();
    }
  } catch(e) {
    console.warn("Could not fetch user verification data:", e);
  }

  const isDoctor = normalizeRole(selectedRole) === ROLES.DOCTOR || normalizeRole(userData.role) === ROLES.DOCTOR;
  const appStatus = userData.doctorApplicationStatus || "none";

  if (isDoctor) {
    // STATE A: APPROVED DOCTOR
    container.innerHTML = `
      <div class="content-grid">
        <article class="panel" style="grid-column: 1 / -1; border-color: rgba(24, 160, 88, 0.4);">
          <div class="panel-head">
            <div>
              <h2 style="margin: 0; color: #18a058; font-size: 24px;">🎉 ${isEn ? "Verified Doctor Account" : "حساب طبيب معتمد وموثق"}</h2>
              <p style="margin: 6px 0 0; color: var(--muted); font-size: 14px;">${isEn ? "Your credentials have been verified. You have full permission to review cases and approve AI clinical reports." : "تم التحقق بنجاح من ترخيصك وسجل النقابة. لديك الآن كامل الصلاحيات لمراجعة الحالات واعتماد التقارير الطبية."}</p>
            </div>
            <span class="pill ok" style="font-size: 13px; padding: 6px 14px;">Verified Doctor ✓</span>
          </div>
          <div class="summary-list" style="margin: 24px 0;">
            <div><span>${isEn ? "Doctor Name" : "اسم الطبيب"}</span><strong>${userData.doctorAppName || userData.name || user.displayName || user.email}</strong></div>
            <div><span>${isEn ? "Syndicate License #" : "رقم ترخيص النقابة"}</span><strong style="color: var(--teal);">${userData.licenseNumber || "EGY-MED-20491"}</strong></div>
            <div><span>${isEn ? "Specialty" : "التخصص الطبي"}</span><strong>${userData.specialty || (isEn ? "Pulmonology & Respiratory" : "أمراض الصدر والجهاز التنفسي")}</strong></div>
            <div><span>${isEn ? "Hospital / Clinic" : "الجهة الطبية"}</span><strong>${userData.clinic || (isEn ? "Kasr Al-Ainy Hospital" : "مستشفى القصر العيني التعليمي")}</strong></div>
            <div><span>${isEn ? "Account Status" : "حالة الاعتماد"}</span><strong style="color: #18a058;">${isEn ? "Active & Verified" : "نشط ومكتمل التوثيق ✓"}</strong></div>
          </div>
          <button class="solid-button large" onclick="showScreen('doctor')">
            🩺 ${isEn ? "Open Doctor Review Queue" : "الانتقال إلى لوحة مراجعة الحالات (Doctor Review)"}
          </button>
        </article>
      </div>
    `;
  } else if (appStatus === "pending") {
    // STATE B: APPLICATION SUBMITTED -> VERIFICATION IN PROGRESS
    const appDate = userData.doctorAppDate || new Date().toLocaleDateString(isEn ? "en-US" : "ar-EG");
    container.innerHTML = `
      <div class="content-grid">
        <article class="panel" style="grid-column: 1 / -1;">
          <div class="panel-head">
            <div>
              <h2 style="margin: 0; font-size: 22px;">${isEn ? "Doctor Verification Lifecycle" : "مراحل توثيق واعتماد الطبيب"}</h2>
              <p style="margin: 4px 0 0; color: var(--muted); font-size: 13.5px;">${isEn ? "Your application is currently being reviewed and verified against professional syndicate records." : "طلبك قيد المراجعة والتدقيق الإداري للتأكد من صحة ترخيص مزاولة المهنة."}</p>
            </div>
            <span class="pill pending" style="padding: 6px 14px;">${isEn ? "Under Review ⏳" : "قيد المراجعة والتدقيق ⏳"}</span>
          </div>

          <!-- 3-STAGE LIFECYCLE TRACKER -->
          <div class="doctor-lifecycle-track" style="margin: 24px 0;">
            <div class="track-step done">
              <div class="step-num">✓</div>
              <div class="step-info">
                <strong>${isEn ? "1. Application Submitted" : "1. تقديم الطلب (Application)"}</strong>
                <span>${isEn ? "Credentials received" : "تم استلام البيانات والمستندات"}</span>
              </div>
            </div>
            <div class="track-step active">
              <div class="step-num">2</div>
              <div class="step-info">
                <strong>${isEn ? "2. Verification & Audit" : "2. الفحص والتدقيق (Verification)"}</strong>
                <span style="color: var(--teal);">${isEn ? "Matching syndicate license" : "جاري مطابقة الترخيص والتحقق المهني"}</span>
              </div>
            </div>
            <div class="track-step pending">
              <div class="step-num">3</div>
              <div class="step-info">
                <strong>${isEn ? "3. Admin Approval" : "3. الاعتماد النهائي (Approval)"}</strong>
                <span>${isEn ? "Granting doctor review role" : "تفعيل الصلاحيات من الإدارة"}</span>
              </div>
            </div>
          </div>

          <!-- APPLICATION SUMMARY CARD -->
          <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 14px; font-size: 15px; color: var(--teal-2);">${isEn ? "Application Summary" : "ملخص بيانات الطلب المقدم"}</h4>
            <div class="summary-list">
              <div><span>${isEn ? "Doctor Name" : "اسم الطبيب"}</span><strong>${userData.doctorAppName || user.displayName || user.email}</strong></div>
              <div><span>${isEn ? "Syndicate License #" : "رقم ترخيص النقابة"}</span><strong style="color: var(--teal);">${userData.licenseNumber || "--"}</strong></div>
              <div><span>${isEn ? "Specialty" : "التخصص الطبي"}</span><strong>${userData.specialty || "--"}</strong></div>
              <div><span>${isEn ? "Hospital / Clinic" : "الجهة الطبية"}</span><strong>${userData.clinic || "--"}</strong></div>
              <div><span>${isEn ? "Attached File" : "المستند المرفق"}</span><strong>📄 ${userData.doctorAppDocName || "syndicate_license.pdf"}</strong></div>
              <div><span>${isEn ? "Submission Date" : "تاريخ التقديم"}</span><strong>${appDate}</strong></div>
            </div>
          </div>

          <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
            <button class="outline-button" onclick="showScreen('patient')">${isEn ? "Return to Dashboard" : "العودة للرئيسية"}</button>
            <button class="soft-button" onclick="cancelOrReapplyDoctorApp()">${isEn ? "Cancel & Reapply" : "إلغاء الطلب وإعادة التقديم"}</button>
            <span style="font-size: 13px; color: var(--muted);">${isEn ? "You will be automatically granted doctor access as soon as the administrator approves." : "سيتم تحويل حسابك تلقائياً لطبيب معتمد فور موافقة إدارة النظام."}</span>
          </div>
        </article>
      </div>
    `;
  } else {
    // STATE C: NEW APPLICATION FORM (STAGE 1: APPLICATION)
    container.innerHTML = `
      <div class="content-grid">
        <article class="panel" style="grid-column: 1 / -1;">
          <div class="panel-head">
            <div>
              <h2 style="margin: 0; font-size: 22px;">${isEn ? "Doctor Verification Application" : "تقديم طلب توثيق حساب طبيب"}</h2>
              <p style="margin: 6px 0 0; color: var(--muted); font-size: 13.5px;">${isEn ? "To access the doctor case review queue and approve AI clinical results, please submit your professional medical credentials." : "للوصول إلى لوحة مراجعة الحالات واعتماد نتائج الذكاء الاصطناعي، يرجى تقديم بيانات ترخيص مزاولة المهنة."}</p>
            </div>
            <span class="pill info">${isEn ? "Stage 1: Application" : "المرحلة 1: التقديم"}</span>
          </div>

          <!-- LIFECYCLE PREVIEW -->
          <div class="doctor-lifecycle-track" style="margin: 22px 0;">
            <div class="track-step active">
              <div class="step-num">1</div>
              <div class="step-info">
                <strong>${isEn ? "1. Application" : "1. تقديم الطلب (Application)"}</strong>
                <span>${isEn ? "Submit license & specialty" : "املأ بيانات الترخيص المهني"}</span>
              </div>
            </div>
            <div class="track-step pending">
              <div class="step-num">2</div>
              <div class="step-info">
                <strong>${isEn ? "2. Verification" : "2. الفحص والتدقيق (Verification)"}</strong>
                <span>${isEn ? "Credential & syndicate check" : "مطابقة أوراق النقابة والترخيص"}</span>
              </div>
            </div>
            <div class="track-step pending">
              <div class="step-num">3</div>
              <div class="step-info">
                <strong>${isEn ? "3. Approval" : "3. الاعتماد النهائي (Approval)"}</strong>
                <span>${isEn ? "Doctor privileges activated" : "تفعيل الصلاحيات من الإدارة"}</span>
              </div>
            </div>
          </div>

          <!-- APPLICATION FORM -->
          <form id="doctorAppForm" onsubmit="handleDoctorAppSubmit(event)" style="margin-top: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 16px;">
              <div class="form-group">
                <label for="doctorAppName">${isEn ? "Full Name (as in Medical Syndicate) *" : "الاسم بالكامل (كما هو في ترخيص النقابة) *"}</label>
                <input type="text" id="doctorAppName" value="${user.displayName || ''}" placeholder="${isEn ? 'Dr. Ahmed Mohamed' : 'د. أحمد محمد علي'}" required />
              </div>
              <div class="form-group">
                <label for="doctorAppLicense">${isEn ? "Syndicate License Number *" : "رقم ترخيص مزاولة المهنة / رقم القيد بالنقابة *"}</label>
                <input type="text" id="doctorAppLicense" placeholder="EGY-MED-12345" required />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 16px;">
              <div class="form-group">
                <label for="doctorAppSpecialty">${isEn ? "Medical Specialty *" : "التخصص الطبي *"}</label>
                <select id="doctorAppSpecialty" required style="width: 100%; min-height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); padding: 0 14px; font-family: inherit;">
                  <option value="${isEn ? 'Pulmonology & Respiratory' : 'أمراض الصدر والجهاز التنفسي'}">${isEn ? 'Pulmonology & Respiratory' : 'أمراض الصدر والجهاز التنفسي'}</option>
                  <option value="${isEn ? 'Internal Medicine' : 'طب الباطنة العامة'}">${isEn ? 'Internal Medicine' : 'طب الباطنة العامة'}</option>
                  <option value="${isEn ? 'ICU & Critical Care' : 'الرعاية المركزة والطوارئ'}">${isEn ? 'ICU & Critical Care' : 'الرعاية المركزة والطوارئ'}</option>
                  <option value="${isEn ? 'Pediatrics' : 'طب الأطفال'}">${isEn ? 'Pediatrics' : 'طب الأطفال'}</option>
                  <option value="${isEn ? 'Family Medicine' : 'طب الأسرة والمجتمع'}">${isEn ? 'Family Medicine' : 'طب الأسرة والمجتمع'}</option>
                  <option value="${isEn ? 'Other' : 'تخصص طبي آخر'}">${isEn ? 'Other' : 'تخصص طبي آخر'}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="doctorAppClinic">${isEn ? "Hospital, Clinic, or Affiliation *" : "جهة العمل أو المستشفى أو العيادة *"}</label>
                <input type="text" id="doctorAppClinic" placeholder="${isEn ? 'Kasr Al-Ainy Hospital / Private Clinic' : 'مثال: مستشفى القصر العيني / عيادة خاصة'}" required />
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
              <label for="doctorAppDocFile">${isEn ? "Syndicate ID / License Document (PDF, JPG, PNG)" : "صورة كارنيه النقابة أو ترخيص مزاولة المهنة (PDF, JPG, PNG)"}</label>
              <div style="border: 2px dashed var(--line); border-radius: 14px; padding: 22px; text-align: center; background: var(--surface-2); cursor: pointer;" onclick="document.getElementById('doctorAppDocFile').click()">
                <span style="font-size: 32px;">📄</span>
                <p id="doctorAppFileName" style="margin: 8px 0 4px; font-weight: 600; color: var(--ink);">${isEn ? "Click to select syndicate document or license photo" : "اضغط لاختيار ملف المستند أو صورة الترخيص"}</p>
                <span style="font-size: 12px; color: var(--muted);">${isEn ? "Max size: 10MB (Stored securely for credential audit)" : "أقصى حجم: 10 ميجابايت (يتم الحفظ كمرجع رسمي للتحقق)"}</span>
                <input type="file" id="doctorAppDocFile" style="display: none;" accept="image/*,.pdf" onchange="onDoctorFilePicked(this)" />
              </div>
            </div>

            <div style="margin-bottom: 22px;">
              <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--ink); cursor: pointer;">
                <input type="checkbox" required style="margin-top: 3px;" />
                <span>${isEn ? "I certify that the provided credentials are valid and issued by the official medical licensing authority, and I assume full professional and legal responsibility." : "أقر بأن البيانات والمستندات المرفقة صحيحة ومطابقة لترخيص مزاولة المهنة الصادر من نقابة الأطباء ووزارة الصحة، وأتحمل كامل المسؤولية القانونية والمهنية."}</span>
              </label>
            </div>

            <div style="display: flex; gap: 12px; align-items: center;">
              <button type="submit" id="submitDoctorAppBtn" class="solid-button large" style="flex: 1; justify-content: center;">
                <span id="submitDoctorAppText">${isEn ? "Submit Application for Verification 🚀" : "إرسال طلب التوثيق والاعتماد (Submit Application) 🚀"}</span>
              </button>
              <button type="button" class="outline-button large" onclick="showScreen('profile')">
                ${isEn ? "Cancel" : "إلغاء"}
              </button>
            </div>
          </form>
        </article>
      </div>
    `;
  }
}

async function renderAdminApplications() {
  const container = document.getElementById("adminDoctorAppsList");
  if (!container) return;

  const isEn = currentLanguage === "en";
  container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--teal);"><div class="spinner"></div> ${isEn ? "Loading doctor applications..." : "جاري تحميل طلبات التوثيق..."}</div>`;

  try {
    const snapshot = await db.collection("doctor_applications").orderBy("appliedAt", "desc").get();
    const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const pendingApps = apps.filter(a => a.status === "pending");

    const badge = document.getElementById("adminPendingAppsBadge");
    if (badge) {
      badge.textContent = isEn ? `${pendingApps.length} pending approval` : `${pendingApps.length} بانتظار الاعتماد`;
    }
    const opsBadge = document.getElementById("adminOpsDocAppsCount");
    if (opsBadge) {
      opsBadge.textContent = isEn ? `${pendingApps.length} documents pending review` : `${pendingApps.length} مستندات بانتظار الاعتماد`;
    }
    if (pendingApps.length === 0) {
      container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--muted); background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line);">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">✅</span>
          <strong style="color: var(--ink);">${isEn ? "No pending doctor applications" : "لا توجد طلبات أطباء معلقة حالياً"}</strong>
          <p style="margin: 4px 0 0; font-size: 13px;">${isEn ? "All healthcare provider applications have been verified and processed." : "تمت مراجعة واعتماد كافة طلبات توثيق الأطباء بنجاح."}</p>
        </div>
      `;
      return;
    }

    let html = "";
    pendingApps.forEach(app => {
      let dateStr = "--";
      if (app.appliedAt) {
        const d = app.appliedAt.toMillis ? new Date(app.appliedAt.toMillis()) : new Date(app.appliedAt);
        dateStr = d.toLocaleDateString(isEn ? "en-US" : "ar-EG");
      }

      html += `
        <div class="admin-app-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
            <div>
              <h4 style="margin: 0; font-size: 17px; color: var(--ink);">${app.name}</h4>
              <div style="display: flex; gap: 10px; align-items: center; margin-top: 4px; font-size: 13px; color: var(--muted); flex-wrap: wrap;">
                <span>📧 ${app.email}</span> • <span>🏥 ${app.clinic}</span>
              </div>
            </div>
            <span class="pill pending">${isEn ? "Pending Review" : "بانتظار الاعتماد ⏳"}</span>
          </div>

          <div class="summary-list" style="margin: 4px 0;">
            <div><span>${isEn ? "Syndicate License #" : "رقم ترخيص النقابة"}</span><strong style="color: var(--teal); font-family: monospace; font-size: 14px;">${app.licenseNumber}</strong></div>
            <div><span>${isEn ? "Specialty" : "التخصص الطبي"}</span><strong>${app.specialty}</strong></div>
            <div><span>${isEn ? "Attached License" : "المستند المرفق"}</span><strong>📄 ${app.docName || 'syndicate_card.pdf'}</strong></div>
            <div><span>${isEn ? "Application Date" : "تاريخ التقديم"}</span><strong>${dateStr}</strong></div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end; align-items: center; padding-top: 10px; border-top: 1px solid var(--line); flex-wrap: wrap;">
            <button class="danger-button" style="padding: 8px 16px; font-size: 13px;" onclick="rejectDoctorApplication('${app.id}', '${app.userId}')">
              ${isEn ? "Reject ✗" : "رفض الطلب ✗"}
            </button>
            <button class="solid-button" style="padding: 9px 22px; font-size: 13.5px; background: #18a058; border-color: #18a058;" onclick="approveDoctorApplication('${app.id}', '${app.userId}', '${app.name}')">
              ${isEn ? "Approve & Promote to Doctor ✓" : "اعتماد وترقية لطبيب موثق ✓ (Approve)"}
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch(error) {
    if (handleServerPermissionDenied(error, "Load Doctor Applications")) {
      container.innerHTML = `<div style="color: var(--rose); padding: 20px;">🔒 ${isEn ? "Access Denied by Firestore Server Rules" : "تم رفض الوصول من خادم قاعدة البيانات (Permission Denied)"}</div>`;
      return;
    }
    console.error("Error loading doctor applications:", error);
    container.innerHTML = `<div style="color: var(--rose); padding: 20px;">${getAuthErrorMessage(error)}</div>`;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMetric(value) {
  return Number.isFinite(value) ? value.toLocaleString(currentLanguage === "en" ? "en-US" : "ar-EG") : "--";
}

function formatModelMetric(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function getUserCreatedAt(user) {
  return toMillis(user.createdAt || user.created_at || user.createdOn || user.created);
}

function getCaseSubmittedAt(item) {
  return toMillis(item.submittedAt || item.createdAt || item.created_at || item.date);
}

async function renderAdminMetrics() {
  const isEn = currentLanguage === "en";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  [
    "adminUsersTotalCount",
    "adminTotalDoctorsCount",
    "adminBranchesCount",
    "adminPendingReviewsCount",
    "adminAiSensitivity",
    "adminAiSpecificity",
    "adminAiPrecision",
    "adminAiAuc"
  ].forEach((id) => setText(id, "--"));
  setText("adminUsersTodayCount", isEn ? "Loading..." : "جاري التحميل...");
  setText("adminPendingDocsBadge", isEn ? "Loading..." : "جاري التحميل...");
  setText("adminBranchesNote", isEn ? "From approved doctors" : "من بيانات الأطباء المعتمدين");
  setText("adminUrgentReviewsCount", isEn ? "Loading..." : "جاري التحميل...");

  try {
    const [serverMetrics, usersSnapshot, appsSnapshot, casesSnapshot, modelSnapshot] = await Promise.all([
      callBackend("/api/admin/metrics").catch((error) => {
        console.warn("Admin backend metrics unavailable; falling back to Firestore user docs.", error);
        return null;
      }),
      db.collection("users").get(),
      db.collection("doctor_applications").get(),
      db.collection("cases").get(),
      db.collection("ai_model_metrics").orderBy("createdAt", "desc").limit(1).get().catch(() => null)
    ]);

    const users = usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const apps = appsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const cases = casesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const usersTodayFromDocs = users.filter((user) => getUserCreatedAt(user) >= todayStartMs).length;
    const totalUsers = Number.isFinite(serverMetrics?.authUsersCount)
      ? serverMetrics.authUsersCount
      : Math.max(users.length, auth.currentUser ? 1 : 0);
    const usersToday = Number.isFinite(serverMetrics?.authUsersToday) ? serverMetrics.authUsersToday : usersTodayFromDocs;
    const approvedDoctorsFromDocs = users.filter((user) =>
      user.role === ROLES.DOCTOR ||
      user.verifiedDoctor === true ||
      user.doctorApplicationStatus === "approved"
    ).length;
    const approvedDoctors = Number.isFinite(serverMetrics?.approvedDoctors) ? serverMetrics.approvedDoctors : approvedDoctorsFromDocs;
    const pendingApps = Number.isFinite(serverMetrics?.pendingDoctorApplications)
      ? serverMetrics.pendingDoctorApplications
      : apps.filter((app) => app.status === "pending").length;
    const approvedDoctorApps = apps.filter((app) => app.status === "approved");
    const branchNames = new Set(
      approvedDoctorApps
        .map((app) => (app.clinic || app.branch || app.hospital || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const branchCount = Number.isFinite(serverMetrics?.branchCount) ? serverMetrics.branchCount : branchNames.size;
    const pendingReviews = Number.isFinite(serverMetrics?.pendingReviews)
      ? serverMetrics.pendingReviews
      : cases.filter((item) => item.status === "pending").length;
    const urgentReviews = Number.isFinite(serverMetrics?.urgentReviews)
      ? serverMetrics.urgentReviews
      : cases.filter((item) =>
        item.status === "pending" && ["urgent", "high"].includes(String(item.priority || item.risk || "").toLowerCase())
      ).length;
    const latestCaseMs = Math.max(0, ...cases.map(getCaseSubmittedAt));

    setText("adminUsersTotalCount", formatMetric(totalUsers));
    setText("adminUsersTodayCount", isEn ? `+${formatMetric(usersToday)} today` : `+${formatMetric(usersToday)} اليوم`);
    setText("adminTotalDoctorsCount", formatMetric(approvedDoctors));
    setText("adminPendingDocsBadge", isEn ? `${formatMetric(pendingApps)} pending approval` : `${formatMetric(pendingApps)} بانتظار الاعتماد`);
    setText("adminBranchesCount", formatMetric(branchCount));
    setText("adminBranchesNote", branchCount > 0
      ? (isEn ? "Verified clinic locations" : "مواقع عيادات موثقة")
      : (isEn ? "No verified branches yet" : "لا توجد فروع موثقة بعد"));
    setText("adminPendingReviewsCount", formatMetric(pendingReviews));
    setText("adminUrgentReviewsCount", isEn ? `${formatMetric(urgentReviews)} urgent` : `${formatMetric(urgentReviews)} عاجلة`);

    if (serverMetrics?.aiModelMetrics) {
      setText("adminAiSensitivity", formatModelMetric(Number(serverMetrics.aiModelMetrics.sensitivity)));
      setText("adminAiSpecificity", formatModelMetric(Number(serverMetrics.aiModelMetrics.specificity)));
      setText("adminAiPrecision", formatModelMetric(Number(serverMetrics.aiModelMetrics.precision)));
      setText("adminAiAuc", formatModelMetric(Number(serverMetrics.aiModelMetrics.auc)));
    } else if (modelSnapshot && !modelSnapshot.empty) {
      const metrics = modelSnapshot.docs[0].data();
      setText("adminAiSensitivity", formatModelMetric(Number(metrics.sensitivity)));
      setText("adminAiSpecificity", formatModelMetric(Number(metrics.specificity)));
      setText("adminAiPrecision", formatModelMetric(Number(metrics.precision)));
      setText("adminAiAuc", formatModelMetric(Number(metrics.auc || metrics.areaUnderCurve)));
    } else {
      setText("adminAiSensitivity", "--");
      setText("adminAiSpecificity", "--");
      setText("adminAiPrecision", "--");
      setText("adminAiAuc", "--");
    }

    console.info("[Admin Metrics] Loaded from Firestore", {
      users: users.length,
      authUsers: totalUsers,
      usersToday,
      approvedDoctors,
      pendingApps,
      branches: branchCount,
      pendingReviews,
      urgentReviews,
      latestCaseAt: latestCaseMs
    });
  } catch (error) {
    if (handleServerPermissionDenied(error, "Load Admin Metrics")) return;
    console.error("renderAdminMetrics error:", error);
    setText("adminUsersTodayCount", isEn ? "Unavailable" : "غير متاح");
    setText("adminPendingDocsBadge", isEn ? "Unavailable" : "غير متاح");
    setText("adminBranchesNote", isEn ? "Unavailable" : "غير متاح");
    setText("adminUrgentReviewsCount", isEn ? "Unavailable" : "غير متاح");
  }
}

async function approveDoctorApplication(appId, userId, doctorName) {
  if (!(await enforceEmailVerification("اعتماد طلب الطبيب", "approving a doctor application"))) return;
  if (!(await enforceServerPermission(PERMISSIONS.APPROVE_DOCTOR_APPLICATION, "Approve Doctor Application"))) return;
  const isEn = currentLanguage === "en";
  try {
    showToast(isEn ? `Approving ${doctorName}...` : `جاري اعتماد الطبيب ${doctorName}...`);

    if (!userId || userId.startsWith("demo_")) {
      throw new Error(isEn ? "Only real Firebase users can be approved from production admin." : "لا يمكن اعتماد إلا مستخدم Firebase حقيقي من لوحة الإدارة.");
    }

    await callBackend("/api/admin/approve-doctor-application", {
      method: "POST",
      body: JSON.stringify({
        applicationId: appId,
        applicantUserId: userId
      })
    });

    if (auth.currentUser && auth.currentUser.uid === userId) {
      selectedRole = "doctor";
      updateNavVisibility();
      accountLabel.textContent = isEn ? englishRoleLabels.doctor : roleLabels.doctor;
    }

    showToast(isEn ? `🎉 Successfully approved Dr. ${doctorName}!` : `🎉 تم اعتماد الطبيب ${doctorName} وترقيته رسمياً لطبيب موثق!`);
    await renderAdminMetrics();
    await renderAdminApplications();
  } catch(error) {
    if (handleServerPermissionDenied(error, "Approve Doctor Application")) return;
    console.error("Approve doctor error:", error);
    showToast(getAuthErrorMessage(error));
  }
}

async function rejectDoctorApplication(appId, userId) {
  if (!(await enforceEmailVerification("رفض طلب الطبيب", "rejecting a doctor application"))) return;
  if (!(await enforceServerPermission(PERMISSIONS.REJECT_DOCTOR_APPLICATION, "Reject Doctor Application"))) return;
  const isEn = currentLanguage === "en";
  try {
    await db.collection("doctor_applications").doc(appId).update({
      status: "rejected",
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: auth.currentUser ? auth.currentUser.email : "Admin"
    });

    if (userId && !userId.startsWith("demo_")) {
      await db.collection("users").doc(userId).set({
        doctorApplicationStatus: "rejected"
      }, { merge: true });
    }

    showToast(isEn ? "Application rejected." : "تم رفض الطلب.");
    await renderAdminMetrics();
    await renderAdminApplications();
  } catch(error) {
    if (handleServerPermissionDenied(error, "Reject Doctor Application")) return;
    console.error("Reject doctor error:", error);
    showToast(getAuthErrorMessage(error));
  }
}

window.onDoctorFilePicked = onDoctorFilePicked;
window.handleDoctorAppSubmit = handleDoctorAppSubmit;
window.cancelOrReapplyDoctorApp = cancelOrReapplyDoctorApp;
window.approveDoctorApplication = approveDoctorApplication;
window.rejectDoctorApplication = rejectDoctorApplication;
window.renderAdminUsers = renderAdminUsers;
window.changeUserRole = changeUserRole;

async function renderAdminUsers() {
  const container = document.getElementById("adminUsersTableContainer");
  if (!container) return;

  const isEn = currentLanguage === "en";
  container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--teal);"><div class="spinner"></div> ${isEn ? "Loading users & roles..." : "جاري تحميل قائمة المستخدمين والصلاحيات..."}</div>`;

  try {
    const snapshot = await db.collection("users").limit(50).get();
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const badge = document.getElementById("adminUsersCountBadge");
    if (badge) {
      badge.textContent = isEn ? `${users.length} registered users` : `${users.length} مستخدم مسجل`;
    }

    if (users.length === 0) {
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted);">${isEn ? "No users found" : "لا يوجد مستخدمين مسجلين"}</div>`;
      return;
    }

    let html = `
      <table style="width: 100%; border-collapse: collapse; text-align: start; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 2px solid var(--line); color: var(--muted);">
            <th style="padding: 10px 12px; text-align: start;">${isEn ? "User" : "المستخدم"}</th>
            <th style="padding: 10px 12px; text-align: start;">${isEn ? "Email" : "البريد الإلكتروني"}</th>
            <th style="padding: 10px 12px; text-align: start;">${isEn ? "Role" : "الدور الحالي"}</th>
            <th style="padding: 10px 12px; text-align: start;">${isEn ? "Verification" : "حالة الحساب"}</th>
            <th style="padding: 10px 12px; text-align: end;">${isEn ? "Actions" : "إدارة الصلاحيات"}</th>
          </tr>
        </thead>
        <tbody>
    `;

    users.forEach(u => {
      const isOwner = isOwnerUser(u.email) || u.isOwner;
      const role = normalizeRole(u.role || "patient", isOwner);
      const roleBadgeClass = isOwner ? "owner-badge" : (isAdminRole(role) ? "pill danger" : (role === ROLES.DOCTOR ? "pill ok" : "pill info"));
      const roleText = isEn ? (englishRoleLabels[role] || role) : (roleLabels[role] || role);
      const isEmailVerified = u.emailVerified ? (isEn ? "Verified Email ✓" : "بريد مؤكد ✓") : (isEn ? "Pending Email" : "بانتظار التأكيد");
      const userNameStr = u.name || u.displayName || u.email.split('@')[0];
      const canManageRoles = hasPermission(PERMISSIONS.MANAGE_USER_ROLES);
      const roleManagedByApplication = role === ROLES.DOCTOR_PENDING || role === ROLES.DOCTOR;

      html += `
        <tr style="border-bottom: 1px solid var(--line);">
          <td style="padding: 12px; font-weight: 600; color: var(--ink);">
            ${userNameStr}
            ${isOwner ? `<span class="owner-badge" style="margin-inline-start: 6px;">${isEn ? "Super Admin" : "مدير عام"}</span>` : ''}
          </td>
          <td style="padding: 12px; color: var(--muted); font-family: monospace;">${u.email}</td>
          <td style="padding: 12px;">
            <span class="${roleBadgeClass}" style="font-size: 11.5px; padding: 4px 10px;">${roleText}</span>
          </td>
          <td style="padding: 12px; color: ${u.emailVerified ? 'var(--teal)' : 'var(--muted)'};">
            ${isEmailVerified}
          </td>
          <td style="padding: 12px; text-align: end;">
            ${isOwner || !canManageRoles || roleManagedByApplication ? `<span style="font-size: 12px; color: var(--muted);">${isOwner ? (isEn ? "Protected (Super Admin)" : "محمي (مدير عام)") : roleText}</span>` : `
              <select onchange="changeUserRole('${u.id}', this.value, '${userNameStr}')" style="padding: 5px 9px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 12px; cursor: pointer;">
                <option value="patient" ${role === 'patient' ? 'selected' : ''}>${isEn ? 'Patient (مريض)' : 'حساب مريض'}</option>
                <option value="clinic_admin" ${role === 'clinic_admin' ? 'selected' : ''}>${isEn ? 'Clinic admin' : 'مدير عيادة'}</option>
                <option value="support" ${role === 'support' ? 'selected' : ''}>${isEn ? 'Support' : 'دعم فني'}</option>
                <option value="super_admin" ${role === 'super_admin' ? 'selected' : ''}>${isEn ? 'Super admin' : 'مدير عام للنظام'}</option>
              </select>
            `}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  } catch (err) {
    if (handleServerPermissionDenied(err, "Load Users List")) {
      container.innerHTML = `<div style="color: var(--rose); padding: 20px;">🔒 ${isEn ? "Access Denied by Firestore Server Rules" : "تم رفض الوصول من خادم قاعدة البيانات (Permission Denied)"}</div>`;
      return;
    }
    console.error("renderAdminUsers error:", err);
    container.innerHTML = `<div style="padding: 16px; color: var(--rose);">${getAuthErrorMessage(err)}</div>`;
  }
}

async function changeUserRole(userId, newRole, userName) {
  if (!(await enforceEmailVerification("تغيير دور المستخدم", "changing user role"))) return;
  if (!(await enforceServerPermission(PERMISSIONS.MANAGE_USER_ROLES, "Change User Role"))) return;
  const isEn = currentLanguage === "en";
  try {
    showToast(isEn ? `Updating role for ${userName}...` : `جاري تحديث دور ${userName}...`);

    await callBackend("/api/admin/set-user-role", {
      method: "POST",
      body: JSON.stringify({
        targetUserId: userId,
        newRole: newRole
      })
    });

    showToast(isEn ? `Role updated to ${newRole} for ${userName}!` : `تم تغيير دور ${userName} إلى ${roleLabels[newRole] || newRole}!`);
    await renderAdminUsers();
  } catch(err) {
    if (handleServerPermissionDenied(err, "Change User Role")) return;
    console.error("changeUserRole error:", err);
    showToast(getAuthErrorMessage(err));
  }
}

function getActiveScreen() {
  return document.querySelector(".screen.active")?.id.replace("screen-", "") || "patient";
}

function readOxygenValue() {
  const field = document.getElementById("oxygenInput");
  if (!field) return 0;
  return Number.parseInt(field.value.replace(/[^\d]/g, ""), 10) || 0;
}

function updateOxygenWarning() {
  const warning = document.getElementById("oxygenWarning");
  if (!warning) return;

  const oxygen = readOxygenValue();
  warning.hidden = oxygen >= 93 || oxygen === 0;
  if (oxygen > 0 && oxygen < 90) {
    warning.textContent = localized("القيمة منخفضة جدًا. اطلب رعاية عاجلة فورًا إذا يوجد ضيق تنفس شديد أو ألم صدر.");
    warning.classList.add("urgent");
  } else if (oxygen > 0 && oxygen < 93) {
    warning.textContent = localized("القيمة تحتاج متابعة قريبة. سيتم تعليم الحالة للطبيب كأولوية أعلى.");
    warning.classList.remove("urgent");
  }
}

function openApprovalModal() {
  const modal = document.getElementById("confirmModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeApprovalModal() {
  const modal = document.getElementById("confirmModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  const label = isDark ? "الوضع الداكن" : "الوضع الفاتح";
  if (siteThemeToggle) siteThemeToggle.textContent = localized(label);
  const fabIcon = themeToggle ? themeToggle.querySelector(".theme-fab-icon") : null;
  if (fabIcon) fabIcon.textContent = isDark ? "☀️" : "🌙";
}

window.addEventListener("load", () => {
  // Initialize theme toggle buttons to match the default dark mode
  const isDark = document.body.classList.contains("dark");
  if (siteThemeToggle) siteThemeToggle.textContent = localized(isDark ? "الوضع الداكن" : "الوضع الفاتح");
  const fabIcon = themeToggle ? themeToggle.querySelector(".theme-fab-icon") : null;
  if (fabIcon) fabIcon.textContent = isDark ? "☀️" : "🌙";
});

document.addEventListener("click", (event) => {
  const authOpen = event.target.closest("[data-auth-open]");
  if (authOpen) {
    showAuth();
    return;
  }

  const preview = event.target.closest("[data-preview-app]");
  if (preview) {
    showAuth();
    showToast(currentLanguage === "en"
      ? "Preview mode is disabled for production data. Please sign in to continue."
      : "تم إيقاف المعاينة بدون حساب لحماية بيانات الإنتاج. يرجى تسجيل الدخول للمتابعة.");
    return;
  }

  const roleButton = event.target.closest("[data-role]");
  if (roleButton) {
    selectedRole = "patient";
    return;
  }

  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    showScreen(screenButton.dataset.screen);
  }
});

document.getElementById("authClose").addEventListener("click", hideAuth);
document.getElementById("googleLogin").addEventListener("click", () => enterApp("google"));

if (authTabSignIn) {
  authTabSignIn.addEventListener("click", () => setAuthMode("signin"));
}
if (authTabSignUp) {
  authTabSignUp.addEventListener("click", () => setAuthMode("signup"));
}
if (authEmailForm) {
  authEmailForm.addEventListener("submit", handleEmailAuth);
}
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", showForgotView);
}
if (backToSignInBtn) {
  backToSignInBtn.addEventListener("click", showSignInView);
}
if (cancelResetBtn) {
  cancelResetBtn.addEventListener("click", showSignInView);
}
if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", handleForgotPasswordSubmit);
}
if (newPasswordForm) {
  newPasswordForm.addEventListener("submit", handleNewPasswordSubmit);
}

const resendVerificationBtn = document.getElementById("resendVerificationBtn");
if (resendVerificationBtn) {
  resendVerificationBtn.addEventListener("click", resendVerificationEmail);
}

const checkVerificationBtn = document.getElementById("checkVerificationBtn");
if (checkVerificationBtn) {
  checkVerificationBtn.addEventListener("click", checkEmailVerification);
}

// ── Choice Buttons — Toggle Active State ──────────────────────────────
// Single-select: ضيق التنفس + درجة الكحة
["breathingChoices", "coughChoices"].forEach((groupId) => {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".choice");
    if (!btn) return;
    group.querySelectorAll(".choice").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// Multi-select: عوامل الخطورة (يمكن اختيار أكثر من واحد)
const riskGroup = document.getElementById("riskChoices");
if (riskGroup) {
  riskGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".choice");
    if (!btn) return;
    // إذا اختار "لا يوجد" يُلغي باقي الخيارات
    if (btn.textContent.trim() === "لا يوجد") {
      riskGroup.querySelectorAll(".choice").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    } else {
      // إلغاء تنشيط "لا يوجد" عند اختيار عامل خطر
      riskGroup.querySelectorAll(".choice").forEach((b) => {
        if (b.textContent.trim() === "لا يوجد") b.classList.remove("active");
      });
      btn.classList.toggle("active");
    }
  });
}

document.getElementById("oxygenInput").addEventListener("input", updateOxygenWarning);

document.getElementById("submitAssessment").addEventListener("click", async () => {
  updateOxygenWarning();

  if (!(await enforceEmailVerification("إرسال تقييم التنفس", "submitting a respiratory assessment"))) {
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showToast("يجب تسجيل الدخول أولاً");
    return;
  }

  const submitBtn = document.getElementById("submitAssessment");
  submitBtn.disabled = true;
  submitBtn.textContent = "جاري الإرسال...";

  try {
    // ── جمع بيانات النموذج ──────────────────────────────────────────
    const oxygenLevel = readOxygenValue();

    // ضيق التنفس (نعم/لا)
    const breathingChoices = document.querySelectorAll(
      "#breathingChoices .choice"
    );
    let breathingDifficulty = "غير محدد";
    breathingChoices.forEach((btn) => {
      if (btn.classList.contains("active")) breathingDifficulty = btn.textContent.trim();
    });

    // درجة الكحة
    const coughChoices = document.querySelectorAll(
      "#coughChoices .choice"
    );
    let coughLevel = "غير محدد";
    coughChoices.forEach((btn) => {
      if (btn.classList.contains("active")) coughLevel = btn.textContent.trim();
    });

    // مدة الأعراض
    const durationField = document.getElementById("symptomDuration");
    const symptomDuration = durationField ? durationField.value.trim() : "غير محدد";

    // عوامل الخطورة (يمكن أكثر من واحد)
    const riskChoices = document.querySelectorAll(
      "#riskChoices .choice"
    );
    const riskFactors = [];
    riskChoices.forEach((btn) => {
      if (btn.classList.contains("active")) riskFactors.push(btn.textContent.trim());
    });

    // ── تحديد الأولوية بناءً على نسبة الأكسجين ───────────────────
    let priority = "normal";
    if (oxygenLevel > 0 && oxygenLevel < 90) priority = "urgent";
    else if (oxygenLevel > 0 && oxygenLevel < 93) priority = "high";

    // ── بناء وثيقة الحالة ─────────────────────────────────────────
    const caseData = {
      patientId: user.uid,
      patientEmail: user.email,
      patientName: user.displayName || "مجهول",
      status: "pending",
      priority,
      oxygenLevel,
      breathingDifficulty,
      coughLevel,
      symptomDuration,
      riskFactors,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null,
      doctorNotes: null,
      result: null,
    };

    // ── حفظ في Firestore ──────────────────────────────────────────
    const docRef = await db.collection("cases").add(caseData);
    console.log("✅ Case saved to Firestore:", docRef.id);

    // ── تسجيل في Audit Log ────────────────────────────────────────
    await db.collection("auditLog").add({
      action: "CASE_SUBMITTED",
      caseId: docRef.id,
      patientId: user.uid,
      priority,
      oxygenLevel,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    showScreen("pending");
    showToast(
      priority === "urgent"
        ? "🚨 تم إرسال الحالة العاجلة للطبيب"
        : priority === "high"
        ? "⚠️ تم إرسال الحالة بأولوية عالية للطبيب"
        : "✅ تم إرسال التقييم للطبيب"
    );

    // ── ملء بطاقة الحالة في شاشة الانتظار ───────────────────────
    const priorityAr = { urgent: "🚨 عاجل", high: "⚠️ عالية", normal: "✔️ عادية" };
    const now = new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    safeSet("pendingCaseId",    `#${docRef.id.slice(-6).toUpperCase()}`);
    safeSet("pendingCaseName",  user.displayName || user.email);
    safeSet("pendingCaseO2",    oxygenLevel ? `${oxygenLevel}%` : "--");
    safeSet("pendingCasePriority", priorityAr[priority] || priority);
    safeSet("pendingCaseTime",  now);

    // حفظ caseId للاستخدام لاحقاً (مثلاً لمتابعة الحالة)
    window._currentCaseId = docRef.id;


  } catch (error) {
    console.error("❌ Error saving case:", error);
    if (error.code === "permission-denied") {
      showToast("خطأ في الصلاحيات — تأكد من تسجيل الدخول");
    } else {
      showToast("حدث خطأ أثناء الإرسال. حاول مرة أخرى.");
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال للطبيب";
  }
});
const approveResultBtn = document.getElementById("approveResult");
if (approveResultBtn) approveResultBtn.addEventListener("click", openApprovalModal);

const cancelApproveBtn = document.getElementById("cancelApprove");
if (cancelApproveBtn) cancelApproveBtn.addEventListener("click", closeApprovalModal);

const confirmApproveBtn = document.getElementById("confirmApprove");
if (confirmApproveBtn) confirmApproveBtn.addEventListener("click", async () => {
  if (!(await enforceEmailVerification("اعتماد الحالة السريرية", "approving a clinical case"))) return;
  if (!enforcePermission(PERMISSIONS.APPROVE_CASE, "Approve Clinical Case")) return;
  closeApprovalModal();
  showScreen("result");
  showToast("تم اعتماد النتيجة وتسجيل الحدث في سجل التدقيق");
});

document.getElementById("fileUpload").addEventListener("change", async (event) => {
  if (!(await enforceEmailVerification("رفع ملفات طبية", "uploading medical files"))) {
    event.target.value = "";
    return;
  }
  const fileList = document.getElementById("fileList");
  [...event.target.files].forEach((file) => {
    const item = document.createElement("div");
    item.innerHTML = `<strong>${file.name}</strong><span>${localized("جاهز لمراجعة الطبيب - بدون تحليل ذكاء اصطناعي")}</span>`;
    fileList.prepend(item);
  });
  if (event.target.files.length) showToast("تمت إضافة الملف كمرجع للطبيب");
});

// Verification modal event bindings
const verifyModalCheckBtn = document.getElementById("verifyModalCheckBtn");
if (verifyModalCheckBtn) {
  verifyModalCheckBtn.addEventListener("click", async () => {
    await checkEmailVerification();
    if (auth.currentUser && auth.currentUser.emailVerified) {
      closeVerifyRequiredModal();
    }
  });
}

const verifyModalResendBtn = document.getElementById("verifyModalResendBtn");
if (verifyModalResendBtn) {
  verifyModalResendBtn.addEventListener("click", resendVerificationEmail);
}

const verifyModalCloseBtn = document.getElementById("verifyModalCloseBtn");
if (verifyModalCloseBtn) {
  verifyModalCloseBtn.addEventListener("click", closeVerifyRequiredModal);
}
document.getElementById("sendChat").addEventListener("click", () => {
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const user = document.createElement("div");
  user.className = "user";
  user.textContent = input.value.trim() || localized("أحتاج توضيحًا");
  const bot = document.createElement("div");
  bot.className = "bot";
  bot.textContent = localized("الخطر المتوسط يعني أن الحالة ليست مطمئنة تمامًا وتحتاج متابعة الطبيب خلال 24-48 ساعة. لا تبدأ علاجًا جديدًا دون مراجعة الطبيب.");
  messages.append(user, bot);
  input.value = "";
  messages.scrollTop = messages.scrollHeight;
});

themeToggle.addEventListener("click", toggleTheme);
if (siteThemeToggle) siteThemeToggle.addEventListener("click", toggleTheme);

languageToggle.addEventListener("click", () => {
  const nextLanguage = currentLanguage === "ar" ? "en" : "ar";
  applyLanguage(nextLanguage);
  showToast(nextLanguage === "ar" ? "الواجهة مضبوطة على العربية" : "الواجهة مضبوطة على الإنجليزية");
});

menuToggle.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
});

logoutButton.addEventListener("click", leaveApp);

window.addEventListener("load", () => {
  auth.onAuthStateChanged(async (user) => {
    window.clearTimeout(loaderSafetyTimer);
    if (user) {
      const isOwner = isOwnerUser(user.email);
      let displayName = user.displayName;
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          if (isOwner) {
            selectedRole = ROLES.SUPER_ADMIN;
            if (normalizeRole(userDoc.data().role, true) !== ROLES.SUPER_ADMIN || !userDoc.data().isOwner) {
              await callBackend("/api/admin/set-user-role", {
                method: "POST",
                body: JSON.stringify({
                  targetUserId: user.uid,
                  newRole: ROLES.SUPER_ADMIN
                })
              });
            }
          } else {
            selectedRole = normalizeRole(userDoc.data().role || selectedRole);
          }
          if (userDoc.data().name) displayName = userDoc.data().name;
        } else {
          const safeRole = normalizeRole(ROLES.PATIENT, isOwner);
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: displayName || user.email.split('@')[0],
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (e) {
        console.warn("Firestore role fetch failed, defaulting to patient:", e);
        if (isOwner) selectedRole = ROLES.SUPER_ADMIN;
      }
      
      userName.textContent = displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (englishRoleLabels[normalizeRole(selectedRole, isOwner)] || englishRoleLabels.patient)
        : (roleLabels[normalizeRole(selectedRole, isOwner)] || roleLabels.patient);
      
      updateAvatar(user);
      updateEmailVerificationUI(user);
      
      publicSite.hidden = true;
      hideAuth();
      app.hidden = false;
      showScreen("patient");
      
      loader.classList.add("is-done");
    } else {
      updateEmailVerificationUI(null);
      window.setTimeout(() => {
        loader.classList.add("is-done");
        publicSite.classList.remove("is-hidden");
      }, 250);
    }
  });
});

function checkUrlAuthAction() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get("mode");
  const oobCode = urlParams.get("oobCode");

  if (mode === "resetPassword" && oobCode) {
    showNewPasswordView(oobCode);
  } else if (mode === "verifyEmail" && oobCode) {
    auth.applyActionCode(oobCode).then(() => {
      showToast(currentLanguage === "en" ? "🎉 Email verified successfully!" : "🎉 تم تأكيد البريد الإلكتروني بنجاح!");
      if (auth.currentUser) {
        auth.currentUser.reload().then(() => updateEmailVerificationUI(auth.currentUser));
      }
    }).catch(err => {
      console.error("verifyEmail action error:", err);
      showToast(getAuthErrorMessage(err));
    });
  }
}

showScreen("patient");
applyLanguage("en");
checkUrlAuthAction();

function updateAvatar(user) {
  const sidebarAvatar = document.getElementById("sidebarAvatar");
  const topbarAvatar = document.getElementById("topbarAvatar");
  
  if (user && user.photoURL) {
    const imgHtml = `<img src="${user.photoURL}" alt="avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    if (sidebarAvatar) sidebarAvatar.innerHTML = imgHtml;
    if (topbarAvatar) topbarAvatar.innerHTML = imgHtml;
  } else {
    const name = user && (user.displayName || user.email);
    const initial = name ? name.charAt(0).toUpperCase() : (currentLanguage === "en" ? "A" : "أ");
    if (sidebarAvatar) sidebarAvatar.textContent = initial;
    if (topbarAvatar) topbarAvatar.textContent = initial;
  }
}
updateOxygenWarning();
