/**
 * Health Vibe AI - Notifications UI Module
 * 
 * Manages toast notifications, aria-live status announcements,
 * and badge updates.
 */

(function (global) {
  "use strict";

  let toastTimer = null;

  function renderToast(message, durationMs = 2600) {
    if (!message || String(message).trim() === "" || String(message).includes("undefined")) {
      return;
    }
    const toast = document.getElementById("toast");
    const srStatus = document.getElementById("srStatus");
    if (!toast) return;

    toast.textContent = String(message);
    if (srStatus) srStatus.textContent = String(message);

    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, durationMs);
  }

  const NotificationsUI = {
    renderToast
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.NotificationsUI = NotificationsUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NotificationsUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
