const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

window.HEALTH_VIBE_CONFIG = {
  environment: isLocal ? "development" : "production",
  apiBaseUrl: isLocal ? "http://localhost:4000" : "",
  allowDemoSeed: false,
  firebase: {
    apiKey: "AIzaSyANyIglmiKcdM0I2EKkjPhzMjKR58o8BRM",
    authDomain: "health-vibes-a4b3b.firebaseapp.com",
    projectId: "health-vibes-a4b3b",
    storageBucket: "health-vibes-a4b3b.firebasestorage.app",
    messagingSenderId: "21682568356",
    appId: "1:21682568356:web:d38947f11647fdfef13a31",
    measurementId: "G-FSHSN2XB4L"
  }
};
