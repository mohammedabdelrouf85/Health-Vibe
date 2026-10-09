(function() {
  try {
    document.documentElement.classList.add("hv-theme-dark");
    document.documentElement.classList.remove("hv-theme-light");
    if (document.body) {
      document.body.classList.add("dark");
    }
    localStorage.setItem("hv_theme", "dark");
  } catch (e) {}
})();
