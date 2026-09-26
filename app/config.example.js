/**
 * Health Vibes AI - Configuration Template (config.example.js)
 * Copy this file to config.js to configure your local or target environment.
 */

window.HEALTH_VIBE_CONFIG = {
  // Current active environment: "development" | "staging" | "production"
  environment: "development",

  // Backend API URL (use http://localhost:4000 for local dev server, or leave empty for same-origin)
  apiBaseUrl: "http://localhost:4000",

  // Demo seeding permission
  allowDemoSeed: false,

  // Debug logging
  debug: true,

  // Account verification overrides. Administrative access is assigned by backend custom claims only.
  adminAccess: {
    revokedVerificationEmails: []
  },

  // Local Firebase Emulators (development only)
  emulators: {
    enabled: true,
    authUrl: "http://localhost:9099",
    firestoreHost: "localhost",
    firestorePort: 8080,
    storageHost: "localhost",
    storagePort: 9199
  },

  // Firebase Web Client Configuration
  expectedFirebaseProjectId: "health-vibes-dev",
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "health-vibes-dev.firebaseapp.com",
    projectId: "health-vibes-dev",
    storageBucket: "health-vibes-dev.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  }
};
