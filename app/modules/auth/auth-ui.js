/**
 * Health Vibe AI - Auth UI Module
 * 
 * Manages Auth dialog views, tabs, input bindings, loading spinners,
 * and interface rendering, including provider linking and conflict resolution.
 */

(function (global) {
  "use strict";

  let currentAuthMode = "signin";
  let activeReauthCallback = null;

  function setAuthMode(mode) {
    currentAuthMode = mode;
    const isSignUp = mode === "signup";
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    const nameGroup = document.getElementById("authNameGroup");
    const roleGroup = document.getElementById("authRoleGroup");
    const consentGroup = document.getElementById("authConsentGroup");
    const title = document.getElementById("authModalTitle");
    const sub = document.getElementById("authModalSub");
    const submitBtn = document.getElementById("authSubmitText");
    const togglePrompt = document.getElementById("authTogglePrompt");
    const toggleBtn = document.getElementById("authToggleBtn");
    const forgotContainer = document.getElementById("authForgotPasswordContainer");
    const passwordRules = document.getElementById("authPasswordRules");

    if (nameGroup) nameGroup.style.display = isSignUp ? "block" : "none";
    if (roleGroup) roleGroup.style.display = isSignUp ? "block" : "none";
    if (consentGroup) consentGroup.style.display = isSignUp ? "block" : "none";
    if (passwordRules) passwordRules.style.display = isSignUp ? "block" : "none";
    if (forgotContainer) forgotContainer.style.display = isSignUp ? "none" : "block";

    if (title) {
      title.textContent = isSignUp
        ? (isEn ? "Create Your Account" : "إنشاء حساب جديد")
        : (isEn ? "Sign in to Health Vibe AI" : "تسجيل الدخول إلى المنصة");
    }

    if (sub) {
      sub.textContent = isSignUp
        ? (isEn ? "Register as a patient, doctor, or medical clinic to access your clinical portal." : "سجّل كـ مريض، طبيب، أو عيادة طبية للوصول إلى بوابتك السريرية المخصصة.")
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
    const isSignUp = currentAuthMode === "signup";
    const isLoading = Boolean(loading);

    if (submitBtn) {
      submitBtn.disabled = isLoading;
      if (isLoading) {
        submitBtn.setAttribute("aria-busy", "true");
      } else {
        submitBtn.removeAttribute("aria-busy");
      }
    }

    if (submitText) {
      if (isLoading) {
        submitText.textContent = isEn ? "Please wait..." : "يرجى الانتظار...";
      } else {
        submitText.textContent = isSignUp
          ? (isEn ? "Create Account" : "إنشاء حساب")
          : (isEn ? "Sign In" : "تسجيل الدخول");
      }
    }

    // Disable / re-enable all input controls and action buttons
    const inputIds = [
      "authEmail",
      "authPassword",
      "authName",
      "authRole",
      "authMedicalConsentChk",
      "rememberMe",
      "googleLogin",
      "authTabSignIn",
      "authTabSignUp",
      "forgotPasswordBtn"
    ];
    inputIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = isLoading;
    });

    const form = document.getElementById("authEmailForm");
    if (form) {
      form.querySelectorAll("input, button, select, textarea").forEach((ctrl) => {
        ctrl.disabled = isLoading;
      });
    }
  }

  function clearAuthError() {
    const banner = document.getElementById("authErrorBanner");
    if (banner) {
      banner.innerHTML = "";
      banner.style.display = "none";
      banner.removeAttribute("aria-live");
    }
  }

  function showAuthError(messageOrErr) {
    const banner = document.getElementById("authErrorBanner");
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    let friendly = null;
    const errorHandler = global.HealthVibes?.ErrorHandler;
    if (errorHandler && typeof errorHandler.toFriendlyAppError === "function") {
      friendly = errorHandler.toFriendlyAppError(messageOrErr);
    } else if (typeof global.toFriendlyAppError === "function") {
      friendly = global.toFriendlyAppError(messageOrErr);
    } else {
      const rawMsg = typeof messageOrErr === "string" ? messageOrErr : (messageOrErr?.message || (isEn ? "Authentication failed." : "تعذر استكمال المصادقة."));
      friendly = {
        icon: "⚠️",
        title: isEn ? "Authentication Error" : "خطأ في المصادقة",
        message: rawMsg,
        action: isEn ? "Please verify your input and try again." : "يرجى مراجعة البيانات المدخلة والمحاولة مجدداً."
      };
    }

    if (banner && friendly) {
      banner.setAttribute("role", "alert");
      banner.setAttribute("aria-live", "assertive");
      banner.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px; text-align: start;">
          <span style="font-size: 20px; line-height: 1;">${friendly.icon}</span>
          <div>
            <strong style="display: block; font-size: 13.5px; margin-bottom: 2px;">${friendly.title}</strong>
            <span style="display: block; font-size: 12px; opacity: 0.95; line-height: 1.4;">${friendly.message}</span>
            <small style="display: block; font-size: 11px; margin-top: 4px; opacity: 0.85;">💡 ${friendly.action}</small>
          </div>
        </div>
      `;
      banner.style.display = "block";
      try {
        banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {}
    }

    if (typeof global.showToast === "function" && friendly) {
      global.showToast(`${friendly.icon} ${friendly.title}`);
    }

    return friendly;
  }

  async function handleAuthSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    clearAuthError();

    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";
    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const nameInput = document.getElementById("authName");
    const rememberCheckbox = document.getElementById("rememberMe");

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const name = nameInput ? nameInput.value.trim() : "";
    const remember = rememberCheckbox ? rememberCheckbox.checked : true;

    if (!email || !password) {
      showAuthError({
        code: "auth/missing-fields",
        title: isEn ? "Required Information Missing" : "بيانات مطلوبة مفقودة",
        message: isEn
          ? (currentAuthMode === "signup" ? "Please fill in all required fields (Name, Email, and Password)." : "Please enter both your email address and password.")
          : (currentAuthMode === "signup" ? "يرجى كتابة الاسم والبريد الإلكتروني وكلمة المرور للمتابعة." : "يرجى كتابة البريد الإلكتروني وكلمة المرور للمتابعة."),
        action: isEn ? "Review the highlighted input fields above and try again." : "تحقق من حقول الإدخال أعلاه ثم حاول ثانية.",
        icon: "⚠️"
      });
      return;
    }

    // Strict email format validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(email)) {
      showAuthError({
        code: "auth/invalid-email",
        title: isEn ? "Invalid Email Format" : "صيغة البريد غير صحيحة",
        message: isEn
          ? "Please enter a valid email address (e.g. name@example.com)."
          : "يرجى كتابة عنوان بريد إلكتروني صحيح ومكتمل (مثال: name@example.com).",
        action: isEn ? "Check for missing '@', invalid characters, or incomplete domain." : "تأكد من عدم وجود مسافات وكتابة الرمز @ واسم النطاق بشكل صحيح.",
        icon: "📧"
      });
      if (emailInput && typeof emailInput.focus === "function") emailInput.focus();
      return;
    }

    if (currentAuthMode === "signup" && !name) {
      showAuthError({
        code: "auth/missing-name",
        title: isEn ? "Full Name Required" : "الاسم الكامل مطلوب",
        message: isEn ? "Please enter your full name to create an account." : "يرجى إدخال اسمك بالكامل لإنشاء الحساب الطبي.",
        action: isEn ? "Enter your real name so doctors can identify your consultations." : "أدخل اسمك الحقيقي لتسهيل التعرف على استشاراتك وسجلاتك الطبية.",
        icon: "👤"
      });
      return;
    }

    // Strict password validation (8+ chars, upper, number, symbol for signup; 6+ for signin)
    if (currentAuthMode === "signup") {
      const hasMinLength = password.length >= 8;
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

      if (!hasMinLength || !hasUpper || !hasNumber || !hasSymbol) {
        const missingAr = [];
        const missingEn = [];
        if (!hasMinLength) {
          missingAr.push("8 أحرف على الأقل");
          missingEn.push("8+ characters");
        }
        if (!hasUpper) {
          missingAr.push("حرف كبير (A-Z)");
          missingEn.push("uppercase letter (A-Z)");
        }
        if (!hasNumber) {
          missingAr.push("رقم (0-9)");
          missingEn.push("number (0-9)");
        }
        if (!hasSymbol) {
          missingAr.push("رمز خاص (!@#$)");
          missingEn.push("special symbol (!@#$)");
        }

        showAuthError({
          code: "auth/weak-password",
          title: isEn ? "Password Does Not Meet Requirements" : "كلمة المرور لا تستوفي الشروط",
          message: isEn
            ? `Password must meet all security requirements: missing ${missingEn.join(", ")}.`
            : `يجب استيفاء شروط الأمان لكلمة المرور: ينقصها ${missingAr.join("، ")}.`,
          action: isEn
            ? "Ensure your password is 8+ characters and contains an uppercase letter, number, and special symbol."
            : "تأكد من أن كلمة المرور لا تقل عن 8 خانات وتحتوي على حرف كبير، ورقم، ورمز خاص.",
          icon: "🛡️"
        });
        if (passwordInput && typeof passwordInput.focus === "function") passwordInput.focus();
        return;
      }
    } else {
      if (password.length < 6) {
        showAuthError({
          code: "auth/weak-password",
          title: isEn ? "Password Too Short" : "كلمة المرور قصيرة",
          message: isEn ? "Password must contain at least 6 characters." : "يجب ألا تقل كلمة المرور عن 6 خانات للأمان الطبي.",
          action: isEn ? "Choose a stronger password with letters, numbers, and symbols." : "اختر كلمة مرور أقوى تحتوي على حروف وأرقام ورموز.",
          icon: "🔑"
        });
        if (passwordInput && typeof passwordInput.focus === "function") passwordInput.focus();
        return;
      }
    }

    setAuthLoading(true);

    try {
      const authService = global.HealthVibes?.AuthService;
      let user = null;

      if (currentAuthMode === "signup") {
        if (authService && typeof authService.registerWithCredentials === "function") {
          user = await authService.registerWithCredentials(email, password, name);
        } else if (global.auth) {
          if (typeof global.applyAuthPersistence === "function") {
            try { await global.applyAuthPersistence(remember); } catch (_) {}
          }
          const cred = await global.auth.createUserWithEmailAndPassword(email, password);
          user = cred.user;
          const displayName = name || email.split("@")[0];
          try { await user.updateProfile({ displayName }); } catch (_) {}
          if (global.db) {
            try {
              const writePromise = global.db.collection("users").doc(user.uid).set({
                name: displayName,
                email: user.email,
                role: "patient",
                status: "active",
                createdAt: global.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
              }, { merge: true });
              await Promise.race([writePromise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 7000))]);
            } catch (dbErr) {
              console.warn("[AuthUI] Firestore init warning:", dbErr);
            }
          }
          try { await user.sendEmailVerification(); } catch (_) {}
        }

        if (typeof global.saveActiveSession === "function") {
          global.saveActiveSession(user, "patient");
        } else if (authService?.saveActiveSession) {
          authService.saveActiveSession(user, "patient");
        }

        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Account created successfully!" : "تم إنشاء الحساب بنجاح!");
        }

        if (typeof global.transitionToApp === "function") {
          global.transitionToApp(user);
        } else {
          closeAuthModal();
        }
      } else {
        if (authService && typeof authService.signInWithCredentials === "function") {
          const cred = await authService.signInWithCredentials(email, password, remember);
          user = cred.user;
        } else if (global.auth) {
          if (typeof global.applyAuthPersistence === "function") {
            try { await global.applyAuthPersistence(remember); } catch (_) {}
          }
          const cred = await global.auth.signInWithEmailAndPassword(email, password);
          user = cred.user || global.auth.currentUser;
        }

        const role = global.selectedRole || "patient";
        if (typeof global.saveActiveSession === "function") {
          global.saveActiveSession(user, role);
        } else if (authService?.saveActiveSession) {
          authService.saveActiveSession(user, role);
        }

        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Signed in successfully!" : "تم تسجيل الدخول بنجاح!");
        }

        if (typeof global.transitionToApp === "function") {
          global.transitionToApp(user);
        } else {
          closeAuthModal();
        }
      }
    } catch (err) {
      console.error("[AuthUI] Auth submission failed:", err);
      showAuthError(err);
    } finally {
      setAuthLoading(false);
    }
  }

  // =========================================================================
  // 🔐 PROVIDER LINKING & CONFLICT RESOLUTION UI HANDLERS
  // =========================================================================

  function renderProvidersInProfile(user) {
    const target = document.getElementById("authProvidersContainer");
    if (!target) return;

    const currentUser = user || (global.auth ? global.auth.currentUser : null);
    if (!currentUser) {
      target.innerHTML = "";
      return;
    }

    const isEn = (global.currentLanguage || "ar") === "en";
    const linkingEngine = global.HealthVibes?.AuthLinking;
    if (linkingEngine && typeof linkingEngine.renderProviderManagementHtml === "function") {
      target.innerHTML = linkingEngine.renderProviderManagementHtml(currentUser, isEn);
    }
  }

  async function handleLinkGoogle() {
    const user = global.auth?.currentUser;
    const isEn = (global.currentLanguage || "ar") === "en";
    if (!user) {
      if (typeof global.showToast === "function") global.showToast(isEn ? "Please sign in first." : "يرجى تسجيل الدخول أولاً.");
      return;
    }

    const linkingEngine = global.HealthVibes?.AuthLinking;
    if (!linkingEngine) return;

    if (typeof global.showToast === "function") {
      global.showToast(isEn ? "Connecting to Google..." : "جاري الاتصال بحساب Google...");
    }

    const res = await linkingEngine.linkGoogleProvider(user);

    if (res.ok) {
      if (typeof global.showToast === "function") global.showToast(res.message);
      renderProvidersInProfile(user);
    } else if (res.requiresRecentLogin) {
      openReauthModal(async () => {
        await handleLinkGoogle();
      });
    } else if (res.conflict) {
      openConflictModal(res);
    } else if (res.canceled) {
      if (typeof global.showToast === "function") global.showToast(res.error);
    } else {
      if (typeof global.showToast === "function") global.showToast(res.error);
    }
  }

  async function handleUnlinkProvider(providerId) {
    const user = global.auth?.currentUser;
    const isEn = (global.currentLanguage || "ar") === "en";
    if (!user) return;

    const linkingEngine = global.HealthVibes?.AuthLinking;
    if (!linkingEngine) return;

    // First check canUnlink
    const check = linkingEngine.canUnlinkProvider(user, providerId);
    if (!check.allowed) {
      const msg = isEn ? check.messageEn : check.messageAr;
      if (typeof global.showToast === "function") global.showToast(msg);
      return;
    }

    const confirmMsg = isEn
      ? `Are you sure you want to unlink '${providerId}' from your account? You will no longer be able to sign in with this method.`
      : `هل أنت متأكد من رغبتك في إلغاء ربط وسيلة '${providerId}'؟ لن تتمكن من تسجيل الدخول بها مجدداً.`;

    if (typeof window !== "undefined" && window.confirm && !window.confirm(confirmMsg)) {
      return;
    }

    const res = await linkingEngine.unlinkProvider(user, providerId);

    if (res.ok) {
      if (typeof global.showToast === "function") global.showToast(res.message);
      renderProvidersInProfile(user);
    } else if (res.requiresRecentLogin) {
      openReauthModal(async () => {
        await handleUnlinkProvider(providerId);
      });
    } else {
      if (typeof global.showToast === "function") global.showToast(res.error);
    }
  }

  function openSetPasswordModal(options = {}) {
    const isEn = (global.currentLanguage || "ar") === "en";
    const user = global.auth?.currentUser;
    if (!user) return;

    closeLinkingModal();

    const isReauth = Boolean(options.isReauth);
    const modalBackdrop = document.createElement("div");
    modalBackdrop.className = "doctor-modal-backdrop";
    modalBackdrop.id = "authLinkingModalBackdrop";
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) closeLinkingModal();
    };

    modalBackdrop.innerHTML = `
      <div class="doctor-modal-dialog" style="max-width: 480px; padding: 22px; border-radius: 18px;" role="dialog" aria-modal="true" aria-labelledby="linkingModalTitle">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--line); padding-bottom: 10px;">
          <h4 id="linkingModalTitle" style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
            <span>🔐</span> <span>${isReauth ? (isEn ? "Security Re-Authentication" : "تأكيد الهوية وإعادة المصادقة") : (isEn ? "Set Account Password" : "تعيين كلمة مرور للحساب")}</span>
          </h4>
          <button type="button" class="btn-modal-close" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" aria-label="${isEn ? 'Close modal' : 'إغلاق النافذة'}" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);">✕</button>
        </div>

        <p style="margin: 0 0 14px; font-size: 12.5px; color: var(--muted); line-height: 1.5;">
          ${isReauth
            ? (isEn ? "This sensitive operation requires entering your current password to verify account ownership." : "يتطلب هذا الإجراء الحساس إدخال كلمة المرور الحالية لتأكيد ملكية الحساب وأمان السجلات الطبية.")
            : (isEn ? "Set a strong password for your verified email address to enable direct email sign-in." : "عيّن كلمة مرور لبريدك الإلكتروني لتفعيل إمكانية تسجيل الدخول المباشر بالبريد وكلمة المرور.")}
        </p>

        <form id="linkingPasswordForm" onsubmit="HealthVibes.AuthLinkingUI.handlePasswordFormSubmit(event, ${isReauth})">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--muted); display: block; margin-bottom: 4px;">
              ${isEn ? "Account Email" : "البريد الإلكتروني المعتمد"}
            </label>
            <input type="email" value="${user.email || ''}" disabled style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); box-sizing: border-box;" />
          </div>

          <div style="margin-bottom: 12px;">
            <label for="linkingPasswordInput" style="font-size: 12px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">
              ${isReauth ? (isEn ? "Current Password *" : "كلمة المرور الحالية *") : (isEn ? "New Password (min 6 chars) *" : "كلمة المرور الجديدة (6 خانات على الأقل) *")}
            </label>
            <input type="password" id="linkingPasswordInput" required minlength="6" placeholder="••••••••" style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); box-sizing: border-box; scroll-margin-bottom: 120px;" autocomplete="current-password" />
          </div>

          ${!isReauth ? `
            <div style="margin-bottom: 16px;">
              <label for="linkingPasswordConfirmInput" style="font-size: 12px; font-weight: 700; color: var(--ink); display: block; margin-bottom: 4px;">
                ${isEn ? "Confirm Password *" : "تأكيد كلمة المرور *"}
              </label>
              <input type="password" id="linkingPasswordConfirmInput" required minlength="6" placeholder="••••••••" style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); box-sizing: border-box; scroll-margin-bottom: 120px;" autocomplete="new-password" />
            </div>
          ` : ''}

          <div id="linkingModalError" style="display: none; padding: 8px 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #dc2626; font-size: 12px; margin-bottom: 12px;"></div>

          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="soft-button" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" style="font-size: 12.5px; padding: 7px 16px;">
              ${isEn ? "Cancel" : "إلغاء"}
            </button>
            <button type="submit" id="btnSubmitLinkingPassword" class="solid-button" style="font-size: 12.5px; padding: 7px 18px; background: var(--teal); border-color: var(--teal);">
              ${isReauth ? (isEn ? "Verify Identity" : "تأكيد الهوية") : (isEn ? "Save Password & Link" : "حفظ كلمة المرور والربط")}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
    const passInput = document.getElementById("linkingPasswordInput");
    if (passInput) passInput.focus();
  }

  async function handlePasswordFormSubmit(event, isReauth = false) {
    if (event && event.preventDefault) event.preventDefault();
    const isEn = (global.currentLanguage || "ar") === "en";
    const user = global.auth?.currentUser;
    if (!user) return;

    const passInput = document.getElementById("linkingPasswordInput");
    const confirmInput = document.getElementById("linkingPasswordConfirmInput");
    const errorEl = document.getElementById("linkingModalError");
    const submitBtn = document.getElementById("btnSubmitLinkingPassword");

    const password = passInput ? passInput.value : "";
    const confirmPass = confirmInput ? confirmInput.value : "";

    if (!password || password.length < 6) {
      if (errorEl) {
        errorEl.textContent = isEn ? "Password must be at least 6 characters." : "يجب أن تتكون كلمة المرور من 6 خانات على الأقل.";
        errorEl.style.display = "block";
      }
      return;
    }

    if (!isReauth && password !== confirmPass) {
      if (errorEl) {
        errorEl.textContent = isEn ? "Passwords do not match." : "كلمتا المرور غير متطابقتين.";
        errorEl.style.display = "block";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isEn ? "Processing..." : "جاري المعالجة...";
    }

    const linkingEngine = global.HealthVibes?.AuthLinking;
    if (!linkingEngine) return;

    try {
      if (isReauth) {
        await linkingEngine.reauthenticateUser(user, "password", { password });
        closeLinkingModal();
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Identity verified successfully." : "تم التحقق من الهوية بنجاح.");
        }
        if (typeof activeReauthCallback === "function") {
          const cb = activeReauthCallback;
          activeReauthCallback = null;
          await cb();
        }
      } else {
        const res = await linkingEngine.linkPasswordProvider(user, password);
        if (res.ok) {
          closeLinkingModal();
          if (typeof global.showToast === "function") global.showToast(res.message);
          renderProvidersInProfile(user);
        } else {
          if (errorEl) {
            errorEl.textContent = res.error;
            errorEl.style.display = "block";
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = isEn ? "Save Password & Link" : "حفظ كلمة المرور والربط";
          }
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || (isEn ? "Authentication failed." : "فشل التحقق من كلمة المرور.");
        errorEl.style.display = "block";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isReauth ? (isEn ? "Verify Identity" : "تأكيد الهوية") : (isEn ? "Save Password & Link" : "حفظ كلمة المرور والربط");
      }
    }
  }

  function openReauthModal(onSuccessCallback) {
    activeReauthCallback = onSuccessCallback;
    const user = global.auth?.currentUser;
    const { hasPassword, hasGoogle } = global.HealthVibes?.AuthLinking?.getLinkedProviders(user) || {};

    if (hasPassword) {
      openSetPasswordModal({ isReauth: true });
    } else if (hasGoogle) {
      // Trigger Google popup re-auth
      const isEn = (global.currentLanguage || "ar") === "en";
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Please confirm your identity via Google popup..." : "يرجى تأكيد هويتك عبر نافذة Google...");
      }
      global.HealthVibes.AuthLinking.reauthenticateUser(user, "google.com")
        .then(() => {
          if (typeof activeReauthCallback === "function") {
            const cb = activeReauthCallback;
            activeReauthCallback = null;
            cb();
          }
        })
        .catch(err => {
          if (typeof global.showToast === "function") {
            global.showToast(err.message || (isEn ? "Re-authentication failed." : "فشل تأكيد الهوية."));
          }
        });
    } else {
      openSetPasswordModal({ isReauth: true });
    }
  }

  function openConflictModal(conflictData) {
    closeLinkingModal();
    const isEn = (global.currentLanguage || "ar") === "en";
    const instr = conflictData.recoveryInstructions || {};

    const modalBackdrop = document.createElement("div");
    modalBackdrop.className = "doctor-modal-backdrop";
    modalBackdrop.id = "authLinkingModalBackdrop";
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) closeLinkingModal();
    };

    modalBackdrop.innerHTML = `
      <div class="doctor-modal-dialog" style="max-width: 520px; padding: 22px; border-radius: 18px;" role="dialog" aria-modal="true">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 10px;">
          <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #c2410c; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span> <span>${instr.title || (isEn ? "Account Conflict Detected" : "تعارض في وسيلة تسجيل الدخول")}</span>
          </h4>
          <button type="button" class="btn-modal-close" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" aria-label="${isEn ? 'Close modal' : 'إغلاق النافذة'}" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);">✕</button>
        </div>

        <div style="background: rgba(234, 88, 12, 0.08); border: 1.5px solid #ea580c; border-radius: 10px; padding: 12px; margin-bottom: 14px; font-size: 13px; color: var(--ink); line-height: 1.5;">
          ${isEn ? (instr.bodyEn || conflictData.error) : (instr.bodyAr || conflictData.error)}
        </div>

        <div style="margin-bottom: 16px;">
          <strong style="font-size: 12.5px; color: var(--ink); display: block; margin-bottom: 6px;">
            🛡️ ${isEn ? "Recommended Recovery Procedure:" : "خطوات الاستعادة الموصى بها:"}
          </strong>
          <ul style="margin: 0; padding-inline-start: 20px; font-size: 12px; color: var(--muted); line-height: 1.6;">
            ${(instr.steps || [
              isEn ? "Sign out of this profile." : "تسجيل الخروج من الملف الحالي.",
              isEn ? "Sign in using the other provider directly." : "تسجيل الدخول بالوسيلة الأخرى مباشرة.",
              isEn ? "Never merge medical records without verified ownership." : "حظر دمج السجلات الطبية دون التحقق المعتمد."
            ]).map(s => `<li>${s}</li>`).join("")}
          </ul>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="soft-button" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" style="font-size: 12.5px; padding: 7px 16px;">
            ${isEn ? "Keep Current Account" : "البقاء في الحساب الحالي"}
          </button>
          <button type="button" class="solid-button" onclick="leaveApp()" style="font-size: 12.5px; padding: 7px 18px; background: #ea580c; border-color: #ea580c;">
            ${isEn ? "Sign Out to Switch" : "تسجيل الخروج للتبديل"}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
  }

  function closeLinkingModal() {
    const existing = document.getElementById("authLinkingModalBackdrop");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  async function handleGoogleSignIn() {
    if (typeof global.enterApp === "function") {
      return await global.enterApp("google");
    } else if (typeof global.handleGoogleAuth === "function") {
      return await global.handleGoogleAuth();
    }
  }

  const AuthUI = {
    getMode: () => currentAuthMode,
    setAuthMode,
    showAuthModal,
    closeAuthModal,
    setAuthLoading,
    clearAuthError,
    showAuthError,
    handleAuthSubmit,
    handleGoogleSignIn
  };

  const AuthLinkingUI = {
    renderProvidersInProfile,
    handleLinkGoogle,
    handleUnlinkProvider,
    openSetPasswordModal,
    handlePasswordFormSubmit,
    openReauthModal,
    openConflictModal,
    closeLinkingModal
  };

  Object.assign(AuthUI, AuthLinkingUI);
  AuthUI.AuthLinkingUI = AuthLinkingUI;

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AuthUI = AuthUI;
  global.HealthVibes.AuthLinkingUI = AuthLinkingUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AuthUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
