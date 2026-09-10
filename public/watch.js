/**
 * OTGF site watch — paste on any page to measure what visitors do.
 *
 *   <script src="https://YOUR-HOST/watch.js" data-slug="your-slug" async></script>
 *
 * Does not record typed text, passwords, or form values.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = (script.getAttribute("data-slug") || "").trim();
  if (!slug) {
    console.warn("[OTGF] watch.js needs data-slug=\"your-business-slug\"");
    return;
  }
  if (window.__OTGF_WATCH__) return;
  if (window.self !== window.top) return;
  window.__OTGF_WATCH__ = true;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    origin = window.location.origin;
  }

  var endpoint =
    origin +
    "/api/spaces/" +
    encodeURIComponent(slug) +
    "/insights";

  function sid() {
    var key = "otgf-watch:" + slug;
    try {
      var existing = sessionStorage.getItem(key);
      if (existing && /^w_[a-z0-9]{8,40}$/i.test(existing)) return existing;
      var next =
        "w_" +
        Math.random().toString(36).slice(2, 10) +
        Date.now().toString(36);
      sessionStorage.setItem(key, next);
      return next;
    } catch (err) {
      return (
        "w_" +
        Math.random().toString(36).slice(2, 10) +
        Date.now().toString(36)
      );
    }
  }

  function pathOf() {
    return window.location.pathname || "/";
  }

  function pageUrl() {
    return String(window.location.href || "").split("#")[0].slice(0, 240);
  }

  function docSize() {
    var el = document.documentElement;
    var body = document.body;
    return {
      w: Math.max(
        el ? el.scrollWidth : 0,
        body ? body.scrollWidth : 0,
        window.innerWidth || 0,
        1,
      ),
      h: Math.max(
        el ? el.scrollHeight : 0,
        body ? body.scrollHeight : 0,
        window.innerHeight || 0,
        1,
      ),
    };
  }

  function viewport() {
    return { w: window.innerWidth || 0, h: window.innerHeight || 0 };
  }

  function scrollDepth() {
    var el = document.documentElement;
    var body = document.body;
    var height = Math.max(
      el ? el.scrollHeight : 0,
      body ? body.scrollHeight : 0,
    );
    var view = window.innerHeight || 0;
    if (height <= view + 8) return 100;
    var top = window.scrollY || el.scrollTop || 0;
    return Math.max(
      0,
      Math.min(100, Math.round(((top + view) / height) * 100)),
    );
  }

  function isIgnored(node) {
    if (!node || node.nodeType !== 1) return true;
    return Boolean(
      node.closest(
        "#otgf-widget-root,#otgf-page-host,[data-otgf-ignore],input,textarea,select,option",
      ),
    );
  }

  function isInteractive(node) {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(
      node.closest(
        "a,button,summary,[role=button],[role=link],label,input,select,textarea,video,audio",
      ),
    );
  }

  function clickLabel(node) {
    if (!node || node.nodeType !== 1) return "";
    var target = node.closest(
      "a,button,summary,[role=button],[role=link],h1,h2,h3,p,li,span,div",
    );
    if (!target) target = node;
    var text = (
      target.getAttribute("aria-label") ||
      target.getAttribute("title") ||
      target.innerText ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 60) text = text.slice(0, 57) + "…";
    if (text) return text;
    var id = target.id ? "#" + target.id : "";
    return (target.tagName.toLowerCase() + id).slice(0, 40);
  }

  var sessionId = sid();
  var startedAt = new Date().toISOString();
  var t0 = Date.now();
  var queue = [];
  var lastPath = "";
  var lastScrollSent = -1;
  var maxScroll = 0;
  var lastClicks = [];
  var flushTimer = 0;

  function pushEvent(type, extra) {
    var row = {
      t: Date.now() - t0,
      type: type,
      path: pathOf(),
      url: pageUrl(),
    };
    if (extra) {
      if (extra.label) row.label = extra.label;
      if (typeof extra.x === "number") row.x = extra.x;
      if (typeof extra.y === "number") row.y = extra.y;
      if (typeof extra.depth === "number") row.depth = extra.depth;
    }
    queue.push(row);
    if (queue.length >= 12) flush();
  }

  function pageview() {
    var next = pathOf();
    if (next === lastPath) return;
    lastPath = next;
    lastScrollSent = -1;
    pushEvent("page");
  }

  function flush() {
    if (!queue.length) return;
    var events = queue.splice(0, queue.length);
    var payload = JSON.stringify({
      sessionId: sessionId,
      startedAt: startedAt,
      referrer: document.referrer || "",
      viewport: viewport(),
      durationMs: Date.now() - t0,
      events: events,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, payload);
        return;
      }
    } catch (err) {
      /* fall through */
    }
    try {
      fetch(endpoint, {
        method: "POST",
        body: payload,
        keepalive: true,
        mode: "cors",
      }).catch(function () {});
    } catch (err2) {
      /* ignore */
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(function () {
      flushTimer = 0;
      flush();
    }, 4000);
  }

  pageview();
  maxScroll = scrollDepth();
  pushEvent("scroll", { depth: maxScroll });
  scheduleFlush();

  document.addEventListener(
    "click",
    function (e) {
      var node = e.target;
      if (isIgnored(node)) return;
      var size = docSize();
      var pageX = e.pageX || e.clientX + (window.scrollX || 0);
      var pageY = e.pageY || e.clientY + (window.scrollY || 0);
      var x = Math.round((pageX / size.w) * 1000) / 10;
      var y = Math.round((pageY / size.h) * 1000) / 10;
      var label = clickLabel(node);
      var now = Date.now();
      lastClicks.push({ at: now, x: x, y: y, label: label });
      lastClicks = lastClicks.filter(function (hit) {
        return now - hit.at < 900;
      });
      var rage = lastClicks.filter(function (hit) {
        return (
          hit.label === label &&
          Math.abs(hit.x - x) < 8 &&
          Math.abs(hit.y - y) < 8
        );
      });
      if (rage.length >= 3) {
        pushEvent("rage", { label: label, x: x, y: y });
        lastClicks = [];
      } else if (!isInteractive(node)) {
        pushEvent("dead", { label: label, x: x, y: y });
      } else {
        pushEvent("click", { label: label, x: x, y: y });
      }
      scheduleFlush();
    },
    true,
  );

  window.addEventListener(
    "scroll",
    function () {
      var depth = scrollDepth();
      if (depth <= maxScroll) return;
      maxScroll = depth;
      if (depth < lastScrollSent + 15 && depth < 100) return;
      lastScrollSent = depth;
      pushEvent("scroll", { depth: depth });
      scheduleFlush();
    },
    { passive: true },
  );

  window.addEventListener("popstate", pageview);
  var pushState = history.pushState;
  var replaceState = history.replaceState;
  history.pushState = function () {
    var result = pushState.apply(this, arguments);
    pageview();
    return result;
  };
  history.replaceState = function () {
    var result = replaceState.apply(this, arguments);
    pageview();
    return result;
  };

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      pushEvent("leave");
      flush();
    }
  });
  window.addEventListener("pagehide", function () {
    pushEvent("leave");
    flush();
  });

  function captureSnapshot() {
    var key = "otgf-watch-shot:" + slug + ":" + pathOf();
    try {
      if (sessionStorage.getItem(key)) return;
    } catch (err) {
      /* ignore */
    }
    var shotSrc = origin + "/html2canvas.min.js";
    var started = false;

    function ignoreEl(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.id === "otgf-widget-root") return true;
      var tag = String(el.tagName || "").toUpperCase();
      return tag === "IFRAME" || tag === "VIDEO" || tag === "CANVAS";
    }

    function shotOptions() {
      return {
        scale: 0.25,
        logging: false,
        useCORS: false,
        allowTaint: false,
        backgroundColor: "#ffffff",
        imageTimeout: 1200,
        ignoreElements: ignoreEl,
        onclone: function (doc) {
          var node = doc.getElementById("otgf-widget-root");
          if (node && node.parentNode) node.parentNode.removeChild(node);
        },
      };
    }

    function withTimeout(promise, ms) {
      var timer;
      return Promise.race([
        Promise.resolve(promise).then(function (value) {
          window.clearTimeout(timer);
          return value;
        }),
        new Promise(function (_, reject) {
          timer = window.setTimeout(function () {
            reject(new Error("timeout"));
          }, ms);
        }),
      ]);
    }

    function run() {
      if (started) return;
      var capture = window.html2canvas;
      if (typeof capture !== "function") return;
      started = true;
      var target = document.body || document.documentElement;
      withTimeout(capture(target, shotOptions()), 12000)
        .then(function (canvas) {
          if (!canvas || typeof canvas.toDataURL !== "function") return;
          var maxW = 800;
          var scale = Math.min(1, maxW / canvas.width);
          var out = document.createElement("canvas");
          out.width = Math.max(1, Math.round(canvas.width * scale));
          out.height = Math.max(1, Math.round(canvas.height * scale));
          var ctx = out.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(canvas, 0, 0, out.width, out.height);
          var qualities = [0.48, 0.32, 0.18];
          var image = "";
          for (var i = 0; i < qualities.length; i += 1) {
            image = out.toDataURL("image/jpeg", qualities[i]);
            if (image.length <= 450000) break;
          }
          if (!image || image.length > 450000) return;
          return fetch(endpoint + "/snapshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: pathOf(),
              pageUrl: pageUrl(),
              width: out.width,
              height: out.height,
              image: image,
            }),
            mode: "cors",
          }).then(function (res) {
            if (!res.ok) return;
            try {
              sessionStorage.setItem(key, "1");
            } catch (err2) {
              /* ignore */
            }
          });
        })
        .catch(function () {});
    }

    function loadLib() {
      if (typeof window.html2canvas === "function") {
        run();
        return;
      }
      var existing = document.querySelector('script[src="' + shotSrc + '"]');
      if (existing) {
        existing.addEventListener("load", run);
        return;
      }
      var loader = document.createElement("script");
      loader.src = shotSrc;
      loader.async = true;
      loader.addEventListener("load", run);
      document.head.appendChild(loader);
    }

    loadLib();
  }

  function startSnapshot() {
    window.setTimeout(captureSnapshot, 800);
  }
  if (document.readyState === "complete") startSnapshot();
  else window.addEventListener("load", startSnapshot);
})();
