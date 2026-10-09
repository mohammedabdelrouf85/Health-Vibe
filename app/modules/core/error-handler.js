/**
 * Health Vibe AI - Core Error Handling Module
 * 
 * Centralizes error categorization, PII redaction, human-friendly bilingual
 * error transformation, and diagnostics without DOM dependencies.
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
   * @returns {"ai_service"|"notification"|"auth"|"firebase"|"api"|"javascript"}
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
      str.includes("deadline-exceeded");
  }

  /**
   * Transforms raw technical errors / Firebase errors into user-friendly bilingual messages.
   * Prevents raw technical stack traces from leaking to patients.
   * @param {Error|string|object} err
   * @param {string} [context=""]
   * @param {boolean} [isEn=false]
   * @returns {{ icon: string, category: string, title: string, message: string, action: string, ref: string }}
   */
  function toFriendlyAppError(err, context = "", isEn = false) {
    let code = "";
    let rawMessage = "";

    if (typeof err === "string") {
      rawMessage = err;
      if (err.startsWith("auth/") || err.startsWith("firestore/")) {
        code = err;
      }
    } else if (err && typeof err === "object") {
      code = String(err.code || "").toLowerCase();
      rawMessage = String(err.message || "");
    }

    if (!code && rawMessage) {
      if (rawMessage.includes("permission-denied") || rawMessage.includes("insufficient permissions")) {
        code = "permission-denied";
      } else if (rawMessage.includes("network") || rawMessage.includes("Failed to fetch") || rawMessage.includes("offline")) {
        code = "network-error";
      } else if (rawMessage.includes("quota") || rawMessage.includes("resource-exhausted")) {
        code = "resource-exhausted";
      } else if (rawMessage.includes("user-not-found") || rawMessage.includes("wrong-password") || rawMessage.includes("invalid-credential")) {
        code = "auth/invalid-credential";
      }
    }

    // 1. Authentication Credentials
    if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
      return {
        icon: "🔒",
        category: isEn ? "Authentication" : "تسجيل الدخول",
        title: isEn ? "Incorrect Login Credentials" : "بيانات تسجيل الدخول غير صحيحة",
        message: isEn
          ? "The email address or password entered does not match our verified records. Please check your credentials."
          : "البريد الإلكتروني أو كلمة المرور غير مطابقة لسجلاتنا. يرجى التحقق من صحة البيانات والمحاولة ثانية.",
        action: isEn ? "Check for typos in your email and password, or use 'Forgot Password?' to restore access." : "تأكد من كتابة البريد وكلمة المرور بدقة، أو اضغط على 'نسيت كلمة المرور؟' لاستعادة الحساب.",
        ref: code || "auth/invalid-credential"
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
        action: isEn ? "Verify there are no extra spaces or missing symbols in the email field." : "تأكد من عدم وجود مسافات إضافية وكتابة الرمز @ واسم النطاق بشكل صحيح.",
        ref: code || "auth/invalid-email"
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
        action: isEn ? "Please switch to 'Sign In' or recover your password if you forgot it." : "يرجى التبديل إلى 'تسجيل الدخول' أو استعادة كلمة المرور إذا كنت قد نسيتها.",
        ref: code || "auth/email-already-in-use"
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
        action: isEn ? "Sign in using that method directly, or verify ownership of both accounts." : "يرجى تسجيل الدخول بتلك الوسيلة مباشرة، أو إثبات ملكية الحسابين للتنسيق.",
        ref: code || "auth/credential-already-in-use"
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
        action: isEn ? "Enter your password to sign in and prove account ownership." : "أدخل كلمة المرور لتسجيل الدخول وإثبات ملكية الحساب.",
        ref: code || "auth/account-exists-with-different-credential"
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
        action: isEn ? "You can try again whenever you are ready." : "يمكنك المحاولة مجدداً في أي وقت.",
        ref: code || "auth/popup-closed-by-user"
      };
    }

    if (code.includes("weak-password")) {
      return {
        icon: "🛡️",
        category: isEn ? "Security" : "أمان الحساب",
        title: isEn ? "Password Too Weak" : "كلمة المرور قصيرة جداً",
        message: isEn
          ? "For patient clinical data privacy, passwords must contain at least 6 characters."
          : "لحماية خصوصية وسجلاتك الطبية، يجب أن تتكون كلمة المرور من 6 خانات على الأقل.",
        action: isEn ? "Please enter a stronger password combining letters and numbers." : "يرجى اختيار كلمة مرور أطول تحتوي على أحرف وأرقام.",
        ref: code || "auth/weak-password"
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
        action: isEn ? "Please wait 1-2 minutes before attempting to sign in again." : "يرجى الانتظار لمدة دقيقة أو دقيقتين ثم إعادة المحاولة.",
        ref: code || "auth/too-many-requests"
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
        action: isEn ? "Please enter your password in the prompt to proceed." : "يرجى كتابة كلمة المرور الحالية لتأكيد الإجراء بأمان.",
        ref: code || "auth/requires-recent-login"
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
        action: isEn ? "Please contact support if you believe this is in error." : "يرجى التواصل مع الدعم الفني للاستفسار والمراجعة.",
        ref: code || "auth/user-disabled"
      };
    }

    if (code.includes("network") || code.includes("unavailable") || code.includes("deadline-exceeded") || code.includes("fetch")) {
      return {
        icon: "📡",
        category: isEn ? "Connectivity" : "الاتصال والشبكة",
        title: isEn ? "Connection Unavailable" : "تعذر الاتصال بالخادم",
        message: isEn
          ? "Could not establish a stable connection with the medical cloud service. Your local records are secure."
          : "تعذر الوصول إلى خوادم السحابة الطبية حالياً. بياناتك المسجلة بأمان.",
        action: isEn ? "Please check your internet or Wi-Fi connection and try again." : "يرجى التأكد من اتصالك بالإنترنت (واي فاي أو باقة الهاتف) وإعادة المحاولة.",
        ref: code || "network/offline"
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
        action: isEn ? "If you are an attending doctor, verify that your syndicate license is approved." : "إذا كنت طبيباً، تأكد من اعتماد ترخيصك وتكليفك بالحالة من إدارة المنصة.",
        ref: code || "firestore/permission-denied"
      };
    }

    if (code.includes("resource-exhausted") || code.includes("quota")) {
      return {
        icon: "⚡",
        category: isEn ? "System Load" : "ضغط الخدمة",
        title: isEn ? "Server High Volume" : "الخادم قيد ضغط مؤقت",
        message: isEn
          ? "The system is currently experiencing high request traffic."
          : "الخدمة الطبية تشهد ضغطاً مؤقتاً في معالجة الطلبات السريرية.",
        action: isEn ? "Please wait a moment and submit your request again." : "يرجى الانتظار بضع لحظات والمحاولة مجدداً.",
        ref: code || "system/quota-exhausted"
      };
    }

    // Fallback: Never display raw technical error dumps to users
    return {
      icon: "⚠️",
      category: isEn ? "System Notice" : "تنبيه بالنظام",
      title: isEn ? "Operation Could Not Be Completed" : "تعذر استكمال العملية",
      message: isEn
        ? "An unexpected issue occurred while processing your request. Please rest assured your saved medical records remain safe."
        : "حدث أمر غير متوقع أثناء معالجة طلبك. نؤكد لك أن سجلاتك الطبية المحفوظة بأمان تام.",
      action: isEn ? "Please try again in a few moments, or contact support if this recurs." : "يرجى المحاولة بعد لحظات، أو التواصل مع الدعم الفني إذا استمرت المشكلة.",
      ref: code || (rawMessage ? `MSG-${rawMessage.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}` : "ERR-GENERAL")
    };
  }

  const ErrorHandler = {
    redactClientPii,
    categorizeClientError,
    isNetworkError,
    toFriendlyAppError
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.ErrorHandler = ErrorHandler;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ErrorHandler;
  }
})(typeof window !== "undefined" ? window : globalThis);
