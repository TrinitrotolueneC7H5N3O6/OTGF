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
 *   data-position="right|left|center"   (default right)
 *   data-label="Chat with us"
 *   data-color="#111111"
 *
 * Optional page:
 *   data-target="#otgf"          (container selector, default #otgf)
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var nodes = document.querySelectorAll('script[src*="widget.js"]');
      return nodes.length ? nodes[nodes.length - 1] : null;
    })();
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
    (isPage ? "?start=page" : "?widget=1");

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
    var requestedPosition = (
      script.getAttribute("data-position") || "right"
    ).toLowerCase();
    var position =
      requestedPosition === "left" || requestedPosition === "right"
        ? requestedPosition
        : "center";
    var label = script.getAttribute("data-label") || "Chat with us";
    var color = script.getAttribute("data-color") || "#111111";

    var style = document.createElement("style");
    style.textContent = [
      "#otgf-widget-root{display:contents;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}",
      "#otgf-widget-root *{box-sizing:border-box;}",
      "#otgf-widget-bar{position:fixed;z-index:2147483000;right:20px;bottom:18px;max-width:calc(100vw - 40px);min-height:62px;display:none;align-items:center;gap:7px;padding:7px;border:1px solid rgba(16,24,40,.12);border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 14px 42px rgba(16,24,40,.2),0 2px 7px rgba(16,24,40,.08);backdrop-filter:blur(12px);}",
      "#otgf-widget-bar.is-ready{display:flex;}",
      "#otgf-launcher{all:unset;box-sizing:border-box;flex:0 0 46px;width:46px;height:46px;display:grid;place-items:center;border-radius:13px;cursor:pointer;transition:transform .18s ease;}",
      "#otgf-launcher:hover{transform:translateY(-1px);}",
      "#otgf-launcher:focus-visible{outline:3px solid rgba(47,112,255,.3);outline-offset:3px;}",
      "#otgf-launcher-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;background:" +
        color +
        ";color:#fff;}",
      "#otgf-launcher-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}",
      "#otgf-launcher-actions{min-width:0;max-width:min(520px,calc(100vw - 108px));display:flex;gap:7px;overflow-x:auto;padding:0;scrollbar-width:none;}",
      "#otgf-launcher-actions:empty{display:none;}",
      "#otgf-launcher-actions::-webkit-scrollbar{display:none;}",
      "#otgf-launcher-actions button{all:unset;box-sizing:border-box;flex:0 0 auto;min-height:34px;display:inline-flex;align-items:center;justify-content:center;padding:7px 12px;border:1px solid rgba(16,24,40,.1);border-radius:999px;background:#f2f4f7;color:#344054;font:650 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;white-space:nowrap;cursor:pointer;}",
      "#otgf-launcher-actions button:hover{background:#f2f4f7;color:#101828;transform:translateY(-1px);}",
      "#otgf-launcher-actions button[aria-expanded=true],#otgf-launcher-actions button[aria-expanded=true]:hover{background:#101828;color:#fff;}",
      "#otgf-launcher-actions button:focus-visible{outline:3px solid rgba(47,112,255,.3);outline-offset:2px;}",
      "#otgf-panel{position:fixed;z-index:2147483000;left:50%;bottom:94px;width:min(420px,calc(100vw - 24px));height:min(680px,calc(100vh - 118px));border-radius:18px;overflow:hidden;background:#fff;border:1px solid rgba(16,24,40,.12);box-shadow:0 24px 70px rgba(16,24,40,.25);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-50%) translateY(12px) scale(.985);transform-origin:center bottom;transition:opacity .18s ease,transform .22s cubic-bezier(.22,1,.36,1),visibility .18s;}",
      "#otgf-panel.is-open{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(-50%) translateY(0) scale(1);}",
      "#otgf-panel iframe{width:100%;height:100%;border:0;background:#fff;}",
      "#otgf-action-dialog{position:fixed;z-index:2147483001;left:50%;bottom:94px;width:min(420px,calc(100vw - 24px));height:min(680px,calc(100dvh - 118px));overflow:hidden;background:#fff;border:1px solid rgba(16,24,40,.12);border-radius:18px;box-shadow:0 24px 70px rgba(16,24,40,.25);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-50%) translateY(12px) scale(.985);transform-origin:center bottom;transition:opacity .18s ease,transform .22s cubic-bezier(.22,1,.36,1),visibility .18s;}",
      "#otgf-action-dialog.is-open{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(-50%) translateY(0) scale(1);}",
      "#otgf-action-dialog iframe{width:100%;height:100%;display:block;border:0;background:#fff;}",
      "#otgf-widget-root.otgf-position-left #otgf-widget-bar{right:auto;left:20px;}",
      "#otgf-widget-root.otgf-position-center #otgf-widget-bar{right:auto;left:50%;transform:translateX(-50%);}",
      "#otgf-widget-root.otgf-position-left #otgf-panel,#otgf-widget-root.otgf-position-left #otgf-action-dialog{left:20px;transform:translateY(12px) scale(.985);transform-origin:left bottom;}",
      "#otgf-widget-root.otgf-position-right #otgf-panel,#otgf-widget-root.otgf-position-right #otgf-action-dialog{right:20px;left:auto;transform:translateY(12px) scale(.985);transform-origin:right bottom;}",
      "#otgf-widget-root.otgf-position-left #otgf-panel.is-open,#otgf-widget-root.otgf-position-right #otgf-panel.is-open,#otgf-widget-root.otgf-position-left #otgf-action-dialog.is-open,#otgf-widget-root.otgf-position-right #otgf-action-dialog.is-open{transform:translateY(0) scale(1);}",
      "@media (max-width:480px){#otgf-widget-bar,#otgf-widget-root.otgf-position-left #otgf-widget-bar,#otgf-widget-root.otgf-position-center #otgf-widget-bar{right:10px;left:auto;bottom:12px;max-width:calc(100vw - 20px);transform:none;}#otgf-launcher-actions{max-width:calc(100vw - 88px);}#otgf-panel,#otgf-action-dialog,#otgf-widget-root.otgf-position-left #otgf-panel,#otgf-widget-root.otgf-position-right #otgf-panel,#otgf-widget-root.otgf-position-left #otgf-action-dialog,#otgf-widget-root.otgf-position-right #otgf-action-dialog,#otgf-widget-root.otgf-position-center #otgf-action-dialog{right:auto;left:10px;bottom:84px;width:calc(100vw - 20px);height:min(72vh,640px);transform:translateY(12px) scale(.985);transform-origin:center bottom;}#otgf-panel.is-open,#otgf-action-dialog.is-open,#otgf-widget-root.otgf-position-left #otgf-panel.is-open,#otgf-widget-root.otgf-position-right #otgf-panel.is-open,#otgf-widget-root.otgf-position-left #otgf-action-dialog.is-open,#otgf-widget-root.otgf-position-right #otgf-action-dialog.is-open{transform:translateY(0) scale(1);}}",
      "@media (prefers-reduced-motion:reduce){#otgf-launcher,#otgf-panel,#otgf-action-dialog{transition:none;}}",
    ].join("");

    var root = document.createElement("div");
    root.id = "otgf-widget-root";
    root.className = "otgf-position-" + position;

    var panel = document.createElement("div");
    panel.id = "otgf-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label);
    panel.setAttribute("aria-hidden", "true");

    var iframe = document.createElement("iframe");
    iframe.title = label;
    iframe.allow = "clipboard-write";
    iframe.src = embedPath;

    var actionDialog = document.createElement("div");
    actionDialog.id = "otgf-action-dialog";
    actionDialog.setAttribute("role", "dialog");
    actionDialog.setAttribute("aria-label", "Contact form");
    actionDialog.setAttribute("aria-hidden", "true");

    var actionIframes = Object.create(null);
    var actionIframe = null;

    function createActionIframe(id) {
      var nextIframe = document.createElement("iframe");
      nextIframe.title = "Contact form";
      nextIframe.allow = "clipboard-write";
      nextIframe.style.display = "none";
      nextIframe.setAttribute("data-action-id", id);
      nextIframe.src =
        origin +
        "/" +
        encodeURIComponent(slug) +
        "/embed?widget=1&action=" +
        encodeURIComponent(id);
      return nextIframe;
    }

    function ensureActionIframe(id) {
      if (!actionIframes[id]) {
        actionIframes[id] = createActionIframe(id);
        actionDialog.appendChild(actionIframes[id]);
      }
      return actionIframes[id];
    }

    var launcherActions = document.createElement("div");
    launcherActions.id = "otgf-launcher-actions";
    launcherActions.setAttribute("aria-label", "Quick contact options");

    var launcher = document.createElement("button");
    launcher.id = "otgf-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", label);
    launcher.setAttribute("aria-expanded", "false");
    launcher.title = label;
    launcher.innerHTML =
      '<span id="otgf-launcher-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.4-.7L4 20l1.5-4.4A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg></span>';

    var widgetBar = document.createElement("div");
    widgetBar.id = "otgf-widget-bar";
    widgetBar.appendChild(launcher);
    widgetBar.appendChild(launcherActions);
    var actionSignature = null;
    var activeActionId = null;
    widgetBar.classList.add("is-ready");

    function setOpen(open) {
      if (open) {
        panel.classList.add("is-open");
        panel.setAttribute("aria-hidden", "false");
        launcher.setAttribute("aria-expanded", "true");
      } else {
        panel.classList.remove("is-open");
        panel.setAttribute("aria-hidden", "true");
        launcher.setAttribute("aria-expanded", "false");
      }
    }

    function closeAction() {
      var closingId = activeActionId;
      actionDialog.classList.remove("is-open");
      actionDialog.setAttribute("aria-hidden", "true");
      actionIframe = null;
      activeActionId = null;
      launcherActions.querySelectorAll("button[aria-controls='otgf-action-dialog']").forEach(function (button) {
        button.setAttribute("aria-expanded", "false");
      });
      if (closingId && actionIframes[closingId]) {
        actionIframes[closingId].remove();
        delete actionIframes[closingId];
      }
    }

    function revealAction(id) {
      var nextActionIframe = actionIframes[id];
      if (
        activeActionId !== id ||
        !nextActionIframe
      ) {
        return;
      }
      Object.keys(actionIframes).forEach(function (frameId) {
        actionIframes[frameId].style.display = frameId === id ? "block" : "none";
      });
      actionIframe = nextActionIframe;
      actionDialog.classList.add("is-open");
      actionDialog.setAttribute("aria-hidden", "false");
    }

    function openAction(id) {
      if (activeActionId === id) {
        closeAction();
        return;
      }
      closeAction();
      setOpen(false);
      activeActionId = id;
      ensureActionIframe(id);
      launcherActions.querySelectorAll("button[aria-controls='otgf-action-dialog']").forEach(function (button) {
        button.setAttribute(
          "aria-expanded",
          button.getAttribute("data-action-id") === id ? "true" : "false",
        );
      });
      revealAction(id);
    }

    launcher.addEventListener("click", function () {
      var shouldOpen = !panel.classList.contains("is-open");
      closeAction();
      setOpen(shouldOpen);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setOpen(false);
        closeAction();
      }
    });

    window.addEventListener("message", function (e) {
      if (
        e.source === iframe.contentWindow &&
        e.data &&
        e.data.type === "otgf:close-widget"
      ) {
        setOpen(false);
        return;
      }
      if (
        actionIframe &&
        e.source === actionIframe.contentWindow &&
        e.data &&
        e.data.type === "otgf:close-action-modal"
      ) {
        closeAction();
        return;
      }
      if (
        e.data &&
        e.data.type === "otgf:action-ready" &&
        e.data.id &&
        actionIframes[e.data.id] &&
        e.source === actionIframes[e.data.id].contentWindow
      ) {
        actionIframes[e.data.id].setAttribute("data-ready", "true");
        revealAction(e.data.id);
        return;
      }
      if (
        e.source === iframe.contentWindow &&
        e.data &&
        e.data.type === "otgf:request-action-modal" &&
        e.data.id
      ) {
        openAction(e.data.id);
        return;
      }
      if (
        e.source === iframe.contentWindow &&
        e.data &&
        e.data.type === "otgf:widget-actions" &&
        Array.isArray(e.data.actions)
      ) {
        var liveChatOn = e.data.liveChat !== false;
        var nextActions = e.data.actions.slice(0, 8).filter(function (action) {
          return action && action.id && action.label;
        });
        var nextSignature = JSON.stringify({ liveChatOn: liveChatOn, actions: nextActions });
        if (nextSignature === actionSignature) return;
        actionSignature = nextSignature;
        launcher.style.display = liveChatOn ? "" : "none";
        if (!liveChatOn) setOpen(false);
        var actionFragment = document.createDocumentFragment();
        nextActions.forEach(function (action) {
          var actionButton = document.createElement("button");
          var usesDialog =
            action.quickBuild ||
            /^pre-quick-(form|scheduler|sms|email)-/.test(action.id);
          actionButton.type = "button";
          actionButton.textContent = String(action.label).slice(0, 80);
          actionButton.setAttribute("data-action-id", action.id);
          if (usesDialog) {
            ensureActionIframe(action.id);
            actionButton.setAttribute("aria-controls", "otgf-action-dialog");
            actionButton.setAttribute(
              "aria-expanded",
              activeActionId === action.id ? "true" : "false",
            );
          }
          actionButton.addEventListener("click", function () {
            if (usesDialog) {
              openAction(action.id);
              return;
            }
            if (
              action.kind === "call" ||
              action.kind === "sms" ||
              action.kind === "email"
            ) {
              window.location.href = action.href;
              return;
            }
            window.open(action.href, "_blank", "noopener,noreferrer");
          });
          actionFragment.appendChild(actionButton);
        });
        launcherActions.replaceChildren(actionFragment);
        Object.keys(actionIframes).forEach(function (id) {
          if (
            !nextActions.some(function (action) {
              return action.id === id;
            })
          ) {
            actionIframes[id].remove();
            delete actionIframes[id];
          }
        });
        if (
          activeActionId &&
          !nextActions.some(function (action) {
            return action.id === activeActionId;
          })
        ) {
          closeAction();
        }
        if (liveChatOn || nextActions.length) {
          widgetBar.classList.add("is-ready");
        } else {
          widgetBar.classList.remove("is-ready");
        }
      }
    });

    panel.appendChild(iframe);
    root.appendChild(style);
    root.appendChild(panel);
    root.appendChild(actionDialog);
    root.appendChild(widgetBar);
    document.body.appendChild(root);
  }

  function start() {
    loadWatch();
    if (isPage) mountPage();
    else mountBubble();
  }

  function loadWatch() {
    if (window.__OTGF_WATCH__) return;
    if (window.self !== window.top) return;
    if (new URLSearchParams(window.location.search).get("preview") === "1") {
      return;
    }
    var watch = document.createElement("script");
    watch.src = origin + "/watch.js?v=2";
    watch.async = true;
    watch.setAttribute("data-slug", slug);
    document.head.appendChild(watch);
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
