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

  function currentLangFromPath(pathname) {
    if (window.location.protocol === "file:") {
      return pathname.indexOf("/site/en/") !== -1 ? "en" : "fr";
    }
    return pathname.indexOf("/en/") === 0 || pathname === "/en" ? "en" : "fr";
  }

  function equivalentPathForLang(pathname, targetLang) {
    var path = pathname || "/";
    if (window.location.protocol === "file:") {
      if (targetLang === "en") {
        if (path.indexOf("/site/en/") !== -1) return path;
        return path.replace("/site/", "/site/en/");
      }
      return path.replace("/site/en/", "/site/");
    }
    if (path === "/index.html") path = "/";
    if (path === "/en/index.html") path = "/en/";
    if (targetLang === "en") {
      if (path === "/") return "/en/";
      if (path === "/en") return "/en/";
      if (path.indexOf("/en/") === 0) return path;
      return "/en" + path;
    }
    if (path === "/en" || path === "/en/") return "/";
    if (path.indexOf("/en/") === 0) return path.slice(3);
    return path;
  }

  function ensureLanguageSwitchStyles() {
    if (document.getElementById("lang-switch-style")) return;
    var style = document.createElement("style");
    style.id = "lang-switch-style";
    style.textContent = [
      ".lang-switch{display:inline-flex;align-items:center;gap:6px;padding:4px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(10,10,14,.62);backdrop-filter:blur(8px);}",
      ".lang-switch button{border:0;background:transparent;color:rgba(235,236,242,.78);font-size:11px;letter-spacing:.06em;padding:6px 9px;border-radius:999px;cursor:pointer;}",
      ".lang-switch button.is-active{color:#fff;background:linear-gradient(135deg, rgba(230,75,255,.42), rgba(75,91,255,.42));}",
      "@media (max-width:900px){.lang-switch{position:fixed;top:calc(var(--mobile-header-h,84px) + 8px);right:12px;z-index:130;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function initLanguageRouting() {
    var path = window.location.pathname || "/";
    if (/google[0-9a-z]+\.html$/i.test(path)) return false;
    if (window.location.protocol === "file:") return false;

    var key = "underside_lang_pref";
    var current = currentLangFromPath(path);
    var saved = "";
    try {
      saved = window.localStorage.getItem(key) || "";
    } catch (err) {
      saved = "";
    }
    var detected = /^en/i.test(navigator.language || "") ? "en" : "fr";
    var target = saved || detected;
    // Keep FR as the default public entry while EN is still under maturation.
    if (current === "fr") {
      target = "fr";
    }
    if (target !== current) {
      var nextPath = equivalentPathForLang(path, target);
      window.location.replace(nextPath + window.location.search + window.location.hash);
      return true;
    }
    return false;
  }

  function initLanguageSwitch() {
    var path = window.location.pathname || "/";
    if (/google[0-9a-z]+\.html$/i.test(path)) return;

    ensureLanguageSwitchStyles();
    var nav = document.querySelector("header .nav") || document.querySelector("header .wrap");
    if (!nav) return;
    if (nav.querySelector(".lang-switch")) return;

    var key = "underside_lang_pref";
    var current = currentLangFromPath(path);
    // Do not expose EN navigation from FR pages for now.
    if (current !== "en") return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";

    function setPref(lang) {
      try {
        window.localStorage.setItem(key, lang);
      } catch (err) {
        // ignore
      }
    }

    function makeBtn(lang, label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = lang === current ? "is-active" : "";
      btn.setAttribute("aria-label", "Switch language to " + label);
      btn.addEventListener("click", function () {
        setPref(lang);
        var nextPath = equivalentPathForLang(window.location.pathname || "/", lang);
        if (nextPath === (window.location.pathname || "/")) {
          window.location.reload();
          return;
        }
        window.location.href = nextPath + window.location.search + window.location.hash;
      });
      return btn;
    }

    wrap.appendChild(makeBtn("fr", "FR"));
    wrap.appendChild(makeBtn("en", "EN"));
    nav.appendChild(wrap);
  }

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

  if (initLanguageRouting()) return;
  initLanguageSwitch();
  ensureScrollTopBubble();
  initMobileMenus();
})();
