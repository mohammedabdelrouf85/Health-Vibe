/**
 * Health Vibe AI - Core Error Handling & Human-Friendly Guidance Module
 * 
 * Centralizes error categorization, PII redaction, human-friendly bilingual
 * error transformation, actionable user guidance (Vezeeta standard), and DOM-level
 * field feedback components.
 */

(function (global) {
  "use strict";

  /**
   * Redacts sensitive personally identifiable information (PII) from error messages and logs.
   * @param {*} input
   * @returns {*}
   */
  function redactClientPii(input) {
    if (input === null || input === undefined) return input;
    if (typeof input === "string") {
      return input
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[REDACTED_EMAIL]")
        .replace(/\b[23]\d{13}\b/g, "[REDACTED_NATIONAL_ID]")
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_NATIONAL_ID]")
        .replace(/(?:\+?20|0)?1[0125]\d{8}\b/g, "[REDACTED_PHONE]")
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
        .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, "[REDACTED_CARD]")
        .replace(/(["']?(?:password|passwd|secret|api[_-]?key|token|auth[a-z]*|bearer)["']?\s*[:=]\s*["']?)([^"',;&\s]{3,})/gi, "$1[REDACTED_SECRET]")
        .replace(/(["']?(?:dob|birthdate)["']?\s*[:=]\s*["']?)(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/gi, "$1[REDACTED_DOB]");
    }
    return input;
  }

  /**
   * Categorizes errors into standardized monitoring buckets.
   * @param {string} type
   * @param {string} message
   * @param {string} source
   * @returns {"ai_service"|"notification"|"auth"|"firebase"|"api"|"clinical"|"validation"|"javascript"}
   */
  function categorizeClientError(type = "", message = "", source = "") {
    const t = String(type).toLowerCase();
    const m = String(message).toLowerCase();
    const s = String(source).toLowerCase();

    if (t.includes("ai") || t.includes("gemini") || m.includes("gemini") || m.includes("triage") || s.includes("ai")) {
      return "ai_service";
    }
    if (t.includes("notification") || t.includes("smtp") || t.includes("email") || m.includes("smtp") || m.includes("mail")) {
      return "notification";
    }
    if (t.includes("auth") || t.includes("token") || m.includes("unauthorized") || m.includes("auth/")) {
      return "auth";
    }
    if (t.includes("clinical") || m.includes("spo2") || m.includes("vitals") || m.includes("blood-pressure")) {
      return "clinical";
    }
    if (t.includes("validation") || m.includes("invalid") || m.includes("format") || m.includes("required")) {
      return "validation";
    }
    if (t.includes("firestore") || t.includes("firebase") || t.includes("storage") || m.includes("permission_denied") || m.includes("firestore")) {
      return "firebase";
    }
    if (t.includes("api") || t.includes("fetch") || t.includes("http") || s.includes("server")) {
      return "api";
    }
    return "javascript";
  }

  /**
   * Tests whether an error represents a temporary network/connectivity failure.
   * @param {*} err
   * @returns {boolean}
   */
  function isNetworkError(err) {
    if (!err) return false;
    const str = String(err.message || err.code || err).toLowerCase();
    return str.includes("network") ||
      str.includes("failed to fetch") ||
      str.includes("offline") ||
      str.includes("unavailable") ||
      str.includes("deadline-exceeded") ||
      str.includes("econnrefused") ||
      str.includes("err_internet_disconnected");
  }

  /**
   * Transforms raw technical errors into patient-friendly bilingual messages (Vezeeta standard).
   * Prevents raw technical stack traces, cryptic error codes, and PII from leaking to users.
   * @param {Error|string|object} err
   * @param {string} [context=""]
   * @param {boolean} [isEn=false]
   * @returns {{ icon: string, category: string, title: string, message: string, action: string, ref: string, field: string|null, severity: string }}
   */
  function toFriendlyAppError(err, context = "", isEn = false) {
    let code = "";
    let rawMessage = "";

    if (typeof err === "string") {
      rawMessage = err;
      if (err.includes("/") || err.includes("-")) {
        code = err.trim().toLowerCase();
      }
    } else if (err && typeof err === "object") {
      code = String(err.code || "").toLowerCase();
      rawMessage = String(err.message || "");
    }

    // Context / fallback detection for raw error message patterns
    const rawLower = (rawMessage + " " + code).toLowerCase();

    if (!code && rawMessage) {
      if (rawLower.includes("permission-denied") || rawLower.includes("insufficient permissions")) {
        code = "permission-denied";
      } else if (isNetworkError(err) || rawLower.includes("network") || rawLower.includes("failed to fetch") || rawLower.includes("offline")) {
        code = "network-error";
      } else if (rawLower.includes("quota") || rawLower.includes("resource-exhausted")) {
        code = "resource-exhausted";
      } else if (rawLower.includes("user-not-found") || rawLower.includes("wrong-password") || rawLower.includes("invalid-credential")) {
        code = "auth/invalid-credential";
      } else if (rawLower.includes("spo2") || rawLower.includes("oxygen")) {
        code = "clinical/spo2-out-of-range";
      } else if (rawLower.includes("temperature") || rawLower.includes("fever") || rawLower.includes("حرارة")) {
        code = "clinical/temperature-out-of-range";
      } else if (rawLower.includes("respiratory") || rawLower.includes("تنفس")) {
        code = "clinical/respiratory-rate-out-of-range";
      } else if (rawLower.includes("pulse") || rawLower.includes("heart rate") || rawLower.includes("نبض")) {
        code = "clinical/heart-rate-out-of-range";
      } else if (rawLower.includes("phone") || rawLower.includes("هاتف") || rawLower.includes("محمول")) {
        code = "validation/phone-invalid";
      } else if (rawLower.includes("national id") || rawLower.includes("الرقم القومي")) {
        code = "validation/national-id-invalid";
      } else if (rawLower.includes("slot") || rawLower.includes("appointment") || rawLower.includes("موعد")) {
        code = "appointment/slot-taken";
      } else if (rawLower.includes("file") && (rawLower.includes("large") || rawLower.includes("size") || rawLower.includes("حجم"))) {
        code = "file/too-large";
      }
    }

    // -------------------------------------------------------------
    // 1. Clinical Vitals Validation (Vezeeta Patient Safety Standard)
    // -------------------------------------------------------------
    if (code.includes("spo2") || code.includes("oxygen")) {
      return {
        icon: "🩺",
        category: isEn ? "Vital Signs" : "العلامات الحيوية",
        title: isEn ? "Invalid Oxygen Saturation (SpO2)" : "نسبة الأكسجين غير صالحة",
        message: isEn
          ? "Blood oxygen saturation must be a valid integer percentage between 50% and 100%."
          : "نسبة تشبع الأكسجين في الدم يجب أن تكون قيمة صحيحة بين 50% و 100%.",
        action: isEn
          ? "Please re-check your pulse oximeter reading on your finger and enter a value between 50 and 100."
          : "يرجى التحقق من القراءة عبر جهاز مقياس النبض (Pulse Oximeter) وإعادة كتابة رقم صحيح بين 50 و 100.",
        field: "spo2",
        ref: "clinical/spo2-out-of-range",
        severity: "error"
      };
    }

    if (code.includes("temp") || code.includes("fever")) {
      return {
        icon: "🌡️",
        category: isEn ? "Vital Signs" : "العلامات الحيوية",
        title: isEn ? "Temperature Out of Clinical Range" : "درجة الحرارة خارج النطاق الطبي",
        message: isEn
          ? "Body temperature must be within a physiologically safe human range (34.0°C to 43.0°C)."
          : "درجة حرارة الجسم المسجلة غير متوافقة مع القياس البشري المعتمد (المسموح بين 34.0° و 43.0° مئوية).",
        action: isEn
          ? "Check with a clinical thermometer and enter a reading with one decimal place (e.g. 37.2 or 38.5)."
          : "أعد قياس الحرارة بالترمومتر واكتب الرقم بالفواصل العشرية المعتادة (مثال: 37.2 أو 38.5).",
        field: "temperature",
        ref: "clinical/temperature-out-of-range",
        severity: "error"
      };
    }

    if (code.includes("heart-rate") || code.includes("pulse")) {
      return {
        icon: "💓",
        category: isEn ? "Vital Signs" : "العلامات الحيوية",
        title: isEn ? "Invalid Heart Rate" : "معدل النبض غير منطقي",
        message: isEn
          ? "Resting heart rate must be within the physiological range of 30 to 250 beats per minute (bpm)."
          : "معدل نبضات القلب يجب أن يتراوح بين 30 و 250 نبضة في الدقيقة.",
        action: isEn
          ? "Count your radial pulse for 60 seconds or use a digital monitor, then enter an integer."
          : "يرجى إعادة قياس النبض يدوياً أو عبر الساعة الذكية وإدخال رقم صحيح بين 30 و 250.",
        field: "heart_rate",
        ref: "clinical/heart-rate-out-of-range",
        severity: "error"
      };
    }

    if (code.includes("respiratory") || code.includes("breaths")) {
      return {
        icon: "🫁",
        category: isEn ? "Vital Signs" : "العلامات الحيوية",
        title: isEn ? "Invalid Respiratory Rate" : "معدل التنفس غير منطقي",
        message: isEn
          ? "Respiratory rate must be between 5 and 60 breaths per minute."
          : "معدل التنفس يجب أن يتراوح بين 5 و 60 نَفَساً في الدقيقة.",
        action: isEn
          ? "Count the number of full breaths in 60 seconds while relaxed, and enter the count."
          : "احسب عدد مرات التنفس (شهيق وزفير) خلال دقيقة واحدة واكتب القيمة الناتجة.",
        field: "respiratory_rate",
        ref: "clinical/respiratory-rate-out-of-range",
        severity: "error"
      };
    }

    if (code.includes("blood-pressure") || code.includes("systolic") || code.includes("diastolic")) {
      return {
        icon: "🩸",
        category: isEn ? "Vital Signs" : "العلامات الحيوية",
        title: isEn ? "Invalid Blood Pressure Reading" : "قراءة ضغط الدم غير صحيحة",
        message: isEn
          ? "Systolic pressure (top number) must be higher than diastolic pressure (bottom number)."
          : "ضغط الدم الانقباضي (الرقم الأعلى) يجب أن يكون أكبر من الضغط الانبساطي (الرقم الأدنى).",
        action: isEn
          ? "Check your blood pressure monitor and ensure the top number (e.g. 120) is placed before the bottom number (e.g. 80)."
          : "تأكد من كتابة الرقمين بالترتيب الصحيح (مثال: 120 انقباضي على 80 انبساطي).",
        field: "blood_pressure",
        ref: "clinical/blood-pressure-invalid",
        severity: "error"
      };
    }

    if (code.includes("duration") || code.includes("symptom-duration")) {
      return {
        icon: "⏱️",
        category: isEn ? "Clinical Symptoms" : "الأعراض السريرية",
        title: isEn ? "Invalid Symptom Duration" : "مدة استمرار الأعراض غير دقيقة",
        message: isEn
          ? "Symptom duration must be a realistic duration between 1 day and 365 days."
          : "يرجى تحديد مدة ظهور الأعراض بين يوم واحد و 365 يوماً.",
        action: isEn
          ? "Enter the approximate number of days since you first noticed symptoms (e.g. 3 or 7)."
          : "اكتب عدد الأيام بالتقريب منذ بدء ظهور الأعراض (مثال: 3 أيام أو أسبوع = 7 أيام).",
        field: "symptom_duration",
        ref: "clinical/duration-out-of-range",
        severity: "error"
      };
    }

    // -------------------------------------------------------------
    // 2. Patient Form, Identity & Contact Validation (Vezeeta Standard)
    // -------------------------------------------------------------
    if (code.includes("phone") || code.includes("mobile")) {
      return {
        icon: "📱",
        category: isEn ? "Contact Information" : "بيانات التواصل",
        title: isEn ? "Invalid Mobile Number" : "رقم الهاتف غير صحيح",
        message: isEn
          ? "Egyptian mobile numbers must consist of 11 digits starting with 010, 011, 012, or 015."
          : "رقم المحمول المصري يتكون من 11 رقماً ويبدأ بأحد الشبكات: 010 أو 011 أو 012 أو 015.",
        action: isEn
          ? "Check for missing digits or accidental spaces and enter an 11-digit mobile number (e.g. 01012345678)."
          : "تأكد من كتابة 11 رقماً بدون مسافات أو رموز خاصة (مثال: 01012345678).",
        field: "phone",
        ref: "validation/phone-invalid",
        severity: "error"
      };
    }

    if (code.includes("national-id") || code.includes("nid")) {
      return {
        icon: "🪪",
        category: isEn ? "National Identity" : "الهوية الشخصية",
        title: isEn ? "Invalid National ID" : "الرقم القومي غير مطابق",
        message: isEn
          ? "Egyptian National ID consists of exactly 14 digits starting with 2 or 3 matching official records."
          : "الرقم القومي المصري يتكون من 14 رقماً ويبدأ بالرقم 2 أو 3 وفقاً لسجلات شهادة الميلاد وبطاقة الهوية.",
        action: isEn
          ? "Check your national identity card and enter all 14 digits without spaces or dashes."
          : "راجع بطاقة الرقم القومي وأدخل الـ 14 رقماً بالكامل دون فواصل أو مسافات.",
        field: "national_id",
        ref: "validation/national-id-invalid",
        severity: "error"
      };
    }

    if (code.includes("required") || code.includes("missing-field")) {
      return {
        icon: "✏️",
        category: isEn ? "Required Information" : "الحقول الإلزامية",
        title: isEn ? "Required Field Missing" : "يرجى استكمال البيانات المطلوبة",
        message: isEn
          ? "This field is required to ensure clinical safety and schedule your medical consultation."
          : "هذا الحقل إلزامي لضمان دقة التقييم الطبي وحجز الاستشارة بنجاح.",
        action: isEn
          ? "Please fill in the highlighted field marked with an asterisk (*) to proceed."
          : "يرجى ملء الحقل المحدد بعلامة النجمة (*) للمتابعة.",
        field: null,
        ref: "validation/required-field",
        severity: "error"
      };
    }

    // -------------------------------------------------------------
    // 3. Appointments & Doctor Scheduling (Vezeeta Standard)
    // -------------------------------------------------------------
    if (code.includes("slot-taken") || code.includes("slot-already-booked") || code.includes("slot-unavailable")) {
      return {
        icon: "📅",
        category: isEn ? "Appointments" : "حجز المواعيد",
        title: isEn ? "Time Slot Already Booked" : "الموعد تم حجزه للتو",
        message: isEn
          ? "Another patient just confirmed this specific appointment slot. Clinic schedules update in real time."
          : "قام مريض آخر بحجز هذا الموعد قبل ثوانٍ قليلة. يتم تحديث جدول العيادة فورياً.",
        action: isEn
          ? "Please select another convenient slot from the doctor's available calendar."
          : "يرجى اختيار موعد بديل مناسب من جدول المواعيد المتاحة لدى الطبيب.",
        field: "appointment_slot",
        ref: "appointment/slot-taken",
        severity: "warning"
      };
    }

    if (code.includes("past-date") || code.includes("past-time")) {
      return {
        icon: "⏳",
        category: isEn ? "Appointments" : "حجز المواعيد",
        title: isEn ? "Appointment In The Past" : "تاريخ الموعد غير متاح",
        message: isEn
          ? "Appointments cannot be booked for a date or time that has already passed."
          : "لا يمكن حجز موعد في تاريخ أو توقيت مضى.",
        action: isEn
          ? "Please pick an upcoming date and time from the clinic schedule."
          : "يرجى اختيار تاريخ ووقت مستقبلي من جدول العيادة.",
        field: "appointment_date",
        ref: "appointment/past-date",
        severity: "error"
      };
    }

    if (code.includes("doctor-unavailable")) {
      return {
        icon: "👨‍⚕️",
        category: isEn ? "Appointments" : "حجز المواعيد",
        title: isEn ? "Doctor Unavailable" : "الطبيب غير متاح في هذا التوقيت",
        message: isEn
          ? "The physician is off-duty, in surgery, or attending a medical conference during this window."
          : "الطبيب في إجازة رسمية، في غرفة العمليات، أو مشارك في مؤتمر طبي في هذا التوقيت.",
        action: isEn
          ? "Please check alternative dates or book with another accredited specialist in the clinic."
          : "يرجى اختيار يوم عمل بديل أو حجز استشارة مع طبيب معتمد آخر في نفس التخصص.",
        field: "doctor_id",
        ref: "appointment/doctor-unavailable",
        severity: "warning"
      };
    }

    // -------------------------------------------------------------
    // 4. Medical Attachments & File Uploads (Vezeeta Standard)
    // -------------------------------------------------------------
    if (code.includes("too-large") || code.includes("file-size") || code.includes("payload-too-large")) {
      return {
        icon: "📎",
        category: isEn ? "Medical Attachments" : "الملفات الطبية",
        title: isEn ? "Attachment Exceeds 10 MB" : "حجم الملف يتجاوز الحد المسموح",
        message: isEn
          ? "The selected medical report or scan exceeds the maximum allowed upload limit of 10 MB."
          : "حجم التقرير أو الأشعة المرفقة يتجاوز الحد الأقصى المسموح به (10 ميجابايت).",
        action: isEn
          ? "Please compress your PDF or choose a medium-resolution photo of the document."
          : "يرجى ضغط ملف الـ PDF أو تصوير التقرير بجودة مناسبة دون تجاوز 10 ميجابايت.",
        field: "medical_file",
        ref: "file/too-large",
        severity: "error"
      };
    }

    if (code.includes("unsupported-format") || code.includes("invalid-mime") || code.includes("unsupported-file")) {
      return {
        icon: "📄",
        category: isEn ? "Medical Attachments" : "الملفات الطبية",
        title: isEn ? "Unsupported File Format" : "صيغة الملف غير مدعومة",
        message: isEn
          ? "The selected file format is not supported for patient medical records."
          : "صيغة الملف المحدد غير مقبولة في السجل الطبي الإلكتروني.",
        action: isEn
          ? "Please upload documents in PDF format, or images in JPG, PNG, or WEBP format."
          : "يرجى رفع الملفات بصيغة PDF أو صور بصيغة JPG أو PNG أو WEBP فقط.",
        field: "medical_file",
        ref: "file/unsupported-format",
        severity: "error"
      };
    }

    // -------------------------------------------------------------
    // 5. Authentication & Account Credentials
    // -------------------------------------------------------------
    if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
      return {
        icon: "🔒",
        category: isEn ? "Authentication" : "تسجيل الدخول",
        title: isEn ? "Incorrect Login Credentials" : "بيانات تسجيل الدخول غير صحيحة",
        message: isEn
          ? "The email address or password entered does not match our verified records. Please check your credentials."
          : "البريد الإلكتروني أو كلمة المرور غير مطابقة لسجلاتنا. يرجى التحقق من صحة البيانات والمحاولة ثانية.",
        action: isEn
          ? "Check for typos in your email and password, or use 'Forgot Password?' to restore access."
          : "تأكد من كتابة البريد وكلمة المرور بدقة، أو اضغط على 'نسيت كلمة المرور؟' لاستعادة الحساب.",
        field: "password",
        ref: code || "auth/invalid-credential",
        severity: "error"
      };
    }

    if (code.includes("invalid-email")) {
      return {
        icon: "📧",
        category: isEn ? "Validation" : "صحة البيانات",
        title: isEn ? "Invalid Email Format" : "صيغة البريد غير صحيحة",
        message: isEn
          ? "Please enter a valid email address (e.g. user@example.com)."
          : "يرجى كتابة عنوان بريد إلكتروني صحيح ومكتمل (مثال: user@example.com).",
        action: isEn
          ? "Verify there are no extra spaces or missing symbols in the email field."
          : "تأكد من عدم وجود مسافات إضافية وكتابة الرمز @ واسم النطاق بشكل صحيح.",
        field: "email",
        ref: code || "auth/invalid-email",
        severity: "error"
      };
    }

    if (code.includes("email-already-in-use")) {
      return {
        icon: "📧",
        category: isEn ? "Registration" : "إنشاء حساب",
        title: isEn ? "Email Already Registered" : "البريد مسجل بالفعل",
        message: isEn
          ? "An existing Health Vibe account is already associated with this email address."
          : "يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني في النظام.",
        action: isEn
          ? "Please switch to 'Sign In' or recover your password if you forgot it."
          : "يرجى التبديل إلى 'تسجيل الدخول' أو استعادة كلمة المرور إذا كنت قد نسيتها.",
        field: "email",
        ref: code || "auth/email-already-in-use",
        severity: "warning"
      };
    }

    if (code.includes("credential-already-in-use")) {
      return {
        icon: "⚠️",
        category: isEn ? "Account Conflict" : "تعارض في الحساب",
        title: isEn ? "Sign-In Method Already Linked" : "وسيلة الدخول مرتبطة بحساب آخر",
        message: isEn
          ? "This credential is already connected to another Health Vibes profile. Medical records cannot be merged automatically."
          : "وسيلة تسجيل الدخول هذه مرتبطة بالفعل بملف مستخدم آخر. لحماية خصوصية وسجلات المرضى، لا يمكن دمج الحسابات تلقائياً.",
        action: isEn
          ? "Sign in using that method directly, or verify ownership of both accounts."
          : "يرجى تسجيل الدخول بتلك الوسيلة مباشرة، أو إثبات ملكية الحسابين للتنسيق.",
        field: null,
        ref: code || "auth/credential-already-in-use",
        severity: "warning"
      };
    }

    if (code.includes("account-exists-with-different-credential")) {
      return {
        icon: "⚠️",
        category: isEn ? "Account Conflict" : "تعارض في الحساب",
        title: isEn ? "Account Exists with Password" : "الحساب مسجل مسبقاً بكلمة مرور",
        message: isEn
          ? "An account with this email address already exists using a password. Please sign in with your email and password first, then link Google from your Profile settings."
          : "يوجد حساب مسجل بهذا البريد مسبقاً بكلمة المرور. يرجى تسجيل الدخول بالبريد وكلمة المرور أولاً، ثم ربط حساب Google من إعدادات الملف الشخصي.",
        action: isEn
          ? "Enter your password to sign in and prove account ownership."
          : "أدخل كلمة المرور لتسجيل الدخول وإثبات ملكية الحساب.",
        field: "password",
        ref: code || "auth/account-exists-with-different-credential",
        severity: "warning"
      };
    }

    if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
      return {
        icon: "ℹ️",
        category: isEn ? "Authentication" : "المصادقة",
        title: isEn ? "Sign-In Canceled" : "تم إلغاء تسجيل الدخول",
        message: isEn
          ? "The authentication popup was closed before completing the process."
          : "تم إغلاق نافذة المصادقة قبل اكتمال العملية.",
        action: isEn
          ? "You can try again whenever you are ready."
          : "يمكنك المحاولة مجدداً في أي وقت.",
        field: null,
        ref: code || "auth/popup-closed-by-user",
        severity: "info"
      };
    }

    if (code.includes("weak-password")) {
      return {
        icon: "🛡️",
        category: isEn ? "Security" : "أمان الحساب",
        title: isEn ? "Password Too Weak" : "كلمة المرور قصيرة أو ضعيفة",
        message: isEn
          ? "For patient clinical data privacy, passwords must contain at least 8 characters with both letters and numbers."
          : "لحماية خصوصية وسجلاتك الطبية، يجب ألا تقل كلمة المرور عن 8 خانات وتحتوي على أحرف وأرقام معاً.",
        action: isEn
          ? "Please choose a stronger password combining letters and numbers."
          : "يرجى اختيار كلمة مرور قوية تجمع بين الحروف والأرقام لضمان أمان ملفك الطبي.",
        field: "password",
        ref: code || "auth/weak-password",
        severity: "error"
      };
    }

    if (code.includes("too-many-requests")) {
      return {
        icon: "⏳",
        category: isEn ? "Rate Limit" : "أمان النظام",
        title: isEn ? "Too Many Attempts" : "محاولات متكررة غير صحيحة",
        message: isEn
          ? "Access has been temporarily paused due to multiple consecutive incorrect attempts."
          : "تم تعليق المحاولات مؤقتاً لحماية الحساب بعد تكرار إدخال بيانات غير صحيحة.",
        action: isEn
          ? "Please wait 1-2 minutes before attempting to sign in again."
          : "يرجى الانتظار لمدة دقيقة أو دقيقتين ثم إعادة المحاولة.",
        field: null,
        ref: code || "auth/too-many-requests",
        severity: "warning"
      };
    }

    if (code.includes("requires-recent-login")) {
      return {
        icon: "🔐",
        category: isEn ? "Security Check" : "تأكيد الهوية",
        title: isEn ? "Re-Authentication Required" : "مطلوب تأكيد كلمة المرور",
        message: isEn
          ? "This sensitive operation requires confirming your password to ensure account ownership."
          : "هذا الإجراء الحساس يتطلب تأكيد كلمة المرور الحالية للتأكد من هوية صاحب الحساب.",
        action: isEn
          ? "Please enter your password in the prompt to proceed."
          : "يرجى كتابة كلمة المرور الحالية لتأكيد الإجراء بأمان.",
        field: "password",
        ref: code || "auth/requires-recent-login",
        severity: "info"
      };
    }

    if (code.includes("user-disabled")) {
      return {
        icon: "🛑",
        category: isEn ? "Account Status" : "حالة الحساب",
        title: isEn ? "Account Suspended" : "الحساب موقوف",
        message: isEn
          ? "This account has been disabled by platform administration."
          : "تم تعطيل هذا الحساب بواسطة إدارة المنصة لمراجعة أمنية أو إدارية.",
        action: isEn
          ? "Please contact support if you believe this is in error."
          : "يرجى التواصل مع الدعم الفني للاستفسار والمراجعة.",
        field: null,
        ref: code || "auth/user-disabled",
        severity: "error"
      };
    }

    // -------------------------------------------------------------
    // 6. Network, Connectivity & Cloud Infrastructure
    // -------------------------------------------------------------
    if (isNetworkError(err) || code.includes("network") || code.includes("unavailable") || code.includes("deadline-exceeded") || code.includes("fetch")) {
      return {
        icon: "📡",
        category: isEn ? "Connectivity" : "الاتصال والشبكة",
        title: isEn ? "Connection Unavailable" : "تعذر الاتصال بالخادم",
        message: isEn
          ? "Could not establish a stable connection with the medical cloud service. Your local records are secure."
          : "تعذر الوصول إلى خوادم السحابة الطبية حالياً. بياناتك المسجلة بأمان.",
        action: isEn
          ? "Please check your internet or Wi-Fi connection and tap 'Retry'."
          : "يرجى التأكد من اتصالك بالإنترنت (واي فاي أو باقة الهاتف) والضغط على 'إعادة المحاولة'.",
        field: null,
        ref: code || "network/offline",
        severity: "warning"
      };
    }

    if (code.includes("permission-denied") || code.includes("insufficient-permission")) {
      return {
        icon: "🛡️",
        category: isEn ? "Access Control" : "صلاحيات الوصول",
        title: isEn ? "Access Restricted" : "إجراء غير مصرح به",
        message: isEn
          ? "You do not have the required medical or administrative permissions for this operation."
          : "لا تملك الصلاحيات الطبية أو الإدارية الكافية لإتمام هذا الإجراء (امتثالاً لسياسة الخصوصية والأمان).",
        action: isEn
          ? "If you are an attending doctor, verify that your syndicate license is approved."
          : "إذا كنت طبيباً، تأكد من اعتماد ترخيصك وتكليفك بالحالة من إدارة المنصة.",
        field: null,
        ref: code || "firestore/permission-denied",
        severity: "error"
      };
    }

    if (code.includes("resource-exhausted") || code.includes("quota")) {
      return {
        icon: "⚡",
        category: isEn ? "System Load" : "ضغط الخدمة",
        title: isEn ? "Server High Volume" : "الخادم قيد ضغط مؤقت",
        message: isEn
          ? "The medical service is currently experiencing high clinical request traffic."
          : "الخدمة الطبية تشهد ضغطاً مؤقتاً في معالجة الطلبات السريرية.",
        action: isEn
          ? "Please wait a moment and submit your request again."
          : "يرجى الانتظار بضع لحظات والمحاولة مجدداً.",
        field: null,
        ref: code || "system/quota-exhausted",
        severity: "warning"
      };
    }

    // -------------------------------------------------------------
    // 7. General Fallback: Never display raw technical dumps to users
    // -------------------------------------------------------------
    return {
      icon: "⚠️",
      category: isEn ? "System Notice" : "تنبيه بالنظام",
      title: isEn ? "Operation Could Not Be Completed" : "تعذر استكمال العملية",
      message: isEn
        ? "An unexpected issue occurred while processing your request. Please rest assured your saved medical records remain safe."
        : "حدث أمر غير متوقع أثناء معالجة طلبك. نؤكد لك أن سجلاتك الطبية المحفوظة بأمان تام ولم تفقد.",
      action: isEn
        ? "Please try again in a few moments, or contact clinical support if this persists."
        : "يرجى المحاولة بعد لحظات، أو التواصل مع الدعم الفني إذا استمرت المشكلة.",
      field: null,
      ref: code || (rawMessage ? `MSG-${rawMessage.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}` : "ERR-GENERAL"),
      severity: "error"
    };
  }

  // =========================================================================
  // FriendlyErrorGuide Component Engine (UI & Accessible Field Feedback)
  // =========================================================================

  /**
   * Helper to resolve element from selector or element reference.
   * @param {string|HTMLElement} target
   * @returns {HTMLElement|null}
   */
  function resolveElement(target) {
    if (!target) return null;
    if (typeof target === "string") {
      if (typeof document !== "undefined") {
        return document.querySelector(target);
      }
      return null;
    }
    return target;
  }

  /**
   * Renders an accessible, responsive error card inside a container (Vezeeta standard).
   * @param {string|HTMLElement} container
   * @param {*} err
   * @param {object} [options={}]
   * @returns {HTMLElement|null}
   */
  function renderNotice(container, err, options = {}) {
    const el = resolveElement(container);
    if (!el || typeof document === "undefined") return null;

    const isEn = options.isEn !== undefined
      ? options.isEn
      : (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en");

    const friendly = toFriendlyAppError(err, options.context, isEn);

    const card = document.createElement("div");
    card.className = `friendly-error-card ${options.className || ""} severity-${friendly.severity}`;
    card.setAttribute("role", "alert");
    card.setAttribute("aria-live", "polite");

    const badgeClass = friendly.severity === "warning" ? "pill warning" : "pill danger";

    card.innerHTML = `
      <div class="friendly-error-header">
        <div class="friendly-error-icon" aria-hidden="true">${friendly.icon}</div>
        <div class="friendly-error-title-wrap">
          <div class="friendly-error-meta">
            <span class="${badgeClass}">${friendly.category}</span>
          </div>
          <h4 class="friendly-error-title">${friendly.title}</h4>
        </div>
        ${options.dismissible !== false ? `
          <button type="button" class="friendly-close-btn" aria-label="${isEn ? "Close" : "إغلاق"}">&times;</button>
        ` : ""}
      </div>
      <div class="friendly-error-message">${friendly.message}</div>
      <div class="friendly-error-guidance">
        <span class="guidance-bulb" aria-hidden="true">💡</span>
        <div class="guidance-content">
          <strong>${isEn ? "How to fix:" : "كيفية التصحيح:"}</strong>
          <span>${friendly.action}</span>
        </div>
      </div>
      ${options.onRetry || options.primaryAction ? `
        <div class="friendly-error-actions">
          ${options.onRetry ? `
            <button type="button" class="solid-button friendly-retry-btn">
              ${options.retryLabel || (isEn ? "Retry" : "إعادة المحاولة")}
            </button>
          ` : ""}
          ${options.primaryAction ? `
            <button type="button" class="outline-button friendly-primary-action-btn">
              ${options.primaryAction.label}
            </button>
          ` : ""}
        </div>
      ` : ""}
      <div class="friendly-error-ref">REF: ${friendly.ref}</div>
    `;

    // Wire retry button
    if (options.onRetry) {
      const retryBtn = card.querySelector(".friendly-retry-btn");
      if (retryBtn) {
        retryBtn.addEventListener("click", () => {
          options.onRetry(card);
        });
      }
    }

    // Wire custom primary action
    if (options.primaryAction && typeof options.primaryAction.onClick === "function") {
      const actBtn = card.querySelector(".friendly-primary-action-btn");
      if (actBtn) {
        actBtn.addEventListener("click", () => {
          options.primaryAction.onClick(card);
        });
      }
    }

    // Wire close button
    const closeBtn = card.querySelector(".friendly-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (typeof options.onClose === "function") {
          options.onClose(card);
        }
        card.remove();
      });
    }

    if (options.replace) {
      el.innerHTML = "";
    }
    el.appendChild(card);
    return card;
  }

  /**
   * Renders inline field feedback directly below a form input control.
   * Sets aria-invalid and aria-describedby for accessibility.
   * @param {string|HTMLElement} inputOrSelector
   * @param {*} errOrKey
   * @param {object} [options={}]
   * @returns {HTMLElement|null}
   */
  function renderFieldFeedback(inputOrSelector, errOrKey, options = {}) {
    const input = resolveElement(inputOrSelector);
    if (!input || typeof document === "undefined") return null;

    const isEn = options.isEn !== undefined
      ? options.isEn
      : (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en");

    const friendly = toFriendlyAppError(errOrKey, options.context, isEn);

    // Apply error highlight styling to input element
    input.classList.add("input-has-error");
    input.setAttribute("aria-invalid", "true");

    const fieldId = input.id || `field_${Math.random().toString(36).slice(2, 8)}`;
    if (!input.id) input.id = fieldId;
    const errorElemId = `err_desc_${fieldId}`;

    input.setAttribute("aria-describedby", errorElemId);

    // Look for existing container or create one
    let errorElem = document.getElementById(errorElemId);
    if (!errorElem) {
      errorElem = document.createElement("div");
      errorElem.id = errorElemId;
      errorElem.className = "friendly-field-error";
      errorElem.setAttribute("role", "alert");
      errorElem.setAttribute("aria-live", "polite");

      // Insert immediately after input (or input wrapper if wrapped in parent)
      const parent = input.closest(".input-group, .form-group, .field-wrapper") || input.parentElement;
      if (parent && parent !== input.parentElement) {
        parent.appendChild(errorElem);
      } else {
        input.insertAdjacentElement("afterend", errorElem);
      }
    }

    errorElem.innerHTML = `
      <span class="field-error-icon" aria-hidden="true">${friendly.icon}</span>
      <div class="field-error-body">
        <span class="field-error-title">${friendly.title}:</span>
        <span class="field-error-msg">${friendly.message}</span>
        <small class="friendly-field-guide">💡 ${friendly.action}</small>
      </div>
    `;
    errorElem.style.display = "flex";

    return errorElem;
  }

  /**
   * Clears inline field feedback and restores valid state on an input control.
   * @param {string|HTMLElement} inputOrSelector
   */
  function clearFieldFeedback(inputOrSelector) {
    const input = resolveElement(inputOrSelector);
    if (!input || typeof document === "undefined") return;

    input.classList.remove("input-has-error");
    input.setAttribute("aria-invalid", "false");

    if (input.id) {
      const errorElemId = `err_desc_${input.id}`;
      const errorElem = document.getElementById(errorElemId);
      if (errorElem) {
        errorElem.remove();
      }
    }

    const currentDescribedBy = input.getAttribute("aria-describedby") || "";
    if (currentDescribedBy.includes("err_desc_")) {
      const updated = currentDescribedBy.split(/\s+/).filter(id => !id.startsWith("err_desc_")).join(" ");
      if (updated) {
        input.setAttribute("aria-describedby", updated);
      } else {
        input.removeAttribute("aria-describedby");
      }
    }
  }

  /**
   * Normalizes Arabic-Indic digits to Western digits (0-9).
   * @param {string|number} value
   * @returns {string}
   */
  function normalizeDigits(value) {
    return String(value ?? "")
      .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0));
  }

  /**
   * Validates a field value against standard clinical & patient schemas (Vezeeta benchmark).
   * Automatically renders field feedback if invalid, or clears feedback if valid.
   * @param {string|HTMLElement} inputOrSelector
   * @param {string} type - "phone"|"national_id"|"email"|"password"|"spo2"|"temperature"|"heart_rate"|"respiratory_rate"|"symptom_duration"|"required"
   * @param {object} [options={}]
   * @returns {{ valid: boolean, error: object|null }}
   */
  function validateField(inputOrSelector, type, options = {}) {
    const input = resolveElement(inputOrSelector);
    if (!input) return { valid: false, error: null };

    const rawVal = input.value !== undefined ? input.value : "";
    const clean = normalizeDigits(rawVal).trim();
    const isEn = options.isEn !== undefined
      ? options.isEn
      : (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en");

    let errorCode = null;

    switch (type) {
      case "required":
        if (!clean) errorCode = "validation/required-field";
        break;

      case "phone":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          // Egyptian mobile: 11 digits starting with 010, 011, 012, or 015
          const compact = clean.replace(/[\s\-()]/g, "");
          const isEg = /^(?:\+?20|0)?1[0125]\d{8}$/.test(compact);
          const isIntl = /^\+?[0-9]{8,15}$/.test(compact);
          if (!isEg && !isIntl) {
            errorCode = "validation/phone-invalid";
          }
        }
        break;

      case "national_id":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          // 14 digits starting with 2 or 3
          if (!/^[23]\d{13}$/.test(clean)) {
            errorCode = "validation/national-id-invalid";
          }
        }
        break;

      case "email":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const emailRe = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
          if (!emailRe.test(clean)) {
            errorCode = "auth/invalid-email";
          }
        }
        break;

      case "password":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else if (clean.length < 8 || !/[a-zA-Z]/.test(clean) || !/[0-9]/.test(clean)) {
          errorCode = "auth/weak-password";
        }
        break;

      case "spo2":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const parsed = parseInt(clean.replace(/%/g, ""), 10);
          if (isNaN(parsed) || parsed < 50 || parsed > 100) {
            errorCode = "clinical/spo2-out-of-range";
          }
        }
        break;

      case "temperature":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const parsed = parseFloat(clean.replace(/°/g, "").replace(/c$/i, "").replace(",", "."));
          if (isNaN(parsed) || parsed < 34.0 || parsed > 43.0) {
            errorCode = "clinical/temperature-out-of-range";
          }
        }
        break;

      case "heart_rate":
      case "pulse":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const parsed = parseInt(clean, 10);
          if (isNaN(parsed) || parsed < 30 || parsed > 250) {
            errorCode = "clinical/heart-rate-out-of-range";
          }
        }
        break;

      case "respiratory_rate":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const parsed = parseInt(clean, 10);
          if (isNaN(parsed) || parsed < 5 || parsed > 60) {
            errorCode = "clinical/respiratory-rate-out-of-range";
          }
        }
        break;

      case "symptom_duration":
        if (!clean) {
          if (options.required !== false) errorCode = "validation/required-field";
        } else {
          const parsed = parseInt(clean, 10);
          if (isNaN(parsed) || parsed < 1 || parsed > 365) {
            errorCode = "clinical/duration-out-of-range";
          }
        }
        break;

      default:
        if (options.required && !clean) {
          errorCode = "validation/required-field";
        }
        break;
    }

    if (errorCode) {
      const errObj = renderFieldFeedback(input, errorCode, { isEn, ...options });
      return { valid: false, error: toFriendlyAppError(errorCode, "", isEn) };
    } else {
      clearFieldFeedback(input);
      return { valid: true, error: null };
    }
  }

  /**
   * Binds live validation to form fields for real-time patient assistance (Vezeeta experience).
   * @param {string|HTMLElement} formOrSelector
   * @param {Object.<string, string|object>} schema - Key: selector, Value: type string or options object
   * @param {object} [globalOptions={}]
   */
  function bindLiveValidation(formOrSelector, schema = {}, globalOptions = {}) {
    const form = resolveElement(formOrSelector);
    if (!form || typeof form.querySelectorAll !== "function") return;

    Object.keys(schema).forEach(selector => {
      const input = form.querySelector(selector);
      if (!input) return;

      const rule = schema[selector];
      const type = typeof rule === "string" ? rule : rule.type;
      const opts = typeof rule === "object" ? { ...globalOptions, ...rule } : globalOptions;

      // Blur validation (immediate feedback when leaving field)
      input.addEventListener("blur", () => {
        validateField(input, type, opts);
      });

      // Input debounce validation (clears error as user types valid input)
      let timer = null;
      input.addEventListener("input", () => {
        if (input.classList.contains("input-has-error")) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            validateField(input, type, opts);
          }, 300);
        }
      });
    });
  }

  const FriendlyErrorGuide = {
    toFriendlyAppError,
    renderNotice,
    renderFieldFeedback,
    clearFieldFeedback,
    validateField,
    bindLiveValidation
  };

  const ErrorHandler = {
    redactClientPii,
    categorizeClientError,
    isNetworkError,
    toFriendlyAppError,
    FriendlyErrorGuide
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ErrorHandler = ErrorHandler;
  global.HealthVibes.FriendlyErrorGuide = FriendlyErrorGuide;
  global.FriendlyErrorGuide = FriendlyErrorGuide;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ErrorHandler,
      FriendlyErrorGuide,
      toFriendlyAppError,
      redactClientPii,
      categorizeClientError,
      isNetworkError
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
