/**
 * Health Vibes AI - Environment Configuration Engine
 * Isolates Development, Staging, and Production Firebase/API targets.
 */

(function () {
  const PROD_PROJECT_ID = "health-vibes-a4b3b";
  const STAGING_PROJECT_ID = "health-vibes-staging";
  const DEV_PROJECT_ID = "health-vibes-dev";
  const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", ""];
  const PRODUCTION_HOSTS = ["healthvibe.ai", "app.healthvibe.ai", "health-vibes-a4b3b.web.app", "health-vibes-a4b3b.firebaseapp.com"];
  const STAGING_HOSTS = ["staging.healthvibe.ai", "health-vibes-staging.web.app", "health-vibes-staging.firebaseapp.com"];

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

  const STAGING_FIREBASE = {
    apiKey: "STAGING_FIREBASE_API_KEY",
    authDomain: `${STAGING_PROJECT_ID}.firebaseapp.com`,
    projectId: STAGING_PROJECT_ID,
    storageBucket: `${STAGING_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: "STAGING_MESSAGING_SENDER_ID",
    appId: "STAGING_FIREBASE_APP_ID",
    measurementId: "STAGING_MEASUREMENT_ID"
  };

  // Development must use local emulators or a non-production Firebase project.
  const DEV_FIREBASE = {
    apiKey: "DEV_FIREBASE_API_KEY",
    authDomain: `${DEV_PROJECT_ID}.firebaseapp.com`,
    projectId: DEV_PROJECT_ID,
    storageBucket: `${DEV_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: "DEV_MESSAGING_SENDER_ID",
    appId: "DEV_FIREBASE_APP_ID",
    measurementId: "DEV_MEASUREMENT_ID"
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
        enabled: true,
        authUrl: "http://localhost:9099",
        firestoreHost: "localhost",
        firestorePort: 8080,
        storageHost: "localhost",
        storagePort: 9199
      },
      appCheck: {
        provider: "debug",
        debugToken: "healthvibe-dev-debug-token",
        isTokenAutoRefreshEnabled: true
      },
      firebase: DEV_FIREBASE
    },
    staging: {
      name: "staging",
      label: "Staging (بيئة ما قبل الإنتاج)",
      badge: "STAGING",
      apiBaseUrl: "https://staging.healthvibe.ai",
      allowDemoSeed: false,
      debug: true,
      emulators: {
        enabled: false
      },
      appCheck: {
        provider: "recaptcha-v3",
        siteKey: "STAGING_RECAPTCHA_SITE_KEY",
        isTokenAutoRefreshEnabled: true
      },
      firebase: STAGING_FIREBASE
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

    const hostname = ((window.location && window.location.hostname) || "").toLowerCase();
    const isLocalHost = LOCAL_HOSTS.includes(hostname) || hostname.endsWith(".local");
    const isProductionHost = PRODUCTION_HOSTS.includes(hostname);
    const isStagingHost = STAGING_HOSTS.includes(hostname);

    if (isProductionHost) return "production";
    if (isStagingHost) return "staging";

    // Query and localStorage overrides are available only outside production hosts.
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryEnv = (urlParams.get("env") || "").toLowerCase().trim();
      if (queryEnv === "development" || queryEnv === "dev") return "development";
      if (queryEnv === "staging" || queryEnv === "stage") return "staging";
      if (queryEnv === "production" || queryEnv === "prod") return "production";
    } catch (e) {}

    try {
      const stored = (localStorage.getItem("HV_ENVIRONMENT") || "").toLowerCase().trim();
      if (stored === "development" || stored === "staging" || stored === "production") return stored;
    } catch (e) {}

    if (isLocalHost) return "development";

    return "production";
  }

  const activeEnvName = resolveEnvironment();
  const activeConfig = ENVIRONMENTS[activeEnvName] || ENVIRONMENTS.production;

  function validateEnvironmentConfig(config) {
    const env = config.name;
    const projectId = config.firebase && config.firebase.projectId;
    const usingEmulators = Boolean(config.emulators && config.emulators.enabled);
    const expected = {
      development: DEV_PROJECT_ID,
      staging: STAGING_PROJECT_ID,
      production: PROD_PROJECT_ID
    }[env];

    if (!projectId) {
      throw new Error(`[Health Vibes] Missing Firebase projectId for ${env}.`);
    }
    if (env === "development" && projectId === PROD_PROJECT_ID && !usingEmulators) {
      throw new Error("[Health Vibes] Development cannot connect to the production Firebase project without emulators.");
    }
    if (env === "staging" && projectId !== STAGING_PROJECT_ID) {
      throw new Error(`[Health Vibes] Staging must use Firebase project ${STAGING_PROJECT_ID}; got ${projectId}.`);
    }
    if (env === "production") {
      if (projectId !== PROD_PROJECT_ID) {
        throw new Error(`[Health Vibes] Production must use Firebase project ${PROD_PROJECT_ID}; got ${projectId}.`);
      }
      if (usingEmulators || config.allowDemoSeed === true || config.debug === true) {
        throw new Error("[Health Vibes] Production cannot enable emulators, demo seeding, or debug mode.");
      }
    }
    config.expectedFirebaseProjectId = expected;
  }

  validateEnvironmentConfig(activeConfig);

  const ADMIN_ACCESS = {
    revokedVerificationEmails: [
      "devilunderurwater@gmail.com"
    ]
  };

  // Check emulator toggle via URL param or localStorage in dev only.
  if (typeof window !== "undefined" && activeEnvName === "development") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("emulator") === "false" || urlParams.get("emulators") === "false" || localStorage.getItem("HV_USE_EMULATORS") === "false") {
        activeConfig.emulators.enabled = false;
      }
      if (urlParams.get("emulator") === "true" || urlParams.get("emulators") === "true" || localStorage.getItem("HV_USE_EMULATORS") === "true") {
        activeConfig.emulators.enabled = true;
      }
    } catch (e) {}
    validateEnvironmentConfig(activeConfig);
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
    expectedFirebaseProjectId: activeConfig.expectedFirebaseProjectId,

    // Environment dictionary & details
    current: activeConfig,
    environments: ENVIRONMENTS,

    // Environment helpers
    isDevelopment: () => CONFIG.environment === "development",
    isStaging: () => CONFIG.environment === "staging",
    isProduction: () => CONFIG.environment === "production",

    // Environment Switchers
    setEnvironment(envName) {
      if (!["development", "staging", "production"].includes(envName)) {
        throw new Error("Invalid environment: must be 'development', 'staging', or 'production'");
      }
      try {
        const host = ((window.location && window.location.hostname) || "").toLowerCase();
        if (PRODUCTION_HOSTS.includes(host)) {
          throw new Error("Production hosts do not allow runtime environment switching.");
        }
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
        if (CONFIG.environment !== "development") {
          throw new Error("Firebase emulators can only be toggled in development.");
        }
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
