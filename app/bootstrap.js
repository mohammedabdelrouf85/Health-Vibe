(function() {
  try {
    var themeDefaultVersion = "2026-09-25-dark-v5";
    if (localStorage.getItem("hv_theme_default_version") !== themeDefaultVersion) {
      localStorage.setItem("hv_theme_default_version", themeDefaultVersion);
      localStorage.setItem("hv_theme", "dark");
    }
    var savedTheme = localStorage.getItem("hv_theme") || "dark";
    if (savedTheme === "light") {
      document.documentElement.classList.add("hv-theme-light");
      document.documentElement.classList.remove("hv-theme-dark");
    } else {
      document.documentElement.classList.remove("hv-theme-light");
      document.documentElement.classList.add("hv-theme-dark");
    }

    // Early language and direction sync (PRD 5.1)
    var initialLang = localStorage.getItem("hv_lang");
    if (!initialLang) {
      var navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
      initialLang = navLang.indexOf("ar") === 0 ? "ar" : "en";
    }
    if (initialLang === "ar") {
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    } else {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    }
    var hasSession = false;
    if (!hasSession) {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf("firebase:authUser:") === 0 || k.indexOf("firebase:persistence:") === 0)) {
          hasSession = true;
          break;
        }
      }
    }
    if (hasSession) {
      document.documentElement.classList.add("hv-has-session");
    }
  } catch (e) {}

  function showAuth() {
    var el = document.getElementById("authScreen");
    if (el) {
      el.classList.add("open");
      el.style.display = "grid";
    }
    if (typeof window.showSignInView === "function") window.showSignInView();
  }

  function hideAuth() {
    var el = document.getElementById("authScreen");
    if (el) {
      el.classList.remove("open");
      el.style.display = "none";
    }
  }

  function dismissLoader(immediate) {
    if (typeof window.dismissLoader === "function" && window.dismissLoader !== dismissLoader) {
      return window.dismissLoader(immediate);
    }
    var loader = document.getElementById("loader");
    if (!loader) return;
    loader.classList.add("is-done");
    loader.style.setProperty("display", "none", "important");
    loader.style.setProperty("pointer-events", "none", "important");
    loader.style.setProperty("opacity", "0", "important");
    loader.style.setProperty("visibility", "hidden", "important");
    loader.setAttribute("aria-hidden", "true");
    if (typeof loader.remove === "function" && loader.parentNode) {
      loader.remove();
    }
  }

  window.showAuth = showAuth;
  window.hideAuth = hideAuth;
  window.dismissLoader = dismissLoader;

  // Immediate check if document is already ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(dismissLoader, 100);
  }

  // Listen to both DOMContentLoaded and load
  document.addEventListener("DOMContentLoaded", function() {
    setTimeout(dismissLoader, 150);
  });

  window.addEventListener("load", function() {
    dismissLoader();
  }, { once: true });

  // Ultimate watchdog safety timer: under no circumstances should any user get stuck on the loader
  setTimeout(function() {
    dismissLoader();
    var publicSite = document.getElementById("publicSite");
    if (publicSite && !document.documentElement.classList.contains("hv-has-session")) {
      publicSite.classList.remove("is-hidden");
    }
  }, 1200);
})();
