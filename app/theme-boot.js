(function() {
  try {
    var savedTheme = localStorage.getItem("hv_theme") || "dark";
    if (savedTheme === "light") {
      document.documentElement.classList.add("hv-theme-light");
      document.documentElement.classList.remove("hv-theme-dark");
      document.documentElement.setAttribute("data-theme", "light");
      if (document.body) {
        document.body.classList.remove("dark");
        document.body.classList.add("light");
      }
    } else {
      document.documentElement.classList.add("hv-theme-dark");
      document.documentElement.classList.remove("hv-theme-light");
      document.documentElement.setAttribute("data-theme", "dark");
      if (document.body) {
        document.body.classList.add("dark");
        document.body.classList.remove("light");
      }
    }
  } catch (e) {}
})();
