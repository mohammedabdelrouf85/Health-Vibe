/**
 * Health Vibe AI - User Display Preferences & Session State Service
 */
'use strict';

const DEFAULT_USER_DISPLAY_PREFERENCES = Object.freeze({
  theme: 'dark',                  // 'dark' | 'light' | 'system'
  language: 'ar',               // 'ar' | 'en'
  direction: 'rtl',              // 'rtl' | 'ltr'
  preferredBreakpoint: 'auto',  // 'auto' | 'mobile' | 'tablet' | 'desktop' | 'wide'
  density: 'comfortable',        // 'compact' | 'comfortable' | 'spacious'
  sidebarCollapsed: false,       // boolean
  lastActiveScreen: 'screen-patient', // string
  lastActiveModule: 'respiratory',    // string
  lastActiveTab: null,          // string | null
  deviceTier: 'desktop',         // 'mobile' | 'tablet' | 'desktop' | 'wide'
  errorGuidanceLevel: 'detailed', // 'detailed' | 'standard' | 'compact' (Vezeeta standard)
  autoDraftRecovery: true,       // boolean
  dismissedErrorTips: [],       // Array<string>
  sessionDrafts: {},            // Record<string, { data: object, savedAt: string }>
  lastSessionAt: null,          // ISO timestamp
  updatedAt: null               // ISO timestamp
});

const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);
const ALLOWED_LANGUAGES = new Set(['ar', 'en']);
const ALLOWED_DIRECTIONS = new Set(['rtl', 'ltr']);
const ALLOWED_BREAKPOINTS = new Set(['auto', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'mobile', 'tablet', 'desktop', 'wide']);
const ALLOWED_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const ALLOWED_DEVICE_TIERS = new Set(['mobile', 'tablet', 'desktop', 'wide']);
const ALLOWED_GUIDANCE_LEVELS = new Set(['detailed', 'standard', 'compact']);

// In-memory cache for fast retrieval and fallback when Firestore is offline or local
const inMemoryDisplayPreferences = new Map();
const inMemoryDrafts = new Map();

/**
 * Validates and sanitizes preference updates.
 * Throws errors with codes on invalid payloads.
 */
function validateDisplayPreferences(updates = {}) {
  const sanitized = {};

  if (updates.theme !== undefined) {
    const theme = String(updates.theme).trim().toLowerCase();
    if (!ALLOWED_THEMES.has(theme)) {
      const err = new Error(`Invalid theme: '${updates.theme}'. Allowed values: dark, light, system.`);
      err.code = 'INVALID_THEME';
      throw err;
    }
    sanitized.theme = theme;
  }

  if (updates.language !== undefined) {
    const lang = String(updates.language).trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.has(lang)) {
      const err = new Error(`Invalid language: '${updates.language}'. Allowed values: ar, en.`);
      err.code = 'INVALID_LANGUAGE';
      throw err;
    }
    sanitized.language = lang;
    sanitized.direction = lang === 'ar' ? 'rtl' : 'ltr';
  }

  if (updates.direction !== undefined) {
    const dir = String(updates.direction).trim().toLowerCase();
    if (!ALLOWED_DIRECTIONS.has(dir)) {
      const err = new Error(`Invalid direction: '${updates.direction}'. Allowed values: rtl, ltr.`);
      err.code = 'INVALID_DIRECTION';
      throw err;
    }
    sanitized.direction = dir;
  }

  if (updates.preferredBreakpoint !== undefined) {
    const bp = String(updates.preferredBreakpoint).trim().toLowerCase();
    if (!ALLOWED_BREAKPOINTS.has(bp)) {
      const err = new Error(`Invalid preferredBreakpoint: '${updates.preferredBreakpoint}'.`);
      err.code = 'INVALID_BREAKPOINT';
      throw err;
    }
    sanitized.preferredBreakpoint = bp;
  }

  if (updates.density !== undefined) {
    const density = String(updates.density).trim().toLowerCase();
    if (!ALLOWED_DENSITIES.has(density)) {
      const err = new Error(`Invalid density: '${updates.density}'. Allowed values: compact, comfortable, spacious.`);
      err.code = 'INVALID_DENSITY';
      throw err;
    }
    sanitized.density = density;
  }

  if (updates.sidebarCollapsed !== undefined) {
    sanitized.sidebarCollapsed = Boolean(updates.sidebarCollapsed);
  }

  if (updates.lastActiveScreen !== undefined) {
    const screen = String(updates.lastActiveScreen).trim().slice(0, 64);
    sanitized.lastActiveScreen = screen || 'screen-patient';
  }

  if (updates.lastActiveModule !== undefined) {
    const mod = String(updates.lastActiveModule).trim().slice(0, 64);
    sanitized.lastActiveModule = mod || 'respiratory';
  }

  if (updates.lastActiveTab !== undefined) {
    sanitized.lastActiveTab = updates.lastActiveTab ? String(updates.lastActiveTab).trim().slice(0, 64) : null;
  }

  if (updates.deviceTier !== undefined) {
    const tier = String(updates.deviceTier).trim().toLowerCase();
    if (ALLOWED_DEVICE_TIERS.has(tier)) {
      sanitized.deviceTier = tier;
    }
  }

  if (updates.errorGuidanceLevel !== undefined) {
    const level = String(updates.errorGuidanceLevel).trim().toLowerCase();
    if (!ALLOWED_GUIDANCE_LEVELS.has(level)) {
      const err = new Error(`Invalid errorGuidanceLevel: '${updates.errorGuidanceLevel}'. Allowed values: detailed, standard, compact.`);
      err.code = 'INVALID_GUIDANCE_LEVEL';
      throw err;
    }
    sanitized.errorGuidanceLevel = level;
  }

  if (updates.autoDraftRecovery !== undefined) {
    sanitized.autoDraftRecovery = Boolean(updates.autoDraftRecovery);
  }

  if (updates.dismissedErrorTips !== undefined) {
    if (!Array.isArray(updates.dismissedErrorTips)) {
      const err = new Error('dismissedErrorTips must be an array of string tip IDs.');
      err.code = 'INVALID_DISMISSED_TIPS';
      throw err;
    }
    sanitized.dismissedErrorTips = updates.dismissedErrorTips
      .filter(tip => typeof tip === 'string' && tip.trim().length > 0)
      .map(tip => tip.trim().slice(0, 64))
      .slice(0, 50);
  }

  if (updates.sessionDrafts !== undefined && typeof updates.sessionDrafts === 'object' && updates.sessionDrafts !== null) {
    sanitized.sessionDrafts = { ...updates.sessionDrafts };
  }

  return sanitized;
}

/**
 * Retrieves user display preferences & session state.
 */
async function getUserDisplayPreferences(db, userId) {
  if (!userId) return { ...DEFAULT_USER_DISPLAY_PREFERENCES };

  let prefs = inMemoryDisplayPreferences.get(userId);

  if (!prefs && db && typeof db.collection === 'function') {
    try {
      const snap = await db.collection('user_display_preferences').doc(userId).get();
      if (snap.exists) {
        prefs = snap.data();
        inMemoryDisplayPreferences.set(userId, prefs);
      }
    } catch (e) {
      console.warn('[DISPLAY PREFS] Firestore read fallback to in-memory:', e.message);
    }
  }

  if (!prefs) {
    return {
      userId,
      ...DEFAULT_USER_DISPLAY_PREFERENCES
    };
  }

  return {
    userId,
    theme: prefs.theme || DEFAULT_USER_DISPLAY_PREFERENCES.theme,
    language: prefs.language || DEFAULT_USER_DISPLAY_PREFERENCES.language,
    direction: prefs.direction || (prefs.language === 'en' ? 'ltr' : 'rtl'),
    preferredBreakpoint: prefs.preferredBreakpoint || DEFAULT_USER_DISPLAY_PREFERENCES.preferredBreakpoint,
    density: prefs.density || DEFAULT_USER_DISPLAY_PREFERENCES.density,
    sidebarCollapsed: typeof prefs.sidebarCollapsed === 'boolean' ? prefs.sidebarCollapsed : DEFAULT_USER_DISPLAY_PREFERENCES.sidebarCollapsed,
    lastActiveScreen: prefs.lastActiveScreen || DEFAULT_USER_DISPLAY_PREFERENCES.lastActiveScreen,
    lastActiveModule: prefs.lastActiveModule || DEFAULT_USER_DISPLAY_PREFERENCES.lastActiveModule,
    lastActiveTab: prefs.lastActiveTab !== undefined ? prefs.lastActiveTab : DEFAULT_USER_DISPLAY_PREFERENCES.lastActiveTab,
    deviceTier: prefs.deviceTier || DEFAULT_USER_DISPLAY_PREFERENCES.deviceTier,
    errorGuidanceLevel: prefs.errorGuidanceLevel || DEFAULT_USER_DISPLAY_PREFERENCES.errorGuidanceLevel,
    autoDraftRecovery: typeof prefs.autoDraftRecovery === 'boolean' ? prefs.autoDraftRecovery : DEFAULT_USER_DISPLAY_PREFERENCES.autoDraftRecovery,
    dismissedErrorTips: Array.isArray(prefs.dismissedErrorTips) ? prefs.dismissedErrorTips : [],
    sessionDrafts: prefs.sessionDrafts && typeof prefs.sessionDrafts === 'object' ? prefs.sessionDrafts : {},
    lastSessionAt: prefs.lastSessionAt || null,
    updatedAt: prefs.updatedAt || null
  };
}

/**
 * Updates user display preferences & session state.
 */
async function updateUserDisplayPreferences(db, userId, updates = {}) {
  if (!userId) {
    const err = new Error('userId is required to update display preferences.');
    err.code = 'INVALID_PARAMETERS';
    throw err;
  }

  const sanitized = validateDisplayPreferences(updates);
  const current = await getUserDisplayPreferences(db, userId);

  const nowIso = new Date().toISOString();
  const merged = {
    ...current,
    ...sanitized,
    userId,
    updatedAt: nowIso,
    lastSessionAt: sanitized.lastActiveScreen ? nowIso : current.lastSessionAt
  };

  inMemoryDisplayPreferences.set(userId, merged);

  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('user_display_preferences').doc(userId).set(merged, { merge: true });
    } catch (e) {
      console.warn('[DISPLAY PREFS] Firestore write fallback to in-memory:', e.message);
    }
  }

  return merged;
}

/**
 * Persists a form draft for a specific user to prevent data loss.
 */
async function saveUserDraft(db, userId, formId, draftData = {}) {
  if (!userId || !formId) {
    const err = new Error('userId and formId are required to save draft.');
    err.code = 'INVALID_PARAMETERS';
    throw err;
  }

  const safeFormId = String(formId).trim().slice(0, 64);
  const nowIso = new Date().toISOString();
  const draftEntry = {
    data: draftData || {},
    savedAt: nowIso
  };

  const key = `${userId}:${safeFormId}`;
  inMemoryDrafts.set(key, draftEntry);

  const currentPrefs = await getUserDisplayPreferences(db, userId);
  const updatedDrafts = {
    ...(currentPrefs.sessionDrafts || {}),
    [safeFormId]: draftEntry
  };

  await updateUserDisplayPreferences(db, userId, { sessionDrafts: updatedDrafts });
  return draftEntry;
}

/**
 * Retrieves a user's form draft.
 */
async function getUserDraft(db, userId, formId) {
  if (!userId || !formId) return null;
  const safeFormId = String(formId).trim().slice(0, 64);
  const key = `${userId}:${safeFormId}`;

  if (inMemoryDrafts.has(key)) {
    return inMemoryDrafts.get(key);
  }

  const prefs = await getUserDisplayPreferences(db, userId);
  if (prefs && prefs.sessionDrafts && prefs.sessionDrafts[safeFormId]) {
    inMemoryDrafts.set(key, prefs.sessionDrafts[safeFormId]);
    return prefs.sessionDrafts[safeFormId];
  }

  return null;
}

/**
 * Deletes a form draft once successfully submitted.
 */
async function deleteUserDraft(db, userId, formId) {
  if (!userId || !formId) return false;
  const safeFormId = String(formId).trim().slice(0, 64);
  const key = `${userId}:${safeFormId}`;
  inMemoryDrafts.delete(key);

  const currentPrefs = await getUserDisplayPreferences(db, userId);
  if (currentPrefs.sessionDrafts && currentPrefs.sessionDrafts[safeFormId]) {
    const updatedDrafts = { ...currentPrefs.sessionDrafts };
    delete updatedDrafts[safeFormId];
    await updateUserDisplayPreferences(db, userId, { sessionDrafts: updatedDrafts });
  }

  return true;
}

/**
 * Records a session checkpoint (active screen, module, device tier) quickly.
 */
async function recordSessionCheckpoint(db, userId, { screenId, moduleId, tabId, deviceTier } = {}) {
  if (!userId) return null;
  return updateUserDisplayPreferences(db, userId, {
    ...(screenId ? { lastActiveScreen: screenId } : {}),
    ...(moduleId ? { lastActiveModule: moduleId } : {}),
    ...(tabId !== undefined ? { lastActiveTab: tabId } : {}),
    ...(deviceTier ? { deviceTier } : {})
  });
}

function clearDisplayPreferencesMemory() {
  inMemoryDisplayPreferences.clear();
  inMemoryDrafts.clear();
}

module.exports = {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  validateDisplayPreferences,
  getUserDisplayPreferences,
  updateUserDisplayPreferences,
  saveUserDraft,
  getUserDraft,
  deleteUserDraft,
  recordSessionCheckpoint,
  clearDisplayPreferencesMemory
};
