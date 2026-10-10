/**
 * Health Vibe AI - Authentication Provider Linking & Identity Security Engine
 *
 * Implements:
 * 1. Explicit multi-provider linking flow (GoogleAuthProvider, EmailAuthProvider).
 * 2. Strict Firebase UID preservation guaranteeing continuous medical record binding.
 * 3. Prevention of account or clinical record merging based on naive email string matching.
 * 4. Provider conflict resolution with step-by-step recovery and proof of control.
 * 5. Re-authentication enforcement for sensitive operations (requires-recent-login).
 * 6. Protection against removal of the last usable sign-in method (providerData.length <= 1).
 * 7. Protection against operations on suspended/disabled accounts.
 * 8. Graceful handling of canceled popup requests.
 */

(function (global) {
  "use strict";

  const PROVIDER_IDS = Object.freeze({
    PASSWORD: "password",
    GOOGLE: "google.com"
  });

  /**
   * Evaluates linked authentication providers from user.providerData.
   * @param {object} user - Firebase User object
   * @returns {object} Provider summary
   */
  function getLinkedProviders(user) {
    if (!user || !Array.isArray(user.providerData)) {
      return {
        providers: [],
        count: 0,
        hasPassword: false,
        hasGoogle: false,
        canUnlink: false,
        uid: user ? user.uid : null
      };
    }

    const providers = user.providerData.map(p => ({
      providerId: p.providerId,
      email: p.email || user.email || "",
      displayName: p.displayName || user.displayName || "",
      photoURL: p.photoURL || user.photoURL || null,
      phoneNumber: p.phoneNumber || null,
      isPrimary: p.email === user.email
    }));

    const hasPassword = providers.some(p => p.providerId === PROVIDER_IDS.PASSWORD);
    const hasGoogle = providers.some(p => p.providerId === PROVIDER_IDS.GOOGLE);

    return {
      providers,
      count: providers.length,
      hasPassword,
      hasGoogle,
      canUnlink: providers.length > 1,
      uid: user.uid
    };
  }

  /**
   * Verifies if an account is suspended or disabled.
   * @param {object} user - Firebase User object
   * @param {object} [userDocData] - Firestore user record
   * @returns {boolean}
   */
  function isAccountSuspended(user, userDocData = null) {
    if (!user) return false;
    if (user.disabled === true) return true;
    if (userDocData && (userDocData.status === "suspended" || userDocData.disabled === true)) return true;
    if (global._cachedUserDoc && (global._cachedUserDoc.status === "suspended" || global._cachedUserDoc.disabled === true)) return true;
    return false;
  }

  /**
   * Determines whether a provider can safely be unlinked.
   * Strictly enforces that the last remaining sign-in method cannot be removed.
   * @param {object} user - Firebase User object
   * @param {string} providerId - Provider to unlink
   * @param {object} [userDocData]
   * @returns {object}
   */
  function canUnlinkProvider(user, providerId, userDocData = null) {
    const isEn = (global.currentLanguage || "ar") === "en";

    if (!user) {
      return {
        allowed: false,
        reason: "NOT_AUTHENTICATED",
        messageEn: "User is not currently authenticated.",
        messageAr: "المستخدم غير مسجل الدخول حالياً."
      };
    }

    if (isAccountSuspended(user, userDocData)) {
      return {
        allowed: false,
        reason: "ACCOUNT_SUSPENDED",
        messageEn: "This account is suspended. Modifying authentication methods is prohibited.",
        messageAr: "هذا الحساب معلق حالياً من قِبل الإدارة. يُحظر تعديل وسائل تسجيل الدخول."
      };
    }

    const { providers, count } = getLinkedProviders(user);
    const hasTarget = providers.some(p => p.providerId === providerId);

    if (!hasTarget) {
      return {
        allowed: false,
        reason: "PROVIDER_NOT_LINKED",
        messageEn: `The provider '${providerId}' is not linked to this account.`,
        messageAr: `وسيلة تسجيل الدخول '${providerId}' غير مرتبطة بهذا الحساب.`
      };
    }

    // Safety rule: Never remove the last usable sign-in method
    if (count <= 1) {
      return {
        allowed: false,
        reason: "LAST_REMAINING_PROVIDER",
        messageEn: "Cannot remove your only remaining sign-in method. You must keep at least one active sign-in method to avoid losing access to your medical records.",
        messageAr: "لا يمكن إلغاء وسيلة تسجيل الدخول الوحيدة المتبقية لحسابك. يجب الحفاظ على وسيلة واحدة نشطة على الأقل لتفادي قفل الحساب وفقدان الوصول إلى ملفك الطبي."
      };
    }

    return {
      allowed: true,
      remainingCountAfter: count - 1
    };
  }

  /**
   * Strictly enforces clinical record ownership by UID.
   * Rejects any naive record sharing or merging based purely on matching email strings.
   * @param {object} clinicalRecord - The case or medical record
   * @param {string} authenticatedUserId - Firebase UID of active user
   * @throws {Error} If record belongs to a different UID
   * @returns {boolean}
   */
  function assertClinicalRecordOwnership(clinicalRecord, authenticatedUserId) {
    if (!clinicalRecord || !authenticatedUserId) {
      const err = new Error("Invalid parameters for clinical record ownership assertion.");
      err.code = "CLINICAL_OWNERSHIP_INVALID_PARAMS";
      throw err;
    }

    const recordOwnerId = clinicalRecord.patientId || clinicalRecord.userId || clinicalRecord.ownerUid || null;

    if (!recordOwnerId) {
      // Record without UID provenance cannot be claimed by email alone
      const err = new Error("Clinical record lacks verified owner UID provenance. Merge by email is strictly disallowed.");
      err.code = "CLINICAL_OWNERSHIP_UNVERIFIED";
      throw err;
    }

    if (recordOwnerId !== authenticatedUserId) {
      const err = new Error(`Clinical record belongs to UID '${recordOwnerId}', but active user is '${authenticatedUserId}'. Cross-account email merging is strictly prohibited.`);
      err.code = "CLINICAL_RECORD_OWNERSHIP_MISMATCH";
      throw err;
    }

    return true;
  }

  /**
   * Re-authenticates the current user using their existing linked provider.
   * @param {object} user - Firebase User object
   * @param {string} providerId - "password" or "google.com"
   * @param {object} [credentials] - { password }
   * @returns {Promise<object>}
   */
  async function reauthenticateUser(user, providerId, credentials = {}) {
    if (!user) throw new Error("No user to re-authenticate");

    if (providerId === PROVIDER_IDS.PASSWORD) {
      const password = credentials.password;
      if (!password) {
        const err = new Error("Current password is required for re-authentication.");
        err.code = "auth/missing-password";
        throw err;
      }
      const EmailAuthProvider = global.firebase?.auth?.EmailAuthProvider;
      if (!EmailAuthProvider) throw new Error("EmailAuthProvider unavailable");
      const cred = EmailAuthProvider.credential(user.email, password);
      return await user.reauthenticateWithCredential(cred);
    }

    if (providerId === PROVIDER_IDS.GOOGLE) {
      const GoogleAuthProvider = global.firebase?.auth?.GoogleAuthProvider;
      if (!GoogleAuthProvider) throw new Error("GoogleAuthProvider unavailable");
      const provider = new GoogleAuthProvider();
      return await user.reauthenticateWithPopup(provider);
    }

    throw new Error(`Unsupported re-authentication provider: ${providerId}`);
  }

  /**
   * Links a Google Account to the active Firebase user via popup.
   * Preserves the Firebase UID and all clinical records.
   * @param {object} user - Active Firebase User
   * @param {object} [options] - Optional configurations
   * @returns {Promise<object>}
   */
  async function linkGoogleProvider(user, options = {}) {
    const isEn = (global.currentLanguage || "ar") === "en";

    if (!user) {
      return {
        ok: false,
        code: "auth/no-current-user",
        error: isEn ? "Please sign in to link a provider." : "يرجى تسجيل الدخول أولاً لربط وسيلة المصادقة."
      };
    }

    if (isAccountSuspended(user)) {
      return {
        ok: false,
        code: "auth/user-disabled",
        error: isEn
          ? "This account is suspended by platform administration. Modifying authentication providers is currently blocked."
          : "هذا الحساب موقوف حالياً من قِبل إدارة المنصة. تم تجميد كافة عمليات ربط أو تعديل وسائل تسجيل الدخول."
      };
    }

    // Verify existing providers
    const { hasGoogle } = getLinkedProviders(user);
    if (hasGoogle) {
      return {
        ok: true,
        alreadyLinked: true,
        uid: user.uid,
        message: isEn ? "Google account is already linked." : "حساب Google مرتبط بالفعل بهذا الحساب."
      };
    }

    const baselineUid = user.uid;
    const GoogleAuthProvider = global.firebase?.auth?.GoogleAuthProvider;
    const provider = options.providerInstance || (GoogleAuthProvider ? new GoogleAuthProvider() : null);

    if (!provider) {
      return {
        ok: false,
        code: "auth/provider-unavailable",
        error: isEn ? "Google authentication provider is unavailable." : "خدمة مصادقة Google غير متوفرة حالياً."
      };
    }

    try {
      const result = await user.linkWithPopup(provider);
      const updatedUser = result.user || user;

      // STRICT SAFETY ASSERTION: Firebase UID must be 100% preserved
      if (updatedUser.uid !== baselineUid) {
        console.error(`CRITICAL SECURITY ANOMALY: UID changed from ${baselineUid} to ${updatedUser.uid}`);
        throw new Error("UID mutation detected during provider linking. Process aborted.");
      }

      // Sync Firestore user profile providers list if db available
      if (global.db && global.firebase?.firestore?.FieldValue) {
        try {
          const providerList = updatedUser.providerData.map(p => p.providerId);
          await global.db.collection("users").doc(baselineUid).set({
            linkedProviders: providerList,
            updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[AuthLinking] Firestore provider sync note:", dbErr.message);
        }
      }

      // Record audit log
      if (typeof global.writeClientAuditLog === "function") {
        try {
          await global.writeClientAuditLog("AUTH_PROVIDER_LINKED", {
            providerId: PROVIDER_IDS.GOOGLE,
            uid: baselineUid,
            email: updatedUser.email
          });
        } catch (_) {}
      }

      return {
        ok: true,
        uid: baselineUid,
        providerId: PROVIDER_IDS.GOOGLE,
        message: isEn
          ? "Google account linked successfully! Your Firebase UID and clinical records remain preserved."
          : "تم ربط حساب Google بنجاح! معرّف حسابك وسجلاتك الطبية محفوظة بالكامل."
      };
    } catch (err) {
      const code = String(err.code || "").toLowerCase();

      // Case 1: User closed popup or cancelled
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return {
          ok: false,
          canceled: true,
          code: err.code,
          error: isEn ? "Linking process was canceled by the user." : "تم إلغاء عملية الربط بواسطة المستخدم."
        };
      }

      // Case 2: Conflicting credential already associated with another user
      if (code === "auth/credential-already-in-use") {
        return {
          ok: false,
          conflict: true,
          code: err.code,
          error: isEn
            ? "This Google account is already linked to another Health Vibes profile. Medical records cannot be merged automatically."
            : "حساب Google هذا مرتبط بالفعل بملف مستخدم آخر في Health Vibes. لحماية سرية وسجلات المرضى الطبية، لا يمكن دمج الحسابات تلقائياً.",
          recoveryInstructions: {
            title: isEn ? "Authentication Conflict Resolution" : "حل تعارض وسيلة تسجيل الدخول",
            bodyEn: "To protect patient data integrity and clinical privacy, accounts and medical records are never merged automatically. To access records linked to that Google account, sign out and sign in using Google. If you own both accounts and require consolidation, contact clinical support.",
            bodyAr: "لحماية خصوصية وسجلات المرضى، لا يتم دمج السجلات الطبية أو الحسابات تلقائياً أبداً. للوصول إلى السجلات المرتبطة بحساب Google، يرجى تسجيل الخروج ثم تسجيل الدخول عبر Google مباشرة. إذا كنت تمتلك كلا الحسابين وترغب في نقل السجلات، يرجى مراجعة الدعم الطبي المعتمد.",
            steps: isEn
              ? ["1. Sign out of your current account.", "2. Sign in with Google directly to access that profile.", "3. Contact verified support if you need clinical record consolidation."]
              : ["1. تسجيل الخروج من الحساب الحالي.", "2. تسجيل الدخول بحساب Google مباشرة للوصول إلى ذلك الملف.", "3. مراجعة الدعم المعتمد إذا كنت بحاجة لنقل السجلات الطبية بعد إثبات الملكية."]
          }
        };
      }

      // Case 3: Re-authentication needed
      if (code === "auth/requires-recent-login") {
        return {
          ok: false,
          requiresRecentLogin: true,
          code: err.code,
          error: isEn
            ? "Security check: Please re-authenticate your current session before linking a new sign-in provider."
            : "فحص أمني: يرجى تأكيد هويتك في الجلسة الحالية قبل ربط وسيلة تسجيل دخول جديدة."
        };
      }

      // Case 4: Account disabled
      if (code === "auth/user-disabled") {
        return {
          ok: false,
          suspended: true,
          code: err.code,
          error: isEn
            ? "This account has been disabled by administration."
            : "تم تعطيل هذا الحساب بواسطة إدارة المنصة."
        };
      }

      return {
        ok: false,
        code: err.code || "auth/link-failed",
        error: err.message || (isEn ? "Failed to link Google account." : "فشل ربط حساب Google.")
      };
    }
  }

  /**
   * Links Email and Password to the active Firebase user via credential.
   * Enables password sign-in for users who registered via Google.
   * Preserves the Firebase UID and all clinical records.
   * @param {object} user - Active Firebase User
   * @param {string} password - New password
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async function linkPasswordProvider(user, password, options = {}) {
    const isEn = (global.currentLanguage || "ar") === "en";

    if (!user) {
      return {
        ok: false,
        code: "auth/no-current-user",
        error: isEn ? "Please sign in to link a password." : "يرجى تسجيل الدخول أولاً لتعيين كلمة المرور."
      };
    }

    if (isAccountSuspended(user)) {
      return {
        ok: false,
        code: "auth/user-disabled",
        error: isEn
          ? "This account is suspended by platform administration. Modifying authentication providers is currently blocked."
          : "هذا الحساب موقوف حالياً من قِبل إدارة المنصة. تم تجميد كافة عمليات ربط أو تعديل وسائل تسجيل الدخول."
      };
    }

    if (!password || password.length < 6) {
      return {
        ok: false,
        code: "auth/weak-password",
        error: isEn
          ? "Password must be at least 6 characters long."
          : "يجب ألا تقل كلمة المرور عن 6 خانات."
      };
    }

    const baselineUid = user.uid;
    const EmailAuthProvider = global.firebase?.auth?.EmailAuthProvider;
    if (!EmailAuthProvider) {
      return {
        ok: false,
        code: "auth/provider-unavailable",
        error: isEn ? "Email authentication provider is unavailable." : "خدمة البريد وكلمة المرور غير متوفرة حالياً."
      };
    }

    const email = options.email || user.email;
    if (!email) {
      return {
        ok: false,
        code: "auth/missing-email",
        error: isEn ? "No verified email associated with this account." : "لا يوجد بريد إلكتروني مسجل لهذا الحساب."
      };
    }

    const credential = EmailAuthProvider.credential(email, password);

    try {
      const result = await user.linkWithCredential(credential);
      const updatedUser = result.user || user;

      // STRICT SAFETY ASSERTION: Firebase UID must be 100% preserved
      if (updatedUser.uid !== baselineUid) {
        console.error(`CRITICAL SECURITY ANOMALY: UID changed from ${baselineUid} to ${updatedUser.uid}`);
        throw new Error("UID mutation detected during password linking. Process aborted.");
      }

      // Sync Firestore user profile
      if (global.db && global.firebase?.firestore?.FieldValue) {
        try {
          const providerList = updatedUser.providerData.map(p => p.providerId);
          await global.db.collection("users").doc(baselineUid).set({
            linkedProviders: providerList,
            hasPasswordSet: true,
            updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[AuthLinking] Firestore provider sync note:", dbErr.message);
        }
      }

      // Record audit log
      if (typeof global.writeClientAuditLog === "function") {
        try {
          await global.writeClientAuditLog("AUTH_PROVIDER_LINKED", {
            providerId: PROVIDER_IDS.PASSWORD,
            uid: baselineUid,
            email: updatedUser.email
          });
        } catch (_) {}
      }

      return {
        ok: true,
        uid: baselineUid,
        providerId: PROVIDER_IDS.PASSWORD,
        message: isEn
          ? "Password linked successfully! You can now sign in using your email and password."
          : "تم ربط كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول ببريدك وكلمة المرور."
      };
    } catch (err) {
      const code = String(err.code || "").toLowerCase();

      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        return {
          ok: false,
          conflict: true,
          code: err.code,
          error: isEn
            ? "An existing account is already registered with this email address and password."
            : "يوجد حساب مسجل بالفعل بهذا البريد الإلكتروني وكلمة المرور.",
          recoveryInstructions: {
            title: isEn ? "Email Conflict Notice" : "تنبيه تعارض البريد الإلكتروني",
            bodyEn: "To maintain medical record integrity, accounts are never merged automatically. If you already created an account with this email, please sign out and sign in using that account.",
            bodyAr: "لحماية سرية السجلات الطبية، لا يتم دمج الحسابات تلقائياً. إذا كان لديك حساب مسجل بهذا البريد مسبقاً، يرجى تسجيل الخروج ثم تسجيل الدخول بذلك الحساب."
          }
        };
      }

      if (code === "auth/requires-recent-login") {
        return {
          ok: false,
          requiresRecentLogin: true,
          code: err.code,
          error: isEn
            ? "Security check: Please re-authenticate your current session before adding a password."
            : "فحص أمني: يرجى تأكيد هويتك في الجلسة الحالية قبل إضافة كلمة المرور."
        };
      }

      if (code === "auth/weak-password") {
        return {
          ok: false,
          code: err.code,
          error: isEn ? "Password is too weak. Please use at least 6 characters." : "كلمة المرور ضعيفة جداً. يرجى استخدام 6 خانات على الأقل."
        };
      }

      return {
        ok: false,
        code: err.code || "auth/link-failed",
        error: err.message || (isEn ? "Failed to set password." : "فشل تعيين كلمة المرور.")
      };
    }
  }

  /**
   * Unlinks an authentication provider from the active Firebase user.
   * Strictly prevents removing the last usable sign-in method.
   * Preserves the Firebase UID and all clinical records.
   * @param {object} user - Active Firebase User
   * @param {string} providerId - "password" or "google.com"
   * @returns {Promise<object>}
   */
  async function unlinkProvider(user, providerId) {
    const isEn = (global.currentLanguage || "ar") === "en";

    // 1. Check whether unlinking is permitted
    const check = canUnlinkProvider(user, providerId);
    if (!check.allowed) {
      return {
        ok: false,
        code: check.reason,
        error: isEn ? check.messageEn : check.messageAr
      };
    }

    const baselineUid = user.uid;

    try {
      const updatedUser = await user.unlink(providerId);

      // STRICT SAFETY ASSERTION: Firebase UID must be 100% preserved
      if (updatedUser.uid !== baselineUid) {
        console.error(`CRITICAL SECURITY ANOMALY: UID changed from ${baselineUid} to ${updatedUser.uid}`);
        throw new Error("UID mutation detected during provider unlinking. Process aborted.");
      }

      // Sync Firestore user profile
      if (global.db && global.firebase?.firestore?.FieldValue) {
        try {
          const providerList = updatedUser.providerData.map(p => p.providerId);
          await global.db.collection("users").doc(baselineUid).set({
            linkedProviders: providerList,
            hasPasswordSet: providerList.includes(PROVIDER_IDS.PASSWORD),
            updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[AuthLinking] Firestore provider sync note:", dbErr.message);
        }
      }

      // Record audit log
      if (typeof global.writeClientAuditLog === "function") {
        try {
          await global.writeClientAuditLog("AUTH_PROVIDER_UNLINKED", {
            providerId,
            uid: baselineUid
          });
        } catch (_) {}
      }

      return {
        ok: true,
        uid: baselineUid,
        unlinkedProviderId: providerId,
        remainingProviders: updatedUser.providerData.map(p => p.providerId),
        message: isEn
          ? "Sign-in method unlinked successfully. Your Firebase UID and clinical records remain preserved."
          : "تم إلغاء ربط وسيلة تسجيل الدخول بنجاح. معرّف حسابك وسجلاتك الطبية محفوظة بالكامل."
      };
    } catch (err) {
      const code = String(err.code || "").toLowerCase();

      if (code === "auth/requires-recent-login") {
        return {
          ok: false,
          requiresRecentLogin: true,
          code: err.code,
          error: isEn
            ? "Security check: Unlinking a sign-in method requires recent authentication. Please re-authenticate."
            : "فحص أمني: إلغاء وسيلة تسجيل دخول يتطلب مصادقة حديثة. يرجى تأكيد هويتك أولاً."
        };
      }

      if (code === "auth/no-such-provider") {
        return {
          ok: false,
          code: err.code,
          error: isEn
            ? "This sign-in method is not linked to your account."
            : "وسيلة تسجيل الدخول هذه غير مرتبطة بحسابك."
        };
      }

      return {
        ok: false,
        code: err.code || "auth/unlink-failed",
        error: err.message || (isEn ? "Failed to unlink provider." : "فشل إلغاء ربط وسيلة تسجيل الدخول.")
      };
    }
  }

  /**
   * Resolves authentication conflicts during primary sign-in.
   * Catches `auth/account-exists-with-different-credential`.
   * Strictly prevents naive automatic record merging.
   * @param {object} error - Firebase Auth Error
   * @param {boolean} [isEn]
   * @returns {object} Recovery metadata
   */
  function handleAccountExistsConflict(error, isEn = false) {
    const email = error?.email || error?.customData?.email || "";
    return {
      isConflict: true,
      email,
      code: "auth/account-exists-with-different-credential",
      title: isEn ? "Account Exists with Password" : "الحساب مسجل مسبقاً بكلمة مرور",
      message: isEn
        ? "An account with this email address already exists using a password. To preserve clinical records and verify account control, please sign in with your email and password first. Once signed in, you can safely link Google from your Profile settings."
        : "يوجد حساب مسجل بهذا البريد مسبقاً باستخدام كلمة المرور. لحماية ملفك الطبي وإثبات ملكية الحساب، يرجى تسجيل الدخول بالبريد وكلمة المرور أولاً. بعد الدخول، يمكنك ربط حساب Google بأمان من إعدادات الملف الشخصي.",
      actionLabel: isEn ? "Sign In with Password" : "تسجيل الدخول بكلمة المرور",
      recoveryGuide: isEn
        ? "Step 1: Sign in using your email and password.\nStep 2: Navigate to your Profile > Authentication Methods.\nStep 3: Click 'Link Google Account' to securely connect both providers to your UID."
        : "الخطوة 1: تسجيل الدخول بالبريد الإلكتروني وكلمة المرور.\nالخطوة 2: الانتقال إلى الملف الشخصي > وسائل تسجيل الدخول.\nالخطوة 3: الضغط على 'ربط حساب Google' لربط الوسيلتين بمعرّفك الطبي UID بأمان."
    };
  }

  /**
   * Renders the Authentication Providers panel HTML for the Profile screen.
   * @param {object} user - Active Firebase User
   * @param {boolean} isEn - Language toggle
   * @returns {string} HTML snippet
   */
  function renderProviderManagementHtml(user, isEn = false) {
    if (!user) return "";

    const { providers, count, hasPassword, hasGoogle, canUnlink } = getLinkedProviders(user);
    const maskedUid = user.uid ? `${user.uid.slice(0, 6)}...${user.uid.slice(-4)}` : "--";

    return `
      <article class="panel auth-providers-panel" id="authProvidersCard" style="grid-column: 1 / -1; margin-top: 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--surface); padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--line); padding-bottom: 12px;">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 16px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
              <span>🔐</span> <span>${isEn ? "Authentication Providers & Account Linking" : "إدارة وسائل تسجيل الدخول وربط الحسابات"}</span>
            </h3>
            <p style="margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.5;">
              ${isEn
                ? "Connect Google and Email/Password for flexible access. Medical records are permanently bound to your Firebase UID."
                : "يمكنك ربط حسابك بـ Google وكلمة المرور للوصول المرن، مع الحفاظ الدائم على سجلك الطبي المرتبط بمعرّف الحساب."}
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="pill ok" style="font-size: 11px; padding: 4px 10px;" title="${user.uid}">
              🛡️ UID: ${maskedUid}
            </span>
            <span class="pill info" style="font-size: 11px; padding: 4px 10px;">
              ${isEn ? `${count} Active Method${count > 1 ? "s" : ""}` : `${count} وسيلة نشطة`}
            </span>
          </div>
        </div>

        <!-- Security Guarantee Notice -->
        <div style="background: rgba(14, 165, 164, 0.06); border: 1px dashed var(--teal); border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: var(--ink); line-height: 1.5; display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 14px; line-height: 1.2;">🛡️</span>
          <div>
            <strong>${isEn ? "Clinical Identity Security Policy:" : "سياسة أمان الهوية السريرية:"}</strong>
            <span>${isEn
              ? "Your medical records are tied exclusively to your Firebase UID. Providers can be safely linked or unlinked without altering your records. Accounts are never merged based solely on matching email strings."
              : "سجلاتك وتقاريرك الطبية مقترنة حصرياً بمعرّفك الرقمي UID. يتم ربط وفك الوسائل بأمان دون المساس ببياناتك. لا يتم دمج أي حسابات بناءً على تطابق نصوص البريد فقط."}</span>
          </div>
        </div>

        <!-- Provider Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 14px;">
          <!-- 1. GOOGLE PROVIDER CARD -->
          <div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface-2); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 20px; font-weight: 800; color: #ea4335;">G</span>
                  <strong style="font-size: 14px; color: var(--ink);">${isEn ? "Google Account" : "حساب Google"}</strong>
                </div>
                ${hasGoogle
                  ? `<span class="pill ok" style="font-size: 11px;">✓ ${isEn ? "Connected" : "متصل ومفعل"}</span>`
                  : `<span class="pill" style="font-size: 11px; background: rgba(0,0,0,0.06); color: var(--muted);">${isEn ? "Not Linked" : "غير مرتبط"}</span>`}
              </div>
              <p style="margin: 0 0 10px; font-size: 12px; color: var(--muted); line-height: 1.4;">
                ${hasGoogle
                  ? (isEn ? `Linked Google ID: ${user.email}` : `البريد المرتبط: ${user.email}`)
                  : (isEn ? "Sign in with one click using your verified Google profile." : "تسجيل الدخول السريع بنقرة واحدة بحسابك المعتمد.")}
              </p>
            </div>
            <div style="margin-top: 8px;">
              ${hasGoogle ? `
                <button type="button" class="soft-button" onclick="HealthVibes.AuthLinkingUI.handleUnlinkProvider('${PROVIDER_IDS.GOOGLE}')" style="width: 100%; font-size: 12px; padding: 6px 12px; justify-content: center; color: ${canUnlink ? '#dc2626' : 'var(--muted)'}; opacity: ${canUnlink ? '1' : '0.6'};" ${!canUnlink ? 'title="' + (isEn ? 'Cannot unlink the only sign-in method' : 'لا يمكن إلغاء الوسيلة الوحيدة') + '"' : ''}>
                  <span>🔗❌</span> <span>${isEn ? "Unlink Google" : "إلغاء ربط Google"}</span>
                </button>
              ` : `
                <button type="button" class="solid-button" onclick="HealthVibes.AuthLinkingUI.handleLinkGoogle()" style="width: 100%; font-size: 12px; padding: 7px 12px; justify-content: center; background: #ea4335; border-color: #ea4335;">
                  <span>🔗</span> <span>${isEn ? "Link Google Account" : "ربط حساب Google"}</span>
                </button>
              `}
            </div>
          </div>

          <!-- 2. EMAIL & PASSWORD PROVIDER CARD -->
          <div style="border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--surface-2); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 18px;">🔑</span>
                  <strong style="font-size: 14px; color: var(--ink);">${isEn ? "Email & Password" : "البريد وكلمة المرور"}</strong>
                </div>
                ${hasPassword
                  ? `<span class="pill ok" style="font-size: 11px;">✓ ${isEn ? "Password Set" : "مفعلة ونشطة"}</span>`
                  : `<span class="pill" style="font-size: 11px; background: rgba(0,0,0,0.06); color: var(--muted);">${isEn ? "No Password" : "غير معينة"}</span>`}
              </div>
              <p style="margin: 0 0 10px; font-size: 12px; color: var(--muted); line-height: 1.4;">
                ${hasPassword
                  ? (isEn ? `Account email: ${user.email}` : `البريد المعتمد: ${user.email}`)
                  : (isEn ? "Set a password so you can sign in directly using email and password." : "عيّن كلمة مرور للدخول المباشر بالبريد حتى في حال تعذر Google.")}
              </p>
            </div>
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              ${hasPassword ? `
                <button type="button" class="soft-button" onclick="HealthVibes.AuthLinkingUI.openSetPasswordModal()" style="flex: 1; font-size: 12px; padding: 6px 10px; justify-content: center;">
                  <span>✏️</span> <span>${isEn ? "Update Password" : "تغيير كلمة المرور"}</span>
                </button>
                <button type="button" class="soft-button" onclick="HealthVibes.AuthLinkingUI.handleUnlinkProvider('${PROVIDER_IDS.PASSWORD}')" style="flex: 1; font-size: 12px; padding: 6px 10px; justify-content: center; color: ${canUnlink ? '#dc2626' : 'var(--muted)'}; opacity: ${canUnlink ? '1' : '0.6'};" ${!canUnlink ? 'title="' + (isEn ? 'Cannot unlink the only sign-in method' : 'لا يمكن إلغاء الوسيلة الوحيدة') + '"' : ''}>
                  <span>🔗❌</span> <span>${isEn ? "Unlink" : "إلغاء كلمة المرور"}</span>
                </button>
              ` : `
                <button type="button" class="solid-button" onclick="HealthVibes.AuthLinkingUI.openSetPasswordModal()" style="width: 100%; font-size: 12px; padding: 7px 12px; justify-content: center; background: var(--teal); border-color: var(--teal);">
                  <span>🔑</span> <span>${isEn ? "Set Account Password" : "تعيين كلمة مرور للحساب"}</span>
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- Safety Rule Footer -->
        <div style="font-size: 11px; color: var(--muted); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <span>⚠️ ${isEn ? "Safety Requirement: At least one sign-in method must remain active at all times." : "شرط أمني: يجب الحفاظ على وسيلة تسجيل دخول واحدة نشطة على الأقل في جميع الأوقات."}</span>
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <span>🔐</span> <span>${isEn ? "Recent authentication enforced" : "محمي بالتحقق الأمني الحديث"}</span>
          </span>
        </div>
      </article>
    `;
  }

  const AuthLinking = {
    PROVIDER_IDS,
    getLinkedProviders,
    canUnlinkProvider,
    isAccountSuspended,
    assertClinicalRecordOwnership,
    reauthenticateUser,
    linkGoogleProvider,
    linkPasswordProvider,
    unlinkProvider,
    handleAccountExistsConflict,
    renderProviderManagementHtml
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.AuthLinking = AuthLinking;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AuthLinking;
  }
})(typeof window !== "undefined" ? window : globalThis);
