/**
 * Health Vibe AI - Permissions & RBAC Module
 * 
 * Centralizes role definitions, permissions matrix, screen access control,
 * and declarative route guards.
 */

(function (global) {
  "use strict";

  const ROLES = {
    PATIENT: "patient",
    DOCTOR_PENDING: "doctor_pending",
    DOCTOR: "doctor",
    CLINIC_ADMIN: "clinic_admin",
    SUPPORT: "support",
    SUPER_ADMIN: "super_admin"
  };

  const ADMIN_ROLES = [ROLES.CLINIC_ADMIN, ROLES.SUPER_ADMIN];
  const VALID_ROLES = Object.values(ROLES);

  const PERMISSIONS = {
    VIEW_PATIENT_DASHBOARD: "view:patient_dashboard",
    SUBMIT_ASSESSMENT: "submit:assessment",
    VIEW_OWN_CASES: "view:own_cases",
    APPLY_DOCTOR_VERIFICATION: "apply:doctor_verification",

    // Doctor permissions (Clinical - strictly for licensed medical professionals)
    VIEW_DOCTOR_QUEUE: "view:doctor_queue",
    REVIEW_CASE: "review:case",
    APPROVE_CASE: "approve:case",
    REJECT_CASE: "reject:case",

    // Admin permissions (Governance & Operations - strictly administrative & non-clinical)
    VIEW_ADMIN_DASHBOARD: "view:admin_dashboard",
    VIEW_AUDIT_LOG: "view:audit_log",
    APPROVE_DOCTOR_APPLICATION: "approve:doctor_application",
    REJECT_DOCTOR_APPLICATION: "reject:doctor_application",
    MANAGE_AI_MODELS: "manage:ai_models",
    MANAGE_USER_ROLES: "manage:user_roles",
    MANAGE_USERS: "manage:users",
    VIEW_SYSTEM_METRICS: "view:system_metrics"
  };

  const ROLE_PERMISSIONS_MAP = {
    [ROLES.PATIENT]: [
      PERMISSIONS.VIEW_PATIENT_DASHBOARD,
      PERMISSIONS.SUBMIT_ASSESSMENT,
      PERMISSIONS.VIEW_OWN_CASES,
      PERMISSIONS.APPLY_DOCTOR_VERIFICATION
    ],
    [ROLES.DOCTOR_PENDING]: [
      PERMISSIONS.VIEW_PATIENT_DASHBOARD,
      PERMISSIONS.VIEW_OWN_CASES,
      PERMISSIONS.APPLY_DOCTOR_VERIFICATION
    ],
    [ROLES.DOCTOR]: [
      PERMISSIONS.VIEW_DOCTOR_QUEUE,
      PERMISSIONS.REVIEW_CASE,
      PERMISSIONS.APPROVE_CASE,
      PERMISSIONS.REJECT_CASE,
      PERMISSIONS.VIEW_OWN_CASES
    ],
    [ROLES.CLINIC_ADMIN]: [
      PERMISSIONS.VIEW_ADMIN_DASHBOARD,
      PERMISSIONS.VIEW_DOCTOR_QUEUE,
      PERMISSIONS.VIEW_OWN_CASES,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.APPROVE_DOCTOR_APPLICATION,
      PERMISSIONS.REJECT_DOCTOR_APPLICATION,
      PERMISSIONS.MANAGE_AI_MODELS,
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.VIEW_SYSTEM_METRICS
    ],
    [ROLES.SUPPORT]: [PERMISSIONS.VIEW_SYSTEM_METRICS],
    [ROLES.SUPER_ADMIN]: [
      PERMISSIONS.VIEW_ADMIN_DASHBOARD,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.APPROVE_DOCTOR_APPLICATION,
      PERMISSIONS.REJECT_DOCTOR_APPLICATION,
      PERMISSIONS.MANAGE_AI_MODELS,
      PERMISSIONS.MANAGE_USER_ROLES,
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.VIEW_SYSTEM_METRICS,
      PERMISSIONS.VIEW_PATIENT_DASHBOARD,
      PERMISSIONS.VIEW_OWN_CASES
    ]
  };

  const ROLE_ALLOWED_SCREENS = {
    [ROLES.PATIENT]: [
      "patient", "consent", "profile", "assessment", "pending", "result",
      "history", "appointments", "feedback", "assistant", "report", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ],
    [ROLES.DOCTOR_PENDING]: [
      "patient", "verification", "history", "appointments", "feedback", "report", "profile", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ],
    [ROLES.DOCTOR]: [
      "doctor", "verification", "history", "appointments", "feedback", "report", "profile", "kpi", "patient", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ],
    [ROLES.CLINIC_ADMIN]: [
      "profile", "history", "appointments", "feedback", "doctor", "report", "admin", "audit", "kpi", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ],
    [ROLES.SUPPORT]: [
      "profile", "kpi", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ],
    [ROLES.SUPER_ADMIN]: [
      "patient", "consent", "profile", "assessment", "pending", "result",
      "history", "appointments", "feedback", "assistant", "verification",
      "doctor", "kpi", "report", "admin", "audit", "verify-report",
      "diabetes", "hypertension", "blood-disorders", "obesity"
    ]
  };

  const AUTH_REQUIRED_SCREENS = [
    "consent", "profile", "assessment", "pending", "result",
    "history", "appointments", "feedback", "assistant", "report",
    "verification", "doctor", "kpi", "admin", "audit",
    "diabetes", "hypertension", "blood-disorders", "obesity"
  ];

  const VERIFICATION_REQUIRED_SCREENS = [
    "assessment", "result", "doctor", "admin", "audit", "kpi", "report"
  ];

  const CONSENT_REQUIRED_SCREENS = ["assessment"];

  function normalizeRole(role, isOwner = false) {
    if (VALID_ROLES.includes(role)) return role;
    if (role === "admin" || role === "owner") return ROLES.CLINIC_ADMIN;
    if (isOwner) return ROLES.SUPER_ADMIN;
    return ROLES.PATIENT;
  }

  function isAdminRole(role) {
    return ADMIN_ROLES.includes(normalizeRole(role));
  }

  function isDoctorRole(role) {
    return normalizeRole(role) === ROLES.DOCTOR;
  }

  function isAnyDoctorRole(role) {
    const r = normalizeRole(role);
    return r === ROLES.DOCTOR || r === ROLES.DOCTOR_PENDING;
  }

  function isSupportRole(role) {
    return normalizeRole(role) === ROLES.SUPPORT;
  }

  function getRoleDefaultScreen(role) {
    const r = normalizeRole(role);
    if (isAdminRole(r)) return "admin";
    if (r === ROLES.DOCTOR) return "doctor";
    if (r === ROLES.DOCTOR_PENDING) return "verification";
    if (r === ROLES.SUPPORT) return "kpi";
    return "patient";
  }

  function hasPermission(permission, role = ROLES.PATIENT, isOwner = false) {
    if (isOwner) return true;
    const normalized = normalizeRole(role, isOwner);
    const perms = ROLE_PERMISSIONS_MAP[normalized] || [];
    return perms.includes(permission);
  }

  function canAccessScreen(screenName, role = ROLES.PATIENT, isOwner = false, tempAllowDoctorApplication = false) {
    const normalized = normalizeRole(role, isOwner);
    if (screenName === "verification" && tempAllowDoctorApplication && normalized === ROLES.PATIENT) {
      return true;
    }
    const allowed = ROLE_ALLOWED_SCREENS[normalized] || ROLE_ALLOWED_SCREENS[ROLES.PATIENT];
    return allowed.includes(screenName);
  }

  const Permissions = {
    ROLES,
    ADMIN_ROLES,
    VALID_ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS_MAP,
    ROLE_ALLOWED_SCREENS,
    AUTH_REQUIRED_SCREENS,
    VERIFICATION_REQUIRED_SCREENS,
    CONSENT_REQUIRED_SCREENS,
    normalizeRole,
    isAdminRole,
    isDoctorRole,
    isAnyDoctorRole,
    isSupportRole,
    getRoleDefaultScreen,
    hasPermission,
    canAccessScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.Permissions = Permissions;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Permissions;
  }
})(typeof window !== "undefined" ? window : globalThis);
