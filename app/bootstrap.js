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
    var hasSession = localStorage.getItem("hv_user_logged_in") === "true" || !!localStorage.getItem("hv_active_session");
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

  window.showAuth = showAuth;
  window.hideAuth = hideAuth;
})();
