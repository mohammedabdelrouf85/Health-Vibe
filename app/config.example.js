/**
 * Health Vibes AI - Configuration Template (config.example.js)
 * Copy this file to config.js to configure your local or target environment.
 */

window.HEALTH_VIBE_CONFIG = {
  // Current active environment: "development" | "production"
  environment: "development",

  // Backend API URL (use http://localhost:4000 for local dev server, or leave empty for same-origin)
  apiBaseUrl: "http://localhost:4000",

  // Demo seeding permission
  allowDemoSeed: false,

  // Debug logging
  debug: true,

  // Local Firebase Emulators (development only)
  emulators: {
    enabled: false,
    authUrl: "http://localhost:9099",
    firestoreHost: "localhost",
    firestorePort: 8080
  },

  // Firebase Web Client Configuration
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  }
};
