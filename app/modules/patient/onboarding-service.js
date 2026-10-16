/**
 * Health Vibe AI - Patient Onboarding Walkthrough Service (مرجع: Ada Health)
 * Manages 3-step clinical onboarding walkthrough cards, completion state persistence,
 * and user preferences.
 */

(function (global) {
  "use strict";

  const STORAGE_PREFIX = "healthvibe_onboarding_seen_";

  const ONBOARDING_STEPS = [
    {
      step: 1,
      icon: "📝",
      title: {
        ar: "تسجيل الأعراض والمؤشرات الحيوية",
        en: "Record Symptoms & Vital Signs"
      },
      subtitle: {
        ar: "فرز ذكي مبدئي قائم على الأدلة السريرية",
        en: "Evidence-grounded preliminary clinical triage"
      },
      description: {
        ar: "أدخل نسبة تشبع الأكسجين (SpO2) والأعراض بدقة. يقوم محرك الذكاء الاصطناعي بفرز البيانات وتجهيز مسودة إرشادية منظمة لدعم القرار الطبي.",
        en: "Enter your oxygen saturation (SpO2) and symptoms. The clinical AI engine triages your inputs and prepares an indicative structured draft for the doctor."
      },
      badge: {
        ar: "الخطوة الأولى",
        en: "Step 1"
      }
    },
    {
      step: 2,
      icon: "🩺",
      title: {
        ar: "مراجعة وتدقيق طبيب بشري مرخص",
        en: "Licensed Physician Clinical Review"
      },
      subtitle: {
        ar: "الذكاء الاصطناعي لا يحل محل الطبيب",
        en: "AI never replaces human clinical judgment"
      },
      description: {
        ar: "تُحال مسودتك الطبية فوراً إلى طبيب بشري مرخص ومسجل بالنقابة لتدقيق الأعراض، تعديل التوصيات، واعتماد التقرير الطبي بتوقيعه الرقمي.",
        en: "Your clinical assessment is immediately routed to a verified, licensed physician who thoroughly reviews vitals, refines advice, and signs off digitally."
      },
      badge: {
        ar: "الخطوة الثانية",
        en: "Step 2"
      }
    },
    {
      step: 3,
      icon: "📋",
      title: {
        ar: "استلام التقرير الطبي ومشاركته بأمان",
        en: "Receive Certified Report & Secure Share"
      },
      subtitle: {
        ar: "سجلات مشفرة برمز تحقق QR ومشاركة عائلية",
        en: "Encrypted records with QR verification and family profiles"
      },
      description: {
        ar: "احصل على تقريرك المعتمد بصيغة PDF قابلة للتحقق الفوري، مع إمكانية مشاركة رابط آمن مع طبيبك الخاص أو إدارة ملفات والديك وأطفالك من حسابك.",
        en: "Download your certified PDF report with cryptographic QR verification, share secure expiring links with family, and manage dependent profiles seamlessly."
      },
      badge: {
        ar: "الخطوة الثالثة",
        en: "Step 3"
      }
    }
  ];

  const OnboardingService = {
    STEPS: ONBOARDING_STEPS,

    /**
     * Checks if the patient has already completed or dismissed onboarding.
     * @param {string} [userId='guest']
     * @returns {boolean}
     */
    hasSeenOnboarding(userId = "guest") {
      if (typeof localStorage === "undefined") return false;
      try {
        const val = localStorage.getItem(STORAGE_PREFIX + userId);
        return val === "true";
      } catch (e) {
        return false;
      }
    },

    /**
     * Marks the onboarding as completed/seen for a user.
     * @param {string} [userId='guest']
     * @returns {Object}
     */
    markOnboardingSeen(userId = "guest") {
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(STORAGE_PREFIX + userId, "true");
        } catch (e) {}
      }
      return {
        success: true,
        userId,
        hasSeen: true,
        completedAt: new Date().toISOString()
      };
    },

    /**
     * Resets the onboarding status so patient can replay it from settings.
     * @param {string} [userId='guest']
     * @returns {Object}
     */
    resetOnboarding(userId = "guest") {
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.removeItem(STORAGE_PREFIX + userId);
        } catch (e) {}
      }
      return {
        success: true,
        userId,
        hasSeen: false
      };
    },

    /**
     * Retrieves all 3 onboarding step cards.
     * @returns {Array<Object>}
     */
    getSteps() {
      return [...ONBOARDING_STEPS];
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = OnboardingService;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.OnboardingService = OnboardingService;
  }
})(typeof window !== "undefined" ? window : global);
