/**
 * Health Vibe AI - Lite Mode UI Component (مرجع: Vezeeta)
 * Renders the topbar quick toggle and provides accessible controls for budget smartphone users.
 */

(function (global) {
  "use strict";

  const LiteModeUI = {
    service: null,

    /**
     * Resolves localized string.
     * @param {string} key
     * @param {string} fallback
     * @returns {string}
     */
    t(key, fallback = "") {
      const lang = (global.i18n && global.i18n.currentLang) || (global.currentLanguage) || "ar";
      const trans = (global.i18n && global.i18n.translations && global.i18n.translations[lang]) || {};
      const lm = trans.liteMode || {};
      return lm[key] || fallback;
    },

    /**
     * Initializes LiteMode UI.
     */
    init() {
      this.service = (global.HealthVibes && global.HealthVibes.LiteModeService) || null;
      if (!this.service && typeof require !== "undefined") {
        try {
          this.service = require("./lite-mode-service.js");
        } catch (e) {}
      }

      this.renderToggle();
      this.bindEvents();
    },

    /**
     * Renders toggle button into topbar if mount exists.
     */
    renderToggle() {
      if (typeof document === "undefined") return;

      const topActions = document.querySelector(".top-actions");
      if (!topActions) return;

      let btn = document.getElementById("btnLiteModeToggle");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "btnLiteModeToggle";
        btn.className = "lite-mode-toggle-btn";
        btn.type = "button";
        // Insert before language toggle
        const langToggle = document.getElementById("languageToggle");
        if (langToggle && langToggle.parentNode === topActions) {
          topActions.insertBefore(btn, langToggle);
        } else {
          topActions.appendChild(btn);
        }
      }

      this.updateButtonState(btn);
    },

    /**
     * Updates button text, active class, and ARIA attributes.
     * @param {HTMLElement} btn
     */
    updateButtonState(btn) {
      if (!btn) {
        btn = typeof document !== "undefined" ? document.getElementById("btnLiteModeToggle") : null;
      }
      if (!btn) return;

      const isEnabled = this.service ? this.service.isEnabled() : false;
      if (isEnabled) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-label", this.t("disableAria", "تعطيل النسخة الخفيفة"));
        btn.innerHTML = `<span aria-hidden="true">⚡</span> <span>${this.t("activeBadge", "Lite")}</span>`;
        btn.title = this.t("activeTooltip", "النسخة الخفيفة مفعلة لتسريع الأداء");
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", this.t("enableAria", "تفعيل النسخة الخفيفة للأجهزة الاقتصادية"));
        btn.innerHTML = `<span aria-hidden="true">🚀</span> <span>${this.t("inactiveBadge", "Lite")}</span>`;
        btn.title = this.t("inactiveTooltip", "تفعيل النسخة الخفيفة لتقليل المؤثرات الحركية");
      }
    },

    /**
     * Binds click and custom events.
     */
    bindEvents() {
      if (typeof document === "undefined") return;

      document.addEventListener("click", (evt) => {
        const btn = evt.target.closest("#btnLiteModeToggle");
        if (btn) {
          evt.preventDefault();
          if (this.service) {
            const newState = this.service.toggle();
            this.updateButtonState(btn);
            if (typeof global.showToast === "function") {
              const msg = newState
                ? this.t("enabledToast", "تم تفعيل النسخة الخفيفة لتسريع الأداء")
                : this.t("disabledToast", "تم العودة إلى وضع العرض العادي");
              global.showToast(msg);
            }
          }
        }
      });

      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("healthvibe:lite-mode-changed", () => {
          this.updateButtonState();
        });
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = LiteModeUI;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.LiteModeUI = LiteModeUI;

    if (typeof document !== "undefined") {
      document.addEventListener("DOMContentLoaded", () => {
        LiteModeUI.init();
      });
    }
  }
})(typeof window !== "undefined" ? window : global);
