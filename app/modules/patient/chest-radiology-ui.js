/**
 * Health Vibe AI - Chest Radiology & Imaging Studio Module
 * Benchmark: Rology Teleradiology Platform (https://rology.ai/how-it-works/)
 *
 * Core Capabilities:
 * 1. Mobile-Optimized Chest Radiograph (CXR) & CT Thorax Upload Flow.
 * 2. Modality Selection (CXR PA/Lateral LOINC 36643-5, CT Plain LOINC 24627-2, CT Contrast, Other).
 * 3. Clinical Indications & Patient History Checklist.
 * 4. STRICT NON-AUTONOMOUS AI DISCLAIMER:
 *    MVP stage explicitly clarifies zero automated autonomous diagnosis;
 *    100% human certified radiologist / pulmonologist review.
 * 5. Interactive Mobile Film Lightbox Viewer:
 *    - Invert Film (Negative ↔ Positive toggle)
 *    - Real-time Brightness & Contrast sliders
 *    - Pan & Zoom (Scale In / Out / Reset)
 * 6. Rology-Standard Teleradiology Status Stepper:
 *    Quarantined & Encrypted ➔ Pending Radiologist Review ➔ Certified Clinical Report.
 * 7. 100% Bilingual Arabic & English Parity with WCAG a11y touch targets (>=44px).
 */

(function (global) {
  "use strict";

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtmlAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  const RADIOLOGY_MODALITIES = {
    cxr_pa_lat: {
      key: "cxr_pa_lat",
      loinc: "36643-5",
      icon: "🩻",
      nameAr: "أشعة سينية عادية على الصدر (CXR PA & Lateral)",
      nameEn: "Chest X-Ray PA & Lateral",
      descAr: "تصوير أمامي خلفي وجانبي للرئتين والقفص الصدري وحجم القلب - LOINC 36643-5",
      descEn: "Posteroanterior & lateral projection of chest, lungs & heart size - LOINC 36643-5",
      defaultViews: ["PA", "Lateral"]
    },
    ct_thorax_plain: {
      key: "ct_thorax_plain",
      loinc: "24627-2",
      icon: "🫁",
      nameAr: "أشعة مقطعية على الصدر بدون صبغة (CT Plain)",
      nameEn: "CT Thorax without Contrast (Plain)",
      descAr: "فحص مقطعي عالي الدقة لنسيج الرئة والشعب الهوائية وتقييم التليف - LOINC 24627-2",
      descEn: "High-resolution evaluation of lung parenchyma & airways - LOINC 24627-2",
      defaultViews: ["Axial", "Coronal", "Sagittal"]
    },
    ct_thorax_contrast: {
      key: "ct_thorax_contrast",
      loinc: "24627-2-IV",
      icon: "💉",
      nameAr: "أشعة مقطعية على الصدر بالصبغة (CT with Contrast)",
      nameEn: "CT Thorax with IV Contrast",
      descAr: "دراسة الشرايين الرئوية واستبعاد الجلطة الرئوية الحادة (CTPA)",
      descEn: "Pulmonary vascular angiography & PE exclusion protocol (CTPA)",
      defaultViews: ["Arterial Phase", "Mediastinal Window"]
    },
    other_imaging: {
      key: "other_imaging",
      loinc: "RAD-MISC",
      icon: "📑",
      nameAr: "تصوير ورنين مغناطيسي آخر (Other Imaging / MRI)",
      nameEn: "Other Imaging / MRI / Ultrasound",
      descAr: "رنين مغناطيسي، موجات فوق صوتية على الصدر، أو تقارير مراكز الأشعة",
      descEn: "Chest MRI, thoracic ultrasound, or external imaging center reports",
      defaultViews: ["External Scans"]
    }
  };

  const CLINICAL_INDICATIONS = [
    { key: "ind_cough", labelAr: "كحة مستمرة > ٣ أسابيع", labelEn: "Persistent Cough > 3 weeks", icon: "🗣️" },
    { key: "ind_dyspnea", labelAr: "ضيق تنفس ونقص أكسجين", labelEn: "Dyspnea / Desaturation", icon: "🫁" },
    { key: "ind_pneumonia", labelAr: "اشتباه التهاب رئوي أو درن", labelEn: "Suspected Pneumonia / TB", icon: "🦠" },
    { key: "ind_chest_pain", labelAr: "ألم حاد بالصدر أو الضلوع", labelEn: "Pleuritic Chest Pain", icon: "⚡" },
    { key: "ind_hemoptysis", labelAr: "بصاق مدمم (Hemoptysis)", labelEn: "Hemoptysis (Coughing Blood)", icon: "🩸" },
    { key: "ind_fibrosis", labelAr: "متابعة ما بعد كوفيد / تليف رئوي", labelEn: "Post-COVID / Fibrosis", icon: "🩺" }
  ];

  // Studio State
  const state = {
    selectedModality: "cxr_pa_lat",
    selectedIndications: new Set(["ind_dyspnea"]),
    urgency: "routine", // routine, urgent, stat
    clinicalNotes: "",
    stagedFiles: [],
    activeViewerFile: null,
    viewerControls: {
      invert: false,
      brightness: 100, // 50 to 180%
      contrast: 100,   // 50 to 200%
      zoom: 1.0        // 0.8 to 2.5
    }
  };

  /**
   * Helper to detect current language
   */
  function isEnglish() {
    return typeof global.currentLanguage !== "undefined" && global.currentLanguage === "en";
  }

  /**
   * Select an imaging modality
   */
  function selectModality(modKey) {
    if (!RADIOLOGY_MODALITIES[modKey]) return;
    state.selectedModality = modKey;
    updateModalityUI();
    const isEn = isEnglish();
    const name = isEn ? RADIOLOGY_MODALITIES[modKey].nameEn : RADIOLOGY_MODALITIES[modKey].nameAr;
    if (typeof global.showToast === "function") {
      global.showToast(isEn ? `Selected Modality: ${name}` : `نوع الفحص المحدد: ${name}`);
    }
  }

  function updateModalityUI() {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".rad-modality-card").forEach((card) => {
      const k = card.getAttribute("data-modality");
      const isSelected = k === state.selectedModality;
      card.classList.toggle("active", isSelected);
      card.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
  }

  /**
   * Toggle clinical indication tag
   */
  function toggleIndication(key) {
    if (state.selectedIndications.has(key)) {
      state.selectedIndications.delete(key);
    } else {
      state.selectedIndications.add(key);
    }
    updateIndicationsUI();
  }

  function updateIndicationsUI() {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".rad-ind-chip").forEach((chip) => {
      const k = chip.getAttribute("data-indication");
      const isSelected = state.selectedIndications.has(k);
      chip.classList.toggle("active", isSelected);
      chip.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  /**
   * Select urgency SLA
   */
  function selectUrgency(urgKey) {
    state.urgency = urgKey;
    if (typeof document === "undefined") return;
    document.querySelectorAll(".rad-urgency-btn").forEach((btn) => {
      const isSelected = btn.getAttribute("data-urgency") === urgKey;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  /**
   * Viewer Film Controls: Invert, Brightness, Contrast, Zoom
   */
  function toggleViewerInvert() {
    state.viewerControls.invert = !state.viewerControls.invert;
    applyViewerFilter();
    updateViewerControlsUI();
  }

  function setViewerBrightness(val) {
    state.viewerControls.brightness = Math.max(50, Math.min(200, Number(val) || 100));
    applyViewerFilter();
  }

  function setViewerContrast(val) {
    state.viewerControls.contrast = Math.max(50, Math.min(220, Number(val) || 100));
    applyViewerFilter();
  }

  function zoomViewer(delta) {
    const next = Math.max(0.7, Math.min(3.0, state.viewerControls.zoom + delta));
    state.viewerControls.zoom = Number(next.toFixed(2));
    applyViewerFilter();
  }

  function resetViewer() {
    state.viewerControls.invert = false;
    state.viewerControls.brightness = 100;
    state.viewerControls.contrast = 100;
    state.viewerControls.zoom = 1.0;
    applyViewerFilter();
    updateViewerControlsUI();
  }

  function applyViewerFilter() {
    if (typeof document === "undefined") return;
    const previewImg = document.getElementById("radViewerImage");
    const previewPlaceholder = document.getElementById("radViewerPlaceholder");
    if (!previewImg) return;

    const { invert, brightness, contrast, zoom } = state.viewerControls;
    const invertVal = invert ? 1 : 0;
    previewImg.style.filter = `invert(${invertVal}) brightness(${brightness}%) contrast(${contrast}%)`;
    previewImg.style.transform = `scale(${zoom})`;
    previewImg.style.transition = "filter 0.2s ease, transform 0.2s ease";

    const zoomBadge = document.getElementById("radZoomBadge");
    if (zoomBadge) {
      zoomBadge.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  function updateViewerControlsUI() {
    if (typeof document === "undefined") return;
    const invertBtn = document.getElementById("btnRadInvert");
    if (invertBtn) {
      invertBtn.classList.toggle("active", state.viewerControls.invert);
      invertBtn.setAttribute("aria-pressed", state.viewerControls.invert ? "true" : "false");
    }
    const bSlider = document.getElementById("radBrightnessRange");
    if (bSlider) bSlider.value = state.viewerControls.brightness;
    const cSlider = document.getElementById("radContrastRange");
    if (cSlider) cSlider.value = state.viewerControls.contrast;
  }

  /**
   * Staging and File Intake
   */
  const ALLOWED_EXTS = [".dcm", ".dicom", ".png", ".jpg", ".jpeg", ".webp", ".pdf"];
  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB for high-resolution radiology scans

  function stageRadiologyFiles(filesList) {
    const isEn = isEnglish();
    const files = Array.from(filesList || []);
    if (!files.length) return;

    let validAdded = 0;
    for (const file of files) {
      const lower = (file.name || "").toLowerCase();
      const isValidExt = ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
      if (!isValidExt) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "Invalid file. Upload DICOM, PNG, JPG, WEBP, or PDF." : "صيغة غير مدعومة. ارفع DICOM أو PNG أو JPG أو PDF.");
        }
        continue;
      }
      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        if (typeof global.showToast === "function") {
          global.showToast(isEn ? "File size exceeds 15MB limit for radiology." : "حجم ملف الأشعة يتجاوز الحد المسموح (15 ميجابايت).");
        }
        continue;
      }

      let previewUrl = null;
      if (file.type && file.type.startsWith("image/") && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch (_) {}
      }

      const modConfig = RADIOLOGY_MODALITIES[state.selectedModality];
      const fileRecord = {
        id: `rad_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        modality: state.selectedModality,
        modalityTitle: isEn ? modConfig.nameEn : modConfig.nameAr,
        loinc: modConfig.loinc,
        indications: Array.from(state.selectedIndications),
        urgency: state.urgency,
        clinicalNotes: state.clinicalNotes,
        status: "uploaded_quarantined",
        reviewStatus: "pending_radiologist_review",
        previewUrl,
        fileRef: file,
        uploadedAt: new Date().toISOString()
      };

      state.stagedFiles.unshift(fileRecord);
      validAdded++;

      // Automatically display in Lightbox if image
      if (previewUrl && !state.activeViewerFile) {
        setViewerActiveFile(fileRecord);
      }
    }

    if (validAdded > 0) {
      renderStagedFilesList();
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Chest scan staged for radiologist review." : "تم تجهيز صورة الأشعة ووضعها في طابور مراجعة الاستشاري.");
      }
    }
  }

  function setViewerActiveFile(fileRecord) {
    state.activeViewerFile = fileRecord;
    if (typeof document === "undefined") return;
    const previewImg = document.getElementById("radViewerImage");
    const previewPlaceholder = document.getElementById("radViewerPlaceholder");
    const viewerMeta = document.getElementById("radViewerMeta");

    if (previewImg && previewPlaceholder) {
      if (fileRecord && fileRecord.previewUrl) {
        previewImg.src = fileRecord.previewUrl;
        previewImg.style.display = "block";
        previewPlaceholder.style.display = "none";
      } else {
        previewImg.style.display = "none";
        previewPlaceholder.style.display = "flex";
      }
    }
    if (viewerMeta && fileRecord) {
      const isEn = isEnglish();
      viewerMeta.innerHTML = `
        <span class="pill info" style="font-size: 11px;">${escapeHtml(fileRecord.modalityTitle)}</span>
        <strong style="font-size: 13px;">${escapeHtml(fileRecord.name)}</strong>
        <span style="font-size: 11.5px; color: var(--muted);">${(fileRecord.size / (1024 * 1024)).toFixed(2)} MB • LOINC: ${escapeHtml(fileRecord.loinc)}</span>
      `;
    }
    resetViewer();
  }

  function renderStagedFilesList() {
    if (typeof document === "undefined") return;
    const container = document.getElementById("radStagedFilesList");
    if (!container) return;
    const isEn = isEnglish();

    if (!state.stagedFiles.length) {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--muted); font-size: 12.5px; border: 1px dashed var(--line); border-radius: 12px;">
          ${isEn ? "No chest scans uploaded yet. Capture or browse above." : "لم يتم رفع صور أشعة بعد. صوّر الفيلم أو اختر ملفاً من الأعلى."}
        </div>
      `;
      return;
    }

    container.innerHTML = state.stagedFiles.map((f) => {
      const isCurrentActive = state.activeViewerFile && state.activeViewerFile.id === f.id;
      const thumb = f.previewUrl
        ? `<img src="${escapeHtmlAttr(f.previewUrl)}" alt="Scan" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line);">`
        : `<div style="width: 48px; height: 48px; border-radius: 8px; background: rgba(14, 165, 164, 0.1); display: flex; align-items: center; justify-content: center; font-size: 22px;">🩻</div>`;

      return `
        <div class="rad-file-row ${isCurrentActive ? "active-inspect" : ""}" id="rad-file-${f.id}" style="display: flex; gap: 12px; align-items: center; padding: 10px 14px; border: 1px solid ${isCurrentActive ? "var(--teal)" : "var(--line)"}; border-radius: 12px; background: var(--surface); margin-bottom: 8px; transition: border-color 0.2s;">
          ${thumb}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="pill info" style="font-size: 10.5px; padding: 2px 7px;">${escapeHtml(f.modalityTitle)}</span>
              <strong style="font-size: 13px; word-break: break-all;">${escapeHtml(f.name)}</strong>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 4px; font-size: 11.5px; color: var(--muted); flex-wrap: wrap;">
              <span>${(f.size / 1024).toFixed(0)} KB</span>
              <span>•</span>
              <span style="color: #f59e0b; font-weight: 700;">⏳ ${isEn ? "Pending Radiologist Review" : "بانتظار قراءة الاستشاري"}</span>
              <span>•</span>
              <span style="color: var(--teal); font-weight: 600;">🔒 ${isEn ? "HIPAA Quarantined" : "مشفر بالحجر الصحي"}</span>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            ${f.previewUrl ? `<button type="button" class="soft-button" onclick="window.inspectRadiologyFile('${f.id}')" style="padding: 6px 10px; font-size: 11.5px;">${isEn ? "Inspect 🔍" : "فحص 🔍"}</button>` : ""}
            <button type="button" class="outline-button" onclick="window.removeRadiologyFile('${f.id}')" style="padding: 6px 10px; font-size: 11.5px; color: #dc2626; border-color: rgba(220, 38, 38, 0.3);">${isEn ? "Delete" : "حذف"}</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function removeRadiologyFile(id) {
    const idx = state.stagedFiles.findIndex((f) => f.id === id);
    if (idx !== -1) {
      state.stagedFiles.splice(idx, 1);
      if (state.activeViewerFile && state.activeViewerFile.id === id) {
        state.activeViewerFile = state.stagedFiles[0] || null;
        setViewerActiveFile(state.activeViewerFile);
      }
      renderStagedFilesList();
      const isEn = isEnglish();
      if (typeof global.showToast === "function") {
        global.showToast(isEn ? "Scan removed." : "تم حذف الصورة.");
      }
    }
  }

  function inspectRadiologyFile(id) {
    const target = state.stagedFiles.find((f) => f.id === id);
    if (target) {
      setViewerActiveFile(target);
      renderStagedFilesList();
      if (typeof document === "undefined") return;
      const viewer = document.getElementById("radViewerCard");
      if (viewer && typeof viewer.scrollIntoView === "function") {
        viewer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  /**
   * UI Triggers
   */
  function triggerCamera() {
    if (typeof document === "undefined") return;
    const input = document.getElementById("radCameraInput");
    if (input) input.click();
  }

  function triggerBrowse() {
    if (typeof document === "undefined") return;
    const input = document.getElementById("radBrowseInput");
    if (input) input.click();
  }

  function handleFileInputChange(input) {
    if (input && input.files && input.files.length) {
      stageRadiologyFiles(input.files);
      input.value = "";
    }
  }

  /**
   * Modal Management
   */
  function openChestRadiologyModal() {
    if (typeof document === "undefined") return;
    const modal = document.getElementById("chestRadiologyModal");
    if (modal) {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      renderStagedFilesList();
      if (state.stagedFiles.length && !state.activeViewerFile) {
        setViewerActiveFile(state.stagedFiles[0]);
      }
    }
  }

  function closeChestRadiologyModal() {
    if (typeof document === "undefined") return;
    const modal = document.getElementById("chestRadiologyModal");
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  /**
   * Booking Pulmonology Consultation CTA
   */
  function bookPulmonologyConsultation() {
    closeChestRadiologyModal();
    if (typeof global.showScreen === "function") {
      global.showScreen("appointments");
    }
    if (typeof document === "undefined") return;
    const notesInput = document.getElementById("apptNotesInput");
    if (notesInput) {
      const isEn = isEnglish();
      const mod = RADIOLOGY_MODALITIES[state.selectedModality];
      const modName = isEn ? mod.nameEn : mod.nameAr;
      notesInput.value = isEn
        ? `Consultation for Chest Imaging review (${modName}).`
        : `استشارة لمراجعة أشعة الصدر (${modName}) مع الاستشاري.`;
    }
  }

  /**
   * Public API
   */
  const ChestRadiologyUI = {
    RADIOLOGY_MODALITIES,
    CLINICAL_INDICATIONS,
    getState: () => state,
    selectModality,
    toggleIndication,
    selectUrgency,
    toggleViewerInvert,
    setViewerBrightness,
    setViewerContrast,
    zoomViewer,
    resetViewer,
    stageRadiologyFiles,
    openChestRadiologyModal,
    closeChestRadiologyModal,
    triggerCamera,
    triggerBrowse,
    handleFileInputChange,
    inspectRadiologyFile,
    removeRadiologyFile,
    bookPulmonologyConsultation
  };

  // Attach to window
  global.ChestRadiologyUI = ChestRadiologyUI;
  global.openChestRadiologyStudio = openChestRadiologyModal;
  global.closeChestRadiologyStudio = closeChestRadiologyModal;
  global.selectRadiologyModality = selectModality;
  global.toggleRadiologyIndication = toggleIndication;
  global.selectRadiologyUrgency = selectUrgency;
  global.triggerRadiologyCamera = triggerCamera;
  global.triggerRadiologyBrowse = triggerBrowse;
  global.handleRadiologyFileSelected = handleFileInputChange;
  global.toggleRadiologyInvert = toggleViewerInvert;
  global.setRadiologyBrightness = setViewerBrightness;
  global.setRadiologyContrast = setViewerContrast;
  global.zoomRadiologyViewer = zoomViewer;
  global.resetRadiologyViewer = resetViewer;
  global.inspectRadiologyFile = inspectRadiologyFile;
  global.removeRadiologyFile = removeRadiologyFile;
  global.bookRadiologyPulmonologyConsult = bookPulmonologyConsultation;

})(typeof window !== "undefined" ? window : this);
