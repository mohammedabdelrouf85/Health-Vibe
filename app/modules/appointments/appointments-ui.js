/**
 * Health Vibe AI - Interactive Appointment Calendar UI (Vezeeta Standard)
 * 
 * Provides:
 * 1. Doctor Specialty & Quick Filter Tabs (Treating Doctor vs All Pulmonologists)
 * 2. Vezeeta Doctor Showcase Card with Ratings, Fees, Waiting Times, and Maps
 * 3. Interactive Multi-Week / Month Calendar Strip with Navigation
 * 4. Grouped Time Slots (Morning & Evening) with Immediate Slot Badges
 * 5. Family Profiles Integration (Book for Self or Dependents)
 * 6. Vezeeta Mobile Slide-Up Bottom Sheet / Modal with Quick Reason Chips
 * 7. Google Calendar Direct Integration (.ics / URL) & Rescheduling Engine
 */

(function (global) {
  "use strict";

  // State management for interactive calendar
  const state = {
    currentDoctorFilter: "treating", // "treating" | "all" | "clinic" | "video"
    calendarWeekOffset: 0,
    selectedBeneficiaryId: "self",
    selectedBeneficiaryName: "",
    selectedQuickReason: "",
    activeDoctor: null,
    isMonthPickerOpen: false,
    activeLinkedCase: null, // Doctolib Pre-Visit Medical Dossier attachment
    selectedConsultationType: "video" // CliniDo Consultation Type: "video" | "clinic" | "followup"
  };

  /**
   * Builds direct Google Calendar URL for an appointment
   */
  function buildGoogleCalendarUrl(appt = {}) {
    const rawDate = appt.date || appt.dateStr;
    if (!rawDate || !appt.timeSlot) return "#";
    try {
      const title = encodeURIComponent(`Health Vibe: استشارة مع ${appt.doctorName || "الطبيب المعالج"}`);
      const details = encodeURIComponent(`موعد كشف سريري مع ${appt.doctorName || ""}\nالنوع: ${appt.typeLabel || appt.type || "استشارة"}\nالعيادة: ${appt.clinicName || ""}\nالمريض: ${appt.patientName || ""}\nملاحظات: ${appt.notes || "لا توجد"}`);
      const location = encodeURIComponent(appt.clinicName || "Health Vibe Telehealth Room");

      // Approximate standard 30 min duration
      const dateClean = String(rawDate).replace(/-/g, "");
      // Default time parser (e.g. 10:00 AM -> 100000, 04:00 PM -> 160000)
      let hour = 10;
      let min = 0;
      const t = String(appt.timeSlot || "");
      const match = t.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        hour = parseInt(match[1], 10);
        min = parseInt(match[2], 10);
        if ((t.includes("مساء") || t.toLowerCase().includes("pm")) && hour < 12) hour += 12;
        if ((t.includes("صباح") || t.toLowerCase().includes("am")) && hour === 12) hour = 0;
      }
      const pad = n => String(n).padStart(2, "0");
      const startIso = `${dateClean}T${pad(hour)}${pad(min)}00Z`;
      const endHour = min >= 30 ? hour + 1 : hour;
      const endMin = min >= 30 ? min - 30 : min + 30;
      const endIso = `${dateClean}T${pad(endHour)}${pad(endMin)}00Z`;

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
    } catch (e) {
      return "#";
    }
  }

  /**
   * Renders the Vezeeta Doctor Filter Tabs
   */
  function renderDoctorFilterTabs(containerId, activeFilter = "treating", onFilterChange = null) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    const tabs = [
      { id: "treating", labelAr: "🩺 طبيبي المعالج المخصص", labelEn: "🩺 My Treating Doctor" },
      { id: "all", labelAr: "👨‍⚕️ جميع استشاريي الصدر", labelEn: "👨‍⚕️ All Pulmonologists" },
      { id: "clinic", labelAr: "🏥 كشف عيادة", labelEn: "🏥 In-Clinic" },
      { id: "video", labelAr: "📹 استشارة فيديو", labelEn: "📹 Video Telehealth" }
    ];

    el.innerHTML = `
      <div class="vezeeta-doctor-filter-tabs" role="tablist">
        ${tabs.map(tab => `
          <button type="button" 
                  role="tab"
                  aria-selected="${tab.id === activeFilter ? "true" : "false"}"
                  class="vezeeta-filter-chip ${tab.id === activeFilter ? "active" : ""}"
                  data-filter="${tab.id}">
            ${isEn ? tab.labelEn : tab.labelAr}
          </button>
        `).join("")}
      </div>
    `;

    el.querySelectorAll(".vezeeta-filter-chip").forEach(btn => {
      btn.onclick = () => {
        const filterId = btn.dataset.filter;
        state.currentDoctorFilter = filterId;
        renderDoctorFilterTabs(containerId, filterId, onFilterChange);
        if (typeof onFilterChange === "function") onFilterChange(filterId);
      };
    });
  }

  /**
   * Renders the Vezeeta Doctor Profile Showcase Card
   */
  function renderDoctorCard(targetOrDoctor = {}, doctorOrIsEn = false, maybeIsEn = false) {
    let container = null;
    let doctor = targetOrDoctor;
    let isEn = !!doctorOrIsEn;

    if (targetOrDoctor && (typeof targetOrDoctor === "string" || targetOrDoctor.innerHTML !== undefined)) {
      container = typeof targetOrDoctor === "string" ? document.getElementById(targetOrDoctor) : targetOrDoctor;
      doctor = doctorOrIsEn || {};
      isEn = !!maybeIsEn;
    }

    if (!doctor || !doctor.id) {
      const emptyHtml = `
        <div class="vezeeta-doctor-card">
          <div class="vezeeta-doctor-info">
            <h4 style="color:var(--muted); font-size:14px; margin:0;">
              ${isEn ? "No doctor selected" : "لم يتم تحديد طبيب بعد"}
            </h4>
          </div>
        </div>
      `;
      if (container) { container.innerHTML = emptyHtml; return emptyHtml; }
      return emptyHtml;
    }

    const docName = isEn ? (doctor.nameEn || doctor.name) : (doctor.nameAr || doctor.name);
    const docSpecialty = isEn 
      ? (doctor.specialtyEn || doctor.specialty || "Pulmonology & Allergy Consultant")
      : (doctor.specialtyAr || doctor.specialty || "استشاري الأمراض الصدرية والحساسية والعناية المركزة");
    const clinicName = (isEn ? (doctor.clinicEn || doctor.clinic) : (doctor.clinicAr || doctor.clinic)) || (isEn ? "Specialized Chest Clinic - Cairo" : "مركز القاهرة التخصصي لأمراض الصدر");
    const feesText = doctor.fees || (isEn ? "350 EGP (Medical Insurance Accepted)" : "٣٥٠ جنيه (مقبول بالتأمين الطبي)");
    const waitingText = doctor.waitingTime ? (isEn ? `Avg. wait: ${doctor.waitingTime}` : `متوسط الانتظار: ${doctor.waitingTime}`) : (isEn ? "Avg. wait: 10 mins" : "متوسط الانتظار: ١٠ دقائق");
    const ratingVal = doctor.rating || 4.9;
    const reviewCount = doctor.reviewsCount || 148;
    const ratingText = `⭐ ${ratingVal} (${reviewCount}+)`;

    const cardHtml = `
      <div class="vezeeta-doctor-card" id="vezeetaDoctorCard-${doctor.id}">
        <div class="vezeeta-doctor-avatar-wrap">
          <div class="vezeeta-doctor-avatar">
            <span>👨‍⚕️</span>
          </div>
          <span class="vezeeta-online-beacon" title="${isEn ? "Available Today" : "متاح للحجز اليوم"}"></span>
        </div>
        <div class="vezeeta-doctor-info">
          <div class="vezeeta-doctor-name-row">
            <h4 class="vezeeta-doctor-name">${escapeHtml(docName)}</h4>
            <span class="vezeeta-badge-verified">
              <span>✓</span> ${isEn ? "Board Certified" : "طبيب معتمد وموثق"}
            </span>
          </div>
          <div class="vezeeta-doctor-specialty">${escapeHtml(docSpecialty)}</div>
          
          <div class="vezeeta-doctor-meta-row">
            <div class="vezeeta-meta-item">
              <span class="vezeeta-rating-pill">${ratingText}</span>
            </div>
            <div class="vezeeta-meta-item">
              <span>📍</span>
              <span>${escapeHtml(clinicName)}</span>
            </div>
            <div class="vezeeta-meta-item">
              <span>⏱️</span>
              <span>${waitingText}</span>
            </div>
            <div class="vezeeta-meta-item">
              <span>💰</span>
              <strong style="color:var(--teal, #0d9488);">${feesText}</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    if (container) {
      container.innerHTML = cardHtml;
    }
    return cardHtml;
  }

  /**
   * Renders the Vezeeta Interactive Calendar Strip with Week Navigation
   */
  function renderCalendarStrip(days = [], selectedDateStr = "", onSelectDate = null, isEn = false) {
    if (!days || days.length === 0) return "";

    const activeDateObj = days.find(d => d.dateStr === selectedDateStr) || days[0];
    const monthTitle = isEn 
      ? (activeDateObj.fullLabelEn || "October 2026")
      : (activeDateObj.fullLabelAr || "أكتوبر 2026");

    return `
      <div class="vezeeta-calendar-header">
        <div class="vezeeta-calendar-month-title">
          <span>📅</span>
          <span>${monthTitle}</span>
        </div>
        <div class="vezeeta-calendar-nav-btns">
          <button type="button" class="vezeeta-nav-btn" id="vezeetaCalPrevWeek" aria-label="${isEn ? "Previous Week" : "الأسبوع السابق"}" title="${isEn ? "Previous" : "السابق"}">‹</button>
          <button type="button" class="vezeeta-nav-btn" id="vezeetaCalNextWeek" aria-label="${isEn ? "Next Week" : "الأسبوع القادم"}" title="${isEn ? "Next" : "التالي"}">›</button>
        </div>
      </div>
      <div class="vezeeta-calendar-strip" id="vezeetaCalendarStrip" role="tablist">
        ${days.map(dayItem => {
          const isSelected = dayItem.dateStr === selectedDateStr;
          const dayName = isEn ? dayItem.labelEn : dayItem.labelAr;
          const statusText = dayItem.isOff ? (isEn ? "Off" : "عطلة") : (dayItem.isOnLeave ? (isEn ? "Leave" : "إجازة") : (isEn ? "Available" : "متاح"));
          const statusClass = dayItem.isOff ? "fully-booked" : (dayItem.isOnLeave ? "on-leave" : "has-slots");

          return `
            <button type="button"
                    role="tab"
                    aria-selected="${isSelected ? "true" : "false"}"
                    class="vezeeta-day-card ${isSelected ? "active" : ""}"
                    data-date="${dayItem.dateStr}"
                    onclick="window.selectAppointmentDate && window.selectAppointmentDate('${dayItem.dateStr}')">
              <span class="vezeeta-day-name">${dayName}</span>
              <span class="vezeeta-day-number">${dayItem.dayNumber}</span>
              <span class="vezeeta-day-status ${statusClass}">
                <span style="font-size:7px;">●</span> ${statusText}
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  /**
   * Groups Available Clinical Time Slots into Morning & Evening Categories
   */
  function renderGroupedSlots(targetOrSlots = [], maybeBookedDoc = new Set(), maybeBookedPat = new Set(), maybeSelectedId = "", maybeIsEn = false) {
    let container = null;
    let slots = targetOrSlots;
    let bookedDoctorSlotIds = maybeBookedDoc instanceof Set ? maybeBookedDoc : new Set(Array.isArray(maybeBookedDoc) ? maybeBookedDoc : []);
    let bookedPatientSlotIds = maybeBookedPat instanceof Set ? maybeBookedPat : new Set(Array.isArray(maybeBookedPat) ? maybeBookedPat : []);
    let selectedSlotId = maybeSelectedId;
    let isEn = !!maybeIsEn;

    if (targetOrSlots && (typeof targetOrSlots === "string" || targetOrSlots.innerHTML !== undefined)) {
      container = typeof targetOrSlots === "string" ? document.getElementById(targetOrSlots) : targetOrSlots;
      slots = Array.isArray(maybeBookedDoc) ? maybeBookedDoc : [];
      const selSlot = maybeBookedPat;
      selectedSlotId = (selSlot && typeof selSlot === "object" ? selSlot.id : selSlot) || "";
      const bookedArr = Array.isArray(maybeSelectedId) ? maybeSelectedId : [];
      bookedDoctorSlotIds = new Set(bookedArr);
      bookedPatientSlotIds = new Set();
      isEn = !!maybeIsEn;
    }

    if (!slots || slots.length === 0) {
      const emptyHtml = `
        <div style="text-align:center; padding:20px; color:var(--muted); font-size:13px;">
          ${isEn ? "No available slots on this day." : "لا توجد فترات متاحة في هذا اليوم."}
        </div>
      `;
      if (container) { container.innerHTML = emptyHtml; return emptyHtml; }
      return emptyHtml;
    }

    const morningSlots = [];
    const eveningSlots = [];

    slots.forEach(slot => {
      // Determine time period
      const t = slot.timeEn || slot.timeAr || "";
      if (t.includes("AM") || t.includes("صباح") || t.startsWith("10:") || t.startsWith("11:")) {
        morningSlots.push(slot);
      } else {
        eveningSlots.push(slot);
      }
    });

    const renderSlotBtn = (slot) => {
      const isDocBooked = bookedDoctorSlotIds.has(slot.id);
      const isPatBooked = bookedPatientSlotIds.has(slot.id);
      const isUnavailable = isDocBooked || isPatBooked;
      const isActive = !isUnavailable && slot.id === selectedSlotId;

      const timeLabel = isEn ? slot.timeEn : slot.timeAr;
      let statusLabel = isEn ? "Available" : "متاح للحجز";
      if (isDocBooked) statusLabel = isEn ? "⛔ Booked" : "⛔ محجوز";
      else if (isPatBooked) statusLabel = isEn ? "⚠️ Conflict" : "⚠️ لديك موعد";

      return `
        <button type="button"
                class="vezeeta-slot-button ${isActive ? "active vezeeta-slot-selected" : ""} ${isUnavailable ? "vezeeta-slot-booked" : ""}"
                ${isUnavailable ? "disabled=\"disabled\"" : ""}
                onclick="${isUnavailable ? "" : `window.selectAppointmentSlot && window.selectAppointmentSlot('${slot.id}')`}">
          <strong>${timeLabel}</strong>
          <span>${statusLabel}</span>
        </button>
      `;
    };

    let html = "";
    if (morningSlots.length > 0) {
      html += `
        <div class="vezeeta-slots-section">
          <div class="vezeeta-slots-header">
            <span>🌅</span>
            <span>${isEn ? "Morning Slots (10:00 AM - 01:00 PM)" : "الفترة الصباحية (١٠:٠٠ ص - ٠١:٠٠ م)"}</span>
          </div>
          <div class="vezeeta-slots-grid">
            ${morningSlots.map(renderSlotBtn).join("")}
          </div>
        </div>
      `;
    }

    if (eveningSlots.length > 0) {
      html += `
        <div class="vezeeta-slots-section">
          <div class="vezeeta-slots-header">
            <span>🌆</span>
            <span>${isEn ? "Evening Slots (04:00 PM - 09:00 PM)" : "الفترة المسائية (٠٤:٠٠ م - ٠٩:٠٠ م)"}</span>
          </div>
          <div class="vezeeta-slots-grid">
            ${eveningSlots.map(renderSlotBtn).join("")}
          </div>
        </div>
      `;
    }

    if (container) {
      container.innerHTML = html;
    }
    return html;
  }

  /**
   * Renders the Family Member Beneficiary Selector (Family Profiles Integration)
   */
  function renderBeneficiarySelector(containerId, isEn = false) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;

    let familyMembers = [];
    if (global.HealthVibes && global.HealthVibes.FamilyService && typeof global.HealthVibes.FamilyService.getFamilyMembers === "function") {
      familyMembers = global.HealthVibes.FamilyService.getFamilyMembers();
    } else if (global.FamilyProfilesService && typeof global.FamilyProfilesService.getDependents === "function") {
      familyMembers = global.FamilyProfilesService.getDependents();
    } else if (global.FamilyProfilesUI && typeof global.FamilyProfilesUI.getDependents === "function") {
      familyMembers = global.FamilyProfilesUI.getDependents();
    }

    el.innerHTML = `
      <div class="vezeeta-patient-beneficiary-wrap">
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:var(--ink);">
          ${isEn ? "Who is this appointment for?" : "لمن ترغب في حجز هذا الموعد؟"}
        </label>
        <select id="apptBeneficiarySelect" style="display:none;" aria-hidden="true">
          <option value="self" ${state.selectedBeneficiaryId === "self" ? "selected" : ""}>${isEn ? "Myself (Primary Patient)" : "أنا (المريض الأساسي)"}</option>
          ${familyMembers.map(m => `
            <option value="${m.id}" ${state.selectedBeneficiaryId === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>
          `).join("")}
        </select>
        <div class="vezeeta-beneficiary-options">
          <button type="button" class="vezeeta-beneficiary-btn ${state.selectedBeneficiaryId === "self" ? "active" : ""}" data-id="self">
            <span>👤</span>
            <span>${isEn ? "Myself (Primary Patient)" : "أنا (المريض الأساسي)"}</span>
          </button>
          ${familyMembers.map(m => `
            <button type="button" class="vezeeta-beneficiary-btn ${state.selectedBeneficiaryId === m.id ? "active" : ""}" data-id="${m.id}" data-name="${escapeHtml(m.name)}">
              <span>${m.avatarEmoji || "👨‍👩‍👧"}</span>
              <span>${escapeHtml(m.name)} (${isEn ? (m.relationEn || m.relationship) : m.relationship})</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    if (typeof el.querySelectorAll === "function") {
      el.querySelectorAll(".vezeeta-beneficiary-btn").forEach(btn => {
        btn.onclick = () => {
          el.querySelectorAll(".vezeeta-beneficiary-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          state.selectedBeneficiaryId = btn.dataset.id || "self";
          state.selectedBeneficiaryName = btn.dataset.name || "";
          if (typeof el.querySelector === "function") {
            const sel = el.querySelector("#apptBeneficiarySelect");
            if (sel) sel.value = state.selectedBeneficiaryId;
          }
        };
      });
    }
  }

  /**
   * Renders the CliniDo-Inspired Consultation Mode Selector (Video vs In-Clinic vs Follow-up)
   * with Commute Relief for Egypt Traffic and Clinic Branch Details.
   */
  function renderConsultationModeSelector(containerId, activeType = "video", onTypeChange = null, isEn = false) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;

    state.selectedConsultationType = activeType || "video";

    const modes = [
      {
        id: "video",
        icon: "📹",
        badgeAr: "الأكثر راحة ووفر زحام المواصلات",
        badgeEn: "Recommended: Skip Traffic",
        badgeClass: "clinido-badge-commute",
        titleAr: "استشارة فيديو عن بُعد",
        titleEn: "Remote Video Consultation",
        subtitleAr: "من منزلك عبر الهاتف بدون سفر أو انتظار",
        subtitleEn: "From home via mobile with zero commute"
      },
      {
        id: "clinic",
        icon: "🏥",
        badgeAr: "فحص سريري كامل",
        badgeEn: "Complete Physical Exam",
        badgeClass: "clinido-badge-exam",
        titleAr: "زيارة فرع العيادة",
        titleEn: "In-Clinic Branch Visit",
        subtitleAr: "كشف سريري مباشر وسماع أصوات الصدر",
        subtitleEn: "Direct physical exam & chest auscultation"
      },
      {
        id: "followup",
        icon: "📋",
        badgeAr: "مراجعة سريعة",
        badgeEn: "Quick Review",
        badgeClass: "clinido-badge-followup",
        titleAr: "متابعة نتائج وتقارير",
        titleEn: "Results & Reports Follow-up",
        subtitleAr: "مراجعة التحاليل ووظائف الرئة",
        subtitleEn: "Review lab tests & lung function"
      }
    ];

    const detailsHtml = renderConsultationDetailsCard(state.selectedConsultationType, isEn);

    el.innerHTML = `
      <div class="clinido-mode-selector-wrap" role="region" aria-label="${isEn ? "Consultation Mode Selection" : "تحديد نوع ومقر الاستشارة"}">
        <label style="display:block; margin-bottom:8px; font-weight:600; font-size:13px; color:var(--ink);">
          ${isEn ? "Consultation Mode & Venue (Reduce Commute in Egypt):" : "نوع الاستشارة ومقر الكشف (لتخفيف عبء المواصلات والزحام):"}
        </label>
        <div class="appt-types-row vezeeta-modes-grid" role="radiogroup">
          ${modes.map(m => {
            const isSelected = m.id === state.selectedConsultationType;
            return `
              <button type="button" 
                      role="radio"
                      aria-checked="${isSelected ? "true" : "false"}"
                      class="appt-type-btn vezeeta-mode-card clinido-mode-card ${isSelected ? "active" : ""}" 
                      data-type="${m.id}"
                      id="btnMode_${m.id}">
                <span class="clinido-card-badge ${m.badgeClass}">${isEn ? m.badgeEn : m.badgeAr}</span>
                <strong style="margin-top: 10px;">${m.icon} ${isEn ? m.titleEn : m.titleAr}</strong>
                <span>${isEn ? m.subtitleEn : m.subtitleAr}</span>
              </button>
            `;
          }).join("")}
        </div>
        <div id="clinidoModeDetailsMount">
          ${detailsHtml}
        </div>
      </div>
    `;

    // Bind click events
    if (typeof el.querySelectorAll === "function") {
      el.querySelectorAll(".appt-type-btn").forEach(btn => {
        btn.onclick = () => {
          const newType = btn.dataset.type || "video";
          state.selectedConsultationType = newType;
          el.querySelectorAll(".appt-type-btn").forEach(b => {
            const active = b.dataset.type === newType;
            b.classList.toggle("active", active);
            b.setAttribute("aria-checked", active ? "true" : "false");
          });
          const detailsMount = el.querySelector("#clinidoModeDetailsMount") || document.getElementById("clinidoModeDetailsMount");
          if (detailsMount) {
            detailsMount.innerHTML = renderConsultationDetailsCard(newType, isEn);
          }
          if (typeof onTypeChange === "function") onTypeChange(newType);
        };
      });
    }
  }

  /**
   * Generates the contextual information card explaining commute relief, branch location, or follow-up perks.
   */
  function renderConsultationDetailsCard(type = "video", isEn = false) {
    if (type === "clinic") {
      return `
        <div class="clinido-mode-details-card" role="note">
          <div class="clinido-details-header">
            <span class="clinido-details-title">
              <span>🏥</span> ${isEn ? "In-Clinic Branch Visit Details" : "تفاصيل زيارة فرع العيادة"}
            </span>
            <span class="pill ok" style="font-size:11px;">${isEn ? "Direct Attendance" : "حضور شخصي"}</span>
          </div>
          <div class="clinido-details-desc">
            📍 <strong>${isEn ? "Venue:" : "المقر:"}</strong> ${isEn ? "Cairo Specialized Chest & Allergy Center — Dokki Branch, Giza (Near Dokki Metro Station, 3 mins walk)." : "مركز القاهرة التخصصي لأمراض الصدر والحساسية — فرع الدقي، الجيزة (بالقرب من محطة مترو الدقي، ٣ دقائق سيراً)."}<br>
            ⏱️ ${isEn ? "Average clinic wait time is 10-15 minutes. Please arrive 10 minutes prior to scheduled slot for check-in and vitals check." : "متوسط وقت الانتظار بالعيادة ١٠-١٥ دقيقة فقط. يرجى الحضور قبل الموعد بـ ١٠ دقائق لتسجيل الوصول وقياس العلامات الحيوية."}
          </div>
          <div class="clinido-perks-row">
            <span class="clinido-perk-pill location">🚇 ${isEn ? "Near Dokki Metro" : "بالقرب من محطة المترو"}</span>
            <span class="clinido-perk-pill">🅿️ ${isEn ? "Parking Available" : "ساحة انتظار سيارات"}</span>
            <span class="clinido-perk-pill">🫁 ${isEn ? "Spirometry & Nebulizer Ready" : "أجهزة فحص الرئة والنيبولايزر"}</span>
            <span class="clinido-perk-pill">♿ ${isEn ? "Accessible Elevator" : "مصعد ومدخل مجهز"}</span>
          </div>
        </div>
      `;
    }

    if (type === "followup") {
      return `
        <div class="clinido-mode-details-card" role="note">
          <div class="clinido-details-header">
            <span class="clinido-details-title">
              <span>📋</span> ${isEn ? "Report & Results Follow-up Details" : "تفاصيل متابعة النتائج والتقارير"}
            </span>
            <span class="pill info" style="font-size:11px;">${isEn ? "Follow-up" : "متابعة نتائج"}</span>
          </div>
          <div class="clinido-details-desc">
            ${isEn ? "Designed for reviewing previous lab work, spirometry findings, or medication adjustments without the need for a full re-examination." : "مخصصة لمراجعة نتائج الفحوصات والتحاليل الأخيرة، وتقييم وظائف الرئة أو تعديل جرعات البخاخات والعلاج دون الحاجة لكشف سريري كامل."}
          </div>
          <div class="clinido-perks-row">
            <span class="clinido-perk-pill warn">📑 ${isEn ? "Bring / Attach Recent Reports" : "إحضار أو إرفاق أحدث تقارير الفحص"}</span>
            <span class="clinido-perk-pill">⚡ ${isEn ? "Focused Medical Review" : "مراجعة طبية سريعة وموجهة"}</span>
            <span class="clinido-perk-pill">💊 ${isEn ? "Treatment Plan Adjustment" : "تعديل الخطة العلاجية والجرعات"}</span>
          </div>
        </div>
      `;
    }

    // Default: Video Consultation (Telehealth with Egypt Commute Relief)
    return `
      <div class="clinido-mode-details-card" role="note">
        <div class="clinido-details-header">
          <span class="clinido-details-title">
            <span>🚗</span> ${isEn ? "Commute Relief: Remote Video Consultation" : "تخفيف عبء المواصلات: استشارة فيديو عن بُعد"}
          </span>
          <span class="pill ok" style="font-size:11px;">${isEn ? "Traffic-Free Care" : "بدون زحام"}</span>
        </div>
        <div class="clinido-details-desc">
          ${isEn 
            ? "Save commute time and avoid Cairo & Giza city traffic. Connect with your pulmonologist via a secure, encrypted HD video call directly from your smartphone or PC." 
            : "وفر وقتك ومجهودك وتجنب مشقة الزحام والمواصلات في القاهرة والجيزة والمحافظات. تواصل مع استشاري الصدر مباشرة عبر مكالمة فيديو عالية الدقة ومشفرة من هاتفك أو حاسوبك."}
        </div>
        <div class="clinido-perks-row">
          <span class="clinido-perk-pill">📶 ${isEn ? "Stable Internet Connection" : "اتصال إنترنت مستقر"}</span>
          <span class="clinido-perk-pill">📱 ${isEn ? "Mobile & Desktop Ready" : "متوافق مع جميع الهواتف"}</span>
          <span class="clinido-perk-pill">🔒 ${isEn ? "Encrypted Telehealth Room" : "غرفة فيديو مشفرة وآمنة"}</span>
          <span class="clinido-perk-pill">📄 ${isEn ? "Instant E-Prescription" : "روشتة إلكترونية معتمدة"}</span>
        </div>
      </div>
    `;
  }

  function getSelectedConsultationType() {
    return state.selectedConsultationType || "video";
  }

  function setSelectedConsultationType(type) {
    state.selectedConsultationType = type || "video";
  }

  /**
   * Opens Vezeeta Confirmation Bottom-Sheet on Mobile and Modal on Desktop
   */
  function openConfirmBookingModal(summary = {}, onConfirm = null) {
    let modal = document.getElementById("confirmBookingModal");
    const isEn = typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";

    // If modal is not yet created in DOM, inject dynamic Vezeeta modal container
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "confirmBookingModal";
      modal.className = "vezeeta-modal-overlay";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }

    const doctorName = summary.doctorName || "--";
    const doctorSpecialty = summary.doctorSpecialty || (isEn ? "Chest & Respiratory Consultant" : "استشاري الأمراض الصدرية والحساسية");
    const clinicName = summary.clinicName || (isEn ? "Specialized Chest Clinic" : "عيادة الصدر التخصصية");
    const dateTime = summary.dateTime || `${summary.date || ""} - ${summary.time || ""}`;
    const consultationType = summary.type || (isEn ? "Telehealth Video" : "فيديو عن بُعد");
    const patientName = state.selectedBeneficiaryName || summary.patientName || (isEn ? "Primary Patient" : "المريض الأساسي");
    const googleCalUrl = buildGoogleCalendarUrl(summary);

    modal.innerHTML = `
      <div class="vezeeta-modal-dialog">
        <div class="vezeeta-modal-header">
          <h3 class="vezeeta-modal-title">
            <span>📅</span> ${isEn ? "Review & Confirm Appointment" : "تأكيد تفاصيل حجز الموعد"}
          </h3>
          <button type="button" class="vezeeta-modal-close" id="btnVezeetaCloseModal" aria-label="${isEn ? "Close" : "إغلاق"}">✕</button>
        </div>
        <div class="vezeeta-modal-body">
          <div class="vezeeta-summary-recap">
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Doctor:" : "الطبيب المعالج:"}</span>
              <span class="vezeeta-recap-value" id="confirmBookingDoctor">${escapeHtml(doctorName)}</span>
            </div>
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Specialty:" : "التخصص:"}</span>
              <span class="vezeeta-recap-value" style="font-size:12px; color:var(--muted);">${escapeHtml(doctorSpecialty)}</span>
            </div>
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Clinic / Location:" : "العيادة / المقر:"}</span>
              <span class="vezeeta-recap-value" id="confirmBookingClinic">${escapeHtml(clinicName)}</span>
            </div>
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Appointment Time:" : "الموعد المحدد:"}</span>
              <span class="vezeeta-recap-value" id="confirmBookingTime" style="color:var(--teal, #0d9488);">${escapeHtml(dateTime)}</span>
            </div>
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Consultation Mode:" : "نوع الاستشارة:"}</span>
              <span class="vezeeta-recap-value" id="confirmBookingType">
                <span class="pill info" style="font-size:11px;">${escapeHtml(consultationType)}</span>
              </span>
            </div>
            ${summary.type === "video" || consultationType.includes("فيديو") || consultationType.toLowerCase().includes("video") ? `
              <div class="clinido-recap-commute-notice" style="margin-top: 6px; font-size: 11.5px; color: var(--teal, #0d9488); background: rgba(13,148,136,0.08); padding: 6px 10px; border-radius: 8px;">
                🚗 ${isEn ? "Remote consultation: Avoid commute traffic, secure video link sent to your phone." : "استشارة عن بُعد: توفر مشقة المواصلات، ورابط غرفة الفيديو المشفرة سيصلك لهاتفك."}
              </div>
            ` : (summary.type === "clinic" || consultationType.includes("عيادة") || consultationType.toLowerCase().includes("clinic") ? `
              <div class="clinido-recap-commute-notice" style="margin-top: 6px; font-size: 11.5px; color: #3b82f6; background: rgba(59,130,246,0.08); padding: 6px 10px; border-radius: 8px;">
                🏥 ${isEn ? "Dokki Branch (Near Metro) — Please arrive 10 mins prior." : "فرع الدقي (بالقرب من المترو) — يرجى الحضور قبل الموعد بـ 10 دقائق."}
              </div>
            ` : "")}
            <div class="vezeeta-recap-row">
              <span class="vezeeta-recap-label">${isEn ? "Beneficiary Patient:" : "المريض المستفيد:"}</span>
              <span class="vezeeta-recap-value" id="confirmBookingPatient">${escapeHtml(patientName)}</span>
            </div>
          </div>

          <div class="vezeeta-calendar-integration-box">
            <span>📅 ${isEn ? "Sync with your calendar:" : "إضافة تذكير فوري إلى تقويمك:"}</span>
            <a href="${googleCalUrl}" target="_blank" rel="noopener noreferrer" class="vezeeta-google-cal-btn">
              <span>+ Google Calendar</span>
            </a>
          </div>

          <div style="margin-bottom: 14px;">
            <label for="vezeetaModalNotes" style="display:block; margin-bottom:6px; font-weight:600; font-size:12.5px; color:var(--ink);">
              ${isEn ? "Reason for visit or clinical symptoms:" : "سبب الزيارة أو الأعراض التنفسية:"}
            </label>
            <input type="text" id="vezeetaModalNotes" class="form-control" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid var(--line); background:var(--surface-2); color:var(--ink); font-size:13px;" placeholder="${isEn ? "e.g. Persistent cough, shortness of breath, review report..." : "مثال: سعال مستمر، كتمة نفس عند المجهود، فحص وقائي..."}" value="${escapeHtml(summary.notes || "")}">
            
            <div class="vezeeta-quick-reasons">
              <span style="font-size:11px; color:var(--muted);">${isEn ? "Quick tags:" : "عبارات شائعة:"}</span>
              <button type="button" class="vezeeta-reason-chip" data-reason="متابعة سعال وكحة مستمرة">${isEn ? "Persistent Cough" : "سعال مستمر"}</button>
              <button type="button" class="vezeeta-reason-chip" data-reason="ضيق تنفس بعد المجهود">${isEn ? "Shortness of Breath" : "ضيق تنفس"}</button>
              <button type="button" class="vezeeta-reason-chip" data-reason="متابعة قياس أكسجين ونتائج الفحص">${isEn ? "Follow-up Oxygen & SpO2" : "متابعة قياس الأكسجين"}</button>
              <button type="button" class="vezeeta-reason-chip" data-reason="استشارة دورية لأمراض الحساسية">${isEn ? "Allergy Consultation" : "استشارة حساسية دورية"}</button>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:20px;">
            <button type="button" class="outline-button" id="btnVezeetaCancelModal" style="flex:1; padding:12px; justify-content:center;">
              ${isEn ? "Back" : "تعديل الموعد"}
            </button>
            <button type="button" class="solid-button" id="btnConfirmExecuteBooking" style="flex:2; padding:12px; justify-content:center; font-weight:700;">
              ✓ ${isEn ? "Confirm & Book Now" : "تأكيد الحجز النهائي"}
            </button>
          </div>
        </div>
      </div>
    `;

    // Bind Close Handlers
    const closeBtn = document.getElementById("btnVezeetaCloseModal");
    const cancelBtn = document.getElementById("btnVezeetaCancelModal");
    if (closeBtn) closeBtn.onclick = closeConfirmBookingModal;
    if (cancelBtn) cancelBtn.onclick = closeConfirmBookingModal;

    // Quick Chips Handlers
    modal.querySelectorAll(".vezeeta-reason-chip").forEach(chip => {
      chip.onclick = () => {
        const input = document.getElementById("vezeetaModalNotes");
        if (input) {
          input.value = chip.dataset.reason || "";
          input.focus();
        }
      };
    });

    // Confirm Execution Handler
    const confirmBtn = document.getElementById("btnConfirmExecuteBooking");
    if (confirmBtn && typeof onConfirm === "function") {
      confirmBtn.onclick = () => {
        const input = document.getElementById("vezeetaModalNotes");
        if (input) summary.notes = input.value.trim();
        closeConfirmBookingModal();
        onConfirm(summary);
      };
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

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function generateAppointmentDays(weekOffset = 0) {
    const days = [];
    const arDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const enDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const arMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const now = new Date();
    const startOffset = (now.getHours() >= 20 ? 1 : 0) + (weekOffset * 7);

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + startOffset + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const dayOfWeek = d.getDay();
      let labelAr = arDays[dayOfWeek];
      let labelEn = enDays[dayOfWeek];

      if (weekOffset === 0 && (now.getHours() < 20)) {
        if (i === 0) { labelAr = "اليوم"; labelEn = "Today"; }
        else if (i === 1) { labelAr = "غداً"; labelEn = "Tomorrow"; }
      } else if (weekOffset === 0 && (now.getHours() >= 20)) {
        if (i === 0) { labelAr = "غداً"; labelEn = "Tomorrow"; }
      }

      days.push({
        dateStr: dateStr,
        dayNumber: d.getDate(),
        dayOfWeek: dayOfWeek,
        labelAr: labelAr,
        labelEn: labelEn,
        fullLabelAr: `${arDays[dayOfWeek]} ${d.getDate()} ${arMonths[d.getMonth()]}`,
        fullLabelEn: `${enDays[dayOfWeek]}, ${d.getDate()} ${enMonths[d.getMonth()]}`
      });
    }
    return days;
  }

  /**
   * Sets the active linked clinical case/assessment dossier for appointment booking (Doctolib Model)
   */
  function setLinkedCase(caseData = null) {
    if (!caseData) {
      state.activeLinkedCase = null;
      return;
    }
    const spo2 = caseData.oxygenLevel != null
      ? caseData.oxygenLevel
      : (caseData.vitals?.oxygenSaturation || caseData.spo2 || null);

    state.activeLinkedCase = {
      caseId: caseData.caseId || caseData.id,
      assessmentId: caseData.assessmentId || caseData.id,
      patientName: caseData.patientName || null,
      oxygenLevel: spo2 != null ? Number(spo2) : null,
      diagnosis: caseData.diagnosis || caseData.recordedDiag || "تقييم تنفسي معتمد سريرياً",
      status: caseData.status || "approved",
      submittedAt: caseData.submittedAt || caseData.createdAt || new Date().toISOString(),
      clinicalNotes: caseData.clinicalNotes || caseData.notes || "",
      attached: true
    };
  }

  /**
   * Retrieves the current linked case dossier
   */
  function getLinkedCase() {
    return state.activeLinkedCase;
  }

  /**
   * Clears the active linked case dossier
   */
  function clearLinkedCase() {
    state.activeLinkedCase = null;
  }

  /**
   * Renders the Doctolib-style Attached Assessment Dossier card
   */
  function renderAttachedAssessmentDossier(containerId, isEn = false, onDetach = null) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const linked = state.activeLinkedCase;
    if (!linked || !linked.attached) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }

    el.style.display = "block";
    const spo2 = linked.oxygenLevel != null ? Number(linked.oxygenLevel) : null;
    let o2Class = "ok";
    if (spo2 != null) {
      if (spo2 < 90) o2Class = "danger";
      else if (spo2 <= 94) o2Class = "warn";
    }

    const diagnosisText = linked.diagnosis || (isEn ? "Clinically Certified Respiratory Assessment" : "تقييم تنفسي سريري معتمد");
    const caseIdShort = linked.caseId ? String(linked.caseId).slice(-6) : "";

    el.innerHTML = `
      <div class="doctolib-attached-dossier-card" role="region" aria-label="${isEn ? "Attached Certified Medical Dossier" : "ملف التقييم الطبي المعتمد المرفق"}">
        <div class="dossier-card-header">
          <div class="dossier-badge-row">
            <span class="dossier-badge-pill">
              <span class="dossier-icon">📑</span>
              <strong>${isEn ? "Pre-Visit Medical Dossier Attached" : "ملف التقييم الطبي المعتمد (مرفق تلقائياً)"}</strong>
            </span>
            <span class="dossier-verified-chip">
              ✓ ${isEn ? "Physician Review Ready" : "جاهز لاطلاع الطبيب"}
            </span>
          </div>
          <button type="button" class="dossier-detach-btn" id="btnDetachAssessmentDossier" title="${isEn ? "Detach Report" : "إلغاء إرفاق التقرير"}" aria-label="${isEn ? "Detach Report" : "إلغاء إرفاق التقرير"}">
            ✕ <span class="desktop-only">${isEn ? "Detach" : "إلغاء الإرفاق"}</span>
          </button>
        </div>

        <div class="dossier-card-body">
          <div class="dossier-vitals-row">
            ${spo2 != null ? `
              <div class="dossier-vital-item">
                <span class="dossier-vital-label">${isEn ? "Oxygen Saturation (SpO2):" : "نسبة تشبع الأكسجين:"}</span>
                <span class="pill ${o2Class}" style="font-weight: 700; font-size: 13px;">${spo2}%</span>
              </div>
            ` : ""}
            <div class="dossier-vital-item">
              <span class="dossier-vital-label">${isEn ? "Case Reference:" : "مرجع الحالة:"}</span>
              <span class="dossier-ref-code">#${caseIdShort || linked.caseId}</span>
            </div>
          </div>

          <div class="dossier-diag-row">
            <span class="dossier-diag-icon">🩺</span>
            <span class="dossier-diag-text">${diagnosisText}</span>
          </div>

          <p class="dossier-notice">
            ${isEn
              ? "ℹ️ This certified evaluation dossier will be transmitted directly to the attending physician prior to the consultation so they can review your respiratory findings in advance."
              : "ℹ️ سيتم إرفاق تقرير التقييم التنفسي المعتمد مباشرة بالموعد ليطلع عليه الطبيب المعالج ويدرس حالتك قبل بدء المقابلة السريرية."}
          </p>
        </div>

        <div class="dossier-card-footer">
          <button type="button" class="outline-button dossier-preview-btn" id="btnPreviewAttachedDossier" onclick="if (typeof openCaseReport === 'function') openCaseReport('${linked.caseId}')">
            <span>📄</span> ${isEn ? "Review Full Medical Report" : "معاينة التقرير الطبي المعتمد"}
          </button>
        </div>
      </div>
    `;

    const detachBtn = el.querySelector("#btnDetachAssessmentDossier");
    if (detachBtn) {
      detachBtn.onclick = () => {
        state.activeLinkedCase = null;
        renderAttachedAssessmentDossier(containerId, isEn, onDetach);
        if (typeof onDetach === "function") onDetach();
      };
    }
  }

  const AppointmentsUI = {
    state,
    buildGoogleCalendarUrl,
    renderDoctorFilterTabs,
    renderDoctorCard,
    renderDoctorShowcaseCard: renderDoctorCard,
    renderCalendarStrip,
    renderInteractiveCalendarStrip: renderCalendarStrip,
    generateAppointmentDays,
    renderGroupedSlots,
    renderBeneficiarySelector,
    openConfirmBookingModal,
    closeConfirmBookingModal,
    setLinkedCase,
    getLinkedCase,
    clearLinkedCase,
    renderAttachedAssessmentDossier,
    renderConsultationModeSelector,
    renderConsultationDetailsCard,
    getSelectedConsultationType,
    setSelectedConsultationType
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AppointmentsUI = AppointmentsUI;
  global.AppointmentsUI = AppointmentsUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppointmentsUI;
  }
})(typeof window !== "undefined" ? window : globalThis);
