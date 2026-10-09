/**
 * Health Vibe AI - Asynchronous Context & Lifecycle Manager
 *
 * Prevents race conditions, cross-account data leaks, and obsolete rendering:
 * 1. Authentication-Context Generation Identifiers (authGenerationId, clinicGenerationId, caseGenerationId).
 * 2. Pre-execution and Post-execution Context Validation.
 * 3. Centralized AbortController registry for in-flight network request cancellation.
 * 4. Centralized Subscription registry for Firestore onSnapshot and real-time listeners.
 * 5. Automatic cache purging and sensitive DOM scrubbing on logout/account switch.
 * 6. Rapid case switching and permission revocation guards.
 */

(function (global) {
  class AsyncContextManager {
    constructor() {
      this.reset();
    }

    reset() {
      this.authGenerationId = 1;
      this.clinicGenerationId = 1;
      this.caseGenerationId = 1;
      this.screenGenerationId = 1;

      this.currentContext = {
        userId: null,
        userEmail: null,
        role: null,
        clinicId: null,
        caseId: null,
        screen: null,
        permissions: new Set()
      };

      this.activeAbortControllers = new Set();
      this.activeSubscriptions = new Set();
      this.cachePurgers = new Set();
      this.domScrubbers = new Set();
      this.auditLogs = [];

      // Built-in cache registry
      this.inMemoryCaches = new Map(); // cacheKey -> data
    }

    // =========================================================================
    // 1. CONTEXT SNAPSHOTTING & GENERATION TRACKING
    // =========================================================================

    captureContext(overrides = {}) {
      return Object.freeze({
        authGenerationId: this.authGenerationId,
        clinicGenerationId: this.clinicGenerationId,
        caseGenerationId: this.caseGenerationId,
        screenGenerationId: this.screenGenerationId,
        userId: this.currentContext.userId,
        userEmail: this.currentContext.userEmail,
        role: this.currentContext.role,
        clinicId: this.currentContext.clinicId,
        caseId: this.currentContext.caseId,
        screen: this.currentContext.screen,
        capturedAt: Date.now(),
        ...overrides
      });
    }

    isContextValid(capturedSnapshot, requirements = {}) {
      if (!capturedSnapshot) {
        return { valid: false, reason: 'MISSING_SNAPSHOT' };
      }

      // 1. Auth Generation & User Verification
      if (requirements.requireSameUser !== false) {
        if (capturedSnapshot.authGenerationId !== this.authGenerationId) {
          return {
            valid: false,
            reason: 'AUTH_GENERATION_MISMATCH',
            message: `Current auth generation (${this.authGenerationId}) differs from captured generation (${capturedSnapshot.authGenerationId}).`
          };
        }
        if (capturedSnapshot.userId !== this.currentContext.userId) {
          return {
            valid: false,
            reason: 'USER_ID_MISMATCH',
            message: `Active user (${this.currentContext.userId}) does not match request user (${capturedSnapshot.userId}).`
          };
        }
      }

      // 2. Clinic Context Verification
      if (requirements.requireSameClinic) {
        if (capturedSnapshot.clinicGenerationId !== this.clinicGenerationId || capturedSnapshot.clinicId !== this.currentContext.clinicId) {
          return {
            valid: false,
            reason: 'CLINIC_CONTEXT_MISMATCH',
            message: 'Active clinic context has changed since request dispatch.'
          };
        }
      }

      // 3. Case View Context Verification (Rapid Case Switching Guard)
      if (requirements.requireSameCase) {
        if (capturedSnapshot.caseGenerationId !== this.caseGenerationId || capturedSnapshot.caseId !== this.currentContext.caseId) {
          return {
            valid: false,
            reason: 'CASE_CONTEXT_MISMATCH',
            message: `Active case (${this.currentContext.caseId}) differs from response case (${capturedSnapshot.caseId}). Stale response dropped.`
          };
        }
      }

      // 4. Role & Permission Verification (Permission Revocation Guard)
      if (requirements.requiredRole && this.currentContext.role !== requirements.requiredRole) {
        return {
          valid: false,
          reason: 'ROLE_REVOKED_OR_MISMATCH',
          message: `Current role '${this.currentContext.role}' does not satisfy required role '${requirements.requiredRole}'.`
        };
      }

      if (requirements.requiredPermission && !this.currentContext.permissions.has(requirements.requiredPermission)) {
        return {
          valid: false,
          reason: 'PERMISSION_REVOKED',
          message: `Required permission '${requirements.requiredPermission}' is no longer active in user context.`
        };
      }

      return { valid: true };
    }

    // =========================================================================
    // 2. ASYNC PROMISE GUARD (SAFEGUARD AGAINST DELAYED RESPONSES)
    // =========================================================================

    async guardAsync(asyncActionFn, options = {}) {
      const snapshot = this.captureContext(options.contextOverrides);

      // Pre-check
      const preCheck = this.isContextValid(snapshot, options);
      if (!preCheck.valid) {
        const err = new Error(`Async execution aborted: ${preCheck.message || preCheck.reason}`);
        err.code = preCheck.reason;
        err.isObsoleteContext = true;
        this._logAudit('ASYNC_ACTION_ABORTED_PRE_CHECK', { reason: preCheck.reason, snapshot });
        throw err;
      }

      // Execute async operation
      const result = await asyncActionFn(snapshot);

      // Post-check (Crucial: recheck context right before returning/applying)
      const postCheck = this.isContextValid(snapshot, options);
      if (!postCheck.valid) {
        const err = new Error(`Async result discarded: ${postCheck.message || postCheck.reason}`);
        err.code = postCheck.reason;
        err.isObsoleteContext = true;
        this._logAudit('ASYNC_RESULT_DROPPED_POST_CHECK', { reason: postCheck.reason, snapshot });
        throw err;
      }

      return result;
    }

    // =========================================================================
    // 3. ABORT CONTROLLER & REQUEST CANCELLATION REGISTRY
    // =========================================================================

    createAbortController(tag = 'unnamed_request') {
      let controller;
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
      } else {
        // Node.js fallback or mock
        controller = {
          signal: { aborted: false },
          abort: function(reason) {
            this.signal.aborted = true;
            this.signal.reason = reason;
          }
        };
      }

      controller._tag = tag;
      controller._generationId = this.authGenerationId;
      this.activeAbortControllers.add(controller);
      return controller;
    }

    unregisterAbortController(controller) {
      this.activeAbortControllers.delete(controller);
    }

    cancelAllRequests(reason = 'AUTH_CONTEXT_CHANGED') {
      const count = this.activeAbortControllers.size;
      for (const ctrl of this.activeAbortControllers) {
        try {
          ctrl.abort(reason);
        } catch (e) {}
      }
      this.activeAbortControllers.clear();
      this._logAudit('REQUESTS_ABORTED', { count, reason });
      return count;
    }

    // =========================================================================
    // 4. REAL-TIME SUBSCRIPTION & LISTENER REGISTRY
    // =========================================================================

    registerSubscription(unsubFn, metadata = {}) {
      if (typeof unsubFn !== 'function') return;
      const subEntry = {
        unsubFn,
        generationId: this.authGenerationId,
        metadata,
        registeredAt: Date.now()
      };
      this.activeSubscriptions.add(subEntry);
      return () => {
        try { unsubFn(); } catch (e) {}
        this.activeSubscriptions.delete(subEntry);
      };
    }

    unsubscribeAll(reason = 'AUTH_CONTEXT_CHANGED') {
      const count = this.activeSubscriptions.size;
      for (const sub of this.activeSubscriptions) {
        try {
          sub.unsubFn();
        } catch (e) {}
      }
      this.activeSubscriptions.clear();
      this._logAudit('SUBSCRIPTIONS_UNSUBSCRIBED', { count, reason });
      return count;
    }

    // =========================================================================
    // 5. CACHE PURGING & SENSITIVE DOM SCRUBBING
    // =========================================================================

    registerCachePurger(purgerFn) {
      if (typeof purgerFn === 'function') this.cachePurgers.add(purgerFn);
    }

    registerDomScrubber(scrubberFn) {
      if (typeof scrubberFn === 'function') this.domScrubbers.add(scrubberFn);
    }

    setCache(key, data) {
      this.inMemoryCaches.set(key, {
        generationId: this.authGenerationId,
        data
      });
    }

    getCache(key) {
      const cached = this.inMemoryCaches.get(key);
      if (!cached) return null;
      if (cached.generationId !== this.authGenerationId) {
        this.inMemoryCaches.delete(key);
        return null;
      }
      return cached.data;
    }

    purgeAllCaches(reason = 'AUTH_CHANGE') {
      const inMemoryCount = this.inMemoryCaches.size;
      this.inMemoryCaches.clear();

      for (const purger of this.cachePurgers) {
        try { purger(); } catch (e) {}
      }
      this._logAudit('CACHES_PURGED', { inMemoryCount, reason });
    }

    scrubSensitiveUI(reason = 'AUTH_CHANGE') {
      for (const scrubber of this.domScrubbers) {
        try { scrubber(); } catch (e) {}
      }
      this._logAudit('SENSITIVE_UI_SCRUBBED', { reason });
    }

    // =========================================================================
    // 6. LIFECYCLE STATE TRANSITIONS
    // =========================================================================

    handleAuthChange(action, newUserContext = null) {
      const previousUserId = this.currentContext.userId;
      this.authGenerationId++;

      // 1. Cancel in-flight requests immediately
      this.cancelAllRequests(`AUTH_${action}`);

      // 2. Unsubscribe real-time listeners
      this.unsubscribeAll(`AUTH_${action}`);

      // 3. Purge in-memory caches
      this.purgeAllCaches(`AUTH_${action}`);

      // 4. Scrub sensitive rendered content from UI
      this.scrubSensitiveUI(`AUTH_${action}`);

      // 5. Reset case and screen context
      this.caseGenerationId++;
      this.currentContext.caseId = null;

      // 6. Update user context
      if (action === 'LOGOUT') {
        this.currentContext.userId = null;
        this.currentContext.userEmail = null;
        this.currentContext.role = null;
        this.currentContext.clinicId = null;
        this.currentContext.permissions.clear();
      } else if (newUserContext) {
        this.currentContext.userId = newUserContext.uid || newUserContext.id || null;
        this.currentContext.userEmail = newUserContext.email || null;
        this.currentContext.role = newUserContext.role || 'patient';
        this.currentContext.clinicId = newUserContext.clinicId || null;
        this.currentContext.permissions = new Set(newUserContext.permissions || []);
      }

      this._logAudit('AUTH_CONTEXT_TRANSITIONED', {
        action,
        previousUserId,
        newUserId: this.currentContext.userId,
        newGenerationId: this.authGenerationId
      });

      return this.captureContext();
    }

    switchClinic(newClinicId) {
      if (this.currentContext.clinicId === newClinicId) return;
      this.clinicGenerationId++;
      this.currentContext.clinicId = newClinicId;

      this.cancelAllRequests('CLINIC_SWITCH');
      this.unsubscribeAll('CLINIC_SWITCH');
      this.purgeAllCaches('CLINIC_SWITCH');
      this._logAudit('CLINIC_SWITCHED', { newClinicId, newClinicGen: this.clinicGenerationId });
      return this.captureContext();
    }

    switchCase(newCaseId) {
      this.caseGenerationId++;
      const previousCaseId = this.currentContext.caseId;
      this.currentContext.caseId = newCaseId;

      // Abort previous case-specific requests
      for (const ctrl of this.activeAbortControllers) {
        if (ctrl._tag && ctrl._tag.startsWith('case_')) {
          try { ctrl.abort('CASE_SWITCH'); } catch (e) {}
          this.activeAbortControllers.delete(ctrl);
        }
      }

      this._logAudit('CASE_SWITCHED', {
        previousCaseId,
        newCaseId,
        newCaseGen: this.caseGenerationId
      });
      return this.captureContext();
    }

    revokePermission(permissionName) {
      if (this.currentContext.permissions.has(permissionName)) {
        this.currentContext.permissions.delete(permissionName);
        this.authGenerationId++; // Invalidate pending privileged calls
        this.cancelAllRequests('PERMISSION_REVOKED');
        this._logAudit('PERMISSION_REVOKED', { permissionName, newGeneration: this.authGenerationId });
      }
    }

    // =========================================================================
    // 7. AUDIT TRAIL
    // =========================================================================

    _logAudit(eventType, metadata = {}) {
      const entry = {
        id: `audit_ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
        eventType,
        metadata
      };
      this.auditLogs.push(entry);
      if (this.auditLogs.length > 500) this.auditLogs.shift();
      return entry;
    }

    getAuditLogs() {
      return [...this.auditLogs];
    }
  }

  const instance = new AsyncContextManager();

  // Export for Browser window & CommonJS Node.js environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instance;
  }
  if (typeof global !== 'undefined') {
    global.asyncContextManager = instance;
    global.HealthVibeAsyncContext = instance;
  }
})(typeof window !== 'undefined' ? window : global);
