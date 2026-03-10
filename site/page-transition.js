(function () {
  var duration = 280;
  var scrollGap = 12;
  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canvasClickTimes = [];
  var audioCtx = null;
  var lastTouchTs = 0;

  function getHeaderOffset() {
    var header = document.querySelector("header");
    if (!header) return 0;
    return Math.ceil(header.getBoundingClientRect().height);
  }

  function smoothScrollToHash(hash) {
    if (!hash || hash === "#") return false;
    var id = decodeURIComponent(hash.slice(1));
    var target = document.getElementById(id);
    if (!target) return false;

    var y = target.getBoundingClientRect().top + window.scrollY - getHeaderOffset() - scrollGap;
    window.scrollTo({
      top: Math.max(0, y),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    // Keep URL clean to avoid refresh landing on anchors.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return true;
  }

  function isInternalLink(a) {
    try {
      var url = new URL(a.href, window.location.href);
      return url.origin === window.location.origin;
    } catch (err) {
      return false;
    }
  }

  function shouldHandle(a, ev) {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return false;
    if (!isInternalLink(a)) return false;
    if (a.hasAttribute("data-no-transition")) return false;

    var href = a.getAttribute("href") || "";
    if (href.indexOf("#") === 0) return false;

    var next = new URL(a.href, window.location.href);
    if (next.pathname === window.location.pathname && next.search === window.location.search && next.hash) return false;

    return true;
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("a[href]");
    if (!a) return;

    var href = a.getAttribute("href") || "";
    var isSimpleAnchor = href.indexOf("#") === 0;
    if (isSimpleAnchor) {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      if (smoothScrollToHash(href)) {
        ev.preventDefault();
      }
      return;
    }

    var isSamePageAnchor = false;
    try {
      var parsed = new URL(a.href, window.location.href);
      isSamePageAnchor = parsed.origin === window.location.origin &&
        parsed.pathname === window.location.pathname &&
        parsed.search === window.location.search &&
        !!parsed.hash;
      if (isSamePageAnchor && !ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.button === 0) {
        if (smoothScrollToHash(parsed.hash)) {
          ev.preventDefault();
          return;
        }
      }
    } catch (err) {
      isSamePageAnchor = false;
    }

    if (!shouldHandle(a, ev)) return;

    ev.preventDefault();
    document.body.classList.add("is-page-leaving");
    window.setTimeout(function () {
      window.location.href = a.href;
    }, duration);
  }, true);

  window.addEventListener("pageshow", function () {
    document.body.classList.remove("is-page-leaving");
  });

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function playSciFiFiveNote() {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    // Match original-like pitch/tempo/sonority: D-E-C-C(low)-G.
    var sequence = [293.66, 329.63, 261.63, 130.81, 196.0];
    var lengths = [0.21, 0.21, 0.21, 0.42, 0.66];
    var gap = 0.03;
    var t = ctx.currentTime + 0.03;

    for (var i = 0; i < sequence.length; i++) {
      var t0 = t;
      var t1 = t0 + lengths[i];
      t = t1 + gap;

      var oscA = ctx.createOscillator();
      var oscB = ctx.createOscillator();
      var gain = ctx.createGain();
      oscA.type = "triangle";
      oscB.type = "sine";
      oscA.frequency.setValueAtTime(sequence[i], t0);
      oscB.frequency.setValueAtTime(sequence[i] * 2, t0);
      oscB.detune.setValueAtTime(3, t0);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);

      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(ctx.destination);

      oscA.start(t0);
      oscB.start(t0);
      oscA.stop(t1 + 0.02);
      oscB.stop(t1 + 0.02);
    }
  }

  function showSpaceInvader() {
    var old = document.querySelectorAll(".space-invader-egg");
    old.forEach(function (node) { node.remove(); });

    var count = Math.max(3, Math.min(7, Math.floor(window.innerWidth / 220)));
    for (var i = 0; i < count; i++) {
      var invader = document.createElement("div");
      invader.className = "space-invader-egg";
      invader.setAttribute("aria-hidden", "true");
      var left = ((i + 1) / (count + 1)) * 100;
      var rise = 44 + Math.random() * 28;
      var scale = 1.9 + Math.random() * 1.0;
      var delay = i * 70;
      invader.style.cssText = [
        "position:fixed",
        "left:" + left + "%",
        "bottom:16px",
        "width:2px",
        "height:2px",
        "background:#ffffff",
        "box-shadow:" +
          "-8px 0 #ffffff,8px 0 #ffffff," +
          "-8px 2px #ffffff,-6px 2px #ffffff,6px 2px #ffffff,8px 2px #ffffff," +
          "-6px 4px #ffffff,-4px 4px #ffffff,-2px 4px #ffffff,0 4px #ffffff,2px 4px #ffffff,4px 4px #ffffff,6px 4px #ffffff," +
          "-8px 6px #ffffff,-6px 6px #ffffff,-4px 6px #ffffff,-2px 6px #ffffff,0 6px #ffffff,2px 6px #ffffff,4px 6px #ffffff,6px 6px #ffffff,8px 6px #ffffff," +
          "-10px 8px #ffffff,-8px 8px #ffffff,-6px 8px #ffffff,-2px 8px #ffffff,0 8px #ffffff,2px 8px #ffffff,6px 8px #ffffff,8px 8px #ffffff,10px 8px #ffffff," +
          "-10px 10px #ffffff,-8px 10px #ffffff,-6px 10px #ffffff,-4px 10px #ffffff,-2px 10px #ffffff,0 10px #ffffff,2px 10px #ffffff,4px 10px #ffffff,6px 10px #ffffff,8px 10px #ffffff,10px 10px #ffffff," +
          "-10px 12px #ffffff,-8px 12px #ffffff,-6px 12px #ffffff,-4px 12px #ffffff,-2px 12px #ffffff,0 12px #ffffff,2px 12px #ffffff,4px 12px #ffffff,6px 12px #ffffff,8px 12px #ffffff,10px 12px #ffffff," +
          "-10px 14px #ffffff,-8px 14px #ffffff,-6px 14px #ffffff,6px 14px #ffffff,8px 14px #ffffff,10px 14px #ffffff," +
          "-8px 16px #ffffff,-6px 16px #ffffff,-4px 16px #ffffff,4px 16px #ffffff,6px 16px #ffffff,8px 16px #ffffff," +
          "-6px 18px #ffffff,-4px 18px #ffffff,4px 18px #ffffff,6px 18px #ffffff",
        "transform:translateX(-50%) scale(" + scale.toFixed(2) + ")",
        "opacity:0",
        "pointer-events:none",
        "z-index:95",
        "filter:drop-shadow(0 0 2px rgba(255,255,255,0.45))"
      ].join(";");
      document.body.appendChild(invader);

      (function (node, nodeRise, nodeScale, nodeDelay) {
        window.setTimeout(function () {
          requestAnimationFrame(function () {
            node.style.transition = "opacity 260ms ease, transform 2400ms ease-out";
            node.style.opacity = "1";
            node.style.transform = "translateX(-50%) translateY(-" + nodeRise.toFixed(0) + "px) scale(" + nodeScale.toFixed(2) + ")";
          });
        }, nodeDelay);
        window.setTimeout(function () {
          node.style.opacity = "0";
        }, 1950 + nodeDelay);
        window.setTimeout(function () {
          if (node && node.parentNode) node.parentNode.removeChild(node);
        }, 2650 + nodeDelay);
      })(invader, rise, scale, delay);
    }
  }

  function ensureScrollTopBubble() {
    var btn = document.querySelector(".scroll-top-bubble");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scroll-top-bubble";
      btn.setAttribute("aria-label", "Revenir en haut");
      btn.textContent = "↑";
      document.body.appendChild(btn);
    }

    function refresh() {
      var path = (window.location.pathname || "").toLowerCase();
      var isBlogOrNews = path.endsWith("/blog.html") || path.endsWith("/actualites.html");
      var showAt = isBlogOrNews ? 180 : 340;
      btn.classList.toggle("is-visible", window.scrollY > showAt);
    }

    btn.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    });

    window.addEventListener("scroll", refresh, { passive: true });
    refresh();
  }

  function initLiveVisitorsCounter() {
    var counter = document.querySelector(".live-visitors-counter");
    if (!counter) {
      counter = document.createElement("div");
      counter.className = "live-visitors-counter";
      counter.setAttribute("aria-live", "polite");
      counter.style.cssText = [
        "position:fixed",
        "left:16px",
        "bottom:calc(14px + env(safe-area-inset-bottom, 0px))",
        "z-index:96",
        "font-size:12px",
        "line-height:1.2",
        "font-weight:600",
        "letter-spacing:0.02em",
        "color:rgba(245,245,255,0.9)",
        "text-shadow:0 0 12px rgba(145,70,255,0.28)",
        "pointer-events:none",
        "user-select:none"
      ].join(";");
      document.body.appendChild(counter);
    }
    counter.textContent = "1 visiteur en ligne";

    var namespace = "ai.underside.be";
    var dayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    var minutePrefix = "presence-" + dayStamp + "-";
    var tabId = null;

    try {
      tabId = sessionStorage.getItem("underside_tab_id");
      if (!tabId) {
        tabId = "tab-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem("underside_tab_id", tabId);
      }
    } catch (err) {
      tabId = "tab-fallback";
    }

    function pad2(n) {
      return (n < 10 ? "0" : "") + n;
    }

    function minuteKey(dateObj) {
      return minutePrefix + pad2(dateObj.getUTCHours()) + pad2(dateObj.getUTCMinutes());
    }

    function countApiUrl(mode, key) {
      return "https://api.countapi.xyz/" + mode + "/" + namespace + "/" + key;
    }

    function fetchJson(url) {
      return fetch(url, { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("countapi_unavailable");
        return res.json();
      });
    }

    function ensureMinuteHit(now) {
      var key = minuteKey(now);
      var sentMarkKey = "underside_presence_sent_" + key;
      if (sessionStorage.getItem(sentMarkKey)) {
        return Promise.resolve();
      }
      return fetchJson(countApiUrl("hit", key)).then(function () {
        sessionStorage.setItem(sentMarkKey, "1");
      });
    }

    function getMinuteCount(key) {
      return fetchJson(countApiUrl("get", key))
        .then(function (data) {
          var value = data && typeof data.value === "number" ? data.value : 0;
          return Math.max(0, value);
        })
        .catch(function () {
          return 0;
        });
    }

    function getLocalPresenceEstimate() {
      var nowTs = Date.now();
      var prefix = "underside_tab_presence_";
      var active = 0;
      try {
        localStorage.setItem(prefix + tabId, String(nowTs));
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var key = localStorage.key(i);
          if (!key || key.indexOf(prefix) !== 0) continue;
          var ts = Number(localStorage.getItem(key) || "0");
          if (nowTs - ts <= 70000) {
            active += 1;
          } else {
            localStorage.removeItem(key);
          }
        }
      } catch (err) {
        active = 1;
      }
      return Math.max(1, active);
    }

    function setCounterText(value) {
      counter.textContent = value + " visiteur" + (value > 1 ? "s" : "") + " en ligne";
    }

    function refreshPresence() {
      var now = new Date();
      var localEstimate = getLocalPresenceEstimate();
      ensureMinuteHit(now)
        .then(function () {
          var prev = new Date(now.getTime() - 60000);
          return Promise.all([getMinuteCount(minuteKey(now)), getMinuteCount(minuteKey(prev))]);
        })
        .then(function (values) {
          var current = values[0] || 0;
          var previous = values[1] || 0;
          // Estimated concurrent users from current + tail of previous minute activity.
          var estimated = Math.max(1, Math.round(current + previous * 0.35));
          setCounterText(estimated);
        })
        .catch(function () {
          setCounterText(localEstimate);
        });
    }

    refreshPresence();
    window.setInterval(refreshPresence, 20000);
  }

  function initMobileMenus() {
    var navs = document.querySelectorAll(".nav");
    if (!navs.length) return;
    var backdrop = document.querySelector(".mobile-menu-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "mobile-menu-backdrop";
      document.body.appendChild(backdrop);
    }

    function refreshBodyMenuState() {
      var hasOpen = !!document.querySelector(".nav.is-open");
      document.body.classList.toggle("mobile-menu-open", hasOpen);
      backdrop.classList.toggle("is-active", hasOpen);
    }

    navs.forEach(function (nav) {
      var button = nav.querySelector(".burger-btn");
      var menu = nav.querySelector(".nav-links, .links");
      if (!button || !menu) return;

      function setMenuState(open) {
        nav.classList.toggle("is-open", !!open);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        refreshBodyMenuState();
      }

      function closeMenu() {
        setMenuState(false);
      }

      button.addEventListener("click", function () {
        var willOpen = !nav.classList.contains("is-open");
        setMenuState(willOpen);
      });

      menu.addEventListener("click", function (ev) {
        var link = ev.target.closest("a[href]");
        if (!link) return;
        closeMenu();
      });

      document.addEventListener("click", function (ev) {
        if (!nav.classList.contains("is-open")) return;
        if (ev.target.closest(".burger-btn")) return;
        if (ev.target.closest(".nav-links, .links")) return;
        closeMenu();
      });

      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        closeMenu();
      });

      window.addEventListener("resize", function () {
        if (window.innerWidth > 900) closeMenu();
      });
    });

    backdrop.addEventListener("click", function () {
      var openNavs = document.querySelectorAll(".nav.is-open");
      openNavs.forEach(function (openNav) {
        openNav.classList.remove("is-open");
        var btn = openNav.querySelector(".burger-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
      refreshBodyMenuState();
    });
  }

  // Easter egg: 3 rapid taps/clicks in the center zone of the Game of Life canvas.
  function trackCanvasSecret(clientX, clientY, eventTarget) {
    if (typeof clientX !== "number" || typeof clientY !== "number") return;
    var canvas = eventTarget && eventTarget.closest ? eventTarget.closest("#evoCanvas") : null;
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var inCenterX = x > rect.width * 0.32 && x < rect.width * 0.68;
    var inCenterY = y > rect.height * 0.25 && y < rect.height * 0.75;
    if (!inCenterX || !inCenterY) return;

    var now = Date.now();
    canvasClickTimes.push(now);
    canvasClickTimes = canvasClickTimes.filter(function (t) { return now - t < 1200; });
    if (canvasClickTimes.length >= 3) {
      canvasClickTimes = [];
      playSciFiFiveNote();
      showSpaceInvader();
    }
  }

  document.addEventListener("click", function (ev) {
    // iOS can dispatch synthetic click after touch; ignore duplicate.
    if (Date.now() - lastTouchTs < 700) return;
    trackCanvasSecret(ev.clientX, ev.clientY, ev.target);
  }, true);

  document.addEventListener("touchend", function (ev) {
    var touch = ev.changedTouches && ev.changedTouches[0];
    if (!touch) return;
    lastTouchTs = Date.now();
    trackCanvasSecret(touch.clientX, touch.clientY, ev.target);
  }, { capture: true, passive: true });

  ensureScrollTopBubble();
  initMobileMenus();
  initLiveVisitorsCounter();
})();
