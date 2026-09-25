/**
 * Health Vibes AI - Dual Environment Configuration Engine
 * Seamlessly isolates Development and Production environments
 */

(function () {
  // Live Production Firebase Project Configuration
  const PROD_FIREBASE = {
    apiKey: "AIzaSyANyIglmiKcdM0I2EKkjPhzMjKR58o8BRM",
    authDomain: "health-vibes-a4b3b.firebaseapp.com",
    projectId: "health-vibes-a4b3b",
    storageBucket: "health-vibes-a4b3b.firebasestorage.app",
    messagingSenderId: "21682568356",
    appId: "1:21682568356:web:d38947f11647fdfef13a31",
    measurementId: "G-FSHSN2XB4L"
  };

  // Development Firebase Configuration (can connect to dev project or emulators)
  const DEV_FIREBASE = {
    apiKey: "AIzaSyANyIglmiKcdM0I2EKkjPhzMjKR58o8BRM",
    authDomain: "health-vibes-a4b3b.firebaseapp.com",
    projectId: "health-vibes-a4b3b",
    storageBucket: "health-vibes-a4b3b.firebasestorage.app",
    messagingSenderId: "21682568356",
    appId: "1:21682568356:web:d38947f11647fdfef13a31",
    measurementId: "G-FSHSN2XB4L"
  };

  const ENVIRONMENTS = {
    development: {
      name: "development",
      label: "Development (بيئة التطوير)",
      badge: "🛠️ DEV",
      apiBaseUrl: "http://localhost:4000",
      allowDemoSeed: true,
      debug: true,
      emulators: {
        enabled: false,
        authUrl: "http://localhost:9099",
        firestoreHost: "localhost",
        firestorePort: 8080
      },
      appCheck: {
        provider: "debug",
        debugToken: "healthvibe-dev-debug-token",
        isTokenAutoRefreshEnabled: true
      },
      firebase: DEV_FIREBASE
    },
    production: {
      name: "production",
      label: "Production (البيئة التشغيلية)",
      badge: null,
      apiBaseUrl: "",
      allowDemoSeed: false,
      debug: false,
      emulators: {
        enabled: false
      },
      appCheck: {
        provider: "recaptcha-v3",
        siteKey: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
        isTokenAutoRefreshEnabled: true
      },
      firebase: PROD_FIREBASE
    }
  };

  // Determine active environment
  function resolveEnvironment() {
    if (typeof window === "undefined") return "production";

    // 1. Query parameter override: ?env=development or ?env=production
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryEnv = (urlParams.get("env") || "").toLowerCase().trim();
      if (queryEnv === "development" || queryEnv === "dev") return "development";
      if (queryEnv === "production" || queryEnv === "prod") return "production";
    } catch (e) {}

    // 2. Explicit localStorage override
    try {
      const stored = (localStorage.getItem("HV_ENVIRONMENT") || "").toLowerCase().trim();
      if (stored === "development" || stored === "production") return stored;
    } catch (e) {}

    // 3. Hostname auto-detection
    const hostname = (window.location && window.location.hostname) || "";
    const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0", ""].includes(hostname) || hostname.endsWith(".local");
    if (isLocalHost) return "development";

    return "production";
  }

  const activeEnvName = resolveEnvironment();
  const activeConfig = ENVIRONMENTS[activeEnvName] || ENVIRONMENTS.production;

  const ADMIN_ACCESS = {
    ownerEmails: [
      "mohammedabdelrouf85@gmail.com",
      "raouf.work@gmail.com",
      "admin@healthvibe.ai",
      "badr.ahmed.biotech@gmail.com"
    ],
    revokedVerificationEmails: [
      "devilunderurwater@gmail.com"
    ]
  };

  // Check emulator toggle via URL param or localStorage in dev
  if (typeof window !== "undefined" && activeEnvName === "development") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("emulator") === "true" || urlParams.get("emulators") === "true" || localStorage.getItem("HV_USE_EMULATORS") === "true") {
        activeConfig.emulators.enabled = true;
      }
    } catch (e) {}
  }

  // Construct global config object (100% backward compatible top-level fields)
  const CONFIG = {
    // Active environment properties
    environment: activeConfig.name,
    apiBaseUrl: activeConfig.apiBaseUrl,
    allowDemoSeed: activeConfig.allowDemoSeed,
    debug: activeConfig.debug,
    emulators: activeConfig.emulators,
    appCheck: activeConfig.appCheck,
    adminAccess: ADMIN_ACCESS,
    firebase: activeConfig.firebase,

    // Environment dictionary & details
    current: activeConfig,
    environments: ENVIRONMENTS,

    // Environment helpers
    isDevelopment: () => CONFIG.environment === "development",
    isProduction: () => CONFIG.environment === "production",

    // Environment Switchers
    setEnvironment(envName) {
      if (!["development", "production"].includes(envName)) {
        throw new Error("Invalid environment: must be 'development' or 'production'");
      }
      try {
        localStorage.setItem("HV_ENVIRONMENT", envName);
        console.log(`[Health Vibes] Environment switched to ${envName}. Reloading...`);
        window.location.reload();
      } catch (e) {
        console.warn("Could not save environment preference:", e);
      }
    },

    resetToDefault() {
      try {
        localStorage.removeItem("HV_ENVIRONMENT");
        localStorage.removeItem("HV_USE_EMULATORS");
        window.location.reload();
      } catch (e) {}
    },

    toggleEmulators(enable) {
      try {
        localStorage.setItem("HV_USE_EMULATORS", enable ? "true" : "false");
        window.location.reload();
      } catch (e) {}
    }
  };

  if (typeof window !== "undefined") {
    window.HEALTH_VIBE_CONFIG = CONFIG;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = CONFIG;
  }
})();
