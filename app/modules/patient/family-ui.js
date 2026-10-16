/**
 * Health Vibe AI - Family Profiles & Dependents UI Component
 * 
 * Provides responsive, touch-friendly UI components for switching, adding,
 * and managing family member medical profiles (CliniDo / Vezeeta benchmark).
 */

(function (global) {
  "use strict";

  const Service = () => global.HealthVibes?.FamilyProfilesService;
  const I18n = () => global.HealthVibes?.I18n || global.i18n;

  function t(key, fallback) {
    if (I18n() && typeof I18n().t === "function") {
      const res = I18n().t(key);
      if (res && res !== key) return res;
    }
    return fallback;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getActiveUserUid() {
    if (global.auth && global.auth.currentUser) {
      return global.auth.currentUser.uid;
    }
    if (typeof localStorage !== "undefined") {
      const localUid = localStorage.getItem("hv_user_uid") || localStorage.getItem("active_patient_uid");
      if (localUid) return localUid;
    }
    return "guest_patient";
  }

  function getPrimaryUserName() {
    if (global.auth && global.auth.currentUser) {
      return global.auth.currentUser.displayName || (global.auth.currentUser.email ? global.auth.currentUser.email.split("@")[0] : null);
    }
    return null;
  }

  /**
   * Renders the interactive profile switching bar.
   * @param {string|HTMLElement} container
   * @param {object} [options={}]
   */
  function renderFamilySwitcherBar(container, options = {}) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;

    const svc = Service();
    if (!svc) return;

    const uid = options.uid || getActiveUserUid();
    const isEn = (global.currentLanguage === "en");
    const primaryName = getPrimaryUserName() || (isEn ? "Me (Primary)" : "أنا (الملف الرئيسي)");
    const activeContext = svc.getActiveProfile(uid, { displayName: primaryName });
    const members = svc.getFamilyMembers(uid);

    const primaryActive = activeContext.isPrimary;

    let html = `
      <div class="family-switcher-wrapper" role="region" aria-label="${escapeHtml(t("family.switcherAria", isEn ? "Family Profiles Switcher" : "محدد الملفات العائلية"))}">
        <div class="family-switcher-header">
          <div class="family-switcher-title">
            <span class="family-icon">👨‍👩‍👧‍👦</span>
            <strong>${escapeHtml(t("family.switcherTitle", isEn ? "Family Medical Profiles" : "الملفات الطبية للعائلة"))}</strong>
            <span class="family-badge-count">${members.length + 1}</span>
          </div>
          <button type="button" class="family-add-btn" id="btnOpenAddFamilyMember" onclick="HealthVibes.FamilyProfilesUI.openFamilyModal()" aria-label="${escapeHtml(t("family.addMember", isEn ? "Add family member" : "إضافة فرد من العائلة"))}">
            <span aria-hidden="true">➕</span>
            <span>${escapeHtml(t("family.addMemberShort", isEn ? "Add Member" : "إضافة فرد"))}</span>
          </button>
        </div>

        <div class="family-chips-scroll" role="tablist" aria-orientation="horizontal">
          <!-- Primary Account Chip -->
          <button type="button" 
            role="tab"
            aria-selected="${primaryActive ? "true" : "false"}"
            class="family-chip ${primaryActive ? "active" : ""}" 
            data-member-id="primary"
            onclick="HealthVibes.FamilyProfilesUI.selectProfile('primary')">
            <span class="family-chip-avatar avatar-primary">👤</span>
            <div class="family-chip-meta">
              <span class="family-chip-name">${escapeHtml(primaryName)}</span>
              <span class="family-chip-relation">${escapeHtml(t("family.primaryLabel", isEn ? "Primary Profile" : "الملف الرئيسي"))}</span>
            </div>
            ${primaryActive ? '<span class="family-active-dot" aria-hidden="true"></span>' : ""}
          </button>
    `;

    members.forEach(member => {
      const isActive = !primaryActive && activeContext.memberId === member.id;
      const avatarMeta = svc.getAvatarMeta(member);
      const relLabel = isEn ? (svc.RELATIONSHIPS[member.relationship]?.en || member.relationship) : (svc.RELATIONSHIPS[member.relationship]?.ar || member.relationship);
      const ageStr = member.calculatedAge !== null ? `${member.calculatedAge} ${isEn ? "yrs" : "سنة"}` : "";
      const categoryLabel = isEn ? avatarMeta.badgeLabelEn : avatarMeta.badgeLabelAr;

      html += `
        <button type="button" 
          role="tab"
          aria-selected="${isActive ? "true" : "false"}"
          class="family-chip category-${escapeHtml(avatarMeta.category)} ${isActive ? "active" : ""}" 
          data-member-id="${escapeHtml(member.id)}"
          onclick="HealthVibes.FamilyProfilesUI.selectProfile('${escapeHtml(member.id)}')">
          <span class="family-chip-avatar avatar-${escapeHtml(avatarMeta.category)}">${avatarMeta.emoji}</span>
          <div class="family-chip-meta">
            <div class="family-chip-top">
              <span class="family-chip-name">${escapeHtml(member.name)}</span>
              <span class="family-cat-tag cat-${escapeHtml(avatarMeta.category)}">${escapeHtml(categoryLabel)}</span>
            </div>
            <span class="family-chip-relation">${escapeHtml(relLabel)}${ageStr ? ` • ${escapeHtml(ageStr)}` : ""}</span>
          </div>
          ${isActive ? '<span class="family-active-dot" aria-hidden="true"></span>' : ""}
        </button>
      `;
    });

    html += `
        </div>
      </div>
    `;

    el.innerHTML = html;
  }

  /**
   * Renders the active profile alert banner when managing a family member.
   * @param {string|HTMLElement} container
   */
  function renderActiveFamilyBanner(container) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;

    const svc = Service();
    if (!svc) return;

    const uid = getActiveUserUid();
    const isEn = (global.currentLanguage === "en");
    const activeContext = svc.getActiveProfile(uid);

    if (activeContext.isPrimary) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }

    const member = activeContext.profile;
    const avatarMeta = svc.getAvatarMeta(member);
    const relLabel = isEn ? (svc.RELATIONSHIPS[member.relationship]?.en || member.relationship) : (svc.RELATIONSHIPS[member.relationship]?.ar || member.relationship);
    const ageStr = member.calculatedAge !== null ? `${member.calculatedAge} ${isEn ? "years old" : "سنة"}` : "";

    el.style.display = "block";
    el.innerHTML = `
      <div class="family-active-banner" role="status" aria-live="polite">
        <div class="family-banner-content">
          <div class="family-banner-avatar">${avatarMeta.emoji}</div>
          <div class="family-banner-text">
            <strong>
              ${isEn 
                ? `Active Medical Profile: ${escapeHtml(member.name)} (${escapeHtml(relLabel)}${ageStr ? `, ${escapeHtml(ageStr)}` : ""})` 
                : `الملف الطبي النشط: ${escapeHtml(member.name)} (${escapeHtml(relLabel)}${ageStr ? `، ${escapeHtml(ageStr)}` : ""})`}
            </strong>
            <p>
              ${isEn 
                ? "Clinical vitals, assessments, and prescriptions are strictly isolated and recorded for this family member." 
                : "القياسات الحيوية والتقييمات والتقارير الطبية مفصولة تماماً ومسجلة باسم هذا الفرد لحمايته سريرياً."}
            </p>
          </div>
        </div>
        <button type="button" class="family-switch-back-btn" onclick="HealthVibes.FamilyProfilesUI.selectProfile('primary')">
          <span>👤</span>
          <span>${escapeHtml(t("family.switchBack", isEn ? "Switch to My Profile" : "العودة لحسابي"))}</span>
        </button>
      </div>
    `;
  }

  /**
   * Renders the family members management card inside the Medical Profile screen.
   * @param {string|HTMLElement} container
   */
  function renderFamilyManagementSection(container) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;

    const svc = Service();
    if (!svc) return;

    const uid = getActiveUserUid();
    const isEn = (global.currentLanguage === "en");
    const activeContext = svc.getActiveProfile(uid);
    const members = svc.getFamilyMembers(uid);

    let html = `
      <div class="profile-section-card family-management-card" style="background: var(--surface-2, rgba(0,0,0,0.02)); border: 1px solid var(--line, rgba(0,0,0,0.08)); border-radius: 12px; padding: 16px; margin-top: 14px;">
        <div class="family-mgmt-head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <div>
            <h4 style="margin: 0; font-size: 15px; color: var(--teal); display: flex; align-items: center; gap: 8px;">
              <span>👨‍👩‍👧‍👦</span> <span>${escapeHtml(t("family.sectionTitle", isEn ? "Family Profiles & Dependents" : "أفراد العائلة والتابعون"))}</span>
            </h4>
            <small style="color: var(--muted); font-size: 12px;">
              ${escapeHtml(t("family.sectionSubtitle", isEn ? "Manage isolated medical profiles for elderly parents or children under one phone." : "إدارة السجلات الطبية لوالديك المسنين أو أطفالك من نفس الهاتف مع الفصل التام لسجلاتهم."))}
            </small>
          </div>
          <button type="button" class="solid-button" onclick="HealthVibes.FamilyProfilesUI.openFamilyModal()" style="font-size: 13px; padding: 8px 16px;">
            <span>➕</span> <span>${escapeHtml(t("family.addMember", isEn ? "Add Family Member" : "إضافة فرد من العائلة"))}</span>
          </button>
        </div>
    `;

    if (members.length === 0) {
      html += `
        <div class="family-empty-state" style="text-align: center; padding: 24px 16px; background: rgba(0,0,0,0.01); border: 1px dashed var(--line); border-radius: 10px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🏡</div>
          <strong style="display: block; font-size: 14px; margin-bottom: 4px;">${escapeHtml(t("family.emptyTitle", isEn ? "No family profiles added yet" : "لم يتم إضافة أفراد من العائلة بعد"))}</strong>
          <p style="font-size: 12.5px; color: var(--muted); margin: 0 0 14px; max-width: 440px; margin-inline: auto;">
            ${escapeHtml(t("family.emptyDesc", isEn ? "Add your elderly parents or children to track their oxygen, clinical symptoms, and appointments with separated records." : "أضف والديك المسنين أو أطفالك لمتابعة مستوى الأكسجين وأعراضهم التنفسية وحجوزاتهم بسجلات مستقلة تماماً."))}
          </p>
          <button type="button" class="soft-button" onclick="HealthVibes.FamilyProfilesUI.openFamilyModal()" style="font-size: 13px;">
            ➕ ${escapeHtml(t("family.addFirstMember", isEn ? "Add First Dependent" : "إضافة أول فرد الآن"))}
          </button>
        </div>
      `;
    } else {
      html += `<div class="family-members-grid">`;
      members.forEach(member => {
        const isActive = !activeContext.isPrimary && activeContext.memberId === member.id;
        const avatarMeta = svc.getAvatarMeta(member);
        const relLabel = isEn ? (svc.RELATIONSHIPS[member.relationship]?.en || member.relationship) : (svc.RELATIONSHIPS[member.relationship]?.ar || member.relationship);
        const ageStr = member.calculatedAge !== null ? `${member.calculatedAge} ${isEn ? "years old" : "سنة"}` : "";
        const chronicStr = member.chronicConditions?.length ? member.chronicConditions.join(", ") : (isEn ? "None recorded" : "لا يوجد مسجل");
        const allergiesStr = member.allergies?.length ? member.allergies.join(", ") : (isEn ? "None recorded" : "لا يوجد مسجل");

        html += `
          <div class="family-member-card ${isActive ? "card-is-active" : ""}">
            <div class="family-member-card-header">
              <div class="family-member-card-identity">
                <span class="family-member-avatar avatar-${escapeHtml(avatarMeta.category)}">${avatarMeta.emoji}</span>
                <div>
                  <strong class="family-member-name">${escapeHtml(member.name)}</strong>
                  <div class="family-member-tags">
                    <span class="pill info" style="font-size: 11px;">${escapeHtml(relLabel)}</span>
                    ${ageStr ? `<span class="pill ok" style="font-size: 11px;">${escapeHtml(ageStr)}</span>` : ""}
                    ${avatarMeta.category === "elderly" ? `<span class="pill alert" style="font-size: 11px;">👴 ${isEn ? "Elderly" : "كبار سن"}</span>` : ""}
                    ${avatarMeta.category === "child" ? `<span class="pill alert" style="font-size: 11px;">👶 ${isEn ? "Child" : "طفل"}</span>` : ""}
                  </div>
                </div>
              </div>
              ${isActive ? `<span class="pill ok" style="font-size: 11px;">✓ ${isEn ? "Active Profile" : "الملف النشط حالياً"}</span>` : ""}
            </div>

            <div class="family-member-details-grid">
              <div><small>${isEn ? "Blood Type:" : "فصيلة الدم:"}</small> <span>${escapeHtml(member.bloodType || "unknown")}</span></div>
              <div><small>${isEn ? "Sex:" : "الجنس:"}</small> <span>${escapeHtml(member.biologicalSex === "female" ? (isEn ? "Female" : "أنثى") : (isEn ? "Male" : "ذكر"))}</span></div>
              <div class="full-width"><small>${isEn ? "Chronic Conditions:" : "الأمراض المزمنة:"}</small> <span>${escapeHtml(chronicStr)}</span></div>
              <div class="full-width"><small>${isEn ? "Allergies:" : "الحساسية:"}</small> <span>${escapeHtml(allergiesStr)}</span></div>
            </div>

            <div class="family-member-card-actions">
              ${isActive 
                ? `<button type="button" class="soft-button" onclick="HealthVibes.FamilyProfilesUI.selectProfile('primary')" style="flex: 2;">👤 ${isEn ? "Switch to My Account" : "العودة لحسابي الرئيسي"}</button>`
                : `<button type="button" class="solid-button" onclick="HealthVibes.FamilyProfilesUI.selectProfile('${escapeHtml(member.id)}')" style="flex: 2;">🩺 ${isEn ? "Switch to Profile" : "تفعيل هذا الملف"}</button>`
              }
              <button type="button" class="outline-button" onclick="HealthVibes.FamilyProfilesUI.openFamilyModal('${escapeHtml(member.id)}')" title="${isEn ? "Edit Details" : "تعديل البيانات"}" aria-label="${isEn ? "Edit Details" : "تعديل البيانات"}">
                ✏️
              </button>
              <button type="button" class="outline-button btn-danger" onclick="HealthVibes.FamilyProfilesUI.confirmRemoveMember('${escapeHtml(member.id)}', '${escapeHtml(member.name)}')" title="${isEn ? "Remove Dependent" : "إزالة الفرد"}" aria-label="${isEn ? "Remove Dependent" : "إزالة الفرد"}">
                🗑️
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    el.innerHTML = html;
  }

  /**
   * Switches the active profile context and refreshes page UI.
   * @param {string} memberIdOrPrimary 
   */
  function selectProfile(memberIdOrPrimary) {
    const svc = Service();
    if (!svc) return;

    const uid = getActiveUserUid();
    const primaryName = getPrimaryUserName();
    const target = (memberIdOrPrimary === "primary" || !memberIdOrPrimary) ? null : memberIdOrPrimary;
    const active = svc.setActiveProfile(uid, target, { displayName: primaryName });

    // Refresh all mounted components
    renderAll();

    // If toast helper available, alert user
    if (typeof global.showToast === "function") {
      const isEn = (global.currentLanguage === "en");
      if (active.isPrimary) {
        global.showToast(isEn ? "Switched to your primary medical profile." : "تم التبديل إلى ملفك الطبي الرئيسي.");
      } else {
        const rel = isEn ? (svc.RELATIONSHIPS[active.profile.relationship]?.en || active.profile.relationship) : (svc.RELATIONSHIPS[active.profile.relationship]?.ar || active.profile.relationship);
        global.showToast(isEn ? `Active profile: ${active.profile.name} (${rel})` : `الملف النشط: ${active.profile.name} (${rel})`);
      }
    }
  }

  /**
   * Refreshes all family profile UI elements in the DOM.
   */
  function renderAll() {
    const switcherEls = document.querySelectorAll(".family-switcher-mount, #familySwitcherContainer, #patientFamilySwitcher");
    switcherEls.forEach(el => renderFamilySwitcherBar(el));

    const bannerEls = document.querySelectorAll(".family-active-banner-mount, #familyActiveBannerContainer, #patientFamilyActiveBanner");
    bannerEls.forEach(el => renderActiveFamilyBanner(el));

    const mgmtEls = document.querySelectorAll(".family-mgmt-mount, #familyManagementContainer, #profileFamilyManagementContainer");
    mgmtEls.forEach(el => renderFamilyManagementSection(el));
  }

  /**
   * Opens the family member add/edit modal dialog.
   * @param {string|null} [memberIdToEdit=null]
   */
  function openFamilyModal(memberIdToEdit = null) {
    let modal = document.getElementById("familyMemberModal");
    if (!modal) {
      injectModal();
      modal = document.getElementById("familyMemberModal");
    }

    const svc = Service();
    const uid = getActiveUserUid();
    const isEn = (global.currentLanguage === "en");

    const titleEl = document.getElementById("familyModalTitle");
    const editIdEl = document.getElementById("familyModalMemberId");
    const nameEl = document.getElementById("familyModalName");
    const relEl = document.getElementById("familyModalRelationship");
    const dobEl = document.getElementById("familyModalDob");
    const ageBadge = document.getElementById("familyModalAgeBadge");
    const sexEl = document.getElementById("familyModalSex");
    const bloodEl = document.getElementById("familyModalBloodType");
    const heightEl = document.getElementById("familyModalHeight");
    const weightEl = document.getElementById("familyModalWeight");
    const bmiBadge = document.getElementById("familyModalBmiBadge");
    const chronicEl = document.getElementById("familyModalChronic");
    const allergiesEl = document.getElementById("familyModalAllergies");
    const medEl = document.getElementById("familyModalMedications");
    const nidEl = document.getElementById("familyModalNationalId");
    const notesEl = document.getElementById("familyModalNotes");

    if (memberIdToEdit && svc) {
      const member = svc.getFamilyMemberById(uid, memberIdToEdit);
      if (member) {
        if (titleEl) titleEl.textContent = isEn ? `Edit Family Member: ${member.name}` : `تعديل بيانات: ${member.name}`;
        if (editIdEl) editIdEl.value = member.id;
        if (nameEl) nameEl.value = member.name || "";
        if (relEl) relEl.value = member.relationship || "other";
        if (dobEl) dobEl.value = member.dateOfBirth || "";
        if (sexEl) sexEl.value = member.biologicalSex || "not_specified";
        if (bloodEl) bloodEl.value = member.bloodType || "unknown";
        if (heightEl) heightEl.value = member.heightCm || "";
        if (weightEl) weightEl.value = member.weightKg || "";
        if (chronicEl) chronicEl.value = member.chronicConditions?.join(", ") || "";
        if (allergiesEl) allergiesEl.value = member.allergies?.join(", ") || "";
        if (medEl) medEl.value = member.currentMedications?.join(", ") || "";
        if (nidEl) nidEl.value = member.nationalId || "";
        if (notesEl) notesEl.value = member.notes || "";
      }
    } else {
      if (titleEl) titleEl.textContent = isEn ? "Add Family Member (Elderly / Child / Spouse)" : "إضافة فرد من العائلة (والد مسن / طفل / زوجة)";
      if (editIdEl) editIdEl.value = "";
      if (nameEl) nameEl.value = "";
      if (relEl) relEl.value = "father";
      if (dobEl) dobEl.value = "";
      if (sexEl) sexEl.value = "male";
      if (bloodEl) bloodEl.value = "unknown";
      if (heightEl) heightEl.value = "";
      if (weightEl) weightEl.value = "";
      if (chronicEl) chronicEl.value = "";
      if (allergiesEl) allergiesEl.value = "";
      if (medEl) medEl.value = "";
      if (nidEl) nidEl.value = "";
      if (notesEl) notesEl.value = "";
    }

    updateModalAgeAndBmi();
    modal.style.display = "flex";
    modal.classList.add("modal-open");
    if (nameEl) nameEl.focus();
  }

  /**
   * Closes the family member modal.
   */
  function closeFamilyModal() {
    const modal = document.getElementById("familyMemberModal");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("modal-open");
    }
  }

  /**
   * Updates dynamic age badge and BMI in modal.
   */
  function updateModalAgeAndBmi() {
    const svc = Service();
    if (!svc) return;

    const isEn = (global.currentLanguage === "en");
    const dobEl = document.getElementById("familyModalDob");
    const ageBadge = document.getElementById("familyModalAgeBadge");
    const heightEl = document.getElementById("familyModalHeight");
    const weightEl = document.getElementById("familyModalWeight");
    const bmiBadge = document.getElementById("familyModalBmiBadge");

    if (dobEl && ageBadge) {
      const age = svc.calculateAge(dobEl.value);
      if (age !== null) {
        let tag = "";
        if (age >= 60) tag = ` (${isEn ? "Elderly" : "كبار سن"})`;
        else if (age < 18) tag = ` (${isEn ? "Child" : "طفل"})`;
        ageBadge.textContent = `${isEn ? "Age:" : "العمر:"} ${age} ${isEn ? "years" : "سنة"}${tag}`;
        ageBadge.style.display = "inline-block";
      } else {
        ageBadge.style.display = "none";
      }
    }

    if (heightEl && weightEl && bmiBadge) {
      const bmi = svc.calculateBmi(heightEl.value, weightEl.value);
      if (bmi !== null) {
        bmiBadge.textContent = `BMI: ${bmi}`;
        bmiBadge.style.display = "inline-block";
      } else {
        bmiBadge.style.display = "none";
      }
    }
  }

  /**
   * Handles submitting the family member form from the modal.
   */
  function handleModalSubmit() {
    const svc = Service();
    if (!svc) return;

    const uid = getActiveUserUid();
    const isEn = (global.currentLanguage === "en");

    const editId = document.getElementById("familyModalMemberId")?.value;
    const name = document.getElementById("familyModalName")?.value;
    const relationship = document.getElementById("familyModalRelationship")?.value;
    const dateOfBirth = document.getElementById("familyModalDob")?.value;
    const biologicalSex = document.getElementById("familyModalSex")?.value;
    const bloodType = document.getElementById("familyModalBloodType")?.value;
    const heightCm = document.getElementById("familyModalHeight")?.value;
    const weightKg = document.getElementById("familyModalWeight")?.value;
    const chronicConditions = document.getElementById("familyModalChronic")?.value;
    const allergies = document.getElementById("familyModalAllergies")?.value;
    const currentMedications = document.getElementById("familyModalMedications")?.value;
    const nationalId = document.getElementById("familyModalNationalId")?.value;
    const notes = document.getElementById("familyModalNotes")?.value;

    const payload = {
      name,
      relationship,
      dateOfBirth,
      biologicalSex,
      bloodType,
      heightCm,
      weightKg,
      chronicConditions,
      allergies,
      currentMedications,
      nationalId,
      notes
    };

    let result;
    if (editId) {
      result = svc.updateFamilyMember(uid, editId, payload);
    } else {
      result = svc.addFamilyMember(uid, payload);
    }

    if (!result.success) {
      if (typeof global.showToast === "function") {
        global.showToast(result.error || (isEn ? "Please review form fields." : "يرجى مراجعة بيانات الإدخال."));
      } else {
        alert(result.error);
      }
      return;
    }

    closeFamilyModal();
    renderAll();

    if (typeof global.showToast === "function") {
      const msg = editId 
        ? (isEn ? "Family member profile updated." : "تم تحديث بيانات فرد العائلة بنجاح.")
        : (isEn ? `Added ${payload.name} to your family profiles.` : `تمت إضافة ${payload.name} إلى ملفك العائلي بنجاح.`);
      global.showToast(msg);
    }
  }

  /**
   * Prompts user and removes family member if confirmed.
   * @param {string} memberId 
   * @param {string} memberName 
   */
  function confirmRemoveMember(memberId, memberName) {
    const isEn = (global.currentLanguage === "en");
    const confirmed = confirm(
      isEn 
        ? `Are you sure you want to remove "${memberName}" from your family profiles? Past medical records remain securely archived.`
        : `هل أنت متأكد من رغبتك في إزالة "${memberName}" من ملف العائلة؟ ستبقى السجلات الطبية السابقة مؤرشفة بأمان.`
    );
    if (!confirmed) return;

    const svc = Service();
    if (!svc) return;

    const uid = getActiveUserUid();
    const res = svc.removeFamilyMember(uid, memberId);
    if (res.success) {
      renderAll();
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? `Removed ${memberName} from family profiles.` : `تمت إزالة ${memberName} من الحساب.`);
      }
    }
  }

  /**
   * Injects modal markup into document body if not already present.
   */
  function injectModal() {
    if (document.getElementById("familyMemberModal")) return;
    const isEn = (global.currentLanguage === "en");

    const modalHtml = `
      <div id="familyMemberModal" class="family-modal-backdrop" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="familyModalTitle">
        <div class="family-modal-dialog">
          <div class="family-modal-header">
            <h3 id="familyModalTitle" style="margin: 0; font-size: 16px; color: var(--teal); display: flex; align-items: center; gap: 8px;">
              <span>👨‍👩‍👧‍👦</span> <span>إضافة فرد من العائلة</span>
            </h3>
            <button type="button" class="family-modal-close" onclick="HealthVibes.FamilyProfilesUI.closeFamilyModal()" aria-label="${isEn ? "Close" : "إغلاق"}">✕</button>
          </div>

          <div class="family-modal-body">
            <input type="hidden" id="familyModalMemberId">

            <div class="family-form-row">
              <div class="family-form-field">
                <label for="familyModalName">الاسم بالكامل (Full Name) *</label>
                <input id="familyModalName" type="text" placeholder="مثال: أحمد محمد (الوالد)" required>
              </div>

              <div class="family-form-field">
                <label for="familyModalRelationship">صلة القرابة (Relationship) *</label>
                <select id="familyModalRelationship">
                  <option value="father">أب - والد مسن (Father)</option>
                  <option value="mother">أم - والدة مسنة (Mother)</option>
                  <option value="son">ابن (Son)</option>
                  <option value="daughter">ابنة (Daughter)</option>
                  <option value="infant">رضيع / طفل صغير (Infant)</option>
                  <option value="spouse">زوج / زوجة (Spouse)</option>
                  <option value="grandparent">جد / جدة (Grandparent)</option>
                  <option value="other">تابع / قريب (Other)</option>
                </select>
              </div>
            </div>

            <div class="family-form-row">
              <div class="family-form-field">
                <label for="familyModalDob" style="display: flex; justify-content: space-between; align-items: center;">
                  <span>تاريخ الميلاد (Date of Birth)</span>
                  <span id="familyModalAgeBadge" class="pill ok" style="display: none; font-size: 11px;"></span>
                </label>
                <input id="familyModalDob" type="date" onchange="HealthVibes.FamilyProfilesUI.updateModalAgeAndBmi()">
              </div>

              <div class="family-form-field">
                <label for="familyModalSex">الجنس البيولوجي (Biological Sex)</label>
                <select id="familyModalSex">
                  <option value="male">ذكر (Male)</option>
                  <option value="female">أنثى (Female)</option>
                </select>
              </div>
            </div>

            <div class="family-form-row three-cols">
              <div class="family-form-field">
                <label for="familyModalBloodType">فصيلة الدم</label>
                <select id="familyModalBloodType">
                  <option value="unknown">غير محدد</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div class="family-form-field">
                <label for="familyModalHeight">الطول (سم)</label>
                <input id="familyModalHeight" type="number" min="30" max="250" placeholder="170" oninput="HealthVibes.FamilyProfilesUI.updateModalAgeAndBmi()">
              </div>

              <div class="family-form-field">
                <label for="familyModalWeight" style="display: flex; justify-content: space-between; align-items: center;">
                  <span>الوزن (كجم)</span>
                  <span id="familyModalBmiBadge" class="pill info" style="display: none; font-size: 10px;"></span>
                </label>
                <input id="familyModalWeight" type="number" min="2" max="300" placeholder="70" oninput="HealthVibes.FamilyProfilesUI.updateModalAgeAndBmi()">
              </div>
            </div>

            <div class="family-form-field">
              <label for="familyModalChronic">الأمراض المزمنة (إن وجدت)</label>
              <input id="familyModalChronic" type="text" placeholder="مثال: ضغط الدم، ربو، سكري نمط 2">
            </div>

            <div class="family-form-field">
              <label for="familyModalAllergies">الحساسية الدوائية أو الغذائية</label>
              <input id="familyModalAllergies" type="text" placeholder="مثال: بنسلين، مكسرات، حساسية أسبرين">
            </div>

            <div class="family-form-field">
              <label for="familyModalMedications">الأدوية المداوم عليها والجرعات</label>
              <input id="familyModalMedications" type="text" placeholder="مثال: فنتولين، دواء ضغط 10 مجم">
            </div>

            <div class="family-form-row">
              <div class="family-form-field">
                <label for="familyModalNationalId">الرقم القومي / الهوية (اختياري)</label>
                <input id="familyModalNationalId" type="text" placeholder="10-14 أرقام">
              </div>

              <div class="family-form-field">
                <label for="familyModalNotes">ملاحظات رعاية خاصة</label>
                <input id="familyModalNotes" type="text" placeholder="مثال: صعوبة بالحركة، يحتاج مساعدة في القياس">
              </div>
            </div>
          </div>

          <div class="family-modal-footer">
            <button type="button" class="outline-button" onclick="HealthVibes.FamilyProfilesUI.closeFamilyModal()">
              إلغاء
            </button>
            <button type="button" class="solid-button" onclick="HealthVibes.FamilyProfilesUI.handleModalSubmit()">
              💾 حفظ البيانات وتثبيت الملف
            </button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement("div");
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
  }

  /**
   * Initializes family profiles UI hooks.
   */
  function init() {
    if (typeof document === "undefined") return;

    injectModal();

    // Hook on window load or DOMContentLoaded
    const setup = () => {
      renderAll();
      const svc = Service();
      if (svc) {
        svc.restoreActiveProfile(getActiveUserUid());
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", setup);
    } else {
      setup();
    }

    // Live update on language change
    window.addEventListener("languageChanged", () => {
      renderAll();
    });
  }

  const FamilyProfilesUI = {
    renderFamilySwitcherBar,
    renderActiveFamilyBanner,
    renderFamilyManagementSection,
    selectProfile,
    renderAll,
    openFamilyModal,
    closeFamilyModal,
    updateModalAgeAndBmi,
    handleModalSubmit,
    confirmRemoveMember,
    init
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.FamilyProfilesUI = FamilyProfilesUI;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FamilyProfilesUI;
  }

  // Auto-init in browser environment
  if (typeof window !== "undefined") {
    FamilyProfilesUI.init();
  }
})(typeof window !== "undefined" ? window : globalThis);
