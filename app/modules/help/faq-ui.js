/**
 * Health Vibe AI - Help & FAQ UI Controller (مرجع: Esaal)
 * Renders accordion items, manages keyboard navigation, real-time search,
 * feedback rating, and contact actions.
 */

(function (global) {
  "use strict";

  function Service() {
    return (global.HealthVibes && global.HealthVibes.FAQService) || (typeof require === "function" ? require("./faq-service") : null);
  }

  function I18n() {
    return global.HealthVibes && global.HealthVibes.I18n;
  }

  function t(key, fallback) {
    if (I18n() && typeof I18n().t === "function") {
      const res = I18n().t(key);
      if (res && res !== key) return res;
    }
    return fallback;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let activeCategory = "all";
  let searchQuery = "";
  let openFaqIds = new Set();
  let searchDebounceTimer = null;

  /**
   * Toggles the open/closed state of an FAQ accordion item.
   * @param {string} faqId
   */
  function toggleAccordion(faqId) {
    if (openFaqIds.has(faqId)) {
      openFaqIds.delete(faqId);
    } else {
      openFaqIds.add(faqId);
    }
    updateAccordionDom(faqId);
  }

  /**
   * Updates only the affected item in the DOM to prevent layout re-render.
   * @param {string} faqId
   */
  function updateAccordionDom(faqId) {
    const itemEl = document.getElementById(`faqItem_${faqId}`);
    if (!itemEl) return;

    const isOpen = openFaqIds.has(faqId);
    const headerBtn = itemEl.querySelector(".faq-accordion-header");
    const bodyEl = itemEl.querySelector(".faq-accordion-body");

    if (isOpen) {
      itemEl.classList.add("is-open");
      if (headerBtn) headerBtn.setAttribute("aria-expanded", "true");
      if (bodyEl) bodyEl.style.display = "block";
    } else {
      itemEl.classList.remove("is-open");
      if (headerBtn) headerBtn.setAttribute("aria-expanded", "false");
      if (bodyEl) bodyEl.style.display = "none";
    }
  }

  /**
   * Sets the active category filter and re-renders the accordion list.
   * @param {string} catId
   */
  function selectCategory(catId) {
    activeCategory = catId;
    renderListOnly();
    updateCategoryChipsUi();
  }

  /**
   * Updates active styling on category chips.
   */
  function updateCategoryChipsUi() {
    const chips = document.querySelectorAll(".faq-category-chip");
    chips.forEach(chip => {
      if (chip.getAttribute("data-cat") === activeCategory) {
        chip.classList.add("active");
        chip.setAttribute("aria-pressed", "true");
      } else {
        chip.classList.remove("active");
        chip.setAttribute("aria-pressed", "false");
      }
    });
  }

  /**
   * Handles search input changes with a 150ms debounce for 60fps responsiveness.
   * @param {string} val
   */
  function handleSearchInput(val) {
    searchQuery = val || "";
    const clearBtn = document.getElementById("faqSearchClear");
    if (clearBtn) {
      clearBtn.style.display = searchQuery ? "block" : "none";
    }

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderListOnly();
    }, 150);
  }

  function clearSearch() {
    searchQuery = "";
    const input = document.getElementById("faqSearchInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    const clearBtn = document.getElementById("faqSearchClear");
    if (clearBtn) clearBtn.style.display = "none";
    renderListOnly();
  }

  /**
   * Submits helpfulness rating for an item.
   * @param {string} faqId
   * @param {boolean} isHelpful
   * @param {HTMLElement} btnEl
   */
  function rateFaqItem(faqId, isHelpful, btnEl) {
    const svc = Service();
    if (!svc) return;

    try {
      svc.rateFaq(faqId, isHelpful);
      const row = btnEl.closest(".faq-feedback-row");
      if (row) {
        const isEn = (global.currentLanguage === "en");
        row.innerHTML = `<span style="color: var(--faq-teal); font-weight: 500;">✓ ${isEn ? "Thank you for your feedback!" : "شكراً لمشاركتك رأيك!"}</span>`;
      }
    } catch (e) {
      console.warn("Rating error:", e);
    }
  }

  /**
   * Renders only the accordion items list container.
   */
  function renderListOnly() {
    const listContainer = document.getElementById("faqAccordionListContainer");
    if (!listContainer) return;

    const svc = Service();
    if (!svc) return;

    const isEn = (global.currentLanguage === "en");
    const lang = isEn ? "en" : "ar";
    const items = svc.searchFaqs(searchQuery, activeCategory);

    if (items.length === 0) {
      listContainer.innerHTML = `
        <div class="faq-empty-state" role="status">
          <div class="faq-empty-icon">🔍</div>
          <h4 style="margin: 4px 0; color: var(--faq-text-main); font-size: 1.1rem;">
            ${isEn ? "No matching answers found" : "لم يتم العثور على إجابات مطابقة"}
          </h4>
          <p style="margin: 0; font-size: 0.9rem;">
            ${isEn ? "Try searching with different clinical keywords or reach out to our medical support below." : "جرب البحث بكلمات أخرى أو تواصل مع الدعم الطبي المباشر بالأسفل."}
          </p>
        </div>
      `;
      return;
    }

    const html = items.map(item => {
      const isOpen = openFaqIds.has(item.id);
      const questionText = item.question[lang] || item.question.ar;
      const answerText = item.answer[lang] || item.answer.ar;

      return `
        <article class="faq-accordion-item ${isOpen ? "is-open" : ""}" id="faqItem_${item.id}">
          <button 
            type="button" 
            class="faq-accordion-header" 
            id="faqHeader_${item.id}"
            aria-expanded="${isOpen ? "true" : "false"}"
            aria-controls="faqBody_${item.id}"
            onclick="HealthVibes.FAQUI.toggleAccordion('${item.id}')"
          >
            <span class="faq-question-title">
              <span class="faq-question-icon" aria-hidden="true">${item.icon || "❓"}</span>
              <span>${escapeHtml(questionText)}</span>
            </span>
            <span class="faq-chevron" aria-hidden="true">▼</span>
          </button>
          <div 
            class="faq-accordion-body" 
            id="faqBody_${item.id}" 
            role="region" 
            aria-labelledby="faqHeader_${item.id}"
            style="display: ${isOpen ? "block" : "none"};"
          >
            <p style="margin: 0;">${escapeHtml(answerText)}</p>
            <div class="faq-feedback-row">
              <span>${isEn ? "Was this answer helpful?" : "هل كانت هذه الإجابة مفيدة؟"}</span>
              <button 
                type="button" 
                class="faq-feedback-btn" 
                onclick="HealthVibes.FAQUI.rateFaqItem('${item.id}', true, this)"
                aria-label="${isEn ? "Yes, this answer was helpful" : "نعم، كانت مفيدة"}"
              >
                👍 ${isEn ? "Yes" : "نعم"}
              </button>
              <button 
                type="button" 
                class="faq-feedback-btn" 
                onclick="HealthVibes.FAQUI.rateFaqItem('${item.id}', false, this)"
                aria-label="${isEn ? "No, this was not helpful" : "لا، لم تكن كافية"}"
              >
                👎 ${isEn ? "No" : "لا"}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    listContainer.innerHTML = html;
  }

  /**
   * Main render method for mounting the FAQ & Help section into a container.
   * @param {HTMLElement|string} target
   */
  function renderFaqSection(target) {
    const container = typeof target === "string" ? document.getElementById(target) : target;
    if (!container) return;

    const svc = Service();
    if (!svc) return;

    const isEn = (global.currentLanguage === "en");
    const lang = isEn ? "en" : "ar";
    const categories = svc.CATEGORIES;

    container.innerHTML = `
      <section class="faq-section-container" aria-label="${isEn ? "Frequently Asked Questions & Medical Help" : "الأسئلة الشائعة والدعم الفني السريع"}">
        <header class="faq-header">
          <h2 class="faq-title">
            <span aria-hidden="true">💡</span>
            <span>${t("faq.title", isEn ? "Help & Frequently Asked Questions" : "الأسئلة الشائعة ودليل المريض")}</span>
          </h2>
          <p class="faq-subtitle">
            ${t("faq.subtitle", isEn ? "Find quick answers about our clinical workflow, physician reviews, and HIPAA-compliant privacy." : "إجابات وافية وموثوقة عن كيفية عمل الفحص الذكي، دور الطبيب البشري، وحماية سرية بياناتك الطبية.")}
          </p>
        </header>

        <div class="faq-emergency-banner" role="alert">
          <span class="banner-icon" aria-hidden="true">🚨</span>
          <div>
            <strong>${isEn ? "Emergency Notice:" : "تنبيه الحالات الطارئة:"}</strong>
            ${isEn ? " In case of severe chest pain, shortness of breath, or trauma, call emergency immediately (123 in Egypt)." : " في حال الشعور بآلام حادة بالصدر، ضيق تنفس شديد أو إغماء، توجه فوراً لأقرب طوارئ أو اتصل بالإسعاف 123."}
          </div>
        </div>

        <div class="faq-search-wrapper">
          <span class="faq-search-icon" aria-hidden="true">🔍</span>
          <input 
            type="search" 
            id="faqSearchInput" 
            class="faq-search-input" 
            placeholder="${isEn ? "Search questions, symptoms, or privacy..." : "ابحث عن أي سؤال، عَرَض مرضي، أو استفسار عن الخصوصية..."}"
            aria-label="${isEn ? "Search FAQ catalog" : "البحث في الأسئلة الشائعة"}"
            oninput="HealthVibes.FAQUI.handleSearchInput(this.value)"
          >
          <button 
            type="button" 
            id="faqSearchClear" 
            class="faq-search-clear" 
            onclick="HealthVibes.FAQUI.clearSearch()"
            aria-label="${isEn ? "Clear search query" : "مسح عبارة البحث"}"
          >✕</button>
        </div>

        <nav class="faq-categories" aria-label="${isEn ? "FAQ Categories" : "أقسام الأسئلة"}">
          ${categories.map(cat => `
            <button 
              type="button" 
              class="faq-category-chip ${cat.id === activeCategory ? "active" : ""}" 
              data-cat="${cat.id}"
              aria-pressed="${cat.id === activeCategory ? "true" : "false"}"
              onclick="HealthVibes.FAQUI.selectCategory('${cat.id}')"
            >
              <span aria-hidden="true">${cat.icon}</span>
              <span>${cat[lang] || cat.ar}</span>
            </button>
          `).join("")}
        </nav>

        <div class="faq-accordion-list" id="faqAccordionListContainer">
          <!-- Populated by renderListOnly() -->
        </div>

        <div class="faq-support-box">
          <div class="faq-support-header">
            <h3 class="faq-support-title">
              <span aria-hidden="true">🩺</span>
              <span>${isEn ? "Need further medical assistance?" : "هل لديك استفسار آخر أو تحتاج مساعدة مباشرة؟"}</span>
            </h3>
            <span style="font-size: 0.85rem; color: var(--faq-text-muted);">
              ${isEn ? "Medical team available daily" : "الفريق الطبي متاح يومياً"}
            </span>
          </div>
          <p style="margin: 0; font-size: 0.92rem; color: var(--faq-text-main); line-height: 1.5;">
            ${isEn ? "Our certified clinical support coordinators are ready to assist you or connect you with the appropriate specialty." : "منسقو الرعاية الطبية جاهزون للإجابة على استفساراتك وتوجيهك للتخصص الطبي المناسب."}
          </p>
          <div class="faq-support-actions">
            <a 
              href="https://wa.me/201000000000?text=HealthVibe%20Support" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="faq-action-btn faq-action-whatsapp"
              aria-label="${isEn ? "Chat with medical support on WhatsApp" : "تواصل مع الدعم الطبي عبر واتساب"}"
            >
              <span>💬</span> <span>${isEn ? "WhatsApp Support" : "محادثة فورية (واتساب)"}</span>
            </a>
            <button 
              type="button" 
              class="faq-action-btn faq-action-ticket"
              onclick="HealthVibes.FAQUI.openInquiryModal()"
            >
              <span>✉️</span> <span>${isEn ? "Send Question to Doctor" : "إرسال سؤال للطبيب المشرف"}</span>
            </button>
          </div>
        </div>
      </section>
    `;

    renderListOnly();
  }

  function openInquiryModal() {
    const isEn = (global.currentLanguage === "en");
    const question = prompt(isEn ? "Please enter your question for the medical support team:" : "يرجى كتابة استفسارك للفريق الطبي:");
    if (!question || question.trim().length < 5) return;

    const svc = Service();
    if (svc) {
      try {
        const res = svc.submitSupportInquiry({ message: question });
        const successMsg = isEn ? `Your inquiry (${res.ticketId}) has been received. Our clinical coordinator will respond shortly.` : `تم استلام استفسارك بنجاح برقم (${res.ticketId}). سيتواصل معك المنسق الطبي قريباً.`;
        if (typeof global.showToast === "function") {
          global.showToast(successMsg, "success");
        } else {
          alert(successMsg);
        }
      } catch (err) {
        alert(err.message);
      }
    }
  }

  const FAQUI = {
    renderFaqSection,
    toggleAccordion,
    selectCategory,
    handleSearchInput,
    clearSearch,
    rateFaqItem,
    openInquiryModal
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FAQUI;
  } else {
    global.HealthVibes = global.HealthVibes || {};
    global.HealthVibes.FAQUI = FAQUI;
  }
})(typeof window !== "undefined" ? window : global);
