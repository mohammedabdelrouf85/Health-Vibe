/**
 * Health Vibe AI - Lite Mode Service (مرجع: Vezeeta)
 * Detects low-end hardware capabilities and toggles streamlined, zero-animation rendering.
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = "healthvibe_lite_mode";

  const LiteModeService = {
    /**
     * Checks if client hardware qualifies as low-end (e.g. <= 4 CPU cores or <= 2GB RAM).
     * @param {Object} [customNav]
     * @returns {boolean}
     */
    detectLowEndHardware(customNav) {
      const nav = customNav || (typeof navigator !== "undefined" ? navigator : null);
      if (!nav) return false;

      // 1. Hardware Concurrency (CPU Cores)
      if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) {
        return true;
      }

      // 2. Device Memory in GB (Chrome / Android standard)
      if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) {
        return true;
      }

      // 3. Low bandwidth connection indication
      if (nav.connection && (nav.connection.saveData || nav.connection.effectiveType === "2g" || nav.connection.effectiveType === "slow-2g")) {
        return true;
      }

      return false;
    },

    /**
     * Gets current active lite mode status.
     * @returns {boolean}
     */
    isEnabled() {
      if (typeof localStorage !== "undefined") {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved !== null) {
            return saved === "true";
          }
        } catch (e) {}
      }

      // Default to hardware detection
      return this.detectLowEndHardware();
    },

    /**
     * Sets lite mode state and updates DOM & persistence.
     * @param {boolean} enable
     */
    setLiteMode(enable) {
      const active = Boolean(enable);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, active ? "true" : "false");
        } catch (e) {}
      }

      this.applyDom(active);

      // Dispatch custom event for UI updates
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("healthvibe:lite-mode-changed", {
          detail: { enabled: active }
        }));
      }

      // Sync with backend if in browser environment
      if (typeof window !== "undefined" && typeof fetch === "function") {
        fetch("/api/patient/preferences/lite-mode", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: active })
        }).catch(() => {});
      }

      return active;
    },

    /**
     * Toggles current lite mode status.
     * @returns {boolean} new status
     */
    toggle() {
      return this.setLiteMode(!this.isEnabled());
    },

    /**
     * Applies CSS classes to documentElement and body.
     * @param {boolean} enabled
     */
    applyDom(enabled) {
      if (typeof document === "undefined") return;

      if (enabled) {
        document.documentElement.classList.add("hv-lite-mode");
        if (document.body) document.body.classList.add("hv-lite-mode");
      } else {
        document.documentElement.classList.remove("hv-lite-mode");
        if (document.body) document.body.classList.remove("hv-lite-mode");
      }
    },

    /**
     * Initializes lite mode on app boot.
     */
    init() {
      const active = this.isEnabled();
      this.applyDom(active);
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = LiteModeService;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.LiteModeService = LiteModeService;

    if (typeof document !== "undefined") {
      LiteModeService.init();
    }
  }
})(typeof window !== "undefined" ? window : global);
