/**
 * Health Vibe AI - Assessment UI Module
 * 
 * Manages assessment UI warnings, confirmation dialogs, emergency guidance modals,
 * and SpO2 gauge presentations.
 */

(function (global) {
  "use strict";

  function openEmergencyGuideModal() {
    const modal = document.getElementById("emergencyGuideModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeEmergencyGuideModal() {
    const modal = document.getElementById("emergencyGuideModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function closeEmergencySubmitModal() {
    const modal = document.getElementById("emergencySubmitModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function closeConfirmAssessmentModal() {
    const modal = document.getElementById("confirmAssessmentModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function showAssessmentProcessingOverlay(step = 1) {
    if (typeof global.showAssessmentProcessingOverlay === "function") {
      return global.showAssessmentProcessingOverlay(step);
    }
  }

  function hideAssessmentProcessingOverlay() {
    if (typeof global.hideAssessmentProcessingOverlay === "function") {
      return global.hideAssessmentProcessingOverlay();
    }
  }

  const AssessmentUI = {
    openEmergencyGuideModal,
    closeEmergencyGuideModal,
    closeEmergencySubmitModal,
    closeConfirmAssessmentModal,
    showAssessmentProcessingOverlay,
    hideAssessmentProcessingOverlay
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AssessmentUI = AssessmentUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AssessmentUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
