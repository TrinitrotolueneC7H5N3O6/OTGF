/**
 * OTGF storefront embed.
 *
 * Chat bubble (bottom-right, opens live chat):
 *   <script src="https://YOUR-HOST/widget.js" data-slug="your-slug" async></script>
 *
 * Contact page (inline, public page then chat):
 *   <div id="otgf"></div>
 *   <script src="https://YOUR-HOST/widget.js" data-slug="your-slug" data-mode="page" async></script>
 *
 * Optional bubble:
 *   data-position="right|left"   (default right)
 *   data-label="Chat with us"
 *   data-color="#111111"
 *
 * Optional page:
 *   data-target="#otgf"          (container selector, default #otgf)
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = (script.getAttribute("data-slug") || "").trim();
  if (!slug) {
    console.warn("[OTGF] widget.js needs data-slug=\"your-business-slug\"");
    return;
  }

  var mode = (script.getAttribute("data-mode") || "bubble").toLowerCase();
  if (mode === "contact") mode = "page";
  var isPage = mode === "page";
  var flag = isPage ? "__OTGF_PAGE__" : "__OTGF_WIDGET__";
  if (window[flag]) return;
  window[flag] = true;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    origin = window.location.origin;
  }

  var embedPath =
    origin +
    "/" +
    encodeURIComponent(slug) +
    "/embed" +
    (isPage ? "?start=page" : "");

  function mountPage() {
    var target = (script.getAttribute("data-target") || "#otgf").trim();
    var host = document.querySelector(target);
    if (!host) {
      host = document.createElement("div");
      host.id = target.indexOf("#") === 0 ? target.slice(1) : "otgf";
      if (script.parentNode) script.parentNode.insertBefore(host, script);
      else document.body.appendChild(host);
    }

    host.classList.add("otgf-page-host");
    var style = document.createElement("style");
    style.textContent =
      ".otgf-page-host{width:100%;min-height:640px;height:100%;}" +
      ".otgf-page-host iframe{width:100%;height:100%;min-height:640px;border:0;display:block;background:#fff;border-radius:12px;}";

    var iframe = document.createElement("iframe");
    iframe.title = "Contact us";
    iframe.allow = "clipboard-write";
    iframe.src = embedPath;

    host.appendChild(style);
    host.appendChild(iframe);
  }

  function mountBubble() {
    var position =
      (script.getAttribute("data-position") || "right").toLowerCase() === "left"
        ? "left"
        : "right";
    var label = script.getAttribute("data-label") || "Chat with us";
    var color = script.getAttribute("data-color") || "#111111";

    var style = document.createElement("style");
    style.textContent = [
      "#otgf-widget-root{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}",
      "#otgf-widget-root *{box-sizing:border-box;}",
      "#otgf-launcher{position:fixed;z-index:2147483000;bottom:20px;" +
        position +
        ":20px;width:56px;height:56px;border-radius:999px;border:none;cursor:pointer;",
      "background:" +
        color +
        ";color:#fff;display:grid;place-items:center;box-shadow:0 8px 24px rgba(16,24,40,.22);",
      "transition:transform .15s ease,box-shadow .15s ease;}",
      "#otgf-launcher:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(16,24,40,.28);}",
      "#otgf-launcher svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}",
      "#otgf-panel{position:fixed;z-index:2147483000;bottom:88px;" +
        position +
        ":20px;width:min(380px,calc(100vw - 24px));height:min(640px,calc(100vh - 110px));",
      "border-radius:16px;overflow:hidden;background:#fff;border:1px solid rgba(16,24,40,.12);",
      "box-shadow:0 18px 48px rgba(16,24,40,.22);display:none;}",
      "#otgf-panel.is-open{display:block;}",
      "#otgf-panel iframe{width:100%;height:100%;border:0;background:#fff;}",
      "@media (max-width:480px){#otgf-panel{left:8px;right:8px;width:auto;bottom:84px;height:min(72vh,640px);}}",
    ].join("");

    var root = document.createElement("div");
    root.id = "otgf-widget-root";

    var panel = document.createElement("div");
    panel.id = "otgf-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label);

    var iframe = document.createElement("iframe");
    iframe.title = label;
    iframe.allow = "clipboard-write";
    iframe.loading = "lazy";
    var loaded = false;

    var launcher = document.createElement("button");
    launcher.id = "otgf-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", label);
    launcher.title = label;
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    function setOpen(open) {
      if (open) {
        if (!loaded) {
          iframe.src = embedPath;
          loaded = true;
        }
        panel.classList.add("is-open");
        launcher.setAttribute("aria-expanded", "true");
      } else {
        panel.classList.remove("is-open");
        launcher.setAttribute("aria-expanded", "false");
      }
    }

    launcher.addEventListener("click", function () {
      setOpen(!panel.classList.contains("is-open"));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    panel.appendChild(iframe);
    root.appendChild(style);
    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);
  }

  function start() {
    if (isPage) mountPage();
    else mountBubble();
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
