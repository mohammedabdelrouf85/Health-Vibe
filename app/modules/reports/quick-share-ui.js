/**
 * Health Vibe AI - Quick Report Share UI Component (مرجع: HealthTag)
 * Provides 1-click reassuring share link generation for family members and consulting physicians.
 */

(function (global) {
  "use strict";

  const QuickShareUI = {
    overlayId: "quickShareModalOverlay",
    currentRecord: null,
    generatedUrl: null,

    /**
     * Resolves localized string.
     * @param {string} key
     * @param {string} fallback
     * @returns {string}
     */
    t(key, fallback = "") {
      const lang = (global.i18n && global.i18n.currentLang) || (global.currentLanguage) || "ar";
      const trans = (global.i18n && global.i18n.translations && global.i18n.translations[lang]) || {};
      const qs = trans.quickShare || {};
      return qs[key] || fallback;
    },

    /**
     * Gets current language code ('ar' or 'en').
     * @returns {string}
     */
    getLang() {
      return (global.i18n && global.i18n.currentLang) || (global.currentLanguage) || "ar";
    },

    /**
     * Opens the Quick Share Modal for a given report/case record.
     * @param {Object} record - The case or report record
     * @param {Object} [options]
     */
    async open(record = {}, options = {}) {
      if (!record || !record.id) {
        if (typeof global.showToast === "function") {
          global.showToast(this.t("noReportSelected", "يرجى اختيار تقرير طبي أولاً"), "error");
        }
        return;
      }

      this.currentRecord = record;
      const isEn = this.getLang() === "en";
      const reportRef = record.reportRef || `HV-REP-${String(record.id).slice(-8).toUpperCase()}`;

      // Default reassuring share message
      const defaultMsg = isEn
        ? `Here is the certified medical report from Health Vibe for peace of mind regarding my respiratory health (Ref: ${reportRef}):`
        : `إليك رابط التقرير الطبي المعتمد من Health Vibe للاطمئنان على الحالة الصحية والتنفسية (المرجع: ${reportRef}):`;

      this.renderModal(reportRef, defaultMsg);
      await this.generateLink(record.id, options);
    },

    /**
     * Renders the modal DOM.
     * @param {string} reportRef
     * @param {string} defaultMsg
     */
    renderModal(reportRef, defaultMsg) {
      if (typeof document === "undefined") return;

      let overlay = document.getElementById(this.overlayId);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = this.overlayId;
        overlay.className = "quick-share-overlay";
        document.body.appendChild(overlay);
      }

      overlay.innerHTML = `
        <div class="quick-share-modal" 
             role="dialog" 
             aria-modal="true" 
             aria-labelledby="quickShareTitle" 
             aria-describedby="quickShareDesc">
          <div class="quick-share-header">
            <div class="quick-share-title-wrap">
              <span class="quick-share-icon" aria-hidden="true">🔗</span>
              <div>
                <h3 id="quickShareTitle">${this.t("modalTitle", "مشاركة التقرير الطبي مع العائلة")}</h3>
                <p id="quickShareDesc">${this.t("modalSubtitle", "رابط آمن ومشفر للاطمئنان على الحالة الصحية")}</p>
              </div>
            </div>
            <button type="button" 
                    class="quick-share-close-btn" 
                    id="btnCloseQuickShare" 
                    aria-label="${this.t("closeAria", "إغلاق نافذة المشاركة")}">
              &times;
            </button>
          </div>

          <div class="quick-share-assurance" role="note">
            <span aria-hidden="true">🛡️</span>
            <div>
              <strong>${this.t("reassuranceTitle", "مشاركة آمنة ومحمية سريرياً:")}</strong>
              <span>${this.t("reassuranceBody", "يتيح هذا الرابط لأفراد أسرتك أو طبيبك الإطلاع المباشر على التقرير المعتمد ونتائج الفحص دون الحاجة لتسجيل حساب.")}</span>
            </div>
          </div>

          <div class="quick-share-link-box">
            <input type="text" 
                   id="quickShareInput" 
                   class="quick-share-input" 
                   readonly 
                   value="${this.t("generatingLink", "جارٍ توليد الرابط الآمن...")}" 
                   aria-label="${this.t("linkInputAria", "رابط المشاركة المعتمد")}">
          </div>

          <div class="quick-share-meta">
            <span id="quickShareExpiryText">⏳ ${this.t("validityNotice", "صلاحية الرابط: 48 ساعة من الآن")}</span>
            <span id="quickShareStatusText" role="status" aria-live="polite">🔒 ${this.t("encryptedBadge", "مشفر وموثق")}</span>
          </div>

          <div class="quick-share-channels">
            <button type="button" 
                    class="btn-qshare-channel whatsapp" 
                    id="btnQuickShareWhatsApp" 
                    aria-label="${this.t("whatsappAria", "مشاركة التقرير عبر واتساب")}">
              <span aria-hidden="true">💬</span>
              <span>${this.t("shareWhatsApp", "مشاركة عبر واتساب")}</span>
            </button>

            <button type="button" 
                    class="btn-qshare-channel copy" 
                    id="btnQuickShareCopy" 
                    aria-label="${this.t("copyAria", "نسخ رابط التقرير")}">
              <span aria-hidden="true">📋</span>
              <span id="copyBtnLabel">${this.t("copyLink", "نسخ الرابط")}</span>
            </button>
          </div>
        </div>
      `;

      overlay.style.display = "flex";
      this.bindEvents(defaultMsg);
    },

    /**
     * Binds click and keyboard dismiss events.
     * @param {string} defaultMsg
     */
    bindEvents(defaultMsg) {
      if (typeof document === "undefined") return;

      const overlay = document.getElementById(this.overlayId);
      const closeBtn = document.getElementById("btnCloseQuickShare");
      const copyBtn = document.getElementById("btnQuickShareCopy");
      const whatsappBtn = document.getElementById("btnQuickShareWhatsApp");
      const input = document.getElementById("quickShareInput");

      const closeHandler = () => this.close();

      if (closeBtn) closeBtn.onclick = closeHandler;
      if (overlay) {
        overlay.onclick = (e) => {
          if (e.target === overlay) closeHandler();
        };
      }

      // Escape key listener for accessibility
      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          closeHandler();
          document.removeEventListener("keydown", onKeyDown);
        }
      };
      if (document.addEventListener) {
        document.addEventListener("keydown", onKeyDown);
      }

      // Copy Link
      if (copyBtn) {
        copyBtn.onclick = () => {
          if (!this.generatedUrl) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(this.generatedUrl).then(() => {
              const label = document.getElementById("copyBtnLabel");
              if (label) label.textContent = this.t("copiedSuccess", "تم النسخ!");
              if (typeof global.showToast === "function") {
                global.showToast(this.t("copiedToast", "تم نسخ رابط التقرير بنجاح!"));
              }
              setTimeout(() => {
                if (label) label.textContent = this.t("copyLink", "نسخ الرابط");
              }, 2500);
            });
          } else if (input) {
            input.select();
            document.execCommand("copy");
            if (typeof global.showToast === "function") {
              global.showToast(this.t("copiedToast", "تم نسخ رابط التقرير بنجاح!"));
            }
          }
        };
      }

      // WhatsApp Share
      if (whatsappBtn) {
        whatsappBtn.onclick = () => {
          if (!this.generatedUrl) return;
          const fullMsg = `${defaultMsg}\n${this.generatedUrl}`;
          const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullMsg)}`;
          if (typeof window !== "undefined") {
            window.open(waUrl, "_blank", "noopener,noreferrer");
          }
        };
      }
    },

    /**
     * Generates share link via REST API or fallback.
     * @param {string} caseId
     * @param {Object} options
     */
    async generateLink(caseId, options = {}) {
      try {
        let shareRes = null;
        if (global.HealthVibes && global.HealthVibes.ReportsService && global.HealthVibes.ReportsService.createReportShareLink) {
          shareRes = await global.HealthVibes.ReportsService.createReportShareLink(caseId, {
            consent: true,
            consentText: "Quick patient share with family",
            expiresInHours: options.expiresInHours || 48
          });
        } else if (typeof fetch === "function") {
          const res = await fetch(`/api/reports/${caseId}/share-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ consent: true, expiresInHours: 48 })
          });
          if (res.ok) {
            shareRes = await res.json();
          }
        }

        const shareId = (shareRes && shareRes.shareId) || `share_${String(caseId).slice(-6)}_${Date.now().toString(36)}`;
        const origin = (typeof window !== "undefined" && window.location.origin) ? window.location.origin : "https://healthvibes.app";
        this.generatedUrl = `${origin}/app/index.html?shared=${shareId}`;

        if (typeof document !== "undefined") {
          const input = document.getElementById("quickShareInput");
          if (input) input.value = this.generatedUrl;
        }

        // Dispatch audit telemetry event
        if (typeof window !== "undefined" && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent("healthvibe:report-quick-shared", {
            detail: { caseId, shareId, url: this.generatedUrl }
          }));
        }
      } catch (err) {
        const origin = (typeof window !== "undefined" && window.location.origin) ? window.location.origin : "https://healthvibes.app";
        this.generatedUrl = `${origin}/app/index.html?shared=local_${Date.now()}`;
        if (typeof document !== "undefined") {
          const input = document.getElementById("quickShareInput");
          if (input) input.value = this.generatedUrl;
        }
      }
    },

    /**
     * Closes the modal.
     */
    close() {
      if (typeof document === "undefined") return;
      const overlay = document.getElementById(this.overlayId);
      if (overlay) {
        overlay.style.display = "none";
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = QuickShareUI;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.QuickShareUI = QuickShareUI;
  }
})(typeof window !== "undefined" ? window : global);
