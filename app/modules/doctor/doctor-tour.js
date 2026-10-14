/**
 * Health Vibe AI - Doctor Review Walkthrough Tour Module
 * 
 * Interactive clinical tour demonstrating how a licensed physician
 * reviews, validates, and certifies a Respiratory Assessment (SpO2 = 95%)
 * before unlocking the official report for the patient.
 */

(function (global) {
  "use strict";

  let currentTourStep = 1;
  const TOTAL_STEPS = 4;
  let isReportUnlocked = false;

  function openDoctorReviewTour(initialStep = 1) {
    const modal = document.getElementById("doctorTourModal");
    if (!modal) return;

    currentTourStep = Math.min(TOTAL_STEPS, Math.max(1, initialStep));
    isReportUnlocked = false;

    // Reset unlock simulation state
    const unlockStatusBadge = document.getElementById("tourUnlockStatusBadge");
    const unlockCardPreview = document.getElementById("tourUnlockCardPreview");
    const unlockBtn = document.getElementById("btnSimulateUnlock");
    if (unlockStatusBadge) {
      unlockStatusBadge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; margin-inline-end:6px;"></span><span data-i18n="doctorTour.lockedStatus">🔒 قيد المراجعة الطبية (Locked)</span>`;
      unlockStatusBadge.style.background = "rgba(245, 158, 11, 0.15)";
      unlockStatusBadge.style.color = "#f59e0b";
      unlockStatusBadge.style.borderColor = "rgba(245, 158, 11, 0.35)";
    }
    if (unlockCardPreview) {
      unlockCardPreview.classList.remove("is-unlocked");
    }
    if (unlockBtn) {
      unlockBtn.disabled = false;
      const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";
      unlockBtn.innerHTML = `<span>🔓</span> <span>${isEn ? "Simulate Doctor Approval & Unlock" : "محاكاة اعتماد الطبيب وفك القفل"}</span>`;
    }

    renderTourStep(currentTourStep);
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Focus modal
    const closeBtn = document.getElementById("doctorTourCloseBtn");
    if (closeBtn) closeBtn.focus();
  }

  function closeDoctorReviewTour() {
    const modal = document.getElementById("doctorTourModal");
    if (!modal) return;

    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    // Return focus to trigger card
    const heroCard = document.getElementById("heroRespiratoryCard");
    if (heroCard) heroCard.focus();
  }

  function goToDoctorTourStep(step) {
    currentTourStep = Math.min(TOTAL_STEPS, Math.max(1, step));
    renderTourStep(currentTourStep);
  }

  function nextDoctorTourStep() {
    if (currentTourStep < TOTAL_STEPS) {
      goToDoctorTourStep(currentTourStep + 1);
    } else {
      closeDoctorReviewTour();
    }
  }

  function prevDoctorTourStep() {
    if (currentTourStep > 1) {
      goToDoctorTourStep(currentTourStep - 1);
    }
  }

  function renderTourStep(step) {
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    // Update Step Tabs
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const tab = document.getElementById(`tourStepTab-${i}`);
      const content = document.getElementById(`tourStepContent-${i}`);
      if (tab) {
        tab.classList.toggle("active", i === step);
        tab.setAttribute("aria-selected", i === step ? "true" : "false");
      }
      if (content) {
        content.style.display = i === step ? "block" : "none";
      }
    }

    // Update Counter
    const indicator = document.getElementById("tourStepIndicator");
    if (indicator) {
      indicator.textContent = isEn ? `Step ${step} of ${TOTAL_STEPS}` : `خطوة ${step} من ${TOTAL_STEPS}`;
    }

    // Update Progress Bar
    const progressBar = document.getElementById("tourProgressBar");
    if (progressBar) {
      progressBar.style.width = `${(step / TOTAL_STEPS) * 100}%`;
    }

    // Update Prev / Next Buttons
    const prevBtn = document.getElementById("tourPrevBtn");
    const nextBtn = document.getElementById("tourNextBtn");

    if (prevBtn) {
      prevBtn.style.visibility = step === 1 ? "hidden" : "visible";
      prevBtn.disabled = step === 1;
    }

    if (nextBtn) {
      if (step === TOTAL_STEPS) {
        nextBtn.innerHTML = `<span>✓</span> <span>${isEn ? "Done (Close Tour)" : "تم (إنهاء الجولة)"}</span>`;
      } else {
        nextBtn.innerHTML = `<span>${isEn ? "Next Step" : "الخطوة التالية"}</span> <span>${isEn ? "→" : "←"}</span>`;
      }
    }
  }

  function simulateReportUnlock() {
    if (isReportUnlocked) return;
    isReportUnlocked = true;

    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";
    const unlockStatusBadge = document.getElementById("tourUnlockStatusBadge");
    const unlockCardPreview = document.getElementById("tourUnlockCardPreview");
    const unlockBtn = document.getElementById("btnSimulateUnlock");
    const certDetails = document.getElementById("tourCertifiedDetails");

    if (unlockBtn) {
      unlockBtn.disabled = true;
      unlockBtn.innerHTML = `<span>⏳</span> <span>${isEn ? "Certifying Report & Signing..." : "جاري الاعتماد والتوقيع الرقمي..."}</span>`;
    }

    setTimeout(() => {
      if (unlockStatusBadge) {
        unlockStatusBadge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; margin-inline-end:6px;"></span><span>${isEn ? "✅ Verified & Certified (Unlocked)" : "✅ تقرير معتمد سريرياً (تم فك القفل)"}</span>`;
        unlockStatusBadge.style.background = "rgba(16, 185, 129, 0.15)";
        unlockStatusBadge.style.color = "#10b981";
        unlockStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
      }

      if (unlockCardPreview) {
        unlockCardPreview.classList.add("is-unlocked");
      }

      if (certDetails) {
        certDetails.style.display = "block";
      }

      if (unlockBtn) {
        unlockBtn.innerHTML = `<span>🎉</span> <span>${isEn ? "Report Officially Unlocked!" : "تم فك قفل التقرير بنجاح للمريض!"}</span>`;
        unlockBtn.style.background = "linear-gradient(135deg, #059669, #0d9488)";
      }

      // Small celebration pulse
      const animBox = document.getElementById("tourUnlockSuccessNotice");
      if (animBox) {
        animBox.style.display = "flex";
      }
    }, 600);
  }

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("doctorTourModal");
    if (!modal || modal.style.display !== "flex") return;

    if (e.key === "Escape") {
      closeDoctorReviewTour();
    } else if (e.key === "ArrowRight") {
      if (document.dir === "rtl") prevDoctorTourStep();
      else nextDoctorTourStep();
    } else if (e.key === "ArrowLeft") {
      if (document.dir === "rtl") nextDoctorTourStep();
      else prevDoctorTourStep();
    }
  });

  // Universal prevention against empty/hash link jumps on the page
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href === "#" || href === "") {
        e.preventDefault();
      }
    }
  });

  // Export to global scope
  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DoctorTour = {
    open: openDoctorReviewTour,
    close: closeDoctorReviewTour,
    goToStep: goToDoctorTourStep,
    nextStep: nextDoctorTourStep,
    prevStep: prevDoctorTourStep,
    simulateUnlock: simulateReportUnlock
  };

  global.openDoctorReviewTour = openDoctorReviewTour;
  global.closeDoctorReviewTour = closeDoctorReviewTour;
  global.goToDoctorTourStep = goToDoctorTourStep;
  global.nextDoctorTourStep = nextDoctorTourStep;
  global.prevDoctorTourStep = prevDoctorTourStep;
  global.simulateReportUnlock = simulateReportUnlock;

})(typeof window !== "undefined" ? window : globalThis);
