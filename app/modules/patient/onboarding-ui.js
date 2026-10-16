/**
 * Health Vibe AI - Patient Onboarding UI Controller (مرجع: Ada Health)
 * Renders 3-step walkthrough modal, manages keyboard navigation, step dots,
 * and completion persistence.
 */

(function (global) {
  "use strict";

  const MODAL_ID = "healthVibeOnboardingModal";
  let currentStepIndex = 0;
  let activeUserId = "guest";
  let escapeKeyListener = null;

  function Service() {
    return (global.HealthVibes && global.HealthVibes.OnboardingService) || (typeof require === "function" ? require("./onboarding-service") : null);
  }

  function I18n() {
    return global.HealthVibes && global.HealthVibes.I18n;
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

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Injects the onboarding modal dialog markup into the document if not present.
   */
  function injectModal() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement("aside");
    modal.id = MODAL_ID;
    modal.className = "onboarding-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "onboardingCardTitle");
    modal.setAttribute("aria-describedby", "onboardingCardDesc");

    modal.innerHTML = `
      <div class="onboarding-dialog" id="onboardingDialog">
        <header class="onboarding-header">
          <span class="onboarding-badge" id="onboardingBadge">الخطوة 1 من 3</span>
          <button type="button" class="onboarding-btn-skip" id="btnOnboardingSkip" onclick="HealthVibes.OnboardingUI.skip()">
            تخطي
          </button>
        </header>

        <div class="onboarding-body" id="onboardingBody">
          <div class="onboarding-icon-wrapper" id="onboardingIcon">📝</div>
          <h3 class="onboarding-card-title" id="onboardingCardTitle">تسجيل الأعراض والمؤشرات الحيوية</h3>
          <div class="onboarding-card-subtitle" id="onboardingCardSubtitle">فرز ذكي مبدئي قائم على الأدلة السريرية</div>
          <p class="onboarding-card-desc" id="onboardingCardDesc">
            أدخل نسبة تشبع الأكسجين (SpO2) والأعراض بدقة...
          </p>

          <div class="onboarding-dots" id="onboardingDots" role="tablist" aria-label="Onboarding Progress">
            <span class="onboarding-dot active" role="tab" aria-selected="true" aria-label="Step 1"></span>
            <span class="onboarding-dot" role="tab" aria-selected="false" aria-label="Step 2"></span>
            <span class="onboarding-dot" role="tab" aria-selected="false" aria-label="Step 3"></span>
          </div>
        </div>

        <footer class="onboarding-footer">
          <button type="button" class="onboarding-btn onboarding-btn-prev" id="btnOnboardingPrev" onclick="HealthVibes.OnboardingUI.prevStep()" style="display: none;">
            السابق
          </button>
          <button type="button" class="onboarding-btn onboarding-btn-next" id="btnOnboardingNext" onclick="HealthVibes.OnboardingUI.nextStep()">
            <span>التالي</span> <span>←</span>
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Updates the dialog DOM elements with data from the current step.
   */
  function updateStepView() {
    const svc = Service();
    if (!svc) return;

    const steps = svc.getSteps();
    const step = steps[currentStepIndex];
    if (!step) return;

    const ar = isArabic();
    const lang = ar ? "ar" : "en";
    const isLast = (currentStepIndex === steps.length - 1);

    const badgeEl = document.getElementById("onboardingBadge");
    const skipBtn = document.getElementById("btnOnboardingSkip");
    const iconEl = document.getElementById("onboardingIcon");
    const titleEl = document.getElementById("onboardingCardTitle");
    const subTitleEl = document.getElementById("onboardingCardSubtitle");
    const descEl = document.getElementById("onboardingCardDesc");
    const prevBtn = document.getElementById("btnOnboardingPrev");
    const nextBtn = document.getElementById("btnOnboardingNext");
    const dotsContainer = document.getElementById("onboardingDots");

    if (badgeEl) {
      badgeEl.textContent = ar ? `الخطوة ${step.step} من ${steps.length}` : `Step ${step.step} of ${steps.length}`;
    }
    if (skipBtn) {
      skipBtn.textContent = ar ? "تخطي الجولة" : "Skip Tour";
      skipBtn.style.visibility = isLast ? "hidden" : "visible";
    }
    if (iconEl) iconEl.textContent = step.icon;
    if (titleEl) titleEl.textContent = step.title[lang];
    if (subTitleEl) subTitleEl.textContent = step.subtitle[lang];
    if (descEl) descEl.textContent = step.description[lang];

    if (prevBtn) {
      prevBtn.style.display = currentStepIndex > 0 ? "inline-flex" : "none";
      prevBtn.textContent = ar ? "السابق" : "Back";
    }

    if (nextBtn) {
      if (isLast) {
        nextBtn.innerHTML = `<span>${ar ? "ابدأ فحصك الصحي الآن" : "Start Your Assessment Now"}</span> <span>✓</span>`;
      } else {
        const arrow = ar ? "←" : "→";
        nextBtn.innerHTML = `<span>${ar ? "التالي" : "Next"}</span> <span>${arrow}</span>`;
      }
    }

    if (dotsContainer) {
      dotsContainer.innerHTML = steps.map((s, idx) => `
        <span 
          class="onboarding-dot ${idx === currentStepIndex ? "active" : ""}" 
          role="tab" 
          aria-selected="${idx === currentStepIndex ? "true" : "false"}"
          aria-label="${ar ? `الخطوة ${idx + 1}` : `Step ${idx + 1}`}"
          onclick="HealthVibes.OnboardingUI.goToStep(${idx})"
          style="cursor: pointer;"
        ></span>
      `).join("");
    }
  }

  /**
   * Advances to the next step or concludes the walkthrough.
   */
  function nextStep() {
    const svc = Service();
    const steps = svc ? svc.getSteps() : [];

    if (currentStepIndex < steps.length - 1) {
      currentStepIndex++;
      updateStepView();
    } else {
      completeWalkthrough();
    }
  }

  /**
   * Returns to previous step.
   */
  function prevStep() {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      updateStepView();
    }
  }

  /**
   * Jumps to specific step.
   * @param {number} idx
   */
  function goToStep(idx) {
    currentStepIndex = Math.max(0, Math.min(2, idx));
    updateStepView();
  }

  /**
   * Skips remaining steps and marks walkthrough completed.
   */
  function skip() {
    completeWalkthrough();
  }

  /**
   * Finalizes the onboarding walkthrough and closes the modal.
   */
  function completeWalkthrough() {
    const svc = Service();
    if (svc) {
      svc.markOnboardingSeen(activeUserId);
    }
    closeModal();
  }

  /**
   * Displays the onboarding walkthrough modal.
   * @param {string} [userId='guest']
   * @param {boolean} [force=false]
   */
  function open(userId = "guest", force = false) {
    activeUserId = userId || "guest";
    const svc = Service();

    if (!force && svc && svc.hasSeenOnboarding(activeUserId)) {
      return false; // Already completed
    }

    if (typeof document === "undefined") return false;

    injectModal();
    currentStepIndex = 0;
    updateStepView();

    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.classList.add("is-open");
      const nextBtn = document.getElementById("btnOnboardingNext");
      if (nextBtn) nextBtn.focus();
    }

    // Attach Escape and Arrow key navigation
    if (!escapeKeyListener && typeof document !== "undefined") {
      escapeKeyListener = function (e) {
        if (e.key === "Escape" || e.keyCode === 27) {
          skip();
        } else if (e.key === "ArrowRight") {
          if (isArabic()) prevStep(); else nextStep();
        } else if (e.key === "ArrowLeft") {
          if (isArabic()) nextStep(); else prevStep();
        }
      };
      document.addEventListener("keydown", escapeKeyListener);
    }

    return true;
  }

  /**
   * Closes the onboarding modal.
   */
  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.classList.remove("is-open");
    }
    if (escapeKeyListener && typeof document !== "undefined") {
      document.removeEventListener("keydown", escapeKeyListener);
      escapeKeyListener = null;
    }
  }

  const OnboardingUI = {
    open,
    closeModal,
    nextStep,
    prevStep,
    goToStep,
    skip,
    getCurrentStep: () => currentStepIndex
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = OnboardingUI;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.OnboardingUI = OnboardingUI;
  }
})(typeof window !== "undefined" ? window : global);
