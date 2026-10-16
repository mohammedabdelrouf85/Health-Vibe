/**
 * Health Vibe AI - Family Profiles & Dependents Service
 * 
 * Manages family member profiles (elderly parents, children, spouses, dependents)
 * under a primary account with strict medical record isolation (CliniDo / Vezeeta benchmark).
 */

(function (global) {
  "use strict";

  const RELATIONSHIPS = {
    father: { id: "father", ar: "أب (والد)", en: "Father", icon: "👴", category: "elderly" },
    mother: { id: "mother", ar: "أم (والدة)", en: "Mother", icon: "👵", category: "elderly" },
    son: { id: "son", ar: "ابن", en: "Son", icon: "👦", category: "child" },
    daughter: { id: "daughter", ar: "ابنة", en: "Daughter", icon: "👧", category: "child" },
    infant: { id: "infant", ar: "رضيع / طفل صغير", en: "Infant / Toddler", icon: "👶", category: "child" },
    spouse: { id: "spouse", ar: "زوج / زوجة", en: "Spouse", icon: "💍", category: "adult" },
    grandparent: { id: "grandparent", ar: "جد / جدة", en: "Grandparent", icon: "🧓", category: "elderly" },
    other: { id: "other", ar: "تابع / قريب", en: "Dependent / Other", icon: "🧑", category: "adult" }
  };

  const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

  // In-memory cache for fast local access
  const _familyCache = new Map();
  let _activeProfileId = null;

  /**
   * Calculates exact calendar age in years from date of birth.
   * @param {string|Date} dob 
   * @param {Date} [refDate]
   * @returns {number|null}
   */
  function calculateAge(dob, refDate = new Date()) {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;

    let age = refDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = refDate.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  /**
   * Calculates BMI from height in cm and weight in kg.
   * @param {number} heightCm 
   * @param {number} weightKg 
   * @returns {number|null}
   */
  function calculateBmi(heightCm, weightKg) {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (!h || !w || h <= 0 || w <= 0) return null;
    const heightM = h / 100;
    const bmi = w / (heightM * heightM);
    return Math.round(bmi * 10) / 10;
  }

  /**
   * Determines demographic category from age and relationship.
   * @param {number|null} age 
   * @param {string} relationship 
   * @returns {string} 'elderly' | 'child' | 'infant' | 'adult'
   */
  function categorizeDemographics(age, relationship) {
    if (age !== null) {
      if (age < 2) return "infant";
      if (age < 18) return "child";
      if (age >= 60) return "elderly";
      return "adult";
    }
    const rel = RELATIONSHIPS[relationship];
    return rel ? rel.category : "adult";
  }

  /**
   * Resolves appropriate avatar emoji and styling meta for a profile.
   * @param {object} member 
   * @returns {{ emoji: string, category: string, badgeLabelAr: string, badgeLabelEn: string }}
   */
  function getAvatarMeta(member = {}) {
    const relKey = member.relationship || "other";
    const relDef = RELATIONSHIPS[relKey] || RELATIONSHIPS.other;
    const age = typeof member.calculatedAge === "number" ? member.calculatedAge : calculateAge(member.dateOfBirth);
    const category = categorizeDemographics(age, relKey);

    const sex = String(member.biologicalSex || member.sex || "").toLowerCase();
    const isFemale = sex === "female" || relKey === "mother" || relKey === "daughter";

    let emoji = relDef.icon;
    if (category === "infant") emoji = "👶";
    else if (category === "child") {
      emoji = isFemale ? "👧" : "👦";
    } else if (category === "elderly") {
      emoji = isFemale ? "👵" : "👴";
    } else if (relKey === "spouse") {
      emoji = isFemale ? "👩" : "👨";
    }

    const badgeMap = {
      elderly: { ar: "كبار سن", en: "Elderly" },
      child: { ar: "طفل", en: "Child" },
      infant: { ar: "رضيع", en: "Infant" },
      adult: { ar: "بالغ", en: "Adult" }
    };

    return {
      emoji,
      category,
      badgeLabelAr: badgeMap[category]?.ar || "فرد عائلة",
      badgeLabelEn: badgeMap[category]?.en || "Family Member"
    };
  }

  /**
   * Validates family member data schema.
   * @param {object} input 
   * @returns {{ isValid: boolean, errors: string[], data?: object }}
   */
  function validateFamilyMember(input = {}) {
    const errors = [];
    if (!input || typeof input !== "object") {
      return { isValid: false, errors: ["Invalid input payload"] };
    }

    const name = String(input.name || input.fullName || "").trim();
    if (!name || name.length < 2) {
      errors.push("Name must be at least 2 characters long.");
    }
    if (name.length > 80) {
      errors.push("Name cannot exceed 80 characters.");
    }

    const relationship = String(input.relationship || "other").toLowerCase().trim();
    if (!RELATIONSHIPS[relationship]) {
      errors.push(`Invalid relationship. Must be one of: ${Object.keys(RELATIONSHIPS).join(", ")}`);
    }

    let calculatedAge = null;
    let dob = input.dateOfBirth || input.dob || null;
    if (dob) {
      const d = new Date(dob);
      if (isNaN(d.getTime())) {
        errors.push("Invalid date of birth format (must be YYYY-MM-DD).");
      } else if (d > new Date()) {
        errors.push("Date of birth cannot be in the future.");
      } else {
        calculatedAge = calculateAge(dob);
        if (calculatedAge !== null && calculatedAge > 125) {
          errors.push("Age cannot exceed 125 years.");
        }
      }
    }

    const biologicalSex = String(input.biologicalSex || input.sex || "not_specified").toLowerCase();
    let bloodType = "unknown";
    if (input.bloodType && input.bloodType !== "unknown") {
      if (VALID_BLOOD_TYPES.includes(input.bloodType)) {
        bloodType = input.bloodType;
      } else {
        errors.push(`Invalid blood type. Must be one of: ${VALID_BLOOD_TYPES.join(", ")}`);
      }
    }

    const heightCm = input.heightCm ? parseFloat(input.heightCm) : null;
    const weightKg = input.weightKg ? parseFloat(input.weightKg) : null;
    const bmi = (heightCm && weightKg) ? calculateBmi(heightCm, weightKg) : null;

    const parseList = (val) => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (typeof val === "string") return val.split(",").map(s => s.trim()).filter(Boolean);
      return [];
    };

    const rawConditions = (input.chronicDiseases !== undefined && input.chronicConditions === undefined)
      ? input.chronicDiseases
      : (input.chronicConditions !== undefined ? input.chronicConditions : input.chronicDiseases);
    const chronicConditions = parseList(rawConditions);
    const allergies = parseList(input.allergies);
    const rawMeds = (input.medications !== undefined && input.currentMedications === undefined)
      ? input.medications
      : (input.currentMedications !== undefined ? input.currentMedications : input.medications);
    const currentMedications = parseList(rawMeds);

    const nationalId = input.nationalId ? String(input.nationalId).replace(/\D/g, "") : null;
    const emergencyContact = {
      name: String(input.emergencyContact?.name || input.emergencyName || "").trim(),
      phone: String(input.emergencyContact?.phone || input.emergencyPhone || "").trim(),
      relationship: String(input.emergencyContact?.relationship || input.emergencyRelation || "").trim()
    };

    const notes = String(input.notes || input.specialCareNotes || "").trim().slice(0, 500);

    const cleanData = {
      name,
      relationship,
      dateOfBirth: dob ? String(dob).slice(0, 10) : null,
      calculatedAge,
      biologicalSex,
      bloodType,
      heightCm: (heightCm && heightCm >= 30 && heightCm <= 250) ? heightCm : null,
      weightKg: (weightKg && weightKg >= 2 && weightKg <= 300) ? weightKg : null,
      bmi,
      calculatedBmi: bmi,
      chronicConditions,
      chronicDiseases: chronicConditions,
      allergies,
      currentMedications,
      nationalId,
      emergencyContact,
      notes,
      category: categorizeDemographics(calculatedAge, relationship)
    };

    return {
      isValid: errors.length === 0,
      errors,
      data: cleanData
    };
  }

  /**
   * Generates a unique, collision-resistant family member ID.
   * @returns {string}
   */
  function generateMemberId() {
    const rand = Math.random().toString(36).substring(2, 8);
    return `fam_${Date.now()}_${rand}`;
  }

  /**
   * Retrieves all family members for a primary account.
   * @param {string} primaryUid 
   * @returns {Array<object>}
   */
  function getFamilyMembers(primaryUid) {
    if (!primaryUid) return [];
    if (_familyCache.has(primaryUid)) {
      return [..._familyCache.get(primaryUid)];
    }

    // Attempt local storage hydration
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`hv_family_members_${primaryUid}`);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            _familyCache.set(primaryUid, list);
            return [...list];
          }
        }
      } catch (err) {
        console.warn("[FamilyService] Local storage parse failed:", err);
      }
    }

    return [];
  }

  /**
   * Saves list of family members to memory and persistent storage.
   * @param {string} primaryUid 
   * @param {Array<object>} list 
   */
  function _saveMembers(primaryUid, list) {
    _familyCache.set(primaryUid, list);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`hv_family_members_${primaryUid}`, JSON.stringify(list));
      } catch (e) {}
    }
  }

  /**
   * Retrieves a single family member by ID.
   * @param {string} primaryUid 
   * @param {string} memberId 
   * @returns {object|null}
   */
  function getFamilyMemberById(primaryUid, memberId) {
    if (!primaryUid || !memberId) return null;
    const members = getFamilyMembers(primaryUid);
    return members.find(m => m.id === memberId) || null;
  }

  /**
   * Adds a new family member under a primary user account.
   * @param {string} primaryUid 
   * @param {object} input 
   * @returns {{ success: boolean, member?: object, error?: string }}
   */
  function addFamilyMember(primaryUid, input) {
    if (!primaryUid) return { success: false, error: "Primary user UID is required" };
    const validation = validateFamilyMember(input);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.join("; ") };
    }

    const members = getFamilyMembers(primaryUid);
    // Limit family members to 15 per account for reasonable mobile UX
    if (members.length >= 15) {
      return { success: false, error: "Maximum family members limit (15) reached." };
    }

    const now = new Date().toISOString();
    const member = {
      id: generateMemberId(),
      primaryUid,
      ...validation.data,
      createdAt: now,
      updatedAt: now
    };

    members.push(member);
    _saveMembers(primaryUid, members);

    return { success: true, member };
  }

  /**
   * Updates an existing family member profile.
   * @param {string} primaryUid 
   * @param {string} memberId 
   * @param {object} updates 
   * @returns {{ success: boolean, member?: object, error?: string }}
   */
  function updateFamilyMember(primaryUid, memberId, updates) {
    if (!primaryUid || !memberId) return { success: false, error: "Missing required identifiers" };
    const members = getFamilyMembers(primaryUid);
    const idx = members.findIndex(m => m.id === memberId);
    if (idx === -1) {
      return { success: false, error: "Family member not found" };
    }

    const existing = members[idx];
    const merged = { ...existing, ...updates };
    const validation = validateFamilyMember(merged);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.join("; ") };
    }

    const updated = {
      ...existing,
      ...validation.data,
      updatedAt: new Date().toISOString()
    };

    members[idx] = updated;
    _saveMembers(primaryUid, members);

    // If updated profile is active, dispatch change event
    if (_activeProfileId === memberId) {
      dispatchActiveProfileChange(primaryUid, updated);
    }

    return { success: true, member: updated };
  }

  /**
   * Removes a family member from the account.
   * @param {string} primaryUid 
   * @param {string} memberId 
   * @returns {{ success: boolean, error?: string }}
   */
  function removeFamilyMember(primaryUid, memberId) {
    if (!primaryUid || !memberId) return { success: false, error: "Missing required identifiers" };
    let members = getFamilyMembers(primaryUid);
    const existing = members.find(m => m.id === memberId);
    if (!existing) {
      return { success: false, error: "Family member not found" };
    }

    members = members.filter(m => m.id !== memberId);
    _saveMembers(primaryUid, members);

    // If active profile was the removed member, fall back to primary
    if (_activeProfileId === memberId) {
      setActiveProfile(primaryUid, null);
    }

    return { success: true };
  }

  /**
   * Returns the currently active profile context.
   * If null or 'primary', returns primary account holder context.
   * @param {string} primaryUid 
   * @param {object} [primaryUserData={}]
   * @returns {{ isPrimary: boolean, memberId: string|null, profile: object }}
   */
  function getActiveProfile(primaryUid, primaryUserData = {}) {
    if (!_activeProfileId || _activeProfileId === "primary" || !primaryUid) {
      return {
        isPrimary: true,
        memberId: null,
        profile: {
          id: primaryUid,
          name: primaryUserData.name || primaryUserData.displayName || "أنا (الملف الرئيسي)",
          relationship: "primary",
          category: "adult",
          ...primaryUserData
        }
      };
    }

    const member = getFamilyMemberById(primaryUid, _activeProfileId);
    if (member) {
      return {
        isPrimary: false,
        memberId: member.id,
        profile: member
      };
    }

    // Fallback if cached active ID no longer exists
    _activeProfileId = null;
    return getActiveProfile(primaryUid, primaryUserData);
  }

  /**
   * Dispatches custom event to notify all UI screens of profile switch.
   * @param {string} primaryUid 
   * @param {object} activeProfile 
   */
  function dispatchActiveProfileChange(primaryUid, activeProfile) {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      const isPrimary = !_activeProfileId || _activeProfileId === "primary";
      const event = new CustomEvent("familyProfileChanged", {
        detail: {
          primaryUid,
          activeProfileId: _activeProfileId,
          isPrimary,
          profile: activeProfile
        }
      });
      window.dispatchEvent(event);
    }
  }

  /**
   * Switches the active profile context.
   * @param {string} primaryUid 
   * @param {string|null} memberIdOrNull 'primary' | null | 'fam_...'
   * @param {object} [primaryUserData={}]
   * @returns {object} The newly active profile context
   */
  function setActiveProfile(primaryUid, memberIdOrNull, primaryUserData = {}) {
    if (!memberIdOrNull || memberIdOrNull === "primary") {
      _activeProfileId = null;
    } else {
      _activeProfileId = memberIdOrNull;
    }

    if (typeof localStorage !== "undefined" && primaryUid) {
      try {
        localStorage.setItem(`hv_active_profile_${primaryUid}`, _activeProfileId || "primary");
      } catch (e) {}
    }

    const active = getActiveProfile(primaryUid, primaryUserData);
    dispatchActiveProfileChange(primaryUid, active.profile);
    return active;
  }

  /**
   * Restores active profile selection from persistent storage.
   * @param {string} primaryUid 
   * @param {object} [primaryUserData={}]
   * @returns {object}
   */
  function restoreActiveProfile(primaryUid, primaryUserData = {}) {
    if (typeof localStorage !== "undefined" && primaryUid) {
      try {
        const saved = localStorage.getItem(`hv_active_profile_${primaryUid}`);
        if (saved && saved !== "primary") {
          const member = getFamilyMemberById(primaryUid, saved);
          if (member) {
            _activeProfileId = saved;
            return getActiveProfile(primaryUid, primaryUserData);
          }
        }
      } catch (e) {}
    }
    _activeProfileId = null;
    return getActiveProfile(primaryUid, primaryUserData);
  }

  /**
   * Tags clinical assessment case data with active family member context
   * to guarantee complete data isolation between family members.
   * @param {object} casePayload 
   * @param {object} activeContext 
   * @returns {object}
   */
  function tagCaseWithFamilyContext(casePayload = {}, activeContext = {}) {
    const isPrimary = activeContext.isPrimary !== false;
    const profile = activeContext.profile || {};

    if (isPrimary) {
      return {
        ...casePayload,
        isFamilyMember: false,
        familyMemberId: null,
        familyRelationship: null
      };
    }

    return {
      ...casePayload,
      isFamilyMember: true,
      familyMemberId: profile.id,
      familyRelationship: profile.relationship,
      patientName: profile.name || casePayload.patientName,
      patientAge: profile.calculatedAge ?? casePayload.patientAge,
      patientSex: profile.biologicalSex || profile.sex || casePayload.patientSex,
      familyDemographicCategory: profile.category
    };
  }

  /**
   * Filters a list of clinical records (assessments, reports, appointments)
   * by active profile ID to maintain complete record segregation.
   * @param {Array<object>} records 
   * @param {object} activeContext 
   * @returns {Array<object>}
   */
  function filterRecordsByActiveProfile(records = [], activeContext = {}) {
    if (!Array.isArray(records)) return [];
    const isPrimary = activeContext.isPrimary !== false;
    const memberId = activeContext.memberId;

    if (isPrimary) {
      // Primary records: either no familyMemberId, or isFamilyMember is false
      return records.filter(r => !r.familyMemberId || r.isFamilyMember === false);
    }

    // Dependent records: strictly match active member ID
    return records.filter(r => r.familyMemberId === memberId);
  }

  const FamilyProfilesService = {
    RELATIONSHIPS,
    VALID_BLOOD_TYPES,
    calculateAge,
    calculateBmi,
    categorizeDemographics,
    getAvatarMeta,
    validateFamilyMember,
    getFamilyMembers,
    getFamilyMemberById,
    addFamilyMember,
    updateFamilyMember,
    removeFamilyMember,
    getActiveProfile,
    setActiveProfile,
    restoreActiveProfile,
    tagCaseWithFamilyContext,
    filterRecordsByActiveProfile
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.FamilyProfilesService = FamilyProfilesService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FamilyProfilesService;
  }
})(typeof window !== "undefined" ? window : globalThis);
