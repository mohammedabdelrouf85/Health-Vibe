/**
 * Health Vibe AI - Template Loader & Component Registry
 * 
 * Provides unified, dynamic loading and mounting of modular HTML view templates
 * and scoped component stylesheets across all Health Vibe modules:
 * - auth (modules/auth/auth-view.html, modules/auth/auth.css)
 * - patient (modules/patient/patient-view.html, modules/patient/patient.css)
 * - doctor (modules/doctor/doctor-view.html, modules/doctor/doctor.css)
 * - admin (modules/admin/admin-view.html, modules/admin/admin.css)
 * - appointments (modules/appointments/appointments-view.html, modules/appointments/appointments.css)
 * - assessment (modules/assessment/assessment-view.html, modules/assessment/assessment.css)
 * - reports (modules/reports/reports-view.html, modules/reports/reports.css)
 * - disease-dashboard, diabetes, hypertension, etc.
 * 
 * Design:
 * - Clean feature-folder isolation: Every feature owns its view template, CSS, service, and UI controller.
 * - Future-proof: Any new feature folder added in the future simply registers itself via `TemplateLoader.register()`.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HealthVibes = root.HealthVibes || {};
    root.HealthVibes.TemplateLoader = factory();
    root.TemplateLoader = root.HealthVibes.TemplateLoader;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var _registry = {
    auth: {
      templatePath: './modules/auth/auth-view.html',
      cssPath: './modules/auth/auth.css',
      targetId: 'authScreen'
    },
    patient: {
      templatePath: './modules/patient/patient-view.html',
      cssPath: './modules/patient/patient.css',
      targetId: 'screen-patient'
    },
    doctor: {
      templatePath: './modules/doctor/doctor-view.html',
      cssPath: './modules/doctor/doctor.css',
      targetId: 'screen-doctor'
    },
    admin: {
      templatePath: './modules/admin/admin-view.html',
      cssPath: './modules/admin/admin.css',
      targetId: 'screen-admin'
    },
    appointments: {
      templatePath: './modules/appointments/appointments-view.html',
      cssPath: './modules/appointments/appointments.css',
      targetId: 'screen-appointments'
    },
    assessment: {
      templatePath: './modules/assessment/assessment-view.html',
      cssPath: './modules/assessment/assessment.css',
      targetId: 'screen-assessment'
    },
    reports: {
      templatePath: './modules/reports/reports-view.html',
      cssPath: './modules/reports/reports.css',
      targetId: 'screen-report'
    },
    diabetes: {
      templatePath: './modules/diabetes/diabetes-view.html',
      cssPath: './modules/diabetes/diabetes.css',
      targetId: 'screen-diabetes'
    },
    hypertension: {
      templatePath: './modules/hypertension/hypertension-view.html',
      cssPath: './modules/hypertension/hypertension.css',
      targetId: 'screen-hypertension'
    },
    disease: {
      templatePath: './modules/disease/disease-dashboard-view.html',
      cssPath: './modules/disease/disease.css',
      targetId: 'screen-disease-dashboard'
    }
  };

  var _templateCache = {};
  var _loadedCss = {};

  /**
   * Register a new module or overwrite an existing registration.
   */
  function register(moduleName, config) {
    if (!moduleName || typeof moduleName !== 'string') return;
    _registry[moduleName] = Object.assign({}, _registry[moduleName] || {}, config);
  }

  /**
   * Load module template HTML asynchronously or from cache.
   */
  async function loadTemplate(moduleName) {
    if (_templateCache[moduleName]) {
      return _templateCache[moduleName];
    }

    var mod = _registry[moduleName];
    if (!mod || !mod.templatePath) {
      throw new Error('[TemplateLoader] Unknown module: ' + moduleName);
    }

    // In browser environment with fetch
    if (typeof fetch === 'function') {
      try {
        var res = await fetch(mod.templatePath);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var html = await res.text();
        _templateCache[moduleName] = html;
        return html;
      } catch (err) {
        console.warn('[TemplateLoader] Failed to fetch template from network:', mod.templatePath, err.message);
      }
    }

    // Fallback if existing DOM element is already in the document
    if (typeof document !== 'undefined' && mod.targetId) {
      var el = document.getElementById(mod.targetId);
      if (el) {
        var existingHtml = el.outerHTML;
        _templateCache[moduleName] = existingHtml;
        return existingHtml;
      }
    }

    return '';
  }

  /**
   * Inject module CSS dynamically if not already loaded.
   */
  function loadStylesheet(moduleName) {
    if (typeof document === 'undefined') return;
    var mod = _registry[moduleName];
    if (!mod || !mod.cssPath || _loadedCss[moduleName]) return;

    var linkId = 'module-css-' + moduleName;
    if (document.getElementById(linkId)) {
      _loadedCss[moduleName] = true;
      return;
    }

    var link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = mod.cssPath;
    document.head.appendChild(link);
    _loadedCss[moduleName] = true;
  }

  /**
   * Mount a module template into a target container.
   */
  async function mount(moduleName, targetContainerOrSelector) {
    if (typeof document === 'undefined') return null;

    loadStylesheet(moduleName);

    var container = typeof targetContainerOrSelector === 'string'
      ? document.querySelector(targetContainerOrSelector)
      : targetContainerOrSelector;

    if (!container) {
      console.warn('[TemplateLoader] Container not found for module:', moduleName);
      return null;
    }

    var html = await loadTemplate(moduleName);
    if (html) {
      container.innerHTML = html;
      if (typeof window.HealthVibes !== 'undefined' && typeof window.HealthVibes.applyTranslations === 'function') {
        window.HealthVibes.applyTranslations(container);
      }
    }
    return container;
  }

  /**
   * Get list of all registered modules.
   */
  function getRegisteredModules() {
    return Object.keys(_registry);
  }

  /**
   * Get configuration of a specific module.
   */
  function getModuleConfig(moduleName) {
    return _registry[moduleName] ? Object.assign({}, _registry[moduleName]) : null;
  }

  return {
    register: register,
    loadTemplate: loadTemplate,
    loadStylesheet: loadStylesheet,
    mount: mount,
    getRegisteredModules: getRegisteredModules,
    getModuleConfig: getModuleConfig
  };
});
