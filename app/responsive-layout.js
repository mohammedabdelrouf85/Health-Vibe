/**
 * app/responsive-layout.js
 * Health Vibe AI - Responsive Layout & Breakpoint Management Module
 * 
 * Features:
 * 1. Standardized Breakpoint definitions (Mobile, Tablet, Desktop, Wide Clinical Workstations).
 * 2. Real-time viewport detection and reactive subscriber system.
 * 3. Automatic DOM body class synchronization (device-mobile, device-tablet, device-desktop, device-wide).
 * 4. Doctolib-grade responsive adaptations for Doctor Review Cockpit, Patient Dashboard, and Appointments.
 */

(function (global) {
  "use strict";

  // Standardized Breakpoint Tokens (matching CSS design system)
  const BREAKPOINTS = {
    XS: 480,   // Compact smartphones
    SM: 640,   // Standard smartphones
    MD: 768,   // Tablets portrait
    LG: 1024,  // Tablets landscape & small desktop
    XL: 1280,  // Standard clinical workstations
    XXL: 1536  // Wide high-resolution clinical monitors
  };

  const subscribers = new Set();
  let currentBreakpoint = null;
  let resizeDebounceTimer = null;

  /**
   * Determine active breakpoint tier from viewport width
   * @param {number} [viewportWidth]
   * @returns {'mobile' | 'tablet' | 'desktop' | 'wide'}
   */
  function getBreakpointTier(viewportWidth) {
    const width = typeof viewportWidth === "number"
      ? viewportWidth
      : (typeof window !== "undefined" ? (window.innerWidth || document.documentElement.clientWidth || 0) : 1280);

    if (width < BREAKPOINTS.MD) {
      return "mobile";
    }
    if (width < BREAKPOINTS.LG) {
      return "tablet";
    }
    if (width < BREAKPOINTS.XL) {
      return "desktop";
    }
    return "wide";
  }

  /**
   * Determine exact breakpoint token name (xs, sm, md, lg, xl, xxl)
   * @param {number} [viewportWidth]
   * @returns {'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'}
   */
  function getBreakpointToken(viewportWidth) {
    const width = typeof viewportWidth === "number"
      ? viewportWidth
      : (typeof window !== "undefined" ? (window.innerWidth || document.documentElement.clientWidth || 0) : 1280);

    if (width < BREAKPOINTS.XS) return "xs";
    if (width < BREAKPOINTS.SM) return "sm";
    if (width < BREAKPOINTS.MD) return "md";
    if (width < BREAKPOINTS.LG) return "lg";
    if (width < BREAKPOINTS.XL) return "xl";
    return "2xl";
  }

  function getOrientation() {
    if (typeof window === "undefined") return "landscape";
    return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
  }

  function isMobile() {
    return getBreakpointTier() === "mobile";
  }

  function isTablet() {
    return getBreakpointTier() === "tablet";
  }

  function isDesktop() {
    return getBreakpointTier() === "desktop";
  }

  function isWide() {
    return getBreakpointTier() === "wide";
  }

  /**
   * Synchronize layout classes on document.body for instant CSS targeting
   */
  function syncBodyClasses() {
    if (typeof document === "undefined" || !document.body) return;

    const tier = getBreakpointTier();
    const token = getBreakpointToken();
    const orientation = getOrientation();

    const deviceClasses = ["device-mobile", "device-tablet", "device-desktop", "device-wide"];
    deviceClasses.forEach(cls => document.body.classList.remove(cls));
    document.body.classList.add(`device-${tier}`);

    const bpClasses = ["bp-xs", "bp-sm", "bp-md", "bp-lg", "bp-xl", "bp-2xl"];
    bpClasses.forEach(cls => document.body.classList.remove(cls));
    document.body.classList.add(`bp-${token}`);

    document.body.classList.remove("orientation-portrait", "orientation-landscape");
    document.body.classList.add(`orientation-${orientation}`);
  }

  /**
   * Adapt the Doctor Workstation Cockpit based on viewport tier
   * On mobile: collapses patient queue when a review case is actively selected,
   * showing an ergonomic 'Back to Queue' header.
   * On tablet/desktop: preserves side-by-side split screen view.
   * @param {string|null} [activeCaseId]
   */
  function adaptDoctorCockpit(activeCaseId) {
    if (typeof document === "undefined") return;

    const doctorScreen = document.getElementById("screen-doctor");
    if (!doctorScreen) return;

    const queuePanel = doctorScreen.querySelector(".doctor-queue-panel");
    const reviewPanel = doctorScreen.querySelector(".doctor-review-panel");
    if (!queuePanel || !reviewPanel) return;

    if (isMobile()) {
      if (activeCaseId) {
        queuePanel.classList.add("mobile-hidden");
        reviewPanel.classList.remove("mobile-hidden");
        // Ensure back-to-queue control is present
        let backBtn = reviewPanel.querySelector("#btnMobileBackToQueue");
        const isRtl = (document.documentElement.dir === "rtl" || (document.body && document.body.dir === "rtl") || document.documentElement.lang === "ar");
        const arrow = isRtl ? "→" : "←";
        const label = isRtl ? "العودة لقائمة الانتظار" : "Back to Queue";

        if (!backBtn) {
          backBtn = document.createElement("button");
          backBtn.id = "btnMobileBackToQueue";
          backBtn.type = "button";
          backBtn.className = "mobile-back-to-queue-btn";
          backBtn.onclick = function () {
            queuePanel.classList.remove("mobile-hidden");
            reviewPanel.classList.add("mobile-hidden");
          };
          reviewPanel.prepend(backBtn);
        }
        backBtn.innerHTML = `<span aria-hidden="true">${arrow}</span> <span>${label}</span>`;
        backBtn.setAttribute("aria-label", label);
        backBtn.style.display = "flex";
      } else {
        queuePanel.classList.remove("mobile-hidden");
        reviewPanel.classList.add("mobile-hidden");
        const backBtn = reviewPanel.querySelector("#btnMobileBackToQueue");
        if (backBtn) backBtn.style.display = "none";
      }
    } else {
      // Tablet and Desktop: Always visible in split-screen
      queuePanel.classList.remove("mobile-hidden");
      reviewPanel.classList.remove("mobile-hidden");
      const backBtn = reviewPanel.querySelector("#btnMobileBackToQueue");
      if (backBtn) backBtn.style.display = "none";
    }
  }

  let lastResizeDuration = 0;
  let transitionCount = 0;

  function executeBreakpointChange(newTier, newOrientation, start) {
    if (newTier !== currentBreakpoint) {
      transitionCount++;
      currentBreakpoint = newTier;
      const state = {
        breakpoint: newTier,
        token: getBreakpointToken(),
        width: typeof window !== "undefined" ? window.innerWidth : 1280,
        orientation: newOrientation,
        isMobile: isMobile(),
        isTablet: isTablet(),
        isDesktop: isDesktop(),
        isWide: isWide()
      };

      // Notify subscribers
      subscribers.forEach(cb => {
        try {
          cb(state);
        } catch (err) {
          console.warn("[ResponsiveLayout] Error in subscriber callback:", err);
        }
      });

      // Dispatch global window event
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        try {
          window.dispatchEvent(new CustomEvent("hv-breakpoint-change", { detail: state }));
        } catch (e) {}
      }

      // Auto-adapt mobile bottom navigation when crossing mobile/desktop boundary
      if (typeof global.updateMobileBottomNav === "function") {
        try {
          global.updateMobileBottomNav();
        } catch (e) {}
      }

      // Synchronize device tier with user display preferences
      if (typeof window !== "undefined" && window.HVUserPreferences && typeof window.HVUserPreferences.updateDeviceTier === "function") {
        try {
          window.HVUserPreferences.updateDeviceTier(newTier);
        } catch (e) {}
      }
    }

    const end = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
    lastResizeDuration = end - start;
  }

  /**
   * Handle viewport resize with debounce and requestAnimationFrame batching
   */
  function handleResize() {
    const start = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
    const newTier = getBreakpointTier();
    const newOrientation = getOrientation();

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        syncBodyClasses();
        executeBreakpointChange(newTier, newOrientation, start);
      });
    } else {
      syncBodyClasses();
      executeBreakpointChange(newTier, newOrientation, start);
    }
  }

  /**
   * Benchmark breakpoint evaluation performance
   * @param {number} [iterations=1000]
   * @returns {{ iterations: number, totalMs: number, avgMsPerEval: number }}
   */
  function benchmarkEvaluation(iterations = 1000) {
    const testWidths = [360, 480, 640, 768, 1024, 1280, 1536, 1920];
    const start = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
    for (let i = 0; i < iterations; i++) {
      const w = testWidths[i % testWidths.length];
      getBreakpointTier(w);
      getBreakpointToken(w);
    }
    const end = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
    const totalMs = Math.max(0.001, end - start);
    return {
      iterations,
      totalMs,
      avgMsPerEval: totalMs / iterations
    };
  }

  function getPerformanceMetrics() {
    return {
      lastResizeDurationMs: lastResizeDuration,
      transitionCount,
      currentBreakpoint: currentBreakpoint || getBreakpointTier()
    };
  }

  /**
   * Subscribe to breakpoint changes
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  function subscribe(callback) {
    if (typeof callback === "function") {
      subscribers.add(callback);
      // Immediately call with current state
      try {
        callback({
          breakpoint: getBreakpointTier(),
          token: getBreakpointToken(),
          width: typeof window !== "undefined" ? window.innerWidth : 1280,
          orientation: getOrientation(),
          isMobile: isMobile(),
          isTablet: isTablet(),
          isDesktop: isDesktop(),
          isWide: isWide()
        });
      } catch (e) {}
    }
    return () => subscribers.delete(callback);
  }

  /**
   * Initialize responsive listeners
   */
  function init() {
    if (typeof window === "undefined") return;

    currentBreakpoint = getBreakpointTier();
    syncBodyClasses();

    window.addEventListener("resize", () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(handleResize, 60);
    }, { passive: true });

    window.addEventListener("orientationchange", () => {
      setTimeout(handleResize, 100);
    }, { passive: true });
  }

  // Auto-init in browser
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  const api = {
    BREAKPOINTS,
    getBreakpointTier,
    getBreakpointToken,
    getOrientation,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    syncBodyClasses,
    adaptDoctorCockpit,
    subscribe,
    benchmarkEvaluation,
    getPerformanceMetrics,
    init
  };

  if (typeof window !== "undefined") {
    window.responsiveLayout = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
