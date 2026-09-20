// Copy this file to config.js for the target environment.
// Firebase web config is public, but keep environment separation strict.
window.HEALTH_VIBE_CONFIG = {
  environment: "development", // development | production
  apiBaseUrl: "", // same origin by default, e.g. "http://localhost:3000" for a separate backend
  allowDemoSeed: false,
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
