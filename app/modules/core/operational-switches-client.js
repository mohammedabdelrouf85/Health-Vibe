/**
 * HEALTH VIBE AI: CLIENT-SIDE OPERATIONAL FEATURE SWITCHES MANAGER
 *
 * Synchronizes with server-controlled operational switches:
 * - Assessment intake circuit breaker (assessmentIntake)
 * - Assistant availability (assistant)
 * - Partner integrations (diagnostics, wearables, prescriptions, telehealth)
 *
 * Provides:
 * - Real-time switch status checks.
 * - Dynamic UI availability banners.
 * - Safe blocking before dispatching disabled operations.
 * - Guarantees read access to historical records remains unimpeded.
 */

(function (global) {
  class OperationalSwitchesClient {
    constructor() {
      this.switches = {
        assessmentIntake: { enabled: true, allowReads: true },
        assistant: { enabled: true, allowReads: true },
        integrations: {
          enabled: true,
          allowReads: true,
          subFeatures: {
            diagnostics: { enabled: true },
            wearables: { enabled: true },
            prescriptions: { enabled: true },
            telehealth: { enabled: true }
          }
        }
      };
      this.lastFetched = null;
      this.listeners = new Set();
    }

    async refreshStatus() {
      try {
        if (typeof callBackend === 'function') {
          const res = await callBackend('/api/operational-switches/status');
          if (res && res.switches) {
            this.switches = res.switches;
            this.lastFetched = Date.now();
            this.notifyListeners();
            this.renderAvailabilityBanners();
            return this.switches;
          }
        }
      } catch (e) {
        // Offline / fallback to current in-memory switches
      }
      return this.switches;
    }

    subscribe(fn) {
      if (typeof fn === 'function') {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      }
    }

    notifyListeners() {
      for (const fn of this.listeners) {
        try { fn(this.switches); } catch (e) {}
      }
    }

    isAssessmentIntakeEnabled() {
      return Boolean(this.switches.assessmentIntake && this.switches.assessmentIntake.enabled !== false);
    }

    isAssistantEnabled() {
      return Boolean(this.switches.assistant && this.switches.assistant.enabled !== false);
    }

    isIntegrationEnabled(subKey) {
      if (this.switches.integrations && this.switches.integrations.enabled === false) return false;
      if (subKey && this.switches.integrations?.subFeatures?.[subKey]) {
        return Boolean(this.switches.integrations.subFeatures[subKey].enabled !== false);
      }
      return true;
    }

    getIntakeMessage(isEn = false) {
      const msgObj = this.switches.assessmentIntake?.messages;
      if (msgObj) {
        return isEn ? msgObj.en : msgObj.ar;
      }
      return isEn
        ? "New clinical assessment intake is temporarily paused for operational maintenance. You can safely view all your existing assessments and certified reports."
        : "تم إيقاف استقبال التقييمات السريرية الجديدة مؤقتاً لأعمال الصيانة التشغيلية. يمكنك الاطلاع على كافة تقاريرك وفحوصاتك السابقة بأمان.";
    }

    getAssistantMessage(isEn = false) {
      const msgObj = this.switches.assistant?.messages;
      if (msgObj) {
        return isEn ? msgObj.en : msgObj.ar;
      }
      return isEn
        ? "The AI Medical Assistant is currently offline for scheduled maintenance. Past consultation notes and approved summaries remain accessible."
        : "المساعد الطبي الذكي غير متاح حالياً لأعمال الصيانة المجدولة. السجلات السابقة ومسودات الزيارات المعتمدة لا تزال متاحة بالكامل.";
    }

    renderAvailabilityBanners() {
      const isEn = typeof currentLanguage !== 'undefined' && currentLanguage === 'en';

      // 1. Assessment Intake Banner
      const intakeBannerEl = document.getElementById('intakeOperationalBanner');
      const intakeSubmitBtn = document.getElementById('submitAssessmentBtn');
      if (intakeBannerEl) {
        if (!this.isAssessmentIntakeEnabled()) {
          intakeBannerEl.style.display = 'block';
          intakeBannerEl.innerHTML = `
            <div class="operational-maintenance-banner" style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; color: #ca8a04; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 20px;">⚠️</span>
              <div>
                <strong style="display: block; font-size: 13.5px;">${isEn ? 'Assessment Intake Paused' : 'استقبال التقييمات متوقف مؤقتاً'}</strong>
                <span style="font-size: 12.5px;">${this.getIntakeMessage(isEn)}</span>
              </div>
            </div>
          `;
          if (intakeSubmitBtn) {
            intakeSubmitBtn.disabled = true;
            intakeSubmitBtn.title = this.getIntakeMessage(isEn);
          }
        } else {
          intakeBannerEl.style.display = 'none';
          intakeBannerEl.innerHTML = '';
          if (intakeSubmitBtn) {
            intakeSubmitBtn.disabled = false;
            intakeSubmitBtn.removeAttribute('title');
          }
        }
      }

      // 2. Assistant Screen Banner
      const assistantBannerEl = document.getElementById('assistantOperationalBanner');
      const chatInput = document.getElementById('chatInput');
      const chatSendBtn = document.getElementById('chatSendBtn');
      if (assistantBannerEl) {
        if (!this.isAssistantEnabled()) {
          assistantBannerEl.style.display = 'block';
          assistantBannerEl.innerHTML = `
            <div class="operational-maintenance-banner" style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; color: #ca8a04; padding: 10px 14px; border-radius: 8px; margin: 8px 12px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px;">⚠️</span>
              <div>
                <strong style="display: block; font-size: 13px;">${isEn ? 'Assistant Offline for Maintenance' : 'المساعد الطبي في وضع الصيانة'}</strong>
                <span style="font-size: 12px;">${this.getAssistantMessage(isEn)}</span>
              </div>
            </div>
          `;
          if (chatInput) chatInput.disabled = true;
          if (chatSendBtn) chatSendBtn.disabled = true;
        } else {
          assistantBannerEl.style.display = 'none';
          assistantBannerEl.innerHTML = '';
          if (chatInput) chatInput.disabled = false;
          if (chatSendBtn) chatSendBtn.disabled = false;
        }
      }
    }
  }

  const client = new OperationalSwitchesClient();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = client;
    module.exports.OperationalSwitchesClient = OperationalSwitchesClient;
  }
  if (typeof global !== 'undefined') {
    global.operationalSwitchesClient = client;
    global.HealthVibesOperationalSwitches = client;
  }
})(typeof window !== 'undefined' ? window : global);
