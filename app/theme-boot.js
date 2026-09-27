(function() {
  try {
    var saved = localStorage.getItem("hv_theme") || "dark";
    if (saved === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  } catch (e) {}
})();
