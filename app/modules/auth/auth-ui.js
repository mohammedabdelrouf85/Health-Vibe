/**
 * Health Vibe AI - Auth UI Module
 * 
 * Manages Auth dialog views, tabs, input bindings, loading spinners,
 * and interface rendering.
 */

(function (global) {
  "use strict";

  let currentAuthMode = "signin";

  function setAuthMode(mode) {
    currentAuthMode = mode;
    const isSignUp = mode === "signup";
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    const nameGroup = document.getElementById("authNameGroup");
    const title = document.getElementById("authModalTitle");
    const sub = document.getElementById("authModalSub");
    const submitBtn = document.getElementById("authSubmitText");
    const togglePrompt = document.getElementById("authTogglePrompt");
    const toggleBtn = document.getElementById("authToggleBtn");
    const forgotContainer = document.getElementById("authForgotPasswordContainer");

    if (nameGroup) nameGroup.style.display = isSignUp ? "block" : "none";
    if (forgotContainer) forgotContainer.style.display = isSignUp ? "none" : "block";

    if (title) {
      title.textContent = isSignUp
        ? (isEn ? "Create Patient Account" : "إنشاء حساب مريض جديد")
        : (isEn ? "Sign in to Health Vibes" : "تسجيل الدخول إلى المنصة");
    }

    if (sub) {
      sub.textContent = isSignUp
        ? (isEn ? "Register to track your respiratory health and consult certified doctors." : "سجّل بياناتك لمتابعة صحتك التنفسية واستشارة الأطباء المعتمدين.")
        : (isEn ? "Enter your email and password to access your medical records." : "أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى ملفك وسجلاتك.");
    }

    if (submitBtn) {
      submitBtn.textContent = isSignUp
        ? (isEn ? "Create Account" : "إنشاء حساب")
        : (isEn ? "Sign In" : "تسجيل الدخول");
    }

    if (togglePrompt) {
      togglePrompt.textContent = isSignUp
        ? (isEn ? "Already have an account?" : "لديك حساب بالفعل؟")
        : (isEn ? "Don't have an account?" : "ليس لديك حساب؟");
    }

    if (toggleBtn) {
      toggleBtn.textContent = isSignUp
        ? (isEn ? "Sign In" : "تسجيل الدخول")
        : (isEn ? "Create Account" : "إنشاء حساب جديد");
    }
  }

  function showAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function setAuthLoading(loading) {
    const submitBtn = document.getElementById("authSubmitBtn");
    const submitText = document.getElementById("authSubmitText");
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    if (submitBtn) submitBtn.disabled = Boolean(loading);
    if (submitText) {
      if (loading) {
        submitText.textContent = isEn ? "Please wait..." : "يرجى الانتظار...";
      } else {
        submitText.textContent = currentAuthMode === "signup"
          ? (isEn ? "Create Account" : "إنشاء حساب")
          : (isEn ? "Sign In" : "تسجيل الدخول");
      }
    }
  }

  const AuthUI = {
    getMode: () => currentAuthMode,
    setAuthMode,
    showAuthModal,
    closeAuthModal,
    setAuthLoading
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AuthUI = AuthUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AuthUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
