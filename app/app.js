const loader = document.getElementById("loader");
const publicSite = document.getElementById("publicSite");
const authScreen = document.getElementById("authScreen");
const app = document.getElementById("app");
const toast = document.getElementById("toast");
const screenTitle = document.getElementById("screenTitle");
const themeToggle = document.getElementById("themeToggle");
const siteThemeToggle = document.getElementById("siteThemeToggle");
const languageToggle = document.getElementById("languageToggle");
const menuToggle = document.getElementById("menuToggle");
const logoutButton = document.getElementById("logoutButton");
const emailInput = document.getElementById("emailInput");
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

const roleLabels = {
  patient: "حساب مريض",
  doctor: "حساب طبيب موثق",
  admin: "حساب إدارة"
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
  admin: "Admin account"
};

const englishNames = {
  patient: "Ahmed Mohamed",
  doctor: "Dr. Mona Samy",
  admin: "Operations Admin"
};

const uiText = {
  "Health Vibe": "HealthVibe AI",
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
  "Health Vibe يجمع التقييم، مراجعة الطبيب، التقارير، المواعيد، والسجل الطبي في تجربة عربية واحدة مبنية للأفراد والعيادات في مصر.": "HealthVibe AI brings assessment, doctor review, reports, appointments, and medical history into one experience built for people and clinics in Egypt.",
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
  "اختر الدور ثم سجل الدخول. زر جوجل يعمل كمحاكاة الآن وجاهز للتوصيل بمعرّف تسجيل جوجل.": "Choose a role, then sign in. The Google button is simulated for now and ready to connect to a Google sign-in client.",
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
  "حالة المراجعة": "Review Status",
  "النتيجة": "Result",
  "السجل": "History",
  "المواعيد": "Appointments",
  "المساعد الطبي": "Medical Assistant",
  "توثيق الطبيب": "Doctor Verification",
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
  "Health Vibe يستخدم بياناتك الصحية لتقييم خطورة إرشادي ثم يرسلها لطبيب معتمد قبل ظهور أي نتيجة نهائية.": "HealthVibe AI uses your health data for a guidance-only risk assessment, then sends it to a verified doctor before any final result appears.",
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
  "تنبيه طبي: Health Vibe يساعد في دعم القرار الطبي ولا يستبدل التقييم الطبي المؤهل أو رعاية الطوارئ.": "Medical notice: HealthVibe AI supports clinical decision-making and does not replace qualified medical evaluation or emergency care.",
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
  "الواجهة مضبوطة على الإنجليزية": "Interface set to English"
};

let selectedRole = "patient";
let currentLanguage = "ar";

function localized(arText) {
  return currentLanguage === "en" ? uiText[arText] || arText : arText;
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
  document.title = localized("Health Vibe");

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
  screenTitle.textContent = language === "en" ? englishTitles[getActiveScreen()] || "Health Vibe" : titles[getActiveScreen()] || "Health Vibe";
  accountLabel.textContent = language === "en" ? englishRoleLabels[selectedRole] : roleLabels[selectedRole];
}

function showToast(message) {
  toast.textContent = localized(message);
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function showAuth() {
  authScreen.classList.add("open");
}

function hideAuth() {
  authScreen.classList.remove("open");
}

function enterApp(source = "email") {
  const email = emailInput.value.trim() || "أحمد";
  const names = {
    patient: "أحمد محمد",
    doctor: "د. منى سامي",
    admin: "إدارة التشغيل"
  };

  userName.textContent = currentLanguage === "en" ? englishNames[selectedRole] : names[selectedRole];
  userEmail.textContent = source === "google" ? localized("مستخدم جوجل التجريبي") : email;
  accountLabel.textContent = currentLanguage === "en" ? englishRoleLabels[selectedRole] : roleLabels[selectedRole];

  publicSite.hidden = true;
  hideAuth();
  app.hidden = false;
  showScreen(selectedRole === "doctor" ? "doctor" : selectedRole === "admin" ? "admin" : "patient");
  showToast(source === "google" ? "تم تسجيل الدخول بمحاكاة تسجيل جوجل" : "تم تسجيل الدخول بنجاح");
}

function leaveApp() {
  app.hidden = true;
  publicSite.hidden = false;
  publicSite.classList.remove("is-hidden");
  showToast("تم تسجيل الخروج");
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${name}`);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === name);
  });

  screenTitle.textContent = currentLanguage === "en" ? englishTitles[name] || "HealthVibe AI" : titles[name] || "Health Vibe";
  document.body.classList.remove("sidebar-open");
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
    selectedRole = roleButton.dataset.role;
    document.querySelectorAll("[data-role]").forEach((button) => {
      button.classList.toggle("active", button === roleButton);
    });
    return;
  }

  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    showScreen(screenButton.dataset.screen);
  }
});

document.getElementById("authClose").addEventListener("click", hideAuth);
document.getElementById("emailLogin").addEventListener("click", () => enterApp("email"));
document.getElementById("googleLogin").addEventListener("click", () => enterApp("google"));
document.getElementById("oxygenInput").addEventListener("input", updateOxygenWarning);
document.getElementById("submitAssessment").addEventListener("click", () => {
  updateOxygenWarning();
  showScreen("pending");
  showToast(readOxygenValue() < 93 ? "تم إرسال الحالة للطبيب مع أولوية متابعة" : "تم إرسال التقييم للطبيب");
});
document.getElementById("approveResult").addEventListener("click", openApprovalModal);
document.getElementById("cancelApprove").addEventListener("click", closeApprovalModal);
document.getElementById("confirmApprove").addEventListener("click", () => {
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
siteThemeToggle.addEventListener("click", toggleTheme);

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
  window.setTimeout(() => {
    loader.classList.add("is-done");
    publicSite.classList.remove("is-hidden");
  }, 900);
});

showScreen("patient");
applyLanguage("en");
updateOxygenWarning();
