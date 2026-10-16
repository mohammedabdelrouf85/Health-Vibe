/**
 * Health Vibe AI - User Display Preferences & Session State Client Subsystem
 * 
 * Synchronizes display preferences (theme, language, density, sidebar, breakpoints)
 * and session state (active screen, active module) between local browser storage and backend API.
 * 
 * Features:
 * 1. Zero-FOUC (Flash of Unstyled Content) synchronous local initialization
 * 2. Bi-directional synchronization with backend /api/user/preferences
 * 3. Debounced session checkpointing (/api/user/session-state)
 * 4. Automatic DOM state reflection (theme, dir, lang, data-density, data-device-tier)
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'hv_display_prefs';

  const DEFAULTS = Object.freeze({
    theme: 'dark',
    language: 'ar',
    direction: 'rtl',
    preferredBreakpoint: 'auto',
    density: 'comfortable',
    sidebarCollapsed: false,
    lastActiveScreen: 'screen-patient',
    lastActiveModule: 'respiratory',
    lastActiveTab: null,
    deviceTier: 'desktop',
    lastSessionAt: null,
    updatedAt: null
  });

  let memoryPrefs = null;
  let syncTimeout = null;

  function safeStorageGet(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        return localStorage.getItem(key);
      }
    } catch (_) {}
    return null;
  }

  function safeStorageSet(key, value) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, value);
      }
    } catch (_) {}
  }

  function getBaseApiUrl() {
    if (typeof window !== 'undefined' && window.HV_API_BASE_URL) {
      return window.HV_API_BASE_URL;
    }
    return '';
  }

  function getAuthToken() {
    try {
      if (typeof window !== 'undefined' && window.firebase && window.firebase.auth) {
        const user = window.firebase.auth().currentUser;
        if (user && typeof user.getIdToken === 'function') {
          return user.getIdToken();
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Loads preferences from localStorage with fallback to defaults.
   */
  function loadLocalPreferences() {
    if (memoryPrefs) return { ...memoryPrefs };

    const raw = safeStorageGet(STORAGE_KEY);
    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (_) {}
    }

    // Also harmonize with legacy standalone keys if present
    const legacyTheme = safeStorageGet('hv_theme');
    const legacyLang = safeStorageGet('hv_lang');
    const legacyScreen = safeStorageGet('hv_active_screen');

    memoryPrefs = {
      ...DEFAULTS,
      ...parsed,
      ...(legacyTheme ? { theme: legacyTheme } : {}),
      ...(legacyLang ? { language: legacyLang, direction: legacyLang === 'en' ? 'ltr' : 'rtl' } : {}),
      ...(legacyScreen ? { lastActiveScreen: legacyScreen } : {})
    };

    return { ...memoryPrefs };
  }

  /**
   * Applies the current preference state to the DOM immediately.
   */
  function applyPreferencesToDOM(prefs) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const p = prefs || loadLocalPreferences();

    // 1. Language & Direction
    const lang = p.language === 'en' ? 'en' : 'ar';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    if (document.body) {
      document.body.dir = dir;
    }

    // 2. Theme
    if (document.body) {
      if (p.theme === 'light') {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
      } else {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
      }
    }

    // 3. Density
    const density = ['compact', 'comfortable', 'spacious'].includes(p.density) ? p.density : 'comfortable';
    document.documentElement.dataset.density = density;
    if (document.body) {
      document.body.dataset.density = density;
    }

    // 4. Sidebar Collapsed (Desktop)
    if (document.body) {
      if (p.sidebarCollapsed) {
        document.body.classList.add('sidebar-collapsed');
      } else {
        document.body.classList.remove('sidebar-collapsed');
      }
    }

    // 5. Device Tier
    if (document.body && p.deviceTier) {
      document.body.dataset.deviceTier = p.deviceTier;
    }
  }

  /**
   * Saves updates to localStorage, applies to DOM, and optionally syncs with server.
   */
  async function savePreferences(updates = {}, options = {}) {
    const current = loadLocalPreferences();
    const merged = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (merged.language) {
      merged.direction = merged.language === 'en' ? 'ltr' : 'rtl';
    }

    memoryPrefs = merged;
    safeStorageSet(STORAGE_KEY, JSON.stringify(merged));

    // Keep legacy keys synchronized
    if (merged.theme) safeStorageSet('hv_theme', merged.theme);
    if (merged.language) safeStorageSet('hv_lang', merged.language);
    if (merged.lastActiveScreen) safeStorageSet('hv_active_screen', merged.lastActiveScreen);

    applyPreferencesToDOM(merged);

    // Sync to backend if requested and user has a token
    if (options.syncServer !== false) {
      try {
        let token = options.token || (await getAuthToken());
        if (token) {
          const res = await fetch(`${getBaseApiUrl()}/api/user/preferences`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(merged)
          });
          if (res.ok) {
            const data = await res.json();
            if (data.preferences) {
              memoryPrefs = { ...memoryPrefs, ...data.preferences };
              safeStorageSet(STORAGE_KEY, JSON.stringify(memoryPrefs));
            }
          }
        }
      } catch (err) {
        // Offline or server unavailable; localStorage remains authoritative
      }
    }

    return { ...memoryPrefs };
  }

  /**
   * Fetches latest user preferences from server and merges with local storage.
   */
  async function syncWithServer(explicitToken) {
    try {
      const token = explicitToken || (await getAuthToken());
      if (!token) return loadLocalPreferences();

      const res = await fetch(`${getBaseApiUrl()}/api/user/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) return loadLocalPreferences();

      const data = await res.json();
      if (data && data.preferences) {
        const local = loadLocalPreferences();
        // Server preferences take precedence for cross-device continuity
        const merged = {
          ...local,
          ...data.preferences
        };
        memoryPrefs = merged;
        safeStorageSet(STORAGE_KEY, JSON.stringify(merged));
        applyPreferencesToDOM(merged);
        return merged;
      }
    } catch (_) {}

    return loadLocalPreferences();
  }

  /**
   * Records active screen and session state with debouncing.
   */
  function checkpointSession(screenId, moduleId, tabId) {
    const current = loadLocalPreferences();
    const updates = {};
    if (screenId && screenId !== current.lastActiveScreen) updates.lastActiveScreen = screenId;
    if (moduleId && moduleId !== current.lastActiveModule) updates.lastActiveModule = moduleId;
    if (tabId !== undefined && tabId !== current.lastActiveTab) updates.lastActiveTab = tabId;

    if (Object.keys(updates).length === 0) return;

    // Save locally immediately
    savePreferences(updates, { syncServer: false });

    // Debounce server call
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      try {
        const token = await getAuthToken();
        if (token) {
          await fetch(`${getBaseApiUrl()}/api/user/session-state`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updates)
          });
        }
      } catch (_) {}
    }, 600);
  }

  /**
   * Updates detected device tier and syncs if changed.
   */
  function updateDeviceTier(tier) {
    if (!['mobile', 'tablet', 'desktop', 'wide'].includes(tier)) return;
    const current = loadLocalPreferences();
    if (current.deviceTier !== tier) {
      savePreferences({ deviceTier: tier }, { syncServer: false });
    }
  }

  // Initial immediate DOM boot
  if (typeof document !== 'undefined') {
    const initialPrefs = loadLocalPreferences();
    applyPreferencesToDOM(initialPrefs);
  }

  const UserPreferencesService = {
    DEFAULTS,
    getPreferences: loadLocalPreferences,
    applyPreferencesToDOM,
    savePreferences,
    syncWithServer,
    checkpointSession,
    updateDeviceTier
  };

  // Expose globally
  global.HVUserPreferences = UserPreferencesService;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserPreferencesService;
  }
})(typeof window !== 'undefined' ? window : global);
