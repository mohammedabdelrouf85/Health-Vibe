/**
 * Health Vibe AI - Disease Dashboard UI Renderer
 * 
 * Renders the unified patient Disease dashboard, prioritizing the next required action
 * and strictly displaying only real account data from the 4 modules.
 */

(function (global) {
  "use strict";

  const t = (key) => {
    if (global.app && global.app.i18n && global.app.i18n.t) {
      return global.app.i18n.t(key);
    }
    return key;
  };

  /**
   * Translates module state ID to localized string.
   */
  function getStateLabel(state) {
    const stateMap = {
      'not_started': 'diseaseDashboard.stateNotStarted',
      'information_requested': 'diseaseDashboard.stateInfoRequested',
      'awaiting_review': 'diseaseDashboard.stateAwaitingReview',
      'under_review': 'diseaseDashboard.stateUnderReview',
      'approved': 'diseaseDashboard.stateApproved',
      'no_data': 'diseaseDashboard.stateNoData'
    };
    return t(stateMap[state] || 'diseaseDashboard.stateNoData');
  }

  /**
   * Returns appropriate CSS classes for a state pill.
   */
  function getStateClasses(state) {
    const classMap = {
      'not_started': 'pill bg-surface-variant text-on-surface-variant',
      'information_requested': 'pill bg-error text-on-error',
      'awaiting_review': 'pill bg-secondary text-on-secondary',
      'under_review': 'pill bg-primary text-on-primary',
      'approved': 'pill bg-success text-on-success',
      'no_data': 'pill bg-surface-variant text-on-surface-variant opacity-75'
    };
    return classMap[state] || classMap['no_data'];
  }

  /**
   * Renders a single disease module card.
   */
  function renderModuleCard(moduleData) {
    const title = t(`diseaseDashboard.${moduleData.titleKey}`);
    const stateLabel = getStateLabel(moduleData.state);
    const stateClasses = getStateClasses(moduleData.state);
    const actionLabel = t(`diseaseDashboard.${moduleData.nextAction}`);
    
    // Add real data snippets safely without fabricating values
    let dataSnippet = '';
    if (moduleData.rawData) {
      const rd = moduleData.rawData;
      const metrics = [];
      if (rd.assessmentsCount > 0) metrics.push(`Assessments: ${rd.assessmentsCount}`);
      if (rd.readingsCount > 0) metrics.push(`Readings: ${rd.readingsCount}`);
      if (rd.reportsCount > 0) metrics.push(`Reports: ${rd.reportsCount}`);
      if (metrics.length > 0) {
        dataSnippet = `<div class="text-sm text-muted mt-2">${metrics.join(' • ')}</div>`;
      }
    }

    // Determine the button action/target based on module
    // In a real app, this would use the router to navigate to the specific module screen
    const navAction = `data-route="disease-${moduleData.id}"`;

    return `
      <div class="panel cursor-pointer hover-lift transition-all" ${navAction} tabindex="0" aria-label="${title}. State: ${stateLabel}">
        <div class="panel-head flex items-center justify-between">
          <h3 class="text-lg font-bold text-on-surface">${title}</h3>
          <span class="${stateClasses}" aria-hidden="true">${stateLabel}</span>
        </div>
        <div class="panel-body pt-2">
          <p class="text-on-surface font-medium mb-1">${actionLabel}</p>
          ${dataSnippet}
          <div class="mt-4 flex justify-end">
            <button class="action-button primary small" aria-label="Open ${title}">
              ${t('common.details')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Next Required Action banner based on highest priority state across all modules.
   */
  function renderNextActionBanner(modulesObj) {
    const modules = Object.values(modulesObj);
    
    // Prioritization hierarchy for Next Action
    let topPriority = null;
    let priorityModule = null;

    for (const mod of modules) {
      if (mod.state === 'information_requested') {
        topPriority = 'information_requested';
        priorityModule = mod;
        break; // Highest possible priority
      } else if (mod.state === 'awaiting_review' && topPriority !== 'information_requested') {
        topPriority = 'awaiting_review';
        priorityModule = mod;
      } else if (mod.state === 'under_review' && topPriority !== 'information_requested' && topPriority !== 'awaiting_review') {
        topPriority = 'under_review';
        priorityModule = mod;
      }
    }

    if (!priorityModule) {
      // If no urgent actions, check for not_started
      priorityModule = modules.find(m => m.state === 'not_started');
      if (priorityModule) topPriority = 'not_started';
    }

    if (!priorityModule) {
      return ''; // No action banner needed if all approved or no data
    }

    const title = t(`diseaseDashboard.${priorityModule.titleKey}`);
    const actionLabel = t(`diseaseDashboard.${priorityModule.nextAction}`);
    
    return `
      <div class="notice-card bg-primary-container text-on-primary-container mb-6 rounded-lg p-4 border-l-4 border-primary">
        <h3 class="font-bold mb-1">${t('diseaseDashboard.nextRequiredActionHeader')}</h3>
        <p class="mb-2"><strong>${title}:</strong> ${actionLabel}</p>
        <button class="action-button primary" data-route="disease-${priorityModule.id}">
          ${t('common.action')}
        </button>
      </div>
    `;
  }

  /**
   * Main render function for the Disease Dashboard screen.
   */
  async function renderScreen(containerEl) {
    if (!containerEl) return;
    
    const uid = global.app?.user?.uid;
    if (!uid) {
      containerEl.innerHTML = `<div class="p-8 text-center text-error">${t('auth.authRequired')}</div>`;
      return;
    }

    // Loading state
    containerEl.innerHTML = `
      <div class="p-8 text-center">
        <div class="spinner inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-muted" data-i18n="common.loading">${t('common.loading')}</p>
      </div>
    `;

    try {
      const data = await global.HealthVibes.DiseaseDashboardService.fetchDashboardData(uid);
      
      const bannerHtml = renderNextActionBanner(data);
      const gridHtml = `
        <div class="card-grid mt-4">
          ${renderModuleCard(data.diabetes)}
          ${renderModuleCard(data.hypertension)}
          ${renderModuleCard(data.bloodDisorders)}
          ${renderModuleCard(data.obesity)}
        </div>
      `;

      containerEl.innerHTML = `
        <section class="disease-dashboard-container max-w-7xl mx-auto p-4 md:p-8 animate-fade-in">
          <header class="mb-6">
            <h1 class="text-3xl font-bold text-on-surface" data-i18n="diseaseDashboard.title">${t('diseaseDashboard.title')}</h1>
            <p class="text-muted mt-2" data-i18n="diseaseDashboard.subtitle">${t('diseaseDashboard.subtitle')}</p>
          </header>
          
          ${bannerHtml}
          
          <h2 class="text-xl font-bold text-on-surface mb-4" data-i18n="diseaseDashboard.modulesOverview">${t('diseaseDashboard.modulesOverview')}</h2>
          ${gridHtml}

          <div class="mt-8 text-center text-sm text-muted">
            <p data-i18n="diseaseDashboard.moduleDataNotice">${t('diseaseDashboard.moduleDataNotice')}</p>
          </div>
        </section>
      `;

      // Attach routing listeners if global router exists
      if (global.app && typeof global.app.navigate === 'function') {
        const routeButtons = containerEl.querySelectorAll('[data-route]');
        routeButtons.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const route = btn.getAttribute('data-route');
            global.app.navigate(route);
          });
        });
      }

    } catch (err) {
      console.error("[DiseaseDashboardUI] Failed to render dashboard:", err);
      containerEl.innerHTML = `<div class="p-8 text-center text-error">${t('common.error')}</div>`;
    }
  }

  const DiseaseDashboardUI = {
    renderScreen
  };

  global.HealthVibes = global.HealthVibes || {};
  global.HealthVibes.DiseaseDashboardUI = DiseaseDashboardUI;

})(typeof window !== "undefined" ? window : globalThis);
