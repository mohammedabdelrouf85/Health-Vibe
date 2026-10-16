/**
 * Health Vibe AI - Auth Data Service
 * 
 * Manages authentication lifecycle, credentials, session persistence,
 * and security tokens independently of DOM presentation.
 */

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    SESSION: "hv_active_session",
    REMEMBER: "hv_remember_me",
    ROLE: "hv_selected_role"
  };

  /**
   * Applies the correct Firebase Auth persistence mode (LOCAL or SESSION).
   * @param {boolean} rememberMe
   * @param {object} authInstance
   * @returns {Promise<void>}
   */
  async function applyAuthPersistence(rememberMe, authInstance) {
    const firebaseAuth = authInstance || (global.firebase && global.firebase.auth ? global.firebase.auth() : null);
    if (!firebaseAuth || !global.firebase || !global.firebase.auth) return;
    try {
      const mode = rememberMe
        ? global.firebase.auth.Auth.Persistence.LOCAL
        : global.firebase.auth.Auth.Persistence.SESSION;
      await firebaseAuth.setPersistence(mode);
    } catch (err) {
      console.warn("[AuthService] Failed to set auth persistence mode:", err);
    }
  }

  /**
   * Signs in with email and password.
   * @param {string} email
   * @param {string} password
   * @param {boolean} rememberMe
   * @param {object} [authInstance]
   * @returns {Promise<object>} UserCredential
   */
  async function signInWithCredentials(email, password, rememberMe = false, authInstance = null) {
    const auth = authInstance || (global.auth || (global.firebase && global.firebase.auth()));
    if (!auth) throw new Error("Authentication provider unavailable");
    await applyAuthPersistence(rememberMe, auth);
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred;
  }

  /**
   * Registers a new user account with profile metadata.
   * @param {string} email
   * @param {string} password
   * @param {string} displayName
   * @param {object} [options]
   * @returns {Promise<object>} User
   */
  async function registerWithCredentials(email, password, displayName, options = {}) {
    const auth = options.authInstance || (global.auth || (global.firebase && global.firebase.auth()));
    const db = options.dbInstance || global.db;
    if (!auth) throw new Error("Authentication provider unavailable");

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    const name = displayName || email.split("@")[0];

    try {
      await user.updateProfile({ displayName: name });
    } catch (err) {
      console.warn("[AuthService] Could not update profile display name:", err);
    }

    if (db) {
      try {
        const assignedRole = options.role || "patient";
        const assignedStatus = assignedRole === "doctor_pending" ? "pending_verification" : "active";
        await db.collection("users").doc(user.uid).set({
          name: name,
          email: user.email,
          role: assignedRole,
          status: assignedStatus,
          privacyConsent: {
            accepted: true,
            version: "2.0.0",
            acceptedAt: new Date().toISOString(),
            purpose: "PRD Section 10: Explicit consent for clinical data processing, physician review, and verified reports."
          },
          createdAt: global.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
        }, { merge: true });
      } catch (err) {
        console.warn("[AuthService] Could not initialize user document in Firestore:", err);
      }
    }

    try {
      await user.sendEmailVerification();
    } catch (err) {
      console.warn("[AuthService] Could not send initial email verification:", err);
    }

    return user;
  }

  /**
   * Dispatches a password reset email.
   * @param {string} email
   * @param {object} [authInstance]
   * @returns {Promise<void>}
   */
  async function requestPasswordReset(email, authInstance = null) {
    const auth = authInstance || (global.auth || (global.firebase && global.firebase.auth()));
    if (!auth) throw new Error("Authentication provider unavailable");
    await auth.sendPasswordResetEmail(email);
  }

  /**
   * Confirms and applies new password with oobCode.
   * @param {string} code
   * @param {string} newPassword
   * @param {object} [authInstance]
   * @returns {Promise<void>}
   */
  async function confirmPasswordReset(code, newPassword, authInstance = null) {
    const auth = authInstance || (global.auth || (global.firebase && global.firebase.auth()));
    if (!auth) throw new Error("Authentication provider unavailable");
    await auth.confirmPasswordReset(code, newPassword);
  }

  /**
   * Signs the current user out and clears local session cache.
   * @param {object} [authInstance]
   * @returns {Promise<void>}
   */
  async function signOut(authInstance = null) {
    const auth = authInstance || (global.auth || (global.firebase && global.firebase.auth()));
    if (auth) {
      await auth.signOut();
    }
    clearActiveSession();
    try {
      if (global.localStorage) {
        global.localStorage.setItem("hv_explicit_logout", "true");
      }
      if (global.sessionStorage) {
        global.sessionStorage.setItem("hv_explicit_logout", "true");
      }
    } catch (e) {}
  }

  /**
   * Stores active session record in storage.
   * @param {object} user
   * @param {string} role
   */
  function getSessionStorage() {
    try {
      if (typeof sessionStorage !== "undefined") return sessionStorage;
      if (global.sessionStorage) return global.sessionStorage;
    } catch (e) {}
    return null;
  }

  function getLocalStorage() {
    try {
      if (typeof localStorage !== "undefined") return localStorage;
      if (global.localStorage) return global.localStorage;
    } catch (e) {}
    return null;
  }

  /**
   * Stores active session record in storage.
   * @param {object} user
   * @param {string} role
   */
  function saveActiveSession(user, role) {
    if (!user) return;
    try {
      const payload = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: role || "patient",
        savedAt: Date.now()
      };
      const ss = getSessionStorage();
      if (ss) ss.setItem(STORAGE_KEYS.SESSION, JSON.stringify(payload));
      const ls = getLocalStorage();
      if (ls) ls.removeItem("hv_explicit_logout");
      if (ss) ss.removeItem("hv_explicit_logout");
    } catch (e) {}
  }

  /**
   * Clears active session record and cached credentials.
   */
  function clearActiveSession() {
    try {
      const ss = getSessionStorage();
      if (ss) {
        ss.removeItem(STORAGE_KEYS.SESSION);
        ss.removeItem(STORAGE_KEYS.ROLE);
        ss.removeItem(STORAGE_KEYS.REMEMBER);
        ss.removeItem("hv_active_user");
        ss.removeItem("hv_auth_token");
        ss.removeItem("hv_token");
      }
      const ls = getLocalStorage();
      if (ls) {
        ls.removeItem(STORAGE_KEYS.SESSION);
        ls.removeItem(STORAGE_KEYS.ROLE);
        ls.removeItem(STORAGE_KEYS.REMEMBER);
        ls.removeItem("hv_active_user");
        ls.removeItem("hv_auth_token");
        ls.removeItem("hv_token");
      }
    } catch (e) {}
  }

  /**
   * Restores cached session metadata.
   * @returns {object|null}
   */
  function getActiveSession() {
    try {
      const ls = getLocalStorage();
      if (ls && ls.getItem("hv_explicit_logout") === "true") {
        return null;
      }
      const ss = getSessionStorage();
      const raw = ss ? ss.getItem(STORAGE_KEYS.SESSION) : null;
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  const AuthService = {
    applyAuthPersistence,
    signInWithCredentials,
    registerWithCredentials,
    requestPasswordReset,
    confirmPasswordReset,
    signOut,
    saveActiveSession,
    clearActiveSession,
    getActiveSession
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AuthService = AuthService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AuthService;
  }
})(typeof window !== "undefined" ? window : globalThis);
