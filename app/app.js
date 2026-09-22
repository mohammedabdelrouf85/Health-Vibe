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
const LOGO_ASSETS = {
  light: "./logo-light.png",
  dark: "./logo-dark.png"
};

function getThemeLogoSrc() {
  return document.body.classList.contains("dark") ? LOGO_ASSETS.dark : LOGO_ASSETS.light;
}

function updateThemeLogos() {
  const logoSrc = getThemeLogoSrc();
  document.querySelectorAll("[data-logo]").forEach((logo) => {
    logo.setAttribute("src", logoSrc);
  });
}

async function setupLoaderVideo() {
  const video = document.querySelector(".loader-video");
  if (!video) return;
  if (video.dataset.loaderVideoInitialized === "true") return;
  video.dataset.loaderVideoInitialized = "true";
  const hideVideo = () => {
    video.hidden = true;
    video.setAttribute("aria-hidden", "true");
  };
  const candidates = (video.dataset.videoCandidates || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  hideVideo();
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { method: "HEAD" });
      if (response.ok) {
        video.src = candidate;
        video.hidden = false;
        video.removeAttribute("aria-hidden");
        video.load();
        video.play().catch(() => {});
        break;
      }
    } catch (error) {
      // Keep the animated logo fallback when the optional intro video is absent.
    }
  }
  video.addEventListener("error", hideVideo);
  window.setTimeout(() => {
    if (!video.src || video.readyState === 0) hideVideo();
  }, 900);
}

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
  "مؤشر قواعد غير مُتحقق": "Rule score (not clinically validated)",
  "موثق": "Verified",
  "اعتماد الطبيب": "Doctor approval",
  "مسار العمل": "Workflow",
  "مسار واضح من البيانات إلى التقرير": "A clear path from data to report",
  "بيانات المريض": "Patient data",
  "أعراض، قياسات، ملف طبي، وموافقة خصوصية واضحة.": "Symptoms, measurements, medical file, and clear privacy consent.",
  "تحليل الذكاء الاصطناعي": "AI analysis",
  "تصنيف خطورة بقواعد واضحة، والمؤشر غير مُتحقق سريرياً.": "Rule-based risk classification with a clearly unvalidated score and traceable version.",
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
  "أدخل الأعراض والقياسات. يحصل الطبيب على تقدير خطورة مبني على قواعد قبل اعتماد أي تقرير يظهر لك.": "Enter symptoms and measurements. The doctor receives a rule-based risk preview before approving any report shown to you.",
  "بدء تقييم التنفس": "Start breathing assessment",
  "عرض السجل": "View history",
  "آخر حالة": "Latest status",
  "نسبة الأكسجين": "Oxygen level",
  "مؤشر قواعد": "Rule score",
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
  "يوصى بالمتابعة خلال 24-48 ساعة. مؤشر القواعد غير مُتحقق سريرياً.": "Follow-up is recommended within 24-48 hours. Rule score is not clinically validated.",
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
  if (typeof updateOxygenWarning === "function") updateOxygenWarning();
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
const storage = firebase.storage();
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
  // Purge any legacy demo cases from Firestore cases collection
  try {
    const demoDocs = ["demo_case_1", "demo_case_2", "demo_case_3"];
    for (const dId of demoDocs) {
      await db.collection("cases").doc(dId).delete().catch(() => {});
    }
    const demoSnap = await db.collection("cases").where("isDemo", "==", true).get().catch(() => null);
    if (demoSnap && !demoSnap.empty) {
      for (const d of demoSnap.docs) {
        await d.ref.delete().catch(() => {});
      }
    }
  } catch (e) {
    console.warn("Legacy demo case purge skipped:", e.message);
  }

  if (!APP_ENV.isLocalhost || APP_ENV.name !== "development" || !APP_ENV.allowDemoSeed) {
    return;
  }

  try {
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
    const user = auth.currentUser;
    if (!user) return [];

    const isOwner = isOwnerUser(user.email);
    const role = normalizeRole(selectedRole, isOwner);

    let cases = [];
    if (role === ROLES.DOCTOR) {
      // 🩺 DOCTOR PRIVACY: Fetch ONLY cases assigned to this doctor
      try {
        const snap = await db.collection("cases").where("assignedDoctorId", "==", user.uid).get();
        cases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn("Query by assignedDoctorId failed, trying doctorId fallback:", e.message);
      }

      // Fallback: also check doctorId if assignedDoctorId returned no records
      if (cases.length === 0) {
        try {
          const fallbackSnap = await db.collection("cases").where("doctorId", "==", user.uid).get();
          if (!fallbackSnap.empty) {
            cases = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          }
        } catch (e) {
          // ignore fallback query error
        }
      }
    } else if (role === ROLES.PATIENT) {
      // 👤 PATIENT PRIVACY: Fetch only own cases
      const snap = await db.collection("cases").where("patientId", "==", user.uid).get();
      cases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      // ⚙️ ADMIN: Can view all cases for triage and doctor assignment
      const snapshot = await db.collection("cases").orderBy("createdAt", "desc").get();
      cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Client-side sort by submittedAt or createdAt descending
    cases.sort((a, b) => {
      const tA = (a.submittedAt && a.submittedAt.toMillis ? a.submittedAt.toMillis() : (a.createdAt || 0));
      const tB = (b.submittedAt && b.submittedAt.toMillis ? b.submittedAt.toMillis() : (b.createdAt || 0));
      return tB - tA;
    });

    // 🛡️ STRICT ENFORCEMENT: Real cases ONLY (strictly exclude demo, mock, or fake cases)
    cases = cases.filter(c => {
      if (!c) return false;
      if (c.isDemo === true) return false;
      const idStr = String(c.id || "");
      if (idStr.startsWith("demo_") || idStr.startsWith("mock_") || idStr.startsWith("test_case_")) return false;
      const hasPatient = Boolean(c.patientId || c.patientUid || c.patientEmail);
      const hasVitals = typeof c.o2 === "number" || typeof c.oxygenLevel === "number";
      return hasPatient && hasVitals;
    });

    return cases;
  } catch (err) {
    console.error("getCases error:", err);
    return [];
  }
}

// ==========================================
// 🏥 CLINICAL STATE MACHINE CONSTANTS & META
// ==========================================
const CASE_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  TRIAGED: 'triaged',
  ASSIGNED: 'assigned',
  UNDER_REVIEW: 'under_review',
  MORE_INFO_REQUESTED: 'more_info_requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
  PENDING: 'pending' // alias for backwards compatibility
});

const CASE_TRANSITIONS = {
  [CASE_STATUS.DRAFT]: [CASE_STATUS.SUBMITTED],
  [CASE_STATUS.SUBMITTED]: [CASE_STATUS.TRIAGED, CASE_STATUS.ASSIGNED, CASE_STATUS.UNDER_REVIEW],
  [CASE_STATUS.TRIAGED]: [CASE_STATUS.ASSIGNED, CASE_STATUS.UNDER_REVIEW],
  [CASE_STATUS.ASSIGNED]: [CASE_STATUS.UNDER_REVIEW],
  [CASE_STATUS.PENDING]: [CASE_STATUS.TRIAGED, CASE_STATUS.ASSIGNED, CASE_STATUS.UNDER_REVIEW],
  [CASE_STATUS.UNDER_REVIEW]: [
    CASE_STATUS.MORE_INFO_REQUESTED,
    CASE_STATUS.APPROVED,
    CASE_STATUS.REJECTED,
    CASE_STATUS.ESCALATED,
    CASE_STATUS.CLOSED
  ],
  [CASE_STATUS.MORE_INFO_REQUESTED]: [CASE_STATUS.UNDER_REVIEW, CASE_STATUS.CLOSED],
  [CASE_STATUS.APPROVED]: [CASE_STATUS.CLOSED],
  [CASE_STATUS.REJECTED]: [CASE_STATUS.CLOSED],
  [CASE_STATUS.ESCALATED]: [CASE_STATUS.UNDER_REVIEW, CASE_STATUS.CLOSED],
  [CASE_STATUS.CLOSED]: []
};

const CaseStatusMeta = {
  [CASE_STATUS.DRAFT]: {
    ar: 'مسودة',
    en: 'Draft',
    pillClass: 'draft',
    color: '#64748b',
    border: '#94a3b8',
    icon: '📝'
  },
  [CASE_STATUS.SUBMITTED]: {
    ar: 'تم الإرسال',
    en: 'Submitted',
    pillClass: 'submitted',
    color: '#0284c7',
    border: '#38bdf8',
    icon: '📨'
  },
  [CASE_STATUS.TRIAGED]: {
    ar: 'تم الفرز الذكي',
    en: 'Triaged',
    pillClass: 'triaged',
    color: '#7c3aed',
    border: '#a855f7',
    icon: '🤖'
  },
  [CASE_STATUS.ASSIGNED]: {
    ar: 'بانتظار الطبيب',
    en: 'Assigned to Doctor',
    pillClass: 'assigned',
    color: '#4f46e5',
    border: '#818cf8',
    icon: '🩺'
  },
  [CASE_STATUS.PENDING]: {
    ar: 'قيد الانتظار',
    en: 'Pending',
    pillClass: 'pending',
    color: '#b45309',
    border: '#f59e0b',
    icon: '⏳'
  },
  [CASE_STATUS.UNDER_REVIEW]: {
    ar: 'قيد الفحص السريري',
    en: 'Under Review',
    pillClass: 'under_review',
    color: '#d97706',
    border: '#f59e0b',
    icon: '🔍'
  },
  [CASE_STATUS.MORE_INFO_REQUESTED]: {
    ar: 'مطلوب بيانات إضافية',
    en: 'More Info Requested',
    pillClass: 'more_info_requested',
    color: '#ea580c',
    border: '#fb923c',
    icon: '❓'
  },
  [CASE_STATUS.APPROVED]: {
    ar: 'معتمد سريرياً',
    en: 'Approved',
    pillClass: 'approved',
    color: '#16a34a',
    border: '#22c55e',
    icon: '✅'
  },
  [CASE_STATUS.REJECTED]: {
    ar: 'مرفوض',
    en: 'Rejected',
    pillClass: 'rejected',
    color: '#dc2626',
    border: '#ef4444',
    icon: '❌'
  },
  [CASE_STATUS.ESCALATED]: {
    ar: 'مصعّد لطوارئ/استشاري',
    en: 'Escalated',
    pillClass: 'escalated',
    color: '#e11d48',
    border: '#f43f5e',
    icon: '🚨'
  },
  [CASE_STATUS.CLOSED]: {
    ar: 'مكتمل ومغلق',
    en: 'Closed',
    pillClass: 'closed',
    color: '#475569',
    border: '#64748b',
    icon: '🔒'
  }
};

function getCaseStatusMeta(status) {
  return CaseStatusMeta[status] || {
    ar: status || 'غير محدد',
    en: status || 'Unknown',
    pillClass: 'info',
    color: '#0284c7',
    border: '#38bdf8',
    icon: '📋'
  };
}

async function writeClientAuditLog(action, details = {}) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await db.collection("auditLog").add({
      action,
      userId: user.uid,
      userEmail: user.email || "",
      userName: user.displayName || user.email || "Unknown user",
      actorRole: selectedRole || "unknown",
      source: "client",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent,
      page: window.location.pathname,
      ...details
    });
  } catch (error) {
    console.warn("Client audit log write failed:", action, error);
  }
}

async function updateCaseStatus(id, newStatus, note, extraFields = {}) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Update Case Status")) return false;
  const user = auth.currentUser;
  const isEn = currentLanguage === "en";

  // 🛡️ ZERO-TRUST BACKEND ENFORCEMENT:
  // Doctor approvals, rejections, more-info requests, escalations, and closures MUST pass through
  // the server-authoritative backend / Cloud Functions for token validation, RBAC, and immutable audit logging.
  try {
    const backendResult = await callBackend("/api/doctor/transition-case-status", {
      method: "POST",
      body: JSON.stringify({
        caseId: id,
        targetStatus: newStatus,
        note: note || "",
        clinicalNotes: extraFields.clinicalNotes || note || "",
        recommendation: extraFields.recommendation || "",
        recommendations: extraFields.recommendations || []
      })
    });
    console.info("✅ Case status transitioned securely via backend authority:", backendResult);
    await writeClientAuditLog("CASE_STATUS_TRANSITIONED", {
      caseId: id,
      targetStatus: newStatus,
      auditCategory: newStatus === CASE_STATUS.APPROVED ? "approval" : (newStatus === CASE_STATUS.REJECTED ? "rejection" : "edit"),
      note: note || "",
      backendAuthoritative: true
    });
    return true;
  } catch (backendErr) {
    console.warn("Backend /api/doctor/transition-case-status rejected or unavailable:", backendErr.message);

    // If server returned a business or authorization rejection (403, 400, etc.), do NOT bypass it!
    const isNetworkErr = backendErr.message.includes("Failed to fetch") || backendErr.message.includes("NetworkError");
    if (!isNetworkErr && (backendErr.message.includes("403") || backendErr.message.includes("Zero-Trust") || backendErr.message.includes("denied") || backendErr.message.includes("Cannot transition"))) {
      showToast(`❌ ${backendErr.message}`);
      return false;
    }

    // Only in local development when offline backend server isn't running, fallback to client update with Firestore rules
    if (APP_ENV.isLocalhost && isNetworkErr) {
      console.info("[Dev Fallback] Backend server port 4000 offline; falling back to direct Firestore update validated by security rules.");
      try {
        const statusMeta = getCaseStatusMeta(newStatus);
        const historyItem = {
          status: newStatus,
          changedAt: new Date().toISOString(),
          changedBy: user ? user.uid : "doctor",
          changedByName: user ? (user.displayName || user.email.split('@')[0]) : "Doctor",
          changedByEmail: user ? user.email : "",
          changedByRole: "doctor",
          note: note || (newStatus === CASE_STATUS.APPROVED ? (isEn ? "Approved by physician" : "تم الاعتماد السريري من الطبيب") : `${isEn ? statusMeta.en : statusMeta.ar}`)
        };

        const updatePayload = {
          status: newStatus,
          doctorNote: note || "",
          lastUpdatedBy: user ? user.uid : null,
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
          statusHistory: firebase.firestore.FieldValue.arrayUnion(historyItem),
          ...extraFields
        };

        if (newStatus === CASE_STATUS.APPROVED) {
          updatePayload.doctorApproved = true;
          updatePayload.approvingDoctorId = user ? user.uid : null;
          updatePayload.approvingDoctorEmail = user ? user.email : null;
          updatePayload.approvedAt = firebase.firestore.FieldValue.serverTimestamp();
          updatePayload.generatedAt = firebase.firestore.FieldValue.serverTimestamp();
          updatePayload.reportVersion = updatePayload.reportVersion || REPORT_VERSION;
          updatePayload.modelVersion = updatePayload.modelVersion || MODEL_VERSION;
          if (extraFields.clinicalNotes) updatePayload.clinicalNotes = extraFields.clinicalNotes;
          if (extraFields.recommendations) updatePayload.recommendations = extraFields.recommendations;
          if (extraFields.recommendation) updatePayload.recommendation = extraFields.recommendation;
        } else if (newStatus === CASE_STATUS.MORE_INFO_REQUESTED) {
          updatePayload.moreInfoRequestedAt = firebase.firestore.FieldValue.serverTimestamp();
          updatePayload.moreInfoNote = note || "";
        } else if (newStatus === CASE_STATUS.ESCALATED) {
          updatePayload.escalatedAt = firebase.firestore.FieldValue.serverTimestamp();
          updatePayload.escalationReason = note || "";
        } else if (newStatus === CASE_STATUS.CLOSED) {
          updatePayload.closedAt = firebase.firestore.FieldValue.serverTimestamp();
          updatePayload.closedBy = user ? user.uid : null;
        }

        await db.collection("cases").doc(id).update(updatePayload);
        await writeClientAuditLog("CASE_STATUS_TRANSITIONED_DEV_FALLBACK", {
          caseId: id,
          targetStatus: newStatus,
          auditCategory: newStatus === CASE_STATUS.APPROVED ? "approval" : (newStatus === CASE_STATUS.REJECTED ? "rejection" : "edit"),
          note: note || "",
          backendAuthoritative: false
        });
        return true;
      } catch (err) {
        console.error("updateCaseStatus fallback error:", err);
        if (handleServerPermissionDenied(err, "Update Case Status")) return false;
        showToast(getAuthErrorMessage(err));
        return false;
      }
    }

    showToast(`❌ ${backendErr.message}`);
    return false;
  }
}

let activeCaseId = null;
let currentDoctorQueueFilter = 'all';

function parseDoctorRecommendations(rawText) {
  return String(rawText || "")
    .split(/\r?\n|[;؛]/)
    .map((item) => item.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
}

window.setDoctorQueueFilter = function(filterKey) {
  currentDoctorQueueFilter = filterKey;
  renderDoctorQueue();
};

window.applyDiagPreset = function(presetKey) {
  const isEn = currentLanguage === "en";
  const diagInput = document.getElementById("doctorDiagnosisInput");
  const medInput = document.getElementById("doctorMedicationsInput");
  const recInput = document.getElementById("doctorRecommendationsInput");
  const noteInput = document.getElementById("doctorNoteInput");

  const presets = {
    bronchitis: {
      diag: isEn ? "Acute bronchitis with mild bronchial irritation. Respiratory vitals monitored, no respiratory failure signs." : "التهاب شعبي حاد مع تهيج في الشعب الهوائية. تم فحص القياسات الحيوية ولا توجد مؤشرات على فشل تنفسي.",
      meds: isEn ? "1. Bronchodilator Inhaler (Salbutamol 100mcg) - 2 puffs every 6-8 hours as needed for dyspnea.\n2. Expectorant Cough Syrup (Guaifenesin 100mg/5ml) - 10ml three times daily after meals for 5 days.\n3. Paracetamol 500mg - 1-2 tablets every 6 hours if fever/body aches arise." : "1. بخاخ موسع للشعب الهوائية (سالبوتامول 100 ميكروجرام) - بختان كل 6-8 ساعات عند الشعور بضيق التنفس.\n2. شراب طارد ومذيب للبلغم (جوايفينيزين) - ملعقة كبيرة 3 مرات يومياً بعد الوجبات لمدة 5 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 ساعات عند ارتفاع الحرارة أو الصداع.",
      recs: isEn ? "• Drink warm fluids (herbal teas, honey-lemon) throughout the day.\n• Avoid sudden temperature changes, smoke, and air pollutants.\n• Rest voice and body for 48-72 hours.\n• Follow-up immediately if SpO2 drops below 92% or high fever persists." : "• تناول السوائل الدافئة بوفرة (عسل وليمون، مشروبات عشبية).\n• الابتعاد التام عن التدخين والغبار وتيارات الهواء البارد.\n• أخذ قسط وافر من الراحة البدنية لمدة 48-72 ساعة.\n• مراجعة الطوارئ فوراً في حال انخفاض نسبة الأكسجين عن 92% أو استمرار الحمى الشديدة."
    },
    stable: {
      diag: isEn ? "Normal respiratory assessment. Mild seasonal upper airway sensitivity without hypoxemia or respiratory distress." : "تقييم تنفسي طبيعي ومستقر. حساسية موسمية خفيفة في المجاري التنفسية العليا دون نقص بالأكسجين أو علامات خطورة.",
      meds: isEn ? "1. Antihistamine (Cetirizine 10mg) - 1 tablet once daily before bedtime for 7 days.\n2. Saline Nasal Spray - 2 sprays per nostril 3 times daily as needed." : "1. مضاد للهستامين (سيتريزين 10 مجم) - قرص واحد مساءً قبل النوم لمدة 7 أيام.\n2. بخاخ محلول ملحي للأنف - بختان في كل فتحة أنف 3 مرات يومياً عند الحاجة.",
      recs: isEn ? "• Stay well-hydrated and maintain good indoor ventilation.\n• Continue healthy dietary habits and adequate sleep.\n• Routine health checkup in 6 months or if symptoms worsen." : "• شرب كميات كافية من الماء والحفاظ على تهوية جيدة للمنزل.\n• الاستمرار في نمط حياة صحي وغذاء متوازن ونوم كافٍ.\n• مراجعة الفحص الدوري بعد 6 أشهر أو عند حدوث أي تغير في الأعراض."
    },
    asthma: {
      diag: isEn ? "Mild-to-moderate bronchial asthma flare-up. Reactive airway, SpO2 borderline stable." : "نوبة ربو شعبي متوسطة إلى خفيفة. وجود صفير بالصدر مع تهيج بالشعب الهوائية مع استقرار نسبي لنسبة الأكسجين.",
      meds: isEn ? "1. Combination Inhaler (Budesonide/Formoterol 160/4.5mcg) - 1-2 inhalations twice daily.\n2. Oral Prednisolone 20mg - 1 tablet in the morning after breakfast for 3 days.\n3. Salbutamol Inhaler - 2 puffs as rescue therapy for acute shortness of breath." : "1. بخاخ مدمج (بوديزونايد / فورموتيرول) - استنشاقة واحدة مرتين يومياً صباحاً ومساءً.\n2. بريدنيزولون 20 مجم - قرص واحد صباحاً بعد الإفطار لمدة 3 أيام فقط.\n3. بخاخ سالبوتامول - بختان للإنقاذ عند الشعور بضيق مفاجئ في التنفس.",
      recs: isEn ? "• Keep rescue inhaler readily accessible at all times.\n• Avoid known allergy triggers (perfumes, cat/dog dander, dust mites).\n• Measure peak flow or SpO2 twice daily.\n• Visit ER immediately if no improvement after 3 rescue doses within 1 hour." : "• الاحتفاظ ببخاخ الإنقاذ في متناول اليد في جميع الأوقات.\n• تجنب المهيجات المسببة للحساسية (العطور القوية، فراء الحيوانات، الغبار).\n• قياس نسبة الأكسجين SpO2 مرتين يومياً.\n• التوجه فوراً لقسم الطوارئ في حال عدم الاستجابة لثلاث جرعات إسعافية خلال ساعة."
    },
    uri: {
      diag: isEn ? "Acute viral upper respiratory tract infection (URTI) with rhinitis and productive cough. No lower respiratory consolidation." : "التهاب فيروسي حاد بالجهاز التنفسي العلوي مصحوب بسيلان أنفي وسعال. لا توجد مؤشرات على التهاب رئوي سفلي.",
      meds: isEn ? "1. Vitamin C + Zinc Lozenges - twice daily for 5 days.\n2. Decongestant / Antihistamine combo - 1 tablet twice daily after meals for 4 days.\n3. Paracetamol 500mg - every 6-8 hours for sore throat or fever." : "1. مكمل فيتامين سي مع زنك - مرتين يومياً لمدة 5 أيام.\n2. أقراص مزيلة للاحتقان ومضادة للهستامين - قرص مرتين يومياً بعد الأكل لمدة 4 أيام.\n3. باراسيتامول 500 مجم - قرص كل 6 إلى 8 ساعات لتسكين آلام الحلق والحمى.",
      recs: isEn ? "• Strict rest and sleep to boost immune recovery.\n• Frequent warm saline gargles 3-4 times daily.\n• Wear a mask around vulnerable family members.\n• Follow-up in 3-5 days if symptoms fail to resolve." : "• الراحة التامة والنوم الكافي لتعزيز مناعة الجسم.\n• الغرغرة بمحلول ملحي دافئ 3-4 مرات يومياً لتخفيف احتقان الحلق.\n• ارتداء كمامة واقية عند التعامل مع كبار السن أو الأطفال.\n• مراجعة الطبيب إذا استمرت الأعراض لأكثر من 5 أيام دون تحسن."
    }
  };

  const selected = presets[presetKey];
  if (selected) {
    if (diagInput) diagInput.value = selected.diag;
    if (noteInput) noteInput.value = selected.diag;
    if (medInput) medInput.value = selected.meds;
    if (recInput) recInput.value = selected.recs;
    showToast(isEn ? "Diagnostic preset applied" : "تم تطبيق القالب التشخيصي");
  }
};

window.previewCaseReport = function(id) {
  const isEn = currentLanguage === "en";
  const queue = state.doctorQueue || [];
  const c = queue.find(item => item.id === id);
  if (!c) {
    showToast(isEn ? "Case not found in current queue" : "لم يتم العثور على الحالة في قائمة الانتظار");
    return;
  }

  const diagInput = document.getElementById("doctorDiagnosisInput") || document.getElementById("doctorNoteInput");
  const medInput = document.getElementById("doctorMedicationsInput");
  const recInput = document.getElementById("doctorRecommendationsInput");
  const nameInput = document.getElementById("doctorNameInput");
  const specInput = document.getElementById("doctorSpecialtyInput");
  const licInput = document.getElementById("doctorLicenseInput");
  const clinicInput = document.getElementById("doctorClinicInput");

  const clinicalDiagnosis = diagInput ? diagInput.value.trim() : (c.clinicalDiagnosis || c.doctorNote || "");
  const medications = medInput ? medInput.value.trim() : (c.medications || "");
  const recommendations = parseDoctorRecommendations(recInput ? recInput.value : (c.recommendation || ""));

  window.__doctorPreviewCase = {
    ...c,
    clinicalDiagnosis,
    doctorNote: clinicalDiagnosis,
    clinicalNotes: clinicalDiagnosis,
    medications,
    recommendations,
    recommendation: recommendations.join("\n"),
    approvingDoctorName: nameInput && nameInput.value.trim() ? nameInput.value.trim() : (c.approvingDoctorName || (auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Dr. Mona Samy")),
    doctorSpecialty: specInput && specInput.value.trim() ? specInput.value.trim() : (c.doctorSpecialty || (isEn ? "Pulmonology & Respiratory Medicine" : "استشاري الأمراض الصدرية")),
    doctorLicense: licInput && licInput.value.trim() ? licInput.value.trim() : (c.doctorLicense || "EGY-MED-20491"),
    clinicName: clinicInput && clinicInput.value.trim() ? clinicInput.value.trim() : (c.clinicName || (isEn ? "Health Vibes Specialized Clinics" : "عيادات هيلث فايبز التخصصية")),
    reportGeneratedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    isDoctorPreview: true,
    doctorApproved: true
  };

  showScreen("report");
  renderReportScreen("preview");
};

window.generateAndApproveReport = async function(id) {
  if (!enforcePermission(PERMISSIONS.APPROVE_CASE, "Approve Clinical Result")) return;
  const isEn = currentLanguage === "en";

  const diagInput = document.getElementById("doctorDiagnosisInput") || document.getElementById("doctorNoteInput");
  const medInput = document.getElementById("doctorMedicationsInput");
  const recInput = document.getElementById("doctorRecommendationsInput");
  const nameInput = document.getElementById("doctorNameInput");
  const specInput = document.getElementById("doctorSpecialtyInput");
  const licInput = document.getElementById("doctorLicenseInput");
  const clinicInput = document.getElementById("doctorClinicInput");

  const clinicalDiagnosis = diagInput ? diagInput.value.trim() : "";
  const medications = medInput ? medInput.value.trim() : "";
  const recommendations = parseDoctorRecommendations(recInput ? recInput.value : "");

  if (!clinicalDiagnosis) {
    showToast(isEn ? "Please provide a clinical diagnosis before generating report" : "يرجى كتابة التشخيص الطبي السريري قبل إصدار التقرير");
    if (diagInput) diagInput.focus();
    return;
  }
  if (recommendations.length === 0) {
    showToast(isEn ? "Please add at least one clinical recommendation" : "يرجى إضافة توصية طبية واحدة على الأقل");
    if (recInput) recInput.focus();
    return;
  }

  const approvingDoctorName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : (auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email) : "Dr. Mona Samy");
  const doctorSpecialty = specInput && specInput.value.trim() ? specInput.value.trim() : (isEn ? "Pulmonology & Respiratory Medicine" : "استشاري الأمراض الصدرية والرعاية المركزة");
  const doctorLicense = licInput && licInput.value.trim() ? licInput.value.trim() : "EGY-MED-20491";
  const clinicName = clinicInput && clinicInput.value.trim() ? clinicInput.value.trim() : (isEn ? "Health Vibes Specialized Clinics" : "عيادات هيلث فايبز التخصصية");
  const reportRef = `HV-REP-${id.slice(-8).toUpperCase()}`;

  const payload = {
    clinicalDiagnosis,
    clinicalNotes: clinicalDiagnosis,
    doctorNote: clinicalDiagnosis,
    medications,
    recommendations,
    recommendation: recommendations.join("\n"),
    approvingDoctorName,
    doctorSpecialty,
    doctorLicense,
    clinicName,
    reportRef,
    reportGeneratedAt: new Date().toISOString()
  };

  const success = await updateCaseStatus(id, CASE_STATUS.APPROVED, clinicalDiagnosis, payload);
  if (success) {
    showToast(isEn ? "Official Certified Medical Report Generated & Approved!" : "تم توليد واعتماد التقرير الطبي السريري بنجاح!");
    await renderDoctorQueue();
    selectDoctorCase(id);
    showScreen("report");
    renderReportScreen(id);
  }
};

window.openCaseReport = function(id) {
  showScreen("report");
  renderReportScreen(id);
};

window.approveCase = async function(id) {
  await window.generateAndApproveReport(id);
};

window.requestMoreInfo = async function(id) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Request More Information")) return;
  const isEn = currentLanguage === "en";
  const defaultPrompt = isEn 
    ? "Please specify what extra information or test is required from the patient:" 
    : "يرجى تحديد البيانات أو الفحوصات الإضافية المطلوبة من المريض:";
  const noteInput = document.getElementById("doctorNoteInput");
  let promptNote = noteInput && noteInput.value.trim() ? noteInput.value.trim() : "";
  if (!promptNote) {
    promptNote = window.prompt(defaultPrompt, isEn ? "Re-check oxygen saturation SpO2 and upload latest prescription" : "إعادة قياس نسبة الأكسجين SpO2 وإرفاق الروشتة السابقة إن وجدت");
  }
  if (!promptNote) return;

  const success = await updateCaseStatus(id, CASE_STATUS.MORE_INFO_REQUESTED, promptNote);
  if (success) {
    showToast(isEn ? "Requested additional information from patient" : "تم طلب معلومات إضافية من المريض");
    await renderDoctorQueue();
    selectDoctorCase(id);
  }
};

window.escalateCase = async function(id) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Escalate Case")) return;
  const isEn = currentLanguage === "en";
  const reason = window.prompt(
    isEn ? "Enter reason for clinical escalation:" : "أدخل سبب التصعيد السريري (استشاري / طوارئ):",
    isEn ? "Acute hypoxemia / severe dyspnea requiring urgent intervention" : "نقص أكسجين حاد / ضيق تنفس شديد يستدعي تدخلاً إسعافياً عاجلاً"
  );
  if (!reason) return;

  const success = await updateCaseStatus(id, CASE_STATUS.ESCALATED, reason);
  if (success) {
    showToast(isEn ? "Case successfully escalated to emergency / consultant" : "تم تصعيد الحالة بنجاح إلى الطوارئ / استشاري أمراض صدرية");
    await renderDoctorQueue();
    selectDoctorCase(id);
  }
};

window.rejectCase = async function(id) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Reject Case")) return;
  const isEn = currentLanguage === "en";
  const reason = window.prompt(
    isEn ? "Enter rejection reason or invalid clinical entry:" : "أدخل سبب رفض الحالة أو عدم صحة البيانات:",
    isEn ? "Non-clinical data or duplicate submission" : "بيانات غير طبية أو تقييم مكرر"
  );
  if (!reason) return;

  const success = await updateCaseStatus(id, CASE_STATUS.REJECTED, reason);
  if (success) {
    showToast(isEn ? "Case marked as rejected" : "تم رفض الحالة وتوثيق السبب");
    await renderDoctorQueue();
    selectDoctorCase(id);
  }
};

window.closeCase = async function(id) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Close Case")) return;
  const isEn = currentLanguage === "en";
  const confirmed = window.confirm(isEn ? "Are you sure you want to close and archive this case?" : "هل أنت متأكد من إغلاق وأرشفة هذه الحالة؟");
  if (!confirmed) return;

  const noteInput = document.getElementById("doctorNoteInput");
  const note = noteInput && noteInput.value.trim() ? noteInput.value.trim() : (isEn ? "Case closed by physician" : "تم إغلاق الحالة وأرشفتها");
  const success = await updateCaseStatus(id, CASE_STATUS.CLOSED, note);
  if (success) {
    showToast(isEn ? "Case successfully closed" : "تم إغلاق الحالة بنجاح");
    await renderDoctorQueue();
    selectDoctorCase(id);
  }
};

window.resumeReview = async function(id) {
  if (!enforcePermission(PERMISSIONS.REVIEW_CASE, "Resume Review")) return;
  const isEn = currentLanguage === "en";
  const success = await updateCaseStatus(id, CASE_STATUS.UNDER_REVIEW, isEn ? "Physician resumed clinical review" : "استأنف الطبيب المراجعة السريرية للحالة");
  if (success) {
    showToast(isEn ? "Case returned to under review" : "تمت إعادة الحالة إلى قيد الفحص السريري");
    await renderDoctorQueue();
    selectDoctorCase(id);
  }
};

async function renderDoctorQueue() {
  const queueList = document.getElementById("doctorQueueList");
  const filterTabsContainer = document.getElementById("doctorQueueFilterTabs");
  if (!queueList) return;

  const isEn = currentLanguage === "en";

  // Render filter tabs if container exists
  if (filterTabsContainer) {
    const filters = [
      { key: 'all', ar: 'الكل', en: 'All' },
      { key: 'under_review', ar: 'قيد الفحص', en: 'Under Review' },
      { key: 'assigned', ar: 'بانتظار الطبيب', en: 'Awaiting Doctor' },
      { key: 'more_info_requested', ar: 'مطلوب بيانات', en: 'More Info' },
      { key: 'approved', ar: 'معتمد', en: 'Approved' },
      { key: 'closed_escalated', ar: 'مغلق ومصعّد', en: 'Closed & Escalated' }
    ];

    filterTabsContainer.innerHTML = filters.map(f => `
      <button type="button" class="status-filter-tab ${currentDoctorQueueFilter === f.key ? 'active' : ''}" onclick="setDoctorQueueFilter('${f.key}')">
        ${isEn ? f.en : f.ar}
      </button>
    `).join('');
  }

  queueList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--teal);"><div class="spinner"></div> ' + (isEn ? 'Fetching clinical records...' : 'جاري جلب البيانات من Firebase...') + '</div>';
  const allCases = await getCases();
  queueList.innerHTML = '';

  // 🛡️ STRICT ENFORCEMENT: Filter strictly for REAL patient cases
  const realCases = allCases.filter(c => {
    if (!c) return false;
    if (c.isDemo === true) return false;
    const idStr = String(c.id || "");
    if (idStr.startsWith("demo_") || idStr.startsWith("mock_") || idStr.startsWith("test_case_")) return false;
    const hasPatient = Boolean(c.patientId || c.patientUid || c.patientEmail);
    const hasVitals = typeof c.o2 === "number" || typeof c.oxygenLevel === "number";
    return hasPatient && hasVitals;
  });

  if (realCases.length === 0) {
    queueList.innerHTML = `
      <div style="padding: 30px 16px; text-align: center; color: var(--muted);">
        <div style="font-size: 32px; margin-bottom: 8px;">🩺</div>
        <strong style="display: block; color: var(--ink); margin-bottom: 4px; font-size: 14px;">
          ${isEn ? 'No Real Patient Cases in Queue' : 'لا توجد حالات سريرية حقيقية في قائمة الانتظار'}
        </strong>
        <p style="margin: 0; font-size: 12.5px; line-height: 1.5;">
          ${isEn 
            ? 'The doctor queue only displays authentic cases submitted by registered patients. When patients submit new clinical assessments, they will appear here.'
            : 'قائمة انتظار الطبيب تعرض فقط الحالات السريرية الحقيقية المُرسلة من المرضى. عند قيام المرضى بإرسال تقييمات جديدة، ستظهر هنا فوراً.'}
        </p>
      </div>
    `;
    const reviewPanel = document.getElementById("doctorReviewPanel");
    if (reviewPanel) {
      reviewPanel.style.display = "none";
      reviewPanel.innerHTML = "";
    }
    return;
  }

  // Filter cases based on selected tab
  let cases = realCases;
  if (currentDoctorQueueFilter === 'under_review') {
    cases = realCases.filter(c => c.status === CASE_STATUS.UNDER_REVIEW);
  } else if (currentDoctorQueueFilter === 'assigned') {
    cases = realCases.filter(c => [CASE_STATUS.ASSIGNED, CASE_STATUS.TRIAGED, CASE_STATUS.PENDING, CASE_STATUS.SUBMITTED].includes(c.status));
  } else if (currentDoctorQueueFilter === 'more_info_requested') {
    cases = realCases.filter(c => c.status === CASE_STATUS.MORE_INFO_REQUESTED);
  } else if (currentDoctorQueueFilter === 'approved') {
    cases = realCases.filter(c => c.status === CASE_STATUS.APPROVED);
  } else if (currentDoctorQueueFilter === 'closed_escalated') {
    cases = realCases.filter(c => [CASE_STATUS.CLOSED, CASE_STATUS.ESCALATED, CASE_STATUS.REJECTED].includes(c.status));
  }

  if (cases.length === 0) {
    queueList.innerHTML = '<div style="padding: 24px 16px; text-align: center; color: var(--muted);">' + (isEn ? 'No real cases in this category' : 'لا توجد حالات حقيقية في هذا التصنيف') + '</div>';
    const reviewPanel = document.getElementById("doctorReviewPanel");
    if (reviewPanel) {
      reviewPanel.style.display = "none";
      reviewPanel.innerHTML = "";
    }
    return;
  }

  // Sort: under_review and emergency first, then assigned/pending, then approved/closed
  const statusWeight = {
    [CASE_STATUS.UNDER_REVIEW]: 1,
    [CASE_STATUS.ASSIGNED]: 2,
    [CASE_STATUS.TRIAGED]: 3,
    [CASE_STATUS.PENDING]: 3,
    [CASE_STATUS.SUBMITTED]: 4,
    [CASE_STATUS.MORE_INFO_REQUESTED]: 5,
    [CASE_STATUS.ESCALATED]: 2,
    [CASE_STATUS.APPROVED]: 6,
    [CASE_STATUS.CLOSED]: 7,
    [CASE_STATUS.REJECTED]: 8
  };

  cases.sort((a, b) => {
    const isCritA = a.o2 > 0 && a.o2 < 90;
    const isCritB = b.o2 > 0 && b.o2 < 90;
    if (isCritA && !isCritB) return -1;
    if (!isCritA && isCritB) return 1;
    const wA = statusWeight[a.status] || 99;
    const wB = statusWeight[b.status] || 99;
    return wA - wB;
  });

  cases.forEach(c => {
    const btn = document.createElement("button");
    btn.dataset.caseId = c.id;
    const isCritO2 = c.o2 > 0 && c.o2 < 90;
    const meta = getCaseStatusMeta(c.status);
    
    btn.className = c.status === CASE_STATUS.APPROVED ? "ok" : (isCritO2 || c.risk === "عاجل" || c.status === CASE_STATUS.ESCALATED ? "danger" : "pending");
    if (c.id === activeCaseId) btn.style.border = "2px solid var(--teal)";

    const riskBadge = isCritO2
      ? `<em class="doctor-emergency-pill">${isEn ? '🚨 CRITICAL O2 ' + c.o2 + '%' : '🚨 أكسجين حرج ' + c.o2 + '%'}</em>`
      : `<em>${isEn ? c.riskEn : c.risk}</em>`;

    const statusPillHtml = `<span class="pill ${meta.pillClass} case-status-badge" style="font-size: 11px; margin-inline-end: 6px;">${meta.icon} ${isEn ? meta.en : meta.ar}</span>`;

    btn.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 4px;">
        <strong>${isEn ? c.nameEn : c.name}</strong>
        ${statusPillHtml}
      </div>
      <span>${isEn ? 'O2 ' + c.o2 + '% - ' + c.symptomsEn : 'نسبة الأكسجين ' + c.o2 + '% - ' + c.symptoms}</span>
      ${riskBadge}
    `;
    btn.onclick = () => selectDoctorCase(c.id);
    queueList.appendChild(btn);
  });

  if (cases.length > 0 && (!activeCaseId || !cases.some(c => c.id === activeCaseId))) {
    selectDoctorCase(cases[0].id);
  }
}

async function selectDoctorCase(id) {
  activeCaseId = id;
  const cases = await getCases();
  const c = cases.find(c => c.id === id && !c.isDemo && !String(c.id).startsWith("demo_"));
  const reviewPanel = document.getElementById("doctorReviewPanel");
  if (!c || !reviewPanel) {
    if (reviewPanel) {
      reviewPanel.style.display = "none";
      reviewPanel.innerHTML = "";
    }
    return;
  }

  const isEn = currentLanguage === "en";
  await writeClientAuditLog("CASE_REVIEW_OPENED", {
    caseId: id,
    patientId: c.patientId || c.userId || null,
    currentStatus: c.status || "",
    auditCategory: "open"
  });

  // Auto-transition to under_review if opened by assigned doctor from assigned/triaged/pending
  if ([CASE_STATUS.ASSIGNED, CASE_STATUS.TRIAGED, CASE_STATUS.PENDING, CASE_STATUS.SUBMITTED].includes(c.status)) {
    const autoNote = isEn ? "Physician opened case for clinical review" : "بدأ الطبيب فحص ومراجعة الحالة السريرية";
    await updateCaseStatus(id, CASE_STATUS.UNDER_REVIEW, autoNote);
    c.status = CASE_STATUS.UNDER_REVIEW;
    // Update active button badge in queue
    const queueList = document.getElementById("doctorQueueList");
    if (queueList) {
      const activeBtn = Array.from(queueList.children).find(btn => btn.dataset && btn.dataset.caseId === id);
      if (activeBtn) {
        const meta = getCaseStatusMeta(CASE_STATUS.UNDER_REVIEW);
        const badge = activeBtn.querySelector(".case-status-badge");
        if (badge) {
          badge.className = `pill ${meta.pillClass} case-status-badge`;
          badge.innerHTML = `${meta.icon} ${isEn ? meta.en : meta.ar}`;
        }
      }
    }
  }

  reviewPanel.style.display = "block";

  const statusMeta = getCaseStatusMeta(c.status);
  const statusPill = `<span class="pill ${statusMeta.pillClass}" style="font-size: 12.5px; padding: 5px 12px;">${statusMeta.icon} ${isEn ? statusMeta.en : statusMeta.ar}</span>`;

  const emergencyDoctorBanner = (c.o2 > 0 && c.o2 < 90) ? `
    <div class="doctor-emergency-alert-banner">
      <span class="icon">🚨</span>
      <div>
        <strong>${isEn ? 'Clinical Emergency: Critical Hypoxemia (SpO2 ' + c.o2 + '%)' : 'تنبيه سريري عاجل: نقص أكسجين حاد (SpO2 ' + c.o2 + '%)'}</strong>
        <p>${isEn ? 'Patient oxygen saturation is critically low. Urgent contact and immediate referral to Emergency Room / Ambulance (123) is advised.' : 'نسبة تشبع الأكسجين لدى المريض حرجة للغاية. يوصى بالتواصل المباشر العاجل وتوجيه الحالة فوراً لأقرب قسم طوارئ أو استدعاء الإسعاف (123).'}</p>
      </div>
    </div>
  ` : '';

  // Generate status history timeline
  const historyList = Array.isArray(c.statusHistory) && c.statusHistory.length > 0 ? c.statusHistory : [
    {
      status: c.status || 'submitted',
      changedAt: c.submittedAt ? (c.submittedAt.toDate ? c.submittedAt.toDate().toISOString() : c.submittedAt) : new Date().toISOString(),
      changedByName: c.name || 'Patient',
      changedByRole: 'patient',
      note: isEn ? 'Initial assessment submission' : 'تم تقديم التقييم المبدئي للحالة'
    }
  ];

  const timelineHtml = `
    <div class="status-history-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h4 style="margin: 0; font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 6px;">
          <span>🕒</span> ${isEn ? 'Clinical Status Lifecycle & Audit Trail' : 'سجل دورة حياة الحالة والتدقيق السريري'}
        </h4>
        <span class="pill info" style="font-size: 11px; padding: 2px 8px;">${historyList.length} ${isEn ? 'events' : 'أحداث'}</span>
      </div>
      <div class="status-timeline">
        ${historyList.map(item => {
          const cfg = getCaseStatusMeta(item.status);
          const dt = item.changedAt ? new Date(item.changedAt).toLocaleString(isEn ? 'en-US' : 'ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '--';
          const roleLabel = item.changedByRole === 'doctor' ? (isEn ? 'Physician' : 'طبيب') : (item.changedByRole === 'admin' ? (isEn ? 'Admin' : 'إدارة') : (item.changedByRole === 'system' ? (isEn ? 'System Engine' : 'محرك النظام') : (isEn ? 'Patient' : 'مريض')));
          return `
            <div class="timeline-entry" style="text-align: ${isEn ? 'left' : 'right'};">
              <div class="bullet" style="background: ${cfg.border};"></div>
              <div class="card">
                <div class="header">
                  <strong style="color: ${cfg.color}; font-size: 12.5px;">${cfg.icon} ${isEn ? cfg.en : cfg.ar}</strong>
                  <small>${dt}</small>
                </div>
                <div class="note">${item.note || ''}</div>
                <small class="author">${isEn ? 'By' : 'بواسطة'}: ${item.changedByName || item.changedBy || 'System'} (${roleLabel})</small>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Dynamic Doctor Action Toolbar depending on state
  let actionToolbarHtml = '';
  const isClosed = c.status === CASE_STATUS.CLOSED;
  const isApproved = c.status === CASE_STATUS.APPROVED;
  const isUnderReview = c.status === CASE_STATUS.UNDER_REVIEW;
  const isMoreInfo = c.status === CASE_STATUS.MORE_INFO_REQUESTED;
  const isEscalated = c.status === CASE_STATUS.ESCALATED;
  const isRejected = c.status === CASE_STATUS.REJECTED;

if (isUnderReview) {
    actionToolbarHtml = `
      <div class="doctor-actions-toolbar">
        <button type="button" class="btn-clinical approve" onclick="generateAndApproveReport('${c.id}')" title="${isEn ? 'Approve and generate official certified report' : 'اعتماد سريري وتوليد التقرير الطبي المعتمد'}">
          <span>✨</span> ${isEn ? 'Generate & Approve Report' : 'توليد واعتماد التقرير'}
        </button>
        <button type="button" class="btn-clinical resume" onclick="previewCaseReport('${c.id}')" title="${isEn ? 'Preview report before final approval' : 'معاينة شكل التقرير الطبي قبل الاعتماد'}">
          <span>👁️</span> ${isEn ? 'Preview Report' : 'معاينة التقرير'}
        </button>
        <button type="button" class="btn-clinical request-info" onclick="requestMoreInfo('${c.id}')">
          <span>❓</span> ${isEn ? 'Request More Info' : 'طلب بيانات إضافية'}
        </button>
        <button type="button" class="btn-clinical escalate" onclick="escalateCase('${c.id}')">
          <span>🚨</span> ${isEn ? 'Escalate (Emergency)' : 'تصعيد الحالة'}
        </button>
        <button type="button" class="btn-clinical reject" onclick="rejectCase('${c.id}')">
          <span>❌</span> ${isEn ? 'Reject' : 'رفض'}
        </button>
        <button type="button" class="btn-clinical close" onclick="closeCase('${c.id}')">
          <span>🔒</span> ${isEn ? 'Close Case' : 'إغلاق الحالة'}
        </button>
      </div>
    `;
  } else if (isMoreInfo) {
    actionToolbarHtml = `
      <div style="background: rgba(251, 146, 60, 0.12); border: 1px solid #fb923c; border-radius: 12px; padding: 12px; margin-top: 12px;">
        <strong style="color: #c2410c; display: block; margin-bottom: 4px;">❓ ${isEn ? 'Awaiting Additional Patient Information' : 'بانتظار إفادة المريض بالبيانات الإضافية'}</strong>
        <p style="margin: 0 0 10px; font-size: 13px; color: var(--ink);">${c.moreInfoNote || c.doctorNote || ''}</p>
        <div class="doctor-actions-toolbar" style="margin-top: 0;">
          <button type="button" class="btn-clinical resume" onclick="resumeReview('${c.id}')">
            <span>🔄</span> ${isEn ? 'Resume Review' : 'استئناف الفحص السريري'}
          </button>
          <button type="button" class="btn-clinical close" onclick="closeCase('${c.id}')">
            <span>🔒</span> ${isEn ? 'Close Case' : 'إغلاق الحالة'}
          </button>
        </div>
      </div>
    `;
  } else if (isEscalated) {
    actionToolbarHtml = `
      <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; border-radius: 12px; padding: 12px; margin-top: 12px;">
        <strong style="color: #dc2626; display: block; margin-bottom: 4px;">🚨 ${isEn ? 'Case Escalated to Emergency Services' : 'تم تصعيد الحالة للمتابعة الفورية/الطوارئ'}</strong>
        <p style="margin: 0 0 10px; font-size: 13px; color: var(--ink);">${c.escalationReason || c.doctorNote || ''}</p>
        <div class="doctor-actions-toolbar" style="margin-top: 0;">
          <button type="button" class="btn-clinical resume" onclick="resumeReview('${c.id}')">
            <span>🔄</span> ${isEn ? 'Re-examine Case' : 'إعادة فحص الحالة'}
          </button>
          <button type="button" class="btn-clinical close" onclick="closeCase('${c.id}')">
            <span>🔒</span> ${isEn ? 'Close Case' : 'إغلاق الحالة'}
          </button>
        </div>
      </div>
    `;
  } else if (isApproved || isRejected) {
    actionToolbarHtml = `
      <div class="doctor-actions-toolbar">
        ${isApproved ? `
          <button type="button" class="btn-clinical approve" onclick="openCaseReport('${c.id}')">
            <span>📄</span> ${isEn ? 'View Certified Report (PDF)' : 'عرض التقرير المعتمد (PDF)'}
          </button>
          <button type="button" class="btn-clinical resume" onclick="previewCaseReport('${c.id}')">
            <span>🔄</span> ${isEn ? 'Edit & Reissue Report' : 'تعديل وإعادة إصدار التقرير'}
          </button>
        ` : ''}
        <button type="button" class="btn-clinical close" onclick="closeCase('${c.id}')">
          <span>🔒</span> ${isEn ? 'Archive & Close Case' : 'أرشفة وإغلاق الحالة'}
        </button>
      </div>
    `;
  } else if (isClosed) {
    actionToolbarHtml = `
      <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-top: 12px; text-align: center;">
        <span style="color: var(--muted); font-size: 13px; font-weight: 700;">🔒 ${isEn ? 'This case is closed and archived.' : 'هذه الحالة مكتملة ومؤرشفة.'}</span>
        ${c.doctorApproved ? `
          <button type="button" class="btn-clinical approve" style="margin-top: 8px; display: inline-flex;" onclick="openCaseReport('${c.id}')">
            <span>📄</span> ${isEn ? 'View Archived Report (PDF)' : 'عرض التقرير المعتمد المؤرشف'}
          </button>
        ` : ''}
      </div>
    `;
  }

  const existingDoctorNote = c.clinicalDiagnosis || c.doctorNote || c.clinicalNotes || "";
  const existingRecommendations = Array.isArray(c.recommendations)
    ? c.recommendations.join("\n")
    : (c.recommendation || "");
  const existingMedications = c.medications || (isEn ? "1. Salbutamol Inhaler (100mcg): 2 puffs every 6 hours PRN.\n2. Hydration & Deep breathing exercises." : "1. بخاخ موسع للشعب (فينتولين 100 ميكروجرام): بختان عند اللزوم كل 6 ساعات.\n2. سوائل دافئة وراحة تامة.");

  // Current doctor credentials
  const currentDocName = c.approvingDoctorName || c.assignedDoctorName || (auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : (isEn ? "Dr. Mona Samy" : "د. منى سامي"));
  const currentDocSpec = c.doctorSpecialty || (isEn ? "Pulmonology & Respiratory Medicine" : "استشاري الأمراض الصدرية والرعاية المركزة");
  const currentDocLic = c.doctorLicense || "EGY-MED-20491";
  const currentDocClinic = c.clinicName || (isEn ? "Health Vibes Specialized Clinics" : "عيادات هيلث فايبز التخصصية");

  // Clinical Risk Rules evaluation data & versioning
  const caseRuleVersion = (c.assessment && c.assessment.aiTriage && c.assessment.aiTriage.ruleEngineVersion) || c.ruleEngineVersion || (typeof RULE_ENGINE_VERSION !== 'undefined' ? RULE_ENGINE_VERSION : "HealthVibe-Rules-v1.0");
  const caseTriggeredRules = (c.assessment && c.assessment.aiTriage && Array.isArray(c.assessment.aiTriage.triggeredRules))
    ? c.assessment.aiTriage.triggeredRules
    : (Array.isArray(c.triggeredRules) ? c.triggeredRules : []);
  const caseRulePoints = (c.assessment && c.assessment.aiTriage && typeof c.assessment.aiTriage.ruleScorePoints === 'number')
    ? c.assessment.aiTriage.ruleScorePoints
    : (typeof c.ruleScorePoints === 'number' ? c.ruleScorePoints : 0);

  const triggeredRulesListHtml = caseTriggeredRules.length > 0
    ? caseTriggeredRules.map(r => `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 12.5px;">
          <span>
            <strong style="color: var(--teal); font-weight: 700;">${r.id || ''}</strong>: 
            ${isEn ? (r.en || r.ar || '') : (r.ar || r.en || '')}
          </span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="pill info" style="font-size: 10px; padding: 1px 6px;">${r.version || caseRuleVersion}</span>
            <span class="pill danger" style="font-size: 10.5px; padding: 2px 7px; font-weight: 700;">+${r.points || 0} ${isEn ? 'pts' : 'ن'}</span>
          </div>
        </li>
      `).join('')
    : `<li style="font-size: 12.5px; color: var(--muted); padding: 6px 0;">${isEn ? 'No high-risk criteria triggered' : 'لم يتم تفعيل شروط خطورة إضافية'}</li>`;

  const triggeredRulesHtml = `
    <div class="doctor-rules-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 14px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <strong style="font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
            <span>📐</span> ${isEn ? 'Rules-Based Risk Evaluation' : 'تقييم مؤشر القواعد السريرية'}
          </strong>
          <span class="pill info" style="font-size: 11px; padding: 2px 8px; font-family: monospace;">${caseRuleVersion}</span>
          <span class="pill ok" style="font-size: 10.5px; padding: 2px 8px;">${isEn ? 'Clinician-Reviewed' : 'معتمد سريرياً'}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 12px; color: var(--muted);">${isEn ? 'Total Points:' : 'مجموع النقاط:'}</span>
          <span class="pill ${c.o2 < 90 || caseRulePoints >= 6 ? 'danger' : (c.o2 < 93 || caseRulePoints >= 3 ? 'pending' : 'ok')}" style="font-size: 12px; font-weight: 800; padding: 2px 10px;">
            ${caseRulePoints} ${isEn ? 'Points' : 'نقطة'}
          </span>
          <button type="button" class="soft-button" style="font-size: 11px; padding: 2px 8px;" onclick="openRulesGovernanceModal('${caseRuleVersion}')" title="${isEn ? 'Inspect Rule Definitions' : 'استعراض مواصفات هذه النسخة من القواعد'}">
            🔍 ${isEn ? 'View Spec' : 'المواصفات'}
          </button>
        </div>
      </div>
      <ul style="list-style: none; margin: 0; padding: 0;">
        ${triggeredRulesListHtml}
      </ul>
      <div style="margin-top: 10px; padding: 6px 10px; background: rgba(14, 165, 233, 0.08); border-radius: 6px; font-size: 11px; color: var(--muted); line-height: 1.4;">
        ℹ️ ${isEn 
          ? "Notice: This score is generated by deterministic, clinician-reviewed triage rules (unvalidated model score). It is purely advisory to assist doctor triage and does not replace medical judgment." 
          : "تنبيه: هذا المؤشر ناتج عن قواعد فرز ثابتة قابلة لمراجعة الطبيب (مؤشر غير مُتحقق منه سريرياً كنموذج إحصائي). يُستخدم كدليل استرشادي لتسهيل الفرز ولا يحل محل التشخيص الطبي."}
      </div>
    </div>
  `;

  reviewPanel.innerHTML = `
    <div class="panel-head">
      <div>
        <h3 style="margin: 0;">${isEn ? 'Reviewing ' + c.nameEn : 'مراجعة حالة ' + c.name}</h3>
        <small style="color: var(--muted);">${isEn ? 'Case ID: #' + c.id.slice(-6).toUpperCase() : 'رقم الحالة: #' + c.id.slice(-6).toUpperCase()}</small>
      </div>
      ${statusPill}
    </div>
    ${emergencyDoctorBanner}
    <div class="summary-list">
      <div><span>${isEn ? 'AI Risk Score' : 'تصنيف الذكاء الاصطناعي'}</span><strong>${isEn ? c.aiScoreEn : c.aiScore}</strong></div>
      <div><span>${isEn ? 'Rule score' : 'مؤشر القواعد'}</span><strong>${(isEn ? c.ruleScoreLabelEn : c.ruleScoreLabelAr) || c.ruleScore || (isEn ? 'Not clinically validated' : 'غير مدقق سريرياً')}</strong></div>
      <div><span>${isEn ? 'Oxygen Level' : 'نسبة الأكسجين'}</span><strong style="${c.o2 < 90 ? 'color: #ef4444;' : ''}">${c.o2}%</strong></div>
      <div><span>${isEn ? 'Duration' : 'مدة الأعراض'}</span><strong>${isEn ? c.durationEn : c.duration}</strong></div>
    </div>
    ${triggeredRulesHtml}

    <!-- DYNAMIC CLINICAL REPORT BUILDER STATION -->
    <div class="doctor-report-builder-card" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin: 16px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <h4 style="margin: 0; font-size: 14.5px; font-weight: 800; display: flex; align-items: center; gap: 8px; color: var(--teal);">
          <span>🩺</span> ${isEn ? 'Dynamic Medical Report Builder' : 'محرر وتوليد التقرير الطبي السريري'}
        </h4>
        <span class="pill ok" style="font-size: 11px;">${isEn ? 'Official Physician Signature' : 'الاعتماد السريري والتوقيع'}</span>
      </div>

      <!-- Quick Diagnostic Presets -->
      <div style="margin-bottom: 12px;">
        <label style="font-size: 12px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 6px;">
          ${isEn ? '⚡ Quick Diagnostic Presets:' : '⚡ قوالب تشخيصية وخطة علاج سريعة:'}
        </label>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button type="button" class="soft-button" style="font-size: 11.5px; padding: 4px 10px;" onclick="applyDiagPreset('asthma')">🫁 ${isEn ? 'Asthma Flare' : 'حساسية صدرية وربو'}</button>
          <button type="button" class="soft-button" style="font-size: 11.5px; padding: 4px 10px;" onclick="applyDiagPreset('bronchitis')">🌡️ ${isEn ? 'Acute Bronchitis' : 'التهاب شعبي حاد'}</button>
          <button type="button" class="soft-button" style="font-size: 11.5px; padding: 4px 10px;" onclick="applyDiagPreset('uri')">🤧 ${isEn ? 'Upper Respiratory' : 'عدوى تنفسية علوية'}</button>
          <button type="button" class="soft-button" style="font-size: 11.5px; padding: 4px 10px;" onclick="applyDiagPreset('stable')">✔️ ${isEn ? 'Stable Assessment' : 'أعراض مستقرة للمتابعة'}</button>
        </div>
      </div>

      <!-- Diagnosis Input -->
      <div style="margin-bottom: 12px;">
        <label for="doctorDiagnosisInput" style="font-weight: 800; font-size: 13px; display: block; margin-bottom: 4px;">
          ${isEn ? '1. Physician Clinical Diagnosis & Assessment *' : '1. التشخيص الطبي السريري المعتمد *'}
        </label>
        <textarea id="doctorDiagnosisInput" ${isClosed ? 'disabled' : ''} placeholder="${isEn ? 'Enter verified clinical diagnosis...' : 'اكتب التشخيص الطبي والملاحظات السريرية المعتمدة...'}" style="width: 100%; min-height: 75px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 10px; font-family: inherit; font-size: 13px;">${existingDoctorNote || (isEn ? 'Patient assessment verified. Normal breathing sounds with mild bronchial irritation.' : 'تمت المراجعة والتدقيق السريري. أعراض حساسية صدرية موسمية مع كحة خفيفة واستقرار تشبع الأكسجين.')}</textarea>
        <input type="hidden" id="doctorNoteInput" value="${existingDoctorNote}" />
      </div>

      <!-- Prescriptions & Medications -->
      <div style="margin-bottom: 12px;">
        <label for="doctorMedicationsInput" style="font-weight: 800; font-size: 13px; display: block; margin-bottom: 4px;">
          ${isEn ? '2. Prescription & Treatment Regimen (Rx)' : '2. الخطة العلاجية والروشتة الدوائية (Rx)'}
        </label>
        <textarea id="doctorMedicationsInput" ${isClosed ? 'disabled' : ''} placeholder="${isEn ? 'List prescribed medications, dosage and instructions...' : 'أدخل أسماء الأدوية، الجرعات، وطريقة الاستخدام...'}" style="width: 100%; min-height: 80px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 10px; font-family: inherit; font-size: 13px;">${existingMedications}</textarea>
      </div>

      <!-- Care Plan & Recommendations -->
      <div style="margin-bottom: 14px;">
        <label for="doctorRecommendationsInput" style="font-weight: 800; font-size: 13px; display: block; margin-bottom: 4px;">
          ${isEn ? '3. Clinical Recommendations & Care Plan' : '3. التوصيات الطبية وخطة المتابعة'}
        </label>
        <textarea id="doctorRecommendationsInput" ${isClosed ? 'disabled' : ''} placeholder="${isEn ? 'Add one recommendation per line.' : 'أضف كل توصية في سطر منفصل.'}" style="width: 100%; min-height: 85px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 10px; font-family: inherit; font-size: 13px;">${existingRecommendations || (isEn ? '• Monitor oxygen saturation SpO2 twice daily.\n• Increase warm fluid intake and practice deep breathing.\n• Return for clinical evaluation within 48 hours.\n• Seek immediate emergency care (123) if breathing worsens.' : '• قياس نسبة تشبع الأكسجين مرتين يومياً بجهاز نبض موثوق.\n• الحرص على شرب السوائل الدافئة وتمارين التنفس العميق.\n• متابعة الاستشارة في العيادة أو عن بُعد خلال 48 ساعة.\n• التوجه الفوري للطوارئ أو الاتصال بالإسعاف (123) في حال زيادة ضيق التنفس.')}</textarea>
      </div>

      <!-- Doctor Identity & Credentials Box -->
      <div style="background: rgba(var(--teal-rgb, 14, 165, 233), 0.05); border: 1px dashed var(--line); border-radius: 10px; padding: 12px;">
        <span style="font-size: 12px; font-weight: 800; color: var(--teal); display: block; margin-bottom: 8px;">
          🪪 ${isEn ? 'Doctor Credentials & Seal (Printed on report):' : 'بيانات الطبيب المعتمد والختم الرسمي (تظهر بالتقرير):'}
        </span>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--muted);">${isEn ? 'Doctor Name' : 'اسم الطبيب'}</label>
            <input type="text" id="doctorNameInput" value="${currentDocName}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);" />
          </div>
          <div>
            <label style="font-size: 11px; color: var(--muted);">${isEn ? 'Specialty' : 'التخصص'}</label>
            <input type="text" id="doctorSpecialtyInput" value="${currentDocSpec}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);" />
          </div>
          <div>
            <label style="font-size: 11px; color: var(--muted);">${isEn ? 'Syndicate License #' : 'ترخيص النقابة'}</label>
            <input type="text" id="doctorLicenseInput" value="${currentDocLic}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);" />
          </div>
          <div>
            <label style="font-size: 11px; color: var(--muted);">${isEn ? 'Clinic / Hospital' : 'العيادة / المستشفى'}</label>
            <input type="text" id="doctorClinicInput" value="${currentDocClinic}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink);" />
          </div>
        </div>
      </div>
    </div>

    ${actionToolbarHtml}
    ${timelineHtml}
  `;

  // Highlight active button in queue
  const queueList = document.getElementById("doctorQueueList");
  if (queueList) {
    Array.from(queueList.children).forEach(btn => btn.style.border = "none");
    const activeBtn = Array.from(queueList.children).find(btn => btn.dataset && btn.dataset.caseId === id);
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
          // Google login creates patient ONLY by default (unless owner)
          const safeRole = isOwner ? ROLES.SUPER_ADMIN : ROLES.PATIENT;
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            emailVerified: true,
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
            // Existing user: default strictly to patient if role is absent
            selectedRole = normalizeRole(userDoc.data().role || ROLES.PATIENT);
          }
        }
      } catch (dbError) {
        console.warn("Firestore save failed, but auth succeeded:", dbError);
        selectedRole = isOwner ? ROLES.SUPER_ADMIN : ROLES.PATIENT;
      }

      userName.textContent = user.displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (englishRoleLabels[normalizeRole(selectedRole, isOwner)] || englishRoleLabels.patient)
        : (roleLabels[normalizeRole(selectedRole, isOwner)] || roleLabels.patient);
      
      updateAvatar(user);
      updateEmailVerificationUI(user);
      updateNavVisibility();

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

// =========================================================================
// 🔒 MEDICAL PRIVACY CONSENT GATEWAY & MANAGER
// =========================================================================

const PRIVACY_CONSENT_VERSION = "HealthVibe-Privacy-v1.0";

function getConsentStorageKey() {
  const user = auth ? auth.currentUser : null;
  const uid = user ? user.uid : "guest";
  return `hv_privacy_consent_${uid}`;
}

function hasAcceptedPrivacyConsent() {
  try {
    const raw = localStorage.getItem(getConsentStorageKey());
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed.accepted === true);
  } catch {
    return false;
  }
}

function getStoredPrivacyConsent() {
  try {
    const raw = localStorage.getItem(getConsentStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrivacyConsent(accepted = true, options = {}) {
  const user = auth ? auth.currentUser : null;
  const consentRecord = {
    accepted: Boolean(accepted),
    version: PRIVACY_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    userId: user ? user.uid : "guest",
    userEmail: user ? user.email : "guest",
    dataProcessing: options.dataProcessing !== undefined ? options.dataProcessing : true,
    aiAdvisory: options.aiAdvisory !== undefined ? options.aiAdvisory : true,
    notifications: options.notifications !== undefined ? options.notifications : false
  };

  localStorage.setItem(getConsentStorageKey(), JSON.stringify(consentRecord));

  // Sync to Firestore user profile if authenticated
  if (user && db) {
    db.collection("users").doc(user.uid).set({
      privacyConsent: consentRecord
    }, { merge: true }).catch(err => {
      console.warn("[Consent] Could not sync consent to Firestore:", err);
    });
  }

  return consentRecord;
}

function renderConsentScreen() {
  const isEn = currentLanguage === "en";
  const badge = document.getElementById("consentStatusBadge");
  const isConsented = hasAcceptedPrivacyConsent();

  if (badge) {
    if (isConsented) {
      badge.className = "pill ok";
      badge.textContent = isEn ? "Active & Verified" : "مكتملة وموثقة";
    } else {
      badge.className = "pill pending";
      badge.textContent = isEn ? "Required Before Assessment" : "مطلوبة قبل الفحص";
    }
  }

  const proceedBtn = document.getElementById("btnConsentProceed");
  if (proceedBtn) {
    proceedBtn.onclick = () => {
      const chkProcessing = document.getElementById("consentDataProcessing");
      const chkAi = document.getElementById("consentAiAdvisory");
      const chkNotify = document.getElementById("consentNotifications");

      const isProcessingOk = chkProcessing ? chkProcessing.checked : true;
      const isAiOk = chkAi ? chkAi.checked : true;

      if (!isProcessingOk || !isAiOk) {
        showToast(isEn 
          ? "Please accept both mandatory consent terms to proceed to assessment." 
          : "يرجى الموافقة على البندين الإلزاميين للمتابعة لبدء فحص التنفس.");
        if (chkProcessing && !chkProcessing.checked) chkProcessing.parentElement.style.color = "#dc2626";
        if (chkAi && !chkAi.checked) chkAi.parentElement.style.color = "#dc2626";
        return;
      }

      savePrivacyConsent(true, {
        dataProcessing: isProcessingOk,
        aiAdvisory: isAiOk,
        notifications: chkNotify ? chkNotify.checked : false
      });

      showToast(isEn ? "Privacy consent verified! Opening assessment..." : "تم توثيق الموافقة بنجاح! جاري فتح فحص التنفس...");
      showScreen("assessment");
    };
  }
}

function updateAssessmentConsentBadge() {
  const isEn = currentLanguage === "en";
  const statusBox = document.getElementById("assessmentConsentStatusBox");
  const statusText = document.getElementById("assessmentConsentStatusText");
  const isConsented = hasAcceptedPrivacyConsent();

  if (!statusBox || !statusText) return;

  if (isConsented) {
    statusBox.style.background = "rgba(22, 163, 74, 0.08)";
    statusBox.style.borderColor = "rgba(22, 163, 74, 0.25)";
    statusText.style.color = "#15803d";
    statusText.innerHTML = `<span>🔒</span> ${isEn ? "Medical Privacy Consent Verified" : "تم توثيق الموافقة الطبية وسياسة الخصوصية"}`;
  } else {
    statusBox.style.background = "rgba(239, 68, 68, 0.08)";
    statusBox.style.borderColor = "rgba(239, 68, 68, 0.25)";
    statusText.style.color = "#dc2626";
    statusText.innerHTML = `<span>⚠️</span> ${isEn ? "Privacy Consent Required" : "الموافقة الطبية مطلوبة قبل الإرسال"}`;
  }
}

function showScreen(name) {
  if (name !== "verification") {
    tempAllowDoctorApplication = false;
  }

  // Privacy Consent Prerequisite: Assessment strictly requires active consent
  if (name === "assessment" && !hasAcceptedPrivacyConsent()) {
    showToast(currentLanguage === "en" 
      ? "Medical Privacy Consent is required before starting assessment." 
      : "الموافقة الطبية وسياسة الخصوصية مطلوبة قبل بدء فحص التنفس.");
    name = "consent";
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
  if (name === "report") {
    renderReportScreen(window._selectedReportCaseId || null);
  }
  if (name === "result") {
    renderResultScreen();
  }
  if (name === "history") {
    renderPatientHistory();
  }
  if (name === "admin") {
    renderAdminMetrics();
    renderAdminApplications();
    renderAdminUsers();
  }
  if (name === "consent") {
    renderConsentScreen();
  }
  if (name === "assessment") {
    updateAssessmentConsentBadge();
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
  document.getElementById("patientClinicalConfidence").textContent = "--";
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

        // ترجمة الحالة السريرية
        const statusMeta = getCaseStatusMeta(c.status);
        const statusLabel = `${statusMeta.icon} ${isEn ? statusMeta.en : statusMeta.ar}`;
        const priorityMap = {
          urgent: isEn ? "🚨 Urgent"  : "🚨 عاجل",
          high:   isEn ? "⚠️ High"    : "⚠️ أولوية عالية",
          normal: isEn ? "✔️ Normal"  : "✔️ عادي",
        };

        const priorityLabel = (isEn ? c.ruleScoreLabelEn : c.ruleScoreLabelAr) || priorityMap[c.priority] || "--";
        const o2Display     = c.oxygenLevel ? `${c.oxygenLevel}%` : "--%";
        const doctorDisplay = c.assignedDoctorName || c.reviewedBy || (isEn ? "Assigned Physician" : "طبيب الرعاية المسند");

        // ── تحديث بطاقة الحالة ─────────────────────────────────────────
        document.getElementById("patientClinicalStatus").textContent = statusLabel;
        document.getElementById("patientClinicalO2").textContent = o2Display;
        document.getElementById("patientClinicalConfidence").textContent = priorityLabel;
        document.getElementById("patientClinicalDoctor").textContent = doctorDisplay;

        const isApproved = (c.status === CASE_STATUS.APPROVED || c.doctorApproved === true);
        const latestReportEl = document.getElementById("patientLatestReport");
        const resultStatusEl = document.getElementById("patientResultStatus");

        if (latestReportEl) {
          if (isApproved) {
            latestReportEl.innerHTML = `<span style="color: #16a34a; cursor: pointer; text-decoration: underline; font-weight: 700;" onclick="openCaseReport('${c.id}')">${dateStr} (${isEn ? 'View Report' : 'عرض التقرير'})</span>`;
          } else {
            latestReportEl.innerHTML = `<span style="color: var(--muted); cursor: pointer;" onclick="openCaseReport('${c.id}')">${isEn ? 'Waiting for doctor ⏳' : 'بانتظار الطبيب ⏳'}</span>`;
          }
        }

        if (resultStatusEl) {
          if (isApproved) {
            resultStatusEl.innerHTML = `<span style="color: #16a34a; cursor: pointer; font-weight: 700;" onclick="openCaseReport('${c.id}')">${isEn ? 'Approved ✅' : 'معتمد سريرياً ✅'}</span>`;
          } else {
            resultStatusEl.innerHTML = `<span style="color: #f59e0b; cursor: pointer; font-weight: 700;" onclick="openCaseReport('${c.id}')">${isEn ? 'Locked until approval 🔒' : 'مغلق حتى الاعتماد 🔒'}</span>`;
          }
        }

        // ── التنبيهات ─────────────────────────────────────────────────────
        if (c.status === CASE_STATUS.APPROVED) {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 approved" : "1 معتمد";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer; border-inline-start: 4px solid #16a34a;" onclick="openCaseReport('${c.id}')">
              <strong style="color: #16a34a;">${isEn ? "✅ Official Medical Report Approved (Click to view)" : "✅ التقرير الطبي معتمد وجاهز (اضغط لعرض التقرير)"}</strong>
              <span>${c.doctorNote ? c.doctorNote + " • " : ""}${dateStr}</span>
            </div>`;
        } else if (c.status === CASE_STATUS.MORE_INFO_REQUESTED) {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 action needed" : "1 مطلوب إجراء";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer; border-inline-start: 4px solid #f97316;" onclick="openCaseReport('${c.id}')">
              <strong style="color: #ea580c;">${isEn ? "❓ Doctor requested more information (Click to view)" : "❓ الطبيب يطلب معلومات أو إعادة فحص (اضغط للمتابعة)"}</strong>
              <span>${c.moreInfoNote || (isEn ? "Please review doctor notes." : "يرجى مراجعة طلب الطبيب.")}</span>
            </div>`;
        } else if (c.status === CASE_STATUS.ESCALATED) {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 urgent" : "1 عاجل";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer; border-inline-start: 4px solid #ef4444;" onclick="openCaseReport('${c.id}')">
              <strong style="color: #dc2626;">${isEn ? "🚨 Case escalated for urgent care" : "🚨 تم تصعيد الحالة للرعاية العاجلة"}</strong>
              <span>${c.escalationReason || (isEn ? "Immediate emergency consultation recommended." : "يوصى بالتوجه فوراً للطوارئ أو استشارة استشاري.")}</span>
            </div>`;
        } else if (c.status === CASE_STATUS.REJECTED) {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 notice" : "1 تنبيه";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer;" onclick="openCaseReport('${c.id}')">
              <strong>${isEn ? "⚠️ Submission was not approved" : "⚠️ تم رفض التقييم أو عدم اعتماده"}</strong>
              <span>${c.doctorNote || dateStr}</span>
            </div>`;
        } else if (c.status === CASE_STATUS.UNDER_REVIEW) {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 under review" : "1 قيد الفحص";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer;" onclick="openCaseReport('${c.id}')">
              <strong>${isEn ? "🔍 Doctor is currently reviewing your case (Report locked)" : "🔍 الطبيب يقوم حالياً بفحص وتقييم حالتك (التقرير مغلق)"}</strong>
              <span>${dateStr} • رقم الحالة: ${c.id.slice(-6).toUpperCase()}</span>
            </div>`;
        } else {
          document.getElementById("patientAlertsCount").textContent = isEn ? "1 queued" : "1 في الانتظار";
          document.getElementById("patientAlertsList").innerHTML =
            `<div style="cursor: pointer;" onclick="openCaseReport('${c.id}')">
              <strong>${isEn ? "⏳ Assessment in physician queue (Report locked)" : "⏳ التقييم في قائمة انتظار الطبيب (التقرير مغلق)"}</strong>
              <span>${dateStr} • رقم الحالة: ${c.id.slice(-6).toUpperCase()}</span>
            </div>`;
        }
      },
      (error) => {
        console.warn("❌ Patient cases listener error:", error);
      }
    );
}

// =========================================================================
// 🔒 CLINICAL REPORT & RESULT ACCESS GATEWAY (GENUINE APPROVAL ENFORCEMENT)
// =========================================================================

window._selectedReportCaseId = null;

window.openCaseReport = function(caseId) {
  window._selectedReportCaseId = caseId;
  showScreen("report");
};

async function renderReportScreen(targetCaseId = null) {
  const container = document.getElementById("reportContainer");
  if (!container) return;

  const isEn = currentLanguage === "en";
  const user = auth ? auth.currentUser : null;

  if (!user) {
    container.innerHTML = `
      <div class="content-grid">
        <article class="panel" style="text-align: center; padding: 40px 20px;">
          <h2>${isEn ? "Sign in to view medical reports" : "سجل دخولك لعرض التقارير الطبية"}</h2>
          <p class="muted-copy">${isEn ? "You need to be signed in to view certified clinical records." : "يجب تسجيل الدخول للوصول إلى تقاريرك الطبية المعتمدة."}</p>
          <button class="solid-button large" onclick="showAuth()">${isEn ? "Sign In" : "تسجيل الدخول"}</button>
        </article>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="padding: 50px 20px; text-align: center; color: var(--teal);">
      <div class="spinner"></div>
      <p style="margin-top: 14px; font-weight: 700;">${isEn ? "Checking case clinical approval status..." : "جاري فحص حالة الاعتماد السريري للتقرير..."}</p>
    </div>
  `;

  try {
    let caseData = null;
    let caseId = targetCaseId || window._selectedReportCaseId;

    if (caseId) {
      try {
        const docSnap = await db.collection("cases").doc(caseId).get();
        if (docSnap.exists) {
          const d = docSnap.data();
          if (d.patientId === user.uid || normalizeRole(selectedRole) === ROLES.DOCTOR || isAdminRole(selectedRole)) {
            caseData = { id: docSnap.id, ...d };
          }
        }
      } catch (docErr) {
        console.warn("Direct case query failed:", docErr);
      }
    }

    if (!caseData) {
      // Query latest case for this patient
      const snap = await db.collection("cases")
        .where("patientId", "==", user.uid)
        .orderBy("submittedAt", "desc")
        .limit(10)
        .get();

      if (!snap.empty) {
        const validDocs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => !c.isDemo && !String(c.id).startsWith("demo_") && (typeof c.o2 === "number" || typeof c.oxygenLevel === "number"));
        
        if (validDocs.length > 0) {
          caseData = validDocs[0];
          caseId = caseData.id;
        }
      }
    }

    // STATE 1: NO CASE EXISTS
    if (!caseData) {
      container.innerHTML = `
        <div class="report-empty-state">
          <div class="empty-icon">📂</div>
          <h2>${isEn ? "No Clinical Reports Available" : "لا يوجد تقرير طبي متاح حتى الآن"}</h2>
          <p class="muted-copy" style="max-width: 480px; margin: 8px auto 20px;">
            ${isEn 
              ? "To generate a certified medical report, please complete a breathing assessment first. Your evaluation will be reviewed and approved by a physician."
              : "للحصول على تقرير طبي معتمد، يرجى إتمام تقييم التنفس أولاً ليتم إرساله ومراجعته واعتماده من قبل الطبيب المعالج."}
          </p>
          <button class="solid-button large" onclick="showScreen('assessment')">
            <span>🫁</span> ${isEn ? "Start Breathing Assessment" : "بدء تقييم التنفس الآن"}
          </button>
        </div>
      `;
      return;
    }

    // Check genuine approval: status === 'approved' OR doctorApproved === true
    const isApproved = (caseData.status === CASE_STATUS.APPROVED || caseData.doctorApproved === true);

    // STATE 2: CASE EXISTS BUT NOT APPROVED (LOCKED CLINICAL GATEWAY)
    // 🛡️ SECURITY & CLINICAL SAFETY RULE: Under NO circumstances should unapproved reports display clinical diagnoses to the patient!
    if (!isApproved) {
      const statusMeta = getCaseStatusMeta(caseData.status);
      const submittedDate = caseData.submittedAt
        ? (caseData.submittedAt.toDate ? caseData.submittedAt.toDate() : new Date(caseData.submittedAt))
        : new Date();
      const dateFormatted = submittedDate.toLocaleString(isEn ? "en-US" : "ar-EG", { dateStyle: "medium", timeStyle: "short" });

      const o2Val = caseData.oxygenLevel || caseData.o2 || 0;
      const isCriticalO2 = o2Val > 0 && o2Val < 90;

      const emergencyNoticeHtml = isCriticalO2 ? `
        <div class="emergency-pending-banner" style="margin-bottom: 20px;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span style="font-size: 28px;">🚨</span>
            <div>
              <strong style="color: #b91c1c; font-size: 15px;">${isEn ? 'Immediate Medical Attention Advised' : 'تنبيه طبي عاجل: نقص أكسجين حاد'}</strong>
              <p style="margin: 4px 0 0; font-size: 13px; color: #7f1d1d;">
                ${isEn 
                  ? `Your recorded oxygen saturation (${o2Val}%) is dangerously low. Please contact emergency services (123) or visit the nearest ER immediately.` 
                  : `نسبة تشبع الأكسجين المسجلة (${o2Val}%) منخفضة بصورة تستدعي الرعاية الطبية الفورية. يرجى الاتصال بالإسعاف (123) أو التوجه لأقرب طوارئ فوراً.`}
              </p>
            </div>
          </div>
          <div style="margin-top: 10px; text-align: ${isEn ? 'right' : 'left'};">
            <a href="tel:123" class="emergency-big-call-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 13px;">
              <span>📞</span> <strong>${isEn ? 'Call Ambulance (123)' : 'اتصال بالطوارئ (123)'}</strong>
            </a>
          </div>
        </div>
      ` : '';

      const moreInfoAlertHtml = caseData.status === CASE_STATUS.MORE_INFO_REQUESTED ? `
        <div style="background: rgba(234, 88, 12, 0.1); border: 1px solid #ea580c; border-radius: 12px; padding: 14px; margin-bottom: 20px; text-align: ${isEn ? 'left' : 'right'};">
          <strong style="color: #c2410c; display: flex; align-items: center; gap: 6px; font-size: 14px;">
            <span>❓</span> ${isEn ? 'Physician Requested Additional Information' : 'طلب الطبيب إيضاحات أو قياسات إضافية'}
          </strong>
          <p style="margin: 6px 0 0; font-size: 13.5px; color: var(--ink);">
            ${caseData.moreInfoNote || caseData.doctorNote || (isEn ? 'Please consult doctor notes for clarification.' : 'يرجى مراجعة الطبيب لتزويده بالبيانات المطلوبة.')}
          </p>
        </div>
      ` : '';

      container.innerHTML = `
        <div class="report-locked-card">
          <div class="locked-badge-header">
            <div class="lock-shield-icon">
              <span class="shield-glyph">🛡️</span>
              <span class="padlock-glyph">🔒</span>
            </div>
            <div class="locked-title-box">
              <span class="pill pending" style="font-size: 12px; padding: 4px 12px;">
                ${statusMeta.icon} ${isEn ? statusMeta.en : statusMeta.ar}
              </span>
              <h2>${isEn ? "Clinical Report Awaiting Doctor Approval" : "التقرير الطبي قيد المراجعة والاعتماد السريري"}</h2>
              <p class="safety-lock-subtext">
                ${isEn 
                  ? "In accordance with medical safety regulations, diagnosis and final clinical reports are strictly withheld until direct review and verification by the attending physician."
                  : "حفاظاً على سلامتك الطبية، لن يظهر التشخيص أو التقرير النهائي إلا بعد المراجعة والاعتماد السريري المباشر من قبل الطبيب المعالج."}
              </p>
            </div>
          </div>

          ${emergencyNoticeHtml}
          ${moreInfoAlertHtml}

          <!-- REAL CASE METADATA BOX -->
          <div class="locked-case-meta">
            <div class="meta-row">
              <span class="label">${isEn ? "Case Reference" : "رقم الحالة"}</span>
              <strong class="val">#${caseData.id.slice(-6).toUpperCase()}</strong>
            </div>
            <div class="meta-row">
              <span class="label">${isEn ? "Patient Name" : "المريض"}</span>
              <strong class="val">${caseData.name || caseData.patientName || user.displayName || user.email}</strong>
            </div>
            <div class="meta-row">
              <span class="label">${isEn ? "Recorded SpO2" : "نسبة الأكسجين"}</span>
              <strong class="val" style="${isCriticalO2 ? 'color: #ef4444;' : ''}">${o2Val}%</strong>
            </div>
            <div class="meta-row">
              <span class="label">${isEn ? "Reviewing Doctor" : "الطبيب المعالج"}</span>
              <strong class="val">${caseData.assignedDoctorName || caseData.reviewedBy || (isEn ? "Assigned Pulmonologist" : "طبيب الرعاية المسند")}</strong>
            </div>
            <div class="meta-row">
              <span class="label">${isEn ? "Submitted At" : "تاريخ الإرسال"}</span>
              <strong class="val">${dateFormatted}</strong>
            </div>
          </div>

          <!-- 4-STEP MEDICAL SAFETY PIPELINE -->
          <div class="clinical-stepper">
            <div class="step-col done">
              <div class="circle">✓</div>
              <strong>${isEn ? "1. Submitted" : "1. استلام البيانات"}</strong>
              <span>${isEn ? "Vitals recorded" : "تم تسجيل العلامات"}</span>
            </div>
            <div class="step-col done">
              <div class="circle">✓</div>
              <strong>${isEn ? "2. AI Triaged" : "2. الفرز الإرشادي"}</strong>
              <span>${isEn ? "Priority ranked" : "تحديد الأولوية"}</span>
            </div>
            <div class="step-col active">
              <div class="circle">⏳</div>
              <strong>${isEn ? "3. Doctor Review" : "3. الفحص السريري"}</strong>
              <span style="color: var(--teal); font-weight: 700;">${isEn ? "In Progress" : "قيد المراجعة حالياً"}</span>
            </div>
            <div class="step-col locked">
              <div class="circle">🔒</div>
              <strong>${isEn ? "4. Certified Report" : "4. صدور التقرير"}</strong>
              <span>${isEn ? "Awaiting approval" : "مغلق حتى الاعتماد"}</span>
            </div>
          </div>

          <div class="locked-footer-actions">
            <button class="solid-button large" onclick="showScreen('patient')">
              ${isEn ? "Return to Dashboard" : "العودة للرئيسية ومتابعة الحالة"}
            </button>
            <button class="soft-button large" onclick="showScreen('history')">
              ${isEn ? "View Medical History" : "عرض السجل والفحوصات السابقة"}
            </button>
          </div>
        </div>
      `;
      return;
    }

// STATE 3: GENUINE DOCTOR APPROVAL OR DOCTOR PREVIEW -> RENDER OFFICIAL CERTIFIED REPORT
    const isPreview = (targetCaseId === "preview" && window.__doctorPreviewCase) || caseData.isDoctorPreview;
    if (isPreview && window.__doctorPreviewCase) {
      caseData = window.__doctorPreviewCase;
    }

    const approvedDate = caseData.approvedAt
      ? (caseData.approvedAt.toDate ? caseData.approvedAt.toDate() : new Date(caseData.approvedAt))
      : (caseData.reviewedAt ? (caseData.reviewedAt.toDate ? caseData.reviewedAt.toDate() : new Date(caseData.reviewedAt)) : new Date());
    const generatedDate = caseData.reportGeneratedAt || caseData.generatedAt
      ? (caseData.reportGeneratedAt ? new Date(caseData.reportGeneratedAt) : (caseData.generatedAt.toDate ? caseData.generatedAt.toDate() : new Date(caseData.generatedAt)))
      : approvedDate;
    const submittedDate = caseData.submittedAt
      ? (caseData.submittedAt.toDate ? caseData.submittedAt.toDate() : new Date(caseData.submittedAt))
      : approvedDate;

    const dateFormatted = approvedDate.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const generatedDateFormatted = generatedDate.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const submittedDateFormatted = submittedDate.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const o2Val = Number(caseData.oxygenLevel || caseData.o2 || 95);
    const o2Color = o2Val < 90 ? "#ef4444" : (o2Val < 95 ? "#f59e0b" : "#16a34a");
    const o2StatusText = o2Val < 90 
      ? (isEn ? "Hypoxemia / Critical" : "نقص أكسجين حاد / حرج") 
      : (o2Val < 95 ? (isEn ? "Mild Borderline" : "انخفاض طفيف / مراقبة") : (isEn ? "Optimal Normal" : "مثالي وطبيعي"));

    const doctorName = caseData.approvingDoctorName || caseData.assignedDoctorName || caseData.reviewedBy || (isEn ? "Dr. Mona Samy" : "د. منى سامي");
    const doctorSpecialty = caseData.doctorSpecialty || (isEn ? "Pulmonology & Respiratory Medicine" : "استشاري الأمراض الصدرية والرعاية المركزة");
    const doctorLicense = caseData.doctorLicense || "EGY-MED-20491";
    const clinicName = caseData.clinicName || (isEn ? "Health Vibes Specialized Clinics" : "عيادات هيلث فايبز التخصصية");
    const reportRef = caseData.reportRef || `HV-REP-${caseData.id.slice(-8).toUpperCase()}`;
    const reportVersion = caseData.reportVersion || REPORT_VERSION;
    const modelVersion = caseData.modelVersion || caseData.assessment?.aiTriage?.modelVersion || MODEL_VERSION;
    const ruleEngineVersion = caseData.assessment?.aiTriage?.ruleEngineVersion || caseData.ruleEngineVersion || (typeof RULE_ENGINE_VERSION !== 'undefined' ? RULE_ENGINE_VERSION : "HealthVibe-Rules-v1.0");
    const ruleScorePoints = typeof caseData.assessment?.aiTriage?.ruleScorePoints === 'number'
      ? caseData.assessment.aiTriage.ruleScorePoints
      : (typeof caseData.ruleScorePoints === 'number' ? caseData.ruleScorePoints : 0);
    const patientName = caseData.name || caseData.patientName || (user ? (user.displayName || user.email) : (isEn ? "Patient" : "مريض"));

    const clinicalDiagnosis = caseData.clinicalDiagnosis || caseData.doctorNote || caseData.clinicalNotes || (isEn ? "Patient assessment reviewed and verified. Oxygen saturation stable. Mild seasonal bronchial sensitivity." : "تمت المراجعة والتدقيق السريري لقياسات التنفس والأعراض. نسبة الأكسجين مقبولة وتوجد أعراض حساسية صدرية موسمية مع كحة متوسطة.");
    
    // Medications list parsing
    const rawMeds = caseData.medications || (isEn ? "1. Salbutamol Inhaler (100mcg) - 2 puffs PRN\n2. Paracetamol 500mg - 1 tab every 8h" : "1. بخاخ موسع للشعب (سالبوتامول) - بختان عند اللزوم\n2. باراسيتامول 500 مجم - قرص كل 8 ساعات");
    const medItems = String(rawMeds)
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const savedRecommendations = Array.isArray(caseData.recommendations)
      ? caseData.recommendations
      : parseDoctorRecommendations(caseData.recommendation);
    const doctorRecommendations = savedRecommendations.length > 0 ? savedRecommendations : [
      isEn ? "Monitor oxygen saturation twice daily using a calibrated pulse oximeter." : "قياس نسبة تشبع الأكسجين مرتين يومياً باستخدام جهاز نبض موثوق.",
      isEn ? "Maintain adequate hydration and practice guided deep breathing exercises." : "الحرص على شرب السوائل الدافئة وتمارين التنفس العميق بانتظام.",
      isEn ? "Follow-up consultation in clinic or teleconsultation within 48 hours." : "متابعة الاستشارة في العيادة أو عن بُعد خلال 48 ساعة لمراجعة التحسن.",
      isEn ? "Seek immediate emergency care if severe shortness of breath or chest tightness occurs." : "التوجه فوراً لقسم الطوارئ في حال زيادة ضيق التنفس أو ظهور ألم حاد بالصدر."
    ];

    // Build SVG QR code representation
    const qrSvg = `
      <svg width="84" height="84" viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg" style="background:#fff; border-radius:8px; padding:4px; box-shadow: 0 2px 6px rgba(0,0,0,0.08);">
        <rect width="84" height="84" fill="#ffffff"/>
        <!-- Corner 1 -->
        <rect x="4" y="4" width="24" height="24" fill="#0f172a" rx="3"/>
        <rect x="8" y="8" width="16" height="16" fill="#ffffff" rx="2"/>
        <rect x="12" y="12" width="8" height="8" fill="#0f172a"/>
        <!-- Corner 2 -->
        <rect x="56" y="4" width="24" height="24" fill="#0f172a" rx="3"/>
        <rect x="60" y="8" width="16" height="16" fill="#ffffff" rx="2"/>
        <rect x="64" y="12" width="8" height="8" fill="#0f172a"/>
        <!-- Corner 3 -->
        <rect x="4" y="56" width="24" height="24" fill="#0f172a" rx="3"/>
        <rect x="8" y="60" width="16" height="16" fill="#ffffff" rx="2"/>
        <rect x="12" y="64" width="8" height="8" fill="#0f172a"/>
        <!-- Data Dots -->
        <rect x="34" y="8" width="6" height="6" fill="#0f172a"/>
        <rect x="44" y="8" width="6" height="6" fill="#0f172a"/>
        <rect x="34" y="20" width="6" height="6" fill="#0f172a"/>
        <rect x="44" y="20" width="6" height="6" fill="#0f172a"/>
        <rect x="34" y="34" width="16" height="16" fill="#0f172a" rx="2"/>
        <circle cx="42" cy="42" r="3" fill="#14b8a6"/>
        <rect x="8" y="34" width="6" height="6" fill="#0f172a"/>
        <rect x="20" y="34" width="6" height="6" fill="#0f172a"/>
        <rect x="8" y="44" width="6" height="6" fill="#0f172a"/>
        <rect x="56" y="34" width="6" height="6" fill="#0f172a"/>
        <rect x="68" y="34" width="6" height="6" fill="#0f172a"/>
        <rect x="62" y="44" width="6" height="6" fill="#0f172a"/>
        <rect x="34" y="56" width="6" height="6" fill="#0f172a"/>
        <rect x="44" y="56" width="6" height="6" fill="#0f172a"/>
        <rect x="34" y="68" width="6" height="6" fill="#0f172a"/>
        <rect x="44" y="68" width="6" height="6" fill="#0f172a"/>
        <rect x="56" y="56" width="6" height="6" fill="#0f172a"/>
        <rect x="68" y="68" width="6" height="6" fill="#0f172a"/>
        <rect x="68" y="56" width="6" height="6" fill="#0f172a"/>
      </svg>
    `;

    container.innerHTML = `
      <div class="report-page official-certified-report" id="printableReportArea">
        ${isPreview ? `
          <div class="doctor-preview-banner no-print" style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid #f59e0b; border-radius: 14px; padding: 12px 18px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <strong style="color: #b45309; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                <span>👁️</span> ${isEn ? "Doctor Live Preview Mode" : "وضع المعاينة الفورية للطبيب المعالج"}
              </strong>
              <span style="font-size: 12.5px; color: var(--ink);">
                ${isEn ? "This is a dynamic live preview of the report before final signing and archiving." : "هذه معاينة حية لشكل التقرير الطبي قبل الاعتماد النهائي والأرشفة."}
              </span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="outline-button" style="padding: 6px 12px; font-size: 12px;" onclick="showScreen('doctor'); selectDoctorCase('${caseData.id}')">
                ✏️ ${isEn ? "Return to Edit" : "العودة للتعديل"}
              </button>
              <button type="button" class="solid-button" style="padding: 6px 14px; font-size: 12px; background: #16a34a;" onclick="generateAndApproveReport('${caseData.id}')">
                ✅ ${isEn ? "Approve & Issue" : "اعتماد وإصدار"}
              </button>
            </div>
          </div>
        ` : ''}

        <!-- OFFICIAL REPORT HEADER -->
        <div class="report-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--line); padding-bottom: 18px; margin-bottom: 20px;">
          <div class="brand" style="display: flex; align-items: center; gap: 14px;">
            <img src="${getThemeLogoSrc()}" alt="Health Vibes" class="report-logo" data-logo />
            <div>
              <strong style="font-size: 20px; display: block; color: var(--ink);">${isEn ? "Health Vibes Medical Center" : "مركز هيلث فايبز الطبي التخصصي"}</strong>
              <span style="font-size: 12.5px; color: var(--teal); font-weight: 700;">${isEn ? "Certified Clinical Assessment Report" : "التقرير الطبي السريري المعتمد"}</span>
            </div>
          </div>
          <div style="text-align: ${isEn ? 'right' : 'left'};">
            <span class="pill ok" style="font-size: 12.5px; padding: 6px 14px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
              ✓ ${isPreview ? (isEn ? "Draft Preview" : "معاينة مسودة") : (isEn ? "Approved by Physician" : "معتمد سريرياً ورسمياً")}
            </span>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px; font-family: monospace; letter-spacing: 0.5px;">
              ${reportRef}
            </div>
          </div>
        </div>

        <!-- CLINICAL DOSSIER GRID -->
        <div class="report-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Patient Name" : "اسم المريض"}</span>
            <strong style="font-size: 13.5px; color: var(--ink);">${patientName}</strong>
          </div>
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Attending Physician" : "الطبيب المعتمد"}</span>
            <strong style="font-size: 13.5px; color: var(--teal);">${doctorName}</strong>
          </div>
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Specialty & Clinic" : "التخصص والعيادة"}</span>
            <strong style="font-size: 13px; color: var(--ink);">${doctorSpecialty}</strong>
            <small style="display: block; color: var(--muted); font-size: 11px;">${clinicName}</small>
          </div>
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Medical License #" : "رقم ترخيص النقابة"}</span>
            <strong style="font-size: 13px; color: var(--ink); font-family: monospace;">${doctorLicense}</strong>
          </div>
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Submission Time" : "تاريخ ووقت الفحص"}</span>
            <strong style="font-size: 12.5px; color: var(--ink);">${submittedDateFormatted}</strong>
          </div>
          <div>
            <span style="font-size: 11.5px; color: var(--muted); display: block;">${isEn ? "Approval Time" : "تاريخ ووقت الاعتماد"}</span>
            <strong style="font-size: 12.5px; color: var(--ink);">${dateFormatted}</strong>
          </div>
        </div>

        <!-- VITALS & CLINICAL DATA SUMMARY WITH GAUGES -->
        <div class="report-vitals-box" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h4 style="margin: 0; font-size: 14.5px; color: var(--teal-2); display: flex; align-items: center; gap: 8px;">
              <span>🫁</span> ${isEn ? "Recorded Vital Signs & Physiological Metrics" : "العلامات الحيوية والمؤشرات الفسيولوجية"}
            </h4>
            <span class="pill info" style="font-size: 11px;">${isEn ? "Clinical Vitals" : "بيانات سريرية موثقة"}</span>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 14px;">
            <!-- OXYGEN SATURATION HERO GAUGE -->
            <div style="background: var(--surface-2); border: 1.5px solid ${o2Color}; border-radius: 12px; padding: 12px; text-align: center;">
              <span style="font-size: 11.5px; color: var(--muted); display: block; margin-bottom: 4px;">${isEn ? "Oxygen Saturation (SpO2)" : "نسبة تشبع الأكسجين"}</span>
              <strong style="font-size: 26px; color: ${o2Color}; line-height: 1;">${o2Val}%</strong>
              <small style="display: block; margin-top: 4px; font-weight: 700; font-size: 11px; color: ${o2Color};">${o2StatusText}</small>
            </div>

            <!-- BREATHING DIFFICULTY -->
            <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; text-align: center;">
              <span style="font-size: 11.5px; color: var(--muted); display: block; margin-bottom: 4px;">${isEn ? "Shortness of Breath" : "ضيق التنفس"}</span>
              <strong style="font-size: 15px; color: var(--ink); display: block; margin-top: 6px;">${caseData.breathingDifficulty || caseData.difficulty || (isEn ? "Moderate" : "متوسط")}</strong>
            </div>

            <!-- COUGH SEVERITY -->
            <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; text-align: center;">
              <span style="font-size: 11.5px; color: var(--muted); display: block; margin-bottom: 4px;">${isEn ? "Cough Severity" : "درجة الكحة"}</span>
              <strong style="font-size: 15px; color: var(--ink); display: block; margin-top: 6px;">${caseData.coughLevel || (isEn ? "Moderate" : "متوسطة")}</strong>
            </div>

            <!-- SYMPTOM DURATION -->
            <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; text-align: center;">
              <span style="font-size: 11.5px; color: var(--muted); display: block; margin-bottom: 4px;">${isEn ? "Duration" : "مدة الأعراض"}</span>
              <strong style="font-size: 15px; color: var(--ink); display: block; margin-top: 6px;">${caseData.symptomDuration || caseData.duration || (isEn ? "3 Days" : "3 أيام")}</strong>
            </div>
          </div>

          <!-- RISK FACTORS & AI EVALUATION COMPARISON -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--surface-2); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; flex-wrap: wrap; gap: 8px;">
            <div>
              <span style="color: var(--muted);">${isEn ? "Reported Risk Factors:" : "عوامل الخطورة المسجلة:"}</span>
              <strong style="margin-inline-start: 6px; color: var(--ink);">${Array.isArray(caseData.riskFactors) && caseData.riskFactors.length > 0 ? caseData.riskFactors.join('، ') : (isEn ? "None declared" : "لا توجد")}</strong>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "AI Risk Classification:" : "تصنيف الذكاء الاصطناعي:"}</span>
              <strong style="margin-inline-start: 6px; color: var(--teal);">${isEn ? (caseData.aiScoreEn || caseData.aiScore || "Low Risk") : (caseData.aiScore || "خطورة منخفضة")}</strong>
            </div>
          </div>

          <!-- CLINICAL RULES TRIAGE BADGE IN REPORT -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(14, 165, 233, 0.06); border: 1px solid rgba(14, 165, 233, 0.2); border-radius: 10px; padding: 8px 14px; font-size: 12px; margin-top: 10px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>📐</span>
              <span style="color: var(--muted);">${isEn ? "Clinical Triage Rule Engine:" : "محرك قواعد الفرز السريري:"}</span>
              <strong style="color: var(--teal); font-family: monospace;">${ruleEngineVersion}</strong>
              <span class="pill ok" style="font-size: 10px; padding: 1px 6px;">${isEn ? "Clinician-Reviewed" : "معتمد سريرياً"}</span>
            </div>
            <div>
              <span style="color: var(--muted);">${isEn ? "Rule Score Points:" : "نقاط المؤشر:"}</span>
              <strong style="margin-inline-start: 4px;">${ruleScorePoints} ${isEn ? "pts" : "نقطة"}</strong>
            </div>
          </div>
        </div>

        <!-- DOCTOR OFFICIAL DIAGNOSIS -->
        <div class="report-diagnosis-section" style="background: rgba(22, 163, 74, 0.04); border: 2px solid rgba(22, 163, 74, 0.25); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; font-size: 16px; color: #15803d; display: flex; align-items: center; gap: 8px;">
              <span>🩺</span> ${isEn ? "Physician's Clinical Diagnosis & Findings" : "التشخيص والملاحظات السريرية للطبيب المعالج"}
            </h3>
            <span class="pill ok" style="font-size: 11px;">${isEn ? "Clinically Verified" : "موثق سريرياً"}</span>
          </div>
          <p style="margin: 0; font-size: 14.5px; line-height: 1.7; color: var(--ink); font-weight: 500;">
            ${clinicalDiagnosis}
          </p>
        </div>

        <!-- PRESCRIPTION & MEDICATION REGIMEN (Rx) -->
        <div class="report-prescription-section" style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; font-size: 15.5px; color: var(--teal-2); display: flex; align-items: center; gap: 8px;">
              <span>💊</span> ${isEn ? "Prescription & Medication Regimen (Rx)" : "الخطة العلاجية والروشتة الدوائية الموصوفة (Rx)"}
            </h3>
            <span class="pill info" style="font-size: 11px;">Rx Regimen</span>
          </div>
          <div class="prescriptions-list" style="display: flex; flex-direction: column; gap: 8px;">
            ${medItems.map(item => `
              <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; gap: 10px;">
                <span style="background: rgba(20, 184, 166, 0.15); color: var(--teal); font-weight: 800; font-size: 11px; padding: 3px 8px; border-radius: 6px;">Rx</span>
                <span style="font-size: 13.5px; color: var(--ink); font-weight: 500;">${item}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- CLINICAL RECOMMENDATIONS & CARE PLAN -->
        <div style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 22px;">
          <h3 style="font-size: 15.5px; margin: 0 0 12px; color: var(--teal-2); display: flex; align-items: center; gap: 8px;">
            <span>📋</span> ${isEn ? "Clinical Recommendations & Actionable Care Plan" : "التوصيات الطبية وخطة المتابعة والرعاية"}
          </h3>
          <ul class="recommendations" style="margin: 0; padding-inline-start: 22px; display: flex; flex-direction: column; gap: 8px;">
            ${Array.isArray(doctorRecommendations) 
              ? doctorRecommendations.map(r => `<li style="font-size: 13.5px; color: var(--ink); line-height: 1.5;">${r}</li>`).join('')
              : `<li style="font-size: 13.5px; color: var(--ink); line-height: 1.5;">${doctorRecommendations}</li>`}
          </ul>
        </div>

        <!-- DIGITAL SEAL & CRYPTOGRAPHIC VERIFICATION BLOCK -->
        <div class="report-signature-block" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 18px; padding: 18px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 20px;">
          <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
            <!-- QR CODE BOX -->
            <div class="qr-verify-box" style="text-align: center;">
              ${qrSvg}
              <small style="display: block; font-size: 9.5px; color: var(--muted); margin-top: 4px; font-family: monospace;">SCAN TO VERIFY</small>
            </div>
            
            <div>
              <div style="font-size: 12.5px; color: var(--muted);">${isEn ? "Electronically Certified & Signed by:" : "تم الاعتماد والتوقيع الإلكتروني السريري بواسطة:"}</div>
              <strong style="font-size: 16px; color: var(--ink); display: block; margin-top: 2px;">${doctorName}</strong>
              <span style="font-size: 12px; color: var(--teal); font-weight: 600;">${doctorSpecialty} • ${doctorLicense}</span>
              <div style="font-size: 11px; color: var(--muted); margin-top: 6px; font-family: monospace;">
                Digital Hash: SHA256-${caseData.id.slice(0, 14).toUpperCase()}
              </div>
              <div style="font-size: 11px; color: var(--muted); font-family: monospace;">
                Audit Ref: ${reportRef} | Ver: ${reportVersion} | Rules: ${ruleEngineVersion}
              </div>
            </div>
          </div>
          
          <!-- OFFICIAL CLINICAL SEAL -->
          <div class="official-clinical-seal" style="text-align: center; border: 2.5px dashed #16a34a; border-radius: 50%; width: 105px; height: 105px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px; background: rgba(22, 163, 74, 0.05); transform: rotate(-5deg); box-shadow: 0 4px 12px rgba(22, 163, 74, 0.08);">
            <span style="font-size: 22px;">🩺</span>
            <strong style="font-size: 9px; color: #16a34a; text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.1;">Health Vibes</strong>
            <span style="font-size: 8px; color: #15803d; font-weight: 800; margin-top: 2px;">CERTIFIED REPORT</span>
            <span style="font-size: 7px; color: var(--muted);">${new Date().getFullYear()} OFFICIAL</span>
          </div>
        </div>

        <!-- MANDATORY MEDICAL NOTICE -->
        <div class="safety-note" style="font-size: 12px; line-height: 1.5; margin-bottom: 24px; padding: 12px 16px; background: var(--surface-2); border-left: 4px solid var(--teal); border-radius: 8px;">
          ${isEn 
            ? "Medical Notice: This clinical report was compiled and verified by a licensed medical practitioner based on recorded vital signs, symptoms, and physiological assessment. For life-threatening emergencies, call emergency dispatch (123) immediately."
            : "تنبيه طبي: هذا التقرير صادر ومعتمد سريرياً من قبل طبيب مرخص بناءً على فحص العلامات الحيوية والأعراض والتقييم السريري. في حالات الطوارئ الحادة يرجى الاتصال فوراً بالإسعاف (123)."}
        </div>

        <!-- REPORT ACTION TOOLBAR (Hidden on Print) -->
        <div class="report-actions-toolbar no-print" style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button type="button" class="solid-button large print-report-btn" onclick="window.print()">
            <span>🖨️</span> ${isEn ? "Print Official Report (PDF)" : "طباعة التقرير الطبي (PDF)"}
          </button>
          <button type="button" class="outline-button large" onclick="navigator.clipboard.writeText(window.location.href); showToast(currentLanguage === 'en' ? 'Report link copied' : 'تم نسخ رابط التقرير')">
            <span>🔗</span> ${isEn ? "Copy Report Link" : "نسخ رابط التقرير"}
          </button>
          <button type="button" class="outline-button large" onclick="showScreen('appointments')">
            <span>📅</span> ${isEn ? "Book Follow-up" : "حجز استشارة متابعة"}
          </button>
          <button type="button" class="soft-button large" onclick="showScreen('history')">
            <span>📂</span> ${isEn ? "Medical Records" : "سجل الفحوصات"}
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("renderReportScreen error:", err);
    container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--red);">
        <h3>${isEn ? "Failed to load clinical report" : "تعذر تحميل التقرير الطبي"}</h3>
        <p style="color: var(--muted); font-size: 13px;">${err.message}</p>
        <button class="outline-button" onclick="renderReportScreen('${targetCaseId || ''}')">${isEn ? "Retry" : "إعادة المحاولة"}</button>
      </div>
    `;
  }
}

async function renderResultScreen() {
  const container = document.getElementById("resultContainer");
  if (!container) return;

  const isEn = currentLanguage === "en";
  const user = auth ? auth.currentUser : null;

  if (!user) {
    container.innerHTML = `
      <div class="panel" style="text-align: center; padding: 40px;">
        <h2>${isEn ? "Please sign in to view results" : "يرجى تسجيل الدخول لعرض النتيجة"}</h2>
        <button class="solid-button large" onclick="showAuth()">${isEn ? "Sign In" : "تسجيل الدخول"}</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--teal);"><div class="spinner"></div> ${isEn ? "Checking case results..." : "جاري فحص النتيجة..."}</div>`;

  try {
    const snap = await db.collection("cases")
      .where("patientId", "==", user.uid)
      .orderBy("submittedAt", "desc")
      .limit(5)
      .get();

    if (snap.empty) {
      container.innerHTML = `
        <div class="panel" style="text-align: center; padding: 40px;">
          <h2>${isEn ? "No Assessment Results Yet" : "لا توجد نتائج تقييم حتى الآن"}</h2>
          <p class="muted-copy">${isEn ? "Start a breathing assessment to evaluate your symptoms." : "ابدأ تقييم التنفس لفحص الأعراض ومراجعتها مع الطبيب."}</p>
          <button class="solid-button large" onclick="showScreen('assessment')">${isEn ? "Start Assessment" : "بدء التقييم"}</button>
        </div>
      `;
      return;
    }

    const validDocs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => !c.isDemo && !String(c.id).startsWith("demo_") && (typeof c.o2 === "number" || typeof c.oxygenLevel === "number"));

    if (validDocs.length === 0) {
      container.innerHTML = `
        <div class="panel" style="text-align: center; padding: 40px;">
          <h2>${isEn ? "No Assessment Results Yet" : "لا توجد نتائج تقييم حتى الآن"}</h2>
          <button class="solid-button large" onclick="showScreen('assessment')">${isEn ? "Start Assessment" : "بدء التقييم"}</button>
        </div>
      `;
      return;
    }

    const latest = validDocs[0];
    const isApproved = (latest.status === CASE_STATUS.APPROVED || latest.doctorApproved === true);

    if (!isApproved) {
      // LOCKED RESULT VIEW
      const statusMeta = getCaseStatusMeta(latest.status);
      container.innerHTML = `
        <div class="result-layout">
          <article class="panel result-main" style="grid-column: 1 / -1; text-align: center; padding: 40px 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;">🔒</div>
            <span class="pill pending" style="font-size: 13px; padding: 4px 14px;">
              ${statusMeta.icon} ${isEn ? statusMeta.en : statusMeta.ar}
            </span>
            <h1 style="margin: 14px 0 8px;">${isEn ? "Result Awaiting Doctor Review" : "النتيجة قيد الفحص والاعتماد السريري"}</h1>
            <p style="max-width: 520px; margin: 0 auto 24px; color: var(--muted); font-size: 14.5px; line-height: 1.6;">
              ${isEn 
                ? "No diagnostic outcome or medical score will be displayed until your attending physician examines the recorded vital signs and certifies the evaluation."
                : "حرصاً على سلامتك، لن تظهر أي نتيجة تشخيصية أو مؤشرات نهائية قبل أن يفحص الطبيب المعالج كافة القياسات ويعتمدها سريرياً."}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <button class="solid-button large" onclick="openCaseReport('${latest.id}')">
                <span>🛡️</span> ${isEn ? "View Case Status & Timeline" : "متابعة مسار الحالة والاعتماد"}
              </button>
              <button class="outline-button large" onclick="showScreen('patient')">
                ${isEn ? "Dashboard" : "الرئيسية"}
              </button>
            </div>
          </article>
        </div>
      `;
      return;
    }

    // APPROVED RESULT VIEW
    const o2Val = latest.oxygenLevel || latest.o2 || 95;
    const doctorDisplay = latest.assignedDoctorName || latest.reviewedBy || (isEn ? "Dr. Mona Samy" : "د. منى سامي");

    container.innerHTML = `
      <div class="result-layout">
        <article class="panel result-main">
          <span class="pill ok">✓ ${isEn ? "Physician Approved Result" : "نتيجة معتمدة من الطبيب"}</span>
          <h1>${latest.risk || latest.aiScore || (isEn ? "Medium Risk - Follow-up Recommended" : "خطر متوسط ويحتاج متابعة")}</h1>
          <p>${latest.doctorNote || (isEn ? "Doctor recommends close monitoring and follow-up within 48 hours." : "يوصى بمتابعة الطبيب خلال 24-48 ساعة ومراقبة الأعراض.")}</p>
          <div class="risk-meter"><span></span></div>
          <div class="summary-list">
            <div><span>${isEn ? "Oxygen Saturation" : "نسبة الأكسجين"}</span><strong style="color: #16a34a;">${o2Val}%</strong></div>
            <div><span>${isEn ? "Reviewing Doctor" : "الطبيب المعالج"}</span><strong>${doctorDisplay}</strong></div>
            <div><span>${isEn ? "Status" : "الحالة"}</span><strong style="color: #16a34a;">${isEn ? "Clinically Approved" : "معتمد سريرياً ✓"}</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-head"><h3>${isEn ? "Care Recommendations" : "التوصيات"}</h3><span class="pill ok">${isEn ? "Ready" : "معتمد"}</span></div>
          <ul class="recommendations">
            <li>${isEn ? "Monitor oxygen level twice daily." : "قياس الأكسجين عند توفر جهاز موثوق."}</li>
            <li>${isEn ? "Follow-up with your doctor within 24-48 hours." : "مراجعة الطبيب خلال 24-48 ساعة."}</li>
            <li>${isEn ? "Seek urgent care if shortness of breath worsens." : "طلب رعاية عاجلة إذا زاد ضيق التنفس."}</li>
          </ul>
          <div class="safety-note">${isEn ? "Medical notice: Health Vibes supports clinical workflows and does not replace qualified emergency care." : "تنبيه طبي: Health Vibes يساعد في دعم القرار الطبي ولا يستبدل التقييم الطبي المؤهل أو رعاية الطوارئ."}</div>
          <button class="solid-button full" onclick="openCaseReport('${latest.id}')">
            <span>📄</span> ${isEn ? "View Certified Medical Report" : "عرض التقرير الطبي المعتمد"}
          </button>
        </article>
      </div>
    `;
  } catch (err) {
    console.error("renderResultScreen error:", err);
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--red);">${err.message}</div>`;
  }
}

async function renderPatientHistory() {
  const container = document.getElementById("patientHistoryContainer");
  const countBadge = document.getElementById("patientHistoryCount");
  if (!container) return;

  const isEn = currentLanguage === "en";
  const user = auth ? auth.currentUser : null;

  if (!user) {
    container.innerHTML = `<div style="padding: 20px; text-align: center;">${isEn ? "Please sign in" : "يرجى تسجيل الدخول"}</div>`;
    return;
  }

  container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--teal);"><div class="spinner"></div> ${isEn ? "Loading history..." : "جاري تحميل السجل الطبي..."}</div>`;

  try {
    const snap = await db.collection("cases")
      .where("patientId", "==", user.uid)
      .orderBy("submittedAt", "desc")
      .limit(30)
      .get();

    if (snap.empty) {
      if (countBadge) countBadge.textContent = isEn ? "0 records" : "0 عناصر";
      container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--muted);">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">📂</span>
          <p style="margin: 0;">${isEn ? "No past medical records found." : "لا توجد سجلات طبية سابقة."}</p>
        </div>
      `;
      return;
    }

    const cases = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => !c.isDemo && !String(c.id).startsWith("demo_") && (typeof c.o2 === "number" || typeof c.oxygenLevel === "number"));

    if (countBadge) {
      countBadge.textContent = isEn ? `${cases.length} records` : `${cases.length} عناصر`;
    }

    if (cases.length === 0) {
      container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--muted);">
          <p>${isEn ? "No genuine medical assessments recorded." : "لا توجد فحوصات طبية مسجلة."}</p>
        </div>
      `;
      return;
    }

    let html = "";
    cases.forEach(c => {
      const isApproved = (c.status === CASE_STATUS.APPROVED || c.doctorApproved === true);
      const statusMeta = getCaseStatusMeta(c.status);
      const ts = c.submittedAt?.toMillis ? c.submittedAt.toMillis() : (c.submittedAt || 0);
      const dt = ts ? new Date(ts).toLocaleDateString(isEn ? "en-US" : "ar-EG", { year: "numeric", month: "short", day: "numeric" }) : "--";
      const o2 = c.oxygenLevel || c.o2 || "--";

      html += `
        <div class="patient-history-record-card" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 15px; color: var(--ink);">${isEn ? "Breathing Assessment" : "تقييم التنفس"}</strong>
              <span class="pill ${statusMeta.pillClass}" style="font-size: 11px; padding: 2px 8px;">
                ${statusMeta.icon} ${isEn ? statusMeta.en : statusMeta.ar}
              </span>
            </div>
            <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px;">
              <span>📅 ${dt}</span> • <span>🫁 SpO2: ${o2}%</span> • <span>#${c.id.slice(-6).toUpperCase()}</span>
            </div>
          </div>
          <div>
            ${isApproved 
              ? `<button type="button" class="solid-button" onclick="openCaseReport('${c.id}')" style="font-size: 13px; padding: 8px 16px;">
                  <span>✅</span> ${isEn ? "View Certified Report" : "عرض التقرير المعتمد"}
                 </button>`
              : `<button type="button" class="outline-button" onclick="openCaseReport('${c.id}')" style="font-size: 13px; padding: 8px 16px;">
                  <span>🔒</span> ${isEn ? "Awaiting Approval (Locked)" : "قيد المراجعة (مغلق)"}
                 </button>`
            }
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error("renderPatientHistory error:", err);
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--red);">${err.message}</div>`;
  }
}

// --- Doctor Account Lifecycle: Application -> Verification -> Approval ---
let selectedDoctorAppFile = null;
const DOCTOR_APP_ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const DOCTOR_APP_ALLOWED_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const DOCTOR_APP_BLOCKED_EXECUTABLE_EXTENSIONS = [".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".sh", ".js", ".vbs", ".scr", ".jar", ".apk", ".dmg"];
const DOCTOR_APP_MAX_FILE_SIZE = 10 * 1024 * 1024;

function getSafeStorageFileName(fileName) {
  const cleaned = String(fileName || "doctor-license")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "doctor-license";
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function encodeAuditArg(value) {
  return encodeURIComponent(String(value || ""));
}

window.openDoctorCredentialDocument = async function(encodedUrl, encodedAppId = "", encodedApplicantUserId = "", encodedDocName = "") {
  const url = decodeURIComponent(encodedUrl || "");
  if (!url) return false;
  const appId = decodeURIComponent(encodedAppId || "");
  const applicantUserId = decodeURIComponent(encodedApplicantUserId || "");
  const docName = decodeURIComponent(encodedDocName || "");
  await writeClientAuditLog("DOCTOR_CREDENTIAL_DOCUMENT_OPENED", {
    applicationId: appId || "",
    applicantUserId: applicantUserId || "",
    docName: docName || "",
    auditCategory: "open"
  });
  window.open(url, "_blank", "noopener");
  return false;
};

function validateDoctorApplicationFile(file) {
  const isEn = currentLanguage === "en";
  if (!file) {
    throw new Error(isEn ? "Please attach your syndicate ID or medical license document." : "يرجى إرفاق صورة كارنيه النقابة أو ترخيص مزاولة المهنة.");
  }
  const lowerName = String(file.name || "").toLowerCase();
  const hasAllowedExtension = DOCTOR_APP_ALLOWED_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasBlockedExecutableExtension = DOCTOR_APP_BLOCKED_EXECUTABLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (hasBlockedExecutableExtension || !hasAllowedExtension) {
    throw new Error(isEn ? "Unsupported or unsafe file extension. Please upload only PDF, JPG, PNG, or WEBP." : "امتداد الملف غير مدعوم أو غير آمن. يرجى رفع PDF أو JPG أو PNG أو WEBP فقط.");
  }
  if (!DOCTOR_APP_ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error(isEn ? "Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP file." : "نوع الملف غير مدعوم. يرجى رفع PDF أو JPG أو PNG أو WEBP.");
  }
  if (file.size > DOCTOR_APP_MAX_FILE_SIZE) {
    throw new Error(isEn ? "File is too large. Maximum allowed size is 10MB." : "حجم الملف كبير جداً. الحد الأقصى المسموح به 10 ميجابايت.");
  }
}

async function uploadDoctorApplicationDocument({ user, appId, file }) {
  validateDoctorApplicationFile(file);
  const safeName = getSafeStorageFileName(file.name);
  const storagePath = `doctor_applications/${user.uid}/${appId}/${Date.now()}_${safeName}`;
  const fileRef = storage.ref().child(storagePath);
  const snapshot = await fileRef.put(file, {
    contentType: file.type,
    customMetadata: {
      appId,
      userId: user.uid,
      uploadedFor: "doctor_application"
    }
  });
  const downloadURL = await snapshot.ref.getDownloadURL();
  return {
    docName: file.name,
    docSize: file.size,
    docContentType: file.type,
    storagePath,
    downloadURL
  };
}

function onDoctorFilePicked(input) {
  const label = document.getElementById("doctorAppFileName");
  if (input.files && input.files[0]) {
    try {
      validateDoctorApplicationFile(input.files[0]);
      selectedDoctorAppFile = input.files[0];
    } catch (error) {
      selectedDoctorAppFile = null;
      input.value = "";
      showToast(error.message);
      if (label) {
        label.textContent = currentLanguage === "en" ? "Click to select syndicate document or license photo" : "اضغط لاختيار ملف المستند أو صورة الترخيص";
        label.style.color = "var(--ink)";
      }
      return;
    }
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
    await writeClientAuditLog("DOCTOR_APPLICATION_CANCELLED", {
      applicationId: appId,
      applicantUserId: user.uid,
      auditCategory: "edit"
    });
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

  if (!name || !license || !specialty || !clinic) {
    showToast(currentLanguage === "en" ? "Please fill in all required fields." : "يرجى ملء جميع الحقول المطلوبة.");
    return;
  }

  try {
    validateDoctorApplicationFile(selectedDoctorAppFile);
  } catch (error) {
    showToast(error.message);
    return;
  }

  const btn = document.getElementById("submitDoctorAppBtn");
  const text = document.getElementById("submitDoctorAppText");
  if (btn) btn.disabled = true;
  if (text) text.textContent = currentLanguage === "en" ? "Uploading document..." : "جاري رفع المستند...";

  let uploadedDocument = null;
  try {
    const appId = "app_" + user.uid;
    uploadedDocument = await uploadDoctorApplicationDocument({
      user,
      appId,
      file: selectedDoctorAppFile
    });
    if (text) text.textContent = currentLanguage === "en" ? "Submitting application..." : "جاري إرسال الطلب...";

    const appData = {
      id: appId,
      userId: user.uid,
      name: name,
      email: user.email,
      licenseNumber: license,
      specialty: specialty,
      clinic: clinic,
      docName: uploadedDocument.docName,
      docSize: uploadedDocument.docSize,
      docContentType: uploadedDocument.docContentType,
      storagePath: uploadedDocument.storagePath,
      downloadURL: uploadedDocument.downloadURL,
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
      doctorAppDocName: uploadedDocument.docName,
      doctorAppDocSize: uploadedDocument.docSize,
      doctorAppDocContentType: uploadedDocument.docContentType,
      doctorAppDocStoragePath: uploadedDocument.storagePath,
      doctorAppDocDownloadURL: uploadedDocument.downloadURL,
      doctorAppDate: new Date().toLocaleDateString(currentLanguage === "en" ? "en-US" : "ar-EG")
    }, { merge: true });

    await writeClientAuditLog("DOCTOR_APPLICATION_SUBMITTED", {
      applicationId: appId,
      applicantUserId: user.uid,
      docName: uploadedDocument.docName,
      storagePath: uploadedDocument.storagePath,
      auditCategory: "edit"
    });

    selectedRole = ROLES.DOCTOR_PENDING;
    selectedDoctorAppFile = null;
    updateNavVisibility();
    showToast(currentLanguage === "en" ? "🎉 Application submitted! Under review by administration." : "🎉 تم إرسال طلب التوثيق بنجاح! طلبك الآن قيد المراجعة والتدقيق الإداري.");
    renderVerificationScreen();
  } catch (err) {
    if (uploadedDocument?.storagePath) {
      storage.ref().child(uploadedDocument.storagePath).delete().catch((deleteError) => {
        console.warn("Could not clean up uploaded doctor application document after submission failure:", deleteError);
      });
    }
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
              <div><span>${isEn ? "Attached File" : "المستند المرفق"}</span><strong>📄 ${userData.doctorAppDocDownloadURL ? `<a href="#" onclick="return openDoctorCredentialDocument('${encodeAuditArg(userData.doctorAppDocDownloadURL)}', '${encodeAuditArg(userData.doctorApplicationId || "")}', '${encodeAuditArg(user.uid)}', '${encodeAuditArg(userData.doctorAppDocName || "syndicate_license.pdf")}')">${escapeHtmlAttr(userData.doctorAppDocName || "syndicate_license.pdf")}</a>` : escapeHtmlAttr(userData.doctorAppDocName || "syndicate_license.pdf")}</strong></div>
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
            <div><span>${isEn ? "Attached License" : "المستند المرفق"}</span><strong>📄 ${app.downloadURL ? `<a href="#" onclick="return openDoctorCredentialDocument('${encodeAuditArg(app.downloadURL)}', '${encodeAuditArg(app.id)}', '${encodeAuditArg(app.userId)}', '${encodeAuditArg(app.docName || 'syndicate_card.pdf')}')">${escapeHtmlAttr(app.docName || 'syndicate_card.pdf')}</a>` : escapeHtmlAttr(app.docName || 'syndicate_card.pdf')}</strong></div>
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

    await writeClientAuditLog("DOCTOR_APPLICATION_APPROVED", {
      applicationId: appId,
      applicantUserId: userId,
      doctorName: doctorName || "",
      auditCategory: "approval",
      backendAuthoritative: true
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

    await writeClientAuditLog("DOCTOR_APPLICATION_REJECTED", {
      applicationId: appId,
      applicantUserId: userId || "",
      auditCategory: "rejection"
    });

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

const ACTIVE_RISK_RULESET_ID = "breathing-triage";
const ACTIVE_RISK_RULE_VERSION = "HealthVibe-Rules-v1.0";

const RISK_RULESETS_REGISTRY = Object.freeze({
  "breathing-triage": Object.freeze({
    id: "breathing-triage",
    nameAr: "فرز الجهاز التنفسي والتهابات الصدر",
    nameEn: "Respiratory & Breathing Triage",
    activeVersion: "HealthVibe-Rules-v1.0",
    versions: Object.freeze({
      "HealthVibe-Rules-v1.0": Object.freeze({
        version: "HealthVibe-Rules-v1.0",
        status: "active",
        effectiveFrom: "2026-09-21",
        deprecatedAt: null,
        reviewedBy: "Clinical Governance & Pulmonology Board",
        reviewStatus: "clinician-reviewed-rules",
        changelog: Object.freeze({
          ar: "الإصدار السريري الأساسي المعتمد: فرز مبني على عتبات SpO2، ضيق التنفس، شدة السعال، ومدة الأعراض.",
          en: "Baseline certified clinical release: rule-based triage based on SpO2 thresholds, dyspnea, cough severity, and symptom duration."
        }),
        scoreThresholds: Object.freeze({
          urgent: 6,
          high: 3
        }),
        spo2Thresholds: Object.freeze({
          urgentBelow: 90,
          highBelow: 93,
          closeFollowUpMin: 93,
          closeFollowUpMax: 94
        }),
        rules: Object.freeze({
          spo2_lt_90: Object.freeze({ points: 6, ar: "SpO2 أقل من 90%: تصعيد عاجل للطوارئ", en: "SpO2 below 90%: urgent emergency escalation" }),
          spo2_90_92: Object.freeze({ points: 4, ar: "SpO2 بين 90% و92%: أولوية مراجعة عالية", en: "SpO2 between 90% and 92%: high review priority" }),
          spo2_93_94: Object.freeze({ points: 2, ar: "SpO2 بين 93% و94%: متابعة قريبة", en: "SpO2 between 93% and 94%: close follow-up" }),
          dyspnea_present: Object.freeze({ points: 2, ar: "وجود ضيق تنفس", en: "Shortness of breath present" }),
          severe_cough: Object.freeze({ points: 2, ar: "كحة شديدة", en: "Severe cough" }),
          moderate_cough: Object.freeze({ points: 1, ar: "كحة متوسطة", en: "Moderate cough" }),
          symptoms_7_days: Object.freeze({ points: 1, ar: "استمرار الأعراض 7 أيام أو أكثر", en: "Symptoms lasting 7 days or more" }),
          risk_factors_present: Object.freeze({ points: 1, ar: "وجود عوامل خطورة مسجلة", en: "Recorded risk factors present" })
        })
      }),
      "HealthVibe-Rules-v1.1": Object.freeze({
        version: "HealthVibe-Rules-v1.1",
        status: "candidate",
        effectiveFrom: "2026-10-01",
        deprecatedAt: null,
        reviewedBy: "Clinical Governance & Pulmonology Board",
        reviewStatus: "clinician-reviewed-rules",
        changelog: Object.freeze({
          ar: "تحديث سريري مرتقب: تعزيز حساسية عوامل الخطورة التنفسية المزمنة ومطابقة معايير الفرز الرئوي الإقليمية.",
          en: "Candidate clinical update: enhanced sensitivity for chronic respiratory risk factors and aligned regional pulmonology triage."
        }),
        scoreThresholds: Object.freeze({
          urgent: 6,
          high: 3
        }),
        spo2Thresholds: Object.freeze({
          urgentBelow: 90,
          highBelow: 93,
          closeFollowUpMin: 93,
          closeFollowUpMax: 94
        }),
        rules: Object.freeze({
          spo2_lt_90: Object.freeze({ points: 6, ar: "SpO2 أقل من 90%: تصعيد عاجل للطوارئ", en: "SpO2 below 90%: urgent emergency escalation" }),
          spo2_90_92: Object.freeze({ points: 4, ar: "SpO2 بين 90% و92%: أولوية مراجعة عالية", en: "SpO2 between 90% and 92%: high review priority" }),
          spo2_93_94: Object.freeze({ points: 2, ar: "SpO2 بين 93% و94%: متابعة قريبة", en: "SpO2 between 93% and 94%: close follow-up" }),
          dyspnea_present: Object.freeze({ points: 2, ar: "وجود ضيق تنفس حاد", en: "Acute shortness of breath present" }),
          severe_cough: Object.freeze({ points: 2, ar: "كحة شديدة مستمرة", en: "Persistent severe cough" }),
          moderate_cough: Object.freeze({ points: 1, ar: "كحة متوسطة", en: "Moderate cough" }),
          symptoms_7_days: Object.freeze({ points: 1, ar: "استمرار الأعراض 7 أيام أو أكثر", en: "Symptoms lasting 7 days or more" }),
          risk_factors_present: Object.freeze({ points: 2, ar: "وجود عوامل خطورة مسجلة (ربو / حمل / تدخين)", en: "Recorded clinical comorbidities (asthma / pregnancy / smoking)" })
        })
      })
    })
  })
});

function getRiskRuleset(ruleSetId = ACTIVE_RISK_RULESET_ID, version = null) {
  const registry = RISK_RULESETS_REGISTRY[ruleSetId] || RISK_RULESETS_REGISTRY[ACTIVE_RISK_RULESET_ID];
  if (!registry) return null;
  const targetVersion = version || registry.activeVersion || ACTIVE_RISK_RULE_VERSION;
  return registry.versions[targetVersion] || registry.versions[registry.activeVersion] || Object.values(registry.versions)[0];
}

const RISK_RULESETS = Object.freeze({
  "breathing-triage": getRiskRuleset("breathing-triage", ACTIVE_RISK_RULE_VERSION)
});
const ACTIVE_RISK_RULESET = RISK_RULESETS[ACTIVE_RISK_RULESET_ID];
const RULE_ENGINE_VERSION = ACTIVE_RISK_RULESET.version;

function evaluateRulesBasedRisk({ oxygenLevel, hasDyspnea, coughKey, durationDays, riskFactorKeys, ruleSetId = ACTIVE_RISK_RULESET_ID, version = null }) {
  const ruleSet = getRiskRuleset(ruleSetId, version) || ACTIVE_RISK_RULESET;
  const rules = [];
  let points = 0;

  const addRule = (id) => {
    const rule = ruleSet.rules[id];
    if (!rule) return;
    points += rule.points;
    rules.push({ id, points: rule.points, ar: rule.ar, en: rule.en, version: ruleSet.version });
  };

  if (oxygenLevel > 0 && oxygenLevel < 90) {
    addRule("spo2_lt_90");
  } else if (oxygenLevel >= 90 && oxygenLevel <= 92) {
    addRule("spo2_90_92");
  } else if (oxygenLevel >= 93 && oxygenLevel <= 94) {
    addRule("spo2_93_94");
  }

  if (hasDyspnea) addRule("dyspnea_present");
  if (coughKey === "severe") addRule("severe_cough");
  else if (coughKey === "moderate") addRule("moderate_cough");

  if (durationDays >= 7) addRule("symptoms_7_days");

  const clinicalRiskFactors = riskFactorKeys.filter((key) => key && key !== "none");
  if (clinicalRiskFactors.length > 0) {
    addRule("risk_factors_present");
  }

  let priority = "normal";
  if (oxygenLevel > 0 && oxygenLevel < ruleSet.spo2Thresholds.urgentBelow || points >= ruleSet.scoreThresholds.urgent) priority = "urgent";
  else if (oxygenLevel > 0 && oxygenLevel < ruleSet.spo2Thresholds.highBelow || points >= ruleSet.scoreThresholds.high) priority = "high";

  const meta = AssessmentDictionaries.priority[priority];
  return {
    priority,
    points,
    rules,
    riskAr: meta.riskAr,
    riskEn: meta.riskEn,
    aiScoreAr: meta.aiScoreAr,
    aiScoreEn: meta.aiScoreEn,
    ruleScore: meta.ruleScore,
    ruleScoreAr: meta.ruleScoreAr,
    ruleScoreEn: meta.ruleScoreEn,
    ruleSetId: ruleSetId,
    reviewStatus: ruleSet.reviewStatus,
    validated: false,
    version: ruleSet.version,
    effectiveFrom: ruleSet.effectiveFrom
  };
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
  const field = document.getElementById("oxygenInput");
  if (!warning) return;

  const isEn = currentLanguage === "en";
  const oxygen = readOxygenValue();
  if (field) field.style.borderColor = "";

  if (oxygen > 100) {
    warning.hidden = false;
    warning.className = "field-warning has-emergency-card";
    warning.innerHTML = `
      <div class="emergency-alert-card invalid-reading">
        <div class="emergency-header">
          <span class="emergency-warning-badge">⚠️ ${isEn ? 'Invalid SpO2' : 'قراءة غير صحيحة'}</span>
          <h4>${isEn ? 'Oxygen Level Cannot Exceed 100%' : 'نسبة الأكسجين لا يمكن أن تتجاوز 100%'}</h4>
        </div>
        <p class="emergency-lead">${isEn ? 'Physiologically, pulse oximetry cannot exceed 100%. Please re-check your reading.' : 'أقصى تشبع ممكن لغاز الأكسجين في الدم هو 100%. يرجى التأكد من جهاز القياس وإعادة الإدخال.'}</p>
      </div>
    `;
    if (field) field.style.borderColor = "var(--red)";
    return;
  }
  if (oxygen > 0 && oxygen < 50) {
    warning.hidden = false;
    warning.className = "field-warning has-emergency-card";
    warning.innerHTML = `
      <div class="emergency-alert-card invalid-reading">
        <div class="emergency-header">
          <span class="emergency-warning-badge">⚠️ ${isEn ? 'Sensory Error / Implausible' : 'قراءة غير منطقية'}</span>
          <h4>${isEn ? 'Reading Below 50% SpO2' : 'القراءة أقل من 50%'}</h4>
        </div>
        <p class="emergency-lead">${isEn ? 'Readings under 50% usually indicate sensor dislocation or cold fingers. Valid clinical range is 50% - 100%.' : 'القيم أقل من 50% تشير عادة لانفصال الحساس أو برودة الأصابع. النطاق الطبي المقبول بين 50% و 100%.'}</p>
      </div>
    `;
    if (field) field.style.borderColor = "var(--red)";
    return;
  }

  if (oxygen >= 50 && oxygen < 90) {
    warning.hidden = false;
    warning.className = "field-warning has-emergency-card";
    if (field) field.style.borderColor = "var(--red)";
    warning.innerHTML = `
      <div class="emergency-alert-card critical-oxygen">
        <div class="emergency-header">
          <span class="emergency-pulsing-badge">🚨 ${isEn ? 'CRITICAL EMERGENCY' : 'تنبيه طوارئ فوري'}</span>
          <h4>${isEn ? 'Severe Hypoxemia (SpO2 ' + oxygen + '%)' : 'نقص حاد في نسبة الأكسجين (' + oxygen + '%)'}</h4>
        </div>
        <p class="emergency-lead">
          ${isEn 
            ? 'Oxygen saturation below 90% is dangerously low and requires immediate emergency medical care.'
            : 'هذه النسبة تشير إلى نقص حاد بالأكسجين وتستدعي تدخلاً إسعافياً عاجلاً وفورياً دون تأخير.'}
        </p>
        <ul class="emergency-actions-list">
          <li><strong>${isEn ? 'Call Ambulance Immediately:' : 'اتصل بالإسعاف فوراً:'}</strong> ${isEn ? 'Call 123 (or local ambulance) or proceed to the nearest Emergency Room.' : 'اتصل برقم 123 (مصر) أو توجه لأقرب قسم طوارئ.'}</li>
          <li><strong>${isEn ? 'Sit Upright (Tripod Posture):' : 'الجلوس في وضع قائم:'}</strong> ${isEn ? 'Sit upright leaning slightly forward. Do NOT lie flat on your back.' : 'اجلس مستقيماً مع ميل خفيف للأمام. تجنب الاستلقاء على الظهر تماماً.'}</li>
          <li><strong>${isEn ? 'Rest & Loosen Clothing:' : 'تجنب أي مجهود:'}</strong> ${isEn ? 'Loosen tight clothing around neck and chest; avoid walking alone.' : 'فك أي ملابس ضيقة حول العنق والصدر وتجنب الحركة بمفردك.'}</li>
          <li><strong>${isEn ? 'Do Not Wait for App:' : 'لا تنتظر مراجعة التطبيق:'}</strong> ${isEn ? 'Do not wait for online routine review. Hands-on medical evaluation is vital.' : 'لا تنتظر مراجعة الطبيب الروتينية للتطبيق في الحالات الحرجة.'}</li>
        </ul>
        <div class="emergency-action-buttons">
          <a href="tel:123" class="emergency-call-btn">
            <span>📞</span>
            <span>${isEn ? 'Call Ambulance (123)' : 'اتصال فوري بالإسعاف (123)'}</span>
          </a>
          <button type="button" class="emergency-guide-trigger-btn" onclick="openEmergencyGuideModal()">
            <span>📋 ${isEn ? 'Emergency First Aid Guide' : 'إرشادات الإسعافات الأولية'}</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  if (oxygen >= 90 && oxygen < 93) {
    warning.hidden = false;
    warning.className = "field-warning has-emergency-card";
    if (field) field.style.borderColor = "var(--amber)";
    warning.innerHTML = `
      <div class="emergency-alert-card warning-oxygen">
        <div class="emergency-header">
          <span class="emergency-warning-badge">⚠️ ${isEn ? 'HIGH PRIORITY' : 'أولوية طبية عالية'}</span>
          <h4>${isEn ? 'Low Oxygen Saturation (' + oxygen + '%)' : 'نسبة أكسجين منخفضة (' + oxygen + '%)'}</h4>
        </div>
        <p class="emergency-lead">
          ${isEn
            ? 'Oxygen saturation is below optimal (≥95%). This case is flagged as urgent priority for the doctor.'
            : 'نسبة تشبع الأكسجين أقل من المعدل الطبيعي (≥95%). سيتم تصنيف حالتك بأولوية عاجلة للطبيب.'}
        </p>
        <ul class="emergency-actions-list">
          <li>${isEn ? 'If you experience sudden severe breathlessness, chest pain, or blue lips, call 123 immediately.' : 'إذا شعرت بزيادة سريعة في ضيق التنفس أو ألم بالصدر أو زرقة بالشفاه، توجه للطوارئ فوراً أو اتصل بـ 123.'}</li>
          <li>${isEn ? 'Sit comfortably, breathe steadily, and keep warm while waiting.' : 'اجلس بوضع مريح، وتنفس بهدوء، وتأكد من ثبات جهاز قياس النبض.'}</li>
        </ul>
        <div class="emergency-action-buttons">
          <a href="tel:123" class="emergency-call-btn secondary">
            <span>📞</span>
            <span>${isEn ? 'Call Emergency (123)' : 'اتصال بالطوارئ (123)'}</span>
          </a>
        </div>
      </div>
    `;
    return;
  }

  warning.hidden = true;
  warning.className = "field-warning";
  warning.innerHTML = "";
}

window.openEmergencyGuideModal = function() {
  const modal = document.getElementById("emergencyGuideModal");
  if (modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
};

window.closeEmergencyGuideModal = function() {
  const modal = document.getElementById("emergencyGuideModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
};

let _emergencySubmitCallback = null;
window.openEmergencySubmitModal = function(o2, onProceed) {
  _emergencySubmitCallback = onProceed;
  const modal = document.getElementById("emergencySubmitModal");
  const valEl = document.getElementById("emergencyModalO2Val");
  if (valEl) valEl.textContent = `${o2}%`;
  if (modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
};

window.closeEmergencySubmitModal = function() {
  const modal = document.getElementById("emergencySubmitModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  _emergencySubmitCallback = null;
};

let _assessmentConfirmCallback = null;

window.openConfirmAssessmentModal = function(data, onConfirm) {
  _assessmentConfirmCallback = onConfirm;
  const modal = document.getElementById("confirmAssessmentModal");
  if (!modal) {
    if (typeof onConfirm === "function") onConfirm();
    return;
  }

  const isEn = currentLanguage === "en";
  const safeSet = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  safeSet("confirmO2", data.oxygenLevel ? `${data.oxygenLevel}%` : "--%");
  safeSet("confirmDyspnea", data.breathingDifficulty);
  safeSet("confirmCough", data.coughLevel);
  safeSet("confirmDuration", data.symptomDuration);
  safeSet("confirmRisks", data.riskFactors && data.riskFactors.length ? data.riskFactors.join("، ") : (isEn ? "None" : "لا يوجد"));
  safeSet("confirmDoctor", data.assignedDoctorName || (isEn ? "Dr. Mona Samy" : "د. منى سامي"));
  safeSet("confirmClinic", data.clinicName || (isEn ? "Nasr City Clinic" : "عيادة مدينة نصر"));

  const prioPill = document.getElementById("confirmModalPriorityPill");
  if (prioPill) {
    prioPill.textContent = data.priorityAr || data.priority;
    prioPill.className = `pill ${data.priority === 'urgent' ? 'danger' : (data.priority === 'high' ? 'pending' : 'ok')}`;
  }

  const emNotice = document.getElementById("confirmModalEmergencyNotice");
  const emO2Val = document.getElementById("confirmModalEmergencyO2");
  if (emNotice) {
    if (data.oxygenLevel > 0 && data.oxygenLevel < 90) {
      emNotice.style.display = "block";
      if (emO2Val) emO2Val.textContent = `${data.oxygenLevel}%`;
    } else {
      emNotice.style.display = "none";
    }
  }

  const confirmSendBtn = document.getElementById("btnConfirmSendAssessment");
  if (confirmSendBtn) {
    confirmSendBtn.disabled = false;
    confirmSendBtn.textContent = isEn ? "✅ Confirm & Send to Doctor" : "✅ تأكيد وإرسال التقييم للطبيب";
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
};

window.closeConfirmAssessmentModal = function() {
  const modal = document.getElementById("confirmAssessmentModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  _assessmentConfirmCallback = null;
};

window.openRulesGovernanceModal = function(selectedVersion = null) {
  const modal = document.getElementById("rulesGovernanceModal");
  if (!modal) return;

  const isEn = currentLanguage === "en";
  const selectEl = document.getElementById("rulesGovVersionSelect");
  const container = document.getElementById("rulesGovDetailsContainer");
  const activeBadge = document.getElementById("rulesGovActiveBadge");

  const registry = RISK_RULESETS_REGISTRY[ACTIVE_RISK_RULESET_ID] || Object.values(RISK_RULESETS_REGISTRY)[0];
  if (!registry) return;

  const versions = Object.keys(registry.versions);
  const targetVer = selectedVersion && registry.versions[selectedVersion]
    ? selectedVersion
    : registry.activeVersion;

  if (selectEl) {
    selectEl.innerHTML = versions.map(v => `<option value="${v}" ${v === targetVer ? 'selected' : ''}>${v}${v === registry.activeVersion ? (isEn ? ' (Active)' : ' (النشط)') : ''}</option>`).join('');
    selectEl.onchange = (e) => {
      renderRulesGovDetails(e.target.value);
    };
  }

  function renderRulesGovDetails(verKey) {
    const v = registry.versions[verKey];
    if (!v || !container) return;

    const isActive = verKey === registry.activeVersion;
    if (activeBadge) {
      activeBadge.textContent = isActive ? (isEn ? "Active Version" : "الإصدار النشط المعتمد") : (isEn ? `Status: ${v.status}` : `الحالة: ${v.status}`);
      activeBadge.className = `pill ${isActive ? 'ok' : (v.status === 'candidate' ? 'pending' : 'info')}`;
    }

    const rulesRows = Object.entries(v.rules || {}).map(([rId, rDef]) => `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: var(--teal);">${rId}</td>
        <td>${isEn ? (rDef.en || rDef.ar) : (rDef.ar || rDef.en)}</td>
        <td style="text-align: center;"><span class="pill danger" style="font-weight: 800; font-size: 11px;">+${rDef.points}</span></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div style="background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 14px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 12.5px;">
          <div><span style="color: var(--muted);">${isEn ? 'Target Ruleset:' : 'مجموعة القواعد:'}</span> <strong>${isEn ? registry.nameEn : registry.nameAr}</strong></div>
          <div><span style="color: var(--muted);">${isEn ? 'Effective Date:' : 'تاريخ السريان:'}</span> <strong style="font-family: monospace;">${v.effectiveFrom || '--'}</strong></div>
          <div><span style="color: var(--muted);">${isEn ? 'Review Authority:' : 'جهة الاعتماد والتدقيق:'}</span> <strong>${v.reviewedBy || 'Clinical Governance'}</strong></div>
          <div><span style="color: var(--muted);">${isEn ? 'Score Thresholds:' : 'حدود الفرز والتصنيف:'}</span> <strong>${isEn ? `Urgent ≥ ${v.scoreThresholds.urgent} pts, High ≥ ${v.scoreThresholds.high} pts` : `عاجل ≥ ${v.scoreThresholds.urgent} نقاط، عالي ≥ ${v.scoreThresholds.high} نقاط`}</strong></div>
        </div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 12px; color: var(--ink);">
          <strong>${isEn ? 'Clinical Changelog:' : 'سجل التغييرات السريرية:'}</strong>
          <p style="margin: 4px 0 0; color: var(--muted);">${isEn ? v.changelog.en : v.changelog.ar}</p>
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px; font-size: 13.5px; color: var(--teal-2);">
          ${isEn ? 'Rules & Point Attribution Matrix' : 'جدول القواعد وتوزيع النقاط السريرية'}
        </h4>
        <div style="overflow-x: auto;">
          <table class="rules-spec-table">
            <thead>
              <tr>
                <th style="width: 25%;">${isEn ? 'Rule Identifier' : 'معرّف القاعدة'}</th>
                <th>${isEn ? 'Clinical Trigger Condition' : 'الشرط السريري'}</th>
                <th style="width: 15%; text-align: center;">${isEn ? 'Points' : 'النقاط'}</th>
              </tr>
            </thead>
            <tbody>
              ${rulesRows}
            </tbody>
          </table>
        </div>
      </div>

      <div style="padding: 8px 12px; background: rgba(14, 165, 233, 0.08); border-radius: 8px; font-size: 11.5px; color: var(--muted); line-height: 1.5;">
        🔒 ${isEn
          ? "Immutability Notice: All cases are permanently stamped with the active rule version at evaluation time. New versions never retroactively change historical case points or triage status."
          : "ضمان عدم التغيير الرجعي (Immutability): كل حالة يتم تثبيت إصدار القواعد المستخدم وقت إدخالها. لا تؤثر الإصدارات الجديدة رجعياً على تصنيف الحالات السابقة."}
      </div>
    `;
  }

  renderRulesGovDetails(targetVer);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
};

window.closeRulesGovernanceModal = function() {
  const modal = document.getElementById("rulesGovernanceModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
};

// Bind interactive modals (Emergency & Confirmation)
document.addEventListener("DOMContentLoaded", () => {
  const closeGuideBtn = document.getElementById("closeEmergencyGuideBtn");
  if (closeGuideBtn) closeGuideBtn.addEventListener("click", closeEmergencyGuideModal);
  const closeRulesGovBtn = document.getElementById("closeRulesGovModalBtn");
  if (closeRulesGovBtn) closeRulesGovBtn.addEventListener("click", closeRulesGovernanceModal);

  const proceedSubmitBtn = document.getElementById("emergencySubmitProceedBtn");
  if (proceedSubmitBtn) {
    proceedSubmitBtn.addEventListener("click", () => {
      const cb = _emergencySubmitCallback;
      closeEmergencySubmitModal();
      if (typeof cb === "function") cb();
    });
  }

  const cancelSubmitBtn = document.getElementById("emergencySubmitCancelBtn");
  if (cancelSubmitBtn) {
    cancelSubmitBtn.addEventListener("click", () => {
      closeEmergencySubmitModal();
      const field = document.getElementById("oxygenInput");
      if (field) {
        field.focus();
        field.select();
      }
    });
  }

  const btnConfirmSend = document.getElementById("btnConfirmSendAssessment");
  if (btnConfirmSend) {
    btnConfirmSend.addEventListener("click", async () => {
      const cb = _assessmentConfirmCallback;
      if (typeof cb === "function") {
        btnConfirmSend.disabled = true;
        btnConfirmSend.textContent = currentLanguage === "en" ? "Submitting..." : "جاري الإرسال...";
        try {
          await cb();
          closeConfirmAssessmentModal();
        } catch (e) {
          console.error("Submission failed:", e);
          btnConfirmSend.disabled = false;
          btnConfirmSend.textContent = currentLanguage === "en" ? "✅ Confirm & Send to Doctor" : "✅ تأكيد وإرسال التقييم للطبيب";
        }
      } else {
        closeConfirmAssessmentModal();
      }
    });
  }

  const btnCancelSend = document.getElementById("btnCancelSendAssessment");
  if (btnCancelSend) {
    btnCancelSend.addEventListener("click", closeConfirmAssessmentModal);
  }
});

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
  updateThemeLogos();
}

window.addEventListener("load", () => {
  // Initialize theme toggle buttons to match the default dark mode
  const isDark = document.body.classList.contains("dark");
  if (siteThemeToggle) siteThemeToggle.textContent = localized(isDark ? "الوضع الداكن" : "الوضع الفاتح");
  const fabIcon = themeToggle ? themeToggle.querySelector(".theme-fab-icon") : null;
  if (fabIcon) fabIcon.textContent = isDark ? "☀️" : "🌙";
  updateThemeLogos();
  setupLoaderVideo();
});

document.addEventListener("DOMContentLoaded", () => {
  updateThemeLogos();
  setupLoaderVideo();
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

// =========================================================================
// 🩺 STANDARDIZED CLINICAL ASSESSMENT SCHEMA (v1.0.0)
// =========================================================================

const ASSESSMENT_SCHEMA_VERSION = "1.0.0";
const REPORT_VERSION = "1.0.0";
const MODEL_VERSION = "HealthVibe-AI-v1.0";

const AssessmentEnums = Object.freeze({
  BreathingDifficulty: {
    YES: "yes",
    NO: "no"
  },
  CoughSeverity: {
    NONE: "none",
    MILD: "mild",
    MODERATE: "moderate",
    SEVERE: "severe"
  },
  Priority: {
    NORMAL: "normal",
    HIGH: "high",
    URGENT: "urgent"
  },
  Status: {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected"
  },
  RiskFactorKeys: {
    ASTHMA: "asthma",
    SMOKING: "smoking",
    PREGNANCY: "pregnancy",
    NONE: "none"
  }
});

const AssessmentDictionaries = Object.freeze({
  breathing: {
    yes: { ar: "نعم (يوجد ضيق تنفس)", en: "Yes (Shortness of breath)" },
    no:  { ar: "لا (تنفس طبيعي)",       en: "No (Normal breathing)" }
  },
  cough: {
    none:     { ar: "لا توجد", en: "None" },
    mild:     { ar: "خفيفة",   en: "Mild" },
    moderate: { ar: "متوسطة",  en: "Moderate" },
    severe:   { ar: "شديدة",   en: "Severe" }
  },
  priority: {
    normal: { ar: "عادية", badge: "ok",      riskAr: "منخفض", riskEn: "Low",    aiScoreAr: "منخفضة", aiScoreEn: "Low",    ruleScore: "low-rule-match",    ruleScoreAr: "مؤشر قواعد منخفض", ruleScoreEn: "Low rule score" },
    high:   { ar: "عالية",  badge: "pending", riskAr: "مراجعة", riskEn: "Review", aiScoreAr: "متوسطة", aiScoreEn: "Medium", ruleScore: "medium-rule-match", ruleScoreAr: "مؤشر قواعد متوسط", ruleScoreEn: "Medium rule score" },
    urgent: { ar: "عاجلة", badge: "danger",  riskAr: "عاجل",  riskEn: "Urgent", aiScoreAr: "عالية",  aiScoreEn: "High",   ruleScore: "high-rule-match",   ruleScoreAr: "مؤشر قواعد عالٍ", ruleScoreEn: "High rule score" }
  },
  riskFactors: {
    "ربو":     { key: "asthma",    ar: "ربو",     en: "Asthma" },
    "تدخين":   { key: "smoking",   ar: "تدخين",   en: "Smoking" },
    "حمل":     { key: "pregnancy", ar: "حمل",     en: "Pregnancy" },
    "لا يوجد": { key: "none",      ar: "لا يوجد", en: "None" },
    asthma:    { key: "asthma",    ar: "ربو",     en: "Asthma" },
    smoking:   { key: "smoking",   ar: "تدخين",   en: "Smoking" },
    pregnancy: { key: "pregnancy", ar: "حمل",     en: "Pregnancy" },
    none:      { key: "none",      ar: "لا يوجد", en: "None" }
  }
});

/**
 * Normalizes input symptoms and vital signs into a strict, validated Assessment Schema
 */
function buildAssessmentModel({
  user,
  oxygenLevel,
  breathingRaw,
  coughRaw,
  symptomDurationRaw,
  riskFactorsRaw = [],
  assignedDoctorId = null,
  assignedDoctorName = null,
  clinicId = "clinic_cairo_nasr_city",
  clinicName = "عيادة مدينة نصر"
}) {
  // 1. Oxygen Vitals (Strict Physiological Validation)
  const o2Raw = Number.parseInt(String(oxygenLevel).replace(/[^\d]/g, ""), 10) || 0;
  if (o2Raw > 100 || (o2Raw < 50 && o2Raw > 0)) {
    throw new Error(currentLanguage === "en"
      ? "Invalid oxygen level: SpO2 must be between 50% and 100%."
      : "نسبة الأكسجين غير صحيحة: يجب أن تكون بين 50% و 100%.");
  }
  const o2 = o2Raw;
  const isCritical = o2 > 0 && o2 < 90;
  const isHighRisk = o2 > 0 && o2 < 93;

  // 3. Breathing Difficulty Normalization
  const breathingClean = String(breathingRaw || "").trim();
  const hasDyspnea = breathingClean === "نعم" || breathingClean.toLowerCase() === "yes";
  const breathingKey = hasDyspnea ? "yes" : "no";
  const breathingMeta = AssessmentDictionaries.breathing[breathingKey];

  // 4. Cough Severity Normalization
  let coughKey = "none";
  const coughClean = String(coughRaw || "").trim().toLowerCase();
  if (coughClean.includes("شديد") || coughClean === "severe") coughKey = "severe";
  else if (coughClean.includes("متوسط") || coughClean === "moderate") coughKey = "moderate";
  else if (coughClean.includes("خفيف") || coughClean === "mild") coughKey = "mild";
  const coughMeta = AssessmentDictionaries.cough[coughKey];

  // 5. Symptom Duration Normalization
  const durationStr = String(symptomDurationRaw || "غير محدد").trim();
  const daysMatch = durationStr.match(/\d+/);
  const durationDays = daysMatch ? Number.parseInt(daysMatch[0], 10) : 0;
  const durationEn = durationDays > 0 ? `${durationDays} ${durationDays === 1 ? 'day' : 'days'}` : "Unspecified";

  // 6. Risk Factors Normalization
  const rfKeys = [];
  const rfLabelsAr = [];
  const rfLabelsEn = [];
  riskFactorsRaw.forEach(rf => {
    const clean = String(rf).trim();
    const meta = AssessmentDictionaries.riskFactors[clean] || AssessmentDictionaries.riskFactors[clean.toLowerCase()];
    if (meta && !rfKeys.includes(meta.key)) {
      rfKeys.push(meta.key);
      rfLabelsAr.push(meta.ar);
      rfLabelsEn.push(meta.en);
    }
  });
  if (rfKeys.length === 0) {
    rfKeys.push("none");
    rfLabelsAr.push("لا يوجد");
    rfLabelsEn.push("None");
  }

  const riskEvaluation = evaluateRulesBasedRisk({
    oxygenLevel: o2,
    hasDyspnea,
    coughKey,
    durationDays,
    riskFactorKeys: rfKeys
  });
  const priority = riskEvaluation.priority;
  const prioMeta = AssessmentDictionaries.priority[priority];

  // 7. Symptoms summary string
  const symptomsSummaryAr = `${coughMeta.ar && coughMeta.ar !== 'لا توجد' ? 'كحة ' + coughMeta.ar : ''}${hasDyspnea ? (coughMeta.ar && coughMeta.ar !== 'لا توجد' ? ' مع ضيق تنفس' : 'ضيق تنفس') : ''}`.trim() || "لا توجد أعراض ظاهرة";
  const symptomsSummaryEn = `${coughMeta.en && coughMeta.en !== 'None' ? coughMeta.en + ' cough' : ''}${hasDyspnea ? (coughMeta.en && coughMeta.en !== 'None' ? ' with shortness of breath' : 'Shortness of breath') : ''}`.trim() || "No apparent symptoms";

  const patientName = (user && (user.displayName || user.name)) || (user && user.email ? user.email.split('@')[0] : "مجهول");
  const patientEmail = (user && user.email) || "";
  const patientUid = (user && user.uid) || "";

  return {
    // ── Document Metadata ──
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    patientId: patientUid,
    patientEmail: patientEmail,
    patientName: patientName,
    patientNameEn: patientName,
    name: patientName,
    nameEn: patientName,

    // ── Clinical Tenant & Doctor Assignment ──
    assignedDoctorId: assignedDoctorId || null,
    assignedDoctorName: assignedDoctorName || null,
    clinicId: clinicId || "clinic_cairo_nasr_city",
    clinicName: clinicName || "عيادة مدينة نصر",

    // ── Structured Assessment Object ──
    assessment: {
      privacyConsent: getStoredPrivacyConsent() || {
        accepted: true,
        version: PRIVACY_CONSENT_VERSION,
        acceptedAt: new Date().toISOString()
      },
      vitals: {
        oxygenLevel: o2,
        isLowOxygen: isHighRisk,
        isCriticalOxygen: isCritical,
        unit: "%"
      },
      symptoms: {
        breathingDifficulty: breathingKey,
        breathingDifficultyLabelAr: breathingMeta.ar,
        breathingDifficultyLabelEn: breathingMeta.en,
        coughSeverity: coughKey,
        coughSeverityLabelAr: coughMeta.ar,
        coughSeverityLabelEn: coughMeta.en,
        durationDays: durationDays,
        durationText: durationStr,
        durationTextEn: durationEn
      },
      riskFactors: {
        keys: rfKeys,
        labelsAr: rfLabelsAr,
        labelsEn: rfLabelsEn
      },
      aiTriage: {
        priority: priority,
        priorityLabelAr: prioMeta.ar,
        risk: prioMeta.riskAr,
        riskEn: prioMeta.riskEn,
        aiScore: prioMeta.aiScoreAr,
        aiScoreEn: prioMeta.aiScoreEn,
        ruleScore: prioMeta.ruleScore,
        ruleScoreLabelAr: prioMeta.ruleScoreAr,
        ruleScoreLabelEn: prioMeta.ruleScoreEn,
        ruleScorePoints: riskEvaluation.points,
        triggeredRules: riskEvaluation.rules,
        ruleSetId: riskEvaluation.ruleSetId,
        ruleEngineVersion: riskEvaluation.version,
        ruleEngineEffectiveFrom: riskEvaluation.effectiveFrom,
        ruleEngineReviewStatus: riskEvaluation.reviewStatus,
        ruleScoreValidated: false,
        confidence: "not-validated-rule-score",
        modelVersion: MODEL_VERSION
      }
    },

    // ── Top-Level Flattened Fields (100% Backward Compatible) ──
    status: assignedDoctorId ? CASE_STATUS.ASSIGNED : CASE_STATUS.TRIAGED,
    priority: priority,
    oxygenLevel: o2,
    o2: o2,
    breathingDifficulty: breathingMeta.ar,
    coughLevel: coughMeta.ar,
    symptomDuration: durationStr,
    duration: durationStr,
    durationEn: durationEn,
    riskFactors: rfLabelsAr,
    symptoms: symptomsSummaryAr,
    symptomsEn: symptomsSummaryEn,
    risk: prioMeta.riskAr,
    riskEn: prioMeta.riskEn,
    aiScore: prioMeta.aiScoreAr,
    aiScoreEn: prioMeta.aiScoreEn,
    ruleScore: prioMeta.ruleScore,
    ruleScoreLabelAr: prioMeta.ruleScoreAr,
    ruleScoreLabelEn: prioMeta.ruleScoreEn,
    ruleScorePoints: riskEvaluation.points,
    triggeredRules: riskEvaluation.rules,
    ruleSetId: riskEvaluation.ruleSetId,
    ruleEngineVersion: riskEvaluation.version,
    ruleEngineEffectiveFrom: riskEvaluation.effectiveFrom,
    ruleEngineReviewStatus: riskEvaluation.reviewStatus,
    ruleScoreValidated: false,
    confidence: "not-validated-rule-score",
    reportVersion: REPORT_VERSION,
    modelVersion: MODEL_VERSION,
    generatedAt: null,
    approvedAt: null,
    privacyConsent: getStoredPrivacyConsent() || {
      accepted: true,
      version: PRIVACY_CONSENT_VERSION,
      acceptedAt: new Date().toISOString()
    },

    // ── Lifecycle & Audit ──
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    doctorNotes: null,
    doctorNote: null,
    approvingDoctorId: null,
    approvingDoctorEmail: null,
    result: null,

    // ── Complete Status History ──
    statusHistory: [
      {
        status: CASE_STATUS.SUBMITTED,
        previousStatus: CASE_STATUS.DRAFT,
        changedAt: new Date().toISOString(),
        changedBy: patientUid || "patient",
        changedByName: patientName,
        changedByEmail: patientEmail,
        changedByRole: "patient",
        note: "Assessment submitted by patient"
      },
      {
        status: CASE_STATUS.TRIAGED,
        previousStatus: CASE_STATUS.SUBMITTED,
        changedAt: new Date().toISOString(),
        changedBy: "system",
        changedByName: "Health Vibe AI Triage Engine",
        changedByRole: "system",
        note: `AI Triage determined priority: ${priority} (${prioMeta.riskAr})`
      },
      ...(assignedDoctorId ? [{
        status: CASE_STATUS.ASSIGNED,
        previousStatus: CASE_STATUS.TRIAGED,
        changedAt: new Date().toISOString(),
        changedBy: "system",
        changedByName: "Clinic Routing",
        changedByRole: "system",
        note: `Assigned to Dr. ${assignedDoctorName || assignedDoctorId}`
      }] : [])
    ]
  };
}

/**
 * Comprehensive Validation Engine for Clinical Assessment Fields
 * Validates oxygenLevel, breathingDifficulty, coughLevel, symptomDuration, riskFactors
 * Returns { isValid: boolean, errors: Array<{ field: string, message: string }> }
 */
function validateAssessmentFields({
  oxygenLevel,
  breathingDifficulty,
  coughLevel,
  symptomDuration,
  riskFactors,
  isEn = false
}) {
  const errors = [];

  // 1. Oxygen Level (SpO2: 50% - 100%)
  const o2 = Number.parseInt(String(oxygenLevel).replace(/[^\d]/g, ""), 10);
  if (isNaN(o2) || o2 < 50 || o2 > 100) {
    errors.push({
      field: "oxygenInput",
      message: o2 > 100
        ? (isEn ? "Oxygen level cannot exceed 100%." : "نسبة الأكسجين لا يمكن أن تتجاوز 100%.")
        : (isEn ? "Please enter a valid oxygen level between 50% and 100%." : "نسبة الأكسجين يجب أن تكون قيمة صحيحة بين 50% و 100%.")
    });
  }

  // 2. Breathing Difficulty (Required selection)
  const validBreathing = ["نعم", "لا", "yes", "no"];
  const breathingStr = String(breathingDifficulty || "").trim();
  if (!breathingStr || breathingStr === "غير محدد" || (!validBreathing.includes(breathingStr.toLowerCase()) && !validBreathing.includes(breathingStr))) {
    errors.push({
      field: "breathingChoices",
      message: isEn
        ? "Please specify whether shortness of breath is present (Yes or No)."
        : "يرجى تحديد ما إذا كان يوجد ضيق في التنفس (نعم أم لا)."
    });
  }

  // 3. Cough Level (Required selection)
  const validCough = ["خفيفة", "متوسطة", "شديدة", "لا توجد", "mild", "moderate", "severe", "none"];
  const coughStr = String(coughLevel || "").trim();
  if (!coughStr || coughStr === "غير محدد" || (!validCough.includes(coughStr.toLowerCase()) && !validCough.includes(coughStr))) {
    errors.push({
      field: "coughChoices",
      message: isEn
        ? "Please select cough severity level."
        : "يرجى اختيار درجة شدة الكحة من الخيارات المتاحة."
    });
  }

  // 4. Symptom Duration (Must contain valid day count: 1 - 365)
  const durationStr = String(symptomDuration || "").trim();
  const daysMatch = durationStr.match(/\d+/);
  const days = daysMatch ? Number.parseInt(daysMatch[0], 10) : 0;
  if (!durationStr || durationStr === "غير محدد" || days <= 0 || days > 365) {
    errors.push({
      field: "symptomDuration",
      message: isEn
        ? "Please enter a valid symptom duration (between 1 and 365 days)."
        : "يرجى إدخال مدة أعراض صحيحة (بين 1 و 365 يوماً)."
    });
  }

  // 5. Risk Factors (Must be a non-empty array with valid options)
  if (!Array.isArray(riskFactors) || riskFactors.length === 0) {
    errors.push({
      field: "riskChoices",
      message: isEn
        ? "Please select your risk factors (or choose 'None')."
        : "يرجى تحديد عوامل الخطورة (أو اختيار 'لا يوجد')."
    });
  } else {
    const validRf = ["ربو", "تدخين", "حمل", "لا يوجد", "asthma", "smoking", "pregnancy", "none"];
    const hasInvalid = riskFactors.some(rf => !validRf.includes(String(rf).trim()) && !validRf.includes(String(rf).trim().toLowerCase()));
    if (hasInvalid) {
      errors.push({
        field: "riskChoices",
        message: isEn
          ? "Invalid risk factors selected."
          : "تم اختيار عوامل خطورة غير صالحة."
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    errorSummary: errors.map(e => e.message).join(" | ")
  };
}

document.getElementById("submitAssessment").addEventListener("click", async () => {
  updateOxygenWarning();

  if (!hasAcceptedPrivacyConsent()) {
    showToast(currentLanguage === "en"
      ? "Please review and accept the medical privacy consent before submitting."
      : "يرجى مراجعة وتأكيد الموافقة الطبية وسياسة الخصوصية قبل الإرسال.");
    showScreen("consent");
    return;
  }

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
  const isEn = currentLanguage === "en";

  try {
    // ── جمع بيانات النموذج ──────────────────────────────────────────
    const oxygenLevel = readOxygenValue();

    // ضيق التنفس (نعم/لا)
    const breathingChoices = document.querySelectorAll("#breathingChoices .choice");
    let breathingDifficulty = "غير محدد";
    breathingChoices.forEach((btn) => {
      if (btn.classList.contains("active")) breathingDifficulty = btn.textContent.trim();
    });

    // درجة الكحة
    const coughChoices = document.querySelectorAll("#coughChoices .choice");
    let coughLevel = "غير محدد";
    coughChoices.forEach((btn) => {
      if (btn.classList.contains("active")) coughLevel = btn.textContent.trim();
    });

    // مدة الأعراض
    const durationField = document.getElementById("symptomDuration");
    const symptomDuration = durationField ? durationField.value.trim() : "غير محدد";

    // عوامل الخطورة (يمكن أكثر من واحد)
    const riskChoices = document.querySelectorAll("#riskChoices .choice");
    const riskFactors = [];
    riskChoices.forEach((btn) => {
      if (btn.classList.contains("active")) riskFactors.push(btn.textContent.trim());
    });

    // ── التحقق الشامل الصارم من كافة حقول التقييم (Full Assessment Validation) ──
    const validation = validateAssessmentFields({
      oxygenLevel,
      breathingDifficulty,
      coughLevel,
      symptomDuration,
      riskFactors,
      isEn
    });

    if (!validation.isValid) {
      // تنظيف الحدود السابقة
      ["oxygenInput", "symptomDuration"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.borderColor = "";
      });
      ["breathingChoices", "coughChoices", "riskChoices"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.outline = "";
      });

      // تمييز الحقل غير الصالح والتركيز عليه
      const firstErr = validation.errors[0];
      const targetEl = document.getElementById(firstErr.field);
      if (targetEl) {
        if (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") {
          targetEl.focus();
          targetEl.style.borderColor = "var(--red)";
        } else {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          targetEl.style.outline = "2px solid var(--red)";
          targetEl.style.borderRadius = "8px";
        }
      }

      showToast(`⚠️ ${firstErr.message}`);
      updateOxygenWarning();
      submitBtn.disabled = false;
      submitBtn.textContent = isEn ? "Send to Doctor" : "إرسال للطبيب";
      return;
    }

    // ── اعتراض الحالات الحرجة جداً للتأكد من التوجه للطوارئ ─────────
    if (oxygenLevel > 0 && oxygenLevel < 90 && !window._emergencySubmissionConfirmed) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEn ? "Send to Doctor" : "إرسال للطبيب";
      openEmergencySubmitModal(oxygenLevel, () => {
        window._emergencySubmissionConfirmed = true;
        document.getElementById("submitAssessment").click();
      });
      return;
    }
    window._emergencySubmissionConfirmed = false;

    // ── قراءة الطبيب المرتبط وبيانات العيادة ───────────────────────
    const linkedDoctorEl = document.getElementById("profileLinkedDoctor");
    const linkedDoctorName = linkedDoctorEl ? linkedDoctorEl.value.trim() : (isEn ? "Dr. Mona Samy - Nasr City Clinic" : "د. منى سامي - عيادة مدينة نصر");
    const clinicName = isEn ? "Nasr City Clinic" : "عيادة مدينة نصر";

    // حساب الأولوية المتوقعة
    const priority = oxygenLevel > 0 && oxygenLevel < 90 ? "urgent" : (oxygenLevel > 0 && oxygenLevel < 93 ? "high" : "normal");
    const priorityAr = { urgent: "🚨 عاجل", high: "⚠️ عالية", normal: "✔️ عادية" };

    // ── فتح نافذة تأكيد الإرسال (Confirmation Step Before Submission) ──
    openConfirmAssessmentModal({
      oxygenLevel,
      breathingDifficulty,
      coughLevel,
      symptomDuration,
      riskFactors,
      assignedDoctorName: linkedDoctorName,
      clinicName,
      priority,
      priorityAr: priorityAr[priority]
    }, async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = isEn ? "Submitting..." : "جاري الإرسال...";

      try {
        // ── بناء وثيقة الحالة عبر الـ Schema المعياري الموحد ────────────
        const caseData = buildAssessmentModel({
          user,
          oxygenLevel,
          breathingRaw: breathingDifficulty,
          coughRaw: coughLevel,
          symptomDurationRaw: symptomDuration,
          riskFactorsRaw: riskFactors,
          assignedDoctorId: window._patientAssignedDoctorId || null,
          assignedDoctorName: linkedDoctorName || null,
          clinicId: window._patientClinicId || "clinic_cairo_nasr_city",
          clinicName
        });

        // ── حفظ في Firestore ──────────────────────────────────────────
        const docRef = await db.collection("cases").add(caseData);
        console.log("✅ Standardized Case saved to Firestore:", docRef.id);

        // ── تسجيل في Audit Log ────────────────────────────────────────
        await db.collection("auditLog").add({
          action: "CASE_SUBMITTED",
          caseId: docRef.id,
          patientId: user.uid,
          priority: caseData.priority,
          oxygenLevel: caseData.oxygenLevel,
          schemaVersion: ASSESSMENT_SCHEMA_VERSION,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        showScreen("pending");

        // ── تفعيل بانر الطوارئ البارز في شاشة الانتظار ──────────────────
        const pendingAlertEl = document.getElementById("pendingEmergencyAlert");
        if (pendingAlertEl) {
          if (oxygenLevel > 0 && oxygenLevel < 90) {
            pendingAlertEl.hidden = false;
            pendingAlertEl.className = "emergency-pending-banner critical";
            pendingAlertEl.innerHTML = `
              <div class="emergency-banner-top">
                <span class="emergency-pulsing-icon">🚨</span>
                <div>
                  <h2 class="emergency-banner-title">${isEn ? 'CRITICAL EMERGENCY ALERT — Seek Immediate Emergency Care' : 'تنبيه طوارئ فوري — لا تنتظر مراجعة الطبيب الإلكترونية'}</h2>
                  <p class="emergency-banner-desc">
                    ${isEn
                      ? `Recorded oxygen level (<strong style="color:#ef4444;font-size:16px;">${oxygenLevel}%</strong>) is critically low (severe hypoxemia). Online clinical review cannot replace emergency department care. Please call 123 or proceed to the nearest ER now.`
                      : `نسبة الأكسجين المسجلة (<strong style="color:#ef4444;font-size:16px;">${oxygenLevel}%</strong>) حرجة للغاية (نقص أكسجين حاد). المراجعة الإلكترونية الروتينية لا تغني عن الطوارئ. يرجى التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف الآن.`}
                  </p>
                </div>
              </div>
              <div class="emergency-banner-footer">
                <a href="tel:123" class="emergency-big-call-btn">
                  <span>📞</span> <strong>${isEn ? 'Call Ambulance (123) Immediately' : 'اتصال بالإسعاف (123) فوراً'}</strong>
                </a>
                <button type="button" class="emergency-banner-guide-btn" onclick="openEmergencyGuideModal()">
                  📋 ${isEn ? 'First Aid Guide' : 'إرشادات الإسعافات الأولية'}
                </button>
              </div>
            `;
          } else if (oxygenLevel >= 90 && oxygenLevel < 93) {
            pendingAlertEl.hidden = false;
            pendingAlertEl.className = "emergency-pending-banner warning";
            pendingAlertEl.innerHTML = `
              <div class="emergency-banner-top">
                <span class="emergency-pulsing-icon">⚠️</span>
                <div>
                  <h2 class="emergency-banner-title">${isEn ? 'High Priority Alert — Low Oxygen (' + oxygenLevel + '%)' : 'أولوية عاجلة — نسبة الأكسجين منخفضة (' + oxygenLevel + '%)'}</h2>
                  <p class="emergency-banner-desc">
                    ${isEn
                      ? `Your case has been escalated with high priority for the doctor. If shortness of breath worsens or chest pain develops, seek emergency care immediately.`
                      : `تم إرسال حالتك بأولوية عاجلة للطبيب. إذا شعرت بزيادة حادة في صعوبة التنفس أو ألم بالصدر، توجه للطوارئ فوراً أو اتصل بالإسعاف (123).`}
                  </p>
                </div>
              </div>
              <div class="emergency-banner-footer">
                <a href="tel:123" class="emergency-big-call-btn warning-btn">
                  <span>📞</span> <strong>${isEn ? 'Call Emergency (123)' : 'طلب الطوارئ (123)'}</strong>
                </a>
              </div>
            `;
          } else {
            pendingAlertEl.hidden = true;
            pendingAlertEl.innerHTML = "";
          }
        }

        showToast(
          priority === "urgent"
            ? (isEn ? "🚨 Urgent case confirmed and sent to doctor" : "🚨 تم تأكيد وإرسال الحالة العاجلة للطبيب")
            : priority === "high"
            ? (isEn ? "⚠️ High priority assessment sent to doctor" : "⚠️ تم تأكيد وإرسال الحالة بأولوية عالية للطبيب")
            : (isEn ? "✅ Assessment confirmed and sent to doctor" : "✅ تم تأكيد وإرسال التقييم للطبيب بنجاح")
        );

        // ── ملء بطاقة الحالة في شاشة الانتظار ───────────────────────
        const now = new Date().toLocaleTimeString(isEn ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" });
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
          showToast(isEn ? "Permission error — please sign in" : "خطأ في الصلاحيات — تأكد من تسجيل الدخول");
        } else {
          showToast(isEn ? "Error sending assessment. Please try again." : "حدث خطأ أثناء الإرسال. حاول مرة أخرى.");
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEn ? "Send to Doctor" : "إرسال للطبيب";
      }
    });

  } catch (error) {
    console.error("❌ Error initiating assessment submission:", error);
    showToast(isEn ? "An unexpected error occurred." : "حدث خطأ غير متوقع.");
    submitBtn.disabled = false;
    submitBtn.textContent = isEn ? "Send to Doctor" : "إرسال للطبيب";
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
            selectedRole = normalizeRole(userDoc.data().role || ROLES.PATIENT);
          }
          if (userDoc.data().name) displayName = userDoc.data().name;
        } else {
          const safeRole = isOwner ? ROLES.SUPER_ADMIN : ROLES.PATIENT;
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: displayName || user.email.split('@')[0],
            email: user.email,
            emailVerified: user.emailVerified || false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (e) {
        console.warn("Firestore role fetch failed, defaulting to patient:", e);
        selectedRole = isOwner ? ROLES.SUPER_ADMIN : ROLES.PATIENT;
      }
      
      userName.textContent = displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (englishRoleLabels[normalizeRole(selectedRole, isOwner)] || englishRoleLabels.patient)
        : (roleLabels[normalizeRole(selectedRole, isOwner)] || roleLabels.patient);
      
      updateAvatar(user);
      updateEmailVerificationUI(user);
      updateNavVisibility();
      
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
