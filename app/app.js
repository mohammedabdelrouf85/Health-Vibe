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

const OWNER_EMAIL = "mohammedabdelrouf85@gmail.com";

function isOwnerUser(userOrEmail) {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === "string" ? userOrEmail : userOrEmail.email;
  return Boolean(email && email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase());
}

const roleLabels = {
  patient: "حساب مريض",
  doctor: "حساب طبيب موثق",
  admin: "حساب إدارة",
  owner: "مالك النظام (Owner)"
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
  doctor: "Verified doctor account",
  admin: "Admin account",
  owner: "System Owner (Full Access)"
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
  "+12 اليوم": "+12 today",
  "6 بانتظار التوثيق": "6 awaiting verification",
  "الفروع": "Branches",
  "نسخة مصر الأولى": "Egypt first release",
  "مراجعات معلقة": "Pending reviews",
  "2 عاجلة": "2 urgent",
  "مؤشرات نموذج الذكاء الاصطناعي": "AI model metrics",
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
  accountLabel.textContent = language === "en"
    ? (isOwner ? englishRoleLabels.owner : (englishRoleLabels[selectedRole] || englishRoleLabels.patient))
    : (isOwner ? roleLabels.owner : (roleLabels[selectedRole] || roleLabels.patient));
  if (typeof setAuthMode === "function") setAuthMode(authMode);
  if (typeof updateEmailVerificationUI === "function" && typeof auth !== "undefined") updateEmailVerificationUI(auth.currentUser);
}

function showToast(message) {
  toast.textContent = localized(message);
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

// --- Real Database (Firebase Firestore) ---
const firebaseConfig = {
  apiKey: "AIzaSyANyIglmiKcdM0I2EKkjPhzMjKR58o8BRM",
  authDomain: "health-vibes-a4b3b.firebaseapp.com",
  projectId: "health-vibes-a4b3b",
  storageBucket: "health-vibes-a4b3b.firebasestorage.app",
  messagingSenderId: "21682568356",
  appId: "1:21682568356:web:d38947f11647fdfef13a31",
  measurementId: "G-FSHSN2XB4L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
async function initDB() {
  try {
    const snapshot = await db.collection("cases").limit(1).get();
    if (snapshot.empty) {
      const initialCases = [
        { id: "case_1", name: "أحمد محمد", nameEn: "Ahmed Mohamed", o2: 91, symptoms: "كحة شديدة", symptomsEn: "Severe cough", risk: "عاجل", riskEn: "Urgent", status: "pending", time: "الآن", aiScore: "عالية", aiScoreEn: "High", confidence: "89%", duration: "3 أيام", durationEn: "3 days", createdAt: new Date().getTime() },
        { id: "case_2", name: "سارة علي", nameEn: "Sarah Ali", o2: 96, symptoms: "أعراض خفيفة", symptomsEn: "Mild symptoms", risk: "مراجعة", riskEn: "Review", status: "pending", time: "منذ 14 دقيقة", aiScore: "متوسطة", aiScoreEn: "Medium", confidence: "78%", duration: "يومين", durationEn: "2 days", createdAt: new Date().getTime() - 1000 },
        { id: "case_3", name: "محمد حسن", nameEn: "Mohamed Hassan", o2: 98, symptoms: "لا توجد أعراض ظاهرة", symptomsEn: "No clear symptoms", risk: "منخفض", riskEn: "Low", status: "approved", time: "تقرير جاهز", aiScore: "منخفضة", aiScoreEn: "Low", confidence: "94%", duration: "يوم واحد", durationEn: "1 day", createdAt: new Date().getTime() - 2000 }
      ];
      for (let c of initialCases) {
        await db.collection("cases").doc(c.id).set(c);
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

initDB();

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
      const safeRole = isOwner ? "admin" : ((selectedRole === "doctor") ? "doctor" : "patient");
      selectedRole = safeRole;

      await db.collection("users").doc(user.uid).set({
        name: displayName,
        email: user.email,
        role: safeRole,
        isOwner: isOwner,
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
          const safeRole = isOwner ? "admin" : ((selectedRole === "doctor") ? "doctor" : "patient");
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: safeRole,
            isOwner: isOwner,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          if (isOwner) {
            selectedRole = "admin";
            if (userDoc.data().role !== "admin" || !userDoc.data().isOwner) {
              await db.collection("users").doc(user.uid).set({
                role: "admin",
                isOwner: true
              }, { merge: true });
            }
          } else {
            selectedRole = userDoc.data().role || selectedRole;
          }
        }
      } catch (dbError) {
        console.warn("Firestore save failed, but auth succeeded:", dbError);
        if (isOwner) selectedRole = "admin";
      }

      userName.textContent = user.displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (isOwner ? englishRoleLabels.owner : (englishRoleLabels[selectedRole] || englishRoleLabels.patient))
        : (isOwner ? roleLabels.owner : (roleLabels[selectedRole] || roleLabels.patient));
      
      updateAvatar(user);
      updateEmailVerificationUI(user);

      publicSite.hidden = true;
      hideAuth();
      app.hidden = false;
      showScreen(selectedRole === "doctor" ? "doctor" : selectedRole === "admin" ? "admin" : "patient");
      showToast(currentLanguage === "en" ? "Signed in with Google" : "تم تسجيل الدخول بحساب جوجل");
    } catch (error) {
      console.error("Google Auth Error:", error);
      showAuthError(getAuthErrorMessage(error));
    }
  }
}

async function leaveApp() {
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

  if (!user) {
    if (banner) banner.style.display = "none";
    if (badge) badge.style.display = "none";
    if (ownerBadge) ownerBadge.style.display = "none";
    return;
  }

  if (ownerBadge) {
    ownerBadge.style.display = isOwnerUser(user.email) ? "inline-flex" : "none";
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

function updateNavVisibility() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    const screen = btn.dataset.screen;
    if (screen === "admin" || screen === "audit") {
      btn.style.display = selectedRole === "admin" ? "flex" : "none";
    } else if (screen === "doctor" || screen === "verification") {
      btn.style.display = (selectedRole === "doctor" || selectedRole === "admin") ? "flex" : "none";
    } else {
      btn.style.display = "flex";
    }
  });
}

function showScreen(name) {
  if ((name === "admin" || name === "audit") && selectedRole !== "admin") {
    showToast(currentLanguage === "en" ? "Restricted: Administrator access only." : "غير مصرح: هذا القسم خاص بإدارة النظام فقط.");
    name = selectedRole === "doctor" ? "doctor" : "patient";
  } else if ((name === "doctor" || name === "verification") && selectedRole !== "doctor" && selectedRole !== "admin") {
    showToast(currentLanguage === "en" ? "Restricted: Verified healthcare providers only." : "غير مصرح: هذا القسم مخصص للأطباء المعتمدين فقط.");
    name = "patient";
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
}

async function renderPatientDashboard() {
  const user = auth ? auth.currentUser : null;
  const isEn = currentLanguage === "en";
  
  // Set default / empty states
  const firstName = user ? (user.displayName ? user.displayName.split(" ")[0] : (isEn ? "Guest" : "ضيف")) : "أحمد";
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
  
  try {
    const snapshot = await db.collection("cases").where("userId", "==", user.uid).get();
    let cases = snapshot.docs.map(d => d.data());
    
    if (cases.length > 0) {
      cases.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeB - timeA;
      });
      const c = cases[0];
      
      document.getElementById("patientClinicalStatus").textContent = isEn ? c.status : (c.status === 'pending' ? 'قيد المراجعة' : 'معتمد');
      document.getElementById("patientClinicalO2").textContent = `${c.o2}%`;
      document.getElementById("patientClinicalConfidence").textContent = c.confidence;
      document.getElementById("patientClinicalDoctor").textContent = isEn ? "Dr. Mona Samy" : "د. منى سامي";
      
      const dateVal = c.createdAt?.toMillis ? c.createdAt.toMillis() : c.createdAt;
      const date = dateVal ? new Date(dateVal).toLocaleDateString(isEn ? 'en-US' : 'ar-EG') : "--";
      
      document.getElementById("patientLatestReport").textContent = date;
      document.getElementById("patientResultStatus").textContent = isEn ? c.status : (c.status === 'pending' ? 'قيد الانتظار' : 'اكتمل');
      
      if (c.status === 'approved') {
        document.getElementById("patientAlertsCount").textContent = isEn ? "1 new" : "1 جديد";
        document.getElementById("patientAlertsList").innerHTML = `<div><strong>${isEn ? 'Your result is ready' : 'النتيجة المعتمدة جاهزة'}</strong><span>${date}</span></div>`;
      } else {
        document.getElementById("patientAlertsCount").textContent = isEn ? "1 pending" : "1 قيد المراجعة";
        document.getElementById("patientAlertsList").innerHTML = `<div><strong>${isEn ? 'Assessment sent to doctor' : 'تم إرسال التقييم للطبيب'}</strong><span>${date}</span></div>`;
      }
    }
  } catch (error) {
    console.warn("Failed to fetch patient data", error);
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
    selectedRole = "patient";
    enterApp("preview");
    return;
  }

  const roleButton = event.target.closest("[data-role]");
  if (roleButton) {
    const requestedRole = roleButton.dataset.role;
    selectedRole = (requestedRole === "doctor") ? "doctor" : "patient";
    document.querySelectorAll("[data-role]").forEach((button) => {
      button.classList.toggle("active", button.dataset.role === selectedRole);
    });
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

document.getElementById("oxygenInput").addEventListener("input", updateOxygenWarning);
document.getElementById("submitAssessment").addEventListener("click", () => {
  updateOxygenWarning();
  showScreen("pending");
  showToast(readOxygenValue() < 93 ? "تم إرسال الحالة للطبيب مع أولوية متابعة" : "تم إرسال التقييم للطبيب");
});
const approveResultBtn = document.getElementById("approveResult");
if (approveResultBtn) approveResultBtn.addEventListener("click", openApprovalModal);

const cancelApproveBtn = document.getElementById("cancelApprove");
if (cancelApproveBtn) cancelApproveBtn.addEventListener("click", closeApprovalModal);

const confirmApproveBtn = document.getElementById("confirmApprove");
if (confirmApproveBtn) confirmApproveBtn.addEventListener("click", () => {
  closeApprovalModal();
  showScreen("result");
  showToast("تم اعتماد النتيجة وتسجيل الحدث في سجل التدقيق");
});
document.getElementById("fileUpload").addEventListener("change", (event) => {
  const fileList = document.getElementById("fileList");
  [...event.target.files].forEach((file) => {
    const item = document.createElement("div");
    item.innerHTML = `<strong>${file.name}</strong><span>${localized("جاهز لمراجعة الطبيب - بدون تحليل ذكاء اصطناعي")}</span>`;
    fileList.prepend(item);
  });
  if (event.target.files.length) showToast("تمت إضافة الملف كمرجع للطبيب");
});
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
    if (user) {
      const isOwner = isOwnerUser(user.email);
      let displayName = user.displayName;
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          if (isOwner) {
            selectedRole = "admin";
            if (userDoc.data().role !== "admin" || !userDoc.data().isOwner) {
              await db.collection("users").doc(user.uid).set({
                role: "admin",
                isOwner: true
              }, { merge: true });
            }
          } else {
            selectedRole = userDoc.data().role || selectedRole;
          }
          if (userDoc.data().name) displayName = userDoc.data().name;
        } else {
          const safeRole = isOwner ? "admin" : ((selectedRole === "doctor") ? "doctor" : "patient");
          selectedRole = safeRole;
          await db.collection("users").doc(user.uid).set({
            name: displayName || user.email.split('@')[0],
            email: user.email,
            role: safeRole,
            isOwner: isOwner,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (e) {
        console.warn("Firestore role fetch failed, defaulting to patient:", e);
        if (isOwner) selectedRole = "admin";
      }
      
      userName.textContent = displayName || user.email.split('@')[0];
      userEmail.textContent = user.email;
      accountLabel.textContent = currentLanguage === "en"
        ? (isOwner ? englishRoleLabels.owner : (englishRoleLabels[selectedRole] || englishRoleLabels.patient))
        : (isOwner ? roleLabels.owner : (roleLabels[selectedRole] || roleLabels.patient));
      
      updateAvatar(user);
      updateEmailVerificationUI(user);
      
      publicSite.hidden = true;
      hideAuth();
      app.hidden = false;
      showScreen(selectedRole === "doctor" ? "doctor" : selectedRole === "admin" ? "admin" : "patient");
      
      loader.classList.add("is-done");
    } else {
      updateEmailVerificationUI(null);
      window.setTimeout(() => {
        loader.classList.add("is-done");
        publicSite.classList.remove("is-hidden");
      }, 900);
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
