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
        : (isEn ? "Sign in to Health Vibe AI" : "تسجيل الدخول إلى المنصة");
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
          <button type="button" class="btn-modal-close" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);">✕</button>
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
          <button type="button" class="btn-modal-close" onclick="HealthVibes.AuthLinkingUI.closeLinkingModal()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);">✕</button>
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

  const AuthUI = {
    getMode: () => currentAuthMode,
    setAuthMode,
    showAuthModal,
    closeAuthModal,
    setAuthLoading
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
