/**
 * app/network-resilience.js
 * Universal offline, network failure, and request timeout resilience module.
 * 
 * Features:
 * 1. Global fetch wrapping with 10-second AbortController timeout.
 * 2. Instant offline detection via window.navigator.onLine.
 * 3. Reactive 'online' and 'offline' window event listeners.
 * 4. Accessible, user-friendly reconnect notification banner with live retry.
 */

(function (global) {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds timeout
  const BANNER_ID = "networkReconnectBanner";
  let autoDismissTimer = null;

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

  function isOnline() {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  }

  /**
   * Display or update the user-friendly reconnect notification banner
   * @param {'offline' | 'online' | 'slow_network'} status
   * @param {Object} [options]
   */
  function showReconnectNotification(status = "offline", options = {}) {
    if (typeof document === "undefined" || !document.body) return null;

    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }

    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.setAttribute("role", "alert");
      banner.setAttribute("aria-live", "assertive");
      banner.setAttribute("aria-atomic", "true");
      document.body.prepend(banner);
    }

    const ar = isArabic();

    if (status === "online") {
      banner.className = "network-banner network-banner-online";
      banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 10px 18px;
        background: linear-gradient(135deg, #065f46, #047857);
        color: #ffffff;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        border-bottom: 2px solid #10b981;
        transition: transform 0.3s ease, opacity 0.3s ease;
      `;

      banner.innerHTML = `
        <span aria-hidden="true" style="font-size: 18px;">✅</span>
        <span id="networkBannerText">
          ${ar ? "تم استعادة الاتصال بالإنترنت بنجاح." : "Internet connection restored successfully."}
        </span>
        <button type="button" id="btnDismissNetworkBanner" aria-label="${ar ? "إغلاق التنبيه" : "Dismiss notification"}"
          style="background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;">
          ✕
        </button>
      `;

      const dismissBtn = banner.querySelector("#btnDismissNetworkBanner");
      if (dismissBtn) {
        dismissBtn.onclick = dismissReconnectNotification;
      }

      // Automatically auto-dismiss after 3.5 seconds
      autoDismissTimer = setTimeout(() => {
        dismissReconnectNotification();
      }, 3500);

      return banner;
    }

    // Offline or Network Failure status
    banner.className = "network-banner network-banner-offline";
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #7f1d1d, #991b1b);
      color: #ffffff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      border-bottom: 2px solid #ef4444;
      flex-wrap: wrap;
    `;

    const message = options.message || (
      status === "slow_network"
        ? (ar ? "استغرق الاتصال وقتاً طويلاً (أكثر من 10 ثوانٍ). يرجى التحقق من الشبكة." : "Request timed out after 10 seconds. Please check your connection.")
        : (ar ? "انقطع الاتصال بالإنترنت. جاري مراقبة الشبكة لإعادة الاتصال تلقائياً..." : "Internet connection lost. Monitoring network to reconnect automatically...")
    );

    banner.innerHTML = `
      <span aria-hidden="true" style="font-size: 18px;">📡</span>
      <span id="networkBannerText" style="flex: 1 1 auto; text-align: center;">${message}</span>
      <button type="button" id="btnRetryNetworkConnection" aria-label="${ar ? "إعادة محاولة الاتصال" : "Retry connection"}"
        style="background: #ffffff; color: #991b1b; border: none; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
        <span aria-hidden="true">↻</span> ${ar ? "إعادة المحاولة" : "Retry"}
      </button>
      <button type="button" id="btnDismissNetworkBanner" aria-label="${ar ? "إغلاق التنبيه" : "Dismiss notification"}"
        style="background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;">
        ✕
      </button>
    `;

    const retryBtn = banner.querySelector("#btnRetryNetworkConnection");
    if (retryBtn) {
      retryBtn.onclick = function () {
        retryBtn.textContent = ar ? "جاري الفحص..." : "Checking...";
        retryBtn.disabled = true;
        if (isOnline()) {
          showReconnectNotification("online");
        } else {
          setTimeout(() => {
            retryBtn.disabled = false;
            retryBtn.innerHTML = `<span aria-hidden="true">↻</span> ${ar ? "إعادة المحاولة" : "Retry"}`;
          }, 800);
        }
      };
    }

    const dismissBtn = banner.querySelector("#btnDismissNetworkBanner");
    if (dismissBtn) {
      dismissBtn.onclick = dismissReconnectNotification;
    }

    return banner;
  }

  function dismissReconnectNotification() {
    if (typeof document === "undefined") return;
    const banner = document.getElementById(BANNER_ID);
    if (banner && banner.parentNode) {
      banner.style.opacity = "0";
      banner.style.transform = "translateY(-100%)";
      setTimeout(() => {
        if (banner.parentNode) {
          banner.parentNode.removeChild(banner);
        }
      }, 300);
    }
  }

  /**
   * Resilient Fetch with 10s AbortController timeout & offline detection
   */
  async function resilientFetch(url, options = {}) {
    // 1. Immediate offline check
    if (!isOnline()) {
      showReconnectNotification("offline");
      const ar = isArabic();
      const offlineError = new Error(
        ar
          ? "يبدو أنك غير متصل بالإنترنت. تحقق من اتصال الشبكة ثم أعد المحاولة."
          : "You appear to be offline. Please check your connection and retry."
      );
      offlineError.code = "OFFLINE";
      offlineError.name = "OfflineError";
      throw offlineError;
    }

    // 2. AbortController with 10s timeout
    const controller = new AbortController();
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      try {
        controller.abort(new Error("REQUEST_TIMEOUT_10S"));
      } catch (e) {
        controller.abort();
      }
    }, timeoutMs);

    // Chain external signal if supplied
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        try {
          controller.abort(options.signal.reason);
        } catch (e) {
          controller.abort();
        }
      } else {
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          try {
            controller.abort(options.signal.reason);
          } catch (e) {
            controller.abort();
          }
        }, { once: true });
      }
    }

    const originalFetch = global._originalFetch || (typeof fetch === "function" ? fetch : null);
    if (!originalFetch) {
      clearTimeout(timer);
      throw new Error("No native fetch implementation available.");
    }

    const mergedOptions = {
      ...options,
      signal: controller.signal
    };

    try {
      const response = await originalFetch(url, mergedOptions);
      return response;
    } catch (err) {
      if (didTimeout || (err && (err.name === "AbortError" || err.message === "REQUEST_TIMEOUT_10S") && didTimeout)) {
        showReconnectNotification("slow_network");
        const ar = isArabic();
        const timeoutError = new Error(
          ar
            ? `انتهت مهلة الطلب (${timeoutMs / 1000} ثوانٍ). يرجى التحقق من جودة الاتصال.`
            : `Request timed out after ${timeoutMs / 1000} seconds. Please check your network connection.`
        );
        timeoutError.name = "TimeoutError";
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }

      // Check for network failure / drops
      const msg = String(err ? err.message : "");
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || !isOnline()) {
        showReconnectNotification("offline");
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Install global fetch interceptor and network event listeners
   */
  function initNetworkResilience() {
    if (typeof global !== "undefined") {
      if (!global._originalFetch && typeof global.fetch === "function") {
        global._originalFetch = global.fetch;
      }

      // Wrap global fetch
      global.fetch = function (url, options) {
        return resilientFetch(url, options);
      };

      // Listen to window.navigator online/offline events
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("offline", () => {
          showReconnectNotification("offline");
        });

        window.addEventListener("online", () => {
          showReconnectNotification("online");
        });
      }
    }
  }

  // Auto-initialize in browser environment
  if (typeof window !== "undefined") {
    initNetworkResilience();
  }

  // Public API
  const api = {
    DEFAULT_TIMEOUT_MS,
    isOnline,
    resilientFetch,
    showReconnectNotification,
    dismissReconnectNotification,
    initNetworkResilience
  };

  if (typeof window !== "undefined") {
    window.networkResilience = api;
    window.resilientFetch = resilientFetch;
    window.showReconnectNotification = showReconnectNotification;
    window.dismissReconnectNotification = dismissReconnectNotification;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
