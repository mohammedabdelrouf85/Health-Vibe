/**
 * Health Vibe AI - Condition-Tailored Dashboard UI Component (مرجع: Propeller Health)
 * Renders the elevated clinical telemetry bar and condition switcher for the patient dashboard.
 */

(function (global) {
  "use strict";

  const ConditionTailoringUI = {
    mountId: "patientConditionTailoringMount",
    activeUserId: "guest",
    currentCondition: "respiratory",
    service: null,

    /**
     * Initializes the UI component.
     * @param {string} [mountId]
     * @param {Object} [options]
     */
    init(mountId = "patientConditionTailoringMount", options = {}) {
      this.mountId = mountId;
      this.activeUserId = options.userId || "guest";
      this.service = (global.HealthVibes && global.HealthVibes.ConditionTailoringService) || options.service;

      if (!this.service && typeof require !== "undefined") {
        try {
          this.service = require("./condition-tailoring-service.js");
        } catch (e) {}
      }

      if (this.service) {
        this.currentCondition = this.service.getSavedCondition(this.activeUserId);
      }

      this.render();
      this.bindEvents();
    },

    /**
     * Resolves localized string.
     * @param {string} key
     * @param {string} fallback
     * @returns {string}
     */
    t(key, fallback = "") {
      const lang = (global.i18n && global.i18n.currentLang) || "ar";
      const trans = (global.i18n && global.i18n.translations && global.i18n.translations[lang]) || {};
      const ctTrans = trans.conditionTailoring || {};
      return ctTrans[key] || fallback;
    },

    /**
     * Gets active language code ('ar' or 'en').
     * @returns {string}
     */
    getLang() {
      return (global.i18n && global.i18n.currentLang) || "ar";
    },

    /**
     * Generates HTML markup for the tailored dashboard widget.
     * @param {Object} [customVitals]
     * @returns {string}
     */
    generateMarkup(customVitals = {}) {
      if (!this.service) return "";

      const lang = this.getLang();
      const vitals = Object.keys(customVitals).length > 0 ? customVitals : {
        spo2: 98,
        respiratoryRate: 16,
        inhalerAdherence: 94,
        systolic: 122,
        diastolic: 78,
        heartRate: 72,
        fastingGlucose: 105,
        postprandialGlucose: 135,
        hba1c: 6.2,
        bmi: 23.4
      };

      const tailored = this.service.resolveTailoredDashboard(
        { primaryCondition: this.currentCondition },
        vitals
      );

      const schema = tailored.schema;
      const title = schema.title[lang] || schema.title.ar;
      const subtitle = schema.subtitle[lang] || schema.subtitle.ar;
      const quickActionText = schema.quickAction[lang] || schema.quickAction.ar;

      const conditionOptions = Object.keys(this.service.SCHEMAS).map(condKey => {
        const item = this.service.SCHEMAS[condKey];
        const isSelected = condKey === this.currentCondition;
        const optTitle = item.title[lang] || item.title.ar;
        return `
          <button type="button" 
                  class="condition-pill-btn ${isSelected ? 'active' : ''}" 
                  data-condition="${condKey}"
                  aria-pressed="${isSelected}"
                  aria-label="${optTitle}">
            <span class="pill-icon" aria-hidden="true">${item.icon}</span>
            <span class="pill-text">${optTitle}</span>
          </button>
        `;
      }).join("");

      const vitalCards = tailored.telemetry.map(vital => {
        const labelText = (vital.label[lang] || vital.label.ar || vital.key);
        const valText = vital.value !== null ? vital.value : "--";
        const unitText = vital.unit ? ` ${vital.unit}` : "";
        const targetText = vital.target ? `(${this.t('targetLabel', 'المستهدف')}: ${vital.target})` : "";
        
        let statusClass = "status-normal";
        let statusBadge = this.t('statusNormal', 'مثالي');
        if (vital.status === "warning") {
          statusClass = "status-warning";
          statusBadge = this.t('statusWarning', 'تنبيه');
        } else if (vital.status === "critical") {
          statusClass = "status-critical";
          statusBadge = this.t('statusCritical', 'حرج');
        }

        return `
          <div class="tailored-vital-card ${vital.key === 'spo2' ? 'elevated-spo2-card' : ''}" data-vital-key="${vital.key}">
            <div class="tailored-vital-header">
              <span class="tailored-vital-label">${labelText}</span>
              <span class="tailored-vital-badge ${statusClass}">${statusBadge}</span>
            </div>
            <div class="tailored-vital-metric">
              <span class="tailored-vital-val">${valText}</span>
              <span class="tailored-vital-unit">${unitText}</span>
            </div>
            <div class="tailored-vital-target" aria-label="${targetText}">${targetText}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="condition-tailored-hero ${this.currentCondition === 'respiratory' ? 'respiratory-elevated' : ''}" 
             role="region" 
             aria-label="${this.t('heroRegionAria', 'لوحة القياسات الحيوية المخصصة')}"
             data-condition="${this.currentCondition}">
          <div class="condition-tailored-header">
            <div class="condition-badge-group">
              <div class="condition-badge-icon" aria-hidden="true">${schema.icon}</div>
              <div class="condition-title-wrap">
                <h3 class="condition-title">${title}</h3>
                <p class="condition-subtitle">${subtitle}</p>
              </div>
            </div>
            <div class="condition-selector-pills" role="radiogroup" aria-label="${this.t('selectorAria', 'اختيار الحالة الصحية المسجلة')}">
              ${conditionOptions}
            </div>
          </div>

          <div class="tailored-vitals-grid">
            ${vitalCards}
          </div>

          <div class="condition-tailored-footer">
            <div class="condition-status-live" role="status" aria-live="polite">
              ${this.t('showingConditionVitals', 'عرض المؤشرات المخصصة لمرضى')}: <strong>${title}</strong>
            </div>
            <button type="button" 
                    id="btnTailoredQuickAction" 
                    class="btn-tailored-action"
                    data-action-condition="${this.currentCondition}">
              <span class="action-icon" aria-hidden="true">⚡</span>
              <span class="action-label">${quickActionText}</span>
            </button>
          </div>
        </div>
      `;
    },

    /**
     * Renders markup into container.
     */
    render(customVitals) {
      if (typeof document === "undefined") return;
      const container = document.getElementById(this.mountId);
      if (!container) return;
      container.innerHTML = this.generateMarkup(customVitals);
    },

    /**
     * Binds click and keyboard events.
     */
    bindEvents() {
      if (typeof document === "undefined") return;
      const container = document.getElementById(this.mountId);
      if (!container) return;

      container.addEventListener("click", (evt) => {
        const pill = evt.target.closest(".condition-pill-btn");
        if (pill) {
          const condition = pill.getAttribute("data-condition");
          if (condition && condition !== this.currentCondition) {
            this.setCondition(condition);
          }
          return;
        }

        const quickActionBtn = evt.target.closest("#btnTailoredQuickAction");
        if (quickActionBtn) {
          this.triggerQuickAction(this.currentCondition);
        }
      });
    },

    /**
     * Updates active condition, re-renders, and syncs persistence.
     * @param {string} conditionId
     */
    setCondition(conditionId) {
      if (!this.service || !this.service.SCHEMAS[conditionId]) return;
      this.currentCondition = conditionId;
      this.service.setSavedCondition(this.activeUserId, conditionId);
      this.render();

      // Dispatch custom event for telemetry and analytics
      if (typeof window !== "undefined" && window.dispatchEvent) {
        const event = new CustomEvent("healthvibe:condition-changed", {
          detail: {
            userId: this.activeUserId,
            conditionId: conditionId,
            schema: this.service.SCHEMAS[conditionId]
          }
        });
        window.dispatchEvent(event);
      }

      // Sync with backend if available
      if (typeof fetch === "function") {
        fetch("/api/patient/primary-condition", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: this.activeUserId, conditionId: conditionId })
        }).catch(() => {});
      }
    },

    /**
     * Quick action handler (e.g. opens assessment or modal).
     * @param {string} conditionId
     */
    triggerQuickAction(conditionId) {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("healthvibe:quick-vital-log", {
          detail: { conditionId }
        }));
      }
      // If assessment tab exists, navigate to it
      if (typeof document !== "undefined") {
        const assessTab = document.querySelector('[data-screen="screen-assessment"]') || document.getElementById("tabAssessment");
        if (assessTab) assessTab.click();
      }
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ConditionTailoringUI;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.ConditionTailoringUI = ConditionTailoringUI;

    if (typeof document !== "undefined") {
      document.addEventListener("DOMContentLoaded", () => {
        ConditionTailoringUI.init();
      });
    }
  }
})(typeof window !== "undefined" ? window : global);
