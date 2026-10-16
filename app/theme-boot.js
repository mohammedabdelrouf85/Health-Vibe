/**
 * Health Vibe AI - Immediate Pre-DOM Theme Bootstrapper
 * Prevents light/dark flashes (FOUC) by resolving and applying saved theme before DOM render.
 */

(function() {
  try {
    var savedTheme = localStorage.getItem("hv_theme") || "dark";
    if (savedTheme === "light") {
      document.documentElement.classList.add("hv-theme-light");
      document.documentElement.classList.remove("hv-theme-dark");
      if (document.body) {
        document.body.classList.remove("dark");
        document.body.classList.add("light");
      }
    } else {
      document.documentElement.classList.add("hv-theme-dark");
      document.documentElement.classList.remove("hv-theme-light");
      if (document.body) {
        document.body.classList.add("dark");
        document.body.classList.remove("light");
      }
    }
  } catch (e) {}
})();
