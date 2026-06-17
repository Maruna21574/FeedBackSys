/**
 * Feedback widget - vkladany skript pre weby klientov.
 *
 * Pouzitie:
 *   <script src="https://feedback.example.com/widget.js" data-project="PROJECT_TOKEN"></script>
 *
 * Vsetky elementy widgetu su pridane do #fbw-root a stylovane cez triedy s prefixom "fbw-"
 * (public/widget.css), aby sa minimalizoval konflikt so stylmi hostujuceho webu.
 */
(function () {
  "use strict";

  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var PROJECT_TOKEN = currentScript.getAttribute("data-project");
  if (!PROJECT_TOKEN) {
    console.error("[FeedbackWidget] Chyba atribút data-project v <script> tagu.");
    return;
  }

  var scriptUrl = new URL(currentScript.src, window.location.href);
  var API_ORIGIN = scriptUrl.origin;
  var API_BASE = API_ORIGIN + "/api/widget/" + PROJECT_TOKEN;
  // Vlastna kopia html2canvas (rovnaky origin ako widget.js), aby ju nezablokovala
  // CSP/firewall hostitelskej stranky (cdnjs.cloudflare.com by musel byt v allowliste).
  var HTML2CANVAS_URL = API_ORIGIN + "/vendor/html2canvas.min.js";

  var state = {
    items: [],
    view: "menu", // "menu" | "list"
    pickMode: false,
    pendingContext: null,
  };

  // -------------------------------------------------------------------------
  // Helper na vytvaranie elementov bez innerHTML (bezpecne pre user-generated text)
  // -------------------------------------------------------------------------
  function h(tag, attrs, children) {
    var element = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === "class") {
        element.className = value;
      } else if (key === "text") {
        element.textContent = value;
      } else if (key.indexOf("on") === 0 && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      if (typeof child === "string") element.appendChild(document.createTextNode(child));
      else element.appendChild(child);
    });
    return element;
  }

  function clearChildren(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  // -------------------------------------------------------------------------
  // Jednoduche SVG ikonky (staticke, bez innerHTML)
  // -------------------------------------------------------------------------
  var ICON_PATHS = {
    chat: "M4 4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v3.3c0 .45.49.71.85.46L13.7 17H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4z",
    pencil:
      "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    list: "M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z",
    send: "M3 11.5L21 3l-8.5 18-2-7.5-7.5-2z",
  };

  function svgIcon(name) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "fbw-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICON_PATHS[name] || "");
    svg.appendChild(path);
    return svg;
  }

  // -------------------------------------------------------------------------
  // Nacitanie stylov widgetu
  // -------------------------------------------------------------------------
  var styleLink = h("link", { rel: "stylesheet", href: API_ORIGIN + "/widget.css" });
  document.head.appendChild(styleLink);

  // -------------------------------------------------------------------------
  // Zaklad DOM struktury
  // -------------------------------------------------------------------------
  var root = h("div", { id: "fbw-root" });

  var launcher = h("button", { class: "fbw-launcher", type: "button" }, [
    svgIcon("chat"),
    h("span", { text: "Pridať feedback" }),
    h("span", { class: "fbw-badge", id: "fbw-launcher-badge", text: "0" }),
  ]);
  launcher.querySelector("#fbw-launcher-badge").style.display = "none";

  var panel = h("div", { class: "fbw-panel" });
  var panelBody = h("div", { class: "fbw-panel-body" });
  panel.appendChild(
    h("div", { class: "fbw-panel-header" }, [
      h("strong", { text: "Spätná väzba" }),
      h("button", { class: "fbw-panel-close", type: "button", "aria-label": "Zavrieť", onclick: closePanel }, ["×"]),
    ])
  );
  panel.appendChild(panelBody);

  var banner = h("div", { class: "fbw-banner" }, [
    h("span", { text: "Kliknite na miesto na stránke, ku ktorému sa vzťahuje poznámka." }),
    h("button", { type: "button", onclick: exitPickMode }, ["Zrušiť"]),
  ]);

  var pinsLayer = h("div", { id: "fbw-pins-layer" });

  // ---- Modal pre poznamku ----
  var modalTextarea = h("textarea", { placeholder: "Napíšte poznámku k vybranému miestu..." });
  var modalFileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
  var modalError = h("div", { class: "fbw-error" });
  var modalCancelBtn = h("button", { class: "fbw-btn fbw-btn-secondary", type: "button", onclick: closeModal }, ["Zrušiť"]);
  var modalSaveBtn = h("button", { class: "fbw-btn fbw-btn-primary", type: "button", onclick: handleSaveNote }, ["Uložiť poznámku"]);

  var modalOverlay = h("div", { class: "fbw-modal-overlay" }, [
    h("div", { class: "fbw-modal" }, [
      h("h3", { text: "Pridať poznámku" }),
      modalTextarea,
      h("div", { class: "fbw-field" }, [
        h("label", { text: "Príloha (voliteľné, obrázok)" }),
        modalFileInput,
      ]),
      modalError,
      h("div", { class: "fbw-modal-actions" }, [modalCancelBtn, modalSaveBtn]),
    ]),
  ]);

  var toast = h("div", { class: "fbw-toast" });
  var toastTimer = null;

  root.appendChild(launcher);
  root.appendChild(panel);
  root.appendChild(banner);
  root.appendChild(modalOverlay);
  root.appendChild(toast);
  root.appendChild(pinsLayer);

  // -------------------------------------------------------------------------
  // Panel - menu / zoznam ulozenych poznamok
  // -------------------------------------------------------------------------
  launcher.addEventListener("click", function () {
    if (state.pickMode) {
      exitPickMode();
      return;
    }
    if (panel.classList.contains("fbw-open")) {
      closePanel();
    } else {
      openPanel();
    }
  });

  function openPanel() {
    state.view = "menu";
    renderPanel();
    panel.classList.add("fbw-open");
    launcher.classList.add("fbw-active");
  }

  function closePanel() {
    panel.classList.remove("fbw-open");
    launcher.classList.remove("fbw-active");
  }

  function renderPanel() {
    clearChildren(panelBody);
    if (state.view === "list") {
      renderSavedList();
    } else {
      renderMenu();
    }
  }

  function renderMenu() {
    var draftCount = getDraftItems().length;
    var totalCount = state.items.length;

    panelBody.appendChild(
      h("button", { class: "fbw-menu-btn fbw-primary", type: "button", onclick: startPickMode }, [
        svgIcon("pencil"),
        h("span", { text: "Pridať poznámku" }),
      ])
    );

    panelBody.appendChild(
      h("button", { class: "fbw-menu-btn", type: "button", onclick: showSavedList }, [
        svgIcon("list"),
        h("span", { text: "Zobraziť poznámky" }),
        h("span", { class: "fbw-count", text: String(totalCount) }),
      ])
    );

    var submitBtn = h(
      "button",
      { class: "fbw-menu-btn", type: "button", onclick: submitAll },
      [svgIcon("send"), h("span", { text: "Odoslať nové poznámky (" + draftCount + ")" })]
    );
    if (draftCount === 0) submitBtn.setAttribute("disabled", "disabled");
    panelBody.appendChild(submitBtn);
  }

  function showSavedList() {
    state.view = "list";
    renderPanel();
  }

  function renderSavedList() {
    panelBody.appendChild(
      h("button", { class: "fbw-back-btn", type: "button", onclick: function () { state.view = "menu"; renderPanel(); } }, [
        "← Späť",
      ])
    );

    if (state.items.length === 0) {
      panelBody.appendChild(h("div", { class: "fbw-list-empty", text: "Zatiaľ ste nepridali žiadne poznámky." }));
      return;
    }

    var currentPageItems = getCurrentPageItems();
    var list = h("div", { class: "fbw-list" });

    state.items.forEach(function (item) {
      var pinIndex = currentPageItems.indexOf(item);
      var isDraft = item.status === "draft";
      var numEl =
        pinIndex >= 0
          ? h("span", { class: "fbw-list-num" + (isDraft ? "" : " fbw-list-num-submitted"), text: String(pinIndex + 1) })
          : h("span", { class: "fbw-list-num fbw-list-num-other", text: "•" });

      var statusLabels = { draft: "Rozpracované", new: "Nové", in_progress: "V riešení" };
      var statusEl = isDraft ? null : h("span", { class: "fbw-list-status", text: statusLabels[item.status] || item.status });

      var actionEl = isDraft
        ? h("button", { class: "fbw-list-delete", type: "button", "aria-label": "Zmazať poznámku", onclick: function () { deleteItem(item.id); } }, ["×"])
        : null;

      list.appendChild(
        h("div", { class: "fbw-list-item" + (isDraft ? "" : " fbw-list-item-submitted") }, [
          numEl,
          h("div", { class: "fbw-list-content" }, [
            h("div", { class: "fbw-list-text", text: item.note }),
            h("div", { class: "fbw-list-url", text: item.pageTitle || item.url }),
            statusEl,
          ]),
          actionEl,
        ])
      );
    });

    panelBody.appendChild(list);

    panelBody.appendChild(
      h("div", { class: "fbw-list-footer" }, [
        h(
          "button",
          { class: "fbw-menu-btn fbw-primary", type: "button", onclick: submitAll },
          [
            svgIcon("send"),
            h("span", { text: "Odoslať všetky poznámky" }),
            h("span", { class: "fbw-count", text: String(state.items.length) }),
          ]
        ),
      ])
    );
  }

  function getDraftItems() {
    return state.items.filter(function (item) { return item.status === "draft"; });
  }

  function updateBadge() {
    var badge = launcher.querySelector("#fbw-launcher-badge");
    var draftCount = getDraftItems().length;
    if (draftCount > 0) {
      badge.textContent = String(draftCount);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
    if (panel.classList.contains("fbw-open")) renderPanel();
  }

  // -------------------------------------------------------------------------
  // Rezim vyberu miesta na stranke
  // -------------------------------------------------------------------------
  function startPickMode() {
    closePanel();
    enterPickMode();
  }

  function enterPickMode() {
    state.pickMode = true;
    document.body.classList.add("fbw-pick-mode");
    banner.classList.add("fbw-open");
    launcher.classList.add("fbw-active");
  }

  function exitPickMode() {
    state.pickMode = false;
    document.body.classList.remove("fbw-pick-mode");
    banner.classList.remove("fbw-open");
    launcher.classList.remove("fbw-active");
  }

  document.addEventListener(
    "click",
    function (event) {
      if (!state.pickMode) return;
      if (root.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      var target = event.target;
      state.pendingContext = {
        x: event.pageX,
        y: event.pageY,
        selector: getCssSelector(target),
      };

      exitPickMode();
      openModal();
    },
    true
  );

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (state.pickMode) exitPickMode();
    else if (modalOverlay.classList.contains("fbw-open")) closeModal();
  });

  // -------------------------------------------------------------------------
  // CSS selector pre kliknuty element
  // -------------------------------------------------------------------------
  function cssEscape(value) {
    return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function getCssSelector(element) {
    if (!(element instanceof Element)) return "";

    var path = [];
    var current = element;
    var depth = 0;

    while (current && current.nodeType === 1 && current !== document.documentElement && depth < 6) {
      if (current.id) {
        path.unshift("#" + cssEscape(current.id));
        break;
      }

      var selector = current.nodeName.toLowerCase();
      var className = (current.getAttribute("class") || "").trim();
      if (className) {
        var firstClass = className.split(/\s+/)[0];
        selector += "." + cssEscape(firstClass);
      }

      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (c) {
          return c.nodeName === current.nodeName;
        });
        if (siblings.length > 1) {
          selector += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }

      path.unshift(selector);
      current = parent;
      depth += 1;
    }

    return path.join(" > ");
  }

  // -------------------------------------------------------------------------
  // Modal pre zadanie poznamky
  // -------------------------------------------------------------------------
  function openModal() {
    modalTextarea.value = "";
    modalFileInput.value = "";
    hideModalError();
    setModalBusy(false);
    modalOverlay.classList.add("fbw-open");
    setTimeout(function () { modalTextarea.focus(); }, 0);
  }

  function closeModal() {
    modalOverlay.classList.remove("fbw-open");
    state.pendingContext = null;
  }

  function showModalError(message) {
    modalError.textContent = message;
    modalError.classList.add("fbw-show");
  }

  function hideModalError() {
    modalError.textContent = "";
    modalError.classList.remove("fbw-show");
  }

  function setModalBusy(busy) {
    modalSaveBtn.disabled = busy;
    modalSaveBtn.textContent = busy ? "Ukladám..." : "Uložiť poznámku";
    modalCancelBtn.disabled = busy;
  }

  function handleSaveNote() {
    var noteText = modalTextarea.value.trim();
    if (!noteText) {
      showModalError("Zadajte text poznámky.");
      return;
    }
    if (!state.pendingContext) {
      showModalError("Nastala chyba, skúste to znova.");
      return;
    }

    hideModalError();
    setModalBusy(true);

    var context = state.pendingContext;
    var attachmentFile = modalFileInput.files && modalFileInput.files[0] ? modalFileInput.files[0] : null;

    captureScreenshot()
      .then(function (screenshotBlob) {
        var formData = new FormData();
        formData.append("note", noteText);
        formData.append("url", window.location.href);
        formData.append("pageTitle", document.title || "");
        formData.append("xPosition", String(Math.round(context.x)));
        formData.append("yPosition", String(Math.round(context.y)));
        formData.append("viewportWidth", String(window.innerWidth));
        formData.append("viewportHeight", String(window.innerHeight));
        formData.append("cssSelector", context.selector || "");
        if (screenshotBlob) formData.append("screenshot", screenshotBlob, "screenshot.png");
        if (attachmentFile) formData.append("attachment", attachmentFile, attachmentFile.name);

        return fetch(API_BASE + "/items", { method: "POST", body: formData }).then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) throw new Error(data.error || "Poznámku sa nepodarilo uložiť.");
            return { item: data.item, hasScreenshot: !!screenshotBlob };
          });
        });
      })
      .then(function (result) {
        state.items.push(result.item);
        renderPins();
        updateBadge();
        closeModal();
        if (result.hasScreenshot) {
          showToast("Poznámka bola uložená.");
        } else {
          showToast("Poznámka bola uložená (bez screenshotu - nepodarilo sa ho zachytiť).", true);
        }
      })
      .catch(function (err) {
        setModalBusy(false);
        showModalError(err.message || "Poznámku sa nepodarilo uložiť.");
      });
  }

  // -------------------------------------------------------------------------
  // Screenshot cez html2canvas (lazy load z CDN, s gracefully fallbackom)
  // -------------------------------------------------------------------------
  var html2canvasPromise = null;

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;

    html2canvasPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = HTML2CANVAS_URL;
      script.async = true;
      script.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error("html2canvas sa nenačítalo"));
      };
      script.onerror = function () {
        reject(new Error("html2canvas sa nepodarilo načítať"));
      };
      document.head.appendChild(script);
    });

    return html2canvasPromise;
  }

  function captureScreenshot() {
    return loadHtml2Canvas()
      .then(function (html2canvas) {
        return html2canvas(document.body, { useCORS: true, logging: false, scale: 1, imageTimeout: 8000 });
      })
      .then(function (canvas) {
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            resolve(blob);
          }, "image/png");
        });
      })
      .catch(function (err) {
        console.warn("[FeedbackWidget] Screenshot sa nepodarilo vytvoriť, pokračujem bez neho:", err);
        return null;
      });
  }

  // -------------------------------------------------------------------------
  // Piny na stranke
  // -------------------------------------------------------------------------
  function getCurrentPageItems() {
    return state.items.filter(function (item) {
      return item.url === window.location.href;
    });
  }

  // Zisti aktualnu poziciu pinu. Pri prvom zobrazeni si pre polozku
  // dohladame povodny element (cssSelector) a zapamatame relativny posun
  // klikuteho miesta voci jeho rozmerom - pri zmene velkosti okna sa tak pin
  // prepocita podla aktualnej pozicie/rozmerov toho elementu (responzivne
  // sledovanie), namiesto toho aby zostal "zamrznuty" na povodnych px.
  function getPinPosition(item) {
    if (item._rel === undefined) {
      item._rel = null;
      if (item.cssSelector) {
        try {
          var el = document.querySelector(item.cssSelector);
          if (el) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              item._rel = {
                el: el,
                relX: (item.xPosition - (rect.left + window.scrollX)) / rect.width,
                relY: (item.yPosition - (rect.top + window.scrollY)) / rect.height,
              };
            }
          }
        } catch (e) {
          item._rel = null;
        }
      }
    }

    if (item._rel && document.contains(item._rel.el)) {
      var r = item._rel.el.getBoundingClientRect();
      return {
        x: r.left + window.scrollX + item._rel.relX * r.width,
        y: r.top + window.scrollY + item._rel.relY * r.height,
      };
    }

    return { x: item.xPosition, y: item.yPosition };
  }

  function renderPins() {
    clearChildren(pinsLayer);
    var items = getCurrentPageItems();

    items.forEach(function (item, index) {
      var isDraft = item.status === "draft";
      var pin = h(
        "div",
        {
          class: "fbw-pin" + (isDraft ? "" : " fbw-pin-submitted"),
          title: item.note + (isDraft ? "" : " [" + item.status + "]"),
          onclick: function () {
            state.view = "list";
            openPanel();
          },
        },
        [String(index + 1)]
      );
      var pos = getPinPosition(item);
      pin.style.left = pos.x + "px";
      pin.style.top = pos.y + "px";
      pinsLayer.appendChild(pin);
    });
  }

  var pinResizeTimer = null;
  window.addEventListener("resize", function () {
    if (pinResizeTimer) clearTimeout(pinResizeTimer);
    pinResizeTimer = setTimeout(renderPins, 150);
  });

  // -------------------------------------------------------------------------
  // API komunikacia
  // -------------------------------------------------------------------------
  function fetchItems() {
    fetch(API_BASE + "/items")
      .then(function (response) { return response.json(); })
      .then(function (data) {
        state.items = data.items || [];
        renderPins();
        updateBadge();
      })
      .catch(function (err) {
        console.warn("[FeedbackWidget] Nepodarilo sa načítať uložené poznámky:", err);
      });
  }

  function deleteItem(id) {
    fetch(API_BASE + "/items/" + id, { method: "DELETE" })
      .then(function (response) {
        if (!response.ok) throw new Error("Zmazanie zlyhalo.");
        return response.json();
      })
      .then(function () {
        state.items = state.items.filter(function (item) { return item.id !== id; });
        renderPins();
        updateBadge();
        renderPanel();
      })
      .catch(function () {
        showToast("Poznámku sa nepodarilo zmazať.", true);
      });
  }

  function submitAll() {
    var drafts = getDraftItems();
    if (drafts.length === 0) {
      showToast("Nemáte žiadne neuložené poznámky na odoslanie.", true);
      return;
    }
    var confirmed = window.confirm(
      "Naozaj chcete odoslať " + drafts.length + " poznámok? Po odoslaní ich už nebude možné upraviť."
    );
    if (!confirmed) return;

    fetch(API_BASE + "/submit", { method: "POST" })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || "Odoslanie zlyhalo.");
          return data;
        });
      })
      .then(function () {
        fetchItems();
        closePanel();
        showToast("Ďakujeme za spätnú väzbu. Pripomienky boli odoslané.");
      })
      .catch(function (err) {
        showToast(err.message || "Odoslanie zlyhalo.", true);
      });
  }

  // -------------------------------------------------------------------------
  // Toast notifikacie
  // -------------------------------------------------------------------------
  function showToast(message, isError) {
    toast.textContent = message;
    toast.classList.toggle("fbw-toast-error", !!isError);
    toast.classList.add("fbw-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("fbw-show");
    }, 4000);
  }

  // -------------------------------------------------------------------------
  // Inicializacia
  // -------------------------------------------------------------------------
  function init() {
    document.body.appendChild(root);
    fetchItems();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
