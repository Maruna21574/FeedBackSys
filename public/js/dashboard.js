// Drobne interaktivne prvky admin/klientskeho dashboardu (bez build kroku).
(function () {
  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".copy-btn");
    if (!btn) return;

    var box = btn.closest(".snippet-box");
    var codeEl = box ? box.querySelector("code") : null;
    if (!codeEl) return;

    var text = codeEl.textContent;
    var originalLabel = btn.textContent;

    function showCopied() {
      btn.textContent = "Skopírované";
      setTimeout(function () {
        btn.textContent = originalLabel;
      }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied);
    } else {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showCopied();
    }
  });
})();
