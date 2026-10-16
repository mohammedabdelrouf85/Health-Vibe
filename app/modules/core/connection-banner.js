/**
 * Health Vibe AI - Online/Offline Connection Banner & Form Guard
 * مرجع: HealthVibe AI
 * 
 * Features:
 * 1. Gentle visual connection banner (offline, reconnecting, online).
 * 2. Form submission guard: prevents partial submission & data loss when offline.
 * 3. Client-side draft persistence (localStorage['healthvibe_offline_drafts']).
 * 4. Active ping probe against backend /api/connection/ping to detect captive portals.
 * 5. Screen reader accessible announcements (role="status", aria-live="polite").
 * 6. Responsive touch targets (>= 44px) and zero CPU polling when online.
 */

(function (global) {
  "use strict";

  const BANNER_ID = "healthVibeConnectionBanner";
  const DRAFT_STORAGE_KEY = "healthvibe_offline_drafts";
  let autoDismissTimer = null;
  let isChecking = false;
  let currentStatus = "online";
  let unbindListeners = null;

  function I18n() {
    return global.HealthVibes && global.HealthVibes.I18n;
  }

  function t(key, fallback) {
    if (I18n() && typeof I18n().t === "function") {
      const res = I18n().t(key);
      if (res && res !== key) return res;
    }
    return fallback;
  }

  function isArabic() {
    if (typeof document !== "undefined") {
      const docLang = document.documentElement.lang || document.documentElement.getAttribute("dir");
      if (docLang === "ar" || docLang === "rtl") return true;
    }
    if (typeof global.currentLanguage !== "undefined" && global.currentLanguage === "ar") {
      return true;
    }
    return false;
  }

  function isNavigatorOnline() {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  }

  /**
   * Probes network with real fetch ping to verify internet reachability.
   * @param {string} [pingUrl='/api/connection/ping']
   * @returns {Promise<boolean>}
   */
  async function probeNetwork(pingUrl = "/api/connection/ping") {
    if (!isNavigatorOnline()) return false;
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
      const resp = await fetch(pingUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);
      return resp.ok;
    } catch (err) {
      // If server ping fails or times out, consider offline
      return false;
    }
  }

  /**
   * Saves form inputs into localStorage draft.
   * @param {HTMLFormElement} form
   * @returns {Object} saved draft
   */
  function saveFormDraft(form) {
    if (!form || typeof localStorage === "undefined") return null;
    const formId = form.id || form.getAttribute("name") || "default_form";
    const formData = {};

    const inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach(input => {
      const name = input.name || input.id;
      if (!name) return;
      if (input.type === "password") return; // Never store passwords in offline draft!
      if (input.type === "checkbox" || input.type === "radio") {
        formData[name] = input.checked;
      } else {
        formData[name] = input.value;
      }
    });

    const allDrafts = getSavedDrafts();
    allDrafts[formId] = {
      timestamp: new Date().toISOString(),
      data: formData
    };

    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(allDrafts));
    } catch (e) {
      console.warn("[ConnectionBanner] Failed to save offline draft:", e);
    }
    return allDrafts[formId];
  }

  /**
   * Retrieves all saved form drafts.
   * @returns {Object}
   */
  function getSavedDrafts() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * Clears saved draft for a form.
   * @param {string} formId
   */
  function clearFormDraft(formId) {
    if (typeof localStorage === "undefined") return;
    const drafts = getSavedDrafts();
    delete drafts[formId];
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {}
  }

  /**
   * Guards form submissions from executing while offline.
   * Intercepts submit events, caches draft, and alerts patient.
   */
  function protectFormsFromOfflineSubmission() {
    if (typeof document === "undefined") return;
    const forms = document.querySelectorAll("form");
    forms.forEach(form => {
      if (form._hasOfflineGuard) return;
      form._hasOfflineGuard = true;

      form.addEventListener("submit", function (e) {
        if (!isNavigatorOnline()) {
          e.preventDefault();
          e.stopPropagation();
          saveFormDraft(form);
          showBanner("offline", {
            message: isArabic()
              ? "أنت غير متصل بالإنترنت حالياً — تم حفظ مسودتك مؤقتاً لتجنب فقدان البيانات. يرجى إعادة الاتصال لإرسال النموذج."
              : "You are currently offline. Your draft has been safely saved to avoid data loss. Please reconnect before submitting."
          });
          return false;
        }
      }, true);
    });
  }

  /**
   * Updates disabled state of submit buttons across active view.
   * @param {boolean} offline
   */
  function updateFormSubmitButtons(offline) {
    if (typeof document === "undefined") return;
    const submitBtns = document.querySelectorAll("button[type='submit'], .btn-submit-guarded");
    submitBtns.forEach(btn => {
      if (offline) {
        btn.classList.add("form-offline-disabled");
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("title", isArabic() ? "النموذج معطل مؤقتاً لعدم وجود اتصال بالإنترنت" : "Form submission paused while offline");
      } else {
        btn.classList.remove("form-offline-disabled");
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("title");
      }
    });
  }

  /**
   * Renders or updates the gentle connection banner.
   * @param {'offline' | 'reconnecting' | 'online'} status
   * @param {Object} [options]
   */
  function showBanner(status = "offline", options = {}) {
    if (typeof document === "undefined" || !document.body) return null;

    currentStatus = status;
    updateFormSubmitButtons(status === "offline");

    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }

    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = BANNER_ID;
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.setAttribute("aria-atomic", "true");
      document.body.prepend(banner);
    }

    const ar = isArabic();

    if (status === "online") {
      banner.className = "connection-banner connection-banner--online";
      banner.innerHTML = `
        <div class="connection-banner-content">
          <span aria-hidden="true" style="font-size: 1.1rem;">✅</span>
          <span class="connection-banner-title">
            ${options.message || t("connection.restored", ar ? "تمت استعادة الاتصال بالإنترنت بنجاح — البيانات متزامنة ومحمية." : "Internet connection restored successfully — data is synchronized.")}
          </span>
        </div>
        <div class="connection-banner-actions">
          <button type="button" class="connection-banner-btn connection-banner-btn-dismiss" id="btnDismissConnectionBanner" aria-label="${ar ? "إغلاق التنبيه" : "Dismiss"}">
            ✕
          </button>
        </div>
      `;

      const dismissBtn = banner.querySelector("#btnDismissConnectionBanner");
      if (dismissBtn) dismissBtn.onclick = hideBanner;

      autoDismissTimer = setTimeout(() => {
        hideBanner();
      }, 3000);

      return banner;
    }

    if (status === "reconnecting") {
      banner.className = "connection-banner connection-banner--reconnecting";
      banner.innerHTML = `
        <div class="connection-banner-content">
          <span class="conn-icon-pulse" aria-hidden="true">↻</span>
          <span class="connection-banner-title">
            ${t("connection.reconnecting", ar ? "جارٍ التحقق من استقرار الشبكة وإعادة الاتصال..." : "Checking network stability and reconnecting...")}
          </span>
        </div>
      `;
      return banner;
    }

    // Default: Offline State
    banner.className = "connection-banner connection-banner--offline";
    const msg = options.message || t("connection.offline", ar ? "أنت غير متصل بالإنترنت حالياً — سيتم حفظ مسودة التقييم تلقائياً لحمايتها." : "You are currently offline. Your assessment draft will be saved automatically.");

    banner.innerHTML = `
      <div class="connection-banner-content">
        <span aria-hidden="true" style="font-size: 1.15rem;">📡</span>
        <span class="connection-banner-title" id="connectionBannerText">${msg}</span>
      </div>
      <div class="connection-banner-actions">
        <button type="button" class="connection-banner-btn connection-banner-btn-retry" id="btnRetryConnection" aria-label="${ar ? "إعادة محاولة الاتصال الآن" : "Retry connection now"}">
          <span aria-hidden="true">↻</span>
          <span>${ar ? "إعادة المحاولة" : "Retry Now"}</span>
        </button>
        <button type="button" class="connection-banner-btn connection-banner-btn-dismiss" id="btnDismissConnectionBanner" aria-label="${ar ? "إغلاق التنبيه مؤقتاً" : "Dismiss temporarily"}">
          ✕
        </button>
      </div>
    `;

    const retryBtn = banner.querySelector("#btnRetryConnection");
    if (retryBtn) {
      retryBtn.onclick = () => retryConnection();
    }

    const dismissBtn = banner.querySelector("#btnDismissConnectionBanner");
    if (dismissBtn) {
      dismissBtn.onclick = hideBanner;
    }

    return banner;
  }

  /**
   * Hides and removes the connection banner from DOM.
   */
  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.opacity = "0";
      banner.style.transform = "translateY(-100%)";
      setTimeout(() => {
        if (banner && banner.parentNode) {
          banner.parentNode.removeChild(banner);
        }
      }, 250);
    }
  }

  /**
   * Manual retry connection trigger with probe verification.
   */
  async function retryConnection() {
    if (isChecking) return;
    isChecking = true;
    showBanner("reconnecting");

    const ok = await probeNetwork();
    isChecking = false;

    if (ok) {
      showBanner("online");
    } else {
      showBanner("offline", {
        message: isArabic()
          ? "لم نتمكن من الوصول للخادم بعد. سنواصل الفحص تلقائياً بمجرد استقرار الشبكة."
          : "Unable to reach the server yet. Will continue monitoring automatically."
      });
    }
  }

  /**
   * Initializes the event listeners and form guards.
   */
  function init() {
    if (typeof window === "undefined") return;

    const onOnline = () => {
      showBanner("online");
      protectFormsFromOfflineSubmission();
    };

    const onOffline = () => {
      showBanner("offline");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Initial check
    if (!isNavigatorOnline()) {
      showBanner("offline");
    }

    protectFormsFromOfflineSubmission();

    unbindListeners = function () {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      hideBanner();
    };
  }

  const ConnectionBanner = {
    init,
    showBanner,
    hideBanner,
    retryConnection,
    probeNetwork,
    saveFormDraft,
    getSavedDrafts,
    clearFormDraft,
    protectFormsFromOfflineSubmission,
    updateFormSubmitButtons,
    getStatus: () => currentStatus,
    unbind: () => {
      if (unbindListeners) {
        unbindListeners();
        unbindListeners = null;
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ConnectionBanner;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.ConnectionBanner = ConnectionBanner;
  }
})(typeof window !== "undefined" ? window : global);
