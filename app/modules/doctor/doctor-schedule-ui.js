/**
 * Health Vibe AI - Doctor Schedule & Branch Manager UI Module (TabeebHub Benchmark)
 * 
 * Manages:
 * 1. Multi-branch switcher (Dokki Central, Heliopolis, Telehealth, Alexandria).
 * 2. Day-of-week interactive toggle buttons (Sun - Sat) with touch-ergonomic targets.
 * 3. Working shifts editor (Morning, Evening, Custom) with real-time validation.
 * 4. Consultation duration selector (15, 20, 30, 45, 60 min) and buffer times.
 * 5. Break periods & clinical rounds manager.
 * 6. Doctor leaves & vacations manager with immediate slot blocking.
 * 7. Live interactive slot preview card with instant recalculation on any setting change.
 * 8. Quick schedule presets for common Egyptian clinic patterns.
 * 9. Bilingual parity (Arabic & English), RTL/LTR alignment, and WCAG accessibility.
 */

(function (global) {
  "use strict";

  const DoctorScheduleService = global.HealthVibes?.DoctorScheduleService || (typeof require === "function" ? require("./doctor-schedule-service") : null);

  // UI State
  const state = {
    branches: [],
    activeBranchId: "branch_dokki_central",
    previewDate: getTomorrowDateString(),
    leaves: [],
    validationErrors: [],
    isDirty: false,
    doctorId: "dr_mona"
  };

  /**
   * Helper: Get formatted tomorrow date string "YYYY-MM-DD"
   */
  function getTomorrowDateString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Helper: Escape HTML
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Get Active Branch object
   */
  function getActiveBranch() {
    return state.branches.find(b => b.id === state.activeBranchId) || state.branches[0];
  }

  /**
   * Initialize state from service
   */
  function initScheduleState() {
    if (!DoctorScheduleService) return;
    state.branches = DoctorScheduleService.getDoctorBranches(state.doctorId);
    state.leaves = DoctorScheduleService.getDoctorLeaves(state.doctorId);
    if (!state.branches.some(b => b.id === state.activeBranchId)) {
      state.activeBranchId = state.branches[0]?.id || "branch_dokki_central";
    }
  }

  /**
   * Render Main Doctor Schedule Manager Screen
   */
  function renderDoctorScheduleManager(mountElement = "screen-doctor-schedule") {
    const container = typeof mountElement === "string" ? document.getElementById(mountElement) : mountElement;
    if (!container) return;

    initScheduleState();
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const activeBranch = getActiveBranch();
    const branchSchedule = activeBranch ? activeBranch.schedule : null;

    // Validate current schedule
    const validation = DoctorScheduleService ? DoctorScheduleService.validateSchedule(branchSchedule) : { valid: true, errors: [] };
    state.validationErrors = validation.errors;

    // Live slot preview calculation
    const slotPreview = DoctorScheduleService && branchSchedule
      ? DoctorScheduleService.generateSlotsForDate(branchSchedule, state.previewDate, state.leaves, isEn)
      : { available: false, slots: [] };

    container.innerHTML = `
      <div class="doctor-schedule-container" dir="${isEn ? 'ltr' : 'rtl'}">
        
        <!-- Hero Header Bar -->
        <header class="doctor-schedule-hero" role="region" aria-label="${isEn ? 'Doctor Schedule Header' : 'رأس جدول المواعيد'}">
          <div class="doctor-schedule-hero-title">
            <span style="font-size: 28px;" aria-hidden="true">🗓️</span>
            <div>
              <h2>${isEn ? 'Doctor Schedule & Branch Manager' : 'إدارة جدول مواعيد الطبيب والفروع'}</h2>
              <p class="doctor-schedule-hero-desc">
                ${isEn 
                  ? 'Configure weekly working days, shifts, and consultation duration per clinic branch (TabeebHub standard).'
                  : 'تحديد أيام وساعات العمل وفترات الكشف لكل فرع وعيادة مع معاينة فورية للمواعيد المتاحة للحجز (معيار طبيب هب).'}
              </p>
            </div>
          </div>
          
          <div class="doctor-schedule-actions-bar">
            <button type="button" class="outline-button" id="btnResetSchedule" onclick="window.HealthVibes.DoctorScheduleUI.resetCurrentBranch()" style="min-height: 44px; padding: 8px 16px;">
              <span>🔄</span> ${isEn ? 'Reset Default' : 'استعادة الافتراضي'}
            </button>
            <button type="button" class="solid-button" id="btnSaveSchedule" onclick="window.HealthVibes.DoctorScheduleUI.saveCurrentBranchSchedule()" style="min-height: 44px; padding: 8px 22px; font-weight: 700; background: var(--teal); border-color: var(--teal);">
              <span>💾</span> ${isEn ? 'Save & Publish Schedule' : 'حفظ وتعميم الجدول'}
            </button>
          </div>
        </header>

        <!-- Validation Error Banner (if any) -->
        ${state.validationErrors.length > 0 ? `
          <div class="schedule-validation-alert" role="alert">
            <span style="font-size: 18px;">⚠️</span>
            <div>
              <strong>${isEn ? 'Schedule Validation Notices:' : 'تنبيهات تدقيق الجدول:'}</strong>
              <ul style="margin: 4px 0 0; padding-inline-start: 20px;">
                ${state.validationErrors.map(e => `<li>${isEn ? escapeHtml(e.messageEn) : escapeHtml(e.messageAr)}</li>`).join('')}
              </ul>
            </div>
          </div>
        ` : ''}

        <!-- Branch Selector Navigation Tabs -->
        <section aria-labelledby="branchNavTitle">
          <h3 id="branchNavTitle" class="sr-only">${isEn ? 'Select Clinic Branch' : 'اختر الفرع'}</h3>
          <div class="schedule-branch-nav" role="tablist" aria-label="${isEn ? 'Clinic Branches' : 'فروع العيادة'}">
            ${state.branches.map(branch => {
              const isActive = branch.id === state.activeBranchId;
              const bName = isEn ? branch.nameEn : branch.nameAr;
              const bLoc = isEn ? branch.cityEn : branch.cityAr;
              const bBadge = branch.isPrimary 
                ? (isEn ? 'Primary' : 'الفرع الرئيسي')
                : (branch.isOnline ? (isEn ? 'Online Video' : 'عن بُعد') : (isEn ? 'Branch' : 'فرع'));
              return `
                <button type="button" 
                  role="tab" 
                  id="tab-branch-${escapeHtml(branch.id)}"
                  class="schedule-branch-card ${isActive ? 'active' : ''}" 
                  aria-selected="${isActive ? 'true' : 'false'}"
                  onclick="window.HealthVibes.DoctorScheduleUI.selectBranch('${escapeHtml(branch.id)}')">
                  <div class="schedule-branch-card-header">
                    <span class="schedule-branch-badge pill ${isActive ? 'ok' : ''}">${bBadge}</span>
                    <span style="font-size: 14px;">${branch.isOnline ? '💻' : '🏥'}</span>
                  </div>
                  <strong class="schedule-branch-card-name" title="${escapeHtml(bName)}">${escapeHtml(bName)}</strong>
                  <span class="schedule-branch-card-loc">📍 ${escapeHtml(bLoc)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>

        <!-- Quick Presets Toolbar -->
        <section class="schedule-section-card" style="padding: 14px 18px; background: rgba(9, 184, 182, 0.05); border-color: rgba(9, 184, 182, 0.2);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">⚡</span>
              <strong style="font-size: 13.5px; color: var(--ink);">${isEn ? 'Quick Egyptian Clinic Presets:' : 'قوالب جاهزة لعيادات مصر:'}</strong>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${DoctorScheduleService.SCHEDULE_PRESETS.map(preset => `
                <button type="button" 
                  class="soft-button" 
                  style="min-height: 38px; padding: 6px 12px; font-size: 12.5px;"
                  onclick="window.HealthVibes.DoctorScheduleUI.applyPreset('${escapeHtml(preset.id)}')">
                  ${isEn ? escapeHtml(preset.nameEn) : escapeHtml(preset.nameAr)}
                </button>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- Main Split Workspace: Settings & Live Preview -->
        <div class="doctor-schedule-grid">
          
          <!-- LEFT / MAIN: Settings Cards -->
          <div style="display: flex; flex-direction: column; gap: 20px;">
            
            <!-- 1. Working Days of Week -->
            <section class="schedule-section-card" aria-labelledby="workingDaysTitle">
              <div class="schedule-section-title">
                <h3 id="workingDaysTitle">
                  <span>📅</span> ${isEn ? 'Working Days of Week' : 'أيام العمل الأسبوعية'}
                </h3>
                <span class="pill ok">${(branchSchedule?.workingDays || []).length} ${isEn ? 'Days Active' : 'أيام نشطة'}</span>
              </div>
              <p class="schedule-section-hint">
                ${isEn 
                  ? 'Tap days to toggle clinic opening days. Patients can only book on active days.' 
                  : 'اضغط على أيام الأسبوع لتفعيل أو إيقاف استقبال المرضى في هذا الفرع.'}
              </p>
              
              <div class="working-days-pill-group" role="group" aria-label="${isEn ? 'Days of Week Toggle Group' : 'مجموعة أيام الأسبوع'}">
                ${DoctorScheduleService.DAYS_OF_WEEK.map(d => {
                  const isActive = (branchSchedule?.workingDays || []).includes(d.dayIndex);
                  return `
                    <button type="button" 
                      class="working-day-toggle-btn ${isActive ? 'active' : ''}"
                      aria-pressed="${isActive ? 'true' : 'false'}"
                      id="dayBtn_${d.dayIndex}"
                      onclick="window.HealthVibes.DoctorScheduleUI.toggleWorkingDay(${d.dayIndex})">
                      <span class="working-day-name">${isEn ? d.shortEn : d.shortAr}</span>
                      <span class="working-day-status">${isActive ? (isEn ? 'Open' : 'مفتوح') : (isEn ? 'Off' : 'عطلة')}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </section>

            <!-- 2. Daily Shifts & Hours -->
            <section class="schedule-section-card" aria-labelledby="shiftsTitle">
              <div class="schedule-section-title">
                <h3 id="shiftsTitle">
                  <span>⏰</span> ${isEn ? 'Working Shifts & Operating Hours' : 'فترات وساعات العمل اليومية'}
                </h3>
                <span class="pill">${(branchSchedule?.shifts || []).length} ${isEn ? 'Shifts' : 'فترات'}</span>
              </div>
              <p class="schedule-section-hint">
                ${isEn 
                  ? 'Set morning and evening clinic shifts. End time must be after start time.' 
                  : 'حدد مواعيد بدء ونهاية الفترات الصباحية والمسائية. يمكنك إضافة فترات متعددة.'}
              </p>

              <div class="shifts-list-container" id="shiftsContainer">
                ${(branchSchedule?.shifts || []).map((shift, idx) => `
                  <div class="shift-card-row" id="shiftRow_${idx}">
                    <div class="shift-info-col">
                      <span style="font-size: 16px;">⏱️</span>
                      <strong style="font-size: 13.5px; color: var(--ink);">
                        ${isEn ? (shift.nameEn || `Shift ${idx + 1}`) : (shift.nameAr || `فترة العمل ${idx + 1}`)}
                      </strong>
                    </div>

                    <div class="shift-time-inputs">
                      <div class="shift-time-field">
                        <label for="shiftStart_${idx}">${isEn ? 'Start Time' : 'وقت البدء'}</label>
                        <input type="time" 
                          id="shiftStart_${idx}" 
                          class="schedule-time-picker" 
                          value="${escapeHtml(shift.start)}" 
                          step="900"
                          onchange="window.HealthVibes.DoctorScheduleUI.updateShiftTime(${idx}, 'start', this.value)"
                          aria-label="${isEn ? `Shift ${idx + 1} Start Time` : `وقت بدء فترة العمل ${idx + 1}`}">
                      </div>

                      <span style="align-self: flex-end; padding-bottom: 12px; color: var(--muted); font-weight: 700;">→</span>

                      <div class="shift-time-field">
                        <label for="shiftEnd_${idx}">${isEn ? 'End Time' : 'وقت النهاية'}</label>
                        <input type="time" 
                          id="shiftEnd_${idx}" 
                          class="schedule-time-picker" 
                          value="${escapeHtml(shift.end)}" 
                          step="900"
                          onchange="window.HealthVibes.DoctorScheduleUI.updateShiftTime(${idx}, 'end', this.value)"
                          aria-label="${isEn ? `Shift ${idx + 1} End Time` : `وقت نهاية فترة العمل ${idx + 1}`}">
                      </div>

                      ${(branchSchedule?.shifts || []).length > 1 ? `
                        <button type="button" 
                          class="btn-remove-shift" 
                          title="${isEn ? 'Remove Shift' : 'حذف الفترة'}" 
                          aria-label="${isEn ? `Remove Shift ${idx + 1}` : `حذف فترة العمل ${idx + 1}`}"
                          onclick="window.HealthVibes.DoctorScheduleUI.removeShift(${idx})">
                          🗑️
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}

                <button type="button" class="btn-add-shift" id="btnAddShift" onclick="window.HealthVibes.DoctorScheduleUI.addShift()">
                  <span>➕</span> ${isEn ? 'Add Another Shift (e.g. Evening Clinic)' : 'إضافة فترة عمل إضافية (مثل عيادة مسائية)'}
                </button>
              </div>
            </section>

            <!-- 3. Consultation Duration & Buffer Time -->
            <section class="schedule-section-card" aria-labelledby="durationTitle">
              <div class="schedule-section-title">
                <h3 id="durationTitle">
                  <span>⏱️</span> ${isEn ? 'Consultation Duration & Patient Buffer' : 'مدة الكشف والوقت الفاصل'}
                </h3>
                <span class="pill ok">${branchSchedule?.slotDurationMinutes || 30} ${isEn ? 'Minutes' : 'دقيقة'}</span>
              </div>
              <p class="schedule-section-hint">
                ${isEn 
                  ? 'Choose the allocated duration for each patient appointment slot.' 
                  : 'اختر مدة الكشف لكل موعد. يتم تقسيم فترات العمل تلقائياً بناءً على هذه المدة.'}
              </p>

              <div>
                <label style="font-size: 12px; color: var(--muted); font-weight: 700; display: block; margin-bottom: 8px;">
                  ${isEn ? 'Slot Duration (Minutes):' : 'مدة الموعد (بالدقائق):'}
                </label>
                <div class="duration-pills-group" role="group" aria-label="${isEn ? 'Slot Duration Options' : 'خيارات مدة الكشف'}">
                  ${DoctorScheduleService.DURATION_OPTIONS.map(duration => {
                    const isSelected = (branchSchedule?.slotDurationMinutes || 30) === duration;
                    return `
                      <button type="button" 
                        class="duration-pill-btn ${isSelected ? 'active' : ''}" 
                        aria-pressed="${isSelected ? 'true' : 'false'}"
                        onclick="window.HealthVibes.DoctorScheduleUI.setDuration(${duration})">
                        <span>⏳</span> ${duration} ${isEn ? 'min' : 'دقيقة'}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div style="margin-top: 10px;">
                <label style="font-size: 12px; color: var(--muted); font-weight: 700; display: block; margin-bottom: 8px;">
                  ${isEn ? 'Buffer Between Appointments (Minutes):' : 'الوقت الفاصل بين المواعيد (استراحة تعقيم):'}
                </label>
                <div class="duration-pills-group" role="group" aria-label="${isEn ? 'Buffer Options' : 'خيارات الوقت الفاصل'}">
                  ${DoctorScheduleService.BUFFER_OPTIONS.map(buf => {
                    const isSelected = (branchSchedule?.bufferMinutes || 0) === buf;
                    return `
                      <button type="button" 
                        class="duration-pill-btn ${isSelected ? 'active' : ''}" 
                        aria-pressed="${isSelected ? 'true' : 'false'}"
                        onclick="window.HealthVibes.DoctorScheduleUI.setBuffer(${buf})">
                        ${buf === 0 ? (isEn ? 'No Buffer' : 'بدون فاصل') : `${buf} ${isEn ? 'min buffer' : 'دقيقة فاصل'}`}
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            </section>

            <!-- 4. Break Periods & Clinical Rounds -->
            <section class="schedule-section-card" aria-labelledby="breaksTitle">
              <div class="schedule-section-title">
                <h3 id="breaksTitle">
                  <span>☕</span> ${isEn ? 'Break Periods & Clinical Rounds' : 'فترات الراحة والمرور السريري'}
                </h3>
                <span class="pill">${(branchSchedule?.breakPeriods || []).length} ${isEn ? 'Breaks' : 'فترات راحة'}</span>
              </div>
              <p class="schedule-section-hint">
                ${isEn 
                  ? 'Slots during break periods are automatically blocked from patient booking.' 
                  : 'يتم استبعاد أوقات الراحة والمرور السريري تلقائياً من مواعيد الحجز المتاحة للمرضى.'}
              </p>

              <div class="shifts-list-container" id="breaksContainer">
                ${(branchSchedule?.breakPeriods || []).length === 0 ? `
                  <div style="padding: 12px; text-align: center; color: var(--muted); font-size: 13px;">
                    ${isEn ? 'No break periods configured for this branch.' : 'لا توجد فترات راحة مسجلة لهذا الفرع.'}
                  </div>
                ` : (branchSchedule.breakPeriods.map((brk, idx) => `
                  <div class="shift-card-row" id="breakRow_${idx}">
                    <div class="shift-info-col">
                      <span style="font-size: 16px;">🏥</span>
                      <strong style="font-size: 13px; color: var(--ink);">
                        ${isEn ? (brk.labelEn || brk.labelAr || 'Break') : (brk.labelAr || brk.labelEn || 'فترة استراحة')}
                      </strong>
                    </div>

                    <div class="shift-time-inputs">
                      <div class="shift-time-field">
                        <label>${isEn ? 'Start' : 'البدء'}</label>
                        <input type="time" class="schedule-time-picker" value="${escapeHtml(brk.start)}"
                          onchange="window.HealthVibes.DoctorScheduleUI.updateBreakTime(${idx}, 'start', this.value)"
                          aria-label="${isEn ? `Break ${idx + 1} Start` : `بدء الاستراحة ${idx + 1}`}">
                      </div>
                      <span style="align-self: flex-end; padding-bottom: 12px; color: var(--muted);">→</span>
                      <div class="shift-time-field">
                        <label>${isEn ? 'End' : 'النهاية'}</label>
                        <input type="time" class="schedule-time-picker" value="${escapeHtml(brk.end)}"
                          onchange="window.HealthVibes.DoctorScheduleUI.updateBreakTime(${idx}, 'end', this.value)"
                          aria-label="${isEn ? `Break ${idx + 1} End` : `نهاية الاستراحة ${idx + 1}`}">
                      </div>
                      <button type="button" class="btn-remove-shift" 
                        title="${isEn ? 'Remove Break' : 'حذف الاستراحة'}"
                        aria-label="${isEn ? `Remove Break ${idx + 1}` : `حذف الاستراحة ${idx + 1}`}"
                        onclick="window.HealthVibes.DoctorScheduleUI.removeBreak(${idx})">
                        🗑️
                      </button>
                    </div>
                  </div>
                `)).join('')}

                <button type="button" class="btn-add-shift" id="btnAddBreak" onclick="window.HealthVibes.DoctorScheduleUI.addBreak()">
                  <span>➕</span> ${isEn ? 'Add Break Period (e.g. 1:00 PM - 3:00 PM)' : 'إضافة فترة راحة أو مرور سريري'}
                </button>
              </div>
            </section>

            <!-- 5. Vacations & Approved Leaves -->
            <section class="schedule-section-card" aria-labelledby="leavesTitle">
              <div class="schedule-section-title">
                <h3 id="leavesTitle">
                  <span>🏖️</span> ${isEn ? 'Doctor Leaves & Scheduled Vacations' : 'الإجازات والعطلات المعتمدة'}
                </h3>
                <span class="pill danger">${state.leaves.length} ${isEn ? 'Leaves' : 'إجازات'}</span>
              </div>
              <p class="schedule-section-hint">
                ${isEn 
                  ? 'All branches are automatically closed on approved leave dates with patient notices.' 
                  : 'يتم إغلاق الحجز تلقائياً عبر جميع الفروع خلال تواريخ الإجازات المعتمدة.'}
              </p>

              <div class="leaves-card-list">
                ${state.leaves.length === 0 ? `
                  <div style="padding: 10px; text-align: center; color: var(--muted); font-size: 13px;">
                    ${isEn ? 'No scheduled leaves found.' : 'لا توجد إجازات قادمة مسجلة.'}
                  </div>
                ` : state.leaves.map(l => `
                  <div class="leave-item-row" id="leaveRow_${escapeHtml(l.id)}">
                    <div class="leave-info-col">
                      <strong class="leave-reason-text">${isEn ? (l.reason || l.reasonAr) : (l.reasonAr || l.reason)}</strong>
                      <span class="leave-dates-text">📅 ${escapeHtml(l.startDate)} ${isEn ? 'to' : 'إلى'} ${escapeHtml(l.endDate)} (${escapeHtml(l.type)})</span>
                    </div>
                    <button type="button" class="btn-remove-shift" 
                      style="min-height: 38px; min-width: 38px;"
                      title="${isEn ? 'Cancel Leave' : 'إلغاء الإجازة'}"
                      aria-label="${isEn ? `Cancel leave ${l.startDate}` : `إلغاء إجازة ${l.startDate}`}"
                      onclick="window.HealthVibes.DoctorScheduleUI.deleteLeave('${escapeHtml(l.id)}')">
                      🗑️
                    </button>
                  </div>
                `).join('')}

                <!-- Quick Add Leave Form -->
                <div style="background: var(--surface-2); border-radius: 12px; padding: 12px 14px; margin-top: 8px;">
                  <strong style="font-size: 12.5px; display: block; margin-bottom: 8px; color: var(--ink);">
                    ${isEn ? 'Schedule New Leave / Vacation:' : 'تسجيل إجازة جديدة:'}
                  </strong>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                    <div class="shift-time-field" style="flex: 1; min-width: 120px;">
                      <label for="newLeaveStart">${isEn ? 'Start Date' : 'تاريخ البدء'}</label>
                      <input type="date" id="newLeaveStart" class="schedule-time-picker" value="${state.previewDate}">
                    </div>
                    <div class="shift-time-field" style="flex: 1; min-width: 120px;">
                      <label for="newLeaveEnd">${isEn ? 'End Date' : 'تاريخ الانتهاء'}</label>
                      <input type="date" id="newLeaveEnd" class="schedule-time-picker" value="${state.previewDate}">
                    </div>
                    <div class="shift-time-field" style="flex: 1.5; min-width: 140px;">
                      <label for="newLeaveReason">${isEn ? 'Reason / Event' : 'السبب أو المناسبة'}</label>
                      <input type="text" id="newLeaveReason" class="schedule-time-picker" placeholder="${isEn ? 'e.g. Conference' : 'مثال: مؤتمر طبي أو عطلة سنوية'}">
                    </div>
                    <button type="button" class="solid-button" id="btnAddLeaveBtn" onclick="window.HealthVibes.DoctorScheduleUI.submitNewLeave()" style="min-height: 44px; padding: 8px 16px;">
                      <span>➕</span> ${isEn ? 'Add Leave' : 'إضافة'}
                    </button>
                  </div>
                </div>

              </div>
            </section>

          </div>

          <!-- RIGHT / SIDEBAR: Live Booking Slots Preview Panel -->
          <aside class="schedule-preview-panel" aria-labelledby="livePreviewTitle">
            <div class="schedule-section-title">
              <h3 id="livePreviewTitle">
                <span>👁️</span> ${isEn ? 'Live Slots Preview' : 'معاينة حية للمواعيد'}
              </h3>
              <span class="pill ok">${activeBranch?.shortNameAr || 'الفرع'}</span>
            </div>

            <!-- Date Picker for Preview -->
            <div class="preview-date-header">
              <label for="previewDatePicker" style="font-size: 12px; font-weight: 700; color: var(--muted);">
                ${isEn ? 'Select Preview Date:' : 'اختر تاريخ المعاينة:'}
              </label>
              <input type="date" 
                id="previewDatePicker" 
                class="preview-date-input" 
                value="${escapeHtml(state.previewDate)}"
                onchange="window.HealthVibes.DoctorScheduleUI.setPreviewDate(this.value)"
                aria-label="${isEn ? 'Select preview date for slot generation' : 'اختر تاريخ المعاينة لحساب المواعيد'}">
            </div>

            <!-- Capacity Metrics Card -->
            <div class="preview-metrics-banner">
              <div class="preview-metrics-item">
                <span class="preview-metrics-label">${isEn ? 'Total Capacity' : 'إجمالي المواعيد'}</span>
                <span class="preview-metrics-value" id="previewCapacityVal" style="color: var(--teal);">${slotPreview.totalCapacity || 0}</span>
              </div>
              <div class="preview-metrics-item">
                <span class="preview-metrics-label">${isEn ? 'Morning Slots' : 'صباحية'}</span>
                <span class="preview-metrics-value" id="previewMorningVal" style="color: #f59e0b;">${slotPreview.morningCount || 0}</span>
              </div>
              <div class="preview-metrics-item">
                <span class="preview-metrics-label">${isEn ? 'Evening Slots' : 'مسائية'}</span>
                <span class="preview-metrics-value" id="previewEveningVal" style="color: #3b82f6;">${slotPreview.eveningCount || 0}</span>
              </div>
            </div>

            <!-- Slots Grid List -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong style="font-size: 12.5px; color: var(--ink);">
                  ${isEn ? 'Generated Booking Slots for Patients:' : 'المواعيد التي ستظهر للمرضى في هذا اليوم:'}
                </strong>
                <span style="font-size: 11px; color: var(--muted);">
                  ${slotPreview.slots.length} ${isEn ? 'slots' : 'موعد'}
                </span>
              </div>

              ${!slotPreview.available ? `
                <div style="background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 18px 14px; text-align: center; color: var(--muted); font-size: 13px;">
                  <span style="font-size: 24px; display: block; margin-bottom: 6px;">🚫</span>
                  <strong style="color: #ef4444; display: block; margin-bottom: 4px;">
                    ${isEn ? 'No Booking Slots Available' : 'لا تتوفر مواعيد حجز'}
                  </strong>
                  <span>${isEn ? escapeHtml(slotPreview.reasonEn) : escapeHtml(slotPreview.reasonAr)}</span>
                </div>
              ` : `
                <div class="preview-slots-grid" id="previewSlotsGrid" role="list" aria-label="${isEn ? 'Generated appointment slots' : 'المواعيد المتاحة'}">
                  ${slotPreview.slots.map(s => `
                    <div class="preview-slot-chip ${s.isMorning ? 'morning' : 'evening'}" role="listitem">
                      ${isEn ? escapeHtml(s.timeEn) : escapeHtml(s.timeAr)}
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <div style="font-size: 11.5px; color: var(--muted); line-height: 1.4; border-top: 1px solid var(--line); padding-top: 10px;">
              💡 ${isEn 
                ? 'TabeebHub Smart Scheduling automatically generates real-time slots according to your shift rules and branch capacity.' 
                : 'نظام طبيب هب الذكي يقوم بتوليد وحماية مواعيد الكشف آلياً حسب ساعات وفترات عمل كل فرع ويمنع التضارب.'}
            </div>

          </aside>

        </div>

      </div>
    `;
  }

  // ===========================================================================
  // INTERACTION HANDLERS
  // ===========================================================================

  function selectBranch(branchId) {
    state.activeBranchId = branchId;
    renderDoctorScheduleManager();
  }

  function toggleWorkingDay(dayIndex) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule) return;

    const days = branch.schedule.workingDays || [];
    const idx = days.indexOf(dayIndex);
    if (idx >= 0) {
      if (days.length <= 1) {
        if (typeof showToast === "function") {
          showToast(currentLanguage === "en" ? "At least one working day must remain active." : "يجب الإبقاء على يوم عمل واحد على الأقل.");
        }
        return;
      }
      days.splice(idx, 1);
    } else {
      days.push(dayIndex);
      days.sort((a, b) => a - b);
    }
    branch.schedule.workingDays = days;
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function updateShiftTime(shiftIndex, field, value) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule || !branch.schedule.shifts[shiftIndex]) return;
    branch.schedule.shifts[shiftIndex][field] = value;
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function addShift() {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule) return;
    const isEn = currentLanguage === "en";

    // Default new shift to evening if not already present
    const newShift = {
      id: `shift_${Date.now()}`,
      nameAr: "فترة عمل إضافية",
      nameEn: "Additional Shift",
      start: "17:00",
      end: "21:00"
    };
    branch.schedule.shifts = branch.schedule.shifts || [];
    branch.schedule.shifts.push(newShift);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function removeShift(shiftIndex) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule || (branch.schedule.shifts || []).length <= 1) {
      if (typeof showToast === "function") {
        showToast(currentLanguage === "en" ? "At least one shift is required." : "يجب الإبقاء على فترة عمل واحدة على الأقل.");
      }
      return;
    }
    branch.schedule.shifts.splice(shiftIndex, 1);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function setDuration(durationMinutes) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule) return;
    branch.schedule.slotDurationMinutes = Number(durationMinutes);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function setBuffer(bufferMinutes) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule) return;
    branch.schedule.bufferMinutes = Number(bufferMinutes);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function updateBreakTime(breakIndex, field, value) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule || !branch.schedule.breakPeriods[breakIndex]) return;
    branch.schedule.breakPeriods[breakIndex][field] = value;
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function addBreak() {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule) return;
    const newBreak = {
      id: `brk_${Date.now()}`,
      labelAr: "فترة استراحة / مرور سريري",
      labelEn: "Clinical Rounds & Break",
      start: "14:00",
      end: "15:30"
    };
    branch.schedule.breakPeriods = branch.schedule.breakPeriods || [];
    branch.schedule.breakPeriods.push(newBreak);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function removeBreak(breakIndex) {
    const branch = getActiveBranch();
    if (!branch || !branch.schedule || !branch.schedule.breakPeriods) return;
    branch.schedule.breakPeriods.splice(breakIndex, 1);
    state.isDirty = true;
    renderDoctorScheduleManager();
  }

  function setPreviewDate(dateStr) {
    state.previewDate = dateStr;
    renderDoctorScheduleManager();
  }

  function applyPreset(presetId) {
    const branch = getActiveBranch();
    if (!branch || !DoctorScheduleService) return;
    DoctorScheduleService.applyPresetToBranch(branch, presetId);
    state.isDirty = true;
    renderDoctorScheduleManager();
    if (typeof showToast === "function") {
      showToast(currentLanguage === "en" ? "Preset schedule applied." : "تم تطبيق القالب النموذجي بنجاح.");
    }
  }

  function resetCurrentBranch() {
    if (!DoctorScheduleService) return;
    const defaultBranch = DoctorScheduleService.DEFAULT_BRANCHES.find(b => b.id === state.activeBranchId);
    if (!defaultBranch) return;

    const current = getActiveBranch();
    if (current) {
      current.schedule = JSON.parse(JSON.stringify(defaultBranch.schedule));
    }
    state.isDirty = true;
    renderDoctorScheduleManager();
    if (typeof showToast === "function") {
      showToast(currentLanguage === "en" ? "Branch schedule reset to default." : "تمت استعادة إعدادات الفرع الافتراضية.");
    }
  }

  function saveCurrentBranchSchedule() {
    const branch = getActiveBranch();
    if (!branch || !DoctorScheduleService) return;

    const validation = DoctorScheduleService.validateSchedule(branch.schedule);
    if (!validation.valid) {
      const msg = currentLanguage === "en" ? validation.errors[0]?.messageEn : validation.errors[0]?.messageAr;
      if (typeof showToast === "function") showToast(`⚠️ ${msg}`);
      renderDoctorScheduleManager();
      return;
    }

    DoctorScheduleService.saveDoctorBranches(state.doctorId, state.branches);
    state.isDirty = false;

    // Optional background sync with server
    try {
      if (typeof fetch === "function") {
        fetch("/api/doctor/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workingHours: branch.schedule
          })
        }).catch(() => {});
      }
    } catch (_) {}

    if (typeof showToast === "function") {
      showToast(currentLanguage === "en" ? "✅ Schedule saved and published successfully." : "✅ تم حفظ وتعميم جدول المواعيد بنجاح.");
    }
    renderDoctorScheduleManager();
  }

  function submitNewLeave() {
    const startInput = document.getElementById("newLeaveStart");
    const endInput = document.getElementById("newLeaveEnd");
    const reasonInput = document.getElementById("newLeaveReason");

    const startDate = startInput?.value;
    const endDate = endInput?.value;
    const reason = reasonInput?.value || (currentLanguage === "en" ? "Approved Vacation" : "إجازة معتمدة");

    if (!startDate || !endDate) {
      if (typeof showToast === "function") {
        showToast(currentLanguage === "en" ? "Start and end dates are required." : "يرجى تحديد تاريخي بدء وانتهاء الإجازة.");
      }
      return;
    }

    if (endDate < startDate) {
      if (typeof showToast === "function") {
        showToast(currentLanguage === "en" ? "End date cannot precede start date." : "تاريخ الانتهاء لا يمكن أن يسبق تاريخ البدء.");
      }
      return;
    }

    try {
      DoctorScheduleService.addDoctorLeave(state.doctorId, {
        startDate,
        endDate,
        type: "annual",
        reason,
        reasonAr: reason
      });
      state.leaves = DoctorScheduleService.getDoctorLeaves(state.doctorId);
      renderDoctorScheduleManager();
      if (typeof showToast === "function") {
        showToast(currentLanguage === "en" ? "✅ Leave registered. Slots blocked." : "✅ تم تسجيل الإجازة وإيقاف الحجوزات بنجاح.");
      }
    } catch (err) {
      if (typeof showToast === "function") showToast(`⚠️ ${err.message}`);
    }
  }

  function deleteLeave(leaveId) {
    if (!DoctorScheduleService) return;
    DoctorScheduleService.removeDoctorLeave(state.doctorId, leaveId);
    state.leaves = DoctorScheduleService.getDoctorLeaves(state.doctorId);
    renderDoctorScheduleManager();
    if (typeof showToast === "function") {
      showToast(currentLanguage === "en" ? "Leave cancelled." : "تم إلغاء الإجازة وإعادة إتاحة الحجز.");
    }
  }

  // Export UI API
  const DoctorScheduleUI = {
    state,
    initScheduleState,
    renderDoctorScheduleManager,
    selectBranch,
    toggleWorkingDay,
    updateShiftTime,
    addShift,
    removeShift,
    setDuration,
    setBuffer,
    updateBreakTime,
    addBreak,
    removeBreak,
    setPreviewDate,
    applyPreset,
    resetCurrentBranch,
    saveCurrentBranchSchedule,
    submitNewLeave,
    deleteLeave
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = DoctorScheduleUI;
  }
  if (typeof global !== "undefined") {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.DoctorScheduleUI = DoctorScheduleUI;
  }
})(typeof window !== "undefined" ? window : global);
