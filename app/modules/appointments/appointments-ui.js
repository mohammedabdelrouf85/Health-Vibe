/**
 * Health Vibe AI - Appointments UI Module
 * 
 * Manages appointment slot buttons, calendar interactions,
 * and booking confirmation dialogs.
 */

(function (global) {
  "use strict";

  function openConfirmBookingModal(summary = {}, onConfirm = null) {
    const modal = document.getElementById("confirmBookingModal");
    if (!modal) return;
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText("confirmBookingDoctor", summary.doctorName || "--");
    setText("confirmBookingClinic", summary.clinicName || "--");
    setText("confirmBookingDate", summary.date || "--");
    setText("confirmBookingTime", isEn ? (summary.timeEn || summary.time) : (summary.timeAr || summary.time));
    setText("confirmBookingType", summary.type || (isEn ? "Telehealth Consultation" : "استشارة عن بُعد"));

    const confirmBtn = document.getElementById("btnConfirmExecuteBooking");
    if (confirmBtn && typeof onConfirm === "function") {
      confirmBtn.onclick = onConfirm;
    }

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeConfirmBookingModal() {
    const modal = document.getElementById("confirmBookingModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  const AppointmentsUI = {
    openConfirmBookingModal,
    closeConfirmBookingModal
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AppointmentsUI = AppointmentsUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppointmentsUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
